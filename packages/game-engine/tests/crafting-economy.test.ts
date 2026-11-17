import { describe, expect, it } from 'vitest';
import {
  CRAFTING_MATERIAL_BY_SLUG,
  CRAFTING_MATERIAL_CATALOG,
  CRAFTING_RECIPES,
  CRAFTING_RECIPE_BY_SLUG,
  RECOMMENDED_TALENT_BUILDS,
  calculateTalentRespecCost,
  calculateTraderSellValue,
  evaluateCraftRecipe,
  evaluateTraderPurchase,
  generateTraderRotatingStock,
  getAffixReforgeCost,
  getGearUpgradeCost,
  recommendTalentBuildForStats,
  reforgeProceduralItemAffixes,
  respecCharacterTalents,
  upgradeProceduralItemTier,
} from '../src/crafting-economy';
import {
  BASE_EQUIPPABLE_ITEM_BY_SLUG,
  ITEM_PREFIXES,
  ITEM_SUFFIXES,
  rollProceduralItemInstance,
} from '../src/item-affix-engine';
import { DEFAULT_TALENT_TREES } from '../src/talent-engine';
import { COMBAT_CONSUMABLE_BY_SLUG } from '../src/turn-based-combat';

describe('crafting-economy', () => {
  describe('materials and recipes catalog', () => {
    it('exposes all 7 crafting materials and indexes them by slug', () => {
      expect(CRAFTING_MATERIAL_CATALOG).toHaveLength(7);
      for (const mat of CRAFTING_MATERIAL_CATALOG) {
        expect(CRAFTING_MATERIAL_BY_SLUG[mat.slug]).toEqual(mat);
      }
    });

    it('exposes all 13 crafting recipes across consumables, smelting, and gear forge', () => {
      expect(CRAFTING_RECIPES).toHaveLength(13);
      expect(CRAFTING_RECIPES.filter((r) => r.category === 'CONSUMABLE')).toHaveLength(4);
      expect(CRAFTING_RECIPES.filter((r) => r.category === 'SMELTING_REFINERY')).toHaveLength(3);
      expect(CRAFTING_RECIPES.filter((r) => r.category === 'GEAR_FORGE')).toHaveLength(6);

      for (const recipe of CRAFTING_RECIPES) {
        expect(CRAFTING_RECIPE_BY_SLUG[recipe.recipeSlug]).toEqual(recipe);
        for (const ing of recipe.ingredients) {
          expect(CRAFTING_MATERIAL_BY_SLUG[ing.itemSlug]).toBeDefined();
        }
        if (recipe.category === 'CONSUMABLE') {
          expect(COMBAT_CONSUMABLE_BY_SLUG[recipe.outputItemSlug]).toBeDefined();
        } else if (recipe.category === 'SMELTING_REFINERY') {
          expect(CRAFTING_MATERIAL_BY_SLUG[recipe.outputItemSlug]).toBeDefined();
        } else if (recipe.category === 'GEAR_FORGE') {
          expect(recipe.outputBaseSlug).toBeDefined();
          expect(recipe.outputTier).toBe(1);
          expect(BASE_EQUIPPABLE_ITEM_BY_SLUG[recipe.outputBaseSlug!]).toBeDefined();
        }
      }
    });

    it('evaluates every single crafting recipe successfully when requirements are met', () => {
      const richMaterials: Record<string, number> = {
        iron_ore_cluster: 50,
        sunleaf_herb_bundle: 50,
        obsidian_ingot: 50,
        astral_dew_vial: 50,
        arcane_reforge_dust: 50,
        titanite_ember: 50,
        raid_essence_crystal: 50,
      };
      const highStats = { strengthLevel: 10, enduranceLevel: 10, agilityLevel: 10 };

      for (const recipe of CRAFTING_RECIPES) {
        const res = evaluateCraftRecipe({
          recipeSlug: recipe.recipeSlug,
          quantity: 1,
          currentGold: 1000,
          materialCounts: richMaterials,
          characterStats: highStats,
          seed: 'test-seed',
        });

        expect(res.ok).toBe(true);
        if (!res.ok) continue;

        expect(res.totalGoldCost).toBe(recipe.goldCost);
        expect(res.remainingGold).toBe(1000 - recipe.goldCost);
        expect(res.craftedDrops).toHaveLength(1);
        expect(res.craftedDrops[0]!.quantity).toBe(recipe.outputQuantity);
        if (recipe.category === 'GEAR_FORGE') {
          expect(res.craftedDrops[0]!.baseSlug).toBe(recipe.outputBaseSlug);
          expect(res.craftedDrops[0]!.tier).toBe(1);
        } else {
          expect(res.craftedDrops[0]!.itemSlug).toBe(recipe.outputItemSlug);
        }
      }
    });

    it('produces individual procedural gear drops for batch gear forging and enforces limits', () => {
      const batchGear = evaluateCraftRecipe({
        recipeSlug: 'forge_ironbound_greatsword',
        quantity: 3,
        currentGold: 500,
        materialCounts: { obsidian_ingot: 10, iron_ore_cluster: 10 },
        seed: 'batch-gear',
      });
      expect(batchGear.ok).toBe(true);
      if (batchGear.ok) {
        expect(batchGear.totalGoldCost).toBe(225);
        expect(batchGear.remainingGold).toBe(275);
        expect(batchGear.deductedMaterials).toEqual({
          obsidian_ingot: 9,
          iron_ore_cluster: 6,
        });
        expect(batchGear.craftedDrops).toHaveLength(3);
        for (const drop of batchGear.craftedDrops) {
          expect(drop.quantity).toBe(1);
          expect(drop.baseSlug).toBe('ironbound_greatsword');
          expect(drop.tier).toBe(1);
        }
      }

      const batchStack = evaluateCraftRecipe({
        recipeSlug: 'brew_sunleaf_healing_draught',
        quantity: 4,
        currentGold: 100,
        materialCounts: { sunleaf_herb_bundle: 8 },
      });
      expect(batchStack.ok).toBe(true);
      if (batchStack.ok) {
        expect(batchStack.craftedDrops).toHaveLength(1);
        expect(batchStack.craftedDrops[0]!.quantity).toBe(8);
      }

      expect(
        evaluateCraftRecipe({
          recipeSlug: 'unknown_recipe',
          currentGold: 500,
          materialCounts: {},
        }).ok
      ).toBe(false);

      expect(
        evaluateCraftRecipe({
          recipeSlug: 'brew_sunleaf_healing_draught',
          quantity: 0,
          currentGold: 500,
          materialCounts: { sunleaf_herb_bundle: 20 },
        }).ok
      ).toBe(false);

      expect(
        evaluateCraftRecipe({
          recipeSlug: 'brew_sunleaf_healing_draught',
          quantity: 21,
          currentGold: 500,
          materialCounts: { sunleaf_herb_bundle: 50 },
        }).ok
      ).toBe(false);

      expect(
        evaluateCraftRecipe({
          recipeSlug: 'brew_sunleaf_healing_draught',
          quantity: 1.5,
          currentGold: 500,
          materialCounts: { sunleaf_herb_bundle: 10 },
        }).ok
      ).toBe(false);
    });

    it('rejects missing gold, missing materials, or insufficient stat level', () => {
      const lowAgility = evaluateCraftRecipe({
        recipeSlug: 'brew_vitality_elixir',
        currentGold: 100,
        materialCounts: { sunleaf_herb_bundle: 5, astral_dew_vial: 2 },
        characterStats: { strengthLevel: 5, enduranceLevel: 5, agilityLevel: 1 },
      });
      expect(lowAgility.ok).toBe(false);
      if (!lowAgility.ok) {
        expect(lowAgility.error).toContain('AGILITY Lv 2');
      }

      const lowStrength = evaluateCraftRecipe({
        recipeSlug: 'temper_titanite_ember',
        currentGold: 100,
        materialCounts: { obsidian_ingot: 5, astral_dew_vial: 2 },
        characterStats: { strengthLevel: 1, enduranceLevel: 5, agilityLevel: 5 },
      });
      expect(lowStrength.ok).toBe(false);
      if (!lowStrength.ok) {
        expect(lowStrength.error).toContain('STRENGTH Lv 2');
      }

      const lowGold = evaluateCraftRecipe({
        recipeSlug: 'smelt_obsidian_ingot',
        currentGold: 10,
        materialCounts: { iron_ore_cluster: 3 },
      });
      expect(lowGold.ok).toBe(false);

      const lowMat = evaluateCraftRecipe({
        recipeSlug: 'smelt_obsidian_ingot',
        currentGold: 100,
        materialCounts: { iron_ore_cluster: 2 },
      });
      expect(lowMat.ok).toBe(false);
    });
  });

  describe('gear tier upgrades', () => {
    it('upgrades gear sequentially from T1 to T5 while preserving existing affixes and rejects T5 cap', () => {
      const materials: Record<string, number> = {
        iron_ore_cluster: 10,
        obsidian_ingot: 20,
        titanite_ember: 10,
        arcane_reforge_dust: 5,
        raid_essence_crystal: 2,
      };
      let gold = 1500;
      const initialPrefixId = ITEM_PREFIXES[0]!.id;
      let prefixId: string | null = initialPrefixId;
      let suffixId: string | null = null;

      expect(getGearUpgradeCost(1)?.goldCost).toBe(60);
      expect(getGearUpgradeCost(2)?.goldCost).toBe(140);
      expect(getGearUpgradeCost(3)?.goldCost).toBe(280);
      expect(getGearUpgradeCost(4)?.goldCost).toBe(550);
      expect(getGearUpgradeCost(5)).toBeNull();

      for (const tier of [1, 2, 3, 4] as const) {
        const res = upgradeProceduralItemTier({
          baseSlug: 'ironbound_greatsword',
          currentTier: tier,
          currentPrefixId: prefixId,
          currentSuffixId: suffixId,
          currentGold: gold,
          materialCounts: materials,
          seed: `upgrade-${tier}`,
        });

        expect(res.ok).toBe(true);
        if (!res.ok) break;

        expect(res.previousTier).toBe(tier);
        expect(res.newTier).toBe(tier + 1);
        expect(res.upgradedInstance.tier).toBe(tier + 1);
        expect(res.upgradedInstance.prefixId).toBe(initialPrefixId);
        if (suffixId) {
          expect(res.upgradedInstance.suffixId).toBe(suffixId);
        }

        gold = res.remainingGold;
        for (const [slug, qty] of Object.entries(res.deductedMaterials)) {
          materials[slug] = (materials[slug] ?? 0) - qty;
        }
        prefixId = res.upgradedInstance.prefixId ?? null;
        suffixId = res.upgradedInstance.suffixId ?? null;
      }

      // By T4/T5 both prefix & suffix are guaranteed, and initial prefix was preserved all the way to T5
      expect(prefixId).toBe(initialPrefixId);
      expect(suffixId).toBeTruthy();

      const t5Attempt = upgradeProceduralItemTier({
        baseSlug: 'ironbound_greatsword',
        currentTier: 5,
        currentPrefixId: prefixId,
        currentSuffixId: suffixId,
        currentGold: 9999,
        materialCounts: { raid_essence_crystal: 10, obsidian_ingot: 20, titanite_ember: 10 },
        seed: 'cap-test',
      });
      expect(t5Attempt.ok).toBe(false);
      if (!t5Attempt.ok) {
        expect(t5Attempt.error).toContain('Tier V');
      }

      const unknownBase = upgradeProceduralItemTier({
        baseSlug: 'nonexistent_blade',
        currentTier: 1,
        currentGold: 500,
        materialCounts: { obsidian_ingot: 5, iron_ore_cluster: 5 },
        seed: 'bad-base',
      });
      expect(unknownBase.ok).toBe(false);
    });
  });

  describe('affix reforging', () => {
    it('supports BOTH, LOCK_PREFIX, and LOCK_SUFFIX modes and validates tier/lock constraints', () => {
      const materials = { arcane_reforge_dust: 20, obsidian_ingot: 20 };

      expect(getAffixReforgeCost(2, 'BOTH')).toMatchObject({ goldCost: 80 });
      expect(getAffixReforgeCost(3, 'LOCK_PREFIX')).toMatchObject({ goldCost: 225 });

      // Tier 1 BOTH reforge respects single affix XOR and avoids keeping the old affix
      const t1Reforge = reforgeProceduralItemAffixes({
        baseSlug: 'dusk_shinobi_wakizashi',
        tier: 1,
        mode: 'BOTH',
        currentPrefixId: ITEM_PREFIXES[0]!.id,
        currentSuffixId: null,
        currentGold: 500,
        materialCounts: materials,
        seed: 't1-reforge',
      });
      expect(t1Reforge.ok).toBe(true);
      if (t1Reforge.ok) {
        const hasPrefix = Boolean(t1Reforge.reforgedInstance.prefixId);
        const hasSuffix = Boolean(t1Reforge.reforgedInstance.suffixId);
        expect(hasPrefix !== hasSuffix).toBe(true);
        expect(t1Reforge.reforgedInstance.prefixId).not.toBe(ITEM_PREFIXES[0]!.id);
      }

      // Reject lock modes on Tier 1
      const t1Lock = reforgeProceduralItemAffixes({
        baseSlug: 'dusk_shinobi_wakizashi',
        tier: 1,
        mode: 'LOCK_PREFIX',
        currentPrefixId: ITEM_PREFIXES[0]!.id,
        currentGold: 500,
        materialCounts: materials,
        seed: 't1-lock',
      });
      expect(t1Lock.ok).toBe(false);

      // Reject LOCK_PREFIX when item has no prefix
      const missingPrefix = reforgeProceduralItemAffixes({
        baseSlug: 'astral_archstaff',
        tier: 3,
        mode: 'LOCK_PREFIX',
        currentPrefixId: null,
        currentSuffixId: ITEM_SUFFIXES[0]!.id,
        currentGold: 500,
        materialCounts: materials,
        seed: 'missing-prefix',
      });
      expect(missingPrefix.ok).toBe(false);

      // Reject LOCK_SUFFIX when item has no suffix
      const missingSuffix = reforgeProceduralItemAffixes({
        baseSlug: 'astral_archstaff',
        tier: 3,
        mode: 'LOCK_SUFFIX',
        currentPrefixId: ITEM_PREFIXES[0]!.id,
        currentSuffixId: null,
        currentGold: 500,
        materialCounts: materials,
        seed: 'missing-suffix',
      });
      expect(missingSuffix.ok).toBe(false);

      // Tier 4 LOCK_PREFIX preserves prefix and rolls a new suffix
      const lockedPrefix = ITEM_PREFIXES[2]!.id;
      const oldSuffix = ITEM_SUFFIXES[1]!.id;
      const lockPrefixRes = reforgeProceduralItemAffixes({
        baseSlug: 'warden_chainmail',
        tier: 4,
        mode: 'LOCK_PREFIX',
        currentPrefixId: lockedPrefix,
        currentSuffixId: oldSuffix,
        currentGold: 500,
        materialCounts: materials,
        seed: 'lock-prefix-t4',
      });
      expect(lockPrefixRes.ok).toBe(true);
      if (lockPrefixRes.ok) {
        expect(lockPrefixRes.goldCost).toBe(300);
        expect(lockPrefixRes.reforgedInstance.prefixId).toBe(lockedPrefix);
        expect(lockPrefixRes.reforgedInstance.suffixId).toBeTruthy();
        expect(lockPrefixRes.reforgedInstance.suffixId).not.toBe(oldSuffix);
      }

      // Tier 4 LOCK_SUFFIX preserves suffix and rolls a new prefix
      const oldPrefix = ITEM_PREFIXES[2]!.id;
      const lockedSuffix = ITEM_SUFFIXES[4]!.id;
      const lockSuffixRes = reforgeProceduralItemAffixes({
        baseSlug: 'warden_chainmail',
        tier: 4,
        mode: 'LOCK_SUFFIX',
        currentPrefixId: oldPrefix,
        currentSuffixId: lockedSuffix,
        currentGold: 500,
        materialCounts: materials,
        seed: 'lock-suffix-t4',
      });
      expect(lockSuffixRes.ok).toBe(true);
      if (lockSuffixRes.ok) {
        expect(lockSuffixRes.reforgedInstance.suffixId).toBe(lockedSuffix);
        expect(lockSuffixRes.reforgedInstance.prefixId).toBeTruthy();
        expect(lockSuffixRes.reforgedInstance.prefixId).not.toBe(oldPrefix);
      }

      // Tier 4 BOTH rerolls both affixes
      const bothRes = reforgeProceduralItemAffixes({
        baseSlug: 'warden_chainmail',
        tier: 4,
        mode: 'BOTH',
        currentPrefixId: oldPrefix,
        currentSuffixId: lockedSuffix,
        currentGold: 500,
        materialCounts: materials,
        seed: 'both-t4',
      });
      expect(bothRes.ok).toBe(true);
      if (bothRes.ok) {
        expect(bothRes.goldCost).toBe(160);
        expect(bothRes.reforgedInstance.prefixId).not.toBe(oldPrefix);
        expect(bothRes.reforgedInstance.suffixId).not.toBe(lockedSuffix);
      }
    });
  });

  describe('trader rotating stock, purchase, and sell valuation', () => {
    it('generates deterministic rotating stock per date key and processes purchases', () => {
      const stockA = generateTraderRotatingStock('2026-11-17');
      const stockB = generateTraderRotatingStock('2026-11-17');
      const stockOtherDay = generateTraderRotatingStock('2026-11-18');

      expect(stockA).toEqual(stockB);
      expect(stockA).toHaveLength(9); // 4 staples + 2 rotating materials + 3 procedural gear
      expect(stockA.filter((o) => o.category === 'CONSUMABLE')).toHaveLength(3);
      expect(stockA.filter((o) => o.category === 'MATERIAL')).toHaveLength(3);
      expect(stockA.filter((o) => o.category === 'PROCEDURAL_GEAR')).toHaveLength(3);

      // Rotating offers differ across date keys
      const rotatingIdsA = stockA.slice(4).map((o) => o.offerId);
      const rotatingIdsOther = stockOtherDay.slice(4).map((o) => o.offerId);
      expect(rotatingIdsA).not.toEqual(rotatingIdsOther);

      // Purchase staple consumable in batch
      const stapleBuy = evaluateTraderPurchase({
        offerId: 'staple:sunleaf_healing_draught',
        quantity: 3,
        currentGold: 200,
        rotationDateKey: '2026-11-17',
      });
      expect(stapleBuy.ok).toBe(true);
      if (stapleBuy.ok) {
        expect(stapleBuy.totalGoldCost).toBe(135);
        expect(stapleBuy.remainingGold).toBe(65);
        expect(stapleBuy.purchasedDrops).toHaveLength(1);
        expect(stapleBuy.purchasedDrops[0]!.quantity).toBe(3);
      }

      // Purchase procedural gear
      const gearOffer = stockA.find((o) => o.category === 'PROCEDURAL_GEAR')!;
      const gearBuy = evaluateTraderPurchase({
        offerId: gearOffer.offerId,
        quantity: 2,
        currentGold: gearOffer.buyPriceGold * 2 + 10,
        rotationDateKey: '2026-11-17',
      });
      expect(gearBuy.ok).toBe(true);
      if (gearBuy.ok) {
        expect(gearBuy.purchasedDrops).toHaveLength(2);
        expect(gearBuy.remainingGold).toBe(10);
      }

      // Reject insufficient gold and unknown offer
      expect(
        evaluateTraderPurchase({
          offerId: gearOffer.offerId,
          quantity: 1,
          currentGold: 1,
          rotationDateKey: '2026-11-17',
        }).ok
      ).toBe(false);

      expect(
        evaluateTraderPurchase({
          offerId: 'missing_offer',
          quantity: 1,
          currentGold: 9999,
          rotationDateKey: '2026-11-17',
        }).ok
      ).toBe(false);
    });

    it('calculates sell values cleanly across materials, consumables, and procedural gear tiers', () => {
      // Material: obsidian_ingot goldValue = 45 -> round(45 * 0.45) = 20
      expect(calculateTraderSellValue({ itemSlug: 'obsidian_ingot', quantity: 4 })).toEqual({
        unitSellGold: 20,
        totalSellGold: 80,
      });

      // Consumable: sunleaf_healing_draught goldValue = 35 -> round(35 * 0.45) = 16
      expect(calculateTraderSellValue({ itemSlug: 'sunleaf_healing_draught' })).toEqual({
        unitSellGold: 16,
        totalSellGold: 16,
      });

      // Procedural gear: ironbound_greatsword baseGoldValue = 180, T3 multiplier = 2.6 -> 468 -> round(468 * 0.45) = 211
      expect(calculateTraderSellValue({ itemSlug: 'ironbound_greatsword', tier: 3 })).toEqual({
        unitSellGold: 211,
        totalSellGold: 211,
      });

      // Already-scaled goldValue from RolledProceduralItemInstance should not be double-scaled
      const rolled = rollProceduralItemInstance({
        baseSlug: 'ironbound_greatsword',
        tier: 3,
        seed: 'sell-test',
      });
      expect(
        calculateTraderSellValue({
          itemSlug: rolled.baseSlug,
          baseGoldValue: rolled.goldValue,
          tier: rolled.tier,
        })
      ).toEqual({
        unitSellGold: 211,
        totalSellGold: 211,
      });

      // Floor at 1g
      expect(calculateTraderSellValue({ baseGoldValue: 1 })).toEqual({
        unitSellGold: 1,
        totalSellGold: 1,
      });
    });
  });

  describe('trainer NPC talent respec and build guidance', () => {
    it('calculates respec cost, refunds points across multiple stats, and clears activeSkillLoadout', () => {
      const unlockedNodeRanks = {
        jug_iron_skin: 3,
        jug_iron_blood: 2,
        war_deep_lungs: 4,
        cle_mending_aura: 1,
      };

      const quote = calculateTalentRespecCost(unlockedNodeRanks);
      expect(quote.totalPointsSpent).toBe(10);
      expect(quote.canRespec).toBe(true);
      expect(quote.goldCost).toBe(170);
      expect(quote.refundedByStat).toEqual({
        STRENGTH: 5,
        ENDURANCE: 4,
        AGILITY: 0,
        DEXTERITY: 0,
        CONSTITUTION: 0,
        WISDOM: 1,
        SPIRIT: 0,
      });

      const respecOk = respecCharacterTalents({
        currentGold: 250,
        availablePoints: { STRENGTH: 2, WISDOM: 3 },
        unlockedNodeRanks,
        activeSkillLoadout: ['jug_shield_slam', 'war_second_wind_hymn'],
      });
      expect(respecOk.ok).toBe(true);
      if (respecOk.ok) {
        expect(respecOk.goldCost).toBe(170);
        expect(respecOk.remainingGold).toBe(80);
        expect(respecOk.totalPointsRefunded).toBe(10);
        expect(respecOk.nextAvailablePoints.STRENGTH).toBe(7);
        expect(respecOk.nextAvailablePoints.ENDURANCE).toBe(4);
        expect(respecOk.nextAvailablePoints.WISDOM).toBe(4);
        expect(respecOk.nextUnlockedNodeRanks).toEqual({});
        expect(respecOk.nextActiveSkillLoadout).toEqual([]);
      }

      // Reject 0 allocated points
      const zeroRespec = respecCharacterTalents({
        currentGold: 500,
        availablePoints: { STRENGTH: 5 },
        unlockedNodeRanks: {},
      });
      expect(zeroRespec.ok).toBe(false);

      // Reject insufficient gold
      const brokeRespec = respecCharacterTalents({
        currentGold: 50,
        availablePoints: {},
        unlockedNodeRanks,
      });
      expect(brokeRespec.ok).toBe(false);
    });

    it('validates all recommended talent builds against DEFAULT_TALENT_TREES and selects dominant stat build', () => {
      const validTrees = new Set(DEFAULT_TALENT_TREES.map((t) => t.slug));
      const validNodes = new Set(DEFAULT_TALENT_TREES.flatMap((t) => t.nodes.map((n) => n.id)));

      expect(RECOMMENDED_TALENT_BUILDS.length).toBeGreaterThanOrEqual(7);
      for (const build of RECOMMENDED_TALENT_BUILDS) {
        expect(build.recommendedTreeSlugs.length).toBeGreaterThan(0);
        expect(build.priorityNodeIds.length).toBeGreaterThan(0);
        for (const slug of build.recommendedTreeSlugs) {
          expect(validTrees.has(slug)).toBe(true);
        }
        for (const nodeId of build.priorityNodeIds) {
          expect(validNodes.has(nodeId)).toBe(true);
        }
      }

      const mageBuild = recommendTalentBuildForStats({
        strengthLevel: 3,
        enduranceLevel: 4,
        agilityLevel: 2,
        spiritLevel: 12,
      });
      expect(mageBuild.primaryStat).toBe('SPIRIT');
      expect(mageBuild.recommendedTreeSlugs).toContain('mage');

      const dexBuild = recommendTalentBuildForStats({
        strengthLevel: 4,
        enduranceLevel: 4,
        agilityLevel: 6,
        dexLevel: 11,
      });
      expect(dexBuild.primaryStat).toBe('DEXTERITY');
      expect(dexBuild.recommendedTreeSlugs).toContain('acrobat');
    });
  });
});
