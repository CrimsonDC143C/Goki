import { HeartRateZone, StatType, WorkoutSessionType } from './types';
import { CardioSegmentInput } from './workout-calculator';

// ============================================================================
// 1. WORKOUT CATEGORY GATEWAY & SET TYPES
// ============================================================================

export type WorkoutCategory = 'GYM' | 'CARDIO' | 'SPORT' | 'RECOVERY';

export type SetType = 'NORMAL' | 'WARMUP' | 'DROP_SET' | 'FAILURE' | 'AMRAP';

export const DROP_SET_XP_MULTIPLIER = 1.10; // +10% metabolic intensity multiplier on drop sets

export interface WorkoutCategoryDescriptor {
  key: WorkoutCategory;
  title: string;
  shortTitle: string;
  icon: string;
  subtitle: string;
  rpgStatFocus: string;
  defaultSessionType: WorkoutSessionType;
}

export const WORKOUT_CATEGORIES: readonly WorkoutCategoryDescriptor[] = [
  {
    key: 'GYM',
    title: 'Gym / Resistance Training',
    shortTitle: 'Gym / Resistance',
    icon: '🏋️',
    subtitle:
      'Supersets (A1/A2), Drop-Sets, Warm-Ups, Presets, RPE pills & Dynamic Rest Timer.',
    rpgStatFocus: 'STRENGTH (STR) • PR Crits • Melee & Armor',
    defaultSessionType: 'RESISTANCE',
  },
  {
    key: 'CARDIO',
    title: 'Cardio Training',
    shortTitle: 'Cardio',
    icon: '🚴',
    subtitle:
      'Outdoor Tempo/Threshold Cycling, Zone 2 Base Rides, Running & HR Zone 1–5 splits.',
    rpgStatFocus: 'ENDURANCE (Z1–Z3) & AGILITY/VO2 (Z4–Z5)',
    defaultSessionType: 'CARDIO_LOW_MOD',
  },
  {
    key: 'SPORT',
    title: 'Sport Training',
    shortTitle: 'Sport',
    icon: '🏸',
    subtitle:
      'Badminton Singles/Doubles, Heavy Bag & Shadow Boxing, Court/Ring Footwork Drills.',
    rpgStatFocus: 'AGILITY / STAMINA (Z4–Z5) + ENDURANCE (Z1–Z3)',
    defaultSessionType: 'CARDIO_HIGH_INTENSITY',
  },
  {
    key: 'RECOVERY',
    title: 'Active Recovery & Mobility',
    shortTitle: 'Active Recovery',
    icon: '🧘',
    subtitle:
      'Mobility flows, foam rolling & Zone 1 brisk walks to clear fatigue & prime +25% XP.',
    rpgStatFocus: '+25% Next-Session XP Buff • −1 Systemic Fatigue Stack',
    defaultSessionType: 'ACTIVE_RECOVERY',
  },
];

export interface SetTypeBadgeDescriptor {
  type: SetType;
  shortCode: 'N' | 'W' | 'D' | 'F';
  label: string;
  description: string;
}

export const SET_TYPE_DESCRIPTORS: readonly SetTypeBadgeDescriptor[] = [
  {
    type: 'NORMAL',
    shortCode: 'N',
    label: 'Normal Working Set',
    description: 'Full Relative Intensity XP and standard Dynamic Rest.',
  },
  {
    type: 'WARMUP',
    shortCode: 'W',
    label: 'Warm-Up Set',
    description: 'Excluded from working-set tonnage bloat; 45s plate-loading rest.',
  },
  {
    type: 'DROP_SET',
    shortCode: 'D',
    label: 'Drop-Set (+10% XP)',
    description: 'Linked to parent set; +10% metabolic XP & immediate weight-strip transition.',
  },
  {
    type: 'FAILURE',
    shortCode: 'F',
    label: 'Failure / AMRAP',
    description: '0 RIR muscular failure — defaults RPE to 10 with peak intensity bonus.',
  },
];

const SET_TYPE_CYCLE: readonly SetType[] = ['NORMAL', 'WARMUP', 'DROP_SET', 'FAILURE'];

export function cycleSetType(current: SetType): SetType {
  const normalized: SetType = current === 'AMRAP' ? 'FAILURE' : current;
  const idx = SET_TYPE_CYCLE.indexOf(normalized);
  return SET_TYPE_CYCLE[(idx + 1) % SET_TYPE_CYCLE.length] ?? 'NORMAL';
}

export function getSetTypeBadgeCode(setType?: SetType, isWarmup?: boolean): 'N' | 'W' | 'D' | 'F' {
  if (setType === 'WARMUP' || (!setType && isWarmup)) return 'W';
  if (setType === 'DROP_SET') return 'D';
  if (setType === 'FAILURE' || setType === 'AMRAP') return 'F';
  return 'N';
}

export function isWarmupSetType(setType?: SetType, isWarmup?: boolean): boolean {
  return setType === 'WARMUP' || Boolean(!setType && isWarmup);
}

export function resolveEffectiveSetRpe(
  rpe: number | null | undefined,
  setType?: SetType
): number | null {
  if (setType === 'FAILURE' || setType === 'AMRAP') {
    return rpe !== null && rpe !== undefined ? Math.max(rpe, 10) : 10;
  }
  return rpe ?? null;
}

export function categoryToDefaultWorkoutSessionType(
  category: WorkoutCategory,
  cardioSegments?: readonly CardioSegmentInput[],
  hasResistanceSets?: boolean
): WorkoutSessionType {
  if (hasResistanceSets && cardioSegments && cardioSegments.some((c) => c.durationSeconds > 0)) {
    return 'HYBRID';
  }
  if (category === 'GYM') {
    return 'RESISTANCE';
  }
  if (category === 'RECOVERY') {
    return 'ACTIVE_RECOVERY';
  }
  if (cardioSegments && cardioSegments.length > 0) {
    const maxZone = Math.max(...cardioSegments.map((c) => c.averageHrZone));
    return maxZone >= 4 ? 'CARDIO_HIGH_INTENSITY' : 'CARDIO_LOW_MOD';
  }
  return category === 'SPORT' ? 'CARDIO_HIGH_INTENSITY' : 'CARDIO_LOW_MOD';
}

// ============================================================================
// 2. SUPERSET GROUPING LABELS & ROUND NAVIGATION
// ============================================================================

export interface SupersetBlockBadge {
  supersetGroupId: string;
  groupLetter: string; // 'A', 'B', 'C', ...
  memberLabel: string; // 'A1', 'A2', 'B1', ...
  groupSummaryLabel: string; // 'Superset A: A1 / A2' or 'Circuit C: C1 / C2 / C3'
  memberIndex: number; // 0-based
  memberCount: number;
  colorIndex: number;
}

export function computeSupersetDisplayLabels(
  blocks: readonly { blockId: string; supersetGroupId?: string | null }[]
): Record<string, SupersetBlockBadge> {
  const groupMembers = new Map<string, string[]>();
  const orderedGroupIds: string[] = [];

  for (const b of blocks) {
    const gid = b.supersetGroupId?.trim();
    if (!gid) continue;
    const list = groupMembers.get(gid);
    if (list) {
      list.push(b.blockId);
    } else {
      groupMembers.set(gid, [b.blockId]);
      orderedGroupIds.push(gid);
    }
  }

  const activeGroups = orderedGroupIds.filter((gid) => (groupMembers.get(gid)?.length ?? 0) >= 2);
  const result: Record<string, SupersetBlockBadge> = {};

  activeGroups.forEach((gid, gIdx) => {
    const letter = String.fromCharCode(65 + (gIdx % 26)); // A, B, C...
    const members = groupMembers.get(gid) ?? [];
    const memberCodes = members.map((_, mIdx) => `${letter}${mIdx + 1}`);
    const prefix = members.length >= 3 ? `Giant Set ${letter}` : `Superset ${letter}`;
    const groupSummaryLabel = `${prefix}: ${memberCodes.join(' / ')}`;

    members.forEach((blockId, mIdx) => {
      result[blockId] = {
        supersetGroupId: gid,
        groupLetter: letter,
        memberLabel: `${letter}${mIdx + 1}`,
        groupSummaryLabel,
        memberIndex: mIdx,
        memberCount: members.length,
        colorIndex: gIdx,
      };
    });
  });

  return result;
}

/**
 * Given structured exercise blocks and the set that was just checked off, determines:
 * - Whether the next set on the SAME exercise is a `DROP_SET` (immediate weight-strip transition)
 * - Whether the exercise is inside a Superset round with remaining exercises in the same round (`A1 -> A2`)
 * - Which `(blockId, setId)` the UI should auto-focus next!
 */
export interface SetTransitionResolution {
  nextSameExerciseSetIsDropSet: boolean;
  isMidSupersetRound: boolean;
  nextSupersetExerciseName: string | null;
  nextSupersetMemberLabel: string | null;
  nextFocusBlockId: string | null;
  nextFocusSetId: string | null;
}

export function resolveSetCompletionTransition(params: {
  blocks: readonly {
    blockId: string;
    exerciseId: string;
    exerciseName?: string;
    supersetGroupId?: string | null;
    sets: readonly {
      id: string;
      setType?: SetType;
      isWarmup?: boolean;
      completed: boolean;
    }[];
  }[];
  completedBlockId: string;
  completedSetId: string;
}): SetTransitionResolution {
  const labels = computeSupersetDisplayLabels(params.blocks);
  const currentBlock = params.blocks.find((b) => b.blockId === params.completedBlockId);

  if (!currentBlock) {
    return {
      nextSameExerciseSetIsDropSet: false,
      isMidSupersetRound: false,
      nextSupersetExerciseName: null,
      nextSupersetMemberLabel: null,
      nextFocusBlockId: null,
      nextFocusSetId: null,
    };
  }

  const setIdx = currentBlock.sets.findIndex((s) => s.id === params.completedSetId);
  const nextRowSameBlock = setIdx >= 0 ? currentBlock.sets[setIdx + 1] : undefined;

  // 1. Drop-Set Chain takes top priority: finish stripping weight on current station before rotating!
  if (
    nextRowSameBlock &&
    !nextRowSameBlock.completed &&
    nextRowSameBlock.setType === 'DROP_SET'
  ) {
    return {
      nextSameExerciseSetIsDropSet: true,
      isMidSupersetRound: false,
      nextSupersetExerciseName: null,
      nextSupersetMemberLabel: null,
      nextFocusBlockId: currentBlock.blockId,
      nextFocusSetId: nextRowSameBlock.id,
    };
  }

  // 2. Superset Round Rotation (`A1 -> A2 -> ... -> round complete -> back to A1`)
  const badge = labels[currentBlock.blockId];
  const completedSetRow = setIdx >= 0 ? currentBlock.sets[setIdx] : undefined;
  const completedWasWarmup = isWarmupSetType(
    completedSetRow?.setType,
    completedSetRow?.isWarmup
  );

  if (badge && !completedWasWarmup) {
    const groupBlocks = params.blocks.filter(
      (b) => b.supersetGroupId === badge.supersetGroupId
    );
    const posInGroup = groupBlocks.findIndex((b) => b.blockId === currentBlock.blockId);

    // Look for a subsequent exercise in the superset (`A2`, `A3`) with an uncompleted working set
    for (let i = posInGroup + 1; i < groupBlocks.length; i += 1) {
      const candidateBlock = groupBlocks[i]!;
      const nextUnfinished = candidateBlock.sets.find(
        (s) => !s.completed && !isWarmupSetType(s.setType, s.isWarmup)
      );
      if (nextUnfinished) {
        const candidateBadge = labels[candidateBlock.blockId];
        return {
          nextSameExerciseSetIsDropSet: false,
          isMidSupersetRound: true,
          nextSupersetExerciseName: candidateBlock.exerciseName ?? candidateBlock.exerciseId,
          nextSupersetMemberLabel: candidateBadge?.memberLabel ?? null,
          nextFocusBlockId: candidateBlock.blockId,
          nextFocusSetId: nextUnfinished.id,
        };
      }
    }

    // End of superset round (`A2` finished) -> focus Round N+1 back at `A1` (full rest!)
    for (let i = 0; i <= posInGroup; i += 1) {
      const candidateBlock = groupBlocks[i]!;
      const nextUnfinished = candidateBlock.sets.find((s) => !s.completed);
      if (nextUnfinished) {
        return {
          nextSameExerciseSetIsDropSet: false,
          isMidSupersetRound: false,
          nextSupersetExerciseName: null,
          nextSupersetMemberLabel: null,
          nextFocusBlockId: candidateBlock.blockId,
          nextFocusSetId: nextUnfinished.id,
        };
      }
    }
  }

  // 3. Standard straight-set progression: next uncompleted row on current block, or next block
  const nextUnfinishedSame = currentBlock.sets.find(
    (s, idx) => idx > setIdx && !s.completed
  );
  if (nextUnfinishedSame) {
    return {
      nextSameExerciseSetIsDropSet: false,
      isMidSupersetRound: false,
      nextSupersetExerciseName: null,
      nextSupersetMemberLabel: null,
      nextFocusBlockId: currentBlock.blockId,
      nextFocusSetId: nextUnfinishedSame.id,
    };
  }

  for (const b of params.blocks) {
    if (b.blockId === currentBlock.blockId) continue;
    const unfinished = b.sets.find((s) => !s.completed);
    if (unfinished) {
      return {
        nextSameExerciseSetIsDropSet: false,
        isMidSupersetRound: false,
        nextSupersetExerciseName: null,
        nextSupersetMemberLabel: null,
        nextFocusBlockId: b.blockId,
        nextFocusSetId: unfinished.id,
      };
    }
  }

  return {
    nextSameExerciseSetIsDropSet: false,
    isMidSupersetRound: false,
    nextSupersetExerciseName: null,
    nextSupersetMemberLabel: null,
    nextFocusBlockId: null,
    nextFocusSetId: null,
  };
}

// ============================================================================
// 3. DYNAMIC REST TIMER ENGINE MATH (`calculateRecommendedRestSeconds`)
// ============================================================================

export type DynamicRestMode =
  | 'DROP_SET_TRANSITION'
  | 'SUPERSET_TRANSITION'
  | 'WARMUP_REST'
  | 'WORKING_REST';

export interface CalculateRecommendedRestInput {
  setType?: SetType;
  isWarmup?: boolean;
  /** True when the completed set is inside a superset and is NOT the final exercise in the round */
  isMidSupersetRound?: boolean;
  nextSupersetExerciseName?: string | null;
  nextSupersetMemberLabel?: string | null;
  /** True when the very next set on the same exercise is tagged `DROP_SET` */
  nextSameExerciseSetIsDropSet?: boolean;
  /** Exercise XP factor (`f_exercise >= 1.15` => 120s compound base; `< 1.15` => 75s isolation/cable base) */
  exerciseBaseXpFactor?: number;
  isCompound?: boolean;
  /** Relative intensity `I = weightKg / referenceE1RM` */
  relativeIntensity?: number;
  /** Perceived Exertion `6.0 - 10.0` */
  rpe?: number | null;
}

export interface DynamicRestPlan {
  seconds: number;
  mode: DynamicRestMode;
  headline: string;
  subtext: string;
  suppressFullRestTimer: boolean;
}

function clampSeconds(sec: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(sec)));
}

/**
 * Full physiological + structural Dynamic Rest plan supporting Drop-Set chains,
 * Superset intra-round transitions, Warm-Up plate loading, and Compound/Isolation +
 * Relative Intensity + RPE scaling.
 */
export function calculateDynamicRestPlan(
  input: CalculateRecommendedRestInput
): DynamicRestPlan {
  // 1. Drop-Set Chain: prompt immediate weight strip without starting a long rest timer
  if (input.nextSameExerciseSetIsDropSet) {
    return {
      seconds: 12,
      mode: 'DROP_SET_TRANSITION',
      headline: 'Immediate Drop Set — Strip Weight!',
      subtext:
        'Drop load ~20–30% immediately and continue to failure. Full rest starts after your final drop.',
      suppressFullRestTimer: true,
    };
  }

  // 2. Superset Intra-Round Transition (`A1 -> A2`)
  if (input.isMidSupersetRound) {
    const targetTag = input.nextSupersetMemberLabel
      ? `${input.nextSupersetMemberLabel}${
          input.nextSupersetExerciseName ? ` (${input.nextSupersetExerciseName})` : ''
        }`
      : input.nextSupersetExerciseName ?? 'next superset exercise';
    return {
      seconds: 25,
      mode: 'SUPERSET_TRANSITION',
      headline: 'Transition to next superset exercise',
      subtext: `Move briskly to ${targetTag}. Full recovery timer starts after completing the round.`,
      suppressFullRestTimer: false,
    };
  }

  // 3. Warm-Up Set (`WARMUP`) -> 45s-60s
  if (isWarmupSetType(input.setType, input.isWarmup)) {
    return {
      seconds: 45,
      mode: 'WARMUP_REST',
      headline: 'Warm-Up Plate Load (45s)',
      subtext: 'Adjust working plates while keeping neuromuscular potentiation warm.',
      suppressFullRestTimer: false,
    };
  }

  // 4. Standard / Final Working Set (or Final Drop in Drop-Set Chain / Final Superset Exercise)
  const factor = input.exerciseBaseXpFactor ?? (input.isCompound ? 1.15 : 1.0);
  const isCompoundBase = factor >= 1.15;
  let seconds = isCompoundBase ? 120 : 75;

  // Relative Intensity modifier: I = W / e1RM
  const rel = input.relativeIntensity;
  if (rel !== undefined && rel > 0) {
    if (rel >= 0.85) {
      seconds += 45;
    } else if (rel >= 0.75) {
      seconds += 15;
    } else if (rel < 0.65) {
      seconds -= 30;
    }
  }

  // RPE & Failure modifier
  const effectiveRpe = resolveEffectiveSetRpe(input.rpe, input.setType);
  if (
    input.setType === 'FAILURE' ||
    input.setType === 'AMRAP' ||
    (effectiveRpe !== null && effectiveRpe >= 9.5)
  ) {
    seconds += 30;
  } else if (effectiveRpe !== null && effectiveRpe >= 8.5) {
    seconds += 15;
  } else if (effectiveRpe !== null && effectiveRpe <= 7.0) {
    seconds -= 15;
  }

  const clamped = clampSeconds(seconds, 45, 240);
  const baseLabel = isCompoundBase ? 'Compound Recovery' : 'Cable / Isolation Recovery';

  return {
    seconds: clamped,
    mode: 'WORKING_REST',
    headline: `${baseLabel} (${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(
      2,
      '0'
    )})`,
    subtext: `Scaled for ${isCompoundBase ? 'compound CNS demand' : 'local metabolic recovery'}${
      effectiveRpe !== null ? ` @ RPE ${effectiveRpe}` : ''
    }${rel && rel > 0 ? ` (${Math.round(rel * 100)}% e1RM)` : ''}.`,
    suppressFullRestTimer: false,
  };
}

/**
 * Canonical numeric Dynamic Rest calculator specified in Section 2.D.1.
 */
export function calculateRecommendedRestSeconds(
  input: CalculateRecommendedRestInput
): number {
  return calculateDynamicRestPlan(input).seconds;
}

// ============================================================================
// 4. TAILORED EXERCISE & SPORT SEED CATALOG
// ============================================================================

export interface SeedExerciseDefinition {
  slug: string;
  name: string;
  category: 'RESISTANCE' | 'CARDIO' | 'RECOVERY_MOBILITY';
  workoutCategory: WorkoutCategory;
  primaryStat: StatType;
  muscleGroup: string;
  equipmentType: string;
  activityType?: string;
  isCompound: boolean;
  baseXpFactor: number;
  description: string;
}

/**
 * Tailored catalog covering:
 * - Altas Strength AL-3058G Smith Machine, Dual 1:1 200 lb Functional Trainer, Landmine & Pull-Up/Dip Station
 * - Pepin Adjustable Dumbbells (up to 85 lb)
 * - Competitive Badminton, Boxing, Outdoor Tempo & Zone 2 Cycling, and Daily Brisk Walks
 * - Classic barbell/cardio staples for backward compatibility
 */
export const DEFAULT_EXERCISE_CATALOG: readonly SeedExerciseDefinition[] = [
  // --- Smith Machine & Landmine (Compound STR) ---
  {
    slug: 'smith_incline_bench_press',
    name: 'Smith Machine Incline Bench Press',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'CHEST',
    equipmentType: 'SMITH_MACHINE',
    isCompound: true,
    baseXpFactor: 1.16,
    description: 'Guided upper-chest compound press on the Altas AL-3058G Smith track.',
  },
  {
    slug: 'smith_flat_bench_press',
    name: 'Smith Machine Flat Bench Press',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'CHEST',
    equipmentType: 'SMITH_MACHINE',
    isCompound: true,
    baseXpFactor: 1.16,
    description: 'High-stability horizontal chest press for heavy overload & safe failure sets.',
  },
  {
    slug: 'smith_close_grip_press',
    name: 'Smith Machine Close-Grip Press',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'TRICEPS',
    equipmentType: 'SMITH_MACHINE',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'Heavy triceps & lockout pressing movement on the Smith Machine.',
  },
  {
    slug: 'landmine_meadows_row',
    name: 'Landmine Single-Arm Meadows Row',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'BACK',
    equipmentType: 'LANDMINE',
    isCompound: true,
    baseXpFactor: 1.16,
    description: 'Unilateral upper-back & lat thickness pull via landmine pivot.',
  },
  {
    slug: 'landmine_viking_press',
    name: 'Landmine Viking / Shoulder Press',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'SHOULDERS',
    equipmentType: 'LANDMINE',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'Joint-friendly angled overhead press driving anterior delt & core power.',
  },
  {
    slug: 'landmine_rotational_press',
    name: 'Landmine Rotational Core Press',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'CORE',
    equipmentType: 'LANDMINE',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'Explosive anti-rotation & rotational power transfer for boxing & racquet sports.',
  },

  // --- Pepin Adjustable Dumbbells (up to 85 lb — STR) ---
  {
    slug: 'dumbbell_flat_bench_press',
    name: 'Dumbbell Flat Bench Press',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'CHEST',
    equipmentType: 'DUMBBELL',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'Deep-stretch horizontal press with Pepin adjustable dumbbells.',
  },
  {
    slug: 'dumbbell_incline_press',
    name: 'Dumbbell Incline Press',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'CHEST',
    equipmentType: 'DUMBBELL',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'Clavicular pec & front-delt press with independent arm stabilization.',
  },
  {
    slug: 'dumbbell_seated_ohp',
    name: 'Dumbbell Seated Overhead Press',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'SHOULDERS',
    equipmentType: 'DUMBBELL',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'Vertical shoulder hypertrophy & pressing strength staple.',
  },
  {
    slug: 'heavy_single_arm_db_row',
    name: 'Heavy Single-Arm Dumbbell Row',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'BACK',
    equipmentType: 'DUMBBELL',
    isCompound: true,
    baseXpFactor: 1.16,
    description: 'Bench-supported heavy unilateral row up to 85 lb.',
  },
  {
    slug: 'dumbbell_bulgarian_split_squat',
    name: 'Dumbbell Bulgarian Split Squat',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'LEGS',
    equipmentType: 'DUMBBELL',
    isCompound: true,
    baseXpFactor: 1.18,
    description: 'Single-leg quad, glute & court-lunge stability builder.',
  },
  {
    slug: 'dumbbell_incline_curl',
    name: 'Dumbbell Incline Curl',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'BICEPS',
    equipmentType: 'DUMBBELL',
    isCompound: false,
    baseXpFactor: 1.02,
    description: 'Lengthened-position long-head biceps isolation curl.',
  },
  {
    slug: 'dumbbell_lateral_raise',
    name: 'Dumbbell Lateral Raise',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'SHOULDERS',
    equipmentType: 'DUMBBELL',
    isCompound: false,
    baseXpFactor: 1.0,
    description: 'Medial deltoid width isolation movement.',
  },

  // --- Dual 1:1 Cable Functional Trainer & Calisthenics (STR) ---
  {
    slug: 'weighted_pullup',
    name: 'Weighted Pull-Ups / Chin-Ups',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'BACK',
    equipmentType: 'PULL_UP_DIP_STATION',
    isCompound: true,
    baseXpFactor: 1.18,
    description: 'Multi-grip vertical pulling strength on the integrated pull-up station.',
  },
  {
    slug: 'weighted_parallel_dips',
    name: 'Weighted Parallel Bar Dips',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'CHEST',
    equipmentType: 'PULL_UP_DIP_STATION',
    isCompound: true,
    baseXpFactor: 1.16,
    description: 'Lower-pec, shoulder & triceps compound dip on the dip attachment.',
  },
  {
    slug: 'dual_cable_chest_fly',
    name: 'Dual Cable Chest Fly (High-to-Low / Mid)',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'CHEST',
    equipmentType: 'DUAL_CABLE',
    isCompound: false,
    baseXpFactor: 1.04,
    description: 'Constant-tension converged chest adduction across dual 1:1 200 lb stacks.',
  },
  {
    slug: 'dual_cable_lat_pulldown',
    name: 'Dual Cable Lat Pulldown / Kneeling Row',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'BACK',
    equipmentType: 'DUAL_CABLE',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'Unilateral/dual-handle vertical & angled lat pull on the functional trainer.',
  },
  {
    slug: 'cable_lateral_raise',
    name: 'Cable Lateral Raise',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'SHOULDERS',
    equipmentType: 'DUAL_CABLE',
    isCompound: false,
    baseXpFactor: 1.02,
    description: 'Smooth resistance profile lateral deltoid raise ideal for drop-sets.',
  },
  {
    slug: 'cable_face_pulls',
    name: 'Cable Face Pulls',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'REAR_DELTS',
    equipmentType: 'DUAL_CABLE',
    isCompound: false,
    baseXpFactor: 1.02,
    description: 'Rear deltoid & external rotator cuff health staple for overhead sports.',
  },
  {
    slug: 'cable_rope_tricep_extension',
    name: 'Cable Rope Tricep Overhead Extension',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'TRICEPS',
    equipmentType: 'DUAL_CABLE',
    isCompound: false,
    baseXpFactor: 1.02,
    description: 'Long-head triceps stretch & lockout finisher on the cable stack.',
  },
  {
    slug: 'cable_bayesian_curl',
    name: 'Cable Bayesian Curl',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'BICEPS',
    equipmentType: 'DUAL_CABLE',
    isCompound: false,
    baseXpFactor: 1.02,
    description: 'Behind-the-body constant cable tension curl peaking in the stretched position.',
  },

  // --- Classic Barbell Staples (Preserved for Backward Compatibility) ---
  {
    slug: 'bench_press',
    name: 'Barbell Bench Press',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'CHEST',
    equipmentType: 'BARBELL',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'Horizontal barbell pressing power builder.',
  },
  {
    slug: 'barbell_squat',
    name: 'Barbell Back Squat',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'LEGS',
    equipmentType: 'BARBELL',
    isCompound: true,
    baseXpFactor: 1.18,
    description: 'Compound lower-body strength staple.',
  },
  {
    slug: 'conventional_deadlift',
    name: 'Barbell Deadlift',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'POSTERIOR_CHAIN',
    equipmentType: 'BARBELL',
    isCompound: true,
    baseXpFactor: 1.2,
    description: 'Full-body posterior chain pull.',
  },
  {
    slug: 'overhead_press',
    name: 'Standing Overhead Press',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'SHOULDERS',
    equipmentType: 'BARBELL',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'Strict vertical shoulder & core press.',
  },
  {
    slug: 'barbell_row',
    name: 'Bent-Over Barbell Row',
    category: 'RESISTANCE',
    workoutCategory: 'GYM',
    primaryStat: 'STRENGTH',
    muscleGroup: 'BACK',
    equipmentType: 'BARBELL',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'Upper-back pulling thickness builder.',
  },

  // --- Sport Modalities (Badminton & Boxing — AGI/STA & END) ---
  {
    slug: 'competitive_badminton',
    name: 'Competitive Badminton Session',
    category: 'CARDIO',
    workoutCategory: 'SPORT',
    primaryStat: 'AGILITY',
    muscleGroup: 'FULL_BODY',
    equipmentType: 'RACQUET_COURT',
    activityType: 'badminton',
    isCompound: true,
    baseXpFactor: 1.12,
    description: 'Singles/Doubles court play combining Zone 2/3 rally endurance & Zone 4/5 explosive lunges.',
  },
  {
    slug: 'boxing_session',
    name: 'Boxing Session (Heavy Bag / Shadow / Drills)',
    category: 'CARDIO',
    workoutCategory: 'SPORT',
    primaryStat: 'AGILITY',
    muscleGroup: 'ANAEROBIC',
    equipmentType: 'HEAVY_BAG',
    activityType: 'boxing',
    isCompound: true,
    baseXpFactor: 1.15,
    description: 'High Zone 4/5 anaerobic stamina, combination speed & head-movement conditioning.',
  },
  {
    slug: 'sport_footwork_drills',
    name: 'Court & Ring Footwork Agility Drills',
    category: 'CARDIO',
    workoutCategory: 'SPORT',
    primaryStat: 'AGILITY',
    muscleGroup: 'AGILITY_SPEED',
    equipmentType: 'NONE',
    activityType: 'sport',
    isCompound: true,
    baseXpFactor: 1.1,
    description: 'Split-step, shadow court recovery & ring pivot footwork intervals.',
  },

  // --- Cardio Modalities (Outdoor Cycling, Running, Rowing — END & AGI) ---
  {
    slug: 'outdoor_tempo_cycling',
    name: 'Outdoor Road / Gravel Cycling (Zone 3/4 Tempo & Threshold)',
    category: 'CARDIO',
    workoutCategory: 'CARDIO',
    primaryStat: 'AGILITY',
    muscleGroup: 'AEROBIC_THRESHOLD',
    equipmentType: 'ROAD_GRAVEL_BIKE',
    activityType: 'outdoor_cycling',
    isCompound: true,
    baseXpFactor: 1.08,
    description: 'Sustained outdoor tempo & threshold climbs yielding hybrid Endurance & VO2 Max XP.',
  },
  {
    slug: 'outdoor_zone2_cycling',
    name: 'Outdoor Cycling (Zone 2 Aerobic Base)',
    category: 'CARDIO',
    workoutCategory: 'CARDIO',
    primaryStat: 'ENDURANCE',
    muscleGroup: 'AEROBIC',
    equipmentType: 'ROAD_GRAVEL_BIKE',
    activityType: 'outdoor_cycling',
    isCompound: true,
    baseXpFactor: 1.05,
    description: 'Long steady-state outdoor ride maximizing mitochondrial Endurance XP.',
  },
  {
    slug: 'outdoor_run_endurance',
    name: 'Aerobic Run (Zones 1-3)',
    category: 'CARDIO',
    workoutCategory: 'CARDIO',
    primaryStat: 'ENDURANCE',
    muscleGroup: 'AEROBIC',
    equipmentType: 'NONE',
    activityType: 'running',
    isCompound: true,
    baseXpFactor: 1.05,
    description: 'Sustained Zone 2 road or trail running.',
  },
  {
    slug: 'indoor_cycling',
    name: 'Stationary / Indoor Cycling',
    category: 'CARDIO',
    workoutCategory: 'CARDIO',
    primaryStat: 'ENDURANCE',
    muscleGroup: 'AEROBIC',
    equipmentType: 'BIKE',
    activityType: 'cycling',
    isCompound: true,
    baseXpFactor: 1.0,
    description: 'Controlled indoor cadence & zone training.',
  },
  {
    slug: 'ergometer_rowing',
    name: 'Rowing Ergometer (HIIT / Tempo)',
    category: 'CARDIO',
    workoutCategory: 'CARDIO',
    primaryStat: 'AGILITY',
    muscleGroup: 'FULL_BODY',
    equipmentType: 'ERGOMETER',
    activityType: 'rowing',
    isCompound: true,
    baseXpFactor: 1.05,
    description: 'High-output rowing intervals for VO2 Max.',
  },
  {
    slug: 'sprint_intervals',
    name: 'Track / Assault Bike HIIT Sprints (Zones 4-5)',
    category: 'CARDIO',
    workoutCategory: 'CARDIO',
    primaryStat: 'AGILITY',
    muscleGroup: 'ANAEROBIC',
    equipmentType: 'NONE',
    activityType: 'running',
    isCompound: true,
    baseXpFactor: 1.1,
    description: 'Anaerobic threshold & VO2 Max intervals.',
  },

  // --- Active Recovery & Mobility (+25% XP Buff & Fatigue Relief) ---
  {
    slug: 'daily_brisk_walk',
    name: 'Daily Brisk Walk (5,000–8,000 Steps / Zone 1–2)',
    category: 'RECOVERY_MOBILITY',
    workoutCategory: 'RECOVERY',
    primaryStat: 'ENDURANCE',
    muscleGroup: 'AEROBIC',
    equipmentType: 'NONE',
    activityType: 'brisk_walk',
    isCompound: false,
    baseXpFactor: 1.0,
    description: 'Daily step target & active recovery walk clearing systemic fatigue stacks.',
  },
  {
    slug: 'mobility_yoga_flow',
    name: 'Mobility & Restoration Yoga',
    category: 'RECOVERY_MOBILITY',
    workoutCategory: 'RECOVERY',
    primaryStat: 'ENDURANCE',
    muscleGroup: 'FULL_BODY',
    equipmentType: 'MAT',
    activityType: 'recovery_mobility',
    isCompound: false,
    baseXpFactor: 1.0,
    description: 'Active recovery session granting +25% XP on next strenuous workout.',
  },
  {
    slug: 'zone1_recovery_walk',
    name: 'Foam Rolling, Thoracic & Hip Mobility Flow',
    category: 'RECOVERY_MOBILITY',
    workoutCategory: 'RECOVERY',
    primaryStat: 'ENDURANCE',
    muscleGroup: 'FULL_BODY',
    equipmentType: 'FOAM_ROLLER',
    activityType: 'recovery_mobility',
    isCompound: false,
    baseXpFactor: 1.0,
    description: 'Myofascial release & joint restoration session accelerating fatigue clearance.',
  },
];

// ============================================================================
// 5. WORKOUT PRESET SCHEMA & 5 SEEDED STARTER PRESETS
// ============================================================================

export interface WorkoutPresetSetTemplate {
  setType: SetType;
  targetWeightKg: number;
  targetReps: number;
  targetRpe?: number | null;
}

export interface WorkoutPresetExerciseBlock {
  blockId: string;
  exerciseSlug: string;
  exerciseName: string;
  supersetGroupId?: string | null;
  sets: WorkoutPresetSetTemplate[];
}

export interface WorkoutPresetCardioTemplate {
  segmentId: string;
  exerciseSlug: string;
  exerciseName: string;
  activityType: string;
  targetDurationMinutes: number;
  targetHrZone: HeartRateZone;
  targetRpe?: number | null;
}

export interface WorkoutPresetBlocksPayload {
  exerciseBlocks: WorkoutPresetExerciseBlock[];
  cardioSegments: WorkoutPresetCardioTemplate[];
  sessionRpeTarget?: number | null;
}

export interface WorkoutPresetDefinition {
  id: string;
  slug: string;
  name: string;
  category: WorkoutCategory;
  notes: string;
  isSystemSeed?: boolean;
  blocks: WorkoutPresetBlocksPayload;
  updatedAtIso?: string;
}

export const STARTER_WORKOUT_PRESETS: readonly WorkoutPresetDefinition[] = [
  // Preset 1 (GYM)
  {
    id: 'preset_upper_a_push_pull',
    slug: 'upper_body_strength_hypertrophy_a',
    name: 'Upper Body Strength & Hypertrophy A (Push/Pull Supersets)',
    category: 'GYM',
    isSystemSeed: true,
    notes:
      'Antagonist push/pull supersets pairing Altas Smith Machine, weighted pull-ups, Pepin dumbbells, landmine & dual cables.',
    blocks: {
      sessionRpeTarget: 8.5,
      exerciseBlocks: [
        {
          blockId: 'ua_a1',
          exerciseSlug: 'smith_incline_bench_press',
          exerciseName: 'Smith Machine Incline Bench Press',
          supersetGroupId: 'ss_upper_a_1',
          sets: [
            { setType: 'WARMUP', targetWeightKg: 50, targetReps: 10, targetRpe: 6.0 },
            { setType: 'NORMAL', targetWeightKg: 75, targetReps: 8, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 75, targetReps: 8, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 75, targetReps: 8, targetRpe: 9.0 },
          ],
        },
        {
          blockId: 'ua_a2',
          exerciseSlug: 'weighted_pullup',
          exerciseName: 'Weighted Pull-Ups / Chin-Ups',
          supersetGroupId: 'ss_upper_a_1',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 15, targetReps: 8, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 15, targetReps: 8, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 15, targetReps: 8, targetRpe: 9.0 },
          ],
        },
        {
          blockId: 'ua_b1',
          exerciseSlug: 'dumbbell_flat_bench_press',
          exerciseName: 'Dumbbell Flat Bench Press',
          supersetGroupId: 'ss_upper_a_2',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 32.5, targetReps: 10, targetRpe: 8.0 },
            { setType: 'NORMAL', targetWeightKg: 32.5, targetReps: 10, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 32.5, targetReps: 10, targetRpe: 9.0 },
          ],
        },
        {
          blockId: 'ua_b2',
          exerciseSlug: 'landmine_meadows_row',
          exerciseName: 'Landmine Single-Arm Meadows Row',
          supersetGroupId: 'ss_upper_a_2',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 40, targetReps: 10, targetRpe: 8.0 },
            { setType: 'NORMAL', targetWeightKg: 40, targetReps: 10, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 40, targetReps: 10, targetRpe: 9.0 },
          ],
        },
        {
          blockId: 'ua_c1',
          exerciseSlug: 'dual_cable_chest_fly',
          exerciseName: 'Dual Cable Chest Fly (High-to-Low / Mid)',
          supersetGroupId: 'ss_upper_a_3',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 25, targetReps: 12, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 25, targetReps: 12, targetRpe: 9.0 },
            { setType: 'DROP_SET', targetWeightKg: 17.5, targetReps: 15, targetRpe: 9.5 },
          ],
        },
        {
          blockId: 'ua_c2',
          exerciseSlug: 'cable_face_pulls',
          exerciseName: 'Cable Face Pulls',
          supersetGroupId: 'ss_upper_a_3',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 15, targetRpe: 8.0 },
            { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 15, targetRpe: 8.0 },
            { setType: 'NORMAL', targetWeightKg: 22.5, targetReps: 15, targetRpe: 8.5 },
          ],
        },
      ],
      cardioSegments: [],
    },
  },

  // Preset 2 (GYM)
  {
    id: 'preset_upper_b_torso_arms',
    slug: 'upper_body_torso_arms_b',
    name: 'Upper Body Torso & Arms B (Functional Trainer + Dumbbells)',
    category: 'GYM',
    isSystemSeed: true,
    notes:
      'Weighted dips, heavy Pepin DB rows, landmine shoulder press & a C1/C2/C3 cable arm/delt giant set with mechanical drop-sets.',
    blocks: {
      sessionRpeTarget: 8.5,
      exerciseBlocks: [
        {
          blockId: 'ub_a1',
          exerciseSlug: 'weighted_parallel_dips',
          exerciseName: 'Weighted Parallel Bar Dips',
          supersetGroupId: 'ss_upper_b_1',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 20, targetReps: 8, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 20, targetReps: 8, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 20, targetReps: 8, targetRpe: 9.0 },
          ],
        },
        {
          blockId: 'ub_a2',
          exerciseSlug: 'heavy_single_arm_db_row',
          exerciseName: 'Heavy Single-Arm Dumbbell Row',
          supersetGroupId: 'ss_upper_b_1',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 36, targetReps: 10, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 36, targetReps: 10, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 36, targetReps: 10, targetRpe: 9.0 },
          ],
        },
        {
          blockId: 'ub_b1',
          exerciseSlug: 'landmine_viking_press',
          exerciseName: 'Landmine Viking / Shoulder Press',
          supersetGroupId: 'ss_upper_b_2',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 42.5, targetReps: 10, targetRpe: 8.0 },
            { setType: 'NORMAL', targetWeightKg: 42.5, targetReps: 10, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 42.5, targetReps: 10, targetRpe: 9.0 },
          ],
        },
        {
          blockId: 'ub_b2',
          exerciseSlug: 'dual_cable_lat_pulldown',
          exerciseName: 'Dual Cable Lat Pulldown / Kneeling Row',
          supersetGroupId: 'ss_upper_b_2',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 65, targetReps: 10, targetRpe: 8.0 },
            { setType: 'NORMAL', targetWeightKg: 65, targetReps: 10, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 65, targetReps: 10, targetRpe: 9.0 },
          ],
        },
        {
          blockId: 'ub_c1',
          exerciseSlug: 'cable_lateral_raise',
          exerciseName: 'Cable Lateral Raise',
          supersetGroupId: 'ss_upper_b_3',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 12.5, targetReps: 14, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 12.5, targetReps: 14, targetRpe: 9.0 },
            { setType: 'DROP_SET', targetWeightKg: 7.5, targetReps: 16, targetRpe: 9.5 },
          ],
        },
        {
          blockId: 'ub_c2',
          exerciseSlug: 'cable_bayesian_curl',
          exerciseName: 'Cable Bayesian Curl',
          supersetGroupId: 'ss_upper_b_3',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 15, targetReps: 12, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 15, targetReps: 12, targetRpe: 9.0 },
            { setType: 'DROP_SET', targetWeightKg: 10, targetReps: 15, targetRpe: 9.5 },
          ],
        },
        {
          blockId: 'ub_c3',
          exerciseSlug: 'cable_rope_tricep_extension',
          exerciseName: 'Cable Rope Tricep Overhead Extension',
          supersetGroupId: 'ss_upper_b_3',
          sets: [
            { setType: 'NORMAL', targetWeightKg: 25, targetReps: 12, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 25, targetReps: 12, targetRpe: 9.0 },
            { setType: 'DROP_SET', targetWeightKg: 17.5, targetReps: 15, targetRpe: 9.5 },
          ],
        },
      ],
      cardioSegments: [],
    },
  },

  // Preset 3 (SPORT)
  {
    id: 'preset_sport_badminton_2h',
    slug: 'competitive_badminton_2h',
    name: '2-Hour Competitive Badminton Session',
    category: 'SPORT',
    isSystemSeed: true,
    notes:
      '120-minute court session splitting sustained Zone 2/3 rally volume (Endurance XP) and Zone 4/5 explosive smash/lunge intervals (Agility XP) at RPE 8.',
    blocks: {
      sessionRpeTarget: 8.0,
      exerciseBlocks: [],
      cardioSegments: [
        {
          segmentId: 'badm_z3',
          exerciseSlug: 'competitive_badminton',
          exerciseName: 'Competitive Badminton Session',
          activityType: 'badminton',
          targetDurationMinutes: 75,
          targetHrZone: 3,
          targetRpe: 7.5,
        },
        {
          segmentId: 'badm_z4',
          exerciseSlug: 'competitive_badminton',
          exerciseName: 'Competitive Badminton Session',
          activityType: 'badminton',
          targetDurationMinutes: 45,
          targetHrZone: 4,
          targetRpe: 8.5,
        },
      ],
    },
  },

  // Preset 4 (SPORT)
  {
    id: 'preset_sport_boxing_bag',
    slug: 'boxing_conditioning_bag_work',
    name: 'Boxing Conditioning & Bag Work',
    category: 'SPORT',
    isSystemSeed: true,
    notes:
      '50 minutes of high-intensity Zone 4/5 heavy bag & shadow boxing rounds paired with Landmine Rotational Core Presses.',
    blocks: {
      sessionRpeTarget: 8.5,
      exerciseBlocks: [
        {
          blockId: 'box_core_1',
          exerciseSlug: 'landmine_rotational_press',
          exerciseName: 'Landmine Rotational Core Press',
          supersetGroupId: null,
          sets: [
            { setType: 'NORMAL', targetWeightKg: 25, targetReps: 10, targetRpe: 8.0 },
            { setType: 'NORMAL', targetWeightKg: 25, targetReps: 10, targetRpe: 8.5 },
            { setType: 'NORMAL', targetWeightKg: 25, targetReps: 10, targetRpe: 8.5 },
          ],
        },
      ],
      cardioSegments: [
        {
          segmentId: 'box_z4',
          exerciseSlug: 'boxing_session',
          exerciseName: 'Boxing Session (Heavy Bag / Shadow / Drills)',
          activityType: 'boxing',
          targetDurationMinutes: 35,
          targetHrZone: 4,
          targetRpe: 8.5,
        },
        {
          segmentId: 'box_z5',
          exerciseSlug: 'boxing_session',
          exerciseName: 'Boxing Session (Heavy Bag / Shadow / Drills)',
          activityType: 'boxing',
          targetDurationMinutes: 15,
          targetHrZone: 5,
          targetRpe: 9.0,
        },
      ],
    },
  },

  // Preset 5 (CARDIO)
  {
    id: 'preset_cardio_tempo_cycling',
    slug: 'zone3_4_outdoor_tempo_cycling',
    name: 'Zone 3/4 Outdoor Tempo Cycling',
    category: 'CARDIO',
    isSystemSeed: true,
    notes:
      '105-minute (90–180 min configurable) outdoor road/gravel ride split across sustained Zone 3 tempo cadence and Zone 4 threshold climbs.',
    blocks: {
      sessionRpeTarget: 8.0,
      exerciseBlocks: [],
      cardioSegments: [
        {
          segmentId: 'cyc_z3',
          exerciseSlug: 'outdoor_zone2_cycling',
          exerciseName: 'Outdoor Cycling (Zone 2 Aerobic Base)',
          activityType: 'outdoor_cycling',
          targetDurationMinutes: 45,
          targetHrZone: 3,
          targetRpe: 7.5,
        },
        {
          segmentId: 'cyc_z4',
          exerciseSlug: 'outdoor_tempo_cycling',
          exerciseName: 'Outdoor Road / Gravel Cycling (Zone 3/4 Tempo & Threshold)',
          activityType: 'outdoor_cycling',
          targetDurationMinutes: 60,
          targetHrZone: 4,
          targetRpe: 8.5,
        },
      ],
    },
  },
];

function roundToHalfKg(val: number): number {
  return Math.max(0, Math.round(val * 2) / 2);
}

/**
 * Resolves pre-filled weight for a preset set row using the player's most recent logged
 * working weight on that exercise when available.
 */
export function resolvePresetTargetWeightKg(params: {
  exerciseSlug: string;
  setType: SetType;
  fallbackTargetWeightKg: number;
  recentWorkingWeightByExercise?: Record<string, number>;
}): number {
  const recent = params.recentWorkingWeightByExercise?.[params.exerciseSlug];
  if (recent === undefined || recent <= 0) {
    return params.fallbackTargetWeightKg;
  }
  if (params.setType === 'WARMUP') {
    return roundToHalfKg(recent * 0.65);
  }
  if (params.setType === 'DROP_SET') {
    return roundToHalfKg(recent * 0.72);
  }
  return roundToHalfKg(recent);
}
