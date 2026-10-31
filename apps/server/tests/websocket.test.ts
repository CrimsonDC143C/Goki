import { PrismaClient } from '@gymify/database';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildServerApp } from '../src/app';
import { WebSocketManager, safeSerializeWsPayload } from '../src/services/websocket-manager';

describe('WebSocketManager (Room PubSub & BigInt Safe Serialization)', () => {
  it('safely serializes BigInt values into JSON numbers without throwing', () => {
    const payload = {
      type: 'RAID_HP_UPDATE',
      bossId: 'malakor',
      maxHp: 10_000_000n,
      currentHp: 8_750_000n,
      delta: 125_000n,
    };

    const serialized = safeSerializeWsPayload(payload);
    const parsed = JSON.parse(serialized);

    expect(parsed.maxHp).toBe(10_000_000);
    expect(parsed.currentHp).toBe(8_750_000);
    expect(parsed.delta).toBe(125_000);
  });

  it('manages client connections, room memberships, and isolates broadcasts', () => {
    const manager = new WebSocketManager();

    // Mock WebSocket instances
    const mockSocketA = { readyState: 1, send: () => {} } as unknown as WebSocket;
    const mockSocketB = { readyState: 1, send: () => {} } as unknown as WebSocket;
    const mockSocketC = { readyState: 1, send: () => {} } as unknown as WebSocket;

    const clientA = manager.registerClient(mockSocketA, {
      userId: 'user_1',
      email: 'a@gym.io',
      username: 'IronLifter',
    });
    const clientB = manager.registerClient(mockSocketB);
    const clientC = manager.registerClient(mockSocketC);

    expect(manager.getClientCount()).toBe(3);
    expect(clientA.user?.username).toBe('IronLifter');
    expect(clientB.user).toBeUndefined();

    // Subscriptions
    manager.joinRoom(mockSocketA, 'raid:boss_ignisrax');
    manager.joinRoom(mockSocketB, 'raid:boss_ignisrax');
    manager.joinRoom(mockSocketC, 'raid:boss_malakor');

    expect(manager.getRoomClients('raid:boss_ignisrax')).toHaveLength(2);
    expect(manager.getRoomClients('raid:boss_malakor')).toHaveLength(1);
    expect(manager.getClientRooms(mockSocketA)).toEqual(['raid:boss_ignisrax']);

    // Broadcast targeting
    const sentCount = manager.broadcastToRoom('raid:boss_ignisrax', {
      type: 'RAID_HP_UPDATE',
      currentHp: 500000,
    });
    expect(sentCount).toBe(2);

    // Leaving a room
    manager.leaveRoom(mockSocketA, 'raid:boss_ignisrax');
    expect(manager.getRoomClients('raid:boss_ignisrax')).toHaveLength(1);

    // Client disconnection teardown
    manager.removeClient(mockSocketB);
    expect(manager.getClientCount()).toBe(2);
    expect(manager.getRoomClients('raid:boss_ignisrax')).toHaveLength(0);
    expect(manager.getRoomCount()).toBe(1); // only raid:boss_malakor remains
  });
});

describe('Fastify WebSocket Server & Integration Protocol', () => {
  let app: Awaited<ReturnType<typeof buildServerApp>> | null = null;
  const openSockets: WebSocket[] = [];

  function createClientHelper() {
    const messageQueue: Record<string, unknown>[] = [];
    const waiters: ((msg: Record<string, unknown>) => void)[] = [];

    const onInit = (ws: WebSocket) => {
      ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString('utf-8'));
          if (waiters.length > 0) {
            const nextWaiter = waiters.shift()!;
            nextWaiter(parsed);
          } else {
            messageQueue.push(parsed);
          }
        } catch {
          // Ignore parse errors
        }
      });
    };

    const nextMessage = (): Promise<Record<string, unknown>> => {
      if (messageQueue.length > 0) {
        return Promise.resolve(messageQueue.shift()!);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for WS message')), 2500);
        waiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    };

    return { onInit, nextMessage };
  }

  afterEach(async () => {
    for (const ws of openSockets) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    openSockets.length = 0;
    if (app) {
      await app.close();
      app = null;
    }
  });

  it('authenticates via query parameter token and handles SUBSCRIBE, PING, and targeted room broadcasts', async () => {
    const mockDb = {} as unknown as PrismaClient;
    const testWsManager = new WebSocketManager();

    app = await buildServerApp({
      db: mockDb,
      wsManager: testWsManager,
    });
    await app.ready();

    // Sign a test JWT
    const token = app.jwt.sign({
      userId: 'athlete_hero_1',
      email: 'hero@gymify.io',
      username: 'WarriorVal',
    });

    // 1. Connect Client A with JWT in query string using injectWS
    const helperA = createClientHelper();
    const clientA = await app.injectWS(
      `/api/ws/connect?token=${encodeURIComponent(token)}`,
      {},
      { onInit: helperA.onInit }
    );
    openSockets.push(clientA);
    const handshakeA = await helperA.nextMessage();
    expect(handshakeA.type).toBe('CONNECTED');
    expect(handshakeA.authenticated).toBe(true);
    expect((handshakeA.user as Record<string, unknown>).username).toBe('WarriorVal');

    // 2. Connect Client B as unauthenticated guest
    const helperB = createClientHelper();
    const clientB = await app.injectWS('/api/ws/connect', {}, { onInit: helperB.onInit });
    openSockets.push(clientB);
    const handshakeB = await helperB.nextMessage();
    expect(handshakeB.type).toBe('CONNECTED');
    expect(handshakeB.authenticated).toBe(false);

    // 3. Client B authenticates via AUTH message
    clientB.send(JSON.stringify({ type: 'AUTH', token }));
    const authReplyB = await helperB.nextMessage();
    expect(authReplyB.type).toBe('AUTHENTICATED');
    expect((authReplyB.user as Record<string, unknown>).username).toBe('WarriorVal');

    // 4. Test PING / PONG
    clientA.send(JSON.stringify({ type: 'PING' }));
    const pongA = await helperA.nextMessage();
    expect(pongA.type).toBe('PONG');
    expect(typeof pongA.timestamp).toBe('number');

    // 5. Connect Client C and test room isolation
    const helperC = createClientHelper();
    const clientC = await app.injectWS('/api/ws/connect', {}, { onInit: helperC.onInit });
    openSockets.push(clientC);
    await helperC.nextMessage(); // Initial Handshake

    // Client A and B subscribe to raid:boss_1
    clientA.send(JSON.stringify({ type: 'SUBSCRIBE', room: 'raid:boss_1' }));
    const subA = await helperA.nextMessage();
    expect(subA.type).toBe('SUBSCRIBED');
    expect(subA.room).toBe('raid:boss_1');

    clientB.send(JSON.stringify({ type: 'SUBSCRIBE', room: 'raid:boss_1' }));
    const subB = await helperB.nextMessage();
    expect(subB.type).toBe('SUBSCRIBED');

    // Client C subscribes to a different room: raid:boss_2
    clientC.send(JSON.stringify({ type: 'SUBSCRIBE', room: 'raid:boss_2' }));
    const subC = await helperC.nextMessage();
    expect(subC.type).toBe('SUBSCRIBED');

    // Setup listener promises before triggering broadcast
    const promiseMsgA = helperA.nextMessage();
    const promiseMsgB = helperB.nextMessage();

    let clientCReceived = false;
    clientC.once('message', () => {
      clientCReceived = true;
    });

    // 6. Multicast RAID_HP_UPDATE to room `raid:boss_1`
    testWsManager.broadcastToRoom('raid:boss_1', {
      type: 'RAID_HP_UPDATE',
      raidId: 'boss_1',
      currentHp: 750000,
      maxHp: 1000000,
      isDefeated: false,
      attacker: {
        characterId: 'char_val',
        characterName: 'WarriorVal',
        damage: 45000,
      },
    });

    const [eventA, eventB] = await Promise.all([promiseMsgA, promiseMsgB]);

    expect(eventA.type).toBe('RAID_HP_UPDATE');
    expect(eventA.raidId).toBe('boss_1');
    expect(eventA.currentHp).toBe(750000);
    expect((eventA.attacker as Record<string, unknown>).damage).toBe(45000);

    expect(eventB.type).toBe('RAID_HP_UPDATE');
    expect(eventB.currentHp).toBe(750000);

    // Verify Client C did not receive the boss_1 message
    await new Promise((r) => setTimeout(r, 100));
    expect(clientCReceived).toBe(false);
  });

  it('broadcasts RAID_HP_UPDATE to subscribed clients when an attack is posted to REST endpoint', async () => {
    const raidId = 'raid_ignisrax_week1';
    const characterId = 'char_hero_123';

    const mockDb = {
      raidBossInstance: {
        findUnique: async () => ({
          id: raidId,
          bossSlug: 'ignisrax',
          bossName: 'Ignisrax the Sun-Scorched',
          bossTier: 3,
          accessType: 'PUBLIC_WORLD',
          maxHp: 10_000_000n,
          currentHp: 8_000_000n,
          status: 'ACTIVE',
        }),
        update: async ({ data }: { data: { currentHp: bigint; isDefeated: boolean } }) => ({
          id: raidId,
          bossName: 'Ignisrax the Sun-Scorched',
          maxHp: 10_000_000n,
          currentHp: data.currentHp,
          isDefeated: data.isDefeated,
        }),
      },
      character: {
        findUnique: async () => ({
          id: characterId,
          name: 'WarriorVal',
          stats: {
            strengthLevel: 10,
            enduranceLevel: 8,
            agilityLevel: 7,
          },
          guildMembership: null,
          talentUnlocks: [],
        }),
      },
      raidParticipantContribution: {
        findUnique: async () => null,
        upsert: async () => ({
          raidInstanceId: raidId,
          characterId,
          combatDamageDealt: 85_000n,
          supportScore: 12_800n,
          totalContributionScore: 97_800n,
          dailyAttacksUsed: 1,
        }),
      },
    } as unknown as PrismaClient;

    const testWsManager = new WebSocketManager();

    app = await buildServerApp({
      db: mockDb,
      wsManager: testWsManager,
    });
    await app.ready();

    // Connect a client and subscribe to this specific raid's room
    const helper = createClientHelper();
    const client = await app.injectWS('/api/ws/connect', {}, { onInit: helper.onInit });
    openSockets.push(client);
    await helper.nextMessage(); // Initial Handshake

    client.send(JSON.stringify({ type: 'SUBSCRIBE', room: `raid:${raidId}` }));
    const subRes = await helper.nextMessage();
    expect(subRes.type).toBe('SUBSCRIBED');

    // Setup listener promise before making REST attack call
    const eventPromise = helper.nextMessage();

    // Call REST endpoint POST /api/raids/:raidId/attack
    const attackRes = await app.inject({
      method: 'POST',
      url: `/api/raids/${raidId}/attack`,
      payload: { characterId },
    });

    expect(attackRes.statusCode).toBe(200);
    const attackBody = attackRes.json();
    expect(attackBody.combatDamage).toBeGreaterThan(0);

    // Verify WebSocket client received the live broadcast event
    const liveEvent = await eventPromise;
    expect(liveEvent.type).toBe('RAID_HP_UPDATE');
    expect(liveEvent.raidId).toBe(raidId);
    expect(liveEvent.room).toBe(`raid:${raidId}`);
    expect(typeof liveEvent.currentHp).toBe('number');
    expect((liveEvent.attacker as Record<string, unknown>).characterName).toBe('WarriorVal');
    expect((liveEvent.attacker as Record<string, unknown>).damage).toBe(attackBody.combatDamage);
  });
});
