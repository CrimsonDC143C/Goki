import { WorkoutCategory, SetType } from './workout-presets-rest';

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
}

export interface TrainingHistoryMatrix {
  columns: TrainingHistoryMatrixColumn[];
  rows: TrainingHistoryMatrixRow[];
}

// ============================================================================
// SUCCINCT STRING FORMATTING UTILITIES
// ============================================================================

function formatWeightVal(weightKg: number): string {
  if (weightKg <= 0) return 'BW';
  const rounded = Math.round(weightKg * 10) / 10;
  return `${rounded}kg`;
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

  // Filter out sets with 0 reps if any
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
// MATRIX AGGREGATOR ENGINE
// ============================================================================

export interface MatrixBuildOptions {
  searchQuery?: string;
  sortOrder?: 'LATEST_FIRST' | 'OLDEST_FIRST';
}

/**
 * Intelligently aggregates an arbitrary history of completed workouts into a
 * matrix where exercises are row headers and workouts/days are column headers.
 * Connects exercises across different presets or standalone logs.
 */
export function buildTrainingHistoryMatrix(
  workouts: CompletedWorkoutRecord[],
  options?: MatrixBuildOptions
): TrainingHistoryMatrix {
  const sortOrder = options?.sortOrder ?? 'LATEST_FIRST';
  const query = (options?.searchQuery ?? '').trim().toLowerCase();

  // 1. Sort workouts chronologically or latest-first
  const sortedWorkouts = [...workouts].sort((a, b) => {
    const tA = new Date(a.performedAtIso).getTime() || 0;
    const tB = new Date(b.performedAtIso).getTime() || 0;
    return sortOrder === 'LATEST_FIRST' ? tB - tA : tA - tB;
  });

  // 2. Build Columns
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

  // 3. Collect unique exercises across ALL workouts
  const exerciseMap = new Map<
    string,
    {
      exerciseId: string;
      exerciseName: string;
      totalTimesPerformed: number;
      latestPerformanceDateIso: string;
      cellsByWorkoutId: Record<string, CompletedSetEntry[] | undefined>;
    }
  >();

  for (const w of sortedWorkouts) {
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
        };
        exerciseMap.set(key, existing);
      }

      // Check if we should update latest performance date
      const curLatest = new Date(existing.latestPerformanceDateIso).getTime();
      const thisDate = new Date(w.performedAtIso).getTime();
      if (thisDate > curLatest) {
        existing.latestPerformanceDateIso = w.performedAtIso;
      }

      if (ex.sets.length > 0) {
        existing.totalTimesPerformed += 1;
        existing.cellsByWorkoutId[w.id] = ex.sets;
      }
    }
  }

  // 4. Convert to rows, apply optional search query filter, and sort
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
// DEFAULT REALISTIC SAMPLE WORKOUT HISTORY
// ============================================================================

const NOW = Date.now();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SAMPLE_WORKOUT_HISTORY: CompletedWorkoutRecord[] = [
  {
    id: 'sample_wk_1',
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
          { setNumber: 3, weightKg: 85, reps: 7, rpe: 9.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'pepin_db_incline_press',
        exerciseName: 'Pepin Adjustable DB Incline Press',
        sets: [
          { setNumber: 1, weightKg: 32, reps: 10, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 32, reps: 10, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 36, reps: 8, rpe: 9, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'cable_face_pulls',
        exerciseName: 'Cable Face Pulls',
        sets: [
          { setNumber: 1, weightKg: 27.5, reps: 15, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 27.5, reps: 15, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 32.5, reps: 12, rpe: 9, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'parallel_bar_dips',
        exerciseName: 'Parallel Bar Dips',
        sets: [
          { setNumber: 1, weightKg: 0, reps: 12, rpe: 7.5, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 10, reps: 10, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 10, reps: 8, rpe: 9, setType: 'NORMAL' },
        ],
      },
    ],
  },
  {
    id: 'sample_wk_2',
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
          { setNumber: 3, weightKg: 15, reps: 5, rpe: 9.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'landmine_meadows_row',
        exerciseName: 'Landmine Single-Arm Meadows Row',
        sets: [
          { setNumber: 1, weightKg: 40, reps: 10, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 45, reps: 8, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 45, reps: 8, rpe: 9, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'cable_face_pulls',
        exerciseName: 'Cable Face Pulls',
        sets: [
          { setNumber: 1, weightKg: 25, reps: 15, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 25, reps: 15, rpe: 8, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 25, reps: 15, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'cable_lateral_raise',
        exerciseName: 'Cable Lateral Raise',
        sets: [
          { setNumber: 1, weightKg: 10, reps: 15, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 10, reps: 12, rpe: 9, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 7.5, reps: 15, rpe: 10, setType: 'DROP_SET' },
        ],
      },
    ],
  },
  {
    id: 'sample_wk_3',
    source: 'OFFLINE',
    performedAtIso: new Date(NOW - ONE_DAY_MS * 5).toISOString(),
    durationSeconds: 2880, // 48 mins
    workoutCategory: 'GYM',
    presetName: 'Standalone Heavy Press Session',
    exercises: [
      {
        exerciseId: 'bench_press',
        exerciseName: 'Barbell Flat Bench Press',
        sets: [
          { setNumber: 1, weightKg: 80, reps: 8, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 80, reps: 8, rpe: 8, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 80, reps: 8, rpe: 8.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'overhead_press',
        exerciseName: 'Standing Overhead Press',
        sets: [
          { setNumber: 1, weightKg: 50, reps: 8, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 50, reps: 8, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 52.5, reps: 6, rpe: 9.5, setType: 'NORMAL' },
        ],
      },
      {
        exerciseId: 'smith_machine_squat',
        exerciseName: 'Smith Machine Squat',
        sets: [
          { setNumber: 1, weightKg: 90, reps: 10, rpe: 8, setType: 'NORMAL' },
          { setNumber: 2, weightKg: 100, reps: 8, rpe: 8.5, setType: 'NORMAL' },
          { setNumber: 3, weightKg: 100, reps: 8, rpe: 9, setType: 'NORMAL' },
        ],
      },
    ],
  },
];
