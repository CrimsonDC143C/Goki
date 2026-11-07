import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import {
  HeartRateZone,
  SetType,
  SET_TYPE_DESCRIPTORS,
  cycleSetType,
  WorkoutCategory,
  WorkoutPresetDefinition,
  computeSupersetDisplayLabels,
  resolveSetCompletionTransition,
  calculateDynamicRestPlan,
  DynamicRestMode,
  CompletedWorkoutRecord,
  CompletedExerciseEntry,
  PostWorkoutEncouragementSummary,
  evaluatePostWorkoutSummary,
  GeneratedWarmupSet,
  TrainingMetricTooltipKey,
  WeightUnit,
  calculateProgressiveOverloadTarget,
  convertDisplayWeightToKg,
  convertKgToDisplayWeight,
  formatCleanWeightNumber,
  formatCompactPrevPill,
  isWarmupSetType,
  normalizeGymId,
  resolveExerciseWeightUnit,
  resolveGhostRowForSetOrder,
  resolvePreviousExerciseSessionSets,
} from '@gymify/game-engine';
import { useGame } from '../state/GameContext';
import { CRIMSON_ONI } from '../theme';
import { WorkoutCategoryGateway } from '../components/WorkoutCategoryGateway';
import { DynamicRestTimer } from '../components/DynamicRestTimer';
import { PresetDesignerModal } from '../components/PresetDesignerModal';
import { ActivityPickerModal } from '../components/ActivityPickerModal';
import {
  MetricInfoBadge,
  MetricInfoTooltipModal,
} from '../components/MetricInfoTooltipModal';
import { PlatesAndWarmupModal } from '../components/PlatesAndWarmupModal';
import { ExerciseStickyNoteRow } from '../components/ExerciseStickyNoteRow';
import { RpeVerticalSliderModal } from '../components/RpeVerticalSliderModal';
import { ShareableWorkoutReceiptModal } from '../components/ShareableWorkoutReceiptModal';
import { TrainingHistoryScreen } from './TrainingHistoryScreen';
import { triggerSensoryCue } from '../utils/sensoryFeedback';
import { cancelRestTimerNotification, requestNotificationPermissions } from '../utils/restNotifications';
import { OfflineDraftExerciseBlock, OfflineDraftSetRow } from '../utils/offlineStorage';

export interface OfflineWorkoutScreenProps {
  onFinishAndReturn: () => void;
  onBackToLanding: () => void;
}

const SET_TYPE_COLORS: Record<SetType, string> = {
  NORMAL: '#9CA3AF',
  WARMUP: '#38BDF8',
  DROP_SET: '#EF4444',
  FAILURE: '#F59E0B',
  AMRAP: '#F59E0B',
};

const HR_ZONES: readonly HeartRateZone[] = [1, 2, 3, 4, 5];
const RPE_OPTIONS = [6.0, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0] as const;

const OFFLINE_GYM_PROFILES = [
  { id: 'iron-sanctum', name: 'Iron Sanctum Barbell Club', shortLabel: 'Iron Sanctum' },
  { id: 'titan-foundry', name: 'Titan Foundry Gym', shortLabel: 'Titan Foundry' },
  { id: 'home-outpost', name: 'Home Outpost', shortLabel: 'Home Outpost' },
  { id: 'open-world', name: 'Open World', shortLabel: 'Open World' },
] as const;

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export const OfflineWorkoutScreen: React.FC<OfflineWorkoutScreenProps> = ({
  onFinishAndReturn,
  onBackToLanding,
}) => {
  const {
    activeCharacterId,
    exercises,
    historicalPRs,
    arrivalBanner,
    offlineDraft,
    updateOfflineDraft,
    resetOfflineDraft,
    completeOfflineWorkout,
    workoutHistory,
    consistencyStreak,
    presets,
    savePreset,
    deletePreset,
    loadPresetIntoDraft,
    recordRecentActivity,
    exerciseGymPreferences,
    saveExerciseStickyNote,
    saveExerciseWeightUnit,
    saveExerciseBarWeightKg,
    defaultWeightUnit,
    warmupPresetCount,
    setWarmupPresetCount,
  } = useGame();

  const resistanceExercises = useMemo(
    () => exercises.filter((e) => e.category === 'RESISTANCE'),
    [exercises]
  );

  const cardioExercises = useMemo(
    () => exercises.filter((e) => e.category === 'CARDIO' || e.category === 'RECOVERY_MOBILITY'),
    [exercises]
  );

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [openExercisePickerBlockId, setOpenExercisePickerBlockId] = useState<string | null>(null);
  const [showCardioPicker, setShowCardioPicker] = useState<boolean>(false);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showPresetDesigner, setShowPresetDesigner] = useState<boolean>(false);
  const [showTrainingHistory, setShowTrainingHistory] = useState<boolean>(false);
  const [postWorkoutSummary, setPostWorkoutSummary] = useState<PostWorkoutEncouragementSummary | null>(null);
  const [lastCompletedWorkout, setLastCompletedWorkout] = useState<CompletedWorkoutRecord | null>(null);
  const [showShareReceipt, setShowShareReceipt] = useState<boolean>(false);
  const [sessionPresetTemplate, setSessionPresetTemplate] = useState<WorkoutPresetDefinition | null>(null);
  const [editingPresetDraft, setEditingPresetDraft] = useState<WorkoutPresetDefinition | null>(null);
  const [presetSavedInSession, setPresetSavedInSession] = useState<boolean>(false);
  const [platesModalBlockId, setPlatesModalBlockId] = useState<string | null>(null);
  const [rpeSliderTarget, setRpeSliderTarget] = useState<
    | { mode: 'SET'; blockId: string; setId: string; currentRpe: number; subtitle?: string }
    | { mode: 'CARDIO'; currentRpe: number }
    | null
  >(null);
  const [tooltipState, setTooltipState] = useState<{
    key: TrainingMetricTooltipKey;
    headline?: string | null;
    note?: string | null;
  } | null>(null);

  const activeGymId =
    normalizeGymId(offlineDraft.gymId ?? arrivalBanner?.gymId) ?? 'iron-sanctum';
  const matchedGymProfile =
    OFFLINE_GYM_PROFILES.find((g) => g.id === activeGymId) ?? OFFLINE_GYM_PROFILES[0]!;
  const activeGymName = offlineDraft.gymName ?? arrivalBanner?.gymName ?? matchedGymProfile.name;

  const handleCycleOfflineGym = () => {
    const curIdx = OFFLINE_GYM_PROFILES.findIndex((g) => g.id === activeGymId);
    const nextProfile =
      OFFLINE_GYM_PROFILES[(curIdx + 1) % OFFLINE_GYM_PROFILES.length] ??
      OFFLINE_GYM_PROFILES[0]!;
    updateOfflineDraft((prev) => ({
      ...prev,
      gymId: nextProfile.id,
      gymName: nextProfile.name,
    }));
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const resolveBlockUnit = useCallback(
    (block: OfflineDraftExerciseBlock): WeightUnit =>
      block.weightUnit ??
      resolveExerciseWeightUnit(
        exerciseGymPreferences,
        block.exerciseId,
        activeGymId,
        defaultWeightUnit
      ),
    [activeGymId, defaultWeightUnit, exerciseGymPreferences]
  );

  const filteredResistanceExercises = useMemo(() => {
    const q = exerciseSearchQuery.trim().toLowerCase();
    if (!q) return resistanceExercises;
    return resistanceExercises.filter(
      (e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
    );
  }, [resistanceExercises, exerciseSearchQuery]);

  // Dynamic Rest Timer State
  const [restTargetEndTimeMs, setRestTargetEndTimeMs] = useState<number | null>(null);
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(90);
  const [restStartedAtMs, setRestStartedAtMs] = useState<number | null>(null);
  const [customRestDurationSec, setCustomRestDurationSec] = useState<number | null>(null);
  const [restRecommendedSec, setRestRecommendedSec] = useState<number>(90);
  const [restMode, setRestMode] = useState<DynamicRestMode>('WORKING_REST');
  const [restHeadline, setRestHeadline] = useState<string>('');
  const [restSubtext, setRestSubtext] = useState<string>('');
  const [restCenterModalVisible, setRestCenterModalVisible] = useState<boolean>(false);
  const [scrollOffsetY, setScrollOffsetY] = useState<number>(0);

  // Cardio / Recovery quick entry state
  const [selectedCardioId, setSelectedCardioId] = useState<string>(
    () => cardioExercises[0]?.id ?? 'outdoor_tempo_cycling'
  );
  const [cardioMinutesStr, setCardioMinutesStr] = useState<string>('20');
  const [cardioZone, setCardioZone] = useState<HeartRateZone>(2);
  const [cardioRpe, setCardioRpe] = useState<number>(7.5);
  const [stopwatchRunning, setStopwatchRunning] = useState<boolean>(false);
  const [stopwatchElapsedSec, setStopwatchElapsedSec] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
      if (stopwatchRunning) {
        setStopwatchElapsedSec((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [stopwatchRunning]);

  const sessionElapsedSec = Math.max(
    0,
    Math.floor((nowMs - offlineDraft.startedAtMs) / 1000)
  );

  const completedSetCount = offlineDraft.exerciseBlocks.reduce(
    (sum, blk) => sum + blk.sets.filter((s) => s.completed).length,
    0
  );

  const activeCategory: WorkoutCategory | null = offlineDraft.category || null;
  const secondaryCategories: WorkoutCategory[] = offlineDraft.secondaryCategories || [];

  // Compute superset display labels across blocks
  const supersetLabels = useMemo(
    () => computeSupersetDisplayLabels(offlineDraft.exerciseBlocks),
    [offlineDraft.exerciseBlocks]
  );

  const handleSelectPrimaryCategory = (category: WorkoutCategory) => {
    updateOfflineDraft((prev) => ({
      ...prev,
      category,
    }));
  };

  const handleAddSecondarySegment = (category: WorkoutCategory) => {
    updateOfflineDraft((prev) => ({
      ...prev,
      secondaryCategories: Array.from(new Set([...(prev.secondaryCategories || []), category])),
    }));
  };

  const handleRemoveSecondarySegment = (category: WorkoutCategory) => {
    updateOfflineDraft((prev) => ({
      ...prev,
      secondaryCategories: (prev.secondaryCategories || []).filter((c) => c !== category),
    }));
  };

  const handleResetCategory = () => {
    updateOfflineDraft((prev) => ({
      ...prev,
      category: undefined,
    }));
  };

  const handleSelectExercise = (blockId: string, exerciseId: string) => {
    const ex = exercises.find((e) => e.id === exerciseId);
    const nextUnit = resolveExerciseWeightUnit(
      exerciseGymPreferences,
      exerciseId,
      activeGymId,
      defaultWeightUnit
    );
    const prevLookup = resolvePreviousExerciseSessionSets({
      exerciseId,
      workoutHistory,
      activeGymId,
    });
    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: prev.exerciseBlocks.map((b) =>
        b.blockId === blockId
          ? {
              ...b,
              exerciseId,
              exerciseName: ex?.name ?? exerciseId,
              weightUnit: nextUnit,
              sets: b.sets.map((s) =>
                s.completed
                  ? s
                  : {
                      ...s,
                      weightKgStr: prevLookup.found ? '' : '60',
                      repsStr: prevLookup.found ? '' : '8',
                    }
              ),
            }
          : b
      ),
    }));
    recordRecentActivity(exerciseId);
    setOpenExercisePickerBlockId(null);
    setExerciseSearchQuery('');
  };

  const handleMoveExerciseBlock = (blockIndex: number, direction: -1 | 1) => {
    updateOfflineDraft((prev) => {
      const targetIndex = blockIndex + direction;
      if (targetIndex < 0 || targetIndex >= prev.exerciseBlocks.length) return prev;
      const next = [...prev.exerciseBlocks];
      const [moved] = next.splice(blockIndex, 1);
      if (!moved) return prev;
      next.splice(targetIndex, 0, moved);
      return { ...prev, exerciseBlocks: next };
    });
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleToggleBlockWeightUnit = (blockId: string) => {
    const target = offlineDraft.exerciseBlocks.find((b) => b.blockId === blockId);
    if (!target) return;
    const oldUnit = resolveBlockUnit(target);
    const nextUnit: WeightUnit = oldUnit === 'KG' ? 'LBS' : 'KG';

    saveExerciseWeightUnit({
      exerciseId: target.exerciseId,
      unit: nextUnit,
      activeGymId,
      activeGymName,
    });

    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: prev.exerciseBlocks.map((b) => {
        if (b.blockId !== blockId) return b;
        return {
          ...b,
          weightUnit: nextUnit,
          sets: b.sets.map((s) => {
            if (!s.weightKgStr.trim()) return s;
            const kg = convertDisplayWeightToKg(Number(s.weightKgStr) || 0, oldUnit);
            return {
              ...s,
              weightKgStr: formatCleanWeightNumber(convertKgToDisplayWeight(kg, nextUnit)),
            };
          }),
        };
      }),
    }));
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleApplyOverloadTarget = (
    blockId: string,
    targetDisplayWeight: number,
    targetReps: number,
    targetRpe: number,
    unit: WeightUnit
  ) => {
    const weightStr = formatCleanWeightNumber(targetDisplayWeight);
    const repsStr = String(Math.max(1, Math.floor(targetReps)));
    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: prev.exerciseBlocks.map((b) => {
        if (b.blockId !== blockId) return b;
        return {
          ...b,
          weightUnit: unit,
          sets: b.sets.map((s) => {
            if (s.completed || isWarmupSetType(s.setType, s.isWarmup) || s.setType === 'DROP_SET') {
              return s;
            }
            return {
              ...s,
              weightKgStr: weightStr,
              repsStr,
              rpe: targetRpe,
            };
          }),
        };
      }),
    }));
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleCopyPrevToRow = (
    blockId: string,
    setId: string,
    displayWeightStr: string,
    repsStr: string,
    rpe: number | null
  ) => {
    setValidationError(null);
    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: prev.exerciseBlocks.map((b) =>
        b.blockId === blockId
          ? {
              ...b,
              sets: b.sets.map((s) =>
                s.id === setId
                  ? {
                      ...s,
                      weightKgStr: displayWeightStr,
                      repsStr,
                      rpe: rpe ?? s.rpe,
                    }
                  : s
              ),
            }
          : b
      ),
    }));
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleInsertWarmupSets = (
    blockId: string,
    warmupSets: GeneratedWarmupSet[],
    unit: WeightUnit
  ) => {
    if (warmupSets.length === 0) return;
    const stamp = Date.now();
    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: prev.exerciseBlocks.map((b) => {
        if (b.blockId !== blockId) return b;
        const keptSets = b.sets.filter(
          (s) => s.completed || !isWarmupSetType(s.setType, s.isWarmup)
        );
        const generatedRows: OfflineDraftSetRow[] = warmupSets.map((ws, idx) => ({
          id: `set_wu_${stamp}_${idx + 1}`,
          weightKgStr: formatCleanWeightNumber(ws.displayWeight),
          repsStr: String(ws.reps),
          isWarmup: true,
          setType: 'WARMUP',
          rpe: ws.rpe,
          completed: false,
        }));
        return {
          ...b,
          weightUnit: unit,
          sets: [...generatedRows, ...keptSets],
        };
      }),
    }));
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleUpdateSetField = (
    blockId: string,
    setId: string,
    field: 'weightKgStr' | 'repsStr',
    value: string
  ) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    setValidationError(null);
    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: prev.exerciseBlocks.map((b) =>
        b.blockId === blockId
          ? {
              ...b,
              sets: b.sets.map((s) => (s.id === setId ? { ...s, [field]: cleaned } : s)),
            }
          : b
      ),
    }));
  };

  const handleToggleSetCompleted = (blockId: string, setId: string) => {
    setValidationError(null);
    let justCompleted = false;
    let completedRow: OfflineDraftSetRow | null = null;
    let completedBlock: OfflineDraftExerciseBlock | null = null;

    const nextBlocks = offlineDraft.exerciseBlocks.map((b) => {
      if (b.blockId !== blockId) return b;
      const unit = resolveBlockUnit(b);
      const prevLookup = resolvePreviousExerciseSessionSets({
        exerciseId: b.exerciseId,
        workoutHistory,
        activeGymId,
      });

      let workingCounter = 0;
      let warmupCounter = 0;

      const updatedSets = b.sets.map((s) => {
        const isWu = isWarmupSetType(s.setType, s.isWarmup);
        const wIdx = workingCounter;
        const wuIdx = warmupCounter;
        if (isWu) warmupCounter += 1;
        else workingCounter += 1;

        if (s.id !== setId) return s;

        justCompleted = !s.completed;
        if (!justCompleted) {
          completedRow = { ...s, completed: false };
          return { ...s, completed: false };
        }

        const ghost = resolveGhostRowForSetOrder({
          lookup: prevLookup,
          setType: s.setType,
          isWarmup: s.isWarmup,
          workingOrderIndex: wIdx,
          warmupOrderIndex: wuIdx,
        });

        const filledWeightStr =
          s.weightKgStr.trim().length > 0
            ? s.weightKgStr
            : ghost
              ? formatCleanWeightNumber(convertKgToDisplayWeight(ghost.weightKg, unit))
              : '60';
        const filledRepsStr =
          s.repsStr.trim().length > 0
            ? s.repsStr
            : ghost
              ? String(ghost.reps)
              : '8';
        const filledRpe = s.rpe ?? ghost?.rpe ?? 8.5;

        const nextRow: OfflineDraftSetRow = {
          ...s,
          weightKgStr: filledWeightStr,
          repsStr: filledRepsStr,
          rpe: filledRpe,
          completed: true,
        };
        completedRow = nextRow;
        return nextRow;
      });

      const updatedBlock = { ...b, weightUnit: unit, sets: updatedSets };
      completedBlock = updatedBlock;
      return updatedBlock;
    });

    updateOfflineDraft((prev) => ({
      ...prev,
      gymId: activeGymId,
      gymName: activeGymName,
      exerciseBlocks: nextBlocks,
    }));

    // If user unchecked a set, cancel any running rest timer
    if (!justCompleted) {
      setRestTargetEndTimeMs(null);
      setRestStartedAtMs(null);
      setRestCenterModalVisible(false);
      cancelRestTimerNotification().catch(() => {});
      return;
    }

    if (completedRow) {
      if (completedBlock) {
        recordRecentActivity((completedBlock as { exerciseId: string }).exerciseId);
      }
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
      requestNotificationPermissions().catch(() => {});

      // Check if all sets across all exercises are complete
      const hasRemainingSets = nextBlocks.some((b) => b.sets.some((s) => !s.completed));

      if (!hasRemainingSets) {
        // Entire workout completed! Clear timer and play fanfare
        setRestTargetEndTimeMs(null);
        setRestStartedAtMs(null);
        setRestCenterModalVisible(false);
        cancelRestTimerNotification().catch(() => {});
        triggerSensoryCue('DUNGEON_CLEARED_FANFARE');
        return;
      }

      // Calculate dynamic rest transition & advice on fresh nextBlocks state
      const transition = resolveSetCompletionTransition({
        blocks: nextBlocks,
        completedBlockId: blockId,
        completedSetId: setId,
      });

      const blockEx = completedBlock
        ? exercises.find((e) => e.id === (completedBlock as { exerciseId: string }).exerciseId)
        : null;

      const plan = calculateDynamicRestPlan({
        setType: (completedRow as { setType?: SetType }).setType || 'NORMAL',
        isWarmup: (completedRow as { isWarmup?: boolean }).isWarmup,
        rpe: (completedRow as { rpe?: number | null }).rpe ?? 8.5,
        isCompound: blockEx ? blockEx.baseXpFactor >= 1.15 : true,
        nextSameExerciseSetIsDropSet: transition.nextSameExerciseSetIsDropSet,
        isMidSupersetRound: transition.isMidSupersetRound,
        nextSupersetExerciseName: transition.nextSupersetExerciseName,
        nextSupersetMemberLabel: transition.nextSupersetMemberLabel,
      });

      const startedMs = Date.now();
      const effectiveSec =
        customRestDurationSec !== null && plan.mode === 'WORKING_REST'
          ? customRestDurationSec
          : plan.seconds;

      setRestRecommendedSec(plan.seconds);
      setRestStartedAtMs(startedMs);
      setRestTotalSeconds(effectiveSec);
      setRestTargetEndTimeMs(startedMs + effectiveSec * 1000);
      setRestMode(plan.mode);
      setRestHeadline(plan.headline);
      setRestSubtext(plan.subtext);
      setRestCenterModalVisible(true);

      if (transition.nextSameExerciseSetIsDropSet) {
        triggerSensoryCue('DROP_SET_IMMEDIATE_TICK');
      } else if (transition.isMidSupersetRound) {
        triggerSensoryCue('SUPERSET_TRANSITION_TICK');
      }
    }
  };

  const handleCycleSetType = (blockId: string, setId: string) => {
    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: prev.exerciseBlocks.map((b) =>
        b.blockId === blockId
          ? {
              ...b,
              sets: b.sets.map((s) => {
                if (s.id === setId) {
                  const nextType = cycleSetType(s.setType || (s.isWarmup ? 'WARMUP' : 'NORMAL'));
                  return {
                    ...s,
                    setType: nextType,
                    isWarmup: nextType === 'WARMUP',
                    rpe: nextType === 'FAILURE' || nextType === 'AMRAP' ? 10 : s.rpe,
                  };
                }
                return s;
              }),
            }
          : b
      ),
    }));
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleSetRpeValue = (blockId: string, setId: string, nextRpe: number) => {
    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: prev.exerciseBlocks.map((b) =>
        b.blockId === blockId
          ? {
              ...b,
              sets: b.sets.map((s) => (s.id === setId ? { ...s, rpe: nextRpe } : s)),
            }
          : b
      ),
    }));
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleToggleSuperset = (blockIndex: number) => {
    updateOfflineDraft((prev) => {
      const blocks = [...prev.exerciseBlocks];
      const cur = blocks[blockIndex];
      const next = blocks[blockIndex + 1];
      if (!cur) return prev;

      if (cur.supersetGroupId) {
        const targetGroup = cur.supersetGroupId;
        return {
          ...prev,
          exerciseBlocks: blocks.map((b) =>
            b.supersetGroupId === targetGroup ? { ...b, supersetGroupId: undefined } : b
          ),
        };
      }

      const existingGroups = new Set(blocks.map((b) => b.supersetGroupId).filter(Boolean));
      const letters = ['A', 'B', 'C', 'D'];
      const nextLetter = letters.find((l) => !existingGroups.has(l)) || `G${existingGroups.size + 1}`;

      return {
        ...prev,
        exerciseBlocks: blocks.map((b, idx) => {
          if (idx === blockIndex || (next && idx === blockIndex + 1)) {
            return { ...b, supersetGroupId: nextLetter };
          }
          return b;
        }),
      };
    });
    triggerSensoryCue('SUPERSET_TRANSITION_TICK');
  };

  const handleAddSetRow = (blockId: string) => {
    updateOfflineDraft((prev) => {
      const targetBlock = prev.exerciseBlocks.find((b) => b.blockId === blockId);
      const targetSupersetGroup = targetBlock?.supersetGroupId;

      return {
        ...prev,
        exerciseBlocks: prev.exerciseBlocks.map((b) => {
          const shouldAdd =
            b.blockId === blockId ||
            (!!targetSupersetGroup && b.supersetGroupId === targetSupersetGroup);
          if (!shouldAdd) return b;

          const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const lastRow = b.sets[b.sets.length - 1];
          const prevLookup = resolvePreviousExerciseSessionSets({
            exerciseId: b.exerciseId,
            workoutHistory,
            activeGymId,
          });
          return {
            ...b,
            sets: [
              ...b.sets,
              {
                id: `set_${stamp}`,
                weightKgStr: lastRow?.weightKgStr ?? (prevLookup.found ? '' : '60'),
                repsStr: lastRow?.repsStr ?? (prevLookup.found ? '' : '8'),
                isWarmup: false,
                setType: 'NORMAL',
                rpe: lastRow?.rpe ?? 8.5,
                completed: false,
              },
            ],
          };
        }),
      };
    });
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleRemoveSetRow = (blockId: string, setId: string) => {
    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: prev.exerciseBlocks.map((b) => {
        if (b.blockId !== blockId || b.sets.length <= 1) return b;
        return {
          ...b,
          sets: b.sets.filter((s) => s.id !== setId),
        };
      }),
    }));
  };

  const handleAddExerciseBlock = () => {
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const usedIds = new Set(offlineDraft.exerciseBlocks.map((b) => b.exerciseId));
    const nextExercise =
      resistanceExercises.find((e) => !usedIds.has(e.id)) ??
      resistanceExercises[0];
    const nextId = nextExercise?.id ?? 'smith_machine_squat';
    const nextUnit = resolveExerciseWeightUnit(
      exerciseGymPreferences,
      nextId,
      activeGymId,
      defaultWeightUnit
    );
    const prevLookup = resolvePreviousExerciseSessionSets({
      exerciseId: nextId,
      workoutHistory,
      activeGymId,
    });
    const setCount = prevLookup.workingSets.length > 0 ? prevLookup.workingSets.length : 1;

    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: [
        ...prev.exerciseBlocks,
        {
          blockId: `blk_${stamp}`,
          exerciseId: nextId,
          exerciseName: nextExercise?.name ?? nextId,
          weightUnit: nextUnit,
          sets: Array.from({ length: setCount }, (_, idx) => ({
            id: `set_${stamp}_${idx + 1}`,
            weightKgStr: prevLookup.found ? '' : '60',
            repsStr: prevLookup.found ? '' : '8',
            isWarmup: false,
            setType: 'NORMAL',
            rpe: prevLookup.workingSets[idx]?.rpe ?? 8.5,
            completed: false,
          })),
        },
      ],
    }));
  };

  const handleRemoveExerciseBlock = (blockId: string) => {
    updateOfflineDraft((prev) => {
      if (prev.exerciseBlocks.length <= 1) return prev;
      return {
        ...prev,
        exerciseBlocks: prev.exerciseBlocks.filter((b) => b.blockId !== blockId),
      };
    });
  };

  const handleAddCardioEntry = () => {
    setValidationError(null);
    const exMeta = cardioExercises.find((e) => e.id === selectedCardioId) ?? cardioExercises[0];
    const mins = Number(cardioMinutesStr) || 0;
    const durationSeconds =
      mins > 0
        ? Math.round(mins * 60)
        : stopwatchElapsedSec > 0
          ? stopwatchElapsedSec
          : 0;

    if (durationSeconds <= 0) {
      setValidationError('Enter cardio minutes or run the stopwatch before adding.');
      return;
    }

    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    updateOfflineDraft((prev) => ({
      ...prev,
      cardioEntries: [
        ...prev.cardioEntries,
        {
          id: `cardio_${stamp}`,
          exerciseId: exMeta?.id ?? selectedCardioId,
          exerciseName: exMeta?.name ?? selectedCardioId,
          activityType:
            exMeta?.category === 'RECOVERY_MOBILITY' ? 'RECOVERY_MOBILITY' : 'CARDIO',
          durationSeconds,
          averageHrZone: cardioZone,
          rpe: cardioRpe,
        },
      ],
    }));

    if (stopwatchElapsedSec > 0) {
      setStopwatchRunning(false);
      setStopwatchElapsedSec(0);
    }
    recordRecentActivity(selectedCardioId);
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleRemoveCardioEntry = (entryId: string) => {
    updateOfflineDraft((prev) => ({
      ...prev,
      cardioEntries: prev.cardioEntries.filter((c) => c.id !== entryId),
    }));
  };

  const handleLoadSessionIntoWorkout = useCallback(
    (workout: CompletedWorkoutRecord) => {
      const nowMs = Date.now();
      const blocks: OfflineDraftExerciseBlock[] = (workout.exercises || []).map((ex, bIdx) => ({
        blockId: `blk_hist_${nowMs}_${bIdx + 1}`,
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName || ex.exerciseId,
        supersetGroupId: null,
        sets: (ex.sets || []).map((s, sIdx) => ({
          id: `set_hist_${nowMs}_${bIdx + 1}_${sIdx + 1}`,
          weightKgStr: String(s.weightKg ?? 0),
          repsStr: String(s.reps ?? 0),
          isWarmup: s.setType === 'WARMUP' || !!s.isWarmup,
          setType: s.setType || 'NORMAL',
          rpe: s.rpe ?? 8.5,
          supersetGroupId: null,
          completed: false,
        })),
      }));

      updateOfflineDraft((prev) => ({
        ...prev,
        category: 'GYM',
        exerciseBlocks: blocks,
        sourcePresetId: workout.presetName ? `preset_${workout.presetName}` : null,
      }));
      setShowTrainingHistory(false);
      triggerSensoryCue('WORKOUT_PRESET_LOADED');
    },
    [updateOfflineDraft]
  );

  const handleRestSelectPreset = useCallback(
    (targetSec: number) => {
      setCustomRestDurationSec(targetSec);
      const now = Date.now();
      const anchorStartMs =
        restStartedAtMs ??
        (restTargetEndTimeMs !== null ? restTargetEndTimeMs - restTotalSeconds * 1000 : now);

      const nextEndMs = anchorStartMs + targetSec * 1000;
      if (nextEndMs <= now) {
        setRestTargetEndTimeMs(null);
        setRestStartedAtMs(null);
        setRestTotalSeconds(targetSec);
        setRestCenterModalVisible(false);
        cancelRestTimerNotification().catch(() => {});
        triggerSensoryCue('REST_TIMER_EXPIRED');
      } else {
        setRestStartedAtMs(anchorStartMs);
        setRestTotalSeconds(targetSec);
        setRestTargetEndTimeMs(nextEndMs);
      }
    },
    [restStartedAtMs, restTargetEndTimeMs, restTotalSeconds]
  );

  const handleRestAdjustDelta = useCallback(
    (delta: number) => {
      if (restTargetEndTimeMs === null) return;
      const now = Date.now();
      const anchorStartMs = restStartedAtMs ?? (restTargetEndTimeMs - restTotalSeconds * 1000);
      const rawNextEndMs = restTargetEndTimeMs + delta * 1000;

      if (rawNextEndMs <= now) {
        setRestTargetEndTimeMs(null);
        setRestStartedAtMs(null);
        setRestCenterModalVisible(false);
        cancelRestTimerNotification().catch(() => {});
        triggerSensoryCue('REST_TIMER_EXPIRED');
      } else {
        const remainingMs = rawNextEndMs - now;
        const cappedRemainingMs = Math.min(600_000, remainingMs);
        const nextEndMs = now + cappedRemainingMs;
        const nextConfiguredSec = Math.max(
          10,
          Math.min(600, Math.round((nextEndMs - anchorStartMs) / 1000))
        );
        setRestStartedAtMs(anchorStartMs);
        setRestTotalSeconds(nextConfiguredSec);
        setRestTargetEndTimeMs(nextEndMs);
      }
    },
    [restStartedAtMs, restTargetEndTimeMs, restTotalSeconds]
  );

  const handleRestSkip = useCallback(() => {
    setRestTargetEndTimeMs(null);
    setRestStartedAtMs(null);
    setRestCenterModalVisible(false);
    cancelRestTimerNotification().catch(() => {});
  }, []);

  const handleRestComplete = useCallback(() => {
    // Rest duration elapsed: keep active in 0:00 completed state so user can acknowledge via button
  }, []);

  const handleFinishWorkout = () => {
    setRestTargetEndTimeMs(null);
    setRestStartedAtMs(null);
    setRestCenterModalVisible(false);
    cancelRestTimerNotification().catch(() => {});

    // Build current session's CompletedWorkoutRecord matching completed sets logic
    const historyExercises: CompletedExerciseEntry[] = [];
    for (const block of offlineDraft.exerciseBlocks) {
      const bUnit = resolveBlockUnit(block);
      const completedRows = block.sets.filter((s) => s.completed && (Number(s.repsStr) || 0) > 0);
      if (completedRows.length > 0) {
        historyExercises.push({
          exerciseId: block.exerciseId,
          exerciseName: block.exerciseName || block.exerciseId,
          sets: completedRows.map((s, idx) => ({
            setNumber: idx + 1,
            weightKg: convertDisplayWeightToKg(Math.max(0, Number(s.weightKgStr) || 0), bUnit),
            reps: Math.floor(Number(s.repsStr) || 0),
            rpe: s.rpe ?? null,
            setType: s.setType,
            isWarmup: s.isWarmup,
          })),
        });
      }
    }

    const validCardio = offlineDraft.cardioEntries.filter((c) => c.durationSeconds > 0);

    const nowMs = Date.now();
    const currentWorkout: CompletedWorkoutRecord = {
      id: `offline_hist_${nowMs}`,
      characterId: activeCharacterId ?? null,
      source: 'OFFLINE',
      performedAtIso: new Date(nowMs).toISOString(),
      durationSeconds: sessionElapsedSec,
      workoutCategory: offlineDraft.category ?? 'GYM',
      workoutType: 'HYBRID',
      gymId: activeGymId,
      gymName: activeGymName,
      exercises: historyExercises,
    };

    const summary = evaluatePostWorkoutSummary({
      currentWorkout,
      previousWorkouts: workoutHistory,
      consistencyStreak: consistencyStreak + 1,
      cardioSegmentCount: validCardio.length,
    });

    const draftTemplate: WorkoutPresetDefinition = {
      id: '',
      slug: '',
      name: '',
      category: offlineDraft.category ?? 'GYM',
      notes: '',
      isSystemSeed: false,
      blocks: {
        exerciseBlocks: offlineDraft.exerciseBlocks.map((b) => {
          const bUnit = resolveBlockUnit(b);
          const completedSets = b.sets.filter((s) => s.completed && (Number(s.repsStr) || 0) > 0);
          const chosenSets = completedSets.length > 0 ? completedSets : b.sets;
          return {
            blockId: b.blockId,
            exerciseSlug: b.exerciseId,
            exerciseName: b.exerciseName || b.exerciseId,
            supersetGroupId: b.supersetGroupId ?? undefined,
            sets: chosenSets.map((s) => ({
              targetWeightKg: convertDisplayWeightToKg(
                Math.max(0, Number(s.weightKgStr) || 0),
                bUnit
              ),
              targetReps: Math.max(1, Math.floor(Number(s.repsStr) || 0)),
              setType: s.setType || 'NORMAL',
              targetRpe: s.rpe ?? 8.5,
            })),
          };
        }),
        cardioSegments: offlineDraft.cardioEntries.map((c, idx) => ({
          segmentId: c.id || `seg_${idx + 1}`,
          exerciseSlug: c.exerciseId,
          exerciseName: c.exerciseName,
          activityType: c.activityType,
          targetDurationMinutes: Math.max(1, Math.round(c.durationSeconds / 60)),
          targetHrZone: c.averageHrZone,
          targetRpe: c.rpe ?? null,
        })),
        sessionRpeTarget: offlineDraft.sessionRpe ?? null,
      },
    };

    const res = completeOfflineWorkout();
    if (!res.ok) {
      setValidationError(res.error ?? 'Complete at least one set or cardio entry first.');
      return;
    }

    setValidationError(null);
    setLastCompletedWorkout(currentWorkout);
    setPostWorkoutSummary(summary);
    setSessionPresetTemplate(draftTemplate);
    setPresetSavedInSession(false);
  };

  const showResistanceUI = !activeCategory || activeCategory === 'GYM' || secondaryCategories.includes('GYM');
  const showCardioUI = activeCategory === 'CARDIO' || secondaryCategories.includes('CARDIO');
  const showSportUI = activeCategory === 'SPORT' || secondaryCategories.includes('SPORT');
  const showRecoveryUI = activeCategory === 'RECOVERY' || secondaryCategories.includes('RECOVERY');

  return (
    <View style={styles.root}>
      {/* Minimalist Utility Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeftGroup}>
          <Pressable style={styles.backBtn} onPress={onBackToLanding}>
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
          <TouchableOpacity
            style={styles.topBarHistoryBtn}
            onPress={() => setShowTrainingHistory(true)}
            testID="offline-history-top-btn"
            activeOpacity={0.7}
          >
            <Text style={styles.topBarHistoryText}>📊 History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topBarGymBtn}
            onPress={handleCycleOfflineGym}
            activeOpacity={0.75}
            testID="offline-gym-switcher-btn"
          >
            <Text style={styles.topBarGymText} numberOfLines={1}>
              📍 {matchedGymProfile.shortLabel}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sessionTimerCenter}>
          <Text style={styles.sessionClock}>{formatClock(sessionElapsedSec)}</Text>
          <Text style={styles.savedStatusText}>● Saved locally</Text>
        </View>
      </View>

      {/* Pinned Rest Timer Fixed at Top of Viewable Screen (visible when rest active & minimized from center) */}
      {restTargetEndTimeMs && !restCenterModalVisible ? (
        <View style={styles.pinnedRestContainer}>
          <DynamicRestTimer
            targetEndTimeMs={restTargetEndTimeMs}
            totalDurationSeconds={restTotalSeconds}
            mode={restMode}
            headline={restHeadline}
            subtext={restSubtext}
            onAdjustDelta={handleRestAdjustDelta}
            onSkip={handleRestSkip}
            onComplete={handleRestComplete}
            variant="banner"
            onTapToFocus={() => setRestCenterModalVisible(true)}
            onSelectPreset={handleRestSelectPreset}
            recommendedSeconds={restRecommendedSec}
            scrollOffsetY={scrollOffsetY}
          />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          restTargetEndTimeMs && !restCenterModalVisible ? styles.scrollContentWithPinnedTimer : null,
        ]}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => setScrollOffsetY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {validationError && (
          <View style={styles.validationBox}>
            <Text style={styles.validationText}>{validationError}</Text>
          </View>
        )}

        {/* Workout Category Gateway Step */}
        <WorkoutCategoryGateway
          selectedCategory={activeCategory}
          secondaryCategories={secondaryCategories}
          presets={presets}
          isOffline={true}
          onSelectPrimaryCategory={handleSelectPrimaryCategory}
          onAddSecondarySegment={handleAddSecondarySegment}
          onRemoveSecondarySegment={handleRemoveSecondarySegment}
          onResetCategory={handleResetCategory}
          onLoadPreset={(p) => loadPresetIntoDraft(p, 'OFFLINE')}
          onOpenPresetDesigner={() => setShowPresetDesigner(true)}
          onOpenTrainingHistory={() => setShowTrainingHistory(true)}
        />

        {/* RESISTANCE TRAINING LOGGING SECTION */}
        {showResistanceUI && (
          <View style={styles.modalitySection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeadingGroup}>
                <Text style={styles.sectionHeading}>RESISTANCE SETS</Text>
              </View>
              <Text style={styles.sectionCountMeta}>
                {completedSetCount} set{completedSetCount === 1 ? '' : 's'} checked
              </Text>
            </View>

            {offlineDraft.exerciseBlocks.map((block, bIdx) => {
              const exMeta = exercises.find((e) => e.id === block.exerciseId);
              const supersetInfo = supersetLabels[block.blockId];
              const isGrouped = !!block.supersetGroupId;
              const nextBlock = offlineDraft.exerciseBlocks[bIdx + 1];
              const prevBlock = offlineDraft.exerciseBlocks[bIdx - 1];
              const isLinkedWithNext =
                isGrouped &&
                !!nextBlock?.supersetGroupId &&
                nextBlock.supersetGroupId === block.supersetGroupId;
              const isLinkedWithPrev =
                isGrouped &&
                !!prevBlock?.supersetGroupId &&
                prevBlock.supersetGroupId === block.supersetGroupId;

              const blockUnit = resolveBlockUnit(block);
              const prRecord = historicalPRs[block.exerciseId];
              const prevLookup = resolvePreviousExerciseSessionSets({
                exerciseId: block.exerciseId,
                workoutHistory,
                activeGymId,
              });
              const overloadRec = calculateProgressiveOverloadTarget({
                exerciseId: block.exerciseId,
                workoutHistory,
                activeGymId,
                isCompound: exMeta ? exMeta.baseXpFactor >= 1.15 : true,
                equipmentType: exMeta?.equipmentType,
                historicalPR: prRecord ?? null,
                unit: blockUnit,
              });

              let workingOrderCounter = 0;
              let warmupOrderCounter = 0;

              return (
                <React.Fragment key={block.blockId}>
                  <View
                    style={[
                      styles.exerciseCard,
                      isGrouped && { borderLeftColor: '#C69A45', borderLeftWidth: 4 },
                      isLinkedWithNext && styles.exerciseCardLinkedNext,
                      isLinkedWithPrev && styles.exerciseCardLinkedPrev,
                    ]}
                  >
                    {/* Superset Pill Header */}
                    {supersetInfo ? (
                      <View style={styles.supersetBanner}>
                        <Text style={styles.supersetBannerText}>
                          ⚡ SUPERSET {supersetInfo.supersetGroupId} ({supersetInfo.memberLabel})
                        </Text>
                      </View>
                    ) : null}

                    {/* Exercise Selector & Reorder/Swap Header */}
                    <View style={styles.exerciseCardHeader}>
                      <View style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
                        <Pressable
                          style={styles.exerciseSelectorBtn}
                          onPress={() => setOpenExercisePickerBlockId(block.blockId)}
                        >
                          <Text style={styles.exerciseSelectorText} numberOfLines={1}>
                            {exMeta?.name ?? block.exerciseName ?? block.exerciseId}
                          </Text>
                          <Text style={styles.exerciseSelectorCaret}>⇄ ▼</Text>
                        </Pressable>

                        <View style={styles.subMetaRow}>
                          {prRecord && prRecord.bestE1RM > 0 ? (
                            <View style={styles.e1rmInlineBadge}>
                              <Text style={styles.prevSessionHintText}>
                                🏆 Best:{' '}
                                {formatCleanWeightNumber(
                                  convertKgToDisplayWeight(prRecord.bestE1RM, blockUnit)
                                )}
                                {blockUnit === 'LBS' ? 'lb' : 'kg'} e1RM
                              </Text>
                              <MetricInfoBadge
                                onPress={() => setTooltipState({ key: 'E1RM' })}
                              />
                            </View>
                          ) : prevLookup.found && !prevLookup.matchedActiveGym && prevLookup.sourceGymName ? (
                            <Text style={styles.prevSessionHintText} numberOfLines={1}>
                              Prev from {prevLookup.sourceGymName}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      <View style={styles.cardHeaderActions}>
                        {offlineDraft.exerciseBlocks.length > 1 && (
                          <View style={styles.reorderGroup}>
                            <TouchableOpacity
                              style={[styles.reorderBtn, bIdx === 0 && styles.reorderBtnDisabled]}
                              disabled={bIdx === 0}
                              onPress={() => handleMoveExerciseBlock(bIdx, -1)}
                            >
                              <Text style={styles.reorderBtnText}>↑</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.reorderBtn,
                                bIdx === offlineDraft.exerciseBlocks.length - 1 &&
                                  styles.reorderBtnDisabled,
                              ]}
                              disabled={bIdx === offlineDraft.exerciseBlocks.length - 1}
                              onPress={() => handleMoveExerciseBlock(bIdx, 1)}
                            >
                              <Text style={styles.reorderBtnText}>↓</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        <TouchableOpacity
                          style={[styles.linkSupersetBtn, isGrouped && styles.linkSupersetBtnActive]}
                          onPress={() => handleToggleSuperset(bIdx)}
                        >
                          <Text
                            style={[
                              styles.linkSupersetBtnText,
                              isGrouped && styles.linkSupersetBtnTextActive,
                            ]}
                          >
                            {isGrouped ? '🔗 SS' : '🔗 Link'}
                          </Text>
                        </TouchableOpacity>

                        {offlineDraft.exerciseBlocks.length > 1 && (
                          <Pressable
                            style={styles.removeBlockBtn}
                            onPress={() => handleRemoveExerciseBlock(block.blockId)}
                          >
                            <Text style={styles.removeBlockBtnText}>✕</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>

                    {/* Gym-Aware Sticky Per-Exercise Setup Note */}
                    <ExerciseStickyNoteRow
                      exerciseId={block.exerciseId}
                      activeGymId={activeGymId}
                      activeGymName={activeGymName}
                      preferences={exerciseGymPreferences}
                      onSaveNote={saveExerciseStickyNote}
                    />

                    {/* Ergonomics Toolbar: Overload Target + Plates/Warm-Up + KG/LBS Toggle */}
                    <View style={styles.ergonomicsStrip}>
                      {overloadRec.available ? (
                        <View style={styles.overloadPillGroup}>
                          <TouchableOpacity
                            style={[
                              styles.overloadTargetPill,
                              overloadRec.triggersPrCrit && styles.overloadTargetPillCrit,
                            ]}
                            onPress={() =>
                              handleApplyOverloadTarget(
                                block.blockId,
                                overloadRec.targetDisplayWeight,
                                overloadRec.targetReps,
                                overloadRec.targetRpe,
                                blockUnit
                              )
                            }
                            activeOpacity={0.75}
                          >
                            <Text style={styles.overloadTargetText} numberOfLines={1}>
                              {overloadRec.pillLabel}
                            </Text>
                          </TouchableOpacity>
                          <MetricInfoBadge
                            onPress={() =>
                              setTooltipState({
                                key: 'OVERLOAD_TARGET',
                                headline: overloadRec.pillLabel,
                                note: overloadRec.rationaleText,
                              })
                            }
                          />
                        </View>
                      ) : null}

                      <View style={styles.ergonomicsRightTools}>
                        <TouchableOpacity
                          style={styles.platesHelperBtn}
                          onPress={() => setPlatesModalBlockId(block.blockId)}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.platesHelperBtnText}>🧮 Plates / Warm-Up</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.unitTogglePill,
                            blockUnit === 'LBS' && styles.unitTogglePillImperial,
                          ]}
                          onPress={() => handleToggleBlockWeightUnit(block.blockId)}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.unitTogglePillText}>{blockUnit}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* 6-Column Table Headers: SET (i) | PREV | KG/LBS | REPS | RPE (i) | ✓ */}
                    <View style={styles.setTableHeader}>
                      <View style={[styles.colHeaderWithInfo, { width: 36 }]}>
                        <Text style={styles.colHeader}>SET</Text>
                        <MetricInfoBadge
                          onPress={() => setTooltipState({ key: 'SET_TYPES' })}
                        />
                      </View>
                      <Text style={[styles.colHeader, { width: 58 }]}>PREV</Text>
                      <Text style={[styles.colHeader, styles.colInput]}>{blockUnit}</Text>
                      <Text style={[styles.colHeader, styles.colInput]}>REPS</Text>
                      <View style={[styles.colHeaderWithInfo, { width: 44 }]}>
                        <Text style={styles.colHeader}>RPE</Text>
                        <MetricInfoBadge
                          onPress={() => setTooltipState({ key: 'RPE' })}
                        />
                      </View>
                      <Text style={[styles.colHeader, styles.colCheck]}>✓</Text>
                      {block.sets.length > 1 && <View style={styles.colDeleteSpacer} />}
                    </View>

                    {/* Set Rows */}
                    {block.sets.map((row) => {
                      const rowSetType = row.setType || (row.isWarmup ? 'WARMUP' : 'NORMAL');
                      const isWu = isWarmupSetType(rowSetType, row.isWarmup);
                      const wIdx = workingOrderCounter;
                      const wuIdx = warmupOrderCounter;
                      if (isWu) warmupOrderCounter += 1;
                      else workingOrderCounter += 1;

                      const badgeDesc = SET_TYPE_DESCRIPTORS.find((d) => d.type === rowSetType);
                      const tagColor = SET_TYPE_COLORS[rowSetType] || '#9CA3AF';
                      const rawCode = badgeDesc?.shortCode || 'N';
                      const displayCode = rawCode === 'N' ? String(wIdx + 1) : rawCode;

                      const ghostRow = resolveGhostRowForSetOrder({
                        lookup: prevLookup,
                        setType: rowSetType,
                        isWarmup: row.isWarmup,
                        workingOrderIndex: wIdx,
                        warmupOrderIndex: wuIdx,
                      });

                      const ghostDispWeightStr = ghostRow
                        ? formatCleanWeightNumber(
                            convertKgToDisplayWeight(ghostRow.weightKg, blockUnit)
                          )
                        : '';
                      const ghostRepsStr = ghostRow ? String(ghostRow.reps) : '';
                      const prevPill = ghostRow
                        ? formatCompactPrevPill({
                            weightKg: ghostRow.weightKg,
                            reps: ghostRow.reps,
                            unit: blockUnit,
                            rpe: ghostRow.rpe,
                          })
                        : null;

                      return (
                        <View
                          key={row.id}
                          style={[
                            styles.setRow,
                            row.completed && styles.setRowCompleted,
                            rowSetType === 'DROP_SET' && styles.dropSetRowIndent,
                          ]}
                        >
                          {/* Cycle Set Type Button [1 / W / D / F] */}
                          <TouchableOpacity
                            style={[styles.setTypeBtn, { borderColor: tagColor }]}
                            onPress={() => handleCycleSetType(block.blockId, row.id)}
                          >
                            <Text style={[styles.setTypeBtnText, { color: tagColor }]}>
                              {displayCode}
                            </Text>
                          </TouchableOpacity>

                          {/* Per-Set `PREV` 1-Tap Copy Pill */}
                          <TouchableOpacity
                            style={[
                              styles.prevSetPill,
                              !prevPill && styles.prevSetPillEmpty,
                            ]}
                            disabled={!ghostRow}
                            onPress={() => {
                              if (ghostRow) {
                                handleCopyPrevToRow(
                                  block.blockId,
                                  row.id,
                                  ghostDispWeightStr,
                                  ghostRepsStr,
                                  ghostRow.rpe
                                );
                              }
                            }}
                            activeOpacity={0.7}
                          >
                            {prevPill ? (
                              <>
                                <Text style={styles.prevSetMainText} numberOfLines={1}>
                                  {prevPill.mainText}
                                </Text>
                                {prevPill.rpeSubText ? (
                                  <Text style={styles.prevSetSubText} numberOfLines={1}>
                                    {prevPill.rpeSubText}
                                  </Text>
                                ) : null}
                              </>
                            ) : (
                              <Text style={styles.prevSetEmptyText}>—</Text>
                            )}
                          </TouchableOpacity>

                          {/* Weight Input with Ghost Placeholder */}
                          <TextInput
                            style={[
                              styles.numericInput,
                              row.completed && styles.numericInputCompleted,
                            ]}
                            value={row.weightKgStr}
                            onChangeText={(val) =>
                              handleUpdateSetField(block.blockId, row.id, 'weightKgStr', val)
                            }
                            keyboardType="decimal-pad"
                            placeholder={ghostDispWeightStr || '0'}
                            placeholderTextColor={
                              ghostDispWeightStr ? 'rgba(253, 230, 138, 0.42)' : CRIMSON_ONI.ashMuted
                            }
                            selectTextOnFocus
                          />

                          {/* Reps Input with Ghost Placeholder */}
                          <TextInput
                            style={[
                              styles.numericInput,
                              row.completed && styles.numericInputCompleted,
                            ]}
                            value={row.repsStr}
                            onChangeText={(val) =>
                              handleUpdateSetField(block.blockId, row.id, 'repsStr', val)
                            }
                            keyboardType="number-pad"
                            placeholder={ghostRepsStr || '0'}
                            placeholderTextColor={
                              ghostRepsStr ? 'rgba(253, 230, 138, 0.42)' : CRIMSON_ONI.ashMuted
                            }
                            selectTextOnFocus
                          />

                          {/* RPE Pill Button (opens vertical RPE slider) */}
                          <TouchableOpacity
                            style={styles.rpePillBtn}
                            onPress={() =>
                              setRpeSliderTarget({
                                mode: 'SET',
                                blockId: block.blockId,
                                setId: row.id,
                                currentRpe: row.rpe ?? ghostRow?.rpe ?? 8.5,
                                subtitle: `${
                                  exercises.find((e) => e.id === block.exerciseId)?.name ??
                                  block.exerciseName ??
                                  'Exercise'
                                } • Set ${displayCode}`,
                              })
                            }
                          >
                            <Text style={styles.rpePillText}>
                              {row.rpe ? `${row.rpe}` : ghostRow?.rpe ? `${ghostRow.rpe}` : '8.5'}
                            </Text>
                          </TouchableOpacity>

                          {/* Checkbox (1-Tap Auto-Fills Ghost Values if Blank) */}
                          <Pressable
                            style={[
                              styles.checkBtn,
                              row.completed && styles.checkBtnCompleted,
                            ]}
                            onPress={() => handleToggleSetCompleted(block.blockId, row.id)}
                            testID="set-complete-btn"
                          >
                            <Text
                              style={[
                                styles.checkBtnText,
                                row.completed && styles.checkBtnTextCompleted,
                              ]}
                            >
                              {row.completed ? '✓' : ''}
                            </Text>
                          </Pressable>

                          {block.sets.length > 1 && (
                            <Pressable
                              style={styles.deleteSetBtn}
                              onPress={() => handleRemoveSetRow(block.blockId, row.id)}
                            >
                              <Text style={styles.deleteSetText}>✕</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}

                    <Pressable
                      style={styles.addSetRowBtn}
                      onPress={() => handleAddSetRow(block.blockId)}
                    >
                      <Text style={styles.addSetRowText}>+ Add Set</Text>
                    </Pressable>
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

            <Pressable style={styles.addExerciseBlockBtn} onPress={handleAddExerciseBlock}>
              <Text style={styles.addExerciseBlockText}>+ Add Exercise</Text>
            </Pressable>
          </View>
        )}

        {/* CARDIO / SPORT / RECOVERY MODALITY LOGGING */}
        {(showCardioUI || showSportUI || showRecoveryUI) && (
          <View style={styles.modalitySection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>
                {showSportUI ? 'SPORT TRAINING' : showRecoveryUI ? 'ACTIVE RECOVERY & MOBILITY' : 'CARDIO TRAINING'}
              </Text>
              <Text style={styles.sectionCountMeta}>
                {offlineDraft.cardioEntries.length} logged
              </Text>
            </View>

            <View style={styles.cardioCard}>
              <View style={styles.cardioSelectHeader}>
                <Text style={styles.cardioLabel}>Activity:</Text>
                <TouchableOpacity
                  style={styles.cardioBrowseBtn}
                  onPress={() => setShowCardioPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cardioBrowseBtnText}>🔍 Browse / Add Modality</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.cardioSelectedBanner}
                onPress={() => setShowCardioPicker(true)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardioSelectedName}>
                    {cardioExercises.find((c) => c.id === selectedCardioId)?.name ?? selectedCardioId}
                  </Text>
                  <Text style={styles.cardioSelectedSub}>
                    {cardioExercises.find((c) => c.id === selectedCardioId)?.equipmentType || 'Activity'} • Tap to search or add custom
                  </Text>
                </View>
                <Text style={styles.cardioSelectedChangeIcon}>🔍</Text>
              </TouchableOpacity>

              <View style={styles.cardioSelectRow}>
                <Text style={styles.cardioQuickLabel}>Quick:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                  {cardioExercises.slice(0, 10).map((c) => {
                    const active = c.id === selectedCardioId;
                    return (
                      <Pressable
                        key={c.id}
                        style={[styles.cardioPill, active && styles.cardioPillActive]}
                        onPress={() => {
                          setSelectedCardioId(c.id);
                          recordRecentActivity(c.id);
                        }}
                      >
                        <Text style={[styles.cardioPillText, active && styles.cardioPillTextActive]}>
                          {c.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Duration & HR Zone Controls */}
              <View style={styles.cardioFormRow}>
                <View style={styles.cardioInputGroup}>
                  <Text style={styles.cardioInputLabel}>Duration (mins)</Text>
                  <TextInput
                    style={styles.cardioNumericInput}
                    value={cardioMinutesStr}
                    onChangeText={(val) => setCardioMinutesStr(val.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="20"
                    placeholderTextColor={CRIMSON_ONI.ashMuted}
                  />
                </View>

                <View style={styles.cardioInputGroup}>
                  <Text style={styles.cardioInputLabel}>Session RPE</Text>
                  <TouchableOpacity
                    style={styles.cardioRpeBtn}
                    onPress={() =>
                      setRpeSliderTarget({
                        mode: 'CARDIO',
                        currentRpe: cardioRpe,
                      })
                    }
                  >
                    <Text style={styles.cardioRpeText}>{cardioRpe.toFixed(1)}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.cardioInputGroup}>
                  <Text style={styles.cardioInputLabel}>HR Zone</Text>
                  <View style={styles.zoneRow}>
                    {HR_ZONES.map((z) => (
                      <Pressable
                        key={z}
                        style={[styles.zoneBtn, cardioZone === z && styles.zoneBtnActive]}
                        onPress={() => setCardioZone(z)}
                      >
                        <Text style={[styles.zoneText, cardioZone === z && styles.zoneTextActive]}>
                          Z{z}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.addCardioBtn} onPress={handleAddCardioEntry}>
                <Text style={styles.addCardioBtnText}>+ Log Segment</Text>
              </TouchableOpacity>
            </View>

            {/* Logged Cardio Items */}
            {offlineDraft.cardioEntries.map((item) => (
              <View key={item.id} style={styles.cardioEntryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardioEntryName}>{item.exerciseName}</Text>
                  <Text style={styles.cardioEntryMeta}>
                    {Math.round(item.durationSeconds / 60)} mins • Zone {item.averageHrZone}
                    {item.rpe ? ` • RPE ${item.rpe}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => handleRemoveCardioEntry(item.id)}>
                  <Text style={styles.cardioEntryDelete}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Finish Workout Action (Prominent Bottom Button) */}
        <View style={styles.presetSaveContainer}>
          <TouchableOpacity
            style={styles.finishWorkoutBottomBtn}
            onPress={handleFinishWorkout}
            activeOpacity={0.7}
            testID="finish-offline-workout-btn"
          >
            <Text style={styles.finishWorkoutBottomBtnText}>🏁 Finish Workout</Text>
          </TouchableOpacity>
        </View>

        {/* Preset Designer Modal */}
        <PresetDesignerModal
          visible={showPresetDesigner}
          editingPreset={editingPresetDraft}
          onSavePreset={(preset) => {
            savePreset(preset);
            setPresetSavedInSession(true);
            triggerSensoryCue('WORKOUT_PRESET_LOADED');
            Alert.alert('Preset Saved', `Routine "${preset.name}" has been saved.`);
          }}
          onDeletePreset={deletePreset}
          onClose={() => {
            setShowPresetDesigner(false);
            setEditingPresetDraft(null);
          }}
        />

        {/* Post-Workout Summary & Encouragement Modal */}
        <Modal
          visible={postWorkoutSummary !== null && !showPresetDesigner && !showShareReceipt}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setPostWorkoutSummary(null);
            onFinishAndReturn();
          }}
        >
          <View style={styles.postWorkoutOverlay}>
            <View style={styles.postWorkoutCard}>
              <View style={styles.postWorkoutHeader}>
                <Text style={styles.postWorkoutHeadline}>
                  {postWorkoutSummary?.headline}
                </Text>
                <Text style={styles.postWorkoutEncouragementText}>
                  {postWorkoutSummary?.encouragingMessage}
                </Text>
              </View>

              {postWorkoutSummary?.hasImprovements ? (
                <ScrollView
                  style={styles.improvementsScroll}
                  contentContainerStyle={styles.improvementsScrollContent}
                >
                  <Text style={styles.improvementsSectionTitle}>
                    LIFT PROGRESSION HIGHLIGHTS
                  </Text>
                  {postWorkoutSummary.improvements.map((imp) => (
                    <View key={imp.exerciseId} style={styles.improvementCard}>
                      <View style={styles.improvementCardLeft}>
                        <Text style={styles.improvementExName}>{imp.exerciseName}</Text>
                        <Text style={styles.improvementDetailText}>{imp.detailText}</Text>
                      </View>
                      <View style={styles.improvementCardRight}>
                        <Text style={styles.improvementTopSet}>{imp.topSetLabel}</Text>
                        <View
                          style={[
                            styles.improvementBadgePill,
                            imp.isAllTimePr && styles.prBadgePill,
                          ]}
                        >
                          <Text
                            style={[
                              styles.improvementBadgeText,
                              imp.isAllTimePr && styles.prBadgeText,
                            ]}
                          >
                            {imp.improvementBadge}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.effortStatsContainer}>
                  <View style={styles.effortStatPill}>
                    <Text style={styles.effortStatIcon}>🔥</Text>
                    <Text style={styles.effortStatValue}>
                      {postWorkoutSummary?.streakCount ?? 1} Session{(postWorkoutSummary?.streakCount ?? 1) === 1 ? '' : 's'}
                    </Text>
                    <Text style={styles.effortStatLabel}>Streak Sustained</Text>
                  </View>
                  <View style={styles.effortStatPill}>
                    <Text style={styles.effortStatIcon}>✓</Text>
                    <Text style={styles.effortStatValue}>
                      {postWorkoutSummary?.totalCompletedSets ?? 0} Sets
                    </Text>
                    <Text style={styles.effortStatLabel}>Completed</Text>
                  </View>
                  <View style={styles.effortStatPill}>
                    <Text style={styles.effortStatIcon}>💪</Text>
                    <Text style={styles.effortStatValue}>
                      {(postWorkoutSummary?.totalTonnageKg ?? 0) > 0
                        ? `${postWorkoutSummary?.totalTonnageKg}kg`
                        : 'Habit Banked'}
                    </Text>
                    <Text style={styles.effortStatLabel}>
                      {(postWorkoutSummary?.totalTonnageKg ?? 0) > 0 ? 'Total Tonnage' : 'Effort Logged'}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.postWorkoutActions}>
                <TouchableOpacity
                  style={styles.shareReceiptActionBtn}
                  onPress={() => {
                    triggerSensoryCue('SET_MICRO_REWARD_TICK');
                    setShowShareReceipt(true);
                  }}
                  activeOpacity={0.75}
                  testID="offline-post-workout-share-receipt-btn"
                >
                  <Text style={styles.shareReceiptActionBtnText}>
                    🧾 Share 9:16 Sanctum Receipt
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.postWorkoutSavePresetBtn,
                    presetSavedInSession && styles.postWorkoutSavePresetBtnSuccess,
                  ]}
                  onPress={() => {
                    if (sessionPresetTemplate) {
                      setEditingPresetDraft(sessionPresetTemplate);
                      setShowPresetDesigner(true);
                    }
                  }}
                  activeOpacity={0.7}
                  testID="post-workout-save-preset-btn"
                >
                  <Text
                    style={[
                      styles.postWorkoutSavePresetBtnText,
                      presetSavedInSession && styles.postWorkoutSavePresetBtnTextSuccess,
                    ]}
                  >
                    {presetSavedInSession
                      ? '✓ Routine Preset Saved'
                      : '💾 Save Session as Routine Preset'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.postWorkoutContinueBtn}
                  onPress={() => {
                    setPostWorkoutSummary(null);
                    onFinishAndReturn();
                  }}
                  activeOpacity={0.7}
                  testID="post-workout-continue-btn"
                >
                  <Text style={styles.postWorkoutContinueBtnText}>Continue →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Training History Matrix Page Modal */}
        <TrainingHistoryScreen
          visible={showTrainingHistory}
          onBack={() => setShowTrainingHistory(false)}
          onLoadSessionIntoWorkout={handleLoadSessionIntoWorkout}
        />
      </ScrollView>

      {/* Resistance Exercise Picker Modal */}
      <ActivityPickerModal
        visible={openExercisePickerBlockId !== null}
        onClose={() => setOpenExercisePickerBlockId(null)}
        onSelectExercise={(item) => {
          if (openExercisePickerBlockId) {
            handleSelectExercise(openExercisePickerBlockId, item.id);
          }
        }}
        currentExerciseId={
          openExercisePickerBlockId
            ? offlineDraft.exerciseBlocks.find((b) => b.blockId === openExercisePickerBlockId)?.exerciseId
            : null
        }
        targetWorkoutCategory="GYM"
        title="Select Resistance Exercise"
      />

      {/* Cardio / Sport / Recovery Activity Picker Modal */}
      <ActivityPickerModal
        visible={showCardioPicker}
        onClose={() => setShowCardioPicker(false)}
        onSelectExercise={(item) => {
          setSelectedCardioId(item.id);
          recordRecentActivity(item.id);
        }}
        currentExerciseId={selectedCardioId}
        targetWorkoutCategory={
          activeCategory === 'SPORT' ? 'SPORT' : activeCategory === 'RECOVERY' ? 'RECOVERY' : 'CARDIO'
        }
        title={
          activeCategory === 'SPORT'
            ? 'Select Sport Modality'
            : activeCategory === 'RECOVERY'
            ? 'Select Recovery & Mobility'
            : 'Select Cardio Training'
        }
      />

      {/* Center Rest Timer Popup Modal (proc'd on set completion) */}
      <Modal
        visible={!!(restTargetEndTimeMs && restCenterModalVisible)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRestCenterModalVisible(false)}
      >
        <Pressable
          style={styles.restModalBackdrop}
          onPress={() => setRestCenterModalVisible(false)}
        >
          <Pressable
            style={styles.restModalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <DynamicRestTimer
              targetEndTimeMs={restTargetEndTimeMs}
              totalDurationSeconds={restTotalSeconds}
              mode={restMode}
              headline={restHeadline}
              subtext={restSubtext}
              onAdjustDelta={handleRestAdjustDelta}
              onSkip={handleRestSkip}
              onComplete={handleRestComplete}
              variant="hero"
              onMinimize={() => setRestCenterModalVisible(false)}
              onSelectPreset={handleRestSelectPreset}
              recommendedSeconds={restRecommendedSec}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Inline Barbell Plate & Configurable Warm-Up Generator Modal */}
      {(() => {
        const targetBlk = platesModalBlockId
          ? offlineDraft.exerciseBlocks.find((b) => b.blockId === platesModalBlockId) ?? null
          : null;
        if (!targetBlk) return null;
        const bUnit = resolveBlockUnit(targetBlk);
        const exMeta = exercises.find((e) => e.id === targetBlk.exerciseId);
        const firstWorkRow = targetBlk.sets.find(
          (s) => !isWarmupSetType(s.setType, s.isWarmup) && Number(s.weightKgStr) > 0
        );
        const prevLookup = resolvePreviousExerciseSessionSets({
          exerciseId: targetBlk.exerciseId,
          workoutHistory,
          activeGymId,
        });
        const initialWorkingKg = firstWorkRow
          ? convertDisplayWeightToKg(Number(firstWorkRow.weightKgStr) || 0, bUnit)
          : prevLookup.workingSets[0]?.weightKg ?? 60;

        const savedBarKg = exerciseGymPreferences[targetBlk.exerciseId]?.barWeightKg;
        const eqSlug = `${exMeta?.equipmentType || ''} ${targetBlk.exerciseId}`.toLowerCase();
        const defaultBarKg =
          savedBarKg !== undefined
            ? savedBarKg
            : eqSlug.includes('landmine')
              ? 0
              : eqSlug.includes('smith')
                ? 10
                : 20;

        return (
          <PlatesAndWarmupModal
            visible={Boolean(targetBlk)}
            exerciseName={exMeta?.name ?? targetBlk.exerciseName ?? targetBlk.exerciseId}
            equipmentType={exMeta?.equipmentType}
            unit={bUnit}
            initialWorkingWeightKg={initialWorkingKg}
            barWeightKg={defaultBarKg}
            warmupPresetCount={warmupPresetCount}
            onSelectBarWeightKg={(barKg) => saveExerciseBarWeightKg(targetBlk.exerciseId, barKg)}
            onSelectWarmupPresetCount={setWarmupPresetCount}
            onInsertWarmupSets={(sets) =>
              handleInsertWarmupSets(targetBlk.blockId, sets, bUnit)
            }
            onClose={() => setPlatesModalBlockId(null)}
          />
        );
      })()}

      {/* Beginner-Friendly Metric Info `(i)` Tooltip Modal */}
      <MetricInfoTooltipModal
        metricKey={tooltipState?.key ?? null}
        contextualHeadline={tooltipState?.headline ?? null}
        contextualNote={tooltipState?.note ?? null}
        onClose={() => setTooltipState(null)}
      />

      {/* Vertical RPE Slider Modal */}
      <RpeVerticalSliderModal
        visible={rpeSliderTarget !== null}
        initialRpe={rpeSliderTarget?.currentRpe ?? 8.5}
        subtitle={
          rpeSliderTarget?.mode === 'CARDIO'
            ? 'Adjust Cardio Session RPE'
            : rpeSliderTarget?.subtitle
        }
        onSelectRpe={(nextRpe) => {
          if (!rpeSliderTarget) return;
          if (rpeSliderTarget.mode === 'SET') {
            handleSetRpeValue(rpeSliderTarget.blockId, rpeSliderTarget.setId, nextRpe);
          } else {
            setCardioRpe(nextRpe);
          }
        }}
        onClose={() => setRpeSliderTarget(null)}
      />

      {/* Shareable 9:16 Post-Workout Sanctum Receipt Modal */}
      <ShareableWorkoutReceiptModal
        visible={showShareReceipt && lastCompletedWorkout !== null}
        workout={lastCompletedWorkout}
        summary={postWorkoutSummary}
        initialUnit={defaultWeightUnit}
        streakFallback={consistencyStreak + 1}
        onClose={() => setShowShareReceipt(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#121114',
  },
  shareReceiptActionBtn: {
    backgroundColor: '#292214',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareReceiptActionBtnText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#19181D',
    borderBottomWidth: 1,
    borderBottomColor: '#2B2930',
  },
  topBarLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  topBarGymBtn: {
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1D222B',
    borderColor: '#38BDF8',
    borderWidth: 1,
    maxWidth: 108,
  },
  topBarGymText: {
    color: '#BAE6FD',
    fontSize: 10,
    fontWeight: '800',
  },
  topBarHistoryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#2D2316',
    borderColor: '#C69A45',
    borderWidth: 1,
  },
  topBarHistoryText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '800',
  },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#26242B',
  },
  backBtnText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '700',
  },
  sessionTimerCenter: {
    alignItems: 'center',
  },
  sessionClock: {
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    color: '#E8E6E1',
    letterSpacing: 0.5,
  },
  savedStatusText: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '700',
  },
  finishTopBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#5E1924',
    borderWidth: 1,
    borderColor: '#C69A45',
  },
  finishTopBtnText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  validationBox: {
    backgroundColor: '#2F1A1C',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  validationText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '700',
  },
  modalitySection: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeadingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHistoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#2D2316',
    borderColor: '#C69A45',
    borderWidth: 1,
  },
  sectionHistoryPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FDE68A',
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C69A45',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCountMeta: {
    fontSize: 11,
    color: '#7A787D',
    fontWeight: '700',
  },
  pinnedRestContainer: {
    position: 'absolute',
    top: 56,
    left: 12,
    right: 12,
    zIndex: 50,
    elevation: 8,
  },
  scrollContentWithPinnedTimer: {
    paddingTop: 68,
  },
  restModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 18, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  restModalCard: {
    width: '100%',
    maxWidth: 420,
  },
  exerciseCard: {
    backgroundColor: '#1C1B20',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  exerciseCardLinkedNext: {
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 6,
  },
  exerciseCardLinkedPrev: {
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
  supersetBanner: {
    backgroundColor: '#382810',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  supersetBannerText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C69A45',
    letterSpacing: 0.5,
  },
  exerciseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  exerciseSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#25232A',
    borderColor: '#3D3A44',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  exerciseSelectorText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E8E6E1',
    flex: 1,
  },
  exerciseSelectorCaret: {
    fontSize: 10,
    color: '#9CA3AF',
    marginLeft: 6,
  },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  e1rmInlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  prevSessionHintText: {
    fontSize: 10,
    color: '#C69A45',
    fontWeight: '700',
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reorderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  reorderBtn: {
    width: 22,
    height: 24,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#3E3A4B',
    backgroundColor: '#23202B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnDisabled: {
    opacity: 0.35,
  },
  reorderBtnText: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '900',
  },
  ergonomicsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  overloadPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  overloadTargetPill: {
    backgroundColor: '#1E2723',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 1,
  },
  overloadTargetPillCrit: {
    backgroundColor: '#2B2214',
    borderColor: '#C69A45',
  },
  overloadTargetText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '900',
  },
  ergonomicsRightTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 'auto',
  },
  platesHelperBtn: {
    backgroundColor: '#1D2430',
    borderColor: '#38BDF8',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  platesHelperBtnText: {
    color: '#7DD3FC',
    fontSize: 10,
    fontWeight: '800',
  },
  unitTogglePill: {
    backgroundColor: '#24222F',
    borderColor: '#4A4658',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    minWidth: 34,
    alignItems: 'center',
  },
  unitTogglePillImperial: {
    borderColor: '#C69A45',
    backgroundColor: '#332716',
  },
  unitTogglePillText: {
    color: '#E5E7EB',
    fontSize: 10,
    fontWeight: '900',
  },
  linkSupersetBtn: {
    backgroundColor: '#2A282F',
    borderColor: '#4A4652',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  linkSupersetBtnActive: {
    backgroundColor: '#3E2E10',
    borderColor: '#C69A45',
  },
  linkSupersetBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  linkSupersetBtnTextActive: {
    color: '#FCD34D',
    fontWeight: '800',
  },
  removeBlockBtn: {
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  removeBlockBtnText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '800',
  },
  setTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2B2836',
    marginBottom: 6,
  },
  colHeaderWithInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  colHeader: {
    fontSize: 9,
    fontWeight: '800',
    color: '#8A8794',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  colInput: {
    flex: 1,
    textAlign: 'center',
  },
  colCheck: {
    width: 38,
    textAlign: 'center',
  },
  colDeleteSpacer: {
    width: 18,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
  },
  setRowCompleted: {
    opacity: 0.85,
  },
  dropSetRowIndent: {
    paddingLeft: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#EF4444',
    backgroundColor: '#241719',
    borderRadius: 6,
  },
  setTypeBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22202B',
  },
  setTypeBtnText: {
    fontSize: 11,
    fontWeight: '900',
  },
  prevSetPill: {
    width: 58,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#343140',
    backgroundColor: '#1B1922',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  prevSetPillEmpty: {
    opacity: 0.45,
  },
  prevSetMainText: {
    color: '#D1D5DB',
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  prevSetSubText: {
    color: '#9CA3AF',
    fontSize: 8,
    fontWeight: '700',
    marginTop: -1,
  },
  prevSetEmptyText: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
  },
  numericInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#25232F',
    borderColor: '#383545',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 3,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  numericInputCompleted: {
    backgroundColor: '#172722',
    borderColor: '#10B981',
  },
  rpePillBtn: {
    width: 44,
    height: 36,
    backgroundColor: '#23212C',
    borderColor: '#3A3749',
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FDE68A',
  },
  checkBtn: {
    width: 38,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#23212C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBtnCompleted: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  checkBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  checkBtnTextCompleted: {
    color: '#FFFFFF',
  },
  deleteSetBtn: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteSetText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  addSetRowBtn: {
    marginTop: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#383446',
    backgroundColor: '#22202B',
    alignItems: 'center',
  },
  addSetRowText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C69A45',
  },
  addExerciseBlockBtn: {
    backgroundColor: '#24222A',
    borderColor: '#3D3A44',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  addExerciseBlockText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E8E6E1',
  },
  cardioCard: {
    backgroundColor: '#1C1B20',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardioSelectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardioBrowseBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#2D2316',
    borderColor: '#C69A45',
    borderWidth: 1,
  },
  cardioBrowseBtnText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '800',
  },
  cardioSelectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#232128',
    borderColor: '#38BDF8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  cardioSelectedName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  cardioSelectedSub: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 2,
  },
  cardioSelectedChangeIcon: {
    fontSize: 14,
    marginLeft: 8,
  },
  cardioSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardioQuickLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8A8890',
    marginRight: 6,
    alignSelf: 'center',
  },
  cardioLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    marginRight: 8,
  },
  cardioPill: {
    backgroundColor: '#25232A',
    borderColor: '#3D3A44',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  cardioPillActive: {
    backgroundColor: '#38BDF822',
    borderColor: '#38BDF8',
  },
  cardioPillText: {
    fontSize: 11,
    color: '#D1D5DB',
  },
  cardioPillTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  cardioFormRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  cardioInputGroup: {
    flex: 1,
  },
  cardioInputLabel: {
    fontSize: 10,
    color: '#8A8890',
    fontWeight: '700',
    marginBottom: 4,
  },
  cardioNumericInput: {
    backgroundColor: '#151418',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    color: '#E8E6E1',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardioRpeBtn: {
    backgroundColor: '#151418',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  cardioRpeText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '800',
  },
  zoneRow: {
    flexDirection: 'row',
    gap: 2,
  },
  zoneBtn: {
    flex: 1,
    backgroundColor: '#151418',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 5,
    alignItems: 'center',
  },
  zoneBtnActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#0284C7',
  },
  zoneText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '800',
  },
  zoneTextActive: {
    color: '#0F172A',
  },
  addCardioBtn: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  addCardioBtnText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
  },
  cardioEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1B20',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  cardioEntryName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E8E6E1',
  },
  cardioEntryMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  cardioEntryDelete: {
    fontSize: 12,
    color: '#EF4444',
    padding: 4,
  },
  presetSaveContainer: {
    marginTop: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  finishWorkoutBottomBtn: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#C69A45',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  finishWorkoutBottomBtnText: {
    color: '#FDE68A',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  savePresetBtn: {
    backgroundColor: '#26242B',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
    alignItems: 'center',
  },
  savePresetBtnText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
  },
  postWorkoutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  postWorkoutCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#1C1B20',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#C69A45',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  postWorkoutHeader: {
    marginBottom: 14,
    alignItems: 'center',
  },
  postWorkoutHeadline: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FDE68A',
    textAlign: 'center',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  postWorkoutEncouragementText: {
    fontSize: 13,
    color: '#D1D5DB',
    textAlign: 'center',
    lineHeight: 18,
  },
  improvementsScroll: {
    maxHeight: 220,
    marginVertical: 10,
  },
  improvementsScrollContent: {
    gap: 8,
  },
  improvementsSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C69A45',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  improvementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#26242B',
    borderColor: '#3D3A44',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  improvementCardLeft: {
    flex: 1,
    marginRight: 8,
  },
  improvementExName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F3F4F6',
  },
  improvementDetailText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  improvementCardRight: {
    alignItems: 'flex-end',
  },
  improvementTopSet: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E5E7EB',
    marginBottom: 4,
  },
  improvementBadgePill: {
    backgroundColor: '#382810',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  improvementBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FDE68A',
  },
  prBadgePill: {
    backgroundColor: '#4A1D24',
    borderColor: '#EF4444',
  },
  prBadgeText: {
    color: '#FCA5A5',
  },
  effortStatsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 14,
  },
  effortStatPill: {
    flex: 1,
    backgroundColor: '#26242B',
    borderColor: '#3D3A44',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  effortStatIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  effortStatValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FDE68A',
    textAlign: 'center',
  },
  effortStatLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
    textAlign: 'center',
  },
  postWorkoutActions: {
    marginTop: 14,
    gap: 10,
  },
  postWorkoutSavePresetBtn: {
    backgroundColor: '#26242B',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  postWorkoutSavePresetBtnSuccess: {
    backgroundColor: '#1E3A2F',
    borderColor: '#10B981',
  },
  postWorkoutSavePresetBtnText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '800',
  },
  postWorkoutSavePresetBtnTextSuccess: {
    color: '#6EE7B7',
  },
  postWorkoutContinueBtn: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  postWorkoutContinueBtnText: {
    color: '#FDE68A',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
