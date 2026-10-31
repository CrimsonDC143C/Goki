import { HeartRateZone, SystemicFatigueCombatPenalty, WorkoutSessionType } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

export const MS_PER_HOUR = 60 * 60 * 1000;
export const TAVERN_REST_THRESHOLD_HOURS = 24;

export const WELL_RESTED_MIN_BONUS = 0.10; // +10% XP upon entering Tavern State at 24h
export const WELL_RESTED_HOURLY_ACCRUAL = 0.0041667; // +10% per additional 24h (reaches +30% cap at 72h)
export const WELL_RESTED_MAX_MULTIPLIER = 1.30; // Max 1.30x from Tavern rest alone

export const ACTIVE_RECOVERY_XP_BONUS = 0.25; // +25% XP multiplier on next strenuous workout
export const ACTIVE_RECOVERY_FATIGUE_RELIEF = 35;

export const SYSTEMIC_FATIGUE_CONSECUTIVE_DAY_THRESHOLD = 5; // 5+ consecutive days triggers debuff
export const MAX_SYSTEMIC_FATIGUE_STACKS = 5;

// ============================================================================
// INTERFACES
// ============================================================================

export interface FatigueStateSnapshot {
  isRestingInTavern: boolean;
  tavernEnteredAt: Date | null;
  lastStrenuousWorkoutAt: Date | null;
  lastWorkoutAt: Date | null;
  consecutiveHighIntensityDays: number;
  lastHighIntensityDayKey: string | null; // UTC YYYY-MM-DD
  systemicFatigueStacks: number;
  fatigueScore: number; // 0..100
  wellRestedMultiplier: number; // >= 1.0
  activeRecoveryBuffActive: boolean;
  activeRecoveryGrantedAt: Date | null;
}

export interface WorkoutTimestampEvent {
  performedAt: Date;
  workoutType: WorkoutSessionType;
  averageHrZone?: HeartRateZone;
  hasResistanceSets?: boolean;
}

export interface WorkoutFatigueTransitionResult {
  /** Multiplier to apply to THIS workout's XP (includes Well-Rested + Active Recovery if strenuous) */
  xpMultiplierForThisWorkout: number;
  /** Updated persistent fatigue/rest state after logging this workout */
  nextState: FatigueStateSnapshot;
  /** Resulting in-game combat multipliers/penalties */
  combatPenalties: SystemicFatigueCombatPenalty;
}

// ============================================================================
// HELPERS
// ============================================================================

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function roundTo2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function diffUtcCalendarDays(earlierDayKey: string, laterDayKey: string): number {
  const d1 = new Date(`${earlierDayKey}T00:00:00.000Z`).getTime();
  const d2 = new Date(`${laterDayKey}T00:00:00.000Z`).getTime();
  return Math.round((d2 - d1) / (24 * MS_PER_HOUR));
}

export function createInitialFatigueState(now: Date = new Date()): FatigueStateSnapshot {
  return {
    isRestingInTavern: true,
    tavernEnteredAt: new Date(now.getTime()),
    lastStrenuousWorkoutAt: null,
    lastWorkoutAt: null,
    consecutiveHighIntensityDays: 0,
    lastHighIntensityDayKey: null,
    systemicFatigueStacks: 0,
    fatigueScore: 0,
    wellRestedMultiplier: 1.0,
    activeRecoveryBuffActive: false,
    activeRecoveryGrantedAt: null,
  };
}

/**
 * Determines whether a session is:
 * - `isActiveRecovery`: Dedicated recovery session (stretching, yoga, mobility, or Zone 1 recovery)
 * - `isStrenuous`: Heavy lifting or Zone 3-5 cardio (interrupts Tavern Rest & consumes XP buffs)
 * - `isHighIntensity`: Heavy lifting or Zone 4-5 cardio (counts toward 5-6+ day Systemic Fatigue streak)
 */
export function classifyWorkoutIntensity(event: WorkoutTimestampEvent): {
  isActiveRecovery: boolean;
  isStrenuous: boolean;
  isHighIntensity: boolean;
} {
  if (event.workoutType === 'ACTIVE_RECOVERY') {
    return {
      isActiveRecovery: true,
      isStrenuous: false,
      isHighIntensity: false,
    };
  }

  const hasLifting =
    event.workoutType === 'RESISTANCE' ||
    event.workoutType === 'HYBRID' ||
    Boolean(event.hasResistanceSets);

  const hrZone = event.averageHrZone;
  const isZone3Plus = hrZone !== undefined && hrZone >= 3;
  const isZone4Plus =
    event.workoutType === 'CARDIO_HIGH_INTENSITY' || (hrZone !== undefined && hrZone >= 4);

  return {
    isActiveRecovery: false,
    isStrenuous: hasLifting || isZone3Plus,
    isHighIntensity: hasLifting || isZone4Plus,
  };
}

/**
 * Computes in-game combat multipliers from current Systemic Fatigue stacks.
 * Each stack reduces combat accuracy, dodge, and overall stat effectiveness.
 */
export function getSystemicFatigueCombatPenalties(stacks: number): SystemicFatigueCombatPenalty {
  const clampedStacks = clamp(Math.floor(stacks), 0, MAX_SYSTEMIC_FATIGUE_STACKS);
  if (clampedStacks === 0) {
    return {
      stacks: 0,
      accuracyMultiplier: 1.0,
      dodgeMultiplier: 1.0,
      statEffectivenessMultiplier: 1.0,
    };
  }

  return {
    stacks: clampedStacks,
    accuracyMultiplier: roundTo2(Math.max(0.70, 1.0 - clampedStacks * 0.05)),
    dodgeMultiplier: roundTo2(Math.max(0.65, 1.0 - clampedStacks * 0.06)),
    statEffectivenessMultiplier: roundTo2(Math.max(0.70, 1.0 - clampedStacks * 0.05)),
  };
}

/**
 * Projects a character's rest & fatigue state forward to `evaluationTime` based purely on
 * elapsed time since their last strenuous workout (Automatic 24h+ Tavern State detection).
 */
export function evaluateFatigueStateAtTime(
  state: FatigueStateSnapshot,
  evaluationTime: Date
): FatigueStateSnapshot {
  if (!state.lastStrenuousWorkoutAt) {
    return {
      ...state,
      isRestingInTavern: true,
      tavernEnteredAt: state.tavernEnteredAt ?? new Date(evaluationTime.getTime()),
    };
  }

  const elapsedMs = evaluationTime.getTime() - state.lastStrenuousWorkoutAt.getTime();
  const elapsedHours = elapsedMs / MS_PER_HOUR;

  if (elapsedHours < TAVERN_REST_THRESHOLD_HOURS) {
    return { ...state };
  }

  // 24+ hours elapsed without heavy lifting or Zone 3-5 cardio -> Automatic Tavern Resting State
  const tavernEnteredAt = new Date(
    state.lastStrenuousWorkoutAt.getTime() + TAVERN_REST_THRESHOLD_HOURS * MS_PER_HOUR
  );
  const hoursInTavern = Math.max(0, elapsedHours - TAVERN_REST_THRESHOLD_HOURS);

  // Build Well-Rested XP Multiplier: 1.10x at 24h -> up to 1.30x at 72h+
  const accruedWellRested = Math.min(
    WELL_RESTED_MAX_MULTIPLIER,
    1.0 + WELL_RESTED_MIN_BONUS + hoursInTavern * WELL_RESTED_HOURLY_ACCRUAL
  );
  const wellRestedMultiplier = roundTo2(Math.max(state.wellRestedMultiplier, accruedWellRested));

  // Clear acute fatigue score gradually while in Tavern (-1.25 fatigue pts per hour in Tavern)
  const fatigueCleared = hoursInTavern * 1.25;
  const projectedFatigueScore = roundTo2(clamp(state.fatigueScore - fatigueCleared, 0, 100));

  // Systemic fatigue stacks decay as full rest days elapse:
  // At 36h+ since last strenuous workout (~1 missed training day), streak breaks & 1 stack clears,
  // plus 1 additional stack cleared per extra 24h rested.
  let projectedStacks = state.systemicFatigueStacks;
  let projectedConsecutiveDays = state.consecutiveHighIntensityDays;

  if (elapsedHours >= 36) {
    projectedConsecutiveDays = 0;
    const restDaysCompleted = 1 + Math.floor((elapsedHours - 36) / 24);
    projectedStacks = Math.max(0, state.systemicFatigueStacks - restDaysCompleted);
  }

  return {
    ...state,
    isRestingInTavern: true,
    tavernEnteredAt,
    consecutiveHighIntensityDays: projectedConsecutiveDays,
    systemicFatigueStacks: projectedStacks,
    fatigueScore: projectedFatigueScore,
    wellRestedMultiplier,
  };
}

/**
 * Computes the combined XP multiplier currently waiting for the player's next strenuous workout.
 */
export function getAvailableStrenuousXpMultiplier(state: FatigueStateSnapshot): number {
  const wellRestedBonus = Math.max(0, state.wellRestedMultiplier - 1.0);
  const activeRecoveryBonus = state.activeRecoveryBuffActive ? ACTIVE_RECOVERY_XP_BONUS : 0;
  return roundTo2(1.0 + wellRestedBonus + activeRecoveryBonus);
}

/**
 * Transitions the Fatigue & Rest state when a player logs a new workout at `event.performedAt`.
 */
export function recordWorkoutInFatigueState(
  previousState: FatigueStateSnapshot,
  event: WorkoutTimestampEvent
): WorkoutFatigueTransitionResult {
  // First advance passive Tavern Rest & decay up to the timestamp of this workout
  const projected = evaluateFatigueStateAtTime(previousState, event.performedAt);
  const intensity = classifyWorkoutIntensity(event);

  // Case A: Dedicated Active Recovery Session (stretching, yoga, mobility, Zone 1 light cardio)
  if (intensity.isActiveRecovery) {
    const nextStacks = Math.max(0, projected.systemicFatigueStacks - 1);
    const nextState: FatigueStateSnapshot = {
      ...projected,
      lastWorkoutAt: new Date(event.performedAt.getTime()),
      // Active recovery resets consecutive high-intensity streak and accelerates fatigue removal
      consecutiveHighIntensityDays: 0,
      systemicFatigueStacks: nextStacks,
      fatigueScore: roundTo2(clamp(projected.fatigueScore - ACTIVE_RECOVERY_FATIGUE_RELIEF, 0, 100)),
      activeRecoveryBuffActive: true,
      activeRecoveryGrantedAt: new Date(event.performedAt.getTime()),
    };

    return {
      xpMultiplierForThisWorkout: 1.0,
      nextState,
      combatPenalties: getSystemicFatigueCombatPenalties(nextState.systemicFatigueStacks),
    };
  }

  // Case B: Light/Moderate Zone 2 Endurance Cardio (non-strenuous aerobic base)
  if (!intensity.isStrenuous) {
    const nextState: FatigueStateSnapshot = {
      ...projected,
      lastWorkoutAt: new Date(event.performedAt.getTime()),
      fatigueScore: roundTo2(clamp(projected.fatigueScore + 6, 0, 100)),
    };

    return {
      xpMultiplierForThisWorkout: 1.0,
      nextState,
      combatPenalties: getSystemicFatigueCombatPenalties(nextState.systemicFatigueStacks),
    };
  }

  // Case C: Strenuous Workout (Heavy Lifting or Zone 3-5 Cardio)
  // Consumes accumulated Well-Rested + Active Recovery XP multipliers!
  const xpMultiplierForThisWorkout = getAvailableStrenuousXpMultiplier(projected);

  let nextConsecutiveDays = projected.consecutiveHighIntensityDays;
  let nextLastHighDayKey = projected.lastHighIntensityDayKey;
  let nextStacks = projected.systemicFatigueStacks;

  if (intensity.isHighIntensity) {
    const currentDayKey = toUtcDayKey(event.performedAt);

    if (!projected.lastHighIntensityDayKey || projected.consecutiveHighIntensityDays === 0) {
      nextConsecutiveDays = 1;
      nextLastHighDayKey = currentDayKey;
    } else {
      const dayGap = diffUtcCalendarDays(projected.lastHighIntensityDayKey, currentDayKey);
      if (dayGap <= 0) {
        // Second high-intensity session on the same calendar day: adds acute fatigue, same day count
        nextConsecutiveDays = projected.consecutiveHighIntensityDays;
      } else if (dayGap === 1) {
        // Back-to-back day without rest
        nextConsecutiveDays = projected.consecutiveHighIntensityDays + 1;
        nextLastHighDayKey = currentDayKey;
      } else {
        // At least 1 full calendar rest day intervened -> streak resets cleanly to Day 1
        nextConsecutiveDays = 1;
        nextLastHighDayKey = currentDayKey;
        nextStacks = Math.max(0, nextStacks - (dayGap - 1));
      }
    }

    // Apply stacking Systemic Fatigue Debuff on 5+ consecutive high-intensity days
    if (nextConsecutiveDays >= SYSTEMIC_FATIGUE_CONSECUTIVE_DAY_THRESHOLD) {
      const earnedStacks = nextConsecutiveDays - (SYSTEMIC_FATIGUE_CONSECUTIVE_DAY_THRESHOLD - 1);
      nextStacks = clamp(Math.max(nextStacks, earnedStacks), 0, MAX_SYSTEMIC_FATIGUE_STACKS);
    }
  }

  const acuteFatigueAdded = intensity.isHighIntensity ? 18 : 12;

  const nextState: FatigueStateSnapshot = {
    isRestingInTavern: false,
    tavernEnteredAt: null,
    lastStrenuousWorkoutAt: new Date(event.performedAt.getTime()),
    lastWorkoutAt: new Date(event.performedAt.getTime()),
    consecutiveHighIntensityDays: nextConsecutiveDays,
    lastHighIntensityDayKey: nextLastHighDayKey,
    systemicFatigueStacks: nextStacks,
    fatigueScore: roundTo2(clamp(projected.fatigueScore + acuteFatigueAdded, 0, 100)),
    // Temporary buffs consumed on this strenuous workout
    wellRestedMultiplier: 1.0,
    activeRecoveryBuffActive: false,
    activeRecoveryGrantedAt: null,
  };

  return {
    xpMultiplierForThisWorkout,
    nextState,
    combatPenalties: getSystemicFatigueCombatPenalties(nextState.systemicFatigueStacks),
  };
}

/**
 * Replays a chronological sequence of workouts and evaluates the final state at `evaluationTime`.
 */
export function evaluateWorkoutHistoryTimeline(
  events: readonly WorkoutTimestampEvent[],
  evaluationTime: Date
): {
  state: FatigueStateSnapshot;
  combatPenalties: SystemicFatigueCombatPenalty;
  availableNextWorkoutMultiplier: number;
} {
  const sorted = [...events].sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime());
  const initialAnchor = sorted[0]?.performedAt ?? evaluationTime;
  let state = createInitialFatigueState(initialAnchor);
  // Start clean without artificial initial Tavern offset before first workout
  state.wellRestedMultiplier = 1.0;

  for (const event of sorted) {
    if (event.performedAt.getTime() <= evaluationTime.getTime()) {
      const transition = recordWorkoutInFatigueState(state, event);
      state = transition.nextState;
    }
  }

  const finalState = evaluateFatigueStateAtTime(state, evaluationTime);
  return {
    state: finalState,
    combatPenalties: getSystemicFatigueCombatPenalties(finalState.systemicFatigueStacks),
    availableNextWorkoutMultiplier: getAvailableStrenuousXpMultiplier(finalState),
  };
}
