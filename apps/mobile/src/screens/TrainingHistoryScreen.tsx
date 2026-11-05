import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import {
  CompletedSetEntry,
  CompletedWorkoutRecord,
  ProgressionDelta,
  buildTrainingHistoryMatrix,
  extractRoutineScopeOptions,
  buildExerciseProgressionCards,
  buildSessionLogCards,
  ExerciseProgressionCardData,
  ExerciseSparklinePoint,
  SessionLogCardData,
} from '@gymify/game-engine';
import { useGame } from '../state/GameContext';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export interface TrainingHistoryScreenProps {
  onBack: () => void;
  visible?: boolean;
  onLoadSessionIntoWorkout?: (workout: CompletedWorkoutRecord) => void;
}

type ProgressionHubMode = 'ROUTINE' | 'EXERCISE' | 'SESSION_LOG';
type ExerciseSortBy = 'MOST_FREQUENT' | 'RECENT' | 'ALPHABETICAL';

interface SelectedCellDetail {
  exerciseName: string;
  workoutTitle: string;
  workoutDate: string;
  source: 'ONLINE' | 'OFFLINE';
  e1rmKg?: number;
  totalTonnageKg?: number;
  sets: CompletedSetEntry[];
}

// ============================================================================
// SVG TREND SPARKLINE COMPONENT (MODE 2)
// ============================================================================

interface SparklineProps {
  points: ExerciseSparklinePoint[];
  width?: number;
  height?: number;
}

const ExerciseSparkline: React.FC<SparklineProps> = ({
  points,
  width = 116,
  height = 46,
}) => {
  if (!points || points.length === 0) {
    return <View style={{ width, height }} />;
  }

  const values = points.map((p) => p.metricValue);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;
  const padY = range === 0 ? 4 : range * 0.2;
  const safeMin = minVal - padY;
  const safeMax = maxVal + padY;
  const safeRange = safeMax - safeMin || 1;

  const padLeft = 8;
  const padRight = 8;
  const padTop = 6;
  const padBottom = 6;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const coords = points.map((p, idx) => {
    const x =
      points.length === 1
        ? width / 2
        : padLeft + (idx / (points.length - 1)) * plotW;
    const y =
      points.length === 1
        ? height / 2
        : height - padBottom - ((p.metricValue - safeMin) / safeRange) * plotH;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });

  const pathD = coords.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );

  const firstPt = coords[0]!;
  const lastPt = coords[coords.length - 1]!;
  const areaD = `${pathD} L ${lastPt.x} ${height} L ${firstPt.x} ${height} Z`;

  const isUpTrend =
    points.length >= 2 &&
    points[points.length - 1]!.metricValue >= points[0]!.metricValue;
  const strokeColor = isUpTrend ? '#10B981' : '#F59E0B';
  const gradId = `spark_${Math.random().toString(36).substring(2, 8)}`;

  return (
    <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={strokeColor} stopOpacity={0.4} />
            <Stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
          </LinearGradient>
        </Defs>

        {/* Shaded Area */}
        <Path d={areaD} fill={`url(#${gradId})`} />

        {/* Trend Polyline */}
        <Path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interim Dots */}
        {coords.map((pt, idx) => {
          if (idx === coords.length - 1) return null;
          return (
            <Circle
              key={idx}
              cx={pt.x}
              cy={pt.y}
              r={2}
              fill="#9CA3AF"
              opacity={0.6}
            />
          );
        })}

        {/* Latest Glowing Data Dot */}
        <Circle
          cx={lastPt.x}
          cy={lastPt.y}
          r={5.5}
          fill="#FCD34D"
          opacity={0.25}
        />
        <Circle cx={lastPt.x} cy={lastPt.y} r={3} fill="#FCD34D" />
      </Svg>
    </View>
  );
};

// ============================================================================
// PROGRESSION DELTA PILL HELPER
// ============================================================================

const DeltaPill: React.FC<{ delta: ProgressionDelta }> = ({ delta }) => {
  let bg = 'rgba(198, 154, 69, 0.15)';
  let border = '#C69A45';
  let text = '#DFB660';

  if (delta.direction === 'UP') {
    bg = 'rgba(16, 185, 129, 0.18)';
    border = '#10B981';
    text = '#34D399';
  } else if (delta.direction === 'DOWN') {
    bg = 'rgba(245, 158, 11, 0.16)';
    border = '#D97706';
    text = '#FBBF24';
  } else if (delta.direction === 'SAME') {
    bg = 'rgba(148, 163, 184, 0.15)';
    border = '#475569';
    text = '#94A3B8';
  }

  return (
    <View style={[styles.deltaPill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.deltaPillText, { color: text }]}>{delta.badgeText}</Text>
    </View>
  );
};

// ============================================================================
// MAIN COMPONENT: 3-MODE PROGRESSION HUB
// ============================================================================

export const TrainingHistoryScreen: React.FC<TrainingHistoryScreenProps> = ({
  onBack,
  visible = true,
  onLoadSessionIntoWorkout,
}) => {
  const { workoutHistory, presets } = useGame();
  const insets = useSafeAreaInsets();
  const safeTop =
    Platform.OS === 'web'
      ? 0
      : Math.max(insets.top, Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight ?? 28) + 4);
  const safeBottom =
    Platform.OS === 'web' ? 0 : Math.max(insets.bottom, 12);

  // Mode Selection
  const [mode, setMode] = useState<ProgressionHubMode>('ROUTINE');

  // Search & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'LATEST_FIRST' | 'OLDEST_FIRST'>('LATEST_FIRST');
  const [exerciseSortBy, setExerciseSortBy] = useState<ExerciseSortBy>('MOST_FREQUENT');

  // Routine-Scoped Matrix (Mode 1) State
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>('ALL');
  const [pinnedExerciseId, setPinnedExerciseId] = useState<string | null>(null);

  // Accordion Expansions
  const [expandedExerciseCards, setExpandedExerciseCards] = useState<Record<string, boolean>>({});
  const [expandedSessionCards, setExpandedSessionCards] = useState<Record<string, boolean>>({});

  // Cell Detail Modal State
  const [selectedCell, setSelectedCell] = useState<SelectedCellDetail | null>(null);

  // Routine Scope Options
  const routineOptions = useMemo(
    () => extractRoutineScopeOptions(workoutHistory, presets),
    [workoutHistory, presets]
  );

  // Mode 1: Training History Matrix
  const matrix = useMemo(() => {
    return buildTrainingHistoryMatrix(workoutHistory, {
      searchQuery,
      sortOrder,
      routineId: selectedRoutineId,
      routines: routineOptions,
      pinnedExerciseId,
    });
  }, [workoutHistory, searchQuery, sortOrder, selectedRoutineId, routineOptions, pinnedExerciseId]);

  // Mode 2: Exercise Progression Cards
  const exerciseCards = useMemo(() => {
    return buildExerciseProgressionCards(workoutHistory, {
      searchQuery,
      sortBy: exerciseSortBy,
    });
  }, [workoutHistory, searchQuery, exerciseSortBy]);

  // Mode 3: Session Log Cards
  const sessionCards = useMemo(() => {
    return buildSessionLogCards(workoutHistory, {
      searchQuery,
      sortOrder,
    });
  }, [workoutHistory, searchQuery, sortOrder]);

  const toggleSortOrder = () => {
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    setSortOrder((prev) => (prev === 'LATEST_FIRST' ? 'OLDEST_FIRST' : 'LATEST_FIRST'));
  };

  const handleCellPress = (
    exerciseName: string,
    workoutTitle: string,
    workoutDate: string,
    source: 'ONLINE' | 'OFFLINE',
    sets: CompletedSetEntry[] | undefined,
    e1rmKg?: number,
    totalTonnageKg?: number
  ) => {
    if (!sets || sets.length === 0) return;
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    setSelectedCell({
      exerciseName,
      workoutTitle,
      workoutDate,
      source,
      sets,
      e1rmKg,
      totalTonnageKg,
    });
  };

  const toggleExerciseExpand = (exId: string) => {
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    setExpandedExerciseCards((prev) => ({
      ...prev,
      [exId]: !prev[exId],
    }));
  };

  const toggleSessionExpand = (wkId: string) => {
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    setExpandedSessionCards((prev) => ({
      ...prev,
      [wkId]: !prev[wkId],
    }));
  };

  const pinnedExerciseName = useMemo(() => {
    if (!pinnedExerciseId) return null;
    return matrix.rows.find((r) => r.exerciseId === pinnedExerciseId)?.exerciseName || 'Lift';
  }, [pinnedExerciseId, matrix.rows]);

  const content = (
    <View style={[styles.root, { paddingBottom: safeBottom }]}>
      {/* 1. TOP HEADER BAR */}
      <View style={[styles.topBar, { paddingTop: safeTop + 8, paddingBottom: 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          testID="history-back-btn"
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.screenTitle}>📊 TRAINING HISTORY</Text>
          <Text style={styles.screenSubtitle}>
            {mode === 'ROUTINE'
              ? 'Cross-Session Progression Matrix'
              : mode === 'EXERCISE'
              ? 'Exercise Progression & Trend Sparklines'
              : 'Chronological Workout Feed'}
          </Text>
        </View>

        {mode !== 'EXERCISE' ? (
          <TouchableOpacity
            style={styles.sortToggleBtn}
            onPress={toggleSortOrder}
            activeOpacity={0.7}
          >
            <Text style={styles.sortToggleText}>
              {sortOrder === 'LATEST_FIRST' ? '📅 Newest' : '📅 Oldest'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 68 }} />
        )}
      </View>

      {/* 2. SEARCH & MODE SWITCHER */}
      <View style={styles.filterBar}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={
              mode === 'ROUTINE'
                ? 'Search exercises in matrix...'
                : mode === 'EXERCISE'
                ? 'Search lifts (e.g. Bench, Squat, Dips)...'
                : 'Search workouts or lifts...'
            }
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              onPress={() => setSearchQuery('')}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 3-Mode Segmented Control */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, mode === 'ROUTINE' && styles.segmentBtnActive]}
            onPress={() => {
              triggerSensoryCue('SET_MICRO_REWARD_TICK');
              setMode('ROUTINE');
            }}
          >
            <Text
              style={[
                styles.segmentBtnText,
                mode === 'ROUTINE' && styles.segmentBtnTextActive,
              ]}
            >
              📋 By Routine
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, mode === 'EXERCISE' && styles.segmentBtnActive]}
            onPress={() => {
              triggerSensoryCue('SET_MICRO_REWARD_TICK');
              setMode('EXERCISE');
            }}
          >
            <Text
              style={[
                styles.segmentBtnText,
                mode === 'EXERCISE' && styles.segmentBtnTextActive,
              ]}
            >
              📈 By Exercise
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, mode === 'SESSION_LOG' && styles.segmentBtnActive]}
            onPress={() => {
              triggerSensoryCue('SET_MICRO_REWARD_TICK');
              setMode('SESSION_LOG');
            }}
          >
            <Text
              style={[
                styles.segmentBtnText,
                mode === 'SESSION_LOG' && styles.segmentBtnTextActive,
              ]}
            >
              🗓️ Session Log
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ==================================================================== */}
      {/* MODE 1: ROUTINE-SCOPED PROGRESSION MATRIX                            */}
      {/* ==================================================================== */}
      {mode === 'ROUTINE' && (
        <View style={{ flex: 1 }}>
          {/* Horizontal Routine Selector Pill Bar */}
          <View style={styles.routinePillsWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.routinePillsScroll}
            >
              {routineOptions.map((routine) => {
                const isActive = selectedRoutineId === routine.id;
                return (
                  <TouchableOpacity
                    key={routine.id}
                    style={[
                      styles.routinePill,
                      isActive && styles.routinePillActive,
                    ]}
                    onPress={() => {
                      triggerSensoryCue('SET_MICRO_REWARD_TICK');
                      setSelectedRoutineId(routine.id);
                      setPinnedExerciseId(null);
                    }}
                  >
                    <Text style={styles.routinePillIcon}>{routine.icon}</Text>
                    <Text
                      style={[
                        styles.routinePillText,
                        isActive && styles.routinePillTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {routine.name}
                    </Text>
                    {routine.sessionCount > 0 && (
                      <View
                        style={[
                          styles.routineCountBadge,
                          isActive && styles.routineCountBadgeActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.routineCountBadgeText,
                            isActive && styles.routineCountBadgeTextActive,
                          ]}
                        >
                          {routine.sessionCount}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Hint or Pinned Banner */}
            {pinnedExerciseId ? (
              <TouchableOpacity
                style={styles.pinnedBanner}
                onPress={() => setPinnedExerciseId(null)}
              >
                <Text style={styles.pinnedBannerText}>
                  📌 Filtering columns to <Text style={{ fontWeight: '900' }}>{pinnedExerciseName}</Text> — Tap to unpin
                </Text>
              </TouchableOpacity>
            ) : selectedRoutineId === 'ALL' ? (
              <Text style={styles.denseHintText}>
                💡 Tap any Exercise row header on the left to pin & collapse empty columns
              </Text>
            ) : null}
          </View>

          {/* Matrix Table */}
          {matrix.columns.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateIcon}>🏋️</Text>
              <Text style={styles.emptyStateTitle}>No Matching Sessions</Text>
              <Text style={styles.emptyStateSub}>
                No recorded sessions match the selected routine or search query.
              </Text>
            </View>
          ) : matrix.rows.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateIcon}>🔍</Text>
              <Text style={styles.emptyStateTitle}>No Exercises Found</Text>
              <Text style={styles.emptyStateSub}>
                No exercises matched "{searchQuery}".
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.matrixVerticalScroll}
              contentContainerStyle={styles.matrixVerticalContent}
              showsVerticalScrollIndicator={true}
            >
              <View style={styles.tableFlexRow}>
                {/* Frozen Left Column: Exercises */}
                <View style={styles.frozenColumnContainer}>
                  <View style={styles.frozenHeaderCell}>
                    <Text style={styles.frozenHeaderTitle}>EXERCISE</Text>
                    <Text style={styles.frozenHeaderSubtitle}>Tap row to pin</Text>
                  </View>

                  {matrix.rows.map((row) => {
                    const isPinned = pinnedExerciseId === row.exerciseId;
                    return (
                      <TouchableOpacity
                        key={row.exerciseId}
                        style={[
                          styles.frozenRowCell,
                          isPinned && styles.frozenRowCellPinned,
                        ]}
                        onPress={() => {
                          triggerSensoryCue('SET_MICRO_REWARD_TICK');
                          setPinnedExerciseId((prev) => (prev === row.exerciseId ? null : row.exerciseId));
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.exerciseNameText,
                            isPinned && { color: '#FDE68A' },
                          ]}
                          numberOfLines={2}
                        >
                          {row.exerciseName}
                        </Text>
                        <View style={styles.frozenMetaRow}>
                          <Text style={styles.exerciseMetaCount}>
                            {row.totalTimesPerformed} session{row.totalTimesPerformed === 1 ? '' : 's'}
                          </Text>
                          {isPinned && <Text style={styles.pinnedTag}>📌 Pinned</Text>}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Horizontal Scrollable Workout Columns */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  style={styles.columnsHorizontalScroll}
                >
                  <View>
                    {/* Columns Header Row */}
                    <View style={styles.columnsHeaderRow}>
                      {matrix.columns.map((col) => (
                        <View key={col.workoutId} style={styles.columnHeaderCell}>
                          <View style={styles.colDateBadge}>
                            <Text style={styles.colDateText}>{col.formattedDate}</Text>
                            <Text style={styles.colDayText}>{col.formattedDay}</Text>
                          </View>
                          <Text style={styles.colWorkoutTitle} numberOfLines={1}>
                            {col.presetOrCategoryTitle}
                          </Text>
                          <View
                            style={[
                              styles.colSourceTag,
                              col.source === 'ONLINE'
                                ? styles.colSourceTagOnline
                                : styles.colSourceTagOffline,
                            ]}
                          >
                            <Text style={styles.colSourceTagText}>
                              {col.source === 'ONLINE' ? '⚡ Live' : '💾 Offline'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* Data Matrix Rows */}
                    {matrix.rows.map((row) => (
                      <View key={row.exerciseId} style={styles.matrixDataRow}>
                        {matrix.columns.map((col) => {
                          const enriched = row.enrichedCellsByWorkoutId[col.workoutId];
                          const hasSets = !!enriched;

                          return (
                            <TouchableOpacity
                              key={col.workoutId}
                              style={[
                                styles.matrixCell,
                                hasSets && styles.matrixCellPopulated,
                              ]}
                              onPress={() =>
                                handleCellPress(
                                  row.exerciseName,
                                  col.presetOrCategoryTitle,
                                  `${col.formattedDay}, ${col.formattedDate}`,
                                  col.source,
                                  enriched?.sets,
                                  enriched?.e1rmKg,
                                  enriched?.totalTonnageKg
                                )
                              }
                              activeOpacity={hasSets ? 0.7 : 1}
                            >
                              {hasSets && enriched ? (
                                <View style={styles.cellContentWrap}>
                                  {/* Line 1: Top Set + PR Trophy */}
                                  <Text style={styles.cellTopSetText} numberOfLines={1}>
                                    {enriched.topSetLabel}
                                    {enriched.isPr ? ' 🏆' : ''}
                                  </Text>

                                  {/* Line 2: Progression Delta Pill */}
                                  <DeltaPill delta={enriched.delta} />

                                  {/* Line 3: Set Summary */}
                                  <Text style={styles.cellSetSummaryText} numberOfLines={1}>
                                    {enriched.setSummaryLabel}
                                  </Text>
                                </View>
                              ) : (
                                <Text style={styles.cellEmptyDash}>—</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* ==================================================================== */}
      {/* MODE 2: EXERCISE PROGRESSION CARDS + TREND SPARKLINES                */}
      {/* ==================================================================== */}
      {mode === 'EXERCISE' && (
        <View style={{ flex: 1 }}>
          {/* Sort Filter Bar */}
          <View style={styles.exerciseSortRow}>
            <Text style={styles.exerciseSortLabel}>Sort By:</Text>
            <TouchableOpacity
              style={[
                styles.exerciseSortBtn,
                exerciseSortBy === 'MOST_FREQUENT' && styles.exerciseSortBtnActive,
              ]}
              onPress={() => {
                triggerSensoryCue('SET_MICRO_REWARD_TICK');
                setExerciseSortBy('MOST_FREQUENT');
              }}
            >
              <Text
                style={[
                  styles.exerciseSortBtnText,
                  exerciseSortBy === 'MOST_FREQUENT' && styles.exerciseSortBtnTextActive,
                ]}
              >
                🔥 Most Frequent
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.exerciseSortBtn,
                exerciseSortBy === 'RECENT' && styles.exerciseSortBtnActive,
              ]}
              onPress={() => {
                triggerSensoryCue('SET_MICRO_REWARD_TICK');
                setExerciseSortBy('RECENT');
              }}
            >
              <Text
                style={[
                  styles.exerciseSortBtnText,
                  exerciseSortBy === 'RECENT' && styles.exerciseSortBtnTextActive,
                ]}
              >
                🕒 Most Recent
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.exerciseSortBtn,
                exerciseSortBy === 'ALPHABETICAL' && styles.exerciseSortBtnActive,
              ]}
              onPress={() => {
                triggerSensoryCue('SET_MICRO_REWARD_TICK');
                setExerciseSortBy('ALPHABETICAL');
              }}
            >
              <Text
                style={[
                  styles.exerciseSortBtnText,
                  exerciseSortBy === 'ALPHABETICAL' && styles.exerciseSortBtnTextActive,
                ]}
              >
                🔤 A–Z
              </Text>
            </TouchableOpacity>
          </View>

          {exerciseCards.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateIcon}>🔍</Text>
              <Text style={styles.emptyStateTitle}>No Exercises Found</Text>
              <Text style={styles.emptyStateSub}>
                No exercises matched your search term "{searchQuery}".
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.cardVerticalScroll}
              contentContainerStyle={styles.cardVerticalContent}
            >
              {exerciseCards.map((card) => {
                const isExpanded = !!expandedExerciseCards[card.exerciseId];

                return (
                  <View key={card.exerciseId} style={styles.progressionCard}>
                    {/* Top Row: Name, PR Badge & SVG Sparkline */}
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.cardExerciseName} numberOfLines={2}>
                          {card.exerciseName}
                        </Text>
                        <Text style={styles.cardSessionCountSub}>
                          {card.totalSessions} session{card.totalSessions === 1 ? '' : 's'} logged
                        </Text>
                        <View style={styles.prBadgePill}>
                          <Text style={styles.prBadgeText}>{card.allTimePrBadge}</Text>
                        </View>
                      </View>

                      {/* SVG Trend Sparkline */}
                      <View style={styles.sparklineBox}>
                        <ExerciseSparkline points={card.sparklinePoints} />
                      </View>
                    </View>

                    {/* Recent Sessions Horizontal Strip */}
                    <View style={styles.recentStripSection}>
                      <Text style={styles.recentStripLabel}>RECENT PROGRESSION</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.recentStripRow}
                      >
                        {card.recentStrip.map((pt, pIdx) => (
                          <React.Fragment key={pt.workoutId}>
                            <View
                              style={[
                                styles.stripNode,
                                pt.isPr && styles.stripNodePr,
                              ]}
                            >
                              <Text style={styles.stripNodeDate}>{pt.dateStr}</Text>
                              <Text style={styles.stripNodeSet}>{pt.topSetShort}</Text>
                              <View style={{ marginTop: 2 }}>
                                <DeltaPill delta={pt.delta} />
                              </View>
                            </View>
                            {pIdx < card.recentStrip.length - 1 && (
                              <Text style={styles.stripArrow}>→</Text>
                            )}
                          </React.Fragment>
                        ))}
                      </ScrollView>
                    </View>

                    {/* Accordion Expand/Collapse Action */}
                    <TouchableOpacity
                      style={styles.cardAccordionToggle}
                      onPress={() => toggleExerciseExpand(card.exerciseId)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cardAccordionToggleText}>
                        {isExpanded
                          ? '▴ Hide Lift History'
                          : `▾ View Full Lift History (${card.totalSessions})`}
                      </Text>
                    </TouchableOpacity>

                    {/* Expanded History Entries */}
                    {isExpanded && (
                      <View style={styles.expandedHistoryContainer}>
                        {card.historyEntries.map((item) => (
                          <TouchableOpacity
                            key={item.workoutId}
                            style={styles.historySessionItem}
                            onPress={() =>
                              handleCellPress(
                                card.exerciseName,
                                item.workoutTitle,
                                `${item.dayStr}, ${item.dateStr}`,
                                item.source,
                                item.sets,
                                item.e1rmKg,
                                item.totalTonnageKg
                              )
                            }
                            activeOpacity={0.8}
                          >
                            <View style={styles.historySessionHeader}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.historySessionDate}>
                                  {item.dateStr} • {item.dayStr}
                                </Text>
                                <Text style={styles.historySessionTitle} numberOfLines={1}>
                                  {item.workoutTitle}
                                </Text>
                              </View>
                              <DeltaPill delta={item.delta} />
                              <Text style={styles.historySessionTonnage}>
                                {item.totalTonnageKg.toLocaleString()} kg
                              </Text>
                            </View>

                            {/* Set Pills Row */}
                            <View style={styles.historySetPillsWrap}>
                              {item.sets.map((s, sIdx) => {
                                const wStr = s.weightKg > 0 ? `${s.weightKg}kg` : 'BW';
                                return (
                                  <View key={sIdx} style={styles.historySetPill}>
                                    <Text style={styles.historySetPillText}>
                                      #{s.setNumber ?? sIdx + 1}: {wStr}×{s.reps}
                                      {s.rpe ? ` @${s.rpe}` : ''}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* ==================================================================== */}
      {/* MODE 3: SESSION LOG (CHRONOLOGICAL FEED)                             */}
      {/* ==================================================================== */}
      {mode === 'SESSION_LOG' && (
        <View style={{ flex: 1 }}>
          {sessionCards.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateIcon}>🔍</Text>
              <Text style={styles.emptyStateTitle}>No Workouts Found</Text>
              <Text style={styles.emptyStateSub}>
                No recorded workouts matched "{searchQuery}".
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.cardVerticalScroll}
              contentContainerStyle={styles.cardVerticalContent}
            >
              {sessionCards.map((session) => {
                const isExpanded = !!expandedSessionCards[session.workoutId];

                return (
                  <View key={session.workoutId} style={styles.sessionCard}>
                    {/* Session Card Header */}
                    <View style={styles.sessionCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.sessionDateText}>
                            {session.dateStr} • {session.dayStr}
                          </Text>
                          <View
                            style={[
                              styles.sessionSourceTag,
                              session.source === 'ONLINE'
                                ? styles.colSourceTagOnline
                                : styles.colSourceTagOffline,
                            ]}
                          >
                            <Text style={styles.colSourceTagText}>
                              {session.source === 'ONLINE' ? '⚡ Live' : '💾 Offline'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.sessionTitleText} numberOfLines={1}>
                          {session.workoutTitle}
                        </Text>
                      </View>

                      {/* Header Metrics */}
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.sessionDurationText}>
                          ⏱️ {session.formattedDuration}
                        </Text>
                        <Text style={styles.sessionTonnageText}>
                          🏋️ {session.totalTonnageKg.toLocaleString()} kg
                        </Text>
                        {session.prCount > 0 && (
                          <View style={styles.sessionPrBadge}>
                            <Text style={styles.sessionPrBadgeText}>
                              🏆 {session.prCount} PR{session.prCount === 1 ? '' : 's'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Exercise List */}
                    <View style={styles.sessionExercisesTable}>
                      {session.exercises.map((ex) => (
                        <View key={ex.exerciseId} style={styles.sessionExerciseRow}>
                          <View style={styles.sessionExerciseMainLine}>
                            <Text style={styles.sessionExNameText} numberOfLines={1}>
                              <Text style={{ color: '#DFB660', fontWeight: '800' }}>
                                {ex.setCount}×
                              </Text>{' '}
                              {ex.exerciseName}
                            </Text>

                            <View style={styles.sessionExRightGroup}>
                              <Text style={styles.sessionExBestLabel}>
                                Best: {ex.bestSetLabel}
                              </Text>
                              <DeltaPill delta={ex.delta} />
                              {ex.isPr && <Text style={{ fontSize: 12 }}>🏆</Text>}
                            </View>
                          </View>

                          {/* Expanded Set Details */}
                          {isExpanded && (
                            <View style={styles.sessionInlineSetsWrap}>
                              {ex.sets.map((s, sIdx) => {
                                const wStr = s.weightKg > 0 ? `${s.weightKg}kg` : 'BW';
                                return (
                                  <View key={sIdx} style={styles.inlineSetPill}>
                                    <Text style={styles.inlineSetPillText}>
                                      Set {s.setNumber ?? sIdx + 1}: {wStr} × {s.reps}
                                      {s.rpe ? ` @${s.rpe}` : ''}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      ))}
                    </View>

                    {/* Session Actions Footer */}
                    <View style={styles.sessionCardFooter}>
                      <TouchableOpacity
                        style={styles.sessionExpandBtn}
                        onPress={() => toggleSessionExpand(session.workoutId)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.sessionExpandBtnText}>
                          {isExpanded ? '▴ Hide Sets' : '🔍 View All Sets'}
                        </Text>
                      </TouchableOpacity>

                      {onLoadSessionIntoWorkout && (
                        <TouchableOpacity
                          style={styles.loadWorkoutBtn}
                          onPress={() => {
                            triggerSensoryCue('WORKOUT_PRESET_LOADED');
                            onLoadSessionIntoWorkout(session.rawWorkout);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.loadWorkoutBtnText}>🔄 Load into Workout</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* ==================================================================== */}
      {/* POP-UP SET BREAKDOWN DETAILS MODAL                                   */}
      {/* ==================================================================== */}
      {selectedCell && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedCell(null)}
        >
          <Pressable
            style={[styles.detailBackdrop, { paddingTop: safeTop + 12, paddingBottom: safeBottom + 12 }]}
            onPress={() => setSelectedCell(null)}
          >
            <View
              style={styles.detailCard}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.detailHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.detailExerciseTitle}>
                    {selectedCell.exerciseName}
                  </Text>
                  <Text style={styles.detailMetaSub}>
                    {selectedCell.workoutDate} • {selectedCell.workoutTitle} •{' '}
                    {selectedCell.source === 'ONLINE' ? 'Live Online' : 'Offline Draft'}
                  </Text>
                  {selectedCell.e1rmKg !== undefined && selectedCell.e1rmKg > 0 && (
                    <Text style={styles.detailE1rmSub}>
                      Estimated 1RM: <Text style={{ color: '#FDE68A', fontWeight: '900' }}>{selectedCell.e1rmKg} kg</Text>
                      {selectedCell.totalTonnageKg ? ` • Tonnage: ${selectedCell.totalTonnageKg.toLocaleString()} kg` : ''}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.detailCloseBtn}
                  onPress={() => setSelectedCell(null)}
                >
                  <Text style={styles.detailCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Set breakdown table */}
              <View style={styles.detailSetTableHeader}>
                <Text style={[styles.detailColHeader, { width: 36 }]}>SET</Text>
                <Text style={[styles.detailColHeader, { width: 64 }]}>TYPE</Text>
                <Text style={[styles.detailColHeader, { flex: 1 }]}>WEIGHT</Text>
                <Text style={[styles.detailColHeader, { flex: 1 }]}>REPS</Text>
                <Text style={[styles.detailColHeader, { width: 44 }]}>RPE</Text>
              </View>

              <ScrollView style={{ maxHeight: 240 }}>
                {selectedCell.sets.map((s, idx) => {
                  const setNum = s.setNumber ?? idx + 1;
                  const typeLabel = s.setType || (s.isWarmup ? 'WARMUP' : 'NORMAL');
                  const weightStr = s.weightKg > 0 ? `${s.weightKg} kg` : 'Bodyweight';

                  return (
                    <View key={idx} style={styles.detailSetRow}>
                      <Text style={[styles.detailSetCell, { width: 36, fontWeight: '700' }]}>
                        #{setNum}
                      </Text>
                      <View style={{ width: 64 }}>
                        <Text
                          style={[
                            styles.detailSetTypeBadge,
                            typeLabel === 'DROP_SET' && { color: '#EF4444' },
                            typeLabel === 'WARMUP' && { color: '#38BDF8' },
                          ]}
                        >
                          {typeLabel}
                        </Text>
                      </View>
                      <Text style={[styles.detailSetCell, { flex: 1, fontWeight: '800' }]}>
                        {weightStr}
                      </Text>
                      <Text style={[styles.detailSetCell, { flex: 1 }]}>
                        {s.reps} reps
                      </Text>
                      <Text style={[styles.detailSetCell, { width: 44, color: '#FCD34D' }]}>
                        {s.rpe ? `${s.rpe}` : '—'}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={styles.detailDismissBtn}
                onPress={() => setSelectedCell(null)}
              >
                <Text style={styles.detailDismissBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onBack}>
      {content}
    </Modal>
  );
};

// ============================================================================
// STYLESHEET
// ============================================================================

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#121114',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#19181D',
    borderBottomWidth: 1,
    borderBottomColor: '#2B2930',
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#26242B',
  },
  backBtnText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '700',
  },
  headerCenter: {
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#E8E6E1',
    letterSpacing: 0.5,
  },
  screenSubtitle: {
    fontSize: 10,
    color: '#C69A45',
    fontWeight: '700',
  },
  sortToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#2D2214',
    borderColor: '#C69A45',
    borderWidth: 1,
  },
  sortToggleText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '800',
  },
  filterBar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#161519',
    borderBottomWidth: 1,
    borderBottomColor: '#26242B',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#201E25',
    borderColor: '#3D3A44',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: '#E8E6E1',
    fontSize: 12,
    paddingVertical: 8,
  },
  clearSearchBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  clearSearchText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },

  // 3-Mode Segmented Control
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E1D23',
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: '#2D2B33',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
  },
  segmentBtnText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },
  segmentBtnTextActive: {
    color: '#FDE68A',
    fontWeight: '900',
  },

  // Routine Selector Pills
  routinePillsWrapper: {
    backgroundColor: '#161519',
    borderBottomWidth: 1,
    borderBottomColor: '#2B2930',
    paddingVertical: 8,
  },
  routinePillsScroll: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center',
  },
  routinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#201F26',
    borderColor: '#373440',
    borderWidth: 1,
  },
  routinePillActive: {
    backgroundColor: '#2D2214',
    borderColor: '#C69A45',
    borderWidth: 1.5,
  },
  routinePillIcon: {
    fontSize: 12,
  },
  routinePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  routinePillTextActive: {
    color: '#FDE68A',
    fontWeight: '900',
  },
  routineCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: '#2B2934',
  },
  routineCountBadgeActive: {
    backgroundColor: '#5E1924',
  },
  routineCountBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
  },
  routineCountBadgeTextActive: {
    color: '#FDE68A',
  },
  denseHintText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
  },
  pinnedBanner: {
    marginTop: 6,
    marginHorizontal: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(198, 154, 69, 0.16)',
    borderColor: '#C69A45',
    borderWidth: 1,
    alignItems: 'center',
  },
  pinnedBannerText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '700',
  },

  // Matrix Layout
  matrixVerticalScroll: {
    flex: 1,
  },
  matrixVerticalContent: {
    paddingBottom: 40,
  },
  tableFlexRow: {
    flexDirection: 'row',
  },
  frozenColumnContainer: {
    width: 144,
    backgroundColor: '#19181D',
    borderRightWidth: 2,
    borderRightColor: '#C69A45',
    zIndex: 10,
  },
  frozenHeaderCell: {
    height: 78,
    padding: 10,
    justifyContent: 'center',
    backgroundColor: '#222027',
    borderBottomWidth: 1,
    borderBottomColor: '#36343C',
  },
  frozenHeaderTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#C69A45',
    letterSpacing: 0.5,
  },
  frozenHeaderSubtitle: {
    fontSize: 9,
    color: '#9CA3AF',
    marginTop: 2,
  },
  frozenRowCell: {
    height: 78,
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: '#19181D',
    borderBottomWidth: 1,
    borderBottomColor: '#2B2930',
  },
  frozenRowCellPinned: {
    backgroundColor: '#282015',
    borderColor: '#C69A45',
    borderWidth: 1.5,
  },
  exerciseNameText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#E8E6E1',
    lineHeight: 15,
  },
  frozenMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
  },
  exerciseMetaCount: {
    fontSize: 9.5,
    color: '#9CA3AF',
  },
  pinnedTag: {
    fontSize: 8.5,
    color: '#FDE68A',
    fontWeight: '800',
  },
  columnsHorizontalScroll: {
    flex: 1,
    backgroundColor: '#141316',
  },
  columnsHeaderRow: {
    flexDirection: 'row',
    height: 78,
    borderBottomWidth: 1,
    borderBottomColor: '#36343C',
    backgroundColor: '#1C1B20',
  },
  columnHeaderCell: {
    width: 148,
    padding: 8,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#2B2930',
  },
  colDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  colDateText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#DFB660',
  },
  colDayText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  colWorkoutTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#E8E6E1',
    marginBottom: 4,
  },
  colSourceTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  colSourceTagOnline: {
    backgroundColor: '#14312B',
  },
  colSourceTagOffline: {
    backgroundColor: '#301826',
  },
  colSourceTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#D1D5DB',
  },
  matrixDataRow: {
    flexDirection: 'row',
    height: 78,
    borderBottomWidth: 1,
    borderBottomColor: '#252329',
  },
  matrixCell: {
    width: 148,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#252329',
    backgroundColor: '#141316',
  },
  matrixCellPopulated: {
    backgroundColor: '#1B1A20',
  },
  cellContentWrap: {
    width: '100%',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#232128',
    borderColor: '#3D3A44',
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  cellTopSetText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#FDE68A',
    textAlign: 'center',
  },
  cellSetSummaryText: {
    fontSize: 9.5,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  cellEmptyDash: {
    color: '#4B4952',
    fontSize: 14,
    fontWeight: '800',
  },

  // Progression Delta Pill
  deltaPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    alignSelf: 'center',
  },
  deltaPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Mode 2: Progression Cards
  exerciseSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#26242B',
  },
  exerciseSortLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },
  exerciseSortBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E1D23',
    borderWidth: 1,
    borderColor: '#2E2C36',
  },
  exerciseSortBtnActive: {
    backgroundColor: '#2D2214',
    borderColor: '#C69A45',
  },
  exerciseSortBtnText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
  },
  exerciseSortBtnTextActive: {
    color: '#FDE68A',
    fontWeight: '800',
  },
  cardVerticalScroll: {
    flex: 1,
  },
  cardVerticalContent: {
    padding: 14,
    paddingBottom: 40,
    gap: 12,
  },
  progressionCard: {
    backgroundColor: '#1C1B21',
    borderRadius: 10,
    borderColor: '#33313B',
    borderWidth: 1,
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardExerciseName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#E8E6E1',
    lineHeight: 18,
  },
  cardSessionCountSub: {
    fontSize: 10.5,
    color: '#9CA3AF',
    marginTop: 2,
  },
  prBadgePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(198, 154, 69, 0.15)',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  prBadgeText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '800',
  },
  sparklineBox: {
    backgroundColor: '#16151A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2B2933',
    padding: 2,
  },
  recentStripSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#282630',
  },
  recentStripLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  recentStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stripNode: {
    backgroundColor: '#232128',
    borderColor: '#373440',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
  },
  stripNodePr: {
    borderColor: '#C69A45',
    backgroundColor: '#272218',
  },
  stripNodeDate: {
    fontSize: 9,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  stripNodeSet: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E8E6E1',
    marginTop: 1,
  },
  stripArrow: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '900',
  },
  cardAccordionToggle: {
    marginTop: 10,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: '#222027',
    borderRadius: 6,
  },
  cardAccordionToggleText: {
    color: '#DFB660',
    fontSize: 10.5,
    fontWeight: '700',
  },
  expandedHistoryContainer: {
    marginTop: 10,
    gap: 8,
  },
  historySessionItem: {
    backgroundColor: '#16151A',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#2B2933',
  },
  historySessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  historySessionDate: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#DFB660',
  },
  historySessionTitle: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  historySessionTonnage: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  historySetPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  historySetPill: {
    backgroundColor: '#24222B',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  historySetPillText: {
    fontSize: 9.5,
    color: '#D1D5DB',
  },

  // Mode 3: Session Cards
  sessionCard: {
    backgroundColor: '#1C1B21',
    borderRadius: 10,
    borderColor: '#33313B',
    borderWidth: 1,
    padding: 14,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#282630',
    paddingBottom: 10,
  },
  sessionDateText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DFB660',
  },
  sessionSourceTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  sessionTitleText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#E8E6E1',
    marginTop: 2,
  },
  sessionDurationText: {
    fontSize: 10.5,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  sessionTonnageText: {
    fontSize: 10.5,
    color: '#D1D5DB',
    fontWeight: '800',
    marginTop: 1,
  },
  sessionPrBadge: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 3,
  },
  sessionPrBadgeText: {
    color: '#FDE68A',
    fontSize: 9,
    fontWeight: '800',
  },
  sessionExercisesTable: {
    paddingVertical: 8,
    gap: 6,
  },
  sessionExerciseRow: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#232128',
  },
  sessionExerciseMainLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionExNameText: {
    fontSize: 11.5,
    color: '#E8E6E1',
    fontWeight: '700',
    flex: 1,
    paddingRight: 6,
  },
  sessionExRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionExBestLabel: {
    fontSize: 10.5,
    color: '#D1D5DB',
    fontWeight: '800',
  },
  sessionInlineSetsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    paddingLeft: 8,
  },
  inlineSetPill: {
    backgroundColor: '#26242E',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  inlineSetPillText: {
    fontSize: 9,
    color: '#9CA3AF',
  },
  sessionCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  sessionExpandBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#222027',
  },
  sessionExpandBtnText: {
    color: '#9CA3AF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  loadWorkoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
  },
  loadWorkoutBtnText: {
    color: '#FDE68A',
    fontSize: 10.5,
    fontWeight: '800',
  },

  // Empty State
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#E8E6E1',
    marginBottom: 6,
  },
  emptyStateSub: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },

  // Modal Set Breakdown Details
  detailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#1C1B20',
    borderRadius: 12,
    borderColor: '#C69A45',
    borderWidth: 1,
    padding: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2F2D34',
    paddingBottom: 10,
  },
  detailExerciseTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#E8E6E1',
    marginBottom: 4,
  },
  detailMetaSub: {
    fontSize: 11,
    color: '#DFB660',
    lineHeight: 16,
  },
  detailE1rmSub: {
    fontSize: 10.5,
    color: '#9CA3AF',
    marginTop: 4,
  },
  detailCloseBtn: {
    padding: 6,
  },
  detailCloseBtnText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '800',
  },
  detailSetTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#36343C',
    marginBottom: 4,
  },
  detailColHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  detailSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#28262E',
  },
  detailSetCell: {
    fontSize: 12,
    color: '#E8E6E1',
  },
  detailSetTypeBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  detailDismissBtn: {
    marginTop: 16,
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  detailDismissBtnText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '800',
  },
});
