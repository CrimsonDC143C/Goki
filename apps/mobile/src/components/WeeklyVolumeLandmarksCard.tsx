import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  CompletedWorkoutRecord,
  ExerciseMuscleLookupMeta,
  MuscleVolumeLandmarkStatus,
  VolumeLandmarkZone,
  calculateWeeklyMuscleVolumeLandmarks,
} from '@gymify/game-engine';
import { MetricInfoBadge } from './MetricInfoTooltipModal';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export interface WeeklyVolumeLandmarksCardProps {
  workoutHistory: readonly CompletedWorkoutRecord[];
  exercisesCatalog?: readonly ExerciseMuscleLookupMeta[];
  onPressInfo: (contextualHeadline?: string | null, contextualNote?: string | null) => void;
}

const ZONE_PALETTE: Record<
  VolumeLandmarkZone,
  { bar: string; badgeText: string; badgeBg: string; badgeBorder: string; shortTag: string }
> = {
  UNDER_MEV: {
    bar: '#64748B',
    badgeText: '#94A3B8',
    badgeBg: 'rgba(100, 116, 139, 0.16)',
    badgeBorder: '#475569',
    shortTag: 'Under MEV',
  },
  MEV_TO_MAV: {
    bar: '#38BDF8',
    badgeText: '#7DD3FC',
    badgeBg: 'rgba(56, 189, 248, 0.14)',
    badgeBorder: '#0284C7',
    shortTag: 'Building',
  },
  OPTIMAL_MAV: {
    bar: '#10B981',
    badgeText: '#6EE7B7',
    badgeBg: 'rgba(16, 185, 129, 0.16)',
    badgeBorder: '#059669',
    shortTag: 'Optimal MAV',
  },
  APPROACHING_MRV: {
    bar: '#F59E0B',
    badgeText: '#FDE68A',
    badgeBg: 'rgba(245, 158, 11, 0.18)',
    badgeBorder: '#D97706',
    shortTag: 'Peak MAV',
  },
  OVER_MRV: {
    bar: '#EF4444',
    badgeText: '#FCA5A5',
    badgeBg: 'rgba(239, 68, 68, 0.18)',
    badgeBorder: '#DC2626',
    shortTag: 'Over MRV',
  },
};

export const WeeklyVolumeLandmarksCard: React.FC<WeeklyVolumeLandmarksCardProps> = ({
  workoutHistory,
  exercisesCatalog,
  onPressInfo,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const landmarks = useMemo(
    () =>
      calculateWeeklyMuscleVolumeLandmarks({
        workoutHistory,
        exercisesCatalog,
        windowDays: 7,
      }),
    [workoutHistory, exercisesCatalog]
  );

  const summaryCounts = useMemo(() => {
    const totalHardSets = landmarks.reduce((acc, m) => acc + m.weeklyWorkingSets, 0);
    const inOptimalOrBuilding = landmarks.filter(
      (m) =>
        m.zone === 'OPTIMAL_MAV' ||
        m.zone === 'MEV_TO_MAV' ||
        m.zone === 'APPROACHING_MRV'
    ).length;
    const overMrvCount = landmarks.filter((m) => m.zone === 'OVER_MRV').length;
    return { totalHardSets, inOptimalOrBuilding, overMrvCount };
  }, [landmarks]);

  const handleTilePress = (item: MuscleVolumeLandmarkStatus) => {
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    const headline = `${item.icon} ${item.muscleGroup}: ${item.weeklyWorkingSets} Hard Sets / 7d (${item.zoneLabel})`;
    const note = `Landmarks for ${item.muscleGroup}: MEV ${item.mev} sets • Optimal MAV ${item.mavLow}–${item.mavHigh} sets • MRV Ceiling ${item.mrv} sets. Warm-up [W] sets are automatically excluded.`;
    onPressInfo(headline, note);
  };

  return (
    <View style={styles.card}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleLeftGroup}>
          <Text style={styles.titleText}>📊 7-DAY MUSCLE VOLUME</Text>
          <MetricInfoBadge onPress={() => onPressInfo(null, null)} size="sm" />
          <View style={styles.setsSummaryBadge}>
            <Text style={styles.setsSummaryBadgeText}>
              {summaryCounts.totalHardSets} Hard Sets
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.collapseBtn}
          onPress={() => {
            triggerSensoryCue('SET_MICRO_REWARD_TICK');
            setCollapsed((prev) => !prev);
          }}
          activeOpacity={0.7}
          testID="volume-landmarks-collapse-btn"
        >
          <Text style={styles.collapseBtnText}>
            {collapsed
              ? `${summaryCounts.inOptimalOrBuilding}/6 Active ▾`
              : 'MEV / MAV / MRV ▴'}
          </Text>
        </TouchableOpacity>
      </View>

      {!collapsed && (
        <>
          {/* Compact 2-Column Muscle Grid */}
          <View style={styles.grid}>
            {landmarks.map((item) => {
              const palette = ZONE_PALETTE[item.zone];
              const mevPct = Math.min(96, Math.round((item.mev / item.mrv) * 100));
              const mavLowPct = Math.min(96, Math.round((item.mavLow / item.mrv) * 100));

              return (
                <Pressable
                  key={item.muscleGroup}
                  style={styles.muscleTile}
                  onPress={() => handleTilePress(item)}
                >
                  <View style={styles.tileTopRow}>
                    <Text style={styles.muscleNameText} numberOfLines={1}>
                      {item.icon} {item.muscleGroup}
                    </Text>
                    <Text style={styles.setCountText}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
                        {item.weeklyWorkingSets}
                      </Text>
                      /{item.mavHigh}
                    </Text>
                  </View>

                  {/* Progress Track with MEV & MAV Landmark Ticks */}
                  <View style={styles.trackOuter}>
                    <View
                      style={[
                        styles.trackFill,
                        {
                          width: `${Math.max(item.weeklyWorkingSets > 0 ? 6 : 0, item.fillPercent)}%`,
                          backgroundColor: palette.bar,
                        },
                      ]}
                    />
                    <View style={[styles.landmarkTick, { left: `${mevPct}%` }]} />
                    <View
                      style={[
                        styles.landmarkTick,
                        styles.landmarkTickMav,
                        { left: `${mavLowPct}%` },
                      ]}
                    />
                  </View>

                  <View style={styles.tileBottomRow}>
                    <Text style={styles.landmarkScaleHint}>
                      MEV {item.mev} • MAV {item.mavLow}-{item.mavHigh}
                    </Text>
                    <View
                      style={[
                        styles.zoneBadge,
                        {
                          backgroundColor: palette.badgeBg,
                          borderColor: palette.badgeBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.zoneBadgeText, { color: palette.badgeText }]}>
                        {palette.shortTag}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {summaryCounts.overMrvCount > 0 ? (
            <Text style={styles.deloadWatchNote}>
              ⚠️ {summaryCounts.overMrvCount} muscle group
              {summaryCounts.overMrvCount > 1 ? 's exceed' : ' exceeds'} weekly MRV recovery ceiling
              — consider a lighter deload session if joint fatigue rises.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#191721',
    borderWidth: 1,
    borderColor: '#2E2A3B',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  titleLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  titleText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  setsSummaryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: '#242130',
    borderWidth: 1,
    borderColor: '#3B364D',
  },
  setsSummaryBadgeText: {
    color: '#D1D5DB',
    fontSize: 9,
    fontWeight: '800',
  },
  collapseBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#221F2D',
    borderWidth: 1,
    borderColor: '#38334A',
  },
  collapseBtnText: {
    color: '#9CA3AF',
    fontSize: 9,
    fontWeight: '800',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
    rowGap: 6,
  },
  muscleTile: {
    width: '49%',
    backgroundColor: '#131218',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#292636',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  muscleNameText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '800',
    flex: 1,
  },
  setCountText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  trackOuter: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#252331',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 4,
  },
  trackFill: {
    height: '100%',
    borderRadius: 3,
  },
  landmarkTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  landmarkTickMav: {
    backgroundColor: 'rgba(253, 230, 138, 0.65)',
  },
  tileBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  landmarkScaleHint: {
    color: '#6B7280',
    fontSize: 8.5,
    fontWeight: '700',
  },
  zoneBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  zoneBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
  },
  deloadWatchNote: {
    marginTop: 6,
    color: '#FCA5A5',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
});
