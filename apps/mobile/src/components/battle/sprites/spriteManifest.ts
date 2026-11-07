import type { SpriteSheetConfig } from './sprite.types';

// Knight imports
import knightIdle from '../../../../assets/battle/sprites/knight/idle.png';
import knightWalk from '../../../../assets/battle/sprites/knight/walk.png';
import knightAttack from '../../../../assets/battle/sprites/knight/attack.png';
import knightHurt from '../../../../assets/battle/sprites/knight/hurt.png';
import knightDeath from '../../../../assets/battle/sprites/knight/death.png';

// Swordsman imports
import swordsmanIdle from '../../../../assets/battle/sprites/swordsman/idle.png';
import swordsmanWalk from '../../../../assets/battle/sprites/swordsman/walk.png';
import swordsmanAttack from '../../../../assets/battle/sprites/swordsman/attack.png';
import swordsmanHurt from '../../../../assets/battle/sprites/swordsman/hurt.png';
import swordsmanDeath from '../../../../assets/battle/sprites/swordsman/death.png';

// Archer imports
import archerIdle from '../../../../assets/battle/sprites/archer/idle.png';
import archerWalk from '../../../../assets/battle/sprites/archer/walk.png';
import archerAttack from '../../../../assets/battle/sprites/archer/attack.png';
import archerHurt from '../../../../assets/battle/sprites/archer/hurt.png';
import archerDeath from '../../../../assets/battle/sprites/archer/death.png';

// Skeleton imports
import skeletonIdle from '../../../../assets/battle/sprites/skeleton/idle.png';
import skeletonWalk from '../../../../assets/battle/sprites/skeleton/walk.png';
import skeletonAttack from '../../../../assets/battle/sprites/skeleton/attack.png';
import skeletonHurt from '../../../../assets/battle/sprites/skeleton/hurt.png';
import skeletonDeath from '../../../../assets/battle/sprites/skeleton/death.png';

// Orc imports
import orcIdle from '../../../../assets/battle/sprites/orc/idle.png';
import orcWalk from '../../../../assets/battle/sprites/orc/walk.png';
import orcAttack from '../../../../assets/battle/sprites/orc/attack.png';
import orcHurt from '../../../../assets/battle/sprites/orc/hurt.png';
import orcDeath from '../../../../assets/battle/sprites/orc/death.png';

// Greatsword Skeleton (Boss) imports
import greatswordSkeletonIdle from '../../../../assets/battle/sprites/greatsword_skeleton/idle.png';
import greatswordSkeletonWalk from '../../../../assets/battle/sprites/greatsword_skeleton/walk.png';
import greatswordSkeletonAttack from '../../../../assets/battle/sprites/greatsword_skeleton/attack.png';
import greatswordSkeletonHurt from '../../../../assets/battle/sprites/greatsword_skeleton/hurt.png';
import greatswordSkeletonDeath from '../../../../assets/battle/sprites/greatsword_skeleton/death.png';

// Demon Boss (Black Knight_A) imports
import demonBossIdle from '../../../../assets/battle/sprites/demon_boss/idle.png';
import demonBossWalk from '../../../../assets/battle/sprites/demon_boss/walk.png';
import demonBossAttack from '../../../../assets/battle/sprites/demon_boss/attack.png';
import demonBossHurt from '../../../../assets/battle/sprites/demon_boss/hurt.png';
import demonBossDeath from '../../../../assets/battle/sprites/demon_boss/death.png';

export const KNIGHT_SPRITE_CONFIG: SpriteSheetConfig = {
  id: 'knight',
  displayName: 'Knight',
  frameWidth: 100,
  frameHeight: 100,
  footRow: 59,
  attackImpactFrame: 3,
  clips: {
    idle: { source: knightIdle, frameCount: 6, frameDurationMs: 150, loop: true },
    walk: { source: knightWalk, frameCount: 8, frameDurationMs: 130, loop: true },
    attack: { source: knightAttack, frameCount: 7, frameDurationMs: 90, loop: false },
    hurt: { source: knightHurt, frameCount: 4, frameDurationMs: 85, loop: false },
    death: { source: knightDeath, frameCount: 4, frameDurationMs: 160, loop: false },
  },
};

export const SWORDSMAN_SPRITE_CONFIG: SpriteSheetConfig = {
  id: 'swordsman',
  displayName: 'Swordsman',
  frameWidth: 100,
  frameHeight: 100,
  footRow: 59,
  attackImpactFrame: 3,
  clips: {
    idle: { source: swordsmanIdle, frameCount: 6, frameDurationMs: 150, loop: true },
    walk: { source: swordsmanWalk, frameCount: 8, frameDurationMs: 130, loop: true },
    attack: { source: swordsmanAttack, frameCount: 7, frameDurationMs: 90, loop: false },
    hurt: { source: swordsmanHurt, frameCount: 5, frameDurationMs: 80, loop: false },
    death: { source: swordsmanDeath, frameCount: 4, frameDurationMs: 160, loop: false },
  },
};

export const ARCHER_SPRITE_CONFIG: SpriteSheetConfig = {
  id: 'archer',
  displayName: 'Archer',
  frameWidth: 100,
  frameHeight: 100,
  footRow: 59,
  attackImpactFrame: 6,
  clips: {
    idle: { source: archerIdle, frameCount: 6, frameDurationMs: 150, loop: true },
    walk: { source: archerWalk, frameCount: 8, frameDurationMs: 130, loop: true },
    attack: { source: archerAttack, frameCount: 9, frameDurationMs: 70, loop: false },
    hurt: { source: archerHurt, frameCount: 4, frameDurationMs: 85, loop: false },
    death: { source: archerDeath, frameCount: 4, frameDurationMs: 160, loop: false },
  },
};

export const SKELETON_SPRITE_CONFIG: SpriteSheetConfig = {
  id: 'skeleton',
  displayName: 'Skeleton',
  frameWidth: 100,
  frameHeight: 100,
  footRow: 59,
  attackImpactFrame: 3,
  clips: {
    idle: { source: skeletonIdle, frameCount: 6, frameDurationMs: 150, loop: true },
    walk: { source: skeletonWalk, frameCount: 8, frameDurationMs: 130, loop: true },
    attack: { source: skeletonAttack, frameCount: 6, frameDurationMs: 95, loop: false },
    hurt: { source: skeletonHurt, frameCount: 4, frameDurationMs: 85, loop: false },
    death: { source: skeletonDeath, frameCount: 4, frameDurationMs: 160, loop: false },
  },
};

export const ORC_SPRITE_CONFIG: SpriteSheetConfig = {
  id: 'orc',
  displayName: 'Elite Orc',
  frameWidth: 100,
  frameHeight: 100,
  footRow: 59,
  attackImpactFrame: 3,
  clips: {
    idle: { source: orcIdle, frameCount: 6, frameDurationMs: 150, loop: true },
    walk: { source: orcWalk, frameCount: 8, frameDurationMs: 130, loop: true },
    attack: { source: orcAttack, frameCount: 7, frameDurationMs: 90, loop: false },
    hurt: { source: orcHurt, frameCount: 4, frameDurationMs: 85, loop: false },
    death: { source: orcDeath, frameCount: 4, frameDurationMs: 160, loop: false },
  },
};

export const GREATSWORD_SKELETON_SPRITE_CONFIG: SpriteSheetConfig = {
  id: 'greatsword_skeleton',
  displayName: 'Greatsword Skeleton',
  frameWidth: 100,
  frameHeight: 100,
  footRow: 59,
  attackImpactFrame: 5,
  portraitCrop: {
    zoom: 2.25,
    offsetX: 2,
    offsetY: 6,
  },
  clips: {
    idle: { source: greatswordSkeletonIdle, frameCount: 6, frameDurationMs: 150, loop: true },
    walk: { source: greatswordSkeletonWalk, frameCount: 9, frameDurationMs: 130, loop: true },
    attack: { source: greatswordSkeletonAttack, frameCount: 9, frameDurationMs: 80, loop: false },
    hurt: { source: greatswordSkeletonHurt, frameCount: 4, frameDurationMs: 85, loop: false },
    death: { source: greatswordSkeletonDeath, frameCount: 4, frameDurationMs: 160, loop: false },
  },
};

export const DEMON_BOSS_SPRITE_CONFIG: SpriteSheetConfig = {
  id: 'demon_boss',
  displayName: 'Abyssal Lord',
  frameWidth: 100,
  frameHeight: 100,
  footRow: 59,
  attackImpactFrame: 5,
  portraitCrop: {
    zoom: 2.2,
    offsetX: 0,
    offsetY: 6,
  },
  clips: {
    idle: { source: demonBossIdle, frameCount: 6, frameDurationMs: 150, loop: true },
    walk: { source: demonBossWalk, frameCount: 8, frameDurationMs: 130, loop: true },
    attack: { source: demonBossAttack, frameCount: 16, frameDurationMs: 55, loop: false },
    hurt: { source: demonBossHurt, frameCount: 4, frameDurationMs: 85, loop: false },
    death: { source: demonBossDeath, frameCount: 4, frameDurationMs: 160, loop: false },
  },
};

export const ALL_SPRITE_CONFIGS: Record<string, SpriteSheetConfig> = {
  knight: KNIGHT_SPRITE_CONFIG,
  swordsman: SWORDSMAN_SPRITE_CONFIG,
  archer: ARCHER_SPRITE_CONFIG,
  skeleton: SKELETON_SPRITE_CONFIG,
  orc: ORC_SPRITE_CONFIG,
  greatsword_skeleton: GREATSWORD_SKELETON_SPRITE_CONFIG,
  demon_boss: DEMON_BOSS_SPRITE_CONFIG,
};

export function resolveHeroSpriteConfig(nameOrClass?: string): SpriteSheetConfig {
  if (!nameOrClass) return KNIGHT_SPRITE_CONFIG;
  const lower = nameOrClass.toLowerCase();

  if (lower.includes('archer') || lower.includes('ranger') || lower.includes('agility') || lower.includes('outrider')) {
    return ARCHER_SPRITE_CONFIG;
  }
  if (lower.includes('swordsman') || lower.includes('berserker') || lower.includes('strength') || lower.includes('blade')) {
    return SWORDSMAN_SPRITE_CONFIG;
  }
  return KNIGHT_SPRITE_CONFIG;
}

export function resolveEnemySpriteConfig(isBoss?: boolean, enemyName?: string): SpriteSheetConfig {
  const lower = (enemyName ?? '').toLowerCase();

  if (isBoss) {
    if (
      lower.includes('malakor') ||
      lower.includes('valerius') ||
      lower.includes('lich') ||
      lower.includes('executioner')
    ) {
      return GREATSWORD_SKELETON_SPRITE_CONFIG;
    }
    if (lower.includes('goretooth') || lower.includes('warchief')) {
      return ORC_SPRITE_CONFIG;
    }
    if (lower.includes('vane') || lower.includes('commander')) {
      return KNIGHT_SPRITE_CONFIG;
    }
    if (
      lower.includes('ignisrax') ||
      lower.includes('avatar') ||
      lower.includes('demon') ||
      lower.includes('overlord')
    ) {
      return DEMON_BOSS_SPRITE_CONFIG;
    }
    return DEMON_BOSS_SPRITE_CONFIG;
  }

  // Non-boss monsters
  if (
    lower.includes('greatsword') ||
    lower.includes('executioner') ||
    lower.includes('dread-knight')
  ) {
    return GREATSWORD_SKELETON_SPRITE_CONFIG;
  }
  if (
    lower.includes('knight') ||
    lower.includes('paladin') ||
    lower.includes('deserter') ||
    lower.includes('guardian')
  ) {
    return KNIGHT_SPRITE_CONFIG;
  }
  if (
    lower.includes('swordsman') ||
    lower.includes('duelist') ||
    lower.includes('blade') ||
    lower.includes('warrior')
  ) {
    return SWORDSMAN_SPRITE_CONFIG;
  }
  if (
    lower.includes('archer') ||
    lower.includes('bow') ||
    lower.includes('ranger') ||
    lower.includes('sniper') ||
    lower.includes('crossbow') ||
    lower.includes('skirmisher') ||
    lower.includes('javelin')
  ) {
    return ARCHER_SPRITE_CONFIG;
  }
  if (
    lower.includes('orc') ||
    lower.includes('brute') ||
    lower.includes('raider') ||
    lower.includes('berserker') ||
    lower.includes('hell-guard') ||
    lower.includes('goblin') ||
    lower.includes('troll')
  ) {
    return ORC_SPRITE_CONFIG;
  }
  if (
    lower.includes('demon') ||
    lower.includes('abyssal') ||
    lower.includes('lieutenant')
  ) {
    return DEMON_BOSS_SPRITE_CONFIG;
  }
  if (
    lower.includes('skeleton') ||
    lower.includes('undead') ||
    lower.includes('bone') ||
    lower.includes('phalanx')
  ) {
    return SKELETON_SPRITE_CONFIG;
  }

  return SKELETON_SPRITE_CONFIG;
}

export function getGroundAlignedBottomOffset(
  groundBaselineBottom: number,
  config: SpriteSheetConfig,
  scale: number
): number {
  const transparentPaddingBelowFeet = config.frameHeight - (config.footRow + 1);
  return Math.round(groundBaselineBottom - transparentPaddingBelowFeet * scale);
}
