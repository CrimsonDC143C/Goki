import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CompletedWorkoutRecord,
  RegisteredGymLocation,
  TrainingHistoryExercisePruneMode,
  TrainingHistoryPruneFilter,
  TrainingHistoryPruneResult,
  TrainingHistorySourceFilter,
  TrainingHistoryTimeWindow,
  WorkoutCategory,
  pruneTrainingHistory,
} from '@goki/game-engine';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export interface WipeTrainingHistoryModalProps {
  visible: boolean;
  workoutHistory: readonly CompletedWorkoutRecord[];
  registeredGyms: readonly RegisteredGymLocation[];
  onClose: () => void;
  onExecutePrune: (filter: TrainingHistoryPruneFilter) => TrainingHistoryPruneResult;
  onRestoreSamples: () => void;
}

const TIME_WINDOW_OPTIONS: Array<{
  id: TrainingHistoryTimeWindow;
  label: string;
  desc: string;
}> = [
  { id: 'ALL_TIME', label: '🌐 All Time', desc: 'Every workout matching the filters below' },
  { id: 'LAST_24H', label: '⏱️ Last 24 Hours', desc: 'Sessions logged within the past 24 hours' },
  { id: 'LAST_7D', label: '📅 Last 7 Days', desc: 'Sessions logged within the past 7 days' },
  { id: 'LAST_30D', label: '🗓️ Last 30 Days', desc: 'Sessions logged within the past 30 days' },
  { id: 'OLDER_THAN_30D', label: '📦 Older than 30d', desc: 'Archive cleanup (>30 days old)' },
  { id: 'OLDER_THAN_90D', label: '🏛️ Older than 90d', desc: 'Deep archive cleanup (>90 days old)' },
];

const CATEGORY_OPTIONS: Array<{
  id: WorkoutCategory | 'ALL';
  label: string;
}> = [
  { id: 'ALL', label: 'All Modalities' },
  { id: 'GYM', label: '🏋️ Gym / Iron' },
  { id: 'CARDIO', label: '🏃 Cardio' },
  { id: 'SPORT', label: '⚔️ Sport / HIIT' },
  { id: 'RECOVERY', label: '🧘 Recovery' },
];

const SOURCE_OPTIONS: Array<{
  id: TrainingHistorySourceFilter;
  label: string;
}> = [
  { id: 'ALL', label: 'All Sources' },
  { id: 'SAMPLE_ONLY', label: '🧪 Demo Sample Data Only' },
  { id: 'OFFLINE', label: '💾 Offline Logs Only' },
  { id: 'ONLINE', label: '⚡ Live Online Logs Only' },
];

export const WipeTrainingHistoryModal: React.FC<WipeTrainingHistoryModalProps> = ({
  visible,
  workoutHistory,
  registeredGyms,
  onClose,
  onExecutePrune,
  onRestoreSamples,
}) => {
  const [timeWindow, setTimeWindow] = useState<TrainingHistoryTimeWindow>('ALL_TIME');
  const [gymId, setGymId] = useState<string>('ALL');
  const [workoutCategory, setWorkoutCategory] = useState<WorkoutCategory | 'ALL'>('ALL');
  const [source, setSource] = useState<TrainingHistorySourceFilter>('ALL');
  const [exerciseId, setExerciseId] = useState<string>('ALL');
  const [exercisePruneMode, setExercisePruneMode] =
    useState<TrainingHistoryExercisePruneMode>('STRIP_EXERCISE');
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [lastResultBanner, setLastResultBanner] = useState<string | null>(null);

  // Reset confirmation whenever any modifier changes
  const updateModifier = <T,>(setter: (val: T) => void, value: T) => {
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    setter(value);
    setConfirmArmed(false);
    setLastResultBanner(null);
  };

  // Discover all gym locations represented in history + registered gyms
  const gymOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of registeredGyms) {
      map.set(g.id.trim().toLowerCase(), g.name);
    }
    map.set('open-world', 'Open World');
    let hasUnspecified = false;
    for (const wk of workoutHistory) {
      if (!wk.gymId || wk.gymId.trim().length === 0) {
        hasUnspecified = true;
      } else {
        const key = wk.gymId.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, wk.gymName || wk.gymId);
        }
      }
    }
    const list: Array<{ id: string; label: string }> = [
      { id: 'ALL', label: '🗺️ All Locations' },
    ];
    for (const [id, name] of map.entries()) {
      list.push({ id, label: `📍 ${name}` });
    }
    if (hasUnspecified) {
      list.push({ id: 'UNSPECIFIED', label: '❓ Unspecified / Legacy' });
    }
    return list;
  }, [workoutHistory, registeredGyms]);

  // Discover all exercises logged in workoutHistory
  const loggedExerciseOptions = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const wk of workoutHistory) {
      for (const ex of wk.exercises) {
        const prev = map.get(ex.exerciseId);
        if (prev) {
          prev.count += 1;
        } else {
          map.set(ex.exerciseId, { name: ex.exerciseName, count: 1 });
        }
      }
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
    return [
      { id: 'ALL', label: 'All Exercises & Activities', count: workoutHistory.length },
      ...sorted.map(([id, info]) => ({
        id,
        label: `${info.name} (${info.count})`,
        count: info.count,
      })),
    ];
  }, [workoutHistory]);

  const activeFilter: TrainingHistoryPruneFilter = useMemo(
    () => ({
      timeWindow,
      gymId,
      workoutCategory,
      source,
      exerciseId,
      exercisePruneMode,
    }),
    [timeWindow, gymId, workoutCategory, source, exerciseId, exercisePruneMode]
  );

  const preview = useMemo(
    () => pruneTrainingHistory(workoutHistory, activeFilter),
    [workoutHistory, activeFilter]
  );

  const totalAffected = preview.removedSessionsCount + preview.modifiedSessionsCount;

  const handleResetFilters = () => {
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    setTimeWindow('ALL_TIME');
    setGymId('ALL');
    setWorkoutCategory('ALL');
    setSource('ALL');
    setExerciseId('ALL');
    setExercisePruneMode('STRIP_EXERCISE');
    setConfirmArmed(false);
    setLastResultBanner(null);
  };

  const handleConfirmWipe = () => {
    if (!confirmArmed) {
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
      setConfirmArmed(true);
      return;
    }
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    const res = onExecutePrune(activeFilter);
    setConfirmArmed(false);
    const parts: string[] = [];
    if (res.removedSessionsCount > 0) {
      parts.push(`removed ${res.removedSessionsCount} session${res.removedSessionsCount === 1 ? '' : 's'}`);
    }
    if (res.modifiedSessionsCount > 0) {
      parts.push(`stripped activity from ${res.modifiedSessionsCount} session${res.modifiedSessionsCount === 1 ? '' : 's'}`);
    }
    parts.push('cleared recent quick exercises memory');
    setLastResultBanner(
      `✓ Wipe complete: ${parts.join(' & ')}. (${res.remainingWorkouts.length} session${res.remainingWorkouts.length === 1 ? '' : 's'} remaining)`
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>🗑️ WIPE / PRUNE TRAINING HISTORY</Text>
              <Text style={styles.subtitle}>
                Target all history or narrow by time window, gym sanctum, modality, or activity
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              testID="wipe-history-close-btn"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* Quick Preset Actions */}
            <View style={styles.quickBar}>
              <TouchableOpacity
                style={styles.quickChip}
                onPress={() => {
                  handleResetFilters();
                  setSource('SAMPLE_ONLY');
                }}
              >
                <Text style={styles.quickChipText}>🧪 Target Demo Samples Only</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickChip}
                onPress={() => {
                  handleResetFilters();
                  setTimeWindow('LAST_24H');
                }}
              >
                <Text style={styles.quickChipText}>⏱️ Target Today / Last 24h</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickResetChip} onPress={handleResetFilters}>
                <Text style={styles.quickResetChipText}>↺ Reset Filters</Text>
              </TouchableOpacity>
            </View>

            {/* 1. Time Window Modifier */}
            <Text style={styles.sectionLabel}>1. TIME WINDOW</Text>
            <View style={styles.chipWrap}>
              {TIME_WINDOW_OPTIONS.map((opt) => {
                const active = timeWindow === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => updateModifier(setTimeWindow, opt.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 2. Gym / Sanctum Location Modifier */}
            <Text style={styles.sectionLabel}>2. GYM / SANCTUM LOCATION</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalChips}
            >
              {gymOptions.map((opt) => {
                const active = gymId === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => updateModifier(setGymId, opt.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 3. Modality / Category & Source Modifiers */}
            <Text style={styles.sectionLabel}>3. ACTIVITY MODALITY & LOG SOURCE</Text>
            <View style={styles.chipWrap}>
              {CATEGORY_OPTIONS.map((opt) => {
                const active = workoutCategory === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => updateModifier(setWorkoutCategory, opt.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={[styles.chipWrap, { marginTop: 6 }]}>
              {SOURCE_OPTIONS.map((opt) => {
                const active = source === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => updateModifier(setSource, opt.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 4. Specific Exercise / Activity Modifier */}
            <Text style={styles.sectionLabel}>4. SPECIFIC EXERCISE / ACTIVITY</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalChips}
            >
              {loggedExerciseOptions.map((opt) => {
                const active = exerciseId === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => updateModifier(setExerciseId, opt.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {exerciseId !== 'ALL' && (
              <View style={styles.pruneModeBox}>
                <Text style={styles.pruneModeTitle}>
                  How should matching sessions with this exercise be handled?
                </Text>
                <View style={styles.pruneModeRow}>
                  <TouchableOpacity
                    style={[
                      styles.pruneModeBtn,
                      exercisePruneMode === 'STRIP_EXERCISE' && styles.pruneModeBtnActive,
                    ]}
                    onPress={() => updateModifier(setExercisePruneMode, 'STRIP_EXERCISE')}
                  >
                    <Text
                      style={[
                        styles.pruneModeBtnText,
                        exercisePruneMode === 'STRIP_EXERCISE' && styles.pruneModeBtnTextActive,
                      ]}
                    >
                      ✂️ Strip Exercise Only
                    </Text>
                    <Text style={styles.pruneModeSub}>
                      Keeps other lifts in that workout
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.pruneModeBtn,
                      exercisePruneMode === 'REMOVE_SESSION' && styles.pruneModeBtnActive,
                    ]}
                    onPress={() => updateModifier(setExercisePruneMode, 'REMOVE_SESSION')}
                  >
                    <Text
                      style={[
                        styles.pruneModeBtnText,
                        exercisePruneMode === 'REMOVE_SESSION' && styles.pruneModeBtnTextActive,
                      ]}
                    >
                      🗑️ Delete Whole Session
                    </Text>
                    <Text style={styles.pruneModeSub}>
                      Deletes any workout containing this lift
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Live Impact Preview Box */}
            <View
              style={[
                styles.previewBox,
                totalAffected > 0 ? styles.previewBoxDanger : styles.previewBoxNeutral,
              ]}
            >
              <Text style={styles.previewHeading}>LIVE PRUNE PREVIEW</Text>
              {totalAffected === 0 ? (
                <Text style={styles.previewDescription}>
                  No recorded workouts match the current combination of modifiers.
                </Text>
              ) : (
                <Text style={styles.previewDescription}>
                  Will delete{' '}
                  <Text style={styles.highlightRed}>
                    {preview.removedSessionsCount} full session
                    {preview.removedSessionsCount === 1 ? '' : 's'}
                  </Text>
                  {preview.modifiedSessionsCount > 0
                    ? ` and strip exercise logs from ${preview.modifiedSessionsCount} session${
                        preview.modifiedSessionsCount === 1 ? '' : 's'
                      }`
                    : ''}{' '}
                  ({preview.removedExerciseEntriesCount} exercise log
                  {preview.removedExerciseEntriesCount === 1 ? '' : 's'} total).{' '}
                  <Text style={styles.highlightGold}>
                    {preview.remainingWorkouts.length} session
                    {preview.remainingWorkouts.length === 1 ? '' : 's'} will remain.
                  </Text>
                </Text>
              )}
              <Text style={styles.previewSubnote}>
                All-time Personal Records (e1RM & volume baselines) recalculate from remaining history, and recent "Quick" exercises memory is wiped.
              </Text>
            </View>

            {lastResultBanner && (
              <View style={styles.resultBanner}>
                <Text style={styles.resultBannerText}>{lastResultBanner}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footerRow}>
            {workoutHistory.length === 0 && (
              <TouchableOpacity
                style={styles.restoreSamplesBtn}
                onPress={() => {
                  triggerSensoryCue('WORKOUT_PRESET_LOADED');
                  onRestoreSamples();
                  setLastResultBanner('✓ Restored starter sample training history.');
                }}
                testID="restore-sample-history-btn"
              >
                <Text style={styles.restoreSamplesBtnText}>🔄 Restore Demo Sample History</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.wipeExecuteBtn,
                confirmArmed && styles.wipeExecuteBtnArmed,
              ]}
              onPress={handleConfirmWipe}
              testID="execute-wipe-history-btn"
            >
              <Text style={styles.wipeExecuteBtnText}>
                {confirmArmed
                  ? totalAffected > 0
                    ? `⚠️ TAP AGAIN TO CONFIRM WIPE (${totalAffected} SESSION${
                        totalAffected === 1 ? '' : 'S'
                      } + QUICK MEMORY)`
                    : '⚠️ TAP AGAIN TO WIPE RECENT QUICK EXERCISES MEMORY'
                  : totalAffected > 0
                  ? `🗑️ Wipe Matching History (${totalAffected} Session${
                      totalAffected === 1 ? '' : 's'
                    } + Quick Memory)`
                  : '🗑️ Wipe Recent Quick Exercises Memory'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: '#18171C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#2B2932',
    paddingBottom: 10,
    marginBottom: 10,
  },
  title: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#26242C',
  },
  closeBtnText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '800',
  },
  scrollArea: {
    maxHeight: 440,
  },
  quickBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  quickChip: {
    backgroundColor: '#252129',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickChipText: {
    color: '#FDE68A',
    fontSize: 10.5,
    fontWeight: '800',
  },
  quickResetChip: {
    backgroundColor: '#222028',
    borderColor: '#4B5563',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickResetChipText: {
    color: '#D1D5DB',
    fontSize: 10.5,
    fontWeight: '700',
  },
  sectionLabel: {
    color: '#C69A45',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 6,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  horizontalChips: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: '#232129',
    borderWidth: 1,
    borderColor: '#35323E',
  },
  chipActive: {
    backgroundColor: '#5E1924',
    borderColor: '#F59E0B',
  },
  chipText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#FDE68A',
    fontWeight: '900',
  },
  pruneModeBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#201D26',
    borderWidth: 1,
    borderColor: '#3B3646',
  },
  pruneModeTitle: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  pruneModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pruneModeBtn: {
    flex: 1,
    padding: 8,
    borderRadius: 7,
    backgroundColor: '#19171E',
    borderWidth: 1,
    borderColor: '#322F3C',
  },
  pruneModeBtnActive: {
    backgroundColor: '#4C1D24',
    borderColor: '#F59E0B',
  },
  pruneModeBtnText: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '800',
  },
  pruneModeBtnTextActive: {
    color: '#FDE68A',
  },
  pruneModeSub: {
    color: '#9CA3AF',
    fontSize: 9.5,
    marginTop: 2,
  },
  previewBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 9,
    borderWidth: 1,
  },
  previewBoxDanger: {
    backgroundColor: 'rgba(127, 29, 29, 0.22)',
    borderColor: '#EF4444',
  },
  previewBoxNeutral: {
    backgroundColor: '#1F1D24',
    borderColor: '#374151',
  },
  previewHeading: {
    color: '#FCA5A5',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  previewDescription: {
    color: '#E5E7EB',
    fontSize: 11.5,
    lineHeight: 17,
  },
  highlightRed: {
    color: '#FCA5A5',
    fontWeight: '900',
  },
  highlightGold: {
    color: '#FDE68A',
    fontWeight: '800',
  },
  previewSubnote: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 6,
    fontStyle: 'italic',
  },
  resultBanner: {
    marginTop: 10,
    padding: 8,
    borderRadius: 7,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  resultBannerText: {
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  footerRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2B2932',
    gap: 8,
  },
  restoreSamplesBtn: {
    backgroundColor: '#24222B',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  restoreSamplesBtnText: {
    color: '#FDE68A',
    fontSize: 11.5,
    fontWeight: '800',
  },
  wipeExecuteBtn: {
    backgroundColor: '#7F1D1D',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  wipeExecuteBtnArmed: {
    backgroundColor: '#DC2626',
    borderColor: '#FDE68A',
  },
  wipeExecuteBtnDisabled: {
    backgroundColor: '#26242C',
    borderColor: '#3F3C4A',
  },
  wipeExecuteBtnText: {
    color: '#FEF2F2',
    fontSize: 12,
    fontWeight: '900',
  },
});
