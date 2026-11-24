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
  CharacterCustomizationConfig,
  CharacterRace,
  CombatantCharacterInput,
  ConsolidatedSpoilsSummary,
  CoreStatBlock,
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
  MachineLoadMode,
  WarmupPresetCount,
  WeightUnit,
  convertDisplayWeightToKg,
  convertKgToDisplayWeight,
  formatCleanWeightNumber,
  normalizeGymId,
  resolveExerciseWeightUnit,
  upsertExerciseBarWeightKg,
  upsertExerciseMachineLoadMode,
  upsertExerciseStickyNote,
  upsertExerciseWeightUnit,
  adaptCustomizationForRaceChange,
  createDefaultCustomizationConfig,
  deriveCustomizationFromLegacyAppearance,
  normalizeCustomizationConfig,
  validateCustomizationConfig,
  ADVENTURER_COMPANY_AI_PRESETS,
  COMBAT_CONSUMABLE_BY_SLUG,
  COMBAT_CONSUMABLE_CATALOG,
  DEFAULT_GUILD_QUEST_CATALOG,
  GuildQuestDefinition,
  TurnBasedCombatAction,
  TurnBasedCombatState,
  TurnBasedPartyMemberInput,
  createTurnBasedEncounter,
  isGuildQuestUnlockedForRank,
  sanitizeActiveSkillLoadout,
  sanitizeBeltLoadout,
  validateCombatLoadout,
  AffixReforgeMode,
  CRAFTING_MATERIAL_BY_SLUG,
  TalentGoverningStat,
  calculateTraderSellValue,
  evaluateCraftRecipe,
  evaluateTraderPurchase,
  reforgeProceduralItemAffixes,
  resolveProgramSessionPreset,
  respecCharacterTalents,
  toUtcDayKey,
  upgradeProceduralItemTier,
} from '@goki/game-engine';
import {
  OfflineDraftCardioItem,
  OfflineDraftExerciseBlock,
  OfflineWorkoutDraft,
  PersistedCharacterProfile,
  PersistedOfflineBundle,
  QueuedOfflineGuildQuestRun,
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
  gokiWebSocket,
} from '../api';
import {
  buyTraderOfferApi,
  claimSoloExpeditionApi,
  completeGuildQuestRunApi,
  completeOnboardingApi,
  craftRecipeApi,
  fetchAdventurersGuildQuestsApi,
  reforgeGearApi,
  respecTalentsApi,
  saveCharacterCombatLoadoutApi,
  sellInventoryItemApi,
  startGuildQuestRunApi,
  syncOfflineGuildQuestRunsApi,
  upgradeGearApi,
} from '../api/apiClient';
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
  inventoryItemId?: string;
  isLocked?: boolean;
  slug: string;
  name: string;
  description?: string;
  rarity: LootDrop['rarity'];
  quantity: number;
  goldValue?: number;
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
  status: 'ACTIVE_WINDOW' | 'REPLAYING' | 'COMPLETED';
  replay: DungeonCombatReplayResult | null;
  goldShare?: number;
  spoilsClaimed?: boolean;
}

export interface RaidBossState {
  id: string;
  bossName: string;
  accessType: 'PUBLIC_WORLD' | 'GUILD_ONLY' | 'CLAN_ONLY';
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
  setGuildName: (name: string) => void;
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
    setId?: string;
    exerciseId: string;
    exerciseName?: string;
    reps: number;
    weightKg: number;
    rpe?: number | null;
    isWarmup?: boolean;
    setType?: SetType;
    supersetGroupId?: string | null;
    plannedRestSeconds?: number;
    customRestSeconds?: number;
    nextSetHint?: { exerciseId: string; exerciseName: string; weightKg: number; reps: number };
  }) => { ok: boolean; error?: string };
  unlogHybridSet: (setId: string) => { ok: boolean; error?: string };
  updateHybridSet: (params: {
    setId: string;
    exerciseId?: string;
    reps?: number;
    weightKg?: number;
    rpe?: number | null;
    isWarmup?: boolean;
    setType?: SetType;
    supersetGroupId?: string | null;
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
  consumeInventoryItem: (slug: string) => { ok: boolean; message: string };
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
  claimExpeditionSpoils: () => Promise<void>;
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
  race: CharacterRace;
  customizationConfig: CharacterCustomizationConfig;
  characters: PersistedCharacterProfile[];
  deletedCharacters: PersistedCharacterProfile[];
  activeCharacterId: string | null;
  switchCharacter: (characterId: string) => Promise<boolean>;
  createCharacter: (
    name: string,
    mode: 'STANDARD' | 'IRONMAN_VERIFIED',
    appearanceIdOrAvatar?: string,
    options?: { race?: CharacterRace; customizationConfig?: CharacterCustomizationConfig }
  ) => Promise<{ ok: boolean; error?: string }>;
  updateCharacterAppearance: (
    appearanceId: string,
    characterId?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  updateCharacterCustomization: (
    updates: {
      race?: CharacterRace;
      customizationConfig?: CharacterCustomizationConfig;
      appearanceId?: string;
      name?: string;
    },
    targetCharacterId?: string
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
  saveExerciseMachineLoadMode?: (params: {
    exerciseId: string;
    mode: MachineLoadMode;
    activeGymId?: string | null;
    activeGymName?: string | null;
  }) => void;
  defaultWeightUnit: WeightUnit;
  setDefaultWeightUnit: (unit: WeightUnit) => void;
  warmupPresetCount: WarmupPresetCount;
  setWarmupPresetCount: (count: WarmupPresetCount) => void;

  // Milestone 3: Combat Loadout, Adventurer's Guild Quests & Turn-Based Arena
  activeSkillLoadout: string[];
  beltLoadout: Array<string | null>;
  equipActiveSkillSlot: (
    slotIndex: number,
    skillId: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
  equipBeltConsumableSlot: (
    slotIndex: number,
    itemSlug: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
  guildQuests: readonly GuildQuestDefinition[];
  completedGuildQuestSlugs: string[];
  queuedOfflineGuildRuns: QueuedOfflineGuildQuestRun[];
  claimGuildFieldRations: () => { granted: number; message: string };
  startGuildQuestEncounter: (
    questSlug: string,
    companionIds?: string[]
  ) => {
    ok: boolean;
    error?: string;
    state?: TurnBasedCombatState;
    quest?: GuildQuestDefinition;
    serverRunId?: string | null;
  };
  completeGuildQuestEncounter: (params: {
    finalState: TurnBasedCombatState;
    companionIds: string[];
    serverRunId?: string | null;
  }) => Promise<{
    ok: boolean;
    syncedOnline: boolean;
    queuedOffline: boolean;
    goldAwarded: number;
    reputationAwarded: number;
    drops: LootDrop[];
    promotedToRank: AdventurerRank | null;
    error?: string;
  }>;
  syncOfflineGuildRuns: () => Promise<void>;

  // Milestone 4: Crafting, Reforging, Trader, Trainer, Programs & Guide FTUE
  activeProgramEnrollment: {
    programId: string;
    currentWeek: number;
    currentDayIndex: number;
  } | null;
  enrollInWorkoutProgram: (
    programId: string,
    weekNumber?: number,
    dayIndex?: number
  ) => void;
  guideOnboardingCompleted: boolean;
  completeGuideOnboarding: () => Promise<{ ok: boolean; welcomeGiftGranted?: boolean }>;
  dismissGuideOnboarding: () => void;
  craftItemRecipe: (
    recipeSlug: string,
    quantity?: number
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  upgradeInventoryGear: (
    itemSlugOrId: string
  ) => Promise<{ ok: boolean; newTier?: number; message?: string; error?: string }>;
  reforgeInventoryGear: (
    itemSlugOrId: string,
    mode?: AffixReforgeMode
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  buyTraderOffer: (
    offerId: string,
    quantity?: number,
    rotationDateKey?: string
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  sellInventoryItemToTrader: (
    itemSlugOrId: string,
    quantity?: number
  ) => Promise<{ ok: boolean; goldEarned?: number; message?: string; error?: string }>;
  respecCharacterTalentTrees: () => Promise<{
    ok: boolean;
    goldCost?: number;
    totalPointsRefunded?: number;
    error?: string;
  }>;
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
  sunleaf_healing_draught: {
    itemType: 'CONSUMABLE',
    description: 'Restores 35% of Max HP in tactical combat.',
  },
  astral_mana_tonic: {
    itemType: 'CONSUMABLE',
    description: 'Restores 40 Mana to fuel spellcraft and healing skills.',
  },
  vitality_elixir: {
    itemType: 'CONSUMABLE',
    description: 'Restorative alchemical draught brewed from Sunleaf herbs (+40 Stamina, +15% HP).',
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
  astral_dew_vial: {
    itemType: 'MATERIAL',
    description:
      CRAFTING_MATERIAL_BY_SLUG.astral_dew_vial?.description ??
      'Moonlit botanical essence harvested from Whisperwood blooms.',
  },
  arcane_reforge_dust: {
    itemType: 'MATERIAL',
    description:
      CRAFTING_MATERIAL_BY_SLUG.arcane_reforge_dust?.description ??
      'Alchemical reagent that unbinds and rerolls gear affixes.',
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

const STARTER_DUNGEON: DungeonDefinition = DEFAULT_DUNGEON_CATALOG[0]!;

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
  {
    slug: 'astral_glade_foraging',
    name: 'Forage Astral Glade',
    professionType: 'FORAGING',
    description: '2-hour botanical expedition harvesting Astral Dew Vials and Sunleaf Herbs.',
    durationSeconds: 7200,
    requiredStatType: 'ENDURANCE',
    requiredStatLevel: 2,
    inputMaterials: [],
    lootTable: [
      { itemSlug: 'astral_dew_vial', itemName: 'Astral Dew Vial', rarity: 'UNCOMMON', quantity: 2, weight: 65 },
      { itemSlug: 'sunleaf_herb_bundle', itemName: 'Sunleaf Herb Bundle', rarity: 'COMMON', quantity: 3, weight: 35 },
    ],
  },
  {
    slug: 'titanite_deep_mining',
    name: 'Mine Titanite Deep Vein',
    professionType: 'MINING',
    description: '2-hour deep excavation extracting Titanite Forge Embers and Rich Iron Ore.',
    durationSeconds: 7200,
    requiredStatType: 'STRENGTH',
    requiredStatLevel: 2,
    inputMaterials: [],
    lootTable: [
      { itemSlug: 'titanite_ember', itemName: 'Titanite Forge Ember', rarity: 'RARE', quantity: 1, weight: 50 },
      { itemSlug: 'iron_ore_cluster', itemName: 'Rich Iron Ore Cluster', rarity: 'COMMON', quantity: 4, weight: 50 },
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
    description: 'Log 1 workout to unlock the Iron Promotion Trial and advance to IRON Rank.',
    isRankUpTrial: true,
    requiredRank: 'COPPER',
    unlocksRank: 'IRON',
    goldReward: 250,
    reputationReward: 180,
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

function isValidCharacterRace(val: unknown): val is CharacterRace {
  return val === 'HUMAN' || val === 'ONI' || val === 'KITSUNE';
}

function resolveCharacterCustomization(
  char:
    | {
        race?: unknown;
        customizationConfig?: unknown;
        appearanceId?: string | null;
        avatarSpriteId?: string | null;
      }
    | null
    | undefined,
  existingLocal: PersistedCharacterProfile | null | undefined,
  fallbackAppearanceId: string
): { race: CharacterRace; customizationConfig: CharacterCustomizationConfig } {
  const hasIncomingConfig = Boolean(
    char?.customizationConfig && typeof char.customizationConfig === 'object'
  );
  const resolvedRace: CharacterRace =
    hasIncomingConfig && isValidCharacterRace(char?.race)
      ? char.race
      : isValidCharacterRace(existingLocal?.race)
      ? existingLocal.race
      : isValidCharacterRace(char?.race)
      ? char.race
      : deriveCustomizationFromLegacyAppearance(fallbackAppearanceId).race;

  const rawConfig = hasIncomingConfig
    ? char?.customizationConfig
    : (existingLocal?.customizationConfig ?? char?.customizationConfig ?? null);

  return {
    race: resolvedRace,
    customizationConfig: normalizeCustomizationConfig(
      rawConfig,
      resolvedRace,
      fallbackAppearanceId
    ),
  };
}

function toCoreStatBlock(
  s: PersistedCharacterProfile['stats'] | ReturnType<typeof createLevelOneStats> | undefined
): CoreStatBlock {
  return {
    strengthLevel: s?.STRENGTH?.level ?? 1,
    enduranceLevel: s?.ENDURANCE?.level ?? 1,
    agilityLevel: s?.AGILITY?.level ?? 1,
    dexLevel: s?.DEXTERITY?.level ?? 1,
    conLevel: s?.CONSTITUTION?.level ?? 1,
    wisLevel: s?.WISDOM?.level ?? 1,
    sprLevel: s?.SPIRIT?.level ?? 1,
  };
}

function createCleanInitialFatigueState(): FatigueStateSnapshot {
  return {
    isRestingInTavern: true,
    tavernEnteredAt: new Date(Date.now() - 12 * 3600 * 1000),
    lastStrenuousWorkoutAt: null,
    lastWorkoutAt: null,
    consecutiveHighIntensityDays: 0,
    lastHighIntensityDayKey: null,
    systemicFatigueStacks: 0,
    fatigueScore: 0,
    wellRestedMultiplier: 1.0,
    activeRecoveryBuffActive: false,
    activeRecoveryGrantedAt: null,
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
      inventoryItemId: typeof raw.id === 'string' ? raw.id : undefined,
      isLocked: Boolean(raw.isLocked),
      slug: meta.slug ?? slug,
      baseSlug: meta.baseSlug ?? slug,
      name: meta.name ?? itemObj?.name ?? knownMeta?.description ?? slug,
      description: itemObj?.description ?? knownMeta?.description,
      rarity: meta.rarity ?? itemObj?.rarity ?? 'COMMON',
      quantity: typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1,
      goldValue:
        typeof itemObj?.goldValue === 'number'
          ? itemObj.goldValue
          : typeof meta.goldValue === 'number'
            ? meta.goldValue
            : undefined,
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
  const authTokenRef = useRef<string | null>(null);
  authTokenRef.current = authToken;
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const isAuthenticated = Boolean(authToken && currentUser);
  const remoteCharacterIdRef = useRef<string | null>(null);
  const characterSwitchSeqRef = useRef(0);
  const [availableCharacters, setAvailableCharacters] = useState<PersistedCharacterProfile[]>([]);
  const availableCharactersRef = useRef<PersistedCharacterProfile[]>([]);
  availableCharactersRef.current = availableCharacters;

  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const activeCharacterIdRef = useRef<string | null>(null);
  activeCharacterIdRef.current = activeCharacterId;

  const [characterName, setCharacterName] = useState('Adventurer');
  const currentProfileRef = useRef<PersistedCharacterProfile | null>(null);
  const [gameMode, setGameMode] = useState<'STANDARD' | 'IRONMAN_VERIFIED'>('STANDARD');
  const [characterArtUri, setCharacterArtUri] = useState<string | null>(null);
  const [appearanceId, setAppearanceId] = useState<string>('oni_warlord');
  const [race, setRace] = useState<CharacterRace>('HUMAN');
  const raceRef = useRef<CharacterRace>('HUMAN');
  raceRef.current = race;
  const [customizationConfig, setCustomizationConfig] = useState<CharacterCustomizationConfig>(() =>
    createDefaultCustomizationConfig('HUMAN')
  );
  const customizationConfigRef = useRef<CharacterCustomizationConfig>(customizationConfig);
  customizationConfigRef.current = customizationConfig;
  const [deletedCharacters, setDeletedCharacters] = useState<PersistedCharacterProfile[]>([]);
  const deletedCharactersRef = useRef<PersistedCharacterProfile[]>([]);
  deletedCharactersRef.current = deletedCharacters;
  const locallyPermanentlyErasedIdsRef = useRef<Set<string>>(new Set<string>());
  const [adventurerRank, setAdventurerRank] = useState<AdventurerRank>('COPPER');
  const [adventurerReputation, setAdventurerReputation] = useState(0);
  const [guildName, setGuildName] = useState('Hearthstone Open-World Sanctum [HOME]');
  const [guildReputation, setGuildReputation] = useState(1450);
  const [gold, setGold] = useState(0);
  const [location, setLocation] = useState<GameLocation>('TAVERN');
  const [activityState, setActivityState] = useState<
    'IDLE' | 'RESTING_TAVERN' | 'GATHERING' | 'IN_DUNGEON'
  >('RESTING_TAVERN');

  const [stats, setStats] = useState(() => createLevelOneStats());

  const [unlockedTalentRanks, setUnlockedTalentRanks] = useState<Record<string, number>>({});

  const [fatigueState, setFatigueState] = useState<FatigueStateSnapshot>(() => ({
    isRestingInTavern: true,
    tavernEnteredAt: new Date(Date.now() - 12 * 3600 * 1000),
    lastStrenuousWorkoutAt: new Date(Date.now() - 36 * 3600 * 1000),
    lastWorkoutAt: new Date(Date.now() - 36 * 3600 * 1000),
    consecutiveHighIntensityDays: 0,
    lastHighIntensityDayKey: null,
    systemicFatigueStacks: 0,
    fatigueScore: 0,
    wellRestedMultiplier: 1.15,
    activeRecoveryBuffActive: false,
    activeRecoveryGrantedAt: null,
  }));

  const [historicalPRs, setHistoricalPRs] = useState<Record<string, HistoricalExercisePR>>({});

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
            name: 'Adventurer (You)',
            combatDamageDealt: 0,
            workoutEnergyDamage: 0,
            supportScore: 0,
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
        guildName: 'Iron Vanguard Gym Clan',
        maxHp: 600_000,
        currentHp: 245_000,
        endsAtMs,
        dailyAttackUsedToday: false,
        participants: [
          {
            characterId: 'player_hero',
            name: 'Adventurer (You)',
            combatDamageDealt: 0,
            workoutEnergyDamage: 0,
            supportScore: 0,
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
  const activeGatheringRef = useRef<ActiveGatheringState | null>(activeGathering);
  activeGatheringRef.current = activeGathering;
  const gatheringLockRef = useRef(false);
  const inFlightTalentUnlockRef = useRef(false);
  const bountyLockRef = useRef(false);
  const claimedBountyIdsRef = useRef<Set<string>>(new Set());
  const bountiesRef = useRef(bounties);
  bountiesRef.current = bounties;
  const activityStateRef = useRef(activityState);
  activityStateRef.current = activityState;
  const adventurerRankRef = useRef(adventurerRank);
  adventurerRankRef.current = adventurerRank;
  const adventurerReputationRef = useRef(adventurerReputation);
  adventurerReputationRef.current = adventurerReputation;
  const workoutMachineRef = useRef(workoutMachine);
  workoutMachineRef.current = workoutMachine;
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

  const [activeSkillLoadout, setActiveSkillLoadout] = useState<string[]>([]);
  const activeSkillLoadoutRef = useRef<string[]>(activeSkillLoadout);
  activeSkillLoadoutRef.current = activeSkillLoadout;
  const [beltLoadout, setBeltLoadout] = useState<Array<string | null>>([null, null, null, null]);
  const beltLoadoutRef = useRef<Array<string | null>>(beltLoadout);
  beltLoadoutRef.current = beltLoadout;
  const [guildQuests, setGuildQuests] = useState<readonly GuildQuestDefinition[]>(
    DEFAULT_GUILD_QUEST_CATALOG
  );
  const guildQuestsRef = useRef<readonly GuildQuestDefinition[]>(guildQuests);
  guildQuestsRef.current = guildQuests;
  const [completedGuildQuestSlugs, setCompletedGuildQuestSlugs] = useState<string[]>([]);
  const completedGuildQuestSlugsRef = useRef<string[]>(completedGuildQuestSlugs);
  completedGuildQuestSlugsRef.current = completedGuildQuestSlugs;
  const [queuedOfflineGuildRuns, setQueuedOfflineGuildRuns] = useState<
    QueuedOfflineGuildQuestRun[]
  >([]);
  const queuedOfflineGuildRunsRef = useRef<QueuedOfflineGuildQuestRun[]>(queuedOfflineGuildRuns);
  queuedOfflineGuildRunsRef.current = queuedOfflineGuildRuns;
  const isSyncingGuildRunsRef = useRef(false);
  const pendingServerRunIdsRef = useRef<Record<string, string>>({});

  const [activeProgramEnrollment, setActiveProgramEnrollment] = useState<{
    programId: string;
    currentWeek: number;
    currentDayIndex: number;
  } | null>(null);
  const activeProgramEnrollmentRef = useRef<{
    programId: string;
    currentWeek: number;
    currentDayIndex: number;
  } | null>(activeProgramEnrollment);
  activeProgramEnrollmentRef.current = activeProgramEnrollment;

  const [guideOnboardingCompleted, setGuideOnboardingCompleted] = useState<boolean>(false);
  const guideOnboardingCompletedRef = useRef<boolean>(guideOnboardingCompleted);
  guideOnboardingCompletedRef.current = guideOnboardingCompleted;

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
      queuedOfflineGuildRuns:
        partial.queuedOfflineGuildRuns ?? queuedOfflineGuildRunsRef.current,
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

  const saveExerciseMachineLoadMode = useCallback(
    (params: {
      exerciseId: string;
      mode: MachineLoadMode;
      activeGymId?: string | null;
      activeGymName?: string | null;
    }) => {
      const next = upsertExerciseMachineLoadMode(exerciseGymPrefsRef.current, params);
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

      const scopedRemaining = filterWorkoutsForCharacter(nextHistory, activeCharacterIdRef.current);
      const rebuiltPRs = rebuildHistoricalPRsFromWorkouts(scopedRemaining);
      historicalPRsRef.current = rebuiltPRs;
      setHistoricalPRs(rebuiltPRs);

      // Wipe recent "quick" exercises memory alongside training history
      const nextRecentIds =
        filter.exerciseId && filter.exerciseId !== 'ALL'
          ? recentActivityIdsRef.current.filter((id) => id !== filter.exerciseId)
          : [];
      recentActivityIdsRef.current = nextRecentIds;
      setRecentActivityIds(nextRecentIds);

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
        recentActivityIds: nextRecentIds,
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
      if (Array.isArray(loaded.queuedOfflineGuildRuns) && loaded.queuedOfflineGuildRuns.length > 0) {
        queuedOfflineGuildRunsRef.current = loaded.queuedOfflineGuildRuns;
        setQueuedOfflineGuildRuns(loaded.queuedOfflineGuildRuns);
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
        const resolvedCustom = resolveCharacterCustomization(cp, null, apper);
        raceRef.current = resolvedCustom.race;
        setRace(resolvedCustom.race);
        customizationConfigRef.current = resolvedCustom.customizationConfig;
        setCustomizationConfig(resolvedCustom.customizationConfig);
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
        const hydratedActiveSkills = sanitizeActiveSkillLoadout(
          cp.activeSkillLoadout,
          hydratedTalents
        );
        activeSkillLoadoutRef.current = hydratedActiveSkills;
        setActiveSkillLoadout(hydratedActiveSkills);
        const hydratedBelt = sanitizeBeltLoadout(cp.beltLoadout);
        beltLoadoutRef.current = hydratedBelt;
        setBeltLoadout(hydratedBelt);
        const hydratedCompletedQuests = Array.isArray(cp.completedGuildQuestSlugs)
          ? cp.completedGuildQuestSlugs
          : [];
        completedGuildQuestSlugsRef.current = hydratedCompletedQuests;
        setCompletedGuildQuestSlugs(hydratedCompletedQuests);
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
        const hydratedBounties = buildBountiesForCharacter(hydratedRank, cp.completedBountySlugs ?? []);
        bountiesRef.current = hydratedBounties;
        claimedBountyIdsRef.current = new Set(
          hydratedBounties.filter((b) => b.completed).map((b) => b.slug)
        );
        setBounties(hydratedBounties);
        if (typeof cp.consistencyStreak === 'number') {
          consistencyStreakRef.current = cp.consistencyStreak;
          setConsistencyStreak(cp.consistencyStreak);
        }
        if (cp.historicalPRs && typeof cp.historicalPRs === 'object') {
          historicalPRsRef.current = cp.historicalPRs;
          setHistoricalPRs(cp.historicalPRs);
        }
        const hydratedOnboarding = Boolean(cp.guideOnboardingCompleted);
        guideOnboardingCompletedRef.current = hydratedOnboarding;
        setGuideOnboardingCompleted(hydratedOnboarding);
        const hydratedEnrollment =
          cp.activeProgramEnrollment && typeof cp.activeProgramEnrollment === 'object'
            ? cp.activeProgramEnrollment
            : null;
        activeProgramEnrollmentRef.current = hydratedEnrollment;
        setActiveProgramEnrollment(hydratedEnrollment);
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

  const hasPendingUnsyncedForCharacter = (charId: string | null | undefined) => {
    if (!charId) return false;
    const isActiveChar = activeCharacterIdRef.current === charId;
    const matchesItem = (itemCharId?: string | null) =>
      itemCharId === charId ||
      (isActiveChar && (!itemCharId || itemCharId === DEFAULT_LOCAL_CHARACTER_ID));
    return (
      unsyncedServerRef.current.some((item) => matchesItem(item.characterId)) ||
      queuedOfflineRef.current.some((item) => matchesItem(item.characterId))
    );
  };

  const mergeStatsPreservingHigherLocal = (
    incoming: ReturnType<typeof createLevelOneStats>,
    local?: PersistedCharacterProfile['stats'] | null
  ) => {
    if (!local) return incoming;
    const pickStat = (
      inc: { level: number; xp: number; pointsAvailable: number },
      loc?: { level: number; xp: number; pointsAvailable: number }
    ) => {
      if (!loc) return inc;
      if (loc.level > inc.level || (loc.level === inc.level && loc.xp > inc.xp)) {
        return {
          level: loc.level,
          xp: loc.xp,
          pointsAvailable: Math.max(loc.pointsAvailable, inc.pointsAvailable),
        };
      }
      return inc;
    };
    return {
      STRENGTH: pickStat(incoming.STRENGTH, local.STRENGTH),
      ENDURANCE: pickStat(incoming.ENDURANCE, local.ENDURANCE),
      AGILITY: pickStat(incoming.AGILITY, local.AGILITY),
      DEXTERITY: pickStat(incoming.DEXTERITY, local.DEXTERITY),
      CONSTITUTION: pickStat(incoming.CONSTITUTION, local.CONSTITUTION),
      WISDOM: pickStat(incoming.WISDOM, local.WISDOM),
      SPIRIT: pickStat(incoming.SPIRIT, local.SPIRIT),
    };
  };

  const applyCharacterToState = useCallback(
    (char: any, fullSheet?: any) => {
      if (!char) return;
      const prevActiveId = activeCharacterIdRef.current;
      const isSwitchingCharacter = Boolean(prevActiveId && prevActiveId !== char.id);
      const hasPendingWorkouts = hasPendingUnsyncedForCharacter(char.id);
      const existingLocal =
        availableCharactersRef.current.find((loc) => loc.id === char.id) ||
        (currentProfileRef.current?.id === char.id ? currentProfileRef.current : null);

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

      const baseLocalGold =
        !isSwitchingCharacter
          ? goldRef.current
          : typeof existingLocal?.gold === 'number'
            ? existingLocal.gold
            : 0;
      const resolvedGold =
        typeof char.gold === 'number'
          ? hasPendingWorkouts
            ? Math.max(baseLocalGold, char.gold)
            : char.gold
          : baseLocalGold || 100;
      setGold(resolvedGold);
      goldRef.current = resolvedGold;

      if (isSwitchingCharacter) {
        setActiveDungeonRun(null);
        activeDungeonRunRef.current = null;
        setActiveGathering(null);
        activeGatheringRef.current = null;
        gatheringLockRef.current = false;
        inFlightTalentUnlockRef.current = false;
        bountyLockRef.current = false;
        claimedBountyIdsRef.current.clear();
        cancelGatheringTargetNotification().catch(() => {});
        cancelStaminaRechargedNotification().catch(() => {});
        setLastWorkoutResult(null);
        setLastHybridConsolidation(null);
        setResilienceShields(0);
        const rawActivity =
          fullSheet?.character?.activityState ?? char.activityState ?? 'IDLE';
        const resolvedActivity: 'IDLE' | 'RESTING_TAVERN' | 'GATHERING' | 'IN_DUNGEON' =
          rawActivity === 'IN_DUNGEON' || rawActivity === 'GATHERING'
            ? 'IDLE'
            : rawActivity === 'RESTING_TAVERN'
              ? 'RESTING_TAVERN'
              : 'IDLE';
        activityStateRef.current = resolvedActivity;
        setActivityState(resolvedActivity);
        const rawLoc =
          fullSheet?.character?.currentLocation ?? char.currentLocation ?? 'TAVERN';
        const resolvedLoc: GameLocation =
          rawLoc === 'DUNGEON' || rawLoc === 'GATHERING_NODE'
            ? 'TAVERN'
            : (rawLoc as GameLocation);
        setLocation(resolvedLoc);
      }

      const extractedStats = extractNormalizedStats(char, fullSheet);
      const nextStats = hasPendingWorkouts
        ? mergeStatsPreservingHigherLocal(
            extractedStats,
            !isSwitchingCharacter ? statsRef.current : existingLocal?.stats
          )
        : extractedStats;
      statsRef.current = nextStats;
      setStats(nextStats);

      const rawFatigue = fullSheet?.character?.fatigueState ?? char.fatigueState;
      if (rawFatigue) {
        const nextFatigue: FatigueStateSnapshot = {
          isRestingInTavern: Boolean(rawFatigue.isRestingInTavern),
          tavernEnteredAt: rawFatigue.tavernEnteredAt ? new Date(rawFatigue.tavernEnteredAt) : null,
          lastStrenuousWorkoutAt: rawFatigue.lastStrenuousWorkoutAt ? new Date(rawFatigue.lastStrenuousWorkoutAt) : null,
          lastWorkoutAt: rawFatigue.lastWorkoutAt ? new Date(rawFatigue.lastWorkoutAt) : null,
          consecutiveHighIntensityDays: rawFatigue.consecutiveHighIntensityDays ?? 0,
          lastHighIntensityDayKey: rawFatigue.lastHighIntensityDayKey ?? null,
          systemicFatigueStacks: rawFatigue.systemicFatigueStacks ?? 0,
          fatigueScore: rawFatigue.fatigueScore ?? 0,
          wellRestedMultiplier: rawFatigue.wellRestedMultiplier ?? 1.0,
          activeRecoveryBuffActive: Boolean(rawFatigue.activeRecoveryBuffActive),
          activeRecoveryGrantedAt: rawFatigue.activeRecoveryGrantedAt ? new Date(rawFatigue.activeRecoveryGrantedAt) : null,
        };
        fatigueStateRef.current = nextFatigue;
        setFatigueState(nextFatigue);
      } else if (isSwitchingCharacter) {
        const cleanFatigue = createCleanInitialFatigueState();
        fatigueStateRef.current = cleanFatigue;
        setFatigueState(cleanFatigue);
      }

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
      const nextCharBounties = buildBountiesForCharacter(resolvedRank, resolvedCompletedBounties);
      bountiesRef.current = nextCharBounties;
      claimedBountyIdsRef.current = new Set(resolvedCompletedBounties);
      setBounties(nextCharBounties);

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

      const rawServerSkills =
        fullSheet?.character?.activeSkillLoadout ??
        fullSheet?.character?.combatLoadout?.activeSkillIds ??
        char.activeSkillLoadout ??
        char.combatLoadout?.activeSkillIds;
      const resolvedActiveSkills = sanitizeActiveSkillLoadout(
        Array.isArray(rawServerSkills) && rawServerSkills.length > 0
          ? rawServerSkills
          : (existingLocal?.activeSkillLoadout ?? rawServerSkills),
        resolvedUnlockedTalents
      );
      activeSkillLoadoutRef.current = resolvedActiveSkills;
      setActiveSkillLoadout(resolvedActiveSkills);

      const rawServerBelt =
        fullSheet?.character?.beltLoadout ??
        fullSheet?.character?.combatLoadout?.beltConsumables ??
        char.beltLoadout ??
        char.combatLoadout?.beltConsumables;
      const hasServerBeltItem =
        Array.isArray(rawServerBelt) && rawServerBelt.some((v) => typeof v === 'string' && v.length > 0);
      const resolvedBeltLoadout = sanitizeBeltLoadout(
        hasServerBeltItem
          ? rawServerBelt
          : (existingLocal?.beltLoadout ?? rawServerBelt)
      );
      beltLoadoutRef.current = resolvedBeltLoadout;
      setBeltLoadout(resolvedBeltLoadout);

      const completedQuestSet = new Set<string>([
        ...(Array.isArray(existingLocal?.completedGuildQuestSlugs)
          ? existingLocal.completedGuildQuestSlugs
          : []),
        ...(Array.isArray(char.completedGuildQuestSlugs) ? char.completedGuildQuestSlugs : []),
        ...(Array.isArray(fullSheet?.character?.completedGuildQuestSlugs)
          ? fullSheet.character.completedGuildQuestSlugs
          : []),
      ]);
      const resolvedCompletedQuests = Array.from(completedQuestSet);
      completedGuildQuestSlugsRef.current = resolvedCompletedQuests;
      setCompletedGuildQuestSlugs(resolvedCompletedQuests);

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

      const serverMappedItems = mapServerInventoryItems(
        fullSheet?.character?.inventoryItems ?? char.inventoryItems
      );
      let resolvedInventory: InventoryEntry[] = [];
      if (Array.isArray(char.inventory) && char.inventory.length > 0) {
        resolvedInventory = char.inventory;
      } else if (Array.isArray(existingLocal?.inventory) && existingLocal.inventory.length > 0) {
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

      const resolvedCustom = resolveCharacterCustomization(
        char,
        existingLocal,
        resolvedAppearance
      );
      raceRef.current = resolvedCustom.race;
      setRace(resolvedCustom.race);
      customizationConfigRef.current = resolvedCustom.customizationConfig;
      setCustomizationConfig(resolvedCustom.customizationConfig);

      const resolvedOnboarding = Boolean(
        fullSheet?.character?.guideOnboardingCompleted ??
          char.guideOnboardingCompleted ??
          existingLocal?.guideOnboardingCompleted
      );
      guideOnboardingCompletedRef.current = resolvedOnboarding;
      setGuideOnboardingCompleted(resolvedOnboarding);

      const resolvedProgramEnrollment =
        char.activeProgramEnrollment ??
        existingLocal?.activeProgramEnrollment ??
        null;
      activeProgramEnrollmentRef.current = resolvedProgramEnrollment;
      setActiveProgramEnrollment(resolvedProgramEnrollment);

      const charProfile: PersistedCharacterProfile = {
        id: char.id,
        name: char.name,
        gameMode: mode,
        appearanceId: resolvedAppearance,
        avatarSpriteId: resolvedAppearance,
        race: resolvedCustom.race,
        customizationConfig: resolvedCustom.customizationConfig,
        overallLevel: char.overallLevel ?? 1,
        adventurerRank: resolvedRank,
        adventurerReputation: resolvedRep,
        gold: resolvedGold,
        stats: nextStats,
        inventory: resolvedInventory,
        unlockedTalentRanks: resolvedUnlockedTalents,
        activeSkillLoadout: resolvedActiveSkills,
        beltLoadout: resolvedBeltLoadout,
        completedGuildQuestSlugs: resolvedCompletedQuests,
        equipmentLoadout: resolvedEquipmentLoadout,
        workoutsLoggedCount: effectiveWorkoutsCount,
        completedBountySlugs: resolvedCompletedBounties,
        consistencyStreak: resolvedStreak,
        historicalPRs: resolvedPRs,
        guideOnboardingCompleted: resolvedOnboarding,
        activeProgramEnrollment: resolvedProgramEnrollment,
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
    activeSkillLoadoutRef.current = [];
    setActiveSkillLoadout([]);
    const emptyBelt: Array<string | null> = [null, null, null, null];
    beltLoadoutRef.current = emptyBelt;
    setBeltLoadout(emptyBelt);
    completedGuildQuestSlugsRef.current = [];
    setCompletedGuildQuestSlugs([]);
    const freshStats = createLevelOneStats();
    statsRef.current = freshStats;
    setStats(freshStats);
    goldRef.current = 0;
    setGold(0);
    setRemoteCharacterWorkoutsCount(0);
    adventurerRankRef.current = 'COPPER';
    setAdventurerRank('COPPER');
    adventurerReputationRef.current = 0;
    setAdventurerReputation(0);
    const freshBounties = buildBountiesForCharacter('COPPER', []);
    bountiesRef.current = freshBounties;
    setBounties(freshBounties);
    claimedBountyIdsRef.current.clear();
    bountyLockRef.current = false;
    inFlightTalentUnlockRef.current = false;
    consistencyStreakRef.current = 0;
    setConsistencyStreak(0);
    historicalPRsRef.current = {};
    setHistoricalPRs({});
    setResilienceShields(0);
    const cleanFatigue = createCleanInitialFatigueState();
    fatigueStateRef.current = cleanFatigue;
    setFatigueState(cleanFatigue);
    activityStateRef.current = 'IDLE';
    setActivityState('IDLE');
    setLocation('TAVERN');
    setActiveDungeonRun(null);
    activeDungeonRunRef.current = null;
    setActiveGathering(null);
    activeGatheringRef.current = null;
    gatheringLockRef.current = false;
    cancelGatheringTargetNotification().catch(() => {});
    cancelStaminaRechargedNotification().catch(() => {});
    setLastWorkoutResult(null);
    setLastHybridConsolidation(null);
    raceRef.current = 'HUMAN';
    setRace('HUMAN');
    const resetCustom = createDefaultCustomizationConfig('HUMAN');
    customizationConfigRef.current = resetCustom;
    setCustomizationConfig(resetCustom);
    guideOnboardingCompletedRef.current = false;
    setGuideOnboardingCompleted(false);
    activeProgramEnrollmentRef.current = null;
    setActiveProgramEnrollment(null);
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

        const serverInventoryItems = mapServerInventoryItems(c.inventoryItems) ?? [];
        const baseLocalInventory: InventoryEntry[] =
          Array.isArray(localChar?.inventory) && localChar.inventory.length > 0
            ? localChar.inventory
            : Array.isArray(c.inventory) && c.inventory.length > 0
              ? c.inventory
              : serverInventoryItems;
        let resolvedCharInventory: InventoryEntry[] = baseLocalInventory;
        if (serverInventoryItems.length > 0 && resolvedCharInventory !== serverInventoryItems) {
          const existingSlugs = new Set(resolvedCharInventory.map((i) => i.slug));
          for (const srvItem of serverInventoryItems) {
            if (!existingSlugs.has(srvItem.slug)) {
              resolvedCharInventory = [...resolvedCharInventory, srvItem];
              existingSlugs.add(srvItem.slug);
            }
          }
        }

        const resolvedCharLoadout: EquipmentLoadoutMap =
          sanitizeEquipmentLoadout(localChar?.equipmentLoadout) ??
          sanitizeEquipmentLoadout(c.equipmentLoadout) ?? { ...EMPTY_EQUIPMENT_LOADOUT };

        const charHasPending = hasPendingUnsyncedForCharacter(c.id);
        const extractedCharStats = extractNormalizedStats(c);
        const resolvedCharStats = charHasPending
          ? mergeStatsPreservingHigherLocal(extractedCharStats, localChar?.stats)
          : extractedCharStats;
        const resolvedCharGold =
          charHasPending && typeof localChar?.gold === 'number'
            ? Math.max(localChar.gold, c.gold ?? 100)
            : c.gold ?? 100;

        const resolvedCustom = resolveCharacterCustomization(
          c,
          localChar,
          effectiveAppearance
        );

        return {
          id: c.id,
          name: c.name,
          gameMode: c.gameMode,
          appearanceId: effectiveAppearance,
          avatarSpriteId: effectiveAppearance,
          race: resolvedCustom.race,
          customizationConfig: resolvedCustom.customizationConfig,
          deletedAt: null,
          overallLevel: c.overallLevel ?? 1,
          adventurerRank: c.adventurerRank || 'COPPER',
          adventurerReputation: c.adventurerReputation ?? 0,
          gold: resolvedCharGold,
          stats: resolvedCharStats,
          inventory: resolvedCharInventory,
          unlockedTalentRanks: localChar?.unlockedTalentRanks ?? c.unlockedTalentRanks ?? {},
          activeSkillLoadout: sanitizeActiveSkillLoadout(
            localChar?.activeSkillLoadout ?? c.activeSkillLoadout ?? c.combatLoadout?.activeSkillIds,
            localChar?.unlockedTalentRanks ?? c.unlockedTalentRanks ?? {}
          ),
          beltLoadout: sanitizeBeltLoadout(
            localChar?.beltLoadout ?? c.beltLoadout ?? c.combatLoadout?.beltConsumables
          ),
          completedGuildQuestSlugs: Array.from(
            new Set([
              ...(Array.isArray(localChar?.completedGuildQuestSlugs)
                ? localChar.completedGuildQuestSlugs
                : []),
              ...(Array.isArray(c.completedGuildQuestSlugs) ? c.completedGuildQuestSlugs : []),
            ])
          ),
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
        const targetId = targetChar.id;
        const seq = characterSwitchSeqRef.current;
        void fetchCharacterSheet(targetId).then((res) => {
          if (
            res.ok &&
            res.data &&
            seq === characterSwitchSeqRef.current &&
            activeCharacterIdRef.current === targetId &&
            !locallyPermanentlyErasedIdsRef.current.has(targetId) &&
            !deletedCharactersRef.current.some((d) => d.id === targetId)
          ) {
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
      if (
        isIntraWorkoutFocusLocked(workoutMachineRef.current.phase) ||
        workoutMachineRef.current.activeSession !== null
      ) {
        return false;
      }
      const target = availableCharactersRef.current.find((c) => c.id === characterId);
      if (!target) return false;
      if (activeCharacterIdRef.current && activeCharacterIdRef.current !== characterId) {
        const freshDraft = createDefaultOfflineDraft();
        offlineDraftRef.current = freshDraft;
        setOfflineDraft(freshDraft);
      }
      characterSwitchSeqRef.current += 1;
      const seq = characterSwitchSeqRef.current;
      applyCharacterToState(target);

      if (serverOnline) {
        void fetchCharacterSheet(characterId).then((res) => {
          if (
            res.ok &&
            res.data &&
            seq === characterSwitchSeqRef.current &&
            activeCharacterIdRef.current === characterId &&
            !locallyPermanentlyErasedIdsRef.current.has(characterId) &&
            !deletedCharactersRef.current.some((d) => d.id === characterId)
          ) {
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
      appearanceIdOrAvatar?: string,
      options?: { race?: CharacterRace; customizationConfig?: CharacterCustomizationConfig }
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
      const legacyDerived = deriveCustomizationFromLegacyAppearance(chosenAppearance);
      const chosenRace: CharacterRace = options?.race ?? legacyDerived.race;
      const chosenConfig: CharacterCustomizationConfig =
        options?.customizationConfig ??
        (options?.race ? createDefaultCustomizationConfig(chosenRace) : legacyDerived.config);

      const check = validateCustomizationConfig({
        race: chosenRace,
        config: chosenConfig,
        stats: {
          strengthLevel: 1,
          enduranceLevel: 1,
          agilityLevel: 1,
          dexLevel: 1,
          conLevel: 1,
          wisLevel: 1,
          sprLevel: 1,
        },
      });
      if (!check.valid || !check.normalizedConfig) {
        return { ok: false, error: check.errors[0] ?? 'Invalid starting customization.' };
      }

      characterSwitchSeqRef.current += 1;

      if (serverOnline) {
        try {
          const res = await createCharacterAccount({
            name,
            gameMode: mode,
            appearanceId: chosenAppearance,
            avatarSpriteId: chosenAppearance,
            race: chosenRace,
            customizationConfig: check.normalizedConfig,
          });
          if (res.ok && res.data?.character) {
            const newChar = {
              ...res.data.character,
              race: isValidCharacterRace(res.data.character.race)
                ? res.data.character.race
                : chosenRace,
              customizationConfig:
                res.data.character.customizationConfig ?? check.normalizedConfig,
              inventory: [],
              equipmentLoadout: { ...EMPTY_EQUIPMENT_LOADOUT },
              workoutsLoggedCount: 0,
              completedBountySlugs: [],
              consistencyStreak: 0,
              historicalPRs: {},
              unlockedTalentRanks: {},
              activeSkillLoadout: [],
              beltLoadout: [null, null, null, null],
              completedGuildQuestSlugs: [],
              guideOnboardingCompleted: Boolean(res.data.character.guideOnboardingCompleted),
              activeProgramEnrollment: null,
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
        race: chosenRace,
        customizationConfig: check.normalizedConfig,
        overallLevel: 1,
        adventurerRank: 'COPPER',
        adventurerReputation: 0,
        gold: 100,
        stats: createLevelOneStats(),
        inventory: [],
        equipmentLoadout: { ...EMPTY_EQUIPMENT_LOADOUT },
        unlockedTalentRanks: {},
        activeSkillLoadout: [],
        beltLoadout: [null, null, null, null],
        completedGuildQuestSlugs: [],
        workoutsLoggedCount: 0,
        completedBountySlugs: [],
        consistencyStreak: 0,
        historicalPRs: {},
        guideOnboardingCompleted: false,
        activeProgramEnrollment: null,
      };
      activeCharacterIdRef.current = localChar.id;
      const nextList = [...availableCharactersRef.current, localChar];
      syncRemoteCharacters(localChar, nextList);
      return { ok: true };
    },
    [serverOnline, syncRemoteCharacters]
  );

  const updateCharacterCustomization = useCallback(
    async (
      updates: {
        race?: CharacterRace;
        customizationConfig?: CharacterCustomizationConfig;
        appearanceId?: string;
        name?: string;
      },
      targetCharacterId?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      const targetId = targetCharacterId || activeCharacterIdRef.current;
      const targetChar = targetId
        ? availableCharactersRef.current.find((c) => c.id === targetId) ||
          (currentProfileRef.current?.id === targetId ? currentProfileRef.current : null)
        : null;
      const isTargetActive = !targetId || targetId === activeCharacterIdRef.current;

      const currentCharRace: CharacterRace = isValidCharacterRace(targetChar?.race)
        ? targetChar.race
        : isTargetActive
        ? raceRef.current
        : 'HUMAN';

      const currentCharConfig: CharacterCustomizationConfig = targetChar?.customizationConfig
        ? normalizeCustomizationConfig(
            targetChar.customizationConfig,
            currentCharRace,
            targetChar.appearanceId
          )
        : isTargetActive
        ? customizationConfigRef.current
        : createDefaultCustomizationConfig(currentCharRace);

      const coreStats = toCoreStatBlock(
        targetChar?.stats ?? (isTargetActive ? statsRef.current : undefined)
      );
      const nextRace: CharacterRace = updates.race ?? currentCharRace;
      const nextConfig: CharacterCustomizationConfig =
        updates.customizationConfig ??
        adaptCustomizationForRaceChange(currentCharConfig, nextRace);

      const check = validateCustomizationConfig({
        race: nextRace,
        config: nextConfig,
        stats: coreStats,
      });
      if (!check.valid || !check.normalizedConfig) {
        return {
          ok: false,
          error: check.errors[0] ?? 'Customization locked or invalid.',
        };
      }

      const finalConfig = check.normalizedConfig;

      if (serverOnline && targetId && !targetId.startsWith('local_')) {
        try {
          const res = await updateCharacterAccount(targetId, {
            race: nextRace,
            customizationConfig: finalConfig,
            ...(updates.appearanceId ? { appearanceId: updates.appearanceId } : {}),
            ...(updates.name ? { name: updates.name } : {}),
          });
          if (
            !res.ok &&
            (res.statusCode === 400 || res.statusCode === 403 || res.statusCode === 409)
          ) {
            return {
              ok: false,
              error: res.error ?? 'Server rejected customization update.',
            };
          }
        } catch (err: any) {
          console.warn(
            '[GameContext] Remote updateCharacterCustomization exception:',
            err.message
          );
        }
      }

      if (isTargetActive) {
        raceRef.current = nextRace;
        setRace(nextRace);
        customizationConfigRef.current = finalConfig;
        setCustomizationConfig(finalConfig);
        if (updates.appearanceId) setAppearanceId(updates.appearanceId);
        if (updates.name) setCharacterName(updates.name);
      }

      const nextList = targetId
        ? availableCharactersRef.current.map((c) =>
            c.id === targetId
              ? {
                  ...c,
                  race: nextRace,
                  customizationConfig: finalConfig,
                  ...(updates.appearanceId
                    ? {
                        appearanceId: updates.appearanceId,
                        avatarSpriteId: updates.appearanceId,
                      }
                    : {}),
                  ...(updates.name ? { name: updates.name } : {}),
                }
              : c
          )
        : availableCharactersRef.current;

      setAvailableCharacters(nextList);
      availableCharactersRef.current = nextList;

      if (currentProfileRef.current && (!targetId || currentProfileRef.current.id === targetId)) {
        currentProfileRef.current = {
          ...currentProfileRef.current,
          race: nextRace,
          customizationConfig: finalConfig,
          ...(updates.appearanceId
            ? {
                appearanceId: updates.appearanceId,
                avatarSpriteId: updates.appearanceId,
              }
            : {}),
          ...(updates.name ? { name: updates.name } : {}),
        };
      }

      persistBundleSnapshot({
        availableCharacters: nextList,
        characterProfile: currentProfileRef.current,
      });

      return { ok: true };
    },
    [persistBundleSnapshot, serverOnline]
  );

  const updateCharacterAppearance = useCallback(
    async (
      newAppearanceId: string,
      targetCharacterId?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      const targetId = targetCharacterId || activeCharacterIdRef.current;
      const derived = deriveCustomizationFromLegacyAppearance(newAppearanceId);
      const targetChar = targetId
        ? availableCharactersRef.current.find((c) => c.id === targetId) ||
          (currentProfileRef.current?.id === targetId ? currentProfileRef.current : null)
        : null;
      const isTargetActive = !targetId || targetId === activeCharacterIdRef.current;
      const baseMorphs = (
        targetChar?.customizationConfig ??
        (isTargetActive ? customizationConfigRef.current : derived.config)
      ).morphs;
      const adaptedCandidate = adaptCustomizationForRaceChange(
        {
          version: 1,
          identity: derived.config.identity,
          morphs: baseMorphs,
        },
        derived.race
      );
      const coreStats = toCoreStatBlock(
        targetChar?.stats ?? (isTargetActive ? statsRef.current : undefined)
      );
      const check = validateCustomizationConfig({
        race: derived.race,
        config: adaptedCandidate,
        stats: coreStats,
      });
      const resolvedConfig =
        check.valid && check.normalizedConfig ? check.normalizedConfig : derived.config;

      if (!targetId) {
        setAppearanceId(newAppearanceId);
        raceRef.current = derived.race;
        setRace(derived.race);
        customizationConfigRef.current = resolvedConfig;
        setCustomizationConfig(resolvedConfig);
        return { ok: true };
      }

      if (targetId === activeCharacterIdRef.current) {
        setAppearanceId(newAppearanceId);
        raceRef.current = derived.race;
        setRace(derived.race);
        customizationConfigRef.current = resolvedConfig;
        setCustomizationConfig(resolvedConfig);
      }

      const nextList = availableCharactersRef.current.map((c) =>
        c.id === targetId
          ? {
              ...c,
              appearanceId: newAppearanceId,
              avatarSpriteId: newAppearanceId,
              race: derived.race,
              customizationConfig: resolvedConfig,
            }
          : c
      );
      setAvailableCharacters(nextList);
      availableCharactersRef.current = nextList;

      if (currentProfileRef.current && currentProfileRef.current.id === targetId) {
        currentProfileRef.current = {
          ...currentProfileRef.current,
          appearanceId: newAppearanceId,
          avatarSpriteId: newAppearanceId,
          race: derived.race,
          customizationConfig: resolvedConfig,
        };
      }

      persistBundleSnapshot({
        availableCharacters: nextList,
        characterProfile: currentProfileRef.current,
      });

      if (serverOnline && !targetId.startsWith('local_')) {
        try {
          const res = await updateCharacterAccount(targetId, {
            appearanceId: newAppearanceId,
            race: derived.race,
            customizationConfig: resolvedConfig,
          });
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

      characterSwitchSeqRef.current += 1;

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
    characterSwitchSeqRef.current += 1;
    const seq = characterSwitchSeqRef.current;
    const res = await fetchCharacterSheet(charId);
    if (
      res.ok &&
      res.data &&
      seq === characterSwitchSeqRef.current &&
      activeCharacterIdRef.current === charId &&
      !locallyPermanentlyErasedIdsRef.current.has(charId) &&
      !deletedCharactersRef.current.some((d) => d.id === charId)
    ) {
      applyCharacterToState(res.data.character, res.data);
    }
  }, [applyCharacterToState, serverOnline]);

  const login = useCallback(
    async (credentials: LoginPayload) => {
      hasExplicitlyLoggedOutRef.current = false;
      const res = await loginAccount(credentials);
      if (res.ok && res.data) {
        authTokenRef.current = res.data.token;
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
        authTokenRef.current = res.data.token;
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
    characterSwitchSeqRef.current += 1;
    await logoutAccount();
    authTokenRef.current = null;
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

      // Restore existing authenticated JWT session if present on device
      const storedToken = await getStoredAuthToken();
      if (storedToken) {
        const sessionRes = await fetchCurrentSession();
        if (sessionRes.ok && sessionRes.data) {
          setAuthTokenState(storedToken);
          setCurrentUser(sessionRes.data.user);
          syncRemoteCharacters(
            sessionRes.data.character,
            sessionRes.data.characters,
            (sessionRes.data as any).deletedCharacters
          );
          return sessionRes.data.character?.id ?? null;
        }
      }

      return remoteCharacterIdRef.current ?? null;
    } catch {
      setServerOnline(false);
      return null;
    }
  }, [syncRemoteCharacters]);

  // Probe Backend Server Health & Restore Stored Session on launch
  useEffect(() => {
    void ensureRemoteCharacterBootstrapped();
  }, [ensureRemoteCharacterBootstrapped]);

  // Live WebSocket Synchronization & Multi-User State Binding
  const [isLiveSyncConnected, setIsLiveSyncConnected] = useState(false);

  useEffect(() => {
    return gokiWebSocket.onStatusChange((status) => {
      setIsLiveSyncConnected(status === 'connected');
    });
  }, []);

  useEffect(() => {
    void gokiWebSocket.setAuthToken(authToken);
    if (serverOnline) {
      void gokiWebSocket.connect();
    }
  }, [authToken, serverOnline]);

  useEffect(() => {
    // Listen for Real-Time Raid Boss HP drops and participant damage
    const unbindRaid = gokiWebSocket.on('RAID_HP_UPDATE', (event: any) => {
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
    const unbindDungeonJoin = gokiWebSocket.on('PARTY_MEMBER_JOINED', (event: any) => {
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
        const consumableMeta = COMBAT_CONSUMABLE_BY_SLUG[d.itemSlug];
        const meta = KNOWN_ITEM_METADATA[d.itemSlug] ?? (
          consumableMeta
            ? {
                itemType: 'CONSUMABLE' as const,
                description: consumableMeta.description,
              }
            : undefined
        );
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
        normalizeGymId(offlineDraftRef.current.gymId ?? arrivalBanner?.gymId) ?? 'open-world';
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

      const mappedCardioEntries: OfflineDraftCardioItem[] = (preset.blocks?.cardioSegments ?? []).map(
        (seg, cIdx) => {
          const exMeta = STARTER_EXERCISES.find((e) => e.id === seg.exerciseSlug);
          const durationSeconds = Math.max(
            60,
            Math.round((seg.targetDurationMinutes || 20) * 60)
          );
          return {
            id: seg.segmentId || `cardio_${nowMs}_${cIdx + 1}`,
            exerciseId: seg.exerciseSlug,
            exerciseName: seg.exerciseName ?? exMeta?.name ?? seg.activityType,
            activityType: seg.activityType,
            workoutCategory: exMeta?.workoutCategory ?? preset.category,
            durationSeconds,
            averageHrZone: seg.targetHrZone ?? 2,
            rpe: seg.targetRpe ?? preset.blocks?.sessionRpeTarget ?? null,
          };
        }
      );

      if (mode === 'OFFLINE') {
        updateOfflineDraft((prev) => ({
          sessionId: `offline_${nowMs}`,
          startedAtMs: nowMs,
          gymId: prev.gymId ?? arrivalBanner?.gymId ?? null,
          gymName: prev.gymName ?? arrivalBanner?.gymName ?? null,
          category: preset.category,
          secondaryCategories: [],
          sourcePresetId: preset.id,
          sessionRpe: preset.blocks?.sessionRpeTarget ?? null,
          exerciseBlocks: blocks,
          cardioEntries: mappedCardioEntries,
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
   * evaluates queued payloads deterministically via `@goki/game-engine` so receipts are ready
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
        const resolveRemoteCharId = (itemCharId?: string | null, fallbackCharId?: string | null) => {
          if (itemCharId && !itemCharId.startsWith('local_') && itemCharId !== DEFAULT_LOCAL_CHARACTER_ID) {
            return itemCharId;
          }
          const activeId = activeCharacterIdRef.current;
          if (activeId && !activeId.startsWith('local_') && activeId !== DEFAULT_LOCAL_CHARACTER_ID) {
            return activeId;
          }
          const remId = remoteCharacterIdRef.current;
          if (remId && !remId.startsWith('local_') && remId !== DEFAULT_LOCAL_CHARACTER_ID) {
            return remId;
          }
          if (fallbackCharId && !fallbackCharId.startsWith('local_') && fallbackCharId !== DEFAULT_LOCAL_CHARACTER_ID) {
            return fallbackCharId;
          }
          return null;
        };

        const flushUnsyncedServerPayloads = async (fallbackCharId: string | null) => {
          if (unsyncedServerRef.current.length === 0) return;
          const snapshotToFlush = [...unsyncedServerRef.current];
          const processedUnsyncedKeys = new Set(
            snapshotToFlush.map((item) => item.queueId || item.sessionId)
          );
          const remainingUnsynced: QueuedOfflineWorkoutPayload[] = [];
          const token = authTokenRef.current ?? (await getStoredAuthToken());

          for (const item of snapshotToFlush) {
            if (
              item.characterId &&
              (locallyPermanentlyErasedIdsRef.current.has(item.characterId) ||
                deletedCharactersRef.current.some((d) => d.id === item.characterId))
            ) {
              continue;
            }
            const itemTargetCharId = resolveRemoteCharId(item.characterId, fallbackCharId);
            if (!itemTargetCharId) {
              remainingUnsynced.push(item);
              continue;
            }
            try {
              const dominantZone = item.cardioSegments[0]?.averageHrZone;
              const res = await fetchWithTimeout(
                `${API_BASE_URL}/api/characters/${itemTargetCharId}/workouts`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({
                    sessionId: item.sessionId,
                    performedAt: item.performedAtIso,
                    workoutType: item.workoutType,
                    workoutCategory: item.workoutCategory,
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
              if (res.status === 401 || res.status === 403 || res.status >= 500 || !res.ok) {
                remainingUnsynced.push(item);
              }
            } catch {
              remainingUnsynced.push(item);
            }
          }

          const appendedUnsyncedDuringFlush = unsyncedServerRef.current.filter(
            (u) => !processedUnsyncedKeys.has(u.queueId || u.sessionId)
          );
          const mergedUnsynced = [...remainingUnsynced, ...appendedUnsyncedDuringFlush];

          unsyncedServerRef.current = mergedUnsynced;
          setUnsyncedServerPayloads(mergedUnsynced);

          if (mergedUnsynced.length === 0) {
            const markedReceipts = pendingReceiptsRef.current.map((r) => ({
              ...r,
              syncedWithServer: true,
            }));
            pendingReceiptsRef.current = markedReceipts;
            setPendingWorkoutReceipts(markedReceipts);
          }

          persistBundleSnapshot({
            unsyncedServerPayloads: mergedUnsynced,
            pendingWorkoutReceipts: pendingReceiptsRef.current,
          });
        };

        // Pre-flush any unsyncedServerPayloads with a known remote characterId before pulling remote character sheets
        const initialToken = authTokenRef.current ?? (await getStoredAuthToken());
        const hasKnownRemoteId =
          resolveRemoteCharId(null, null) !== null ||
          unsyncedServerRef.current.some((u) => resolveRemoteCharId(u.characterId, null) !== null);
        if (initialToken && hasKnownRemoteId && unsyncedServerRef.current.length > 0) {
          await flushUnsyncedServerPayloads(resolveRemoteCharId(null, null));
        }

        const charId = await ensureRemoteCharacterBootstrapped();

        // 1. If server is online, flush any remaining locally-evaluated server sync items
        if (charId && unsyncedServerRef.current.length > 0) {
          await flushUnsyncedServerPayloads(charId);
        }

        if (queuedOfflineRef.current.length === 0) {
          return;
        }

        // Thread sequential state across 1..N queued offline workouts chronologically
        const orderedQueue = [...queuedOfflineRef.current].sort(
          (a, b) => new Date(a.performedAtIso).getTime() - new Date(b.performedAtIso).getTime()
        );

        const syncTargetLocalCharId = activeCharacterIdRef.current;

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
        const token = authTokenRef.current ?? (await getStoredAuthToken());

        for (const queued of orderedQueue) {
          // Drop queued RPG payloads belonging to deleted characters (the workout log itself is already preserved in workoutHistory)
          if (
            queued.characterId &&
            (locallyPermanentlyErasedIdsRef.current.has(queued.characterId) ||
              deletedCharactersRef.current.some((d) => d.id === queued.characterId))
          ) {
            continue;
          }

          // If this workout was completed on a different character than the target character for this sync run,
          // keep it queued for that character rather than applying its RPG progression to the current character
          if (
            queued.characterId &&
            syncTargetLocalCharId &&
            queued.characterId !== syncTargetLocalCharId &&
            queued.characterId !== DEFAULT_LOCAL_CHARACTER_ID
          ) {
            stillQueued.push(queued);
            continue;
          }

          const performedAt = new Date(queued.performedAtIso);
          const dominantZone = queued.cardioSegments[0]?.averageHrZone;
          let handledByServer = false;

          const itemCharId = queued.characterId;
          const itemTargetCharId =
            itemCharId && !itemCharId.startsWith('local_') && itemCharId !== DEFAULT_LOCAL_CHARACTER_ID
              ? itemCharId
              : activeCharacterIdRef.current &&
                  !activeCharacterIdRef.current.startsWith('local_') &&
                  activeCharacterIdRef.current !== DEFAULT_LOCAL_CHARACTER_ID
                ? activeCharacterIdRef.current
                : charId;

          if (serverReachableNow && itemTargetCharId) {
            try {
              const res = await fetchWithTimeout(
                `${API_BASE_URL}/api/characters/${itemTargetCharId}/workouts`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({
                    sessionId: queued.sessionId,
                    performedAt: queued.performedAtIso,
                    workoutType: queued.workoutType,
                    workoutCategory: queued.workoutCategory,
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
                    characterId: queued.characterId ?? syncTargetLocalCharId ?? itemTargetCharId,
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
          // Evaluate deterministically via @goki/game-engine so receipt chest opens seamlessly!
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

          const resolvedDeferredCharId =
            queued.characterId ?? syncTargetLocalCharId ?? itemTargetCharId ?? DEFAULT_LOCAL_CHARACTER_ID;

          newReceipts.push(
            buildWorkoutSpoilsReceipt({
              receiptId: `receipt_${queued.queueId}`,
              characterId: resolvedDeferredCharId,
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

          newlyDeferredForServer.push({
            ...queued,
            characterId: resolvedDeferredCharId,
          });
        }

        // Commit state updates silently (zero RPG popups!)
        if (newReceipts.length > 0) {
          const isStillOnTargetChar = activeCharacterIdRef.current === syncTargetLocalCharId;
          if (isStillOnTargetChar) {
            statsRef.current = runningStats;
            setStats(runningStats);
            fatigueStateRef.current = runningFatigue;
            setFatigueState(runningFatigue);
            historicalPRsRef.current = runningPRs;
            setHistoricalPRs(runningPRs);
            consistencyStreakRef.current = runningStreak;
            setConsistencyStreak(runningStreak);
            if (addedGold > 0) {
              const nextGold = goldRef.current + addedGold;
              goldRef.current = nextGold;
              setGold(nextGold);
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
          } else if (syncTargetLocalCharId) {
            // User switched characters mid-sync: update background character entry without corrupting active hero
            const charWorkoutCount = countWorkoutsForCharacter(
              workoutHistoryRef.current,
              syncTargetLocalCharId
            );
            const nextAvail = availableCharactersRef.current.map((c) => {
              if (c.id !== syncTargetLocalCharId) return c;
              return {
                ...c,
                stats: runningStats,
                gold: (c.gold ?? 0) + addedGold,
                workoutsLoggedCount: Math.max(charWorkoutCount, (c.workoutsLoggedCount ?? 0) + addedWorkouts),
                consistencyStreak: runningStreak,
                historicalPRs: runningPRs,
                lastSyncedAtMs: Date.now(),
              };
            });
            availableCharactersRef.current = nextAvail;
            setAvailableCharacters(nextAvail);
          }

          if (localDungeonBuffAccum.length > 0 && isStillOnTargetChar) {
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

        const processedQueueIds = new Set(orderedQueue.map((q) => q.queueId));
        const appendedDuringSync = queuedOfflineRef.current.filter(
          (q) => !processedQueueIds.has(q.queueId)
        );
        const updatedQueue = [...stillQueued, ...appendedDuringSync];
        const existingUnsyncedIds = new Set(
          unsyncedServerRef.current.map((u) => u.queueId || u.sessionId)
        );
        const dedupedNewDeferred = newlyDeferredForServer.filter(
          (u) => !existingUnsyncedIds.has(u.queueId || u.sessionId)
        );
        const updatedUnsynced = [...unsyncedServerRef.current, ...dedupedNewDeferred];
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

  const syncOfflineGuildRuns = useCallback(async () => {
    if (isSyncingGuildRunsRef.current) return;
    if (!authTokenRef.current) return;
    const queue = queuedOfflineGuildRunsRef.current;
    if (queue.length === 0) return;

    isSyncingGuildRunsRef.current = true;
    try {
      const grouped = new Map<string, QueuedOfflineGuildQuestRun[]>();
      const fallbackCharId =
        (remoteCharacterIdRef.current && !remoteCharacterIdRef.current.startsWith('local_')
          ? remoteCharacterIdRef.current
          : null) ??
        (activeCharacterIdRef.current && !activeCharacterIdRef.current.startsWith('local_')
          ? activeCharacterIdRef.current
          : null);
      for (const run of queue) {
        const targetCharId =
          run.characterId && !run.characterId.startsWith('local_')
            ? run.characterId
            : fallbackCharId;
        if (!targetCharId || targetCharId.startsWith('local_')) continue;
        const list = grouped.get(targetCharId) ?? [];
        list.push(run);
        grouped.set(targetCharId, list);
      }

      const clearedIds = new Set<string>();
      for (const [charId, runs] of grouped.entries()) {
        const res = await syncOfflineGuildQuestRunsApi({
          characterId: charId,
          completedRuns: runs,
        });
        if (res.ok) {
          setServerOnline(true);
          for (const r of runs) {
            clearedIds.add(r.clientRunId);
          }
        } else if (
          res.statusCode === 400 ||
          res.statusCode === 403 ||
          res.statusCode === 404
        ) {
          // Prune unrecoverable runs (e.g. from deleted heroes or invalid payloads)
          for (const r of runs) {
            clearedIds.add(r.clientRunId);
          }
        }
      }

      if (clearedIds.size > 0) {
        const remaining = queuedOfflineGuildRunsRef.current.filter(
          (r) => !clearedIds.has(r.clientRunId)
        );
        queuedOfflineGuildRunsRef.current = remaining;
        setQueuedOfflineGuildRuns(remaining);
        persistBundleSnapshot({ queuedOfflineGuildRuns: remaining });
      }
    } catch {
      // Retain queued runs for next connectivity cycle
    } finally {
      isSyncingGuildRunsRef.current = false;
    }
  }, [persistBundleSnapshot]);

  useEffect(() => {
    if (!serverOnline) return;
    void fetchAdventurersGuildQuestsApi().then((res) => {
      if (res.ok && Array.isArray(res.data?.quests) && res.data.quests.length > 0) {
        guildQuestsRef.current = res.data.quests;
        setGuildQuests(res.data.quests);
      }
    });
  }, [serverOnline]);

  // Trigger silent background sync after hydration & whenever connectivity / foreground resumes
  useEffect(() => {
    if (!offlineHydrated) return;
    if (queuedOfflineWorkouts.length > 0 || unsyncedServerPayloads.length > 0) {
      void syncOfflineWorkouts({ evaluateLocallyIfOffline: false });
    }
    if (queuedOfflineGuildRuns.length > 0) {
      void syncOfflineGuildRuns();
    }
    void diagnosticLogger.flushBugReportOutbox();
  }, [
    offlineHydrated,
    queuedOfflineWorkouts.length,
    unsyncedServerPayloads.length,
    queuedOfflineGuildRuns.length,
    syncOfflineWorkouts,
    syncOfflineGuildRuns,
  ]);

  useEffect(() => {
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void ensureRemoteCharacterBootstrapped();
        void syncOfflineWorkouts({ evaluateLocallyIfOffline: false });
        void syncOfflineGuildRuns();
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
        void syncOfflineGuildRuns();
        void diagnosticLogger.flushBugReportOutbox();
      };
      win.addEventListener?.('online', onOnline);
      removeWebOnline = () => win.removeEventListener?.('online', onOnline);
    }

    return () => {
      appSub.remove();
      removeWebOnline?.();
    };
  }, [ensureRemoteCharacterBootstrapped, syncOfflineWorkouts, syncOfflineGuildRuns]);

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
      if (queuedOfflineGuildRuns.length > 0) {
        void syncOfflineGuildRuns();
      }
    }, 25_000);
    return () => clearInterval(timer);
  }, [
    serverOnline,
    ensureRemoteCharacterBootstrapped,
    queuedOfflineWorkouts.length,
    unsyncedServerPayloads.length,
    queuedOfflineGuildRuns.length,
    syncOfflineWorkouts,
    syncOfflineGuildRuns,
  ]);

  const completeOfflineWorkout = useCallback(() => {
    const draft = offlineDraftRef.current;
    const completedSets: QueuedOfflineWorkoutPayload['sets'] = [];
    const resolvedGymId =
      normalizeGymId(draft.gymId ?? arrivalBanner?.gymId) ?? 'open-world';

    for (const block of draft.exerciseBlocks) {
      const exMeta = STARTER_EXERCISES.find((e) => e.id === block.exerciseId);
      const exName = exMeta?.name ?? block.exerciseId;
      const blockUnit =
        block.weightUnit ??
        resolveExerciseWeightUnit(
          exerciseGymPrefsRef.current,
          block.exerciseId,
          resolvedGymId,
          defaultWeightUnitRef.current
        );
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
      const blockUnit =
        block.weightUnit ??
        resolveExerciseWeightUnit(
          exerciseGymPrefsRef.current,
          block.exerciseId,
          resolvedGymId,
          defaultWeightUnitRef.current
        );
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
      if (gatheringLockRef.current) return;
      if (!activeGatheringRef.current || activeGatheringRef.current.taskId !== task.taskId) return;
      gatheringLockRef.current = true;
      try {
        const currentStats = statsRef.current;
        const currentOverallLevel = calculateOverallCharacterLevel({
          strengthLevel: currentStats.STRENGTH?.level ?? 1,
          enduranceLevel: currentStats.ENDURANCE?.level ?? 1,
          agilityLevel: currentStats.AGILITY?.level ?? 1,
          dexLevel: currentStats.DEXTERITY?.level ?? 1,
          conLevel: currentStats.CONSTITUTION?.level ?? 1,
          wisLevel: currentStats.WISDOM?.level ?? 1,
          sprLevel: currentStats.SPIRIT?.level ?? 1,
        });
        const tickCalc = calculateGatheringTick(
          {
            strengthLevel: currentStats.STRENGTH?.level ?? 1,
            enduranceLevel: currentStats.ENDURANCE?.level ?? 1,
            agilityLevel: currentStats.AGILITY?.level ?? 1,
          },
          currentOverallLevel,
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

        activeGatheringRef.current = null;
        setActiveGathering(null);
        setActivityState((curr) => {
          const next = curr === 'GATHERING' ? 'IDLE' : curr;
          activityStateRef.current = next;
          return next;
        });
        void cancelGatheringTargetNotification().catch(() => {});
      } finally {
        gatheringLockRef.current = false;
      }
    },
    [addDropsToInventory]
  );

  useEffect(() => {
    if (!activeGathering) return;
    const timer = setInterval(() => {
      const currentTask = activeGatheringRef.current;
      if (!currentTask || gatheringLockRef.current) return;
      const nowMs = Date.now();
      const currentStats = statsRef.current;
      const currentOverallLevel = calculateOverallCharacterLevel({
        strengthLevel: currentStats.STRENGTH?.level ?? 1,
        enduranceLevel: currentStats.ENDURANCE?.level ?? 1,
        agilityLevel: currentStats.AGILITY?.level ?? 1,
        dexLevel: currentStats.DEXTERITY?.level ?? 1,
        conLevel: currentStats.CONSTITUTION?.level ?? 1,
        wisLevel: currentStats.WISDOM?.level ?? 1,
        sprLevel: currentStats.SPIRIT?.level ?? 1,
      });
      const tickCalc = calculateGatheringTick(
        {
          strengthLevel: currentStats.STRENGTH?.level ?? 1,
          enduranceLevel: currentStats.ENDURANCE?.level ?? 1,
          agilityLevel: currentStats.AGILITY?.level ?? 1,
        },
        currentOverallLevel,
        currentTask.node.requiredStatLevel,
        currentTask.node.professionType
      );

      const elapsed = calculateElapsedGatheringTicks({
        startedAtMs: currentTask.startedAtMs,
        lastTickProcessedAtMs: currentTask.lastTickProcessedAtMs,
        currentTimeMs: nowMs,
        targetDurationMs: currentTask.targetDurationMs,
        tickIntervalMs: tickCalc.tickIntervalMs,
        yieldPerTick: tickCalc.yieldPerTick,
        xpPerTick: tickCalc.xpPerTick,
      });

      let updatedTask = currentTask;
      if (elapsed.elapsedTicks > 0) {
        const newDrops: LootDrop[] = [];
        for (let i = 1; i <= elapsed.elapsedTicks; i++) {
          const stepSeed = `gather:${currentTask.taskId}:${currentTask.accumulatedTicks + i}`;
          const rng = createSeededRng(stepSeed);
          const picked = rng.pickWeighted(currentTask.node.lootTable);
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

        updatedTask = {
          ...currentTask,
          lastTickProcessedAtMs: elapsed.newLastTickProcessedAtMs,
          accumulatedTicks: currentTask.accumulatedTicks + elapsed.elapsedTicks,
          accumulatedYield: currentTask.accumulatedYield + elapsed.newYieldAmount,
        };
        activeGatheringRef.current = updatedTask;
        setActiveGathering(updatedTask);
      }

      if (nowMs >= updatedTask.completesAtMs) {
        finalizeGatheringTask(updatedTask);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeGathering?.taskId, addDropsToInventory, finalizeGatheringTask]);

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

      const prevStats = statsRef.current;
      const strP = applyStatXpProgression(
        prevStats.STRENGTH.level,
        prevStats.STRENGTH.xp,
        evaluation.finalXpAwarded.STRENGTH
      );
      const endP = applyStatXpProgression(
        prevStats.ENDURANCE.level,
        prevStats.ENDURANCE.xp,
        evaluation.finalXpAwarded.ENDURANCE
      );
      const agiP = applyStatXpProgression(
        prevStats.AGILITY.level,
        prevStats.AGILITY.xp,
        evaluation.finalXpAwarded.AGILITY
      );
      const nextStats = {
        ...prevStats,
        STRENGTH: {
          level: strP.newLevel,
          xp: strP.remainingXp,
          pointsAvailable: prevStats.STRENGTH.pointsAvailable + strP.talentPointsEarned,
        },
        ENDURANCE: {
          level: endP.newLevel,
          xp: endP.remainingXp,
          pointsAvailable: prevStats.ENDURANCE.pointsAvailable + endP.talentPointsEarned,
        },
        AGILITY: {
          level: agiP.newLevel,
          xp: agiP.remainingXp,
          pointsAvailable: prevStats.AGILITY.pointsAvailable + agiP.talentPointsEarned,
        },
      };
      statsRef.current = nextStats;
      setStats(nextStats);

      const nextGold = goldRef.current;
      goldRef.current = nextGold;
      setGold(nextGold);

      if (evaluation.criticalTrainingBonus.guaranteedLootDrop) {
        addDropsToInventory([evaluation.criticalTrainingBonus.guaranteedLootDrop]);
      }

      if (currentProfileRef.current && currentProfileRef.current.id === ownerCharacterId) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          stats: nextStats,
          gold: nextGold,
          inventory: rawInventoryRef.current,
          workoutsLoggedCount: Math.max(
            nextCharWorkoutsCount,
            currentProfileRef.current.workoutsLoggedCount ?? 0
          ),
          historicalPRs: evaluation.updatedPRs,
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
      if (inFlightTalentUnlockRef.current) {
        return { ok: false, error: 'Talent unlock already in progress.' };
      }
      inFlightTalentUnlockRef.current = true;
      try {
        const currentStats = statsRef.current;
        const currentUnlocked = unlockedTalentRanksRef.current;
        const res = spendTalentPoint(
          {
            availablePoints: {
              STRENGTH: currentStats.STRENGTH?.pointsAvailable ?? 0,
              ENDURANCE: currentStats.ENDURANCE?.pointsAvailable ?? 0,
              AGILITY: currentStats.AGILITY?.pointsAvailable ?? 0,
              DEXTERITY: currentStats.DEXTERITY?.pointsAvailable ?? 0,
              CONSTITUTION: currentStats.CONSTITUTION?.pointsAvailable ?? 0,
              WISDOM: currentStats.WISDOM?.pointsAvailable ?? 0,
              SPIRIT: currentStats.SPIRIT?.pointsAvailable ?? 0,
            },
            unlockedNodeRanks: currentUnlocked,
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

        // Auto-add newly unlocked active skill if < 4 skills are currently equipped
        let nextActiveSkills = activeSkillLoadoutRef.current;
        let didAutoAddSkill = false;
        for (const tree of DEFAULT_TALENT_TREES) {
          const unlockedNode = tree.nodes.find((n) => n.id === nodeId);
          if (unlockedNode?.activeSkill?.skillId) {
            const newSkillId = unlockedNode.activeSkill.skillId;
            if (nextActiveSkills.length < 4 && !nextActiveSkills.includes(newSkillId)) {
              nextActiveSkills = sanitizeActiveSkillLoadout(
                [...nextActiveSkills, newSkillId],
                nextUnlocked
              );
              activeSkillLoadoutRef.current = nextActiveSkills;
              setActiveSkillLoadout(nextActiveSkills);
              didAutoAddSkill = true;
            }
            break;
          }
        }

        const nextStats = {
          ...currentStats,
          [res.governingStat]: {
            ...currentStats[res.governingStat],
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
            activeSkillLoadout: nextActiveSkills,
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
          if (didAutoAddSkill && isAuthenticated) {
            saveCharacterCombatLoadoutApi(remoteCharacterIdRef.current, {
              activeSkillIds: nextActiveSkills,
              beltConsumables: beltLoadoutRef.current,
            }).catch(() => {});
          }
        }

        return { ok: true };
      } finally {
        inFlightTalentUnlockRef.current = false;
      }
    },
    [isAuthenticated, persistBundleSnapshot, serverOnline]
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

  const consumeInventoryItem = useCallback(
    (slug: string): { ok: boolean; message: string } => {
      const idx = rawInventoryRef.current.findIndex((i) => i.slug === slug && i.quantity > 0);
      if (idx < 0) {
        return { ok: false, message: 'Item is no longer in your inventory.' };
      }
      const target = rawInventoryRef.current[idx]!;
      const meta = KNOWN_ITEM_METADATA[target.baseSlug ?? target.slug];
      const resolvedType = target.itemType ?? meta?.itemType;
      if (resolvedType && resolvedType !== 'CONSUMABLE') {
        return { ok: false, message: 'This item cannot be consumed.' };
      }

      const nextInventory = rawInventoryRef.current
        .map((item, i) => (i === idx ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0);

      rawInventoryRef.current = nextInventory;
      setRawInventory(nextInventory);

      setFatigueState((prev) => {
        const nextFatigue: FatigueStateSnapshot = {
          ...prev,
          systemicFatigueStacks: Math.max(0, prev.systemicFatigueStacks - 1),
          wellRestedMultiplier: Math.min(
            1.25,
            Number(((prev.wellRestedMultiplier || 1) + 0.05).toFixed(2))
          ),
        };
        fatigueStateRef.current = nextFatigue;
        return nextFatigue;
      });

      if (currentProfileRef.current) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          inventory: nextInventory,
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
      } else {
        persistBundleSnapshot({});
      }

      return {
        ok: true,
        message: `Consumed ${target.name}! Vitality replenished (-1 Systemic Fatigue).`,
      };
    },
    [persistBundleSnapshot]
  );

  const persistCurrentProfileUpdates = useCallback(
    (partialProfile: Partial<PersistedCharacterProfile>) => {
      if (currentProfileRef.current) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          ...partialProfile,
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
      } else {
        persistBundleSnapshot({});
      }
    },
    [persistBundleSnapshot]
  );

  const lootDropToInventoryEntry = useCallback((d: LootDrop): InventoryEntry => {
    const consumableMeta = COMBAT_CONSUMABLE_BY_SLUG[d.itemSlug];
    const baseLookup = d.baseSlug ?? d.itemSlug;
    const meta =
      KNOWN_ITEM_METADATA[baseLookup] ??
      KNOWN_ITEM_METADATA[d.itemSlug] ??
      (consumableMeta
        ? {
            itemType: 'CONSUMABLE' as const,
            description: consumableMeta.description,
          }
        : undefined);
    const isEquip =
      BASE_EQUIPPABLE_ITEM_BY_SLUG[baseLookup] !== undefined ||
      (meta?.itemType !== undefined && isEquippableItemType(meta.itemType));
    return {
      inventoryItemId: isEquip
        ? `local_item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        : undefined,
      isLocked: false,
      slug: d.itemSlug,
      baseSlug: d.baseSlug ?? d.itemSlug,
      name: d.itemName,
      description: meta?.description,
      rarity: d.rarity,
      quantity: d.quantity,
      itemType: meta?.itemType ?? 'MATERIAL',
      weaponHandedness: meta?.weaponHandedness,
      requiredStrength: meta?.requiredStrength,
      requiredEndurance: meta?.requiredEndurance,
      requiredAgility: meta?.requiredAgility,
      statBonuses: d.statBonuses ?? meta?.statBonuses,
      tier: d.tier,
      prefixId: d.prefixId ?? null,
      prefixLabel: d.prefixLabel ?? null,
      prefixSummary: d.prefixSummary,
      suffixId: d.suffixId ?? null,
      suffixLabel: d.suffixLabel ?? null,
      suffixSummary: d.suffixSummary,
      baseStatsSummary: d.baseStatsSummary,
      primaryStatBonuses: d.primaryStatBonuses,
      uniquePassive: d.uniquePassive,
    };
  }, []);

  const applyServerEconomySnapshot = useCallback(
    (data: any) => {
      const mapped = mapServerInventoryItems(data?.inventoryItems);
      let nextInv = rawInventoryRef.current;
      if (mapped) {
        nextInv = mapped;
        rawInventoryRef.current = mapped;
        setRawInventory(mapped);
      }
      let nextGold = goldRef.current;
      if (typeof data?.remainingGold === 'number') {
        nextGold = data.remainingGold;
        goldRef.current = nextGold;
        setGold(nextGold);
      } else if (typeof data?.gold === 'number') {
        nextGold = data.gold;
        goldRef.current = nextGold;
        setGold(nextGold);
      }
      let nextBelt = beltLoadoutRef.current;
      if (Array.isArray(data?.beltLoadout)) {
        nextBelt = [...data.beltLoadout, null, null, null, null]
          .slice(0, 4)
          .map((s) => (typeof s === 'string' && s.length > 0 ? s : null));
        beltLoadoutRef.current = nextBelt;
        setBeltLoadout(nextBelt);
      }
      persistCurrentProfileUpdates({
        inventory: nextInv,
        gold: nextGold,
        beltLoadout: nextBelt,
      });
    },
    [persistCurrentProfileUpdates]
  );

  const enrollInWorkoutProgram = useCallback(
    (programId: string, weekNumber = 1, dayIndex = 0) => {
      const resolved = resolveProgramSessionPreset(programId, weekNumber, dayIndex);
      if (!resolved) return;
      const enrollment = {
        programId,
        currentWeek: weekNumber,
        currentDayIndex: dayIndex,
      };
      activeProgramEnrollmentRef.current = enrollment;
      setActiveProgramEnrollment(enrollment);
      persistCurrentProfileUpdates({ activeProgramEnrollment: enrollment });
    },
    [persistCurrentProfileUpdates]
  );

  const completeGuideOnboarding = useCallback(async (): Promise<{
    ok: boolean;
    welcomeGiftGranted?: boolean;
  }> => {
    const alreadyCompleted = guideOnboardingCompletedRef.current;
    guideOnboardingCompletedRef.current = true;
    setGuideOnboardingCompleted(true);

    const remoteCharId = remoteCharacterIdRef.current;
    if (
      serverOnline &&
      isAuthenticated &&
      remoteCharId &&
      !remoteCharId.startsWith('local_')
    ) {
      const res = await completeOnboardingApi(remoteCharId);
      if (res.ok && res.data) {
        const granted = Boolean(res.data.welcomeGiftGranted ?? !alreadyCompleted);
        applyServerEconomySnapshot(res.data);
        if (granted && !Array.isArray(res.data.inventoryItems)) {
          addDropsToInventory([
            {
              itemSlug: 'sunleaf_healing_draught',
              itemName: 'Sunleaf Healing Draught',
              rarity: 'COMMON',
              quantity: 1,
            },
          ]);
        }
        if (granted && !beltLoadoutRef.current.includes('sunleaf_healing_draught')) {
          const nextBelt = [...beltLoadoutRef.current];
          const emptyIdx = nextBelt.findIndex((s) => !s);
          if (emptyIdx >= 0) {
            nextBelt[emptyIdx] = 'sunleaf_healing_draught';
            beltLoadoutRef.current = nextBelt;
            setBeltLoadout(nextBelt);
          }
        }
        persistCurrentProfileUpdates({
          guideOnboardingCompleted: true,
          beltLoadout: beltLoadoutRef.current,
        });
        return {
          ok: true,
          welcomeGiftGranted: granted,
        };
      }
    }

    let welcomeGiftGranted = false;
    if (!alreadyCompleted) {
      addDropsToInventory([
        {
          itemSlug: 'sunleaf_healing_draught',
          itemName: 'Sunleaf Healing Draught',
          rarity: 'COMMON',
          quantity: 1,
        },
      ]);
      if (!beltLoadoutRef.current.includes('sunleaf_healing_draught')) {
        const nextBelt = [...beltLoadoutRef.current];
        const emptyIdx = nextBelt.findIndex((s) => !s);
        if (emptyIdx >= 0) {
          nextBelt[emptyIdx] = 'sunleaf_healing_draught';
          beltLoadoutRef.current = nextBelt;
          setBeltLoadout(nextBelt);
        }
      }
      welcomeGiftGranted = true;
    }
    persistCurrentProfileUpdates({
      guideOnboardingCompleted: true,
      beltLoadout: beltLoadoutRef.current,
    });
    return { ok: true, welcomeGiftGranted };
  }, [
    addDropsToInventory,
    applyServerEconomySnapshot,
    isAuthenticated,
    persistCurrentProfileUpdates,
    serverOnline,
  ]);

  const dismissGuideOnboarding = useCallback(() => {
    guideOnboardingCompletedRef.current = true;
    setGuideOnboardingCompleted(true);
    persistCurrentProfileUpdates({ guideOnboardingCompleted: true });
  }, [persistCurrentProfileUpdates]);

  const craftItemRecipe = useCallback(
    async (
      recipeSlug: string,
      quantity = 1
    ): Promise<{ ok: boolean; message?: string; error?: string }> => {
      const remoteCharId = remoteCharacterIdRef.current;
      const clientSeed = `craft_${Date.now()}`;
      if (
        serverOnline &&
        isAuthenticated &&
        remoteCharId &&
        !remoteCharId.startsWith('local_')
      ) {
        const res = await craftRecipeApi({
          characterId: remoteCharId,
          recipeSlug,
          quantity,
          clientSeed,
        });
        if (res.ok && res.data) {
          applyServerEconomySnapshot(res.data);
          return {
            ok: true,
            message: res.data.message || `Crafted ${quantity}x item!`,
          };
        }
        if (res.statusCode && res.statusCode < 500) {
          return { ok: false, error: res.error || 'Failed to craft recipe.' };
        }
      }

      const materialCounts: Record<string, number> = {};
      for (const entry of rawInventoryRef.current) {
        materialCounts[entry.slug] = (materialCounts[entry.slug] ?? 0) + entry.quantity;
      }

      const evalRes = evaluateCraftRecipe({
        recipeSlug,
        quantity,
        currentGold: goldRef.current,
        materialCounts,
        characterStats: toCoreStatBlock(statsRef.current),
        seed: clientSeed,
      });

      if (!evalRes.ok) {
        return { ok: false, error: evalRes.error };
      }

      const remainingDeductions = { ...evalRes.deductedMaterials };
      const nextInventory: InventoryEntry[] = [];
      for (const entry of rawInventoryRef.current) {
        const deduct = remainingDeductions[entry.slug] ?? 0;
        if (deduct > 0) {
          const used = Math.min(entry.quantity, deduct);
          remainingDeductions[entry.slug] = deduct - used;
          const left = entry.quantity - used;
          if (left > 0) {
            nextInventory.push({ ...entry, quantity: left });
          }
        } else {
          nextInventory.push(entry);
        }
      }

      for (const drop of evalRes.craftedDrops) {
        const newEntry = lootDropToInventoryEntry(drop);
        const isEquip = isEquippableInventoryEntry(newEntry);
        const existingIdx = !isEquip
          ? nextInventory.findIndex((i) => i.slug === newEntry.slug)
          : -1;
        if (existingIdx >= 0) {
          nextInventory[existingIdx] = {
            ...nextInventory[existingIdx]!,
            quantity: nextInventory[existingIdx]!.quantity + newEntry.quantity,
          };
        } else {
          nextInventory.push(newEntry);
        }
      }

      rawInventoryRef.current = nextInventory;
      setRawInventory(nextInventory);
      goldRef.current = evalRes.remainingGold;
      setGold(evalRes.remainingGold);
      persistCurrentProfileUpdates({
        inventory: nextInventory,
        gold: evalRes.remainingGold,
      });

      return {
        ok: true,
        message: `Crafted ${quantity}x ${evalRes.recipe.outputItemName}!`,
      };
    },
    [
      applyServerEconomySnapshot,
      isAuthenticated,
      lootDropToInventoryEntry,
      persistCurrentProfileUpdates,
      serverOnline,
    ]
  );

  const upgradeInventoryGear = useCallback(
    async (
      itemSlugOrId: string
    ): Promise<{ ok: boolean; newTier?: number; message?: string; error?: string }> => {
      const targetIdx = rawInventoryRef.current.findIndex(
        (i) => i.inventoryItemId === itemSlugOrId || i.slug === itemSlugOrId
      );
      if (targetIdx < 0) {
        return { ok: false, error: 'Gear item not found in inventory.' };
      }
      const target = rawInventoryRef.current[targetIdx]!;
      const oldSlug = target.slug;
      const clientSeed = `upg_${Date.now()}`;

      const remoteCharId = remoteCharacterIdRef.current;
      if (
        serverOnline &&
        isAuthenticated &&
        remoteCharId &&
        !remoteCharId.startsWith('local_') &&
        target.inventoryItemId
      ) {
        const res = await upgradeGearApi({
          characterId: remoteCharId,
          inventoryItemId: target.inventoryItemId,
          clientSeed,
        });
        if (res.ok && res.data) {
          applyServerEconomySnapshot(res.data);
          return {
            ok: true,
            newTier: res.data.newTier,
            message: res.data.message || `Upgraded ${target.name} to Tier ${res.data.newTier ?? ''}!`,
          };
        }
        if (res.statusCode && res.statusCode < 500) {
          return { ok: false, error: res.error || 'Failed to upgrade gear.' };
        }
      }

      const materialCounts: Record<string, number> = {};
      for (const entry of rawInventoryRef.current) {
        materialCounts[entry.slug] = (materialCounts[entry.slug] ?? 0) + entry.quantity;
      }

      const baseSlug = target.baseSlug ?? target.slug;
      const currentTier = (target.tier ?? 1) as ItemTier;

      const upgRes = upgradeProceduralItemTier({
        baseSlug,
        currentTier,
        currentPrefixId: target.prefixId,
        currentSuffixId: target.suffixId,
        currentGold: goldRef.current,
        materialCounts,
        seed: clientSeed,
      });

      if (!upgRes.ok) {
        return { ok: false, error: upgRes.error };
      }

      const remainingDeductions = { ...upgRes.deductedMaterials };
      const nextInventory: InventoryEntry[] = [];
      for (let idx = 0; idx < rawInventoryRef.current.length; idx++) {
        const entry = rawInventoryRef.current[idx]!;
        if (idx === targetIdx) {
          const d = upgRes.lootDrop;
          nextInventory.push({
            ...entry,
            slug: d.itemSlug,
            baseSlug: d.baseSlug ?? baseSlug,
            name: d.itemName,
            rarity: d.rarity,
            tier: upgRes.newTier,
            prefixId: d.prefixId ?? entry.prefixId ?? null,
            prefixLabel: d.prefixLabel ?? entry.prefixLabel ?? null,
            prefixSummary: d.prefixSummary ?? entry.prefixSummary,
            suffixId: d.suffixId ?? entry.suffixId ?? null,
            suffixLabel: d.suffixLabel ?? entry.suffixLabel ?? null,
            suffixSummary: d.suffixSummary ?? entry.suffixSummary,
            baseStatsSummary: d.baseStatsSummary ?? entry.baseStatsSummary,
            primaryStatBonuses: d.primaryStatBonuses ?? entry.primaryStatBonuses,
            statBonuses: d.statBonuses ?? entry.statBonuses,
            uniquePassive: d.uniquePassive ?? entry.uniquePassive,
          });
          continue;
        }
        const deduct = remainingDeductions[entry.slug] ?? 0;
        if (deduct > 0) {
          const used = Math.min(entry.quantity, deduct);
          remainingDeductions[entry.slug] = deduct - used;
          const left = entry.quantity - used;
          if (left > 0) {
            nextInventory.push({ ...entry, quantity: left });
          }
        } else {
          nextInventory.push(entry);
        }
      }

      const nextLoadout: EquipmentLoadoutMap = { ...(equipmentLoadoutRef.current || equipmentLoadout) };
      let loadoutChanged = false;
      for (const slot of EQUIPMENT_SLOT_KEYS) {
        if (nextLoadout[slot] === oldSlug && upgRes.lootDrop.itemSlug !== oldSlug) {
          nextLoadout[slot] = upgRes.lootDrop.itemSlug;
          loadoutChanged = true;
        }
      }
      if (loadoutChanged) {
        equipmentLoadoutRef.current = nextLoadout;
        setEquipmentLoadout(nextLoadout);
      }

      rawInventoryRef.current = nextInventory;
      setRawInventory(nextInventory);
      goldRef.current = upgRes.remainingGold;
      setGold(upgRes.remainingGold);
      persistCurrentProfileUpdates({
        inventory: nextInventory,
        gold: upgRes.remainingGold,
        ...(loadoutChanged ? { equipmentLoadout: nextLoadout } : {}),
      });

      return {
        ok: true,
        newTier: upgRes.newTier,
        message: `Upgraded to Tier ${upgRes.newTier}: ${upgRes.lootDrop.itemName}!`,
      };
    },
    [
      applyServerEconomySnapshot,
      equipmentLoadout,
      isAuthenticated,
      persistCurrentProfileUpdates,
      serverOnline,
    ]
  );

  const reforgeInventoryGear = useCallback(
    async (
      itemSlugOrId: string,
      mode: AffixReforgeMode = 'BOTH'
    ): Promise<{ ok: boolean; message?: string; error?: string }> => {
      const targetIdx = rawInventoryRef.current.findIndex(
        (i) => i.inventoryItemId === itemSlugOrId || i.slug === itemSlugOrId
      );
      if (targetIdx < 0) {
        return { ok: false, error: 'Gear item not found in inventory.' };
      }
      const target = rawInventoryRef.current[targetIdx]!;
      const oldSlug = target.slug;
      const clientSeed = `reforge_${Date.now()}`;

      const remoteCharId = remoteCharacterIdRef.current;
      if (
        serverOnline &&
        isAuthenticated &&
        remoteCharId &&
        !remoteCharId.startsWith('local_') &&
        target.inventoryItemId
      ) {
        const res = await reforgeGearApi({
          characterId: remoteCharId,
          inventoryItemId: target.inventoryItemId,
          mode,
          clientSeed,
        });
        if (res.ok && res.data) {
          applyServerEconomySnapshot(res.data);
          return {
            ok: true,
            message: res.data.message || `Reforged ${target.name} affixes!`,
          };
        }
        if (res.statusCode && res.statusCode < 500) {
          return { ok: false, error: res.error || 'Failed to reforge gear.' };
        }
      }

      const materialCounts: Record<string, number> = {};
      for (const entry of rawInventoryRef.current) {
        materialCounts[entry.slug] = (materialCounts[entry.slug] ?? 0) + entry.quantity;
      }

      const baseSlug = target.baseSlug ?? target.slug;
      const currentTier = (target.tier ?? 1) as ItemTier;

      const refRes = reforgeProceduralItemAffixes({
        baseSlug,
        tier: currentTier,
        mode,
        currentPrefixId: target.prefixId,
        currentSuffixId: target.suffixId,
        currentGold: goldRef.current,
        materialCounts,
        seed: clientSeed,
      });

      if (!refRes.ok) {
        return { ok: false, error: refRes.error };
      }

      const remainingDeductions = { ...refRes.deductedMaterials };
      const nextInventory: InventoryEntry[] = [];
      for (let idx = 0; idx < rawInventoryRef.current.length; idx++) {
        const entry = rawInventoryRef.current[idx]!;
        if (idx === targetIdx) {
          const d = refRes.lootDrop;
          nextInventory.push({
            ...entry,
            slug: d.itemSlug,
            baseSlug: d.baseSlug ?? baseSlug,
            name: d.itemName,
            rarity: d.rarity,
            tier: currentTier,
            prefixId: d.prefixId ?? null,
            prefixLabel: d.prefixLabel ?? null,
            prefixSummary: d.prefixSummary,
            suffixId: d.suffixId ?? null,
            suffixLabel: d.suffixLabel ?? null,
            suffixSummary: d.suffixSummary,
            baseStatsSummary: d.baseStatsSummary ?? entry.baseStatsSummary,
            primaryStatBonuses: d.primaryStatBonuses ?? entry.primaryStatBonuses,
            statBonuses: d.statBonuses ?? entry.statBonuses,
            uniquePassive: d.uniquePassive ?? entry.uniquePassive,
          });
          continue;
        }
        const deduct = remainingDeductions[entry.slug] ?? 0;
        if (deduct > 0) {
          const used = Math.min(entry.quantity, deduct);
          remainingDeductions[entry.slug] = deduct - used;
          const left = entry.quantity - used;
          if (left > 0) {
            nextInventory.push({ ...entry, quantity: left });
          }
        } else {
          nextInventory.push(entry);
        }
      }

      const nextLoadout: EquipmentLoadoutMap = { ...(equipmentLoadoutRef.current || equipmentLoadout) };
      let loadoutChanged = false;
      for (const slot of EQUIPMENT_SLOT_KEYS) {
        if (nextLoadout[slot] === oldSlug && refRes.lootDrop.itemSlug !== oldSlug) {
          nextLoadout[slot] = refRes.lootDrop.itemSlug;
          loadoutChanged = true;
        }
      }
      if (loadoutChanged) {
        equipmentLoadoutRef.current = nextLoadout;
        setEquipmentLoadout(nextLoadout);
      }

      rawInventoryRef.current = nextInventory;
      setRawInventory(nextInventory);
      goldRef.current = refRes.remainingGold;
      setGold(refRes.remainingGold);
      persistCurrentProfileUpdates({
        inventory: nextInventory,
        gold: refRes.remainingGold,
        ...(loadoutChanged ? { equipmentLoadout: nextLoadout } : {}),
      });

      return {
        ok: true,
        message: `Reforged: ${refRes.lootDrop.itemName}!`,
      };
    },
    [
      applyServerEconomySnapshot,
      equipmentLoadout,
      isAuthenticated,
      persistCurrentProfileUpdates,
      serverOnline,
    ]
  );

  const buyTraderOffer = useCallback(
    async (
      offerId: string,
      quantity = 1,
      rotationDateKey?: string
    ): Promise<{ ok: boolean; message?: string; error?: string }> => {
      const dateKey = rotationDateKey ?? toUtcDayKey(new Date());
      const remoteCharId = remoteCharacterIdRef.current;
      if (
        serverOnline &&
        isAuthenticated &&
        remoteCharId &&
        !remoteCharId.startsWith('local_')
      ) {
        const res = await buyTraderOfferApi({
          characterId: remoteCharId,
          offerId,
          quantity,
          rotationDateKey: dateKey,
        });
        if (res.ok && res.data) {
          applyServerEconomySnapshot(res.data);
          return {
            ok: true,
            message: res.data.message || 'Purchase complete!',
          };
        }
        if (res.statusCode && res.statusCode < 500) {
          return { ok: false, error: res.error || 'Failed to purchase offer.' };
        }
      }

      const buyRes = evaluateTraderPurchase({
        offerId,
        quantity,
        currentGold: goldRef.current,
        rotationDateKey: dateKey,
      });
      if (!buyRes.ok) {
        return { ok: false, error: buyRes.error };
      }

      const nextInventory = [...rawInventoryRef.current];
      for (const drop of buyRes.purchasedDrops) {
        const newEntry = lootDropToInventoryEntry(drop);
        const isEquip = isEquippableInventoryEntry(newEntry);
        const existingIdx = !isEquip
          ? nextInventory.findIndex((i) => i.slug === newEntry.slug)
          : -1;
        if (existingIdx >= 0) {
          nextInventory[existingIdx] = {
            ...nextInventory[existingIdx]!,
            quantity: nextInventory[existingIdx]!.quantity + newEntry.quantity,
          };
        } else {
          nextInventory.push(newEntry);
        }
      }

      rawInventoryRef.current = nextInventory;
      setRawInventory(nextInventory);
      goldRef.current = buyRes.remainingGold;
      setGold(buyRes.remainingGold);
      persistCurrentProfileUpdates({
        inventory: nextInventory,
        gold: buyRes.remainingGold,
      });

      return {
        ok: true,
        message: `Bought ${quantity}x ${buyRes.offer.itemName} for ${buyRes.totalGoldCost}g!`,
      };
    },
    [
      applyServerEconomySnapshot,
      isAuthenticated,
      lootDropToInventoryEntry,
      persistCurrentProfileUpdates,
      serverOnline,
    ]
  );

  const sellInventoryItemToTrader = useCallback(
    async (
      itemSlugOrId: string,
      quantity = 1
    ): Promise<{ ok: boolean; goldEarned?: number; message?: string; error?: string }> => {
      const targetIdx = rawInventoryRef.current.findIndex(
        (i) => i.inventoryItemId === itemSlugOrId || i.slug === itemSlugOrId
      );
      if (targetIdx < 0) {
        return { ok: false, error: 'Item not found in inventory.' };
      }
      const target = rawInventoryRef.current[targetIdx]!;
      if (target.isLocked) {
        return { ok: false, error: `${target.name} is locked and cannot be sold.` };
      }
      const currentLoadout = equipmentLoadoutRef.current || equipmentLoadout;
      const isEquipped = Object.values(currentLoadout).some((s) => s === target.slug);
      if (isEquipped) {
        return { ok: false, error: `Unequip ${target.name} before selling.` };
      }

      const sellQty = Math.min(Math.max(1, Math.floor(quantity)), target.quantity);
      const remoteCharId = remoteCharacterIdRef.current;
      if (
        serverOnline &&
        isAuthenticated &&
        remoteCharId &&
        !remoteCharId.startsWith('local_') &&
        target.inventoryItemId
      ) {
        const res = await sellInventoryItemApi({
          characterId: remoteCharId,
          inventoryItemId: target.inventoryItemId,
          quantity: sellQty,
        });
        if (res.ok && res.data) {
          applyServerEconomySnapshot(res.data);
          const earned = typeof res.data.goldEarned === 'number' ? res.data.goldEarned : undefined;
          return {
            ok: true,
            goldEarned: earned,
            message:
              res.data.message ||
              `Sold ${sellQty}x ${target.name}${earned !== undefined ? ` for ${earned}g` : ''}!`,
          };
        }
        if (res.statusCode && res.statusCode < 500) {
          return { ok: false, error: res.error || 'Failed to sell item.' };
        }
      }

      const sellVal = calculateTraderSellValue({
        itemSlug: target.baseSlug ?? target.slug,
        tier: target.tier,
        rarity: target.rarity,
        quantity: sellQty,
      });

      const nextInventory = rawInventoryRef.current
        .map((entry, idx) =>
          idx === targetIdx ? { ...entry, quantity: entry.quantity - sellQty } : entry
        )
        .filter((entry) => entry.quantity > 0);

      const nextGold = goldRef.current + sellVal.totalSellGold;
      rawInventoryRef.current = nextInventory;
      setRawInventory(nextInventory);
      goldRef.current = nextGold;
      setGold(nextGold);
      persistCurrentProfileUpdates({
        inventory: nextInventory,
        gold: nextGold,
      });

      return {
        ok: true,
        goldEarned: sellVal.totalSellGold,
        message: `Sold ${sellQty}x ${target.name} for ${sellVal.totalSellGold}g!`,
      };
    },
    [
      applyServerEconomySnapshot,
      equipmentLoadout,
      isAuthenticated,
      persistCurrentProfileUpdates,
      serverOnline,
    ]
  );

  const respecCharacterTalentTrees = useCallback(async (): Promise<{
    ok: boolean;
    goldCost?: number;
    totalPointsRefunded?: number;
    error?: string;
  }> => {
    const remoteCharId = remoteCharacterIdRef.current;
    if (
      serverOnline &&
      isAuthenticated &&
      remoteCharId &&
      !remoteCharId.startsWith('local_')
    ) {
      const res = await respecTalentsApi(remoteCharId);
      if (res.ok && res.data) {
        const nextRanks: Record<string, number> = res.data.unlockedTalentRanks ?? {};
        const nextSkills = sanitizeActiveSkillLoadout(
          res.data.activeSkillLoadout ?? activeSkillLoadoutRef.current,
          nextRanks
        );
        unlockedTalentRanksRef.current = nextRanks;
        setUnlockedTalentRanks(nextRanks);
        activeSkillLoadoutRef.current = nextSkills;
        setActiveSkillLoadout(nextSkills);

        const nextGold =
          typeof res.data.remainingGold === 'number'
            ? res.data.remainingGold
            : goldRef.current;
        goldRef.current = nextGold;
        setGold(nextGold);

        const nextStats = { ...statsRef.current };
        if (res.data.nextAvailablePoints && typeof res.data.nextAvailablePoints === 'object') {
          for (const statKey of Object.keys(nextStats) as Array<keyof typeof nextStats>) {
            const pts = res.data.nextAvailablePoints[statKey];
            if (typeof pts === 'number') {
              nextStats[statKey] = { ...nextStats[statKey], pointsAvailable: pts };
            }
          }
        }
        statsRef.current = nextStats;
        setStats(nextStats);

        persistCurrentProfileUpdates({
          gold: nextGold,
          stats: nextStats,
          unlockedTalentRanks: nextRanks,
          activeSkillLoadout: nextSkills,
        });

        return {
          ok: true,
          goldCost: res.data.goldCost,
          totalPointsRefunded: res.data.totalPointsRefunded,
        };
      }
      if (res.statusCode && res.statusCode < 500) {
        return { ok: false, error: res.error || 'Failed to respec talents.' };
      }
    }

    const availablePoints: Partial<Record<TalentGoverningStat, number>> = {
      STRENGTH: statsRef.current.STRENGTH?.pointsAvailable ?? 0,
      ENDURANCE: statsRef.current.ENDURANCE?.pointsAvailable ?? 0,
      AGILITY: statsRef.current.AGILITY?.pointsAvailable ?? 0,
      DEXTERITY: statsRef.current.DEXTERITY?.pointsAvailable ?? 0,
      CONSTITUTION: statsRef.current.CONSTITUTION?.pointsAvailable ?? 0,
      WISDOM: statsRef.current.WISDOM?.pointsAvailable ?? 0,
      SPIRIT: statsRef.current.SPIRIT?.pointsAvailable ?? 0,
    };

    const respecRes = respecCharacterTalents({
      currentGold: goldRef.current,
      availablePoints,
      unlockedNodeRanks: unlockedTalentRanksRef.current,
      activeSkillLoadout: activeSkillLoadoutRef.current,
    });

    if (!respecRes.ok) {
      return { ok: false, error: respecRes.error };
    }

    const nextStats = { ...statsRef.current };
    for (const statKey of Object.keys(respecRes.nextAvailablePoints) as TalentGoverningStat[]) {
      if (nextStats[statKey]) {
        nextStats[statKey] = {
          ...nextStats[statKey],
          pointsAvailable: respecRes.nextAvailablePoints[statKey],
        };
      }
    }

    goldRef.current = respecRes.remainingGold;
    setGold(respecRes.remainingGold);
    statsRef.current = nextStats;
    setStats(nextStats);
    unlockedTalentRanksRef.current = respecRes.nextUnlockedNodeRanks;
    setUnlockedTalentRanks(respecRes.nextUnlockedNodeRanks);
    activeSkillLoadoutRef.current = respecRes.nextActiveSkillLoadout;
    setActiveSkillLoadout(respecRes.nextActiveSkillLoadout);

    persistCurrentProfileUpdates({
      gold: respecRes.remainingGold,
      stats: nextStats,
      unlockedTalentRanks: respecRes.nextUnlockedNodeRanks,
      activeSkillLoadout: respecRes.nextActiveSkillLoadout,
    });

    return {
      ok: true,
      goldCost: respecRes.goldCost,
      totalPointsRefunded: respecRes.totalPointsRefunded,
    };
  }, [isAuthenticated, persistCurrentProfileUpdates, serverOnline]);

  const startGatheringTask = useCallback(
    (
      nodeSlug: string,
      options?: {
        targetDurationMs?: number;
        targetYieldAmount?: number;
        notifyOnCompletion?: boolean;
      }
    ) => {
      if (gatheringLockRef.current || activeGatheringRef.current) {
        return { ok: false, error: 'A gathering task is already running.' };
      }
      if (activityStateRef.current === 'IN_DUNGEON' || activeDungeonRunRef.current?.status === 'ACTIVE_WINDOW') {
        return { ok: false, error: 'Cannot gather while locked inside an active Dungeon.' };
      }
      gatheringLockRef.current = true;
      try {
        const node = GATHERING_NODES.find((n) => n.slug === nodeSlug);
        if (!node) return { ok: false, error: 'Node not found.' };

        const currentStats = statsRef.current;
        if ((currentStats[node.requiredStatType]?.level ?? 1) < node.requiredStatLevel) {
          return {
            ok: false,
            error: `Requires ${node.requiredStatType} Lv.${node.requiredStatLevel}.`,
          };
        }

        const currentInv = rawInventoryRef.current;
        for (const req of node.inputMaterials) {
          const owned = currentInv.find((i) => i.slug === req.slug)?.quantity ?? 0;
          if (owned < req.quantity) {
            return {
              ok: false,
              error: `Requires ${req.quantity}x ${req.name} (owned: ${owned}).`,
            };
          }
        }

        if (node.inputMaterials.length > 0) {
          const nextInv = currentInv
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

        const currentOverallLevel = calculateOverallCharacterLevel({
          strengthLevel: currentStats.STRENGTH?.level ?? 1,
          enduranceLevel: currentStats.ENDURANCE?.level ?? 1,
          agilityLevel: currentStats.AGILITY?.level ?? 1,
          dexLevel: currentStats.DEXTERITY?.level ?? 1,
          conLevel: currentStats.CONSTITUTION?.level ?? 1,
          wisLevel: currentStats.WISDOM?.level ?? 1,
          sprLevel: currentStats.SPIRIT?.level ?? 1,
        });

        const tick = calculateGatheringTick(
          {
            strengthLevel: currentStats.STRENGTH?.level ?? 1,
            enduranceLevel: currentStats.ENDURANCE?.level ?? 1,
            agilityLevel: currentStats.AGILITY?.level ?? 1,
          },
          currentOverallLevel,
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

        const nextGatheringState: ActiveGatheringState = {
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
        };
        activeGatheringRef.current = nextGatheringState;
        setActiveGathering(nextGatheringState);

        if (notifyOnCompletion) {
          void scheduleGatheringTargetNotification({
            secondsRemaining: Math.round(durationMs / 1000),
            nodeName: node.name,
            targetYieldAmount: options?.targetYieldAmount,
            itemName: node.lootTable[0]?.itemName,
          });
        }

        setLocation('GATHERING_NODE');
        activityStateRef.current = 'GATHERING';
        setActivityState('GATHERING');
        setLastGatheringDrop(null);
        return { ok: true };
      } finally {
        gatheringLockRef.current = false;
      }
    },
    [persistBundleSnapshot]
  );

  const completeGatheringNow = useCallback(() => {
    const currentTask = activeGatheringRef.current;
    if (!currentTask) return;
    finalizeGatheringTask(currentTask);
  }, [finalizeGatheringTask]);

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
          dexLevel: stats.DEXTERITY.level,
          conLevel: stats.CONSTITUTION.level,
          wisLevel: stats.WISDOM.level,
          sprLevel: stats.SPIRIT.level,
        },
        equipmentBonuses,
        equipmentPrimaryStatBonuses: aggregatedEquipment.primaryStatBonuses,
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
      aggregatedEquipment.primaryStatBonuses,
      characterName,
      equipmentBonuses,
      projectedFatigue.systemicFatigueStacks,
      stats,
      unlockedTalentRanks,
    ]
  );

  const resolveActiveDungeonNow = useCallback(() => {
    const currentRun = activeDungeonRunRef.current;
    if (!currentRun || currentRun.status !== 'ACTIVE_WINDOW') return;

    const replay = simulateDungeonRun({
      dungeon: currentRun.dungeon,
      party: currentRun.party,
      workoutBuffs: currentRun.activeWorkoutBuffs,
      seed: currentRun.runId,
      tickIntervalMs: 250,
    });

    const goldShare =
      replay.roomsCleared > 0 && replay.totalGoldEarned > 0
        ? Math.round(replay.totalGoldEarned / currentRun.party.length)
        : 0;

    const nextRun: ActiveDungeonRunState = {
      ...currentRun,
      status: 'REPLAYING',
      replay,
      goldShare,
      spoilsClaimed: false,
    };
    activeDungeonRunRef.current = nextRun;
    setActiveDungeonRun(nextRun);
  }, []);

  const claimExpeditionSpoils = useCallback(async () => {
    const currentRun = activeDungeonRunRef.current;
    if (!currentRun || !currentRun.replay || currentRun.spoilsClaimed) return;

    const replay = currentRun.replay;
    const goldShare =
      currentRun.goldShare ??
      (replay.roomsCleared > 0 && replay.totalGoldEarned > 0
        ? Math.round(replay.totalGoldEarned / currentRun.party.length)
        : 0);

    const claimedRun: ActiveDungeonRunState = {
      ...currentRun,
      status: 'COMPLETED',
      spoilsClaimed: true,
    };
    activeDungeonRunRef.current = claimedRun;
    setActiveDungeonRun(claimedRun);
    setActivityState('IDLE');

    const remoteCharId = remoteCharacterIdRef.current;
    const companionIds = currentRun.party
      .filter((member) => member.characterId !== 'player_hero')
      .map((member) => member.characterId);

    if (
      serverOnline &&
      isAuthenticated &&
      remoteCharId &&
      !remoteCharId.startsWith('local_')
    ) {
      const res = await claimSoloExpeditionApi(currentRun.dungeon.dungeonSlug, {
        characterId: remoteCharId,
        clientRunId: currentRun.runId,
        companionIds,
        activeWorkoutBuffs: currentRun.activeWorkoutBuffs,
      });
      if (res.ok && res.data) {
        applyServerEconomySnapshot(res.data);
        return;
      }
    }

    // Offline fallback: apply gold and spoils locally
    const nextGold = goldRef.current + goldShare;
    goldRef.current = nextGold;
    setGold(nextGold);

    if (replay.roomsCleared > 0 && replay.lootDrops.length > 0) {
      addDropsToInventory(replay.lootDrops);
    }

    if (currentProfileRef.current) {
      const updatedProfile: PersistedCharacterProfile = {
        ...currentProfileRef.current,
        stats: statsRef.current,
        gold: nextGold,
        inventory: rawInventoryRef.current,
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
  }, [
    addDropsToInventory,
    applyServerEconomySnapshot,
    isAuthenticated,
    persistBundleSnapshot,
    serverOnline,
  ]);

  const dismissCompletedDungeonReplay = useCallback(() => {
    const currentRun = activeDungeonRunRef.current;
    if (currentRun && currentRun.replay && !currentRun.spoilsClaimed) {
      void claimExpeditionSpoils();
    }
    activeDungeonRunRef.current = null;
    setActiveDungeonRun(null);
    setActivityState('IDLE');
  }, [claimExpeditionSpoils]);

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

      const activeCharId = activeCharacterIdRef.current;
      const remoteCharId = remoteCharacterIdRef.current;
      const resolvedCharId = remoteCharId ?? activeCharId ?? 'player_hero';
      const heroDisplayName = characterName || 'Adventurer';

      setRaids((prev) =>
        prev.map((r) => {
          if (r.id !== raidId) return r;
          const matchesHero = (pid: string) =>
            pid === 'player_hero' ||
            (Boolean(activeCharId) && pid === activeCharId) ||
            (Boolean(remoteCharId) && pid === remoteCharId);
          const alreadyListed = r.participants.some((p) => matchesHero(p.characterId));
          const updatedParticipants = alreadyListed
            ? r.participants.map((p) =>
                matchesHero(p.characterId)
                  ? {
                      ...p,
                      name: heroDisplayName,
                      combatDamageDealt: p.combatDamageDealt + damage,
                      supportScore: p.supportScore + support,
                    }
                  : p
              )
            : [
                ...r.participants,
                {
                  characterId: resolvedCharId,
                  name: heroDisplayName,
                  combatDamageDealt: damage,
                  workoutEnergyDamage: 0,
                  supportScore: support,
                },
              ];

          updatedParticipants.sort(
            (a, b) =>
              b.combatDamageDealt +
              b.workoutEnergyDamage +
              b.supportScore -
              (a.combatDamageDealt + a.workoutEnergyDamage + a.supportScore)
          );

          return {
            ...r,
            currentHp: Math.max(0, r.currentHp - damage),
            dailyAttackUsedToday: true,
            participants: updatedParticipants,
          };
        })
      );

      // If online, dispatch attack to backend to trigger DB sync & live WebSocket broadcast
      if (serverOnline && remoteCharId && !remoteCharId.startsWith('local_')) {
        apiFetch(`/api/raids/${raidId}/attack`, {
          method: 'POST',
          body: JSON.stringify({ characterId: remoteCharId }),
        }).catch(() => {
          // Graceful offline fallback
        });
      }

      return { ok: true, damage };
    },
    [aggregatedTalents, characterName, raids, serverOnline, stats]
  );

  const resolveWeeklyRaidRewards = useCallback(
    (raidId: string) => {
      const target = raids.find((r) => r.id === raidId);
      if (!target || target.lastResolution) return;
      if (target.currentHp > 0 && Date.now() < target.endsAtMs) return;

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
            itemName: 'Wyrm Crown',
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
        const nextGold = goldRef.current + myReward.goldAwarded;
        goldRef.current = nextGold;
        setGold(nextGold);
        setAdventurerReputation((rep) => rep + myReward.guildReputationAwarded);
        setGuildReputation((rep) => rep + myReward.guildReputationAwarded);
        addDropsToInventory(myReward.lootDrops);

        if (currentProfileRef.current) {
          const updatedProfile = {
            ...currentProfileRef.current,
            gold: goldRef.current,
            inventory: rawInventoryRef.current,
          };
          currentProfileRef.current = updatedProfile;
          const nextAvail = availableCharactersRef.current.map((c) =>
            c.id === updatedProfile.id ? updatedProfile : c
          );
          availableCharactersRef.current = nextAvail;
          setAvailableCharacters(nextAvail);
          void persistBundleSnapshot({
            characterProfile: updatedProfile,
            availableCharacters: nextAvail,
          });
        } else {
          void persistBundleSnapshot({});
        }
      }

      setRaids((prev) =>
        prev.map((r) => (r.id === raidId ? { ...r, lastResolution: resolution } : r))
      );
    },
    [addDropsToInventory, persistBundleSnapshot, raids]
  );

  const completeGuildBounty = useCallback(
    (bountySlug: string) => {
      if (bountyLockRef.current) {
        return { ok: false, error: 'Bounty claim already in progress.' };
      }
      if (claimedBountyIdsRef.current.has(bountySlug)) {
        return { ok: false, error: 'Already completed.' };
      }
      bountyLockRef.current = true;
      try {
        const currentBounties = bountiesRef.current;
        const bounty = currentBounties.find((b) => b.slug === bountySlug);
        if (!bounty) return { ok: false, error: 'Bounty not found.' };
        if (bounty.completed) return { ok: false, error: 'Already completed.' };

        if (bounty.slug === 'trial_of_iron' && workoutsLoggedCount < 1) {
          return {
            ok: false,
            error: `Log at least 1 workout first (currently ${workoutsLoggedCount}/1).`,
          };
        }

        const currentStats = statsRef.current;
        const currentRank = adventurerRankRef.current;
        const totalLvl =
          (currentStats.STRENGTH?.level ?? 1) +
          (currentStats.ENDURANCE?.level ?? 1) +
          (currentStats.AGILITY?.level ?? 1) +
          (currentStats.DEXTERITY?.level ?? 1) +
          (currentStats.CONSTITUTION?.level ?? 1) +
          (currentStats.WISDOM?.level ?? 1) +
          (currentStats.SPIRIT?.level ?? 1);
        if (bounty.slug === 'trial_of_bronze') {
          if (currentRank === 'COPPER') {
            return { ok: false, error: 'Complete the Iron Rank-Up Trial first.' };
          }
          if (totalLvl < 15) {
            return {
              ok: false,
              error: `Requires Combined Stat Level 15 (currently ${totalLvl}/15).`,
            };
          }
        }

        claimedBountyIdsRef.current.add(bountySlug);
        const nextBounties = currentBounties.map((b) =>
          b.slug === bountySlug ? { ...b, completed: true } : b
        );
        bountiesRef.current = nextBounties;
        setBounties(nextBounties);

        const nextGold = goldRef.current + bounty.goldReward;
        goldRef.current = nextGold;
        setGold(nextGold);

        const nextRep = adventurerReputationRef.current + bounty.reputationReward;
        adventurerReputationRef.current = nextRep;
        setAdventurerReputation(nextRep);

        const nextRank =
          bounty.isRankUpTrial && bounty.unlocksRank ? bounty.unlocksRank : currentRank;
        if (bounty.isRankUpTrial && bounty.unlocksRank) {
          adventurerRankRef.current = bounty.unlocksRank;
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
      } finally {
        bountyLockRef.current = false;
      }
    },
    [persistBundleSnapshot, serverOnline, workoutsLoggedCount]
  );

  const persistCombatLoadoutProfile = useCallback(
    async (nextSkills: string[], nextBelt: Array<string | null>) => {
      if (currentProfileRef.current) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          activeSkillLoadout: nextSkills,
          beltLoadout: nextBelt,
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
      } else {
        persistBundleSnapshot({});
      }

      const charId = activeCharacterIdRef.current ?? remoteCharacterIdRef.current;
      if (isAuthenticated && serverOnline && charId && !charId.startsWith('local_')) {
        await saveCharacterCombatLoadoutApi(charId, {
          activeSkillIds: nextSkills,
          beltConsumables: nextBelt,
        }).catch(() => {});
      }
    },
    [isAuthenticated, persistBundleSnapshot, serverOnline]
  );

  const equipActiveSkillSlot = useCallback(
    async (slotIndex: number, skillId: string | null): Promise<{ ok: boolean; error?: string }> => {
      if (slotIndex < 0 || slotIndex >= 4) {
        return { ok: false, error: 'Invalid active skill slot.' };
      }
      const nextSkills = [...activeSkillLoadoutRef.current];
      if (skillId === null) {
        if (slotIndex < nextSkills.length) {
          nextSkills.splice(slotIndex, 1);
        }
      } else {
        const existingIdx = nextSkills.indexOf(skillId);
        if (existingIdx >= 0 && existingIdx !== slotIndex) {
          nextSkills.splice(existingIdx, 1);
        }
        if (slotIndex < nextSkills.length) {
          nextSkills[slotIndex] = skillId;
        } else {
          nextSkills.push(skillId);
        }
      }

      const validation = validateCombatLoadout({
        activeSkillIds: nextSkills,
        beltConsumables: beltLoadoutRef.current,
        unlockedTalentRanks: unlockedTalentRanksRef.current,
      });
      if (!validation.valid) {
        return { ok: false, error: validation.errors[0] ?? 'Invalid active skill selection.' };
      }

      activeSkillLoadoutRef.current = validation.sanitizedSkillIds;
      setActiveSkillLoadout(validation.sanitizedSkillIds);
      await persistCombatLoadoutProfile(validation.sanitizedSkillIds, beltLoadoutRef.current);
      return { ok: true };
    },
    [persistCombatLoadoutProfile]
  );

  const equipBeltConsumableSlot = useCallback(
    async (slotIndex: number, itemSlug: string | null): Promise<{ ok: boolean; error?: string }> => {
      if (slotIndex < 0 || slotIndex >= 4) {
        return { ok: false, error: 'Invalid belt slot.' };
      }
      const nextBelt = [...beltLoadoutRef.current];
      while (nextBelt.length < 4) nextBelt.push(null);
      nextBelt[slotIndex] = itemSlug;

      const validation = validateCombatLoadout({
        activeSkillIds: activeSkillLoadoutRef.current,
        beltConsumables: nextBelt,
        unlockedTalentRanks: unlockedTalentRanksRef.current,
      });
      if (!validation.valid) {
        return { ok: false, error: validation.errors[0] ?? 'Invalid belt consumable.' };
      }

      beltLoadoutRef.current = validation.sanitizedBeltSlugs;
      setBeltLoadout(validation.sanitizedBeltSlugs);
      await persistCombatLoadoutProfile(activeSkillLoadoutRef.current, validation.sanitizedBeltSlugs);
      return { ok: true };
    },
    [persistCombatLoadoutProfile]
  );

  const claimGuildFieldRations = useCallback((): { granted: number; message: string } => {
    const inv = rawInventoryRef.current;
    const sunleafQty = inv.find((i) => i.slug === 'sunleaf_healing_draught')?.quantity ?? 0;
    const vitalityQty = inv.find((i) => i.slug === 'vitality_elixir')?.quantity ?? 0;

    const dropsToGrant: LootDrop[] = [];
    let granted = 0;
    if (sunleafQty < 2) {
      const delta = 2 - sunleafQty;
      dropsToGrant.push({
        itemSlug: 'sunleaf_healing_draught',
        itemName: 'Sunleaf Healing Draught',
        rarity: 'COMMON',
        quantity: delta,
      });
      granted += delta;
    }
    if (vitalityQty < 1) {
      const delta = 1 - vitalityQty;
      dropsToGrant.push({
        itemSlug: 'vitality_elixir',
        itemName: 'Elixir of Peak Output',
        rarity: 'RARE',
        quantity: delta,
      });
      granted += delta;
    }

    if (dropsToGrant.length > 0) {
      addDropsToInventory(dropsToGrant);
    }

    const nextBelt = [...beltLoadoutRef.current];
    while (nextBelt.length < 4) nextBelt.push(null);
    let beltChanged = false;
    for (const slug of ['sunleaf_healing_draught', 'vitality_elixir']) {
      if (!nextBelt.includes(slug)) {
        const emptyIdx = nextBelt.findIndex((s) => s === null);
        if (emptyIdx >= 0) {
          nextBelt[emptyIdx] = slug;
          beltChanged = true;
        }
      }
    }

    if (beltChanged) {
      const sanitizedBelt = sanitizeBeltLoadout(nextBelt);
      beltLoadoutRef.current = sanitizedBelt;
      setBeltLoadout(sanitizedBelt);
      void persistCombatLoadoutProfile(activeSkillLoadoutRef.current, sanitizedBelt);
    }

    if (granted === 0) {
      return {
        granted: 0,
        message: 'Field rations already topped up (2x Sunleaf Draught, 1x Vitality Elixir).',
      };
    }
    return {
      granted,
      message: `Issued ${granted} Field Ration${granted === 1 ? '' : 's'} and auto-slotted onto your belt.`,
    };
  }, [addDropsToInventory, persistCombatLoadoutProfile]);

  const startGuildQuestEncounter = useCallback(
    (
      questSlug: string,
      companionIds: string[] = []
    ): {
      ok: boolean;
      error?: string;
      state?: TurnBasedCombatState;
      quest?: GuildQuestDefinition;
      serverRunId?: string | null;
    } => {
      const quest =
        guildQuestsRef.current.find((q) => q.questSlug === questSlug) ??
        DEFAULT_GUILD_QUEST_CATALOG.find((q) => q.questSlug === questSlug);
      if (!quest) {
        return { ok: false, error: `Unknown quest '${questSlug}'.` };
      }

      if (!isAdventurerRankSufficient(adventurerRankRef.current, quest.requiredRank)) {
        return {
          ok: false,
          error: `Requires ${quest.requiredRank} Adventurer Rank (currently ${adventurerRankRef.current}).`,
        };
      }

      if (quest.trialRequirements) {
        const reqWorkouts = quest.trialRequirements.workoutsLogged;
        if (typeof reqWorkouts === 'number' && workoutsLoggedCount < reqWorkouts) {
          return {
            ok: false,
            error: `Requires ${reqWorkouts} logged workout${reqWorkouts === 1 ? '' : 's'} (${workoutsLoggedCount}/${reqWorkouts}).`,
          };
        }
        const reqStatLvl = quest.trialRequirements.totalStatLevel;
        if (typeof reqStatLvl === 'number') {
          const s = statsRef.current;
          const totalStatLevel =
            (s.STRENGTH?.level ?? 1) +
            (s.ENDURANCE?.level ?? 1) +
            (s.AGILITY?.level ?? 1) +
            (s.DEXTERITY?.level ?? 1) +
            (s.CONSTITUTION?.level ?? 1) +
            (s.WISDOM?.level ?? 1) +
            (s.SPIRIT?.level ?? 1);
          if (totalStatLevel < reqStatLvl) {
            return {
              ok: false,
              error: `Requires Combined Stat Level ${reqStatLvl} (currently ${totalStatLevel}/${reqStatLvl}).`,
            };
          }
        }
      }

      const inv = rawInventoryRef.current;
      const beltSlots = beltLoadoutRef.current.slice(0, 4).map((itemSlug) => {
        if (!itemSlug) return { itemSlug: null, charges: 0 };
        const ownedQty = inv.find((i) => i.slug === itemSlug)?.quantity ?? 0;
        return { itemSlug, charges: Math.min(3, Math.max(0, ownedQty)) };
      });

      const heroCharId = activeCharacterIdRef.current ?? 'player_hero';
      const heroInput: TurnBasedPartyMemberInput = {
        characterId: heroCharId,
        name: characterName,
        controller: 'PLAYER',
        race: raceRef.current,
        appearanceId,
        customizationConfig: customizationConfigRef.current,
        equippedLoadout: equipmentLoadoutRef.current,
        coreStats: toCoreStatBlock(statsRef.current),
        equipmentBonuses,
        equipmentPrimaryStatBonuses: aggregatedEquipment.primaryStatBonuses,
        unlockedTalentRanks: unlockedTalentRanksRef.current,
        activeSkillIds: activeSkillLoadoutRef.current,
        beltSlots,
        systemicFatigueStacks: projectedFatigue.systemicFatigueStacks,
      };

      const selectedCompanions = ADVENTURER_COMPANY_AI_PRESETS.filter((ally) =>
        companionIds.includes(ally.characterId)
      ).slice(0, 3);

      const encounterId = `guild_run_${Date.now()}`;
      const seed = `${quest.questSlug}:${encounterId}`;
      const state = createTurnBasedEncounter({
        encounterId,
        questSlug: quest.questSlug,
        questTitle: quest.title,
        party: [heroInput, ...selectedCompanions],
        waves: quest.waves,
        seed,
      });

      if (
        isAuthenticated &&
        serverOnline &&
        activeCharacterIdRef.current &&
        !activeCharacterIdRef.current.startsWith('local_')
      ) {
        void startGuildQuestRunApi(quest.questSlug, {
          characterId: activeCharacterIdRef.current,
          companionIds: selectedCompanions.map((c) => c.characterId),
          clientRunId: encounterId,
          clientSeed: seed,
        })
          .then((res) => {
            const srvId = res.data?.run?.id ?? res.data?.runId;
            if (res.ok && typeof srvId === 'string' && srvId) {
              pendingServerRunIdsRef.current[encounterId] = srvId;
            }
          })
          .catch(() => {});
      }

      return { ok: true, state, quest, serverRunId: null };
    },
    [
      aggregatedEquipment.primaryStatBonuses,
      appearanceId,
      characterName,
      equipmentBonuses,
      isAuthenticated,
      projectedFatigue.systemicFatigueStacks,
      serverOnline,
      workoutsLoggedCount,
    ]
  );

  const completeGuildQuestEncounter = useCallback(
    async (params: {
      finalState: TurnBasedCombatState;
      companionIds: string[];
      serverRunId?: string | null;
    }): Promise<{
      ok: boolean;
      syncedOnline: boolean;
      queuedOffline: boolean;
      goldAwarded: number;
      reputationAwarded: number;
      drops: LootDrop[];
      promotedToRank: AdventurerRank | null;
      error?: string;
    }> => {
      const { finalState, companionIds, serverRunId } = params;
      const quest =
        guildQuestsRef.current.find((q) => q.questSlug === finalState.questSlug) ??
        DEFAULT_GUILD_QUEST_CATALOG.find((q) => q.questSlug === finalState.questSlug);

      // Deduct consumables used during the encounter
      const usedMap = finalState.consumablesUsed ?? {};
      let nextInv = [...rawInventoryRef.current];
      let invModified = false;
      for (const [slug, usedQty] of Object.entries(usedMap)) {
        if (!usedQty || usedQty <= 0) continue;
        const idx = nextInv.findIndex((i) => i.slug === slug);
        if (idx >= 0) {
          invModified = true;
          const remaining = nextInv[idx]!.quantity - usedQty;
          if (remaining > 0) {
            nextInv[idx] = { ...nextInv[idx]!, quantity: remaining };
          } else {
            nextInv.splice(idx, 1);
          }
        }
      }
      if (invModified) {
        rawInventoryRef.current = nextInv;
        setRawInventory(nextInv);
      }

      if (finalState.status !== 'VICTORY' || !quest) {
        if (currentProfileRef.current && invModified) {
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
        return {
          ok: true,
          syncedOnline: false,
          queuedOffline: false,
          goldAwarded: 0,
          reputationAwarded: 0,
          drops: [],
          promotedToRank: null,
        };
      }

      const goldAwarded = quest.goldReward;
      const reputationAwarded = quest.reputationReward;
      const nextGold = goldRef.current + goldAwarded;
      goldRef.current = nextGold;
      setGold(nextGold);

      const nextRep = adventurerReputationRef.current + reputationAwarded;
      adventurerReputationRef.current = nextRep;
      setAdventurerReputation(nextRep);

      // Roll deterministic loot drops from quest.lootTable
      const drops: LootDrop[] = [];
      const lootRolls = Math.max(1, quest.lootRolls ?? 1);
      if (quest.lootTable.length > 0) {
        const lootRng = createSeededRng(`${finalState.rngSeed}:loot`);
        const totalWeight = quest.lootTable.reduce((sum, entry) => sum + Math.max(1, entry.weight), 0);
        for (let r = 0; r < lootRolls; r++) {
          let roll = lootRng.next() * totalWeight;
          let chosen = quest.lootTable[0]!;
          for (const entry of quest.lootTable) {
            roll -= Math.max(1, entry.weight);
            if (roll <= 0) {
              chosen = entry;
              break;
            }
          }
          drops.push({
            itemSlug: chosen.itemSlug,
            itemName: chosen.itemName,
            rarity: chosen.rarity,
            quantity: chosen.quantity,
          });
        }
        if (drops.length > 0) {
          addDropsToInventory(drops);
        }
      }

      // Mark quest completed
      const completedSet = new Set(completedGuildQuestSlugsRef.current);
      completedSet.add(quest.questSlug);
      const nextCompletedSlugs = Array.from(completedSet);
      completedGuildQuestSlugsRef.current = nextCompletedSlugs;
      setCompletedGuildQuestSlugs(nextCompletedSlugs);

      // Rank promotion on Rank-Up Trials
      let promotedToRank: AdventurerRank | null = null;
      let nextRank = adventurerRankRef.current;
      if (
        quest.category === 'RANK_UP_TRIAL' &&
        quest.unlocksRank &&
        !isAdventurerRankSufficient(nextRank, quest.unlocksRank)
      ) {
        nextRank = quest.unlocksRank as AdventurerRank;
        promotedToRank = nextRank;
        adventurerRankRef.current = nextRank;
        setAdventurerRank(nextRank);
        const completedBountySlugs = bountiesRef.current
          .filter((b) => b.completed)
          .map((b) => b.slug);
        const refreshedBounties = buildBountiesForCharacter(nextRank, completedBountySlugs);
        bountiesRef.current = refreshedBounties;
        setBounties(refreshedBounties);
      }

      if (currentProfileRef.current) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          gold: nextGold,
          adventurerReputation: nextRep,
          adventurerRank: nextRank,
          inventory: rawInventoryRef.current,
          completedGuildQuestSlugs: nextCompletedSlugs,
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

      const heroUnit = finalState.units.find((u) => u.controller === 'PLAYER');
      const beltSnapshot = (heroUnit?.beltSlots ?? []).map((b) => ({
        itemSlug: b.itemSlug,
        charges: b.charges,
      }));
      const completedAt = new Date().toISOString();
      const charId = activeCharacterIdRef.current ?? remoteCharacterIdRef.current;
      const resolvedServerRunId =
        serverRunId ?? pendingServerRunIdsRef.current[finalState.encounterId] ?? null;

      let syncedOnline = false;
      if (isAuthenticated && serverOnline && charId && !charId.startsWith('local_')) {
        try {
          if (resolvedServerRunId) {
            const res = await completeGuildQuestRunApi(resolvedServerRunId, {
              actions: finalState.actionLog,
            });
            syncedOnline = res.ok;
          } else {
            const res = await syncOfflineGuildQuestRunsApi({
              characterId: charId,
              completedRuns: [
                {
                  clientRunId: finalState.encounterId,
                  questSlug: finalState.questSlug,
                  randomSeed: finalState.rngSeed,
                  companionIds,
                  actions: finalState.actionLog,
                  beltSnapshot,
                  completedAt,
                },
              ],
            });
            syncedOnline = res.ok;
          }
        } catch {
          syncedOnline = false;
        }
      }

      if (!syncedOnline) {
        const queuedRun: QueuedOfflineGuildQuestRun = {
          clientRunId: finalState.encounterId,
          characterId: charId,
          questSlug: finalState.questSlug,
          randomSeed: finalState.rngSeed,
          companionIds,
          actions: finalState.actionLog,
          beltSnapshot,
          completedAt,
        };
        const nextQueued = [...queuedOfflineGuildRunsRef.current, queuedRun];
        queuedOfflineGuildRunsRef.current = nextQueued;
        setQueuedOfflineGuildRuns(nextQueued);
        persistBundleSnapshot({ queuedOfflineGuildRuns: nextQueued });
      }

      return {
        ok: true,
        syncedOnline,
        queuedOffline: !syncedOnline,
        goldAwarded,
        reputationAwarded,
        drops,
        promotedToRank,
      };
    },
    [addDropsToInventory, isAuthenticated, persistBundleSnapshot, serverOnline]
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
      setId?: string;
      exerciseId: string;
      exerciseName?: string;
      reps: number;
      weightKg: number;
      rpe?: number | null;
      isWarmup?: boolean;
      setType?: SetType;
      supersetGroupId?: string | null;
      plannedRestSeconds?: number;
      customRestSeconds?: number;
      nextSetHint?: { exerciseId: string; exerciseName: string; weightKg: number; reps: number };
    }) => {
      const ex = STARTER_EXERCISES.find((e) => e.id === params.exerciseId);
      const nowMs = Date.now();
      const resolvedSetId = params.setId ?? `set_${nowMs}`;
      const next = transitionHybridWorkoutState(workoutMachine, {
        type: 'LOG_SET',
        setId: resolvedSetId,
        exerciseId: params.exerciseId,
        exerciseName: params.exerciseName ?? ex?.name ?? params.exerciseId,
        reps: params.reps,
        weightKg: params.weightKg,
        rpe: params.rpe ?? null,
        isWarmup: params.isWarmup,
        setType: params.setType,
        supersetGroupId: params.supersetGroupId,
        exerciseBaseXpFactor: ex?.baseXpFactor ?? 1.0,
        historicalPR: historicalPRs[params.exerciseId],
        customRestSeconds: params.plannedRestSeconds ?? params.customRestSeconds,
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

  const unlogHybridSet = useCallback(
    (setId: string) => {
      const next = transitionHybridWorkoutState(workoutMachine, {
        type: 'UNLOG_SET',
        setId,
      });
      if (next.lastError) {
        return { ok: false, error: next.lastError };
      }
      const adjustedNext =
        next.activeSession && next.activeSession.setLogs.length === 0 && next.phase === 'Resting'
          ? {
              ...next,
              phase: 'DungeonActive' as const,
              activeSession: {
                ...next.activeSession,
                restTimer: {
                  ...next.activeSession.restTimer,
                  isActive: false,
                  remainingSeconds: 0,
                  startedAtMs: null,
                  endsAtMs: null,
                },
              },
            }
          : next;
      setWorkoutMachine(adjustedNext);
      if (adjustedNext.phase !== 'Resting') {
        cancelStaminaRechargedNotification().catch(() => {});
      }
      return { ok: true };
    },
    [workoutMachine]
  );

  const updateHybridSet = useCallback(
    (params: {
      setId: string;
      exerciseId?: string;
      reps?: number;
      weightKg?: number;
      rpe?: number | null;
      isWarmup?: boolean;
      setType?: SetType;
      supersetGroupId?: string | null;
    }) => {
      const ex = params.exerciseId
        ? STARTER_EXERCISES.find((e) => e.id === params.exerciseId)
        : undefined;
      const historicalPR = params.exerciseId ? historicalPRs[params.exerciseId] : undefined;
      const next = transitionHybridWorkoutState(workoutMachine, {
        type: 'UPDATE_SET',
        setId: params.setId,
        reps: params.reps,
        weightKg: params.weightKg,
        rpe: params.rpe,
        isWarmup: params.isWarmup,
        setType: params.setType,
        supersetGroupId: params.supersetGroupId,
        exerciseBaseXpFactor: ex?.baseXpFactor ?? 1.0,
        historicalPR,
      });
      if (next.lastError) {
        return { ok: false, error: next.lastError };
      }
      setWorkoutMachine(next);
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
      const prev = workoutMachineRef.current;
      const next = transitionHybridWorkoutState(prev, {
        type: 'ADJUST_REST_TIMER',
        deltaSeconds: params.deltaSeconds,
        newDurationSeconds: params.newDurationSeconds,
        nowMs: Date.now(),
      });
      workoutMachineRef.current = next;
      setWorkoutMachine(next);
      if (prev.phase === 'Resting' && next.phase === 'DungeonActive') {
        cancelStaminaRechargedNotification().catch(() => {});
        triggerSensoryCue('STAMINA_RECHARGED_PULSE');
      } else {
        triggerSensoryCue('SET_MICRO_REWARD_TICK');
      }
    },
    []
  );

  const skipHybridRest = useCallback(() => {
    cancelStaminaRechargedNotification().catch(() => {});
    setWorkoutMachine((prev) => {
      const next = transitionHybridWorkoutState(prev, { type: 'SKIP_REST' });
      workoutMachineRef.current = next;
      return next;
    });
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
      workoutMachineRef.current = nextMachine;
      cancelStaminaRechargedNotification().catch(() => {});
      setFatigueState(fatigueTransition.nextState);
      historicalPRsRef.current = evalResult.updatedPRs;
      setHistoricalPRs(evalResult.updatedPRs);
      setLastWorkoutResult(evalResult);
      consistencyStreakRef.current = nextStreak;
      setConsistencyStreak(nextStreak);
      if (payload.resilienceBonus.triggered) {
        setResilienceShields((s) => s + 1);
      }

      const nextStats = {
        ...statsRef.current,
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
      };
      statsRef.current = nextStats;
      setStats(nextStats);

      const nextGold = goldRef.current + payload.totalGoldAwarded;
      goldRef.current = nextGold;
      setGold(nextGold);

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

      const inferredCategory: WorkoutCategory =
        active.workoutType === 'RESISTANCE'
          ? 'GYM'
          : active.workoutType === 'ACTIVE_RECOVERY'
          ? 'RECOVERY'
          : active.workoutType === 'CARDIO_HIGH_INTENSITY'
          ? 'SPORT'
          : 'CARDIO';

      const verificationSource =
        telemetryOptions?.source ??
        (telemetryOptions?.isHardwareVerified ? 'WEARABLE_TELEMETRY' : 'MANUAL_HONESTY');
      const isHardwareVerified = Boolean(telemetryOptions?.isHardwareVerified);

      const fallbackUnsyncedPayload: QueuedOfflineWorkoutPayload = {
        queueId: `q_hybrid_${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
        sessionId: active.sessionId,
        characterId: ownerCharacterId,
        performedAtIso: now.toISOString(),
        durationSeconds: payload.durationSeconds,
        workoutType: active.workoutType,
        workoutCategory: inferredCategory,
        sets: active.setLogs.map((s) => ({
          exerciseId: s.exerciseId,
          exerciseName: s.exerciseName || s.exerciseId,
          reps: s.reps,
          weightKg: s.weightKg,
          rpe: s.rpe ?? null,
          isWarmup: s.isWarmup,
          setType: s.setType,
          supersetGroupId: s.supersetGroupId ?? null,
        })),
        cardioSegments: active.cardioSegments,
        channelToRaidId: channelToRaidId ?? null,
        telemetrySamples: telemetryOptions?.samples,
        verificationSource,
        isHardwareVerified,
      };

      const enqueueUnsyncedHybridPayload = () => {
        const alreadyExists = unsyncedServerRef.current.some(
          (u) => u.sessionId === fallbackUnsyncedPayload.sessionId
        );
        if (alreadyExists) return;
        const nextUnsynced = [...unsyncedServerRef.current, fallbackUnsyncedPayload];
        unsyncedServerRef.current = nextUnsynced;
        setUnsyncedServerPayloads(nextUnsynced);
        persistBundleSnapshot({ unsyncedServerPayloads: nextUnsynced });
      };

      const charId =
        ownerCharacterId &&
        !ownerCharacterId.startsWith('local_') &&
        ownerCharacterId !== DEFAULT_LOCAL_CHARACTER_ID
          ? ownerCharacterId
          : remoteCharacterIdRef.current &&
              !remoteCharacterIdRef.current.startsWith('local_') &&
              remoteCharacterIdRef.current !== DEFAULT_LOCAL_CHARACTER_ID
            ? remoteCharacterIdRef.current
            : null;

      if (charId && serverOnline) {
        apiFetch(`/api/characters/${charId}/workouts`, {
          method: 'POST',
          body: JSON.stringify({
            sessionId: active.sessionId,
            workoutType: active.workoutType,
            workoutCategory: inferredCategory,
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
            verificationSource,
            isHardwareVerified,
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
        })
          .then((res) => {
            if (!res.ok && res.status !== 400) {
              enqueueUnsyncedHybridPayload();
            }
          })
          .catch(() => {
            enqueueUnsyncedHybridPayload();
          });
      } else {
        enqueueUnsyncedHybridPayload();
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
        cardioEntries: (active.cardioSegments ?? []).map((seg) => ({
          exerciseId: seg.exerciseId,
          exerciseName:
            STARTER_EXERCISES.find((e) => e.id === seg.exerciseId)?.name ?? seg.activityType,
          activityType: seg.activityType,
          durationSeconds: seg.durationSeconds,
          averageHrZone: seg.averageHrZone,
        })),
      };

      const nextHistory = [onlineRecord, ...workoutHistoryRef.current];
      workoutHistoryRef.current = nextHistory;
      setWorkoutHistory(nextHistory);

      const nextCharWorkoutsCount = countWorkoutsForCharacter(nextHistory, ownerCharacterId);
      setRemoteCharacterWorkoutsCount((prev) => Math.max(prev, nextCharWorkoutsCount));

      if (currentProfileRef.current && currentProfileRef.current.id === ownerCharacterId) {
        const updatedProfile: PersistedCharacterProfile = {
          ...currentProfileRef.current,
          stats: nextStats,
          gold: nextGold,
          inventory: rawInventoryRef.current,
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
        unsyncedServerPayloads: unsyncedServerRef.current,
        characterProfile: currentProfileRef.current,
        availableCharacters: availableCharactersRef.current,
      });

      return { ok: true };
    },
    [addDropsToInventory, consistencyStreak, fatigueState, historicalPRs, persistBundleSnapshot, serverOnline, stats, workoutMachine]
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
    cancelStaminaRechargedNotification().catch(() => {});
    setWorkoutMachine((prev) => {
      if (
        prev.phase === 'LootReview' &&
        prev.activeSession?.rewardPayload &&
        !prev.activeSession.rewardPayload.lootChest.opened
      ) {
        addDropsToInventory(prev.activeSession.rewardPayload.lootChest.drops);
      }
      const next = transitionHybridWorkoutState(prev, { type: 'COMPLETE_REVIEW', nowMs: Date.now() });
      workoutMachineRef.current = next;
      return next;
    });
  }, [addDropsToInventory]);

  const abandonHybridSession = useCallback(() => {
    cancelStaminaRechargedNotification().catch(() => {});
    setArrivalBanner(null);
    const fresh = createInitialHybridMachineState();
    workoutMachineRef.current = fresh;
    setWorkoutMachine(fresh);
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
    setGuildName,
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
    saveExerciseMachineLoadMode,
    defaultWeightUnit,
    setDefaultWeightUnit,
    warmupPresetCount,
    setWarmupPresetCount,
    activeSkillLoadout,
    beltLoadout,
    equipActiveSkillSlot,
    equipBeltConsumableSlot,
    guildQuests,
    completedGuildQuestSlugs,
    queuedOfflineGuildRuns,
    claimGuildFieldRations,
    startGuildQuestEncounter,
    completeGuildQuestEncounter,
    syncOfflineGuildRuns,
    activeProgramEnrollment,
    enrollInWorkoutProgram,
    guideOnboardingCompleted,
    completeGuideOnboarding,
    dismissGuideOnboarding,
    craftItemRecipe,
    upgradeInventoryGear,
    reforgeInventoryGear,
    buyTraderOffer,
    sellInventoryItemToTrader,
    respecCharacterTalentTrees,
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
    unlogHybridSet,
    updateHybridSet,
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
    consumeInventoryItem,
    startGatheringTask,
    completeGatheringNow,
    syncGatheringTicks,
    startDungeonExpedition,
    resolveActiveDungeonNow,
    claimExpeditionSpoils,
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
    race,
    customizationConfig,
    characters: availableCharacters,
    deletedCharacters,
    activeCharacterId,
    switchCharacter,
    createCharacter,
    updateCharacterAppearance,
    updateCharacterCustomization,
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
