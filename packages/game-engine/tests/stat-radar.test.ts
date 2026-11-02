import { describe, expect, it } from 'vitest';
import {
  calculateStatRadarGeometry,
  RADAR_STATS,
} from '../src/stat-radar';

describe('7-Stat Radar Synergy Matrix Calculations', () => {
  it('renders a perfectly balanced, symmetrical regular heptagon for a fresh Lv. 1 character', () => {
    const freshStats = {
      STRENGTH: { level: 1, xp: 0 },
      ENDURANCE: { level: 1, xp: 0 },
      AGILITY: { level: 1, xp: 0 },
      DEXTERITY: { level: 1, xp: 0 },
      CONSTITUTION: { level: 1, xp: 0 },
      WISDOM: { level: 1, xp: 0 },
      SPIRIT: { level: 1, xp: 0 },
    };

    const geometry = calculateStatRadarGeometry(freshStats);

    expect(geometry.scaleMax).toBe(10);
    expect(geometry.isSymmetrical).toBe(true);
    expect(geometry.vertices).toHaveLength(7);

    // Each vertex must sit precisely on Ring 1 (25% radius = 28px)
    for (const v of geometry.vertices) {
      expect(v.radius).toBeCloseTo(28.0, 1);
      expect(v.fraction).toBeCloseTo(0.25, 2);
      expect(v.level).toBe(1);
      expect(v.xp).toBe(0);
    }

    // Vertex 0 (STR) must point straight up (12 o'clock: angle = -PI/2)
    const strVertex = geometry.vertices[0];
    expect(strVertex.abbrev).toBe('STR');
    expect(strVertex.x).toBeCloseTo(160, 1);
    expect(strVertex.y).toBeCloseTo(132, 1); // 160 - 28 = 132

    expect(geometry.ariaLabel).toBe(
      'Stat radar: STR 1, END 1, AGI 1, DEX 1, CON 1, WIS 1, SPR 1'
    );
  });

  it('safely defaults missing, null, or empty stat objects to Level 1 baseline', () => {
    const geometryNull = calculateStatRadarGeometry(null);
    expect(geometryNull.isSymmetrical).toBe(true);
    expect(geometryNull.vertices.every((v) => v.level === 1)).toBe(true);
    expect(geometryNull.vertices.every((v) => Math.abs(v.radius - 28) < 0.01)).toBe(true);

    const geometryEmpty = calculateStatRadarGeometry({});
    expect(geometryEmpty.isSymmetrical).toBe(true);
    expect(geometryEmpty.vertices.every((v) => v.level === 1)).toBe(true);
  });

  it('dynamically skews vertices outward as individual stats level up and gain XP', () => {
    const trainedStats = {
      STRENGTH: { level: 5, xp: 100 },
      ENDURANCE: { level: 3, xp: 50 },
      AGILITY: { level: 1, xp: 0 },
      DEXTERITY: { level: 1, xp: 0 },
      CONSTITUTION: { level: 1, xp: 0 },
      WISDOM: { level: 1, xp: 0 },
      SPIRIT: { level: 1, xp: 0 },
    };

    const geometry = calculateStatRadarGeometry(trainedStats);

    expect(geometry.scaleMax).toBe(10);
    expect(geometry.isSymmetrical).toBe(false);

    const str = geometry.vertices.find((v) => v.abbrev === 'STR')!;
    const end = geometry.vertices.find((v) => v.abbrev === 'END')!;
    const agi = geometry.vertices.find((v) => v.abbrev === 'AGI')!;

    // STR Lv. 5 with XP must be pulled out significantly further than Lv. 1
    expect(str.radius).toBeGreaterThan(60);
    expect(str.level).toBe(5);

    // END Lv. 3 must be between Lv. 1 (28px) and STR
    expect(end.radius).toBeGreaterThan(40);
    expect(end.radius).toBeLessThan(str.radius);

    // Untrained stats remain anchored on Ring 1 (28px)
    expect(agi.radius).toBeCloseTo(28.0, 1);
  });

  it('scales tier caps dynamically for advanced characters', () => {
    // Tier 1: <= 10
    expect(
      calculateStatRadarGeometry({ STRENGTH: { level: 8, xp: 0 } }).scaleMax
    ).toBe(10);

    // Tier 2: 11 - 25
    expect(
      calculateStatRadarGeometry({ STRENGTH: { level: 15, xp: 0 } }).scaleMax
    ).toBe(25);

    // Tier 3: 26 - 50
    expect(
      calculateStatRadarGeometry({ STRENGTH: { level: 42, xp: 0 } }).scaleMax
    ).toBe(50);

    // Tier 4: 51 - 100
    expect(
      calculateStatRadarGeometry({ STRENGTH: { level: 86, xp: 0 } }).scaleMax
    ).toBe(100);

    // Tier 5+: > 100
    expect(
      calculateStatRadarGeometry({ STRENGTH: { level: 120, xp: 0 } }).scaleMax
    ).toBe(125);
  });

  it('preserves clockwise stat ordering and palette consistency', () => {
    const geometry = calculateStatRadarGeometry();
    const order = geometry.vertices.map((v) => v.abbrev);
    expect(order).toEqual(['STR', 'END', 'AGI', 'DEX', 'CON', 'WIS', 'SPR']);

    const str = geometry.vertices[0];
    expect(str.color).toBe('#EF5350');

    const dex = geometry.vertices[3];
    expect(dex.color).toBe('#26C6DA');
  });
});
