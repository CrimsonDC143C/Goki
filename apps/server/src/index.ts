import { prisma } from '@goki/database';
import { buildServerApp } from './app';
import { env } from './config';
import { createBullMqGameTimerRuntime } from './queues/bullmq-workers';

async function main(): Promise<void> {
  const timers = createBullMqGameTimerRuntime({
    redisUrl: env.REDIS_URL,
    db: prisma,
  });

  const app = await buildServerApp({
    db: prisma,
    timers,
    logger: true,
  });

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}; shutting down Fastify & BullMQ workers...`);
    await app.close();
    await timers.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  const port = Number(process.env.PORT) || 4000;
  await app.listen({ port: Number(process.env.PORT) || 4000, host: '0.0.0.0' });
  console.log(`⚔️ Goki Server listening on http://0.0.0.0:${port}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Failed to start @goki/server:', err);
    process.exit(1);
  });
}

export * from './app';
export * from './config';
export * from './queues/bullmq-workers';
export * from './services/game-operations';
