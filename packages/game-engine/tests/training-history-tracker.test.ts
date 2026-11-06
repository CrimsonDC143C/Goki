import { describe, it, expect } from 'vitest';
import {
  buildTrainingHistoryMatrix,
  formatSetsSuccinctSummary,
  formatSetsMultiLine,
  formatWorkoutDateLabel,
  calculateSetE1RM,
  formatExerciseWeightAndReps,
  selectSessionTopSet,
  computeProgressionDelta,
  extractRoutineScopeOptions,
  buildExerciseProgressionCards,
  buildSessionLogCards,
  evaluatePostWorkoutSummary,
  filterWorkoutsForCharacter,
  countWorkoutsForCharacter,
  pruneTrainingHistory,
  rebuildHistoricalPRsFromWorkouts,
  DEFAULT_SAMPLE_WORKOUT_HISTORY,
  CompletedWorkoutRecord,
  CompletedSetEntry,
} from '../src/training-history-tracker';

describe('Training History Tracker', () => {
  describe('formatSetsSuccinctSummary', () => {
    it('returns a dash for empty or missing sets', () => {
      expect(formatSetsSuccinctSummary([])).toBe('—');
      expect(formatSetsSuccinctSummary(undefined)).toBe('—');
    });

    it('succinctly formats identical sets (e.g. 3 × 80kg × 8)', () => {
      const sets: CompletedSetEntry[] = [
        { weightKg: 80, reps: 8 },
        { weightKg: 80, reps: 8 },
        { weightKg: 80, reps: 8 },
      ];
      expect(formatSetsSuccinctSummary(sets)).toBe('3 × 80kg × 8');
    });

    it('succinctly formats same weight with varying reps (e.g. 80kg × 10, 8, 6)', () => {
      const sets: CompletedSetEntry[] = [
        { weightKg: 80, reps: 10 },
        { weightKg: 80, reps: 8 },
        { weightKg: 80, reps: 6 },
      ];
      expect(formatSetsSuccinctSummary(sets)).toBe('80kg × 10, 8, 6');
    });

    it('succinctly formats varying weights with bullet separators', () => {
      const sets: CompletedSetEntry[] = [
        { weightKg: 60, reps: 10 },
        { weightKg: 70, reps: 8 },
        { weightKg: 80, reps: 6 },
      ];
      expect(formatSetsSuccinctSummary(sets)).toBe('60kg×10 • 70kg×8 • 80kg×6');
    });

    it('formats bodyweight sets cleanly with BW label', () => {
      const sets: CompletedSetEntry[] = [
        { weightKg: 0, reps: 12 },
        { weightKg: 0, reps: 12 },
      ];
      expect(formatSetsSuccinctSummary(sets)).toBe('2 × BW × 12');
    });
  });

  describe('formatSetsMultiLine', () => {
    it('returns structured line breakdown', () => {
      const sets: CompletedSetEntry[] = [
        { weightKg: 80, reps: 8 },
        { weightKg: 80, reps: 8 },
      ];
      const lines = formatSetsMultiLine(sets);
      expect(lines).toEqual(['2 sets × 80kg', '8 reps each']);
    });
  });

  describe('formatWorkoutDateLabel', () => {
    it('formats ISO dates correctly into month, day, and weekday', () => {
      const { dateStr, dayStr } = formatWorkoutDateLabel('2026-11-02T10:00:00Z');
      expect(dateStr).toContain('Nov');
      expect(dayStr).toBeTruthy();
    });
  });

  describe('calculateSetE1RM & formatExerciseWeightAndReps', () => {
    it('calculates Epley e1RM correctly', () => {
      // 80kg * (1 + 8/30) = 80 * 1.2666... = 101.33
      expect(Math.round(calculateSetE1RM(80, 8))).toBe(101);
      // 1 rep returns the weight itself
      expect(calculateSetE1RM(100, 1)).toBe(100);
      // 0 weight or 0 reps returns 0
      expect(calculateSetE1RM(0, 12)).toBe(0);
      expect(calculateSetE1RM(100, 0)).toBe(0);
    });

    it('formats exercise weight and reps for bodyweight, calisthenics, and barbell lifts', () => {
      expect(formatExerciseWeightAndReps(0, 12, 'pushups')).toBe('BW × 12');
      expect(formatExerciseWeightAndReps(15, 6, 'weighted_pullup', 'Weighted Pull-Ups')).toBe('BW+15kg × 6');
      expect(formatExerciseWeightAndReps(10, 8, 'parallel_bar_dips', 'Parallel Bar Dips')).toBe('BW+10kg × 8');
      expect(formatExerciseWeightAndReps(85, 8, 'bench_press', 'Barbell Bench Press')).toBe('85kg × 8');
    });
  });

  describe('selectSessionTopSet', () => {
    it('selects highest e1RM working set and ignores warmups', () => {
      const sets: CompletedSetEntry[] = [
        { weightKg: 60, reps: 10, isWarmup: true, setType: 'WARMUP' },
        { weightKg: 80, reps: 8, isWarmup: false, setType: 'NORMAL' },
        { weightKg: 85, reps: 8, isWarmup: false, setType: 'NORMAL' }, // Highest e1RM
        { weightKg: 80, reps: 7, isWarmup: false, setType: 'NORMAL' },
      ];

      const stats = selectSessionTopSet(sets, 'bench_press', 'Barbell Flat Bench Press');
      expect(stats).not.toBeNull();
      expect(stats?.topSet.weightKg).toBe(85);
      expect(stats?.topSet.reps).toBe(8);
      expect(stats?.workingSets).toBe(3);
      expect(stats?.totalSets).toBe(4);
      expect(stats?.e1rmKg).toBe(108);
      expect(stats?.topSetLabel).toBe('85kg × 8');
    });

    it('handles pure bodyweight sets selecting highest reps', () => {
      const sets: CompletedSetEntry[] = [
        { weightKg: 0, reps: 10, setType: 'NORMAL' },
        { weightKg: 0, reps: 15, setType: 'NORMAL' },
        { weightKg: 0, reps: 12, setType: 'NORMAL' },
      ];

      const stats = selectSessionTopSet(sets, 'pushups', 'Push-Ups');
      expect(stats).not.toBeNull();
      expect(stats?.topSet.reps).toBe(15);
      expect(stats?.e1rmKg).toBe(0);
      expect(stats?.topSetLabel).toBe('BW × 15');
      expect(stats?.setSummaryLabel).toBe('3 sets • 37 total reps');
    });
  });

  describe('computeProgressionDelta', () => {
    it('returns Baseline for first session with no previous top set', () => {
      const current: CompletedSetEntry = { weightKg: 80, reps: 8 };
      const delta = computeProgressionDelta(current, null);
      expect(delta.direction).toBe('FIRST');
      expect(delta.badgeText).toBe('★ Baseline');
    });

    it('returns UP when weight increases', () => {
      const prev: CompletedSetEntry = { weightKg: 80, reps: 8 };
      const curr: CompletedSetEntry = { weightKg: 82.5, reps: 8 };
      const delta = computeProgressionDelta(curr, prev);
      expect(delta.direction).toBe('UP');
      expect(delta.badgeText).toBe('▲ +2.5kg');
      expect(delta.weightDiffKg).toBe(2.5);
    });

    it('returns DOWN when weight decreases', () => {
      const prev: CompletedSetEntry = { weightKg: 85, reps: 8 };
      const curr: CompletedSetEntry = { weightKg: 80, reps: 8 };
      const delta = computeProgressionDelta(curr, prev);
      expect(delta.direction).toBe('DOWN');
      expect(delta.badgeText).toBe('▼ -5kg');
      expect(delta.weightDiffKg).toBe(-5);
    });

    it('returns UP when reps increase at the same weight', () => {
      const prev: CompletedSetEntry = { weightKg: 80, reps: 8 };
      const curr: CompletedSetEntry = { weightKg: 80, reps: 10 };
      const delta = computeProgressionDelta(curr, prev);
      expect(delta.direction).toBe('UP');
      expect(delta.badgeText).toBe('▲ +2 reps');
    });

    it('returns DOWN when reps decrease at the same weight', () => {
      const prev: CompletedSetEntry = { weightKg: 80, reps: 8 };
      const curr: CompletedSetEntry = { weightKg: 80, reps: 6 };
      const delta = computeProgressionDelta(curr, prev);
      expect(delta.direction).toBe('DOWN');
      expect(delta.badgeText).toBe('▼ -2 reps');
    });

    it('returns SAME when weight and reps match exactly', () => {
      const prev: CompletedSetEntry = { weightKg: 80, reps: 8 };
      const curr: CompletedSetEntry = { weightKg: 80, reps: 8 };
      const delta = computeProgressionDelta(curr, prev);
      expect(delta.direction).toBe('SAME');
      expect(delta.badgeText).toBe('= Maint.');
    });
  });

  describe('extractRoutineScopeOptions & routine-scoped buildTrainingHistoryMatrix', () => {
    it('discovers routines and produces pill options starting with All Sessions', () => {
      const options = extractRoutineScopeOptions(DEFAULT_SAMPLE_WORKOUT_HISTORY);
      expect(options.length).toBeGreaterThanOrEqual(3);
      expect(options[0]?.id).toBe('ALL');
      expect(options[0]?.name).toBe('All Sessions (Dense)');

      const pushOption = options.find((o) => o.name.includes('Upper Body Push'));
      expect(pushOption).toBeDefined();
      expect(pushOption?.sessionCount).toBe(3);
    });

    it('filters matrix columns and rows when routineId is selected', () => {
      const options = extractRoutineScopeOptions(DEFAULT_SAMPLE_WORKOUT_HISTORY);
      const pullOption = options.find((o) => o.name.includes('Heavy Back & Pull'));
      expect(pullOption).toBeDefined();

      const matrix = buildTrainingHistoryMatrix(DEFAULT_SAMPLE_WORKOUT_HISTORY, {
        routineId: pullOption?.id,
        routines: options,
      });

      // Columns should only be the 2 Heavy Back & Pull sessions
      expect(matrix.columns).toHaveLength(2);
      expect(matrix.columns.every((c) => c.presetOrCategoryTitle.includes('Back & Pull'))).toBe(true);

      // Rows should include weighted pullups
      const pullupRow = matrix.rows.find((r) => r.exerciseId === 'weighted_pullup');
      expect(pullupRow).toBeDefined();
    });

    it('collapses columns to only dates where pinnedExerciseId was performed', () => {
      const matrix = buildTrainingHistoryMatrix(DEFAULT_SAMPLE_WORKOUT_HISTORY, {
        pinnedExerciseId: 'weighted_pullup',
      });

      // weighted_pullup is performed in sample_wk_pull_2, sample_wk_push_pull_1, and sample_wk_pull_1 (3 sessions)
      expect(matrix.columns).toHaveLength(3);
      for (const col of matrix.columns) {
        const pullupRow = matrix.rows.find((r) => r.exerciseId === 'weighted_pullup');
        expect(pullupRow?.cellsByWorkoutId[col.workoutId]).toBeDefined();
      }
    });

    it('attaches enrichedCellsByWorkoutId with delta, isPr, and setSummaryLabel', () => {
      const matrix = buildTrainingHistoryMatrix(DEFAULT_SAMPLE_WORKOUT_HISTORY, {
        sortOrder: 'LATEST_FIRST',
      });
      const benchRow = matrix.rows.find((r) => r.exerciseId === 'bench_press');
      expect(benchRow).toBeDefined();
      expect(benchRow?.enrichedCellsByWorkoutId).toBeDefined();

      // Check the latest bench press session (sample_wk_push_3)
      const latestBenchCell = benchRow?.enrichedCellsByWorkoutId['sample_wk_push_3'];
      expect(latestBenchCell).toBeDefined();
      expect(latestBenchCell?.topSetLabel).toBe('85kg × 8');
      expect(latestBenchCell?.isPr).toBe(true);
      expect(latestBenchCell?.delta.direction).toBe('UP');
      expect(latestBenchCell?.delta.badgeText).toBe('▲ +5kg');
    });
  });

  describe('buildExerciseProgressionCards (Mode 2)', () => {
    it('builds progression cards with PR badges, sparkline points, and recent strips', () => {
      const cards = buildExerciseProgressionCards(DEFAULT_SAMPLE_WORKOUT_HISTORY, {
        sortBy: 'MOST_FREQUENT',
      });

      expect(cards.length).toBeGreaterThan(0);
      const benchCard = cards.find((c) => c.exerciseId === 'bench_press');
      expect(benchCard).toBeDefined();
      expect(benchCard?.totalSessions).toBe(3);
      expect(benchCard?.allTimePrBadge).toContain('🏆 PR: 85kg × 8');
      expect(benchCard?.sparklinePoints).toHaveLength(3);
      expect(benchCard?.recentStrip).toHaveLength(3);

      // Sparkline points are chronological (oldest -> newest)
      expect(benchCard?.sparklinePoints[0]?.weightKg).toBe(77.5);
      expect(benchCard?.sparklinePoints[1]?.weightKg).toBe(80);
      expect(benchCard?.sparklinePoints[2]?.weightKg).toBe(85);
      expect(benchCard?.sparklinePoints[2]?.isPr).toBe(true);
    });

    it('filters cards by search query', () => {
      const cards = buildExerciseProgressionCards(DEFAULT_SAMPLE_WORKOUT_HISTORY, {
        searchQuery: 'meadows',
      });
      expect(cards).toHaveLength(1);
      expect(cards[0]?.exerciseId).toBe('landmine_meadows_row');
    });
  });

  describe('buildSessionLogCards (Mode 3)', () => {
    it('builds session log cards with duration, tonnage, and PR detection', () => {
      const sessionCards = buildSessionLogCards(DEFAULT_SAMPLE_WORKOUT_HISTORY, {
        sortOrder: 'LATEST_FIRST',
      });

      expect(sessionCards).toHaveLength(6);
      const latestPushSession = sessionCards[0];
      expect(latestPushSession).toBeDefined();
      expect(latestPushSession?.workoutTitle).toBe('Upper Body Push Preset');
      expect(latestPushSession?.formattedDuration).toBe('54m');
      expect(latestPushSession?.totalTonnageKg).toBeGreaterThan(2000);
      expect(latestPushSession?.prCount).toBeGreaterThan(0);
      expect(latestPushSession?.exercises.length).toBe(4);
    });

    it('filters session cards by workout title or exercise name query', () => {
      const cards = buildSessionLogCards(DEFAULT_SAMPLE_WORKOUT_HISTORY, {
        searchQuery: 'Pull Protocol',
      });
      expect(cards).toHaveLength(2);
      expect(cards.every((c) => c.workoutTitle.includes('Pull Protocol'))).toBe(true);
    });
  });

  describe('evaluatePostWorkoutSummary', () => {
    it('detects weight and rep improvements on lifts compared to previous sessions and generates encouraging improvement dialogue', () => {
      const prevWorkout: CompletedWorkoutRecord = {
        id: 'wk_prev',
        source: 'OFFLINE',
        performedAtIso: '2026-11-01T10:00:00Z',
        durationSeconds: 3000,
        exercises: [
          {
            exerciseId: 'bench_press',
            exerciseName: 'Barbell Flat Bench Press',
            sets: [
              { weightKg: 80, reps: 8, setType: 'NORMAL' },
              { weightKg: 80, reps: 8, setType: 'NORMAL' },
            ],
          },
          {
            exerciseId: 'dumbbell_curl',
            exerciseName: 'Dumbbell Curl',
            sets: [
              { weightKg: 14, reps: 10, setType: 'NORMAL' },
            ],
          },
        ],
      };

      const currentWorkout: CompletedWorkoutRecord = {
        id: 'wk_curr',
        source: 'OFFLINE',
        performedAtIso: '2026-11-04T10:00:00Z',
        durationSeconds: 3200,
        exercises: [
          {
            exerciseId: 'bench_press',
            exerciseName: 'Barbell Flat Bench Press',
            sets: [
              { weightKg: 82.5, reps: 8, setType: 'NORMAL' },
            ],
          },
          {
            exerciseId: 'dumbbell_curl',
            exerciseName: 'Dumbbell Curl',
            sets: [
              { weightKg: 14, reps: 12, setType: 'NORMAL' },
            ],
          },
        ],
      };

      const summary = evaluatePostWorkoutSummary({
        currentWorkout,
        previousWorkouts: [prevWorkout],
        consistencyStreak: 4,
      });

      expect(summary.hasImprovements).toBe(true);
      expect(summary.headline).toContain('Personal Record');
      expect(summary.encouragingMessage).toContain('personal record');
      expect(summary.improvements).toHaveLength(2);

      const benchImp = summary.improvements.find((i) => i.exerciseId === 'bench_press');
      expect(benchImp).toBeDefined();
      expect(benchImp?.improvementBadge).toBe('▲ +2.5kg');
      expect(benchImp?.topSetLabel).toBe('82.5kg × 8');
      expect(benchImp?.previousTopSetLabel).toBe('80kg × 8');

      const curlImp = summary.improvements.find((i) => i.exerciseId === 'dumbbell_curl');
      expect(curlImp).toBeDefined();
      expect(curlImp?.improvementBadge).toBe('▲ +2 reps');
      expect(curlImp?.topSetLabel).toBe('14kg × 12');

      expect(summary.streakCount).toBe(4);
      expect(summary.totalCompletedSets).toBe(2);
      expect(summary.totalTonnageKg).toBeGreaterThan(0);
    });

    it('generates encouraging streak/effort/showing-up dialogue when lifts are maintained, slightly lower, or when logging a baseline session with no prior lift improvements', () => {
      // Test baseline (no prior sessions)
      const baselineWorkout: CompletedWorkoutRecord = {
        id: 'wk_base',
        source: 'OFFLINE',
        performedAtIso: '2026-11-01T10:00:00Z',
        durationSeconds: 2400,
        exercises: [
          {
            exerciseId: 'squats',
            exerciseName: 'Barbell Back Squat',
            sets: [{ weightKg: 100, reps: 5, setType: 'NORMAL' }],
          },
        ],
      };

      const baselineSummary = evaluatePostWorkoutSummary({
        currentWorkout: baselineWorkout,
        previousWorkouts: [],
        consistencyStreak: 1,
      });

      expect(baselineSummary.hasImprovements).toBe(false);
      expect(baselineSummary.headline).toContain('You Showed Up');
      expect(baselineSummary.encouragingMessage).toContain('Solid work');
      expect(baselineSummary.improvements).toHaveLength(0);
      expect(baselineSummary.streakCount).toBe(1);

      // Test maintained/lower with streak > 1
      const priorSession: CompletedWorkoutRecord = {
        id: 'wk_prior',
        source: 'OFFLINE',
        performedAtIso: '2026-11-02T10:00:00Z',
        durationSeconds: 2400,
        exercises: [
          {
            exerciseId: 'squats',
            exerciseName: 'Barbell Back Squat',
            sets: [
              { weightKg: 100, reps: 5, setType: 'NORMAL' },
              { weightKg: 100, reps: 5, setType: 'NORMAL' },
            ],
          },
        ],
      };

      const maintainedWorkout: CompletedWorkoutRecord = {
        id: 'wk_maint',
        source: 'OFFLINE',
        performedAtIso: '2026-11-04T10:00:00Z',
        durationSeconds: 2400,
        exercises: [
          {
            exerciseId: 'squats',
            exerciseName: 'Barbell Back Squat',
            sets: [
              { weightKg: 100, reps: 5, setType: 'NORMAL' },
            ],
          },
        ],
      };

      const maintainedSummary = evaluatePostWorkoutSummary({
        currentWorkout: maintainedWorkout,
        previousWorkouts: [priorSession],
        consistencyStreak: 5,
      });

      expect(maintainedSummary.hasImprovements).toBe(false);
      expect(maintainedSummary.headline).toContain('5-Session Streak Sustained');
      expect(maintainedSummary.encouragingMessage).toContain('5-session streak');
      expect(maintainedSummary.improvements).toHaveLength(0);
      expect(maintainedSummary.streakCount).toBe(5);
    });
  });

  describe('filterWorkoutsForCharacter & countWorkoutsForCharacter', () => {
    const charAWorkout1: CompletedWorkoutRecord = {
      id: 'wk_char_a_1',
      characterId: 'char_a',
      source: 'OFFLINE',
      performedAtIso: '2026-11-01T10:00:00Z',
      durationSeconds: 1800,
      exercises: [],
    };
    const charAWorkout2: CompletedWorkoutRecord = {
      id: 'wk_char_a_2',
      characterId: 'char_a',
      source: 'ONLINE',
      performedAtIso: '2026-11-02T10:00:00Z',
      durationSeconds: 2100,
      exercises: [],
    };
    const charBWorkout1: CompletedWorkoutRecord = {
      id: 'wk_char_b_1',
      characterId: 'char_b',
      source: 'OFFLINE',
      performedAtIso: '2026-11-03T10:00:00Z',
      durationSeconds: 2400,
      exercises: [],
    };

    const combinedHistory: CompletedWorkoutRecord[] = [
      ...DEFAULT_SAMPLE_WORKOUT_HISTORY,
      charAWorkout1,
      charAWorkout2,
      charBWorkout1,
    ];

    it('keeps all historical and sample workouts intact for the global Training History matrix while isolating progression per characterId', () => {
      // Global Training History matrix still sees all workouts (including deleted/other characters & samples)
      const fullMatrix = buildTrainingHistoryMatrix(combinedHistory);
      expect(fullMatrix.columns.length).toBe(combinedHistory.length);

      // Character A only counts its 2 completed workouts
      expect(filterWorkoutsForCharacter(combinedHistory, 'char_a')).toEqual([
        charAWorkout1,
        charAWorkout2,
      ]);
      expect(countWorkoutsForCharacter(combinedHistory, 'char_a')).toBe(2);

      // Character B only counts its 1 completed workout
      expect(filterWorkoutsForCharacter(combinedHistory, 'char_b')).toEqual([
        charBWorkout1,
      ]);
      expect(countWorkoutsForCharacter(combinedHistory, 'char_b')).toBe(1);

      // Newly created Character C starts at 0 workouts despite historical records existing
      expect(filterWorkoutsForCharacter(combinedHistory, 'char_c_new')).toEqual([]);
      expect(countWorkoutsForCharacter(combinedHistory, 'char_c_new')).toBe(0);

      // Null or undefined characterId returns 0
      expect(filterWorkoutsForCharacter(combinedHistory, null)).toEqual([]);
      expect(countWorkoutsForCharacter(combinedHistory, undefined)).toBe(0);
    });
  });

  describe('pruneTrainingHistory & rebuildHistoricalPRsFromWorkouts', () => {
    const fixedNowMs = new Date('2026-11-10T12:00:00Z').getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;

    const testWorkouts: CompletedWorkoutRecord[] = [
      {
        id: 'wk_recent_iron',
        gymId: 'iron-sanctum',
        gymName: 'Iron Sanctum',
        source: 'ONLINE',
        performedAtIso: new Date(fixedNowMs - 0.5 * DAY_MS).toISOString(), // 12h ago
        durationSeconds: 3000,
        workoutCategory: 'GYM',
        exercises: [
          {
            exerciseId: 'bench_press',
            exerciseName: 'Bench Press',
            sets: [{ weightKg: 100, reps: 5, setType: 'NORMAL' }],
          },
          {
            exerciseId: 'cable_face_pulls',
            exerciseName: 'Cable Face Pulls',
            sets: [{ weightKg: 30, reps: 15, setType: 'NORMAL' }],
          },
        ],
      },
      {
        id: 'wk_5d_home',
        gymId: 'home-outpost',
        gymName: 'Home Outpost',
        source: 'OFFLINE',
        performedAtIso: new Date(fixedNowMs - 5 * DAY_MS).toISOString(), // 5d ago
        durationSeconds: 2400,
        workoutCategory: 'CARDIO',
        exercises: [
          {
            exerciseId: 'zone2_run',
            exerciseName: 'Zone 2 Run',
            sets: [{ weightKg: 0, reps: 1, setType: 'NORMAL' }],
          },
        ],
      },
      {
        id: 'sample_wk_old_45d',
        gymId: null,
        gymName: null,
        source: 'OFFLINE',
        performedAtIso: new Date(fixedNowMs - 45 * DAY_MS).toISOString(), // 45d ago
        durationSeconds: 3600,
        workoutCategory: 'GYM',
        exercises: [
          {
            exerciseId: 'bench_press',
            exerciseName: 'Bench Press',
            sets: [{ weightKg: 80, reps: 8, setType: 'NORMAL' }],
          },
        ],
      },
    ];

    it('wipes all workouts when filter is ALL_TIME + ALL modifiers', () => {
      const res = pruneTrainingHistory(testWorkouts, { timeWindow: 'ALL_TIME' }, fixedNowMs);
      expect(res.remainingWorkouts).toHaveLength(0);
      expect(res.removedSessionsCount).toBe(3);
      expect(res.modifiedSessionsCount).toBe(0);
    });

    it('wipes only workouts within a specific time window (LAST_24H, LAST_7D, OLDER_THAN_30D)', () => {
      const last24h = pruneTrainingHistory(testWorkouts, { timeWindow: 'LAST_24H' }, fixedNowMs);
      expect(last24h.removedSessionsCount).toBe(1);
      expect(last24h.remainingWorkouts.map((w) => w.id)).toEqual(['wk_5d_home', 'sample_wk_old_45d']);

      const older30d = pruneTrainingHistory(testWorkouts, { timeWindow: 'OLDER_THAN_30D' }, fixedNowMs);
      expect(older30d.removedSessionsCount).toBe(1);
      expect(older30d.remainingWorkouts.map((w) => w.id)).toEqual(['wk_recent_iron', 'wk_5d_home']);
    });

    it('filters by gym location (including UNSPECIFIED) and workoutCategory / source', () => {
      const ironOnly = pruneTrainingHistory(testWorkouts, { gymId: 'iron-sanctum' }, fixedNowMs);
      expect(ironOnly.removedSessionsCount).toBe(1);
      expect(ironOnly.remainingWorkouts.map((w) => w.id)).toEqual(['wk_5d_home', 'sample_wk_old_45d']);

      const unspecifiedGym = pruneTrainingHistory(testWorkouts, { gymId: 'UNSPECIFIED' }, fixedNowMs);
      expect(unspecifiedGym.removedSessionsCount).toBe(1);
      expect(unspecifiedGym.remainingWorkouts.map((w) => w.id)).toEqual(['wk_recent_iron', 'wk_5d_home']);

      const sampleOnly = pruneTrainingHistory(testWorkouts, { source: 'SAMPLE_ONLY' }, fixedNowMs);
      expect(sampleOnly.removedSessionsCount).toBe(1);
      expect(sampleOnly.remainingWorkouts.map((w) => w.id)).toEqual(['wk_recent_iron', 'wk_5d_home']);
    });

    it('supports STRIP_EXERCISE vs REMOVE_SESSION when pruning a specific exercise/activity', () => {
      // STRIP_EXERCISE: strips bench_press from wk_recent_iron (keeping cable_face_pulls) and drops sample_wk_old_45d (since bench_press was its only exercise)
      const stripped = pruneTrainingHistory(
        testWorkouts,
        { exerciseId: 'bench_press', exercisePruneMode: 'STRIP_EXERCISE' },
        fixedNowMs
      );
      expect(stripped.removedSessionsCount).toBe(1);
      expect(stripped.modifiedSessionsCount).toBe(1);
      expect(stripped.removedExerciseEntriesCount).toBe(2);
      expect(stripped.remainingWorkouts).toHaveLength(2);
      expect(stripped.remainingWorkouts[0]?.exercises.map((e) => e.exerciseId)).toEqual([
        'cable_face_pulls',
      ]);

      // REMOVE_SESSION: removes both sessions that contained bench_press
      const removedSessions = pruneTrainingHistory(
        testWorkouts,
        { exerciseId: 'bench_press', exercisePruneMode: 'REMOVE_SESSION' },
        fixedNowMs
      );
      expect(removedSessions.removedSessionsCount).toBe(2);
      expect(removedSessions.modifiedSessionsCount).toBe(0);
      expect(removedSessions.remainingWorkouts.map((w) => w.id)).toEqual(['wk_5d_home']);
    });

    it('rebuilds historicalPRs accurately from remaining workouts', () => {
      const prsBefore = rebuildHistoricalPRsFromWorkouts(testWorkouts);
      // 100kg x 5 -> 100 * (1 + 5/30) = 116.67
      expect(prsBefore.bench_press?.bestE1RM).toBeCloseTo(116.67, 1);

      const afterRemovingRecent = pruneTrainingHistory(
        testWorkouts,
        { workoutIds: ['wk_recent_iron'] },
        fixedNowMs
      );
      const prsAfter = rebuildHistoricalPRsFromWorkouts(afterRemovingRecent.remainingWorkouts);
      // Falls back to 80kg x 8 -> 101.33
      expect(prsAfter.bench_press?.bestE1RM).toBeCloseTo(101.33, 1);
      expect(prsAfter.cable_face_pulls).toBeUndefined();
    });
  });
});
