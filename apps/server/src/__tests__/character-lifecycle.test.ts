import { PrismaClient } from '@goki/database';
import { createDefaultCustomizationConfig } from '@goki/game-engine';
import { describe, expect, it } from 'vitest';
import { buildServerApp } from '../app';
import { SOFT_DELETE_RETENTION_MS } from '../routes/characters';

describe('Character Lifecycle & Restoration API', () => {
  function createTestDb() {
    const memoryCharacters: any[] = [];
    const memoryTalentTrees: any[] = [];
    const memoryTalentNodes: any[] = [];
    const memoryTalentUnlocks: any[] = [];
    const testUser = {
      id: 'user_hero_123',
      email: 'warlord@gokirpg.com',
      username: 'warlord',
    };

    const mockDb = {
      user: {
        findUnique: async ({ where }: any) => {
          if (where.id === testUser.id || where.email === testUser.email) return testUser;
          return null;
        },
      },
      character: {
        findMany: async ({ where }: any) => {
          if (where?.userId) {
            return memoryCharacters.filter((c) => c.userId === where.userId);
          }
          return memoryCharacters;
        },
        findUnique: async ({ where }: any) => {
          let char: any = null;
          if (where?.id) {
            char = memoryCharacters.find((c) => c.id === where.id) ?? null;
          } else if (where?.name) {
            char = memoryCharacters.find((c) => c.name.toLowerCase() === where.name.toLowerCase()) ?? null;
          }
          if (!char) return null;
          const unlocks = memoryTalentUnlocks
            .filter((u) => u.characterId === char.id)
            .map((u) => {
              const node = memoryTalentNodes.find((n) => n.id === u.talentNodeId);
              return {
                ...u,
                talentNode: node,
              };
            });
          return {
            ...char,
            talentUnlocks: unlocks,
          };
        },
        findFirst: async ({ where }: any) => {
          return (
            memoryCharacters.find((c) => {
              const targetName =
                typeof where?.name === 'string'
                  ? where.name
                  : typeof where?.name?.equals === 'string'
                    ? where.name.equals
                    : null;
              if (targetName && c.name.toLowerCase() !== targetName.toLowerCase()) return false;
              if (where?.deletedAt === null && c.deletedAt !== null && c.deletedAt !== undefined) return false;
              if (where?.NOT?.deletedAt === null && (c.deletedAt === null || c.deletedAt === undefined)) return false;
              if (where?.id?.not && c.id === where.id.not) return false;
              if (where?.userId && c.userId !== where.userId) return false;
              return true;
            }) ?? null
          );
        },
        create: async ({ data }: any) => {
          const char = {
            id: `char_${memoryCharacters.length + 1}`,
            userId: data.userId,
            name: data.name,
            gameMode: data.gameMode,
            appearanceId: data.appearanceId ?? 'oni_warlord',
            avatarSpriteId: data.avatarSpriteId ?? 'oni_warlord',
            race: data.race ?? 'HUMAN',
            customizationConfig: data.customizationConfig ?? null,
            dexLevel: data.dexLevel ?? 1,
            conLevel: data.conLevel ?? 1,
            wisLevel: data.wisLevel ?? 1,
            sprLevel: data.sprLevel ?? 1,
            deletedAt: null,
            stats: { strengthLevel: 1, enduranceLevel: 1, agilityLevel: 1 },
            fatigueState: { isRestingInTavern: true },
            equipmentLoadout: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          memoryCharacters.push(char);
          return char;
        },
        update: async ({ where, data }: any) => {
          const char = memoryCharacters.find((c) => c.id === where.id);
          if (!char) throw new Error('Character not found');
          Object.assign(char, data, { updatedAt: new Date() });
          return char;
        },
        delete: async ({ where }: any) => {
          const idx = memoryCharacters.findIndex((c) => c.id === where.id);
          if (idx !== -1) {
            const [deleted] = memoryCharacters.splice(idx, 1);
            return deleted;
          }
          throw new Error('Character not found');
        },
        deleteMany: async ({ where }: any) => {
          let count = 0;
          for (let i = memoryCharacters.length - 1; i >= 0; i--) {
            const c = memoryCharacters[i];
            if (where?.userId && c.userId !== where.userId) continue;
            if (where?.deletedAt?.lt && c.deletedAt && new Date(c.deletedAt) < where.deletedAt.lt) {
              memoryCharacters.splice(i, 1);
              count++;
            }
          }
          return { count };
        },
      },
      talentNode: {
        findUnique: async ({ where }: any) => {
          return memoryTalentNodes.find((n) => n.slug === where?.slug || n.id === where?.id) ?? null;
        },
        create: async ({ data }: any) => {
          const node = { id: `tn_${memoryTalentNodes.length + 1}`, ...data };
          memoryTalentNodes.push(node);
          return node;
        },
      },
      talentTree: {
        upsert: async ({ where, create, update }: any) => {
          let tree = memoryTalentTrees.find((t) => t.slug === where?.slug);
          if (!tree) {
            tree = { id: `tt_${memoryTalentTrees.length + 1}`, ...create };
            memoryTalentTrees.push(tree);
          } else if (update) {
            Object.assign(tree, update);
          }
          return tree;
        },
      },
      characterTalentUnlock: {
        upsert: async ({ where, create, update }: any) => {
          const charId = where?.characterId_talentNodeId?.characterId;
          const nodeId = where?.characterId_talentNodeId?.talentNodeId;
          let unlock = memoryTalentUnlocks.find(
            (u) => u.characterId === charId && u.talentNodeId === nodeId
          );
          if (!unlock) {
            unlock = {
              id: `ctu_${memoryTalentUnlocks.length + 1}`,
              characterId: create.characterId,
              talentNodeId: create.talentNodeId,
              currentRank: create.currentRank,
              pointsSpent: create.pointsSpent,
            };
            memoryTalentUnlocks.push(unlock);
          } else {
            if (update?.currentRank !== undefined) {
              unlock.currentRank = update.currentRank;
            }
            if (update?.pointsSpent?.increment) {
              unlock.pointsSpent = (unlock.pointsSpent ?? 0) + update.pointsSpent.increment;
            }
          }
          return unlock;
        },
      },
      characterStats: {
        update: async ({ where, data }: any) => {
          const char = memoryCharacters.find((c) => c.id === where.characterId);
          if (!char) throw new Error('Character not found');
          if (!char.stats) char.stats = {};
          if (data.strengthTalentPointsAvailable?.decrement) {
            char.stats.strengthTalentPointsAvailable =
              (char.stats.strengthTalentPointsAvailable ?? 0) - data.strengthTalentPointsAvailable.decrement;
          }
          if (data.enduranceTalentPointsAvailable?.decrement) {
            char.stats.enduranceTalentPointsAvailable =
              (char.stats.enduranceTalentPointsAvailable ?? 0) - data.enduranceTalentPointsAvailable.decrement;
          }
          if (data.agilityTalentPointsAvailable?.decrement) {
            char.stats.agilityTalentPointsAvailable =
              (char.stats.agilityTalentPointsAvailable ?? 0) - data.agilityTalentPointsAvailable.decrement;
          }
          return char.stats;
        },
      },
    } as unknown as PrismaClient;

    return { mockDb, testUser, memoryCharacters, memoryTalentUnlocks, memoryTalentNodes };
  }

  it('creates character with custom appearanceId decoupled from archetypes', async () => {
    const { mockDb, testUser } = createTestDb();
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({ userId: testUser.id, email: testUser.email, username: testUser.username });

    const res = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Kensei Shogun',
        gameMode: 'STANDARD',
        appearanceId: 'blade_dancer',
      },
    });

    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.character.appearanceId).toBe('blade_dancer');
    expect(data.character.avatarSpriteId).toBe('blade_dancer');
    expect(data.character.deletedAt).toBeNull();
  });

  it('updates character appearance and name via PATCH /api/characters/:characterId', async () => {
    const { mockDb, testUser, memoryCharacters } = createTestDb();
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({ userId: testUser.id, email: testUser.email, username: testUser.username });

    memoryCharacters.push({
      id: 'char_patch_1',
      userId: testUser.id,
      name: 'Original Hero',
      gameMode: 'STANDARD',
      appearanceId: 'oni_warlord',
      avatarSpriteId: 'oni_warlord',
      deletedAt: null,
      stats: {},
      fatigueState: {},
      equipmentLoadout: {},
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/characters/char_patch_1',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Sun Disciple Renamed',
        appearanceId: 'solar_mystic',
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.character.name).toBe('Sun Disciple Renamed');
    expect(data.character.appearanceId).toBe('solar_mystic');
    expect(data.character.avatarSpriteId).toBe('solar_mystic');
  });

  it('soft-deletes character, frees gameMode slot, and allows immediate recreation', async () => {
    const { mockDb, testUser, memoryCharacters } = createTestDb();
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({ userId: testUser.id, email: testUser.email, username: testUser.username });

    const char1 = {
      id: 'char_soft_1',
      userId: testUser.id,
      name: 'Fallen Paladin',
      gameMode: 'STANDARD',
      appearanceId: 'oath_sentinel',
      avatarSpriteId: 'oath_sentinel',
      deletedAt: null,
      stats: {},
      fatigueState: {},
      equipmentLoadout: {},
    };
    memoryCharacters.push(char1);

    // Soft delete char1
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/api/characters/char_soft_1',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(delRes.statusCode).toBe(200);
    const delData = delRes.json();
    expect(delData.character.deletedAt).toBeTruthy();
    expect(delData.daysRemaining).toBe(30);

    // Verify GET /api/characters returns 0 active and 1 deleted
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.statusCode).toBe(200);
    const getData = getRes.json();
    expect(getData.activeCharacters.length).toBe(0);
    expect(getData.deletedCharacters.length).toBe(1);
    expect(getData.deletedCharacters[0].id).toBe('char_soft_1');
    expect(getData.deletedCharacters[0].daysRemaining).toBe(30);

    // Immediately create a NEW Standard hero in that now-free slot
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'New Dawn Warlord',
        gameMode: 'STANDARD',
        appearanceId: 'oni_warlord',
      },
    });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.json().character.name).toBe('New Dawn Warlord');
  });

  it('restoring soft-deleted character returns 409 if active hero occupies that gameMode slot', async () => {
    const { mockDb, testUser, memoryCharacters } = createTestDb();
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({ userId: testUser.id, email: testUser.email, username: testUser.username });

    const fallenChar = {
      id: 'char_fallen_old',
      userId: testUser.id,
      name: 'Old Standard Hero',
      gameMode: 'STANDARD',
      appearanceId: 'bastion_ironclad',
      deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      stats: {},
      fatigueState: {},
      equipmentLoadout: {},
    };
    const activeChar = {
      id: 'char_active_new',
      userId: testUser.id,
      name: 'Current Active Hero',
      gameMode: 'STANDARD',
      appearanceId: 'dusk_shinobi',
      deletedAt: null,
      stats: {},
      fatigueState: {},
      equipmentLoadout: {},
    };
    memoryCharacters.push(fallenChar, activeChar);

    // Attempting to restore fallenChar should fail with 409 Conflict because activeChar is in STANDARD mode
    const restoreConflictRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_fallen_old/restore',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(restoreConflictRes.statusCode).toBe(409);
    expect(restoreConflictRes.json().error).toContain('already have an active hero in this mode slot');

    // Archive / soft-delete the current active hero
    await app.inject({
      method: 'DELETE',
      url: '/api/characters/char_active_new',
      headers: { authorization: `Bearer ${token}` },
    });

    // Now restoration succeeds!
    const restoreSuccessRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_fallen_old/restore',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(restoreSuccessRes.statusCode).toBe(200);
    expect(restoreSuccessRes.json().character.deletedAt).toBeNull();
  });

  it('rejects restoring expired soft-deleted characters (> 30 days old)', async () => {
    const { mockDb, testUser, memoryCharacters } = createTestDb();
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({ userId: testUser.id, email: testUser.email, username: testUser.username });

    const expiredChar = {
      id: 'char_ancient_31d',
      userId: testUser.id,
      name: 'Ancient Fallen Hero',
      gameMode: 'STANDARD',
      appearanceId: 'astral_arcanist',
      deletedAt: new Date(Date.now() - (SOFT_DELETE_RETENTION_MS + 1000 * 60 * 60)), // 30 days + 1 hour ago
      stats: {},
      fatigueState: {},
      equipmentLoadout: {},
    };
    memoryCharacters.push(expiredChar);

    const restoreRes = await app.inject({
      method: 'POST',
      url: '/api/characters/char_ancient_31d/restore',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(restoreRes.statusCode).toBe(410);
    expect(restoreRes.json().error).toContain('expired');
  });

  it('supports permanent character deletion with ?permanent=true', async () => {
    const { mockDb, testUser, memoryCharacters } = createTestDb();
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({ userId: testUser.id, email: testUser.email, username: testUser.username });

    const char = {
      id: 'char_perm_del',
      userId: testUser.id,
      name: 'Hero to Erase',
      gameMode: 'STANDARD',
      appearanceId: 'wayfarer',
      deletedAt: null,
      stats: {},
      fatigueState: {},
      equipmentLoadout: {},
    };
    memoryCharacters.push(char);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/characters/char_perm_del?permanent=true',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().permanent).toBe(true);
    expect(memoryCharacters.find((c) => c.id === 'char_perm_del')).toBeUndefined();
  });

  it('deducts spent points for secondary stat talent unlocks across subsequent calls and persists unlock records', async () => {
    const { mockDb, testUser, memoryCharacters, memoryTalentUnlocks } = createTestDb();
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({ userId: testUser.id, email: testUser.email, username: testUser.username });

    // Create a hero with dexLevel: 3 (giving 3 - 1 = 2 talent points for DEXTERITY; Level 1 stats have 0 unearned points)
    const char = {
      id: 'char_dex_rogue',
      userId: testUser.id,
      name: 'Shadow Strider',
      gameMode: 'STANDARD',
      appearanceId: 'shadow_dancer',
      deletedAt: null,
      dexLevel: 3,
      conLevel: 1,
      wisLevel: 1,
      sprLevel: 1,
      stats: {
        strengthLevel: 1,
        enduranceLevel: 1,
        agilityLevel: 1,
        strengthTalentPointsAvailable: 0,
        enduranceTalentPointsAvailable: 0,
        agilityTalentPointsAvailable: 0,
      },
      fatigueState: {},
      equipmentLoadout: {},
    };
    memoryCharacters.push(char);

    // Verify Level-1 CON/WIS/SPR have 0 available talent points (rejected with 400)
    const conRes = await app.inject({
      method: 'POST',
      url: `/api/characters/${char.id}/talents/unlock`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nodeSlug: 'grd_iron_fortitude' },
    });
    expect(conRes.statusCode).toBe(400);
    expect(conRes.json().error).toMatch(/points/i);

    // 1st unlock: Acrobat Tier 1 node 'acro_feather_step' (costs 1 point) -> Should succeed (newRank: 1)
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/characters/${char.id}/talents/unlock`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nodeSlug: 'acro_feather_step' },
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().newRank).toBe(1);
    expect(res1.json().governingStat).toBe('DEXTERITY');
    expect(memoryTalentUnlocks.length).toBe(1);
    expect(memoryTalentUnlocks[0].currentRank).toBe(1);
    expect(memoryTalentUnlocks[0].pointsSpent).toBe(1);

    // 2nd unlock: Another rank in 'acro_feather_step' (costs 1 point) -> Should succeed (newRank: 2)
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/characters/${char.id}/talents/unlock`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nodeSlug: 'acro_feather_step' },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().newRank).toBe(2);
    expect(memoryTalentUnlocks[0].currentRank).toBe(2);
    expect(memoryTalentUnlocks[0].pointsSpent).toBe(2);

    // 3rd unlock: Total spent is now 2, dexLevel is 3 (2 points earned above Lv.1), so available DEXTERITY points is 0 -> Should fail with 400!
    const res3 = await app.inject({
      method: 'POST',
      url: `/api/characters/${char.id}/talents/unlock`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nodeSlug: 'acro_fluid_movement' },
    });
    expect(res3.statusCode).toBe(400);
    expect(res3.json().error).toMatch(/points/i);
  });

  it('POST /api/characters initializes unmuscled Level-1 HUMAN, ONI, and KITSUNE heroes and rejects locked morph tiers at Lv 1', async () => {
    const { mockDb, testUser, memoryCharacters } = createTestDb();
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({ userId: testUser.id, email: testUser.email, username: testUser.username });

    // 1. Default HUMAN hero (no race / no appearanceId) -> unmuscled Lv 1 config
    const humanRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Starter Human', gameMode: 'STANDARD' },
    });
    expect(humanRes.statusCode).toBe(201);
    const humanChar = humanRes.json().character;
    expect(humanChar.race).toBe('HUMAN');
    expect(humanChar.customizationConfig.morphs.muscleMassTier).toBe(0);
    expect(humanChar.customizationConfig.morphs.oniHornTier).toBe(0);
    expect(humanChar.customizationConfig.morphs.kitsuneTailCount).toBe(0);

    // 2. ONI hero -> unmuscled Lv 1 config with oniHornTier: 0
    const oniRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Starter Oni', gameMode: 'IRONMAN_VERIFIED', race: 'ONI' },
    });
    expect(oniRes.statusCode).toBe(201);
    const oniChar = oniRes.json().character;
    expect(oniChar.race).toBe('ONI');
    expect(oniChar.customizationConfig.morphs.muscleMassTier).toBe(0);
    expect(oniChar.customizationConfig.morphs.oniHornTier).toBe(0);
    expect(oniChar.customizationConfig.morphs.kitsuneTailCount).toBe(0);

    // Clear active characters to test KITSUNE and invalid Lv 1 morph rejection
    memoryCharacters.length = 0;

    // 3. KITSUNE hero -> unmuscled Lv 1 config with kitsuneTailCount: 1
    const kitsuneRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Starter Kitsune', gameMode: 'STANDARD', race: 'KITSUNE' },
    });
    expect(kitsuneRes.statusCode).toBe(201);
    const kitsuneChar = kitsuneRes.json().character;
    expect(kitsuneChar.race).toBe('KITSUNE');
    expect(kitsuneChar.customizationConfig.morphs.muscleMassTier).toBe(0);
    expect(kitsuneChar.customizationConfig.morphs.kitsuneTailCount).toBe(1);
    expect(kitsuneChar.customizationConfig.morphs.oniHornTier).toBe(0);

    // 4. Reject locked muscleMassTier: 1 at Level 1 with 400
    const lockedConfig = createDefaultCustomizationConfig('HUMAN');
    lockedConfig.morphs.muscleMassTier = 1;
    const lockedRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Muscled Lv1',
        gameMode: 'IRONMAN_VERIFIED',
        race: 'HUMAN',
        customizationConfig: lockedConfig,
      },
    });
    expect(lockedRes.statusCode).toBe(400);
    expect(lockedRes.json().error).toMatch(/muscleMassTier/i);
  });

  it('PATCH /api/characters/:characterId enforces stat-locked customization thresholds and rejects cross-race morphs', async () => {
    const { mockDb, testUser, memoryCharacters } = createTestDb();
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({ userId: testUser.id, email: testUser.email, username: testUser.username });

    const lowStatHuman = {
      id: 'char_low_human',
      userId: testUser.id,
      name: 'Low Stat Human',
      gameMode: 'STANDARD',
      appearanceId: 'wayfarer',
      avatarSpriteId: 'wayfarer',
      race: 'HUMAN',
      customizationConfig: createDefaultCustomizationConfig('HUMAN'),
      deletedAt: null,
      dexLevel: 1,
      conLevel: 1,
      wisLevel: 1,
      sprLevel: 1,
      stats: { strengthLevel: 5, enduranceLevel: 1, agilityLevel: 1 },
      fatigueState: {},
      equipmentLoadout: {},
    };
    memoryCharacters.push(lowStatHuman);

    // STR 5 allows muscleMassTier 1, but NOT muscleMassTier 2 (requires STR >= 12)
    const strLocked = createDefaultCustomizationConfig('HUMAN');
    strLocked.morphs.muscleMassTier = 2;
    const strRes = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${lowStatHuman.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { customizationConfig: strLocked },
    });
    expect(strRes.statusCode).toBe(400);
    expect(strRes.json().error).toMatch(/muscleMassTier/i);

    // CON 1 rejects frameTier 1 (requires CON >= 5)
    const conLocked = createDefaultCustomizationConfig('HUMAN');
    conLocked.morphs.frameTier = 1;
    const conRes = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${lowStatHuman.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { customizationConfig: conLocked },
    });
    expect(conRes.statusCode).toBe(400);
    expect(conRes.json().error).toMatch(/frameTier/i);

    // AGI 1 / DEX 1 rejects phantom_step (requires AGI >= 14 && DEX >= 10)
    const stanceLocked = createDefaultCustomizationConfig('HUMAN');
    stanceLocked.morphs.combatStance = 'phantom_step';
    const stanceRes = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${lowStatHuman.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { customizationConfig: stanceLocked },
    });
    expect(stanceRes.statusCode).toBe(400);
    expect(stanceRes.json().error).toMatch(/combatStance/i);

    // END 1 rejects scarsTier 1 (requires END >= 5) and vascularityTier 1 (requires END >= 8)
    const endLocked = createDefaultCustomizationConfig('HUMAN');
    endLocked.morphs.scarsTier = 1;
    endLocked.morphs.vascularityTier = 1;
    const endRes = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${lowStatHuman.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { customizationConfig: endLocked },
    });
    expect(endRes.statusCode).toBe(400);
    expect(endRes.json().error).toMatch(/scarsTier/i);
    expect(endRes.json().error).toMatch(/vascularityTier/i);

    // High-WIS HUMAN still cannot equip Oni horns (oniHornTier: 1)
    const highWisHuman = {
      ...lowStatHuman,
      id: 'char_high_wis_human',
      wisLevel: 20,
      sprLevel: 20,
    };
    memoryCharacters.push(highWisHuman);
    const crossRaceHorn = createDefaultCustomizationConfig('HUMAN');
    crossRaceHorn.morphs.oniHornTier = 1;
    const crossRaceRes = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${highWisHuman.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { customizationConfig: crossRaceHorn },
    });
    expect(crossRaceRes.statusCode).toBe(400);
    expect(crossRaceRes.json().error).toMatch(/oniHornTier/i);

    // Low-WIS/SPR ONI rejects oniHornTier 1 (requires WIS >= 5 || SPR >= 5) and auraTier 1
    const lowOni = {
      ...lowStatHuman,
      id: 'char_low_oni',
      race: 'ONI',
      customizationConfig: createDefaultCustomizationConfig('ONI'),
    };
    memoryCharacters.push(lowOni);
    const oniHornLocked = createDefaultCustomizationConfig('ONI');
    oniHornLocked.morphs.oniHornTier = 1;
    oniHornLocked.morphs.auraTier = 1;
    const oniHornRes = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${lowOni.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { customizationConfig: oniHornLocked },
    });
    expect(oniHornRes.statusCode).toBe(400);
    expect(oniHornRes.json().error).toMatch(/oniHornTier/i);
    expect(oniHornRes.json().error).toMatch(/auraTier/i);

    // Low-WIS/SPR KITSUNE rejects kitsuneTailCount 2 (requires WIS >= 3 || SPR >= 3)
    const lowKitsune = {
      ...lowStatHuman,
      id: 'char_low_kitsune',
      race: 'KITSUNE',
      customizationConfig: createDefaultCustomizationConfig('KITSUNE'),
    };
    memoryCharacters.push(lowKitsune);
    const kitsuneTailLocked = createDefaultCustomizationConfig('KITSUNE');
    kitsuneTailLocked.morphs.kitsuneTailCount = 2;
    const kitsuneTailRes = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${lowKitsune.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { customizationConfig: kitsuneTailLocked },
    });
    expect(kitsuneTailRes.statusCode).toBe(400);
    expect(kitsuneTailRes.json().error).toMatch(/kitsuneTailCount/i);
  });

  it('PATCH /api/characters/:characterId unlocks higher morphs when stats meet thresholds and allows opting back down', async () => {
    const { mockDb, testUser, memoryCharacters } = createTestDb();
    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({ userId: testUser.id, email: testUser.email, username: testUser.username });

    const veteranKitsune = {
      id: 'char_vet_kitsune',
      userId: testUser.id,
      name: 'Nine-Tail Sovereign',
      gameMode: 'STANDARD',
      appearanceId: 'solar_mystic',
      avatarSpriteId: 'solar_mystic',
      race: 'KITSUNE',
      customizationConfig: createDefaultCustomizationConfig('KITSUNE'),
      deletedAt: null,
      dexLevel: 15,
      conLevel: 25,
      wisLevel: 35,
      sprLevel: 30,
      stats: { strengthLevel: 35, enduranceLevel: 25, agilityLevel: 16 },
      fatigueState: {},
      equipmentLoadout: {},
    };
    memoryCharacters.push(veteranKitsune);

    // Upgrade to max unlocked morphs
    const maxedConfig = createDefaultCustomizationConfig('KITSUNE');
    maxedConfig.morphs.muscleMassTier = 4;
    maxedConfig.morphs.frameTier = 3;
    maxedConfig.morphs.leanDefinitionTier = 2;
    maxedConfig.morphs.combatStance = 'phantom_step';
    maxedConfig.morphs.scarsTier = 3;
    maxedConfig.morphs.vascularityTier = 2;
    maxedConfig.morphs.kitsuneTailCount = 9;
    maxedConfig.morphs.auraTier = 3;

    const upRes = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${veteranKitsune.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { customizationConfig: maxedConfig },
    });
    expect(upRes.statusCode).toBe(200);
    expect(upRes.json().character.customizationConfig.morphs.muscleMassTier).toBe(4);
    expect(upRes.json().character.customizationConfig.morphs.kitsuneTailCount).toBe(9);
    expect(upRes.json().character.customizationConfig.morphs.auraTier).toBe(3);

    // Opt back down to minimal morphs on the same high-stat hero
    const optedDownConfig = {
      ...maxedConfig,
      morphs: {
        ...maxedConfig.morphs,
        muscleMassTier: 0,
        auraTier: 0,
        scarsTier: 0,
        kitsuneTailCount: 1,
      },
    };
    const downRes = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${veteranKitsune.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { customizationConfig: optedDownConfig },
    });
    expect(downRes.statusCode).toBe(200);
    expect(downRes.json().character.customizationConfig.morphs.muscleMassTier).toBe(0);
    expect(downRes.json().character.customizationConfig.morphs.auraTier).toBe(0);
    expect(downRes.json().character.customizationConfig.morphs.scarsTier).toBe(0);
    expect(downRes.json().character.customizationConfig.morphs.kitsuneTailCount).toBe(1);
  });
});
