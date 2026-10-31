import { PrismaClient } from '@gymify/database';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const workoutCategoryEnum = z.enum(['GYM', 'CARDIO', 'SPORT', 'RECOVERY']);
const setTypeEnum = z.enum(['NORMAL', 'WARMUP', 'DROP_SET', 'FAILURE', 'AMRAP']);

const presetBlocksSchema = z.object({
  sessionRpeTarget: z.number().min(1).max(10).nullable().optional(),
  exerciseBlocks: z
    .array(
      z.object({
        blockId: z.string().min(1),
        exerciseSlug: z.string().min(1),
        exerciseName: z.string().min(1),
        supersetGroupId: z.string().nullable().optional(),
        sets: z
          .array(
            z.object({
              setType: setTypeEnum.default('NORMAL'),
              targetWeightKg: z.number().min(0),
              targetReps: z.number().int().min(0),
              targetRpe: z.number().min(1).max(10).nullable().optional(),
            })
          )
          .default([]),
      })
    )
    .default([]),
  cardioSegments: z
    .array(
      z.object({
        segmentId: z.string().min(1),
        exerciseSlug: z.string().min(1),
        exerciseName: z.string().min(1),
        activityType: z.string().min(1),
        targetDurationMinutes: z.number().min(0),
        targetHrZone: z.number().int().min(1).max(5),
        targetRpe: z.number().min(1).max(10).nullable().optional(),
      })
    )
    .default([]),
});

const upsertPresetSchema = z.object({
  userId: z.string().optional(),
  name: z.string().min(1).max(140),
  category: workoutCategoryEnum,
  notes: z.string().max(1000).optional(),
  blocks: presetBlocksSchema,
});

/**
 * Workout Preset CRUD. Presets are local-first on the client (GameContext + offline storage);
 * these routes let the server mirror and sync them when connectivity is available.
 */
export function registerPresetRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get('/api/workout-presets', async (request, reply) => {
    const query = z
      .object({ userId: z.string().optional(), category: workoutCategoryEnum.optional() })
      .parse(request.query);

    const presets = await db.workoutPreset.findMany({
      where: {
        ...(query.category ? { category: query.category } : {}),
        OR: [{ isSystemSeed: true }, ...(query.userId ? [{ userId: query.userId }] : [])],
      },
      orderBy: [{ isSystemSeed: 'desc' }, { updatedAt: 'desc' }],
    });
    return reply.send({ presets });
  });

  app.post('/api/workout-presets', async (request, reply) => {
    const body = upsertPresetSchema.parse(request.body);
    const preset = await db.workoutPreset.create({
      data: {
        userId: body.userId ?? null,
        name: body.name,
        category: body.category,
        notes: body.notes ?? null,
        isSystemSeed: false,
        blocks: body.blocks as unknown as object,
      },
    });
    return reply.status(201).send({ preset });
  });

  app.put('/api/workout-presets/:presetId', async (request, reply) => {
    const { presetId } = z.object({ presetId: z.string() }).parse(request.params);
    const body = upsertPresetSchema.parse(request.body);

    const existing = await db.workoutPreset.findUnique({ where: { id: presetId } });
    if (!existing) {
      return reply.status(404).send({ error: 'Preset not found.' });
    }
    if (existing.isSystemSeed) {
      return reply
        .status(403)
        .send({ error: 'System starter presets are read-only. Save a copy instead.' });
    }

    const preset = await db.workoutPreset.update({
      where: { id: presetId },
      data: {
        name: body.name,
        category: body.category,
        notes: body.notes ?? null,
        blocks: body.blocks as unknown as object,
      },
    });
    return reply.send({ preset });
  });

  app.delete('/api/workout-presets/:presetId', async (request, reply) => {
    const { presetId } = z.object({ presetId: z.string() }).parse(request.params);
    const existing = await db.workoutPreset.findUnique({ where: { id: presetId } });
    if (!existing) {
      return reply.status(404).send({ error: 'Preset not found.' });
    }
    if (existing.isSystemSeed) {
      return reply.status(403).send({ error: 'System starter presets cannot be deleted.' });
    }
    await db.workoutPreset.delete({ where: { id: presetId } });
    return reply.status(204).send();
  });
}
