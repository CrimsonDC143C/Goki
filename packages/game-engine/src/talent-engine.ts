import { HolisticStatType, StatType } from './types';

export type TalentGoverningStat = HolisticStatType;

// ============================================================================
// INTERFACES & TALENT DEFINITIONS
// ============================================================================

export type TalentNodeCategory = 'PASSIVE_MODIFIER' | 'ACTIVE_SKILL' | 'KEYSTONE';

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
  unlockedSkills: ActiveTalentSkillDefinition[];
  unlockedKeystones: string[];
  pointsSpentByTree: Record<string, number>;
  pointsSpentByStat: Record<HolisticStatType, number>;
}

// ============================================================================
// BUILT-IN 6 MULTI-CLASS STAT-BOUND TALENT TREES
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
      {
        id: 'jug_iron_skin',
        treeSlug: 'juggernaut',
        name: 'Iron Skin',
        description: '+8% Armor and +4% Max HP per rank.',
        tier: 1,
        maxRank: 3,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { armorPct: 0.08, maxHpPct: 0.04, threatWeightBonus: 15 },
      },
      {
        id: 'jug_bulwark_stance',
        treeSlug: 'juggernaut',
        name: 'Bulwark Stance',
        description: '+5% Damage Mitigation and +25 Threat Weight per rank.',
        tier: 2,
        maxRank: 2,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'jug_iron_skin',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { damageMitigationPct: 0.05, threatWeightBonus: 25 },
      },
      {
        id: 'jug_shield_slam',
        treeSlug: 'juggernaut',
        name: 'Shield Slam',
        description: 'Slams target for 165% melee power, taunting enemies and granting a 12% Max HP shield.',
        tier: 2,
        maxRank: 1,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'jug_iron_skin',
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
      },
      {
        id: 'jug_unstoppable',
        treeSlug: 'juggernaut',
        name: 'Unstoppable Juggernaut',
        description: 'Keystone: +15% Max HP and starts every room with a 20% Max HP barrier.',
        tier: 3,
        maxRank: 1,
        pointCostPerRank: 2,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'jug_shield_slam',
        nodeType: 'KEYSTONE',
        passivePerRank: { maxHpPct: 0.15, openingShieldMaxHpPct: 0.20, threatWeightBonus: 40 },
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
      {
        id: 'van_heavy_handed',
        treeSlug: 'vanguard',
        name: 'Heavy Handed',
        description: '+8% Melee Power per rank.',
        tier: 1,
        maxRank: 3,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { meleePowerPct: 0.08 },
      },
      {
        id: 'van_sundering_strikes',
        treeSlug: 'vanguard',
        name: 'Sundering Strikes',
        description: 'Attacks bypass 12% of enemy armor per rank.',
        tier: 2,
        maxRank: 2,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'van_heavy_handed',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { armorPenetrationPct: 0.12 },
      },
      {
        id: 'van_colossus_cleave',
        treeSlug: 'vanguard',
        name: 'Colossus Cleave',
        description: 'Massive sweeping blow dealing 210% melee damage to up to 2 enemies.',
        tier: 2,
        maxRank: 1,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'van_heavy_handed',
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
      },
      {
        id: 'van_titans_grip',
        treeSlug: 'vanguard',
        name: "Titan's Grip",
        description: 'Keystone: +15% Melee Power and +35% Critical Strike Damage.',
        tier: 3,
        maxRank: 1,
        pointCostPerRank: 2,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'van_colossus_cleave',
        nodeType: 'KEYSTONE',
        passivePerRank: { meleePowerPct: 0.15, critDamageBonus: 0.35 },
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
      {
        id: 'war_deep_lungs',
        treeSlug: 'warden',
        name: 'Deep Lungs',
        description: '+10% Max Stamina and +6% Max HP per rank.',
        tier: 1,
        maxRank: 3,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { maxStaminaPct: 0.10, maxHpPct: 0.06 },
      },
      {
        id: 'war_renewal_aura',
        treeSlug: 'warden',
        name: 'Renewal Aura',
        description: 'Regenerates 1.2% Max HP and 2.5 Stamina per second for all party members per rank.',
        tier: 2,
        maxRank: 2,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'war_deep_lungs',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { partyHpRegenPctPerSec: 0.012, partyStaminaRegenPerSec: 2.5 },
      },
      {
        id: 'war_second_wind_hymn',
        treeSlug: 'warden',
        name: 'Second Wind Hymn',
        description: 'Restores 18% Max HP to the most injured party member.',
        tier: 2,
        maxRank: 1,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'war_deep_lungs',
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
      },
      {
        id: 'war_undying_sanctuary',
        treeSlug: 'warden',
        name: 'Undying Sanctuary',
        description: 'Keystone: Grants all allies +8% Damage Mitigation and +40% Healing Power.',
        tier: 3,
        maxRank: 1,
        pointCostPerRank: 2,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'war_second_wind_hymn',
        nodeType: 'KEYSTONE',
        passivePerRank: { partyDamageMitigationPct: 0.08, healingPowerPct: 0.40 },
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
      {
        id: 'out_trailblazer',
        treeSlug: 'outrider',
        name: 'Trailblazer',
        description: '+18% Dungeon Trap & Hazard Resistance per rank.',
        tier: 1,
        maxRank: 3,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { hazardResistancePct: 0.18 },
      },
      {
        id: 'out_resourceful_pace',
        treeSlug: 'outrider',
        name: 'Resourceful Pace',
        description: '-12% Skill Stamina Cost and +3% Dodge per rank.',
        tier: 2,
        maxRank: 2,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'out_trailblazer',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { staminaCostReductionPct: 0.12, dodgeRatingBonus: 0.03 },
      },
      {
        id: 'out_evasive_maneuver',
        treeSlug: 'outrider',
        name: 'Harrying Shot',
        description: 'Swift tactical strike dealing 155% damage with low stamina expenditure.',
        tier: 2,
        maxRank: 1,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'out_trailblazer',
        nodeType: 'ACTIVE_SKILL',
        activeSkill: {
          skillId: 'out_evasive_maneuver',
          name: 'Harrying Shot',
          cooldownSeconds: 6,
          staminaCost: 12,
          targetType: 'SINGLE_ENEMY',
          damageMultiplier: 1.55,
        },
      },
      {
        id: 'out_master_pathfinder',
        treeSlug: 'outrider',
        name: 'Master Pathfinder',
        description: 'Keystone: +25% Trap Resistance and +20% Dungeon Loot Bonus.',
        tier: 3,
        maxRank: 1,
        pointCostPerRank: 2,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'out_evasive_maneuver',
        nodeType: 'KEYSTONE',
        passivePerRank: { hazardResistancePct: 0.25, dungeonLootBonusPct: 0.20 },
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
      {
        id: 'ber_bloodlust_tempo',
        treeSlug: 'berserker',
        name: 'Bloodlust Tempo',
        description: '+9% Attack Speed per rank.',
        tier: 1,
        maxRank: 3,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { attackSpeedPct: 0.09 },
      },
      {
        id: 'ber_serrated_strikes',
        treeSlug: 'berserker',
        name: 'Serrated Strikes',
        description: 'Critical strikes inflict Bleed dealing 30% Melee Power per rank.',
        tier: 2,
        maxRank: 2,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'ber_bloodlust_tempo',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { bleedMeleePowerPctOnCrit: 0.30 },
      },
      {
        id: 'ber_frenzied_flurry',
        treeSlug: 'berserker',
        name: 'Frenzied Flurry',
        description: 'Unleashes 3 rapid strikes each dealing 75% melee damage.',
        tier: 2,
        maxRank: 1,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'ber_bloodlust_tempo',
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
      },
      {
        id: 'ber_avatar_of_carnage',
        treeSlug: 'berserker',
        name: 'Avatar of Carnage',
        description: 'Keystone: +12% Attack Speed and +8% Critical Strike Chance.',
        tier: 3,
        maxRank: 1,
        pointCostPerRank: 2,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'ber_frenzied_flurry',
        nodeType: 'KEYSTONE',
        passivePerRank: { attackSpeedPct: 0.12, critChanceBonus: 0.08 },
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
      {
        id: 'ass_shadowstep_reflexes',
        treeSlug: 'assassin',
        name: 'Shadowstep Reflexes',
        description: '+4% Dodge Rating and +4% Critical Strike Chance per rank.',
        tier: 1,
        maxRank: 3,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { dodgeRatingBonus: 0.04, critChanceBonus: 0.04 },
      },
      {
        id: 'ass_ambush_lethality',
        treeSlug: 'assassin',
        name: 'Ambush Lethality',
        description: 'Opening strike in each room deals +35% bonus damage per rank.',
        tier: 2,
        maxRank: 2,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'ass_shadowstep_reflexes',
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: { openingStrikeBonusPct: 0.35 },
      },
      {
        id: 'ass_phantom_strike',
        treeSlug: 'assassin',
        name: 'Phantom Strike',
        description: 'Precision strike dealing 205% melee damage with +25% bonus crit chance.',
        tier: 2,
        maxRank: 1,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 2,
        prerequisiteNodeId: 'ass_shadowstep_reflexes',
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
      },
      {
        id: 'ass_executioners_reset',
        treeSlug: 'assassin',
        name: "Executioner's Reset",
        description: 'Keystone: +18% Skill Cooldown Haste and resets active skill cooldowns on takedown.',
        tier: 3,
        maxRank: 1,
        pointCostPerRank: 2,
        requiredTreePointsSpent: 5,
        prerequisiteNodeId: 'ass_phantom_strike',
        nodeType: 'KEYSTONE',
        passivePerRank: { cooldownHastePct: 0.18, resetCooldownOnKill: true },
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
      {
        id: 'acro_feather_step',
        treeSlug: 'acrobat',
        name: 'Feather Step',
        description: '+5% Trap Evasion per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: {
          trapEvasion: 0.05,
        },
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
      {
        id: 'grd_iron_fortitude',
        treeSlug: 'guardian',
        name: 'Iron Fortitude',
        description: '+5% Max HP per rank.',
        tier: 1,
        maxRank: 5,
        pointCostPerRank: 1,
        requiredTreePointsSpent: 0,
        nodeType: 'PASSIVE_MODIFIER',
        passivePerRank: {
          maxHpPct: 0.05,
        },
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
