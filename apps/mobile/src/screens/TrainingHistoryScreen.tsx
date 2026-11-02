import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CompletedSetEntry,
  buildTrainingHistoryMatrix,
  formatSetsSuccinctSummary,
  formatSetsMultiLine,
} from '@gymify/game-engine';
import { useGame } from '../state/GameContext';
import { CRIMSON_ONI } from '../theme';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export interface TrainingHistoryScreenProps {
  onBack: () => void;
  visible?: boolean;
}

interface SelectedCellDetail {
  exerciseName: string;
  workoutTitle: string;
  workoutDate: string;
  source: 'ONLINE' | 'OFFLINE';
  sets: CompletedSetEntry[];
}

export const TrainingHistoryScreen: React.FC<TrainingHistoryScreenProps> = ({
  onBack,
  visible = true,
}) => {
  const { workoutHistory } = useGame();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'LATEST_FIRST' | 'OLDEST_FIRST'>('LATEST_FIRST');
  const [selectedCell, setSelectedCell] = useState<SelectedCellDetail | null>(null);

  const matrix = useMemo(() => {
    return buildTrainingHistoryMatrix(workoutHistory, {
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
    sets: CompletedSetEntry[] | undefined
  ) => {
    if (!sets || sets.length === 0) return;
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    setSelectedCell({
      exerciseName,
      workoutTitle,
      workoutDate,
      source,
      sets,
    });
  };

  const content = (
    <View style={styles.root}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
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
          <Text style={styles.screenSubtitle}>Cross-Session Progression Matrix</Text>
        </View>

        <TouchableOpacity
          style={styles.sortToggleBtn}
          onPress={toggleSortOrder}
          activeOpacity={0.7}
        >
          <Text style={styles.sortToggleText}>
            {sortOrder === 'LATEST_FIRST' ? '📅 Newest' : '📅 Oldest'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search & Metadata Bar */}
      <View style={styles.filterBar}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises (e.g. Bench, Face Pulls, Squat)..."
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

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            <Text style={styles.metaHighlight}>{matrix.rows.length}</Text> exercises across{' '}
            <Text style={styles.metaHighlight}>{matrix.columns.length}</Text> recorded sessions
          </Text>
          <Text style={styles.metaHint}>Rows: Exercises • Columns: Workouts</Text>
        </View>
      </View>

      {/* Main Matrix Grid */}
      {matrix.columns.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateIcon}>🏋️</Text>
          <Text style={styles.emptyStateTitle}>No Workouts Recorded Yet</Text>
          <Text style={styles.emptyStateSub}>
            Complete an online or offline workout to view your exercise progression matrix.
          </Text>
        </View>
      ) : matrix.rows.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateIcon}>🔍</Text>
          <Text style={styles.emptyStateTitle}>No Exercises Found</Text>
          <Text style={styles.emptyStateSub}>
            No recorded exercises matched "{searchQuery}".
          </Text>
          <TouchableOpacity
            style={styles.resetSearchBtn}
            onPress={() => setSearchQuery('')}
          >
            <Text style={styles.resetSearchText}>Clear Search</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.matrixVerticalScroll}
          contentContainerStyle={styles.matrixVerticalContent}
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.tableFlexRow}>
            {/* Frozen Left Column: Exercise Names (Row Headers) */}
            <View style={styles.frozenColumnContainer}>
              <View style={styles.frozenHeaderCell}>
                <Text style={styles.frozenHeaderTitle}>EXERCISE</Text>
                <Text style={styles.frozenHeaderSubtitle}>Row Headers</Text>
              </View>

              {matrix.rows.map((row) => (
                <View key={row.exerciseId} style={styles.frozenRowCell}>
                  <Text style={styles.exerciseNameText} numberOfLines={2}>
                    {row.exerciseName}
                  </Text>
                  <Text style={styles.exerciseMetaCount}>
                    {row.totalTimesPerformed} session{row.totalTimesPerformed === 1 ? '' : 's'}
                  </Text>
                </View>
              ))}
            </View>

            {/* Horizontally Scrollable Workout Columns */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              nestedScrollEnabled={true}
              style={styles.columnsHorizontalScroll}
            >
              <View>
                {/* Column Headers: Workouts / Days */}
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
                          {col.source === 'ONLINE' ? '🌐 Live' : '💾 Offline'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Data Matrix Rows */}
                {matrix.rows.map((row) => (
                  <View key={row.exerciseId} style={styles.matrixDataRow}>
                    {matrix.columns.map((col) => {
                      const sets = row.cellsByWorkoutId[col.workoutId];
                      const hasSets = sets && sets.length > 0;
                      const summary = formatSetsSuccinctSummary(sets);
                      const lines = formatSetsMultiLine(sets);

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
                              sets
                            )
                          }
                          activeOpacity={hasSets ? 0.7 : 1}
                        >
                          {hasSets ? (
                            <View style={styles.cellContentWrap}>
                              <Text style={styles.cellSummaryBold} numberOfLines={1}>
                                {summary}
                              </Text>
                              {lines.length > 1 && lines[1] ? (
                                <Text style={styles.cellSubLine} numberOfLines={1}>
                                  {lines[1]}
                                </Text>
                              ) : null}
                              <Text style={styles.cellTapHint}>tap for breakdown</Text>
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

      {/* Pop-up Set Breakdown Details Modal */}
      {selectedCell && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedCell(null)}
        >
          <Pressable
            style={styles.detailBackdrop}
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
    paddingVertical: 10,
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
    marginBottom: 6,
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  metaHighlight: {
    color: '#E8E6E1',
    fontWeight: '800',
  },
  metaHint: {
    fontSize: 10,
    color: '#C69A45',
    fontStyle: 'italic',
  },
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
  resetSearchBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2C2A31',
    borderRadius: 6,
  },
  resetSearchText: {
    color: '#DFB660',
    fontSize: 12,
    fontWeight: '700',
  },
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
    width: 140,
    backgroundColor: '#19181D',
    borderRightWidth: 2,
    borderRightColor: '#C69A45',
    zIndex: 10,
  },
  frozenHeaderCell: {
    height: 76,
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
    height: 72,
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: '#19181D',
    borderBottomWidth: 1,
    borderBottomColor: '#2B2930',
  },
  exerciseNameText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E8E6E1',
    lineHeight: 16,
  },
  exerciseMetaCount: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 3,
  },
  columnsHorizontalScroll: {
    flex: 1,
    backgroundColor: '#141316',
  },
  columnsHeaderRow: {
    flexDirection: 'row',
    height: 76,
    borderBottomWidth: 1,
    borderBottomColor: '#36343C',
    backgroundColor: '#1C1B20',
  },
  columnHeaderCell: {
    width: 140,
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
    fontSize: 11,
    fontWeight: '700',
    color: '#E8E6E1',
    marginBottom: 4,
  },
  colSourceTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
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
    fontSize: 9,
    fontWeight: '800',
    color: '#D1D5DB',
  },
  matrixDataRow: {
    flexDirection: 'row',
    height: 72,
    borderBottomWidth: 1,
    borderBottomColor: '#252329',
  },
  matrixCell: {
    width: 140,
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
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#232128',
    borderColor: '#3D3A44',
    borderWidth: 1,
    alignItems: 'center',
  },
  cellSummaryBold: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FDE68A',
    textAlign: 'center',
  },
  cellSubLine: {
    fontSize: 9,
    color: '#9CA3AF',
    marginTop: 1,
    textAlign: 'center',
  },
  cellTapHint: {
    fontSize: 7.5,
    color: '#6B7280',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  cellEmptyDash: {
    color: '#4B4952',
    fontSize: 14,
    fontWeight: '800',
  },
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
