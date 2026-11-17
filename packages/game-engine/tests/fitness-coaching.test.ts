import { describe, expect, it } from 'vitest';
import {
  MULTI_WEEK_WORKOUT_PROGRAMS,
  evaluateDeloadAlert,
  generateProgressiveOverloadCues,
  generateTrainerCoachingReport,
  recommendNextTrainingSplit,
  resolveProgramSessionPreset,
} from '../src/fitness-coaching';
import { FatigueStateSnapshot, createInitialFatigueState } from '../src/fatigue-manager';
import {
  HypertrophyMuscleGroup,
  MUSCLE_VOLUME_LANDMARKS,
  MuscleVolumeLandmarkStatus,
} from '../src/intra-workout-ergonomics';
import { CompletedWorkoutRecord } from '../src/training-history-tracker';
import { DEFAULT_EXERCISE_CATALOG, isWarmupSetType } from '../src/workout-presets-rest';

function makeLandmarks(
  overrides: Partial<Record<HypertrophyMuscleGroup, MuscleVolumeLandmarkStatus['zone']>>
): MuscleVolumeLandmarkStatus[] {
  return MUSCLE_VOLUME_LANDMARKS.map((cfg) => {
    const zone = overrides[cfg.muscleGroup] ?? 'UNDER_MEV';
    const setsByZone: Record<MuscleVolumeLandmarkStatus['zone'], number> = {
      UNDER_MEV: Math.max(0, cfg.mev - 2),
      MEV_TO_MAV: cfg.mev,
      OPTIMAL_MAV: cfg.mavLow,
      APPROACHING_MRV: cfg.mavHigh,
      OVER_MRV: cfg.mrv + 2,
    };
    const weeklyWorkingSets = setsByZone[zone];
    return {
      ...cfg,
      weeklyWorkingSets,
      zone,
      zoneLabel: zone,
      fillPercent: Math.min(100, Math.round((weeklyWorkingSets / cfg.mrv) * 100)),
    };
  });
}

function makeFatigue(overrides: Partial<FatigueStateSnapshot> = {}): FatigueStateSnapshot {
  return {
    ...createInitialFatigueState(new Date('2026-11-10T10:00:00.000Z')),
    ...overrides,
  };
}

describe('evaluateDeloadAlert', () => {
  it('returns NONE when volume and systemic fatigue are low', () => {
    const alert = evaluateDeloadAlert({
      landmarks: makeLandmarks({ Chest: 'OPTIMAL_MAV', Back: 'MEV_TO_MAV' }),
      fatigueState: makeFatigue({ fatigueScore: 20, systemicFatigueStacks: 0 }),
    });

    expect(alert.severity).toBe('NONE');
    expect(alert.shouldDeload).toBe(false);
    expect(alert.prescribedVolumeReductionPct).toBe(0);
    expect(alert.prescribedRpeCap).toBe(9.5);
  });

  it('returns WATCH when >= 2 muscles are approaching MRV or fatigue >= 55', () => {
    const alert = evaluateDeloadAlert({
      landmarks: makeLandmarks({
        Chest: 'APPROACHING_MRV',
        Back: 'APPROACHING_MRV',
      }),
      fatigueState: makeFatigue({ fatigueScore: 40 }),
    });

    expect(alert.severity).toBe('WATCH');
    expect(alert.shouldDeload).toBe(false);
    expect(alert.approachingMrvMuscles).toEqual(['Chest', 'Back']);
    expect(alert.prescribedVolumeReductionPct).toBe(15);
    expect(alert.prescribedRpeCap).toBe(8.5);
  });

  it('returns RECOMMENDED on 1 over-MRV muscle, 1 fatigue stack, or 4 consecutive high days', () => {
    const byOverMrv = evaluateDeloadAlert({
      landmarks: makeLandmarks({ Legs: 'OVER_MRV' }),
      fatigueState: makeFatigue({ fatigueScore: 45 }),
    });
    expect(byOverMrv.severity).toBe('RECOMMENDED');
    expect(byOverMrv.shouldDeload).toBe(true);
    expect(byOverMrv.overMrvMuscles).toEqual(['Legs']);
    expect(byOverMrv.prescribedVolumeReductionPct).toBe(35);
    expect(byOverMrv.prescribedRpeCap).toBe(7.0);

    const byStreak = evaluateDeloadAlert({
      landmarks: makeLandmarks({}),
      fatigueState: makeFatigue({ consecutiveHighIntensityDays: 4 }),
    });
    expect(byStreak.severity).toBe('RECOMMENDED');
    expect(byStreak.shouldDeload).toBe(true);
  });

  it('returns URGENT on >= 3 systemicFatigueStacks or >= 2 OVER_MRV muscles', () => {
    const byStacks = evaluateDeloadAlert({
      landmarks: makeLandmarks({}),
      fatigueState: makeFatigue({ systemicFatigueStacks: 3, fatigueScore: 72 }),
    });
    expect(byStacks.severity).toBe('URGENT');
    expect(byStacks.shouldDeload).toBe(true);
    expect(byStacks.prescribedVolumeReductionPct).toBe(50);
    expect(byStacks.prescribedRpeCap).toBe(6.5);

    const byMultiMrv = evaluateDeloadAlert({
      landmarks: makeLandmarks({ Chest: 'OVER_MRV', Arms: 'OVER_MRV' }),
      fatigueState: makeFatigue({ systemicFatigueStacks: 0, fatigueScore: 50 }),
    });
    expect(byMultiMrv.severity).toBe('URGENT');
    expect(byMultiMrv.overMrvMuscles).toEqual(['Chest', 'Arms']);
  });
});

describe('recommendNextTrainingSplit', () => {
  it('recommends ACTIVE_RECOVERY_DELOAD on urgent fatigue or >= 2 systemic stacks', () => {
    const landmarks = makeLandmarks({ Legs: 'UNDER_MEV' });
    const fatigueState = makeFatigue({ systemicFatigueStacks: 2, fatigueScore: 75 });
    const deloadAlert = evaluateDeloadAlert({ landmarks, fatigueState });

    const rec = recommendNextTrainingSplit({ landmarks, deloadAlert, fatigueState });
    expect(rec.splitType).toBe('ACTIVE_RECOVERY_DELOAD');
    expect(rec.suggestedCategory).toBe('RECOVERY');
    expect(rec.recommendedWorkingSetsPerMuscle).toBe(2);
  });

  it('recommends FULL_BODY_BALANCED when all 6 muscle groups are under/near baseline', () => {
    const landmarks = makeLandmarks({});
    const fatigueState = makeFatigue();
    const deloadAlert = evaluateDeloadAlert({ landmarks, fatigueState });

    const rec = recommendNextTrainingSplit({ landmarks, deloadAlert, fatigueState });
    expect(rec.splitType).toBe('FULL_BODY_BALANCED');
    expect(rec.suggestedCategory).toBe('GYM');
    expect(rec.priorityMuscles).toHaveLength(6);
  });

  it('recommends LOWER_LEGS_CORE when Legs and Core are UNDER_MEV while upper body is OPTIMAL_MAV', () => {
    const landmarks = makeLandmarks({
      Chest: 'OPTIMAL_MAV',
      Back: 'OPTIMAL_MAV',
      Shoulders: 'OPTIMAL_MAV',
      Arms: 'OPTIMAL_MAV',
      Legs: 'UNDER_MEV',
      Core: 'UNDER_MEV',
    });
    const fatigueState = makeFatigue();
    const deloadAlert = evaluateDeloadAlert({ landmarks, fatigueState });

    const rec = recommendNextTrainingSplit({ landmarks, deloadAlert, fatigueState });
    expect(rec.splitType).toBe('LOWER_LEGS_CORE');
    expect(rec.suggestedCategory).toBe('GYM');
    expect(rec.priorityMuscles).toEqual(['Legs', 'Core']);
  });

  it('recommends UPPER_PUSH_PULL when upper muscles are UNDER_MEV and lower is OPTIMAL_MAV', () => {
    const landmarks = makeLandmarks({
      Chest: 'UNDER_MEV',
      Back: 'UNDER_MEV',
      Shoulders: 'UNDER_MEV',
      Arms: 'UNDER_MEV',
      Legs: 'OPTIMAL_MAV',
      Core: 'OPTIMAL_MAV',
    });
    const fatigueState = makeFatigue();
    const deloadAlert = evaluateDeloadAlert({ landmarks, fatigueState });

    const rec = recommendNextTrainingSplit({ landmarks, deloadAlert, fatigueState });
    expect(rec.splitType).toBe('UPPER_PUSH_PULL');
    expect(rec.suggestedPresetId).toBe('preset_upper_a_push_pull');
    expect(rec.suggestedPresetSlug).toBe('upper_body_strength_hypertrophy_a');
  });

  it('recommends PULL_BACK_ARMS when Back/Arms lag behind Chest/Shoulders', () => {
    const landmarks = makeLandmarks({
      Chest: 'APPROACHING_MRV',
      Shoulders: 'OPTIMAL_MAV',
      Legs: 'OPTIMAL_MAV',
      Core: 'OPTIMAL_MAV',
      Back: 'UNDER_MEV',
      Arms: 'UNDER_MEV',
    });
    const fatigueState = makeFatigue();
    const deloadAlert = evaluateDeloadAlert({ landmarks, fatigueState });

    const rec = recommendNextTrainingSplit({ landmarks, deloadAlert, fatigueState });
    expect(rec.splitType).toBe('PULL_BACK_ARMS');
    expect(rec.suggestedPresetId).toBe('preset_upper_b_torso_arms');
    expect(rec.recoveringMuscles).toEqual(['Chest']);
  });

  it('recommends AEROBIC_CONDITIONING when all 6 muscles are OPTIMAL_MAV or higher without deload', () => {
    const landmarks = makeLandmarks({
      Chest: 'OPTIMAL_MAV',
      Back: 'OPTIMAL_MAV',
      Shoulders: 'OPTIMAL_MAV',
      Legs: 'OPTIMAL_MAV',
      Arms: 'OPTIMAL_MAV',
      Core: 'APPROACHING_MRV',
    });
    const fatigueState = makeFatigue({ fatigueScore: 30 });
    const deloadAlert = evaluateDeloadAlert({ landmarks, fatigueState });

    const rec = recommendNextTrainingSplit({ landmarks, deloadAlert, fatigueState });
    expect(rec.splitType).toBe('AEROBIC_CONDITIONING');
    expect(rec.suggestedCategory).toBe('CARDIO');
    expect(rec.suggestedPresetId).toBe('preset_cardio_tempo_cycling');
    expect(rec.suggestedPresetSlug).toBe('zone3_4_outdoor_tempo_cycling');
  });
});

describe('generateProgressiveOverloadCues', () => {
  const sampleHistory: CompletedWorkoutRecord[] = [
    {
      id: 'w_older',
      source: 'ONLINE',
      performedAtIso: '2026-11-05T10:00:00.000Z',
      durationSeconds: 3000,
      exercises: [
        {
          exerciseId: 'smith_incline_bench_press',
          exerciseName: 'Smith Machine Incline Bench Press',
          sets: [{ weightKg: 70, reps: 8, rpe: 8.0, setType: 'NORMAL' }],
        },
      ],
    },
    {
      id: 'w_newest',
      source: 'ONLINE',
      performedAtIso: '2026-11-09T10:00:00.000Z',
      durationSeconds: 3600,
      exercises: [
        {
          exerciseId: 'smith_incline_bench_press',
          exerciseName: 'Smith Machine Incline Bench Press',
          sets: [
            { weightKg: 90, reps: 10, rpe: 6.0, setType: 'WARMUP' },
            { weightKg: 75, reps: 8, rpe: 8.0, setType: 'NORMAL' },
            { weightKg: 75, reps: 8, rpe: 7.5, setType: 'NORMAL' },
          ],
        },
        {
          exerciseId: 'barbell_squat',
          exerciseName: 'Barbell Back Squat',
          sets: [
            { weightKg: 100, reps: 8, rpe: 8.0, setType: 'NORMAL' },
          ],
        },
        {
          exerciseId: 'weighted_pullup',
          exerciseName: 'Weighted Pull-Ups / Chin-Ups',
          sets: [
            { weightKg: 15, reps: 8, rpe: 8.5, setType: 'NORMAL' },
          ],
        },
        {
          exerciseId: 'dual_cable_chest_fly',
          exerciseName: 'Dual Cable Chest Fly',
          sets: [
            { weightKg: 25, reps: 12, rpe: 9.5, setType: 'FAILURE' },
          ],
        },
        {
          exerciseId: 'warmup_only_ex',
          exerciseName: 'Warmup Only Exercise',
          sets: [
            { weightKg: 20, reps: 12, rpe: 5.0, isWarmup: true },
          ],
        },
      ],
    },
  ];

  it('excludes warmups, uses newest session per exercise, and emits ADD_WEIGHT / ADD_REPS / CONSOLIDATE_LOAD', () => {
    const cues = generateProgressiveOverloadCues({ workoutHistory: sampleHistory });

    expect(cues.map((c) => c.exerciseId)).toEqual([
      'smith_incline_bench_press',
      'barbell_squat',
      'weighted_pullup',
      'dual_cable_chest_fly',
    ]);

    const inclineCue = cues[0];
    expect(inclineCue.previousWeightKg).toBe(75);
    expect(inclineCue.action).toBe('ADD_WEIGHT');
    expect(inclineCue.suggestedWeightKg).toBe(77.5);
    expect(inclineCue.lastPerformedAtIso).toBe('2026-11-09T10:00:00.000Z');

    const squatCue = cues[1];
    expect(squatCue.action).toBe('ADD_WEIGHT');
    expect(squatCue.suggestedWeightKg).toBe(105);

    const pullupCue = cues[2];
    expect(pullupCue.action).toBe('ADD_REPS');
    expect(pullupCue.suggestedWeightKg).toBe(15);
    expect(pullupCue.suggestedReps).toBe(9);

    const flyCue = cues[3];
    expect(flyCue.action).toBe('CONSOLIDATE_LOAD');
    expect(flyCue.suggestedWeightKg).toBe(25);
    expect(flyCue.suggestedReps).toBe(12);
  });

  it('emits DELOAD_BACKOFF when deloadAlert.shouldDeload is true', () => {
    const deloadAlert = evaluateDeloadAlert({
      landmarks: makeLandmarks({ Chest: 'OVER_MRV', Back: 'OVER_MRV' }),
      fatigueState: makeFatigue({ systemicFatigueStacks: 3 }),
    });

    const cues = generateProgressiveOverloadCues({
      workoutHistory: sampleHistory,
      deloadAlert,
      maxCues: 2,
    });

    expect(cues).toHaveLength(2);
    expect(cues[0].action).toBe('DELOAD_BACKOFF');
    expect(cues[0].suggestedWeightKg).toBe(65); // 75 * 0.85 = 63.75 -> 65
    expect(cues[0].targetRpe).toBe(6.5);
    expect(cues[1].action).toBe('DELOAD_BACKOFF');
    expect(cues[1].suggestedWeightKg).toBe(85); // 100 * 0.85 = 85
  });
});

describe('generateTrainerCoachingReport', () => {
  it('combines landmarks, projected fatigue, XP multiplier, split, and cues deterministically', () => {
    const referenceNowMs = Date.parse('2026-11-12T12:00:00.000Z');
    const workoutHistory: CompletedWorkoutRecord[] = [
      {
        id: 'w1',
        source: 'ONLINE',
        performedAtIso: '2026-11-10T12:00:00.000Z',
        durationSeconds: 3200,
        exercises: [
          {
            exerciseId: 'smith_incline_bench_press',
            exerciseName: 'Smith Machine Incline Bench Press',
            sets: [
              { weightKg: 75, reps: 8, rpe: 8.0, setType: 'NORMAL' },
              { weightKg: 75, reps: 8, rpe: 8.0, setType: 'NORMAL' },
              { weightKg: 75, reps: 8, rpe: 8.0, setType: 'NORMAL' },
            ],
          },
        ],
      },
    ];

    const fatigueState = makeFatigue({
      lastStrenuousWorkoutAt: new Date('2026-11-10T12:00:00.000Z'),
      isRestingInTavern: false,
      tavernEnteredAt: null,
      fatigueScore: 40,
      systemicFatigueStacks: 0,
      wellRestedMultiplier: 1.0,
      activeRecoveryBuffActive: true,
    });

    const report = generateTrainerCoachingReport({
      workoutHistory,
      fatigueState,
      referenceNowMs,
    });

    expect(report.generatedAtIso).toBe('2026-11-12T12:00:00.000Z');
    expect(report.landmarks).toHaveLength(6);
    expect(report.projectedFatigue.isRestingInTavern).toBe(true);
    expect(report.nextWorkoutXpMultiplier).toBeGreaterThan(1.25);
    expect(report.combatAccuracyPenaltyPct).toBe(0);
    expect(report.deloadAlert.severity).toBe('NONE');
    expect(report.splitRecommendation.splitType).toBe('FULL_BODY_BALANCED');
    expect(report.overloadCues).toHaveLength(1);
    expect(report.trainerDialoguePages).toHaveLength(3);
  });
});

describe('MULTI_WEEK_WORKOUT_PROGRAMS & resolveProgramSessionPreset', () => {
  it('defines 3 complete 4-week programs using real DEFAULT_EXERCISE_CATALOG slugs', () => {
    const validSlugs = new Set(DEFAULT_EXERCISE_CATALOG.map((e) => e.slug));
    expect(MULTI_WEEK_WORKOUT_PROGRAMS).toHaveLength(3);

    for (const program of MULTI_WEEK_WORKOUT_PROGRAMS) {
      expect(program.weeksCount).toBe(4);
      expect(program.weeks).toHaveLength(4);
      expect(program.days).toHaveLength(program.daysPerWeek);

      for (const day of program.days) {
        for (const block of day.basePreset.blocks.exerciseBlocks) {
          expect(validSlugs.has(block.exerciseSlug)).toBe(true);
        }
        for (const seg of day.basePreset.blocks.cardioSegments) {
          expect(validSlugs.has(seg.exerciseSlug)).toBe(true);
        }
      }
    }
  });

  it('scales working sets, loads, and RPE from Week 1 to Week 3 and deloads in Week 4', () => {
    const w1 = resolveProgramSessionPreset('program_iron_vanguard_upper_lower', 1, 0);
    const w3 = resolveProgramSessionPreset('program_iron_vanguard_upper_lower', 3, 0);
    const w4 = resolveProgramSessionPreset('program_iron_vanguard_upper_lower', 4, 0);

    expect(w1).not.toBeNull();
    expect(w3).not.toBeNull();
    expect(w4).not.toBeNull();

    const w1Block0 = w1!.blocks.exerciseBlocks[0]; // 1 warmup + 3 working sets
    const w3Block0 = w3!.blocks.exerciseBlocks[0];
    const w4Block0 = w4!.blocks.exerciseBlocks[0];

    expect(w1!.id).toBe('preset_upper_a_push_pull_w1');
    expect(w1!.name).toContain('W1');
    expect(w1Block0.sets.filter((s) => isWarmupSetType(s.setType))).toHaveLength(1);
    expect(w1Block0.sets.filter((s) => !isWarmupSetType(s.setType))).toHaveLength(3);
    expect(w1Block0.sets[1].targetWeightKg).toBe(75);
    expect(w1Block0.sets[1].targetRpe).toBe(8.0);

    expect(w3Block0.sets.filter((s) => isWarmupSetType(s.setType))).toHaveLength(1);
    expect(w3Block0.sets.filter((s) => !isWarmupSetType(s.setType))).toHaveLength(4);
    expect(w3Block0.sets[0].targetWeightKg).toBe(52.5); // 50 * 1.05
    expect(w3Block0.sets[1].targetWeightKg).toBe(79); // 75 * 1.05 = 78.75 -> 79.0
    expect(w3Block0.sets[1].targetRpe).toBe(9.0);

    expect(w4Block0.sets.filter((s) => !isWarmupSetType(s.setType))).toHaveLength(2);
    expect(w4Block0.sets[1].targetWeightKg).toBe(56.5); // 75 * 0.75 = 56.25 -> 56.5
    expect(w4Block0.sets[1].targetRpe).toBe(6.5);
  });

  it('reduces cardio segment duration by 30% and caps RPE during Week 4 deload', () => {
    const w1Cardio = resolveProgramSessionPreset('hybrid_ranger_4w_concurrent', 1, 1);
    const w4Cardio = resolveProgramSessionPreset('hybrid_ranger_4w_concurrent', 4, 1);

    expect(w1Cardio).not.toBeNull();
    expect(w4Cardio).not.toBeNull();
    expect(w1Cardio!.blocks.cardioSegments[0].targetDurationMinutes).toBe(45);
    expect(w4Cardio!.blocks.cardioSegments[0].targetDurationMinutes).toBe(32); // Math.round(45 * 0.7)
    expect(w4Cardio!.blocks.cardioSegments[0].targetRpe).toBe(6.5);
  });

  it('returns null for invalid programId, weekNumber, or dayIndex', () => {
    expect(resolveProgramSessionPreset('missing_program', 1, 0)).toBeNull();
    expect(resolveProgramSessionPreset('program_iron_vanguard_upper_lower', 99, 0)).toBeNull();
    expect(resolveProgramSessionPreset('program_iron_vanguard_upper_lower', 1, 99)).toBeNull();
  });
});
