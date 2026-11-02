import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
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
  DEFAULT_TALENT_TREES,
  HeartRateSample,
  HeartRateZone,
  HolisticStatType,
  StatType,
  WorkoutSessionType,
  calculateE1RM,
  getOptimalRestAdvice,
  validateTalentAllocation,
  verifyTelemetry,
  xpRequiredForStatLevel,
  SetType,
  SET_TYPE_DESCRIPTORS,
  cycleSetType,
  WorkoutCategory,
  WorkoutPresetDefinition,
} from '@gymify/game-engine';
import { wearableService } from '../services/wearableTelemetry';
import { StaminaRingTimer } from '../components/StaminaRingTimer';
import { WorkoutCategoryGateway } from '../components/WorkoutCategoryGateway';
import { DynamicRestTimer } from '../components/DynamicRestTimer';
import { PresetDesignerModal } from '../components/PresetDesignerModal';
import { TrainingHistoryScreen } from './TrainingHistoryScreen';
import { isEquippableInventoryEntry, useGame } from '../state/GameContext';
import { triggerSensoryCue } from '../utils/sensoryFeedback';
import { Image } from 'expo-image';
import { getLootChestSpriteUri, LOOT_SPRITES } from '../assets/sprites';
import { audioManager } from '../services/AudioManager';
import { COLORS, RARITY_COLORS } from '../theme';

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

const SET_TYPE_COLORS: Record<SetType, string> = {
  NORMAL: '#9CA3AF',
  WARMUP: '#38BDF8',
  DROP_SET: '#EF4444',
  FAILURE: '#F59E0B',
  AMRAP: '#F59E0B',
};

const RPE_OPTIONS = [6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export const WorkoutLoggerScreen: React.FC = () => {
  const {
    exercises,
    historicalPRs,
    fatigueState,
    nextWorkoutMultiplier,
    combatPenalties,
    activeDungeonRun,
    raids,
    stats,
    unlockedTalentRanks,
    inventory,
    consistencyStreak,
    resilienceShields,
    registeredGyms,
    workoutMachine,
    arrivalBanner,
    restNotificationArmed,
    lastHybridConsolidation,
    startHybridSession,
    logHybridSet,
    recordHybridCardioSegment,
    adjustHybridRestTimer,
    skipHybridRest,
    finishHybridSession,
    proceedToHybridLootReview,
    openHybridLootChest,
    completeHybridReview,
    abandonHybridSession,
    simulateLayoffHours,
    unlockTalentNode,
    toggleEquipItem,
    presets,
    savePreset,
    deletePreset,
    loadPresetIntoDraft,
    gameMode,
  } = useGame();

  // Phase 1 Pre-Workout Config State (`Idle`)
  const [selectedCategory, setSelectedCategory] = useState<WorkoutCategory | null>('GYM');
  const [mode, setMode] = useState<WorkoutSessionType>('RESISTANCE');
  const [selectedGymId, setSelectedGymId] = useState<string | null>(
    registeredGyms[0]?.id ?? null
  );
  const [lowEnergyMode, setLowEnergyMode] = useState(false);
  const [selectedRaidId, setSelectedRaidId] = useState<string>(raids[0]?.id ?? '');
  const [showPresetDesigner, setShowPresetDesigner] = useState<boolean>(false);

  // Wearable Telemetry & Ironman Verification State
  const [wearableLinked, setWearableLinked] = useState<boolean>(false);
  const [liveBpm, setLiveBpm] = useState<number>(wearableService.getLatestBpm());
  const sessionStartTimeRef = useRef<number>(Date.now());

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

  // Phase 2 Sweat-Proof Intra-Workout Set Inputs (`DungeonActive` / `Resting`)
  const [exerciseId, setExerciseId] = useState('bench_press');
  const [weightKgStr, setWeightKgStr] = useState('85');
  const [repsStr, setRepsStr] = useState('8');
  const [selectedRpe, setSelectedRpe] = useState<number>(8);
  const [isWarmup, setIsWarmup] = useState(false);
  const [setType, setSetType] = useState<SetType>('NORMAL');
  const [supersetGroupId, setSupersetGroupId] = useState<string | null>(null);
  const [customRestOverrideSec, setCustomRestOverrideSec] = useState<number | null>(null);

  // Cardio Segment Inputs
  const [cardioExerciseId, setCardioExerciseId] = useState('zone2_run');
  const [cardioMinutesStr, setCardioMinutesStr] = useState('35');
  const [hrZone, setHrZone] = useState<HeartRateZone>(2);

  // Phase 3 Inline Progression Selection (`LootReview`)
  const [allocStatTab, setAllocStatTab] = useState<HolisticStatType>('STRENGTH');
  const [allocFeedback, setAllocFeedback] = useState<string | null>(null);
  const [showTrainingHistory, setShowTrainingHistory] = useState(false);

  // Micro-animation pulse value for XP / Gold / Boss HP feedback
  const microPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!workoutMachine.lastMicroFeedback) return;
    microPulseAnim.setValue(1.06);
    Animated.spring(microPulseAnim, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [workoutMachine.lastMicroFeedback, microPulseAnim]);

  const resistanceCatalog = exercises.filter((e) => e.category === 'RESISTANCE');
  const selectedGym = registeredGyms.find((g) => g.id === selectedGymId) ?? null;

  const weightNum = Math.max(0, Number(weightKgStr) || 0);
  const repsNum = Math.max(0, Math.floor(Number(repsStr) || 0));
  const liveE1RM = isWarmup ? 0 : calculateE1RM(weightNum, repsNum);
  const priorPR = historicalPRs[exerciseId];
  const hasBaseline = Boolean(priorPR && priorPR.bestE1RM > 0);
  const relIntensity =
    hasBaseline && priorPR ? weightNum / priorPR.bestE1RM : liveE1RM > 0 ? weightNum / liveE1RM : 0;
  const isOnPrPace = !isWarmup && hasBaseline && Boolean(priorPR && liveE1RM > priorPR.bestE1RM);

  const liveRestAdvice = getOptimalRestAdvice({
    workoutType: workoutMachine.activeSession?.workoutType ?? mode,
    reps: repsNum || 8,
    relativeIntensity: relIntensity || 0.75,
    rpe: selectedRpe,
    isWarmup,
  });

  const hoursSinceLastWorkout =
    fatigueState.lastWorkoutAt !== null
      ? Math.round((Date.now() - fatigueState.lastWorkoutAt.getTime()) / (3600 * 1000))
      : 0;
  const comebackEligible = hoursSinceLastWorkout >= 72;

  const stepWeight = (delta: number) => {
    const next = Math.max(0, Math.round((weightNum + delta) * 2) / 2);
    setWeightKgStr(String(next));
  };

  const stepReps = (delta: number) => {
    const next = Math.max(1, repsNum + delta);
    setRepsStr(String(next));
  };

  const handleModeSwitch = (nextMode: WorkoutSessionType) => {
    setMode(nextMode);
    if (nextMode === 'CARDIO_LOW_MOD') {
      setCardioExerciseId('zone2_run');
      setHrZone(2);
      setCardioMinutesStr('35');
    } else if (nextMode === 'CARDIO_HIGH_INTENSITY') {
      setCardioExerciseId('sprint_intervals');
      setHrZone(5);
      setCardioMinutesStr('20');
    } else if (nextMode === 'ACTIVE_RECOVERY') {
      setCardioExerciseId('mobility_yoga');
      setHrZone(1);
      setCardioMinutesStr('25');
    }
  };

  const handleCrossThreshold = () => {
    sessionStartTimeRef.current = Date.now();
    if (wearableLinked) {
      void wearableService.startLiveSession((sample) => setLiveBpm(sample.bpm));
    }
    startHybridSession({
      workoutType: mode,
      workoutCategory: selectedCategory ?? 'GYM',
      trigger: selectedGym ? 'GEOFENCE_GYM' : 'MANUAL_OPEN_WORLD',
      gymId: selectedGym?.id ?? null,
      gymName: selectedGym?.name ?? null,
      lowEnergyMode,
      initialRestSeconds: customRestOverrideSec ?? undefined,
    });
  };

  const handleLogSet = () => {
    if (repsNum <= 0) return;
    if (wearableLinked) {
      wearableService.setSimulatedTargetBpm(152 + Math.min(25, repsNum * 2));
    }
    const exObj = resistanceCatalog.find((e) => e.id === exerciseId);
    logHybridSet({
      exerciseId,
      reps: repsNum,
      weightKg: weightNum,
      rpe: selectedRpe,
      isWarmup: isWarmup || setType === 'WARMUP',
      setType,
      supersetGroupId,
      customRestSeconds: customRestOverrideSec ?? liveRestAdvice.recommendedSeconds,
      nextSetHint: {
        exerciseId,
        exerciseName: exObj?.name ?? exerciseId,
        weightKg: weightNum,
        reps: repsNum,
      },
    });
  };

  const handleFinishWorkout = async () => {
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
        targetHrZone: hrZone,
      });

      telemetryPayload = {
        samples,
        source: wearableService.getPlatformSource(),
        isHardwareVerified: verification.verified,
        confidenceScore: verification.confidenceScore,
      };
    }

    finishHybridSession(selectedRaidId || undefined, telemetryPayload);
  };

  const handleLogCardioBlock = () => {
    const mins = Math.max(5, Number(cardioMinutesStr) || 20);
    const activityMap: Record<string, string> = {
      zone2_run: 'running',
      indoor_cycle: 'cycling',
      hiit_rower: 'rowing',
      sprint_intervals: 'running',
      mobility_yoga: 'walking',
    };
    recordHybridCardioSegment({
      exerciseId: cardioExerciseId,
      activityType: activityMap[cardioExerciseId] ?? 'running',
      durationSeconds: Math.round(mins * 60),
      averageHrZone: hrZone,
    });
  };

  const phase = workoutMachine.phase;
  const activeSession = workoutMachine.activeSession;

  // ==========================================================================
  // PHASE 1 VIEW: `Idle` ("Crossing the Threshold" — Zero-Friction Launchpad)
  // ==========================================================================
  if (phase === 'Idle') {
    const projectedTotalMultiplier = (
      ARRIVAL_BOON_MULTIPLIER *
      nextWorkoutMultiplier *
      (comebackEligible || lowEnergyMode ? 1.15 : 1.0)
    ).toFixed(2);

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Workout Category Gateway Step */}
        <WorkoutCategoryGateway
          selectedCategory={selectedCategory}
          secondaryCategories={[]}
          presets={presets}
          isOffline={false}
          onSelectPrimaryCategory={(cat) => {
            setSelectedCategory(cat);
            if (cat === 'GYM') setMode('RESISTANCE');
            else if (cat === 'CARDIO') setMode('CARDIO_LOW_MOD');
            else if (cat === 'SPORT') setMode('CARDIO_HIGH_INTENSITY');
            else if (cat === 'RECOVERY') setMode('ACTIVE_RECOVERY');
          }}
          onAddSecondarySegment={() => {}}
          onRemoveSecondarySegment={() => {}}
          onResetCategory={() => setSelectedCategory(null)}
          onLoadPreset={(preset) => {
            setSelectedCategory(preset.category);
            if (preset.category === 'GYM') setMode('RESISTANCE');
            else if (preset.category === 'CARDIO') setMode('CARDIO_LOW_MOD');
            else if (preset.category === 'SPORT') setMode('CARDIO_HIGH_INTENSITY');
            else if (preset.category === 'RECOVERY') setMode('ACTIVE_RECOVERY');

            const firstBlock = preset.blocks?.exerciseBlocks?.[0];
            if (firstBlock) {
              setExerciseId(firstBlock.exerciseSlug);
              setSupersetGroupId(firstBlock.supersetGroupId ?? null);
              const firstSet = firstBlock.sets?.[0];
              if (firstSet) {
                setWeightKgStr(String(firstSet.targetWeightKg || 0));
                setRepsStr(String(firstSet.targetReps || 0));
                setSetType(firstSet.setType || 'NORMAL');
                setIsWarmup(firstSet.setType === 'WARMUP');
                setSelectedRpe(firstSet.targetRpe ?? 8.5);
              }
            }

            startHybridSession({
              workoutType:
                preset.category === 'GYM'
                  ? 'RESISTANCE'
                  : preset.category === 'RECOVERY'
                  ? 'ACTIVE_RECOVERY'
                  : 'CARDIO_LOW_MOD',
              workoutCategory: preset.category,
              sourcePresetId: preset.id,
              trigger: selectedGym ? 'GEOFENCE_GYM' : 'MANUAL_OPEN_WORLD',
              gymId: selectedGym?.id ?? null,
              gymName: selectedGym?.name ?? null,
              lowEnergyMode,
              initialRestSeconds: customRestOverrideSec ?? undefined,
            });
          }}
          onOpenPresetDesigner={() => setShowPresetDesigner(true)}
          onOpenTrainingHistory={() => setShowTrainingHistory(true)}
        />

        {/* Rest, Consistency & Tavern Multiplier Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeTitle}>
                {fatigueState.isRestingInTavern
                  ? '🍺 Tavern Rested'
                  : '🔥 Active Training Block'}
              </Text>
              <Text style={styles.badgeSub}>
                Base Rest Mult: {nextWorkoutMultiplier.toFixed(2)}x • Streak:{' '}
                {consistencyStreak} sessions
              </Text>
            </View>

            <View style={[styles.badge, styles.boonPreviewBadge]}>
              <Text style={styles.boonPreviewTitle}>⚡ {projectedTotalMultiplier}x Total XP</Text>
              <Text style={styles.badgeSub}>Includes 1.25x Arrival Boon</Text>
            </View>
          </View>

          {combatPenalties.stacks > 0 && (
            <View style={styles.fatigueWarning}>
              <Text style={styles.fatigueWarningText}>
                ⚠️ Systemic Fatigue ({combatPenalties.stacks} stack): Log Active Recovery or rest!
              </Text>
            </View>
          )}

          {activeDungeonRun?.status === 'ACTIVE_WINDOW' && (
            <Text style={styles.liveDungeonNotice}>
              ⚡ Active 24h Dungeon Expedition: Completing this session injects a Live Combat Buff!
            </Text>
          )}
        </View>

        {/* Phase 1 Geofence / Open-World Arrival Selector */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Phase 1: Threshold Arrival Detection (Equal 1.25x Boon)
          </Text>
          <Text style={styles.helperText}>
            Entering a registered Gym Geofence or starting Open-World Training grants an immediate
            1.25x Arrival Boon with &lt;2s sensory confirmation and zero menu distractions.
          </Text>

          <View style={styles.gymSelectorCol}>
            {registeredGyms.map((gym) => {
              const active = selectedGymId === gym.id;
              return (
                <Pressable
                  key={gym.id}
                  style={[styles.gymOptionBtn, active && styles.gymOptionBtnActive]}
                  onPress={() => setSelectedGymId(gym.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.gymOptionTitle, active && { color: COLORS.gold }]}>
                      🏛️ Geofence: {gym.name}
                    </Text>
                    <Text style={styles.gymOptionSub}>
                      Cue: &ldquo;Adventurer&apos;s Guild Entered: {gym.name}&rdquo; • +1.25x XP
                    </Text>
                  </View>
                  <Text style={styles.radioDot}>{active ? '●' : '○'}</Text>
                </Pressable>
              );
            })}

            <Pressable
              style={[styles.gymOptionBtn, selectedGymId === null && styles.gymOptionBtnActive]}
              onPress={() => setSelectedGymId(null)}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.gymOptionTitle, selectedGymId === null && { color: COLORS.gold }]}
                >
                  🧭 Outside Gym: Open-World Training
                </Text>
                <Text style={styles.gymOptionSub}>
                  Cue: &ldquo;Open-World Training Begun.&rdquo; • Equal +1.25x XP Boon
                </Text>
              </View>
              <Text style={styles.radioDot}>{selectedGymId === null ? '●' : '○'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Anti-Streak Collapse Safety Net Pre-Check */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Anti-Streak Collapse Safety Net ({resilienceShields} Iron Will Shields Earned)
          </Text>
          <View style={styles.resilienceTogglesRow}>
            <Pressable
              style={[styles.resilienceChip, lowEnergyMode && styles.resilienceChipActive]}
              onPress={() => setLowEnergyMode((v) => !v)}
            >
              <Text
                style={[
                  styles.resilienceChipText,
                  lowEnergyMode && styles.resilienceChipTextActive,
                ]}
              >
                {lowEnergyMode ? '✅ ' : '🔋 '}Low-Energy / High-Stress Day (+15% Resilience Bonus)
              </Text>
            </Pressable>

            <Pressable
              style={[styles.resilienceChip, comebackEligible && styles.resilienceChipActive]}
              onPress={() => simulateLayoffHours(comebackEligible ? 24 : 96)}
            >
              <Text
                style={[
                  styles.resilienceChipText,
                  comebackEligible && styles.resilienceChipTextActive,
                ]}
              >
                {comebackEligible
                  ? `🛡️ Comeback Active (${hoursSinceLastWorkout}h since last)`
                  : '⏱️ Simulate 96h Missed-Session Gap'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.resilienceChip, wearableLinked && styles.resilienceChipActive]}
              onPress={toggleWearableLink}
            >
              <Text
                style={[
                  styles.resilienceChipText,
                  wearableLinked && styles.resilienceChipTextActive,
                ]}
              >
                {wearableLinked
                  ? `❤️ Wearable Linked (${wearableService.getPlatformSource()} • Ironman Active)`
                  : '⌚ Link Wearable (Apple Health / Health Connect)'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Workout Modality & Raid Boss Channel */}
        <Text style={styles.sectionTitle}>Select Training Discipline</Text>
        <View style={styles.modeTabs}>
          {(
            [
              { key: 'RESISTANCE', label: '🏋️ Strength (STR)' },
              { key: 'CARDIO_LOW_MOD', label: '🏃 Zone 1-3 (END)' },
              { key: 'CARDIO_HIGH_INTENSITY', label: '⚡ Zone 4-5 (AGI)' },
              { key: 'ACTIVE_RECOVERY', label: '🧘 Recovery (+25%)' },
            ] as const
          ).map((t) => (
            <Pressable
              key={t.key}
              style={[styles.modeTab, mode === t.key && styles.modeTabActive]}
              onPress={() => handleModeSwitch(t.key)}
            >
              <Text style={[styles.modeTabText, mode === t.key && styles.modeTabTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Channel Post-Workout Energy Into Raid Boss</Text>
          <View style={styles.exChipsRow}>
            {raids.map((r) => (
              <Pressable
                key={r.id}
                style={[styles.exChip, selectedRaidId === r.id && styles.exChipActive]}
                onPress={() => setSelectedRaidId(r.id)}
              >
                <Text
                  style={[styles.exChipText, selectedRaidId === r.id && styles.exChipTextActive]}
                >
                  {r.accessType === 'GUILD_ONLY' ? '🛡️ ' : '🌍 '}
                  {r.bossName}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* High-Visibility 64dp Threshold CTA */}
        <Pressable style={styles.thresholdStartBtn} onPress={handleCrossThreshold}>
          <Text style={styles.thresholdStartTitle}>
            ⚔️ {selectedGym ? `ENTER ${selectedGym.name.toUpperCase()}` : 'BEGIN OPEN-WORLD TRAINING'}
          </Text>
          <Text style={styles.thresholdStartSub}>
            Instant 1.25x Arrival Boon • Engages Zero-Distraction Focus Lock
          </Text>
        </Pressable>

        <PresetDesignerModal
          visible={showPresetDesigner}
          onSavePreset={(preset) => {
            savePreset(preset);
            triggerSensoryCue('WORKOUT_PRESET_LOADED');
          }}
          onDeletePreset={deletePreset}
          onClose={() => setShowPresetDesigner(false)}
        />

        <TrainingHistoryScreen
          visible={showTrainingHistory}
          onBack={() => setShowTrainingHistory(false)}
        />
      </ScrollView>
    );
  }

  // ==========================================================================
  // PHASE 2 VIEW: `DungeonActive` & `Resting` (Sweat-Proof Operant Loop)
  // ==========================================================================
  if ((phase === 'DungeonActive' || phase === 'Resting') && activeSession) {
    const boss = activeSession.encounterBoss;
    const bossHpPct = Math.max(0, Math.min(100, Math.round((boss.currentHp / boss.maxHp) * 100)));
    const micro = workoutMachine.lastMicroFeedback;
    const isResistanceMode =
      activeSession.workoutType === 'RESISTANCE' || activeSession.workoutType === 'HYBRID';

    return (
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Phase 1 Instantaneous (<1.6s) Threshold Banner — Non-Modal, Auto-Fading */}
        {arrivalBanner && (
          <View style={styles.arrivalToast}>
            <Text style={styles.arrivalToastTitle}>⚡ {arrivalBanner.headline}</Text>
            <Text style={styles.arrivalToastSub}>{arrivalBanner.subheadline}</Text>
          </View>
        )}

        {/* Ultra-Minimalist Micro-Feedback Bar: Boss HP + Ticking XP/Gold Counters */}
        <Animated.View
          style={[
            styles.bossHudCard,
            { transform: [{ scale: microPulseAnim }] },
          ]}
        >
          <View style={styles.bossTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bossLabel}>
                👹 {boss.bossName}{' '}
                {boss.defeatedCount > 0 ? `(Tier ${boss.defeatedCount + 1})` : ''}
              </Text>
              <Text style={styles.bossHpNumbers}>
                HP {boss.currentHp.toLocaleString()} / {boss.maxHp.toLocaleString()} ({bossHpPct}%)
              </Text>
            </View>
            <View style={styles.liveCountersRight}>
              <Text style={styles.liveXpTicker}>+{activeSession.accumulatedMicroXp} XP</Text>
              <Text style={styles.liveGoldTicker}>🪙 +{activeSession.accumulatedMicroGold}g</Text>
            </View>
          </View>

          <View style={styles.bossHpTrack}>
            <View style={[styles.bossHpFill, { width: `${bossHpPct}%` }]} />
          </View>

          {micro && (
            <View style={styles.microFeedbackStrip}>
              <Text style={styles.microFeedbackText}>
                ✨ Set #{activeSession.setLogs.length} Logged: +{micro.xpTick} XP • +
                {micro.goldTick}g • −{micro.bossHpDamage} Boss HP
                {micro.isLivePrPace ? ' • 💥 PR PACE!' : ''}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Wearable Biometric Telemetry & Ironman HUD */}
        <View style={styles.wearableLiveCard}>
          <View style={styles.wearableLiveLeft}>
            <Text style={styles.wearableHeartPulseIcon}>{wearableLinked ? '❤️' : '⌚'}</Text>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.wearableLiveBpmText}>
                  {wearableLinked ? `${liveBpm} BPM` : 'Wearable Disconnected'}
                </Text>
                {wearableLinked && (
                  <View style={styles.ironmanBadgePill}>
                    <Text style={styles.ironmanBadgeText}>IRONMAN ARMED</Text>
                  </View>
                )}
              </View>
              <Text style={styles.wearableLiveSubtext}>
                {wearableLinked
                  ? `Hardware Telemetry: ${wearableService.getPlatformSource()} • Biometrics Active`
                  : 'Manual Honesty Mode • Tap to Link Wearable'}
              </Text>
            </View>
          </View>
          <Pressable
            style={[styles.wearableMiniToggleBtn, wearableLinked && styles.wearableMiniToggleBtnActive]}
            onPress={toggleWearableLink}
          >
            <Text
              style={[
                styles.wearableMiniToggleText,
                wearableLinked && styles.wearableMiniToggleTextActive,
              ]}
            >
              {wearableLinked ? 'UNLINK' : 'LINK'}
            </Text>
          </Pressable>
        </View>

        {/* Dynamic Rest Timer with Wall-Clock Countdown & Native Phone Alerts */}
        {phase === 'Resting' && (
          <DynamicRestTimer
            targetEndTimeMs={activeSession.restTimer.endsAtMs}
            totalDurationSeconds={activeSession.restTimer.configuredSeconds}
            mode="WORKING_REST"
            headline={activeSession.restTimer.advice?.headline}
            subtext={activeSession.restTimer.advice?.physiologicalRationale}
            onAdjustDelta={(delta) => adjustHybridRestTimer({ deltaSeconds: delta })}
            onSkip={skipHybridRest}
          />
        )}

        {/* Auto-Rest Integration: Stamina Recharging Ring when in `Resting` state */}
        {phase === 'Resting' && (
          <StaminaRingTimer
            restTimer={activeSession.restTimer}
            lockscreenAlertArmed={restNotificationArmed}
            onAdjustDelta={(delta) => adjustHybridRestTimer({ deltaSeconds: delta })}
            onSelectPreset={(sec) => {
              setCustomRestOverrideSec(sec);
              adjustHybridRestTimer({ newDurationSeconds: sec });
            }}
            onSkipRest={skipHybridRest}
          />
        )}

        {/* Sweat-Proof Set Logger / Next-Set Preview Card */}
        {isResistanceMode ? (
          <View style={styles.card}>
            <View style={styles.nextSetHeaderRow}>
              <Text style={styles.cardTitle}>
                {phase === 'Resting'
                  ? `⏭️ Next-Set Preview (Set #${activeSession.setLogs.length + 1})`
                  : `🏋️ Active Set #${activeSession.setLogs.length + 1}`}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  style={styles.sweatHistoryBtn}
                  onPress={() => setShowTrainingHistory(true)}
                  testID="online-active-history-btn"
                  activeOpacity={0.7}
                >
                  <Text style={styles.sweatHistoryBtnText}>📊 History</Text>
                </TouchableOpacity>
                <Pressable
                  style={[styles.warmupToggle, (isWarmup || setType === 'WARMUP') && styles.warmupToggleActive]}
                  onPress={() => {
                    const next = !isWarmup;
                    setIsWarmup(next);
                    setSetType(next ? 'WARMUP' : 'NORMAL');
                  }}
                >
                  <Text style={styles.warmupToggleText}>
                    {isWarmup || setType === 'WARMUP' ? '🔥 Warm-Up Set' : '⚔️ Working Set'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Set Type & Superset Grouping Bar */}
            <View style={styles.setTypeAndSupersetBar}>
              <View style={styles.setTypeItem}>
                <Text style={styles.subfieldLabel}>TAG:</Text>
                <TouchableOpacity
                  style={[styles.setTypeBadgeBtn, { borderColor: SET_TYPE_COLORS[setType] }]}
                  onPress={() => {
                    const next = cycleSetType(setType);
                    setSetType(next);
                    setIsWarmup(next === 'WARMUP');
                    if (next === 'FAILURE' || next === 'AMRAP') {
                      setSelectedRpe(10);
                    }
                    triggerSensoryCue('SET_MICRO_REWARD_TICK');
                  }}
                >
                  <Text style={[styles.setTypeBadgeText, { color: SET_TYPE_COLORS[setType] }]}>
                    [{SET_TYPE_DESCRIPTORS.find((d) => d.type === setType)?.shortCode || 'N'}] {setType}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.supersetItem}>
                <Text style={styles.subfieldLabel}>SUPERSET:</Text>
                <TouchableOpacity
                  style={[styles.supersetGroupBtn, !!supersetGroupId && styles.supersetGroupBtnActive]}
                  onPress={() => {
                    const groups = [null, 'A', 'B', 'C'];
                    const nextIdx = (groups.indexOf(supersetGroupId) + 1) % groups.length;
                    setSupersetGroupId(groups[nextIdx] ?? null);
                    triggerSensoryCue('SUPERSET_TRANSITION_TICK');
                  }}
                >
                  <Text
                    style={[
                      styles.supersetGroupText,
                      !!supersetGroupId && styles.supersetGroupTextActive,
                    ]}
                  >
                    {supersetGroupId ? `Group ${supersetGroupId}` : 'None'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Large-Target Exercise Selector */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              <View style={styles.exChipsRow}>
                {resistanceCatalog.map((ex) => {
                  const selected = exerciseId === ex.id;
                  return (
                    <Pressable
                      key={ex.id}
                      style={[styles.sweatExChip, selected && styles.exChipActive]}
                      onPress={() => setExerciseId(ex.id)}
                    >
                      <Text style={[styles.exChipText, selected && styles.exChipTextActive]}>
                        {ex.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Sweaty-Hand 58dp Stepper Controls for Weight & Reps */}
            <View style={styles.sweatControlsGrid}>
              <View style={styles.sweatStepperCard}>
                <Text style={styles.sweatFieldLabel}>LOAD (KG)</Text>
                <View style={styles.stepperRow}>
                  <Pressable style={styles.bigStepBtn} onPress={() => stepWeight(-2.5)}>
                    <Text style={styles.bigStepBtnText}>−2.5</Text>
                  </Pressable>
                  <TextInput
                    style={styles.bigNumericInput}
                    keyboardType="numeric"
                    value={weightKgStr}
                    onChangeText={setWeightKgStr}
                  />
                  <Pressable style={styles.bigStepBtn} onPress={() => stepWeight(2.5)}>
                    <Text style={styles.bigStepBtnText}>+2.5</Text>
                  </Pressable>
                </View>
                <Text style={[styles.e1rmLiveHint, isOnPrPace && { color: COLORS.gold }]}>
                  {isWarmup
                    ? 'Warm-up (0 fatigue tax)'
                    : isOnPrPace
                      ? `⚡ PR PACE! e1RM ${liveE1RM}kg > ${priorPR?.bestE1RM}kg`
                      : `e1RM: ${liveE1RM}kg (${Math.round(relIntensity * 100)}% rel)`}
                </Text>
              </View>

              <View style={styles.sweatStepperCard}>
                <Text style={styles.sweatFieldLabel}>REPS COMPLETED</Text>
                <View style={styles.stepperRow}>
                  <Pressable style={styles.bigStepBtn} onPress={() => stepReps(-1)}>
                    <Text style={styles.bigStepBtnText}>−1</Text>
                  </Pressable>
                  <TextInput
                    style={styles.bigNumericInput}
                    keyboardType="numeric"
                    value={repsStr}
                    onChangeText={setRepsStr}
                  />
                  <Pressable style={styles.bigStepBtn} onPress={() => stepReps(1)}>
                    <Text style={styles.bigStepBtnText}>+1</Text>
                  </Pressable>
                </View>
                <Text style={styles.e1rmLiveHint}>
                  Optimal Rest: {liveRestAdvice.recommendedSeconds}s ({liveRestAdvice.headline.split('(')[0]?.trim()})
                </Text>
              </View>
            </View>

            {/* 1-Tap Perceived Exertion (RPE) Strip */}
            <Text style={styles.rpeStripLabel}>Perceived Exertion (RPE): {selectedRpe}</Text>
            <View style={styles.rpePillsRow}>
              {RPE_OPTIONS.map((rVal) => {
                const active = selectedRpe === rVal;
                return (
                  <Pressable
                    key={rVal}
                    style={[styles.rpePill, active && styles.rpePillActive]}
                    onPress={() => setSelectedRpe(rVal)}
                  >
                    <Text style={[styles.rpePillText, active && styles.rpePillTextActive]}>
                      {rVal}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Primary 64dp Sweaty-Hand Set Completion CTA */}
            <Pressable style={styles.logSetGiantBtn} onPress={handleLogSet}>
              <Text style={styles.logSetGiantTitle}>
                ⚡ LOG SET #{activeSession.setLogs.length + 1} ({weightNum}kg × {repsNum})
              </Text>
              <Text style={styles.logSetGiantSub}>
                Triggers Micro-Reward & Auto-Starts{' '}
                {customRestOverrideSec ?? liveRestAdvice.recommendedSeconds}s Stamina Ring
              </Text>
            </Pressable>
          </View>
        ) : (
          /* Cardio / Recovery Intra-Workout Logger */
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Log Cardio / Recovery Interval Block</Text>
            <View style={styles.inputsRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Minutes</Text>
                <TextInput
                  style={styles.bigNumericInput}
                  keyboardType="numeric"
                  value={cardioMinutesStr}
                  onChangeText={setCardioMinutesStr}
                />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.inputLabel}>Target HR Zone</Text>
                <View style={styles.rpePillsRow}>
                  {([1, 2, 3, 4, 5] as HeartRateZone[]).map((z) => (
                    <Pressable
                      key={z}
                      style={[styles.rpePill, hrZone === z && styles.rpePillActive]}
                      onPress={() => setHrZone(z)}
                    >
                      <Text style={[styles.rpePillText, hrZone === z && styles.rpePillTextActive]}>
                        Z{z}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <Pressable style={styles.logSetGiantBtn} onPress={handleLogCardioBlock}>
              <Text style={styles.logSetGiantTitle}>
                ⚡ RECORD {cardioMinutesStr}m ZONE {hrZone} BLOCK
              </Text>
            </Pressable>
          </View>
        )}

        {/* Minimalist Intra-Session Set Ledger */}
        {activeSession.setLogs.length > 0 && (
          <View style={styles.ledgerCard}>
            <Text style={styles.ledgerTitle}>
              Completed Sets ({activeSession.setLogs.length})
            </Text>
            {activeSession.setLogs.map((s) => (
              <View key={s.id} style={styles.ledgerRow}>
                <Text style={styles.ledgerLeft}>
                  #{s.setNumber} {s.exerciseName}: {s.weightKg}kg × {s.reps}
                  {s.rpe ? ` @ RPE ${s.rpe}` : ''}
                </Text>
                <Text style={styles.ledgerRight}>
                  +{s.microXpTick} XP • +{s.microGoldTick}g {s.isLivePersonalRecordPace ? '💥' : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {workoutMachine.lastError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{workoutMachine.lastError}</Text>
          </View>
        )}

        {/* Finish Workout (Phase 3 Trigger) & Abandon Controls */}
        <View style={styles.sessionFooterRow}>
          <Pressable
            style={[
              styles.finishWorkoutBtn,
              activeSession.setLogs.length === 0 &&
                activeSession.cardioSegments.length === 0 &&
                styles.btnDisabled,
            ]}
            onPress={handleFinishWorkout}
          >
            <Text style={styles.finishWorkoutBtnText}>
              🏁 FINISH WORKOUT & CONSOLIDATE REWARDS
            </Text>
          </Pressable>

          <Pressable style={styles.abandonBtn} onPress={abandonHybridSession}>
            <Text style={styles.abandonBtnText}>Cancel</Text>
          </Pressable>
        </View>

        <PresetDesignerModal
          visible={showPresetDesigner}
          onSavePreset={(preset) => {
            savePreset(preset);
            triggerSensoryCue('WORKOUT_PRESET_LOADED');
          }}
          onDeletePreset={deletePreset}
          onClose={() => setShowPresetDesigner(false)}
        />

        <TrainingHistoryScreen
          visible={showTrainingHistory}
          onBack={() => setShowTrainingHistory(false)}
        />
      </ScrollView>
    );
  }

  // ==========================================================================
  // PHASE 3A VIEW: `DungeonComplete` ("Dungeon Cleared" Effort Consolidation)
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
            {activeSession.arrivalBoon.gymName
              ? `Guild Sanctum: ${activeSession.arrivalBoon.gymName}`
              : 'Open-World Expedition Completed'}
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

          {/* Anti-Streak Collapse ("Resilience Bonus") Banner */}
          {rp.resilienceBonus.triggered && (
            <View style={styles.resilienceAwardedCard}>
              <Text style={styles.resilienceAwardedTitle}>
                🛡️ {rp.resilienceBonus.badgeTitle} (+{rp.resilienceBonus.flatBonusXp} XP & +
                {rp.resilienceBonus.flatBonusGold}g)
              </Text>
              <Text style={styles.resilienceAwardedBody}>{rp.resilienceBonus.message}</Text>
            </View>
          )}

          {/* Progressive Overload Crit Banner */}
          {crit.triggered && crit.guaranteedLootDrop && (
            <View style={styles.prCritCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Image
                  source={{ uri: LOOT_SPRITES.relic_trophy }}
                  style={{ width: 44, height: 44 }}
                  contentFit="contain"
                />
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
              7-Day Raid Boss!
            </Text>
          )}
        </View>

        <Pressable style={styles.thresholdStartBtn} onPress={proceedToHybridLootReview}>
          <Text style={styles.thresholdStartTitle}>
            🎁 ENTER LOOT REVIEW & STAT ALLOCATION
          </Text>
          <Text style={styles.thresholdStartSub}>
            Unseal [{rp.lootChest.tier}] {rp.lootChest.chestName} • Allocate Talent & Gear Upgrades
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ==========================================================================
  // PHASE 3B VIEW: `LootReview` (Effort-Gated Chest + Stat/Equipment Upgrades)
  // ==========================================================================
  if (phase === 'LootReview' && activeSession?.rewardPayload) {
    const rp = activeSession.rewardPayload;
    const chest = rp.lootChest;
    const chestColor = RARITY_COLORS[chest.tier] ?? COLORS.gold;
    const visibleTrees = DEFAULT_TALENT_TREES.filter((t) => t.governingStat === allocStatTab);
    const equippableGear = inventory.filter(isEquippableInventoryEntry);

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Effort-Gated Loot Chest Sequence */}
        <View style={[styles.chestCard, { borderColor: chestColor }]}>
          <Text style={styles.clearedEyebrow}>EFFORT & CONSISTENCY REWARD CHEST</Text>

          {/* Sprite-Based Loot Chest Icon */}
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
              {chest.drops.map((d) => (
                <View key={d.itemSlug} style={styles.lootDropRow}>
                  <Image
                    source={{ uri: LOOT_SPRITES.ore_mythic }}
                    style={{ width: 22, height: 22, marginRight: 8 }}
                    contentFit="contain"
                  />
                  <Text
                    style={[
                      styles.revealedDropLine,
                      { color: RARITY_COLORS[d.rarity] ?? COLORS.textPrimary },
                    ]}
                  >
                    • {d.quantity}x {d.itemName} [{d.rarity}]
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Post-Workout Character Progression (Unlocked Here!) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            🔓 Post-Workout Character Progression (7-Stat System)
          </Text>
          <Text style={styles.helperText}>
            Focus Lock lifted! Allocate earned Stat Talent Points across all 7 holistic archetypes.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {(
              [
                'STRENGTH',
                'ENDURANCE',
                'AGILITY',
                'DEXTERITY',
                'CONSTITUTION',
                'WISDOM',
                'SPIRIT',
              ] as const
            ).map((st) => {
              const s = stats[st];
              const req = xpRequiredForStatLevel(s.level);
              const active = allocStatTab === st;
              const meta = STAT_XP_META[st];
              return (
                <Pressable
                  key={st}
                  style={[styles.modeTab, active && styles.modeTabActive, { minWidth: 105, marginRight: 8 }]}
                  onPress={() => {
                    setAllocStatTab(st);
                    setAllocFeedback(null);
                  }}
                >
                  <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>
                    {meta?.emoji} {meta?.label ?? st} Lv.{s.level} ({s.pointsAvailable}p)
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>
                    {s.xp}/{req} XP
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {allocFeedback && <Text style={styles.allocFeedbackText}>{allocFeedback}</Text>}

          {visibleTrees.map((tree) => (
            <View key={tree.slug} style={styles.inlineTreeBox}>
              <Text style={styles.inlineTreeTitle}>
                {tree.name} ({tree.archetypeRole})
              </Text>
              {tree.nodes.slice(0, 2).map((node) => {
                const rank = unlockedTalentRanks[node.id] ?? 0;
                const check = validateTalentAllocation(
                  {
                    availablePoints: {
                      STRENGTH: stats.STRENGTH.pointsAvailable,
                      ENDURANCE: stats.ENDURANCE.pointsAvailable,
                      AGILITY: stats.AGILITY.pointsAvailable,
                      DEXTERITY: stats.DEXTERITY.pointsAvailable,
                      CONSTITUTION: stats.CONSTITUTION.pointsAvailable,
                      WISDOM: stats.WISDOM.pointsAvailable,
                      SPIRIT: stats.SPIRIT.pointsAvailable,
                    },
                    unlockedNodeRanks: unlockedTalentRanks,
                  },
                  node.id,
                  DEFAULT_TALENT_TREES
                );
                return (
                  <View key={node.id} style={styles.inlineNodeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inlineNodeName}>
                        {node.name} ({rank}/{node.maxRank})
                      </Text>
                      <Text style={styles.inlineNodeDesc}>{node.description}</Text>
                    </View>
                    <Pressable
                      style={[styles.inlineAllocBtn, !check.valid && styles.btnDisabled]}
                      onPress={() => {
                        const res = unlockTalentNode(node.id);
                        setAllocFeedback(
                          res.ok ? `Unlocked +1 ${node.name}!` : (res.error ?? 'Locked')
                        );
                      }}
                    >
                      <Text style={styles.inlineAllocBtnText}>
                        {rank >= node.maxRank ? 'MAX' : `+1 (${node.pointCostPerRank}p)`}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}

          {/* Quick Equipment Upgrade List */}
          <Text style={[styles.cardTitle, { marginTop: 10 }]}>Equipment Loadout Upgrades</Text>
          {equippableGear.map((g) => (
            <View key={g.slug} style={styles.inlineNodeRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.inlineNodeName,
                    { color: RARITY_COLORS[g.rarity] ?? COLORS.textPrimary },
                  ]}
                >
                  {g.equipped ? '✅ ' : ''}
                  {g.name} [{g.rarity}]
                </Text>
                <Text style={styles.inlineNodeDesc}>
                  Req: STR {g.requiredStrength ?? 0} • END {g.requiredEndurance ?? 0} • AGI{' '}
                  {g.requiredAgility ?? 0}
                </Text>
              </View>
              <Pressable
                style={styles.inlineEquipBtn}
                onPress={() => {
                  const res = toggleEquipItem(g.slug);
                  setAllocFeedback(
                    res.ok ? `Updated ${g.name}.` : (res.error ?? 'Stat requirement unmet')
                  );
                }}
              >
                <Text style={styles.inlineEquipBtnText}>{g.equipped ? 'Unequip' : 'Equip'}</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Save Routine as Preset Action */}
        <Pressable
          style={styles.saveAsPresetBtn}
          onPress={() => setShowPresetDesigner(true)}
        >
          <Text style={styles.saveAsPresetBtnText}>
            💾 SAVE ROUTINE AS PRESET
          </Text>
        </Pressable>

        <Pressable style={styles.finishWorkoutBtn} onPress={completeHybridReview}>
          <Text style={styles.finishWorkoutBtnText}>
            ✅ COMPLETE CONSOLIDATION & RETURN TO SANCTUM
          </Text>
        </Pressable>

        <PresetDesignerModal
          visible={showPresetDesigner}
          onSavePreset={(preset) => {
            savePreset(preset);
            triggerSensoryCue('WORKOUT_PRESET_LOADED');
          }}
          onDeletePreset={deletePreset}
          onClose={() => setShowPresetDesigner(false)}
        />

        <TrainingHistoryScreen
          visible={showTrainingHistory}
          onBack={() => setShowTrainingHistory(false)}
        />
      </ScrollView>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statusCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  boonPreviewBadge: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  badgeTitle: {
    color: COLORS.textPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  boonPreviewTitle: {
    color: COLORS.gold,
    fontWeight: '900',
    fontSize: 13,
  },
  badgeSub: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  fatigueWarning: {
    marginTop: 8,
    backgroundColor: COLORS.strengthDim,
    padding: 8,
    borderRadius: 8,
  },
  fatigueWarningText: {
    color: COLORS.strength,
    fontSize: 12,
    fontWeight: '700',
  },
  liveDungeonNotice: {
    marginTop: 8,
    color: COLORS.shieldCyan,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  helperText: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginBottom: 10,
    lineHeight: 16,
  },
  gymSelectorCol: {
    gap: 8,
  },
  gymOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgDeep,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    minHeight: 58,
  },
  gymOptionBtnActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  gymOptionTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  gymOptionSub: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  radioDot: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '900',
    marginLeft: 10,
  },
  resilienceTogglesRow: {
    gap: 8,
    marginTop: 4,
  },
  resilienceChip: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 46,
    justifyContent: 'center',
  },
  resilienceChipActive: {
    borderColor: COLORS.shieldCyan,
    backgroundColor: COLORS.agilityDim,
  },
  resilienceChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  resilienceChipTextActive: {
    color: COLORS.shieldCyan,
    fontWeight: '800',
  },
  modeTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  modeTab: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9,
    minHeight: 46,
    justifyContent: 'center',
  },
  modeTabActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  modeTabText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  modeTabTextActive: {
    color: COLORS.gold,
    fontWeight: '800',
  },
  exChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exChip: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sweatExChip: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  exChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  exChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  exChipTextActive: {
    color: COLORS.gold,
    fontWeight: '800',
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
  arrivalToast: {
    backgroundColor: COLORS.goldDim,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  arrivalToastTitle: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '900',
  },
  arrivalToastSub: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  bossHudCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    padding: 12,
    marginBottom: 12,
  },
  bossTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bossLabel: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  bossHpNumbers: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  liveCountersRight: {
    alignItems: 'flex-end',
  },
  liveXpTicker: {
    color: COLORS.agility,
    fontSize: 14,
    fontWeight: '900',
  },
  liveGoldTicker: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  bossHpTrack: {
    height: 10,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 5,
    overflow: 'hidden',
  },
  bossHpFill: {
    height: '100%',
    backgroundColor: COLORS.strength,
  },
  microFeedbackStrip: {
    marginTop: 8,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  microFeedbackText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  nextSetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sweatHistoryBtn: {
    backgroundColor: '#2A241A',
    borderColor: '#C69A45',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  sweatHistoryBtnText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '800',
  },
  warmupToggle: {
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  warmupToggleActive: {
    borderColor: COLORS.warning,
  },
  warmupToggleText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  sweatControlsGrid: {
    gap: 10,
    marginBottom: 12,
  },
  sweatStepperCard: {
    backgroundColor: COLORS.bgDeep,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  sweatFieldLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bigStepBtn: {
    minWidth: 68,
    minHeight: 58,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigStepBtnText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  bigNumericInput: {
    flex: 1,
    minHeight: 58,
    backgroundColor: COLORS.bgCard,
    color: COLORS.textPrimary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '900',
    paddingHorizontal: 10,
  },
  e1rmLiveHint: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  rpeStripLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  rpePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  rpePill: {
    minWidth: 46,
    minHeight: 46,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  rpePillActive: {
    backgroundColor: COLORS.strengthDim,
    borderColor: COLORS.strength,
  },
  rpePillText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  rpePillTextActive: {
    color: COLORS.strength,
  },
  logSetGiantBtn: {
    minHeight: 64,
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  logSetGiantTitle: {
    color: COLORS.bgDeep,
    fontSize: 15,
    fontWeight: '900',
  },
  logSetGiantSub: {
    color: COLORS.bgDeep,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    opacity: 0.85,
  },
  inputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  inputGroup: {
    minWidth: 96,
  },
  inputLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginBottom: 4,
    fontWeight: '700',
  },
  ledgerCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 12,
  },
  ledgerTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  ledgerLeft: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  ledgerRight: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  errorBanner: {
    backgroundColor: COLORS.strengthDim,
    borderColor: COLORS.strength,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  errorBannerText: {
    color: COLORS.strength,
    fontSize: 12,
    fontWeight: '700',
  },
  sessionFooterRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  finishWorkoutBtn: {
    flex: 1,
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
  abandonBtn: {
    minHeight: 56,
    paddingHorizontal: 14,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abandonBtnText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.45,
  },
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
  revealedDropLine: {
    fontSize: 14,
    fontWeight: '800',
    marginVertical: 2,
  },
  allocFeedbackText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  inlineTreeBox: {
    backgroundColor: COLORS.bgDeep,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inlineTreeTitle: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  inlineNodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  inlineNodeName: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  inlineNodeDesc: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  inlineAllocBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  inlineAllocBtnText: {
    color: COLORS.bgDeep,
    fontSize: 11,
    fontWeight: '900',
  },
  inlineEquipBtn: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  inlineEquipBtnText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '800',
  },
  setTypeAndSupersetBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    backgroundColor: '#16151A',
    borderColor: '#2F2D35',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  setTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subfieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8A8890',
  },
  setTypeBadgeBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#1E1D22',
  },
  setTypeBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  supersetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  supersetGroupBtn: {
    borderWidth: 1,
    borderColor: '#423F49',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#1E1D22',
  },
  supersetGroupBtnActive: {
    borderColor: '#C69A45',
    backgroundColor: '#3E2E10',
  },
  supersetGroupText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  supersetGroupTextActive: {
    color: '#FCD34D',
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
  wearableLiveCard: {
    backgroundColor: '#18171E',
    borderWidth: 1,
    borderColor: '#2F2D38',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wearableLiveLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  wearableHeartPulseIcon: {
    fontSize: 24,
  },
  wearableLiveBpmText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#F43F5E',
    letterSpacing: 0.3,
  },
  wearableLiveSubtext: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
    fontWeight: '600',
  },
  ironmanBadgePill: {
    backgroundColor: '#7F1D1D',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ironmanBadgeText: {
    color: '#FECACA',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  wearableMiniToggleBtn: {
    backgroundColor: '#26242E',
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  wearableMiniToggleBtnActive: {
    backgroundColor: '#37181F',
    borderColor: '#F43F5E',
  },
  wearableMiniToggleText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '800',
  },
  wearableMiniToggleTextActive: {
    color: '#FB7185',
    fontWeight: '900',
  },
  verificationBadge: {
    marginTop: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
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
  lootDropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
});
