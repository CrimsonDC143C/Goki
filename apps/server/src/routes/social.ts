import { PrismaClient } from '@goki/database';
import {
  ArenaFighterSnapshot,
  COMBAT_CONSUMABLE_BY_SLUG,
  CharacterCustomizationConfig,
  CharacterRace,
  DEFAULT_ARENA_RIVAL_PRESETS,
  EquipmentStatBonuses,
  MAX_BELT_SLOTS,
  MAX_EQUIPPED_ACTIVE_SKILLS,
  MS_PER_HOUR,
  OPEN_WORLD_HOME_CLAN_NAME,
  OPEN_WORLD_HOME_CLAN_SLUG,
  OPEN_WORLD_HOME_CLAN_TAG,
  OPEN_WORLD_HOME_CLAN_VENUE_KEY,
  PrimaryStatBonuses,
  TurnBasedPartyMemberInput,
  aggregateTalentModifiers,
  buildCanonicalVenueKey,
  findDeduplicatedVenueMatch,
  getCurrentSeasonKey,
  getSeasonWindowBounds,
  normalizeGymVenueName,
  sanitizeActiveSkillLoadout,
  sanitizeBeltLoadout,
  simulateAsyncArenaMatch,
  validateCompanySquadAssignment,
} from '@goki/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertCharacterActiveAndOwned, requireAuth } from '../middleware/auth';
import { GameTimerScheduler } from '../queues/bullmq-workers';
import { isPrismaUniqueConstraintError, withDbTransaction } from '../services/game-operations';
import {
  CompositeGymDiscoveryService,
  GymDiscoveryProvider,
} from '../services/gym-discovery-provider';
import { WebSocketManager, websocketManager } from '../services/websocket-manager';

const CHARACTER_FULL_ARENA_INCLUDE = {
  stats: true,
  talentUnlocks: { include: { talentNode: true } },
  inventoryItems: { include: { item: true } },
  equipmentLoadout: {
    include: {
      mainHand: { include: { item: true } },
      offHand: { include: { item: true } },
      head: { include: { item: true } },
      chest: { include: { item: true } },
      legs: { include: { item: true } },
      boots: { include: { item: true } },
      accessory1: { include: { item: true } },
      accessory2: { include: { item: true } },
    },
  },
  companyMembership: true,
} as const;

const COMPANY_ROLE_ORDER: Record<string, number> = {
  COMMANDER: 0,
  OFFICER: 1,
  VETERAN: 2,
  MEMBER: 3,
};

function shortVenueHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

function buildDeterministicClanSlug(name: string, venueKey: string): string {
  const base = normalizeGymVenueName(name).replace(/\s+/g, '_').slice(0, 32) || 'gym_clan';
  return `${base}_${shortVenueHash(venueKey)}`;
}

function buildClanTag(name: string, requestedTag?: string): string {
  if (requestedTag && requestedTag.trim().length >= 2) {
    return requestedTag
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'GYM';
  }
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  return letters.length >= 2 ? letters : 'GYM';
}

function extractCharacterArenaLoadout(character: any): {
  equipmentBonuses: EquipmentStatBonuses;
  equipmentPrimaryStatBonuses: PrimaryStatBonuses;
  unlockedTalentRanks: Record<string, number>;
  activeSkillIds: string[];
  beltSlots: Array<{ itemSlug: string | null; charges: number }>;
} {
  const equipmentBonuses: EquipmentStatBonuses = {};
  const equipmentPrimaryStatBonuses: PrimaryStatBonuses = {};
  const loadout = character?.equipmentLoadout;

  if (loadout) {
    const slots = [
      loadout.mainHand,
      loadout.offHand,
      loadout.head,
      loadout.chest,
      loadout.legs,
      loadout.boots,
      loadout.accessory1,
      loadout.accessory2,
    ];
    for (const slot of slots) {
      const meta = (slot?.itemMetadata ?? null) as Record<string, any> | null;
      const b = ((meta?.statBonuses ?? slot?.item?.statBonuses) ??
        null) as EquipmentStatBonuses | null;
      if (b) {
        equipmentBonuses.maxHp = (equipmentBonuses.maxHp ?? 0) + (b.maxHp ?? 0);
        equipmentBonuses.maxStamina = (equipmentBonuses.maxStamina ?? 0) + (b.maxStamina ?? 0);
        equipmentBonuses.meleePower = (equipmentBonuses.meleePower ?? 0) + (b.meleePower ?? 0);
        equipmentBonuses.armorRating = (equipmentBonuses.armorRating ?? 0) + (b.armorRating ?? 0);
        equipmentBonuses.attackSpeedPct =
          (equipmentBonuses.attackSpeedPct ?? 0) + (b.attackSpeedPct ?? 0);
        equipmentBonuses.dodgeRating = (equipmentBonuses.dodgeRating ?? 0) + (b.dodgeRating ?? 0);
        equipmentBonuses.critChance = (equipmentBonuses.critChance ?? 0) + (b.critChance ?? 0);
        equipmentBonuses.critMultiplier =
          (equipmentBonuses.critMultiplier ?? 0) + (b.critMultiplier ?? 0);
        equipmentBonuses.damageMitigationPct =
          (equipmentBonuses.damageMitigationPct ?? 0) + (b.damageMitigationPct ?? 0);
        equipmentBonuses.lifeOnHit = (equipmentBonuses.lifeOnHit ?? 0) + (b.lifeOnHit ?? 0);
        equipmentBonuses.armorPenetrationPct =
          (equipmentBonuses.armorPenetrationPct ?? 0) + (b.armorPenetrationPct ?? 0);
        equipmentBonuses.skillPotencyPct =
          (equipmentBonuses.skillPotencyPct ?? 0) + (b.skillPotencyPct ?? 0);
        equipmentBonuses.startOfCombatShieldHp =
          (equipmentBonuses.startOfCombatShieldHp ?? 0) + (b.startOfCombatShieldHp ?? 0);
      }

      const prim = (meta?.primaryStatBonuses ?? null) as PrimaryStatBonuses | null;
      if (prim) {
        equipmentPrimaryStatBonuses.STR = (equipmentPrimaryStatBonuses.STR ?? 0) + (prim.STR ?? 0);
        equipmentPrimaryStatBonuses.END = (equipmentPrimaryStatBonuses.END ?? 0) + (prim.END ?? 0);
        equipmentPrimaryStatBonuses.AGI = (equipmentPrimaryStatBonuses.AGI ?? 0) + (prim.AGI ?? 0);
        equipmentPrimaryStatBonuses.DEX = (equipmentPrimaryStatBonuses.DEX ?? 0) + (prim.DEX ?? 0);
        equipmentPrimaryStatBonuses.CON = (equipmentPrimaryStatBonuses.CON ?? 0) + (prim.CON ?? 0);
        equipmentPrimaryStatBonuses.WIS = (equipmentPrimaryStatBonuses.WIS ?? 0) + (prim.WIS ?? 0);
        equipmentPrimaryStatBonuses.SPR = (equipmentPrimaryStatBonuses.SPR ?? 0) + (prim.SPR ?? 0);
      }
    }
  }

  const unlockedTalentRanks: Record<string, number> = {};
  for (const unlock of character?.talentUnlocks ?? []) {
    const slug = unlock?.talentNode?.slug;
    if (slug) {
      unlockedTalentRanks[slug] = unlock.currentRank ?? 1;
    }
  }

  let activeSkillIds = sanitizeActiveSkillLoadout(
    character?.activeSkillLoadout,
    unlockedTalentRanks
  );
  if (activeSkillIds.length === 0) {
    const aggregated = aggregateTalentModifiers(unlockedTalentRanks);
    activeSkillIds = aggregated.unlockedSkills
      .slice(0, MAX_EQUIPPED_ACTIVE_SKILLS)
      .map((s) => s.skillId);
  }

  const remainingOwned = new Map<string, number>();
  for (const inv of character?.inventoryItems ?? []) {
    const slug = inv?.item?.slug;
    if (slug && COMBAT_CONSUMABLE_BY_SLUG[slug]) {
      remainingOwned.set(slug, (remainingOwned.get(slug) ?? 0) + Math.max(0, Number(inv.quantity ?? 0)));
    }
  }

  const sanitizedBelt = sanitizeBeltLoadout(character?.beltLoadout);
  const beltSlots: Array<{ itemSlug: string | null; charges: number }> = [];
  for (let i = 0; i < MAX_BELT_SLOTS; i++) {
    const slug = sanitizedBelt[i] ?? null;
    if (!slug || !COMBAT_CONSUMABLE_BY_SLUG[slug]) {
      beltSlots.push({ itemSlug: null, charges: 0 });
      continue;
    }
    const ownedQty = remainingOwned.get(slug) ?? 0;
    const charges = Math.min(3, ownedQty);
    remainingOwned.set(slug, Math.max(0, ownedQty - charges));
    beltSlots.push({ itemSlug: slug, charges });
  }

  return {
    equipmentBonuses,
    equipmentPrimaryStatBonuses,
    unlockedTalentRanks,
    activeSkillIds,
    beltSlots,
  };
}

function buildArenaFighterSnapshot(character: any): ArenaFighterSnapshot {
  const loadout = extractCharacterArenaLoadout(character);
  return {
    characterId: character.id,
    name: character.name,
    overallLevel: character.overallLevel ?? 1,
    race: ((character as any).race as CharacterRace | undefined) ?? 'HUMAN',
    appearanceId: character.appearanceId,
    customizationConfig:
      ((character as any).customizationConfig as CharacterCustomizationConfig | undefined) ??
      undefined,
    coreStats: {
      strengthLevel: character.stats?.strengthLevel ?? 1,
      enduranceLevel: character.stats?.enduranceLevel ?? 1,
      agilityLevel: character.stats?.agilityLevel ?? 1,
      dexLevel: (character as any).dexLevel ?? 1,
      conLevel: (character as any).conLevel ?? 1,
      wisLevel: (character as any).wisLevel ?? 1,
      sprLevel: (character as any).sprLevel ?? 1,
    },
    equipmentBonuses: loadout.equipmentBonuses,
    equipmentPrimaryStatBonuses: loadout.equipmentPrimaryStatBonuses,
    unlockedTalentRanks: loadout.unlockedTalentRanks,
    activeSkillIds: loadout.activeSkillIds,
    beltSlots: loadout.beltSlots,
    arenaRating: character.arenaRating ?? 1000,
  };
}

function sortCompanyMembers(members: any[]): any[] {
  return [...members].sort((a, b) => {
    const slotA = a.activeSquadSlot ?? Number.MAX_SAFE_INTEGER;
    const slotB = b.activeSquadSlot ?? Number.MAX_SAFE_INTEGER;
    if (slotA !== slotB) return slotA - slotB;

    const roleA = COMPANY_ROLE_ORDER[a.role] ?? 99;
    const roleB = COMPANY_ROLE_ORDER[b.role] ?? 99;
    if (roleA !== roleB) return roleA - roleB;

    const timeA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
    const timeB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
    return timeA - timeB;
  });
}

/**
 * Ensures the global `OPEN_WORLD_HOME` GymClan exists for the current monthly season
 * and guarantees `characterId` holds an `OPEN_WORLD_HOME` membership.
 */
export async function ensureOpenWorldHomeClanAndMembership(
  dbOrTx: any,
  characterId: string,
  userId: string
): Promise<{ homeClan: any; membership: any } | null> {
  if (
    typeof dbOrTx?.gymClan?.upsert !== 'function' ||
    typeof dbOrTx?.gymClanMember?.upsert !== 'function'
  ) {
    return null;
  }

  const homeClan = await dbOrTx.gymClan.upsert({
    where: { venueKey: OPEN_WORLD_HOME_CLAN_VENUE_KEY },
    update: {},
    create: {
      slug: OPEN_WORLD_HOME_CLAN_SLUG,
      venueKey: OPEN_WORLD_HOME_CLAN_VENUE_KEY,
      name: OPEN_WORLD_HOME_CLAN_NAME,
      tag: OPEN_WORLD_HOME_CLAN_TAG,
      description: 'Global Open-World home sanctum shared by every adventurer.',
      kind: 'OPEN_WORLD_HOME',
      venueSource: 'SYSTEM_SEED',
      maxMembers: 1_000_000,
    },
  });

  if (typeof dbOrTx?.gymClanSeason?.upsert === 'function') {
    const seasonKey = getCurrentSeasonKey();
    const { startsAt, endsAt } = getSeasonWindowBounds(seasonKey);
    await dbOrTx.gymClanSeason.upsert({
      where: {
        gymClanId_seasonKey: {
          gymClanId: homeClan.id,
          seasonKey,
        },
      },
      update: {},
      create: {
        gymClanId: homeClan.id,
        seasonKey,
        startsAt,
        endsAt,
      },
    });
  }

  const membership = await dbOrTx.gymClanMember.upsert({
    where: {
      characterId_clanKind: {
        characterId,
        clanKind: 'OPEN_WORLD_HOME',
      },
    },
    update: {
      gymClanId: homeClan.id,
      userId,
    },
    create: {
      gymClanId: homeClan.id,
      userId,
      characterId,
      clanKind: 'OPEN_WORLD_HOME',
      role: 'MEMBER',
    },
  });

  return { homeClan, membership };
}

/**
 * Increments monthly `GymClanSeason` scoring metrics for every Gym Clan a character belongs to.
 */
export async function incrementClanSeasonMetrics(
  dbOrTx: any,
  params: {
    characterId: string;
    workoutPointsDelta?: number;
    workoutsCountDelta?: number;
    raidPointsDelta?: number;
    raidBossesDefeatedDelta?: number;
    arenaPointsDelta?: number;
    arenaVictoriesDelta?: number;
    seasonKey?: string;
  }
): Promise<void> {
  if (
    typeof dbOrTx?.gymClanMember?.findMany !== 'function' ||
    typeof dbOrTx?.gymClanSeason?.upsert !== 'function'
  ) {
    return;
  }

  const memberships = await dbOrTx.gymClanMember.findMany({
    where: { characterId: params.characterId },
  });
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return;
  }

  const seasonKey = params.seasonKey ?? getCurrentSeasonKey();
  const { startsAt, endsAt } = getSeasonWindowBounds(seasonKey);

  const workoutPts = Math.max(0, Math.round(params.workoutPointsDelta ?? 0));
  const workoutsCnt = Math.max(0, Math.round(params.workoutsCountDelta ?? 0));
  const raidPts = Math.max(0, Math.round(params.raidPointsDelta ?? 0));
  const raidKills = Math.max(0, Math.round(params.raidBossesDefeatedDelta ?? 0));
  const arenaPts = Math.max(0, Math.round(params.arenaPointsDelta ?? 0));
  const arenaWins = Math.max(0, Math.round(params.arenaVictoriesDelta ?? 0));
  const totalDelta = workoutPts + raidPts + arenaPts;

  if (
    totalDelta === 0 &&
    workoutsCnt === 0 &&
    raidKills === 0 &&
    arenaWins === 0
  ) {
    return;
  }

  const uniqueClanIds = Array.from(
    new Set(memberships.map((m: any) => m.gymClanId).filter(Boolean))
  ) as string[];

  for (const gymClanId of uniqueClanIds) {
    const updateData: Record<string, any> = {};
    if (totalDelta > 0) updateData.totalSeasonPoints = { increment: totalDelta };
    if (workoutPts > 0) updateData.workoutPoints = { increment: workoutPts };
    if (workoutsCnt > 0) updateData.workoutsCount = { increment: workoutsCnt };
    if (raidPts > 0) updateData.raidPoints = { increment: raidPts };
    if (raidKills > 0) updateData.raidBossesDefeated = { increment: raidKills };
    if (arenaPts > 0) updateData.arenaPoints = { increment: arenaPts };
    if (arenaWins > 0) updateData.arenaVictories = { increment: arenaWins };

    await dbOrTx.gymClanSeason.upsert({
      where: {
        gymClanId_seasonKey: {
          gymClanId,
          seasonKey,
        },
      },
      update: updateData,
      create: {
        gymClanId,
        seasonKey,
        startsAt,
        endsAt,
        totalSeasonPoints: totalDelta,
        workoutPoints: workoutPts,
        workoutsCount: workoutsCnt,
        raidPoints: raidPts,
        raidBossesDefeated: raidKills,
        arenaPoints: arenaPts,
        arenaVictories: arenaWins,
      },
    });
  }
}

const claimOrJoinClanSchema = z
  .object({
    characterId: z.string(),
    clanId: z.string().optional(),
    venue: z
      .object({
        name: z.string().min(2).max(80),
        tag: z.string().min(2).max(6).optional(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        city: z.string().max(80).optional().nullable(),
        address: z.string().max(160).optional().nullable(),
        countryCode: z.string().max(8).optional().nullable(),
        venueSource: z
          .enum(['OSM_OVERPASS', 'USER_SUBMITTED', 'EXTERNAL_PLACES', 'SYSTEM_SEED'])
          .optional(),
        osmElementType: z.string().optional().nullable(),
        osmElementId: z.union([z.string(), z.number()]).optional().nullable(),
        externalPlaceId: z.string().optional().nullable(),
        description: z.string().max(240).optional().nullable(),
      })
      .optional(),
  })
  .refine((data) => Boolean(data.clanId || data.venue), {
    message: 'Either clanId or venue details must be supplied.',
  });

const spawnSocialRaidSchema = z.object({
  characterId: z.string(),
  gymClanId: z.string(),
  bossSlug: z.string().min(2).optional(),
  bossName: z.string().min(2).max(80),
  bossTier: z.number().int().min(1).max(10).default(1),
  accessType: z.enum(['PUBLIC_WORLD', 'CLAN_ONLY', 'GUILD_ONLY']).default('CLAN_ONLY'),
  maxHp: z.number().int().positive(),
  baseGoldPool: z.number().int().positive().default(10_000),
  baseGuildRepPool: z.number().int().positive().default(2_500),
});

const createCompanySchema = z.object({
  characterId: z.string(),
  name: z.string().min(2).max(48),
  tag: z.string().min(2).max(6).toUpperCase(),
  motto: z.string().max(120).optional(),
  description: z.string().max(240).optional(),
});

const updateSquadSchema = z.object({
  actorCharacterId: z.string(),
  assignments: z.array(
    z.object({
      characterId: z.string(),
      squadSlot: z.number().int(),
    })
  ),
});

const friendRequestSchema = z
  .object({
    targetUserId: z.string().optional(),
    targetUsername: z.string().optional(),
    targetCharacterName: z.string().optional(),
  })
  .refine(
    (data) => Boolean(data.targetUserId || data.targetUsername || data.targetCharacterName),
    {
      message: 'targetUserId, targetUsername, or targetCharacterName is required.',
    }
  );

export function registerSocialRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  timers: GameTimerScheduler,
  wsManager: WebSocketManager = websocketManager,
  gymDiscoveryProvider: GymDiscoveryProvider = new CompositeGymDiscoveryService()
): void {
  // 1. Social Hub Overview
  app.get('/api/social/overview', { preHandler: [requireAuth] }, async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.query ?? {});
    const ownedCharacter = await assertCharacterActiveAndOwned(db, characterId, request.user.userId);

    await ensureOpenWorldHomeClanAndMembership(db, characterId, request.user.userId);
    const seasonKey = getCurrentSeasonKey();

    const memberships =
      typeof (db as any).gymClanMember?.findMany === 'function'
        ? await db.gymClanMember.findMany({
            where: { characterId },
            include: {
              gymClan: {
                include: {
                  _count: { select: { members: true } },
                  seasons: { where: { seasonKey } },
                },
              },
            },
          })
        : [];

    const homeMembership = memberships.find((m: any) => m.clanKind === 'OPEN_WORLD_HOME') ?? null;
    const gymMembership = memberships.find((m: any) => m.clanKind === 'GYM_VENUE') ?? null;

    const companyMembership =
      typeof (db as any).adventurerCompanyMember?.findUnique === 'function'
        ? await db.adventurerCompanyMember.findUnique({
            where: { characterId },
            include: {
              company: {
                include: {
                  members: { include: { character: true } },
                },
              },
            },
          })
        : null;

    const joinedClanIds = memberships.map((m: any) => m.gymClanId).filter(Boolean);
    const raids =
      typeof (db as any).raidBossInstance?.findMany === 'function'
        ? await db.raidBossInstance.findMany({
            where:
              joinedClanIds.length > 0
                ? {
                    OR: [
                      { accessType: 'PUBLIC_WORLD' },
                      { gymClanId: { in: joinedClanIds } },
                    ],
                  }
                : { accessType: 'PUBLIC_WORLD' },
            orderBy: { startsAt: 'desc' },
            include: {
              gymClan: true,
              contributions: {
                orderBy: { totalContributionScore: 'desc' },
                include: { character: true },
              },
            },
          })
        : [];

    let pendingFriendRequestsCount = 0;
    let friendsCount = 0;
    if (typeof (db as any).friendship?.count === 'function') {
      pendingFriendRequestsCount = await db.friendship.count({
        where: { addresseeId: request.user.userId, status: 'PENDING' },
      });
      friendsCount = await db.friendship.count({
        where: {
          status: 'ACCEPTED',
          OR: [{ requesterId: request.user.userId }, { addresseeId: request.user.userId }],
        },
      });
    } else if (typeof (db as any).friendship?.findMany === 'function') {
      const allFriendships = await db.friendship.findMany({
        where: {
          OR: [{ requesterId: request.user.userId }, { addresseeId: request.user.userId }],
        },
      });
      pendingFriendRequestsCount = allFriendships.filter(
        (f: any) => f.addresseeId === request.user.userId && f.status === 'PENDING'
      ).length;
      friendsCount = allFriendships.filter((f: any) => f.status === 'ACCEPTED').length;
    }

    return reply.send({
      homeClan: homeMembership?.gymClan ?? null,
      gymClan: gymMembership?.gymClan ?? null,
      memberships,
      company: companyMembership?.company
        ? {
            ...companyMembership.company,
            members: sortCompanyMembers(companyMembership.company.members ?? []),
          }
        : null,
      raids,
      friendsCount,
      pendingFriendRequestsCount,
      pendingIncomingFriendsCount: pendingFriendRequestsCount,
      arenaRating: (ownedCharacter as any)?.arenaRating ?? 1000,
      arenaWins: (ownedCharacter as any)?.arenaWins ?? 0,
      arenaLosses: (ownedCharacter as any)?.arenaLosses ?? 0,
      seasonKey,
    });
  });

  // 2. Nearby Gym Discovery (Local DB + OSM Overpass + Optional External Adapter)
  app.get('/api/social/gyms/discover', async (request, reply) => {
    const query = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lon: z.coerce.number().min(-180).max(180),
        radiusMeters: z.coerce.number().min(100).max(50_000).optional(),
        q: z.string().optional(),
      })
      .parse(request.query ?? {});

    const discovery = await gymDiscoveryProvider.discoverNearbyGyms({
      db,
      latitude: query.lat,
      longitude: query.lon,
      radiusMeters: query.radiusMeters,
      query: query.q,
    });

    return reply.send(discovery);
  });

  // 3. List Gym Clans with Member Counts & Current Season Standings
  app.get('/api/social/clans', async (request, reply) => {
    const { seasonKey } = z
      .object({ seasonKey: z.string().optional() })
      .parse(request.query ?? {});
    const activeSeasonKey = seasonKey ?? getCurrentSeasonKey();

    const clans = await db.gymClan.findMany({
      include: {
        _count: { select: { members: true } },
        seasons: { where: { seasonKey: activeSeasonKey } },
      },
      orderBy: [{ clanReputation: 'desc' }, { createdAt: 'asc' }],
    });

    return reply.send({ clans, seasonKey: activeSeasonKey });
  });

  // 4. Claim or Join a Physical Gym Clan (Preserves OPEN_WORLD_HOME Membership)
  app.post('/api/social/clans/claim-or-join', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = claimOrJoinClanSchema.parse(request.body);
    await assertCharacterActiveAndOwned(db, body.characterId, request.user.userId);

    const txResult = await withDbTransaction(
      db,
      async (tx) => {
        await ensureOpenWorldHomeClanAndMembership(tx, body.characterId, request.user.userId);

        let targetClan: any = null;
        let deduplicated = false;
        let isNewFounder = false;

        if (body.clanId) {
          const found = await tx.gymClan.findUnique({ where: { id: body.clanId } });
          if (!found) {
            return { ok: false as const, statusCode: 404, error: 'Gym Clan not found.' };
          }
          if (found.kind === 'OPEN_WORLD_HOME') {
            return {
              ok: false as const,
              statusCode: 400,
              error: 'Every character already belongs to the Open-World Home clan.',
            };
          }
          targetClan = found;
        } else if (body.venue) {
          const v = body.venue;
          const venueKey = buildCanonicalVenueKey({
            osmElementType: v.osmElementType ?? null,
            osmElementId: v.osmElementId ?? null,
            externalProvider: v.externalPlaceId ? 'external' : null,
            externalPlaceId: v.externalPlaceId ?? null,
            latitude: v.latitude,
            longitude: v.longitude,
            name: v.name,
          });

          const existingClans = await tx.gymClan.findMany({
            where: { kind: 'GYM_VENUE' },
          });

          const match = findDeduplicatedVenueMatch(
            {
              venueKey,
              name: v.name,
              latitude: v.latitude,
              longitude: v.longitude,
            },
            existingClans
          );

          if (match) {
            targetClan = match;
            deduplicated = true;
          } else {
            const seasonKey = getCurrentSeasonKey();
            const { startsAt, endsAt } = getSeasonWindowBounds(seasonKey);
            const slug = buildDeterministicClanSlug(v.name, venueKey);
            const tag = buildClanTag(v.name, v.tag);

            targetClan = await tx.gymClan.create({
              data: {
                slug,
                venueKey,
                name: v.name.trim(),
                tag,
                description: v.description ?? null,
                kind: 'GYM_VENUE',
                venueSource:
                  v.venueSource ?? (v.osmElementId ? 'OSM_OVERPASS' : 'USER_SUBMITTED'),
                externalPlaceId:
                  v.externalPlaceId ??
                  (v.osmElementType && v.osmElementId
                    ? `${v.osmElementType}:${v.osmElementId}`
                    : null),
                address: v.address ?? null,
                city: v.city ?? null,
                countryCode: v.countryCode ?? null,
                latitude: v.latitude,
                longitude: v.longitude,
                wardenCharacterId: body.characterId,
              },
            });

            if (typeof (tx as any).gymClanSeason?.upsert === 'function') {
              await tx.gymClanSeason.upsert({
                where: {
                  gymClanId_seasonKey: { gymClanId: targetClan.id, seasonKey },
                },
                update: {},
                create: {
                  gymClanId: targetClan.id,
                  seasonKey,
                  startsAt,
                  endsAt,
                },
              });
            }

            isNewFounder = true;
          }
        }

        const isWarden =
          isNewFounder || targetClan.wardenCharacterId === body.characterId;
        const role = isWarden ? 'WARDEN' : 'MEMBER';

        const membership = await tx.gymClanMember.upsert({
          where: {
            characterId_clanKind: {
              characterId: body.characterId,
              clanKind: 'GYM_VENUE',
            },
          },
          update: {
            gymClanId: targetClan.id,
            userId: request.user.userId,
            role,
          },
          create: {
            gymClanId: targetClan.id,
            userId: request.user.userId,
            characterId: body.characterId,
            clanKind: 'GYM_VENUE',
            role,
          },
        });

        return { ok: true as const, clan: targetClan, membership, deduplicated };
      },
      `clan-join:${body.characterId}`
    );

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    return reply.send({
      clan: txResult.clan,
      membership: txResult.membership,
      deduplicated: txResult.deduplicated,
    });
  });

  // 5. Leave Physical Gym Clan (Never Removes OPEN_WORLD_HOME)
  app.post('/api/social/clans/leave-gym', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = z
      .object({
        characterId: z.string(),
        clanId: z.string().optional(),
      })
      .parse(request.body);
    await assertCharacterActiveAndOwned(db, body.characterId, request.user.userId);

    if (body.clanId) {
      const targetClan = await db.gymClan.findUnique({ where: { id: body.clanId } });
      if (targetClan?.kind === 'OPEN_WORLD_HOME') {
        return reply.status(400).send({
          error: 'Cannot leave the Open-World Home clan.',
        });
      }
    }

    const existingGymMembership = await db.gymClanMember.findUnique({
      where: {
        characterId_clanKind: {
          characterId: body.characterId,
          clanKind: 'GYM_VENUE',
        },
      },
    });

    if (!existingGymMembership) {
      return reply.status(400).send({
        error: 'Character is not currently a member of any physical Gym Clan.',
      });
    }

    await db.gymClanMember.delete({
      where: { id: existingGymMembership.id },
    });

    return reply.send({
      leftClanId: existingGymMembership.gymClanId,
      remainingClanKind: 'OPEN_WORLD_HOME',
    });
  });

  // 6. List Social Raids (PUBLIC_WORLD + Character's Joined GYM_VENUE Clan Raids)
  app.get('/api/social/raids', async (request, reply) => {
    const { characterId } = z
      .object({ characterId: z.string().optional() })
      .parse(request.query ?? {});

    let joinedGymClanIds: string[] = [];
    if (characterId && typeof (db as any).gymClanMember?.findMany === 'function') {
      const memberships = await db.gymClanMember.findMany({
        where: { characterId },
      });
      joinedGymClanIds = memberships.map((m: any) => m.gymClanId).filter(Boolean);
    }

    const raids = await db.raidBossInstance.findMany({
      where: characterId
        ? {
            OR: [
              { accessType: 'PUBLIC_WORLD' },
              ...(joinedGymClanIds.length > 0
                ? [{ gymClanId: { in: joinedGymClanIds } }]
                : []),
            ],
          }
        : { accessType: 'PUBLIC_WORLD' },
      orderBy: { startsAt: 'desc' },
      include: {
        gymClan: true,
        contributions: {
          orderBy: { totalContributionScore: 'desc' },
          include: { character: true },
        },
      },
    });

    return reply.send({ raids });
  });

  // 7. Spawn a Clan or World Raid Boss
  app.post('/api/social/raids/spawn', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = spawnSocialRaidSchema.parse(request.body);
    await assertCharacterActiveAndOwned(db, body.characterId, request.user.userId);

    const gymClan = await db.gymClan.findUnique({ where: { id: body.gymClanId } });
    if (!gymClan) {
      return reply.status(404).send({ error: 'Gym Clan not found.' });
    }

    const membership = await db.gymClanMember.findUnique({
      where: {
        gymClanId_characterId: {
          gymClanId: body.gymClanId,
          characterId: body.characterId,
        },
      },
    });

    if (!membership) {
      return reply.status(403).send({
        error: 'Forbidden: You must be an active member of this Gym Clan to spawn a raid.',
      });
    }

    if (
      (body.accessType === 'CLAN_ONLY' || body.accessType === 'GUILD_ONLY') &&
      !['WARDEN', 'LEADER', 'OFFICER'].includes(membership.role)
    ) {
      return reply.status(403).send({
        error: 'Forbidden: Only Clan Wardens or Officers may spawn Clan-Only raids.',
      });
    }

    const startsAt = new Date();
    const sevenDaysMs = 7 * 24 * MS_PER_HOUR;
    const endsAt = new Date(startsAt.getTime() + sevenDaysMs);
    const maxHpBig = BigInt(body.maxHp);
    const bossSlug =
      body.bossSlug?.trim() ||
      `${normalizeGymVenueName(body.bossName).replace(/\s+/g, '_')}_${startsAt.getTime()}`;

    const raid = await db.raidBossInstance.create({
      data: {
        bossSlug,
        bossName: body.bossName.trim(),
        bossTier: body.bossTier,
        accessType: body.accessType,
        gymClanId: body.gymClanId,
        maxHp: maxHpBig,
        currentHp: maxHpBig,
        startsAt,
        endsAt,
        status: 'ACTIVE',
        bossMechanicsConfig: {
          baseGoldPool: body.baseGoldPool,
          baseGuildRepPool: body.baseGuildRepPool,
        },
        lootPoolConfig: [],
      },
    });

    const jobId = await timers.scheduleRaidRollover({
      raidInstanceId: raid.id,
      delayMs: sevenDaysMs,
    });

    const updatedRaid = await db.raidBossInstance.update({
      where: { id: raid.id },
      data: { bullMqJobId: jobId },
    });

    return reply.status(201).send({ raid: updatedRaid });
  });

  // 8. Attack a Social Raid Boss + Update GymClanSeason
  app.post('/api/social/raids/:raidId/attack', { preHandler: [requireAuth] }, async (request, reply) => {
    const { raidId } = z.object({ raidId: z.string() }).parse(request.params);
    const { characterId } = z.object({ characterId: z.string() }).parse(request.body);
    await assertCharacterActiveAndOwned(db, characterId, request.user.userId);

    const txResult = await withDbTransaction(
      db,
      async (tx) => {
        const raid = await tx.raidBossInstance.findUnique({ where: { id: raidId } });
        if (!raid) {
          return { ok: false as const, statusCode: 404, error: 'Raid Boss instance not found.' };
        }
        if (raid.status !== 'ACTIVE' && raid.status !== 'DEFEATED') {
          return { ok: false as const, statusCode: 400, error: `Raid is ${raid.status}.` };
        }

        const character = await tx.character.findUnique({
          where: { id: characterId },
          include: {
            stats: true,
            gymClanMemberships: true,
            talentUnlocks: { include: { talentNode: true } },
          },
        });
        if (!character || !character.stats) {
          return { ok: false as const, statusCode: 404, error: 'Character not found.' };
        }

        if (raid.accessType === 'CLAN_ONLY' || raid.accessType === 'GUILD_ONLY') {
          let isClanMember = (character as any).gymClanMemberships?.some(
            (m: any) => m.gymClanId === raid.gymClanId
          );
          if (!isClanMember && raid.gymClanId && typeof (tx as any).gymClanMember?.findFirst === 'function') {
            const directMem = await tx.gymClanMember.findFirst({
              where: { gymClanId: raid.gymClanId, characterId },
            });
            isClanMember = Boolean(directMem);
          }
          if (!isClanMember) {
            return {
              ok: false as const,
              statusCode: 403,
              error: 'Forbidden: This is a private Clan-Only Raid Boss.',
            };
          }
        }

        const existingContrib = await tx.raidParticipantContribution.findUnique({
          where: { raidInstanceId_characterId: { raidInstanceId: raid.id, characterId } },
        });

        const todayKey = new Date().toISOString().slice(0, 10);
        if (
          existingContrib?.lastAttackAt &&
          existingContrib.lastAttackAt.toISOString().slice(0, 10) === todayKey
        ) {
          return {
            ok: false as const,
            statusCode: 400,
            error:
              'Daily combat attack already locked in today. Log real-world workouts to channel bonus energy!',
          };
        }

        const unlockedRanks: Record<string, number> = {};
        for (const u of character.talentUnlocks ?? []) {
          if (u.talentNode?.slug) {
            unlockedRanks[u.talentNode.slug] = u.currentRank;
          }
        }
        const talents = aggregateTalentModifiers(unlockedRanks);

        const baseStrike =
          character.stats.strengthLevel * 4_200 +
          character.stats.agilityLevel * 3_800 +
          character.stats.enduranceLevel * 2_200;
        const combatDamage = Math.round(
          baseStrike * (1 + talents.meleePowerPct + talents.attackSpeedPct * 0.6)
        );
        const supportScore = Math.round(
          character.stats.enduranceLevel *
            1_500 *
            (1 + talents.partyDamageMitigationPct * 3 + talents.healingPowerPct)
        );

        const dmgBig = BigInt(combatDamage);
        const supBig = BigInt(supportScore);
        const totalScoreDelta = dmgBig + supBig;
        const safeCurrentHp = raid.currentHp > 0n ? raid.currentHp : 0n;
        const nextHp = safeCurrentHp > dmgBig ? safeCurrentHp - dmgBig : 0n;
        const newlyDefeated = !raid.isDefeated && nextHp === 0n;

        const updatedRaid = await tx.raidBossInstance.update({
          where: { id: raid.id },
          data: {
            currentHp: nextHp,
            totalRaidDamage: { increment: dmgBig },
            isDefeated: nextHp === 0n,
            status: nextHp === 0n ? 'DEFEATED' : raid.status,
          },
        });

        const contribution = await tx.raidParticipantContribution.upsert({
          where: { raidInstanceId_characterId: { raidInstanceId: raid.id, characterId } },
          update: {
            combatDamageDealt: { increment: dmgBig },
            supportScore: { increment: supBig },
            totalContributionScore: { increment: totalScoreDelta },
            dailyAttacksUsed: { increment: 1 },
            lastAttackAt: new Date(),
          },
          create: {
            raidInstanceId: raid.id,
            characterId,
            combatDamageDealt: dmgBig,
            supportScore: supBig,
            totalContributionScore: totalScoreDelta,
            dailyAttacksUsed: 1,
            lastAttackAt: new Date(),
          },
        });

        await incrementClanSeasonMetrics(tx, {
          characterId,
          raidPointsDelta: Math.max(1, Math.floor(combatDamage / 1000)),
          raidBossesDefeatedDelta: newlyDefeated ? 1 : 0,
        });

        return {
          ok: true as const,
          raid,
          character,
          combatDamage,
          supportScore,
          nextHp,
          updatedRaid,
          contribution,
        };
      },
      `social-raid:${raidId}`
    );

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    const { raid, character, combatDamage, supportScore, nextHp, updatedRaid, contribution } =
      txResult;

    const safeBigIntValue = (val: bigint): number | string => {
      const num = Number(val);
      return Number.isSafeInteger(num) ? num : val.toString();
    };
    const raidHpEvent = {
      type: 'RAID_HP_UPDATE' as const,
      raidId: raid.id,
      currentHp: safeBigIntValue(nextHp),
      maxHp: safeBigIntValue(raid.maxHp),
      isDefeated: nextHp === 0n,
      attacker: {
        characterId: character.id,
        characterName: character.name,
        damage: combatDamage,
        supportScore,
      },
      timestamp: Date.now(),
    };
    wsManager.broadcastToRoom(`raid:${raid.id}`, raidHpEvent);
    wsManager.broadcastToRoom('raid:all', raidHpEvent);

    return reply.send({
      combatDamage,
      supportScore,
      raid: updatedRaid,
      contribution,
    });
  });

  // 9. Monthly Gym Clan Season Standings
  app.get('/api/social/seasons/current', async (request, reply) => {
    const { seasonKey } = z
      .object({ seasonKey: z.string().optional() })
      .parse(request.query ?? {});
    const activeSeasonKey = seasonKey ?? getCurrentSeasonKey();
    const { startsAt, endsAt } = getSeasonWindowBounds(activeSeasonKey);

    const standings = await db.gymClanSeason.findMany({
      where: { seasonKey: activeSeasonKey },
      include: {
        gymClan: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: [{ totalSeasonPoints: 'desc' }, { workoutPoints: 'desc' }],
    });

    return reply.send({
      seasonKey: activeSeasonKey,
      startsAt,
      endsAt,
      standings,
    });
  });

  // 10. List Adventurer Companies
  app.get('/api/social/companies', async (_request, reply) => {
    const companies = await db.adventurerCompany.findMany({
      include: {
        members: { include: { character: true } },
        _count: { select: { members: true } },
      },
      orderBy: [{ companyReputation: 'desc' }, { createdAt: 'asc' }],
    });

    const formatted = companies.map((company: any) => {
      const sortedMembers = sortCompanyMembers(company.members ?? []);
      const activeSquad = sortedMembers.filter((m: any) => m.activeSquadSlot !== null);
      return {
        ...company,
        members: sortedMembers,
        activeSquad,
      };
    });

    return reply.send({ companies: formatted });
  });

  // 11. Adventurer Company Detail
  app.get('/api/social/companies/:companyId', async (request, reply) => {
    const { companyId } = z.object({ companyId: z.string() }).parse(request.params);
    const company = await db.adventurerCompany.findUnique({
      where: { id: companyId },
      include: {
        members: {
          include: {
            character: { include: { stats: true } },
          },
        },
      },
    });

    if (!company) {
      return reply.status(404).send({ error: 'Adventurer Company not found.' });
    }

    const orderedMembers = sortCompanyMembers(company.members ?? []);
    return reply.send({
      company: {
        ...company,
        members: orderedMembers,
      },
    });
  });

  // 12. Create Adventurer Company (Max 1 per Character)
  app.post('/api/social/companies', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = createCompanySchema.parse(request.body);
    await assertCharacterActiveAndOwned(db, body.characterId, request.user.userId);

    const existingMembership = await db.adventurerCompanyMember.findUnique({
      where: { characterId: body.characterId },
    });
    if (existingMembership) {
      return reply.status(409).send({
        error: 'Character already belongs to an Adventurer Company. Leave your current company first.',
      });
    }

    try {
      const company = await withDbTransaction(
        db,
        async (tx) => {
          const existingByNameOrTag = await tx.adventurerCompany.findFirst({
            where: {
              OR: [{ name: body.name.trim() }, { tag: body.tag }],
            },
          });
          if (existingByNameOrTag) {
            throw Object.assign(new Error('Company name or tag is already taken.'), {
              statusCode: 409,
            });
          }

          return tx.adventurerCompany.create({
            data: {
              name: body.name.trim(),
              tag: body.tag,
              motto: body.motto ?? null,
              description: body.description ?? null,
              commanderCharacterId: body.characterId,
              maxRosterSize: 30,
              maxActiveSquadSize: 4,
              members: {
                create: {
                  characterId: body.characterId,
                  role: 'COMMANDER',
                  activeSquadSlot: 1,
                },
              },
            },
            include: {
              members: { include: { character: true } },
            },
          });
        },
        `company-create:${body.characterId}`
      );

      return reply.status(201).send({ company });
    } catch (err) {
      if (isPrismaUniqueConstraintError(err)) {
        return reply.status(409).send({
          error: 'Company name, tag, or character membership already exists.',
        });
      }
      throw err;
    }
  });

  // 13. Join Adventurer Company (30-Roster Cap & Lowest Available Active Squad Slot 1..4)
  app.post('/api/social/companies/:companyId/join', { preHandler: [requireAuth] }, async (request, reply) => {
    const { companyId } = z.object({ companyId: z.string() }).parse(request.params);
    const { characterId } = z.object({ characterId: z.string() }).parse(request.body);
    await assertCharacterActiveAndOwned(db, characterId, request.user.userId);

    const existingMembership = await db.adventurerCompanyMember.findUnique({
      where: { characterId },
    });
    if (existingMembership) {
      return reply.status(409).send({
        error: 'Character already belongs to an Adventurer Company.',
      });
    }

    const company = await db.adventurerCompany.findUnique({
      where: { id: companyId },
      include: { members: true },
    });
    if (!company) {
      return reply.status(404).send({ error: 'Adventurer Company not found.' });
    }

    if (company.members.length >= company.maxRosterSize) {
      return reply.status(400).send({
        error: `Adventurer Company roster is full (${company.maxRosterSize}/${company.maxRosterSize}).`,
      });
    }

    const occupiedSlots = new Set<number>(
      company.members
        .map((m: any) => m.activeSquadSlot)
        .filter((s: unknown): s is number => typeof s === 'number')
    );
    let assignedSlot: number | null = null;
    for (let slot = 1; slot <= company.maxActiveSquadSize; slot++) {
      if (!occupiedSlots.has(slot)) {
        assignedSlot = slot;
        break;
      }
    }

    const membership = await db.adventurerCompanyMember.create({
      data: {
        companyId: company.id,
        characterId,
        role: 'MEMBER',
        activeSquadSlot: assignedSlot,
      },
    });

    return reply.send({ membership, companyId: company.id });
  });

  // 14. Leave Adventurer Company (Promotes Earliest Member or Deletes Empty Company)
  app.post('/api/social/companies/:companyId/leave', { preHandler: [requireAuth] }, async (request, reply) => {
    const { companyId } = z.object({ companyId: z.string() }).parse(request.params);
    const { characterId } = z.object({ characterId: z.string() }).parse(request.body);
    await assertCharacterActiveAndOwned(db, characterId, request.user.userId);

    const txResult = await withDbTransaction(
      db,
      async (tx) => {
        const company = await tx.adventurerCompany.findUnique({
          where: { id: companyId },
          include: {
            members: {
              orderBy: { joinedAt: 'asc' },
            },
          },
        });
        if (!company) {
          return { ok: false as const, statusCode: 404, error: 'Adventurer Company not found.' };
        }

        const departing = company.members.find((m: any) => m.characterId === characterId);
        if (!departing) {
          return {
            ok: false as const,
            statusCode: 400,
            error: 'Character is not a member of this Adventurer Company.',
          };
        }

        await tx.adventurerCompanyMember.delete({
          where: { id: departing.id },
        });

        const remaining = company.members.filter((m: any) => m.characterId !== characterId);
        if (remaining.length === 0) {
          await tx.adventurerCompany.delete({
            where: { id: company.id },
          });
          return { ok: true as const, companyDeleted: true, newCommanderCharacterId: null };
        }

        let newCommanderCharacterId: string | null = company.commanderCharacterId;
        if (
          departing.role === 'COMMANDER' ||
          company.commanderCharacterId === characterId
        ) {
          const successor = [...remaining].sort((a: any, b: any) => {
            const timeA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
            const timeB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
            return timeA - timeB;
          })[0];

          if (successor) {
            await tx.adventurerCompanyMember.update({
              where: { id: successor.id },
              data: { role: 'COMMANDER' },
            });
            await tx.adventurerCompany.update({
              where: { id: company.id },
              data: { commanderCharacterId: successor.characterId },
            });
            newCommanderCharacterId = successor.characterId;
          }
        }

        return {
          ok: true as const,
          companyDeleted: false,
          newCommanderCharacterId,
        };
      },
      `company-leave:${companyId}`
    );

    if (!txResult.ok) {
      return reply.status(txResult.statusCode).send({ error: txResult.error });
    }

    return reply.send({
      left: true,
      companyDeleted: txResult.companyDeleted,
      newCommanderCharacterId: txResult.newCommanderCharacterId,
    });
  });

  // 15. Assign Active 4-Player Squad Slots (COMMANDER or OFFICER Only)
  app.put('/api/social/companies/:companyId/squad', { preHandler: [requireAuth] }, async (request, reply) => {
    const { companyId } = z.object({ companyId: z.string() }).parse(request.params);
    const body = updateSquadSchema.parse(request.body);
    await assertCharacterActiveAndOwned(db, body.actorCharacterId, request.user.userId);

    const company = await db.adventurerCompany.findUnique({
      where: { id: companyId },
      include: { members: true },
    });
    if (!company) {
      return reply.status(404).send({ error: 'Adventurer Company not found.' });
    }

    const actorMembership = company.members.find(
      (m: any) => m.characterId === body.actorCharacterId
    );
    if (!actorMembership || !['COMMANDER', 'OFFICER'].includes(actorMembership.role)) {
      return reply.status(403).send({
        error: 'Forbidden: Only Company Commanders or Officers may configure the active squad.',
      });
    }

    const validation = validateCompanySquadAssignment({
      rosterCharacterIds: company.members.map((m: any) => m.characterId),
      assignments: body.assignments,
    });
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.error });
    }

    const updatedMembers = await withDbTransaction(
      db,
      async (tx) => {
        await tx.adventurerCompanyMember.updateMany({
          where: { companyId },
          data: { activeSquadSlot: null },
        });

        for (const assignment of body.assignments) {
          await tx.adventurerCompanyMember.update({
            where: { characterId: assignment.characterId },
            data: { activeSquadSlot: assignment.squadSlot },
          });
        }

        return tx.adventurerCompanyMember.findMany({
          where: { companyId },
          include: { character: true },
        });
      },
      `company-squad:${companyId}`
    );

    const sorted = sortCompanyMembers(updatedMembers);
    return reply.send({
      companyId,
      activeSquad: sorted.filter((m: any) => m.activeSquadSlot !== null),
      members: sorted,
    });
  });

  // 16. List Friends & Requests
  app.get('/api/social/friends', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.user.userId;
    const rows = await db.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            characters: {
              where: { deletedAt: null },
              select: { id: true, name: true, overallLevel: true, arenaRating: true, appearanceId: true },
            },
          },
        },
        addressee: {
          select: {
            id: true,
            username: true,
            characters: {
              where: { deletedAt: null },
              select: { id: true, name: true, overallLevel: true, arenaRating: true, appearanceId: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const friends = rows.filter((f: any) => f.status === 'ACCEPTED');
    const incomingRequests = rows.filter(
      (f: any) => f.status === 'PENDING' && f.addresseeId === userId
    );
    const outgoingRequests = rows.filter(
      (f: any) => f.status === 'PENDING' && f.requesterId === userId
    );

    return reply.send({
      friends,
      incomingRequests,
      outgoingRequests,
    });
  });

  // 17. Send Friend Request
  app.post('/api/social/friends/request', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = friendRequestSchema.parse(request.body);

    let targetUser: any = null;
    if (body.targetUserId) {
      targetUser = await db.user.findUnique({ where: { id: body.targetUserId } });
    } else if (body.targetUsername) {
      targetUser = await db.user.findUnique({ where: { username: body.targetUsername.trim() } });
    } else if (body.targetCharacterName) {
      const char = await db.character.findFirst({
        where: { name: body.targetCharacterName.trim(), deletedAt: null },
        include: { user: true },
      });
      targetUser = char?.user ?? null;
    }

    if (!targetUser) {
      return reply.status(404).send({ error: 'Target user not found.' });
    }
    if (targetUser.id === request.user.userId) {
      return reply.status(400).send({ error: 'You cannot send a friend request to yourself.' });
    }

    const pairKey = [request.user.userId, targetUser.id].sort().join(':');
    const existing = await db.friendship.findUnique({ where: { pairKey } });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        return reply.status(409).send({ error: 'You are already friends with this user.' });
      }
      if (existing.status === 'PENDING') {
        return reply.status(409).send({ error: 'A friend request is already pending between you.' });
      }
      if (existing.status === 'BLOCKED') {
        return reply.status(409).send({ error: 'Cannot send friend request.' });
      }

      const reopened = await db.friendship.update({
        where: { id: existing.id },
        data: {
          requesterId: request.user.userId,
          addresseeId: targetUser.id,
          status: 'PENDING',
          respondedAt: null,
        },
      });
      return reply.status(201).send({ friendship: reopened });
    }

    const friendship = await db.friendship.create({
      data: {
        requesterId: request.user.userId,
        addresseeId: targetUser.id,
        pairKey,
        status: 'PENDING',
      },
    });

    return reply.status(201).send({ friendship });
  });

  // 18. Respond to Friend Request (Addressee Only)
  app.post('/api/social/friends/:friendshipId/respond', { preHandler: [requireAuth] }, async (request, reply) => {
    const { friendshipId } = z.object({ friendshipId: z.string() }).parse(request.params);
    const { action } = z
      .object({ action: z.enum(['ACCEPT', 'DECLINE']) })
      .parse(request.body);

    const friendship = await db.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) {
      return reply.status(404).send({ error: 'Friend request not found.' });
    }

    if (friendship.addresseeId !== request.user.userId) {
      return reply.status(403).send({
        error: 'Forbidden: Only the recipient of a friend request may accept or decline it.',
      });
    }

    if (friendship.status !== 'PENDING') {
      return reply.status(400).send({
        error: `Friend request is already ${friendship.status}.`,
      });
    }

    const updated = await db.friendship.update({
      where: { id: friendship.id },
      data: {
        status: action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
        respondedAt: new Date(),
      },
    });

    return reply.send({ friendship: updated });
  });

  // 19. Remove Friend or Cancel Request
  app.delete('/api/social/friends/:friendshipId', { preHandler: [requireAuth] }, async (request, reply) => {
    const { friendshipId } = z.object({ friendshipId: z.string() }).parse(request.params);

    const friendship = await db.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) {
      return reply.status(404).send({ error: 'Friendship record not found.' });
    }

    if (
      friendship.requesterId !== request.user.userId &&
      friendship.addresseeId !== request.user.userId
    ) {
      return reply.status(403).send({
        error: 'Forbidden: You are not part of this friendship.',
      });
    }

    await db.friendship.delete({ where: { id: friendship.id } });
    return reply.send({ deleted: true, friendshipId: friendship.id });
  });

  // 20. Social Leaderboards (GYM_CLANS, COMPANIES, HEROES, ARENA)
  app.get('/api/social/leaderboards', async (request, reply) => {
    const query = z
      .object({
        category: z
          .enum(['GYM_CLANS', 'COMPANIES', 'HEROES', 'ARENA'])
          .default('GYM_CLANS'),
        seasonKey: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(request.query ?? {});

    const activeSeasonKey = query.seasonKey ?? getCurrentSeasonKey();
    let entries: any[] = [];

    if (query.category === 'GYM_CLANS') {
      entries = await db.gymClanSeason.findMany({
        where: { seasonKey: activeSeasonKey },
        include: {
          gymClan: {
            include: { _count: { select: { members: true } } },
          },
        },
        orderBy: [{ totalSeasonPoints: 'desc' }, { workoutPoints: 'desc' }],
        take: query.limit,
      });
    } else if (query.category === 'COMPANIES') {
      entries = await db.adventurerCompany.findMany({
        include: { _count: { select: { members: true } } },
        orderBy: [{ companyReputation: 'desc' }, { companyLevel: 'desc' }],
        take: query.limit,
      });
    } else if (query.category === 'HEROES') {
      entries = await db.character.findMany({
        where: { deletedAt: null },
        orderBy: [{ overallLevel: 'desc' }, { adventurerReputation: 'desc' }],
        take: query.limit,
        select: {
          id: true,
          name: true,
          overallLevel: true,
          adventurerRank: true,
          adventurerReputation: true,
          race: true,
          appearanceId: true,
          arenaRating: true,
        },
      });
    } else if (query.category === 'ARENA') {
      entries = await db.character.findMany({
        where: { deletedAt: null },
        orderBy: [{ arenaRating: 'desc' }, { arenaWins: 'desc' }],
        take: query.limit,
        select: {
          id: true,
          name: true,
          overallLevel: true,
          arenaRating: true,
          arenaWins: true,
          arenaLosses: true,
          race: true,
          appearanceId: true,
        },
      });
    }

    return reply.send({
      category: query.category,
      seasonKey: activeSeasonKey,
      entries,
    });
  });

  // 21. List Arena Opponents & Recent Matches
  app.get('/api/social/arena/opponents', async (request, reply) => {
    const { characterId } = z
      .object({ characterId: z.string().optional() })
      .parse(request.query ?? {});

    const opponents = await db.character.findMany({
      where: {
        deletedAt: null,
        ...(characterId ? { id: { not: characterId } } : {}),
      },
      orderBy: [{ arenaRating: 'desc' }, { overallLevel: 'desc' }],
      take: 20,
      select: {
        id: true,
        name: true,
        overallLevel: true,
        arenaRating: true,
        arenaWins: true,
        arenaLosses: true,
        race: true,
        appearanceId: true,
        adventurerRank: true,
      },
    });

    const recentMatches =
      typeof (db as any).arenaMatch?.findMany === 'function'
        ? await db.arenaMatch.findMany({
            where: characterId
              ? {
                  OR: [
                    { challengerCharacterId: characterId },
                    { defenderCharacterId: characterId },
                  ],
                }
              : undefined,
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : [];

    return reply.send({
      opponents,
      rivalPresets: DEFAULT_ARENA_RIVAL_PRESETS,
      recentMatches,
    });
  });

  // 22. Async Arena AI Sparring Match
  app.post('/api/social/arena/spar', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = z
      .object({
        challengerCharacterId: z.string(),
        defenderCharacterId: z.string(),
        includeSquad: z.boolean().default(false),
      })
      .parse(request.body);

    await assertCharacterActiveAndOwned(db, body.challengerCharacterId, request.user.userId);

    if (body.challengerCharacterId === body.defenderCharacterId) {
      return reply.status(400).send({
        error: 'A hero cannot spar against themselves in the Arena.',
      });
    }

    const challenger = await db.character.findUnique({
      where: { id: body.challengerCharacterId },
      include: CHARACTER_FULL_ARENA_INCLUDE,
    });
    if (!challenger || challenger.deletedAt) {
      return reply.status(404).send({ error: 'Challenger character not found.' });
    }

    const challengerSnapshot = buildArenaFighterSnapshot(challenger);

    let challengerCompanions: TurnBasedPartyMemberInput[] = [];
    if (body.includeSquad && (challenger as any).companyMembership?.companyId) {
      const squadMembers = await db.adventurerCompanyMember.findMany({
        where: {
          companyId: (challenger as any).companyMembership.companyId,
          characterId: { not: challenger.id },
          activeSquadSlot: { not: null },
        },
        include: {
          character: {
            include: CHARACTER_FULL_ARENA_INCLUDE,
          },
        },
        orderBy: { activeSquadSlot: 'asc' },
        take: 3,
      });

      challengerCompanions = squadMembers
        .filter((m: any) => m.character && !m.character.deletedAt)
        .map((m: any) => {
          const snap = buildArenaFighterSnapshot(m.character);
          return {
            characterId: snap.characterId,
            name: snap.name,
            controller: 'AI_COMPANION',
            race: snap.race,
            appearanceId: snap.appearanceId,
            customizationConfig: snap.customizationConfig,
            coreStats: snap.coreStats,
            equipmentBonuses: snap.equipmentBonuses,
            equipmentPrimaryStatBonuses: snap.equipmentPrimaryStatBonuses,
            unlockedTalentRanks: snap.unlockedTalentRanks,
            activeSkillIds: snap.activeSkillIds,
            beltSlots: snap.beltSlots,
          };
        });
    }

    const rivalPreset = DEFAULT_ARENA_RIVAL_PRESETS.find(
      (r) => r.characterId === body.defenderCharacterId || r.slug === body.defenderCharacterId
    );

    let isNpcRival = false;
    let defenderDbId: string | null = null;
    let defenderSnapshot: ArenaFighterSnapshot;

    if (rivalPreset) {
      isNpcRival = true;
      defenderSnapshot = rivalPreset;
    } else {
      const defender = await db.character.findUnique({
        where: { id: body.defenderCharacterId },
        include: CHARACTER_FULL_ARENA_INCLUDE,
      });
      if (!defender || defender.deletedAt) {
        return reply.status(404).send({ error: 'Arena opponent not found.' });
      }
      defenderDbId = defender.id;
      defenderSnapshot = buildArenaFighterSnapshot(defender);
    }

    const nowMs = Date.now();
    const matchId = `arena_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;
    const seed = `arena:${challenger.id}:${body.defenderCharacterId}:${nowMs}`;

    const simResult = simulateAsyncArenaMatch({
      matchId,
      challenger: challengerSnapshot,
      defender: defenderSnapshot,
      challengerCompanions,
      seed,
    });

    const challengerWon = simResult.outcome === 'CHALLENGER_VICTORY';
    const winnerCharacterId = challengerWon
      ? challenger.id
      : isNpcRival
        ? null
        : defenderDbId;
    const seasonKey = getCurrentSeasonKey();

    const matchRecord = await withDbTransaction(
      db,
      async (tx) => {
        const createdMatch = await tx.arenaMatch.create({
          data: {
            challengerCharacterId: challenger.id,
            defenderCharacterId: isNpcRival ? null : defenderDbId,
            defenderName: defenderSnapshot.name,
            isNpcRival,
            winnerCharacterId,
            seasonKey,
            outcome: simResult.outcome,
            randomSeed: simResult.seed,
            totalTurns: simResult.totalTurns,
            challengerDamageDealt: simResult.challengerDamageDealt,
            defenderDamageDealt: simResult.defenderDamageDealt,
            challengerRatingBefore: challenger.arenaRating ?? 1000,
            challengerRatingAfter: simResult.nextChallengerRating,
            defenderRatingBefore: defenderSnapshot.arenaRating ?? 1000,
            defenderRatingAfter: simResult.nextDefenderRating,
            goldAwarded: simResult.goldAwarded,
            seasonPointsAwarded: simResult.seasonPointsAwarded,
            combatSummary: {
              winnerCharacterId: simResult.winnerCharacterId,
              challengerRemainingHp: simResult.challengerRemainingHp,
              defenderRemainingHp: simResult.defenderRemainingHp,
              combatLog: simResult.combatLog.slice(-40),
            } as unknown as object,
          },
        });

        await tx.character.update({
          where: { id: challenger.id },
          data: {
            arenaRating: simResult.nextChallengerRating,
            ...(challengerWon
              ? { arenaWins: { increment: 1 } }
              : { arenaLosses: { increment: 1 } }),
            gold: { increment: simResult.goldAwarded },
          },
        });

        if (!isNpcRival && defenderDbId) {
          await tx.character.update({
            where: { id: defenderDbId },
            data: {
              arenaRating: simResult.nextDefenderRating,
              ...(!challengerWon
                ? { arenaWins: { increment: 1 } }
                : { arenaLosses: { increment: 1 } }),
            },
          });
        }

        await incrementClanSeasonMetrics(tx, {
          characterId: challenger.id,
          arenaPointsDelta: simResult.seasonPointsAwarded,
          arenaVictoriesDelta: challengerWon ? 1 : 0,
          seasonKey,
        });

        return createdMatch;
      },
      `arena:${challenger.id}`
    );

    return reply.send({
      match: matchRecord,
      simulation: {
        ...simResult,
        finalState: undefined,
      },
      combatLog: simResult.combatLog,
    });
  });
}
