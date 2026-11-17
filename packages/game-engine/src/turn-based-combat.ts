import {
  DungeonEnemyTemplate,
  DungeonRequiredRank,
  WeightedDungeonLoot,
  isAdventurerRankSufficient,
} from './auto-battler-sim';
import { CharacterCustomizationConfig, CharacterRace } from './character-customization';
import { EquipmentLoadoutMap, calculateDerivedCombatStats } from './character-loadout-spoils';
import { getSystemicFatigueCombatPenalties } from './fatigue-manager';
import { PrimaryStatBonuses } from './item-affix-engine';
import { SeededRng, createSeededRng } from './rng';
import {
  ActiveTalentSkillDefinition,
  DEFAULT_TALENT_TREES,
  TalentTreeDefinition,
  aggregateTalentModifiers,
} from './talent-engine';
import {
  CoreStatBlock,
  EquipmentStatBonuses,
  ItemRarity,
  LootDrop,
  normalizeCoreStatBlock,
} from './types';

// ============================================================================
// 1. LOADOUT & CONSUMABLES
// ============================================================================

export const MAX_EQUIPPED_ACTIVE_SKILLS = 4;
export const MAX_BELT_SLOTS = 4;

export type CombatResourceType = 'STAMINA' | 'MANA';

export interface CombatConsumableDefinition {
  itemSlug: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  goldValue: number;
  healMaxHpPct?: number;
  restoreStamina?: number;
  restoreMana?: number;
  attackBuffPct?: number;
  buffDurationTurns?: number;
}

export const COMBAT_CONSUMABLE_CATALOG: readonly CombatConsumableDefinition[] = [
  {
    itemSlug: 'sunleaf_healing_draught',
    name: 'Sunleaf Healing Draught',
    description: 'Restores 35% of Max HP in tactical combat.',
    rarity: 'COMMON',
    goldValue: 35,
    healMaxHpPct: 0.35,
  },
  {
    itemSlug: 'vitality_elixir',
    name: 'Elixir of Peak Output',
    description: 'Restores 40 Stamina and 15% of Max HP immediately.',
    rarity: 'RARE',
    goldValue: 85,
    restoreStamina: 40,
    healMaxHpPct: 0.15,
  },
  {
    itemSlug: 'astral_mana_tonic',
    name: 'Astral Clarity Tonic',
    description: 'Restores 40 Mana to fuel spellcraft and healing skills.',
    rarity: 'UNCOMMON',
    goldValue: 55,
    restoreMana: 40,
  },
  {
    itemSlug: 'tempered_whetstone',
    name: 'Tempered Whetstone',
    description: 'Sharpens weapon edge for +25% attack damage for 3 turns.',
    rarity: 'UNCOMMON',
    goldValue: 50,
    attackBuffPct: 0.25,
    buffDurationTurns: 3,
  },
];

export const COMBAT_CONSUMABLE_BY_SLUG: Readonly<Record<string, CombatConsumableDefinition>> =
  COMBAT_CONSUMABLE_CATALOG.reduce<Record<string, CombatConsumableDefinition>>((acc, item) => {
    acc[item.itemSlug] = item;
    return acc;
  }, {});

function findSkillEntry(
  skillId: string,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): { tree: TalentTreeDefinition; skill: ActiveTalentSkillDefinition } | null {
  for (const tree of trees) {
    for (const node of tree.nodes) {
      if (node.activeSkill && node.activeSkill.skillId === skillId) {
        return { tree, skill: node.activeSkill };
      }
    }
  }
  return null;
}

export function getSkillResourceType(
  skillId: string,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): CombatResourceType {
  const entry = findSkillEntry(skillId, trees);
  if (!entry) return 'STAMINA';
  if (
    entry.skill.resourceType === 'MANA' ||
    entry.tree.governingStat === 'WISDOM' ||
    entry.tree.governingStat === 'SPIRIT'
  ) {
    return 'MANA';
  }
  return 'STAMINA';
}

export function getSkillResourceCost(
  skill: ActiveTalentSkillDefinition,
  staminaCostReductionPct = 0,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): { resourceType: CombatResourceType; cost: number; cooldownTurns: number } {
  const treeResource = getSkillResourceType(skill.skillId, trees);
  const resourceType: CombatResourceType =
    skill.resourceType === 'MANA' || treeResource === 'MANA' ? 'MANA' : 'STAMINA';
  const rawCost = resourceType === 'MANA' ? (skill.manaCost ?? skill.staminaCost) : skill.staminaCost;
  const clampedReduction = Math.min(0.6, Math.max(0, staminaCostReductionPct));
  const cost = Math.max(1, Math.round(rawCost * (1 - clampedReduction)));
  const cooldownTurns = skill.cooldownTurns ?? Math.max(2, Math.round(skill.cooldownSeconds / 3));
  return { resourceType, cost, cooldownTurns };
}

export function sanitizeActiveSkillLoadout(
  activeSkillIds: unknown,
  unlockedTalentRanks: Record<string, number>,
  trees: readonly TalentTreeDefinition[] = DEFAULT_TALENT_TREES
): string[] {
  if (!Array.isArray(activeSkillIds)) return [];
  const aggregated = aggregateTalentModifiers(unlockedTalentRanks, trees);
  const unlockedSet = new Set(aggregated.unlockedSkills.map((s) => s.skillId));
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const rawId of activeSkillIds) {
    if (typeof rawId !== 'string') continue;
    if (!unlockedSet.has(rawId) || seen.has(rawId)) continue;
    seen.add(rawId);
    sanitized.push(rawId);
    if (sanitized.length >= MAX_EQUIPPED_ACTIVE_SKILLS) break;
  }

  return sanitized;
}

export function sanitizeBeltLoadout(beltConsumables: unknown): Array<string | null> {
  const result: Array<string | null> = [null, null, null, null];
  if (!Array.isArray(beltConsumables)) return result;

  for (let i = 0; i < MAX_BELT_SLOTS; i++) {
    const raw = beltConsumables[i];
    if (typeof raw === 'string' && COMBAT_CONSUMABLE_BY_SLUG[raw]) {
      result[i] = raw;
    } else {
      result[i] = null;
    }
  }
  return result;
}

export function validateCombatLoadout(params: {
  activeSkillIds: readonly string[];
  beltConsumables: ReadonlyArray<string | null>;
  unlockedTalentRanks: Record<string, number>;
  trees?: readonly TalentTreeDefinition[];
}): {
  valid: boolean;
  errors: string[];
  sanitizedSkillIds: string[];
  sanitizedBeltSlugs: Array<string | null>;
} {
  const trees = params.trees ?? DEFAULT_TALENT_TREES;
  const errors: string[] = [];
  const aggregated = aggregateTalentModifiers(params.unlockedTalentRanks, trees);
  const unlockedSet = new Set(aggregated.unlockedSkills.map((s) => s.skillId));

  if (params.activeSkillIds.length > MAX_EQUIPPED_ACTIVE_SKILLS) {
    errors.push(`Cannot equip more than ${MAX_EQUIPPED_ACTIVE_SKILLS} active skills.`);
  }

  const seenSkills = new Set<string>();
  for (const skillId of params.activeSkillIds) {
    if (seenSkills.has(skillId)) {
      errors.push(`Duplicate active skill ID: ${skillId}.`);
    } else {
      seenSkills.add(skillId);
    }
    if (!unlockedSet.has(skillId)) {
      errors.push(`Active skill '${skillId}' is unknown or not unlocked.`);
    }
  }

  if (params.beltConsumables.length > MAX_BELT_SLOTS) {
    errors.push(`Belt cannot contain more than ${MAX_BELT_SLOTS} slots.`);
  }

  for (let i = 0; i < params.beltConsumables.length; i++) {
    const slug = params.beltConsumables[i];
    if (slug !== null && slug !== undefined && !COMBAT_CONSUMABLE_BY_SLUG[slug]) {
      errors.push(`Unknown belt consumable slug '${String(slug)}' at slot ${i}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedSkillIds: sanitizeActiveSkillLoadout(params.activeSkillIds, params.unlockedTalentRanks, trees),
    sanitizedBeltSlugs: sanitizeBeltLoadout(params.beltConsumables),
  };
}

// ============================================================================
// 2. TURN-BASED STATE MACHINE TYPES
// ============================================================================

export type CombatantSide = 'PARTY' | 'ENEMY';
export type CombatantController = 'PLAYER' | 'AI_COMPANION' | 'ENEMY';
export type StatusEffectType =
  | 'GUARDING'
  | 'TAUNT'
  | 'BLEED'
  | 'VULNERABLE'
  | 'SHARPENED'
  | 'FORTIFIED'
  | 'EVASION';

export interface CombatStatusEffect {
  type: StatusEffectType;
  remainingTurns: number;
  potency: number;
  sourceUnitId?: string;
}

export type EnemyIntentType = 'STRIKE' | 'HEAVY_SMASH' | 'CLEAVE' | 'GUARD_BUFF' | 'DEBUFF_HEX';

export interface EnemyIntentTelegraph {
  intentType: EnemyIntentType;
  label: string;
  targetUnitId: string | null;
  estimatedDamage: number;
  appliesStatus?: StatusEffectType;
}

export interface BeltConsumableSlot {
  slotIndex: number;
  itemSlug: string | null;
  charges: number;
}

export interface EquippedTurnSkill extends ActiveTalentSkillDefinition {
  resourceType: CombatResourceType;
  resourceCost: number;
  cooldownTurns: number;
}

export interface TurnBasedCombatant {
  unitId: string;
  sourceId: string;
  name: string;
  side: CombatantSide;
  controller: CombatantController;
  ownerUserId?: string;
  isBoss?: boolean;
  race?: CharacterRace;
  appearanceId?: string;
  customizationConfig?: CharacterCustomizationConfig;
  equippedLoadout?: Partial<EquipmentLoadoutMap>;
  maxHp: number;
  hp: number;
  shield: number;
  maxStamina: number;
  stamina: number;
  maxMana: number;
  mana: number;
  meleePower: number;
  armor: number;
  agility: number;
  speed: number;
  turnGauge: number;
  damageMitigationPct: number;
  critChance: number;
  critMultiplier: number;
  dodgeChance: number;
  accuracy: number;
  armorPenetrationPct: number;
  skillPotencyPct: number;
  healingPowerPct: number;
  lifeOnHit: number;
  bleedOnCritPct: number;
  cooldownHastePct: number;
  staminaCostReductionPct: number;
  resetCooldownOnKill: boolean;
  threatWeightBonus: number;
  equippedSkills: EquippedTurnSkill[];
  skillCooldowns: Record<string, number>;
  beltSlots: BeltConsumableSlot[];
  statuses: CombatStatusEffect[];
  canParry: boolean;
  alive: boolean;
  nextIntent?: EnemyIntentTelegraph | null;
}

export interface TurnOrderEntry {
  unitId: string;
  name: string;
  side: CombatantSide;
  controller: CombatantController;
  ticksUntilTurn: number;
}

export interface GuildQuestWaveEnemy extends DungeonEnemyTemplate {
  agility?: number;
  intentBias?: EnemyIntentType;
}

export interface GuildQuestWaveDefinition {
  waveNumber: number;
  waveName: string;
  enemies: GuildQuestWaveEnemy[];
}

export type GuildQuestCategory = 'LIVE_QUEST' | 'RANK_UP_TRIAL';

export interface GuildQuestDefinition {
  questSlug: string;
  title: string;
  description: string;
  category: GuildQuestCategory;
  requiredRank: DungeonRequiredRank;
  unlocksRank?: DungeonRequiredRank;
  recommendedPower: number;
  goldReward: number;
  reputationReward: number;
  trialRequirements?: { workoutsLogged?: number; totalStatLevel?: number };
  waves: GuildQuestWaveDefinition[];
  lootTable: WeightedDungeonLoot[];
  lootRolls?: number;
  briefingLines: string[];
  victoryDebriefLines: string[];
}

export type TurnBasedCombatAction =
  | { type: 'BASIC_ATTACK'; actorId?: string; targetId?: string }
  | { type: 'GUARD'; actorId?: string }
  | { type: 'USE_SKILL'; actorId?: string; skillId: string; targetId?: string }
  | { type: 'USE_CONSUMABLE'; actorId?: string; beltSlotIndex: number; targetId?: string }
  | { type: 'AUTO_AI_TURN'; actorId?: string };

export type TurnBasedEventType =
  | 'ENCOUNTER_START'
  | 'WAVE_START'
  | 'TURN_START'
  | 'BASIC_ATTACK'
  | 'SKILL_CAST'
  | 'GUARD_STANCE'
  | 'PARRY_COUNTER'
  | 'CONSUMABLE_USED'
  | 'DODGE'
  | 'HEAL'
  | 'STATUS_APPLIED'
  | 'STATUS_TICK'
  | 'ENEMY_INTENT_EXECUTED'
  | 'UNIT_DEFEATED'
  | 'WAVE_CLEARED'
  | 'ENCOUNTER_END';

export interface TurnBasedCombatEvent {
  seq: number;
  turnNumber: number;
  waveNumber: number;
  type: TurnBasedEventType;
  actorId?: string;
  targetId?: string;
  skillId?: string;
  itemSlug?: string;
  damage?: number;
  heal?: number;
  shieldGranted?: number;
  isCrit?: boolean;
  isParry?: boolean;
  statusApplied?: StatusEffectType;
  message: string;
}

export interface TurnBasedPartyMemberInput {
  characterId: string;
  name: string;
  controller?: 'PLAYER' | 'AI_COMPANION';
  ownerUserId?: string;
  race?: CharacterRace;
  appearanceId?: string;
  customizationConfig?: CharacterCustomizationConfig;
  equippedLoadout?: Partial<EquipmentLoadoutMap>;
  coreStats: CoreStatBlock;
  equipmentBonuses?: EquipmentStatBonuses;
  equipmentPrimaryStatBonuses?: PrimaryStatBonuses;
  unlockedTalentRanks?: Record<string, number>;
  activeSkillIds?: readonly string[];
  beltSlots?: ReadonlyArray<{ itemSlug: string | null; charges: number }>;
  systemicFatigueStacks?: number;
}

export interface CreateTurnBasedEncounterInput {
  encounterId: string;
  questSlug: string;
  questTitle: string;
  roomChannelId?: string;
  party: readonly TurnBasedPartyMemberInput[];
  waves: readonly GuildQuestWaveDefinition[];
  seed: string;
  talentTrees?: readonly TalentTreeDefinition[];
}

export interface TurnBasedCombatState {
  encounterId: string;
  questSlug: string;
  questTitle: string;
  roomChannelId: string;
  rngSeed: string;
  rngCursor: number;
  stepSeq: number;
  turnNumber: number;
  status: 'IN_PROGRESS' | 'VICTORY' | 'DEFEAT';
  phase: 'AWAITING_PLAYER_ACTION' | 'AWAITING_AI_TURN' | 'COMPLETED';
  currentWaveIndex: number;
  totalWaves: number;
  waves: GuildQuestWaveDefinition[];
  units: TurnBasedCombatant[];
  activeUnitId: string | null;
  turnOrderTimeline: TurnOrderEntry[];
  consumablesUsed: Record<string, number>;
  actionLog: TurnBasedCombatAction[];
  lastStepEvents: TurnBasedCombatEvent[];
  combatLog: TurnBasedCombatEvent[];
}

export interface TurnBasedStepResult {
  valid: boolean;
  error?: string;
  state: TurnBasedCombatState;
  events: TurnBasedCombatEvent[];
}

// ============================================================================
// 3. INTERNAL ENGINE HELPERS (PRNG PROXY, CTB QUEUE, DAMAGE, INTENTS)
// ============================================================================

const CTB_THRESHOLD = 1000;
const TURN_TIMELINE_DEPTH = 8;

interface CountedSeededRng extends SeededRng {
  getCursorDelta: () => number;
}

function createCountedSeededRng(seed: string, startCursor: number, externalRng?: SeededRng): CountedSeededRng {
  let cursorDelta = 0;
  let base: SeededRng;

  if (externalRng) {
    base = externalRng;
  } else {
    base = createSeededRng(seed);
    for (let i = 0; i < startCursor; i++) {
      base.next();
    }
  }

  const next = (): number => {
    cursorDelta += 1;
    return base.next();
  };

  const nextFloat = next;

  const nextInt = (min: number, max: number): number => {
    if (max <= min) return min;
    return Math.floor(next() * (max - min + 1)) + min;
  };

  const chance = (probability: number): boolean => {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return next() < probability;
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty list.');
    }
    const idx = Math.floor(next() * items.length);
    return items[Math.min(idx, items.length - 1)]!;
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

  return {
    next,
    nextFloat,
    nextInt,
    chance,
    pick,
    pickWeighted,
    getCursorDelta: () => cursorDelta,
  };
}

function cloneCombatState(state: TurnBasedCombatState): TurnBasedCombatState {
  return JSON.parse(JSON.stringify(state)) as TurnBasedCombatState;
}

function compareReadyCombatants(
  a: { unitId: string; side: CombatantSide; speed: number; agility: number; turnGauge: number },
  b: { unitId: string; side: CombatantSide; speed: number; agility: number; turnGauge: number }
): number {
  if (b.turnGauge !== a.turnGauge) return b.turnGauge - a.turnGauge;
  if (b.speed !== a.speed) return b.speed - a.speed;
  if (b.agility !== a.agility) return b.agility - a.agility;
  if (a.side !== b.side) return a.side === 'PARTY' ? -1 : 1;
  return a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0;
}

function advanceTurnQueueAndProjectTimeline(state: TurnBasedCombatState): TurnBasedCombatant | null {
  const living = state.units.filter((u) => u.alive);
  if (living.length === 0) {
    state.activeUnitId = null;
    state.turnOrderTimeline = [];
    return null;
  }

  let ready = living.filter((u) => u.turnGauge >= CTB_THRESHOLD);
  if (ready.length === 0) {
    const minTicks = Math.max(
      1,
      Math.min(...living.map((u) => Math.ceil(Math.max(0, CTB_THRESHOLD - u.turnGauge) / Math.max(1, u.speed))))
    );
    for (const unit of living) {
      unit.turnGauge += minTicks * Math.max(1, unit.speed);
    }
    ready = living.filter((u) => u.turnGauge >= CTB_THRESHOLD);
  }

  ready.sort(compareReadyCombatants);
  const activeUnit = ready[0] ?? living[0]!;
  state.activeUnitId = activeUnit.unitId;
  state.phase = activeUnit.controller === 'PLAYER' ? 'AWAITING_PLAYER_ACTION' : 'AWAITING_AI_TURN';

  // Project next TURN_TIMELINE_DEPTH turns
  const sim = living.map((u) => ({
    unitId: u.unitId,
    name: u.name,
    side: u.side,
    controller: u.controller,
    speed: Math.max(1, u.speed),
    agility: u.agility,
    turnGauge: u.turnGauge,
  }));

  const timeline: TurnOrderEntry[] = [];
  let cumulativeTicks = 0;

  for (let i = 0; i < TURN_TIMELINE_DEPTH; i++) {
    let simReady = sim.filter((u) => u.turnGauge >= CTB_THRESHOLD);
    if (simReady.length === 0) {
      const stepTicks = Math.max(
        1,
        Math.min(...sim.map((u) => Math.ceil(Math.max(0, CTB_THRESHOLD - u.turnGauge) / u.speed)))
      );
      cumulativeTicks += stepTicks;
      for (const u of sim) {
        u.turnGauge += stepTicks * u.speed;
      }
      simReady = sim.filter((u) => u.turnGauge >= CTB_THRESHOLD);
    }

    simReady.sort(compareReadyCombatants);
    const nextActor = simReady[0]!;
    timeline.push({
      unitId: nextActor.unitId,
      name: nextActor.name,
      side: nextActor.side,
      controller: nextActor.controller,
      ticksUntilTurn: cumulativeTicks,
    });
    nextActor.turnGauge = Math.max(0, nextActor.turnGauge - CTB_THRESHOLD);
  }

  state.turnOrderTimeline = timeline;
  return activeUnit;
}

function getStatus(unit: TurnBasedCombatant, type: StatusEffectType): CombatStatusEffect | undefined {
  return unit.statuses.find((s) => s.type === type && s.remainingTurns > 0);
}

function addOrRefreshStatus(
  unit: TurnBasedCombatant,
  status: CombatStatusEffect,
  additivePotency = false
): void {
  const existing = unit.statuses.find((s) => s.type === status.type);
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, status.remainingTurns);
    existing.potency = additivePotency ? existing.potency + status.potency : Math.max(existing.potency, status.potency);
    if (status.sourceUnitId) existing.sourceUnitId = status.sourceUnitId;
  } else {
    unit.statuses.push({ ...status });
  }
}

function removeStatus(unit: TurnBasedCombatant, type: StatusEffectType): void {
  unit.statuses = unit.statuses.filter((s) => s.type !== type);
}

function getLivingUnits(state: TurnBasedCombatState, side: CombatantSide): TurnBasedCombatant[] {
  return state.units.filter((u) => u.alive && u.side === side);
}

function findUnit(state: TurnBasedCombatState, unitId: string | undefined): TurnBasedCombatant | undefined {
  if (!unitId) return undefined;
  return state.units.find((u) => u.unitId === unitId);
}

function pushEvent(
  state: TurnBasedCombatState,
  stepEvents: TurnBasedCombatEvent[],
  partial: Omit<TurnBasedCombatEvent, 'seq' | 'turnNumber' | 'waveNumber'>
): void {
  state.stepSeq += 1;
  const currentWave = state.waves[state.currentWaveIndex];
  const evt: TurnBasedCombatEvent = {
    seq: state.stepSeq,
    turnNumber: state.turnNumber,
    waveNumber: currentWave ? currentWave.waveNumber : state.currentWaveIndex + 1,
    ...partial,
  };
  stepEvents.push(evt);
  state.combatLog.push(evt);
}

function applyDamageToUnit(
  target: TurnBasedCombatant,
  rawDamage: number
): { totalDamage: number; hpDamage: number; absorbed: number } {
  const totalDamage = Math.max(1, Math.round(rawDamage));
  const absorbed = Math.min(target.shield, totalDamage);
  target.shield = Math.max(0, target.shield - absorbed);
  const hpDamage = totalDamage - absorbed;
  target.hp = Math.max(0, target.hp - hpDamage);
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
  }
  return { totalDamage, hpDamage, absorbed };
}

function computeMitigatedDamage(
  attacker: TurnBasedCombatant,
  target: TurnBasedCombatant,
  basePower: number,
  isCrit: boolean
): number {
  const sharpened = getStatus(attacker, 'SHARPENED');
  const attackBuffMult = 1 + (sharpened ? sharpened.potency : 0);
  const effectiveArmor = Math.max(0, target.armor * (1 - Math.min(0.85, attacker.armorPenetrationPct)));
  const armorMitigation = effectiveArmor / (effectiveArmor + 80);
  const fortifiedBonus = getStatus(target, 'FORTIFIED') ? 0.2 : 0;
  const flatMitigation = Math.min(0.85, target.damageMitigationPct + fortifiedBonus);
  const vulnerableMult = getStatus(target, 'VULNERABLE') ? 1.25 : 1;
  const guardingMult = getStatus(target, 'GUARDING') ? 0.5 : 1;
  const critMult = isCrit ? attacker.critMultiplier : 1;

  const raw =
    basePower *
    attackBuffMult *
    critMult *
    (1 - armorMitigation) *
    (1 - flatMitigation) *
    vulnerableMult *
    guardingMult;

  return Math.max(1, Math.round(raw));
}

function checkDodge(attacker: TurnBasedCombatant, target: TurnBasedCombatant, rng: SeededRng): boolean {
  const evasion = getStatus(target, 'EVASION');
  if (evasion) {
    evasion.remainingTurns -= 1;
    if (evasion.remainingTurns <= 0) {
      removeStatus(target, 'EVASION');
    }
    return true;
  }
  const effectiveDodge = Math.max(0.02, target.dodgeChance - (attacker.accuracy - 1) * 0.5);
  return rng.chance(effectiveDodge);
}

function maybeTriggerParryCounter(
  state: TurnBasedCombatState,
  stepEvents: TurnBasedCombatEvent[],
  attacker: TurnBasedCombatant,
  defender: TurnBasedCombatant
): void {
  if (!defender.alive || !defender.canParry || !getStatus(defender, 'GUARDING')) return;
  defender.canParry = false;

  const effectiveArmor = Math.max(0, attacker.armor * (1 - Math.min(0.85, defender.armorPenetrationPct)));
  const armorMitigation = effectiveArmor / (effectiveArmor + 80);
  const parryDamage = Math.max(
    1,
    Math.round(defender.meleePower * 0.65 * (1 - armorMitigation) * (1 - Math.min(0.85, attacker.damageMitigationPct)))
  );
  const dmg = applyDamageToUnit(attacker, parryDamage);

  pushEvent(state, stepEvents, {
    type: 'PARRY_COUNTER',
    actorId: defender.unitId,
    targetId: attacker.unitId,
    damage: dmg.totalDamage,
    isParry: true,
    message: `${defender.name} parries and counters ${attacker.name} for ${dmg.totalDamage} damage!`,
  });

  if (!attacker.alive) {
    pushEvent(state, stepEvents, {
      type: 'UNIT_DEFEATED',
      actorId: defender.unitId,
      targetId: attacker.unitId,
      message: `${attacker.name} is defeated by ${defender.name}'s parry counter!`,
    });
  }
}

function rollEnemyIntent(
  enemy: TurnBasedCombatant,
  state: TurnBasedCombatState,
  rng: SeededRng
): EnemyIntentTelegraph | null {
  const livingParty = getLivingUnits(state, 'PARTY');
  if (livingParty.length === 0) return null;

  const waveEnemy = state.waves[state.currentWaveIndex]?.enemies.find((e) => e.enemyId === enemy.sourceId);
  const bias = waveEnemy?.intentBias;
  const canCleave = (waveEnemy?.cleaveTargets ?? 0) >= 2 || Boolean(enemy.isBoss);

  const weights: Array<{ type: EnemyIntentType; weight: number }> = [
    { type: 'STRIKE', weight: bias === 'STRIKE' ? 60 : 45 },
    { type: 'HEAVY_SMASH', weight: bias === 'HEAVY_SMASH' ? 55 : 22 },
    { type: 'GUARD_BUFF', weight: bias === 'GUARD_BUFF' ? 45 : 12 },
    { type: 'DEBUFF_HEX', weight: bias === 'DEBUFF_HEX' ? 45 : 12 },
  ];
  if (canCleave && livingParty.length >= 2) {
    weights.push({ type: 'CLEAVE', weight: bias === 'CLEAVE' ? 55 : 20 });
  }

  const picked = rng.pickWeighted(weights).type;
  const taunter = livingParty.find((u) => Boolean(getStatus(u, 'TAUNT')));
  const chosenTarget = taunter ?? rng.pick(livingParty);

  switch (picked) {
    case 'STRIKE':
      return {
        intentType: 'STRIKE',
        label: 'Strike',
        targetUnitId: chosenTarget.unitId,
        estimatedDamage: Math.max(1, Math.round(enemy.meleePower)),
      };
    case 'HEAVY_SMASH':
      return {
        intentType: 'HEAVY_SMASH',
        label: 'Heavy Smash',
        targetUnitId: chosenTarget.unitId,
        estimatedDamage: Math.max(1, Math.round(enemy.meleePower * 1.45)),
      };
    case 'CLEAVE':
      return {
        intentType: 'CLEAVE',
        label: 'Sweeping Cleave',
        targetUnitId: null,
        estimatedDamage: Math.max(1, Math.round(enemy.meleePower * 0.85)),
      };
    case 'GUARD_BUFF':
      return {
        intentType: 'GUARD_BUFF',
        label: 'Iron Guard',
        targetUnitId: enemy.unitId,
        estimatedDamage: 0,
        appliesStatus: 'FORTIFIED',
      };
    case 'DEBUFF_HEX':
      return {
        intentType: 'DEBUFF_HEX',
        label: 'Wither Hex',
        targetUnitId: chosenTarget.unitId,
        estimatedDamage: Math.max(1, Math.round(enemy.meleePower * 0.7)),
        appliesStatus: 'VULNERABLE',
      };
  }
}

function buildEnemyCombatant(
  enemy: GuildQuestWaveEnemy,
  waveNumber: number,
  idx: number
): TurnBasedCombatant {
  const speed = Math.max(20, Math.round(100 / Math.max(0.6, enemy.attackIntervalSeconds)) + (enemy.agility ?? 0) * 4);
  return {
    unitId: `wave${waveNumber}_${enemy.enemyId}_${idx}`,
    sourceId: enemy.enemyId,
    name: enemy.name,
    side: 'ENEMY',
    controller: 'ENEMY',
    isBoss: Boolean(enemy.isBoss),
    maxHp: Math.max(1, Math.round(enemy.maxHp)),
    hp: Math.max(1, Math.round(enemy.maxHp)),
    shield: 0,
    maxStamina: 100,
    stamina: 100,
    maxMana: 50,
    mana: 50,
    meleePower: Math.max(1, Math.round(enemy.attackPower)),
    armor: Math.max(0, Math.round(enemy.armor)),
    agility: enemy.agility ?? (enemy.isBoss ? 4 : 3),
    speed,
    turnGauge: 0,
    damageMitigationPct: 0,
    critChance: enemy.isBoss ? 0.12 : 0.06,
    critMultiplier: 1.5,
    dodgeChance: enemy.dodgeChance ?? 0.04,
    accuracy: 0.95,
    armorPenetrationPct: 0,
    skillPotencyPct: 0,
    healingPowerPct: 0,
    lifeOnHit: 0,
    bleedOnCritPct: 0,
    cooldownHastePct: 0,
    staminaCostReductionPct: 0,
    resetCooldownOnKill: false,
    threatWeightBonus: 0,
    equippedSkills: [],
    skillCooldowns: {},
    beltSlots: [],
    statuses: [],
    canParry: false,
    alive: true,
    nextIntent: null,
  };
}

function buildPartyCombatant(
  member: TurnBasedPartyMemberInput,
  trees: readonly TalentTreeDefinition[]
): TurnBasedCombatant {
  const unlockedRanks = member.unlockedTalentRanks ?? {};
  const talents = aggregateTalentModifiers(unlockedRanks, trees);
  const derived = calculateDerivedCombatStats({
    coreStats: member.coreStats,
    equipmentBonuses: member.equipmentBonuses,
    equipmentPrimaryStats: member.equipmentPrimaryStatBonuses,
    unlockedTalentRanks: unlockedRanks,
    systemicFatigueStacks: member.systemicFatigueStacks ?? 0,
    talentTrees: trees,
  });

  const normalized = normalizeCoreStatBlock(member.coreStats, 0);
  const gearPrim = member.equipmentPrimaryStatBonuses ?? {};
  const fatigue = getSystemicFatigueCombatPenalties(member.systemicFatigueStacks ?? 0);

  const effAgi = (normalized.agilityLevel + (gearPrim.AGI ?? 0)) * fatigue.statEffectivenessMultiplier;
  const effDex = (normalized.dexLevel + (gearPrim.DEX ?? 0)) * fatigue.statEffectivenessMultiplier;
  const effWis = (normalized.wisLevel + (gearPrim.WIS ?? 0)) * fatigue.statEffectivenessMultiplier;
  const effSpr = (normalized.sprLevel + (gearPrim.SPR ?? 0)) * fatigue.statEffectivenessMultiplier;

  const maxMana = Math.max(30, Math.round((60 + effWis * 12 + effSpr * 12) * (1 + (talents.maxManaBoost ?? 0))));
  const speed = Math.max(20, Math.round((100 + effAgi * 8 + effDex * 3) * derived.attackSpeedMultiplier));
  const staminaCostReductionPct = Math.min(0.6, Math.max(0, talents.staminaCostReductionPct ?? 0));
  const cooldownHastePct = Math.min(0.5, Math.max(0, talents.cooldownHastePct ?? 0));

  const desiredSkillIds =
    member.activeSkillIds !== undefined
      ? sanitizeActiveSkillLoadout(member.activeSkillIds, unlockedRanks, trees)
      : talents.unlockedSkills.slice(0, MAX_EQUIPPED_ACTIVE_SKILLS).map((s) => s.skillId);

  const unlockedMap = new Map(talents.unlockedSkills.map((s) => [s.skillId, s]));
  const equippedSkills: EquippedTurnSkill[] = [];
  const skillCooldowns: Record<string, number> = {};

  for (const skillId of desiredSkillIds) {
    const def = unlockedMap.get(skillId);
    if (!def) continue;
    const costInfo = getSkillResourceCost(def, staminaCostReductionPct, trees);
    equippedSkills.push({
      ...def,
      resourceType: costInfo.resourceType,
      resourceCost: costInfo.cost,
      cooldownTurns: costInfo.cooldownTurns,
    });
    skillCooldowns[skillId] = 0;
  }

  const beltSlots: BeltConsumableSlot[] = [];
  for (let i = 0; i < MAX_BELT_SLOTS; i++) {
    const raw = member.beltSlots?.[i];
    if (raw && raw.itemSlug && COMBAT_CONSUMABLE_BY_SLUG[raw.itemSlug] && raw.charges > 0) {
      beltSlots.push({
        slotIndex: i,
        itemSlug: raw.itemSlug,
        charges: Math.floor(raw.charges),
      });
    } else {
      beltSlots.push({
        slotIndex: i,
        itemSlug: null,
        charges: 0,
      });
    }
  }

  const openingShield =
    (member.equipmentBonuses?.startOfCombatShieldHp ?? 0) +
    Math.round(derived.maxHp * (talents.openingShieldMaxHpPct ?? 0));

  return {
    unitId: member.characterId,
    sourceId: member.characterId,
    name: member.name,
    side: 'PARTY',
    controller: member.controller ?? 'PLAYER',
    ownerUserId: member.ownerUserId,
    race: member.race,
    appearanceId: member.appearanceId,
    customizationConfig: member.customizationConfig,
    equippedLoadout: member.equippedLoadout,
    maxHp: derived.maxHp,
    hp: derived.maxHp,
    shield: openingShield,
    maxStamina: derived.maxStamina,
    stamina: derived.maxStamina,
    maxMana,
    mana: maxMana,
    meleePower: derived.meleePower,
    armor: derived.armor,
    agility: Math.round(effAgi),
    speed,
    turnGauge: 0,
    damageMitigationPct: derived.damageMitigationPct,
    critChance: derived.critChance,
    critMultiplier: derived.critMultiplier,
    dodgeChance: derived.dodgeChance,
    accuracy: derived.accuracy,
    armorPenetrationPct: Math.min(
      0.85,
      Math.max(0, (member.equipmentBonuses?.armorPenetrationPct ?? 0) + (talents.armorPenetrationPct ?? 0))
    ),
    skillPotencyPct: (member.equipmentBonuses?.skillPotencyPct ?? 0) + (talents.skillPowerPct ?? 0),
    healingPowerPct: (talents.healingPowerPct ?? 0) + (talents.healingPowerMultiplier ?? 0),
    lifeOnHit: member.equipmentBonuses?.lifeOnHit ?? 0,
    bleedOnCritPct: talents.bleedMeleePowerPctOnCrit ?? 0,
    cooldownHastePct,
    staminaCostReductionPct,
    resetCooldownOnKill: Boolean(talents.resetCooldownOnKill),
    threatWeightBonus: talents.threatWeightBonus ?? 0,
    equippedSkills,
    skillCooldowns,
    beltSlots,
    statuses: [],
    canParry: false,
    alive: true,
    nextIntent: null,
  };
}

function spawnWaveEnemies(
  state: TurnBasedCombatState,
  wave: GuildQuestWaveDefinition,
  rng: SeededRng,
  stepEvents: TurnBasedCombatEvent[]
): void {
  state.units = state.units.filter((u) => u.side === 'PARTY');
  const spawned: TurnBasedCombatant[] = wave.enemies.map((enemy, idx) =>
    buildEnemyCombatant(enemy, wave.waveNumber, idx)
  );
  state.units.push(...spawned);

  for (const enemy of spawned) {
    enemy.nextIntent = rollEnemyIntent(enemy, state, rng);
  }

  pushEvent(state, stepEvents, {
    type: 'WAVE_START',
    message: `Wave ${wave.waveNumber}: ${wave.waveName} begins!`,
  });
}

function beginActiveUnitTurn(
  state: TurnBasedCombatState,
  stepEvents: TurnBasedCombatEvent[],
  rng: SeededRng
): void {
  let guardCounter = 0;
  while (guardCounter < 32) {
    guardCounter += 1;
    const active = advanceTurnQueueAndProjectTimeline(state);
    if (!active) return;

    state.turnNumber += 1;
    // Clear GUARDING & canParry at the start of the unit's next turn
    removeStatus(active, 'GUARDING');
    active.canParry = false;

    // Passive turn-start resource regen
    active.stamina = Math.min(active.maxStamina, active.stamina + 8);
    active.mana = Math.min(active.maxMana, active.mana + 6);

    pushEvent(state, stepEvents, {
      type: 'TURN_START',
      actorId: active.unitId,
      message: `${active.name}'s turn begins.`,
    });

    // Apply BLEED DoT ticks at start of unit's turn
    const bleed = getStatus(active, 'BLEED');
    if (bleed) {
      const bleedDmg = applyDamageToUnit(active, Math.max(1, Math.round(bleed.potency)));
      pushEvent(state, stepEvents, {
        type: 'STATUS_TICK',
        actorId: active.unitId,
        targetId: active.unitId,
        damage: bleedDmg.totalDamage,
        statusApplied: 'BLEED',
        message: `${active.name} suffers ${bleedDmg.totalDamage} bleed damage.`,
      });

      if (!active.alive) {
        pushEvent(state, stepEvents, {
          type: 'UNIT_DEFEATED',
          targetId: active.unitId,
          message: `${active.name} succumbs to bleeding!`,
        });

        const livingParty = getLivingUnits(state, 'PARTY');
        const livingEnemies = getLivingUnits(state, 'ENEMY');
        if (livingParty.length === 0) {
          state.status = 'DEFEAT';
          state.phase = 'COMPLETED';
          state.activeUnitId = null;
          state.turnOrderTimeline = [];
          pushEvent(state, stepEvents, {
            type: 'ENCOUNTER_END',
            message: 'All party members have fallen. Defeat!',
          });
          return;
        }
        if (livingEnemies.length === 0) {
          handleAllEnemiesDefeated(state, stepEvents, rng);
          return;
        }
        continue;
      }
    }

    return;
  }
}

function handleAllEnemiesDefeated(
  state: TurnBasedCombatState,
  stepEvents: TurnBasedCombatEvent[],
  rng: SeededRng
): void {
  const currentWave = state.waves[state.currentWaveIndex];
  pushEvent(state, stepEvents, {
    type: 'WAVE_CLEARED',
    message: `Wave ${currentWave ? currentWave.waveNumber : state.currentWaveIndex + 1} cleared!`,
  });

  if (state.currentWaveIndex + 1 < state.waves.length) {
    state.currentWaveIndex += 1;
    for (const member of getLivingUnits(state, 'PARTY')) {
      member.stamina = Math.min(member.maxStamina, member.stamina + Math.round(member.maxStamina * 0.15));
      member.mana = Math.min(member.maxMana, member.mana + Math.round(member.maxMana * 0.15));
    }
    const nextWave = state.waves[state.currentWaveIndex]!;
    spawnWaveEnemies(state, nextWave, rng, stepEvents);
    beginActiveUnitTurn(state, stepEvents, rng);
  } else {
    state.status = 'VICTORY';
    state.phase = 'COMPLETED';
    state.activeUnitId = null;
    state.turnOrderTimeline = [];
    pushEvent(state, stepEvents, {
      type: 'ENCOUNTER_END',
      message: `${state.questTitle} completed in victory!`,
    });
  }
}

// ============================================================================
// 4. CORE TURN-BASED COMBAT API
// ============================================================================

export function createTurnBasedEncounter(input: CreateTurnBasedEncounterInput): TurnBasedCombatState {
  if (!input.party || input.party.length === 0) {
    throw new Error('Cannot create turn-based encounter with an empty party.');
  }
  if (!input.waves || input.waves.length === 0) {
    throw new Error('Cannot create turn-based encounter with no waves.');
  }

  const trees = input.talentTrees ?? DEFAULT_TALENT_TREES;
  const rng = createCountedSeededRng(input.seed, 0);

  const partyUnits = input.party.map((member) => buildPartyCombatant(member, trees));
  const state: TurnBasedCombatState = {
    encounterId: input.encounterId,
    questSlug: input.questSlug,
    questTitle: input.questTitle,
    roomChannelId: input.roomChannelId ?? `quest_${input.encounterId}`,
    rngSeed: input.seed,
    rngCursor: 0,
    stepSeq: 0,
    turnNumber: 0,
    status: 'IN_PROGRESS',
    phase: 'AWAITING_PLAYER_ACTION',
    currentWaveIndex: 0,
    totalWaves: input.waves.length,
    waves: JSON.parse(JSON.stringify(input.waves)) as GuildQuestWaveDefinition[],
    units: partyUnits,
    activeUnitId: null,
    turnOrderTimeline: [],
    consumablesUsed: {},
    actionLog: [],
    lastStepEvents: [],
    combatLog: [],
  };

  const stepEvents: TurnBasedCombatEvent[] = [];
  pushEvent(state, stepEvents, {
    type: 'ENCOUNTER_START',
    message: `Encounter started: ${input.questTitle}.`,
  });

  spawnWaveEnemies(state, state.waves[0]!, rng, stepEvents);
  beginActiveUnitTurn(state, stepEvents, rng);

  state.rngCursor += rng.getCursorDelta();
  state.lastStepEvents = stepEvents;
  return state;
}

function executeBasicAttack(
  state: TurnBasedCombatState,
  actor: TurnBasedCombatant,
  target: TurnBasedCombatant,
  stepEvents: TurnBasedCombatEvent[],
  rng: SeededRng
): void {
  actor.stamina = Math.min(actor.maxStamina, actor.stamina + 6);
  actor.mana = Math.min(actor.maxMana, actor.mana + 4);

  if (checkDodge(actor, target, rng)) {
    pushEvent(state, stepEvents, {
      type: 'DODGE',
      actorId: actor.unitId,
      targetId: target.unitId,
      message: `${target.name} dodges ${actor.name}'s attack!`,
    });
    return;
  }

  const isCrit = rng.chance(actor.critChance);
  const damageAmount = computeMitigatedDamage(actor, target, actor.meleePower, isCrit);
  const dmg = applyDamageToUnit(target, damageAmount);

  pushEvent(state, stepEvents, {
    type: 'BASIC_ATTACK',
    actorId: actor.unitId,
    targetId: target.unitId,
    damage: dmg.totalDamage,
    isCrit,
    message: `${actor.name} strikes ${target.name} for ${dmg.totalDamage}${isCrit ? ' (CRIT)' : ''} damage.`,
  });

  if (actor.lifeOnHit > 0 && actor.alive) {
    const healed = Math.min(actor.maxHp - actor.hp, Math.round(actor.lifeOnHit));
    if (healed > 0) {
      actor.hp += healed;
      pushEvent(state, stepEvents, {
        type: 'HEAL',
        actorId: actor.unitId,
        targetId: actor.unitId,
        heal: healed,
        message: `${actor.name} drains ${healed} HP on hit.`,
      });
    }
  }

  if (isCrit && actor.bleedOnCritPct > 0 && target.alive) {
    const bleedPotency = Math.max(2, Math.round(actor.meleePower * actor.bleedOnCritPct));
    addOrRefreshStatus(target, {
      type: 'BLEED',
      remainingTurns: 2,
      potency: bleedPotency,
      sourceUnitId: actor.unitId,
    });
    pushEvent(state, stepEvents, {
      type: 'STATUS_APPLIED',
      actorId: actor.unitId,
      targetId: target.unitId,
      statusApplied: 'BLEED',
      message: `${target.name} begins bleeding (${bleedPotency}/turn).`,
    });
  }

  if (!target.alive) {
    pushEvent(state, stepEvents, {
      type: 'UNIT_DEFEATED',
      actorId: actor.unitId,
      targetId: target.unitId,
      message: `${target.name} is defeated!`,
    });
  } else {
    maybeTriggerParryCounter(state, stepEvents, actor, target);
  }
}

function executeGuard(
  state: TurnBasedCombatState,
  actor: TurnBasedCombatant,
  stepEvents: TurnBasedCombatEvent[],
  skipTickStatuses: Set<StatusEffectType>
): void {
  addOrRefreshStatus(actor, {
    type: 'GUARDING',
    remainingTurns: 1,
    potency: 0.5,
    sourceUnitId: actor.unitId,
  });
  skipTickStatuses.add('GUARDING');
  actor.canParry = true;

  const shieldGranted = Math.max(1, Math.round(actor.maxHp * 0.1));
  actor.shield += shieldGranted;
  actor.stamina = Math.min(actor.maxStamina, actor.stamina + Math.round(actor.maxStamina * 0.2));
  actor.mana = Math.min(actor.maxMana, actor.mana + Math.round(actor.maxMana * 0.15));

  pushEvent(state, stepEvents, {
    type: 'GUARD_STANCE',
    actorId: actor.unitId,
    shieldGranted,
    statusApplied: 'GUARDING',
    message: `${actor.name} raises guard (+${shieldGranted} shield, Parry ready).`,
  });
}

function executeUseSkill(
  state: TurnBasedCombatState,
  actor: TurnBasedCombatant,
  skill: EquippedTurnSkill,
  explicitTargetId: string | undefined,
  stepEvents: TurnBasedCombatEvent[],
  rng: SeededRng,
  skipTickStatuses: Set<StatusEffectType>
): { ok: true; skillUsedId: string } | { ok: false; error: string } {
  if ((actor.skillCooldowns[skill.skillId] ?? 0) > 0) {
    return { ok: false, error: `Skill '${skill.skillId}' is on cooldown.` };
  }

  if (skill.resourceType === 'MANA') {
    if (actor.mana < skill.resourceCost) {
      return { ok: false, error: `Insufficient Mana for '${skill.name}'.` };
    }
  } else {
    if (actor.stamina < skill.resourceCost) {
      return { ok: false, error: `Insufficient Stamina for '${skill.name}'.` };
    }
  }

  if (skill.targetType === 'PARTY_HEAL') {
    const livingAllies = getLivingUnits(state, 'PARTY');
    let target = explicitTargetId ? findUnit(state, explicitTargetId) : undefined;
    if (explicitTargetId && (!target || !target.alive || target.side !== 'PARTY')) {
      return { ok: false, error: 'Invalid heal target.' };
    }
    if (!target) {
      target = [...livingAllies].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    }
    if (!target) {
      return { ok: false, error: 'No living party member to heal.' };
    }

    if (skill.resourceType === 'MANA') actor.mana -= skill.resourceCost;
    else actor.stamina -= skill.resourceCost;

    const appliedCd = Math.max(1, Math.round(skill.cooldownTurns * (1 - actor.cooldownHastePct)));
    actor.skillCooldowns[skill.skillId] = appliedCd;

    const rawHeal = Math.max(
      1,
      Math.round(target.maxHp * (skill.healMaxHpPct ?? 0.2) * (1 + actor.healingPowerPct))
    );
    const actualHeal = Math.min(target.maxHp - target.hp, rawHeal);
    target.hp += actualHeal;

    if (skill.skillId === 'skill_divine_light') {
      removeStatus(target, 'BLEED');
      removeStatus(target, 'VULNERABLE');
    }

    pushEvent(state, stepEvents, {
      type: 'SKILL_CAST',
      actorId: actor.unitId,
      targetId: target.unitId,
      skillId: skill.skillId,
      heal: actualHeal,
      message: `${actor.name} casts ${skill.name} on ${target.name}.`,
    });
    pushEvent(state, stepEvents, {
      type: 'HEAL',
      actorId: actor.unitId,
      targetId: target.unitId,
      skillId: skill.skillId,
      heal: actualHeal,
      message: `${target.name} recovers ${actualHeal} HP.`,
    });

    return { ok: true, skillUsedId: skill.skillId };
  }

  const livingEnemies = getLivingUnits(state, 'ENEMY');
  let primaryTarget = explicitTargetId ? findUnit(state, explicitTargetId) : livingEnemies[0];
  if (explicitTargetId && (!primaryTarget || !primaryTarget.alive || primaryTarget.side !== 'ENEMY')) {
    return { ok: false, error: 'Invalid enemy target.' };
  }
  if (!primaryTarget) {
    return { ok: false, error: 'No living enemy target available.' };
  }

  if (skill.resourceType === 'MANA') actor.mana -= skill.resourceCost;
  else actor.stamina -= skill.resourceCost;

  const appliedCd = Math.max(1, Math.round(skill.cooldownTurns * (1 - actor.cooldownHastePct)));
  actor.skillCooldowns[skill.skillId] = appliedCd;

  let shieldGranted = 0;
  if (skill.selfShieldMaxHpPct && skill.selfShieldMaxHpPct > 0) {
    shieldGranted = Math.max(1, Math.round(actor.maxHp * skill.selfShieldMaxHpPct));
    actor.shield += shieldGranted;
  }

  if (skill.tauntDurationSeconds && skill.tauntDurationSeconds > 0) {
    addOrRefreshStatus(actor, {
      type: 'TAUNT',
      remainingTurns: 2,
      potency: 1,
      sourceUnitId: actor.unitId,
    });
    skipTickStatuses.add('TAUNT');
    pushEvent(state, stepEvents, {
      type: 'STATUS_APPLIED',
      actorId: actor.unitId,
      targetId: actor.unitId,
      statusApplied: 'TAUNT',
      message: `${actor.name} taunts all enemies for 2 turns!`,
    });
  }

  if (skill.skillId === 'skill_mirage_vault') {
    addOrRefreshStatus(actor, {
      type: 'EVASION',
      remainingTurns: 1,
      potency: 1,
      sourceUnitId: actor.unitId,
    });
    skipTickStatuses.add('EVASION');
    pushEvent(state, stepEvents, {
      type: 'STATUS_APPLIED',
      actorId: actor.unitId,
      targetId: actor.unitId,
      statusApplied: 'EVASION',
      message: `${actor.name} gains Evasion!`,
    });
  }

  const targets: TurnBasedCombatant[] =
    skill.targetType === 'CLEAVE_ENEMIES'
      ? [
          primaryTarget,
          ...livingEnemies
            .filter((e) => e.unitId !== primaryTarget.unitId)
            .slice(0, Math.max(0, (skill.maxTargets ?? 2) - 1)),
        ]
      : [primaryTarget];

  const hitsPerTarget = skill.targetType === 'SINGLE_ENEMY' ? Math.max(1, skill.hitCount ?? 1) : 1;
  let anyEnemyDied = false;
  let totalDamageDealt = 0;
  let anyCrit = false;

  for (const target of targets) {
    for (let h = 0; h < hitsPerTarget; h++) {
      if (!target.alive || !actor.alive) break;
      if (checkDodge(actor, target, rng)) {
        pushEvent(state, stepEvents, {
          type: 'DODGE',
          actorId: actor.unitId,
          targetId: target.unitId,
          skillId: skill.skillId,
          message: `${target.name} dodges ${actor.name}'s ${skill.name}!`,
        });
        continue;
      }

      const isCrit = rng.chance(Math.min(0.95, actor.critChance + (skill.bonusCritChance ?? 0)));
      if (isCrit) anyCrit = true;

      const basePower = actor.meleePower * skill.damageMultiplier * (1 + actor.skillPotencyPct);
      const damageAmount = computeMitigatedDamage(actor, target, basePower, isCrit);
      const dmg = applyDamageToUnit(target, damageAmount);
      totalDamageDealt += dmg.totalDamage;

      if (actor.lifeOnHit > 0 && actor.alive) {
        const healed = Math.min(actor.maxHp - actor.hp, Math.round(actor.lifeOnHit));
        if (healed > 0) actor.hp += healed;
      }

      if (isCrit && actor.bleedOnCritPct > 0 && target.alive) {
        const bleedPotency = Math.max(2, Math.round(actor.meleePower * actor.bleedOnCritPct));
        addOrRefreshStatus(target, {
          type: 'BLEED',
          remainingTurns: 2,
          potency: bleedPotency,
          sourceUnitId: actor.unitId,
        });
      }

      if (!target.alive) {
        anyEnemyDied = true;
      } else {
        maybeTriggerParryCounter(state, stepEvents, actor, target);
      }
    }
  }

  pushEvent(state, stepEvents, {
    type: 'SKILL_CAST',
    actorId: actor.unitId,
    targetId: primaryTarget.unitId,
    skillId: skill.skillId,
    damage: totalDamageDealt,
    shieldGranted: shieldGranted > 0 ? shieldGranted : undefined,
    isCrit: anyCrit,
    message: `${actor.name} uses ${skill.name} dealing ${totalDamageDealt} total damage!`,
  });

  for (const target of targets) {
    if (!target.alive) {
      pushEvent(state, stepEvents, {
        type: 'UNIT_DEFEATED',
        actorId: actor.unitId,
        targetId: target.unitId,
        message: `${target.name} is defeated by ${skill.name}!`,
      });
    }
  }

  if (anyEnemyDied && actor.resetCooldownOnKill) {
    for (const key of Object.keys(actor.skillCooldowns)) {
      actor.skillCooldowns[key] = 0;
    }
  }

  return { ok: true, skillUsedId: skill.skillId };
}

function executeUseConsumable(
  state: TurnBasedCombatState,
  actor: TurnBasedCombatant,
  beltSlotIndex: number,
  explicitTargetId: string | undefined,
  stepEvents: TurnBasedCombatEvent[],
  skipTickStatuses: Set<StatusEffectType>
): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(beltSlotIndex) || beltSlotIndex < 0 || beltSlotIndex >= MAX_BELT_SLOTS) {
    return { ok: false, error: 'Invalid belt slot index.' };
  }
  const slot = actor.beltSlots[beltSlotIndex];
  if (!slot || !slot.itemSlug || slot.charges <= 0) {
    return { ok: false, error: `Belt slot ${beltSlotIndex} is empty.` };
  }
  const itemDef = COMBAT_CONSUMABLE_BY_SLUG[slot.itemSlug];
  if (!itemDef) {
    return { ok: false, error: `Unknown consumable '${slot.itemSlug}'.` };
  }

  const target = explicitTargetId ? findUnit(state, explicitTargetId) : actor;
  if (!target || !target.alive || target.side !== 'PARTY') {
    return { ok: false, error: 'Invalid consumable target.' };
  }

  slot.charges -= 1;
  state.consumablesUsed[itemDef.itemSlug] = (state.consumablesUsed[itemDef.itemSlug] ?? 0) + 1;

  let healed = 0;
  if (itemDef.healMaxHpPct && itemDef.healMaxHpPct > 0) {
    const rawHeal = Math.max(1, Math.round(target.maxHp * itemDef.healMaxHpPct));
    healed = Math.min(target.maxHp - target.hp, rawHeal);
    target.hp += healed;
  }

  if (itemDef.restoreStamina && itemDef.restoreStamina > 0) {
    target.stamina = Math.min(target.maxStamina, target.stamina + itemDef.restoreStamina);
  }

  if (itemDef.restoreMana && itemDef.restoreMana > 0) {
    target.mana = Math.min(target.maxMana, target.mana + itemDef.restoreMana);
  }

  let statusApplied: StatusEffectType | undefined;
  if (itemDef.attackBuffPct && itemDef.attackBuffPct > 0) {
    addOrRefreshStatus(target, {
      type: 'SHARPENED',
      remainingTurns: itemDef.buffDurationTurns ?? 3,
      potency: itemDef.attackBuffPct,
      sourceUnitId: actor.unitId,
    });
    if (target.unitId === actor.unitId) {
      skipTickStatuses.add('SHARPENED');
    }
    statusApplied = 'SHARPENED';
  }

  pushEvent(state, stepEvents, {
    type: 'CONSUMABLE_USED',
    actorId: actor.unitId,
    targetId: target.unitId,
    itemSlug: itemDef.itemSlug,
    heal: healed > 0 ? healed : undefined,
    statusApplied,
    message: `${actor.name} uses ${itemDef.name} on ${target.name}.`,
  });

  return { ok: true };
}

function executeEnemyIntent(
  state: TurnBasedCombatState,
  enemy: TurnBasedCombatant,
  stepEvents: TurnBasedCombatEvent[],
  rng: SeededRng,
  skipTickStatuses: Set<StatusEffectType>
): void {
  const livingParty = getLivingUnits(state, 'PARTY');
  if (livingParty.length === 0) return;

  const intent = enemy.nextIntent ?? rollEnemyIntent(enemy, state, rng);
  if (!intent) return;

  if (intent.intentType === 'GUARD_BUFF') {
    const shieldGranted = Math.max(1, Math.round(enemy.maxHp * 0.12));
    enemy.shield += shieldGranted;
    addOrRefreshStatus(enemy, {
      type: 'FORTIFIED',
      remainingTurns: 2,
      potency: 0.2,
      sourceUnitId: enemy.unitId,
    });
    skipTickStatuses.add('FORTIFIED');

    pushEvent(state, stepEvents, {
      type: 'ENEMY_INTENT_EXECUTED',
      actorId: enemy.unitId,
      targetId: enemy.unitId,
      shieldGranted,
      statusApplied: 'FORTIFIED',
      message: `${enemy.name} uses ${intent.label}, gaining +${shieldGranted} shield and Fortified!`,
    });
    return;
  }

  if (intent.intentType === 'CLEAVE') {
    const waveEnemy = state.waves[state.currentWaveIndex]?.enemies.find((e) => e.enemyId === enemy.sourceId);
    const maxTargets = Math.max(2, waveEnemy?.cleaveTargets ?? 2);
    const taunter = livingParty.find((u) => Boolean(getStatus(u, 'TAUNT')));
    const ordered = taunter
      ? [taunter, ...livingParty.filter((u) => u.unitId !== taunter.unitId)]
      : livingParty;
    const targets = ordered.slice(0, maxTargets);
    let totalDamage = 0;

    for (const target of targets) {
      if (!enemy.alive) break;
      if (checkDodge(enemy, target, rng)) {
        pushEvent(state, stepEvents, {
          type: 'DODGE',
          actorId: enemy.unitId,
          targetId: target.unitId,
          message: `${target.name} dodges ${enemy.name}'s ${intent.label}!`,
        });
        continue;
      }

      const isCrit = rng.chance(enemy.critChance);
      const damageAmount = computeMitigatedDamage(enemy, target, enemy.meleePower * 0.85, isCrit);
      const dmg = applyDamageToUnit(target, damageAmount);
      totalDamage += dmg.totalDamage;

      if (!target.alive) {
        pushEvent(state, stepEvents, {
          type: 'UNIT_DEFEATED',
          actorId: enemy.unitId,
          targetId: target.unitId,
          message: `${target.name} is defeated by ${enemy.name}'s ${intent.label}!`,
        });
      } else {
        maybeTriggerParryCounter(state, stepEvents, enemy, target);
      }
    }

    pushEvent(state, stepEvents, {
      type: 'ENEMY_INTENT_EXECUTED',
      actorId: enemy.unitId,
      damage: totalDamage,
      message: `${enemy.name} unleashes ${intent.label} across the party for ${totalDamage} total damage!`,
    });
    return;
  }

  // Single-target intent (respect active TAUNT on living party units!)
  const taunter = livingParty.find((u) => Boolean(getStatus(u, 'TAUNT')));
  let target = taunter ?? findUnit(state, intent.targetUnitId ?? undefined);
  if (!target || !target.alive || target.side !== 'PARTY') {
    target = rng.pick(livingParty);
  }

  if (checkDodge(enemy, target, rng)) {
    pushEvent(state, stepEvents, {
      type: 'DODGE',
      actorId: enemy.unitId,
      targetId: target.unitId,
      message: `${target.name} dodges ${enemy.name}'s ${intent.label}!`,
    });
    return;
  }

  const mult =
    intent.intentType === 'HEAVY_SMASH' ? 1.45 : intent.intentType === 'DEBUFF_HEX' ? 0.7 : 1.0;
  const isCrit = rng.chance(enemy.critChance);
  const damageAmount = computeMitigatedDamage(enemy, target, enemy.meleePower * mult, isCrit);
  const dmg = applyDamageToUnit(target, damageAmount);

  let appliedStatus: StatusEffectType | undefined;
  if (intent.intentType === 'DEBUFF_HEX' && target.alive) {
    addOrRefreshStatus(target, {
      type: 'VULNERABLE',
      remainingTurns: 2,
      potency: 0.25,
      sourceUnitId: enemy.unitId,
    });
    appliedStatus = 'VULNERABLE';
  }

  pushEvent(state, stepEvents, {
    type: 'ENEMY_INTENT_EXECUTED',
    actorId: enemy.unitId,
    targetId: target.unitId,
    damage: dmg.totalDamage,
    isCrit,
    statusApplied: appliedStatus,
    message: `${enemy.name} executes ${intent.label} on ${target.name} for ${dmg.totalDamage} damage!`,
  });

  if (!target.alive) {
    pushEvent(state, stepEvents, {
      type: 'UNIT_DEFEATED',
      actorId: enemy.unitId,
      targetId: target.unitId,
      message: `${target.name} is defeated!`,
    });
  } else {
    maybeTriggerParryCounter(state, stepEvents, enemy, target);
  }
}

export function chooseTurnBasedAiAction(
  state: TurnBasedCombatState,
  unitId?: string
): TurnBasedCombatAction {
  const actor = findUnit(state, unitId ?? state.activeUnitId ?? undefined);
  const livingEnemies = getLivingUnits(state, 'ENEMY');
  const livingParty = getLivingUnits(state, 'PARTY');

  if (!actor || !actor.alive || livingEnemies.length === 0) {
    return { type: 'GUARD', actorId: actor?.unitId };
  }

  const lowestHpEnemy = [...livingEnemies].sort((a, b) => a.hp - b.hp)[0]!;
  const isSkillReady = (skill: EquippedTurnSkill): boolean => {
    if ((actor.skillCooldowns[skill.skillId] ?? 0) > 0) return false;
    return skill.resourceType === 'MANA' ? actor.mana >= skill.resourceCost : actor.stamina >= skill.resourceCost;
  };

  // 1. PARTY_HEAL skill when any living ally HP ratio < 0.65
  const healSkill = actor.equippedSkills.find((s) => s.targetType === 'PARTY_HEAL' && isSkillReady(s));
  const woundedAlly = [...livingParty]
    .filter((u) => u.hp / u.maxHp < 0.65)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (healSkill && woundedAlly) {
    return {
      type: 'USE_SKILL',
      actorId: actor.unitId,
      skillId: healSkill.skillId,
      targetId: woundedAlly.unitId,
    };
  }

  // 2. GUARD when self HP ratio < 0.55 and enemy nextIntent is HEAVY_SMASH targeting self or CLEAVE
  const threatenedByHeavyOrCleave = livingEnemies.some((e) => {
    const intent = e.nextIntent;
    if (!intent) return false;
    return (
      intent.intentType === 'CLEAVE' ||
      (intent.intentType === 'HEAVY_SMASH' && intent.targetUnitId === actor.unitId)
    );
  });
  if (actor.hp / actor.maxHp < 0.55 && threatenedByHeavyOrCleave) {
    return { type: 'GUARD', actorId: actor.unitId };
  }

  // 3. Tank/Taunt/Shield skill when ready & affordable and no ally has TAUNT or self shield === 0
  const anyAllyTaunting = livingParty.some((u) => Boolean(getStatus(u, 'TAUNT')));
  const defensiveSkill = actor.equippedSkills.find(
    (s) =>
      isSkillReady(s) &&
      ((s.tauntDurationSeconds && s.tauntDurationSeconds > 0 && !anyAllyTaunting) ||
        (s.selfShieldMaxHpPct && s.selfShieldMaxHpPct > 0 && actor.shield === 0))
  );
  if (defensiveSkill) {
    return {
      type: 'USE_SKILL',
      actorId: actor.unitId,
      skillId: defensiveSkill.skillId,
      targetId: lowestHpEnemy.unitId,
    };
  }

  // 4. CLEAVE_ENEMIES skill when ready & affordable and >= 2 living enemies
  if (livingEnemies.length >= 2) {
    const cleaveSkill = actor.equippedSkills.find((s) => s.targetType === 'CLEAVE_ENEMIES' && isSkillReady(s));
    if (cleaveSkill) {
      return {
        type: 'USE_SKILL',
        actorId: actor.unitId,
        skillId: cleaveSkill.skillId,
        targetId: lowestHpEnemy.unitId,
      };
    }
  }

  // 5. SINGLE_ENEMY skill when ready & affordable
  const singleSkill = actor.equippedSkills.find((s) => s.targetType === 'SINGLE_ENEMY' && isSkillReady(s));
  if (singleSkill) {
    return {
      type: 'USE_SKILL',
      actorId: actor.unitId,
      skillId: singleSkill.skillId,
      targetId: lowestHpEnemy.unitId,
    };
  }

  // 6. BASIC_ATTACK on lowest-HP living enemy
  return {
    type: 'BASIC_ATTACK',
    actorId: actor.unitId,
    targetId: lowestHpEnemy.unitId,
  };
}

export function stepTurnBasedCombat(
  state: TurnBasedCombatState,
  action: TurnBasedCombatAction,
  rng?: SeededRng
): TurnBasedStepResult {
  if (state.status !== 'IN_PROGRESS' || state.phase === 'COMPLETED' || !state.activeUnitId) {
    return { valid: false, error: 'Encounter has already completed.', state, events: [] };
  }

  if (action.actorId !== undefined && action.actorId !== state.activeUnitId) {
    return {
      valid: false,
      error: `Action actor '${action.actorId}' does not match active unit '${state.activeUnitId}'.`,
      state,
      events: [],
    };
  }

  const activeBefore = findUnit(state, state.activeUnitId);
  if (!activeBefore || !activeBefore.alive) {
    return { valid: false, error: 'Active unit is missing or defeated.', state, events: [] };
  }

  if (activeBefore.controller === 'PLAYER' && action.type === 'AUTO_AI_TURN') {
    return { valid: false, error: 'Cannot run AUTO_AI_TURN on a PLAYER-controlled unit.', state, events: [] };
  }

  if (activeBefore.controller !== 'PLAYER' && action.type !== 'AUTO_AI_TURN') {
    return {
      valid: false,
      error: `Action '${action.type}' is not valid during ${activeBefore.controller} turn.`,
      state,
      events: [],
    };
  }

  const nextState = cloneCombatState(state);
  const actor = findUnit(nextState, nextState.activeUnitId ?? undefined)!;
  const countedRng = createCountedSeededRng(nextState.rngSeed, nextState.rngCursor, rng);
  const stepEvents: TurnBasedCombatEvent[] = [];
  const skipTickStatuses = new Set<StatusEffectType>(['GUARDING']);
  let skillUsedThisTurn: string | null = null;

  if (action.type === 'BASIC_ATTACK') {
    const livingEnemies = getLivingUnits(nextState, 'ENEMY');
    const target = action.targetId ? findUnit(nextState, action.targetId) : livingEnemies[0];
    if (!target || !target.alive || target.side !== 'ENEMY') {
      return { valid: false, error: 'Invalid or defeated target for BASIC_ATTACK.', state, events: [] };
    }
    executeBasicAttack(nextState, actor, target, stepEvents, countedRng);
  } else if (action.type === 'GUARD') {
    executeGuard(nextState, actor, stepEvents, skipTickStatuses);
  } else if (action.type === 'USE_SKILL') {
    const skill = actor.equippedSkills.find((s) => s.skillId === action.skillId);
    if (!skill) {
      return { valid: false, error: `Skill '${action.skillId}' is not equipped.`, state, events: [] };
    }
    const res = executeUseSkill(
      nextState,
      actor,
      skill,
      action.targetId,
      stepEvents,
      countedRng,
      skipTickStatuses
    );
    if (!res.ok) {
      return { valid: false, error: res.error, state, events: [] };
    }
    skillUsedThisTurn = res.skillUsedId;
  } else if (action.type === 'USE_CONSUMABLE') {
    const res = executeUseConsumable(
      nextState,
      actor,
      action.beltSlotIndex,
      action.targetId,
      stepEvents,
      skipTickStatuses
    );
    if (!res.ok) {
      return { valid: false, error: res.error, state, events: [] };
    }
  } else if (action.type === 'AUTO_AI_TURN') {
    if (actor.controller === 'AI_COMPANION') {
      const chosen = chooseTurnBasedAiAction(nextState, actor.unitId);
      if (chosen.type === 'BASIC_ATTACK') {
        const livingEnemies = getLivingUnits(nextState, 'ENEMY');
        const target = chosen.targetId ? findUnit(nextState, chosen.targetId) : livingEnemies[0];
        if (target && target.alive) {
          executeBasicAttack(nextState, actor, target, stepEvents, countedRng);
        }
      } else if (chosen.type === 'GUARD') {
        executeGuard(nextState, actor, stepEvents, skipTickStatuses);
      } else if (chosen.type === 'USE_SKILL') {
        const skill = actor.equippedSkills.find((s) => s.skillId === chosen.skillId);
        if (skill) {
          const res = executeUseSkill(
            nextState,
            actor,
            skill,
            chosen.targetId,
            stepEvents,
            countedRng,
            skipTickStatuses
          );
          if (res.ok) skillUsedThisTurn = res.skillUsedId;
        }
      }
    } else {
      executeEnemyIntent(nextState, actor, stepEvents, countedRng, skipTickStatuses);
      if (actor.alive) {
        actor.nextIntent = rollEnemyIntent(actor, nextState, countedRng);
      } else {
        actor.nextIntent = null;
      }
    }
  }

  // Record valid action
  nextState.actionLog.push({ ...action });

  // End-of-turn cleanup on actor
  actor.turnGauge = Math.max(0, actor.turnGauge - CTB_THRESHOLD);

  for (const skillId of Object.keys(actor.skillCooldowns)) {
    if (skillId === skillUsedThisTurn) continue;
    actor.skillCooldowns[skillId] = Math.max(0, (actor.skillCooldowns[skillId] ?? 0) - 1);
  }

  actor.statuses = actor.statuses
    .map((s) => {
      if (skipTickStatuses.has(s.type)) return s;
      return { ...s, remainingTurns: s.remainingTurns - 1 };
    })
    .filter((s) => s.remainingTurns > 0);

  // Check victory / defeat / wave progression
  const livingParty = getLivingUnits(nextState, 'PARTY');
  const livingEnemies = getLivingUnits(nextState, 'ENEMY');

  if (livingParty.length === 0) {
    nextState.status = 'DEFEAT';
    nextState.phase = 'COMPLETED';
    nextState.activeUnitId = null;
    nextState.turnOrderTimeline = [];
    pushEvent(nextState, stepEvents, {
      type: 'ENCOUNTER_END',
      message: 'All party members have fallen. Defeat!',
    });
  } else if (livingEnemies.length === 0) {
    handleAllEnemiesDefeated(nextState, stepEvents, countedRng);
  } else {
    beginActiveUnitTurn(nextState, stepEvents, countedRng);
  }

  nextState.rngCursor += countedRng.getCursorDelta();
  nextState.lastStepEvents = stepEvents;

  return {
    valid: true,
    state: nextState,
    events: stepEvents,
  };
}

export function advanceTurnBasedUntilPlayerOrEnd(
  state: TurnBasedCombatState,
  rng?: SeededRng,
  maxSteps = 24
): TurnBasedStepResult {
  let current = state;
  const aggregatedEvents: TurnBasedCombatEvent[] = [];

  for (let i = 0; i < maxSteps; i++) {
    if (current.status !== 'IN_PROGRESS' || current.phase !== 'AWAITING_AI_TURN') {
      break;
    }
    const step = stepTurnBasedCombat(current, { type: 'AUTO_AI_TURN' }, rng);
    if (!step.valid) {
      return {
        valid: false,
        error: step.error,
        state: current,
        events: aggregatedEvents,
      };
    }
    current = step.state;
    aggregatedEvents.push(...step.events);
  }

  return {
    valid: true,
    state: current,
    events: aggregatedEvents,
  };
}

export function replayAndVerifyTurnBasedRun(
  input: CreateTurnBasedEncounterInput,
  actions: readonly TurnBasedCombatAction[]
): { valid: boolean; error?: string; finalState: TurnBasedCombatState } {
  let current = createTurnBasedEncounter(input);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    const res = stepTurnBasedCombat(current, action);
    if (!res.valid) {
      return {
        valid: false,
        error: `Replay failed at action index ${i} (${action.type}): ${res.error ?? 'Unknown error'}`,
        finalState: current,
      };
    }
    current = res.state;
  }

  if (current.status === 'IN_PROGRESS') {
    return {
      valid: false,
      error: 'Replay ended while encounter was still IN_PROGRESS.',
      finalState: current,
    };
  }

  return {
    valid: true,
    finalState: current,
  };
}

// ============================================================================
// 5. CANONICAL CATALOGS (AI COMPANY PRESETS & GUILD QUESTS)
// ============================================================================

export const ADVENTURER_COMPANY_AI_PRESETS: readonly TurnBasedPartyMemberInput[] = [
  {
    characterId: 'ally_lyra',
    name: 'Lyra (Guild Warden)',
    controller: 'AI_COMPANION',
    race: 'KITSUNE',
    coreStats: { strengthLevel: 4, enduranceLevel: 9, agilityLevel: 6, wisLevel: 6, sprLevel: 5 },
    equipmentBonuses: { maxHp: 75, maxStamina: 40, armorRating: 14 },
    unlockedTalentRanks: {
      war_deep_lungs: 3,
      war_renewal_aura: 2,
      war_second_wind_hymn: 1,
      out_trailblazer: 2,
    },
    activeSkillIds: ['war_second_wind_hymn'],
  },
  {
    characterId: 'ally_kaelen',
    name: 'Kaelen (Guild Assassin)',
    controller: 'AI_COMPANION',
    race: 'HUMAN',
    coreStats: { strengthLevel: 6, enduranceLevel: 5, agilityLevel: 10, dexLevel: 7 },
    equipmentBonuses: { meleePower: 26, critChance: 0.08, attackSpeedPct: 0.12 },
    unlockedTalentRanks: {
      ass_shadowstep_reflexes: 3,
      ass_ambush_lethality: 2,
      ass_phantom_strike: 1,
    },
    activeSkillIds: ['ass_phantom_strike'],
  },
  {
    characterId: 'ally_torin',
    name: 'Torin (Guild Vanguard)',
    controller: 'AI_COMPANION',
    race: 'ONI',
    coreStats: { strengthLevel: 10, enduranceLevel: 7, agilityLevel: 4, conLevel: 6 },
    equipmentBonuses: { meleePower: 30, armorRating: 20 },
    unlockedTalentRanks: {
      van_heavy_handed: 3,
      van_sundering_strikes: 2,
      van_colossus_cleave: 1,
    },
    activeSkillIds: ['van_colossus_cleave'],
  },
];

export const DEFAULT_GUILD_QUEST_CATALOG: readonly GuildQuestDefinition[] = [
  {
    questSlug: 'guild_contract_crypt_patrol',
    title: 'Crypt Gate Patrol',
    description:
      'Clear undead scouts patrolling the outer catacombs. Calibrated for fresh Copper-rank recruits.',
    category: 'LIVE_QUEST',
    requiredRank: 'COPPER',
    recommendedPower: 55,
    goldReward: 95,
    reputationReward: 45,
    lootRolls: 1,
    waves: [
      {
        waveNumber: 1,
        waveName: 'Outer Crypt Scouts',
        enemies: [
          {
            enemyId: 'crypt_ghoul_scout',
            name: 'Crypt Ghoul Scout',
            maxHp: 42,
            attackPower: 7,
            armor: 2,
            attackIntervalSeconds: 1.5,
            agility: 2,
            intentBias: 'STRIKE',
          },
          {
            enemyId: 'bone_sentinel',
            name: 'Bone Sentinel',
            maxHp: 46,
            attackPower: 8,
            armor: 3,
            attackIntervalSeconds: 1.65,
            agility: 2,
            intentBias: 'STRIKE',
          },
        ],
      },
      {
        waveNumber: 2,
        waveName: 'Watch-Captain of the Gate',
        enemies: [
          {
            enemyId: 'crypt_watch_captain',
            name: 'Crypt Watch-Captain',
            isBoss: true,
            maxHp: 78,
            attackPower: 10,
            armor: 4,
            attackIntervalSeconds: 1.6,
            agility: 3,
            intentBias: 'HEAVY_SMASH',
          },
        ],
      },
    ],
    lootTable: [
      {
        itemSlug: 'iron_ore_cluster',
        itemName: 'Rich Iron Ore Cluster',
        rarity: 'COMMON',
        quantity: 2,
        weight: 65,
      },
      {
        itemSlug: 'sunleaf_healing_draught',
        itemName: 'Sunleaf Healing Draught',
        rarity: 'COMMON',
        quantity: 1,
        weight: 35,
      },
    ],
    briefingLines: [
      'Skeleton sentries have been sighted near the outer crypt steps.',
      'Strike cleanly and use Guard whenever the Watch-Captain winds up a Heavy Smash.',
    ],
    victoryDebriefLines: [
      'The outer gate is secure. The Guild Clerk logs your patrol commendation.',
    ],
  },
  {
    questSlug: 'guild_contract_whisperwood_ambush',
    title: 'Whisperwood Ambush',
    description:
      'Drive back briarstalkers harrying merchant caravans along the Whisperwood trail.',
    category: 'LIVE_QUEST',
    requiredRank: 'COPPER',
    recommendedPower: 80,
    goldReward: 130,
    reputationReward: 65,
    lootRolls: 2,
    waves: [
      {
        waveNumber: 1,
        waveName: 'Thicket Stalkers',
        enemies: [
          {
            enemyId: 'briar_stalker',
            name: 'Briar Stalker',
            maxHp: 64,
            attackPower: 10,
            armor: 4,
            attackIntervalSeconds: 1.45,
            agility: 4,
            intentBias: 'STRIKE',
          },
          {
            enemyId: 'thorn_hound',
            name: 'Thorn Hound',
            maxHp: 56,
            attackPower: 11,
            armor: 3,
            attackIntervalSeconds: 1.35,
            agility: 5,
            intentBias: 'STRIKE',
          },
        ],
      },
      {
        waveNumber: 2,
        waveName: 'Bramble Ambushers',
        enemies: [
          {
            enemyId: 'hex_druid',
            name: 'Feral Hex-Druid',
            maxHp: 72,
            attackPower: 12,
            armor: 5,
            attackIntervalSeconds: 1.6,
            agility: 3,
            intentBias: 'DEBUFF_HEX',
          },
          {
            enemyId: 'briar_warden',
            name: 'Briar Warden',
            maxHp: 85,
            attackPower: 11,
            armor: 8,
            attackIntervalSeconds: 1.75,
            agility: 2,
            intentBias: 'GUARD_BUFF',
          },
        ],
      },
      {
        waveNumber: 3,
        waveName: 'Alpha Gnarlfang',
        enemies: [
          {
            enemyId: 'alpha_gnarlfang',
            name: 'Alpha Gnarlfang',
            isBoss: true,
            maxHp: 135,
            attackPower: 15,
            armor: 7,
            attackIntervalSeconds: 1.55,
            agility: 4,
            cleaveTargets: 2,
            intentBias: 'CLEAVE',
          },
        ],
      },
    ],
    lootTable: [
      {
        itemSlug: 'whisperwood_timber',
        itemName: 'Whisperwood Timber',
        rarity: 'COMMON',
        quantity: 2,
        weight: 55,
      },
      {
        itemSlug: 'tempered_whetstone',
        itemName: 'Tempered Whetstone',
        rarity: 'UNCOMMON',
        quantity: 1,
        weight: 45,
      },
    ],
    briefingLines: [
      'Caravan guards spotted nimble thorn-beasts and a hex-caster in the canopy.',
      'Bring a healing draught or recruit a companion before engaging the Alpha.',
    ],
    victoryDebriefLines: [
      'Trade wagons roll freely down the Whisperwood road once more.',
    ],
  },
  {
    questSlug: 'rank_trial_copper_to_iron',
    title: 'Iron Promotion Trial: Crucible of Stone',
    description:
      'Official Guild rank-up trial to earn Iron-Rank certification. Prove stamina and tactical guard.',
    category: 'RANK_UP_TRIAL',
    requiredRank: 'COPPER',
    unlocksRank: 'IRON',
    recommendedPower: 95,
    goldReward: 250,
    reputationReward: 180,
    trialRequirements: { workoutsLogged: 1 },
    lootRolls: 2,
    waves: [
      {
        waveNumber: 1,
        waveName: 'Proving Constructs',
        enemies: [
          {
            enemyId: 'iron_automaton_initiate',
            name: 'Iron Automaton',
            maxHp: 80,
            attackPower: 12,
            armor: 8,
            attackIntervalSeconds: 1.7,
            agility: 2,
            intentBias: 'STRIKE',
          },
        ],
      },
      {
        waveNumber: 2,
        waveName: 'Twin Sentinels',
        enemies: [
          {
            enemyId: 'crucible_halberdier',
            name: 'Crucible Halberdier',
            maxHp: 78,
            attackPower: 13,
            armor: 7,
            attackIntervalSeconds: 1.55,
            agility: 3,
            intentBias: 'HEAVY_SMASH',
          },
          {
            enemyId: 'crucible_arbalist',
            name: 'Crucible Arbalist',
            maxHp: 64,
            attackPower: 14,
            armor: 4,
            attackIntervalSeconds: 1.45,
            agility: 5,
            intentBias: 'STRIKE',
          },
        ],
      },
      {
        waveNumber: 3,
        waveName: 'Examining Warden Korr',
        enemies: [
          {
            enemyId: 'examining_warden_korr',
            name: 'Examining Warden Korr',
            isBoss: true,
            maxHp: 175,
            attackPower: 17,
            armor: 11,
            attackIntervalSeconds: 1.65,
            agility: 3,
            cleaveTargets: 2,
            intentBias: 'HEAVY_SMASH',
          },
        ],
      },
    ],
    lootTable: [
      {
        itemSlug: 'iron_guild_crest',
        itemName: 'Iron Guild Crest',
        rarity: 'RARE',
        quantity: 1,
        weight: 50,
      },
      {
        itemSlug: 'vitality_elixir',
        itemName: 'Elixir of Peak Output',
        rarity: 'RARE',
        quantity: 1,
        weight: 50,
      },
    ],
    briefingLines: [
      'You must log at least 1 real-world workout and defeat Examining Warden Korr.',
      'Korr telegraphs crushing strikes—time your Guard and Parry counters wisely.',
    ],
    victoryDebriefLines: [
      'Warden Korr lowers his greatsword in salute. You are certified Iron Rank!',
    ],
  },
  {
    questSlug: 'guild_contract_sunken_sanctum',
    title: 'Sunken Sanctum Reclamation',
    description:
      'Purge drowned acolytes and tide-bound constructs from the flooded shrine.',
    category: 'LIVE_QUEST',
    requiredRank: 'IRON',
    recommendedPower: 140,
    goldReward: 210,
    reputationReward: 100,
    lootRolls: 2,
    waves: [
      {
        waveNumber: 1,
        waveName: 'Tidepool Acolytes',
        enemies: [
          {
            enemyId: 'drowned_acolyte',
            name: 'Drowned Acolyte',
            maxHp: 96,
            attackPower: 16,
            armor: 7,
            attackIntervalSeconds: 1.5,
            agility: 4,
            intentBias: 'DEBUFF_HEX',
          },
          {
            enemyId: 'coral_golem',
            name: 'Coral Golem',
            maxHp: 120,
            attackPower: 15,
            armor: 12,
            attackIntervalSeconds: 1.85,
            agility: 2,
            intentBias: 'GUARD_BUFF',
          },
        ],
      },
      {
        waveNumber: 2,
        waveName: 'Abyssal Honor Guard',
        enemies: [
          {
            enemyId: 'sunken_myrmidon',
            name: 'Sunken Myrmidon',
            maxHp: 118,
            attackPower: 18,
            armor: 10,
            attackIntervalSeconds: 1.5,
            agility: 4,
            intentBias: 'STRIKE',
          },
          {
            enemyId: 'sunken_myrmidon_2',
            name: 'Tideblade Duelist',
            maxHp: 102,
            attackPower: 19,
            armor: 7,
            attackIntervalSeconds: 1.35,
            agility: 6,
            intentBias: 'STRIKE',
          },
        ],
      },
      {
        waveNumber: 3,
        waveName: 'High Tidecaller Vess',
        enemies: [
          {
            enemyId: 'tidecaller_vess',
            name: 'High Tidecaller Vess',
            isBoss: true,
            maxHp: 245,
            attackPower: 22,
            armor: 12,
            attackIntervalSeconds: 1.55,
            agility: 5,
            cleaveTargets: 2,
            intentBias: 'CLEAVE',
          },
        ],
      },
    ],
    lootTable: [
      {
        itemSlug: 'astral_mana_tonic',
        itemName: 'Astral Clarity Tonic',
        rarity: 'UNCOMMON',
        quantity: 1,
        weight: 55,
      },
      {
        itemSlug: 'obsidian_ingot',
        itemName: 'Obsidian Steel Ingot',
        rarity: 'UNCOMMON',
        quantity: 2,
        weight: 45,
      },
    ],
    briefingLines: [
      'Flooded corridors amplify hexes and sweeping tide slashes.',
      'Focus down the Acolytes early before their Vulnerable hex stacks up.',
    ],
    victoryDebriefLines: [
      'The shrine waters calm as Vess falls. Salvage teams move in behind you.',
    ],
  },
  {
    questSlug: 'rank_trial_iron_to_bronze',
    title: 'Bronze Promotion Trial: Vault of Ashes',
    description:
      'High-stakes Guild trial granting Bronze-Rank authority upon triumph.',
    category: 'RANK_UP_TRIAL',
    requiredRank: 'IRON',
    unlocksRank: 'BRONZE',
    recommendedPower: 185,
    goldReward: 420,
    reputationReward: 300,
    trialRequirements: { totalStatLevel: 10 },
    lootRolls: 3,
    waves: [
      {
        waveNumber: 1,
        waveName: 'Cinder Vanguard',
        enemies: [
          {
            enemyId: 'cinder_shieldbearer',
            name: 'Cinder Shieldbearer',
            maxHp: 135,
            attackPower: 19,
            armor: 14,
            attackIntervalSeconds: 1.7,
            agility: 3,
            intentBias: 'GUARD_BUFF',
          },
          {
            enemyId: 'ash_pyromancer',
            name: 'Ash Pyromancer',
            maxHp: 110,
            attackPower: 22,
            armor: 6,
            attackIntervalSeconds: 1.5,
            agility: 5,
            intentBias: 'DEBUFF_HEX',
          },
        ],
      },
      {
        waveNumber: 2,
        waveName: 'Forged Executioners',
        enemies: [
          {
            enemyId: 'ember_reaver',
            name: 'Ember Reaver',
            maxHp: 150,
            attackPower: 24,
            armor: 10,
            attackIntervalSeconds: 1.45,
            agility: 6,
            intentBias: 'HEAVY_SMASH',
          },
          {
            enemyId: 'ember_reaver_2',
            name: 'Slaghound Alpha',
            maxHp: 125,
            attackPower: 21,
            armor: 8,
            attackIntervalSeconds: 1.3,
            agility: 7,
            intentBias: 'STRIKE',
          },
        ],
      },
      {
        waveNumber: 3,
        waveName: 'Grand Arbiter Ignis',
        enemies: [
          {
            enemyId: 'arbiter_ignis',
            name: 'Grand Arbiter Ignis',
            isBoss: true,
            maxHp: 330,
            attackPower: 28,
            armor: 15,
            attackIntervalSeconds: 1.5,
            agility: 5,
            cleaveTargets: 3,
            intentBias: 'CLEAVE',
          },
        ],
      },
    ],
    lootTable: [
      {
        itemSlug: 'bronze_guild_signet',
        itemName: 'Bronze Guild Signet',
        rarity: 'EPIC',
        quantity: 1,
        weight: 40,
      },
      {
        itemSlug: 'vitality_elixir',
        itemName: 'Elixir of Peak Output',
        rarity: 'RARE',
        quantity: 2,
        weight: 60,
      },
    ],
    briefingLines: [
      'Bronze certification demands at least 10 total stat levels and mastery of party synergy.',
      'Grand Arbiter Ignis cleaves multiple targets—bring a healer or vanguard tank.',
    ],
    victoryDebriefLines: [
      'The Vault of Ashes echoes with applause. Bronze Rank credentials are yours!',
    ],
  },
  {
    questSlug: 'guild_contract_obsidian_breach',
    title: 'Obsidian Rift Breach',
    description:
      'Seal a four-wave rift incursion spewing void-forged horrors into the borderlands.',
    category: 'LIVE_QUEST',
    requiredRank: 'BRONZE',
    recommendedPower: 240,
    goldReward: 340,
    reputationReward: 150,
    lootRolls: 3,
    waves: [
      {
        waveNumber: 1,
        waveName: 'Rift Skirmishers',
        enemies: [
          {
            enemyId: 'void_skitterer',
            name: 'Void Skitterer',
            maxHp: 130,
            attackPower: 23,
            armor: 9,
            attackIntervalSeconds: 1.3,
            agility: 7,
            intentBias: 'STRIKE',
          },
          {
            enemyId: 'rift_stalker',
            name: 'Rift Stalker',
            maxHp: 145,
            attackPower: 25,
            armor: 10,
            attackIntervalSeconds: 1.4,
            agility: 6,
            intentBias: 'STRIKE',
          },
        ],
      },
      {
        waveNumber: 2,
        waveName: 'Null Bulwark',
        enemies: [
          {
            enemyId: 'obsidian_colossus',
            name: 'Obsidian Colossus',
            maxHp: 210,
            attackPower: 26,
            armor: 18,
            attackIntervalSeconds: 1.85,
            agility: 2,
            intentBias: 'HEAVY_SMASH',
          },
          {
            enemyId: 'null_weaver',
            name: 'Null Weaver',
            maxHp: 135,
            attackPower: 24,
            armor: 7,
            attackIntervalSeconds: 1.5,
            agility: 5,
            intentBias: 'DEBUFF_HEX',
          },
        ],
      },
      {
        waveNumber: 3,
        waveName: 'Riftbound Twinblades',
        enemies: [
          {
            enemyId: 'rift_blade_1',
            name: 'Shadowbrand Zealot',
            maxHp: 165,
            attackPower: 28,
            armor: 11,
            attackIntervalSeconds: 1.35,
            agility: 7,
            intentBias: 'CLEAVE',
            cleaveTargets: 2,
          },
          {
            enemyId: 'rift_blade_2',
            name: 'Voidspire Enforcer',
            maxHp: 175,
            attackPower: 27,
            armor: 13,
            attackIntervalSeconds: 1.5,
            agility: 5,
            intentBias: 'HEAVY_SMASH',
          },
        ],
      },
      {
        waveNumber: 4,
        waveName: 'Abyssal Harbinger Xylar',
        enemies: [
          {
            enemyId: 'harbinger_xylar',
            name: 'Abyssal Harbinger Xylar',
            isBoss: true,
            maxHp: 420,
            attackPower: 34,
            armor: 17,
            attackIntervalSeconds: 1.45,
            agility: 6,
            cleaveTargets: 3,
            intentBias: 'CLEAVE',
          },
        ],
      },
    ],
    lootTable: [
      {
        itemSlug: 'voidforged_shard',
        itemName: 'Voidforged Shard',
        rarity: 'EPIC',
        quantity: 1,
        weight: 45,
      },
      {
        itemSlug: 'obsidian_ingot',
        itemName: 'Obsidian Steel Ingot',
        rarity: 'UNCOMMON',
        quantity: 4,
        weight: 55,
      },
    ],
    briefingLines: [
      'Four relentless waves pour out of the Obsidian Rift.',
      'Manage cooldowns and save Mana Tonics or Healing Draughts for Harbinger Xylar.',
    ],
    victoryDebriefLines: [
      'The rift collapses inward with a resonant chime. The borderlands are safe.',
    ],
  },
];

export function isGuildQuestUnlockedForRank(
  quest: GuildQuestDefinition,
  playerRank: string
): boolean {
  return isAdventurerRankSufficient(playerRank, quest.requiredRank);
}

export type { LootDrop };
