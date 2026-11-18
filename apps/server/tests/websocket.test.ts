import { PrismaClient } from '@goki/database';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildServerApp } from '../src/app';
import { WebSocketManager, safeSerializeWsPayload } from '../src/services/websocket-manager';

describe('WebSocketManager (Room PubSub & BigInt Safe Serialization)', () => {
  it('safely serializes BigInt values into JSON numbers without throwing, and preserves unsafe BigInts (> 2^53 - 1) as strings', () => {
    const unsafeBigInt = 9_007_199_254_740_993n; // 2^53 + 1
    const payload = {
      type: 'RAID_HP_UPDATE',
      bossId: 'malakor',
      maxHp: 10_000_000n,
      currentHp: 8_750_000n,
      delta: 125_000n,
      colossalWorldBossHp: unsafeBigInt,
    };

    const serialized = safeSerializeWsPayload(payload);
    const parsed = JSON.parse(serialized);

    expect(parsed.maxHp).toBe(10_000_000);
    expect(parsed.currentHp).toBe(8_750_000);
    expect(parsed.delta).toBe(125_000);
    expect(parsed.colossalWorldBossHp).toBe('9007199254740993');
  });

  it('tracks socket liveness and terminates unresponsive sockets during sweepLiveness', () => {
    const manager = new WebSocketManager(0);
    let pingCount = 0;
    let terminated = false;
    let pongHandler: (() => void) | undefined;

    const mockLiveSocket = {
      readyState: 1,
      send: () => {},
      ping: () => {
        pingCount += 1;
      },
      on: (event: string, cb: () => void) => {
        if (event === 'pong') pongHandler = cb;
      },
    } as unknown as WebSocket;

    const mockDeadSocket = {
      readyState: 1,
      send: () => {},
      ping: () => {},
      terminate: () => {
        terminated = true;
      },
    } as unknown as WebSocket;

    const clientLive = manager.registerClient(mockLiveSocket);
    const clientDead = manager.registerClient(mockDeadSocket);
    manager.joinRoom(mockDeadSocket, 'raid:all');

    expect(clientLive.isAlive).toBe(true);
    expect(clientDead.isAlive).toBe(true);

    // 1st sweep marks both as false and sends ping
    manager.sweepLiveness();
    expect(pingCount).toBe(1);
    expect(clientLive.isAlive).toBe(false);
    expect(clientDead.isAlive).toBe(false);

    // Live socket responds with pong
    pongHandler?.();
    expect(clientLive.isAlive).toBe(true);

    // 2nd sweep terminates dead socket and removes it from rooms/registry
    manager.sweepLiveness();
    expect(terminated).toBe(true);
    expect(manager.getClientCount()).toBe(1);
    expect(manager.getRoomCount()).toBe(0);
    manager.shutdown();
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
      email: 'hero@gokirpg.com',
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

    // 7. Unauthenticated Client C cannot subscribe to private dungeon/guild/character rooms
    clientC.send(JSON.stringify({ type: 'SUBSCRIBE', room: 'dungeon:private_run_99' }));
    const privateErr = await helperC.nextMessage();
    expect(privateErr.type).toBe('ERROR');
    expect(privateErr.error).toBe('Authentication required to subscribe to private rooms.');

    // Authenticated Client A CAN subscribe to private dungeon rooms
    clientA.send(JSON.stringify({ type: 'SUBSCRIBE', room: 'dungeon:private_run_99' }));
    const privateOk = await helperA.nextMessage();
    expect(privateOk.type).toBe('SUBSCRIBED');
    expect(privateOk.room).toBe('dungeon:private_run_99');
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
          userId: 'user_ws_hero_1',
          deletedAt: null,
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
    const token = app.jwt.sign({
      userId: 'user_ws_hero_1',
      email: 'hero@gokirpg.com',
      username: 'WarriorVal',
    });

    // Call REST endpoint POST /api/raids/:raidId/attack
    const attackRes = await app.inject({
      method: 'POST',
      url: `/api/raids/${raidId}/attack`,
      headers: { authorization: `Bearer ${token}` },
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

describe('Company Quest Real-Time Co-op Rooms (company-quest:{runId})', () => {
  let app: Awaited<ReturnType<typeof buildServerApp>> | null = null;
  const openSockets: WebSocket[] = [];

  function createMatcherClient() {
    const buffer: Record<string, unknown>[] = [];
    const waiters: Array<{
      predicate: (msg: Record<string, unknown>) => boolean;
      resolve: (msg: Record<string, unknown>) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }> = [];

    const onInit = (ws: WebSocket) => {
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString('utf-8')) as Record<string, unknown>;
          const idx = waiters.findIndex((w) => w.predicate(msg));
          if (idx >= 0) {
            const matched = waiters.splice(idx, 1)[0]!;
            clearTimeout(matched.timer);
            matched.resolve(msg);
          } else {
            buffer.push(msg);
          }
        } catch {
          // Ignore non-JSON frames
        }
      });
    };

    const waitFor = (
      predicate: (msg: Record<string, unknown>) => boolean,
      timeoutMs = 3000,
      label = 'matching WebSocket event'
    ): Promise<Record<string, unknown>> => {
      const bufIdx = buffer.findIndex(predicate);
      if (bufIdx >= 0) {
        return Promise.resolve(buffer.splice(bufIdx, 1)[0]!);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = waiters.findIndex((w) => w.resolve === resolve);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`Timeout waiting for ${label}; buffered=${JSON.stringify(buffer.map((b) => b.type))}`));
        }, timeoutMs);
        waiters.push({ predicate, resolve, reject, timer });
      });
    };

    return { onInit, waitFor };
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

  async function connectAuthed(
    serverApp: NonNullable<typeof app>,
    user: { userId: string; email: string; username: string }
  ) {
    const token = serverApp.jwt.sign(user);
    const helper = createMatcherClient();
    const ws = await serverApp.injectWS(
      `/api/ws/connect?token=${encodeURIComponent(token)}`,
      {},
      { onInit: helper.onInit }
    );
    openSockets.push(ws);
    await helper.waitFor((m) => m.type === 'CONNECTED');
    return { ws, helper };
  }

  it('supports up to 4 Adventurer Company squadmates, rejects a 5th player, enforces lobby readiness, and starts combat', async () => {
    const mockDb = {} as unknown as PrismaClient;
    const testWsManager = new WebSocketManager(0);
    app = await buildServerApp({ db: mockDb, wsManager: testWsManager });
    await app.ready();

    const runId = 'coop_cap_run_1';
    const room = `company-quest:${runId}`;

    const c1 = await connectAuthed(app, { userId: 'u1', email: 'u1@goki.gg', username: 'Hero1' });
    const c2 = await connectAuthed(app, { userId: 'u2', email: 'u2@goki.gg', username: 'Hero2' });
    const c3 = await connectAuthed(app, { userId: 'u3', email: 'u3@goki.gg', username: 'Hero3' });
    const c4 = await connectAuthed(app, { userId: 'u4', email: 'u4@goki.gg', username: 'Hero4' });
    const c5 = await connectAuthed(app, { userId: 'u5', email: 'u5@goki.gg', username: 'Hero5' });

    for (const [idx, c] of [c1, c2, c3, c4].entries()) {
      const joinedPromise = c.helper.waitFor(
        (m) =>
          m.type === 'COMPANY_QUEST_LOBBY_STATE' &&
          Array.isArray(m.participants) &&
          m.participants.length === idx + 1
      );
      c.ws.send(
        JSON.stringify({
          type: 'COMPANY_QUEST_JOIN',
          room,
          runId,
          characterId: `char_${idx + 1}`,
          characterName: `Vanguard${idx + 1}`,
          questSlug: 'guild_contract_crypt_patrol',
        })
      );
      await joinedPromise;
    }

    // 5th player cannot join full 4-player squad
    const fullErrPromise = c5.helper.waitFor((m) => m.type === 'ERROR');
    c5.ws.send(
      JSON.stringify({
        type: 'COMPANY_QUEST_JOIN',
        room,
        runId,
        characterId: 'char_5',
        characterName: 'ExtraPlayer',
      })
    );
    const fullErr = await fullErrPromise;
    expect(String(fullErr.message)).toContain('full');

    // Cannot start while squadmates are unready
    const notReadyErrPromise = c1.helper.waitFor((m) => m.type === 'ERROR');
    c1.ws.send(JSON.stringify({ type: 'COMPANY_QUEST_START', room, runId }));
    const notReadyErr = await notReadyErrPromise;
    expect(String(notReadyErr.message)).toContain('ready');

    // Ready up all 4 connected squadmates
    for (const [idx, c] of [c1, c2, c3, c4].entries()) {
      const readyPromise = c1.helper.waitFor(
        (m) =>
          m.type === 'COMPANY_QUEST_LOBBY_STATE' &&
          Number(m.readyCount) === idx + 1
      );
      c.ws.send(
        JSON.stringify({
          type: 'COMPANY_QUEST_READY',
          room,
          runId,
          characterId: `char_${idx + 1}`,
          ready: true,
        })
      );
      await readyPromise;
    }

    const startP1 = c1.helper.waitFor((m) => m.type === 'COMPANY_QUEST_STARTED');
    const startP4 = c4.helper.waitFor((m) => m.type === 'COMPANY_QUEST_STARTED');
    c1.ws.send(JSON.stringify({ type: 'COMPANY_QUEST_START', room, runId }));

    const [started1, started4] = await Promise.all([startP1, startP4]);
    const combatState1 = started1.combatState as { units: Array<{ side: string; unitId: string }> };
    const combatState4 = started4.combatState as { units: Array<{ side: string; unitId: string }> };
    expect(combatState1.units.filter((u) => u.side === 'PARTY')).toHaveLength(4);
    expect(combatState4.units.filter((u) => u.side === 'PARTY')).toHaveLength(4);
  });

  it('hosts authoritative stepTurnBasedCombat actions, rejects out-of-turn inputs, and enforces turn countdown timers', async () => {
    const mockDb = {} as unknown as PrismaClient;
    const testWsManager = new WebSocketManager(0);
    app = await buildServerApp({ db: mockDb, wsManager: testWsManager });
    await app.ready();

    const runId = 'coop_timer_run_2';
    const room = `company-quest:${runId}`;

    const c1 = await connectAuthed(app, { userId: 'tu1', email: 'tu1@goki.gg', username: 'SwiftHero' });
    const c2 = await connectAuthed(app, { userId: 'tu2', email: 'tu2@goki.gg', username: 'HeavyHero' });

    c1.ws.send(
      JSON.stringify({
        type: 'COMPANY_QUEST_JOIN',
        room,
        runId,
        characterId: 'char_fast',
        characterName: 'SwiftHero',
        questSlug: 'guild_contract_crypt_patrol',
        turnTimeoutMs: 120,
        partyMember: {
          coreStats: {
            strengthLevel: 6,
            enduranceLevel: 6,
            agilityLevel: 30,
            dexLevel: 10,
            conLevel: 6,
            wisLevel: 4,
            sprLevel: 4,
          },
        },
      })
    );
    await c1.helper.waitFor((m) => m.type === 'COMPANY_QUEST_LOBBY_STATE');

    c2.ws.send(
      JSON.stringify({
        type: 'COMPANY_QUEST_JOIN',
        room,
        runId,
        characterId: 'char_slow',
        characterName: 'HeavyHero',
        partyMember: {
          coreStats: {
            strengthLevel: 8,
            enduranceLevel: 8,
            agilityLevel: 2,
            dexLevel: 2,
            conLevel: 8,
            wisLevel: 2,
            sprLevel: 2,
          },
        },
      })
    );
    await c2.helper.waitFor(
      (m) =>
        m.type === 'COMPANY_QUEST_LOBBY_STATE' &&
        Array.isArray(m.participants) &&
        m.participants.length === 2
    );

    c1.ws.send(JSON.stringify({ type: 'COMPANY_QUEST_READY', room, runId, ready: true }));
    c2.ws.send(JSON.stringify({ type: 'COMPANY_QUEST_READY', room, runId, ready: true }));
    await c1.helper.waitFor((m) => m.type === 'COMPANY_QUEST_LOBBY_STATE' && m.allConnectedReady === true);

    const startedPromise = c1.helper.waitFor((m) => m.type === 'COMPANY_QUEST_STARTED');
    c1.ws.send(JSON.stringify({ type: 'COMPANY_QUEST_START', room, runId }));
    const started = await startedPromise;
    const initCombat = started.combatState as { activeUnitId: string; stepSeq: number };
    expect(initCombat.activeUnitId).toBe('char_fast');

    // Out-of-turn player cannot act
    const turnErrPromise = c2.helper.waitFor((m) => m.type === 'ERROR');
    c2.ws.send(
      JSON.stringify({
        type: 'COMPANY_QUEST_ACTION',
        room,
        runId,
        action: { type: 'GUARD' },
      })
    );
    const turnErr = await turnErrPromise;
    expect(String(turnErr.message)).toContain('Not your turn');

    // Active player executes GUARD -> server steps & arms timer
    const stepPromise = c2.helper.waitFor((m) => m.type === 'COMPANY_QUEST_STATE_UPDATE');
    c1.ws.send(
      JSON.stringify({
        type: 'COMPANY_QUEST_ACTION',
        room,
        runId,
        action: { type: 'GUARD' },
      })
    );
    const stepped = await stepPromise;
    const steppedCombat = stepped.combatState as { stepSeq: number; status: string };
    expect(steppedCombat.stepSeq).toBeGreaterThan(initCombat.stepSeq);

    // Wait for 120ms turn timer to fire automatically without player input
    if (steppedCombat.status === 'IN_PROGRESS') {
      const timeoutEvt = await c1.helper.waitFor(
        (m) => m.type === 'COMPANY_QUEST_TURN_TIMEOUT',
        2000
      );
      expect(timeoutEvt.runId).toBe(runId);
      const afterTimeout = await c1.helper.waitFor(
        (m) =>
          m.type === 'COMPANY_QUEST_STATE_UPDATE' &&
          (m.combatState as { stepSeq: number }).stepSeq > steppedCombat.stepSeq,
        2000,
        'COMPANY_QUEST_STATE_UPDATE after timeout'
      );
      expect((afterTimeout.combatState as { stepSeq: number }).stepSeq).toBeGreaterThan(
        steppedCombat.stepSeq
      );
    }
  });

  it('triggers automatic AI takeover on disconnect and restores PLAYER control on reconnect', async () => {
    const mockDb = {} as unknown as PrismaClient;
    const testWsManager = new WebSocketManager(0);
    app = await buildServerApp({ db: mockDb, wsManager: testWsManager });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const wsBase = address.replace(/^http/i, 'ws');

    const connectRealWs = async (user: { userId: string; email: string; username: string }) => {
      const token = app!.jwt.sign(user);
      const helper = createMatcherClient();
      const ws = new WebSocket(`${wsBase}/api/ws/connect?token=${encodeURIComponent(token)}`);
      helper.onInit(ws);
      openSockets.push(ws);
      await helper.waitFor((m) => m.type === 'CONNECTED', 3000, 'CONNECTED');
      return { ws, helper };
    };

    const runId = 'coop_disconnect_run_3';
    const room = `company-quest:${runId}`;

    const c1 = await connectRealWs({ userId: 'du1', email: 'du1@goki.gg', username: 'LeadHero' });
    const c2 = await connectRealWs({ userId: 'du2', email: 'du2@goki.gg', username: 'AllyHero' });

    c1.ws.send(
      JSON.stringify({
        type: 'COMPANY_QUEST_JOIN',
        room,
        runId,
        characterId: 'char_lead',
        characterName: 'LeadHero',
        questSlug: 'guild_contract_crypt_patrol',
        partyMember: {
          coreStats: {
            strengthLevel: 6,
            enduranceLevel: 6,
            agilityLevel: 28,
            dexLevel: 8,
            conLevel: 6,
            wisLevel: 4,
            sprLevel: 4,
          },
        },
      })
    );
    await c1.helper.waitFor((m) => m.type === 'COMPANY_QUEST_LOBBY_STATE');

    c2.ws.send(
      JSON.stringify({
        type: 'COMPANY_QUEST_JOIN',
        room,
        runId,
        characterId: 'char_ally',
        characterName: 'AllyHero',
        partyMember: {
          coreStats: {
            strengthLevel: 6,
            enduranceLevel: 6,
            agilityLevel: 4,
            dexLevel: 4,
            conLevel: 6,
            wisLevel: 4,
            sprLevel: 4,
          },
        },
      })
    );
    await c2.helper.waitFor(
      (m) =>
        m.type === 'COMPANY_QUEST_LOBBY_STATE' &&
        Array.isArray(m.participants) &&
        m.participants.length === 2
    );

    c1.ws.send(JSON.stringify({ type: 'COMPANY_QUEST_READY', room, runId, ready: true }));
    c2.ws.send(JSON.stringify({ type: 'COMPANY_QUEST_READY', room, runId, ready: true }));
    await c1.helper.waitFor((m) => m.type === 'COMPANY_QUEST_LOBBY_STATE' && m.allConnectedReady === true);

    const startP2 = c2.helper.waitFor((m) => m.type === 'COMPANY_QUEST_STARTED');
    c1.ws.send(JSON.stringify({ type: 'COMPANY_QUEST_START', room, runId }));
    const started = await startP2;
    const initCombat = started.combatState as { activeUnitId: string; stepSeq: number };
    expect(initCombat.activeUnitId).toBe('char_lead');

    // Disconnect active player mid-turn -> AI takes over immediately and advances turn
    const takeoverP2 = c2.helper.waitFor((m) => m.type === 'COMPANY_QUEST_AI_TAKEOVER', 3000, 'takeoverP2');
    const stateUpdateP2 = c2.helper.waitFor(
      (m) =>
        m.type === 'COMPANY_QUEST_STATE_UPDATE' &&
        (m.combatState as { stepSeq: number }).stepSeq > initCombat.stepSeq,
      3000,
      'stateUpdateP2'
    );
    c1.ws.close();

    const [takeoverEvt, updatedEvt] = await Promise.all([takeoverP2, stateUpdateP2]);
    expect(takeoverEvt.characterId).toBe('char_lead');
    expect((updatedEvt.combatState as { stepSeq: number }).stepSeq).toBeGreaterThan(
      initCombat.stepSeq
    );

    // Reconnect user du1 and verify controlMode returns to PLAYER
    const c1Reconnected = await connectRealWs({
      userId: 'du1',
      email: 'du1@goki.gg',
      username: 'LeadHero',
    });
    const rejoinSnapPromise = c1Reconnected.helper.waitFor(
      (m) => m.type === 'COMPANY_QUEST_STATE_UPDATE'
    );
    c1Reconnected.ws.send(
      JSON.stringify({
        type: 'COMPANY_QUEST_JOIN',
        room,
        runId,
        characterId: 'char_lead',
        characterName: 'LeadHero',
      })
    );
    const rejoinSnap = await rejoinSnapPromise;
    const leadParticipant = (
      rejoinSnap.participants as Array<{ characterId: string; controlMode: string; connected: boolean }>
    ).find((p) => p.characterId === 'char_lead');
    expect(leadParticipant?.connected).toBe(true);
    expect(leadParticipant?.controlMode).toBe('PLAYER');
  });
});
