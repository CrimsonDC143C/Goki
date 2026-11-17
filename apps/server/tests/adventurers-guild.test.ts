import { PrismaClient } from '@goki/database';
import {
  DEFAULT_GUILD_QUEST_CATALOG,
  TurnBasedCombatAction,
  TurnBasedCombatState,
  advanceTurnBasedUntilPlayerOrEnd,
  createTurnBasedEncounter,
  stepTurnBasedCombat,
} from '@goki/game-engine';
import { describe, expect, it } from 'vitest';
import { buildServerApp } from '../src/app';

function createAdventurersGuildMockDb(options?: {
  workoutsLogged?: number;
  initialGold?: number;
  initialRank?: 'COPPER' | 'IRON' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'MYTHIC';
  strengthLevel?: number;
  enduranceLevel?: number;
  agilityLevel?: number;
  unlockedSkillSlugs?: string[];
  initialConsumables?: Array<{ slug: string; name: string; quantity: number }>;
}) {
  const workoutsLogged = options?.workoutsLogged ?? 0;
  let idSeq = 1;
  const nextId = (prefix: string) => `${prefix}_${idSeq++}`;

  const characterState: any = {
    id: 'char_guild_1',
    userId: 'user_guild_1',
    name: 'GuildHero',
    appearanceId: 'oni_warlord',
    avatarSpriteId: 'oni_warlord',
    race: 'ONI',
    customizationConfig: null,
    deletedAt: null,
    gameMode: 'STANDARD',
    adventurerRank: options?.initialRank ?? 'COPPER',
    adventurerReputation: 0,
    gold: options?.initialGold ?? 100,
    overallLevel: 10,
    dexLevel: 6,
    conLevel: 7,
    wisLevel: 4,
    sprLevel: 4,
    activeSkillLoadout: [],
    beltLoadout: [null, null, null, null],
    stats: {
      characterId: 'char_guild_1',
      strengthLevel: options?.strengthLevel ?? 12,
      enduranceLevel: options?.enduranceLevel ?? 12,
      agilityLevel: options?.agilityLevel ?? 10,
    },
    fatigueState: null,
    equipmentLoadout: {
      mainHand: null,
      offHand: null,
      head: null,
      chest: null,
      legs: null,
      boots: null,
      accessory1: null,
      accessory2: null,
    },
    talentUnlocks: (options?.unlockedSkillSlugs ?? [
      'jug_shield_slam',
      'van_colossus_cleave',
      'war_second_wind_hymn',
      'out_evasive_maneuver',
    ]).map((slug, idx) => ({
      id: `unlock_${idx + 1}`,
      characterId: 'char_guild_1',
      currentRank: 1,
      talentNode: { id: `node_${idx + 1}`, slug },
    })),
  };

  const itemsBySlug = new Map<string, any>();
  const inventoryItems: any[] = [];

  for (const c of options?.initialConsumables ?? [
    { slug: 'sunleaf_healing_draught', name: 'Sunleaf Healing Draught', quantity: 2 },
  ]) {
    const item = {
      id: nextId('item'),
      slug: c.slug,
      name: c.name,
      description: c.name,
      itemType: 'CONSUMABLE',
      rarity: 'COMMON',
      stackable: true,
      statBonuses: {},
    };
    itemsBySlug.set(c.slug, item);
    inventoryItems.push({
      id: nextId('inv'),
      characterId: characterState.id,
      itemId: item.id,
      quantity: c.quantity,
      item,
      itemMetadata: null,
    });
  }

  const guildQuestsBySlug = new Map<string, any>();
  const guildQuestRuns: any[] = [];

  const mockDungeons = [
    {
      id: 'dng_1',
      slug: 'sunken_crypt',
      name: 'Sunken Crypt (24h)',
      description: '24-hour passive dungeon expedition.',
      recommendedPower: 80,
      durationHours: 24,
      minPlayers: 1,
      maxPlayers: 5,
      roomsConfig: [],
    },
  ];

  const attachCharacterRelations = () => ({
    ...characterState,
    inventoryItems: inventoryItems.map((i) => ({ ...i })),
    _count: { workoutLogs: workoutsLogged },
  });

  const db: any = {
    $transaction: async (cb: (tx: any) => Promise<any>) => cb(db),
    character: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id !== characterState.id) return null;
        return attachCharacterRelations();
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
        if (where.id !== characterState.id) throw new Error('Character not found');
        for (const [key, val] of Object.entries(data)) {
          if (val && typeof val === 'object' && 'increment' in val) {
            characterState[key] = (characterState[key] ?? 0) + Number(val.increment);
          } else {
            characterState[key] = val;
          }
        }
        return attachCharacterRelations();
      },
    },
    workoutLog: {
      count: async () => workoutsLogged,
    },
    dungeon: {
      findMany: async () => mockDungeons,
    },
    dungeonRun: {
      findMany: async () => [],
    },
    item: {
      findUnique: async ({ where }: { where: { slug?: string; id?: string } }) => {
        if (where.slug) return itemsBySlug.get(where.slug) ?? null;
        for (const it of itemsBySlug.values()) {
          if (it.id === where.id) return it;
        }
        return null;
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const created = { id: nextId('item'), ...data };
        itemsBySlug.set(created.slug, created);
        return created;
      },
    },
    inventoryItem: {
      findFirst: async ({ where }: { where: { characterId: string; itemId: string } }) => {
        return (
          inventoryItems.find(
            (i) => i.characterId === where.characterId && i.itemId === where.itemId
          ) ?? null
        );
      },
      findMany: async ({ where }: { where: { characterId: string } }) => {
        return inventoryItems.filter((i) => i.characterId === where.characterId);
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        let item: any = null;
        for (const it of itemsBySlug.values()) {
          if (it.id === data.itemId) {
            item = it;
            break;
          }
        }
        const created = { id: nextId('inv'), ...data, item };
        inventoryItems.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
        const found = inventoryItems.find((i) => i.id === where.id);
        if (!found) throw new Error('InventoryItem not found');
        Object.assign(found, data);
        return found;
      },
    },
    guildQuest: {
      findMany: async () => Array.from(guildQuestsBySlug.values()),
      findFirst: async ({ where }: { where: { OR?: Array<{ id?: string; slug?: string }> } }) => {
        for (const cond of where.OR ?? []) {
          for (const q of guildQuestsBySlug.values()) {
            if ((cond.id && q.id === cond.id) || (cond.slug && q.slug === cond.slug)) {
              return q;
            }
          }
        }
        return null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { slug: string };
        create: Record<string, any>;
        update: Record<string, any>;
      }) => {
        const existing = guildQuestsBySlug.get(where.slug);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { id: nextId('gq'), ...create };
        guildQuestsBySlug.set(where.slug, created);
        return created;
      },
    },
    guildQuestRun: {
      findFirst: async ({ where }: { where: { OR?: Array<{ id?: string; clientRunId?: string }> } }) => {
        const found = guildQuestRuns.find((r) =>
          (where.OR ?? []).some(
            (cond) => (cond.id && r.id === cond.id) || (cond.clientRunId && r.clientRunId === cond.clientRunId)
          )
        );
        if (!found) return null;
        const quest = Array.from(guildQuestsBySlug.values()).find((q) => q.id === found.questId) ?? null;
        return { ...found, quest };
      },
      findUnique: async ({ where }: { where: { id?: string; clientRunId?: string } }) => {
        const found = guildQuestRuns.find(
          (r) =>
            (where.id && r.id === where.id) ||
            (where.clientRunId && r.clientRunId === where.clientRunId)
        );
        if (!found) return null;
        const quest = Array.from(guildQuestsBySlug.values()).find((q) => q.id === found.questId) ?? null;
        return { ...found, quest };
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const created = {
          id: nextId('gqr'),
          startedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        guildQuestRuns.push(created);
        const quest = Array.from(guildQuestsBySlug.values()).find((q) => q.id === created.questId) ?? null;
        return { ...created, quest };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
        const found = guildQuestRuns.find((r) => r.id === where.id);
        if (!found) throw new Error('GuildQuestRun not found');
        Object.assign(found, data, { updatedAt: new Date() });
        const quest = Array.from(guildQuestsBySlug.values()).find((q) => q.id === found.questId) ?? null;
        return { ...found, quest };
      },
    },
  };

  return {
    db: db as unknown as PrismaClient,
    characterState,
    inventoryItems,
    guildQuestRuns,
  };
}

function playOfflineVictoryActions(params: {
  questSlug: string;
  seed: string;
  clientRunId: string;
  characterState: any;
  beltSlots?: Array<{ itemSlug: string | null; charges: number }>;
}): TurnBasedCombatAction[] {
  const quest = DEFAULT_GUILD_QUEST_CATALOG.find((q) => q.questSlug === params.questSlug)!;
  const unlockedTalentRanks: Record<string, number> = {};
  for (const u of params.characterState.talentUnlocks ?? []) {
    if (u.talentNode?.slug) unlockedTalentRanks[u.talentNode.slug] = u.currentRank ?? 1;
  }
  let state: TurnBasedCombatState = createTurnBasedEncounter({
    encounterId: params.clientRunId,
    questSlug: quest.questSlug,
    questTitle: quest.title,
    party: [
      {
        characterId: params.characterState.id,
        name: params.characterState.name,
        controller: 'PLAYER',
        ownerUserId: params.characterState.userId,
        race: params.characterState.race,
        appearanceId: params.characterState.appearanceId,
        coreStats: {
          strengthLevel: params.characterState.stats.strengthLevel,
          enduranceLevel: params.characterState.stats.enduranceLevel,
          agilityLevel: params.characterState.stats.agilityLevel,
          dexLevel: params.characterState.dexLevel,
          conLevel: params.characterState.conLevel,
          wisLevel: params.characterState.wisLevel,
          sprLevel: params.characterState.sprLevel,
        },
        unlockedTalentRanks,
        activeSkillIds: params.characterState.activeSkillLoadout,
        beltSlots: params.beltSlots ?? [
          { itemSlug: null, charges: 0 },
          { itemSlug: null, charges: 0 },
          { itemSlug: null, charges: 0 },
          { itemSlug: null, charges: 0 },
        ],
      },
    ],
    waves: quest.waves,
    seed: params.seed,
  });

  const actions: TurnBasedCombatAction[] = [];
  for (let guard = 0; guard < 120 && state.status === 'IN_PROGRESS'; guard++) {
    if (state.phase === 'AWAITING_AI_TURN') {
      const aiRes = advanceTurnBasedUntilPlayerOrEnd(state);
      expect(aiRes.valid).toBe(true);
      const addedCount = aiRes.state.actionLog.length - state.actionLog.length;
      for (let i = state.actionLog.length; i < state.actionLog.length + addedCount; i++) {
        actions.push(aiRes.state.actionLog[i]!);
      }
      state = aiRes.state;
      continue;
    }

    const livingEnemies = state.units.filter((u) => u.side === 'ENEMY' && u.alive);
    const targetId = livingEnemies[0]?.unitId;
    const action: TurnBasedCombatAction = { type: 'BASIC_ATTACK', targetId };
    const stepRes = stepTurnBasedCombat(state, action);
    expect(stepRes.valid).toBe(true);
    actions.push(action);
    state = stepRes.state;
  }

  expect(state.status).toBe('VICTORY');
  return actions;
}

describe('@goki/server Combat Loadout & Adventurer Guild API', () => {
  it('PUT /api/characters/:id/combat-loadout persists valid unlocked skills & belt consumables and rejects >4 skills, locked skills, and gear slugs', async () => {
    const { db, characterState } = createAdventurersGuildMockDb({
      unlockedSkillSlugs: [
        'jug_shield_slam',
        'van_colossus_cleave',
        'war_second_wind_hymn',
        'out_evasive_maneuver',
      ],
    });
    const app = await buildServerApp({ db });
    const token = app.jwt.sign({
      userId: 'user_guild_1',
      email: 'hero@gokirpg.com',
      username: 'hero',
    });

    const okRes = await app.inject({
      method: 'PUT',
      url: '/api/characters/char_guild_1/combat-loadout',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        activeSkillIds: [
          'jug_shield_slam',
          'van_colossus_cleave',
          'war_second_wind_hymn',
          'out_evasive_maneuver',
        ],
        beltConsumables: ['sunleaf_healing_draught', 'vitality_elixir', null, null],
      },
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json().activeSkillLoadout).toHaveLength(4);
    expect(okRes.json().beltLoadout).toEqual([
      'sunleaf_healing_draught',
      'vitality_elixir',
      null,
      null,
    ]);
    expect(characterState.activeSkillLoadout).toHaveLength(4);

    // Reject > 4 skills
    const tooManySkills = await app.inject({
      method: 'PUT',
      url: '/api/characters/char_guild_1/combat-loadout',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        activeSkillIds: [
          'jug_shield_slam',
          'van_colossus_cleave',
          'war_second_wind_hymn',
          'out_evasive_maneuver',
          'ber_frenzied_flurry',
        ],
        beltConsumables: [],
      },
    });
    expect(tooManySkills.statusCode).toBe(400);

    // Reject locked skill ID
    const lockedSkill = await app.inject({
      method: 'PUT',
      url: '/api/characters/char_guild_1/combat-loadout',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        activeSkillIds: ['ber_frenzied_flurry'],
        beltConsumables: ['sunleaf_healing_draught'],
      },
    });
    expect(lockedSkill.statusCode).toBe(400);

    // Reject gear slug in belt slots
    const gearInBelt = await app.inject({
      method: 'PUT',
      url: '/api/characters/char_guild_1/combat-loadout',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        activeSkillIds: ['jug_shield_slam'],
        beltConsumables: ['iron_broadsword'],
      },
    });
    expect(gearInBelt.statusCode).toBe(400);

    await app.close();
  });

  it('GET /api/adventurers-guild/quests separates liveQuests & rankUpTrials while /api/dungeons continues serving 24h expeditions', async () => {
    const { db } = createAdventurersGuildMockDb();
    const app = await buildServerApp({ db });

    const guildRes = await app.inject({
      method: 'GET',
      url: '/api/adventurers-guild/quests',
    });
    expect(guildRes.statusCode).toBe(200);
    const guildJson = guildRes.json();
    expect(guildJson.liveQuests.length).toBeGreaterThan(0);
    expect(guildJson.rankUpTrials.length).toBeGreaterThan(0);
    expect(guildJson.liveQuests.every((q: any) => q.category === 'LIVE_QUEST')).toBe(true);
    expect(guildJson.rankUpTrials.every((q: any) => q.category === 'RANK_UP_TRIAL')).toBe(true);

    const dungeonRes = await app.inject({
      method: 'GET',
      url: '/api/dungeons',
    });
    expect(dungeonRes.statusCode).toBe(200);
    expect(dungeonRes.json().dungeons).toHaveLength(1);
    expect(dungeonRes.json().dungeons[0].durationHours).toBe(24);

    await app.close();
  });

  it('Online quest lifecycle (start -> step -> complete) executes deterministically to VICTORY, grants rewards, and rejects duplicate complete with 409', async () => {
    const { db, characterState } = createAdventurersGuildMockDb({
      initialGold: 100,
      strengthLevel: 18,
      enduranceLevel: 16,
      agilityLevel: 14,
    });
    const app = await buildServerApp({ db });
    const token = app.jwt.sign({
      userId: 'user_guild_1',
      email: 'hero@gokirpg.com',
      username: 'hero',
    });

    const startRes = await app.inject({
      method: 'POST',
      url: '/api/adventurers-guild/quests/guild_contract_crypt_patrol/start',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_guild_1',
        companionIds: ['ally_torin'],
        clientSeed: 'test-online-seed-1',
      },
    });
    expect(startRes.statusCode).toBe(201);
    const startBody = startRes.json();
    const runId = startBody.run.id;
    let state: TurnBasedCombatState = startBody.encounterState;

    for (let i = 0; i < 80 && state.status === 'IN_PROGRESS'; i++) {
      if (state.phase === 'AWAITING_AI_TURN') {
        const aiStep = await app.inject({
          method: 'POST',
          url: `/api/adventurers-guild/runs/${runId}/step`,
          headers: { authorization: `Bearer ${token}` },
          payload: { action: { type: 'AUTO_AI_TURN' }, autoAdvanceAi: true },
        });
        expect(aiStep.statusCode).toBe(200);
        state = aiStep.json().encounterState;
        continue;
      }

      const livingEnemy = state.units.find((u) => u.side === 'ENEMY' && u.alive);
      const stepRes = await app.inject({
        method: 'POST',
        url: `/api/adventurers-guild/runs/${runId}/step`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          action: { type: 'BASIC_ATTACK', targetId: livingEnemy?.unitId },
          autoAdvanceAi: true,
        },
      });
      expect(stepRes.statusCode).toBe(200);
      state = stepRes.json().encounterState;
    }

    expect(state.status).toBe('VICTORY');

    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/adventurers-guild/runs/${runId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(completeRes.statusCode).toBe(200);
    const completeJson = completeRes.json();
    expect(completeJson.outcome).toBe('VICTORY');
    expect(completeJson.rewards.gold).toBe(95);
    expect(completeJson.rewards.reputation).toBe(45);
    expect(completeJson.rewards.lootDrops.length).toBeGreaterThan(0);
    expect(characterState.gold).toBe(195);
    expect(characterState.adventurerReputation).toBe(45);

    const dupComplete = await app.inject({
      method: 'POST',
      url: `/api/adventurers-guild/runs/${runId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(dupComplete.statusCode).toBe(409);

    await app.close();
  });

  it('Rank-Up Trial (rank_trial_copper_to_iron) enforces workoutsLogged >= 1 and promotes COPPER -> IRON on completion', async () => {
    // 1. Blocked with 0 workouts
    const blockedSetup = createAdventurersGuildMockDb({ workoutsLogged: 0 });
    const appBlocked = await buildServerApp({ db: blockedSetup.db });
    const tokenBlocked = appBlocked.jwt.sign({
      userId: 'user_guild_1',
      email: 'hero@gokirpg.com',
      username: 'hero',
    });

    const deniedStart = await appBlocked.inject({
      method: 'POST',
      url: '/api/adventurers-guild/quests/rank_trial_copper_to_iron/start',
      headers: { authorization: `Bearer ${tokenBlocked}` },
      payload: { characterId: 'char_guild_1' },
    });
    expect(deniedStart.statusCode).toBe(400);
    await appBlocked.close();

    // 2. Allowed with >= 1 workout and promotes COPPER -> IRON
    const readySetup = createAdventurersGuildMockDb({
      workoutsLogged: 1,
      strengthLevel: 20,
      enduranceLevel: 18,
      agilityLevel: 15,
    });
    const appReady = await buildServerApp({ db: readySetup.db });
    const tokenReady = appReady.jwt.sign({
      userId: 'user_guild_1',
      email: 'hero@gokirpg.com',
      username: 'hero',
    });

    const startRes = await appReady.inject({
      method: 'POST',
      url: '/api/adventurers-guild/quests/rank_trial_copper_to_iron/start',
      headers: { authorization: `Bearer ${tokenReady}` },
      payload: {
        characterId: 'char_guild_1',
        companionIds: ['ally_lyra', 'ally_torin'],
        clientSeed: 'trial-seed-1',
      },
    });
    expect(startRes.statusCode).toBe(201);
    const runId = startRes.json().run.id;
    let state: TurnBasedCombatState = startRes.json().encounterState;

    for (let i = 0; i < 100 && state.status === 'IN_PROGRESS'; i++) {
      if (state.phase === 'AWAITING_AI_TURN') {
        const aiStep = await appReady.inject({
          method: 'POST',
          url: `/api/adventurers-guild/runs/${runId}/step`,
          headers: { authorization: `Bearer ${tokenReady}` },
          payload: { action: { type: 'AUTO_AI_TURN' }, autoAdvanceAi: true },
        });
        expect(aiStep.statusCode).toBe(200);
        state = aiStep.json().encounterState;
        continue;
      }

      const livingEnemy = state.units.find((u) => u.side === 'ENEMY' && u.alive);
      const stepRes = await appReady.inject({
        method: 'POST',
        url: `/api/adventurers-guild/runs/${runId}/step`,
        headers: { authorization: `Bearer ${tokenReady}` },
        payload: {
          action: { type: 'BASIC_ATTACK', targetId: livingEnemy?.unitId },
          autoAdvanceAi: true,
        },
      });
      expect(stepRes.statusCode).toBe(200);
      state = stepRes.json().encounterState;
    }

    expect(state.status).toBe('VICTORY');

    const completeRes = await appReady.inject({
      method: 'POST',
      url: `/api/adventurers-guild/runs/${runId}/complete`,
      headers: { authorization: `Bearer ${tokenReady}` },
      payload: {},
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().rewards.rankPromotedTo).toBe('IRON');
    expect(readySetup.characterState.adventurerRank).toBe('IRON');

    await appReady.close();
  });

  it('POST /api/adventurers-guild/sync-offline verifies valid replay, deduplicates repeated clientRunId, and rejects tampered/incomplete logs', async () => {
    const { db, characterState } = createAdventurersGuildMockDb({
      workoutsLogged: 1,
      initialGold: 100,
      strengthLevel: 18,
      enduranceLevel: 16,
      agilityLevel: 14,
      initialConsumables: [],
    });
    const app = await buildServerApp({ db });
    const token = app.jwt.sign({
      userId: 'user_guild_1',
      email: 'hero@gokirpg.com',
      username: 'hero',
    });

    const validActions = playOfflineVictoryActions({
      questSlug: 'guild_contract_crypt_patrol',
      seed: 'offline-seed-valid-1',
      clientRunId: 'offline_run_1',
      characterState,
      beltSlots: [
        { itemSlug: 'sunleaf_healing_draught', charges: 2 },
        { itemSlug: 'vitality_elixir', charges: 1 },
        { itemSlug: null, charges: 0 },
        { itemSlug: null, charges: 0 },
      ],
    });

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/adventurers-guild/sync-offline',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_guild_1',
        completedRuns: [
          {
            clientRunId: 'offline_run_1',
            questSlug: 'guild_contract_crypt_patrol',
            randomSeed: 'offline-seed-valid-1',
            companionIds: [],
            actions: validActions,
            beltSnapshot: [
              { itemSlug: 'sunleaf_healing_draught', charges: 2 },
              { itemSlug: 'vitality_elixir', charges: 1 },
              { itemSlug: null, charges: 0 },
              { itemSlug: null, charges: 0 },
            ],
          },
          {
            clientRunId: 'offline_run_tampered',
            questSlug: 'guild_contract_crypt_patrol',
            randomSeed: 'offline-seed-tampered',
            companionIds: [],
            actions: [{ type: 'BASIC_ATTACK' }], // incomplete log
          },
        ],
      },
    });

    expect(syncRes.statusCode).toBe(200);
    const syncJson = syncRes.json();
    expect(syncJson.syncedRuns).toHaveLength(2);
    expect(syncJson.syncedRuns[0].synced).toBe(true);
    expect(syncJson.syncedRuns[0].alreadySynced).toBe(false);
    expect(syncJson.syncedRuns[0].status).toBe('VICTORY');
    expect(syncJson.syncedRuns[0].rewards.gold).toBe(95);
    expect(syncJson.syncedRuns[1].synced).toBe(false);
    expect(characterState.gold).toBe(195);

    // Repeat the same clientRunId -> idempotent (no double gold)
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/adventurers-guild/sync-offline',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        characterId: 'char_guild_1',
        completedRuns: [
          {
            clientRunId: 'offline_run_1',
            questSlug: 'guild_contract_crypt_patrol',
            randomSeed: 'offline-seed-valid-1',
            companionIds: [],
            actions: validActions,
          },
        ],
      },
    });

    expect(dupRes.statusCode).toBe(200);
    expect(dupRes.json().syncedRuns[0].alreadySynced).toBe(true);
    expect(characterState.gold).toBe(195);

    await app.close();
  });
});
