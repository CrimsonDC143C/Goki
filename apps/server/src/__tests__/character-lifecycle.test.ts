import { PrismaClient } from '@goki/database';
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
              if (where?.name && c.name.toLowerCase() !== where.name.toLowerCase()) return false;
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

    // Create a hero with dexLevel: 2 (giving 2 talent points for DEXTERITY)
    const char = {
      id: 'char_dex_rogue',
      userId: testUser.id,
      name: 'Shadow Strider',
      gameMode: 'STANDARD',
      appearanceId: 'shadow_dancer',
      deletedAt: null,
      dexLevel: 2,
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

    // 3rd unlock: Total spent is now 2, dexLevel is 2, so available DEXTERITY points is 0 -> Should fail with 400!
    const res3 = await app.inject({
      method: 'POST',
      url: `/api/characters/${char.id}/talents/unlock`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nodeSlug: 'acro_fluid_movement' },
    });
    expect(res3.statusCode).toBe(400);
    expect(res3.json().error).toMatch(/points/i);
  });
});
