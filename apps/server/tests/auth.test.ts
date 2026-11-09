import { PrismaClient } from '@goki/database';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { buildServerApp } from '../src/app';

describe('@goki/server JWT Authentication & Password Hashing', () => {
  it('registers a user, hashes password, and returns a signed JWT', async () => {
    const memoryUsers: any[] = [];
    const memoryCharacters: any[] = [];

    const mockDb = {
      user: {
        findFirst: async ({ where }: any) => {
          return memoryUsers.find((u) => {
            if (where.OR) {
              return where.OR.some(
                (cond: any) =>
                  (cond.email && u.email === cond.email) ||
                  (cond.username && u.username === cond.username)
              );
            }
            return false;
          });
        },
        create: async ({ data }: any) => {
          const user = {
            id: 'user_test_1',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastLoginAt: data.lastLoginAt ?? null,
            ...data,
          };
          memoryUsers.push(user);
          return user;
        },
      },
      character: {
        create: async ({ data }: any) => {
          const char = {
            id: 'char_test_1',
            userId: data.userId,
            name: data.name,
            gameMode: data.gameMode,
            stats: { strengthLevel: 1, enduranceLevel: 1, agilityLevel: 1 },
            fatigueState: { isRestingInTavern: true },
            equipmentLoadout: {},
          };
          memoryCharacters.push(char);
          return char;
        },
      },
    } as unknown as PrismaClient;

    const app = await buildServerApp({ db: mockDb });

    // 1. Valid Registration
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'valkyrie@gokirpg.com',
        username: 'valkyrie_warrior',
        password: 'securePassword123',
        characterName: 'Valkyrie the Bold',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regData = regRes.json();
    expect(regData.token).toBeDefined();
    expect(typeof regData.token).toBe('string');
    expect(regData.user.email).toBe('valkyrie@gokirpg.com');
    expect(regData.user.username).toBe('valkyrie_warrior');
    expect(regData.character.name).toBe('Valkyrie the Bold');

    // Verify password is NOT stored in plain text
    expect(memoryUsers[0].passwordHash).not.toBe('securePassword123');
    expect(bcrypt.compareSync('securePassword123', memoryUsers[0].passwordHash)).toBe(true);

    // 2. Reject duplicate email/username with 409
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'valkyrie@gokirpg.com',
        username: 'valkyrie_warrior_different',
        password: 'securePassword123',
      },
    });
    expect(dupRes.statusCode).toBe(409);

    // 3. Validation rejection for invalid email / short password
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'not-an-email',
        username: 'hi',
        password: '123',
      },
    });
    expect(invalidRes.statusCode).toBe(400);

    await app.close();
  });

  it('authenticates user on /api/auth/login with valid password, rejects invalid', async () => {
    const passwordHash = bcrypt.hashSync('correctHorseBattery99', 10);
    const storedUser = {
      id: 'user_horse_1',
      email: 'horse@gokirpg.com',
      username: 'horse_rider',
      passwordHash,
      timezone: 'UTC',
      lastLoginAt: null,
      createdAt: new Date(),
    };
    const storedChar = {
      id: 'char_horse_1',
      userId: 'user_horse_1',
      name: 'Shadowfax',
      stats: { strengthLevel: 5 },
      fatigueState: {},
      equipmentLoadout: {},
    };

    const mockDb = {
      user: {
        findUnique: async ({ where }: any) => {
          if (where.email === storedUser.email || where.id === storedUser.id) {
            return storedUser;
          }
          return null;
        },
        update: async ({ data }: any) => {
          Object.assign(storedUser, data);
          return storedUser;
        },
      },
      character: {
        findFirst: async () => storedChar,
        findMany: async () => [storedChar],
      },
    } as unknown as PrismaClient;

    const app = await buildServerApp({ db: mockDb });

    // 1. Wrong Password
    const wrongPassRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'horse@gokirpg.com',
        password: 'wrongPassword',
      },
    });
    expect(wrongPassRes.statusCode).toBe(401);
    expect(wrongPassRes.json().error).toContain('Invalid email or password');

    // 2. Non-existent User
    const noUserRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'unknown@gokirpg.com',
        password: 'correctHorseBattery99',
      },
    });
    expect(noUserRes.statusCode).toBe(401);

    // 3. Successful Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'horse@gokirpg.com',
        password: 'correctHorseBattery99',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginData = loginRes.json();
    expect(loginData.token).toBeDefined();
    expect(loginData.user.email).toBe('horse@gokirpg.com');
    expect(loginData.character.name).toBe('Shadowfax');
    expect(storedUser.lastLoginAt).not.toBeNull();

    // 4. Test Protected /api/auth/me Endpoint
    // 4a. Without token -> 401
    const unauthMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });
    expect(unauthMe.statusCode).toBe(401);

    // 4b. With invalid token -> 401
    const badTokenMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: 'Bearer definitely_not_a_valid_jwt_token',
      },
    });
    expect(badTokenMe.statusCode).toBe(401);

    // 4c. With valid token -> 200
    const authMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: `Bearer ${loginData.token}`,
      },
    });
    expect(authMe.statusCode).toBe(200);
    const meData = authMe.json();
    expect(meData.user.id).toBe('user_horse_1');
    expect(meData.user.username).toBe('horse_rider');
    expect(meData.character.name).toBe('Shadowfax');

    await app.close();
  });

  it('enforces character creation constraints: max 2 characters per user (1 Standard, 1 Ironman)', async () => {
    const memoryCharacters: any[] = [];
    const testUser = {
      id: 'user_twomode_1',
      email: 'dual@gokirpg.com',
      username: 'dual_champion',
      passwordHash: 'dummyHash',
      timezone: 'UTC',
    };

    // Pre-populate with 1 Standard character
    memoryCharacters.push({
      id: 'char_std_1',
      userId: testUser.id,
      name: 'Steel Champion',
      gameMode: 'STANDARD',
      avatarSpriteId: 'warrior',
      stats: { strengthLevel: 5 },
      fatigueState: {},
      equipmentLoadout: {},
      createdAt: new Date(),
    });

    const mockDb = {
      user: {
        findUnique: async () => testUser,
      },
      character: {
        findMany: async ({ where }: any) => {
          if (where?.userId) {
            return memoryCharacters.filter((c) => c.userId === where.userId);
          }
          return memoryCharacters;
        },
        findUnique: async ({ where }: any) => {
          if (where?.name) {
            return memoryCharacters.find((c) => c.name.toLowerCase() === where.name.toLowerCase()) ?? null;
          }
          if (where?.id) {
            return memoryCharacters.find((c) => c.id === where.id) ?? null;
          }
          return null;
        },
        create: async ({ data }: any) => {
          const char = {
            id: `char_${Date.now()}`,
            userId: data.userId,
            name: data.name,
            gameMode: data.gameMode,
            avatarSpriteId: data.avatarSpriteId ?? 'adventurer_default',
            stats: { strengthLevel: 1 },
            fatigueState: {},
            equipmentLoadout: {},
            createdAt: new Date(),
          };
          memoryCharacters.push(char);
          return char;
        },
      },
    } as unknown as PrismaClient;

    const app = await buildServerApp({ db: mockDb });
    const token = app.jwt.sign({
      userId: testUser.id,
      email: testUser.email,
      username: testUser.username,
    });

    // 1. GET /api/characters returns the existing Standard character
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.statusCode).toBe(200);
    const getData = getRes.json();
    expect(getData.characters).toHaveLength(1);
    expect(getData.characters[0].name).toBe('Steel Champion');
    expect(getData.characters[0].gameMode).toBe('STANDARD');

    // 2. Reject creating a second STANDARD character (duplicate game mode)
    const dupModeRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Another Standard Hero',
        gameMode: 'STANDARD',
      },
    });
    expect(dupModeRes.statusCode).toBe(409);
    expect(dupModeRes.json().error).toContain('Only one character is permitted per game mode');

    // 3. Reject creating with an existing character name
    const dupNameRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Steel Champion',
        gameMode: 'IRONMAN_VERIFIED',
      },
    });
    expect(dupNameRes.statusCode).toBe(409);
    expect(dupNameRes.json().error).toContain('already exists');

    // 4. Successfully create the second character as IRONMAN_VERIFIED
    const createIronmanRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Iron Valkyrie',
        gameMode: 'IRONMAN_VERIFIED',
        avatarSpriteId: 'vanguard',
      },
    });
    expect(createIronmanRes.statusCode).toBe(201);
    const ironmanData = createIronmanRes.json();
    expect(ironmanData.character.name).toBe('Iron Valkyrie');
    expect(ironmanData.character.gameMode).toBe('IRONMAN_VERIFIED');
    expect(ironmanData.character.avatarSpriteId).toBe('vanguard');

    // 5. Account now has 2 characters (1 Standard, 1 Ironman). Attempting a 3rd must be rejected with 400
    const thirdCharRes = await app.inject({
      method: 'POST',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Third Forbidden Hero',
        gameMode: 'STANDARD',
      },
    });
    expect(thirdCharRes.statusCode).toBe(400);
    expect(thirdCharRes.json().error).toContain('Account character limit reached');

    // 6. Verify GET /api/characters now lists both characters
    const getFinalRes = await app.inject({
      method: 'GET',
      url: '/api/characters',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getFinalRes.statusCode).toBe(200);
    const finalData = getFinalRes.json();
    expect(finalData.characters).toHaveLength(2);
    expect(finalData.characters.map((c: any) => c.gameMode).sort()).toEqual(['IRONMAN_VERIFIED', 'STANDARD']);

    await app.close();
  });
});
