import { describe, expect, it } from 'vitest';
import {
  CHARACTER_RACES,
  RACE_DEFINITIONS,
  createDefaultCustomizationConfig,
  deriveCustomizationFromLegacyAppearance,
  adaptCustomizationForRaceChange,
  normalizeCustomizationConfig,
  getUnlockedCustomizationState,
  validateCustomizationConfig,
  computeCharacterRigMetrics,
} from '../src/character-customization';

const LEVEL_1_STATS = {
  strengthLevel: 1,
  enduranceLevel: 1,
  agilityLevel: 1,
  dexterityLevel: 1,
  constitutionLevel: 1,
  wisdomLevel: 1,
  spiritLevel: 1,
};

const LEVEL_50_STATS = {
  strengthLevel: 50,
  enduranceLevel: 50,
  agilityLevel: 50,
  dexterityLevel: 50,
  constitutionLevel: 50,
  wisdomLevel: 50,
  spiritLevel: 50,
};

describe('Character Customization Engine', () => {
  describe('Races & Cosmetic Parity', () => {
    it('defines HUMAN, ONI, and KITSUNE with identical stat cap multiplier (1) and cosmeticOnly=true', () => {
      expect(CHARACTER_RACES).toEqual(['HUMAN', 'ONI', 'KITSUNE']);

      for (const race of CHARACTER_RACES) {
        const def = RACE_DEFINITIONS[race];
        expect(def.cosmeticOnly).toBe(true);
        expect(def.statCapMultiplier).toBe(1);
        expect(def.allowedSkinPaletteIds).toContain(def.defaultSkinPaletteId);
      }

      expect(RACE_DEFINITIONS.HUMAN.supportsOniHorns).toBe(false);
      expect(RACE_DEFINITIONS.HUMAN.supportsKitsuneTails).toBe(false);
      expect(RACE_DEFINITIONS.ONI.supportsOniHorns).toBe(true);
      expect(RACE_DEFINITIONS.ONI.supportsKitsuneTails).toBe(false);
      expect(RACE_DEFINITIONS.KITSUNE.supportsOniHorns).toBe(false);
      expect(RACE_DEFINITIONS.KITSUNE.supportsKitsuneTails).toBe(true);
    });
  });

  describe('Level-1 Unmuscled Baseline', () => {
    it('createDefaultCustomizationConfig returns unmuscled Level-1 baseline for every race', () => {
      const human = createDefaultCustomizationConfig('HUMAN');
      expect(human.version).toBe(1);
      expect(human.morphs).toMatchObject({
        muscleMassTier: 0,
        frameTier: 0,
        leanDefinitionTier: 0,
        combatStance: 'neutral',
        scarsTier: 0,
        vascularityTier: 0,
        oniHornTier: 0,
        kitsuneTailCount: 0,
        auraTier: 0,
      });

      const oni = createDefaultCustomizationConfig('ONI');
      expect(oni.morphs.oniHornTier).toBe(0);
      expect(oni.morphs.kitsuneTailCount).toBe(0);
      expect(oni.identity.skinPalette).toBe('crimson_oni');

      const kitsune = createDefaultCustomizationConfig('KITSUNE');
      expect(kitsune.morphs.oniHornTier).toBe(0);
      expect(kitsune.morphs.kitsuneTailCount).toBe(1);
      expect(kitsune.identity.skinPalette).toBe('ivory_fox');
    });
  });

  describe('7-Stat Unlock Gates & Validation', () => {
    it('gates muscleMassTier via STRENGTH (5 / 12 / 22 / 35)', () => {
      expect(
        getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, strengthLevel: 4 }).maxMuscleMassTier
      ).toBe(0);
      expect(
        getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, strengthLevel: 5 }).maxMuscleMassTier
      ).toBe(1);
      expect(
        getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, strengthLevel: 12 }).maxMuscleMassTier
      ).toBe(2);
      expect(
        getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, strengthLevel: 22 }).maxMuscleMassTier
      ).toBe(3);
      expect(
        getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, strengthLevel: 35 }).maxMuscleMassTier
      ).toBe(4);

      const config = createDefaultCustomizationConfig('HUMAN');
      config.morphs.muscleMassTier = 2;

      const lockedRes = validateCustomizationConfig({
        race: 'HUMAN',
        config,
        stats: { ...LEVEL_1_STATS, strengthLevel: 11 },
      });
      expect(lockedRes.valid).toBe(false);
      expect(lockedRes.errors.some((e) => e.includes('muscleMassTier'))).toBe(true);

      const unlockedRes = validateCustomizationConfig({
        race: 'HUMAN',
        config,
        stats: { ...LEVEL_1_STATS, strengthLevel: 12 },
      });
      expect(unlockedRes.valid).toBe(true);
    });

    it('gates frameTier via CONSTITUTION (5 / 12 / 22 / 35)', () => {
      expect(
        getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, conLevel: 4 }).maxFrameTier
      ).toBe(0);
      expect(
        getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, conLevel: 5 }).maxFrameTier
      ).toBe(1);
      expect(
        getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, conLevel: 22 }).maxFrameTier
      ).toBe(3);
      expect(
        getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, constitutionLevel: 35 }).maxFrameTier
      ).toBe(4);

      const config = createDefaultCustomizationConfig('HUMAN');
      config.morphs.frameTier = 1;
      expect(
        validateCustomizationConfig({
          race: 'HUMAN',
          config,
          stats: { ...LEVEL_1_STATS, conLevel: 4 },
        }).valid
      ).toBe(false);
      expect(
        validateCustomizationConfig({
          race: 'HUMAN',
          config,
          stats: { ...LEVEL_1_STATS, conLevel: 5 },
        }).valid
      ).toBe(true);
    });

    it('gates leanDefinitionTier and combatStance via AGILITY and DEXTERITY', () => {
      const stateAgi5 = getUnlockedCustomizationState('HUMAN', {
        ...LEVEL_1_STATS,
        agilityLevel: 5,
      });
      expect(stateAgi5.maxLeanDefinitionTier).toBe(1);
      expect(stateAgi5.unlockedStances).toContain('agile_ready');
      expect(stateAgi5.unlockedStances).not.toContain('iaido_poise');

      const stateDex14 = getUnlockedCustomizationState('HUMAN', {
        ...LEVEL_1_STATS,
        dexLevel: 14,
      });
      expect(stateDex14.maxLeanDefinitionTier).toBe(2);
      expect(stateDex14.unlockedStances).toContain('iaido_poise');
      expect(stateDex14.unlockedStances).toContain('acrobat_guard');
      expect(stateDex14.unlockedStances).not.toContain('phantom_step');

      const stateHybrid = getUnlockedCustomizationState('HUMAN', {
        ...LEVEL_1_STATS,
        agilityLevel: 14,
        dexterityLevel: 10,
      });
      expect(stateHybrid.unlockedStances).toContain('phantom_step');

      const config = createDefaultCustomizationConfig('HUMAN');
      config.morphs.combatStance = 'phantom_step';
      expect(
        validateCustomizationConfig({
          race: 'HUMAN',
          config,
          stats: { ...LEVEL_1_STATS, agilityLevel: 14, dexterityLevel: 9 },
        }).valid
      ).toBe(false);
      expect(
        validateCustomizationConfig({
          race: 'HUMAN',
          config,
          stats: { ...LEVEL_1_STATS, agilityLevel: 14, dexterityLevel: 10 },
        }).valid
      ).toBe(true);
    });

    it('gates scarsTier and vascularityTier via ENDURANCE', () => {
      const end7 = getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, enduranceLevel: 7 });
      expect(end7.maxScarsTier).toBe(1);
      expect(end7.maxVascularityTier).toBe(0);

      const end18 = getUnlockedCustomizationState('HUMAN', {
        ...LEVEL_1_STATS,
        enduranceLevel: 18,
      });
      expect(end18.maxScarsTier).toBe(2);
      expect(end18.maxVascularityTier).toBe(2);

      const end25 = getUnlockedCustomizationState('HUMAN', {
        ...LEVEL_1_STATS,
        enduranceLevel: 25,
      });
      expect(end25.maxScarsTier).toBe(3);

      const config = createDefaultCustomizationConfig('HUMAN');
      config.morphs.vascularityTier = 1;
      expect(
        validateCustomizationConfig({
          race: 'HUMAN',
          config,
          stats: { ...LEVEL_1_STATS, enduranceLevel: 7 },
        }).valid
      ).toBe(false);
      expect(
        validateCustomizationConfig({
          race: 'HUMAN',
          config,
          stats: { ...LEVEL_1_STATS, enduranceLevel: 8 },
        }).valid
      ).toBe(true);
    });

    it('gates auraTier via WISDOM or SPIRIT for all races', () => {
      expect(
        getUnlockedCustomizationState('HUMAN', { ...LEVEL_1_STATS, wisLevel: 14 }).maxAuraTier
      ).toBe(2);
      expect(
        getUnlockedCustomizationState('ONI', { ...LEVEL_1_STATS, sprLevel: 25 }).maxAuraTier
      ).toBe(3);

      const config = createDefaultCustomizationConfig('HUMAN');
      config.morphs.auraTier = 1;
      expect(
        validateCustomizationConfig({
          race: 'HUMAN',
          config,
          stats: { ...LEVEL_1_STATS, wisLevel: 4, sprLevel: 4 },
        }).valid
      ).toBe(false);
      expect(
        validateCustomizationConfig({
          race: 'HUMAN',
          config,
          stats: { ...LEVEL_1_STATS, sprLevel: 5 },
        }).valid
      ).toBe(true);
    });
  });

  describe('Race-Exclusive Morphs (Oni Horns & Kitsune Tails)', () => {
    it('unlocks Oni horns (0-3) via WIS or SPR and rejects non-ONI use', () => {
      expect(
        getUnlockedCustomizationState('ONI', { ...LEVEL_1_STATS, wisLevel: 5 }).maxOniHornTier
      ).toBe(1);
      expect(
        getUnlockedCustomizationState('ONI', { ...LEVEL_1_STATS, sprLevel: 14 }).maxOniHornTier
      ).toBe(2);
      expect(
        getUnlockedCustomizationState('ONI', { ...LEVEL_1_STATS, wisLevel: 25 }).maxOniHornTier
      ).toBe(3);

      // Human cannot wear Oni horns even at Lv 50
      const humanConfig = createDefaultCustomizationConfig('HUMAN');
      humanConfig.morphs.oniHornTier = 1;
      const crossRace = validateCustomizationConfig({
        race: 'HUMAN',
        config: humanConfig,
        stats: LEVEL_50_STATS,
      });
      expect(crossRace.valid).toBe(false);
      expect(crossRace.errors.some((e) => e.includes('ONI-exclusive'))).toBe(true);

      // Kitsune cannot wear Oni horns
      const kitsuneConfig = createDefaultCustomizationConfig('KITSUNE');
      kitsuneConfig.morphs.oniHornTier = 1;
      expect(
        validateCustomizationConfig({
          race: 'KITSUNE',
          config: kitsuneConfig,
          stats: LEVEL_50_STATS,
        }).valid
      ).toBe(false);
    });

    it('unlocks Kitsune tails (1-9) via WIS or SPR and rejects 0 tails or cross-race tails', () => {
      const thresholds: Array<[number, number]> = [
        [1, 1],
        [3, 2],
        [6, 3],
        [10, 4],
        [14, 5],
        [18, 6],
        [23, 7],
        [29, 8],
        [35, 9],
      ];

      for (const [statVal, expectedTails] of thresholds) {
        expect(
          getUnlockedCustomizationState('KITSUNE', { ...LEVEL_1_STATS, wisLevel: statVal })
            .maxKitsuneTails
        ).toBe(expectedTails);
        expect(
          getUnlockedCustomizationState('KITSUNE', { ...LEVEL_1_STATS, sprLevel: statVal })
            .maxKitsuneTails
        ).toBe(expectedTails);
      }

      // KITSUNE cannot have 0 tails
      const zeroTailKitsune = createDefaultCustomizationConfig('KITSUNE');
      zeroTailKitsune.morphs.kitsuneTailCount = 0;
      const zeroTailResult = validateCustomizationConfig({
        race: 'KITSUNE',
        config: zeroTailKitsune,
        stats: LEVEL_50_STATS,
      });
      expect(zeroTailResult.valid).toBe(false);

      // HUMAN cannot have tails
      const humanWithTails = createDefaultCustomizationConfig('HUMAN');
      humanWithTails.morphs.kitsuneTailCount = 1;
      const humanTailResult = validateCustomizationConfig({
        race: 'HUMAN',
        config: humanWithTails,
        stats: LEVEL_50_STATS,
      });
      expect(humanTailResult.valid).toBe(false);
      expect(humanTailResult.errors.some((e) => e.includes('KITSUNE-exclusive'))).toBe(true);
    });

    it('rejects disallowed skin palettes for a given race', () => {
      const humanWithOniSkin = createDefaultCustomizationConfig('HUMAN');
      humanWithOniSkin.identity.skinPalette = 'crimson_oni';
      const result = validateCustomizationConfig({
        race: 'HUMAN',
        config: humanWithOniSkin,
        stats: LEVEL_1_STATS,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('Opt-In Freedom Guarantee', () => {
    it('allows a Level-50 character across all 7 stats to keep all morphs at Tier 0 / baseline', () => {
      for (const race of CHARACTER_RACES) {
        const baseline = createDefaultCustomizationConfig(race);
        const result = validateCustomizationConfig({
          race,
          config: baseline,
          stats: LEVEL_50_STATS,
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      }
    });
  });

  describe('Legacy Derivation, Race Adaptation & Safe Normalization', () => {
    it('derives all 10 legacy appearance presets with baseline Tier-0 morphs', () => {
      const legacyOni = deriveCustomizationFromLegacyAppearance('oni_warlord');
      expect(legacyOni.race).toBe('ONI');
      expect(legacyOni.config.morphs.muscleMassTier).toBe(0);
      expect(legacyOni.config.morphs.oniHornTier).toBe(0);

      const legacyKitsune = deriveCustomizationFromLegacyAppearance('solar_mystic');
      expect(legacyKitsune.race).toBe('KITSUNE');
      expect(legacyKitsune.config.morphs.kitsuneTailCount).toBe(1);
      expect(legacyKitsune.config.morphs.auraTier).toBe(0);

      const legacyHuman = deriveCustomizationFromLegacyAppearance('wayfarer');
      expect(legacyHuman.race).toBe('HUMAN');
      expect(legacyHuman.config.morphs.kitsuneTailCount).toBe(0);

      const unknown = deriveCustomizationFromLegacyAppearance('unknown_preset');
      expect(unknown.race).toBe('HUMAN');
      expect(unknown.config).toEqual(createDefaultCustomizationConfig('HUMAN'));
    });

    it('adaptCustomizationForRaceChange adjusts skinPalette, horns, and tails cleanly', () => {
      const oniConfig = createDefaultCustomizationConfig('ONI');
      oniConfig.morphs.oniHornTier = 3;

      const toKitsune = adaptCustomizationForRaceChange(oniConfig, 'KITSUNE');
      expect(toKitsune.identity.skinPalette).toBe('ivory_fox');
      expect(toKitsune.morphs.oniHornTier).toBe(0);
      expect(toKitsune.morphs.kitsuneTailCount).toBe(1);

      toKitsune.morphs.kitsuneTailCount = 7;
      const toHuman = adaptCustomizationForRaceChange(toKitsune, 'HUMAN');
      expect(toHuman.identity.skinPalette).toBe('warm_amber');
      expect(toHuman.morphs.oniHornTier).toBe(0);
      expect(toHuman.morphs.kitsuneTailCount).toBe(0);
    });

    it('normalizeCustomizationConfig safely handles null, partial, and invalid JSON', () => {
      const fromNull = normalizeCustomizationConfig(null, 'KITSUNE');
      expect(fromNull.morphs.kitsuneTailCount).toBe(1);
      expect(fromNull.identity.skinPalette).toBe('ivory_fox');

      const fromPartial = normalizeCustomizationConfig(
        {
          identity: { hairStyle: 'flowing_mane', skinPalette: 'crimson_oni' },
          morphs: { muscleMassTier: 99, oniHornTier: 2, kitsuneTailCount: 4 },
        },
        'HUMAN'
      );
      expect(fromPartial.identity.hairStyle).toBe('flowing_mane');
      expect(fromPartial.identity.skinPalette).toBe('warm_amber');
      expect(fromPartial.morphs.muscleMassTier).toBe(0);
      expect(fromPartial.morphs.oniHornTier).toBe(0);
      expect(fromPartial.morphs.kitsuneTailCount).toBe(0);
    });
  });

  describe('Pure Rig Bone Metrics Solver (computeCharacterRigMetrics)', () => {
    it('scales muscle dimensions with STR, frame dimensions with CON, and waist V-taper with AGI/DEX', () => {
      const baseConfig = createDefaultCustomizationConfig('HUMAN');
      const baseMetrics = computeCharacterRigMetrics('HUMAN', baseConfig);

      // Feet remain anchored to groundY = 250
      expect(baseMetrics.groundY).toBe(250);
      expect(baseMetrics.hipY + baseMetrics.thigh.length + baseMetrics.shin.length).toBeCloseTo(
        250,
        2
      );

      // STR muscleMassTier increases bulk & limb/chest widths
      const strConfig = createDefaultCustomizationConfig('HUMAN');
      strConfig.morphs.muscleMassTier = 4;
      const strMetrics = computeCharacterRigMetrics('HUMAN', strConfig);
      expect(strMetrics.torso.chestWidth).toBeGreaterThan(baseMetrics.torso.chestWidth);
      expect(strMetrics.torso.muscleBulk).toBeGreaterThan(baseMetrics.torso.muscleBulk);
      expect(strMetrics.upperArm.width).toBeGreaterThan(baseMetrics.upperArm.width);
      expect(strMetrics.upperArm.bicepBulk).toBeGreaterThan(baseMetrics.upperArm.bicepBulk);
      expect(strMetrics.forearm.width).toBeGreaterThan(baseMetrics.forearm.width);
      expect(strMetrics.thigh.width).toBeGreaterThan(baseMetrics.thigh.width);
      expect(strMetrics.thigh.quadBulk).toBeGreaterThan(baseMetrics.thigh.quadBulk);
      expect(strMetrics.shin.width).toBeGreaterThan(baseMetrics.shin.width);

      // CON frameTier increases statureScale and segment lengths while keeping feet anchored
      const conConfig = createDefaultCustomizationConfig('HUMAN');
      conConfig.morphs.frameTier = 4;
      const conMetrics = computeCharacterRigMetrics('HUMAN', conConfig);
      expect(conMetrics.statureScale).toBeCloseTo(1.1, 5);
      expect(conMetrics.torso.shoulderSpan).toBeGreaterThan(baseMetrics.torso.shoulderSpan);
      expect(conMetrics.torso.height).toBeGreaterThan(baseMetrics.torso.height);
      expect(conMetrics.upperArm.length).toBeGreaterThan(baseMetrics.upperArm.length);
      expect(conMetrics.forearm.length).toBeGreaterThan(baseMetrics.forearm.length);
      expect(conMetrics.thigh.length).toBeGreaterThan(baseMetrics.thigh.length);
      expect(conMetrics.shin.length).toBeGreaterThan(baseMetrics.shin.length);
      expect(conMetrics.hipY + conMetrics.thigh.length + conMetrics.shin.length).toBeCloseTo(
        250,
        2
      );

      // AGI/DEX leanDefinitionTier sharpens V-taper (narrower waistSpan, higher leanCut)
      const leanConfig = createDefaultCustomizationConfig('HUMAN');
      leanConfig.morphs.leanDefinitionTier = 3;
      const leanMetrics = computeCharacterRigMetrics('HUMAN', leanConfig);
      expect(leanMetrics.torso.waistSpan).toBeLessThan(baseMetrics.torso.waistSpan);
      expect(leanMetrics.torso.leanCut).toBeGreaterThan(baseMetrics.torso.leanCut);
    });

    it('produces exact symmetrical tail fan angles for Kitsune and empty angles for non-Kitsune', () => {
      const humanMetrics = computeCharacterRigMetrics(
        'HUMAN',
        createDefaultCustomizationConfig('HUMAN')
      );
      expect(humanMetrics.tails.count).toBe(0);
      expect(humanMetrics.tails.fanAnglesDeg).toEqual([]);
      expect(humanMetrics.horns.visible).toBe(false);

      const kitsuneConfig = createDefaultCustomizationConfig('KITSUNE');
      kitsuneConfig.morphs.kitsuneTailCount = 1;
      const oneTail = computeCharacterRigMetrics('KITSUNE', kitsuneConfig);
      expect(oneTail.tails.count).toBe(1);
      expect(oneTail.tails.fanAnglesDeg).toEqual([0]);

      kitsuneConfig.morphs.kitsuneTailCount = 9;
      const nineTails = computeCharacterRigMetrics('KITSUNE', kitsuneConfig);
      expect(nineTails.tails.count).toBe(9);
      expect(nineTails.tails.fanAnglesDeg).toHaveLength(9);
      expect(nineTails.tails.fanAnglesDeg[4]).toBe(0);
      expect(nineTails.tails.fanAnglesDeg[0]).toBe(-nineTails.tails.fanAnglesDeg[8]);
    });
  });
});
