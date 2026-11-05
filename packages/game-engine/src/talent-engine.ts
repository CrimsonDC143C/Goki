import { HolisticStatType, StatType } from './types';

export type TalentGoverningStat = HolisticStatType;

// ============================================================================
// INTERFACES & TALENT DEFINITIONS
// ============================================================================

export type TalentNodeCategory = 'PASSIVE_MODIFIER' | 'ACTIVE_SKILL' | 'KEYSTONE';

export interface TalentStatModifier {
  stat: string;
  valuePerRank: number;
  isPercentage?: boolean;
}

export interface PassiveModifierPerRank {
  maxHpPct?: number;
  maxStaminaPct?: number;
  meleePowerPct?: number;
  armorPct?: number;
  damageMitigationPct?: number;
  armorPenetrationPct?: number;
  attackSpeedPct?: number;
  dodgeRatingBonus?: number;
  critChanceBonus?: number;
  critDamageBonus?: number;
  cooldownHastePct?: number;
  staminaCostReductionPct?: number;
  threatWeightBonus?: number;
  partyHpRegenPctPerSec?: number;
  partyStaminaRegenPerSec?: number;
  partyDamageMitigationPct?: number;
  healingPowerPct?: number;
  hazardResistancePct?: number;
  dungeonLootBonusPct?: number;
  bleedMeleePowerPctOnCrit?: number;
  openingStrikeBonusPct?: number;
  openingShieldMaxHpPct?: number;
  resetCooldownOnKill?: boolean;
  healingPowerMultiplier?: number;
  maxManaBoost?: number;
  trapEvasion?: number;
  defensePct?: number;
  skillPowerPct?: number;
  critDamagePct?: number;
  critChancePct?: number;
  dodgeChancePct?: number;
  attackPowerPct?: number;
  restTimerEfficiencyPct?: number;
  partyBossShieldMaxHpPct?: number;
  partyLootBonusPct?: number;
}

export interface ActiveTalentSkillDefinition {
  skillId: string;
  name: string;
  cooldownSeconds: number;
  staminaCost: number;
  targetType: 'SINGLE_ENEMY' | 'CLEAVE_ENEMIES' | 'PARTY_HEAL';
  damageMultiplier: number;
  hitCount?: number;
  maxTargets?: number;
  bonusCritChance?: number;
  selfShieldMaxHpPct?: number;
  tauntDurationSeconds?: number;
  healMaxHpPct?: number;
}

export interface TalentNodeDefinition {
  id: string;
  treeSlug: string;
  name: string;
  description: string;
  tier: number;
  maxRank: number;
  pointCostPerRank: number;
  requiredTreePointsSpent: number;
  prerequisiteNodeId?: string;
  nodeType: TalentNodeCategory;
  passivePerRank?: PassiveModifierPerRank;
  activeSkill?: ActiveTalentSkillDefinition;
  modifiers?: TalentStatModifier[];
  grantedSkillId?: string;
  keystonePenalty?: TalentStatModifier[];
}

export interface TalentTreeDefinition {
  slug: string;
  name: string;
  governingStat: HolisticStatType;
  archetypeRole: string;
  description: string;
  nodes: TalentNodeDefinition[];
}

export interface CharacterTalentState {
  availablePoints: Partial<Record<HolisticStatType, number>> & Record<string, number>;
  /** Map of nodeId -> unlocked rank (1..maxRank) */
  unlockedNodeRanks: Record<string, number>;
}

export interface TalentValidationResult {
  valid: boolean;
  error?: string;
  governingStat?: HolisticStatType;
  pointCost?: number;
  nextRank?: number;
}

export type SpendTalentPointResult =
  | {
      ok: true;
      governingStat: HolisticStatType;
      nodeId: string;
      newRank: number;
      pointsSpent: number;
      nextState: CharacterTalentState;
    }
  | {
      ok: false;
      error: string;
    };

export interface AggregatedTalentModifiers {
  maxHpPct: number;
  maxStaminaPct: number;
  meleePowerPct: number;
  armorPct: number;
  damageMitigationPct: number;
  armorPenetrationPct: number;
  attackSpeedPct: number;
  dodgeRatingBonus: number;
  critChanceBonus: number;
  critDamageBonus: number;
  cooldownHastePct: number;
  staminaCostReductionPct: number;
  threatWeightBonus: number;
  partyHpRegenPctPerSec: number;
  partyStaminaRegenPerSec: number;
  partyDamageMitigationPct: number;
  healingPowerPct: number;
  hazardResistancePct: number;
  dungeonLootBonusPct: number;
  bleedMeleePowerPctOnCrit: number;
  openingStrikeBonusPct: number;
  openingShieldMaxHpPct: number;
  resetCooldownOnKill: boolean;
  healingPowerMultiplier: number;
  maxManaBoost: number;
  trapEvasion: number;
  defensePct?: number;
  skillPowerPct?: number;
  critDamagePct?: number;
  critChancePct?: number;
  dodgeChancePct?: number;
  attackPowerPct?: number;
  restTimerEfficiencyPct?: number;
  partyBossShieldMaxHpPct?: number;
  partyLootBonusPct?: number;
  unlockedSkills: ActiveTalentSkillDefinition[];
  unlockedKeystones: string[];
  pointsSpentByTree: Record<string, number>;
  pointsSpentByStat: Record<HolisticStatType, number>;
}

export type CombatModifiers = AggregatedTalentModifiers;

// ============================================================================
// BUILT-IN 10 MULTI-CLASS STAT-BOUND TALENT TREES (110 NODES TOTAL, 55 PTS/TREE)
// ============================================================================

export const DEFAULT_TALENT_TREES: readonly TalentTreeDefinition[] = [
  // -------------------- STRENGTH TREES --------------------
  {
    slug: 'juggernaut',
    name: 'Juggernaut',
    governingStat: 'STRENGTH',
    archetypeRole: 'Unstoppable Tanking, Shields & Taunts',
    description: 'Channels raw strength into impenetrable armor, threat generation, and damage barriers.',
    nodes: [
      // Tier 1 (0 spent)
      {
        id: 'jug_iron_skin',
        treeSlug: 'juggernaut',
        name: 'Iron Skin',
        description: '+8% Armor, +4% Max HP, and +15 Threat per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { armorPct: 0.08, maxHpPct: 0.04, threatWeightBonus: 15 },
      },
      {
        id: 'jug_iron_blood',
        treeSlug: 'juggernaut',
        name: 'Iron Blood',
        description: '+6% Max HP and +10 Threat per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxHpPct: 0.06, threatWeightBonus: 10 },
      },
      // Tier 2 (5 spent)
      {
        id: 'jug_bulwark_stance',
        treeSlug: 'juggernaut',
        name: 'Bulwark Stance',
        description: '+5% Damage Mitigation and +25 Threat Weight per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'jug_iron_skin',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { damageMitigationPct: 0.05, threatWeightBonus: 25 },
      },
      {
        id: 'jug_bone_armor',
        treeSlug: 'juggernaut',
        name: 'Bone Armor',
        description: '+6% Armor and +3% Damage Mitigation per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'jug_iron_skin',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { armorPct: 0.06, damageMitigationPct: 0.03 },
      },
      {
        id: 'jug_steadfast_will',
        treeSlug: 'juggernaut',
        name: 'Steadfast Will',
        description: '+5% Max Stamina and +15 Threat per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'jug_iron_blood',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxStaminaPct: 0.05, threatWeightBonus: 15 },
      },
      // Tier 3 (15 spent)
      {
        id: 'jug_crushing_force',
        treeSlug: 'juggernaut',
        name: 'Crushing Force',
        description: '+6% Melee Power and +4% Armor per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'jug_bulwark_stance',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { meleePowerPct: 0.06, armorPct: 0.04 },
      },
      {
        id: 'jug_shield_slam',
        treeSlug: 'juggernaut',
        name: 'Shield Slam',
        description: 'Active Skill: Slams target for 165% melee power, taunting enemies and granting a 12% Max HP shield. +3% Damage Mitigation and +20 Threat per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'jug_bone_armor',
        nodeType: 'ACTIVE_SKILL',
        activeSkill: {
          skillId: 'jug_shield_slam',
          name: 'Shield Slam',
          cooldownSeconds: 8,
          staminaCost: 20,
          targetType: 'SINGLE_ENEMY',
          damageMultiplier: 1.65,
          selfShieldMaxHpPct: 0.12,
          tauntDurationSeconds: 4,
        },
        passivePerRank: { damageMitigationPct: 0.03, threatWeightBonus: 20 },
      },
      {
        id: 'jug_resilient_core',
        treeSlug: 'juggernaut',
        name: 'Resilient Core',
        description: '+6% Max HP and +4% Damage Mitigation per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'jug_steadfast_will',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxHpPct: 0.06, damageMitigationPct: 0.04 },
      },
      // Tier 4 (30 spent)
      {
        id: 'jug_unbreakable_resolve',
        treeSlug: 'juggernaut',
        name: 'Unbreakable Resolve',
        description: '+8% Damage Mitigation and +10% Armor per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'jug_crushing_force',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { damageMitigationPct: 0.08, armorPct: 0.10 },
      },
      {
        id: 'jug_titan_surge',
        treeSlug: 'juggernaut',
        name: 'Titan Surge',
        description: '+8% Max HP and +30 Threat per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'jug_resilient_core',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxHpPct: 0.08, threatWeightBonus: 30 },
      },
      // Tier 5 (40 spent)
      {
        id: 'jug_unstoppable',
        treeSlug: 'juggernaut',
        name: 'Unstoppable Juggernaut',
        description: 'Keystone: Starts every room with a 20% Max HP barrier. +5% Max HP, +5% barrier, and +20 Threat per rank.',
        tier: 5,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 40,
        prerequisiteNodeId: 'jug_shield_slam',
        nodeType: 'KEYSTONE',
        passivePerRank: { maxHpPct: 0.05, openingShieldMaxHpPct: 0.05, threatWeightBonus: 20 },
      },
    ],
  },
  {
    slug: 'vanguard',
    name: 'Vanguard',
    governingStat: 'STRENGTH',
    archetypeRole: 'Heavy Two-Handed Burst & Armor Shattering',
    description: 'Turns heavy lifting power into crushing cleaves and armor-piercing blows.',
    nodes: [
      // Tier 1 (0 spent)
      {
        id: 'van_heavy_handed',
        treeSlug: 'vanguard',
        name: 'Heavy Handed',
        description: '+8% Melee Power per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { meleePowerPct: 0.08 },
      },
      {
        id: 'van_momentum_drive',
        treeSlug: 'vanguard',
        name: 'Momentum Drive',
        description: '+5% Melee Power and +3% Attack Speed per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { meleePowerPct: 0.05, attackSpeedPct: 0.03 },
      },
      // Tier 2 (5 spent)
      {
        id: 'van_sundering_strikes',
        treeSlug: 'vanguard',
        name: 'Sundering Strikes',
        description: 'Attacks bypass 12% of enemy armor per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'van_heavy_handed',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { armorPenetrationPct: 0.12 },
      },
      {
        id: 'van_shatter_guard',
        treeSlug: 'vanguard',
        name: 'Shatter Guard',
        description: '+6% Armor Penetration and +4% Crit Damage per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'van_heavy_handed',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { armorPenetrationPct: 0.06, critDamageBonus: 0.04 },
      },
      {
        id: 'van_brutal_cadence',
        treeSlug: 'vanguard',
        name: 'Brutal Cadence',
        description: '+5% Attack Speed and +4% Melee Power per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'van_momentum_drive',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { attackSpeedPct: 0.05, meleePowerPct: 0.04 },
      },
      // Tier 3 (15 spent)
      {
        id: 'van_crushing_cleave_mastery',
        treeSlug: 'vanguard',
        name: 'Crushing Mastery',
        description: '+8% Armor Penetration and +6% Melee Power per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'van_sundering_strikes',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { armorPenetrationPct: 0.08, meleePowerPct: 0.06 },
      },
      {
        id: 'van_colossus_cleave',
        treeSlug: 'vanguard',
        name: 'Colossus Cleave',
        description: 'Active Skill: Massive sweeping blow dealing 210% melee damage to up to 2 enemies. +5% Melee Power and +4% Armor Penetration per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'van_shatter_guard',
        nodeType: 'ACTIVE_SKILL',
        activeSkill: {
          skillId: 'van_colossus_cleave',
          name: 'Colossus Cleave',
          cooldownSeconds: 9,
          staminaCost: 24,
          targetType: 'CLEAVE_ENEMIES',
          damageMultiplier: 2.1,
          maxTargets: 2,
        },
        passivePerRank: { meleePowerPct: 0.05, armorPenetrationPct: 0.04 },
      },
      {
        id: 'van_unyielding_impact',
        treeSlug: 'vanguard',
        name: 'Unyielding Impact',
        description: '+6% Crit Damage and +5% Melee Power per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'van_brutal_cadence',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { critDamageBonus: 0.06, meleePowerPct: 0.05 },
      },
      // Tier 4 (30 spent)
      {
        id: 'van_armor_crusher',
        treeSlug: 'vanguard',
        name: 'Armor Crusher',
        description: '+10% Armor Penetration and +8% Melee Power per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'van_crushing_cleave_mastery',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { armorPenetrationPct: 0.10, meleePowerPct: 0.08 },
      },
      {
        id: 'van_wrath_execution',
        treeSlug: 'vanguard',
        name: 'Wrath Execution',
        description: '+12% Crit Damage and +5% Attack Speed per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'van_unyielding_impact',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { critDamageBonus: 0.12, attackSpeedPct: 0.05 },
      },
      // Tier 5 (40 spent)
      {
        id: 'van_titans_grip',
        treeSlug: 'vanguard',
        name: "Titan's Grip",
        description: 'Keystone: +15% Melee Power and +35% Critical Strike Damage. +5% Melee Power and +8% Crit Damage per rank.',
        tier: 5,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 40,
        prerequisiteNodeId: 'van_colossus_cleave',
        nodeType: 'KEYSTONE',
        passivePerRank: { meleePowerPct: 0.05, critDamageBonus: 0.08 },
      },
    ],
  },

  // -------------------- ENDURANCE TREES --------------------
  {
    slug: 'warden',
    name: 'Warden',
    governingStat: 'ENDURANCE',
    archetypeRole: 'Party-Wide Stamina Sustain & Regeneration Aura',
    description: 'Uses elite aerobic conditioning to sustain and heal the entire expedition party.',
    nodes: [
      // Tier 1 (0 spent)
      {
        id: 'war_deep_lungs',
        treeSlug: 'warden',
        name: 'Deep Lungs',
        description: '+10% Max Stamina and +6% Max HP per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxStaminaPct: 0.10, maxHpPct: 0.06 },
      },
      {
        id: 'war_enduring_pace',
        treeSlug: 'warden',
        name: 'Enduring Pace',
        description: '+8% Max Stamina and +1.5 Stamina Regen per sec per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxStaminaPct: 0.08, partyStaminaRegenPerSec: 1.5 },
      },
      // Tier 2 (5 spent)
      {
        id: 'war_renewal_aura',
        treeSlug: 'warden',
        name: 'Renewal Aura',
        description: 'Regenerates 1.2% Max HP and 2.5 Stamina per second for all party members per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'war_deep_lungs',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { partyHpRegenPctPerSec: 0.012, partyStaminaRegenPerSec: 2.5 },
      },
      {
        id: 'war_revitalizing_touch',
        treeSlug: 'warden',
        name: 'Revitalizing Touch',
        description: '+8% Healing Power and +4% Max Stamina per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'war_deep_lungs',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { healingPowerPct: 0.08, maxStaminaPct: 0.04 },
      },
      {
        id: 'war_iron_stride',
        treeSlug: 'warden',
        name: 'Iron Stride',
        description: '+6% Max HP and +5% Hazard Resistance per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'war_enduring_pace',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxHpPct: 0.06, hazardResistancePct: 0.05 },
      },
      // Tier 3 (15 spent)
      {
        id: 'war_soothing_presence',
        treeSlug: 'warden',
        name: 'Soothing Presence',
        description: '+1.0% Party HP Regen per sec and +2% Party Damage Mitigation per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'war_renewal_aura',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { partyHpRegenPctPerSec: 0.01, partyDamageMitigationPct: 0.02 },
      },
      {
        id: 'war_second_wind_hymn',
        treeSlug: 'warden',
        name: 'Second Wind Hymn',
        description: 'Active Skill: Restores 18% Max HP to the most injured party member. +6% Healing Power and +1.0 Stamina Regen per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'war_revitalizing_touch',
        nodeType: 'ACTIVE_SKILL',
        activeSkill: {
          skillId: 'war_second_wind_hymn',
          name: 'Second Wind Hymn',
          cooldownSeconds: 10,
          staminaCost: 22,
          targetType: 'PARTY_HEAL',
          damageMultiplier: 0,
          healMaxHpPct: 0.18,
        },
        passivePerRank: { healingPowerPct: 0.06, partyStaminaRegenPerSec: 1.0 },
      },
      {
        id: 'war_staunch_recovery',
        treeSlug: 'warden',
        name: 'Staunch Recovery',
        description: '+6% Max Stamina and +3% Damage Mitigation per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'war_iron_stride',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxStaminaPct: 0.06, damageMitigationPct: 0.03 },
      },
      // Tier 4 (30 spent)
      {
        id: 'war_tranquil_bastion',
        treeSlug: 'warden',
        name: 'Tranquil Bastion',
        description: '+4% Party Damage Mitigation and +8% Healing Power per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'war_soothing_presence',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { partyDamageMitigationPct: 0.04, healingPowerPct: 0.08 },
      },
      {
        id: 'war_everlasting_breath',
        treeSlug: 'warden',
        name: 'Everlasting Breath',
        description: '+12% Max Stamina and +6% Max HP per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'war_staunch_recovery',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxStaminaPct: 0.12, maxHpPct: 0.06 },
      },
      // Tier 5 (40 spent)
      {
        id: 'war_undying_sanctuary',
        treeSlug: 'warden',
        name: 'Undying Sanctuary',
        description: 'Keystone: Grants all allies +8% Damage Mitigation and +40% Healing Power. +2% Mitigation and +10% Healing Power per rank.',
        tier: 5,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 40,
        prerequisiteNodeId: 'war_second_wind_hymn',
        nodeType: 'KEYSTONE',
        passivePerRank: { partyDamageMitigationPct: 0.02, healingPowerPct: 0.10 },
      },
    ],
  },
  {
    slug: 'outrider',
    name: 'Outrider',
    governingStat: 'ENDURANCE',
    archetypeRole: 'Long-Expedition Buffs & Trap Evasion',
    description: 'Masters pacing and awareness to evade dungeon hazards and maximize expedition yield.',
    nodes: [
      // Tier 1 (0 spent)
      {
        id: 'out_trailblazer',
        treeSlug: 'outrider',
        name: 'Trailblazer',
        description: '+18% Dungeon Trap & Hazard Resistance per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { hazardResistancePct: 0.18 },
      },
      {
        id: 'out_swift_stride',
        treeSlug: 'outrider',
        name: 'Swift Stride',
        description: '+6% Dodge Rating and +5% Hazard Resistance per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.06, hazardResistancePct: 0.05 },
      },
      // Tier 2 (5 spent)
      {
        id: 'out_resourceful_pace',
        treeSlug: 'outrider',
        name: 'Resourceful Pace',
        description: '-12% Skill Stamina Cost and +3% Dodge per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'out_trailblazer',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { staminaCostReductionPct: 0.12, dodgeRatingBonus: 0.03 },
      },
      {
        id: 'out_scouts_instinct',
        treeSlug: 'outrider',
        name: "Scout's Instinct",
        description: '+10% Dungeon Loot Bonus and +6% Hazard Resistance per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'out_trailblazer',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dungeonLootBonusPct: 0.10, hazardResistancePct: 0.06 },
      },
      {
        id: 'out_nimble_feint',
        treeSlug: 'outrider',
        name: 'Nimble Feint',
        description: '+5% Dodge Rating and -8% Skill Stamina Cost per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'out_swift_stride',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.05, staminaCostReductionPct: 0.08 },
      },
      // Tier 3 (15 spent)
      {
        id: 'out_dungeon_mastery',
        treeSlug: 'outrider',
        name: 'Dungeon Mastery',
        description: '-10% Stamina Cost and +8% Hazard Resistance per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'out_resourceful_pace',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { staminaCostReductionPct: 0.10, hazardResistancePct: 0.08 },
      },
      {
        id: 'out_evasive_maneuver',
        treeSlug: 'outrider',
        name: 'Harrying Shot',
        description: 'Active Skill: Swift tactical strike dealing 155% damage with low stamina expenditure. +3% Dodge and +4% Dungeon Loot Bonus per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'out_scouts_instinct',
        nodeType: 'ACTIVE_SKILL',
        activeSkill: {
          skillId: 'out_evasive_maneuver',
          name: 'Harrying Shot',
          cooldownSeconds: 6,
          staminaCost: 12,
          targetType: 'SINGLE_ENEMY',
          damageMultiplier: 1.55,
        },
        passivePerRank: { dodgeRatingBonus: 0.03, dungeonLootBonusPct: 0.04 },
      },
      {
        id: 'out_wilderness_cunning',
        treeSlug: 'outrider',
        name: 'Wilderness Cunning',
        description: '+6% Dungeon Loot Bonus and +4% Dodge per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'out_nimble_feint',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dungeonLootBonusPct: 0.06, dodgeRatingBonus: 0.04 },
      },
      // Tier 4 (30 spent)
      {
        id: 'out_apex_explorer',
        treeSlug: 'outrider',
        name: 'Apex Explorer',
        description: '+15% Hazard Resistance and +10% Dungeon Loot Bonus per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'out_dungeon_mastery',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { hazardResistancePct: 0.15, dungeonLootBonusPct: 0.10 },
      },
      {
        id: 'out_shadow_stalker',
        treeSlug: 'outrider',
        name: 'Shadow Stalker',
        description: '+8% Dodge Rating and -12% Stamina Cost per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'out_wilderness_cunning',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.08, staminaCostReductionPct: 0.12 },
      },
      // Tier 5 (40 spent)
      {
        id: 'out_master_pathfinder',
        treeSlug: 'outrider',
        name: 'Master Pathfinder',
        description: 'Keystone: +25% Trap Resistance and +20% Dungeon Loot Bonus. +8% Hazard Resistance and +6% Loot Bonus per rank.',
        tier: 5,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 40,
        prerequisiteNodeId: 'out_evasive_maneuver',
        nodeType: 'KEYSTONE',
        passivePerRank: { hazardResistancePct: 0.08, dungeonLootBonusPct: 0.06 },
      },
    ],
  },

  // -------------------- AGILITY / STAMINA TREES --------------------
  {
    slug: 'berserker',
    name: 'Berserker',
    governingStat: 'AGILITY',
    archetypeRole: 'Frenzied Attack Speed & Critical Bleeds',
    description: 'Harnesses anaerobic VO2 Max intensity for relentless attack cadence and lacerations.',
    nodes: [
      // Tier 1 (0 spent)
      {
        id: 'ber_bloodlust_tempo',
        treeSlug: 'berserker',
        name: 'Bloodlust Tempo',
        description: '+9% Attack Speed per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { attackSpeedPct: 0.09 },
      },
      {
        id: 'ber_fury_unbound',
        treeSlug: 'berserker',
        name: 'Fury Unbound',
        description: '+6% Melee Power and +4% Attack Speed per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { meleePowerPct: 0.06, attackSpeedPct: 0.04 },
      },
      // Tier 2 (5 spent)
      {
        id: 'ber_serrated_strikes',
        treeSlug: 'berserker',
        name: 'Serrated Strikes',
        description: 'Critical strikes inflict Bleed dealing 30% Melee Power per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'ber_bloodlust_tempo',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { bleedMeleePowerPctOnCrit: 0.30 },
      },
      {
        id: 'ber_blood_surge',
        treeSlug: 'berserker',
        name: 'Blood Surge',
        description: '+5% Crit Chance and +6% Attack Speed per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'ber_bloodlust_tempo',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { critChanceBonus: 0.05, attackSpeedPct: 0.06 },
      },
      {
        id: 'ber_relentless_wrath',
        treeSlug: 'berserker',
        name: 'Relentless Wrath',
        description: '+6% Melee Power and +5% Crit Damage per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'ber_fury_unbound',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { meleePowerPct: 0.06, critDamageBonus: 0.05 },
      },
      // Tier 3 (15 spent)
      {
        id: 'ber_lacerating_flurry',
        treeSlug: 'berserker',
        name: 'Lacerating Strikes',
        description: '+25% Bleed Melee Power on Crit and +4% Attack Speed per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'ber_serrated_strikes',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { bleedMeleePowerPctOnCrit: 0.25, attackSpeedPct: 0.04 },
      },
      {
        id: 'ber_frenzied_flurry',
        treeSlug: 'berserker',
        name: 'Frenzied Flurry',
        description: 'Active Skill: Unleashes 3 rapid strikes each dealing 75% melee damage. +4% Attack Speed and +3% Crit Chance per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'ber_blood_surge',
        nodeType: 'ACTIVE_SKILL',
        activeSkill: {
          skillId: 'ber_frenzied_flurry',
          name: 'Frenzied Flurry',
          cooldownSeconds: 7,
          staminaCost: 20,
          targetType: 'SINGLE_ENEMY',
          damageMultiplier: 0.75,
          hitCount: 3,
        },
        passivePerRank: { attackSpeedPct: 0.04, critChanceBonus: 0.03 },
      },
      {
        id: 'ber_carnage_rush',
        treeSlug: 'berserker',
        name: 'Carnage Rush',
        description: '+8% Crit Damage and +5% Melee Power per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'ber_relentless_wrath',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { critDamageBonus: 0.08, meleePowerPct: 0.05 },
      },
      // Tier 4 (30 spent)
      {
        id: 'ber_gushing_wounds',
        treeSlug: 'berserker',
        name: 'Gushing Wounds',
        description: '+30% Bleed Melee Power and +6% Crit Chance per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'ber_lacerating_flurry',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { bleedMeleePowerPctOnCrit: 0.30, critChanceBonus: 0.06 },
      },
      {
        id: 'ber_berserk_rage',
        treeSlug: 'berserker',
        name: 'Berserk Rage',
        description: '+12% Attack Speed and +8% Melee Power per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'ber_carnage_rush',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { attackSpeedPct: 0.12, meleePowerPct: 0.08 },
      },
      // Tier 5 (40 spent)
      {
        id: 'ber_avatar_of_carnage',
        treeSlug: 'berserker',
        name: 'Avatar of Carnage',
        description: 'Keystone: +12% Attack Speed and +8% Critical Strike Chance. +5% Attack Speed and +4% Crit Chance per rank.',
        tier: 5,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 40,
        prerequisiteNodeId: 'ber_frenzied_flurry',
        nodeType: 'KEYSTONE',
        passivePerRank: { attackSpeedPct: 0.05, critChanceBonus: 0.04 },
      },
    ],
  },
  {
    slug: 'assassin',
    name: 'Assassin',
    governingStat: 'AGILITY',
    archetypeRole: 'High Evasion, Opening Burst & Cooldown Resets',
    description: 'Converts explosive sprint power into lethal opening ambushes and elusive footwork.',
    nodes: [
      // Tier 1 (0 spent)
      {
        id: 'ass_shadowstep_reflexes',
        treeSlug: 'assassin',
        name: 'Shadowstep Reflexes',
        description: '+4% Dodge Rating and +4% Critical Strike Chance per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.04, critChanceBonus: 0.04 },
      },
      {
        id: 'ass_deadly_grace',
        treeSlug: 'assassin',
        name: 'Deadly Grace',
        description: '+5% Crit Chance and +3% Attack Speed per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { critChanceBonus: 0.05, attackSpeedPct: 0.03 },
      },
      // Tier 2 (5 spent)
      {
        id: 'ass_ambush_lethality',
        treeSlug: 'assassin',
        name: 'Ambush Lethality',
        description: 'Opening strike in each room deals +35% bonus damage per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'ass_shadowstep_reflexes',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { openingStrikeBonusPct: 0.35 },
      },
      {
        id: 'ass_poison_edge',
        treeSlug: 'assassin',
        name: 'Poisoned Edge',
        description: '+8% Crit Damage and +4% Armor Penetration per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'ass_shadowstep_reflexes',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { critDamageBonus: 0.08, armorPenetrationPct: 0.04 },
      },
      {
        id: 'ass_smoke_veil',
        treeSlug: 'assassin',
        name: 'Smoke Veil',
        description: '+5% Dodge Rating and +4% Cooldown Haste per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'ass_deadly_grace',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.05, cooldownHastePct: 0.04 },
      },
      // Tier 3 (15 spent)
      {
        id: 'ass_first_blood',
        treeSlug: 'assassin',
        name: 'First Blood',
        description: '+30% Opening Strike Bonus and +4% Crit Chance per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'ass_ambush_lethality',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { openingStrikeBonusPct: 0.30, critChanceBonus: 0.04 },
      },
      {
        id: 'ass_phantom_strike',
        treeSlug: 'assassin',
        name: 'Phantom Strike',
        description: 'Active Skill: Precision strike dealing 205% melee damage with +25% bonus crit chance. +8% Crit Damage and +4% Cooldown Haste per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'ass_poison_edge',
        nodeType: 'ACTIVE_SKILL',
        activeSkill: {
          skillId: 'ass_phantom_strike',
          name: 'Phantom Strike',
          cooldownSeconds: 8,
          staminaCost: 18,
          targetType: 'SINGLE_ENEMY',
          damageMultiplier: 2.05,
          bonusCritChance: 0.25,
        },
        passivePerRank: { critDamageBonus: 0.08, cooldownHastePct: 0.04 },
      },
      {
        id: 'ass_shadow_dance',
        treeSlug: 'assassin',
        name: 'Shadow Dance',
        description: '+6% Dodge Rating and +5% Attack Speed per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'ass_smoke_veil',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.06, attackSpeedPct: 0.05 },
      },
      // Tier 4 (30 spent)
      {
        id: 'ass_nightfall_execution',
        treeSlug: 'assassin',
        name: 'Nightfall Execution',
        description: '+40% Opening Strike Bonus and +12% Crit Damage per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'ass_first_blood',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { openingStrikeBonusPct: 0.40, critDamageBonus: 0.12 },
      },
      {
        id: 'ass_ghost_reflex',
        treeSlug: 'assassin',
        name: 'Ghost Reflex',
        description: '+8% Dodge Rating and +8% Cooldown Haste per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'ass_shadow_dance',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.08, cooldownHastePct: 0.08 },
      },
      // Tier 5 (40 spent)
      {
        id: 'ass_executioners_reset',
        treeSlug: 'assassin',
        name: "Executioner's Reset",
        description: 'Keystone: +18% Skill Cooldown Haste and resets active skill cooldowns on takedown. +6% Haste and +10% Crit Damage per rank.',
        tier: 5,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 40,
        prerequisiteNodeId: 'ass_phantom_strike',
        nodeType: 'KEYSTONE',
        passivePerRank: { cooldownHastePct: 0.06, critDamageBonus: 0.10, resetCooldownOnKill: true },
      },
    ],
  },

  // -------------------- WISDOM TREES --------------------
  {
    slug: 'cleric',
    name: 'Cleric',
    governingStat: 'WISDOM',
    archetypeRole: 'Divine Healing & Restoration',
    description: 'Channels inner wisdom and holistic recovery into potent healing multipliers and party preservation.',
    nodes: [
      // Tier 1 (0 spent)
      {
        id: 'cle_mending_aura',
        treeSlug: 'cleric',
        name: 'Mending Aura',
        description: '+10% Healing Power per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: {
          healingPowerMultiplier: 0.1,
          healingPowerPct: 0.1,
        },
        modifiers: [{ stat: 'healingPowerPct', valuePerRank: 0.1, isPercentage: true }],
      },
      {
        id: 'cle_inner_radiance',
        treeSlug: 'cleric',
        name: 'Inner Radiance',
        description: '+6% Max HP and +5% Healing Power per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxHpPct: 0.06, healingPowerPct: 0.05 },
      },
      // Tier 2 (5 spent)
      {
        id: 'cle_sacred_vitality',
        treeSlug: 'cleric',
        name: 'Sacred Vitality',
        description: 'Increases max HP by 4% per rank and post-set recovery.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'cle_mending_aura',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: {
          maxHpPct: 0.04,
        },
        modifiers: [{ stat: 'maxHpPct', valuePerRank: 0.04, isPercentage: true }],
      },
      {
        id: 'cle_blessed_focus',
        treeSlug: 'cleric',
        name: 'Blessed Focus',
        description: '+8% Healing Power and +5% Rest Timer Efficiency per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'cle_mending_aura',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { healingPowerPct: 0.08, restTimerEfficiencyPct: 0.05 },
      },
      {
        id: 'cle_rejuvenation',
        treeSlug: 'cleric',
        name: 'Rejuvenation',
        description: '+5% Max HP and +4% Damage Mitigation per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'cle_inner_radiance',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxHpPct: 0.05, damageMitigationPct: 0.04 },
      },
      // Tier 3 (15 spent)
      {
        id: 'cle_hallowed_ground',
        treeSlug: 'cleric',
        name: 'Hallowed Ground',
        description: '+6% Max HP and +8% Healing Power per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'cle_sacred_vitality',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxHpPct: 0.06, healingPowerPct: 0.08 },
      },
      {
        id: 'cle_divine_intervention',
        treeSlug: 'cleric',
        name: 'Divine Light',
        description: 'Active Skill: Restores 25% Max HP and cleanses fatigue. +8% Healing Power and +5% Rest Timer Efficiency per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'cle_blessed_focus',
        nodeType: 'ACTIVE_SKILL',
        modifiers: [],
        grantedSkillId: 'skill_divine_light',
        activeSkill: {
          skillId: 'skill_divine_light',
          name: 'Divine Light',
          cooldownSeconds: 12,
          staminaCost: 20,
          targetType: 'PARTY_HEAL',
          damageMultiplier: 0,
          healMaxHpPct: 0.25,
        },
        passivePerRank: { healingPowerPct: 0.08, restTimerEfficiencyPct: 0.05 },
      },
      {
        id: 'cle_guardian_spirit',
        treeSlug: 'cleric',
        name: 'Guardian Spirit',
        description: '+5% Party Damage Mitigation and +5% Max HP per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'cle_rejuvenation',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { partyDamageMitigationPct: 0.05, maxHpPct: 0.05 },
      },
      // Tier 4 (30 spent)
      {
        id: 'cle_seraphs_embrace',
        treeSlug: 'cleric',
        name: "Seraph's Embrace",
        description: '+12% Healing Power and +6% Max HP per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'cle_hallowed_ground',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { healingPowerPct: 0.12, maxHpPct: 0.06 },
      },
      {
        id: 'cle_celestial_ward',
        treeSlug: 'cleric',
        name: 'Celestial Ward',
        description: '+8% Party Damage Mitigation and +10% Rest Efficiency per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'cle_guardian_spirit',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { partyDamageMitigationPct: 0.08, restTimerEfficiencyPct: 0.10 },
      },
      // Tier 5 (40 spent)
      {
        id: 'cle_seraphic_covenant',
        treeSlug: 'cleric',
        name: 'Seraphic Grace',
        description: 'Keystone: Increases Rest Timer efficiency by +20% and Max HP by +12%, at -5% Attack Power. +6% Rest Efficiency, +4% Max HP, and +8% Healing Power per rank.',
        tier: 5,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 40,
        prerequisiteNodeId: 'cle_divine_intervention',
        nodeType: 'KEYSTONE',
        passivePerRank: {
          restTimerEfficiencyPct: 0.06,
          maxHpPct: 0.04,
          healingPowerPct: 0.08,
          attackPowerPct: -0.01,
          meleePowerPct: -0.01,
        },
        modifiers: [
          { stat: 'restTimerEfficiencyPct', valuePerRank: 0.2, isPercentage: true },
          { stat: 'maxHpPct', valuePerRank: 0.12, isPercentage: true },
        ],
        keystonePenalty: [{ stat: 'attackPowerPct', valuePerRank: -0.05, isPercentage: true }],
      },
    ],
  },

  // -------------------- SPIRIT TREES --------------------
  {
    slug: 'mage',
    name: 'Mage',
    governingStat: 'SPIRIT',
    archetypeRole: 'Arcane Focus & Mana Mastery',
    description: 'Channels mindfulness, meditation, and spiritual energy into expanded mana pools and spellcasting.',
    nodes: [
      // Tier 1 (0 spent)
      {
        id: 'mag_arcane_focus',
        treeSlug: 'mage',
        name: 'Arcane Focus',
        description: '+10% Max Mana per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: {
          maxManaBoost: 0.1,
        },
        modifiers: [{ stat: 'maxManaBoost', valuePerRank: 0.1, isPercentage: true }],
      },
      {
        id: 'mag_mystic_intellect',
        treeSlug: 'mage',
        name: 'Mystic Intellect',
        description: '+6% Skill Power and +5% Max Mana per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { skillPowerPct: 0.06, maxManaBoost: 0.05 },
      },
      // Tier 2 (5 spent)
      {
        id: 'mag_astral_conduit',
        treeSlug: 'mage',
        name: 'Astral Conduit',
        description: 'Increases critical damage by 10% per rank through arcane resonance.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'mag_arcane_focus',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: {
          critDamageBonus: 0.1,
          critDamagePct: 0.1,
        },
        modifiers: [{ stat: 'critDamagePct', valuePerRank: 0.1, isPercentage: true }],
      },
      {
        id: 'mag_arcane_infusion',
        treeSlug: 'mage',
        name: 'Arcane Infusion',
        description: '+6% Skill Power and +5% Crit Chance per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'mag_arcane_focus',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { skillPowerPct: 0.06, critChanceBonus: 0.05 },
      },
      {
        id: 'mag_aether_shield',
        treeSlug: 'mage',
        name: 'Aether Shield',
        description: '+5% Damage Mitigation and +6% Max Mana per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'mag_mystic_intellect',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { damageMitigationPct: 0.05, maxManaBoost: 0.06 },
      },
      // Tier 3 (15 spent)
      {
        id: 'mag_resonant_cascade',
        treeSlug: 'mage',
        name: 'Resonant Cascade',
        description: '+12% Crit Damage and +6% Skill Power per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'mag_astral_conduit',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { critDamageBonus: 0.12, skillPowerPct: 0.06 },
      },
      {
        id: 'mag_supernova_blast',
        treeSlug: 'mage',
        name: 'Arcane Nova',
        description: 'Active Skill: Unleashes a 220% Spirit burst across all targets. +6% Skill Power and +6% Crit Damage per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'mag_arcane_infusion',
        nodeType: 'ACTIVE_SKILL',
        modifiers: [],
        grantedSkillId: 'skill_arcane_nova',
        activeSkill: {
          skillId: 'skill_arcane_nova',
          name: 'Arcane Nova',
          cooldownSeconds: 10,
          staminaCost: 25,
          targetType: 'CLEAVE_ENEMIES',
          damageMultiplier: 2.2,
          maxTargets: 5,
        },
        passivePerRank: { skillPowerPct: 0.06, critDamageBonus: 0.06 },
      },
      {
        id: 'mag_spirit_surge',
        treeSlug: 'mage',
        name: 'Spirit Surge',
        description: '+8% Max Mana and +5% Cooldown Haste per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'mag_aether_shield',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxManaBoost: 0.08, cooldownHastePct: 0.05 },
      },
      // Tier 4 (30 spent)
      {
        id: 'mag_astral_apotheosis',
        treeSlug: 'mage',
        name: 'Astral Apotheosis',
        description: '+15% Crit Damage and +10% Skill Power per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'mag_resonant_cascade',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { critDamageBonus: 0.15, skillPowerPct: 0.10 },
      },
      {
        id: 'mag_mana_overload',
        treeSlug: 'mage',
        name: 'Mana Overload',
        description: '+12% Skill Power and +8% Cooldown Haste per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'mag_spirit_surge',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { skillPowerPct: 0.12, cooldownHastePct: 0.08 },
      },
      // Tier 5 (40 spent)
      {
        id: 'mag_archmage_ascension',
        treeSlug: 'mage',
        name: 'Archmage Singularity',
        description: 'Keystone: +25% Skill Power and +15% Crit Damage, at the cost of -8% Physical Defense. +8% Skill Power and +8% Crit Damage per rank.',
        tier: 5,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 40,
        prerequisiteNodeId: 'mag_supernova_blast',
        nodeType: 'KEYSTONE',
        passivePerRank: {
          skillPowerPct: 0.08,
          critDamageBonus: 0.08,
          critDamagePct: 0.08,
          defensePct: -0.01,
          armorPct: -0.01,
        },
        modifiers: [
          { stat: 'skillPowerPct', valuePerRank: 0.25, isPercentage: true },
          { stat: 'critDamagePct', valuePerRank: 0.15, isPercentage: true },
        ],
        keystonePenalty: [{ stat: 'defensePct', valuePerRank: -0.08, isPercentage: true }],
      },
    ],
  },

  // -------------------- DEXTERITY TREES --------------------
  {
    slug: 'acrobat',
    name: 'Acrobat',
    governingStat: 'DEXTERITY',
    archetypeRole: 'Acrobatic Reflexes & Trap Evasion',
    description: 'Leverages calisthenics, climbing, and supreme motor coordination for agile evasion.',
    nodes: [
      // Tier 1 (0 spent)
      {
        id: 'acro_feather_step',
        treeSlug: 'acrobat',
        name: 'Feather Step',
        description: '+5% Trap Evasion and +3% Dodge Rating per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: {
          trapEvasion: 0.05,
          dodgeRatingBonus: 0.03,
        },
        modifiers: [{ stat: 'trapEvasion', valuePerRank: 0.05, isPercentage: true }],
      },
      {
        id: 'acro_fluid_movement',
        treeSlug: 'acrobat',
        name: 'Fluid Movement',
        description: '+5% Dodge Rating and +4% Attack Speed per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.05, attackSpeedPct: 0.04 },
      },
      // Tier 2 (5 spent)
      {
        id: 'acro_wind_dancer',
        treeSlug: 'acrobat',
        name: 'Wind Dancer',
        description: 'Increases critical hit chance by 3% per rank during fluid combos.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'acro_feather_step',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: {
          critChanceBonus: 0.03,
          critChancePct: 0.03,
        },
        modifiers: [{ stat: 'critChancePct', valuePerRank: 0.03, isPercentage: true }],
      },
      {
        id: 'acro_aerial_poise',
        treeSlug: 'acrobat',
        name: 'Aerial Poise',
        description: '+5% Dodge Rating and +6% Trap Evasion per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'acro_feather_step',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.05, trapEvasion: 0.06 },
      },
      {
        id: 'acro_quick_reflexes',
        treeSlug: 'acrobat',
        name: 'Quick Reflexes',
        description: '+5% Attack Speed and +4% Dodge Rating per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'acro_fluid_movement',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { attackSpeedPct: 0.05, dodgeRatingBonus: 0.04 },
      },
      // Tier 3 (15 spent)
      {
        id: 'acro_kinetic_momentum',
        treeSlug: 'acrobat',
        name: 'Kinetic Momentum',
        description: '+5% Crit Chance and +6% Crit Damage per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'acro_wind_dancer',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { critChanceBonus: 0.05, critDamageBonus: 0.06 },
      },
      {
        id: 'acro_mirage_vault',
        treeSlug: 'acrobat',
        name: 'Mirage Vault',
        description: 'Active Skill: Evades the next attack and counters for 160% DEX damage. +4% Dodge Rating and +4% Attack Speed per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'acro_aerial_poise',
        nodeType: 'ACTIVE_SKILL',
        modifiers: [],
        grantedSkillId: 'skill_mirage_vault',
        activeSkill: {
          skillId: 'skill_mirage_vault',
          name: 'Mirage Vault',
          cooldownSeconds: 8,
          staminaCost: 16,
          targetType: 'SINGLE_ENEMY',
          damageMultiplier: 1.6,
          bonusCritChance: 0.2,
        },
        passivePerRank: { dodgeRatingBonus: 0.04, attackSpeedPct: 0.04 },
      },
      {
        id: 'acro_nimble_flow',
        treeSlug: 'acrobat',
        name: 'Nimble Flow',
        description: '+6% Dodge Rating and +5% Attack Speed per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'acro_quick_reflexes',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.06, attackSpeedPct: 0.05 },
      },
      // Tier 4 (30 spent)
      {
        id: 'acro_graceful_strikes',
        treeSlug: 'acrobat',
        name: 'Graceful Strikes',
        description: '+6% Crit Chance and +10% Crit Damage per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'acro_kinetic_momentum',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { critChanceBonus: 0.06, critDamageBonus: 0.10 },
      },
      {
        id: 'acro_cyclone_agility',
        treeSlug: 'acrobat',
        name: 'Cyclone Agility',
        description: '+8% Dodge Rating and +8% Attack Speed per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'acro_nimble_flow',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.08, attackSpeedPct: 0.08 },
      },
      // Tier 5 (40 spent)
      {
        id: 'acro_phantom_equilibrium',
        treeSlug: 'acrobat',
        name: 'Phantom Poise',
        description: 'Keystone: +15% Dodge Chance and +15% Attack Speed, at the cost of -8% Max HP. +5% Dodge Rating and +5% Attack Speed per rank.',
        tier: 5,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 40,
        prerequisiteNodeId: 'acro_mirage_vault',
        nodeType: 'KEYSTONE',
        passivePerRank: {
          dodgeRatingBonus: 0.05,
          dodgeChancePct: 0.05,
          attackSpeedPct: 0.05,
          maxHpPct: -0.01,
        },
        modifiers: [
          { stat: 'dodgeChancePct', valuePerRank: 0.15, isPercentage: true },
          { stat: 'attackSpeedPct', valuePerRank: 0.15, isPercentage: true },
        ],
        keystonePenalty: [{ stat: 'maxHpPct', valuePerRank: -0.08, isPercentage: true }],
      },
    ],
  },

  // -------------------- CONSTITUTION TREES --------------------
  {
    slug: 'guardian',
    name: 'Guardian',
    governingStat: 'CONSTITUTION',
    archetypeRole: 'Warden / Tank Fortitude',
    description: 'Hardens physical vitality and maximum hit points through deep sleep and restorative recovery.',
    nodes: [
      // Tier 1 (0 spent)
      {
        id: 'grd_iron_fortitude',
        treeSlug: 'guardian',
        name: 'Iron Fortitude',
        description: '+5% Max HP and +3% Armor per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: {
          maxHpPct: 0.05,
          armorPct: 0.03,
        },
        modifiers: [{ stat: 'maxHpPct', valuePerRank: 0.05, isPercentage: true }],
      },
      {
        id: 'grd_vital_resolve',
        treeSlug: 'guardian',
        name: 'Vital Resolve',
        description: '+6% Max HP and +5% Rest Timer Efficiency per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxHpPct: 0.06, restTimerEfficiencyPct: 0.05 },
      },
      // Tier 2 (5 spent)
      {
        id: 'grd_bastion_plating',
        treeSlug: 'guardian',
        name: 'Bastion Plating',
        description: 'Increases physical defense by 6% per rank against heavy strikes.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'grd_iron_fortitude',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: {
          armorPct: 0.06,
          defensePct: 0.06,
        },
        modifiers: [{ stat: 'defensePct', valuePerRank: 0.06, isPercentage: true }],
      },
      {
        id: 'grd_unshakable_core',
        treeSlug: 'guardian',
        name: 'Unshakable Core',
        description: '+5% Max HP and +4% Damage Mitigation per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'grd_iron_fortitude',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxHpPct: 0.05, damageMitigationPct: 0.04 },
      },
      {
        id: 'grd_sleep_recovery',
        treeSlug: 'guardian',
        name: 'Sleep Recovery',
        description: '+8% Rest Timer Efficiency and +4% Max HP per rank.',
        tier: 2,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'grd_vital_resolve',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { restTimerEfficiencyPct: 0.08, maxHpPct: 0.04 },
      },
      // Tier 3 (15 spent)
      {
        id: 'grd_colossus_vigor',
        treeSlug: 'guardian',
        name: 'Colossus Vigor',
        description: '+6% Armor and +5% Max HP per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'grd_bastion_plating',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { armorPct: 0.06, maxHpPct: 0.05 },
      },
      {
        id: 'grd_aegis_slam',
        treeSlug: 'guardian',
        name: 'Aegis Slam',
        description: 'Active Skill: Fortifies shield barrier and deals 150% CON damage. +5% Armor and +4% Max HP per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'grd_unshakable_core',
        nodeType: 'ACTIVE_SKILL',
        modifiers: [],
        grantedSkillId: 'skill_aegis_slam',
        activeSkill: {
          skillId: 'skill_aegis_slam',
          name: 'Aegis Slam',
          cooldownSeconds: 9,
          staminaCost: 20,
          targetType: 'SINGLE_ENEMY',
          damageMultiplier: 1.5,
          selfShieldMaxHpPct: 0.15,
        },
        passivePerRank: { armorPct: 0.05, maxHpPct: 0.04 },
      },
      {
        id: 'grd_deep_rejuvenation',
        treeSlug: 'guardian',
        name: 'Deep Rejuvenation',
        description: '+10% Rest Efficiency and +4% Damage Mitigation per rank.',
        tier: 3,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 15,
        prerequisiteNodeId: 'grd_sleep_recovery',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { restTimerEfficiencyPct: 0.10, damageMitigationPct: 0.04 },
      },
      // Tier 4 (30 spent)
      {
        id: 'grd_impenetrable_hide',
        treeSlug: 'guardian',
        name: 'Impenetrable Hide',
        description: '+10% Armor and +8% Damage Mitigation per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'grd_colossus_vigor',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { armorPct: 0.10, damageMitigationPct: 0.08 },
      },
      {
        id: 'grd_titan_constitution',
        treeSlug: 'guardian',
        name: 'Titan Constitution',
        description: '+12% Max HP and +8% Rest Efficiency per rank.',
        tier: 4,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 30,
        prerequisiteNodeId: 'grd_deep_rejuvenation',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxHpPct: 0.12, restTimerEfficiencyPct: 0.08 },
      },
      // Tier 5 (40 spent)
      {
        id: 'grd_immortal_citadel',
        treeSlug: 'guardian',
        name: 'Immortal Citadel',
        description: 'Keystone: +20% Max HP and +20% Defense, at the cost of -10% Attack Speed. +6% Max HP and +6% Armor per rank.',
        tier: 5,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 40,
        prerequisiteNodeId: 'grd_aegis_slam',
        nodeType: 'KEYSTONE',
        passivePerRank: {
          maxHpPct: 0.06,
          armorPct: 0.06,
          defensePct: 0.06,
          attackSpeedPct: -0.01,
        },
        modifiers: [
          { stat: 'maxHpPct', valuePerRank: 0.2, isPercentage: true },
          { stat: 'defensePct', valuePerRank: 0.2, isPercentage: true },
        ],
        keystonePenalty: [{ stat: 'attackSpeedPct', valuePerRank: -0.1, isPercentage: true }],
      },
    ],
  },
];

// ============================================================================
// CATALOG INDEXING HELPERS
// ============================================================================

function buildNodeCatalog(trees: readonly TalentTreeDefinition[]): Map<
  string,
  { node: TalentNodeDefinition; tree: TalentTreeDefinition }
> {
  const map = new Map<string, { node: TalentNodeDefinition; tree: TalentTreeDefinition }>();
  for (const tree of trees) {
    for (const node of tree.nodes) {
      map.set(node.id, { node, tree });
    }
  }
  return map;
}

/**
 * Calculates total Talent Points already spent across all nodes of a specific tree.
 */
export function getPointsSpentInTree(
  treeSlug: string,
  unlockedNodeRanks: Record<string, number>,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): number {
  const tree = trees.find((t) => t.slug === treeSlug);
  if (!tree) return 0;

  let points = 0;
  for (const node of tree.nodes) {
    const rank = unlockedNodeRanks[node.id] ?? 0;
    if (rank > 0) {
      points += rank * node.pointCostPerRank;
    }
  }
  return points;
}

// ============================================================================
// VALIDATION & ALLOCATION
// ============================================================================

/**
 * Validates whether a character can invest 1 rank into `nodeId` using their stat-specific Talent Points.
 */
export function validateTalentAllocation(
  state: CharacterTalentState,
  nodeId: string,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): TalentValidationResult {
  const catalog = buildNodeCatalog(trees);
  const found = catalog.get(nodeId);

  if (!found) {
    return { valid: false, error: `Unknown talent node '${nodeId}'.` };
  }

  const { node, tree } = found;
  const governingStat = tree.governingStat;
  const currentRank = state.unlockedNodeRanks[node.id] ?? 0;

  if (currentRank >= node.maxRank) {
    return {
      valid: false,
      error: `Talent '${node.name}' is already at maximum rank (${node.maxRank}).`,
    };
  }

  const available = state.availablePoints[governingStat] ?? 0;
  if (available < node.pointCostPerRank) {
    return {
      valid: false,
      error: `Insufficient ${governingStat} Talent Points: requires ${node.pointCostPerRank}, available ${available}.`,
    };
  }

  const spentInTree = getPointsSpentInTree(tree.slug, state.unlockedNodeRanks, trees);
  if (spentInTree < node.requiredTreePointsSpent) {
    return {
      valid: false,
      error: `Requires ${node.requiredTreePointsSpent} points spent in ${tree.name} tree (currently ${spentInTree}).`,
    };
  }

  if (node.prerequisiteNodeId) {
    const prereqRank = state.unlockedNodeRanks[node.prerequisiteNodeId] ?? 0;
    if (prereqRank < 1) {
      const prereqEntry = catalog.get(node.prerequisiteNodeId);
      const prereqName = prereqEntry?.node.name ?? node.prerequisiteNodeId;
      return {
        valid: false,
        error: `Requires prerequisite talent '${prereqName}' to be unlocked first.`,
      };
    }
  }

  return {
    valid: true,
    governingStat,
    pointCost: node.pointCostPerRank,
    nextRank: currentRank + 1,
  };
}

/**
 * Spends stat-specific Talent Points to unlock/upgrade `nodeId` by 1 rank.
 * Supports pure single-tree specialists, split intra-stat builds, and omni-class multi-stat hybrids.
 */
export function spendTalentPoint(
  state: CharacterTalentState,
  nodeId: string,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): SpendTalentPointResult {
  const check = validateTalentAllocation(state, nodeId, trees);
  if (!check.valid || !check.governingStat || check.pointCost === undefined || !check.nextRank) {
    return { ok: false, error: check.error ?? 'Invalid talent allocation.' };
  }

  const stat = check.governingStat;
  const nextState: CharacterTalentState = {
    availablePoints: {
      ...state.availablePoints,
      [stat]: (state.availablePoints[stat] ?? 0) - check.pointCost,
    },
    unlockedNodeRanks: {
      ...state.unlockedNodeRanks,
      [nodeId]: check.nextRank,
    },
  };

  return {
    ok: true,
    governingStat: stat,
    nodeId,
    newRank: check.nextRank,
    pointsSpent: check.pointCost,
    nextState,
  };
}

/**
 * Convenience helper to verify if a talent point can be spent on nodeId.
 */
export const canSpendTalentPoint = (
  state: CharacterTalentState,
  nodeId: string,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): boolean => validateTalentAllocation(state, nodeId, trees).valid;

// ============================================================================
// MODIFIER AGGREGATION FOR COMBAT ENGINE
// ============================================================================

/**
 * Aggregates all unlocked passive modifiers, party auras, keystones, and active combat skills
 * across every Talent Tree simultaneously.
 */
export function aggregateTalentModifiers(
  unlockedNodeRanks: Record<string, number>,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): AggregatedTalentModifiers {
  const result: AggregatedTalentModifiers = {
    maxHpPct: 0,
    maxStaminaPct: 0,
    meleePowerPct: 0,
    armorPct: 0,
    damageMitigationPct: 0,
    armorPenetrationPct: 0,
    attackSpeedPct: 0,
    dodgeRatingBonus: 0,
    critChanceBonus: 0,
    critDamageBonus: 0,
    cooldownHastePct: 0,
    staminaCostReductionPct: 0,
    threatWeightBonus: 0,
    partyHpRegenPctPerSec: 0,
    partyStaminaRegenPerSec: 0,
    partyDamageMitigationPct: 0,
    healingPowerPct: 0,
    hazardResistancePct: 0,
    dungeonLootBonusPct: 0,
    bleedMeleePowerPctOnCrit: 0,
    openingStrikeBonusPct: 0,
    openingShieldMaxHpPct: 0,
    resetCooldownOnKill: false,
    healingPowerMultiplier: 0,
    maxManaBoost: 0,
    trapEvasion: 0,
    unlockedSkills: [],
    unlockedKeystones: [],
    pointsSpentByTree: {},
    pointsSpentByStat: {
      STRENGTH: 0,
      ENDURANCE: 0,
      AGILITY: 0,
      DEXTERITY: 0,
      CONSTITUTION: 0,
      WISDOM: 0,
      SPIRIT: 0,
    },
  };

  for (const tree of trees) {
    result.pointsSpentByTree[tree.slug] = 0;

    for (const node of tree.nodes) {
      const rank = Math.min(node.maxRank, Math.max(0, unlockedNodeRanks[node.id] ?? 0));
      if (rank <= 0) continue;

      const points = rank * node.pointCostPerRank;
      result.pointsSpentByTree[tree.slug] = (result.pointsSpentByTree[tree.slug] ?? 0) + points;
      result.pointsSpentByStat[tree.governingStat] =
        (result.pointsSpentByStat[tree.governingStat] ?? 0) + points;

      if (node.passivePerRank) {
        const p = node.passivePerRank;
        result.maxHpPct += (p.maxHpPct ?? 0) * rank;
        result.maxStaminaPct += (p.maxStaminaPct ?? 0) * rank;
        result.meleePowerPct += (p.meleePowerPct ?? 0) * rank;
        result.armorPct += (p.armorPct ?? 0) * rank;
        result.damageMitigationPct += (p.damageMitigationPct ?? 0) * rank;
        result.armorPenetrationPct += (p.armorPenetrationPct ?? 0) * rank;
        result.attackSpeedPct += (p.attackSpeedPct ?? 0) * rank;
        result.dodgeRatingBonus += (p.dodgeRatingBonus ?? 0) * rank;
        result.critChanceBonus += (p.critChanceBonus ?? 0) * rank;
        result.critDamageBonus += (p.critDamageBonus ?? 0) * rank;
        result.cooldownHastePct += (p.cooldownHastePct ?? 0) * rank;
        result.staminaCostReductionPct += (p.staminaCostReductionPct ?? 0) * rank;
        result.threatWeightBonus += (p.threatWeightBonus ?? 0) * rank;
        result.partyHpRegenPctPerSec += (p.partyHpRegenPctPerSec ?? 0) * rank;
        result.partyStaminaRegenPerSec += (p.partyStaminaRegenPerSec ?? 0) * rank;
        result.partyDamageMitigationPct += (p.partyDamageMitigationPct ?? 0) * rank;
        result.healingPowerPct += (p.healingPowerPct ?? 0) * rank;
        result.hazardResistancePct += (p.hazardResistancePct ?? 0) * rank;
        result.dungeonLootBonusPct += (p.dungeonLootBonusPct ?? 0) * rank;
        result.bleedMeleePowerPctOnCrit += (p.bleedMeleePowerPctOnCrit ?? 0) * rank;
        result.openingStrikeBonusPct += (p.openingStrikeBonusPct ?? 0) * rank;
        result.openingShieldMaxHpPct += (p.openingShieldMaxHpPct ?? 0) * rank;
        result.healingPowerMultiplier += (p.healingPowerMultiplier ?? 0) * rank;
        result.maxManaBoost += (p.maxManaBoost ?? 0) * rank;
        result.trapEvasion += (p.trapEvasion ?? 0) * rank;
        if (p.defensePct !== undefined) {
          result.defensePct = (result.defensePct ?? 0) + p.defensePct * rank;
        }
        if (p.skillPowerPct !== undefined) {
          result.skillPowerPct = (result.skillPowerPct ?? 0) + p.skillPowerPct * rank;
        }
        if (p.critDamagePct !== undefined) {
          result.critDamagePct = (result.critDamagePct ?? 0) + p.critDamagePct * rank;
        }
        if (p.critChancePct !== undefined) {
          result.critChancePct = (result.critChancePct ?? 0) + p.critChancePct * rank;
        }
        if (p.dodgeChancePct !== undefined) {
          result.dodgeChancePct = (result.dodgeChancePct ?? 0) + p.dodgeChancePct * rank;
        }
        if (p.attackPowerPct !== undefined) {
          result.attackPowerPct = (result.attackPowerPct ?? 0) + p.attackPowerPct * rank;
        }
        if (p.restTimerEfficiencyPct !== undefined) {
          result.restTimerEfficiencyPct =
            (result.restTimerEfficiencyPct ?? 0) + p.restTimerEfficiencyPct * rank;
        }
        if (p.resetCooldownOnKill) {
          result.resetCooldownOnKill = true;
        }
      }

      if (node.activeSkill) {
        result.unlockedSkills.push({ ...node.activeSkill });
      }

      if (node.nodeType === 'KEYSTONE') {
        result.unlockedKeystones.push(node.id);
      }
    }
  }

  return result;
}

/**
 * Backward compatibility alias for aggregateTalentModifiers.
 */
export const aggregateTalentCombatModifiers = aggregateTalentModifiers;
