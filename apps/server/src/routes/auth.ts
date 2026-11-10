import { PrismaClient } from '@goki/database';
import bcrypt from 'bcryptjs';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { isPrismaUniqueConstraintError, withDbTransaction } from '../services/game-operations';
import { SOFT_DELETE_RETENTION_MS, computeDaysRemaining } from './characters';

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
  characterName: z.string().min(2).max(32).optional(),
  gameMode: z.enum(['STANDARD', 'IRONMAN_VERIFIED']).default('STANDARD').optional(),
  appearanceId: z.string().default('oni_warlord').optional(),
  avatarSpriteId: z.string().default('oni_warlord').optional(),
  timezone: z.string().default('UTC').optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance, db: PrismaClient): void {
  /**
   * POST /api/auth/register
   * Registers a new user, hashes their password with bcrypt, initializes their
   * starter character, and issues a signed JWT token.
   */
  app.post('/api/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);

    const existingUser = await db.user.findFirst({
      where: {
        OR: [{ email: body.email }, { username: body.username }],
      },
    });

    if (existingUser) {
      return reply.status(409).send({
        error:
          existingUser.email === body.email
            ? 'A user with this email address already exists'
            : 'A user with this username already exists',
      });
    }

    const chosenCharacterName = body.characterName?.trim() || `${body.username}'s Hero`;
    const chosenGameMode = body.gameMode ?? 'STANDARD';
    const chosenAppearance = body.appearanceId || body.avatarSpriteId || 'oni_warlord';

    // Check case-insensitive character name uniqueness before creating user+character
    const existingCharWithName =
      typeof (db.character as any)?.findFirst === 'function'
        ? await db.character.findFirst({
            where: {
              name: { equals: chosenCharacterName, mode: 'insensitive' } as any,
              deletedAt: null,
            },
          })
        : typeof (db.character as any)?.findUnique === 'function'
          ? await db.character.findUnique({
              where: { name: chosenCharacterName },
            })
          : null;

    if (existingCharWithName && !existingCharWithName.deletedAt) {
      return reply.status(409).send({
        error: 'A character with this name already exists in the realm. Please choose a different name.',
      });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(body.password, saltRounds);

    let user: any;
    let character: any;
    try {
      const result = await withDbTransaction(
        db,
        async (tx) => {
          const createdUser = await tx.user.create({
            data: {
              email: body.email,
              username: body.username,
              passwordHash,
              timezone: body.timezone ?? 'UTC',
              lastLoginAt: new Date(),
            },
          });

          const createdCharacter = await tx.character.create({
            data: {
              userId: createdUser.id,
              name: chosenCharacterName,
              gameMode: chosenGameMode,
              appearanceId: chosenAppearance,
              avatarSpriteId: chosenAppearance,
              stats: { create: {} },
              fatigueState: { create: {} },
              equipmentLoadout: { create: {} },
            },
            include: {
              stats: true,
              fatigueState: true,
              equipmentLoadout: true,
            },
          });

          return { createdUser, createdCharacter };
        },
        `register:${body.email.toLowerCase()}`
      );
      user = result.createdUser;
      character = result.createdCharacter;
    } catch (err) {
      if (isPrismaUniqueConstraintError(err)) {
        return reply.status(409).send({
          error: 'Email, username, or hero name is already taken.',
        });
      }
      throw err;
    }

    const token = app.jwt.sign({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    return reply.status(201).send({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        timezone: user.timezone,
        createdAt: user.createdAt,
      },
      character,
      characters: [character],
      activeCharacters: [character],
      deletedCharacters: [],
    });
  });

  /**
   * POST /api/auth/login
   * Validates credentials against stored bcrypt passwordHash, updates lastLoginAt,
   * loads active character sheet(s) and restorable soft-deleted characters, and returns a signed JWT token.
   */
  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await db.user.findUnique({
      where: { email: body.email },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(body.password, user.passwordHash);
    if (!passwordMatch) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const now = new Date();
    const cutoff = new Date(now.getTime() - SOFT_DELETE_RETENTION_MS);

    const allCharacters = await db.character.findMany({
      where: { userId: user.id },
      include: {
        stats: true,
        fatigueState: true,
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
        bountyCompletions: { include: { bounty: true } },
        _count: { select: { workoutLogs: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const activeCharacters = allCharacters.filter((c) => !c.deletedAt);
    const deletedCharacters = allCharacters
      .filter((c) => c.deletedAt && new Date(c.deletedAt).getTime() >= cutoff.getTime())
      .map((c) => ({
        ...c,
        daysRemaining: computeDaysRemaining(new Date(c.deletedAt!)),
      }));

    const character = activeCharacters[0] ?? null;

    const token = app.jwt.sign({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    return reply.status(200).send({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        timezone: user.timezone,
        lastLoginAt: user.lastLoginAt,
      },
      character,
      characters: activeCharacters,
      activeCharacters,
      deletedCharacters,
    });
  });

  /**
   * GET /api/auth/me
   * Protected route: returns the authenticated user session profile, active character sheet(s),
   * and restorable soft-deleted characters.
   */
  app.get('/api/auth/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const { userId } = request.user;

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - SOFT_DELETE_RETENTION_MS);

    const allCharacters = await db.character.findMany({
      where: { userId: user.id },
      include: {
        stats: true,
        fatigueState: true,
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
        bountyCompletions: { include: { bounty: true } },
        _count: { select: { workoutLogs: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const activeCharacters = allCharacters.filter((c) => !c.deletedAt);
    const deletedCharacters = allCharacters
      .filter((c) => c.deletedAt && new Date(c.deletedAt).getTime() >= cutoff.getTime())
      .map((c) => ({
        ...c,
        daysRemaining: computeDaysRemaining(new Date(c.deletedAt!)),
      }));

    const character = activeCharacters[0] ?? null;

    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        timezone: user.timezone,
        lastLoginAt: user.lastLoginAt,
      },
      character,
      characters: activeCharacters,
      activeCharacters,
      deletedCharacters,
    });
  });
}
