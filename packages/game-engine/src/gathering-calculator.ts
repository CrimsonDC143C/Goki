import { CoreStatBlock, StatType } from './types';

// ============================================================================
// CONSTANTS & BALANCING VALUES
// ============================================================================

/**
 * Base tick interval: 5 minutes (300,000 milliseconds / 300 seconds).
 */
export const BASE_TICK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Minimum tick interval floor: 1 minute (60,000 ms).
 */
export const MIN_TICK_INTERVAL_MS = 60 * 1000;

/**
 * Strict 2-hour gathering duration cap (7,200,000 ms).
 */
export const MAX_GATHERING_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Minimum duration: 1 minute.
 */
export const MIN_GATHERING_DURATION_MS = 60 * 1000;

export const BASE_XP_PER_TICK = 10;
export const BASE_YIELD_PER_TICK = 1;

export interface ProfessionStatAffinity {
  speedStat: StatType;
  yieldStat: StatType;
}

/**
 * Stat affinities per profession:
 * - FORAGING: Agility reduces tick time (dexterity/harvest speed), Endurance sustains yield.
 * - LOGGING: Endurance reduces tick time (swing cadence), Strength boosts yield.
 * - MINING: Endurance reduces tick time (dig cadence), Strength boosts yield (striking power).
 * - SMELTING: Endurance reduces tick time (furnace tending), Strength boosts yield.
 * - ALCHEMY: Agility reduces tick time (reagent precision), Agility boosts yield.
 */
export const PROFESSION_STAT_AFFINITIES: Record<string, ProfessionStatAffinity> = {
  FORAGING: { speedStat: 'AGILITY', yieldStat: 'ENDURANCE' },
  LOGGING: { speedStat: 'ENDURANCE', yieldStat: 'STRENGTH' },
  MINING: { speedStat: 'ENDURANCE', yieldStat: 'STRENGTH' },
  SMELTING: { speedStat: 'ENDURANCE', yieldStat: 'STRENGTH' },
  ALCHEMY: { speedStat: 'AGILITY', yieldStat: 'AGILITY' },
};

export const DEFAULT_PROFESSION_AFFINITY: ProfessionStatAffinity = {
  speedStat: 'AGILITY',
  yieldStat: 'STRENGTH',
};

// ============================================================================
// INTERFACES
// ============================================================================

export interface GatheringTickCalculation {
  /** Tick interval in milliseconds */
  tickInterval: number;
  /** Alias for tickInterval in milliseconds */
  tickIntervalMs: number;
  /** Tick interval in whole seconds */
  tickIntervalSeconds: number;
  /** Quantity of items yielded per successful tick */
  yieldPerTick: number;
  /** Profession / character XP awarded per tick */
  xpPerTick: number;
  /** The primary stat responsible for reducing tick interval */
  speedStat: StatType;
  /** The primary stat responsible for boosting yield */
  yieldStat: StatType;
  /** Percentage reduction applied to base tick interval (0 - 60%) */
  speedReductionPct: number;
  /** Human-readable string representation (e.g., "4m 30s") */
  formattedInterval: string;
}

export interface ProjectedGatheringYield {
  /** Total number of ticks completed within the duration */
  totalTicks: number;
  /** Alias for totalTicks */
  totalSteps: number;
  /** Exact item yield projected across all completed ticks */
  totalYield: number;
  /** Total projected XP across all completed ticks */
  totalXp: number;
  /** The duration in milliseconds that was evaluated */
  durationMs: number;
  /** Milliseconds left over after the last completed tick */
  remainderMs: number;
}

export interface ElapsedTicksCalculation {
  /** How many new ticks occurred between last processed time and effective end */
  elapsedTicks: number;
  /** Total ticks completed since the task started */
  totalCompletedTicks: number;
  /** Total item yield accumulated from the new elapsed ticks */
  newYieldAmount: number;
  /** Total XP accumulated from the new elapsed ticks */
  newXpAmount: number;
  /** Updated timestamp to record as lastTickProcessedAt */
  newLastTickProcessedAtMs: number;
  /** Whether the task has reached its final completion time */
  isCompleted: boolean;
}

// ============================================================================
// HELPER FORMATTERS
// ============================================================================

/**
 * Formats a duration in milliseconds into a concise "Xm Ys" string (e.g. 270,000ms -> "4m 30s").
 */
export function formatTickInterval(intervalMs: number): string {
  const safeMs = Math.max(0, Math.round(intervalMs));
  const totalSeconds = Math.round(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  if (seconds === 0) {
    return `${minutes}m 00s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/**
 * Formats milliseconds into human-readable duration (e.g. 5,400,000 -> "90 minutes").
 */
export function formatDurationSummary(durationMs: number): string {
  const totalMinutes = Math.round(Math.max(0, durationMs) / (60 * 1000));
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${hours}h ${mins}m`;
}

// ============================================================================
// DETERMINISTIC ENGINE FUNCTIONS
// ============================================================================

/**
 * Calculates gathering efficiency per tick based on character stats, profession level,
 * node difficulty, and node type.
 *
 * - Tick Interval: Base 5 minutes per tick (300,000ms). Scaled down (faster ticks) based on
 *   the relevant speed stat (e.g., Agility reduces Foraging tick time, Endurance reduces Logging/Mining tick time).
 * - Yield Per Tick: Base 1 item per tick. Scaled up based on the relevant yield stat
 *   (e.g., Strength increases Mining yield per tick) and the character's Profession Level.
 */
export function calculateGatheringTick(
  characterStats: CoreStatBlock | { strengthLevel: number; enduranceLevel: number; agilityLevel: number },
  professionLevel = 1,
  nodeDifficulty = 1,
  nodeType = 'MINING'
): GatheringTickCalculation {
  const safeProfLevel = Math.max(1, Math.floor(professionLevel));
  const safeDifficulty = Math.max(1, Math.floor(nodeDifficulty));
  const normalizedType = (nodeType ?? '').toUpperCase().trim();

  const affinity = PROFESSION_STAT_AFFINITIES[normalizedType] ?? DEFAULT_PROFESSION_AFFINITY;

  // Retrieve stat values
  const getStat = (stat: StatType): number => {
    switch (stat) {
      case 'STRENGTH':
        return Math.max(1, characterStats.strengthLevel ?? 1);
      case 'ENDURANCE':
        return Math.max(1, characterStats.enduranceLevel ?? 1);
      case 'AGILITY':
        return Math.max(1, characterStats.agilityLevel ?? 1);
      default:
        return 1;
    }
  };

  const speedStatValue = getStat(affinity.speedStat);
  const yieldStatValue = getStat(affinity.yieldStat);

  // 1. Calculate Tick Interval
  // Base 300s (5m 00s). Each effective stat point above difficulty provides a 2.5% tick speed reduction,
  // capped at 60% total reduction (floor of 120s / 60s minimum absolute floor).
  // Example: At effective stat diff 4: 4 * 2.5% = 10% reduction -> 270s = 4m 30s.
  const effectiveSpeedDiff = Math.max(0, speedStatValue - safeDifficulty);
  const speedReductionPctDecimal = Math.min(0.6, effectiveSpeedDiff * 0.025);
  const speedReductionPct = Math.round(speedReductionPctDecimal * 100);

  const rawTickIntervalMs = Math.round(BASE_TICK_INTERVAL_MS * (1 - speedReductionPctDecimal));
  const tickIntervalMs = Math.max(MIN_TICK_INTERVAL_MS, rawTickIntervalMs);
  const tickIntervalSeconds = Math.round(tickIntervalMs / 1000);

  // 2. Calculate Yield Per Tick
  // Base 1 item per tick.
  // Yield stat bonus: +1 item for every 4 stat points above difficulty.
  // Profession level bonus: +1 item for every 3 profession levels above 1.
  const statYieldBonus = Math.floor(Math.max(0, yieldStatValue - safeDifficulty) / 4);
  const profYieldBonus = Math.floor(Math.max(0, safeProfLevel - 1) / 3);
  const yieldPerTick = Math.max(1, BASE_YIELD_PER_TICK + statYieldBonus + profYieldBonus);

  // 3. Calculate XP Per Tick
  // Base 10 + 2 * difficulty + (yieldStat * 0.5) + (professionLevel * 1.0)
  const baseXp = BASE_XP_PER_TICK + safeDifficulty * 2;
  const bonusXp = Math.round(yieldStatValue * 0.5 + safeProfLevel * 1.0);
  const xpPerTick = Math.max(1, baseXp + bonusXp);

  return {
    tickInterval: tickIntervalMs,
    tickIntervalMs,
    tickIntervalSeconds,
    yieldPerTick,
    xpPerTick,
    speedStat: affinity.speedStat,
    yieldStat: affinity.yieldStat,
    speedReductionPct,
    formattedInterval: formatTickInterval(tickIntervalMs),
  };
}

/**
 * Returns the total steps/ticks and exact item yield for a given time block.
 *
 * @param tickInterval Tick interval in milliseconds
 * @param yieldPerTick Item yield per step
 * @param durationMs Total duration in milliseconds
 */
export function calculateProjectedYield(
  tickInterval: number,
  yieldPerTick: number,
  durationMs: number
): ProjectedGatheringYield {
  const safeInterval = Math.max(1, Math.round(tickInterval));
  const safeYield = Math.max(1, Math.floor(yieldPerTick));
  const safeDuration = Math.max(0, Math.floor(durationMs));

  if (safeDuration === 0 || safeInterval <= 0) {
    return {
      totalTicks: 0,
      totalSteps: 0,
      totalYield: 0,
      totalXp: 0,
      durationMs: safeDuration,
      remainderMs: 0,
    };
  }

  const totalTicks = Math.floor(safeDuration / safeInterval);
  const totalYield = totalTicks * safeYield;
  const remainderMs = safeDuration % safeInterval;

  return {
    totalTicks,
    totalSteps: totalTicks,
    totalYield,
    totalXp: totalTicks * 15,
    durationMs: safeDuration,
    remainderMs,
  };
}

/**
 * Returns the exact time required (in milliseconds) to reach a specific resource amount.
 *
 * @param tickInterval Tick interval in milliseconds
 * @param yieldPerTick Item yield per step
 * @param targetYieldAmount Desired total item count
 */
export function calculateRequiredTimeForYield(
  tickInterval: number,
  yieldPerTick: number,
  targetYieldAmount: number
): number {
  const safeTarget = Math.max(0, Math.floor(targetYieldAmount));
  if (safeTarget <= 0) {
    return 0;
  }

  const safeInterval = Math.max(1, Math.round(tickInterval));
  const safeYield = Math.max(1, Math.floor(yieldPerTick));

  const requiredTicks = Math.ceil(safeTarget / safeYield);
  return requiredTicks * safeInterval;
}

/**
 * Pure, deterministic calculation of elapsed ticks between lastTickProcessedAt and current time.
 * Capped by the task's maximum duration (e.g. 2 hours or custom targetDurationMs).
 * Prevents double-dipping and eliminates drift.
 */
export function calculateElapsedGatheringTicks(params: {
  startedAtMs: number;
  lastTickProcessedAtMs: number;
  currentTimeMs: number;
  targetDurationMs: number;
  tickIntervalMs: number;
  yieldPerTick: number;
  xpPerTick?: number;
}): ElapsedTicksCalculation {
  const {
    startedAtMs,
    lastTickProcessedAtMs,
    currentTimeMs,
    targetDurationMs,
    tickIntervalMs,
    yieldPerTick,
    xpPerTick = 15,
  } = params;

  const safeInterval = Math.max(1, tickIntervalMs);
  const safeYield = Math.max(1, yieldPerTick);
  const safeDuration = Math.max(0, targetDurationMs);
  const completesAtMs = startedAtMs + safeDuration;

  // Effective timestamp capped at completion time
  const effectiveNowMs = Math.min(currentTimeMs, completesAtMs);
  const safeLastProcessedMs = Math.max(startedAtMs, Math.min(lastTickProcessedAtMs, completesAtMs));

  if (effectiveNowMs <= safeLastProcessedMs) {
    const totalCompletedTicks = Math.floor((safeLastProcessedMs - startedAtMs) / safeInterval);
    return {
      elapsedTicks: 0,
      totalCompletedTicks,
      newYieldAmount: 0,
      newXpAmount: 0,
      newLastTickProcessedAtMs: safeLastProcessedMs,
      isCompleted: currentTimeMs >= completesAtMs,
    };
  }

  const ticksPrior = Math.floor((safeLastProcessedMs - startedAtMs) / safeInterval);
  const ticksCurrent = Math.floor((effectiveNowMs - startedAtMs) / safeInterval);
  const elapsedTicks = Math.max(0, ticksCurrent - ticksPrior);

  const newLastTickProcessedAtMs = startedAtMs + ticksCurrent * safeInterval;
  const newYieldAmount = elapsedTicks * safeYield;
  const newXpAmount = elapsedTicks * xpPerTick;
  const isCompleted = currentTimeMs >= completesAtMs;

  return {
    elapsedTicks,
    totalCompletedTicks: ticksCurrent,
    newYieldAmount,
    newXpAmount,
    newLastTickProcessedAtMs,
    isCompleted,
  };
}
