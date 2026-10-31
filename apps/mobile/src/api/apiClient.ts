import Constants from 'expo-constants';
import {
  getStoredAuthToken,
  removeStoredAuthToken,
  setStoredAuthToken,
} from './tokenStorage';

export function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) {
    if ((envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) && Constants?.expoConfig?.hostUri) {
      const lanHost = Constants.expoConfig.hostUri.split(':')[0];
      if (lanHost) {
        return `http://${lanHost}:4000`;
      }
    }
    return envUrl.replace(/\/$/, '');
  }
  const hostUri = Constants?.expoConfig?.hostUri;
  if (hostUri) {
    const lanHost = hostUri.split(':')[0];
    if (lanHost) {
      return `http://${lanHost}:4000`;
    }
  }
  return 'http://localhost:4000';
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
}

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
  characterName?: string;
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
  timeoutMs = 3000
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
  data?: { user: AuthUser; character: any };
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
 * Clears the stored JWT authentication token.
 */
export async function logoutAccount(): Promise<void> {
  await removeStoredAuthToken();
}
