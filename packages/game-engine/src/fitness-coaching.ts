import {
  ExerciseMuscleLookupMeta,
  HypertrophyMuscleGroup,
  MuscleVolumeLandmarkStatus,
  calculateWeeklyMuscleVolumeLandmarks,
} from './intra-workout-ergonomics';
import {
  FatigueStateSnapshot,
  createInitialFatigueState,
  evaluateFatigueStateAtTime,
  getAvailableStrenuousXpMultiplier,
  getSystemicFatigueCombatPenalties,
} from './fatigue-manager';
import { CompletedWorkoutRecord } from './training-history-tracker';
import {
  STARTER_WORKOUT_PRESETS,
  WorkoutCategory,
  WorkoutPresetDefinition,
  WorkoutPresetExerciseBlock,
  WorkoutPresetSetTemplate,
  isWarmupSetType,
} from './workout-presets-rest';

// ============================================================================
// 1. DELOAD ALERTS
// ============================================================================

export type DeloadSeverity = 'NONE' | 'WATCH' | 'RECOMMENDED' | 'URGENT';

export interface DeloadAlertSummary {
  severity: DeloadSeverity;
  shouldDeload: boolean;
  headline: string;
  explanation: string;
  overMrvMuscles: HypertrophyMuscleGroup[];
  approachingMrvMuscles: HypertrophyMuscleGroup[];
  systemicFatigueStacks: number;
  fatigueScore: number;
  consecutiveHighIntensityDays: number;
  prescribedVolumeReductionPct: number;
  prescribedRpeCap: number;
}

/**
 * Evaluates weekly hypertrophy volume landmarks and systemic fatigue state to
 * deterministically prescribe deload severity, volume cuts, and RPE caps.
 */
export function evaluateDeloadAlert(params: {
  landmarks: readonly MuscleVolumeLandmarkStatus[];
  fatigueState: FatigueStateSnapshot;
}): DeloadAlertSummary {
  const { landmarks, fatigueState } = params;

  const overMrvMuscles = landmarks
    .filter((l) => l.zone === 'OVER_MRV')
    .map((l) => l.muscleGroup);
  const approachingMrvMuscles = landmarks
    .filter((l) => l.zone === 'APPROACHING_MRV')
    .map((l) => l.muscleGroup);

  const {
    systemicFatigueStacks,
    fatigueScore,
    consecutiveHighIntensityDays,
  } = fatigueState;

  if (
    systemicFatigueStacks >= 3 ||
    overMrvMuscles.length >= 2 ||
    (fatigueScore >= 85 && consecutiveHighIntensityDays >= 5)
  ) {
    return {
      severity: 'URGENT',
      shouldDeload: true,
      headline: 'Urgent Systemic Deload Required',
      explanation:
        'Multiple over-MRV muscle groups or high systemic fatigue stacks detected. Cut working sets by 50% and cap intensity at RPE 6.5.',
      overMrvMuscles,
      approachingMrvMuscles,
      systemicFatigueStacks,
      fatigueScore,
      consecutiveHighIntensityDays,
      prescribedVolumeReductionPct: 50,
      prescribedRpeCap: 6.5,
    };
  }

  if (
    systemicFatigueStacks >= 1 ||
    overMrvMuscles.length === 1 ||
    fatigueScore >= 70 ||
    consecutiveHighIntensityDays >= 4
  ) {
    return {
      severity: 'RECOMMENDED',
      shouldDeload: true,
      headline: 'Deload Week Recommended',
      explanation:
        'Accumulated fatigue or local MRV exceedance warrants a planned deload. Reduce working sets by 35% and cap effort at RPE 7.0.',
      overMrvMuscles,
      approachingMrvMuscles,
      systemicFatigueStacks,
      fatigueScore,
      consecutiveHighIntensityDays,
      prescribedVolumeReductionPct: 35,
      prescribedRpeCap: 7.0,
    };
  }

  if (approachingMrvMuscles.length >= 2 || fatigueScore >= 55) {
    return {
      severity: 'WATCH',
      shouldDeload: false,
      headline: 'Fatigue Watch — Monitor Recovery',
      explanation:
        'Volume is approaching peak MRV in multiple muscles or fatigue is climbing. Trim 15% volume if bar speed slows and cap sets at RPE 8.5.',
      overMrvMuscles,
      approachingMrvMuscles,
      systemicFatigueStacks,
      fatigueScore,
      consecutiveHighIntensityDays,
      prescribedVolumeReductionPct: 15,
      prescribedRpeCap: 8.5,
    };
  }

  return {
    severity: 'NONE',
    shouldDeload: false,
    headline: 'Ready for Productive Overload',
    explanation:
      'Systemic fatigue and weekly muscle volume are within productive limits. Push working sets cleanly up to RPE 9.5.',
    overMrvMuscles,
    approachingMrvMuscles,
    systemicFatigueStacks,
    fatigueScore,
    consecutiveHighIntensityDays,
    prescribedVolumeReductionPct: 0,
    prescribedRpeCap: 9.5,
  };
}

// ============================================================================
// 2. DETERMINISTIC SPLIT RECOMMENDATIONS
// ============================================================================

export type SplitRecommendationType =
  | 'UPPER_PUSH_PULL'
  | 'LOWER_LEGS_CORE'
  | 'PUSH_CHEST_SHOULDERS'
  | 'PULL_BACK_ARMS'
  | 'FULL_BODY_BALANCED'
  | 'ACTIVE_RECOVERY_DELOAD'
  | 'AEROBIC_CONDITIONING';

export interface SplitRecommendation {
  splitType: SplitRecommendationType;
  title: string;
  rationale: string;
  priorityMuscles: HypertrophyMuscleGroup[];
  recoveringMuscles: HypertrophyMuscleGroup[];
  suggestedPresetId: string | null;
  suggestedPresetSlug: string | null;
  suggestedCategory: WorkoutCategory;
  recommendedWorkingSetsPerMuscle: number;
}

const ALL_MUSCLE_GROUPS: readonly HypertrophyMuscleGroup[] = [
  'Chest',
  'Back',
  'Shoulders',
  'Legs',
  'Arms',
  'Core',
];

const ZONE_PRIORITY_SCORE: Record<MuscleVolumeLandmarkStatus['zone'], number> = {
  UNDER_MEV: 3,
  MEV_TO_MAV: 2,
  OPTIMAL_MAV: 0.5,
  APPROACHING_MRV: -2,
  OVER_MRV: -5,
};

interface SplitCandidateSpec {
  splitType: Exclude<
    SplitRecommendationType,
    'ACTIVE_RECOVERY_DELOAD' | 'AEROBIC_CONDITIONING'
  >;
  title: string;
  targetMuscles: readonly HypertrophyMuscleGroup[];
  suggestedPresetId: string | null;
  suggestedPresetSlug: string | null;
  suggestedCategory: WorkoutCategory;
  requireAllUnderBaseline?: boolean;
}

const UPPER_PUSH_PULL_CANDIDATE: SplitCandidateSpec = {
  splitType: 'UPPER_PUSH_PULL',
  title: 'Upper Body Push/Pull Hypertrophy',
  targetMuscles: ['Chest', 'Back', 'Shoulders', 'Arms'],
  suggestedPresetId: 'preset_upper_a_push_pull',
  suggestedPresetSlug: 'upper_body_strength_hypertrophy_a',
  suggestedCategory: 'GYM',
};

const SPLIT_CANDIDATES: readonly SplitCandidateSpec[] = [
  {
    splitType: 'FULL_BODY_BALANCED',
    title: 'Full Body Balanced Foundation',
    targetMuscles: ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core'],
    suggestedPresetId: 'preset_sanctum_fullbody_a',
    suggestedPresetSlug: 'sanctum_foundation_full_body_a',
    suggestedCategory: 'GYM',
    requireAllUnderBaseline: true,
  },
  UPPER_PUSH_PULL_CANDIDATE,
  {
    splitType: 'LOWER_LEGS_CORE',
    title: 'Lower Body Strength & Core',
    targetMuscles: ['Legs', 'Core'],
    suggestedPresetId: 'preset_iron_vanguard_lower_a',
    suggestedPresetSlug: 'iron_vanguard_lower_a',
    suggestedCategory: 'GYM',
  },
  {
    splitType: 'PUSH_CHEST_SHOULDERS',
    title: 'Push Focus (Chest & Shoulders)',
    targetMuscles: ['Chest', 'Shoulders'],
    suggestedPresetId: null,
    suggestedPresetSlug: null,
    suggestedCategory: 'GYM',
  },
  {
    splitType: 'PULL_BACK_ARMS',
    title: 'Pull Focus (Back & Arms)',
    targetMuscles: ['Back', 'Arms'],
    suggestedPresetId: 'preset_upper_b_torso_arms',
    suggestedPresetSlug: 'upper_body_torso_arms_b',
    suggestedCategory: 'GYM',
  },
];

/**
 * Deterministically recommends the next training split based on weekly MEV/MAV/MRV
 * landmark zones and systemic fatigue/deload status.
 */
export function recommendNextTrainingSplit(params: {
  landmarks: readonly MuscleVolumeLandmarkStatus[];
  deloadAlert: DeloadAlertSummary;
  fatigueState?: FatigueStateSnapshot;
}): SplitRecommendation {
  const { landmarks, deloadAlert } = params;

  const zoneByMuscle = new Map<HypertrophyMuscleGroup, MuscleVolumeLandmarkStatus['zone']>();
  for (const lm of landmarks) {
    zoneByMuscle.set(lm.muscleGroup, lm.zone);
  }

  const priorityMuscles = ALL_MUSCLE_GROUPS.filter((m) => {
    const z = zoneByMuscle.get(m) ?? 'UNDER_MEV';
    return z === 'UNDER_MEV' || z === 'MEV_TO_MAV';
  });

  const recoveringMuscles = ALL_MUSCLE_GROUPS.filter((m) => {
    const z = zoneByMuscle.get(m);
    return z === 'APPROACHING_MRV' || z === 'OVER_MRV';
  });

  if (
    deloadAlert.shouldDeload &&
    (deloadAlert.severity === 'URGENT' || deloadAlert.systemicFatigueStacks >= 2)
  ) {
    return {
      splitType: 'ACTIVE_RECOVERY_DELOAD',
      title: 'Active Recovery & Mobility Deload',
      rationale:
        'Urgent fatigue or multi-stack systemic strain detected. Prioritize Zone 1 movement and mobility to clear fatigue and prime +25% XP.',
      priorityMuscles,
      recoveringMuscles,
      suggestedPresetId: null,
      suggestedPresetSlug: null,
      suggestedCategory: 'RECOVERY',
      recommendedWorkingSetsPerMuscle: 2,
    };
  }

  const allAtOrAboveOptimalMav = ALL_MUSCLE_GROUPS.every((m) => {
    const z = zoneByMuscle.get(m);
    return z === 'OPTIMAL_MAV' || z === 'APPROACHING_MRV' || z === 'OVER_MRV';
  });

  if (allAtOrAboveOptimalMav && !deloadAlert.shouldDeload) {
    return {
      splitType: 'AEROBIC_CONDITIONING',
      title: 'Aerobic Tempo & Conditioning Session',
      rationale:
        'All six muscle groups have reached Optimal MAV or higher this week. Shift to Zone 3/4 outdoor cycling to build Endurance and VO2 Max without adding local lifting fatigue.',
      priorityMuscles,
      recoveringMuscles,
      suggestedPresetId: 'preset_cardio_tempo_cycling',
      suggestedPresetSlug: 'zone3_4_outdoor_tempo_cycling',
      suggestedCategory: 'CARDIO',
      recommendedWorkingSetsPerMuscle: 0,
    };
  }

  const allUnderOrNearBaseline = ALL_MUSCLE_GROUPS.every((m) => {
    const z = zoneByMuscle.get(m) ?? 'UNDER_MEV';
    return z === 'UNDER_MEV' || z === 'MEV_TO_MAV';
  });

  let bestCandidate: SplitCandidateSpec = UPPER_PUSH_PULL_CANDIDATE;
  let bestScore = -Infinity;

  for (const candidate of SPLIT_CANDIDATES) {
    if (candidate.requireAllUnderBaseline && !allUnderOrNearBaseline) {
      continue;
    }

    const total = candidate.targetMuscles.reduce((sum, muscle) => {
      const zone = zoneByMuscle.get(muscle) ?? 'UNDER_MEV';
      return sum + ZONE_PRIORITY_SCORE[zone];
    }, 0);
    const averageScore = total / candidate.targetMuscles.length;

    if (averageScore > bestScore) {
      bestScore = averageScore;
      bestCandidate = candidate;
    }
  }

  const targetedPriority = bestCandidate.targetMuscles.filter((m) =>
    priorityMuscles.includes(m)
  );
  const focusList =
    targetedPriority.length > 0 ? targetedPriority.join(', ') : bestCandidate.targetMuscles.join(', ');

  let recommendedWorkingSetsPerMuscle = 4;
  if (deloadAlert.shouldDeload) {
    recommendedWorkingSetsPerMuscle = 2;
  } else if (
    deloadAlert.severity === 'WATCH' ||
    bestCandidate.splitType === 'FULL_BODY_BALANCED'
  ) {
    recommendedWorkingSetsPerMuscle = 3;
  }

  return {
    splitType: bestCandidate.splitType,
    title: bestCandidate.title,
    rationale: `Prioritizes ${focusList} to advance weekly working volume toward Optimal MAV while protecting recovering muscle groups.`,
    priorityMuscles,
    recoveringMuscles,
    suggestedPresetId: bestCandidate.suggestedPresetId,
    suggestedPresetSlug: bestCandidate.suggestedPresetSlug,
    suggestedCategory: bestCandidate.suggestedCategory,
    recommendedWorkingSetsPerMuscle,
  };
}

// ============================================================================
// 3. PROGRESSIVE OVERLOAD CUES
// ============================================================================

export type OverloadActionType =
  | 'ADD_WEIGHT'
  | 'ADD_REPS'
  | 'CONSOLIDATE_LOAD'
  | 'DELOAD_BACKOFF';

export interface ProgressiveOverloadCue {
  exerciseId: string;
  exerciseName: string;
  lastPerformedAtIso: string;
  previousWeightKg: number;
  previousReps: number;
  previousRpe: number | null;
  action: OverloadActionType;
  suggestedWeightKg: number;
  suggestedReps: number;
  targetRpe: number;
  cueText: string;
}

function roundToNearest2Point5(val: number): number {
  if (!Number.isFinite(val) || val <= 0) return 0;
  return Math.max(0, Math.round(val / 2.5) * 2.5);
}

function roundToHalfKg(val: number): number {
  if (!Number.isFinite(val) || val <= 0) return 0;
  return Math.max(0, Math.round(val * 2) / 2);
}

function isLowerBodyCompoundExercise(exerciseId: string, exerciseName: string): boolean {
  const combined = `${exerciseId} ${exerciseName}`.toLowerCase();
  return /squat|deadlift|split[_ ]squat/.test(combined);
}

/**
 * Scans recent completed resistance workouts newest-first and emits actionable
 * progressive overload targets per unique exercise.
 */
export function generateProgressiveOverloadCues(params: {
  workoutHistory: readonly CompletedWorkoutRecord[];
  deloadAlert?: DeloadAlertSummary;
  maxCues?: number;
}): ProgressiveOverloadCue[] {
  const maxCues = params.maxCues ?? 5;
  if (maxCues <= 0) return [];

  const sortedHistory = [...params.workoutHistory].sort(
    (a, b) => Date.parse(b.performedAtIso) - Date.parse(a.performedAtIso)
  );

  const seenExerciseIds = new Set<string>();
  const cues: ProgressiveOverloadCue[] = [];

  for (const workout of sortedHistory) {
    for (const ex of workout.exercises) {
      if (seenExerciseIds.has(ex.exerciseId)) continue;

      const workingSets = ex.sets.filter(
        (s) => s.reps > 0 && !isWarmupSetType(s.setType, s.isWarmup)
      );
      if (workingSets.length === 0) continue;

      seenExerciseIds.add(ex.exerciseId);

      const firstWorking = workingSets[0];
      if (!firstWorking) continue;

      let bestSet = firstWorking;
      for (const candidate of workingSets.slice(1)) {
        if (
          candidate.weightKg > bestSet.weightKg ||
          (candidate.weightKg === bestSet.weightKg && candidate.reps > bestSet.reps)
        ) {
          bestSet = candidate;
        }
      }

      const previousWeightKg = bestSet.weightKg;
      const previousReps = bestSet.reps;
      const previousRpe = bestSet.rpe ?? null;

      let action: OverloadActionType;
      let suggestedWeightKg: number;
      let suggestedReps: number;
      let targetRpe: number;
      let cueText: string;

      if (params.deloadAlert?.shouldDeload) {
        action = 'DELOAD_BACKOFF';
        suggestedWeightKg = roundToNearest2Point5(previousWeightKg * 0.85);
        suggestedReps = previousReps;
        targetRpe = params.deloadAlert.prescribedRpeCap;
        cueText = `Deload back-off: drop to ${suggestedWeightKg} kg × ${suggestedReps} at RPE ${targetRpe} to clear fatigue.`;
      } else if ((previousRpe ?? 8.0) <= 8.0 && previousReps >= 8) {
        action = 'ADD_WEIGHT';
        const increment = isLowerBodyCompoundExercise(ex.exerciseId, ex.exerciseName)
          ? 5
          : 2.5;
        suggestedWeightKg = roundToNearest2Point5(previousWeightKg + increment);
        suggestedReps = previousReps;
        targetRpe = 8.5;
        cueText = `Increase load by +${increment} kg to ${suggestedWeightKg} kg × ${suggestedReps} (target RPE 8.5).`;
      } else if ((previousRpe ?? 8.5) <= 9.0) {
        action = 'ADD_REPS';
        suggestedWeightKg = previousWeightKg;
        suggestedReps = previousReps + 1;
        targetRpe = 8.5;
        cueText = `Hold ${suggestedWeightKg} kg and push for ${suggestedReps} reps (+1 rep) at RPE 8.5.`;
      } else {
        action = 'CONSOLIDATE_LOAD';
        suggestedWeightKg = previousWeightKg;
        suggestedReps = previousReps;
        targetRpe = 8.5;
        cueText = `Consolidate ${suggestedWeightKg} kg × ${suggestedReps} with cleaner bar speed to bring RPE down toward 8.5.`;
      }

      cues.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        lastPerformedAtIso: workout.performedAtIso,
        previousWeightKg,
        previousReps,
        previousRpe,
        action,
        suggestedWeightKg,
        suggestedReps,
        targetRpe,
        cueText,
      });

      if (cues.length >= maxCues) {
        return cues;
      }
    }
  }

  return cues;
}

// ============================================================================
// 4. UNIFIED TRAINER COACHING REPORT
// ============================================================================

export interface TrainerCoachingReport {
  generatedAtIso: string;
  landmarks: MuscleVolumeLandmarkStatus[];
  projectedFatigue: FatigueStateSnapshot;
  nextWorkoutXpMultiplier: number;
  combatAccuracyPenaltyPct: number;
  deloadAlert: DeloadAlertSummary;
  splitRecommendation: SplitRecommendation;
  overloadCues: ProgressiveOverloadCue[];
  trainerDialoguePages: string[];
}

/**
 * Generates a unified deterministic coaching report combining weekly muscle volume
 * landmarks, projected fatigue/XP state, deload alerts, split advice, and overload cues.
 */
export function generateTrainerCoachingReport(params: {
  workoutHistory: readonly CompletedWorkoutRecord[];
  fatigueState?: FatigueStateSnapshot;
  exercisesCatalog?: readonly ExerciseMuscleLookupMeta[];
  referenceNowMs?: number;
}): TrainerCoachingReport {
  const nowMs = params.referenceNowMs ?? Date.now();
  const nowDate = new Date(nowMs);
  const generatedAtIso = nowDate.toISOString();

  const landmarks = calculateWeeklyMuscleVolumeLandmarks({
    workoutHistory: params.workoutHistory,
    exercisesCatalog: params.exercisesCatalog,
    referenceNowMs: nowMs,
  });

  const baseFatigue = params.fatigueState ?? createInitialFatigueState(nowDate);
  const projectedFatigue = evaluateFatigueStateAtTime(baseFatigue, nowDate);
  const nextWorkoutXpMultiplier = getAvailableStrenuousXpMultiplier(projectedFatigue);
  const combatPenalties = getSystemicFatigueCombatPenalties(
    projectedFatigue.systemicFatigueStacks
  );
  const combatAccuracyPenaltyPct = Math.round(
    (1 - combatPenalties.accuracyMultiplier) * 100
  );

  const deloadAlert = evaluateDeloadAlert({
    landmarks,
    fatigueState: projectedFatigue,
  });

  const splitRecommendation = recommendNextTrainingSplit({
    landmarks,
    deloadAlert,
    fatigueState: projectedFatigue,
  });

  const overloadCues = generateProgressiveOverloadCues({
    workoutHistory: params.workoutHistory,
    deloadAlert,
  });

  const underMevCount = landmarks.filter((l) => l.zone === 'UNDER_MEV').length;
  const page1 = deloadAlert.shouldDeload
    ? `${deloadAlert.headline}: ${deloadAlert.explanation} Next strenuous XP bonus: ${nextWorkoutXpMultiplier}x.`
    : `Volume check: ${underMevCount} muscle groups sit below MEV, fatigue score is ${projectedFatigue.fatigueScore}/100, and your next strenuous session carries a ${nextWorkoutXpMultiplier}x XP multiplier.`;

  const page2 = `Recommended Split — ${splitRecommendation.title}: ${splitRecommendation.rationale}`;

  const topCue = overloadCues[0];
  const page3 = topCue
    ? `Top Overload Target (${topCue.exerciseName}): ${topCue.cueText}`
    : 'Log your first resistance working sets to unlock exercise-by-exercise progressive overload cues.';

  return {
    generatedAtIso,
    landmarks,
    projectedFatigue,
    nextWorkoutXpMultiplier,
    combatAccuracyPenaltyPct,
    deloadAlert,
    splitRecommendation,
    overloadCues,
    trainerDialoguePages: [page1, page2, page3],
  };
}

// ============================================================================
// 5. MULTI-WEEK PROGRAM TEMPLATES
// ============================================================================

export interface ProgramWeekProgression {
  weekNumber: number;
  label: string;
  isDeloadWeek: boolean;
  setCountDelta: number;
  loadMultiplier: number;
  sessionRpeTarget: number;
  coachNote: string;
}

export interface ProgramDaySlot {
  dayIndex: number;
  dayLabel: string;
  focusSummary: string;
  category: WorkoutCategory;
  basePreset: WorkoutPresetDefinition;
}

export interface MultiWeekProgramTemplate {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  goalFocus: 'HYPERTROPHY' | 'HYBRID_ATHLETE' | 'BEGINNER_STRENGTH';
  daysPerWeek: number;
  weeksCount: number;
  weeks: readonly ProgramWeekProgression[];
  days: readonly ProgramDaySlot[];
}

const STANDARD_4WEEK_HYPERTROPHY_PROGRESSION: readonly ProgramWeekProgression[] = [
  {
    weekNumber: 1,
    label: 'Week 1 • Accumulation Base',
    isDeloadWeek: false,
    setCountDelta: 0,
    loadMultiplier: 1.0,
    sessionRpeTarget: 8.0,
    coachNote: 'Establish crisp technique and baseline working weights at RPE 8.0.',
  },
  {
    weekNumber: 2,
    label: 'Week 2 • Progressive Overload',
    isDeloadWeek: false,
    setCountDelta: 1,
    loadMultiplier: 1.025,
    sessionRpeTarget: 8.5,
    coachNote: 'Add +1 working set per lift and bump target load by +2.5%.',
  },
  {
    weekNumber: 3,
    label: 'Week 3 • Peak Overreach',
    isDeloadWeek: false,
    setCountDelta: 1,
    loadMultiplier: 1.05,
    sessionRpeTarget: 9.0,
    coachNote: 'Peak accumulation week: +1 working set and +5% load up to RPE 9.0.',
  },
  {
    weekNumber: 4,
    label: 'Week 4 • Systemic Deload',
    isDeloadWeek: true,
    setCountDelta: -1,
    loadMultiplier: 0.75,
    sessionRpeTarget: 6.5,
    coachNote: 'Cut working sets and reduce weight to 75% at RPE 6.5 to dissipate fatigue.',
  },
];

const LOWER_STRENGTH_A_PRESET: WorkoutPresetDefinition = {
  id: 'preset_iron_vanguard_lower_a',
  slug: 'iron_vanguard_lower_a',
  name: 'Lower Body Strength A (Squat & Posterior)',
  category: 'GYM',
  isSystemSeed: true,
  notes: 'Primary barbell squat strength paired with deadlift pulls, Bulgarian split squats, and rotational core power.',
  blocks: {
    sessionRpeTarget: 8.5,
    exerciseBlocks: [
      {
        blockId: 'la_1',
        exerciseSlug: 'barbell_squat',
        exerciseName: 'Barbell Back Squat',
        supersetGroupId: null,
        sets: [
          { setType: 'WARMUP', targetWeightKg: 60, targetReps: 8, targetRpe: 6.0 },
          { setType: 'NORMAL', targetWeightKg: 100, targetReps: 6, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 100, targetReps: 6, targetRpe: 8.5 },
          { setType: 'NORMAL', targetWeightKg: 100, targetReps: 6, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'la_2',
        exerciseSlug: 'conventional_deadlift',
        exerciseName: 'Barbell Deadlift',
        supersetGroupId: null,
        sets: [
          { setType: 'WARMUP', targetWeightKg: 80, targetReps: 5, targetRpe: 6.0 },
          { setType: 'NORMAL', targetWeightKg: 125, targetReps: 5, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 125, targetReps: 5, targetRpe: 8.5 },
          { setType: 'NORMAL', targetWeightKg: 125, targetReps: 5, targetRpe: 9.0 },
        ],
      },
      {
        blockId: 'la_3',
        exerciseSlug: 'dumbbell_bulgarian_split_squat',
        exerciseName: 'Dumbbell Bulgarian Split Squat',
        supersetGroupId: 'ss_lower_a_1',
        sets: [
          { setType: 'NORMAL', targetWeightKg: 24, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 24, targetReps: 10, targetRpe: 8.5 },
          { setType: 'NORMAL', targetWeightKg: 24, targetReps: 10, targetRpe: 9.0 },
        ],
      },
      {
        blockId: 'la_4',
        exerciseSlug: 'landmine_rotational_press',
        exerciseName: 'Landmine Rotational Core Press',
        supersetGroupId: 'ss_lower_a_1',
        sets: [
          { setType: 'NORMAL', targetWeightKg: 25, targetReps: 12, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 25, targetReps: 12, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 25, targetReps: 12, targetRpe: 8.5 },
        ],
      },
    ],
    cardioSegments: [],
  },
};

const LOWER_HYPERTROPHY_B_PRESET: WorkoutPresetDefinition = {
  id: 'preset_iron_vanguard_lower_b',
  slug: 'iron_vanguard_lower_b',
  name: 'Lower Body Hypertrophy B (Posterior & Unilateral)',
  category: 'GYM',
  isSystemSeed: true,
  notes: 'Posterior-chain hinge focus followed by higher-rep squat volume, unilateral split squats, and core anti-rotation.',
  blocks: {
    sessionRpeTarget: 8.5,
    exerciseBlocks: [
      {
        blockId: 'lb_1',
        exerciseSlug: 'conventional_deadlift',
        exerciseName: 'Barbell Deadlift',
        supersetGroupId: null,
        sets: [
          { setType: 'WARMUP', targetWeightKg: 75, targetReps: 5, targetRpe: 6.0 },
          { setType: 'NORMAL', targetWeightKg: 115, targetReps: 6, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 115, targetReps: 6, targetRpe: 8.5 },
          { setType: 'NORMAL', targetWeightKg: 115, targetReps: 6, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'lb_2',
        exerciseSlug: 'dumbbell_bulgarian_split_squat',
        exerciseName: 'Dumbbell Bulgarian Split Squat',
        supersetGroupId: null,
        sets: [
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 12, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 12, targetRpe: 8.5 },
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 12, targetRpe: 9.0 },
        ],
      },
      {
        blockId: 'lb_3',
        exerciseSlug: 'barbell_squat',
        exerciseName: 'Barbell Back Squat',
        supersetGroupId: 'ss_lower_b_1',
        sets: [
          { setType: 'NORMAL', targetWeightKg: 85, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 85, targetReps: 10, targetRpe: 8.5 },
          { setType: 'NORMAL', targetWeightKg: 85, targetReps: 10, targetRpe: 9.0 },
        ],
      },
      {
        blockId: 'lb_4',
        exerciseSlug: 'landmine_rotational_press',
        exerciseName: 'Landmine Rotational Core Press',
        supersetGroupId: 'ss_lower_b_1',
        sets: [
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 14, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 14, targetRpe: 8.5 },
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 14, targetRpe: 8.5 },
        ],
      },
    ],
    cardioSegments: [],
  },
};

const FULL_BODY_DAY_A_PRESET: WorkoutPresetDefinition = {
  id: 'preset_sanctum_fullbody_a',
  slug: 'sanctum_foundation_full_body_a',
  name: 'Sanctum Full Body A',
  category: 'GYM',
  isSystemSeed: true,
  notes: 'Balanced compound foundation hitting squat, incline press, weighted pull-up, and core.',
  blocks: {
    sessionRpeTarget: 8.0,
    exerciseBlocks: [
      {
        blockId: 'fba_1',
        exerciseSlug: 'barbell_squat',
        exerciseName: 'Barbell Back Squat',
        supersetGroupId: null,
        sets: [
          { setType: 'WARMUP', targetWeightKg: 50, targetReps: 8, targetRpe: 6.0 },
          { setType: 'NORMAL', targetWeightKg: 80, targetReps: 8, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 80, targetReps: 8, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 80, targetReps: 8, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'fba_2',
        exerciseSlug: 'smith_incline_bench_press',
        exerciseName: 'Smith Machine Incline Bench Press',
        supersetGroupId: 'ss_fb_a_1',
        sets: [
          { setType: 'NORMAL', targetWeightKg: 60, targetReps: 8, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 60, targetReps: 8, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 60, targetReps: 8, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'fba_3',
        exerciseSlug: 'weighted_pullup',
        exerciseName: 'Weighted Pull-Ups / Chin-Ups',
        supersetGroupId: 'ss_fb_a_1',
        sets: [
          { setType: 'NORMAL', targetWeightKg: 10, targetReps: 8, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 10, targetReps: 8, targetRpe: 8.5 },
          { setType: 'NORMAL', targetWeightKg: 10, targetReps: 8, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'fba_4',
        exerciseSlug: 'landmine_rotational_press',
        exerciseName: 'Landmine Rotational Core Press',
        supersetGroupId: null,
        sets: [
          { setType: 'NORMAL', targetWeightKg: 20, targetReps: 12, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 20, targetReps: 12, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 20, targetReps: 12, targetRpe: 8.5 },
        ],
      },
    ],
    cardioSegments: [],
  },
};

const FULL_BODY_DAY_B_PRESET: WorkoutPresetDefinition = {
  id: 'preset_sanctum_fullbody_b',
  slug: 'sanctum_foundation_full_body_b',
  name: 'Sanctum Full Body B',
  category: 'GYM',
  isSystemSeed: true,
  notes: 'Deadlift hinge, seated dumbbell shoulder press, and heavy unilateral dumbbell row.',
  blocks: {
    sessionRpeTarget: 8.0,
    exerciseBlocks: [
      {
        blockId: 'fbb_1',
        exerciseSlug: 'conventional_deadlift',
        exerciseName: 'Barbell Deadlift',
        supersetGroupId: null,
        sets: [
          { setType: 'WARMUP', targetWeightKg: 60, targetReps: 5, targetRpe: 6.0 },
          { setType: 'NORMAL', targetWeightKg: 100, targetReps: 5, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 100, targetReps: 5, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 100, targetReps: 5, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'fbb_2',
        exerciseSlug: 'dumbbell_seated_ohp',
        exerciseName: 'Dumbbell Seated Overhead Press',
        supersetGroupId: 'ss_fb_b_1',
        sets: [
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 10, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'fbb_3',
        exerciseSlug: 'heavy_single_arm_db_row',
        exerciseName: 'Heavy Single-Arm Dumbbell Row',
        supersetGroupId: 'ss_fb_b_1',
        sets: [
          { setType: 'NORMAL', targetWeightKg: 30, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 30, targetReps: 10, targetRpe: 8.5 },
          { setType: 'NORMAL', targetWeightKg: 30, targetReps: 10, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'fbb_4',
        exerciseSlug: 'dumbbell_bulgarian_split_squat',
        exerciseName: 'Dumbbell Bulgarian Split Squat',
        supersetGroupId: null,
        sets: [
          { setType: 'NORMAL', targetWeightKg: 18, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 18, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 18, targetReps: 10, targetRpe: 8.5 },
        ],
      },
    ],
    cardioSegments: [],
  },
};

const FULL_BODY_DAY_C_PRESET: WorkoutPresetDefinition = {
  id: 'preset_sanctum_fullbody_c',
  slug: 'sanctum_foundation_full_body_c',
  name: 'Sanctum Full Body C',
  category: 'GYM',
  isSystemSeed: true,
  notes: 'Flat dumbbell press, dual cable pulldown, split squat stability, and rotational core.',
  blocks: {
    sessionRpeTarget: 8.0,
    exerciseBlocks: [
      {
        blockId: 'fbc_1',
        exerciseSlug: 'dumbbell_flat_bench_press',
        exerciseName: 'Dumbbell Flat Bench Press',
        supersetGroupId: 'ss_fb_c_1',
        sets: [
          { setType: 'NORMAL', targetWeightKg: 27.5, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 27.5, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 27.5, targetReps: 10, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'fbc_2',
        exerciseSlug: 'dual_cable_lat_pulldown',
        exerciseName: 'Dual Cable Lat Pulldown / Kneeling Row',
        supersetGroupId: 'ss_fb_c_1',
        sets: [
          { setType: 'NORMAL', targetWeightKg: 55, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 55, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 55, targetReps: 10, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'fbc_3',
        exerciseSlug: 'barbell_squat',
        exerciseName: 'Barbell Back Squat',
        supersetGroupId: null,
        sets: [
          { setType: 'NORMAL', targetWeightKg: 75, targetReps: 10, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 75, targetReps: 10, targetRpe: 8.5 },
          { setType: 'NORMAL', targetWeightKg: 75, targetReps: 10, targetRpe: 8.5 },
        ],
      },
      {
        blockId: 'fbc_4',
        exerciseSlug: 'landmine_rotational_press',
        exerciseName: 'Landmine Rotational Core Press',
        supersetGroupId: null,
        sets: [
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 12, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 12, targetRpe: 8.0 },
          { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 12, targetRpe: 8.5 },
        ],
      },
    ],
    cardioSegments: [],
  },
};

function requireStarterPreset(id: string): WorkoutPresetDefinition {
  const found = STARTER_WORKOUT_PRESETS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`Missing required starter workout preset: ${id}`);
  }
  return found;
}

export const MULTI_WEEK_WORKOUT_PROGRAMS: readonly MultiWeekProgramTemplate[] = [
  {
    id: 'program_iron_vanguard_upper_lower',
    slug: 'iron_vanguard_4w_upper_lower',
    name: 'Iron Vanguard 4-Week Upper/Lower',
    subtitle: '4-day hypertrophy & compound strength wave with Week 4 systemic deload.',
    goalFocus: 'HYPERTROPHY',
    daysPerWeek: 4,
    weeksCount: 4,
    weeks: STANDARD_4WEEK_HYPERTROPHY_PROGRESSION,
    days: [
      {
        dayIndex: 0,
        dayLabel: 'Day 1 • Upper A',
        focusSummary: 'Antagonist push/pull supersets (Smith incline, weighted pull-ups, cables).',
        category: 'GYM',
        basePreset: requireStarterPreset('preset_upper_a_push_pull'),
      },
      {
        dayIndex: 1,
        dayLabel: 'Day 2 • Lower A',
        focusSummary: 'Heavy squats, deadlifts, Bulgarian split squats & landmine core.',
        category: 'GYM',
        basePreset: LOWER_STRENGTH_A_PRESET,
      },
      {
        dayIndex: 2,
        dayLabel: 'Day 3 • Upper B',
        focusSummary: 'Weighted dips, heavy DB rows, landmine OHP & arm giant sets.',
        category: 'GYM',
        basePreset: requireStarterPreset('preset_upper_b_torso_arms'),
      },
      {
        dayIndex: 3,
        dayLabel: 'Day 4 • Lower B',
        focusSummary: 'Posterior hinge focus, unilateral leg hypertrophy & core rotation.',
        category: 'GYM',
        basePreset: LOWER_HYPERTROPHY_B_PRESET,
      },
    ],
  },
  {
    id: 'program_hybrid_ranger_concurrent',
    slug: 'hybrid_ranger_4w_concurrent',
    name: 'Hybrid Ranger 4-Week Strength & Conditioning',
    subtitle: '4-day concurrent strength, tempo cycling & combat sport conditioning.',
    goalFocus: 'HYBRID_ATHLETE',
    daysPerWeek: 4,
    weeksCount: 4,
    weeks: STANDARD_4WEEK_HYPERTROPHY_PROGRESSION,
    days: [
      {
        dayIndex: 0,
        dayLabel: 'Day 1 • Upper Strength',
        focusSummary: 'Upper push/pull strength & hypertrophy supersets.',
        category: 'GYM',
        basePreset: requireStarterPreset('preset_upper_a_push_pull'),
      },
      {
        dayIndex: 1,
        dayLabel: 'Day 2 • Tempo Cycling',
        focusSummary: 'Zone 3/4 outdoor road or gravel threshold ride.',
        category: 'CARDIO',
        basePreset: requireStarterPreset('preset_cardio_tempo_cycling'),
      },
      {
        dayIndex: 2,
        dayLabel: 'Day 3 • Lower Power',
        focusSummary: 'Squat, deadlift, split squat & rotational core power.',
        category: 'GYM',
        basePreset: LOWER_STRENGTH_A_PRESET,
      },
      {
        dayIndex: 3,
        dayLabel: 'Day 4 • Boxing Conditioning',
        focusSummary: 'Zone 4/5 heavy bag rounds & rotational core presses.',
        category: 'SPORT',
        basePreset: requireStarterPreset('preset_sport_boxing_bag'),
      },
    ],
  },
  {
    id: 'program_sanctum_foundation_fullbody',
    slug: 'sanctum_foundation_3d_fullbody',
    name: 'Sanctum Foundation 3-Day Full Body',
    subtitle: '3-day balanced compound progression ideal for consistent weekly MEV+.',
    goalFocus: 'BEGINNER_STRENGTH',
    daysPerWeek: 3,
    weeksCount: 4,
    weeks: STANDARD_4WEEK_HYPERTROPHY_PROGRESSION,
    days: [
      {
        dayIndex: 0,
        dayLabel: 'Day 1 • Full Body A',
        focusSummary: 'Back squat, Smith incline press, weighted pull-up & rotational core.',
        category: 'GYM',
        basePreset: FULL_BODY_DAY_A_PRESET,
      },
      {
        dayIndex: 1,
        dayLabel: 'Day 2 • Full Body B',
        focusSummary: 'Conventional deadlift, seated DB OHP, single-arm row & split squat.',
        category: 'GYM',
        basePreset: FULL_BODY_DAY_B_PRESET,
      },
      {
        dayIndex: 2,
        dayLabel: 'Day 3 • Full Body C',
        focusSummary: 'DB flat press, dual cable pulldown, squats & landmine core.',
        category: 'GYM',
        basePreset: FULL_BODY_DAY_C_PRESET,
      },
    ],
  },
];

function applyWeekProgressionToBlock(
  block: WorkoutPresetExerciseBlock,
  week: ProgramWeekProgression
): WorkoutPresetExerciseBlock {
  const warmupSets: WorkoutPresetSetTemplate[] = block.sets
    .filter((s) => isWarmupSetType(s.setType))
    .map((s) => ({
      ...s,
      targetWeightKg: roundToHalfKg(s.targetWeightKg * week.loadMultiplier),
    }));

  const rawWorkingSets = block.sets.filter((s) => !isWarmupSetType(s.setType));
  const baseWorkingSets = rawWorkingSets.length > 0 ? rawWorkingSets : block.sets;

  let adjustedWorkingSets: WorkoutPresetSetTemplate[] = baseWorkingSets.map((s) => ({
    ...s,
    targetWeightKg: roundToHalfKg(s.targetWeightKg * week.loadMultiplier),
    targetRpe: week.sessionRpeTarget,
  }));

  if (week.setCountDelta > 0 && adjustedWorkingSets.length > 0) {
    const normalIndex = adjustedWorkingSets.findIndex((s) => s.setType === 'NORMAL');
    const templateSet =
      normalIndex >= 0
        ? adjustedWorkingSets[normalIndex]
        : adjustedWorkingSets[adjustedWorkingSets.length - 1];
    const dropIndex = adjustedWorkingSets.findIndex((s) => s.setType === 'DROP_SET');

    if (templateSet) {
      for (let i = 0; i < week.setCountDelta; i += 1) {
        const clonedSet: WorkoutPresetSetTemplate = {
          ...templateSet,
          setType: templateSet.setType === 'DROP_SET' ? 'NORMAL' : templateSet.setType,
        };
        if (dropIndex >= 0) {
          adjustedWorkingSets.splice(dropIndex + i, 0, clonedSet);
        } else {
          adjustedWorkingSets.push(clonedSet);
        }
      }
    }
  } else if (week.setCountDelta < 0) {
    const targetCount = Math.max(1, adjustedWorkingSets.length + week.setCountDelta);
    adjustedWorkingSets = adjustedWorkingSets.slice(0, targetCount);
  }

  return {
    ...block,
    sets: [...warmupSets, ...adjustedWorkingSets],
  };
}

/**
 * Resolves a concrete, week-scaled WorkoutPresetDefinition for a multi-week
 * program day, applying load multipliers, working-set volume deltas, RPE caps,
 * and deload cardio reductions. Returns `null` if any lookup key is invalid.
 */
export function resolveProgramSessionPreset(
  programId: string,
  weekNumber: number,
  dayIndex: number
): WorkoutPresetDefinition | null {
  const program = MULTI_WEEK_WORKOUT_PROGRAMS.find(
    (p) => p.id === programId || p.slug === programId
  );
  if (!program) return null;

  const week = program.weeks.find((w) => w.weekNumber === weekNumber);
  if (!week) return null;

  const day = program.days.find((d) => d.dayIndex === dayIndex);
  if (!day) return null;

  const base = day.basePreset;

  return {
    ...base,
    id: `${base.id}_w${week.weekNumber}`,
    slug: `${base.slug}_w${week.weekNumber}`,
    name: `${program.name} • W${week.weekNumber} ${day.dayLabel}`,
    blocks: {
      sessionRpeTarget: week.sessionRpeTarget,
      exerciseBlocks: base.blocks.exerciseBlocks.map((block) =>
        applyWeekProgressionToBlock(block, week)
      ),
      cardioSegments: base.blocks.cardioSegments.map((seg) => ({
        ...seg,
        targetDurationMinutes: week.isDeloadWeek
          ? Math.max(10, Math.round((seg.targetDurationMinutes * 70) / 100))
          : seg.targetDurationMinutes,
        targetRpe: Math.min(
          seg.targetRpe ?? week.sessionRpeTarget,
          week.sessionRpeTarget
        ),
      })),
    },
  };
}
