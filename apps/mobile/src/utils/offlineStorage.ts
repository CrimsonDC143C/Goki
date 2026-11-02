import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  HeartRateZone,
  QueuedOfflineWorkoutPayload,
  WorkoutSpoilsReceipt,
  WorkoutCategory,
  SetType,
  WorkoutPresetDefinition,
  STARTER_WORKOUT_PRESETS,
} from '@gymify/game-engine';

export interface OfflineDraftSetRow {
  id: string;
  weightKgStr: string;
  repsStr: string;
  isWarmup: boolean;
  setType?: SetType;
  rpe?: number | null;
  supersetGroupId?: string | null;
  completed: boolean;
}

export interface OfflineDraftExerciseBlock {
  blockId: string;
  exerciseId: string;
  exerciseName?: string;
  supersetGroupId?: string | null;
  sets: OfflineDraftSetRow[];
}

export interface OfflineDraftCardioItem {
  id: string;
  exerciseId: string;
  exerciseName: string;
  activityType: string;
  durationSeconds: number;
  averageHrZone: HeartRateZone;
  rpe?: number | null;
}

export interface OfflineWorkoutDraft {
  sessionId: string;
  startedAtMs: number;
  category?: WorkoutCategory;
  secondaryCategories?: WorkoutCategory[];
  sourcePresetId?: string | null;
  sessionRpe?: number | null;
  exerciseBlocks: OfflineDraftExerciseBlock[];
  cardioEntries: OfflineDraftCardioItem[];
  notes: string;
}

export interface PersistedCharacterProfile {
  id: string;
  name: string;
  gameMode: 'STANDARD' | 'IRONMAN_VERIFIED';
  avatarSpriteId?: string;
  overallLevel: number;
  adventurerRank: string;
  adventurerReputation: number;
  gold: number;
  stats: {
    STRENGTH: { level: number; xp: number; pointsAvailable: number };
    ENDURANCE: { level: number; xp: number; pointsAvailable: number };
    AGILITY: { level: number; xp: number; pointsAvailable: number };
    DEXTERITY?: { level: number; xp: number; pointsAvailable: number };
    CONSTITUTION?: { level: number; xp: number; pointsAvailable: number };
    WISDOM?: { level: number; xp: number; pointsAvailable: number };
    SPIRIT?: { level: number; xp: number; pointsAvailable: number };
  };
  inventory?: any[];
  unlockedTalentRanks?: Record<string, number>;
  equipmentLoadout?: Record<string, any>;
  lastSyncedAtMs?: number;
}

export interface PersistedOfflineBundle {
  offlineDraft: OfflineWorkoutDraft | null;
  queuedOfflineWorkouts: QueuedOfflineWorkoutPayload[];
  unsyncedServerPayloads: QueuedOfflineWorkoutPayload[];
  pendingWorkoutReceipts: WorkoutSpoilsReceipt[];
  customPresets: WorkoutPresetDefinition[];
  characterProfile?: PersistedCharacterProfile | null;
  availableCharacters?: PersistedCharacterProfile[];
  activeCharacterId?: string | null;
}

const STORAGE_KEY = 'gymify_offline_bundle_v1';
const NATIVE_FILENAME = 'gymify_offline_bundle_v1.json';

interface WebStorageGlobal {
  localStorage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
}

let memoryFallbackBundle: PersistedOfflineBundle = {
  offlineDraft: null,
  queuedOfflineWorkouts: [],
  unsyncedServerPayloads: [],
  pendingWorkoutReceipts: [],
  customPresets: [],
  characterProfile: null,
  availableCharacters: [],
  activeCharacterId: null,
};

let writeChain: Promise<void> = Promise.resolve();

export function createDefaultOfflineDraft(
  nowMs: number = Date.now(),
  category: WorkoutCategory = 'GYM',
  sourcePresetId?: string | null
): OfflineWorkoutDraft {
  return {
    sessionId: `offline_${nowMs}`,
    startedAtMs: nowMs,
    category,
    secondaryCategories: [],
    sourcePresetId: sourcePresetId ?? null,
    exerciseBlocks:
      category === 'GYM'
        ? [
            {
              blockId: `blk_${nowMs}_1`,
              exerciseId: 'bench_press',
              exerciseName: 'Barbell Flat Bench Press',
              sets: [
                {
                  id: `set_${nowMs}_1`,
                  weightKgStr: '85',
                  repsStr: '8',
                  isWarmup: false,
                  setType: 'NORMAL',
                  rpe: 8,
                  completed: false,
                },
              ],
            },
          ]
        : [],
    cardioEntries:
      category === 'CARDIO'
        ? [
            {
              id: `cardio_${nowMs}_1`,
              exerciseId: 'outdoor_cycling_tempo',
              exerciseName: 'Outdoor Cycling - Tempo / Threshold',
              activityType: 'CYCLING',
              durationSeconds: 1800,
              averageHrZone: 3,
              rpe: 7.5,
            },
          ]
        : category === 'SPORT'
          ? [
              {
                id: `sport_${nowMs}_1`,
                exerciseId: 'badminton_singles',
                exerciseName: 'Badminton - Singles Match Play',
                activityType: 'BADMINTON',
                durationSeconds: 3600,
                averageHrZone: 4,
                rpe: 8.5,
              },
            ]
          : category === 'RECOVERY'
            ? [
                {
                  id: `recovery_${nowMs}_1`,
                  exerciseId: 'foam_rolling_mobility',
                  exerciseName: 'Full-Body Foam Rolling & Dynamic Mobility',
                  activityType: 'RECOVERY',
                  durationSeconds: 1200,
                  averageHrZone: 1,
                  rpe: 5,
                },
              ]
            : [],
    notes: '',
  };
}

export function getMergedPresets(customPresets: WorkoutPresetDefinition[] = []): WorkoutPresetDefinition[] {
  const map = new Map<string, WorkoutPresetDefinition>();
  for (const starter of STARTER_WORKOUT_PRESETS) {
    map.set(starter.id, starter);
  }
  for (const custom of customPresets) {
    map.set(custom.id, custom);
  }
  return Array.from(map.values());
}

function sanitizeBundle(raw: unknown): PersistedOfflineBundle {
  if (!raw || typeof raw !== 'object') {
    return {
      offlineDraft: null,
      queuedOfflineWorkouts: [],
      unsyncedServerPayloads: [],
      pendingWorkoutReceipts: [],
      customPresets: [],
      characterProfile: null,
      availableCharacters: [],
      activeCharacterId: null,
    };
  }
  const obj = raw as Partial<PersistedOfflineBundle>;
  return {
    offlineDraft:
      obj.offlineDraft &&
      typeof obj.offlineDraft === 'object' &&
      Array.isArray(obj.offlineDraft.exerciseBlocks)
        ? obj.offlineDraft
        : null,
    queuedOfflineWorkouts: Array.isArray(obj.queuedOfflineWorkouts)
      ? obj.queuedOfflineWorkouts
      : [],
    unsyncedServerPayloads: Array.isArray(obj.unsyncedServerPayloads)
      ? obj.unsyncedServerPayloads
      : [],
    pendingWorkoutReceipts: Array.isArray(obj.pendingWorkoutReceipts)
      ? obj.pendingWorkoutReceipts
      : [],
    customPresets: Array.isArray(obj.customPresets) ? obj.customPresets : [],
    characterProfile:
      obj.characterProfile && typeof obj.characterProfile === 'object' && obj.characterProfile.name
        ? obj.characterProfile
        : null,
    availableCharacters: Array.isArray(obj.availableCharacters) ? obj.availableCharacters : [],
    activeCharacterId: typeof obj.activeCharacterId === 'string' ? obj.activeCharacterId : null,
  };
}

export async function loadPersistedOfflineBundle(): Promise<PersistedOfflineBundle> {
  if (Platform.OS === 'web') {
    try {
      const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
      if (ls) {
        const raw = ls.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = sanitizeBundle(JSON.parse(raw));
          memoryFallbackBundle = parsed;
          return parsed;
        }
      }
    } catch {
      // Fallback to in-memory copy if storage is restricted
    }
    return memoryFallbackBundle;
  }

  try {
    const file = new File(Paths.document, NATIVE_FILENAME);
    if (!file.exists) {
      return memoryFallbackBundle;
    }
    const text = await file.text();
    if (!text) {
      return memoryFallbackBundle;
    }
    const parsed = sanitizeBundle(JSON.parse(text));
    memoryFallbackBundle = parsed;
    return parsed;
  } catch {
    return memoryFallbackBundle;
  }
}

export function savePersistedOfflineBundle(bundle: PersistedOfflineBundle): Promise<void> {
  memoryFallbackBundle = bundle;
  const serialized = JSON.stringify(bundle);

  if (Platform.OS === 'web') {
    try {
      const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
      ls?.setItem(STORAGE_KEY, serialized);
    } catch {
      // Ignore quota / private-mode storage errors
    }
    return Promise.resolve();
  }

  writeChain = writeChain
    .then(async () => {
      try {
        const file = new File(Paths.document, NATIVE_FILENAME);
        if (!file.exists) {
          file.create({ overwrite: true });
        }
        await file.write(serialized);
      } catch {
        // Ignore filesystem transient errors; memoryFallbackBundle remains up-to-date
      }
    })
    .catch(() => {});

  return writeChain;
}
