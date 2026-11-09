import { LOOT_CHEST_URIS } from '../../src/assets/v0Vault';

/**
 * Goki 2D Sprite Asset Manifest
 * Supports drop-in PNG/WebP requires or data URIs with high-performance expo-image rendering.
 */

// Scalable vector graphics encoded as clean Data URIs for offline zero-asset bootstrapping
function svgToUri(svgString: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}

export const HERO_SPRITES: Record<string, string> = {
  // Heavy Warrior / Juggernaut: Gold & crimson horned helm and tower shield
  warrior: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#C69A45"/>
          <stop offset="100%" stop-color="#6B5120"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="#1C1B22" stroke="#C69A45" stroke-width="3"/>
      <!-- Horned Helmet -->
      <path d="M35 55 L35 40 Q50 30 65 40 L65 55 Z" fill="#6B7280"/>
      <path d="M32 42 L22 30 Q28 42 34 45 Z" fill="#C69A45"/>
      <path d="M68 42 L78 30 Q72 42 66 45 Z" fill="#C69A45"/>
      <!-- Glowing Visor Slit -->
      <rect x="40" y="44" width="20" height="4" rx="2" fill="#FBBF24"/>
      <!-- Tower Shield Emblem -->
      <path d="M42 58 L58 58 L55 76 L50 82 L45 76 Z" fill="url(#shieldGrad)" stroke="#FBBF24" stroke-width="1.5"/>
    </svg>
  `),

  // Berserker: Dual red battleaxes & berserker rage aura
  berserker: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#241315" stroke="#EF4444" stroke-width="3"/>
      <!-- Skull War Face -->
      <circle cx="50" cy="46" r="18" fill="#7F1D1D"/>
      <polygon points="40,44 48,46 44,48" fill="#F87171"/>
      <polygon points="60,44 52,46 56,48" fill="#F87171"/>
      <!-- Crossed Axes -->
      <line x1="28" y1="28" x2="72" y2="76" stroke="#9CA3AF" stroke-width="5" stroke-linecap="round"/>
      <line x1="72" y1="28" x2="28" y2="76" stroke="#9CA3AF" stroke-width="5" stroke-linecap="round"/>
      <path d="M24 24 Q18 36 30 38 Q36 28 24 24 Z" fill="#EF4444"/>
      <path d="M76 24 Q82 36 70 38 Q64 28 76 24 Z" fill="#EF4444"/>
    </svg>
  `),

  // Vanguard / Paladin: Holy radiant crest & sapphire aegis
  vanguard: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#131F2A" stroke="#38BDF8" stroke-width="3"/>
      <!-- Radiant Cross Aura -->
      <path d="M50 20 L53 45 L78 50 L53 55 L50 80 L47 55 L22 50 L47 45 Z" fill="#38BDF8" fill-opacity="0.3"/>
      <!-- Knight Crown -->
      <path d="M36 42 L42 34 L50 40 L58 34 L64 42 L62 58 L38 58 Z" fill="#CBD5E1" stroke="#38BDF8" stroke-width="2"/>
      <circle cx="50" cy="48" r="4" fill="#38BDF8"/>
    </svg>
  `),

  // Warden: Verdant emerald nature barrier
  warden: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#12241A" stroke="#34D399" stroke-width="3"/>
      <!-- Druidic Leaf / Antlers -->
      <path d="M30 35 Q40 25 45 42 Q35 48 30 35 Z" fill="#10B981"/>
      <path d="M70 35 Q60 25 55 42 Q65 48 70 35 Z" fill="#10B981"/>
      <!-- Runed Tree Heart -->
      <circle cx="50" cy="54" r="16" fill="#065F46" stroke="#34D399" stroke-width="2"/>
      <line x1="50" y1="42" x2="50" y2="66" stroke="#A7F3D0" stroke-width="3"/>
      <path d="M42 50 L50 56 L58 50" fill="none" stroke="#A7F3D0" stroke-width="2.5"/>
    </svg>
  `),

  // Outrider / Rogue: Violet hooded cowl and dual daggers
  outrider: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#1F1528" stroke="#A855F7" stroke-width="3"/>
      <!-- Hood Shadow -->
      <path d="M30 65 Q50 24 70 65 Q50 72 30 65 Z" fill="#581C87"/>
      <!-- Glowing Eyes inside Shadow -->
      <circle cx="43" cy="50" r="3" fill="#E9D5FF"/>
      <circle cx="57" cy="50" r="3" fill="#E9D5FF"/>
      <!-- Winged Arrow Tip -->
      <polygon points="50,22 56,36 44,36" fill="#A855F7"/>
    </svg>
  `),

  // Assassin: Midnight black cloak & poison-tipped crescent blades
  assassin: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#18181B" stroke="#F43F5E" stroke-width="3"/>
      <!-- Assassin Mask -->
      <path d="M34 40 L66 40 L50 75 Z" fill="#27272A" stroke="#F43F5E" stroke-width="2"/>
      <circle cx="44" cy="48" r="3.5" fill="#FB7185"/>
      <circle cx="56" cy="48" r="3.5" fill="#FB7185"/>
      <!-- Poison Dagger -->
      <path d="M48 20 L52 20 L50 36 Z" fill="#10B981"/>
    </svg>
  `),

  // Default fallback adventurer
  default: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#1E1E24" stroke="#F59E0B" stroke-width="3"/>
      <!-- Adventurer Crest -->
      <polygon points="50,25 72,40 64,72 36,72 28,40" fill="#374151" stroke="#F59E0B" stroke-width="2"/>
      <text x="50" y="58" font-size="24" text-anchor="middle" fill="#FBBF24" font-family="sans-serif" font-weight="bold">⚔</text>
    </svg>
  `),
};

export const ENEMY_SPRITES: Record<string, string> = {
  // Boss: Demonic Lord / Void Wyrm
  boss: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#260D12" stroke="#DC2626" stroke-width="3.5"/>
      <!-- Crown Horns -->
      <path d="M22 35 Q30 18 36 28 Q44 14 50 26 Q56 14 64 28 Q70 18 78 35 Z" fill="#991B1B" stroke="#F87171" stroke-width="1.5"/>
      <!-- Menacing Face -->
      <circle cx="38" cy="48" r="5" fill="#FEF08A"/>
      <circle cx="62" cy="48" r="5" fill="#FEF08A"/>
      <polygon points="38,48 42,48 40,51" fill="#7F1D1D"/>
      <polygon points="62,48 66,48 64,51" fill="#7F1D1D"/>
      <!-- Fanged Maw -->
      <path d="M34 64 Q50 78 66 64 Q50 70 34 64 Z" fill="#000000" stroke="#EF4444" stroke-width="1.5"/>
      <polygon points="40,64 43,69 46,64" fill="#FFFFFF"/>
      <polygon points="54,64 57,69 60,64" fill="#FFFFFF"/>
    </svg>
  `),

  // Skeleton Warrior / Undead
  skeleton: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#1C1B1F" stroke="#9CA3AF" stroke-width="3"/>
      <!-- Cranium -->
      <path d="M32 46 Q32 26 50 26 Q68 26 68 46 Q68 56 60 62 L40 62 Q32 56 32 46 Z" fill="#E5E7EB"/>
      <!-- Eye Sockets -->
      <ellipse cx="42" cy="45" rx="5" ry="6" fill="#111827"/>
      <ellipse cx="58" cy="45" rx="5" ry="6" fill="#111827"/>
      <!-- Red eye embers -->
      <circle cx="43" cy="46" r="1.5" fill="#EF4444"/>
      <circle cx="57" cy="46" r="1.5" fill="#EF4444"/>
      <!-- Teeth -->
      <rect x="42" y="64" width="3" height="6" fill="#E5E7EB"/>
      <rect x="47" y="64" width="3" height="6" fill="#E5E7EB"/>
      <rect x="52" y="64" width="3" height="6" fill="#E5E7EB"/>
      <rect x="57" y="64" width="3" height="6" fill="#E5E7EB"/>
    </svg>
  `),

  // Shadow Beast / Bat / Golem
  minion: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#181524" stroke="#8B5CF6" stroke-width="3"/>
      <!-- Winged Silhouette -->
      <path d="M18 42 Q30 32 42 46 Q50 30 58 46 Q70 32 82 42 Q72 64 50 72 Q28 64 18 42 Z" fill="#4C1D95"/>
      <!-- Glowing Eyes -->
      <circle cx="44" cy="50" r="4" fill="#C4B5FD"/>
      <circle cx="56" cy="50" r="4" fill="#C4B5FD"/>
    </svg>
  `),
};

export const LOOT_SPRITES: Record<string, string> = {
  // Illustrated Common Wooden Chest (v0 Vault)
  chest_common: LOOT_CHEST_URIS.COMMON,

  // Illustrated Rare Sapphire Iron Chest (v0 Vault)
  chest_rare: LOOT_CHEST_URIS.RARE,

  // Illustrated Epic Runed Gold Chest (v0 Vault)
  chest_epic: LOOT_CHEST_URIS.EPIC,

  // Illustrated Mythic Crimson Oni Gilded Chest (v0 Vault)
  chest_mythic: LOOT_CHEST_URIS.MYTHIC,

  // PR / Overload Relic Trophy
  relic_trophy: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#241B08" stroke="#F59E0B" stroke-width="3"/>
      <!-- Chalice Trophy -->
      <path d="M32 26 L68 26 L62 56 Q50 68 38 56 Z" fill="#FBBF24" stroke="#F59E0B" stroke-width="2"/>
      <!-- Handles -->
      <path d="M32 32 Q20 40 34 50" fill="none" stroke="#FBBF24" stroke-width="3" stroke-linecap="round"/>
      <path d="M68 32 Q80 40 66 50" fill="none" stroke="#FBBF24" stroke-width="3" stroke-linecap="round"/>
      <!-- Pedestal Base -->
      <rect x="46" y="64" width="8" height="12" fill="#D97706"/>
      <rect x="36" y="76" width="28" height="8" rx="2" fill="#92400E"/>
    </svg>
  `),

  // Crafting Ore
  ore_mythic: svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <polygon points="50,18 78,35 68,78 32,78 22,35" fill="#4B5563" stroke="#9CA3AF" stroke-width="2"/>
      <polygon points="50,18 64,46 50,78 36,46" fill="#A855F7" stroke="#C084FC" stroke-width="1.5"/>
      <polygon points="50,18 78,35 64,46" fill="#7E22CE"/>
      <polygon points="50,18 22,35 36,46" fill="#9333EA"/>
    </svg>
  `),
};

/**
 * Resolves a sprite URI for a hero character given their talent/class orientation or name.
 */
export function getHeroSpriteUri(talentClass?: string, name?: string): string {
  const key = (talentClass || name || '').toLowerCase();
  if (key.includes('juggernaut') || key.includes('warrior') || key.includes('strength')) {
    return HERO_SPRITES.warrior ?? HERO_SPRITES.default ?? '';
  }
  if (key.includes('berserker') || key.includes('rage')) {
    return HERO_SPRITES.berserker ?? HERO_SPRITES.default ?? '';
  }
  if (key.includes('vanguard') || key.includes('paladin') || key.includes('endurance')) {
    return HERO_SPRITES.vanguard ?? HERO_SPRITES.default ?? '';
  }
  if (key.includes('warden') || key.includes('nature') || key.includes('druid')) {
    return HERO_SPRITES.warden ?? HERO_SPRITES.default ?? '';
  }
  if (key.includes('outrider') || key.includes('agility') || key.includes('ranger')) {
    return HERO_SPRITES.outrider ?? HERO_SPRITES.default ?? '';
  }
  if (key.includes('assassin') || key.includes('shadow')) {
    return HERO_SPRITES.assassin ?? HERO_SPRITES.default ?? '';
  }
  return HERO_SPRITES.default ?? '';
}

/**
 * Resolves an enemy sprite given its name or boss status.
 */
export function getEnemySpriteUri(isBoss?: boolean, name?: string): string {
  if (isBoss) return ENEMY_SPRITES.boss ?? '';
  const n = (name || '').toLowerCase();
  if (n.includes('skeleton') || n.includes('undead') || n.includes('bone')) {
    return ENEMY_SPRITES.skeleton ?? ENEMY_SPRITES.minion ?? '';
  }
  return ENEMY_SPRITES.minion ?? '';
}

/**
 * Resolves a loot chest sprite given its tier.
 */
export function getLootChestSpriteUri(tier?: string): string {
  const t = (tier || '').toUpperCase();
  if (t === 'MYTHIC') return LOOT_SPRITES.chest_mythic ?? LOOT_SPRITES.chest_epic ?? '';
  if (t === 'EPIC') return LOOT_SPRITES.chest_epic ?? LOOT_SPRITES.chest_common ?? '';
  if (t === 'RARE') return LOOT_SPRITES.chest_rare ?? LOOT_SPRITES.chest_common ?? '';
  return LOOT_SPRITES.chest_common ?? '';
}

export * from '../../src/assets/characterArtRegistry';
