import {
  WorkoutCategory,
  SetType,
  WorkoutPresetDefinition,
} from './workout-presets-rest';

// ============================================================================
// TRAINING HISTORY DATA STRUCTURES & PROTOCOL
// ============================================================================

export interface CompletedSetEntry {
  setNumber?: number;
  weightKg: number;
  reps: number;
  rpe?: number | null;
  setType?: SetType;
  isWarmup?: boolean;
}

export interface CompletedExerciseEntry {
  exerciseId: string;
  exerciseName: string;
  sets: CompletedSetEntry[];
}

export interface CompletedWorkoutRecord {
  id: string;
  source: 'ONLINE' | 'OFFLINE';
  performedAtIso: string;
  durationSeconds: number;
  workoutCategory?: WorkoutCategory;
  workoutType?: string;
  presetName?: string | null;
  exercises: CompletedExerciseEntry[];
}

export interface TrainingHistoryMatrixColumn {
  workoutId: string;
  performedAtIso: string;
  formattedDate: string; // e.g. "Nov 2"
  formattedDay: string;  // e.g. "Sun"
  presetOrCategoryTitle: string;
  source: 'ONLINE' | 'OFFLINE';
  totalExercises: number;
  totalSets: number;
}

export interface TrainingHistoryMatrixRow {
  exerciseId: string;
  exerciseName: string;
  totalTimesPerformed: number;
  latestPerformanceDateIso: string;
  cellsByWorkoutId: Record<string, CompletedSetEntry[] | undefined>;
  enrichedCellsByWorkoutId: Record<string, EnrichedMatrixCell | undefined>;
}

export interface TrainingHistoryMatrix {
  columns: TrainingHistoryMatrixColumn[];
  rows: TrainingHistoryMatrixRow[];
}

// ============================================================================
// PROGRESSION DELTA & STATS PROTOCOL
// ============================================================================

export type ProgressionDeltaDirection = 'UP' | 'SAME' | 'DOWN' | 'FIRST';

export interface ProgressionDelta {
  direction: ProgressionDeltaDirection;
  badgeText: string; // e.g. "▲ +2.5kg", "▲ +2 reps", "= Maint.", "▼ -5kg", "★ Baseline"
  weightDiffKg: number;
  repsDiff: number;
  e1rmDiffKg: number;
}

export interface SessionExerciseStats {
  topSet: CompletedSetEntry;
  topSetLabel: string; // e.g. "75kg × 8" or "BW × 12"
  e1rmKg: number;      // rounded integer e.g. 95 (or 0 for pure BW)
  totalSets: number;
  workingSets: number;
  totalTonnageKg: number;
  setSummaryLabel: string; // e.g. "3 sets • e1RM 95kg" or "3 sets • 36 total reps" for BW
}

export interface EnrichedMatrixCell {
  workoutId: string;
  sets: CompletedSetEntry[];
  topSet: CompletedSetEntry;
  topSetLabel: string;      // Line 1: e.g. "75kg × 8"
  isPr: boolean;            // True if this session set a new (or tied all-time best after >=1 prior session) e1RM / BW reps PR
  delta: ProgressionDelta;  // Line 2: e.g. "▲ +2.5kg", "▲ +2 reps", "= Maint.", "▼ -5kg"
  setSummaryLabel: string;  // Line 3: e.g. "3 sets • e1RM 95kg"
  e1rmKg: number;
  totalTonnageKg: number;
}

export interface RoutineScopeOption {
  id: string;              // 'ALL' or preset slug/name
  name: string;            // e.g. 'All Sessions (Dense)' or 'Upper Body Push Preset'
  icon: string;            // e.g. '🌐', '⭐', '⚔️', '🏋️'
  exerciseIds: string[];   // Canonical exercise IDs in this routine
  sessionCount: number;    // Number of recorded workouts matching this routine
}

export interface MatrixBuildOptions {
  searchQuery?: string;
  sortOrder?: 'LATEST_FIRST' | 'OLDEST_FIRST';
  routineId?: string;               // 'ALL' (default) or routine option id
  routines?: RoutineScopeOption[];
  pinnedExerciseId?: string | null;  // When set, collapses empty '—' columns so only sessions with this exercise are shown!
}

// ============================================================================
// MODE 2 & MODE 3 DATA PROTOCOLS
// ============================================================================

export type ExerciseSortBy = 'MOST_FREQUENT' | 'RECENT' | 'ALPHABETICAL';

export interface ExerciseSparklinePoint {
  workoutId: string;
  performedAtIso: string;
  dateStr: string;
  weightKg: number;
  reps: number;
  e1rmKg: number;
  metricValue: number; // e1rmKg if > 0, else reps
  topSetShort: string; // e.g. "85kg×8" or "BW×12"
  delta: ProgressionDelta;
  isPr: boolean;
}

export interface ExerciseSessionHistoryItem {
  workoutId: string;
  performedAtIso: string;
  dateStr: string;
  dayStr: string;
  workoutTitle: string;
  source: 'ONLINE' | 'OFFLINE';
  sets: CompletedSetEntry[];
  topSetLabel: string;
  e1rmKg: number;
  totalTonnageKg: number;
  delta: ProgressionDelta;
  isPr: boolean;
}

export interface ExerciseProgressionCardData {
  exerciseId: string;
  exerciseName: string;
  totalSessions: number;
  latestPerformedAtIso: string;
  allTimePrBadge: string; // e.g. "🏆 PR: 85kg × 8 • e1RM 108kg"
  bestWeightKg: number;
  bestReps: number;
  bestE1rmKg: number;
  sparklinePoints: ExerciseSparklinePoint[]; // Last 6-10 chronological sessions (oldest -> newest)
  recentStrip: ExerciseSparklinePoint[];     // Last 4-5 chronological sessions (oldest -> newest)
  historyEntries: ExerciseSessionHistoryItem[]; // All sessions for this lift (newest -> oldest)
}

export interface SessionLogExerciseSummary {
  exerciseId: string;
  exerciseName: string;
  setCount: number;
  workingSetCount: number;
  bestSetLabel: string; // e.g. "75kg × 8"
  e1rmKg: number;
  isPr: boolean;
  delta: ProgressionDelta;
  sets: CompletedSetEntry[];
}

export interface SessionLogCardData {
  workoutId: string;
  performedAtIso: string;
  dateStr: string;
  dayStr: string;
  workoutTitle: string;
  source: 'ONLINE' | 'OFFLINE';
  durationSeconds: number;
  formattedDuration: string; // e.g. "54m"
  totalTonnageKg: number;
  totalSets: number;
  prCount: number;
  exercises: SessionLogExerciseSummary[];
  rawWorkout: CompletedWorkoutRecord;
}

export interface PostWorkoutLiftImprovement {
  exerciseId: string;
  exerciseName: string;
  topSetLabel: string;          // e.g. "85kg × 8"
  previousTopSetLabel: string;  // e.g. "82.5kg × 8"
  improvementBadge: string;     // e.g. "▲ +2.5kg", "▲ +2 reps", "🏆 New e1RM PR", "▲ +120kg Vol"
  detailText: string;           // e.g. "Up from 82.5kg × 8 last session"
  isAllTimePr: boolean;
}

export interface PostWorkoutEncouragementSummary {
  hasImprovements: boolean;
  headline: string;
  encouragingMessage: string;
  improvements: PostWorkoutLiftImprovement[];
  totalCompletedSets: number;
  totalTonnageKg: number;
  streakCount: number;
}

// ============================================================================
// SUCCINCT STRING FORMATTING UTILITIES & DETERMINISTIC FORMULAS
// ============================================================================

function formatWeightVal(weightKg: number): string {
  if (weightKg <= 0) return 'BW';
  const rounded = Math.round(weightKg * 10) / 10;
  return `${rounded}kg`;
}

/**
 * Calculates Epley Estimated 1 Rep Max (e1RM):
 * e1RM = weightKg * (1 + reps / 30)
 * Returns 0 if weightKg <= 0 or reps <= 0.
 * If reps === 1, returns weightKg.
 */
export function calculateSetE1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/**
 * Gracefully formats exercise weight and reps.
 * Handles bodyweight (0kg -> "BW × reps"),
 * weighted calisthenics ("BW+10kg × reps"),
 * and standard weighted lifts ("75kg × reps").
 */
export function formatExerciseWeightAndReps(
  weightKg: number,
  reps: number,
  exerciseId?: string,
  exerciseName?: string
): string {
  if (weightKg <= 0) {
    return `BW × ${reps}`;
  }
  const isCalisthenics = /(?:pull[-_]?up|chin[-_]?up|dip|muscle[-_]?up|push[-_]?up)/i.test(
    `${exerciseId || ''} ${exerciseName || ''}`
  );
  const rounded = Math.round(weightKg * 10) / 10;
  if (isCalisthenics) {
    return `BW+${rounded}kg × ${reps}`;
  }
  return `${rounded}kg × ${reps}`;
}

/**
 * Selects the top set from a session for an exercise:
 * - Prefers working sets over warmups.
 * - Chooses set with highest e1RM (if weighted) or highest reps (if pure bodyweight).
 * Returns complete SessionExerciseStats.
 */
export function selectSessionTopSet(
  sets: readonly CompletedSetEntry[] | undefined,
  exerciseId?: string,
  exerciseName?: string
): SessionExerciseStats | null {
  if (!sets || sets.length === 0) return null;
  const valid = sets.filter((s) => s.reps > 0);
  if (valid.length === 0) return null;

  const working = valid.filter((s) => s.setType !== 'WARMUP' && !s.isWarmup);
  const pool = working.length > 0 ? working : valid;

  let topSet: CompletedSetEntry = pool[0]!;
  let bestE1rm = calculateSetE1RM(topSet.weightKg, topSet.reps);

  for (let i = 1; i < pool.length; i++) {
    const candidate = pool[i]!;
    const candidateE1rm = calculateSetE1RM(candidate.weightKg, candidate.reps);
    if (candidateE1rm > bestE1rm) {
      topSet = candidate;
      bestE1rm = candidateE1rm;
    } else if (candidateE1rm === bestE1rm) {
      if (candidate.weightKg > topSet.weightKg || (candidate.weightKg === topSet.weightKg && candidate.reps > topSet.reps)) {
        topSet = candidate;
        bestE1rm = candidateE1rm;
      }
    }
  }

  const rawTonnage = valid.reduce(
    (sum, s) => sum + (s.weightKg > 0 ? s.weightKg * s.reps : 0),
    0
  );
  const totalTonnageKg = Math.round(rawTonnage * 10) / 10;
  const e1rmKg = Math.round(calculateSetE1RM(topSet.weightKg, topSet.reps));
  const topSetLabel = formatExerciseWeightAndReps(topSet.weightKg, topSet.reps, exerciseId, exerciseName);
  const totalSets = valid.length;
  const workingSets = working.length;

  const setSummaryLabel =
    e1rmKg > 0
      ? `${totalSets} set${totalSets === 1 ? '' : 's'} • e1RM ${e1rmKg}kg`
      : `${totalSets} set${totalSets === 1 ? '' : 's'} • ${valid.reduce((sum, s) => sum + s.reps, 0)} total reps`;

  return {
    topSet,
    topSetLabel,
    e1rmKg,
    totalSets,
    workingSets,
    totalTonnageKg,
    setSummaryLabel,
  };
}

/**
 * Computes progression delta comparing current top set to previous session's top set.
 */
export function computeProgressionDelta(
  currentTop: CompletedSetEntry,
  previousTop?: CompletedSetEntry | null
): ProgressionDelta {
  if (!previousTop) {
    return {
      direction: 'FIRST',
      badgeText: '★ Baseline',
      weightDiffKg: 0,
      repsDiff: 0,
      e1rmDiffKg: 0,
    };
  }

  const wDiff = Math.round((currentTop.weightKg - previousTop.weightKg) * 10) / 10;
  const rDiff = currentTop.reps - previousTop.reps;
  const currentE1rm = calculateSetE1RM(currentTop.weightKg, currentTop.reps);
  const prevE1rm = calculateSetE1RM(previousTop.weightKg, previousTop.reps);
  const eDiff = Math.round(currentE1rm - prevE1rm);

  if (wDiff > 0) {
    return {
      direction: 'UP',
      badgeText: `▲ +${wDiff}kg`,
      weightDiffKg: wDiff,
      repsDiff: rDiff,
      e1rmDiffKg: eDiff,
    };
  }

  if (wDiff < 0) {
    return {
      direction: 'DOWN',
      badgeText: `▼ ${wDiff}kg`,
      weightDiffKg: wDiff,
      repsDiff: rDiff,
      e1rmDiffKg: eDiff,
    };
  }

  // Same weight: check reps difference
  if (rDiff > 0) {
    return {
      direction: 'UP',
      badgeText: `▲ +${rDiff} rep${rDiff === 1 ? '' : 's'}`,
      weightDiffKg: 0,
      repsDiff: rDiff,
      e1rmDiffKg: eDiff,
    };
  }

  if (rDiff < 0) {
    return {
      direction: 'DOWN',
      badgeText: `▼ ${rDiff} rep${Math.abs(rDiff) === 1 ? '' : 's'}`,
      weightDiffKg: 0,
      repsDiff: rDiff,
      e1rmDiffKg: eDiff,
    };
  }

  return {
    direction: 'SAME',
    badgeText: '= Maint.',
    weightDiffKg: 0,
    repsDiff: 0,
    e1rmDiffKg: 0,
  };
}

/**
 * Succinctly formats an array of sets into a compact, human-readable summary.
 * Examples:
 * - 3 identical sets: "3 × 80kg × 8"
 * - Same weight, varying reps: "80kg × 10, 8, 6"
 * - Varying weights: "75kg × 10 • 80kg × 8 • 85kg × 6"
 */
export function formatSetsSuccinctSummary(sets: CompletedSetEntry[] | undefined): string {
  if (!sets || sets.length === 0) return '—';

  const valid = sets.filter((s) => s.reps > 0);
  if (valid.length === 0) return '—';

  const firstWeight = valid[0]?.weightKg ?? 0;
  const firstReps = valid[0]?.reps ?? 0;

  const allSameWeight = valid.every((s) => s.weightKg === firstWeight);
  const allSameReps = valid.every((s) => s.reps === firstReps);

  if (allSameWeight && allSameReps) {
    const wStr = formatWeightVal(firstWeight);
    return `${valid.length} × ${wStr} × ${firstReps}`;
  }

  if (allSameWeight) {
    const wStr = formatWeightVal(firstWeight);
    const repsList = valid.map((s) => s.reps).join(', ');
    return `${wStr} × ${repsList}`;
  }

  // Group contiguous sets of the same weight
  const chunks: Array<{ weightKg: number; reps: number[] }> = [];
  for (const s of valid) {
    const last = chunks[chunks.length - 1];
    if (last && last.weightKg === s.weightKg) {
      last.reps.push(s.reps);
    } else {
      chunks.push({ weightKg: s.weightKg, reps: [s.reps] });
    }
  }

  return chunks
    .map((c) => {
      const w = formatWeightVal(c.weightKg);
      if (c.reps.length > 1 && c.reps.every((r) => r === c.reps[0])) {
        return `${c.reps.length}×${w}×${c.reps[0]}`;
      }
      return `${w}×${c.reps.join(',')}`;
    })
    .join(' • ');
}

/**
 * Returns an array of concise lines representing each set or grouped sets.
 * Ideal for multi-line stacked display inside table cells.
 */
export function formatSetsMultiLine(sets: CompletedSetEntry[] | undefined): string[] {
  if (!sets || sets.length === 0) return ['—'];
  const valid = sets.filter((s) => s.reps > 0);
  if (valid.length === 0) return ['—'];

  const firstWeight = valid[0]?.weightKg ?? 0;
  const firstReps = valid[0]?.reps ?? 0;
  if (valid.every((s) => s.weightKg === firstWeight && s.reps === firstReps)) {
    return [`${valid.length} sets × ${formatWeightVal(firstWeight)}`, `${firstReps} reps each`];
  }

  if (valid.every((s) => s.weightKg === firstWeight)) {
    return [`${formatWeightVal(firstWeight)}`, valid.map((s) => `${s.reps} reps`).join(', ')];
  }

  return valid.map((s) => {
    const badge = s.setType && s.setType !== 'NORMAL' ? ` [${s.setType[0]}]` : '';
    return `${formatWeightVal(s.weightKg)} × ${s.reps}${badge}`;
  });
}

// ============================================================================
// DATE & HEADER HELPERS
// ============================================================================

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatWorkoutDateLabel(iso: string): { dateStr: string; dayStr: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return { dateStr: 'Date', dayStr: '' };
  }
  const month = MONTH_NAMES[d.getMonth()] ?? '';
  const dayOfMonth = d.getDate();
  const dayName = DAY_NAMES[d.getDay()] ?? '';
  return {
    dateStr: `${month} ${dayOfMonth}`,
    dayStr: dayName,
  };
}

// ============================================================================
// ROUTINE SCOPING & DISCOVERY
// ============================================================================

function normalizeRoutineName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function workoutMatchesRoutine(
  workout: CompletedWorkoutRecord,
  routine: RoutineScopeOption
): boolean {
  if (routine.id === 'ALL') return true;

  if (workout.presetName) {
    return normalizeRoutineName(workout.presetName) === normalizeRoutineName(routine.name);
  }

  if (routine.exerciseIds.length > 0 && workout.exercises.length > 0) {
    const matchedCount = workout.exercises.filter((ex) =>
      routine.exerciseIds.includes(ex.exerciseId)
    ).length;
    const workoutOverlap = matchedCount / workout.exercises.length;
    if (workoutOverlap > 0.5) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts distinct routine scope options from completed workouts and saved presets.
 * Returns horizontal pill options starting with "All Sessions (Dense)".
 */
export function extractRoutineScopeOptions(
  workouts: readonly CompletedWorkoutRecord[],
  presets?: readonly WorkoutPresetDefinition[]
): RoutineScopeOption[] {
  const allOption: RoutineScopeOption = {
    id: 'ALL',
    name: 'All Sessions (Dense)',
    icon: '🌐',
    exerciseIds: [],
    sessionCount: workouts.length,
  };

  const routineMap = new Map<string, RoutineScopeOption>();

  // 1. Ingest saved GYM presets
  if (presets) {
    for (const p of presets) {
      if (p.category !== 'GYM') continue;
      const key = normalizeRoutineName(p.name);
      const exerciseIds = (p.blocks?.exerciseBlocks || [])
        .map((b) => b.exerciseSlug)
        .filter(Boolean);
      routineMap.set(key, {
        id: p.id || `preset_${p.slug || key.replace(/[^a-z0-9]/g, '_')}`,
        name: p.name,
        icon: p.isSystemSeed ? '⚔️' : '⭐',
        exerciseIds,
        sessionCount: 0,
      });
    }
  }

  // 2. Discover distinct routines from workout records
  for (const w of workouts) {
    if (w.presetName && w.presetName.trim()) {
      const key = normalizeRoutineName(w.presetName);
      const existing = routineMap.get(key);
      const wExerciseIds = w.exercises.map((e) => e.exerciseId).filter(Boolean);
      if (!existing) {
        routineMap.set(key, {
          id: `routine_${key.replace(/[^a-z0-9]/g, '_')}`,
          name: w.presetName.trim(),
          icon: '🏋️',
          exerciseIds: wExerciseIds,
          sessionCount: 0,
        });
      } else {
        // Merge any unseen exercises
        for (const exId of wExerciseIds) {
          if (!existing.exerciseIds.includes(exId)) {
            existing.exerciseIds.push(exId);
          }
        }
      }
    }
  }

  // 3. Count matching sessions for each routine
  for (const r of routineMap.values()) {
    r.sessionCount = workouts.filter((w) => workoutMatchesRoutine(w, r)).length;
    if (r.sessionCount >= 3 && r.icon === '🏋️') {
      r.icon = '🔥';
    }
  }

  const routines = Array.from(routineMap.values()).filter(
    (r) => r.sessionCount > 0 || (presets && presets.some((p) => normalizeRoutineName(p.name) === normalizeRoutineName(r.name)))
  );

  return [allOption, ...routines];
}

// ============================================================================
// CHRONOLOGICAL PROGRESSION ACCUMULATOR
// ============================================================================

interface ExerciseChronologicalHistory {
  exerciseId: string;
  exerciseName: string;
  enrichedByWorkoutId: Record<string, EnrichedMatrixCell>;
  allSessionsAsc: Array<{
    workout: CompletedWorkoutRecord;
    stats: SessionExerciseStats;
    isPr: boolean;
    delta: ProgressionDelta;
  }>;
}

function computeAllChronologicalProgression(
  workouts: readonly CompletedWorkoutRecord[]
): Map<string, ExerciseChronologicalHistory> {
  // Sort all workouts oldest-to-newest
  const sortedAsc = [...workouts].sort((a, b) => {
    const tA = new Date(a.performedAtIso).getTime() || 0;
    const tB = new Date(b.performedAtIso).getTime() || 0;
    return tA - tB;
  });

  const historyMap = new Map<string, ExerciseChronologicalHistory>();

  for (const w of sortedAsc) {
    for (const ex of w.exercises) {
      if (!ex.exerciseId || ex.sets.length === 0) continue;

      let hist = historyMap.get(ex.exerciseId);
      if (!hist) {
        hist = {
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName || ex.exerciseId,
          enrichedByWorkoutId: {},
          allSessionsAsc: [],
        };
        historyMap.set(ex.exerciseId, hist);
      }

      const stats = selectSessionTopSet(ex.sets, ex.exerciseId, ex.exerciseName);
      if (!stats) continue;

      const prevEntry = hist.allSessionsAsc[hist.allSessionsAsc.length - 1];
      const prevTop = prevEntry ? prevEntry.stats.topSet : null;
      const delta = computeProgressionDelta(stats.topSet, prevTop);

      // PR Calculation:
      let isPr = false;
      if (hist.allSessionsAsc.length >= 1) {
        if (stats.topSet.weightKg > 0) {
          const maxPreviousE1rm = Math.max(
            ...hist.allSessionsAsc.map((s) => s.stats.e1rmKg)
          );
          if (stats.e1rmKg >= maxPreviousE1rm && stats.e1rmKg > 0) {
            isPr = true;
          }
        } else {
          // Pure bodyweight
          const maxPreviousReps = Math.max(
            ...hist.allSessionsAsc.map((s) => s.stats.topSet.reps)
          );
          if (stats.topSet.reps >= maxPreviousReps && stats.topSet.reps > 0) {
            isPr = true;
          }
        }
      }

      const enrichedCell: EnrichedMatrixCell = {
        workoutId: w.id,
        sets: ex.sets,
        topSet: stats.topSet,
        topSetLabel: stats.topSetLabel,
        isPr,
        delta,
        setSummaryLabel: stats.setSummaryLabel,
        e1rmKg: stats.e1rmKg,
        totalTonnageKg: stats.totalTonnageKg,
      };

      hist.enrichedByWorkoutId[w.id] = enrichedCell;
      hist.allSessionsAsc.push({
        workout: w,
        stats,
        isPr,
        delta,
      });
    }
  }

  return historyMap;
}

// ============================================================================
// MATRIX AGGREGATOR ENGINE
// ============================================================================

/**
 * Intelligently aggregates workout history into a progression matrix:
 * - Computes chronological progression and PRs per exercise across all sessions.
 * - Supports routine scoping to eliminate irrelevant blank exercise rows and session columns.
 * - Supports pinned exercise column collapsing so all sessions for that lift appear side-by-side.
 */
export function buildTrainingHistoryMatrix(
  workouts: CompletedWorkoutRecord[],
  options?: MatrixBuildOptions
): TrainingHistoryMatrix {
  const sortOrder = options?.sortOrder ?? 'LATEST_FIRST';
  const query = (options?.searchQuery ?? '').trim().toLowerCase();
  const routineId = options?.routineId ?? 'ALL';
  const pinnedExId = options?.pinnedExerciseId ?? null;

  // 1. Compute deterministic chronological progression for all exercises across all workouts
  const chronoMap = computeAllChronologicalProgression(workouts);

  // 2. Discover routine scope if routineId is set
  let selectedRoutine: RoutineScopeOption | undefined;
  if (routineId !== 'ALL') {
    const routineOptions = options?.routines || extractRoutineScopeOptions(workouts);
    selectedRoutine = routineOptions.find((r) => r.id === routineId);
  }

  // 3. Filter workouts (columns) by routine if applicable
  let filteredWorkouts = workouts;
  if (selectedRoutine && selectedRoutine.id !== 'ALL') {
    filteredWorkouts = filteredWorkouts.filter((w) => workoutMatchesRoutine(w, selectedRoutine!));
  }

  // 4. If pinnedExerciseId is set, collapse empty columns: keep only workouts with this exercise
  if (pinnedExId) {
    filteredWorkouts = filteredWorkouts.filter((w) =>
      w.exercises.some((e) => e.exerciseId === pinnedExId && e.sets.some((s) => s.reps > 0))
    );
  }

  // 5. Sort workouts chronologically or latest-first
  const sortedWorkouts = [...filteredWorkouts].sort((a, b) => {
    const tA = new Date(a.performedAtIso).getTime() || 0;
    const tB = new Date(b.performedAtIso).getTime() || 0;
    return sortOrder === 'LATEST_FIRST' ? tB - tA : tA - tB;
  });

  // 6. Build Columns
  const columns: TrainingHistoryMatrixColumn[] = sortedWorkouts.map((w) => {
    const { dateStr, dayStr } = formatWorkoutDateLabel(w.performedAtIso);
    const title =
      w.presetName ||
      (w.workoutCategory ? `Gym / ${w.workoutCategory}` : 'Workout Session');
    const totalSets = w.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);

    return {
      workoutId: w.id,
      performedAtIso: w.performedAtIso,
      formattedDate: dateStr,
      formattedDay: dayStr,
      presetOrCategoryTitle: title,
      source: w.source,
      totalExercises: w.exercises.length,
      totalSets,
    };
  });

  // 7. Collect unique exercises across relevant workouts
  const exerciseMap = new Map<
    string,
    {
      exerciseId: string;
      exerciseName: string;
      totalTimesPerformed: number;
      latestPerformanceDateIso: string;
      cellsByWorkoutId: Record<string, CompletedSetEntry[] | undefined>;
      enrichedCellsByWorkoutId: Record<string, EnrichedMatrixCell | undefined>;
    }
  >();

  // Determine which workout sessions populate the matrix rows
  const activeWorkoutsForRows =
    selectedRoutine && selectedRoutine.id !== 'ALL' ? sortedWorkouts : workouts;

  for (const w of activeWorkoutsForRows) {
    for (const ex of w.exercises) {
      if (!ex.exerciseId) continue;
      const key = ex.exerciseId;
      let existing = exerciseMap.get(key);
      if (!existing) {
        existing = {
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName || ex.exerciseId,
          totalTimesPerformed: 0,
          latestPerformanceDateIso: w.performedAtIso,
          cellsByWorkoutId: {},
          enrichedCellsByWorkoutId: {},
        };
        exerciseMap.set(key, existing);
      }

      const curLatest = new Date(existing.latestPerformanceDateIso).getTime();
      const thisDate = new Date(w.performedAtIso).getTime();
      if (thisDate > curLatest) {
        existing.latestPerformanceDateIso = w.performedAtIso;
      }

      if (ex.sets.length > 0) {
        existing.totalTimesPerformed += 1;
        existing.cellsByWorkoutId[w.id] = ex.sets;

        const hist = chronoMap.get(key);
        if (hist && hist.enrichedByWorkoutId[w.id]) {
          existing.enrichedCellsByWorkoutId[w.id] = hist.enrichedByWorkoutId[w.id];
        }
      }
    }
  }

  // 8. Convert to rows, apply optional search query filter, and sort
  let rows: TrainingHistoryMatrixRow[] = Array.from(exerciseMap.values());

  if (query) {
    rows = rows.filter(
      (r) =>
        r.exerciseName.toLowerCase().includes(query) ||
        r.exerciseId.toLowerCase().includes(query)
    );
  }

  // Sort rows: exercises with highest frequency / most recently done first
  rows.sort((a, b) => {
    if (b.totalTimesPerformed !== a.totalTimesPerformed) {
      return b.totalTimesPerformed - a.totalTimesPerformed;
    }
    const tA = new Date(a.latestPerformanceDateIso).getTime() || 0;
    const tB = new Date(b.latestPerformanceDateIso).getTime() || 0;
    return tB - tA;
  });

  return {
    columns,
    rows,
  };
}

// ============================================================================
// MODE 2: EXERCISE PROGRESSION CARDS BUILDER
// ============================================================================

export function buildExerciseProgressionCards(
  workouts: readonly CompletedWorkoutRecord[],
  options?: { searchQuery?: string; sortBy?: ExerciseSortBy }
): ExerciseProgressionCardData[] {
  const chronoMap = computeAllChronologicalProgression(workouts);
  const query = (options?.searchQuery ?? '').trim().toLowerCase();
  const sortBy = options?.sortBy ?? 'MOST_FREQUENT';

  const cards: ExerciseProgressionCardData[] = [];

  for (const hist of chronoMap.values()) {
    if (hist.allSessionsAsc.length === 0) continue;

    if (
      query &&
      !hist.exerciseName.toLowerCase().includes(query) &&
      !hist.exerciseId.toLowerCase().includes(query)
    ) {
      continue;
    }

    let bestWeightKg = 0;
    let bestReps = 0;
    let bestE1rmKg = 0;

    for (const session of hist.allSessionsAsc) {
      const top = session.stats.topSet;
      const e1rm = session.stats.e1rmKg;
      if (top.weightKg > 0) {
        if (e1rm > bestE1rmKg) {
          bestE1rmKg = e1rm;
          bestWeightKg = top.weightKg;
          bestReps = top.reps;
        } else if (e1rm === bestE1rmKg && top.weightKg > bestWeightKg) {
          bestWeightKg = top.weightKg;
          bestReps = top.reps;
        }
      } else {
        if (top.reps > bestReps) {
          bestReps = top.reps;
        }
      }
    }

    const allTimePrBadge =
      bestE1rmKg > 0
        ? `🏆 PR: ${bestWeightKg}kg × ${bestReps} • e1RM ${bestE1rmKg}kg`
        : `🏆 PR: BW × ${bestReps} reps`;

    const sparklinePoints: ExerciseSparklinePoint[] = hist.allSessionsAsc.map((s) => {
      const { dateStr } = formatWorkoutDateLabel(s.workout.performedAtIso);
      const top = s.stats.topSet;
      const wLabel = top.weightKg > 0 ? `${Math.round(top.weightKg * 10) / 10}kg` : 'BW';
      return {
        workoutId: s.workout.id,
        performedAtIso: s.workout.performedAtIso,
        dateStr,
        weightKg: top.weightKg,
        reps: top.reps,
        e1rmKg: s.stats.e1rmKg,
        metricValue: s.stats.e1rmKg > 0 ? s.stats.e1rmKg : top.reps,
        topSetShort: `${wLabel}×${top.reps}`,
        delta: s.delta,
        isPr: s.isPr,
      };
    });

    const recentStrip = sparklinePoints.slice(-5);

    const historyEntries: ExerciseSessionHistoryItem[] = [...hist.allSessionsAsc]
      .reverse()
      .map((s) => {
        const { dateStr, dayStr } = formatWorkoutDateLabel(s.workout.performedAtIso);
        const title =
          s.workout.presetName ||
          (s.workout.workoutCategory ? `Gym / ${s.workout.workoutCategory}` : 'Workout');
        return {
          workoutId: s.workout.id,
          performedAtIso: s.workout.performedAtIso,
          dateStr,
          dayStr,
          workoutTitle: title,
          source: s.workout.source,
          sets: s.stats.topSet ? s.workout.exercises.find((e) => e.exerciseId === hist.exerciseId)?.sets || [] : [],
          topSetLabel: s.stats.topSetLabel,
          e1rmKg: s.stats.e1rmKg,
          totalTonnageKg: s.stats.totalTonnageKg,
          delta: s.delta,
          isPr: s.isPr,
        };
      });

    const latestIso = hist.allSessionsAsc[hist.allSessionsAsc.length - 1]?.workout.performedAtIso || '';

    cards.push({
      exerciseId: hist.exerciseId,
      exerciseName: hist.exerciseName,
      totalSessions: hist.allSessionsAsc.length,
      latestPerformedAtIso: latestIso,
      allTimePrBadge,
      bestWeightKg,
      bestReps,
      bestE1rmKg,
      sparklinePoints: sparklinePoints.slice(-10),
      recentStrip,
      historyEntries,
    });
  }

  // Sort cards
  cards.sort((a, b) => {
    if (sortBy === 'MOST_FREQUENT') {
      if (b.totalSessions !== a.totalSessions) {
        return b.totalSessions - a.totalSessions;
      }
      return new Date(b.latestPerformedAtIso).getTime() - new Date(a.latestPerformedAtIso).getTime();
    }
    if (sortBy === 'RECENT') {
      return new Date(b.latestPerformedAtIso).getTime() - new Date(a.latestPerformedAtIso).getTime();
    }
    return a.exerciseName.localeCompare(b.exerciseName);
  });

  return cards;
}

// ============================================================================
// MODE 3: SESSION LOG CARDS BUILDER
// ============================================================================

export function buildSessionLogCards(
  workouts: readonly CompletedWorkoutRecord[],
  options?: { searchQuery?: string; sortOrder?: 'LATEST_FIRST' | 'OLDEST_FIRST' }
): SessionLogCardData[] {
  const chronoMap = computeAllChronologicalProgression(workouts);
  const query = (options?.searchQuery ?? '').trim().toLowerCase();
  const sortOrder = options?.sortOrder ?? 'LATEST_FIRST';

  const cards: SessionLogCardData[] = [];

  for (const w of workouts) {
    const { dateStr, dayStr } = formatWorkoutDateLabel(w.performedAtIso);
    const workoutTitle =
      w.presetName ||
      (w.workoutCategory ? `Gym / ${w.workoutCategory}` : 'Workout Session');

    let totalTonnageKg = 0;
    let totalSets = 0;
    let prCount = 0;

    const exercises: SessionLogExerciseSummary[] = [];

    for (const ex of w.exercises) {
      if (!ex.exerciseId || ex.sets.length === 0) continue;
      const hist = chronoMap.get(ex.exerciseId);
      const enriched = hist?.enrichedByWorkoutId[w.id];

      const stats = selectSessionTopSet(ex.sets, ex.exerciseId, ex.exerciseName);
      if (!stats) continue;

      totalTonnageKg += stats.totalTonnageKg;
      totalSets += stats.totalSets;

      const isPr = enriched?.isPr ?? false;
      const delta = enriched?.delta ?? computeProgressionDelta(stats.topSet, null);

      if (isPr) {
        prCount += 1;
      }

      exercises.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName || ex.exerciseId,
        setCount: stats.totalSets,
        workingSetCount: stats.workingSets,
        bestSetLabel: stats.topSetLabel,
        e1rmKg: stats.e1rmKg,
        isPr,
        delta,
        sets: ex.sets,
      });
    }

    // Filter by search query if present
    if (query) {
      const titleMatches = workoutTitle.toLowerCase().includes(query);
      const exMatches = exercises.some((e) => e.exerciseName.toLowerCase().includes(query));
      if (!titleMatches && !exMatches) {
        continue;
      }
    }

    const durationMins = Math.round(w.durationSeconds / 60);
    const formattedDuration =
      w.durationSeconds >= 3600
        ? `${Math.floor(w.durationSeconds / 3600)}h ${Math.floor((w.durationSeconds % 3600) / 60)}m`
        : `${durationMins}m`;

    cards.push({
      workoutId: w.id,
      performedAtIso: w.performedAtIso,
      dateStr,
      dayStr,
      workoutTitle,
      source: w.source,
      durationSeconds: w.durationSeconds,
      formattedDuration,
      totalTonnageKg: Math.round(totalTonnageKg * 10) / 10,
      totalSets,
      prCount,
      exercises,
      rawWorkout: w,
    });
  }

  cards.sort((a, b) => {
    const tA = new Date(a.performedAtIso).getTime() || 0;
    const tB = new Date(b.performedAtIso).getTime() || 0;
    return sortOrder === 'LATEST_FIRST' ? tB - tA : tA - tB;
  });

  return cards;
}

/**
 * Evaluates a completed workout session against historical sessions to produce
 * a deterministic summary with lift-improvement progression cards and encouraging dialogue.
 */
export function evaluatePostWorkoutSummary(params: {
  currentWorkout: CompletedWorkoutRecord;
  previousWorkouts: readonly CompletedWorkoutRecord[];
  consistencyStreak?: number;
  cardioSegmentCount?: number;
}): PostWorkoutEncouragementSummary {
  const { currentWorkout, previousWorkouts } = params;
  const streakCount = Math.max(1, params.consistencyStreak ?? 1);

  // Filter previousWorkouts to exclude any workout with w.id === currentWorkout.id, sorted chronologically (oldest -> newest)
  const sortedHistory = [...previousWorkouts]
    .filter((w) => w.id !== currentWorkout.id)
    .sort((a, b) => new Date(a.performedAtIso).getTime() - new Date(b.performedAtIso).getTime());

  let totalCompletedSets = 0;
  let totalTonnageKg = 0;
  const improvements: PostWorkoutLiftImprovement[] = [];

  for (const ex of currentWorkout.exercises || []) {
    const currentStats = selectSessionTopSet(ex.sets, ex.exerciseId, ex.exerciseName);
    if (!currentStats) continue;

    totalCompletedSets += currentStats.totalSets;
    totalTonnageKg += currentStats.totalTonnageKg;

    // Find all prior workouts containing ex.exerciseId with valid sets
    const priorSessions: Array<{ workout: CompletedWorkoutRecord; stats: SessionExerciseStats }> = [];
    for (const pw of sortedHistory) {
      const matchEx = pw.exercises?.find((e) => e.exerciseId === ex.exerciseId);
      if (matchEx) {
        const pStats = selectSessionTopSet(matchEx.sets, matchEx.exerciseId, matchEx.exerciseName);
        if (pStats) {
          priorSessions.push({ workout: pw, stats: pStats });
        }
      }
    }

    if (priorSessions.length > 0) {
      const lastSession = priorSessions[priorSessions.length - 1]!;
      const prevStats = lastSession.stats;
      const delta = computeProgressionDelta(currentStats.topSet, prevStats.topSet);
      const maxPriorE1rm = Math.max(...priorSessions.map((s) => s.stats.e1rmKg));
      const maxPriorReps = Math.max(...priorSessions.map((s) => s.stats.topSet.reps));

      const isAllTimePr =
        currentStats.topSet.weightKg > 0
          ? currentStats.e1rmKg > maxPriorE1rm
          : currentStats.topSet.reps > maxPriorReps;

      const isImproved =
        delta.direction === 'UP' ||
        currentStats.e1rmKg > prevStats.e1rmKg ||
        isAllTimePr ||
        (delta.direction === 'SAME' && currentStats.totalTonnageKg > prevStats.totalTonnageKg);

      if (isImproved) {
        let improvementBadge: string;
        if (delta.direction === 'UP') {
          improvementBadge = delta.badgeText;
        } else if (isAllTimePr) {
          improvementBadge = '🏆 New PR';
        } else if (currentStats.e1rmKg > prevStats.e1rmKg) {
          improvementBadge = `▲ +${currentStats.e1rmKg - prevStats.e1rmKg}kg e1RM`;
        } else {
          improvementBadge = `▲ +${Math.round(currentStats.totalTonnageKg - prevStats.totalTonnageKg)}kg Vol`;
        }

        const detailText = `Previous: ${prevStats.topSetLabel}`;

        improvements.push({
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          topSetLabel: currentStats.topSetLabel,
          previousTopSetLabel: prevStats.topSetLabel,
          improvementBadge,
          detailText,
          isAllTimePr,
        });
      }
    }
  }

  totalTonnageKg = Math.round(totalTonnageKg * 10) / 10;

  if (improvements.length > 0) {
    const hasAnyAllTimePr = improvements.some((i) => i.isAllTimePr);
    const headline = hasAnyAllTimePr
      ? '🏆 New Personal Record & Lift Gains!'
      : '🔥 Lift Improvements Unlocked!';

    const names = improvements.map((i) => i.exerciseName);
    const nameSummary =
      names.length === 1
        ? names[0]!
        : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, 2).join(', ')}, and more`;

    const encouragingMessage = hasAnyAllTimePr
      ? `Phenomenal performance! You broke through with personal records on ${nameSummary}. Progressive overload in full effect—every extra kilo and rep compounds into massive strength over time. Keep this momentum rolling!`
      : `Outstanding progressive overload today! You pushed past previous limits on ${nameSummary}. Consistent gains like this compound into massive strength and resilience over time. Keep this momentum rolling!`;

    return {
      hasImprovements: true,
      headline,
      encouragingMessage,
      improvements,
      totalCompletedSets,
      totalTonnageKg,
      streakCount,
    };
  }

  const headline =
    streakCount > 1
      ? `🔥 ${streakCount}-Session Streak Sustained!`
      : '🛡️ Effort Logged — You Showed Up!';

  const encouragingMessage =
    streakCount > 1
      ? `Outstanding discipline! Not every training session is about hitting new PRs—showing up and sustaining your ${streakCount}-session streak is how elite habits are forged. You banked quality volume and kept the chain alive!`
      : `Solid work putting in the time today! You showed up, logged quality sets, and laid down another brick in your foundation. Consistency on the ordinary days is what makes future PRs possible!`;

  return {
    hasImprovements: false,
    headline,
    encouragingMessage,
    improvements: [],
    totalCompletedSets,
    totalTonnageKg,
    streakCount,
  };
}

// ============================================================================
// DEFAULT REALISTIC SAMPLE WORKOUT HISTORY (6 SESSIONS ACROSS 3 ROUTINES)
// ============================================================================

const NOW = Date.now();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SAMPLE_WORKOUT_HISTORY: CompletedWorkoutRecord[] = [
  // Session 1: Upper Body Push (1 day ago) - PRs set
  {
    id: 'sample_wk_push_3',
    source: 'OFFLINE',
    performedAtIso: new Date(NOW - ONE_DAY_MS * 1).toISOString(),
    durationSeconds: 3240, // 54 mins
    workoutCategory: 'GYM',
    presetName: 'Upper Body Push Preset',
    exercises: [
      {
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Flat Bench Press',
        sets: [
          { setNumber: 1, weightKg: 80, reps: 8, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 85, reps: 8, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 85, reps: 8, rpe: 9.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'pepin_db_incline_press',
        exerciseName: 'Pepin Adjustable DB Incline Press',
        sets: [
          { setNumber: 1, weightKg: 32, reps: 10, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 36, reps: 8, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 36, reps: 8, rpe: 9.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'cable_face_pulls',
        exerciseName: 'Cable Face Pulls',
        sets: [
          { setNumber: 1, weightKg: 27.5, reps: 15, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 30, reps: 15, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 32.5, reps: 12, rpe: 9, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'parallel_bar_dips',
        exerciseName: 'Parallel Bar Dips',
        sets: [
          { setNumber: 1, weightKg: 0, reps: 12, rpe: 7.5, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 10, reps: 10, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 10, reps: 10, rpe: 9, setType: 'NORMAL' },
        ],
      },
    ],
  },

  // Session 2: Heavy Back & Pull (3 days ago) - PRs set
  {
    id: 'sample_wk_pull_2',
    source: 'ONLINE',
    performedAtIso: new Date(NOW - ONE_DAY_MS * 3).toISOString(),
    durationSeconds: 3600, // 60 mins
    workoutCategory: 'GYM',
    presetName: 'Heavy Back & Pull Protocol',
    exercises: [
      {
        exerciseId: 'weighted_pullup',
        exerciseName: 'Weighted Pull-Ups',
        sets: [
          { setNumber: 1, weightKg: 15, reps: 6, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 15, reps: 6, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 15, reps: 6, rpe: 9.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'landmine_meadows_row',
        exerciseName: 'Landmine Single-Arm Meadows Row',
        sets: [
          { setNumber: 1, weightKg: 42.5, reps: 8, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 45, reps: 8, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 45, reps: 8, rpe: 9, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'cable_face_pulls',
        exerciseName: 'Cable Face Pulls',
        sets: [
          { setNumber: 1, weightKg: 27.5, reps: 15, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 27.5, reps: 15, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 27.5, reps: 15, rpe: 9, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'cable_lateral_raise',
        exerciseName: 'Cable Lateral Raise',
        sets: [
          { setNumber: 1, weightKg: 10, reps: 12, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 10, reps: 12, rpe: 9, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 7.5, reps: 15, rpe: 10, setType: 'DROP_SET' },
        ],
      },
    ],
  },

  // Session 3: Upper Body Push/Pull Supersets (4 days ago)
  {
    id: 'sample_wk_push_pull_1',
    source: 'OFFLINE',
    performedAtIso: new Date(NOW - ONE_DAY_MS * 4).toISOString(),
    durationSeconds: 3120, // 52 mins
    workoutCategory: 'GYM',
    presetName: 'Upper Body Strength & Hypertrophy A (Push/Pull Supersets)',
    exercises: [
      {
        exerciseId: 'smith_incline_bench_press',
        exerciseName: 'Smith Machine Incline Bench Press',
        sets: [
          { setNumber: 1, weightKg: 70, reps: 8, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 75, reps: 8, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 75, reps: 8, rpe: 9, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'weighted_pullup',
        exerciseName: 'Weighted Pull-Ups',
        sets: [
          { setNumber: 1, weightKg: 15, reps: 8, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 15, reps: 8, rpe: 9, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'pepin_db_incline_press',
        exerciseName: 'Pepin Adjustable DB Incline Press',
        sets: [
          { setNumber: 1, weightKg: 32.5, reps: 10, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 32.5, reps: 10, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'landmine_meadows_row',
        exerciseName: 'Landmine Single-Arm Meadows Row',
        sets: [
          { setNumber: 1, weightKg: 40, reps: 10, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 40, reps: 10, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
    ],
  },

  // Session 4: Upper Body Push (7 days ago)
  {
    id: 'sample_wk_push_2',
    source: 'OFFLINE',
    performedAtIso: new Date(NOW - ONE_DAY_MS * 7).toISOString(),
    durationSeconds: 3000, // 50 mins
    workoutCategory: 'GYM',
    presetName: 'Upper Body Push Preset',
    exercises: [
      {
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Flat Bench Press',
        sets: [
          { setNumber: 1, weightKg: 80, reps: 8, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 80, reps: 8, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 80, reps: 8, rpe: 9, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'pepin_db_incline_press',
        exerciseName: 'Pepin Adjustable DB Incline Press',
        sets: [
          { setNumber: 1, weightKg: 32, reps: 10, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 32, reps: 10, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'cable_face_pulls',
        exerciseName: 'Cable Face Pulls',
        sets: [
          { setNumber: 1, weightKg: 27.5, reps: 15, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 27.5, reps: 15, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'parallel_bar_dips',
        exerciseName: 'Parallel Bar Dips',
        sets: [
          { setNumber: 1, weightKg: 0, reps: 10, rpe: 7, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 10, reps: 8, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
    ],
  },

  // Session 5: Heavy Back & Pull (8 days ago)
  {
    id: 'sample_wk_pull_1',
    source: 'ONLINE',
    performedAtIso: new Date(NOW - ONE_DAY_MS * 8).toISOString(),
    durationSeconds: 3480, // 58 mins
    workoutCategory: 'GYM',
    presetName: 'Heavy Back & Pull Protocol',
    exercises: [
      {
        exerciseId: 'weighted_pullup',
        exerciseName: 'Weighted Pull-Ups',
        sets: [
          { setNumber: 1, weightKg: 12.5, reps: 6, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 12.5, reps: 6, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'landmine_meadows_row',
        exerciseName: 'Landmine Single-Arm Meadows Row',
        sets: [
          { setNumber: 1, weightKg: 40, reps: 8, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 40, reps: 8, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'cable_face_pulls',
        exerciseName: 'Cable Face Pulls',
        sets: [
          { setNumber: 1, weightKg: 25, reps: 15, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 25, reps: 15, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'cable_lateral_raise',
        exerciseName: 'Cable Lateral Raise',
        sets: [
          { setNumber: 1, weightKg: 7.5, reps: 15, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 7.5, reps: 15, rpe: 9, setType: 'NORMAL' },
        ],
      },
    ],
  },

  // Session 6: Upper Body Push (14 days ago) - Baseline
  {
    id: 'sample_wk_push_1',
    source: 'OFFLINE',
    performedAtIso: new Date(NOW - ONE_DAY_MS * 14).toISOString(),
    durationSeconds: 2880, // 48 mins
    workoutCategory: 'GYM',
    presetName: 'Upper Body Push Preset',
    exercises: [
      {
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Flat Bench Press',
        sets: [
          { setNumber: 1, weightKg: 77.5, reps: 8, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 77.5, reps: 8, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'pepin_db_incline_press',
        exerciseName: 'Pepin Adjustable DB Incline Press',
        sets: [
          { setNumber: 1, weightKg: 30, reps: 10, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 30, reps: 10, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'cable_face_pulls',
        exerciseName: 'Cable Face Pulls',
        sets: [
          { setNumber: 1, weightKg: 25, reps: 15, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 25, reps: 15, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'parallel_bar_dips',
        exerciseName: 'Parallel Bar Dips',
        sets: [
          { setNumber: 1, weightKg: 0, reps: 10, rpe: 7, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 0, reps: 10, rpe: 7.5, setType: 'NORMAL' },
        ],
      },
    ],
  },
];
