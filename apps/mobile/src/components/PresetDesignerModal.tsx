import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import {
  WorkoutCategory,
  WORKOUT_CATEGORIES,
  SetType,
  SET_TYPE_DESCRIPTORS,
  cycleSetType,
  WorkoutPresetDefinition,
  WorkoutPresetExerciseBlock,
  WorkoutPresetSetTemplate,
  DEFAULT_EXERCISE_CATALOG,
  SeedExerciseDefinition,
} from '@gymify/game-engine';
import { triggerSensoryCue } from '../utils/sensoryFeedback';
import { ActivityPickerModal } from './ActivityPickerModal';
import { ExerciseCatalogItem } from '../state/GameContext';

const SET_TYPE_COLORS: Record<SetType, string> = {
  NORMAL: '#9CA3AF',
  WARMUP: '#38BDF8',
  DROP_SET: '#EF4444',
  FAILURE: '#F59E0B',
  AMRAP: '#F59E0B',
};

const CATEGORY_COLORS: Record<WorkoutCategory, string> = {
  GYM: '#E63946',
  CARDIO: '#38BDF8',
  SPORT: '#F59E0B',
  RECOVERY: '#10B981',
};

export interface PresetDesignerModalProps {
  visible: boolean;
  editingPreset?: WorkoutPresetDefinition | null;
  onSavePreset: (preset: WorkoutPresetDefinition) => void;
  onDeletePreset?: (presetId: string) => void;
  onClose: () => void;
}

export const PresetDesignerModal: React.FC<PresetDesignerModalProps> = ({
  visible,
  editingPreset,
  onSavePreset,
  onDeletePreset,
  onClose,
}) => {
  const [name, setName] = useState<string>(editingPreset?.name || '');
  const [category, setCategory] = useState<WorkoutCategory>(editingPreset?.category || 'GYM');
  const [notes, setNotes] = useState<string>(editingPreset?.notes || '');
  const [blocks, setBlocks] = useState<WorkoutPresetExerciseBlock[]>(
    editingPreset?.blocks?.exerciseBlocks || [
      {
        blockId: `blk_${Date.now()}_1`,
        exerciseSlug: 'pepin_db_incline_press',
        exerciseName: 'Pepin Adjustable DB Incline Press',
        sets: [
          { targetWeightKg: 28, targetReps: 10, setType: 'WARMUP', targetRpe: 7 },
          { targetWeightKg: 34, targetReps: 8, setType: 'NORMAL', targetRpe: 8.5 },
          { targetWeightKg: 34, targetReps: 8, setType: 'NORMAL', targetRpe: 9 },
        ],
      },
    ]
  );
  const [showExercisePicker, setShowExercisePicker] = useState<boolean>(false);
  const [targetBlockIndex, setTargetBlockIndex] = useState<number | null>(null);

  // Sync when editingPreset changes
  useEffect(() => {
    if (editingPreset) {
      setName(editingPreset.name);
      setCategory(editingPreset.category);
      setNotes(editingPreset.notes || '');
      setBlocks(editingPreset.blocks?.exerciseBlocks || []);
    } else {
      setName('');
      setCategory('GYM');
      setNotes('');
      setBlocks([]);
    }
  }, [editingPreset, visible]);

  const handleAddExercise = (exercise: ExerciseCatalogItem | SeedExerciseDefinition) => {
    const slug = 'id' in exercise ? exercise.id : exercise.slug;
    if (targetBlockIndex !== null) {
      // Swapping exercise
      setBlocks((prev) =>
        prev.map((b, idx) =>
          idx === targetBlockIndex
            ? { ...b, exerciseSlug: slug, exerciseName: exercise.name }
            : b
        )
      );
      setTargetBlockIndex(null);
    } else {
      // Adding new block
      const newBlock: WorkoutPresetExerciseBlock = {
        blockId: `blk_${Date.now()}_${blocks.length + 1}`,
        exerciseSlug: slug,
        exerciseName: exercise.name,
        sets: [
          {
            targetWeightKg: exercise.category === 'RESISTANCE' ? 30 : 0,
            targetReps: exercise.category === 'RESISTANCE' ? 10 : 1,
            setType: 'NORMAL',
            targetRpe: 8,
          },
          {
            targetWeightKg: exercise.category === 'RESISTANCE' ? 30 : 0,
            targetReps: exercise.category === 'RESISTANCE' ? 10 : 1,
            setType: 'NORMAL',
            targetRpe: 8.5,
          },
          {
            targetWeightKg: exercise.category === 'RESISTANCE' ? 30 : 0,
            targetReps: exercise.category === 'RESISTANCE' ? 10 : 1,
            setType: 'NORMAL',
            targetRpe: 9,
          },
        ],
      };
      setBlocks((prev) => [...prev, newBlock]);
    }
    setShowExercisePicker(false);
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleRemoveBlock = (index: number) => {
    setBlocks((prev) => prev.filter((_, idx) => idx !== index));
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleAddSet = (blockIndex: number) => {
    setBlocks((prev) => {
      const targetBlock = prev[blockIndex];
      const targetSupersetGroup = targetBlock?.supersetGroupId;

      return prev.map((block, idx) => {
        const shouldAdd =
          idx === blockIndex ||
          (!!targetSupersetGroup && block.supersetGroupId === targetSupersetGroup);
        if (!shouldAdd) return block;

        const lastSet = block.sets[block.sets.length - 1];
        const newSet: WorkoutPresetSetTemplate = {
          targetWeightKg: lastSet ? lastSet.targetWeightKg : 20,
          targetReps: lastSet ? lastSet.targetReps : 8,
          setType: 'NORMAL',
          targetRpe: lastSet?.targetRpe ?? 8.5,
        };
        return {
          ...block,
          sets: [...block.sets, newSet],
        };
      });
    });
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleRemoveSet = (blockIndex: number, setIndex: number) => {
    setBlocks((prev) =>
      prev.map((block, idx) => {
        if (idx !== blockIndex) return block;
        return {
          ...block,
          sets: block.sets.filter((_, sIdx) => sIdx !== setIndex),
        };
      })
    );
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleCycleSetType = (blockIndex: number, setIndex: number) => {
    setBlocks((prev) =>
      prev.map((block, bIdx) => {
        if (bIdx !== blockIndex) return block;
        return {
          ...block,
          sets: block.sets.map((set, sIdx) => {
            if (sIdx !== setIndex) return set;
            const nextType = cycleSetType(set.setType);
            return {
              ...set,
              setType: nextType,
              targetRpe: nextType === 'FAILURE' || nextType === 'AMRAP' ? 10 : set.targetRpe,
            };
          }),
        };
      })
    );
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleToggleSuperset = (blockIndex: number) => {
    setBlocks((prev) => {
      const currentBlock = prev[blockIndex];
      const nextBlock = prev[blockIndex + 1];
      if (!currentBlock) return prev;

      if (currentBlock.supersetGroupId) {
        // Clear superset link
        const targetGroup = currentBlock.supersetGroupId;
        return prev.map((b) =>
          b.supersetGroupId === targetGroup ? { ...b, supersetGroupId: undefined } : b
        );
      }

      // Assign a superset group id e.g. "A", "B", "C"
      const existingGroups = new Set(prev.map((b) => b.supersetGroupId).filter(Boolean));
      const letters = ['A', 'B', 'C', 'D', 'E'];
      const nextLetter = letters.find((l) => !existingGroups.has(l)) || `G${existingGroups.size + 1}`;

      return prev.map((b, idx) => {
        if (idx === blockIndex || (nextBlock && idx === blockIndex + 1)) {
          return { ...b, supersetGroupId: nextLetter };
        }
        return b;
      });
    });
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a routine name.');
      return;
    }
    if (blocks.length === 0) {
      Alert.alert('Exercises Required', 'Please add at least one exercise to the routine.');
      return;
    }

    const id = editingPreset?.id || `preset_custom_${Date.now()}`;
    const slug =
      editingPreset?.slug ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/(^_|_$)/g, '');

    const newPreset: WorkoutPresetDefinition = {
      id,
      slug,
      name: name.trim(),
      category,
      notes: notes.trim(),
      isSystemSeed: false,
      blocks: {
        exerciseBlocks: blocks,
        cardioSegments: editingPreset?.blocks?.cardioSegments || [],
        sessionRpeTarget: editingPreset?.blocks?.sessionRpeTarget ?? null,
      },
    };

    onSavePreset(newPreset);
    triggerSensoryCue('WORKOUT_PRESET_LOADED');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                {editingPreset ? 'Edit Workout Preset' : 'Workout Preset Designer'}
              </Text>
              <Text style={styles.subtitle}>
                Define supersets, set types, and target loads for quick loading.
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Routine Name & Category */}
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Routine Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Upper Body Torso & Arms A"
                placeholderTextColor="#6B7280"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Discipline Category</Text>
              <View style={styles.categoryRow}>
                {WORKOUT_CATEGORIES.map((cat) => {
                  const color = CATEGORY_COLORS[cat.key];
                  const isSelected = category === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[
                        styles.catTab,
                        isSelected && { borderColor: color, backgroundColor: '#26242B' },
                      ]}
                      onPress={() => setCategory(cat.key)}
                    >
                      <Text style={styles.catIcon}>{cat.icon}</Text>
                      <Text
                        style={[
                          styles.catLabel,
                          isSelected && { color, fontWeight: '800' },
                        ]}
                      >
                        {cat.shortTitle}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Notes / Equipment Focus</Text>
              <TextInput
                style={[styles.textInput, { height: 44 }]}
                placeholder="e.g. Pepin DBs, Altas Functional Trainer, 90s dynamic rest"
                placeholderTextColor="#6B7280"
                value={notes}
                onChangeText={setNotes}
              />
            </View>

            {/* Exercise Blocks */}
            <View style={styles.blocksHeaderRow}>
              <Text style={styles.sectionTitle}>Exercise Blocks ({blocks.length})</Text>
              <TouchableOpacity
                style={styles.addExerciseBtn}
                onPress={() => {
                  setTargetBlockIndex(null);
                  setShowExercisePicker(true);
                }}
              >
                <Text style={styles.addExerciseBtnText}>+ Add Exercise</Text>
              </TouchableOpacity>
            </View>

            {blocks.map((block: WorkoutPresetExerciseBlock, bIdx: number) => {
              const isGrouped = !!block.supersetGroupId;
              const nextBlock = blocks[bIdx + 1];
              const prevBlock = blocks[bIdx - 1];
              const isLinkedWithNext =
                isGrouped &&
                !!nextBlock?.supersetGroupId &&
                nextBlock.supersetGroupId === block.supersetGroupId;
              const isLinkedWithPrev =
                isGrouped &&
                !!prevBlock?.supersetGroupId &&
                prevBlock.supersetGroupId === block.supersetGroupId;

              return (
                <React.Fragment key={`${block.exerciseSlug}_${bIdx}`}>
                  <View
                    style={[
                      styles.blockCard,
                      isGrouped && { borderLeftColor: '#C69A45', borderLeftWidth: 4 },
                      isLinkedWithNext && styles.blockCardLinkedNext,
                      isLinkedWithPrev && styles.blockCardLinkedPrev,
                    ]}
                  >
                    <View style={styles.blockTopRow}>
                      <View style={styles.blockTitleContainer}>
                        {isGrouped ? (
                          <View style={styles.supersetTag}>
                            <Text style={styles.supersetTagText}>
                              Superset {block.supersetGroupId}
                            </Text>
                          </View>
                        ) : null}
                        <Text style={styles.blockExerciseName}>
                          {block.exerciseName || block.exerciseSlug}
                        </Text>
                      </View>

                      <View style={styles.blockActions}>
                        <TouchableOpacity
                          style={[
                            styles.supersetToggleBtn,
                            isGrouped && styles.supersetToggleBtnActive,
                          ]}
                          onPress={() => handleToggleSuperset(bIdx)}
                        >
                          <Text
                            style={[
                              styles.supersetToggleText,
                              isGrouped && styles.supersetToggleTextActive,
                            ]}
                          >
                            {isGrouped ? 'Superset' : '🔗 Link'}
                          </Text>
                        </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.removeBlockBtn}
                        onPress={() => handleRemoveBlock(bIdx)}
                      >
                        <Text style={styles.removeBlockText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Target Sets Header */}
                  <View style={styles.setsHeaderRow}>
                    <Text style={[styles.setsHeaderCol, { width: 44 }]}>Type</Text>
                    <Text style={[styles.setsHeaderCol, { flex: 1 }]}>Weight (kg)</Text>
                    <Text style={[styles.setsHeaderCol, { flex: 1 }]}>Reps</Text>
                    <Text style={[styles.setsHeaderCol, { width: 50 }]}>RPE</Text>
                    <Text style={[styles.setsHeaderCol, { width: 30 }]}></Text>
                  </View>

                  {/* Set Rows */}
                  {block.sets.map((set: WorkoutPresetSetTemplate, sIdx: number) => {
                    const desc = SET_TYPE_DESCRIPTORS.find((d) => d.type === set.setType);
                    const setBadgeColor = SET_TYPE_COLORS[set.setType] || '#9CA3AF';
                    const code = desc?.shortCode || 'N';

                    return (
                      <View key={sIdx} style={styles.setRow}>
                        {/* Type Cycle Button */}
                        <TouchableOpacity
                          style={[styles.setTypeBtn, { borderColor: setBadgeColor }]}
                          onPress={() => handleCycleSetType(bIdx, sIdx)}
                        >
                          <Text style={[styles.setTypeText, { color: setBadgeColor }]}>
                            [{code}]
                          </Text>
                        </TouchableOpacity>

                        {/* Weight Input */}
                        <TextInput
                          style={styles.setCellInput}
                          keyboardType="numeric"
                          value={String(set.targetWeightKg || '')}
                          onChangeText={(val) => {
                            const parsed = parseFloat(val) || 0;
                            setBlocks((prev) =>
                              prev.map((b, bI) =>
                                bI === bIdx
                                  ? {
                                      ...b,
                                      sets: b.sets.map((s, sI) =>
                                        sI === sIdx ? { ...s, targetWeightKg: parsed } : s
                                      ),
                                    }
                                  : b
                              )
                            );
                          }}
                        />

                        {/* Reps Input */}
                        <TextInput
                          style={styles.setCellInput}
                          keyboardType="numeric"
                          value={String(set.targetReps || '')}
                          onChangeText={(val) => {
                            const parsed = parseInt(val, 10) || 0;
                            setBlocks((prev) =>
                              prev.map((b, bI) =>
                                bI === bIdx
                                  ? {
                                      ...b,
                                      sets: b.sets.map((s, sI) =>
                                        sI === sIdx ? { ...s, targetReps: parsed } : s
                                      ),
                                    }
                                  : b
                              )
                            );
                          }}
                        />

                        {/* RPE Input */}
                        <TextInput
                          style={[styles.setCellInput, { width: 50 }]}
                          keyboardType="numeric"
                          value={set.targetRpe ? String(set.targetRpe) : '8.5'}
                          onChangeText={(val) => {
                            const parsed = parseFloat(val) || null;
                            setBlocks((prev) =>
                              prev.map((b, bI) =>
                                bI === bIdx
                                  ? {
                                      ...b,
                                      sets: b.sets.map((s, sI) =>
                                        sI === sIdx ? { ...s, targetRpe: parsed } : s
                                      ),
                                    }
                                  : b
                              )
                            );
                          }}
                        />

                        <TouchableOpacity
                          style={styles.removeSetBtn}
                          onPress={() => handleRemoveSet(bIdx, sIdx)}
                        >
                          <Text style={styles.removeSetText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={styles.addSetRowBtn}
                    onPress={() => handleAddSet(bIdx)}
                  >
                    <Text style={styles.addSetRowText}>+ Add Set</Text>
                  </TouchableOpacity>
                </View>

                {/* Superset Connecting Bridge between linked exercises */}
                {isLinkedWithNext ? (
                  <View style={styles.supersetBridge}>
                    <View style={styles.supersetBridgeLine} />
                    <View style={styles.supersetBridgeBadge}>
                      <Text style={styles.supersetBridgeText}>⚡ SUPERSET LINK</Text>
                    </View>
                    <View style={styles.supersetBridgeTrail} />
                  </View>
                ) : null}
              </React.Fragment>
            );
          })}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            {editingPreset && onDeletePreset && !editingPreset.isSystemSeed ? (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  Alert.alert('Delete Preset', 'Are you sure you want to delete this routine?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        onDeletePreset(editingPreset.id);
                        onClose();
                      },
                    },
                  ]);
                }}
              >
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Routine Preset</Text>
            </TouchableOpacity>
          </View>

          {/* Exercise Picker Modal */}
          <ActivityPickerModal
            visible={showExercisePicker}
            onClose={() => {
              setShowExercisePicker(false);
              setTargetBlockIndex(null);
            }}
            onSelectExercise={(item) => handleAddExercise(item)}
            targetWorkoutCategory={category}
            title="Add Routine Exercise / Activity"
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  container: {
    backgroundColor: '#161518',
    borderColor: '#3D3842',
    borderWidth: 1,
    borderRadius: 14,
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2B2930',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#E8E6E1',
  },
  subtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  body: {
    padding: 16,
    flex: 1,
  },
  formGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: '#201F25',
    borderColor: '#38353E',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#E8E6E1',
    fontSize: 13,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 6,
  },
  catTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#323038',
    backgroundColor: '#1C1B20',
  },
  catIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  catLabel: {
    fontSize: 10,
    color: '#8A8890',
  },
  blocksHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#C69A45',
    textTransform: 'uppercase',
  },
  addExerciseBtn: {
    backgroundColor: '#5E1924',
    borderColor: '#8A2535',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addExerciseBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FEE2E2',
  },
  blockCard: {
    backgroundColor: '#1E1D22',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  blockCardLinkedNext: {
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 6,
  },
  blockCardLinkedPrev: {
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 6,
  },
  supersetBridge: {
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    paddingLeft: 12,
    marginVertical: 0,
  },
  supersetBridgeLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#C69A45',
  },
  supersetBridgeBadge: {
    backgroundColor: '#35250E',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  supersetBridgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FDE68A',
    letterSpacing: 0.5,
  },
  supersetBridgeTrail: {
    flex: 1,
    height: 1,
    backgroundColor: '#3D3118',
    marginLeft: 8,
    marginRight: 8,
  },
  blockTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  blockTitleContainer: {
    flex: 1,
  },
  supersetTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#382810',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginBottom: 4,
  },
  supersetTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#C69A45',
  },
  blockExerciseName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E8E6E1',
  },
  blockActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  supersetToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A4650',
    backgroundColor: '#2A282E',
  },
  supersetToggleBtnActive: {
    borderColor: '#C69A45',
    backgroundColor: '#3E2E10',
  },
  supersetToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D1D5DB',
  },
  supersetToggleTextActive: {
    color: '#FCD34D',
    fontWeight: '800',
  },
  removeBlockBtn: {
    padding: 4,
  },
  removeBlockText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '900',
  },
  setsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  setsHeaderCol: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  setTypeBtn: {
    width: 44,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: '#151418',
  },
  setTypeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  setCellInput: {
    flex: 1,
    backgroundColor: '#131215',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    color: '#E8E6E1',
    fontSize: 12,
    textAlign: 'center',
  },
  removeSetBtn: {
    width: 30,
    alignItems: 'center',
  },
  removeSetText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  addSetRowBtn: {
    paddingVertical: 6,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2B2930',
    marginTop: 4,
  },
  addSetRowText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C69A45',
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2B2930',
  },
  deleteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#2F1A1C',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  pickerCard: {
    backgroundColor: '#19181D',
    borderColor: '#3D3842',
    borderWidth: 1,
    borderRadius: 14,
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    padding: 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#E8E6E1',
  },
  pickerList: {
    maxHeight: 380,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#222027',
    borderColor: '#383540',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  pickerItemName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E8E6E1',
  },
  pickerItemMeta: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  pickerItemAddText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C69A45',
  },
});
