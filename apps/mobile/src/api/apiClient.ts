import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  AffixReforgeMode,
  CharacterCustomizationConfig,
  CharacterRace,
} from '@goki/game-engine';
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
        return 'https://goki-server.onrender.com';
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
  return 'https://goki-server.onrender.com';
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
  race?: CharacterRace;
  customizationConfig?: CharacterCustomizationConfig;
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
  race?: CharacterRace;
  customizationConfig?: CharacterCustomizationConfig;
}): Promise<{
  ok: boolean;
  statusCode?: number;
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to create character' };
    }
    return { ok: true, statusCode: res.status, data };
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
  payload: {
    name?: string;
    appearanceId?: string;
    avatarSpriteId?: string;
    race?: CharacterRace;
    customizationConfig?: CharacterCustomizationConfig;
  }
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
 * Saves a character's equipped 4 active talent skills and 4 belt consumable slots
 * (`PUT /api/characters/:characterId/combat-loadout`).
 */
export async function saveCharacterCombatLoadoutApi(
  characterId: string,
  payload: { activeSkillIds: string[]; beltConsumables: Array<string | null> }
): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const res = await apiFetch(
      `/api/characters/${characterId}/combat-loadout`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      5000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to save combat loadout' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error saving combat loadout';
    return { ok: false, error: message };
  }
}

/**
 * Fetches Adventurer's Guild quests and rank-up trials (`GET /api/adventurers-guild/quests`).
 */
export async function fetchAdventurersGuildQuestsApi(): Promise<{
  ok: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/adventurers-guild/quests', { method: 'GET' }, 5000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to fetch guild quests' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error fetching guild quests';
    return { ok: false, error: message };
  }
}

/**
 * Starts an interactive turn-based Adventurer's Guild quest run
 * (`POST /api/adventurers-guild/quests/:questSlug/start`).
 */
export async function startGuildQuestRunApi(
  questSlug: string,
  payload: { characterId: string; companionIds: string[]; clientRunId?: string; clientSeed?: string }
): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const res = await apiFetch(
      `/api/adventurers-guild/quests/${questSlug}/start`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      5000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to start guild quest run' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error starting guild quest run';
    return { ok: false, error: message };
  }
}

/**
 * Completes a turn-based Adventurer's Guild quest run with the action replay log
 * (`POST /api/adventurers-guild/runs/:runId/complete`).
 */
export async function completeGuildQuestRunApi(
  runId: string,
  payload: { actions?: unknown[] }
): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const res = await apiFetch(
      `/api/adventurers-guild/runs/${runId}/complete`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      6000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to complete guild quest run' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error completing guild quest run';
    return { ok: false, error: message };
  }
}

/**
 * Syncs queued offline turn-based Guild quest runs to the server
 * (`POST /api/adventurers-guild/sync-offline`).
 */
export async function syncOfflineGuildQuestRunsApi(payload: {
  characterId: string;
  completedRuns: unknown[];
}): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const res = await apiFetch(
      '/api/adventurers-guild/sync-offline',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      6000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to sync offline guild runs' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error syncing offline guild runs';
    return { ok: false, error: message };
  }
}

/**
 * Fetches crafting recipes (`GET /api/crafting/recipes`).
 */
export async function fetchCraftingRecipesApi(): Promise<{
  ok: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/crafting/recipes', { method: 'GET' }, 5000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to fetch crafting recipes' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error fetching crafting recipes';
    return { ok: false, error: message };
  }
}

/**
 * Crafts a recipe (`POST /api/crafting/craft`).
 */
export async function craftRecipeApi(payload: {
  characterId: string;
  recipeSlug: string;
  quantity?: number;
  clientSeed?: string;
}): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const res = await apiFetch(
      '/api/crafting/craft',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      6000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to craft recipe' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error crafting recipe';
    return { ok: false, error: message };
  }
}

/**
 * Upgrades gear tier (`POST /api/crafting/upgrade`).
 */
export async function upgradeGearApi(payload: {
  characterId: string;
  inventoryItemId: string;
  clientSeed?: string;
}): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const res = await apiFetch(
      '/api/crafting/upgrade',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      6000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to upgrade gear' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error upgrading gear';
    return { ok: false, error: message };
  }
}

/**
 * Reforges gear affixes (`POST /api/crafting/reforge`).
 */
export async function reforgeGearApi(payload: {
  characterId: string;
  inventoryItemId: string;
  mode?: AffixReforgeMode;
  clientSeed?: string;
}): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const res = await apiFetch(
      '/api/crafting/reforge',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      6000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to reforge gear' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error reforging gear';
    return { ok: false, error: message };
  }
}

/**
 * Fetches Bramwell's rotating trader stock (`GET /api/npc/trader/stock`).
 */
export async function fetchTraderStockApi(date?: string): Promise<{
  ok: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
}> {
  try {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const res = await apiFetch(`/api/npc/trader/stock${query}`, { method: 'GET' }, 5000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to fetch trader stock' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error fetching trader stock';
    return { ok: false, error: message };
  }
}

/**
 * Purchases an offer from Bramwell (`POST /api/npc/trader/buy`).
 */
export async function buyTraderOfferApi(payload: {
  characterId: string;
  offerId: string;
  quantity?: number;
  rotationDateKey?: string;
}): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const res = await apiFetch(
      '/api/npc/trader/buy',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      6000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to purchase trader offer' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error purchasing trader offer';
    return { ok: false, error: message };
  }
}

/**
 * Sells an inventory item to Bramwell (`POST /api/npc/trader/sell`).
 */
export async function sellInventoryItemApi(payload: {
  characterId: string;
  inventoryItemId: string;
  quantity?: number;
}): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const res = await apiFetch(
      '/api/npc/trader/sell',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      6000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to sell item' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error selling item';
    return { ok: false, error: message };
  }
}

/**
 * Respecs all character talent points (`POST /api/npc/trainer/respec`).
 */
export async function respecTalentsApi(characterId: string): Promise<{
  ok: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
}> {
  try {
    const res = await apiFetch(
      '/api/npc/trainer/respec',
      {
        method: 'POST',
        body: JSON.stringify({ characterId }),
      },
      6000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to respec talents' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error respecing talents';
    return { ok: false, error: message };
  }
}

/**
 * Fetches Master Kaelen's coaching report (`POST /api/npc/trainer/coaching`).
 */
export async function fetchTrainerCoachingApi(payload: {
  characterId: string;
  workoutHistory?: unknown[];
}): Promise<{ ok: boolean; statusCode?: number; data?: any; error?: string }> {
  try {
    const res = await apiFetch(
      '/api/npc/trainer/coaching',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      6000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to fetch trainer coaching' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error fetching trainer coaching';
    return { ok: false, error: message };
  }
}

/**
 * Completes Auren's Level-1 Guide FTUE onboarding (`POST /api/characters/:id/onboarding/complete`).
 */
export async function completeOnboardingApi(characterId: string): Promise<{
  ok: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
}> {
  try {
    const res = await apiFetch(
      `/api/characters/${characterId}/onboarding/complete`,
      {
        method: 'POST',
      },
      6000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, statusCode: res.status, error: data.error || 'Failed to complete onboarding' };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error completing onboarding';
    return { ok: false, error: message };
  }
}

/**
 * Clears the stored JWT authentication token.
 */
export async function logoutAccount(): Promise<void> {
  await removeStoredAuthToken();
}
