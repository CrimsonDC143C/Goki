import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@goki/database';
import Fastify, { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { env, serializeBigInts } from './config';
import { requireAuth } from './middleware/auth';
import { GameTimerScheduler, createNoopTimerScheduler } from './queues/bullmq-workers';
import { registerAuthRoutes } from './routes/auth';
import { registerCharacterRoutes } from './routes/characters';
import { registerDiagnosticsRoutes, forwardWebhookAlert } from './routes/diagnostics';
import { registerDungeonRoutes } from './routes/dungeons';
import { registerGatheringRoutes } from './routes/gathering';
import { registerGuildAndRaidRoutes } from './routes/guilds-raids';
import { registerPresetRoutes } from './routes/presets';
import { registerTalentRoutes } from './routes/talents';
import { registerVersionRoutes } from './routes/version';
import { registerWebSocketRoutes } from './routes/websocket';
import { registerWorkoutRoutes } from './routes/workouts';
import { WebSocketManager, websocketManager } from './services/websocket-manager';

export interface BuildServerOptions {
  db: PrismaClient;
  timers?: GameTimerScheduler;
  wsManager?: WebSocketManager;
  logger?: boolean;
}

export async function buildServerApp(options: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  const timers = options.timers ?? createNoopTimerScheduler();
  const wsManager = options.wsManager ?? websocketManager;

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN,
  });

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(websocket);

  app.decorate('requireAuth', requireAuth);
  app.decorate('websocketManager', wsManager);

  // Automatically convert BigInt fields (Raid Boss HP & Contribution scores) before JSON serialization
  app.addHook('preSerialization', async (_request, _reply, payload) => {
    return serializeBigInts(payload);
  });

  // Global error handler translating Zod validation & domain errors cleanly
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Validation error',
        issues: error.issues,
      });
    }
    const statusCode =
      typeof (error as { statusCode?: number }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';

    // Enhance Fastify error handler: unhandled 500 exceptions are logged into BugReport
    if (statusCode >= 500 && options.db?.bugReport?.create) {
      options.db.bugReport
        .create({
          data: {
            severity: 'FATAL',
            category: 'CRASH_EXCEPTION',
            title: `Unhandled Server Exception: ${message.slice(0, 200)}`,
            errorMessage: message,
            stackTrace: error instanceof Error ? error.stack ?? null : null,
            breadcrumbs: [],
            stateSnapshot: {
              url: request.raw.url,
              method: request.raw.method,
            },
            deviceMetadata: {
              source: 'fastify-server',
              nodeVersion: process.version,
            },
          },
        })
        .then((created) => {
          const webhookUrl = env.DIAGNOSTICS_WEBHOOK_URL || process.env.DIAGNOSTICS_WEBHOOK_URL;
          if (webhookUrl) {
            forwardWebhookAlert(webhookUrl, created).catch(() => {});
          }
        })
        .catch((err) => {
          app.log?.error?.({ err }, 'Failed to persist unhandled server exception to BugReport');
        });
    }

    return reply.status(statusCode).send({ error: message });
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: '@goki/server',
    timestamp: new Date().toISOString(),
  }));

  registerWebSocketRoutes(app, wsManager);
  registerVersionRoutes(app);
  registerAuthRoutes(app, options.db);
  registerDiagnosticsRoutes(app, options.db);
  registerCharacterRoutes(app, options.db);
  registerWorkoutRoutes(app, options.db, timers);
  registerPresetRoutes(app, options.db);
  registerTalentRoutes(app, options.db);
  registerGatheringRoutes(app, options.db, timers);
  registerDungeonRoutes(app, options.db, timers, wsManager);
  registerGuildAndRaidRoutes(app, options.db, timers, wsManager);

  return app;
}
