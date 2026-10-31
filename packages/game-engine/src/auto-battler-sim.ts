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

export interface DungeonDefinition {
  dungeonSlug: string;
  dungeonName: string;
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
        const drop: LootDrop = {
          itemSlug: picked.itemSlug,
          itemName: picked.itemName,
          rarity: picked.rarity,
          quantity: picked.quantity + bonusQty,
        };
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
