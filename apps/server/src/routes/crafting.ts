import { PrismaClient } from '@goki/database';
import {
  BASE_EQUIPPABLE_ITEM_BY_SLUG,
  CRAFTING_MATERIAL_CATALOG,
  CRAFTING_RECIPES,
  ItemTier,
  LootDrop,
  evaluateCraftRecipe,
  isEquippableItemType,
  reforgeProceduralItemAffixes,
  upgradeProceduralItemTier,
} from '@goki/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertCharacterActiveAndOwned, requireAuth } from '../middleware/auth';
import { depositLootToInventory, withDbTransaction } from '../services/game-operations';

const craftBodySchema = z.object({
  characterId: z.string().optional(),
  recipeSlug: z.string().min(1),
  quantity: z.number().int().min(1).max(20).optional().default(1),
  clientSeed: z.string().optional(),
});

const upgradeBodySchema = z.object({
  characterId: z.string().optional(),
  inventoryItemId: z.string().min(1),
  clientSeed: z.string().optional(),
});

const reforgeBodySchema = z.object({
  characterId: z.string().optional(),
  inventoryItemId: z.string().min(1),
  mode: z.enum(['BOTH', 'LOCK_PREFIX', 'LOCK_SUFFIX']).optional().default('BOTH'),
  clientSeed: z.string().optional(),
});

const optionalCharacterParamsSchema = z.object({
  characterId: z.string().optional(),
});

function buildProceduralMetadata(drop: LootDrop) {
  return {
    baseSlug: drop.baseSlug ?? null,
    tier: drop.tier ?? 1,
    prefixId: drop.prefixId ?? null,
    prefixLabel: drop.prefixLabel ?? null,
    prefixSummary: drop.prefixSummary ?? null,
    suffixId: drop.suffixId ?? null,
    suffixLabel: drop.suffixLabel ?? null,
    suffixSummary: drop.suffixSummary ?? null,
    baseStatsSummary: drop.baseStatsSummary ?? null,
    rolledName: drop.itemName,
    rarity: drop.rarity,
    statBonuses: drop.statBonuses ?? {},
    primaryStatBonuses: drop.primaryStatBonuses ?? {},
    uniquePassive: drop.uniquePassive ?? null,
  };
}

async function buildMaterialCountsAndRows(tx: PrismaClient, characterId: string) {
  const rows = await tx.inventoryItem.findMany({
    where: { characterId },
    include: { item: true },
  });

  const materialCounts: Record<string, number> = {};
  for (const inv of rows) {
    if (inv.isLocked) continue;
    const slug = inv.item?.slug ?? (inv as any).itemSlug;
    if (!slug) continue;
    materialCounts[slug] = (materialCounts[slug] ?? 0) + inv.quantity;
  }

  return { rows, materialCounts };
}

async function deductMaterialsInTx(
  tx: PrismaClient,
  rows: Array<{
    id: string;
    quantity: number;
    isLocked?: boolean;
    item?: { slug?: string } | null;
    itemSlug?: string;
  }>,
  deductions: Record<string, number>
): Promise<void> {
  for (const [slug, amount] of Object.entries(deductions)) {
    let remaining = amount;
    if (remaining <= 0) continue;

    for (const row of rows) {
      if (remaining <= 0) break;
      if (row.isLocked) continue;
      const rowSlug = row.item?.slug ?? row.itemSlug;
      if (rowSlug !== slug || row.quantity <= 0) continue;

      const deduct = Math.min(row.quantity, remaining);
      const nextQty = row.quantity - deduct;
      remaining -= deduct;
      row.quantity = nextQty;

      if (nextQty <= 0) {
        await tx.inventoryItem.delete({ where: { id: row.id } });
      } else {
        await tx.inventoryItem.update({
          where: { id: row.id },
          data: { quantity: nextQty },
        });
      }
    }
  }
}

async function findTargetInventoryItem(
  tx: PrismaClient,
  characterId: string,
  inventoryItemId: string
) {
  const byId = await tx.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    include: { item: true },
  });
  if (byId) {
    return byId.characterId === characterId ? byId : null;
  }

  return tx.inventoryItem.findFirst({
    where: { characterId, item: { slug: inventoryItemId } },
    include: { item: true },
  });
}

function isEquippableProceduralTarget(
  baseSlug: string,
  itemType?: string | null
): boolean {
  if (BASE_EQUIPPABLE_ITEM_BY_SLUG[baseSlug]) {
    return true;
  }
  if (!itemType) {
    return false;
  }
  const normalized = String(itemType).toUpperCase();
  if (normalized === 'CRAFTING_MATERIAL' || normalized === 'QUEST_ITEM') {
    return false;
  }
  return isEquippableItemType(normalized as any);
}

export function registerCraftingRoutes(app: FastifyInstance, db: PrismaClient): void {
  app.get('/api/crafting/recipes', async (_request, reply) => {
    return reply.send({
      recipes: CRAFTING_RECIPES,
      materials: CRAFTING_MATERIAL_CATALOG,
    });
  });

  const handleCraft = async (request: any, reply: any) => {
    const params = optionalCharacterParamsSchema.parse(request.params ?? {});
    const body = craftBodySchema.parse(request.body ?? {});
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
          include: { stats: true },
        });
        if (!character) {
          return { ok: false as const, statusCode: 404, error: 'Character not found.' };
        }

        const { rows, materialCounts } = await buildMaterialCountsAndRows(tx, characterId);
        const evalRes = evaluateCraftRecipe({
          recipeSlug: body.recipeSlug,
          quantity: body.quantity,
          currentGold: character.gold,
          materialCounts,
          characterStats: character.stats ?? undefined,
          seed: body.clientSeed ?? `${characterId}:${Date.now()}`,
        });

        if (!evalRes.ok) {
          return { ok: false as const, statusCode: 400, error: evalRes.error };
        }

        await deductMaterialsInTx(tx, rows, evalRes.deductedMaterials);

        await tx.character.update({
          where: { id: characterId },
          data: { gold: { decrement: evalRes.totalGoldCost } },
        });

        for (const drop of evalRes.craftedDrops) {
          await depositLootToInventory(tx, characterId, drop);
        }

        const inventoryItems = await tx.inventoryItem.findMany({
          where: { characterId },
          include: { item: true },
        });

        return {
          ok: true as const,
          recipeSlug: evalRes.recipe.recipeSlug,
          quantityCrafted: evalRes.quantity,
          goldSpent: evalRes.totalGoldCost,
          remainingGold: evalRes.remainingGold,
          craftedDrops: evalRes.craftedDrops,
          inventoryItems,
        };
      },
      `crafting:${characterId}`
    );

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    return reply.send(txResult);
  };

  app.post('/api/crafting/craft', { preHandler: [requireAuth] }, handleCraft);
  app.post('/api/characters/:characterId/crafting/craft', { preHandler: [requireAuth] }, handleCraft);

  const handleUpgrade = async (request: any, reply: any) => {
    const params = optionalCharacterParamsSchema.parse(request.params ?? {});
    const body = upgradeBodySchema.parse(request.body ?? {});
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
        });
        if (!character) {
          return { ok: false as const, statusCode: 404, error: 'Character not found.' };
        }

        const invItem = await findTargetInventoryItem(tx, characterId, body.inventoryItemId);
        if (!invItem) {
          return { ok: false as const, statusCode: 404, error: 'Inventory item not found.' };
        }

        const meta = (invItem.itemMetadata ?? {}) as Record<string, any>;
        const baseSlug = String(meta.baseSlug ?? invItem.item?.slug ?? '');
        if (!isEquippableProceduralTarget(baseSlug, invItem.item?.itemType)) {
          return {
            ok: false as const,
            statusCode: 400,
            error: 'Only equippable procedural gear can be upgraded.',
          };
        }

        const currentTier = (meta.tier ?? 1) as ItemTier;
        const currentPrefixId = (meta.prefixId ?? null) as string | null;
        const currentSuffixId = (meta.suffixId ?? null) as string | null;

        const { rows, materialCounts } = await buildMaterialCountsAndRows(tx, characterId);
        const upgradeRes = upgradeProceduralItemTier({
          baseSlug,
          currentTier,
          currentPrefixId,
          currentSuffixId,
          currentGold: character.gold,
          materialCounts,
          seed: body.clientSeed ?? `${characterId}:${invItem.id}:${currentTier}`,
        });

        if (!upgradeRes.ok) {
          return { ok: false as const, statusCode: 400, error: upgradeRes.error };
        }

        await deductMaterialsInTx(tx, rows, upgradeRes.deductedMaterials);

        await tx.character.update({
          where: { id: characterId },
          data: { gold: { decrement: upgradeRes.goldCost } },
        });

        const updatedInv = await tx.inventoryItem.update({
          where: { id: invItem.id },
          data: { itemMetadata: buildProceduralMetadata(upgradeRes.lootDrop) as any },
          include: { item: true },
        });

        const inventoryItems = await tx.inventoryItem.findMany({
          where: { characterId },
          include: { item: true },
        });

        return {
          ok: true as const,
          previousTier: upgradeRes.previousTier,
          newTier: upgradeRes.newTier,
          goldSpent: upgradeRes.goldCost,
          remainingGold: upgradeRes.remainingGold,
          upgradedItem: updatedInv,
          lootDrop: upgradeRes.lootDrop,
          inventoryItems,
        };
      },
      `crafting:${characterId}`
    );

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    return reply.send(txResult);
  };

  app.post('/api/crafting/upgrade', { preHandler: [requireAuth] }, handleUpgrade);
  app.post('/api/characters/:characterId/crafting/upgrade', { preHandler: [requireAuth] }, handleUpgrade);

  const handleReforge = async (request: any, reply: any) => {
    const params = optionalCharacterParamsSchema.parse(request.params ?? {});
    const body = reforgeBodySchema.parse(request.body ?? {});
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
        });
        if (!character) {
          return { ok: false as const, statusCode: 404, error: 'Character not found.' };
        }

        const invItem = await findTargetInventoryItem(tx, characterId, body.inventoryItemId);
        if (!invItem) {
          return { ok: false as const, statusCode: 404, error: 'Inventory item not found.' };
        }

        const meta = (invItem.itemMetadata ?? {}) as Record<string, any>;
        const baseSlug = String(meta.baseSlug ?? invItem.item?.slug ?? '');
        if (!isEquippableProceduralTarget(baseSlug, invItem.item?.itemType)) {
          return {
            ok: false as const,
            statusCode: 400,
            error: 'Only equippable procedural gear can be reforged.',
          };
        }

        const currentTier = (meta.tier ?? 1) as ItemTier;
        const currentPrefixId = (meta.prefixId ?? null) as string | null;
        const currentSuffixId = (meta.suffixId ?? null) as string | null;

        const { rows, materialCounts } = await buildMaterialCountsAndRows(tx, characterId);
        const reforgeRes = reforgeProceduralItemAffixes({
          baseSlug,
          tier: currentTier,
          mode: body.mode,
          currentPrefixId,
          currentSuffixId,
          currentGold: character.gold,
          materialCounts,
          seed: body.clientSeed ?? `${characterId}:${invItem.id}:${Date.now()}`,
        });

        if (!reforgeRes.ok) {
          return { ok: false as const, statusCode: 400, error: reforgeRes.error };
        }

        await deductMaterialsInTx(tx, rows, reforgeRes.deductedMaterials);

        await tx.character.update({
          where: { id: characterId },
          data: { gold: { decrement: reforgeRes.goldCost } },
        });

        const updatedInv = await tx.inventoryItem.update({
          where: { id: invItem.id },
          data: { itemMetadata: buildProceduralMetadata(reforgeRes.lootDrop) as any },
          include: { item: true },
        });

        const inventoryItems = await tx.inventoryItem.findMany({
          where: { characterId },
          include: { item: true },
        });

        return {
          ok: true as const,
          mode: reforgeRes.mode,
          goldSpent: reforgeRes.goldCost,
          remainingGold: reforgeRes.remainingGold,
          reforgedItem: updatedInv,
          lootDrop: reforgeRes.lootDrop,
          inventoryItems,
        };
      },
      `crafting:${characterId}`
    );

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    return reply.send(txResult);
  };

  app.post('/api/crafting/reforge', { preHandler: [requireAuth] }, handleReforge);
  app.post('/api/characters/:characterId/crafting/reforge', { preHandler: [requireAuth] }, handleReforge);
}
