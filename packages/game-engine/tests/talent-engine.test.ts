import { describe, expect, it } from 'vitest';
import {
  CharacterTalentState,
  DEFAULT_TALENT_TREES,
  aggregateTalentModifiers,
  spendTalentPoint,
  validateTalentAllocation,
} from '../src/talent-engine';

describe('talent-engine', () => {
  it('defines all 10 stat-bound multi-class Talent Trees across all holistic stats', () => {
    const slugs = DEFAULT_TALENT_TREES.map((t) => `${t.governingStat}:${t.slug}`);
    expect(slugs).toEqual([
      'STRENGTH:juggernaut',
      'STRENGTH:vanguard',
      'ENDURANCE:warden',
      'ENDURANCE:outrider',
      'AGILITY:berserker',
      'AGILITY:assassin',
      'WISDOM:cleric',
      'SPIRIT:mage',
      'DEXTERITY:acrobat',
      'CONSTITUTION:guardian',
    ]);
  });

  it('prevents spending Strength Talent Points in Agility or Endurance trees', () => {
    const state: CharacterTalentState = {
      availablePoints: { STRENGTH: 5, ENDURANCE: 0, AGILITY: 0 },
      unlockedNodeRanks: {},
    };

    const invalidAgi = validateTalentAllocation(state, 'ass_shadowstep_reflexes');
    expect(invalidAgi.valid).toBe(false);
    expect(invalidAgi.error).toContain('Insufficient AGILITY Talent Points');

    const validStr = validateTalentAllocation(state, 'jug_iron_skin');
    expect(validStr.valid).toBe(true);
  });

  it('enforces tier point requirements, prerequisites, and max ranks', () => {
    let state: CharacterTalentState = {
      availablePoints: { STRENGTH: 10, ENDURANCE: 0, AGILITY: 0 },
      unlockedNodeRanks: {},
    };

    // Cannot unlock Tier 2 Shield Slam before spending 2 points & unlocking Iron Skin
    expect(validateTalentAllocation(state, 'jug_shield_slam').valid).toBe(false);

    // Spend 1 rank in Iron Skin -> still only 1/2 required points in Juggernaut tree
    const r1 = spendTalentPoint(state, 'jug_iron_skin');
    expect(r1.ok).toBe(true);
    if (r1.ok) state = r1.nextState;
    expect(validateTalentAllocation(state, 'jug_shield_slam').valid).toBe(false);

    // Spend 2nd rank in Iron Skin -> now 2 points in tree & prereq met!
    const r2 = spendTalentPoint(state, 'jug_iron_skin');
    expect(r2.ok).toBe(true);
    if (r2.ok) state = r2.nextState;

    const slam = spendTalentPoint(state, 'jug_shield_slam');
    expect(slam.ok).toBe(true);
    if (slam.ok) state = slam.nextState;

    // Shield Slam has maxRank 1 -> cannot rank up a second time
    const duplicateSlam = spendTalentPoint(state, 'jug_shield_slam');
    expect(duplicateSlam.ok).toBe(false);
  });

  it('supports Omni-Class hybrid athletes investing across Juggernaut, Vanguard, Warden, and Assassin simultaneously', () => {
    let state: CharacterTalentState = {
      availablePoints: { STRENGTH: 4, ENDURANCE: 3, AGILITY: 3 },
      unlockedNodeRanks: {},
    };

    const sequence = [
      // Split Strength points across BOTH Juggernaut and Vanguard
      'jug_iron_skin',
      'jug_iron_skin',
      'van_heavy_handed',
      'van_heavy_handed',
      // Invest Endurance points in Warden sustain aura
      'war_deep_lungs',
      'war_deep_lungs',
      'war_renewal_aura',
      // Invest Agility points in Assassin ambush burst
      'ass_shadowstep_reflexes',
      'ass_shadowstep_reflexes',
      'ass_phantom_strike',
    ];

    for (const nodeId of sequence) {
      const res = spendTalentPoint(state, nodeId);
      expect(res.ok).toBe(true);
      if (res.ok) state = res.nextState;
    }

    expect(state.availablePoints).toEqual({ STRENGTH: 0, ENDURANCE: 0, AGILITY: 0 });

    const agg = aggregateTalentModifiers(state.unlockedNodeRanks);
    expect(agg.armorPct).toBeCloseTo(0.16, 4);
    expect(agg.meleePowerPct).toBeCloseTo(0.16, 4);
    expect(agg.partyHpRegenPctPerSec).toBeCloseTo(0.012, 4);
    expect(agg.dodgeRatingBonus).toBeCloseTo(0.08, 4);
    expect(agg.unlockedSkills.map((s) => s.skillId)).toContain('ass_phantom_strike');
  });

  it('supports spending stat-specific Talent Points across Wisdom, Spirit, Dexterity, and Constitution trees', () => {
    let state: CharacterTalentState = {
      availablePoints: {
        STRENGTH: 0,
        ENDURANCE: 0,
        AGILITY: 0,
        WISDOM: 2,
        SPIRIT: 3,
        DEXTERITY: 1,
        CONSTITUTION: 2,
      },
      unlockedNodeRanks: {},
    };

    // Cannot spend Spirit points on a Wisdom node
    const invalidWisState: CharacterTalentState = {
      availablePoints: { SPIRIT: 5, WISDOM: 0 },
      unlockedNodeRanks: {},
    };
    const invalidWis = validateTalentAllocation(invalidWisState, 'cle_mending_aura');
    expect(invalidWis.valid).toBe(false);
    expect(invalidWis.error).toContain('Insufficient WISDOM Talent Points');

    // Spend in Cleric (Wisdom)
    const rWis = spendTalentPoint(state, 'cle_mending_aura');
    expect(rWis.ok).toBe(true);
    if (rWis.ok) state = rWis.nextState;

    // Spend in Mage (Spirit)
    const rSpr = spendTalentPoint(state, 'mag_arcane_focus');
    expect(rSpr.ok).toBe(true);
    if (rSpr.ok) state = rSpr.nextState;

    // Spend in Acrobat (Dexterity)
    const rDex = spendTalentPoint(state, 'acro_feather_step');
    expect(rDex.ok).toBe(true);
    if (rDex.ok) state = rDex.nextState;

    // Spend in Guardian (Constitution)
    const rCon = spendTalentPoint(state, 'grd_iron_fortitude');
    expect(rCon.ok).toBe(true);
    if (rCon.ok) state = rCon.nextState;

    expect(state.availablePoints.WISDOM).toBe(1);
    expect(state.availablePoints.SPIRIT).toBe(2);
    expect(state.availablePoints.DEXTERITY).toBe(0);
    expect(state.availablePoints.CONSTITUTION).toBe(1);

    const agg = aggregateTalentModifiers(state.unlockedNodeRanks);
    expect(agg.healingPowerMultiplier).toBeCloseTo(0.1, 4);
    expect(agg.healingPowerPct).toBeCloseTo(0.1, 4);
    expect(agg.maxManaBoost).toBeCloseTo(0.1, 4);
    expect(agg.trapEvasion).toBeCloseTo(0.05, 4);
    expect(agg.maxHpPct).toBeCloseTo(0.05, 4);
    expect(agg.pointsSpentByStat.WISDOM).toBe(1);
    expect(agg.pointsSpentByStat.SPIRIT).toBe(1);
    expect(agg.pointsSpentByStat.DEXTERITY).toBe(1);
    expect(agg.pointsSpentByStat.CONSTITUTION).toBe(1);
  });
});
