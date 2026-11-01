import { FastifyInstance } from 'fastify';
import { env } from '../config';

export interface VersionManifestResponse {
  latestVersion: string;
  minRequiredVersion: string;
  androidApkDownloadUrl: string | null;
  releaseNotes: string;
  serverTimestamp: string;
}

export function registerVersionRoutes(app: FastifyInstance): void {
  /**
   * Public endpoint for dual-layer auto-update polling & binary APK distribution.
   * Clients check this on startup, foreground resume, or periodic intervals.
   */
  app.get('/api/version', async (): Promise<VersionManifestResponse> => {
    return {
      latestVersion: env.APP_LATEST_VERSION,
      minRequiredVersion: env.APP_MIN_REQUIRED_VERSION,
      androidApkDownloadUrl: env.ANDROID_APK_DOWNLOAD_URL || null,
      releaseNotes: env.APP_RELEASE_NOTES,
      serverTimestamp: new Date().toISOString(),
    };
  });
}
