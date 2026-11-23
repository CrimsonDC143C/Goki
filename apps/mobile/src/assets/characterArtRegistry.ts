import { ImageSourcePropType } from 'react-native';
import {
  deriveCustomizationFromLegacyAppearance,
  type BaseSilhouetteId,
  type CharacterRace,
} from '@goki/game-engine';
import {
  MORPH_EVOLUTION_OVERLAY_SLOTS,
  RACE_ILLUSTRATION_SLOTS,
  RIG_BODY_PART_ILLUSTRATION_SLOTS,
  getMorphEvolutionOverlay,
  getRaceBustIllustration,
  getRaceStandingIllustration,
  getRigBodyPartIllustration,
} from './rpgArtRegistry';

export {
  MORPH_EVOLUTION_OVERLAY_SLOTS,
  RACE_ILLUSTRATION_SLOTS,
  RIG_BODY_PART_ILLUSTRATION_SLOTS,
  getMorphEvolutionOverlay,
  getRaceBustIllustration,
  getRaceStandingIllustration,
  getRigBodyPartIllustration,
};

export interface RaceAppearancePreset {
  id: string;
  race: CharacterRace;
  silhouette: BaseSilhouetteId;
  title: string;
  shortTitle: string;
  accentColor: string;
}

const RACE_ACCENT_COLORS: Record<CharacterRace, string> = {
  HUMAN: '#38BDF8',
  ONI: '#EF4444',
  KITSUNE: '#A855F7',
};

export function getRaceAccentColor(race: CharacterRace = 'HUMAN'): string {
  return RACE_ACCENT_COLORS[race] ?? RACE_ACCENT_COLORS.HUMAN;
}

/**
 * Canonical Milestone 6 Race × Silhouette appearance cards backed by compiled WebPs
 * in RACE_ILLUSTRATION_SLOTS (replaces retired legacy CHARACTER_APPEARANCES PNGs).
 */
export const RACE_APPEARANCE_PRESETS: readonly RaceAppearancePreset[] = [
  {
    id: 'human_balanced',
    race: 'HUMAN',
    silhouette: 'balanced',
    title: 'Human • Balanced',
    shortTitle: 'Human',
    accentColor: RACE_ACCENT_COLORS.HUMAN,
  },
  {
    id: 'human_lithe',
    race: 'HUMAN',
    silhouette: 'lithe',
    title: 'Human • Lithe',
    shortTitle: 'Human Lithe',
    accentColor: RACE_ACCENT_COLORS.HUMAN,
  },
  {
    id: 'human_broad_shouldered',
    race: 'HUMAN',
    silhouette: 'broad_shouldered',
    title: 'Human • Broad',
    shortTitle: 'Human Broad',
    accentColor: RACE_ACCENT_COLORS.HUMAN,
  },
  {
    id: 'oni_balanced',
    race: 'ONI',
    silhouette: 'balanced',
    title: 'Oni • Balanced',
    shortTitle: 'Oni',
    accentColor: RACE_ACCENT_COLORS.ONI,
  },
  {
    id: 'oni_lithe',
    race: 'ONI',
    silhouette: 'lithe',
    title: 'Oni • Lithe',
    shortTitle: 'Oni Lithe',
    accentColor: RACE_ACCENT_COLORS.ONI,
  },
  {
    id: 'oni_broad_shouldered',
    race: 'ONI',
    silhouette: 'broad_shouldered',
    title: 'Oni • Broad',
    shortTitle: 'Oni Broad',
    accentColor: RACE_ACCENT_COLORS.ONI,
  },
  {
    id: 'kitsune_balanced',
    race: 'KITSUNE',
    silhouette: 'balanced',
    title: 'Kitsune • Balanced',
    shortTitle: 'Kitsune',
    accentColor: RACE_ACCENT_COLORS.KITSUNE,
  },
  {
    id: 'kitsune_lithe',
    race: 'KITSUNE',
    silhouette: 'lithe',
    title: 'Kitsune • Lithe',
    shortTitle: 'Kitsune Lithe',
    accentColor: RACE_ACCENT_COLORS.KITSUNE,
  },
  {
    id: 'kitsune_broad_shouldered',
    race: 'KITSUNE',
    silhouette: 'broad_shouldered',
    title: 'Kitsune • Broad',
    shortTitle: 'Kitsune Broad',
    accentColor: RACE_ACCENT_COLORS.KITSUNE,
  },
] as const;

export function resolveAppearanceToRaceSilhouette(
  idOrLegacyKey?: string | null
): { race: CharacterRace; silhouette: BaseSilhouetteId } {
  const normalized = (idOrLegacyKey ?? '').trim().toLowerCase();
  const presetMatch = RACE_APPEARANCE_PRESETS.find((preset) => preset.id === normalized);
  if (presetMatch) {
    return { race: presetMatch.race, silhouette: presetMatch.silhouette };
  }
  const derived = deriveCustomizationFromLegacyAppearance(idOrLegacyKey);
  return {
    race: derived.race,
    silhouette: derived.config.identity.baseSilhouette,
  };
}

/**
 * Resolves the compiled 1:1 square bust illustration for a hero race and silhouette.
 * Falls back cleanly via legacy appearance ID mapping and finally HUMAN/balanced.
 */
export function getRaceAwareBustSource(
  race?: CharacterRace | null,
  silhouette?: BaseSilhouetteId | null,
  idOrLegacyKey?: string | null
): ImageSourcePropType {
  const fallback = resolveAppearanceToRaceSilhouette(idOrLegacyKey);
  const resolvedRace: CharacterRace = race ?? fallback.race;
  const resolvedSilhouette: BaseSilhouetteId = silhouette ?? fallback.silhouette;
  return (
    getRaceBustIllustration(resolvedRace, resolvedSilhouette) ??
    getRaceBustIllustration(resolvedRace, 'balanced') ??
    getRaceBustIllustration('HUMAN', 'balanced')!
  );
}

/**
 * Resolves the compiled 2:3 standing illustration for a hero race and silhouette.
 * Falls back cleanly via legacy appearance ID mapping and finally HUMAN/balanced.
 */
export function getRaceAwareStandingSource(
  race?: CharacterRace | null,
  silhouette?: BaseSilhouetteId | null,
  idOrLegacyKey?: string | null
): ImageSourcePropType {
  const fallback = resolveAppearanceToRaceSilhouette(idOrLegacyKey);
  const resolvedRace: CharacterRace = race ?? fallback.race;
  const resolvedSilhouette: BaseSilhouetteId = silhouette ?? fallback.silhouette;
  return (
    getRaceStandingIllustration(resolvedRace, resolvedSilhouette) ??
    getRaceStandingIllustration(resolvedRace, 'balanced') ??
    getRaceStandingIllustration('HUMAN', 'balanced')!
  );
}
