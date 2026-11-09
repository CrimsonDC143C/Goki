import { describe, expect, it } from 'vitest';
import {
  TRAINING_METRIC_TOOLTIPS,
  calculateBarbellPlatesPerSide,
  calculateProgressiveOverloadTarget,
  calculateWeeklyMuscleVolumeLandmarks,
  classifyExercisePlateBehavior,
  convertDisplayWeightToKg,
  convertKgToDisplayWeight,
  formatCompactPrevPill,
  generateRampedWarmupSets,
  kgToLbs,
  lbsToKg,
  normalizeGymId,
  resolveActiveSetTargetWeightKg,
  resolveExerciseDefaultBarWeightKg,
  resolveExerciseMachineLoadMode,
  resolveExerciseStickyNote,
  resolveExerciseWeightUnit,
  resolveGhostRowForSetOrder,
  resolvePreviousExerciseSessionSets,
  upsertExerciseMachineLoadMode,
  upsertExerciseStickyNote,
  upsertExerciseWeightUnit,
  CompletedWorkoutRecord,
} from '../src';

describe('intra-workout-ergonomics engine', () => {
  it('normalizes gym IDs across geofence and UI slugs and round-trips kg <-> lbs without drift', () => {
    expect(normalizeGymId('gym_iron_sanctum')).toBe('iron-sanctum');
    expect(normalizeGymId('Iron-Sanctum')).toBe('iron-sanctum');
    expect(normalizeGymId('gym_titan_foundry')).toBe('titan-foundry');

    for (const lbs of [45, 95, 135, 165.5, 225, 315]) {
      const kg = lbsToKg(lbs);
      expect(kgToLbs(kg, 0.5)).toBe(lbs);
      expect(convertKgToDisplayWeight(convertDisplayWeightToKg(lbs, 'LBS'), 'LBS')).toBe(lbs);
    }

    expect(
      formatCompactPrevPill({ weightKg: 75, reps: 8, unit: 'KG', rpe: 8.5 })
    ).toEqual({ mainText: '75×8', rpeSubText: '@8.5' });

    expect(
      formatCompactPrevPill({ weightKg: 0, reps: 12, unit: 'LBS', rpe: null })
    ).toEqual({ mainText: 'BW×12', rpeSubText: null });
  });

  it('resolves gym-aware sticky notes and unit overrides with graceful cross-gym fallback', () => {
    let prefs = upsertExerciseStickyNote(undefined, {
      exerciseId: 'dual_cable_chest_fly',
      note: 'Pin 6, bench 30 deg',
      activeGymId: 'gym_iron_sanctum',
      activeGymName: 'Iron Sanctum Barbell Club',
    });

    prefs = upsertExerciseStickyNote(prefs, {
      exerciseId: 'dual_cable_chest_fly',
      note: 'Pin 8 (2:1 pulley stack)',
      activeGymId: 'titan-foundry',
      activeGymName: 'Titan Foundry Gym',
    });

    // At Iron Sanctum -> gets Iron Sanctum note + lists Titan Foundry in otherGymNotes
    const atSanctum = resolveExerciseStickyNote(prefs, 'dual_cable_chest_fly', 'iron-sanctum');
    expect(atSanctum.source).toBe('ACTIVE_GYM');
    expect(atSanctum.note).toBe('Pin 6, bench 30 deg');
    expect(atSanctum.otherGymNotes).toHaveLength(1);
    expect(atSanctum.otherGymNotes[0]?.gymId).toBe('titan-foundry');

    // At Home Outpost (no gym-specific note) -> falls back to globalNote seeded on first save
    const atHome = resolveExerciseStickyNote(prefs, 'dual_cable_chest_fly', 'home-outpost');
    expect(atHome.source).toBe('GLOBAL');
    expect(atHome.note).toBe('Pin 6, bench 30 deg');

    // Gym-specific unit override (e.g., LBS cable stack at Titan Foundry, KG at Iron Sanctum)
    prefs = upsertExerciseWeightUnit(prefs, {
      exerciseId: 'dual_cable_chest_fly',
      unit: 'KG',
      activeGymId: 'iron-sanctum',
    });
    prefs = upsertExerciseWeightUnit(prefs, {
      exerciseId: 'dual_cable_chest_fly',
      unit: 'LBS',
      activeGymId: 'titan-foundry',
    });

    expect(resolveExerciseWeightUnit(prefs, 'dual_cable_chest_fly', 'iron-sanctum')).toBe('KG');
    expect(resolveExerciseWeightUnit(prefs, 'dual_cable_chest_fly', 'titan-foundry')).toBe('LBS');
  });

  it('prioritizes activeGymId for PREV set lookup while falling back globally and aligning working sets independently of warmups', () => {
    const history: CompletedWorkoutRecord[] = [
      {
        id: 'wk_commercial_recent',
        source: 'OFFLINE',
        gymId: 'titan-foundry',
        gymName: 'Titan Foundry Gym',
        performedAtIso: '2026-11-05T10:00:00.000Z',
        durationSeconds: 3000,
        exercises: [
          {
            exerciseId: 'dual_cable_lat_pulldown',
            exerciseName: 'Dual Cable Lat Pulldown',
            sets: [
              { weightKg: 40, reps: 10, setType: 'WARMUP', isWarmup: true },
              { weightKg: 80, reps: 10, rpe: 8.5, setType: 'NORMAL' },
              { weightKg: 80, reps: 9, rpe: 9.0, setType: 'NORMAL' },
            ],
          },
        ],
      },
      {
        id: 'wk_sanctum_older',
        source: 'ONLINE',
        gymId: 'iron-sanctum',
        gymName: 'Iron Sanctum Barbell Club',
        performedAtIso: '2026-11-01T10:00:00.000Z',
        durationSeconds: 3000,
        exercises: [
          {
            exerciseId: 'dual_cable_lat_pulldown',
            exerciseName: 'Dual Cable Lat Pulldown',
            sets: [
              { weightKg: 62.5, reps: 10, rpe: 8.0, setType: 'NORMAL' },
              { weightKg: 62.5, reps: 10, rpe: 8.5, setType: 'NORMAL' },
            ],
          },
        ],
      },
    ];

    // At Iron Sanctum -> matches older Iron Sanctum session instead of Titan Foundry's 2:1 stack!
    const sanctumLookup = resolvePreviousExerciseSessionSets({
      exerciseId: 'dual_cable_lat_pulldown',
      workoutHistory: history,
      activeGymId: 'gym_iron_sanctum',
    });
    expect(sanctumLookup.matchedActiveGym).toBe(true);
    expect(sanctumLookup.sourceWorkoutId).toBe('wk_sanctum_older');
    expect(sanctumLookup.workingSets[0]?.weightKg).toBe(62.5);

    // At Home Outpost -> falls back to newest overall session (Titan Foundry)
    const fallbackLookup = resolvePreviousExerciseSessionSets({
      exerciseId: 'dual_cable_lat_pulldown',
      workoutHistory: history,
      activeGymId: 'home-outpost',
    });
    expect(fallbackLookup.matchedActiveGym).toBe(false);
    expect(fallbackLookup.sourceWorkoutId).toBe('wk_commercial_recent');

    // Working row 0 still maps to workingSets[0] (80kg x 10) even if today has 3 warmups!
    const workRow0 = resolveGhostRowForSetOrder({
      lookup: fallbackLookup,
      setType: 'NORMAL',
      workingOrderIndex: 0,
      warmupOrderIndex: 0,
    });
    expect(workRow0?.weightKg).toBe(80);
    expect(workRow0?.reps).toBe(10);
  });

  it('computes RPE Double-Progression Overload Targets and PR Crit flags accurately', () => {
    const history: CompletedWorkoutRecord[] = [
      {
        id: 'wk_1',
        source: 'ONLINE',
        gymId: 'iron-sanctum',
        performedAtIso: '2026-11-04T10:00:00.000Z',
        durationSeconds: 2400,
        exercises: [
          {
            exerciseId: 'bench_press',
            exerciseName: 'Barbell Bench Press',
            sets: [{ weightKg: 80, reps: 8, rpe: 8.0, setType: 'NORMAL' }],
          },
          {
            exerciseId: 'cable_lateral_raise',
            exerciseName: 'Cable Lateral Raise',
            sets: [{ weightKg: 12.5, reps: 12, rpe: 8.5, setType: 'NORMAL' }],
          },
          {
            exerciseId: 'weighted_pullup',
            exerciseName: 'Weighted Pull-Ups',
            sets: [{ weightKg: 20, reps: 6, rpe: 9.5, setType: 'NORMAL' }],
          },
        ],
      },
    ];

    // RPE 8.0 compound -> Load progression (+2.5kg) + PR Crit!
    const benchTarget = calculateProgressiveOverloadTarget({
      exerciseId: 'bench_press',
      workoutHistory: history,
      activeGymId: 'iron-sanctum',
      isCompound: true,
      equipmentType: 'BARBELL',
    });
    expect(benchTarget.strategy).toBe('LOAD_PROGRESSION');
    expect(benchTarget.targetWeightKg).toBe(82.5);
    expect(benchTarget.targetReps).toBe(8);
    expect(benchTarget.triggersPrCrit).toBe(true);

    // RPE 8.5 isolation -> Rep progression (+1 rep at 12.5kg) + PR Crit!
    const latRaiseTarget = calculateProgressiveOverloadTarget({
      exerciseId: 'cable_lateral_raise',
      workoutHistory: history,
      activeGymId: 'iron-sanctum',
      isCompound: false,
      equipmentType: 'CABLE',
    });
    expect(latRaiseTarget.strategy).toBe('REP_PROGRESSION');
    expect(latRaiseTarget.targetWeightKg).toBe(12.5);
    expect(latRaiseTarget.targetReps).toBe(13);
    expect(latRaiseTarget.triggersPrCrit).toBe(true);

    // RPE 9.5 -> Micro-consolidation (hold 20kg x 6 cleanly)
    const pullupTarget = calculateProgressiveOverloadTarget({
      exerciseId: 'weighted_pullup',
      workoutHistory: history,
      activeGymId: 'iron-sanctum',
      isCompound: true,
    });
    expect(pullupTarget.strategy).toBe('MICRO_CONSOLIDATION');
    expect(pullupTarget.targetWeightKg).toBe(20);
    expect(pullupTarget.targetReps).toBe(6);
  });

  it('generates 1/2/3 ramped warmup sets and calculates per-side & landmine barbell plates', () => {
    const w1 = generateRampedWarmupSets({ workingWeightKg: 100, presetCount: 1, barWeightKg: 20 });
    expect(w1).toHaveLength(1);
    expect(w1[0]?.weightKg).toBe(65);

    const w3 = generateRampedWarmupSets({ workingWeightKg: 100, presetCount: 3, barWeightKg: 20 });
    expect(w3).toHaveLength(3);
    expect(w3.map((s) => s.weightKg)).toEqual([45, 65, 82.5]);

    // 100kg on 20kg Olympic bar => 40kg per side => 2 x 20kg per side
    const olympicPlates = calculateBarbellPlatesPerSide({
      targetWeightKg: 100,
      barWeightKg: 20,
      unit: 'KG',
    });
    expect(olympicPlates.loadingMode).toBe('PER_SIDE');
    expect(olympicPlates.plates).toEqual([
      { plateWeight: 20, count: 2, colorHex: '#2563EB' },
    ]);

    // 42.5kg on 0kg Landmine horn => single sleeve 1x25 + 1x15 + 1x2.5
    const landminePlates = calculateBarbellPlatesPerSide({
      targetWeightKg: 42.5,
      barWeightKg: 0,
      unit: 'KG',
    });
    expect(landminePlates.loadingMode).toBe('SINGLE_HORN');
    expect(landminePlates.achievableDisplayWeight).toBe(42.5);
  });

  it('aggregates weekly hard working sets per muscle group (excluding warmups) against MEV/MAV/MRV', () => {
    const nowMs = new Date('2026-11-06T12:00:00.000Z').getTime();
    const history: CompletedWorkoutRecord[] = [
      {
        id: 'wk_chest',
        source: 'ONLINE',
        performedAtIso: '2026-11-04T12:00:00.000Z',
        durationSeconds: 3000,
        exercises: [
          {
            exerciseId: 'bench_press',
            exerciseName: 'Barbell Bench Press',
            sets: [
              { weightKg: 50, reps: 8, setType: 'WARMUP', isWarmup: true },
              { weightKg: 80, reps: 8, setType: 'NORMAL' },
              { weightKg: 80, reps: 8, setType: 'NORMAL' },
              { weightKg: 80, reps: 8, setType: 'NORMAL' },
            ],
          },
          {
            exerciseId: 'dumbbell_flat_bench_press',
            exerciseName: 'Dumbbell Flat Bench Press',
            sets: Array.from({ length: 8 }, () => ({
              weightKg: 32,
              reps: 10,
              setType: 'NORMAL' as const,
            })),
          },
        ],
      },
    ];

    const landmarks = calculateWeeklyMuscleVolumeLandmarks({
      workoutHistory: history,
      referenceNowMs: nowMs,
    });

    const chest = landmarks.find((l) => l.muscleGroup === 'Chest')!;
    // 3 working sets bench + 8 working sets DB bench = 11 working sets (warmup excluded!)
    expect(chest.weeklyWorkingSets).toBe(11);
    expect(chest.zone).toBe('OPTIMAL_MAV');
    expect(TRAINING_METRIC_TOOLTIPS.MEV_MAV_MRV.title).toContain('MEV / MAV / MRV');
  });

  it('classifies MULTI_BAR vs MACHINE_STACK exercises, persists machine load toggles per gym, and tracks the next uncompleted set weight', () => {
    expect(
      classifyExercisePlateBehavior({
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Bench Press',
        equipmentType: 'BARBELL',
      })
    ).toBe('MULTI_BAR');

    expect(
      classifyExercisePlateBehavior({
        exerciseId: 'smith_incline_bench_press',
        exerciseName: 'Smith Machine Incline Bench Press',
        equipmentType: 'SMITH_MACHINE',
      })
    ).toBe('MULTI_BAR');

    expect(
      classifyExercisePlateBehavior({
        exerciseId: 'dual_cable_lat_pulldown',
        exerciseName: 'Dual Cable Lat Pulldown',
        equipmentType: 'DUAL_CABLE',
      })
    ).toBe('MACHINE_STACK');

    expect(
      classifyExercisePlateBehavior({
        exerciseId: 'machine_chest_press',
        exerciseName: 'Machine Chest Press',
        equipmentType: 'MACHINE',
      })
    ).toBe('MACHINE_STACK');

    let prefs = upsertExerciseMachineLoadMode(undefined, {
      exerciseId: 'machine_chest_press',
      mode: 'PLATE_LOADED',
      activeGymId: 'gym_iron_sanctum',
    });
    expect(resolveExerciseMachineLoadMode(prefs, 'machine_chest_press', 'iron-sanctum')).toBe(
      'PLATE_LOADED'
    );
    prefs = upsertExerciseMachineLoadMode(prefs, {
      exerciseId: 'machine_chest_press',
      mode: 'CABLE_STACK',
      activeGymId: 'iron-sanctum',
    });
    expect(resolveExerciseMachineLoadMode(prefs, 'machine_chest_press', 'iron-sanctum')).toBe(
      'CABLE_STACK'
    );

    expect(
      resolveExerciseDefaultBarWeightKg({
        exerciseId: 'machine_chest_press',
        exerciseName: 'Machine Chest Press',
        equipmentType: 'MACHINE',
      })
    ).toBe(0);
    expect(
      resolveExerciseDefaultBarWeightKg({
        exerciseId: 'smith_incline_bench_press',
        exerciseName: 'Smith Machine Incline Bench Press',
        equipmentType: 'SMITH_MACHINE',
      })
    ).toBe(10);

    const prevLookup = resolvePreviousExerciseSessionSets({
      exerciseId: 'bench_press',
      workoutHistory: [],
    });

    // Set 1 is uncompleted (135 lb), Set 2 is uncompleted (185 lb) => targets Set 1 (135 lb)
    const activeBeforeSet1 = resolveActiveSetTargetWeightKg({
      sets: [
        { weightKgStr: '135', completed: false, setType: 'NORMAL' },
        { weightKgStr: '185', completed: false, setType: 'NORMAL' },
      ],
      prevLookup,
      unit: 'LBS',
    });
    expect(activeBeforeSet1.targetSetIndex).toBe(0);
    expect(activeBeforeSet1.targetDisplayWeight).toBe(135);

    // Once Set 1 is checked off, automatically advances to Set 2 (185 lb)
    const activeAfterSet1 = resolveActiveSetTargetWeightKg({
      sets: [
        { weightKgStr: '135', completed: true, setType: 'NORMAL' },
        { weightKgStr: '185', completed: false, setType: 'NORMAL' },
      ],
      prevLookup,
      unit: 'LBS',
    });
    expect(activeAfterSet1.targetSetIndex).toBe(1);
    expect(activeAfterSet1.targetDisplayWeight).toBe(185);
  });
});
