import { PrismaClient } from '@goki/database';
import {
  CRAFTING_MATERIAL_CATALOG,
  CRAFTING_RECIPES,
  ITEM_PREFIXES,
  ITEM_SUFFIXES,
  rollProceduralItemInstance,
  proceduralItemToLootDrop,
} from '@goki/game-engine';
import { describe, expect, it } from 'vitest';
import { buildServerApp } from '../src/app';

function createMilestone4MockDb(options?: {
  initialGold?: number;
  initialInventory?: Array<{
    id?: string;
    slug: string;
    name: string;
    itemType: string;
    rarity?: string;
    stackable?: boolean;
    goldValue?: number;
    quantity: number;
    isLocked?: boolean;
    itemMetadata?: Record<string, any> | null;
  }>;
  equippedMainHandId?: string | null;
  beltLoadout?: Array<string | null>;
  talentUnlocks?: Array<{ slug: string; currentRank: number; pointsSpent?: number }>;
  activeSkillLoadout?: string[];
  onboardingCompletedAt?: Date | null;
  workoutLogs?: any[];
}) {
  let idSeq = 1;
  const nextId = (prefix: string) => `${prefix}_${idSeq++}`;

  const characterState: any = {
    id: 'char_m4_1',
    userId: 'user_m4_1',
    name: 'ForgeTester',
    appearanceId: 'oni_warlord',
    avatarSpriteId: 'oni_warlord',
    race: 'HUMAN',
    customizationConfig: null,
    deletedAt: null,
    gameMode: 'STANDARD',
    adventurerRank: 'BRONZE',
    adventurerReputation: 120,
    gold: options?.initialGold ?? 1000,
    overallLevel: 12,
    dexLevel: 6,
    conLevel: 7,
    wisLevel: 5,
    sprLevel: 4,
    activeSkillLoadout: options?.activeSkillLoadout ?? ['jug_shield_slam'],
    beltLoadout: options?.beltLoadout ?? ['sunleaf_healing_draught', null, null, null],
    onboardingCompletedAt: options?.onboardingCompletedAt ?? null,
    stats: {
      id: 'stats_m4_1',
      characterId: 'char_m4_1',
      strengthLevel: 12,
      strengthXp: 0,
      strengthTalentPointsAvailable: 2,
      strengthTalentPointsSpent: 1,
      enduranceLevel: 10,
      enduranceXp: 0,
      enduranceTalentPointsAvailable: 1,
      enduranceTalentPointsSpent: 0,
      agilityLevel: 8,
      agilityXp: 0,
      agilityTalentPointsAvailable: 1,
      agilityTalentPointsSpent: 0,
      dexterityTalentPointsAvailable: 1,
      dexterityTalentPointsSpent: 0,
      constitutionTalentPointsAvailable: 1,
      constitutionTalentPointsSpent: 0,
      wisdomTalentPointsAvailable: 1,
      wisdomTalentPointsSpent: 0,
      spiritTalentPointsAvailable: 1,
      spiritTalentPointsSpent: 0,
    },
    fatigueState: {
      isRestingInTavern: false,
      tavernEnteredAt: null,
      lastStrenuousWorkoutAt: new Date('2026-11-16T12:00:00.000Z'),
      lastWorkoutAt: new Date('2026-11-16T12:00:00.000Z'),
      consecutiveHighIntensityDays: 2,
      lastHighIntensityDayKey: '2026-11-16',
      systemicFatigueStacks: 0,
      fatigueScore: 30,
      wellRestedMultiplier: 1.0,
      activeRecoveryBuffActive: false,
      activeRecoveryGrantedAt: null,
    },
    equipmentLoadout: {
      id: 'equip_m4_1',
      characterId: 'char_m4_1',
      mainHandItemId: options?.equippedMainHandId ?? null,
      offHandItemId: null,
      headItemId: null,
      chestItemId: null,
      legsItemId: null,
      bootsItemId: null,
      accessory1ItemId: null,
      accessory2ItemId: null,
    },
    talentUnlocks: (options?.talentUnlocks ?? [{ slug: 'jug_shield_slam', currentRank: 1, pointsSpent: 1 }]).map(
      (u, idx) => ({
        id: `unlock_${idx + 1}`,
        characterId: 'char_m4_1',
        talentNodeId: `node_${idx + 1}`,
        currentRank: u.currentRank,
        pointsSpent: u.pointsSpent ?? u.currentRank,
        talentNode: { id: `node_${idx + 1}`, slug: u.slug },
      })
    ),
    workoutLogs: options?.workoutLogs ?? [
      {
        id: 'wl_1',
        characterId: 'char_m4_1',
        workoutType: 'RESISTANCE_STRENGTH',
        workoutCategory: 'GYM',
        performedAt: new Date('2026-11-16T12:00:00.000Z'),
        durationSeconds: 3200,
        sets: [
          {
            setNumber: 1,
            weightKg: 100,
            reps: 5,
            rpe: 8,
            setType: 'NORMAL',
            isWarmup: false,
            exerciseId: 'barbell_back_squat',
            exercise: { slug: 'barbell_back_squat', name: 'Barbell Back Squat' },
          },
        ],
      },
    ],
  };

  const itemsBySlug = new Map<string, any>();
  const inventoryItems: any[] = [];

  for (const seed of options?.initialInventory ?? []) {
    let item = itemsBySlug.get(seed.slug);
    if (!item) {
      item = {
        id: nextId('item'),
        slug: seed.slug,
        name: seed.name,
        description: seed.name,
        itemType: seed.itemType,
        rarity: seed.rarity ?? 'COMMON',
        stackable: seed.stackable ?? (seed.itemType === 'CRAFTING_MATERIAL' || seed.itemType === 'CONSUMABLE'),
        goldValue: seed.goldValue ?? 20,
        statBonuses: {},
      };
      itemsBySlug.set(seed.slug, item);
    }
    inventoryItems.push({
      id: seed.id ?? nextId('inv'),
      characterId: characterState.id,
      itemId: item.id,
      quantity: seed.quantity,
      isLocked: seed.isLocked ?? false,
      itemMetadata: seed.itemMetadata ?? null,
      item,
    });
  }

  const db: any = {
    $transaction: async (cb: (tx: any) => Promise<any>) => cb(db),
    character: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id !== characterState.id) return null;
        return {
          ...characterState,
          stats: { ...characterState.stats },
          equipmentLoadout: { ...characterState.equipmentLoadout },
          talentUnlocks: [...characterState.talentUnlocks],
          inventoryItems: inventoryItems.map((i) => ({ ...i })),
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
        if (where.id !== characterState.id) throw new Error('Character not found');
        for (const [key, val] of Object.entries(data)) {
          if (val && typeof val === 'object' && 'increment' in val) {
            characterState[key] = (characterState[key] ?? 0) + Number(val.increment);
          } else if (val && typeof val === 'object' && 'decrement' in val) {
            characterState[key] = (characterState[key] ?? 0) - Number(val.decrement);
          } else {
            characterState[key] = val;
          }
        }
        return { ...characterState };
      },
    },
    characterStats: {
      update: async ({ where, data }: { where: { characterId: string }; data: Record<string, any> }) => {
        if (where.characterId !== characterState.id) throw new Error('CharacterStats not found');
        for (const [key, val] of Object.entries(data)) {
          if (val && typeof val === 'object' && 'increment' in val) {
            characterState.stats[key] = (characterState.stats[key] ?? 0) + Number(val.increment);
          } else if (val && typeof val === 'object' && 'decrement' in val) {
            characterState.stats[key] = (characterState.stats[key] ?? 0) - Number(val.decrement);
          } else {
            characterState.stats[key] = val;
          }
        }
        return { ...characterState.stats };
      },
    },
    characterTalentUnlock: {
      deleteMany: async ({ where }: { where: { characterId: string } }) => {
        if (where.characterId === characterState.id) {
          const count = characterState.talentUnlocks.length;
          characterState.talentUnlocks = [];
          return { count };
        }
        return { count: 0 };
      },
    },
    item: {
      findUnique: async ({ where }: { where: { slug?: string; id?: string } }) => {
        if (where.slug) return itemsBySlug.get(where.slug) ?? null;
        for (const it of itemsBySlug.values()) {
          if (it.id === where.id) return it;
        }
        return null;
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const created = { id: nextId('item'), ...data };
        itemsBySlug.set(created.slug, created);
        return created;
      },
    },
    inventoryItem: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return inventoryItems.find((i) => i.id === where.id) ?? null;
      },
      findFirst: async ({ where }: { where: { characterId?: string; itemId?: string; item?: { slug?: string } } }) => {
        return (
          inventoryItems.find((i) => {
            if (where.characterId && i.characterId !== where.characterId) return false;
            if (where.itemId && i.itemId !== where.itemId) return false;
            if (where.item?.slug && i.item?.slug !== where.item.slug) return false;
            return true;
          }) ?? null
        );
      },
      findMany: async ({ where }: { where: { characterId: string } }) => {
        return inventoryItems.filter((i) => i.characterId === where.characterId).map((i) => ({ ...i }));
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        let item: any = null;
        for (const it of itemsBySlug.values()) {
          if (it.id === data.itemId) {
            item = it;
            break;
          }
        }
        const created = { id: nextId('inv'), isLocked: false, ...data, item };
        inventoryItems.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
        const found = inventoryItems.find((i) => i.id === where.id);
        if (!found) throw new Error('InventoryItem not found');
        Object.assign(found, data);
        return { ...found };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = inventoryItems.findIndex((i) => i.id === where.id);
        if (idx === -1) throw new Error('InventoryItem not found');
        const [removed] = inventoryItems.splice(idx, 1);
        return removed;
      },
    },
  };

  return { db, characterState, inventoryItems };
}

function makeProceduralInventorySeed(params: {
  id: string;
  baseSlug: string;
  tier: 1 | 2 | 3 | 4 | 5;
  seed: string;
  isLocked?: boolean;
  forcePrefixId?: string;
  forceSuffixId?: string;
}) {
  const rolled = rollProceduralItemInstance({
    baseSlug: params.baseSlug,
    tier: params.tier,
    seed: params.seed,
    forcePrefixId: params.forcePrefixId,
    forceSuffixId: params.forceSuffixId,
  });
  const drop = proceduralItemToLootDrop(rolled);
  return {
    id: params.id,
    slug: drop.itemSlug,
    name: drop.itemName,
    itemType: 'WEAPON',
    rarity: drop.rarity,
    stackable: false,
    goldValue: 100,
    quantity: 1,
    isLocked: params.isLocked ?? false,
    itemMetadata: {
      baseSlug: drop.baseSlug,
      tier: drop.tier,
      prefixId: drop.prefixId,
      prefixLabel: drop.prefixLabel,
      prefixSummary: drop.prefixSummary,
      suffixId: drop.suffixId,
      suffixLabel: drop.suffixLabel,
      suffixSummary: drop.suffixSummary,
      baseStatsSummary: drop.baseStatsSummary,
      rolledName: drop.itemName,
      rarity: drop.rarity,
      statBonuses: drop.statBonuses,
      primaryStatBonuses: drop.primaryStatBonuses,
      uniquePassive: drop.uniquePassive,
    },
  };
}

describe('Milestone 4: Crafting, NPC Hub, Respec, Coaching, and Onboarding Routes', () => {
  it('1. GET /api/crafting/recipes returns recipes and materials catalog', async () => {
    const { db } = createMilestone4MockDb();
    const app = await buildServerApp({ db: db as PrismaClient });

    const res = await app.inject({
      method: 'GET',
      url: '/api/crafting/recipes',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.recipes).toHaveLength(CRAFTING_RECIPES.length);
    expect(body.materials).toHaveLength(CRAFTING_MATERIAL_CATALOG.length);
    await app.close();
  });

  it('2. POST /api/crafting/craft brews consumables, forges procedural gear, and rejects missing materials or gold', async () => {
    const { db, characterState } = createMilestone4MockDb({
      initialGold: 120,
      initialInventory: [
        { slug: 'sunleaf_herb_bundle', name: 'Sunleaf Herb Bundle', itemType: 'CRAFTING_MATERIAL', quantity: 2 },
        { slug: 'obsidian_ingot', name: 'Obsidian Steel Ingot', itemType: 'CRAFTING_MATERIAL', quantity: 3 },
        { slug: 'iron_ore_cluster', name: 'Rich Iron Ore Cluster', itemType: 'CRAFTING_MATERIAL', quantity: 2 },
      ],
    });
    const app = await buildServerApp({ db: db as PrismaClient });
    const token = app.jwt.sign({ userId: 'user_m4_1', email: 'forge@goki.gg', username: 'ForgeTester' });

    // Brew sunleaf_healing_draught (costs 10g + 2 sunleaf_herb_bundle -> grants 2 draughts)
    const brewRes = await app.inject({
      method: 'POST',
      url: '/api/crafting/craft',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        recipeSlug: 'brew_sunleaf_healing_draught',
        quantity: 1,
      },
    });

    expect(brewRes.statusCode).toBe(200);
    const brewBody = brewRes.json();
    expect(brewBody.ok).toBe(true);
    expect(brewBody.goldSpent).toBe(10);
    expect(brewBody.remainingGold).toBe(110);
    expect(brewBody.craftedDrops[0].itemSlug).toBe('sunleaf_healing_draught');
    expect(brewBody.craftedDrops[0].quantity).toBe(2);

    // Forge ironbound_greatsword (costs 75g + 3 obsidian_ingot + 2 iron_ore_cluster)
    const forgeRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_m4_1/crafting/craft',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        recipeSlug: 'forge_ironbound_greatsword',
        clientSeed: 'test-forge-seed',
      },
    });

    expect(forgeRes.statusCode).toBe(200);
    const forgeBody = forgeRes.json();
    expect(forgeBody.ok).toBe(true);
    expect(forgeBody.goldSpent).toBe(75);
    expect(forgeBody.remainingGold).toBe(35);
    expect(forgeBody.craftedDrops[0].baseSlug).toBe('ironbound_greatsword');
    expect(forgeBody.craftedDrops[0].tier).toBe(1);
    expect(characterState.gold).toBe(35);

    // Insufficient materials (sunleaf_herb_bundle was consumed) -> 400
    const noMatsRes = await app.inject({
      method: 'POST',
      url: '/api/crafting/craft',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        recipeSlug: 'brew_sunleaf_healing_draught',
      },
    });
    expect(noMatsRes.statusCode).toBe(400);

    // Insufficient gold test (only 35g left, needs 75g) -> 400
    const noGoldRes = await app.inject({
      method: 'POST',
      url: '/api/crafting/craft',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        recipeSlug: 'forge_ironbound_greatsword',
      },
    });
    expect(noGoldRes.statusCode).toBe(400);
    expect(noGoldRes.json().error).toMatch(/Insufficient Gold/i);

    await app.close();
  });

  it('3. POST /api/crafting/upgrade upgrades T1 gear to T2 with scaled stats and rejects T5 gear', async () => {
    const t1Weapon = makeProceduralInventorySeed({
      id: 'inv_t1_sword',
      baseSlug: 'ironbound_greatsword',
      tier: 1,
      seed: 'upgrade-seed-1',
    });
    const t5Weapon = makeProceduralInventorySeed({
      id: 'inv_t5_sword',
      baseSlug: 'ironbound_greatsword',
      tier: 5,
      seed: 'upgrade-seed-5',
    });

    const { db, characterState } = createMilestone4MockDb({
      initialGold: 500,
      initialInventory: [
        t1Weapon,
        t5Weapon,
        { slug: 'obsidian_ingot', name: 'Obsidian Steel Ingot', itemType: 'CRAFTING_MATERIAL', quantity: 5 },
        { slug: 'iron_ore_cluster', name: 'Rich Iron Ore Cluster', itemType: 'CRAFTING_MATERIAL', quantity: 5 },
      ],
    });
    const app = await buildServerApp({ db: db as PrismaClient });
    const token = app.jwt.sign({ userId: 'user_m4_1', email: 'forge@goki.gg', username: 'ForgeTester' });

    const upgradeRes = await app.inject({
      method: 'POST',
      url: '/api/crafting/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        inventoryItemId: 'inv_t1_sword',
        clientSeed: 'upgrade-t2-seed',
      },
    });

    expect(upgradeRes.statusCode).toBe(200);
    const upgradeBody = upgradeRes.json();
    expect(upgradeBody.ok).toBe(true);
    expect(upgradeBody.previousTier).toBe(1);
    expect(upgradeBody.newTier).toBe(2);
    expect(upgradeBody.goldSpent).toBe(60);
    expect(upgradeBody.remainingGold).toBe(440);
    expect(characterState.gold).toBe(440);
    expect(upgradeBody.upgradedItem.itemMetadata.tier).toBe(2);
    expect(upgradeBody.lootDrop.statBonuses.meleePower).toBeGreaterThan(
      t1Weapon.itemMetadata.statBonuses.meleePower
    );

    // Reject T5 item upgrade -> 400
    const maxTierRes = await app.inject({
      method: 'POST',
      url: '/api/crafting/upgrade',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        inventoryItemId: 'inv_t5_sword',
      },
    });
    expect(maxTierRes.statusCode).toBe(400);
    expect(maxTierRes.json().error).toMatch(/Tier V/i);

    await app.close();
  });

  it('4. POST /api/crafting/reforge rerolls T2 affixes with LOCK_PREFIX and rejects LOCK_PREFIX on T1', async () => {
    const t2Weapon = makeProceduralInventorySeed({
      id: 'inv_t2_sword',
      baseSlug: 'ironbound_greatsword',
      tier: 2,
      seed: 'reforge-t2-initial',
      forcePrefixId: ITEM_PREFIXES[0]!.id,
      forceSuffixId: ITEM_SUFFIXES[0]!.id,
    });
    const t1Weapon = makeProceduralInventorySeed({
      id: 'inv_t1_sword',
      baseSlug: 'ironbound_greatsword',
      tier: 1,
      seed: 'reforge-t1-initial',
    });

    const { db } = createMilestone4MockDb({
      initialGold: 500,
      initialInventory: [
        t2Weapon,
        t1Weapon,
        { slug: 'arcane_reforge_dust', name: 'Arcane Reforge Dust', itemType: 'CRAFTING_MATERIAL', quantity: 5 },
        { slug: 'obsidian_ingot', name: 'Obsidian Steel Ingot', itemType: 'CRAFTING_MATERIAL', quantity: 5 },
      ],
    });
    const app = await buildServerApp({ db: db as PrismaClient });
    const token = app.jwt.sign({ userId: 'user_m4_1', email: 'forge@goki.gg', username: 'ForgeTester' });

    const originalPrefixId = t2Weapon.itemMetadata.prefixId;
    const originalSuffixId = t2Weapon.itemMetadata.suffixId;
    expect(originalPrefixId).toBeTruthy();

    const reforgeRes = await app.inject({
      method: 'POST',
      url: '/api/crafting/reforge',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        inventoryItemId: 'inv_t2_sword',
        mode: 'LOCK_PREFIX',
        clientSeed: 'reforge-suffix-seed-99',
      },
    });

    expect(reforgeRes.statusCode).toBe(200);
    const reforgeBody = reforgeRes.json();
    expect(reforgeBody.ok).toBe(true);
    expect(reforgeBody.mode).toBe('LOCK_PREFIX');
    expect(reforgeBody.goldSpent).toBe(150);
    expect(reforgeBody.lootDrop.prefixId).toBe(originalPrefixId);
    expect(reforgeBody.lootDrop.suffixId).toBeTruthy();
    expect(reforgeBody.lootDrop.suffixId).not.toBe(originalSuffixId);

    // Reject LOCK_PREFIX on T1 -> 400
    const rejectT1Res = await app.inject({
      method: 'POST',
      url: '/api/crafting/reforge',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        inventoryItemId: 'inv_t1_sword',
        mode: 'LOCK_PREFIX',
      },
    });
    expect(rejectT1Res.statusCode).toBe(400);

    await app.close();
  });

  it('5. Trader NPC stock, buy, and sell handle gold sync, belt cleanup, and equipped/locked rejections', async () => {
    const equippedSword = makeProceduralInventorySeed({
      id: 'inv_equipped_sword',
      baseSlug: 'ironbound_greatsword',
      tier: 1,
      seed: 'equipped-1',
    });
    const lockedSword = makeProceduralInventorySeed({
      id: 'inv_locked_sword',
      baseSlug: 'ironbound_greatsword',
      tier: 1,
      seed: 'locked-1',
      isLocked: true,
    });

    const { db, characterState } = createMilestone4MockDb({
      initialGold: 500,
      equippedMainHandId: 'inv_equipped_sword',
      beltLoadout: ['sunleaf_healing_draught', null, null, null],
      initialInventory: [
        equippedSword,
        lockedSword,
        {
          id: 'inv_draught_1',
          slug: 'sunleaf_healing_draught',
          name: 'Sunleaf Healing Draught',
          itemType: 'CONSUMABLE',
          goldValue: 18,
          quantity: 1,
        },
      ],
    });
    const app = await buildServerApp({ db: db as PrismaClient });
    const token = app.jwt.sign({ userId: 'user_m4_1', email: 'forge@goki.gg', username: 'ForgeTester' });

    const stockRes1 = await app.inject({
      method: 'GET',
      url: '/api/npc/trader/stock?date=2026-11-17',
    });
    const stockRes2 = await app.inject({
      method: 'GET',
      url: '/api/npc/trader/stock?date=2026-11-17',
    });

    expect(stockRes1.statusCode).toBe(200);
    expect(stockRes1.json()).toEqual(stockRes2.json());
    const offers = stockRes1.json().offers as Array<{ offerId: string; buyPriceGold: number }>;
    expect(offers.length).toBeGreaterThan(0);

    const cheapestOffer = [...offers].sort((a, b) => a.buyPriceGold - b.buyPriceGold)[0]!;
    const buyRes = await app.inject({
      method: 'POST',
      url: '/api/npc/trader/buy',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        offerId: cheapestOffer.offerId,
        quantity: 1,
        rotationDateKey: '2026-11-17',
      },
    });

    expect(buyRes.statusCode).toBe(200);
    expect(buyRes.json().goldSpent).toBe(cheapestOffer.buyPriceGold);
    expect(buyRes.json().remainingGold).toBe(500 - cheapestOffer.buyPriceGold);

    // Reject selling equipped gear -> 400
    const sellEquippedRes = await app.inject({
      method: 'POST',
      url: '/api/npc/trader/sell',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        inventoryItemId: 'inv_equipped_sword',
        quantity: 1,
      },
    });
    expect(sellEquippedRes.statusCode).toBe(400);
    expect(sellEquippedRes.json().error).toMatch(/Unequip/i);

    // Reject selling locked item -> 400
    const sellLockedRes = await app.inject({
      method: 'POST',
      url: '/api/npc/trader/sell',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        inventoryItemId: 'inv_locked_sword',
        quantity: 1,
      },
    });
    expect(sellLockedRes.statusCode).toBe(400);
    expect(sellLockedRes.json().error).toMatch(/locked/i);

    // Sell all sunleaf_healing_draught -> credits gold and clears beltLoadout slot
    const goldBeforeSell = characterState.gold;
    const sellDraughtRes = await app.inject({
      method: 'POST',
      url: '/api/npc/trader/sell',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_m4_1',
        inventoryItemId: 'inv_draught_1',
        quantity: 1,
      },
    });
    expect(sellDraughtRes.statusCode).toBe(200);
    const sellBody = sellDraughtRes.json();
    expect(sellBody.goldEarned).toBeGreaterThan(0);
    expect(sellBody.remainingGold).toBe(goldBeforeSell + sellBody.goldEarned);
    expect(sellBody.beltLoadout[0]).toBeNull();

    await app.close();
  });

  it('6. POST /api/npc/trainer/respec refunds talent points, deletes unlocks, clears skill loadout, and validates Gold/points', async () => {
    const { db, characterState } = createMilestone4MockDb({
      initialGold: 200,
      talentUnlocks: [{ slug: 'jug_shield_slam', currentRank: 1, pointsSpent: 1 }],
      activeSkillLoadout: ['jug_shield_slam'],
    });
    const app = await buildServerApp({ db: db as PrismaClient });
    const token = app.jwt.sign({ userId: 'user_m4_1', email: 'forge@goki.gg', username: 'ForgeTester' });

    const respecRes = await app.inject({
      method: 'POST',
      url: '/api/npc/trainer/respec',
      headers: { authorization: `Bearer ${token}` },
      payload: { characterId: 'char_m4_1' },
    });

    expect(respecRes.statusCode).toBe(200);
    const body = respecRes.json();
    expect(body.ok).toBe(true);
    expect(body.totalPointsRefunded).toBe(1);
    expect(body.goldCost).toBe(35);
    expect(body.remainingGold).toBe(165);
    expect(body.updatedStats.strengthTalentPointsAvailable).toBe(3);
    expect(body.updatedStats.strengthTalentPointsSpent).toBe(0);
    expect(body.activeSkillLoadout).toEqual([]);
    expect(characterState.talentUnlocks).toHaveLength(0);

    // Calling respec again with 0 spent points -> 400
    const emptyRespecRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_m4_1/talents/respec',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(emptyRespecRes.statusCode).toBe(400);

    // Insufficient Gold test -> 400
    const poorSetup = createMilestone4MockDb({
      initialGold: 5,
      talentUnlocks: [{ slug: 'jug_shield_slam', currentRank: 1, pointsSpent: 1 }],
    });
    const poorApp = await buildServerApp({ db: poorSetup.db as PrismaClient });
    const poorToken = poorApp.jwt.sign({ userId: 'user_m4_1', email: 'forge@goki.gg', username: 'ForgeTester' });
    const poorRes = await poorApp.inject({
      method: 'POST',
      url: '/api/npc/trainer/respec',
      headers: { authorization: `Bearer ${poorToken}` },
      payload: { characterId: 'char_m4_1' },
    });
    expect(poorRes.statusCode).toBe(400);
    expect(poorRes.json().error).toMatch(/Insufficient Gold/i);

    await app.close();
    await poorApp.close();
  });

  it('7. Trainer coaching report & idempotent onboarding completion work end-to-end', async () => {
    const { db, inventoryItems } = createMilestone4MockDb();
    const app = await buildServerApp({ db: db as PrismaClient });
    const token = app.jwt.sign({ userId: 'user_m4_1', email: 'forge@goki.gg', username: 'ForgeTester' });

    const coachingRes = await app.inject({
      method: 'POST',
      url: '/api/npc/trainer/coaching',
      headers: { authorization: `Bearer ${token}` },
      payload: { characterId: 'char_m4_1' },
    });

    expect(coachingRes.statusCode).toBe(200);
    const coachBody = coachingRes.json();
    expect(coachBody.coaching).toBeTruthy();
    expect(Array.isArray(coachBody.coaching.trainerDialoguePages)).toBe(true);
    expect(coachBody.recommendedBuild).toBeTruthy();
    expect(Array.isArray(coachBody.programs)).toBe(true);
    expect(coachBody.programs.length).toBeGreaterThan(0);

    // First onboarding completion grants 1x sunleaf_healing_draught
    const onboard1 = await app.inject({
      method: 'POST',
      url: '/api/characters/char_m4_1/onboarding/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(onboard1.statusCode).toBe(200);
    expect(onboard1.json().welcomeGiftGranted).toBe(true);
    expect(onboard1.json().onboardingCompletedAt).toBeTruthy();
    expect(inventoryItems.some((i) => i.item?.slug === 'sunleaf_healing_draught' && i.quantity === 1)).toBe(true);

    // Second onboarding completion is idempotent and does not duplicate gift
    const onboard2 = await app.inject({
      method: 'POST',
      url: '/api/characters/char_m4_1/onboarding/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(onboard2.statusCode).toBe(200);
    expect(onboard2.json().welcomeGiftGranted).toBe(false);
    expect(inventoryItems.find((i) => i.item?.slug === 'sunleaf_healing_draught')?.quantity).toBe(1);

    await app.close();
  });
});
