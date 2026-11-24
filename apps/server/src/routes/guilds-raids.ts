import { PrismaClient } from '@goki/database';
import {
  MS_PER_HOUR,
  aggregateTalentModifiers,
  getCurrentSeasonKey,
  getSeasonWindowBounds,
  isAdventurerRankSufficient,
} from '@goki/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config';
import { assertCharacterActiveAndOwned, requireAuth } from '../middleware/auth';
import { GameTimerScheduler } from '../queues/bullmq-workers';
import {
  isPrismaUniqueConstraintError,
  resolveRaidBossRolloverOperation,
  withDbTransaction,
} from '../services/game-operations';
import { WebSocketManager, websocketManager } from '../services/websocket-manager';

const createGuildSchema = z.object({
  name: z.string().min(3).max(40),
  tag: z.string().min(2).max(6).toUpperCase(),
  description: z.string().max(240).optional(),
  leaderCharacterId: z.string().optional(),
  founderCharacterId: z.string().optional(),
});

const spawnRaidSchema = z.object({
  bossSlug: z.string().min(2),
  bossName: z.string().min(2),
  bossTier: z.number().int().min(1).max(10).default(1),
  accessType: z.enum(['PUBLIC_WORLD', 'CLAN_ONLY', 'GUILD_ONLY']),
  guildId: z.string().optional(),
  gymClanId: z.string().optional(),
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
  // List Social Gym Clans & Guild Bounties / Rank-Up Trials
  app.get('/api/guilds', async (_request, reply) => {
    const guilds = await db.gymClan.findMany({
      orderBy: { clanReputation: 'desc' },
      include: {
        members: { include: { character: true } },
      },
    });
    const bounties = await db.guildBounty.findMany({
      orderBy: { reputationReward: 'asc' },
    });
    return reply.send({ guilds, bounties });
  });

  // Create a Social Gym Clan
  app.post('/api/guilds', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = createGuildSchema.parse(request.body);
    const leaderCharacterId = body.leaderCharacterId ?? body.founderCharacterId;
    if (!leaderCharacterId) {
      return reply.status(400).send({ error: 'leaderCharacterId is required.' });
    }
    await assertCharacterActiveAndOwned(db, leaderCharacterId, request.user.userId);

    const slugBase = body.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'gym_clan';
    const uniqueSuffix = Date.now().toString(36);

    const guild = await db.gymClan.create({
      data: {
        slug: `${slugBase}_${uniqueSuffix}`,
        venueKey: `legacy:${slugBase}:${uniqueSuffix}`,
        name: body.name,
        tag: body.tag,
        description: body.description ?? null,
        kind: 'GYM_VENUE',
        venueSource: 'USER_SUBMITTED',
        wardenCharacterId: leaderCharacterId,
        members: {
          create: {
            characterId: leaderCharacterId,
            userId: request.user.userId,
            clanKind: 'GYM_VENUE',
            role: 'LEADER',
          },
        },
      },
      include: { members: true },
    });

    return reply.status(201).send({ guild });
  });

  // Join a Social Gym Clan
  app.post('/api/guilds/:guildId/join', { preHandler: [requireAuth] }, async (request, reply) => {
    const { guildId } = z.object({ guildId: z.string() }).parse(request.params);
    const { characterId } = z.object({ characterId: z.string() }).parse(request.body);
    await assertCharacterActiveAndOwned(db, characterId, request.user.userId);

    const guild = await db.gymClan.findUnique({
      where: { id: guildId },
      include: { members: true },
    });
    if (!guild) {
      return reply.status(404).send({ error: 'Guild not found.' });
    }
    if (guild.members.length >= guild.maxMembers) {
      return reply.status(400).send({ error: 'Guild is at maximum capacity.' });
    }

    const clanKind = guild.kind === 'OPEN_WORLD_HOME' ? 'OPEN_WORLD_HOME' : 'GYM_VENUE';
    const membership = await db.gymClanMember.upsert({
      where: { characterId_clanKind: { characterId, clanKind } },
      update: { gymClanId: guildId, userId: request.user.userId, role: 'MEMBER' },
      create: {
        gymClanId: guildId,
        userId: request.user.userId,
        characterId,
        clanKind,
        role: 'MEMBER',
      },
    });

    return reply.send({ membership });
  });

  // Complete a Guild Bounty or Rank-Up Trial (Copper -> Iron -> Bronze -> Silver -> Gold -> Platinum -> Mythic)
  app.post('/api/characters/:characterId/bounties/:bountyId/complete', { preHandler: [requireAuth] }, async (request, reply) => {
    const { characterId, bountyId } = z
      .object({ characterId: z.string(), bountyId: z.string() })
      .parse(request.params);
    const activeCharacter = await assertCharacterActiveAndOwned(db, characterId, request.user.userId);

    const bounty = await db.guildBounty.findFirst({
      where: { OR: [{ id: bountyId }, { slug: bountyId }] },
    });
    if (!bounty) {
      return reply.status(404).send({ error: 'Guild bounty not found.' });
    }

    let txResult:
      | { ok: true; character: any; bounty: any }
      | { ok: false; statusCode: number; error: string };
    try {
      txResult = await withDbTransaction(
        db,
        async (tx) => {
          const characterRecord =
            (await tx.character.findUnique({
              where: { id: characterId },
              include: { stats: true },
            })) ?? (activeCharacter as any);

          if (!characterRecord) {
            return { ok: false as const, statusCode: 404, error: 'Character not found.' };
          }

          // 0. Check duplicate bounty completion
          const existing = await tx.characterBountyCompletion.findUnique({
            where: { characterId_bountyId: { characterId, bountyId: bounty.id } },
          });
          if (existing) {
            return {
              ok: false as const,
              statusCode: 409,
              error: 'Bounty already completed by this character.',
            };
          }

          // 1. Verify required AdventurerRank
          const currentRank = characterRecord.adventurerRank ?? 'COPPER';
          const requiredRank = bounty.requiredRank ?? 'COPPER';
          if (!isAdventurerRankSufficient(currentRank, requiredRank)) {
            return {
              ok: false as const,
              statusCode: 400,
              error: `Requires Adventurer Rank ${requiredRank} (currently ${currentRank}).`,
            };
          }

          const reqs = (bounty.requirements ?? {}) as {
            workoutsLogged?: number;
            totalStatLevel?: number;
            dungeonClears?: number;
            zone2Minutes?: number;
            requiresVerifiedMode?: boolean;
          };

          const isIronmanBounty =
            Boolean(reqs.requiresVerifiedMode) ||
            characterRecord.gameMode === 'IRONMAN_VERIFIED';

          // 2. Validate reqs.workoutsLogged
          const minWorkouts = reqs.workoutsLogged ?? (bounty.slug === 'trial_of_iron' ? 3 : 0);
          if (minWorkouts > 0) {
            const workoutWhere = isIronmanBounty
              ? { characterId, isHardwareVerified: true }
              : { characterId };
            let charWorkoutCount = 0;
            if (typeof (tx as any).workoutLog?.count === 'function') {
              charWorkoutCount = await tx.workoutLog.count({ where: workoutWhere });
            } else if (typeof (tx as any).workoutLog?.findMany === 'function') {
              const logs = await tx.workoutLog.findMany({ where: workoutWhere });
              charWorkoutCount = logs.length;
            }
            if (charWorkoutCount < minWorkouts) {
              return {
                ok: false as const,
                statusCode: 400,
                error: `Log at least ${minWorkouts} total workouts first (currently ${charWorkoutCount}/${minWorkouts}).`,
              };
            }
          }

          // 3. Validate reqs.totalStatLevel
          if (typeof reqs.totalStatLevel === 'number' && reqs.totalStatLevel > 0) {
            const stats = characterRecord.stats ?? {};
            const str = stats.strengthLevel ?? 1;
            const end = stats.enduranceLevel ?? 1;
            const agi = stats.agilityLevel ?? 1;
            const dex = characterRecord.dexLevel ?? stats.dexLevel ?? 1;
            const con = characterRecord.conLevel ?? stats.conLevel ?? 1;
            const wis = characterRecord.wisLevel ?? stats.wisLevel ?? 1;
            const spr = characterRecord.sprLevel ?? stats.sprLevel ?? 1;
            const totalStatLevel = str + end + agi + dex + con + wis + spr;
            if (totalStatLevel < reqs.totalStatLevel) {
              return {
                ok: false as const,
                statusCode: 400,
                error: `Requires total Stat Level ${reqs.totalStatLevel} (currently ${totalStatLevel}/${reqs.totalStatLevel}).`,
              };
            }
          }

          // 4. Validate reqs.dungeonClears
          if (typeof reqs.dungeonClears === 'number' && reqs.dungeonClears > 0) {
            let dungeonClears = 0;
            const dungeonClearWhere = {
              characterId,
              dungeonRun: {
                OR: [
                  { status: 'COMPLETED' as any, wasSuccessful: true },
                  { status: 'COMPLETED' as any },
                  { status: 'VICTORY' as any },
                ],
              },
            };
            if (typeof (tx as any).dungeonRunParticipant?.count === 'function') {
              dungeonClears = await tx.dungeonRunParticipant.count({
                where: dungeonClearWhere,
              });
            } else if (typeof (tx as any).dungeonRunParticipant?.findMany === 'function') {
              const parts = await tx.dungeonRunParticipant.findMany({
                where: { characterId },
                include: { dungeonRun: true },
              });
              dungeonClears = parts.filter((p: any) => {
                const st = p.dungeonRun?.status ?? p.status;
                const won = p.dungeonRun?.wasSuccessful;
                return (st === 'COMPLETED' && won !== false) || st === 'VICTORY';
              }).length;
            } else if (typeof (tx as any).dungeonRun?.count === 'function') {
              dungeonClears = await tx.dungeonRun.count({
                where: {
                  participants: { some: { characterId } },
                  status: 'COMPLETED',
                },
              });
            }
            if (dungeonClears < reqs.dungeonClears) {
              return {
                ok: false as const,
                statusCode: 400,
                error: `Complete at least ${reqs.dungeonClears} victorious Dungeon Expeditions first (currently ${dungeonClears}/${reqs.dungeonClears}).`,
              };
            }
          }

          // 5. Validate reqs.zone2Minutes
          if (typeof reqs.zone2Minutes === 'number' && reqs.zone2Minutes > 0) {
            let totalZone2Minutes = 0;
            if (typeof (tx as any).workoutLog?.findMany === 'function') {
              const logs = await tx.workoutLog.findMany({
                where: isIronmanBounty
                  ? { characterId, isHardwareVerified: true }
                  : { characterId },
              });
              for (const log of logs) {
                const zone = log.averageHrZone ?? 0;
                const isCardioLog =
                  zone >= 2 ||
                  log.workoutType === 'CARDIO_LOW_MOD' ||
                  log.workoutType === 'CARDIO_HIGH_INTENSITY' ||
                  log.workoutCategory === 'CARDIO';
                if (isCardioLog && (zone === 0 || zone >= 2)) {
                  totalZone2Minutes += Math.floor((log.durationSeconds ?? 0) / 60);
                }
              }
            }
            if (totalZone2Minutes < reqs.zone2Minutes) {
              return {
                ok: false as const,
                statusCode: 400,
                error: `Log at least ${reqs.zone2Minutes} minutes of HR Zone 2+ cardio training first (currently ${totalZone2Minutes}/${reqs.zone2Minutes} min).`,
              };
            }
          }

          await tx.characterBountyCompletion.create({
            data: { characterId, bountyId: bounty.id },
          });

          const updatedCharacter = await tx.character.update({
            where: { id: characterId },
            data: {
              gold: { increment: bounty.goldReward },
              adventurerReputation: { increment: bounty.reputationReward },
              ...(bounty.isRankUpTrial && bounty.unlocksRank
                ? { adventurerRank: bounty.unlocksRank }
                : {}),
            },
          });

          return { ok: true as const, character: updatedCharacter, bounty };
        },
        `bounty:${characterId}:${bounty.id}`
      );
    } catch (err) {
      if (isPrismaUniqueConstraintError(err)) {
        return reply.status(409).send({ error: 'Bounty already completed by this character.' });
      }
      throw err;
    }

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    return reply.send({ character: txResult.character, bounty: txResult.bounty });
  });

  // List Active 7-Day Boss Raids (Public World & Clan/Guild-Only)
  app.get('/api/raids', async (request, reply) => {
    const { guildId, gymClanId } = z
      .object({ guildId: z.string().optional(), gymClanId: z.string().optional() })
      .parse(request.query ?? {});
    const resolvedClanId = gymClanId ?? guildId;

    const raids = await db.raidBossInstance.findMany({
      where: resolvedClanId
        ? { OR: [{ accessType: 'PUBLIC_WORLD' }, { gymClanId: resolvedClanId }] }
        : undefined,
      orderBy: { startsAt: 'desc' },
      include: {
        gymClan: true,
        contributions: {
          where: { character: { deletedAt: null } },
          orderBy: { totalContributionScore: 'desc' },
          include: { character: true },
        },
      },
    });

    return reply.send({ raids });
  });

  // Spawn a 7-Day Raid Boss Instance (Public World or Clan/Guild-Only) & Schedule 7d BullMQ Rollover
  app.post('/api/raids', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = spawnRaidSchema.parse(request.body);
    const resolvedClanId = body.gymClanId ?? body.guildId;
    if ((body.accessType === 'GUILD_ONLY' || body.accessType === 'CLAN_ONLY') && !resolvedClanId) {
      return reply.status(400).send({ error: `${body.accessType} raid requires a gymClanId.` });
    }
    if (resolvedClanId && typeof (db as any).gymClanMember?.findFirst === 'function') {
      const member = await db.gymClanMember.findFirst({
        where: {
          gymClanId: resolvedClanId,
          character: { userId: request.user.userId, deletedAt: null },
        },
      });
      if (!member) {
        return reply.status(403).send({
          error: 'Forbidden: You must have an active character in this clan to spawn a clan raid.',
        });
      }
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
        gymClanId: resolvedClanId ?? null,
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
  app.post('/api/raids/:raidId/attack', { preHandler: [requireAuth] }, async (request, reply) => {
    const { raidId } = z.object({ raidId: z.string() }).parse(request.params);
    const { characterId } = z.object({ characterId: z.string() }).parse(request.body);
    await assertCharacterActiveAndOwned(db, characterId, request.user.userId);

    const txResult = await withDbTransaction(
      db,
      async (tx) => {
        const raid = await tx.raidBossInstance.findUnique({ where: { id: raidId } });
        if (!raid) {
          return { ok: false as const, statusCode: 404, error: 'Raid Boss instance not found.' };
        }
        if (raid.status !== 'ACTIVE' && raid.status !== 'DEFEATED') {
          return { ok: false as const, statusCode: 400, error: `Raid is ${raid.status}.` };
        }

        const character = await tx.character.findUnique({
          where: { id: characterId },
          include: {
            stats: true,
            gymClanMemberships: true,
            talentUnlocks: { include: { talentNode: true } },
          },
        });
        if (!character || !character.stats) {
          return { ok: false as const, statusCode: 404, error: 'Character not found.' };
        }

        if (raid.accessType === 'CLAN_ONLY' || raid.accessType === 'GUILD_ONLY') {
          const isMember = (character as any).gymClanMemberships?.some(
            (m: any) => m.gymClanId === raid.gymClanId
          );
          if (!isMember) {
            return {
              ok: false as const,
              statusCode: 403,
              error: 'This is a private Clan-Only Raid Boss.',
            };
          }
        }

        const existingContrib = await tx.raidParticipantContribution.findUnique({
          where: { raidInstanceId_characterId: { raidInstanceId: raid.id, characterId } },
        });

        // Enforce 1 daily combat lock-in per UTC calendar day
        const todayKey = new Date().toISOString().slice(0, 10);
        if (
          existingContrib?.lastAttackAt &&
          existingContrib.lastAttackAt.toISOString().slice(0, 10) === todayKey
        ) {
          return {
            ok: false as const,
            statusCode: 400,
            error:
              'Daily combat attack already locked in today. Log real-world workouts to channel bonus energy!',
          };
        }

        const unlockedRanks: Record<string, number> = {};
        for (const u of character.talentUnlocks ?? []) {
          if (u.talentNode?.slug) {
            unlockedRanks[u.talentNode.slug] = u.currentRank;
          }
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
          character.stats.enduranceLevel *
            1_500 *
            (1 + talents.partyDamageMitigationPct * 3 + talents.healingPowerPct)
        );

        const dmgBig = BigInt(combatDamage);
        const supBig = BigInt(supportScore);
        const totalScoreDelta = dmgBig + supBig;
        const safeCurrentHp = raid.currentHp > 0n ? raid.currentHp : 0n;
        const nextHp = safeCurrentHp > dmgBig ? safeCurrentHp - dmgBig : 0n;

        const updatedRaid = await tx.raidBossInstance.update({
          where: { id: raid.id },
          data: {
            currentHp: nextHp,
            totalRaidDamage: { increment: dmgBig },
            isDefeated: nextHp === 0n,
            status: nextHp === 0n ? 'DEFEATED' : raid.status,
          },
        });

        const contribution = await tx.raidParticipantContribution.upsert({
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

        // Credit Gym Clan seasonal raid points so Leaderboards stay in sync with live Raid Strikes
        if (
          typeof (tx as any).gymClanMember?.findMany === 'function' &&
          typeof (tx as any).gymClanSeason?.upsert === 'function'
        ) {
          const seasonKey = getCurrentSeasonKey();
          const { startsAt, endsAt } = getSeasonWindowBounds(seasonKey);
          const raidPointsDelta = Math.max(1, Math.floor(combatDamage / 1000));
          const memberships = await tx.gymClanMember.findMany({
            where: { characterId },
            select: { gymClanId: true },
          });
          const targetClanIds = Array.from(
            new Set([
              ...memberships.map((m) => m.gymClanId),
              ...(raid.gymClanId ? [raid.gymClanId] : []),
            ])
          );
          for (const clanId of targetClanIds) {
            await tx.gymClanSeason.upsert({
              where: { gymClanId_seasonKey: { gymClanId: clanId, seasonKey } },
              update: {
                raidPoints: { increment: raidPointsDelta },
                totalSeasonPoints: { increment: raidPointsDelta },
              },
              create: {
                gymClanId: clanId,
                seasonKey,
                startsAt,
                endsAt,
                workoutPoints: 0,
                raidPoints: raidPointsDelta,
                arenaPoints: 0,
                totalSeasonPoints: raidPointsDelta,
              },
            });
          }
        }

        return {
          ok: true as const,
          raid,
          character,
          combatDamage,
          supportScore,
          nextHp,
          updatedRaid,
          contribution,
        };
      },
      `raid:${raidId}`
    );

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    const { raid, character, combatDamage, supportScore, nextHp, updatedRaid, contribution } =
      txResult;

    // Real-Time WebSocket Multicast to all athletes viewing this raid encounter
    const safeBigIntValue = (val: bigint): number | string => {
      const num = Number(val);
      return Number.isSafeInteger(num) ? num : val.toString();
    };
    const raidHpEvent = {
      type: 'RAID_HP_UPDATE' as const,
      raidId: raid.id,
      currentHp: safeBigIntValue(nextHp),
      maxHp: safeBigIntValue(raid.maxHp),
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
  app.post('/api/raids/:raidId/resolve', { preHandler: [requireAuth] }, async (request, reply) => {
    const { raidId } = z.object({ raidId: z.string() }).parse(request.params);
    const isProd = (process.env.NODE_ENV || env.NODE_ENV) === 'production';
    if (isProd) {
      const raid = await db.raidBossInstance.findUnique({ where: { id: raidId } });
      if (!raid) {
        return reply.status(404).send({ error: 'Raid Boss instance not found.' });
      }
      if (raid.endsAt && raid.endsAt.getTime() > Date.now() && !raid.isDefeated) {
        return reply.status(403).send({
          error: 'Forbidden: Raid rollover cannot be forced before expiry in production.',
        });
      }
    }
    const resolution = await resolveRaidBossRolloverOperation(db, raidId);
    return reply.send({ resolution });
  });
}
