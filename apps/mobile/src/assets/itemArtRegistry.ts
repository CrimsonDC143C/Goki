import { ImageSourcePropType } from 'react-native';

/**
 * 40 High-Res (512x512 LANCZOS PNG) RPG Item Icons.
 * Hades-inspired comic cel-shaded ink art generated via Layer.ai.
 */
export const ITEM_ICON_REGISTRY: Record<string, ImageSourcePropType> = {
  // Weapons
  ironbound_greatsword: require('../../assets/items/ironbound_greatsword.png'),
  spiked_kanabo: require('../../assets/items/spiked_kanabo.png'),
  ashwood_longbow: require('../../assets/items/ashwood_longbow.png'),
  blackened_halberd: require('../../assets/items/blackened_halberd.png'),
  astral_warstaff: require('../../assets/items/astral_warstaff.png'),
  watch_broadsword: require('../../assets/items/watch_broadsword.png'),
  windrunner_daggers: require('../../assets/items/windrunner_daggers.png'),
  reaver_hatchet: require('../../assets/items/reaver_hatchet.png'),
  kensei_katana: require('../../assets/items/kensei_katana.png'),
  reliquary_mace: require('../../assets/items/reliquary_mace.png'),
  iron_war_fan: require('../../assets/items/iron_war_fan.png'),

  // Shields & Off-Hands
  tempered_iron_buckler: require('../../assets/items/tempered_iron_buckler.png'),
  oni_tower_shield: require('../../assets/items/oni_tower_shield.png'),
  reliquary_lantern: require('../../assets/items/reliquary_lantern.png'),

  // Helmets & Headwear
  ashen_iron_helm: require('../../assets/items/ashen_iron_helm.png'),
  horned_oni_kabuto: require('../../assets/items/horned_oni_kabuto.png'),
  dusk_menpo_mask: require('../../assets/items/dusk_menpo_mask.png'),
  solar_halo_circlet: require('../../assets/items/solar_halo_circlet.png'),
  crown_of_the_wyrm: require('../../assets/items/crown_of_the_wyrm.png'),

  // Chest Armor
  warden_chainmail: require('../../assets/items/warden_chainmail.png'),
  cataphract_cuirass: require('../../assets/items/cataphract_cuirass.png'),
  oxblood_brigandine: require('../../assets/items/oxblood_brigandine.png'),
  vermilion_martial_gi: require('../../assets/items/vermilion_martial_gi.png'),

  // Leg Armor
  strider_greaves: require('../../assets/items/strider_greaves.png'),
  blackened_iron_tassets: require('../../assets/items/blackened_iron_tassets.png'),
  ebony_hakama: require('../../assets/items/ebony_hakama.png'),
  wolf_pelt_warkilt: require('../../assets/items/wolf_pelt_warkilt.png'),

  // Boots
  ironshod_sabatons: require('../../assets/items/ironshod_sabatons.png'),
  shinobi_tabi_boots: require('../../assets/items/shinobi_tabi_boots.png'),
  pilgrim_boots: require('../../assets/items/pilgrim_boots.png'),

  // Accessories
  copper_guild_ring: require('../../assets/items/copper_guild_ring.png'),
  malakor_signet: require('../../assets/items/malakor_signet.png'),
  crimson_oni_charm: require('../../assets/items/crimson_oni_charm.png'),
  astral_pendant: require('../../assets/items/astral_pendant.png'),

  // Consumables & Crafting Materials
  vitality_elixir: require('../../assets/items/vitality_elixir.png'),
  tempered_whetstone: require('../../assets/items/tempered_whetstone.png'),
  iron_ore_cluster: require('../../assets/items/iron_ore_cluster.png'),
  sunleaf_herb_bundle: require('../../assets/items/sunleaf_herb_bundle.png'),
  obsidian_ingot: require('../../assets/items/obsidian_ingot.png'),
  raid_essence_crystal: require('../../assets/items/raid_essence_crystal.png'),
};

/**
 * Slugs from BASE_EQUIPPABLE_ITEMS, Prisma seed catalogs, and loot tables mapped to canonical icon assets.
 */
export const ITEM_ICON_ALIASES: Record<string, string> = {
  // Equippable aliases
  iron_greatsword: 'ironbound_greatsword',
  crimson_oni_kanabo: 'spiked_kanabo',
  executioners_greataxe: 'blackened_halberd',
  warden_halberd: 'blackened_halberd',
  astral_archstaff: 'astral_warstaff',
  dusk_shinobi_wakizashi: 'kensei_katana',
  sunforged_warhammer: 'reliquary_mace',
  reaver_cleaver: 'reaver_hatchet',
  oath_sentinel_longsword: 'watch_broadsword',
  bastion_tower_shield: 'oni_tower_shield',
  solar_censer_relic: 'reliquary_lantern',
  void_grimoire_codex: 'iron_war_fan',
  shadowveil_hood: 'dusk_menpo_mask',
  horned_oni_mempo: 'horned_oni_kabuto',
  dread_knight_cuirass: 'cataphract_cuirass',
  wayfarer_brigandine: 'oxblood_brigandine',
  solar_mystic_vestments: 'vermilion_martial_gi',
  colossus_plate_cuisses: 'blackened_iron_tassets',
  acrobat_silk_leggings: 'ebony_hakama',
  phantom_step_treads: 'shinobi_tabi_boots',
  glacial_reaver_stompers: 'pilgrim_boots',
  astral_teardrop_amulet: 'astral_pendant',
  titanite_ember: 'tempered_whetstone',
  champion_sigil_shard: 'raid_essence_crystal',

  // Generic category fallbacks
  greatsword: 'ironbound_greatsword',
  sword: 'watch_broadsword',
  daggers: 'windrunner_daggers',
  dagger: 'windrunner_daggers',
  katana: 'kensei_katana',
  wakizashi: 'kensei_katana',
  bow: 'ashwood_longbow',
  longbow: 'ashwood_longbow',
  halberd: 'blackened_halberd',
  greataxe: 'blackened_halberd',
  axe: 'reaver_hatchet',
  mace: 'reliquary_mace',
  warhammer: 'reliquary_mace',
  club: 'spiked_kanabo',
  kanabo: 'spiked_kanabo',
  staff: 'astral_warstaff',
  warstaff: 'astral_warstaff',
  shield: 'oni_tower_shield',
  tower_shield: 'oni_tower_shield',
  buckler: 'tempered_iron_buckler',
  relic: 'reliquary_lantern',
  lantern: 'reliquary_lantern',
  censer: 'reliquary_lantern',
  tome: 'iron_war_fan',
  fan: 'iron_war_fan',
  helm: 'ashen_iron_helm',
  helmet: 'ashen_iron_helm',
  greathelm: 'ashen_iron_helm',
  mask: 'dusk_menpo_mask',
  kabuto: 'horned_oni_kabuto',
  cowl: 'dusk_menpo_mask',
  hood: 'dusk_menpo_mask',
  crown: 'crown_of_the_wyrm',
  circlet: 'solar_halo_circlet',
  chainmail: 'warden_chainmail',
  hauberk: 'warden_chainmail',
  cuirass: 'cataphract_cuirass',
  breastplate: 'cataphract_cuirass',
  brigandine: 'oxblood_brigandine',
  gi: 'vermilion_martial_gi',
  robes: 'vermilion_martial_gi',
  vestments: 'vermilion_martial_gi',
  greaves: 'strider_greaves',
  tassets: 'blackened_iron_tassets',
  cuisses: 'blackened_iron_tassets',
  hakama: 'ebony_hakama',
  warkilt: 'wolf_pelt_warkilt',
  kilt: 'wolf_pelt_warkilt',
  sabatons: 'ironshod_sabatons',
  boots: 'ironshod_sabatons',
  tabi: 'shinobi_tabi_boots',
  ring: 'copper_guild_ring',
  signet: 'malakor_signet',
  amulet: 'astral_pendant',
  pendant: 'astral_pendant',
  charm: 'crimson_oni_charm',
  potion: 'vitality_elixir',
  elixir: 'vitality_elixir',
  ore: 'iron_ore_cluster',
  herb: 'sunleaf_herb_bundle',
  herbs: 'sunleaf_herb_bundle',
  ingot: 'obsidian_ingot',
  whetstone: 'tempered_whetstone',
  crystal: 'raid_essence_crystal',
};

export interface ItemLike {
  slug?: string;
  baseSlug?: string;
  itemSlug?: string;
  icon?: string;
  iconKey?: string;
  templateId?: string;
  id?: string;
}

/**
 * Normalizes an item key by:
 * 1. Trimming and lowercasing
 * 2. Converting spaces/hyphens to underscores
 * 3. Stripping tier suffixes like `_t1` through `_t5` or affix suffixes
 */
function cleanKey(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/_t[1-5]$/i, '')
    .replace(/^t[1-5]_/i, '');
}

/**
 * Resolves the 1:1 square raster icon source for an item slug, base slug, or item object.
 * Returns null if no suitable icon exists, allowing the UI to fallback cleanly to emoji/SVG glyphs.
 */
export function getItemIconSource(
  slugOrItem?: string | ItemLike | null
): ImageSourcePropType | null {
  if (!slugOrItem) {
    return null;
  }

  const candidates: string[] = [];

  if (typeof slugOrItem === 'string') {
    candidates.push(slugOrItem);
  } else {
    if (slugOrItem.baseSlug) candidates.push(slugOrItem.baseSlug);
    if (slugOrItem.slug) candidates.push(slugOrItem.slug);
    if (slugOrItem.itemSlug) candidates.push(slugOrItem.itemSlug);
    if (slugOrItem.iconKey) candidates.push(slugOrItem.iconKey);
    if (slugOrItem.icon) candidates.push(slugOrItem.icon);
    if (slugOrItem.templateId) candidates.push(slugOrItem.templateId);
    if (slugOrItem.id) candidates.push(slugOrItem.id);
  }

  for (const raw of candidates) {
    if (!raw) continue;
    const cleaned = cleanKey(raw);

    // 1. Direct registry hit
    if (ITEM_ICON_REGISTRY[cleaned]) {
      return ITEM_ICON_REGISTRY[cleaned];
    }

    // 2. Exact alias hit
    const aliasTarget = ITEM_ICON_ALIASES[cleaned];
    if (aliasTarget && ITEM_ICON_REGISTRY[aliasTarget]) {
      return ITEM_ICON_REGISTRY[aliasTarget];
    }

    // 3. Strip affix patterns (e.g. prefix_baseSlug_suffix -> baseSlug)
    for (const regKey of Object.keys(ITEM_ICON_REGISTRY)) {
      if (cleaned.includes(regKey) && ITEM_ICON_REGISTRY[regKey]) {
        return ITEM_ICON_REGISTRY[regKey]!;
      }
    }

    // 4. Check alias substrings
    for (const [aliasKey, targetKey] of Object.entries(ITEM_ICON_ALIASES)) {
      if (cleaned.includes(aliasKey) && ITEM_ICON_REGISTRY[targetKey]) {
        return ITEM_ICON_REGISTRY[targetKey]!;
      }
    }
  }

  return null;
}
