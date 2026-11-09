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
      payload: { destination: 'INVALID_REALM' },
    });
    expect(badTravel.statusCode).toBe(400);

    // Invalid HR zone (> 5) rejected by Zod with 400
    const badWorkout = await app.inject({
      method: 'POST',
      url: '/api/characters/char_1/workouts',
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
      payload: {
        arrivalTrigger: 'TELEPORT_HACK',
      },
    });
    expect(badSessionStart.statusCode).toBe(400);

    // Hybrid Protocol Phase 2: Invalid set RPE (> 10) rejected with 400
    const badLiveSet = await app.inject({
      method: 'POST',
      url: '/api/workout-sessions/sess_1/sets',
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
          return { id: 'char_iron_1', gameMode: promotedGameMode };
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

    // 1. High-intensity telemetry matching Zone 4 -> Ironman Verified
    const verifiedSamples = Array.from({ length: 20 }, (_, i) => ({
      bpm: 160 + (i % 12),
      timestamp: 1000000 + i * 30000,
    }));

    const verifiedRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_iron_1/workouts',
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
    expect(promotedGameMode).toBe('IRONMAN_VERIFIED');
    expect(verifiedRes.json().gameMode).toBe('IRONMAN_VERIFIED');

    // 2. Mismatched telemetry (85 BPM average for Zone 4 HIIT) -> Falls back to MANUAL_HONESTY
    const spoofedSamples = Array.from({ length: 20 }, (_, i) => ({
      bpm: 82 + (i % 6),
      timestamp: 1000000 + i * 30000,
    }));

    const unverifiedRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_iron_1/workouts',
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
});
