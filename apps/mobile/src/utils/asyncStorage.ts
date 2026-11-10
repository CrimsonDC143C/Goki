import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const STORAGE_MAP_FILENAME = 'goki_key_value_store_v1.json';
let inMemoryStore: Record<string, string> = {};
let isStoreLoaded = false;
let loadPromise: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();

interface WebStorageGlobal {
  localStorage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
    clear?: () => void;
  };
}

function ensureNativeStoreLoaded(): Promise<void> {
  if (isStoreLoaded) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const file = new File(Paths.document, STORAGE_MAP_FILENAME);
      if (!file.exists) {
        isStoreLoaded = true;
        return;
      }
      const content = await file.text();
      if (content) {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          // Merge disk keys without overwriting keys written early on cold boot
          inMemoryStore = { ...(parsed as Record<string, string>), ...inMemoryStore };
        }
      }
    } catch {
      // Graceful fallback to empty store if unparseable
    } finally {
      isStoreLoaded = true;
    }
  })();

  return loadPromise;
}

function persistNativeStore(): Promise<void> {
  const serialized = JSON.stringify(inMemoryStore);
  const next = writeChain.then(
    async () => {
      try {
        const file = new File(Paths.document, STORAGE_MAP_FILENAME);
        if (!file.exists) {
          file.create({ overwrite: true });
        }
        await file.write(serialized);
      } catch {
        // Fallback to in-memory store
      }
    },
    async () => {
      try {
        const file = new File(Paths.document, STORAGE_MAP_FILENAME);
        if (!file.exists) {
          file.create({ overwrite: true });
        }
        await file.write(serialized);
      } catch {
        // Fallback to in-memory store
      }
    }
  );
  writeChain = next.catch(() => {});
  return writeChain;
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
    await ensureNativeStoreLoaded();
    return inMemoryStore[key] ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      inMemoryStore[key] = value;
      try {
        const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
        ls?.setItem(key, value);
      } catch {
        // Keep in memory
      }
      return;
    }
    await ensureNativeStoreLoaded();
    inMemoryStore[key] = value;
    await persistNativeStore();
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      delete inMemoryStore[key];
      try {
        const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
        ls?.removeItem(key);
      } catch {
        // In-memory handled
      }
      return;
    }
    await ensureNativeStoreLoaded();
    delete inMemoryStore[key];
    await persistNativeStore();
  },

  async multiRemove(keys: string[]): Promise<void> {
    if (Platform.OS === 'web') {
      for (const key of keys) {
        delete inMemoryStore[key];
      }
      try {
        const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
        if (ls) {
          for (const key of keys) {
            ls.removeItem(key);
          }
        }
      } catch {
        // In-memory handled
      }
      return;
    }
    await ensureNativeStoreLoaded();
    for (const key of keys) {
      delete inMemoryStore[key];
    }
    await persistNativeStore();
  },

  async clear(): Promise<void> {
    if (Platform.OS === 'web') {
      inMemoryStore = {};
      try {
        const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
        ls?.clear?.();
      } catch {
        // Handled
      }
      return;
    }
    await ensureNativeStoreLoaded();
    inMemoryStore = {};
    await persistNativeStore();
  },
};

export default AsyncStorage;
