import { PrismaClient } from '@gymify/database';
import {
  calculateGatheringTick,
  calculateRequiredTimeForYield,
  MAX_GATHERING_DURATION_MS,
  MIN_GATHERING_DURATION_MS,
} from '@gymify/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GameTimerScheduler } from '../queues/bullmq-workers';
import {
  completeGatheringTaskOperation,
  syncGatheringTaskTicksOperation,
} from '../services/game-operations';

const MAX_GATHERING_SECONDS = 2 * 60 * 60; // Strict 2-hour max per spec

const startGatheringSchema = z.object({
  gatheringNodeId: z.string(),
  durationSeconds: z.number().int().min(60).max(MAX_GATHERING_SECONDS).optional(),
  targetDurationMs: z.number().int().min(MIN_GATHERING_DURATION_MS).max(MAX_GATHERING_DURATION_MS).optional(),
  targetYieldAmount: z.number().int().min(1).optional(),
  notifyOnCompletion: z.boolean().optional(),
});

const syncGatheringSchema = z
  .object({
    characterId: z.string().optional(),
    taskId: z.string().optional(),
  })
  .optional();

interface InputMaterialRequirement {
  itemSlug: string;
  quantity: number;
}

export function registerGatheringRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  timers: GameTimerScheduler
): void {
  // List all Gathering & Crafting Profession Nodes
  app.get('/api/gathering/nodes', async (_request, reply) => {
    const nodes = await db.gatheringNode.findMany({
      orderBy: [{ professionType: 'asc' }, { requiredStatLevel: 'asc' }],
    });
    return reply.send({ nodes });
  });

  // Assign character to a dynamic stat-driven Gathering or Crafting task
  app.post('/api/characters/:characterId/gathering/start', async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);
    const body = startGatheringSchema.parse(request.body);

    const character = await db.character.findUnique({
      where: { id: characterId },
      include: {
        stats: true,
        gatheringTasks: { where: { status: 'IN_PROGRESS' } },
      },
    });

    if (!character || !character.stats) {
      return reply.status(404).send({ error: 'Character not found.' });
    }

    if (character.gatheringTasks.length > 0) {
      return reply.status(400).send({
        error: 'Character already has an active gathering/crafting task in progress.',
      });
    }

    if (character.activityState === 'IN_DUNGEON') {
      return reply.status(400).send({
        error: 'Cannot start a gathering task while locked into an active Dungeon expedition.',
      });
    }

    const node = await db.gatheringNode.findFirst({
      where: { OR: [{ id: body.gatheringNodeId }, { slug: body.gatheringNodeId }] },
    });

    if (!node) {
      return reply.status(404).send({ error: 'Gathering node not found.' });
    }

    // Check required stat level
    if (node.requiredStatType === 'STRENGTH' && character.stats.strengthLevel < node.requiredStatLevel) {
      return reply.status(400).send({
        error: `Requires Strength Level ${node.requiredStatLevel}.`,
      });
    }
    if (node.requiredStatType === 'ENDURANCE' && character.stats.enduranceLevel < node.requiredStatLevel) {
      return reply.status(400).send({
        error: `Requires Endurance Level ${node.requiredStatLevel}.`,
      });
    }
    if (node.requiredStatType === 'AGILITY' && character.stats.agilityLevel < node.requiredStatLevel) {
      return reply.status(400).send({
        error: `Requires Agility Level ${node.requiredStatLevel}.`,
      });
    }

    // Check & consume input materials for Crafting professions (Smelting / Alchemy)
    const inputs = (node.inputMaterials as unknown as InputMaterialRequirement[]) ?? [];
    for (const req of inputs) {
      const item = await db.item.findUnique({ where: { slug: req.itemSlug } });
      if (!item) {
        return reply.status(400).send({ error: `Missing catalog item '${req.itemSlug}'.` });
      }
      const inv = await db.inventoryItem.findFirst({
        where: { characterId, itemId: item.id },
      });
      if (!inv || inv.quantity < req.quantity) {
        return reply.status(400).send({
          error: `Insufficient ${item.name}: requires ${req.quantity}, owned ${inv?.quantity ?? 0}.`,
        });
      }
    }

    for (const req of inputs) {
      const item = (await db.item.findUnique({ where: { slug: req.itemSlug } }))!;
      const inv = (await db.inventoryItem.findFirst({
        where: { characterId, itemId: item.id },
      }))!;
      if (inv.quantity === req.quantity) {
        await db.inventoryItem.delete({ where: { id: inv.id } });
      } else {
        await db.inventoryItem.update({
          where: { id: inv.id },
          data: { quantity: inv.quantity - req.quantity },
        });
      }
    }

    // Determine target duration dynamically based on user's targetDurationMs or targetYieldAmount
    const tick = calculateGatheringTick(
      character.stats,
      character.overallLevel,
      node.requiredStatLevel,
      node.professionType
    );

    let durationMs: number;
    if (body.targetDurationMs) {
      durationMs = Math.min(MAX_GATHERING_DURATION_MS, Math.max(MIN_GATHERING_DURATION_MS, body.targetDurationMs));
    } else if (body.targetYieldAmount) {
      const calculatedTimeMs = calculateRequiredTimeForYield(
        tick.tickIntervalMs,
        tick.yieldPerTick,
        body.targetYieldAmount
      );
      durationMs = Math.min(MAX_GATHERING_DURATION_MS, Math.max(MIN_GATHERING_DURATION_MS, calculatedTimeMs));
    } else if (body.durationSeconds) {
      durationMs = Math.min(MAX_GATHERING_DURATION_MS, body.durationSeconds * 1000);
    } else {
      durationMs = Math.min(MAX_GATHERING_DURATION_MS, node.durationSeconds * 1000);
    }

    const startedAt = new Date();
    const completesAt = new Date(startedAt.getTime() + durationMs);

    const task = await db.activeGatheringTask.create({
      data: {
        characterId,
        gatheringNodeId: node.id,
        status: 'IN_PROGRESS',
        startedAt,
        completesAt,
        lastTickProcessedAt: startedAt,
        targetDurationMs: durationMs,
        targetYieldAmount: body.targetYieldAmount ?? null,
        notifyOnCompletion: body.notifyOnCompletion ?? false,
        accumulatedTicks: 0,
      },
      include: { gatheringNode: true },
    });

    // Dynamically set the BullMQ job delay based on the user's custom duration
    const jobId = await timers.scheduleGatheringCompletion({
      taskId: task.id,
      characterId,
      delayMs: durationMs,
    });

    const updatedTask = await db.activeGatheringTask.update({
      where: { id: task.id },
      data: { bullMqJobId: jobId },
      include: { gatheringNode: true },
    });

    await db.character.update({
      where: { id: characterId },
      data: {
        currentLocation: 'GATHERING_NODE',
        activityState: 'GATHERING',
      },
    });

    return reply.status(201).send({ task: updatedTask });
  });

  // Tick Processing / Sync Endpoint (checked on app initialization and foregrounding)
  // Calculates Date.now() - lastTickProcessedAt, distributes elapsed ticks' loot/XP directly to DB,
  // and updates lastTickProcessedAt to prevent double-dipping.
  app.post('/api/gathering/sync', async (request, reply) => {
    const body = syncGatheringSchema.parse(request.body ?? {});

    let tasksToSync: Array<{ id: string }> = [];

    if (body?.taskId) {
      tasksToSync = [{ id: body.taskId }];
    } else if (body?.characterId) {
      tasksToSync = await db.activeGatheringTask.findMany({
        where: { characterId: body.characterId, status: 'IN_PROGRESS' },
        select: { id: true },
      });
    } else {
      tasksToSync = await db.activeGatheringTask.findMany({
        where: { status: 'IN_PROGRESS' },
        select: { id: true },
      });
    }

    const syncResults = [];
    for (const t of tasksToSync) {
      const res = await syncGatheringTaskTicksOperation(db, t.id);
      syncResults.push(res);
    }

    return reply.send({
      success: true,
      syncedCount: syncResults.length,
      syncedTasks: syncResults,
      ...(syncResults.length === 1 ? syncResults[0] : {}),
    });
  });

  // Character-scoped sync alias
  app.post('/api/characters/:characterId/gathering/sync', async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);

    const activeTasks = await db.activeGatheringTask.findMany({
      where: { characterId, status: 'IN_PROGRESS' },
      select: { id: true },
    });

    const syncResults = [];
    for (const t of activeTasks) {
      const res = await syncGatheringTaskTicksOperation(db, t.id);
      syncResults.push(res);
    }

    return reply.send({
      success: true,
      characterId,
      syncedCount: syncResults.length,
      syncedTasks: syncResults,
      ...(syncResults.length === 1 ? syncResults[0] : {}),
    });
  });

  // Complete / claim an expired gathering task (or force-complete in dev preview)
  app.post('/api/gathering/tasks/:taskId/complete', async (request, reply) => {
    const { taskId } = z.object({ taskId: z.string() }).parse(request.params);
    const { forceDevComplete = false } = z
      .object({ forceDevComplete: z.boolean().optional() })
      .parse(request.body ?? {});

    const task = await db.activeGatheringTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return reply.status(404).send({ error: 'Gathering task not found.' });
    }

    if (!forceDevComplete && task.completesAt.getTime() > Date.now()) {
      const remainingSec = Math.ceil((task.completesAt.getTime() - Date.now()) / 1000);
      return reply.status(400).send({
        error: `Task still in progress (${remainingSec}s remaining).`,
      });
    }

    const result = await completeGatheringTaskOperation(db, taskId);
    return reply.send(result);
  });
}
