import { PrismaClient } from '@gymify/database';
import { describe, expect, it } from 'vitest';
import { buildServerApp } from '../app';

describe('Version Manifest & Binary Distribution Endpoint (/api/version)', () => {
  const mockDb = {} as unknown as PrismaClient;

  it('GET /api/version returns 200 with the full version manifest without authentication', async () => {
    const app = await buildServerApp({ db: mockDb });

    const response = await app.inject({
      method: 'GET',
      url: '/api/version',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body).toHaveProperty('latestVersion');
    expect(body).toHaveProperty('minRequiredVersion');
    expect(body).toHaveProperty('androidApkDownloadUrl');
    expect(body).toHaveProperty('releaseNotes');
    expect(body).toHaveProperty('serverTimestamp');

    expect(typeof body.latestVersion).toBe('string');
    expect(typeof body.minRequiredVersion).toBe('string');
    expect(typeof body.releaseNotes).toBe('string');
    expect(new Date(body.serverTimestamp).getTime()).not.toBeNaN();
  });
});
