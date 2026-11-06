import { PrismaClient } from '@gymify/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildServerApp } from '../app';
import { forwardWebhookAlert } from '../routes/diagnostics';

describe('@gymify/server Diagnostics, Bug Reporting, & Exception Subsystem', () => {
  let memoryReports: any[] = [];
  let mockDb: any;

  beforeEach(() => {
    memoryReports = [];
    mockDb = {
      bugReport: {
        create: vi.fn(async ({ data }: any) => {
          const report = {
            id: `bug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: data.status || 'OPEN',
            ...data,
          };
          memoryReports.push(report);
          return report;
        }),
        findMany: vi.fn(async ({ where, take }: any) => {
          let list = [...memoryReports];
          if (where?.severity) {
            list = list.filter((r) => r.severity === where.severity);
          }
          if (where?.category) {
            list = list.filter((r) => r.category === where.category);
          }
          if (where?.status) {
            list = list.filter((r) => r.status === where.status);
          }
          return list.slice(0, take || 50);
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const report = memoryReports.find((r) => r.id === where.id);
          if (!report) throw new Error('Report not found');
          Object.assign(report, data, { updatedAt: new Date() });
          return report;
        }),
      },
    } as unknown as PrismaClient;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits a bug report anonymously when unauthenticated (pre-login crash preservation)', async () => {
    const app = await buildServerApp({ db: mockDb });

    const response = await app.inject({
      method: 'POST',
      url: '/api/diagnostics/report',
      payload: {
        severity: 'ERROR',
        category: 'UI_UX',
        title: 'App crashed on boot landing screen',
        userDescription: 'Clicked Enter World before login and screen went blank',
        errorMessage: 'Cannot read properties of undefined (reading avatarSprite)',
        stackTrace: 'TypeError: Cannot read properties of undefined\n    at LandingScreen.tsx:42:15',
        breadcrumbs: [
          {
            timestamp: Date.now(),
            level: 'action',
            category: 'navigation',
            message: 'User tapped Enter World',
          },
          {
            timestamp: Date.now(),
            level: 'error',
            category: 'console.error',
            message: 'Uncaught TypeError in LandingScreen',
          },
        ],
        stateSnapshot: { activeScreen: 'LandingScreen', appMode: 'LANDING' },
        deviceMetadata: { platform: 'web', osVersion: '1.0.0', isWeb: true },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('OPEN');

    expect(mockDb.bugReport.create).toHaveBeenCalledTimes(1);
    expect(memoryReports[0].userId).toBeNull();
    expect(memoryReports[0].severity).toBe('ERROR');
    expect(memoryReports[0].title).toBe('App crashed on boot landing screen');
    expect(memoryReports[0].breadcrumbs).toHaveLength(2);

    await app.close();
  });

  it('submits an authenticated bug report and securely attaches userId from Bearer JWT', async () => {
    const app = await buildServerApp({ db: mockDb });

    // Generate valid test JWT
    const token = app.jwt.sign({
      userId: 'user_warrior_99',
      email: 'warrior@gymify.rpg',
      username: 'iron_warrior',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/diagnostics/report',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        severity: 'WARNING',
        category: 'WORKOUT_SYNC',
        title: 'Offline set failed to sync after network restoration',
        userDescription: 'Completed 4 sets of Bench Press offline, 1 set missing from receipt',
        characterId: 'char_hero_1',
        breadcrumbs: [
          {
            timestamp: Date.now(),
            level: 'action',
            category: 'workout_sync',
            message: 'Dispatched 4 offline workout sets',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(memoryReports[0].userId).toBe('user_warrior_99');
    expect(memoryReports[0].characterId).toBe('char_hero_1');
    expect(memoryReports[0].severity).toBe('WARNING');
    expect(memoryReports[0].category).toBe('WORKOUT_SYNC');

    await app.close();
  });

  it('enforces Zod payload validation, capping breadcrumbs and rejecting invalid payloads', async () => {
    const app = await buildServerApp({ db: mockDb });

    // 1. Missing required title
    const missingTitle = await app.inject({
      method: 'POST',
      url: '/api/diagnostics/report',
      payload: {
        severity: 'ERROR',
        category: 'OTHER',
      },
    });
    expect(missingTitle.statusCode).toBe(400);

    // 2. Title exceeding 250 characters
    const titleTooLong = await app.inject({
      method: 'POST',
      url: '/api/diagnostics/report',
      payload: {
        title: 'A'.repeat(251),
      },
    });
    expect(titleTooLong.statusCode).toBe(400);

    // 3. Invalid severity enum
    const invalidSeverity = await app.inject({
      method: 'POST',
      url: '/api/diagnostics/report',
      payload: {
        title: 'Valid title',
        severity: 'SUPER_CRITICAL_CATASTROPHIC',
      },
    });
    expect(invalidSeverity.statusCode).toBe(400);

    // 4. Breadcrumb array exceeding 200 elements rejected
    const tooManyBreadcrumbs = await app.inject({
      method: 'POST',
      url: '/api/diagnostics/report',
      payload: {
        title: 'Payload bloat test',
        breadcrumbs: Array.from({ length: 201 }, (_, i) => ({
          timestamp: Date.now(),
          level: 'info',
          category: 'stress_test',
          message: `Log entry ${i}`,
        })),
      },
    });
    expect(tooManyBreadcrumbs.statusCode).toBe(400);

    await app.close();
  });

  it('protects GET /api/diagnostics/reports and filters by severity, category, and status', async () => {
    const app = await buildServerApp({ db: mockDb });

    // Seed test reports in memory
    memoryReports.push(
      {
        id: 'bug_1',
        title: 'Fatal Crash 1',
        severity: 'FATAL',
        category: 'CRASH_EXCEPTION',
        status: 'OPEN',
        createdAt: new Date('2026-11-01T10:00:00Z'),
      },
      {
        id: 'bug_2',
        title: 'UI Button Misaligned',
        severity: 'WARNING',
        category: 'UI_UX',
        status: 'OPEN',
        createdAt: new Date('2026-11-01T11:00:00Z'),
      },
      {
        id: 'bug_3',
        title: 'Wearable Sync Timeout',
        severity: 'ERROR',
        category: 'WEARABLE_TELEMETRY',
        status: 'RESOLVED',
        createdAt: new Date('2026-11-01T12:00:00Z'),
      }
    );

    // 1. Unauthenticated request rejected with 401
    const unauth = await app.inject({
      method: 'GET',
      url: '/api/diagnostics/reports',
    });
    expect(unauth.statusCode).toBe(401);

    // 2. Authenticated request succeeds
    const token = app.jwt.sign({
      userId: 'admin_dev',
      email: 'admin@gymify.rpg',
      username: 'admin',
    });

    const allRes = await app.inject({
      method: 'GET',
      url: '/api/diagnostics/reports',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(allRes.statusCode).toBe(200);
    expect(allRes.json().reports).toHaveLength(3);

    // 3. Filtered request by severity=FATAL
    const fatalRes = await app.inject({
      method: 'GET',
      url: '/api/diagnostics/reports?severity=FATAL',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(fatalRes.statusCode).toBe(200);
    expect(fatalRes.json().reports).toHaveLength(1);
    expect(fatalRes.json().reports[0].id).toBe('bug_1');

    // 4. Submit and filter FEATURE_SUGGESTION
    const suggestionRes = await app.inject({
      method: 'POST',
      url: '/api/diagnostics/report',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        severity: 'INFO',
        category: 'FEATURE_SUGGESTION',
        title: 'Add Guild Boss Replay Speed Slider',
        userDescription: 'Allow players to watch 24h raid replays at 2x and 4x speed',
      },
    });
    expect(suggestionRes.statusCode).toBe(201);
    expect(suggestionRes.json().ok).toBe(true);

    const filterSuggestionRes = await app.inject({
      method: 'GET',
      url: '/api/diagnostics/reports?category=FEATURE_SUGGESTION',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(filterSuggestionRes.statusCode).toBe(200);
    const suggBody = filterSuggestionRes.json();
    expect(suggBody.reports.some((r: any) => r.title === 'Add Guild Boss Replay Speed Slider')).toBe(true);

    await app.close();
  });

  it('updates bug report status via PATCH /api/diagnostics/reports/:id', async () => {
    const app = await buildServerApp({ db: mockDb });

    memoryReports.push({
      id: 'bug_target',
      title: 'Stamina Ring Desync',
      severity: 'ERROR',
      category: 'WORKOUT_SYNC',
      status: 'OPEN',
      createdAt: new Date(),
    });

    const token = app.jwt.sign({
      userId: 'dev_user',
      email: 'dev@gymify.rpg',
      username: 'dev_hero',
    });

    // Update status to INVESTIGATING
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/diagnostics/reports/bug_target',
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'INVESTIGATING' },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().report.status).toBe('INVESTIGATING');
    expect(memoryReports[0].status).toBe('INVESTIGATING');

    // Reject invalid status
    const badPatch = await app.inject({
      method: 'PATCH',
      url: '/api/diagnostics/reports/bug_target',
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'NON_EXISTENT_STATUS' },
    });
    expect(badPatch.statusCode).toBe(400);

    await app.close();
  });

  it('enforces ADMIN_EMAILS check on GET and PATCH /api/diagnostics/reports in production', async () => {
    const app = await buildServerApp({ db: mockDb });
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAdminEmails = process.env.ADMIN_EMAILS;

    try {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_EMAILS = 'admin@gymify.rpg, lead@gymify.rpg';

      const nonAdminToken = app.jwt.sign({
        userId: 'playtester_1',
        email: 'playtester@example.com',
        username: 'playtester',
      });

      const adminToken = app.jwt.sign({
        userId: 'admin_1',
        email: 'ADMIN@gymify.rpg',
        username: 'admin',
      });

      // 1. Non-admin blocked with 403 on GET and PATCH
      const deniedGet = await app.inject({
        method: 'GET',
        url: '/api/diagnostics/reports',
        headers: { authorization: `Bearer ${nonAdminToken}` },
      });
      expect(deniedGet.statusCode).toBe(403);

      const deniedPatch = await app.inject({
        method: 'PATCH',
        url: '/api/diagnostics/reports/bug_1',
        headers: { authorization: `Bearer ${nonAdminToken}` },
        payload: { status: 'RESOLVED' },
      });
      expect(deniedPatch.statusCode).toBe(403);

      // 2. Admin allowed on GET
      const allowedGet = await app.inject({
        method: 'GET',
        url: '/api/diagnostics/reports',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(allowedGet.statusCode).toBe(200);

      // 3. When ADMIN_EMAILS is unset/empty in production, authenticated users are allowed
      process.env.ADMIN_EMAILS = '';
      const openWhenEmptyGet = await app.inject({
        method: 'GET',
        url: '/api/diagnostics/reports',
        headers: { authorization: `Bearer ${nonAdminToken}` },
      });
      expect(openWhenEmptyGet.statusCode).toBe(200);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevAdminEmails === undefined) {
        delete process.env.ADMIN_EMAILS;
      } else {
        process.env.ADMIN_EMAILS = prevAdminEmails;
      }
      await app.close();
    }
  });

  it('forwards diagnostic alerts via webhook formatting when webhook is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    await forwardWebhookAlert('https://discord.com/api/webhooks/mock/test', {
      id: 'bug_webhook_1',
      severity: 'FATAL',
      category: 'CRASH_EXCEPTION',
      title: 'Dungeon Boss Sim Memory Spike',
      userDescription: 'Happened on floor 10 auto-battle',
      errorMessage: 'FATAL: JavaScript heap out of memory',
      stackTrace: 'Error: Out of memory\n    at DungeonSim.ts:99',
      userId: 'user_player_1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call).toBeDefined();
    const [url, options] = call;
    expect(url).toBe('https://discord.com/api/webhooks/mock/test');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body as string);
    expect(body.content).toContain('FATAL');
    expect(body.content).toContain('Dungeon Boss Sim Memory Spike');
    expect(body.embeds[0].title).toBe('Dungeon Boss Sim Memory Spike');
    expect(body.embeds[0].color).toBe(0xe02424);
  });

  it('logs unhandled 500 server exceptions automatically into BugReport with severity FATAL', async () => {
    const app = await buildServerApp({ db: mockDb });

    // Register a temporary test route that throws an unhandled exception
    app.get('/test/unhandled-crash', async () => {
      throw new Error('Database connection abruptly terminated');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/unhandled-crash',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().error).toBe('Database connection abruptly terminated');

    // Verify Fastify error handler called bugReport.create
    expect(mockDb.bugReport.create).toHaveBeenCalled();
    const createdReport = memoryReports.find((r) => r.severity === 'FATAL');
    expect(createdReport).toBeDefined();
    expect(createdReport.category).toBe('CRASH_EXCEPTION');
    expect(createdReport.title).toContain('Unhandled Server Exception');
    expect(createdReport.deviceMetadata.source).toBe('fastify-server');

    await app.close();
  });
});

describe('DiagnosticLogger Ring-Buffer & Secret Sanitization Logic', () => {
  it('sanitizes passwords, JWT tokens, Bearer strings, and auth secrets recursively', async () => {
    const { sanitizeDiagnosticData } = await import('@gymify/game-engine');

    const testState = {
      user: {
        id: 'usr_1',
        username: 'dragon_slayer',
        password: 'SuperSecretPassword123!',
        jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3JfMSJ9.signaturePart',
      },
      headers: {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def',
        apiKey: 'auth_secret_key_123',
      },
      workout: {
        phase: 'DungeonActive',
        exercises: [{ name: 'Deadlift', weightKg: 140, reps: 5 }],
      },
      rawLog: 'User session Bearer some_token_here authenticated successfully',
    };

    const sanitized = sanitizeDiagnosticData(testState) as any;

    expect(sanitized.user.id).toBe('usr_1');
    expect(sanitized.user.username).toBe('dragon_slayer');
    expect(sanitized.user.password).toBe('[REDACTED]');
    expect(sanitized.user.jwtToken).toBe('[REDACTED]');
    expect(sanitized.headers.Authorization).toBe('[REDACTED]');
    expect(sanitized.headers.apiKey).toBe('[REDACTED]');
    expect(sanitized.workout.phase).toBe('DungeonActive');
    expect(sanitized.workout.exercises[0].weightKg).toBe(140);
    expect(sanitized.rawLog).toContain('Bearer [REDACTED_TOKEN]');
  });

  it('caps the breadcrumb buffer at 100 entries and rolls oldest entries out', async () => {
    const { BreadcrumbRingBuffer } = await import('@gymify/game-engine');

    const buffer = new BreadcrumbRingBuffer(100);
    expect(buffer.getAll()).toHaveLength(0);

    for (let i = 1; i <= 120; i++) {
      buffer.addBreadcrumb('action', 'test', `Breadcrumb entry #${i}`);
    }

    const breadcrumbs = buffer.getAll();
    expect(breadcrumbs).toHaveLength(100);
    // Oldest 20 entries (1 to 20) should have rolled out
    expect(breadcrumbs[0]?.message).toBe('Breadcrumb entry #21');
    expect(breadcrumbs[99]?.message).toBe('Breadcrumb entry #120');

    buffer.clear();
    expect(buffer.getAll()).toHaveLength(0);
  });
});
