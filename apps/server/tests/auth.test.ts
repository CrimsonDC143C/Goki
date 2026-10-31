import { PrismaClient } from '@gymify/database';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { buildServerApp } from '../src/app';

describe('@gymify/server JWT Authentication & Password Hashing', () => {
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
        email: 'valkyrie@gymify.rpg',
        username: 'valkyrie_warrior',
        password: 'securePassword123',
        characterName: 'Valkyrie the Bold',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regData = regRes.json();
    expect(regData.token).toBeDefined();
    expect(typeof regData.token).toBe('string');
    expect(regData.user.email).toBe('valkyrie@gymify.rpg');
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
        email: 'valkyrie@gymify.rpg',
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
      email: 'horse@gymify.rpg',
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
      },
    } as unknown as PrismaClient;

    const app = await buildServerApp({ db: mockDb });

    // 1. Wrong Password
    const wrongPassRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'horse@gymify.rpg',
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
        email: 'unknown@gymify.rpg',
        password: 'correctHorseBattery99',
      },
    });
    expect(noUserRes.statusCode).toBe(401);

    // 3. Successful Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'horse@gymify.rpg',
        password: 'correctHorseBattery99',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginData = loginRes.json();
    expect(loginData.token).toBeDefined();
    expect(loginData.user.email).toBe('horse@gymify.rpg');
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
});
