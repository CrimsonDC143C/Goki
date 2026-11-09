import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const STORAGE_MAP_FILENAME = 'goki_key_value_store_v1.json';
let inMemoryStore: Record<string, string> = {};
let isStoreLoaded = false;
let fileWriteChain: Promise<void> = Promise.resolve();

interface WebStorageGlobal {
  localStorage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
    clear?: () => void;
  };
}

async function loadNativeStore(): Promise<Record<string, string>> {
  if (isStoreLoaded) return inMemoryStore;
  try {
    const file = new File(Paths.document, STORAGE_MAP_FILENAME);
    if (!file.exists) {
      isStoreLoaded = true;
      return inMemoryStore;
    }
    const content = await file.text();
    if (content) {
      inMemoryStore = JSON.parse(content);
    }
  } catch {
    // Graceful fallback to empty store if unparseable
  }
  isStoreLoaded = true;
  return inMemoryStore;
}

function persistNativeStore(): Promise<void> {
  const serialized = JSON.stringify(inMemoryStore);
  fileWriteChain = fileWriteChain
    .then(async () => {
      try {
        const file = new File(Paths.document, STORAGE_MAP_FILENAME);
        if (!file.exists) {
          file.create({ overwrite: true });
        }
        await file.write(serialized);
      } catch {
        // Fallback to in-memory store
      }
    })
    .catch(() => {});
  return fileWriteChain;
}

/**
 * Universal offline-first AsyncStorage compatibility layer for Goki.
 * Automatically persists to localStorage on Web and expo-file-system on Native.
 */
export const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
        return ls?.getItem(key) ?? null;
      } catch {
        return inMemoryStore[key] ?? null;
      }
    }
    await loadNativeStore();
    return inMemoryStore[key] ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    inMemoryStore[key] = value;
    if (Platform.OS === 'web') {
      try {
        const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
        ls?.setItem(key, value);
      } catch {
        // Keep in memory
      }
      return;
    }
    await persistNativeStore();
  },

  async removeItem(key: string): Promise<void> {
    delete inMemoryStore[key];
    if (Platform.OS === 'web') {
      try {
        const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
        ls?.removeItem(key);
      } catch {
        // In-memory handled
      }
      return;
    }
    await persistNativeStore();
  },

  async clear(): Promise<void> {
    inMemoryStore = {};
    if (Platform.OS === 'web') {
      try {
        const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
        ls?.clear?.();
      } catch {
        // Handled
      }
      return;
    }
    await persistNativeStore();
  },
};

export default AsyncStorage;
