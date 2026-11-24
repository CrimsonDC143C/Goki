import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {
  COMBAT_CONSUMABLE_BY_SLUG,
  GuildQuestDefinition,
  StatusEffectType,
  TurnBasedCombatAction,
  TurnBasedCombatEvent,
  TurnBasedCombatState,
  TurnBasedCombatant,
  stepTurnBasedCombat,
} from '@goki/game-engine';
import type { CoopParticipantView } from '../../api/websocketClient';
import {
  ParallaxBackground,
  resolveBattleArenaPreset,
} from '../../components/battle/background/ParallaxBackground';
import {
  getCombatEnemySprite,
  getHeroCombatSprite,
} from '../../assets/rpgArtRegistry';
import {
  ReanimatedCombatantSprite,
  resolveWeaponSlashTheme,
  type CombatantAnimState,
} from '../../components/battle/ReanimatedCombatantSprite';
import {
  CharacterRigRenderer,
  type RigAnimationState,
} from '../../components/character';
import { RpgIcon } from '../../components/icons/RpgIcon';
import { useGame } from '../../state/GameContext';
import { COLORS, RADII, SPACING, SURFACES, TYPOGRAPHY } from '../../theme';

export interface TurnBasedArenaCoopSession {
  room: string;
  runId: string;
  localCharacterId: string;
  serverState: TurnBasedCombatState;
  turnDeadlineAt: number | null;
  turnTimeoutMs: number;
  participants: CoopParticipantView[];
  error?: string | null;
  onSendAction: (action: TurnBasedCombatAction) => void;
}

export interface TurnBasedArenaScreenProps {
  initialState: TurnBasedCombatState;
  quest: GuildQuestDefinition;
  companionIds: string[];
  serverRunId?: string | null;
  coopSession?: TurnBasedArenaCoopSession | null;
  onComplete: (result: {
    finalState: TurnBasedCombatState;
    companionIds: string[];
    serverRunId?: string | null;
  }) => void;
  onRetreat: () => void;
}

interface UnitPopup {
  text: string;
  color: string;
}

const STATUS_LABEL_MAP: Record<StatusEffectType, string> = {
  GUARDING: 'GUARD',
  TAUNT: 'TAUNT',
  BLEED: 'BLEED',
  VULNERABLE: 'VULN',
  SHARPENED: 'SHARP',
  FORTIFIED: 'FORT',
  EVASION: 'EVA',
};

const STATUS_COLOR_MAP: Record<StatusEffectType, string> = {
  GUARDING: '#38BDF8',
  TAUNT: '#F59E0B',
  BLEED: '#EF4444',
  VULNERABLE: '#FB7185',
  SHARPENED: '#FBBF24',
  FORTIFIED: '#34D399',
  EVASION: '#A78BFA',
};

function deriveUnitAnimState(
  unit: TurnBasedCombatant,
  events: readonly TurnBasedCombatEvent[],
  combatStatus: TurnBasedCombatState['status']
): { partyAnim: RigAnimationState; enemyAnim: CombatantAnimState; hitFlash: boolean } {
  if (!unit.alive) {
    return { partyAnim: 'death', enemyAnim: 'death', hitFlash: false };
  }
  if (combatStatus === 'VICTORY' && unit.side === 'PARTY') {
    return { partyAnim: 'victory', enemyAnim: 'idle', hitFlash: false };
  }

  let didAttack = false;
  let didGuard = false;
  let didHurt = false;

  for (const ev of events) {
    if (ev.actorId === unit.unitId) {
      if (
        ev.type === 'BASIC_ATTACK' ||
        ev.type === 'SKILL_CAST' ||
        ev.type === 'PARRY_COUNTER' ||
        ev.type === 'ENEMY_INTENT_EXECUTED'
      ) {
        didAttack = true;
      } else if (ev.type === 'GUARD_STANCE') {
        didGuard = true;
      }
    }
    if (ev.targetId === unit.unitId && (ev.damage ?? 0) > 0) {
      didHurt = true;
    }
  }

  if (didHurt) {
    return { partyAnim: 'hurt', enemyAnim: 'hurt', hitFlash: true };
  }
  if (didAttack) {
    return { partyAnim: 'attack', enemyAnim: 'attack', hitFlash: false };
  }
  if (didGuard || unit.statuses.some((s) => s.type === 'GUARDING')) {
    return { partyAnim: 'guard', enemyAnim: 'idle', hitFlash: false };
  }
  return { partyAnim: 'idle', enemyAnim: 'idle', hitFlash: false };
}

function derivePopupsFromEvents(
  events: readonly TurnBasedCombatEvent[]
): Record<string, UnitPopup> {
  const map: Record<string, UnitPopup> = {};
  for (const ev of events) {
    const targetId = ev.targetId ?? ev.actorId;
    if (!targetId) continue;

    if (ev.type === 'DODGE') {
      map[targetId] = { text: 'DODGE', color: '#38BDF8' };
    } else if (ev.damage && ev.damage > 0) {
      const prefix = ev.isParry ? 'PARRY ' : ev.isCrit ? 'CRIT ' : '';
      map[targetId] = {
        text: `${prefix}-${ev.damage}`,
        color: ev.isCrit ? COLORS.gold : COLORS.danger,
      };
    } else if (ev.heal && ev.heal > 0) {
      map[targetId] = { text: `+${ev.heal} HP`, color: COLORS.success };
    } else if (ev.shieldGranted && ev.shieldGranted > 0) {
      map[targetId] = { text: `+${ev.shieldGranted} SHD`, color: COLORS.shieldCyan };
    } else if (ev.type === 'GUARD_STANCE') {
      map[targetId] = { text: 'GUARD + PARRY', color: '#38BDF8' };
    }
  }
  return map;
}

export const TurnBasedArenaScreen: React.FC<TurnBasedArenaScreenProps> = ({
  initialState,
  quest,
  companionIds,
  serverRunId = null,
  coopSession = null,
  onComplete,
  onRetreat,
}) => {
  const { beltLoadout: equippedBeltSlugs } = useGame();
  const [state, setState] = useState<TurnBasedCombatState>(
    coopSession?.serverState ?? initialState
  );
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2>(1);
  const [stageWidth, setStageWidth] = useState(360);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(() => {
    const firstEnemy = (coopSession?.serverState ?? initialState).units.find(
      (u) => u.side === 'ENEMY' && u.alive
    );
    return firstEnemy?.unitId ?? null;
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const stepSeqRef = useRef(0);

  // Sync authoritative server state in co-op mode
  useEffect(() => {
    if (!coopSession) return;
    setState(coopSession.serverState);
    setActionError(null);
  }, [coopSession, coopSession?.serverState]);

  // Live co-op turn countdown ticker
  useEffect(() => {
    if (!coopSession?.turnDeadlineAt || state.status !== 'IN_PROGRESS') return;
    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => clearInterval(interval);
  }, [coopSession?.turnDeadlineAt, state.status, state.stepSeq]);

  const remainingTurnSec = useMemo(() => {
    if (!coopSession || state.status !== 'IN_PROGRESS') return null;
    if (!coopSession.turnDeadlineAt) {
      return Math.max(0, Math.ceil(coopSession.turnTimeoutMs / 1000));
    }
    return Math.max(0, Math.ceil((coopSession.turnDeadlineAt - nowMs) / 1000));
  }, [coopSession, nowMs, state.status]);

  const arenaPreset = useMemo(
    () => resolveBattleArenaPreset(quest.questSlug),
    [quest.questSlug]
  );

  const partyUnits = useMemo(
    () => state.units.filter((u) => u.side === 'PARTY'),
    [state.units]
  );
  const enemyUnits = useMemo(
    () => state.units.filter((u) => u.side === 'ENEMY'),
    [state.units]
  );
  const livingEnemies = useMemo(
    () => enemyUnits.filter((u) => u.alive),
    [enemyUnits]
  );

  // Keep target selection valid as enemies fall or new waves spawn
  const resolvedTargetId = useMemo(() => {
    if (selectedTargetId && livingEnemies.some((e) => e.unitId === selectedTargetId)) {
      return selectedTargetId;
    }
    return livingEnemies[0]?.unitId ?? null;
  }, [livingEnemies, selectedTargetId]);

  const heroUnit = useMemo(() => {
    if (coopSession) {
      return (
        partyUnits.find((u) => u.unitId === coopSession.localCharacterId) ??
        partyUnits.find((u) => u.controller === 'PLAYER') ??
        partyUnits[0] ??
        null
      );
    }
    return partyUnits.find((u) => u.controller === 'PLAYER') ?? partyUnits[0] ?? null;
  }, [coopSession, partyUnits]);
  const activeUnit = useMemo(
    () => state.units.find((u) => u.unitId === state.activeUnitId) ?? null,
    [state.units, state.activeUnitId]
  );

  const popupsByUnit = useMemo(
    () => derivePopupsFromEvents(state.lastStepEvents),
    [state.lastStepEvents]
  );

  const latestCombatLine = useMemo(() => {
    const events = state.lastStepEvents;
    if (events.length === 0) {
      return `Wave ${state.currentWaveIndex + 1}/${state.totalWaves}: Select an enemy target and choose your command.`;
    }
    return events[events.length - 1]!.message;
  }, [state.lastStepEvents, state.currentWaveIndex, state.totalWaves]);

  const dispatchCombatAction = useCallback(
    (action: TurnBasedCombatAction) => {
      if (coopSession) {
        setActionError(null);
        coopSession.onSendAction(action);
        return;
      }
      setState((prev) => {
        const result = stepTurnBasedCombat(prev, action);
        if (!result.valid) {
          setActionError(result.error ?? 'Action not permitted.');
          return prev;
        }
        setActionError(null);
        stepSeqRef.current += 1;
        return result.state;
      });
    },
    [coopSession]
  );

  // Local AI Turn Stepper (disabled in server-authoritative WebSocket co-op mode)
  useEffect(() => {
    if (coopSession) return;
    if (state.status !== 'IN_PROGRESS' || state.phase !== 'AWAITING_AI_TURN') {
      return;
    }
    const delayMs = playbackSpeed === 2 ? 110 : 300;
    const timer = setTimeout(() => {
      dispatchCombatAction({ type: 'AUTO_AI_TURN' });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [coopSession, state.status, state.phase, state.stepSeq, playbackSpeed, dispatchCombatAction]);

  const handleStageLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setStageWidth(Math.round(w));
  };

  const isPlayerTurn = coopSession
    ? state.status === 'IN_PROGRESS' &&
      state.phase === 'AWAITING_PLAYER_ACTION' &&
      Boolean(heroUnit && state.activeUnitId === heroUnit.unitId)
    : state.status === 'IN_PROGRESS' && state.phase === 'AWAITING_PLAYER_ACTION';
  const displayedError = coopSession?.error ?? actionError;

  return (
    <View style={styles.root} testID="turn-based-arena-screen">
      {/* 1. Header & AGI Turn-Order Timeline */}
      <View style={styles.headerCard} testID="arena-turn-order-bar">
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleCol}>
            <Text style={styles.questTitle} numberOfLines={1}>
              {quest.title}
            </Text>
            <Text style={styles.waveMeta}>
              Wave {state.currentWaveIndex + 1}/{state.totalWaves} • Turn {state.turnNumber}
            </Text>
          </View>

          <View style={styles.headerControls}>
            {coopSession && remainingTurnSec !== null ? (
              <View
                style={[
                  styles.turnTimerPill,
                  remainingTurnSec <= 5 && styles.turnTimerPillUrgent,
                ]}
                testID="arena-turn-timer-pill"
              >
                <Text
                  style={[
                    styles.turnTimerText,
                    remainingTurnSec <= 5 && styles.turnTimerTextUrgent,
                  ]}
                >
                  {remainingTurnSec}s
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.speedBtn, playbackSpeed === 2 && styles.speedBtnActive]}
              onPress={() => setPlaybackSpeed((p) => (p === 1 ? 2 : 1))}
              activeOpacity={0.78}
              testID="arena-speed-btn"
            >
              <Text style={[styles.speedBtnText, playbackSpeed === 2 && styles.speedBtnTextActive]}>
                {playbackSpeed}x
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.retreatBtn}
              onPress={onRetreat}
              activeOpacity={0.78}
              testID="arena-retreat-btn"
            >
              <Text style={styles.retreatBtnText}>Retreat</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.timelineRow}
        >
          {state.turnOrderTimeline.map((entry, idx) => {
            const isActive = idx === 0 && entry.unitId === state.activeUnitId;
            const isParty = entry.side === 'PARTY';
            return (
              <View
                key={`${entry.unitId}-${idx}`}
                style={[
                  styles.timelineChip,
                  isParty ? styles.timelineChipParty : styles.timelineChipEnemy,
                  isActive && styles.timelineChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.timelineChipText,
                    isActive && styles.timelineChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {isActive ? '▶ ' : ''}
                  {entry.name.split(' ')[0]}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Parallax Battle Stage */}
      <View style={styles.stageContainer} onLayout={handleStageLayout}>
        <ParallaxBackground
          arenaConfig={arenaPreset}
          viewportWidth={stageWidth}
          scrollMode="combat"
          playbackRate={playbackSpeed}
        />

        <View style={styles.stageOverlay}>
          {/* Left Side: Party */}
          <View style={styles.sideColumn}>
            {partyUnits.map((unit) => {
              const anim = deriveUnitAnimState(unit, state.lastStepEvents, state.status);
              const popup = popupsByUnit[unit.unitId];
              const isTurnActive = unit.unitId === state.activeUnitId;
              const hpPct = Math.max(0, Math.min(100, (unit.hp / Math.max(1, unit.maxHp)) * 100));
              const isHero = coopSession
                ? unit.unitId === coopSession.localCharacterId
                : unit.controller === 'PLAYER';
              const coopParticipant = coopSession?.participants.find(
                (p) => p.characterId === unit.unitId
              );
              const isAiTakeover = coopParticipant?.controlMode === 'AI_TAKEOVER';

              return (
                <View
                  key={unit.unitId}
                  style={[
                    styles.unitStageCard,
                    isTurnActive && styles.unitStageCardActive,
                    !unit.alive && styles.unitStageCardDefeated,
                  ]}
                >
                  {popup ? (
                    <View style={styles.popupBadge}>
                      <Text style={[styles.popupText, { color: popup.color }]}>
                        {popup.text}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.rigWrap}>
                    {(() => {
                      const heroArt = getHeroCombatSprite(
                        unit.race ?? 'HUMAN',
                        unit.customizationConfig?.identity?.baseSilhouette ?? 'balanced',
                        Boolean(unit.equippedLoadout?.chest || unit.equippedLoadout?.head)
                      );
                      if (heroArt) {
                        return (
                          <ReanimatedCombatantSprite
                            source={heroArt}
                            state={anim.partyAnim}
                            facing="right"
                            width={isHero ? 74 : 62}
                            height={isHero ? 78 : 66}
                            actionTriggerKey={state.stepSeq}
                            hitFlash={anim.hitFlash}
                            playbackRate={playbackSpeed}
                            slashTheme={resolveWeaponSlashTheme(unit.equippedLoadout?.mainHand)}
                          />
                        );
                      }
                      return (
                        <CharacterRigRenderer
                          race={unit.race ?? 'HUMAN'}
                          appearanceId={unit.appearanceId}
                          customizationConfig={unit.customizationConfig}
                          equippedLoadout={unit.equippedLoadout}
                          animationState={anim.partyAnim}
                          actionTriggerKey={state.stepSeq}
                          hitFlash={anim.hitFlash}
                          playbackRate={playbackSpeed}
                          width={isHero ? 64 : 52}
                          height={isHero ? 84 : 70}
                        />
                      );
                    })()}
                  </View>

                  <View style={styles.unitHud}>
                    <View style={styles.unitNameRow}>
                      <Text style={styles.unitName} numberOfLines={1}>
                        {unit.name}
                      </Text>
                      {isAiTakeover ? (
                        <View
                          style={styles.aiTakeoverBadge}
                          testID={`arena-unit-ai-badge-${unit.unitId}`}
                        >
                          <Text style={styles.aiTakeoverBadgeText}>AI</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.hpBarTrack}>
                      <View style={[styles.hpBarFillParty, { width: `${hpPct}%` }]} />
                    </View>
                    <Text style={styles.hpBarValue}>
                      {unit.hp}/{unit.maxHp}
                      {unit.shield > 0 ? ` (+${unit.shield})` : ''}
                    </Text>
                    {unit.statuses.length > 0 ? (
                      <View style={styles.statusRow}>
                        {unit.statuses.slice(0, 3).map((st, sIdx) => (
                          <View
                            key={`${st.type}-${sIdx}`}
                            style={[
                              styles.statusPill,
                              { borderColor: STATUS_COLOR_MAP[st.type] ?? COLORS.border },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusPillText,
                                { color: STATUS_COLOR_MAP[st.type] ?? COLORS.textSecondary },
                              ]}
                            >
                              {STATUS_LABEL_MAP[st.type]}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Right Side: Enemies */}
          <View style={styles.sideColumn}>
            {enemyUnits.map((enemy, idx) => {
              const anim = deriveUnitAnimState(enemy, state.lastStepEvents, state.status);
              const popup = popupsByUnit[enemy.unitId];
              const isSelected = enemy.unitId === resolvedTargetId && enemy.alive;
              const isTurnActive = enemy.unitId === state.activeUnitId;
              const hpPct = Math.max(0, Math.min(100, (enemy.hp / Math.max(1, enemy.maxHp)) * 100));

              return (
                <Pressable
                  key={enemy.unitId}
                  style={[
                    styles.unitStageCard,
                    styles.enemyStageCard,
                    isSelected && styles.enemyTargetSelected,
                    isTurnActive && styles.unitStageCardActive,
                    !enemy.alive && styles.unitStageCardDefeated,
                  ]}
                  disabled={!enemy.alive}
                  onPress={() => setSelectedTargetId(enemy.unitId)}
                  testID={`arena-enemy-target-${idx}`}
                >
                  {popup ? (
                    <View style={styles.popupBadge}>
                      <Text style={[styles.popupText, { color: popup.color }]}>
                        {popup.text}
                      </Text>
                    </View>
                  ) : null}

                  {/* Enemy Intent Telegraph Badge */}
                  {enemy.alive && enemy.nextIntent ? (
                    <View
                      style={styles.intentBadge}
                      testID={`arena-enemy-intent-${idx}`}
                    >
                      <RpgIcon name="combat" size={10} color={COLORS.warning} />
                      <Text style={styles.intentText} numberOfLines={1}>
                        {enemy.nextIntent.label}
                        {enemy.nextIntent.estimatedDamage > 0
                          ? ` • ~${enemy.nextIntent.estimatedDamage}`
                          : ''}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.enemySpriteWrap}>
                    {(() => {
                      const enemyArt = getCombatEnemySprite(Boolean(enemy.isBoss), enemy.name);
                      if (!enemyArt) return null;
                      const sz = enemy.isBoss ? 86 : 72;
                      const telegraph = Boolean(
                        enemy.alive &&
                          enemy.isBoss &&
                          enemy.nextIntent &&
                          enemy.nextIntent.estimatedDamage > 0
                      );
                      return (
                        <ReanimatedCombatantSprite
                          source={enemyArt}
                          state={anim.enemyAnim}
                          facing="left"
                          width={sz}
                          height={sz}
                          actionTriggerKey={state.stepSeq}
                          playbackRate={playbackSpeed}
                          hitFlash={anim.hitFlash}
                          telegraphGlow={telegraph}
                          slashTheme={enemy.isBoss ? 'astral' : 'crimson'}
                        />
                      );
                    })()}
                  </View>

                  <View style={styles.unitHud}>
                    <Text style={styles.unitName} numberOfLines={1}>
                      {isSelected ? '◎ ' : ''}
                      {enemy.name}
                    </Text>
                    {enemy.alive ? (
                      <>
                        <View style={styles.hpBarTrack}>
                          <View style={[styles.hpBarFillEnemy, { width: `${hpPct}%` }]} />
                        </View>
                        <Text style={styles.hpBarValue}>
                          {enemy.hp}/{enemy.maxHp}
                          {enemy.shield > 0 ? ` (+${enemy.shield})` : ''}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.defeatedBadgeText}>DEFEATED</Text>
                    )}
                    {enemy.statuses.length > 0 ? (
                      <View style={styles.statusRow}>
                        {enemy.statuses.slice(0, 3).map((st, sIdx) => (
                          <View
                            key={`${st.type}-${sIdx}`}
                            style={[
                              styles.statusPill,
                              { borderColor: STATUS_COLOR_MAP[st.type] ?? COLORS.border },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusPillText,
                                { color: STATUS_COLOR_MAP[st.type] ?? COLORS.textSecondary },
                              ]}
                            >
                              {STATUS_LABEL_MAP[st.type]}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Combat Feed Banner */}
        <View style={styles.combatFeedBar}>
          <Text style={styles.combatFeedText} numberOfLines={2}>
            {latestCombatLine}
          </Text>
        </View>
      </View>

      {/* 3. Player Command Deck / AI Status / Completion */}
      <ScrollView
        style={styles.deckScroll}
        contentContainerStyle={styles.deckContent}
      >
        {displayedError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{displayedError}</Text>
          </View>
        ) : null}

        {/* Active Hero Resource Readout */}
        {heroUnit ? (
          <View style={styles.heroResourceBar}>
            <View style={styles.resourcePill}>
              <Text style={styles.resourceLabel}>HP</Text>
              <Text style={[styles.resourceVal, { color: COLORS.success }]}>
                {heroUnit.hp}/{heroUnit.maxHp}
              </Text>
            </View>
            <View style={styles.resourcePill}>
              <Text style={styles.resourceLabel}>SHIELD</Text>
              <Text style={[styles.resourceVal, { color: COLORS.shieldCyan }]}>
                {heroUnit.shield}
              </Text>
            </View>
            <View style={styles.resourcePill}>
              <Text style={styles.resourceLabel}>STAMINA</Text>
              <Text style={[styles.resourceVal, { color: COLORS.gold }]}>
                {heroUnit.stamina}/{heroUnit.maxStamina}
              </Text>
            </View>
            <View style={styles.resourcePill}>
              <Text style={styles.resourceLabel}>MANA</Text>
              <Text style={[styles.resourceVal, { color: '#60A5FA' }]}>
                {heroUnit.mana}/{heroUnit.maxMana}
              </Text>
            </View>
          </View>
        ) : null}

        {state.status === 'IN_PROGRESS' ? (
          heroUnit ? (
            <View style={styles.commandsWrap}>
              {!isPlayerTurn ? (
                <View style={styles.aiTurnBanner} testID="arena-waiting-turn-banner">
                  <RpgIcon name="sparkles" size={14} color={COLORS.gold} />
                  <Text style={styles.aiTurnText}>
                    {activeUnit
                      ? coopSession && state.phase === 'AWAITING_PLAYER_ACTION'
                        ? `Awaiting ${activeUnit.name}'s command...`
                        : `${activeUnit.name} is acting...`
                      : 'Resolving turn order...'}
                  </Text>
                </View>
              ) : null}

              {/* Core Actions: Basic Attack + Guard/Parry */}
              <View style={[styles.coreActionsRow, !isPlayerTurn && styles.deckTurnLocked]}>
                <TouchableOpacity
                  style={[styles.coreBtn, styles.attackBtn]}
                  disabled={!isPlayerTurn}
                  onPress={() =>
                    dispatchCombatAction({
                      type: 'BASIC_ATTACK',
                      actorId: heroUnit.unitId,
                      targetId: resolvedTargetId ?? undefined,
                    })
                  }
                  activeOpacity={0.8}
                  testID="arena-action-attack"
                >
                  <RpgIcon name="combat" size={15} color={SURFACES.canvas} />
                  <Text style={styles.attackBtnText}>Basic Attack</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.coreBtn, styles.guardBtn]}
                  disabled={!isPlayerTurn}
                  onPress={() =>
                    dispatchCombatAction({
                      type: 'GUARD',
                      actorId: heroUnit.unitId,
                    })
                  }
                  activeOpacity={0.8}
                  testID="arena-action-guard"
                >
                  <RpgIcon name="shield" size={15} color="#38BDF8" />
                  <Text style={styles.guardBtnText}>Guard / Parry</Text>
                </TouchableOpacity>
              </View>

              {/* 4 Equipped Active Skills */}
              <Text style={styles.deckSectionLabel}>ACTIVE TALENT SKILLS</Text>
              <View style={[styles.grid4, !isPlayerTurn && styles.deckTurnLocked]}>
                {[0, 1, 2, 3].map((idx) => {
                  const skill = heroUnit.equippedSkills[idx];
                  if (!skill) {
                    return (
                      <View
                        key={`skill-empty-${idx}`}
                        style={[styles.slotActionBtn, styles.slotActionDisabled]}
                        testID={`arena-skill-btn-${idx}`}
                      >
                        <Text style={styles.slotActionEmptyText}>Empty Skill</Text>
                      </View>
                    );
                  }
                  const cd = heroUnit.skillCooldowns[skill.skillId] ?? 0;
                  const pool = skill.resourceType === 'MANA' ? heroUnit.mana : heroUnit.stamina;
                  const insufficient = pool < skill.resourceCost;
                  const disabled = !isPlayerTurn || cd > 0 || insufficient;
                  const isMana = skill.resourceType === 'MANA';

                  return (
                    <TouchableOpacity
                      key={skill.skillId}
                      style={[
                        styles.slotActionBtn,
                        disabled ? styles.slotActionDisabled : styles.slotSkillReady,
                      ]}
                      disabled={disabled}
                      onPress={() =>
                        dispatchCombatAction({
                          type: 'USE_SKILL',
                          actorId: heroUnit.unitId,
                          skillId: skill.skillId,
                          targetId:
                            skill.targetType === 'PARTY_HEAL'
                              ? undefined
                              : (resolvedTargetId ?? undefined),
                        })
                      }
                      activeOpacity={0.8}
                      testID={`arena-skill-btn-${idx}`}
                    >
                      <Text style={styles.slotActionTitle} numberOfLines={1}>
                        {skill.name}
                      </Text>
                      <Text
                        style={[
                          styles.slotActionMeta,
                          { color: cd > 0 ? COLORS.warning : isMana ? '#60A5FA' : COLORS.gold },
                        ]}
                      >
                        {cd > 0
                          ? `CD ${cd}T`
                          : `${skill.resourceCost} ${isMana ? 'MANA' : 'STAM'}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 4 Belt Consumables */}
              <Text style={styles.deckSectionLabel}>BELT CONSUMABLES</Text>
              <View style={[styles.grid4, !isPlayerTurn && styles.deckTurnLocked]}>
                {[0, 1, 2, 3].map((idx) => {
                  const belt = heroUnit.beltSlots[idx];
                  const resolvedSlug = belt?.itemSlug ?? equippedBeltSlugs[idx] ?? null;
                  const def = resolvedSlug ? COMBAT_CONSUMABLE_BY_SLUG[resolvedSlug] : undefined;
                  const charges = belt?.itemSlug ? (belt.charges ?? 0) : 0;
                  const disabled = !isPlayerTurn || !def || charges <= 0;

                  return (
                    <TouchableOpacity
                      key={`belt-${idx}`}
                      style={[
                        styles.slotActionBtn,
                        disabled ? styles.slotActionDisabled : styles.slotBeltReady,
                      ]}
                      disabled={disabled}
                      onPress={() =>
                        dispatchCombatAction({
                          type: 'USE_CONSUMABLE',
                          actorId: heroUnit.unitId,
                          beltSlotIndex: idx,
                          targetId: heroUnit.unitId,
                        })
                      }
                      activeOpacity={0.8}
                      testID={`arena-belt-btn-${idx}`}
                    >
                      <Text
                        style={[
                          styles.slotActionTitle,
                          !def && styles.slotActionEmptyText,
                        ]}
                        numberOfLines={1}
                      >
                        {def ? def.name : 'Empty Belt'}
                      </Text>
                      <Text style={styles.slotActionMeta}>
                        {def ? (charges > 0 ? `${charges} left` : 'Out of stock') : '—'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.aiTurnBanner} testID="arena-waiting-turn-banner">
              <RpgIcon name="sparkles" size={16} color={COLORS.gold} />
              <Text style={styles.aiTurnText}>Resolving turn order...</Text>
            </View>
          )
        ) : state.status === 'VICTORY' ? (
          <View style={styles.completionCard}>
            <Text style={styles.victoryTitle}>VICTORY!</Text>
            <Text style={styles.completionSub}>
              Cleared all {state.totalWaves} waves in {state.turnNumber} turns.
            </Text>
            <TouchableOpacity
              style={styles.claimVictoryBtn}
              onPress={() =>
                onComplete({
                  finalState: state,
                  companionIds,
                  serverRunId,
                })
              }
              activeOpacity={0.82}
              testID="arena-claim-victory-btn"
            >
              <RpgIcon name="trophy" size={16} color={SURFACES.canvas} />
              <Text style={styles.claimVictoryBtnText}>Claim Spoils &amp; Debrief</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.completionCard, styles.defeatCard]}>
            <Text style={styles.defeatTitle}>DEFEATED</Text>
            <Text style={styles.completionSub}>
              Your squad fell on Wave {state.currentWaveIndex + 1}/{state.totalWaves}. Regroup at the Guild Desk.
            </Text>
            <TouchableOpacity
              style={styles.defeatReturnBtn}
              onPress={onRetreat}
              activeOpacity={0.82}
              testID="arena-defeat-return-btn"
            >
              <Text style={styles.defeatReturnBtnText}>Return to Guild Desk</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SURFACES.canvas,
  },
  headerCard: {
    backgroundColor: SURFACES.layer1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACES.hairlineStrong,
    gap: SPACING.xs,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  headerTitleCol: {
    flex: 1,
  },
  questTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  waveMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  turnTimerPill: {
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)',
  },
  turnTimerPillUrgent: {
    backgroundColor: 'rgba(239, 83, 80, 0.18)',
    borderColor: COLORS.danger,
  },
  turnTimerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
    ...TYPOGRAPHY.tabular,
  },
  turnTimerTextUrgent: {
    color: COLORS.danger,
  },
  speedBtn: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  speedBtnActive: {
    backgroundColor: COLORS.goldDim,
    borderColor: COLORS.gold,
  },
  speedBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  speedBtnTextActive: {
    color: COLORS.gold,
  },
  retreatBtn: {
    backgroundColor: 'rgba(239, 83, 80, 0.14)',
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(239, 83, 80, 0.4)',
  },
  retreatBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.danger,
  },
  timelineRow: {
    gap: 6,
    paddingVertical: 2,
  },
  timelineChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.pill,
    borderWidth: 1,
  },
  timelineChipParty: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  timelineChipEnemy: {
    backgroundColor: 'rgba(239, 83, 80, 0.12)',
    borderColor: 'rgba(239, 83, 80, 0.3)',
  },
  timelineChipActive: {
    backgroundColor: COLORS.goldDim,
    borderColor: COLORS.gold,
  },
  timelineChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  timelineChipTextActive: {
    color: COLORS.gold,
    fontWeight: '800',
  },
  stageContainer: {
    height: 280,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#0C121D',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACES.hairlineStrong,
  },
  stageOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: 34,
    gap: SPACING.sm,
  },
  sideColumn: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 6,
  },
  unitStageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 14, 20, 0.72)',
    borderRadius: RADII.md,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    gap: 6,
  },
  enemyStageCard: {
    flexDirection: 'row-reverse',
  },
  unitStageCardActive: {
    borderColor: COLORS.gold,
  },
  enemyTargetSelected: {
    borderColor: COLORS.danger,
    backgroundColor: 'rgba(59, 24, 27, 0.72)',
  },
  unitStageCardDefeated: {
    opacity: 0.45,
    backgroundColor: 'rgba(12, 16, 24, 0.85)',
  },
  defeatedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
  },
  rigWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  enemySpriteWrap: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  unitHud: {
    flex: 1,
    gap: 2,
  },
  unitNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aiTakeoverBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  aiTakeoverBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.warning,
  },
  unitName: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  hpBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  hpBarFillParty: {
    height: '100%',
    backgroundColor: COLORS.success,
  },
  hpBarFillEnemy: {
    height: '100%',
    backgroundColor: COLORS.danger,
  },
  hpBarValue: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.tabular,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 1,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: 'rgba(9, 12, 18, 0.8)',
  },
  statusPillText: {
    fontSize: 8,
    fontWeight: '800',
  },
  intentBadge: {
    position: 'absolute',
    top: -10,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(18, 23, 34, 0.94)',
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADII.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    zIndex: 30,
  },
  intentText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.warning,
  },
  popupBadge: {
    position: 'absolute',
    top: -12,
    left: 8,
    backgroundColor: 'rgba(9, 12, 18, 0.92)',
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 35,
  },
  popupText: {
    fontSize: 10,
    fontWeight: '900',
  },
  combatFeedBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 25,
    backgroundColor: 'rgba(9, 12, 18, 0.86)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACES.hairline,
  },
  combatFeedText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  deckScroll: {
    flex: 1,
  },
  deckContent: {
    padding: SPACING.md,
    gap: SPACING.xs + 2,
    paddingBottom: 96,
  },
  errorBanner: {
    backgroundColor: COLORS.strengthDim,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  errorBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.danger,
  },
  heroResourceBar: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  resourcePill: {
    flex: 1,
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.md,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: SURFACES.hairline,
    alignItems: 'center',
  },
  resourceLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  resourceVal: {
    fontSize: 12,
    fontWeight: '800',
    ...TYPOGRAPHY.tabular,
  },
  commandsWrap: {
    gap: SPACING.sm,
  },
  coreActionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  coreBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADII.md,
    paddingVertical: 11,
  },
  attackBtn: {
    backgroundColor: COLORS.gold,
  },
  attackBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  guardBtn: {
    backgroundColor: SURFACES.layer2,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)',
  },
  guardBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#38BDF8',
  },
  deckSectionLabel: {
    ...TYPOGRAPHY.eyebrow,
    marginTop: 2,
  },
  grid4: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  deckTurnLocked: {
    opacity: 0.55,
  },
  slotActionBtn: {
    width: '48%',
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderWidth: 1,
    gap: 2,
  },
  slotSkillReady: {
    backgroundColor: SURFACES.layer2,
    borderColor: SURFACES.goldHairline,
  },
  slotBeltReady: {
    backgroundColor: SURFACES.layer2,
    borderColor: 'rgba(38, 166, 154, 0.45)',
  },
  slotActionDisabled: {
    backgroundColor: SURFACES.layer1,
    borderColor: SURFACES.hairlineStrong,
    opacity: 0.72,
  },
  slotActionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  slotActionEmptyText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  slotActionMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  aiTurnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACES.goldHairline,
  },
  aiTurnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gold,
  },
  completionCard: {
    backgroundColor: SURFACES.layer1,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACES.goldHairline,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  defeatCard: {
    borderColor: 'rgba(239, 83, 80, 0.45)',
  },
  victoryTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.gold,
    letterSpacing: 1,
  },
  defeatTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.danger,
    letterSpacing: 1,
  },
  completionSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  claimVictoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.gold,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    marginTop: 4,
    width: '100%',
  },
  claimVictoryBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: SURFACES.canvas,
  },
  defeatReturnBtn: {
    backgroundColor: SURFACES.layer2,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    marginTop: 4,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SURFACES.hairlineStrong,
  },
  defeatReturnBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
});
