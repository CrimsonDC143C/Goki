import { PrismaClient } from '@goki/database';
import { describe, expect, it } from 'vitest';
import { buildServerApp } from '../src/app';
import { serializeBigInts } from '../src/config';

describe('@goki/server Fastify API & Serialization', () => {
  it('serializes BigInt Raid Boss HP & Date values safely for JSON responses', () => {
    const raw = {
      bossName: 'Ignisrax',
      maxHp: 2_500_000n,
      endsAt: new Date('2026-10-30T00:00:00.000Z'),
    };
    const converted = serializeBigInts(raw) as Record<string, unknown>;
    expect(converted.maxHp).toBe(2500000);
    expect(converted.endsAt).toBe('2026-10-30T00:00:00.000Z');
  });

  it('serves /health, /api/talents/trees, and enforces Zod schema validation on workout & travel routes', async () => {
    const mockDb = {} as unknown as PrismaClient;
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({
      userId: 'user_test_1',
      email: 'test@gokirpg.com',
      username: 'tester',
    });

    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.json().status).toBe('ok');

    const treesRes = await app.inject({ method: 'GET', url: '/api/talents/trees' });
    expect(treesRes.statusCode).toBe(200);
    expect(treesRes.json().trees).toHaveLength(10);

    // Invalid destination rejected by Zod with 400
    const badTravel = await app.inject({
      method: 'POST',
      url: '/api/characters/char_1/travel',
      headers: { authorization: `Bearer ${token}` },
      payload: { destination: 'INVALID_REALM' },
    });
    expect(badTravel.statusCode).toBe(400);

    // Invalid HR zone (> 5) rejected by Zod with 400
    const badWorkout = await app.inject({
      method: 'POST',
      url: '/api/characters/char_1/workouts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        workoutType: 'CARDIO_HIGH_INTENSITY',
        averageHrZone: 9,
      },
    });
    expect(badWorkout.statusCode).toBe(400);

    // Hybrid Protocol Phase 1: Invalid arrivalTrigger rejected with 400
    const badSessionStart = await app.inject({
      method: 'POST',
      url: '/api/characters/char_1/workout-sessions/start',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        arrivalTrigger: 'TELEPORT_HACK',
      },
    });
    expect(badSessionStart.statusCode).toBe(400);

    // Hybrid Protocol Phase 2: Invalid set RPE (> 10) rejected with 400
    const badLiveSet = await app.inject({
      method: 'POST',
      url: '/api/workout-sessions/sess_1/sets',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        exerciseId: 'bench_press',
        reps: 8,
        weightKg: 85,
        rpe: 14,
      },
    });
    expect(badLiveSet.statusCode).toBe(400);

    await app.close();
  });

  it('verifies wearable telemetry, sets APPLE_HEALTHKIT/IRONMAN_VERIFIED, and falls back to MANUAL_HONESTY on biometric mismatch', async () => {
    let savedVerificationSource = '';
    let savedHardwareVerified = false;
    let promotedGameMode = '';

    const mockDb = {
      character: {
        findUnique: async () => ({
          id: 'char_iron_1',
          userId: 'user_1',
          deletedAt: null,
          name: 'IronmanVal',
          gameMode: 'STANDARD',
          stats: {
            strengthLevel: 10,
            strengthXp: 100,
            strengthTalentPointsAvailable: 0,
            enduranceLevel: 8,
            enduranceXp: 80,
            enduranceTalentPointsAvailable: 0,
            agilityLevel: 7,
            agilityXp: 50,
            agilityTalentPointsAvailable: 0,
          },
          talentUnlocks: [],
          fatigueState: null,
        }),
        update: async ({ data }: { data: { gameMode?: string } }) => {
          if (data.gameMode) promotedGameMode = data.gameMode;
          return { id: 'char_iron_1', gameMode: promotedGameMode || 'STANDARD' };
        },
      },
      exerciseCatalog: {
        findMany: async () => [
          {
            slug: 'running_treadmill',
            name: 'Treadmill Running',
            category: 'CARDIO',
            primaryStat: 'AGILITY',
          },
        ],
      },
      userExercisePR: {
        findMany: async () => [],
        upsert: async () => ({}),
      },
      dungeonRunParticipant: {
        findFirst: async () => null,
      },
      characterStats: {
        update: async () => ({}),
      },
      item: {
        findUnique: async () => null,
        create: async () => ({ id: 'item_1', stackable: true }),
      },
      inventoryItem: {
        findFirst: async () => null,
        create: async () => ({}),
      },
      fatigueAndRestState: {
        upsert: async () => ({}),
      },
      workoutSession: {
        upsert: async () => ({ id: 'sess_1' }),
        create: async () => ({ id: 'sess_1' }),
      },
      rewardPayload: {
        create: async () => ({}),
      },
      workoutLog: {
        create: async ({ data }: { data: any }) => {
          savedVerificationSource = data.verificationSource;
          savedHardwareVerified = data.isHardwareVerified;
          return {
            id: 'wk_verified_1',
            ...data,
          };
        },
      },
    } as unknown as PrismaClient;

    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({
      userId: 'user_1',
      email: 'user1@gokirpg.com',
      username: 'user1',
    });

    // 1. High-intensity telemetry matching Zone 4 -> Ironman Verified (without mutating STANDARD character gameMode)
    const verifiedSamples = Array.from({ length: 20 }, (_, i) => ({
      bpm: 160 + (i % 12),
      timestamp: 1000000 + i * 30000,
    }));

    const verifiedRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_iron_1/workouts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        workoutType: 'CARDIO_HIGH_INTENSITY',
        durationSeconds: 600,
        averageHrZone: 4,
        verificationSource: 'APPLE_HEALTHKIT',
        telemetrySamples: verifiedSamples,
        cardioSegments: [
          {
            exerciseId: 'running_treadmill',
            activityType: 'running',
            durationSeconds: 600,
            averageHrZone: 4,
          },
        ],
      },
    });

    expect(verifiedRes.statusCode).toBe(201);
    expect(savedVerificationSource).toBe('APPLE_HEALTHKIT');
    expect(savedHardwareVerified).toBe(true);
    expect(promotedGameMode).toBe('');
    expect(verifiedRes.json().gameMode).toBe('STANDARD');

    // 2. Mismatched telemetry (85 BPM average for Zone 4 HIIT) -> Falls back to MANUAL_HONESTY for STANDARD character
    const spoofedSamples = Array.from({ length: 20 }, (_, i) => ({
      bpm: 82 + (i % 6),
      timestamp: 1000000 + i * 30000,
    }));

    const unverifiedRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_iron_1/workouts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        workoutType: 'CARDIO_HIGH_INTENSITY',
        durationSeconds: 600,
        averageHrZone: 4,
        verificationSource: 'APPLE_HEALTHKIT',
        telemetrySamples: spoofedSamples,
        cardioSegments: [
          {
            exerciseId: 'running_treadmill',
            activityType: 'running',
            durationSeconds: 600,
            averageHrZone: 4,
          },
        ],
      },
    });

    expect(unverifiedRes.statusCode).toBe(201);
    expect(savedVerificationSource).toBe('MANUAL_HONESTY');
    expect(savedHardwareVerified).toBe(false);

    // 3. Mind-Body Telemetry Handshake: Yoga verified via verifyMindBodyTelemetry
    const calmYogaSamples = Array.from({ length: 20 }, (_, i) => ({
      bpm: 72 + (i % 6),
      timestamp: 1000000 + i * 30000,
    }));

    const yogaRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_iron_1/workouts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        workoutType: 'ACTIVE_RECOVERY',
        cardioActivityType: 'YOGA',
        durationSeconds: 1800,
        averageHrZone: 1,
        verificationSource: 'APPLE_HEALTHKIT',
        osActivityClassification: 'HKWorkoutActivityTypeYoga',
        telemetrySamples: calmYogaSamples,
        sets: [],
        cardioSegments: [],
      },
    });

    expect(yogaRes.statusCode).toBe(201);
    expect(savedVerificationSource).toBe('APPLE_HEALTHKIT');
    expect(savedHardwareVerified).toBe(true);
    const yogaBody = yogaRes.json();
    expect(yogaBody.isHardwareVerified).toBe(true);
    expect(yogaBody.ironmanVerification.verified).toBe(true);
    expect(yogaBody.statProgressions.WISDOM?.isIronmanVerified).toBe(true);
    expect(yogaBody.statProgressions.WISDOM?.remainingXp).toBeGreaterThan(0);

    // 4. Recovery Telemetry Handshake: Sleep stages + steps verified via verifyRecoveryTelemetry
    const validSleepStages = [
      { stage: 'AWAKE', startTime: 0, endTime: 1800000 },
      { stage: 'CORE', startTime: 1800000, endTime: 10800000 },
      { stage: 'DEEP', startTime: 10800000, endTime: 16200000 },
      { stage: 'REM', startTime: 16200000, endTime: 25200000 },
    ];

    const sleepRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_iron_1/workouts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        workoutType: 'ACTIVE_RECOVERY',
        cardioActivityType: 'SLEEP',
        durationSeconds: 7 * 3600,
        verificationSource: 'GOOGLE_HEALTH_CONNECT',
        sleepStages: validSleepStages,
        stepCount: 8500,
        sets: [],
        cardioSegments: [],
      },
    });

    expect(sleepRes.statusCode).toBe(201);
    expect(savedVerificationSource).toBe('GOOGLE_HEALTH_CONNECT');
    expect(savedHardwareVerified).toBe(true);
    const sleepBody = sleepRes.json();
    expect(sleepBody.isHardwareVerified).toBe(true);
    expect(sleepBody.statProgressions.CONSTITUTION?.isIronmanVerified).toBe(true);
    expect(sleepBody.statProgressions.CONSTITUTION?.remainingXp).toBeGreaterThan(0);

    // 5. Spoofed Sleep (10 hours with 0 deep sleep) rejected by verifyRecoveryTelemetry
    const spoofedSleepStages = [
      { stage: 'CORE', startTime: 0, endTime: 10 * 3600 * 1000 },
    ];

    const spoofedSleepRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_iron_1/workouts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        workoutType: 'ACTIVE_RECOVERY',
        cardioActivityType: 'SLEEP',
        durationSeconds: 10 * 3600,
        verificationSource: 'APPLE_HEALTHKIT',
        sleepStages: spoofedSleepStages,
        sets: [],
        cardioSegments: [],
      },
    });

    expect(spoofedSleepRes.statusCode).toBe(201);
    expect(savedVerificationSource).toBe('MANUAL_HONESTY');
    expect(savedHardwareVerified).toBe(false);
    expect(spoofedSleepRes.json().isHardwareVerified).toBe(false);

    await app.close();
  });

  it('enforces P0-1 & P0-2: 401 unauthenticated, 403 IDOR ownership, 400 soft-deleted character, and 400 Ironman unverified rejection', async () => {
    const charactersById: Record<string, any> = {
      char_userA_active: {
        id: 'char_userA_active',
        userId: 'user_A',
        deletedAt: null,
        name: 'HeroA',
        gameMode: 'STANDARD',
        stats: {
          strengthLevel: 5,
          strengthXp: 0,
          strengthTalentPointsAvailable: 0,
          enduranceLevel: 5,
          enduranceXp: 0,
          enduranceTalentPointsAvailable: 0,
          agilityLevel: 5,
          agilityXp: 0,
          agilityTalentPointsAvailable: 0,
        },
        talentUnlocks: [],
        fatigueState: null,
      },
      char_userA_deleted: {
        id: 'char_userA_deleted',
        userId: 'user_A',
        deletedAt: new Date(),
        name: 'FallenHeroA',
        gameMode: 'STANDARD',
        stats: {
          strengthLevel: 5,
          strengthXp: 0,
          strengthTalentPointsAvailable: 0,
          enduranceLevel: 5,
          enduranceXp: 0,
          enduranceTalentPointsAvailable: 0,
          agilityLevel: 5,
          agilityXp: 0,
          agilityTalentPointsAvailable: 0,
        },
        talentUnlocks: [],
        fatigueState: null,
      },
      char_userA_ironman: {
        id: 'char_userA_ironman',
        userId: 'user_A',
        deletedAt: null,
        name: 'IronHeroA',
        gameMode: 'IRONMAN_VERIFIED',
        stats: {
          strengthLevel: 5,
          strengthXp: 0,
          strengthTalentPointsAvailable: 0,
          enduranceLevel: 5,
          enduranceXp: 0,
          enduranceTalentPointsAvailable: 0,
          agilityLevel: 5,
          agilityXp: 0,
          agilityTalentPointsAvailable: 0,
        },
        talentUnlocks: [],
        fatigueState: null,
      },
    };

    const presetsById: Record<string, any> = {
      preset_userA: {
        id: 'preset_userA',
        userId: 'user_A',
        name: 'User A Private Routine',
        category: 'GYM',
        isSystemSeed: false,
        blocks: { exerciseBlocks: [], cardioSegments: [] },
      },
      preset_global: {
        id: 'preset_global',
        userId: null,
        name: 'Global Starter Routine',
        category: 'GYM',
        isSystemSeed: false,
        blocks: { exerciseBlocks: [], cardioSegments: [] },
      },
    };

    let lastGatheringFindManyWhere: any = null;

    const mockDb = {
      character: {
        findUnique: async ({ where }: any) => charactersById[where.id] ?? null,
        update: async ({ where, data }: any) => ({ ...charactersById[where.id], ...data }),
      },
      activeGatheringTask: {
        findMany: async ({ where }: any) => {
          lastGatheringFindManyWhere = where;
          return [];
        },
      },
      workoutPreset: {
        findUnique: async ({ where }: any) => presetsById[where.id] ?? null,
        delete: async () => ({}),
      },
      exerciseCatalog: {
        findMany: async () => [],
      },
      userExercisePR: {
        findMany: async () => [],
      },
    } as unknown as PrismaClient;

    const app = await buildServerApp({ db: mockDb });
    const tokenA = app.jwt.sign({ userId: 'user_A', email: 'a@gokirpg.com', username: 'userA' });
    const tokenB = app.jwt.sign({ userId: 'user_B', email: 'b@gokirpg.com', username: 'userB' });

    // 1) 401 on unauthenticated gameplay mutations
    const unauthWorkout = await app.inject({
      method: 'POST',
      url: '/api/characters/char_userA_active/workouts',
      payload: { workoutType: 'RESISTANCE', durationSeconds: 1800 },
    });
    expect(unauthWorkout.statusCode).toBe(401);

    const unauthGatherSync = await app.inject({
      method: 'POST',
      url: '/api/gathering/sync',
      payload: {},
    });
    expect(unauthGatherSync.statusCode).toBe(401);

    const unauthDeletePreset = await app.inject({
      method: 'DELETE',
      url: '/api/workout-presets/preset_userA',
    });
    expect(unauthDeletePreset.statusCode).toBe(401);

    // Verify empty {} on /api/gathering/sync scopes strictly to request.user.userId
    const authGatherSync = await app.inject({
      method: 'POST',
      url: '/api/gathering/sync',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {},
    });
    expect(authGatherSync.statusCode).toBe(200);
    expect(lastGatheringFindManyWhere).toEqual({
      status: 'IN_PROGRESS',
      character: { userId: 'user_A', deletedAt: null },
    });

    // 2) 403 IDOR protection when User B attempts to mutate User A's character or preset
    const idorTravel = await app.inject({
      method: 'POST',
      url: '/api/characters/char_userA_active/travel',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { destination: 'TAVERN' },
    });
    expect(idorTravel.statusCode).toBe(403);

    const idorWorkout = await app.inject({
      method: 'POST',
      url: '/api/characters/char_userA_active/workouts',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { workoutType: 'RESISTANCE', durationSeconds: 1800 },
    });
    expect(idorWorkout.statusCode).toBe(403);

    const idorDeletePreset = await app.inject({
      method: 'DELETE',
      url: '/api/workout-presets/preset_userA',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(idorDeletePreset.statusCode).toBe(403);

    const deleteGlobalNullPreset = await app.inject({
      method: 'DELETE',
      url: '/api/workout-presets/preset_global',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(deleteGlobalNullPreset.statusCode).toBe(403);

    // 3) 400 when attempting gameplay mutations on a soft-deleted character
    const deletedTravel = await app.inject({
      method: 'POST',
      url: '/api/characters/char_userA_deleted/travel',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { destination: 'TAVERN' },
    });
    expect(deletedTravel.statusCode).toBe(400);
    expect(deletedTravel.json().error).toContain('archived');

    const deletedWorkout = await app.inject({
      method: 'POST',
      url: '/api/characters/char_userA_deleted/workouts',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { workoutType: 'RESISTANCE', durationSeconds: 1800 },
    });
    expect(deletedWorkout.statusCode).toBe(400);

    // 4) 400 when IRONMAN_VERIFIED character submits manual workout OR spoofed isHardwareVerified with no telemetry samples
    const ironmanManual = await app.inject({
      method: 'POST',
      url: '/api/characters/char_userA_ironman/workouts',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        workoutType: 'RESISTANCE',
        durationSeconds: 1800,
        verificationSource: 'MANUAL_HONESTY',
      },
    });
    expect(ironmanManual.statusCode).toBe(400);
    expect(ironmanManual.json().error).toContain('Ironman Verified heroes require valid hardware biometric telemetry');

    const ironmanSpoofFlag = await app.inject({
      method: 'POST',
      url: '/api/characters/char_userA_ironman/workouts',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        workoutType: 'RESISTANCE',
        durationSeconds: 1800,
        isHardwareVerified: true,
        verificationSource: 'WEARABLE_TELEMETRY',
      },
    });
    expect(ironmanSpoofFlag.statusCode).toBe(400);
    expect(ironmanSpoofFlag.json().ironmanVerification.verified).toBe(false);

    // 5) 0-duration step spoofing rejected for Ironman character with detailed verification reasons
    const ironmanZeroDurationSteps = await app.inject({
      method: 'POST',
      url: '/api/characters/char_userA_ironman/workouts',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        workoutType: 'ACTIVE_RECOVERY',
        cardioActivityType: 'STEPS',
        durationSeconds: 0,
        stepCount: 8000,
        verificationSource: 'APPLE_HEALTHKIT',
      },
    });
    expect(ironmanZeroDurationSteps.statusCode).toBe(400);
    expect(ironmanZeroDurationSteps.json().ironmanVerification.verified).toBe(false);
    expect(ironmanZeroDurationSteps.json().ironmanVerification.details).toBeTruthy();

    await app.close();
  });

  it('enforces full bounty validation (requiredRank, totalStatLevel, dungeonClears, zone2Minutes) and duplicate completion 409', async () => {
    const completions: any[] = [];
    const charState: any = {
      id: 'char_bounty_1',
      userId: 'user_bounty_1',
      deletedAt: null,
      name: 'BountyHunter',
      gameMode: 'STANDARD',
      adventurerRank: 'COPPER',
      gold: 100,
      adventurerReputation: 0,
      dexLevel: 1,
      conLevel: 1,
      wisLevel: 1,
      sprLevel: 1,
      stats: {
        strengthLevel: 1,
        enduranceLevel: 1,
        agilityLevel: 1,
      },
    };

    const bountiesByKey: Record<string, any> = {
      trial_of_bronze: {
        id: 'bounty_bronze',
        slug: 'trial_of_bronze',
        isRankUpTrial: true,
        requiredRank: 'IRON',
        unlocksRank: 'BRONZE',
        requirements: { totalStatLevel: 10, dungeonClears: 2 },
        reputationReward: 500,
        goldReward: 700,
      },
      weekly_zone2_patrol: {
        id: 'bounty_zone2',
        slug: 'weekly_zone2_patrol',
        isRankUpTrial: false,
        requiredRank: 'COPPER',
        unlocksRank: null,
        requirements: { zone2Minutes: 45 },
        reputationReward: 120,
        goldReward: 200,
      },
    };

    let dungeonClearsCount = 0;
    let workoutLogs: any[] = [];

    const mockDb = {
      character: {
        findUnique: async () => charState,
        update: async ({ data }: any) => {
          if (data.gold?.increment) charState.gold += data.gold.increment;
          if (data.adventurerReputation?.increment) {
            charState.adventurerReputation += data.adventurerReputation.increment;
          }
          if (data.adventurerRank) charState.adventurerRank = data.adventurerRank;
          return charState;
        },
      },
      guildBounty: {
        findFirst: async ({ where }: any) => {
          const key = where?.OR?.[0]?.id ?? where?.OR?.[1]?.slug;
          return bountiesByKey[key] ?? null;
        },
      },
      characterBountyCompletion: {
        findUnique: async ({ where }: any) => {
          const bId = where?.characterId_bountyId?.bountyId;
          return completions.find((c) => c.bountyId === bId) ?? null;
        },
        create: async ({ data }: any) => {
          completions.push(data);
          return data;
        },
      },
      dungeonRunParticipant: {
        count: async () => dungeonClearsCount,
      },
      workoutLog: {
        findMany: async () => workoutLogs,
      },
    } as unknown as PrismaClient;

    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({
      userId: 'user_bounty_1',
      email: 'bounty@gokirpg.com',
      username: 'bounty',
    });

    // 1. Rejects trial_of_bronze when character rank is COPPER (< IRON)
    const rankFail = await app.inject({
      method: 'POST',
      url: '/api/characters/char_bounty_1/bounties/trial_of_bronze/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(rankFail.statusCode).toBe(400);
    expect(rankFail.json().error).toContain('Requires Adventurer Rank IRON');

    // Promote character to IRON, but totalStatLevel is 7 (< 10)
    charState.adventurerRank = 'IRON';
    const statFail = await app.inject({
      method: 'POST',
      url: '/api/characters/char_bounty_1/bounties/trial_of_bronze/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(statFail.statusCode).toBe(400);
    expect(statFail.json().error).toContain('Requires total Stat Level 10');

    // Raise stats to totalStatLevel 10 (4+1+1+1+1+1+1 = 10), but dungeonClears is 1 (< 2)
    charState.stats.strengthLevel = 4;
    dungeonClearsCount = 1;
    const dungeonFail = await app.inject({
      method: 'POST',
      url: '/api/characters/char_bounty_1/bounties/trial_of_bronze/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(dungeonFail.statusCode).toBe(400);
    expect(dungeonFail.json().error).toContain('Dungeon Expeditions');

    // Set dungeonClears = 2 -> Succeeds and promotes to BRONZE
    dungeonClearsCount = 2;
    const bronzeOk = await app.inject({
      method: 'POST',
      url: '/api/characters/char_bounty_1/bounties/trial_of_bronze/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(bronzeOk.statusCode).toBe(200);
    expect(bronzeOk.json().character.adventurerRank).toBe('BRONZE');

    // Duplicate completion returns 409 Conflict
    const dupFail = await app.inject({
      method: 'POST',
      url: '/api/characters/char_bounty_1/bounties/trial_of_bronze/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(dupFail.statusCode).toBe(409);

    // 2. Rejects weekly_zone2_patrol when Zone 2 minutes < 45
    workoutLogs = [{ durationSeconds: 20 * 60, averageHrZone: 2, workoutType: 'CARDIO_LOW_MOD' }];
    const zone2Fail = await app.inject({
      method: 'POST',
      url: '/api/characters/char_bounty_1/bounties/weekly_zone2_patrol/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(zone2Fail.statusCode).toBe(400);
    expect(zone2Fail.json().error).toContain('45 minutes');

    // Add another 30 minutes of Zone 2 cardio -> 50 min total -> Succeeds
    workoutLogs.push({ durationSeconds: 30 * 60, averageHrZone: 2, workoutType: 'CARDIO_LOW_MOD' });
    const zone2Ok = await app.inject({
      method: 'POST',
      url: '/api/characters/char_bounty_1/bounties/weekly_zone2_patrol/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(zone2Ok.statusCode).toBe(200);

    await app.close();
  });

  it('redacts ?token=<JWT> in BugReport.stateSnapshot.url on unhandled 500 exceptions', async () => {
    let capturedBugReportData: any = null;
    const mockDb = {
      bugReport: {
        create: async ({ data }: any) => {
          capturedBugReportData = data;
          return { id: 'bug_1', ...data };
        },
      },
      exerciseCatalog: {
        findMany: async () => {
          throw new Error('Simulated DB crash');
        },
      },
    } as unknown as PrismaClient;

    const app = await buildServerApp({ db: mockDb });
    const secretJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.supersecret.signature';

    const crashRes = await app.inject({
      method: 'GET',
      url: `/api/exercises?foo=bar&token=${secretJwt}&extra=1`,
    });

    expect(crashRes.statusCode).toBe(500);
    expect(capturedBugReportData).toBeTruthy();
    expect(capturedBugReportData.stateSnapshot.url).toBe(
      '/api/exercises?foo=bar&token=[REDACTED]&extra=1'
    );
    expect(capturedBugReportData.stateSnapshot.url).not.toContain(secretJwt);

    await app.close();
  });

  it('validates /equip against CONSUMABLE/MATERIAL items, mismatched slots, stat requirements, and duplicate single-item slots', async () => {
    const loadoutState: Record<string, any> = {
      characterId: 'char_equip_1',
      mainHandItemId: null,
      offHandItemId: null,
      headItemId: null,
      chestItemId: null,
      legsItemId: null,
      bootsItemId: null,
      accessory1ItemId: 'inv_ring_single',
      accessory2ItemId: null,
    };

    const inventoryById: Record<string, any> = {
      inv_elixir: {
        id: 'inv_elixir',
        characterId: 'char_equip_1',
        quantity: 2,
        item: {
          slug: 'vitality_elixir',
          name: 'Elixir of Peak Output',
          itemType: 'CONSUMABLE',
          requiredStrength: 0,
          requiredEndurance: 0,
          requiredAgility: 0,
        },
      },
      inv_boots: {
        id: 'inv_boots',
        characterId: 'char_equip_1',
        quantity: 1,
        item: {
          slug: 'windrunner_greaves',
          name: 'Windrunner Boots',
          itemType: 'BOOTS',
          slot: 'boots',
          requiredStrength: 0,
          requiredEndurance: 0,
          requiredAgility: 2,
        },
      },
      inv_heavy_sword: {
        id: 'inv_heavy_sword',
        characterId: 'char_equip_1',
        quantity: 1,
        item: {
          slug: 'ironbound_greatsword',
          name: 'Ironbound Greatsword',
          itemType: 'WEAPON',
          weaponHandedness: 'TWO_HANDED',
          requiredStrength: 10,
          requiredEndurance: 0,
          requiredAgility: 0,
        },
      },
      inv_ring_single: {
        id: 'inv_ring_single',
        characterId: 'char_equip_1',
        quantity: 1,
        item: {
          slug: 'signet_of_focus',
          name: 'Signet of Focus',
          itemType: 'ACCESSORY',
          requiredStrength: 0,
          requiredEndurance: 0,
          requiredAgility: 0,
        },
      },
    };

    const mockDb = {
      character: {
        findUnique: async () => ({
          id: 'char_equip_1',
          userId: 'user_equip_1',
          deletedAt: null,
          name: 'GearTester',
          stats: {
            strengthLevel: 4,
            enduranceLevel: 4,
            agilityLevel: 4,
          },
          equipmentLoadout: loadoutState,
        }),
      },
      inventoryItem: {
        findUnique: async ({ where }: any) => inventoryById[where.id] ?? null,
      },
      equipmentLoadout: {
        upsert: async ({ update, create }: any) => {
          Object.assign(loadoutState, update ?? create);
          return loadoutState;
        },
      },
    } as unknown as PrismaClient;

    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({
      userId: 'user_equip_1',
      email: 'equip@gokirpg.com',
      username: 'equipper',
    });

    // 1. Rejects equipping a CONSUMABLE item
    const consumableRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_equip_1/equip',
      headers: { authorization: `Bearer ${token}` },
      payload: { slot: 'mainHand', inventoryItemId: 'inv_elixir' },
    });
    expect(consumableRes.statusCode).toBe(400);
    expect(consumableRes.json().error).toMatch(/Consumables/i);

    // 2. Rejects equipping boots into mainHand slot
    const mismatchRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_equip_1/equip',
      headers: { authorization: `Bearer ${token}` },
      payload: { slot: 'mainHand', inventoryItemId: 'inv_boots' },
    });
    expect(mismatchRes.statusCode).toBe(400);
    expect(mismatchRes.json().error).toContain('mainHand');

    // 3. Rejects equipping weapon when Strength requirement is unmet (req 10 > current 4)
    const unmetStatRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_equip_1/equip',
      headers: { authorization: `Bearer ${token}` },
      payload: { slot: 'mainHand', inventoryItemId: 'inv_heavy_sword' },
    });
    expect(unmetStatRes.statusCode).toBe(400);
    expect(unmetStatRes.json().error).toContain('Strength');

    // 4. Rejects equipping the same single-quantity ring into accessory2 when already in accessory1
    const dupSlotRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_equip_1/equip',
      headers: { authorization: `Bearer ${token}` },
      payload: { slot: 'accessory2', inventoryItemId: 'inv_ring_single' },
    });
    expect(dupSlotRes.statusCode).toBe(400);
    expect(dupSlotRes.json().error).toContain('already equipped');

    // 5. Allows equipping boots into the matching boots slot
    const validEquipRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_equip_1/equip',
      headers: { authorization: `Bearer ${token}` },
      payload: { slot: 'boots', inventoryItemId: 'inv_boots' },
    });
    expect(validEquipRes.statusCode).toBe(200);
    expect(validEquipRes.json().loadout.bootsItemId).toBe('inv_boots');

    await app.close();
  });
});
