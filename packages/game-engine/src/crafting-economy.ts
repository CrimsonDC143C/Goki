import {
  BASE_EQUIPPABLE_ITEM_BY_SLUG,
  BASE_EQUIPPABLE_ITEMS,
  ITEM_PREFIXES,
  ITEM_SUFFIXES,
  ITEM_TIER_CONFIG,
  ItemTier,
  RolledProceduralItemInstance,
  proceduralItemToLootDrop,
  rollProceduralItemInstance,
} from './item-affix-engine';
import { createSeededRng } from './rng';
import {
  DEFAULT_TALENT_TREES,
  TalentGoverningStat,
  TalentTreeDefinition,
} from './talent-engine';
import { COMBAT_CONSUMABLE_BY_SLUG, sanitizeActiveSkillLoadout } from './turn-based-combat';
import {
  CoreStatBlock,
  ItemRarity,
  LootDrop,
  StatType,
  normalizeCoreStatBlock,
} from './types';

// ============================================================================
// 1. CRAFTING MATERIALS CATALOG
// ============================================================================

export type MaterialProfessionOrigin = 'MINING' | 'FORAGING' | 'SMELTING' | 'ALCHEMY' | 'RAID';

export interface CraftingMaterialDefinition {
  slug: string;
  name: string;
  description: string;
  professionOrigin: MaterialProfessionOrigin;
  rarity: ItemRarity;
  goldValue: number;
}

export const CRAFTING_MATERIAL_CATALOG: readonly CraftingMaterialDefinition[] = [
  {
    slug: 'iron_ore_cluster',
    name: 'Rich Iron Ore Cluster',
    description: 'Raw iron ore mined from craggy mountain veins.',
    professionOrigin: 'MINING',
    rarity: 'COMMON',
    goldValue: 12,
  },
  {
    slug: 'sunleaf_herb_bundle',
    name: 'Sunleaf Herb Bundle',
    description: 'Restorative wild herbs used in stamina and healing draughts.',
    professionOrigin: 'FORAGING',
    rarity: 'COMMON',
    goldValue: 12,
  },
  {
    slug: 'obsidian_ingot',
    name: 'Obsidian Steel Ingot',
    description: 'Smelted alloy prized by guild blacksmiths.',
    professionOrigin: 'SMELTING',
    rarity: 'UNCOMMON',
    goldValue: 45,
  },
  {
    slug: 'astral_dew_vial',
    name: 'Astral Dew Vial',
    description: 'Moonlit botanical essence harvested from Whisperwood blooms.',
    professionOrigin: 'FORAGING',
    rarity: 'UNCOMMON',
    goldValue: 30,
  },
  {
    slug: 'arcane_reforge_dust',
    name: 'Arcane Reforge Dust',
    description: 'Alchemical reagent that unbinds and rerolls gear affixes.',
    professionOrigin: 'ALCHEMY',
    rarity: 'UNCOMMON',
    goldValue: 40,
  },
  {
    slug: 'titanite_ember',
    name: 'Titanite Forge Ember',
    description: 'Superheated slag heart required to temper higher gear tiers.',
    professionOrigin: 'SMELTING',
    rarity: 'RARE',
    goldValue: 75,
  },
  {
    slug: 'raid_essence_crystal',
    name: 'Raid Boss Essence Crystal',
    description: 'Crystallized power harvested from weekly Raid Bosses.',
    professionOrigin: 'RAID',
    rarity: 'RARE',
    goldValue: 120,
  },
];

export const CRAFTING_MATERIAL_BY_SLUG: Readonly<Record<string, CraftingMaterialDefinition>> =
  CRAFTING_MATERIAL_CATALOG.reduce<Record<string, CraftingMaterialDefinition>>((acc, mat) => {
    acc[mat.slug] = mat;
    return acc;
  }, {});

// ============================================================================
// 2. CRAFTING RECIPES & EVALUATION
// ============================================================================

export type CraftingRecipeCategory = 'CONSUMABLE' | 'SMELTING_REFINERY' | 'GEAR_FORGE';

export interface CraftingIngredient {
  itemSlug: string;
  itemName: string;
  quantity: number;
}

export interface CraftingRecipeDefinition {
  recipeSlug: string;
  name: string;
  description: string;
  category: CraftingRecipeCategory;
  profession: 'MINING' | 'FORAGING' | 'SMELTING' | 'ALCHEMY';
  requiredStat?: StatType;
  requiredStatLevel?: number;
  goldCost: number;
  ingredients: readonly CraftingIngredient[];
  outputItemSlug: string;
  outputItemName: string;
  outputQuantity: number;
  outputRarity: ItemRarity;
  outputBaseSlug?: string;
  outputTier?: ItemTier;
}

function matIngredient(itemSlug: string, quantity: number): CraftingIngredient {
  const mat = CRAFTING_MATERIAL_BY_SLUG[itemSlug];
  return {
    itemSlug,
    itemName: mat ? mat.name : itemSlug,
    quantity,
  };
}

function consumableName(slug: string): string {
  return COMBAT_CONSUMABLE_BY_SLUG[slug]?.name ?? slug;
}

function materialName(slug: string): string {
  return CRAFTING_MATERIAL_BY_SLUG[slug]?.name ?? slug;
}

function baseGearName(slug: string): string {
  return BASE_EQUIPPABLE_ITEM_BY_SLUG[slug]?.baseName ?? slug;
}

export const CRAFTING_RECIPES: readonly CraftingRecipeDefinition[] = [
  // Consumables (4)
  {
    recipeSlug: 'brew_sunleaf_healing_draught',
    name: 'Brew Sunleaf Healing Draught',
    description: 'Steep wild sunleaf herbs into restorative combat draughts.',
    category: 'CONSUMABLE',
    profession: 'ALCHEMY',
    goldCost: 10,
    ingredients: [matIngredient('sunleaf_herb_bundle', 2)],
    outputItemSlug: 'sunleaf_healing_draught',
    outputItemName: consumableName('sunleaf_healing_draught'),
    outputQuantity: 2,
    outputRarity: 'COMMON',
  },
  {
    recipeSlug: 'brew_vitality_elixir',
    name: 'Brew Elixir of Peak Output',
    description: 'Concentrate sunleaf herbs and astral dew for rapid stamina and HP recovery.',
    category: 'CONSUMABLE',
    profession: 'ALCHEMY',
    requiredStat: 'AGILITY',
    requiredStatLevel: 2,
    goldCost: 25,
    ingredients: [
      matIngredient('sunleaf_herb_bundle', 3),
      matIngredient('astral_dew_vial', 1),
    ],
    outputItemSlug: 'vitality_elixir',
    outputItemName: consumableName('vitality_elixir'),
    outputQuantity: 1,
    outputRarity: 'RARE',
  },
  {
    recipeSlug: 'brew_astral_mana_tonic',
    name: 'Brew Astral Clarity Tonic',
    description: 'Infuse astral dew into a stabilizing tonic that restores mana in combat.',
    category: 'CONSUMABLE',
    profession: 'ALCHEMY',
    goldCost: 20,
    ingredients: [
      matIngredient('sunleaf_herb_bundle', 2),
      matIngredient('astral_dew_vial', 1),
    ],
    outputItemSlug: 'astral_mana_tonic',
    outputItemName: consumableName('astral_mana_tonic'),
    outputQuantity: 2,
    outputRarity: 'UNCOMMON',
  },
  {
    recipeSlug: 'craft_tempered_whetstone',
    name: 'Craft Tempered Whetstone',
    description: 'Grind iron ore and obsidian steel into combat-ready weapon whetstones.',
    category: 'CONSUMABLE',
    profession: 'SMELTING',
    goldCost: 20,
    ingredients: [
      matIngredient('iron_ore_cluster', 2),
      matIngredient('obsidian_ingot', 1),
    ],
    outputItemSlug: 'tempered_whetstone',
    outputItemName: consumableName('tempered_whetstone'),
    outputQuantity: 2,
    outputRarity: 'UNCOMMON',
  },

  // Smelting & Refinery (3)
  {
    recipeSlug: 'smelt_obsidian_ingot',
    name: 'Smelt Obsidian Steel Ingot',
    description: 'Refine raw iron ore clusters into dense obsidian steel ingots.',
    category: 'SMELTING_REFINERY',
    profession: 'SMELTING',
    goldCost: 15,
    ingredients: [matIngredient('iron_ore_cluster', 3)],
    outputItemSlug: 'obsidian_ingot',
    outputItemName: materialName('obsidian_ingot'),
    outputQuantity: 1,
    outputRarity: 'UNCOMMON',
  },
  {
    recipeSlug: 'distill_arcane_reforge_dust',
    name: 'Distill Arcane Reforge Dust',
    description: 'Pulverize herbs and mineral slag into affix-unbinding alchemical dust.',
    category: 'SMELTING_REFINERY',
    profession: 'ALCHEMY',
    goldCost: 20,
    ingredients: [
      matIngredient('sunleaf_herb_bundle', 2),
      matIngredient('iron_ore_cluster', 1),
    ],
    outputItemSlug: 'arcane_reforge_dust',
    outputItemName: materialName('arcane_reforge_dust'),
    outputQuantity: 1,
    outputRarity: 'UNCOMMON',
  },
  {
    recipeSlug: 'temper_titanite_ember',
    name: 'Temper Titanite Forge Ember',
    description: 'Condense obsidian steel and astral dew under intense forge heat.',
    category: 'SMELTING_REFINERY',
    profession: 'SMELTING',
    requiredStat: 'STRENGTH',
    requiredStatLevel: 2,
    goldCost: 35,
    ingredients: [
      matIngredient('obsidian_ingot', 2),
      matIngredient('astral_dew_vial', 1),
    ],
    outputItemSlug: 'titanite_ember',
    outputItemName: materialName('titanite_ember'),
    outputQuantity: 1,
    outputRarity: 'RARE',
  },

  // Gear Forge (6)
  {
    recipeSlug: 'forge_ironbound_greatsword',
    name: 'Forge Ironbound Greatsword',
    description: 'Hammer obsidian steel and iron into a heavy two-handed greatsword.',
    category: 'GEAR_FORGE',
    profession: 'SMELTING',
    goldCost: 75,
    ingredients: [
      matIngredient('obsidian_ingot', 3),
      matIngredient('iron_ore_cluster', 2),
    ],
    outputItemSlug: 'ironbound_greatsword',
    outputItemName: baseGearName('ironbound_greatsword'),
    outputQuantity: 1,
    outputRarity: 'COMMON',
    outputBaseSlug: 'ironbound_greatsword',
    outputTier: 1,
  },
  {
    recipeSlug: 'forge_dusk_shinobi_wakizashi',
    name: 'Forge Dusk Shinobi Wakizashi',
    description: 'Fold obsidian steel quenched in astral dew into a swift shortblade.',
    category: 'GEAR_FORGE',
    profession: 'SMELTING',
    goldCost: 65,
    ingredients: [
      matIngredient('obsidian_ingot', 2),
      matIngredient('astral_dew_vial', 1),
    ],
    outputItemSlug: 'dusk_shinobi_wakizashi',
    outputItemName: baseGearName('dusk_shinobi_wakizashi'),
    outputQuantity: 1,
    outputRarity: 'COMMON',
    outputBaseSlug: 'dusk_shinobi_wakizashi',
    outputTier: 1,
  },
  {
    recipeSlug: 'forge_astral_archstaff',
    name: 'Forge Astral Runestaff',
    description: 'Bind astral dew conduits along an obsidian-capped spellcraft staff.',
    category: 'GEAR_FORGE',
    profession: 'ALCHEMY',
    goldCost: 70,
    ingredients: [
      matIngredient('obsidian_ingot', 2),
      matIngredient('astral_dew_vial', 2),
    ],
    outputItemSlug: 'astral_archstaff',
    outputItemName: baseGearName('astral_archstaff'),
    outputQuantity: 1,
    outputRarity: 'COMMON',
    outputBaseSlug: 'astral_archstaff',
    outputTier: 1,
  },
  {
    recipeSlug: 'forge_tempered_iron_buckler',
    name: 'Forge Tempered Iron Buckler',
    description: 'Rivet layered iron and obsidian steel into a nimble parry shield.',
    category: 'GEAR_FORGE',
    profession: 'SMELTING',
    goldCost: 55,
    ingredients: [
      matIngredient('obsidian_ingot', 2),
      matIngredient('iron_ore_cluster', 2),
    ],
    outputItemSlug: 'tempered_iron_buckler',
    outputItemName: baseGearName('tempered_iron_buckler'),
    outputQuantity: 1,
    outputRarity: 'COMMON',
    outputBaseSlug: 'tempered_iron_buckler',
    outputTier: 1,
  },
  {
    recipeSlug: 'forge_warden_chainmail',
    name: "Forge Warden's Tempered Hauberk",
    description: 'Weave obsidian rings treated with sunleaf oils into durable chest armor.',
    category: 'GEAR_FORGE',
    profession: 'SMELTING',
    goldCost: 80,
    ingredients: [
      matIngredient('obsidian_ingot', 3),
      matIngredient('sunleaf_herb_bundle', 1),
    ],
    outputItemSlug: 'warden_chainmail',
    outputItemName: baseGearName('warden_chainmail'),
    outputQuantity: 1,
    outputRarity: 'COMMON',
    outputBaseSlug: 'warden_chainmail',
    outputTier: 1,
  },
  {
    recipeSlug: 'forge_copper_guild_ring',
    name: 'Forge Copper Guild Signet',
    description: 'Inscribe an obsidian-banded signet charged with arcane reforge dust.',
    category: 'GEAR_FORGE',
    profession: 'ALCHEMY',
    goldCost: 60,
    ingredients: [
      matIngredient('obsidian_ingot', 1),
      matIngredient('arcane_reforge_dust', 1),
    ],
    outputItemSlug: 'copper_guild_ring',
    outputItemName: baseGearName('copper_guild_ring'),
    outputQuantity: 1,
    outputRarity: 'COMMON',
    outputBaseSlug: 'copper_guild_ring',
    outputTier: 1,
  },
];

export const CRAFTING_RECIPE_BY_SLUG: Readonly<Record<string, CraftingRecipeDefinition>> =
  CRAFTING_RECIPES.reduce<Record<string, CraftingRecipeDefinition>>((acc, recipe) => {
    acc[recipe.recipeSlug] = recipe;
    return acc;
  }, {});

export type EvaluateCraftRecipeResult =
  | {
      ok: true;
      recipe: CraftingRecipeDefinition;
      quantity: number;
      totalGoldCost: number;
      remainingGold: number;
      deductedMaterials: Record<string, number>;
      craftedDrops: LootDrop[];
    }
  | { ok: false; error: string };

function getCoreStatValue(stats: Partial<CoreStatBlock>, stat: StatType): number {
  const normalized = normalizeCoreStatBlock(stats);
  switch (stat) {
    case 'STRENGTH':
      return normalized.strengthLevel;
    case 'ENDURANCE':
      return normalized.enduranceLevel;
    case 'AGILITY':
      return normalized.agilityLevel;
  }
}

function validateMaterialsAndGold(
  currentGold: number,
  goldCost: number,
  materialCounts: Readonly<Record<string, number>>,
  ingredients: readonly CraftingIngredient[],
  multiplier = 1
): { ok: true; deductedMaterials: Record<string, number> } | { ok: false; error: string } {
  if (!Number.isFinite(currentGold) || currentGold < goldCost) {
    return {
      ok: false,
      error: `Insufficient Gold: requires ${goldCost}g, available ${Math.max(0, Math.floor(currentGold))}g.`,
    };
  }

  const deductedMaterials: Record<string, number> = {};
  for (const ing of ingredients) {
    const required = ing.quantity * multiplier;
    const available = materialCounts[ing.itemSlug] ?? 0;
    if (available < required) {
      return {
        ok: false,
        error: `Insufficient ${ing.itemName}: requires ${required}, available ${available}.`,
      };
    }
    deductedMaterials[ing.itemSlug] = (deductedMaterials[ing.itemSlug] ?? 0) + required;
  }

  return { ok: true, deductedMaterials };
}

export function evaluateCraftRecipe(params: {
  recipeSlug: string;
  quantity?: number;
  currentGold: number;
  materialCounts: Readonly<Record<string, number>>;
  characterStats?: Partial<CoreStatBlock>;
  seed?: string | number;
}): EvaluateCraftRecipeResult {
  const recipe = CRAFTING_RECIPE_BY_SLUG[params.recipeSlug];
  if (!recipe) {
    return { ok: false, error: `Unknown crafting recipe '${params.recipeSlug}'.` };
  }

  const quantity = params.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return { ok: false, error: 'Craft quantity must be an integer between 1 and 20.' };
  }

  if (
    params.characterStats !== undefined &&
    recipe.requiredStat !== undefined &&
    recipe.requiredStatLevel !== undefined
  ) {
    const statLevel = getCoreStatValue(params.characterStats, recipe.requiredStat);
    if (statLevel < recipe.requiredStatLevel) {
      return {
        ok: false,
        error: `Requires ${recipe.requiredStat} Lv ${recipe.requiredStatLevel} (currently Lv ${statLevel}).`,
      };
    }
  }

  const totalGoldCost = recipe.goldCost * quantity;
  const resourceCheck = validateMaterialsAndGold(
    params.currentGold,
    totalGoldCost,
    params.materialCounts,
    recipe.ingredients,
    quantity
  );
  if (!resourceCheck.ok) {
    return resourceCheck;
  }

  const seed = params.seed ?? 'craft-default';
  const craftedDrops: LootDrop[] = [];

  if (recipe.outputBaseSlug) {
    const tier = recipe.outputTier ?? 1;
    for (let i = 0; i < quantity; i++) {
      const rolled = rollProceduralItemInstance({
        baseSlug: recipe.outputBaseSlug,
        tier,
        seed: `${seed}:${recipe.recipeSlug}:${i}`,
      });
      craftedDrops.push(proceduralItemToLootDrop(rolled));
    }
  } else {
    craftedDrops.push({
      itemSlug: recipe.outputItemSlug,
      itemName: recipe.outputItemName,
      rarity: recipe.outputRarity,
      quantity: recipe.outputQuantity * quantity,
    });
  }

  return {
    ok: true,
    recipe,
    quantity,
    totalGoldCost,
    remainingGold: params.currentGold - totalGoldCost,
    deductedMaterials: resourceCheck.deductedMaterials,
    craftedDrops,
  };
}

// ============================================================================
// 3. GEAR TIER UPGRADE
// ============================================================================

export interface GearUpgradeCost {
  fromTier: ItemTier;
  toTier: ItemTier;
  goldCost: number;
  ingredients: readonly CraftingIngredient[];
}

const GEAR_UPGRADE_COST_TABLE: Readonly<Record<1 | 2 | 3 | 4, GearUpgradeCost>> = {
  1: {
    fromTier: 1,
    toTier: 2,
    goldCost: 60,
    ingredients: [matIngredient('obsidian_ingot', 2), matIngredient('iron_ore_cluster', 1)],
  },
  2: {
    fromTier: 2,
    toTier: 3,
    goldCost: 140,
    ingredients: [matIngredient('obsidian_ingot', 3), matIngredient('titanite_ember', 1)],
  },
  3: {
    fromTier: 3,
    toTier: 4,
    goldCost: 280,
    ingredients: [
      matIngredient('obsidian_ingot', 4),
      matIngredient('titanite_ember', 2),
      matIngredient('arcane_reforge_dust', 1),
    ],
  },
  4: {
    fromTier: 4,
    toTier: 5,
    goldCost: 550,
    ingredients: [
      matIngredient('obsidian_ingot', 5),
      matIngredient('titanite_ember', 3),
      matIngredient('raid_essence_crystal', 1),
    ],
  },
};

export function getGearUpgradeCost(currentTier: ItemTier): GearUpgradeCost | null {
  if (currentTier === 5) return null;
  return GEAR_UPGRADE_COST_TABLE[currentTier] ?? null;
}

export type UpgradeProceduralItemResult =
  | {
      ok: true;
      previousTier: ItemTier;
      newTier: ItemTier;
      goldCost: number;
      remainingGold: number;
      deductedMaterials: Record<string, number>;
      upgradedInstance: RolledProceduralItemInstance;
      lootDrop: LootDrop;
    }
  | { ok: false; error: string };

export function upgradeProceduralItemTier(params: {
  baseSlug: string;
  currentTier: ItemTier;
  currentPrefixId?: string | null;
  currentSuffixId?: string | null;
  currentGold: number;
  materialCounts: Readonly<Record<string, number>>;
  seed: string | number;
}): UpgradeProceduralItemResult {
  if (!BASE_EQUIPPABLE_ITEM_BY_SLUG[params.baseSlug]) {
    return { ok: false, error: `Unknown equipment base '${params.baseSlug}'.` };
  }

  if (params.currentTier >= 5) {
    return { ok: false, error: 'Item is already at maximum Tier V.' };
  }

  const upgradeCost = getGearUpgradeCost(params.currentTier);
  if (!upgradeCost) {
    return { ok: false, error: 'Item is already at maximum Tier V.' };
  }

  const resourceCheck = validateMaterialsAndGold(
    params.currentGold,
    upgradeCost.goldCost,
    params.materialCounts,
    upgradeCost.ingredients
  );
  if (!resourceCheck.ok) {
    return resourceCheck;
  }

  const upgradedInstance = rollProceduralItemInstance({
    baseSlug: params.baseSlug,
    tier: upgradeCost.toTier,
    seed: params.seed,
    forcePrefixId: params.currentPrefixId || undefined,
    forceSuffixId: params.currentSuffixId || undefined,
  });

  return {
    ok: true,
    previousTier: params.currentTier,
    newTier: upgradeCost.toTier,
    goldCost: upgradeCost.goldCost,
    remainingGold: params.currentGold - upgradeCost.goldCost,
    deductedMaterials: resourceCheck.deductedMaterials,
    upgradedInstance,
    lootDrop: proceduralItemToLootDrop(upgradedInstance),
  };
}

// ============================================================================
// 4. AFFIX REFORGING
// ============================================================================

export type AffixReforgeMode = 'BOTH' | 'LOCK_PREFIX' | 'LOCK_SUFFIX';

export interface AffixReforgeCost {
  tier: ItemTier;
  mode: AffixReforgeMode;
  goldCost: number;
  ingredients: readonly CraftingIngredient[];
}

export function getAffixReforgeCost(
  tier: ItemTier,
  mode: AffixReforgeMode = 'BOTH'
): AffixReforgeCost {
  if (mode === 'BOTH') {
    return {
      tier,
      mode,
      goldCost: 40 * tier,
      ingredients: [
        matIngredient('arcane_reforge_dust', 1),
        matIngredient('obsidian_ingot', tier),
      ],
    };
  }

  return {
    tier,
    mode,
    goldCost: 75 * tier,
    ingredients: [
      matIngredient('arcane_reforge_dust', 2),
      matIngredient('obsidian_ingot', tier),
    ],
  };
}

export type ReforgeProceduralItemResult =
  | {
      ok: true;
      mode: AffixReforgeMode;
      goldCost: number;
      remainingGold: number;
      deductedMaterials: Record<string, number>;
      reforgedInstance: RolledProceduralItemInstance;
      lootDrop: LootDrop;
    }
  | { ok: false; error: string };

export function reforgeProceduralItemAffixes(params: {
  baseSlug: string;
  tier: ItemTier;
  mode?: AffixReforgeMode;
  currentPrefixId?: string | null;
  currentSuffixId?: string | null;
  currentGold: number;
  materialCounts: Readonly<Record<string, number>>;
  seed: string | number;
}): ReforgeProceduralItemResult {
  if (!BASE_EQUIPPABLE_ITEM_BY_SLUG[params.baseSlug]) {
    return { ok: false, error: `Unknown equipment base '${params.baseSlug}'.` };
  }

  const mode: AffixReforgeMode = params.mode ?? 'BOTH';

  if (params.tier === 1 && mode !== 'BOTH') {
    return {
      ok: false,
      error: 'Tier I gear holds at most one affix; use full reforge.',
    };
  }

  if (mode === 'LOCK_PREFIX' && !params.currentPrefixId) {
    return {
      ok: false,
      error: 'Cannot lock prefix when item has no prefix.',
    };
  }

  if (mode === 'LOCK_SUFFIX' && !params.currentSuffixId) {
    return {
      ok: false,
      error: 'Cannot lock suffix when item has no suffix.',
    };
  }

  const cost = getAffixReforgeCost(params.tier, mode);
  const resourceCheck = validateMaterialsAndGold(
    params.currentGold,
    cost.goldCost,
    params.materialCounts,
    cost.ingredients
  );
  if (!resourceCheck.ok) {
    return resourceCheck;
  }

  const rng = createSeededRng(`${params.seed}:reforge:${params.baseSlug}:${params.tier}:${mode}`);
  const prefixCandidates = ITEM_PREFIXES.filter((p) => p.id !== params.currentPrefixId);
  const suffixCandidates = ITEM_SUFFIXES.filter((s) => s.id !== params.currentSuffixId);
  const usablePrefixes = prefixCandidates.length > 0 ? prefixCandidates : ITEM_PREFIXES;
  const usableSuffixes = suffixCandidates.length > 0 ? suffixCandidates : ITEM_SUFFIXES;

  let forcePrefixId: string | null | undefined;
  let forceSuffixId: string | null | undefined;

  if (params.tier === 1) {
    // Tier 1 holds at most one affix (prefix XOR suffix); pass only the chosen slot so rollProceduralItemInstance respects XOR.
    if (rng.chance(0.5)) {
      forcePrefixId = rng.pick(usablePrefixes).id;
    } else {
      forceSuffixId = rng.pick(usableSuffixes).id;
    }
  } else if (mode === 'BOTH') {
    forcePrefixId = rng.pick(usablePrefixes).id;
    forceSuffixId = rng.pick(usableSuffixes).id;
  } else if (mode === 'LOCK_PREFIX') {
    forcePrefixId = params.currentPrefixId!;
    forceSuffixId = rng.pick(usableSuffixes).id;
  } else {
    forcePrefixId = rng.pick(usablePrefixes).id;
    forceSuffixId = params.currentSuffixId!;
  }

  const reforgedInstance = rollProceduralItemInstance({
    baseSlug: params.baseSlug,
    tier: params.tier,
    seed: `${params.seed}:reforge-inst`,
    forcePrefixId,
    forceSuffixId,
  });

  return {
    ok: true,
    mode,
    goldCost: cost.goldCost,
    remainingGold: params.currentGold - cost.goldCost,
    deductedMaterials: resourceCheck.deductedMaterials,
    reforgedInstance,
    lootDrop: proceduralItemToLootDrop(reforgedInstance),
  };
}

// ============================================================================
// 5. TRADER NPC ROTATING STOCK, BUY & SELL
// ============================================================================

export type TraderOfferCategory = 'CONSUMABLE' | 'MATERIAL' | 'PROCEDURAL_GEAR';

export interface TraderShopOffer {
  offerId: string;
  itemSlug: string;
  itemName: string;
  description: string;
  category: TraderOfferCategory;
  rarity: ItemRarity;
  buyPriceGold: number;
  quantityPerPurchase: number;
  lootDrop: LootDrop;
}

const STAPLE_TRADER_ITEMS: ReadonlyArray<{
  slug: string;
  category: 'CONSUMABLE' | 'MATERIAL';
  buyPriceGold: number;
}> = [
  { slug: 'sunleaf_healing_draught', category: 'CONSUMABLE', buyPriceGold: 45 },
  { slug: 'astral_mana_tonic', category: 'CONSUMABLE', buyPriceGold: 65 },
  { slug: 'tempered_whetstone', category: 'CONSUMABLE', buyPriceGold: 60 },
  { slug: 'arcane_reforge_dust', category: 'MATERIAL', buyPriceGold: 55 },
];

const ROTATING_MATERIAL_POOL = [
  'obsidian_ingot',
  'astral_dew_vial',
  'titanite_ember',
  'iron_ore_cluster',
  'sunleaf_herb_bundle',
] as const;

export function generateTraderRotatingStock(rotationDateKey: string): TraderShopOffer[] {
  const offers: TraderShopOffer[] = [];

  for (const staple of STAPLE_TRADER_ITEMS) {
    if (staple.category === 'CONSUMABLE') {
      const item = COMBAT_CONSUMABLE_BY_SLUG[staple.slug];
      if (!item) continue;
      offers.push({
        offerId: `staple:${item.itemSlug}`,
        itemSlug: item.itemSlug,
        itemName: item.name,
        description: item.description,
        category: 'CONSUMABLE',
        rarity: item.rarity,
        buyPriceGold: staple.buyPriceGold,
        quantityPerPurchase: 1,
        lootDrop: {
          itemSlug: item.itemSlug,
          itemName: item.name,
          rarity: item.rarity,
          quantity: 1,
        },
      });
    } else {
      const mat = CRAFTING_MATERIAL_BY_SLUG[staple.slug];
      if (!mat) continue;
      offers.push({
        offerId: `staple:${mat.slug}`,
        itemSlug: mat.slug,
        itemName: mat.name,
        description: mat.description,
        category: 'MATERIAL',
        rarity: mat.rarity,
        buyPriceGold: staple.buyPriceGold,
        quantityPerPurchase: 1,
        lootDrop: {
          itemSlug: mat.slug,
          itemName: mat.name,
          rarity: mat.rarity,
          quantity: 1,
        },
      });
    }
  }

  // 2 rotating materials
  const matRng = createSeededRng(`${rotationDateKey}:trader:materials`);
  const availableMaterialSlugs = [...ROTATING_MATERIAL_POOL];
  for (let i = 0; i < 2 && availableMaterialSlugs.length > 0; i++) {
    const pickedSlug = matRng.pick(availableMaterialSlugs);
    const idx = availableMaterialSlugs.indexOf(pickedSlug);
    availableMaterialSlugs.splice(idx, 1);

    const mat = CRAFTING_MATERIAL_BY_SLUG[pickedSlug];
    if (!mat) continue;
    offers.push({
      offerId: `rot_mat:${rotationDateKey}:${i}:${mat.slug}`,
      itemSlug: mat.slug,
      itemName: mat.name,
      description: mat.description,
      category: 'MATERIAL',
      rarity: mat.rarity,
      buyPriceGold: Math.round(mat.goldValue * 1.35),
      quantityPerPurchase: 1,
      lootDrop: {
        itemSlug: mat.slug,
        itemName: mat.name,
        rarity: mat.rarity,
        quantity: 1,
      },
    });
  }

  // 3 rotating procedural gear offers (Tier 1 / 2 / 3)
  const gearRng = createSeededRng(`${rotationDateKey}:trader:gear`);
  const availableBases = [...BASE_EQUIPPABLE_ITEMS];
  for (let i = 0; i < 3 && availableBases.length > 0; i++) {
    const pickedBase = gearRng.pick(availableBases);
    const baseIdx = availableBases.findIndex((b) => b.baseSlug === pickedBase.baseSlug);
    if (baseIdx >= 0) availableBases.splice(baseIdx, 1);

    const tier = gearRng.pick([1, 2, 3] as const);
    const rolled = rollProceduralItemInstance({
      baseSlug: pickedBase.baseSlug,
      tier,
      seed: `${rotationDateKey}:trader:${i}`,
    });

    offers.push({
      offerId: `rot_gear:${rotationDateKey}:${i}:${rolled.baseSlug}`,
      itemSlug: rolled.itemSlug,
      itemName: rolled.displayName,
      description: rolled.description,
      category: 'PROCEDURAL_GEAR',
      rarity: rolled.rarity,
      buyPriceGold: Math.round(rolled.goldValue * 1.4),
      quantityPerPurchase: 1,
      lootDrop: proceduralItemToLootDrop(rolled),
    });
  }

  return offers;
}

export function evaluateTraderPurchase(params: {
  offerId: string;
  quantity?: number;
  currentGold: number;
  rotationDateKey: string;
}):
  | {
      ok: true;
      offer: TraderShopOffer;
      quantity: number;
      totalGoldCost: number;
      remainingGold: number;
      purchasedDrops: LootDrop[];
    }
  | { ok: false; error: string } {
  const stock = generateTraderRotatingStock(params.rotationDateKey);
  const offer = stock.find((entry) => entry.offerId === params.offerId);
  if (!offer) {
    return {
      ok: false,
      error: `Trader offer '${params.offerId}' is not available in rotation '${params.rotationDateKey}'.`,
    };
  }

  const quantity = params.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return { ok: false, error: 'Purchase quantity must be an integer between 1 and 20.' };
  }

  const totalGoldCost = offer.buyPriceGold * quantity;
  if (!Number.isFinite(params.currentGold) || params.currentGold < totalGoldCost) {
    return {
      ok: false,
      error: `Insufficient Gold: requires ${totalGoldCost}g, available ${Math.max(0, Math.floor(params.currentGold))}g.`,
    };
  }

  const purchasedDrops: LootDrop[] =
    offer.category === 'PROCEDURAL_GEAR'
      ? Array.from({ length: quantity }, () => ({
          ...offer.lootDrop,
          quantity: offer.quantityPerPurchase,
        }))
      : [
          {
            ...offer.lootDrop,
            quantity: offer.quantityPerPurchase * quantity,
          },
        ];

  return {
    ok: true,
    offer,
    quantity,
    totalGoldCost,
    remainingGold: params.currentGold - totalGoldCost,
    purchasedDrops,
  };
}

const RARITY_FALLBACK_GOLD: Record<ItemRarity, number> = {
  COMMON: 15,
  UNCOMMON: 35,
  RARE: 75,
  EPIC: 160,
  LEGENDARY: 350,
  MYTHIC: 700,
};

export function calculateTraderSellValue(params: {
  baseGoldValue?: number;
  itemSlug?: string;
  tier?: ItemTier;
  rarity?: ItemRarity;
  quantity?: number;
}): { unitSellGold: number; totalSellGold: number } {
  const quantity = params.quantity !== undefined ? Math.max(0, Math.floor(params.quantity)) : 1;

  const baseCatalog = params.itemSlug ? BASE_EQUIPPABLE_ITEM_BY_SLUG[params.itemSlug] : undefined;
  const matCatalog = params.itemSlug ? CRAFTING_MATERIAL_BY_SLUG[params.itemSlug] : undefined;
  const consumableCatalog = params.itemSlug
    ? COMBAT_CONSUMABLE_BY_SLUG[params.itemSlug]
    : undefined;

  let resolvedGoldValue: number;

  if (params.baseGoldValue !== undefined && Number.isFinite(params.baseGoldValue)) {
    if (params.tier !== undefined) {
      if (baseCatalog) {
        resolvedGoldValue =
          params.baseGoldValue === baseCatalog.baseGoldValue
            ? Math.round(baseCatalog.baseGoldValue * ITEM_TIER_CONFIG[params.tier].goldMultiplier)
            : params.baseGoldValue;
      } else {
        resolvedGoldValue = Math.round(
          params.baseGoldValue * ITEM_TIER_CONFIG[params.tier].goldMultiplier
        );
      }
    } else {
      resolvedGoldValue = params.baseGoldValue;
    }
  } else if (baseCatalog) {
    const tier = params.tier ?? 1;
    resolvedGoldValue = Math.round(baseCatalog.baseGoldValue * ITEM_TIER_CONFIG[tier].goldMultiplier);
  } else if (matCatalog) {
    resolvedGoldValue = matCatalog.goldValue;
  } else if (consumableCatalog) {
    resolvedGoldValue = consumableCatalog.goldValue;
  } else {
    resolvedGoldValue = RARITY_FALLBACK_GOLD[params.rarity ?? 'COMMON'];
  }

  const unitSellGold = Math.max(1, Math.round(resolvedGoldValue * 0.45));
  return {
    unitSellGold,
    totalSellGold: unitSellGold * quantity,
  };
}

// ============================================================================
// 6. TRAINER NPC TALENT RESPEC & BUILD GUIDANCE
// ============================================================================

const ALL_GOVERNING_STATS: readonly TalentGoverningStat[] = [
  'STRENGTH',
  'ENDURANCE',
  'AGILITY',
  'DEXTERITY',
  'CONSTITUTION',
  'WISDOM',
  'SPIRIT',
];

function createEmptyStatPointMap(): Record<TalentGoverningStat, number> {
  return {
    STRENGTH: 0,
    ENDURANCE: 0,
    AGILITY: 0,
    DEXTERITY: 0,
    CONSTITUTION: 0,
    WISDOM: 0,
    SPIRIT: 0,
  };
}

export interface TalentRespecQuote {
  totalPointsSpent: number;
  goldCost: number;
  refundedByStat: Record<TalentGoverningStat, number>;
  canRespec: boolean;
}

export function calculateTalentRespecCost(
  unlockedNodeRanks: Readonly<Record<string, number>>,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): TalentRespecQuote {
  const refundedByStat = createEmptyStatPointMap();
  let totalPointsSpent = 0;

  for (const tree of trees) {
    for (const node of tree.nodes) {
      const rank = unlockedNodeRanks[node.id] ?? 0;
      if (rank > 0) {
        const points = rank * node.pointCostPerRank;
        refundedByStat[tree.governingStat] += points;
        totalPointsSpent += points;
      }
    }
  }

  const canRespec = totalPointsSpent > 0;
  const goldCost = canRespec ? 20 + totalPointsSpent * 15 : 0;

  return {
    totalPointsSpent,
    goldCost,
    refundedByStat,
    canRespec,
  };
}

export type RespecCharacterTalentsResult =
  | {
      ok: true;
      goldCost: number;
      remainingGold: number;
      totalPointsRefunded: number;
      refundedByStat: Record<TalentGoverningStat, number>;
      nextAvailablePoints: Record<TalentGoverningStat, number>;
      nextUnlockedNodeRanks: Record<string, number>;
      nextActiveSkillLoadout: string[];
    }
  | { ok: false; error: string };

export function respecCharacterTalents(params: {
  currentGold: number;
  availablePoints: Partial<Record<TalentGoverningStat, number>>;
  unlockedNodeRanks: Readonly<Record<string, number>>;
  activeSkillLoadout?: unknown;
  trees?: readonly TalentTreeDefinition[];
}): RespecCharacterTalentsResult {
  const trees = params.trees ?? DEFAULT_TALENT_TREES;
  const quote = calculateTalentRespecCost(params.unlockedNodeRanks, trees);

  if (!quote.canRespec) {
    return {
      ok: false,
      error: 'No talent points are currently allocated to respec.',
    };
  }

  if (!Number.isFinite(params.currentGold) || params.currentGold < quote.goldCost) {
    return {
      ok: false,
      error: `Insufficient Gold: respec requires ${quote.goldCost}g, available ${Math.max(0, Math.floor(params.currentGold))}g.`,
    };
  }

  const nextAvailablePoints = createEmptyStatPointMap();
  for (const stat of ALL_GOVERNING_STATS) {
    nextAvailablePoints[stat] =
      (params.availablePoints[stat] ?? 0) + quote.refundedByStat[stat];
  }

  const nextUnlockedNodeRanks: Record<string, number> = {};
  const nextActiveSkillLoadout = sanitizeActiveSkillLoadout(
    params.activeSkillLoadout ?? [],
    nextUnlockedNodeRanks,
    trees
  );

  return {
    ok: true,
    goldCost: quote.goldCost,
    remainingGold: params.currentGold - quote.goldCost,
    totalPointsRefunded: quote.totalPointsSpent,
    refundedByStat: quote.refundedByStat,
    nextAvailablePoints,
    nextUnlockedNodeRanks,
    nextActiveSkillLoadout,
  };
}

export interface RecommendedTalentBuild {
  archetypeId: string;
  title: string;
  primaryStat: TalentGoverningStat;
  secondaryStat: TalentGoverningStat;
  summary: string;
  recommendedTreeSlugs: readonly string[];
  priorityNodeIds: readonly string[];
  trainingFocusTip: string;
}

export const RECOMMENDED_TALENT_BUILDS: readonly RecommendedTalentBuild[] = [
  {
    archetypeId: 'ironclad_vanguard',
    title: 'Ironclad Vanguard',
    primaryStat: 'STRENGTH',
    secondaryStat: 'CONSTITUTION',
    summary: 'Crushing melee cleave paired with frontline armor and shield durability.',
    recommendedTreeSlugs: ['vanguard', 'juggernaut', 'guardian'],
    priorityNodeIds: [
      'van_heavy_handed',
      'van_sundering_strikes',
      'van_colossus_cleave',
      'jug_iron_skin',
      'grd_iron_fortitude',
    ],
    trainingFocusTip: 'Log compound resistance sets and consistent sleep to scale Strength and Constitution.',
  },
  {
    archetypeId: 'enduring_warden',
    title: 'Enduring Warden',
    primaryStat: 'ENDURANCE',
    secondaryStat: 'CONSTITUTION',
    summary: 'Sustained stamina regeneration, party auras, and high-uptime dungeon pacing.',
    recommendedTreeSlugs: ['warden', 'outrider', 'guardian'],
    priorityNodeIds: [
      'war_deep_lungs',
      'war_renewal_aura',
      'war_second_wind_hymn',
      'out_trailblazer',
      'grd_vital_resolve',
    ],
    trainingFocusTip: 'Focus on steady Zone 2-3 cardio sessions and daily steps to fuel Endurance.',
  },
  {
    archetypeId: 'crimson_assassin',
    title: 'Crimson Assassin',
    primaryStat: 'AGILITY',
    secondaryStat: 'DEXTERITY',
    summary: 'High attack speed, critical burst strikes, and lethal opening pressure.',
    recommendedTreeSlugs: ['berserker', 'assassin', 'acrobat'],
    priorityNodeIds: [
      'ber_bloodlust_tempo',
      'ber_frenzied_flurry',
      'ass_shadowstep_reflexes',
      'ass_phantom_strike',
      'acro_feather_step',
    ],
    trainingFocusTip: 'Prioritize HIIT intervals, boxing, or sprint circuits for rapid Agility gains.',
  },
  {
    archetypeId: 'wind_acrobat',
    title: 'Wind-Dancer Acrobat',
    primaryStat: 'DEXTERITY',
    secondaryStat: 'AGILITY',
    summary: 'Evasive dodge-tanking, precision strikes, and agile counter-tempo.',
    recommendedTreeSlugs: ['acrobat', 'assassin', 'outrider'],
    priorityNodeIds: [
      'acro_feather_step',
      'acro_wind_dancer',
      'acro_mirage_vault',
      'ass_deadly_grace',
      'out_swift_stride',
    ],
    trainingFocusTip: 'Train calisthenics, climbing, or agility drills to sharpen Dexterity.',
  },
  {
    archetypeId: 'aegis_guardian',
    title: 'Aegis Citadel Guardian',
    primaryStat: 'CONSTITUTION',
    secondaryStat: 'STRENGTH',
    summary: 'Unbreakable health pools, damage mitigation, and threat-holding shield slams.',
    recommendedTreeSlugs: ['guardian', 'juggernaut', 'warden'],
    priorityNodeIds: [
      'grd_iron_fortitude',
      'grd_bastion_plating',
      'grd_aegis_slam',
      'jug_iron_skin',
      'war_deep_lungs',
    ],
    trainingFocusTip: 'Maintain strong sleep hygiene and heavy core training to maximize Constitution.',
  },
  {
    archetypeId: 'sanctum_cleric',
    title: 'Sanctum Cleric',
    primaryStat: 'WISDOM',
    secondaryStat: 'SPIRIT',
    summary: 'Mana-fueled party healing, protective wards, and steady sustain.',
    recommendedTreeSlugs: ['cleric', 'mage', 'warden'],
    priorityNodeIds: [
      'cle_mending_aura',
      'cle_sacred_vitality',
      'cle_divine_intervention',
      'mag_arcane_focus',
      'war_renewal_aura',
    ],
    trainingFocusTip: 'Pair yoga, mobility, and mindful recovery sessions to cultivate Wisdom.',
  },
  {
    archetypeId: 'astral_archmage',
    title: 'Astral Archmage',
    primaryStat: 'SPIRIT',
    secondaryStat: 'WISDOM',
    summary: 'Explosive mana-powered spellcraft, arcane shields, and skill potency scaling.',
    recommendedTreeSlugs: ['mage', 'cleric', 'acrobat'],
    priorityNodeIds: [
      'mag_arcane_focus',
      'mag_astral_conduit',
      'mag_supernova_blast',
      'cle_inner_radiance',
      'acro_fluid_movement',
    ],
    trainingFocusTip: 'Combine meditation, breathwork, and cold-plunge recovery to raise Spirit.',
  },
];

export function recommendTalentBuildForStats(
  stats: Partial<CoreStatBlock>,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): RecommendedTalentBuild {
  const normalized = normalizeCoreStatBlock(stats);
  const statValues: Record<TalentGoverningStat, number> = {
    STRENGTH: normalized.strengthLevel,
    ENDURANCE: normalized.enduranceLevel,
    AGILITY: normalized.agilityLevel,
    DEXTERITY: normalized.dexLevel,
    CONSTITUTION: normalized.conLevel,
    WISDOM: normalized.wisLevel,
    SPIRIT: normalized.sprLevel,
  };

  let dominantStat: TalentGoverningStat = 'STRENGTH';
  let highestValue = -1;
  for (const stat of ALL_GOVERNING_STATS) {
    if (statValues[stat] > highestValue) {
      highestValue = statValues[stat];
      dominantStat = stat;
    }
  }

  const baseBuild =
    RECOMMENDED_TALENT_BUILDS.find((b) => b.primaryStat === dominantStat) ??
    RECOMMENDED_TALENT_BUILDS[0]!;

  const validTreeSlugs = new Set(trees.map((t) => t.slug));
  const validNodeIds = new Set(trees.flatMap((t) => t.nodes.map((n) => n.id)));

  return {
    ...baseBuild,
    recommendedTreeSlugs: baseBuild.recommendedTreeSlugs.filter((slug) =>
      validTreeSlugs.has(slug)
    ),
    priorityNodeIds: baseBuild.priorityNodeIds.filter((id) => validNodeIds.has(id)),
  };
}
