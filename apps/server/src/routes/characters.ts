import { PrismaClient } from '@gymify/database';
import {
  aggregateTalentModifiers,
  evaluateFatigueStateAtTime,
  getAvailableStrenuousXpMultiplier,
  getSystemicFatigueCombatPenalties,
} from '@gymify/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

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

export function registerCharacterRoutes(app: FastifyInstance, db: PrismaClient): void {
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
