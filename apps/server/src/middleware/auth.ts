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
