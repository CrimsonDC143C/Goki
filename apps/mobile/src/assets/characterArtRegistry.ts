import { ImageSourcePropType } from 'react-native';

export interface CharacterAppearancePreset {
  id: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  bustSource: ImageSourcePropType;
  standingSource: ImageSourcePropType;
  accentColor: string;
}

export const CHARACTER_APPEARANCES: readonly CharacterAppearancePreset[] = [
  {
    id: 'oni_warlord',
    title: 'Crimson Oni Warlord',
    shortTitle: 'Oni Warlord',
    subtitle: 'Fierce warlord clad in horned demonplate and primal embers',
    bustSource: require('../../assets/characters/oni_warlord_bust.png'),
    standingSource: require('../../assets/characters/oni_warlord_standing.png'),
    accentColor: '#EF4444',
  },
  {
    id: 'dread_knight',
    title: 'Abyssal Dread-Knight',
    shortTitle: 'Dread-Knight',
    subtitle: 'Scarred champion bearing an ancient zweihander and dark iron',
    bustSource: require('../../assets/characters/dread_knight_bust.png'),
    standingSource: require('../../assets/characters/dread_knight_standing.png'),
    accentColor: '#8B5CF6',
  },
  {
    id: 'oath_sentinel',
    title: 'Radiant Oath-Sentinel',
    shortTitle: 'Oath-Sentinel',
    subtitle: 'Stoic guardian upholding sworn oaths in gleaming silver armor',
    bustSource: require('../../assets/characters/oath_sentinel_bust.png'),
    standingSource: require('../../assets/characters/oath_sentinel_standing.png'),
    accentColor: '#38BDF8',
  },
  {
    id: 'wayfarer',
    title: 'Verdant Wayfarer',
    shortTitle: 'Wayfarer',
    subtitle: 'Rugged frontier scout at one with untamed wilderness',
    bustSource: require('../../assets/characters/wayfarer_bust.png'),
    standingSource: require('../../assets/characters/wayfarer_standing.png'),
    accentColor: '#10B981',
  },
  {
    id: 'northern_reaver',
    title: 'Frostbound Reaver',
    shortTitle: 'Reaver',
    subtitle: 'Primal warrior tempered by the biting rime of glacial peaks',
    bustSource: require('../../assets/characters/northern_reaver_bust.png'),
    standingSource: require('../../assets/characters/northern_reaver_standing.png'),
    accentColor: '#06B6D4',
  },
  {
    id: 'dusk_shinobi',
    title: 'Duskblade Shinobi',
    shortTitle: 'Shinobi',
    subtitle: 'Lethal shadow walker moving silently across the midnight veil',
    bustSource: require('../../assets/characters/dusk_shinobi_bust.png'),
    standingSource: require('../../assets/characters/dusk_shinobi_standing.png'),
    accentColor: '#A855F7',
  },
  {
    id: 'blade_dancer',
    title: 'Tempest Blade-Dancer',
    shortTitle: 'Blade-Dancer',
    subtitle: 'Agile martial master flowing like wind through the dance of steel',
    bustSource: require('../../assets/characters/blade_dancer_bust.png'),
    standingSource: require('../../assets/characters/blade_dancer_standing.png'),
    accentColor: '#F59E0B',
  },
  {
    id: 'bastion_ironclad',
    title: 'Bastion Ironclad',
    shortTitle: 'Ironclad',
    subtitle: 'Colossal fortress of heavy plate and unyielding resolve',
    bustSource: require('../../assets/characters/bastion_ironclad_bust.png'),
    standingSource: require('../../assets/characters/bastion_ironclad_standing.png'),
    accentColor: '#64748B',
  },
  {
    id: 'solar_mystic',
    title: 'Solar Disciple',
    shortTitle: 'Solar Mystic',
    subtitle: 'Devout conduit channeling the incandescent dawn',
    bustSource: require('../../assets/characters/solar_mystic_bust.png'),
    standingSource: require('../../assets/characters/solar_mystic_standing.png'),
    accentColor: '#FBBF24',
  },
  {
    id: 'astral_arcanist',
    title: 'Astral Arcanist',
    shortTitle: 'Arcanist',
    subtitle: 'Scholarly spellweaver weaving celestial leylines and starlight',
    bustSource: require('../../assets/characters/astral_arcanist_bust.png'),
    standingSource: require('../../assets/characters/astral_arcanist_standing.png'),
    accentColor: '#818CF8',
  },
] as const;

export const DEFAULT_APPEARANCE_ID = 'oni_warlord';

export const LEGACY_AVATAR_MAP: Record<string, string> = {
  warrior: 'oni_warlord',
  juggernaut: 'bastion_ironclad',
  berserker: 'northern_reaver',
  vanguard: 'oath_sentinel',
  warden: 'wayfarer',
  outrider: 'blade_dancer',
  assassin: 'dusk_shinobi',
  adventurer_default: 'oni_warlord',
  default: 'oni_warlord',
};

const APPEARANCE_MAP: Record<string, CharacterAppearancePreset> = Object.fromEntries(
  CHARACTER_APPEARANCES.map((preset) => [preset.id, preset])
);

/**
 * Resolves an appearance preset by exact preset ID or legacy sprite key.
 * Always falls back cleanly to DEFAULT_APPEARANCE_ID ('oni_warlord').
 */
export function getCharacterAppearance(idOrLegacyKey?: string | null): CharacterAppearancePreset {
  if (!idOrLegacyKey) {
    return APPEARANCE_MAP[DEFAULT_APPEARANCE_ID]!;
  }
  const normalized = idOrLegacyKey.trim().toLowerCase();
  if (APPEARANCE_MAP[normalized]) {
    return APPEARANCE_MAP[normalized]!;
  }
  const mappedId = LEGACY_AVATAR_MAP[normalized];
  if (mappedId && APPEARANCE_MAP[mappedId]) {
    return APPEARANCE_MAP[mappedId]!;
  }
  return APPEARANCE_MAP[DEFAULT_APPEARANCE_ID]!;
}

/**
 * Resolves the 1:1 square bust portrait image source for circle/avatar medallions.
 */
export function getCharacterBustSource(idOrLegacyKey?: string | null): ImageSourcePropType {
  return getCharacterAppearance(idOrLegacyKey).bustSource;
}

/**
 * Resolves the 2:3 full-body standing pose image source for tall hero cards and paperdoll views.
 */
export function getCharacterStandingSource(idOrLegacyKey?: string | null): ImageSourcePropType {
  return getCharacterAppearance(idOrLegacyKey).standingSource;
}
