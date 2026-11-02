import { describe, it, expect } from 'vitest';
import {
  buildTrainingHistoryMatrix,
  formatSetsSuccinctSummary,
  formatSetsMultiLine,
  formatWorkoutDateLabel,
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

  describe('buildTrainingHistoryMatrix', () => {
    it('intelligently tracks exercises across multiple presets and standalone workouts', () => {
      const workouts: CompletedWorkoutRecord[] = [
        {
          id: 'wk_1',
          source: 'OFFLINE',
          performedAtIso: '2026-11-01T12:00:00Z',
          durationSeconds: 3000,
          presetName: 'Upper Body Push Preset',
          exercises: [
            {
              exerciseId: 'bench_press',
              exerciseName: 'Barbell Flat Bench Press',
              sets: [
                { weightKg: 85, reps: 8 },
                { weightKg: 85, reps: 8 },
              ],
            },
            {
              exerciseId: 'cable_face_pulls',
              exerciseName: 'Cable Face Pulls',
              sets: [{ weightKg: 25, reps: 15 }],
            },
          ],
        },
        {
          id: 'wk_2',
          source: 'ONLINE',
          performedAtIso: '2026-10-29T12:00:00Z',
          durationSeconds: 3600,
          presetName: 'Back & Pull Routine',
          exercises: [
            {
              exerciseId: 'cable_face_pulls',
              exerciseName: 'Cable Face Pulls',
              sets: [
                { weightKg: 25, reps: 15 },
                { weightKg: 30, reps: 12 },
              ],
            },
            {
              exerciseId: 'weighted_pullup',
              exerciseName: 'Weighted Pull-Ups',
              sets: [{ weightKg: 15, reps: 6 }],
            },
          ],
        },
        {
          id: 'wk_3',
          source: 'OFFLINE',
          performedAtIso: '2026-10-26T12:00:00Z',
          durationSeconds: 2400,
          presetName: undefined, // Standalone session
          exercises: [
            {
              exerciseId: 'bench_press',
              exerciseName: 'Barbell Flat Bench Press',
              sets: [{ weightKg: 80, reps: 10 }],
            },
          ],
        },
      ];

      const matrix = buildTrainingHistoryMatrix(workouts, { sortOrder: 'LATEST_FIRST' });

      // Columns should match 3 workouts ordered by latest first
      expect(matrix.columns).toHaveLength(3);
      expect(matrix.columns[0]?.workoutId).toBe('wk_1');
      expect(matrix.columns[1]?.workoutId).toBe('wk_2');
      expect(matrix.columns[2]?.workoutId).toBe('wk_3');

      // Unique exercises across all workouts: bench_press, cable_face_pulls, weighted_pullup
      expect(matrix.rows).toHaveLength(3);

      // Bench press row: performed in wk_1 and wk_3, but not wk_2
      const benchRow = matrix.rows.find((r) => r.exerciseId === 'bench_press');
      expect(benchRow).toBeDefined();
      expect(benchRow?.totalTimesPerformed).toBe(2);
      expect(benchRow?.cellsByWorkoutId['wk_1']).toHaveLength(2);
      expect(benchRow?.cellsByWorkoutId['wk_2']).toBeUndefined();
      expect(benchRow?.cellsByWorkoutId['wk_3']).toHaveLength(1);

      // Cable face pulls row: performed in wk_1 and wk_2, but not wk_3
      const facePullsRow = matrix.rows.find((r) => r.exerciseId === 'cable_face_pulls');
      expect(facePullsRow).toBeDefined();
      expect(facePullsRow?.totalTimesPerformed).toBe(2);
      expect(facePullsRow?.cellsByWorkoutId['wk_1']).toHaveLength(1);
      expect(facePullsRow?.cellsByWorkoutId['wk_2']).toHaveLength(2);
      expect(facePullsRow?.cellsByWorkoutId['wk_3']).toBeUndefined();

      // Weighted pull-up row: performed in wk_2 only
      const pullupRow = matrix.rows.find((r) => r.exerciseId === 'weighted_pullup');
      expect(pullupRow).toBeDefined();
      expect(pullupRow?.totalTimesPerformed).toBe(1);
      expect(pullupRow?.cellsByWorkoutId['wk_2']).toHaveLength(1);
    });

    it('filters rows by search query', () => {
      const workouts: CompletedWorkoutRecord[] = [
        {
          id: 'wk_1',
          source: 'OFFLINE',
          performedAtIso: '2026-11-01T12:00:00Z',
          durationSeconds: 1800,
          exercises: [
            { exerciseId: 'bench_press', exerciseName: 'Barbell Flat Bench Press', sets: [{ weightKg: 80, reps: 5 }] },
            { exerciseId: 'squat', exerciseName: 'Barbell Back Squat', sets: [{ weightKg: 100, reps: 5 }] },
          ],
        },
      ];

      const filtered = buildTrainingHistoryMatrix(workouts, { searchQuery: 'squat' });
      expect(filtered.rows).toHaveLength(1);
      expect(filtered.rows[0]?.exerciseId).toBe('squat');
    });
  });
});
