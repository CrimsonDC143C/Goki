import { CombatModifiers } from './talent-engine';
import { EquipmentStatBonuses, ItemRarity, LootDrop } from './types';
import { EquipItemType, EquipmentSlot } from './character-loadout-spoils';
import { createSeededRng } from './rng';

// ============================================================================
// 1. CORE TYPES & TIER CONFIGURATION
// ============================================================================

export type ItemTier = 1 | 2 | 3 | 4 | 5;

export interface ItemTierConfig {
  tier: ItemTier;
  romanNumeral: string;
  badgeLabel: string;
  rarity: ItemRarity;
  baseStatMultiplier: number;
  affixStatMultiplier: number;
  goldMultiplier: number;
}

export const ITEM_TIER_CONFIG: Record<ItemTier, ItemTierConfig> = {
  1: {
    tier: 1,
    romanNumeral: 'I',
    badgeLabel: 'T1',
    rarity: 'COMMON',
    baseStatMultiplier: 1.0,
    affixStatMultiplier: 1.0,
    goldMultiplier: 1.0,
  },
  2: {
    tier: 2,
    romanNumeral: 'II',
    badgeLabel: 'T2',
    rarity: 'UNCOMMON',
    baseStatMultiplier: 1.2,
    affixStatMultiplier: 1.25,
    goldMultiplier: 1.6,
  },
  3: {
    tier: 3,
    romanNumeral: 'III',
    badgeLabel: 'T3',
    rarity: 'RARE',
    baseStatMultiplier: 1.45,
    affixStatMultiplier: 1.55,
    goldMultiplier: 2.6,
  },
  4: {
    tier: 4,
    romanNumeral: 'IV',
    badgeLabel: 'T4',
    rarity: 'EPIC',
    baseStatMultiplier: 1.8,
    affixStatMultiplier: 2.0,
    goldMultiplier: 4.5,
  },
  5: {
    tier: 5,
    romanNumeral: 'V',
    badgeLabel: 'T5',
    rarity: 'MYTHIC',
    baseStatMultiplier: 2.25,
    affixStatMultiplier: 2.5,
    goldMultiplier: 8.5,
  },
};

export interface PrimaryStatBonuses {
  STR?: number;
  END?: number;
  AGI?: number;
  DEX?: number;
  CON?: number;
  WIS?: number;
  SPR?: number;
}

export interface ItemBaseStats {
  meleePower?: number;
  armor?: number;
  maxHp?: number;
  maxStamina?: number;
  critChancePct?: number;
  critDamagePct?: number;
  attackSpeedPct?: number;
  dodgeChancePct?: number;
  damageMitigationPct?: number;
  lifeOnHit?: number;
  armorPenetrationPct?: number;
  skillPotencyPct?: number;
  startOfCombatShieldHp?: number;
  hazardResistancePct?: number;
}

export interface Tier5UniqueDefinition {
  uniqueName: string;
  uniqueLore: string;
  passiveId: string;
  passiveName: string;
  passiveDescription: string;
  passiveModifiers: Partial<CombatModifiers>;
}

export interface BaseEquippableItemDefinition {
  baseSlug: string;
  baseName: string;
  description: string;
  itemType: EquipItemType;
  slot: EquipmentSlot;
  handedness?: 'ONE_HANDED' | 'TWO_HANDED';
  iconKey: string;
  baseGoldValue: number;
  statRequirements: PrimaryStatBonuses;
  baseStats: ItemBaseStats;
  tier5Unique: Tier5UniqueDefinition;
}

// ============================================================================
// 2. BASE ITEM CATALOG (EXACTLY 32 ITEMS)
// ============================================================================

export const BASE_EQUIPPABLE_ITEMS: readonly BaseEquippableItemDefinition[] = [
  // --- Two-Handed Weapons (5) ---
  {
    baseSlug: 'ironbound_greatsword',
    baseName: 'Ironbound Greatsword',
    description: 'Heavy two-handed blade forged for brutal strength builds.',
    itemType: 'WEAPON',
    slot: 'mainHand',
    handedness: 'TWO_HANDED',
    iconKey: 'greatsword',
    baseGoldValue: 180,
    statRequirements: { STR: 3 },
    baseStats: { meleePower: 22, critChancePct: 0.03 },
    tier5Unique: {
      uniqueName: 'Ashbringer of the Dread-Vanguard',
      uniqueLore:
        'Tempered in the pyres of the fallen legion, its edge blazes with righteous retribution.',
      passiveId: 'unique_ashbringer',
      passiveName: 'Pyre of the Vanguard',
      passiveDescription: 'Increases Melee Power by +35% and Armor by +25%.',
      passiveModifiers: { meleePowerPct: 0.35, armorPct: 0.25 },
    },
  },
  {
    baseSlug: 'crimson_oni_kanabo',
    baseName: 'Crimson Oni Greatclub',
    description: 'Crushing spiked war-club balanced for unstoppable swings.',
    itemType: 'WEAPON',
    slot: 'mainHand',
    handedness: 'TWO_HANDED',
    iconKey: 'mace',
    baseGoldValue: 195,
    statRequirements: { STR: 4 },
    baseStats: { meleePower: 26, damageMitigationPct: 0.02 },
    tier5Unique: {
      uniqueName: 'Earthshaker, Greatclub of the Crimson Oni',
      uniqueLore:
        'Carved from primeval ironwood and capped in demon-iron; strikes split stone asunder.',
      passiveId: 'unique_earthshaker',
      passiveName: 'Seismic Cleave',
      passiveDescription: 'Grants +40% Melee Power and +15% Damage Mitigation.',
      passiveModifiers: { meleePowerPct: 0.4, damageMitigationPct: 0.15 },
    },
  },
  {
    baseSlug: 'executioners_greataxe',
    baseName: "Executioner's Greataxe",
    description: 'Wide bearded axe designed to sever with terrifying momentum.',
    itemType: 'WEAPON',
    slot: 'mainHand',
    handedness: 'TWO_HANDED',
    iconKey: 'greataxe',
    baseGoldValue: 210,
    statRequirements: { STR: 4, DEX: 2 },
    baseStats: { meleePower: 24, critChancePct: 0.05, critDamagePct: 0.15 },
    tier5Unique: {
      uniqueName: 'Griefcleaver, Sovereign of the Scaffold',
      uniqueLore: 'Headed by a cruel crescent blade that hungers for executioner justice.',
      passiveId: 'unique_griefcleaver',
      passiveName: 'Scaffold Decapitation',
      passiveDescription: 'Grants +25% Crit Chance and +45% Crit Multiplier.',
      passiveModifiers: { critChanceBonus: 0.25, critDamageBonus: 0.45 },
    },
  },
  {
    baseSlug: 'warden_halberd',
    baseName: "Warden's Pike-Halberd",
    description: 'Long defensive polearm holding corridors against swarming beasts.',
    itemType: 'WEAPON',
    slot: 'mainHand',
    handedness: 'TWO_HANDED',
    iconKey: 'halberd',
    baseGoldValue: 200,
    statRequirements: { STR: 2, END: 3 },
    baseStats: { meleePower: 20, armor: 10, maxHp: 60 },
    tier5Unique: {
      uniqueName: 'Vowkeeper, Halberd of the Undying Watch',
      uniqueLore: 'Carried by the silent sentinels whose vigil outlasted mortal kingdoms.',
      passiveId: 'unique_vowkeeper',
      passiveName: 'Eternal Vigil',
      passiveDescription: 'Grants +25% Max HP, +20% Armor, and +20% Hazard Resistance.',
      passiveModifiers: { maxHpPct: 0.25, armorPct: 0.2, hazardResistancePct: 0.2 },
    },
  },
  {
    baseSlug: 'astral_archstaff',
    baseName: 'Astral Runestaff',
    description: 'Resonant staff channeling cosmic constellations and fast tempos.',
    itemType: 'WEAPON',
    slot: 'mainHand',
    handedness: 'TWO_HANDED',
    iconKey: 'staff',
    baseGoldValue: 220,
    statRequirements: { WIS: 3, SPR: 2 },
    baseStats: { meleePower: 18, attackSpeedPct: 0.08, skillPotencyPct: 0.1 },
    tier5Unique: {
      uniqueName: 'Chronoscepter of the Void Weaver',
      uniqueLore:
        'A conduit woven from starlight that bends temporal threads to hasten the wielder.',
      passiveId: 'unique_chronoscepter',
      passiveName: 'Temporal Distortion',
      passiveDescription: 'Grants +30% Attack Speed and +25% Cooldown Haste.',
      passiveModifiers: { attackSpeedPct: 0.3, cooldownHastePct: 0.25 },
    },
  },

  // --- One-Handed Weapons (5) ---
  {
    baseSlug: 'windrunner_daggers',
    baseName: 'Twin Windrunner Blades',
    description: 'Featherweight blades scaling with high Agility and swift strikes.',
    itemType: 'WEAPON',
    slot: 'mainHand',
    handedness: 'ONE_HANDED',
    iconKey: 'daggers',
    baseGoldValue: 275,
    statRequirements: { AGI: 4 },
    baseStats: {
      meleePower: 17,
      attackSpeedPct: 0.14,
      dodgeChancePct: 0.05,
      critChancePct: 0.06,
    },
    tier5Unique: {
      uniqueName: 'Gale-Fangs of the Whispering Zephyr',
      uniqueLore: 'Weightless blades that slice through air without creating a single ripple.',
      passiveId: 'unique_galefangs',
      passiveName: 'Zephyr Flurry',
      passiveDescription: 'Grants +35% Attack Speed and +20% Dodge Rating.',
      passiveModifiers: { attackSpeedPct: 0.35, dodgeRatingBonus: 0.2 },
    },
  },
  {
    baseSlug: 'dusk_shinobi_wakizashi',
    baseName: 'Dusk Shinobi Wakizashi',
    description: 'Curved assassin blade crafted for critical ambushes.',
    itemType: 'WEAPON',
    slot: 'mainHand',
    handedness: 'ONE_HANDED',
    iconKey: 'wakizashi',
    baseGoldValue: 230,
    statRequirements: { AGI: 3, DEX: 2 },
    baseStats: { meleePower: 16, critChancePct: 0.08, dodgeChancePct: 0.04 },
    tier5Unique: {
      uniqueName: 'Kage-Maru, Edge of the Eclipse',
      uniqueLore: 'Forged in the umbra of the eclipse, drinking shadows to strike unseen.',
      passiveId: 'unique_kagemaru',
      passiveName: 'Eclipse Strike',
      passiveDescription: 'Grants +25% Crit Chance and +20% Dodge Rating.',
      passiveModifiers: { critChanceBonus: 0.25, dodgeRatingBonus: 0.2 },
    },
  },
  {
    baseSlug: 'sunforged_warhammer',
    baseName: 'Sunforged Warhammer',
    description: 'Solar-infused one-handed hammer that bludgeons through armor.',
    itemType: 'WEAPON',
    slot: 'mainHand',
    handedness: 'ONE_HANDED',
    iconKey: 'warhammer',
    baseGoldValue: 215,
    statRequirements: { STR: 3, SPR: 1 },
    baseStats: { meleePower: 19, armorPenetrationPct: 0.08, startOfCombatShieldHp: 20 },
    tier5Unique: {
      uniqueName: 'Sol-Breaker, Gavel of the Dawn',
      uniqueLore: 'Inlaid with solar gold that erupts in searing heat upon every impact.',
      passiveId: 'unique_solbreaker',
      passiveName: 'Dawn Radiance',
      passiveDescription: 'Grants +30% Melee Power and +20% Start-of-Combat Shield HP.',
      passiveModifiers: { meleePowerPct: 0.3, partyBossShieldMaxHpPct: 0.2 },
    },
  },
  {
    baseSlug: 'reaver_cleaver',
    baseName: 'Northern Reaver Broadaxe',
    description: 'Rugged one-handed axe honed on glacial whetstones.',
    itemType: 'WEAPON',
    slot: 'mainHand',
    handedness: 'ONE_HANDED',
    iconKey: 'axe',
    baseGoldValue: 190,
    statRequirements: { STR: 3, END: 1 },
    baseStats: { meleePower: 18, critChancePct: 0.04 },
    tier5Unique: {
      uniqueName: 'Frostbite, Butcher of the Glacier',
      uniqueLore: 'Caked in permafrost from the northern wastes; wounds never cease their chill.',
      passiveId: 'unique_frostbite',
      passiveName: 'Glacial Carnage',
      passiveDescription: 'Grants +35% Melee Power and +15% Crit Chance.',
      passiveModifiers: { meleePowerPct: 0.35, critChanceBonus: 0.15 },
    },
  },
  {
    baseSlug: 'oath_sentinel_longsword',
    baseName: 'Oath-Sentinel Broadsword',
    description: 'Disciplined broadsword carried by knights sworn to the covenant.',
    itemType: 'WEAPON',
    slot: 'mainHand',
    handedness: 'ONE_HANDED',
    iconKey: 'sword',
    baseGoldValue: 205,
    statRequirements: { STR: 2, END: 2 },
    baseStats: { meleePower: 17, armor: 8, maxHp: 40 },
    tier5Unique: {
      uniqueName: 'Sanctus, Blade of the Unbroken Covenant',
      uniqueLore: 'Inscribed with sacred oaths sworn beneath the cathedral golden vaults.',
      passiveId: 'unique_sanctus',
      passiveName: 'Unbroken Oath',
      passiveDescription: 'Grants +25% Armor, +20% Max HP, and +20% Melee Power.',
      passiveModifiers: { armorPct: 0.25, maxHpPct: 0.2, meleePowerPct: 0.2 },
    },
  },

  // --- Off-Hand Shields & Relics (4) ---
  {
    baseSlug: 'tempered_iron_buckler',
    baseName: 'Tempered Iron Buckler',
    description: 'Agile parrying buckler designed for swift deflection.',
    itemType: 'OFFHAND',
    slot: 'offHand',
    iconKey: 'buckler',
    baseGoldValue: 140,
    statRequirements: { STR: 1, AGI: 2 },
    baseStats: { armor: 14, dodgeChancePct: 0.04, damageMitigationPct: 0.02 },
    tier5Unique: {
      uniqueName: 'Aegis of the Iron Foundry',
      uniqueLore: 'Folded seven score times by guild masters to repel crushing blows.',
      passiveId: 'unique_aegis_foundry',
      passiveName: 'Foundry Deflection',
      passiveDescription: 'Grants +30% Armor and +15% Damage Mitigation.',
      passiveModifiers: { armorPct: 0.3, damageMitigationPct: 0.15 },
    },
  },
  {
    baseSlug: 'bastion_tower_shield',
    baseName: 'Bastion Tower Greatshield',
    description: 'Massive full-length shield anchoring the frontline.',
    itemType: 'OFFHAND',
    slot: 'offHand',
    iconKey: 'shield',
    baseGoldValue: 190,
    statRequirements: { STR: 3, END: 3 },
    baseStats: { armor: 26, maxHp: 75, damageMitigationPct: 0.04 },
    tier5Unique: {
      uniqueName: 'Bulwark of the Unyielding Colossus',
      uniqueLore: 'A slab of obsidian steel that can anchor an entire defensive line.',
      passiveId: 'unique_bulwark_colossus',
      passiveName: 'Colossus Bulwark',
      passiveDescription: 'Grants +35% Armor, +25% Max HP, and +20% Mitigation.',
      passiveModifiers: { armorPct: 0.35, maxHpPct: 0.25, damageMitigationPct: 0.2 },
    },
  },
  {
    baseSlug: 'solar_censer_relic',
    baseName: 'Solar Sanctum Censer',
    description: 'Incense-bearing talisman spreading renewing aura to allies.',
    itemType: 'OFFHAND',
    slot: 'offHand',
    iconKey: 'relic',
    baseGoldValue: 160,
    statRequirements: { SPR: 3 },
    baseStats: { maxHp: 55, startOfCombatShieldHp: 30, hazardResistancePct: 0.06 },
    tier5Unique: {
      uniqueName: 'Thurible of the Immortal Phoenix',
      uniqueLore: 'Burns with eternal sacred ember, bathing allies in renewing warmth.',
      passiveId: 'unique_phoenix_thurible',
      passiveName: 'Sacred Rebirth',
      passiveDescription: 'Grants +25% Max HP and +20% Start-of-Combat Shield HP.',
      passiveModifiers: { maxHpPct: 0.25, partyBossShieldMaxHpPct: 0.2 },
    },
  },
  {
    baseSlug: 'void_grimoire_codex',
    baseName: 'Grimoire of the Astral Rift',
    description: 'Arcane tome inscribed with geometric equations and astral seals.',
    itemType: 'OFFHAND',
    slot: 'offHand',
    iconKey: 'tome',
    baseGoldValue: 175,
    statRequirements: { WIS: 3 },
    baseStats: { skillPotencyPct: 0.08, critChancePct: 0.04, maxStamina: 20 },
    tier5Unique: {
      uniqueName: 'Tome of the Seventh Constellation',
      uniqueLore: 'Pages whisper prophecies of the void, empowering spells with cosmic force.',
      passiveId: 'unique_astral_tome',
      passiveName: 'Constellation Surge',
      passiveDescription: 'Grants +25% Cooldown Haste and +20% Crit Chance.',
      passiveModifiers: { cooldownHastePct: 0.25, critChanceBonus: 0.2 },
    },
  },

  // --- Head / Helms (4) ---
  {
    baseSlug: 'ashen_iron_helm',
    baseName: 'Ashen Vanguard Greathelm',
    description: 'Heavy enclosed visor forged to withstand devastating concussions.',
    itemType: 'HEAD',
    slot: 'head',
    iconKey: 'helm',
    baseGoldValue: 150,
    statRequirements: { STR: 2, END: 1 },
    baseStats: { armor: 16, maxHp: 50 },
    tier5Unique: {
      uniqueName: 'Visage of the Ashen Conqueror',
      uniqueLore: 'Blackened iron helm crowned with triumphant war-plumes.',
      passiveId: 'unique_ashen_visage',
      passiveName: 'Conqueror Wrath',
      passiveDescription: 'Grants +20% Melee Power and +25% Armor.',
      passiveModifiers: { meleePowerPct: 0.2, armorPct: 0.25 },
    },
  },
  {
    baseSlug: 'crown_of_the_wyrm',
    baseName: 'Crown of the World Wyrm',
    description: 'Mythic horned helm awarded exclusively to dragonslayers.',
    itemType: 'HEAD',
    slot: 'head',
    iconKey: 'crown',
    baseGoldValue: 2500,
    statRequirements: { STR: 5, END: 5, AGI: 5 },
    baseStats: { meleePower: 35, armor: 35, maxHp: 180, critChancePct: 0.08 },
    tier5Unique: {
      uniqueName: 'Ignisrax Sovereign Dragon-Crown',
      uniqueLore: 'Forged from molten scales of the ancient volcanic dragon.',
      passiveId: 'unique_dragon_crown',
      passiveName: 'Wyrm Majesty',
      passiveDescription: 'Grants +30% Melee Power, +30% Armor, and +25% Max HP.',
      passiveModifiers: { meleePowerPct: 0.3, armorPct: 0.3, maxHpPct: 0.25 },
    },
  },
  {
    baseSlug: 'shadowveil_hood',
    baseName: 'Shadowveil Assassin Cowl',
    description: 'Reinforced cowl blending wearer face into surrounding darkness.',
    itemType: 'HEAD',
    slot: 'head',
    iconKey: 'hood',
    baseGoldValue: 165,
    statRequirements: { AGI: 3 },
    baseStats: { dodgeChancePct: 0.04, critChancePct: 0.04, critDamagePct: 0.1 },
    tier5Unique: {
      uniqueName: 'Nightshroud of the Silent Sovereign',
      uniqueLore: 'Woven from midnight silk that absorbs ambient light.',
      passiveId: 'unique_nightshroud',
      passiveName: 'Silent Ambush',
      passiveDescription: 'Grants +25% Crit Chance and +25% Crit Multiplier.',
      passiveModifiers: { critChanceBonus: 0.25, critDamageBonus: 0.25 },
    },
  },
  {
    baseSlug: 'horned_oni_mempo',
    baseName: 'Horned Oni War-Mask',
    description: 'Terrifying demon mask fueling violent combat tempos.',
    itemType: 'HEAD',
    slot: 'head',
    iconKey: 'mask',
    baseGoldValue: 180,
    statRequirements: { STR: 3, DEX: 1 },
    baseStats: { meleePower: 10, armor: 12, attackSpeedPct: 0.04 },
    tier5Unique: {
      uniqueName: 'Demon-Visage of the Blood Moon',
      uniqueLore: 'A terrifying iron mask stained crimson by relentless battle.',
      passiveId: 'unique_demon_mempo',
      passiveName: 'Blood Frenzy',
      passiveDescription: 'Grants +25% Melee Power and +20% Attack Speed.',
      passiveModifiers: { meleePowerPct: 0.25, attackSpeedPct: 0.2 },
    },
  },

  // --- Chest Armor (4) ---
  {
    baseSlug: 'warden_chainmail',
    baseName: "Warden's Tempered Hauberk",
    description: 'Endurance-fitted armor built for grueling dungeon expeditions.',
    itemType: 'CHEST',
    slot: 'chest',
    iconKey: 'chest',
    baseGoldValue: 260,
    statRequirements: { STR: 2, END: 3 },
    baseStats: { armor: 24, maxHp: 90, maxStamina: 30 },
    tier5Unique: {
      uniqueName: 'Heartguard of the Eternal Warden',
      uniqueLore: 'Endurance-fitted chain that shrugs off fatal wounds.',
      passiveId: 'unique_eternal_heartguard',
      passiveName: 'Undying Bastion',
      passiveDescription: 'Grants +30% Max HP, +25% Armor, and +25% Max Stamina.',
      passiveModifiers: { maxHpPct: 0.3, armorPct: 0.25, maxStaminaPct: 0.25 },
    },
  },
  {
    baseSlug: 'dread_knight_cuirass',
    baseName: 'Dread-Knight Obsidian Cuirass',
    description: 'Fluted plate carapace absorbing shockwaves and direct strikes.',
    itemType: 'CHEST',
    slot: 'chest',
    iconKey: 'cuirass',
    baseGoldValue: 285,
    statRequirements: { STR: 4, CON: 2 },
    baseStats: { armor: 28, maxHp: 110, damageMitigationPct: 0.03 },
    tier5Unique: {
      uniqueName: 'Soulforged Carapace of the Abyss',
      uniqueLore: 'Plate armor infused with soul-iron harvested from the void.',
      passiveId: 'unique_abyssal_carapace',
      passiveName: 'Abyssal Hardening',
      passiveDescription: 'Grants +35% Armor and +20% Damage Mitigation.',
      passiveModifiers: { armorPct: 0.35, damageMitigationPct: 0.2 },
    },
  },
  {
    baseSlug: 'wayfarer_brigandine',
    baseName: 'Wayfarer Ranger Brigandine',
    description: 'Riveted leather coat flexible enough for sprints and acrobatic vaults.',
    itemType: 'CHEST',
    slot: 'chest',
    iconKey: 'brigandine',
    baseGoldValue: 240,
    statRequirements: { AGI: 3, END: 2 },
    baseStats: { armor: 18, dodgeChancePct: 0.05, maxStamina: 35 },
    tier5Unique: {
      uniqueName: 'Wind-Stalker Mythril Coat',
      uniqueLore: 'Lightweight rings over supple leather crafted for rapid traversal.',
      passiveId: 'unique_wind_stalker',
      passiveName: 'Stalker Agility',
      passiveDescription: 'Grants +25% Dodge Rating and +25% Attack Speed.',
      passiveModifiers: { dodgeRatingBonus: 0.25, attackSpeedPct: 0.25 },
    },
  },
  {
    baseSlug: 'solar_mystic_vestments',
    baseName: 'Solar Mystic Mantle',
    description: 'Enchanted robes emitting passive luminescence that calms the pulse.',
    itemType: 'CHEST',
    slot: 'chest',
    iconKey: 'robes',
    baseGoldValue: 250,
    statRequirements: { SPR: 3, WIS: 2 },
    baseStats: { armor: 15, maxHp: 70, startOfCombatShieldHp: 40, maxStamina: 25 },
    tier5Unique: {
      uniqueName: 'Raiment of the Celestial Dawn',
      uniqueLore: 'Silken robes radiating comforting golden luminescence.',
      passiveId: 'unique_celestial_raiment',
      passiveName: 'Aura of Dawn',
      passiveDescription: 'Grants +25% Max HP, +20% Shield HP, and +20% Stamina.',
      passiveModifiers: { maxHpPct: 0.25, partyBossShieldMaxHpPct: 0.2, maxStaminaPct: 0.2 },
    },
  },

  // --- Legs / Greaves (3) ---
  {
    baseSlug: 'strider_greaves',
    baseName: 'Outrider Leather Greaves',
    description: 'Supple greaves reinforced at knees and calves for long marches.',
    itemType: 'LEGS',
    slot: 'legs',
    iconKey: 'greaves',
    baseGoldValue: 140,
    statRequirements: { AGI: 2, END: 2 },
    baseStats: { armor: 14, maxStamina: 25, dodgeChancePct: 0.03 },
    tier5Unique: {
      uniqueName: 'Horizon-Strider War-Tassets',
      uniqueLore: 'Reinforced breeches hardened for long marches across craggy ranges.',
      passiveId: 'unique_horizon_strider',
      passiveName: 'Endless Pace',
      passiveDescription: 'Grants +20% Dodge Rating and +25% Max Stamina.',
      passiveModifiers: { dodgeRatingBonus: 0.2, maxStaminaPct: 0.25 },
    },
  },
  {
    baseSlug: 'colossus_plate_cuisses',
    baseName: 'Colossus Plate Legguards',
    description: 'Thick steel cuisses shielding femoral arteries and thighs.',
    itemType: 'LEGS',
    slot: 'legs',
    iconKey: 'cuisses',
    baseGoldValue: 170,
    statRequirements: { STR: 3, END: 2 },
    baseStats: { armor: 22, maxHp: 65 },
    tier5Unique: {
      uniqueName: 'Pillar-Greaves of the Earthshaker',
      uniqueLore: 'Massive greaves that ground the wearer against impossible momentum.',
      passiveId: 'unique_pillar_greaves',
      passiveName: 'Immovable Stance',
      passiveDescription: 'Grants +30% Armor and +20% Max HP.',
      passiveModifiers: { armorPct: 0.3, maxHpPct: 0.2 },
    },
  },
  {
    baseSlug: 'acrobat_silk_leggings',
    baseName: 'Blade-Dancer Silk Leggings',
    description: 'Silk breeches allowing unrestricted split-second pirouettes.',
    itemType: 'LEGS',
    slot: 'legs',
    iconKey: 'leggings',
    baseGoldValue: 155,
    statRequirements: { AGI: 4 },
    baseStats: { armor: 11, dodgeChancePct: 0.05, attackSpeedPct: 0.04 },
    tier5Unique: {
      uniqueName: 'Mirage-Weave Dancer Wraps',
      uniqueLore: 'Woven to create illusory after-images with every spinning step.',
      passiveId: 'unique_mirage_wraps',
      passiveName: 'Mirage Flurry',
      passiveDescription: 'Grants +25% Attack Speed and +20% Dodge Rating.',
      passiveModifiers: { attackSpeedPct: 0.25, dodgeRatingBonus: 0.2 },
    },
  },

  // --- Boots (3) ---
  {
    baseSlug: 'ironshod_sabatons',
    baseName: 'Ironshod March Boots',
    description: 'Heavy plated sabatons guarding feet from caltrops and rubble.',
    itemType: 'BOOTS',
    slot: 'boots',
    iconKey: 'boots',
    baseGoldValue: 130,
    statRequirements: { STR: 2, END: 2 },
    baseStats: { armor: 15, maxHp: 40, hazardResistancePct: 0.06 },
    tier5Unique: {
      uniqueName: 'Tremor-Treads of the Siegebreaker',
      uniqueLore: 'Spiked iron soles that shake the ramparts with every advance.',
      passiveId: 'unique_tremor_treads',
      passiveName: 'Siege Stride',
      passiveDescription: 'Grants +25% Armor and +20% Hazard Resistance.',
      passiveModifiers: { armorPct: 0.25, hazardResistancePct: 0.2 },
    },
  },
  {
    baseSlug: 'phantom_step_treads',
    baseName: 'Phantom-Step Tabi Boots',
    description: 'Split-toe stealth boots muffling sound on stone or brush.',
    itemType: 'BOOTS',
    slot: 'boots',
    iconKey: 'tabi',
    baseGoldValue: 145,
    statRequirements: { AGI: 3 },
    baseStats: { armor: 10, dodgeChancePct: 0.06, critChancePct: 0.03 },
    tier5Unique: {
      uniqueName: 'Void-Walkers of the Unseen Blade',
      uniqueLore: 'Soft-soled boots leaving neither footprints nor whispers.',
      passiveId: 'unique_void_walkers',
      passiveName: 'Ghost Step',
      passiveDescription: 'Grants +25% Dodge Rating and +15% Crit Chance.',
      passiveModifiers: { dodgeRatingBonus: 0.25, critChanceBonus: 0.15 },
    },
  },
  {
    baseSlug: 'glacial_reaver_stompers',
    baseName: 'Glacial Reaver Warboots',
    description: 'Spiked boots made for crushing frozen terrain and skulls alike.',
    itemType: 'BOOTS',
    slot: 'boots',
    iconKey: 'warboots',
    baseGoldValue: 150,
    statRequirements: { STR: 3, END: 1 },
    baseStats: { armor: 16, meleePower: 6, maxHp: 45 },
    tier5Unique: {
      uniqueName: 'Avalanche-Striders of the North',
      uniqueLore: 'Fur-lined boots capped in ice-forged steel.',
      passiveId: 'unique_avalanche_striders',
      passiveName: 'Frost Titan March',
      passiveDescription: 'Grants +20% Max HP, +20% Armor, and +20% Melee Power.',
      passiveModifiers: { maxHpPct: 0.2, armorPct: 0.2, meleePowerPct: 0.2 },
    },
  },

  // --- Accessories — Rings & Amulets (4) ---
  {
    baseSlug: 'copper_guild_ring',
    baseName: 'Copper Guild Signet',
    description: 'Brass signet ring marking official membership in the guild.',
    itemType: 'ACCESSORY',
    slot: 'accessory1',
    iconKey: 'ring',
    baseGoldValue: 110,
    statRequirements: { STR: 1, END: 1, AGI: 1 },
    baseStats: { meleePower: 5, maxHp: 30, maxStamina: 15 },
    tier5Unique: {
      uniqueName: 'Grandmaster Seal of Verethor',
      uniqueLore: 'The seal of the founding guildmaster, radiating enduring authority.',
      passiveId: 'unique_guildmaster_seal',
      passiveName: 'Guild Ascendancy',
      passiveDescription: 'Grants +15% to All Stats and +15% Gold Spoils.',
      passiveModifiers: {
        meleePowerPct: 0.15,
        maxHpPct: 0.15,
        armorPct: 0.15,
        partyLootBonusPct: 0.15,
      },
    },
  },
  {
    baseSlug: 'crimson_oni_charm',
    baseName: 'Crimson Oni War-Charm',
    description: 'Talisman carved from volcanic jet that heats when rage builds.',
    itemType: 'ACCESSORY',
    slot: 'accessory1',
    iconKey: 'charm',
    baseGoldValue: 160,
    statRequirements: { STR: 2, DEX: 1 },
    baseStats: { meleePower: 11, critChancePct: 0.04 },
    tier5Unique: {
      uniqueName: 'Blood-Soul Talisman of the Warlord',
      uniqueLore: 'A cursed relic vibrating with the heartbeat of ancient warriors.',
      passiveId: 'unique_blood_talisman',
      passiveName: 'Blood Feast',
      passiveDescription: 'Grants +25% Melee Power and +15% Crit Chance.',
      passiveModifiers: { meleePowerPct: 0.25, critChanceBonus: 0.15 },
    },
  },
  {
    baseSlug: 'malakor_signet',
    baseName: "Malakor's Signet Ring",
    description: 'Trophy ring dropped by Bone Lord Malakor.',
    itemType: 'ACCESSORY',
    slot: 'accessory1',
    iconKey: 'ring',
    baseGoldValue: 500,
    statRequirements: { STR: 2, END: 2, AGI: 2 },
    baseStats: { meleePower: 14, maxHp: 65, critChancePct: 0.05 },
    tier5Unique: {
      uniqueName: 'Bone-Sovereign Phylactery Band',
      uniqueLore: 'Carved from the blackened ribs of Malakor, hungering for vitality.',
      passiveId: 'unique_malakor_phylactery',
      passiveName: 'Necrotic Dominion',
      passiveDescription: 'Grants +25% Melee Power, +20% Max HP, and +20% Crit Multiplier.',
      passiveModifiers: { meleePowerPct: 0.25, maxHpPct: 0.2, critDamageBonus: 0.2 },
    },
  },
  {
    baseSlug: 'astral_teardrop_amulet',
    baseName: 'Astral Teardrop Pendant',
    description: 'Glowing sapphire pendant containing an encapsulated shooting star.',
    itemType: 'ACCESSORY',
    slot: 'accessory1',
    iconKey: 'amulet',
    baseGoldValue: 240,
    statRequirements: { WIS: 2, SPR: 2 },
    baseStats: { startOfCombatShieldHp: 30, critChancePct: 0.04, maxStamina: 20 },
    tier5Unique: {
      uniqueName: 'Heart of the Falling Star',
      uniqueLore: 'A sliver of fallen meteor pulsing with infinite astral energy.',
      passiveId: 'unique_falling_star',
      passiveName: 'Astral Resonance',
      passiveDescription:
        'Grants +25% Start-of-Combat Shield HP, +20% Crit Chance, and +20% Cooldown Haste.',
      passiveModifiers: {
        partyBossShieldMaxHpPct: 0.25,
        critChanceBonus: 0.2,
        cooldownHastePct: 0.2,
      },
    },
  },
];

export const BASE_EQUIPPABLE_ITEM_BY_SLUG: Record<string, BaseEquippableItemDefinition> =
  BASE_EQUIPPABLE_ITEMS.reduce(
    (acc, item) => {
      acc[item.baseSlug] = item;
      return acc;
    },
    {} as Record<string, BaseEquippableItemDefinition>
  );

// ============================================================================
// 3. PREFIX REGISTRY (12 SECONDARY COMBAT MODIFIERS)
// ============================================================================

export interface ItemPrefixDefinition {
  id: string;
  label: string;
  stats: ItemBaseStats;
}

export const ITEM_PREFIXES: readonly ItemPrefixDefinition[] = [
  { id: 'quick', label: 'Quick', stats: { attackSpeedPct: 0.05 } },
  { id: 'frenzied', label: 'Frenzied', stats: { attackSpeedPct: 0.04, meleePower: 5 } },
  { id: 'keen', label: 'Keen', stats: { critChancePct: 0.03 } },
  { id: 'merciless', label: 'Merciless', stats: { critDamagePct: 0.12, meleePower: 6 } },
  { id: 'brutal', label: 'Brutal', stats: { meleePower: 9 } },
  { id: 'stalwart', label: 'Stalwart', stats: { armor: 8 } },
  { id: 'impenetrable', label: 'Impenetrable', stats: { damageMitigationPct: 0.03, armor: 6 } },
  { id: 'evasive', label: 'Evasive', stats: { dodgeChancePct: 0.03 } },
  { id: 'vital', label: 'Vital', stats: { maxHp: 40 } },
  { id: 'tireless', label: 'Tireless', stats: { maxStamina: 20 } },
  { id: 'vampiric', label: 'Vampiric', stats: { lifeOnHit: 6, maxHp: 20 } },
  { id: 'warded', label: 'Warded', stats: { hazardResistancePct: 0.08, armor: 4 } },
];

export const ITEM_PREFIX_BY_ID: Record<string, ItemPrefixDefinition> = ITEM_PREFIXES.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<string, ItemPrefixDefinition>
);

// ============================================================================
// 4. SUFFIX REGISTRY (10 PRIMARY 7-STAT MODIFIERS)
// ============================================================================

export interface ItemSuffixDefinition {
  id: string;
  label: string;
  primaryStats: PrimaryStatBonuses;
  combatStats: ItemBaseStats;
}

export const ITEM_SUFFIXES: readonly ItemSuffixDefinition[] = [
  {
    id: 'of_the_titan',
    label: 'of the Titan',
    primaryStats: { STR: 2 },
    combatStats: { meleePower: 6 },
  },
  {
    id: 'of_the_boar',
    label: 'of the Boar',
    primaryStats: { STR: 1, CON: 2 },
    combatStats: { maxHp: 35 },
  },
  {
    id: 'of_the_mammoth',
    label: 'of the Mammoth',
    primaryStats: { END: 2 },
    combatStats: { maxStamina: 18 },
  },
  {
    id: 'of_the_falcon',
    label: 'of the Falcon',
    primaryStats: { AGI: 2 },
    combatStats: { critChancePct: 0.02, dodgeChancePct: 0.02 },
  },
  {
    id: 'of_the_viper',
    label: 'of the Viper',
    primaryStats: { DEX: 2 },
    combatStats: { critChancePct: 0.02, armorPenetrationPct: 0.05 },
  },
  {
    id: 'of_the_colossus',
    label: 'of the Colossus',
    primaryStats: { CON: 3 },
    combatStats: { maxHp: 45, armor: 5 },
  },
  {
    id: 'of_the_owl',
    label: 'of the Owl',
    primaryStats: { WIS: 2 },
    combatStats: { skillPotencyPct: 0.06, maxStamina: 12 },
  },
  {
    id: 'of_the_phoenix',
    label: 'of the Phoenix',
    primaryStats: { SPR: 2 },
    combatStats: { startOfCombatShieldHp: 35, maxHp: 25 },
  },
  {
    id: 'of_the_oni',
    label: 'of the Oni',
    primaryStats: { STR: 2, AGI: 1 },
    combatStats: { meleePower: 7 },
  },
  {
    id: 'of_verethor',
    label: 'of Verethor',
    primaryStats: { STR: 1, END: 1, AGI: 1, DEX: 1, CON: 1, WIS: 1, SPR: 1 },
    combatStats: { maxHp: 30, meleePower: 4 },
  },
];

export const ITEM_SUFFIX_BY_ID: Record<string, ItemSuffixDefinition> = ITEM_SUFFIXES.reduce(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {} as Record<string, ItemSuffixDefinition>
);

// ============================================================================
// 5. DETERMINISTIC PROCEDURAL GENERATOR
// ============================================================================

export interface RollProceduralItemOptions {
  baseSlug: string;
  tier?: ItemTier;
  seed: string | number;
  forcePrefixId?: string | null;
  forceSuffixId?: string | null;
}

export interface RolledProceduralItemInstance {
  itemSlug: string;
  baseSlug: string;
  displayName: string;
  baseName: string;
  tier: ItemTier;
  tierConfig: ItemTierConfig;
  rarity: ItemRarity;
  itemType: EquipItemType;
  slot: EquipmentSlot;
  handedness?: 'ONE_HANDED' | 'TWO_HANDED';
  iconKey: string;
  goldValue: number;
  description: string;
  statRequirements: PrimaryStatBonuses;
  prefix: ItemPrefixDefinition | null;
  prefixId?: string | null;
  prefixLabel?: string | null;
  suffix: ItemSuffixDefinition | null;
  suffixId?: string | null;
  suffixLabel?: string | null;
  scaledBaseStats: ItemBaseStats;
  scaledPrefixStats: ItemBaseStats | null;
  scaledSuffixCombatStats: ItemBaseStats | null;
  scaledSuffixPrimaryStats: PrimaryStatBonuses | null;
  totalStats: ItemBaseStats;
  statBonuses: EquipmentStatBonuses;
  primaryStatBonuses: PrimaryStatBonuses;
  prefixSummary: string | null;
  suffixSummary: string | null;
  baseStatsSummary: string;
  uniquePassive: Tier5UniqueDefinition | null;
}

function roundTo2(val: number): number {
  return Math.round(val * 100) / 100;
}

function scaleStatValue(
  val: number | undefined,
  mult: number,
  isPercentage: boolean
): number | undefined {
  if (val === undefined) return undefined;
  if (isPercentage) {
    return roundTo2(val * mult);
  }
  return Math.max(1, Math.round(val * mult));
}

function scaleBaseStats(stats: ItemBaseStats, mult: number): ItemBaseStats {
  const scaled: ItemBaseStats = {};
  if (stats.meleePower !== undefined)
    scaled.meleePower = scaleStatValue(stats.meleePower, mult, false);
  if (stats.armor !== undefined) scaled.armor = scaleStatValue(stats.armor, mult, false);
  if (stats.maxHp !== undefined) scaled.maxHp = scaleStatValue(stats.maxHp, mult, false);
  if (stats.maxStamina !== undefined)
    scaled.maxStamina = scaleStatValue(stats.maxStamina, mult, false);
  if (stats.lifeOnHit !== undefined)
    scaled.lifeOnHit = scaleStatValue(stats.lifeOnHit, mult, false);
  if (stats.startOfCombatShieldHp !== undefined)
    scaled.startOfCombatShieldHp = scaleStatValue(stats.startOfCombatShieldHp, mult, false);

  if (stats.critChancePct !== undefined)
    scaled.critChancePct = scaleStatValue(stats.critChancePct, mult, true);
  if (stats.critDamagePct !== undefined)
    scaled.critDamagePct = scaleStatValue(stats.critDamagePct, mult, true);
  if (stats.attackSpeedPct !== undefined)
    scaled.attackSpeedPct = scaleStatValue(stats.attackSpeedPct, mult, true);
  if (stats.dodgeChancePct !== undefined)
    scaled.dodgeChancePct = scaleStatValue(stats.dodgeChancePct, mult, true);
  if (stats.damageMitigationPct !== undefined)
    scaled.damageMitigationPct = scaleStatValue(stats.damageMitigationPct, mult, true);
  if (stats.armorPenetrationPct !== undefined)
    scaled.armorPenetrationPct = scaleStatValue(stats.armorPenetrationPct, mult, true);
  if (stats.skillPotencyPct !== undefined)
    scaled.skillPotencyPct = scaleStatValue(stats.skillPotencyPct, mult, true);
  if (stats.hazardResistancePct !== undefined)
    scaled.hazardResistancePct = scaleStatValue(stats.hazardResistancePct, mult, true);

  return scaled;
}

function scalePrimaryStats(stats: PrimaryStatBonuses, mult: number): PrimaryStatBonuses {
  const scaled: PrimaryStatBonuses = {};
  const keys: (keyof PrimaryStatBonuses)[] = ['STR', 'END', 'AGI', 'DEX', 'CON', 'WIS', 'SPR'];
  for (const k of keys) {
    if (stats[k] !== undefined) {
      scaled[k] = Math.max(1, Math.round(stats[k]! * mult));
    }
  }
  return scaled;
}

function mergeStats(...statBlocks: (ItemBaseStats | null | undefined)[]): ItemBaseStats {
  const res: ItemBaseStats = {};
  for (const block of statBlocks) {
    if (!block) continue;
    if (block.meleePower) res.meleePower = (res.meleePower ?? 0) + block.meleePower;
    if (block.armor) res.armor = (res.armor ?? 0) + block.armor;
    if (block.maxHp) res.maxHp = (res.maxHp ?? 0) + block.maxHp;
    if (block.maxStamina) res.maxStamina = (res.maxStamina ?? 0) + block.maxStamina;
    if (block.lifeOnHit) res.lifeOnHit = (res.lifeOnHit ?? 0) + block.lifeOnHit;
    if (block.startOfCombatShieldHp)
      res.startOfCombatShieldHp = (res.startOfCombatShieldHp ?? 0) + block.startOfCombatShieldHp;

    if (block.critChancePct)
      res.critChancePct = roundTo2((res.critChancePct ?? 0) + block.critChancePct);
    if (block.critDamagePct)
      res.critDamagePct = roundTo2((res.critDamagePct ?? 0) + block.critDamagePct);
    if (block.attackSpeedPct)
      res.attackSpeedPct = roundTo2((res.attackSpeedPct ?? 0) + block.attackSpeedPct);
    if (block.dodgeChancePct)
      res.dodgeChancePct = roundTo2((res.dodgeChancePct ?? 0) + block.dodgeChancePct);
    if (block.damageMitigationPct)
      res.damageMitigationPct = roundTo2((res.damageMitigationPct ?? 0) + block.damageMitigationPct);
    if (block.armorPenetrationPct)
      res.armorPenetrationPct = roundTo2((res.armorPenetrationPct ?? 0) + block.armorPenetrationPct);
    if (block.skillPotencyPct)
      res.skillPotencyPct = roundTo2((res.skillPotencyPct ?? 0) + block.skillPotencyPct);
    if (block.hazardResistancePct)
      res.hazardResistancePct = roundTo2((res.hazardResistancePct ?? 0) + block.hazardResistancePct);
  }
  return res;
}

export function formatStatSummary(stats: ItemBaseStats): string {
  const parts: string[] = [];
  if (stats.meleePower) parts.push(`+${stats.meleePower} Melee Power`);
  if (stats.armor) parts.push(`+${stats.armor} Armor`);
  if (stats.maxHp) parts.push(`+${stats.maxHp} Max HP`);
  if (stats.maxStamina) parts.push(`+${stats.maxStamina} Max Stamina`);
  if (stats.attackSpeedPct) parts.push(`+${Math.round(stats.attackSpeedPct * 100)}% Attack Speed`);
  if (stats.critChancePct) parts.push(`+${Math.round(stats.critChancePct * 100)}% Crit Chance`);
  if (stats.critDamagePct) parts.push(`+${Math.round(stats.critDamagePct * 100)}% Crit Damage`);
  if (stats.dodgeChancePct) parts.push(`+${Math.round(stats.dodgeChancePct * 100)}% Dodge`);
  if (stats.damageMitigationPct)
    parts.push(`+${Math.round(stats.damageMitigationPct * 100)}% Mitigation`);
  if (stats.lifeOnHit) parts.push(`+${stats.lifeOnHit} Life On Hit`);
  if (stats.startOfCombatShieldHp)
    parts.push(`+${stats.startOfCombatShieldHp} Shield HP`);
  if (stats.hazardResistancePct)
    parts.push(`+${Math.round(stats.hazardResistancePct * 100)}% Hazard Resist`);
  if (stats.armorPenetrationPct)
    parts.push(`+${Math.round(stats.armorPenetrationPct * 100)}% Armor Pen`);
  if (stats.skillPotencyPct)
    parts.push(`+${Math.round(stats.skillPotencyPct * 100)}% Skill Potency`);
  return parts.join(' • ');
}

export function formatPrimaryStatSummary(stats: PrimaryStatBonuses): string {
  const parts: string[] = [];
  const keys: (keyof PrimaryStatBonuses)[] = ['STR', 'END', 'AGI', 'DEX', 'CON', 'WIS', 'SPR'];
  for (const k of keys) {
    if (stats[k]) parts.push(`+${stats[k]} ${k}`);
  }
  return parts.join(', ');
}

/**
 * Deterministically generates an item instance across Tiers 1-5 with prefix/suffix rolls.
 */
export function rollProceduralItemInstance(
  options: RollProceduralItemOptions
): RolledProceduralItemInstance {
  const baseItem =
    BASE_EQUIPPABLE_ITEM_BY_SLUG[options.baseSlug] ?? BASE_EQUIPPABLE_ITEMS[0]!;
  const tier: ItemTier = options.tier ?? 1;
  const tierConfig = ITEM_TIER_CONFIG[tier];
  const rng = createSeededRng(`${options.seed}:${options.baseSlug}:${tier}`);

  let prefix: ItemPrefixDefinition | null = null;
  let suffix: ItemSuffixDefinition | null = null;

  if (tier === 1) {
    // TIER 1: At most ONE affix (prefix XOR suffix, or neither). NEVER both!
    if (options.forcePrefixId) {
      prefix = ITEM_PREFIX_BY_ID[options.forcePrefixId] ?? null;
      suffix = null;
    } else if (options.forceSuffixId) {
      prefix = null;
      suffix = ITEM_SUFFIX_BY_ID[options.forceSuffixId] ?? null;
    } else {
      const r = rng.nextFloat();
      if (r < 0.45) {
        prefix = null;
        suffix = null;
      } else if (r < 0.725) {
        prefix = rng.pick(ITEM_PREFIXES);
        suffix = null;
      } else {
        prefix = null;
        suffix = rng.pick(ITEM_SUFFIXES);
      }
    }
  } else if (tier === 2) {
    // TIER 2: Independent rolls (65% Prefix, 65% Suffix)
    if (options.forcePrefixId !== undefined) {
      prefix = options.forcePrefixId ? ITEM_PREFIX_BY_ID[options.forcePrefixId] ?? null : null;
    } else {
      prefix = rng.nextFloat() < 0.65 ? rng.pick(ITEM_PREFIXES) : null;
    }

    if (options.forceSuffixId !== undefined) {
      suffix = options.forceSuffixId ? ITEM_SUFFIX_BY_ID[options.forceSuffixId] ?? null : null;
    } else {
      suffix = rng.nextFloat() < 0.65 ? rng.pick(ITEM_SUFFIXES) : null;
    }
  } else if (tier === 3) {
    // TIER 3: 85% Prefix, 85% Suffix, guaranteed at least one
    if (options.forcePrefixId !== undefined) {
      prefix = options.forcePrefixId ? ITEM_PREFIX_BY_ID[options.forcePrefixId] ?? null : null;
    } else {
      prefix = rng.nextFloat() < 0.85 ? rng.pick(ITEM_PREFIXES) : null;
    }

    if (options.forceSuffixId !== undefined) {
      suffix = options.forceSuffixId ? ITEM_SUFFIX_BY_ID[options.forceSuffixId] ?? null : null;
    } else {
      suffix = rng.nextFloat() < 0.85 ? rng.pick(ITEM_SUFFIXES) : null;
    }

    // Ensure at least one affix
    if (!prefix && !suffix) {
      if (rng.nextFloat() < 0.5) {
        prefix = rng.pick(ITEM_PREFIXES);
      } else {
        suffix = rng.pick(ITEM_SUFFIXES);
      }
    }
  } else {
    // TIER 4 & 5: 100% Guaranteed Prefix AND Suffix
    prefix =
      options.forcePrefixId !== undefined && options.forcePrefixId !== null
        ? ITEM_PREFIX_BY_ID[options.forcePrefixId] ?? rng.pick(ITEM_PREFIXES)
        : rng.pick(ITEM_PREFIXES);

    suffix =
      options.forceSuffixId !== undefined && options.forceSuffixId !== null
        ? ITEM_SUFFIX_BY_ID[options.forceSuffixId] ?? rng.pick(ITEM_SUFFIXES)
        : rng.pick(ITEM_SUFFIXES);
  }

  // Scale base stats and affixes
  const scaledBaseStats = scaleBaseStats(baseItem.baseStats, tierConfig.baseStatMultiplier);
  const scaledPrefixStats = prefix
    ? scaleBaseStats(prefix.stats, tierConfig.affixStatMultiplier)
    : null;
  const scaledSuffixCombatStats = suffix
    ? scaleBaseStats(suffix.combatStats, tierConfig.affixStatMultiplier)
    : null;
  const scaledSuffixPrimaryStats = suffix
    ? scalePrimaryStats(suffix.primaryStats, tierConfig.affixStatMultiplier)
    : null;

  const totalStats = mergeStats(
    scaledBaseStats,
    scaledPrefixStats,
    scaledSuffixCombatStats
  );

  const primaryStatBonuses: PrimaryStatBonuses = {
    ...(scaledSuffixPrimaryStats ?? {}),
  };

  const statBonuses: EquipmentStatBonuses = {
    meleePower: totalStats.meleePower,
    armorRating: totalStats.armor,
    maxHp: totalStats.maxHp,
    maxStamina: totalStats.maxStamina,
    critChance: totalStats.critChancePct,
    critMultiplier: totalStats.critDamagePct,
    attackSpeedPct: totalStats.attackSpeedPct,
    dodgeRating: totalStats.dodgeChancePct,
    damageMitigationPct: totalStats.damageMitigationPct,
    lifeOnHit: totalStats.lifeOnHit,
    armorPenetrationPct: totalStats.armorPenetrationPct,
    skillPotencyPct: totalStats.skillPotencyPct,
    startOfCombatShieldHp: totalStats.startOfCombatShieldHp,
    hazardResistancePct: totalStats.hazardResistancePct,
  };

  // Name construction
  let displayName = '';
  let uniquePassive: Tier5UniqueDefinition | null = null;

  if (tier === 5) {
    displayName = `★ ${baseItem.tier5Unique.uniqueName}`;
    uniquePassive = baseItem.tier5Unique;
  } else {
    const parts: string[] = [];
    if (prefix) parts.push(prefix.label);
    parts.push(baseItem.baseName);
    if (suffix) parts.push(suffix.label);
    displayName = parts.join(' ');
  }

  const prefixSummary = scaledPrefixStats ? formatStatSummary(scaledPrefixStats) : null;
  const suffixParts: string[] = [];
  if (scaledSuffixPrimaryStats) {
    const primStr = formatPrimaryStatSummary(scaledSuffixPrimaryStats);
    if (primStr) suffixParts.push(primStr);
  }
  if (scaledSuffixCombatStats) {
    const combatStr = formatStatSummary(scaledSuffixCombatStats);
    if (combatStr) suffixParts.push(combatStr);
  }
  const suffixSummary = suffixParts.length > 0 ? suffixParts.join(' • ') : null;

  const baseStatsFormatted = formatStatSummary(scaledBaseStats);
  const baseStatsSummary = `${baseStatsFormatted} (Tier ${tierConfig.romanNumeral} • ${tierConfig.baseStatMultiplier}x)`;

  const goldValue = Math.round(baseItem.baseGoldValue * tierConfig.goldMultiplier);

  return {
    itemSlug: baseItem.baseSlug,
    baseSlug: baseItem.baseSlug,
    displayName,
    baseName: baseItem.baseName,
    tier,
    tierConfig,
    rarity: tierConfig.rarity,
    itemType: baseItem.itemType,
    slot: baseItem.slot,
    handedness: baseItem.handedness,
    iconKey: baseItem.iconKey,
    goldValue,
    description: baseItem.description,
    statRequirements: baseItem.statRequirements,
    prefix,
    prefixId: prefix?.id ?? null,
    prefixLabel: prefix?.label ?? null,
    suffix,
    suffixId: suffix?.id ?? null,
    suffixLabel: suffix?.label ?? null,
    scaledBaseStats,
    scaledPrefixStats,
    scaledSuffixCombatStats,
    scaledSuffixPrimaryStats,
    totalStats,
    statBonuses,
    primaryStatBonuses,
    prefixSummary,
    suffixSummary,
    baseStatsSummary,
    uniquePassive,
  };
}

export function proceduralItemToLootDrop(item: RolledProceduralItemInstance): LootDrop {
  return {
    itemSlug: item.itemSlug,
    itemName: item.displayName,
    rarity: item.rarity,
    quantity: 1,
    baseSlug: item.baseSlug,
    tier: item.tier,
    prefixId: item.prefix?.id ?? null,
    prefixLabel: item.prefix?.label ?? null,
    prefixSummary: item.prefixSummary,
    suffixId: item.suffix?.id ?? null,
    suffixLabel: item.suffix?.label ?? null,
    suffixSummary: item.suffixSummary,
    baseStatsSummary: item.baseStatsSummary,
    statBonuses: item.statBonuses,
    primaryStatBonuses: item.primaryStatBonuses,
    uniquePassive: item.uniquePassive
      ? {
          uniqueName: item.uniquePassive.uniqueName,
          uniqueLore: item.uniquePassive.uniqueLore,
          passiveId: item.uniquePassive.passiveId,
          passiveName: item.uniquePassive.passiveName,
          passiveDescription: item.uniquePassive.passiveDescription,
          passiveModifiers: item.uniquePassive.passiveModifiers as Record<string, number>,
        }
      : null,
  };
}

export function rollChestProceduralGearDrop(params: {
  chestTier: 'COMMON' | 'RARE' | 'EPIC';
  seed: string | number;
  baseSlug?: string;
}): LootDrop {
  const rng = createSeededRng(`chest-gear:${params.seed}`);
  const baseItem =
    (params.baseSlug && BASE_EQUIPPABLE_ITEM_BY_SLUG[params.baseSlug]) ||
    rng.pick(BASE_EQUIPPABLE_ITEMS) ||
    BASE_EQUIPPABLE_ITEMS[0];

  let tier: ItemTier = 1;
  const roll = rng.nextFloat();
  if (params.chestTier === 'COMMON') {
    tier = roll < 0.75 ? 1 : 2;
  } else if (params.chestTier === 'RARE') {
    if (roll < 0.55) tier = 2;
    else if (roll < 0.9) tier = 3;
    else tier = 4;
  } else {
    // EPIC
    if (roll < 0.45) tier = 3;
    else if (roll < 0.85) tier = 4;
    else tier = 5;
  }

  const rolled = rollProceduralItemInstance({
    baseSlug: baseItem.baseSlug,
    tier,
    seed: `chest-drop:${params.seed}`,
  });
  return proceduralItemToLootDrop(rolled);
}

export function rollDungeonProceduralGearDrop(params: {
  dungeonRank: string;
  isBossRoom?: boolean;
  seed: string | number;
  baseSlug?: string;
}): LootDrop {
  const rng = createSeededRng(`dungeon-gear:${params.seed}`);
  const baseItem =
    (params.baseSlug && BASE_EQUIPPABLE_ITEM_BY_SLUG[params.baseSlug]) ||
    rng.pick(BASE_EQUIPPABLE_ITEMS) ||
    BASE_EQUIPPABLE_ITEMS[0];
  const roll = rng.nextFloat();
  const rank = params.dungeonRank.toUpperCase();

  let tier: ItemTier = 1;
  if (rank === 'COPPER') {
    tier = params.isBossRoom && roll < 0.4 ? 2 : 1;
  } else if (rank === 'IRON') {
    tier = params.isBossRoom ? (roll < 0.6 ? 3 : 2) : roll < 0.5 ? 2 : 1;
  } else if (rank === 'BRONZE') {
    tier = params.isBossRoom ? (roll < 0.5 ? 4 : 3) : roll < 0.6 ? 3 : 2;
  } else if (rank === 'SILVER') {
    if (params.isBossRoom && roll < 0.15) {
      tier = 5;
    } else {
      tier = params.isBossRoom ? 4 : roll < 0.6 ? 3 : 4;
    }
  } else {
    // GOLD or higher
    if (params.isBossRoom && roll < 0.35) {
      tier = 5;
    } else {
      tier = params.isBossRoom ? 4 : roll < 0.5 ? 3 : 4;
    }
  }

  const rolled = rollProceduralItemInstance({
    baseSlug: baseItem.baseSlug,
    tier,
    seed: `dungeon-drop:${params.seed}`,
  });
  return proceduralItemToLootDrop(rolled);
}

export function rollRaidProceduralGearDrop(params: {
  contributionTier: 'S' | 'A' | 'B' | 'C' | 'PARTICIPATION';
  isBossDefeated: boolean;
  seed: string | number;
  baseSlug?: string;
}): LootDrop {
  const rng = createSeededRng(`raid-gear:${params.seed}`);
  const baseItem =
    (params.baseSlug && BASE_EQUIPPABLE_ITEM_BY_SLUG[params.baseSlug]) ||
    rng.pick(BASE_EQUIPPABLE_ITEMS) ||
    BASE_EQUIPPABLE_ITEMS[0];
  const roll = rng.nextFloat();

  let tier: ItemTier = 3;
  if (params.contributionTier === 'S') {
    tier = params.isBossDefeated && roll < 0.4 ? 5 : 4;
  } else if (params.contributionTier === 'A') {
    tier = params.isBossDefeated && roll < 0.2 ? 5 : roll < 0.7 ? 4 : 3;
  } else if (params.contributionTier === 'B') {
    tier = roll < 0.4 ? 4 : 3;
  } else {
    tier = roll < 0.25 ? 3 : 2;
  }

  const rolled = rollProceduralItemInstance({
    baseSlug: baseItem.baseSlug,
    tier,
    seed: `raid-drop:${params.seed}`,
  });
  return proceduralItemToLootDrop(rolled);
}

export function aggregateEquippedItemModifiers(
  equippedItems: readonly Partial<{
    statBonuses?: EquipmentStatBonuses;
    primaryStatBonuses?: PrimaryStatBonuses;
    uniquePassive?: Tier5UniqueDefinition | { passiveModifiers?: Partial<CombatModifiers> } | null;
  }>[]
): {
  equipmentBonuses: EquipmentStatBonuses;
  primaryStatBonuses: PrimaryStatBonuses;
  uniquePassiveModifiers: Partial<CombatModifiers>;
} {
  const bonuses: EquipmentStatBonuses = {};
  const prim: PrimaryStatBonuses = {};
  const uniqueMods: Partial<CombatModifiers> = {};

  for (const it of equippedItems) {
    if (!it) continue;
    if (it.statBonuses) {
      const b = it.statBonuses;
      if (b.meleePower) bonuses.meleePower = (bonuses.meleePower ?? 0) + b.meleePower;
      if (b.armorRating) bonuses.armorRating = (bonuses.armorRating ?? 0) + b.armorRating;
      if (b.maxHp) bonuses.maxHp = (bonuses.maxHp ?? 0) + b.maxHp;
      if (b.maxStamina) bonuses.maxStamina = (bonuses.maxStamina ?? 0) + b.maxStamina;
      if (b.attackSpeedPct)
        bonuses.attackSpeedPct = roundTo2((bonuses.attackSpeedPct ?? 0) + b.attackSpeedPct);
      if (b.dodgeRating)
        bonuses.dodgeRating = roundTo2((bonuses.dodgeRating ?? 0) + b.dodgeRating);
      if (b.critChance)
        bonuses.critChance = roundTo2((bonuses.critChance ?? 0) + b.critChance);
      if (b.critMultiplier)
        bonuses.critMultiplier = roundTo2((bonuses.critMultiplier ?? 0) + b.critMultiplier);
      if (b.damageMitigationPct)
        bonuses.damageMitigationPct = roundTo2(
          (bonuses.damageMitigationPct ?? 0) + b.damageMitigationPct
        );
      if (b.lifeOnHit) bonuses.lifeOnHit = (bonuses.lifeOnHit ?? 0) + b.lifeOnHit;
      if (b.armorPenetrationPct)
        bonuses.armorPenetrationPct = roundTo2(
          (bonuses.armorPenetrationPct ?? 0) + b.armorPenetrationPct
        );
      if (b.skillPotencyPct)
        bonuses.skillPotencyPct = roundTo2(
          (bonuses.skillPotencyPct ?? 0) + b.skillPotencyPct
        );
      if (b.startOfCombatShieldHp)
        bonuses.startOfCombatShieldHp =
          (bonuses.startOfCombatShieldHp ?? 0) + b.startOfCombatShieldHp;
      if (b.hazardResistancePct)
        bonuses.hazardResistancePct = roundTo2(
          (bonuses.hazardResistancePct ?? 0) + b.hazardResistancePct
        );
    }

    if (it.primaryStatBonuses) {
      const p = it.primaryStatBonuses;
      if (p.STR) prim.STR = (prim.STR ?? 0) + p.STR;
      if (p.END) prim.END = (prim.END ?? 0) + p.END;
      if (p.AGI) prim.AGI = (prim.AGI ?? 0) + p.AGI;
      if (p.DEX) prim.DEX = (prim.DEX ?? 0) + p.DEX;
      if (p.CON) prim.CON = (prim.CON ?? 0) + p.CON;
      if (p.WIS) prim.WIS = (prim.WIS ?? 0) + p.WIS;
      if (p.SPR) prim.SPR = (prim.SPR ?? 0) + p.SPR;
    }

    if (it.uniquePassive && 'passiveModifiers' in it.uniquePassive && it.uniquePassive.passiveModifiers) {
      const mods = it.uniquePassive.passiveModifiers as Partial<CombatModifiers>;
      for (const [k, v] of Object.entries(mods)) {
        if (typeof v === 'number') {
          const key = k as keyof CombatModifiers;
          (uniqueMods as any)[key] = roundTo2(((uniqueMods as any)[key] ?? 0) + v);
        }
      }
    }
  }

  return {
    equipmentBonuses: bonuses,
    primaryStatBonuses: prim,
    uniquePassiveModifiers: uniqueMods,
  };
}
