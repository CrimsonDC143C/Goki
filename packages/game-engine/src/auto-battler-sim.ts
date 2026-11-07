import { getSystemicFatigueCombatPenalties } from './fatigue-manager';
import { createSeededRng } from './rng';
import {
  ActiveTalentSkillDefinition,
  AggregatedTalentModifiers,
  DEFAULT_TALENT_TREES,
  TalentTreeDefinition,
  aggregateTalentModifiers,
} from './talent-engine';
import {
  CoreStatBlock,
  EquipmentStatBonuses,
  HeartRateZone,
  LootDrop,
  WorkoutSessionType,
} from './types';
import {
  BASE_EQUIPPABLE_ITEM_BY_SLUG,
  ItemTier,
  proceduralItemToLootDrop,
  rollProceduralItemInstance,
} from './item-affix-engine';

// ============================================================================
// INTERFACES — INPUTS
// ============================================================================

export type LiveWorkoutBuffType =
  | 'TITANIC_FORCE'
  | 'TAILWIND_HASTE'
  | 'IRON_LUNG_MARCH'
  | 'SANCTUARY_MIST'
  | 'OVERLOAD_SURGE';

export interface DungeonWorkoutBuff {
  buffId: string;
  buffType: LiveWorkoutBuffType;
  buffName: string;
  sourceCharacterId: string;
  sourceWorkoutId?: string;
  partyMeleePowerPct?: number;
  partyBossShieldMaxHpPct?: number;
  partyAttackSpeedPct?: number;
  partyCooldownHastePct?: number;
  partyDodgeBonus?: number;
  partyMaxStaminaPct?: number;
  partyHazardResistancePct?: number;
  partyHpRegenPctPerSec?: number;
  betweenRoomHealMaxHpPct?: number;
  partyCritChanceBonus?: number;
}

export interface CombatantCharacterInput {
  characterId: string;
  name: string;
  coreStats: CoreStatBlock;
  equipmentBonuses?: EquipmentStatBonuses;
  unlockedTalentRanks?: Record<string, number>;
  systemicFatigueStacks?: number;
}

export interface DungeonEnemyTemplate {
  enemyId: string;
  name: string;
  isBoss?: boolean;
  maxHp: number;
  attackPower: number;
  armor: number;
  attackIntervalSeconds: number;
  dodgeChance?: number;
  cleaveTargets?: number;
}

export interface WeightedDungeonLoot extends LootDrop {
  weight: number;
}

export type DungeonRoomType = 'MOB_ENCOUNTER' | 'HAZARD_EVENT' | 'LOOT_CHEST' | 'BOSS';

export interface DungeonRoomDefinition {
  roomNumber: number;
  roomName: string;
  roomType: DungeonRoomType;
  enemies?: DungeonEnemyTemplate[];
  hazardConfig?: {
    hazardName: string;
    baseDamage: number;
    staminaDrain: number;
  };
  guaranteedGold?: number;
  lootTable?: WeightedDungeonLoot[];
  lootRolls?: number;
}

export type DungeonRequiredRank =
  | 'COPPER'
  | 'IRON'
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'MYTHIC';

export interface DungeonDefinition {
  dungeonSlug: string;
  dungeonName: string;
  description?: string;
  requiredRank?: DungeonRequiredRank;
  recommendedPower?: number;
  rewardMultiplierLabel?: string;
  themeLabel?: string;
  maxSimulationSeconds?: number;
  rooms: DungeonRoomDefinition[];
}

export interface SimulateDungeonInput {
  dungeon: DungeonDefinition;
  party: CombatantCharacterInput[];
  workoutBuffs?: DungeonWorkoutBuff[];
  seed: string;
  tickIntervalMs?: number;
  talentTrees?: readonly TalentTreeDefinition[];
}

// ============================================================================
// INTERFACES — DETERMINISTIC REPLAY LOG OUTPUT
// ============================================================================

export type CombatReplayEventType =
  | 'EXPEDITION_START'
  | 'WORKOUT_BUFF_ACTIVE'
  | 'ROOM_ENTER'
  | 'SHIELD_APPLIED'
  | 'HAZARD_RESOLVED'
  | 'BASIC_ATTACK'
  | 'SKILL_CAST'
  | 'DODGE'
  | 'BLEED_TICK'
  | 'HEAL'
  | 'AURA_REGEN'
  | 'BOSS_PHASE_SHIFT'
  | 'UNIT_DEFEATED'
  | 'LOOT_DROP'
  | 'ROOM_CLEARED'
  | 'EXPEDITION_END';

export interface CombatReplayEvent {
  seq: number;
  tMs: number;
  tSec: number;
  roomNumber: number;
  type: CombatReplayEventType;
  actorId?: string;
  actorName?: string;
  targetId?: string;
  targetName?: string;
  skillId?: string;
  skillName?: string;
  amount?: number;
  shieldAbsorbed?: number;
  isCrit?: boolean;
  targetRemainingHp?: number;
  loot?: LootDrop;
  goldAwarded?: number;
  message: string;
}

export interface CharacterCombatSummary {
  characterId: string;
  name: string;
  finalHp: number;
  maxHp: number;
  survived: boolean;
  totalDamageDealt: number;
  totalHealingDone: number;
  totalDamageTaken: number;
  totalDamageMitigated: number;
  critsLanded: number;
  dodgesTriggered: number;
  killsSecured: number;
}

export interface DungeonCombatReplayResult {
  engineVersion: string;
  seed: string;
  dungeonSlug: string;
  outcome: 'VICTORY' | 'WIPE' | 'TIMEOUT';
  roomsCleared: number;
  totalRooms: number;
  totalDurationMs: number;
  tickIntervalMs: number;
  totalGoldEarned: number;
  lootDrops: LootDrop[];
  partySummaries: CharacterCombatSummary[];
  events: CombatReplayEvent[];
}

// ============================================================================
// LIVE WORKOUT -> DUNGEON BUFF FACTORY
// ============================================================================

/**
 * Translates a real-world workout logged during an active 24h Dungeon window into
 * a Live Workout Injection Buff for the expedition party.
 */
export function createLiveDungeonWorkoutBuff(params: {
  workoutId: string;
  characterId: string;
  workoutType: WorkoutSessionType;
  averageHrZone?: HeartRateZone;
  triggeredPrCrit?: boolean;
}): DungeonWorkoutBuff[] {
  const buffs: DungeonWorkoutBuff[] = [];

  if (params.workoutType === 'RESISTANCE' || params.workoutType === 'HYBRID') {
    buffs.push({
      buffId: `buff-titanic-${params.workoutId}`,
      buffType: 'TITANIC_FORCE',
      buffName: 'Titanic Force',
      sourceCharacterId: params.characterId,
      sourceWorkoutId: params.workoutId,
      partyBossShieldMaxHpPct: 0.22,
      partyMeleePowerPct: 0.12,
    });
  } else if (
    params.workoutType === 'CARDIO_HIGH_INTENSITY' ||
    (params.averageHrZone !== undefined && params.averageHrZone >= 4)
  ) {
    buffs.push({
      buffId: `buff-tailwind-${params.workoutId}`,
      buffType: 'TAILWIND_HASTE',
      buffName: 'Tailwind Haste',
      sourceCharacterId: params.characterId,
      sourceWorkoutId: params.workoutId,
      partyAttackSpeedPct: 0.16,
      partyCooldownHastePct: 0.15,
      partyDodgeBonus: 0.05,
    });
  } else if (params.workoutType === 'ACTIVE_RECOVERY') {
    buffs.push({
      buffId: `buff-mist-${params.workoutId}`,
      buffType: 'SANCTUARY_MIST',
      buffName: 'Sanctuary Mist',
      sourceCharacterId: params.characterId,
      sourceWorkoutId: params.workoutId,
      betweenRoomHealMaxHpPct: 0.20,
    });
  } else {
    buffs.push({
      buffId: `buff-march-${params.workoutId}`,
      buffType: 'IRON_LUNG_MARCH',
      buffName: 'Iron Lung March',
      sourceCharacterId: params.characterId,
      sourceWorkoutId: params.workoutId,
      partyMaxStaminaPct: 0.20,
      partyHazardResistancePct: 0.25,
      partyHpRegenPctPerSec: 0.008,
    });
  }

  if (params.triggeredPrCrit) {
    buffs.push({
      buffId: `buff-overload-${params.workoutId}`,
      buffType: 'OVERLOAD_SURGE',
      buffName: 'Overload Surge',
      sourceCharacterId: params.characterId,
      sourceWorkoutId: params.workoutId,
      partyCritChanceBonus: 0.08,
    });
  }

  return buffs;
}

// ============================================================================
// INTERNAL SIMULATION STATE
// ============================================================================

interface AggregatedPartyBuffs {
  meleePowerPct: number;
  bossShieldMaxHpPct: number;
  attackSpeedPct: number;
  cooldownHastePct: number;
  dodgeBonus: number;
  maxStaminaPct: number;
  hazardResistancePct: number;
  hpRegenPctPerSec: number;
  betweenRoomHealMaxHpPct: number;
  critChanceBonus: number;
}

interface SimHero {
  characterId: string;
  name: string;
  maxHp: number;
  hp: number;
  shieldHp: number;
  maxStamina: number;
  stamina: number;
  meleePower: number;
  armor: number;
  damageMitigationPct: number;
  armorPenetrationPct: number;
  attackIntervalMs: number;
  accuracy: number;
  dodgeChance: number;
  critChance: number;
  critMultiplier: number;
  cooldownHastePct: number;
  staminaCostReductionPct: number;
  threatWeight: number;
  tauntUntilMs: number;
  hazardResistancePct: number;
  healingPowerPct: number;
  bleedMeleePctOnCrit: number;
  openingStrikeBonusPct: number;
  openingShieldMaxHpPct: number;
  resetCooldownOnKill: boolean;
  usedOpeningStrikeInRoom: boolean;
  nextBasicAttackAtMs: number;
  skills: ActiveTalentSkillDefinition[];
  skillReadyAtMs: Record<string, number>;
  talents: AggregatedTalentModifiers;
  summary: CharacterCombatSummary;
}

interface ActiveBleedEffect {
  sourceHeroId: string;
  sourceHeroName: string;
  damagePerTick: number;
  ticksRemaining: number;
  nextTickAtMs: number;
}

interface SimEnemy {
  instanceId: string;
  name: string;
  isBoss: boolean;
  enraged: boolean;
  maxHp: number;
  hp: number;
  attackPower: number;
  armor: number;
  attackIntervalMs: number;
  dodgeChance: number;
  cleaveTargets: number;
  nextAttackAtMs: number;
  bleeds: ActiveBleedEffect[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function roundTo2(v: number): number {
  return Math.round(v * 100) / 100;
}

function aggregateLiveWorkoutBuffs(buffs: readonly DungeonWorkoutBuff[]): AggregatedPartyBuffs {
  const agg: AggregatedPartyBuffs = {
    meleePowerPct: 0,
    bossShieldMaxHpPct: 0,
    attackSpeedPct: 0,
    cooldownHastePct: 0,
    dodgeBonus: 0,
    maxStaminaPct: 0,
    hazardResistancePct: 0,
    hpRegenPctPerSec: 0,
    betweenRoomHealMaxHpPct: 0,
    critChanceBonus: 0,
  };

  for (const b of buffs) {
    agg.meleePowerPct += b.partyMeleePowerPct ?? 0;
    agg.bossShieldMaxHpPct += b.partyBossShieldMaxHpPct ?? 0;
    agg.attackSpeedPct += b.partyAttackSpeedPct ?? 0;
    agg.cooldownHastePct += b.partyCooldownHastePct ?? 0;
    agg.dodgeBonus += b.partyDodgeBonus ?? 0;
    agg.maxStaminaPct += b.partyMaxStaminaPct ?? 0;
    agg.hazardResistancePct += b.partyHazardResistancePct ?? 0;
    agg.hpRegenPctPerSec += b.partyHpRegenPctPerSec ?? 0;
    agg.betweenRoomHealMaxHpPct += b.betweenRoomHealMaxHpPct ?? 0;
    agg.critChanceBonus += b.partyCritChanceBonus ?? 0;
  }

  // Cap stackable buffs at generous expedition ceilings to preserve combat balance
  agg.meleePowerPct = Math.min(0.60, agg.meleePowerPct);
  agg.bossShieldMaxHpPct = Math.min(0.60, agg.bossShieldMaxHpPct);
  agg.attackSpeedPct = Math.min(0.65, agg.attackSpeedPct);
  agg.cooldownHastePct = Math.min(0.50, agg.cooldownHastePct);
  agg.dodgeBonus = Math.min(0.20, agg.dodgeBonus);
  agg.hazardResistancePct = Math.min(0.75, agg.hazardResistancePct);
  agg.betweenRoomHealMaxHpPct = Math.min(0.50, agg.betweenRoomHealMaxHpPct);
  agg.critChanceBonus = Math.min(0.30, agg.critChanceBonus);

  return agg;
}

// ============================================================================
// DETERMINISTIC AUTO-BATTLER ENGINE
// ============================================================================

export function simulateDungeonRun(input: SimulateDungeonInput): DungeonCombatReplayResult {
  if (input.party.length < 1 || input.party.length > 5) {
    throw new Error(
      `Dungeon party must contain between 1 and 5 characters (received ${input.party.length}).`
    );
  }

  const tickIntervalMs = Math.max(50, input.tickIntervalMs ?? 250);
  const maxSimulationMs = (input.dungeon.maxSimulationSeconds ?? 600) * 1000;
  const rng = createSeededRng(input.seed);
  const trees = input.talentTrees ?? DEFAULT_TALENT_TREES;
  const workoutBuffs = input.workoutBuffs ?? [];
  const partyBuffs = aggregateLiveWorkoutBuffs(workoutBuffs);

  const events: CombatReplayEvent[] = [];
  let seq = 0;
  let currentTimeMs = 0;

  const pushEvent = (
    roomNumber: number,
    partial: Omit<CombatReplayEvent, 'seq' | 'tMs' | 'tSec' | 'roomNumber'>
  ) => {
    seq += 1;
    events.push({
      seq,
      tMs: currentTimeMs,
      tSec: roundTo2(currentTimeMs / 1000),
      roomNumber,
      ...partial,
    });
  };

  // First pass: aggregate party-wide Warden auras & loot bonuses across all heroes
  let partyAuraHpRegenPctPerSec = partyBuffs.hpRegenPctPerSec;
  let partyAuraStaminaRegenPerSec = 2.0; // Base natural stamina recovery
  let partyAuraMitigationPct = 0;
  let partyLootBonusPct = 0;

  const heroTalentProfiles = input.party.map((member) =>
    aggregateTalentModifiers(member.unlockedTalentRanks ?? {}, trees)
  );

  for (const tp of heroTalentProfiles) {
    partyAuraHpRegenPctPerSec += tp.partyHpRegenPctPerSec;
    partyAuraStaminaRegenPerSec += tp.partyStaminaRegenPerSec;
    partyAuraMitigationPct += tp.partyDamageMitigationPct;
    partyLootBonusPct += tp.dungeonLootBonusPct;
  }

  // Construct runtime heroes with Core Stats + Gear + Talents + Fatigue Penalties + Live Workout Buffs
  const heroes: SimHero[] = input.party.map((member, index) => {
    const talents = heroTalentProfiles[index]!;
    const gear = member.equipmentBonuses ?? {};
    const fatigue = getSystemicFatigueCombatPenalties(member.systemicFatigueStacks ?? 0);

    const effStr = member.coreStats.strengthLevel * fatigue.statEffectivenessMultiplier;
    const effEnd = member.coreStats.enduranceLevel * fatigue.statEffectivenessMultiplier;
    const effAgi = member.coreStats.agilityLevel * fatigue.statEffectivenessMultiplier;

    const rawMaxHp = 220 + effEnd * 28 + effStr * 10 + (gear.maxHp ?? 0);
    const maxHp = Math.max(100, Math.round(rawMaxHp * (1 + talents.maxHpPct)));

    const rawMaxStamina = 90 + effEnd * 12 + effAgi * 5 + (gear.maxStamina ?? 0);
    const maxStamina = Math.max(
      40,
      Math.round(rawMaxStamina * (1 + talents.maxStaminaPct + partyBuffs.maxStaminaPct))
    );

    const rawMeleePower = 18 + effStr * 4.5 + effAgi * 1.2 + (gear.meleePower ?? 0);
    const meleePower = Math.max(
      5,
      Math.round(rawMeleePower * (1 + talents.meleePowerPct + partyBuffs.meleePowerPct))
    );

    const rawArmor = 8 + effStr * 2.2 + effEnd * 1.5 + (gear.armorRating ?? 0);
    const armor = Math.max(0, Math.round(rawArmor * (1 + talents.armorPct)));

    const attackSpeedMultiplier =
      (1 +
        effAgi * 0.02 +
        (gear.attackSpeedPct ?? 0) +
        talents.attackSpeedPct +
        partyBuffs.attackSpeedPct) *
      fatigue.statEffectivenessMultiplier;
    const baseAttacksPerSec = clamp(0.75 * attackSpeedMultiplier, 0.35, 3.5);
    const attackIntervalMs = Math.round(1000 / baseAttacksPerSec);

    const rawDodge =
      0.04 +
      effAgi * 0.006 +
      (gear.dodgeRating ?? 0) +
      talents.dodgeRatingBonus +
      partyBuffs.dodgeBonus;
    const dodgeChance = clamp(rawDodge * fatigue.dodgeMultiplier, 0, 0.60);

    const critChance = clamp(
      0.05 +
        effAgi * 0.007 +
        (gear.critChance ?? 0) +
        talents.critChanceBonus +
        partyBuffs.critChanceBonus,
      0,
      0.75
    );

    const critMultiplier = 1.65 + (gear.critMultiplier ?? 0) + talents.critDamageBonus;
    const cooldownHastePct = clamp(
      effAgi * 0.005 + talents.cooldownHastePct + partyBuffs.cooldownHastePct,
      0,
      0.65
    );

    const damageMitigationPct = clamp(
      talents.damageMitigationPct + partyAuraMitigationPct,
      0,
      0.65
    );

    const hazardResistancePct = clamp(
      effEnd * 0.015 + talents.hazardResistancePct + partyBuffs.hazardResistancePct,
      0,
      0.85
    );

    const skillReadyAtMs: Record<string, number> = {};
    for (const sk of talents.unlockedSkills) {
      skillReadyAtMs[sk.skillId] = 0;
    }

    return {
      characterId: member.characterId,
      name: member.name,
      maxHp,
      hp: maxHp,
      shieldHp: 0,
      maxStamina,
      stamina: maxStamina,
      meleePower,
      armor,
      damageMitigationPct,
      armorPenetrationPct: clamp(talents.armorPenetrationPct, 0, 0.75),
      attackIntervalMs,
      accuracy: clamp(0.96 * fatigue.accuracyMultiplier, 0.65, 1.0),
      dodgeChance,
      critChance,
      critMultiplier,
      cooldownHastePct,
      staminaCostReductionPct: clamp(talents.staminaCostReductionPct, 0, 0.60),
      threatWeight: Math.max(10, 100 + talents.threatWeightBonus),
      tauntUntilMs: 0,
      hazardResistancePct,
      healingPowerPct: talents.healingPowerPct,
      bleedMeleePctOnCrit: talents.bleedMeleePowerPctOnCrit,
      openingStrikeBonusPct: talents.openingStrikeBonusPct,
      openingShieldMaxHpPct: talents.openingShieldMaxHpPct,
      resetCooldownOnKill: talents.resetCooldownOnKill,
      usedOpeningStrikeInRoom: false,
      nextBasicAttackAtMs: index * 100, // Stagger initial party swings naturally
      skills: talents.unlockedSkills,
      skillReadyAtMs,
      talents,
      summary: {
        characterId: member.characterId,
        name: member.name,
        finalHp: maxHp,
        maxHp,
        survived: true,
        totalDamageDealt: 0,
        totalHealingDone: 0,
        totalDamageTaken: 0,
        totalDamageMitigated: 0,
        critsLanded: 0,
        dodgesTriggered: 0,
        killsSecured: 0,
      },
    };
  });

  const collectedLoot: LootDrop[] = [];
  let totalGoldEarned = 0;
  let roomsCleared = 0;

  const mergeLootDrop = (drop: LootDrop) => {
    const existing = collectedLoot.find((d) => d.itemSlug === drop.itemSlug);
    if (existing) {
      existing.quantity += drop.quantity;
    } else {
      collectedLoot.push({ ...drop });
    }
  };

  pushEvent(0, {
    type: 'EXPEDITION_START',
    message: `Party of ${heroes.length} entered ${input.dungeon.dungeonName} with ${workoutBuffs.length} active workout buff(s).`,
  });

  for (const buff of workoutBuffs) {
    pushEvent(0, {
      type: 'WORKOUT_BUFF_ACTIVE',
      actorId: buff.sourceCharacterId,
      message: `Live Workout Buff '${buff.buffName}' (${buff.buffType}) empowers the expedition!`,
    });
  }

  let outcome: 'VICTORY' | 'WIPE' | 'TIMEOUT' = 'VICTORY';

  // Iterate room-by-room deterministically
  for (const room of input.dungeon.rooms) {
    const livingHeroes = () => heroes.filter((h) => h.hp > 0);
    if (livingHeroes().length === 0) {
      outcome = 'WIPE';
      break;
    }
    if (currentTimeMs >= maxSimulationMs) {
      outcome = 'TIMEOUT';
      break;
    }

    pushEvent(room.roomNumber, {
      type: 'ROOM_ENTER',
      message: `Entered Room ${room.roomNumber}: ${room.roomName} [${room.roomType}].`,
    });

    // Apply Sanctuary Mist between-room heal (for Room 2+) & reset opening-strike flags + Juggernaut room shields
    for (const hero of livingHeroes()) {
      hero.usedOpeningStrikeInRoom = false;

      if (room.roomNumber > 1 && partyBuffs.betweenRoomHealMaxHpPct > 0 && hero.hp < hero.maxHp) {
        const healAmt = Math.round(hero.maxHp * partyBuffs.betweenRoomHealMaxHpPct);
        const actualHeal = Math.min(hero.maxHp - hero.hp, healAmt);
        if (actualHeal > 0) {
          hero.hp += actualHeal;
          hero.summary.totalHealingDone += actualHeal;
          pushEvent(room.roomNumber, {
            type: 'HEAL',
            targetId: hero.characterId,
            targetName: hero.name,
            amount: actualHeal,
            targetRemainingHp: hero.hp,
            message: `Sanctuary Mist restored ${actualHeal} HP to ${hero.name}.`,
          });
        }
      }

      if (hero.openingShieldMaxHpPct > 0) {
        const shield = Math.round(hero.maxHp * hero.openingShieldMaxHpPct);
        hero.shieldHp = Math.max(hero.shieldHp, shield);
        pushEvent(room.roomNumber, {
          type: 'SHIELD_APPLIED',
          actorId: hero.characterId,
          actorName: hero.name,
          targetId: hero.characterId,
          targetName: hero.name,
          amount: shield,
          message: `${hero.name}'s Unstoppable Juggernaut granted a ${shield} HP barrier.`,
        });
      }

      // Boss Phase Live Workout Buff: Titanic Force Damage Shield!
      if (room.roomType === 'BOSS' && partyBuffs.bossShieldMaxHpPct > 0) {
        const bossShield = Math.round(hero.maxHp * partyBuffs.bossShieldMaxHpPct);
        hero.shieldHp += bossShield;
        pushEvent(room.roomNumber, {
          type: 'SHIELD_APPLIED',
          targetId: hero.characterId,
          targetName: hero.name,
          amount: bossShield,
          message: `Titanic Force granted ${hero.name} a ${bossShield} HP Boss Phase damage shield!`,
        });
      }
    }

    // Handle HAZARD_EVENT Room
    if (room.roomType === 'HAZARD_EVENT' && room.hazardConfig) {
      currentTimeMs += tickIntervalMs * 2;
      const haz = room.hazardConfig;
      for (const hero of livingHeroes()) {
        const mitigatedDmg = Math.max(
          1,
          Math.round(haz.baseDamage * (1 - hero.hazardResistancePct))
        );
        const prevented = Math.max(0, haz.baseDamage - mitigatedDmg);
        hero.summary.totalDamageMitigated += prevented;

        let dmgLeft = mitigatedDmg;
        let absorbed = 0;
        if (hero.shieldHp > 0) {
          absorbed = Math.min(hero.shieldHp, dmgLeft);
          hero.shieldHp -= absorbed;
          dmgLeft -= absorbed;
        }
        hero.hp = Math.max(0, hero.hp - dmgLeft);
        hero.stamina = Math.max(
          0,
          hero.stamina - Math.round(haz.staminaDrain * (1 - hero.hazardResistancePct * 0.5))
        );
        hero.summary.totalDamageTaken += dmgLeft;

        pushEvent(room.roomNumber, {
          type: 'HAZARD_RESOLVED',
          targetId: hero.characterId,
          targetName: hero.name,
          amount: dmgLeft,
          shieldAbsorbed: absorbed,
          targetRemainingHp: hero.hp,
          message: `${haz.hazardName} struck ${hero.name} for ${dmgLeft} damage (${Math.round(
            hero.hazardResistancePct * 100
          )}% resisted).`,
        });

        if (hero.hp === 0) {
          hero.summary.survived = false;
          pushEvent(room.roomNumber, {
            type: 'UNIT_DEFEATED',
            targetId: hero.characterId,
            targetName: hero.name,
            message: `${hero.name} succumbed to ${haz.hazardName}!`,
          });
        }
      }
    }

    // Handle Combat Encounters (MOB_ENCOUNTER or BOSS)
    const roomEnemies: SimEnemy[] = (room.enemies ?? []).map((tmpl, idx) => ({
      instanceId: `${tmpl.enemyId}_${room.roomNumber}_${idx + 1}`,
      name: tmpl.name,
      isBoss: Boolean(tmpl.isBoss || room.roomType === 'BOSS'),
      enraged: false,
      maxHp: tmpl.maxHp,
      hp: tmpl.maxHp,
      attackPower: tmpl.attackPower,
      armor: tmpl.armor,
      attackIntervalMs: Math.max(400, Math.round(tmpl.attackIntervalSeconds * 1000)),
      dodgeChance: clamp(tmpl.dodgeChance ?? 0.03, 0, 0.40),
      cleaveTargets: Math.max(1, tmpl.cleaveTargets ?? 1),
      nextAttackAtMs: currentTimeMs + 600 + idx * 150,
      bleeds: [],
    }));

    // Reset hero attack timers to current room clock if behind
    for (const hero of livingHeroes()) {
      if (hero.nextBasicAttackAtMs < currentTimeMs) {
        hero.nextBasicAttackAtMs = currentTimeMs + 250;
      }
    }

    let lastAuraTickMs = currentTimeMs;

    while (
      roomEnemies.some((e) => e.hp > 0) &&
      livingHeroes().length > 0 &&
      currentTimeMs < maxSimulationMs
    ) {
      currentTimeMs += tickIntervalMs;

      // 1. Party Sustain Auras (every 1000ms)
      if (currentTimeMs - lastAuraTickMs >= 1000) {
        lastAuraTickMs = currentTimeMs;
        for (const hero of livingHeroes()) {
          hero.stamina = Math.min(
            hero.maxStamina,
            hero.stamina + partyAuraStaminaRegenPerSec
          );
          if (partyAuraHpRegenPctPerSec > 0 && hero.hp < hero.maxHp) {
            const regen = Math.max(1, Math.round(hero.maxHp * partyAuraHpRegenPctPerSec));
            const healed = Math.min(hero.maxHp - hero.hp, regen);
            if (healed > 0) {
              hero.hp += healed;
              pushEvent(room.roomNumber, {
                type: 'AURA_REGEN',
                targetId: hero.characterId,
                targetName: hero.name,
                amount: healed,
                targetRemainingHp: hero.hp,
                message: `Renewal Aura restored ${healed} HP to ${hero.name}.`,
              });
            }
          }
        }
      }

      // 2. Process Bleed DoT Ticks on Enemies
      for (const enemy of roomEnemies) {
        if (enemy.hp <= 0) continue;
        for (const bleed of enemy.bleeds) {
          if (bleed.ticksRemaining > 0 && currentTimeMs >= bleed.nextTickAtMs && enemy.hp > 0) {
            bleed.ticksRemaining -= 1;
            bleed.nextTickAtMs += 1000;
            const dmg = Math.min(enemy.hp, bleed.damagePerTick);
            enemy.hp -= dmg;
            const srcHero = heroes.find((h) => h.characterId === bleed.sourceHeroId);
            if (srcHero) {
              srcHero.summary.totalDamageDealt += dmg;
            }
            pushEvent(room.roomNumber, {
              type: 'BLEED_TICK',
              actorId: bleed.sourceHeroId,
              actorName: bleed.sourceHeroName,
              targetId: enemy.instanceId,
              targetName: enemy.name,
              amount: dmg,
              targetRemainingHp: enemy.hp,
              message: `${enemy.name} suffered ${dmg} bleed damage from ${bleed.sourceHeroName}.`,
            });
            if (enemy.hp <= 0) {
              if (srcHero) {
                srcHero.summary.killsSecured += 1;
                if (srcHero.resetCooldownOnKill) {
                  for (const skId of Object.keys(srcHero.skillReadyAtMs)) {
                    srcHero.skillReadyAtMs[skId] = currentTimeMs;
                  }
                }
              }
              pushEvent(room.roomNumber, {
                type: 'UNIT_DEFEATED',
                actorId: bleed.sourceHeroId,
                actorName: bleed.sourceHeroName,
                targetId: enemy.instanceId,
                targetName: enemy.name,
                message: `${enemy.name} bled out!`,
              });
            }
          }
        }
        enemy.bleeds = enemy.bleeds.filter((b) => b.ticksRemaining > 0);
      }

      // 3. Hero Actions (Skills & Basic Attacks)
      for (const hero of livingHeroes()) {
        const aliveEnemies = roomEnemies.filter((e) => e.hp > 0);
        if (aliveEnemies.length === 0) break;

        // Check off-cooldown Active Skills first
        for (const skill of hero.skills) {
          const readyAt = hero.skillReadyAtMs[skill.skillId] ?? 0;
          const staminaCost = Math.round(skill.staminaCost * (1 - hero.staminaCostReductionPct));

          if (currentTimeMs >= readyAt && hero.stamina >= staminaCost) {
            if (skill.targetType === 'PARTY_HEAL') {
              const injuredAllies = livingHeroes()
                .filter((ally) => ally.hp < ally.maxHp * 0.88)
                .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
              const healTarget = injuredAllies[0];
              if (!healTarget) continue;

              hero.stamina -= staminaCost;
              const cdMs = Math.round(
                skill.cooldownSeconds * 1000 * (1 - hero.cooldownHastePct)
              );
              hero.skillReadyAtMs[skill.skillId] = currentTimeMs + Math.max(1500, cdMs);

              const rawHeal =
                healTarget.maxHp * (skill.healMaxHpPct ?? 0.18) * (1 + hero.healingPowerPct);
              const actualHeal = Math.min(
                healTarget.maxHp - healTarget.hp,
                Math.max(1, Math.round(rawHeal))
              );
              healTarget.hp += actualHeal;
              hero.summary.totalHealingDone += actualHeal;

              pushEvent(room.roomNumber, {
                type: 'SKILL_CAST',
                actorId: hero.characterId,
                actorName: hero.name,
                targetId: healTarget.characterId,
                targetName: healTarget.name,
                skillId: skill.skillId,
                skillName: skill.name,
                amount: actualHeal,
                targetRemainingHp: healTarget.hp,
                message: `${hero.name} cast ${skill.name}, healing ${healTarget.name} for ${actualHeal} HP.`,
              });
              continue;
            }

            // Offensive Active Skill
            hero.stamina -= staminaCost;
            const cdMs = Math.round(skill.cooldownSeconds * 1000 * (1 - hero.cooldownHastePct));
            hero.skillReadyAtMs[skill.skillId] = currentTimeMs + Math.max(1500, cdMs);

            if (skill.selfShieldMaxHpPct) {
              const shieldGain = Math.round(hero.maxHp * skill.selfShieldMaxHpPct);
              hero.shieldHp += shieldGain;
              pushEvent(room.roomNumber, {
                type: 'SHIELD_APPLIED',
                actorId: hero.characterId,
                actorName: hero.name,
                targetId: hero.characterId,
                targetName: hero.name,
                amount: shieldGain,
                message: `${hero.name} gained a ${shieldGain} HP shield from ${skill.name}.`,
              });
            }

            if (skill.tauntDurationSeconds) {
              hero.tauntUntilMs = currentTimeMs + skill.tauntDurationSeconds * 1000;
            }

            const targets =
              skill.targetType === 'CLEAVE_ENEMIES'
                ? aliveEnemies.slice(0, skill.maxTargets ?? 2)
                : [aliveEnemies[0]!];
            const hits = skill.hitCount ?? 1;

            for (const target of targets) {
              for (let h = 0; h < hits; h++) {
                if (target.hp <= 0) break;
                const isCrit = rng.chance(hero.critChance + (skill.bonusCritChance ?? 0));
                const effEnemyArmor = Math.max(0, target.armor * (1 - hero.armorPenetrationPct));
                const armorReduction = 100 / (100 + effEnemyArmor);
                let dmg = hero.meleePower * skill.damageMultiplier * armorReduction;

                if (!hero.usedOpeningStrikeInRoom && hero.openingStrikeBonusPct > 0) {
                  dmg *= 1 + hero.openingStrikeBonusPct;
                  hero.usedOpeningStrikeInRoom = true;
                }
                if (isCrit) {
                  dmg *= hero.critMultiplier;
                  hero.summary.critsLanded += 1;
                }

                const finalDmg = Math.min(target.hp, Math.max(1, Math.round(dmg)));
                target.hp -= finalDmg;
                hero.summary.totalDamageDealt += finalDmg;

                pushEvent(room.roomNumber, {
                  type: 'SKILL_CAST',
                  actorId: hero.characterId,
                  actorName: hero.name,
                  targetId: target.instanceId,
                  targetName: target.name,
                  skillId: skill.skillId,
                  skillName: skill.name,
                  amount: finalDmg,
                  isCrit,
                  targetRemainingHp: target.hp,
                  message: `${hero.name} hit ${target.name} with ${skill.name} for ${finalDmg} damage${
                    isCrit ? ' (CRIT!)' : ''
                  }.`,
                });

                if (isCrit && hero.bleedMeleePctOnCrit > 0 && target.hp > 0) {
                  target.bleeds.push({
                    sourceHeroId: hero.characterId,
                    sourceHeroName: hero.name,
                    damagePerTick: Math.max(
                      1,
                      Math.round((hero.meleePower * hero.bleedMeleePctOnCrit) / 3)
                    ),
                    ticksRemaining: 3,
                    nextTickAtMs: currentTimeMs + 1000,
                  });
                }

                if (target.hp <= 0) {
                  hero.summary.killsSecured += 1;
                  if (hero.resetCooldownOnKill) {
                    for (const skId of Object.keys(hero.skillReadyAtMs)) {
                      hero.skillReadyAtMs[skId] = currentTimeMs;
                    }
                  }
                  pushEvent(room.roomNumber, {
                    type: 'UNIT_DEFEATED',
                    actorId: hero.characterId,
                    actorName: hero.name,
                    targetId: target.instanceId,
                    targetName: target.name,
                    message: `${hero.name} defeated ${target.name}!`,
                  });
                }
              }
            }
          }
        }

        // Basic Attack Swing
        const stillAliveEnemies = roomEnemies.filter((e) => e.hp > 0);
        if (stillAliveEnemies.length === 0) break;

        if (currentTimeMs >= hero.nextBasicAttackAtMs) {
          hero.nextBasicAttackAtMs = currentTimeMs + hero.attackIntervalMs;
          const target = stillAliveEnemies[0]!;

          if (!rng.chance(hero.accuracy) || rng.chance(target.dodgeChance)) {
            pushEvent(room.roomNumber, {
              type: 'DODGE',
              actorId: hero.characterId,
              actorName: hero.name,
              targetId: target.instanceId,
              targetName: target.name,
              message: `${target.name} evaded ${hero.name}'s attack.`,
            });
            continue;
          }

          const hasOpeningBonus = !hero.usedOpeningStrikeInRoom && hero.openingStrikeBonusPct > 0;
          const isCrit = hasOpeningBonus || rng.chance(hero.critChance);
          const effArmor = Math.max(0, target.armor * (1 - hero.armorPenetrationPct));
          const armorFactor = 100 / (100 + effArmor);

          let dmg = hero.meleePower * armorFactor;
          if (hasOpeningBonus) {
            dmg *= 1 + hero.openingStrikeBonusPct;
            hero.usedOpeningStrikeInRoom = true;
          }
          if (isCrit) {
            dmg *= hero.critMultiplier;
            hero.summary.critsLanded += 1;
          }

          const finalDmg = Math.min(target.hp, Math.max(1, Math.round(dmg)));
          target.hp -= finalDmg;
          hero.summary.totalDamageDealt += finalDmg;

          pushEvent(room.roomNumber, {
            type: 'BASIC_ATTACK',
            actorId: hero.characterId,
            actorName: hero.name,
            targetId: target.instanceId,
            targetName: target.name,
            amount: finalDmg,
            isCrit,
            targetRemainingHp: target.hp,
            message: `${hero.name} struck ${target.name} for ${finalDmg} damage${
              isCrit ? ' (CRIT!)' : ''
            }.`,
          });

          if (isCrit && hero.bleedMeleePctOnCrit > 0 && target.hp > 0) {
            target.bleeds.push({
              sourceHeroId: hero.characterId,
              sourceHeroName: hero.name,
              damagePerTick: Math.max(
                1,
                Math.round((hero.meleePower * hero.bleedMeleePctOnCrit) / 3)
              ),
              ticksRemaining: 3,
              nextTickAtMs: currentTimeMs + 1000,
            });
          }

          // Boss Phase Transition Check (< 50% HP)
          if (target.isBoss && !target.enraged && target.hp > 0 && target.hp <= target.maxHp * 0.5) {
            target.enraged = true;
            target.attackPower = Math.round(target.attackPower * 1.25);
            pushEvent(room.roomNumber, {
              type: 'BOSS_PHASE_SHIFT',
              actorId: target.instanceId,
              actorName: target.name,
              message: `${target.name} entered Phase 2 Frenzy (+25% Attack Power)!`,
            });
          }

          if (target.hp <= 0) {
            hero.summary.killsSecured += 1;
            if (hero.resetCooldownOnKill) {
              for (const skId of Object.keys(hero.skillReadyAtMs)) {
                hero.skillReadyAtMs[skId] = currentTimeMs;
              }
            }
            pushEvent(room.roomNumber, {
              type: 'UNIT_DEFEATED',
              actorId: hero.characterId,
              actorName: hero.name,
              targetId: target.instanceId,
              targetName: target.name,
              message: `${hero.name} slew ${target.name}!`,
            });
          }
        }
      }

      // 4. Enemy Attacks (Targeting via Threat / Taunt)
      for (const enemy of roomEnemies) {
        if (enemy.hp <= 0) continue;
        const aliveParty = livingHeroes();
        if (aliveParty.length === 0) break;

        if (currentTimeMs >= enemy.nextAttackAtMs) {
          enemy.nextAttackAtMs = currentTimeMs + enemy.attackIntervalMs;

          // Prioritize taunting heroes, otherwise weighted threat selection
          const taunters = aliveParty.filter((h) => h.tauntUntilMs > currentTimeMs);
          const candidatePool = taunters.length > 0 ? taunters : aliveParty;

          const selectedTargets: SimHero[] = [];
          const poolCopy = [...candidatePool];
          const maxTargets = Math.min(enemy.cleaveTargets, poolCopy.length);

          for (let t = 0; t < maxTargets; t++) {
            const picked = rng.pickWeighted(
              poolCopy.map((hero) => ({ hero, weight: hero.threatWeight }))
            ).hero;
            selectedTargets.push(picked);
            const idx = poolCopy.indexOf(picked);
            if (idx >= 0) poolCopy.splice(idx, 1);
          }

          for (const targetHero of selectedTargets) {
            if (targetHero.hp <= 0) continue;

            if (rng.chance(targetHero.dodgeChance)) {
              targetHero.summary.dodgesTriggered += 1;
              pushEvent(room.roomNumber, {
                type: 'DODGE',
                actorId: enemy.instanceId,
                actorName: enemy.name,
                targetId: targetHero.characterId,
                targetName: targetHero.name,
                message: `${targetHero.name} dodged ${enemy.name}'s strike!`,
              });
              continue;
            }

            const armorMitigation = 100 / (100 + targetHero.armor);
            const afterArmorAndDR =
              enemy.attackPower * armorMitigation * (1 - targetHero.damageMitigationPct);
            const mitigatedDmg = Math.max(1, Math.round(afterArmorAndDR));
            const prevented = Math.max(0, enemy.attackPower - mitigatedDmg);
            targetHero.summary.totalDamageMitigated += prevented;

            let dmgLeft = mitigatedDmg;
            let shieldAbsorbed = 0;
            if (targetHero.shieldHp > 0) {
              shieldAbsorbed = Math.min(targetHero.shieldHp, dmgLeft);
              targetHero.shieldHp -= shieldAbsorbed;
              dmgLeft -= shieldAbsorbed;
            }

            targetHero.hp = Math.max(0, targetHero.hp - dmgLeft);
            targetHero.summary.totalDamageTaken += dmgLeft;

            pushEvent(room.roomNumber, {
              type: 'BASIC_ATTACK',
              actorId: enemy.instanceId,
              actorName: enemy.name,
              targetId: targetHero.characterId,
              targetName: targetHero.name,
              amount: dmgLeft,
              shieldAbsorbed,
              targetRemainingHp: targetHero.hp,
              message: `${enemy.name} hit ${targetHero.name} for ${dmgLeft} damage${
                shieldAbsorbed > 0 ? ` (${shieldAbsorbed} absorbed by shield)` : ''
              }.`,
            });

            if (targetHero.hp === 0) {
              targetHero.summary.survived = false;
              pushEvent(room.roomNumber, {
                type: 'UNIT_DEFEATED',
                actorId: enemy.instanceId,
                actorName: enemy.name,
                targetId: targetHero.characterId,
                targetName: targetHero.name,
                message: `${targetHero.name} has fallen in battle!`,
              });
            }
          }
        }
      }
    }

    // Check why the room ended
    if (livingHeroes().length === 0) {
      outcome = 'WIPE';
      break;
    }
    if (roomEnemies.some((e) => e.hp > 0) && currentTimeMs >= maxSimulationMs) {
      outcome = 'TIMEOUT';
      break;
    }

    // Room Cleared! Award Room Gold & Deterministic Loot Rolls
    roomsCleared += 1;
    const roomGold = Math.round((room.guaranteedGold ?? 25) * (1 + partyLootBonusPct));
    totalGoldEarned += roomGold;

    const lootRolls = room.lootRolls ?? (room.lootTable && room.lootTable.length > 0 ? 1 : 0);
    if (room.lootTable && room.lootTable.length > 0 && lootRolls > 0) {
      for (let r = 0; r < lootRolls; r++) {
        const picked = rng.pickWeighted(room.lootTable);
        const bonusQty =
          partyLootBonusPct > 0 && rng.chance(partyLootBonusPct) ? 1 : 0;
        let drop: LootDrop = {
          itemSlug: picked.itemSlug,
          itemName: picked.itemName,
          rarity: picked.rarity,
          quantity: picked.quantity + bonusQty,
        };

        if (BASE_EQUIPPABLE_ITEM_BY_SLUG[picked.itemSlug]) {
          const dungeonRank = input.dungeon.requiredRank ?? 'COPPER';
          const isBossRoom =
            room.roomType === 'BOSS' ||
            (room.roomType === 'LOOT_CHEST' && room.roomNumber === input.dungeon.rooms.length);
          const roll = rng.nextFloat();
          let tier: ItemTier = 1;

          if (dungeonRank === 'COPPER') {
            tier = isBossRoom && roll < 0.4 ? 2 : 1;
          } else if (dungeonRank === 'IRON') {
            tier = isBossRoom ? (roll < 0.6 ? 3 : 2) : roll < 0.5 ? 2 : 1;
          } else if (dungeonRank === 'BRONZE') {
            tier = isBossRoom ? (roll < 0.5 ? 4 : 3) : roll < 0.6 ? 3 : 2;
          } else if (dungeonRank === 'SILVER') {
            if (isBossRoom && roll < 0.15) {
              tier = 5;
            } else {
              tier = isBossRoom ? 4 : roll < 0.6 ? 3 : 4;
            }
          } else {
            // GOLD
            if (isBossRoom && roll < 0.35) {
              tier = 5;
            } else {
              tier = isBossRoom ? 4 : roll < 0.5 ? 3 : 4;
            }
          }

          const rolledGear = rollProceduralItemInstance({
            baseSlug: picked.itemSlug,
            tier,
            seed: `${input.seed}:${room.roomNumber}:${r}:${picked.itemSlug}`,
          });

          drop = {
            ...proceduralItemToLootDrop(rolledGear),
            quantity: 1 + bonusQty,
          };
        }
        mergeLootDrop(drop);
        pushEvent(room.roomNumber, {
          type: 'LOOT_DROP',
          loot: drop,
          message: `Party looted ${drop.quantity}x ${drop.itemName} [${drop.rarity}]!`,
        });
      }
    }

    pushEvent(room.roomNumber, {
      type: 'ROOM_CLEARED',
      goldAwarded: roomGold,
      message: `Cleared Room ${room.roomNumber}: ${room.roomName} (+${roomGold} gold).`,
    });
  }

  for (const hero of heroes) {
    hero.summary.finalHp = hero.hp;
    hero.summary.survived = hero.hp > 0;
  }

  pushEvent(roomsCleared, {
    type: 'EXPEDITION_END',
    goldAwarded: totalGoldEarned,
    message:
      outcome === 'VICTORY'
        ? `Expedition Victory! Cleared all ${roomsCleared}/${input.dungeon.rooms.length} rooms.`
        : `Expedition ended with ${outcome} after clearing ${roomsCleared}/${input.dungeon.rooms.length} rooms.`,
  });

  return {
    engineVersion: '1.0.0',
    seed: input.seed,
    dungeonSlug: input.dungeon.dungeonSlug,
    outcome,
    roomsCleared,
    totalRooms: input.dungeon.rooms.length,
    totalDurationMs: currentTimeMs,
    tickIntervalMs,
    totalGoldEarned,
    lootDrops: collectedLoot,
    partySummaries: heroes.map((h) => h.summary),
    events,
  };
}

// ============================================================================
// ADVENTURER RANK PROGRESSION & DEFAULT EXPEDITION CATALOG
// ============================================================================

export const ADVENTURER_RANK_ORDER: readonly DungeonRequiredRank[] = [
  'COPPER',
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'MYTHIC',
] as const;

export function isAdventurerRankSufficient(
  playerRank: string,
  requiredRank: string
): boolean {
  const pIdx = ADVENTURER_RANK_ORDER.indexOf(playerRank.toUpperCase() as DungeonRequiredRank);
  const rIdx = ADVENTURER_RANK_ORDER.indexOf(requiredRank.toUpperCase() as DungeonRequiredRank);
  if (pIdx === -1 || rIdx === -1) return true;
  return pIdx >= rIdx;
}

export const DEFAULT_DUNGEON_CATALOG: readonly DungeonDefinition[] = [
  // --------------------------------------------------------------------------
  // 1. COPPER RANK — Obsidian Catacombs (4 Rooms)
  // Calibrated so a solo hero with avg stat level ~3 can clear all 4 rooms.
  // Pre-Boss rooms grant ~21% of gold + minor salvage; Boss + Reliquary grant ~79% + main spoils.
  // --------------------------------------------------------------------------
  {
    dungeonSlug: 'obsidian_catacombs',
    dungeonName: 'Obsidian Catacombs',
    description:
      '24-hour undead crypt for 1-5 adventurers. Balanced for solo Lv.3+ heroes or early parties.',
    requiredRank: 'COPPER',
    recommendedPower: 75,
    rewardMultiplierLabel: '1.0x Spoils',
    themeLabel: 'Undead Crypt',
    maxSimulationSeconds: 300,
    rooms: [
      {
        roomNumber: 1,
        roomName: 'Crypt Gatehouse',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 40,
        lootRolls: 1,
        enemies: [
          {
            enemyId: 'skeleton_vanguard',
            name: 'Skeletal Vanguard',
            maxHp: 95,
            attackPower: 11,
            armor: 6,
            attackIntervalSeconds: 2.0,
          },
          {
            enemyId: 'crypt_archer',
            name: 'Crypt Bone-Archer',
            maxHp: 70,
            attackPower: 12,
            armor: 3,
            attackIntervalSeconds: 1.7,
          },
        ],
        lootTable: [
          {
            itemSlug: 'iron_ore_cluster',
            itemName: 'Rich Iron Ore Cluster',
            rarity: 'COMMON',
            quantity: 1,
            weight: 100,
          },
        ],
      },
      {
        roomNumber: 2,
        roomName: 'Hall of Pendulum Blades',
        roomType: 'HAZARD_EVENT',
        guaranteedGold: 35,
        hazardConfig: {
          hazardName: 'Swinging Obsidian Blades',
          baseDamage: 24,
          staminaDrain: 10,
        },
      },
      {
        roomNumber: 3,
        roomName: 'Sanctum of Bone Lord Malakor',
        roomType: 'BOSS',
        guaranteedGold: 185,
        lootRolls: 2,
        enemies: [
          {
            enemyId: 'bone_lord_malakor',
            name: 'Bone Lord Malakor',
            isBoss: true,
            maxHp: 240,
            attackPower: 18,
            armor: 10,
            attackIntervalSeconds: 1.85,
            cleaveTargets: 2,
          },
        ],
        lootTable: [
          {
            itemSlug: 'malakor_signet',
            itemName: "Malakor's Signet Ring",
            rarity: 'EPIC',
            quantity: 1,
            weight: 35,
          },
          {
            itemSlug: 'obsidian_ingot',
            itemName: 'Obsidian Steel Ingot',
            rarity: 'UNCOMMON',
            quantity: 3,
            weight: 65,
          },
        ],
      },
      {
        roomNumber: 4,
        roomName: 'Sunken Reliquary Chest',
        roomType: 'LOOT_CHEST',
        guaranteedGold: 90,
        lootRolls: 1,
        lootTable: [
          {
            itemSlug: 'obsidian_ingot',
            itemName: 'Obsidian Steel Ingot',
            rarity: 'UNCOMMON',
            quantity: 2,
            weight: 70,
          },
          {
            itemSlug: 'vitality_elixir',
            itemName: 'Elixir of Peak Output',
            rarity: 'RARE',
            quantity: 1,
            weight: 30,
          },
        ],
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 2. IRON RANK — Bloodfang Warcamp (6 Rooms)
  // Scaled smoothly from Tier 1 (~1.45x step). Pre-Boss = 25% Gold, Boss+Chest = 75% Gold.
  // --------------------------------------------------------------------------
  {
    dungeonSlug: 'bloodfang_warcamp',
    dungeonName: 'Bloodfang Warcamp',
    description:
      'Orcish stronghold fortified with brutal barricades and heavy cleaving berserkers.',
    requiredRank: 'IRON',
    recommendedPower: 120,
    rewardMultiplierLabel: '1.5x Spoils',
    themeLabel: 'Orcish Stronghold',
    maxSimulationSeconds: 450,
    rooms: [
      {
        roomNumber: 1,
        roomName: 'Bloodfang Outer Perimeter',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 35,
        enemies: [
          {
            enemyId: 'bloodfang_raider_1',
            name: 'Bloodfang Orc Raider',
            maxHp: 135,
            attackPower: 15,
            armor: 10,
            attackIntervalSeconds: 1.85,
          },
          {
            enemyId: 'orc_skirmisher_1',
            name: 'Orc Javelin Skirmisher',
            maxHp: 105,
            attackPower: 17,
            armor: 6,
            attackIntervalSeconds: 1.65,
          },
        ],
      },
      {
        roomNumber: 2,
        roomName: 'Barricaded Training Pit',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 40,
        lootRolls: 1,
        enemies: [
          {
            enemyId: 'ironjaw_brute_1',
            name: 'Ironjaw Orc Brute',
            maxHp: 175,
            attackPower: 18,
            armor: 12,
            attackIntervalSeconds: 2.0,
          },
          {
            enemyId: 'bloodfang_raider_2',
            name: 'Bloodfang Orc Raider',
            maxHp: 135,
            attackPower: 15,
            armor: 10,
            attackIntervalSeconds: 1.85,
          },
        ],
        lootTable: [
          {
            itemSlug: 'iron_ore_cluster',
            itemName: 'Rich Iron Ore Cluster',
            rarity: 'COMMON',
            quantity: 2,
            weight: 100,
          },
        ],
      },
      {
        roomNumber: 3,
        roomName: 'Spiked Barricade Gauntlet',
        roomType: 'HAZARD_EVENT',
        guaranteedGold: 35,
        hazardConfig: {
          hazardName: 'Spiked Barricade Punji Traps',
          baseDamage: 38,
          staminaDrain: 15,
        },
      },
      {
        roomNumber: 4,
        roomName: 'Warcamp Inner Yard',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 45,
        lootRolls: 1,
        enemies: [
          {
            enemyId: 'elite_berserker_1',
            name: 'Elite Orc Berserker',
            maxHp: 210,
            attackPower: 21,
            armor: 12,
            attackIntervalSeconds: 1.75,
          },
          {
            enemyId: 'orc_skirmisher_2',
            name: 'Orc Javelin Skirmisher',
            maxHp: 115,
            attackPower: 18,
            armor: 8,
            attackIntervalSeconds: 1.65,
          },
        ],
        lootTable: [
          {
            itemSlug: 'obsidian_ingot',
            itemName: 'Obsidian Steel Ingot',
            rarity: 'UNCOMMON',
            quantity: 1,
            weight: 100,
          },
        ],
      },
      {
        roomNumber: 5,
        roomName: "Warchief Goretooth's Pavilion",
        roomType: 'BOSS',
        guaranteedGold: 310,
        lootRolls: 2,
        enemies: [
          {
            enemyId: 'warchief_goretooth',
            name: 'Warchief Goretooth',
            isBoss: true,
            maxHp: 460,
            attackPower: 29,
            armor: 16,
            attackIntervalSeconds: 1.85,
            cleaveTargets: 2,
          },
        ],
        lootTable: [
          {
            itemSlug: 'ironbound_greatsword',
            itemName: 'Ironbound Greatsword',
            rarity: 'UNCOMMON',
            quantity: 1,
            weight: 50,
          },
          {
            itemSlug: 'obsidian_ingot',
            itemName: 'Obsidian Steel Ingot',
            rarity: 'UNCOMMON',
            quantity: 3,
            weight: 50,
          },
        ],
      },
      {
        roomNumber: 6,
        roomName: 'War-Spoils Cache',
        roomType: 'LOOT_CHEST',
        guaranteedGold: 165,
        lootRolls: 2,
        lootTable: [
          {
            itemSlug: 'obsidian_ingot',
            itemName: 'Obsidian Steel Ingot',
            rarity: 'UNCOMMON',
            quantity: 2,
            weight: 60,
          },
          {
            itemSlug: 'ironbound_greatsword',
            itemName: 'Ironbound Greatsword',
            rarity: 'UNCOMMON',
            quantity: 1,
            weight: 40,
          },
        ],
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 3. BRONZE RANK — Traitors' Garrison (8 Rooms)
  // Pre-Boss = 29% Gold, Boss + Chest = 71% Gold.
  // --------------------------------------------------------------------------
  {
    dungeonSlug: 'traitors_garrison',
    dungeonName: "Traitors' Garrison",
    description:
      'Renegade legion garrisoned in an old watchtower, fielding disciplined archers and duelists.',
    requiredRank: 'BRONZE',
    recommendedPower: 185,
    rewardMultiplierLabel: '2.2x Spoils',
    themeLabel: 'Renegade Legion',
    maxSimulationSeconds: 600,
    rooms: [
      {
        roomNumber: 1,
        roomName: 'Garrison Lower Bailey',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 45,
        enemies: [
          {
            enemyId: 'rogue_swordsman_1',
            name: 'Rogue Swordsman Duelist',
            maxHp: 185,
            attackPower: 22,
            armor: 14,
            attackIntervalSeconds: 1.6,
          },
          {
            enemyId: 'renegade_archer_1',
            name: 'Renegade Sharpshooter Archer',
            maxHp: 140,
            attackPower: 25,
            armor: 8,
            attackIntervalSeconds: 1.5,
          },
        ],
      },
      {
        roomNumber: 2,
        roomName: 'Outer Watch Ramparts',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 45,
        lootRolls: 1,
        enemies: [
          {
            enemyId: 'renegade_archer_2',
            name: 'Renegade Sharpshooter Archer',
            maxHp: 145,
            attackPower: 25,
            armor: 8,
            attackIntervalSeconds: 1.5,
          },
          {
            enemyId: 'rogue_knight_1',
            name: 'Rogue Knight Deserter',
            maxHp: 240,
            attackPower: 24,
            armor: 18,
            attackIntervalSeconds: 1.9,
          },
        ],
        lootTable: [
          {
            itemSlug: 'obsidian_ingot',
            itemName: 'Obsidian Steel Ingot',
            rarity: 'UNCOMMON',
            quantity: 1,
            weight: 100,
          },
        ],
      },
      {
        roomNumber: 3,
        roomName: 'Boiling Oil Murder-Holes',
        roomType: 'HAZARD_EVENT',
        guaranteedGold: 40,
        hazardConfig: {
          hazardName: 'Cascading Boiling Pitch',
          baseDamage: 52,
          staminaDrain: 20,
        },
      },
      {
        roomNumber: 4,
        roomName: 'Mess Hall Ambush',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 50,
        enemies: [
          {
            enemyId: 'rogue_swordsman_2',
            name: 'Rogue Swordsman Duelist',
            maxHp: 195,
            attackPower: 24,
            armor: 15,
            attackIntervalSeconds: 1.6,
          },
          {
            enemyId: 'rogue_swordsman_3',
            name: 'Rogue Swordsman Duelist',
            maxHp: 195,
            attackPower: 24,
            armor: 15,
            attackIntervalSeconds: 1.6,
          },
        ],
      },
      {
        roomNumber: 5,
        roomName: 'Knight Barracks',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 55,
        lootRolls: 1,
        enemies: [
          {
            enemyId: 'rogue_knight_2',
            name: 'Rogue Knight Deserter',
            maxHp: 260,
            attackPower: 26,
            armor: 20,
            attackIntervalSeconds: 1.9,
          },
          {
            enemyId: 'renegade_archer_3',
            name: 'Renegade Sharpshooter Archer',
            maxHp: 155,
            attackPower: 27,
            armor: 10,
            attackIntervalSeconds: 1.5,
          },
        ],
        lootTable: [
          {
            itemSlug: 'obsidian_ingot',
            itemName: 'Obsidian Steel Ingot',
            rarity: 'UNCOMMON',
            quantity: 2,
            weight: 100,
          },
        ],
      },
      {
        roomNumber: 6,
        roomName: 'High Keep Guardroom',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 60,
        enemies: [
          {
            enemyId: 'rogue_knight_3',
            name: 'Rogue Knight Deserter',
            maxHp: 275,
            attackPower: 28,
            armor: 22,
            attackIntervalSeconds: 1.85,
          },
          {
            enemyId: 'rogue_swordsman_4',
            name: 'Rogue Swordsman Duelist',
            maxHp: 210,
            attackPower: 26,
            armor: 16,
            attackIntervalSeconds: 1.6,
          },
        ],
      },
      {
        roomNumber: 7,
        roomName: 'Keep Tower: Fallen Commander Vane',
        roomType: 'BOSS',
        guaranteedGold: 460,
        lootRolls: 3,
        enemies: [
          {
            enemyId: 'commander_vane',
            name: 'Fallen Commander Vane',
            isBoss: true,
            maxHp: 780,
            attackPower: 42,
            armor: 24,
            attackIntervalSeconds: 1.75,
            cleaveTargets: 2,
          },
        ],
        lootTable: [
          {
            itemSlug: 'warden_chainmail',
            itemName: "Warden's Tempered Hauberk",
            rarity: 'RARE',
            quantity: 1,
            weight: 50,
          },
          {
            itemSlug: 'windrunner_daggers',
            itemName: 'Twin Windrunner Blades',
            rarity: 'RARE',
            quantity: 1,
            weight: 50,
          },
        ],
      },
      {
        roomNumber: 8,
        roomName: 'Garrison Armory Chest',
        roomType: 'LOOT_CHEST',
        guaranteedGold: 240,
        lootRolls: 2,
        lootTable: [
          {
            itemSlug: 'warden_chainmail',
            itemName: "Warden's Tempered Hauberk",
            rarity: 'RARE',
            quantity: 1,
            weight: 45,
          },
          {
            itemSlug: 'windrunner_daggers',
            itemName: 'Twin Windrunner Blades',
            rarity: 'RARE',
            quantity: 1,
            weight: 55,
          },
        ],
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 4. SILVER RANK — Blighted Ossuary (10 Rooms)
  // Pre-Boss = 31% Gold, Boss + Chest = 69% Gold.
  // --------------------------------------------------------------------------
  {
    dungeonSlug: 'blighted_ossuary',
    dungeonName: 'Blighted Ossuary',
    description:
      'Ancient subterranean necropolis teeming with cursed phalanxes and necrotic magic.',
    requiredRank: 'SILVER',
    recommendedPower: 270,
    rewardMultiplierLabel: '3.2x Spoils',
    themeLabel: 'Necromantic Citadel',
    maxSimulationSeconds: 750,
    rooms: [
      {
        roomNumber: 1,
        roomName: 'Ossuary Crypt Steps',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 50,
        enemies: [
          {
            enemyId: 'skeleton_phalanx_1',
            name: 'Ossuary Skeleton Phalanx',
            maxHp: 240,
            attackPower: 30,
            armor: 18,
            attackIntervalSeconds: 1.7,
          },
          {
            enemyId: 'bone_sniper_1',
            name: 'Bone-Sniper Archer',
            maxHp: 180,
            attackPower: 34,
            armor: 12,
            attackIntervalSeconds: 1.45,
          },
        ],
      },
      {
        roomNumber: 2,
        roomName: 'Chamber of Souls',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 55,
        enemies: [
          {
            enemyId: 'skeleton_executioner_1',
            name: 'Greatsword Skeleton Executioner',
            maxHp: 320,
            attackPower: 36,
            armor: 20,
            attackIntervalSeconds: 1.85,
          },
          {
            enemyId: 'bone_sniper_2',
            name: 'Bone-Sniper Archer',
            maxHp: 185,
            attackPower: 34,
            armor: 12,
            attackIntervalSeconds: 1.45,
          },
        ],
      },
      {
        roomNumber: 3,
        roomName: 'Mausoleum Avenue',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 60,
        lootRolls: 1,
        enemies: [
          {
            enemyId: 'skeleton_phalanx_2',
            name: 'Ossuary Skeleton Phalanx',
            maxHp: 255,
            attackPower: 32,
            armor: 18,
            attackIntervalSeconds: 1.7,
          },
          {
            enemyId: 'skeleton_phalanx_3',
            name: 'Ossuary Skeleton Phalanx',
            maxHp: 255,
            attackPower: 32,
            armor: 18,
            attackIntervalSeconds: 1.7,
          },
        ],
        lootTable: [
          {
            itemSlug: 'obsidian_ingot',
            itemName: 'Obsidian Steel Ingot',
            rarity: 'UNCOMMON',
            quantity: 2,
            weight: 100,
          },
        ],
      },
      {
        roomNumber: 4,
        roomName: 'Necrotic Miasma Vault',
        roomType: 'HAZARD_EVENT',
        guaranteedGold: 50,
        hazardConfig: {
          hazardName: 'Blighted Necrotic Fumes',
          baseDamage: 72,
          staminaDrain: 24,
        },
      },
      {
        roomNumber: 5,
        roomName: 'Tomb of the Forsaken',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 65,
        enemies: [
          {
            enemyId: 'skeleton_executioner_2',
            name: 'Greatsword Skeleton Executioner',
            maxHp: 340,
            attackPower: 38,
            armor: 22,
            attackIntervalSeconds: 1.85,
          },
          {
            enemyId: 'bone_sniper_3',
            name: 'Bone-Sniper Archer',
            maxHp: 195,
            attackPower: 36,
            armor: 12,
            attackIntervalSeconds: 1.45,
          },
        ],
      },
      {
        roomNumber: 6,
        roomName: 'Embalming Catacombs',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 70,
        enemies: [
          {
            enemyId: 'skeleton_phalanx_4',
            name: 'Ossuary Skeleton Phalanx',
            maxHp: 270,
            attackPower: 34,
            armor: 20,
            attackIntervalSeconds: 1.7,
          },
          {
            enemyId: 'skeleton_executioner_3',
            name: 'Greatsword Skeleton Executioner',
            maxHp: 350,
            attackPower: 39,
            armor: 22,
            attackIntervalSeconds: 1.85,
          },
        ],
      },
      {
        roomNumber: 7,
        roomName: 'Sepulcher of the Black Guard',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 75,
        lootRolls: 1,
        enemies: [
          {
            enemyId: 'skeleton_executioner_4',
            name: 'Greatsword Skeleton Executioner',
            maxHp: 365,
            attackPower: 40,
            armor: 24,
            attackIntervalSeconds: 1.8,
          },
          {
            enemyId: 'bone_sniper_4',
            name: 'Bone-Sniper Archer',
            maxHp: 210,
            attackPower: 38,
            armor: 14,
            attackIntervalSeconds: 1.45,
          },
        ],
        lootTable: [
          {
            itemSlug: 'vitality_elixir',
            itemName: 'Elixir of Peak Output',
            rarity: 'RARE',
            quantity: 1,
            weight: 100,
          },
        ],
      },
      {
        roomNumber: 8,
        roomName: 'Antechamber of the Arch-Lich',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 80,
        enemies: [
          {
            enemyId: 'skeleton_executioner_5',
            name: 'Greatsword Skeleton Executioner',
            maxHp: 380,
            attackPower: 42,
            armor: 24,
            attackIntervalSeconds: 1.8,
          },
          {
            enemyId: 'skeleton_phalanx_5',
            name: 'Ossuary Skeleton Phalanx',
            maxHp: 280,
            attackPower: 35,
            armor: 22,
            attackIntervalSeconds: 1.7,
          },
        ],
      },
      {
        roomNumber: 9,
        roomName: 'Sanctum Sanctorum: Arch-Lich Valerius',
        roomType: 'BOSS',
        guaranteedGold: 720,
        lootRolls: 3,
        enemies: [
          {
            enemyId: 'arch_lich_valerius',
            name: 'Arch-Lich Valerius & Dread Executioner',
            isBoss: true,
            maxHp: 1280,
            attackPower: 58,
            armor: 34,
            attackIntervalSeconds: 1.7,
            cleaveTargets: 3,
          },
        ],
        lootTable: [
          {
            itemSlug: 'malakor_signet',
            itemName: "Malakor's Signet Ring",
            rarity: 'EPIC',
            quantity: 1,
            weight: 60,
          },
          {
            itemSlug: 'raid_essence_crystal',
            itemName: 'Raid Boss Essence Crystal',
            rarity: 'RARE',
            quantity: 2,
            weight: 40,
          },
        ],
      },
      {
        roomNumber: 10,
        roomName: 'Ancient Ossuary Reliquary',
        roomType: 'LOOT_CHEST',
        guaranteedGold: 380,
        lootRolls: 2,
        lootTable: [
          {
            itemSlug: 'malakor_signet',
            itemName: "Malakor's Signet Ring",
            rarity: 'EPIC',
            quantity: 1,
            weight: 45,
          },
          {
            itemSlug: 'vitality_elixir',
            itemName: 'Elixir of Peak Output',
            rarity: 'RARE',
            quantity: 2,
            weight: 55,
          },
        ],
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 5. GOLD RANK — Hellforge Sanctum (12 Rooms)
  // Pre-Boss = 32% Gold, Boss + Chest = 68% Gold.
  // --------------------------------------------------------------------------
  {
    dungeonSlug: 'hellforge_sanctum',
    dungeonName: 'Hellforge Sanctum',
    description:
      'Infernal crucible where demonic lieutenants forge cataclysmic weapons in molten rivers.',
    requiredRank: 'GOLD',
    recommendedPower: 390,
    rewardMultiplierLabel: '4.5x Spoils',
    themeLabel: 'Abyssal Fortress',
    maxSimulationSeconds: 900,
    rooms: [
      {
        roomNumber: 1,
        roomName: 'Sanctum Magma Gates',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 60,
        enemies: [
          {
            enemyId: 'hellforge_orc_1',
            name: 'Hellforge Orc Hell-Guard',
            maxHp: 320,
            attackPower: 38,
            armor: 24,
            attackIntervalSeconds: 1.65,
          },
          {
            enemyId: 'hellforge_crossbow_1',
            name: 'Hell-Guard Crossbowman',
            maxHp: 230,
            attackPower: 42,
            armor: 14,
            attackIntervalSeconds: 1.4,
          },
        ],
      },
      {
        roomNumber: 2,
        roomName: 'Cinder Foundry Causeway',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 65,
        enemies: [
          {
            enemyId: 'dread_knight_skel_1',
            name: 'Hellforge Dread-Knight Skeleton',
            maxHp: 420,
            attackPower: 45,
            armor: 28,
            attackIntervalSeconds: 1.75,
          },
          {
            enemyId: 'hellforge_crossbow_2',
            name: 'Hell-Guard Crossbowman',
            maxHp: 235,
            attackPower: 42,
            armor: 14,
            attackIntervalSeconds: 1.4,
          },
        ],
      },
      {
        roomNumber: 3,
        roomName: 'Smelting Trenches',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 70,
        lootRolls: 1,
        enemies: [
          {
            enemyId: 'hellforge_orc_2',
            name: 'Hellforge Orc Hell-Guard',
            maxHp: 340,
            attackPower: 40,
            armor: 25,
            attackIntervalSeconds: 1.65,
          },
          {
            enemyId: 'dread_knight_skel_2',
            name: 'Hellforge Dread-Knight Skeleton',
            maxHp: 440,
            attackPower: 46,
            armor: 28,
            attackIntervalSeconds: 1.75,
          },
        ],
        lootTable: [
          {
            itemSlug: 'obsidian_ingot',
            itemName: 'Obsidian Steel Ingot',
            rarity: 'UNCOMMON',
            quantity: 2,
            weight: 100,
          },
        ],
      },
      {
        roomNumber: 4,
        roomName: 'Magma Eruption Bridge',
        roomType: 'HAZARD_EVENT',
        guaranteedGold: 60,
        hazardConfig: {
          hazardName: 'Volcanic Lava Geyser',
          baseDamage: 95,
          staminaDrain: 30,
        },
      },
      {
        roomNumber: 5,
        roomName: 'Demon Lieutenant Guardpost',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 75,
        enemies: [
          {
            enemyId: 'demon_lieutenant_1',
            name: 'Demon Boss Vanguard Lieutenant',
            maxHp: 560,
            attackPower: 54,
            armor: 32,
            attackIntervalSeconds: 1.65,
            cleaveTargets: 2,
          },
        ],
      },
      {
        roomNumber: 6,
        roomName: 'Brimstone Anvils',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 80,
        lootRolls: 1,
        enemies: [
          {
            enemyId: 'hellforge_orc_3',
            name: 'Hellforge Orc Hell-Guard',
            maxHp: 360,
            attackPower: 42,
            armor: 26,
            attackIntervalSeconds: 1.65,
          },
          {
            enemyId: 'dread_knight_skel_3',
            name: 'Hellforge Dread-Knight Skeleton',
            maxHp: 460,
            attackPower: 48,
            armor: 30,
            attackIntervalSeconds: 1.75,
          },
        ],
        lootTable: [
          {
            itemSlug: 'vitality_elixir',
            itemName: 'Elixir of Peak Output',
            rarity: 'RARE',
            quantity: 1,
            weight: 100,
          },
        ],
      },
      {
        roomNumber: 7,
        roomName: 'Crucible Core Approach',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 85,
        enemies: [
          {
            enemyId: 'dread_knight_skel_4',
            name: 'Hellforge Dread-Knight Skeleton',
            maxHp: 480,
            attackPower: 50,
            armor: 32,
            attackIntervalSeconds: 1.75,
          },
          {
            enemyId: 'hellforge_crossbow_3',
            name: 'Hell-Guard Crossbowman',
            maxHp: 250,
            attackPower: 46,
            armor: 16,
            attackIntervalSeconds: 1.4,
          },
        ],
      },
      {
        roomNumber: 8,
        roomName: 'Obsidian Ramparts',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 90,
        enemies: [
          {
            enemyId: 'hellforge_orc_4',
            name: 'Hellforge Orc Hell-Guard',
            maxHp: 380,
            attackPower: 44,
            armor: 28,
            attackIntervalSeconds: 1.65,
          },
          {
            enemyId: 'hellforge_orc_5',
            name: 'Hellforge Orc Hell-Guard',
            maxHp: 380,
            attackPower: 44,
            armor: 28,
            attackIntervalSeconds: 1.65,
          },
        ],
      },
      {
        roomNumber: 9,
        roomName: 'Demon Gatekeepers',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 95,
        lootRolls: 1,
        enemies: [
          {
            enemyId: 'demon_lieutenant_2',
            name: 'Demon Boss Vanguard Lieutenant',
            maxHp: 600,
            attackPower: 56,
            armor: 34,
            attackIntervalSeconds: 1.65,
            cleaveTargets: 2,
          },
        ],
        lootTable: [
          {
            itemSlug: 'raid_essence_crystal',
            itemName: 'Raid Boss Essence Crystal',
            rarity: 'RARE',
            quantity: 1,
            weight: 100,
          },
        ],
      },
      {
        roomNumber: 10,
        roomName: 'Inner Heart of the Crucible',
        roomType: 'MOB_ENCOUNTER',
        guaranteedGold: 100,
        enemies: [
          {
            enemyId: 'dread_knight_skel_5',
            name: 'Hellforge Dread-Knight Skeleton',
            maxHp: 500,
            attackPower: 52,
            armor: 34,
            attackIntervalSeconds: 1.75,
          },
          {
            enemyId: 'demon_lieutenant_3',
            name: 'Demon Boss Vanguard Lieutenant',
            maxHp: 620,
            attackPower: 58,
            armor: 34,
            attackIntervalSeconds: 1.65,
            cleaveTargets: 2,
          },
        ],
      },
      {
        roomNumber: 11,
        roomName: "Throne of Molten Agony: Ignisrax's Avatar",
        roomType: 'BOSS',
        guaranteedGold: 1100,
        lootRolls: 3,
        enemies: [
          {
            enemyId: 'ignisrax_avatar',
            name: "Ignisrax's Avatar, Abyssal Overlord",
            isBoss: true,
            maxHp: 1950,
            attackPower: 78,
            armor: 44,
            attackIntervalSeconds: 1.65,
            cleaveTargets: 3,
          },
        ],
        lootTable: [
          {
            itemSlug: 'crown_of_the_wyrm',
            itemName: 'Crown of the World Wyrm',
            rarity: 'MYTHIC',
            quantity: 1,
            weight: 30,
          },
          {
            itemSlug: 'raid_essence_crystal',
            itemName: 'Raid Boss Essence Crystal',
            rarity: 'RARE',
            quantity: 3,
            weight: 70,
          },
        ],
      },
      {
        roomNumber: 12,
        roomName: 'Mythic Hellforge Vault',
        roomType: 'LOOT_CHEST',
        guaranteedGold: 550,
        lootRolls: 3,
        lootTable: [
          {
            itemSlug: 'crown_of_the_wyrm',
            itemName: 'Crown of the World Wyrm',
            rarity: 'MYTHIC',
            quantity: 1,
            weight: 25,
          },
          {
            itemSlug: 'obsidian_ingot',
            itemName: 'Obsidian Steel Ingot',
            rarity: 'UNCOMMON',
            quantity: 5,
            weight: 45,
          },
          {
            itemSlug: 'raid_essence_crystal',
            itemName: 'Raid Boss Essence Crystal',
            rarity: 'RARE',
            quantity: 2,
            weight: 30,
          },
        ],
      },
    ],
  },
];

