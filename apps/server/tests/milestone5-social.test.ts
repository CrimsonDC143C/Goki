import { PrismaClient } from '@goki/database';
import { getCurrentSeasonKey } from '@goki/game-engine';
import { describe, expect, it } from 'vitest';
import { buildServerApp } from '../src/app';
import {
  CompositeGymDiscoveryService,
  OpenStreetMapOverpassAdapter,
} from '../src/services/gym-discovery-provider';

interface SocialMockStore {
  users: Map<string, any>;
  characters: Map<string, any>;
  characterStats: Map<string, any>;
  fatigueStates: Map<string, any>;
  gymClans: Map<string, any>;
  gymClanMembers: Map<string, any>;
  gymClanSeasons: Map<string, any>;
  companies: Map<string, any>;
  companyMembers: Map<string, any>;
  friendships: Map<string, any>;
  raids: Map<string, any>;
  raidContributions: Map<string, any>;
  arenaMatches: any[];
  workoutLogs: any[];
  workoutSessions: any[];
  rewardPayloads: any[];
  items: Map<string, any>;
  inventoryItems: Map<string, any>;
}

function createSocialMockDb(): { db: PrismaClient; store: SocialMockStore } {
  let idCounter = 1;
  const nextId = (prefix: string) => `${prefix}_${idCounter++}`;

  const store: SocialMockStore = {
    users: new Map(),
    characters: new Map(),
    characterStats: new Map(),
    fatigueStates: new Map(),
    gymClans: new Map(),
    gymClanMembers: new Map(),
    gymClanSeasons: new Map(),
    companies: new Map(),
    companyMembers: new Map(),
    friendships: new Map(),
    raids: new Map(),
    raidContributions: new Map(),
    arenaMatches: [],
    workoutLogs: [],
    workoutSessions: [],
    rewardPayloads: [],
    items: new Map(),
    inventoryItems: new Map(),
  };

  const applyIncrement = (obj: any, data: Record<string, any>) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
        if ('increment' in v) {
          const cur = obj[k];
          if (typeof cur === 'bigint' || typeof v.increment === 'bigint') {
            obj[k] = BigInt(cur ?? 0) + BigInt(v.increment);
          } else {
            obj[k] = Number(cur ?? 0) + Number(v.increment);
          }
          continue;
        }
      }
      if (v !== undefined) {
        obj[k] = v;
      }
    }
  };

  const enrichCharacter = (char: any) => {
    if (!char) return null;
    const stats = store.characterStats.get(char.id) ?? {
      characterId: char.id,
      strengthLevel: 6,
      strengthXp: 0,
      strengthTalentPointsAvailable: 0,
      enduranceLevel: 5,
      enduranceXp: 0,
      enduranceTalentPointsAvailable: 0,
      agilityLevel: 5,
      agilityXp: 0,
      agilityTalentPointsAvailable: 0,
    };
    const gymClanMemberships = Array.from(store.gymClanMembers.values())
      .filter((m) => m.characterId === char.id)
      .map((m) => ({
        ...m,
        gymClan: store.gymClans.get(m.gymClanId) ?? null,
      }));
    const companyMem =
      Array.from(store.companyMembers.values()).find((m) => m.characterId === char.id) ?? null;
    const companyMembership = companyMem
      ? {
          ...companyMem,
          company: store.companies.get(companyMem.companyId) ?? null,
        }
      : null;

    return {
      ...char,
      stats,
      fatigueState: store.fatigueStates.get(char.id) ?? null,
      talentUnlocks: char.talentUnlocks ?? [],
      inventoryItems: char.inventoryItems ?? [],
      equipmentLoadout: char.equipmentLoadout ?? null,
      gymClanMemberships,
      companyMembership,
      user: store.users.get(char.userId) ?? null,
    };
  };

  const enrichClan = (clan: any, seasonKeyFilter?: string) => {
    if (!clan) return null;
    const members = Array.from(store.gymClanMembers.values())
      .filter((m) => m.gymClanId === clan.id)
      .map((m) => ({
        ...m,
        character: store.characters.get(m.characterId) ?? null,
      }));
    const seasons = Array.from(store.gymClanSeasons.values()).filter(
      (s) => s.gymClanId === clan.id && (!seasonKeyFilter || s.seasonKey === seasonKeyFilter)
    );
    return {
      ...clan,
      members,
      seasons,
      _count: { members: members.length },
    };
  };

  const db: any = {
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(db),

    user: {
      findUnique: async ({ where }: any) => {
        if (where.id) return store.users.get(where.id) ?? null;
        if (where.email) {
          return (
            Array.from(store.users.values()).find((u) => u.email === where.email) ?? null
          );
        }
        if (where.username) {
          return (
            Array.from(store.users.values()).find((u) => u.username === where.username) ?? null
          );
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        for (const u of store.users.values()) {
          if (where?.OR) {
            const matched = where.OR.some(
              (cond: any) =>
                (cond.email && u.email === cond.email) ||
                (cond.username && u.username === cond.username)
            );
            if (matched) return u;
          }
        }
        return null;
      },
      create: async ({ data }: any) => {
        const id = data.id ?? nextId('user');
        const created = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        store.users.set(id, created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const user = store.users.get(where.id);
        if (!user) throw new Error('User not found');
        Object.assign(user, data, { updatedAt: new Date() });
        return user;
      },
    },

    character: {
      findUnique: async ({ where }: any) => {
        if (where.id) {
          return enrichCharacter(store.characters.get(where.id) ?? null);
        }
        if (where.name) {
          const found = Array.from(store.characters.values()).find(
            (c) => c.name === where.name
          );
          return enrichCharacter(found ?? null);
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        for (const c of store.characters.values()) {
          if (where?.deletedAt === null && c.deletedAt != null) continue;
          if (where?.userId && c.userId !== where.userId) continue;
          if (where?.gameMode && c.gameMode !== where.gameMode) continue;
          if (where?.name) {
            const targetName =
              typeof where.name === 'string' ? where.name : where.name.equals;
            if (targetName && c.name.toLowerCase() !== String(targetName).toLowerCase()) {
              continue;
            }
          }
          return enrichCharacter(c);
        }
        return null;
      },
      findMany: async ({ where, orderBy, take }: any = {}) => {
        let rows = Array.from(store.characters.values());
        if (where) {
          if (where.deletedAt === null) {
            rows = rows.filter((c) => c.deletedAt == null);
          }
          if (where.userId) {
            rows = rows.filter((c) => c.userId === where.userId);
          }
          if (where.id?.not) {
            rows = rows.filter((c) => c.id !== where.id.not);
          }
        }
        if (Array.isArray(orderBy)) {
          rows.sort((a, b) => {
            for (const clause of orderBy) {
              const [field, dir] = Object.entries(clause)[0]!;
              const diff = Number(b[field] ?? 0) - Number(a[field] ?? 0);
              if (diff !== 0) return dir === 'desc' ? diff : -diff;
            }
            return 0;
          });
        }
        if (typeof take === 'number') {
          rows = rows.slice(0, take);
        }
        return rows.map((c) => enrichCharacter(c));
      },
      create: async ({ data }: any) => {
        const id = data.id ?? nextId('char');
        const created: any = {
          id,
          userId: data.userId,
          name: data.name,
          appearanceId: data.appearanceId ?? 'oni_warlord',
          avatarSpriteId: data.avatarSpriteId ?? 'oni_warlord',
          race: data.race ?? 'HUMAN',
          customizationConfig: data.customizationConfig ?? null,
          deletedAt: null,
          gameMode: data.gameMode ?? 'STANDARD',
          adventurerRank: data.adventurerRank ?? 'COPPER',
          adventurerReputation: data.adventurerReputation ?? 0,
          arenaRating: data.arenaRating ?? 1000,
          arenaWins: data.arenaWins ?? 0,
          arenaLosses: data.arenaLosses ?? 0,
          gold: data.gold ?? 100,
          overallLevel: data.overallLevel ?? 1,
          dexLevel: data.dexLevel ?? 1,
          dexXp: 0,
          conLevel: data.conLevel ?? 1,
          conXp: 0,
          wisLevel: data.wisLevel ?? 1,
          wisXp: 0,
          sprLevel: data.sprLevel ?? 1,
          sprXp: 0,
          currentLocation: 'TAVERN',
          activityState: 'IDLE',
          activeSkillLoadout: [],
          beltLoadout: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.characters.set(id, created);
        store.characterStats.set(id, {
          characterId: id,
          strengthLevel: 5,
          strengthXp: 0,
          strengthTalentPointsAvailable: 0,
          enduranceLevel: 5,
          enduranceXp: 0,
          enduranceTalentPointsAvailable: 0,
          agilityLevel: 5,
          agilityXp: 0,
          agilityTalentPointsAvailable: 0,
        });
        store.fatigueStates.set(id, {
          characterId: id,
          isRestingInTavern: false,
          tavernEnteredAt: null,
          lastStrenuousWorkoutAt: null,
          lastWorkoutAt: null,
          consecutiveHighIntensityDays: 0,
          lastHighIntensityDayKey: null,
          systemicFatigueStacks: 0,
          fatigueScore: 0,
          wellRestedMultiplier: 1.0,
          activeRecoveryBuffActive: false,
          activeRecoveryGrantedAt: null,
        });
        return enrichCharacter(created);
      },
      update: async ({ where, data }: any) => {
        const char = store.characters.get(where.id);
        if (!char) throw new Error(`Character '${where.id}' not found`);
        applyIncrement(char, data);
        char.updatedAt = new Date();
        return enrichCharacter(char);
      },
    },

    characterStats: {
      update: async ({ where, data }: any) => {
        const stats = store.characterStats.get(where.characterId);
        if (!stats) throw new Error('Stats not found');
        applyIncrement(stats, data);
        return stats;
      },
    },

    fatigueAndRestState: {
      update: async ({ where, data }: any) => {
        const state = store.fatigueStates.get(where.characterId) ?? {
          characterId: where.characterId,
        };
        applyIncrement(state, data);
        store.fatigueStates.set(where.characterId, state);
        return state;
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = store.fatigueStates.get(where.characterId);
        if (existing) {
          applyIncrement(existing, update ?? {});
          return existing;
        }
        const created = { characterId: where.characterId, ...create };
        store.fatigueStates.set(where.characterId, created);
        return created;
      },
    },

    exerciseCatalog: {
      findMany: async () => [
        {
          id: 'ex_bench',
          slug: 'barbell_bench_press',
          name: 'Barbell Bench Press',
          category: 'RESISTANCE',
          primaryStat: 'STRENGTH',
          baseXpFactor: 1.0,
        },
      ],
    },

    userExercisePR: {
      findMany: async () => [],
      upsert: async () => ({}),
    },

    dungeonRunParticipant: {
      findFirst: async () => null,
    },

    workoutLog: {
      create: async ({ data }: any) => {
        const created = { id: nextId('wlog'), ...data, createdAt: new Date() };
        store.workoutLogs.push(created);
        return created;
      },
    },

    workoutSession: {
      create: async ({ data }: any) => {
        const created = { id: data.id ?? nextId('wsess'), ...data };
        store.workoutSessions.push(created);
        return created;
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = store.workoutSessions.find((s) => s.id === where.id);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { id: where.id, ...create };
        store.workoutSessions.push(created);
        return created;
      },
    },

    rewardPayload: {
      create: async ({ data }: any) => {
        const created = { id: nextId('rpay'), ...data };
        store.rewardPayloads.push(created);
        return created;
      },
    },

    item: {
      findUnique: async ({ where }: any) => store.items.get(where.slug) ?? null,
      create: async ({ data }: any) => {
        const created = { id: nextId('item'), ...data };
        store.items.set(data.slug, created);
        return created;
      },
    },

    inventoryItem: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const created = { id: nextId('inv'), ...data };
        store.inventoryItems.set(created.id, created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const inv = store.inventoryItems.get(where.id);
        if (inv) applyIncrement(inv, data);
        return inv;
      },
    },

    gymClan: {
      findUnique: async ({ where }: any) => {
        let found: any = null;
        if (where.id) found = store.gymClans.get(where.id) ?? null;
        else if (where.venueKey) {
          found =
            Array.from(store.gymClans.values()).find((c) => c.venueKey === where.venueKey) ??
            null;
        } else if (where.slug) {
          found =
            Array.from(store.gymClans.values()).find((c) => c.slug === where.slug) ?? null;
        }
        return enrichClan(found);
      },
      findMany: async ({ where, include }: any = {}) => {
        let rows = Array.from(store.gymClans.values());
        if (where?.kind) {
          rows = rows.filter((c) => c.kind === where.kind);
        }
        const seasonFilter = include?.seasons?.where?.seasonKey;
        return rows.map((c) => enrichClan(c, seasonFilter));
      },
      create: async ({ data }: any) => {
        const id = data.id ?? nextId('clan');
        const created = {
          id,
          clanLevel: 1,
          clanReputation: 0,
          maxMembers: 200,
          requiresVerifiedMode: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        store.gymClans.set(id, created);
        return enrichClan(created);
      },
      update: async ({ where, data }: any) => {
        const clan = store.gymClans.get(where.id);
        if (!clan) throw new Error('GymClan not found');
        applyIncrement(clan, data);
        clan.updatedAt = new Date();
        return enrichClan(clan);
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = Array.from(store.gymClans.values()).find(
          (c) =>
            (where.venueKey && c.venueKey === where.venueKey) ||
            (where.id && c.id === where.id)
        );
        if (existing) {
          applyIncrement(existing, update ?? {});
          existing.updatedAt = new Date();
          return enrichClan(existing);
        }
        return db.gymClan.create({ data: create });
      },
    },

    gymClanMember: {
      findUnique: async ({ where }: any) => {
        if (where.id) return store.gymClanMembers.get(where.id) ?? null;
        if (where.characterId_clanKind) {
          const { characterId, clanKind } = where.characterId_clanKind;
          return (
            Array.from(store.gymClanMembers.values()).find(
              (m) => m.characterId === characterId && m.clanKind === clanKind
            ) ?? null
          );
        }
        if (where.gymClanId_characterId) {
          const { gymClanId, characterId } = where.gymClanId_characterId;
          return (
            Array.from(store.gymClanMembers.values()).find(
              (m) => m.gymClanId === gymClanId && m.characterId === characterId
            ) ?? null
          );
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        return (
          Array.from(store.gymClanMembers.values()).find((m) => {
            if (where?.gymClanId && m.gymClanId !== where.gymClanId) return false;
            if (where?.characterId && m.characterId !== where.characterId) return false;
            if (where?.clanKind && m.clanKind !== where.clanKind) return false;
            return true;
          }) ?? null
        );
      },
      findMany: async ({ where, include }: any = {}) => {
        let rows = Array.from(store.gymClanMembers.values());
        if (where?.characterId) {
          rows = rows.filter((m) => m.characterId === where.characterId);
        }
        if (where?.gymClanId) {
          rows = rows.filter((m) => m.gymClanId === where.gymClanId);
        }
        const seasonFilter = include?.gymClan?.include?.seasons?.where?.seasonKey;
        return rows.map((m) => ({
          ...m,
          gymClan: enrichClan(store.gymClans.get(m.gymClanId) ?? null, seasonFilter),
          character: store.characters.get(m.characterId) ?? null,
        }));
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = await db.gymClanMember.findUnique({ where });
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const id = nextId('cmem');
        const created = {
          id,
          contributedReputation: 0,
          joinedAt: new Date(),
          ...create,
        };
        store.gymClanMembers.set(id, created);
        return created;
      },
      delete: async ({ where }: any) => {
        const existing = store.gymClanMembers.get(where.id);
        if (!existing) throw new Error('GymClanMember not found');
        store.gymClanMembers.delete(where.id);
        return existing;
      },
    },

    gymClanSeason: {
      findMany: async ({ where, orderBy, take }: any = {}) => {
        let rows = Array.from(store.gymClanSeasons.values());
        if (where?.seasonKey) {
          rows = rows.filter((s) => s.seasonKey === where.seasonKey);
        }
        if (Array.isArray(orderBy)) {
          rows.sort((a, b) => {
            for (const clause of orderBy) {
              const [field, dir] = Object.entries(clause)[0]!;
              const diff = Number(b[field] ?? 0) - Number(a[field] ?? 0);
              if (diff !== 0) return dir === 'desc' ? diff : -diff;
            }
            return 0;
          });
        }
        if (typeof take === 'number') rows = rows.slice(0, take);
        return rows.map((s) => ({
          ...s,
          gymClan: enrichClan(store.gymClans.get(s.gymClanId) ?? null),
        }));
      },
      upsert: async ({ where, update, create }: any) => {
        const key = `${where.gymClanId_seasonKey.gymClanId}:${where.gymClanId_seasonKey.seasonKey}`;
        const existing = store.gymClanSeasons.get(key);
        if (existing) {
          applyIncrement(existing, update ?? {});
          existing.updatedAt = new Date();
          return existing;
        }
        const created = {
          id: nextId('season'),
          totalSeasonPoints: 0,
          workoutPoints: 0,
          raidPoints: 0,
          arenaPoints: 0,
          workoutsCount: 0,
          raidBossesDefeated: 0,
          arenaVictories: 0,
          activeMemberCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };
        store.gymClanSeasons.set(key, created);
        return created;
      },
    },

    adventurerCompany: {
      findUnique: async ({ where }: any) => {
        const c = store.companies.get(where.id);
        if (!c) return null;
        const members = Array.from(store.companyMembers.values())
          .filter((m) => m.companyId === c.id)
          .map((m) => ({ ...m, character: enrichCharacter(store.characters.get(m.characterId)) }));
        return { ...c, members, _count: { members: members.length } };
      },
      findFirst: async ({ where }: any) => {
        for (const c of store.companies.values()) {
          if (where?.OR) {
            const hit = where.OR.some(
              (cond: any) => (cond.name && c.name === cond.name) || (cond.tag && c.tag === cond.tag)
            );
            if (hit) return c;
          }
        }
        return null;
      },
      findMany: async () => {
        return Array.from(store.companies.values()).map((c) => {
          const members = Array.from(store.companyMembers.values())
            .filter((m) => m.companyId === c.id)
            .map((m) => ({ ...m, character: store.characters.get(m.characterId) ?? null }));
          return { ...c, members, _count: { members: members.length } };
        });
      },
      create: async ({ data }: any) => {
        const id = nextId('comp');
        const { members: nestedMembers, ...rest } = data;
        const created = {
          id,
          companyLevel: 1,
          companyReputation: 0,
          maxRosterSize: 30,
          maxActiveSquadSize: 4,
          requiresVerifiedMode: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...rest,
        };
        store.companies.set(id, created);
        if (nestedMembers?.create) {
          const mData = nestedMembers.create;
          const mid = nextId('compmem');
          store.companyMembers.set(mid, {
            id: mid,
            companyId: id,
            contributedReputation: 0,
            joinedAt: new Date(),
            ...mData,
          });
        }
        return db.adventurerCompany.findUnique({ where: { id } });
      },
      update: async ({ where, data }: any) => {
        const comp = store.companies.get(where.id);
        if (!comp) throw new Error('Company not found');
        Object.assign(comp, data, { updatedAt: new Date() });
        return comp;
      },
      delete: async ({ where }: any) => {
        const comp = store.companies.get(where.id);
        store.companies.delete(where.id);
        return comp;
      },
    },

    adventurerCompanyMember: {
      findUnique: async ({ where }: any) => {
        const found = Array.from(store.companyMembers.values()).find(
          (m) => (where.characterId && m.characterId === where.characterId) || (where.id && m.id === where.id)
        );
        if (!found) return null;
        const company = store.companies.get(found.companyId) ?? null;
        return {
          ...found,
          company: company
            ? {
                ...company,
                members: Array.from(store.companyMembers.values())
                  .filter((m) => m.companyId === company.id)
                  .map((m) => ({ ...m, character: store.characters.get(m.characterId) ?? null })),
              }
            : null,
        };
      },
      findMany: async ({ where, orderBy, take }: any = {}) => {
        let rows = Array.from(store.companyMembers.values());
        if (where?.companyId) rows = rows.filter((m) => m.companyId === where.companyId);
        if (where?.characterId?.not) {
          rows = rows.filter((m) => m.characterId !== where.characterId.not);
        }
        if (where?.activeSquadSlot?.not === null) {
          rows = rows.filter((m) => m.activeSquadSlot !== null);
        }
        if (orderBy?.activeSquadSlot === 'asc') {
          rows.sort((a, b) => (a.activeSquadSlot ?? 99) - (b.activeSquadSlot ?? 99));
        }
        if (typeof take === 'number') rows = rows.slice(0, take);
        return rows.map((m) => ({
          ...m,
          character: enrichCharacter(store.characters.get(m.characterId) ?? null),
        }));
      },
      create: async ({ data }: any) => {
        const id = nextId('compmem');
        const created = {
          id,
          contributedReputation: 0,
          joinedAt: new Date(),
          ...data,
        };
        store.companyMembers.set(id, created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const mem = Array.from(store.companyMembers.values()).find(
          (m) => (where.id && m.id === where.id) || (where.characterId && m.characterId === where.characterId)
        );
        if (!mem) throw new Error('Company member not found');
        Object.assign(mem, data);
        return mem;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const m of store.companyMembers.values()) {
          if (!where?.companyId || m.companyId === where.companyId) {
            Object.assign(m, data);
            count += 1;
          }
        }
        return { count };
      },
      delete: async ({ where }: any) => {
        const existing = store.companyMembers.get(where.id);
        store.companyMembers.delete(where.id);
        return existing;
      },
    },

    friendship: {
      findUnique: async ({ where }: any) => {
        if (where.id) return store.friendships.get(where.id) ?? null;
        if (where.pairKey) {
          return (
            Array.from(store.friendships.values()).find((f) => f.pairKey === where.pairKey) ?? null
          );
        }
        return null;
      },
      findMany: async ({ where }: any = {}) => {
        let rows = Array.from(store.friendships.values());
        if (where?.OR) {
          rows = rows.filter((f) =>
            where.OR.some(
              (cond: any) =>
                (cond.requesterId && f.requesterId === cond.requesterId) ||
                (cond.addresseeId && f.addresseeId === cond.addresseeId)
            )
          );
        } else {
          if (where?.addresseeId) rows = rows.filter((f) => f.addresseeId === where.addresseeId);
          if (where?.status) rows = rows.filter((f) => f.status === where.status);
        }
        return rows.map((f) => ({
          ...f,
          requester: store.users.get(f.requesterId) ?? null,
          addressee: store.users.get(f.addresseeId) ?? null,
        }));
      },
      count: async ({ where }: any) => {
        return Array.from(store.friendships.values()).filter(
          (f) =>
            (!where?.addresseeId || f.addresseeId === where.addresseeId) &&
            (!where?.status || f.status === where.status)
        ).length;
      },
      create: async ({ data }: any) => {
        const id = nextId('fr');
        const created = {
          id,
          respondedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        store.friendships.set(id, created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const f = store.friendships.get(where.id);
        if (!f) throw new Error('Friendship not found');
        Object.assign(f, data, { updatedAt: new Date() });
        return f;
      },
      delete: async ({ where }: any) => {
        const f = store.friendships.get(where.id);
        store.friendships.delete(where.id);
        return f;
      },
    },

    raidBossInstance: {
      findUnique: async ({ where }: any) => store.raids.get(where.id) ?? null,
      findMany: async ({ where }: any = {}) => {
        let rows = Array.from(store.raids.values());
        if (where?.accessType) {
          rows = rows.filter((r) => r.accessType === where.accessType);
        } else if (where?.OR) {
          rows = rows.filter((r) =>
            where.OR.some((cond: any) => {
              if (cond.accessType && r.accessType === cond.accessType) return true;
              if (cond.gymClanId?.in && cond.gymClanId.in.includes(r.gymClanId)) return true;
              if (typeof cond.gymClanId === 'string' && r.gymClanId === cond.gymClanId) return true;
              return false;
            })
          );
        }
        return rows.map((r) => ({
          ...r,
          gymClan: r.gymClanId ? store.gymClans.get(r.gymClanId) ?? null : null,
          contributions: Array.from(store.raidContributions.values()).filter(
            (c) => c.raidInstanceId === r.id
          ),
        }));
      },
      create: async ({ data }: any) => {
        const id = nextId('raid');
        const created = {
          id,
          isDefeated: false,
          totalRaidDamage: 0n,
          bullMqJobId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        store.raids.set(id, created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const raid = store.raids.get(where.id);
        if (!raid) throw new Error('Raid not found');
        applyIncrement(raid, data);
        raid.updatedAt = new Date();
        return raid;
      },
    },

    raidParticipantContribution: {
      findUnique: async ({ where }: any) => {
        const { raidInstanceId, characterId } = where.raidInstanceId_characterId;
        return store.raidContributions.get(`${raidInstanceId}:${characterId}`) ?? null;
      },
      upsert: async ({ where, update, create }: any) => {
        const { raidInstanceId, characterId } = where.raidInstanceId_characterId;
        const key = `${raidInstanceId}:${characterId}`;
        const existing = store.raidContributions.get(key);
        if (existing) {
          applyIncrement(existing, update);
          existing.updatedAt = new Date();
          return existing;
        }
        const created = {
          id: nextId('rcontrib'),
          combatDamageDealt: 0n,
          workoutEnergyDamage: 0n,
          supportScore: 0n,
          totalContributionScore: 0n,
          dailyAttacksUsed: 0,
          lastAttackAt: null,
          workoutsChanneled: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };
        store.raidContributions.set(key, created);
        return created;
      },
    },

    arenaMatch: {
      findMany: async ({ where, take }: any = {}) => {
        let rows = [...store.arenaMatches];
        if (where?.OR) {
          rows = rows.filter((m) =>
            where.OR.some(
              (cond: any) =>
                (cond.challengerCharacterId &&
                  m.challengerCharacterId === cond.challengerCharacterId) ||
                (cond.defenderCharacterId &&
                  m.defenderCharacterId === cond.defenderCharacterId)
            )
          );
        }
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
      create: async ({ data }: any) => {
        const created = {
          id: nextId('arena'),
          createdAt: new Date(),
          ...data,
        };
        store.arenaMatches.unshift(created);
        return created;
      },
    },
  };

  return { db: db as unknown as PrismaClient, store };
}

async function seedUserAndHero(
  db: PrismaClient,
  app: any,
  opts: { username: string; heroName: string; strengthLevel?: number }
) {
  const user = await (db as any).user.create({
    data: {
      email: `${opts.username}@goki.test`,
      username: opts.username,
      passwordHash: 'hash',
      timezone: 'UTC',
    },
  });
  const char = await (db as any).character.create({
    data: {
      userId: user.id,
      name: opts.heroName,
      overallLevel: 5,
    },
  });
  if (opts.strengthLevel) {
    await (db as any).characterStats.update({
      where: { characterId: char.id },
      data: { strengthLevel: opts.strengthLevel },
    });
  }
  const token = app.jwt.sign({
    userId: user.id,
    email: user.email,
    username: user.username,
  });
  return { user, char, token };
}

describe('Milestone 5: Social Hub, Gym Clans, Adventurer Companies, Friends, Seasons & Arena', () => {
  it('1. Discovers gyms via OSM Overpass adapter, degrades cleanly on failure/timeout, and deduplicates overlapping claims', async () => {
    const { db } = createSocialMockDb();

    // Unit test OpenStreetMapOverpassAdapter with mocked Overpass JSON
    const successAdapter = new OpenStreetMapOverpassAdapter({
      fetchImpl: (async () =>
        ({
          ok: true,
          json: async () => ({
            elements: [
              {
                type: 'node',
                id: 987654321,
                lat: 37.775,
                lon: -122.419,
                tags: {
                  name: 'Ironworks Barbell Club',
                  'addr:housenumber': '101',
                  'addr:street': 'Market St',
                  'addr:city': 'San Francisco',
                  'addr:country': 'US',
                },
              },
            ],
          }),
        }) as Response) as typeof fetch,
    });

    const discoveryService = new CompositeGymDiscoveryService({
      overpassAdapter: successAdapter,
    });

    const app = await buildServerApp({ db, gymDiscoveryProvider: discoveryService });
    const heroA = await seedUserAndHero(db, app, { username: 'alice', heroName: 'AliceIron' });
    const heroB = await seedUserAndHero(db, app, { username: 'bob', heroName: 'BobLift' });

    const discoverRes = await app.inject({
      method: 'GET',
      url: '/api/social/gyms/discover?lat=37.775&lon=-122.419&radiusMeters=3000',
    });
    expect(discoverRes.statusCode).toBe(200);
    const discoverJson = discoverRes.json();
    expect(discoverJson.overpassFallbackUsed).toBe(false);
    expect(discoverJson.sourcesUsed).toContain('OSM_OVERPASS');
    expect(discoverJson.venues).toHaveLength(1);
    expect(discoverJson.venues[0].name).toBe('Ironworks Barbell Club');
    expect(discoverJson.venues[0].venueKey).toBe('osm:node:987654321');
    expect(discoverJson.venues[0].address).toBe('101 Market St');

    // Hero A claims the venue
    const claimARes = await app.inject({
      method: 'POST',
      url: '/api/social/clans/claim-or-join',
      headers: { authorization: `Bearer ${heroA.token}` },
      payload: {
        characterId: heroA.char.id,
        venue: {
          name: 'Ironworks Barbell Club',
          latitude: 37.775,
          longitude: -122.419,
          city: 'San Francisco',
          osmElementType: 'node',
          osmElementId: '987654321',
        },
      },
    });
    expect(claimARes.statusCode).toBe(200);
    const claimA = claimARes.json();
    expect(claimA.deduplicated).toBe(false);
    expect(claimA.membership.role).toBe('WARDEN');

    // Hero B submits near-identical coordinates (<60m) without OSM ID -> deduplicates into Hero A's clan!
    const claimBRes = await app.inject({
      method: 'POST',
      url: '/api/social/clans/claim-or-join',
      headers: { authorization: `Bearer ${heroB.token}` },
      payload: {
        characterId: heroB.char.id,
        venue: {
          name: 'Ironworks Gym',
          latitude: 37.7751,
          longitude: -122.4191,
        },
      },
    });
    expect(claimBRes.statusCode).toBe(200);
    const claimB = claimBRes.json();
    expect(claimB.deduplicated).toBe(true);
    expect(claimB.clan.id).toBe(claimA.clan.id);
    expect(claimB.membership.role).toBe('MEMBER');

    // Verify Overpass failure/timeout fallback returns local DB venues without throwing
    const failingAdapter = new OpenStreetMapOverpassAdapter({
      timeoutMs: 20,
      fetchImpl: (async () => {
        throw new Error('Network timeout');
      }) as typeof fetch,
    });
    const fallbackService = new CompositeGymDiscoveryService({
      overpassAdapter: failingAdapter,
    });
    const fallbackResult = await fallbackService.discoverNearbyGyms({
      db,
      latitude: 37.775,
      longitude: -122.419,
      radiusMeters: 3000,
    });
    expect(fallbackResult.overpassFallbackUsed).toBe(true);
    expect(fallbackResult.venues).toHaveLength(1);
    expect(fallbackResult.venues[0]?.existingClanId).toBe(claimA.clan.id);
    expect(fallbackResult.venues[0]?.memberCount).toBe(2);

    await app.close();
  });

  it('2. Enforces dual-clan membership: auto-enrolls OPEN_WORLD_HOME, switches GYM_VENUE safely, and blocks leaving HOME', async () => {
    const { db } = createSocialMockDb();
    const app = await buildServerApp({ db });
    const hero = await seedUserAndHero(db, app, { username: 'kira', heroName: 'KiraValkyrie' });

    // GET /api/social/overview auto-enrolls in OPEN_WORLD_HOME
    const overviewRes = await app.inject({
      method: 'GET',
      url: `/api/social/overview?characterId=${hero.char.id}`,
      headers: { authorization: `Bearer ${hero.token}` },
    });
    expect(overviewRes.statusCode).toBe(200);
    const overview = overviewRes.json();
    expect(overview.homeClan).toBeTruthy();
    expect(overview.homeClan.kind).toBe('OPEN_WORLD_HOME');
    expect(overview.gymClan).toBeNull();
    expect(overview.memberships).toHaveLength(1);

    // Join Gym A
    const joinGymARes = await app.inject({
      method: 'POST',
      url: '/api/social/clans/claim-or-join',
      headers: { authorization: `Bearer ${hero.token}` },
      payload: {
        characterId: hero.char.id,
        venue: {
          name: 'Apex Strength Lab',
          latitude: 40.7128,
          longitude: -74.006,
        },
      },
    });
    expect(joinGymARes.statusCode).toBe(200);
    const gymAClanId = joinGymARes.json().clan.id;

    // Switch to Gym B -> keeps OPEN_WORLD_HOME and replaces GYM_VENUE
    const joinGymBRes = await app.inject({
      method: 'POST',
      url: '/api/social/clans/claim-or-join',
      headers: { authorization: `Bearer ${hero.token}` },
      payload: {
        characterId: hero.char.id,
        venue: {
          name: 'Titan Athletics',
          latitude: 40.75,
          longitude: -73.99,
        },
      },
    });
    expect(joinGymBRes.statusCode).toBe(200);
    const gymBClanId = joinGymBRes.json().clan.id;
    expect(gymBClanId).not.toBe(gymAClanId);

    const overviewAfterSwitch = await app.inject({
      method: 'GET',
      url: `/api/social/overview?characterId=${hero.char.id}`,
      headers: { authorization: `Bearer ${hero.token}` },
    });
    const switchJson = overviewAfterSwitch.json();
    expect(switchJson.homeClan.id).toBe(overview.homeClan.id);
    expect(switchJson.gymClan.id).toBe(gymBClanId);
    expect(switchJson.memberships).toHaveLength(2);

    // Cannot leave OPEN_WORLD_HOME
    const leaveHomeRes = await app.inject({
      method: 'POST',
      url: '/api/social/clans/leave-gym',
      headers: { authorization: `Bearer ${hero.token}` },
      payload: {
        characterId: hero.char.id,
        clanId: overview.homeClan.id,
      },
    });
    expect(leaveHomeRes.statusCode).toBe(400);

    // Leave GYM_VENUE cleanly while retaining OPEN_WORLD_HOME
    const leaveGymRes = await app.inject({
      method: 'POST',
      url: '/api/social/clans/leave-gym',
      headers: { authorization: `Bearer ${hero.token}` },
      payload: { characterId: hero.char.id },
    });
    expect(leaveGymRes.statusCode).toBe(200);
    expect(leaveGymRes.json().leftClanId).toBe(gymBClanId);

    const afterLeaveOverview = await app.inject({
      method: 'GET',
      url: `/api/social/overview?characterId=${hero.char.id}`,
      headers: { authorization: `Bearer ${hero.token}` },
    });
    expect(afterLeaveOverview.json().homeClan.id).toBe(overview.homeClan.id);
    expect(afterLeaveOverview.json().gymClan).toBeNull();

    await app.close();
  });

  it('3. Enforces Raid authorization: PUBLIC_WORLD allows all, CLAN_ONLY spawn requires WARDEN/OFFICER and attack rejects non-members (403)', async () => {
    const { db } = createSocialMockDb();
    const app = await buildServerApp({ db });
    const warden = await seedUserAndHero(db, app, { username: 'warden', heroName: 'WardenRex' });
    const member = await seedUserAndHero(db, app, { username: 'mem', heroName: 'MemberLyn' });
    const outsider = await seedUserAndHero(db, app, { username: 'out', heroName: 'OutsiderKai' });

    // Enroll all in HOME via overview
    await app.inject({
      method: 'GET',
      url: `/api/social/overview?characterId=${outsider.char.id}`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    const wardenOverview = await app.inject({
      method: 'GET',
      url: `/api/social/overview?characterId=${warden.char.id}`,
      headers: { authorization: `Bearer ${warden.token}` },
    });
    const homeClanId = wardenOverview.json().homeClan.id;

    // Warden founds physical gym clan
    const claimRes = await app.inject({
      method: 'POST',
      url: '/api/social/clans/claim-or-join',
      headers: { authorization: `Bearer ${warden.token}` },
      payload: {
        characterId: warden.char.id,
        venue: { name: 'Valhalla Iron', latitude: 34.05, longitude: -118.24 },
      },
    });
    const gymClanId = claimRes.json().clan.id;

    // Member joins physical gym clan as MEMBER
    await app.inject({
      method: 'POST',
      url: '/api/social/clans/claim-or-join',
      headers: { authorization: `Bearer ${member.token}` },
      payload: { characterId: member.char.id, clanId: gymClanId },
    });

    // Regular MEMBER cannot spawn CLAN_ONLY raid -> 403
    const memberSpawnRes = await app.inject({
      method: 'POST',
      url: '/api/social/raids/spawn',
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        characterId: member.char.id,
        gymClanId,
        bossName: 'Clangor',
        accessType: 'CLAN_ONLY',
        maxHp: 500_000,
      },
    });
    expect(memberSpawnRes.statusCode).toBe(403);

    // WARDEN spawns CLAN_ONLY raid -> 201
    const wardenSpawnRes = await app.inject({
      method: 'POST',
      url: '/api/social/raids/spawn',
      headers: { authorization: `Bearer ${warden.token}` },
      payload: {
        characterId: warden.char.id,
        gymClanId,
        bossName: 'Dreadbell Gargoyle',
        accessType: 'CLAN_ONLY',
        maxHp: 500_000,
      },
    });
    expect(wardenSpawnRes.statusCode).toBe(201);
    const clanRaidId = wardenSpawnRes.json().raid.id;

    // Outsider attacking CLAN_ONLY raid -> 403
    const outsiderAttackRes = await app.inject({
      method: 'POST',
      url: `/api/social/raids/${clanRaidId}/attack`,
      headers: { authorization: `Bearer ${outsider.token}` },
      payload: { characterId: outsider.char.id },
    });
    expect(outsiderAttackRes.statusCode).toBe(403);

    // Member attacking CLAN_ONLY raid -> 200 & increments GymClanSeason
    const memberAttackRes = await app.inject({
      method: 'POST',
      url: `/api/social/raids/${clanRaidId}/attack`,
      headers: { authorization: `Bearer ${member.token}` },
      payload: { characterId: member.char.id },
    });
    expect(memberAttackRes.statusCode).toBe(200);
    expect(memberAttackRes.json().combatDamage).toBeGreaterThan(0);

    // Spawn PUBLIC_WORLD raid bound to OPEN_WORLD_HOME & let outsider attack it
    const publicSpawnRes = await app.inject({
      method: 'POST',
      url: '/api/social/raids/spawn',
      headers: { authorization: `Bearer ${outsider.token}` },
      payload: {
        characterId: outsider.char.id,
        gymClanId: homeClanId,
        bossName: 'World Leviathan',
        accessType: 'PUBLIC_WORLD',
        maxHp: 1_000_000,
      },
    });
    expect(publicSpawnRes.statusCode).toBe(201);
    const publicRaidId = publicSpawnRes.json().raid.id;

    const outsiderPublicAttack = await app.inject({
      method: 'POST',
      url: `/api/social/raids/${publicRaidId}/attack`,
      headers: { authorization: `Bearer ${outsider.token}` },
      payload: { characterId: outsider.char.id },
    });
    expect(outsiderPublicAttack.statusCode).toBe(200);

    // Verify GymClanSeason standings reflect raidPoints
    const seasonRes = await app.inject({
      method: 'GET',
      url: '/api/social/seasons/current',
    });
    expect(seasonRes.statusCode).toBe(200);
    const clanStanding = seasonRes
      .json()
      .standings.find((s: any) => s.gymClanId === gymClanId);
    expect(clanStanding.raidPoints).toBeGreaterThan(0);

    await app.close();
  });

  it('4. Enforces Adventurer Company rules: max 1 company (409), 30-member roster cap (400), and COMMANDER/OFFICER-only squad assignment (403)', async () => {
    const { db } = createSocialMockDb();
    const app = await buildServerApp({ db });
    const commander = await seedUserAndHero(db, app, { username: 'cmdr', heroName: 'CommanderVex' });

    const createCompRes = await app.inject({
      method: 'POST',
      url: '/api/social/companies',
      headers: { authorization: `Bearer ${commander.token}` },
      payload: {
        characterId: commander.char.id,
        name: 'Dawnbreaker Vanguard',
        tag: 'DAWN',
        motto: 'Steady reps, unbroken shield.',
      },
    });
    expect(createCompRes.statusCode).toBe(201);
    const companyId = createCompRes.json().company.id;

    // Max 1 company per character -> 409
    const secondCompRes = await app.inject({
      method: 'POST',
      url: '/api/social/companies',
      headers: { authorization: `Bearer ${commander.token}` },
      payload: {
        characterId: commander.char.id,
        name: 'Nightfall Syndicate',
        tag: 'NITE',
      },
    });
    expect(secondCompRes.statusCode).toBe(409);

    // Fill remaining 29 roster slots (total = 30)
    const members: Array<{ user: any; char: any; token: string }> = [];
    for (let i = 2; i <= 30; i++) {
      const m = await seedUserAndHero(db, app, {
        username: `recruit_${i}`,
        heroName: `Recruit_${i}`,
      });
      const joinRes = await app.inject({
        method: 'POST',
        url: `/api/social/companies/${companyId}/join`,
        headers: { authorization: `Bearer ${m.token}` },
        payload: { characterId: m.char.id },
      });
      expect(joinRes.statusCode).toBe(200);
      members.push(m);
    }

    // 31st character rejected with 400
    const extraHero = await seedUserAndHero(db, app, {
      username: 'recruit_31',
      heroName: 'Recruit_31',
    });
    const fullJoinRes = await app.inject({
      method: 'POST',
      url: `/api/social/companies/${companyId}/join`,
      headers: { authorization: `Bearer ${extraHero.token}` },
      payload: { characterId: extraHero.char.id },
    });
    expect(fullJoinRes.statusCode).toBe(400);

    // Regular MEMBER cannot configure active squad -> 403
    const regularMember = members[0]!;
    const unauthorizedSquadRes = await app.inject({
      method: 'PUT',
      url: `/api/social/companies/${companyId}/squad`,
      headers: { authorization: `Bearer ${regularMember.token}` },
      payload: {
        actorCharacterId: regularMember.char.id,
        assignments: [
          { characterId: commander.char.id, squadSlot: 1 },
          { characterId: regularMember.char.id, squadSlot: 2 },
        ],
      },
    });
    expect(unauthorizedSquadRes.statusCode).toBe(403);

    // Unowned user trying to pass commanderCharacterId -> 403
    const spoofedSquadRes = await app.inject({
      method: 'PUT',
      url: `/api/social/companies/${companyId}/squad`,
      headers: { authorization: `Bearer ${regularMember.token}` },
      payload: {
        actorCharacterId: commander.char.id,
        assignments: [{ characterId: commander.char.id, squadSlot: 1 }],
      },
    });
    expect(spoofedSquadRes.statusCode).toBe(403);

    // COMMANDER assigns 4-player active squad -> 200
    const squadRes = await app.inject({
      method: 'PUT',
      url: `/api/social/companies/${companyId}/squad`,
      headers: { authorization: `Bearer ${commander.token}` },
      payload: {
        actorCharacterId: commander.char.id,
        assignments: [
          { characterId: commander.char.id, squadSlot: 1 },
          { characterId: members[5]!.char.id, squadSlot: 2 },
          { characterId: members[6]!.char.id, squadSlot: 3 },
          { characterId: members[7]!.char.id, squadSlot: 4 },
        ],
      },
    });
    expect(squadRes.statusCode).toBe(200);
    expect(squadRes.json().activeSquad).toHaveLength(4);

    await app.close();
  });

  it('5. Enforces Friendship authorization: request creation, 403 self-accept, 200 addressee accept, and removal', async () => {
    const { db } = createSocialMockDb();
    const app = await buildServerApp({ db });
    const alice = await seedUserAndHero(db, app, { username: 'alice_f', heroName: 'AliceF' });
    const bob = await seedUserAndHero(db, app, { username: 'bob_f', heroName: 'BobF' });

    const reqRes = await app.inject({
      method: 'POST',
      url: '/api/social/friends/request',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { targetUsername: 'bob_f' },
    });
    expect(reqRes.statusCode).toBe(201);
    const friendshipId = reqRes.json().friendship.id;

    // Requester cannot accept their own friend request -> 403
    const selfAcceptRes = await app.inject({
      method: 'POST',
      url: `/api/social/friends/${friendshipId}/respond`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { action: 'ACCEPT' },
    });
    expect(selfAcceptRes.statusCode).toBe(403);

    // Addressee accepts -> 200
    const bobAcceptRes = await app.inject({
      method: 'POST',
      url: `/api/social/friends/${friendshipId}/respond`,
      headers: { authorization: `Bearer ${bob.token}` },
      payload: { action: 'ACCEPT' },
    });
    expect(bobAcceptRes.statusCode).toBe(200);
    expect(bobAcceptRes.json().friendship.status).toBe('ACCEPTED');

    const friendsListRes = await app.inject({
      method: 'GET',
      url: '/api/social/friends',
      headers: { authorization: `Bearer ${alice.token}` },
    });
    expect(friendsListRes.statusCode).toBe(200);
    expect(friendsListRes.json().friends).toHaveLength(1);

    // Remove friendship
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/social/friends/${friendshipId}`,
      headers: { authorization: `Bearer ${alice.token}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    await app.close();
  });

  it('6. Aggregates GymClanSeason standings & leaderboards across workout, raid, and arena scoring', async () => {
    const { db } = createSocialMockDb();
    const app = await buildServerApp({ db });
    const hero = await seedUserAndHero(db, app, {
      username: 'season_hero',
      heroName: 'SeasonChamp',
      strengthLevel: 12,
    });

    const claimRes = await app.inject({
      method: 'POST',
      url: '/api/social/clans/claim-or-join',
      headers: { authorization: `Bearer ${hero.token}` },
      payload: {
        characterId: hero.char.id,
        venue: { name: 'Olympia Iron', latitude: 51.5074, longitude: -0.1278 },
      },
    });
    const gymClanId = claimRes.json().clan.id;

    // 1) Workout increments workoutPoints + workoutsCount
    const workoutRes = await app.inject({
      method: 'POST',
      url: `/api/characters/${hero.char.id}/workouts`,
      headers: { authorization: `Bearer ${hero.token}` },
      payload: {
        workoutType: 'RESISTANCE',
        durationSeconds: 1800,
        sets: [{ exerciseId: 'barbell_bench_press', reps: 10, weightKg: 100, rpe: 8 }],
      },
    });
    expect(workoutRes.statusCode).toBe(201);

    // 2) Raid attack increments raidPoints
    const raidSpawn = await app.inject({
      method: 'POST',
      url: '/api/social/raids/spawn',
      headers: { authorization: `Bearer ${hero.token}` },
      payload: {
        characterId: hero.char.id,
        gymClanId,
        bossName: 'Season Colossi',
        accessType: 'CLAN_ONLY',
        maxHp: 250_000,
      },
    });
    await app.inject({
      method: 'POST',
      url: `/api/social/raids/${raidSpawn.json().raid.id}/attack`,
      headers: { authorization: `Bearer ${hero.token}` },
      payload: { characterId: hero.char.id },
    });

    // 3) Arena spar increments arenaPoints
    await app.inject({
      method: 'POST',
      url: '/api/social/arena/spar',
      headers: { authorization: `Bearer ${hero.token}` },
      payload: {
        challengerCharacterId: hero.char.id,
        defenderCharacterId: 'arena_rival_iron_ronin',
      },
    });

    const seasonRes = await app.inject({
      method: 'GET',
      url: '/api/social/seasons/current',
    });
    expect(seasonRes.statusCode).toBe(200);
    const seasonStanding = seasonRes
      .json()
      .standings.find((s: any) => s.gymClanId === gymClanId);
    expect(seasonStanding.seasonKey).toBe(getCurrentSeasonKey());
    expect(seasonStanding.workoutsCount).toBe(1);
    expect(seasonStanding.workoutPoints).toBeGreaterThan(0);
    expect(seasonStanding.raidPoints).toBeGreaterThan(0);
    expect(seasonStanding.arenaPoints).toBeGreaterThan(0);
    expect(seasonStanding.totalSeasonPoints).toBe(
      seasonStanding.workoutPoints +
        seasonStanding.raidPoints +
        seasonStanding.arenaPoints
    );

    const leaderboardRes = await app.inject({
      method: 'GET',
      url: '/api/social/leaderboards?category=GYM_CLANS',
    });
    expect(leaderboardRes.statusCode).toBe(200);
    expect(leaderboardRes.json().entries.length).toBeGreaterThan(0);

    await app.close();
  });

  it('7. Runs Async Arena AI sparring via stepTurnBasedCombat, updates Elo & gold, persists ArenaMatch, and rejects unowned challenger (403)', async () => {
    const { db, store } = createSocialMockDb();
    const app = await buildServerApp({ db });
    const challenger = await seedUserAndHero(db, app, {
      username: 'gladiator',
      heroName: 'GladiatorZane',
      strengthLevel: 14,
    });
    const otherUser = await seedUserAndHero(db, app, {
      username: 'intruder',
      heroName: 'Intruder',
    });

    // Unowned challenger rejected -> 403
    const forbiddenSpar = await app.inject({
      method: 'POST',
      url: '/api/social/arena/spar',
      headers: { authorization: `Bearer ${otherUser.token}` },
      payload: {
        challengerCharacterId: challenger.char.id,
        defenderCharacterId: 'arena_rival_iron_ronin',
      },
    });
    expect(forbiddenSpar.statusCode).toBe(403);

    const sparRes = await app.inject({
      method: 'POST',
      url: '/api/social/arena/spar',
      headers: { authorization: `Bearer ${challenger.token}` },
      payload: {
        challengerCharacterId: challenger.char.id,
        defenderCharacterId: 'arena_rival_iron_ronin',
      },
    });
    expect(sparRes.statusCode).toBe(200);
    const sparJson = sparRes.json();

    expect(Array.isArray(sparJson.combatLog)).toBe(true);
    expect(sparJson.combatLog.length).toBeGreaterThan(0);
    expect(sparJson.simulation.challengerRatingDelta).not.toBe(0);
    expect(sparJson.simulation.goldAwarded).toBeGreaterThan(0);
    expect(sparJson.match.isNpcRival).toBe(true);
    expect(sparJson.match.defenderCharacterId).toBeNull();
    expect(store.arenaMatches).toHaveLength(1);

    const updatedChallenger = store.characters.get(challenger.char.id);
    expect(updatedChallenger.arenaRating).toBe(sparJson.simulation.nextChallengerRating);
    expect(updatedChallenger.gold).toBe(100 + sparJson.simulation.goldAwarded);

    await app.close();
  });
});
