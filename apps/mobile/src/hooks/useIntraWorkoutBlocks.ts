import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder } from 'react-native';
import {
  CompletedWorkoutRecord,
  ExerciseGymPreferenceMap,
  GeneratedWarmupSet,
  SetTransitionResolution,
  SetType,
  SupersetBlockBadge,
  WeightUnit,
  WorkoutCategory,
  computeSupersetDisplayLabels,
  convertDisplayWeightToKg,
  convertKgToDisplayWeight,
  cycleSetType,
  formatCleanWeightNumber,
  isWarmupSetType,
  resolveExerciseWeightUnit,
  resolveGhostRowForSetOrder,
  resolvePreviousExerciseSessionSets,
  resolveSetCompletionTransition,
} from '@goki/game-engine';
import { ExerciseCatalogItem } from '../state/GameContext';
import { OfflineDraftExerciseBlock, OfflineDraftSetRow } from '../utils/offlineStorage';
import { triggerSensoryCue } from '../utils/sensoryFeedback';

export type { OfflineDraftExerciseBlock, OfflineDraftSetRow, WorkoutCategory };

export type ExerciseMetadata = Pick<ExerciseCatalogItem, 'id' | 'name'> &
  Partial<Omit<ExerciseCatalogItem, 'id' | 'name'>>;

export type ExerciseGymPreferencesMap = ExerciseGymPreferenceMap;

export type SaveExerciseWeightUnitFn =
  | ((exerciseId: string, gymId: string, unit: WeightUnit) => void)
  | ((params: {
      exerciseId: string;
      unit: WeightUnit;
      activeGymId?: string | null;
      activeGymName?: string | null;
    }) => void);

export interface IntraWorkoutSetLoggedContext {
  blockId: string;
  setId: string;
  block: OfflineDraftExerciseBlock;
  set: OfflineDraftSetRow;
  setIndex: number;
  exerciseId: string;
  exerciseName: string;
  canonicalWeightKg: number;
  displayWeight: number;
  reps: number;
  rpe: number;
  setType: SetType;
  isWarmup: boolean;
  blockUnit: WeightUnit;
  supersetGroupId: string | null | undefined;
  shouldDeferSupersetRest: boolean;
  hasRemainingSets: boolean;
  transition: SetTransitionResolution;
  nextBlocks: OfflineDraftExerciseBlock[];
}

export interface IntraWorkoutSetUnloggedContext {
  blockId: string;
  setId: string;
  block: OfflineDraftExerciseBlock;
  set: OfflineDraftSetRow;
  setIndex: number;
  exerciseId: string;
  exerciseName: string;
  canonicalWeightKg: number;
  displayWeight: number;
  reps: number;
  rpe: number;
  setType: SetType;
  isWarmup: boolean;
  blockUnit: WeightUnit;
  supersetGroupId: string | null | undefined;
  reason: 'UNCHECK_SET' | 'REMOVE_SET_ROW' | 'REMOVE_EXERCISE_BLOCK';
  nextBlocks: OfflineDraftExerciseBlock[];
}

export interface IntraWorkoutSetUpdatedContext {
  blockId: string;
  setId: string;
  block: OfflineDraftExerciseBlock;
  set: OfflineDraftSetRow;
  setIndex: number;
  exerciseId: string;
  exerciseName: string;
  canonicalWeightKg: number;
  displayWeight: number;
  reps: number;
  rpe: number;
  setType: SetType;
  isWarmup: boolean;
  blockUnit: WeightUnit;
  supersetGroupId: string | null | undefined;
  reason: 'UPDATE_FIELD' | 'SET_RPE' | 'CYCLE_SET_TYPE' | 'COPY_PREV' | 'SELECT_EXERCISE' | 'DESIGNATE_SET_TYPE';
}

export interface ConvertCompletedSessionToBlocksParams {
  workout: CompletedWorkoutRecord;
  exerciseGymPreferences: ExerciseGymPreferencesMap;
  activeGymId: string;
  defaultWeightUnit: WeightUnit;
  nowMs?: number;
}

/**
 * Pure helper for converting a completed workout history record into editable
 * intra-workout exercise blocks with explicit `weightUnit` and zero-drift `canonicalWeightKg`.
 */
export function convertCompletedSessionToBlocks(
  params: ConvertCompletedSessionToBlocksParams
): OfflineDraftExerciseBlock[] {
  const {
    workout,
    exerciseGymPreferences,
    activeGymId,
    defaultWeightUnit,
    nowMs = Date.now(),
  } = params;

  return (workout.exercises || []).map((ex, bIdx) => {
    const blockUnit = resolveExerciseWeightUnit(
      exerciseGymPreferences,
      ex.exerciseId,
      activeGymId,
      defaultWeightUnit
    );
    return {
      blockId: `blk_hist_${nowMs}_${bIdx + 1}`,
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName || ex.exerciseId,
      supersetGroupId: null,
      weightUnit: blockUnit,
      sets: (ex.sets || []).map((s, sIdx) => {
        const canonKg = s.weightKg ?? 0;
        const displayW =
          canonKg > 0
            ? formatCleanWeightNumber(convertKgToDisplayWeight(canonKg, blockUnit))
            : '0';
        return {
          id: `set_hist_${nowMs}_${bIdx + 1}_${sIdx + 1}`,
          weightKgStr: displayW,
          canonicalWeightKg: canonKg,
          repsStr: String(s.reps ?? 0),
          isWarmup: s.setType === 'WARMUP' || Boolean(s.isWarmup),
          setType: s.setType || 'NORMAL',
          rpe: s.rpe ?? 8.5,
          supersetGroupId: null,
          completed: false,
        } as OfflineDraftSetRow;
      }),
    };
  });
}

export interface UseIntraWorkoutBlocksOptions {
  blocks: OfflineDraftExerciseBlock[];
  setBlocks: (
    updater: (prev: OfflineDraftExerciseBlock[]) => OfflineDraftExerciseBlock[]
  ) => void;
  orderedSegments: WorkoutCategory[];
  onReorderSegments: (nextOrder: WorkoutCategory[]) => void;
  resistanceExercises: readonly ExerciseMetadata[];
  /** Optional full exercise catalog fallback for resolving exercise names during swap */
  allExercises?: readonly ExerciseMetadata[];
  /** Optional workout history for resolving previous session sets and ghost auto-fill */
  workoutHistory?: readonly CompletedWorkoutRecord[];
  activeGymId: string;
  activeGymName?: string | null;
  defaultWeightUnit: WeightUnit;
  exerciseGymPreferences: ExerciseGymPreferencesMap;
  saveExerciseWeightUnit: SaveExerciseWeightUnitFn;
  recordRecentActivity?: (exerciseId: string) => void;
  onValidationError?: (msg: string | null) => void;
  /** Optional fallback exercise ID when adding a block and catalog is empty */
  fallbackExerciseId?: string;
  /** Optional callback fired when drag-hold begins on a block card (e.g. close block menu) */
  onBlockDragActivate?: (blockId: string) => void;
  /** Optional callback fired when an exercise is selected in a block (e.g. close picker modal) */
  onExerciseSelected?: (blockId: string, exerciseId: string) => void;
  onSetLogged?: (ctx: IntraWorkoutSetLoggedContext) => void;
  onSetUnlogged?: (ctx: IntraWorkoutSetUnloggedContext) => void;
  onSetUpdated?: (ctx: IntraWorkoutSetUpdatedContext) => void;
}

export interface UseIntraWorkoutBlocksReturn {
  resolveBlockUnit: (block: OfflineDraftExerciseBlock) => WeightUnit;
  supersetLabels: Record<string, SupersetBlockBadge>;
  supersetBadges: Record<string, SupersetBlockBadge>;
  supersetMemberLabels: Record<string, string>;
  completedSetCount: number;

  // Press-and-Hold Drag-to-Reorder State & Handlers
  draggingBlockId: string | null;
  draggingSegment: WorkoutCategory | null;
  isHoldingDragTarget: boolean;
  isDraggingAny: boolean;
  blockDragAnimY: Animated.Value;
  segmentDragAnimY: Animated.Value;
  blockHeightsRef: React.MutableRefObject<Record<string, number>>;
  segmentHeightsRef: React.MutableRefObject<Record<string, number>>;
  onBlockLayout: (blockId: string, event: LayoutChangeEvent) => void;
  onSegmentLayout: (segmentCategory: WorkoutCategory, event: LayoutChangeEvent) => void;
  getBlockPanHandlers: (blockId: string) => ReturnType<typeof PanResponder.create>['panHandlers'];
  getSegmentPanHandlers: (
    segmentCategory: WorkoutCategory
  ) => ReturnType<typeof PanResponder.create>['panHandlers'];
  clearDragHoldTimer: () => void;
  clearActiveDragState: () => void;

  // Intra-Workout Exercise Block & Set Row Handlers
  handleAddExerciseBlock: () => void;
  handleRemoveExerciseBlock: (blockId: string) => void;
  handleSelectExercise: (blockId: string, exerciseId: string) => void;
  handleAddSetRow: (blockId: string) => void;
  handleRemoveSetRow: (blockId: string, setId: string) => void;
  handleUpdateSetField: (
    blockId: string,
    setId: string,
    field: 'weightKgStr' | 'repsStr',
    value: string
  ) => void;
  handleToggleSetCompleted: (blockId: string, setId: string) => void;
  handleCycleSetType: (blockId: string, setId: string) => void;
  handleSetOrAppendDesignation: (blockId: string, targetType: SetType) => void;
  handleSetRpeValue: (blockId: string, setId: string, nextRpe: number) => void;
  handleToggleBlockWeightUnit: (blockId: string) => void;
  handleApplyOverloadTarget: (
    blockId: string,
    targetDisplayWeight: number,
    targetReps: number,
    targetRpe: number,
    unit: WeightUnit
  ) => void;
  handleCopyPrevToRow: (
    blockId: string,
    setId: string,
    displayWeightStr: string,
    repsStr: string,
    rpe: number | null
  ) => void;
  handleInsertWarmupSets: (
    blockId: string,
    warmupSets: GeneratedWarmupSet[],
    unitOrTargetWorkingWeight?: WeightUnit | number,
    targetWorkingWeightDisplay?: number
  ) => void;
  handleToggleSupersetLink: (blockIndex: number) => void;
  handleToggleSuperset: (blockIndex: number) => void;
  convertSessionToBlocks: (
    workout: CompletedWorkoutRecord,
    nowMs?: number
  ) => OfflineDraftExerciseBlock[];
}

function getRowCanonicalWeightKg(row: OfflineDraftSetRow, unit: WeightUnit): number {
  const existingCanon = (row as OfflineDraftSetRow & { canonicalWeightKg?: number })
    .canonicalWeightKg;
  if (typeof existingCanon === 'number' && Number.isFinite(existingCanon)) {
    return existingCanon;
  }
  const parsedDisplayWeight = Math.max(0, Number(row.weightKgStr) || 0);
  return convertDisplayWeightToKg(parsedDisplayWeight, unit);
}

function invokeSaveExerciseWeightUnit(
  fn: SaveExerciseWeightUnitFn,
  exerciseId: string,
  activeGymId: string,
  activeGymName: string | null | undefined,
  unit: WeightUnit
): void {
  if (fn.length >= 2) {
    (fn as (exId: string, gId: string, u: WeightUnit) => void)(exerciseId, activeGymId, unit);
  } else {
    (
      fn as (params: {
        exerciseId: string;
        unit: WeightUnit;
        activeGymId?: string | null;
        activeGymName?: string | null;
      }) => void
    )({
      exerciseId,
      unit,
      activeGymId,
      activeGymName,
    });
  }
}

export function useIntraWorkoutBlocks(
  options: UseIntraWorkoutBlocksOptions
): UseIntraWorkoutBlocksReturn {
  const {
    blocks,
    setBlocks,
    orderedSegments,
    onReorderSegments,
    resistanceExercises,
    allExercises,
    workoutHistory = [],
    activeGymId,
    activeGymName,
    defaultWeightUnit,
    exerciseGymPreferences,
    saveExerciseWeightUnit,
    recordRecentActivity,
    onValidationError,
    fallbackExerciseId = 'bench_press',
    onBlockDragActivate,
    onExerciseSelected,
    onSetLogged,
    onSetUnlogged,
    onSetUpdated,
  } = options;

  // Press-and-Hold Vertical Drag-to-Reorder State (Exercise Cards & Workout Segments)
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [draggingSegment, setDraggingSegment] = useState<WorkoutCategory | null>(null);
  const [isHoldingDragTarget, setIsHoldingDragTarget] = useState<boolean>(false);

  const blockDragAnimY = useRef(new Animated.Value(0)).current;
  const segmentDragAnimY = useRef(new Animated.Value(0)).current;
  const blockHeightsRef = useRef<Record<string, number>>({});
  const segmentHeightsRef = useRef<Record<string, number>>({});
  const dragSwapOffsetRef = useRef<number>(0);
  const dragHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDragBlockIdRef = useRef<string | null>(null);
  const activeDragSegmentRef = useRef<WorkoutCategory | null>(null);

  const orderedSegmentsRef = useRef<WorkoutCategory[]>(orderedSegments);
  orderedSegmentsRef.current = orderedSegments;

  const exerciseBlocksRef = useRef<OfflineDraftExerciseBlock[]>(blocks);
  exerciseBlocksRef.current = blocks;

  const setBlocksRef = useRef(setBlocks);
  setBlocksRef.current = setBlocks;

  const onReorderSegmentsRef = useRef(onReorderSegments);
  onReorderSegmentsRef.current = onReorderSegments;

  const onBlockDragActivateRef = useRef(onBlockDragActivate);
  onBlockDragActivateRef.current = onBlockDragActivate;

  const blockPanRespondersRef = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const segmentPanRespondersRef = useRef<
    Partial<Record<WorkoutCategory, ReturnType<typeof PanResponder.create>>>
  >({});

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

  // Superset display badges and compact member label map (e.g. 'A1', 'A2')
  const supersetLabels = useMemo(() => computeSupersetDisplayLabels(blocks), [blocks]);

  const supersetMemberLabels = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const [blkId, badge] of Object.entries(supersetLabels)) {
      map[blkId] = badge.memberLabel;
    }
    return map;
  }, [supersetLabels]);

  const completedSetCount = useMemo(
    () => blocks.reduce((sum, blk) => sum + blk.sets.filter((s) => s.completed).length, 0),
    [blocks]
  );

  const clearDragHoldTimer = useCallback(() => {
    if (dragHoldTimerRef.current) {
      clearTimeout(dragHoldTimerRef.current);
      dragHoldTimerRef.current = null;
    }
    if (!activeDragBlockIdRef.current && !activeDragSegmentRef.current) {
      setIsHoldingDragTarget(false);
    }
  }, []);

  const clearActiveDragState = useCallback(() => {
    if (dragHoldTimerRef.current) {
      clearTimeout(dragHoldTimerRef.current);
      dragHoldTimerRef.current = null;
    }
    activeDragBlockIdRef.current = null;
    activeDragSegmentRef.current = null;
    dragSwapOffsetRef.current = 0;
    blockDragAnimY.setValue(0);
    segmentDragAnimY.setValue(0);
    setDraggingBlockId(null);
    setDraggingSegment(null);
    setIsHoldingDragTarget(false);
  }, [blockDragAnimY, segmentDragAnimY]);

  useEffect(() => {
    return () => {
      if (dragHoldTimerRef.current) {
        clearTimeout(dragHoldTimerRef.current);
        dragHoldTimerRef.current = null;
      }
    };
  }, []);

  const onBlockLayout = useCallback((blockId: string, event: LayoutChangeEvent) => {
    blockHeightsRef.current[blockId] = event.nativeEvent.layout.height;
  }, []);

  const onSegmentLayout = useCallback(
    (segmentCategory: WorkoutCategory, event: LayoutChangeEvent) => {
      segmentHeightsRef.current[segmentCategory] = event.nativeEvent.layout.height;
    },
    []
  );

  const getBlockPanHandlers = useCallback(
    (blockId: string) => {
      if (!blockPanRespondersRef.current[blockId]) {
        blockPanRespondersRef.current[blockId] = PanResponder.create({
          onStartShouldSetPanResponder: () => exerciseBlocksRef.current.length > 1,
          onMoveShouldSetPanResponder: () => activeDragBlockIdRef.current === blockId,
          onPanResponderTerminationRequest: () => false,
          onShouldBlockNativeResponder: () => true,
          onPanResponderGrant: () => {
            if (exerciseBlocksRef.current.length <= 1) return;
            setIsHoldingDragTarget(true);
            dragSwapOffsetRef.current = 0;
            blockDragAnimY.setValue(0);
            if (dragHoldTimerRef.current) clearTimeout(dragHoldTimerRef.current);
            dragHoldTimerRef.current = setTimeout(() => {
              activeDragBlockIdRef.current = blockId;
              setDraggingBlockId(blockId);
              onBlockDragActivateRef.current?.(blockId);
              triggerSensoryCue('SET_MICRO_REWARD_TICK');
            }, 220);
          },
          onPanResponderMove: (_evt, gestureState) => {
            if (activeDragBlockIdRef.current !== blockId) {
              if (Math.abs(gestureState.dx) > 12 || Math.abs(gestureState.dy) > 12) {
                clearDragHoldTimer();
              }
              return;
            }

            const curBlocks = exerciseBlocksRef.current;
            const curIdx = curBlocks.findIndex((b) => b.blockId === blockId);
            if (curIdx < 0) return;

            let relDy = gestureState.dy - dragSwapOffsetRef.current;

            if (relDy > 0 && curIdx < curBlocks.length - 1) {
              const nextBlock = curBlocks[curIdx + 1]!;
              const nextH = Math.max(110, blockHeightsRef.current[nextBlock.blockId] ?? 180);
              if (relDy > nextH * 0.5) {
                const swapped = [...curBlocks];
                const [moved] = swapped.splice(curIdx, 1);
                if (moved) {
                  swapped.splice(curIdx + 1, 0, moved);
                  exerciseBlocksRef.current = swapped;
                  dragSwapOffsetRef.current += nextH;
                  relDy = gestureState.dy - dragSwapOffsetRef.current;
                  setBlocksRef.current(() => swapped);
                  triggerSensoryCue('SET_MICRO_REWARD_TICK');
                }
              }
            } else if (relDy < 0 && curIdx > 0) {
              const prevBlock = curBlocks[curIdx - 1]!;
              const prevH = Math.max(110, blockHeightsRef.current[prevBlock.blockId] ?? 180);
              if (relDy < -prevH * 0.5) {
                const swapped = [...curBlocks];
                const [moved] = swapped.splice(curIdx, 1);
                if (moved) {
                  swapped.splice(curIdx - 1, 0, moved);
                  exerciseBlocksRef.current = swapped;
                  dragSwapOffsetRef.current -= prevH;
                  relDy = gestureState.dy - dragSwapOffsetRef.current;
                  setBlocksRef.current(() => swapped);
                  triggerSensoryCue('SET_MICRO_REWARD_TICK');
                }
              }
            }

            blockDragAnimY.setValue(relDy);
          },
          onPanResponderRelease: clearActiveDragState,
          onPanResponderTerminate: clearActiveDragState,
        });
      }
      return blockPanRespondersRef.current[blockId]!.panHandlers;
    },
    [blockDragAnimY, clearActiveDragState, clearDragHoldTimer]
  );

  const getSegmentPanHandlers = useCallback(
    (segmentCategory: WorkoutCategory) => {
      if (!segmentPanRespondersRef.current[segmentCategory]) {
        segmentPanRespondersRef.current[segmentCategory] = PanResponder.create({
          onStartShouldSetPanResponder: () => orderedSegmentsRef.current.length > 1,
          onMoveShouldSetPanResponder: () => activeDragSegmentRef.current === segmentCategory,
          onPanResponderTerminationRequest: () => false,
          onShouldBlockNativeResponder: () => true,
          onPanResponderGrant: () => {
            if (orderedSegmentsRef.current.length <= 1) return;
            setIsHoldingDragTarget(true);
            dragSwapOffsetRef.current = 0;
            segmentDragAnimY.setValue(0);
            if (dragHoldTimerRef.current) clearTimeout(dragHoldTimerRef.current);
            dragHoldTimerRef.current = setTimeout(() => {
              activeDragSegmentRef.current = segmentCategory;
              setDraggingSegment(segmentCategory);
              triggerSensoryCue('SET_MICRO_REWARD_TICK');
            }, 220);
          },
          onPanResponderMove: (_evt, gestureState) => {
            if (activeDragSegmentRef.current !== segmentCategory) {
              if (Math.abs(gestureState.dx) > 12 || Math.abs(gestureState.dy) > 12) {
                clearDragHoldTimer();
              }
              return;
            }

            const curOrder = [...orderedSegmentsRef.current];
            const curIdx = curOrder.indexOf(segmentCategory);
            if (curIdx < 0) return;

            let relDy = gestureState.dy - dragSwapOffsetRef.current;

            if (relDy > 0 && curIdx < curOrder.length - 1) {
              const nextSeg = curOrder[curIdx + 1]!;
              const nextH = Math.max(140, segmentHeightsRef.current[nextSeg] ?? 260);
              if (relDy > nextH * 0.5) {
                const [moved] = curOrder.splice(curIdx, 1);
                if (moved) {
                  curOrder.splice(curIdx + 1, 0, moved);
                  orderedSegmentsRef.current = curOrder;
                  dragSwapOffsetRef.current += nextH;
                  relDy = gestureState.dy - dragSwapOffsetRef.current;
                  onReorderSegmentsRef.current(curOrder);
                  triggerSensoryCue('SET_MICRO_REWARD_TICK');
                }
              }
            } else if (relDy < 0 && curIdx > 0) {
              const prevSeg = curOrder[curIdx - 1]!;
              const prevH = Math.max(140, segmentHeightsRef.current[prevSeg] ?? 260);
              if (relDy < -prevH * 0.5) {
                const [moved] = curOrder.splice(curIdx, 1);
                if (moved) {
                  curOrder.splice(curIdx - 1, 0, moved);
                  orderedSegmentsRef.current = curOrder;
                  dragSwapOffsetRef.current -= prevH;
                  relDy = gestureState.dy - dragSwapOffsetRef.current;
                  onReorderSegmentsRef.current(curOrder);
                  triggerSensoryCue('SET_MICRO_REWARD_TICK');
                }
              }
            }

            segmentDragAnimY.setValue(relDy);
          },
          onPanResponderRelease: clearActiveDragState,
          onPanResponderTerminate: clearActiveDragState,
        });
      }
      return segmentPanRespondersRef.current[segmentCategory]!.panHandlers;
    },
    [clearActiveDragState, clearDragHoldTimer, segmentDragAnimY]
  );

  // ==========================================================================
  // INTRA-WORKOUT BLOCK & SET ROW HANDLERS
  // ==========================================================================

  const handleSelectExercise = useCallback(
    (blockId: string, exerciseId: string) => {
      const ex =
        resistanceExercises.find((e) => e.id === exerciseId) ??
        allExercises?.find((e) => e.id === exerciseId);
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

      const updatedContexts: IntraWorkoutSetUpdatedContext[] = [];

      const nextBlocks = exerciseBlocksRef.current.map((b) => {
        if (b.blockId !== blockId) return b;
        const nextExerciseName = ex?.name ?? exerciseId;
        const updatedSets = b.sets.map((s, sIdx) => {
          if (s.completed) {
            const parsedDisplayWeight = Math.max(0, Number(s.weightKgStr) || 0);
            const parsedReps = Math.max(0, Math.floor(Number(s.repsStr) || 0));
            const canonicalWeightKg = getRowCanonicalWeightKg(s, nextUnit);
            const nextRpe = s.rpe ?? 8.5;
            const nextSetType = s.setType || (s.isWarmup ? 'WARMUP' : 'NORMAL');
            const nextIsWarmup = isWarmupSetType(nextSetType, s.isWarmup);
            const completedWithCanon: OfflineDraftSetRow = {
              ...s,
              canonicalWeightKg,
            } as OfflineDraftSetRow;
            const updatedBlockStub: OfflineDraftExerciseBlock = {
              ...b,
              exerciseId,
              exerciseName: nextExerciseName,
              weightUnit: nextUnit,
            };
            updatedContexts.push({
              blockId: b.blockId,
              setId: s.id,
              block: updatedBlockStub,
              set: completedWithCanon,
              setIndex: sIdx,
              exerciseId,
              exerciseName: nextExerciseName,
              canonicalWeightKg,
              displayWeight: parsedDisplayWeight,
              reps: parsedReps,
              rpe: nextRpe,
              setType: nextSetType,
              isWarmup: nextIsWarmup,
              blockUnit: nextUnit,
              supersetGroupId: b.supersetGroupId ?? null,
              reason: 'SELECT_EXERCISE',
            });
            return completedWithCanon;
          }
          const nextStr = prevLookup.found ? '' : '60';
          return {
            ...s,
            weightKgStr: nextStr,
            canonicalWeightKg: nextStr ? convertDisplayWeightToKg(60, nextUnit) : undefined,
            repsStr: prevLookup.found ? '' : '8',
          } as OfflineDraftSetRow;
        });

        return {
          ...b,
          exerciseId,
          exerciseName: nextExerciseName,
          weightUnit: nextUnit,
          sets: updatedSets,
        };
      });

      exerciseBlocksRef.current = nextBlocks;
      setBlocks(() => nextBlocks);

      for (const ctx of updatedContexts) {
        onSetUpdated?.(ctx);
      }

      recordRecentActivity?.(exerciseId);
      onExerciseSelected?.(blockId, exerciseId);
    },
    [
      activeGymId,
      allExercises,
      defaultWeightUnit,
      exerciseGymPreferences,
      onExerciseSelected,
      onSetUpdated,
      recordRecentActivity,
      resistanceExercises,
      setBlocks,
      workoutHistory,
    ]
  );

  const handleSetOrAppendDesignation = useCallback(
    (blockId: string, targetType: SetType) => {
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.blockId !== blockId) return b;
          const blockUnit = resolveBlockUnit(b);
          // Find the last uncompleted set row to designate; if all are completed, append a new row
          let targetIdx = -1;
          for (let i = b.sets.length - 1; i >= 0; i -= 1) {
            if (!b.sets[i]?.completed) {
              targetIdx = i;
              break;
            }
          }
          if (targetIdx >= 0) {
            return {
              ...b,
              weightUnit: blockUnit,
              sets: b.sets.map((s, idx) =>
                idx === targetIdx
                  ? ({
                      ...s,
                      setType: targetType,
                      isWarmup: targetType === 'WARMUP',
                      rpe: targetType === 'FAILURE' || targetType === 'AMRAP' ? 10 : s.rpe,
                    } as OfflineDraftSetRow)
                  : s
              ),
            };
          }
          const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const lastRow = b.sets[b.sets.length - 1];
          return {
            ...b,
            weightUnit: blockUnit,
            sets: [
              ...b.sets,
              {
                id: `set_${stamp}`,
                weightKgStr: lastRow?.weightKgStr ?? '',
                canonicalWeightKg: (lastRow as OfflineDraftSetRow & { canonicalWeightKg?: number })
                  ?.canonicalWeightKg,
                repsStr: lastRow?.repsStr ?? '',
                isWarmup: targetType === 'WARMUP',
                setType: targetType,
                rpe:
                  targetType === 'FAILURE' || targetType === 'AMRAP' ? 10 : (lastRow?.rpe ?? 8.5),
                completed: false,
              } as OfflineDraftSetRow,
            ],
          };
        })
      );
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
    },
    [resolveBlockUnit, setBlocks]
  );

  const handleToggleBlockWeightUnit = useCallback(
    (blockId: string) => {
      const target = exerciseBlocksRef.current.find((b) => b.blockId === blockId);
      if (!target) return;
      const oldUnit = resolveBlockUnit(target);
      const nextUnit: WeightUnit = oldUnit === 'KG' ? 'LBS' : 'KG';

      invokeSaveExerciseWeightUnit(
        saveExerciseWeightUnit,
        target.exerciseId,
        activeGymId,
        activeGymName,
        nextUnit
      );

      setBlocks((prev) =>
        prev.map((b) => {
          if (b.blockId !== blockId) return b;
          return {
            ...b,
            weightUnit: nextUnit,
            sets: b.sets.map((s) => {
              if (!s.weightKgStr.trim()) return s;
              const rawVal = Math.max(0, Number(s.weightKgStr) || 0);
              const existingCanon = (
                s as OfflineDraftSetRow & { canonicalWeightKg?: number }
              ).canonicalWeightKg;
              const canonKg =
                existingCanon !== undefined
                  ? Number(existingCanon)
                  : convertDisplayWeightToKg(rawVal, oldUnit);
              return {
                ...s,
                canonicalWeightKg: canonKg,
                weightKgStr: formatCleanWeightNumber(convertKgToDisplayWeight(canonKg, nextUnit)),
              } as OfflineDraftSetRow;
            }),
          };
        })
      );
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
    },
    [activeGymId, activeGymName, resolveBlockUnit, saveExerciseWeightUnit, setBlocks]
  );

  const handleApplyOverloadTarget = useCallback(
    (
      blockId: string,
      targetDisplayWeight: number,
      targetReps: number,
      targetRpe: number,
      unit: WeightUnit
    ) => {
      const weightStr = formatCleanWeightNumber(targetDisplayWeight);
      const canonKg = convertDisplayWeightToKg(Math.max(0, targetDisplayWeight || 0), unit);
      const repsStr = String(Math.max(1, Math.floor(targetReps)));
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.blockId !== blockId) return b;
          return {
            ...b,
            weightUnit: unit,
            sets: b.sets.map((s) => {
              if (
                s.completed ||
                isWarmupSetType(s.setType, s.isWarmup) ||
                s.setType === 'DROP_SET'
              ) {
                return s;
              }
              return {
                ...s,
                weightKgStr: weightStr,
                canonicalWeightKg: canonKg,
                repsStr,
                rpe: targetRpe,
              } as OfflineDraftSetRow;
            }),
          };
        })
      );
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
    },
    [setBlocks]
  );

  const handleCopyPrevToRow = useCallback(
    (
      blockId: string,
      setId: string,
      displayWeightStr: string,
      repsStr: string,
      rpe: number | null
    ) => {
      onValidationError?.(null);
      let updatedCtx: IntraWorkoutSetUpdatedContext | null = null;

      const nextBlocks = exerciseBlocksRef.current.map((b) => {
        if (b.blockId !== blockId) return b;
        const blockUnit = resolveBlockUnit(b);
        const parsedDisplayWeight = Math.max(0, Number(displayWeightStr) || 0);
        const canonicalWeightKg = convertDisplayWeightToKg(parsedDisplayWeight, blockUnit);

        const updatedSets = b.sets.map((s, sIdx) => {
          if (s.id !== setId) return s;
          const nextRpe = rpe ?? s.rpe ?? 8.5;
          const nextSetType = s.setType || (s.isWarmup ? 'WARMUP' : 'NORMAL');
          const nextIsWarmup = isWarmupSetType(nextSetType, s.isWarmup);
          const nextRow: OfflineDraftSetRow = {
            ...s,
            weightKgStr: displayWeightStr,
            canonicalWeightKg,
            repsStr,
            rpe: nextRpe,
          } as OfflineDraftSetRow;

          if (s.completed) {
            const parsedReps = Math.max(0, Math.floor(Number(repsStr) || 0));
            updatedCtx = {
              blockId: b.blockId,
              setId: s.id,
              block: { ...b, weightUnit: blockUnit },
              set: nextRow,
              setIndex: sIdx,
              exerciseId: b.exerciseId,
              exerciseName: b.exerciseName ?? b.exerciseId,
              canonicalWeightKg,
              displayWeight: parsedDisplayWeight,
              reps: parsedReps,
              rpe: nextRpe,
              setType: nextSetType,
              isWarmup: nextIsWarmup,
              blockUnit,
              supersetGroupId: b.supersetGroupId ?? null,
              reason: 'COPY_PREV',
            };
          }
          return nextRow;
        });

        return {
          ...b,
          weightUnit: blockUnit,
          sets: updatedSets,
        };
      });

      exerciseBlocksRef.current = nextBlocks;
      setBlocks(() => nextBlocks);

      if (updatedCtx) {
        onSetUpdated?.(updatedCtx);
      }
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
    },
    [onSetUpdated, onValidationError, resolveBlockUnit, setBlocks]
  );

  const handleInsertWarmupSets = useCallback(
    (
      blockId: string,
      warmupSets: GeneratedWarmupSet[],
      unitOrTargetWorkingWeight?: WeightUnit | number,
      targetWorkingWeightDisplay?: number
    ) => {
      if (warmupSets.length === 0) return;
      const stamp = Date.now();
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.blockId !== blockId) return b;
          const resolvedUnit: WeightUnit =
            unitOrTargetWorkingWeight === 'KG' || unitOrTargetWorkingWeight === 'LBS'
              ? unitOrTargetWorkingWeight
              : resolveBlockUnit(b);
          const resolvedTargetWorkingWeight: number | undefined =
            typeof unitOrTargetWorkingWeight === 'number'
              ? unitOrTargetWorkingWeight
              : targetWorkingWeightDisplay;

          let syncedFirstWorking = false;
          const keptSets = b.sets
            .filter((s) => s.completed || !isWarmupSetType(s.setType, s.isWarmup))
            .map((s) => {
              if (
                !syncedFirstWorking &&
                !s.completed &&
                s.setType !== 'WARMUP' &&
                !s.isWarmup &&
                resolvedTargetWorkingWeight !== undefined &&
                resolvedTargetWorkingWeight > 0
              ) {
                syncedFirstWorking = true;
                const currentW = Number(s.weightKgStr) || 0;
                const targetStr = formatCleanWeightNumber(resolvedTargetWorkingWeight);
                if (currentW <= 0 || s.weightKgStr !== targetStr) {
                  return {
                    ...s,
                    weightKgStr: targetStr,
                    canonicalWeightKg: convertDisplayWeightToKg(
                      resolvedTargetWorkingWeight,
                      resolvedUnit
                    ),
                  } as OfflineDraftSetRow;
                }
              }
              return s;
            });

          const generatedRows: OfflineDraftSetRow[] = warmupSets.map(
            (ws, idx) =>
              ({
                id: `set_wu_${stamp}_${idx + 1}`,
                weightKgStr: formatCleanWeightNumber(ws.displayWeight),
                canonicalWeightKg:
                  ws.weightKg !== undefined
                    ? ws.weightKg
                    : convertDisplayWeightToKg(ws.displayWeight, resolvedUnit),
                repsStr: String(ws.reps),
                isWarmup: true,
                setType: 'WARMUP',
                rpe: ws.rpe,
                completed: false,
              } as OfflineDraftSetRow)
          );

          return {
            ...b,
            weightUnit: resolvedUnit,
            sets: [...generatedRows, ...keptSets],
          };
        })
      );
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
    },
    [resolveBlockUnit, setBlocks]
  );

  const handleUpdateSetField = useCallback(
    (blockId: string, setId: string, field: 'weightKgStr' | 'repsStr', value: string) => {
      const cleaned = value.replace(/[^0-9.]/g, '');
      onValidationError?.(null);
      let updatedCtx: IntraWorkoutSetUpdatedContext | null = null;

      const nextBlocks = exerciseBlocksRef.current.map((b) => {
        if (b.blockId !== blockId) return b;
        const blockUnit = resolveBlockUnit(b);
        const updatedSets = b.sets.map((s, sIdx) => {
          if (s.id !== setId) return s;
          const nextRow: OfflineDraftSetRow = {
            ...s,
            [field]: cleaned,
            ...(field === 'weightKgStr'
              ? {
                  canonicalWeightKg: cleaned.trim()
                    ? convertDisplayWeightToKg(Math.max(0, Number(cleaned) || 0), blockUnit)
                    : undefined,
                }
              : {}),
          } as OfflineDraftSetRow;

          if (nextRow.completed) {
            const parsedDisplayWeight = Math.max(0, Number(nextRow.weightKgStr) || 0);
            const parsedReps = Math.max(0, Math.floor(Number(nextRow.repsStr) || 0));
            const canonicalWeightKg = getRowCanonicalWeightKg(nextRow, blockUnit);
            const nextRpe = nextRow.rpe ?? 8.5;
            const nextSetType = nextRow.setType || (nextRow.isWarmup ? 'WARMUP' : 'NORMAL');
            const nextIsWarmup = isWarmupSetType(nextSetType, nextRow.isWarmup);
            updatedCtx = {
              blockId: b.blockId,
              setId: nextRow.id,
              block: { ...b, weightUnit: blockUnit },
              set: nextRow,
              setIndex: sIdx,
              exerciseId: b.exerciseId,
              exerciseName: b.exerciseName ?? b.exerciseId,
              canonicalWeightKg,
              displayWeight: parsedDisplayWeight,
              reps: parsedReps,
              rpe: nextRpe,
              setType: nextSetType,
              isWarmup: nextIsWarmup,
              blockUnit,
              supersetGroupId: b.supersetGroupId ?? null,
              reason: 'UPDATE_FIELD',
            };
          }
          return nextRow;
        });

        return {
          ...b,
          weightUnit: blockUnit,
          sets: updatedSets,
        };
      });

      exerciseBlocksRef.current = nextBlocks;
      setBlocks(() => nextBlocks);

      if (updatedCtx) {
        onSetUpdated?.(updatedCtx);
      }
    },
    [onSetUpdated, onValidationError, resolveBlockUnit, setBlocks]
  );

  const handleCycleSetType = useCallback(
    (blockId: string, setId: string) => {
      let updatedCtx: IntraWorkoutSetUpdatedContext | null = null;

      const nextBlocks = exerciseBlocksRef.current.map((b) => {
        if (b.blockId !== blockId) return b;
        const blockUnit = resolveBlockUnit(b);
        const updatedSets = b.sets.map((s, sIdx) => {
          if (s.id !== setId) return s;
          const nextSetType = cycleSetType(s.setType || (s.isWarmup ? 'WARMUP' : 'NORMAL'));
          const nextIsWarmup = nextSetType === 'WARMUP';
          const nextRpe =
            nextSetType === 'FAILURE' || nextSetType === 'AMRAP' ? 10 : (s.rpe ?? 8.5);
          const existingCanon = (
            s as OfflineDraftSetRow & { canonicalWeightKg?: number }
          ).canonicalWeightKg;
          const nextRow: OfflineDraftSetRow = {
            ...s,
            ...(existingCanon !== undefined ? { canonicalWeightKg: existingCanon } : {}),
            setType: nextSetType,
            isWarmup: nextIsWarmup,
            rpe: nextRpe,
          } as OfflineDraftSetRow;

          if (s.completed) {
            const parsedDisplayWeight = Math.max(0, Number(s.weightKgStr) || 0);
            const parsedReps = Math.max(0, Math.floor(Number(s.repsStr) || 0));
            const canonicalWeightKg = getRowCanonicalWeightKg(s, blockUnit);
            updatedCtx = {
              blockId: b.blockId,
              setId: s.id,
              block: { ...b, weightUnit: blockUnit },
              set: nextRow,
              setIndex: sIdx,
              exerciseId: b.exerciseId,
              exerciseName: b.exerciseName ?? b.exerciseId,
              canonicalWeightKg,
              displayWeight: parsedDisplayWeight,
              reps: parsedReps,
              rpe: nextRpe,
              setType: nextSetType,
              isWarmup: nextIsWarmup,
              blockUnit,
              supersetGroupId: b.supersetGroupId ?? null,
              reason: 'CYCLE_SET_TYPE',
            };
          }
          return nextRow;
        });

        return {
          ...b,
          weightUnit: blockUnit,
          sets: updatedSets,
        };
      });

      exerciseBlocksRef.current = nextBlocks;
      setBlocks(() => nextBlocks);

      if (updatedCtx) {
        onSetUpdated?.(updatedCtx);
      }
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
    },
    [onSetUpdated, resolveBlockUnit, setBlocks]
  );

  const handleSetRpeValue = useCallback(
    (blockId: string, setId: string, nextRpe: number) => {
      let updatedCtx: IntraWorkoutSetUpdatedContext | null = null;

      const nextBlocks = exerciseBlocksRef.current.map((b) => {
        if (b.blockId !== blockId) return b;
        const blockUnit = resolveBlockUnit(b);
        const updatedSets = b.sets.map((s, sIdx) => {
          if (s.id !== setId) return s;
          const existingCanon = (
            s as OfflineDraftSetRow & { canonicalWeightKg?: number }
          ).canonicalWeightKg;
          const nextRow: OfflineDraftSetRow = {
            ...s,
            ...(existingCanon !== undefined ? { canonicalWeightKg: existingCanon } : {}),
            rpe: nextRpe,
          } as OfflineDraftSetRow;

          if (s.completed) {
            const parsedDisplayWeight = Math.max(0, Number(s.weightKgStr) || 0);
            const parsedReps = Math.max(0, Math.floor(Number(s.repsStr) || 0));
            const canonicalWeightKg = getRowCanonicalWeightKg(s, blockUnit);
            const nextSetType = s.setType || (s.isWarmup ? 'WARMUP' : 'NORMAL');
            const nextIsWarmup = isWarmupSetType(nextSetType, s.isWarmup);
            updatedCtx = {
              blockId: b.blockId,
              setId: s.id,
              block: { ...b, weightUnit: blockUnit },
              set: nextRow,
              setIndex: sIdx,
              exerciseId: b.exerciseId,
              exerciseName: b.exerciseName ?? b.exerciseId,
              canonicalWeightKg,
              displayWeight: parsedDisplayWeight,
              reps: parsedReps,
              rpe: nextRpe,
              setType: nextSetType,
              isWarmup: nextIsWarmup,
              blockUnit,
              supersetGroupId: b.supersetGroupId ?? null,
              reason: 'SET_RPE',
            };
          }
          return nextRow;
        });

        return {
          ...b,
          weightUnit: blockUnit,
          sets: updatedSets,
        };
      });

      exerciseBlocksRef.current = nextBlocks;
      setBlocks(() => nextBlocks);

      if (updatedCtx) {
        onSetUpdated?.(updatedCtx);
      }
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
    },
    [onSetUpdated, resolveBlockUnit, setBlocks]
  );

  const handleToggleSupersetLink = useCallback(
    (blockIndex: number) => {
      setBlocks((prev) => {
        const cloned = [...prev];
        const cur = cloned[blockIndex];
        const next = cloned[blockIndex + 1];
        if (!cur) return prev;

        if (cur.supersetGroupId) {
          const targetGroup = cur.supersetGroupId;
          return cloned.map((b) =>
            b.supersetGroupId === targetGroup ? { ...b, supersetGroupId: undefined } : b
          );
        }

        const existingGroups = new Set(cloned.map((b) => b.supersetGroupId).filter(Boolean));
        const letters = ['A', 'B', 'C', 'D'];
        const nextLetter =
          letters.find((l) => !existingGroups.has(l)) || `G${existingGroups.size + 1}`;

        return cloned.map((b, idx) => {
          if (idx === blockIndex || (next && idx === blockIndex + 1)) {
            return { ...b, supersetGroupId: nextLetter };
          }
          return b;
        });
      });
      triggerSensoryCue('SUPERSET_TRANSITION_TICK');
    },
    [setBlocks]
  );

  const handleAddSetRow = useCallback(
    (blockId: string) => {
      setBlocks((prev) => {
        const targetBlock = prev.find((b) => b.blockId === blockId);
        const targetSupersetGroup = targetBlock?.supersetGroupId;

        return prev.map((b) => {
          const shouldAdd =
            b.blockId === blockId ||
            (Boolean(targetSupersetGroup) && b.supersetGroupId === targetSupersetGroup);
          if (!shouldAdd) return b;

          const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const lastRow = b.sets[b.sets.length - 1];
          const prevLookup = resolvePreviousExerciseSessionSets({
            exerciseId: b.exerciseId,
            workoutHistory,
            activeGymId,
          });
          const bUnit = resolveBlockUnit(b);
          const nextWeightStr = lastRow?.weightKgStr ?? (prevLookup.found ? '' : '60');
          const lastCanonKg = (lastRow as OfflineDraftSetRow & { canonicalWeightKg?: number })
            ?.canonicalWeightKg;
          const nextCanonKg =
            lastCanonKg !== undefined
              ? Number(lastCanonKg)
              : nextWeightStr.trim() !== ''
                ? convertDisplayWeightToKg(Math.max(0, Number(nextWeightStr) || 0), bUnit)
                : undefined;

          return {
            ...b,
            weightUnit: bUnit,
            sets: [
              ...b.sets,
              {
                id: `set_${stamp}`,
                weightKgStr: nextWeightStr,
                canonicalWeightKg: nextCanonKg,
                repsStr: lastRow?.repsStr ?? (prevLookup.found ? '' : '8'),
                isWarmup: false,
                setType: 'NORMAL',
                rpe: lastRow?.rpe ?? 8.5,
                completed: false,
              } as OfflineDraftSetRow,
            ],
          };
        });
      });
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
    },
    [activeGymId, resolveBlockUnit, setBlocks, workoutHistory]
  );

  const handleRemoveSetRow = useCallback(
    (blockId: string, setId: string) => {
      const currentBlocks = exerciseBlocksRef.current;
      const targetBlock = currentBlocks.find((b) => b.blockId === blockId);
      if (!targetBlock || targetBlock.sets.length <= 1) return;

      const setIdx = targetBlock.sets.findIndex((s) => s.id === setId);
      const removedSet = setIdx >= 0 ? targetBlock.sets[setIdx] : undefined;

      const nextBlocks = currentBlocks.map((b) => {
        if (b.blockId !== blockId || b.sets.length <= 1) return b;
        return {
          ...b,
          sets: b.sets.filter((s) => s.id !== setId),
        };
      });

      exerciseBlocksRef.current = nextBlocks;
      setBlocks(() => nextBlocks);

      if (removedSet?.completed) {
        const blockUnit = resolveBlockUnit(targetBlock);
        const canonicalWeightKg = getRowCanonicalWeightKg(removedSet, blockUnit);
        const displayWeight = Math.max(0, Number(removedSet.weightKgStr) || 0);
        const reps = Math.max(0, Math.floor(Number(removedSet.repsStr) || 0));
        const setType = removedSet.setType || (removedSet.isWarmup ? 'WARMUP' : 'NORMAL');
        const isWarmup = isWarmupSetType(setType, removedSet.isWarmup);
        const rpe = removedSet.rpe ?? 8.5;

        onSetUnlogged?.({
          blockId: targetBlock.blockId,
          setId: removedSet.id,
          block: { ...targetBlock, weightUnit: blockUnit },
          set: removedSet,
          setIndex: setIdx,
          exerciseId: targetBlock.exerciseId,
          exerciseName: targetBlock.exerciseName ?? targetBlock.exerciseId,
          canonicalWeightKg,
          displayWeight,
          reps,
          rpe,
          setType,
          isWarmup,
          blockUnit,
          supersetGroupId: targetBlock.supersetGroupId ?? null,
          reason: 'REMOVE_SET_ROW',
          nextBlocks,
        });
      }
    },
    [onSetUnlogged, resolveBlockUnit, setBlocks]
  );

  const handleAddExerciseBlock = useCallback(() => {
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const usedIds = new Set(exerciseBlocksRef.current.map((b) => b.exerciseId));
    const nextExercise =
      resistanceExercises.find((e) => !usedIds.has(e.id)) ?? resistanceExercises[0];
    const nextId = nextExercise?.id ?? fallbackExerciseId;
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

    setBlocks((prev) => [
      ...prev,
      {
        blockId: `blk_${stamp}`,
        exerciseId: nextId,
        exerciseName: nextExercise?.name ?? nextId,
        weightUnit: nextUnit,
        sets: Array.from(
          { length: setCount },
          (_, idx) =>
            ({
              id: `set_${stamp}_${idx + 1}`,
              weightKgStr: prevLookup.found ? '' : '60',
              canonicalWeightKg: prevLookup.found
                ? undefined
                : convertDisplayWeightToKg(60, nextUnit),
              repsStr: prevLookup.found ? '' : '8',
              isWarmup: false,
              setType: 'NORMAL',
              rpe: prevLookup.workingSets[idx]?.rpe ?? 8.5,
              completed: false,
            } as OfflineDraftSetRow)
        ),
      },
    ]);
  }, [
    activeGymId,
    defaultWeightUnit,
    exerciseGymPreferences,
    fallbackExerciseId,
    resistanceExercises,
    setBlocks,
    workoutHistory,
  ]);

  const handleRemoveExerciseBlock = useCallback(
    (blockId: string) => {
      clearActiveDragState();
      const currentBlocks = exerciseBlocksRef.current;
      if (currentBlocks.length <= 1) return;

      const removedBlock = currentBlocks.find((b) => b.blockId === blockId);
      if (!removedBlock) return;

      const nextBlocks = currentBlocks.filter((b) => b.blockId !== blockId);
      exerciseBlocksRef.current = nextBlocks;
      setBlocks(() => nextBlocks);

      const blockUnit = resolveBlockUnit(removedBlock);
      removedBlock.sets.forEach((s, sIdx) => {
        if (!s.completed) return;
        const canonicalWeightKg = getRowCanonicalWeightKg(s, blockUnit);
        const displayWeight = Math.max(0, Number(s.weightKgStr) || 0);
        const reps = Math.max(0, Math.floor(Number(s.repsStr) || 0));
        const setType = s.setType || (s.isWarmup ? 'WARMUP' : 'NORMAL');
        const isWarmup = isWarmupSetType(setType, s.isWarmup);
        const rpe = s.rpe ?? 8.5;

        onSetUnlogged?.({
          blockId: removedBlock.blockId,
          setId: s.id,
          block: { ...removedBlock, weightUnit: blockUnit },
          set: s,
          setIndex: sIdx,
          exerciseId: removedBlock.exerciseId,
          exerciseName: removedBlock.exerciseName ?? removedBlock.exerciseId,
          canonicalWeightKg,
          displayWeight,
          reps,
          rpe,
          setType,
          isWarmup,
          blockUnit,
          supersetGroupId: removedBlock.supersetGroupId ?? null,
          reason: 'REMOVE_EXERCISE_BLOCK',
          nextBlocks,
        });
      });
    },
    [clearActiveDragState, onSetUnlogged, resolveBlockUnit, setBlocks]
  );

  const handleToggleSetCompleted = useCallback(
    (blockId: string, setId: string) => {
      onValidationError?.(null);
      let justCompleted = false;
      let targetRow: OfflineDraftSetRow | null = null;
      let targetBlock: OfflineDraftExerciseBlock | null = null;
      let targetSetIndex = -1;

      const nextBlocks = exerciseBlocksRef.current.map((b) => {
        if (b.blockId !== blockId) return b;
        const unit = resolveBlockUnit(b);
        const prevLookup = resolvePreviousExerciseSessionSets({
          exerciseId: b.exerciseId,
          workoutHistory,
          activeGymId,
        });

        let workingCounter = 0;
        let warmupCounter = 0;

        const updatedSets = b.sets.map((s, sIdx) => {
          const isWu = isWarmupSetType(s.setType, s.isWarmup);
          const wIdx = workingCounter;
          const wuIdx = warmupCounter;
          if (isWu) warmupCounter += 1;
          else workingCounter += 1;

          if (s.id !== setId) return s;

          targetSetIndex = sIdx;
          justCompleted = !s.completed;
          if (!justCompleted) {
            const uncheckedRow: OfflineDraftSetRow = { ...s, completed: false };
            targetRow = uncheckedRow;
            return uncheckedRow;
          }

          const ghost = resolveGhostRowForSetOrder({
            lookup: prevLookup,
            setType: s.setType,
            isWarmup: s.isWarmup,
            workingOrderIndex: wIdx,
            warmupOrderIndex: wuIdx,
          });

          const hasManualWeight = s.weightKgStr.trim().length > 0;
          const filledWeightStr = hasManualWeight
            ? s.weightKgStr
            : ghost
              ? formatCleanWeightNumber(convertKgToDisplayWeight(ghost.weightKg, unit))
              : '60';
          const existingCanon = (
            s as OfflineDraftSetRow & { canonicalWeightKg?: number }
          ).canonicalWeightKg;
          const filledCanonKg = hasManualWeight
            ? existingCanon !== undefined
              ? Number(existingCanon)
              : convertDisplayWeightToKg(Math.max(0, Number(s.weightKgStr) || 0), unit)
            : ghost
              ? ghost.weightKg
              : convertDisplayWeightToKg(60, unit);
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
            canonicalWeightKg: filledCanonKg,
            repsStr: filledRepsStr,
            rpe: filledRpe,
            completed: true,
          } as OfflineDraftSetRow;
          targetRow = nextRow;
          return nextRow;
        });

        const updatedBlock: OfflineDraftExerciseBlock = {
          ...b,
          weightUnit: unit,
          sets: updatedSets,
        };
        targetBlock = updatedBlock;
        return updatedBlock;
      });

      exerciseBlocksRef.current = nextBlocks;
      setBlocks(() => nextBlocks);

      if (!targetRow || !targetBlock) return;

      const resolvedBlock = targetBlock as OfflineDraftExerciseBlock;
      const resolvedRow = targetRow as OfflineDraftSetRow;
      const blockUnit = resolveBlockUnit(resolvedBlock);
      const canonicalWeightKg = getRowCanonicalWeightKg(resolvedRow, blockUnit);
      const displayWeight = Math.max(0, Number(resolvedRow.weightKgStr) || 0);
      const reps = Math.max(0, Math.floor(Number(resolvedRow.repsStr) || 0));
      const rpe = resolvedRow.rpe ?? 8.5;
      const setType = resolvedRow.setType || (resolvedRow.isWarmup ? 'WARMUP' : 'NORMAL');
      const isWarmup = isWarmupSetType(setType, resolvedRow.isWarmup);

      if (!justCompleted) {
        onSetUnlogged?.({
          blockId: resolvedBlock.blockId,
          setId: resolvedRow.id,
          block: resolvedBlock,
          set: resolvedRow,
          setIndex: targetSetIndex,
          exerciseId: resolvedBlock.exerciseId,
          exerciseName: resolvedBlock.exerciseName ?? resolvedBlock.exerciseId,
          canonicalWeightKg,
          displayWeight,
          reps,
          rpe,
          setType,
          isWarmup,
          blockUnit,
          supersetGroupId: resolvedBlock.supersetGroupId ?? null,
          reason: 'UNCHECK_SET',
          nextBlocks,
        });
        return;
      }

      recordRecentActivity?.(resolvedBlock.exerciseId);
      triggerSensoryCue('SET_MICRO_REWARD_TICK');

      const hasRemainingSets = nextBlocks.some((b) => b.sets.some((s) => !s.completed));
      const transition = resolveSetCompletionTransition({
        blocks: nextBlocks,
        completedBlockId: blockId,
        completedSetId: setId,
      });

      // Compute whether superset rest should be deferred (when inside a linked superset group
      // and a partner block in the group still has uncompleted working sets in the round)
      const shouldDeferSupersetRest = Boolean(
        transition.isMidSupersetRound ||
          (!isWarmup &&
            resolvedBlock.supersetGroupId &&
            nextBlocks.some(
              (b) =>
                b.blockId !== resolvedBlock.blockId &&
                b.supersetGroupId === resolvedBlock.supersetGroupId &&
                b.sets.some((s) => !s.completed && !isWarmupSetType(s.setType, s.isWarmup))
            ) &&
            transition.isMidSupersetRound)
      );

      onSetLogged?.({
        blockId: resolvedBlock.blockId,
        setId: resolvedRow.id,
        block: resolvedBlock,
        set: resolvedRow,
        setIndex: targetSetIndex,
        exerciseId: resolvedBlock.exerciseId,
        exerciseName: resolvedBlock.exerciseName ?? resolvedBlock.exerciseId,
        canonicalWeightKg,
        displayWeight,
        reps,
        rpe,
        setType,
        isWarmup,
        blockUnit,
        supersetGroupId: resolvedBlock.supersetGroupId ?? null,
        shouldDeferSupersetRest,
        hasRemainingSets,
        transition,
        nextBlocks,
      });
    },
    [
      activeGymId,
      onSetLogged,
      onSetUnlogged,
      onValidationError,
      recordRecentActivity,
      resolveBlockUnit,
      setBlocks,
      workoutHistory,
    ]
  );

  const convertSessionToBlocks = useCallback(
    (workout: CompletedWorkoutRecord, nowMs?: number): OfflineDraftExerciseBlock[] =>
      convertCompletedSessionToBlocks({
        workout,
        exerciseGymPreferences,
        activeGymId,
        defaultWeightUnit,
        nowMs,
      }),
    [activeGymId, defaultWeightUnit, exerciseGymPreferences]
  );

  const isDraggingAny = Boolean(draggingBlockId || draggingSegment || isHoldingDragTarget);

  return {
    resolveBlockUnit,
    supersetLabels,
    supersetBadges: supersetLabels,
    supersetMemberLabels,
    completedSetCount,

    draggingBlockId,
    draggingSegment,
    isHoldingDragTarget,
    isDraggingAny,
    blockDragAnimY,
    segmentDragAnimY,
    blockHeightsRef,
    segmentHeightsRef,
    onBlockLayout,
    onSegmentLayout,
    getBlockPanHandlers,
    getSegmentPanHandlers,
    clearDragHoldTimer,
    clearActiveDragState,

    handleAddExerciseBlock,
    handleRemoveExerciseBlock,
    handleSelectExercise,
    handleAddSetRow,
    handleRemoveSetRow,
    handleUpdateSetField,
    handleToggleSetCompleted,
    handleCycleSetType,
    handleSetOrAppendDesignation,
    handleSetRpeValue,
    handleToggleBlockWeightUnit,
    handleApplyOverloadTarget,
    handleCopyPrevToRow,
    handleInsertWarmupSets,
    handleToggleSupersetLink,
    handleToggleSuperset: handleToggleSupersetLink,
    convertSessionToBlocks,
  };
}
