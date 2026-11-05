import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  getStoredAuthToken,
  removeStoredAuthToken,
  setStoredAuthToken,
} from './tokenStorage';

export function resolveApiBaseUrl(): string {
  let envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

  if (envUrl) {
    // Strip quotes if present (e.g. from .env.local: "http://...")
    envUrl = envUrl.replace(/^["']|["']$/g, '').trim();
    const isLocalhost = envUrl.includes('localhost') || envUrl.includes('127.0.0.1');

    if (isLocalhost) {
      if (Platform.OS !== 'web') {
        const lanHost = Constants?.expoConfig?.hostUri?.split(':')[0];
        if (isDev && lanHost) {
          return `http://${lanHost}:4000`;
        }
        // In standalone native release/preview builds, localhost fails with ConnectException.
        return 'https://gymify-server.onrender.com';
      }
    }
    return envUrl.replace(/\/$/, '');
  }

  const hostUri = Constants?.expoConfig?.hostUri;
  if (isDev && hostUri) {
    const lanHost = hostUri.split(':')[0];
    if (lanHost) {
      return `http://${lanHost}:4000`;
    }
  }
  return 'https://gymify-server.onrender.com';
}

export const API_BASE_URL = resolveApiBaseUrl();

export function resolveWsBaseUrl(): string {
  const envWs = process.env.EXPO_PUBLIC_WS_URL?.trim();
  if (envWs) {
    return envWs.replace(/\/$/, '');
  }
  const httpUrl = resolveApiBaseUrl();
  return httpUrl.replace(/^http(s)?:\/\//i, (match) =>
    match.toLowerCase() === 'https://' ? 'wss://' : 'ws://'
  );
}

export const WS_BASE_URL = resolveWsBaseUrl();

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  timezone?: string;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface AuthSessionResponse {
  token: string;
  user: AuthUser;
  character: any;
  characters?: any[];
}

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
  characterName?: string;
  gameMode?: 'STANDARD' | 'IRONMAN_VERIFIED';
  avatarSpriteId?: string;
  timezone?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * Universal authenticated fetch utility.
 * Automatically attaches stored JWT token as `Authorization: Bearer <token>`
 * to all outbound requests and handles timeout aborts cleanly.
 */
export async function apiFetch(
  pathOrUrl: string,
  init?: RequestInit,
  timeoutMs = 6000
): Promise<Response> {
  const baseUrl = resolveApiBaseUrl();
  const url =
    pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')
      ? pathOrUrl
      : `${baseUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;

  const token = await getStoredAuthToken();

  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Registers a new account, stores the returned JWT token, and returns user/character data.
 */
export async function registerAccount(
  payload: RegisterPayload
): Promise<{ ok: boolean; data?: AuthSessionResponse; error?: string }> {
  try {
    const res = await apiFetch(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      5000
    );

    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json.error || 'Failed to register account' };
    }

    if (json.token) {
      await setStoredAuthToken(json.token);
    }

    return { ok: true, data: json };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error during registration';
    return { ok: false, error: message };
  }
}

/**
 * Authenticates with email & password, stores the returned JWT token, and returns user/character data.
 */
export async function loginAccount(
  payload: LoginPayload
): Promise<{ ok: boolean; data?: AuthSessionResponse; error?: string }> {
  try {
    const res = await apiFetch(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      5000
    );

    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json.error || 'Invalid credentials' };
    }

    if (json.token) {
      await setStoredAuthToken(json.token);
    }

    return { ok: true, data: json };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error during login';
    return { ok: false, error: message };
  }
}

/**
 * Validates the currently stored JWT token against the server session endpoint (`GET /api/auth/me`).
 */
export async function fetchCurrentSession(): Promise<{
  ok: boolean;
  data?: { user: AuthUser; character: any; characters?: any[] };
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/auth/me', { method: 'GET' }, 3000);
    if (!res.ok) {
      return { ok: false, error: 'Session expired or invalid' };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Session verification failed';
    return { ok: false, error: message };
  }
}

/**
 * Fetches all characters belonging to the authenticated user (`GET /api/characters`).
 */
export async function fetchUserCharacters(): Promise<{
  ok: boolean;
  data?: { characters: any[]; activeCharacters?: any[]; deletedCharacters?: any[] };
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/characters', { method: 'GET' }, 4000);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { ok: false, error: errJson.error || 'Failed to fetch characters' };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error loading characters';
    return { ok: false, error: message };
  }
}

/**
 * Creates a new character for the authenticated account (`POST /api/characters`).
 * Enforces the 2-character limit: max 1 Standard (manual honesty) and 1 Ironman (wearable verified).
 */
export async function createCharacterAccount(payload: {
  name: string;
  gameMode: 'STANDARD' | 'IRONMAN_VERIFIED';
  appearanceId?: string;
  avatarSpriteId?: string;
}): Promise<{
  ok: boolean;
  data?: { character: any };
  error?: string;
}> {
  try {
    const res = await apiFetch(
      '/api/characters',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      5000
    );
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || 'Failed to create character' };
    }
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error creating character';
    return { ok: false, error: message };
  }
}

/**
 * Updates a character's cosmetic appearance or name (`PATCH /api/characters/:characterId`).
 */
export async function updateCharacterAccount(
  characterId: string,
  payload: { name?: string; appearanceId?: string }
): Promise<{ ok: boolean; statusCode?: number; data?: { character: any }; error?: string }> {
  try {
    const res = await apiFetch(
      `/api/characters/${characterId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      5000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to update character' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error updating character';
    return { ok: false, error: message };
  }
}

/**
 * Soft-deletes a character for 30-day retention or permanently erases if permanent=true.
 */
export async function deleteCharacterAccount(
  characterId: string,
  permanent?: boolean
): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const url = permanent ? `/api/characters/${characterId}?permanent=true` : `/api/characters/${characterId}`;
    const res = await apiFetch(
      url,
      {
        method: 'DELETE',
      },
      5000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to delete character' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error deleting character';
    return { ok: false, error: message };
  }
}

/**
 * Restores a soft-deleted character within its 30-day window (`POST /api/characters/:characterId/restore`).
 */
export async function restoreCharacterAccount(
  characterId: string
): Promise<{ ok: boolean; statusCode?: number; data?: { character: any }; error?: string }> {
  try {
    const res = await apiFetch(
      `/api/characters/${characterId}/restore`,
      {
        method: 'POST',
      },
      5000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to restore character' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error restoring character';
    return { ok: false, error: message };
  }
}

/**
 * Fetches the complete character sheet including projected fatigue, inventory, and equipment.
 */
export async function fetchCharacterSheet(characterId: string): Promise<{
  ok: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const res = await apiFetch(`/api/characters/${characterId}`, { method: 'GET' }, 5000);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || 'Failed to fetch character sheet' };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error fetching character sheet';
    return { ok: false, error: message };
  }
}

/**
 * Clears the stored JWT authentication token.
 */
export async function logoutAccount(): Promise<void> {
  await removeStoredAuthToken();
}
