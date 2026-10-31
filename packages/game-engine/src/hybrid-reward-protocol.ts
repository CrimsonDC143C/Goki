import { createSeededRng } from './rng';
import { HeartRateZone, ItemRarity, LootDrop, StatType, WorkoutSessionType } from './types';
import {
  CardioSegmentInput,
  EvaluatedResistanceSet,
  HistoricalExercisePR,
  PrRecordBreakType,
  StatLevelProgressionResult,
  WorkoutEvaluationResult,
  applyStatXpProgression,
  calculateE1RM,
  calculateStrengthSetXp,
  evaluateWorkoutSession,
} from './workout-calculator';
import {
  SetType,
  isWarmupSetType,
  resolveEffectiveSetRpe,
} from './workout-presets-rest';

// ============================================================================
// CONSTANTS — BEHAVIORAL NEUROSCIENCE & BALANCING PARAMETERS
// ============================================================================

/**
 * Phase 1: Equal 1.25x Arrival Boon across both Registered Gym Geofences and
 * Open-World sessions so home/outdoor athletes are never penalized.
 */
export const ARRIVAL_BOON_MULTIPLIER = 1.25;

/**
 * Phase 1 constraint: Threshold cue must auto-resolve in < 2,000ms without
 * loot prompts or menu distractions.
 */
export const ARRIVAL_BANNER_DURATION_MS = 1600;

/**
 * Phase 3 Anti-Streak Collapse ("What-The-Hell" Effect Prevention):
 * Grants a Resilience Bonus when returning from a >= 72h gap or completing a
 * workout on a self-reported low-energy / high-stress day.
 */
export const RESILIENCE_COMEBACK_THRESHOLD_HOURS = 72;
export const RESILIENCE_XP_MULTIPLIER_BONUS = 0.15;
export const RESILIENCE_FLAT_BONUS_XP = 50;
export const RESILIENCE_FLAT_BONUS_GOLD = 35;

/**
 * Effort-gated post-workout chest score thresholds (0..100 scale).
 * Driven by progressive overload, RPE/relative intensity, and consistency — NOT raw volume.
 */
export const EPIC_CHEST_SCORE_THRESHOLD = 70;
export const RARE_CHEST_SCORE_THRESHOLD = 42;

// ============================================================================
// CORE TYPES — FINITE STATE MACHINE & DATA ENTITIES
// ============================================================================

/**
 * Deliverable 1: Canonical 5-state Hybrid Reward Lifecycle Finite State Machine.
 */
export type HybridPhaseState =
  | 'Idle'
  | 'DungeonActive'
  | 'Resting'
  | 'DungeonComplete'
  | 'LootReview';

export type ArrivalTriggerType = 'GEOFENCE_GYM' | 'MANUAL_OPEN_WORLD';

export type LootChestTier = 'COMMON' | 'RARE' | 'EPIC';

export type SensoryCueType =
  | 'GUILD_THRESHOLD_PULSE'
  | 'OPEN_WORLD_THRESHOLD_PULSE'
  | 'SET_MICRO_REWARD_TICK'
  | 'STAMINA_RECHARGED_PULSE'
  | 'DUNGEON_CLEARED_FANFARE'
  | 'CHEST_OPEN_REVEAL';

export interface RegisteredGymLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface ArrivalBoon {
  multiplier: number;
  trigger: ArrivalTriggerType;
  gymId: string | null;
  gymName: string | null;
  headline: string;
  subheadline: string;
  bannerDurationMs: number;
  sensoryCue: SensoryCueType;
  grantedAtIso: string;
}

export type RestProfileCategory =
  | 'NEURAL_STRENGTH'
  | 'HYPERTROPHY_COMPOUND'
  | 'METABOLIC_ENDURANCE'
  | 'ANAEROBIC_INTERVAL'
  | 'ACTIVE_RECOVERY_FLOW';

export interface RestAdviceProfile {
  category: RestProfileCategory;
  recommendedSeconds: number;
  minRecommendedSeconds: number;
  maxRecommendedSeconds: number;
  headline: string;
  physiologicalRationale: string;
}

export interface RestTimerState {
  isActive: boolean;
  configuredSeconds: number;
  remainingSeconds: number;
  startedAtMs: number | null;
  endsAtMs: number | null;
  advice: RestAdviceProfile;
}

/**
 * Deliverable 2: `SetLog` entity representing an intra-workout logged set and its
 * immediate FR-1 operant micro-feedback metrics.
 */
export interface SetLog {
  id: string;
  setNumber: number;
  exerciseId: string;
  exerciseName: string;
  reps: number;
  weightKg: number;
  rpe: number | null;
  isWarmup: boolean;
  setType?: SetType;
  supersetGroupId?: string | null;
  calculatedE1RM: number;
  relativeIntensity: number;
  isLivePersonalRecordPace: boolean;
  prTypesOnPace: PrRecordBreakType[];
  microXpTick: number;
  microGoldTick: number;
  bossHpDamage: number;
  plannedRestSeconds: number;
  loggedAtIso: string;
}

export interface MicroRewardFeedback {
  setId: string;
  xpTick: number;
  goldTick: number;
  bossHpDamage: number;
  calculatedE1RM: number;
  relativeIntensity: number;
  isLivePrPace: boolean;
  sensoryCue: SensoryCueType;
}

export interface NextSetPreview {
  setNumber: number;
  exerciseId: string;
  exerciseName: string;
  suggestedWeightKg: number;
  suggestedReps: number;
  targetRpe: number;
}

export interface EncounterBossOverlay {
  bossName: string;
  maxHp: number;
  currentHp: number;
  defeatedCount: number;
}

export type ResilienceReason =
  | 'NONE'
  | 'MISSED_SESSION_COMEBACK'
  | 'LOW_ENERGY_GRIT'
  | 'COMEBACK_AND_LOW_ENERGY';

export interface ResilienceBonusResult {
  triggered: boolean;
  reason: ResilienceReason;
  xpMultiplierBonus: number;
  flatBonusXp: number;
  flatBonusGold: number;
  badgeTitle: string | null;
  message: string | null;
}

export interface LootChestReward {
  tier: LootChestTier;
  chestName: string;
  effortQualityScore: number;
  opened: boolean;
  scoreBreakdown: {
    progressiveOverloadPoints: number;
    rpeAndIntensityPoints: number;
    consistencyPoints: number;
    resiliencePoints: number;
  };
  drops: LootDrop[];
}

/**
 * Deliverable 2: `CharacterProgression` snapshot capturing post-workout stat leveling
 * and stat-specific talent point unlocks gated to `LootReview`.
 */
export interface CharacterProgression {
  unlockedForAllocation: boolean;
  byStat: Record<
    StatType,
    StatLevelProgressionResult & {
      totalPointsAvailableAfterSession: number;
    }
  >;
  totalLevelsGained: number;
  totalTalentPointsEarned: number;
}

/**
 * Deliverable 2: `RewardPayload` consolidated exclusively at Phase 3 (`DungeonComplete` / `LootReview`).
 */
export interface RewardPayload {
  sessionId: string;
  totalTonnageKg: number;
  totalReps: number;
  workingSetCount: number;
  averageRpe: number | null;
  durationSeconds: number;
  arrivalBoonMultiplier: number;
  fatigueAndRestMultiplier: number;
  resilienceBonus: ResilienceBonusResult;
  effectiveTotalMultiplier: number;
  finalXpByStat: Record<StatType, number>;
  totalXpAwarded: number;
  totalGoldAwarded: number;
  workoutEvaluation: WorkoutEvaluationResult;
  lootChest: LootChestReward;
  characterProgression: CharacterProgression;
}

/**
 * Deliverable 2: `WorkoutSession` root lifecycle entity managed by the Hybrid Reward FSM.
 */
export interface WorkoutSession {
  sessionId: string;
  workoutType: WorkoutSessionType;
  startedAtMs: number;
  completedAtMs: number | null;
  reviewedAtMs: number | null;
  arrivalBoon: ArrivalBoon;
  lowEnergyMode: boolean;
  setLogs: SetLog[];
  cardioSegments: CardioSegmentInput[];
  accumulatedMicroXp: number;
  accumulatedMicroGold: number;
  encounterBoss: EncounterBossOverlay;
  restTimer: RestTimerState;
  nextSetPreview: NextSetPreview | null;
  focusLockActive: boolean;
  pendingFocusOverrideTarget: string | null;
  focusOverrideCount: number;
  rewardPayload: RewardPayload | null;
}

export interface HybridWorkoutMachineState {
  phase: HybridPhaseState;
  activeSession: WorkoutSession | null;
  lastMicroFeedback: MicroRewardFeedback | null;
  lastError: string | null;
}

// ============================================================================
// LOOT TABLES BY EFFORT CHEST TIER (ANTI-JUNK-VOLUME BALANCED)
// ============================================================================

interface WeightedChestLoot extends LootDrop {
  weight: number;
}

const CHEST_LOOT_TABLES: Record<LootChestTier, readonly WeightedChestLoot[]> = {
  COMMON: [
    {
      itemSlug: 'iron_ore_cluster',
      itemName: 'Rich Iron Ore Cluster',
      rarity: 'COMMON',
      quantity: 3,
      weight: 45,
    },
    {
      itemSlug: 'sunleaf_herb_bundle',
      itemName: 'Sunleaf Herb Bundle',
      rarity: 'COMMON',
      quantity: 3,
      weight: 40,
    },
    {
      itemSlug: 'tempered_whetstone',
      itemName: 'Tempered Whetstone',
      rarity: 'UNCOMMON',
      quantity: 1,
      weight: 15,
    },
  ],
  RARE: [
    {
      itemSlug: 'obsidian_ingot',
      itemName: 'Obsidian Steel Ingot',
      rarity: 'UNCOMMON',
      quantity: 2,
      weight: 40,
    },
    {
      itemSlug: 'vitality_elixir',
      itemName: 'Elixir of Peak Output',
      rarity: 'RARE',
      quantity: 1,
      weight: 38,
    },
    {
      itemSlug: 'warden_chainmail',
      itemName: "Warden's Tempered Hauberk",
      rarity: 'RARE',
      quantity: 1,
      weight: 14,
    },
    {
      itemSlug: 'titanite_ember',
      itemName: 'Titanite Forge Ember',
      rarity: 'EPIC',
      quantity: 1,
      weight: 8,
    },
  ],
  EPIC: [
    {
      itemSlug: 'titanite_ember',
      itemName: 'Titanite Forge Ember',
      rarity: 'EPIC',
      quantity: 2,
      weight: 42,
    },
    {
      itemSlug: 'malakor_signet',
      itemName: "Malakor's Signet Ring",
      rarity: 'EPIC',
      quantity: 1,
      weight: 30,
    },
    {
      itemSlug: 'vitality_elixir',
      itemName: 'Elixir of Peak Output',
      rarity: 'RARE',
      quantity: 2,
      weight: 20,
    },
    {
      itemSlug: 'champion_sigil_shard',
      itemName: "Champion's Sigil Shard",
      rarity: 'LEGENDARY',
      quantity: 1,
      weight: 8,
    },
  ],
};

// ============================================================================
// PHASE 1: GEOFENCE DETECTION & THRESHOLD ARRIVAL BOON
// ============================================================================

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function roundTo2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Great-circle Haversine distance in meters for registered gym geofence detection.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusM = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusM * c);
}

/**
 * Checks whether coordinates fall inside any registered Adventurer's Guild (Gym) geofence.
 */
export function detectRegisteredGymArrival(
  coords: { latitude: number; longitude: number },
  registeredGyms: readonly RegisteredGymLocation[]
): RegisteredGymLocation | null {
  for (const gym of registeredGyms) {
    const dist = calculateDistanceMeters(
      coords.latitude,
      coords.longitude,
      gym.latitude,
      gym.longitude
    );
    if (dist <= gym.radiusMeters) {
      return gym;
    }
  }
  return null;
}

/**
 * Constructs the Phase 1 Arrival Boon with instantaneous (<2s) cue copy and equal 1.25x XP buff.
 */
export function createArrivalBoon(params: {
  trigger: ArrivalTriggerType;
  gymId?: string | null;
  gymName?: string | null;
  now?: Date;
}): ArrivalBoon {
  const cleanGymName = params.gymName?.trim() || null;
  const isGymArrival = params.trigger === 'GEOFENCE_GYM' && Boolean(cleanGymName);

  const headline = isGymArrival
    ? `Adventurer's Guild Entered: ${cleanGymName}`
    : 'Open-World Training Begun.';

  const subheadline = `Arrival Boon Granted: ${ARRIVAL_BOON_MULTIPLIER.toFixed(2)}x Session XP • Focus Lock Engaged`;

  return {
    multiplier: ARRIVAL_BOON_MULTIPLIER,
    trigger: isGymArrival ? 'GEOFENCE_GYM' : 'MANUAL_OPEN_WORLD',
    gymId: isGymArrival ? (params.gymId ?? null) : null,
    gymName: isGymArrival ? cleanGymName : null,
    headline,
    subheadline,
    bannerDurationMs: ARRIVAL_BANNER_DURATION_MS,
    sensoryCue: isGymArrival ? 'GUILD_THRESHOLD_PULSE' : 'OPEN_WORLD_THRESHOLD_PULSE',
    grantedAtIso: (params.now ?? new Date()).toISOString(),
  };
}

// ============================================================================
// PHASE 2: EXERCISE-SCIENCE REST TIMER ADVISOR & SET MICRO-REWARDS
// ============================================================================

/**
 * Computes optimal rest timer guidance grounded in exercise physiology
 * (ATP-PCr resynthesis, CNS motor recruitment, and metabolite clearance).
 */
export function getOptimalRestAdvice(params: {
  workoutType: WorkoutSessionType;
  reps?: number;
  relativeIntensity?: number;
  rpe?: number | null;
  isWarmup?: boolean;
}): RestAdviceProfile {
  if (params.isWarmup) {
    return {
      category: 'ACTIVE_RECOVERY_FLOW',
      recommendedSeconds: 60,
      minRecommendedSeconds: 45,
      maxRecommendedSeconds: 75,
      headline: 'Warm-Up Transition (60s)',
      physiologicalRationale:
        'Brief 45-75s pause primes motor pathways without cooling core tissue temperature.',
    };
  }

  if (params.workoutType === 'ACTIVE_RECOVERY') {
    return {
      category: 'ACTIVE_RECOVERY_FLOW',
      recommendedSeconds: 45,
      minRecommendedSeconds: 30,
      maxRecommendedSeconds: 60,
      headline: 'Parasympathetic Flow Rest (45s)',
      physiologicalRationale:
        '30-60s nasal breathing keeps heart rate in restorative Zone 1.',
    };
  }

  if (params.workoutType === 'CARDIO_HIGH_INTENSITY') {
    return {
      category: 'ANAEROBIC_INTERVAL',
      recommendedSeconds: 90,
      minRecommendedSeconds: 60,
      maxRecommendedSeconds: 120,
      headline: 'Anaerobic Power Recovery (90s)',
      physiologicalRationale:
        '60-120s clears H+ acidosis enough to sustain peak Zone 4-5 interval output.',
    };
  }

  if (params.workoutType === 'CARDIO_LOW_MOD') {
    return {
      category: 'METABOLIC_ENDURANCE',
      recommendedSeconds: 60,
      minRecommendedSeconds: 45,
      maxRecommendedSeconds: 75,
      headline: 'Aerobic Density Interval (60s)',
      physiologicalRationale:
        'Short 45-75s recovery preserves stroke volume and mitochondrial signaling.',
    };
  }

  const reps = params.reps ?? 8;
  const rel = params.relativeIntensity ?? 0.75;
  const rpe = params.rpe ?? 7.5;

  if (reps <= 5 || rel >= 0.85 || rpe >= 9.0) {
    return {
      category: 'NEURAL_STRENGTH',
      recommendedSeconds: 180,
      minRecommendedSeconds: 180,
      maxRecommendedSeconds: 240,
      headline: 'Heavy Neural Strength (3:00)',
      physiologicalRationale:
        '3-4 min restores ~90% phosphocreatine (ATP-PCr) and high-threshold motor unit drive.',
    };
  }

  if (reps <= 12 && (rel >= 0.68 || rpe >= 7.0)) {
    return {
      category: 'HYPERTROPHY_COMPOUND',
      recommendedSeconds: 120,
      minRecommendedSeconds: 90,
      maxRecommendedSeconds: 150,
      headline: 'Hypertrophy Optimal Window (2:00)',
      physiologicalRationale:
        '90-150s balances mechanical tension capacity on the next set with time efficiency.',
    };
  }

  return {
    category: 'METABOLIC_ENDURANCE',
    recommendedSeconds: 75,
    minRecommendedSeconds: 60,
    maxRecommendedSeconds: 90,
    headline: 'Metabolic / Accessory Rest (1:15)',
    physiologicalRationale:
      '60-90s sustains local muscular endurance and capillary perfusion.',
  };
}

/**
 * Evaluates an instant FR-1 operant micro-reward for a single completed set (<16ms pure math).
 * Never rolls gacha chests intra-workout — only deterministic counter ticks & Boss HP damage.
 */
export function evaluateLiveSetMicroReward(params: {
  setId: string;
  exerciseId: string;
  reps: number;
  weightKg: number;
  rpe?: number | null;
  isWarmup?: boolean;
  setType?: SetType;
  exerciseBaseXpFactor?: number;
  historicalPR?: HistoricalExercisePR;
  arrivalBoonMultiplier?: number;
}): {
  feedback: MicroRewardFeedback;
  prTypesOnPace: PrRecordBreakType[];
} {
  const isWarmup = isWarmupSetType(params.setType, params.isWarmup);
  const resolvedRpe = resolveEffectiveSetRpe(params.rpe, params.setType);
  const boon = params.arrivalBoonMultiplier ?? ARRIVAL_BOON_MULTIPLIER;
  const calculatedE1RM = isWarmup ? 0 : calculateE1RM(params.weightKg, params.reps);

  const priorBestE1RM = params.historicalPR?.bestE1RM ?? 0;
  const referenceE1RM = priorBestE1RM > 0 ? priorBestE1RM : Math.max(calculatedE1RM, 1);

  const { rawXp, relativeIntensity } = calculateStrengthSetXp({
    weightKg: params.weightKg,
    reps: params.reps,
    referenceE1RM,
    isWarmup,
    setType: params.setType,
    rpe: resolvedRpe,
    exerciseBaseXpFactor: params.exerciseBaseXpFactor ?? 1.0,
  });

  const prTypesOnPace: PrRecordBreakType[] = [];
  if (!isWarmup && priorBestE1RM > 0 && calculatedE1RM > priorBestE1RM) {
    prTypesOnPace.push('E1RM');
  }

  const rpeFactor =
    resolvedRpe !== undefined && resolvedRpe !== null
      ? 1 + clamp((resolvedRpe - 7) * 0.04, -0.05, 0.12)
      : 1.0;

  const xpTick = isWarmup ? 2 : Math.max(5, Math.round(rawXp * boon * rpeFactor));
  const goldTick = isWarmup
    ? 1
    : clamp(Math.round(2 + relativeIntensity * 5 + (prTypesOnPace.length > 0 ? 3 : 0)), 2, 12);
  const bossHpDamage = isWarmup
    ? 25
    : Math.max(60, Math.round(xpTick * 3.8 + (prTypesOnPace.length > 0 ? 90 : 0)));

  return {
    feedback: {
      setId: params.setId,
      xpTick,
      goldTick,
      bossHpDamage,
      calculatedE1RM,
      relativeIntensity,
      isLivePrPace: prTypesOnPace.length > 0,
      sensoryCue: 'SET_MICRO_REWARD_TICK',
    },
    prTypesOnPace,
  };
}

// ============================================================================
// PHASE 3: ANTI-STREAK COLLAPSE & EFFORT-GATED GACHA CONSOLIDATION
// ============================================================================

/**
 * Evaluates the Anti-Streak Collapse ("Resilience Bonus") safety net.
 * Rewards showing up after a missed workout window (>=72h) or on a low-energy day
 * to neutralize the "what-the-hell" abstinence-violation effect.
 */
export function evaluateResilienceBonus(params: {
  lastWorkoutAt: Date | null;
  performedAt: Date;
  lowEnergyMode: boolean;
  workingSetCount: number;
  cardioDurationSeconds: number;
}): ResilienceBonusResult {
  const hasMeaningfulEffort = params.workingSetCount >= 1 || params.cardioDurationSeconds >= 300;
  if (!hasMeaningfulEffort) {
    return {
      triggered: false,
      reason: 'NONE',
      xpMultiplierBonus: 0,
      flatBonusXp: 0,
      flatBonusGold: 0,
      badgeTitle: null,
      message: null,
    };
  }

  const hoursSinceLast =
    params.lastWorkoutAt !== null
      ? (params.performedAt.getTime() - params.lastWorkoutAt.getTime()) / (3600 * 1000)
      : 0;

  const isComeback = params.lastWorkoutAt !== null && hoursSinceLast >= RESILIENCE_COMEBACK_THRESHOLD_HOURS;
  const isLowEnergy = params.lowEnergyMode;

  if (!isComeback && !isLowEnergy) {
    return {
      triggered: false,
      reason: 'NONE',
      xpMultiplierBonus: 0,
      flatBonusXp: 0,
      flatBonusGold: 0,
      badgeTitle: null,
      message: null,
    };
  }

  const reason: ResilienceReason =
    isComeback && isLowEnergy
      ? 'COMEBACK_AND_LOW_ENERGY'
      : isComeback
        ? 'MISSED_SESSION_COMEBACK'
        : 'LOW_ENERGY_GRIT';

  const badgeTitle =
    reason === 'COMEBACK_AND_LOW_ENERGY'
      ? 'Phoenix Vow: Unbreakable Return'
      : reason === 'MISSED_SESSION_COMEBACK'
        ? ' Vanguard Return: Streak Restored'
        : 'Iron Will: Low-Energy Grit';

  const message =
    reason === 'MISSED_SESSION_COMEBACK'
      ? 'Returned after a missed window — discipline anchored without penalty (+15% XP & +50 Bonus XP).'
      : reason === 'LOW_ENERGY_GRIT'
        ? 'Showed up on a low-energy day — habit continuity protected (+15% XP & +50 Bonus XP).'
        : 'Returned from a layoff despite low energy — peak behavioral resilience (+15% XP & +50 Bonus XP).';

  return {
    triggered: true,
    reason,
    xpMultiplierBonus: RESILIENCE_XP_MULTIPLIER_BONUS,
    flatBonusXp: RESILIENCE_FLAT_BONUS_XP,
    flatBonusGold: RESILIENCE_FLAT_BONUS_GOLD,
    badgeTitle: badgeTitle.trim(),
    message,
  };
}

/**
 * Determines post-workout Loot Chest rarity (`COMMON` | `RARE` | `EPIC`) strictly from
 * progressive overload, RPE / relative intensity quality, and consistency — NOT raw volume.
 */
export function evaluatePostWorkoutLootChest(params: {
  evaluatedSets: readonly EvaluatedResistanceSet[];
  averageRpe: number | null;
  triggeredPrCrit: boolean;
  prBreakCount: number;
  consistencyStreakSessions: number;
  resilienceTriggered: boolean;
  cardioDurationSeconds?: number;
  rngSeed: string;
}): LootChestReward {
  const workingSets = params.evaluatedSets.filter((s) => !s.isWarmup);

  // 1. Progressive Overload Score (0 or 45..55 pts)
  const progressiveOverloadPoints = params.triggeredPrCrit
    ? Math.min(55, 45 + Math.max(0, params.prBreakCount - 1) * 5)
    : 0;

  // 2. Relative Intensity & RPE Effort Quality Score (0..30 pts) — independent of set count!
  const meanRelIntensity =
    workingSets.length > 0
      ? workingSets.reduce((sum, s) => sum + s.relativeIntensity, 0) / workingSets.length
      : (params.cardioDurationSeconds ?? 0) >= 1200
        ? 0.78
        : 0;

  const intensityComponent = clamp((meanRelIntensity - 0.55) / 0.3, 0, 1) * 18;
  const rpeComponent =
    params.averageRpe !== null
      ? clamp((params.averageRpe - 6.0) / 3.0, 0, 1) * 12
      : intensityComponent * 0.65;
  const rpeAndIntensityPoints = roundTo2(clamp(intensityComponent + rpeComponent, 0, 30));

  // 3. Workout Consistency Streak Score (0..25 pts)
  const safeStreak = Math.max(1, Math.floor(params.consistencyStreakSessions));
  const consistencyPoints = clamp(safeStreak * 7, 7, 25);

  // 4. Anti-Streak Collapse Resilience Grit Score (0 or 15 pts)
  const resiliencePoints = params.resilienceTriggered ? 15 : 0;

  const effortQualityScore = roundTo2(
    clamp(
      progressiveOverloadPoints + rpeAndIntensityPoints + consistencyPoints + resiliencePoints,
      0,
      100
    )
  );

  const tier: LootChestTier =
    params.triggeredPrCrit || effortQualityScore >= EPIC_CHEST_SCORE_THRESHOLD
      ? 'EPIC'
      : effortQualityScore >= RARE_CHEST_SCORE_THRESHOLD
        ? 'RARE'
        : 'COMMON';

  const chestName =
    tier === 'EPIC'
      ? 'Mythril Reliquary Chest'
      : tier === 'RARE'
        ? 'Tempered Vanguard Chest'
        : "Adventurer's Supply Chest";

  const rng = createSeededRng(`chest:${tier}:${params.rngSeed}`);
  const table = CHEST_LOOT_TABLES[tier];
  const rollCount = tier === 'EPIC' ? 2 : tier === 'RARE' && effortQualityScore >= 58 ? 2 : 1;

  const dropsMap = new Map<string, LootDrop>();
  for (let i = 0; i < rollCount; i += 1) {
    const picked = rng.pickWeighted(table);
    const existing = dropsMap.get(picked.itemSlug);
    if (existing) {
      existing.quantity += picked.quantity;
    } else {
      dropsMap.set(picked.itemSlug, {
        itemSlug: picked.itemSlug,
        itemName: picked.itemName,
        rarity: picked.rarity as ItemRarity,
        quantity: picked.quantity,
      });
    }
  }

  return {
    tier,
    chestName,
    effortQualityScore,
    opened: false,
    scoreBreakdown: {
      progressiveOverloadPoints,
      rpeAndIntensityPoints,
      consistencyPoints,
      resiliencePoints,
    },
    drops: Array.from(dropsMap.values()),
  };
}

/**
 * Phase 3 Consolidation Pipeline: Computes total tonnage, RPE, dynamic Stat XP,
 * Resilience Bonus, Effort-Gated Loot Chest, and Character Stat/Talent Progression.
 */
export function consolidateHybridWorkoutSession(params: {
  sessionId: string;
  workoutType: WorkoutSessionType;
  setLogs: readonly SetLog[];
  cardioSegments?: readonly CardioSegmentInput[];
  durationSeconds: number;
  arrivalBoonMultiplier?: number;
  fatigueAndRestMultiplier?: number;
  lowEnergyMode?: boolean;
  lastWorkoutAt?: Date | null;
  performedAt?: Date;
  consistencyStreakSessions?: number;
  historicalPRs?: Record<string, HistoricalExercisePR>;
  exerciseBaseXpById?: Record<string, number>;
  currentCharacterStats: {
    STRENGTH: { level: number; xp: number; pointsAvailable: number };
    ENDURANCE: { level: number; xp: number; pointsAvailable: number };
    AGILITY: { level: number; xp: number; pointsAvailable: number };
  };
  rngSeed?: string;
}): RewardPayload {
  const performedAt = params.performedAt ?? new Date();
  const cardioSegments = params.cardioSegments ? [...params.cardioSegments] : [];
  const arrivalBoon = params.arrivalBoonMultiplier ?? ARRIVAL_BOON_MULTIPLIER;
  const fatigueMult = Math.max(0.5, params.fatigueAndRestMultiplier ?? 1.0);

  const workingSets = params.setLogs.filter(
    (s) => !isWarmupSetType(s.setType, s.isWarmup) && s.reps > 0
  );
  const totalTonnageKg = roundTo2(
    workingSets.reduce((sum, s) => sum + Math.max(0, s.weightKg) * s.reps, 0)
  );
  const totalReps = workingSets.reduce((sum, s) => sum + s.reps, 0);

  const rpeValues = [
    ...workingSets.map((s) => resolveEffectiveSetRpe(s.rpe, s.setType)),
    ...cardioSegments.map((c) => c.rpe ?? null),
  ].filter((r): r is number => r !== null && r !== undefined && Number.isFinite(r));
  const averageRpe =
    rpeValues.length > 0
      ? roundTo2(rpeValues.reduce((sum, r) => sum + r, 0) / rpeValues.length)
      : null;

  const cardioDurationSeconds = cardioSegments.reduce((sum, c) => sum + c.durationSeconds, 0);

  const resilienceBonus = evaluateResilienceBonus({
    lastWorkoutAt: params.lastWorkoutAt ?? null,
    performedAt,
    lowEnergyMode: Boolean(params.lowEnergyMode),
    workingSetCount: workingSets.length,
    cardioDurationSeconds,
  });

  // Multiplicative composition of Arrival Boon (1.25x) * Tavern/Recovery Multiplier + Resilience Bonus
  const effectiveTotalMultiplier = roundTo2(
    arrivalBoon * fatigueMult * (1 + resilienceBonus.xpMultiplierBonus)
  );

  // Modest RPE engagement modifier (rewards honest RPE 7.5-9.5 effort without encouraging ego-failure)
  const rpeQualityFactor =
    averageRpe !== null ? 1 + clamp((averageRpe - 7.0) * 0.03, -0.03, 0.08) : 1.0;

  const seed = params.rngSeed ?? `hybrid:${params.sessionId}:${performedAt.getTime()}`;

  const workoutEvaluation = evaluateWorkoutSession({
    workoutType: params.workoutType,
    resistanceSets: params.setLogs.map((s) => ({
      exerciseId: s.exerciseId,
      reps: s.reps,
      weightKg: s.weightKg,
      isWarmup: isWarmupSetType(s.setType, s.isWarmup),
      setType: s.setType ?? (s.isWarmup ? 'WARMUP' : 'NORMAL'),
      supersetGroupId: s.supersetGroupId ?? null,
      rpe: resolveEffectiveSetRpe(s.rpe, s.setType),
      exerciseBaseXpFactor:
        (params.exerciseBaseXpById?.[s.exerciseId] ?? 1.0) * rpeQualityFactor,
    })),
    cardioSegments,
    historicalPRs: params.historicalPRs,
    xpMultiplier: effectiveTotalMultiplier,
    rngSeed: seed,
  });

  // Distribute flat Resilience Bonus XP to primary session stat
  const primaryResilienceStat: StatType =
    params.workoutType === 'CARDIO_HIGH_INTENSITY'
      ? 'AGILITY'
      : params.workoutType === 'CARDIO_LOW_MOD' || params.workoutType === 'ACTIVE_RECOVERY'
        ? 'ENDURANCE'
        : 'STRENGTH';

  const finalXpByStat: Record<StatType, number> = {
    STRENGTH:
      workoutEvaluation.finalXpAwarded.STRENGTH +
      (primaryResilienceStat === 'STRENGTH' ? resilienceBonus.flatBonusXp : 0),
    ENDURANCE:
      workoutEvaluation.finalXpAwarded.ENDURANCE +
      (primaryResilienceStat === 'ENDURANCE' ? resilienceBonus.flatBonusXp : 0),
    AGILITY:
      workoutEvaluation.finalXpAwarded.AGILITY +
      (primaryResilienceStat === 'AGILITY' ? resilienceBonus.flatBonusXp : 0),
  };

  const totalXpAwarded =
    finalXpByStat.STRENGTH + finalXpByStat.ENDURANCE + finalXpByStat.AGILITY;

  const lootChest = evaluatePostWorkoutLootChest({
    evaluatedSets: workoutEvaluation.evaluatedSets,
    averageRpe,
    triggeredPrCrit: workoutEvaluation.criticalTrainingBonus.triggered,
    prBreakCount: workoutEvaluation.criticalTrainingBonus.prBreakCount,
    consistencyStreakSessions: params.consistencyStreakSessions ?? 1,
    resilienceTriggered: resilienceBonus.triggered,
    cardioDurationSeconds,
    rngSeed: seed,
  });

  const baseSessionGold = Math.max(
    25,
    Math.round(totalXpAwarded * 0.22) + (lootChest.tier === 'EPIC' ? 60 : lootChest.tier === 'RARE' ? 30 : 12)
  );
  const totalGoldAwarded = baseSessionGold + resilienceBonus.flatBonusGold;

  const strProg = applyStatXpProgression(
    params.currentCharacterStats.STRENGTH.level,
    params.currentCharacterStats.STRENGTH.xp,
    finalXpByStat.STRENGTH
  );
  const endProg = applyStatXpProgression(
    params.currentCharacterStats.ENDURANCE.level,
    params.currentCharacterStats.ENDURANCE.xp,
    finalXpByStat.ENDURANCE
  );
  const agiProg = applyStatXpProgression(
    params.currentCharacterStats.AGILITY.level,
    params.currentCharacterStats.AGILITY.xp,
    finalXpByStat.AGILITY
  );

  const characterProgression: CharacterProgression = {
    unlockedForAllocation: true,
    byStat: {
      STRENGTH: {
        ...strProg,
        totalPointsAvailableAfterSession:
          params.currentCharacterStats.STRENGTH.pointsAvailable + strProg.talentPointsEarned,
      },
      ENDURANCE: {
        ...endProg,
        totalPointsAvailableAfterSession:
          params.currentCharacterStats.ENDURANCE.pointsAvailable + endProg.talentPointsEarned,
      },
      AGILITY: {
        ...agiProg,
        totalPointsAvailableAfterSession:
          params.currentCharacterStats.AGILITY.pointsAvailable + agiProg.talentPointsEarned,
      },
    },
    totalLevelsGained: strProg.levelsGained + endProg.levelsGained + agiProg.levelsGained,
    totalTalentPointsEarned:
      strProg.talentPointsEarned + endProg.talentPointsEarned + agiProg.talentPointsEarned,
  };

  return {
    sessionId: params.sessionId,
    totalTonnageKg,
    totalReps,
    workingSetCount: workingSets.length,
    averageRpe,
    durationSeconds: Math.max(0, Math.round(params.durationSeconds)),
    arrivalBoonMultiplier: arrivalBoon,
    fatigueAndRestMultiplier: fatigueMult,
    resilienceBonus,
    effectiveTotalMultiplier,
    finalXpByStat,
    totalXpAwarded,
    totalGoldAwarded,
    workoutEvaluation,
    lootChest,
    characterProgression,
  };
}

// ============================================================================
// DELIVERABLE 1: PURE FINITE STATE MACHINE (`Idle` -> `DungeonActive` -> `Resting` -> `DungeonComplete` -> `LootReview`)
// ============================================================================

export type HybridWorkoutMachineEvent =
  | {
      type: 'START_SESSION';
      sessionId: string;
      workoutType: WorkoutSessionType;
      trigger: ArrivalTriggerType;
      gymId?: string | null;
      gymName?: string | null;
      lowEnergyMode?: boolean;
      initialRestSeconds?: number;
      defaultNextExercise?: { id: string; name: string; weightKg: number; reps: number };
      nowMs?: number;
    }
  | {
      type: 'LOG_SET';
      setId: string;
      exerciseId: string;
      exerciseName: string;
      reps: number;
      weightKg: number;
      rpe?: number | null;
      isWarmup?: boolean;
      setType?: SetType;
      supersetGroupId?: string | null;
      exerciseBaseXpFactor?: number;
      historicalPR?: HistoricalExercisePR;
      customRestSeconds?: number;
      suppressRestTimer?: boolean;
      customAdviceHeadline?: string;
      customAdviceRationale?: string;
      nextSetHint?: { exerciseId: string; exerciseName: string; weightKg: number; reps: number };
      nowMs?: number;
    }
  | {
      type: 'ADD_CARDIO_SEGMENT';
      segment: CardioSegmentInput;
    }
  | {
      type: 'TICK_REST_TIMER';
      elapsedSeconds?: number;
      nowMs?: number;
    }
  | {
      type: 'ADJUST_REST_TIMER';
      deltaSeconds?: number;
      newDurationSeconds?: number;
      nowMs?: number;
    }
  | {
      type: 'REST_TIMER_EXPIRED';
    }
  | {
      type: 'SKIP_REST';
    }
  | {
      type: 'REQUEST_FOCUS_OVERRIDE';
      targetTab: string;
    }
  | {
      type: 'CONFIRM_FOCUS_OVERRIDE';
    }
  | {
      type: 'CANCEL_FOCUS_OVERRIDE';
    }
  | {
      type: 'FINISH_WORKOUT';
      nowMs?: number;
      fatigueAndRestMultiplier?: number;
      lastWorkoutAt?: Date | null;
      consistencyStreakSessions?: number;
      historicalPRs?: Record<string, HistoricalExercisePR>;
      exerciseBaseXpById?: Record<string, number>;
      currentCharacterStats: {
        STRENGTH: { level: number; xp: number; pointsAvailable: number };
        ENDURANCE: { level: number; xp: number; pointsAvailable: number };
        AGILITY: { level: number; xp: number; pointsAvailable: number };
      };
      rngSeed?: string;
    }
  | {
      type: 'PROCEED_TO_LOOT';
    }
  | {
      type: 'OPEN_LOOT_CHEST';
    }
  | {
      type: 'COMPLETE_REVIEW';
      nowMs?: number;
    }
  | {
      type: 'ABANDON_SESSION';
    };

export function createInitialHybridMachineState(): HybridWorkoutMachineState {
  return {
    phase: 'Idle',
    activeSession: null,
    lastMicroFeedback: null,
    lastError: null,
  };
}

/**
 * Behavioral Focus Lock Guard:
 * Returns true when intra-workout Zero-Cognitive-Drag lock is engaged (`DungeonActive` or `Resting`).
 */
export function isIntraWorkoutFocusLocked(phase: HybridPhaseState): boolean {
  return phase === 'DungeonActive' || phase === 'Resting';
}

/**
 * Character Progression Gate:
 * Stat/Talent allocation and equipment upgrades are surfaced in `LootReview` (and accessible when `Idle`),
 * while blocked behind cognitive friction during `DungeonActive` / `Resting` and deferred during `DungeonComplete`.
 */
export function isCharacterProgressionUnlocked(phase: HybridPhaseState): boolean {
  return phase === 'LootReview' || phase === 'Idle';
}

/**
 * Pure deterministic reducer governing all transitions across:
 * `Idle` -> `DungeonActive` <-> `Resting` -> `DungeonComplete` -> `LootReview` -> `Idle`
 */
export function transitionHybridWorkoutState(
  state: HybridWorkoutMachineState,
  event: HybridWorkoutMachineEvent
): HybridWorkoutMachineState {
  switch (event.type) {
    case 'START_SESSION': {
      if (state.phase !== 'Idle') {
        return {
          ...state,
          lastError: `Cannot start a new session while in '${state.phase}' phase.`,
        };
      }

      const nowMs = event.nowMs ?? Date.now();
      const arrivalBoon = createArrivalBoon({
        trigger: event.trigger,
        gymId: event.gymId,
        gymName: event.gymName,
        now: new Date(nowMs),
      });

      const initialAdvice = getOptimalRestAdvice({ workoutType: event.workoutType });
      const configuredSeconds = Math.max(
        15,
        event.initialRestSeconds ?? initialAdvice.recommendedSeconds
      );

      const defaultEx = event.defaultNextExercise ?? {
        id: 'bench_press',
        name: 'Barbell Bench Press',
        weightKg: 85,
        reps: 8,
      };

      const session: WorkoutSession = {
        sessionId: event.sessionId,
        workoutType: event.workoutType,
        startedAtMs: nowMs,
        completedAtMs: null,
        reviewedAtMs: null,
        arrivalBoon,
        lowEnergyMode: Boolean(event.lowEnergyMode),
        setLogs: [],
        cardioSegments: [],
        accumulatedMicroXp: 0,
        accumulatedMicroGold: 0,
        encounterBoss: {
          bossName: 'Obsidian Iron-Construct',
          maxHp: 1200,
          currentHp: 1200,
          defeatedCount: 0,
        },
        restTimer: {
          isActive: false,
          configuredSeconds,
          remainingSeconds: configuredSeconds,
          startedAtMs: null,
          endsAtMs: null,
          advice: initialAdvice,
        },
        nextSetPreview: {
          setNumber: 1,
          exerciseId: defaultEx.id,
          exerciseName: defaultEx.name,
          suggestedWeightKg: defaultEx.weightKg,
          suggestedReps: defaultEx.reps,
          targetRpe: 8,
        },
        focusLockActive: true,
        pendingFocusOverrideTarget: null,
        focusOverrideCount: 0,
        rewardPayload: null,
      };

      return {
        phase: 'DungeonActive',
        activeSession: session,
        lastMicroFeedback: null,
        lastError: null,
      };
    }

    case 'LOG_SET': {
      if (
        (state.phase !== 'DungeonActive' && state.phase !== 'Resting') ||
        !state.activeSession
      ) {
        return {
          ...state,
          lastError: `Sets can only be logged during 'DungeonActive' or 'Resting' (current: '${state.phase}').`,
        };
      }

      if (event.reps <= 0 || event.weightKg < 0 || !Number.isFinite(event.reps)) {
        return {
          ...state,
          lastError: 'Valid positive reps and non-negative weight are required to log a set.',
        };
      }

      const nowMs = event.nowMs ?? Date.now();
      const session = state.activeSession;
      const setNumber = session.setLogs.length + 1;
      const resolvedIsWarmup = isWarmupSetType(event.setType, event.isWarmup);
      const resolvedSetType: SetType =
        event.setType ?? (resolvedIsWarmup ? 'WARMUP' : 'NORMAL');
      const resolvedRpe = resolveEffectiveSetRpe(event.rpe, resolvedSetType);

      const { feedback, prTypesOnPace } = evaluateLiveSetMicroReward({
        setId: event.setId,
        exerciseId: event.exerciseId,
        reps: event.reps,
        weightKg: event.weightKg,
        rpe: resolvedRpe,
        isWarmup: resolvedIsWarmup,
        setType: resolvedSetType,
        exerciseBaseXpFactor: event.exerciseBaseXpFactor,
        historicalPR: event.historicalPR,
        arrivalBoonMultiplier: session.arrivalBoon.multiplier,
      });

      const baseAdvice = getOptimalRestAdvice({
        workoutType: session.workoutType,
        reps: event.reps,
        relativeIntensity: feedback.relativeIntensity,
        rpe: resolvedRpe,
        isWarmup: resolvedIsWarmup,
      });

      const restSeconds = clamp(
        event.customRestSeconds ?? baseAdvice.recommendedSeconds,
        10,
        600
      );

      const advice: RestAdviceProfile = event.customAdviceHeadline
        ? {
            ...baseAdvice,
            recommendedSeconds: restSeconds,
            headline: event.customAdviceHeadline,
            physiologicalRationale:
              event.customAdviceRationale ?? baseAdvice.physiologicalRationale,
          }
        : baseAdvice;

      const newSetLog: SetLog = {
        id: event.setId,
        setNumber,
        exerciseId: event.exerciseId,
        exerciseName: event.exerciseName,
        reps: event.reps,
        weightKg: event.weightKg,
        rpe: resolvedRpe,
        isWarmup: resolvedIsWarmup,
        setType: resolvedSetType,
        supersetGroupId: event.supersetGroupId ?? null,
        calculatedE1RM: feedback.calculatedE1RM,
        relativeIntensity: feedback.relativeIntensity,
        isLivePersonalRecordPace: feedback.isLivePrPace,
        prTypesOnPace,
        microXpTick: feedback.xpTick,
        microGoldTick: feedback.goldTick,
        bossHpDamage: feedback.bossHpDamage,
        plannedRestSeconds: event.suppressRestTimer ? 0 : restSeconds,
        loggedAtIso: new Date(nowMs).toISOString(),
      };

      // Update Encounter Boss HP (if slain mid-session, respawn next construct tier seamlessly!)
      let nextBossHp = session.encounterBoss.currentHp - feedback.bossHpDamage;
      let nextDefeatedCount = session.encounterBoss.defeatedCount;
      let nextMaxHp = session.encounterBoss.maxHp;
      if (nextBossHp <= 0) {
        nextDefeatedCount += 1;
        nextMaxHp = Math.round(session.encounterBoss.maxHp * 1.25);
        nextBossHp = nextMaxHp;
      }

      const hint = event.nextSetHint ?? {
        exerciseId: event.exerciseId,
        exerciseName: event.exerciseName,
        weightKg: event.weightKg,
        reps: event.reps,
      };

      const shouldSuppressRest = Boolean(event.suppressRestTimer);

      const updatedSession: WorkoutSession = {
        ...session,
        setLogs: [...session.setLogs, newSetLog],
        accumulatedMicroXp: session.accumulatedMicroXp + feedback.xpTick,
        accumulatedMicroGold: session.accumulatedMicroGold + feedback.goldTick,
        encounterBoss: {
          ...session.encounterBoss,
          maxHp: nextMaxHp,
          currentHp: nextBossHp,
          defeatedCount: nextDefeatedCount,
        },
        restTimer: shouldSuppressRest
          ? {
              ...session.restTimer,
              isActive: false,
              configuredSeconds: restSeconds,
              remainingSeconds: 0,
              startedAtMs: null,
              endsAtMs: null,
              advice,
            }
          : {
              isActive: true,
              configuredSeconds: restSeconds,
              remainingSeconds: restSeconds,
              startedAtMs: nowMs,
              endsAtMs: nowMs + restSeconds * 1000,
              advice,
            },
        nextSetPreview: {
          setNumber: setNumber + 1,
          exerciseId: hint.exerciseId,
          exerciseName: hint.exerciseName,
          suggestedWeightKg: hint.weightKg,
          suggestedReps: hint.reps,
          targetRpe: resolvedRpe ?? 8,
        },
      };

      return {
        phase: shouldSuppressRest ? 'DungeonActive' : 'Resting',
        activeSession: updatedSession,
        lastMicroFeedback: feedback,
        lastError: null,
      };
    }

    case 'ADD_CARDIO_SEGMENT': {
      if (
        (state.phase !== 'DungeonActive' && state.phase !== 'Resting') ||
        !state.activeSession
      ) {
        return {
          ...state,
          lastError: 'Cardio segments can only be recorded during an active workout.',
        };
      }
      if (event.segment.durationSeconds <= 0) {
        return { ...state, lastError: 'Cardio duration must be positive.' };
      }

      const microXp = Math.max(10, Math.round((event.segment.durationSeconds / 60) * 9));
      const microGold = Math.max(3, Math.round((event.segment.durationSeconds / 60) * 0.4));
      const bossDmg = microXp * 3;
      const boss = state.activeSession.encounterBoss;
      const remHp = Math.max(1, boss.currentHp - bossDmg);

      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          cardioSegments: [...state.activeSession.cardioSegments, event.segment],
          accumulatedMicroXp: state.activeSession.accumulatedMicroXp + microXp,
          accumulatedMicroGold: state.activeSession.accumulatedMicroGold + microGold,
          encounterBoss: { ...boss, currentHp: remHp },
        },
        lastError: null,
      };
    }

    case 'TICK_REST_TIMER': {
      if (state.phase !== 'Resting' || !state.activeSession || !state.activeSession.restTimer.isActive) {
        return state;
      }

      const rt = state.activeSession.restTimer;
      const nextRemaining =
        event.nowMs !== undefined && rt.endsAtMs !== null
          ? Math.max(0, Math.ceil((rt.endsAtMs - event.nowMs) / 1000))
          : Math.max(0, rt.remainingSeconds - (event.elapsedSeconds ?? 1));

      if (nextRemaining <= 0) {
        return {
          phase: 'DungeonActive',
          activeSession: {
            ...state.activeSession,
            restTimer: {
              ...rt,
              isActive: false,
              remainingSeconds: 0,
              startedAtMs: null,
              endsAtMs: null,
            },
          },
          lastMicroFeedback: state.lastMicroFeedback,
          lastError: null,
        };
      }

      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          restTimer: {
            ...rt,
            remainingSeconds: nextRemaining,
          },
        },
      };
    }

    case 'ADJUST_REST_TIMER': {
      if (!state.activeSession) return state;
      const nowMs = event.nowMs ?? Date.now();
      const rt = state.activeSession.restTimer;

      const updatedRemaining =
        event.newDurationSeconds !== undefined
          ? clamp(event.newDurationSeconds, 10, 600)
          : clamp(rt.remainingSeconds + (event.deltaSeconds ?? 0), 5, 600);

      const updatedConfigured =
        event.newDurationSeconds !== undefined
          ? clamp(event.newDurationSeconds, 10, 600)
          : Math.max(rt.configuredSeconds, updatedRemaining);

      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          restTimer: {
            ...rt,
            configuredSeconds: updatedConfigured,
            remainingSeconds: updatedRemaining,
            endsAtMs: rt.isActive ? nowMs + updatedRemaining * 1000 : null,
          },
        },
      };
    }

    case 'REST_TIMER_EXPIRED':
    case 'SKIP_REST': {
      if (state.phase !== 'Resting' || !state.activeSession) {
        return state;
      }

      return {
        phase: 'DungeonActive',
        activeSession: {
          ...state.activeSession,
          restTimer: {
            ...state.activeSession.restTimer,
            isActive: false,
            remainingSeconds: 0,
            startedAtMs: null,
            endsAtMs: null,
          },
        },
        lastMicroFeedback: state.lastMicroFeedback,
        lastError: null,
      };
    }

    case 'REQUEST_FOCUS_OVERRIDE': {
      if (!state.activeSession || !isIntraWorkoutFocusLocked(state.phase)) {
        return state;
      }
      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          pendingFocusOverrideTarget: event.targetTab,
        },
      };
    }

    case 'CANCEL_FOCUS_OVERRIDE': {
      if (!state.activeSession) return state;
      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          pendingFocusOverrideTarget: null,
        },
      };
    }

    case 'CONFIRM_FOCUS_OVERRIDE': {
      if (!state.activeSession) return state;
      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          pendingFocusOverrideTarget: null,
          focusOverrideCount: state.activeSession.focusOverrideCount + 1,
        },
      };
    }

    case 'FINISH_WORKOUT': {
      if (
        (state.phase !== 'DungeonActive' && state.phase !== 'Resting') ||
        !state.activeSession
      ) {
        return {
          ...state,
          lastError: `Cannot finish workout from '${state.phase}' phase.`,
        };
      }

      const session = state.activeSession;
      const workingSets = session.setLogs.filter((s) => s.reps > 0);
      if (workingSets.length === 0 && session.cardioSegments.length === 0) {
        return {
          ...state,
          lastError: 'Log at least one set or cardio segment before finishing the session.',
        };
      }

      const nowMs = event.nowMs ?? Date.now();
      const elapsedDurationSec = Math.max(
        60,
        Math.round((nowMs - session.startedAtMs) / 1000),
        session.cardioSegments.reduce((acc, c) => acc + c.durationSeconds, 0)
      );

      const rewardPayload = consolidateHybridWorkoutSession({
        sessionId: session.sessionId,
        workoutType: session.workoutType,
        setLogs: session.setLogs,
        cardioSegments: session.cardioSegments,
        durationSeconds: elapsedDurationSec,
        arrivalBoonMultiplier: session.arrivalBoon.multiplier,
        fatigueAndRestMultiplier: event.fatigueAndRestMultiplier,
        lowEnergyMode: session.lowEnergyMode,
        lastWorkoutAt: event.lastWorkoutAt,
        performedAt: new Date(nowMs),
        consistencyStreakSessions: event.consistencyStreakSessions,
        historicalPRs: event.historicalPRs,
        exerciseBaseXpById: event.exerciseBaseXpById,
        currentCharacterStats: event.currentCharacterStats,
        rngSeed: event.rngSeed,
      });

      return {
        phase: 'DungeonComplete',
        activeSession: {
          ...session,
          completedAtMs: nowMs,
          focusLockActive: false,
          pendingFocusOverrideTarget: null,
          restTimer: {
            ...session.restTimer,
            isActive: false,
            remainingSeconds: 0,
            startedAtMs: null,
            endsAtMs: null,
          },
          rewardPayload,
        },
        lastMicroFeedback: null,
        lastError: null,
      };
    }

    case 'PROCEED_TO_LOOT': {
      if (state.phase !== 'DungeonComplete' || !state.activeSession?.rewardPayload) {
        return {
          ...state,
          lastError: 'Must complete Dungeon Cleared summary before entering LootReview.',
        };
      }

      return {
        phase: 'LootReview',
        activeSession: state.activeSession,
        lastMicroFeedback: null,
        lastError: null,
      };
    }

    case 'OPEN_LOOT_CHEST': {
      if (state.phase !== 'LootReview' || !state.activeSession?.rewardPayload) {
        return {
          ...state,
          lastError: 'Loot chests can only be opened during the post-workout LootReview phase.',
        };
      }

      return {
        ...state,
        activeSession: {
          ...state.activeSession,
          rewardPayload: {
            ...state.activeSession.rewardPayload,
            lootChest: {
              ...state.activeSession.rewardPayload.lootChest,
              opened: true,
            },
          },
        },
        lastError: null,
      };
    }

    case 'COMPLETE_REVIEW': {
      if (state.phase !== 'LootReview' || !state.activeSession) {
        return {
          ...state,
          lastError: 'Can only complete review from LootReview phase.',
        };
      }

      return createInitialHybridMachineState();
    }

    case 'ABANDON_SESSION': {
      return createInitialHybridMachineState();
    }
  }
}
