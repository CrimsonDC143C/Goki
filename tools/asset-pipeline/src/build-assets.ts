import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvModule, { type ErrorObject } from 'ajv';
import sharp from 'sharp';

type RegistryName =
  | 'HUB_ENVIRONMENT_ART_REGISTRY'
  | 'BATTLE_ARENA_ART_REGISTRY'
  | 'NPC_PORTRAIT_ART_REGISTRY'
  | 'ITEM_ICON_REGISTRY'
  | 'RACE_ILLUSTRATION_SLOTS'
  | 'COMBAT_ENEMY_ART_REGISTRY'
  | 'HERO_COMBAT_ART_REGISTRY'
  | 'LOOT_CHEST_ART_REGISTRY';

type ReferenceSetKey =
  | 'ANIME_WORLD'
  | 'ANIME_ARENA'
  | 'ANIME_RIG_PARTS'
  | 'ANIME_ITEMS';

type AssetStatus = 'pending' | 'generated' | 'review' | 'approved' | 'rejected';

type ResizeFit = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

interface NormalizedCropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface AssetEntry {
  id: string;
  category: string;
  registry: RegistryName;
  slot: string;
  field?: string | null;
  referenceSetKey: ReferenceSetKey;
  generationMethod: string;
  priority: number;
  status: AssetStatus;
  dimensions: { width: number; height: number };
  cropRegion?: NormalizedCropRegion;
  fit: ResizeFit;
  position?: string;
  format: 'webp';
  quality?: number;
  alphaQuality?: number;
  preserveAlpha?: boolean;
  removeBackground: boolean;
  backdropStyle?: string;
  rawPath: string;
  compiledPath: string;
  parallaxGroup?: string;
  layerIndex?: number;
  baseAssetId?: string;
  promptNotes?: string;
  layerFileId?: string | null;
}

interface AssetsManifest {
  $schema?: string;
  version: number;
  layer: {
    workspaceId: string;
    workspaceName: string;
    workspaceSlug: string;
    projectId: string | null;
    referenceSets: Record<
      ReferenceSetKey,
      { id: string; name: string; category: string; defaultModelId?: string }
    >;
  };
  defaults: {
    webpQuality: number;
    webpAlphaQuality: number;
    webpEffort: number;
  };
  assets: AssetEntry[];
}

const VALID_HUB_SLOTS = new Set([
  'hero_sanctum',
  'adventure_guild_hall',
  'adventure_expedition_map',
  'artisan_forge_apothecary',
  'artisan_gathering_wilds',
  'social_clan_hall',
  'social_company_tavern',
]);
const VALID_HUB_FIELDS = new Set(['backdropSource', 'headerBannerSource']);

const VALID_ARENA_THEMES = new Set([
  'whitewood_forest',
  'crypt_catacombs',
  'obsidian_citadel',
  'sun_scorched_caldera',
  'arena_courtyard',
]);
const VALID_ARENA_FIELDS = new Set([
  'sky',
  'cloudsOrMist',
  'mountainsOrWalls',
  'hillBackground',
  'hillMidground',
  'groundForeground',
]);

const VALID_NPC_IDS = new Set([
  'GUIDE',
  'GUILD_RECEPTIONIST',
  'TRADER',
  'TRAINER',
  'QUARTERMASTER',
  'CLAN_WARDEN',
]);
const VALID_NPC_EXPRESSIONS = new Set(['neutral', 'happy', 'focused', 'alert']);

const VALID_RACES = new Set(['HUMAN', 'ONI', 'KITSUNE']);
const VALID_SILHOUETTES = new Set(['balanced', 'lithe', 'broad_shouldered']);
const VALID_RACE_FIELDS = new Set(['standingSource', 'bustSource']);

const VALID_COMBAT_ENEMIES = new Set([
  'skeleton',
  'orc',
  'greatsword_skeleton',
  'knight',
  'swordsman',
  'archer',
  'ignisrax',
  'vaelgor',
  'malakor',
  'goretooth',
  'commander_vane',
  'valerius',
  'chronos',
]);
const VALID_COMBAT_ENEMY_FIELDS = new Set(['spriteSource', 'bustSource']);
const VALID_LOOT_CHEST_TIERS = new Set(['tier_1', 'tier_2', 'tier_3', 'tier_4', 'tier_5']);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  'art-pipeline/manifest/assets-manifest.json'
);
const SCHEMA_PATH = path.join(
  REPO_ROOT,
  'art-pipeline/manifest/assets-manifest.schema.json'
);
const GENERATED_FILE_PATH = path.join(
  REPO_ROOT,
  'apps/mobile/src/assets/generated/compiledAssets.generated.ts'
);

/** Reads and parses a UTF-8 JSON file. */
function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

/** Formats AJV validation errors into readable single-line messages. */
function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return ['Unknown schema validation failure'];
  }
  return errors.map((err) => {
    const loc = err.instancePath || '<root>';
    const params = JSON.stringify(err.params);
    return `  - ${loc}: ${err.message ?? 'invalid'} (${params})`;
  });
}

/** Normalizes any OS file path separator to POSIX forward slashes. */
function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

/** Computes a Metro-compatible static require path from the generated module directory. */
function toRequireImportPath(compiledAbsPath: string): string {
  const generatedDir = path.dirname(GENERATED_FILE_PATH);
  const posixRel = toPosixPath(path.relative(generatedDir, compiledAbsPath));
  return posixRel.startsWith('.') ? posixRel : `./${posixRel}`;
}

/** Sorts strings deterministically using ASCII code-point order. */
function compareAscii(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Validates manifest schema and Goki registry/slot semantics; exits on errors. */
function loadAndValidateManifest(): AssetsManifest {
  const schema = readJsonFile<Record<string, unknown>>(SCHEMA_PATH);
  const manifest = readJsonFile<AssetsManifest>(MANIFEST_PATH);

  const AjvConstructor =
    (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
  const ajv = new AjvConstructor({ allErrors: true, strict: true });
  const validate = ajv.compile<AssetsManifest>(schema);

  if (!validate(manifest)) {
    console.error('[asset-pipeline] Schema validation failed for assets-manifest.json:');
    for (const line of formatAjvErrors(validate.errors)) {
      console.error(line);
    }
    process.exit(1);
  }

  const semanticErrors: string[] = [];
  const seenIds = new Set<string>();
  const seenTargets = new Set<string>();
  const seenCompiledPaths = new Set<string>();
  const allIds = new Set(manifest.assets.map((entry) => entry.id));

  for (const entry of manifest.assets) {
    if (seenIds.has(entry.id)) {
      semanticErrors.push(`Duplicate asset id: "${entry.id}"`);
    }
    seenIds.add(entry.id);

    const targetKey = `${entry.registry}:${entry.slot}:${entry.field ?? ''}`;
    if (seenTargets.has(targetKey)) {
      semanticErrors.push(`Duplicate registry target "${targetKey}" on "${entry.id}"`);
    }
    seenTargets.add(targetKey);

    if (seenCompiledPaths.has(entry.compiledPath)) {
      semanticErrors.push(
        `Duplicate compiledPath "${entry.compiledPath}" on "${entry.id}"`
      );
    }
    seenCompiledPaths.add(entry.compiledPath);

    if (!manifest.layer.referenceSets[entry.referenceSetKey]) {
      semanticErrors.push(
        `Unknown referenceSetKey "${entry.referenceSetKey}" on "${entry.id}"`
      );
    }

    if (entry.baseAssetId && !allIds.has(entry.baseAssetId)) {
      semanticErrors.push(
        `Missing baseAssetId "${entry.baseAssetId}" referenced by "${entry.id}"`
      );
    }

    validateEntryRegistryTarget(entry, semanticErrors);
  }

  if (semanticErrors.length > 0) {
    console.error('[asset-pipeline] Semantic validation failed:');
    for (const msg of semanticErrors) {
      console.error(`  - ${msg}`);
    }
    process.exit(1);
  }

  return manifest;
}

/** Checks that each asset's registry, slot, and field match Goki mobile registries. */
function validateEntryRegistryTarget(entry: AssetEntry, errors: string[]): void {
  if (entry.registry === 'HUB_ENVIRONMENT_ART_REGISTRY') {
    if (!VALID_HUB_SLOTS.has(entry.slot)) {
      errors.push(`Invalid hub slot "${entry.slot}" on "${entry.id}"`);
    }
    if (!entry.field || !VALID_HUB_FIELDS.has(entry.field)) {
      errors.push(`Invalid hub field "${entry.field ?? ''}" on "${entry.id}"`);
    }
    return;
  }

  if (entry.registry === 'BATTLE_ARENA_ART_REGISTRY') {
    if (!VALID_ARENA_THEMES.has(entry.slot)) {
      errors.push(`Invalid arena theme "${entry.slot}" on "${entry.id}"`);
    }
    if (!entry.field || !VALID_ARENA_FIELDS.has(entry.field)) {
      errors.push(`Invalid arena layer field "${entry.field ?? ''}" on "${entry.id}"`);
    }
    return;
  }

  if (entry.registry === 'NPC_PORTRAIT_ART_REGISTRY') {
    if (!VALID_NPC_IDS.has(entry.slot)) {
      errors.push(`Invalid NPC archetype "${entry.slot}" on "${entry.id}"`);
    }
    if (!entry.field || !VALID_NPC_EXPRESSIONS.has(entry.field)) {
      errors.push(`Invalid NPC expression "${entry.field ?? ''}" on "${entry.id}"`);
    }
    return;
  }

  if (entry.registry === 'ITEM_ICON_REGISTRY' && !/^[a-z0-9_]+$/.test(entry.slot)) {
    errors.push(`Invalid item icon slug "${entry.slot}" on "${entry.id}"`);
    return;
  }

  if (entry.registry === 'RACE_ILLUSTRATION_SLOTS') {
    const [race, silhouette, extra] = entry.slot.split('.');
    if (extra !== undefined || !race || !silhouette || !VALID_RACES.has(race) || !VALID_SILHOUETTES.has(silhouette)) {
      errors.push(`Invalid race illustration slot "${entry.slot}" on "${entry.id}" (expected "<RACE>.<silhouette>")`);
    }
    if (!entry.field || !VALID_RACE_FIELDS.has(entry.field)) {
      errors.push(`Invalid race illustration field "${entry.field ?? ''}" on "${entry.id}"`);
    }
    if (entry.cropRegion) {
      if (entry.cropRegion.left + entry.cropRegion.width > 1.001) {
        errors.push(`Invalid cropRegion horizontal bounds on "${entry.id}"`);
      }
      if (entry.cropRegion.top + entry.cropRegion.height > 1.001) {
        errors.push(`Invalid cropRegion vertical bounds on "${entry.id}"`);
      }
    }
    return;
  }

  if (entry.registry === 'COMBAT_ENEMY_ART_REGISTRY') {
    if (!VALID_COMBAT_ENEMIES.has(entry.slot)) {
      errors.push(`Invalid combat enemy slot "${entry.slot}" on "${entry.id}"`);
    }
    if (!entry.field || !VALID_COMBAT_ENEMY_FIELDS.has(entry.field)) {
      errors.push(`Invalid combat enemy field "${entry.field ?? ''}" on "${entry.id}"`);
    }
    if (entry.cropRegion) {
      if (entry.cropRegion.left + entry.cropRegion.width > 1.001) {
        errors.push(`Invalid cropRegion horizontal bounds on "${entry.id}"`);
      }
      if (entry.cropRegion.top + entry.cropRegion.height > 1.001) {
        errors.push(`Invalid cropRegion vertical bounds on "${entry.id}"`);
      }
    }
    return;
  }

  if (entry.registry === 'HERO_COMBAT_ART_REGISTRY') {
    if (!/^[a-z0-9_]+$/.test(entry.slot)) {
      errors.push(`Invalid hero combat skin slot "${entry.slot}" on "${entry.id}"`);
    }
    return;
  }

  if (entry.registry === 'LOOT_CHEST_ART_REGISTRY') {
    if (!VALID_LOOT_CHEST_TIERS.has(entry.slot)) {
      errors.push(`Invalid loot chest tier slot "${entry.slot}" on "${entry.id}"`);
    }
  }
}

/** Compiles one raw asset image into a sized, optimized WebP target. */
async function compileRawAssetToWebp(
  entry: AssetEntry,
  defaults: AssetsManifest['defaults'],
  rawAbsPath: string,
  compiledAbsPath: string
): Promise<void> {
  fs.mkdirSync(path.dirname(compiledAbsPath), { recursive: true });

  const preserveAlpha = Boolean(entry.preserveAlpha);
  const opaqueBackdrop = { r: 12, g: 16, b: 24 };
  const resizeBackground = preserveAlpha
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { ...opaqueBackdrop, alpha: 1 };

  const position = entry.position === 'center' ? 'centre' : (entry.position ?? 'centre');

  let pipeline = sharp(rawAbsPath).rotate();

  if (entry.cropRegion) {
    const meta = await sharp(rawAbsPath).rotate().metadata();
    const srcWidth = meta.width ?? 0;
    const srcHeight = meta.height ?? 0;
    if (srcWidth > 0 && srcHeight > 0) {
      const left = Math.max(0, Math.min(srcWidth - 1, Math.round(srcWidth * entry.cropRegion.left)));
      const top = Math.max(0, Math.min(srcHeight - 1, Math.round(srcHeight * entry.cropRegion.top)));
      const width = Math.max(1, Math.min(srcWidth - left, Math.round(srcWidth * entry.cropRegion.width)));
      const height = Math.max(1, Math.min(srcHeight - top, Math.round(srcHeight * entry.cropRegion.height)));
      pipeline = pipeline.extract({ left, top, width, height });
    }
  }

  pipeline = pipeline.resize(entry.dimensions.width, entry.dimensions.height, {
    fit: entry.fit,
    position,
    background: resizeBackground,
  });

  if (!preserveAlpha) {
    pipeline = pipeline.flatten({ background: opaqueBackdrop });
  }

  await pipeline
    .webp({
      quality: entry.quality ?? defaults.webpQuality,
      alphaQuality: entry.alphaQuality ?? defaults.webpAlphaQuality,
      effort: defaults.webpEffort,
    })
    .toFile(compiledAbsPath);
}

/** Renders the static require() registry TypeScript file for compiled mobile assets. */
function renderGeneratedModule(entries: AssetEntry[]): string {
  const hubMap = new Map<string, Map<string, string>>();
  const arenaMap = new Map<string, Map<string, string>>();
  const npcMap = new Map<string, Map<string, string>>();
  const itemMap = new Map<string, string>();
  const raceMap = new Map<string, Map<string, Map<string, string>>>();
  const enemyMap = new Map<string, Map<string, string>>();
  const heroCombatMap = new Map<string, string>();
  const chestMap = new Map<string, string>();

  for (const entry of entries) {
    const compiledAbs = path.resolve(REPO_ROOT, entry.compiledPath);
    const reqPath = toRequireImportPath(compiledAbs);

    if (entry.registry === 'HUB_ENVIRONMENT_ART_REGISTRY' && entry.field) {
      const slotFields = hubMap.get(entry.slot) ?? new Map<string, string>();
      slotFields.set(entry.field, reqPath);
      hubMap.set(entry.slot, slotFields);
    } else if (entry.registry === 'BATTLE_ARENA_ART_REGISTRY' && entry.field) {
      const themeFields = arenaMap.get(entry.slot) ?? new Map<string, string>();
      themeFields.set(entry.field, reqPath);
      arenaMap.set(entry.slot, themeFields);
    } else if (entry.registry === 'NPC_PORTRAIT_ART_REGISTRY' && entry.field) {
      const npcFields = npcMap.get(entry.slot) ?? new Map<string, string>();
      npcFields.set(entry.field, reqPath);
      npcMap.set(entry.slot, npcFields);
    } else if (entry.registry === 'ITEM_ICON_REGISTRY') {
      itemMap.set(entry.slot, reqPath);
    } else if (entry.registry === 'RACE_ILLUSTRATION_SLOTS' && entry.field) {
      const [race, silhouette] = entry.slot.split('.');
      if (race && silhouette) {
        const silMap = raceMap.get(race) ?? new Map<string, Map<string, string>>();
        const fieldMap = silMap.get(silhouette) ?? new Map<string, string>();
        fieldMap.set(entry.field, reqPath);
        silMap.set(silhouette, fieldMap);
        raceMap.set(race, silMap);
      }
    } else if (entry.registry === 'COMBAT_ENEMY_ART_REGISTRY' && entry.field) {
      const enemyFields = enemyMap.get(entry.slot) ?? new Map<string, string>();
      enemyFields.set(entry.field, reqPath);
      enemyMap.set(entry.slot, enemyFields);
    } else if (entry.registry === 'HERO_COMBAT_ART_REGISTRY') {
      heroCombatMap.set(entry.slot, reqPath);
    } else if (entry.registry === 'LOOT_CHEST_ART_REGISTRY') {
      chestMap.set(entry.slot, reqPath);
    }
  }

  const lines: string[] = [
    '// AUTO-GENERATED FILE — DO NOT EDIT MANUALLY.',
    '// Generated by tools/asset-pipeline/src/build-assets.ts via `npm run assets:build`.',
    '',
    "import type { ImageSourcePropType } from 'react-native';",
    "import type { BaseSilhouetteId, CharacterRace } from '@goki/game-engine';",
    "import type { NpcArchetypeId, NpcExpression } from '../../components/npc/NpcPortraitSvg';",
    'import type {',
    '  BattleArenaParallaxLayerKey,',
    '  BattleArenaThemeId,',
    '  CombatEnemyArtId,',
    '  HubEnvironmentSlotId,',
    '  LootChestTierId,',
    "} from '../rpgArtRegistry';",
    '',
    'export type CompiledHubEnvironmentOverrides = Partial<',
    '  Record<',
    '    HubEnvironmentSlotId,',
    '    {',
    '      backdropSource?: ImageSourcePropType;',
    '      headerBannerSource?: ImageSourcePropType;',
    '    }',
    '  >',
    '>;',
    '',
    'export type CompiledBattleArenaOverrides = Partial<',
    '  Record<BattleArenaThemeId, Partial<Record<BattleArenaParallaxLayerKey, ImageSourcePropType>>>',
    '>;',
    '',
    'export type CompiledNpcPortraitOverrides = Partial<',
    '  Record<NpcArchetypeId, Partial<Record<NpcExpression, ImageSourcePropType>>>',
    '>;',
    '',
    'export type CompiledItemIconOverrides = Record<string, ImageSourcePropType>;',
    '',
    'export type CompiledRaceIllustrationOverrides = Partial<',
    '  Record<',
    '    CharacterRace,',
    '    Partial<',
    '      Record<',
    '        BaseSilhouetteId,',
    '        {',
    '          standingSource?: ImageSourcePropType;',
    '          bustSource?: ImageSourcePropType;',
    '        }',
    '      >',
    '    >',
    '  >',
    '>;',
    '',
    'export type CompiledCombatEnemyOverrides = Partial<',
    '  Record<',
    '    CombatEnemyArtId,',
    '    {',
    '      spriteSource?: ImageSourcePropType;',
    '      bustSource?: ImageSourcePropType;',
    '    }',
    '  >',
    '>;',
    '',
    'export type CompiledHeroCombatOverrides = Record<string, ImageSourcePropType>;',
    '',
    'export type CompiledLootChestOverrides = Partial<Record<LootChestTierId, ImageSourcePropType>>;',
    '',
    ...formatNestedRequireMap(
      'COMPILED_HUB_ENVIRONMENT_ART',
      'CompiledHubEnvironmentOverrides',
      hubMap
    ),
    '',
    ...formatNestedRequireMap(
      'COMPILED_BATTLE_ARENA_ART',
      'CompiledBattleArenaOverrides',
      arenaMap
    ),
    '',
    ...formatNestedRequireMap(
      'COMPILED_NPC_PORTRAIT_ART',
      'CompiledNpcPortraitOverrides',
      npcMap
    ),
    '',
    ...formatFlatRequireMap(
      'COMPILED_ITEM_ICON_ART',
      'CompiledItemIconOverrides',
      itemMap
    ),
    '',
    ...formatTripleNestedRequireMap(
      'COMPILED_RACE_ILLUSTRATION_ART',
      'CompiledRaceIllustrationOverrides',
      raceMap
    ),
    '',
    ...formatNestedRequireMap(
      'COMPILED_COMBAT_ENEMY_ART',
      'CompiledCombatEnemyOverrides',
      enemyMap
    ),
    '',
    ...formatFlatRequireMap(
      'COMPILED_HERO_COMBAT_ART',
      'CompiledHeroCombatOverrides',
      heroCombatMap
    ),
    '',
    ...formatFlatRequireMap(
      'COMPILED_LOOT_CHEST_ART',
      'CompiledLootChestOverrides',
      chestMap
    ),
    '',
  ];

  return lines.join('\n');
}

/** Formats a three-level map of static require() expressions with sorted keys. */
function formatTripleNestedRequireMap(
  exportName: string,
  typeName: string,
  entries: Map<string, Map<string, Map<string, string>>>
): string[] {
  const level1Keys = Array.from(entries.keys()).sort(compareAscii);
  if (level1Keys.length === 0) {
    return [`export const ${exportName}: ${typeName} = {};`];
  }

  const lines: string[] = [`export const ${exportName}: ${typeName} = {`];
  for (const k1 of level1Keys) {
    const level2 = entries.get(k1)!;
    const level2Keys = Array.from(level2.keys()).sort(compareAscii);
    lines.push(`  ${k1}: {`);
    for (const k2 of level2Keys) {
      const level3 = level2.get(k2)!;
      const level3Keys = Array.from(level3.keys()).sort(compareAscii);
      lines.push(`    ${k2}: {`);
      for (const k3 of level3Keys) {
        const reqPath = level3.get(k3)!;
        lines.push(`      ${k3}: require('${reqPath}') as ImageSourcePropType,`);
      }
      lines.push('    },');
    }
    lines.push('  },');
  }
  lines.push('};');
  return lines;
}

/** Formats a two-level map of static require() expressions with sorted keys. */
function formatNestedRequireMap(
  exportName: string,
  typeName: string,
  entries: Map<string, Map<string, string>>
): string[] {
  const outerKeys = Array.from(entries.keys()).sort(compareAscii);
  if (outerKeys.length === 0) {
    return [`export const ${exportName}: ${typeName} = {};`];
  }

  const lines: string[] = [`export const ${exportName}: ${typeName} = {`];
  for (const outerKey of outerKeys) {
    const inner = entries.get(outerKey)!;
    const innerKeys = Array.from(inner.keys()).sort(compareAscii);
    lines.push(`  ${outerKey}: {`);
    for (const innerKey of innerKeys) {
      const reqPath = inner.get(innerKey)!;
      lines.push(`    ${innerKey}: require('${reqPath}') as ImageSourcePropType,`);
    }
    lines.push('  },');
  }
  lines.push('};');
  return lines;
}

/** Formats a single-level map of static require() expressions with sorted keys. */
function formatFlatRequireMap(
  exportName: string,
  typeName: string,
  entries: Map<string, string>
): string[] {
  const keys = Array.from(entries.keys()).sort(compareAscii);
  if (keys.length === 0) {
    return [`export const ${exportName}: ${typeName} = {};`];
  }

  const lines: string[] = [`export const ${exportName}: ${typeName} = {`];
  for (const key of keys) {
    const reqPath = entries.get(key)!;
    lines.push(`  ${key}: require('${reqPath}') as ImageSourcePropType,`);
  }
  lines.push('};');
  return lines;
}

async function main(): Promise<void> {
  const manifest = loadAndValidateManifest();
  console.log(
    `[asset-pipeline] Schema & semantic validation passed (${manifest.assets.length} manifest entries).`
  );

  let approvedCount = 0;
  let compiledCount = 0;
  let reusedCount = 0;
  let pendingOrSkippedCount = 0;
  const availableEntries: AssetEntry[] = [];

  for (const entry of manifest.assets) {
    if (entry.status !== 'approved') {
      pendingOrSkippedCount += 1;
      continue;
    }

    approvedCount += 1;
    const rawAbsPath = path.resolve(REPO_ROOT, entry.rawPath);
    const compiledAbsPath = path.resolve(REPO_ROOT, entry.compiledPath);

    if (fs.existsSync(rawAbsPath)) {
      await compileRawAssetToWebp(
        entry,
        manifest.defaults,
        rawAbsPath,
        compiledAbsPath
      );
      compiledCount += 1;
      availableEntries.push(entry);
    } else if (fs.existsSync(compiledAbsPath)) {
      reusedCount += 1;
      console.log(
        `[asset-pipeline] Reusing committed compiled WebP for "${entry.id}" (raw missing locally).`
      );
      availableEntries.push(entry);
    } else {
      pendingOrSkippedCount += 1;
      console.warn(
        `[asset-pipeline] Warning: approved asset "${entry.id}" has neither raw (${entry.rawPath}) nor compiled (${entry.compiledPath}); skipping require().`
      );
    }
  }

  fs.mkdirSync(path.dirname(GENERATED_FILE_PATH), { recursive: true });
  const generatedSource = renderGeneratedModule(availableEntries);
  fs.writeFileSync(GENERATED_FILE_PATH, generatedSource, 'utf8');

  console.log(
    [
      '[asset-pipeline] Build complete:',
      `total=${manifest.assets.length}`,
      `approved=${approvedCount}`,
      `compiled=${compiledCount}`,
      `reused=${reusedCount}`,
      `pendingOrSkipped=${pendingOrSkippedCount}`,
      `generated=${toPosixPath(path.relative(REPO_ROOT, GENERATED_FILE_PATH))}`,
    ].join(' ')
  );
}

main().catch((err: unknown) => {
  console.error('[asset-pipeline] Unexpected failure:', err);
  process.exit(1);
});
