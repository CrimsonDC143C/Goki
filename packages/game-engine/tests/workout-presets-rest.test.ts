import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXERCISE_CATALOG,
  DROP_SET_XP_MULTIPLIER,
  STARTER_WORKOUT_PRESETS,
  calculateDynamicRestPlan,
  calculateRecommendedRestSeconds,
  calculateStrengthSetXp,
  computeSupersetDisplayLabels,
  cycleSetType,
  resolvePresetTargetWeightKg,
  resolveSetCompletionTransition,
} from '../src';

describe('Workout Category, Supersets, Drop-Sets, Presets & Dynamic Rest Engine', () => {
  it('computes Dynamic Rest seconds accurately across Drop-Sets, Supersets, Warm-Ups, Compound & Cable sets', () => {
    // 1. Drop-Set chain immediate weight strip
    const dropPlan = calculateDynamicRestPlan({
      setType: 'NORMAL',
      nextSameExerciseSetIsDropSet: true,
      exerciseBaseXpFactor: 1.04,
      rpe: 9.0,
    });
    expect(dropPlan.mode).toBe('DROP_SET_TRANSITION');
    expect(dropPlan.suppressFullRestTimer).toBe(true);
    expect(dropPlan.headline).toContain('Immediate Drop Set');
    expect(dropPlan.seconds).toBeGreaterThanOrEqual(10);
    expect(dropPlan.seconds).toBeLessThanOrEqual(15);

    // 2. Superset intra-round transition (A1 -> A2)
    const supersetSec = calculateRecommendedRestSeconds({
      setType: 'NORMAL',
      isMidSupersetRound: true,
      nextSupersetMemberLabel: 'A2',
      nextSupersetExerciseName: 'Weighted Pull-Ups / Chin-Ups',
      exerciseBaseXpFactor: 1.16,
    });
    expect(supersetSec).toBeGreaterThanOrEqual(20);
    expect(supersetSec).toBeLessThanOrEqual(30);

    // 3. Warm-Up set (45s-60s)
    const warmupSec = calculateRecommendedRestSeconds({
      setType: 'WARMUP',
      exerciseBaseXpFactor: 1.16,
    });
    expect(warmupSec).toBeGreaterThanOrEqual(45);
    expect(warmupSec).toBeLessThanOrEqual(60);

    // 4. Heavy Compound working set: base 120 + 45 (I >= 0.85) + 30 (FAILURE / RPE 10) = 195s
    const heavyCompoundSec = calculateRecommendedRestSeconds({
      setType: 'FAILURE',
      exerciseBaseXpFactor: 1.16,
      relativeIntensity: 0.88,
    });
    expect(heavyCompoundSec).toBe(195);

    // 5. Moderate Compound working set: base 120 + 15 (0.75 <= I < 0.85) + 15 (RPE 8.5) = 150s
    const modCompoundSec = calculateRecommendedRestSeconds({
      setType: 'NORMAL',
      exerciseBaseXpFactor: 1.15,
      relativeIntensity: 0.78,
      rpe: 8.5,
    });
    expect(modCompoundSec).toBe(150);

    // 6. Light Cable Isolation set: base 75 - 30 (I < 0.65) - 15 (RPE 6.5) = 30 -> clamped to 45s!
    const lightCableSec = calculateRecommendedRestSeconds({
      setType: 'NORMAL',
      exerciseBaseXpFactor: 1.02,
      relativeIntensity: 0.55,
      rpe: 6.5,
    });
    expect(lightCableSec).toBe(45);
  });

  it('applies +10% metabolic XP bonus on DROP_SET and cycles set types cleanly', () => {
    const normal = calculateStrengthSetXp({
      weightKg: 25,
      reps: 12,
      referenceE1RM: 35,
      setType: 'NORMAL',
      exerciseBaseXpFactor: 1.04,
    });
    const drop = calculateStrengthSetXp({
      weightKg: 25,
      reps: 12,
      referenceE1RM: 35,
      setType: 'DROP_SET',
      exerciseBaseXpFactor: 1.04,
    });
    expect(drop.rawXp).toBeCloseTo(normal.rawXp * DROP_SET_XP_MULTIPLIER, 1);

    expect(cycleSetType('NORMAL')).toBe('WARMUP');
    expect(cycleSetType('WARMUP')).toBe('DROP_SET');
    expect(cycleSetType('DROP_SET')).toBe('FAILURE');
    expect(cycleSetType('FAILURE')).toBe('NORMAL');
  });

  it('labels Superset/Giant-Set brackets (A1/A2, B1/B2/B3) and resolves A1 -> A2 & Drop-Set transitions', () => {
    const blocks = [
      {
        blockId: 'b1',
        exerciseId: 'smith_incline_bench_press',
        exerciseName: 'Smith Machine Incline Bench Press',
        supersetGroupId: 'grp_1',
        sets: [
          { id: 's1', setType: 'NORMAL' as const, completed: true },
          { id: 's2', setType: 'NORMAL' as const, completed: false },
        ],
      },
      {
        blockId: 'b2',
        exerciseId: 'weighted_pullup',
        exerciseName: 'Weighted Pull-Ups',
        supersetGroupId: 'grp_1',
        sets: [
          { id: 's3', setType: 'NORMAL' as const, completed: false },
          { id: 's4', setType: 'DROP_SET' as const, completed: false },
        ],
      },
    ];

    const labels = computeSupersetDisplayLabels(blocks);
    expect(labels.b1?.memberLabel).toBe('A1');
    expect(labels.b2?.memberLabel).toBe('A2');
    expect(labels.b1?.groupSummaryLabel).toBe('Superset A: A1 / A2');

    // Completing A1 Set 1 transitions mid-round to A2 Set 1
    const afterA1 = resolveSetCompletionTransition({
      blocks,
      completedBlockId: 'b1',
      completedSetId: 's1',
    });
    expect(afterA1.isMidSupersetRound).toBe(true);
    expect(afterA1.nextFocusBlockId).toBe('b2');
    expect(afterA1.nextFocusSetId).toBe('s3');

    // Completing A2 Set 1 when A2 Set 2 is a DROP_SET prioritizes the immediate Drop-Set!
    const blocksAfterS3 = [
      blocks[0]!,
      {
        ...blocks[1]!,
        sets: [
          { id: 's3', setType: 'NORMAL' as const, completed: true },
          { id: 's4', setType: 'DROP_SET' as const, completed: false },
        ],
      },
    ];
    const afterParentBeforeDrop = resolveSetCompletionTransition({
      blocks: blocksAfterS3,
      completedBlockId: 'b2',
      completedSetId: 's3',
    });
    expect(afterParentBeforeDrop.nextSameExerciseSetIsDropSet).toBe(true);
    expect(afterParentBeforeDrop.nextFocusBlockId).toBe('b2');
    expect(afterParentBeforeDrop.nextFocusSetId).toBe('s4');
  });

  it('validates all 5 seeded starter presets against DEFAULT_EXERCISE_CATALOG and pre-fills recent weights', () => {
    expect(STARTER_WORKOUT_PRESETS).toHaveLength(5);
    const catalogSlugs = new Set(DEFAULT_EXERCISE_CATALOG.map((e) => e.slug));

    for (const preset of STARTER_WORKOUT_PRESETS) {
      for (const blk of preset.blocks.exerciseBlocks) {
        expect(catalogSlugs.has(blk.exerciseSlug)).toBe(true);
      }
      for (const seg of preset.blocks.cardioSegments) {
        expect(catalogSlugs.has(seg.exerciseSlug)).toBe(true);
      }
    }

    expect(
      resolvePresetTargetWeightKg({
        exerciseSlug: 'smith_incline_bench_press',
        setType: 'NORMAL',
        fallbackTargetWeightKg: 75,
        recentWorkingWeightByExercise: { smith_incline_bench_press: 82.5 },
      })
    ).toBe(82.5);
  });
});
