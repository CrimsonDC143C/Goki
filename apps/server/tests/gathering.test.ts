import { PrismaClient } from '@gymify/database';
import { describe, expect, it, vi } from 'vitest';
import { buildServerApp } from '../src/app';
import { GameTimerScheduler } from '../src/queues/bullmq-workers';

describe('Gathering API & Dynamic Tick System', () => {
  it('dynamically schedules BullMQ completion based on targetDurationMs and validates bounds', async () => {
    let capturedDelayMs: number | null = null;
    const mockScheduler: GameTimerScheduler = {
      scheduleGatheringCompletion: vi.fn(async ({ delayMs }) => {
        capturedDelayMs = delayMs;
        return 'job_123';
      }),
      scheduleDungeonResolution: vi.fn(async () => 'dungeon_job'),
      scheduleTavernRestTransition: vi.fn(async () => 'tavern_job'),
      scheduleRaidRollover: vi.fn(async () => 'raid_job'),
      close: vi.fn(async () => {}),
    };

    const mockCharacter = {
      id: 'char_gatherer',
      overallLevel: 3,
      activityState: 'IDLE',
      currentLocation: 'TAVERN',
      stats: {
        strengthLevel: 5,
        enduranceLevel: 5,
        agilityLevel: 5,
      },
      gatheringTasks: [],
    };

    const mockNode = {
      id: 'node_iron_mine',
      slug: 'node_iron_mine',
      name: 'Iron Mine Vein',
      professionType: 'MINING',
      durationSeconds: 7200,
      requiredStatType: 'STRENGTH',
      requiredStatLevel: 1,
      inputMaterials: [],
      lootTable: [
        {
          itemSlug: 'iron_ore_cluster',
          itemName: 'Rich Iron Ore Cluster',
          rarity: 'COMMON',
          quantity: 2,
          weight: 100,
        },
      ],
    };

    let createdTaskData: Record<string, unknown> = {};

    const mockDb = {
      character: {
        findUnique: vi.fn(async () => mockCharacter),
        update: vi.fn(async () => mockCharacter),
      },
      gatheringNode: {
        findMany: vi.fn(async () => [mockNode]),
        findFirst: vi.fn(async () => mockNode),
      },
      activeGatheringTask: {
        findMany: vi.fn(async () => []),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdTaskData = data;
          return {
            id: 'task_abc',
            ...data,
            gatheringNode: mockNode,
          };
        }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'task_abc',
          ...createdTaskData,
          ...data,
          gatheringNode: mockNode,
        })),
      },
    } as unknown as PrismaClient;

    const app = await buildServerApp({ db: mockDb, timers: mockScheduler });

    // 1. Verify GET /api/gathering/nodes
    const nodesRes = await app.inject({ method: 'GET', url: '/api/gathering/nodes' });
    expect(nodesRes.statusCode).toBe(200);
    expect(nodesRes.json().nodes).toHaveLength(1);

    // 2. Start task with custom targetDurationMs: 15 minutes (900,000 ms)
    const customDurationMs = 15 * 60 * 1000;
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_gatherer/gathering/start',
      payload: {
        gatheringNodeId: 'node_iron_mine',
        targetDurationMs: customDurationMs,
        notifyOnCompletion: true,
      },
    });

    expect(startRes.statusCode).toBe(201);
    expect(capturedDelayMs).toBe(customDurationMs);
    expect(createdTaskData.targetDurationMs).toBe(customDurationMs);
    expect(createdTaskData.notifyOnCompletion).toBe(true);

    // 3. Start task with targetYieldAmount: 10 items
    // With stats (STR 5, END 5, level 3), calculateRequiredTimeForYield generates custom time
    const yieldRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_gatherer/gathering/start',
      payload: {
        gatheringNodeId: 'node_iron_mine',
        targetYieldAmount: 10,
        notifyOnCompletion: false,
      },
    });

    expect(yieldRes.statusCode).toBe(201);
    expect(capturedDelayMs).toBeGreaterThan(0);
    expect(capturedDelayMs).toBeLessThanOrEqual(2 * 60 * 60 * 1000);

    // 4. Verify /api/gathering/sync handles requests cleanly
    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/gathering/sync',
      payload: {},
    });
    expect(syncRes.statusCode).toBe(200);
    expect(syncRes.json().success).toBe(true);

    await app.close();
  });
});
