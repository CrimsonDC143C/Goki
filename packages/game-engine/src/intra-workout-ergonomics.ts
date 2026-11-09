import { HistoricalExercisePR, calculateE1RM } from './workout-calculator';
import {
  SetType,
  getExerciseSubcategory,
  isWarmupSetType,
} from './workout-presets-rest';
import {
  CompletedSetEntry,
  CompletedWorkoutRecord,
} from './training-history-tracker';

// ============================================================================
// 1. GYM LOCATION NORMALIZATION & WEIGHT UNIT CONVERSION ('KG' | 'LBS')
// ============================================================================

export type WeightUnit = 'KG' | 'LBS';
export type WarmupPresetCount = 1 | 2 | 3;

export const KG_TO_LBS = 2.2046226218;

const CANONICAL_GYM_ID_ALIASES: Record<string, string> = {
  gym_iron_sanctum: 'iron-sanctum',
  'iron-sanctum': 'iron-sanctum',
  gym_titan_foundry: 'titan-foundry',
  'titan-foundry': 'titan-foundry',
  gym_home_outpost: 'home-outpost',
  'home-outpost': 'home-outpost',
  'home-sanctuary': 'home-outpost',
  open_world: 'open-world',
  'open-world': 'open-world',
};

/**
 * Normalizes gym identifiers across geofence IDs ('gym_iron_sanctum') and UI location slugs ('iron-sanctum').
 */
export function normalizeGymId(rawGymId?: string | null): string | null {
  if (!rawGymId) return null;
  const trimmed = rawGymId.trim().toLowerCase();
  if (!trimmed) return null;
  return CANONICAL_GYM_ID_ALIASES[trimmed] ?? trimmed;
}

/**
 * Converts canonical kilograms to pounds.
 * Defaults to 0.5 lb display precision so common gym weights (45, 135, 165.5, 225) render cleanly.
 */
export function kgToLbs(weightKg: number, roundStep = 0.5): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  const rawLbs = weightKg * KG_TO_LBS;
  if (roundStep <= 0) {
    return Math.round(rawLbs * 100) / 100;
  }
  const stepped = Math.round(rawLbs / roundStep) * roundStep;
  return Math.round(stepped * 100) / 100;
}

/**
 * Converts pounds to canonical kilograms with 3-decimal precision so round-tripping
 * standard imperial weights (e.g. 45 -> 20.412 -> 45, 135 -> 61.235 -> 135) has zero drift.
 */
export function lbsToKg(weightLbs: number): number {
  if (!Number.isFinite(weightLbs) || weightLbs <= 0) return 0;
  return Math.round((weightLbs / KG_TO_LBS) * 1000) / 1000;
}

export function convertKgToDisplayWeight(weightKg: number, unit: WeightUnit): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  if (unit === 'LBS') {
    return kgToLbs(weightKg, 0.5);
  }
  return Math.round(weightKg * 100) / 100;
}

export function convertDisplayWeightToKg(displayWeight: number, unit: WeightUnit): number {
  if (!Number.isFinite(displayWeight) || displayWeight <= 0) return 0;
  if (unit === 'LBS') {
    return lbsToKg(displayWeight);
  }
  return Math.round(displayWeight * 1000) / 1000;
}

/**
 * Formats a numeric weight value without trailing '.0' noise (e.g. 75 -> '75', 77.5 -> '77.5').
 */
export function formatCleanWeightNumber(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '0';
  const rounded = Math.round(val * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(Number(rounded.toFixed(2)));
}

export function formatWeightWithUnit(weightKg: number, unit: WeightUnit): string {
  if (weightKg <= 0) return 'BW';
  const disp = convertKgToDisplayWeight(weightKg, unit);
  const unitSuffix = unit === 'LBS' ? 'lb' : 'kg';
  return `${formatCleanWeightNumber(disp)}${unitSuffix}`;
}

/**
 * Formats the ultra-compact 58px `PREV` column tap pill (e.g. '75×8' + '@8.5' or 'BW×12').
 * Unit suffix is intentionally omitted inside the cell because the column header displays KG or LBS.
 */
export function formatCompactPrevPill(params: {
  weightKg: number;
  reps: number;
  unit: WeightUnit;
  rpe?: number | null;
}): { mainText: string; rpeSubText: string | null } {
  const { weightKg, reps, unit, rpe } = params;
  const safeReps = Math.max(0, Math.floor(reps));
  const mainText =
    weightKg <= 0
      ? `BW×${safeReps}`
      : `${formatCleanWeightNumber(convertKgToDisplayWeight(weightKg, unit))}×${safeReps}`;
  const rpeSubText =
    rpe !== null && rpe !== undefined && Number.isFinite(rpe) && rpe > 0
      ? `@${Number(rpe.toFixed(1))}`
      : null;
  return { mainText, rpeSubText };
}

// ============================================================================
// 2. GYM-AWARE STICKY NOTES & PER-EXERCISE UNIT PREFERENCES
// ============================================================================

export type ExercisePlateBehaviorCategory = 'MULTI_BAR' | 'MACHINE_STACK';
export type MachineLoadMode = 'CABLE_STACK' | 'PLATE_LOADED';

export interface ExerciseGymPreference {
  exerciseId: string;
  /** Default note used when at an unknown gym or Open World */
  globalNote?: string;
  /** Gym-scoped setup notes (e.g. seat height, cable pulley hole, machine leverage) */
  notesByGymId?: Record<string, string>;
  /** Human-readable gym names indexed by normalized gymId */
  gymNamesById?: Record<string, string>;
  /** Preferred weight unit for this exercise across all locations */
  preferredUnit?: WeightUnit;
  /** Optional gym-specific unit override (e.g. lbs cable stack at Commercial Gym B) */
  unitByGymId?: Record<string, WeightUnit>;
  /** Remembered bar weight in kg for plate math on this exercise */
  barWeightKg?: number;
  /** Preferred machine loading mode ('CABLE_STACK' | 'PLATE_LOADED') across all locations */
  preferredMachineLoadMode?: MachineLoadMode;
  /** Gym-specific machine loading mode override (e.g. Cable Stack vs. Plate-Loaded) */
  machineLoadModeByGymId?: Record<string, MachineLoadMode>;
}

export type ExerciseGymPreferenceMap = Record<string, ExerciseGymPreference>;

export interface OtherGymNoteEntry {
  gymId: string;
  gymName: string;
  note: string;
}

export interface ResolvedStickyNote {
  note: string;
  source: 'ACTIVE_GYM' | 'GLOBAL' | 'OTHER_GYM' | 'NONE';
  sourceGymId: string | null;
  sourceGymName: string | null;
  otherGymNotes: OtherGymNoteEntry[];
}

const DEFAULT_GYM_LABELS: Record<string, string> = {
  'iron-sanctum': 'Iron Sanctum Barbell Club',
  'titan-foundry': 'Titan Foundry Gym',
  'home-outpost': 'Home Outpost',
  'open-world': 'Open World',
};

function resolveHumanGymName(
  gymId: string,
  gymNamesById?: Record<string, string>,
  fallbackName?: string | null
): string {
  return (
    gymNamesById?.[gymId] ||
    fallbackName ||
    DEFAULT_GYM_LABELS[gymId] ||
    gymId
  );
}

/**
 * Resolves the sticky setup note for `[exerciseId + activeGymId]`, falling back gracefully
 * to `globalNote` or another gym's note when training somewhere new.
 */
export function resolveExerciseStickyNote(
  prefs: ExerciseGymPreferenceMap | undefined,
  exerciseId: string,
  activeGymId?: string | null
): ResolvedStickyNote {
  const entry = prefs?.[exerciseId];
  if (!entry) {
    return {
      note: '',
      source: 'NONE',
      sourceGymId: null,
      sourceGymName: null,
      otherGymNotes: [],
    };
  }

  const normGymId = normalizeGymId(activeGymId);
  const notesMap = entry.notesByGymId ?? {};
  const otherGymNotes: OtherGymNoteEntry[] = [];

  for (const [gid, rawText] of Object.entries(notesMap)) {
    const trimmed = rawText?.trim() ?? '';
    if (!trimmed) continue;
    if (gid !== normGymId) {
      otherGymNotes.push({
        gymId: gid,
        gymName: resolveHumanGymName(gid, entry.gymNamesById),
        note: trimmed,
      });
    }
  }

  // 1. Exact active gym match (ignoring 'open-world' as a specific machine gym unless saved there)
  if (normGymId && notesMap[normGymId]?.trim()) {
    return {
      note: notesMap[normGymId]!.trim(),
      source: 'ACTIVE_GYM',
      sourceGymId: normGymId,
      sourceGymName: resolveHumanGymName(normGymId, entry.gymNamesById),
      otherGymNotes,
    };
  }

  // 2. Global exercise note fallback
  if (entry.globalNote?.trim()) {
    return {
      note: entry.globalNote.trim(),
      source: 'GLOBAL',
      sourceGymId: null,
      sourceGymName: null,
      otherGymNotes,
    };
  }

  // 3. Fallback to another known gym's note so the athlete isn't left blank at a new gym
  if (otherGymNotes.length > 0) {
    const firstOther = otherGymNotes[0]!;
    return {
      note: firstOther.note,
      source: 'OTHER_GYM',
      sourceGymId: firstOther.gymId,
      sourceGymName: firstOther.gymName,
      otherGymNotes,
    };
  }

  return {
    note: '',
    source: 'NONE',
    sourceGymId: null,
    sourceGymName: null,
    otherGymNotes: [],
  };
}

/**
 * Immutably updates the sticky note for `[exerciseId + activeGymId]`.
 * Also populates `globalNote` when no global note exists yet (or when `saveAsGlobal` is true).
 */
export function upsertExerciseStickyNote(
  prefs: ExerciseGymPreferenceMap | undefined,
  params: {
    exerciseId: string;
    note: string;
    activeGymId?: string | null;
    activeGymName?: string | null;
    saveAsGlobal?: boolean;
  }
): ExerciseGymPreferenceMap {
  const base = prefs ?? {};
  const existing: ExerciseGymPreference = base[params.exerciseId] ?? {
    exerciseId: params.exerciseId,
  };
  const trimmed = params.note.trim();
  const normGymId = normalizeGymId(params.activeGymId);

  const nextNotesByGym = { ...(existing.notesByGymId ?? {}) };
  const nextGymNames = { ...(existing.gymNamesById ?? {}) };

  if (normGymId && !params.saveAsGlobal && normGymId !== 'open-world') {
    if (trimmed) {
      nextNotesByGym[normGymId] = trimmed;
      if (params.activeGymName?.trim()) {
        nextGymNames[normGymId] = params.activeGymName.trim();
      }
    } else {
      delete nextNotesByGym[normGymId];
    }
    const nextGlobal =
      existing.globalNote !== undefined && existing.globalNote.trim().length > 0
        ? existing.globalNote
        : trimmed || undefined;
    return {
      ...base,
      [params.exerciseId]: {
        ...existing,
        globalNote: nextGlobal,
        notesByGymId: nextNotesByGym,
        gymNamesById: nextGymNames,
      },
    };
  }

  return {
    ...base,
    [params.exerciseId]: {
      ...existing,
      globalNote: trimmed || undefined,
      notesByGymId: nextNotesByGym,
      gymNamesById: nextGymNames,
    },
  };
}

/**
 * Resolves the active weight unit ('KG' | 'LBS') for an exercise at the current gym.
 */
export function resolveExerciseWeightUnit(
  prefs: ExerciseGymPreferenceMap | undefined,
  exerciseId: string,
  activeGymId?: string | null,
  globalDefaultUnit: WeightUnit = 'KG'
): WeightUnit {
  const entry = prefs?.[exerciseId];
  if (!entry) return globalDefaultUnit;
  const normGymId = normalizeGymId(activeGymId);
  if (normGymId && entry.unitByGymId?.[normGymId]) {
    return entry.unitByGymId[normGymId]!;
  }
  return entry.preferredUnit ?? globalDefaultUnit;
}

/**
 * Immutably updates the weight unit ('KG' | 'LBS') for `[exerciseId + activeGymId]`.
 */
export function upsertExerciseWeightUnit(
  prefs: ExerciseGymPreferenceMap | undefined,
  params: {
    exerciseId: string;
    unit: WeightUnit;
    activeGymId?: string | null;
    activeGymName?: string | null;
  }
): ExerciseGymPreferenceMap {
  const base = prefs ?? {};
  const existing: ExerciseGymPreference = base[params.exerciseId] ?? {
    exerciseId: params.exerciseId,
  };
  const normGymId = normalizeGymId(params.activeGymId);
  const nextUnitByGym = { ...(existing.unitByGymId ?? {}) };
  const nextGymNames = { ...(existing.gymNamesById ?? {}) };

  if (normGymId && normGymId !== 'open-world') {
    nextUnitByGym[normGymId] = params.unit;
    if (params.activeGymName?.trim()) {
      nextGymNames[normGymId] = params.activeGymName.trim();
    }
  }

  return {
    ...base,
    [params.exerciseId]: {
      ...existing,
      preferredUnit: existing.preferredUnit ?? params.unit,
      unitByGymId: nextUnitByGym,
      gymNamesById: nextGymNames,
    },
  };
}

export function upsertExerciseBarWeightKg(
  prefs: ExerciseGymPreferenceMap | undefined,
  exerciseId: string,
  barWeightKg: number
): ExerciseGymPreferenceMap {
  const base = prefs ?? {};
  const existing: ExerciseGymPreference = base[exerciseId] ?? { exerciseId };
  return {
    ...base,
    [exerciseId]: {
      ...existing,
      barWeightKg: Math.max(0, barWeightKg),
    },
  };
}

/**
 * Classifies whether an exercise uses a multi-bar setup (Barbell / EZ-Bar / Smith / Landmine)
 * that opens the `Plates Visualizer` bar-selector modal, or a Machine / Cable / Weight-Stack
 * setup that acts as a direct 1-tap toggle (`⚙️ Cable Stack` ⇄ `🏋️ Plate-Loaded`).
 */
export function classifyExercisePlateBehavior(params: {
  exerciseId?: string;
  exerciseName?: string;
  equipmentType?: string;
}): ExercisePlateBehaviorCategory {
  const eqUpper = (params.equipmentType || '').trim().toUpperCase();
  const textLower = `${params.exerciseId || ''} ${params.exerciseName || ''}`.trim().toLowerCase();

  // Explicit multi-bar keywords in exercise name/slug take priority (e.g. "Barbell Hack Squat", "Smith Machine ...", "EZ-Bar ...", "Landmine ...")
  if (
    textLower.includes('barbell') ||
    textLower.includes('ez-bar') ||
    textLower.includes('ez bar') ||
    textLower.includes('curl bar') ||
    textLower.includes('smith') ||
    textLower.includes('landmine') ||
    textLower.includes('trap bar') ||
    textLower.includes('hex bar') ||
    textLower.includes('safety bar') ||
    textLower.includes('swiss bar') ||
    textLower.includes('cambered bar') ||
    textLower.includes('axle')
  ) {
    return 'MULTI_BAR';
  }

  if (
    eqUpper === 'BARBELL' ||
    eqUpper === 'SMITH_MACHINE' ||
    eqUpper === 'LANDMINE'
  ) {
    return 'MULTI_BAR';
  }

  if (
    eqUpper === 'MACHINE' ||
    eqUpper === 'DUAL_CABLE' ||
    eqUpper === 'CABLE' ||
    eqUpper.includes('CABLE') ||
    eqUpper.includes('MACHINE') ||
    eqUpper === 'SLED'
  ) {
    return 'MACHINE_STACK';
  }

  if (
    textLower.includes('cable') ||
    textLower.includes('machine') ||
    textLower.includes('pulldown') ||
    textLower.includes('pull-down') ||
    textLower.includes('pec deck') ||
    textLower.includes('leg press') ||
    textLower.includes('leg extension') ||
    textLower.includes('leg curl') ||
    textLower.includes('hamstring curl') ||
    textLower.includes('hack squat') ||
    textLower.includes('pendulum') ||
    textLower.includes('belt squat') ||
    textLower.includes('pushdown') ||
    textLower.includes('pressdown') ||
    textLower.includes('pulley') ||
    textLower.includes('pin stack') ||
    textLower.includes('weight stack') ||
    textLower.includes('plate-loaded') ||
    textLower.includes('plate loaded')
  ) {
    return 'MACHINE_STACK';
  }

  return 'MULTI_BAR';
}

/**
 * Resolves the active machine loading mode ('CABLE_STACK' | 'PLATE_LOADED') for a machine/cable
 * exercise at the current gym, defaulting to 'CABLE_STACK'.
 */
export function resolveExerciseMachineLoadMode(
  prefs: ExerciseGymPreferenceMap | undefined,
  exerciseId: string,
  activeGymId?: string | null,
  defaultMode: MachineLoadMode = 'CABLE_STACK'
): MachineLoadMode {
  const entry = prefs?.[exerciseId];
  if (!entry) return defaultMode;
  const normGymId = normalizeGymId(activeGymId);
  if (normGymId && entry.machineLoadModeByGymId?.[normGymId]) {
    return entry.machineLoadModeByGymId[normGymId]!;
  }
  return entry.preferredMachineLoadMode ?? defaultMode;
}

/**
 * Immutably updates the machine loading mode ('CABLE_STACK' | 'PLATE_LOADED') for `[exerciseId + activeGymId]`.
 */
export function upsertExerciseMachineLoadMode(
  prefs: ExerciseGymPreferenceMap | undefined,
  params: {
    exerciseId: string;
    mode: MachineLoadMode;
    activeGymId?: string | null;
    activeGymName?: string | null;
  }
): ExerciseGymPreferenceMap {
  const base = prefs ?? {};
  const existing: ExerciseGymPreference = base[params.exerciseId] ?? {
    exerciseId: params.exerciseId,
  };
  const normGymId = normalizeGymId(params.activeGymId);
  const nextModeByGym = { ...(existing.machineLoadModeByGymId ?? {}) };
  const nextGymNames = { ...(existing.gymNamesById ?? {}) };

  if (normGymId && normGymId !== 'open-world') {
    nextModeByGym[normGymId] = params.mode;
    if (params.activeGymName?.trim()) {
      nextGymNames[normGymId] = params.activeGymName.trim();
    }
  }

  return {
    ...base,
    [params.exerciseId]: {
      ...existing,
      preferredMachineLoadMode: params.mode,
      machineLoadModeByGymId: nextModeByGym,
      gymNamesById: nextGymNames,
    },
  };
}

/**
 * Resolves the effective bar weight in kg for plate calculations on an exercise.
 * - Machine / Cable exercises in `PLATE_LOADED` mode use 0kg (direct plate loadout).
 * - Multi-Bar exercises use the user's saved bar weight if present, or infer 0kg (Landmine),
 *   10kg (Smith / EZ-Bar), or 20kg (Standard Olympic Barbell).
 */
export function resolveExerciseDefaultBarWeightKg(params: {
  prefs?: ExerciseGymPreferenceMap;
  exerciseId: string;
  exerciseName?: string;
  equipmentType?: string;
}): number {
  const category = classifyExercisePlateBehavior(params);
  if (category === 'MACHINE_STACK') {
    return 0;
  }
  const savedBarKg = params.prefs?.[params.exerciseId]?.barWeightKg;
  if (savedBarKg !== undefined) {
    return savedBarKg;
  }
  const slug = `${params.equipmentType || ''} ${params.exerciseId} ${params.exerciseName || ''}`
    .trim()
    .toLowerCase();
  if (slug.includes('landmine')) return 0;
  if (slug.includes('smith') || slug.includes('ez-bar') || slug.includes('ez bar') || slug.includes('curl bar')) {
    return 10;
  }
  return 20;
}

// ============================================================================
// 3. GYM-AWARE PER-SET `PREV` LOOKUP & 1-TAP GHOST FILL RESOLUTION
// ============================================================================

export interface PreviousSetGhostRow {
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  setType: SetType;
  isWarmup: boolean;
  isExtrapolated?: boolean;
}

export interface PreviousExerciseSessionLookup {
  found: boolean;
  matchedActiveGym: boolean;
  sourceWorkoutId: string | null;
  sourcePerformedAtIso: string | null;
  sourceGymId: string | null;
  sourceGymName: string | null;
  allSets: PreviousSetGhostRow[];
  workingSets: PreviousSetGhostRow[];
  warmupSets: PreviousSetGhostRow[];
}

function toGhostRows(sets: readonly CompletedSetEntry[]): {
  allSets: PreviousSetGhostRow[];
  workingSets: PreviousSetGhostRow[];
  warmupSets: PreviousSetGhostRow[];
} {
  const valid = sets.filter((s) => s.reps > 0);
  const allSets: PreviousSetGhostRow[] = [];
  const workingSets: PreviousSetGhostRow[] = [];
  const warmupSets: PreviousSetGhostRow[] = [];

  valid.forEach((s, idx) => {
    const warmup = isWarmupSetType(s.setType, s.isWarmup);
    const resolvedType: SetType = s.setType ?? (warmup ? 'WARMUP' : 'NORMAL');
    const row: PreviousSetGhostRow = {
      setIndex: idx,
      weightKg: Math.max(0, s.weightKg),
      reps: Math.floor(s.reps),
      rpe: s.rpe ?? null,
      setType: resolvedType,
      isWarmup: warmup,
    };
    allSets.push(row);
    if (warmup) {
      warmupSets.push({ ...row, setIndex: warmupSets.length });
    } else {
      workingSets.push({ ...row, setIndex: workingSets.length });
    }
  });

  return { allSets, workingSets, warmupSets };
}

/**
 * Resolves the most recent logged sets for `exerciseId`.
 * Option A (Gym-Scoped Priority with Global Fallback):
 * 1. Searches newest-first for a workout matching `activeGymId` where `exerciseId` was performed.
 * 2. Falls back to the newest workout across any gym if never performed at `activeGymId`.
 */
export function resolvePreviousExerciseSessionSets(params: {
  exerciseId: string;
  workoutHistory: readonly CompletedWorkoutRecord[];
  activeGymId?: string | null;
}): PreviousExerciseSessionLookup {
  const { exerciseId, workoutHistory, activeGymId } = params;
  if (!exerciseId || !workoutHistory || workoutHistory.length === 0) {
    return {
      found: false,
      matchedActiveGym: false,
      sourceWorkoutId: null,
      sourcePerformedAtIso: null,
      sourceGymId: null,
      sourceGymName: null,
      allSets: [],
      workingSets: [],
      warmupSets: [],
    };
  }

  const sorted = [...workoutHistory].sort(
    (a, b) => new Date(b.performedAtIso).getTime() - new Date(a.performedAtIso).getTime()
  );

  const candidates: Array<{
    workout: CompletedWorkoutRecord;
    sets: CompletedSetEntry[];
    normGymId: string | null;
  }> = [];

  for (const w of sorted) {
    const exEntry = w.exercises.find(
      (e) => e.exerciseId === exerciseId && e.sets.some((s) => s.reps > 0)
    );
    if (exEntry) {
      candidates.push({
        workout: w,
        sets: exEntry.sets,
        normGymId: normalizeGymId(w.gymId),
      });
    }
  }

  if (candidates.length === 0) {
    return {
      found: false,
      matchedActiveGym: false,
      sourceWorkoutId: null,
      sourcePerformedAtIso: null,
      sourceGymId: null,
      sourceGymName: null,
      allSets: [],
      workingSets: [],
      warmupSets: [],
    };
  }

  const targetGymId = normalizeGymId(activeGymId);
  const gymSpecificMatch =
    targetGymId && targetGymId !== 'open-world'
      ? candidates.find((c) => c.normGymId === targetGymId)
      : undefined;

  const chosen = gymSpecificMatch ?? candidates[0]!;
  const matchedActiveGym = Boolean(
    targetGymId && targetGymId !== 'open-world' && chosen.normGymId === targetGymId
  );
  const { allSets, workingSets, warmupSets } = toGhostRows(chosen.sets);

  return {
    found: true,
    matchedActiveGym,
    sourceWorkoutId: chosen.workout.id,
    sourcePerformedAtIso: chosen.workout.performedAtIso,
    sourceGymId: chosen.normGymId,
    sourceGymName:
      chosen.workout.gymName ??
      (chosen.normGymId ? DEFAULT_GYM_LABELS[chosen.normGymId] ?? chosen.normGymId : null),
    allSets,
    workingSets,
    warmupSets,
  };
}

/**
 * Maps a specific row in today's exercise table to its corresponding previous-session ghost row.
 * Separates warmup rows from working rows so adding/removing `[W]` rows never misaligns Working Set 1!
 */
export function resolveGhostRowForSetOrder(params: {
  lookup: PreviousExerciseSessionLookup;
  setType?: SetType;
  isWarmup?: boolean;
  workingOrderIndex: number;
  warmupOrderIndex: number;
}): PreviousSetGhostRow | null {
  const { lookup, setType, isWarmup, workingOrderIndex, warmupOrderIndex } = params;
  if (!lookup.found) return null;

  const warmup = isWarmupSetType(setType, isWarmup);
  if (warmup) {
    if (lookup.warmupSets.length > 0) {
      const exact = lookup.warmupSets[warmupOrderIndex];
      if (exact) return exact;
      const lastW = lookup.warmupSets[lookup.warmupSets.length - 1]!;
      return { ...lastW, isExtrapolated: true };
    }
    if (lookup.workingSets.length > 0) {
      const firstWork = lookup.workingSets[0]!;
      return {
        setIndex: warmupOrderIndex,
        weightKg: Math.round(firstWork.weightKg * 0.6 * 2) / 2,
        reps: Math.min(10, firstWork.reps + 2),
        rpe: 6.0,
        setType: 'WARMUP',
        isWarmup: true,
        isExtrapolated: true,
      };
    }
    return null;
  }

  const pool = lookup.workingSets.length > 0 ? lookup.workingSets : lookup.allSets;
  if (pool.length === 0) return null;

  const exact = pool[workingOrderIndex];
  if (exact) return exact;

  // Extrapolate bonus working sets from the final working set of last session
  const last = pool[pool.length - 1]!;
  return { ...last, isExtrapolated: true };
}

export interface ActiveSetTargetLookupRow {
  weightKgStr?: string;
  completed?: boolean;
  setType?: SetType;
  isWarmup?: boolean;
}

export interface ResolvedActiveSetTarget {
  /** 0-based index of the active target set in the block */
  targetSetIndex: number;
  /** Whether the targeted row is a warm-up set */
  isWarmup: boolean;
  /** Resolved target weight in canonical kilograms */
  targetWeightKg: number;
  /** Resolved target weight in the block's display unit */
  targetDisplayWeight: number;
}

/**
 * Resolves the target weight for the next uncompleted set in an exercise card:
 * 1. Finds the first set row that has NOT been marked as completed (`!row.completed`),
 *    falling back to the final set row if all sets are checked off.
 * 2. Uses that row's entered weight (`weightKgStr`), or its ghost/placeholder weight
 *    from `prevLookup` if not yet typed, falling back to any nearby non-zero row weight or `fallbackWeightKg`.
 */
export function resolveActiveSetTargetWeightKg(params: {
  sets: readonly ActiveSetTargetLookupRow[];
  prevLookup: PreviousExerciseSessionLookup;
  unit: WeightUnit;
  fallbackWeightKg?: number;
}): ResolvedActiveSetTarget {
  const { sets, prevLookup, unit, fallbackWeightKg = 0 } = params;
  if (!sets || sets.length === 0) {
    const safeFallback = Math.max(0, fallbackWeightKg);
    return {
      targetSetIndex: 0,
      isWarmup: false,
      targetWeightKg: safeFallback,
      targetDisplayWeight: convertKgToDisplayWeight(safeFallback, unit),
    };
  }

  let workingOrderCounter = 0;
  let warmupOrderCounter = 0;

  const resolvedRows = sets.map((row, idx) => {
    const rowSetType: SetType = row.setType || (row.isWarmup ? 'WARMUP' : 'NORMAL');
    const isWu = isWarmupSetType(rowSetType, row.isWarmup);
    const wIdx = workingOrderCounter;
    const wuIdx = warmupOrderCounter;
    if (isWu) warmupOrderCounter += 1;
    else workingOrderCounter += 1;

    const ghostRow = resolveGhostRowForSetOrder({
      lookup: prevLookup,
      setType: rowSetType,
      isWarmup: row.isWarmup,
      workingOrderIndex: wIdx,
      warmupOrderIndex: wuIdx,
    });

    const trimmed = (row.weightKgStr ?? '').trim();
    const typedVal = Number(trimmed);
    const hasTyped = trimmed.length > 0 && Number.isFinite(typedVal) && typedVal > 0;
    const typedKg = hasTyped ? convertDisplayWeightToKg(typedVal, unit) : 0;
    const ghostKg = ghostRow && ghostRow.weightKg > 0 ? ghostRow.weightKg : 0;

    return {
      idx,
      completed: Boolean(row.completed),
      isWarmup: isWu,
      weightKg: typedKg > 0 ? typedKg : ghostKg,
    };
  });

  const firstUncompleted = resolvedRows.find((r) => !r.completed);
  const chosen = firstUncompleted ?? resolvedRows[resolvedRows.length - 1]!;

  let effectiveKg = chosen.weightKg;
  if (effectiveKg <= 0) {
    const anyNonZero = resolvedRows.find((r) => r.weightKg > 0);
    effectiveKg = anyNonZero ? anyNonZero.weightKg : Math.max(0, fallbackWeightKg);
  }

  return {
    targetSetIndex: chosen.idx,
    isWarmup: chosen.isWarmup,
    targetWeightKg: effectiveKg,
    targetDisplayWeight: convertKgToDisplayWeight(effectiveKg, unit),
  };
}

// ============================================================================
// 4. SMART PROGRESSIVE OVERLOAD ENGINE (RPE DOUBLE-PROGRESSION + PR CRIT)
// ============================================================================

export type OverloadProgressionStrategy =
  | 'LOAD_PROGRESSION'
  | 'REP_PROGRESSION'
  | 'MICRO_CONSOLIDATION'
  | 'BASELINE_ESTABLISH';

export interface ProgressiveOverloadRecommendation {
  available: boolean;
  strategy: OverloadProgressionStrategy;
  targetWeightKg: number;
  targetDisplayWeight: number;
  targetReps: number;
  targetRpe: number;
  previousTopWeightKg: number;
  previousTopReps: number;
  previousRpe: number | null;
  matchedActiveGym: boolean;
  sourceGymName: string | null;
  triggersPrCrit: boolean;
  projectedE1rmKg: number;
  pillLabel: string;
  rationaleText: string;
}

function computeBestHistoricalE1rmForExercise(
  exerciseId: string,
  workoutHistory: readonly CompletedWorkoutRecord[],
  historicalPR?: HistoricalExercisePR | null
): number {
  let best = historicalPR?.bestE1RM ?? 0;
  for (const w of workoutHistory) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    for (const s of ex.sets) {
      if (isWarmupSetType(s.setType, s.isWarmup) || s.reps <= 0 || s.weightKg <= 0) continue;
      const e1rm = calculateE1RM(s.weightKg, s.reps);
      if (e1rm > best) best = e1rm;
    }
  }
  return best;
}

/**
 * MacroFactor / RP-inspired Double-Progression Overload Coach:
 * - Last top set RPE <= 8.0 (>= 2 RIR): recommend a clean load increment (+2.5kg / +5lb compound, +1.25kg / +2.5lb isolation).
 * - Last top set RPE 8.5 - 9.0 (1-1.5 RIR): recommend +1 rep at the same weight (Double Progression).
 * - Last top set RPE >= 9.5 (near failure): recommend owning the same weight x reps cleanly at RPE 9.0 before jumping load.
 * - Flags `triggersPrCrit` whenever hitting the target beats all-time e1RM for guaranteed PR Crit loot!
 */
export function calculateProgressiveOverloadTarget(params: {
  exerciseId: string;
  workoutHistory: readonly CompletedWorkoutRecord[];
  activeGymId?: string | null;
  isCompound?: boolean;
  equipmentType?: string;
  historicalPR?: HistoricalExercisePR | null;
  unit?: WeightUnit;
}): ProgressiveOverloadRecommendation {
  const unit: WeightUnit = params.unit ?? 'KG';
  const lookup = resolvePreviousExerciseSessionSets({
    exerciseId: params.exerciseId,
    workoutHistory: params.workoutHistory,
    activeGymId: params.activeGymId,
  });

  const pool = lookup.workingSets.length > 0 ? lookup.workingSets : lookup.allSets;
  if (!lookup.found || pool.length === 0) {
    return {
      available: false,
      strategy: 'BASELINE_ESTABLISH',
      targetWeightKg: 0,
      targetDisplayWeight: 0,
      targetReps: 8,
      targetRpe: 8.0,
      previousTopWeightKg: 0,
      previousTopReps: 0,
      previousRpe: null,
      matchedActiveGym: false,
      sourceGymName: null,
      triggersPrCrit: false,
      projectedE1rmKg: 0,
      pillLabel: '🎯 Log Set 1 to Establish Baseline',
      rationaleText:
        'No prior session recorded for this movement yet. Leave 1–2 reps in reserve (RPE 8–8.5) to set your baseline.',
    };
  }

  // Pick top working set by e1RM (or max reps for bodyweight)
  let topSet = pool[0]!;
  let topScore =
    topSet.weightKg > 0 ? calculateE1RM(topSet.weightKg, topSet.reps) : topSet.reps;
  for (let i = 1; i < pool.length; i += 1) {
    const candidate = pool[i]!;
    const score =
      candidate.weightKg > 0
        ? calculateE1RM(candidate.weightKg, candidate.reps)
        : candidate.reps;
    if (score > topScore || (score === topScore && candidate.weightKg > topSet.weightKg)) {
      topSet = candidate;
      topScore = score;
    }
  }

  const eqUpper = (params.equipmentType || '').toUpperCase();
  const isHeavyCompound =
    Boolean(params.isCompound) &&
    !eqUpper.includes('CABLE') &&
    !eqUpper.includes('BAND');

  const lastRpe = topSet.rpe ?? 8.5;
  let strategy: OverloadProgressionStrategy = 'REP_PROGRESSION';
  let targetWeightKg = topSet.weightKg;
  let targetReps = topSet.reps;
  let targetRpe = 8.5;
  let deltaTag = '';
  let rationaleText = '';

  if (topSet.weightKg <= 0) {
    // Pure bodyweight progression
    strategy = 'REP_PROGRESSION';
    targetWeightKg = 0;
    targetReps = lastRpe >= 9.5 ? topSet.reps : topSet.reps + 1;
    targetRpe = 8.5;
    deltaTag = targetReps > topSet.reps ? '+1 rep' : 'Own cleanly';
    rationaleText =
      targetReps > topSet.reps
        ? `Last session hit BW × ${topSet.reps} @ RPE ${lastRpe}. Add +1 rep today to drive progressive overload.`
        : `Last session reached near-failure (RPE ${lastRpe}). Match BW × ${topSet.reps} with crisp form before adding reps.`;
  } else if (lastRpe <= 8.0) {
    // Load Progression: >= 2 RIR in tank last time
    strategy = 'LOAD_PROGRESSION';
    if (unit === 'LBS') {
      const stepLbs = isHeavyCompound ? 5 : 2.5;
      const nextLbs = convertKgToDisplayWeight(topSet.weightKg, 'LBS') + stepLbs;
      targetWeightKg = lbsToKg(nextLbs);
      deltaTag = `+${formatCleanWeightNumber(stepLbs)}lb`;
    } else {
      const stepKg = isHeavyCompound && topSet.weightKg >= 20 ? 2.5 : 1.25;
      targetWeightKg = Math.round((topSet.weightKg + stepKg) * 100) / 100;
      deltaTag = `+${formatCleanWeightNumber(stepKg)}kg`;
    }
    targetReps = topSet.reps;
    targetRpe = 8.5;
    rationaleText = `Last session's top set felt controlled (@ RPE ${lastRpe}, ~2+ reps in reserve). Step up load by ${deltaTag} while holding ${targetReps} reps.`;
  } else if (lastRpe <= 9.0) {
    // Double Progression: 1 - 1.5 RIR -> add +1 rep at current weight
    strategy = 'REP_PROGRESSION';
    targetWeightKg = topSet.weightKg;
    targetReps = topSet.reps + 1;
    targetRpe = Math.min(9.0, Math.round((lastRpe + 0.5) * 2) / 2);
    deltaTag = '+1 rep';
    rationaleText = `Last session landed in the hypertrophy sweet spot (@ RPE ${lastRpe}). Keep weight steady and squeeze out +1 rep (${targetReps} reps) before increasing load.`;
  } else {
    // RPE >= 9.5: Consolidate technique & RIR before adding stress
    strategy = 'MICRO_CONSOLIDATION';
    targetWeightKg = topSet.weightKg;
    targetReps = topSet.reps;
    targetRpe = 9.0;
    deltaTag = 'Consolidate @ RPE 9';
    rationaleText = `Last session pushed to near-failure (@ RPE ${lastRpe}). Repeat this weight × reps with 1 clean rep in reserve to lock in strength without joint/CNS spillover.`;
  }

  const targetDisplayWeight = convertKgToDisplayWeight(targetWeightKg, unit);
  const projectedE1rmKg =
    targetWeightKg > 0 ? calculateE1RM(targetWeightKg, targetReps) : 0;
  const bestPriorE1rm = computeBestHistoricalE1rmForExercise(
    params.exerciseId,
    params.workoutHistory,
    params.historicalPR
  );

  const triggersPrCrit =
    (projectedE1rmKg > 0 && bestPriorE1rm > 0 && projectedE1rmKg > bestPriorE1rm) ||
    (targetWeightKg <= 0 && targetReps > topSet.reps);

  const formattedTargetWeight = formatWeightWithUnit(targetWeightKg, unit);
  const critSuffix = triggersPrCrit ? ' ⚡ PR Crit' : '';
  const pillLabel = `🎯 ${formattedTargetWeight} × ${targetReps} (${deltaTag}${critSuffix})`;

  return {
    available: true,
    strategy,
    targetWeightKg,
    targetDisplayWeight,
    targetReps,
    targetRpe,
    previousTopWeightKg: topSet.weightKg,
    previousTopReps: topSet.reps,
    previousRpe: topSet.rpe,
    matchedActiveGym: lookup.matchedActiveGym,
    sourceGymName: lookup.sourceGymName,
    triggersPrCrit,
    projectedE1rmKg,
    pillLabel,
    rationaleText,
  };
}

// ============================================================================
// 5. CONFIGURABLE 1 / 2 / 3-SET WARM-UP GENERATOR & BARBELL PLATE CALCULATOR
// ============================================================================

export interface GeneratedWarmupSet {
  stepNumber: number;
  percentageLabel: string;
  weightKg: number;
  displayWeight: number;
  reps: number;
  rpe: number;
  setType: 'WARMUP';
}

const WARMUP_PRESET_SCHEMES: Record<
  WarmupPresetCount,
  readonly { pct: number; pctLabel: string; reps: number; rpe: number }[]
> = {
  1: [{ pct: 0.65, pctLabel: '65%', reps: 5, rpe: 6.0 }],
  2: [
    { pct: 0.5, pctLabel: '50%', reps: 8, rpe: 5.5 },
    { pct: 0.75, pctLabel: '75%', reps: 4, rpe: 6.5 },
  ],
  3: [
    { pct: 0.45, pctLabel: '45%', reps: 8, rpe: 5.0 },
    { pct: 0.65, pctLabel: '65%', reps: 5, rpe: 6.0 },
    { pct: 0.82, pctLabel: '82%', reps: 2, rpe: 7.0 },
  ],
};

/**
 * Generates 1, 2, or 3 ramped `[W]` warm-up sets based on the athlete's first working set weight,
 * rounded to practical gym loading increments (2.5kg or 5lb) and clamped to at least the empty bar.
 */
export function generateRampedWarmupSets(params: {
  workingWeightKg: number;
  presetCount: WarmupPresetCount;
  unit?: WeightUnit;
  barWeightKg?: number;
}): GeneratedWarmupSet[] {
  const unit: WeightUnit = params.unit ?? 'KG';
  const safeWorkingKg = Math.max(0, params.workingWeightKg);
  if (safeWorkingKg <= 0) return [];

  const barKg = Math.max(0, params.barWeightKg ?? 0);
  const scheme = WARMUP_PRESET_SCHEMES[params.presetCount] ?? WARMUP_PRESET_SCHEMES[2];

  return scheme.map((step, idx) => {
    const rawTargetKg = safeWorkingKg * step.pct;
    let displayWeight: number;
    let resolvedKg: number;

    if (unit === 'LBS') {
      const rawLbs = rawTargetKg * KG_TO_LBS;
      const barLbs = barKg > 0 ? kgToLbs(barKg, 5) : 5;
      const roundedLbs = Math.max(barLbs, Math.round(rawLbs / 5) * 5);
      displayWeight = roundedLbs;
      resolvedKg = lbsToKg(roundedLbs);
    } else {
      const minKg = barKg > 0 ? barKg : 2.5;
      const roundedKg = Math.max(minKg, Math.round(rawTargetKg / 2.5) * 2.5);
      displayWeight = roundedKg;
      resolvedKg = roundedKg;
    }

    return {
      stepNumber: idx + 1,
      percentageLabel: step.pctLabel,
      weightKg: resolvedKg,
      displayWeight,
      reps: step.reps,
      rpe: step.rpe,
      setType: 'WARMUP',
    };
  });
}

export interface PlateBreakdownItem {
  plateWeight: number;
  count: number;
  colorHex: string;
}

export interface BarbellPlateCalculation {
  unit: WeightUnit;
  loadingMode: 'PER_SIDE' | 'SINGLE_HORN';
  targetDisplayWeight: number;
  barDisplayWeight: number;
  achievableDisplayWeight: number;
  remainderDisplayWeight: number;
  plates: PlateBreakdownItem[];
  summaryText: string;
}

const KG_PLATES_STANDARD: readonly { weight: number; colorHex: string }[] = [
  { weight: 20, colorHex: '#2563EB' },   // Standard 20kg Blue ("1 Plate")
  { weight: 15, colorHex: '#EAB308' },   // Olympic 15kg Yellow
  { weight: 10, colorHex: '#16A34A' },   // Olympic 10kg Green
  { weight: 5, colorHex: '#F8FAFC' },    // 5kg White
  { weight: 2.5, colorHex: '#64748B' },  // 2.5kg Steel Slate
  { weight: 1.25, colorHex: '#94A3B8' }, // 1.25kg Micro Silver
];

const KG_PLATES_WITH_25: readonly { weight: number; colorHex: string }[] = [
  { weight: 25, colorHex: '#DC2626' },   // IPF Competition 25kg Red
  ...KG_PLATES_STANDARD,
];

const LBS_PLATES: readonly { weight: number; colorHex: string }[] = [
  { weight: 45, colorHex: '#2563EB' },  // 45lb Blue/Iron
  { weight: 35, colorHex: '#EAB308' },  // 35lb Yellow
  { weight: 25, colorHex: '#16A34A' },  // 25lb Green
  { weight: 10, colorHex: '#F8FAFC' },  // 10lb White
  { weight: 5, colorHex: '#64748B' },   // 5lb Slate
  { weight: 2.5, colorHex: '#94A3B8' }, // 2.5lb Micro
];

/**
 * Calculates exact plate loading per side (for Olympic/EZ/Smith bars) or single horn (for 0kg Landmine/Peg).
 */
export function calculateBarbellPlatesPerSide(params: {
  targetWeightKg: number;
  barWeightKg?: number;
  unit?: WeightUnit;
  loadingMode?: 'PER_SIDE' | 'SINGLE_HORN';
  include25KgPlates?: boolean;
}): BarbellPlateCalculation {
  const unit: WeightUnit = params.unit ?? 'KG';
  const rawBarKg = Math.max(0, params.barWeightKg ?? 20);
  const mode: 'PER_SIDE' | 'SINGLE_HORN' =
    params.loadingMode ?? (rawBarKg === 0 ? 'SINGLE_HORN' : 'PER_SIDE');

  const targetDisp = convertKgToDisplayWeight(Math.max(0, params.targetWeightKg), unit);
  const barDisp =
    rawBarKg === 0
      ? 0
      : unit === 'LBS'
        ? Math.round(kgToLbs(rawBarKg, 5))
        : Math.round(rawBarKg * 10) / 10;

  if (targetDisp <= barDisp) {
    const unitLabel = unit === 'LBS' ? 'lb' : 'kg';
    return {
      unit,
      loadingMode: mode,
      targetDisplayWeight: targetDisp,
      barDisplayWeight: barDisp,
      achievableDisplayWeight: barDisp,
      remainderDisplayWeight: 0,
      plates: [],
      summaryText:
        barDisp > 0
          ? `Empty bar (${formatCleanWeightNumber(barDisp)}${unitLabel}) — no plates needed`
          : 'Enter a target weight above 0 to calculate plates',
    };
  }

  const netLoad = targetDisp - barDisp;
  let remainingPerSleeve = mode === 'PER_SIDE' ? netLoad / 2 : netLoad;
  const catalog =
    unit === 'LBS'
      ? LBS_PLATES
      : params.include25KgPlates
        ? KG_PLATES_WITH_25
        : KG_PLATES_STANDARD;
  const plates: PlateBreakdownItem[] = [];

  for (const p of catalog) {
    // Small epsilon guards against binary float jitter like 2.4999999999
    const count = Math.floor((remainingPerSleeve + 1e-6) / p.weight);
    if (count > 0) {
      plates.push({
        plateWeight: p.weight,
        count,
        colorHex: p.colorHex,
      });
      remainingPerSleeve = Math.max(0, remainingPerSleeve - count * p.weight);
    }
  }

  const loadedPerSleeve = plates.reduce((acc, p) => acc + p.plateWeight * p.count, 0);
  const achievableDisp =
    Math.round((barDisp + (mode === 'PER_SIDE' ? loadedPerSleeve * 2 : loadedPerSleeve)) * 100) /
    100;
  const remainderDisp = Math.max(0, Math.round((targetDisp - achievableDisp) * 100) / 100);
  const unitLabel = unit === 'LBS' ? 'lb' : 'kg';

  const prefix = mode === 'PER_SIDE' ? 'Per side' : 'Landmine / Pin';
  const parts = plates.map(
    (p) => `${p.count}×${formatCleanWeightNumber(p.plateWeight)}${unitLabel}`
  );
  const summaryText =
    parts.length > 0 ? `${prefix}: ${parts.join(' + ')}` : `${prefix}: Empty`;

  return {
    unit,
    loadingMode: mode,
    targetDisplayWeight: targetDisp,
    barDisplayWeight: barDisp,
    achievableDisplayWeight: achievableDisp,
    remainderDisplayWeight: remainderDisp,
    plates,
    summaryText,
  };
}

// ============================================================================
// 6. WEEKLY MUSCLE VOLUME LANDMARKS (MEV / MAV / MRV) & METRIC TOOLTIPS
// ============================================================================

export type HypertrophyMuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Legs'
  | 'Arms'
  | 'Core';

export type VolumeLandmarkZone =
  | 'UNDER_MEV'
  | 'MEV_TO_MAV'
  | 'OPTIMAL_MAV'
  | 'APPROACHING_MRV'
  | 'OVER_MRV';

export interface MuscleVolumeLandmarkConfig {
  muscleGroup: HypertrophyMuscleGroup;
  icon: string;
  mev: number;
  mavLow: number;
  mavHigh: number;
  mrv: number;
}

export const MUSCLE_VOLUME_LANDMARKS: readonly MuscleVolumeLandmarkConfig[] = [
  { muscleGroup: 'Chest', icon: '🛡️', mev: 6, mavLow: 10, mavHigh: 16, mrv: 18 },
  { muscleGroup: 'Back', icon: '🪽', mev: 8, mavLow: 12, mavHigh: 18, mrv: 20 },
  { muscleGroup: 'Legs', icon: '🦵', mev: 6, mavLow: 10, mavHigh: 16, mrv: 18 },
  { muscleGroup: 'Shoulders', icon: '⚔️', mev: 6, mavLow: 10, mavHigh: 16, mrv: 18 },
  { muscleGroup: 'Arms', icon: '💪', mev: 4, mavLow: 8, mavHigh: 14, mrv: 16 },
  { muscleGroup: 'Core', icon: '🔥', mev: 4, mavLow: 6, mavHigh: 12, mrv: 16 },
];

export interface MuscleVolumeLandmarkStatus extends MuscleVolumeLandmarkConfig {
  weeklyWorkingSets: number;
  zone: VolumeLandmarkZone;
  zoneLabel: string;
  fillPercent: number;
}

export interface ExerciseMuscleLookupMeta {
  id: string;
  name?: string;
  workoutCategory?: 'GYM' | 'CARDIO' | 'SPORT' | 'RECOVERY';
  muscleGroup?: string;
  equipmentType?: string;
  activityType?: string;
}

/**
 * Aggregates hard working sets (excluding `[W]` warmups) over the rolling N-day window (default 7 days)
 * against RP-inspired MEV / MAV / MRV hypertrophy landmarks.
 */
export function calculateWeeklyMuscleVolumeLandmarks(params: {
  workoutHistory: readonly CompletedWorkoutRecord[];
  exercisesCatalog?: readonly ExerciseMuscleLookupMeta[];
  windowDays?: number;
  referenceNowMs?: number;
}): MuscleVolumeLandmarkStatus[] {
  const windowDays = params.windowDays ?? 7;
  const nowMs = params.referenceNowMs ?? Date.now();
  const cutoffMs = nowMs - windowDays * 24 * 60 * 60 * 1000;

  const metaMap = new Map<string, ExerciseMuscleLookupMeta>();
  for (const item of params.exercisesCatalog ?? []) {
    metaMap.set(item.id, item);
  }

  const counts: Record<HypertrophyMuscleGroup, number> = {
    Chest: 0,
    Back: 0,
    Shoulders: 0,
    Legs: 0,
    Arms: 0,
    Core: 0,
  };

  for (const workout of params.workoutHistory) {
    const t = new Date(workout.performedAtIso).getTime();
    if (!Number.isFinite(t) || t < cutoffMs || t > nowMs + 60_000) continue;

    for (const ex of workout.exercises) {
      const workingCount = ex.sets.filter(
        (s) => s.reps > 0 && !isWarmupSetType(s.setType, s.isWarmup)
      ).length;
      if (workingCount === 0) continue;

      const meta = metaMap.get(ex.exerciseId);
      const bucket = getExerciseSubcategory({
        workoutCategory: 'GYM',
        muscleGroup: meta?.muscleGroup,
        equipmentType: meta?.equipmentType,
        activityType: meta?.activityType,
        name: meta?.name ?? ex.exerciseName,
      });

      if (bucket in counts) {
        counts[bucket as HypertrophyMuscleGroup] += workingCount;
      }
    }
  }

  return MUSCLE_VOLUME_LANDMARKS.map((cfg) => {
    const sets = counts[cfg.muscleGroup];
    let zone: VolumeLandmarkZone = 'UNDER_MEV';
    let zoneLabel = `Under MEV (${sets}/${cfg.mev})`;

    if (sets > cfg.mrv) {
      zone = 'OVER_MRV';
      zoneLabel = 'Over MRV • Deload Watch';
    } else if (sets >= cfg.mavHigh) {
      zone = 'APPROACHING_MRV';
      zoneLabel = 'Near MRV Peak';
    } else if (sets >= cfg.mavLow) {
      zone = 'OPTIMAL_MAV';
      zoneLabel = 'Optimal MAV Zone';
    } else if (sets >= cfg.mev) {
      zone = 'MEV_TO_MAV';
      zoneLabel = 'Building (MEV+)';
    }

    const fillPercent = Math.min(100, Math.round((sets / cfg.mrv) * 100));
    return {
      ...cfg,
      weeklyWorkingSets: sets,
      zone,
      zoneLabel,
      fillPercent,
    };
  });
}

// ============================================================================
// 7. BEGINNER-FRIENDLY `(i)` METRIC TOOLTIP DICTIONARY
// ============================================================================

export type TrainingMetricTooltipKey =
  | 'RPE'
  | 'RIR'
  | 'E1RM'
  | 'OVERLOAD_TARGET'
  | 'MEV_MAV_MRV'
  | 'SET_TYPES';

export interface TrainingMetricTooltip {
  key: TrainingMetricTooltipKey;
  title: string;
  shortBadge: string;
  summary: string;
  gymFloorGuide: string[];
  rpgTieIn: string;
}

export const TRAINING_METRIC_TOOLTIPS: Record<
  TrainingMetricTooltipKey,
  TrainingMetricTooltip
> = {
  RPE: {
    key: 'RPE',
    title: 'RPE & RIR (Effort & Reps in Reserve)',
    shortBadge: 'Effort Scale (6–10)',
    summary:
      'RPE (Rate of Perceived Exertion) measures how hard a set felt based on how many clean reps you had left in the tank (RIR = Reps in Reserve).',
    gymFloorGuide: [
      'RPE 10 (0 RIR): Muscular failure — could not complete another rep.',
      'RPE 9 (1 RIR): Could squeeze out 1 more clean rep.',
      'RPE 8.5 (1–2 RIR): Sweet spot for hypertrophy & strength progression.',
      'RPE 8 (2 RIR): Controlled heavy work — prime signal to add weight next session.',
      'RPE 7 (3 RIR): Speedy technique work or submaximal volume.',
    ],
    rpgTieIn:
      'Logging honest RPE calibrates your Dynamic Rest Timer and unlocks smart Overload Targets for PR Crit loot.',
  },
  RIR: {
    key: 'RIR',
    title: 'RIR (Reps in Reserve)',
    shortBadge: 'Reps Left in Tank',
    summary:
      'RIR is the inverse of RPE: 2 RIR equals RPE 8 (2 reps left), 1 RIR equals RPE 9, and 0 RIR equals RPE 10.',
    gymFloorGuide: [
      'Most working sets grow muscle best at 1–2 RIR (RPE 8–9) without frying your joints.',
      'Save 0 RIR (Failure `[F]`) for safe isolation or final sets.',
    ],
    rpgTieIn:
      'Training at 1–2 RIR maximizes Strength XP per unit of Systemic Fatigue.',
  },
  E1RM: {
    key: 'E1RM',
    title: 'e1RM (Estimated 1-Rep Max)',
    shortBadge: 'Strength Benchmark',
    summary:
      'Calculates the heaviest single rep you could theoretically lift today (`Weight × (1 + Reps / 30)`) without needing risky 1-rep max tests.',
    gymFloorGuide: [
      'Compare 80kg × 8 (e1RM 101.3kg) directly against 85kg × 6 (e1RM 102kg).',
      'Whenever your top working set beats your prior e1RM, you set a true strength PR!',
    ],
    rpgTieIn:
      'Breaking your e1RM triggers a 💥 Critical Training Bonus (+75 Bonus XP & Guaranteed Loot Drop).',
  },
  OVERLOAD_TARGET: {
    key: 'OVERLOAD_TARGET',
    title: 'Smart Overload Target (Double Progression)',
    shortBadge: 'Auto-Coach',
    summary:
      'Recommends today’s exact weight × reps beat based on how hard your last session at this gym felt.',
    gymFloorGuide: [
      'Last RPE ≤ 8.0: Suggests a small weight jump (+2.5kg / +5lb compound, +1.25kg / +2.5lb isolation).',
      'Last RPE 8.5–9.0: Suggests +1 rep at the same weight (Double Progression).',
      'Last RPE ≥ 9.5: Suggests owning the same weight cleanly before adding load.',
    ],
    rpgTieIn:
      'Targets marked with ⚡ PR Crit are mathematically guaranteed to trigger bonus XP & loot if hit.',
  },
  MEV_MAV_MRV: {
    key: 'MEV_MAV_MRV',
    title: 'Weekly Volume Landmarks (MEV / MAV / MRV)',
    shortBadge: 'Hypertrophy Zones',
    summary:
      'Tracks hard working sets per muscle group over the last 7 days (warm-up `[W]` sets are excluded so junk volume never inflates your count).',
    gymFloorGuide: [
      'MEV (Minimum Effective Volume, ~6 sets/wk): Minimum stimulus to start growing.',
      'MAV (Maximum Adaptive Volume, ~10–16 sets/wk): The hypertrophy goldilocks zone.',
      'MRV (Maximum Recoverable Volume, ~18+ sets/wk): Recovery ceiling — watch fatigue or deload.',
    ],
    rpgTieIn:
      'Balanced weekly MAV volume builds steady STR/CON levels without triggering Systemic Overtraining debuffs.',
  },
  SET_TYPES: {
    key: 'SET_TYPES',
    title: 'Set Types ([1] / [W] / [D] / [F])',
    shortBadge: 'Tap Badge to Cycle',
    summary:
      'Tap the leftmost badge on any row to tag how that set was performed.',
    gymFloorGuide: [
      '[1] Normal Working Set: Standard strength & hypertrophy set.',
      '[W] Warm-Up Set: Excluded from working tonnage & weekly volume bloat; 45s plate-load rest.',
      '[D] Drop-Set: Immediate weight strip (-20–30%) with zero rest.',
      '[F] Failure / AMRAP: Taken to 0 RIR muscular failure (auto-sets RPE 10).',
    ],
    rpgTieIn:
      'Drop-Sets grant a +10% metabolic XP bonus, while Warm-Up sets protect your working efficiency.',
  },
};
