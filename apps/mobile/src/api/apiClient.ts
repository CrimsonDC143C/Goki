import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  AffixReforgeMode,
  CharacterCustomizationConfig,
  CharacterRace,
  TurnBasedCombatEvent,
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
  if (Platform.OS === 'web' && typeof globalThis !== 'undefined') {
    const webHost = (globalThis as { location?: { hostname?: string } }).location?.hostname;
    if (webHost === 'localhost' || webHost === '127.0.0.1') {
      return `http://${webHost}:4000`;
    }
  }
  return 'https://goki-server.onrender.com';
}

export const API_BASE_URL = resolveApiBaseUrl();

export function resolveWsBaseUrl(): string {
  if (Platform.OS === 'web' && typeof globalThis !== 'undefined') {
    try {
      const webOverride = (
        globalThis as { localStorage?: { getItem?: (key: string) => string | null } }
      ).localStorage?.getItem?.('goki_ws_base_url');
      if (webOverride && webOverride.trim()) {
        return webOverride.trim().replace(/\/$/, '');
      }
    } catch {
      // Ignore restricted web storage errors
    }
  }
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
 * Authoritatively simulates and persists a solo/AI-companion 24h Dungeon Expedition claim
 * (`POST /api/dungeons/:dungeonSlug/claim-expedition`).
 */
export async function claimSoloExpeditionApi(
  dungeonSlug: string,
  payload: {
    characterId: string;
    clientRunId: string;
    companionIds: string[];
    activeWorkoutBuffs?: unknown[];
  }
): Promise<{
  ok: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
}> {
  try {
    const res = await apiFetch(
      `/api/dungeons/${encodeURIComponent(dungeonSlug)}/claim-expedition`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      10000
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        statusCode: res.status,
        error: data.error || 'Failed to claim expedition spoils',
      };
    }
    return { ok: true, statusCode: res.status, data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Network error claiming expedition spoils';
    return { ok: false, error: message };
  }
}

/**
 * Clears the stored JWT authentication token.
 */
export async function logoutAccount(): Promise<void> {
  await removeStoredAuthToken();
}

// ============================================================================
// MILESTONE 5: SOCIAL HUB, GYM CLANS, COMPANIES, FRIENDS & ASYNC ARENA APIs
// ============================================================================

export type SocialLeaderboardCategory = 'GYM_CLANS' | 'COMPANIES' | 'HEROES' | 'ARENA';

export interface SocialGymClanDto {
  id: string;
  slug: string;
  venueKey: string;
  name: string;
  tag: string;
  description?: string | null;
  emblemIcon?: string;
  kind: 'OPEN_WORLD_HOME' | 'GYM_VENUE';
  venueSource?: string;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  clanLevel?: number;
  clanReputation: number;
  memberCount?: number;
  seasonPoints?: number;
  role?: 'WARDEN' | 'OFFICER' | 'MEMBER';
}

export interface DiscoveredGymVenueDto {
  id?: string;
  clanId?: string;
  venueKey: string;
  name: string;
  tag?: string;
  city?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  venueSource: string;
  osmElementType?: string;
  osmElementId?: string | number;
  distanceMeters?: number;
  memberCount?: number;
  seasonPoints?: number;
  claimedClanId?: string | null;
}

export interface SocialCompanyMemberDto {
  id?: string;
  characterId: string;
  characterName: string;
  overallLevel: number;
  race?: CharacterRace;
  role: 'COMMANDER' | 'OFFICER' | 'MEMBER';
  activeSquadSlot: number | null;
  contributedReputation?: number;
}

export interface SocialCompanyDto {
  id: string;
  name: string;
  tag: string;
  motto?: string | null;
  description?: string | null;
  commanderCharacterId: string;
  companyLevel: number;
  companyReputation: number;
  maxRosterSize: number;
  maxActiveSquadSize: number;
  memberCount: number;
  members?: SocialCompanyMemberDto[];
}

export interface SocialFriendItemDto {
  friendshipId: string;
  userId: string;
  username: string;
  characterId?: string | null;
  characterName?: string | null;
  overallLevel?: number;
  gymClanTag?: string | null;
  arenaRating?: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  direction?: 'INCOMING' | 'OUTGOING';
  createdAt?: string;
}

export interface SocialFriendsOverviewDto {
  accepted: SocialFriendItemDto[];
  incoming: SocialFriendItemDto[];
  outgoing: SocialFriendItemDto[];
}

export interface SocialLeaderboardEntryDto {
  rank: number;
  id: string;
  name: string;
  tag?: string | null;
  subtitle?: string | null;
  workoutPoints: number;
  raidPoints: number;
  arenaPoints: number;
  totalPoints: number;
  wins?: number;
  losses?: number;
}

export interface ArenaOpponentDto {
  characterId: string;
  name: string;
  title?: string;
  overallLevel: number;
  race?: CharacterRace;
  gymClanName?: string | null;
  arenaRating: number;
  isNpcRival: boolean;
  isFriend?: boolean;
}

export interface ArenaMatchSummaryDto {
  matchId: string;
  outcome: 'CHALLENGER_VICTORY' | 'DEFENDER_VICTORY';
  winnerCharacterId: string;
  loserCharacterId: string;
  defenderName: string;
  totalTurns: number;
  challengerRemainingHp: number;
  defenderRemainingHp: number;
  challengerDamageDealt: number;
  defenderDamageDealt: number;
  challengerRatingDelta: number;
  nextChallengerRating: number;
  goldAwarded: number;
  seasonPointsAwarded: number;
  combatLog: TurnBasedCombatEvent[];
  createdAt?: string;
}

export interface SocialOverviewDto {
  seasonKey: string;
  homeClan: SocialGymClanDto | null;
  gymClan: SocialGymClanDto | null;
  company: SocialCompanyDto | null;
  friendsCount: number;
  pendingIncomingFriendsCount: number;
  arenaRating: number;
  arenaWins: number;
  arenaLosses: number;
}

export interface ApiJsonResult<T = any> {
  ok: boolean;
  statusCode?: number;
  data?: T;
  error?: string;
}

async function apiJsonRequest<T>(
  path: string,
  options: RequestInit,
  fallbackError: string,
  timeoutMs = 8000
): Promise<ApiJsonResult<T>> {
  try {
    const res = await apiFetch(path, options, timeoutMs);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        statusCode: res.status,
        error: (data as { error?: string })?.error || fallbackError,
      };
    }
    return { ok: true, statusCode: res.status, data: data as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : fallbackError;
    return { ok: false, error: message };
  }
}

function normalizeGymClanDto(raw: any): SocialGymClanDto | null {
  if (!raw) return null;
  return {
    id: raw.id,
    slug: raw.slug,
    venueKey: raw.venueKey,
    name: raw.name,
    tag: raw.tag,
    description: raw.description ?? null,
    emblemIcon: raw.emblemIcon,
    kind: raw.kind,
    venueSource: raw.venueSource,
    city: raw.city ?? null,
    address: raw.address ?? null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    clanLevel: raw.clanLevel ?? 1,
    clanReputation: raw.clanReputation ?? 0,
    memberCount: raw.memberCount ?? raw._count?.members ?? undefined,
    seasonPoints: raw.seasonPoints ?? raw.seasons?.[0]?.totalSeasonPoints ?? undefined,
    role: raw.role,
  };
}

function normalizeCompanyDto(raw: any): SocialCompanyDto {
  const members: SocialCompanyMemberDto[] = Array.isArray(raw?.members)
    ? raw.members.map((m: any) => ({
        id: m.id,
        characterId: m.characterId,
        characterName: m.characterName ?? m.character?.name ?? 'Adventurer',
        overallLevel: m.overallLevel ?? m.character?.overallLevel ?? 1,
        race: m.race ?? m.character?.race,
        role: m.role,
        activeSquadSlot: m.activeSquadSlot ?? null,
        contributedReputation: m.contributedReputation ?? 0,
      }))
    : [];
  return {
    id: raw.id,
    name: raw.name,
    tag: raw.tag,
    motto: raw.motto ?? null,
    description: raw.description ?? null,
    commanderCharacterId: raw.commanderCharacterId,
    companyLevel: raw.companyLevel ?? 1,
    companyReputation: raw.companyReputation ?? 0,
    maxRosterSize: raw.maxRosterSize ?? 30,
    maxActiveSquadSize: raw.maxActiveSquadSize ?? 4,
    memberCount: raw.memberCount ?? raw._count?.members ?? members.length,
    members,
  };
}

function normalizeFriendRow(
  row: any,
  currentUserId?: string,
  direction?: 'INCOMING' | 'OUTGOING'
): SocialFriendItemDto {
  if (row?.friendshipId && row?.username) {
    return row as SocialFriendItemDto;
  }
  const otherUser =
    direction === 'INCOMING'
      ? row?.requester
      : direction === 'OUTGOING'
        ? row?.addressee
        : currentUserId && row?.requesterId === currentUserId
          ? row?.addressee
          : row?.requester ?? row?.addressee;
  const primaryChar = otherUser?.characters?.[0] ?? null;
  return {
    friendshipId: row.id ?? row.friendshipId,
    userId: otherUser?.id ?? row.addresseeId ?? row.requesterId ?? '',
    username: otherUser?.username ?? 'adventurer',
    characterId: primaryChar?.id ?? null,
    characterName: primaryChar?.name ?? null,
    overallLevel: primaryChar?.overallLevel ?? 1,
    gymClanTag: primaryChar?.gymClanTag ?? null,
    arenaRating: primaryChar?.arenaRating ?? 1000,
    status: row.status,
    direction,
    createdAt: row.createdAt,
  };
}

export async function fetchSocialOverviewApi(
  characterId: string
): Promise<ApiJsonResult<SocialOverviewDto>> {
  const res = await apiJsonRequest<any>(
    `/api/social/overview?characterId=${encodeURIComponent(characterId)}`,
    { method: 'GET' },
    'Failed to load social overview'
  );
  if (!res.ok || !res.data) return res;
  const raw = res.data;
  return {
    ok: true,
    statusCode: res.statusCode,
    data: {
      seasonKey: raw.seasonKey,
      homeClan: normalizeGymClanDto(raw.homeClan),
      gymClan: normalizeGymClanDto(raw.gymClan),
      company: raw.company ? normalizeCompanyDto(raw.company) : null,
      friendsCount: raw.friendsCount ?? 0,
      pendingIncomingFriendsCount:
        raw.pendingIncomingFriendsCount ?? raw.pendingFriendRequestsCount ?? 0,
      arenaRating: raw.arenaRating ?? 1000,
      arenaWins: raw.arenaWins ?? 0,
      arenaLosses: raw.arenaLosses ?? 0,
    },
  };
}

export async function discoverGymsApi(params: {
  lat: number;
  lon: number;
  radiusMeters?: number;
  q?: string;
}): Promise<ApiJsonResult<{ venues: DiscoveredGymVenueDto[] }>> {
  const qs = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
  });
  if (params.radiusMeters !== undefined) {
    qs.set('radiusMeters', String(params.radiusMeters));
  }
  if (params.q && params.q.trim().length > 0) {
    qs.set('q', params.q.trim());
  }
  const res = await apiJsonRequest<{ venues: any[] }>(
    `/api/social/gyms/discover?${qs.toString()}`,
    { method: 'GET' },
    'Failed to discover gym venues',
    10000
  );
  if (!res.ok || !res.data) return res as ApiJsonResult<{ venues: DiscoveredGymVenueDto[] }>;
  const venues: DiscoveredGymVenueDto[] = (res.data.venues ?? []).map((v: any) => {
    const rawSource = v.venueSource ?? v.source ?? 'USER_SUBMITTED';
    return {
      id: v.id ?? v.existingClanId ?? undefined,
      clanId: v.clanId ?? v.existingClanId ?? undefined,
      claimedClanId: v.claimedClanId ?? v.existingClanId ?? null,
      venueKey: v.venueKey,
      name: v.name,
      tag: v.tag ?? v.existingClanTag ?? undefined,
      city: v.city ?? null,
      address: v.address ?? null,
      latitude: v.latitude,
      longitude: v.longitude,
      venueSource: rawSource === 'OPENSTREETMAP' ? 'OSM_OVERPASS' : rawSource,
      osmElementType: v.osmElementType ?? undefined,
      osmElementId: v.osmElementId ?? undefined,
      distanceMeters: v.distanceMeters,
      memberCount: v.memberCount,
      seasonPoints: v.seasonPoints,
    };
  });
  return { ok: true, statusCode: res.statusCode, data: { venues } };
}

export async function claimOrJoinGymClanApi(payload: {
  characterId: string;
  clanId?: string;
  venue?: {
    name: string;
    tag?: string;
    latitude: number;
    longitude: number;
    city?: string;
    address?: string;
    venueSource?: string;
    osmElementType?: string;
    osmElementId?: string | number;
  };
}): Promise<ApiJsonResult<{ clan: SocialGymClanDto; deduplicated?: boolean }>> {
  const sanitizedPayload = payload.venue
    ? {
        ...payload,
        venue: {
          ...payload.venue,
          venueSource:
            payload.venue.venueSource === 'OPENSTREETMAP'
              ? 'OSM_OVERPASS'
              : payload.venue.venueSource,
        },
      }
    : payload;
  const res = await apiJsonRequest<{ clan: any; deduplicated?: boolean }>(
    '/api/social/clans/claim-or-join',
    {
      method: 'POST',
      body: JSON.stringify(sanitizedPayload),
    },
    'Failed to claim or join gym clan'
  );
  if (!res.ok || !res.data) {
    return res as ApiJsonResult<{ clan: SocialGymClanDto; deduplicated?: boolean }>;
  }
  const clan = normalizeGymClanDto(res.data.clan);
  return {
    ok: true,
    statusCode: res.statusCode,
    data: {
      clan: clan!,
      deduplicated: res.data.deduplicated,
    },
  };
}

export function leaveGymClanApi(characterId: string): Promise<ApiJsonResult<{ left: boolean }>> {
  return apiJsonRequest<{ left: boolean }>(
    '/api/social/clans/leave-gym',
    {
      method: 'POST',
      body: JSON.stringify({ characterId }),
    },
    'Failed to leave gym clan'
  );
}

export async function fetchCompaniesApi(): Promise<ApiJsonResult<{ companies: SocialCompanyDto[] }>> {
  const res = await apiJsonRequest<{ companies: any[] }>(
    '/api/social/companies',
    { method: 'GET' },
    'Failed to fetch adventurer companies'
  );
  if (!res.ok || !res.data) return res as ApiJsonResult<{ companies: SocialCompanyDto[] }>;
  return {
    ok: true,
    statusCode: res.statusCode,
    data: {
      companies: (res.data.companies ?? []).map(normalizeCompanyDto),
    },
  };
}

export async function fetchCompanyDetailApi(
  companyId: string
): Promise<ApiJsonResult<{ company: SocialCompanyDto }>> {
  const res = await apiJsonRequest<{ company: any }>(
    `/api/social/companies/${encodeURIComponent(companyId)}`,
    { method: 'GET' },
    'Failed to fetch company details'
  );
  if (!res.ok || !res.data) return res as ApiJsonResult<{ company: SocialCompanyDto }>;
  return {
    ok: true,
    statusCode: res.statusCode,
    data: { company: normalizeCompanyDto(res.data.company) },
  };
}

export async function createCompanyApi(payload: {
  characterId: string;
  name: string;
  tag: string;
  motto?: string;
  description?: string;
}): Promise<ApiJsonResult<{ company: SocialCompanyDto }>> {
  const res = await apiJsonRequest<{ company: any }>(
    '/api/social/companies',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    'Failed to create adventurer company'
  );
  if (!res.ok || !res.data) return res as ApiJsonResult<{ company: SocialCompanyDto }>;
  return {
    ok: true,
    statusCode: res.statusCode,
    data: { company: normalizeCompanyDto(res.data.company) },
  };
}

export async function joinCompanyApi(
  companyId: string,
  characterId: string
): Promise<ApiJsonResult<{ company: SocialCompanyDto }>> {
  const res = await apiJsonRequest<any>(
    `/api/social/companies/${encodeURIComponent(companyId)}/join`,
    {
      method: 'POST',
      body: JSON.stringify({ characterId }),
    },
    'Failed to join adventurer company'
  );
  if (!res.ok || !res.data) return res;
  if (res.data.company) {
    return {
      ok: true,
      statusCode: res.statusCode,
      data: { company: normalizeCompanyDto(res.data.company) },
    };
  }
  return fetchCompanyDetailApi(companyId);
}

export function leaveCompanyApi(
  companyId: string,
  characterId: string
): Promise<ApiJsonResult<{ left: boolean }>> {
  return apiJsonRequest<{ left: boolean }>(
    `/api/social/companies/${encodeURIComponent(companyId)}/leave`,
    {
      method: 'POST',
      body: JSON.stringify({ characterId }),
    },
    'Failed to leave adventurer company'
  );
}

export async function updateCompanySquadApi(
  companyId: string,
  payload: {
    actorCharacterId: string;
    assignments: Array<{ characterId: string; squadSlot: number }>;
  }
): Promise<ApiJsonResult<{ company: SocialCompanyDto }>> {
  const res = await apiJsonRequest<any>(
    `/api/social/companies/${encodeURIComponent(companyId)}/squad`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    'Failed to update active squad'
  );
  if (!res.ok || !res.data) return res;
  if (res.data.company) {
    return {
      ok: true,
      statusCode: res.statusCode,
      data: { company: normalizeCompanyDto(res.data.company) },
    };
  }
  return fetchCompanyDetailApi(companyId);
}

export async function fetchFriendsApi(
  currentUserId?: string
): Promise<ApiJsonResult<SocialFriendsOverviewDto>> {
  const res = await apiJsonRequest<any>(
    '/api/social/friends',
    { method: 'GET' },
    'Failed to load friends'
  );
  if (!res.ok || !res.data) return res;
  const raw = res.data;
  if (Array.isArray(raw.accepted) && Array.isArray(raw.incoming)) {
    return res as ApiJsonResult<SocialFriendsOverviewDto>;
  }
  return {
    ok: true,
    statusCode: res.statusCode,
    data: {
      accepted: (raw.friends ?? []).map((r: any) => normalizeFriendRow(r, currentUserId)),
      incoming: (raw.incomingRequests ?? []).map((r: any) =>
        normalizeFriendRow(r, currentUserId, 'INCOMING')
      ),
      outgoing: (raw.outgoingRequests ?? []).map((r: any) =>
        normalizeFriendRow(r, currentUserId, 'OUTGOING')
      ),
    },
  };
}

export async function sendFriendRequestApi(payload: {
  targetUsername?: string;
  targetCharacterName?: string;
}): Promise<ApiJsonResult<{ friendship: SocialFriendItemDto }>> {
  const res = await apiJsonRequest<{ friendship: any }>(
    '/api/social/friends/request',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    'Failed to send friend request'
  );
  if (!res.ok || !res.data) {
    return res as ApiJsonResult<{ friendship: SocialFriendItemDto }>;
  }
  return {
    ok: true,
    statusCode: res.statusCode,
    data: {
      friendship: normalizeFriendRow(res.data.friendship, undefined, 'OUTGOING'),
    },
  };
}

export function respondFriendRequestApi(
  friendshipId: string,
  action: 'ACCEPT' | 'DECLINE'
): Promise<ApiJsonResult<{ friendship: SocialFriendItemDto }>> {
  return apiJsonRequest<{ friendship: SocialFriendItemDto }>(
    `/api/social/friends/${encodeURIComponent(friendshipId)}/respond`,
    {
      method: 'POST',
      body: JSON.stringify({ action }),
    },
    'Failed to respond to friend request'
  );
}

export function removeFriendApi(
  friendshipId: string
): Promise<ApiJsonResult<{ removed: boolean }>> {
  return apiJsonRequest<{ removed: boolean }>(
    `/api/social/friends/${encodeURIComponent(friendshipId)}`,
    { method: 'DELETE' },
    'Failed to remove friend'
  );
}

export async function fetchSocialLeaderboardsApi(
  category: SocialLeaderboardCategory,
  seasonKey?: string
): Promise<
  ApiJsonResult<{
    category: SocialLeaderboardCategory;
    seasonKey: string;
    entries: SocialLeaderboardEntryDto[];
  }>
> {
  const qs = new URLSearchParams({ category });
  if (seasonKey && seasonKey.trim().length > 0) {
    qs.set('seasonKey', seasonKey.trim());
  }
  const res = await apiJsonRequest<{
    category: SocialLeaderboardCategory;
    seasonKey: string;
    entries: any[];
  }>(
    `/api/social/leaderboards?${qs.toString()}`,
    { method: 'GET' },
    'Failed to fetch social leaderboards'
  );
  if (!res.ok || !res.data) return res as any;

  const entries: SocialLeaderboardEntryDto[] = (res.data.entries ?? []).map((row: any, idx: number) => {
    if (typeof row.totalPoints === 'number' && typeof row.rank === 'number') {
      return row as SocialLeaderboardEntryDto;
    }
    if (category === 'GYM_CLANS') {
      const clan = row.gymClan ?? row;
      return {
        rank: idx + 1,
        id: clan.id ?? row.gymClanId ?? row.id,
        name: clan.name ?? 'Gym Clan',
        tag: clan.tag ?? null,
        subtitle: clan.city ? `${clan.city} • ${clan._count?.members ?? 0} members` : `${clan._count?.members ?? 0} members`,
        workoutPoints: row.workoutPoints ?? 0,
        raidPoints: row.raidPoints ?? 0,
        arenaPoints: row.arenaPoints ?? 0,
        totalPoints: row.totalSeasonPoints ?? 0,
      };
    }
    if (category === 'COMPANIES') {
      return {
        rank: idx + 1,
        id: row.id,
        name: row.name ?? 'Company',
        tag: row.tag ?? null,
        subtitle: `${row._count?.members ?? 0}/30 Roster • Lv.${row.companyLevel ?? 1}`,
        workoutPoints: Math.round((row.companyReputation ?? 0) * 0.5),
        raidPoints: Math.round((row.companyReputation ?? 0) * 0.35),
        arenaPoints: Math.round((row.companyReputation ?? 0) * 0.15),
        totalPoints: row.companyReputation ?? 0,
      };
    }
    if (category === 'ARENA') {
      const wins = row.arenaWins ?? 0;
      const losses = row.arenaLosses ?? 0;
      return {
        rank: idx + 1,
        id: row.id,
        name: row.name ?? 'Hero',
        tag: `Lv.${row.overallLevel ?? 1}`,
        subtitle: `${wins}W - ${losses}L`,
        workoutPoints: 0,
        raidPoints: 0,
        arenaPoints: row.arenaRating ?? 1000,
        totalPoints: row.arenaRating ?? 1000,
        wins,
        losses,
      };
    }
    return {
      rank: idx + 1,
      id: row.id,
      name: row.name ?? 'Hero',
      tag: row.adventurerRank ?? null,
      subtitle: `Lv.${row.overallLevel ?? 1} Adventurer`,
      workoutPoints: (row.overallLevel ?? 1) * 50,
      raidPoints: row.adventurerReputation ?? 0,
      arenaPoints: row.arenaRating ?? 1000,
      totalPoints: (row.overallLevel ?? 1) * 50 + (row.adventurerReputation ?? 0),
    };
  });

  return {
    ok: true,
    statusCode: res.statusCode,
    data: {
      category: res.data.category,
      seasonKey: res.data.seasonKey,
      entries,
    },
  };
}

export async function fetchArenaOpponentsApi(
  characterId?: string
): Promise<ApiJsonResult<{ opponents: ArenaOpponentDto[] }>> {
  const qs = characterId ? `?characterId=${encodeURIComponent(characterId)}` : '';
  const res = await apiJsonRequest<{ opponents: any[]; rivalPresets?: any[] }>(
    `/api/social/arena/opponents${qs}`,
    { method: 'GET' },
    'Failed to fetch arena opponents'
  );
  if (!res.ok || !res.data) return res as ApiJsonResult<{ opponents: ArenaOpponentDto[] }>;

  const realOpponents: ArenaOpponentDto[] = (res.data.opponents ?? []).map((o: any) => ({
    characterId: o.characterId ?? o.id,
    name: o.name,
    title: o.adventurerRank ? `${o.adventurerRank} Rank` : undefined,
    overallLevel: o.overallLevel ?? 1,
    race: o.race,
    gymClanName: o.gymClanName ?? null,
    arenaRating: o.arenaRating ?? 1000,
    isNpcRival: Boolean(o.isNpcRival),
    isFriend: Boolean(o.isFriend),
  }));

  const rivalOpponents: ArenaOpponentDto[] = (res.data.rivalPresets ?? []).map((r: any) => ({
    characterId: r.characterId ?? r.slug,
    name: r.name,
    title: r.title,
    overallLevel: r.overallLevel ?? 1,
    race: r.race,
    gymClanName: r.gymClanName ?? null,
    arenaRating: r.arenaRating ?? 1000,
    isNpcRival: true,
  }));

  return {
    ok: true,
    statusCode: res.statusCode,
    data: {
      opponents: [...realOpponents, ...rivalOpponents],
    },
  };
}

export async function sparArenaApi(payload: {
  challengerCharacterId: string;
  defenderCharacterId: string;
  includeSquad?: boolean;
}): Promise<ApiJsonResult<{ match: ArenaMatchSummaryDto }>> {
  const res = await apiJsonRequest<{
    match: any;
    simulation?: any;
    combatLog?: TurnBasedCombatEvent[];
  }>(
    '/api/social/arena/spar',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    'Failed to run arena spar'
  );
  if (!res.ok || !res.data) return res as ApiJsonResult<{ match: ArenaMatchSummaryDto }>;

  const rawMatch = res.data.match;
  const sim = res.data.simulation;
  if (rawMatch?.nextChallengerRating !== undefined && rawMatch?.matchId) {
    return { ok: true, statusCode: res.statusCode, data: { match: rawMatch } };
  }

  const normalized: ArenaMatchSummaryDto = {
    matchId: rawMatch?.id ?? sim?.matchId ?? `arena_${Date.now()}`,
    outcome: sim?.outcome ?? rawMatch?.outcome ?? 'CHALLENGER_VICTORY',
    winnerCharacterId:
      sim?.winnerCharacterId ?? rawMatch?.winnerCharacterId ?? payload.challengerCharacterId,
    loserCharacterId:
      sim?.loserCharacterId ?? payload.defenderCharacterId,
    defenderName: rawMatch?.defenderName ?? 'Opponent',
    totalTurns: sim?.totalTurns ?? rawMatch?.totalTurns ?? 1,
    challengerRemainingHp:
      sim?.challengerRemainingHp ?? rawMatch?.combatSummary?.challengerRemainingHp ?? 0,
    defenderRemainingHp:
      sim?.defenderRemainingHp ?? rawMatch?.combatSummary?.defenderRemainingHp ?? 0,
    challengerDamageDealt:
      sim?.challengerDamageDealt ?? rawMatch?.challengerDamageDealt ?? 0,
    defenderDamageDealt:
      sim?.defenderDamageDealt ?? rawMatch?.defenderDamageDealt ?? 0,
    challengerRatingDelta:
      sim?.challengerRatingDelta ??
      ((rawMatch?.challengerRatingAfter ?? 1000) - (rawMatch?.challengerRatingBefore ?? 1000)),
    nextChallengerRating:
      sim?.nextChallengerRating ?? rawMatch?.challengerRatingAfter ?? 1000,
    goldAwarded: sim?.goldAwarded ?? rawMatch?.goldAwarded ?? 0,
    seasonPointsAwarded:
      sim?.seasonPointsAwarded ?? rawMatch?.seasonPointsAwarded ?? 0,
    combatLog:
      sim?.combatLog ?? res.data.combatLog ?? rawMatch?.combatSummary?.combatLog ?? [],
    createdAt: rawMatch?.createdAt,
  };

  return {
    ok: true,
    statusCode: res.statusCode,
    data: { match: normalized },
  };
}
