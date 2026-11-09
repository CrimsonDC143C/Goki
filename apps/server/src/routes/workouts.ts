import { PrismaClient } from '@goki/database';
import {
  ARRIVAL_BOON_MULTIPLIER,
  DungeonWorkoutBuff,
  HeartRateZone,
  HistoricalExercisePR,
  MS_PER_HOUR,
  SetLog as EngineSetLog,
  TAVERN_REST_THRESHOLD_HOURS,
  applyStatXpProgression,
  calculateConstitutionXp,
  calculateDexterityXp,
  calculateOverallLevel,
  calculateRecommendedRestSeconds,
  calculateSpiritXp,
  calculateWisdomXp,
  calculateWorkoutRaidEnergyDamage,
  classifyWorkoutIntensity,
  consolidateHybridWorkoutSession,
  createArrivalBoon,
  createInitialFatigueState,
  createLiveDungeonWorkoutBuff,
  detectRegisteredGymArrival,
  evaluateLiveSetMicroReward,
  getOptimalRestAdvice,
  recordWorkoutInFatigueState,
  verifyMindBodyTelemetry,
  verifyRecoveryTelemetry,
  verifyTelemetry,
} from '@goki/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GameTimerScheduler } from '../queues/bullmq-workers';
import { depositLootToInventory } from '../services/game-operations';

const workoutTypeEnum = z.enum([
  'RESISTANCE',
  'CARDIO_LOW_MOD',
  'CARDIO_HIGH_INTENSITY',
  'HYBRID',
  'ACTIVE_RECOVERY',
]);

const workoutCategoryEnum = z.enum(['GYM', 'CARDIO', 'SPORT', 'RECOVERY']);
const setTypeEnum = z.enum(['NORMAL', 'WARMUP', 'DROP_SET', 'FAILURE', 'AMRAP']);
const verificationSourceEnum = z.enum([
  'MANUAL_HONESTY',
  'APPLE_HEALTHKIT',
  'GOOGLE_HEALTH_CONNECT',
  'WEARABLE_TELEMETRY',
]);

const startWorkoutSessionSchema = z.object({
  workoutType: workoutTypeEnum.default('RESISTANCE'),
  arrivalTrigger: z.enum(['GEOFENCE_GYM', 'MANUAL_OPEN_WORLD']).default('MANUAL_OPEN_WORLD'),
  gymId: z.string().optional(),
  gymName: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  lowEnergyMode: z.boolean().default(false),
  restTimerConfigSec: z.number().int().min(15).max(600).optional(),
});

const logSessionSetSchema = z.object({
  exerciseId: z.string().min(1),
  reps: z.number().int().min(1),
  weightKg: z.number().min(0),
  rpe: z.number().min(1).max(10).optional(),
  isWarmup: z.boolean().default(false),
  setType: setTypeEnum.optional(),
  supersetGroupId: z.string().nullable().optional(),
  customRestSeconds: z.number().int().min(10).max(600).optional(),
});

const logWorkoutSchema = z.object({
  workoutType: workoutTypeEnum,
  workoutCategory: workoutCategoryEnum.optional(),
  sourcePresetId: z.string().optional(),
  sessionRpe: z.number().min(1).max(10).optional(),
  performedAt: z.coerce.date().optional(),
  durationSeconds: z.number().int().min(0).default(0),
  averageHrZone: z.number().int().min(1).max(5).optional(),
  cardioActivityType: z.string().optional(),
  notes: z.string().max(500).optional(),
  channeledRaidInstanceId: z.string().optional(),
  // Biometric Wearable & Ironman Telemetry Verification
  verificationSource: verificationSourceEnum.optional(),
  isHardwareVerified: z.boolean().optional(),
  externalTelemetryRef: z.string().optional(),
  osActivityClassification: z.string().optional(),
  stepCount: z.number().int().min(0).optional(),
  sleepStages: z
    .array(
      z.object({
        stage: z.enum(['CORE', 'DEEP', 'REM', 'AWAKE', 'ASLEEP']),
        startTime: z.union([z.number(), z.string()]),
        endTime: z.union([z.number(), z.string()]),
        durationSeconds: z.number().optional(),
      })
    )
    .optional(),
  telemetrySamples: z
    .array(
      z.object({
        bpm: z.number(),
        timestamp: z.union([z.number(), z.string()]),
      })
    )
    .optional(),
  // Hybrid Reward Protocol Phase 1-3 fields
  sessionId: z.string().optional(),
  arrivalTrigger: z.enum(['GEOFENCE_GYM', 'MANUAL_OPEN_WORLD']).default('MANUAL_OPEN_WORLD'),
  gymName: z.string().max(120).optional(),
  lowEnergyMode: z.boolean().default(false),
  focusOverrideCount: z.number().int().min(0).default(0),
  chestOpened: z.boolean().default(true),
  sets: z
    .array(
      z.object({
        exerciseId: z.string(),
        reps: z.number().int().min(1),
        weightKg: z.number().min(0),
        rpe: z.number().min(1).max(10).optional(),
        isWarmup: z.boolean().default(false),
        setType: setTypeEnum.optional(),
        supersetGroupId: z.string().nullable().optional(),
      })
    )
    .default([]),
  cardioSegments: z
    .array(
      z.object({
        exerciseId: z.string(),
        activityType: z.string(),
        durationSeconds: z.number().int().positive(),
        averageHrZone: z.number().int().min(1).max(5),
        rpe: z.number().min(1).max(10).optional(),
      })
    )
    .default([]),
});

export function registerWorkoutRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  timers: GameTimerScheduler
): void {
  // List Exercise Catalog
  app.get('/api/exercises', async (_request, reply) => {
    const exercises = await db.exerciseCatalog.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return reply.send({ exercises });
  });

  // Phase 1 ("Crossing the Threshold"): Start Live Hybrid Workout Session & Grant 1.25x Arrival Boon
  app.post('/api/characters/:characterId/workout-sessions/start', async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);
    const body = startWorkoutSessionSchema.parse(request.body);

    const character = await db.character.findUnique({ where: { id: characterId } });
    if (!character) {
      return reply.status(404).send({ error: 'Character not found.' });
    }

    let matchedGymId = body.gymId ?? null;
    let matchedGymName = body.gymName ?? null;
    let effectiveTrigger = body.arrivalTrigger;

    if (body.latitude !== undefined && body.longitude !== undefined) {
      const gyms = await db.registeredGymGuild.findMany({
        where: { userId: character.userId },
      });
      const detected = detectRegisteredGymArrival(
        { latitude: body.latitude, longitude: body.longitude },
        gyms
      );
      if (detected) {
        matchedGymId = detected.id;
        matchedGymName = detected.name;
        effectiveTrigger = 'GEOFENCE_GYM';
      }
    }

    // Verify foreign key integrity: ensure gymId exists in RegisteredGymGuild before persisting relation
    let validatedGymGuildId: string | null = null;
    if (matchedGymId) {
      const existingGym = await db.registeredGymGuild.findUnique({
        where: { id: matchedGymId },
      });
      if (existingGym) {
        validatedGymGuildId = existingGym.id;
        if (!matchedGymName) {
          matchedGymName = existingGym.name;
        }
      }
    }

    const arrivalBoon = createArrivalBoon({
      trigger: effectiveTrigger,
      gymId: validatedGymGuildId,
      gymName: matchedGymName,
    });

    const advice = getOptimalRestAdvice({ workoutType: body.workoutType });
    const restSec = body.restTimerConfigSec ?? advice.recommendedSeconds;

    const session = await db.workoutSession.create({
      data: {
        userId: character.userId,
        characterId,
        gymGuildId: validatedGymGuildId,
        gymName: arrivalBoon.gymName,
        phase: 'DUNGEON_ACTIVE',
        workoutType: body.workoutType,
        arrivalTrigger: arrivalBoon.trigger,
        arrivalBoonMultiplier: arrivalBoon.multiplier,
        lowEnergyMode: body.lowEnergyMode,
        restTimerConfigSec: restSec,
        focusLockActive: true,
      },
    });

    return reply.status(201).send({
      session,
      arrivalBoon,
      restAdvice: advice,
    });
  });

  // Phase 2 ("Set-by-Set Operant Conditioning"): Log Live Set, Trigger Micro-Reward & Auto-Start Rest
  app.post('/api/workout-sessions/:sessionId/sets', async (request, reply) => {
    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);
    const body = logSessionSetSchema.parse(request.body);

    const session = await db.workoutSession.findUnique({
      where: { id: sessionId },
      include: { setLogs: true },
    });
    if (!session) {
      return reply.status(404).send({ error: 'Workout session not found.' });
    }
    if (session.phase !== 'DUNGEON_ACTIVE' && session.phase !== 'RESTING') {
      return reply.status(409).send({ error: `Cannot log sets in phase '${session.phase}'.` });
    }

    const exercise = await db.exerciseCatalog.findFirst({
      where: { OR: [{ id: body.exerciseId }, { slug: body.exerciseId }] },
    });
    if (!exercise) {
      return reply.status(404).send({ error: 'Exercise not found in catalog.' });
    }

    const priorPrRow = await db.userExercisePR.findUnique({
      where: {
        characterId_exerciseId: {
          characterId: session.characterId,
          exerciseId: exercise.id,
        },
      },
    });

    const historicalPR: HistoricalExercisePR | undefined = priorPrRow
      ? {
          exerciseId: priorPrRow.exerciseId,
          bestE1RM: priorPrRow.bestE1RM,
          bestSingleSetVolume: priorPrRow.bestSingleSetVolume,
          bestSessionVolume: priorPrRow.bestSessionVolume,
          maxRepsByWeight: (priorPrRow.maxRepsByWeight as Record<string, number>) ?? {},
          bestCardioDurationSecByZone:
            (priorPrRow.bestCardioDurationSecByZone as Partial<Record<HeartRateZone, number>>) ??
            {},
        }
      : undefined;

    const { feedback } = evaluateLiveSetMicroReward({
      setId: `set_${session.setLogs.length + 1}`,
      exerciseId: exercise.id,
      reps: body.reps,
      weightKg: body.weightKg,
      rpe: body.rpe ?? null,
      isWarmup: body.isWarmup,
      setType: body.setType,
      exerciseBaseXpFactor: exercise.baseXpFactor,
      historicalPR,
      arrivalBoonMultiplier: session.arrivalBoonMultiplier,
    });

    const restSeconds =
      body.customRestSeconds ??
      calculateRecommendedRestSeconds({
        setType: body.setType ?? (body.isWarmup ? 'WARMUP' : 'NORMAL'),
        isWarmup: body.isWarmup,
        exerciseBaseXpFactor: exercise.baseXpFactor,
        isCompound: exercise.isCompound,
        relativeIntensity: feedback.relativeIntensity,
        rpe: body.rpe ?? null,
      });
    const restAdvice = getOptimalRestAdvice({
      workoutType: session.workoutType,
      reps: body.reps,
      relativeIntensity: feedback.relativeIntensity,
      rpe: body.rpe ?? null,
      isWarmup: body.isWarmup,
    });
    const now = new Date();
    const restEndsAt = new Date(now.getTime() + restSeconds * 1000);

    let nextBossHp = session.encounterBossHp - feedback.bossHpDamage;
    let nextBossMaxHp = session.encounterBossMaxHp;
    if (nextBossHp <= 0) {
      nextBossMaxHp = Math.round(session.encounterBossMaxHp * 1.25);
      nextBossHp = nextBossMaxHp;
    }

    const setLog = await db.setLog.create({
      data: {
        workoutSessionId: session.id,
        exerciseId: exercise.id,
        setNumber: session.setLogs.length + 1,
        reps: body.reps,
        weightKg: body.weightKg,
        rpe: body.rpe ?? null,
        isWarmup: body.isWarmup,
        setType: body.setType ?? (body.isWarmup ? 'WARMUP' : 'NORMAL'),
        supersetGroupId: body.supersetGroupId ?? null,
        calculatedE1RM: feedback.calculatedE1RM,
        relativeIntensity: feedback.relativeIntensity,
        isLivePrPace: feedback.isLivePrPace,
        microXpTick: feedback.xpTick,
        microGoldTick: feedback.goldTick,
        bossHpDamage: feedback.bossHpDamage,
        plannedRestSec: restSeconds,
      },
    });

    const updatedSession = await db.workoutSession.update({
      where: { id: session.id },
      data: {
        phase: 'RESTING',
        restTimerConfigSec: restSeconds,
        restEndsAt,
        encounterBossMaxHp: nextBossMaxHp,
        encounterBossHp: nextBossHp,
        accumulatedMicroXp: { increment: feedback.xpTick },
        accumulatedMicroGold: { increment: feedback.goldTick },
      },
    });

    return reply.status(201).send({
      setLog,
      microFeedback: feedback,
      restAdvice,
      session: updatedSession,
    });
  });

  // Phase 3 ("Delayed Gratification Consolidation"): Finish & Consolidate Hybrid Workout
  app.post('/api/characters/:characterId/workouts', async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);
    const body = logWorkoutSchema.parse(request.body);
    const performedAt = body.performedAt ?? new Date();

    const character = await db.character.findUnique({
      where: { id: characterId },
      include: { stats: true, fatigueState: true },
    });

    if (!character || !character.stats) {
      return reply.status(404).send({ error: 'Character not found.' });
    }

    // Load Exercise metadata & historical PR records for all exercises referenced
    const referencedIds = Array.from(
      new Set([
        ...body.sets.map((s) => s.exerciseId),
        ...body.cardioSegments.map((c) => c.exerciseId),
      ])
    );

    const catalogEntries =
      referencedIds.length > 0
        ? await db.exerciseCatalog.findMany({
            where: { OR: [{ id: { in: referencedIds } }, { slug: { in: referencedIds } }] },
          })
        : [];

    const catalogByKey = new Map<string, (typeof catalogEntries)[number]>();
    const exerciseBaseXpById: Record<string, number> = {};
    for (const ex of catalogEntries) {
      catalogByKey.set(ex.id, ex);
      catalogByKey.set(ex.slug, ex);
      exerciseBaseXpById[ex.id] = ex.baseXpFactor;
    }

    const dbExerciseIds = Array.from(new Set(catalogEntries.map((e) => e.id)));
    const existingPrRows =
      dbExerciseIds.length > 0
        ? await db.userExercisePR.findMany({
            where: { characterId, exerciseId: { in: dbExerciseIds } },
          })
        : [];

    const historicalPRs: Record<string, HistoricalExercisePR> = {};
    for (const row of existingPrRows) {
      historicalPRs[row.exerciseId] = {
        exerciseId: row.exerciseId,
        bestE1RM: row.bestE1RM,
        bestSingleSetVolume: row.bestSingleSetVolume,
        bestSessionVolume: row.bestSessionVolume,
        maxRepsByWeight: (row.maxRepsByWeight as Record<string, number>) ?? {},
        bestCardioDurationSecByZone:
          (row.bestCardioDurationSecByZone as Partial<Record<HeartRateZone, number>>) ?? {},
      };
    }

    // 1. Evaluate Rest / Active Recovery / Systemic Fatigue transition
    const prevFatigue = character.fatigueState
      ? {
          isRestingInTavern: character.fatigueState.isRestingInTavern,
          tavernEnteredAt: character.fatigueState.tavernEnteredAt,
          lastStrenuousWorkoutAt: character.fatigueState.lastStrenuousWorkoutAt,
          lastWorkoutAt: character.fatigueState.lastWorkoutAt,
          consecutiveHighIntensityDays: character.fatigueState.consecutiveHighIntensityDays,
          lastHighIntensityDayKey: character.fatigueState.lastHighIntensityDayKey,
          systemicFatigueStacks: character.fatigueState.systemicFatigueStacks,
          fatigueScore: character.fatigueState.fatigueScore,
          wellRestedMultiplier: character.fatigueState.wellRestedMultiplier,
          activeRecoveryBuffActive: character.fatigueState.activeRecoveryBuffActive,
          activeRecoveryGrantedAt: character.fatigueState.activeRecoveryGrantedAt,
        }
      : createInitialFatigueState(performedAt);

    const prevConsistencyStreak = character.fatigueState?.consistencyStreakSessions ?? 0;
    const nextConsistencyStreak = prevConsistencyStreak + 1;

    const dominantHrZone =
      (body.averageHrZone as HeartRateZone | undefined) ??
      (body.cardioSegments[0]?.averageHrZone as HeartRateZone | undefined);

    const fatigueTransition = recordWorkoutInFatigueState(prevFatigue, {
      performedAt,
      workoutType: body.workoutType,
      averageHrZone: dominantHrZone,
      hasResistanceSets: body.sets.length > 0,
    });

    // 2. Consolidate Full Hybrid Reward Payload (Arrival Boon 1.25x + Resilience Bonus + Effort Chest)
    const engineSetLogs: EngineSetLog[] = body.sets.map((s, idx) => {
      const cat = catalogByKey.get(s.exerciseId);
      const normExId = cat?.id ?? s.exerciseId;
      return {
        id: `set_${idx + 1}`,
        setNumber: idx + 1,
        exerciseId: normExId,
        exerciseName: cat?.name ?? s.exerciseId,
        reps: s.reps,
        weightKg: s.weightKg,
        rpe: s.rpe ?? null,
        isWarmup: s.isWarmup,
        setType: s.setType ?? (s.isWarmup ? 'WARMUP' : 'NORMAL'),
        supersetGroupId: s.supersetGroupId ?? null,
        calculatedE1RM: 0,
        relativeIntensity: 0,
        isLivePersonalRecordPace: false,
        prTypesOnPace: [],
        microXpTick: 0,
        microGoldTick: 0,
        bossHpDamage: 0,
        plannedRestSeconds: 120,
        loggedAtIso: performedAt.toISOString(),
      };
    });

    const normalizedCardio = body.cardioSegments.map((c) => {
      const cat = catalogByKey.get(c.exerciseId);
      return {
        exerciseId: cat?.id ?? c.exerciseId,
        activityType: c.activityType,
        durationSeconds: c.durationSeconds,
        averageHrZone: c.averageHrZone as HeartRateZone,
        rpe: c.rpe ?? body.sessionRpe ?? null,
      };
    });

    const rewardPayload = consolidateHybridWorkoutSession({
      sessionId: body.sessionId ?? `session_${performedAt.getTime()}`,
      workoutType: body.workoutType,
      setLogs: engineSetLogs,
      cardioSegments: normalizedCardio,
      durationSeconds: body.durationSeconds,
      arrivalBoonMultiplier: ARRIVAL_BOON_MULTIPLIER,
      fatigueAndRestMultiplier: fatigueTransition.xpMultiplierForThisWorkout,
      lowEnergyMode: body.lowEnergyMode,
      lastWorkoutAt: prevFatigue.lastWorkoutAt,
      performedAt,
      consistencyStreakSessions: nextConsistencyStreak,
      historicalPRs,
      exerciseBaseXpById,
      currentCharacterStats: {
        STRENGTH: {
          level: character.stats.strengthLevel,
          xp: character.stats.strengthXp,
          pointsAvailable: character.stats.strengthTalentPointsAvailable,
        },
        ENDURANCE: {
          level: character.stats.enduranceLevel,
          xp: character.stats.enduranceXp,
          pointsAvailable: character.stats.enduranceTalentPointsAvailable,
        },
        AGILITY: {
          level: character.stats.agilityLevel,
          xp: character.stats.agilityXp,
          pointsAvailable: character.stats.agilityTalentPointsAvailable,
        },
      },
      rngSeed: `workout:${characterId}:${performedAt.getTime()}`,
    });

    const evalResult = rewardPayload.workoutEvaluation;

    // 2B. Evaluate Biometric Wearable Telemetry Verification (Ironman Mode Realization)
    let effectiveVerificationSource:
      | 'MANUAL_HONESTY'
      | 'APPLE_HEALTHKIT'
      | 'GOOGLE_HEALTH_CONNECT'
      | 'WEARABLE_TELEMETRY' = 'MANUAL_HONESTY';
    let effectiveIsHardwareVerified = false;
    let telemetrySummaryRef = body.externalTelemetryRef ?? null;
    let verificationResultDetails: Record<string, unknown> | null = null;

    const modalityNormalized = (body.cardioActivityType ?? body.workoutType ?? '').toUpperCase();
    const isMindBodyModality =
      ['YOGA', 'PILATES', 'MEDITATION', 'BREATHWORK', 'SAUNA', 'COLD_PLUNGE'].includes(modalityNormalized) ||
      (body.osActivityClassification != null &&
        ['YOGA', 'PILATES', 'MEDITATION', 'MIND', 'BREATH'].some((t) =>
          body.osActivityClassification!.toUpperCase().includes(t)
        ));

    const isRecoveryModality =
      ['SLEEP', 'STEPS'].includes(modalityNormalized) ||
      body.sleepStages !== undefined ||
      body.stepCount !== undefined;

    if (isMindBodyModality && (body.telemetrySamples?.length || body.osActivityClassification)) {
      const mbResult = verifyMindBodyTelemetry({
        samples: body.telemetrySamples ?? [],
        durationSeconds: body.durationSeconds,
        expectedModality: modalityNormalized,
        osActivityClassification: body.osActivityClassification ?? null,
      });

      if (mbResult.verified) {
        effectiveVerificationSource = body.verificationSource ?? 'WEARABLE_TELEMETRY';
        effectiveIsHardwareVerified = true;
        verificationResultDetails = mbResult as unknown as Record<string, unknown>;
        telemetrySummaryRef = JSON.stringify({
          verified: true,
          confidenceScore: mbResult.confidenceScore,
          verifier: 'verifyMindBodyTelemetry',
          averageBpm: mbResult.averageBpm,
          peakBpm: mbResult.peakBpm,
          bpmStdDev: mbResult.bpmStdDev,
          osClassification: body.osActivityClassification,
        });
      }
    } else if (isRecoveryModality) {
      const recResult = verifyRecoveryTelemetry({
        sleepStages: body.sleepStages,
        totalSleepHours: body.durationSeconds > 0 ? body.durationSeconds / 3600 : undefined,
        stepCount: body.stepCount,
        stepTrackingDurationSeconds: body.durationSeconds > 0 ? body.durationSeconds : undefined,
      });

      if (recResult.verified) {
        effectiveVerificationSource = body.verificationSource ?? 'WEARABLE_TELEMETRY';
        effectiveIsHardwareVerified = true;
        verificationResultDetails = recResult as unknown as Record<string, unknown>;
        telemetrySummaryRef = JSON.stringify({
          verified: true,
          confidenceScore: recResult.confidenceScore,
          verifier: 'verifyRecoveryTelemetry',
          sleepVerified: recResult.sleepVerified,
          stepsVerified: recResult.stepsVerified,
          deepSleepMinutes: recResult.deepSleepMinutes,
          stepCount: recResult.stepCount,
        });
      }
    } else if (body.telemetrySamples && body.telemetrySamples.length >= 3) {
      const verificationResult = verifyTelemetry(
        body.telemetrySamples,
        body.durationSeconds,
        {
          workoutType: body.workoutType,
          targetHrZone: (dominantHrZone as HeartRateZone) ?? undefined,
        }
      );

      if (verificationResult.verified) {
        effectiveVerificationSource = body.verificationSource ?? 'WEARABLE_TELEMETRY';
        effectiveIsHardwareVerified = true;
        verificationResultDetails = verificationResult as unknown as Record<string, unknown>;
        telemetrySummaryRef = JSON.stringify({
          confidenceScore: verificationResult.confidenceScore,
          averageBpm: verificationResult.averageBpm,
          peakBpm: verificationResult.peakBpm,
          effectiveZone: verificationResult.effectiveZone,
          sampleCount: verificationResult.sampleCount,
        });
      }
    } else if (
      body.isHardwareVerified &&
      body.verificationSource &&
      body.verificationSource !== 'MANUAL_HONESTY'
    ) {
      effectiveVerificationSource = body.verificationSource;
      effectiveIsHardwareVerified = true;
    }

    // 3. Apply Core Stat Leveling & 7-Stat Progression
    const strProg = applyStatXpProgression(
      character.stats.strengthLevel,
      character.stats.strengthXp,
      rewardPayload.finalXpByStat.STRENGTH
    );
    const endProg = applyStatXpProgression(
      character.stats.enduranceLevel,
      character.stats.enduranceXp,
      rewardPayload.finalXpByStat.ENDURANCE
    );
    const agiProg = applyStatXpProgression(
      character.stats.agilityLevel,
      character.stats.agilityXp,
      rewardPayload.finalXpByStat.AGILITY
    );

    let wisXpAwarded = 0;
    let sprXpAwarded = 0;
    let conXpAwarded = 0;
    let dexXpAwarded = 0;

    let wisProg: ReturnType<typeof applyStatXpProgression> | null = null;
    let sprProg: ReturnType<typeof applyStatXpProgression> | null = null;
    let conProg: ReturnType<typeof applyStatXpProgression> | null = null;
    let dexProg: ReturnType<typeof applyStatXpProgression> | null = null;

    if (modalityNormalized === 'YOGA' || modalityNormalized === 'PILATES') {
      wisXpAwarded = Math.round(
        calculateWisdomXp({
          durationMinutes: body.durationSeconds / 60,
          modality: modalityNormalized,
        }) * rewardPayload.effectiveTotalMultiplier
      );
      wisProg = applyStatXpProgression(
        character.wisLevel ?? 1,
        character.wisXp ?? 0,
        wisXpAwarded
      );
    } else if (
      modalityNormalized === 'MEDITATION' ||
      modalityNormalized === 'BREATHWORK' ||
      modalityNormalized === 'SAUNA' ||
      modalityNormalized === 'COLD_PLUNGE'
    ) {
      sprXpAwarded = Math.round(
        calculateSpiritXp({
          durationMinutes: body.durationSeconds / 60,
          modality: modalityNormalized,
        }) * rewardPayload.effectiveTotalMultiplier
      );
      sprProg = applyStatXpProgression(
        character.sprLevel ?? 1,
        character.sprXp ?? 0,
        sprXpAwarded
      );
    } else if (
      modalityNormalized === 'SLEEP' ||
      modalityNormalized === 'STEPS' ||
      body.sleepStages !== undefined ||
      body.stepCount !== undefined
    ) {
      conXpAwarded = Math.round(
        calculateConstitutionXp({
          sleepHours: body.durationSeconds > 0 ? body.durationSeconds / 3600 : undefined,
          stepCount: body.stepCount,
        }) * rewardPayload.effectiveTotalMultiplier
      );
      conProg = applyStatXpProgression(
        character.conLevel ?? 1,
        character.conXp ?? 0,
        conXpAwarded
      );
    } else if (
      modalityNormalized === 'CALISTHENICS' ||
      modalityNormalized === 'ROCK_CLIMBING'
    ) {
      const totalReps = body.sets.reduce((sum, s) => sum + s.reps, 0);
      dexXpAwarded = Math.round(
        calculateDexterityXp({
          durationMinutes: body.durationSeconds / 60,
          volumeReps: totalReps,
          rpe: body.sessionRpe,
          modality: modalityNormalized,
        }) * rewardPayload.effectiveTotalMultiplier
      );
      dexProg = applyStatXpProgression(
        character.dexLevel ?? 1,
        character.dexXp ?? 0,
        dexXpAwarded
      );
    }

    const updatedStats = await db.characterStats.update({
      where: { characterId },
      data: {
        strengthLevel: strProg.newLevel,
        strengthXp: strProg.remainingXp,
        strengthTalentPointsAvailable: { increment: strProg.talentPointsEarned },
        enduranceLevel: endProg.newLevel,
        enduranceXp: endProg.remainingXp,
        enduranceTalentPointsAvailable: { increment: endProg.talentPointsEarned },
        agilityLevel: agiProg.newLevel,
        agilityXp: agiProg.remainingXp,
        agilityTalentPointsAvailable: { increment: agiProg.talentPointsEarned },
      },
    });

    const nextOverallLevel = calculateOverallLevel({
      strengthLevel: strProg.newLevel,
      enduranceLevel: endProg.newLevel,
      agilityLevel: agiProg.newLevel,
      dexLevel: dexProg ? dexProg.newLevel : character.dexLevel,
      conLevel: conProg ? conProg.newLevel : character.conLevel,
      wisLevel: wisProg ? wisProg.newLevel : character.wisLevel,
      sprLevel: sprProg ? sprProg.newLevel : character.sprLevel,
    });

    await db.character.update({
      where: { id: characterId },
      data: {
        overallLevel: nextOverallLevel,
        gold: { increment: rewardPayload.totalGoldAwarded },
        ...(dexProg ? { dexLevel: dexProg.newLevel, dexXp: dexProg.remainingXp } : {}),
        ...(conProg ? { conLevel: conProg.newLevel, conXp: conProg.remainingXp } : {}),
        ...(wisProg ? { wisLevel: wisProg.newLevel, wisXp: wisProg.remainingXp } : {}),
        ...(sprProg ? { sprLevel: sprProg.newLevel, sprXp: sprProg.remainingXp } : {}),
      },
    });

    // 4. Persist Updated Fatigue State, Consistency Streak & Resilience Shield Counter
    const ns = fatigueTransition.nextState;
    const shieldIncrement = rewardPayload.resilienceBonus.triggered ? 1 : 0;

    await db.fatigueAndRestState.upsert({
      where: { characterId },
      update: {
        isRestingInTavern: ns.isRestingInTavern,
        tavernEnteredAt: ns.tavernEnteredAt,
        lastStrenuousWorkoutAt: ns.lastStrenuousWorkoutAt,
        lastWorkoutAt: ns.lastWorkoutAt,
        consecutiveHighIntensityDays: ns.consecutiveHighIntensityDays,
        lastHighIntensityDayKey: ns.lastHighIntensityDayKey,
        systemicFatigueStacks: ns.systemicFatigueStacks,
        fatigueScore: ns.fatigueScore,
        wellRestedMultiplier: ns.wellRestedMultiplier,
        activeRecoveryBuffActive: ns.activeRecoveryBuffActive,
        activeRecoveryGrantedAt: ns.activeRecoveryGrantedAt,
        consistencyStreakSessions: nextConsistencyStreak,
        resilienceShieldsEarned: { increment: shieldIncrement },
      },
      create: {
        characterId,
        isRestingInTavern: ns.isRestingInTavern,
        tavernEnteredAt: ns.tavernEnteredAt,
        lastStrenuousWorkoutAt: ns.lastStrenuousWorkoutAt,
        lastWorkoutAt: ns.lastWorkoutAt,
        consecutiveHighIntensityDays: ns.consecutiveHighIntensityDays,
        lastHighIntensityDayKey: ns.lastHighIntensityDayKey,
        systemicFatigueStacks: ns.systemicFatigueStacks,
        fatigueScore: ns.fatigueScore,
        wellRestedMultiplier: ns.wellRestedMultiplier,
        activeRecoveryBuffActive: ns.activeRecoveryBuffActive,
        activeRecoveryGrantedAt: ns.activeRecoveryGrantedAt,
        consistencyStreakSessions: nextConsistencyStreak,
        resilienceShieldsEarned: shieldIncrement,
      },
    });

    const intensityClass = classifyWorkoutIntensity({
      performedAt,
      workoutType: body.workoutType,
      averageHrZone: dominantHrZone,
      hasResistanceSets: body.sets.length > 0,
    });
    if (intensityClass.isStrenuous) {
      await timers.scheduleTavernRestTransition({
        characterId,
        delayMs: TAVERN_REST_THRESHOLD_HOURS * MS_PER_HOUR,
      });
    }

    // 5. Check if character is currently in an active 24h Dungeon Window -> Inject Live Workout Buff!
    const activeParticipation = await db.dungeonRunParticipant.findFirst({
      where: {
        characterId,
        dungeonRun: { status: 'ACTIVE_WINDOW' },
      },
      include: { dungeonRun: true },
    });

    // 5B. Verify channeled raid boss foreign key exists in DB (defensive safeguard against stale/mock IDs)
    let validRaid: { id: string; status: string; currentHp: bigint } | null = null;
    if (body.channeledRaidInstanceId) {
      validRaid = await db.raidBossInstance.findUnique({
        where: { id: body.channeledRaidInstanceId },
        select: { id: true, status: true, currentHp: true },
      });
    }

    // 6. Persist WorkoutLog & WorkoutSets
    const createdWorkout = await db.workoutLog.create({
      data: {
        userId: character.userId,
        characterId,
        workoutType: body.workoutType,
        workoutCategory: body.workoutCategory ?? null,
        sourcePresetId: body.sourcePresetId ?? null,
        sessionRpe: body.sessionRpe ?? null,
        performedAt,
        durationSeconds: body.durationSeconds,
        averageHrZone: dominantHrZone ?? null,
        cardioActivityType: body.cardioActivityType ?? null,
        notes: body.notes ?? null,
        verificationSource: effectiveVerificationSource,
        isHardwareVerified: effectiveIsHardwareVerified,
        externalTelemetryRef: telemetrySummaryRef,
        strengthXpAwarded: rewardPayload.finalXpByStat.STRENGTH,
        enduranceXpAwarded: rewardPayload.finalXpByStat.ENDURANCE,
        agilityXpAwarded: rewardPayload.finalXpByStat.AGILITY,
        xpMultiplierApplied: rewardPayload.effectiveTotalMultiplier,
        triggeredPrCrit: evalResult.criticalTrainingBonus.triggered,
        prCritCount: evalResult.criticalTrainingBonus.prBreakCount,
        prCritBonusXp: evalResult.criticalTrainingBonus.totalBonusXp,
        prCritLootDrop: (evalResult.criticalTrainingBonus.guaranteedLootDrop ?? null) as unknown as object,
        injectedDungeonRunId: activeParticipation?.dungeonRunId ?? null,
        channeledRaidInstanceId: validRaid?.id ?? null,
        sets: {
          create: evalResult.evaluatedSets
            .filter((es) => catalogByKey.has(es.exerciseId))
            .map((es, idx) => ({
              exerciseId: es.exerciseId,
              setNumber: idx + 1,
              reps: es.reps,
              weightKg: es.weightKg,
              rpe: es.rpe ?? body.sets[idx]?.rpe ?? null,
              isWarmup: es.isWarmup,
              setType: es.setType ?? (es.isWarmup ? 'WARMUP' : 'NORMAL'),
              supersetGroupId: es.supersetGroupId ?? null,
              calculatedE1RM: es.calculatedE1RM,
              relativeIntensity: es.relativeIntensity,
              isPersonalRecord: es.isPersonalRecord,
              prTypesBroken: es.prTypesBroken as unknown as object,
            })),
        },
      },
    });

    // 6B. Persist / Finalize Hybrid WorkoutSession & RewardPayload
    const sessionRow = body.sessionId
      ? await db.workoutSession.upsert({
          where: { id: body.sessionId },
          update: {
            workoutLogId: createdWorkout.id,
            phase: body.chestOpened ? 'IDLE' : 'LOOT_REVIEW',
            focusLockActive: false,
            focusOverrideCount: body.focusOverrideCount,
            completedAt: performedAt,
            reviewedAt: body.chestOpened ? performedAt : null,
          },
          create: {
            id: body.sessionId,
            userId: character.userId,
            characterId,
            workoutLogId: createdWorkout.id,
            gymName: body.gymName ?? null,
            phase: body.chestOpened ? 'IDLE' : 'LOOT_REVIEW',
            workoutType: body.workoutType,
            arrivalTrigger: body.arrivalTrigger,
            arrivalBoonMultiplier: ARRIVAL_BOON_MULTIPLIER,
            lowEnergyMode: body.lowEnergyMode,
            focusLockActive: false,
            focusOverrideCount: body.focusOverrideCount,
            startedAt: new Date(performedAt.getTime() - body.durationSeconds * 1000),
            completedAt: performedAt,
            reviewedAt: body.chestOpened ? performedAt : null,
          },
        })
      : await db.workoutSession.create({
          data: {
            userId: character.userId,
            characterId,
            workoutLogId: createdWorkout.id,
            gymName: body.gymName ?? null,
            phase: body.chestOpened ? 'IDLE' : 'LOOT_REVIEW',
            workoutType: body.workoutType,
            arrivalTrigger: body.arrivalTrigger,
            arrivalBoonMultiplier: ARRIVAL_BOON_MULTIPLIER,
            lowEnergyMode: body.lowEnergyMode,
            focusLockActive: false,
            focusOverrideCount: body.focusOverrideCount,
            startedAt: new Date(performedAt.getTime() - body.durationSeconds * 1000),
            completedAt: performedAt,
            reviewedAt: body.chestOpened ? performedAt : null,
          },
        });

    await db.rewardPayload.create({
      data: {
        workoutSessionId: sessionRow.id,
        workoutLogId: createdWorkout.id,
        characterId,
        totalTonnageKg: rewardPayload.totalTonnageKg,
        totalReps: rewardPayload.totalReps,
        workingSetCount: rewardPayload.workingSetCount,
        averageRpe: rewardPayload.averageRpe,
        arrivalBoonApplied: rewardPayload.arrivalBoonMultiplier,
        fatigueMultiplierApplied: rewardPayload.fatigueAndRestMultiplier,
        resilienceTriggered: rewardPayload.resilienceBonus.triggered,
        resilienceReason:
          rewardPayload.resilienceBonus.reason === 'NONE'
            ? null
            : rewardPayload.resilienceBonus.reason,
        resilienceBonusXp: rewardPayload.resilienceBonus.flatBonusXp,
        resilienceBonusGold: rewardPayload.resilienceBonus.flatBonusGold,
        effectiveTotalMultiplier: rewardPayload.effectiveTotalMultiplier,
        strengthXpAwarded: rewardPayload.finalXpByStat.STRENGTH,
        enduranceXpAwarded: rewardPayload.finalXpByStat.ENDURANCE,
        agilityXpAwarded: rewardPayload.finalXpByStat.AGILITY,
        totalGoldAwarded: rewardPayload.totalGoldAwarded,
        chestTier: rewardPayload.lootChest.tier,
        effortQualityScore: rewardPayload.lootChest.effortQualityScore,
        chestOpened: body.chestOpened,
        lootDrops: rewardPayload.lootChest.drops as unknown as object,
        characterProgression: rewardPayload.characterProgression as unknown as object,
      },
    });

    // 7. Upsert Updated Personal Records (`UserExercisePR`)
    for (const [exId, prSnap] of Object.entries(evalResult.updatedPRs)) {
      if (!catalogByKey.has(exId)) continue;
      await db.userExercisePR.upsert({
        where: {
          characterId_exerciseId: { characterId, exerciseId: exId },
        },
        update: {
          bestE1RM: prSnap.bestE1RM,
          bestSingleSetVolume: prSnap.bestSingleSetVolume,
          bestSessionVolume: prSnap.bestSessionVolume,
          maxRepsByWeight: prSnap.maxRepsByWeight as unknown as object,
          bestCardioDurationSecByZone: prSnap.bestCardioDurationSecByZone as unknown as object,
        },
        create: {
          userId: character.userId,
          characterId,
          exerciseId: exId,
          bestE1RM: prSnap.bestE1RM,
          bestSingleSetVolume: prSnap.bestSingleSetVolume,
          bestSessionVolume: prSnap.bestSessionVolume,
          maxRepsByWeight: prSnap.maxRepsByWeight as unknown as object,
          bestCardioDurationSecByZone: prSnap.bestCardioDurationSecByZone as unknown as object,
        },
      });
    }

    // 8. Deposit Guaranteed PR Crit Drop + Effort-Gated Chest Loot Drops into Inventory
    if (evalResult.criticalTrainingBonus.guaranteedLootDrop) {
      await depositLootToInventory(
        db,
        characterId,
        evalResult.criticalTrainingBonus.guaranteedLootDrop
      );
    }
    for (const chestDrop of rewardPayload.lootChest.drops) {
      await depositLootToInventory(db, characterId, chestDrop);
    }

    // 9. Inject Live Dungeon Buff if inside Active 24h Dungeon Window
    let injectedDungeonBuffs: DungeonWorkoutBuff[] = [];
    if (activeParticipation) {
      injectedDungeonBuffs = createLiveDungeonWorkoutBuff({
        workoutId: createdWorkout.id,
        characterId,
        workoutType: body.workoutType,
        averageHrZone: dominantHrZone,
        triggeredPrCrit: evalResult.criticalTrainingBonus.triggered,
      });

      const existingBuffs =
        (activeParticipation.dungeonRun.activeWorkoutBuffs as unknown as DungeonWorkoutBuff[]) ??
        [];
      await db.dungeonRun.update({
        where: { id: activeParticipation.dungeonRunId },
        data: {
          activeWorkoutBuffs: [...existingBuffs, ...injectedDungeonBuffs] as unknown as object,
        },
      });
    }

    // 10. Channel Workout Energy Damage into Active 7-Day Raid Boss if specified
    let raidEnergyDamageDealt = 0;
    if (validRaid && validRaid.status === 'ACTIVE') {
      raidEnergyDamageDealt = calculateWorkoutRaidEnergyDamage({
        strengthXp: rewardPayload.finalXpByStat.STRENGTH,
        enduranceXp: rewardPayload.finalXpByStat.ENDURANCE,
        agilityXp: rewardPayload.finalXpByStat.AGILITY,
        triggeredPrCrit: evalResult.criticalTrainingBonus.triggered,
      });
      const dmgBig = BigInt(raidEnergyDamageDealt);
      const nextHp = validRaid.currentHp > dmgBig ? validRaid.currentHp - dmgBig : 0n;

      await db.raidBossInstance.update({
        where: { id: validRaid.id },
        data: {
          currentHp: nextHp,
          totalRaidDamage: { increment: dmgBig },
          isDefeated: nextHp === 0n,
          status: nextHp === 0n ? 'DEFEATED' : 'ACTIVE',
        },
      });

      await db.raidParticipantContribution.upsert({
        where: {
          raidInstanceId_characterId: { raidInstanceId: validRaid.id, characterId },
        },
        update: {
          workoutEnergyDamage: { increment: dmgBig },
          totalContributionScore: { increment: dmgBig },
          workoutsChanneled: { increment: 1 },
        },
        create: {
          raidInstanceId: validRaid.id,
          characterId,
          workoutEnergyDamage: dmgBig,
          totalContributionScore: dmgBig,
          workoutsChanneled: 1,
        },
      });
    }

    // 10B. If verified via wearable hardware telemetry, tag Ironman mode if account has no existing Ironman character
    let characterGameMode = character.gameMode;
    if (effectiveIsHardwareVerified && character.gameMode !== 'IRONMAN_VERIFIED') {
      const existingIronman = typeof db.character.findFirst === 'function'
        ? await db.character.findFirst({
            where: { userId: character.userId, gameMode: 'IRONMAN_VERIFIED' },
          })
        : null;
      if (!existingIronman) {
        const updatedChar = await db.character.update({
          where: { id: characterId },
          data: { gameMode: 'IRONMAN_VERIFIED' },
        });
        characterGameMode = updatedChar.gameMode;
      }
    }

    return reply.status(201).send({
      workout: createdWorkout,
      evaluation: evalResult,
      rewardPayload,
      fatigueTransition,
      statProgressions: {
        STRENGTH: { ...strProg, isIronmanVerified: effectiveIsHardwareVerified },
        ENDURANCE: { ...endProg, isIronmanVerified: effectiveIsHardwareVerified },
        AGILITY: { ...agiProg, isIronmanVerified: effectiveIsHardwareVerified },
        ...(dexProg ? { DEXTERITY: { ...dexProg, isIronmanVerified: effectiveIsHardwareVerified } } : {}),
        ...(wisProg ? { WISDOM: { ...wisProg, isIronmanVerified: effectiveIsHardwareVerified } } : {}),
        ...(sprProg ? { SPIRIT: { ...sprProg, isIronmanVerified: effectiveIsHardwareVerified } } : {}),
        ...(conProg ? { CONSTITUTION: { ...conProg, isIronmanVerified: effectiveIsHardwareVerified } } : {}),
      },
      updatedStats,
      injectedDungeonBuffs,
      raidEnergyDamageDealt,
      gameMode: characterGameMode,
      isHardwareVerified: effectiveIsHardwareVerified,
      verificationSource: effectiveVerificationSource,
      ironmanVerification: {
        verified: effectiveIsHardwareVerified,
        status: effectiveIsHardwareVerified ? 'IRONMAN_VERIFIED' : 'UNVERIFIED',
        source: effectiveVerificationSource,
        details: verificationResultDetails,
      },
    });
  });
}
