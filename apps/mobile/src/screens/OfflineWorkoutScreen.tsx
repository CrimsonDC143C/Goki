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
} from '@gymify/game-engine';
import { useGame } from '../state/GameContext';
import { CRIMSON_ONI } from '../theme';
import { WorkoutCategoryGateway } from '../components/WorkoutCategoryGateway';
import { DynamicRestTimer } from '../components/DynamicRestTimer';
import { PresetDesignerModal } from '../components/PresetDesignerModal';
import { ActivityPickerModal } from '../components/ActivityPickerModal';
import { TrainingHistoryScreen } from './TrainingHistoryScreen';
import { triggerSensoryCue } from '../utils/sensoryFeedback';
import { cancelRestTimerNotification, requestNotificationPermissions } from '../utils/restNotifications';
import { OfflineDraftExerciseBlock } from '../utils/offlineStorage';

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
    exercises,
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
  const [sessionPresetTemplate, setSessionPresetTemplate] = useState<WorkoutPresetDefinition | null>(null);
  const [editingPresetDraft, setEditingPresetDraft] = useState<WorkoutPresetDefinition | null>(null);
  const [presetSavedInSession, setPresetSavedInSession] = useState<boolean>(false);

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
    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: prev.exerciseBlocks.map((b) =>
        b.blockId === blockId
          ? { ...b, exerciseId, exerciseName: ex?.name ?? exerciseId }
          : b
      ),
    }));
    recordRecentActivity(exerciseId);
    setOpenExercisePickerBlockId(null);
    setExerciseSearchQuery('');
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
    let completedRow: { setType?: SetType; isWarmup?: boolean; rpe?: number | null } | null = null;
    let completedBlock: { exerciseId: string } | null = null;

    const nextBlocks = offlineDraft.exerciseBlocks.map((b) => {
      if (b.blockId !== blockId) return b;
      completedBlock = b;
      return {
        ...b,
        sets: b.sets.map((s) => {
          if (s.id === setId) {
            justCompleted = !s.completed;
            completedRow = s;
            return { ...s, completed: !s.completed };
          }
          return s;
        }),
      };
    });

    updateOfflineDraft((prev) => ({
      ...prev,
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

  const handleCycleSetRpe = (blockId: string, setId: string, currentRpe: number | null | undefined) => {
    const effective = currentRpe ?? 8.0;
    const nextIdx = (RPE_OPTIONS.indexOf(effective as 8.0) + 1) % RPE_OPTIONS.length;
    const nextRpe = RPE_OPTIONS[nextIdx] ?? 8.0;

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
          return {
            ...b,
            sets: [
              ...b.sets,
              {
                id: `set_${stamp}`,
                weightKgStr: lastRow?.weightKgStr ?? '60',
                repsStr: lastRow?.repsStr ?? '8',
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

    updateOfflineDraft((prev) => ({
      ...prev,
      exerciseBlocks: [
        ...prev.exerciseBlocks,
        {
          blockId: `blk_${stamp}`,
          exerciseId: nextId,
          exerciseName: nextExercise?.name ?? nextId,
          sets: [
            {
              id: `set_${stamp}_1`,
              weightKgStr: '60',
              repsStr: '8',
              isWarmup: false,
              setType: 'NORMAL',
              rpe: 8.5,
              completed: false,
            },
          ],
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
      const completedRows = block.sets.filter((s) => s.completed && (Number(s.repsStr) || 0) > 0);
      if (completedRows.length > 0) {
        historyExercises.push({
          exerciseId: block.exerciseId,
          exerciseName: block.exerciseName || block.exerciseId,
          sets: completedRows.map((s, idx) => ({
            setNumber: idx + 1,
            weightKg: Math.max(0, Number(s.weightKgStr) || 0),
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
      source: 'OFFLINE',
      performedAtIso: new Date(nowMs).toISOString(),
      durationSeconds: sessionElapsedSec,
      workoutCategory: offlineDraft.category ?? 'GYM',
      workoutType: 'HYBRID',
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
          const completedSets = b.sets.filter((s) => s.completed && (Number(s.repsStr) || 0) > 0);
          const chosenSets = completedSets.length > 0 ? completedSets : b.sets;
          return {
            blockId: b.blockId,
            exerciseSlug: b.exerciseId,
            exerciseName: b.exerciseName || b.exerciseId,
            supersetGroupId: b.supersetGroupId ?? undefined,
            sets: chosenSets.map((s) => ({
              targetWeightKg: Math.max(0, Number(s.weightKgStr) || 0),
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
              const pickerOpen = openExercisePickerBlockId === block.blockId;
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

                    {/* Exercise Selector Row */}
                    <View style={styles.exerciseCardHeader}>
                      <Pressable
                        style={styles.exerciseSelectorBtn}
                        onPress={() => setOpenExercisePickerBlockId(block.blockId)}
                      >
                        <Text style={styles.exerciseSelectorText}>
                          {exMeta?.name ?? block.exerciseName ?? block.exerciseId}
                        </Text>
                        <Text style={styles.exerciseSelectorCaret}>🔍 ▼</Text>
                      </Pressable>

                      <View style={styles.cardHeaderActions}>
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
                            {isGrouped ? 'Superset' : '🔗 Link'}
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

                  {/* Table Column Headers */}
                  <View style={styles.setTableHeader}>
                    <Text style={[styles.colHeader, { width: 44 }]}>TYPE</Text>
                    <Text style={[styles.colHeader, styles.colInput]}>KG</Text>
                    <Text style={[styles.colHeader, styles.colInput]}>REPS</Text>
                    <Text style={[styles.colHeader, { width: 52 }]}>RPE</Text>
                    <Text style={[styles.colHeader, styles.colCheck]}>DONE</Text>
                    {block.sets.length > 1 && <View style={styles.colDeleteSpacer} />}
                  </View>

                  {/* Set Rows */}
                  {block.sets.map((row) => {
                    const rowSetType = row.setType || (row.isWarmup ? 'WARMUP' : 'NORMAL');
                    const badgeDesc = SET_TYPE_DESCRIPTORS.find((d) => d.type === rowSetType);
                    const tagColor = SET_TYPE_COLORS[rowSetType] || '#9CA3AF';
                    const code = badgeDesc?.shortCode || 'N';

                    return (
                      <View
                        key={row.id}
                        style={[
                          styles.setRow,
                          row.completed && styles.setRowCompleted,
                          rowSetType === 'DROP_SET' && styles.dropSetRowIndent,
                        ]}
                      >
                        {/* Cycle Set Type Button [N/W/D/F] */}
                        <TouchableOpacity
                          style={[styles.setTypeBtn, { borderColor: tagColor }]}
                          onPress={() => handleCycleSetType(block.blockId, row.id)}
                        >
                          <Text style={[styles.setTypeBtnText, { color: tagColor }]}>
                            [{code}]
                          </Text>
                        </TouchableOpacity>

                        {/* Weight Input */}
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
                          placeholder="0"
                          placeholderTextColor={CRIMSON_ONI.ashMuted}
                          selectTextOnFocus
                        />

                        {/* Reps Input */}
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
                          placeholder="0"
                          placeholderTextColor={CRIMSON_ONI.ashMuted}
                          selectTextOnFocus
                        />

                        {/* RPE Pill Button */}
                        <TouchableOpacity
                          style={styles.rpePillBtn}
                          onPress={() => handleCycleSetRpe(block.blockId, row.id, row.rpe)}
                        >
                          <Text style={styles.rpePillText}>
                            {row.rpe ? `${row.rpe}` : '8.5'}
                          </Text>
                        </TouchableOpacity>

                        {/* Checkbox */}
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
                    onPress={() => {
                      const idx = (RPE_OPTIONS.indexOf(cardioRpe as 7.5) + 1) % RPE_OPTIONS.length;
                      setCardioRpe(RPE_OPTIONS[idx] ?? 7.5);
                    }}
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
          visible={postWorkoutSummary !== null && !showPresetDesigner}
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
    </View>
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
  topBarLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    alignItems: 'center',
    marginBottom: 10,
  },
  exerciseSelectorBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#25232A',
    borderColor: '#3D3A44',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
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
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkSupersetBtn: {
    backgroundColor: '#2A282F',
    borderColor: '#4A4652',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
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
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  removeBlockBtnText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '800',
  },
  exercisePickerContainer: {
    backgroundColor: '#161519',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  exerciseSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#201E25',
    borderColor: '#3D3A44',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  exerciseSearchInput: {
    flex: 1,
    color: '#E8E6E1',
    fontSize: 12,
    paddingVertical: 6,
  },
  exerciseSearchClearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  exerciseSearchClearText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  exercisePickerScroll: {
    maxHeight: 220,
  },
  exercisePickerScrollContent: {
    gap: 6,
    paddingVertical: 2,
  },
  exerciseOptionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#222027',
  },
  exerciseOptionPillActive: {
    backgroundColor: '#5E1924',
    borderColor: '#C69A45',
    borderWidth: 1,
  },
  exerciseOptionText: {
    fontSize: 12,
    color: '#D1D5DB',
    flex: 1,
  },
  exerciseOptionTextActive: {
    color: '#FEE2E2',
    fontWeight: '800',
  },
  exerciseOptionCheck: {
    color: '#FCD34D',
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 6,
  },
  exerciseNoResults: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  exerciseNoResultsText: {
    color: '#6B7280',
    fontSize: 12,
    fontStyle: 'italic',
  },
  setTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  colHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  colInput: {
    flex: 1,
    textAlign: 'center',
  },
  colCheck: {
    width: 36,
    textAlign: 'center',
  },
  colDeleteSpacer: {
    width: 20,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  setRowCompleted: {
    opacity: 0.85,
  },
  dropSetRowIndent: {
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#EF4444',
  },
  setTypeBtn: {
    width: 44,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: '#17161A',
  },
  setTypeBtnText: {
    fontSize: 10,
    fontWeight: '900',
  },
  numericInput: {
    flex: 1,
    backgroundColor: '#151418',
    borderColor: '#36343C',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 6,
    color: '#E8E6E1',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  numericInputCompleted: {
    backgroundColor: '#1E231D',
    borderColor: '#2F4F38',
  },
  rpePillBtn: {
    width: 52,
    backgroundColor: '#24222A',
    borderColor: '#3C3945',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 5,
    alignItems: 'center',
  },
  rpePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C69A45',
  },
  checkBtn: {
    width: 36,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A4652',
    backgroundColor: '#232128',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBtnCompleted: {
    backgroundColor: '#15803D',
    borderColor: '#22C55E',
  },
  checkBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: 'transparent',
  },
  checkBtnTextCompleted: {
    color: '#FFFFFF',
  },
  deleteSetBtn: {
    width: 20,
    alignItems: 'center',
  },
  deleteSetText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '800',
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
