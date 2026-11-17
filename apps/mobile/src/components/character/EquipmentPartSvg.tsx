import React from 'react';
import Svg, {
  Circle,
  Ellipse,
  G,
  Path,
  Polygon,
  Rect,
} from 'react-native-svg';
import {
  BASE_EQUIPPABLE_ITEM_BY_SLUG,
  type CharacterRigMetrics,
  type EquipmentLoadoutMap,
  type EquipmentSlot,
} from '@goki/game-engine';
import { INK_STROKE } from './BodyPartSvg';

export type EquipmentVisualVariant =
  // Head
  | 'kabuto_oni'
  | 'iron_helm'
  | 'hood_mask'
  | 'crown_circlet'
  // Chest
  | 'cuirass_plate'
  | 'chainmail'
  | 'brigandine'
  | 'vestments'
  // Legs
  | 'plate_cuisses'
  | 'silk_hakama'
  | 'strider_greaves'
  // Boots
  | 'sabatons'
  | 'tabi_treads'
  | 'stompers'
  // Two-handed weapons
  | 'greatsword'
  | 'kanabo'
  | 'greataxe'
  | 'halberd'
  | 'archstaff'
  | 'longbow'
  // One-handed weapons
  | 'daggers'
  | 'wakizashi'
  | 'warhammer'
  | 'cleaver'
  | 'longsword'
  | 'war_fan'
  // Offhand
  | 'tower_shield'
  | 'buckler'
  | 'censer_relic'
  | 'grimoire'
  // Accessories
  | 'guild_ring'
  | 'oni_charm'
  | 'malakor_signet'
  | 'astral_amulet';

export interface MaterialPalette {
  primary: string;
  secondary: string;
  highlight: string;
  trim: string;
  glow?: string;
}

export interface EquippedVisualProfile {
  slot: EquipmentSlot;
  itemSlug: string;
  baseSlug: string;
  variant: EquipmentVisualVariant;
  handedness: 'ONE_HANDED' | 'TWO_HANDED';
  tierHint: 1 | 2 | 3 | 4 | 5;
  palette: MaterialPalette;
}

const KNOWN_BASE_SLUGS = Object.keys(BASE_EQUIPPABLE_ITEM_BY_SLUG);

function detectTierHint(slugLower: string): 1 | 2 | 3 | 4 | 5 {
  if (slugLower.includes('_t5') || slugLower.includes('mythic') || slugLower.includes('sovereign')) {
    return 5;
  }
  if (slugLower.includes('_t4') || slugLower.includes('epic') || slugLower.includes('tempered')) {
    return 4;
  }
  if (slugLower.includes('_t3') || slugLower.includes('rare')) {
    return 3;
  }
  if (slugLower.includes('_t2') || slugLower.includes('uncommon')) {
    return 2;
  }
  return 1;
}

function buildMaterialPalette(
  slugLower: string,
  variant: EquipmentVisualVariant,
  tier: 1 | 2 | 3 | 4 | 5
): MaterialPalette {
  const tierTrim =
    tier >= 5
      ? '#F59E0B'
      : tier === 4
      ? '#A855F7'
      : tier === 3
      ? '#38BDF8'
      : tier === 2
      ? '#34D399'
      : '#94A3B8';

  if (slugLower.includes('crimson') || slugLower.includes('oni') || slugLower.includes('oxblood') || slugLower.includes('vermilion')) {
    return {
      primary: '#7F1D1D',
      secondary: '#450A0A',
      highlight: '#B91C1C',
      trim: tier >= 4 ? '#F59E0B' : '#D97706',
      glow: '#EF4444',
    };
  }
  if (slugLower.includes('solar') || slugLower.includes('sunforged') || slugLower.includes('crown') || slugLower.includes('halo')) {
    return {
      primary: '#B45309',
      secondary: '#78350F',
      highlight: '#F59E0B',
      trim: '#FDE68A',
      glow: '#FBBF24',
    };
  }
  if (slugLower.includes('astral') || slugLower.includes('void') || slugLower.includes('malakor')) {
    return {
      primary: '#3B285C',
      secondary: '#1E1533',
      highlight: '#7C3AED',
      trim: '#C4B5FD',
      glow: '#A855F7',
    };
  }
  if (slugLower.includes('glacial') || slugLower.includes('frost')) {
    return {
      primary: '#2C4A63',
      secondary: '#17293A',
      highlight: '#60A5FA',
      trim: '#BAE6FD',
      glow: '#38BDF8',
    };
  }
  if (slugLower.includes('shadow') || slugLower.includes('dusk') || slugLower.includes('phantom') || slugLower.includes('ebony') || slugLower.includes('dread')) {
    return {
      primary: '#242936',
      secondary: '#13161F',
      highlight: '#475569',
      trim: tier >= 4 ? tierTrim : '#94A3B8',
      glow: tier >= 4 ? tierTrim : '#64748B',
    };
  }
  if (slugLower.includes('wayfarer') || slugLower.includes('brigandine') || slugLower.includes('strider') || slugLower.includes('wolf')) {
    return {
      primary: '#5C3A24',
      secondary: '#382214',
      highlight: '#855738',
      trim: '#B4884E',
      glow: tier >= 4 ? tierTrim : undefined,
    };
  }
  if (variant === 'archstaff' || variant === 'vestments' || variant === 'silk_hakama') {
    return {
      primary: '#2B3554',
      secondary: '#192036',
      highlight: '#4C5E91',
      trim: '#D4AF37',
      glow: '#60A5FA',
    };
  }
  if (variant === 'guild_ring') {
    return {
      primary: '#B87333',
      secondary: '#7C471A',
      highlight: '#E5A363',
      trim: '#FDE68A',
      glow: '#F59E0B',
    };
  }

  // Default tempered iron / steel
  return {
    primary: '#5A6475',
    secondary: '#323845',
    highlight: '#94A3B8',
    trim: tier >= 3 ? tierTrim : '#CBD5E1',
    glow: tier >= 4 ? tierTrim : undefined,
  };
}

function mapBaseSlugToVariant(
  slot: EquipmentSlot,
  slugLower: string
): { variant: EquipmentVisualVariant; handedness: 'ONE_HANDED' | 'TWO_HANDED' } {
  // Weapons (Two-handed)
  if (slugLower.includes('greatsword')) return { variant: 'greatsword', handedness: 'TWO_HANDED' };
  if (slugLower.includes('kanabo')) return { variant: 'kanabo', handedness: 'TWO_HANDED' };
  if (slugLower.includes('greataxe')) return { variant: 'greataxe', handedness: 'TWO_HANDED' };
  if (slugLower.includes('halberd')) return { variant: 'halberd', handedness: 'TWO_HANDED' };
  if (slugLower.includes('archstaff') || slugLower.includes('warstaff') || slugLower.includes('staff')) {
    return { variant: 'archstaff', handedness: 'TWO_HANDED' };
  }
  if (slugLower.includes('longbow') || slugLower.includes('bow')) {
    return { variant: 'longbow', handedness: 'TWO_HANDED' };
  }

  // Weapons (One-handed)
  if (slugLower.includes('dagger')) return { variant: 'daggers', handedness: 'ONE_HANDED' };
  if (slugLower.includes('wakizashi') || slugLower.includes('katana')) {
    return { variant: 'wakizashi', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('warhammer') || slugLower.includes('mace')) {
    return { variant: 'warhammer', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('cleaver') || slugLower.includes('hatchet') || slugLower.includes('axe')) {
    return { variant: 'cleaver', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('longsword') || slugLower.includes('broadsword') || slugLower.includes('sword')) {
    return { variant: 'longsword', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('fan')) return { variant: 'war_fan', handedness: 'ONE_HANDED' };

  // Offhand
  if (slugLower.includes('tower_shield')) return { variant: 'tower_shield', handedness: 'ONE_HANDED' };
  if (slugLower.includes('buckler') || slugLower.includes('shield')) {
    return { variant: 'buckler', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('censer') || slugLower.includes('lantern') || slugLower.includes('relic')) {
    return { variant: 'censer_relic', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('grimoire') || slugLower.includes('codex') || slugLower.includes('tome')) {
    return { variant: 'grimoire', handedness: 'ONE_HANDED' };
  }

  // Head
  if (slugLower.includes('kabuto') || slugLower.includes('horned_oni')) {
    return { variant: 'kabuto_oni', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('crown') || slugLower.includes('halo') || slugLower.includes('circlet')) {
    return { variant: 'crown_circlet', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('hood') || slugLower.includes('menpo') || slugLower.includes('mask')) {
    return { variant: 'hood_mask', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('helm')) return { variant: 'iron_helm', handedness: 'ONE_HANDED' };

  // Chest
  if (slugLower.includes('cuirass') || slugLower.includes('plate')) {
    return { variant: 'cuirass_plate', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('chainmail') || slugLower.includes('mail')) {
    return { variant: 'chainmail', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('brigandine')) return { variant: 'brigandine', handedness: 'ONE_HANDED' };
  if (slugLower.includes('vestment') || slugLower.includes('robe') || slugLower.includes('gi')) {
    return { variant: 'vestments', handedness: 'ONE_HANDED' };
  }

  // Legs
  if (slugLower.includes('cuisses') || slugLower.includes('tasset')) {
    return { variant: 'plate_cuisses', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('leggings') || slugLower.includes('hakama') || slugLower.includes('silk')) {
    return { variant: 'silk_hakama', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('greaves') || slugLower.includes('warkilt')) {
    return { variant: 'strider_greaves', handedness: 'ONE_HANDED' };
  }

  // Boots
  if (slugLower.includes('sabaton')) return { variant: 'sabatons', handedness: 'ONE_HANDED' };
  if (slugLower.includes('tread') || slugLower.includes('tabi')) {
    return { variant: 'tabi_treads', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('stomper') || slugLower.includes('boot')) {
    return { variant: 'stompers', handedness: 'ONE_HANDED' };
  }

  // Accessories
  if (slugLower.includes('charm')) return { variant: 'oni_charm', handedness: 'ONE_HANDED' };
  if (slugLower.includes('signet')) return { variant: 'malakor_signet', handedness: 'ONE_HANDED' };
  if (slugLower.includes('amulet') || slugLower.includes('pendant')) {
    return { variant: 'astral_amulet', handedness: 'ONE_HANDED' };
  }
  if (slugLower.includes('ring')) return { variant: 'guild_ring', handedness: 'ONE_HANDED' };

  // Slot defaults
  switch (slot) {
    case 'head':
      return { variant: 'iron_helm', handedness: 'ONE_HANDED' };
    case 'chest':
      return { variant: 'cuirass_plate', handedness: 'ONE_HANDED' };
    case 'legs':
      return { variant: 'strider_greaves', handedness: 'ONE_HANDED' };
    case 'boots':
      return { variant: 'sabatons', handedness: 'ONE_HANDED' };
    case 'mainHand':
      return { variant: 'longsword', handedness: 'ONE_HANDED' };
    case 'offHand':
      return { variant: 'buckler', handedness: 'ONE_HANDED' };
    case 'accessory1':
      return { variant: 'guild_ring', handedness: 'ONE_HANDED' };
    case 'accessory2':
      return { variant: 'astral_amulet', handedness: 'ONE_HANDED' };
  }
}

export function resolveEquippedVisualProfile(
  slot: EquipmentSlot,
  itemSlug?: string | null
): EquippedVisualProfile | null {
  if (!itemSlug || typeof itemSlug !== 'string') {
    return null;
  }
  const trimmed = itemSlug.trim();
  if (!trimmed) {
    return null;
  }

  const slugLower = trimmed.toLowerCase();
  const exactBase = BASE_EQUIPPABLE_ITEM_BY_SLUG[slugLower];
  const matchedBaseSlug =
    exactBase?.baseSlug ??
    KNOWN_BASE_SLUGS.find((candidate) => slugLower.includes(candidate)) ??
    slugLower;
  const resolvedBaseDef = BASE_EQUIPPABLE_ITEM_BY_SLUG[matchedBaseSlug];

  const mapped = mapBaseSlugToVariant(slot, slugLower);
  const handedness = resolvedBaseDef?.handedness ?? mapped.handedness;
  const tierHint = detectTierHint(slugLower);
  const palette = buildMaterialPalette(slugLower, mapped.variant, tierHint);

  return {
    slot,
    itemSlug: trimmed,
    baseSlug: matchedBaseSlug,
    variant: mapped.variant,
    handedness,
    tierHint,
    palette,
  };
}

export function isWeaponVisualVariant(variant: EquipmentVisualVariant): boolean {
  return (
    variant === 'greatsword' ||
    variant === 'kanabo' ||
    variant === 'greataxe' ||
    variant === 'halberd' ||
    variant === 'archstaff' ||
    variant === 'longbow' ||
    variant === 'daggers' ||
    variant === 'wakizashi' ||
    variant === 'warhammer' ||
    variant === 'cleaver' ||
    variant === 'longsword' ||
    variant === 'war_fan'
  );
}

// ============================================================================
// 1. Head Armor (anchored to head bone (0, 0))
// ============================================================================

export interface HeadArmorSvgProps {
  profile: EquippedVisualProfile;
  metrics: CharacterRigMetrics;
}

export const HeadArmorSvg: React.FC<HeadArmorSvgProps> = ({ profile, metrics }) => {
  const { width: w, height: h } = metrics.head;
  const halfW = w / 2;
  const { palette, variant } = profile;

  const svgW = Math.ceil(w * 3.1);
  const svgH = Math.ceil(h * 2.4);
  const minX = -svgW / 2;
  const minY = -h * 2.0;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {variant === 'crown_circlet' && (
        <G>
          {/* Radiant circlet / wyrm crown */}
          <Path
            d={`M ${-halfW * 0.96} ${-h * 0.72} L ${-halfW * 0.72} ${-h * 1.12} L ${-halfW * 0.28} ${-h * 0.88} L 0 ${-h * 1.24} L ${halfW * 0.34} ${-h * 0.88} L ${halfW * 0.78} ${-h * 1.14} L ${halfW * 0.96} ${-h * 0.7} L ${halfW * 0.86} ${-h * 0.58} Q 0 ${-h * 0.68} ${-halfW * 0.88} ${-h * 0.58} Z`}
            fill={palette.primary}
            stroke={INK_STROKE}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <Circle cx={0} cy={-h * 0.84} r={2.3} fill={palette.glow ?? palette.trim} stroke={INK_STROKE} strokeWidth={0.8} />
        </G>
      )}

      {variant === 'hood_mask' && (
        <G>
          {/* Assassin cowl / menpo lower face guard */}
          <Path
            d={`M ${-halfW * 1.18} ${-h * 0.58} C ${-halfW * 1.1} ${-h * 1.16}, ${halfW * 0.95} ${-h * 1.16}, ${halfW * 0.98} ${-h * 0.64} Q ${halfW * 0.3} ${-h * 0.76} ${-halfW * 0.72} ${-h * 0.54} L ${-halfW * 0.98} ${-h * 0.05} Z`}
            fill={palette.primary}
            stroke={INK_STROKE}
            strokeWidth={1.35}
          />
          <Path
            d={`M ${-halfW * 0.82} ${-h * 0.32} Q ${halfW * 0.25} ${-h * 0.28} ${halfW * 0.9} ${-h * 0.26} Q ${halfW * 0.68} 4 ${halfW * 0.12} 4 Q ${-halfW * 0.52} 3 ${-halfW * 0.82} ${-h * 0.32} Z`}
            fill={palette.secondary}
            stroke={INK_STROKE}
            strokeWidth={1.2}
          />
          <Path
            d={`M ${-halfW * 0.28} ${-h * 0.2} L ${halfW * 0.58} ${-h * 0.14}`}
            stroke={palette.trim}
            strokeWidth={1}
          />
        </G>
      )}

      {variant === 'kabuto_oni' && (
        <G>
          {/* Kabuto bowl & neck shikoro flare */}
          <Path
            d={`M ${-halfW * 1.28} ${-h * 0.2} L ${-halfW * 1.02} ${-h * 0.68} C ${-halfW * 0.95} ${-h * 1.16}, ${halfW * 0.9} ${-h * 1.16}, ${halfW * 0.98} ${-h * 0.68} Q ${halfW * 0.1} ${-h * 0.74} ${-halfW * 0.75} ${-h * 0.54} L ${-halfW * 0.88} ${-h * 0.14} Z`}
            fill={palette.primary}
            stroke={INK_STROKE}
            strokeWidth={1.35}
            strokeLinejoin="round"
          />
          {/* Crescent maedate crest */}
          <Path
            d={`M ${halfW * 0.05} ${-h * 0.8} L ${-halfW * 0.35} ${-h * 1.32} L ${halfW * 0.12} ${-h * 0.96} L ${halfW * 0.58} ${-h * 1.32} L ${halfW * 0.26} ${-h * 0.8} Z`}
            fill={palette.trim}
            stroke={INK_STROKE}
            strokeWidth={1.1}
          />
          {/* Oni jaw menpo */}
          <Path
            d={`M ${-halfW * 0.72} ${-h * 0.3} Q ${halfW * 0.2} ${-h * 0.22} ${halfW * 0.88} ${-h * 0.25} Q ${halfW * 0.65} 4 ${halfW * 0.12} 4 Q ${-halfW * 0.45} 3 ${-halfW * 0.72} ${-h * 0.3} Z`}
            fill={palette.secondary}
            stroke={INK_STROKE}
            strokeWidth={1.2}
          />
        </G>
      )}

      {(variant === 'iron_helm' ||
        (variant !== 'crown_circlet' && variant !== 'hood_mask' && variant !== 'kabuto_oni')) && (
        <G>
          {/* Ashen Iron Helm dome + cheek guards */}
          <Path
            d={`M ${-halfW * 1.05} ${-h * 0.22} L ${-halfW * 0.98} ${-h * 0.68} C ${-halfW * 0.96} ${-h * 1.16}, ${halfW * 0.94} ${-h * 1.16}, ${halfW * 0.96} ${-h * 0.64} L ${halfW * 0.64} ${-h * 0.58} L ${halfW * 0.36} ${-h * 0.64} L ${halfW * 0.36} ${-h * 0.34} L ${halfW * 0.18} ${-h * 0.34} L ${halfW * 0.18} ${-h * 0.62} L ${-halfW * 0.55} ${-h * 0.54} L ${-halfW * 0.58} ${-h * 0.12} Z`}
            fill={palette.primary}
            stroke={INK_STROKE}
            strokeWidth={1.35}
            strokeLinejoin="round"
          />
          <Path
            d={`M ${-halfW * 0.2} ${-h * 1.04} L ${halfW * 0.45} ${-h * 0.92}`}
            stroke={palette.highlight}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </G>
      )}
    </Svg>
  );
};

// ============================================================================
// 2. Chest Armor & Shoulder Pauldrons (morphed from metrics.torso & upperArm)
// ============================================================================

export interface ChestArmorSvgProps {
  profile: EquippedVisualProfile;
  metrics: CharacterRigMetrics;
}

export const ChestArmorSvg: React.FC<ChestArmorSvgProps> = ({ profile, metrics }) => {
  const { height: h, shoulderSpan, chestWidth, waistSpan } = metrics.torso;
  const halfShoulder = shoulderSpan / 2 + 1.5;
  const halfChest = chestWidth / 2 + 1.5;
  const halfWaist = waistSpan / 2 + 1.2;
  const { palette, variant } = profile;

  const svgW = Math.ceil(Math.max(shoulderSpan, chestWidth) + 30);
  const svgH = Math.ceil(h + 24);
  const minX = -svgW / 2;
  const minY = -(h + 10);

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {/* Main Torso Armor Shell derived directly from torso metrics */}
      <Path
        d={`M ${-halfWaist} 3
            L ${-halfChest} ${-h * 0.56}
            L ${-halfShoulder * 0.92} ${-h + 1}
            L ${-halfShoulder * 0.34} ${-h + 3}
            Q 0 ${-h * 0.84} ${halfShoulder * 0.34} ${-h + 3}
            L ${halfShoulder * 0.92} ${-h + 1}
            L ${halfChest} ${-h * 0.56}
            L ${halfWaist} 3
            Q 0 8 ${-halfWaist} 3 Z`}
        fill={palette.primary}
        stroke={INK_STROKE}
        strokeWidth={1.45}
        strokeLinejoin="round"
      />

      {/* Left shade panel */}
      <Path
        d={`M ${-halfWaist + 1} 2 L ${-halfChest + 1} ${-h * 0.56} L ${-halfShoulder * 0.86} ${-h + 2} L ${-halfShoulder * 0.32} ${-h + 5} L ${-halfChest * 0.36} ${-h * 0.54} L ${-halfWaist * 0.38} 3 Z`}
        fill={palette.secondary}
        fillOpacity={0.72}
      />

      {variant === 'cuirass_plate' && (
        <G>
          {/* Chest breastplate ridge & gorget trim */}
          <Path
            d={`M ${-halfChest * 0.72} ${-h * 0.65} L 1 ${-h * 0.54} L ${halfChest * 0.74} ${-h * 0.65}`}
            fill="none"
            stroke={palette.highlight}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <Path
            d={`M ${-halfShoulder * 0.42} ${-h + 3} Q 0 ${-h * 0.76} ${halfShoulder * 0.42} ${-h + 3}`}
            fill="none"
            stroke={palette.trim}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Path
            d={`M ${-halfWaist * 0.85} ${-h * 0.24} Q 0 ${-h * 0.18} ${halfWaist * 0.85} ${-h * 0.24}`}
            fill="none"
            stroke={palette.trim}
            strokeWidth={1.3}
          />
        </G>
      )}

      {variant === 'chainmail' && (
        <G>
          {/* Maille texture links & surcoat cross-strap */}
          <Path
            d={`M ${-halfChest * 0.62} ${-h * 0.74} L ${halfChest * 0.62} ${-h * 0.74} M ${-halfChest * 0.68} ${-h * 0.54} L ${halfChest * 0.68} ${-h * 0.54} M ${-halfWaist * 0.72} ${-h * 0.34} L ${halfWaist * 0.72} ${-h * 0.34}`}
            stroke={palette.secondary}
            strokeWidth={1.2}
            strokeDasharray="3 2.5"
          />
          <Path
            d={`M ${-halfShoulder * 0.58} ${-h + 3} L ${halfWaist * 0.88} -2`}
            stroke={palette.trim}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </G>
      )}

      {variant === 'brigandine' && (
        <G>
          {/* Leather brigandine studded vertical plates */}
          <Path
            d={`M ${-halfChest * 0.4} ${-h * 0.84} L ${-halfWaist * 0.42} -4 M ${halfChest * 0.42} ${-h * 0.84} L ${halfWaist * 0.44} -4`}
            stroke={palette.secondary}
            strokeWidth={1.3}
          />
          <Circle cx={-halfChest * 0.22} cy={-h * 0.65} r={1.2} fill={palette.trim} />
          <Circle cx={halfChest * 0.26} cy={-h * 0.65} r={1.2} fill={palette.trim} />
          <Circle cx={-halfWaist * 0.24} cy={-h * 0.36} r={1.2} fill={palette.trim} />
          <Circle cx={halfWaist * 0.26} cy={-h * 0.36} r={1.2} fill={palette.trim} />
        </G>
      )}

      {variant === 'vestments' && (
        <G>
          {/* Martial gi / mystic vestments diagonal wrap & lower skirt hem */}
          <Path
            d={`M ${-halfShoulder * 0.5} ${-h + 3} L ${halfChest * 0.38} ${-h * 0.42} L ${-halfWaist * 0.36} 3`}
            fill="none"
            stroke={palette.trim}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d={`M ${-halfWaist * 1.06} 1 L ${-halfWaist * 1.24} 13 Q 0 17 ${halfWaist * 1.24} 13 L ${halfWaist * 1.06} 1 Z`}
            fill={palette.secondary}
            stroke={INK_STROKE}
            strokeWidth={1.3}
          />
        </G>
      )}

      {/* Armored Waist Belt */}
      <Rect
        x={-halfWaist - 1.5}
        y={-5}
        width={halfWaist * 2 + 3}
        height={7}
        rx={2}
        fill={palette.secondary}
        stroke={INK_STROKE}
        strokeWidth={1.2}
      />
      <Rect
        x={-3.5}
        y={-5.8}
        width={8}
        height={8.6}
        rx={1.5}
        fill={palette.trim}
        stroke={INK_STROKE}
        strokeWidth={1.1}
      />
    </Svg>
  );
};

export interface ShoulderPauldronSvgProps {
  profile: EquippedVisualProfile;
  metrics: CharacterRigMetrics;
  isFront?: boolean;
}

export const ShoulderPauldronSvg: React.FC<ShoulderPauldronSvgProps> = ({
  profile,
  metrics,
  isFront = true,
}) => {
  const w = metrics.upperArm.width;
  const halfW = w / 2;
  const { palette, variant } = profile;

  const svgW = Math.ceil(w * 3 + 16);
  const svgH = Math.ceil(w * 2.6 + 16);
  const minX = -svgW / 2;
  const minY = -svgH * 0.46;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {variant === 'cuirass_plate' ? (
        <G>
          {/* Layered spiked vanguard pauldron */}
          <Path
            d={`M ${-halfW * 1.4} 3 C ${-halfW * 1.55} ${-halfW * 1.3}, ${halfW * 1.35} ${-halfW * 1.45}, ${halfW * 1.45} 4 Q 0 9 ${-halfW * 1.4} 3 Z`}
            fill={isFront ? palette.primary : palette.secondary}
            stroke={INK_STROKE}
            strokeWidth={1.3}
          />
          <Polygon
            points={`${-halfW * 0.9},${-halfW * 0.7} ${-halfW * 1.5},${-halfW * 1.65} ${-halfW * 0.25},${-halfW * 1.05}`}
            fill={palette.trim}
            stroke={INK_STROKE}
            strokeWidth={1.05}
          />
        </G>
      ) : (
        <G>
          <Path
            d={`M ${-halfW * 1.3} 3 C ${-halfW * 1.35} ${-halfW * 1.15}, ${halfW * 1.35} ${-halfW * 1.15}, ${halfW * 1.3} 3 Q 0 7.5 ${-halfW * 1.3} 3 Z`}
            fill={isFront ? palette.primary : palette.secondary}
            stroke={INK_STROKE}
            strokeWidth={1.25}
          />
          <Path
            d={`M ${-halfW * 1.05} 1 Q 0 5.2 ${halfW * 1.05} 1`}
            fill="none"
            stroke={palette.trim}
            strokeWidth={1.4}
          />
        </G>
      )}
    </Svg>
  );
};

// ============================================================================
// 3. Legs Armor (anchored to thigh bone (0, 0) -> (0, thigh.length))
// ============================================================================

export interface LegsArmorSvgProps {
  profile: EquippedVisualProfile;
  metrics: CharacterRigMetrics;
  isFront?: boolean;
}

export const LegsArmorSvg: React.FC<LegsArmorSvgProps> = ({
  profile,
  metrics,
  isFront = true,
}) => {
  const { length: len, width: w, quadBulk } = metrics.thigh;
  const halfW = w / 2 + 1.2;
  const bulge = halfW + quadBulk * 2.2;
  const { palette, variant } = profile;

  const svgW = Math.ceil(w * 2.8 + 16);
  const svgH = Math.ceil(len + 18);
  const minX = -svgW / 2;
  const minY = -9;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {/* Main Thigh Coverage */}
      <Path
        d={`M ${-halfW * 1.02} 0
            Q 0 ${-halfW * 0.6} ${halfW * 1.02} 0
            C ${bulge * 1.08} ${len * 0.36}, ${halfW * 0.96} ${len * 0.78}, ${halfW * 0.74} ${len - 1}
            Q 0 ${len + 2.5} ${-halfW * 0.74} ${len - 1}
            C ${-halfW * 0.96} ${len * 0.75}, ${-halfW * 1.08} ${len * 0.32}, ${-halfW * 1.02} 0 Z`}
        fill={isFront ? palette.primary : palette.secondary}
        stroke={INK_STROKE}
        strokeWidth={1.35}
        strokeLinejoin="round"
      />

      {variant === 'plate_cuisses' && (
        <G>
          {/* Segmented hip tasset + knee poleyn */}
          <Path
            d={`M ${-halfW * 1.15} 1 L ${halfW * 1.1} 1 L ${halfW * 0.95} ${len * 0.42} L ${-halfW * 1.1} ${len * 0.48} Z`}
            fill={palette.secondary}
            stroke={INK_STROKE}
            strokeWidth={1.2}
          />
          <Path
            d={`M ${-halfW * 0.9} ${len * 0.24} L ${halfW * 0.9} ${len * 0.22}`}
            stroke={palette.trim}
            strokeWidth={1.4}
          />
          <Ellipse
            cx={halfW * 0.18}
            cy={len - 1}
            rx={halfW * 0.75}
            ry={4.5}
            fill={palette.highlight}
            stroke={INK_STROKE}
            strokeWidth={1.2}
          />
        </G>
      )}

      {variant === 'silk_hakama' && (
        <Path
          d={`M ${-halfW * 1.12} 0 L ${halfW * 1.15} 0 L ${halfW * 1.25} ${len * 0.9} Q 0 ${len + 3} ${-halfW * 1.2} ${len * 0.9} Z`}
          fill={isFront ? palette.primary : palette.secondary}
          stroke={INK_STROKE}
          strokeWidth={1.3}
        />
      )}

      {variant === 'strider_greaves' && (
        <Path
          d={`M ${-halfW * 0.85} ${len * 0.48} L ${halfW * 0.85} ${len * 0.42} M ${-halfW * 0.78} ${len * 0.72} L ${halfW * 0.78} ${len * 0.66}`}
          stroke={palette.trim}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
};

// ============================================================================
// 4. Boots Armor (anchored to shin bone (0, 0) -> (0, shin.length))
// ============================================================================

export interface BootsArmorSvgProps {
  profile: EquippedVisualProfile;
  metrics: CharacterRigMetrics;
  isFront?: boolean;
}

export const BootsArmorSvg: React.FC<BootsArmorSvgProps> = ({
  profile,
  metrics,
  isFront = true,
}) => {
  const { length: len, width: w } = metrics.shin;
  const halfW = w / 2 + 1;
  const ankleHalf = halfW * 0.72;
  const { palette, variant } = profile;

  const svgW = Math.ceil(w * 3.1 + 22);
  const svgH = Math.ceil(len + 18);
  const minX = -svgW * 0.42;
  const minY = -8;

  const bootTopY = len * 0.24;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {/* Greave / Boot Shaft */}
      <Path
        d={`M ${-halfW * 0.92} ${bootTopY}
            Q ${halfW * 0.15} ${bootTopY - 4} ${halfW * 0.95} ${bootTopY + 1}
            L ${ankleHalf * 1.05} ${len - 5}
            L ${ankleHalf * 2.85} ${len - 1.5}
            Q ${ankleHalf * 3.05} ${len + 1.5} ${ankleHalf * 2.4} ${len + 1.5}
            L ${-ankleHalf * 1.35} ${len + 1.5}
            L ${-ankleHalf * 1.25} ${len - 6}
            Z`}
        fill={isFront ? palette.primary : palette.secondary}
        stroke={INK_STROKE}
        strokeWidth={1.35}
        strokeLinejoin="round"
      />

      {/* Knee/Cuff Guard Trim */}
      <Path
        d={`M ${-halfW * 0.95} ${bootTopY} Q ${halfW * 0.1} ${bootTopY - 4} ${halfW * 0.96} ${bootTopY + 1}`}
        fill="none"
        stroke={palette.trim}
        strokeWidth={1.9}
        strokeLinecap="round"
      />

      {variant === 'sabatons' && (
        <Path
          d={`M ${-ankleHalf} ${len - 6} L ${ankleHalf * 1.1} ${len - 6} M ${ankleHalf * 0.8} ${len - 3.5} L ${ankleHalf * 2.4} ${len - 1.5}`}
          stroke={palette.highlight}
          strokeWidth={1.25}
          strokeLinecap="round"
        />
      )}

      {variant === 'tabi_treads' && (
        <Path
          d={`M ${-ankleHalf} ${len * 0.52} L ${ankleHalf} ${len * 0.48} M ${-ankleHalf} ${len * 0.72} L ${ankleHalf} ${len * 0.68}`}
          stroke={palette.trim}
          strokeWidth={1.35}
          strokeLinecap="round"
        />
      )}

      {variant === 'stompers' && (
        <Rect
          x={-ankleHalf * 1.35}
          y={len - 1.5}
          width={ankleHalf * 4.2}
          height={3.2}
          rx={1}
          fill={palette.secondary}
          stroke={INK_STROKE}
          strokeWidth={1}
        />
      )}
    </Svg>
  );
};

// ============================================================================
// 5. Weapons (mainHand & 1H offHand, hilt anchored at (0, 0) hand grip)
// ============================================================================

export interface WeaponPartSvgProps {
  profile: EquippedVisualProfile;
  metrics: CharacterRigMetrics;
}

export const WeaponPartSvg: React.FC<WeaponPartSvgProps> = ({ profile, metrics }) => {
  const s = metrics.statureScale;
  const { variant, palette } = profile;

  // Grip is at (0, 0). Weapon extends forward-right (+X) & slightly up (-Y) so
  // forearm rotations place it naturally across the hero's front arc.
  const svgW = Math.ceil(118 * s);
  const svgH = Math.ceil(90 * s);
  const minX = -34 * s;
  const minY = -56 * s;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      <G transform={`scale(${s}) rotate(-22)`}>
        {variant === 'greatsword' && (
          <G>
            {/* Pommel & grip */}
            <Path d="M -18 0 L 4 0" stroke="#3F2E21" strokeWidth={4.2} strokeLinecap="round" />
            <Circle cx={-19} cy={0} r={3.4} fill={palette.trim} stroke={INK_STROKE} strokeWidth={1.1} />
            {/* Heavy crossguard */}
            <Path d="M 3 -9 L 8 -9 L 8 9 L 3 9 Z" fill={palette.trim} stroke={INK_STROKE} strokeWidth={1.2} />
            {/* Massive greatsword blade */}
            <Path
              d="M 8 -5.2 L 66 -4.5 L 78 0 L 66 4.5 L 8 5.2 Z"
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.35}
              strokeLinejoin="round"
            />
            <Path d="M 10 -1.6 L 73 0 L 10 1.6 Z" fill={palette.highlight} fillOpacity={0.78} />
          </G>
        )}

        {variant === 'kanabo' && (
          <G>
            <Path d="M -14 0 L 8 0" stroke="#4A2518" strokeWidth={4} strokeLinecap="round" />
            <Path
              d="M 8 -3.5 L 68 -7.5 Q 74 0 68 7.5 L 8 3.5 Z"
              fill={palette.secondary}
              stroke={INK_STROKE}
              strokeWidth={1.4}
            />
            {/* Iron studs */}
            <Circle cx={22} cy={-4.5} r={1.8} fill={palette.highlight} stroke={INK_STROKE} strokeWidth={0.7} />
            <Circle cx={36} cy={-5.5} r={2} fill={palette.highlight} stroke={INK_STROKE} strokeWidth={0.7} />
            <Circle cx={52} cy={-6.4} r={2.2} fill={palette.highlight} stroke={INK_STROKE} strokeWidth={0.7} />
            <Circle cx={28} cy={4.8} r={1.8} fill={palette.highlight} stroke={INK_STROKE} strokeWidth={0.7} />
            <Circle cx={45} cy={5.8} r={2} fill={palette.highlight} stroke={INK_STROKE} strokeWidth={0.7} />
            <Circle cx={60} cy={6.2} r={2.1} fill={palette.highlight} stroke={INK_STROKE} strokeWidth={0.7} />
          </G>
        )}

        {variant === 'greataxe' && (
          <G>
            <Path d="M -18 0 L 64 0" stroke="#472E1E" strokeWidth={4.2} strokeLinecap="round" />
            <Path
              d="M 42 -3 L 58 -22 C 70 -14, 72 14, 58 22 L 42 3 Z"
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            <Path d="M 57 -18 C 66 -10, 66 10, 57 18" fill="none" stroke={palette.highlight} strokeWidth={2.2} />
          </G>
        )}

        {variant === 'halberd' && (
          <G>
            <Path d="M -24 0 L 68 0" stroke="#3E2A1E" strokeWidth={3.6} strokeLinecap="round" />
            <Path
              d="M 52 0 L 62 -16 C 68 -8, 66 4, 56 12 L 50 3 Z"
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.3}
            />
            <Polygon points="66,-3.2 82,0 66,3.2" fill={palette.highlight} stroke={INK_STROKE} strokeWidth={1.2} />
          </G>
        )}

        {variant === 'archstaff' && (
          <G>
            <Path d="M -22 0 L 60 0" stroke="#36264F" strokeWidth={3.6} strokeLinecap="round" />
            {/* Astral crescent finial */}
            <Path
              d="M 58 -10 C 70 -14, 76 14, 58 10 C 64 6, 64 -6, 58 -10 Z"
              fill={palette.trim}
              stroke={INK_STROKE}
              strokeWidth={1.2}
            />
            <Circle
              cx={67}
              cy={0}
              r={5.2}
              fill={palette.glow ?? '#A855F7'}
              stroke={INK_STROKE}
              strokeWidth={1.1}
            />
          </G>
        )}

        {variant === 'longbow' && (
          <G>
            <Path
              d="M -6 -28 C 16 -18, 16 18, -6 28"
              fill="none"
              stroke="#6B4423"
              strokeWidth={3.8}
              strokeLinecap="round"
            />
            <Path d="M -6 -28 L -6 28" stroke="#E2E8F0" strokeWidth={1.1} />
          </G>
        )}

        {variant === 'longsword' && (
          <G>
            <Path d="M -11 0 L 4 0" stroke="#3F2E21" strokeWidth={3.5} strokeLinecap="round" />
            <Rect x={3} y={-7} width={4} height={14} rx={1.5} fill={palette.trim} stroke={INK_STROKE} strokeWidth={1.1} />
            <Path
              d="M 7 -3.2 L 50 -2.6 L 59 0 L 50 2.6 L 7 3.2 Z"
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.25}
            />
            <Path d="M 8 -1 L 55 0 L 8 1 Z" fill={palette.highlight} fillOpacity={0.75} />
          </G>
        )}

        {variant === 'wakizashi' && (
          <G>
            <Path d="M -11 0 L 4 0" stroke="#1E293B" strokeWidth={3.2} strokeLinecap="round" />
            <Rect x={3} y={-5.5} width={3} height={11} rx={1} fill={palette.trim} stroke={INK_STROKE} strokeWidth={1} />
            <Path
              d="M 6 -2.5 Q 32 -4.5 52 -6 L 47 0.5 Q 28 -0.5 6 1.5 Z"
              fill={palette.highlight}
              stroke={INK_STROKE}
              strokeWidth={1.2}
            />
          </G>
        )}

        {variant === 'daggers' && (
          <G>
            <Path d="M -8 0 L 4 0" stroke="#27272A" strokeWidth={3} strokeLinecap="round" />
            <Rect x={3} y={-4.5} width={2.8} height={9} rx={1} fill={palette.trim} stroke={INK_STROKE} strokeWidth={0.95} />
            <Path
              d="M 6 -2.6 L 32 -1.2 L 38 0 L 30 2.2 L 6 2.2 Z"
              fill={palette.highlight}
              stroke={INK_STROKE}
              strokeWidth={1.15}
            />
          </G>
        )}

        {variant === 'warhammer' && (
          <G>
            <Path d="M -12 0 L 42 0" stroke="#4A2E1B" strokeWidth={3.6} strokeLinecap="round" />
            <Rect
              x={36}
              y={-12}
              width={13}
              height={24}
              rx={2.5}
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.3}
            />
            <Rect x={38} y={-10} width={9} height={4} fill={palette.trim} />
          </G>
        )}

        {variant === 'cleaver' && (
          <G>
            <Path d="M -10 0 L 28 0" stroke="#4A2E1B" strokeWidth={3.4} strokeLinecap="round" />
            <Path
              d="M 24 -3 L 48 -14 L 51 6 L 24 4 Z"
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.3}
              strokeLinejoin="round"
            />
          </G>
        )}

        {variant === 'war_fan' && (
          <G>
            <Path
              d="M 0 0 L 32 -18 A 36 36 0 0 1 32 18 Z"
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.25}
            />
            <Path d="M 0 0 L 30 -8 M 0 0 L 32 0 M 0 0 L 30 8" stroke={palette.trim} strokeWidth={1.1} />
          </G>
        )}
      </G>
    </Svg>
  );
};

// ============================================================================
// 6. Offhand Gear (anchored at backForearm hand grip (0, forearm.length))
// ============================================================================

export interface OffhandPartSvgProps {
  profile: EquippedVisualProfile;
  metrics: CharacterRigMetrics;
}

export const OffhandPartSvg: React.FC<OffhandPartSvgProps> = ({ profile, metrics }) => {
  if (isWeaponVisualVariant(profile.variant)) {
    return <WeaponPartSvg profile={profile} metrics={metrics} />;
  }

  const s = metrics.statureScale;
  const { variant, palette } = profile;
  const svgW = Math.ceil(56 * s);
  const svgH = Math.ceil(78 * s);
  const minX = -svgW / 2;
  const minY = -svgH / 2;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      <G transform={`scale(${s})`}>
        {variant === 'tower_shield' && (
          <G>
            <Path
              d="M -14 -28 L 14 -28 L 16 14 L 0 32 L -16 14 Z"
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            <Path
              d="M -9 -22 L 9 -22 L 10 10 L 0 23 L -10 10 Z"
              fill={palette.secondary}
              stroke={palette.trim}
              strokeWidth={1.3}
            />
            <Circle cx={0} cy={-3} r={4.2} fill={palette.trim} stroke={INK_STROKE} strokeWidth={1} />
          </G>
        )}

        {variant === 'buckler' && (
          <G>
            <Circle
              cx={0}
              cy={0}
              r={15}
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.45}
            />
            <Circle cx={0} cy={0} r={10.5} fill="none" stroke={palette.trim} strokeWidth={1.4} />
            <Circle cx={0} cy={0} r={4.2} fill={palette.highlight} stroke={INK_STROKE} strokeWidth={1.1} />
          </G>
        )}

        {variant === 'censer_relic' && (
          <G>
            <Path d="M 0 -10 L 0 4" stroke={palette.trim} strokeWidth={1.5} />
            <Polygon
              points="-8,6 8,6 11,16 0,25 -11,16"
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.3}
            />
            <Circle cx={0} cy={14} r={4} fill={palette.glow ?? '#FBBF24'} />
          </G>
        )}

        {variant === 'grimoire' && (
          <G>
            <Rect
              x={-10}
              y={-13}
              width={20}
              height={26}
              rx={2.5}
              fill={palette.primary}
              stroke={INK_STROKE}
              strokeWidth={1.35}
            />
            <Rect x={-7} y={-10} width={14} height={20} rx={1.5} fill={palette.secondary} />
            <Circle cx={0} cy={0} r={4.5} fill={palette.glow ?? '#A855F7'} stroke={palette.trim} strokeWidth={1} />
          </G>
        )}
      </G>
    </Svg>
  );
};

// ============================================================================
// 7. Accessory 1 (Wrist Bracer / Signet Ring at frontForearm wrist)
// ============================================================================

export interface AccessoryWristSvgProps {
  profile: EquippedVisualProfile;
  metrics: CharacterRigMetrics;
}

export const AccessoryWristSvg: React.FC<AccessoryWristSvgProps> = ({
  profile,
  metrics,
}) => {
  const wristHalf = (metrics.forearm.width / 2) * 0.78;
  const { palette } = profile;
  const svgW = Math.ceil(wristHalf * 4 + 14);
  const svgH = 20;
  const minX = -svgW / 2;
  const minY = -10;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      <Rect
        x={-wristHalf - 1.2}
        y={-3.5}
        width={wristHalf * 2 + 2.4}
        height={7}
        rx={2}
        fill={palette.primary}
        stroke={INK_STROKE}
        strokeWidth={1.15}
      />
      <Circle
        cx={wristHalf * 0.35}
        cy={0}
        r={2.5}
        fill={palette.glow ?? palette.trim}
        stroke={INK_STROKE}
        strokeWidth={0.8}
      />
    </Svg>
  );
};

// ============================================================================
// 8. Accessory 2 (Neck / Chest Pendant at upper chest)
// ============================================================================

export interface AccessoryNeckSvgProps {
  profile: EquippedVisualProfile;
  metrics: CharacterRigMetrics;
}

export const AccessoryNeckSvg: React.FC<AccessoryNeckSvgProps> = ({
  profile,
  metrics,
}) => {
  const chestHalf = metrics.torso.chestWidth / 2;
  const { palette, variant } = profile;
  const svgW = Math.ceil(chestHalf * 2 + 16);
  const svgH = 30;
  const minX = -svgW / 2;
  const minY = -10;

  const gemColor = palette.glow ?? palette.trim;

  return (
    <Svg
      width={svgW}
      height={svgH}
      viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
      style={{ position: 'absolute', left: minX, top: minY }}
    >
      {/* Collar chain */}
      <Path
        d={`M ${-chestHalf * 0.42} -6 Q 0 6 ${chestHalf * 0.42} -6`}
        fill="none"
        stroke={palette.trim}
        strokeWidth={1.45}
        strokeLinecap="round"
      />
      {variant === 'oni_charm' ? (
        <Polygon
          points="0,1 4.5,8 0,14 -4.5,8"
          fill={gemColor}
          stroke={INK_STROKE}
          strokeWidth={1}
        />
      ) : (
        <Circle
          cx={0}
          cy={6.5}
          r={3.8}
          fill={gemColor}
          stroke={INK_STROKE}
          strokeWidth={1}
        />
      )}
    </Svg>
  );
};

export interface ResolvedEquippedProfiles {
  mainHand: EquippedVisualProfile | null;
  offHand: EquippedVisualProfile | null;
  head: EquippedVisualProfile | null;
  chest: EquippedVisualProfile | null;
  legs: EquippedVisualProfile | null;
  boots: EquippedVisualProfile | null;
  accessory1: EquippedVisualProfile | null;
  accessory2: EquippedVisualProfile | null;
}

export function resolveLoadoutVisualProfiles(
  loadout?: Partial<EquipmentLoadoutMap> | null
): ResolvedEquippedProfiles {
  return {
    mainHand: resolveEquippedVisualProfile('mainHand', loadout?.mainHand),
    offHand: resolveEquippedVisualProfile('offHand', loadout?.offHand),
    head: resolveEquippedVisualProfile('head', loadout?.head),
    chest: resolveEquippedVisualProfile('chest', loadout?.chest),
    legs: resolveEquippedVisualProfile('legs', loadout?.legs),
    boots: resolveEquippedVisualProfile('boots', loadout?.boots),
    accessory1: resolveEquippedVisualProfile('accessory1', loadout?.accessory1),
    accessory2: resolveEquippedVisualProfile('accessory2', loadout?.accessory2),
  };
}
