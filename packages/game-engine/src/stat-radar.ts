import { HolisticStatType } from './types';
import { xpRequiredForStatLevel } from './workout-calculator';

export interface RadarStatConfig {
  key: HolisticStatType;
  name: string;
  abbrev: string;
  color: string;
}

export const RADAR_STATS: readonly RadarStatConfig[] = [
  { key: 'STRENGTH', name: 'Strength', abbrev: 'STR', color: '#EF5350' },
  { key: 'ENDURANCE', name: 'Endurance', abbrev: 'END', color: '#26A69A' },
  { key: 'AGILITY', name: 'Agility', abbrev: 'AGI', color: '#42A5F5' },
  { key: 'DEXTERITY', name: 'Dexterity', abbrev: 'DEX', color: '#26C6DA' },
  { key: 'CONSTITUTION', name: 'Constitution', abbrev: 'CON', color: '#66BB6A' },
  { key: 'WISDOM', name: 'Wisdom', abbrev: 'WIS', color: '#AB47BC' },
  { key: 'SPIRIT', name: 'Spirit', abbrev: 'SPR', color: '#EC407A' },
];

export interface StatRadarVertex {
  key: HolisticStatType;
  name: string;
  abbrev: string;
  color: string;
  level: number;
  xp: number;
  nextReq: number;
  effectiveValue: number;
  angle: number;
  fraction: number;
  radius: number;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
}

export interface StatRadarGeometry {
  vertices: StatRadarVertex[];
  polygonPoints: string;
  scaleMax: number;
  isSymmetrical: boolean;
  ariaLabel: string;
}

export type StatInputMap = Partial<
  Record<
    string,
    {
      level?: number;
      xp?: number;
      pointsAvailable?: number;
    }
  >
>;

export const RADAR_GEOMETRY_DEFAULTS = {
  cx: 160,
  cy: 160,
  maxRadius: 112,
  labelRadius: 134.4,
  baseFraction: 0.25, // Ring 1 is 25% (28px)
} as const;

/**
 * Calculates deterministic 2D polygon vertices and axis coordinates for the
 * 7-Stat Holistic Progression System radar chart.
 *
 * Mathematically balances fresh characters (all Lv. 1 stats) onto the innermost Ring 1
 * reference heptagon, while smoothly stretching vertices towards the outer edge
 * as stats level up and accrue XP.
 */
export function calculateStatRadarGeometry(
  stats?: StatInputMap | null,
  options?: {
    cx?: number;
    cy?: number;
    maxRadius?: number;
    labelRadius?: number;
    baseFraction?: number;
  }
): StatRadarGeometry {
  const cx = options?.cx ?? RADAR_GEOMETRY_DEFAULTS.cx;
  const cy = options?.cy ?? RADAR_GEOMETRY_DEFAULTS.cy;
  const maxRadius = options?.maxRadius ?? RADAR_GEOMETRY_DEFAULTS.maxRadius;
  const labelRadius = options?.labelRadius ?? RADAR_GEOMETRY_DEFAULTS.labelRadius;
  const baseFraction = options?.baseFraction ?? RADAR_GEOMETRY_DEFAULTS.baseFraction;

  const statEntries = RADAR_STATS.map((s, index) => {
    const data = stats?.[s.key] || stats?.[s.abbrev];
    const level = Math.max(1, Math.floor(data?.level ?? 1));
    const xp = Math.max(0, Math.floor(data?.xp ?? 0));
    const nextReq = xpRequiredForStatLevel(level);
    const progress = Math.min(0.99, xp / Math.max(1, nextReq));
    const effectiveValue = level + progress;
    return {
      ...s,
      index,
      level,
      xp,
      nextReq,
      effectiveValue,
    };
  });

  const maxEffective = Math.max(1, ...statEntries.map((e) => e.effectiveValue));
  let scaleMax = 10;
  if (maxEffective > 50) {
    scaleMax = Math.max(100, Math.ceil(maxEffective / 25) * 25);
  } else if (maxEffective > 25) {
    scaleMax = 50;
  } else if (maxEffective > 10) {
    scaleMax = 25;
  } else {
    scaleMax = 10;
  }

  const vertices: StatRadarVertex[] = statEntries.map((s) => {
    const angle = -Math.PI / 2 + (s.index * 2 * Math.PI) / 7;
    const fraction =
      baseFraction +
      (1 - baseFraction) *
        Math.min(1, Math.max(0, (s.effectiveValue - 1) / (scaleMax - 1)));
    const radius = maxRadius * fraction;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    const labelX = cx + labelRadius * Math.cos(angle);
    const labelY = cy + labelRadius * Math.sin(angle);

    return {
      key: s.key,
      name: s.name,
      abbrev: s.abbrev,
      color: s.color,
      level: s.level,
      xp: s.xp,
      nextReq: s.nextReq,
      effectiveValue: s.effectiveValue,
      angle,
      fraction,
      radius,
      x,
      y,
      labelX,
      labelY,
    };
  });

  const polygonPoints = vertices.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' ');
  const firstRadius = vertices[0]?.radius ?? 0;
  const isSymmetrical = vertices.every((v) => Math.abs(v.radius - firstRadius) < 0.001);
  const ariaLabel = `Stat radar: ${vertices.map((v) => `${v.abbrev} ${v.level}`).join(', ')}`;

  return {
    vertices,
    polygonPoints,
    scaleMax,
    isSymmetrical,
    ariaLabel,
  };
}
