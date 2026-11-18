import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ADVENTURER_COMPANY_AI_PRESETS,
  DEFAULT_GUILD_QUEST_CATALOG,
  GuildQuestDefinition,
  LootDrop,
  MAX_COMPANY_ACTIVE_SQUAD_SIZE,
  TurnBasedCombatAction,
  TurnBasedCombatState,
  isGuildQuestUnlockedForRank,
} from '@goki/game-engine';
import {
  type CoopParticipantView,
  type CoopRoomPhase,
  type WebSocketStatus,
  gokiWebSocket,
} from '../api/websocketClient';
import { CombatLoadoutSelector } from '../components/character';
import { RpgIcon } from '../components/icons/RpgIcon';
import { NpcActionChip, NpcDialogueOverlay } from '../components/npc';
import {
  HairlineDivider,
  HubSceneBackdrop,
  HubSceneHeaderSlot,
  SegmentedControl,
  SegmentedOption,
  SlateSection,
} from '../components/ui';
import { AdventurerRank, useGame } from '../state/GameContext';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../theme';
import { TurnBasedArenaScreen } from './Battle/TurnBasedArenaScreen';
import { DungeonScreen } from './DungeonScreen';

export type AdventureSubView = 'EXPEDITIONS' | 'GUILD_QUESTS';
export type GuildNpcMode = 'DESK' | 'BRIEFING' | 'DEBRIEF';

const SUB_OPTIONS: ReadonlyArray<SegmentedOption<AdventureSubView>> = [
  {
    key: 'EXPEDITIONS',
    label: 'Expeditions (24h)',
    icon: 'dungeon',
    testID: 'adventure-subtab-expeditions',
  },
  {
    key: 'GUILD_QUESTS',
    label: 'Guild Quests',
    icon: 'adventure',
    testID: 'adventure-subtab-quests',
  },
];

interface ActiveEncounterSession {
  state: TurnBasedCombatState;
  quest: GuildQuestDefinition;
  companionIds: string[];
  serverRunId?: string | null;
}

interface DebriefSummary {
  quest: GuildQuestDefinition;
  goldAwarded: number;
  reputationAwarded: number;
  drops: LootDrop[];
  promotedToRank: AdventurerRank | null;
  syncedOnline: boolean;
  queuedOffline: boolean;
}

interface CoopQuestRoomState {
  runId: string;
  room: string;
  questSlug: string;
  questTitle: string;
  phase: CoopRoomPhase;
  turnTimeoutMs: number;
  turnDeadlineAt: number | null;
  allConnectedReady: boolean;
  participants: CoopParticipantView[];
  combatState: TurnBasedCombatState | null;
}

export const AdventureHubScreen: React.FC = () => {
  const {
    activeCharacterId,
    adventurerRank,
    appearanceId,
    activeSkillLoadout,
    authToken,
    beltLoadout,
    characterName,
    customizationConfig,
    equipmentBonuses,
    equipmentLoadout,
    inventory,
    race,
    stats,
    unlockedTalentRanks,
    workoutsLoggedCount,
    guildQuests,
    completedGuildQuestSlugs,
    queuedOfflineGuildRuns,
    serverOnline,
    claimGuildFieldRations,
    startGuildQuestEncounter,
    completeGuildQuestEncounter,
    syncOfflineGuildRuns,
  } = useGame();

  const [subView, setSubView] = useState<AdventureSubView>('EXPEDITIONS');
  const [selectedCompanionIds, setSelectedCompanionIds] = useState<string[]>([
    'ally_lyra',
  ]);
  const [activeEncounter, setActiveEncounter] =
    useState<ActiveEncounterSession | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Real-Time WebSocket Co-op Lobby & Encounter State
  const [coopRunIdInput, setCoopRunIdInput] = useState('squad_alpha');
  const [coopRoomState, setCoopRoomState] = useState<CoopQuestRoomState | null>(null);
  const [coopError, setCoopError] = useState<string | null>(null);
  const [coopArenaError, setCoopArenaError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>(() => gokiWebSocket.getStatus());

  const localCharacterId = activeCharacterId ?? 'player_hero';

  // NPC Dialogue state
  const [receptionistOpen, setReceptionistOpen] = useState(false);
  const [npcMode, setNpcMode] = useState<GuildNpcMode>('DESK');
  const [briefingQuest, setBriefingQuest] = useState<GuildQuestDefinition | null>(
    null
  );
  const [deskFeedback, setDeskFeedback] = useState<string | null>(null);
  const [debriefSummary, setDebriefSummary] = useState<DebriefSummary | null>(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);

  const totalStatLevel = useMemo(
    () =>
      (stats.STRENGTH?.level ?? 1) +
      (stats.ENDURANCE?.level ?? 1) +
      (stats.AGILITY?.level ?? 1) +
      (stats.DEXTERITY?.level ?? 1) +
      (stats.CONSTITUTION?.level ?? 1) +
      (stats.WISDOM?.level ?? 1) +
      (stats.SPIRIT?.level ?? 1),
    [stats]
  );

  const rankUpTrials = useMemo(
    () => guildQuests.filter((q) => q.category === 'RANK_UP_TRIAL'),
    [guildQuests]
  );
  const liveQuests = useMemo(
    () => guildQuests.filter((q) => q.category === 'LIVE_QUEST'),
    [guildQuests]
  );

  const toggleCompanion = (companionId: string) => {
    setSelectedCompanionIds((prev) => {
      if (prev.includes(companionId)) {
        return prev.filter((id) => id !== companionId);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, companionId];
    });
  };

  const handleLaunchQuest = (questSlug: string) => {
    const res = startGuildQuestEncounter(questSlug, selectedCompanionIds);
    if (!res.ok || !res.state || !res.quest) {
      setLaunchError(res.error ?? 'Unable to embark on this quest.');
      return;
    }
    setLaunchError(null);
    setReceptionistOpen(false);
    setSubView('GUILD_QUESTS');
    setActiveEncounter({
      state: res.state,
      quest: res.quest,
      companionIds: [...selectedCompanionIds],
      serverRunId: res.serverRunId ?? null,
    });
  };

  const handleOpenBriefing = (quest: GuildQuestDefinition) => {
    setLaunchError(null);
    setBriefingQuest(quest);
    setNpcMode('BRIEFING');
    setReceptionistOpen(true);
  };

  const handleOpenDesk = () => {
    setDeskFeedback(null);
    setNpcMode('DESK');
    setReceptionistOpen(true);
  };

  const handleEncounterComplete = async (result: {
    finalState: TurnBasedCombatState;
    companionIds: string[];
    serverRunId?: string | null;
  }) => {
    const quest = activeEncounter?.quest;
    setActiveEncounter(null);
    const outcome = await completeGuildQuestEncounter(result);
    if (quest && result.finalState.status === 'VICTORY') {
      setDebriefSummary({
        quest,
        goldAwarded: outcome.goldAwarded,
        reputationAwarded: outcome.reputationAwarded,
        drops: outcome.drops,
        promotedToRank: outcome.promotedToRank,
        syncedOnline: outcome.syncedOnline,
        queuedOffline: outcome.queuedOffline,
      });
      setNpcMode('DEBRIEF');
      setReceptionistOpen(true);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncingNow(true);
    try {
      await syncOfflineGuildRuns();
    } finally {
      setIsSyncingNow(false);
    }
  };

  const activeCoopRunId = coopRoomState?.runId ?? null;
  const activeCoopRoom = coopRoomState?.room ?? null;
  const activeCoopRunIdRef = useRef<string | null>(null);
  activeCoopRunIdRef.current = activeCoopRunId;

  useEffect(() => {
    return gokiWebSocket.onStatusChange(setWsStatus);
  }, []);

  useEffect(() => {
    const unbind = gokiWebSocket.on('*', (evt: Record<string, unknown>) => {
      const targetRunId = activeCoopRunIdRef.current;
      const evtType = String(evt.type ?? '');
      if (evtType === 'ERROR') {
        if (!targetRunId) return;
        const msg = String(evt.error ?? evt.message ?? 'Co-op WebSocket request failed.');
        setCoopError(msg);
        setCoopArenaError(msg);
        return;
      }

      if (!targetRunId || evt.runId !== targetRunId) return;

      if (evtType === 'COMPANY_QUEST_LOBBY_STATE') {
        setCoopError(null);
        setCoopRoomState((prev) => ({
          runId: String(evt.runId),
          room: String(evt.room ?? `company-quest:${targetRunId}`),
          questSlug: String(evt.questSlug ?? prev?.questSlug ?? 'guild_contract_crypt_patrol'),
          questTitle: String(evt.questTitle ?? prev?.questTitle ?? 'Crypt Gate Patrol'),
          phase: (evt.phase as CoopRoomPhase) ?? 'LOBBY',
          turnTimeoutMs: Number(evt.turnTimeoutMs ?? 30000),
          turnDeadlineAt:
            typeof evt.turnDeadlineAt === 'number' ? evt.turnDeadlineAt : null,
          allConnectedReady: Boolean(evt.allConnectedReady),
          participants: Array.isArray(evt.participants)
            ? (evt.participants as CoopParticipantView[])
            : [],
          combatState: prev?.combatState ?? null,
        }));
      } else if (
        evtType === 'COMPANY_QUEST_STARTED' ||
        evtType === 'COMPANY_QUEST_STATE_UPDATE'
      ) {
        setCoopError(null);
        setCoopArenaError(null);
        setCoopRoomState((prev) => ({
          runId: String(evt.runId),
          room: String(evt.room ?? `company-quest:${targetRunId}`),
          questSlug: String(evt.questSlug ?? prev?.questSlug ?? 'guild_contract_crypt_patrol'),
          questTitle: String(evt.questTitle ?? prev?.questTitle ?? 'Crypt Gate Patrol'),
          phase: (evt.phase as CoopRoomPhase) ?? 'IN_COMBAT',
          turnTimeoutMs: Number(evt.turnTimeoutMs ?? prev?.turnTimeoutMs ?? 30000),
          turnDeadlineAt:
            typeof evt.turnDeadlineAt === 'number' ? evt.turnDeadlineAt : null,
          allConnectedReady: prev?.allConnectedReady ?? true,
          participants: Array.isArray(evt.participants)
            ? (evt.participants as CoopParticipantView[])
            : prev?.participants ?? [],
          combatState: (evt.combatState as TurnBasedCombatState) ?? prev?.combatState ?? null,
        }));
      } else if (evtType === 'COMPANY_QUEST_AI_TAKEOVER') {
        setCoopRoomState((prev) =>
          prev
            ? {
                ...prev,
                participants: Array.isArray(evt.participants)
                  ? (evt.participants as CoopParticipantView[])
                  : prev.participants,
              }
            : prev
        );
      } else if (evtType === 'COMPANY_QUEST_TURN_TIMEOUT') {
        setCoopRoomState((prev) =>
          prev
            ? {
                ...prev,
                turnDeadlineAt:
                  typeof evt.turnDeadlineAt === 'number' ? evt.turnDeadlineAt : null,
              }
            : prev
        );
      } else if (evtType === 'COMPANY_QUEST_COMPLETED') {
        setCoopRoomState((prev) =>
          prev
            ? {
                ...prev,
                phase: 'COMPLETED',
                turnDeadlineAt: null,
                participants: Array.isArray(evt.participants)
                  ? (evt.participants as CoopParticipantView[])
                  : prev.participants,
                combatState:
                  (evt.combatState as TurnBasedCombatState) ?? prev.combatState,
              }
            : prev
        );
      }
    });

    return () => {
      unbind();
    };
  }, []);

  const handleJoinCoopRoom = () => {
    const cleanRunId =
      coopRunIdInput.trim().replace(/[^A-Za-z0-9_.:-]/g, '') || 'squad_alpha';
    const room = `company-quest:${cleanRunId}`;
    const targetQuest =
      guildQuests.find((q) => q.questSlug === 'guild_contract_crypt_patrol') ??
      guildQuests[0] ??
      DEFAULT_GUILD_QUEST_CATALOG[0]!;

    activeCoopRunIdRef.current = cleanRunId;
    setCoopError(null);
    setCoopArenaError(null);
    setCoopRoomState({
      runId: cleanRunId,
      room,
      questSlug: targetQuest.questSlug,
      questTitle: targetQuest.title,
      phase: 'LOBBY',
      turnTimeoutMs: 30000,
      turnDeadlineAt: null,
      allConnectedReady: false,
      participants: [],
      combatState: null,
    });

    const beltSlots = beltLoadout.slice(0, 4).map((itemSlug) => {
      if (!itemSlug) return { itemSlug: null, charges: 0 };
      const ownedQty = inventory.find((i) => i.slug === itemSlug)?.quantity ?? 0;
      return { itemSlug, charges: Math.min(3, Math.max(0, ownedQty)) };
    });

    const partyMember = {
      characterId: localCharacterId,
      name: characterName || 'Adventurer',
      race,
      appearanceId,
      customizationConfig,
      equippedLoadout: equipmentLoadout,
      coreStats: {
        strengthLevel: stats.STRENGTH?.level ?? 1,
        enduranceLevel: stats.ENDURANCE?.level ?? 1,
        agilityLevel: stats.AGILITY?.level ?? 1,
        dexLevel: stats.DEXTERITY?.level ?? 1,
        conLevel: stats.CONSTITUTION?.level ?? 1,
        wisLevel: stats.WISDOM?.level ?? 1,
        sprLevel: stats.SPIRIT?.level ?? 1,
      },
      equipmentBonuses,
      unlockedTalentRanks,
      activeSkillIds: activeSkillLoadout,
      beltSlots,
    };

    if (authToken) {
      void gokiWebSocket.setAuthToken(authToken);
    }
    if (!gokiWebSocket.isConnected()) {
      void gokiWebSocket.connect();
    }
    gokiWebSocket.subscribe(room);
    gokiWebSocket.send({
      type: 'COMPANY_QUEST_JOIN',
      room,
      runId: cleanRunId,
      characterId: localCharacterId,
      characterName: characterName || 'Adventurer',
      questSlug: targetQuest.questSlug,
      partyMember,
    });
  };

  const handleToggleCoopReady = () => {
    if (!coopRoomState) return;
    const localMember = coopRoomState.participants.find(
      (p) => p.characterId === localCharacterId
    );
    gokiWebSocket.send({
      type: 'COMPANY_QUEST_READY',
      room: coopRoomState.room,
      runId: coopRoomState.runId,
      characterId: localCharacterId,
      ready: !(localMember?.ready ?? false),
    });
  };

  const handleStartCoopQuest = () => {
    if (!coopRoomState) return;
    gokiWebSocket.send({
      type: 'COMPANY_QUEST_START',
      room: coopRoomState.room,
      runId: coopRoomState.runId,
    });
  };

  const handleLeaveCoopRoom = () => {
    activeCoopRunIdRef.current = null;
    if (activeCoopRoom) {
      gokiWebSocket.unsubscribe(activeCoopRoom);
    }
    setCoopRoomState(null);
    setCoopError(null);
    setCoopArenaError(null);
  };

  const handleSendCoopAction = (action: TurnBasedCombatAction) => {
    if (!coopRoomState) return;
    gokiWebSocket.send({
      type: 'COMPANY_QUEST_ACTION',
      room: coopRoomState.room,
      runId: coopRoomState.runId,
      action,
    });
  };

  const resolvedBriefingQuest =
    briefingQuest ??
    guildQuests.find((q) => q.questSlug === 'guild_contract_crypt_patrol') ??
    guildQuests[0] ??
    null;

  const npcDialoguePages = useMemo<string[]>(() => {
    if (npcMode === 'BRIEFING' && resolvedBriefingQuest) {
      const companionNames = ADVENTURER_COMPANY_AI_PRESETS.filter((a) =>
        selectedCompanionIds.includes(a.characterId)
      )
        .map((a) => a.name.split(' ')[0])
        .join(', ');
      return [
        ...resolvedBriefingQuest.briefingLines,
        `Contract: ${resolvedBriefingQuest.title} (${resolvedBriefingQuest.waves.length} waves, Recommended Power ${resolvedBriefingQuest.recommendedPower}). Squad: ${companionNames || 'Solo'}.`,
      ];
    }

    if (npcMode === 'DEBRIEF' && debriefSummary) {
      const lines = [...debriefSummary.quest.victoryDebriefLines];
      const dropText =
        debriefSummary.drops.length > 0
          ? debriefSummary.drops.map((d) => `${d.quantity}x ${d.itemName}`).join(', ')
          : 'None';
      const rankLine = debriefSummary.promotedToRank
        ? ` Rank Promotion: ${debriefSummary.promotedToRank}!`
        : '';
      const syncLine = debriefSummary.syncedOnline
        ? 'Verified online with the Guild Ledger.'
        : 'Saved offline — queued for automatic Guild Ledger sync.';
      lines.push(
        `Spoils: +${debriefSummary.goldAwarded} Gold, +${debriefSummary.reputationAwarded} Rep. Loot: ${dropText}.${rankLine} ${syncLine}`
      );
      return lines;
    }

    const baseGreeting = `Welcome to the Adventurer's Guild, ${characterName || 'Adventurer'}. Your current standing is ${adventurerRank} Rank.`;
    if (deskFeedback) {
      return [deskFeedback, baseGreeting];
    }
    return [
      baseGreeting,
      'Need supplies before entering the arena? Claim Guild Field Rations, review a quest briefing, or inspect 24-hour Expeditions.',
    ];
  }, [
    adventurerRank,
    characterName,
    debriefSummary,
    deskFeedback,
    npcMode,
    resolvedBriefingQuest,
    selectedCompanionIds,
  ]);

  const npcActionChips = useMemo<NpcActionChip[]>(() => {
    if (npcMode === 'BRIEFING' && resolvedBriefingQuest) {
      return [
        {
          id: 'enter-arena',
          label: 'Enter Turn-Based Arena',
          icon: 'combat',
          variant: 'primary',
          testID: 'npc-chip-enter-arena',
          onPress: () => handleLaunchQuest(resolvedBriefingQuest.questSlug),
        },
        {
          id: 'back-desk',
          label: 'Back to Guild Desk',
          icon: 'chat',
          variant: 'subtle',
          onPress: () => setNpcMode('DESK'),
        },
      ];
    }

    if (npcMode === 'DEBRIEF') {
      return [
        {
          id: 'close-debrief',
          label: 'Return to Guild Board',
          icon: 'check',
          variant: 'primary',
          onPress: () => {
            setReceptionistOpen(false);
            setNpcMode('DESK');
          },
        },
      ];
    }

    const cryptQuest =
      guildQuests.find((q) => q.questSlug === 'guild_contract_crypt_patrol') ??
      guildQuests[0];

    return [
      {
        id: 'claim-rations',
        label: 'Claim Field Rations',
        icon: 'sparkles',
        variant: 'primary',
        testID: 'npc-chip-claim-rations',
        onPress: () => {
          const res = claimGuildFieldRations();
          setDeskFeedback(res.message);
        },
      },
      {
        id: 'brief-crypt',
        label: 'Brief Crypt Gate Patrol',
        icon: 'scroll',
        variant: 'subtle',
        testID: 'npc-chip-brief-crypt',
        onPress: () => {
          if (cryptQuest) {
            setBriefingQuest(cryptQuest);
          }
          setNpcMode('BRIEFING');
        },
      },
      {
        id: 'go-expeditions',
        label: '24h Expeditions',
        icon: 'dungeon',
        variant: 'subtle',
        testID: 'npc-chip-go-expeditions',
        onPress: () => {
          setReceptionistOpen(false);
          setSubView('EXPEDITIONS');
        },
      },
    ];
  }, [
    claimGuildFieldRations,
    guildQuests,
    npcMode,
    resolvedBriefingQuest,
  ]);

  const renderQuestCard = (q: GuildQuestDefinition) => {
    const rankUnlocked = isGuildQuestUnlockedForRank(q, adventurerRank);
    const reqWorkouts = q.trialRequirements?.workoutsLogged;
    const reqStatLvl = q.trialRequirements?.totalStatLevel;
    const workoutsMet =
      typeof reqWorkouts !== 'number' || workoutsLoggedCount >= reqWorkouts;
    const statsMet =
      typeof reqStatLvl !== 'number' || totalStatLevel >= reqStatLvl;
    const isUnlocked = rankUnlocked && workoutsMet && statsMet;
    const isCompleted = completedGuildQuestSlugs.includes(q.questSlug);
    const isTrial = q.category === 'RANK_UP_TRIAL';

    let gateReason: string | null = null;
    if (!rankUnlocked) {
      gateReason = `Requires ${q.requiredRank} Rank`;
    } else if (!workoutsMet && typeof reqWorkouts === 'number') {
      gateReason = `Log ${reqWorkouts} workouts (${workoutsLoggedCount}/${reqWorkouts})`;
    } else if (!statsMet && typeof reqStatLvl === 'number') {
      gateReason = `Total Stat Lv ${reqStatLvl} (${totalStatLevel}/${reqStatLvl})`;
    }

    return (
      <View
        key={q.questSlug}
        style={[styles.questCard, !isUnlocked && styles.questCardLocked]}
      >
        <View style={styles.questHeaderRow}>
          <View style={styles.questTitleCol}>
            <View style={styles.questBadgeRow}>
              <View style={[styles.rankPill, isTrial && styles.trialRankPill]}>
                <Text style={[styles.rankPillText, isTrial && styles.trialRankText]}>
                  {q.requiredRank}
                  {q.unlocksRank ? ` → ${q.unlocksRank}` : ''}
                </Text>
              </View>
              {isCompleted ? (
                <View style={styles.completedPill}>
                  <Text style={styles.completedPillText}>CLEARED</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.questTitle}>{q.title}</Text>
          </View>
          <View style={styles.powerPill}>
            <Text style={styles.powerPillText}>PWR {q.recommendedPower}</Text>
          </View>
        </View>

        <Text style={styles.questDesc}>{q.description}</Text>

        <View style={styles.questMetaRow}>
          <Text style={styles.questMetaText}>{q.waves.length} Waves</Text>
          <Text style={styles.questMetaDot}>•</Text>
          <Text style={[styles.questMetaText, { color: COLORS.gold }]}>
            +{q.goldReward} Gold
          </Text>
          <Text style={styles.questMetaDot}>•</Text>
          <Text style={[styles.questMetaText, { color: '#38BDF8' }]}>
            +{q.reputationReward} Rep
          </Text>
        </View>

        {gateReason ? (
          <View style={styles.gateBanner}>
            <RpgIcon name="lock" size={12} color={COLORS.warning} />
            <Text style={styles.gateBannerText}>{gateReason}</Text>
          </View>
        ) : null}

        <View style={styles.questActionsRow}>
          <TouchableOpacity
            style={styles.briefBtn}
            onPress={() => handleOpenBriefing(q)}
            activeOpacity={0.78}
            testID={`guild-quest-brief-${q.questSlug}`}
          >
            <RpgIcon name="scroll" size={13} color={COLORS.textPrimary} />
            <Text style={styles.briefBtnText}>Brief</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.embarkBtn, !isUnlocked && styles.embarkBtnDisabled]}
            disabled={!isUnlocked}
            onPress={() => handleLaunchQuest(q.questSlug)}
            activeOpacity={0.8}
            testID={`guild-quest-start-${q.questSlug}`}
          >
            <RpgIcon
              name="combat"
              size={14}
              color={isUnlocked ? SURFACES.canvas : COLORS.textMuted}
            />
            <Text
              style={[
                styles.embarkBtnText,
                !isUnlocked && styles.embarkBtnTextDisabled,
              ]}
            >
              {isTrial ? 'Start Trial' : 'Embark'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const adventureSlotId =
    subView === 'GUILD_QUESTS' ? 'adventure_guild_hall' : 'adventure_expedition_map';
  const activeCoopQuest = coopRoomState
    ? guildQuests.find((q) => q.questSlug === coopRoomState.questSlug) ??
      DEFAULT_GUILD_QUEST_CATALOG.find((q) => q.questSlug === coopRoomState.questSlug) ??
      guildQuests[0] ??
      DEFAULT_GUILD_QUEST_CATALOG[0]!
    : null;
  const localCoopParticipant = coopRoomState?.participants.find(
    (p) => p.characterId === localCharacterId
  );

  return (
    <View style={styles.root}>
      <HubSceneBackdrop slotId={adventureSlotId} />
      {/* Sub-View Bar + Guild Receptionist NPC */}
      <HubSceneHeaderSlot slotId={adventureSlotId} style={styles.topBar}>
        <View style={styles.segmentedWrap}>
          <SegmentedControl
            options={SUB_OPTIONS}
            value={subView}
            onChange={(next) => {
              if (next === 'EXPEDITIONS' && activeEncounter) {
                setActiveEncounter(null);
              }
              setSubView(next);
            }}
          />
        </View>
        <TouchableOpacity
          style={styles.npcBtn}
          onPress={handleOpenDesk}
          activeOpacity={0.75}
          testID="adventure-npc-btn"
        >
          <RpgIcon name="chat" size={14} color="#38BDF8" />
          <Text style={styles.npcBtnText}>Guild Desk</Text>
        </TouchableOpacity>
      </HubSceneHeaderSlot>

      <View style={styles.body}>
        {subView === 'EXPEDITIONS' ? (
          <DungeonScreen />
        ) : coopRoomState &&
          (coopRoomState.phase === 'IN_COMBAT' || coopRoomState.phase === 'COMPLETED') &&
          coopRoomState.combatState &&
          activeCoopQuest ? (
          <TurnBasedArenaScreen
            initialState={coopRoomState.combatState}
            quest={activeCoopQuest}
            companionIds={[]}
            serverRunId={coopRoomState.runId}
            coopSession={{
              room: coopRoomState.room,
              runId: coopRoomState.runId,
              localCharacterId,
              serverState: coopRoomState.combatState,
              turnDeadlineAt: coopRoomState.turnDeadlineAt,
              turnTimeoutMs: coopRoomState.turnTimeoutMs,
              participants: coopRoomState.participants,
              error: coopArenaError,
              onSendAction: handleSendCoopAction,
            }}
            onComplete={(res) => {
              handleLeaveCoopRoom();
              void handleEncounterComplete(res);
            }}
            onRetreat={handleLeaveCoopRoom}
          />
        ) : activeEncounter ? (
          <TurnBasedArenaScreen
            initialState={activeEncounter.state}
            quest={activeEncounter.quest}
            companionIds={activeEncounter.companionIds}
            serverRunId={activeEncounter.serverRunId}
            onComplete={(res) => void handleEncounterComplete(res)}
            onRetreat={() => setActiveEncounter(null)}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.hubScroll}>
            {/* Offline Sync Status Pill */}
            <View style={styles.syncStatusCard} testID="guild-offline-sync-badge">
              <View style={styles.syncLeftCol}>
                <RpgIcon
                  name={queuedOfflineGuildRuns.length > 0 ? 'refresh' : 'check'}
                  size={14}
                  color={
                    queuedOfflineGuildRuns.length > 0
                      ? COLORS.warning
                      : serverOnline
                      ? COLORS.success
                      : COLORS.textSecondary
                  }
                />
                <Text style={styles.syncStatusText}>
                  {queuedOfflineGuildRuns.length > 0
                    ? `${queuedOfflineGuildRuns.length} offline quest run${
                        queuedOfflineGuildRuns.length === 1 ? '' : 's'
                      } queued`
                    : serverOnline
                    ? 'Guild Ledger Synced'
                    : 'Offline Ready — Runs Queue Automatically'}
                </Text>
              </View>
              {queuedOfflineGuildRuns.length > 0 ? (
                <TouchableOpacity
                  style={styles.syncNowBtn}
                  onPress={() => void handleSyncNow()}
                  disabled={isSyncingNow}
                  activeOpacity={0.78}
                  testID="guild-offline-sync-now-btn"
                >
                  <Text style={styles.syncNowText}>
                    {isSyncingNow ? 'Syncing...' : 'Sync Now'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {launchError ? (
              <View style={styles.launchErrorBanner}>
                <Text style={styles.launchErrorText}>{launchError}</Text>
              </View>
            ) : null}

            {/* Adventurer Company Squad Staging */}
            <SlateSection
              level={1}
              eyebrow="ADVENTURER COMPANY SQUAD"
              title="Ally Companions"
              subtitle={`Bring up to 3 AI companions into turn-based combat (${selectedCompanionIds.length}/3 selected).`}
            >
              <View style={styles.companionsList}>
                {ADVENTURER_COMPANY_AI_PRESETS.map((ally) => {
                  const selected = selectedCompanionIds.includes(ally.characterId);
                  return (
                    <TouchableOpacity
                      key={ally.characterId}
                      style={[
                        styles.companionChip,
                        selected && styles.companionChipSelected,
                      ]}
                      onPress={() => toggleCompanion(ally.characterId)}
                      activeOpacity={0.78}
                      testID={`guild-companion-toggle-${ally.characterId}`}
                    >
                      <View style={styles.companionHeaderRow}>
                        <Text
                          style={[
                            styles.companionName,
                            selected && styles.companionNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {ally.name}
                        </Text>
                        <Text style={styles.companionRace}>{ally.race}</Text>
                      </View>
                      <Text style={styles.companionRole}>
                        {selected ? 'Active in Squad' : 'Tap to Recruit'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SlateSection>

            {/* Compact Combat Loadout Pre-Quest Staging */}
            <CombatLoadoutSelector compact />

            {/* Real-Time Company Co-op Quest Room */}
            <SlateSection
              level={1}
              eyebrow={`LIVE WEBSOCKET CO-OP • ${wsStatus.toUpperCase()}`}
              title="Adventurer Company Co-op Room"
              subtitle="Host or join a company-quest room for up to 4 active squadmates with turn timers and AI takeover."
            >
              <View style={styles.coopCard} testID="coop-quest-panel">
                {coopError ? (
                  <View style={styles.launchErrorBanner} testID="coop-error-banner">
                    <Text style={styles.launchErrorText}>{coopError}</Text>
                  </View>
                ) : null}

                {!coopRoomState ? (
                  <View style={styles.coopJoinRow}>
                    <TextInput
                      value={coopRunIdInput}
                      onChangeText={setCoopRunIdInput}
                      placeholder="Co-op Run ID (e.g. squad_alpha)"
                      placeholderTextColor={COLORS.textMuted}
                      style={styles.coopInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      testID="coop-run-id-input"
                    />
                    <TouchableOpacity
                      style={styles.coopJoinBtn}
                      onPress={handleJoinCoopRoom}
                      activeOpacity={0.82}
                      testID="coop-join-room-btn"
                    >
                      <RpgIcon name="social" size={14} color={SURFACES.canvas} />
                      <Text style={styles.coopJoinBtnText}>Join Co-op</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.coopLobbyWrap} testID="coop-lobby-card">
                    <View style={styles.coopLobbyHeader}>
                      <Text style={styles.coopRoomBadge} numberOfLines={1}>
                        {coopRoomState.room}
                      </Text>
                      <Text style={styles.coopQuestBadge} numberOfLines={1}>
                        {coopRoomState.questTitle}
                      </Text>
                    </View>

                    <View style={styles.coopSlotsGrid}>
                      {[1, 2, 3, 4].map((slotNum) => {
                        const member = coopRoomState.participants.find(
                          (p) => p.squadSlot === slotNum
                        );
                        return (
                          <View
                            key={slotNum}
                            style={styles.coopSlotCard}
                            testID={`coop-slot-${slotNum}`}
                          >
                            <Text style={styles.coopSlotEyebrow}>SLOT {slotNum}</Text>
                            {member ? (
                              <>
                                <Text style={styles.coopSlotName} numberOfLines={1}>
                                  {member.characterName}
                                </Text>
                                <Text
                                  style={[
                                    styles.coopSlotStatus,
                                    member.controlMode === 'AI_TAKEOVER'
                                      ? { color: COLORS.warning }
                                      : member.ready
                                        ? { color: COLORS.success }
                                        : { color: COLORS.textSecondary },
                                  ]}
                                >
                                  {member.controlMode === 'AI_TAKEOVER'
                                    ? 'AI Takeover'
                                    : member.ready
                                      ? 'Ready'
                                      : 'Waiting'}
                                </Text>
                              </>
                            ) : (
                              <Text style={styles.coopSlotEmpty}>Open Slot</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>

                    <View style={styles.coopLobbyActions}>
                      <TouchableOpacity
                        style={[
                          styles.coopReadyBtn,
                          localCoopParticipant?.ready && styles.coopReadyBtnActive,
                        ]}
                        onPress={handleToggleCoopReady}
                        activeOpacity={0.8}
                        testID="coop-ready-btn"
                      >
                        <Text
                          style={[
                            styles.coopReadyBtnText,
                            localCoopParticipant?.ready && styles.coopReadyBtnTextActive,
                          ]}
                        >
                          {localCoopParticipant?.ready ? 'Ready ✓' : 'Ready Up'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.coopStartBtn,
                          !coopRoomState.allConnectedReady && styles.coopStartBtnDisabled,
                        ]}
                        onPress={handleStartCoopQuest}
                        disabled={!coopRoomState.allConnectedReady}
                        activeOpacity={0.82}
                        testID="coop-start-btn"
                      >
                        <Text
                          style={[
                            styles.coopStartBtnText,
                            !coopRoomState.allConnectedReady && styles.coopStartBtnTextDisabled,
                          ]}
                        >
                          Start ({coopRoomState.participants.filter((p) => p.connected).length}/
                          {MAX_COMPANY_ACTIVE_SQUAD_SIZE})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.coopLeaveBtn}
                        onPress={handleLeaveCoopRoom}
                        activeOpacity={0.75}
                        testID="coop-leave-btn"
                      >
                        <Text style={styles.coopLeaveBtnText}>Leave</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </SlateSection>

            {/* Live Quests & Rank-Up Trials Board */}
            <SlateSection
              level={1}
              eyebrow={`ADVENTURER'S GUILD • RANK ${adventurerRank}`}
              title="Live Turn-Based Quests & Trials"
              subtitle="Zero stamina gate. Real-world workouts unlock trials and scale your tactical power."
            >
              {rankUpTrials.length > 0 ? (
                <View style={styles.questGroup}>
                  <Text style={styles.questGroupTitle}>RANK-UP TRIALS</Text>
                  <View style={styles.questList}>
                    {rankUpTrials.map(renderQuestCard)}
                  </View>
                </View>
              ) : null}

              <HairlineDivider spacing={SPACING.md} />

              <View style={styles.questGroup}>
                <Text style={styles.questGroupTitle}>LIVE GUILD CONTRACTS</Text>
                <View style={styles.questList}>
                  {liveQuests.map(renderQuestCard)}
                </View>
              </View>
            </SlateSection>
          </ScrollView>
        )}
      </View>

      <NpcDialogueOverlay
        visible={receptionistOpen}
        onClose={() => setReceptionistOpen(false)}
        npcId="GUILD_RECEPTIONIST"
        sceneSlotId="adventure_guild_hall"
        expression={
          npcMode === 'DEBRIEF'
            ? 'happy'
            : npcMode === 'BRIEFING'
              ? 'focused'
              : deskFeedback
                ? 'happy'
                : 'neutral'
        }
        dialoguePages={npcDialoguePages}
        actionChips={npcActionChips}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SURFACES.canvas,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: SURFACES.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACES.hairline,
  },
  segmentedWrap: {
    flex: 1,
  },
  npcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
  },
  npcBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
  },
  body: {
    flex: 1,
  },
  hubScroll: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  syncStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
  },
  syncLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  syncStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  syncNowBtn: {
    backgroundColor: COLORS.goldDim,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  syncNowText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.gold,
  },
  launchErrorBanner: {
    backgroundColor: COLORS.strengthDim,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(239, 83, 80, 0.4)',
  },
  launchErrorText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  companionsList: {
    gap: SPACING.sm,
  },
  companionChip: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
  },
  companionChipSelected: {
    backgroundColor: SURFACES.layer3,
    borderColor: SURFACES.goldHairline,
  },
  companionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  companionName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    flex: 1,
  },
  companionNameSelected: {
    color: COLORS.textPrimary,
  },
  companionRace: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  companionRole: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.gold,
    marginTop: 2,
  },
  questGroup: {
    gap: SPACING.sm,
  },
  questGroupTitle: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.gold,
  },
  questList: {
    gap: SPACING.sm,
  },
  questCard: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
    gap: SPACING.xs,
  },
  questCardLocked: {
    opacity: 0.72,
  },
  questHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  questTitleCol: {
    flex: 1,
    gap: 4,
  },
  questBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankPill: {
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  trialRankPill: {
    backgroundColor: COLORS.goldDim,
  },
  rankPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  trialRankText: {
    color: COLORS.gold,
  },
  completedPill: {
    backgroundColor: 'rgba(76, 175, 80, 0.16)',
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  completedPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.success,
  },
  questTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  powerPill: {
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
  },
  powerPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  questDesc: {
    ...TYPOGRAPHY.bodySm,
  },
  questMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  questMetaText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  questMetaDot: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  gateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 167, 38, 0.12)',
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    marginTop: 2,
  },
  gateBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.warning,
  },
  questActionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  briefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  briefBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  embarkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingVertical: 9,
  },
  embarkBtnDisabled: {
    backgroundColor: SURFACES.layer1,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
  },
  embarkBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  embarkBtnTextDisabled: {
    color: COLORS.textMuted,
  },
  coopCard: {
    gap: SPACING.sm,
  },
  coopJoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  coopInput: {
    flex: 1,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  coopJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#38BDF8',
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  coopJoinBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  coopLobbyWrap: {
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  coopLobbyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  coopRoomBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38BDF8',
    flex: 1,
  },
  coopQuestBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
  },
  coopSlotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  coopSlotCard: {
    width: '48.5%',
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
    gap: 2,
  },
  coopSlotEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  coopSlotName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  coopSlotStatus: {
    fontSize: 10,
    fontWeight: '800',
  },
  coopSlotEmpty: {
    fontSize: 11,
    fontStyle: 'italic',
    color: COLORS.textMuted,
  },
  coopLobbyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  coopReadyBtn: {
    flex: 1,
    backgroundColor: SURFACES.layer3,
    borderRadius: RADII.md,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  coopReadyBtnActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.18)',
    borderColor: COLORS.success,
  },
  coopReadyBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  coopReadyBtnTextActive: {
    color: COLORS.success,
  },
  coopStartBtn: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingVertical: 9,
    alignItems: 'center',
  },
  coopStartBtnDisabled: {
    backgroundColor: SURFACES.layer1,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
  },
  coopStartBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  coopStartBtnTextDisabled: {
    color: COLORS.textMuted,
  },
  coopLeaveBtn: {
    backgroundColor: 'rgba(239, 83, 80, 0.15)',
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(239, 83, 80, 0.35)',
  },
  coopLeaveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
});
