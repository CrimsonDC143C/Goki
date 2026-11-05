#!/usr/bin/env node

/**
 * scripts/generate-layer-icons.mjs
 *
 * Standalone generation script for 40 bespoke 1:1 dark-fantasy RPG item icons
 * utilizing Layer.ai's MCP server over stdio with WoW-Style Reference Sets:
 * - ARMOR_SHIELDS: ef9e4869-0ccb-4d50-88a2-e85a430e182e
 * - WEAPONS_LOOT:  5c882e06-197b-4774-90c7-e7390ef43af0
 *
 * Automatically resizes all output PNGs to 512x512 via scripts/resize-image.ps1.
 *
 * CLI Flags:
 *   --slot=<SLOT>      Filter by slot (e.g. --slot=LEGS, --slot=HEAD)
 *   --only=<slugs>     Filter by comma-separated slugs (e.g. --only=ironbound_greatsword)
 *   --force-all        Force regeneration of all icons including completed WoW-style icons
 *   --dry-run          Print generation plan without making API calls
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ASSETS_ITEMS_DIR = path.resolve(ROOT_DIR, 'apps/mobile/assets/items');
const RESIZE_SCRIPT_PATH = path.resolve(__dirname, 'resize-image.ps1');

// --- Layer.ai Configuration ---
export const WORKSPACE_ID = '02c84d2c-9787-43a9-865c-f2bfd9149993'; // Warm Hyrax of Energy
export const BASE_MODEL_ID = 'gpt-image-2.5-flare'; // GPT Image 2.5 Flare (1.7 CUs at 1024x1024)
export const DEFAULT_SESSION_ID = 'b0714cc0-e20b-4ebe-a4b0-c56bfca6eee1';

export const REFERENCE_SETS = {
  ARMOR_SHIELDS: 'ef9e4869-0ccb-4d50-88a2-e85a430e182e', // WoW Armor & Shields
  WEAPONS_LOOT: '5c882e06-197b-4774-90c7-e7390ef43af0',  // WoW Weapons & Items
};

// Icons already regenerated in new WoW style
export const COMPLETED_WOW_SLUGS = new Set([
  'strider_greaves',
  'blackened_iron_tassets',
  'ebony_hakama',
  'wolf_pelt_warkilt',
]);

/**
 * Slot & Slug to Reference Set routing helper:
 * - HEAD, CHEST, LEGS, BOOTS, and shields -> ARMOR_SHIELDS
 * - Weapons, relics, accessories, consumables, materials -> WEAPONS_LOOT
 */
export function getReferenceSetId(slot, slug) {
  const s = String(slot).toUpperCase();
  const lowerSlug = String(slug).toLowerCase();

  // Shields route to ARMOR_SHIELDS
  if (
    lowerSlug === 'tempered_iron_buckler' ||
    lowerSlug === 'oni_tower_shield' ||
    lowerSlug === 'bastion_tower_shield'
  ) {
    return REFERENCE_SETS.ARMOR_SHIELDS;
  }

  // Reliquary relics/lanterns/tomes route to WEAPONS_LOOT
  if (
    lowerSlug === 'reliquary_lantern' ||
    lowerSlug === 'solar_censer_relic' ||
    lowerSlug === 'void_grimoire_codex'
  ) {
    return REFERENCE_SETS.WEAPONS_LOOT;
  }

  if (s === 'HEAD' || s === 'CHEST' || s === 'LEGS' || s === 'BOOTS' || s === 'SHIELD' || s === 'ARMOR') {
    return REFERENCE_SETS.ARMOR_SHIELDS;
  }

  return REFERENCE_SETS.WEAPONS_LOOT;
}

/**
 * 40 Canonical Items from apps/mobile/src/assets/itemArtRegistry.ts
 */
export const ITEMS = [
  // --- Weapons (11) ---
  {
    slug: 'ironbound_greatsword',
    name: 'Ironbound Greatsword',
    slot: 'TWO_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Ironbound Greatsword, broad heavy colossal two-handed blade bound in dark forged iron and reinforced fuller, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'spiked_kanabo',
    name: 'Spiked Kanabo',
    slot: 'TWO_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Spiked Kanabo, heavy octagonal black iron club studded with menacing steel spikes, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'ashwood_longbow',
    name: 'Ashwood Longbow',
    slot: 'TWO_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Ashwood Longbow, curved tall carved recurve war bow with wrapped leather grip and bowstring, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'blackened_halberd',
    name: 'Blackened Halberd',
    slot: 'TWO_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Blackened Halberd, wicked heavy polearm with obsidian axe blade and spear point on reinforced shaft, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'astral_warstaff',
    name: 'Astral Warstaff',
    slot: 'TWO_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Astral Warstaff, carved celestial darkwood quarterstaff crowned with a glowing violet mystic rune crystal, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'watch_broadsword',
    name: 'Watch Broadsword',
    slot: 'ONE_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Watch Broadsword, sturdy tempered steel knight arming sword with crossguard and leather-wrapped hilt, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'windrunner_daggers',
    name: 'Windrunner Daggers',
    slot: 'ONE_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Windrunner Daggers, paired curved rogue daggers with etched wind runes and cord grips, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'reaver_hatchet',
    name: 'Reaver Hatchet',
    slot: 'ONE_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Reaver Hatchet, notched vicious barbaric hand axe with hooked steel bearded head, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'kensei_katana',
    name: 'Kensei Katana',
    slot: 'ONE_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Kensei Katana, curved razor-sharp folded steel curved blade with brass tsuba and black braided tsuka, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'reliquary_mace',
    name: 'Reliquary Mace',
    slot: 'ONE_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Reliquary Mace, flanged holy sanctified iron war mace with engraved clerical runes, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'iron_war_fan',
    name: 'Iron War Fan',
    slot: 'ONE_HANDED',
    prompt: 'World of Warcraft style RPG inventory icon of Iron War Fan, tessen fighting fan with steel blades folded open displaying calligraphic sigils, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },

  // --- Shields & Off-Hands (3) ---
  {
    slug: 'tempered_iron_buckler',
    name: 'Tempered Iron Buckler',
    slot: 'OFF_HAND',
    prompt: 'World of Warcraft style RPG inventory icon of Tempered Iron Buckler, circular reinforced steel buckler shield with brass boss and leather arm strap, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'oni_tower_shield',
    name: 'Oni Tower Shield',
    slot: 'OFF_HAND',
    prompt: 'World of Warcraft style RPG inventory icon of Oni Tower Shield, massive heavy rectangular pavise shield emblazoned with an ominous horned demon oni face, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'reliquary_lantern',
    name: 'Reliquary Lantern',
    slot: 'OFF_HAND',
    prompt: 'World of Warcraft style RPG inventory icon of Reliquary Lantern, ornate gothic brass off-hand lantern burning with an unholy spectral soul flame, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },

  // --- Helmets & Headwear (5) ---
  {
    slug: 'ashen_iron_helm',
    name: 'Ashen Iron Helm',
    slot: 'HEAD',
    prompt: 'World of Warcraft style RPG inventory icon of Ashen Iron Helm, battle-worn steel knight close helm with slitted visor and ashen patina, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'horned_oni_kabuto',
    name: 'Horned Oni Kabuto',
    slot: 'HEAD',
    prompt: 'World of Warcraft style RPG inventory icon of Horned Oni Kabuto, menacing samurai helmet with curved crimson horns and golden crest plate, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'dusk_menpo_mask',
    name: 'Dusk Menpo Mask',
    slot: 'HEAD',
    prompt: 'World of Warcraft style RPG inventory icon of Dusk Menpo Mask, sculpted blackened iron facial armor mask bearing an eerie demonic grimace, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'solar_halo_circlet',
    name: 'Solar Halo Circlet',
    slot: 'HEAD',
    prompt: 'World of Warcraft style RPG inventory icon of Solar Halo Circlet, gleaming radiant gold headpiece radiating sun rays and set with a central amber gem, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'crown_of_the_wyrm',
    name: 'Crown of the Wyrm',
    slot: 'HEAD',
    prompt: 'World of Warcraft style RPG inventory icon of Crown of the Wyrm, ancient draconic royal crown forged from calcified dragon horns and blackened gold, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },

  // --- Chest Armor (4) ---
  {
    slug: 'warden_chainmail',
    name: 'Warden Chainmail',
    slot: 'CHEST',
    prompt: 'World of Warcraft style RPG inventory icon of Warden Chainmail, heavy interlocking steel chain hauberk with reinforced leather shoulder trim, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'cataphract_cuirass',
    name: 'Cataphract Cuirass',
    slot: 'CHEST',
    prompt: 'World of Warcraft style RPG inventory icon of Cataphract Cuirass, sculpted solid steel plate breastplate with polished ridge and brass filigree, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'oxblood_brigandine',
    name: 'Oxblood Brigandine',
    slot: 'CHEST',
    prompt: 'World of Warcraft style RPG inventory icon of Oxblood Brigandine, deep crimson hardened leather vest reinforced with riveted internal steel plates, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'vermilion_martial_gi',
    name: 'Vermilion Martial Gi',
    slot: 'CHEST',
    prompt: 'World of Warcraft style RPG inventory icon of Vermilion Martial Gi, embroidered red monk tunic and combat vest with silk waist cords, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },

  // --- Leg Armor (4) ---
  {
    slug: 'strider_greaves',
    name: 'Strider Greaves',
    slot: 'LEGS',
    prompt: 'World of Warcraft style RPG inventory icon of Strider Leggings, waist-to-knee leather breeches with articulated steel thigh plates and knee guards only, isolated leg armor trousers cut off at the knee, NO boots, NO shoes, NO feet attached, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'blackened_iron_tassets',
    name: 'Blackened Iron Tassets',
    slot: 'LEGS',
    prompt: 'World of Warcraft style RPG inventory icon of Blackened Iron Tassets, heavy dark-forged steel waist belt with layered armored thigh plates and waist-to-knee cuisses only, isolated upper leg armor skirt and thigh guards cut off at the knee, NO boots, NO shoes, NO feet attached, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'ebony_hakama',
    name: 'Ebony Hakama',
    slot: 'LEGS',
    prompt: 'World of Warcraft style RPG inventory icon of Ebony Hakama, pleated dark obsidian silk martial arts trousers and waist-to-knee cloth leg wraps with crimson waist sash only, isolated pants cut off below the knee, NO boots, NO shoes, NO feet attached, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'wolf_pelt_warkilt',
    name: 'Wolf-Pelt Warkilt',
    slot: 'LEGS',
    prompt: 'World of Warcraft style RPG inventory icon of Wolf-Pelt Warkilt, savage grey wolf fur battle kilt with bronze-studded leather waist belt and waist-to-knee thigh straps only, isolated armored kilt cut off at the knee, NO boots, NO shoes, NO feet attached, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },

  // --- Boots (3) ---
  {
    slug: 'ironshod_sabatons',
    name: 'Ironshod Sabatons',
    slot: 'BOOTS',
    prompt: 'World of Warcraft style RPG inventory icon of Ironshod Sabatons, heavy articulated plate greaves and steel combat boots with reinforced soles, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'shinobi_tabi_boots',
    name: 'Shinobi Tabi Boots',
    slot: 'BOOTS',
    prompt: 'World of Warcraft style RPG inventory icon of Shinobi Tabi Boots, split-toe black cloth ninja boots with wrapped ankle bindings and silent tread, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'pilgrim_boots',
    name: 'Pilgrim Boots',
    slot: 'BOOTS',
    prompt: 'World of Warcraft style RPG inventory icon of Pilgrim Boots, rugged traveler brown weathered leather walking boots with brass buckles, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },

  // --- Accessories (4) ---
  {
    slug: 'copper_guild_ring',
    name: 'Copper Guild Ring',
    slot: 'ACCESSORY',
    prompt: 'World of Warcraft style RPG inventory icon of Copper Guild Ring, engraved antique copper signet band etched with merchant guild crest, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'malakor_signet',
    name: 'Malakor Signet',
    slot: 'ACCESSORY',
    prompt: 'World of Warcraft style RPG inventory icon of Malakor Signet, dark cursed iron ring inset with a sinister pulsing bloodstone ruby, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'crimson_oni_charm',
    name: 'Crimson Oni Charm',
    slot: 'ACCESSORY',
    prompt: 'World of Warcraft style RPG inventory icon of Crimson Oni Charm, carved miniature cinnabar demon talisman suspended on knotted silk cord, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'astral_pendant',
    name: 'Astral Pendant',
    slot: 'ACCESSORY',
    prompt: 'World of Warcraft style RPG inventory icon of Astral Pendant, glowing celestial silver amulet cradling a star-shaped lapis lazuli jewel, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },

  // --- Consumables & Crafting Materials (6) ---
  {
    slug: 'vitality_elixir',
    name: 'Vitality Elixir',
    slot: 'CONSUMABLE',
    prompt: 'World of Warcraft style RPG inventory icon of Vitality Elixir, faceted heavy glass potion bottle filled with luminescent red healing liquid, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'tempered_whetstone',
    name: 'Tempered Whetstone',
    slot: 'CONSUMABLE',
    prompt: 'World of Warcraft style RPG inventory icon of Tempered Whetstone, rectangular sharpening grindstone wrapped in oily parchment with steel filings, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'iron_ore_cluster',
    name: 'Iron Ore Cluster',
    slot: 'MATERIAL',
    prompt: 'World of Warcraft style RPG inventory icon of Iron Ore Cluster, rough craggy cluster of raw metallic iron mineral ore with quartz deposits, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'sunleaf_herb_bundle',
    name: 'Sunleaf Herb Bundle',
    slot: 'MATERIAL',
    prompt: 'World of Warcraft style RPG inventory icon of Sunleaf Herb Bundle, tied bouquet of fragrant dried golden medicinal leaves with twine, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'obsidian_ingot',
    name: 'Obsidian Ingot',
    slot: 'MATERIAL',
    prompt: 'World of Warcraft style RPG inventory icon of Obsidian Ingot, polished volcanic black glass metal metal bar with purple prismatic luster, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
  {
    slug: 'raid_essence_crystal',
    name: 'Raid Essence Crystal',
    slot: 'MATERIAL',
    prompt: 'World of Warcraft style RPG inventory icon of Raid Essence Crystal, jagged floating crystalline soul prism humming with iridescent raid power, bold hand-painted dark fantasy game icon, centered 1:1 square composition on dark background',
  },
];

// --- Parse CLI Arguments ---
function parseArgs() {
  const args = process.argv.slice(2);
  let slotFilter = null;
  let onlySlugs = null;
  let forceAll = false;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--slot=')) {
      slotFilter = arg.substring('--slot='.length).trim().toUpperCase();
    } else if (arg.startsWith('--only=')) {
      onlySlugs = arg
        .substring('--only='.length)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg === '--force-all' || arg === '--force') {
      forceAll = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { slotFilter, onlySlugs, forceAll, dryRun };
}

// Retrieve Layer PAT token
function getLayerToken() {
  if (process.env.LAYER_API_KEY) return process.env.LAYER_API_KEY;
  if (process.env.LAYER_API_TOKEN) return process.env.LAYER_API_TOKEN;

  try {
    const configPath = 'C:\\Users\\Icarus\\.gemini\\config\\mcp_config.json';
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const args = parsed?.mcpServers?.['layer-ai']?.args || [];
      const authHeaderIndex = args.indexOf('--header');
      if (authHeaderIndex !== -1 && args[authHeaderIndex + 1]) {
        const val = args[authHeaderIndex + 1];
        const match = val.match(/Bearer\s+([A-Za-z0-9_-]+)/);
        if (match) return match[1];
      }
    }
  } catch {
    // ignore
  }

  return 'layer_pat_z2BGfVVCvhhaG9ByoqzqxIaKIXstMb2hf9t9LXHi0mH3IH';
}

/**
 * Layer MCP Client communicating over JSON-RPC stdio via mcp-remote
 */
class LayerMcpClient {
  constructor(token) {
    this.token = token;
    this.child = null;
    this.msgId = 1;
    this.pending = new Map();
    this.buffer = '';
  }

  async start() {
    this.child = spawn('cmd.exe', [
      '/c',
      'npx',
      '-y',
      'mcp-remote@latest',
      'https://mcp.app.layer.ai/mcp',
      '--header',
      `Authorization: Bearer ${this.token}`,
    ], {
      stdio: ['pipe', 'pipe', 'ignore'], // suppress stderr chatter
    });

    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.id && this.pending.has(msg.id)) {
            const resolve = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            resolve(msg);
          }
        } catch {
          // ignore non-json log lines
        }
      }
    });

    await this.sendRpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'layer-icon-generator', version: '1.0.0' },
    });

    this.child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }) + '\n'
    );
  }

  sendRpc(method, params) {
    const id = this.msgId++;
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }) + '\n';

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`RPC timeout for ${method}`));
        }
      }, 60000);

      this.pending.set(id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });

      this.child.stdin.write(payload);
    });
  }

  async executeForge(item, refSetId) {
    const res = await this.sendRpc('tools/call', {
      name: 'execute_forge',
      arguments: {
        input: {
          workspace_id: WORKSPACE_ID,
          session_id: DEFAULT_SESSION_ID,
          base_model_id: BASE_MODEL_ID,
          batch_size: 1,
          width: 1024,
          height: 1024,
          prompt: item.prompt,
          reference_sets: [{ set_id: refSetId, weight: 1 }],
        },
      },
    });

    const text = res?.result?.content?.[0]?.text || '';
    let inferenceId = null;
    try {
      const parsed = JSON.parse(text);
      inferenceId = parsed?.inference_id || parsed?.id;
    } catch {}

    if (!inferenceId) {
      const match =
        text.match(/"inference_id":\s*"([^"]+)"/) ||
        text.match(/"id":\s*"([^"]+)"/) ||
        text.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (match) inferenceId = match[1];
    }

    if (!inferenceId) {
      throw new Error(`Failed to extract inference_id from execute_forge response: ${text.substring(0, 150)}`);
    }

    return inferenceId;
  }

  async pollForgeRun(inferenceId) {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 4000));

      const pollRes = await this.sendRpc('tools/call', {
        name: 'get_forge_run',
        arguments: {
          input: {
            inference_id: inferenceId,
          },
        },
      });

      const text = pollRes?.result?.content?.[0]?.text || '';
      let pollData = null;
      try {
        pollData = JSON.parse(text);
      } catch {}

      const status = (pollData?.status || '').toUpperCase();
      if (status === 'COMPLETE' || status === 'COMPLETED' || text.includes('"COMPLETE"')) {
        const url =
          pollData?.outputs?.[0]?.url ||
          pollData?.files?.[0]?.url ||
          (text.match(/https:\/\/media\.app\.layer\.ai\/[^\s"',]+/)?.[0]);

        if (!url) {
          throw new Error(`Forge run completed without media URL: ${text.substring(0, 150)}`);
        }
        return url;
      }

      if (status === 'FAILED' || status === 'CANCELLED') {
        throw new Error(`Forge run ${status}: ${text.substring(0, 150)}`);
      }
    }

    throw new Error(`Timed out waiting for forge run ${inferenceId}`);
  }

  close() {
    if (this.child) {
      try {
        this.child.kill();
      } catch {}
    }
  }
}

/**
 * Resizes an image file to 512x512 PNG using PowerShell System.Drawing
 */
function resizeTo512(filePath) {
  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        RESIZE_SCRIPT_PATH,
        '-Path',
        filePath,
        '-Width',
        '512',
        '-Height',
        '512',
      ],
      { stdio: 'ignore' }
    );
  } catch (err) {
    // If resize script fails, file remains as downloaded 1024x1024
  }
}

/**
 * Main execution
 */
async function main() {
  const { slotFilter, onlySlugs, forceAll, dryRun } = parseArgs();

  if (!fs.existsSync(ASSETS_ITEMS_DIR)) {
    fs.mkdirSync(ASSETS_ITEMS_DIR, { recursive: true });
  }

  let candidates = ITEMS;

  if (slotFilter) {
    candidates = candidates.filter((item) => {
      const s = String(item.slot).toUpperCase();
      if (slotFilter === 'SHIELD' && (item.slug === 'tempered_iron_buckler' || item.slug === 'oni_tower_shield')) {
        return true;
      }
      return s === slotFilter;
    });
  }

  if (onlySlugs && onlySlugs.length > 0) {
    candidates = candidates.filter((item) => onlySlugs.includes(item.slug.toLowerCase()));
  }

  let client = null;
  if (!dryRun) {
    const token = getLayerToken();
    client = new LayerMcpClient(token);
    await client.start();
  }

  // Today's WoW overhaul cutoff: 2026-11-05T08:00:00.000Z
  const wowCutoffTime = new Date('2026-11-05T08:00:00.000Z').getTime();

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const indexLabel = `[${i + 1}/${candidates.length}]`;
    const destPath = path.resolve(ASSETS_ITEMS_DIR, `${item.slug}.png`);
    const fileExists = fs.existsSync(destPath);
    const mtime = fileExists ? fs.statSync(destPath).mtimeMs : 0;

    const isAlreadyWoW =
      COMPLETED_WOW_SLUGS.has(item.slug) ||
      (fileExists && mtime > wowCutoffTime && !forceAll && !onlySlugs);

    if (isAlreadyWoW && !forceAll && !onlySlugs) {
      console.log(`⏭️ ${indexLabel} Skipped ${item.slug}.png (already WoW style)`);
      continue;
    }

    if (dryRun) {
      console.log(`🔍 ${indexLabel} Would regenerate ${item.slug}.png (${item.slot})`);
      continue;
    }

    try {
      const refSetId = getReferenceSetId(item.slot, item.slug);
      const inferenceId = await client.executeForge(item, refSetId);
      const fileUrl = await client.pollForgeRun(inferenceId);

      // Download file
      const imgRes = await fetch(fileUrl);
      if (!imgRes.ok) {
        throw new Error(`HTTP ${imgRes.status} downloading image: ${imgRes.statusText}`);
      }
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(destPath, buffer);

      // Resize to 512x512
      resizeTo512(destPath);

      const finalSizeKb = (fs.statSync(destPath).size / 1024).toFixed(1);
      console.log(`✅ ${indexLabel} Saved ${item.slug}.png (512x512, ${finalSizeKb} KB)`);

      // Gentle 2-second rate-limiting delay between inferences
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`❌ ${indexLabel} Failed ${item.slug}.png: ${err.message}`);
    }
  }

  if (client) {
    client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
