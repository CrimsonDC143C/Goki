import { CharacterCustomizationConfig, CharacterRace } from './character-customization';
import { calculateDerivedCombatStats } from './character-loadout-spoils';
import { calculateDistanceMeters } from './hybrid-reward-protocol';
import { PrimaryStatBonuses } from './item-affix-engine';
import { aggregateTalentModifiers } from './talent-engine';
import {
  CombatantSide,
  GuildQuestWaveEnemy,
  TurnBasedCombatEvent,
  TurnBasedCombatState,
  TurnBasedPartyMemberInput,
  chooseTurnBasedAiAction,
  createTurnBasedEncounter,
  stepTurnBasedCombat,
} from './turn-based-combat';
import { CoreStatBlock, EquipmentStatBonuses, normalizeCoreStatBlock } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

export const OPEN_WORLD_HOME_CLAN_SLUG = 'open_world_home';
export const OPEN_WORLD_HOME_CLAN_VENUE_KEY = 'system:open_world_home';
export const OPEN_WORLD_HOME_CLAN_NAME = 'Hearthstone Open-World Sanctum';
export const OPEN_WORLD_HOME_CLAN_TAG = 'HOME';
export const GYM_VENUE_DEDUPE_RADIUS_METERS = 150;
export const GYM_VENUE_EXACT_PROXIMITY_METERS = 60;
export const MAX_COMPANY_ROSTER_SIZE = 30;
export const MAX_COMPANY_ACTIVE_SQUAD_SIZE = 4;

const ARENA_RATING_K_FACTOR = 28;
const ARENA_RATING_FLOOR = 800;
const DEFAULT_ARENA_RATING = 1000;

// ============================================================================
// VENUE NORMALIZATION & COORDINATE DEDUPLICATION
// ============================================================================

/**
 * Normalizes a gym venue name by lowercasing, stripping apostrophes/punctuation,
 * collapsing repeated whitespace, and trimming ends.
 */
export function normalizeGymVenueName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertValidCoordinates(latitude: number | null | undefined, longitude: number | null | undefined): {
  latitude: number;
  longitude: number;
} {
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error(
      `Invalid gym venue latitude '${String(latitude)}': expected finite number in [-90, 90].`
    );
  }
  if (
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      `Invalid gym venue longitude '${String(longitude)}': expected finite number in [-180, 180].`
    );
  }
  return { latitude, longitude };
}

/**
 * Builds a deterministic canonical venue key from OpenStreetMap identifiers,
 * external place providers, or validated geographic coordinates + normalized name.
 */
export function buildCanonicalVenueKey(params: {
  isOpenWorldHome?: boolean;
  osmElementType?: string | null;
  osmElementId?: string | number | null;
  externalProvider?: string | null;
  externalPlaceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  name?: string;
}): string {
  if (params.isOpenWorldHome) {
    return OPEN_WORLD_HOME_CLAN_VENUE_KEY;
  }

  if (
    params.osmElementType &&
    params.osmElementType.trim().length > 0 &&
    params.osmElementId !== undefined &&
    params.osmElementId !== null &&
    String(params.osmElementId).trim().length > 0
  ) {
    return `osm:${String(params.osmElementType).trim().toLowerCase()}:${String(params.osmElementId).trim()}`;
  }

  if (
    params.externalProvider &&
    params.externalProvider.trim().length > 0 &&
    params.externalPlaceId &&
    String(params.externalPlaceId).trim().length > 0
  ) {
    const providerKey = normalizeGymVenueName(params.externalProvider) || 'external';
    return `ext:${providerKey}:${String(params.externalPlaceId).trim()}`;
  }

  const { latitude, longitude } = assertValidCoordinates(params.latitude, params.longitude);
  const normalizedName = normalizeGymVenueName(params.name || 'gym') || 'gym';
  const slugSegment = normalizedName.replace(/\s+/g, '_').slice(0, 32) || 'gym';
  return `geo:${latitude.toFixed(3)}:${longitude.toFixed(3)}:${slugSegment}`;
}

export interface CanonicalGymVenueCandidate {
  id?: string;
  venueKey: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  kind?: 'OPEN_WORLD_HOME' | 'GYM_VENUE' | string;
}

function doNormalizedVenueNamesMatch(nameA: string, nameB: string): boolean {
  const normA = normalizeGymVenueName(nameA);
  const normB = normalizeGymVenueName(nameB);
  if (normA.length < 3 || normB.length < 3) {
    return false;
  }
  return normA === normB || normA.includes(normB) || normB.includes(normA);
}

/**
 * Finds the closest existing physical gym venue matching a candidate by exact `venueKey`,
 * exact proximity (<= 60m), or radius proximity (<= 150m default) with matching normalized names.
 */
export function findDeduplicatedVenueMatch<T extends CanonicalGymVenueCandidate>(
  candidate: { venueKey?: string; name: string; latitude: number; longitude: number },
  existingVenues: readonly T[],
  radiusMeters = GYM_VENUE_DEDUPE_RADIUS_METERS
): T | null {
  assertValidCoordinates(candidate.latitude, candidate.longitude);

  const eligibleVenues = existingVenues.filter(
    (v) =>
      v.kind !== 'OPEN_WORLD_HOME' &&
      typeof v.latitude === 'number' &&
      Number.isFinite(v.latitude) &&
      typeof v.longitude === 'number' &&
      Number.isFinite(v.longitude)
  );

  if (candidate.venueKey) {
    const exactKeyMatch = eligibleVenues.find((v) => v.venueKey === candidate.venueKey);
    if (exactKeyMatch) {
      return exactKeyMatch;
    }
  }

  let closestMatch: T | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const venue of eligibleVenues) {
    const distance = calculateDistanceMeters(
      candidate.latitude,
      candidate.longitude,
      venue.latitude as number,
      venue.longitude as number
    );

    const isExactProximity = distance <= GYM_VENUE_EXACT_PROXIMITY_METERS;
    const isNameMatchedInRadius =
      distance <= radiusMeters && doNormalizedVenueNamesMatch(candidate.name, venue.name);

    if ((isExactProximity || isNameMatchedInRadius) && distance < closestDistance) {
      closestDistance = distance;
      closestMatch = venue;
    }
  }

  return closestMatch;
}

// ============================================================================
// MEMBERSHIP & COMPANY SQUAD VALIDATION
// ============================================================================

/**
 * Validates dual-clan membership constraints: a character may belong to at most
 * one `OPEN_WORLD_HOME` clan and at most one physical `GYM_VENUE` clan.
 */
export function validateDualClanMembership(
  memberships: ReadonlyArray<{ gymClanId: string; clanKind: 'OPEN_WORLD_HOME' | 'GYM_VENUE' }>
): { valid: boolean; hasHomeClan: boolean; gymVenueClanId: string | null; error?: string } {
  const homeClanIds: string[] = [];
  const gymVenueClanIds: string[] = [];

  for (const membership of memberships) {
    if (membership.clanKind === 'OPEN_WORLD_HOME') {
      homeClanIds.push(membership.gymClanId);
    } else if (membership.clanKind === 'GYM_VENUE') {
      gymVenueClanIds.push(membership.gymClanId);
    } else {
      return {
        valid: false,
        hasHomeClan: homeClanIds.length > 0,
        gymVenueClanId: gymVenueClanIds[0] ?? null,
        error: `Unsupported clanKind '${String(membership.clanKind)}'.`,
      };
    }
  }

  if (homeClanIds.length > 1) {
    return {
      valid: false,
      hasHomeClan: true,
      gymVenueClanId: gymVenueClanIds[0] ?? null,
      error: 'A character can belong to at most one OPEN_WORLD_HOME clan.',
    };
  }

  if (gymVenueClanIds.length > 1) {
    return {
      valid: false,
      hasHomeClan: homeClanIds.length === 1,
      gymVenueClanId: gymVenueClanIds[0] ?? null,
      error: 'A character can belong to at most one GYM_VENUE clan.',
    };
  }

  return {
    valid: true,
    hasHomeClan: homeClanIds.length === 1,
    gymVenueClanId: gymVenueClanIds[0] ?? null,
  };
}

/**
 * Validates an Adventurer Company roster and active squad slot assignment (up to 30 roster
 * members, up to 4 active squad slots numbered 1..4 with unique character IDs and slots).
 */
export function validateCompanySquadAssignment(params: {
  rosterCharacterIds: readonly string[];
  assignments: ReadonlyArray<{ characterId: string; squadSlot: number }>;
}): { valid: boolean; error?: string } {
  if (params.rosterCharacterIds.length > MAX_COMPANY_ROSTER_SIZE) {
    return {
      valid: false,
      error: `Company roster cannot exceed ${MAX_COMPANY_ROSTER_SIZE} characters.`,
    };
  }

  if (params.assignments.length > MAX_COMPANY_ACTIVE_SQUAD_SIZE) {
    return {
      valid: false,
      error: `Active squad cannot exceed ${MAX_COMPANY_ACTIVE_SQUAD_SIZE} characters.`,
    };
  }

  const rosterSet = new Set(params.rosterCharacterIds);
  const seenSlots = new Set<number>();
  const seenCharacters = new Set<string>();

  for (const assignment of params.assignments) {
    if (!Number.isInteger(assignment.squadSlot) || assignment.squadSlot < 1 || assignment.squadSlot > MAX_COMPANY_ACTIVE_SQUAD_SIZE) {
      return {
        valid: false,
        error: `Invalid squadSlot '${String(assignment.squadSlot)}': must be an integer between 1 and ${MAX_COMPANY_ACTIVE_SQUAD_SIZE}.`,
      };
    }

    if (seenSlots.has(assignment.squadSlot)) {
      return {
        valid: false,
        error: `Duplicate squadSlot '${assignment.squadSlot}' in active squad assignments.`,
      };
    }
    seenSlots.add(assignment.squadSlot);

    if (seenCharacters.has(assignment.characterId)) {
      return {
        valid: false,
        error: `Duplicate characterId '${assignment.characterId}' in active squad assignments.`,
      };
    }
    seenCharacters.add(assignment.characterId);

    if (!rosterSet.has(assignment.characterId)) {
      return {
        valid: false,
        error: `Character '${assignment.characterId}' is not on the company roster.`,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// MONTHLY GYM CLAN SEASONAL SCORING
// ============================================================================

/**
 * Returns the UTC calendar month key (`YYYY-MM`) for the given date or current time.
 */
export function getCurrentSeasonKey(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Computes UTC inclusive start (`YYYY-MM-01T00:00:00.000Z`) and exclusive end
 * (first instant of the following UTC month) for a `YYYY-MM` season key.
 */
export function getSeasonWindowBounds(seasonKey: string): { startsAt: Date; endsAt: Date } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(seasonKey.trim());
  if (!match) {
    throw new Error(`Invalid seasonKey '${seasonKey}': expected UTC 'YYYY-MM' format.`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const startsAt = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const endsAt = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  return { startsAt, endsAt };
}

/**
 * Calculates Gym Clan seasonal leaderboard points from workout sessions, workout volume,
 * raid boss damage, and async arena matches.
 */
export function calculateGymClanSeasonPoints(input: {
  workoutsCount?: number;
  workoutVolumeScore?: number;
  raidDamageScore?: number;
  arenaVictories?: number;
  arenaMatchesPlayed?: number;
}): {
  workoutPoints: number;
  raidPoints: number;
  arenaPoints: number;
  totalSeasonPoints: number;
} {
  const workoutsCount = Math.max(0, input.workoutsCount ?? 0);
  const workoutVolumeScore = Math.max(0, input.workoutVolumeScore ?? 0);
  const raidDamageScore = Math.max(0, input.raidDamageScore ?? 0);
  const arenaVictories = Math.max(0, input.arenaVictories ?? 0);
  const arenaMatchesPlayed = Math.max(0, input.arenaMatchesPlayed ?? 0);

  const workoutPoints = Math.max(0, Math.round(workoutsCount * 50 + workoutVolumeScore / 100));
  const raidPoints = Math.max(0, Math.floor(raidDamageScore / 1000));
  const arenaLossesOrDraws = Math.max(0, arenaMatchesPlayed - arenaVictories);
  const arenaPoints = Math.max(0, arenaVictories * 35 + arenaLossesOrDraws * 10);
  const totalSeasonPoints = workoutPoints + raidPoints + arenaPoints;

  return {
    workoutPoints,
    raidPoints,
    arenaPoints,
    totalSeasonPoints,
  };
}

// ============================================================================
// ASYNC ARENA AI SPARRING ENGINE
// ============================================================================

export interface ArenaFighterSnapshot {
  characterId: string;
  name: string;
  overallLevel: number;
  race?: CharacterRace;
  appearanceId?: string;
  customizationConfig?: CharacterCustomizationConfig;
  coreStats: CoreStatBlock;
  equipmentBonuses?: EquipmentStatBonuses;
  equipmentPrimaryStatBonuses?: PrimaryStatBonuses;
  unlockedTalentRanks?: Record<string, number>;
  activeSkillIds?: readonly string[];
  beltSlots?: ReadonlyArray<{ itemSlug: string | null; charges: number }>;
  arenaRating?: number;
}

export interface ArenaRivalPreset extends ArenaFighterSnapshot {
  slug: string;
  title: string;
  gymClanName: string;
}

export const DEFAULT_ARENA_RIVAL_PRESETS: readonly ArenaRivalPreset[] = [
  {
    slug: 'arena_rival_iron_ronin',
    characterId: 'arena_rival_iron_ronin',
    name: 'Kenji, Iron Ronin',
    title: 'Iron Ronin',
    gymClanName: 'Ironclad Dojo',
    overallLevel: 3,
    race: 'HUMAN',
    coreStats: {
      strengthLevel: 5,
      enduranceLevel: 4,
      agilityLevel: 4,
      dexLevel: 3,
      conLevel: 3,
      wisLevel: 2,
      sprLevel: 2,
    },
    equipmentBonuses: {
      maxHp: 35,
      meleePower: 8,
      armorRating: 6,
    },
    unlockedTalentRanks: {
      van_heavy_handed: 2,
      van_sundering_strikes: 1,
    },
    arenaRating: 1000,
  },
  {
    slug: 'arena_rival_frost_oni',
    characterId: 'arena_rival_frost_oni',
    name: 'Raiden, Frost Oni',
    title: 'Frost Oni',
    gymClanName: 'Glacier Forge Barbell',
    overallLevel: 7,
    race: 'ONI',
    coreStats: {
      strengthLevel: 9,
      enduranceLevel: 8,
      agilityLevel: 5,
      dexLevel: 5,
      conLevel: 7,
      wisLevel: 4,
      sprLevel: 5,
    },
    equipmentBonuses: {
      maxHp: 90,
      meleePower: 20,
      armorRating: 16,
      damageMitigationPct: 0.04,
    },
    unlockedTalentRanks: {
      van_heavy_handed: 3,
      van_sundering_strikes: 2,
      war_deep_lungs: 2,
    },
    arenaRating: 1180,
  },
  {
    slug: 'arena_rival_nine_flare',
    characterId: 'arena_rival_nine_flare',
    name: 'Akari, Nine-Flare',
    title: 'Nine-Flare Prodigy',
    gymClanName: 'Astral Fox Sanctum',
    overallLevel: 12,
    race: 'KITSUNE',
    coreStats: {
      strengthLevel: 11,
      enduranceLevel: 10,
      agilityLevel: 14,
      dexLevel: 12,
      conLevel: 8,
      wisLevel: 10,
      sprLevel: 10,
    },
    equipmentBonuses: {
      maxHp: 140,
      meleePower: 32,
      armorRating: 22,
      critChance: 0.1,
      attackSpeedPct: 0.15,
      dodgeRating: 0.06,
    },
    unlockedTalentRanks: {
      ass_shadowstep_reflexes: 3,
      ass_ambush_lethality: 3,
      war_deep_lungs: 2,
      war_renewal_aura: 2,
    },
    arenaRating: 1380,
  },
];

/**
 * Calculates K-factor 28 Elo rating deltas for challenger and defender,
 * clamping final ratings at floor 800.
 */
export function calculateArenaRatingDelta(
  challengerRating: number,
  defenderRating: number,
  challengerWon: boolean
): {
  challengerDelta: number;
  defenderDelta: number;
  nextChallengerRating: number;
  nextDefenderRating: number;
} {
  const safeChallenger = Math.max(ARENA_RATING_FLOOR, Math.round(challengerRating));
  const safeDefender = Math.max(ARENA_RATING_FLOOR, Math.round(defenderRating));

  const expectedChallenger = 1 / (1 + Math.pow(10, (safeDefender - safeChallenger) / 400));
  const actualChallenger = challengerWon ? 1 : 0;

  const rawChallengerDelta = Math.round(
    ARENA_RATING_K_FACTOR * (actualChallenger - expectedChallenger)
  );
  const rawDefenderDelta = -rawChallengerDelta;

  const nextChallengerRating = Math.max(ARENA_RATING_FLOOR, safeChallenger + rawChallengerDelta);
  const nextDefenderRating = Math.max(ARENA_RATING_FLOOR, safeDefender + rawDefenderDelta);

  return {
    challengerDelta: nextChallengerRating - safeChallenger,
    defenderDelta: nextDefenderRating - safeDefender,
    nextChallengerRating,
    nextDefenderRating,
  };
}

export interface AsyncArenaMatchSimulationResult {
  matchId: string;
  seed: string;
  winnerCharacterId: string;
  loserCharacterId: string;
  outcome: 'CHALLENGER_VICTORY' | 'DEFENDER_VICTORY';
  totalTurns: number;
  challengerRemainingHp: number;
  defenderRemainingHp: number;
  challengerDamageDealt: number;
  defenderDamageDealt: number;
  challengerRatingDelta: number;
  defenderRatingDelta: number;
  nextChallengerRating: number;
  nextDefenderRating: number;
  goldAwarded: number;
  seasonPointsAwarded: number;
  finalState: TurnBasedCombatState;
  combatLog: TurnBasedCombatEvent[];
}

function buildDefenderWaveEnemy(defender: ArenaFighterSnapshot): GuildQuestWaveEnemy {
  const normalizedStats = normalizeCoreStatBlock(defender.coreStats, 0);
  const talents = aggregateTalentModifiers(defender.unlockedTalentRanks ?? {});
  const derived = calculateDerivedCombatStats({
    coreStats: defender.coreStats,
    equipmentBonuses: defender.equipmentBonuses,
    equipmentPrimaryStats: defender.equipmentPrimaryStatBonuses,
    unlockedTalentRanks: defender.unlockedTalentRanks,
  });

  const gearPrim = defender.equipmentPrimaryStatBonuses ?? {};
  const effAgi = normalizedStats.agilityLevel + (gearPrim.AGI ?? 0);
  const effDex = normalizedStats.dexLevel + (gearPrim.DEX ?? 0);
  const effWis = normalizedStats.wisLevel + (gearPrim.WIS ?? 0);
  const effSpr = normalizedStats.sprLevel + (gearPrim.SPR ?? 0);

  const wisdomSkillBonus = Math.round(effWis * 0.9 + (talents.skillPowerPct ?? 0) * 18);
  const spiritArmorBonus = Math.round(effSpr * 0.8 + derived.damageMitigationPct * 25);
  const attackIntervalSeconds = Math.max(
    0.6,
    Math.round((1.25 / Math.max(0.5, derived.attackSpeedMultiplier)) * 100) / 100
  );

  return {
    enemyId: defender.characterId,
    name: defender.name,
    isBoss: false,
    maxHp: derived.maxHp,
    attackPower: Math.max(5, derived.meleePower + wisdomSkillBonus),
    armor: Math.max(0, derived.armor + spiritArmorBonus),
    attackIntervalSeconds,
    agility: Math.max(1, Math.round(effAgi + effDex * 0.35)),
    dodgeChance: derived.dodgeChance,
    intentBias: normalizedStats.strengthLevel >= normalizedStats.agilityLevel ? 'HEAVY_SMASH' : 'STRIKE',
  };
}

function summarizeArenaCombatDamage(state: TurnBasedCombatState): {
  challengerDamageDealt: number;
  defenderDamageDealt: number;
} {
  const unitSideById = new Map<string, CombatantSide>();
  for (const unit of state.units) {
    unitSideById.set(unit.unitId, unit.side);
  }

  let challengerDamageDealt = 0;
  let defenderDamageDealt = 0;

  for (const evt of state.combatLog) {
    const rawDamage =
      typeof evt.damage === 'number' && Number.isFinite(evt.damage) ? evt.damage : 0;
    if (rawDamage <= 0) continue;

    if (evt.type === 'STATUS_TICK') {
      const targetSide = evt.targetId ? unitSideById.get(evt.targetId) : undefined;
      if (targetSide === 'ENEMY') {
        challengerDamageDealt += rawDamage;
      } else if (targetSide === 'PARTY') {
        defenderDamageDealt += rawDamage;
      }
      continue;
    }

    const actorSide = evt.actorId ? unitSideById.get(evt.actorId) : undefined;
    if (actorSide === 'PARTY') {
      challengerDamageDealt += rawDamage;
    } else if (actorSide === 'ENEMY') {
      defenderDamageDealt += rawDamage;
    }
  }

  return { challengerDamageDealt, defenderDamageDealt };
}

/**
 * Simulates a deterministic asynchronous PvP / AI Arena sparring match powered by
 * `createTurnBasedEncounter`, `chooseTurnBasedAiAction`, and `stepTurnBasedCombat`.
 */
export function simulateAsyncArenaMatch(input: {
  matchId: string;
  challenger: ArenaFighterSnapshot;
  defender: ArenaFighterSnapshot;
  challengerCompanions?: readonly TurnBasedPartyMemberInput[];
  seed: string;
  maxTurns?: number;
}): AsyncArenaMatchSimulationResult {
  const challengerMember: TurnBasedPartyMemberInput = {
    characterId: input.challenger.characterId,
    name: input.challenger.name,
    controller: 'PLAYER',
    race: input.challenger.race,
    appearanceId: input.challenger.appearanceId,
    customizationConfig: input.challenger.customizationConfig,
    coreStats: input.challenger.coreStats,
    equipmentBonuses: input.challenger.equipmentBonuses,
    equipmentPrimaryStatBonuses: input.challenger.equipmentPrimaryStatBonuses,
    unlockedTalentRanks: input.challenger.unlockedTalentRanks,
    activeSkillIds: input.challenger.activeSkillIds,
    beltSlots: input.challenger.beltSlots,
  };

  const companions: TurnBasedPartyMemberInput[] = (input.challengerCompanions ?? []).map(
    (companion) => ({
      ...companion,
      controller: 'AI_COMPANION',
    })
  );

  const defenderEnemy = buildDefenderWaveEnemy(input.defender);

  let state = createTurnBasedEncounter({
    encounterId: input.matchId,
    questSlug: `arena_spar_${input.defender.characterId}`,
    questTitle: `Arena Spar: ${input.challenger.name} vs ${input.defender.name}`,
    party: [challengerMember, ...companions],
    waves: [
      {
        waveNumber: 1,
        waveName: `${input.defender.name} (Arena Defender)`,
        enemies: [defenderEnemy],
      },
    ],
    seed: input.seed,
  });

  const maxSteps = Math.max(1, (input.maxTurns ?? 40) * 6);
  let steps = 0;

  while (state.status === 'IN_PROGRESS' && steps < maxSteps) {
    steps += 1;

    if (state.phase === 'AWAITING_PLAYER_ACTION') {
      const action = chooseTurnBasedAiAction(state, state.activeUnitId ?? undefined);
      const stepResult = stepTurnBasedCombat(state, action);
      if (!stepResult.valid) break;
      state = stepResult.state;
    } else if (state.phase === 'AWAITING_AI_TURN') {
      const stepResult = stepTurnBasedCombat(state, { type: 'AUTO_AI_TURN' });
      if (!stepResult.valid) break;
      state = stepResult.state;
    } else {
      break;
    }
  }

  const challengerUnit = state.units.find(
    (u) => u.side === 'PARTY' && u.sourceId === input.challenger.characterId
  );
  const defenderUnit = state.units.find((u) => u.side === 'ENEMY');

  const challengerRemainingHp = Math.max(0, challengerUnit?.hp ?? 0);
  const defenderRemainingHp = Math.max(0, defenderUnit?.hp ?? 0);

  let challengerWon: boolean;
  if (state.status === 'VICTORY') {
    challengerWon = true;
  } else if (state.status === 'DEFEAT') {
    challengerWon = false;
  } else {
    const partyUnits = state.units.filter((u) => u.side === 'PARTY');
    const partyHp = partyUnits.reduce((sum, u) => sum + Math.max(0, u.hp), 0);
    const partyMaxHp = Math.max(
      1,
      partyUnits.reduce((sum, u) => sum + Math.max(1, u.maxHp), 0)
    );
    const defenderMaxHp = Math.max(1, defenderUnit?.maxHp ?? 1);
    challengerWon = partyHp / partyMaxHp >= defenderRemainingHp / defenderMaxHp;
  }

  const outcome = challengerWon ? 'CHALLENGER_VICTORY' : 'DEFENDER_VICTORY';
  const winnerCharacterId = challengerWon
    ? input.challenger.characterId
    : input.defender.characterId;
  const loserCharacterId = challengerWon
    ? input.defender.characterId
    : input.challenger.characterId;

  const { challengerDamageDealt, defenderDamageDealt } = summarizeArenaCombatDamage(state);

  const ratingOutcome = calculateArenaRatingDelta(
    input.challenger.arenaRating ?? DEFAULT_ARENA_RATING,
    input.defender.arenaRating ?? DEFAULT_ARENA_RATING,
    challengerWon
  );

  return {
    matchId: input.matchId,
    seed: input.seed,
    winnerCharacterId,
    loserCharacterId,
    outcome,
    totalTurns: state.turnNumber,
    challengerRemainingHp,
    defenderRemainingHp,
    challengerDamageDealt,
    defenderDamageDealt,
    challengerRatingDelta: ratingOutcome.challengerDelta,
    defenderRatingDelta: ratingOutcome.defenderDelta,
    nextChallengerRating: ratingOutcome.nextChallengerRating,
    nextDefenderRating: ratingOutcome.nextDefenderRating,
    goldAwarded: challengerWon ? 45 : 15,
    seasonPointsAwarded: challengerWon ? 45 : 10,
    finalState: state,
    combatLog: state.combatLog,
  };
}
