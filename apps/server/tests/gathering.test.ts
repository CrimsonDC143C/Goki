import { PrismaClient } from '@goki/database';
import { describe, expect, it, vi } from 'vitest';
import { buildServerApp } from '../src/app';
import { GameTimerScheduler } from '../src/queues/bullmq-workers';
import {
  completeGatheringTaskOperation,
  resolveDungeonRunOperation,
  resolveRaidBossRolloverOperation,
  syncGatheringTaskTicksOperation,
} from '../src/services/game-operations';

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
      userId: 'user_gatherer_1',
      deletedAt: null,
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
    const token = app.jwt.sign({
      userId: 'user_gatherer_1',
      email: 'gatherer@gokirpg.com',
      username: 'gatherer',
    });

    // 1. Verify GET /api/gathering/nodes
    const nodesRes = await app.inject({ method: 'GET', url: '/api/gathering/nodes' });
    expect(nodesRes.statusCode).toBe(200);
    expect(nodesRes.json().nodes).toHaveLength(1);

    // 2. Start task with custom targetDurationMs: 15 minutes (900,000 ms)
    const customDurationMs = 15 * 60 * 1000;
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_gatherer/gathering/start',
      headers: { authorization: `Bearer ${token}` },
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
      headers: { authorization: `Bearer ${token}` },
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
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(syncRes.statusCode).toBe(200);
    expect(syncRes.json().success).toBe(true);

    await app.close();
  });

  it('triggers applyStatXpProgression level-ups on gathering ticks and ensures idempotent completion & dungeon resolution', async () => {
    const startedAt = new Date(Date.now() - 60 * 60 * 1000);
    const completesAt = new Date(startedAt.getTime() + 60 * 60 * 1000);

    const charStats = {
      characterId: 'char_levelup_1',
      strengthLevel: 1,
      strengthXp: 195, // 200 XP needed for Lv.1 -> Lv.2
      strengthTalentPointsAvailable: 0,
      enduranceLevel: 1,
      enduranceXp: 0,
      enduranceTalentPointsAvailable: 0,
      agilityLevel: 1,
      agilityXp: 0,
      agilityTalentPointsAvailable: 0,
    };

    const charRecord = {
      id: 'char_levelup_1',
      userId: 'user_1',
      overallLevel: 1,
      gold: 100,
      activityState: 'GATHERING',
      stats: charStats,
    };

    const taskRecord: any = {
      id: 'task_levelup_idemp_1',
      characterId: 'char_levelup_1',
      status: 'IN_PROGRESS',
      startedAt,
      completesAt,
      lastTickProcessedAt: startedAt,
      targetDurationMs: 60 * 60 * 1000,
      accumulatedTicks: 0,
      yieldedLoot: [],
      gatheringNode: {
        id: 'node_1',
        professionType: 'MINING',
        requiredStatLevel: 1,
        lootTable: [
          {
            itemSlug: 'iron_ore_cluster',
            itemName: 'Rich Iron Ore Cluster',
            rarity: 'COMMON',
            quantity: 1,
            weight: 100,
          },
        ],
      },
      character: charRecord,
    };

    const inventoryDeposits: any[] = [];
    let goldIncrementCalls = 0;

    const mockDb = {
      activeGatheringTask: {
        findUnique: async () => taskRecord,
        update: async ({ data }: any) => {
          Object.assign(taskRecord, data);
          return taskRecord;
        },
      },
      characterStats: {
        update: async ({ data }: any) => {
          if (data.strengthLevel !== undefined) charStats.strengthLevel = data.strengthLevel;
          if (data.strengthXp !== undefined) charStats.strengthXp = data.strengthXp;
          if (data.strengthTalentPointsAvailable?.increment) {
            charStats.strengthTalentPointsAvailable +=
              data.strengthTalentPointsAvailable.increment;
          }
          return charStats;
        },
      },
      character: {
        findUnique: async () => charRecord,
        update: async ({ data }: any) => {
          if (data.overallLevel !== undefined) charRecord.overallLevel = data.overallLevel;
          if (data.activityState !== undefined) charRecord.activityState = data.activityState;
          if (data.gold?.increment) {
            goldIncrementCalls += 1;
            charRecord.gold += data.gold.increment;
          }
          return charRecord;
        },
      },
      item: {
        findUnique: async () => ({ id: 'item_ore', slug: 'iron_ore_cluster', stackable: true }),
      },
      inventoryItem: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          inventoryDeposits.push(data);
          return data;
        },
      },
      dungeonRun: {
        findUnique: async () => ({
          id: 'drun_idemp_1',
          status: 'ACTIVE_WINDOW',
          randomSeed: 'seed_idemp_1',
          partyBaselineSnapshot: [
            {
              characterId: 'char_levelup_1',
              name: 'Hero',
              coreStats: { strengthLevel: 10, enduranceLevel: 10, agilityLevel: 10 },
              equipmentBonuses: {},
              unlockedTalentRanks: {},
              systemicFatigueStacks: 0,
            },
          ],
          activeWorkoutBuffs: [],
          dungeon: {
            slug: 'obsidian_catacombs',
            name: 'Obsidian Catacombs',
            roomsConfig: [
              {
                roomNumber: 1,
                roomType: 'COMBAT',
                name: 'Crypt Entrance',
                enemyHp: 100,
                enemyAttackPower: 10,
                enemyAttackIntervalMs: 2000,
                goldReward: 50,
                lootTable: [],
              },
            ],
          },
          participants: [{ id: 'part_1', characterId: 'char_levelup_1', partySlot: 1 }],
          combatReplay: null,
        }),
        update: async () => ({}),
      },
      dungeonRunParticipant: {
        update: async () => ({}),
      },
      dungeonCombatReplay: {
        findUnique: async () => null,
        create: async ({ data }: any) => ({ id: 'replay_1', ...data }),
      },
    } as unknown as PrismaClient;

    // 1. Concurrent completeGatheringTaskOperation calls only award loot & XP once
    const [comp1, comp2] = await Promise.all([
      completeGatheringTaskOperation(mockDb, 'task_levelup_idemp_1'),
      completeGatheringTaskOperation(mockDb, 'task_levelup_idemp_1'),
    ]);

    expect([comp1.alreadyCompleted, comp2.alreadyCompleted].sort()).toEqual([false, true]);
    expect(charStats.strengthLevel).toBeGreaterThanOrEqual(2);
    expect(charStats.strengthTalentPointsAvailable).toBeGreaterThanOrEqual(1);
    expect(inventoryDeposits.length).toBe(comp1.yieldedLoot.length || comp2.yieldedLoot.length);

    // 2. Concurrent resolveDungeonRunOperation calls only award gold once
    const [dres1, dres2] = await Promise.all([
      resolveDungeonRunOperation(mockDb, 'drun_idemp_1'),
      resolveDungeonRunOperation(mockDb, 'drun_idemp_1'),
    ]);
    expect(dres1).toBeDefined();
    expect(dres2).toBeDefined();
    expect(goldIncrementCalls).toBe(1);
  });

  it('handles gracefulMissing for deleted rows and scales ultra-large BigInt raid HP (> 2^53 - 1) without precision loss', async () => {
    const emptyDb = {
      activeGatheringTask: { findUnique: async () => null },
      dungeonRun: { findUnique: async () => null },
      raidBossInstance: { findUnique: async () => null },
    } as unknown as PrismaClient;

    // 1. Deleted rows with gracefulMissing resolve cleanly as no-op
    const gatherNoop = await completeGatheringTaskOperation(emptyDb, 'deleted_task', {
      gracefulMissing: true,
    });
    expect(gatherNoop.alreadyCompleted).toBe(true);

    const dungeonNoop = await resolveDungeonRunOperation(emptyDb, 'deleted_run', {
      gracefulMissing: true,
    });
    expect((dungeonNoop as any).alreadyResolved).toBe(true);

    const raidNoop = await resolveRaidBossRolloverOperation(emptyDb, 'deleted_raid', {
      gracefulMissing: true,
    });
    expect((raidNoop as any).alreadyResolved).toBe(true);

    // 2. Ultra-large World Boss HP (> 2^53 - 1) scales down proportionally for calculateRaidRewards
    const colossalHp = 90_071_992_547_409_920n; // ~10x Number.MAX_SAFE_INTEGER
    const char1Dmg = 60_047_995_031_606_613n; // ~2/3 of total
    const char2Dmg = 30_023_997_515_803_307n; // ~1/3 of total

    const raidDb = {
      raidBossInstance: {
        findUnique: async () => ({
          id: 'raid_colossal_1',
          accessType: 'PUBLIC_WORLD',
          maxHp: colossalHp,
          currentHp: 0n,
          isDefeated: true,
          status: 'REWARDS_DISTRIBUTED',
          bossMechanicsConfig: { baseGoldPool: 30_000, baseGuildRepPool: 6_000 },
          lootPoolConfig: [],
          contributions: [
            {
              characterId: 'hero_colossal_1',
              combatDamageDealt: char1Dmg,
              workoutEnergyDamage: 0n,
              supportScore: 0n,
            },
            {
              characterId: 'hero_colossal_2',
              combatDamageDealt: char2Dmg,
              workoutEnergyDamage: 0n,
              supportScore: 0n,
            },
          ],
        }),
      },
    } as unknown as PrismaClient;

    const resolution: any = await resolveRaidBossRolloverOperation(raidDb, 'raid_colossal_1');
    expect(resolution.isBossDefeated).toBe(true);
    const r1 = resolution.participantRewards.find((p: any) => p.characterId === 'hero_colossal_1');
    const r2 = resolution.participantRewards.find((p: any) => p.characterId === 'hero_colossal_2');
    expect(r1.contributionRatio).toBeCloseTo(2 / 3, 2);
    expect(r2.contributionRatio).toBeCloseTo(1 / 3, 2);
  });
});
