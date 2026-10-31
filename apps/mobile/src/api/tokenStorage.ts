import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_TOKEN_STORAGE_KEY = 'gymify_auth_jwt_token_v1';

// Web localStorage safe fallback interface
interface WebStorageGlobal {
  localStorage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
}

let inMemoryTokenFallback: string | null = null;

/**
 * Retrieves the stored JWT authentication token.
 * Uses SecureStore on iOS/Android; localStorage / in-memory fallback on Web.
 */
export async function getStoredAuthToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
      return ls?.getItem(AUTH_TOKEN_STORAGE_KEY) ?? inMemoryTokenFallback;
    } catch {
      return inMemoryTokenFallback;
    }
  }

  try {
    const token = await SecureStore.getItemAsync(AUTH_TOKEN_STORAGE_KEY);
    inMemoryTokenFallback = token;
    return token;
  } catch {
    return inMemoryTokenFallback;
  }
}

/**
 * Persists the JWT authentication token securely.
 * Uses SecureStore on iOS/Android; localStorage on Web.
 */
export async function setStoredAuthToken(token: string): Promise<void> {
  inMemoryTokenFallback = token;

  if (Platform.OS === 'web') {
    try {
      const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
      ls?.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } catch {
      // In-memory token fallback remains available
    }
    return;
  }

  try {
    await SecureStore.setItemAsync(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // In-memory token fallback remains available
  }
}

/**
 * Removes the stored JWT authentication token (for logout).
 */
export async function removeStoredAuthToken(): Promise<void> {
  inMemoryTokenFallback = null;

  if (Platform.OS === 'web') {
    try {
      const ls = (globalThis as unknown as WebStorageGlobal).localStorage;
      ls?.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {}
    return;
  }

  try {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_STORAGE_KEY);
  } catch {}
}
