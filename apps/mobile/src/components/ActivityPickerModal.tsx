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
  Alert,
} from 'react-native';
import {
  WorkoutCategory,
  StatType,
  getExerciseSubcategory,
} from '@gymify/game-engine';
import { ExerciseCatalogItem, useGame } from '../state/GameContext';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export interface ActivityPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectExercise: (exercise: ExerciseCatalogItem) => void;
  currentExerciseId?: string | null;
  targetWorkoutCategory?: WorkoutCategory | 'ALL';
  title?: string;
}

const RESISTANCE_SUBCATS = ['ALL', 'RECENT', 'Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core'];
const CARDIO_SUBCATS = ['ALL', 'RECENT', 'Running', 'Cycling', 'HIIT & Conditioning', 'Low Impact'];
const SPORT_SUBCATS = ['ALL', 'RECENT', 'Racquet Sports', 'Combat Sports', 'Court & Field'];
const RECOVERY_SUBCATS = ['ALL', 'RECENT', 'Mobility', 'Stretching', 'Myofascial', 'Active Flush'];
const ALL_SUBCATS = ['ALL', 'RECENT', 'GYM', 'CARDIO', 'SPORT', 'RECOVERY'];

export const ActivityPickerModal: React.FC<ActivityPickerModalProps> = ({
  visible,
  onClose,
  onSelectExercise,
  currentExerciseId,
  targetWorkoutCategory = 'ALL',
  title,
}) => {
  const {
    exercises,
    recentActivityIds,
    recordRecentActivity,
    addCustomExercise,
    deleteCustomExercise,
  } = useGame();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSubcat, setActiveSubcat] = useState<string>('ALL');
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);

  // Custom activity form state
  const [customName, setCustomName] = useState<string>('');
  const [customCategory, setCustomCategory] = useState<WorkoutCategory>(
    targetWorkoutCategory !== 'ALL' ? targetWorkoutCategory : 'GYM'
  );
  const [customMuscle, setCustomMuscle] = useState<string>('CHEST');
  const [customEquipment, setCustomEquipment] = useState<string>('DUMBBELL');
  const [customIsCompound, setCustomIsCompound] = useState<boolean>(true);

  // Reset search when modal opens or closes
  const handleClose = () => {
    setSearchQuery('');
    setActiveSubcat('ALL');
    setShowCustomModal(false);
    onClose();
  };

  // Determine available subcategories based on target category
  const subcategoryTabs = useMemo(() => {
    if (targetWorkoutCategory === 'GYM') return RESISTANCE_SUBCATS;
    if (targetWorkoutCategory === 'CARDIO') return CARDIO_SUBCATS;
    if (targetWorkoutCategory === 'SPORT') return SPORT_SUBCATS;
    if (targetWorkoutCategory === 'RECOVERY') return RECOVERY_SUBCATS;
    return ALL_SUBCATS;
  }, [targetWorkoutCategory]);

  // Modality-filtered pool of exercises
  const categoryPool = useMemo(() => {
    if (targetWorkoutCategory === 'ALL') return exercises;
    return exercises.filter((e) => {
      if (e.workoutCategory) return e.workoutCategory === targetWorkoutCategory;
      if (targetWorkoutCategory === 'GYM') return e.category === 'RESISTANCE';
      if (targetWorkoutCategory === 'RECOVERY') return e.category === 'RECOVERY_MOBILITY';
      return e.category === 'CARDIO';
    });
  }, [exercises, targetWorkoutCategory]);

  // Recent exercises matching this category pool
  const recentExercises = useMemo(() => {
    const poolMap = new Map<string, ExerciseCatalogItem>();
    for (const e of categoryPool) {
      poolMap.set(e.id, e);
    }
    const result: ExerciseCatalogItem[] = [];
    for (const id of recentActivityIds) {
      const match = poolMap.get(id);
      if (match && !result.some((r) => r.id === match.id)) {
        result.push(match);
      }
    }
    return result;
  }, [categoryPool, recentActivityIds]);

  // Filtered exercises based on search & subcategory tab
  const filteredExercises = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = categoryPool;

    // Subcategory tab filter
    if (activeSubcat === 'RECENT') {
      list = recentExercises;
    } else if (activeSubcat !== 'ALL') {
      if (targetWorkoutCategory === 'ALL') {
        list = list.filter((e) => {
          if (e.workoutCategory) return e.workoutCategory === activeSubcat;
          if (activeSubcat === 'GYM') return e.category === 'RESISTANCE';
          if (activeSubcat === 'RECOVERY') return e.category === 'RECOVERY_MOBILITY';
          return e.category === 'CARDIO';
        });
      } else {
        list = list.filter((e) => {
          const sub = getExerciseSubcategory({
            workoutCategory: e.workoutCategory,
            muscleGroup: e.muscleGroup,
            equipmentType: e.equipmentType,
            activityType: e.activityType,
            name: e.name,
          });
          return sub.toLowerCase() === activeSubcat.toLowerCase();
        });
      }
    }

    // Text search query filter
    if (q) {
      list = list.filter((e) => {
        const nameMatch = e.name.toLowerCase().includes(q);
        const muscleMatch = e.muscleGroup ? e.muscleGroup.toLowerCase().includes(q) : false;
        const equipMatch = e.equipmentType ? e.equipmentType.toLowerCase().includes(q) : false;
        const catMatch = e.workoutCategory ? e.workoutCategory.toLowerCase().includes(q) : false;
        const subcat = getExerciseSubcategory({
          workoutCategory: e.workoutCategory,
          muscleGroup: e.muscleGroup,
          equipmentType: e.equipmentType,
          activityType: e.activityType,
          name: e.name,
        }).toLowerCase();
        return nameMatch || muscleMatch || equipMatch || catMatch || subcat.includes(q);
      });
    }

    return list;
  }, [categoryPool, recentExercises, activeSubcat, searchQuery, targetWorkoutCategory]);

  const handleSelect = (item: ExerciseCatalogItem) => {
    recordRecentActivity(item.id);
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    onSelectExercise(item);
    handleClose();
  };

  const handleOpenCustomModal = () => {
    setCustomName(searchQuery.trim());
    setCustomCategory(targetWorkoutCategory !== 'ALL' ? targetWorkoutCategory : 'GYM');
    setShowCustomModal(true);
  };

  const handleSaveCustomActivity = () => {
    const trimmed = customName.trim();
    if (!trimmed) {
      Alert.alert('Name Required', 'Please enter an activity or exercise name.');
      return;
    }

    let primaryStat: StatType = 'STRENGTH';
    if (customCategory === 'CARDIO') primaryStat = 'ENDURANCE';
    else if (customCategory === 'SPORT') primaryStat = 'AGILITY';
    else if (customCategory === 'RECOVERY') primaryStat = 'ENDURANCE';

    const created = addCustomExercise({
      name: trimmed,
      workoutCategory: customCategory,
      primaryStat,
      muscleGroup: customMuscle,
      equipmentType: customEquipment,
      isCompound: customIsCompound,
      description: `User-defined custom ${customCategory} exercise: ${trimmed}.`,
    });

    const asCatalogItem: ExerciseCatalogItem = {
      id: created.slug,
      name: created.name,
      category: created.category,
      workoutCategory: created.workoutCategory,
      primaryStat: created.primaryStat,
      baseXpFactor: created.baseXpFactor,
      muscleGroup: created.muscleGroup,
      equipmentType: created.equipmentType,
      isCompound: created.isCompound,
      isCustom: true,
      description: created.description,
    };

    setShowCustomModal(false);
    handleSelect(asCatalogItem);
  };

  const handleDeleteCustom = (exerciseId: string, name: string) => {
    Alert.alert(
      'Delete Custom Activity',
      `Are you sure you want to remove "${name}" from your custom activities?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCustomExercise(exerciseId);
            triggerSensoryCue('SET_MICRO_REWARD_TICK');
          },
        },
      ]
    );
  };

  const resolvedTitle =
    title ||
    (targetWorkoutCategory === 'GYM'
      ? 'Select Resistance Exercise'
      : targetWorkoutCategory === 'CARDIO'
      ? 'Select Cardio Activity'
      : targetWorkoutCategory === 'SPORT'
      ? 'Select Sport Modality'
      : targetWorkoutCategory === 'RECOVERY'
      ? 'Select Recovery & Mobility'
      : 'Catalog & Custom Activities');

  // Show "⭐ Recently Used" section when browsing ALL without a search query
  const showRecentSection =
    activeSubcat === 'ALL' && !searchQuery.trim() && recentExercises.length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.pickerCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.titleText}>{resolvedTitle}</Text>
              <Text style={styles.subtitleText}>
                {categoryPool.length} activities • {recentExercises.length} recent
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search Bar & Custom Activity Button */}
          <View style={styles.searchBarRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercise, muscle, equipment..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.searchClearBtn}
                onPress={() => setSearchQuery('')}
                activeOpacity={0.7}
              >
                <Text style={styles.searchClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Subcategory Pills Row */}
          <View style={styles.subcatsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subcatsRow}>
              {subcategoryTabs.map((subcat) => {
                const isActive = activeSubcat === subcat;
                const isRecent = subcat === 'RECENT';
                const label = isRecent ? `⭐ Recent (${recentExercises.length})` : subcat;
                return (
                  <TouchableOpacity
                    key={subcat}
                    style={[
                      styles.subcatPill,
                      isActive && styles.subcatPillActive,
                      isRecent && styles.subcatPillRecent,
                      isRecent && isActive && styles.subcatPillRecentActive,
                    ]}
                    onPress={() => setActiveSubcat(subcat)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.subcatPillText,
                        isActive && styles.subcatPillTextActive,
                        isRecent && styles.subcatPillTextRecent,
                        isRecent && isActive && styles.subcatPillTextRecentActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* List Content */}
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            {/* ⭐ Recently Used Section */}
            {showRecentSection && (
              <View style={styles.recentSectionBox}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderTitle}>⭐ RECENTLY USED</Text>
                  <Text style={styles.sectionHeaderMeta}>Quick 1-Tap</Text>
                </View>
                <View style={styles.recentGrid}>
                  {recentExercises.slice(0, 6).map((item) => {
                    const isSelected = item.id === currentExerciseId;
                    return (
                      <TouchableOpacity
                        key={`recent_${item.id}`}
                        style={[styles.recentPill, isSelected && styles.recentPillSelected]}
                        onPress={() => handleSelect(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.recentPillText, isSelected && styles.recentPillTextSelected]}>
                          {item.name}
                        </Text>
                        <Text style={styles.recentPillBadge}>
                          {item.equipmentType || item.workoutCategory || 'EX'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.sectionDivider} />
              </View>
            )}

            {/* Main Activities Section */}
            {filteredExercises.length === 0 ? (
              <View style={styles.emptyResultsBox}>
                <Text style={styles.emptyResultsTitle}>No exercises found</Text>
                <Text style={styles.emptyResultsSub}>
                  No activities matching "{searchQuery}" in {activeSubcat}.
                </Text>
                <TouchableOpacity
                  style={styles.createCustomPromptBtn}
                  onPress={handleOpenCustomModal}
                  activeOpacity={0.7}
                >
                  <Text style={styles.createCustomPromptText}>
                    ＋ Add "{searchQuery.trim() || 'Custom'}" as Custom Activity
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredExercises.map((item) => {
                const isSelected = item.id === currentExerciseId;
                const subcatName = getExerciseSubcategory({
                  workoutCategory: item.workoutCategory,
                  muscleGroup: item.muscleGroup,
                  equipmentType: item.equipmentType,
                  activityType: item.activityType,
                  name: item.name,
                });

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.exerciseRow, isSelected && styles.exerciseRowSelected]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={styles.exerciseNameRow}>
                        <Text
                          style={[styles.exerciseNameText, isSelected && styles.exerciseNameTextSelected]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        {item.isCustom && (
                          <View style={styles.customBadge}>
                            <Text style={styles.customBadgeText}>Custom</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.metaBadgesRow}>
                        {item.equipmentType ? (
                          <View style={styles.metaBadge}>
                            <Text style={styles.metaBadgeText}>{item.equipmentType}</Text>
                          </View>
                        ) : null}
                        <View style={styles.metaBadgeSub}>
                          <Text style={styles.metaBadgeSubText}>{subcatName}</Text>
                        </View>
                        <View style={styles.metaBadgeType}>
                          <Text style={styles.metaBadgeTypeText}>
                            {item.isCompound ? 'Compound' : 'Isolation'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.rowRightActions}>
                      {item.isCustom && (
                        <TouchableOpacity
                          style={styles.deleteCustomBtn}
                          onPress={() => handleDeleteCustom(item.id, item.name)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.deleteCustomText}>✕</Text>
                        </TouchableOpacity>
                      )}
                      {isSelected ? (
                        <View style={styles.checkPill}>
                          <Text style={styles.checkPillText}>✓ Selected</Text>
                        </View>
                      ) : (
                        <Text style={styles.selectArrowText}>＋</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Bottom Action Footer */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.addCustomBtn}
              onPress={handleOpenCustomModal}
              activeOpacity={0.7}
            >
              <Text style={styles.addCustomBtnText}>＋ Add Custom Activity</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Custom Activity Creation Dialog */}
        {showCustomModal && (
          <Modal
            visible={showCustomModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCustomModal(false)}
          >
            <Pressable style={styles.customModalOverlay} onPress={() => setShowCustomModal(false)}>
              <Pressable style={styles.customDialogCard} onPress={(e) => e.stopPropagation()}>
                <View style={styles.customDialogHeader}>
                  <Text style={styles.customDialogTitle}>Create Custom Activity</Text>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setShowCustomModal(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Name Input */}
                <Text style={styles.formFieldLabel}>Activity Name</Text>
                <TextInput
                  style={styles.customDialogInput}
                  placeholder="e.g. Nordic Hamstring Curl, Padel Tennis..."
                  placeholderTextColor="#6B7280"
                  value={customName}
                  onChangeText={setCustomName}
                  autoFocus
                />

                {/* Modality Category */}
                <Text style={styles.formFieldLabel}>Training Modality</Text>
                <View style={styles.customCategoryRow}>
                  {(['GYM', 'CARDIO', 'SPORT', 'RECOVERY'] as WorkoutCategory[]).map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.customCatBtn,
                        customCategory === cat && styles.customCatBtnActive,
                      ]}
                      onPress={() => setCustomCategory(cat)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.customCatBtnText,
                          customCategory === cat && styles.customCatBtnTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Target Muscle / Movement */}
                <Text style={styles.formFieldLabel}>Primary Target / Focus</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {['CHEST', 'BACK', 'SHOULDERS', 'LEGS', 'ARMS', 'CORE', 'FULL_BODY', 'AEROBIC', 'ANAEROBIC'].map(
                      (m) => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.customOptionPill, customMuscle === m && styles.customOptionPillActive]}
                          onPress={() => setCustomMuscle(m)}
                        >
                          <Text
                            style={[
                              styles.customOptionText,
                              customMuscle === m && styles.customOptionTextActive,
                            ]}
                          >
                            {m}
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                </ScrollView>

                {/* Equipment Type */}
                <Text style={styles.formFieldLabel}>Equipment Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {['DUMBBELL', 'BARBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT', 'RACQUET', 'MAT', 'CUSTOM'].map(
                      (eq) => (
                        <TouchableOpacity
                          key={eq}
                          style={[styles.customOptionPill, customEquipment === eq && styles.customOptionPillActive]}
                          onPress={() => setCustomEquipment(eq)}
                        >
                          <Text
                            style={[
                              styles.customOptionText,
                              customEquipment === eq && styles.customOptionTextActive,
                            ]}
                          >
                            {eq}
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                </ScrollView>

                {/* Compound vs Isolation Toggle */}
                <View style={styles.compoundToggleRow}>
                  <Text style={styles.compoundToggleLabel}>Compound Movement (Multi-Joint):</Text>
                  <TouchableOpacity
                    style={[styles.compoundBtn, customIsCompound && styles.compoundBtnActive]}
                    onPress={() => setCustomIsCompound(!customIsCompound)}
                  >
                    <Text style={[styles.compoundBtnText, customIsCompound && styles.compoundBtnTextActive]}>
                      {customIsCompound ? 'YES (1.15x XP)' : 'NO (1.02x XP)'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Dialog Actions */}
                <View style={styles.customDialogActions}>
                  <TouchableOpacity
                    style={styles.customCancelBtn}
                    onPress={() => setShowCustomModal(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.customCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.customSaveBtn}
                    onPress={handleSaveCustomActivity}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.customSaveText}>Save & Select</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 4, 8, 0.85)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    backgroundColor: '#16151A',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: '#2F2D36',
    maxHeight: '92%',
    height: '90%',
    display: 'flex',
    flexDirection: 'column',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#24222A',
  },
  titleText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#E8E6E1',
    letterSpacing: 0.3,
  },
  subtitleText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#24222B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '800',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1D24',
    borderWidth: 1,
    borderColor: '#34323D',
    borderRadius: 8,
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    color: '#E8E6E1',
    fontSize: 13,
    paddingVertical: 8,
  },
  searchClearBtn: {
    padding: 6,
  },
  searchClearText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
  },
  subcatsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#24222A',
    paddingBottom: 8,
  },
  subcatsRow: {
    paddingHorizontal: 14,
    gap: 6,
  },
  subcatPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#201F26',
    borderWidth: 1,
    borderColor: '#34323D',
  },
  subcatPillActive: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
  },
  subcatPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  subcatPillTextActive: {
    color: '#FEE2E2',
    fontWeight: '900',
  },
  subcatPillRecent: {
    backgroundColor: '#2A2215',
    borderColor: '#6B4E1B',
  },
  subcatPillRecentActive: {
    backgroundColor: '#4A3414',
    borderColor: '#C69A45',
  },
  subcatPillTextRecent: {
    color: '#FDE68A',
  },
  subcatPillTextRecentActive: {
    color: '#FEF3C7',
    fontWeight: '900',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recentSectionBox: {
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FDE68A',
    letterSpacing: 0.5,
  },
  sectionHeaderMeta: {
    fontSize: 10,
    color: '#7A787D',
    fontWeight: '700',
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  recentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#232018',
    borderColor: '#543E19',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  recentPillSelected: {
    backgroundColor: '#4A3414',
    borderColor: '#C69A45',
  },
  recentPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E8E6E1',
  },
  recentPillTextSelected: {
    color: '#FDE68A',
    fontWeight: '800',
  },
  recentPillBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#C69A45',
    textTransform: 'uppercase',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#26242D',
    marginTop: 10,
  },
  emptyResultsBox: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyResultsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E8E6E1',
    marginBottom: 4,
  },
  emptyResultsSub: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 14,
  },
  createCustomPromptBtn: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  createCustomPromptText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1B22',
    borderColor: '#2F2D38',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  exerciseRowSelected: {
    backgroundColor: '#2D1B22',
    borderColor: '#C69A45',
  },
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  exerciseNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E8E6E1',
  },
  exerciseNameTextSelected: {
    color: '#FEE2E2',
  },
  customBadge: {
    backgroundColor: '#35250E',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  customBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FDE68A',
  },
  metaBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaBadge: {
    backgroundColor: '#25242D',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  metaBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  metaBadgeSub: {
    backgroundColor: '#20261E',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  metaBadgeSubText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#86EFAC',
  },
  metaBadgeType: {
    backgroundColor: '#22202B',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  metaBadgeTypeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#C4B5FD',
  },
  rowRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteCustomBtn: {
    padding: 6,
  },
  deleteCustomText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
  checkPill: {
    backgroundColor: '#15803D',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  checkPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  selectArrowText: {
    color: '#C69A45',
    fontSize: 16,
    fontWeight: '900',
    paddingHorizontal: 4,
  },
  footerRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#24222A',
    backgroundColor: '#16151A',
  },
  addCustomBtn: {
    backgroundColor: '#28241D',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addCustomBtnText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
  },
  // Custom Activity Sub-Dialog Styles
  customModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 4, 8, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  customDialogCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#1B1A22',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  customDialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  customDialogTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#E8E6E1',
  },
  formFieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C69A45',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  customDialogInput: {
    backgroundColor: '#141318',
    borderColor: '#383542',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#E8E6E1',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  customCategoryRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  customCatBtn: {
    flex: 1,
    backgroundColor: '#23222B',
    borderColor: '#393645',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  customCatBtnActive: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
  },
  customCatBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
  },
  customCatBtnTextActive: {
    color: '#FEE2E2',
  },
  customOptionPill: {
    backgroundColor: '#23222B',
    borderColor: '#393645',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  customOptionPillActive: {
    backgroundColor: '#35250E',
    borderColor: '#C69A45',
  },
  customOptionText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  customOptionTextActive: {
    color: '#FDE68A',
    fontWeight: '800',
  },
  compoundToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  compoundToggleLabel: {
    fontSize: 11,
    color: '#D1D5DB',
    fontWeight: '700',
  },
  compoundBtn: {
    backgroundColor: '#25232D',
    borderColor: '#423E50',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  compoundBtnActive: {
    backgroundColor: '#1E2B1E',
    borderColor: '#22C55E',
  },
  compoundBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
  },
  compoundBtnTextActive: {
    color: '#86EFAC',
  },
  customDialogActions: {
    flexDirection: 'row',
    gap: 8,
  },
  customCancelBtn: {
    flex: 1,
    backgroundColor: '#26242D',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  customCancelText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  customSaveBtn: {
    flex: 1.4,
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  customSaveText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
  },
});
