import { PrismaClient } from '@goki/database';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  applyAutomaticTavernTransitionOperation,
  completeGatheringTaskOperation,
  resolveDungeonRunOperation,
  resolveRaidBossRolloverOperation,
} from '../services/game-operations';

export const QUEUE_NAMES = {
  GATHERING_COMPLETION: 'gathering-completion',
  DUNGEON_RESOLUTION: 'dungeon-resolution',
  FATIGUE_TRANSITION: 'fatigue-transition',
  RAID_ROLLOVER: 'raid-rollover',
} as const;

export interface GameTimerScheduler {
  scheduleGatheringCompletion(params: {
    taskId: string;
    characterId: string;
    delayMs: number;
  }): Promise<string>;
  scheduleDungeonResolution(params: {
    dungeonRunId: string;
    delayMs: number;
  }): Promise<string>;
  scheduleTavernRestTransition(params: {
    characterId: string;
    delayMs: number;
  }): Promise<string>;
  scheduleRaidRollover(params: {
    raidInstanceId: string;
    delayMs: number;
  }): Promise<string>;
  close(): Promise<void>;
}

/**
 * Lightweight in-memory/no-op scheduler used in isolated unit tests when Redis is not attached.
 */
export function createNoopTimerScheduler(): GameTimerScheduler {
  return {
    async scheduleGatheringCompletion({ taskId }) {
      return `noop-gather-${taskId}`;
    },
    async scheduleDungeonResolution({ dungeonRunId }) {
      return `noop-dungeon-${dungeonRunId}`;
    },
    async scheduleTavernRestTransition({ characterId }) {
      return `noop-tavern-${characterId}`;
    },
    async scheduleRaidRollover({ raidInstanceId }) {
      return `noop-raid-${raidInstanceId}`;
    },
    async close() {
      // No-op
    },
  };
}

/**
 * Production Redis + BullMQ Queue & Worker suite managing:
 * 1. 2-Hour Idle Gathering/Crafting Completion (`gathering-completion`)
 * 2. 24-Hour Dungeon Auto-Battler Resolution (`dungeon-resolution`)
 * 3. 24-Hour Automatic Tavern Rest Transition (`fatigue-transition`)
 * 4. 7-Day Boss Raid Weekly Rollover (`raid-rollover`)
 */
export function createBullMqGameTimerRuntime(params: {
  redisUrl: string;
  db: PrismaClient;
}): GameTimerScheduler {
  const connection = new IORedis(params.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const gatheringQueue = new Queue(QUEUE_NAMES.GATHERING_COMPLETION, { connection });
  const dungeonQueue = new Queue(QUEUE_NAMES.DUNGEON_RESOLUTION, { connection });
  const fatigueQueue = new Queue(QUEUE_NAMES.FATIGUE_TRANSITION, { connection });
  const raidQueue = new Queue(QUEUE_NAMES.RAID_ROLLOVER, { connection });

  const gatheringWorker = new Worker<{ taskId: string; characterId: string }>(
    QUEUE_NAMES.GATHERING_COMPLETION,
    async (job) => {
      await completeGatheringTaskOperation(params.db, job.data.taskId);
    },
    { connection }
  );

  const dungeonWorker = new Worker<{ dungeonRunId: string }>(
    QUEUE_NAMES.DUNGEON_RESOLUTION,
    async (job) => {
      await resolveDungeonRunOperation(params.db, job.data.dungeonRunId);
    },
    { connection }
  );

  const fatigueWorker = new Worker<{ characterId: string }>(
    QUEUE_NAMES.FATIGUE_TRANSITION,
    async (job) => {
      await applyAutomaticTavernTransitionOperation(params.db, job.data.characterId);
    },
    { connection }
  );

  const raidWorker = new Worker<{ raidInstanceId: string }>(
    QUEUE_NAMES.RAID_ROLLOVER,
    async (job) => {
      await resolveRaidBossRolloverOperation(params.db, job.data.raidInstanceId);
    },
    { connection }
  );

  return {
    async scheduleGatheringCompletion({ taskId, characterId, delayMs }) {
      const jobId = `gather_${taskId}`;
      const job = await gatheringQueue.add(
        'complete-gathering',
        { taskId, characterId },
        { jobId, delay: Math.max(0, delayMs), removeOnComplete: true }
      );
      return job.id ?? jobId;
    },

    async scheduleDungeonResolution({ dungeonRunId, delayMs }) {
      const jobId = `dungeon_${dungeonRunId}`;
      const job = await dungeonQueue.add(
        'resolve-dungeon',
        { dungeonRunId },
        { jobId, delay: Math.max(0, delayMs), removeOnComplete: true }
      );
      return job.id ?? jobId;
    },

    async scheduleTavernRestTransition({ characterId, delayMs }) {
      const jobId = `tavern-rest_${characterId}`;
      // Remove any prior pending 24h Tavern timer for this character so the 24h window resets cleanly
      const existing = await fatigueQueue.getJob(jobId);
      if (existing) {
        await existing.remove();
      }
      const job = await fatigueQueue.add(
        'enter-tavern-rest',
        { characterId },
        { jobId, delay: Math.max(0, delayMs), removeOnComplete: true }
      );
      return job.id ?? jobId;
    },

    async scheduleRaidRollover({ raidInstanceId, delayMs }) {
      const jobId = `raid_${raidInstanceId}`;
      const job = await raidQueue.add(
        'rollover-raid',
        { raidInstanceId },
        { jobId, delay: Math.max(0, delayMs), removeOnComplete: true }
      );
      return job.id ?? jobId;
    },

    async close() {
      await Promise.all([
        gatheringWorker.close(),
        dungeonWorker.close(),
        fatigueWorker.close(),
        raidWorker.close(),
        gatheringQueue.close(),
        dungeonQueue.close(),
        fatigueQueue.close(),
        raidQueue.close(),
      ]);
      await connection.quit();
    },
  };
}
