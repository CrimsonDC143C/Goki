/**
 * Deterministic Seeded PRNG (xmur3 + mulberry32)
 * Ensures 100% reproducible combat replays, PR crit loot rolls, and raid reward drops
 * without ever calling non-deterministic `Math.random()`.
 */
export interface SeededRng {
  /** Next float in [0, 1) */
  next(): number;
  /** Next float in [0, 1) (alias of next) */
  nextFloat(): number;
  /** Random integer in [min, max] inclusive */
  nextInt(min: number, max: number): number;
  /** Roll probability check in [0, 1] */
  chance(probability: number): boolean;
  /** Pick random element from non-empty items */
  pick<T>(items: readonly T[]): T;
  /** Pick weighted entry from non-empty items */
  pickWeighted<T extends { weight: number }>(items: readonly T[]): T;
}

function hashSeed(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function createSeededRng(seed: string): SeededRng {
  const seedFn = hashSeed(seed || 'goki-default-seed');
  let a = seedFn();

  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (min: number, max: number): number => {
    if (max <= min) return min;
    return Math.floor(next() * (max - min + 1)) + min;
  };

  const chance = (probability: number): boolean => {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return next() < probability;
  };

  const pickWeighted = <T extends { weight: number }>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty weighted list.');
    }
    const totalWeight = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
    if (totalWeight <= 0) {
      return items[0]!;
    }
    let roll = next() * totalWeight;
    for (const item of items) {
      const w = Math.max(0, item.weight);
      if (roll < w) {
        return item;
      }
      roll -= w;
    }
    return items[items.length - 1]!;
  };

  const nextFloat = next;

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty list.');
    }
    const idx = Math.floor(next() * items.length);
    return items[Math.min(idx, items.length - 1)]!;
  };

  return { next, nextFloat, nextInt, chance, pick, pickWeighted };
}
