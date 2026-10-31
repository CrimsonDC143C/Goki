import { describe, expect, it } from 'vitest';
import {
  MS_PER_HOUR,
  createInitialFatigueState,
  evaluateFatigueStateAtTime,
  evaluateWorkoutHistoryTimeline,
  getAvailableStrenuousXpMultiplier,
  recordWorkoutInFatigueState,
} from '../src/fatigue-manager';

describe('fatigue-manager', () => {
  it('automatically enters Tavern Resting State after 24+ hours and accrues Well-Rested XP multiplier', () => {
    const t0 = new Date('2026-10-01T10:00:00.000Z');
    const initial = createInitialFatigueState(t0);

    // Log a strenuous resistance workout at t0
    const afterLift = recordWorkoutInFatigueState(initial, {
      performedAt: t0,
      workoutType: 'RESISTANCE',
      hasResistanceSets: true,
    });

    expect(afterLift.nextState.isRestingInTavern).toBe(false);
    expect(afterLift.nextState.wellRestedMultiplier).toBe(1.0);

    // 18 hours later: NOT yet in Tavern State (< 24h)
    const at18h = evaluateFatigueStateAtTime(
      afterLift.nextState,
      new Date(t0.getTime() + 18 * MS_PER_HOUR)
    );
    expect(at18h.isRestingInTavern).toBe(false);
    expect(at18h.wellRestedMultiplier).toBe(1.0);

    // 24 hours later: Automatically enters Tavern State with 1.10x Well-Rested buff
    const at24h = evaluateFatigueStateAtTime(
      afterLift.nextState,
      new Date(t0.getTime() + 24 * MS_PER_HOUR)
    );
    expect(at24h.isRestingInTavern).toBe(true);
    expect(at24h.wellRestedMultiplier).toBeCloseTo(1.10, 2);

    // 72 hours later: Caps Well-Rested multiplier at 1.30x
    const at96h = evaluateFatigueStateAtTime(
      afterLift.nextState,
      new Date(t0.getTime() + 96 * MS_PER_HOUR)
    );
    expect(at96h.wellRestedMultiplier).toBeCloseTo(1.30, 2);
  });

  it('grants +25% Active Recovery XP multiplier and consumes buffs on the next strenuous workout', () => {
    const t0 = new Date('2026-10-01T09:00:00.000Z');
    let state = createInitialFatigueState(t0);
    state.wellRestedMultiplier = 1.0;

    // Day 1: Heavy lifting
    state = recordWorkoutInFatigueState(state, {
      performedAt: t0,
      workoutType: 'RESISTANCE',
    }).nextState;

    // Day 2 (+26h): Player is in Tavern State (~1.11x) AND logs a dedicated Active Recovery yoga session (+0.25x)
    const tRecovery = new Date(t0.getTime() + 26 * MS_PER_HOUR);
    const recoveryTransition = recordWorkoutInFatigueState(state, {
      performedAt: tRecovery,
      workoutType: 'ACTIVE_RECOVERY',
      averageHrZone: 1,
    });

    expect(recoveryTransition.nextState.activeRecoveryBuffActive).toBe(true);
    expect(getAvailableStrenuousXpMultiplier(recoveryTransition.nextState)).toBeGreaterThanOrEqual(
      1.35
    );

    // Day 3 (+48h from t0): Next strenuous workout receives combined Well-Rested + Active Recovery multiplier, then resets buffs
    const tNextLift = new Date(t0.getTime() + 48 * MS_PER_HOUR);
    const nextLift = recordWorkoutInFatigueState(recoveryTransition.nextState, {
      performedAt: tNextLift,
      workoutType: 'RESISTANCE',
    });

    // 1.20 (48h Well-Rested) + 0.25 (Active Recovery) = 1.45x
    expect(nextLift.xpMultiplierForThisWorkout).toBeCloseTo(1.45, 2);
    expect(nextLift.nextState.activeRecoveryBuffActive).toBe(false);
    expect(nextLift.nextState.wellRestedMultiplier).toBe(1.0);
  });

  it('applies stacking Systemic Fatigue debuff on 5-6+ consecutive high-intensity days and clears it with rest/recovery', () => {
    const events = [
      { performedAt: new Date('2026-10-01T17:00:00.000Z'), workoutType: 'RESISTANCE' as const },
      {
        performedAt: new Date('2026-10-02T17:00:00.000Z'),
        workoutType: 'CARDIO_HIGH_INTENSITY' as const,
        averageHrZone: 5 as const,
      },
      { performedAt: new Date('2026-10-03T17:00:00.000Z'), workoutType: 'RESISTANCE' as const },
      { performedAt: new Date('2026-10-04T17:00:00.000Z'), workoutType: 'RESISTANCE' as const },
      // Day 5 -> 1st stack of Systemic Fatigue!
      {
        performedAt: new Date('2026-10-05T17:00:00.000Z'),
        workoutType: 'CARDIO_HIGH_INTENSITY' as const,
        averageHrZone: 4 as const,
      },
      // Day 6 -> 2nd stack of Systemic Fatigue!
      { performedAt: new Date('2026-10-06T17:00:00.000Z'), workoutType: 'RESISTANCE' as const },
    ];

    const day6Eval = evaluateWorkoutHistoryTimeline(
      events,
      new Date('2026-10-06T18:00:00.000Z')
    );

    expect(day6Eval.state.consecutiveHighIntensityDays).toBe(6);
    expect(day6Eval.state.systemicFatigueStacks).toBe(2);
    expect(day6Eval.combatPenalties.accuracyMultiplier).toBeLessThan(1.0);
    expect(day6Eval.combatPenalties.dodgeMultiplier).toBeLessThan(1.0);
    expect(day6Eval.combatPenalties.statEffectivenessMultiplier).toBeLessThan(1.0);

    // Taking 2 full rest days clears both Systemic Fatigue stacks and restores combat readiness
    const afterRestDays = evaluateWorkoutHistoryTimeline(
      events,
      new Date('2026-10-09T12:00:00.000Z')
    );
    expect(afterRestDays.state.consecutiveHighIntensityDays).toBe(0);
    expect(afterRestDays.state.systemicFatigueStacks).toBe(0);
    expect(afterRestDays.combatPenalties.statEffectivenessMultiplier).toBe(1.0);
  });
});
