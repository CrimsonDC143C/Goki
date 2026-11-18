import { PrismaClient } from '@goki/database';
import {
  CharacterRace,
  DEFAULT_GUILD_QUEST_CATALOG,
  GuildQuestWaveDefinition,
  MAX_COMPANY_ACTIVE_SQUAD_SIZE,
  TurnBasedCombatAction,
  TurnBasedCombatEvent,
  TurnBasedCombatState,
  TurnBasedPartyMemberInput,
  chooseTurnBasedAiAction,
  createTurnBasedEncounter,
  stepTurnBasedCombat,
} from '@goki/game-engine';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import {
  buildHeroPartyMember,
  loadCharacterForGuildEncounter,
  resolveQuestDefinition,
  upsertQuestIfSupported,
} from '../routes/adventurers-guild';
import { WebSocketClient, WebSocketManager } from './websocket-manager';

export const COMPANY_QUEST_ROOM_PREFIX = 'company-quest:';
export const DEFAULT_COOP_TURN_TIMEOUT_MS = 30_000;
export const MIN_COOP_TURN_TIMEOUT_MS = 50;
export const MAX_COOP_TURN_TIMEOUT_MS = 120_000;

export type CompanyQuestControlMode = 'PLAYER' | 'AI_TAKEOVER';
export type CompanyQuestRoomPhase = 'LOBBY' | 'IN_COMBAT' | 'COMPLETED';

export interface CompanyQuestParticipantView {
  squadSlot: number;
  characterId: string;
  characterName: string;
  userId: string;
  race?: CharacterRace;
  appearanceId?: string;
  connected: boolean;
  ready: boolean;
  controlMode: CompanyQuestControlMode;
}

export interface CompanyQuestSquadParticipant extends CompanyQuestParticipantView {
  partyInput: TurnBasedPartyMemberInput;
}

export interface CompanyQuestRoomSession {
  runId: string;
  room: string;
  companyId: string | null;
  questSlug: string;
  questTitle: string;
  waves: GuildQuestWaveDefinition[];
  seed: string;
  hostUserId: string;
  hostCharacterId: string;
  phase: CompanyQuestRoomPhase;
  turnTimeoutMs: number;
  turnDeadlineAt: number | null;
  participants: CompanyQuestSquadParticipant[];
  combatState: TurnBasedCombatState | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  persistedRunId: string | null;
}

export interface CompanyQuestLobbySnapshot {
  runId: string;
  room: string;
  companyId: string | null;
  questSlug: string;
  questTitle: string;
  phase: CompanyQuestRoomPhase;
  hostUserId: string;
  hostCharacterId: string;
  turnTimeoutMs: number;
  turnDeadlineAt: number | null;
  connectedCount: number;
  readyCount: number;
  allConnectedReady: boolean;
  participants: CompanyQuestParticipantView[];
}

const partyMemberFallbackSchema = z
  .object({
    characterId: z.string().min(1).optional(),
    name: z.string().min(1).max(60).optional(),
    race: z.enum(['HUMAN', 'ONI', 'KITSUNE']).optional(),
    appearanceId: z.string().optional(),
    customizationConfig: z.any().optional(),
    equippedLoadout: z.any().optional(),
    coreStats: z
      .object({
        strengthLevel: z.number().min(1).max(500).default(1),
        enduranceLevel: z.number().min(1).max(500).default(1),
        agilityLevel: z.number().min(1).max(500).default(1),
        dexLevel: z.number().min(1).max(500).default(1),
        conLevel: z.number().min(1).max(500).default(1),
        wisLevel: z.number().min(1).max(500).default(1),
        sprLevel: z.number().min(1).max(500).default(1),
      })
      .optional(),
    equipmentBonuses: z.record(z.any()).optional(),
    equipmentPrimaryStatBonuses: z.record(z.any()).optional(),
    unlockedTalentRanks: z.record(z.number()).optional(),
    activeSkillIds: z.array(z.string()).max(4).optional(),
    beltSlots: z
      .array(
        z.object({
          itemSlug: z.string().nullable(),
          charges: z.number().int().min(0).max(5),
        })
      )
      .max(4)
      .optional(),
    systemicFatigueStacks: z.number().min(0).max(10).optional(),
  })
  .optional();

const joinPayloadSchema = z.object({
  room: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  characterId: z.string().min(1),
  characterName: z.string().min(1).max(60).optional(),
  questSlug: z.string().min(1).optional(),
  turnTimeoutMs: z.number().int().optional(),
  seed: z.string().min(1).optional(),
  partyMember: partyMemberFallbackSchema,
});

const readyPayloadSchema = z.object({
  room: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  characterId: z.string().min(1).optional(),
  ready: z.boolean().default(true),
  startIfAllReady: z.boolean().optional(),
});

const startPayloadSchema = z.object({
  room: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
});

const playerCombatActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('BASIC_ATTACK'),
    actorId: z.string().optional(),
    targetId: z.string().optional(),
  }),
  z.object({
    type: z.literal('GUARD'),
    actorId: z.string().optional(),
  }),
  z.object({
    type: z.literal('USE_SKILL'),
    actorId: z.string().optional(),
    skillId: z.string().min(1),
    targetId: z.string().optional(),
  }),
  z.object({
    type: z.literal('USE_CONSUMABLE'),
    actorId: z.string().optional(),
    beltSlotIndex: z.number().int().min(0).max(3),
    targetId: z.string().optional(),
  }),
]);

const actionPayloadSchema = z.object({
  room: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  action: playerCombatActionSchema,
});

const stateRequestSchema = z.object({
  room: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
});

/**
 * Extracts `runId` from a `company-quest:{runId}` room name, or returns null.
 */
export function parseCompanyQuestRoom(room: string): string | null {
  const trimmed = room.trim();
  if (!trimmed.startsWith(COMPANY_QUEST_ROOM_PREFIX)) return null;
  const runId = trimmed.slice(COMPANY_QUEST_ROOM_PREFIX.length).trim();
  if (!runId || !/^[A-Za-z0-9_.:-]+$/.test(runId)) return null;
  return runId;
}

export function formatCompanyQuestRoom(runId: string): string {
  return `${COMPANY_QUEST_ROOM_PREFIX}${runId.trim()}`;
}

function clampTurnTimeoutMs(raw?: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_COOP_TURN_TIMEOUT_MS;
  }
  return Math.max(MIN_COOP_TURN_TIMEOUT_MS, Math.min(MAX_COOP_TURN_TIMEOUT_MS, Math.floor(raw)));
}

function resolveRunIdFromInput(input: { room?: string; runId?: string }): string | null {
  if (input.runId && input.runId.trim()) {
    const clean = input.runId.trim();
    return /^[A-Za-z0-9_.:-]+$/.test(clean) ? clean : null;
  }
  if (input.room) {
    return parseCompanyQuestRoom(input.room);
  }
  return null;
}

function toParticipantView(p: CompanyQuestSquadParticipant): CompanyQuestParticipantView {
  return {
    squadSlot: p.squadSlot,
    characterId: p.characterId,
    characterName: p.characterName,
    userId: p.userId,
    race: p.race,
    appearanceId: p.appearanceId,
    connected: p.connected,
    ready: p.ready,
    controlMode: p.controlMode,
  };
}

function buildFallbackPartyMember(params: {
  characterId: string;
  userId: string;
  username: string;
  characterName?: string;
  snapshot?: z.infer<typeof partyMemberFallbackSchema>;
}): TurnBasedPartyMemberInput {
  const snap = params.snapshot;
  return {
    characterId: params.characterId,
    name: snap?.name ?? params.characterName ?? params.username ?? 'Adventurer',
    controller: 'PLAYER',
    ownerUserId: params.userId,
    race: snap?.race ?? 'HUMAN',
    appearanceId: snap?.appearanceId ?? 'oni_warlord',
    customizationConfig: snap?.customizationConfig,
    equippedLoadout: snap?.equippedLoadout,
    coreStats: snap?.coreStats ?? {
      strengthLevel: 5,
      enduranceLevel: 5,
      agilityLevel: 5,
      dexLevel: 4,
      conLevel: 5,
      wisLevel: 4,
      sprLevel: 4,
    },
    equipmentBonuses: snap?.equipmentBonuses,
    equipmentPrimaryStatBonuses: snap?.equipmentPrimaryStatBonuses,
    unlockedTalentRanks: snap?.unlockedTalentRanks ?? {},
    activeSkillIds: snap?.activeSkillIds ?? [],
    beltSlots: snap?.beltSlots ?? [
      { itemSlug: 'sunleaf_healing_draught', charges: 2 },
      { itemSlug: null, charges: 0 },
      { itemSlug: null, charges: 0 },
      { itemSlug: null, charges: 0 },
    ],
    systemicFatigueStacks: snap?.systemicFatigueStacks ?? 0,
  };
}

/**
 * Authoritative WebSocket coordinator for live Adventurer Company co-op quests (`company-quest:{runId}`).
 * Hosts `stepTurnBasedCombat` for up to 4 active squadmates with lobby readiness, turn timers, and AI takeover.
 */
export class CompanyQuestCoopManager {
  private sessions = new Map<string, CompanyQuestRoomSession>();
  private roomOperationQueues = new Map<string, Promise<void>>();
  private dbUnavailableUntilMs = 0;
  private unbindLeave: () => void;
  private unbindShutdown: () => void;

  constructor(
    private wsManager: WebSocketManager,
    private db?: PrismaClient
  ) {
    this.unbindLeave = this.wsManager.onLeaveRoom((client, room, reason) => {
      this.handleClientLeftRoom(client, room, reason);
    });
    this.unbindShutdown = this.wsManager.onShutdown(() => {
      this.disposeAllSessions();
    });
  }

  public dispose(): void {
    this.unbindLeave();
    this.unbindShutdown();
    this.disposeAllSessions();
  }

  public disposeAllSessions(): void {
    for (const session of this.sessions.values()) {
      this.clearTurnTimer(session);
    }
    this.sessions.clear();
    this.roomOperationQueues.clear();
  }

  private enqueueForRoom<T>(runId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.roomOperationQueues.get(runId) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(task);
    const tail = next.then(
      () => undefined,
      () => undefined
    );
    this.roomOperationQueues.set(runId, tail);
    void tail.finally(() => {
      if (this.roomOperationQueues.get(runId) === tail) {
        this.roomOperationQueues.delete(runId);
      }
    });
    return next;
  }

  public getSession(runId: string): CompanyQuestRoomSession | undefined {
    return this.sessions.get(runId);
  }

  public listActiveSessions(): CompanyQuestLobbySnapshot[] {
    return Array.from(this.sessions.values()).map((session) => this.buildLobbySnapshot(session));
  }

  public async createOrPrepareLobby(params: {
    runId: string;
    questSlug?: string;
    hostUserId: string;
    hostCharacterId: string;
    hostUsername?: string;
    hostCharacterName?: string;
    turnTimeoutMs?: number;
    seed?: string;
    partyMember?: z.infer<typeof partyMemberFallbackSchema>;
  }): Promise<{ ok: true; session: CompanyQuestRoomSession } | { ok: false; error: string }> {
    const existing = this.sessions.get(params.runId);
    if (existing) {
      return { ok: true, session: existing };
    }

    const questSlug = params.questSlug ?? DEFAULT_GUILD_QUEST_CATALOG[0]!.questSlug;
    const dbQuest =
      this.db && Date.now() >= this.dbUnavailableUntilMs
        ? await this.safeDbCall(() => resolveQuestDefinition(this.db!, questSlug))
        : null;
    const quest =
      dbQuest ??
      DEFAULT_GUILD_QUEST_CATALOG.find((q) => q.questSlug === questSlug) ??
      null;

    if (!quest) {
      return { ok: false, error: `Guild quest '${questSlug}' not found.` };
    }

    const resolvedHost = await this.resolveParticipantPartyInput({
      characterId: params.hostCharacterId,
      userId: params.hostUserId,
      username: params.hostUsername ?? 'Adventurer',
      characterName: params.hostCharacterName,
      snapshot: params.partyMember,
    });
    if (!resolvedHost.ok) {
      return { ok: false, error: resolvedHost.error };
    }

    const participants: CompanyQuestSquadParticipant[] = [];
    const slottedRoster = resolvedHost.companySquad;
    const hostRosterEntry = slottedRoster.find((m) => m.characterId === params.hostCharacterId);

    const hostSlot = hostRosterEntry?.squadSlot ?? 1;
    participants.push({
      squadSlot: hostSlot,
      characterId: resolvedHost.partyInput.characterId,
      characterName: resolvedHost.partyInput.name,
      userId: params.hostUserId,
      race: resolvedHost.partyInput.race,
      appearanceId: resolvedHost.partyInput.appearanceId,
      connected: false,
      ready: false,
      controlMode: 'PLAYER',
      partyInput: resolvedHost.partyInput,
    });

    // Pre-register offline slotted Company squadmates under AI takeover so 4-player squads launch seamlessly
    for (const member of slottedRoster) {
      if (member.characterId === params.hostCharacterId) continue;
      if (participants.length >= MAX_COMPANY_ACTIVE_SQUAD_SIZE) break;
      participants.push({
        squadSlot: member.squadSlot,
        characterId: member.partyInput.characterId,
        characterName: member.partyInput.name,
        userId: member.userId,
        race: member.partyInput.race,
        appearanceId: member.partyInput.appearanceId,
        connected: false,
        ready: true,
        controlMode: 'AI_TAKEOVER',
        partyInput: member.partyInput,
      });
    }

    participants.sort((a, b) => a.squadSlot - b.squadSlot);

    const session: CompanyQuestRoomSession = {
      runId: params.runId,
      room: formatCompanyQuestRoom(params.runId),
      companyId: resolvedHost.companyId,
      questSlug: quest.questSlug,
      questTitle: quest.title,
      waves: quest.waves,
      seed: params.seed ?? `coop:${params.runId}:${quest.questSlug}`,
      hostUserId: params.hostUserId,
      hostCharacterId: params.hostCharacterId,
      phase: 'LOBBY',
      turnTimeoutMs: clampTurnTimeoutMs(params.turnTimeoutMs),
      turnDeadlineAt: null,
      participants,
      combatState: null,
      turnTimer: null,
      persistedRunId: null,
    };

    this.sessions.set(params.runId, session);
    return { ok: true, session };
  }

  public async handleJoin(socket: WebSocket, rawPayload: Record<string, unknown>): Promise<void> {
    const client = this.requireAuthenticatedClient(socket);
    if (!client) return;

    const parsed = joinPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      this.sendError(socket, 'Invalid COMPANY_QUEST_JOIN payload.');
      return;
    }

    const data = parsed.data;
    const runId = resolveRunIdFromInput(data);
    if (!runId) {
      this.sendError(socket, 'Missing or invalid company-quest runId.');
      return;
    }

    await this.enqueueForRoom(runId, async () => {
      const room = formatCompanyQuestRoom(runId);
      let session = this.sessions.get(runId);

      if (!session) {
        const created = await this.createOrPrepareLobby({
          runId,
          questSlug: data.questSlug,
          hostUserId: client.user!.userId,
          hostCharacterId: data.characterId,
          hostUsername: client.user!.username,
          hostCharacterName: data.characterName,
          turnTimeoutMs: data.turnTimeoutMs,
          seed: data.seed,
          partyMember: data.partyMember,
        });
        if (!created.ok) {
          this.sendError(socket, created.error);
          return;
        }
        session = created.session;
      }

      const joinRes = await this.attachParticipantToSession(session, client, data);
      if (!joinRes.ok) {
        this.sendError(socket, joinRes.error);
        return;
      }

      this.wsManager.joinRoom(socket, room);

      if (session.phase === 'LOBBY') {
        this.broadcastLobbyState(session);
        return;
      }

      // Reconnected during active or completed combat
      this.wsManager.sendToSocket(socket, {
        type: 'COMPANY_QUEST_STATE_UPDATE',
        ...this.buildCombatPayload(session, []),
      });
    });
  }

  public async handleReady(socket: WebSocket, rawPayload: Record<string, unknown>): Promise<void> {
    const client = this.requireAuthenticatedClient(socket);
    if (!client) return;

    const parsed = readyPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      this.sendError(socket, 'Invalid COMPANY_QUEST_READY payload.');
      return;
    }

    const session = this.findClientSession(client, parsed.data);
    if (!session) {
      this.sendError(socket, 'Company quest room not found.');
      return;
    }

    await this.enqueueForRoom(session.runId, async () => {
      if (session.phase !== 'LOBBY') {
        this.sendError(socket, 'Cannot toggle readiness after combat has started.');
        return;
      }

      const participant = this.findParticipantForClient(session, client, parsed.data.characterId);
      if (!participant) {
        this.sendError(socket, 'You are not an active squadmate in this room.');
        return;
      }

      participant.connected = true;
      participant.controlMode = 'PLAYER';
      participant.ready = parsed.data.ready;

      this.broadcastLobbyState(session);

      if (parsed.data.startIfAllReady && this.allConnectedReady(session)) {
        await this.startEncounter(session);
      }
    });
  }

  public async handleStart(socket: WebSocket, rawPayload: Record<string, unknown>): Promise<void> {
    const client = this.requireAuthenticatedClient(socket);
    if (!client) return;

    const parsed = startPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      this.sendError(socket, 'Invalid COMPANY_QUEST_START payload.');
      return;
    }

    const session = this.findClientSession(client, parsed.data);
    if (!session) {
      this.sendError(socket, 'Company quest room not found.');
      return;
    }

    await this.enqueueForRoom(session.runId, async () => {
      if (session.phase !== 'LOBBY') {
        this.sendError(socket, 'Encounter has already started.');
        return;
      }

      const participant = this.findParticipantForClient(session, client);
      if (!participant) {
        this.sendError(socket, 'Join the squad lobby before starting the quest.');
        return;
      }

      if (!this.allConnectedReady(session)) {
        this.sendError(socket, 'All connected squadmates must be ready before starting.');
        return;
      }

      await this.startEncounter(session);
    });
  }

  public async handleAction(socket: WebSocket, rawPayload: Record<string, unknown>): Promise<void> {
    const client = this.requireAuthenticatedClient(socket);
    if (!client) return;

    const parsed = actionPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      this.sendError(socket, 'Invalid COMPANY_QUEST_ACTION payload.');
      return;
    }

    const session = this.findClientSession(client, parsed.data);
    if (!session) {
      this.sendError(socket, 'Company quest room not found.');
      return;
    }

    await this.enqueueForRoom(session.runId, async () => {
      if (session.phase !== 'IN_COMBAT' || !session.combatState || session.combatState.status !== 'IN_PROGRESS') {
        this.sendError(socket, 'Company quest combat is not active.');
        return;
      }

      const activeUnitId = session.combatState.activeUnitId;
      const activeParticipant = session.participants.find((p) => p.characterId === activeUnitId);
      if (
        session.combatState.phase !== 'AWAITING_PLAYER_ACTION' ||
        !activeParticipant ||
        activeParticipant.userId !== client.user!.userId
      ) {
        this.sendError(socket, 'Not your turn to act.');
        return;
      }

      activeParticipant.connected = true;
      activeParticipant.controlMode = 'PLAYER';

      const action: TurnBasedCombatAction = {
        ...parsed.data.action,
        actorId: activeUnitId ?? undefined,
      };

      const stepRes = stepTurnBasedCombat(session.combatState, action);
      if (!stepRes.valid) {
        this.sendError(socket, stepRes.error ?? 'Invalid combat action.');
        return;
      }

      this.clearTurnTimer(session);
      session.combatState = stepRes.state;
      const events: TurnBasedCombatEvent[] = [...stepRes.events];

      this.advanceNonHumanTurns(session, events);
      const completed = this.finalizeOrArmTurn(session);
      await this.persistRunCheckpoint(session);

      this.broadcastCombatState(session, events);
      if (completed) {
        this.broadcastCompleted(session);
      }
    });
  }

  public handleStateRequest(socket: WebSocket, rawPayload: Record<string, unknown>): void {
    const client = this.requireAuthenticatedClient(socket);
    if (!client) return;

    const parsed = stateRequestSchema.safeParse(rawPayload);
    if (!parsed.success) {
      this.sendError(socket, 'Invalid COMPANY_QUEST_STATE_REQUEST payload.');
      return;
    }

    const session = this.findClientSession(client, parsed.data);
    if (!session) {
      this.sendError(socket, 'Company quest room not found.');
      return;
    }

    this.sendCurrentSnapshotToSocket(socket, session);
  }

  public handleSocketSubscribed(socket: WebSocket, room: string): void {
    const runId = parseCompanyQuestRoom(room);
    if (!runId) return;
    const session = this.sessions.get(runId);
    if (!session) return;

    const client = this.wsManager.getClient(socket);
    if (client?.user) {
      const existingParticipant = session.participants.find((p) => p.userId === client.user!.userId);
      if (existingParticipant) {
        existingParticipant.connected = true;
        if (session.phase === 'IN_COMBAT') {
          existingParticipant.controlMode = 'PLAYER';
        }
      }
    }

    this.sendCurrentSnapshotToSocket(socket, session);
  }

  private async attachParticipantToSession(
    session: CompanyQuestRoomSession,
    client: WebSocketClient,
    data: z.infer<typeof joinPayloadSchema>
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const userId = client.user!.userId;
    const existingByCharOrUser = session.participants.find(
      (p) => p.characterId === data.characterId || p.userId === userId
    );

    if (existingByCharOrUser) {
      if (existingByCharOrUser.userId !== userId) {
        return { ok: false, error: 'Character slot is controlled by another player.' };
      }
      const wasDisconnectedInCombat =
        session.phase === 'IN_COMBAT' && !existingByCharOrUser.connected;
      const wasDisconnectedInLobby =
        session.phase === 'LOBBY' && !existingByCharOrUser.connected;
      existingByCharOrUser.connected = true;
      existingByCharOrUser.controlMode = 'PLAYER';
      if (wasDisconnectedInLobby) {
        existingByCharOrUser.ready = false;
      }
      if (wasDisconnectedInCombat) {
        this.wsManager.broadcastToRoom(session.room, {
          type: 'COMPANY_QUEST_STATE_UPDATE',
          ...this.buildCombatPayload(session, []),
        });
      }
      return { ok: true };
    }

    if (session.phase !== 'LOBBY') {
      return { ok: false, error: 'Encounter already in progress; only existing squadmates may reconnect.' };
    }

    if (session.participants.length >= MAX_COMPANY_ACTIVE_SQUAD_SIZE) {
      return {
        ok: false,
        error: `Squad room is full (max ${MAX_COMPANY_ACTIVE_SQUAD_SIZE} Adventurer Company squadmates).`,
      };
    }

    const resolved = await this.resolveParticipantPartyInput({
      characterId: data.characterId,
      userId,
      username: client.user!.username,
      characterName: data.characterName,
      snapshot: data.partyMember,
    });
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }

    if (session.companyId && resolved.companyId && resolved.companyId !== session.companyId) {
      return {
        ok: false,
        error: 'Only members of the host Adventurer Company may join this quest room.',
      };
    }

    const usedSlots = new Set(session.participants.map((p) => p.squadSlot));
    let nextSlot = 1;
    while (usedSlots.has(nextSlot) && nextSlot <= MAX_COMPANY_ACTIVE_SQUAD_SIZE) {
      nextSlot += 1;
    }
    if (nextSlot > MAX_COMPANY_ACTIVE_SQUAD_SIZE) {
      return {
        ok: false,
        error: `Squad room is full (max ${MAX_COMPANY_ACTIVE_SQUAD_SIZE} Adventurer Company squadmates).`,
      };
    }

    session.participants.push({
      squadSlot: nextSlot,
      characterId: resolved.partyInput.characterId,
      characterName: resolved.partyInput.name,
      userId,
      race: resolved.partyInput.race,
      appearanceId: resolved.partyInput.appearanceId,
      connected: true,
      ready: false,
      controlMode: 'PLAYER',
      partyInput: resolved.partyInput,
    });
    session.participants.sort((a, b) => a.squadSlot - b.squadSlot);

    return { ok: true };
  }

  private async resolveParticipantPartyInput(params: {
    characterId: string;
    userId: string;
    username: string;
    characterName?: string;
    snapshot?: z.infer<typeof partyMemberFallbackSchema>;
  }): Promise<
    | {
        ok: true;
        userId: string;
        companyId: string | null;
        partyInput: TurnBasedPartyMemberInput;
        companySquad: Array<{
          squadSlot: number;
          userId: string;
          characterId: string;
          partyInput: TurnBasedPartyMemberInput;
        }>;
      }
    | { ok: false; error: string }
  > {
    let dbCharacter: any = null;
    if (typeof (this.db as any)?.character?.findUnique === 'function') {
      dbCharacter = await this.safeDbCall(() =>
        loadCharacterForGuildEncounter(this.db!, params.characterId)
      );
    }

    if (dbCharacter) {
      if (dbCharacter.deletedAt) {
        return { ok: false, error: 'Character is archived and cannot join co-op combat.' };
      }
      if (dbCharacter.userId !== params.userId) {
        return { ok: false, error: 'Forbidden: You do not own this character.' };
      }
    }

    const partyInput = dbCharacter
      ? buildHeroPartyMember(dbCharacter)
      : buildFallbackPartyMember({
          characterId: params.characterId,
          userId: params.userId,
          username: params.username,
          characterName: params.characterName,
          snapshot: params.snapshot,
        });

    let companyId: string | null = null;
    const companySquad: Array<{
      squadSlot: number;
      userId: string;
      characterId: string;
      partyInput: TurnBasedPartyMemberInput;
    }> = [];

    if (typeof (this.db as any)?.adventurerCompanyMember?.findUnique === 'function') {
      const membership = await this.safeDbCall<any>(() =>
        (this.db as any).adventurerCompanyMember.findUnique({
          where: { characterId: params.characterId },
          include: {
            company: {
              include: {
                members: {
                  where: { activeSquadSlot: { not: null } },
                  orderBy: { activeSquadSlot: 'asc' },
                  include: {
                    character: {
                      include: {
                        stats: true,
                        fatigueState: true,
                        talentUnlocks: { include: { talentNode: true } },
                        inventoryItems: { include: { item: true } },
                        equipmentLoadout: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      );
      if (membership?.companyId) {
        companyId = String(membership.companyId);
        for (const m of membership.company?.members ?? []) {
          if (typeof m.activeSquadSlot === 'number' && m.character && !m.character.deletedAt) {
            companySquad.push({
              squadSlot: m.activeSquadSlot,
              userId: m.character.userId,
              characterId: m.character.id,
              partyInput: buildHeroPartyMember(m.character),
            });
          }
        }
      }
    }

    return {
      ok: true,
      userId: params.userId,
      companyId,
      partyInput,
      companySquad,
    };
  }

  private async startEncounter(session: CompanyQuestRoomSession): Promise<void> {
    const orderedParticipants = [...session.participants]
      .sort((a, b) => a.squadSlot - b.squadSlot)
      .slice(0, MAX_COMPANY_ACTIVE_SQUAD_SIZE);

    const party: TurnBasedPartyMemberInput[] = orderedParticipants.map((p) => ({
      ...p.partyInput,
      controller: 'PLAYER',
      ownerUserId: p.userId,
    }));

    const initialState = createTurnBasedEncounter({
      encounterId: session.runId,
      questSlug: session.questSlug,
      questTitle: session.questTitle,
      roomChannelId: session.room,
      party,
      waves: session.waves,
      seed: session.seed,
    });

    session.phase = 'IN_COMBAT';
    session.combatState = initialState;
    const events: TurnBasedCombatEvent[] = [...initialState.lastStepEvents];

    this.advanceNonHumanTurns(session, events);
    const completed = this.finalizeOrArmTurn(session);
    await this.createOrCheckpointRunRecord(session);

    this.wsManager.broadcastToRoom(session.room, {
      type: 'COMPANY_QUEST_STARTED',
      ...this.buildCombatPayload(session, events),
    });

    if (completed) {
      this.broadcastCompleted(session);
    }
  }

  private advanceNonHumanTurns(
    session: CompanyQuestRoomSession,
    collectedEvents: TurnBasedCombatEvent[]
  ): void {
    const maxAutoSteps = 64;
    for (let i = 0; i < maxAutoSteps; i++) {
      const state = session.combatState;
      if (!state || state.status !== 'IN_PROGRESS') break;

      if (state.phase === 'AWAITING_AI_TURN') {
        const res = stepTurnBasedCombat(state, { type: 'AUTO_AI_TURN' });
        if (!res.valid) break;
        session.combatState = res.state;
        collectedEvents.push(...res.events);
        continue;
      }

      if (state.phase === 'AWAITING_PLAYER_ACTION' && state.activeUnitId) {
        const owner = session.participants.find((p) => p.characterId === state.activeUnitId);
        const humanControl = Boolean(owner && owner.connected && owner.controlMode === 'PLAYER');
        if (humanControl) {
          break;
        }

        const aiAction = chooseTurnBasedAiAction(state, state.activeUnitId);
        const res = stepTurnBasedCombat(state, aiAction);
        if (!res.valid) break;
        session.combatState = res.state;
        collectedEvents.push(...res.events);
        continue;
      }

      break;
    }
  }

  private finalizeOrArmTurn(session: CompanyQuestRoomSession): boolean {
    const state = session.combatState;
    if (!state || state.status !== 'IN_PROGRESS') {
      this.clearTurnTimer(session);
      session.phase = 'COMPLETED';
      session.turnDeadlineAt = null;
      return true;
    }
    this.armTurnTimer(session);
    return false;
  }

  private armTurnTimer(session: CompanyQuestRoomSession): void {
    this.clearTurnTimer(session);

    const state = session.combatState;
    if (!state || state.status !== 'IN_PROGRESS' || state.phase !== 'AWAITING_PLAYER_ACTION') {
      return;
    }
    const activeUnitId = state.activeUnitId;
    if (!activeUnitId) return;

    const owner = session.participants.find((p) => p.characterId === activeUnitId);
    if (!owner || !owner.connected || owner.controlMode !== 'PLAYER') {
      return;
    }

    const expectedStepSeq = state.stepSeq;
    const expectedActorId = activeUnitId;

    session.turnDeadlineAt = Date.now() + session.turnTimeoutMs;
    session.turnTimer = setTimeout(() => {
      void this.handleTurnTimeout(session.runId, expectedStepSeq, expectedActorId);
    }, session.turnTimeoutMs);
    session.turnTimer.unref?.();
  }

  private clearTurnTimer(session: CompanyQuestRoomSession): void {
    if (session.turnTimer) {
      clearTimeout(session.turnTimer);
      session.turnTimer = null;
    }
    session.turnDeadlineAt = null;
  }

  private async handleTurnTimeout(
    runId: string,
    expectedStepSeq: number,
    expectedActorId: string
  ): Promise<void> {
    const session = this.sessions.get(runId);
    if (!session || session.phase !== 'IN_COMBAT') return;

    const state = session.combatState;
    if (
      !state ||
      state.status !== 'IN_PROGRESS' ||
      state.phase !== 'AWAITING_PLAYER_ACTION' ||
      state.stepSeq !== expectedStepSeq ||
      state.activeUnitId !== expectedActorId
    ) {
      return;
    }

    session.turnTimer = null;
    session.turnDeadlineAt = null;

    const aiAction = chooseTurnBasedAiAction(state, expectedActorId);
    const stepRes = stepTurnBasedCombat(state, aiAction);
    if (!stepRes.valid) return;

    session.combatState = stepRes.state;
    const events: TurnBasedCombatEvent[] = [...stepRes.events];

    this.advanceNonHumanTurns(session, events);
    const completed = this.finalizeOrArmTurn(session);
    await this.persistRunCheckpoint(session);

    this.wsManager.broadcastToRoom(session.room, {
      type: 'COMPANY_QUEST_TURN_TIMEOUT',
      runId: session.runId,
      actorId: expectedActorId,
      action: aiAction,
      turnTimeoutMs: session.turnTimeoutMs,
      turnDeadlineAt: session.turnDeadlineAt,
    });

    this.broadcastCombatState(session, events);
    if (completed) {
      this.broadcastCompleted(session);
    }
  }

  private handleClientLeftRoom(
    client: WebSocketClient,
    room: string,
    reason: 'unsubscribe' | 'disconnect'
  ): void {
    const runId = parseCompanyQuestRoom(room);
    if (!runId || !client.user) return;

    const session = this.sessions.get(runId);
    if (!session) return;

    // Keep player connected if they still hold another open socket in this room
    const userId = client.user.userId;
    const stillConnectedElsewhere = this.wsManager
      .getRoomClients(room)
      .some((other) => other.user?.userId === userId);
    if (stillConnectedElsewhere) return;

    const participant = session.participants.find((p) => p.userId === userId);
    if (!participant) return;

    participant.connected = false;
    participant.controlMode = 'AI_TAKEOVER';

    if (session.phase === 'LOBBY') {
      participant.ready = false;
      this.broadcastLobbyState(session);
      return;
    }

    if (session.phase === 'IN_COMBAT') {
      this.wsManager.broadcastToRoom(session.room, {
        type: 'COMPANY_QUEST_AI_TAKEOVER',
        runId: session.runId,
        characterId: participant.characterId,
        characterName: participant.characterName,
        userId: participant.userId,
        reason,
        participants: session.participants.map(toParticipantView),
      });

      if (
        session.combatState?.status === 'IN_PROGRESS' &&
        session.combatState.activeUnitId === participant.characterId
      ) {
        this.clearTurnTimer(session);
        const events: TurnBasedCombatEvent[] = [];
        this.advanceNonHumanTurns(session, events);
        const completed = this.finalizeOrArmTurn(session);
        void this.persistRunCheckpoint(session);

        this.broadcastCombatState(session, events);
        if (completed) {
          this.broadcastCompleted(session);
        }
      }
    }
  }

  private allConnectedReady(session: CompanyQuestRoomSession): boolean {
    const connected = session.participants.filter((p) => p.connected);
    return connected.length > 0 && connected.every((p) => p.ready);
  }

  private findClientSession(
    client: WebSocketClient,
    input: { room?: string; runId?: string }
  ): CompanyQuestRoomSession | undefined {
    const explicitRunId = resolveRunIdFromInput(input);
    if (explicitRunId) {
      return this.sessions.get(explicitRunId);
    }

    for (const room of client.rooms) {
      const runId = parseCompanyQuestRoom(room);
      if (runId && this.sessions.has(runId)) {
        return this.sessions.get(runId);
      }
    }
    return undefined;
  }

  private findParticipantForClient(
    session: CompanyQuestRoomSession,
    client: WebSocketClient,
    characterId?: string
  ): CompanyQuestSquadParticipant | undefined {
    const userId = client.user?.userId;
    if (!userId) return undefined;
    if (characterId) {
      return session.participants.find(
        (p) => p.characterId === characterId && p.userId === userId
      );
    }
    return session.participants.find((p) => p.userId === userId);
  }

  private buildLobbySnapshot(session: CompanyQuestRoomSession): CompanyQuestLobbySnapshot {
    const connected = session.participants.filter((p) => p.connected);
    const readyCount = connected.filter((p) => p.ready).length;
    return {
      runId: session.runId,
      room: session.room,
      companyId: session.companyId,
      questSlug: session.questSlug,
      questTitle: session.questTitle,
      phase: session.phase,
      hostUserId: session.hostUserId,
      hostCharacterId: session.hostCharacterId,
      turnTimeoutMs: session.turnTimeoutMs,
      turnDeadlineAt: session.turnDeadlineAt,
      connectedCount: connected.length,
      readyCount,
      allConnectedReady: this.allConnectedReady(session),
      participants: session.participants.map(toParticipantView),
    };
  }

  private buildCombatPayload(
    session: CompanyQuestRoomSession,
    events: TurnBasedCombatEvent[]
  ): Record<string, unknown> {
    return {
      runId: session.runId,
      companyId: session.companyId,
      questSlug: session.questSlug,
      questTitle: session.questTitle,
      phase: session.phase,
      turnTimeoutMs: session.turnTimeoutMs,
      turnDeadlineAt: session.turnDeadlineAt,
      participants: session.participants.map(toParticipantView),
      combatState: session.combatState,
      events,
    };
  }

  private broadcastLobbyState(session: CompanyQuestRoomSession): void {
    this.wsManager.broadcastToRoom(session.room, {
      type: 'COMPANY_QUEST_LOBBY_STATE',
      ...this.buildLobbySnapshot(session),
    });
  }

  private broadcastCombatState(
    session: CompanyQuestRoomSession,
    events: TurnBasedCombatEvent[]
  ): void {
    this.wsManager.broadcastToRoom(session.room, {
      type: 'COMPANY_QUEST_STATE_UPDATE',
      ...this.buildCombatPayload(session, events),
    });
  }

  private broadcastCompleted(session: CompanyQuestRoomSession): void {
    this.wsManager.broadcastToRoom(session.room, {
      type: 'COMPANY_QUEST_COMPLETED',
      runId: session.runId,
      questSlug: session.questSlug,
      questTitle: session.questTitle,
      status: session.combatState?.status ?? 'DEFEAT',
      participants: session.participants.map(toParticipantView),
      combatState: session.combatState,
    });
  }

  private sendCurrentSnapshotToSocket(socket: WebSocket, session: CompanyQuestRoomSession): void {
    if (session.phase === 'LOBBY') {
      this.wsManager.sendToSocket(socket, {
        type: 'COMPANY_QUEST_LOBBY_STATE',
        ...this.buildLobbySnapshot(session),
      });
      return;
    }

    this.wsManager.sendToSocket(socket, {
      type: 'COMPANY_QUEST_STATE_UPDATE',
      ...this.buildCombatPayload(session, []),
    });
  }

  private requireAuthenticatedClient(socket: WebSocket): WebSocketClient | null {
    const client = this.wsManager.getClient(socket);
    if (!client?.user) {
      this.sendError(socket, 'Authentication required for Company co-op combat.');
      return null;
    }
    return client;
  }

  private sendError(socket: WebSocket, message: string): void {
    this.wsManager.sendToSocket(socket, {
      type: 'ERROR',
      error: message,
      message,
    });
  }

  private async safeDbCall<T>(fn: () => Promise<T>, timeoutMs = 450): Promise<T | null> {
    if (!this.db || Date.now() < this.dbUnavailableUntilMs) {
      return null;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('DB_QUERY_TIMEOUT'));
        }, timeoutMs);
        timer.unref?.();
      });

      return await Promise.race([fn(), timeoutPromise]);
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      const message = err instanceof Error ? err.message : '';
      if (
        message === 'DB_QUERY_TIMEOUT' ||
        name.includes('PrismaClientInitializationError') ||
        message.includes("Can't reach database server")
      ) {
        this.dbUnavailableUntilMs = Date.now() + 30_000;
      }
      return null;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async createOrCheckpointRunRecord(session: CompanyQuestRoomSession): Promise<void> {
    if (!this.db || !session.combatState || Date.now() < this.dbUnavailableUntilMs) return;
    if (typeof (this.db as any).guildQuestRun?.create !== 'function') return;
    if (typeof (this.db as any).character?.findUnique !== 'function') return;

    const hostChar = await this.safeDbCall<any>(() =>
      (this.db as any).character.findUnique({
        where: { id: session.hostCharacterId },
        select: { id: true },
      })
    );
    if (!hostChar) return;

    const quest = await this.safeDbCall(() => resolveQuestDefinition(this.db!, session.questSlug));
    if (!quest) return;
    const persistedQuestId = await this.safeDbCall(() => upsertQuestIfSupported(this.db!, quest));
    if (!persistedQuestId) return;

    const created = await this.safeDbCall<any>(() =>
      (this.db as any).guildQuestRun.create({
        data: {
          clientRunId: session.runId,
          questId: persistedQuestId,
          characterId: session.hostCharacterId,
          status:
            session.combatState!.status === 'VICTORY'
              ? 'VICTORY'
              : session.combatState!.status === 'DEFEAT'
                ? 'DEFEAT'
                : 'IN_PROGRESS',
          randomSeed: session.seed,
          companionIds: session.participants.slice(1).map((p) => p.characterId) as any,
          partySnapshot: session.participants.map((p) => p.partyInput) as any,
          checkpointState: session.combatState as any,
          actionLog: session.combatState!.actionLog as any,
          wavesCleared:
            session.combatState!.currentWaveIndex +
            (session.combatState!.status === 'VICTORY' ? 1 : 0),
          totalTurns: session.combatState!.turnNumber,
          consumablesUsed: session.combatState!.consumablesUsed as any,
        },
      })
    );
    if (created?.id) {
      session.persistedRunId = String(created.id);
    }
  }

  private async persistRunCheckpoint(session: CompanyQuestRoomSession): Promise<void> {
    if (
      !this.db ||
      !session.persistedRunId ||
      !session.combatState ||
      Date.now() < this.dbUnavailableUntilMs
    ) {
      return;
    }
    if (typeof (this.db as any).guildQuestRun?.update !== 'function') return;

    await this.safeDbCall(() =>
      (this.db as any).guildQuestRun.update({
        where: { id: session.persistedRunId },
        data: {
          status:
            session.combatState!.status === 'VICTORY'
              ? 'VICTORY'
              : session.combatState!.status === 'DEFEAT'
                ? 'DEFEAT'
                : 'IN_PROGRESS',
          checkpointState: session.combatState as any,
          actionLog: session.combatState!.actionLog as any,
          wavesCleared:
            session.combatState!.currentWaveIndex +
            (session.combatState!.status === 'VICTORY' ? 1 : 0),
          totalTurns: session.combatState!.turnNumber,
          consumablesUsed: session.combatState!.consumablesUsed as any,
          ...(session.combatState!.status !== 'IN_PROGRESS' ? { completedAt: new Date() } : {}),
        },
      })
    );
  }
}
