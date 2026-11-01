declare module 'expo-updates' {
  export interface UpdateCheckResult {
    isAvailable: boolean;
    manifest?: Record<string, unknown>;
  }

  export interface UpdateFetchResult {
    isNew: boolean;
    manifest?: Record<string, unknown>;
  }

  export const isEnabled: boolean;
  export const isEmbeddedLaunch: boolean;
  export const updateId: string | null;
  export const channel: string | null;
  export const createdAt: Date | null;
  export const runtimeVersion: string | null;

  export function checkForUpdateAsync(): Promise<UpdateCheckResult>;
  export function fetchUpdateAsync(): Promise<UpdateFetchResult>;
  export function reloadAsync(): Promise<void>;
}
