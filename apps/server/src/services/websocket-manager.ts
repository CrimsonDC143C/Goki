import type { WebSocket } from 'ws';
import type { AuthJwtPayload } from '../middleware/auth';

export interface WebSocketClient {
  id: string;
  socket: WebSocket;
  user?: AuthJwtPayload;
  rooms: Set<string>;
  connectedAt: Date;
}

export type WebSocketEventType =
  | 'CONNECTED'
  | 'AUTHENTICATED'
  | 'SUBSCRIBED'
  | 'UNSUBSCRIBED'
  | 'PONG'
  | 'RAID_HP_UPDATE'
  | 'PARTY_MEMBER_JOINED'
  | 'DUNGEON_RUN_STARTED'
  | 'DUNGEON_BUFF_INJECTED'
  | 'ERROR';

export interface WebSocketEvent<T = Record<string, unknown>> {
  type: WebSocketEventType;
  room?: string;
  timestamp?: number;
  [key: string]: unknown;
}

/**
 * Safely stringifies payloads to JSON, converting any BigInt fields
 * (like boss HP or cumulative damage) to Numbers.
 */
export function safeSerializeWsPayload(data: unknown): string {
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    return value;
  });
}

/**
 * Central WebSocket Connection & PubSub Room Manager.
 * Handles active socket registrations, JWT user context binding,
 * room subscriptions (e.g. `raid:{raidId}`, `dungeon:{dungeonId}`),
 * and targeted event multicasting.
 */
export class WebSocketManager {
  private clients = new Map<WebSocket, WebSocketClient>();
  private rooms = new Map<string, Set<WebSocket>>();
  private idCounter = 0;

  /**
   * Registers an incoming WebSocket connection and associates optional JWT user data.
   */
  public registerClient(socket: WebSocket, user?: AuthJwtPayload): WebSocketClient {
    this.idCounter += 1;
    const clientId = `ws_client_${Date.now()}_${this.idCounter}`;

    const client: WebSocketClient = {
      id: clientId,
      socket,
      user,
      rooms: new Set<string>(),
      connectedAt: new Date(),
    };

    this.clients.set(socket, client);
    return client;
  }

  /**
   * Updates an existing socket client with authenticated user credentials.
   */
  public authenticateClient(socket: WebSocket, user: AuthJwtPayload): boolean {
    const client = this.clients.get(socket);
    if (!client) return false;
    client.user = user;
    return true;
  }

  /**
   * Retrieves client metadata for a socket.
   */
  public getClient(socket: WebSocket): WebSocketClient | undefined {
    return this.clients.get(socket);
  }

  /**
   * Removes a socket connection from all rooms and active registry.
   */
  public removeClient(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (client) {
      for (const room of client.rooms) {
        const roomSet = this.rooms.get(room);
        if (roomSet) {
          roomSet.delete(socket);
          if (roomSet.size === 0) {
            this.rooms.delete(room);
          }
        }
      }
      this.clients.delete(socket);
    }
  }

  /**
   * Subscribes a client socket to a named room (e.g. `raid:malakor`, `dungeon:obsidian`).
   */
  public joinRoom(socket: WebSocket, room: string): boolean {
    const client = this.clients.get(socket);
    if (!client) return false;

    const normalizedRoom = room.trim();
    if (!normalizedRoom) return false;

    client.rooms.add(normalizedRoom);

    let roomSet = this.rooms.get(normalizedRoom);
    if (!roomSet) {
      roomSet = new Set<WebSocket>();
      this.rooms.set(normalizedRoom, roomSet);
    }
    roomSet.add(socket);

    return true;
  }

  /**
   * Unsubscribes a client socket from a named room.
   */
  public leaveRoom(socket: WebSocket, room: string): boolean {
    const client = this.clients.get(socket);
    const normalizedRoom = room.trim();

    if (client) {
      client.rooms.delete(normalizedRoom);
    }

    const roomSet = this.rooms.get(normalizedRoom);
    if (roomSet) {
      roomSet.delete(socket);
      if (roomSet.size === 0) {
        this.rooms.delete(normalizedRoom);
      }
      return true;
    }

    return false;
  }

  /**
   * Broadcasts a payload to all connected clients currently subscribed to the given room.
   */
  public broadcastToRoom<T = Record<string, unknown>>(
    room: string,
    message: WebSocketEvent<T>
  ): number {
    const normalizedRoom = room.trim();
    const roomSet = this.rooms.get(normalizedRoom);
    if (!roomSet || roomSet.size === 0) return 0;

    const payload: WebSocketEvent<T> = {
      ...message,
      room: normalizedRoom,
      timestamp: message.timestamp ?? Date.now(),
    };
    const serialized = safeSerializeWsPayload(payload);

    let sentCount = 0;
    for (const socket of roomSet) {
      // 1 = WebSocket.OPEN
      if (socket.readyState === 1) {
        try {
          socket.send(serialized);
          sentCount += 1;
        } catch {
          // Socket write failure; handled on close/error
        }
      }
    }

    return sentCount;
  }

  /**
   * Broadcasts a payload to all currently connected clients across all rooms.
   */
  public broadcast<T = Record<string, unknown>>(message: WebSocketEvent<T>): number {
    const payload: WebSocketEvent<T> = {
      ...message,
      timestamp: message.timestamp ?? Date.now(),
    };
    const serialized = safeSerializeWsPayload(payload);

    let sentCount = 0;
    for (const [socket] of this.clients) {
      if (socket.readyState === 1) {
        try {
          socket.send(serialized);
          sentCount += 1;
        } catch {
          // Handled on close/error
        }
      }
    }

    return sentCount;
  }

  /**
   * Directly sends a message to an individual socket.
   */
  public sendToSocket<T = Record<string, unknown>>(
    socket: WebSocket,
    message: WebSocketEvent<T>
  ): boolean {
    if (socket.readyState !== 1) return false;

    const payload: WebSocketEvent<T> = {
      ...message,
      timestamp: message.timestamp ?? Date.now(),
    };

    try {
      socket.send(safeSerializeWsPayload(payload));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets list of clients in a specific room.
   */
  public getRoomClients(room: string): WebSocketClient[] {
    const roomSet = this.rooms.get(room.trim());
    if (!roomSet) return [];
    const list: WebSocketClient[] = [];
    for (const socket of roomSet) {
      const client = this.clients.get(socket);
      if (client) list.push(client);
    }
    return list;
  }

  /**
   * Gets list of room names a socket is currently subscribed to.
   */
  public getClientRooms(socket: WebSocket): string[] {
    const client = this.clients.get(socket);
    return client ? Array.from(client.rooms) : [];
  }

  /**
   * Returns the count of connected clients.
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Returns the count of active rooms with subscribers.
   */
  public getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Clears all client and room registrations (useful for test resets).
   */
  public clear(): void {
    this.clients.clear();
    this.rooms.clear();
  }
}

/**
 * Shared singleton WebSocket connection manager.
 */
export const websocketManager = new WebSocketManager();

declare module 'fastify' {
  interface FastifyInstance {
    websocketManager: WebSocketManager;
  }
}

