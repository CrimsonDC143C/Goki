import { PrismaClient } from '@goki/database';
import {
  CombatantCharacterInput,
  DEFAULT_DUNGEON_CATALOG,
  DungeonWorkoutBuff,
  MS_PER_HOUR,
  simulateDungeonRun,
} from '@goki/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config';
import { assertCharacterActiveAndOwned, requireAuth } from '../middleware/auth';
import { GameTimerScheduler } from '../queues/bullmq-workers';
import {
  buildCharacterCombatSnapshot,
  depositLootToInventory,
  resolveDungeonRunOperation,
  withDbTransaction,
} from '../services/game-operations';
import { WebSocketManager, websocketManager } from '../services/websocket-manager';

const AI_EXPEDITION_COMPANIONS: Readonly<Record<string, CombatantCharacterInput>> = {
  ally_lyra: {
    characterId: 'ally_lyra',
    name: 'Lyra (Guild Warden)',
    coreStats: { strengthLevel: 4, enduranceLevel: 9, agilityLevel: 6 },
    equipmentBonuses: { maxHp: 75, maxStamina: 40, armorRating: 14 },
    unlockedTalentRanks: {
      war_deep_lungs: 3,
      war_renewal_aura: 2,
      war_second_wind_hymn: 1,
      out_trailblazer: 2,
    },
  },
  ally_kaelen: {
    characterId: 'ally_kaelen',
    name: 'Kaelen (Guild Assassin)',
    coreStats: { strengthLevel: 6, enduranceLevel: 5, agilityLevel: 10 },
    equipmentBonuses: { meleePower: 26, critChance: 0.08, attackSpeedPct: 0.12 },
    unlockedTalentRanks: {
      ass_shadowstep_reflexes: 3,
      ass_ambush_lethality: 2,
      ass_phantom_strike: 1,
    },
  },
  ally_torin: {
    characterId: 'ally_torin',
    name: 'Torin (Guild Vanguard)',
    coreStats: { strengthLevel: 10, enduranceLevel: 7, agilityLevel: 4 },
    equipmentBonuses: { meleePower: 30, armorRating: 20 },
    unlockedTalentRanks: {
      van_heavy_handed: 3,
      van_sundering_strikes: 2,
      van_colossus_cleave: 1,
    },
  },
};

const claimedClientExpeditions = new Set<string>();

const claimClientExpeditionSchema = z.object({
  characterId: z.string().min(1),
  clientRunId: z.string().min(1).max(160),
  companionIds: z.array(z.string()).max(4).optional().default([]),
  activeWorkoutBuffs: z.array(z.any()).optional().default([]),
});

const createRunSchema = z.object({
  leaderCharacterId: z.string(),
  companyId: z.string().optional(),
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
  app.post('/api/dungeons/:dungeonId/runs', { preHandler: [requireAuth] }, async (request, reply) => {
    const { dungeonId } = z.object({ dungeonId: z.string() }).parse(request.params);
    const body = createRunSchema.parse(request.body);
    await assertCharacterActiveAndOwned(db, body.leaderCharacterId, request.user.userId);

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
        companyId: body.companyId ?? body.guildId ?? null,
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
  app.post('/api/dungeon-runs/:runId/join', { preHandler: [requireAuth] }, async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const { characterId } = joinRunSchema.parse(request.body);
    await assertCharacterActiveAndOwned(db, characterId, request.user.userId);

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
  app.post('/api/dungeon-runs/:runId/start', { preHandler: [requireAuth] }, async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params);

    const run = await db.dungeonRun.findUnique({
      where: { id: runId },
      include: { dungeon: true, participants: true },
    });
    if (!run) {
      return reply.status(404).send({ error: 'Dungeon run not found.' });
    }
    await assertCharacterActiveAndOwned(db, run.leaderCharacterId, request.user.userId);

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
  app.post('/api/dungeon-runs/:runId/resolve', { preHandler: [requireAuth] }, async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const { forceDevResolve = false } = z
      .object({ forceDevResolve: z.boolean().optional() })
      .parse(request.body ?? {});

    const run = await db.dungeonRun.findUnique({
      where: { id: runId },
      include: { participants: true },
    });
    if (!run) {
      return reply.status(404).send({ error: 'Dungeon run not found.' });
    }

    // Verify requester owns run.leaderCharacterId or a participant character in the run
    const candidateCharIds = Array.from(
      new Set([
        run.leaderCharacterId,
        ...((run as { participants?: Array<{ characterId: string }> }).participants?.map(
          (p) => p.characterId
        ) ?? []),
      ].filter(Boolean))
    );
    let authorizedParticipant = false;
    for (const cid of candidateCharIds) {
      const char = await db.character.findUnique({ where: { id: cid } });
      if (char && char.userId === request.user.userId && !char.deletedAt) {
        authorizedParticipant = true;
        break;
      }
    }
    if (!authorizedParticipant) {
      return reply.status(403).send({
        error: 'Forbidden: You do not own a character participating in this dungeon run.',
      });
    }

    const isProd = (process.env.NODE_ENV || env.NODE_ENV) === 'production';
    if (forceDevResolve && isProd) {
      return reply.status(403).send({ error: 'Dev resolution bypass is disabled in production.' });
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

  // Authoritatively simulate and persist solo/AI-companion 24h Expedition spoils to DB
  app.post(
    '/api/dungeons/:dungeonSlug/claim-expedition',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { dungeonSlug } = z.object({ dungeonSlug: z.string().min(1) }).parse(request.params);
      const body = claimClientExpeditionSchema.parse(request.body ?? {});
      await assertCharacterActiveAndOwned(db, body.characterId, request.user.userId);

      const dungeonDef =
        DEFAULT_DUNGEON_CATALOG.find((d) => d.dungeonSlug === dungeonSlug) ??
        DEFAULT_DUNGEON_CATALOG[0];
      if (!dungeonDef) {
        return reply.status(404).send({ error: `Dungeon '${dungeonSlug}' not found.` });
      }

      const dedupeKey = `${body.characterId}:${body.clientRunId}`;
      const txResult = await withDbTransaction(
        db,
        async (tx) => {
          const character = await tx.character.findUnique({ where: { id: body.characterId } });
          if (!character) {
            return { ok: false as const, statusCode: 404, error: 'Character not found.' };
          }

          const heroSnapshot = await buildCharacterCombatSnapshot(tx, body.characterId);
          const companionParty = body.companionIds
            .map((cid) => AI_EXPEDITION_COMPANIONS[cid])
            .filter((c): c is CombatantCharacterInput => Boolean(c))
            .slice(0, 4);
          const party: CombatantCharacterInput[] = [heroSnapshot, ...companionParty];

          const replay = simulateDungeonRun({
            dungeon: dungeonDef,
            party,
            workoutBuffs: (body.activeWorkoutBuffs as DungeonWorkoutBuff[]) ?? [],
            seed: body.clientRunId,
            tickIntervalMs: 250,
          });

          const goldAwarded =
            replay.roomsCleared > 0 && replay.totalGoldEarned > 0
              ? Math.round(replay.totalGoldEarned / party.length)
              : 0;

          if (claimedClientExpeditions.has(dedupeKey)) {
            const existingInventory = await tx.inventoryItem.findMany({
              where: { characterId: body.characterId },
              include: { item: true },
            });
            return {
              ok: true as const,
              alreadyClaimed: true,
              replay,
              goldAwarded: 0,
              remainingGold: character.gold,
              inventoryItems: existingInventory,
            };
          }

          claimedClientExpeditions.add(dedupeKey);

          if (replay.roomsCleared > 0 && replay.lootDrops.length > 0) {
            for (const drop of replay.lootDrops) {
              await depositLootToInventory(tx, body.characterId, drop);
            }
          }

          const updatedChar = await tx.character.update({
            where: { id: body.characterId },
            data: {
              ...(goldAwarded > 0 ? { gold: { increment: goldAwarded } } : {}),
              activityState: 'IDLE',
            },
          });

          const inventoryItems = await tx.inventoryItem.findMany({
            where: { characterId: body.characterId },
            include: { item: true },
          });

          return {
            ok: true as const,
            alreadyClaimed: false,
            replay,
            goldAwarded,
            remainingGold: updatedChar.gold,
            inventoryItems,
          };
        },
        `expedition-claim:${dedupeKey}`
      );

      if (!txResult.ok) {
        return reply.status(txResult.statusCode).send({ error: txResult.error });
      }

      return reply.send(txResult);
    }
  );
}
