import { ImageSourcePropType } from 'react-native';
import { COMPILED_ITEM_ICON_ART } from './generated/compiledAssets.generated';
import {
  EQUIPMENT_RIG_OVERLAY_SLOTS,
  getEquipmentRigOverlaySource,
} from './rpgArtRegistry';

export { EQUIPMENT_RIG_OVERLAY_SLOTS, getEquipmentRigOverlaySource };

/**
 * Dedicated 512x512 drop-in slots for currently aliased consumables, materials, and gear slugs.
 * Checked before ITEM_ICON_ALIASES so final illustrations drop in without changing any screen.
 */
const BASE_DEDICATED_ITEM_ICON_SLOTS: Readonly<Record<string, ImageSourcePropType | null>> = {
  sunleaf_healing_draught: null,
  astral_mana_tonic: null,
  astral_dew_vial: null,
  arcane_reforge_dust: null,
  titanite_ember: null,
  iron_greatsword: null,
  crimson_oni_kanabo: null,
  executioners_greataxe: null,
  warden_halberd: null,
  astral_archstaff: null,
  dusk_shinobi_wakizashi: null,
  sunforged_warhammer: null,
  reaver_cleaver: null,
  oath_sentinel_longsword: null,
  bastion_tower_shield: null,
  solar_censer_relic: null,
  void_grimoire_codex: null,
  shadowveil_hood: null,
  horned_oni_mempo: null,
  dread_knight_cuirass: null,
  wayfarer_brigandine: null,
  solar_mystic_vestments: null,
  colossus_plate_cuisses: null,
  acrobat_silk_leggings: null,
  phantom_step_treads: null,
  glacial_reaver_stompers: null,
  astral_teardrop_amulet: null,
};

export const DEDICATED_ITEM_ICON_SLOTS: Readonly<Record<string, ImageSourcePropType | null>> =
  Object.fromEntries(
    Object.entries(BASE_DEDICATED_ITEM_ICON_SLOTS).map(
      ([slug, fallback]): [string, ImageSourcePropType | null] => [
        slug,
        COMPILED_ITEM_ICON_ART[slug] ?? fallback,
      ]
    )
  );

/**
 * 40 Canonical Compiled WebP RPG Item Icons (256x256) + Dedicated Drop-In Slots
 * sourced from compiledAssets.generated.ts (`npm run assets:build`).
 */
export const ITEM_ICON_REGISTRY: Record<string, ImageSourcePropType> = {
  ...COMPILED_ITEM_ICON_ART,
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

    // 0. Milestone 6 dedicated drop-in slot hit (checked before alias fallback)
    if (DEDICATED_ITEM_ICON_SLOTS[cleaned]) {
      return DEDICATED_ITEM_ICON_SLOTS[cleaned]!;
    }

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
