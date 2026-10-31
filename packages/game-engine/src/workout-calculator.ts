import { createSeededRng } from './rng';
import {
  ActivityType,
  CharacterStats,
  CoreStatBlock,
  HeartRateZone,
  LootDrop,
  StatType,
  WorkoutModality,
  WorkoutSessionType,
} from './types';
import {
  DROP_SET_XP_MULTIPLIER,
  SetType,
  isWarmupSetType,
  resolveEffectiveSetRpe,
} from './workout-presets-rest';

// ============================================================================
// CONSTANTS & BALANCING THRESHOLDS
// ============================================================================

export const STRENGTH_HEALTHY_XP_THRESHOLD = 420;
export const STRENGTH_MODERATE_FATIGUE_XP_THRESHOLD = 680;

export const ENDURANCE_HEALTHY_SECONDS = 90 * 60; // 90 minutes
export const ENDURANCE_EXTENDED_SECONDS = 150 * 60; // 150 minutes

export const AGILITY_HEALTHY_SECONDS = 35 * 60; // 35 minutes in HR Zone 4-5
export const AGILITY_EXTENDED_SECONDS = 60 * 60; // 60 minutes

export const PR_CRIT_PRIMARY_BONUS_XP = 75;
export const PR_CRIT_ADDITIONAL_BONUS_XP = 35;
export const MAX_PR_CRITS_PER_SESSION = 3;

const ENDURANCE_XP_PER_MINUTE_BY_ZONE: Record<1 | 2 | 3, number> = {
  1: 4.5, // Light aerobic / recovery movement
  2: 9.0, // Optimal Zone 2 aerobic base (spec: "Zones 1-3, primarily Zone 2")
  3: 7.8, // Tempo aerobic work
};

const AGILITY_XP_PER_MINUTE_BY_ZONE: Record<4 | 5, number> = {
  4: 11.5, // Anaerobic threshold
  5: 14.5, // VO2 Max / HIIT peak output
};

const CARDIO_MODALITY_FACTORS: Record<string, number> = {
  running: 1.05,
  rowing: 1.05,
  swimming: 1.05,
  cycling: 1.0,
  outdoor_cycling: 1.05,
  badminton: 1.1,
  boxing: 1.15,
  sport: 1.1,
  stairmaster: 1.05,
  jump_rope: 1.05,
  elliptical: 0.95,
  walking: 0.85,
  brisk_walk: 0.9,
  recovery_mobility: 1.0,
  rucking: 1.05,
};

interface WeightedLootTemplate extends LootDrop {
  weight: number;
}

const PR_CRIT_LOOT_TABLE: readonly WeightedLootTemplate[] = [
  {
    itemSlug: 'iron_ore_cluster',
    itemName: 'Rich Iron Ore Cluster',
    rarity: 'COMMON',
    quantity: 3,
    weight: 35,
  },
  {
    itemSlug: 'sunleaf_herb_bundle',
    itemName: 'Sunleaf Herb Bundle',
    rarity: 'COMMON',
    quantity: 3,
    weight: 30,
  },
  {
    itemSlug: 'tempered_whetstone',
    itemName: 'Tempered Whetstone',
    rarity: 'UNCOMMON',
    quantity: 1,
    weight: 18,
  },
  {
    itemSlug: 'vitality_elixir',
    itemName: 'Elixir of Peak Output',
    rarity: 'RARE',
    quantity: 1,
    weight: 11,
  },
  {
    itemSlug: 'titanite_ember',
    itemName: 'Titanite Forge Ember',
    rarity: 'EPIC',
    quantity: 1,
    weight: 5,
  },
  {
    itemSlug: 'champion_sigil_shard',
    itemName: "Champion's Sigil Shard",
    rarity: 'LEGENDARY',
    quantity: 1,
    weight: 1,
  },
];

// ============================================================================
// INTERFACES
// ============================================================================

export type PrRecordBreakType =
  | 'E1RM'
  | 'REPS_AT_WEIGHT'
  | 'SESSION_VOLUME'
  | 'CARDIO_ZONE_DURATION';

export interface HistoricalExercisePR {
  exerciseId: string;
  bestE1RM: number;
  bestSingleSetVolume: number;
  bestSessionVolume: number;
  maxRepsByWeight: Record<string, number>;
  bestCardioDurationSecByZone: Partial<Record<HeartRateZone, number>>;
}

export interface ResistanceSetInput {
  exerciseId: string;
  reps: number;
  weightKg: number;
  isWarmup?: boolean;
  setType?: SetType;
  supersetGroupId?: string | null;
  rpe?: number | null;
  exerciseBaseXpFactor?: number;
}

export interface CardioSegmentInput {
  exerciseId: string;
  activityType: string;
  durationSeconds: number;
  averageHrZone: HeartRateZone;
  rpe?: number | null;
}

export interface WorkoutEvaluationInput {
  workoutType: WorkoutSessionType;
  resistanceSets?: ResistanceSetInput[];
  cardioSegments?: CardioSegmentInput[];
  /** Map of exerciseId -> previously recorded personal records */
  historicalPRs?: Record<string, HistoricalExercisePR>;
  /** Combined XP multiplier (e.g., Well-Rested Tavern + Active Recovery buffs) */
  xpMultiplier?: number;
  /** Deterministic seed for PR Crit loot drop roll */
  rngSeed?: string;
}

export interface EvaluatedResistanceSet {
  exerciseId: string;
  reps: number;
  weightKg: number;
  isWarmup: boolean;
  setType?: SetType;
  supersetGroupId?: string | null;
  rpe?: number | null;
  setVolume: number;
  calculatedE1RM: number;
  relativeIntensity: number;
  rawSetXp: number;
  isPersonalRecord: boolean;
  prTypesBroken: PrRecordBreakType[];
}

export interface CriticalTrainingBonus {
  triggered: boolean;
  prBreakCount: number;
  brokenRecords: Array<{
    exerciseId: string;
    prTypes: PrRecordBreakType[];
    governingStat: StatType;
  }>;
  bonusXpByStat: Record<StatType, number>;
  totalBonusXp: number;
  guaranteedLootDrop: LootDrop | null;
}

export interface WorkoutEvaluationResult {
  rawXp: Record<StatType, number>;
  diminishedXpBeforeMultiplier: Record<StatType, number>;
  xpMultiplierApplied: number;
  finalXpAwarded: Record<StatType, number>;
  evaluatedSets: EvaluatedResistanceSet[];
  criticalTrainingBonus: CriticalTrainingBonus;
  updatedPRs: Record<string, HistoricalExercisePR>;
}

export interface StatLevelProgressionResult {
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
  remainingXp: number;
  nextLevelXpRequired: number;
  talentPointsEarned: number;
}

// ============================================================================
// CORE MATHEMATICAL FUNCTIONS
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatWeightBracketKey(weightKg: number): string {
  // Normalize weights to 0.5kg increments so floating-point jitter doesn't create phantom PR keys
  const normalized = Math.round(weightKg * 2) / 2;
  return normalized.toFixed(1);
}

/**
 * Epley Formula for Estimated 1-Rep Max:
 * e1RM = Weight * (1 + Reps / 30)
 */
export function calculateE1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0 || !Number.isFinite(weightKg) || !Number.isFinite(reps)) {
    return 0;
  }
  return roundTo2(weightKg * (1 + reps / 30));
}

/**
 * Piecewise diminishing-returns curve to discourage unhealthy junk-volume marathons.
 */
export function applyDiminishingReturns(
  rawValue: number,
  healthyThreshold: number,
  extendedThreshold: number,
  moderateEfficiency = 0.5,
  tailEfficiency = 0.15
): number {
  if (rawValue <= 0) return 0;
  if (rawValue <= healthyThreshold) {
    return rawValue;
  }
  if (rawValue <= extendedThreshold) {
    return healthyThreshold + (rawValue - healthyThreshold) * moderateEfficiency;
  }
  return (
    healthyThreshold +
    (extendedThreshold - healthyThreshold) * moderateEfficiency +
    (rawValue - extendedThreshold) * tailEfficiency
  );
}

/**
 * Calculates Strength XP for a single working set using a hybrid of:
 * 1. Relative Effort (heavily weighted): reps * (workingWeight / referenceE1RM)^1.8
 * 2. Log-damped Total Volume (`Reps * Weight`): rewards raw tonnage modestly while keeping
 *    novice vs. advanced lifter progression fair at equivalent relative intensity.
 */
export function calculateStrengthSetXp(params: {
  weightKg: number;
  reps: number;
  referenceE1RM: number;
  isWarmup?: boolean;
  setType?: SetType;
  rpe?: number | null;
  exerciseBaseXpFactor?: number;
}): { rawXp: number; relativeIntensity: number; setVolume: number } {
  const {
    weightKg,
    reps,
    referenceE1RM,
    isWarmup = false,
    setType,
    exerciseBaseXpFactor = 1.0,
  } = params;

  const warmup = isWarmupSetType(setType, isWarmup);

  if (warmup || weightKg <= 0 || reps <= 0 || referenceE1RM <= 0) {
    return { rawXp: 0, relativeIntensity: 0, setVolume: Math.max(0, weightKg * reps) };
  }

  const setVolume = weightKg * reps;
  const relativeIntensity = clamp(weightKg / referenceE1RM, 0.2, 1.25);

  // ~85% weight from Relative Intensity & effort, ~15% from log-normalized tonnage
  const relativeEffortTerm = reps * Math.pow(relativeIntensity, 1.8) * 3.5;
  const volumeBonusTerm = Math.log1p(setVolume / 50) * relativeIntensity * 2.0;

  // Drop-Sets award +10% metabolic intensity multiplier; Failure/AMRAP applies peak intensity bonus
  const setTypeMultiplier =
    setType === 'DROP_SET'
      ? DROP_SET_XP_MULTIPLIER
      : setType === 'FAILURE' || setType === 'AMRAP'
        ? 1.06
        : 1.0;

  const rawXp =
    (relativeEffortTerm + volumeBonusTerm) *
    Math.max(0.5, exerciseBaseXpFactor) *
    setTypeMultiplier;
  return {
    rawXp: roundTo2(rawXp),
    relativeIntensity: roundTo2(relativeIntensity),
    setVolume: roundTo2(setVolume),
  };
}

/**
 * Calculates Endurance (END) XP from low/moderate intensity cardio (HR Zones 1-3, peaking in Zone 2).
 */
export function calculateEnduranceCardioXp(
  durationSeconds: number,
  hrZone: 1 | 2 | 3,
  activityType = 'running'
): number {
  if (durationSeconds <= 0) return 0;

  const effectiveSeconds = applyDiminishingReturns(
    durationSeconds,
    ENDURANCE_HEALTHY_SECONDS,
    ENDURANCE_EXTENDED_SECONDS,
    0.5,
    0.2
  );

  const minutes = effectiveSeconds / 60;
  const zoneRate = ENDURANCE_XP_PER_MINUTE_BY_ZONE[hrZone];
  const modalityFactor = CARDIO_MODALITY_FACTORS[activityType.toLowerCase()] ?? 1.0;

  return roundTo2(minutes * zoneRate * modalityFactor);
}

/**
 * Calculates Agility / Stamina (AGI) XP from high-intensity anaerobic / VO2 Max cardio (HR Zones 4-5).
 */
export function calculateAgilityCardioXp(
  durationSeconds: number,
  hrZone: 4 | 5,
  activityType = 'running'
): number {
  if (durationSeconds <= 0) return 0;

  const effectiveSeconds = applyDiminishingReturns(
    durationSeconds,
    AGILITY_HEALTHY_SECONDS,
    AGILITY_EXTENDED_SECONDS,
    0.45,
    0.15
  );

  const minutes = effectiveSeconds / 60;
  const zoneRate = AGILITY_XP_PER_MINUTE_BY_ZONE[hrZone];
  const modalityFactor = CARDIO_MODALITY_FACTORS[activityType.toLowerCase()] ?? 1.0;

  return roundTo2(minutes * zoneRate * modalityFactor);
}

// ============================================================================
// 7-STAT HOLISTIC EXPANSION: NEW MODALITIES & CALCULATORS
// ============================================================================

export interface DexterityXpParams {
  durationMinutes?: number;
  durationSeconds?: number;
  volumeReps?: number;
  rpe?: number;
  skillLevel?: number;
  modality?: ActivityType | WorkoutModality | string;
}

/**
 * Calculates Dexterity (DEX) XP for Calisthenics & Rock Climbing.
 * Factors in skill progression level, perceived exertion (RPE), volume reps, and duration.
 */
export function calculateDexterityXp(params: DexterityXpParams): number;
export function calculateDexterityXp(
  durationMinutes: number,
  rpe?: number,
  skillLevel?: number,
  volumeReps?: number,
  modality?: string
): number;
export function calculateDexterityXp(
  arg1: number | DexterityXpParams,
  argRpe?: number,
  argSkill?: number,
  argVolume?: number,
  argModality?: string
): number {
  let durationMinutes = 0;
  let rpe = 7;
  let skillLevel = 1;
  let volumeReps = 0;
  let modality = 'CALISTHENICS';

  if (typeof arg1 === 'number') {
    durationMinutes = arg1;
    if (argRpe !== undefined) rpe = argRpe;
    if (argSkill !== undefined) skillLevel = argSkill;
    if (argVolume !== undefined) volumeReps = argVolume;
    if (argModality !== undefined) modality = argModality;
  } else if (arg1 && typeof arg1 === 'object') {
    durationMinutes =
      arg1.durationMinutes ?? (arg1.durationSeconds ? arg1.durationSeconds / 60 : 0);
    if (arg1.rpe !== undefined) rpe = arg1.rpe;
    if (arg1.skillLevel !== undefined) skillLevel = arg1.skillLevel;
    if (arg1.volumeReps !== undefined) volumeReps = arg1.volumeReps;
    if (arg1.modality !== undefined) modality = arg1.modality;
  }

  if (durationMinutes <= 0 && volumeReps <= 0) return 0;

  const safeRpe = clamp(rpe, 1, 10);
  const safeSkill = Math.max(1, skillLevel);

  // RPE scales intensity (0.6x at RPE 1 up to 1.5x at RPE 10)
  const rpeMultiplier = 0.5 + safeRpe / 10;
  // Skill tier progression scaling (+15% per skill level above 1)
  const skillMultiplier = 1.0 + (safeSkill - 1) * 0.15;
  // Climbing emphasizes high isometric and body tension
  const modalityMultiplier = modality.toUpperCase().includes('CLIMB') ? 1.15 : 1.0;

  const durationXp = durationMinutes * 6.5;
  const volumeXp = volumeReps * 0.75;

  const rawXp = (durationXp + volumeXp) * rpeMultiplier * skillMultiplier * modalityMultiplier;
  return roundTo2(rawXp);
}

export interface ConstitutionXpParams {
  sleepHours?: number;
  sleepMinutes?: number;
  sleepQualityScore?: number;
  qualityScore?: number;
  steps?: number;
  stepCount?: number;
}

/**
 * Calculates Constitution (CON) XP for Sleep and Daily Step count.
 * Factors in sleep duration, sleep quality score (0-100), and total steps logged.
 */
export function calculateConstitutionXp(params: ConstitutionXpParams): number;
export function calculateConstitutionXp(
  sleepHours: number,
  sleepQualityScore?: number,
  steps?: number
): number;
export function calculateConstitutionXp(
  arg1: number | ConstitutionXpParams,
  argQuality?: number,
  argSteps?: number
): number {
  let sleepHours = 0;
  let qualityScore = 100;
  let steps = 0;

  if (typeof arg1 === 'number') {
    sleepHours = arg1;
    if (argQuality !== undefined) qualityScore = argQuality;
    if (argSteps !== undefined) steps = argSteps;
  } else if (arg1 && typeof arg1 === 'object') {
    sleepHours =
      arg1.sleepHours ?? (arg1.sleepMinutes ? arg1.sleepMinutes / 60 : 0);
    qualityScore = arg1.sleepQualityScore ?? arg1.qualityScore ?? 100;
    steps = arg1.stepCount ?? arg1.steps ?? 0;
  }

  if (sleepHours <= 0 && steps <= 0) return 0;

  let totalXp = 0;

  // Sleep duration + quality (optimal 7-9 hours, quality 0-100)
  if (sleepHours > 0) {
    const safeQuality = clamp(qualityScore, 0, 100) / 100;
    const effectiveHours = sleepHours <= 9 ? sleepHours : 9 + (sleepHours - 9) * 0.3;
    totalXp += effectiveHours * 8.0 * (0.5 + 0.5 * safeQuality);
  }

  // Daily Step counts (5 XP per 1,000 steps, diminishing returns past 15,000 steps)
  if (steps > 0) {
    const effectiveSteps = steps <= 15000 ? steps : 15000 + (steps - 15000) * 0.4;
    totalXp += (effectiveSteps / 1000) * 5.0;
  }

  return roundTo2(totalXp);
}

export interface WisdomXpParams {
  durationMinutes?: number;
  durationSeconds?: number;
  modality?: ActivityType | WorkoutModality | string;
}

/**
 * Calculates Wisdom (WIS) XP from duration (minutes) of Yoga and Mobility sessions.
 */
export function calculateWisdomXp(params: WisdomXpParams): number;
export function calculateWisdomXp(durationMinutes: number, modality?: string): number;
export function calculateWisdomXp(
  arg1: number | WisdomXpParams,
  argModality?: string
): number {
  let minutes = 0;
  let modality = 'YOGA';

  if (typeof arg1 === 'number') {
    minutes = arg1;
    if (argModality !== undefined) modality = argModality;
  } else if (arg1 && typeof arg1 === 'object') {
    minutes =
      arg1.durationMinutes ?? (arg1.durationSeconds ? arg1.durationSeconds / 60 : 0);
    if (arg1.modality !== undefined) modality = arg1.modality;
  }

  if (minutes <= 0) return 0;

  // Diminishing returns past 45 minutes of mobility/yoga
  const effectiveSeconds = applyDiminishingReturns(
    minutes * 60,
    45 * 60,
    90 * 60,
    0.5,
    0.2
  );
  const effectiveMinutes = effectiveSeconds / 60;
  const modalityMultiplier = modality.toUpperCase().includes('PILATES') ? 1.05 : 1.0;

  return roundTo2(effectiveMinutes * 5.0 * modalityMultiplier);
}

export interface SpiritXpParams {
  durationMinutes?: number;
  durationSeconds?: number;
  modality?: ActivityType | WorkoutModality | string;
}

/**
 * Calculates Spirit (SPR) XP from duration (minutes) of Meditation, Breathwork, Sauna, or Cold Plunge.
 */
export function calculateSpiritXp(params: SpiritXpParams): number;
export function calculateSpiritXp(durationMinutes: number, modality?: string): number;
export function calculateSpiritXp(
  arg1: number | SpiritXpParams,
  argModality?: string
): number {
  let minutes = 0;
  let modality = 'MEDITATION';

  if (typeof arg1 === 'number') {
    minutes = arg1;
    if (argModality !== undefined) modality = argModality;
  } else if (arg1 && typeof arg1 === 'object') {
    minutes =
      arg1.durationMinutes ?? (arg1.durationSeconds ? arg1.durationSeconds / 60 : 0);
    if (arg1.modality !== undefined) modality = arg1.modality;
  }

  if (minutes <= 0) return 0;

  // Diminishing returns past 30 minutes of mindfulness/thermal stress
  const effectiveSeconds = applyDiminishingReturns(
    minutes * 60,
    30 * 60,
    60 * 60,
    0.5,
    0.15
  );
  const effectiveMinutes = effectiveSeconds / 60;

  const upperMod = modality.toUpperCase();
  let modalityMultiplier = 1.0;
  if (upperMod.includes('COLD_PLUNGE') || upperMod.includes('COLD')) {
    modalityMultiplier = 1.25; // Hormetic cold shock & mental grit
  } else if (upperMod.includes('SAUNA')) {
    modalityMultiplier = 1.15; // Heat adaptation
  } else if (upperMod.includes('BREATHWORK') || upperMod.includes('BREATH')) {
    modalityMultiplier = 1.1;
  }

  return roundTo2(effectiveMinutes * 6.0 * modalityMultiplier);
}

/**
 * Calculates Overall Character Level across all 7 progression stats:
 * Strength, Endurance, Agility, Dexterity, Constitution, Wisdom, Spirit.
 *
 * Formula: floor(Sum of all 7 stats / 7)
 * Backward compatible with legacy 3-stat input: floor((STR + END + AGI) / 2)
 */
export function calculateOverallLevel(stats: {
  strengthLevel?: number;
  enduranceLevel?: number;
  agilityLevel?: number;
  dexLevel?: number;
  conLevel?: number;
  wisLevel?: number;
  sprLevel?: number;
  dexterityLevel?: number;
  constitutionLevel?: number;
  wisdomLevel?: number;
  spiritLevel?: number;
} | CoreStatBlock | CharacterStats): number {
  const str = stats.strengthLevel ?? 1;
  const end = stats.enduranceLevel ?? 1;
  const agi = stats.agilityLevel ?? 1;

  const dex = stats.dexLevel ?? stats.dexterityLevel;
  const con = stats.conLevel ?? stats.constitutionLevel;
  const wis = stats.wisLevel ?? stats.wisdomLevel;
  const spr = stats.sprLevel ?? stats.spiritLevel;

  const hasNewStats =
    dex !== undefined ||
    con !== undefined ||
    wis !== undefined ||
    spr !== undefined;

  if (hasNewStats) {
    const d = dex ?? 1;
    const c = con ?? 1;
    const w = wis ?? 1;
    const s = spr ?? 1;
    return Math.max(1, Math.floor((str + end + agi + d + c + w + s) / 7));
  }

  // Legacy fallback when only the initial 3 stats are provided
  return Math.max(1, Math.floor((str + end + agi) / 2));
}

/**
 *Deterministic PR Crit Loot Roll ("Critical Training Bonus" guaranteed drop).
 */
export function rollPrCritLootDrop(seed: string): LootDrop {
  const rng = createSeededRng(seed);
  const picked = rng.pickWeighted(PR_CRIT_LOOT_TABLE);
  return {
    itemSlug: picked.itemSlug,
    itemName: picked.itemName,
    rarity: picked.rarity,
    quantity: picked.quantity,
  };
}

// ============================================================================
// FULL SESSION EVALUATION & PR CRIT ENGINE
// ============================================================================

export function evaluateWorkoutSession(input: WorkoutEvaluationInput): WorkoutEvaluationResult {
  const resistanceSets = input.resistanceSets ?? [];
  const cardioSegments = input.cardioSegments ?? [];
  const historicalPRs = input.historicalPRs ?? {};
  const xpMultiplier = Math.max(0.1, input.xpMultiplier ?? 1.0);
  const rngSeed = input.rngSeed ?? `workout-${resistanceSets.length}-${cardioSegments.length}`;

  // Clone or initialize PR records map
  const updatedPRs: Record<string, HistoricalExercisePR> = {};
  for (const [exId, pr] of Object.entries(historicalPRs)) {
    updatedPRs[exId] = {
      exerciseId: pr.exerciseId,
      bestE1RM: pr.bestE1RM,
      bestSingleSetVolume: pr.bestSingleSetVolume,
      bestSessionVolume: pr.bestSessionVolume,
      maxRepsByWeight: { ...pr.maxRepsByWeight },
      bestCardioDurationSecByZone: { ...pr.bestCardioDurationSecByZone },
    };
  }

  // Pre-compute peak session e1RM per exercise so novices with no prior baseline get fair Relative Intensity
  const sessionPeakE1RMByExercise: Record<string, number> = {};
  const sessionVolumeByExercise: Record<string, number> = {};

  for (const set of resistanceSets) {
    const warmup = isWarmupSetType(set.setType, set.isWarmup);
    if (warmup || set.weightKg <= 0 || set.reps <= 0) continue;
    const setE1RM = calculateE1RM(set.weightKg, set.reps);
    sessionPeakE1RMByExercise[set.exerciseId] = Math.max(
      sessionPeakE1RMByExercise[set.exerciseId] ?? 0,
      setE1RM
    );
    sessionVolumeByExercise[set.exerciseId] =
      (sessionVolumeByExercise[set.exerciseId] ?? 0) + set.weightKg * set.reps;
  }

  let rawStrengthXp = 0;
  const evaluatedSets: EvaluatedResistanceSet[] = [];
  const exerciseBrokenPrTypes: Record<string, Set<PrRecordBreakType>> = {};
  const exercisePrStatMap: Record<string, StatType> = {};

  // 1. Evaluate Resistance Sets
  for (const set of resistanceSets) {
    const isWarmup = isWarmupSetType(set.setType, set.isWarmup);
    const resolvedSetType: SetType = set.setType ?? (isWarmup ? 'WARMUP' : 'NORMAL');
    const resolvedRpe = resolveEffectiveSetRpe(set.rpe, resolvedSetType);
    const baselinePR = historicalPRs[set.exerciseId];
    const hasPriorResistanceBaseline = Boolean(baselinePR && baselinePR.bestE1RM > 0);

    const referenceE1RM =
      baselinePR && baselinePR.bestE1RM > 0
        ? baselinePR.bestE1RM
        : (sessionPeakE1RMByExercise[set.exerciseId] ?? 0);

    const calculatedE1RM = isWarmup ? 0 : calculateE1RM(set.weightKg, set.reps);
    const { rawXp, relativeIntensity, setVolume } = calculateStrengthSetXp({
      weightKg: set.weightKg,
      reps: set.reps,
      referenceE1RM,
      isWarmup,
      setType: resolvedSetType,
      rpe: resolvedRpe,
      exerciseBaseXpFactor: set.exerciseBaseXpFactor,
    });

    rawStrengthXp += rawXp;

    const currentPrRecord =
      updatedPRs[set.exerciseId] ??
      (updatedPRs[set.exerciseId] = {
        exerciseId: set.exerciseId,
        bestE1RM: 0,
        bestSingleSetVolume: 0,
        bestSessionVolume: 0,
        maxRepsByWeight: {},
        bestCardioDurationSecByZone: {},
      });

    const setPrBroken: PrRecordBreakType[] = [];

    if (!isWarmup && set.weightKg > 0 && set.reps > 0) {
      const weightKey = formatWeightBracketKey(set.weightKg);
      const priorBestE1RM = baselinePR?.bestE1RM ?? 0;
      const priorMaxRepsAtWeight = baselinePR?.maxRepsByWeight[weightKey] ?? 0;

      if (hasPriorResistanceBaseline) {
        if (calculatedE1RM > priorBestE1RM) {
          setPrBroken.push('E1RM');
        }
        if (priorMaxRepsAtWeight > 0 && set.reps > priorMaxRepsAtWeight) {
          setPrBroken.push('REPS_AT_WEIGHT');
        }
      }

      // Update running bests
      currentPrRecord.bestE1RM = Math.max(currentPrRecord.bestE1RM, calculatedE1RM);
      currentPrRecord.bestSingleSetVolume = Math.max(
        currentPrRecord.bestSingleSetVolume,
        setVolume
      );
      currentPrRecord.maxRepsByWeight[weightKey] = Math.max(
        currentPrRecord.maxRepsByWeight[weightKey] ?? 0,
        set.reps
      );

      if (setPrBroken.length > 0) {
        const bucket =
          exerciseBrokenPrTypes[set.exerciseId] ??
          (exerciseBrokenPrTypes[set.exerciseId] = new Set<PrRecordBreakType>());
        for (const t of setPrBroken) bucket.add(t);
        exercisePrStatMap[set.exerciseId] = 'STRENGTH';
      }
    }

    evaluatedSets.push({
      exerciseId: set.exerciseId,
      reps: set.reps,
      weightKg: set.weightKg,
      isWarmup,
      setType: resolvedSetType,
      supersetGroupId: set.supersetGroupId ?? null,
      rpe: resolvedRpe,
      setVolume,
      calculatedE1RM,
      relativeIntensity,
      rawSetXp: rawXp,
      isPersonalRecord: setPrBroken.length > 0,
      prTypesBroken: setPrBroken,
    });
  }

  // Check exercise-wide Session Volume PRs
  for (const [exerciseId, totalSessionVol] of Object.entries(sessionVolumeByExercise)) {
    const roundedVol = roundTo2(totalSessionVol);
    const baselinePR = historicalPRs[exerciseId];
    if (baselinePR && baselinePR.bestSessionVolume > 0 && roundedVol > baselinePR.bestSessionVolume) {
      const bucket =
        exerciseBrokenPrTypes[exerciseId] ??
        (exerciseBrokenPrTypes[exerciseId] = new Set<PrRecordBreakType>());
      bucket.add('SESSION_VOLUME');
      exercisePrStatMap[exerciseId] = 'STRENGTH';
    }
    const prObj = updatedPRs[exerciseId];
    if (prObj) {
      prObj.bestSessionVolume = Math.max(prObj.bestSessionVolume, roundedVol);
    }
  }

  // 2. Evaluate Cardio Segments (Zones 1-3 -> END, Zones 4-5 -> AGI)
  let rawEnduranceXp = 0;
  let rawAgilityXp = 0;

  // Aggregate duration by (exerciseId, zone) for cardio PR checks & diminishing returns
  let totalEnduranceSeconds = 0;
  let weightedEnduranceRateSum = 0;

  let totalAgilitySeconds = 0;
  let weightedAgilityRateSum = 0;

  const sessionCardioSecByExerciseAndZone: Record<
    string,
    Partial<Record<HeartRateZone, number>>
  > = {};

  for (const segment of cardioSegments) {
    if (segment.durationSeconds <= 0) continue;

    // Dedicated ACTIVE_RECOVERY workouts give modest Zone 1 restoration XP + the +25% buff (via fatigue-manager)
    const zone = segment.averageHrZone;
    const modalityFactor = CARDIO_MODALITY_FACTORS[segment.activityType.toLowerCase()] ?? 1.0;

    if (zone === 1 || zone === 2 || zone === 3) {
      const perMin = ENDURANCE_XP_PER_MINUTE_BY_ZONE[zone] * modalityFactor;
      totalEnduranceSeconds += segment.durationSeconds;
      weightedEnduranceRateSum += segment.durationSeconds * perMin;
    } else {
      const perMin = AGILITY_XP_PER_MINUTE_BY_ZONE[zone] * modalityFactor;
      totalAgilitySeconds += segment.durationSeconds;
      weightedAgilityRateSum += segment.durationSeconds * perMin;
    }

    const exZoneMap =
      sessionCardioSecByExerciseAndZone[segment.exerciseId] ??
      (sessionCardioSecByExerciseAndZone[segment.exerciseId] = {});
    exZoneMap[zone] = (exZoneMap[zone] ?? 0) + segment.durationSeconds;
  }

  // Cardio Duration PR Detection in Target HR Zone (only against established prior session baselines)
  for (const [exerciseId, zoneTotals] of Object.entries(sessionCardioSecByExerciseAndZone)) {
    const baselinePR = historicalPRs[exerciseId];
    const currentPrRecord =
      updatedPRs[exerciseId] ??
      (updatedPRs[exerciseId] = {
        exerciseId,
        bestE1RM: 0,
        bestSingleSetVolume: 0,
        bestSessionVolume: 0,
        maxRepsByWeight: {},
        bestCardioDurationSecByZone: {},
      });

    for (const [zoneKey, sessionZoneSec] of Object.entries(zoneTotals)) {
      const zone = Number(zoneKey) as HeartRateZone;
      const durationSec = sessionZoneSec ?? 0;
      if (durationSec <= 0) continue;

      const priorZoneBest = baselinePR?.bestCardioDurationSecByZone[zone] ?? 0;
      if (priorZoneBest > 0 && durationSec > priorZoneBest) {
        const bucket =
          exerciseBrokenPrTypes[exerciseId] ??
          (exerciseBrokenPrTypes[exerciseId] = new Set<PrRecordBreakType>());
        bucket.add('CARDIO_ZONE_DURATION');
        exercisePrStatMap[exerciseId] = zone <= 3 ? 'ENDURANCE' : 'AGILITY';
      }

      currentPrRecord.bestCardioDurationSecByZone[zone] = Math.max(
        currentPrRecord.bestCardioDurationSecByZone[zone] ?? 0,
        durationSec
      );
    }
  }

  if (totalEnduranceSeconds > 0) {
    const avgEndRatePerMin = weightedEnduranceRateSum / totalEnduranceSeconds;
    rawEnduranceXp = roundTo2((totalEnduranceSeconds / 60) * avgEndRatePerMin);
  }

  if (totalAgilitySeconds > 0) {
    const avgAgiRatePerMin = weightedAgilityRateSum / totalAgilitySeconds;
    rawAgilityXp = roundTo2((totalAgilitySeconds / 60) * avgAgiRatePerMin);
  }

  // 3. Apply Healthy Session Threshold Diminishing Returns
  const diminishedStrengthXp = roundTo2(
    applyDiminishingReturns(
      rawStrengthXp,
      STRENGTH_HEALTHY_XP_THRESHOLD,
      STRENGTH_MODERATE_FATIGUE_XP_THRESHOLD,
      0.5,
      0.15
    )
  );

  const diminishedEnduranceXp =
    totalEnduranceSeconds > 0
      ? roundTo2(
          (applyDiminishingReturns(
            totalEnduranceSeconds,
            ENDURANCE_HEALTHY_SECONDS,
            ENDURANCE_EXTENDED_SECONDS,
            0.5,
            0.2
          ) /
            totalEnduranceSeconds) *
            rawEnduranceXp
        )
      : 0;

  const diminishedAgilityXp =
    totalAgilitySeconds > 0
      ? roundTo2(
          (applyDiminishingReturns(
            totalAgilitySeconds,
            AGILITY_HEALTHY_SECONDS,
            AGILITY_EXTENDED_SECONDS,
            0.45,
            0.15
          ) /
            totalAgilitySeconds) *
            rawAgilityXp
        )
      : 0;

  // 4. Evaluate Progressive Overload Crits ("Critical Training Bonus")
  const brokenEntries = Object.entries(exerciseBrokenPrTypes).map(([exerciseId, prSet]) => ({
    exerciseId,
    prTypes: Array.from(prSet),
    governingStat: exercisePrStatMap[exerciseId] ?? ('STRENGTH' as StatType),
  }));

  const bonusXpByStat: Record<StatType, number> = {
    STRENGTH: 0,
    ENDURANCE: 0,
    AGILITY: 0,
  };

  const cappedEntries = brokenEntries.slice(0, MAX_PR_CRITS_PER_SESSION);
  cappedEntries.forEach((entry, idx) => {
    const flatCritXp = idx === 0 ? PR_CRIT_PRIMARY_BONUS_XP : PR_CRIT_ADDITIONAL_BONUS_XP;
    bonusXpByStat[entry.governingStat] += flatCritXp;
  });

  const totalBonusXp =
    bonusXpByStat.STRENGTH + bonusXpByStat.ENDURANCE + bonusXpByStat.AGILITY;
  const triggeredPrCrit = brokenEntries.length > 0;
  const guaranteedLootDrop = triggeredPrCrit ? rollPrCritLootDrop(rngSeed) : null;

  // 5. Apply XP Multipliers + Add Flat Critical Training Bonus XP
  const finalStrengthXp = Math.round(
    diminishedStrengthXp * xpMultiplier + bonusXpByStat.STRENGTH
  );
  const finalEnduranceXp = Math.round(
    diminishedEnduranceXp * xpMultiplier + bonusXpByStat.ENDURANCE
  );
  const finalAgilityXp = Math.round(
    diminishedAgilityXp * xpMultiplier + bonusXpByStat.AGILITY
  );

  return {
    rawXp: {
      STRENGTH: roundTo2(rawStrengthXp),
      ENDURANCE: roundTo2(rawEnduranceXp),
      AGILITY: roundTo2(rawAgilityXp),
    },
    diminishedXpBeforeMultiplier: {
      STRENGTH: diminishedStrengthXp,
      ENDURANCE: diminishedEnduranceXp,
      AGILITY: diminishedAgilityXp,
    },
    xpMultiplierApplied: roundTo2(xpMultiplier),
    finalXpAwarded: {
      STRENGTH: finalStrengthXp,
      ENDURANCE: finalEnduranceXp,
      AGILITY: finalAgilityXp,
    },
    evaluatedSets,
    criticalTrainingBonus: {
      triggered: triggeredPrCrit,
      prBreakCount: brokenEntries.length,
      brokenRecords: brokenEntries,
      bonusXpByStat,
      totalBonusXp,
      guaranteedLootDrop,
    },
    updatedPRs,
  };
}

// ============================================================================
// STAT LEVELING & STAT-SPECIFIC TALENT POINT PROGRESSION
// ============================================================================

/**
 * XP required to advance from `level` to `level + 1`.
 * Smooth polynomial curve: Level 1->2 requires 200 XP, scaling steadily.
 */
export function xpRequiredForStatLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.round(150 + 50 * Math.pow(safeLevel, 1.35));
}

/**
 * Applies earned Stat XP to a core stat, advancing levels and awarding 1 matching
 * Stat Talent Point per level gained.
 */
export function applyStatXpProgression(
  currentLevel: number,
  currentXp: number,
  xpGained: number
): StatLevelProgressionResult {
  let level = Math.max(1, Math.floor(currentLevel));
  let xp = Math.max(0, currentXp) + Math.max(0, Math.floor(xpGained));
  let levelsGained = 0;

  while (xp >= xpRequiredForStatLevel(level)) {
    xp -= xpRequiredForStatLevel(level);
    level += 1;
    levelsGained += 1;
  }

  return {
    previousLevel: Math.max(1, Math.floor(currentLevel)),
    newLevel: level,
    levelsGained,
    remainingXp: xp,
    nextLevelXpRequired: xpRequiredForStatLevel(level),
    talentPointsEarned: levelsGained,
  };
}
