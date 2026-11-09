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
    title: 'Juggernaut',
    shortTitle: 'Juggernaut',
    subtitle: '',
    bustSource: require('../../assets/characters/oni_warlord_bust.png'),
    standingSource: require('../../assets/characters/oni_warlord_standing.png'),
    accentColor: '#EF4444',
  },
  {
    id: 'dread_knight',
    title: 'Vanguard',
    shortTitle: 'Vanguard',
    subtitle: '',
    bustSource: require('../../assets/characters/dread_knight_bust.png'),
    standingSource: require('../../assets/characters/dread_knight_standing.png'),
    accentColor: '#8B5CF6',
  },
  {
    id: 'oath_sentinel',
    title: 'Warden',
    shortTitle: 'Warden',
    subtitle: '',
    bustSource: require('../../assets/characters/oath_sentinel_bust.png'),
    standingSource: require('../../assets/characters/oath_sentinel_standing.png'),
    accentColor: '#38BDF8',
  },
  {
    id: 'wayfarer',
    title: 'Outrider',
    shortTitle: 'Outrider',
    subtitle: '',
    bustSource: require('../../assets/characters/wayfarer_bust.png'),
    standingSource: require('../../assets/characters/wayfarer_standing.png'),
    accentColor: '#10B981',
  },
  {
    id: 'northern_reaver',
    title: 'Berserker',
    shortTitle: 'Berserker',
    subtitle: '',
    bustSource: require('../../assets/characters/northern_reaver_bust.png'),
    standingSource: require('../../assets/characters/northern_reaver_standing.png'),
    accentColor: '#06B6D4',
  },
  {
    id: 'dusk_shinobi',
    title: 'Assassin',
    shortTitle: 'Assassin',
    subtitle: '',
    bustSource: require('../../assets/characters/dusk_shinobi_bust.png'),
    standingSource: require('../../assets/characters/dusk_shinobi_standing.png'),
    accentColor: '#A855F7',
  },
  {
    id: 'blade_dancer',
    title: 'Acrobat',
    shortTitle: 'Acrobat',
    subtitle: '',
    bustSource: require('../../assets/characters/blade_dancer_bust.png'),
    standingSource: require('../../assets/characters/blade_dancer_standing.png'),
    accentColor: '#F59E0B',
  },
  {
    id: 'bastion_ironclad',
    title: 'Guardian',
    shortTitle: 'Guardian',
    subtitle: '',
    bustSource: require('../../assets/characters/bastion_ironclad_bust.png'),
    standingSource: require('../../assets/characters/bastion_ironclad_standing.png'),
    accentColor: '#64748B',
  },
  {
    id: 'solar_mystic',
    title: 'Cleric',
    shortTitle: 'Cleric',
    subtitle: '',
    bustSource: require('../../assets/characters/solar_mystic_bust.png'),
    standingSource: require('../../assets/characters/solar_mystic_standing.png'),
    accentColor: '#FBBF24',
  },
  {
    id: 'astral_arcanist',
    title: 'Mage',
    shortTitle: 'Mage',
    subtitle: '',
    bustSource: require('../../assets/characters/astral_arcanist_bust.png'),
    standingSource: require('../../assets/characters/astral_arcanist_standing.png'),
    accentColor: '#818CF8',
  },
] as const;

export const DEFAULT_APPEARANCE_ID = 'oni_warlord';

export const LEGACY_AVATAR_MAP: Record<string, string> = {
  warrior: 'oni_warlord',
  juggernaut: 'oni_warlord',
  vanguard: 'dread_knight',
  warden: 'oath_sentinel',
  outrider: 'wayfarer',
  berserker: 'northern_reaver',
  assassin: 'dusk_shinobi',
  acrobat: 'blade_dancer',
  guardian: 'bastion_ironclad',
  cleric: 'solar_mystic',
  mage: 'astral_arcanist',
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
