import { PrismaClient } from '@gymify/database';
import bcrypt from 'bcryptjs';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
  characterName: z.string().min(2).max(32).optional(),
  gameMode: z.enum(['STANDARD', 'IRONMAN_VERIFIED']).default('STANDARD').optional(),
  avatarSpriteId: z.string().default('adventurer_default').optional(),
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

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(body.password, saltRounds);

    const user = await db.user.create({
      data: {
        email: body.email,
        username: body.username,
        passwordHash,
        timezone: body.timezone ?? 'UTC',
        lastLoginAt: new Date(),
      },
    });

    const chosenCharacterName = body.characterName?.trim() || `${body.username}'s Hero`;
    const chosenGameMode = body.gameMode ?? 'STANDARD';
    const character = await db.character.create({
      data: {
        userId: user.id,
        name: chosenCharacterName,
        gameMode: chosenGameMode,
        avatarSpriteId: body.avatarSpriteId ?? 'adventurer_default',
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
    });
  });

  /**
   * POST /api/auth/login
   * Validates credentials against stored bcrypt passwordHash, updates lastLoginAt,
   * loads character sheet(s), and returns a signed JWT token.
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

    const characters = await db.character.findMany({
      where: { userId: user.id },
      include: {
        stats: true,
        fatigueState: true,
        equipmentLoadout: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    let character = characters[0];
    if (!character) {
      character = await db.character.create({
        data: {
          userId: user.id,
          name: `${user.username}'s Hero`,
          gameMode: 'STANDARD',
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
      characters.push(character);
    }

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
      characters,
    });
  });

  /**
   * GET /api/auth/me
   * Protected route: returns the authenticated user session profile & character sheet(s).
   */
  app.get('/api/auth/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const { userId } = request.user;

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const characters = await db.character.findMany({
      where: { userId: user.id },
      include: {
        stats: true,
        fatigueState: true,
        equipmentLoadout: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const character = characters[0] ?? null;

    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        timezone: user.timezone,
        lastLoginAt: user.lastLoginAt,
      },
      character,
      characters,
    });
  });
}
