import { describe, expect, it } from 'vitest';
import {
  CharacterTalentState,
  DEFAULT_TALENT_TREES,
  aggregateTalentCombatModifiers,
  aggregateTalentModifiers,
  canSpendTalentPoint,
  spendTalentPoint,
  validateTalentAllocation,
} from '../src/talent-engine';

describe('talent-engine', () => {
  it('defines all 10 stat-bound multi-class Talent Trees across all holistic stats (55 pts/tree, 110 nodes total)', () => {
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

    const totalNodes = DEFAULT_TALENT_TREES.reduce((sum, t) => sum + t.nodes.length, 0);
    expect(totalNodes).toBe(110);

    for (const tree of DEFAULT_TALENT_TREES) {
      expect(tree.nodes).toHaveLength(11);
      expect(tree.nodes.map((n) => n.tier)).toEqual([1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5]);

      const maxPoints = tree.nodes.reduce((sum, n) => sum + n.maxRank * n.pointCostPerRank, 0);
      expect(maxPoints).toBe(55);

      for (const node of tree.nodes) {
        expect(node.maxRank).toBe(5);
        expect(node.pointCostPerRank).toBe(1);
      }
    }
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
    expect(canSpendTalentPoint(state, 'jug_iron_skin')).toBe(true);
    expect(canSpendTalentPoint(state, 'ass_shadowstep_reflexes')).toBe(false);
  });

  it('enforces tier point requirements, prerequisites, and max rank of 5', () => {
    let state: CharacterTalentState = {
      availablePoints: { STRENGTH: 50, ENDURANCE: 0, AGILITY: 0 },
      unlockedNodeRanks: {},
    };

    // Cannot unlock Tier 2 Bulwark Stance before spending 5 points in Juggernaut tree
    expect(validateTalentAllocation(state, 'jug_bulwark_stance').valid).toBe(false);

    // Spend 4 ranks in Iron Skin -> 4 points in tree, still cannot unlock Tier 2
    for (let i = 0; i < 4; i++) {
      const r = spendTalentPoint(state, 'jug_iron_skin');
      expect(r.ok).toBe(true);
      if (r.ok) state = r.nextState;
    }
    expect(validateTalentAllocation(state, 'jug_bulwark_stance').valid).toBe(false);

    // Spend 5th rank in Iron Skin -> 5 points in tree & prereq met!
    const r5 = spendTalentPoint(state, 'jug_iron_skin');
    expect(r5.ok).toBe(true);
    if (r5.ok) state = r5.nextState;

    // Iron Skin is at maxRank 5 -> cannot rank up a 6th time
    const r6 = spendTalentPoint(state, 'jug_iron_skin');
    expect(r6.ok).toBe(false);
    if (!r6.ok) {
      expect(r6.error).toContain('already at maximum rank');
    }

    // Now Tier 2 Bulwark Stance is valid!
    expect(validateTalentAllocation(state, 'jug_bulwark_stance').valid).toBe(true);
    const b1 = spendTalentPoint(state, 'jug_bulwark_stance');
    expect(b1.ok).toBe(true);
    if (b1.ok) state = b1.nextState;

    // Bone armor is also Tier 2 (prereq Iron Skin, req 5 pts) -> valid
    const bone = spendTalentPoint(state, 'jug_bone_armor');
    expect(bone.ok).toBe(true);
    if (bone.ok) state = bone.nextState;

    // Tier 3 Shield Slam requires 15 points spent in tree -> currently 7 (5 + 1 + 1)
    expect(validateTalentAllocation(state, 'jug_shield_slam').valid).toBe(false);
  });

  it('supports Omni-Class hybrid athletes investing across Juggernaut, Vanguard, Warden, and Assassin simultaneously', () => {
    let state: CharacterTalentState = {
      availablePoints: { STRENGTH: 6, ENDURANCE: 4, AGILITY: 4 },
      unlockedNodeRanks: {},
    };

    const sequence = [
      // Split Strength points across BOTH Juggernaut and Vanguard Tier 1 foundation nodes
      'jug_iron_skin',
      'jug_iron_skin',
      'jug_iron_blood',
      'van_heavy_handed',
      'van_heavy_handed',
      'van_momentum_drive',
      // Invest Endurance points in Warden Tier 1 sustain nodes
      'war_deep_lungs',
      'war_deep_lungs',
      'war_enduring_pace',
      'war_enduring_pace',
      // Invest Agility points in Assassin Tier 1 nodes
      'ass_shadowstep_reflexes',
      'ass_shadowstep_reflexes',
      'ass_deadly_grace',
      'ass_deadly_grace',
    ];

    for (const nodeId of sequence) {
      const res = spendTalentPoint(state, nodeId);
      expect(res.ok).toBe(true);
      if (res.ok) state = res.nextState;
    }

    expect(state.availablePoints).toEqual({ STRENGTH: 0, ENDURANCE: 0, AGILITY: 0 });

    const agg = aggregateTalentCombatModifiers(state.unlockedNodeRanks);
    expect(agg.armorPct).toBeCloseTo(0.16, 4); // 2 * 0.08
    expect(agg.maxHpPct).toBeCloseTo(0.08 + 0.06 + 0.12, 4); // iron_skin(2*0.04) + iron_blood(1*0.06) + war_deep_lungs(2*0.06)
    expect(agg.meleePowerPct).toBeCloseTo(0.16 + 0.05, 4); // van_heavy_handed(2*0.08) + momentum(1*0.05)
    expect(agg.dodgeRatingBonus).toBeCloseTo(0.08, 4); // ass_shadowstep_reflexes(2*0.04)
    expect(agg.critChanceBonus).toBeCloseTo(0.08 + 0.10, 4); // shadowstep(2*0.04) + deadly_grace(2*0.05)
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
