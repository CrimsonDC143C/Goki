import { PrismaClient } from '@gymify/database';
import {
  aggregateTalentModifiers,
  evaluateFatigueStateAtTime,
  getAvailableStrenuousXpMultiplier,
  getSystemicFatigueCombatPenalties,
} from '@gymify/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

export const SOFT_DELETE_RETENTION_DAYS = 30;
export const SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function computeDaysRemaining(deletedAt: Date, now = new Date()): number {
  return Math.max(
    0,
    Math.ceil((deletedAt.getTime() + SOFT_DELETE_RETENTION_MS - now.getTime()) / (24 * 60 * 60 * 1000))
  );
}

const travelSchema = z.object({
  destination: z.enum(['TAVERN', 'GUILD_HALL', 'DUNGEON', 'GATHERING_NODE', 'RAID_SANCTUM']),
});

const equipSchema = z.object({
  slot: z.enum([
    'mainHand',
    'offHand',
    'head',
    'chest',
    'legs',
    'boots',
    'accessory1',
    'accessory2',
  ]),
  inventoryItemId: z.string().nullable(),
});

const createCharacterSchema = z.object({
  name: z.string().min(2).max(32),
  gameMode: z.enum(['STANDARD', 'IRONMAN_VERIFIED']).default('STANDARD'),
  appearanceId: z.string().optional(),
  avatarSpriteId: z.string().optional(),
});

const patchCharacterSchema = z.object({
  name: z.string().min(2).max(32).optional(),
  appearanceId: z.string().min(1).optional(),
  avatarSpriteId: z.string().min(1).optional(),
});

export function registerCharacterRoutes(app: FastifyInstance, db: PrismaClient): void {
  /**
   * GET /api/characters
   * Protected route: lists all characters belonging to the authenticated user.
   * Enforces the account ceiling rule: maximum 2 characters (1 Standard, 1 Ironman).
   * Partitions into active and 30-day soft-deleted characters.
   */
  app.get('/api/characters', { preHandler: [requireAuth] }, async (request, reply) => {
    const { userId } = request.user;
    const now = new Date();
    const cutoff = new Date(now.getTime() - SOFT_DELETE_RETENTION_MS);

    if (typeof (db.character as any).deleteMany === 'function') {
      try {
        await db.character.deleteMany({
          where: {
            userId,
            deletedAt: { lt: cutoff },
          },
        });
      } catch {
        // Ignore if unsupported in test mock
      }
    }

    const allCharacters = await db.character.findMany({
      where: { userId },
      include: {
        stats: true,
        fatigueState: true,
        equipmentLoadout: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const activeCharacters = allCharacters.filter((c) => !c.deletedAt);
    const deletedCharacters = allCharacters
      .filter((c) => c.deletedAt && new Date(c.deletedAt).getTime() >= cutoff.getTime())
      .map((c) => ({
        ...c,
        daysRemaining: computeDaysRemaining(new Date(c.deletedAt!)),
      }));

    return reply.send({
      characters: activeCharacters,
      activeCharacters,
      deletedCharacters,
    });
  });

  /**
   * POST /api/characters
   * Protected route: creates a new character for the authenticated user.
   * Strict Constraint: Only 2 active characters per user account, exactly one per game mode.
   */
  app.post('/api/characters', { preHandler: [requireAuth] }, async (request, reply) => {
    const { userId } = request.user;
    const body = createCharacterSchema.parse(request.body);
    const chosenName = body.name.trim();
    const chosenAppearance = body.appearanceId || body.avatarSpriteId || 'oni_warlord';

    // 1. Check existing active characters for this account
    const existingCharacters = await db.character.findMany({
      where: { userId },
    });
    const activeCharacters = existingCharacters.filter((c) => !c.deletedAt);

    if (activeCharacters.length >= 2) {
      return reply.status(400).send({
        error:
          'Account character limit reached. Each user is allowed a maximum of 2 characters: one Standard (Manual Honesty) and one Ironman Verified.',
      });
    }

    if (activeCharacters.some((c) => c.gameMode === body.gameMode)) {
      const modeLabel = body.gameMode === 'STANDARD' ? 'Standard (Manual Honesty)' : 'Ironman Verified';
      return reply.status(409).send({
        error: `You already have a character in ${modeLabel} mode. Only one character is permitted per game mode.`,
      });
    }

    // 2. Check name uniqueness among active characters
    const existingCharacterWithName =
      typeof (db.character as any).findFirst === 'function'
        ? await db.character.findFirst({
            where: {
              name: chosenName,
              deletedAt: null,
            },
          })
        : await db.character.findUnique({
            where: { name: chosenName },
          });

    if (existingCharacterWithName && !existingCharacterWithName.deletedAt) {
      return reply.status(409).send({
        error: 'A character with this name already exists in the realm. Please choose a different name.',
      });
    }

    // If a soft-deleted character held this name in the DB, rename it so database unique constraints won't clash
    if (typeof (db.character as any).findFirst === 'function' && typeof (db.character as any).update === 'function') {
      const existingDeletedWithName = await db.character.findFirst({
        where: {
          name: chosenName,
          NOT: { deletedAt: null },
        },
      });
      if (existingDeletedWithName) {
        await db.character.update({
          where: { id: existingDeletedWithName.id },
          data: { name: `${chosenName}#${existingDeletedWithName.id.slice(-4)}` },
        });
      }
    }

    // 3. Create the character with required relational records
    const character = await db.character.create({
      data: {
        userId,
        name: chosenName,
        gameMode: body.gameMode,
        appearanceId: chosenAppearance,
        avatarSpriteId: chosenAppearance,
        stats: { create: {} },
        fatigueState: { create: {} },
        equipmentLoadout: { create: {} },
      },
      include: {
        stats: true,
        fatigueState: true,
        equipmentLoadout: true,
      },
    });

    return reply.status(201).send({ character });
  });

  /**
   * PATCH /api/characters/:characterId
   * Updates character appearance and/or name.
   */
  app.patch('/api/characters/:characterId', { preHandler: [requireAuth] }, async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);
    const body = patchCharacterSchema.parse(request.body);

    const character = await db.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found.' });
    }
    if (character.userId !== request.user.userId) {
      return reply.status(403).send({ error: 'You do not own this character.' });
    }
    if (character.deletedAt) {
      return reply.status(400).send({ error: 'Cannot update a soft-deleted character.' });
    }

    const dataToUpdate: Record<string, any> = {};

    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (trimmedName !== character.name) {
        const nameConflict =
          typeof (db.character as any).findFirst === 'function'
            ? await db.character.findFirst({
                where: {
                  name: trimmedName,
                  deletedAt: null,
                  id: { not: characterId },
                },
              })
            : await db.character.findUnique({
                where: { name: trimmedName },
              });
        if (nameConflict && nameConflict.id !== characterId && !nameConflict.deletedAt) {
          return reply.status(409).send({
            error: 'A character with this name already exists in the realm. Please choose a different name.',
          });
        }
        if (typeof (db.character as any).findFirst === 'function' && typeof (db.character as any).update === 'function') {
          const existingDeletedWithName = await db.character.findFirst({
            where: {
              name: trimmedName,
              NOT: { deletedAt: null },
              id: { not: characterId },
            },
          });
          if (existingDeletedWithName) {
            await db.character.update({
              where: { id: existingDeletedWithName.id },
              data: { name: `${trimmedName}#${existingDeletedWithName.id.slice(-4)}` },
            });
          }
        }
        dataToUpdate.name = trimmedName;
      }
    }

    const nextAppearance = body.appearanceId || body.avatarSpriteId;
    if (nextAppearance) {
      dataToUpdate.appearanceId = nextAppearance;
      dataToUpdate.avatarSpriteId = nextAppearance;
    }

    const updated = await db.character.update({
      where: { id: characterId },
      data: dataToUpdate,
      include: {
        stats: true,
        fatigueState: true,
        equipmentLoadout: true,
      },
    });

    return reply.send({ character: updated });
  });

  /**
   * DELETE /api/characters/:characterId
   * Soft-deletes character for 30-day retention or permanently erases if ?permanent=true.
   */
  app.delete('/api/characters/:characterId', { preHandler: [requireAuth] }, async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);
    const query = request.query as { permanent?: string | boolean } | undefined;
    const body = (request.body as { permanent?: boolean } | undefined) ?? {};
    const isPermanent =
      query?.permanent === 'true' || query?.permanent === true || body?.permanent === true;

    const character = await db.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found.' });
    }
    if (character.userId !== request.user.userId) {
      return reply.status(403).send({ error: 'You do not own this character.' });
    }

    if (isPermanent) {
      await db.character.delete({
        where: { id: characterId },
      });
      return reply.send({ deleted: true, permanent: true, characterId });
    }

    const updated = await db.character.update({
      where: { id: characterId },
      data: { deletedAt: new Date() },
      include: {
        stats: true,
        fatigueState: true,
        equipmentLoadout: true,
      },
    });

    return reply.send({ character: updated, daysRemaining: SOFT_DELETE_RETENTION_DAYS });
  });

  /**
   * POST /api/characters/:characterId/restore
   * Restores a soft-deleted character within the 30-day window.
   */
  app.post('/api/characters/:characterId/restore', { preHandler: [requireAuth] }, async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);

    const character = await db.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found.' });
    }
    if (character.userId !== request.user.userId) {
      return reply.status(403).send({ error: 'You do not own this character.' });
    }
    if (!character.deletedAt) {
      return reply.status(400).send({ error: 'Character is already active.' });
    }

    const deletedTimestamp = new Date(character.deletedAt).getTime();
    if (deletedTimestamp + SOFT_DELETE_RETENTION_MS < Date.now()) {
      return reply.status(410).send({
        error: 'The 30-day restoration window for this hero has expired.',
      });
    }

    const userCharacters = await db.character.findMany({
      where: { userId: request.user.userId },
    });
    const conflict = userCharacters.find(
      (c) => !c.deletedAt && c.id !== characterId && c.gameMode === character.gameMode
    );

    if (conflict) {
      return reply.status(409).send({
        error:
          'You already have an active hero in this mode slot. Please delete/archive your current active hero in that mode before restoring this fallen hero.',
      });
    }

    const restored = await db.character.update({
      where: { id: characterId },
      data: { deletedAt: null },
      include: {
        stats: true,
        fatigueState: true,
        equipmentLoadout: true,
      },
    });

    return reply.send({ character: restored });
  });

  // Fetch full Character sheet with live projected Tavern Rest & Systemic Fatigue state
  app.get('/api/characters/:characterId', async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);

    const character = await db.character.findUnique({
      where: { id: characterId },
      include: {
        stats: true,
        fatigueState: true,
        talentUnlocks: { include: { talentNode: true } },
        inventoryItems: { include: { item: true } },
        equipmentLoadout: {
          include: {
            mainHand: { include: { item: true } },
            offHand: { include: { item: true } },
            head: { include: { item: true } },
            chest: { include: { item: true } },
            legs: { include: { item: true } },
            boots: { include: { item: true } },
            accessory1: { include: { item: true } },
            accessory2: { include: { item: true } },
          },
        },
        gatheringTasks: {
          where: { status: 'IN_PROGRESS' },
          include: { gatheringNode: true },
          take: 1,
        },
        guildMembership: { include: { guild: true } },
      },
    });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found.' });
    }

    let projectedFatigue = null;
    let combatPenalties = null;
    let nextWorkoutMultiplier = 1.0;

    if (character.fatigueState) {
      const f = character.fatigueState;
      projectedFatigue = evaluateFatigueStateAtTime(
        {
          isRestingInTavern: f.isRestingInTavern,
          tavernEnteredAt: f.tavernEnteredAt,
          lastStrenuousWorkoutAt: f.lastStrenuousWorkoutAt,
          lastWorkoutAt: f.lastWorkoutAt,
          consecutiveHighIntensityDays: f.consecutiveHighIntensityDays,
          lastHighIntensityDayKey: f.lastHighIntensityDayKey,
          systemicFatigueStacks: f.systemicFatigueStacks,
          fatigueScore: f.fatigueScore,
          wellRestedMultiplier: f.wellRestedMultiplier,
          activeRecoveryBuffActive: f.activeRecoveryBuffActive,
          activeRecoveryGrantedAt: f.activeRecoveryGrantedAt,
        },
        new Date()
      );
      combatPenalties = getSystemicFatigueCombatPenalties(projectedFatigue.systemicFatigueStacks);
      nextWorkoutMultiplier = getAvailableStrenuousXpMultiplier(projectedFatigue);
    }

    const unlockedRanks: Record<string, number> = {};
    for (const u of character.talentUnlocks) {
      unlockedRanks[u.talentNode.slug] = u.currentRank;
    }
    const aggregatedTalents = aggregateTalentModifiers(unlockedRanks);

    return reply.send({
      character,
      liveFatigueProjection: {
        state: projectedFatigue,
        combatPenalties,
        nextWorkoutMultiplier,
      },
      aggregatedTalents,
    });
  });

  // Instant Travel between RPG locations (No step/GPS gate per MVP spec)
  app.post('/api/characters/:characterId/travel', async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);
    const { destination } = travelSchema.parse(request.body);

    const character = await db.character.update({
      where: { id: characterId },
      data: { currentLocation: destination },
    });

    return reply.send({ character });
  });

  // Stat-gated Equipment Loadout slot assignment
  app.post('/api/characters/:characterId/equip', async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);
    const { slot, inventoryItemId } = equipSchema.parse(request.body);

    const character = await db.character.findUnique({
      where: { id: characterId },
      include: { stats: true, equipmentLoadout: true },
    });
    if (!character || !character.stats) {
      return reply.status(404).send({ error: 'Character not found.' });
    }

    if (inventoryItemId !== null) {
      const invItem = await db.inventoryItem.findUnique({
        where: { id: inventoryItemId },
        include: { item: true },
      });

      if (!invItem || invItem.characterId !== characterId) {
        return reply.status(400).send({ error: 'Inventory item does not belong to character.' });
      }

      // Enforce Strength / Endurance / Agility equip requirements
      if (character.stats.strengthLevel < invItem.item.requiredStrength) {
        return reply.status(400).send({
          error: `Requires Strength Level ${invItem.item.requiredStrength} (current: ${character.stats.strengthLevel}).`,
        });
      }
      if (character.stats.enduranceLevel < invItem.item.requiredEndurance) {
        return reply.status(400).send({
          error: `Requires Endurance Level ${invItem.item.requiredEndurance} (current: ${character.stats.enduranceLevel}).`,
        });
      }
      if (character.stats.agilityLevel < invItem.item.requiredAgility) {
        return reply.status(400).send({
          error: `Requires Agility Level ${invItem.item.requiredAgility} (current: ${character.stats.agilityLevel}).`,
        });
      }
    }

    const slotFieldMap: Record<typeof slot, string> = {
      mainHand: 'mainHandItemId',
      offHand: 'offHandItemId',
      head: 'headItemId',
      chest: 'chestItemId',
      legs: 'legsItemId',
      boots: 'bootsItemId',
      accessory1: 'accessory1ItemId',
      accessory2: 'accessory2ItemId',
    };
    const fkField = slotFieldMap[slot];

    const updatedLoadout = await db.equipmentLoadout.upsert({
      where: { characterId },
      update: { [fkField]: inventoryItemId },
      create: { characterId, [fkField]: inventoryItemId },
      include: {
        mainHand: { include: { item: true } },
        offHand: { include: { item: true } },
        head: { include: { item: true } },
        chest: { include: { item: true } },
        legs: { include: { item: true } },
        boots: { include: { item: true } },
        accessory1: { include: { item: true } },
        accessory2: { include: { item: true } },
      },
    });

    return reply.send({ loadout: updatedLoadout });
  });
}
