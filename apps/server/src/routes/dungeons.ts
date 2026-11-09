import { PrismaClient } from '@goki/database';
import { MS_PER_HOUR } from '@goki/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GameTimerScheduler } from '../queues/bullmq-workers';
import {
  buildCharacterCombatSnapshot,
  resolveDungeonRunOperation,
} from '../services/game-operations';
import { WebSocketManager, websocketManager } from '../services/websocket-manager';

const createRunSchema = z.object({
  leaderCharacterId: z.string(),
  guildId: z.string().optional(),
  startImmediately: z.boolean().default(true),
  partyMemberCharacterIds: z.array(z.string()).max(4).default([]),
});

const joinRunSchema = z.object({
  characterId: z.string(),
});

export function registerDungeonRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  timers: GameTimerScheduler,
  wsManager: WebSocketManager = websocketManager
): void {
  // List available Dungeons & active/recruiting runs
  app.get('/api/dungeons', async (_request, reply) => {
    const dungeons = await db.dungeon.findMany({
      orderBy: { recommendedPower: 'asc' },
    });
    const recentRuns = await db.dungeonRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        dungeon: true,
        participants: { include: { character: true } },
        combatReplay: { select: { id: true, outcome: true, totalDurationMs: true } },
      },
    });
    return reply.send({ dungeons, recentRuns });
  });

  // Create a 1-5 player Dungeon Run (Solo instant start or Recruiting co-op party lobby)
  app.post('/api/dungeons/:dungeonId/runs', async (request, reply) => {
    const { dungeonId } = z.object({ dungeonId: z.string() }).parse(request.params);
    const body = createRunSchema.parse(request.body);

    const dungeon = await db.dungeon.findFirst({
      where: { OR: [{ id: dungeonId }, { slug: dungeonId }] },
    });
    if (!dungeon) {
      return reply.status(404).send({ error: 'Dungeon not found.' });
    }

    const allCharacterIds = Array.from(
      new Set([body.leaderCharacterId, ...body.partyMemberCharacterIds])
    );

    if (allCharacterIds.length < dungeon.minPlayers || allCharacterIds.length > dungeon.maxPlayers) {
      return reply.status(400).send({
        error: `Party size must be between ${dungeon.minPlayers} and ${dungeon.maxPlayers}.`,
      });
    }

    const snapshots = await Promise.all(
      allCharacterIds.map((cid) => buildCharacterCombatSnapshot(db, cid))
    );

    const now = new Date();
    const durationMs = dungeon.durationHours * MS_PER_HOUR; // 24-hour real-time window
    const resolvesAt = body.startImmediately ? new Date(now.getTime() + durationMs) : null;

    const run = await db.dungeonRun.create({
      data: {
        dungeonId: dungeon.id,
        leaderCharacterId: body.leaderCharacterId,
        guildId: body.guildId ?? null,
        status: body.startImmediately ? 'ACTIVE_WINDOW' : 'RECRUITING',
        startedAt: body.startImmediately ? now : null,
        resolvesAt,
        randomSeed: `dungeon:${dungeon.slug}:${now.getTime()}:${body.leaderCharacterId}`,
        partyBaselineSnapshot: snapshots as unknown as object,
        activeWorkoutBuffs: [],
        participants: {
          create: snapshots.map((snap, idx) => ({
            characterId: snap.characterId,
            partySlot: idx + 1,
            characterSnapshot: snap as unknown as object,
          })),
        },
      },
      include: {
        dungeon: true,
        participants: true,
      },
    });

    if (body.startImmediately) {
      for (const cid of allCharacterIds) {
        await db.character.update({
          where: { id: cid },
          data: { currentLocation: 'DUNGEON', activityState: 'IN_DUNGEON' },
        });
      }

      const jobId = await timers.scheduleDungeonResolution({
        dungeonRunId: run.id,
        delayMs: durationMs,
      });

      await db.dungeonRun.update({
        where: { id: run.id },
        data: { bullMqJobId: jobId },
      });
    }

    return reply.status(201).send({ run });
  });

  // Join a RECRUITING 1-5 player co-op Dungeon lobby
  app.post('/api/dungeon-runs/:runId/join', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const { characterId } = joinRunSchema.parse(request.body);

    const run = await db.dungeonRun.findUnique({
      where: { id: runId },
      include: { dungeon: true, participants: true },
    });

    if (!run) {
      return reply.status(404).send({ error: 'Dungeon run not found.' });
    }
    if (run.status !== 'RECRUITING') {
      return reply.status(400).send({ error: 'Dungeon run is no longer recruiting.' });
    }
    if (run.participants.length >= run.dungeon.maxPlayers) {
      return reply.status(400).send({ error: 'Party is already full (max 5 players).' });
    }
    if (run.participants.some((p) => p.characterId === characterId)) {
      return reply.status(400).send({ error: 'Character is already in this party.' });
    }

    const snap = await buildCharacterCombatSnapshot(db, characterId);
    const nextSlot = run.participants.length + 1;

    await db.dungeonRunParticipant.create({
      data: {
        dungeonRunId: run.id,
        characterId,
        partySlot: nextSlot,
        characterSnapshot: snap as unknown as object,
      },
    });

    const updatedSnapshots = [
      ...((run.partyBaselineSnapshot as unknown as object[]) ?? []),
      snap,
    ];

    const updatedRun = await db.dungeonRun.update({
      where: { id: run.id },
      data: { partyBaselineSnapshot: updatedSnapshots as unknown as object },
      include: { participants: true, dungeon: true },
    });

    // Real-Time WebSocket Multicast for new party member joining
    wsManager.broadcastToRoom(`dungeon:${run.id}`, {
      type: 'PARTY_MEMBER_JOINED',
      runId: run.id,
      participant: {
        characterId: snap.characterId,
        characterName: snap.name,
        partySlot: nextSlot,
      },
      totalParticipants: updatedRun.participants.length,
      timestamp: Date.now(),
    });

    return reply.send({ run: updatedRun });
  });

  // Lock in a RECRUITING lobby and begin the 24-Hour Expedition Window
  app.post('/api/dungeon-runs/:runId/start', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params);

    const run = await db.dungeonRun.findUnique({
      where: { id: runId },
      include: { dungeon: true, participants: true },
    });
    if (!run) {
      return reply.status(404).send({ error: 'Dungeon run not found.' });
    }
    if (run.status !== 'RECRUITING') {
      return reply.status(400).send({ error: `Cannot start run in status ${run.status}.` });
    }

    const snapshots = await Promise.all(
      run.participants
        .sort((a, b) => a.partySlot - b.partySlot)
        .map((p) => buildCharacterCombatSnapshot(db, p.characterId))
    );

    const now = new Date();
    const durationMs = run.dungeon.durationHours * MS_PER_HOUR;
    const resolvesAt = new Date(now.getTime() + durationMs);

    const jobId = await timers.scheduleDungeonResolution({
      dungeonRunId: run.id,
      delayMs: durationMs,
    });

    const startedRun = await db.dungeonRun.update({
      where: { id: run.id },
      data: {
        status: 'ACTIVE_WINDOW',
        startedAt: now,
        resolvesAt,
        bullMqJobId: jobId,
        partyBaselineSnapshot: snapshots as unknown as object,
      },
      include: { participants: true, dungeon: true },
    });

    for (const p of run.participants) {
      await db.character.update({
        where: { id: p.characterId },
        data: { currentLocation: 'DUNGEON', activityState: 'IN_DUNGEON' },
      });
    }

    // Real-Time WebSocket Multicast for expedition starting
    wsManager.broadcastToRoom(`dungeon:${run.id}`, {
      type: 'DUNGEON_RUN_STARTED',
      runId: run.id,
      startedAt: now.toISOString(),
      resolvesAt: resolvesAt.toISOString(),
      timestamp: Date.now(),
    });

    return reply.send({ run: startedRun });
  });

  // Trigger deterministic Auto-Battler resolution (when 24h window ends or dev fast-forward)
  app.post('/api/dungeon-runs/:runId/resolve', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const { forceDevResolve = false } = z
      .object({ forceDevResolve: z.boolean().optional() })
      .parse(request.body ?? {});

    const run = await db.dungeonRun.findUnique({ where: { id: runId } });
    if (!run) {
      return reply.status(404).send({ error: 'Dungeon run not found.' });
    }

    if (
      !forceDevResolve &&
      run.resolvesAt &&
      run.resolvesAt.getTime() > Date.now()
    ) {
      const remainingMin = Math.ceil((run.resolvesAt.getTime() - Date.now()) / 60000);
      return reply.status(400).send({
        error: `24-hour expedition window still active (${remainingMin} min remaining).`,
      });
    }

    const replay = await resolveDungeonRunOperation(db, runId);
    return reply.send({ replay });
  });

  // Fetch Deterministic Combat Event Log JSON for Client Auto-Battler Animation Player
  app.get('/api/dungeon-runs/:runId/replay', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params);

    const replay = await db.dungeonCombatReplay.findUnique({
      where: { dungeonRunId: runId },
      include: {
        dungeonRun: {
          include: {
            dungeon: true,
            participants: { include: { character: true } },
          },
        },
      },
    });

    if (!replay) {
      return reply.status(404).send({
        error: 'Combat replay not yet generated for this DungeonRun.',
      });
    }

    return reply.send({ replay });
  });
}
