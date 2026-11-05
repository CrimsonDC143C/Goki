import { describe, expect, it } from 'vitest';
import {
  BASE_EQUIPPABLE_ITEMS,
  BASE_EQUIPPABLE_ITEM_BY_SLUG,
  ITEM_PREFIXES,
  ITEM_PREFIX_BY_ID,
  ITEM_SUFFIXES,
  ITEM_SUFFIX_BY_ID,
  ITEM_TIER_CONFIG,
  aggregateEquippedItemModifiers,
  calculateDerivedCombatStats,
  rollProceduralItemInstance,
} from '../index';

describe('Procedural Itemization & Affix Engine', () => {
  describe('Catalog & Registry Integrity', () => {
    it('defines exactly 32 base equippable items covering all equipment slots', () => {
      expect(BASE_EQUIPPABLE_ITEMS.length).toBe(32);

      const slots = new Set(BASE_EQUIPPABLE_ITEMS.map((i) => i.slot));
      expect(slots.has('mainHand')).toBe(true);
      expect(slots.has('offHand')).toBe(true);
      expect(slots.has('head')).toBe(true);
      expect(slots.has('chest')).toBe(true);
      expect(slots.has('legs')).toBe(true);
      expect(slots.has('boots')).toBe(true);
      expect(slots.has('accessory1')).toBe(true);

      const types = new Set(BASE_EQUIPPABLE_ITEMS.map((i) => i.itemType));
      expect(types.has('WEAPON')).toBe(true);
      expect(types.has('OFFHAND')).toBe(true);
      expect(types.has('HEAD')).toBe(true);
      expect(types.has('CHEST')).toBe(true);
      expect(types.has('LEGS')).toBe(true);
      expect(types.has('BOOTS')).toBe(true);
      expect(types.has('ACCESSORY')).toBe(true);

      // Verify BASE_EQUIPPABLE_ITEM_BY_SLUG lookup map
      for (const item of BASE_EQUIPPABLE_ITEMS) {
        expect(BASE_EQUIPPABLE_ITEM_BY_SLUG[item.baseSlug]).toBe(item);
      }
    });

    it('ensures every base item has a valid, fully configured Tier 5 Unique definition', () => {
      for (const item of BASE_EQUIPPABLE_ITEMS) {
        const u = item.tier5Unique;
        expect(u).toBeDefined();
        expect(typeof u.uniqueName).toBe('string');
        expect(u.uniqueName.length).toBeGreaterThan(0);
        expect(typeof u.uniqueLore).toBe('string');
        expect(u.uniqueLore.length).toBeGreaterThan(0);
        expect(typeof u.passiveId).toBe('string');
        expect(u.passiveId.length).toBeGreaterThan(0);
        expect(typeof u.passiveName).toBe('string');
        expect(u.passiveName.length).toBeGreaterThan(0);
        expect(typeof u.passiveDescription).toBe('string');
        expect(u.passiveDescription.length).toBeGreaterThan(0);
        expect(u.passiveModifiers).toBeDefined();
        expect(Object.keys(u.passiveModifiers).length).toBeGreaterThan(0);
      }
    });

    it('registers at least 12 prefixes and 10 suffixes with valid stat modifiers', () => {
      expect(ITEM_PREFIXES.length).toBeGreaterThanOrEqual(12);
      expect(ITEM_SUFFIXES.length).toBeGreaterThanOrEqual(10);

      for (const p of ITEM_PREFIXES) {
        expect(ITEM_PREFIX_BY_ID[p.id]).toBe(p);
        expect(p.label.length).toBeGreaterThan(0);
        expect(Object.keys(p.stats).length).toBeGreaterThan(0);
      }

      for (const s of ITEM_SUFFIXES) {
        expect(ITEM_SUFFIX_BY_ID[s.id]).toBe(s);
        expect(s.label.length).toBeGreaterThan(0);
        expect(
          Object.keys(s.primaryStats).length > 0 || Object.keys(s.combatStats).length > 0
        ).toBe(true);
      }
    });
  });

  describe('Tier-Gated Affix Roll Rules', () => {
    it('Tier 1 Affix Rule: across 200 deterministic seeds, Tier 1 items NEVER roll both a prefix and a suffix', () => {
      let countNeither = 0;
      let countPrefixOnly = 0;
      let countSuffixOnly = 0;

      for (let i = 0; i < 200; i++) {
        const rolled = rollProceduralItemInstance({
          baseSlug: 'ironbound_greatsword',
          tier: 1,
          seed: `t1-seed-${i}`,
        });

        expect(rolled.tier).toBe(1);
        expect(rolled.rarity).toBe('COMMON');
        // Rule: At most one affix, NEVER both!
        expect(rolled.prefixId && rolled.suffixId).toBeFalsy();

        if (!rolled.prefixId && !rolled.suffixId) {
          countNeither++;
          expect(rolled.displayName).toBe('Ironbound Greatsword');
        } else if (rolled.prefixId && !rolled.suffixId) {
          countPrefixOnly++;
          expect(rolled.displayName.startsWith(rolled.prefixLabel!)).toBe(true);
        } else if (!rolled.prefixId && rolled.suffixId) {
          countSuffixOnly++;
          expect(rolled.displayName.endsWith(rolled.suffixLabel!)).toBe(true);
        }
      }

      // Verify healthy distribution across all 3 outcomes
      expect(countNeither).toBeGreaterThan(40);
      expect(countPrefixOnly).toBeGreaterThan(30);
      expect(countSuffixOnly).toBeGreaterThan(30);
      expect(countNeither + countPrefixOnly + countSuffixOnly).toBe(200);
    });

    it('Tier 2 & Tier 3 Affix Rules: allow both affixes, and Tier 3 ALWAYS rolls at least one affix', () => {
      let t2BothCount = 0;
      for (let i = 0; i < 200; i++) {
        const rolled = rollProceduralItemInstance({
          baseSlug: 'warden_chainmail',
          tier: 2,
          seed: `t2-seed-${i}`,
        });
        expect(rolled.tier).toBe(2);
        expect(rolled.rarity).toBe('UNCOMMON');
        if (rolled.prefixId && rolled.suffixId) {
          t2BothCount++;
        }
      }
      // Tier 2 rolls independent 65% prefix / 65% suffix (~42% both)
      expect(t2BothCount).toBeGreaterThan(40);

      let t3BothCount = 0;
      for (let i = 0; i < 200; i++) {
        const rolled = rollProceduralItemInstance({
          baseSlug: 'warden_chainmail',
          tier: 3,
          seed: `t3-seed-${i}`,
        });
        expect(rolled.tier).toBe(3);
        expect(rolled.rarity).toBe('RARE');
        // Tier 3 is guaranteed at least one affix
        expect(Boolean(rolled.prefixId || rolled.suffixId)).toBe(true);

        if (rolled.prefixId && rolled.suffixId) {
          t3BothCount++;
        }
      }
      // Tier 3 rolls 85% prefix / 85% suffix (~72% both)
      expect(t3BothCount).toBeGreaterThan(100);
    });

    it('Tier 4 Affix Rule: across 100 seeds, Tier 4 items ALWAYS roll 100% guaranteed prefix AND suffix with 1.80x/2.00x scaling', () => {
      for (let i = 0; i < 100; i++) {
        const rolled = rollProceduralItemInstance({
          baseSlug: 'ashen_iron_helm',
          tier: 4,
          seed: `t4-seed-${i}`,
        });

        expect(rolled.tier).toBe(4);
        expect(rolled.rarity).toBe('EPIC');
        expect(rolled.prefixId).toBeTruthy();
        expect(rolled.suffixId).toBeTruthy();
        expect(rolled.prefixLabel).toBeTruthy();
        expect(rolled.suffixLabel).toBeTruthy();
        expect(rolled.displayName).toContain(rolled.prefixLabel!);
        expect(rolled.displayName).toContain(rolled.suffixLabel!);
      }

      // Verify specific scaling numbers on base stats
      const baseItem = BASE_EQUIPPABLE_ITEM_BY_SLUG['ashen_iron_helm'];
      const rolled = rollProceduralItemInstance({
        baseSlug: 'ashen_iron_helm',
        tier: 4,
        seed: 'fixed-t4-scale',
        forcePrefixId: 'stalwart', // armor: 8
        forceSuffixId: 'of_the_colossus', // primary: CON: 3, combat: maxHp: 45, armor: 5
      });

      // base armor = 16 -> scaled 1.8x = 29
      // stalwart armor = 8 -> scaled 2.0x = 16
      // colossus armor = 5 -> scaled 2.0x = 10
      // total armor = 29 + 16 + 10 = 55
      expect(rolled.scaledBaseStats.armor).toBe(Math.round(baseItem.baseStats.armor! * 1.8));
      expect(rolled.statBonuses.armorRating).toBe(
        Math.round(baseItem.baseStats.armor! * 1.8) + Math.round(8 * 2.0) + Math.round(5 * 2.0)
      );
      // colossus CON = 3 -> scaled 2.0x = 6
      expect(rolled.primaryStatBonuses.CON).toBe(Math.round(3 * 2.0));
    });

    it('Tier 5 Mythic Unique Rule: across 100 seeds, Tier 5 items ALWAYS roll prefix + suffix, adopt Unique name, MYTHIC rarity, and attach uniquePassive', () => {
      const baseItem = BASE_EQUIPPABLE_ITEM_BY_SLUG['ironbound_greatsword'];

      for (let i = 0; i < 100; i++) {
        const rolled = rollProceduralItemInstance({
          baseSlug: 'ironbound_greatsword',
          tier: 5,
          seed: `t5-seed-${i}`,
        });

        expect(rolled.tier).toBe(5);
        expect(rolled.rarity).toBe('MYTHIC');
        expect(rolled.prefixId).toBeTruthy();
        expect(rolled.suffixId).toBeTruthy();
        expect(rolled.displayName).toBe(`★ ${baseItem.tier5Unique.uniqueName}`);
        expect(rolled.uniquePassive).toBeDefined();
        expect(rolled.uniquePassive?.uniqueName).toBe(baseItem.tier5Unique.uniqueName);
        expect(rolled.uniquePassive?.passiveId).toBe(baseItem.tier5Unique.passiveId);
        expect(rolled.uniquePassive?.passiveModifiers).toEqual(baseItem.tier5Unique.passiveModifiers);
      }

      // Verify Tier 5 multiplier scaling: 2.25x base, 2.50x affix
      const rolled = rollProceduralItemInstance({
        baseSlug: 'ironbound_greatsword',
        tier: 5,
        seed: 'fixed-t5-scale',
        forcePrefixId: 'brutal', // meleePower: 9
        forceSuffixId: 'of_the_titan', // primary: STR: 2, combat: meleePower: 6
      });

      // base meleePower = 22 -> scaled 2.25x = 50 (Math.round(22 * 2.25) = 50)
      // brutal meleePower = 9 -> scaled 2.50x = 23 (Math.round(9 * 2.5) = 23)
      // titan meleePower = 6 -> scaled 2.50x = 15 (Math.round(6 * 2.5) = 15)
      // total meleePower = 50 + 23 + 15 = 88
      expect(rolled.scaledBaseStats.meleePower).toBe(Math.round(22 * 2.25));
      expect(rolled.statBonuses.meleePower).toBe(
        Math.round(22 * 2.25) + Math.round(9 * 2.5) + Math.round(6 * 2.5)
      );
      // titan STR = 2 -> scaled 2.5x = 5
      expect(rolled.primaryStatBonuses.STR).toBe(Math.round(2 * 2.5));
    });
  });

  describe('Combat Integration & Aggregation', () => {
    it('aggregateEquippedItemModifiers correctly aggregates combat stats, primary stats, and unique passive modifiers', () => {
      const item1 = rollProceduralItemInstance({
        baseSlug: 'ironbound_greatsword',
        tier: 5,
        seed: 'agg-item-1',
        forcePrefixId: 'brutal',
        forceSuffixId: 'of_the_titan',
      });

      const item2 = rollProceduralItemInstance({
        baseSlug: 'warden_chainmail',
        tier: 4,
        seed: 'agg-item-2',
        forcePrefixId: 'stalwart',
        forceSuffixId: 'of_the_colossus',
      });

      const aggregated = aggregateEquippedItemModifiers([item1, item2]);

      // Verify combat bonuses aggregated
      expect(aggregated.equipmentBonuses.meleePower).toBe(
        (item1.statBonuses.meleePower ?? 0) + (item2.statBonuses.meleePower ?? 0)
      );
      expect(aggregated.equipmentBonuses.armorRating).toBe(
        (item1.statBonuses.armorRating ?? 0) + (item2.statBonuses.armorRating ?? 0)
      );

      // Verify primary stats aggregated
      expect(aggregated.primaryStatBonuses.STR).toBe(item1.primaryStatBonuses.STR);
      expect(aggregated.primaryStatBonuses.CON).toBe(item2.primaryStatBonuses.CON);

      // Verify unique passive modifiers captured from item 1 (Tier 5 unique Ashbringer)
      expect(aggregated.uniquePassiveModifiers.meleePowerPct).toBe(
        item1.uniquePassive?.passiveModifiers.meleePowerPct
      );
    });

    it('calculateDerivedCombatStats reflects primaryStatBonuses and uniquePassive modifiers in derived combat attributes', () => {
      const baseline = calculateDerivedCombatStats({
        coreStats: {
          strengthLevel: 5,
          enduranceLevel: 5,
          agilityLevel: 5,
        },
        equipmentBonuses: {},
      });

      const boosted = calculateDerivedCombatStats({
        coreStats: {
          strengthLevel: 5,
          enduranceLevel: 5,
          agilityLevel: 5,
        },
        equipmentBonuses: {
          meleePower: 20,
          armorRating: 15,
        },
        equipmentPrimaryStats: {
          STR: 5,
          CON: 4,
        },
        uniqueItemModifiers: {
          meleePowerPct: 0.15,
          armorPct: 0.2,
        },
      });

      // Increased STR + gear meleePower + 15% meleePowerPct must substantially increase meleePower
      expect(boosted.meleePower).toBeGreaterThan(baseline.meleePower);

      // Increased CON + armor rating + 20% armorPct must substantially increase armor and maxHp
      expect(boosted.armor).toBeGreaterThan(baseline.armor);
      expect(boosted.maxHp).toBeGreaterThan(baseline.maxHp);
    });
  });
});
