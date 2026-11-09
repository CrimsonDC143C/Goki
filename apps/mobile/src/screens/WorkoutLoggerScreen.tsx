import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ARRIVAL_BOON_MULTIPLIER,
  HeartRateZone,
  HolisticStatType,
  SetType,
  SET_TYPE_DESCRIPTORS,
  cycleSetType,
  WorkoutCategory,
  WorkoutPresetDefinition,
  computeSupersetDisplayLabels,
  resolveSetCompletionTransition,
  calculateDynamicRestPlan,
  DynamicRestMode,
  calculateE1RM,
  verifyTelemetry,
  getOptimalRestAdvice,
  CompletedWorkoutRecord,
  CompletedExerciseEntry,
  PostWorkoutEncouragementSummary,
  evaluatePostWorkoutSummary,
  GeneratedWarmupSet,
  TrainingMetricTooltipKey,
  WeightUnit,
  calculateBarbellPlatesPerSide,
  calculateProgressiveOverloadTarget,
  classifyExercisePlateBehavior,
  convertDisplayWeightToKg,
  convertKgToDisplayWeight,
  formatCleanWeightNumber,
  formatCompactPrevPill,
  isWarmupSetType,
  resolveActiveSetTargetWeightKg,
  resolveExerciseDefaultBarWeightKg,
  resolveExerciseMachineLoadMode,
  resolveExerciseWeightUnit,
  resolveGhostRowForSetOrder,
  resolvePreviousExerciseSessionSets,
} from '@goki/game-engine';
import {
  OfflineDraftExerciseBlock,
  OfflineDraftSetRow,
  OfflineDraftCardioItem,
} from '../utils/offlineStorage';
import { wearableService } from '../services/wearableTelemetry';
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
import { useGame, ExerciseCatalogItem } from '../state/GameContext';
import { triggerSensoryCue } from '../utils/sensoryFeedback';
import { cancelRestTimerNotification, requestNotificationPermissions } from '../utils/restNotifications';
import { Image } from 'expo-image';
import { getLootChestSpriteUri, LOOT_SPRITES } from '../assets/sprites';
import { getItemIconSource } from '../assets/itemArtRegistry';
import { audioManager } from '../services/AudioManager';
import { COLORS, RARITY_COLORS, CRIMSON_ONI } from '../theme';
import {
  DEMON_BOSS_SPRITE_CONFIG,
  GREATSWORD_SKELETON_SPRITE_CONFIG,
} from '../components/battle/sprites/spriteManifest';
import { SpriteAnimator as BaseSpriteAnimator } from '../components/battle/sprites/SpriteAnimator';
import type { AnimationState, SpriteAnimatorProps } from '../components/battle/sprites/sprite.types';

// ============================================================================
// CONSTANTS & CATALOGS
// ============================================================================

export const GYM_LOCATIONS = [
  { id: 'iron-sanctum', name: 'Iron Sanctum Barbell Club', xpMultiplier: 1.25 },
  { id: 'titan-foundry', name: 'Titan Foundry Gym', xpMultiplier: 1.20 },
  { id: 'home-outpost', name: 'Home Outpost', xpMultiplier: 1.10 },
] as const;

export const BOSS_ROSTER = [
  { id: 'vaelgor', name: 'Vaelgor the Defiler', title: 'Crypt Warden', maxHp: 8500 },
  { id: 'malakor', name: 'Bone Lord Malakor', title: 'Undead Overlord', maxHp: 12000 },
  { id: 'chronos', name: 'Chronos the Void Watcher', title: 'Abyssal Titan', maxHp: 16000 },
] as const;

export const WEARABLE_SOURCES = ['Manual', 'Apple Watch', 'Garmin HRM', 'Whoop 4.0'] as const;

const SET_TYPE_COLORS: Record<SetType, string> = {
  NORMAL: '#9CA3AF',
  WARMUP: '#38BDF8',
  DROP_SET: '#EF4444',
  FAILURE: '#F59E0B',
  AMRAP: '#F59E0B',
};

const HR_ZONES: readonly HeartRateZone[] = [1, 2, 3, 4, 5];
const RPE_OPTIONS = [7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0] as const;

const STAT_XP_META: Record<
  string,
  { label: string; emoji: string; color: string }
> = {
  STRENGTH: { label: 'STR', emoji: '⚔️', color: COLORS.strength },
  ENDURANCE: { label: 'END', emoji: '🏃', color: COLORS.endurance },
  AGILITY: { label: 'AGI', emoji: '⚡', color: COLORS.agility },
  DEXTERITY: { label: 'DEX', emoji: '🤸', color: '#26C6DA' },
  CONSTITUTION: { label: 'CON', emoji: '🛡️', color: '#66BB6A' },
  WISDOM: { label: 'WIS', emoji: '🧘‍♀️', color: '#AB47BC' },
  SPIRIT: { label: 'SPR', emoji: '🔮', color: '#EC407A' },
};

// ============================================================================
// SPRITE ANIMATOR ADAPTER
// ============================================================================

interface CustomSpriteProps {
  rig?: 'greatsword_skeleton' | 'demon_boss' | string;
  state?: string;
  size?: number;
  style?: any;
}

const SpriteAnimator: React.FC<SpriteAnimatorProps | CustomSpriteProps> = (props: any) => {
  if (props.rig) {
    const config =
      props.rig === 'greatsword_skeleton'
        ? GREATSWORD_SKELETON_SPRITE_CONFIG
        : DEMON_BOSS_SPRITE_CONFIG;
    const animState: AnimationState =
      props.state === 'take_hit' ? 'hurt' : (props.state as AnimationState) || 'idle';
    return (
      <BaseSpriteAnimator
        config={config}
        state={animState}
        size={props.size ?? 48}
        style={props.style}
      />
    );
  }
  return <BaseSpriteAnimator {...props} />;
};

// ============================================================================
// HELPER UTILS
// ============================================================================

export function formatDuration(totalSeconds: number): string {
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

export function formatClock(totalSeconds: number): string {
  return formatDuration(totalSeconds);
}

export interface UnlockableBadge {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export function evaluateUnlockables(
  exerciseName: string,
  weightKg: number,
  reps: number,
  e1rm: number,
  priorBestE1rm: number
): UnlockableBadge | null {
  if (priorBestE1rm > 0 && e1rm > priorBestE1rm) {
    return {
      id: `pr_${Date.now()}`,
      title: `💥 NEW ALL-TIME PR: ${exerciseName}!`,
      description: `Hit ${weightKg}kg × ${reps} reps (Estimated 1RM: ${e1rm}kg > Prior Best: ${priorBestE1rm}kg)!`,
      icon: '🏆',
    };
  }
  return null;
}

function playSfx(name: string) {
  if (name === 'combat_hit') {
    void audioManager.playSound('enemy-damage');
  } else {
    void audioManager.playSound('enemy-damage');
  }
}

// ============================================================================
// PROPS INTERFACE
// ============================================================================

export interface WorkoutLoggerScreenProps {
  onOpenOfflineLogger?: () => void;
  onNavigateToTalents?: () => void;
  onNavigateToPaperdoll?: () => void;
  onBackToLanding?: () => void;
  onFinishAndReturn?: () => void;
}

// ============================================================================
// COMPONENT IMPLEMENTATION
// ============================================================================

export const WorkoutLoggerScreen: React.FC<WorkoutLoggerScreenProps> = ({
  onOpenOfflineLogger,
  onNavigateToTalents,
  onNavigateToPaperdoll,
  onBackToLanding,
  onFinishAndReturn,
}) => {
  const {
    activeCharacterId,
    exercises,
    historicalPRs,
    workoutMachine,
    arrivalBanner,
    startHybridSession,
    logHybridSet,
    recordHybridCardioSegment,
    finishHybridSession,
    proceedToHybridLootReview,
    openHybridLootChest,
    completeHybridReview,
    abandonHybridSession,
    workoutHistory,
    consistencyStreak,
    presets,
    savePreset,
    deletePreset,
    recentActivityIds,
    recordRecentActivity,
    exerciseGymPreferences,
    saveExerciseStickyNote,
    saveExerciseWeightUnit,
    saveExerciseBarWeightKg,
    saveExerciseMachineLoadMode,
    defaultWeightUnit,
    warmupPresetCount,
    setWarmupPresetCount,
    stats,
    gameMode,
    lastHybridConsolidation,
  } = useGame();

  // Timing & Live Clock State
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const sessionStartTimeRef = useRef<number>(Date.now());

  // Pre-Flight Config State (for Online Dungeon Raid)
  const [gymIndex, setGymIndex] = useState<number>(0);
  const [bossIndex, setBossIndex] = useState<number>(0);
  const [wearableIndex, setWearableIndex] = useState<number>(0);
  const selectedGym = GYM_LOCATIONS[gymIndex % GYM_LOCATIONS.length]!;
  const selectedBoss = BOSS_ROSTER[bossIndex % BOSS_ROSTER.length]!;
  const wearableSource = WEARABLE_SOURCES[wearableIndex % WEARABLE_SOURCES.length]!;

  // Wearable Telemetry State
  const [wearableLinked, setWearableLinked] = useState<boolean>(false);
  const [liveBpm, setLiveBpm] = useState<number>(wearableService.getLatestBpm());

  // Boss Combat Telemetry State
  const [bossAnimState, setBossAnimState] = useState<string>('idle');
  const [lastDamageDealt, setLastDamageDealt] = useState<number | null>(null);
  const [bossDamageAccumulated, setBossDamageAccumulated] = useState<number>(0);
  const [bossCardCollapsed, setBossCardCollapsed] = useState<boolean>(false);
  const [liveSetsCount, setLiveSetsCount] = useState<number>(0);

  // PR Celebration Modal State
  const [celebrationBadge, setCelebrationBadge] = useState<UnlockableBadge | null>(null);

  // Category & Modality Selection State (defaults to null so Discipline Selection Screen opens first)
  const [activeCategory, setActiveCategory] = useState<WorkoutCategory | null>(null);
  const [secondaryCategories, setSecondaryCategories] = useState<WorkoutCategory[]>([]);
  const [segmentOrder, setSegmentOrder] = useState<WorkoutCategory[]>([]);

  // Tabular Resistance & Partitioned Conditioning Catalogs
  const resistanceCatalog = useMemo(
    () => exercises.filter((e) => e.category === 'RESISTANCE'),
    [exercises]
  );
  const cardioCatalog = useMemo(
    () => exercises.filter((e) => e.category === 'CARDIO' || e.category === 'RECOVERY_MOBILITY'),
    [exercises]
  );
  const pureCardioCatalog = useMemo(
    () => exercises.filter((e) => e.workoutCategory === 'CARDIO'),
    [exercises]
  );
  const sportCatalog = useMemo(
    () => exercises.filter((e) => e.workoutCategory === 'SPORT'),
    [exercises]
  );
  const recoveryCatalog = useMemo(
    () =>
      exercises.filter(
        (e) =>
          e.workoutCategory === 'RECOVERY' ||
          (e.category === 'RECOVERY_MOBILITY' &&
            e.workoutCategory !== 'SPORT' &&
            e.workoutCategory !== 'CARDIO')
      ),
    [exercises]
  );

  const [exerciseBlocks, setExerciseBlocks] = useState<OfflineDraftExerciseBlock[]>(() => {
    const stamp = Date.now();
    const firstEx = resistanceCatalog[0];
    const initialId = firstEx?.id ?? 'bench_press';
    const initialName = firstEx?.name ?? 'Barbell Bench Press';
    return [
      {
        blockId: `blk_${stamp}_1`,
        exerciseId: initialId,
        exerciseName: initialName,
        sets: [
          {
            id: `set_${stamp}_1_1`,
            weightKgStr: '80',
            repsStr: '8',
            isWarmup: false,
            setType: 'NORMAL',
            rpe: 8.5,
            completed: false,
          },
        ],
      },
    ];
  });

  // Cardio & Recovery Non-Resistance Log State (Strictly Partitioned per Modality)
  const [cardioEntries, setCardioEntries] = useState<OfflineDraftCardioItem[]>([]);
  const [selectedIdByModality, setSelectedIdByModality] = useState<
    Record<'CARDIO' | 'SPORT' | 'RECOVERY', string>
  >(() => ({
    CARDIO: pureCardioCatalog[0]?.id ?? 'outdoor_tempo_cycling',
    SPORT: sportCatalog[0]?.id ?? 'badminton_session',
    RECOVERY: recoveryCatalog[0]?.id ?? 'foam_roll_thoracic',
  }));

  // When recent "Quick" exercises memory is wiped (e.g. via Wipe Training History), reset quick selection memory
  useEffect(() => {
    if (recentActivityIds.length === 0) {
      setSelectedIdByModality({
        CARDIO: pureCardioCatalog[0]?.id ?? 'outdoor_tempo_cycling',
        SPORT: sportCatalog[0]?.id ?? 'badminton_session',
        RECOVERY: recoveryCatalog[0]?.id ?? 'foam_roll_thoracic',
      });
    }
  }, [recentActivityIds.length, pureCardioCatalog, sportCatalog, recoveryCatalog]);
  const [cardioMinutesStr, setCardioMinutesStr] = useState<string>('20');
  const [cardioZone, setCardioZone] = useState<HeartRateZone>(2);
  const [cardioRpe, setCardioRpe] = useState<number>(7.5);

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
  const [restTimerPinned, setRestTimerPinned] = useState<boolean>(false);

  // Modals & UI View State
  const [openExercisePickerBlockId, setOpenExercisePickerBlockId] = useState<string | null>(null);
  const [openBlockMenuId, setOpenBlockMenuId] = useState<string | null>(null);
  const [activeModalityPickerTarget, setActiveModalityPickerTarget] = useState<
    'CARDIO' | 'SPORT' | 'RECOVERY' | null
  >(null);
  const [showPresetDesigner, setShowPresetDesigner] = useState<boolean>(false);
  const [showTrainingHistory, setShowTrainingHistory] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [scrollOffsetY, setScrollOffsetY] = useState<number>(0);
  const [postWorkoutSummary, setPostWorkoutSummary] = useState<PostWorkoutEncouragementSummary | null>(null);
  const [lastCompletedWorkout, setLastCompletedWorkout] = useState<CompletedWorkoutRecord | null>(null);
  const [lastCompletedSummary, setLastCompletedSummary] = useState<PostWorkoutEncouragementSummary | null>(null);
  const [showShareReceipt, setShowShareReceipt] = useState<boolean>(false);
  const [sessionPresetTemplate, setSessionPresetTemplate] = useState<WorkoutPresetDefinition | null>(null);
  const [editingPresetDraft, setEditingPresetDraft] = useState<WorkoutPresetDefinition | null>(null);
  const [presetSavedInSession, setPresetSavedInSession] = useState<boolean>(false);
  const [platesModalTarget, setPlatesModalTarget] = useState<{
    blockId: string;
    mode: 'PLATES' | 'WARMUP';
  } | null>(null);
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

  // Micro-animation for Boss Damage / XP Ticker
  const microPulseAnim = useRef(new Animated.Value(1)).current;

  // Interval Tick for Session Elapsed Clock
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Superset Labels Calculation
  const supersetLabels = useMemo(
    () => computeSupersetDisplayLabels(exerciseBlocks),
    [exerciseBlocks]
  );

  // Total Checked Sets Count
  const completedSetCount = useMemo(
    () =>
      exerciseBlocks.reduce(
        (sum, blk) => sum + blk.sets.filter((s) => s.completed).length,
        0
      ),
    [exerciseBlocks]
  );

  // Active Session Reference from State Machine
  const activeSession = workoutMachine.activeSession;
  const phase = workoutMachine.phase;
  const activeGymId = activeSession?.arrivalBoon.gymId ?? selectedGym.id;
  const activeGymName = activeSession?.arrivalBoon.gymName ?? selectedGym.name;

  const hasActiveSessionProgress =
    phase !== 'Idle' || completedSetCount > 0 || cardioEntries.length > 0;

  const sessionElapsedSec = hasActiveSessionProgress
    ? Math.max(1, Math.floor((nowMs - sessionStartTimeRef.current) / 1000))
    : 0;

  const orderedSegments = useMemo<WorkoutCategory[]>(() => {
    if (!activeCategory) return [];
    const activeSet = new Set<WorkoutCategory>([activeCategory, ...secondaryCategories]);
    const validOrdered = segmentOrder.filter((c) => activeSet.has(c));
    for (const c of activeSet) {
      if (!validOrdered.includes(c)) validOrdered.push(c);
    }
    return validOrdered;
  }, [activeCategory, secondaryCategories, segmentOrder]);

  // Live Boss Current HP Math
  const maxBossHp = selectedBoss.maxHp;
  const currentBossHp = Math.max(0, maxBossHp - bossDamageAccumulated);
  const bossHpPct = Math.max(0, Math.min(100, Math.round((currentBossHp / maxBossHp) * 100)));

  // Live Session HUD XP & Gold Math
  const liveHudXp = (activeSession?.accumulatedMicroXp ?? 0) + liveSetsCount * 45;
  const liveHudGold = (activeSession?.accumulatedMicroGold ?? 0) + liveSetsCount * 20;
  const arrivalBoonActive = Boolean(arrivalBanner || activeSession?.arrivalBoon || true);

  // Toggle Wearable Connection
  const toggleWearableLink = async () => {
    if (!wearableLinked) {
      const granted = await wearableService.requestPermissions();
      if (granted) {
        setWearableLinked(true);
        sessionStartTimeRef.current = Date.now();
        await wearableService.startLiveSession((sample) => {
          setLiveBpm(sample.bpm);
        });
      }
    } else {
      setWearableLinked(false);
      await wearableService.stopLiveSession();
    }
  };

  // Start Online Hybrid Workout Session (Pre-flight -> DungeonActive)
  const handleStartHybridSession = useCallback(() => {
    if (workoutMachine.phase === 'Idle') {
      sessionStartTimeRef.current = Date.now();
      if (wearableLinked) {
        void wearableService.startLiveSession((sample) => setLiveBpm(sample.bpm));
      }
      startHybridSession({
        workoutType:
          activeCategory === 'SPORT'
            ? 'CARDIO_HIGH_INTENSITY'
            : activeCategory === 'CARDIO'
            ? 'CARDIO_LOW_MOD'
            : activeCategory === 'RECOVERY'
            ? 'ACTIVE_RECOVERY'
            : 'RESISTANCE',
        workoutCategory: activeCategory ?? 'GYM',
        trigger: 'GEOFENCE_GYM',
        gymId: selectedGym.id,
        gymName: selectedGym.name,
        lowEnergyMode: false,
        initialRestSeconds: 90,
      });
      triggerSensoryCue('GUILD_THRESHOLD_PULSE');
    }
  }, [
    activeCategory,
    selectedGym.id,
    selectedGym.name,
    startHybridSession,
    wearableLinked,
    workoutMachine.phase,
  ]);

  // Category Gateway Handlers
  const handleSelectPrimaryCategory = (category: WorkoutCategory) => {
    setActiveCategory(category);
    setSegmentOrder((prev) =>
      prev.includes(category) ? prev : [category, ...prev.filter((c) => c !== category)]
    );
  };

  const handleAddSecondarySegment = (category: WorkoutCategory) => {
    setSecondaryCategories((prev) => Array.from(new Set([...prev, category])));
    setSegmentOrder((prev) => {
      const base = prev.length > 0 ? prev : activeCategory ? [activeCategory] : [];
      return base.includes(category) ? base : [...base, category];
    });
  };

  const handleRemoveSecondarySegment = (category: WorkoutCategory) => {
    const remaining = orderedSegments.filter((c) => c !== category);
    if (remaining.length === 0) {
      setActiveCategory(null);
      setSecondaryCategories([]);
      setSegmentOrder([]);
      return;
    }
    const nextPrimary = activeCategory === category ? remaining[0]! : activeCategory!;
    const nextSecondary = remaining.filter((c) => c !== nextPrimary);
    setActiveCategory(nextPrimary);
    setSecondaryCategories(nextSecondary);
    setSegmentOrder(remaining);
  };

  const handleMoveSegment = (category: WorkoutCategory, direction: -1 | 1) => {
    const curOrder = [...orderedSegments];
    const idx = curOrder.indexOf(category);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= curOrder.length) return;
    const [moved] = curOrder.splice(idx, 1);
    if (!moved) return;
    curOrder.splice(targetIdx, 0, moved);
    setSegmentOrder(curOrder);
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleResetCategory = () => {
    setActiveCategory(null);
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

  const handleLoadPreset = (preset: WorkoutPresetDefinition) => {
    const stamp = Date.now();
    const rawBlocks = preset.blocks?.exerciseBlocks || [];
    const blocks: OfflineDraftExerciseBlock[] = rawBlocks.map((b, bIdx) => {
      const unit = resolveExerciseWeightUnit(
        exerciseGymPreferences,
        b.exerciseSlug,
        activeGymId,
        defaultWeightUnit
      );
      return {
        blockId: `blk_${stamp}_${bIdx + 1}`,
        exerciseId: b.exerciseSlug,
        exerciseName: b.exerciseName,
        supersetGroupId: b.supersetGroupId ?? null,
        weightUnit: unit,
        sets: b.sets.map((s, sIdx) => ({
          id: `set_${stamp}_${bIdx + 1}_${sIdx + 1}`,
          weightKgStr: formatCleanWeightNumber(
            convertKgToDisplayWeight(s.targetWeightKg || 60, unit)
          ),
          repsStr: String(s.targetReps || 8),
          isWarmup: s.setType === 'WARMUP',
          setType: s.setType || 'NORMAL',
          rpe: s.targetRpe ?? 8.5,
          supersetGroupId: b.supersetGroupId ?? null,
          completed: false,
        })),
      };
    });

    if (blocks.length > 0) {
      setExerciseBlocks(blocks);
    }
    setActiveCategory(preset.category || 'GYM');
    triggerSensoryCue('WORKOUT_PRESET_LOADED');
  };

  const handleLoadSessionIntoWorkout = useCallback(
    (workout: CompletedWorkoutRecord) => {
      const nowMs = Date.now();
      const blocks: OfflineDraftExerciseBlock[] = (workout.exercises || []).map((ex, bIdx) => {
        const unit = resolveExerciseWeightUnit(
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
          weightUnit: unit,
          sets: (ex.sets || []).map((s, sIdx) => ({
            id: `set_hist_${nowMs}_${bIdx + 1}_${sIdx + 1}`,
            weightKgStr: formatCleanWeightNumber(
              convertKgToDisplayWeight(s.weightKg ?? 0, unit)
            ),
            repsStr: String(s.reps ?? 0),
            isWarmup: s.setType === 'WARMUP' || !!s.isWarmup,
            setType: s.setType || 'NORMAL',
            rpe: s.rpe ?? 8.5,
            supersetGroupId: null,
            completed: false,
          })),
        };
      });

      if (blocks.length > 0) {
        setExerciseBlocks(blocks);
      }
      setActiveCategory('GYM');
      setShowTrainingHistory(false);
      triggerSensoryCue('WORKOUT_PRESET_LOADED');
    },
    [activeGymId, defaultWeightUnit, exerciseGymPreferences]
  );

  // Resistance Exercise Set Row Handlers (Smart Mid-Workout Swap)
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

    setExerciseBlocks((prev) =>
      prev.map((b) => {
        if (b.blockId !== blockId) return b;
        return {
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
        };
      })
    );
    recordRecentActivity(exerciseId);
    setOpenExercisePickerBlockId(null);
  };

  const orderedSegmentsRef = useRef<WorkoutCategory[]>(orderedSegments);
  orderedSegmentsRef.current = orderedSegments;

  const exerciseBlocksRef = useRef<OfflineDraftExerciseBlock[]>(exerciseBlocks);
  exerciseBlocksRef.current = exerciseBlocks;

  const blockPanRespondersRef = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const segmentPanRespondersRef = useRef<
    Partial<Record<WorkoutCategory, ReturnType<typeof PanResponder.create>>>
  >({});

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
              setOpenBlockMenuId(null);
              triggerSensoryCue('SET_MICRO_REWARD_TICK');
            }, 220);
          },
          onPanResponderMove: (_evt, gestureState) => {
            if (activeDragBlockIdRef.current !== blockId) {
              if (Math.abs(gestureState.dx) > 12 || Math.abs(gestureState.dy) > 12) {
                if (dragHoldTimerRef.current) {
                  clearTimeout(dragHoldTimerRef.current);
                  dragHoldTimerRef.current = null;
                }
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
                  setExerciseBlocks(swapped);
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
                  setExerciseBlocks(swapped);
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
    [blockDragAnimY, clearActiveDragState]
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
                if (dragHoldTimerRef.current) {
                  clearTimeout(dragHoldTimerRef.current);
                  dragHoldTimerRef.current = null;
                }
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
                  setSegmentOrder(curOrder);
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
                  setSegmentOrder(curOrder);
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
    [clearActiveDragState, segmentDragAnimY]
  );

  const handleSetOrAppendDesignation = (blockId: string, targetType: SetType) => {
    setExerciseBlocks((prev) =>
      prev.map((b) => {
        if (b.blockId !== blockId) return b;
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
            sets: b.sets.map((s, idx) =>
              idx === targetIdx
                ? {
                    ...s,
                    setType: targetType,
                    isWarmup: targetType === 'WARMUP',
                    rpe: targetType === 'FAILURE' || targetType === 'AMRAP' ? 10 : s.rpe,
                  }
                : s
            ),
          };
        }
        const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const lastRow = b.sets[b.sets.length - 1];
        return {
          ...b,
          sets: [
            ...b.sets,
            {
              id: `set_${stamp}`,
              weightKgStr: lastRow?.weightKgStr ?? '',
              repsStr: lastRow?.repsStr ?? '',
              isWarmup: targetType === 'WARMUP',
              setType: targetType,
              rpe: targetType === 'FAILURE' || targetType === 'AMRAP' ? 10 : (lastRow?.rpe ?? 8.5),
              completed: false,
            },
          ],
        };
      })
    );
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleAbandonRaidAndExit = useCallback(() => {
    setRestTargetEndTimeMs(null);
    setRestStartedAtMs(null);
    setRestCenterModalVisible(false);
    setRestTimerPinned(false);
    cancelRestTimerNotification().catch(() => {});
    abandonHybridSession();
    setActiveCategory(null);
    setSecondaryCategories([]);
    setSegmentOrder([]);
    setCardioEntries([]);
    setBossDamageAccumulated(0);
    setLiveSetsCount(0);
    setExerciseBlocks((prev) =>
      prev.map((b) => ({
        ...b,
        sets: b.sets.map((s) => ({ ...s, completed: false })),
      }))
    );
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
    if (onBackToLanding) {
      onBackToLanding();
    }
  }, [abandonHybridSession, onBackToLanding]);

  const handleBackPress = useCallback(() => {
    // 1. On the Select Training Discipline landing page (selectedCategory === null):
    // immediately exit back to the Main Hub (LandingScreen)
    if (!activeCategory && phase === 'Idle') {
      if (onBackToLanding) {
        onBackToLanding();
      }
      return;
    }

    // 2. Inside an active workout: if 0 sets logged, 0 conditioning segments logged, and boss not engaged,
    // return cleanly to the Select Training Discipline landing page
    if (phase === 'Idle' && completedSetCount === 0 && cardioEntries.length === 0) {
      setActiveCategory(null);
      setSecondaryCategories([]);
      setSegmentOrder([]);
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
      return;
    }

    // 3. In an active raid (DungeonActive / Resting) or sets/segments logged:
    // prompt to Abandon Raid, reset state, trigger feedback banner, and navigate back to Main Hub
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm('Abandon active raid and retreat to the Sanctum?')) {
        handleAbandonRaidAndExit();
      }
      return;
    }

    Alert.alert(
      'Abandon Raid?',
      'Retreat from the active dungeon raid and return to the Main Hub?',
      [
        { text: 'Keep Training', style: 'cancel' },
        {
          text: 'Abandon Raid',
          style: 'destructive',
          onPress: handleAbandonRaidAndExit,
        },
      ]
    );
  }, [
    activeCategory,
    cardioEntries.length,
    completedSetCount,
    handleAbandonRaidAndExit,
    onBackToLanding,
    phase,
  ]);

  const handleToggleBlockWeightUnit = (blockId: string) => {
    const target = exerciseBlocks.find((b) => b.blockId === blockId);
    if (!target) return;
    const oldUnit = resolveBlockUnit(target);
    const nextUnit: WeightUnit = oldUnit === 'KG' ? 'LBS' : 'KG';

    saveExerciseWeightUnit({
      exerciseId: target.exerciseId,
      unit: nextUnit,
      activeGymId,
      activeGymName,
    });

    setExerciseBlocks((prev) =>
      prev.map((b) => {
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
      })
    );
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
    setExerciseBlocks((prev) =>
      prev.map((b) => {
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
      })
    );
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
    setExerciseBlocks((prev) =>
      prev.map((b) =>
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
      )
    );
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleInsertWarmupSets = (
    blockId: string,
    warmupSets: GeneratedWarmupSet[],
    unit: WeightUnit
  ) => {
    if (warmupSets.length === 0) return;
    const stamp = Date.now();
    setExerciseBlocks((prev) =>
      prev.map((b) => {
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
      })
    );
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
    setExerciseBlocks((prev) =>
      prev.map((b) =>
        b.blockId === blockId
          ? {
              ...b,
              sets: b.sets.map((s) => (s.id === setId ? { ...s, [field]: cleaned } : s)),
            }
          : b
      )
    );
  };

  const handleToggleSuperset = (blockIndex: number) => {
    setExerciseBlocks((prev) => {
      const blocks = [...prev];
      const cur = blocks[blockIndex];
      const next = blocks[blockIndex + 1];
      if (!cur) return prev;

      if (cur.supersetGroupId) {
        const targetGroup = cur.supersetGroupId;
        return blocks.map((b) =>
          b.supersetGroupId === targetGroup ? { ...b, supersetGroupId: undefined } : b
        );
      }

      const existingGroups = new Set(blocks.map((b) => b.supersetGroupId).filter(Boolean));
      const letters = ['A', 'B', 'C', 'D'];
      const nextLetter = letters.find((l) => !existingGroups.has(l)) || `G${existingGroups.size + 1}`;

      return blocks.map((b, idx) => {
        if (idx === blockIndex || (next && idx === blockIndex + 1)) {
          return { ...b, supersetGroupId: nextLetter };
        }
        return b;
      });
    });
    triggerSensoryCue('SUPERSET_TRANSITION_TICK');
  };

  const handleCycleSetType = (blockId: string, setId: string) => {
    setExerciseBlocks((prev) =>
      prev.map((b) =>
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
      )
    );
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleSetRpeValue = (blockId: string, setId: string, nextRpe: number) => {
    setExerciseBlocks((prev) =>
      prev.map((b) =>
        b.blockId === blockId
          ? {
              ...b,
              sets: b.sets.map((s) => (s.id === setId ? { ...s, rpe: nextRpe } : s)),
            }
          : b
      )
    );
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleAddSetRow = (blockId: string) => {
    setExerciseBlocks((prev) => {
      const targetBlock = prev.find((b) => b.blockId === blockId);
      const targetSupersetGroup = targetBlock?.supersetGroupId;

      return prev.map((b) => {
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
      });
    });
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleRemoveSetRow = (blockId: string, setId: string) => {
    setExerciseBlocks((prev) =>
      prev.map((b) => {
        if (b.blockId !== blockId || b.sets.length <= 1) return b;
        return {
          ...b,
          sets: b.sets.filter((s) => s.id !== setId),
        };
      })
    );
  };

  const handleAddExerciseBlock = () => {
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const usedIds = new Set(exerciseBlocks.map((b) => b.exerciseId));
    const nextExercise =
      resistanceCatalog.find((e) => !usedIds.has(e.id)) ?? resistanceCatalog[0];
    const nextId = nextExercise?.id ?? 'bench_press';
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

    setExerciseBlocks((prev) => [
      ...prev,
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
    ]);
  };

  const handleRemoveExerciseBlock = (blockId: string) => {
    setExerciseBlocks((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((b) => b.blockId !== blockId);
    });
  };

  // Primary Checkbox Set Completed Event Handler (Ticking DONE + 1-Tap Ghost Auto-Fill)
  const handleToggleSetCompleted = (blockId: string, setId: string) => {
    setValidationError(null);
    let justCompleted = false;
    let completedRow: OfflineDraftSetRow | null = null;
    let completedBlock: OfflineDraftExerciseBlock | null = null;

    const nextBlocks = exerciseBlocks.map((b) => {
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
          return completedRow;
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

    setExerciseBlocks(nextBlocks);

    // If user unchecked a set: cancel any running rest timer
    if (!justCompleted) {
      setRestTargetEndTimeMs(null);
      setRestStartedAtMs(null);
      setRestCenterModalVisible(false);
      setRestTimerPinned(false);
      cancelRestTimerNotification().catch(() => {});
      return;
    }

    // Auto-transition from Idle to DungeonActive if not engaged yet!
    if (workoutMachine.phase === 'Idle') {
      handleStartHybridSession();
    }

    if (completedRow && completedBlock) {
      const exBlock = completedBlock as OfflineDraftExerciseBlock;
      const setRow = completedRow as OfflineDraftSetRow;
      const blockUnit = resolveBlockUnit(exBlock);
      const weightKg = convertDisplayWeightToKg(
        Math.max(0, Number(setRow.weightKgStr) || 0),
        blockUnit
      );
      const reps = Number(setRow.repsStr) || 0;
      const rowRpe = setRow.rpe ?? 8.5;
      const rowSetType = setRow.setType || 'NORMAL';
      const rowIsWarmup = setRow.isWarmup || rowSetType === 'WARMUP';

      recordRecentActivity(exBlock.exerciseId);
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
      requestNotificationPermissions().catch(() => {});

      // Boss Damage Calculation & Sensory Feedback
      const baseDmg = Math.round(
        weightKg * reps * (rowIsWarmup ? 0.35 : 1.0) * (rowSetType === 'DROP_SET' ? 1.15 : 1.0)
      );
      const bossDmg = Math.max(15, baseDmg);
      setBossDamageAccumulated((prev) => prev + bossDmg);
      setLastDamageDealt(bossDmg);
      setBossAnimState('take_hit');
      playSfx('combat_hit');
      setLiveSetsCount((c) => c + 1);

      // Micro Pulse animation for boss feedback
      microPulseAnim.setValue(1.08);
      Animated.spring(microPulseAnim, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        setBossAnimState('idle');
      }, 700);

      setTimeout(() => {
        setLastDamageDealt(null);
      }, 1800);

      // Log Hybrid Set to Context Machine
      logHybridSet({
        exerciseId: exBlock.exerciseId,
        reps,
        weightKg,
        rpe: rowRpe,
        isWarmup: rowIsWarmup,
        setType: rowSetType,
        supersetGroupId: exBlock.supersetGroupId,
        nextSetHint: {
          exerciseId: exBlock.exerciseId,
          exerciseName: exBlock.exerciseName ?? exBlock.exerciseId,
          weightKg,
          reps,
        },
      });

      // Check PR unlockables
      const liveE1rm = rowIsWarmup ? 0 : calculateE1RM(weightKg, reps);
      const priorPr = historicalPRs[exBlock.exerciseId]?.bestE1RM ?? 0;
      const prBadge = evaluateUnlockables(
        exBlock.exerciseName ?? exBlock.exerciseId,
        weightKg,
        reps,
        liveE1rm,
        priorPr
      );
      if (prBadge) {
        setCelebrationBadge(prBadge);
        triggerSensoryCue('DUNGEON_CLEARED_FANFARE');
      }

      // Check if all sets across all exercises are complete
      const hasRemainingSets = nextBlocks.some((b) => b.sets.some((s) => !s.completed));
      if (!hasRemainingSets) {
        setRestTargetEndTimeMs(null);
        setRestStartedAtMs(null);
        setRestCenterModalVisible(false);
        setRestTimerPinned(false);
        cancelRestTimerNotification().catch(() => {});
        triggerSensoryCue('DUNGEON_CLEARED_FANFARE');
        return;
      }

      // Dynamic Rest Transition Resolution
      const transition = resolveSetCompletionTransition({
        blocks: nextBlocks,
        completedBlockId: blockId,
        completedSetId: setId,
      });

      const blockEx = exercises.find((e) => e.id === exBlock.exerciseId);
      const plan = calculateDynamicRestPlan({
        setType: rowSetType,
        isWarmup: rowIsWarmup,
        rpe: rowRpe,
        isCompound: blockEx ? blockEx.baseXpFactor >= 1.15 : true,
        nextSameExerciseSetIsDropSet: transition.nextSameExerciseSetIsDropSet,
        isMidSupersetRound: transition.isMidSupersetRound,
        nextSupersetExerciseName: transition.nextSupersetExerciseName,
        nextSupersetMemberLabel: transition.nextSupersetMemberLabel,
      });

      const spiritBonusSec = Math.min(30, (stats.SPIRIT?.level ?? 1) * 2);
      const effectiveSec =
        customRestDurationSec !== null && plan.mode === 'WORKING_REST'
          ? customRestDurationSec
          : plan.seconds + spiritBonusSec;
      const startedMs = Date.now();

      setRestRecommendedSec(plan.seconds);
      setRestStartedAtMs(startedMs);
      setRestTotalSeconds(effectiveSec);
      setRestTargetEndTimeMs(startedMs + effectiveSec * 1000);
      setRestMode(plan.mode);
      setRestHeadline(plan.headline);
      setRestSubtext(plan.subtext);
      setRestCenterModalVisible(true);
      setRestTimerPinned(false);

      if (transition.nextSameExerciseSetIsDropSet) {
        triggerSensoryCue('DROP_SET_IMMEDIATE_TICK');
      } else if (transition.isMidSupersetRound) {
        triggerSensoryCue('SUPERSET_TRANSITION_TICK');
      }
    }
  };

  // Non-Resistance Segment Logging (Cardio / Sport / Flexibility)
  const handleAddCardioEntry = (
    targetModality: 'CARDIO' | 'SPORT' | 'RECOVERY' = 'CARDIO'
  ) => {
    setValidationError(null);
    const catalog =
      targetModality === 'SPORT'
        ? sportCatalog
        : targetModality === 'RECOVERY'
          ? recoveryCatalog
          : pureCardioCatalog;
    const chosenId =
      selectedIdByModality[targetModality] || catalog[0]?.id || 'outdoor_tempo_cycling';
    const exMeta =
      catalog.find((e) => e.id === chosenId) ??
      exercises.find((e) => e.id === chosenId) ??
      catalog[0];
    const mins = Number(cardioMinutesStr) || 0;
    const durationSeconds = Math.max(60, Math.round(mins * 60));

    if (durationSeconds <= 0) {
      setValidationError('Enter valid duration before adding segment.');
      return;
    }

    if (workoutMachine.phase === 'Idle') {
      handleStartHybridSession();
    }

    const targetExerciseId = exMeta?.id ?? chosenId;
    const targetExerciseName = exMeta?.name ?? chosenId;
    const activityType: 'CARDIO' | 'RECOVERY_MOBILITY' =
      exMeta?.category === 'RECOVERY_MOBILITY' || targetModality === 'RECOVERY'
        ? 'RECOVERY_MOBILITY'
        : 'CARDIO';
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    setCardioEntries((prev) => {
      const existingIdx = prev.findIndex(
        (c) =>
          c.exerciseId === targetExerciseId &&
          c.averageHrZone === cardioZone &&
          (c.rpe ?? 7.5) === cardioRpe
      );
      if (existingIdx >= 0) {
        return prev.map((c, idx) =>
          idx === existingIdx
            ? {
                ...c,
                durationSeconds: c.durationSeconds + durationSeconds,
                workoutCategory: c.workoutCategory ?? targetModality,
              }
            : c
        );
      }
      return [
        ...prev,
        {
          id: `cardio_${stamp}`,
          exerciseId: targetExerciseId,
          exerciseName: targetExerciseName,
          activityType,
          workoutCategory: targetModality,
          durationSeconds,
          averageHrZone: cardioZone,
          rpe: cardioRpe,
        },
      ];
    });

    // Record segment in engine hybrid state
    recordHybridCardioSegment({
      exerciseId: targetExerciseId,
      activityType,
      durationSeconds,
      averageHrZone: cardioZone,
    });

    // Boss damage feedback for cardio segment
    const cardioDmg = Math.round(mins * 12 * (cardioZone >= 4 ? 1.5 : 1.0));
    setBossDamageAccumulated((prev) => prev + cardioDmg);
    setLastDamageDealt(cardioDmg);
    setBossAnimState('take_hit');
    playSfx('combat_hit');

    setTimeout(() => setBossAnimState('idle'), 700);
    setTimeout(() => setLastDamageDealt(null), 1800);

    recordRecentActivity(targetExerciseId);
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleAdjustCardioDuration = (entryId: string, deltaSeconds: number) => {
    setCardioEntries((prev) =>
      prev.map((c) =>
        c.id === entryId
          ? {
              ...c,
              durationSeconds: Math.max(300, c.durationSeconds + deltaSeconds),
            }
          : c
      )
    );
    triggerSensoryCue('SET_MICRO_REWARD_TICK');
  };

  const handleRemoveCardioEntry = (entryId: string) => {
    setCardioEntries((prev) => prev.filter((c) => c.id !== entryId));
  };

  // Rest Timer Controller Handlers
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
        setRestTimerPinned(false);
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
        setRestTimerPinned(false);
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
    setRestTimerPinned(false);
    cancelRestTimerNotification().catch(() => {});
  }, []);

  const handleRestComplete = useCallback(() => {}, []);

  // Finish Workout Action -> Transition to Celebratory Spoils Receipt
  const handleFinishWorkout = async () => {
    setRestTargetEndTimeMs(null);
    setRestStartedAtMs(null);
    setRestCenterModalVisible(false);
    setRestTimerPinned(false);
    cancelRestTimerNotification().catch(() => {});

    if (completedSetCount === 0 && cardioEntries.length === 0) {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
        if (window.confirm('No sets or segments have been logged yet. Abandon the raid and return to the Sanctum?')) {
          handleAbandonRaidAndExit();
        }
        return;
      }
      Alert.alert(
        'Abandon Raid',
        'No sets or segments have been logged yet. Would you like to abandon the raid?',
        [
          { text: 'Keep Training', style: 'cancel' },
          {
            text: 'Abandon Raid',
            style: 'destructive',
            onPress: handleAbandonRaidAndExit,
          },
        ]
      );
      return;
    }

    if (workoutMachine.phase === 'Idle') {
      handleStartHybridSession();
    }

    let telemetryPayload: any = undefined;
    if (wearableLinked) {
      const endTime = Date.now();
      const samples = await wearableService.getHeartRateSamples(
        sessionStartTimeRef.current,
        endTime
      );
      await wearableService.stopLiveSession();
      const durationSec = Math.max(1, Math.round((endTime - sessionStartTimeRef.current) / 1000));
      const verification = verifyTelemetry(samples, durationSec, {
        workoutType: activeSession?.workoutType,
        targetHrZone: cardioZone,
      });
      telemetryPayload = {
        samples,
        source: wearableService.getPlatformSource(),
        isHardwareVerified: verification.verified,
        confidenceScore: verification.confidenceScore,
      };
    }

    // Build CompletedWorkoutRecord for post-workout summary analyzer
    const historyExercises: CompletedExerciseEntry[] = [];
    for (const block of exerciseBlocks) {
      const exMeta = exercises.find((e) => e.id === block.exerciseId);
      const bUnit = resolveBlockUnit(block);
      const completedRows = block.sets.filter((s) => s.completed && (Number(s.repsStr) || 0) > 0);
      if (completedRows.length > 0) {
        historyExercises.push({
          exerciseId: block.exerciseId,
          exerciseName: exMeta?.name ?? block.exerciseName ?? block.exerciseId,
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

    const validCardio = cardioEntries.filter((c) => c.durationSeconds > 0);
    const totalCardioSeconds = validCardio.reduce((sum, c) => sum + c.durationSeconds, 0);
    const effectiveDurationSeconds = Math.max(sessionElapsedSec, totalCardioSeconds);

    const nowMs = Date.now();
    const currentWorkout: CompletedWorkoutRecord = {
      id: `online_hist_${nowMs}`,
      characterId: activeCharacterId ?? null,
      gymId: activeGymId,
      gymName: activeGymName,
      source: 'ONLINE',
      performedAtIso: new Date(nowMs).toISOString(),
      durationSeconds: effectiveDurationSeconds,
      workoutCategory: activeCategory ?? 'GYM',
      workoutType: 'HYBRID',
      exercises: historyExercises,
      cardioEntries: validCardio.map((c) => ({
        id: c.id,
        exerciseId: c.exerciseId,
        exerciseName: c.exerciseName,
        activityType: c.activityType,
        workoutCategory: c.workoutCategory,
        durationSeconds: c.durationSeconds,
        averageHrZone: c.averageHrZone,
        rpe: c.rpe ?? null,
      })),
    };

    const summary = evaluatePostWorkoutSummary({
      currentWorkout,
      previousWorkouts: workoutHistory,
      consistencyStreak: consistencyStreak + 1,
      cardioSegmentCount: cardioEntries.length,
    });

    const draftTemplate: WorkoutPresetDefinition = {
      id: '',
      slug: '',
      name: '',
      category: activeCategory ?? 'GYM',
      notes: '',
      isSystemSeed: false,
      blocks: {
        exerciseBlocks: exerciseBlocks.map((b) => {
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
        cardioSegments: cardioEntries.map((c, idx) => ({
          segmentId: c.id || `seg_${idx + 1}`,
          exerciseSlug: c.exerciseId,
          exerciseName: c.exerciseName,
          activityType: c.activityType,
          targetDurationMinutes: Math.max(1, Math.round(c.durationSeconds / 60)),
          targetHrZone: c.averageHrZone,
          targetRpe: c.rpe ?? null,
        })),
        sessionRpeTarget: null,
      },
    };

    const res = finishHybridSession(selectedBoss.id || undefined, telemetryPayload);
    if (!res.ok) {
      setValidationError(res.error ?? 'Unable to consolidate workout.');
      return;
    }

    setValidationError(null);
    setLastCompletedWorkout(currentWorkout);
    setLastCompletedSummary(summary);
    setPostWorkoutSummary(summary);
    setSessionPresetTemplate(draftTemplate);
    setPresetSavedInSession(false);
  };

  const renderShareableReceiptModal = () => {
    const rp = activeSession?.rewardPayload;
    return (
      <ShareableWorkoutReceiptModal
        visible={showShareReceipt && lastCompletedWorkout !== null}
        workout={lastCompletedWorkout}
        summary={lastCompletedSummary ?? postWorkoutSummary}
        initialUnit={defaultWeightUnit}
        streakFallback={consistencyStreak + 1}
        rpgContext={{
          bossName: selectedBoss.name,
          gameMode,
          finalXpByStat: rp?.finalXpByStat ?? null,
          totalGoldAwarded: rp?.totalGoldAwarded ?? null,
          lootChestTier: rp?.lootChest.tier ?? null,
          lootChestName: rp?.lootChest.chestName ?? null,
          raidEnergy: lastHybridConsolidation?.raidEnergy ?? null,
          critTriggered: Boolean(rp?.workoutEvaluation.criticalTrainingBonus.triggered),
        }}
        onClose={() => setShowShareReceipt(false)}
      />
    );
  };

  const renderPostWorkoutSummaryModal = () => (
    <Modal
      visible={postWorkoutSummary !== null && !showPresetDesigner && !showShareReceipt}
      transparent
      animationType="fade"
      onRequestClose={() => setPostWorkoutSummary(null)}
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
              testID="post-workout-share-receipt-btn"
            >
              <Text style={styles.shareReceiptActionBtnText}>
                🧾 Share 9:16 RPG Raid Receipt
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
              onPress={() => setPostWorkoutSummary(null)}
              activeOpacity={0.7}
              testID="post-workout-continue-btn"
            >
              <Text style={styles.postWorkoutContinueBtnText}>Continue to Spoils →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Category Visibility Flags
  const showResistanceUI =
    !activeCategory || activeCategory === 'GYM' || secondaryCategories.includes('GYM');
  const showCardioUI = activeCategory === 'CARDIO' || secondaryCategories.includes('CARDIO');
  const showSportUI = activeCategory === 'SPORT' || secondaryCategories.includes('SPORT');
  const showRecoveryUI =
    activeCategory === 'RECOVERY' || secondaryCategories.includes('RECOVERY');

  // ==========================================================================
  // PHASE 3A VIEW: `DungeonComplete` (Consolidated Spoils Hero Receipt)
  // ==========================================================================
  if (phase === 'DungeonComplete' && activeSession?.rewardPayload) {
    const rp = activeSession.rewardPayload;
    const crit = rp.workoutEvaluation.criticalTrainingBonus;

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.dungeonClearedHeroCard}>
          <Text style={styles.clearedEyebrow}>PHASE 3 • DELAYED GRATIFICATION CONSOLIDATION</Text>
          <Text style={styles.clearedHeadline}>🏰 DUNGEON CLEARED!</Text>
          <Text style={styles.clearedSub}>
            Guild Sanctum: {selectedGym.name} • Boss Slain: {selectedBoss.name}
          </Text>

          {/* Biometric Telemetry Mode Badge */}
          <View
            style={[
              styles.verificationBadge,
              gameMode === 'IRONMAN_VERIFIED'
                ? styles.verificationBadgeIronman
                : styles.verificationBadgeHonesty,
            ]}
          >
            <Text
              style={[
                styles.verificationBadgeText,
                gameMode === 'IRONMAN_VERIFIED'
                  ? styles.verificationBadgeIronmanText
                  : styles.verificationBadgeHonestyText,
              ]}
            >
              {gameMode === 'IRONMAN_VERIFIED'
                ? '🛡️ IRONMAN VERIFIED • Biometric Telemetry Authenticated'
                : '📝 MANUAL HONESTY • Community Standard Mode'}
            </Text>
          </View>

          {/* Effort & Volume Telemetry Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{rp.totalTonnageKg.toLocaleString()} kg</Text>
              <Text style={styles.metricLabel}>Total Tonnage</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{rp.totalReps}</Text>
              <Text style={styles.metricLabel}>Working Reps ({rp.workingSetCount} sets)</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{rp.averageRpe ?? '—'}</Text>
              <Text style={styles.metricLabel}>Mean RPE</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={[styles.metricValue, { color: COLORS.gold }]}>
                {rp.effectiveTotalMultiplier}x
              </Text>
              <Text style={styles.metricLabel}>Total XP Mult</Text>
            </View>
          </View>

          {/* Consolidated XP & Currency Payout */}
          <View style={styles.xpPillsRow}>
            {Object.entries(rp.finalXpByStat)
              .filter(
                ([stat, xp]) =>
                  (xp ?? 0) > 0 ||
                  stat === 'STRENGTH' ||
                  stat === 'ENDURANCE' ||
                  stat === 'AGILITY'
              )
              .map(([stat, xp]) => {
                const meta = STAT_XP_META[stat] ?? {
                  label: stat,
                  emoji: '✨',
                  color: COLORS.textPrimary,
                };
                return (
                  <Text key={stat} style={[styles.xpPill, { color: meta.color }]}>
                    {meta.emoji} +{xp} {meta.label} XP
                  </Text>
                );
              })}
            <Text style={[styles.xpPill, { color: COLORS.gold }]}>
              🪙 +{rp.totalGoldAwarded}g
            </Text>
          </View>

          {/* Anti-Streak Collapse Resilience Banner */}
          {rp.resilienceBonus.triggered && (
            <View style={styles.resilienceAwardedCard}>
              <Text style={styles.resilienceAwardedTitle}>
                🛡️ {rp.resilienceBonus.badgeTitle} (+{rp.resilienceBonus.flatBonusXp} XP &amp; +
                {rp.resilienceBonus.flatBonusGold}g)
              </Text>
              <Text style={styles.resilienceAwardedBody}>{rp.resilienceBonus.message}</Text>
            </View>
          )}

          {/* Progressive Overload Crit Banner */}
          {crit.triggered && crit.guaranteedLootDrop && (
            <View style={styles.prCritCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {getItemIconSource(crit.guaranteedLootDrop.itemSlug) ? (
                  <Image
                    source={getItemIconSource(crit.guaranteedLootDrop.itemSlug) as any}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: RARITY_COLORS[crit.guaranteedLootDrop.rarity] ?? COLORS.gold,
                    }}
                    contentFit="cover"
                  />
                ) : (
                  <Image
                    source={{ uri: LOOT_SPRITES.relic_trophy }}
                    style={{ width: 44, height: 44 }}
                    contentFit="contain"
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.prCritHeadline}>
                    💥 CRITICAL TRAINING BONUS! (+{crit.totalBonusXp} Bonus XP)
                  </Text>
                  <Text style={styles.prCritSub}>
                    Guaranteed Overload Drop: {crit.guaranteedLootDrop.quantity}x{' '}
                    {crit.guaranteedLootDrop.itemName} [{crit.guaranteedLootDrop.rarity}]
                  </Text>
                </View>
              </View>
            </View>
          )}

          {lastHybridConsolidation && lastHybridConsolidation.injectedBuffs.length > 0 && (
            <Text style={styles.injectedText}>
              🏰 Injected Live 24h Dungeon Buff:{' '}
              {lastHybridConsolidation.injectedBuffs.map((b) => b.buffName).join(', ')}
            </Text>
          )}
          {lastHybridConsolidation && lastHybridConsolidation.raidEnergy > 0 && (
            <Text style={styles.raidEnergyText}>
              🐉 Channeled {lastHybridConsolidation.raidEnergy.toLocaleString()} Workout Energy into
              Guild Raid Boss!
            </Text>
          )}
        </View>

        <Pressable
          style={styles.shareReceiptActionBtn}
          onPress={() => {
            triggerSensoryCue('SET_MICRO_REWARD_TICK');
            setShowShareReceipt(true);
          }}
        >
          <Text style={styles.shareReceiptActionBtnText}>
            🧾 SHARE 9:16 GUILD RAID RECEIPT
          </Text>
        </Pressable>

        <Pressable style={styles.thresholdStartBtn} onPress={proceedToHybridLootReview}>
          <Text style={styles.thresholdStartTitle}>
            🎁 ENTER LOOT REVIEW &amp; STAT ALLOCATION
          </Text>
          <Text style={styles.thresholdStartSub}>
            Unseal [{rp.lootChest.tier}] {rp.lootChest.chestName} • Allocate Talent &amp; Gear Upgrades
          </Text>
        </Pressable>

        {renderPostWorkoutSummaryModal()}
        {renderShareableReceiptModal()}

        <PresetDesignerModal
          visible={showPresetDesigner}
          editingPreset={editingPresetDraft ?? sessionPresetTemplate}
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
      </ScrollView>
    );
  }

  // ==========================================================================
  // PHASE 3B VIEW: `LootReview` (Unseal Chest & Upgrade Progression)
  // ==========================================================================
  if (phase === 'LootReview' && activeSession?.rewardPayload) {
    const rp = activeSession.rewardPayload;
    const chest = rp.lootChest;
    const chestColor = RARITY_COLORS[chest.tier] ?? COLORS.gold;
    const totalAvailTalentPts = Object.values(stats).reduce((acc, s) => acc + s.pointsAvailable, 0);

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Effort-Gated Loot Chest Sequence */}
        <View style={[styles.chestCard, { borderColor: chestColor }]}>
          <Text style={styles.clearedEyebrow}>EFFORT &amp; CONSISTENCY REWARD CHEST</Text>

          <View style={{ alignItems: 'center', marginVertical: 12 }}>
            <Image
              source={{ uri: getLootChestSpriteUri(chest.tier) }}
              style={{ width: 84, height: 84 }}
              contentFit="contain"
            />
            <Text style={[styles.chestTitle, { color: chestColor, marginTop: 8 }]}>
              {chest.chestName} [{chest.tier}]
            </Text>
          </View>

          <Text style={styles.helperText}>
            Effort Quality Score: {chest.effortQualityScore}/100 (Overload +
            {chest.scoreBreakdown.progressiveOverloadPoints} • RPE/Intensity +
            {chest.scoreBreakdown.rpeAndIntensityPoints} • Consistency +
            {chest.scoreBreakdown.consistencyPoints} • Resilience +
            {chest.scoreBreakdown.resiliencePoints})
          </Text>

          {!chest.opened ? (
            <Pressable
              style={[styles.unsealChestBtn, { backgroundColor: chestColor }]}
              onPress={() => {
                openHybridLootChest();
                void audioManager.playSound('chest-open');
                triggerSensoryCue('CHEST_OPEN_REVEAL');
              }}
            >
              <Text style={styles.unsealChestBtnText}>✨ TAP TO UNSEAL {chest.tier} CHEST</Text>
            </Pressable>
          ) : (
            <View style={styles.revealedLootBox}>
              <Text style={styles.revealedHeader}>Unsealed Reliquary Drops:</Text>
              {chest.drops.map((d) => {
                const iconSrc = getItemIconSource(d.itemSlug);
                return (
                  <View key={d.itemSlug} style={styles.lootDropRow}>
                    {iconSrc ? (
                      <Image
                        source={iconSrc as any}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 6,
                          marginRight: 10,
                          borderWidth: 1,
                          borderColor: RARITY_COLORS[d.rarity] ?? COLORS.borderHighlight,
                        }}
                        contentFit="cover"
                      />
                    ) : (
                      <Image
                        source={{ uri: LOOT_SPRITES.ore_mythic }}
                        style={{ width: 22, height: 22, marginRight: 8 }}
                        contentFit="contain"
                      />
                    )}
                    <Text
                      style={[
                        styles.revealedDropLine,
                        { color: RARITY_COLORS[d.rarity] ?? COLORS.textPrimary, flex: 1 },
                      ]}
                    >
                      • {d.quantity}x {d.itemName} [{d.rarity}]
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Action Banner for Unspent Talent Points & Spoils */}
        <View style={styles.actionBannerCard}>
          <Text style={styles.actionBannerTitle}>
            ✨ {totalAvailTalentPts} Unspent Talent Points &amp; New Spoils Available
          </Text>
          <Text style={styles.actionBannerSub}>
            Focus lock lifted! Allocate stat talents and equip upgraded gear at your leisure.
          </Text>
          <View style={styles.actionBannerButtonsRow}>
            {onNavigateToTalents && (
              <Pressable style={styles.actionBannerBtn} onPress={onNavigateToTalents}>
                <Text style={styles.actionBannerBtnText}>✨ Open Talents</Text>
              </Pressable>
            )}
            {onNavigateToPaperdoll && (
              <Pressable
                style={[styles.actionBannerBtn, styles.actionBannerBtnPaperdoll]}
                onPress={onNavigateToPaperdoll}
              >
                <Text style={styles.actionBannerBtnText}>🛡️ Open Paperdoll</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Share 9:16 Raid Receipt Action */}
        <Pressable
          style={styles.shareReceiptActionBtn}
          onPress={() => {
            triggerSensoryCue('SET_MICRO_REWARD_TICK');
            setShowShareReceipt(true);
          }}
        >
          <Text style={styles.shareReceiptActionBtnText}>🧾 SHARE 9:16 GUILD RAID RECEIPT</Text>
        </Pressable>

        {/* Save Routine as Preset Action */}
        <Pressable
          style={styles.saveAsPresetBtn}
          onPress={() => {
            setEditingPresetDraft(sessionPresetTemplate);
            setShowPresetDesigner(true);
          }}
        >
          <Text style={styles.saveAsPresetBtnText}>💾 SAVE ROUTINE AS PRESET</Text>
        </Pressable>

        {/* Save & Return to Base Consolidation Button */}
        <Pressable
          style={styles.finishWorkoutBtn}
          onPress={() => {
            completeHybridReview();
            if (onFinishAndReturn) {
              onFinishAndReturn();
            }
          }}
        >
          <Text style={styles.finishWorkoutBtnText}>
            🏰 SAVE &amp; RETURN TO BASE
          </Text>
        </Pressable>

        {renderShareableReceiptModal()}

        <PresetDesignerModal
          visible={showPresetDesigner}
          editingPreset={editingPresetDraft ?? sessionPresetTemplate}
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

        <TrainingHistoryScreen
          visible={showTrainingHistory}
          onBack={() => setShowTrainingHistory(false)}
          onLoadSessionIntoWorkout={handleLoadSessionIntoWorkout}
        />
      </ScrollView>
    );
  }

  // ==========================================================================
  // PHASE 1 & 2 UNIVERSAL TABULAR WORKOUT SHEET (`Idle`, `DungeonActive`, `Resting`)
  // ==========================================================================
  return (
    <View style={styles.root}>
      {/* 1. Top Workout Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeftGroup}>
          <Pressable style={styles.backBtn} onPress={handleBackPress}>
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>

          <TouchableOpacity
            style={styles.topBarHistoryBtn}
            onPress={() => setShowTrainingHistory(true)}
            testID="online-history-top-btn"
            activeOpacity={0.7}
          >
            <Text style={styles.topBarHistoryText}>📊 History</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sessionTimerBadge}>
          <Text style={styles.sessionClock}>{formatDuration(sessionElapsedSec)}</Text>
          <Text style={styles.sessionSubRaid}>⚔️ Online Raid</Text>
        </View>
      </View>

      {/* 2. Pinned Rest Timer (Floating Banner above bottom edge / top when minimized) */}
      {restTargetEndTimeMs && restTimerPinned ? (
        <View style={styles.pinnedFloatingRestContainer}>
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
            onTapToFocus={() => {
              setRestCenterModalVisible(true);
              setRestTimerPinned(false);
            }}
            onSelectPreset={handleRestSelectPreset}
            recommendedSeconds={restRecommendedSec}
            scrollOffsetY={scrollOffsetY}
          />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          restTargetEndTimeMs && restTimerPinned ? styles.scrollContentWithPinnedTimer : null,
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isHoldingDragTarget && !draggingBlockId && !draggingSegment}
        onScroll={(e) => setScrollOffsetY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {validationError && (
          <View style={styles.validationBox}>
            <Text style={styles.validationText}>{validationError}</Text>
          </View>
        )}

        {/* 3. Sleek Pre-Flight Readiness Bar (Hidden while on Select Training Discipline landing page) */}
        {phase === 'Idle' && activeCategory !== null && (
          <View style={styles.preflightCompactCard} testID="workout-preflight-card">
            <View style={styles.preflightPillsRow}>
              <TouchableOpacity
                style={styles.preflightPill}
                onPress={() => setGymIndex((i) => i + 1)}
              >
                <Text style={styles.preflightPillText}>
                  📍 {selectedGym.name} ({selectedGym.xpMultiplier}x)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.preflightPill}
                onPress={() => setBossIndex((i) => i + 1)}
              >
                <Text style={styles.preflightPillText}>
                  🐉 Target: {selectedBoss.name}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.preflightPill, wearableLinked && styles.preflightPillActive]}
                onPress={async () => {
                  setWearableIndex((i) => i + 1);
                  await toggleWearableLink();
                }}
              >
                <Text
                  style={[
                    styles.preflightPillText,
                    wearableLinked && styles.preflightPillTextActive,
                  ]}
                >
                  ⌚ Wearable: {wearableLinked ? `${liveBpm} BPM` : wearableSource}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.engageBossBtn}
              onPress={handleStartHybridSession}
              testID="workout-preflight-enter-btn"
            >
              <Text style={styles.engageBossBtnText}>⚔️ Engage Boss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 4. Live Boss HP Bar & Mini Sprite Card (Intra-Workout: DungeonActive / Resting) */}
        {(phase === 'DungeonActive' || phase === 'Resting') && (
          <Animated.View
            style={[
              styles.liveBossCard,
              { transform: [{ scale: microPulseAnim }] },
            ]}
          >
            <View style={styles.bossMainRow}>
              {/* Mini Boss Avatar Frame with Animated Sprite and Damage Flash Overlay */}
              <View style={styles.bossAvatarFrame}>
                <SpriteAnimator
                  rig={selectedBoss.id === 'vaelgor' ? 'greatsword_skeleton' : 'demon_boss'}
                  state={bossAnimState}
                  size={48}
                />
                {lastDamageDealt !== null && (
                  <View style={styles.damageFlashBadge}>
                    <Text style={styles.damageFlashText}>-{lastDamageDealt} DMG</Text>
                  </View>
                )}
              </View>

              {/* Boss Name, Title & HP Bar */}
              <View style={styles.bossDetailCol}>
                <View style={styles.bossNameRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bossNameText}>
                      🐉 {selectedBoss.name} • {selectedBoss.title}
                    </Text>
                    <Text style={styles.bossHpNumText}>
                      HP {currentBossHp.toLocaleString()} / {maxBossHp.toLocaleString()} ({bossHpPct}%)
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.chevronToggleBtn}
                    onPress={() => setBossCardCollapsed(!bossCardCollapsed)}
                  >
                    <Text style={styles.chevronToggleText}>
                      {bossCardCollapsed ? '▼' : '▲'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Live Boss HP Progress Bar */}
                <View style={styles.bossHpTrack}>
                  <View style={[styles.bossHpFill, { width: `${bossHpPct}%` }]} />
                </View>
              </View>
            </View>

            {/* Collapsible Telemetry Row */}
            {!bossCardCollapsed && (
              <View style={styles.bossTelemetryRow}>
                <Text style={styles.liveCounterBadge} numberOfLines={1}>
                  ✨ +{liveHudXp} XP • 🪙 {liveHudGold}g
                </Text>
                {arrivalBoonActive && (
                  <Text style={styles.arrivalBoonBadge} numberOfLines={1}>⚡ Boon: +5% All Stats</Text>
                )}
                <Text style={styles.gymMultiplierBadge} numberOfLines={1}>
                  📍 {selectedGym.name} ({selectedGym.xpMultiplier}x)
                </Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* 5. Workout Category Gateway */}
        <WorkoutCategoryGateway
          selectedCategory={activeCategory}
          secondaryCategories={secondaryCategories}
          segmentOrder={orderedSegments}
          presets={presets}
          isOffline={false}
          onSelectPrimaryCategory={handleSelectPrimaryCategory}
          onAddSecondarySegment={handleAddSecondarySegment}
          onRemoveSecondarySegment={handleRemoveSecondarySegment}
          onMoveSegment={handleMoveSegment}
          onResetCategory={handleResetCategory}
          onLoadPreset={handleLoadPreset}
          onOpenPresetDesigner={() => setShowPresetDesigner(true)}
          onOpenTrainingHistory={() => setShowTrainingHistory(true)}
        />

        {/* 6 & 7. ORDERED WORKOUT SEGMENTS (Press-and-Hold Drag-to-Reorder: Gym, Cardio, Sport, Recovery) */}
        {orderedSegments.map((segmentCategory) => {
          const isSegmentDragged = draggingSegment === segmentCategory;

          if (segmentCategory === 'GYM') {
            return (
              <Animated.View
                key="segment_GYM"
                onLayout={(e) => {
                  segmentHeightsRef.current.GYM = e.nativeEvent.layout.height;
                }}
                style={[
                  styles.modalitySection,
                  isSegmentDragged && {
                    zIndex: 60,
                    elevation: 14,
                    borderColor: '#FDE68A',
                    borderWidth: 1.5,
                    borderRadius: 12,
                    padding: 6,
                    backgroundColor: '#18161C',
                    transform: [{ translateY: segmentDragAnimY }, { scale: 1.02 }],
                  },
                ]}
              >
                <View
                  style={styles.sectionHeaderRow}
                  {...getSegmentPanHandlers('GYM')}
                >
                  <View style={styles.sectionHeadingGroup}>
                    {orderedSegments.length > 1 && (
                      <View style={styles.dragHandleBadge}>
                        <Text style={styles.dragHandleIcon}>⠿</Text>
                      </View>
                    )}
                    <Text style={styles.sectionHeading}>🏋️ RESISTANCE SETS</Text>
                  </View>
                  <View style={styles.sectionHeaderRightGroup}>
                    <Text style={styles.sectionCountMeta}>
                      {completedSetCount} set{completedSetCount === 1 ? '' : 's'} checked
                    </Text>
                    <TouchableOpacity
                      style={styles.removeSegmentHeaderBtn}
                      onPress={() => {
                        triggerSensoryCue('SET_MICRO_REWARD_TICK');
                        handleRemoveSecondarySegment('GYM');
                      }}
                      activeOpacity={0.75}
                      testID="remove-segment-header-GYM"
                    >
                      <Text style={styles.removeSegmentHeaderBtnText}>✕ Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {exerciseBlocks.map((block, bIdx) => {
                  const exMeta = exercises.find((e) => e.id === block.exerciseId);
                  const supersetInfo = supersetLabels[block.blockId];
                  const isGrouped = !!block.supersetGroupId;
                  const nextBlock = exerciseBlocks[bIdx + 1];
                  const prevBlock = exerciseBlocks[bIdx - 1];
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

                  const exerciseDisplayName =
                    exMeta?.name ?? block.exerciseName ?? block.exerciseId;
                  const plateCategory = classifyExercisePlateBehavior({
                    exerciseId: block.exerciseId,
                    exerciseName: exerciseDisplayName,
                    equipmentType: exMeta?.equipmentType,
                  });
                  const machineLoadMode = resolveExerciseMachineLoadMode(
                    exerciseGymPreferences,
                    block.exerciseId,
                    activeGymId
                  );
                  const effectiveBarKg = resolveExerciseDefaultBarWeightKg({
                    prefs: exerciseGymPreferences,
                    exerciseId: block.exerciseId,
                    exerciseName: exerciseDisplayName,
                    equipmentType: exMeta?.equipmentType,
                  });
                  const activeSetTarget = resolveActiveSetTargetWeightKg({
                    sets: block.sets,
                    prevLookup,
                    unit: blockUnit,
                    fallbackWeightKg: 0,
                  });
                  const inlinePlatePlan =
                    plateCategory === 'MACHINE_STACK' && machineLoadMode === 'CABLE_STACK'
                      ? null
                      : calculateBarbellPlatesPerSide({
                          targetWeightKg: activeSetTarget.targetWeightKg,
                          barWeightKg: effectiveBarKg,
                          unit: blockUnit,
                        });

                  const isMenuOpen = openBlockMenuId === block.blockId;
                  const isBlockDragged = draggingBlockId === block.blockId;
                  let workingOrderCounter = 0;
                  let warmupOrderCounter = 0;

                  return (
                    <React.Fragment key={block.blockId}>
                      <Animated.View
                        onLayout={(e) => {
                          blockHeightsRef.current[block.blockId] = e.nativeEvent.layout.height;
                        }}
                        style={[
                          styles.exerciseCard,
                          isGrouped && { borderLeftColor: '#C69A45', borderLeftWidth: 4 },
                          isLinkedWithNext && styles.exerciseCardLinkedNext,
                          isLinkedWithPrev && styles.exerciseCardLinkedPrev,
                          isBlockDragged && {
                            zIndex: 50,
                            elevation: 12,
                            borderColor: '#FDE68A',
                            borderWidth: 1.5,
                            shadowColor: '#FDE68A',
                            shadowOpacity: 0.35,
                            shadowRadius: 10,
                            transform: [{ translateY: blockDragAnimY }, { scale: 1.02 }],
                          },
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

                        {/* Clean Exercise Header: Drag Handle + High-Contrast Title + Swap Pill on Left, `⋯` Action Menu on Right */}
                        <View style={styles.exerciseCardHeader}>
                          {exerciseBlocks.length > 1 && (
                            <View
                              style={styles.dragHandleBadge}
                              {...getBlockPanHandlers(block.blockId)}
                            >
                              <Text style={styles.dragHandleIcon}>⠿</Text>
                            </View>
                          )}

                          <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                            <Pressable
                              style={styles.exerciseSelectorBtn}
                              onPress={() => setOpenExercisePickerBlockId(block.blockId)}
                            >
                              <Text style={styles.exerciseSelectorText} numberOfLines={1}>
                                {exMeta?.name ?? block.exerciseName ?? block.exerciseId}
                              </Text>
                              <View style={styles.swapExercisePill}>
                                <Text style={styles.swapExercisePillText}>⇄ Swap</Text>
                              </View>
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
                              ) : prevLookup.found &&
                                !prevLookup.matchedActiveGym &&
                                prevLookup.sourceGymName ? (
                                <Text style={styles.prevSessionHintText} numberOfLines={1}>
                                  Prev from {prevLookup.sourceGymName}
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          <TouchableOpacity
                            style={[
                              styles.blockActionMenuTrigger,
                              isMenuOpen && styles.blockActionMenuTriggerActive,
                            ]}
                            onPress={() =>
                              setOpenBlockMenuId((prev) =>
                                prev === block.blockId ? null : block.blockId
                              )
                            }
                            activeOpacity={0.75}
                            testID={`exercise-menu-btn-${block.blockId}`}
                          >
                            <Text
                              style={[
                                styles.blockActionMenuTriggerText,
                                isMenuOpen && styles.blockActionMenuTriggerTextActive,
                              ]}
                            >
                              ⋯
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* Compact `⋯` Exercise Action Drawer (Set Designations & Removal Only — No Duplicate Buttons) */}
                        {isMenuOpen && (
                          <View style={styles.blockActionMenuDrawer}>
                            <TouchableOpacity
                              style={[
                                styles.blockMenuActionPill,
                                isGrouped && styles.linkSupersetBtnActive,
                              ]}
                              onPress={() => {
                                handleToggleSuperset(bIdx);
                                setOpenBlockMenuId(null);
                              }}
                            >
                              <Text
                                style={[
                                  styles.blockMenuActionText,
                                  isGrouped && styles.linkSupersetBtnTextActive,
                                ]}
                              >
                                {isGrouped ? '🔗 Unlink Superset (A1/A2)' : '🔗 Link Superset (A1/A2)'}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.blockMenuActionPill}
                              onPress={() => {
                                handleSetOrAppendDesignation(block.blockId, 'WARMUP');
                                setOpenBlockMenuId(null);
                              }}
                            >
                              <Text style={styles.blockMenuActionText}>🌡️ Set / Add Warm-Up [W]</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.blockMenuActionPill}
                              onPress={() => {
                                handleSetOrAppendDesignation(block.blockId, 'DROP_SET');
                                setOpenBlockMenuId(null);
                              }}
                            >
                              <Text style={styles.blockMenuActionText}>🔥 Set / Add Drop-Set [D]</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.blockMenuActionPill}
                              onPress={() => {
                                handleSetOrAppendDesignation(block.blockId, 'FAILURE');
                                setOpenBlockMenuId(null);
                              }}
                            >
                              <Text style={styles.blockMenuActionText}>
                                ⚡ Set / Add Failure / AMRAP [F]
                              </Text>
                            </TouchableOpacity>

                            {exerciseBlocks.length > 1 && (
                              <TouchableOpacity
                                style={[styles.blockMenuActionPill, styles.blockMenuActionDanger]}
                                onPress={() => {
                                  handleRemoveExerciseBlock(block.blockId);
                                  setOpenBlockMenuId(null);
                                }}
                              >
                                <Text style={styles.blockMenuActionDangerText}>
                                  🗑️ Remove Exercise
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}

                        {/* Gym-Aware Sticky Per-Exercise Note */}
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
                            {/* Live Inline Plate Visualization (Synced to Next Uncompleted Set) */}
                            <View style={styles.inlinePlateVisContainer}>
                              {plateCategory === 'MACHINE_STACK' &&
                              machineLoadMode === 'CABLE_STACK' ? (
                                <View style={styles.inlinePlateNaBadge}>
                                  <Text style={styles.inlinePlateNaText}>N/A</Text>
                                </View>
                              ) : inlinePlatePlan && inlinePlatePlan.plates.length > 0 ? (
                                <View style={styles.inlinePlateRackRow}>
                                  <View style={styles.inlineBarSleeveStub} />
                                  {inlinePlatePlan.plates
                                    .flatMap((item, pIdx) =>
                                      Array.from({ length: Math.min(item.count, 5) }).map(
                                        (_, cIdx) => ({
                                          key: `${pIdx}_${cIdx}`,
                                          plateWeight: item.plateWeight,
                                          colorHex: item.colorHex,
                                        })
                                      )
                                    )
                                    .slice(0, 6)
                                    .map((chip) => {
                                      const isLightText =
                                        chip.colorHex === '#F8FAFC' ||
                                        chip.colorHex === '#EAB308';
                                      return (
                                        <View
                                          key={chip.key}
                                          style={[
                                            styles.inlinePlateChip,
                                            {
                                              backgroundColor: chip.colorHex,
                                              height: Math.max(
                                                18,
                                                Math.min(25, 15 + chip.plateWeight * 0.22)
                                              ),
                                            },
                                          ]}
                                        >
                                          <Text
                                            style={[
                                              styles.inlinePlateChipText,
                                              isLightText && { color: '#111827' },
                                            ]}
                                          >
                                            {formatCleanWeightNumber(chip.plateWeight)}
                                          </Text>
                                        </View>
                                      );
                                    })}
                                </View>
                              ) : (
                                <View style={styles.inlinePlateEmptyBadge}>
                                  <Text style={styles.inlinePlateEmptyText}>
                                    {inlinePlatePlan && inlinePlatePlan.barDisplayWeight > 0
                                      ? `${formatCleanWeightNumber(
                                          inlinePlatePlan.barDisplayWeight
                                        )}${blockUnit === 'LBS' ? 'lb' : 'kg'} Bar`
                                      : `0${blockUnit === 'LBS' ? 'lb' : 'kg'}`}
                                  </Text>
                                </View>
                              )}
                            </View>

                            {plateCategory === 'MACHINE_STACK' ? (
                              <TouchableOpacity
                                style={[
                                  styles.platesHelperBtn,
                                  machineLoadMode === 'PLATE_LOADED'
                                    ? styles.platesHelperBtnPlateLoaded
                                    : styles.platesHelperBtnCableStack,
                                ]}
                                onPress={() => {
                                  const nextMode =
                                    machineLoadMode === 'CABLE_STACK'
                                      ? 'PLATE_LOADED'
                                      : 'CABLE_STACK';
                                  saveExerciseMachineLoadMode?.({
                                    exerciseId: block.exerciseId,
                                    mode: nextMode,
                                    activeGymId,
                                    activeGymName,
                                  });
                                  triggerSensoryCue('SET_MICRO_REWARD_TICK');
                                }}
                                activeOpacity={0.75}
                              >
                                <Text
                                  style={[
                                    styles.platesHelperBtnText,
                                    machineLoadMode === 'PLATE_LOADED'
                                      ? styles.platesHelperBtnTextPlateLoaded
                                      : styles.platesHelperBtnTextCableStack,
                                  ]}
                                >
                                  {machineLoadMode === 'PLATE_LOADED'
                                    ? '🏋️ Plate-Loaded'
                                    : '⚙️ Cable Stack'}
                                </Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={styles.platesHelperBtn}
                                onPress={() =>
                                  setPlatesModalTarget({ blockId: block.blockId, mode: 'PLATES' })
                                }
                                activeOpacity={0.75}
                              >
                                <Text style={styles.platesHelperBtnText}>
                                  🧮 Plates Visualizer
                                </Text>
                              </TouchableOpacity>
                            )}

                            <TouchableOpacity
                              style={styles.warmupHelperBtn}
                              onPress={() =>
                                setPlatesModalTarget({ blockId: block.blockId, mode: 'WARMUP' })
                              }
                              activeOpacity={0.75}
                            >
                              <Text style={styles.warmupHelperBtnText}>🌡️ Warm-Up Sets</Text>
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

                        {/* 6-Column Table Headers: TYPE | PREV | KG/LBS | REPS | RPE | DONE */}
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
                          const effectiveRowRpe = row.rpe ?? ghostRow?.rpe ?? 8.5;

                          return (
                            <View
                              key={row.id}
                              style={[
                                styles.setRow,
                                row.completed && styles.setRowCompleted,
                                rowSetType === 'DROP_SET' && styles.dropSetRowIndent,
                              ]}
                            >
                              {/* Cycling Set Type Pill [1 / W / D / F] */}
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

                              {/* KG/LBS numeric TextInput with Ghost Placeholder */}
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

                              {/* REPS numeric TextInput with Ghost Placeholder */}
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

                              {/* RPE Pill (Clean 1-Tap to Open Smooth Vertical RPE Slider) */}
                              <TouchableOpacity
                                style={styles.rpePillBtn}
                                activeOpacity={0.75}
                                onPress={() =>
                                  setRpeSliderTarget({
                                    mode: 'SET',
                                    blockId: block.blockId,
                                    setId: row.id,
                                    currentRpe: effectiveRowRpe,
                                    subtitle: `${
                                      exMeta?.name ?? block.exerciseName ?? 'Exercise'
                                    } • Set ${displayCode}`,
                                  })
                                }
                              >
                                <Text style={styles.rpePillText}>{effectiveRowRpe}</Text>
                              </TouchableOpacity>

                              {/* DONE Checkbox (1-Tap Auto-Fills Ghost Values if Empty!) */}
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

                              {/* Delete Set Row Button */}
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

                        {/* + Add Set Footer Button */}
                        <Pressable
                          style={styles.addSetRowBtn}
                          onPress={() => handleAddSetRow(block.blockId)}
                        >
                          <Text style={styles.addSetRowText}>+ Add Set</Text>
                        </Pressable>
                      </Animated.View>

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

                {/* Bottom Action Row: + Add Exercise */}
                <View style={styles.bottomExerciseActionRow}>
                  <Pressable
                    style={styles.addExerciseBlockBtn}
                    onPress={handleAddExerciseBlock}
                  >
                    <Text style={styles.addExerciseBlockText}>+ Add Exercise</Text>
                  </Pressable>
                </View>
              </Animated.View>
            );
          }

          // CARDIO / SPORT / RECOVERY MODALITY SECTION
          const modalityTarget: 'CARDIO' | 'SPORT' | 'RECOVERY' =
            segmentCategory === 'SPORT'
              ? 'SPORT'
              : segmentCategory === 'RECOVERY'
                ? 'RECOVERY'
                : 'CARDIO';
          const modalityCatalog =
            modalityTarget === 'SPORT'
              ? sportCatalog
              : modalityTarget === 'RECOVERY'
                ? recoveryCatalog
                : pureCardioCatalog;
          const activeModalityId =
            selectedIdByModality[modalityTarget] ||
            modalityCatalog[0]?.id ||
            'outdoor_tempo_cycling';
          const selectedModalityMeta =
            modalityCatalog.find((c) => c.id === activeModalityId) ??
            exercises.find((c) => c.id === activeModalityId) ??
            modalityCatalog[0];
          const firstConditioningModality = orderedSegments.find((s) => s !== 'GYM');
          const entriesForModality = cardioEntries.filter((entry) => {
            if (entry.workoutCategory) {
              return entry.workoutCategory === modalityTarget;
            }
            const exMatch = exercises.find((e) => e.id === entry.exerciseId);
            if (exMatch?.workoutCategory) {
              return exMatch.workoutCategory === modalityTarget;
            }
            return firstConditioningModality === modalityTarget;
          });

          const sectionTitle =
            modalityTarget === 'SPORT'
              ? '🥊 SPORT TRAINING'
              : modalityTarget === 'RECOVERY'
                ? '🧘 ACTIVE RECOVERY & MOBILITY'
                : '🏃 CARDIO TRAINING';

          return (
            <Animated.View
              key={`segment_${modalityTarget}`}
              onLayout={(e) => {
                segmentHeightsRef.current[modalityTarget] = e.nativeEvent.layout.height;
              }}
              style={[
                styles.modalitySection,
                isSegmentDragged && {
                  zIndex: 60,
                  elevation: 14,
                  borderColor: '#FDE68A',
                  borderWidth: 1.5,
                  borderRadius: 12,
                  padding: 6,
                  backgroundColor: '#18161C',
                  transform: [{ translateY: segmentDragAnimY }, { scale: 1.02 }],
                },
              ]}
            >
              <View
                style={styles.sectionHeaderRow}
                {...getSegmentPanHandlers(modalityTarget)}
              >
                <View style={styles.sectionHeadingGroup}>
                  {orderedSegments.length > 1 && (
                    <View style={styles.dragHandleBadge}>
                      <Text style={styles.dragHandleIcon}>⠿</Text>
                    </View>
                  )}
                  <Text style={styles.sectionHeading}>{sectionTitle}</Text>
                </View>
                <View style={styles.sectionHeaderRightGroup}>
                  <Text style={styles.sectionCountMeta}>{entriesForModality.length} logged</Text>
                  <TouchableOpacity
                    style={styles.removeSegmentHeaderBtn}
                    onPress={() => {
                      triggerSensoryCue('SET_MICRO_REWARD_TICK');
                      handleRemoveSecondarySegment(modalityTarget);
                    }}
                    activeOpacity={0.75}
                    testID={`remove-segment-header-${modalityTarget}`}
                  >
                    <Text style={styles.removeSegmentHeaderBtnText}>✕ Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.cardioCard}>
                <View style={styles.cardioSelectHeader}>
                  <Text style={styles.cardioLabel}>Activity:</Text>
                  <TouchableOpacity
                    style={styles.cardioBrowseBtn}
                    onPress={() => setActiveModalityPickerTarget(modalityTarget)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cardioBrowseBtnText}>🔍 Browse / Add Modality</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.cardioSelectedBanner}
                  onPress={() => setActiveModalityPickerTarget(modalityTarget)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardioSelectedName}>
                      {selectedModalityMeta?.name ?? activeModalityId}
                    </Text>
                    <Text style={styles.cardioSelectedSub}>
                      {selectedModalityMeta?.equipmentType || 'Activity'} • Tap to search or add custom
                    </Text>
                  </View>
                  <Text style={styles.cardioSelectedChangeIcon}>🔍</Text>
                </TouchableOpacity>

                <View style={styles.cardioSelectRow}>
                  <Text style={styles.cardioQuickLabel}>Quick:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                    {[
                      ...recentActivityIds
                        .map((id) => modalityCatalog.find((c) => c.id === id))
                        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
                      ...modalityCatalog.filter((c) => !recentActivityIds.includes(c.id)),
                    ]
                      .slice(0, 10)
                      .map((c) => {
                      const active = c.id === activeModalityId;
                      return (
                        <Pressable
                          key={c.id}
                          style={[styles.cardioPill, active && styles.cardioPillActive]}
                          onPress={() => {
                            setSelectedIdByModality((prev) => ({
                              ...prev,
                              [modalityTarget]: c.id,
                            }));
                            recordRecentActivity(c.id);
                          }}
                        >
                          <Text
                            style={[
                              styles.cardioPillText,
                              active && styles.cardioPillTextActive,
                            ]}
                          >
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
                      activeOpacity={0.75}
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
                          <Text
                            style={[
                              styles.zoneText,
                              cardioZone === z && styles.zoneTextActive,
                            ]}
                          >
                            Z{z}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.addCardioBtn}
                  onPress={() => handleAddCardioEntry(modalityTarget)}
                >
                  <Text style={styles.addCardioBtnText}>+ Log Segment</Text>
                </TouchableOpacity>
              </View>

              {/* Logged Non-Resistance Items (Merged + Inline Steppers) */}
              {entriesForModality.map((item) => (
                <View key={item.id} style={styles.cardioEntryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardioEntryName}>{item.exerciseName}</Text>
                    <Text style={styles.cardioEntryMeta}>
                      {Math.round(item.durationSeconds / 60)} mins • Zone {item.averageHrZone}
                      {item.rpe ? ` • RPE ${item.rpe}` : ''}
                    </Text>
                  </View>
                  <View style={styles.cardioEntryStepperRow}>
                    <TouchableOpacity
                      style={styles.cardioDurationStepBtn}
                      onPress={() => handleAdjustCardioDuration(item.id, -300)}
                    >
                      <Text style={styles.cardioDurationStepText}>−5m</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cardioDurationStepBtn}
                      onPress={() => handleAdjustCardioDuration(item.id, 300)}
                    >
                      <Text style={styles.cardioDurationStepText}>+5m</Text>
                    </TouchableOpacity>
                    <Pressable onPress={() => handleRemoveCardioEntry(item.id)}>
                      <Text style={styles.cardioEntryDelete}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </Animated.View>
          );
        })}

        {/* 8. Finish Workout Action Button (Hidden while on Select Training Discipline landing page) */}
        {activeCategory !== null ? (
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
        ) : null}
      </ScrollView>

      {/* 9. Resistance Activity Picker Modal */}
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
            ? exerciseBlocks.find((b) => b.blockId === openExercisePickerBlockId)?.exerciseId
            : null
        }
        targetWorkoutCategory="GYM"
        title="Select Resistance Exercise"
      />

      {/* 10. Cardio / Sport / Recovery Activity Picker Modal */}
      <ActivityPickerModal
        visible={activeModalityPickerTarget !== null}
        onClose={() => setActiveModalityPickerTarget(null)}
        onSelectExercise={(item) => {
          const target = activeModalityPickerTarget ?? 'CARDIO';
          setSelectedIdByModality((prev) => ({
            ...prev,
            [target]: item.id,
          }));
          recordRecentActivity(item.id);
        }}
        currentExerciseId={
          activeModalityPickerTarget ? selectedIdByModality[activeModalityPickerTarget] : null
        }
        targetWorkoutCategory={activeModalityPickerTarget ?? 'CARDIO'}
        title={
          activeModalityPickerTarget === 'SPORT'
            ? 'Select Sport Modality'
            : activeModalityPickerTarget === 'RECOVERY'
              ? 'Select Recovery & Mobility'
              : 'Select Cardio Training'
        }
      />

      {/* 11. Center Focus Rest Timer Modal (Proc'd on set DONE) */}
      <Modal
        visible={!!(restTargetEndTimeMs && restCenterModalVisible)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setRestCenterModalVisible(false);
          setRestTimerPinned(true);
        }}
      >
        <Pressable
          style={styles.restModalBackdrop}
          onPress={() => {
            setRestCenterModalVisible(false);
            setRestTimerPinned(true);
          }}
        >
          <Pressable style={styles.restModalCard} onPress={(e) => e.stopPropagation()}>
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
              onMinimize={() => {
                setRestCenterModalVisible(false);
                setRestTimerPinned(true);
              }}
              onSelectPreset={handleRestSelectPreset}
              recommendedSeconds={restRecommendedSec}
            />

            <Pressable
              style={styles.minimizeRestBtn}
              onPress={() => {
                setRestCenterModalVisible(false);
                setRestTimerPinned(true);
              }}
            >
              <Text style={styles.minimizeRestBtnText}>
                👁️ View Workout / Minimize Timer
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 12. PR Badge Celebration Modal */}
      <Modal
        visible={celebrationBadge !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCelebrationBadge(null)}
      >
        <View style={styles.prModalBackdrop}>
          <View style={styles.prModalCard}>
            <Text style={styles.prModalIcon}>{celebrationBadge?.icon}</Text>
            <Text style={styles.prModalTitle}>{celebrationBadge?.title}</Text>
            <Text style={styles.prModalDesc}>{celebrationBadge?.description}</Text>
            <TouchableOpacity
              style={styles.prModalAcknowledgeBtn}
              onPress={() => setCelebrationBadge(null)}
            >
              <Text style={styles.prModalAcknowledgeText}>Claim Personal Record 🏆</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {renderPostWorkoutSummaryModal()}

      {/* 13. Preset Designer Modal */}
      <PresetDesignerModal
        visible={showPresetDesigner}
        editingPreset={editingPresetDraft ?? sessionPresetTemplate}
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

      {/* 14. Training History Matrix Modal */}
      <TrainingHistoryScreen
        visible={showTrainingHistory}
        onBack={() => setShowTrainingHistory(false)}
        onLoadSessionIntoWorkout={handleLoadSessionIntoWorkout}
      />

      {/* 15. Inline Barbell Plate & Configurable Warm-Up Generator Modal */}
      {(() => {
        const targetBlk = platesModalTarget
          ? exerciseBlocks.find((b) => b.blockId === platesModalTarget.blockId) ?? null
          : null;
        if (!targetBlk) return null;
        const bUnit = resolveBlockUnit(targetBlk);
        const exMeta = exercises.find((e) => e.id === targetBlk.exerciseId);
        const prevLookup = resolvePreviousExerciseSessionSets({
          exerciseId: targetBlk.exerciseId,
          workoutHistory,
          activeGymId,
        });
        const activeTarget = resolveActiveSetTargetWeightKg({
          sets: targetBlk.sets,
          prevLookup,
          unit: bUnit,
          fallbackWeightKg: 60,
        });
        const initialWorkingKg = activeTarget.targetWeightKg;
        const defaultBarKg = resolveExerciseDefaultBarWeightKg({
          prefs: exerciseGymPreferences,
          exerciseId: targetBlk.exerciseId,
          exerciseName: exMeta?.name ?? targetBlk.exerciseName ?? targetBlk.exerciseId,
          equipmentType: exMeta?.equipmentType,
        });

        return (
          <PlatesAndWarmupModal
            visible={Boolean(targetBlk)}
            mode={platesModalTarget?.mode ?? 'PLATES'}
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
            onClose={() => setPlatesModalTarget(null)}
          />
        );
      })()}

      {/* 16. Beginner-Friendly Metric Info `(i)` Tooltip Modal */}
      <MetricInfoTooltipModal
        metricKey={tooltipState?.key ?? null}
        contextualHeadline={tooltipState?.headline ?? null}
        contextualNote={tooltipState?.note ?? null}
        onClose={() => setTooltipState(null)}
      />

      {/* 17. Vertical RPE Slider Modal */}
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

      {renderShareableReceiptModal()}
    </View>
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
  shareReceiptActionBtn: {
    backgroundColor: '#292214',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
    gap: 8,
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
    fontWeight: '800',
  },
  topBarTitle: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  sessionTimerBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#24222B',
  },
  sessionClock: {
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    color: '#E8E6E1',
    letterSpacing: 0.5,
  },
  sessionSubRaid: {
    fontSize: 9,
    color: '#C69A45',
    fontWeight: '800',
    marginTop: 1,
  },
  topBarRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topBarPresetsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#26242E',
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  topBarPresetsText: {
    color: '#E5E7EB',
    fontSize: 11,
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
  finishTopBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#5E1924',
    borderWidth: 1,
    borderColor: '#C69A45',
  },
  finishTopBtnText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '900',
  },
  pinnedFloatingRestContainer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    zIndex: 999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 48,
  },
  scrollContentWithPinnedTimer: {
    paddingBottom: 110,
  },
  validationBox: {
    backgroundColor: '#2F1A1C',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  validationText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '700',
  },

  // 3. Pre-Flight Bar Styles
  preflightCompactCard: {
    backgroundColor: '#1E1D24',
    borderColor: '#C69A45',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  preflightPillsRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  preflightPill: {
    backgroundColor: '#282631',
    borderColor: '#3D3A49',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  preflightPillActive: {
    borderColor: '#38BDF8',
    backgroundColor: '#162C3D',
  },
  preflightPillText: {
    color: '#E5E7EB',
    fontSize: 10,
    fontWeight: '800',
  },
  preflightPillTextActive: {
    color: '#38BDF8',
  },
  engageBossBtn: {
    backgroundColor: '#C69A45',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  engageBossBtnText: {
    color: '#121114',
    fontSize: 12,
    fontWeight: '900',
  },

  // 4. Live Boss HP & Sprite Card Styles
  liveBossCard: {
    backgroundColor: '#1A1821',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#C69A45',
    padding: 10,
    marginBottom: 12,
  },
  bossMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bossAvatarFrame: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#282433',
    borderWidth: 1,
    borderColor: '#C69A45',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  damageFlashBadge: {
    position: 'absolute',
    top: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  damageFlashText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  bossDetailCol: {
    flex: 1,
  },
  bossNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  bossNameText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '900',
  },
  bossHpNumText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  chevronToggleBtn: {
    padding: 4,
  },
  chevronToggleText: {
    color: '#C69A45',
    fontSize: 12,
    fontWeight: '900',
  },
  bossHpTrack: {
    height: 8,
    backgroundColor: '#2D2B35',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 2,
  },
  bossHpFill: {
    height: '100%',
    backgroundColor: '#EF4444',
  },
  bossTelemetryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#2F2C3A',
  },
  liveCounterBadge: {
    color: '#FCD34D',
    fontSize: 10,
    fontWeight: '900',
    backgroundColor: '#2E2616',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 1,
  },
  arrivalBoonBadge: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: '#13352A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 1,
  },
  gymMultiplierBadge: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: '#1E2D48',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 1,
  },

  // Resistance Modality Sheet Styles
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
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C69A45',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  sectionCountMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  exerciseCard: {
    backgroundColor: '#1B1920',
    borderRadius: 12,
    borderColor: '#2F2C38',
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  exerciseCardLinkedNext: {
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  exerciseCardLinkedPrev: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  supersetBanner: {
    backgroundColor: '#2E2211',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  supersetBannerText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  exerciseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  exerciseSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  exerciseSelectorText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F3F4F6',
    flexShrink: 1,
  },
  exerciseSelectorCaret: {
    fontSize: 10,
    color: '#C69A45',
  },
  prevSessionHintText: {
    color: '#8C8994',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkSupersetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A4656',
    backgroundColor: '#26242F',
  },
  linkSupersetBtnActive: {
    borderColor: '#C69A45',
    backgroundColor: '#352814',
  },
  linkSupersetBtnText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
  },
  linkSupersetBtnTextActive: {
    color: '#FDE68A',
  },
  removeBlockBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  removeBlockBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '800',
  },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  e1rmInlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
    flexDirection: 'column',
    gap: 6,
    marginTop: 2,
    marginBottom: 10,
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
    paddingVertical: 5,
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
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    minHeight: 34,
    paddingVertical: 2,
  },
  inlinePlateVisContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 2,
  },
  inlinePlateRackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    backgroundColor: '#16151C',
    borderColor: '#32303F',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    minHeight: 30,
  },
  inlineBarSleeveStub: {
    width: 7,
    height: 5,
    borderRadius: 1.5,
    backgroundColor: '#94A3B8',
    marginRight: 1,
  },
  inlinePlateChip: {
    minWidth: 18,
    paddingHorizontal: 3.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  inlinePlateChipText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '900',
  },
  inlinePlateNaBadge: {
    backgroundColor: '#1B1A22',
    borderColor: '#3B3848',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 5,
    minHeight: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlinePlateNaText: {
    color: '#6B7280',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  inlinePlateEmptyBadge: {
    backgroundColor: '#181720',
    borderColor: '#353242',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 5,
    minHeight: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlinePlateEmptyText: {
    color: '#9CA3AF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  platesHelperBtn: {
    backgroundColor: '#1D2430',
    borderColor: '#38BDF8',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 6,
    minHeight: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  platesHelperBtnCableStack: {
    backgroundColor: '#1F1E28',
    borderColor: '#64748B',
  },
  platesHelperBtnPlateLoaded: {
    backgroundColor: '#182A24',
    borderColor: '#10B981',
  },
  platesHelperBtnText: {
    color: '#7DD3FC',
    fontSize: 10.5,
    fontWeight: '800',
  },
  platesHelperBtnTextCableStack: {
    color: '#CBD5E1',
  },
  platesHelperBtnTextPlateLoaded: {
    color: '#6EE7B7',
  },
  warmupHelperBtn: {
    backgroundColor: '#292014',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 6,
    minHeight: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warmupHelperBtnText: {
    color: '#FDE68A',
    fontSize: 10.5,
    fontWeight: '800',
  },
  sectionHeaderRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeSegmentHeaderBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  removeSegmentHeaderBtnText: {
    color: '#FCA5A5',
    fontSize: 10,
    fontWeight: '900',
  },
  unitTogglePill: {
    backgroundColor: '#24222F',
    borderColor: '#4A4658',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 36,
    minHeight: 30,
    justifyContent: 'center',
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

  // 6-Column Table Columns (`TYPE | PREV | KG/LBS | REPS | RPE | DONE`)
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
  dragHandleBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#25232E',
    borderColor: '#454154',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  dragHandleIcon: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  colHeader: {
    color: '#8A8794',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  colInput: {
    flex: 1,
  },
  colCheck: {
    width: 38,
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
    backgroundColor: '#241719',
    borderRadius: 6,
  },
  setTypeBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
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
    borderWidth: 1,
    borderColor: '#383545',
    borderRadius: 6,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 3,
    fontVariant: ['tabular-nums'],
  },
  numericInputCompleted: {
    borderColor: '#10B981',
    backgroundColor: '#172722',
  },
  rpePillBtn: {
    width: 44,
    height: 36,
    backgroundColor: '#23212C',
    borderWidth: 1,
    borderColor: '#3A3749',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpePillText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '800',
  },
  checkBtn: {
    width: 38,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#23212C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnCompleted: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  checkBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
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
    color: '#9CA3AF',
    fontSize: 12,
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
    color: '#C69A45',
    fontSize: 12,
    fontWeight: '800',
  },
  segmentMoveGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  segmentMoveBtn: {
    width: 22,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#4A4333',
    backgroundColor: '#252119',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentMoveBtnText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '900',
  },
  swapExercisePill: {
    backgroundColor: '#2D2316',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  swapExercisePillText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '900',
  },
  blockActionMenuTrigger: {
    width: 34,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A4656',
    backgroundColor: '#25232C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockActionMenuTriggerActive: {
    backgroundColor: '#362A18',
    borderColor: '#C69A45',
  },
  blockActionMenuTriggerText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  blockActionMenuTriggerTextActive: {
    color: '#FDE68A',
  },
  blockActionMenuDrawer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: '#16151B',
    borderColor: '#34313E',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  blockMenuActionPill: {
    backgroundColor: '#24222D',
    borderColor: '#433F52',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  blockMenuActionText: {
    color: '#E5E7EB',
    fontSize: 10,
    fontWeight: '800',
  },
  blockMenuActionDanger: {
    backgroundColor: '#2D1A1E',
    borderColor: '#7F1D1D',
  },
  blockMenuActionDangerText: {
    color: '#FCA5A5',
    fontSize: 10,
    fontWeight: '800',
  },
  cardioEntryStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardioDurationStepBtn: {
    backgroundColor: '#26232E',
    borderColor: '#433F52',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  cardioDurationStepText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '800',
  },
  supersetBridge: {
    alignItems: 'center',
    marginVertical: -2,
    zIndex: 2,
  },
  supersetBridgeLine: {
    width: 2,
    height: 8,
    backgroundColor: '#C69A45',
  },
  supersetBridgeBadge: {
    backgroundColor: '#2E2211',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  supersetBridgeText: {
    color: '#FDE68A',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  supersetBridgeTrail: {
    width: 2,
    height: 8,
    backgroundColor: '#C69A45',
  },
  bottomExerciseActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  addExerciseBlockBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C69A45',
    backgroundColor: '#2B2317',
    alignItems: 'center',
  },
  addExerciseBlockText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '900',
  },
  managePresetsBottomBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A4656',
    backgroundColor: '#22202B',
    alignItems: 'center',
  },
  managePresetsBottomText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '800',
  },

  // Cardio & Non-Resistance Section Styles
  cardioCard: {
    backgroundColor: '#1B1920',
    borderRadius: 12,
    borderColor: '#2F2C38',
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  cardioSelectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardioLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },
  cardioBrowseBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#252230',
    borderWidth: 1,
    borderColor: '#3D394C',
  },
  cardioBrowseBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  cardioSelectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#23202D',
    borderWidth: 1,
    borderColor: '#3C384A',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  cardioSelectedName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  cardioSelectedSub: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 2,
  },
  cardioSelectedChangeIcon: {
    fontSize: 14,
    color: '#C69A45',
  },
  cardioSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardioQuickLabel: {
    color: '#8C8994',
    fontSize: 11,
    fontWeight: '700',
  },
  cardioPill: {
    backgroundColor: '#23212C',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3C3949',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  cardioPillActive: {
    borderColor: '#38BDF8',
    backgroundColor: '#162C3D',
  },
  cardioPillText: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '700',
  },
  cardioPillTextActive: {
    color: '#38BDF8',
    fontWeight: '900',
  },
  cardioFormRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  cardioInputGroup: {
    flex: 1,
  },
  cardioInputLabel: {
    color: '#8C8994',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardioNumericInput: {
    height: 38,
    backgroundColor: '#25232F',
    borderWidth: 1,
    borderColor: '#383545',
    borderRadius: 6,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  cardioRpeBtn: {
    height: 38,
    backgroundColor: '#23212C',
    borderWidth: 1,
    borderColor: '#3A3749',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardioRpeText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '900',
  },
  zoneRow: {
    flexDirection: 'row',
    gap: 3,
  },
  zoneBtn: {
    flex: 1,
    height: 38,
    backgroundColor: '#23212C',
    borderWidth: 1,
    borderColor: '#3C3949',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneBtnActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#352613',
  },
  zoneText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
  },
  zoneTextActive: {
    color: '#FDE68A',
    fontWeight: '900',
  },
  addCardioBtn: {
    backgroundColor: '#38BDF8',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCardioBtnText: {
    color: '#0A1E29',
    fontSize: 12,
    fontWeight: '900',
  },
  cardioEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1C25',
    borderWidth: 1,
    borderColor: '#2D2A37',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  cardioEntryName: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '800',
  },
  cardioEntryMeta: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 2,
  },
  cardioEntryDelete: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 8,
  },
  presetSaveContainer: {
    marginTop: 8,
  },
  savePresetBtn: {
    backgroundColor: '#22202B',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  savePresetBtnText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '900',
  },

  // Rest Modal Styles
  restModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 18, 0.86)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  restModalCard: {
    width: '100%',
    maxWidth: 440,
  },
  minimizeRestBtn: {
    backgroundColor: '#22202B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3D394B',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  minimizeRestBtnText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '900',
  },

  // PR Celebration Modal Styles
  prModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  prModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1E1B26',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#C69A45',
    padding: 20,
    alignItems: 'center',
  },
  prModalIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  prModalTitle: {
    color: '#FDE68A',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  prModalDesc: {
    color: '#E5E7EB',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  prModalAcknowledgeBtn: {
    backgroundColor: '#C69A45',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
  },
  prModalAcknowledgeText: {
    color: '#121114',
    fontSize: 14,
    fontWeight: '900',
  },

  // Phase 3 Styles (Dungeon Cleared & Loot Review)
  dungeonClearedHeroCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    padding: 16,
    marginBottom: 14,
  },
  clearedEyebrow: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  clearedHeadline: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  clearedSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  verificationBadge: {
    marginTop: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  verificationBadgeIronman: {
    backgroundColor: '#311019',
    borderColor: '#E11D48',
  },
  verificationBadgeHonesty: {
    backgroundColor: '#1E1D24',
    borderColor: '#374151',
  },
  verificationBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  verificationBadgeIronmanText: {
    color: '#FDA4AF',
  },
  verificationBadgeHonestyText: {
    color: '#9CA3AF',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  metricBox: {
    flex: 1,
    minWidth: 130,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
  },
  metricValue: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  metricLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: '700',
  },
  xpPillsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  xpPill: {
    fontSize: 14,
    fontWeight: '900',
  },
  resilienceAwardedCard: {
    marginTop: 10,
    backgroundColor: COLORS.agilityDim,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.shieldCyan,
  },
  resilienceAwardedTitle: {
    color: COLORS.shieldCyan,
    fontSize: 13,
    fontWeight: '900',
  },
  resilienceAwardedBody: {
    color: COLORS.textPrimary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  prCritCard: {
    marginTop: 10,
    backgroundColor: COLORS.goldDim,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  prCritHeadline: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '900',
  },
  prCritSub: {
    color: COLORS.textPrimary,
    fontSize: 12,
    marginTop: 4,
  },
  injectedText: {
    color: COLORS.shieldCyan,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  raidEnergyText: {
    color: COLORS.mythic,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  thresholdStartBtn: {
    backgroundColor: COLORS.gold,
    minHeight: 66,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  thresholdStartTitle: {
    color: COLORS.bgDeep,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  thresholdStartSub: {
    color: COLORS.bgDeep,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    opacity: 0.85,
  },
  chestCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 14,
  },
  chestTitle: {
    fontSize: 19,
    fontWeight: '900',
    marginVertical: 4,
  },
  helperText: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginBottom: 10,
    lineHeight: 16,
  },
  unsealChestBtn: {
    minHeight: 60,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  unsealChestBtnText: {
    color: COLORS.bgDeep,
    fontSize: 15,
    fontWeight: '900',
  },
  revealedLootBox: {
    backgroundColor: COLORS.bgDeep,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
  },
  revealedHeader: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  lootDropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  revealedDropLine: {
    fontSize: 14,
    fontWeight: '800',
  },
  actionBannerCard: {
    backgroundColor: '#1E182D',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    padding: 16,
    marginBottom: 14,
  },
  actionBannerTitle: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  actionBannerSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  actionBannerButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBannerBtn: {
    flex: 1,
    minHeight: 46,
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBannerBtnPaperdoll: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionBannerBtnText: {
    color: COLORS.bgDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  saveAsPresetBtn: {
    backgroundColor: '#26242B',
    borderColor: '#C69A45',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  saveAsPresetBtnText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  finishWorkoutBtn: {
    minHeight: 56,
    backgroundColor: COLORS.endurance,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  finishWorkoutBtnText: {
    color: COLORS.bgDeep,
    fontSize: 13,
    fontWeight: '900',
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
