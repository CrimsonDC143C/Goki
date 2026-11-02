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
  DEFAULT_TALENT_TREES,
  DerivedCombatAttributes,
  DungeonCombatReplayResult,
  DungeonDefinition,
  DungeonWorkoutBuff,
  EquipItemType,
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
  primaryStat: StatType;
  baseXpFactor: number;
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
  startDungeonExpedition: (selectedPartyIds: string[]) => { ok: boolean; error?: string };
  resolveActiveDungeonNow: () => void;
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
  characters: PersistedCharacterProfile[];
  activeCharacterId: string | null;
  switchCharacter: (characterId: string) => Promise<boolean>;
  createCharacter: (
    name: string,
    mode: 'STANDARD' | 'IRONMAN_VERIFIED',
    avatarSpriteId?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  refreshCharacterSheet: () => Promise<void>;
  login: (credentials: LoginPayload) => Promise<{ ok: boolean; error?: string }>;
  register: (payload: RegisterPayload) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const STARTER_EXERCISES: ExerciseCatalogItem[] = [
  ...DEFAULT_EXERCISE_CATALOG.map((catItem) => ({
    id: catItem.slug,
    name: catItem.name,
    category: catItem.category,
    primaryStat: catItem.primaryStat,
    baseXpFactor: catItem.baseXpFactor,
  })),
  { id: 'bench_press', name: 'Barbell Bench Press', category: 'RESISTANCE' as const, primaryStat: 'STRENGTH' as const, baseXpFactor: 1.1 },
  { id: 'barbell_squat', name: 'Barbell Back Squat', category: 'RESISTANCE' as const, primaryStat: 'STRENGTH' as const, baseXpFactor: 1.15 },
  { id: 'deadlift', name: 'Barbell Deadlift', category: 'RESISTANCE' as const, primaryStat: 'STRENGTH' as const, baseXpFactor: 1.2 },
  { id: 'overhead_press', name: 'Standing Overhead Press', category: 'RESISTANCE' as const, primaryStat: 'STRENGTH' as const, baseXpFactor: 1.1 },
  { id: 'weighted_pullup', name: 'Weighted Pull-Up', category: 'RESISTANCE' as const, primaryStat: 'STRENGTH' as const, baseXpFactor: 1.1 },
  { id: 'zone2_run', name: 'Aerobic Run (Zone 2 Base)', category: 'CARDIO' as const, primaryStat: 'ENDURANCE' as const, baseXpFactor: 1.05 },
  { id: 'indoor_cycle', name: 'Stationary / Road Cycling', category: 'CARDIO' as const, primaryStat: 'ENDURANCE' as const, baseXpFactor: 1.0 },
  { id: 'hiit_rower', name: 'Rowing Ergometer HIIT', category: 'CARDIO' as const, primaryStat: 'AGILITY' as const, baseXpFactor: 1.05 },
  { id: 'sprint_intervals', name: 'Track / Assault Bike Sprints', category: 'CARDIO' as const, primaryStat: 'AGILITY' as const, baseXpFactor: 1.1 },
  { id: 'mobility_yoga', name: 'Mobility & Restoration Yoga', category: 'RECOVERY_MOBILITY' as const, primaryStat: 'ENDURANCE' as const, baseXpFactor: 1.0 },
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
  malakor_signet: {
    itemType: 'ACCESSORY',
    description: 'Trophy signet ring dropped by Bone Lord Malakor.',
    requiredStrength: 2,
    requiredEndurance: 2,
    requiredAgility: 2,
    statBonuses: { meleePower: 14, maxHp: 65, critChance: 0.05 },
  },
  crown_of_the_wyrm: {
    itemType: 'HEAD',
    description: 'Mythic helm awarded to slayers of Ignisrax, World-Forge Wyrm.',
    requiredStrength: 5,
    requiredEndurance: 5,
    requiredAgility: 5,
    statBonuses: { meleePower: 35, armorRating: 35, maxHp: 180, critChance: 0.08 },
  },
  warden_chainmail: {
    itemType: 'CHEST',
    description: 'Endurance-fitted hauberk forged for sustained dungeon expeditions.',
    requiredStrength: 2,
    requiredEndurance: 3,
    statBonuses: { armorRating: 24, maxHp: 90, maxStamina: 30 },
  },
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
    {
      roomNumber: 4,
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

  const [workoutsLoggedCount, setWorkoutsLoggedCount] = useState(2);
  const [consistencyStreak, setConsistencyStreak] = useState(2);
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

  // 8-Slot Explicit Equipment Loadout + Raw Bag Inventory
  const [equipmentLoadout, setEquipmentLoadout] = useState<EquipmentLoadoutMap>({
    mainHand: 'ironbound_greatsword',
    offHand: null,
    head: 'ashen_iron_helm',
    chest: 'warden_chainmail',
    legs: 'strider_greaves',
    boots: 'ironshod_sabatons',
    accessory1: 'copper_guild_ring',
    accessory2: null,
  });

  const [rawInventory, setRawInventory] = useState<InventoryEntry[]>([
    {
      slug: 'ironbound_greatsword',
      name: 'Ironbound Greatsword',
      description: 'Heavy two-handed blade forged for strength vanguard builds.',
      rarity: 'UNCOMMON',
      quantity: 1,
      itemType: 'WEAPON',
      weaponHandedness: 'TWO_HANDED',
      requiredStrength: 3,
      statBonuses: { meleePower: 22, critChance: 0.03 },
    },
    {
      slug: 'tempered_iron_buckler',
      name: 'Tempered Iron Buckler',
      description: 'Reinforced off-hand parrying shield forged at the Guild Foundry.',
      rarity: 'UNCOMMON',
      quantity: 1,
      itemType: 'OFFHAND',
      requiredStrength: 3,
      requiredEndurance: 2,
      statBonuses: { armorRating: 12, maxHp: 35 },
    },
    {
      slug: 'ashen_iron_helm',
      name: 'Ashen Vanguard Greathelm',
      description: 'Dark-forged iron visor offering solid cranial protection.',
      rarity: 'UNCOMMON',
      quantity: 1,
      itemType: 'HEAD',
      requiredStrength: 4,
      statBonuses: { armorRating: 10, maxHp: 45 },
    },
    {
      slug: 'warden_chainmail',
      name: "Warden's Tempered Hauberk",
      description: 'Endurance-fitted armor built for 24-hour dungeon expeditions.',
      rarity: 'RARE',
      quantity: 1,
      itemType: 'CHEST',
      requiredStrength: 2,
      requiredEndurance: 3,
      statBonuses: { armorRating: 24, maxHp: 90, maxStamina: 30 },
    },
    {
      slug: 'strider_greaves',
      name: 'Outrider Leather Greaves',
      description: 'Articulated leg guards favoring aerobic march stamina.',
      rarity: 'UNCOMMON',
      quantity: 1,
      itemType: 'LEGS',
      requiredEndurance: 3,
      statBonuses: { armorRating: 8, maxStamina: 20 },
    },
    {
      slug: 'ironshod_sabatons',
      name: 'Ironshod March Boots',
      description: 'Sure-footed greave boots plated against dungeon floor hazards.',
      rarity: 'COMMON',
      quantity: 1,
      itemType: 'BOOTS',
      requiredEndurance: 2,
      statBonuses: { armorRating: 6, dodgeRating: 0.02 },
    },
    {
      slug: 'copper_guild_ring',
      name: 'Copper Guild Signet',
      description: 'Issued upon induction into the Iron Vanguard guild hall.',
      rarity: 'COMMON',
      quantity: 1,
      itemType: 'ACCESSORY',
      requiredStrength: 1,
      statBonuses: { meleePower: 4, maxHp: 20 },
    },
    {
      slug: 'crimson_oni_charm',
      name: 'Crimson Oni War-Charm',
      description: 'Carved battle talisman resonating with disciplined physical grit.',
      rarity: 'RARE',
      quantity: 1,
      itemType: 'ACCESSORY',
      requiredStrength: 5,
      requiredEndurance: 4,
      statBonuses: { meleePower: 9, critChance: 0.04, maxStamina: 15 },
    },
    {
      slug: 'windrunner_daggers',
      name: 'Twin Windrunner Blades',
      description: 'Featherweight blades scaling with peak high-zone Agility.',
      rarity: 'RARE',
      quantity: 1,
      itemType: 'WEAPON',
      weaponHandedness: 'ONE_HANDED',
      requiredAgility: 6, // Requires AGI 6 (demonstrates stat-gate check clearly!)
      statBonuses: { meleePower: 25, attackSpeedPct: 0.16, dodgeRating: 0.06, critChance: 0.07 },
    },
    {
      slug: 'vitality_elixir',
      name: 'Elixir of Peak Output',
      description: 'Alchemical draught distilled from Sunleaf herbs (+25 Stamina).',
      rarity: 'RARE',
      quantity: 2,
      itemType: 'CONSUMABLE',
      statBonuses: { maxStamina: 25 },
    },
    {
      slug: 'iron_ore_cluster',
      name: 'Rich Iron Ore Cluster',
      description: 'Raw iron ore cluster mined from Iron Crag veins.',
      rarity: 'COMMON',
      quantity: 3,
      itemType: 'MATERIAL',
    },
    {
      slug: 'sunleaf_herb_bundle',
      name: 'Sunleaf Herb Bundle',
      description: 'Restorative wild herbs used in stamina alchemy.',
      rarity: 'COMMON',
      quantity: 2,
      itemType: 'MATERIAL',
    },
  ]);

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

  const [bounties, setBounties] = useState<GuildBountyItem[]>([
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
  ]);

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
  const [workoutHistory, setWorkoutHistory] = useState<CompletedWorkoutRecord[]>(
    DEFAULT_SAMPLE_WORKOUT_HISTORY
  );
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
      workoutHistory:
        partial.workoutHistory ?? workoutHistoryRef.current,
      characterProfile:
        partial.characterProfile !== undefined ? partial.characterProfile : currentProfileRef.current,
      availableCharacters:
        partial.availableCharacters ?? availableCharactersRef.current,
      activeCharacterId:
        partial.activeCharacterId !== undefined ? partial.activeCharacterId : activeCharacterIdRef.current,
    };
    void savePersistedOfflineBundle(nextBundle);
  }, []);

  const recordWorkoutHistory = useCallback((record: CompletedWorkoutRecord) => {
    setWorkoutHistory((prev) => {
      const next = [record, ...prev.filter((r) => r.id !== record.id)];
      workoutHistoryRef.current = next;
      persistBundleSnapshot({ workoutHistory: next });
      return next;
    });
  }, [persistBundleSnapshot]);

  const clearWorkoutHistory = useCallback(() => {
    workoutHistoryRef.current = [];
    setWorkoutHistory([]);
    persistBundleSnapshot({ workoutHistory: [] });
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
      if (loaded.availableCharacters && loaded.availableCharacters.length > 0) {
        availableCharactersRef.current = loaded.availableCharacters;
        setAvailableCharacters(loaded.availableCharacters);
      }
      if (loaded.activeCharacterId) {
        activeCharacterIdRef.current = loaded.activeCharacterId;
        setActiveCharacterId(loaded.activeCharacterId);
      }
      if (loaded.workoutHistory && loaded.workoutHistory.length > 0) {
        workoutHistoryRef.current = loaded.workoutHistory;
        setWorkoutHistory(loaded.workoutHistory);
      }
      if (loaded.characterProfile) {
        currentProfileRef.current = loaded.characterProfile;
        const cp = loaded.characterProfile;
        remoteCharacterIdRef.current = cp.id;
        setActiveCharacterId(cp.id);
        setCharacterName(cp.name);
        setGameMode(cp.gameMode);
        if (cp.adventurerRank) setAdventurerRank(cp.adventurerRank as AdventurerRank);
        if (typeof cp.adventurerReputation === 'number') setAdventurerReputation(cp.adventurerReputation);
        if (typeof cp.gold === 'number') setGold(cp.gold);
        if (cp.stats) setStats((prev) => ({ ...prev, ...cp.stats }));
        if (Array.isArray(cp.inventory)) setRawInventory(cp.inventory);
        if (cp.unlockedTalentRanks) setUnlockedTalentRanks(cp.unlockedTalentRanks);
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

  const applyCharacterToState = useCallback(
    (char: any, fullSheet?: any) => {
      if (!char) return;
      remoteCharacterIdRef.current = char.id;
      activeCharacterIdRef.current = char.id;
      setActiveCharacterId(char.id);
      setCharacterName(char.name || 'Hero');
      const mode = char.gameMode || 'STANDARD';
      setGameMode(mode);
      if (char.adventurerRank) setAdventurerRank(char.adventurerRank);
      if (typeof char.adventurerReputation === 'number') {
        setAdventurerReputation(char.adventurerReputation);
      }
      if (typeof char.gold === 'number') {
        setGold(char.gold);
      }

      const s = char.stats || fullSheet?.character?.stats;
      const nextStats = {
        STRENGTH: {
          level: s?.strengthLevel ?? 1,
          xp: s?.strengthXp ?? 0,
          pointsAvailable: s?.strengthTalentPointsAvailable ?? 0,
        },
        ENDURANCE: {
          level: s?.enduranceLevel ?? 1,
          xp: s?.enduranceXp ?? 0,
          pointsAvailable: s?.enduranceTalentPointsAvailable ?? 0,
        },
        AGILITY: {
          level: s?.agilityLevel ?? 1,
          xp: s?.agilityXp ?? 0,
          pointsAvailable: s?.agilityTalentPointsAvailable ?? 0,
        },
        DEXTERITY: {
          level: char.dexLevel ?? 1,
          xp: char.dexXp ?? 0,
          pointsAvailable: 0,
        },
        CONSTITUTION: {
          level: char.conLevel ?? 1,
          xp: char.conXp ?? 0,
          pointsAvailable: 0,
        },
        WISDOM: {
          level: char.wisLevel ?? 1,
          xp: char.wisXp ?? 0,
          pointsAvailable: 0,
        },
        SPIRIT: {
          level: char.sprLevel ?? 1,
          xp: char.sprXp ?? 0,
          pointsAvailable: 0,
        },
      };
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

      if (Array.isArray(fullSheet?.character?.talentUnlocks)) {
        const ranks: Record<string, number> = {};
        for (const u of fullSheet.character.talentUnlocks) {
          if (u.talentNode?.slug) {
            ranks[u.talentNode.slug] = u.currentRank;
          }
        }
        setUnlockedTalentRanks(ranks);
      }

      const charProfile: PersistedCharacterProfile = {
        id: char.id,
        name: char.name,
        gameMode: mode,
        avatarSpriteId: char.avatarSpriteId || 'adventurer_default',
        overallLevel: char.overallLevel ?? 1,
        adventurerRank: char.adventurerRank || 'COPPER',
        adventurerReputation: char.adventurerReputation ?? 0,
        gold: char.gold ?? 100,
        stats: nextStats,
        lastSyncedAtMs: Date.now(),
      };
      currentProfileRef.current = charProfile;
      persistBundleSnapshot({
        characterProfile: charProfile,
        activeCharacterId: char.id,
      });
    },
    [persistBundleSnapshot]
  );

  const syncRemoteCharacters = useCallback(
    (primaryChar: any, allChars?: any[]) => {
      if (!primaryChar && (!allChars || allChars.length === 0)) return;
      const rawList = allChars && allChars.length > 0 ? allChars : [primaryChar];
      const mappedProfiles: PersistedCharacterProfile[] = rawList.map((c: any) => ({
        id: c.id,
        name: c.name,
        gameMode: c.gameMode,
        avatarSpriteId: c.avatarSpriteId || 'adventurer_default',
        overallLevel: c.overallLevel ?? 1,
        adventurerRank: c.adventurerRank || 'COPPER',
        adventurerReputation: c.adventurerReputation ?? 0,
        gold: c.gold ?? 100,
        stats: {
          STRENGTH: {
            level: c.stats?.strengthLevel ?? 1,
            xp: c.stats?.strengthXp ?? 0,
            pointsAvailable: c.stats?.strengthTalentPointsAvailable ?? 0,
          },
          ENDURANCE: {
            level: c.stats?.enduranceLevel ?? 1,
            xp: c.stats?.enduranceXp ?? 0,
            pointsAvailable: c.stats?.enduranceTalentPointsAvailable ?? 0,
          },
          AGILITY: {
            level: c.stats?.agilityLevel ?? 1,
            xp: c.stats?.agilityXp ?? 0,
            pointsAvailable: c.stats?.agilityTalentPointsAvailable ?? 0,
          },
          DEXTERITY: { level: c.dexLevel ?? 1, xp: c.dexXp ?? 0, pointsAvailable: 0 },
          CONSTITUTION: { level: c.conLevel ?? 1, xp: c.conXp ?? 0, pointsAvailable: 0 },
          WISDOM: { level: c.wisLevel ?? 1, xp: c.wisXp ?? 0, pointsAvailable: 0 },
          SPIRIT: { level: c.sprLevel ?? 1, xp: c.sprXp ?? 0, pointsAvailable: 0 },
        },
      }));

      setAvailableCharacters(mappedProfiles);
      availableCharactersRef.current = mappedProfiles;
      persistBundleSnapshot({ availableCharacters: mappedProfiles });

      const currentActiveId = activeCharacterIdRef.current;
      const targetChar =
        (currentActiveId && rawList.find((c: any) => c.id === currentActiveId)) ||
        primaryChar ||
        rawList[0];

      if (targetChar) {
        applyCharacterToState(targetChar);
        void fetchCharacterSheet(targetChar.id).then((res) => {
          if (res.ok && res.data) {
            applyCharacterToState(res.data.character, res.data);
          }
        });
      }
    },
    [applyCharacterToState, persistBundleSnapshot]
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
      avatarSpriteId?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      // Enforce the 2-character limit: 1 Standard, 1 Ironman
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

      if (serverOnline) {
        const res = await createCharacterAccount({
          name,
          gameMode: mode,
          avatarSpriteId: avatarSpriteId ?? 'adventurer_default',
        });
        if (!res.ok || !res.data?.character) {
          return { ok: false, error: res.error || 'Failed to forge hero on realm server.' };
        }
        const newChar = res.data.character;
        const nextList = [...availableCharactersRef.current, newChar];
        syncRemoteCharacters(newChar, nextList);
        return { ok: true };
      } else {
        // Offline hero creation fallback
        const localChar: PersistedCharacterProfile = {
          id: `local_char_${Date.now()}`,
          name,
          gameMode: mode,
          avatarSpriteId: avatarSpriteId ?? 'adventurer_default',
          overallLevel: 1,
          adventurerRank: 'COPPER',
          adventurerReputation: 0,
          gold: 100,
          stats: {
            STRENGTH: { level: 1, xp: 0, pointsAvailable: 0 },
            ENDURANCE: { level: 1, xp: 0, pointsAvailable: 0 },
            AGILITY: { level: 1, xp: 0, pointsAvailable: 0 },
            DEXTERITY: { level: 1, xp: 0, pointsAvailable: 0 },
            CONSTITUTION: { level: 1, xp: 0, pointsAvailable: 0 },
            WISDOM: { level: 1, xp: 0, pointsAvailable: 0 },
            SPIRIT: { level: 1, xp: 0, pointsAvailable: 0 },
          },
        };
        const nextList = [...availableCharactersRef.current, localChar];
        syncRemoteCharacters(localChar, nextList);
        return { ok: true };
      }
    },
    [serverOnline, syncRemoteCharacters]
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
      const res = await loginAccount(credentials);
      if (res.ok && res.data) {
        setAuthTokenState(res.data.token);
        setCurrentUser(res.data.user);
        syncRemoteCharacters(res.data.character, res.data.characters);
        setServerOnline(true);
        return { ok: true };
      }
      return { ok: false, error: res.error };
    },
    [syncRemoteCharacters]
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const res = await registerAccount(payload);
      if (res.ok && res.data) {
        setAuthTokenState(res.data.token);
        setCurrentUser(res.data.user);
        syncRemoteCharacters(res.data.character, res.data.characters);
        setServerOnline(true);
        return { ok: true };
      }
      return { ok: false, error: res.error };
    },
    [syncRemoteCharacters]
  );

  const logout = useCallback(async () => {
    await logoutAccount();
    setAuthTokenState(null);
    setCurrentUser(null);
    remoteCharacterIdRef.current = null;
    activeCharacterIdRef.current = null;
    setActiveCharacterId(null);
    setAvailableCharacters([]);
    availableCharactersRef.current = [];
    currentProfileRef.current = null;
    persistBundleSnapshot({
      characterProfile: null,
      availableCharacters: [],
      activeCharacterId: null,
    });
  }, [persistBundleSnapshot]);

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
          syncRemoteCharacters(sessionRes.data.character, sessionRes.data.characters);
          return sessionRes.data.character?.id ?? null;
        }
      }

      // 2. If no valid stored session, log in with default hero credentials
      const loginRes = await loginAccount({
        email: 'hero@gymify.rpg',
        password: 'password123',
      });

      if (loginRes.ok && loginRes.data) {
        setAuthTokenState(loginRes.data.token);
        setCurrentUser(loginRes.data.user);
        syncRemoteCharacters(loginRes.data.character, loginRes.data.characters);
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
        syncRemoteCharacters(regRes.data.character, regRes.data.characters);
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

  const addDropsToInventory = useCallback((drops: LootDrop[]) => {
    if (drops.length === 0) return;
    setRawInventory((prev) => {
      const next = [...prev];
      for (const d of drops) {
        const idx = next.findIndex((i) => i.slug === d.itemSlug);
        if (idx >= 0) {
          next[idx] = { ...next[idx]!, quantity: next[idx]!.quantity + d.quantity };
        } else {
          const meta = KNOWN_ITEM_METADATA[d.itemSlug];
          next.push({
            slug: d.itemSlug,
            name: d.itemName,
            description: meta?.description,
            rarity: d.rarity,
            quantity: d.quantity,
            itemType: meta?.itemType ?? 'MATERIAL',
            weaponHandedness: meta?.weaponHandedness,
            requiredStrength: meta?.requiredStrength,
            requiredEndurance: meta?.requiredEndurance,
            requiredAgility: meta?.requiredAgility,
            statBonuses: meta?.statBonuses,
          });
        }
      }
      return next;
    });
  }, []);

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
      const blocks: OfflineDraftExerciseBlock[] = exerciseBlocks.map((b, bIdx) => {
        return {
          blockId: `blk_${nowMs}_${bIdx + 1}`,
          exerciseId: b.exerciseSlug,
          exerciseName: b.exerciseName,
          supersetGroupId: b.supersetGroupId ?? null,
          sets: b.sets.map((s, sIdx) => ({
            id: `set_${nowMs}_${bIdx + 1}_${sIdx + 1}`,
            weightKgStr: String(s.targetWeightKg || 0),
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
        updateOfflineDraft(() => ({
          sessionId: `offline_${nowMs}`,
          startedAtMs: nowMs,
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
    [updateOfflineDraft]
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
            try {
              const dominantZone = item.cardioSegments[0]?.averageHrZone;
              const res = await fetchWithTimeout(
                `${API_BASE_URL}/api/characters/${charId}/workouts`,
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
          if (addedGold > 0) setGold((g) => g + addedGold);
          if (addedWorkouts > 0) setWorkoutsLoggedCount((c) => c + addedWorkouts);
          if (addedShields > 0) setResilienceShields((s) => s + addedShields);
          if (collectedDrops.length > 0) addDropsToInventory(collectedDrops);

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
      for (const row of block.sets) {
        if (!row.completed) continue;
        const reps = Math.floor(Number(row.repsStr) || 0);
        const weightKg = Math.max(0, Number(row.weightKgStr) || 0);
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

    const payload: QueuedOfflineWorkoutPayload = {
      queueId: `q_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId: draft.sessionId || `offline_${nowMs}`,
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
      const completedRows = block.sets.filter((s) => s.completed && (Number(s.repsStr) || 0) > 0);
      if (completedRows.length > 0) {
        historyExercises.push({
          exerciseId: block.exerciseId,
          exerciseName: exMeta?.name ?? block.exerciseName ?? block.exerciseId,
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

    const offlineRecord: CompletedWorkoutRecord = {
      id: `offline_hist_${nowMs}`,
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

    queuedOfflineRef.current = nextQueue;
    offlineDraftRef.current = freshDraft;

    setQueuedOfflineWorkouts(nextQueue);
    setOfflineDraft(freshDraft);
    setLandingToastMessage('Workout saved. Spoils waiting in the world.');

    persistBundleSnapshot({
      offlineDraft: null,
      queuedOfflineWorkouts: nextQueue,
      workoutHistory: nextHistory,
    });

    // Silently attempt server sync in the background (with zero RPG popups)
    void syncOfflineWorkouts({ evaluateLocallyIfOffline: false });

    return { ok: true };
  }, [persistBundleSnapshot, syncOfflineWorkouts]);

  const claimPendingSpoils = useCallback(() => {
    pendingReceiptsRef.current = [];
    setPendingWorkoutReceipts([]);
    persistBundleSnapshot({ pendingWorkoutReceipts: [] });
    triggerSensoryCue('CHEST_OPEN_REVEAL');
  }, [persistBundleSnapshot]);

  const consolidatedSpoils = useMemo(
    () => consolidateSpoilsReceipts(pendingWorkoutReceipts),
    [pendingWorkoutReceipts]
  );

  const unclaimedSpoilsCount = pendingWorkoutReceipts.length + queuedOfflineWorkouts.length;

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

  const equipmentBonuses = useMemo<EquipmentStatBonuses>(() => {
    const agg: EquipmentStatBonuses = {};
    for (const item of inventory) {
      if (!item.equipped || !item.statBonuses) continue;
      const b = item.statBonuses;
      agg.maxHp = (agg.maxHp ?? 0) + (b.maxHp ?? 0);
      agg.maxStamina = (agg.maxStamina ?? 0) + (b.maxStamina ?? 0);
      agg.meleePower = (agg.meleePower ?? 0) + (b.meleePower ?? 0);
      agg.armorRating = (agg.armorRating ?? 0) + (b.armorRating ?? 0);
      agg.attackSpeedPct = (agg.attackSpeedPct ?? 0) + (b.attackSpeedPct ?? 0);
      agg.dodgeRating = (agg.dodgeRating ?? 0) + (b.dodgeRating ?? 0);
      agg.critChance = (agg.critChance ?? 0) + (b.critChance ?? 0);
      agg.critMultiplier = (agg.critMultiplier ?? 0) + (b.critMultiplier ?? 0);
    }
    return agg;
  }, [inventory]);

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
        },
        equipmentBonuses,
        unlockedTalentRanks,
        systemicFatigueStacks: projectedFatigue.systemicFatigueStacks,
      }),
    [equipmentBonuses, projectedFatigue.systemicFatigueStacks, stats, unlockedTalentRanks]
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
      setHistoricalPRs(evaluation.updatedPRs);
      setLastWorkoutResult(evaluation);
      setWorkoutsLoggedCount((c) => c + 1);

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
    [fatigueState, historicalPRs, addDropsToInventory]
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

      setUnlockedTalentRanks(res.nextState.unlockedNodeRanks);
      setStats((prev) => ({
        ...prev,
        [res.governingStat]: {
          ...prev[res.governingStat],
          pointsAvailable: res.nextState.availablePoints[res.governingStat],
        },
      }));
      return { ok: true };
    },
    [stats, unlockedTalentRanks]
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

      setEquipmentLoadout((prev) => {
        const next: EquipmentLoadoutMap = { ...prev };
        // Remove item from any other slot if already equipped (e.g., swapping accessory1 -> accessory2)
        for (const k of Object.keys(next) as EquipmentSlot[]) {
          if (next[k] === slug) {
            next[k] = null;
          }
        }
        next[resolvedSlot] = slug;
        return next;
      });

      return { ok: true, slot: resolvedSlot };
    },
    [equipmentLoadout, rawInventory, stats]
  );

  const unequipSlot = useCallback((slot: EquipmentSlot) => {
    setEquipmentLoadout((prev) => ({ ...prev, [slot]: null }));
  }, []);

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
        setRawInventory((prev) =>
          prev
            .map((item) => {
              const req = node.inputMaterials.find((r) => r.slug === item.slug);
              return req ? { ...item, quantity: item.quantity - req.quantity } : item;
            })
            .filter((item) => item.quantity > 0 || item.itemType !== 'MATERIAL')
        );
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
    [activeGathering, activityState, inventory, overallLevel, stats]
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
    (selectedPartyIds: string[]) => {
      if (activeDungeonRun && activeDungeonRun.status === 'ACTIVE_WINDOW') {
        return { ok: false, error: 'A 24-hour Dungeon Expedition is already underway.' };
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
        dungeon: STARTER_DUNGEON,
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

      setBounties((prev) =>
        prev.map((b) => (b.slug === bountySlug ? { ...b, completed: true } : b))
      );
      setGold((g) => g + bounty.goldReward);
      setAdventurerReputation((r) => r + bounty.reputationReward);
      if (bounty.isRankUpTrial && bounty.unlocksRank) {
        setAdventurerRank(bounty.unlocksRank);
      }
      return { ok: true };
    },
    [adventurerRank, bounties, stats, workoutsLoggedCount]
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
      setWorkoutMachine((prev) =>
        transitionHybridWorkoutState(prev, {
          type: 'ADJUST_REST_TIMER',
          deltaSeconds: params.deltaSeconds,
          newDurationSeconds: params.newDurationSeconds,
          nowMs: Date.now(),
        })
      );
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

      setWorkoutMachine(nextMachine);
      setFatigueState(fatigueTransition.nextState);
      setHistoricalPRs(evalResult.updatedPRs);
      setLastWorkoutResult(evalResult);
      setWorkoutsLoggedCount((c) => c + 1);
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
      persistBundleSnapshot({
        workoutHistory: nextHistory,
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
    exercises: STARTER_EXERCISES,
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
    lockDailyRaidStrike,
    resolveWeeklyRaidRewards,
    completeGuildBounty,
    authToken,
    currentUser,
    isAuthenticated,
    isLiveSyncConnected,
    gameMode,
    setGameMode,
    characters: availableCharacters,
    activeCharacterId,
    switchCharacter,
    createCharacter,
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
