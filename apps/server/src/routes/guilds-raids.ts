import { PrismaClient } from '@gymify/database';
import { MS_PER_HOUR, aggregateTalentModifiers } from '@gymify/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GameTimerScheduler } from '../queues/bullmq-workers';
import { resolveRaidBossRolloverOperation } from '../services/game-operations';
import { WebSocketManager, websocketManager } from '../services/websocket-manager';

const createGuildSchema = z.object({
  name: z.string().min(3).max(40),
  tag: z.string().min(2).max(6).toUpperCase(),
  description: z.string().max(240).optional(),
  leaderCharacterId: z.string(),
});

const spawnRaidSchema = z.object({
  bossSlug: z.string().min(2),
  bossName: z.string().min(2),
  bossTier: z.number().int().min(1).max(10).default(1),
  accessType: z.enum(['PUBLIC_WORLD', 'GUILD_ONLY']),
  guildId: z.string().optional(),
  maxHp: z.number().int().positive(),
  baseGoldPool: z.number().int().positive().default(10_000),
  baseGuildRepPool: z.number().int().positive().default(2_500),
});

export function registerGuildAndRaidRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  timers: GameTimerScheduler,
  wsManager: WebSocketManager = websocketManager
): void {
  // List Social Guilds & Guild Bounties / Rank-Up Trials
  app.get('/api/guilds', async (_request, reply) => {
    const guilds = await db.guild.findMany({
      orderBy: { guildReputation: 'desc' },
      include: {
        members: { include: { character: true } },
      },
    });
    const bounties = await db.guildBounty.findMany({
      orderBy: { reputationReward: 'asc' },
    });
    return reply.send({ guilds, bounties });
  });

  // Create a Social Adventurers' Guild
  app.post('/api/guilds', async (request, reply) => {
    const body = createGuildSchema.parse(request.body);

    const guild = await db.guild.create({
      data: {
        name: body.name,
        tag: body.tag,
        description: body.description ?? null,
        leaderCharacterId: body.leaderCharacterId,
        members: {
          create: {
            characterId: body.leaderCharacterId,
            role: 'LEADER',
          },
        },
      },
      include: { members: true },
    });

    return reply.status(201).send({ guild });
  });

  // Join an Adventurers' Guild
  app.post('/api/guilds/:guildId/join', async (request, reply) => {
    const { guildId } = z.object({ guildId: z.string() }).parse(request.params);
    const { characterId } = z.object({ characterId: z.string() }).parse(request.body);

    const guild = await db.guild.findUnique({
      where: { id: guildId },
      include: { members: true },
    });
    if (!guild) {
      return reply.status(404).send({ error: 'Guild not found.' });
    }
    if (guild.members.length >= guild.maxMembers) {
      return reply.status(400).send({ error: 'Guild is at maximum capacity.' });
    }

    const membership = await db.guildMember.upsert({
      where: { characterId },
      update: { guildId, role: 'MEMBER' },
      create: { guildId, characterId, role: 'MEMBER' },
    });

    return reply.send({ membership });
  });

  // Complete a Guild Bounty or Rank-Up Trial (Copper -> Iron -> Bronze -> Silver -> Gold -> Platinum -> Mythic)
  app.post('/api/characters/:characterId/bounties/:bountyId/complete', async (request, reply) => {
    const { characterId, bountyId } = z
      .object({ characterId: z.string(), bountyId: z.string() })
      .parse(request.params);

    const bounty = await db.guildBounty.findFirst({
      where: { OR: [{ id: bountyId }, { slug: bountyId }] },
    });
    if (!bounty) {
      return reply.status(404).send({ error: 'Guild bounty not found.' });
    }

    const existing = await db.characterBountyCompletion.findUnique({
      where: { characterId_bountyId: { characterId, bountyId: bounty.id } },
    });
    if (existing) {
      return reply.status(400).send({ error: 'Bounty already completed by this character.' });
    }

    await db.characterBountyCompletion.create({
      data: { characterId, bountyId: bounty.id },
    });

    const updatedCharacter = await db.character.update({
      where: { id: characterId },
      data: {
        gold: { increment: bounty.goldReward },
        adventurerReputation: { increment: bounty.reputationReward },
        ...(bounty.isRankUpTrial && bounty.unlocksRank
          ? { adventurerRank: bounty.unlocksRank }
          : {}),
      },
    });

    return reply.send({ character: updatedCharacter, bounty });
  });

  // List Active 7-Day Boss Raids (Public World & Guild-Only)
  app.get('/api/raids', async (request, reply) => {
    const { guildId } = z
      .object({ guildId: z.string().optional() })
      .parse(request.query ?? {});

    const raids = await db.raidBossInstance.findMany({
      where: guildId
        ? { OR: [{ accessType: 'PUBLIC_WORLD' }, { guildId }] }
        : undefined,
      orderBy: { startsAt: 'desc' },
      include: {
        guild: true,
        contributions: {
          orderBy: { totalContributionScore: 'desc' },
          include: { character: true },
        },
      },
    });

    return reply.send({ raids });
  });

  // Spawn a 7-Day Raid Boss Instance (Public World or Guild-Only) & Schedule 7d BullMQ Rollover
  app.post('/api/raids', async (request, reply) => {
    const body = spawnRaidSchema.parse(request.body);
    if (body.accessType === 'GUILD_ONLY' && !body.guildId) {
      return reply.status(400).send({ error: 'GUILD_ONLY raid requires a guildId.' });
    }

    const startsAt = new Date();
    const sevenDaysMs = 7 * 24 * MS_PER_HOUR;
    const endsAt = new Date(startsAt.getTime() + sevenDaysMs);
    const maxHpBig = BigInt(body.maxHp);

    const raid = await db.raidBossInstance.create({
      data: {
        bossSlug: body.bossSlug,
        bossName: body.bossName,
        bossTier: body.bossTier,
        accessType: body.accessType,
        guildId: body.guildId ?? null,
        maxHp: maxHpBig,
        currentHp: maxHpBig,
        startsAt,
        endsAt,
        status: 'ACTIVE',
        bossMechanicsConfig: {
          baseGoldPool: body.baseGoldPool,
          baseGuildRepPool: body.baseGuildRepPool,
        },
        lootPoolConfig: [],
      },
    });

    const jobId = await timers.scheduleRaidRollover({
      raidInstanceId: raid.id,
      delayMs: sevenDaysMs,
    });

    const updatedRaid = await db.raidBossInstance.update({
      where: { id: raid.id },
      data: { bullMqJobId: jobId },
    });

    return reply.status(201).send({ raid: updatedRaid });
  });

  // Lock in a Daily Combat Strike against an active 7-Day Raid Boss
  app.post('/api/raids/:raidId/attack', async (request, reply) => {
    const { raidId } = z.object({ raidId: z.string() }).parse(request.params);
    const { characterId } = z.object({ characterId: z.string() }).parse(request.body);

    const raid = await db.raidBossInstance.findUnique({ where: { id: raidId } });
    if (!raid) {
      return reply.status(404).send({ error: 'Raid Boss instance not found.' });
    }
    if (raid.status !== 'ACTIVE' && raid.status !== 'DEFEATED') {
      return reply.status(400).send({ error: `Raid is ${raid.status}.` });
    }

    const character = await db.character.findUnique({
      where: { id: characterId },
      include: {
        stats: true,
        guildMembership: true,
        talentUnlocks: { include: { talentNode: true } },
      },
    });
    if (!character || !character.stats) {
      return reply.status(404).send({ error: 'Character not found.' });
    }

    if (
      raid.accessType === 'GUILD_ONLY' &&
      character.guildMembership?.guildId !== raid.guildId
    ) {
      return reply.status(403).send({
        error: 'This is a private Guild-Only Raid Boss.',
      });
    }

    const existingContrib = await db.raidParticipantContribution.findUnique({
      where: { raidInstanceId_characterId: { raidInstanceId: raid.id, characterId } },
    });

    // Enforce 1 daily combat lock-in per UTC calendar day
    const todayKey = new Date().toISOString().slice(0, 10);
    if (
      existingContrib?.lastAttackAt &&
      existingContrib.lastAttackAt.toISOString().slice(0, 10) === todayKey
    ) {
      return reply.status(400).send({
        error: 'Daily combat attack already locked in today. Log real-world workouts to channel bonus energy!',
      });
    }

    const unlockedRanks: Record<string, number> = {};
    for (const u of character.talentUnlocks) {
      unlockedRanks[u.talentNode.slug] = u.currentRank;
    }
    const talents = aggregateTalentModifiers(unlockedRanks);

    // Compute Daily Strike Damage & Warden/Juggernaut Support Score from character power
    const baseStrike =
      character.stats.strengthLevel * 4_200 +
      character.stats.agilityLevel * 3_800 +
      character.stats.enduranceLevel * 2_200;
    const combatDamage = Math.round(
      baseStrike * (1 + talents.meleePowerPct + talents.attackSpeedPct * 0.6)
    );
    const supportScore = Math.round(
      character.stats.enduranceLevel * 1_500 * (1 + talents.partyDamageMitigationPct * 3 + talents.healingPowerPct)
    );

    const dmgBig = BigInt(combatDamage);
    const supBig = BigInt(supportScore);
    const totalScoreDelta = dmgBig + supBig;
    const nextHp = raid.currentHp > dmgBig ? raid.currentHp - dmgBig : 0n;

    const updatedRaid = await db.raidBossInstance.update({
      where: { id: raid.id },
      data: {
        currentHp: nextHp,
        totalRaidDamage: { increment: dmgBig },
        isDefeated: nextHp === 0n,
        status: nextHp === 0n ? 'DEFEATED' : raid.status,
      },
    });

    const contribution = await db.raidParticipantContribution.upsert({
      where: { raidInstanceId_characterId: { raidInstanceId: raid.id, characterId } },
      update: {
        combatDamageDealt: { increment: dmgBig },
        supportScore: { increment: supBig },
        totalContributionScore: { increment: totalScoreDelta },
        dailyAttacksUsed: { increment: 1 },
        lastAttackAt: new Date(),
      },
      create: {
        raidInstanceId: raid.id,
        characterId,
        combatDamageDealt: dmgBig,
        supportScore: supBig,
        totalContributionScore: totalScoreDelta,
        dailyAttacksUsed: 1,
        lastAttackAt: new Date(),
      },
    });

    // Real-Time WebSocket Multicast to all athletes viewing this raid encounter
    const raidHpEvent = {
      type: 'RAID_HP_UPDATE' as const,
      raidId: raid.id,
      currentHp: Number(nextHp),
      maxHp: Number(raid.maxHp),
      isDefeated: nextHp === 0n,
      attacker: {
        characterId: character.id,
        characterName: character.name,
        damage: combatDamage,
        supportScore,
      },
      timestamp: Date.now(),
    };
    wsManager.broadcastToRoom(`raid:${raid.id}`, raidHpEvent);
    wsManager.broadcastToRoom('raid:all', raidHpEvent);

    return reply.send({
      combatDamage,
      supportScore,
      raid: updatedRaid,
      contribution,
    });
  });

  // Resolve 7-Day Raid Boss Rollover & Distribute Tiered Rewards
  app.post('/api/raids/:raidId/resolve', async (request, reply) => {
    const { raidId } = z.object({ raidId: z.string() }).parse(request.params);
    const resolution = await resolveRaidBossRolloverOperation(db, raidId);
    return reply.send({ resolution });
  });
}
