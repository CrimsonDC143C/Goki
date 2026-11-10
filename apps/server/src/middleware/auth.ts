import { PrismaClient } from '@goki/database';
import { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthJwtPayload {
  userId: string;
  email: string;
  username: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthJwtPayload;
    user: AuthJwtPayload;
  }
}

/**
 * Verifies that a character exists, is not soft-deleted, and belongs to `userId`.
 * Throws HTTP status errors (404, 400, 403) caught by the Fastify error handler.
 */
export async function assertCharacterActiveAndOwned(
  db: PrismaClient,
  characterId: string,
  userId: string
) {
  const character = await db.character.findUnique({
    where: { id: characterId },
  });
  if (!character) {
    throw Object.assign(new Error('Character not found.'), { statusCode: 404 });
  }
  if (character.deletedAt !== null && character.deletedAt !== undefined) {
    throw Object.assign(
      new Error('Character is archived and cannot perform gameplay actions.'),
      { statusCode: 400 }
    );
  }
  if (character.userId !== userId) {
    throw Object.assign(new Error('Forbidden: You do not own this character.'), {
      statusCode: 403,
    });
  }
  return character;
}

/**
 * Fastify preHandler hook to require a valid Bearer JWT token.
 * Populates `request.user` with `{ userId, email, username }`.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (_err) {
    return reply.status(401).send({
      error: 'Unauthorized: Missing or invalid authentication token',
    });
  }
}

/**
 * Fastify preHandler hook to require admin privileges for sensitive developer routes.
 * Allows access if:
 * 1. Environment is non-production (`development` or `test`), OR
 * 2. `process.env.ADMIN_EMAILS` is unset or empty, OR
 * 3. The authenticated user's email matches an entry in `process.env.ADMIN_EMAILS` (comma-separated, case-insensitive).
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const rawAdmins = (process.env.ADMIN_EMAILS ?? '').trim();

  if (nodeEnv !== 'production' || !rawAdmins) {
    return;
  }

  const allowedEmails = rawAdmins
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowedEmails.length === 0) {
    return;
  }

  const userEmail = request.user?.email?.trim().toLowerCase() ?? '';
  if (!userEmail || !allowedEmails.includes(userEmail)) {
    return reply.status(403).send({
      error: 'Forbidden: Developer Sanctum admin access required',
    });
  }
}

/**
 * Optional authentication hook that populates `request.user` if a token is present,
 * but allows unauthenticated requests to proceed.
 */
export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    if (request.headers.authorization) {
      await request.jwtVerify();
    }
  } catch {
    // Gracefully ignore token errors for optional auth routes
  }
}
