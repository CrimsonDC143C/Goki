import { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { AuthJwtPayload } from '../middleware/auth';
import { WebSocketManager, websocketManager } from '../services/websocket-manager';

interface ConnectQueryParams {
  token?: string;
}

interface InboundWsMessage {
  type?: string;
  room?: string;
  token?: string;
  [key: string]: unknown;
}

export function registerWebSocketRoutes(
  app: FastifyInstance,
  wsManager: WebSocketManager = websocketManager
): void {
  app.get<{ Querystring: ConnectQueryParams }>(
    '/api/ws/connect',
    { websocket: true },
    (socket: WebSocket, request) => {
      let authUser: AuthJwtPayload | undefined;

      // 1. Authenticate via query param token (?token=...)
      const queryToken = request.query?.token;
      if (queryToken && typeof queryToken === 'string') {
        try {
          authUser = app.jwt.verify<AuthJwtPayload>(queryToken);
        } catch {
          // Query token invalid; allow connection as unauthenticated guest
        }
      }

      // 2. Register socket connection in WebSocketManager
      const client = wsManager.registerClient(socket, authUser);

      // Send initial connection handshake
      wsManager.sendToSocket(socket, {
        type: 'CONNECTED',
        connectionId: client.id,
        authenticated: Boolean(authUser),
        user: authUser,
        timestamp: Date.now(),
      });

      // 3. Process inbound messages
      socket.on('message', (raw) => {
        try {
          const rawStr = typeof raw === 'string' ? raw : raw.toString('utf-8');
          const data: InboundWsMessage = JSON.parse(rawStr);

          switch (data.type) {
            case 'PING': {
              wsManager.sendToSocket(socket, {
                type: 'PONG',
                timestamp: Date.now(),
              });
              break;
            }

            case 'AUTH': {
              if (typeof data.token === 'string' && data.token.trim()) {
                try {
                  const decoded = app.jwt.verify<AuthJwtPayload>(data.token.trim());
                  wsManager.authenticateClient(socket, decoded);
                  wsManager.sendToSocket(socket, {
                    type: 'AUTHENTICATED',
                    user: decoded,
                    timestamp: Date.now(),
                  });
                } catch {
                  wsManager.sendToSocket(socket, {
                    type: 'ERROR',
                    message: 'Invalid or expired authentication token',
                  });
                }
              } else {
                wsManager.sendToSocket(socket, {
                  type: 'ERROR',
                  message: 'Missing token in AUTH message',
                });
              }
              break;
            }

            case 'SUBSCRIBE': {
              if (typeof data.room === 'string' && data.room.trim()) {
                const room = data.room.trim();
                wsManager.joinRoom(socket, room);
                wsManager.sendToSocket(socket, {
                  type: 'SUBSCRIBED',
                  room,
                  timestamp: Date.now(),
                });
              } else {
                wsManager.sendToSocket(socket, {
                  type: 'ERROR',
                  message: 'Missing or invalid room identifier for SUBSCRIBE',
                });
              }
              break;
            }

            case 'UNSUBSCRIBE': {
              if (typeof data.room === 'string' && data.room.trim()) {
                const room = data.room.trim();
                wsManager.leaveRoom(socket, room);
                wsManager.sendToSocket(socket, {
                  type: 'UNSUBSCRIBED',
                  room,
                  timestamp: Date.now(),
                });
              }
              break;
            }

            default: {
              wsManager.sendToSocket(socket, {
                type: 'ERROR',
                message: `Unknown message type: ${String(data.type)}`,
              });
              break;
            }
          }
        } catch {
          wsManager.sendToSocket(socket, {
            type: 'ERROR',
            message: 'Malformed JSON payload received',
          });
        }
      });

      // 4. Socket teardown
      socket.on('close', () => {
        wsManager.removeClient(socket);
      });

      socket.on('error', () => {
        wsManager.removeClient(socket);
      });
    }
  );
}
