import { PrismaClient } from '@goki/database';
import {
  CompletedWorkoutRecord,
  DEFAULT_TALENT_TREES,
  FatigueStateSnapshot,
  ItemRarity,
  ItemTier,
  MULTI_WEEK_WORKOUT_PROGRAMS,
  TalentGoverningStat,
  aggregateTalentModifiers,
  calculateTraderSellValue,
  createInitialFatigueState,
  evaluateTraderPurchase,
  generateTraderRotatingStock,
  generateTrainerCoachingReport,
  recommendTalentBuildForStats,
  respecCharacterTalents,
  toUtcDayKey,
} from '@goki/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertCharacterActiveAndOwned, requireAuth } from '../middleware/auth';
import { depositLootToInventory, withDbTransaction } from '../services/game-operations';

const traderStockQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const traderBuyBodySchema = z.object({
  characterId: z.string().min(1),
  offerId: z.string().min(1),
  quantity: z.number().int().min(1).max(20).optional().default(1),
  rotationDateKey: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const traderSellBodySchema = z.object({
  characterId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(999).optional().default(1),
});

const respecBodySchema = z.object({
  characterId: z.string().optional(),
});

const coachingBodySchema = z.object({
  characterId: z.string().min(1),
  workoutHistory: z.array(z.any()).optional(),
});

const characterParamsSchema = z.object({
  characterId: z.string().min(1),
});

const optionalCharacterParamsSchema = z.object({
  characterId: z.string().optional(),
});

function isInventoryItemEquipped(loadout: any, inventoryItemId: string): boolean {
  if (!loadout) return false;
  const equippedIds = [
    loadout.mainHandItemId ?? loadout.mainHand?.id,
    loadout.offHandItemId ?? loadout.offHand?.id,
    loadout.headItemId ?? loadout.head?.id,
    loadout.chestItemId ?? loadout.chest?.id,
    loadout.legsItemId ?? loadout.legs?.id,
    loadout.bootsItemId ?? loadout.boots?.id,
    loadout.accessory1ItemId ?? loadout.accessory1?.id,
    loadout.accessory2ItemId ?? loadout.accessory2?.id,
  ];
  return equippedIds.some((id) => id === inventoryItemId);
}

function mapDbWorkoutLogsToCompletedRecords(workoutLogs: any[]): CompletedWorkoutRecord[] {
  return workoutLogs.map((log) => {
    const sets = Array.isArray(log.sets) ? log.sets : [];
    const groupedExercises = new Map<
      string,
      {
        exerciseId: string;
        exerciseName: string;
        sets: CompletedWorkoutRecord['exercises'][number]['sets'];
      }
    >();

    for (const set of sets) {
      if (set.reps == null && set.weightKg == null) continue;
      const exId = String(set.exercise?.slug ?? set.exerciseId ?? 'unknown_exercise');
      const exName = String(set.exercise?.name ?? exId);
      const existing = groupedExercises.get(exId) ?? {
        exerciseId: exId,
        exerciseName: exName,
        sets: [],
      };
      existing.sets.push({
        setNumber: set.setNumber ?? existing.sets.length + 1,
        weightKg: Number(set.weightKg ?? 0),
        reps: Number(set.reps ?? 0),
        rpe: set.rpe ?? null,
        setType: set.setType ?? undefined,
        isWarmup: Boolean(set.isWarmup),
      });
      groupedExercises.set(exId, existing);
    }

    const cardioEntries: CompletedWorkoutRecord['cardioEntries'] =
      log.cardioActivityType || log.workoutType === 'CARDIO_ENDURANCE'
        ? [
            {
              exerciseId: String(log.cardioActivityType ?? 'cardio_session'),
              exerciseName: String(log.cardioActivityType ?? 'Cardio Session'),
              activityType: log.cardioActivityType ?? undefined,
              workoutCategory: log.workoutCategory ?? undefined,
              durationSeconds: Number(log.durationSeconds ?? 0),
              averageHrZone: log.averageHrZone ?? undefined,
              rpe: log.sessionRpe ?? null,
            },
          ]
        : undefined;

    return {
      id: String(log.id),
      characterId: String(log.characterId),
      source: 'ONLINE',
      performedAtIso:
        log.performedAt instanceof Date
          ? log.performedAt.toISOString()
          : String(log.performedAt ?? new Date().toISOString()),
      durationSeconds: Number(log.durationSeconds ?? 0),
      workoutCategory: log.workoutCategory ?? undefined,
      workoutType: log.workoutType ?? undefined,
      exercises: Array.from(groupedExercises.values()),
      cardioEntries,
    };
  });
}

export function registerNpcHubRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get('/api/npc/trader/stock', async (request, reply) => {
    const query = traderStockQuerySchema.parse(request.query ?? {});
    const rotationDateKey = query.date ?? toUtcDayKey(new Date());
    return reply.send({
      rotationDateKey,
      offers: generateTraderRotatingStock(rotationDateKey),
    });
  });

  app.post('/api/npc/trader/buy', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = traderBuyBodySchema.parse(request.body ?? {});
    await assertCharacterActiveAndOwned(db, body.characterId, request.user.userId);

    const txResult = await withDbTransaction(
      db,
      async (tx) => {
        const character = await tx.character.findUnique({
          where: { id: body.characterId },
        });
        if (!character) {
          return { ok: false as const, statusCode: 404, error: 'Character not found.' };
        }

        const rotationDateKey = body.rotationDateKey ?? toUtcDayKey(new Date());
        const stock = generateTraderRotatingStock(rotationDateKey);
        const offer = stock.find((entry) => entry.offerId === body.offerId);
        if (!offer) {
          return {
            ok: false as const,
            statusCode: 404,
            error: `Trader offer '${body.offerId}' is not available in rotation '${rotationDateKey}'.`,
          };
        }

        const evalRes = evaluateTraderPurchase({
          offerId: body.offerId,
          quantity: body.quantity,
          currentGold: character.gold,
          rotationDateKey,
        });

        if (!evalRes.ok) {
          return { ok: false as const, statusCode: 400, error: evalRes.error };
        }

        await tx.character.update({
          where: { id: body.characterId },
          data: { gold: { decrement: evalRes.totalGoldCost } },
        });

        for (const drop of evalRes.purchasedDrops) {
          await depositLootToInventory(tx, body.characterId, drop);
        }

        const inventoryItems = await tx.inventoryItem.findMany({
          where: { characterId: body.characterId },
          include: { item: true },
        });

        return {
          ok: true as const,
          offerId: body.offerId,
          quantity: evalRes.quantity,
          goldSpent: evalRes.totalGoldCost,
          remainingGold: evalRes.remainingGold,
          purchasedDrops: evalRes.purchasedDrops,
          inventoryItems,
        };
      },
      `trader:${body.characterId}`
    );

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    return reply.send(txResult);
  });

  app.post('/api/npc/trader/sell', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = traderSellBodySchema.parse(request.body ?? {});
    await assertCharacterActiveAndOwned(db, body.characterId, request.user.userId);

    const txResult = await withDbTransaction(
      db,
      async (tx) => {
        const character = await tx.character.findUnique({
          where: { id: body.characterId },
          include: { equipmentLoadout: true },
        });
        if (!character) {
          return { ok: false as const, statusCode: 404, error: 'Character not found.' };
        }

        let invItem = await tx.inventoryItem.findUnique({
          where: { id: body.inventoryItemId },
          include: { item: true },
        });
        if (!invItem) {
          invItem = await tx.inventoryItem.findFirst({
            where: { characterId: body.characterId, item: { slug: body.inventoryItemId } },
            include: { item: true },
          });
        }

        if (!invItem || invItem.characterId !== body.characterId) {
          return { ok: false as const, statusCode: 404, error: 'Inventory item not found.' };
        }

        if (invItem.isLocked) {
          return { ok: false as const, statusCode: 400, error: 'Cannot sell locked item.' };
        }

        if (isInventoryItemEquipped(character.equipmentLoadout, invItem.id)) {
          return {
            ok: false as const,
            statusCode: 400,
            error: 'Unequip item before selling it to the Trader.',
          };
        }

        if (invItem.quantity < body.quantity) {
          return {
            ok: false as const,
            statusCode: 400,
            error: 'Insufficient item quantity to sell.',
          };
        }

        const meta = (invItem.itemMetadata ?? {}) as Record<string, any>;
        const sellVal = calculateTraderSellValue({
          baseGoldValue: (invItem.item as any)?.goldValue,
          itemSlug: invItem.item?.slug ?? (invItem as any).itemSlug,
          tier: meta.tier as ItemTier | undefined,
          rarity: (meta.rarity ?? invItem.item?.rarity) as ItemRarity | undefined,
          quantity: body.quantity,
        });

        const nextQuantity = invItem.quantity - body.quantity;
        if (nextQuantity <= 0) {
          await tx.inventoryItem.delete({ where: { id: invItem.id } });
        } else {
          await tx.inventoryItem.update({
            where: { id: invItem.id },
            data: { quantity: nextQuantity },
          });
        }

        const inventoryItems = await tx.inventoryItem.findMany({
          where: { characterId: body.characterId },
          include: { item: true },
        });

        const remainingSlugQty = new Map<string, number>();
        for (const row of inventoryItems) {
          const slug = row.item?.slug ?? (row as any).itemSlug;
          if (slug && row.quantity > 0) {
            remainingSlugQty.set(slug, (remainingSlugQty.get(slug) ?? 0) + row.quantity);
          }
        }

        const currentBelt = Array.isArray(character.beltLoadout)
          ? (character.beltLoadout as Array<string | null>)
          : [null, null, null, null];
        let beltChanged = false;
        const beltLoadout = currentBelt.map((slotSlug) => {
          if (typeof slotSlug === 'string' && slotSlug.length > 0) {
            if ((remainingSlugQty.get(slotSlug) ?? 0) <= 0) {
              beltChanged = true;
              return null;
            }
          }
          return slotSlug ?? null;
        });

        const updatedChar = await tx.character.update({
          where: { id: body.characterId },
          data: {
            gold: { increment: sellVal.totalSellGold },
            ...(beltChanged ? { beltLoadout: beltLoadout as any } : {}),
          },
        });

        return {
          ok: true as const,
          soldQuantity: body.quantity,
          goldEarned: sellVal.totalSellGold,
          remainingGold: updatedChar.gold,
          beltLoadout,
          inventoryItems,
        };
      },
      `trader:${body.characterId}`
    );

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    return reply.send(txResult);
  });

  const handleTrainerRespec = async (request: any, reply: any) => {
    const params = optionalCharacterParamsSchema.parse(request.params ?? {});
    const body = respecBodySchema.parse(request.body ?? {});
    const characterId = params.characterId ?? body.characterId;

    if (!characterId) {
      return reply.status(400).send({ error: 'characterId is required.' });
    }

    await assertCharacterActiveAndOwned(db, characterId, request.user.userId);

    const txResult = await withDbTransaction(
      db,
      async (tx) => {
        const character = await tx.character.findUnique({
          where: { id: characterId },
          include: {
            stats: true,
            talentUnlocks: { include: { talentNode: true } },
          },
        });

        if (!character || !character.stats) {
          return { ok: false as const, statusCode: 404, error: 'Character not found.' };
        }

        const unlockedNodeRanks: Record<string, number> = {};
        for (const unlock of character.talentUnlocks ?? []) {
          if (unlock.talentNode?.slug) {
            unlockedNodeRanks[unlock.talentNode.slug] = unlock.currentRank;
          }
        }

        const statsAny = character.stats as any;
        const availablePoints: Record<TalentGoverningStat, number> = {
          STRENGTH: statsAny.strengthTalentPointsAvailable ?? 0,
          ENDURANCE: statsAny.enduranceTalentPointsAvailable ?? 0,
          AGILITY: statsAny.agilityTalentPointsAvailable ?? 0,
          DEXTERITY: statsAny.dexterityTalentPointsAvailable ?? 0,
          CONSTITUTION: statsAny.constitutionTalentPointsAvailable ?? 0,
          WISDOM: statsAny.wisdomTalentPointsAvailable ?? 0,
          SPIRIT: statsAny.spiritTalentPointsAvailable ?? 0,
        };

        const respecRes = respecCharacterTalents({
          currentGold: character.gold,
          availablePoints,
          unlockedNodeRanks,
          activeSkillLoadout: character.activeSkillLoadout,
          trees: DEFAULT_TALENT_TREES,
        });

        if (!respecRes.ok) {
          return { ok: false as const, statusCode: 400, error: respecRes.error };
        }

        await tx.characterTalentUnlock.deleteMany({
          where: { characterId },
        });

        const updatedStats = await tx.characterStats.update({
          where: { characterId },
          data: {
            strengthTalentPointsAvailable: respecRes.nextAvailablePoints.STRENGTH,
            strengthTalentPointsSpent: 0,
            enduranceTalentPointsAvailable: respecRes.nextAvailablePoints.ENDURANCE,
            enduranceTalentPointsSpent: 0,
            agilityTalentPointsAvailable: respecRes.nextAvailablePoints.AGILITY,
            agilityTalentPointsSpent: 0,
            dexterityTalentPointsAvailable: respecRes.nextAvailablePoints.DEXTERITY,
            dexterityTalentPointsSpent: 0,
            constitutionTalentPointsAvailable: respecRes.nextAvailablePoints.CONSTITUTION,
            constitutionTalentPointsSpent: 0,
            wisdomTalentPointsAvailable: respecRes.nextAvailablePoints.WISDOM,
            wisdomTalentPointsSpent: 0,
            spiritTalentPointsAvailable: respecRes.nextAvailablePoints.SPIRIT,
            spiritTalentPointsSpent: 0,
          },
        });

        await tx.character.update({
          where: { id: characterId },
          data: {
            gold: { decrement: respecRes.goldCost },
            activeSkillLoadout: respecRes.nextActiveSkillLoadout as any,
          },
        });

        return {
          ok: true as const,
          goldCost: respecRes.goldCost,
          remainingGold: respecRes.remainingGold,
          totalPointsRefunded: respecRes.totalPointsRefunded,
          refundedByStat: respecRes.refundedByStat,
          updatedStats,
          activeSkillLoadout: respecRes.nextActiveSkillLoadout,
          aggregatedTalents: aggregateTalentModifiers({}),
        };
      },
      `talents:${characterId}`
    );

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    return reply.send(txResult);
  };

  app.post('/api/npc/trainer/respec', { preHandler: [requireAuth] }, handleTrainerRespec);
  app.post('/api/characters/:characterId/talents/respec', { preHandler: [requireAuth] }, handleTrainerRespec);

  app.post('/api/npc/trainer/coaching', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = coachingBodySchema.parse(request.body ?? {});
    await assertCharacterActiveAndOwned(db, body.characterId, request.user.userId);

    const character = await db.character.findUnique({
      where: { id: body.characterId },
      include: {
        stats: true,
        fatigueState: true,
        workoutLogs: {
          take: 25,
          orderBy: { performedAt: 'desc' },
          include: {
            sets: {
              include: { exercise: true },
            },
          },
        },
      },
    });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found.' });
    }

    const dbWorkoutHistory = mapDbWorkoutLogsToCompletedRecords(character.workoutLogs ?? []);
    const workoutHistory: CompletedWorkoutRecord[] =
      body.workoutHistory !== undefined
        ? (body.workoutHistory as CompletedWorkoutRecord[])
        : dbWorkoutHistory;

    const fs = character.fatigueState;
    const fatigueState: FatigueStateSnapshot = fs
      ? {
          isRestingInTavern: Boolean(fs.isRestingInTavern),
          tavernEnteredAt: fs.tavernEnteredAt ? new Date(fs.tavernEnteredAt) : null,
          lastStrenuousWorkoutAt: fs.lastStrenuousWorkoutAt ? new Date(fs.lastStrenuousWorkoutAt) : null,
          lastWorkoutAt: fs.lastWorkoutAt ? new Date(fs.lastWorkoutAt) : null,
          consecutiveHighIntensityDays: fs.consecutiveHighIntensityDays ?? 0,
          lastHighIntensityDayKey: fs.lastHighIntensityDayKey ?? null,
          systemicFatigueStacks: fs.systemicFatigueStacks ?? 0,
          fatigueScore: fs.fatigueScore ?? 0,
          wellRestedMultiplier: fs.wellRestedMultiplier ?? 1.0,
          activeRecoveryBuffActive: Boolean(fs.activeRecoveryBuffActive),
          activeRecoveryGrantedAt: fs.activeRecoveryGrantedAt ? new Date(fs.activeRecoveryGrantedAt) : null,
        }
      : createInitialFatigueState();

    const coreStats = {
      strengthLevel: character.stats?.strengthLevel ?? 1,
      enduranceLevel: character.stats?.enduranceLevel ?? 1,
      agilityLevel: character.stats?.agilityLevel ?? 1,
      dexLevel: character.dexLevel ?? 1,
      conLevel: character.conLevel ?? 1,
      wisLevel: character.wisLevel ?? 1,
      sprLevel: character.sprLevel ?? 1,
    };

    return reply.send({
      coaching: generateTrainerCoachingReport({
        workoutHistory,
        fatigueState,
      }),
      recommendedBuild: recommendTalentBuildForStats(coreStats),
      programs: MULTI_WEEK_WORKOUT_PROGRAMS,
    });
  });

  app.post(
    '/api/characters/:characterId/onboarding/complete',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { characterId } = characterParamsSchema.parse(request.params ?? {});
      await assertCharacterActiveAndOwned(db, characterId, request.user.userId);

      const txResult = await withDbTransaction(
        db,
        async (tx) => {
          const character = await tx.character.findUnique({
            where: { id: characterId },
          });
          if (!character) {
            return { ok: false as const, statusCode: 404, error: 'Character not found.' };
          }

          if (character.onboardingCompletedAt) {
            const existingInventory =
              typeof (tx as any).inventoryItem?.findMany === 'function'
                ? await tx.inventoryItem.findMany({
                    where: { characterId },
                    include: { item: true },
                  })
                : undefined;
            return {
              ok: true as const,
              onboardingCompletedAt: character.onboardingCompletedAt,
              welcomeGiftGranted: false,
              gold: character.gold,
              remainingGold: character.gold,
              beltLoadout: Array.isArray(character.beltLoadout)
                ? (character.beltLoadout as Array<string | null>)
                : [null, null, null, null],
              ...(existingInventory ? { inventoryItems: existingInventory } : {}),
            };
          }

          const completedAt = new Date();
          await depositLootToInventory(tx, characterId, {
            itemSlug: 'sunleaf_healing_draught',
            itemName: 'Sunleaf Healing Draught',
            rarity: 'COMMON',
            quantity: 1,
          });

          const currentBelt: Array<string | null> = Array.isArray(character.beltLoadout)
            ? [...(character.beltLoadout as Array<string | null>), null, null, null, null].slice(0, 4)
            : [null, null, null, null];
          if (!currentBelt.includes('sunleaf_healing_draught')) {
            const emptyIdx = currentBelt.findIndex((slot) => !slot);
            if (emptyIdx >= 0) {
              currentBelt[emptyIdx] = 'sunleaf_healing_draught';
            }
          }

          const updated = await tx.character.update({
            where: { id: characterId },
            data: {
              onboardingCompletedAt: completedAt,
              beltLoadout: currentBelt as any,
            },
          });

          const inventoryItems =
            typeof (tx as any).inventoryItem?.findMany === 'function'
              ? await tx.inventoryItem.findMany({
                  where: { characterId },
                  include: { item: true },
                })
              : undefined;

          return {
            ok: true as const,
            onboardingCompletedAt: updated.onboardingCompletedAt ?? completedAt,
            welcomeGiftGranted: true,
            gold: updated.gold,
            remainingGold: updated.gold,
            beltLoadout: currentBelt,
            ...(inventoryItems ? { inventoryItems } : {}),
          };
        },
        `onboarding:${characterId}`
      );

      if (!txResult.ok) {
        return reply.status(txResult.statusCode).send({ error: txResult.error });
      }

      return reply.send(txResult);
    }
  );
}
