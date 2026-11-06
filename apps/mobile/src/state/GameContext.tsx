import Constants from 'expo-constants';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import {
  ARRIVAL_BOON_MULTIPLIER,
  AggregatedTalentModifiers,
  ArrivalBoon,
  ArrivalTriggerType,
  CombatantCharacterInput,
  ConsolidatedSpoilsSummary,
  DEFAULT_DUNGEON_CATALOG,
  DEFAULT_TALENT_TREES,
  DerivedCombatAttributes,
  DungeonCombatReplayResult,
  DungeonDefinition,
  DungeonWorkoutBuff,
  EquipItemType,
  isAdventurerRankSufficient,
  EquipmentLoadoutMap,
  EquipmentSlot,
  EquipmentStatBonuses,
  FatigueStateSnapshot,
  HeartRateSample,
  HeartRateZone,
  HistoricalExercisePR,
  HybridWorkoutMachineState,
  LootDrop,
  QueuedOfflineWorkoutPayload,
  RaidRewardResolutionResult,
  RegisteredGymLocation,
  RewardPayload,
  SetLog as EngineSetLog,
  StatLevelProgressionResult,
  StatType,
  WorkoutEvaluationResult,
  WorkoutSessionType,
  WorkoutSpoilsReceipt,
  aggregateTalentModifiers,
  applyStatXpProgression,
  buildWorkoutSpoilsReceipt,
  calculateDerivedCombatStats,
  calculateElapsedGatheringTicks,
  calculateGatheringTick,
  calculateOverallCharacterLevel,
  calculateProjectedYield,
  calculateRaidRewards,
  calculateRequiredTimeForYield,
  calculateWorkoutRaidEnergyDamage,
  consolidateHybridWorkoutSession,
  consolidateSpoilsReceipts,
  createInitialHybridMachineState,
  createLiveDungeonWorkoutBuff,
  createSeededRng,
  evaluateFatigueStateAtTime,
  evaluateWorkoutSession,
  formatDurationSummary,
  formatTickInterval,
  getAvailableStrenuousXpMultiplier,
  getCompatibleSlotsForItemType,
  getSystemicFatigueCombatPenalties,
  inferOfflineWorkoutType,
  isEquippableItemType,
  isIntraWorkoutFocusLocked,
  recordWorkoutInFatigueState,
  simulateDungeonRun,
  spendTalentPoint,
  transitionHybridWorkoutState,
  validateEquipmentRequirements,
  DEFAULT_EXERCISE_CATALOG,
  SeedExerciseDefinition,
  MAX_GATHERING_DURATION_MS,
  MIN_GATHERING_DURATION_MS,
  WorkoutCategory,
  SetType,
  WorkoutPresetDefinition,
  STARTER_WORKOUT_PRESETS,
  CompletedWorkoutRecord,
  CompletedExerciseEntry,
  CompletedSetEntry,
  DEFAULT_SAMPLE_WORKOUT_HISTORY,
  filterWorkoutsForCharacter,
  countWorkoutsForCharacter,
  TrainingHistoryPruneFilter,
  TrainingHistoryPruneResult,
  pruneTrainingHistory,
  rebuildHistoricalPRsFromWorkouts,
  BASE_EQUIPPABLE_ITEMS,
  BASE_EQUIPPABLE_ITEM_BY_SLUG,
  ITEM_TIER_CONFIG,
  ItemTier,
  PrimaryStatBonuses,
  Tier5UniqueDefinition,
  rollProceduralItemInstance,
  proceduralItemToLootDrop,
  aggregateEquippedItemModifiers,
  ExerciseGymPreferenceMap,
  WarmupPresetCount,
  WeightUnit,
  convertDisplayWeightToKg,
  convertKgToDisplayWeight,
  formatCleanWeightNumber,
  normalizeGymId,
  resolveExerciseWeightUnit,
  upsertExerciseBarWeightKg,
  upsertExerciseStickyNote,
  upsertExerciseWeightUnit,
} from '@gymify/game-engine';
import {
  OfflineDraftExerciseBlock,
  OfflineWorkoutDraft,
  PersistedCharacterProfile,
  PersistedOfflineBundle,
  createDefaultOfflineDraft,
  getMergedPresets,
  loadPersistedOfflineBundle,
  savePersistedOfflineBundle,
} from '../utils/offlineStorage';
import {
  cancelStaminaRechargedNotification,
  dismissDeliveredStaminaNotifications,
  ensureRestNotificationPermission,
  initializeRestNotifications,
  scheduleStaminaRechargedNotification,
  subscribeToStaminaNotificationTap,
} from '../utils/restNotificationScheduler';
import {
  cancelGatheringTargetNotification,
  scheduleGatheringTargetNotification,
} from '../utils/gatheringNotifications';
import { triggerSensoryCue } from '../utils/sensoryFeedback';
import { diagnosticLogger } from '../services/DiagnosticLogger';
import {
  API_BASE_URL,
  AuthUser,
  LoginPayload,
  RegisterPayload,
  apiFetch,
  createCharacterAccount,
  updateCharacterAccount,
  deleteCharacterAccount,
  restoreCharacterAccount,
  fetchCharacterSheet,
  fetchCurrentSession,
  fetchUserCharacters,
  getStoredAuthToken,
  loginAccount,
  logoutAccount,
  registerAccount,
  resolveApiBaseUrl,
  gymifyWebSocket,
} from '../api';
import { WearableTelemetrySource } from '../services/wearableTelemetry';

export type GameLocation =
  | 'TAVERN'
  | 'GUILD_HALL'
  | 'DUNGEON'
  | 'GATHERING_NODE'
  | 'RAID_SANCTUM';

export type AdventurerRank =
  | 'COPPER'
  | 'IRON'
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'MYTHIC';

export interface ExerciseCatalogItem {
  id: string;
  name: string;
  category: 'RESISTANCE' | 'CARDIO' | 'RECOVERY_MOBILITY';
  workoutCategory?: WorkoutCategory;
  primaryStat: StatType;
  baseXpFactor: number;
  muscleGroup?: string;
  equipmentType?: string;
  activityType?: string;
  isCompound?: boolean;
  isCustom?: boolean;
  description?: string;
}

export interface InventoryEntry {
  slug: string;
  name: string;
  description?: string;
  rarity: LootDrop['rarity'];
  quantity: number;
  itemType: EquipItemType;
  weaponHandedness?: 'ONE_HANDED' | 'TWO_HANDED';
  requiredStrength?: number;
  requiredEndurance?: number;
  requiredAgility?: number;
  statBonuses?: EquipmentStatBonuses;
  equipped?: boolean;
  equippedSlot?: EquipmentSlot | null;
  baseSlug?: string;
  tier?: ItemTier;
  prefixId?: string | null;
  prefixLabel?: string | null;
  prefixSummary?: string | null;
  suffixId?: string | null;
  suffixLabel?: string | null;
  suffixSummary?: string | null;
  baseStatsSummary?: string;
  primaryStatBonuses?: PrimaryStatBonuses;
  uniquePassive?: Tier5UniqueDefinition | LootDrop['uniquePassive'];
}

export function isEquippableInventoryEntry(item: InventoryEntry): boolean {
  return isEquippableItemType(item.itemType);
}

export interface GatheringNodeItem {
  slug: string;
  name: string;
  professionType: 'MINING' | 'FORAGING' | 'SMELTING' | 'ALCHEMY';
  description: string;
  durationSeconds: number;
  requiredStatType: StatType;
  requiredStatLevel: number;
  inputMaterials: Array<{ slug: string; name: string; quantity: number }>;
  lootTable: Array<LootDrop & { weight: number }>;
}

export interface ActiveGatheringState {
  taskId: string;
  node: GatheringNodeItem;
  startedAtMs: number;
  completesAtMs: number;
  targetDurationMs: number;
  targetYieldAmount?: number;
  notifyOnCompletion: boolean;
  lastTickProcessedAtMs: number;
  accumulatedTicks: number;
  accumulatedYield: number;
}

export interface ActiveDungeonRunState {
  runId: string;
  dungeon: DungeonDefinition;
  party: CombatantCharacterInput[];
  startedAtMs: number;
  resolvesAtMs: number;
  activeWorkoutBuffs: DungeonWorkoutBuff[];
  status: 'ACTIVE_WINDOW' | 'COMPLETED';
  replay: DungeonCombatReplayResult | null;
}

export interface RaidBossState {
  id: string;
  bossName: string;
  accessType: 'PUBLIC_WORLD' | 'GUILD_ONLY';
  guildName?: string;
  maxHp: number;
  currentHp: number;
  endsAtMs: number;
  dailyAttackUsedToday: boolean;
  participants: Array<{
    characterId: string;
    name: string;
    combatDamageDealt: number;
    workoutEnergyDamage: number;
    supportScore: number;
  }>;
  lastResolution: RaidRewardResolutionResult | null;
}

export interface GuildBountyItem {
  slug: string;
  title: string;
  description: string;
  isRankUpTrial: boolean;
  requiredRank: AdventurerRank;
  unlocksRank?: AdventurerRank;
  goldReward: number;
  reputationReward: number;
  completed: boolean;
}

interface GameContextValue {
  serverOnline: boolean;
  characterName: string;
  characterArtUri: string | null;
  setCharacterArtUri: (uri: string | null) => void;
  overallLevel: number;
  adventurerRank: AdventurerRank;
  adventurerReputation: number;
  guildName: string;
  guildReputation: number;
  gold: number;
  location: GameLocation;
  activityState: 'IDLE' | 'RESTING_TAVERN' | 'GATHERING' | 'IN_DUNGEON';
  stats: {
    STRENGTH: { level: number; xp: number; pointsAvailable: number };
    ENDURANCE: { level: number; xp: number; pointsAvailable: number };
    AGILITY: { level: number; xp: number; pointsAvailable: number };
    DEXTERITY: { level: number; xp: number; pointsAvailable: number };
    CONSTITUTION: { level: number; xp: number; pointsAvailable: number };
    WISDOM: { level: number; xp: number; pointsAvailable: number };
    SPIRIT: { level: number; xp: number; pointsAvailable: number };
  };
  unlockedTalentRanks: Record<string, number>;
  aggregatedTalents: AggregatedTalentModifiers;
  equipmentLoadout: EquipmentLoadoutMap;
  equipmentBonuses: EquipmentStatBonuses;
  derivedCombatStats: DerivedCombatAttributes;
  fatigueState: FatigueStateSnapshot;
  nextWorkoutMultiplier: number;
  combatPenalties: ReturnType<typeof getSystemicFatigueCombatPenalties>;
  exercises: ExerciseCatalogItem[];
  historicalPRs: Record<string, HistoricalExercisePR>;
  workoutsLoggedCount: number;
  consistencyStreak: number;
  resilienceShields: number;
  lastWorkoutResult: WorkoutEvaluationResult | null;
  registeredGyms: RegisteredGymLocation[];
  workoutMachine: HybridWorkoutMachineState;
  arrivalBanner: ArrivalBoon | null;
  restNotificationArmed: boolean;
  notificationTapTick: number;
  lastHybridConsolidation: {
    rewardPayload: RewardPayload;
    injectedBuffs: DungeonWorkoutBuff[];
    raidEnergy: number;
  } | null;
  inventory: InventoryEntry[];
  gatheringNodes: GatheringNodeItem[];
  activeGathering: ActiveGatheringState | null;
  lastGatheringDrop: LootDrop[] | null;
  dungeons: readonly DungeonDefinition[];
  starterDungeon: DungeonDefinition;
  companionRoster: CombatantCharacterInput[];
  activeDungeonRun: ActiveDungeonRunState | null;
  raids: RaidBossState[];
  bounties: GuildBountyItem[];

  // Offline Workout & Deferred Spoils Receipt Queue
  offlineDraft: OfflineWorkoutDraft;
  updateOfflineDraft: (updater: (prev: OfflineWorkoutDraft) => OfflineWorkoutDraft) => void;
  resetOfflineDraft: () => void;
  queuedOfflineWorkouts: QueuedOfflineWorkoutPayload[];
  unsyncedServerCount: number;
  pendingWorkoutReceipts: WorkoutSpoilsReceipt[];
  consolidatedSpoils: ConsolidatedSpoilsSummary | null;
  unclaimedSpoilsCount: number;
  landingToastMessage: string | null;
  dismissLandingToast: () => void;
  completeOfflineWorkout: () => { ok: boolean; error?: string };
  syncOfflineWorkouts: (options?: { evaluateLocallyIfOffline?: boolean }) => Promise<void>;
  claimPendingSpoils: () => void;

  // Training History Matrix Data
  workoutHistory: CompletedWorkoutRecord[];
  recordWorkoutHistory: (record: CompletedWorkoutRecord) => void;
  clearWorkoutHistory: () => void;
  pruneWorkoutHistory: (filter: TrainingHistoryPruneFilter) => TrainingHistoryPruneResult;
  restoreSampleWorkoutHistory: () => void;

  // Presets
  presets: WorkoutPresetDefinition[];
  savePreset: (preset: WorkoutPresetDefinition) => void;
  deletePreset: (presetId: string) => void;
  loadPresetIntoDraft: (preset: WorkoutPresetDefinition, mode?: 'OFFLINE' | 'ONLINE') => void;

  travelTo: (dest: GameLocation) => void;
  startHybridSession: (params: {
    workoutType: WorkoutSessionType;
    workoutCategory?: WorkoutCategory;
    sourcePresetId?: string | null;
    trigger: ArrivalTriggerType;
    gymId?: string | null;
    gymName?: string | null;
    lowEnergyMode?: boolean;
    initialRestSeconds?: number;
  }) => { ok: boolean; error?: string };
  logHybridSet: (params: {
    exerciseId: string;
    reps: number;
    weightKg: number;
    rpe?: number | null;
    isWarmup?: boolean;
    setType?: SetType;
    supersetGroupId?: string | null;
    customRestSeconds?: number;
    nextSetHint?: { exerciseId: string; exerciseName: string; weightKg: number; reps: number };
  }) => { ok: boolean; error?: string };
  recordHybridCardioSegment: (params: {
    exerciseId: string;
    activityType: string;
    durationSeconds: number;
    averageHrZone: HeartRateZone;
  }) => { ok: boolean; error?: string };
  adjustHybridRestTimer: (params: { deltaSeconds?: number; newDurationSeconds?: number }) => void;
  skipHybridRest: () => void;
  finishHybridSession: (
    channelToRaidId?: string,
    telemetryOptions?: {
      samples?: HeartRateSample[];
      source?: WearableTelemetrySource;
      isHardwareVerified?: boolean;
      confidenceScore?: number;
    }
  ) => { ok: boolean; error?: string };
  proceedToHybridLootReview: () => void;
  openHybridLootChest: () => void;
  completeHybridReview: () => void;
  abandonHybridSession: () => void;
  requestFocusOverride: (targetTab: string) => void;
  cancelFocusOverride: () => void;
  confirmFocusOverride: () => void;
  simulateLayoffHours: (hoursAgo: number) => void;
  logManualWorkout: (params: {
    workoutType: WorkoutSessionType;
    sets: Array<{ exerciseId: string; reps: number; weightKg: number; isWarmup?: boolean }>;
    cardioSegments: Array<{
      exerciseId: string;
      activityType: string;
      durationSeconds: number;
      averageHrZone: HeartRateZone;
    }>;
    channelToRaidId?: string;
  }) => { evaluation: WorkoutEvaluationResult; injectedBuffs: DungeonWorkoutBuff[]; raidEnergy: number };
  unlockTalentNode: (nodeId: string) => { ok: boolean; error?: string };
  toggleEquipItem: (slug: string) => { ok: boolean; error?: string };
  equipItemToSlot: (
    slug: string,
    targetSlot?: EquipmentSlot
  ) => { ok: boolean; error?: string; slot?: EquipmentSlot };
  unequipSlot: (slot: EquipmentSlot) => void;
  startGatheringTask: (
    nodeSlug: string,
    options?: {
      targetDurationMs?: number;
      targetYieldAmount?: number;
      notifyOnCompletion?: boolean;
    }
  ) => { ok: boolean; error?: string };
  completeGatheringNow: () => void;
  syncGatheringTicks: () => Promise<void>;
  startDungeonExpedition: (selectedPartyIds: string[], dungeonSlug?: string) => { ok: boolean; error?: string };
  resolveActiveDungeonNow: () => void;
  dismissCompletedDungeonReplay: () => void;
  lockDailyRaidStrike: (raidId: string) => { ok: boolean; damage?: number; error?: string };
  resolveWeeklyRaidRewards: (raidId: string) => void;
  completeGuildBounty: (bountySlug: string) => { ok: boolean; error?: string };

  // Production JWT Authentication & Session
  authToken: string | null;
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  isLiveSyncConnected: boolean;
  gameMode: 'STANDARD' | 'IRONMAN_VERIFIED';
  setGameMode: (mode: 'STANDARD' | 'IRONMAN_VERIFIED') => void;
  appearanceId: string;
  characters: PersistedCharacterProfile[];
  deletedCharacters: PersistedCharacterProfile[];
  activeCharacterId: string | null;
  switchCharacter: (characterId: string) => Promise<boolean>;
  createCharacter: (
    name: string,
    mode: 'STANDARD' | 'IRONMAN_VERIFIED',
    appearanceIdOrAvatar?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  updateCharacterAppearance: (
    appearanceId: string,
    characterId?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteCharacter: (
    characterId: string,
    permanent?: boolean
  ) => Promise<{ ok: boolean; error?: string }>;
  restoreCharacter: (characterId: string) => Promise<{ ok: boolean; error?: string }>;
  refreshCharacterSheet: () => Promise<void>;
  login: (credentials: LoginPayload) => Promise<{ ok: boolean; error?: string }>;
  register: (payload: RegisterPayload) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  customExercises: SeedExerciseDefinition[];
  addCustomExercise: (input: {
    name: string;
    workoutCategory: WorkoutCategory;
    category?: 'RESISTANCE' | 'CARDIO' | 'RECOVERY_MOBILITY';
    primaryStat?: StatType;
    muscleGroup?: string;
    equipmentType?: string;
    activityType?: string;
    isCompound?: boolean;
    description?: string;
  }) => SeedExerciseDefinition;
  deleteCustomExercise: (exerciseId: string) => void;
  recentActivityIds: string[];
  recordRecentActivity: (activityId: string) => void;

  // Intra-Workout Ergonomics & Gym-Aware Preferences
  exerciseGymPreferences: ExerciseGymPreferenceMap;
  saveExerciseStickyNote: (params: {
    exerciseId: string;
    note: string;
    activeGymId?: string | null;
    activeGymName?: string | null;
    saveAsGlobal?: boolean;
  }) => void;
  saveExerciseWeightUnit: (params: {
    exerciseId: string;
    unit: WeightUnit;
    activeGymId?: string | null;
    activeGymName?: string | null;
  }) => void;
  saveExerciseBarWeightKg: (exerciseId: string, barWeightKg: number) => void;
  defaultWeightUnit: WeightUnit;
  setDefaultWeightUnit: (unit: WeightUnit) => void;
  warmupPresetCount: WarmupPresetCount;
  setWarmupPresetCount: (count: WarmupPresetCount) => void;
}

const STARTER_EXERCISES: ExerciseCatalogItem[] = [
  ...DEFAULT_EXERCISE_CATALOG.map((catItem) => ({
    id: catItem.slug,
    name: catItem.name,
    category: catItem.category,
    workoutCategory: catItem.workoutCategory,
    primaryStat: catItem.primaryStat,
    baseXpFactor: catItem.baseXpFactor,
    muscleGroup: catItem.muscleGroup,
    equipmentType: catItem.equipmentType,
    activityType: catItem.activityType,
    isCompound: catItem.isCompound,
    isCustom: catItem.isCustom,
    description: catItem.description,
  })),
  { id: 'bench_press', name: 'Barbell Bench Press', category: 'RESISTANCE' as const, workoutCategory: 'GYM' as const, primaryStat: 'STRENGTH' as const, baseXpFactor: 1.15, muscleGroup: 'CHEST', equipmentType: 'BARBELL', isCompound: true },
  { id: 'barbell_squat', name: 'Barbell Back Squat', category: 'RESISTANCE' as const, workoutCategory: 'GYM' as const, primaryStat: 'STRENGTH' as const, baseXpFactor: 1.18, muscleGroup: 'LEGS', equipmentType: 'BARBELL', isCompound: true },
  { id: 'deadlift', name: 'Barbell Deadlift', category: 'RESISTANCE' as const, workoutCategory: 'GYM' as const, primaryStat: 'STRENGTH' as const, baseXpFactor: 1.2, muscleGroup: 'POSTERIOR_CHAIN', equipmentType: 'BARBELL', isCompound: true },
  { id: 'overhead_press', name: 'Standing Overhead Press', category: 'RESISTANCE' as const, workoutCategory: 'GYM' as const, primaryStat: 'STRENGTH' as const, baseXpFactor: 1.15, muscleGroup: 'SHOULDERS', equipmentType: 'BARBELL', isCompound: true },
  { id: 'weighted_pullup', name: 'Weighted Pull-Up', category: 'RESISTANCE' as const, workoutCategory: 'GYM' as const, primaryStat: 'STRENGTH' as const, baseXpFactor: 1.18, muscleGroup: 'BACK', equipmentType: 'PULL_UP_DIP_STATION', isCompound: true },
  { id: 'zone2_run', name: 'Aerobic Run (Zone 2 Base)', category: 'CARDIO' as const, workoutCategory: 'CARDIO' as const, primaryStat: 'ENDURANCE' as const, baseXpFactor: 1.05, muscleGroup: 'AEROBIC', equipmentType: 'NONE', isCompound: true },
  { id: 'indoor_cycle', name: 'Stationary / Road Cycling', category: 'CARDIO' as const, workoutCategory: 'CARDIO' as const, primaryStat: 'ENDURANCE' as const, baseXpFactor: 1.0, muscleGroup: 'AEROBIC', equipmentType: 'BIKE', isCompound: true },
  { id: 'hiit_rower', name: 'Rowing Ergometer HIIT', category: 'CARDIO' as const, workoutCategory: 'CARDIO' as const, primaryStat: 'AGILITY' as const, baseXpFactor: 1.05, muscleGroup: 'FULL_BODY', equipmentType: 'ERGOMETER', isCompound: true },
  { id: 'sprint_intervals', name: 'Track / Assault Bike Sprints', category: 'CARDIO' as const, workoutCategory: 'CARDIO' as const, primaryStat: 'AGILITY' as const, baseXpFactor: 1.1, muscleGroup: 'ANAEROBIC', equipmentType: 'NONE', isCompound: true },
  { id: 'mobility_yoga', name: 'Mobility & Restoration Yoga', category: 'RECOVERY_MOBILITY' as const, workoutCategory: 'RECOVERY' as const, primaryStat: 'ENDURANCE' as const, baseXpFactor: 1.0, muscleGroup: 'FULL_BODY', equipmentType: 'MAT', isCompound: false },
].filter((item, index, arr) => arr.findIndex((i) => i.id === item.id) === index);

const EXERCISE_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  STARTER_EXERCISES.map((ex) => [ex.id, ex.name])
);

const EXERCISE_CATEGORY_BY_ID: Record<
  string,
  'RESISTANCE' | 'CARDIO' | 'RECOVERY_MOBILITY'
> = Object.fromEntries(STARTER_EXERCISES.map((ex) => [ex.id, ex.category]));

const EXERCISE_BASE_XP_BY_ID: Record<string, number> = Object.fromEntries(
  STARTER_EXERCISES.map((ex) => [ex.id, ex.baseXpFactor])
);

/**
 * Metadata catalog for loot drops so dropped items receive rich types, slots, and stat bonuses.
 */
const KNOWN_ITEM_METADATA: Record<
  string,
  Pick<
    InventoryEntry,
    | 'itemType'
    | 'description'
    | 'weaponHandedness'
    | 'requiredStrength'
    | 'requiredEndurance'
    | 'requiredAgility'
    | 'statBonuses'
  >
> = {
  vitality_elixir: {
    itemType: 'CONSUMABLE',
    description: 'Restorative alchemical draught brewed from Sunleaf herbs (+25 Stamina).',
    statBonuses: { maxStamina: 25 },
  },
  tempered_whetstone: {
    itemType: 'CONSUMABLE',
    description: 'Honestone edge-sharpener used prior to dungeon boss encounters.',
  },
  iron_ore_cluster: {
    itemType: 'MATERIAL',
    description: 'Raw iron ore cluster mined from Iron Crag veins.',
  },
  sunleaf_herb_bundle: {
    itemType: 'MATERIAL',
    description: 'Fragrant wild herbs used in stamina alchemy.',
  },
  obsidian_ingot: {
    itemType: 'MATERIAL',
    description: 'Refined dark-steel alloy prized by guild blacksmiths.',
  },
  titanite_ember: {
    itemType: 'MATERIAL',
    description: 'Volatile forge ember capable of tempering Epic armaments.',
  },
  champion_sigil_shard: {
    itemType: 'MATERIAL',
    description: 'Legendary shard earned through peak progressive overload.',
  },
  raid_essence_crystal: {
    itemType: 'MATERIAL',
    description: 'Crystallized essence dropped by Raid Bosses.',
  },
  // Dynamically include all 32 base equippable armaments
  ...Object.fromEntries(
    BASE_EQUIPPABLE_ITEMS.map((base) => [
      base.baseSlug,
      {
        itemType: base.itemType,
        description: base.description,
        weaponHandedness: base.handedness,
        requiredStrength: base.statRequirements?.STR ?? 0,
        requiredEndurance: base.statRequirements?.END ?? 0,
        requiredAgility: base.statRequirements?.AGI ?? 0,
        statBonuses: {
          meleePower: base.baseStats.meleePower,
          armorRating: base.baseStats.armor,
          maxHp: base.baseStats.maxHp,
          maxStamina: base.baseStats.maxStamina,
          attackSpeedPct: base.baseStats.attackSpeedPct,
          dodgeRating: base.baseStats.dodgeChancePct,
          critChance: base.baseStats.critChancePct,
          damageMitigationPct: base.baseStats.damageMitigationPct,
          lifeOnHit: base.baseStats.lifeOnHit,
          armorPenetrationPct: base.baseStats.armorPenetrationPct,
          skillPotencyPct: base.baseStats.skillPotencyPct,
          startOfCombatShieldHp: base.baseStats.startOfCombatShieldHp,
          hazardResistancePct: base.baseStats.hazardResistancePct,
        },
      },
    ])
  ),
};

const STARTER_DUNGEON: DungeonDefinition = {
  dungeonSlug: 'obsidian_catacombs',
  dungeonName: 'Obsidian Catacombs (24h Expedition)',
  maxSimulationSeconds: 240,
  rooms: [
    {
      roomNumber: 1,
      roomName: 'Crypt Gatehouse',
      roomType: 'MOB_ENCOUNTER',
      guaranteedGold: 50,
      enemies: [
        {
          enemyId: 'skeleton_vanguard',
          name: 'Skeletal Vanguard',
          maxHp: 210,
          attackPower: 22,
          armor: 12,
          attackIntervalSeconds: 1.8,
        },
        {
          enemyId: 'crypt_archer',
          name: 'Crypt Bone-Archer',
          maxHp: 145,
          attackPower: 25,
          armor: 6,
          attackIntervalSeconds: 1.5,
        },
      ],
    },
    {
      roomNumber: 2,
      roomName: 'Hall of Pendulum Blades',
      roomType: 'HAZARD_EVENT',
      guaranteedGold: 35,
      hazardConfig: {
        hazardName: 'Swinging Obsidian Blades',
        baseDamage: 55,
        staminaDrain: 18,
      },
    },
    {
      roomNumber: 3,
      roomName: 'Sanctum of Bone Lord Malakor',
      roomType: 'BOSS',
      guaranteedGold: 180,
      lootRolls: 2,
      enemies: [
        {
          enemyId: 'bone_lord_malakor',
          name: 'Bone Lord Malakor',
          isBoss: true,
          maxHp: 650,
          attackPower: 40,
          armor: 22,
          attackIntervalSeconds: 1.6,
          cleaveTargets: 2,
        },
      ],
      lootTable: [
        {
          itemSlug: 'malakor_signet',
          itemName: "Malakor's Signet Ring",
          rarity: 'EPIC',
          quantity: 1,
          weight: 40,
        },
        {
          itemSlug: 'obsidian_ingot',
          itemName: 'Obsidian Steel Ingot',
          rarity: 'UNCOMMON',
          quantity: 3,
          weight: 60,
        },
      ],
    },
    {
      roomNumber: 4,
      roomName: 'Sunken Reliquary Chest',
      roomType: 'LOOT_CHEST',
      guaranteedGold: 85,
      lootRolls: 1,
      lootTable: [
        {
          itemSlug: 'obsidian_ingot',
          itemName: 'Obsidian Steel Ingot',
          rarity: 'UNCOMMON',
          quantity: 2,
          weight: 70,
        },
        {
          itemSlug: 'vitality_elixir',
          itemName: 'Elixir of Peak Output',
          rarity: 'RARE',
          quantity: 1,
          weight: 30,
        },
      ],
    },
  ],
};

const COMPANION_ROSTER: CombatantCharacterInput[] = [
  {
    characterId: 'ally_lyra',
    name: 'Lyra (Guild Warden)',
    coreStats: { strengthLevel: 4, enduranceLevel: 9, agilityLevel: 6 },
    equipmentBonuses: { maxHp: 75, maxStamina: 40, armorRating: 14 },
    unlockedTalentRanks: {
      war_deep_lungs: 3,
      war_renewal_aura: 2,
      war_second_wind_hymn: 1,
      out_trailblazer: 2,
    },
  },
  {
    characterId: 'ally_kaelen',
    name: 'Kaelen (Guild Assassin)',
    coreStats: { strengthLevel: 6, enduranceLevel: 5, agilityLevel: 10 },
    equipmentBonuses: { meleePower: 26, critChance: 0.08, attackSpeedPct: 0.12 },
    unlockedTalentRanks: {
      ass_shadowstep_reflexes: 3,
      ass_ambush_lethality: 2,
      ass_phantom_strike: 1,
    },
  },
  {
    characterId: 'ally_torin',
    name: 'Torin (Guild Vanguard)',
    coreStats: { strengthLevel: 10, enduranceLevel: 7, agilityLevel: 4 },
    equipmentBonuses: { meleePower: 30, armorRating: 20 },
    unlockedTalentRanks: {
      van_heavy_handed: 3,
      van_sundering_strikes: 2,
      van_colossus_cleave: 1,
    },
  },
];

const GATHERING_NODES: GatheringNodeItem[] = [
  {
    slug: 'iron_crag_mining',
    name: 'Mine Iron Crag Vein',
    professionType: 'MINING',
    description: '2-hour idle excavation yielding Rich Iron Ore Clusters & rare Obsidian Steel.',
    durationSeconds: 7200,
    requiredStatType: 'STRENGTH',
    requiredStatLevel: 1,
    inputMaterials: [],
    lootTable: [
      { itemSlug: 'iron_ore_cluster', itemName: 'Rich Iron Ore Cluster', rarity: 'COMMON', quantity: 4, weight: 80 },
      { itemSlug: 'obsidian_ingot', itemName: 'Obsidian Steel Ingot', rarity: 'UNCOMMON', quantity: 1, weight: 20 },
    ],
  },
  {
    slug: 'whisperwood_foraging',
    name: 'Forage Whisperwood Glade',
    professionType: 'FORAGING',
    description: '2-hour botanical expedition gathering Sunleaf Herb Bundles.',
    durationSeconds: 7200,
    requiredStatType: 'ENDURANCE',
    requiredStatLevel: 1,
    inputMaterials: [],
    lootTable: [
      { itemSlug: 'sunleaf_herb_bundle', itemName: 'Sunleaf Herb Bundle', rarity: 'COMMON', quantity: 4, weight: 85 },
      { itemSlug: 'vitality_elixir', itemName: 'Elixir of Peak Output', rarity: 'RARE', quantity: 1, weight: 15 },
    ],
  },
  {
    slug: 'guild_foundry_smelting',
    name: 'Smelt Obsidian Steel Ingots',
    professionType: 'SMELTING',
    description: '2-hour forge refining 2x Rich Iron Ore Clusters into 2x Obsidian Steel Ingots.',
    durationSeconds: 7200,
    requiredStatType: 'STRENGTH',
    requiredStatLevel: 2,
    inputMaterials: [{ slug: 'iron_ore_cluster', name: 'Rich Iron Ore Cluster', quantity: 2 }],
    lootTable: [
      { itemSlug: 'obsidian_ingot', itemName: 'Obsidian Steel Ingot', rarity: 'UNCOMMON', quantity: 2, weight: 100 },
    ],
  },
  {
    slug: 'sanctum_alchemy_brewing',
    name: 'Brew Elixirs of Peak Output',
    professionType: 'ALCHEMY',
    description: '2-hour distillation turning 2x Sunleaf Herb Bundles into Rare Elixirs.',
    durationSeconds: 7200,
    requiredStatType: 'AGILITY',
    requiredStatLevel: 2,
    inputMaterials: [{ slug: 'sunleaf_herb_bundle', name: 'Sunleaf Herb Bundle', quantity: 2 }],
    lootTable: [
      { itemSlug: 'vitality_elixir', itemName: 'Elixir of Peak Output', rarity: 'RARE', quantity: 2, weight: 100 },
    ],
  },
];

const REGISTERED_GYMS: RegisteredGymLocation[] = [
  {
    id: 'gym_iron_sanctum',
    name: 'Iron Sanctum Barbell Club',
    latitude: 37.7749,
    longitude: -122.4194,
    radiusMeters: 120,
  },
  {
    id: 'gym_titan_foundry',
    name: 'Titan Foundry Athletics',
    latitude: 37.7815,
    longitude: -122.4091,
    radiusMeters: 120,
  },
];

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 2500
): Promise<Response> {
  return await apiFetch(url, init, timeoutMs);
}

const DEFAULT_LOCAL_CHARACTER_ID = 'local_starter_hero';

const DEFAULT_GUILD_BOUNTIES: GuildBountyItem[] = [
  {
    slug: 'trial_of_iron',
    title: 'Rank-Up Trial: Copper -> Iron',
    description: 'Log 3 workouts & clear a 24h Dungeon Expedition to advance to IRON Rank.',
    isRankUpTrial: true,
    requiredRank: 'COPPER',
    unlocksRank: 'IRON',
    goldReward: 350,
    reputationReward: 250,
    completed: false,
  },
  {
    slug: 'trial_of_bronze',
    title: 'Rank-Up Trial: Iron -> Bronze',
    description: 'Achieve IRON Rank and reach Combined Core Stat Level 15.',
    isRankUpTrial: true,
    requiredRank: 'IRON',
    unlocksRank: 'BRONZE',
    goldReward: 700,
    reputationReward: 500,
    completed: false,
  },
  {
    slug: 'weekly_zone2_patrol',
    title: 'Guild Bounty: Outrider Perimeter Patrol',
    description: 'Complete an aerobic endurance workout or idle gathering task.',
    isRankUpTrial: false,
    requiredRank: 'COPPER',
    goldReward: 200,
    reputationReward: 120,
    completed: false,
  },
];

function buildBountiesForCharacter(
  rank: AdventurerRank,
  completedSlugs: string[] = []
): GuildBountyItem[] {
  const completedSet = new Set(completedSlugs);
  if (isAdventurerRankSufficient(rank, 'IRON')) {
    completedSet.add('trial_of_iron');
  }
  if (isAdventurerRankSufficient(rank, 'BRONZE')) {
    completedSet.add('trial_of_bronze');
  }
  return DEFAULT_GUILD_BOUNTIES.map((b) => ({
    ...b,
    completed: completedSet.has(b.slug),
  }));
}

const EQUIPMENT_SLOT_KEYS: (keyof EquipmentLoadoutMap)[] = [
  'mainHand',
  'offHand',
  'head',
  'chest',
  'legs',
  'boots',
  'accessory1',
  'accessory2',
];

const EMPTY_EQUIPMENT_LOADOUT: EquipmentLoadoutMap = {
  mainHand: null,
  offHand: null,
  head: null,
  chest: null,
  legs: null,
  boots: null,
  accessory1: null,
  accessory2: null,
};

function createLevelOneStats() {
  return {
    STRENGTH: { level: 1, xp: 0, pointsAvailable: 0 },
    ENDURANCE: { level: 1, xp: 0, pointsAvailable: 0 },
    AGILITY: { level: 1, xp: 0, pointsAvailable: 0 },
    DEXTERITY: { level: 1, xp: 0, pointsAvailable: 0 },
    CONSTITUTION: { level: 1, xp: 0, pointsAvailable: 0 },
    WISDOM: { level: 1, xp: 0, pointsAvailable: 0 },
    SPIRIT: { level: 1, xp: 0, pointsAvailable: 0 },
  };
}

/**
 * Extracts a clean 8-slot EquipmentLoadoutMap from either a client map or a server/Prisma relational object.
 * Returns null if the candidate does not contain any valid slot entries.
 */
function sanitizeEquipmentLoadout(candidate: unknown): EquipmentLoadoutMap | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, any>;
  let hasSlotKey = false;
  const mapped: EquipmentLoadoutMap = { ...EMPTY_EQUIPMENT_LOADOUT };

  for (const slot of EQUIPMENT_SLOT_KEYS) {
    if (slot in obj && obj[slot] !== undefined) {
      hasSlotKey = true;
      const val = obj[slot];
      if (typeof val === 'string' && val.trim().length > 0) {
        mapped[slot] = val;
      } else if (val && typeof val === 'object') {
        const slug = val.item?.slug ?? val.itemSlug ?? val.slug ?? val.baseSlug ?? null;
        mapped[slot] = typeof slug === 'string' && slug.trim().length > 0 ? slug : null;
      } else {
        mapped[slot] = null;
      }
    }
  }

  return hasSlotKey ? mapped : null;
}

/**
 * Maps server relational `inventoryItems` into client `InventoryEntry[]`.
 */
function mapServerInventoryItems(serverItems: unknown): InventoryEntry[] | null {
  if (!Array.isArray(serverItems)) return null;
  const entries: InventoryEntry[] = [];
  for (const raw of serverItems) {
    if (!raw || typeof raw !== 'object') continue;
    const itemObj = raw.item ?? raw;
    const slug = itemObj?.slug ?? raw.itemSlug ?? raw.slug;
    if (typeof slug !== 'string' || !slug) continue;
    const meta = (raw.itemMetadata && typeof raw.itemMetadata === 'object' ? raw.itemMetadata : {}) as Record<string, any>;
    const knownMeta = KNOWN_ITEM_METADATA[slug];
    entries.push({
      slug: meta.slug ?? slug,
      baseSlug: meta.baseSlug ?? slug,
      name: meta.name ?? itemObj?.name ?? knownMeta?.description ?? slug,
      description: itemObj?.description ?? knownMeta?.description,
      rarity: meta.rarity ?? itemObj?.rarity ?? 'COMMON',
      quantity: typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1,
      itemType: itemObj?.itemType ?? knownMeta?.itemType ?? 'MATERIAL',
      weaponHandedness: itemObj?.weaponHandedness ?? knownMeta?.weaponHandedness,
      requiredStrength: itemObj?.requiredStrength ?? knownMeta?.requiredStrength ?? 0,
      requiredEndurance: itemObj?.requiredEndurance ?? knownMeta?.requiredEndurance ?? 0,
      requiredAgility: itemObj?.requiredAgility ?? knownMeta?.requiredAgility ?? 0,
      statBonuses: meta.statBonuses ?? itemObj?.statBonuses ?? knownMeta?.statBonuses,
      tier: meta.tier,
      prefixId: meta.prefixId ?? null,
      prefixLabel: meta.prefixLabel ?? null,
      prefixSummary: meta.prefixSummary,
      suffixId: meta.suffixId ?? null,
      suffixLabel: meta.suffixLabel ?? null,
      suffixSummary: meta.suffixSummary,
      baseStatsSummary: meta.baseStatsSummary,
      primaryStatBonuses: meta.primaryStatBonuses,
      uniquePassive: meta.uniquePassive,
    });
  }
  return entries;
}

const GameContext = createContext<GameContextValue | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serverOnline, setServerOnline] = useState(false);
  const [authToken, setAuthTokenState] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const isAuthenticated = Boolean(authToken && currentUser);
  const remoteCharacterIdRef = useRef<string | null>(null);
  const [availableCharacters, setAvailableCharacters] = useState<PersistedCharacterProfile[]>([]);
  const availableCharactersRef = useRef<PersistedCharacterProfile[]>([]);
  availableCharactersRef.current = availableCharacters;

  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const activeCharacterIdRef = useRef<string | null>(null);
  activeCharacterIdRef.current = activeCharacterId;

  const [characterName, setCharacterName] = useState('Aric the Ironbound');
  const currentProfileRef = useRef<PersistedCharacterProfile | null>(null);
  const [gameMode, setGameMode] = useState<'STANDARD' | 'IRONMAN_VERIFIED'>('STANDARD');
  const [characterArtUri, setCharacterArtUri] = useState<string | null>(null);
  const [appearanceId, setAppearanceId] = useState<string>('oni_warlord');
  const [deletedCharacters, setDeletedCharacters] = useState<PersistedCharacterProfile[]>([]);
  const deletedCharactersRef = useRef<PersistedCharacterProfile[]>([]);
  deletedCharactersRef.current = deletedCharacters;
  const locallyPermanentlyErasedIdsRef = useRef<Set<string>>(new Set<string>());
  const [adventurerRank, setAdventurerRank] = useState<AdventurerRank>('COPPER');
  const [adventurerReputation, setAdventurerReputation] = useState(140);
  const [guildName] = useState('Iron Vanguard [IRON]');
  const [guildReputation, setGuildReputation] = useState(1450);
  const [gold, setGold] = useState(450);
  const [location, setLocation] = useState<GameLocation>('TAVERN');
  const [activityState, setActivityState] = useState<
    'IDLE' | 'RESTING_TAVERN' | 'GATHERING' | 'IN_DUNGEON'
  >('RESTING_TAVERN');

  const [stats, setStats] = useState({
    STRENGTH: { level: 5, xp: 80, pointsAvailable: 3 },
    ENDURANCE: { level: 4, xp: 60, pointsAvailable: 2 },
    AGILITY: { level: 4, xp: 45, pointsAvailable: 2 },
    DEXTERITY: { level: 3, xp: 30, pointsAvailable: 1 },
    CONSTITUTION: { level: 4, xp: 50, pointsAvailable: 2 },
    WISDOM: { level: 2, xp: 20, pointsAvailable: 1 },
    SPIRIT: { level: 2, xp: 15, pointsAvailable: 1 },
  });

  const [unlockedTalentRanks, setUnlockedTalentRanks] = useState<Record<string, number>>({
    jug_iron_skin: 2,
    war_deep_lungs: 1,
    ass_shadowstep_reflexes: 1,
  });

  const [fatigueState, setFatigueState] = useState<FatigueStateSnapshot>(() => ({
    isRestingInTavern: true,
    tavernEnteredAt: new Date(Date.now() - 12 * 3600 * 1000),
    lastStrenuousWorkoutAt: new Date(Date.now() - 36 * 3600 * 1000),
    lastWorkoutAt: new Date(Date.now() - 36 * 3600 * 1000),
    consecutiveHighIntensityDays: 0,
    lastHighIntensityDayKey: null,
    systemicFatigueStacks: 0,
    fatigueScore: 5,
    wellRestedMultiplier: 1.15,
    activeRecoveryBuffActive: false,
    activeRecoveryGrantedAt: null,
  }));

  // Bench Press & Zone 2 Run have prior baselines (ready to demonstrate PR Crit!);
  // Squat, Deadlift, OHP, Pull-Up have NO prior baseline (demonstrating First-Time PR Guard!)
  const [historicalPRs, setHistoricalPRs] = useState<Record<string, HistoricalExercisePR>>({
    bench_press: {
      exerciseId: 'bench_press',
      bestE1RM: 101.33, // 80kg x 8 prior baseline
      bestSingleSetVolume: 640,
      bestSessionVolume: 1920,
      maxRepsByWeight: { '80.0': 8 },
      bestCardioDurationSecByZone: {},
    },
    zone2_run: {
      exerciseId: 'zone2_run',
      bestE1RM: 0,
      bestSingleSetVolume: 0,
      bestSessionVolume: 0,
      maxRepsByWeight: {},
      bestCardioDurationSecByZone: { 2: 30 * 60 },
    },
  });

  const [remoteCharacterWorkoutsCount, setRemoteCharacterWorkoutsCount] = useState(0);
  const [consistencyStreak, setConsistencyStreak] = useState(0);
  const [resilienceShields, setResilienceShields] = useState(0);
  const [lastWorkoutResult, setLastWorkoutResult] = useState<WorkoutEvaluationResult | null>(null);
  const [workoutMachine, setWorkoutMachine] = useState<HybridWorkoutMachineState>(() =>
    createInitialHybridMachineState()
  );
  const [arrivalBanner, setArrivalBanner] = useState<ArrivalBoon | null>(null);
  const [restNotificationArmed, setRestNotificationArmed] = useState(false);
  const [notificationTapTick, setNotificationTapTick] = useState(0);
  const [lastHybridConsolidation, setLastHybridConsolidation] = useState<{
    rewardPayload: RewardPayload;
    injectedBuffs: DungeonWorkoutBuff[];
    raidEnergy: number;
  } | null>(null);

  // 8-Slot Explicit Equipment Loadout + Raw Bag Inventory (strictly character-scoped)
  const [equipmentLoadout, setEquipmentLoadout] = useState<EquipmentLoadoutMap>(() => ({
    ...EMPTY_EQUIPMENT_LOADOUT,
  }));

  const [rawInventory, setRawInventory] = useState<InventoryEntry[]>([]);

  const inventory = useMemo<InventoryEntry[]>(() => {
    const slotBySlug = new Map<string, EquipmentSlot>();
    for (const [slotKey, slugVal] of Object.entries(equipmentLoadout) as Array<
      [EquipmentSlot, string | null]
    >) {
      if (slugVal) {
        slotBySlug.set(slugVal, slotKey);
      }
    }
    return rawInventory.map((entry) => {
      const slot = slotBySlug.get(entry.slug) ?? null;
      return {
        ...entry,
        equipped: slot !== null,
        equippedSlot: slot,
      };
    });
  }, [rawInventory, equipmentLoadout]);

  const [activeGathering, setActiveGathering] = useState<ActiveGatheringState | null>(null);
  const [lastGatheringDrop, setLastGatheringDrop] = useState<LootDrop[] | null>(null);
  const [activeDungeonRun, setActiveDungeonRun] = useState<ActiveDungeonRunState | null>(null);

  const [raids, setRaids] = useState<RaidBossState[]>(() => {
    const endsAtMs = Date.now() + 5 * 24 * 3600 * 1000 + 14 * 3600 * 1000;
    return [
      {
        id: 'raid_public_wyrm',
        bossName: 'Ignisrax, World-Forge Wyrm',
        accessType: 'PUBLIC_WORLD',
        maxHp: 2_500_000,
        currentHp: 1_780_000,
        endsAtMs,
        dailyAttackUsedToday: false,
        participants: [
          {
            characterId: 'player_hero',
            name: 'Aric the Ironbound (You)',
            combatDamageDealt: 110_000,
            workoutEnergyDamage: 85_000,
            supportScore: 15_000,
          },
          {
            characterId: 'world_champ_1',
            name: 'Valkyrie Sera',
            combatDamageDealt: 210_000,
            workoutEnergyDamage: 140_000,
            supportScore: 25_000,
          },
          {
            characterId: 'world_champ_2',
            name: 'Darius Ironheart',
            combatDamageDealt: 115_000,
            workoutEnergyDamage: 65_000,
            supportScore: 30_000,
          },
        ],
        lastResolution: null,
      },
      {
        id: 'raid_guild_colossus',
        bossName: 'Vaelgor, Guild Dread-Colossus',
        accessType: 'GUILD_ONLY',
        guildName: 'Iron Vanguard [IRON]',
        maxHp: 600_000,
        currentHp: 245_000,
        endsAtMs,
        dailyAttackUsedToday: false,
        participants: [
          {
            characterId: 'player_hero',
            name: 'Aric the Ironbound (You)',
            combatDamageDealt: 120_000,
            workoutEnergyDamage: 95_000,
            supportScore: 18_000,
          },
          {
            characterId: 'ally_torin',
            name: 'Torin (Guild Vanguard)',
            combatDamageDealt: 95_000,
            workoutEnergyDamage: 45_000,
            supportScore: 10_000,
          },
        ],
        lastResolution: null,
      },
    ];
  });

  const [bounties, setBounties] = useState<GuildBountyItem[]>(() =>
    buildBountiesForCharacter('COPPER', [])
  );

  // ==========================================================================
  // OFFLINE WORKOUT PERSISTENCE, SILENT SYNC & DEFERRED RECEIPTS STATE
  // ==========================================================================

  const [offlineDraft, setOfflineDraft] = useState<OfflineWorkoutDraft>(() =>
    createDefaultOfflineDraft()
  );
  const [queuedOfflineWorkouts, setQueuedOfflineWorkouts] = useState<
    QueuedOfflineWorkoutPayload[]
  >([]);
  const [unsyncedServerPayloads, setUnsyncedServerPayloads] = useState<
    QueuedOfflineWorkoutPayload[]
  >([]);
  const [pendingWorkoutReceipts, setPendingWorkoutReceipts] = useState<WorkoutSpoilsReceipt[]>(
    []
  );
  const [customPresets, setCustomPresets] = useState<WorkoutPresetDefinition[]>([]);
  const [customExercises, setCustomExercises] = useState<SeedExerciseDefinition[]>([]);
  const [recentActivityIds, setRecentActivityIds] = useState<string[]>([]);
  const [exerciseGymPreferences, setExerciseGymPreferences] = useState<ExerciseGymPreferenceMap>({});
  const [defaultWeightUnit, setDefaultWeightUnitState] = useState<WeightUnit>('KG');
  const [warmupPresetCount, setWarmupPresetCountState] = useState<WarmupPresetCount>(2);
  const [workoutHistory, setWorkoutHistory] = useState<CompletedWorkoutRecord[]>(
    []
  );

  // Only workouts silently tagged with the active character's `characterId` count towards its progression
  const workoutsLoggedCount = useMemo(() => {
    if (!activeCharacterId) return 0;
    const localHistoryCount = countWorkoutsForCharacter(workoutHistory, activeCharacterId);
    return Math.max(localHistoryCount, remoteCharacterWorkoutsCount);
  }, [activeCharacterId, workoutHistory, remoteCharacterWorkoutsCount]);

  const [landingToastMessage, setLandingToastMessage] = useState<string | null>(null);
  const [offlineHydrated, setOfflineHydrated] = useState(false);

  // Live mutable refs so async sync loops always read & thread up-to-date state sequentially
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const fatigueStateRef = useRef(fatigueState);
  fatigueStateRef.current = fatigueState;
  const historicalPRsRef = useRef(historicalPRs);
  historicalPRsRef.current = historicalPRs;
  const consistencyStreakRef = useRef(consistencyStreak);
  consistencyStreakRef.current = consistencyStreak;
  const activeDungeonRunRef = useRef(activeDungeonRun);
  activeDungeonRunRef.current = activeDungeonRun;
  const raidsRef = useRef(raids);
  raidsRef.current = raids;

  const goldRef = useRef(gold);
  goldRef.current = gold;
  const rawInventoryRef = useRef(rawInventory);
  rawInventoryRef.current = rawInventory;
  const equipmentLoadoutRef = useRef(equipmentLoadout);
  equipmentLoadoutRef.current = equipmentLoadout;
  const unlockedTalentRanksRef = useRef(unlockedTalentRanks);
  unlockedTalentRanksRef.current = unlockedTalentRanks;
  const hasExplicitlyLoggedOutRef = useRef(false);

  const offlineDraftRef = useRef<OfflineWorkoutDraft>(offlineDraft);
  offlineDraftRef.current = offlineDraft;
  const queuedOfflineRef = useRef<QueuedOfflineWorkoutPayload[]>(queuedOfflineWorkouts);
  queuedOfflineRef.current = queuedOfflineWorkouts;
  const unsyncedServerRef = useRef<QueuedOfflineWorkoutPayload[]>(unsyncedServerPayloads);
  unsyncedServerRef.current = unsyncedServerPayloads;
  const pendingReceiptsRef = useRef<WorkoutSpoilsReceipt[]>(pendingWorkoutReceipts);
  pendingReceiptsRef.current = pendingWorkoutReceipts;
  const customPresetsRef = useRef<WorkoutPresetDefinition[]>(customPresets);
  customPresetsRef.current = customPresets;
  const customExercisesRef = useRef<SeedExerciseDefinition[]>(customExercises);
  customExercisesRef.current = customExercises;
  const recentActivityIdsRef = useRef<string[]>(recentActivityIds);
  recentActivityIdsRef.current = recentActivityIds;
  const exerciseGymPrefsRef = useRef<ExerciseGymPreferenceMap>(exerciseGymPreferences);
  exerciseGymPrefsRef.current = exerciseGymPreferences;
  const defaultWeightUnitRef = useRef<WeightUnit>(defaultWeightUnit);
  defaultWeightUnitRef.current = defaultWeightUnit;
  const warmupPresetCountRef = useRef<WarmupPresetCount>(warmupPresetCount);
  warmupPresetCountRef.current = warmupPresetCount;
  const workoutHistoryRef = useRef<CompletedWorkoutRecord[]>(workoutHistory);
  workoutHistoryRef.current = workoutHistory;
  const isSyncingOfflineRef = useRef(false);

  const persistBundleSnapshot = useCallback((partial: Partial<PersistedOfflineBundle>) => {
    const nextBundle: PersistedOfflineBundle = {
      offlineDraft:
        partial.offlineDraft !== undefined ? partial.offlineDraft : offlineDraftRef.current,
      queuedOfflineWorkouts:
        partial.queuedOfflineWorkouts ?? queuedOfflineRef.current,
      unsyncedServerPayloads:
        partial.unsyncedServerPayloads ?? unsyncedServerRef.current,
      pendingWorkoutReceipts:
        partial.pendingWorkoutReceipts ?? pendingReceiptsRef.current,
      customPresets:
        partial.customPresets ?? customPresetsRef.current,
      customExercises:
        partial.customExercises ?? customExercisesRef.current,
      recentActivityIds:
        partial.recentActivityIds ?? recentActivityIdsRef.current,
      exerciseGymPreferences:
        partial.exerciseGymPreferences ?? exerciseGymPrefsRef.current,
      defaultWeightUnit:
        partial.defaultWeightUnit ?? defaultWeightUnitRef.current,
      warmupPresetCount:
        partial.warmupPresetCount ?? warmupPresetCountRef.current,
      workoutHistory:
        partial.workoutHistory ?? workoutHistoryRef.current,
      characterProfile:
        partial.characterProfile !== undefined ? partial.characterProfile : currentProfileRef.current,
      availableCharacters:
        partial.availableCharacters ?? availableCharactersRef.current,
      deletedCharacters:
        partial.deletedCharacters ?? deletedCharactersRef.current,
      activeCharacterId:
        partial.activeCharacterId !== undefined ? partial.activeCharacterId : activeCharacterIdRef.current,
    };
    void savePersistedOfflineBundle(nextBundle);
  }, []);

  const saveExerciseStickyNote = useCallback(
    (params: {
      exerciseId: string;
      note: string;
      activeGymId?: string | null;
      activeGymName?: string | null;
      saveAsGlobal?: boolean;
    }) => {
      const next = upsertExerciseStickyNote(exerciseGymPrefsRef.current, params);
      exerciseGymPrefsRef.current = next;
      setExerciseGymPreferences(next);
      persistBundleSnapshot({ exerciseGymPreferences: next });
    },
    [persistBundleSnapshot]
  );

  const saveExerciseWeightUnit = useCallback(
    (params: {
      exerciseId: string;
      unit: WeightUnit;
      activeGymId?: string | null;
      activeGymName?: string | null;
    }) => {
      const next = upsertExerciseWeightUnit(exerciseGymPrefsRef.current, params);
      exerciseGymPrefsRef.current = next;
      setExerciseGymPreferences(next);
      persistBundleSnapshot({ exerciseGymPreferences: next });
    },
    [persistBundleSnapshot]
  );

  const saveExerciseBarWeightKg = useCallback(
    (exerciseId: string, barWeightKg: number) => {
      const next = upsertExerciseBarWeightKg(exerciseGymPrefsRef.current, exerciseId, barWeightKg);
      exerciseGymPrefsRef.current = next;
      setExerciseGymPreferences(next);
      persistBundleSnapshot({ exerciseGymPreferences: next });
    },
    [persistBundleSnapshot]
  );

  const setDefaultWeightUnit = useCallback(
    (unit: WeightUnit) => {
      defaultWeightUnitRef.current = unit;
      setDefaultWeightUnitState(unit);
      persistBundleSnapshot({ defaultWeightUnit: unit });
    },
    [persistBundleSnapshot]
  );

  const setWarmupPresetCount = useCallback(
    (count: WarmupPresetCount) => {
      warmupPresetCountRef.current = count;
      setWarmupPresetCountState(count);
      persistBundleSnapshot({ warmupPresetCount: count });
    },
    [persistBundleSnapshot]
  );

  const recordWorkoutHistory = useCallback((record: CompletedWorkoutRecord) => {
    const taggedRecord: CompletedWorkoutRecord = {
      ...record,
      characterId:
        record.characterId !== undefined
          ? record.characterId
          : (activeCharacterIdRef.current ??
              remoteCharacterIdRef.current ??
              currentProfileRef.current?.id ??
              null),
    };
    setWorkoutHistory((prev) => {
      const next = [taggedRecord, ...prev.filter((r) => r.id !== taggedRecord.id)];
      workoutHistoryRef.current = next;
      persistBundleSnapshot({ workoutHistory: next });
      return next;
    });
  }, [persistBundleSnapshot]);

  const pruneWorkoutHistory = useCallback(
    (filter: TrainingHistoryPruneFilter): TrainingHistoryPruneResult => {
      const result = pruneTrainingHistory(workoutHistoryRef.current, filter);
      const nextHistory = result.remainingWorkouts;
      workoutHistoryRef.current = nextHistory;
      setWorkoutHistory(nextHistory);

      const rebuiltPRs = rebuildHistoricalPRsFromWorkouts(nextHistory);
      historicalPRsRef.current = rebuiltPRs;
      setHistoricalPRs(rebuiltPRs);

      if (currentProfileRef.current) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          historicalPRs: rebuiltPRs,
          lastSyncedAtMs: Date.now(),
        };
        currentProfileRef.current = updatedProfile;
        const nextAvail = availableCharactersRef.current.map((c) =>
          c.id === updatedProfile.id ? { ...c, ...updatedProfile } : c
        );
        availableCharactersRef.current = nextAvail;
        setAvailableCharacters(nextAvail);
      }

      persistBundleSnapshot({
        workoutHistory: nextHistory,
        characterProfile: currentProfileRef.current,
        availableCharacters: availableCharactersRef.current,
      });

      return result;
    },
    [persistBundleSnapshot]
  );

  const clearWorkoutHistory = useCallback(() => {
    pruneWorkoutHistory({ timeWindow: 'ALL_TIME' });
  }, [pruneWorkoutHistory]);

  const restoreSampleWorkoutHistory = useCallback(() => {
    const sample = [...DEFAULT_SAMPLE_WORKOUT_HISTORY];
    workoutHistoryRef.current = sample;
    setWorkoutHistory(sample);
    const rebuiltPRs = rebuildHistoricalPRsFromWorkouts(sample);
    historicalPRsRef.current = rebuiltPRs;
    setHistoricalPRs(rebuiltPRs);
    persistBundleSnapshot({ workoutHistory: sample });
  }, [persistBundleSnapshot]);

  // Hydrate persisted offline draft, queued workouts, character profile and unclaimed spoils on boot
  useEffect(() => {
    let active = true;
    (async () => {
      const loaded = await loadPersistedOfflineBundle();
      if (!active) return;
      if (loaded.offlineDraft) {
        offlineDraftRef.current = loaded.offlineDraft;
        setOfflineDraft(loaded.offlineDraft);
      }
      if (loaded.queuedOfflineWorkouts.length > 0) {
        queuedOfflineRef.current = loaded.queuedOfflineWorkouts;
        setQueuedOfflineWorkouts(loaded.queuedOfflineWorkouts);
      }
      if (loaded.unsyncedServerPayloads.length > 0) {
        unsyncedServerRef.current = loaded.unsyncedServerPayloads;
        setUnsyncedServerPayloads(loaded.unsyncedServerPayloads);
      }
      if (loaded.pendingWorkoutReceipts.length > 0) {
        pendingReceiptsRef.current = loaded.pendingWorkoutReceipts;
        setPendingWorkoutReceipts(loaded.pendingWorkoutReceipts);
      }
      if (loaded.customPresets && loaded.customPresets.length > 0) {
        customPresetsRef.current = loaded.customPresets;
        setCustomPresets(loaded.customPresets);
      }
      if (loaded.customExercises && loaded.customExercises.length > 0) {
        customExercisesRef.current = loaded.customExercises;
        setCustomExercises(loaded.customExercises);
      }
      if (loaded.exerciseGymPreferences) {
        exerciseGymPrefsRef.current = loaded.exerciseGymPreferences;
        setExerciseGymPreferences(loaded.exerciseGymPreferences);
      }
      if (loaded.defaultWeightUnit) {
        defaultWeightUnitRef.current = loaded.defaultWeightUnit;
        setDefaultWeightUnitState(loaded.defaultWeightUnit);
      }
      if (loaded.warmupPresetCount) {
        warmupPresetCountRef.current = loaded.warmupPresetCount;
        setWarmupPresetCountState(loaded.warmupPresetCount);
      }
      if (loaded.recentActivityIds && loaded.recentActivityIds.length > 0) {
        recentActivityIdsRef.current = loaded.recentActivityIds;
        setRecentActivityIds(loaded.recentActivityIds);
      } else if (loaded.workoutHistory && loaded.workoutHistory.length > 0) {
        const derived: string[] = [];
        for (const record of loaded.workoutHistory) {
          for (const ex of record.exercises) {
            if (!derived.includes(ex.exerciseId)) {
              derived.push(ex.exerciseId);
            }
          }
        }
        recentActivityIdsRef.current = derived.slice(0, 15);
        setRecentActivityIds(derived.slice(0, 15));
      }
      if (loaded.availableCharacters && loaded.availableCharacters.length > 0) {
        availableCharactersRef.current = loaded.availableCharacters;
        setAvailableCharacters(loaded.availableCharacters);
      } else if (loaded.characterProfile) {
        availableCharactersRef.current = [loaded.characterProfile];
        setAvailableCharacters([loaded.characterProfile]);
      }
      if (loaded.deletedCharacters && loaded.deletedCharacters.length > 0) {
        const nowMs = Date.now();
        const thirtyDaysMs = 30 * 24 * 3600 * 1000;
        const validDeleted = loaded.deletedCharacters
          .filter((c) => c.deletedAt && nowMs - new Date(c.deletedAt).getTime() < thirtyDaysMs)
          .map((c) => {
            const delMs = new Date(c.deletedAt!).getTime();
            const daysRemaining = Math.max(0, Math.ceil((delMs + thirtyDaysMs - nowMs) / (24 * 3600 * 1000)));
            return { ...c, daysRemaining };
          });
        deletedCharactersRef.current = validDeleted;
        setDeletedCharacters(validDeleted);
      }
      if (loaded.activeCharacterId) {
        activeCharacterIdRef.current = loaded.activeCharacterId;
        setActiveCharacterId(loaded.activeCharacterId);
      } else if (
        !loaded.characterProfile &&
        (!loaded.availableCharacters || loaded.availableCharacters.length === 0) &&
        loaded.deletedCharacters &&
        loaded.deletedCharacters.length > 0
      ) {
        activeCharacterIdRef.current = null;
        setActiveCharacterId(null);
      }
      if (Array.isArray(loaded.workoutHistory)) {
        workoutHistoryRef.current = loaded.workoutHistory;
        setWorkoutHistory(loaded.workoutHistory);
      }
      if (loaded.characterProfile) {
        currentProfileRef.current = loaded.characterProfile;
        const cp = loaded.characterProfile;
        remoteCharacterIdRef.current = cp.id;
        activeCharacterIdRef.current = cp.id;
        setActiveCharacterId(cp.id);
        setCharacterName(cp.name);
        setGameMode(cp.gameMode);
        const apper = cp.appearanceId || cp.avatarSpriteId || 'oni_warlord';
        setAppearanceId(apper);
        const hydratedRank = (cp.adventurerRank || 'COPPER') as AdventurerRank;
        setAdventurerRank(hydratedRank);
        if (typeof cp.adventurerReputation === 'number') setAdventurerReputation(cp.adventurerReputation);
        if (typeof cp.gold === 'number') setGold(cp.gold);
        if (cp.stats) setStats((prev) => ({ ...prev, ...cp.stats }));
        const hydratedInv = Array.isArray(cp.inventory) ? cp.inventory : [];
        rawInventoryRef.current = hydratedInv;
        setRawInventory(hydratedInv);
        const hydratedTalents = cp.unlockedTalentRanks && typeof cp.unlockedTalentRanks === 'object' ? cp.unlockedTalentRanks : {};
        unlockedTalentRanksRef.current = hydratedTalents;
        setUnlockedTalentRanks(hydratedTalents);
        const hydratedLoadout = sanitizeEquipmentLoadout(cp.equipmentLoadout) ?? { ...EMPTY_EQUIPMENT_LOADOUT };
        const validInvSlugs = new Set(hydratedInv.map((i) => i.slug));
        for (const slot of EQUIPMENT_SLOT_KEYS) {
          if (hydratedLoadout[slot] && !validInvSlugs.has(hydratedLoadout[slot]!)) {
            hydratedLoadout[slot] = null;
          }
        }
        equipmentLoadoutRef.current = hydratedLoadout;
        setEquipmentLoadout(hydratedLoadout);
        setRemoteCharacterWorkoutsCount(cp.workoutsLoggedCount ?? 0);
        setBounties(buildBountiesForCharacter(hydratedRank, cp.completedBountySlugs ?? []));
        if (typeof cp.consistencyStreak === 'number') {
          consistencyStreakRef.current = cp.consistencyStreak;
          setConsistencyStreak(cp.consistencyStreak);
        }
        if (cp.historicalPRs && typeof cp.historicalPRs === 'object') {
          historicalPRsRef.current = cp.historicalPRs;
          setHistoricalPRs(cp.historicalPRs);
        }
      }
      setOfflineHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const presets = useMemo(() => getMergedPresets(customPresets), [customPresets]);

  const savePreset = useCallback(
    (preset: WorkoutPresetDefinition) => {
      setCustomPresets((prev) => {
        const existingIdx = prev.findIndex((p) => p.id === preset.id || p.slug === preset.slug);
        let next: WorkoutPresetDefinition[];
        if (existingIdx >= 0) {
          next = [...prev];
          next[existingIdx] = preset;
        } else {
          next = [...prev, preset];
        }
        customPresetsRef.current = next;
        persistBundleSnapshot({ customPresets: next });
        return next;
      });

      if (serverOnline) {
        apiFetch('/api/workout-presets', {
          method: 'POST',
          body: JSON.stringify(preset),
        }).catch(() => {});
      }
    },
    [persistBundleSnapshot, serverOnline]
  );

  const deletePreset = useCallback(
    (presetId: string) => {
      setCustomPresets((prev) => {
        const next = prev.filter((p) => p.id !== presetId);
        customPresetsRef.current = next;
        persistBundleSnapshot({ customPresets: next });
        return next;
      });

      if (serverOnline) {
        apiFetch(`/api/workout-presets/${presetId}`, {
          method: 'DELETE',
        }).catch(() => {});
      }
    },
    [persistBundleSnapshot, serverOnline]
  );

  const exercises = useMemo<ExerciseCatalogItem[]>(() => {
    const defaultMap = new Map<string, ExerciseCatalogItem>();
    for (const item of STARTER_EXERCISES) {
      defaultMap.set(item.id, item);
    }
    for (const cust of customExercises) {
      defaultMap.set(cust.slug, {
        id: cust.slug,
        name: cust.name,
        category: cust.category,
        workoutCategory: cust.workoutCategory,
        primaryStat: cust.primaryStat,
        baseXpFactor: cust.baseXpFactor,
        muscleGroup: cust.muscleGroup,
        equipmentType: cust.equipmentType,
        activityType: cust.activityType,
        isCompound: cust.isCompound,
        isCustom: true,
        description: cust.description,
      });
    }
    return Array.from(defaultMap.values());
  }, [customExercises]);

  const recordRecentActivity = useCallback(
    (activityId: string) => {
      if (!activityId) return;
      setRecentActivityIds((prev) => {
        const filtered = prev.filter((id) => id !== activityId);
        const next = [activityId, ...filtered].slice(0, 30);
        recentActivityIdsRef.current = next;
        persistBundleSnapshot({ recentActivityIds: next });
        return next;
      });
    },
    [persistBundleSnapshot]
  );

  const addCustomExercise = useCallback(
    (input: {
      name: string;
      workoutCategory: WorkoutCategory;
      category?: 'RESISTANCE' | 'CARDIO' | 'RECOVERY_MOBILITY';
      primaryStat?: StatType;
      muscleGroup?: string;
      equipmentType?: string;
      activityType?: string;
      isCompound?: boolean;
      description?: string;
    }): SeedExerciseDefinition => {
      const stamp = Date.now();
      const slug = `custom_${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')}_${stamp.toString(36).slice(-4)}`;

      const newDef: SeedExerciseDefinition = {
        slug,
        name: input.name.trim(),
        category:
          input.category ||
          (input.workoutCategory === 'GYM'
            ? 'RESISTANCE'
            : input.workoutCategory === 'RECOVERY'
            ? 'RECOVERY_MOBILITY'
            : 'CARDIO'),
        workoutCategory: input.workoutCategory,
        primaryStat:
          input.primaryStat ||
          (input.workoutCategory === 'GYM'
            ? 'STRENGTH'
            : input.workoutCategory === 'SPORT'
            ? 'AGILITY'
            : 'ENDURANCE'),
        muscleGroup: input.muscleGroup || (input.workoutCategory === 'GYM' ? 'FULL_BODY' : 'AEROBIC'),
        equipmentType: input.equipmentType || 'CUSTOM',
        activityType: input.activityType || input.workoutCategory.toLowerCase(),
        isCompound: input.isCompound ?? true,
        baseXpFactor: (input.isCompound ?? true) ? 1.15 : 1.02,
        description: input.description || `Custom user-defined ${input.workoutCategory} activity.`,
        isCustom: true,
      };

      setCustomExercises((prev) => {
        const next = [...prev, newDef];
        customExercisesRef.current = next;
        persistBundleSnapshot({ customExercises: next });
        return next;
      });

      recordRecentActivity(slug);
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
      return newDef;
    },
    [persistBundleSnapshot, recordRecentActivity]
  );

  const deleteCustomExercise = useCallback(
    (exerciseId: string) => {
      setCustomExercises((prev) => {
        const next = prev.filter((e) => e.slug !== exerciseId);
        customExercisesRef.current = next;
        persistBundleSnapshot({ customExercises: next });
        return next;
      });
      setRecentActivityIds((prev) => {
        const next = prev.filter((id) => id !== exerciseId);
        recentActivityIdsRef.current = next;
        persistBundleSnapshot({ recentActivityIds: next });
        return next;
      });
    },
    [persistBundleSnapshot]
  );

  // Auto-dismiss Landing Screen toast after 4.5 seconds
  useEffect(() => {
    if (!landingToastMessage) return;
    const t = setTimeout(() => {
      setLandingToastMessage(null);
    }, 4500);
    return () => clearTimeout(t);
  }, [landingToastMessage]);

  const dismissLandingToast = useCallback(() => {
    setLandingToastMessage(null);
  }, []);

  const extractNormalizedStats = (char: any, fullSheet?: any) => {
    const s = char?.stats || fullSheet?.character?.stats;
    return {
      STRENGTH: {
        level: s?.STRENGTH?.level ?? s?.strengthLevel ?? 1,
        xp: s?.STRENGTH?.xp ?? s?.strengthXp ?? 0,
        pointsAvailable: s?.STRENGTH?.pointsAvailable ?? s?.strengthTalentPointsAvailable ?? 0,
      },
      ENDURANCE: {
        level: s?.ENDURANCE?.level ?? s?.enduranceLevel ?? 1,
        xp: s?.ENDURANCE?.xp ?? s?.enduranceXp ?? 0,
        pointsAvailable: s?.ENDURANCE?.pointsAvailable ?? s?.enduranceTalentPointsAvailable ?? 0,
      },
      AGILITY: {
        level: s?.AGILITY?.level ?? s?.agilityLevel ?? 1,
        xp: s?.AGILITY?.xp ?? s?.agilityXp ?? 0,
        pointsAvailable: s?.AGILITY?.pointsAvailable ?? s?.agilityTalentPointsAvailable ?? 0,
      },
      DEXTERITY: {
        level: s?.DEXTERITY?.level ?? char?.dexLevel ?? fullSheet?.character?.dexLevel ?? 1,
        xp: s?.DEXTERITY?.xp ?? char?.dexXp ?? fullSheet?.character?.dexXp ?? 0,
        pointsAvailable: s?.DEXTERITY?.pointsAvailable ?? 0,
      },
      CONSTITUTION: {
        level: s?.CONSTITUTION?.level ?? char?.conLevel ?? fullSheet?.character?.conLevel ?? 1,
        xp: s?.CONSTITUTION?.xp ?? char?.conXp ?? fullSheet?.character?.conXp ?? 0,
        pointsAvailable: s?.CONSTITUTION?.pointsAvailable ?? 0,
      },
      WISDOM: {
        level: s?.WISDOM?.level ?? char?.wisLevel ?? fullSheet?.character?.wisLevel ?? 1,
        xp: s?.WISDOM?.xp ?? char?.wisXp ?? fullSheet?.character?.wisXp ?? 0,
        pointsAvailable: s?.WISDOM?.pointsAvailable ?? 0,
      },
      SPIRIT: {
        level: s?.SPIRIT?.level ?? char?.sprLevel ?? fullSheet?.character?.sprLevel ?? 1,
        xp: s?.SPIRIT?.xp ?? char?.sprXp ?? fullSheet?.character?.sprXp ?? 0,
        pointsAvailable: s?.SPIRIT?.pointsAvailable ?? 0,
      },
    };
  };

  const applyCharacterToState = useCallback(
    (char: any, fullSheet?: any) => {
      if (!char) return;
      const prevActiveId = activeCharacterIdRef.current;
      const isSwitchingCharacter = Boolean(prevActiveId && prevActiveId !== char.id);

      remoteCharacterIdRef.current = char.id;
      activeCharacterIdRef.current = char.id;
      setActiveCharacterId(char.id);
      setCharacterName(char.name || 'Hero');
      const mode = char.gameMode || 'STANDARD';
      setGameMode(mode);

      const resolvedRank = (char.adventurerRank || 'COPPER') as AdventurerRank;
      setAdventurerRank(resolvedRank);
      const resolvedRep =
        typeof char.adventurerReputation === 'number' ? char.adventurerReputation : 0;
      setAdventurerReputation(resolvedRep);

      if (typeof char.gold === 'number') {
        setGold(char.gold);
        goldRef.current = char.gold;
      }

      if (isSwitchingCharacter) {
        setActiveDungeonRun(null);
        activeDungeonRunRef.current = null;
        setActiveGathering(null);
        setLastWorkoutResult(null);
        setLastHybridConsolidation(null);
        setResilienceShields(0);
      }

      const nextStats = extractNormalizedStats(char, fullSheet);
      statsRef.current = nextStats;
      setStats(nextStats);

      if (fullSheet?.character?.fatigueState) {
        const f = fullSheet.character.fatigueState;
        setFatigueState({
          isRestingInTavern: Boolean(f.isRestingInTavern),
          tavernEnteredAt: f.tavernEnteredAt ? new Date(f.tavernEnteredAt) : null,
          lastStrenuousWorkoutAt: f.lastStrenuousWorkoutAt ? new Date(f.lastStrenuousWorkoutAt) : null,
          lastWorkoutAt: f.lastWorkoutAt ? new Date(f.lastWorkoutAt) : null,
          consecutiveHighIntensityDays: f.consecutiveHighIntensityDays ?? 0,
          lastHighIntensityDayKey: f.lastHighIntensityDayKey ?? null,
          systemicFatigueStacks: f.systemicFatigueStacks ?? 0,
          fatigueScore: f.fatigueScore ?? 0,
          wellRestedMultiplier: f.wellRestedMultiplier ?? 1.0,
          activeRecoveryBuffActive: Boolean(f.activeRecoveryBuffActive),
          activeRecoveryGrantedAt: f.activeRecoveryGrantedAt ? new Date(f.activeRecoveryGrantedAt) : null,
        });
      }

      const existingLocal =
        availableCharactersRef.current.find((loc) => loc.id === char.id) ||
        (currentProfileRef.current?.id === char.id ? currentProfileRef.current : null);

      // Resolve character-scoped workout count, bounty completions, streak, and PR baselines
      const serverWorkoutLogsCount =
        fullSheet?.character?._count?.workoutLogs ?? char._count?.workoutLogs;
      const persistedWorkoutsCount =
        typeof serverWorkoutLogsCount === 'number'
          ? serverWorkoutLogsCount
          : (char.workoutsLoggedCount ?? existingLocal?.workoutsLoggedCount ?? 0);
      const localCharHistoryCount = countWorkoutsForCharacter(workoutHistoryRef.current, char.id);
      const effectiveWorkoutsCount = Math.max(localCharHistoryCount, persistedWorkoutsCount);
      setRemoteCharacterWorkoutsCount(effectiveWorkoutsCount);

      const serverBountyCompletions =
        fullSheet?.character?.bountyCompletions ?? char.bountyCompletions;
      const completedBountySet = new Set<string>([
        ...(Array.isArray(char.completedBountySlugs) ? char.completedBountySlugs : []),
        ...(Array.isArray(existingLocal?.completedBountySlugs)
          ? existingLocal.completedBountySlugs
          : []),
      ]);
      if (Array.isArray(serverBountyCompletions)) {
        for (const bc of serverBountyCompletions) {
          const slug = bc?.bounty?.slug ?? bc?.bountySlug ?? bc?.bountyId;
          if (typeof slug === 'string' && slug) {
            completedBountySet.add(slug);
          }
        }
      }
      if (isAdventurerRankSufficient(resolvedRank, 'IRON')) {
        completedBountySet.add('trial_of_iron');
      }
      if (isAdventurerRankSufficient(resolvedRank, 'BRONZE')) {
        completedBountySet.add('trial_of_bronze');
      }
      const resolvedCompletedBounties = Array.from(completedBountySet);
      setBounties(buildBountiesForCharacter(resolvedRank, resolvedCompletedBounties));

      const resolvedStreak =
        fullSheet?.character?.fatigueState?.consistencyStreakSessions ??
        char.consistencyStreak ??
        existingLocal?.consistencyStreak ??
        localCharHistoryCount;
      consistencyStreakRef.current = resolvedStreak;
      setConsistencyStreak(resolvedStreak);

      const resolvedPRs: Record<string, HistoricalExercisePR> =
        char.historicalPRs ??
        existingLocal?.historicalPRs ??
        (isSwitchingCharacter ? {} : historicalPRsRef.current);
      historicalPRsRef.current = resolvedPRs;
      setHistoricalPRs(resolvedPRs);

      let resolvedUnlockedTalents: Record<string, number> = {};
      if (Array.isArray(fullSheet?.character?.talentUnlocks)) {
        for (const u of fullSheet.character.talentUnlocks) {
          const slug = u.talentNode?.slug ?? u.nodeSlug ?? u.talentNodeId;
          if (slug) {
            resolvedUnlockedTalents[slug] = u.currentRank ?? u.rank ?? 1;
          }
        }
      } else if (char.unlockedTalentRanks && typeof char.unlockedTalentRanks === 'object') {
        resolvedUnlockedTalents = char.unlockedTalentRanks;
      } else if (existingLocal?.unlockedTalentRanks && typeof existingLocal.unlockedTalentRanks === 'object') {
        resolvedUnlockedTalents = existingLocal.unlockedTalentRanks;
      }
      unlockedTalentRanksRef.current = resolvedUnlockedTalents;
      setUnlockedTalentRanks(resolvedUnlockedTalents);

      const serverLoadout = sanitizeEquipmentLoadout(fullSheet?.character?.equipmentLoadout);
      const incomingLoadout = sanitizeEquipmentLoadout(char.equipmentLoadout);
      const localLoadout = sanitizeEquipmentLoadout(existingLocal?.equipmentLoadout);

      let resolvedEquipmentLoadout: EquipmentLoadoutMap = { ...EMPTY_EQUIPMENT_LOADOUT };
      if (serverLoadout) {
        const hasNonNullServerSlot = Object.values(serverLoadout).some((v) => v !== null);
        if (!hasNonNullServerSlot && (incomingLoadout || localLoadout)) {
          resolvedEquipmentLoadout = incomingLoadout ?? localLoadout ?? { ...EMPTY_EQUIPMENT_LOADOUT };
        } else {
          resolvedEquipmentLoadout = serverLoadout;
        }
      } else if (incomingLoadout) {
        resolvedEquipmentLoadout = incomingLoadout;
      } else if (localLoadout) {
        resolvedEquipmentLoadout = localLoadout;
      }

      const serverMappedItems = mapServerInventoryItems(fullSheet?.character?.inventoryItems);
      let resolvedInventory: InventoryEntry[] = [];
      if (Array.isArray(char.inventory)) {
        resolvedInventory = char.inventory;
      } else if (Array.isArray(existingLocal?.inventory)) {
        resolvedInventory = existingLocal.inventory;
      } else if (serverMappedItems && serverMappedItems.length > 0) {
        resolvedInventory = serverMappedItems;
      }

      // If server also returned inventory items, merge any missing items into resolvedInventory
      if (serverMappedItems && serverMappedItems.length > 0 && resolvedInventory !== serverMappedItems) {
        const existingSlugs = new Set(resolvedInventory.map((i) => i.slug));
        for (const srvItem of serverMappedItems) {
          if (!existingSlugs.has(srvItem.slug)) {
            resolvedInventory = [...resolvedInventory, srvItem];
            existingSlugs.add(srvItem.slug);
          }
        }
      }

      // Ensure no phantom equipped item persists if the item is not in this character's inventory
      const inventorySlugSet = new Set(resolvedInventory.map((i) => i.slug));
      const validatedLoadout: EquipmentLoadoutMap = { ...resolvedEquipmentLoadout };
      for (const slot of EQUIPMENT_SLOT_KEYS) {
        const equippedSlug = validatedLoadout[slot];
        if (equippedSlug && !inventorySlugSet.has(equippedSlug)) {
          validatedLoadout[slot] = null;
        }
      }
      resolvedEquipmentLoadout = validatedLoadout;

      equipmentLoadoutRef.current = resolvedEquipmentLoadout;
      setEquipmentLoadout(resolvedEquipmentLoadout);
      rawInventoryRef.current = resolvedInventory;
      setRawInventory(resolvedInventory);

      const incomingAppearance = char.appearanceId || char.avatarSpriteId;
      const resolvedAppearance =
        incomingAppearance && incomingAppearance !== 'adventurer_default'
          ? incomingAppearance
          : existingLocal?.appearanceId && existingLocal.appearanceId !== 'adventurer_default'
          ? existingLocal.appearanceId
          : incomingAppearance || 'oni_warlord';
      setAppearanceId(resolvedAppearance);

      const charProfile: PersistedCharacterProfile = {
        id: char.id,
        name: char.name,
        gameMode: mode,
        appearanceId: resolvedAppearance,
        avatarSpriteId: resolvedAppearance,
        overallLevel: char.overallLevel ?? 1,
        adventurerRank: resolvedRank,
        adventurerReputation: resolvedRep,
        gold: char.gold ?? 100,
        stats: nextStats,
        inventory: resolvedInventory,
        unlockedTalentRanks: resolvedUnlockedTalents,
        equipmentLoadout: resolvedEquipmentLoadout,
        workoutsLoggedCount: effectiveWorkoutsCount,
        completedBountySlugs: resolvedCompletedBounties,
        consistencyStreak: resolvedStreak,
        historicalPRs: resolvedPRs,
        lastSyncedAtMs: Date.now(),
      };
      currentProfileRef.current = charProfile;

      const inAvailable = availableCharactersRef.current.some((c) => c.id === char.id);
      let nextAvailable = availableCharactersRef.current;
      if (inAvailable) {
        nextAvailable = availableCharactersRef.current.map((c) => (c.id === char.id ? { ...c, ...charProfile } : c));
        availableCharactersRef.current = nextAvailable;
        setAvailableCharacters(nextAvailable);
      }

      persistBundleSnapshot({
        characterProfile: charProfile,
        availableCharacters: nextAvailable,
        activeCharacterId: char.id,
      });
    },
    [persistBundleSnapshot]
  );

  const clearActiveCharacterState = useCallback(() => {
    setActiveCharacterId(null);
    activeCharacterIdRef.current = null;
    currentProfileRef.current = null;
    remoteCharacterIdRef.current = null;
    rawInventoryRef.current = [];
    setRawInventory([]);
    const emptyLoadout = { ...EMPTY_EQUIPMENT_LOADOUT };
    equipmentLoadoutRef.current = emptyLoadout;
    setEquipmentLoadout(emptyLoadout);
    unlockedTalentRanksRef.current = {};
    setUnlockedTalentRanks({});
    const freshStats = createLevelOneStats();
    statsRef.current = freshStats;
    setStats(freshStats);
    goldRef.current = 0;
    setGold(0);
    setRemoteCharacterWorkoutsCount(0);
    setAdventurerRank('COPPER');
    setAdventurerReputation(0);
    setBounties(buildBountiesForCharacter('COPPER', []));
    consistencyStreakRef.current = 0;
    setConsistencyStreak(0);
    historicalPRsRef.current = {};
    setHistoricalPRs({});
    setResilienceShields(0);
    setActiveDungeonRun(null);
    activeDungeonRunRef.current = null;
    setActiveGathering(null);
    setLastWorkoutResult(null);
    setLastHybridConsolidation(null);
  }, []);

  const syncRemoteCharacters = useCallback(
    (primaryChar: any, allChars?: any[], remoteDeleted?: any[]) => {
      if (!primaryChar && (!allChars || allChars.length === 0) && (!remoteDeleted || remoteDeleted.length === 0)) {
        setAvailableCharacters([]);
        availableCharactersRef.current = [];
        clearActiveCharacterState();
        return;
      }
      const rawList = allChars && allChars.length > 0 ? allChars : primaryChar ? [primaryChar] : [];
      // Filter out characters that are marked deleted, locally permanently erased, or locally soft-deleted
      const activeRawList = rawList.filter((c: any) => {
        if (c.deletedAt) return false;
        if (locallyPermanentlyErasedIdsRef.current.has(c.id)) return false;
        if (deletedCharactersRef.current.some((d) => d.id === c.id)) return false;
        return true;
      });

      const mappedProfiles: PersistedCharacterProfile[] = activeRawList.map((c: any) => {
        // If this character already exists locally with a customized appearance, preserve it
        const localChar =
          availableCharactersRef.current.find((loc) => loc.id === c.id) ||
          (currentProfileRef.current?.id === c.id ? currentProfileRef.current : null);
        const effectiveAppearance =
          localChar?.appearanceId && localChar.appearanceId !== 'adventurer_default'
            ? localChar.appearanceId
            : c.appearanceId || c.avatarSpriteId || 'oni_warlord';

        const serverWorkoutCount = c._count?.workoutLogs;
        const localWorkoutCount = countWorkoutsForCharacter(workoutHistoryRef.current, c.id);
        const resolvedWorkoutCount = Math.max(
          localWorkoutCount,
          typeof serverWorkoutCount === 'number'
            ? serverWorkoutCount
            : (localChar?.workoutsLoggedCount ?? c.workoutsLoggedCount ?? 0)
        );

        const completedBountySet = new Set<string>([
          ...(Array.isArray(localChar?.completedBountySlugs) ? localChar.completedBountySlugs : []),
          ...(Array.isArray(c.completedBountySlugs) ? c.completedBountySlugs : []),
        ]);
        if (Array.isArray(c.bountyCompletions)) {
          for (const bc of c.bountyCompletions) {
            const slug = bc?.bounty?.slug ?? bc?.bountySlug ?? bc?.bountyId;
            if (typeof slug === 'string' && slug) completedBountySet.add(slug);
          }
        }

        const resolvedCharInventory: InventoryEntry[] = Array.isArray(localChar?.inventory)
          ? localChar.inventory
          : Array.isArray(c.inventory)
          ? c.inventory
          : (mapServerInventoryItems(c.inventoryItems) ?? []);

        const resolvedCharLoadout: EquipmentLoadoutMap =
          sanitizeEquipmentLoadout(localChar?.equipmentLoadout) ??
          sanitizeEquipmentLoadout(c.equipmentLoadout) ?? { ...EMPTY_EQUIPMENT_LOADOUT };

        return {
          id: c.id,
          name: c.name,
          gameMode: c.gameMode,
          appearanceId: effectiveAppearance,
          avatarSpriteId: effectiveAppearance,
          deletedAt: null,
          overallLevel: c.overallLevel ?? 1,
          adventurerRank: c.adventurerRank || 'COPPER',
          adventurerReputation: c.adventurerReputation ?? 0,
          gold: c.gold ?? 100,
          stats: extractNormalizedStats(c),
          inventory: resolvedCharInventory,
          unlockedTalentRanks: localChar?.unlockedTalentRanks ?? c.unlockedTalentRanks ?? {},
          equipmentLoadout: resolvedCharLoadout,
          workoutsLoggedCount: resolvedWorkoutCount,
          completedBountySlugs: Array.from(completedBountySet),
          consistencyStreak: localChar?.consistencyStreak ?? c.consistencyStreak ?? resolvedWorkoutCount,
          historicalPRs: localChar?.historicalPRs ?? c.historicalPRs ?? {},
        };
      });

      const wasInitialUnbootstrappedHero =
        activeCharacterIdRef.current === DEFAULT_LOCAL_CHARACTER_ID &&
        availableCharactersRef.current.length === 0 &&
        deletedCharactersRef.current.length === 0 &&
        locallyPermanentlyErasedIdsRef.current.size === 0 &&
        (!Array.isArray(remoteDeleted) || remoteDeleted.length === 0);

      setAvailableCharacters(mappedProfiles);
      availableCharactersRef.current = mappedProfiles;

      // Merge remote deleted characters with any local soft-deleted characters
      let nextDeleted = [...deletedCharactersRef.current];
      if (Array.isArray(remoteDeleted)) {
        for (const c of remoteDeleted) {
          if (locallyPermanentlyErasedIdsRef.current.has(c.id)) continue;
          if (!nextDeleted.some((d) => d.id === c.id)) {
            nextDeleted.push({
              id: c.id,
              name: c.name,
              gameMode: c.gameMode,
              appearanceId: c.appearanceId || c.avatarSpriteId || 'oni_warlord',
              avatarSpriteId: c.appearanceId || c.avatarSpriteId || 'oni_warlord',
              deletedAt: c.deletedAt,
              daysRemaining: c.daysRemaining ?? 30,
              overallLevel: c.overallLevel ?? 1,
              adventurerRank: c.adventurerRank || 'COPPER',
              adventurerReputation: c.adventurerReputation ?? 0,
              gold: c.gold ?? 100,
              stats: extractNormalizedStats(c),
              inventory: Array.isArray(c.inventory)
                ? c.inventory
                : (mapServerInventoryItems(c.inventoryItems) ?? []),
              unlockedTalentRanks: c.unlockedTalentRanks ?? {},
              equipmentLoadout: sanitizeEquipmentLoadout(c.equipmentLoadout) ?? { ...EMPTY_EQUIPMENT_LOADOUT },
              workoutsLoggedCount: c._count?.workoutLogs ?? c.workoutsLoggedCount ?? 0,
              completedBountySlugs: Array.isArray(c.completedBountySlugs) ? c.completedBountySlugs : [],
              consistencyStreak: c.consistencyStreak ?? 0,
              historicalPRs: c.historicalPRs ?? {},
            });
          }
        }
      }
      setDeletedCharacters(nextDeleted);
      deletedCharactersRef.current = nextDeleted;

      const currentActiveId = activeCharacterIdRef.current;
      const targetChar =
        (currentActiveId && mappedProfiles.find((c) => c.id === currentActiveId)) ||
        (primaryChar && mappedProfiles.find((c) => c.id === primaryChar.id)) ||
        mappedProfiles[0];

      // If workouts were logged during the brief initial boot window before the first character ID resolved,
      // attach them to that initial character ID.
      let updatedHistory: CompletedWorkoutRecord[] | undefined = undefined;
      if (wasInitialUnbootstrappedHero && targetChar && targetChar.id !== DEFAULT_LOCAL_CHARACTER_ID) {
        const hasDefaultTagged = workoutHistoryRef.current.some(
          (w) => w.characterId === DEFAULT_LOCAL_CHARACTER_ID
        );
        if (hasDefaultTagged) {
          updatedHistory = workoutHistoryRef.current.map((w) =>
            w.characterId === DEFAULT_LOCAL_CHARACTER_ID ? { ...w, characterId: targetChar.id } : w
          );
          workoutHistoryRef.current = updatedHistory;
          setWorkoutHistory(updatedHistory);
        }
      }

      persistBundleSnapshot({
        availableCharacters: mappedProfiles,
        deletedCharacters: nextDeleted,
        activeCharacterId: targetChar ? targetChar.id : null,
        characterProfile: targetChar ?? null,
        ...(updatedHistory ? { workoutHistory: updatedHistory } : {}),
      });

      if (targetChar) {
        applyCharacterToState(targetChar);
        void fetchCharacterSheet(targetChar.id).then((res) => {
          if (res.ok && res.data) {
            applyCharacterToState(res.data.character, res.data);
          }
        });
      } else {
        clearActiveCharacterState();
      }
    },
    [applyCharacterToState, clearActiveCharacterState, persistBundleSnapshot]
  );

  const switchCharacter = useCallback(
    async (characterId: string): Promise<boolean> => {
      const target = availableCharactersRef.current.find((c) => c.id === characterId);
      if (!target) return false;
      applyCharacterToState(target);

      if (serverOnline) {
        void fetchCharacterSheet(characterId).then((res) => {
          if (res.ok && res.data) {
            applyCharacterToState(res.data.character, res.data);
          }
        });
      }
      return true;
    },
    [applyCharacterToState, serverOnline]
  );

  const createCharacter = useCallback(
    async (
      name: string,
      mode: 'STANDARD' | 'IRONMAN_VERIFIED',
      appearanceIdOrAvatar?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      // Enforce the 2-character limit: 1 Standard, 1 Ironman (active only)
      if (availableCharactersRef.current.length >= 2) {
        return {
          ok: false,
          error:
            'Account character limit reached. Each user is allowed a maximum of 2 characters: one Standard and one Ironman.',
        };
      }
      if (availableCharactersRef.current.some((c) => c.gameMode === mode)) {
        return {
          ok: false,
          error: `You already have a character in ${
            mode === 'STANDARD' ? 'Standard (Manual Honesty)' : 'Ironman Verified'
          } mode. Only one character is permitted per game mode.`,
        };
      }

      const chosenAppearance = appearanceIdOrAvatar || 'oni_warlord';

      if (serverOnline) {
        try {
          const res = await createCharacterAccount({
            name,
            gameMode: mode,
            appearanceId: chosenAppearance,
            avatarSpriteId: chosenAppearance,
          });
          if (res.ok && res.data?.character) {
            const newChar = {
              ...res.data.character,
              inventory: [],
              equipmentLoadout: { ...EMPTY_EQUIPMENT_LOADOUT },
              workoutsLoggedCount: 0,
              completedBountySlugs: [],
              consistencyStreak: 0,
              historicalPRs: {},
              unlockedTalentRanks: {},
            };
            activeCharacterIdRef.current = newChar.id;
            const nextList = [...availableCharactersRef.current, newChar];
            syncRemoteCharacters(newChar, nextList);
            return { ok: true };
          }
          console.warn(
            '[GameContext] Remote createCharacterAccount failed, falling back to local hero creation:',
            res.error
          );
        } catch (err: any) {
          console.warn(
            '[GameContext] Remote createCharacterAccount exception, falling back to local hero creation:',
            err.message
          );
        }
      }

      // Offline / local fallback hero creation
      const localChar: PersistedCharacterProfile = {
        id: `local_char_${Date.now()}`,
        name,
        gameMode: mode,
        appearanceId: chosenAppearance,
        avatarSpriteId: chosenAppearance,
        overallLevel: 1,
        adventurerRank: 'COPPER',
        adventurerReputation: 0,
        gold: 100,
        stats: createLevelOneStats(),
        inventory: [],
        equipmentLoadout: { ...EMPTY_EQUIPMENT_LOADOUT },
        unlockedTalentRanks: {},
        workoutsLoggedCount: 0,
        completedBountySlugs: [],
        consistencyStreak: 0,
        historicalPRs: {},
      };
      activeCharacterIdRef.current = localChar.id;
      const nextList = [...availableCharactersRef.current, localChar];
      syncRemoteCharacters(localChar, nextList);
      return { ok: true };
    },
    [serverOnline, syncRemoteCharacters]
  );

  const updateCharacterAppearance = useCallback(
    async (
      newAppearanceId: string,
      targetCharacterId?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      const targetId = targetCharacterId || activeCharacterIdRef.current;
      if (!targetId) {
        setAppearanceId(newAppearanceId);
        return { ok: true };
      }

      if (targetId === activeCharacterIdRef.current) {
        setAppearanceId(newAppearanceId);
      }

      const nextList = availableCharactersRef.current.map((c) =>
        c.id === targetId
          ? { ...c, appearanceId: newAppearanceId, avatarSpriteId: newAppearanceId }
          : c
      );
      setAvailableCharacters(nextList);
      availableCharactersRef.current = nextList;

      if (currentProfileRef.current && currentProfileRef.current.id === targetId) {
        currentProfileRef.current = {
          ...currentProfileRef.current,
          appearanceId: newAppearanceId,
          avatarSpriteId: newAppearanceId,
        };
      }

      persistBundleSnapshot({
        availableCharacters: nextList,
        characterProfile: currentProfileRef.current,
      });

      if (serverOnline && !targetId.startsWith('local_')) {
        try {
          const res = await updateCharacterAccount(targetId, { appearanceId: newAppearanceId });
          if (!res.ok) {
            if (res.statusCode === 409) {
              return { ok: false, error: res.error };
            }
            console.warn('[GameContext] Remote updateCharacterAccount non-fatal error:', res.error);
          }
        } catch (err: any) {
          console.warn('[GameContext] Remote updateCharacterAccount exception:', err.message);
        }
      }

      return { ok: true };
    },
    [persistBundleSnapshot, serverOnline]
  );

  const deleteCharacter = useCallback(
    async (
      targetCharacterId: string,
      permanent?: boolean
    ): Promise<{ ok: boolean; error?: string }> => {
      const target = availableCharactersRef.current.find((c) => c.id === targetCharacterId);
      const fallenTarget = deletedCharactersRef.current.find((c) => c.id === targetCharacterId);

      if (!target && !fallenTarget) {
        return { ok: false, error: 'Hero not found.' };
      }

      if (permanent) {
        locallyPermanentlyErasedIdsRef.current.add(targetCharacterId);
        const nextAvailable = availableCharactersRef.current.filter((c) => c.id !== targetCharacterId);
        const nextDeleted = deletedCharactersRef.current.filter((c) => c.id !== targetCharacterId);

        // Preserve all `workoutHistory` records for Training History, but purge unclaimed RPG queues/spoils
        // belonging to the permanently erased character so they cannot apply to a new character.
        const filteredQueue = queuedOfflineRef.current.filter(
          (q) => q.characterId !== targetCharacterId
        );
        const filteredUnsynced = unsyncedServerRef.current.filter(
          (q) => q.characterId !== targetCharacterId
        );
        const filteredReceipts = pendingReceiptsRef.current.filter(
          (r) => r.characterId !== targetCharacterId
        );
        queuedOfflineRef.current = filteredQueue;
        unsyncedServerRef.current = filteredUnsynced;
        pendingReceiptsRef.current = filteredReceipts;
        setQueuedOfflineWorkouts(filteredQueue);
        setUnsyncedServerPayloads(filteredUnsynced);
        setPendingWorkoutReceipts(filteredReceipts);

        setAvailableCharacters(nextAvailable);
        availableCharactersRef.current = nextAvailable;
        setDeletedCharacters(nextDeleted);
        deletedCharactersRef.current = nextDeleted;

        if (activeCharacterIdRef.current === targetCharacterId) {
          const nextActive = nextAvailable[0] ?? null;
          if (nextActive) {
            applyCharacterToState(nextActive);
          } else {
            clearActiveCharacterState();
          }
        }

        persistBundleSnapshot({
          availableCharacters: nextAvailable,
          deletedCharacters: nextDeleted,
          activeCharacterId: activeCharacterIdRef.current,
          characterProfile: currentProfileRef.current,
          queuedOfflineWorkouts: filteredQueue,
          unsyncedServerPayloads: filteredUnsynced,
          pendingWorkoutReceipts: filteredReceipts,
        });

        if (serverOnline && !targetCharacterId.startsWith('local_')) {
          try {
            const res = await deleteCharacterAccount(targetCharacterId, true);
            if (!res.ok) {
              if (res.statusCode === 409) {
                return { ok: false, error: res.error };
              }
              console.warn('[GameContext] Remote permanent delete non-fatal error:', res.error);
            }
          } catch (err: any) {
            console.warn('[GameContext] Remote permanent delete exception:', err.message);
          }
        }
        return { ok: true };
      }

      // Soft-delete
      if (!target) {
        return { ok: false, error: 'Active hero not found.' };
      }

      const nextAvailable = availableCharactersRef.current.filter((c) => c.id !== targetCharacterId);
      const latestSource =
        currentProfileRef.current?.id === targetCharacterId ? currentProfileRef.current : target;
      const fallenProfile: PersistedCharacterProfile = {
        ...target,
        ...latestSource,
        inventory: Array.isArray(latestSource.inventory) ? latestSource.inventory : (target.inventory ?? []),
        equipmentLoadout:
          sanitizeEquipmentLoadout(latestSource.equipmentLoadout) ??
          sanitizeEquipmentLoadout(target.equipmentLoadout) ?? { ...EMPTY_EQUIPMENT_LOADOUT },
        deletedAt: new Date().toISOString(),
        daysRemaining: 30,
      };
      const nextDeleted = [fallenProfile, ...deletedCharactersRef.current.filter((c) => c.id !== targetCharacterId)];

      setAvailableCharacters(nextAvailable);
      availableCharactersRef.current = nextAvailable;
      setDeletedCharacters(nextDeleted);
      deletedCharactersRef.current = nextDeleted;

      if (activeCharacterIdRef.current === targetCharacterId) {
        const nextActive = nextAvailable[0] ?? null;
        if (nextActive) {
          applyCharacterToState(nextActive);
        } else {
          clearActiveCharacterState();
        }
      }

      persistBundleSnapshot({
        availableCharacters: nextAvailable,
        deletedCharacters: nextDeleted,
        activeCharacterId: activeCharacterIdRef.current,
        characterProfile: currentProfileRef.current,
      });

      if (serverOnline && !targetCharacterId.startsWith('local_')) {
        try {
          const res = await deleteCharacterAccount(targetCharacterId, false);
          if (!res.ok) {
            if (res.statusCode === 409) {
              return { ok: false, error: res.error };
            }
            console.warn('[GameContext] Remote soft-delete non-fatal error:', res.error);
          }
        } catch (err: any) {
          console.warn('[GameContext] Remote soft-delete exception:', err.message);
        }
      }

      return { ok: true };
    },
    [applyCharacterToState, clearActiveCharacterState, persistBundleSnapshot, serverOnline]
  );

  const restoreCharacter = useCallback(
    async (targetCharacterId: string): Promise<{ ok: boolean; error?: string }> => {
      const target = deletedCharactersRef.current.find((c) => c.id === targetCharacterId);
      if (!target) {
        return { ok: false, error: 'Fallen hero not found in archive.' };
      }

      const conflict = availableCharactersRef.current.find((c) => c.gameMode === target.gameMode);
      if (conflict) {
        return {
          ok: false,
          error:
            'You already have an active hero in this mode slot. Please delete/archive your current active hero in that mode before restoring this fallen hero.',
        };
      }

      if (
        target.deletedAt &&
        Date.now() - new Date(target.deletedAt).getTime() > 30 * 24 * 3600 * 1000
      ) {
        return {
          ok: false,
          error: 'The 30-day restoration window for this hero has expired.',
        };
      }

      const nextDeleted = deletedCharactersRef.current.filter((c) => c.id !== targetCharacterId);
      const restoredProfile: PersistedCharacterProfile = {
        ...target,
        inventory: Array.isArray(target.inventory) ? target.inventory : [],
        equipmentLoadout: sanitizeEquipmentLoadout(target.equipmentLoadout) ?? { ...EMPTY_EQUIPMENT_LOADOUT },
        deletedAt: null,
        daysRemaining: undefined,
      };
      const nextAvailable = [...availableCharactersRef.current, restoredProfile];

      setDeletedCharacters(nextDeleted);
      deletedCharactersRef.current = nextDeleted;
      setAvailableCharacters(nextAvailable);
      availableCharactersRef.current = nextAvailable;

      if (!activeCharacterIdRef.current) {
        applyCharacterToState(restoredProfile);
      }

      persistBundleSnapshot({
        availableCharacters: nextAvailable,
        deletedCharacters: nextDeleted,
        activeCharacterId: activeCharacterIdRef.current,
        characterProfile: currentProfileRef.current,
      });

      if (serverOnline && !targetCharacterId.startsWith('local_')) {
        try {
          const res = await restoreCharacterAccount(targetCharacterId);
          if (!res.ok) {
            if (res.statusCode === 409) {
              return { ok: false, error: res.error || 'Server conflict restoring hero.' };
            }
            console.warn('[GameContext] Remote restoreCharacterAccount non-fatal error:', res.error);
          }
        } catch (err: any) {
          console.warn('[GameContext] Remote restoreCharacterAccount exception:', err.message);
        }
      }

      return { ok: true };
    },
    [applyCharacterToState, persistBundleSnapshot, serverOnline]
  );

  const refreshCharacterSheet = useCallback(async () => {
    const charId = remoteCharacterIdRef.current;
    if (!serverOnline || !charId) return;
    const res = await fetchCharacterSheet(charId);
    if (res.ok && res.data) {
      applyCharacterToState(res.data.character, res.data);
    }
  }, [applyCharacterToState, serverOnline]);

  const login = useCallback(
    async (credentials: LoginPayload) => {
      hasExplicitlyLoggedOutRef.current = false;
      const res = await loginAccount(credentials);
      if (res.ok && res.data) {
        setAuthTokenState(res.data.token);
        setCurrentUser(res.data.user);
        syncRemoteCharacters(res.data.character, res.data.characters, (res.data as any).deletedCharacters);
        setServerOnline(true);
        return { ok: true };
      }
      return { ok: false, error: res.error };
    },
    [syncRemoteCharacters]
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      hasExplicitlyLoggedOutRef.current = false;
      const res = await registerAccount(payload);
      if (res.ok && res.data) {
        setAuthTokenState(res.data.token);
        setCurrentUser(res.data.user);
        syncRemoteCharacters(res.data.character, res.data.characters, (res.data as any).deletedCharacters);
        setServerOnline(true);
        return { ok: true };
      }
      return { ok: false, error: res.error };
    },
    [syncRemoteCharacters]
  );

  const logout = useCallback(async () => {
    hasExplicitlyLoggedOutRef.current = true;
    await logoutAccount();
    setAuthTokenState(null);
    setCurrentUser(null);
    setAvailableCharacters([]);
    availableCharactersRef.current = [];
    setDeletedCharacters([]);
    deletedCharactersRef.current = [];
    clearActiveCharacterState();
    persistBundleSnapshot({
      characterProfile: null,
      availableCharacters: [],
      deletedCharacters: [],
      activeCharacterId: null,
    });
  }, [clearActiveCharacterState, persistBundleSnapshot]);

  const ensureRemoteCharacterBootstrapped = useCallback(async (): Promise<string | null> => {
    try {
      const healthRes = await fetchWithTimeout(`${API_BASE_URL}/health`, undefined, 6000);
      if (!healthRes.ok) {
        setServerOnline(false);
        return null;
      }
      setServerOnline(true);

      // 1. Check if device has an existing stored JWT session
      const storedToken = await getStoredAuthToken();
      if (storedToken) {
        const sessionRes = await fetchCurrentSession();
        if (sessionRes.ok && sessionRes.data) {
          setAuthTokenState(storedToken);
          setCurrentUser(sessionRes.data.user);
          syncRemoteCharacters(sessionRes.data.character, sessionRes.data.characters, (sessionRes.data as any).deletedCharacters);
          return sessionRes.data.character?.id ?? null;
        }
      }

      if (!storedToken && hasExplicitlyLoggedOutRef.current) {
        return null;
      }

      // 2. If no valid stored session, log in with default hero credentials
      const loginRes = await loginAccount({
        email: 'hero@gymify.rpg',
        password: 'password123',
      });

      if (loginRes.ok && loginRes.data) {
        setAuthTokenState(loginRes.data.token);
        setCurrentUser(loginRes.data.user);
        syncRemoteCharacters(loginRes.data.character, loginRes.data.characters, (loginRes.data as any).deletedCharacters);
        return loginRes.data.character?.id ?? null;
      }

      // 3. Fallback: If user not yet seeded/registered on backend, register new hero account
      const regRes = await registerAccount({
        email: 'hero@gymify.rpg',
        username: 'iron_adventurer',
        password: 'password123',
        characterName: 'Aric the Ironbound',
      });

      if (regRes.ok && regRes.data) {
        setAuthTokenState(regRes.data.token);
        setCurrentUser(regRes.data.user);
        syncRemoteCharacters(regRes.data.character, regRes.data.characters, (regRes.data as any).deletedCharacters);
        return regRes.data.character?.id ?? null;
      }

      return null;
    } catch {
      setServerOnline(false);
      return null;
    }
  }, [syncRemoteCharacters]);

  // Probe Backend Server Health & Bootstrap Demo Character on launch
  useEffect(() => {
    void ensureRemoteCharacterBootstrapped();
  }, [ensureRemoteCharacterBootstrapped]);

  // Live WebSocket Synchronization & Multi-User State Binding
  const [isLiveSyncConnected, setIsLiveSyncConnected] = useState(false);

  useEffect(() => {
    return gymifyWebSocket.onStatusChange((status) => {
      setIsLiveSyncConnected(status === 'connected');
    });
  }, []);

  useEffect(() => {
    void gymifyWebSocket.setAuthToken(authToken);
    if (serverOnline) {
      void gymifyWebSocket.connect();
    }
  }, [authToken, serverOnline]);

  useEffect(() => {
    // Listen for Real-Time Raid Boss HP drops and participant damage
    const unbindRaid = gymifyWebSocket.on('RAID_HP_UPDATE', (event: any) => {
      if (!event.raidId) return;
      setRaids((prevRaids) =>
        prevRaids.map((r) => {
          if (r.id !== event.raidId) return r;
          const currentHp = Math.max(0, event.currentHp);
          const isDefeated = event.isDefeated ?? currentHp <= 0;
          return {
            ...r,
            currentHp,
            maxHp: typeof event.maxHp === 'number' ? event.maxHp : r.maxHp,
            isDefeated,
            participants: event.attacker
              ? r.participants.map((p) => {
                  if (p.characterId === event.attacker.characterId) {
                    return {
                      ...p,
                      combatDamageDealt: p.combatDamageDealt + (event.attacker.damage ?? 0),
                      supportScore: p.supportScore + (event.attacker.supportScore ?? 0),
                    };
                  }
                  return p;
                })
              : r.participants,
          };
        })
      );
    });

    // Listen for Real-Time Party Member arrivals in Co-op Dungeons
    const unbindDungeonJoin = gymifyWebSocket.on('PARTY_MEMBER_JOINED', (event: any) => {
      if (!event.participant) return;
      // Real-time party update notification
    });

    return () => {
      unbindRaid();
      unbindDungeonJoin();
    };
  }, []);

  const fetchActiveRaids = useCallback(async () => {
    try {
      const res = await apiFetch('/api/raids');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.raids) && data.raids.length > 0) {
          setRaids(
            data.raids.map((r: any) => ({
              id: r.id,
              bossName: r.bossName,
              accessType: r.accessType,
              maxHp: Number(r.maxHp),
              currentHp: Number(r.currentHp),
              endsAtMs: new Date(r.endsAt).getTime(),
              dailyAttackUsedToday: false,
              participants: (r.contributions || []).map((c: any) => ({
                characterId: c.characterId,
                name: c.character?.name || 'Adventurer',
                combatDamageDealt: Number(c.combatDamageDealt || 0),
                workoutEnergyDamage: Number(c.workoutEnergyDamage || 0),
                supportScore: Number(c.supportScore || 0),
              })),
            }))
          );
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }, []);

  useEffect(() => {
    if (serverOnline) {
      void fetchActiveRaids();
    }
  }, [fetchActiveRaids, serverOnline]);

  const addDropsToInventory = useCallback(
    (drops: LootDrop[]) => {
      if (drops.length === 0) return;
      const prev = rawInventoryRef.current;
      const next = [...prev];
      for (const d of drops) {
        const meta = KNOWN_ITEM_METADATA[d.itemSlug];
        const isEquippable =
          BASE_EQUIPPABLE_ITEM_BY_SLUG[d.itemSlug] !== undefined ||
          (meta?.itemType && isEquippableItemType(meta.itemType));

        let rolledDrop: LootDrop = d;
        if (isEquippable && !d.tier && BASE_EQUIPPABLE_ITEM_BY_SLUG[d.itemSlug]) {
          const rolled = rollProceduralItemInstance({
            baseSlug: d.itemSlug,
            tier: 2,
            seed: `drop:${Date.now()}:${d.itemSlug}`,
          });
          rolledDrop = {
            ...proceduralItemToLootDrop(rolled),
            quantity: d.quantity,
          };
        }

        const idx = next.findIndex((i) => i.slug === d.itemSlug);
        if (idx >= 0 && !isEquippable) {
          next[idx] = { ...next[idx]!, quantity: next[idx]!.quantity + d.quantity };
        } else {
          next.push({
            slug: rolledDrop.itemSlug,
            baseSlug: rolledDrop.baseSlug ?? rolledDrop.itemSlug,
            name: rolledDrop.itemName,
            description: meta?.description,
            rarity: rolledDrop.rarity,
            quantity: rolledDrop.quantity,
            itemType: meta?.itemType ?? 'MATERIAL',
            weaponHandedness: meta?.weaponHandedness,
            requiredStrength: meta?.requiredStrength,
            requiredEndurance: meta?.requiredEndurance,
            requiredAgility: meta?.requiredAgility,
            statBonuses: rolledDrop.statBonuses ?? meta?.statBonuses,
            tier: rolledDrop.tier,
            prefixId: rolledDrop.prefixId,
            prefixLabel: rolledDrop.prefixLabel,
            prefixSummary: rolledDrop.prefixSummary,
            suffixId: rolledDrop.suffixId,
            suffixLabel: rolledDrop.suffixLabel,
            suffixSummary: rolledDrop.suffixSummary,
            baseStatsSummary: rolledDrop.baseStatsSummary,
            primaryStatBonuses: rolledDrop.primaryStatBonuses,
            uniquePassive: rolledDrop.uniquePassive,
          });
        }
      }
      rawInventoryRef.current = next;
      setRawInventory(next);

      if (currentProfileRef.current) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          inventory: next,
          lastSyncedAtMs: Date.now(),
        };
        currentProfileRef.current = updatedProfile;
        const nextAvail = availableCharactersRef.current.map((c) =>
          c.id === updatedProfile.id ? { ...c, ...updatedProfile } : c
        );
        availableCharactersRef.current = nextAvail;
        setAvailableCharacters(nextAvail);
        persistBundleSnapshot({
          characterProfile: updatedProfile,
          availableCharacters: nextAvail,
        });
      }
    },
    [persistBundleSnapshot]
  );

  const updateOfflineDraft = useCallback(
    (updater: (prev: OfflineWorkoutDraft) => OfflineWorkoutDraft) => {
      setOfflineDraft((prev) => {
        const next = updater(prev);
        offlineDraftRef.current = next;
        persistBundleSnapshot({ offlineDraft: next });
        return next;
      });
    },
    [persistBundleSnapshot]
  );

  const resetOfflineDraft = useCallback(() => {
    const fresh = createDefaultOfflineDraft();
    offlineDraftRef.current = fresh;
    setOfflineDraft(fresh);
    persistBundleSnapshot({ offlineDraft: null });
  }, [persistBundleSnapshot]);

  const loadPresetIntoDraft = useCallback(
    (preset: WorkoutPresetDefinition, mode: 'OFFLINE' | 'ONLINE' = 'OFFLINE') => {
      const nowMs = Date.now();
      const exerciseBlocks = preset.blocks?.exerciseBlocks || [];
      const activeGymId =
        offlineDraftRef.current.gymId ?? arrivalBanner?.gymId ?? 'open-world';
      const blocks: OfflineDraftExerciseBlock[] = exerciseBlocks.map((b, bIdx) => {
        const resolvedUnit = resolveExerciseWeightUnit(
          exerciseGymPrefsRef.current,
          b.exerciseSlug,
          activeGymId,
          defaultWeightUnitRef.current
        );
        return {
          blockId: `blk_${nowMs}_${bIdx + 1}`,
          exerciseId: b.exerciseSlug,
          exerciseName: b.exerciseName,
          supersetGroupId: b.supersetGroupId ?? null,
          weightUnit: resolvedUnit,
          sets: b.sets.map((s, sIdx) => ({
            id: `set_${nowMs}_${bIdx + 1}_${sIdx + 1}`,
            weightKgStr: formatCleanWeightNumber(
              convertKgToDisplayWeight(s.targetWeightKg || 0, resolvedUnit)
            ),
            repsStr: String(s.targetReps || 0),
            isWarmup: s.setType === 'WARMUP',
            setType: s.setType || 'NORMAL',
            rpe: s.targetRpe ?? 8.5,
            supersetGroupId: b.supersetGroupId ?? null,
            completed: false,
          })),
        };
      });

      if (mode === 'OFFLINE') {
        updateOfflineDraft((prev) => ({
          sessionId: `offline_${nowMs}`,
          startedAtMs: nowMs,
          gymId: prev.gymId ?? arrivalBanner?.gymId ?? null,
          gymName: prev.gymName ?? arrivalBanner?.gymName ?? null,
          category: preset.category,
          secondaryCategories: [],
          sourcePresetId: preset.id,
          sessionRpe: null,
          exerciseBlocks: blocks,
          cardioEntries: [],
          notes: preset.notes || '',
        }));
      }
    },
    [arrivalBanner, updateOfflineDraft]
  );

  /**
   * Synchronizes queued Offline Workouts silently against `POST /api/characters/:id/workouts`,
   * populating `pendingWorkoutReceipts` with zero intra-workout RPG popups.
   * When `evaluateLocallyIfOffline` is true (e.g. clicking "Enter World" while offline),
   * evaluates queued payloads deterministically via `@gymify/game-engine` so receipts are ready
   * immediately while retaining raw payloads for background DB replay when connectivity returns.
   */
  const syncOfflineWorkouts = useCallback(
    async (options?: { evaluateLocallyIfOffline?: boolean }) => {
      if (isSyncingOfflineRef.current) return;
      if (queuedOfflineRef.current.length === 0 && unsyncedServerRef.current.length === 0) {
        return;
      }

      isSyncingOfflineRef.current = true;
      try {
        const charId = await ensureRemoteCharacterBootstrapped();

        // 1. If server is online, flush any previously locally-evaluated server sync items first
        if (charId && unsyncedServerRef.current.length > 0) {
          const remainingUnsynced: QueuedOfflineWorkoutPayload[] = [];
          for (const item of unsyncedServerRef.current) {
            if (
              item.characterId &&
              (locallyPermanentlyErasedIdsRef.current.has(item.characterId) ||
                deletedCharactersRef.current.some((d) => d.id === item.characterId))
            ) {
              continue;
            }
            const targetSyncCharId =
              item.characterId && !item.characterId.startsWith('local_')
                ? item.characterId
                : charId;
            try {
              const dominantZone = item.cardioSegments[0]?.averageHrZone;
              const res = await fetchWithTimeout(
                `${API_BASE_URL}/api/characters/${targetSyncCharId}/workouts`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId: item.sessionId,
                    performedAt: item.performedAtIso,
                    workoutType: item.workoutType,
                    durationSeconds: item.durationSeconds,
                    averageHrZone: dominantZone,
                    arrivalTrigger: 'MANUAL_OPEN_WORLD',
                    chestOpened: false,
                    channeledRaidInstanceId:
                      item.channelToRaidId && !item.channelToRaidId.startsWith('raid_public_')
                        ? item.channelToRaidId
                        : undefined,
                    sets: item.sets.map((s) => ({
                      exerciseId: s.exerciseId,
                      reps: s.reps,
                      weightKg: s.weightKg,
                      rpe: s.rpe ?? undefined,
                      isWarmup: s.isWarmup,
                    })),
                    cardioSegments: item.cardioSegments,
                    osActivityClassification: item.osActivityClassification ?? undefined,
                    sleepStages: item.sleepStages ?? undefined,
                    stepCount: item.stepCount ?? undefined,
                    telemetrySamples: item.telemetrySamples ?? undefined,
                    verificationSource: item.verificationSource ?? undefined,
                    isHardwareVerified: item.isHardwareVerified ?? undefined,
                  }),
                },
                8000
              );
              if (!res.ok) {
                remainingUnsynced.push(item);
              }
            } catch {
              remainingUnsynced.push(item);
            }
          }

          unsyncedServerRef.current = remainingUnsynced;
          setUnsyncedServerPayloads(remainingUnsynced);

          if (remainingUnsynced.length === 0) {
            const markedReceipts = pendingReceiptsRef.current.map((r) => ({
              ...r,
              syncedWithServer: true,
            }));
            pendingReceiptsRef.current = markedReceipts;
            setPendingWorkoutReceipts(markedReceipts);
          }

          persistBundleSnapshot({
            unsyncedServerPayloads: remainingUnsynced,
            pendingWorkoutReceipts: pendingReceiptsRef.current,
          });
        }

        if (queuedOfflineRef.current.length === 0) {
          return;
        }

        // Thread sequential state across 1..N queued offline workouts chronologically
        const orderedQueue = [...queuedOfflineRef.current].sort(
          (a, b) => new Date(a.performedAtIso).getTime() - new Date(b.performedAtIso).getTime()
        );

        let runningStats = {
          STRENGTH: { ...statsRef.current.STRENGTH },
          ENDURANCE: { ...statsRef.current.ENDURANCE },
          AGILITY: { ...statsRef.current.AGILITY },
          DEXTERITY: { ...statsRef.current.DEXTERITY },
          CONSTITUTION: { ...statsRef.current.CONSTITUTION },
          WISDOM: { ...statsRef.current.WISDOM },
          SPIRIT: { ...statsRef.current.SPIRIT },
        };
        let runningFatigue = fatigueStateRef.current;
        let runningPRs = { ...historicalPRsRef.current };
        let runningStreak = consistencyStreakRef.current;
        let addedGold = 0;
        let addedWorkouts = 0;
        let addedShields = 0;
        const collectedDrops: LootDrop[] = [];
        const newReceipts: WorkoutSpoilsReceipt[] = [];
        const stillQueued: QueuedOfflineWorkoutPayload[] = [];
        const newlyDeferredForServer: QueuedOfflineWorkoutPayload[] = [];
        const localDungeonBuffAccum: DungeonWorkoutBuff[] = [];
        const localRaidDamageById = new Map<string, number>();

        let serverReachableNow = Boolean(charId);

        for (const queued of orderedQueue) {
          // Drop queued RPG payloads belonging to deleted characters (the workout log itself is already preserved in workoutHistory)
          if (
            queued.characterId &&
            (locallyPermanentlyErasedIdsRef.current.has(queued.characterId) ||
              deletedCharactersRef.current.some((d) => d.id === queued.characterId))
          ) {
            continue;
          }

          // If this workout was completed on a different character than the currently active one,
          // keep it queued for that character rather than applying its RPG progression to the current character
          const currentActiveId = activeCharacterIdRef.current;
          if (
            queued.characterId &&
            currentActiveId &&
            queued.characterId !== currentActiveId &&
            queued.characterId !== DEFAULT_LOCAL_CHARACTER_ID
          ) {
            stillQueued.push(queued);
            continue;
          }

          const performedAt = new Date(queued.performedAtIso);
          const dominantZone = queued.cardioSegments[0]?.averageHrZone;
          let handledByServer = false;

          if (serverReachableNow && charId) {
            try {
              const res = await fetchWithTimeout(
                `${API_BASE_URL}/api/characters/${charId}/workouts`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId: queued.sessionId,
                    performedAt: queued.performedAtIso,
                    workoutType: queued.workoutType,
                    durationSeconds: queued.durationSeconds,
                    averageHrZone: dominantZone,
                    arrivalTrigger: 'MANUAL_OPEN_WORLD',
                    chestOpened: false,
                    channeledRaidInstanceId:
                      queued.channelToRaidId && !queued.channelToRaidId.startsWith('raid_public_')
                        ? queued.channelToRaidId
                        : undefined,
                    sets: queued.sets.map((s) => ({
                      exerciseId: s.exerciseId,
                      reps: s.reps,
                      weightKg: s.weightKg,
                      rpe: s.rpe ?? undefined,
                      isWarmup: s.isWarmup,
                    })),
                    cardioSegments: queued.cardioSegments,
                    osActivityClassification: queued.osActivityClassification ?? undefined,
                    sleepStages: queued.sleepStages ?? undefined,
                    stepCount: queued.stepCount ?? undefined,
                    telemetrySamples: queued.telemetrySamples ?? undefined,
                    verificationSource: queued.verificationSource ?? undefined,
                    isHardwareVerified: queued.isHardwareVerified ?? undefined,
                  }),
                },
                8000
              );

              if (res.ok) {
                const body = (await res.json()) as {
                  rewardPayload: RewardPayload;
                  statProgressions: Record<StatType, StatLevelProgressionResult>;
                  injectedDungeonBuffs?: DungeonWorkoutBuff[];
                  raidEnergyDamageDealt?: number;
                };

                const rp = body.rewardPayload;
                const evalResult = rp.workoutEvaluation;

                // Update local fatigue & PRs to stay in lockstep with server
                const localFatigueStep = recordWorkoutInFatigueState(runningFatigue, {
                  performedAt,
                  workoutType: queued.workoutType,
                  averageHrZone: dominantZone,
                  hasResistanceSets: queued.sets.length > 0,
                });
                runningFatigue = localFatigueStep.nextState;
                runningPRs = { ...runningPRs, ...evalResult.updatedPRs };
                runningStreak += 1;
                addedWorkouts += 1;
                addedGold += rp.totalGoldAwarded;
                if (rp.resilienceBonus.triggered) {
                  addedShields += 1;
                }

                // Compute progressions relative to client's running character stats
                const strP = applyStatXpProgression(
                  runningStats.STRENGTH.level,
                  runningStats.STRENGTH.xp,
                  rp.finalXpByStat.STRENGTH
                );
                const endP = applyStatXpProgression(
                  runningStats.ENDURANCE.level,
                  runningStats.ENDURANCE.xp,
                  rp.finalXpByStat.ENDURANCE
                );
                const agiP = applyStatXpProgression(
                  runningStats.AGILITY.level,
                  runningStats.AGILITY.xp,
                  rp.finalXpByStat.AGILITY
                );

                runningStats = {
                  ...runningStats,
                  STRENGTH: {
                    level: strP.newLevel,
                    xp: strP.remainingXp,
                    pointsAvailable:
                      runningStats.STRENGTH.pointsAvailable + strP.talentPointsEarned,
                  },
                  ENDURANCE: {
                    level: endP.newLevel,
                    xp: endP.remainingXp,
                    pointsAvailable:
                      runningStats.ENDURANCE.pointsAvailable + endP.talentPointsEarned,
                  },
                  AGILITY: {
                    level: agiP.newLevel,
                    xp: agiP.remainingXp,
                    pointsAvailable:
                      runningStats.AGILITY.pointsAvailable + agiP.talentPointsEarned,
                  },
                };

                if (evalResult.criticalTrainingBonus.guaranteedLootDrop) {
                  collectedDrops.push(evalResult.criticalTrainingBonus.guaranteedLootDrop);
                }
                collectedDrops.push(...rp.lootChest.drops);

                let buffsForReceipt = body.injectedDungeonBuffs ?? [];
                if (
                  buffsForReceipt.length === 0 &&
                  activeDungeonRunRef.current?.status === 'ACTIVE_WINDOW'
                ) {
                  buffsForReceipt = createLiveDungeonWorkoutBuff({
                    workoutId: queued.sessionId,
                    characterId: 'player_hero',
                    workoutType: queued.workoutType,
                    averageHrZone: dominantZone,
                    triggeredPrCrit: evalResult.criticalTrainingBonus.triggered,
                  });
                }
                localDungeonBuffAccum.push(...buffsForReceipt);

                const localRaidDmg = calculateWorkoutRaidEnergyDamage({
                  strengthXp: rp.finalXpByStat.STRENGTH,
                  enduranceXp: rp.finalXpByStat.ENDURANCE,
                  agilityXp: rp.finalXpByStat.AGILITY,
                  triggeredPrCrit: evalResult.criticalTrainingBonus.triggered,
                });
                const effectiveRaidDmg =
                  (body.raidEnergyDamageDealt ?? 0) > 0
                    ? (body.raidEnergyDamageDealt ?? 0)
                    : queued.channelToRaidId
                      ? localRaidDmg
                      : 0;

                if (queued.channelToRaidId && effectiveRaidDmg > 0) {
                  localRaidDamageById.set(
                    queued.channelToRaidId,
                    (localRaidDamageById.get(queued.channelToRaidId) ?? 0) + effectiveRaidDmg
                  );
                }

                const customNameMap: Record<string, string> = { ...EXERCISE_NAME_BY_ID };
                for (const s of queued.sets) {
                  customNameMap[s.exerciseId] = s.exerciseName;
                }

                const patchedPayload: RewardPayload = {
                  ...rp,
                  characterProgression: {
                    ...rp.characterProgression,
                    byStat: {
                      STRENGTH: {
                        ...strP,
                        totalPointsAvailableAfterSession: runningStats.STRENGTH.pointsAvailable,
                      },
                      ENDURANCE: {
                        ...endP,
                        totalPointsAvailableAfterSession: runningStats.ENDURANCE.pointsAvailable,
                      },
                      AGILITY: {
                        ...agiP,
                        totalPointsAvailableAfterSession: runningStats.AGILITY.pointsAvailable,
                      },
                    },
                  },
                };

                newReceipts.push(
                  buildWorkoutSpoilsReceipt({
                    receiptId: `receipt_${queued.queueId}`,
                    characterId: queued.characterId ?? activeCharacterIdRef.current ?? charId,
                    performedAtIso: queued.performedAtIso,
                    workoutType: queued.workoutType,
                    rewardPayload: patchedPayload,
                    dungeonBuffs: buffsForReceipt,
                    raidDamage: effectiveRaidDmg,
                    raidBossName: queued.channelToRaidName ?? null,
                    exerciseNameById: customNameMap,
                    syncedWithServer: true,
                  })
                );

                handledByServer = true;
              } else {
                serverReachableNow = false;
              }
            } catch {
              serverReachableNow = false;
              setServerOnline(false);
            }
          }

          if (handledByServer) {
            continue;
          }

          // Server was offline/unreachable:
          if (!options?.evaluateLocallyIfOffline) {
            // Keep raw payload queued locally until connectivity returns or player clicks "Enter World"
            stillQueued.push(queued);
            continue;
          }

          // Player clicked "Enter World" while server is unreachable:
          // Evaluate deterministically via @gymify/game-engine so receipt chest opens seamlessly!
          const fatigueStep = recordWorkoutInFatigueState(runningFatigue, {
            performedAt,
            workoutType: queued.workoutType,
            averageHrZone: dominantZone,
            hasResistanceSets: queued.sets.length > 0,
          });
          const nextStreak = runningStreak + 1;

          const engineSetLogs: EngineSetLog[] = queued.sets.map((s, idx) => ({
            id: `off_set_${idx + 1}`,
            setNumber: idx + 1,
            exerciseId: s.exerciseId,
            exerciseName: s.exerciseName,
            reps: s.reps,
            weightKg: s.weightKg,
            rpe: s.rpe ?? null,
            isWarmup: s.isWarmup,
            calculatedE1RM: 0,
            relativeIntensity: 0,
            isLivePersonalRecordPace: false,
            prTypesOnPace: [],
            microXpTick: 0,
            microGoldTick: 0,
            bossHpDamage: 0,
            plannedRestSeconds: 90,
            loggedAtIso: queued.performedAtIso,
          }));

          const rp = consolidateHybridWorkoutSession({
            sessionId: queued.sessionId,
            workoutType: queued.workoutType,
            setLogs: engineSetLogs,
            cardioSegments: queued.cardioSegments,
            durationSeconds: queued.durationSeconds,
            arrivalBoonMultiplier: ARRIVAL_BOON_MULTIPLIER,
            fatigueAndRestMultiplier: fatigueStep.xpMultiplierForThisWorkout,
            lowEnergyMode: false,
            lastWorkoutAt: runningFatigue.lastWorkoutAt,
            performedAt,
            consistencyStreakSessions: nextStreak,
            historicalPRs: runningPRs,
            exerciseBaseXpById: EXERCISE_BASE_XP_BY_ID,
            currentCharacterStats: runningStats,
            rngSeed: `offline:${queued.sessionId}`,
          });

          const evalResult = rp.workoutEvaluation;
          runningFatigue = fatigueStep.nextState;
          runningPRs = evalResult.updatedPRs;
          runningStreak = nextStreak;
          addedWorkouts += 1;
          addedGold += rp.totalGoldAwarded;
          if (rp.resilienceBonus.triggered) {
            addedShields += 1;
          }

          runningStats = {
            ...runningStats,
            STRENGTH: {
              level: rp.characterProgression.byStat.STRENGTH.newLevel,
              xp: rp.characterProgression.byStat.STRENGTH.remainingXp,
              pointsAvailable:
                rp.characterProgression.byStat.STRENGTH.totalPointsAvailableAfterSession,
            },
            ENDURANCE: {
              level: rp.characterProgression.byStat.ENDURANCE.newLevel,
              xp: rp.characterProgression.byStat.ENDURANCE.remainingXp,
              pointsAvailable:
                rp.characterProgression.byStat.ENDURANCE.totalPointsAvailableAfterSession,
            },
            AGILITY: {
              level: rp.characterProgression.byStat.AGILITY.newLevel,
              xp: rp.characterProgression.byStat.AGILITY.remainingXp,
              pointsAvailable:
                rp.characterProgression.byStat.AGILITY.totalPointsAvailableAfterSession,
            },
          };

          if (evalResult.criticalTrainingBonus.guaranteedLootDrop) {
            collectedDrops.push(evalResult.criticalTrainingBonus.guaranteedLootDrop);
          }
          collectedDrops.push(...rp.lootChest.drops);

          let buffsForReceipt: DungeonWorkoutBuff[] = [];
          if (activeDungeonRunRef.current?.status === 'ACTIVE_WINDOW') {
            buffsForReceipt = createLiveDungeonWorkoutBuff({
              workoutId: queued.sessionId,
              characterId: 'player_hero',
              workoutType: queued.workoutType,
              averageHrZone: dominantZone,
              triggeredPrCrit: evalResult.criticalTrainingBonus.triggered,
            });
            localDungeonBuffAccum.push(...buffsForReceipt);
          }

          const raidDmg = queued.channelToRaidId
            ? calculateWorkoutRaidEnergyDamage({
                strengthXp: rp.finalXpByStat.STRENGTH,
                enduranceXp: rp.finalXpByStat.ENDURANCE,
                agilityXp: rp.finalXpByStat.AGILITY,
                triggeredPrCrit: evalResult.criticalTrainingBonus.triggered,
              })
            : 0;

          if (queued.channelToRaidId && raidDmg > 0) {
            localRaidDamageById.set(
              queued.channelToRaidId,
              (localRaidDamageById.get(queued.channelToRaidId) ?? 0) + raidDmg
            );
          }

          const customNameMap: Record<string, string> = { ...EXERCISE_NAME_BY_ID };
          for (const s of queued.sets) {
            customNameMap[s.exerciseId] = s.exerciseName;
          }

          newReceipts.push(
            buildWorkoutSpoilsReceipt({
              receiptId: `receipt_${queued.queueId}`,
              characterId: queued.characterId ?? activeCharacterIdRef.current ?? charId,
              performedAtIso: queued.performedAtIso,
              workoutType: queued.workoutType,
              rewardPayload: rp,
              dungeonBuffs: buffsForReceipt,
              raidDamage: raidDmg,
              raidBossName: queued.channelToRaidName ?? null,
              exerciseNameById: customNameMap,
              syncedWithServer: false,
            })
          );

          newlyDeferredForServer.push(queued);
        }

        // Commit state updates silently (zero RPG popups!)
        if (newReceipts.length > 0) {
          statsRef.current = runningStats;
          setStats(runningStats);
          fatigueStateRef.current = runningFatigue;
          setFatigueState(runningFatigue);
          historicalPRsRef.current = runningPRs;
          setHistoricalPRs(runningPRs);
          consistencyStreakRef.current = runningStreak;
          setConsistencyStreak(runningStreak);
          if (addedGold > 0) {
            goldRef.current += addedGold;
            setGold((g) => g + addedGold);
          }
          if (addedWorkouts > 0) {
            setRemoteCharacterWorkoutsCount((c) =>
              Math.max(
                countWorkoutsForCharacter(workoutHistoryRef.current, activeCharacterIdRef.current),
                c
              )
            );
          }
          if (addedShields > 0) setResilienceShields((s) => s + addedShields);
          if (collectedDrops.length > 0) addDropsToInventory(collectedDrops);

          if (currentProfileRef.current) {
            const charWorkoutCount = countWorkoutsForCharacter(
              workoutHistoryRef.current,
              currentProfileRef.current.id
            );
            const updatedProfile: PersistedCharacterProfile = {
              ...currentProfileRef.current,
              stats: runningStats,
              gold: goldRef.current,
              inventory: rawInventoryRef.current,
              workoutsLoggedCount: Math.max(
                charWorkoutCount,
                currentProfileRef.current.workoutsLoggedCount ?? 0
              ),
              consistencyStreak: runningStreak,
              historicalPRs: runningPRs,
              lastSyncedAtMs: Date.now(),
            };
            currentProfileRef.current = updatedProfile;
            const nextAvail = availableCharactersRef.current.map((c) =>
              c.id === updatedProfile.id ? { ...c, ...updatedProfile } : c
            );
            availableCharactersRef.current = nextAvail;
            setAvailableCharacters(nextAvail);
          }

          if (localDungeonBuffAccum.length > 0) {
            setActiveDungeonRun((prevRun) => {
              if (!prevRun || prevRun.status !== 'ACTIVE_WINDOW') return prevRun;
              return {
                ...prevRun,
                activeWorkoutBuffs: [...prevRun.activeWorkoutBuffs, ...localDungeonBuffAccum],
              };
            });
          }

          if (localRaidDamageById.size > 0) {
            setRaids((prevRaids) =>
              prevRaids.map((r) => {
                const dmg = localRaidDamageById.get(r.id) ?? 0;
                if (dmg <= 0) return r;
                return {
                  ...r,
                  currentHp: Math.max(0, r.currentHp - dmg),
                  participants: r.participants.map((p) =>
                    p.characterId === 'player_hero'
                      ? { ...p, workoutEnergyDamage: p.workoutEnergyDamage + dmg }
                      : p
                  ),
                };
              })
            );
          }
        }

        const updatedQueue = stillQueued;
        const updatedUnsynced = [...unsyncedServerRef.current, ...newlyDeferredForServer];
        const updatedReceipts = [...pendingReceiptsRef.current, ...newReceipts];

        queuedOfflineRef.current = updatedQueue;
        unsyncedServerRef.current = updatedUnsynced;
        pendingReceiptsRef.current = updatedReceipts;

        setQueuedOfflineWorkouts(updatedQueue);
        setUnsyncedServerPayloads(updatedUnsynced);
        setPendingWorkoutReceipts(updatedReceipts);

        persistBundleSnapshot({
          queuedOfflineWorkouts: updatedQueue,
          unsyncedServerPayloads: updatedUnsynced,
          pendingWorkoutReceipts: updatedReceipts,
          characterProfile: currentProfileRef.current,
          availableCharacters: availableCharactersRef.current,
        });
      } finally {
        isSyncingOfflineRef.current = false;
      }
    },
    [addDropsToInventory, ensureRemoteCharacterBootstrapped, persistBundleSnapshot]
  );

  // Trigger silent background sync after hydration & whenever connectivity / foreground resumes
  useEffect(() => {
    if (!offlineHydrated) return;
    if (queuedOfflineWorkouts.length > 0 || unsyncedServerPayloads.length > 0) {
      void syncOfflineWorkouts({ evaluateLocallyIfOffline: false });
    }
    void diagnosticLogger.flushBugReportOutbox();
  }, [offlineHydrated, queuedOfflineWorkouts.length, unsyncedServerPayloads.length, syncOfflineWorkouts]);

  useEffect(() => {
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void ensureRemoteCharacterBootstrapped();
        void syncOfflineWorkouts({ evaluateLocallyIfOffline: false });
        void diagnosticLogger.flushBugReportOutbox();
      }
    });

    let removeWebOnline: (() => void) | null = null;
    if (Platform.OS === 'web') {
      const win = globalThis as unknown as {
        addEventListener?: (type: string, fn: () => void) => void;
        removeEventListener?: (type: string, fn: () => void) => void;
      };
      const onOnline = () => {
        void ensureRemoteCharacterBootstrapped();
        void syncOfflineWorkouts({ evaluateLocallyIfOffline: false });
        void diagnosticLogger.flushBugReportOutbox();
      };
      win.addEventListener?.('online', onOnline);
      removeWebOnline = () => win.removeEventListener?.('online', onOnline);
    }

    return () => {
      appSub.remove();
      removeWebOnline?.();
    };
  }, [ensureRemoteCharacterBootstrapped, syncOfflineWorkouts]);

  // Periodic background heartbeat (25s) — recovers serverOnline status, drains diagnostic outbox & syncs workouts
  useEffect(() => {
    const timer = setInterval(() => {
      if (!serverOnline) {
        void ensureRemoteCharacterBootstrapped();
      }
      void diagnosticLogger.flushBugReportOutbox();
      if (queuedOfflineWorkouts.length > 0 || unsyncedServerPayloads.length > 0) {
        void syncOfflineWorkouts({ evaluateLocallyIfOffline: false });
      }
    }, 25_000);
    return () => clearInterval(timer);
  }, [serverOnline, ensureRemoteCharacterBootstrapped, queuedOfflineWorkouts.length, unsyncedServerPayloads.length, syncOfflineWorkouts]);

  const completeOfflineWorkout = useCallback(() => {
    const draft = offlineDraftRef.current;
    const completedSets: QueuedOfflineWorkoutPayload['sets'] = [];

    for (const block of draft.exerciseBlocks) {
      const exMeta = STARTER_EXERCISES.find((e) => e.id === block.exerciseId);
      const exName = exMeta?.name ?? block.exerciseId;
      const blockUnit = block.weightUnit ?? 'KG';
      for (const row of block.sets) {
        if (!row.completed) continue;
        const reps = Math.floor(Number(row.repsStr) || 0);
        const weightKg = convertDisplayWeightToKg(
          Math.max(0, Number(row.weightKgStr) || 0),
          blockUnit
        );
        if (reps > 0) {
          completedSets.push({
            exerciseId: block.exerciseId,
            exerciseName: exName,
            reps,
            weightKg,
            rpe: row.rpe ?? null,
            isWarmup: row.isWarmup || row.setType === 'WARMUP',
            setType: row.setType ?? (row.isWarmup ? 'WARMUP' : 'NORMAL'),
            supersetGroupId: row.supersetGroupId ?? block.supersetGroupId ?? null,
          });
        }
      }
    }

    const validCardio = draft.cardioEntries.filter((c) => c.durationSeconds > 0);

    if (completedSets.length === 0 && validCardio.length === 0) {
      return {
        ok: false,
        error: 'Tap ✓ on at least one completed set or add a cardio entry before finishing.',
      };
    }

    const nowMs = Date.now();
    const cardioSec = validCardio.reduce((acc, c) => acc + c.durationSeconds, 0);
    const elapsedSec = Math.max(60, Math.round((nowMs - draft.startedAtMs) / 1000), cardioSec);

    const workoutType = inferOfflineWorkoutType({
      sets: completedSets,
      cardioSegments: validCardio,
      exerciseCategoryById: EXERCISE_CATEGORY_BY_ID,
    });

    const defaultRaid = raidsRef.current[0] ?? null;
    const ownerCharacterId =
      activeCharacterIdRef.current ??
      remoteCharacterIdRef.current ??
      currentProfileRef.current?.id ??
      DEFAULT_LOCAL_CHARACTER_ID;

    const payload: QueuedOfflineWorkoutPayload = {
      queueId: `q_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId: draft.sessionId || `offline_${nowMs}`,
      characterId: ownerCharacterId,
      performedAtIso: new Date(nowMs).toISOString(),
      durationSeconds: elapsedSec,
      workoutType,
      workoutCategory: draft.category ?? 'GYM',
      sourcePresetId: draft.sourcePresetId ?? null,
      sessionRpe: draft.sessionRpe ?? null,
      sets: completedSets.map((s) => ({ ...s })),
      cardioSegments: validCardio.map((c) => ({
        exerciseId: c.exerciseId,
        exerciseName: c.exerciseName,
        activityType: c.activityType,
        durationSeconds: c.durationSeconds,
        averageHrZone: c.averageHrZone,
        rpe: c.rpe ?? null,
      })),
      channelToRaidId: defaultRaid?.id ?? null,
      channelToRaidName: defaultRaid?.bossName ?? null,
    };

    const nextQueue = [...queuedOfflineRef.current, payload];
    const freshDraft = createDefaultOfflineDraft(nowMs + 1);

    // Build historical record for Training History Matrix
    const historyExercises: CompletedExerciseEntry[] = [];
    for (const block of draft.exerciseBlocks) {
      const exMeta = STARTER_EXERCISES.find((e) => e.id === block.exerciseId);
      const blockUnit = block.weightUnit ?? 'KG';
      const completedRows = block.sets.filter((s) => s.completed && (Number(s.repsStr) || 0) > 0);
      if (completedRows.length > 0) {
        historyExercises.push({
          exerciseId: block.exerciseId,
          exerciseName: exMeta?.name ?? block.exerciseName ?? block.exerciseId,
          sets: completedRows.map((s, idx) => ({
            setNumber: idx + 1,
            weightKg: convertDisplayWeightToKg(
              Math.max(0, Number(s.weightKgStr) || 0),
              blockUnit
            ),
            reps: Math.floor(Number(s.repsStr) || 0),
            rpe: s.rpe ?? null,
            setType: s.setType,
            isWarmup: s.isWarmup,
          })),
        });
      }
    }

    const resolvedOfflineGymId =
      normalizeGymId(draft.gymId ?? arrivalBanner?.gymId) ?? 'open-world';
    const resolvedOfflineGymName =
      draft.gymName ?? arrivalBanner?.gymName ?? 'Open World';

    const offlineRecord: CompletedWorkoutRecord = {
      id: `offline_hist_${nowMs}`,
      characterId: ownerCharacterId,
      gymId: resolvedOfflineGymId,
      gymName: resolvedOfflineGymName,
      source: 'OFFLINE',
      performedAtIso: new Date(nowMs).toISOString(),
      durationSeconds: elapsedSec,
      workoutCategory: draft.category ?? 'GYM',
      workoutType,
      presetName: draft.sourcePresetId
        ? customPresetsRef.current.find((p) => p.id === draft.sourcePresetId)?.name ??
          STARTER_WORKOUT_PRESETS.find((p) => p.id === draft.sourcePresetId)?.name ??
          'Routine Preset'
        : undefined,
      exercises: historyExercises,
    };

    const nextHistory = [offlineRecord, ...workoutHistoryRef.current];
    workoutHistoryRef.current = nextHistory;
    setWorkoutHistory(nextHistory);

    const nextCharWorkoutsCount = countWorkoutsForCharacter(nextHistory, ownerCharacterId);
    setRemoteCharacterWorkoutsCount((prev) => Math.max(prev, nextCharWorkoutsCount));
    if (currentProfileRef.current && currentProfileRef.current.id === ownerCharacterId) {
      const updatedProfile: PersistedCharacterProfile = {
        ...currentProfileRef.current,
        workoutsLoggedCount: Math.max(
          nextCharWorkoutsCount,
          currentProfileRef.current.workoutsLoggedCount ?? 0
        ),
        lastSyncedAtMs: Date.now(),
      };
      currentProfileRef.current = updatedProfile;
      const nextAvail = availableCharactersRef.current.map((c) =>
        c.id === updatedProfile.id ? { ...c, ...updatedProfile } : c
      );
      availableCharactersRef.current = nextAvail;
      setAvailableCharacters(nextAvail);
    }

    queuedOfflineRef.current = nextQueue;
    offlineDraftRef.current = freshDraft;

    setQueuedOfflineWorkouts(nextQueue);
    setOfflineDraft(freshDraft);
    setLandingToastMessage('Workout saved. Spoils waiting in the world.');

    // Collect completed activity IDs and bump to recent activities
    const touchedActivityIds: string[] = [];
    for (const b of draft.exerciseBlocks) {
      if (!touchedActivityIds.includes(b.exerciseId)) {
        touchedActivityIds.push(b.exerciseId);
      }
    }
    for (const c of draft.cardioEntries) {
      if (!touchedActivityIds.includes(c.exerciseId)) {
        touchedActivityIds.push(c.exerciseId);
      }
    }

    let nextRecentIds = recentActivityIdsRef.current;
    if (touchedActivityIds.length > 0) {
      const remaining = recentActivityIdsRef.current.filter((id) => !touchedActivityIds.includes(id));
      nextRecentIds = [...touchedActivityIds, ...remaining].slice(0, 30);
      recentActivityIdsRef.current = nextRecentIds;
      setRecentActivityIds(nextRecentIds);
    }

    persistBundleSnapshot({
      offlineDraft: null,
      queuedOfflineWorkouts: nextQueue,
      workoutHistory: nextHistory,
      recentActivityIds: nextRecentIds,
      characterProfile: currentProfileRef.current,
      availableCharacters: availableCharactersRef.current,
    });

    // Silently attempt server sync in the background (with zero RPG popups)
    void syncOfflineWorkouts({ evaluateLocallyIfOffline: false });

    return { ok: true };
  }, [arrivalBanner, persistBundleSnapshot, syncOfflineWorkouts]);

  const activeCharacterPendingReceipts = useMemo(
    () =>
      pendingWorkoutReceipts.filter(
        (r) => !r.characterId || r.characterId === activeCharacterId
      ),
    [pendingWorkoutReceipts, activeCharacterId]
  );

  const activeCharacterQueuedWorkouts = useMemo(
    () =>
      queuedOfflineWorkouts.filter(
        (q) => !q.characterId || q.characterId === activeCharacterId
      ),
    [queuedOfflineWorkouts, activeCharacterId]
  );

  const claimPendingSpoils = useCallback(() => {
    const currentId = activeCharacterIdRef.current;
    const remaining = pendingReceiptsRef.current.filter(
      (r) => Boolean(r.characterId && currentId && r.characterId !== currentId)
    );
    pendingReceiptsRef.current = remaining;
    setPendingWorkoutReceipts(remaining);
    persistBundleSnapshot({ pendingWorkoutReceipts: remaining });
    triggerSensoryCue('CHEST_OPEN_REVEAL');
  }, [persistBundleSnapshot]);

  const consolidatedSpoils = useMemo(
    () => consolidateSpoilsReceipts(activeCharacterPendingReceipts),
    [activeCharacterPendingReceipts]
  );

  const unclaimedSpoilsCount =
    activeCharacterPendingReceipts.length + activeCharacterQueuedWorkouts.length;

  const projectedFatigue = useMemo(
    () => evaluateFatigueStateAtTime(fatigueState, new Date()),
    [fatigueState]
  );

  const nextWorkoutMultiplier = useMemo(
    () => getAvailableStrenuousXpMultiplier(projectedFatigue),
    [projectedFatigue]
  );

  const combatPenalties = useMemo(
    () => getSystemicFatigueCombatPenalties(projectedFatigue.systemicFatigueStacks),
    [projectedFatigue]
  );

  const aggregatedTalents = useMemo(
    () => aggregateTalentModifiers(unlockedTalentRanks, DEFAULT_TALENT_TREES),
    [unlockedTalentRanks]
  );

  const aggregatedEquipment = useMemo(() => {
    const equippedEntries = inventory.filter((item) => item.equipped);
    return aggregateEquippedItemModifiers(equippedEntries);
  }, [inventory]);

  const equipmentBonuses = aggregatedEquipment.equipmentBonuses;

  const overallLevel = useMemo(
    () =>
      calculateOverallCharacterLevel({
        strengthLevel: stats.STRENGTH.level,
        enduranceLevel: stats.ENDURANCE.level,
        agilityLevel: stats.AGILITY.level,
        dexLevel: stats.DEXTERITY.level,
        conLevel: stats.CONSTITUTION.level,
        wisLevel: stats.WISDOM.level,
        sprLevel: stats.SPIRIT.level,
      }),
    [stats]
  );

  // Register dynamic state snapshot provider for diagnostic logger and crash reporting
  useEffect(() => {
    diagnosticLogger.setStateProvider(() => ({
      characterName,
      overallLevel,
      adventurerRank,
      gold,
      location,
      workoutPhase: workoutMachine.phase,
      focusLocked: isIntraWorkoutFocusLocked(workoutMachine.phase),
      queuedOfflineWorkoutsCount: queuedOfflineWorkouts.length,
      unsyncedServerPayloadsCount: unsyncedServerPayloads.length,
      serverOnline,
      hasActiveSession: Boolean(workoutMachine.activeSession),
      timestamp: Date.now(),
    }));
  }, [
    characterName,
    overallLevel,
    adventurerRank,
    gold,
    location,
    workoutMachine.phase,
    workoutMachine.activeSession,
    queuedOfflineWorkouts.length,
    unsyncedServerPayloads.length,
    serverOnline,
  ]);

  // Dynamic Stat-Driven Gathering Loop (Interval Ticks)
  const finalizeGatheringTask = useCallback(
    (task: ActiveGatheringState) => {
      const tickCalc = calculateGatheringTick(
        {
          strengthLevel: stats.STRENGTH.level,
          enduranceLevel: stats.ENDURANCE.level,
          agilityLevel: stats.AGILITY.level,
        },
        overallLevel,
        task.node.requiredStatLevel,
        task.node.professionType
      );

      const elapsed = calculateElapsedGatheringTicks({
        startedAtMs: task.startedAtMs,
        lastTickProcessedAtMs: task.lastTickProcessedAtMs,
        currentTimeMs: task.completesAtMs,
        targetDurationMs: task.targetDurationMs,
        tickIntervalMs: tickCalc.tickIntervalMs,
        yieldPerTick: tickCalc.yieldPerTick,
        xpPerTick: tickCalc.xpPerTick,
      });

      if (elapsed.elapsedTicks > 0) {
        const newDrops: LootDrop[] = [];
        for (let i = 1; i <= elapsed.elapsedTicks; i++) {
          const stepSeed = `gather:${task.taskId}:${task.accumulatedTicks + i}`;
          const rng = createSeededRng(stepSeed);
          const picked = rng.pickWeighted(task.node.lootTable);
          const scaledQty = Math.max(1, picked.quantity * tickCalc.yieldPerTick);
          newDrops.push({
            itemSlug: picked.itemSlug,
            itemName: picked.itemName,
            rarity: picked.rarity,
            quantity: scaledQty,
          });
        }
        addDropsToInventory(newDrops);
        setLastGatheringDrop(newDrops);
      }

      setActiveGathering(null);
      setActivityState((curr) => (curr === 'GATHERING' ? 'IDLE' : curr));
      void cancelGatheringTargetNotification();
    },
    [addDropsToInventory, overallLevel, stats]
  );

  useEffect(() => {
    if (!activeGathering) return;
    const timer = setInterval(() => {
      const nowMs = Date.now();
      const tickCalc = calculateGatheringTick(
        {
          strengthLevel: stats.STRENGTH.level,
          enduranceLevel: stats.ENDURANCE.level,
          agilityLevel: stats.AGILITY.level,
        },
        overallLevel,
        activeGathering.node.requiredStatLevel,
        activeGathering.node.professionType
      );

      const elapsed = calculateElapsedGatheringTicks({
        startedAtMs: activeGathering.startedAtMs,
        lastTickProcessedAtMs: activeGathering.lastTickProcessedAtMs,
        currentTimeMs: nowMs,
        targetDurationMs: activeGathering.targetDurationMs,
        tickIntervalMs: tickCalc.tickIntervalMs,
        yieldPerTick: tickCalc.yieldPerTick,
        xpPerTick: tickCalc.xpPerTick,
      });

      if (elapsed.elapsedTicks > 0) {
        const newDrops: LootDrop[] = [];
        for (let i = 1; i <= elapsed.elapsedTicks; i++) {
          const stepSeed = `gather:${activeGathering.taskId}:${activeGathering.accumulatedTicks + i}`;
          const rng = createSeededRng(stepSeed);
          const picked = rng.pickWeighted(activeGathering.node.lootTable);
          const scaledQty = Math.max(1, picked.quantity * tickCalc.yieldPerTick);
          newDrops.push({
            itemSlug: picked.itemSlug,
            itemName: picked.itemName,
            rarity: picked.rarity,
            quantity: scaledQty,
          });
        }
        addDropsToInventory(newDrops);
        setLastGatheringDrop(newDrops);

        setActiveGathering((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            lastTickProcessedAtMs: elapsed.newLastTickProcessedAtMs,
            accumulatedTicks: prev.accumulatedTicks + elapsed.elapsedTicks,
            accumulatedYield: prev.accumulatedYield + elapsed.newYieldAmount,
          };
        });
      }

      if (nowMs >= activeGathering.completesAtMs) {
        finalizeGatheringTask(activeGathering);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeGathering, addDropsToInventory, finalizeGatheringTask, overallLevel, stats]);

  const derivedCombatStats = useMemo(
    () =>
      calculateDerivedCombatStats({
        coreStats: {
          strengthLevel: stats.STRENGTH.level,
          enduranceLevel: stats.ENDURANCE.level,
          agilityLevel: stats.AGILITY.level,
          dexLevel: stats.DEXTERITY?.level ?? 1,
          conLevel: stats.CONSTITUTION?.level ?? 1,
          wisLevel: stats.WISDOM?.level ?? 1,
          sprLevel: stats.SPIRIT?.level ?? 1,
        },
        equipmentBonuses: aggregatedEquipment.equipmentBonuses,
        equipmentPrimaryStats: aggregatedEquipment.primaryStatBonuses,
        uniqueItemModifiers: aggregatedEquipment.uniquePassiveModifiers,
        unlockedTalentRanks,
        systemicFatigueStacks: projectedFatigue.systemicFatigueStacks,
      }),
    [aggregatedEquipment, projectedFatigue.systemicFatigueStacks, stats, unlockedTalentRanks]
  );

  const travelTo = useCallback((dest: GameLocation) => {
    setLocation(dest);
    const charId = remoteCharacterIdRef.current;
    if (charId) {
      apiFetch(`/api/characters/${charId}/travel`, {
        method: 'POST',
        body: JSON.stringify({ destination: dest }),
      }).catch(() => {});
    }
  }, []);

  const logManualWorkout = useCallback(
    (params: {
      workoutType: WorkoutSessionType;
      sets: Array<{ exerciseId: string; reps: number; weightKg: number; isWarmup?: boolean }>;
      cardioSegments: Array<{
        exerciseId: string;
        activityType: string;
        durationSeconds: number;
        averageHrZone: HeartRateZone;
      }>;
      channelToRaidId?: string;
    }) => {
      const now = new Date();
      const dominantZone = params.cardioSegments[0]?.averageHrZone;

      const fatigueTransition = recordWorkoutInFatigueState(fatigueState, {
        performedAt: now,
        workoutType: params.workoutType,
        averageHrZone: dominantZone,
        hasResistanceSets: params.sets.length > 0,
      });

      const evaluation = evaluateWorkoutSession({
        workoutType: params.workoutType,
        resistanceSets: params.sets.map((s) => ({
          ...s,
          exerciseBaseXpFactor:
            STARTER_EXERCISES.find((e) => e.id === s.exerciseId)?.baseXpFactor ?? 1.0,
        })),
        cardioSegments: params.cardioSegments,
        historicalPRs,
        xpMultiplier: fatigueTransition.xpMultiplierForThisWorkout,
        rngSeed: `workout:${now.getTime()}`,
      });

      setFatigueState(fatigueTransition.nextState);
      historicalPRsRef.current = evaluation.updatedPRs;
      setHistoricalPRs(evaluation.updatedPRs);
      setLastWorkoutResult(evaluation);

      const ownerCharacterId =
        activeCharacterIdRef.current ??
        remoteCharacterIdRef.current ??
        currentProfileRef.current?.id ??
        DEFAULT_LOCAL_CHARACTER_ID;

      const manualExercisesMap = new Map<
        string,
        { exerciseId: string; exerciseName: string; sets: CompletedSetEntry[] }
      >();
      params.sets.forEach((s, idx) => {
        const exMeta = STARTER_EXERCISES.find((e) => e.id === s.exerciseId);
        let group = manualExercisesMap.get(s.exerciseId);
        if (!group) {
          group = {
            exerciseId: s.exerciseId,
            exerciseName: exMeta?.name ?? s.exerciseId,
            sets: [],
          };
          manualExercisesMap.set(s.exerciseId, group);
        }
        group.sets.push({
          setNumber: idx + 1,
          weightKg: s.weightKg,
          reps: s.reps,
          isWarmup: s.isWarmup ?? false,
        });
      });

      const manualDurationSec = params.cardioSegments.reduce(
        (acc, c) => acc + c.durationSeconds,
        0
      );
      const manualRecord: CompletedWorkoutRecord = {
        id: `manual_hist_${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
        characterId: ownerCharacterId,
        source: 'ONLINE',
        performedAtIso: now.toISOString(),
        durationSeconds: Math.max(60, manualDurationSec),
        workoutCategory: params.workoutType === 'RESISTANCE' ? 'GYM' : 'CARDIO',
        workoutType: params.workoutType,
        presetName: 'Manual Workout Log',
        exercises: Array.from(manualExercisesMap.values()),
      };
      const nextHistory = [manualRecord, ...workoutHistoryRef.current];
      workoutHistoryRef.current = nextHistory;
      setWorkoutHistory(nextHistory);

      const nextCharWorkoutsCount = countWorkoutsForCharacter(nextHistory, ownerCharacterId);
      setRemoteCharacterWorkoutsCount((prev) => Math.max(prev, nextCharWorkoutsCount));
      persistBundleSnapshot({ workoutHistory: nextHistory });

      setStats((prev) => {
        const strP = applyStatXpProgression(
          prev.STRENGTH.level,
          prev.STRENGTH.xp,
          evaluation.finalXpAwarded.STRENGTH
        );
        const endP = applyStatXpProgression(
          prev.ENDURANCE.level,
          prev.ENDURANCE.xp,
          evaluation.finalXpAwarded.ENDURANCE
        );
        const agiP = applyStatXpProgression(
          prev.AGILITY.level,
          prev.AGILITY.xp,
          evaluation.finalXpAwarded.AGILITY
        );
        return {
          ...prev,
          STRENGTH: {
            level: strP.newLevel,
            xp: strP.remainingXp,
            pointsAvailable: prev.STRENGTH.pointsAvailable + strP.talentPointsEarned,
          },
          ENDURANCE: {
            level: endP.newLevel,
            xp: endP.remainingXp,
            pointsAvailable: prev.ENDURANCE.pointsAvailable + endP.talentPointsEarned,
          },
          AGILITY: {
            level: agiP.newLevel,
            xp: agiP.remainingXp,
            pointsAvailable: prev.AGILITY.pointsAvailable + agiP.talentPointsEarned,
          },
        };
      });

      if (evaluation.criticalTrainingBonus.guaranteedLootDrop) {
        addDropsToInventory([evaluation.criticalTrainingBonus.guaranteedLootDrop]);
      }

      // Live 24h Dungeon Workout Buff Injection!
      let injectedBuffs: DungeonWorkoutBuff[] = [];
      setActiveDungeonRun((prevRun) => {
        if (!prevRun || prevRun.status !== 'ACTIVE_WINDOW') return prevRun;
        injectedBuffs = createLiveDungeonWorkoutBuff({
          workoutId: `wk_${now.getTime()}`,
          characterId: 'player_hero',
          workoutType: params.workoutType,
          averageHrZone: dominantZone,
          triggeredPrCrit: evaluation.criticalTrainingBonus.triggered,
        });
        return {
          ...prevRun,
          activeWorkoutBuffs: [...prevRun.activeWorkoutBuffs, ...injectedBuffs],
        };
      });

      // Channel Workout Energy into 7-Day Raid Boss!
      const raidEnergy = calculateWorkoutRaidEnergyDamage({
        strengthXp: evaluation.finalXpAwarded.STRENGTH,
        enduranceXp: evaluation.finalXpAwarded.ENDURANCE,
        agilityXp: evaluation.finalXpAwarded.AGILITY,
        triggeredPrCrit: evaluation.criticalTrainingBonus.triggered,
      });

      if (params.channelToRaidId && raidEnergy > 0) {
        setRaids((prevRaids) =>
          prevRaids.map((r) => {
            if (r.id !== params.channelToRaidId) return r;
            const nextHp = Math.max(0, r.currentHp - raidEnergy);
            return {
              ...r,
              currentHp: nextHp,
              participants: r.participants.map((p) =>
                p.characterId === 'player_hero'
                  ? { ...p, workoutEnergyDamage: p.workoutEnergyDamage + raidEnergy }
                  : p
              ),
            };
          })
        );
      }

      const charId = remoteCharacterIdRef.current;
      if (charId) {
        const totalDurationSec = params.cardioSegments.reduce(
          (acc, c) => acc + c.durationSeconds,
          0
        );
        apiFetch(`/api/characters/${charId}/workouts`, {
          method: 'POST',
          body: JSON.stringify({
            workoutType: params.workoutType,
            durationSeconds: totalDurationSec,
            averageHrZone: dominantZone,
            sets: params.sets.map((s) => ({
              exerciseId: s.exerciseId,
              reps: s.reps,
              weightKg: s.weightKg,
              isWarmup: s.isWarmup ?? false,
            })),
            cardioSegments: params.cardioSegments,
          }),
        }).catch(() => {});
      }

      return { evaluation, injectedBuffs, raidEnergy };
    },
    [fatigueState, historicalPRs, addDropsToInventory, persistBundleSnapshot]
  );

  const unlockTalentNode = useCallback(
    (nodeId: string) => {
      const res = spendTalentPoint(
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
        nodeId,
        DEFAULT_TALENT_TREES
      );

      if (!res.ok) {
        return { ok: false, error: res.error };
      }

      const nextUnlocked = res.nextState.unlockedNodeRanks;
      unlockedTalentRanksRef.current = nextUnlocked;
      setUnlockedTalentRanks(nextUnlocked);

      const nextStats = {
        ...stats,
        [res.governingStat]: {
          ...stats[res.governingStat],
          pointsAvailable: res.nextState.availablePoints[res.governingStat],
        },
      };
      statsRef.current = nextStats;
      setStats(nextStats);

      if (currentProfileRef.current) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          stats: nextStats,
          unlockedTalentRanks: nextUnlocked,
          lastSyncedAtMs: Date.now(),
        };
        currentProfileRef.current = updatedProfile;
        const nextAvail = availableCharactersRef.current.map((c) =>
          c.id === updatedProfile.id ? { ...c, ...updatedProfile } : c
        );
        availableCharactersRef.current = nextAvail;
        setAvailableCharacters(nextAvail);
        persistBundleSnapshot({
          characterProfile: updatedProfile,
          availableCharacters: nextAvail,
        });
      }

      if (serverOnline && remoteCharacterIdRef.current && !remoteCharacterIdRef.current.startsWith('local_')) {
        apiFetch(`/api/characters/${remoteCharacterIdRef.current}/talents/unlock`, {
          method: 'POST',
          body: JSON.stringify({ nodeSlug: nodeId }),
        }).catch(() => {});
      }

      return { ok: true };
    },
    [persistBundleSnapshot, serverOnline, stats, unlockedTalentRanks]
  );

  const equipItemToSlot = useCallback(
    (slug: string, targetSlot?: EquipmentSlot) => {
      const target = rawInventory.find((i) => i.slug === slug);
      if (!target) return { ok: false, error: 'Item not found in inventory.' };

      const compatibleSlots = getCompatibleSlotsForItemType(
        target.itemType,
        target.weaponHandedness
      );
      if (compatibleSlots.length === 0) {
        return { ok: false, error: `${target.name} cannot be equipped.` };
      }

      let resolvedSlot = targetSlot;
      if (!resolvedSlot) {
        if (target.itemType === 'ACCESSORY') {
          resolvedSlot =
            equipmentLoadout.accessory1 === null
              ? 'accessory1'
              : equipmentLoadout.accessory2 === null
                ? 'accessory2'
                : 'accessory1';
        } else {
          resolvedSlot = compatibleSlots[0]!;
        }
      }

      const check = validateEquipmentRequirements(
        target,
        {
          strengthLevel: stats.STRENGTH.level,
          enduranceLevel: stats.ENDURANCE.level,
          agilityLevel: stats.AGILITY.level,
        },
        resolvedSlot
      );

      if (!check.valid) {
        return { ok: false, error: check.error };
      }

      const currentLoadout = equipmentLoadoutRef.current || equipmentLoadout;
      const nextLoadout: EquipmentLoadoutMap = { ...currentLoadout };
      // Remove item from any other slot if already equipped (e.g., swapping accessory1 -> accessory2)
      for (const k of Object.keys(nextLoadout) as EquipmentSlot[]) {
        if (nextLoadout[k] === slug) {
          nextLoadout[k] = null;
        }
      }
      nextLoadout[resolvedSlot] = slug;

      equipmentLoadoutRef.current = nextLoadout;
      setEquipmentLoadout(nextLoadout);

      if (currentProfileRef.current) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          equipmentLoadout: nextLoadout,
          lastSyncedAtMs: Date.now(),
        };
        currentProfileRef.current = updatedProfile;
        const nextAvail = availableCharactersRef.current.map((c) =>
          c.id === updatedProfile.id ? { ...c, ...updatedProfile } : c
        );
        availableCharactersRef.current = nextAvail;
        setAvailableCharacters(nextAvail);
        persistBundleSnapshot({
          characterProfile: updatedProfile,
          availableCharacters: nextAvail,
        });
      }

      return { ok: true, slot: resolvedSlot };
    },
    [equipmentLoadout, persistBundleSnapshot, rawInventory, stats]
  );

  const unequipSlot = useCallback(
    (slot: EquipmentSlot) => {
      const currentLoadout = equipmentLoadoutRef.current || equipmentLoadout;
      const nextLoadout: EquipmentLoadoutMap = { ...currentLoadout, [slot]: null };
      equipmentLoadoutRef.current = nextLoadout;
      setEquipmentLoadout(nextLoadout);

      if (currentProfileRef.current) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          equipmentLoadout: nextLoadout,
          lastSyncedAtMs: Date.now(),
        };
        currentProfileRef.current = updatedProfile;
        const nextAvail = availableCharactersRef.current.map((c) =>
          c.id === updatedProfile.id ? { ...c, ...updatedProfile } : c
        );
        availableCharactersRef.current = nextAvail;
        setAvailableCharacters(nextAvail);
        persistBundleSnapshot({
          characterProfile: updatedProfile,
          availableCharacters: nextAvail,
        });
      }
    },
    [equipmentLoadout, persistBundleSnapshot]
  );

  const toggleEquipItem = useCallback(
    (slug: string) => {
      const existingSlot = (Object.entries(equipmentLoadout) as Array<
        [EquipmentSlot, string | null]
      >).find(([, s]) => s === slug)?.[0];

      if (existingSlot) {
        unequipSlot(existingSlot);
        return { ok: true };
      }
      const res = equipItemToSlot(slug);
      return { ok: res.ok, error: res.error };
    },
    [equipItemToSlot, equipmentLoadout, unequipSlot]
  );

  const startGatheringTask = useCallback(
    (
      nodeSlug: string,
      options?: {
        targetDurationMs?: number;
        targetYieldAmount?: number;
        notifyOnCompletion?: boolean;
      }
    ) => {
      if (activeGathering) {
        return { ok: false, error: 'A gathering task is already running.' };
      }
      if (activityState === 'IN_DUNGEON') {
        return { ok: false, error: 'Cannot gather while locked inside an active Dungeon.' };
      }
      const node = GATHERING_NODES.find((n) => n.slug === nodeSlug);
      if (!node) return { ok: false, error: 'Node not found.' };

      if (stats[node.requiredStatType].level < node.requiredStatLevel) {
        return {
          ok: false,
          error: `Requires ${node.requiredStatType} Lv.${node.requiredStatLevel}.`,
        };
      }

      for (const req of node.inputMaterials) {
        const owned = inventory.find((i) => i.slug === req.slug)?.quantity ?? 0;
        if (owned < req.quantity) {
          return {
            ok: false,
            error: `Requires ${req.quantity}x ${req.name} (owned: ${owned}).`,
          };
        }
      }

      if (node.inputMaterials.length > 0) {
        const nextInv = rawInventoryRef.current
          .map((item) => {
            const req = node.inputMaterials.find((r) => r.slug === item.slug);
            return req ? { ...item, quantity: item.quantity - req.quantity } : item;
          })
          .filter((item) => item.quantity > 0 || item.itemType !== 'MATERIAL');
        rawInventoryRef.current = nextInv;
        setRawInventory(nextInv);

        if (currentProfileRef.current) {
          const updatedProfile: PersistedCharacterProfile = {
            ...currentProfileRef.current,
            inventory: nextInv,
            lastSyncedAtMs: Date.now(),
          };
          currentProfileRef.current = updatedProfile;
          const nextAvail = availableCharactersRef.current.map((c) =>
            c.id === updatedProfile.id ? { ...c, ...updatedProfile } : c
          );
          availableCharactersRef.current = nextAvail;
          setAvailableCharacters(nextAvail);
          persistBundleSnapshot({
            characterProfile: updatedProfile,
            availableCharacters: nextAvail,
          });
        }
      }

      const tick = calculateGatheringTick(
        {
          strengthLevel: stats.STRENGTH.level,
          enduranceLevel: stats.ENDURANCE.level,
          agilityLevel: stats.AGILITY.level,
        },
        overallLevel,
        node.requiredStatLevel,
        node.professionType
      );

      let durationMs: number;
      if (options?.targetDurationMs) {
        durationMs = Math.min(
          MAX_GATHERING_DURATION_MS,
          Math.max(MIN_GATHERING_DURATION_MS, options.targetDurationMs)
        );
      } else if (options?.targetYieldAmount) {
        const neededMs = calculateRequiredTimeForYield(
          tick.tickIntervalMs,
          tick.yieldPerTick,
          options.targetYieldAmount
        );
        durationMs = Math.min(
          MAX_GATHERING_DURATION_MS,
          Math.max(MIN_GATHERING_DURATION_MS, neededMs)
        );
      } else {
        durationMs = Math.min(MAX_GATHERING_DURATION_MS, node.durationSeconds * 1000);
      }

      const nowMs = Date.now();
      const completesAtMs = nowMs + durationMs;
      const notifyOnCompletion = options?.notifyOnCompletion ?? false;

      setActiveGathering({
        taskId: `gather_${nowMs}`,
        node,
        startedAtMs: nowMs,
        completesAtMs,
        targetDurationMs: durationMs,
        targetYieldAmount: options?.targetYieldAmount,
        notifyOnCompletion,
        lastTickProcessedAtMs: nowMs,
        accumulatedTicks: 0,
        accumulatedYield: 0,
      });

      if (notifyOnCompletion) {
        void scheduleGatheringTargetNotification({
          secondsRemaining: Math.round(durationMs / 1000),
          nodeName: node.name,
          targetYieldAmount: options?.targetYieldAmount,
          itemName: node.lootTable[0]?.itemName,
        });
      }

      setLocation('GATHERING_NODE');
      setActivityState('GATHERING');
      setLastGatheringDrop(null);
      return { ok: true };
    },
    [activeGathering, activityState, inventory, overallLevel, persistBundleSnapshot, stats]
  );

  const completeGatheringNow = useCallback(() => {
    if (!activeGathering) return;
    finalizeGatheringTask(activeGathering);
  }, [activeGathering, finalizeGatheringTask]);

  const syncGatheringTicks = useCallback(async () => {
    if (!serverOnline) return;
    try {
      await apiFetch('/api/gathering/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch {
      // Safe offline fallback
    }
  }, [serverOnline]);

  const startDungeonExpedition = useCallback(
    (selectedPartyIds: string[], dungeonSlug?: string) => {
      if (activeDungeonRun && activeDungeonRun.status === 'ACTIVE_WINDOW') {
        return { ok: false, error: 'A 24-hour Dungeon Expedition is already underway.' };
      }

      const targetDungeon =
        DEFAULT_DUNGEON_CATALOG.find((d) => d.dungeonSlug === dungeonSlug) ??
        DEFAULT_DUNGEON_CATALOG[0] ??
        STARTER_DUNGEON;

      const requiredRank = targetDungeon.requiredRank ?? 'COPPER';
      if (!isAdventurerRankSufficient(adventurerRank, requiredRank)) {
        return {
          ok: false,
          error: `Requires ${requiredRank} Adventurer Rank (currently ${adventurerRank}).`,
        };
      }

      const playerCombatant: CombatantCharacterInput = {
        characterId: 'player_hero',
        name: characterName,
        coreStats: {
          strengthLevel: stats.STRENGTH.level,
          enduranceLevel: stats.ENDURANCE.level,
          agilityLevel: stats.AGILITY.level,
        },
        equipmentBonuses,
        unlockedTalentRanks,
        systemicFatigueStacks: projectedFatigue.systemicFatigueStacks,
      };

      const selectedAllies = COMPANION_ROSTER.filter((c) =>
        selectedPartyIds.includes(c.characterId)
      ).slice(0, 4);

      const party = [playerCombatant, ...selectedAllies];
      const nowMs = Date.now();

      setActiveDungeonRun({
        runId: `run_${nowMs}`,
        dungeon: targetDungeon,
        party,
        startedAtMs: nowMs,
        resolvesAtMs: nowMs + 24 * 3600 * 1000,
        activeWorkoutBuffs: [],
        status: 'ACTIVE_WINDOW',
        replay: null,
      });
      setLocation('DUNGEON');
      setActivityState('IN_DUNGEON');
      return { ok: true };
    },
    [
      activeDungeonRun,
      adventurerRank,
      characterName,
      equipmentBonuses,
      projectedFatigue.systemicFatigueStacks,
      stats,
      unlockedTalentRanks,
    ]
  );

  const resolveActiveDungeonNow = useCallback(() => {
    if (!activeDungeonRun || activeDungeonRun.status === 'COMPLETED') return;

    const replay = simulateDungeonRun({
      dungeon: activeDungeonRun.dungeon,
      party: activeDungeonRun.party,
      workoutBuffs: activeDungeonRun.activeWorkoutBuffs,
      seed: activeDungeonRun.runId,
      tickIntervalMs: 250,
    });

    if (replay.outcome === 'VICTORY') {
      setGold((g) => g + Math.round(replay.totalGoldEarned / activeDungeonRun.party.length));
      addDropsToInventory(replay.lootDrops);
    }

    setActiveDungeonRun({
      ...activeDungeonRun,
      status: 'COMPLETED',
      replay,
    });
    setActivityState('IDLE');
  }, [activeDungeonRun, addDropsToInventory]);

  const dismissCompletedDungeonReplay = useCallback(() => {
    setActiveDungeonRun(null);
    setActivityState('IDLE');
  }, []);

  const lockDailyRaidStrike = useCallback(
    (raidId: string) => {
      const target = raids.find((r) => r.id === raidId);
      if (!target) return { ok: false, error: 'Raid not found.' };
      if (target.dailyAttackUsedToday) {
        return {
          ok: false,
          error: 'Daily strike already locked in! Log a real-world workout to channel bonus energy.',
        };
      }

      const rawStrike =
        stats.STRENGTH.level * 4_500 +
        stats.AGILITY.level * 4_000 +
        stats.ENDURANCE.level * 2_400;
      const damage = Math.round(
        rawStrike * (1 + aggregatedTalents.meleePowerPct + aggregatedTalents.attackSpeedPct * 0.6)
      );
      const support = Math.round(stats.ENDURANCE.level * 1_600);

      setRaids((prev) =>
        prev.map((r) => {
          if (r.id !== raidId) return r;
          return {
            ...r,
            currentHp: Math.max(0, r.currentHp - damage),
            dailyAttackUsedToday: true,
            participants: r.participants.map((p) =>
              p.characterId === 'player_hero'
                ? {
                    ...p,
                    combatDamageDealt: p.combatDamageDealt + damage,
                    supportScore: p.supportScore + support,
                  }
                : p
            ),
          };
        })
      );

      // If online, dispatch attack to backend to trigger DB sync & live WebSocket broadcast
      const charId = remoteCharacterIdRef.current;
      if (serverOnline && charId) {
        apiFetch(`/api/raids/${raidId}/attack`, {
          method: 'POST',
          body: JSON.stringify({ characterId: charId }),
        }).catch(() => {
          // Graceful offline fallback
        });
      }

      return { ok: true, damage };
    },
    [aggregatedTalents, raids, serverOnline, stats]
  );

  const resolveWeeklyRaidRewards = useCallback(
    (raidId: string) => {
      const target = raids.find((r) => r.id === raidId);
      if (!target) return;

      const resolution = calculateRaidRewards({
        raidInstanceId: target.id,
        accessType: target.accessType,
        bossMaxHp: target.maxHp,
        isBossDefeated: target.currentHp <= 0,
        baseGoldPool: target.accessType === 'PUBLIC_WORLD' ? 15_000 : 9_000,
        baseGuildReputationPool: 2_500,
        baseMaterialQuantity: 8,
        lootTable: [
          {
            itemSlug: 'malakor_signet',
            itemName: "Malakor's Signet Ring",
            rarity: 'EPIC',
            quantity: 1,
            weight: 60,
          },
          {
            itemSlug: 'crown_of_the_wyrm',
            itemName: 'Crown of the World Wyrm',
            rarity: 'MYTHIC',
            quantity: 1,
            weight: 25,
            requiresBossDefeat: true,
            minTier: 'S',
          },
        ],
        participants: target.participants,
        seed: `raid:${target.id}:${target.currentHp}`,
      });

      const myReward = resolution.participantRewards.find(
        (pr) => pr.characterId === 'player_hero'
      );
      if (myReward) {
        setGold((g) => g + myReward.goldAwarded);
        setAdventurerReputation((rep) => rep + myReward.guildReputationAwarded);
        setGuildReputation((rep) => rep + myReward.guildReputationAwarded);
        addDropsToInventory(myReward.lootDrops);
      }

      setRaids((prev) =>
        prev.map((r) => (r.id === raidId ? { ...r, lastResolution: resolution } : r))
      );
    },
    [addDropsToInventory, raids]
  );

  const completeGuildBounty = useCallback(
    (bountySlug: string) => {
      const bounty = bounties.find((b) => b.slug === bountySlug);
      if (!bounty) return { ok: false, error: 'Bounty not found.' };
      if (bounty.completed) return { ok: false, error: 'Already completed.' };

      if (bounty.slug === 'trial_of_iron' && workoutsLoggedCount < 3) {
        return {
          ok: false,
          error: `Log at least 3 total workouts first (currently ${workoutsLoggedCount}/3).`,
        };
      }

      const totalLvl =
        stats.STRENGTH.level + stats.ENDURANCE.level + stats.AGILITY.level;
      if (bounty.slug === 'trial_of_bronze') {
        if (adventurerRank === 'COPPER') {
          return { ok: false, error: 'Complete the Iron Rank-Up Trial first.' };
        }
        if (totalLvl < 15) {
          return {
            ok: false,
            error: `Requires Combined Stat Level 15 (currently ${totalLvl}/15).`,
          };
        }
      }

      const nextBounties = bounties.map((b) =>
        b.slug === bountySlug ? { ...b, completed: true } : b
      );
      setBounties(nextBounties);

      const nextGold = goldRef.current + bounty.goldReward;
      goldRef.current = nextGold;
      setGold(nextGold);

      const nextRep = adventurerReputation + bounty.reputationReward;
      setAdventurerReputation(nextRep);

      const nextRank =
        bounty.isRankUpTrial && bounty.unlocksRank ? bounty.unlocksRank : adventurerRank;
      if (bounty.isRankUpTrial && bounty.unlocksRank) {
        setAdventurerRank(bounty.unlocksRank);
      }

      const completedSlugs = nextBounties.filter((b) => b.completed).map((b) => b.slug);
      if (currentProfileRef.current) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          gold: nextGold,
          adventurerReputation: nextRep,
          adventurerRank: nextRank,
          completedBountySlugs: completedSlugs,
          lastSyncedAtMs: Date.now(),
        };
        currentProfileRef.current = updatedProfile;
        const nextAvail = availableCharactersRef.current.map((c) =>
          c.id === updatedProfile.id ? { ...c, ...updatedProfile } : c
        );
        availableCharactersRef.current = nextAvail;
        setAvailableCharacters(nextAvail);
        persistBundleSnapshot({
          characterProfile: updatedProfile,
          availableCharacters: nextAvail,
        });
      }

      const charId = remoteCharacterIdRef.current;
      if (serverOnline && charId && !charId.startsWith('local_')) {
        apiFetch(`/api/characters/${charId}/bounties/${bountySlug}/complete`, {
          method: 'POST',
        }).catch(() => {});
      }

      return { ok: true };
    },
    [adventurerRank, adventurerReputation, bounties, persistBundleSnapshot, serverOnline, stats, workoutsLoggedCount]
  );

  // Auto-dismiss Phase 1 Arrival Boon banner in < 2 seconds (1,600ms)
  useEffect(() => {
    if (!arrivalBanner) return;
    const t = setTimeout(() => {
      setArrivalBanner(null);
    }, arrivalBanner.bannerDurationMs);
    return () => clearTimeout(t);
  }, [arrivalBanner]);

  // Configure OS local notification handler, Android channel & lockscreen tap listener
  useEffect(() => {
    initializeRestNotifications().catch(() => {});
    const unsubscribeTap = subscribeToStaminaNotificationTap(() => {
      setNotificationTapTick((t) => t + 1);
      setWorkoutMachine((prev) =>
        prev.phase === 'Resting'
          ? transitionHybridWorkoutState(prev, { type: 'TICK_REST_TIMER', nowMs: Date.now() })
          : prev
      );
      dismissDeliveredStaminaNotifications().catch(() => {});
    });
    return () => {
      unsubscribeTap();
      cancelStaminaRechargedNotification().catch(() => {});
    };
  }, []);

  // Reconcile wall-clock rest timer immediately on foreground resume & clear stale tray banners
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        dismissDeliveredStaminaNotifications().catch(() => {});
        setWorkoutMachine((prev) => {
          if (prev.phase !== 'Resting' || !prev.activeSession?.restTimer.isActive) {
            return prev;
          }
          const reconciled = transitionHybridWorkoutState(prev, {
            type: 'TICK_REST_TIMER',
            nowMs: Date.now(),
          });
          if (prev.phase === 'Resting' && reconciled.phase === 'DungeonActive') {
            triggerSensoryCue('STAMINA_RECHARGED_PULSE');
          }
          return reconciled;
        });
      }
    });
    return () => sub.remove();
  }, []);

  // Declaratively arm/reschedule/cancel background Stamina Recharged local notification
  const restEndsAtMs = workoutMachine.activeSession?.restTimer.endsAtMs ?? null;
  const restIsActive = Boolean(
    workoutMachine.phase === 'Resting' && workoutMachine.activeSession?.restTimer.isActive
  );
  const nextSetPreviewRef = useRef(workoutMachine.activeSession?.nextSetPreview ?? null);
  nextSetPreviewRef.current = workoutMachine.activeSession?.nextSetPreview ?? null;

  useEffect(() => {
    let cancelled = false;
    if (restIsActive && restEndsAtMs !== null) {
      scheduleStaminaRechargedNotification({
        endsAtMs: restEndsAtMs,
        nextSetPreview: nextSetPreviewRef.current,
      })
        .then((armed) => {
          if (!cancelled) setRestNotificationArmed(armed);
        })
        .catch(() => {
          if (!cancelled) setRestNotificationArmed(false);
        });
    } else {
      setRestNotificationArmed(false);
      cancelStaminaRechargedNotification().catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [restIsActive, restEndsAtMs]);

  // Phase 2 Auto-Rest Countdown Loop (`Resting` -> `DungeonActive` on expiry)
  useEffect(() => {
    if (workoutMachine.phase !== 'Resting' || !workoutMachine.activeSession?.restTimer.isActive) {
      return;
    }
    const interval = setInterval(() => {
      setWorkoutMachine((prev) => {
        if (prev.phase !== 'Resting' || !prev.activeSession?.restTimer.isActive) return prev;
        const next = transitionHybridWorkoutState(prev, {
          type: 'TICK_REST_TIMER',
          nowMs: Date.now(),
        });
        if (prev.phase === 'Resting' && next.phase === 'DungeonActive') {
          triggerSensoryCue('STAMINA_RECHARGED_PULSE');
        }
        return next;
      });
    }, 250);
    return () => clearInterval(interval);
  }, [workoutMachine.phase, workoutMachine.activeSession?.restTimer.isActive]);

  const startHybridSession = useCallback(
    (params: {
      workoutType: WorkoutSessionType;
      workoutCategory?: WorkoutCategory;
      sourcePresetId?: string | null;
      trigger: ArrivalTriggerType;
      gymId?: string | null;
      gymName?: string | null;
      lowEnergyMode?: boolean;
      initialRestSeconds?: number;
    }) => {
      const nowMs = Date.now();
      const sessionId = `sess_${nowMs}`;
      const next = transitionHybridWorkoutState(workoutMachine, {
        type: 'START_SESSION',
        sessionId,
        workoutType: params.workoutType,
        trigger: params.trigger,
        gymId: params.gymId,
        gymName: params.gymName,
        lowEnergyMode: params.lowEnergyMode,
        initialRestSeconds: params.initialRestSeconds,
        defaultNextExercise: {
          id: 'bench_press',
          name: 'Barbell Bench Press',
          weightKg: 85,
          reps: 8,
        },
        nowMs,
      });

      if (next.lastError || !next.activeSession) {
        return { ok: false, error: next.lastError ?? 'Could not start session.' };
      }

      setWorkoutMachine(next);
      setArrivalBanner(next.activeSession.arrivalBoon);
      triggerSensoryCue(next.activeSession.arrivalBoon.sensoryCue);
      ensureRestNotificationPermission().catch(() => {});

      const charId = remoteCharacterIdRef.current;
      if (charId) {
        apiFetch(`/api/characters/${charId}/workout-sessions/start`, {
          method: 'POST',
          body: JSON.stringify({
            workoutType: params.workoutType,
            workoutCategory: params.workoutCategory,
            sourcePresetId: params.sourcePresetId,
            arrivalTrigger: params.trigger,
            gymId: params.gymId ?? undefined,
            gymName: params.gymName ?? undefined,
            lowEnergyMode: Boolean(params.lowEnergyMode),
            restTimerConfigSec: params.initialRestSeconds,
          }),
        }).catch(() => {});
      }

      return { ok: true };
    },
    [workoutMachine]
  );

  const logHybridSet = useCallback(
    (params: {
      exerciseId: string;
      reps: number;
      weightKg: number;
      rpe?: number | null;
      isWarmup?: boolean;
      setType?: SetType;
      supersetGroupId?: string | null;
      customRestSeconds?: number;
      nextSetHint?: { exerciseId: string; exerciseName: string; weightKg: number; reps: number };
    }) => {
      const ex = STARTER_EXERCISES.find((e) => e.id === params.exerciseId);
      const nowMs = Date.now();
      const next = transitionHybridWorkoutState(workoutMachine, {
        type: 'LOG_SET',
        setId: `set_${nowMs}`,
        exerciseId: params.exerciseId,
        exerciseName: ex?.name ?? params.exerciseId,
        reps: params.reps,
        weightKg: params.weightKg,
        rpe: params.rpe ?? null,
        isWarmup: params.isWarmup,
        setType: params.setType,
        supersetGroupId: params.supersetGroupId,
        exerciseBaseXpFactor: ex?.baseXpFactor ?? 1.0,
        historicalPR: historicalPRs[params.exerciseId],
        customRestSeconds: params.customRestSeconds,
        nextSetHint: params.nextSetHint,
        nowMs,
      });

      if (next.lastError) {
        return { ok: false, error: next.lastError };
      }

      setWorkoutMachine(next);
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
      return { ok: true };
    },
    [historicalPRs, workoutMachine]
  );

  const recordHybridCardioSegment = useCallback(
    (params: {
      exerciseId: string;
      activityType: string;
      durationSeconds: number;
      averageHrZone: HeartRateZone;
    }) => {
      const next = transitionHybridWorkoutState(workoutMachine, {
        type: 'ADD_CARDIO_SEGMENT',
        segment: params,
      });
      if (next.lastError) {
        return { ok: false, error: next.lastError };
      }
      setWorkoutMachine(next);
      triggerSensoryCue('SET_MICRO_REWARD_TICK');
      return { ok: true };
    },
    [workoutMachine]
  );

  const adjustHybridRestTimer = useCallback(
    (params: { deltaSeconds?: number; newDurationSeconds?: number }) => {
      let firedCue = false;
      setWorkoutMachine((prev) => {
        const next = transitionHybridWorkoutState(prev, {
          type: 'ADJUST_REST_TIMER',
          deltaSeconds: params.deltaSeconds,
          newDurationSeconds: params.newDurationSeconds,
          nowMs: Date.now(),
        });
        if (!firedCue) {
          firedCue = true;
          if (prev.phase === 'Resting' && next.phase === 'DungeonActive') {
            triggerSensoryCue('STAMINA_RECHARGED_PULSE');
          } else {
            triggerSensoryCue('SET_MICRO_REWARD_TICK');
          }
        }
        return next;
      });
    },
    []
  );

  const skipHybridRest = useCallback(() => {
    setWorkoutMachine((prev) => transitionHybridWorkoutState(prev, { type: 'SKIP_REST' }));
    triggerSensoryCue('STAMINA_RECHARGED_PULSE');
  }, []);

  const finishHybridSession = useCallback(
    (
      channelToRaidId?: string,
      telemetryOptions?: {
        samples?: HeartRateSample[];
        source?: WearableTelemetrySource;
        isHardwareVerified?: boolean;
        confidenceScore?: number;
      }
    ) => {
      if (!workoutMachine.activeSession) {
        return { ok: false, error: 'No active workout session.' };
      }

      const active = workoutMachine.activeSession;
      const now = new Date();
      const dominantZone = active.cardioSegments[0]?.averageHrZone;

      const fatigueTransition = recordWorkoutInFatigueState(fatigueState, {
        performedAt: now,
        workoutType: active.workoutType,
        averageHrZone: dominantZone,
        hasResistanceSets: active.setLogs.length > 0,
      });

      const nextStreak = consistencyStreak + 1;

      const nextMachine = transitionHybridWorkoutState(workoutMachine, {
        type: 'FINISH_WORKOUT',
        nowMs: now.getTime(),
        fatigueAndRestMultiplier: fatigueTransition.xpMultiplierForThisWorkout,
        lastWorkoutAt: fatigueState.lastWorkoutAt,
        consistencyStreakSessions: nextStreak,
        historicalPRs,
        exerciseBaseXpById: EXERCISE_BASE_XP_BY_ID,
        currentCharacterStats: stats,
        rngSeed: `hybrid_finish:${active.sessionId}:${now.getTime()}`,
      });

      if (nextMachine.lastError || !nextMachine.activeSession?.rewardPayload) {
        return { ok: false, error: nextMachine.lastError ?? 'Unable to consolidate workout.' };
      }

      const payload = nextMachine.activeSession.rewardPayload;
      const evalResult = payload.workoutEvaluation;

      const ownerCharacterId =
        activeCharacterIdRef.current ??
        remoteCharacterIdRef.current ??
        currentProfileRef.current?.id ??
        DEFAULT_LOCAL_CHARACTER_ID;

      setWorkoutMachine(nextMachine);
      setFatigueState(fatigueTransition.nextState);
      historicalPRsRef.current = evalResult.updatedPRs;
      setHistoricalPRs(evalResult.updatedPRs);
      setLastWorkoutResult(evalResult);
      consistencyStreakRef.current = nextStreak;
      setConsistencyStreak(nextStreak);
      if (payload.resilienceBonus.triggered) {
        setResilienceShields((s) => s + 1);
      }

      setStats((prev) => ({
        ...prev,
        STRENGTH: {
          level: payload.characterProgression.byStat.STRENGTH.newLevel,
          xp: payload.characterProgression.byStat.STRENGTH.remainingXp,
          pointsAvailable:
            payload.characterProgression.byStat.STRENGTH.totalPointsAvailableAfterSession,
        },
        ENDURANCE: {
          level: payload.characterProgression.byStat.ENDURANCE.newLevel,
          xp: payload.characterProgression.byStat.ENDURANCE.remainingXp,
          pointsAvailable:
            payload.characterProgression.byStat.ENDURANCE.totalPointsAvailableAfterSession,
        },
        AGILITY: {
          level: payload.characterProgression.byStat.AGILITY.newLevel,
          xp: payload.characterProgression.byStat.AGILITY.remainingXp,
          pointsAvailable:
            payload.characterProgression.byStat.AGILITY.totalPointsAvailableAfterSession,
        },
      }));

      setGold((g) => g + payload.totalGoldAwarded);

      if (evalResult.criticalTrainingBonus.guaranteedLootDrop) {
        addDropsToInventory([evalResult.criticalTrainingBonus.guaranteedLootDrop]);
      }

      // Inject Live 24h Dungeon Expedition Buff if active
      let injectedBuffs: DungeonWorkoutBuff[] = [];
      setActiveDungeonRun((prevRun) => {
        if (!prevRun || prevRun.status !== 'ACTIVE_WINDOW') return prevRun;
        injectedBuffs = createLiveDungeonWorkoutBuff({
          workoutId: `wk_${now.getTime()}`,
          characterId: 'player_hero',
          workoutType: active.workoutType,
          averageHrZone: dominantZone,
          triggeredPrCrit: evalResult.criticalTrainingBonus.triggered,
        });
        return {
          ...prevRun,
          activeWorkoutBuffs: [...prevRun.activeWorkoutBuffs, ...injectedBuffs],
        };
      });

      // Channel Workout Energy into 7-Day Raid Boss
      const raidEnergy = calculateWorkoutRaidEnergyDamage({
        strengthXp: payload.finalXpByStat.STRENGTH,
        enduranceXp: payload.finalXpByStat.ENDURANCE,
        agilityXp: payload.finalXpByStat.AGILITY,
        triggeredPrCrit: evalResult.criticalTrainingBonus.triggered,
      });

      if (channelToRaidId && raidEnergy > 0) {
        setRaids((prevRaids) =>
          prevRaids.map((r) => {
            if (r.id !== channelToRaidId) return r;
            const nextHp = Math.max(0, r.currentHp - raidEnergy);
            return {
              ...r,
              currentHp: nextHp,
              participants: r.participants.map((p) =>
                p.characterId === 'player_hero'
                  ? { ...p, workoutEnergyDamage: p.workoutEnergyDamage + raidEnergy }
                  : p
              ),
            };
          })
        );
      }

      setLastHybridConsolidation({
        rewardPayload: payload,
        injectedBuffs,
        raidEnergy: channelToRaidId ? raidEnergy : 0,
      });

      triggerSensoryCue('DUNGEON_CLEARED_FANFARE');

      if (telemetryOptions?.isHardwareVerified) {
        setGameMode('IRONMAN_VERIFIED');
      }

      const charId = remoteCharacterIdRef.current;
      if (charId) {
        apiFetch(`/api/characters/${charId}/workouts`, {
          method: 'POST',
          body: JSON.stringify({
            sessionId: active.sessionId,
            workoutType: active.workoutType,
            durationSeconds: payload.durationSeconds,
            averageHrZone: dominantZone,
            arrivalTrigger: active.arrivalBoon.trigger,
            gymName: active.arrivalBoon.gymName ?? undefined,
            lowEnergyMode: active.lowEnergyMode,
            focusOverrideCount: active.focusOverrideCount,
            channeledRaidInstanceId:
              channelToRaidId && !channelToRaidId.startsWith('raid_public_')
                ? channelToRaidId
                : undefined,
            verificationSource:
              telemetryOptions?.source ??
              (telemetryOptions?.isHardwareVerified ? 'WEARABLE_TELEMETRY' : 'MANUAL_HONESTY'),
            isHardwareVerified: Boolean(telemetryOptions?.isHardwareVerified),
            externalTelemetryRef:
              telemetryOptions?.confidenceScore != null
                ? JSON.stringify({ confidenceScore: telemetryOptions.confidenceScore })
                : undefined,
            telemetrySamples: telemetryOptions?.samples,
            sets: active.setLogs.map((s) => ({
              exerciseId: s.exerciseId,
              reps: s.reps,
              weightKg: s.weightKg,
              rpe: s.rpe ?? undefined,
              isWarmup: s.isWarmup,
            })),
            cardioSegments: active.cardioSegments,
          }),
        }).catch(() => {});
      }

      // Group active.setLogs into completed exercise history for Training History Matrix
      const exercisesMap = new Map<
        string,
        { exerciseId: string; exerciseName: string; sets: CompletedSetEntry[] }
      >();
      for (const s of active.setLogs) {
        let exGroup = exercisesMap.get(s.exerciseId);
        if (!exGroup) {
          exGroup = { exerciseId: s.exerciseId, exerciseName: s.exerciseName || s.exerciseId, sets: [] };
          exercisesMap.set(s.exerciseId, exGroup);
        }
        exGroup.sets.push({
          setNumber: s.setNumber,
          weightKg: s.weightKg,
          reps: s.reps,
          rpe: s.rpe ?? null,
          setType: s.setType,
          isWarmup: s.isWarmup,
        });
      }

      const inferredCategory: WorkoutCategory =
        active.workoutType === 'RESISTANCE'
          ? 'GYM'
          : active.workoutType === 'ACTIVE_RECOVERY'
          ? 'RECOVERY'
          : active.workoutType === 'CARDIO_HIGH_INTENSITY'
          ? 'SPORT'
          : 'CARDIO';

      const onlineRecord: CompletedWorkoutRecord = {
        id: `online_hist_${now.getTime()}`,
        characterId: ownerCharacterId,
        gymId: normalizeGymId(active.arrivalBoon?.gymId) ?? 'open-world',
        gymName: active.arrivalBoon?.gymName ?? 'Open World',
        source: 'ONLINE',
        performedAtIso: now.toISOString(),
        durationSeconds: payload.durationSeconds,
        workoutCategory: inferredCategory,
        workoutType: active.workoutType,
        presetName: active.workoutType === 'RESISTANCE' ? 'Live Resistance Training' : 'Live Conditioning',
        exercises: Array.from(exercisesMap.values()),
      };

      const nextHistory = [onlineRecord, ...workoutHistoryRef.current];
      workoutHistoryRef.current = nextHistory;
      setWorkoutHistory(nextHistory);

      const nextCharWorkoutsCount = countWorkoutsForCharacter(nextHistory, ownerCharacterId);
      setRemoteCharacterWorkoutsCount((prev) => Math.max(prev, nextCharWorkoutsCount));

      if (currentProfileRef.current && currentProfileRef.current.id === ownerCharacterId) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          workoutsLoggedCount: Math.max(
            nextCharWorkoutsCount,
            currentProfileRef.current.workoutsLoggedCount ?? 0
          ),
          consistencyStreak: nextStreak,
          historicalPRs: evalResult.updatedPRs,
          lastSyncedAtMs: Date.now(),
        };
        currentProfileRef.current = updatedProfile;
        const nextAvail = availableCharactersRef.current.map((c) =>
          c.id === updatedProfile.id ? { ...c, ...updatedProfile } : c
        );
        availableCharactersRef.current = nextAvail;
        setAvailableCharacters(nextAvail);
      }

      persistBundleSnapshot({
        workoutHistory: nextHistory,
        characterProfile: currentProfileRef.current,
        availableCharacters: availableCharactersRef.current,
      });

      return { ok: true };
    },
    [addDropsToInventory, consistencyStreak, fatigueState, historicalPRs, persistBundleSnapshot, stats, workoutMachine]
  );

  const proceedToHybridLootReview = useCallback(() => {
    setWorkoutMachine((prev) => transitionHybridWorkoutState(prev, { type: 'PROCEED_TO_LOOT' }));
  }, []);

  const openHybridLootChest = useCallback(() => {
    setWorkoutMachine((prev) => {
      if (prev.phase !== 'LootReview' || !prev.activeSession?.rewardPayload) return prev;
      if (prev.activeSession.rewardPayload.lootChest.opened) return prev;
      const drops = prev.activeSession.rewardPayload.lootChest.drops;
      addDropsToInventory(drops);
      triggerSensoryCue('CHEST_OPEN_REVEAL');
      return transitionHybridWorkoutState(prev, { type: 'OPEN_LOOT_CHEST' });
    });
  }, [addDropsToInventory]);

  const completeHybridReview = useCallback(() => {
    setWorkoutMachine((prev) => {
      if (
        prev.phase === 'LootReview' &&
        prev.activeSession?.rewardPayload &&
        !prev.activeSession.rewardPayload.lootChest.opened
      ) {
        addDropsToInventory(prev.activeSession.rewardPayload.lootChest.drops);
      }
      return transitionHybridWorkoutState(prev, { type: 'COMPLETE_REVIEW', nowMs: Date.now() });
    });
  }, [addDropsToInventory]);

  const abandonHybridSession = useCallback(() => {
    setArrivalBanner(null);
    setWorkoutMachine(createInitialHybridMachineState());
  }, []);

  const requestFocusOverride = useCallback((targetTab: string) => {
    setWorkoutMachine((prev) =>
      transitionHybridWorkoutState(prev, { type: 'REQUEST_FOCUS_OVERRIDE', targetTab })
    );
  }, []);

  const cancelFocusOverride = useCallback(() => {
    setWorkoutMachine((prev) =>
      transitionHybridWorkoutState(prev, { type: 'CANCEL_FOCUS_OVERRIDE' })
    );
  }, []);

  const confirmFocusOverride = useCallback(() => {
    setWorkoutMachine((prev) =>
      transitionHybridWorkoutState(prev, { type: 'CONFIRM_FOCUS_OVERRIDE' })
    );
  }, []);

  const simulateLayoffHours = useCallback((hoursAgo: number) => {
    const past = new Date(Date.now() - hoursAgo * 3600 * 1000);
    setFatigueState((prev) => ({
      ...prev,
      lastWorkoutAt: past,
      lastStrenuousWorkoutAt: past,
    }));
  }, []);

  const value: GameContextValue = {
    serverOnline,
    characterName,
    characterArtUri,
    setCharacterArtUri,
    overallLevel,
    adventurerRank,
    adventurerReputation,
    guildName,
    guildReputation,
    gold,
    location,
    activityState,
    stats,
    unlockedTalentRanks,
    aggregatedTalents,
    equipmentLoadout,
    equipmentBonuses,
    derivedCombatStats,
    fatigueState: projectedFatigue,
    nextWorkoutMultiplier,
    combatPenalties,
    exercises,
    customExercises,
    addCustomExercise,
    deleteCustomExercise,
    recentActivityIds,
    recordRecentActivity,
    exerciseGymPreferences,
    saveExerciseStickyNote,
    saveExerciseWeightUnit,
    saveExerciseBarWeightKg,
    defaultWeightUnit,
    setDefaultWeightUnit,
    warmupPresetCount,
    setWarmupPresetCount,
    historicalPRs,
    workoutsLoggedCount,
    consistencyStreak,
    resilienceShields,
    lastWorkoutResult,
    registeredGyms: REGISTERED_GYMS,
    workoutMachine,
    arrivalBanner,
    restNotificationArmed,
    notificationTapTick,
    lastHybridConsolidation,
    inventory,
    gatheringNodes: GATHERING_NODES,
    activeGathering,
    lastGatheringDrop,
    dungeons: DEFAULT_DUNGEON_CATALOG,
    starterDungeon: STARTER_DUNGEON,
    companionRoster: COMPANION_ROSTER,
    activeDungeonRun,
    raids,
    bounties,
    offlineDraft,
    updateOfflineDraft,
    resetOfflineDraft,
    queuedOfflineWorkouts,
    unsyncedServerCount: unsyncedServerPayloads.length,
    pendingWorkoutReceipts,
    consolidatedSpoils,
    unclaimedSpoilsCount,
    landingToastMessage,
    dismissLandingToast,
    completeOfflineWorkout,
    syncOfflineWorkouts,
    claimPendingSpoils,
    workoutHistory,
    recordWorkoutHistory,
    clearWorkoutHistory,
    pruneWorkoutHistory,
    restoreSampleWorkoutHistory,
    presets,
    savePreset,
    deletePreset,
    loadPresetIntoDraft,
    travelTo,
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
    requestFocusOverride,
    cancelFocusOverride,
    confirmFocusOverride,
    simulateLayoffHours,
    logManualWorkout,
    unlockTalentNode,
    toggleEquipItem,
    equipItemToSlot,
    unequipSlot,
    startGatheringTask,
    completeGatheringNow,
    syncGatheringTicks,
    startDungeonExpedition,
    resolveActiveDungeonNow,
    dismissCompletedDungeonReplay,
    lockDailyRaidStrike,
    resolveWeeklyRaidRewards,
    completeGuildBounty,
    authToken,
    currentUser,
    isAuthenticated,
    isLiveSyncConnected,
    gameMode,
    setGameMode,
    appearanceId,
    characters: availableCharacters,
    deletedCharacters,
    activeCharacterId,
    switchCharacter,
    createCharacter,
    updateCharacterAppearance,
    deleteCharacter,
    restoreCharacter,
    refreshCharacterSheet,
    login,
    register,
    logout,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return ctx;
}
