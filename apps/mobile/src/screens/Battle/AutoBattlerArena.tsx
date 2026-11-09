import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SvgXml } from 'react-native-svg';
import type {
  CombatReplayEvent,
  DungeonCombatReplayResult,
  DungeonDefinition,
  DungeonWorkoutBuff,
} from '@goki/game-engine';
import { COLORS, CRIMSON_ONI, RARITY_COLORS } from '../../theme';
import { audioManager } from '../../services/AudioManager';
import { LOOT_CHEST_SVGS } from '../../assets/v0Vault';
import { getItemIconSource } from '../../assets/itemArtRegistry';
import { triggerSensoryCue } from '../../utils/sensoryFeedback';
import {
  ParallaxBackground,
  WHITEWOOD_ARENA_PRESET,
  WHITEWOOD_GROUND_BASELINE_BOTTOM,
} from '../../components/battle/background/ParallaxBackground';
import type { ScrollMode } from '../../components/battle/background/parallax.types';
import { SpriteAnimator } from '../../components/battle/sprites/SpriteAnimator';
import type { AnimationState, SpriteSheetConfig } from '../../components/battle/sprites/sprite.types';
import {
  resolveHeroSpriteConfig,
  resolveEnemySpriteConfig,
  getGroundAlignedBottomOffset,
} from '../../components/battle/sprites/spriteManifest';
import { LOOT_SPRITES } from '../../assets/sprites';
import {
  ArenaAnimatedView,
  useArenaMotionDriver,
} from '../../components/battle/reanimatedRuntime';

export interface AutoBattlerArenaProps {
  dungeon: DungeonDefinition;
  replay?: DungeonCombatReplayResult | null;
  activeWorkoutBuffs?: readonly DungeonWorkoutBuff[];
  party?: ReadonlyArray<{ characterId: string; name: string }>;
  onDismiss?: () => void;
}

interface UnitLiveVisualState {
  id: string;
  name: string;
  maxHp: number;
  hp: number;
  shieldHp: number;
  isBoss?: boolean;
  enraged?: boolean;
  popupText?: string;
  popupColor?: string;
}

export function isSupportSkillCast(
  ev: CombatReplayEvent | undefined,
  replay: DungeonCombatReplayResult | null | undefined
): boolean {
  if (!ev || ev.type !== 'SKILL_CAST') return false;
  if (!ev.targetId || !replay) return false;
  return replay.partySummaries.some((h) => h.characterId === ev.targetId);
}

export function isTwoPhaseStrikeEvent(
  ev: CombatReplayEvent | undefined,
  replay?: DungeonCombatReplayResult | null
): boolean {
  if (!ev) return false;
  if (ev.type === 'BASIC_ATTACK' || ev.type === 'DODGE') return true;
  if (ev.type === 'SKILL_CAST') {
    return !isSupportSkillCast(ev, replay);
  }
  return false;
}

export interface HeroStagePosition {
  leftPx: number;
  baselineBottom: number;
  scale: number;
  cellSize: number;
  bottomOffset: number;
  zIndex: number;
}

export function getHeroStagePosition(
  heroIndex: number,
  viewportWidth: number,
  sheet: SpriteSheetConfig
): HeroStagePosition {
  if (heroIndex === 0) {
    const scale = 2.25;
    const cellSize = Math.round(sheet.frameWidth * scale);
    const baselineBottom = WHITEWOOD_GROUND_BASELINE_BOTTOM;
    const bottomOffset = getGroundAlignedBottomOffset(baselineBottom, sheet, scale);
    const leftPx = Math.max(10, Math.round(viewportWidth * 0.15));
    return { leftPx, baselineBottom, scale, cellSize, bottomOffset, zIndex: 14 };
  }
  const scale = 2.0;
  const cellSize = Math.round(sheet.frameWidth * scale);
  const baselineBottom = WHITEWOOD_GROUND_BASELINE_BOTTOM + (heroIndex % 2 === 1 ? 7 : 2);
  const bottomOffset = getGroundAlignedBottomOffset(baselineBottom, sheet, scale);
  const leftPx = Math.round(viewportWidth * 0.05) - (heroIndex - 1) * 22;
  return { leftPx, baselineBottom, scale, cellSize, bottomOffset, zIndex: 13 - heroIndex };
}

export interface EnemyStagePosition {
  rightPx: number;
  baselineBottom: number;
  scale: number;
  cellSize: number;
  bottomOffset: number;
  zIndex: number;
}

export function getEnemyStagePosition(
  enemyIndex: number,
  viewportWidth: number,
  sheet: SpriteSheetConfig,
  isBoss?: boolean
): EnemyStagePosition {
  if (isBoss) {
    const scale = 2.65;
    const cellSize = Math.round(sheet.frameWidth * scale);
    const baselineBottom = WHITEWOOD_GROUND_BASELINE_BOTTOM;
    const bottomOffset = getGroundAlignedBottomOffset(baselineBottom, sheet, scale);
    const rightPx = Math.max(4, Math.round(viewportWidth * 0.05));
    return { rightPx, baselineBottom, scale, cellSize, bottomOffset, zIndex: 13 };
  }
  if (enemyIndex === 0) {
    const scale = 2.25;
    const cellSize = Math.round(sheet.frameWidth * scale);
    const baselineBottom = WHITEWOOD_GROUND_BASELINE_BOTTOM;
    const bottomOffset = getGroundAlignedBottomOffset(baselineBottom, sheet, scale);
    const rightPx = Math.max(12, Math.round(viewportWidth * 0.13));
    return { rightPx, baselineBottom, scale, cellSize, bottomOffset, zIndex: 13 };
  }
  const scale = 2.05;
  const cellSize = Math.round(sheet.frameWidth * scale);
  const baselineBottom = WHITEWOOD_GROUND_BASELINE_BOTTOM + (enemyIndex % 2 === 1 ? 7 : 2);
  const bottomOffset = getGroundAlignedBottomOffset(baselineBottom, sheet, scale);
  const rightPx = Math.round(viewportWidth * 0.01) - (enemyIndex - 1) * 20 - 12;
  return { rightPx, baselineBottom, scale, cellSize, bottomOffset, zIndex: 12 - enemyIndex };
}

function getReplayEventStepDurationMs(
  event: CombatReplayEvent | undefined,
  speedMultiplier: number
): number {
  if (!event) return Math.max(140, Math.round(700 / speedMultiplier));
  let baseMs = 700;
  switch (event.type) {
    case 'ROOM_ENTER':
      baseMs = 1200;
      break;
    case 'BASIC_ATTACK':
    case 'SKILL_CAST':
      baseMs = 950;
      break;
    case 'UNIT_DEFEATED':
      baseMs = 360;
      break;
    case 'LOOT_DROP':
      baseMs = 1050;
      break;
    case 'ROOM_CLEARED':
      baseMs = 950;
      break;
    case 'HAZARD_RESOLVED':
    case 'BOSS_PHASE_SHIFT':
      baseMs = 900;
      break;
    case 'DODGE':
      baseMs = 800;
      break;
    case 'BLEED_TICK':
    case 'SHIELD_APPLIED':
    case 'HEAL':
    case 'AURA_REGEN':
      baseMs = 680;
      break;
    default:
      baseMs = 700;
      break;
  }
  return Math.max(140, Math.round(baseMs / speedMultiplier));
}

export const AutoBattlerArena: React.FC<AutoBattlerArenaProps> = ({
  dungeon,
  replay,
  activeWorkoutBuffs = [],
  party,
  onDismiss,
}) => {
  const [viewportWidth, setViewportWidth] = useState<number>(380);

  // Playback state
  const [cursorIndex, setCursorIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 4>(1);
  const [resolvedImpactCursor, setResolvedImpactCursor] = useState<number>(-1);

  // Combat animation states (per-unit dictionaries & target tracking)
  const [heroAnimStates, setHeroAnimStates] = useState<Record<string, AnimationState>>({});
  const [heroActionKeys, setHeroActionKeys] = useState<Record<string, number>>({});
  const [enemyAnimStates, setEnemyAnimStates] = useState<Record<string, AnimationState>>({});
  const [enemyActionKeys, setEnemyActionKeys] = useState<Record<string, number>>({});
  const [activeActorId, setActiveActorId] = useState<string | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);

  const heroAnimStatesRef = useRef<Record<string, AnimationState>>({});
  const heroActionKeysRef = useRef<Record<string, number>>({});
  const enemyAnimStatesRef = useRef<Record<string, AnimationState>>({});
  const enemyActionKeysRef = useRef<Record<string, number>>({});
  const lastProcessedEventKeyRef = useRef<string>('');
  const speedMultiplierRef = useRef(speedMultiplier);
  speedMultiplierRef.current = speedMultiplier;

  const [heroHitFlash, setHeroHitFlash] = useState(false);
  const [enemyHitFlash, setEnemyHitFlash] = useState(false);
  const [isWaveTransition, setIsWaveTransition] = useState(false);
  const [showExpeditionInfo, setShowExpeditionInfo] = useState(false);

  // Fanfare modal & spoils reveal state
  const [fanfareModalVisible, setFanfareModalVisible] = useState(false);
  const [revealedIndices, setRevealedIndices] = useState<number[]>([]);
  const hasTriggeredFanfareRef = useRef(false);

  useEffect(() => {
    hasTriggeredFanfareRef.current = false;
    setRevealedIndices([]);
    setFanfareModalVisible(false);
  }, [replay?.seed]);

  useEffect(() => {
    if (!replay || replay.events.length === 0) return;
    if (cursorIndex >= replay.events.length - 1 && !hasTriggeredFanfareRef.current) {
      hasTriggeredFanfareRef.current = true;
      setFanfareModalVisible(true);
      triggerSensoryCue('DUNGEON_CLEARED_FANFARE');
      void audioManager.playSound('level-up');
    }
  }, [cursorIndex, replay]);

  const handleUnsealDrop = useCallback(
    (idx: number) => {
      if (revealedIndices.includes(idx)) return;
      triggerSensoryCue('CHEST_OPEN_REVEAL');
      void audioManager.playSound('level-up');
      setRevealedIndices((prev) => (prev.includes(idx) ? prev : [...prev, idx]));
    },
    [revealedIndices]
  );

  const handleRevealAllSpoils = useCallback(() => {
    if (!replay) return;
    triggerSensoryCue('CHEST_OPEN_REVEAL');
    void audioManager.playSound('level-up');
    setRevealedIndices(replay.lootDrops.map((_, i) => i));
  }, [replay]);

  // Floating combat numbers
  const [heroFloatingTargetId, setHeroFloatingTargetId] = useState<string | null>(null);
  const [enemyFloatingTargetId, setEnemyFloatingTargetId] = useState<string | null>(null);
  const [heroFloatingText, setHeroFloatingText] = useState<string | null>(null);
  const [heroFloatingColor, setHeroFloatingColor] = useState<string>(COLORS.danger);
  const [enemyFloatingText, setEnemyFloatingText] = useState<string | null>(null);
  const [enemyFloatingColor, setEnemyFloatingColor] = useState<string>(COLORS.gold);

  const triggerHeroUnitAnim = useCallback((heroId: string, anim: AnimationState) => {
    const prevAnim = heroAnimStatesRef.current[heroId];
    const isNewDeath = anim === 'death' && prevAnim !== 'death';
    if (anim === 'attack' || anim === 'hurt' || isNewDeath) {
      const nextKey = (heroActionKeysRef.current[heroId] ?? 0) + 1;
      heroActionKeysRef.current[heroId] = nextKey;
      setHeroActionKeys({ ...heroActionKeysRef.current });
    }
    heroAnimStatesRef.current[heroId] = anim;
    setHeroAnimStates({ ...heroAnimStatesRef.current });
  }, []);

  const triggerEnemyUnitAnim = useCallback((enemyId: string, anim: AnimationState) => {
    const prevAnim = enemyAnimStatesRef.current[enemyId];
    const isNewDeath = anim === 'death' && prevAnim !== 'death';
    if (anim === 'attack' || anim === 'hurt' || isNewDeath) {
      const nextKey = (enemyActionKeysRef.current[enemyId] ?? 0) + 1;
      enemyActionKeysRef.current[enemyId] = nextKey;
      setEnemyActionKeys({ ...enemyActionKeysRef.current });
    }
    enemyAnimStatesRef.current[enemyId] = anim;
    setEnemyAnimStates({ ...enemyAnimStatesRef.current });
  }, []);

  // Dual-driver arena motion adapter (Reanimated UI-thread when available, 60fps NativeDriver fallback)
  const {
    heroTransformStyle,
    enemyLungeStyle,
    enemyApproachStyle,
    enemyTransformStyle,
    heroFloatStyle,
    enemyFloatStyle,
    triggerHeroLunge,
    triggerEnemyLunge,
    triggerEnemyApproach,
    triggerHeroFloat,
    triggerEnemyFloat,
  } = useArenaMotionDriver();

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width);
    if (width > 0) {
      setViewportWidth(width);
    }
  }, []);

  // Reset playback when seed changes
  useEffect(() => {
    if (replay) {
      setCursorIndex(0);
      setResolvedImpactCursor(-1);
      setIsPlaying(true);
      setActiveActorId(null);
      setActiveTargetId(null);
      setHeroFloatingTargetId(null);
      setEnemyFloatingTargetId(null);
      setHeroFloatingText(null);
      setEnemyFloatingText(null);
      heroAnimStatesRef.current = {};
      heroActionKeysRef.current = {};
      enemyAnimStatesRef.current = {};
      enemyActionKeysRef.current = {};
      lastProcessedEventKeyRef.current = '';
      setHeroAnimStates({});
      setHeroActionKeys({});
      setEnemyAnimStates({});
      setEnemyActionKeys({});
    }
  }, [replay?.seed]);

  // Replay ticker with dynamic step pacing
  useEffect(() => {
    if (!replay || !isPlaying) return;
    if (cursorIndex >= replay.events.length - 1) {
      setIsPlaying(false);
      return;
    }

    const currentEv = replay.events[cursorIndex];
    const stepDelay = getReplayEventStepDurationMs(currentEv, speedMultiplier);

    const timer = setTimeout(() => {
      setCursorIndex((prev) => {
        if (prev >= replay.events.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, stepDelay);

    return () => clearTimeout(timer);
  }, [cursorIndex, isPlaying, replay, speedMultiplier]);

  // Wave transition callbacks
  const endWaveTransition = useCallback(() => {
    setIsWaveTransition(false);
    const nextHeroes: Record<string, AnimationState> = {};
    for (const k of Object.keys(heroAnimStatesRef.current)) {
      nextHeroes[k] = heroAnimStatesRef.current[k] === 'walk' ? 'idle' : heroAnimStatesRef.current[k]!;
    }
    heroAnimStatesRef.current = nextHeroes;
    setHeroAnimStates({ ...nextHeroes });

    const nextEnemies: Record<string, AnimationState> = {};
    for (const k of Object.keys(enemyAnimStatesRef.current)) {
      nextEnemies[k] = enemyAnimStatesRef.current[k] === 'walk' ? 'idle' : enemyAnimStatesRef.current[k]!;
    }
    enemyAnimStatesRef.current = nextEnemies;
    setEnemyAnimStates({ ...nextEnemies });
  }, []);

  const triggerWaveTransition = useCallback(() => {
    setIsWaveTransition(true);
    const nextHeroes: Record<string, AnimationState> = {};
    for (const k of Object.keys(heroAnimStatesRef.current)) {
      nextHeroes[k] = 'walk';
    }
    heroAnimStatesRef.current = nextHeroes;
    setHeroAnimStates({ ...nextHeroes });

    const nextEnemies: Record<string, AnimationState> = {};
    for (const k of Object.keys(enemyAnimStatesRef.current)) {
      nextEnemies[k] = 'walk';
    }
    enemyAnimStatesRef.current = nextEnemies;
    setEnemyAnimStates({ ...nextEnemies });

    triggerEnemyApproach(
      140,
      Math.max(300, Math.round(920 / speedMultiplierRef.current)),
      endWaveTransition
    );
  }, [triggerEnemyApproach, endWaveTransition]);

  // Deterministic state reconstruction
  const stageState = useMemo(() => {
    if (!replay) {
      const heroes: UnitLiveVisualState[] =
        party && party.length > 0
          ? party.map((p) => ({
              id: p.characterId,
              name: p.name,
              maxHp: 100,
              hp: 100,
              shieldHp: 0,
            }))
          : [
              {
                id: 'lead-hero',
                name: 'Hero Vanguard',
                maxHp: 100,
                hp: 100,
                shieldHp: 0,
              },
            ];

      return {
        activeRoomNum: 1,
        activeRoomDef: dungeon.rooms[0],
        heroes,
        enemies: [] as UnitLiveVisualState[],
      };
    }

    const heroesMap = new Map<string, UnitLiveVisualState>();
    for (const h of replay.partySummaries) {
      heroesMap.set(h.characterId, {
        id: h.characterId,
        name: h.name,
        maxHp: h.maxHp,
        hp: h.maxHp,
        shieldHp: 0,
      });
    }

    let activeRoomNum = 0;
    const enemiesMap = new Map<string, UnitLiveVisualState>();

    const populateRoomEnemies = (roomNum: number) => {
      enemiesMap.clear();
      const roomDef = dungeon.rooms.find((r) => r.roomNumber === roomNum);
      if (!roomDef?.enemies) return;
      roomDef.enemies.forEach((tmpl, idx) => {
        const instId = `${tmpl.enemyId}_${roomNum}_${idx + 1}`;
        enemiesMap.set(instId, {
          id: instId,
          name: tmpl.name,
          maxHp: tmpl.maxHp,
          hp: tmpl.maxHp,
          shieldHp: 0,
          isBoss: Boolean(tmpl.isBoss || roomDef.roomType === 'BOSS'),
          enraged: false,
        });
      });
    };

    const curEv = replay.events[cursorIndex];
    const isWaitingForStrikeImpact =
      isTwoPhaseStrikeEvent(curEv, replay) && resolvedImpactCursor < cursorIndex;
    const effectiveEndIndex = isWaitingForStrikeImpact ? cursorIndex : cursorIndex + 1;
    const slice = replay.events.slice(0, effectiveEndIndex);
    for (let i = 0; i < slice.length; i++) {
      const ev = slice[i]!;

      if (ev.type === 'ROOM_ENTER' && ev.roomNumber > 0) {
        activeRoomNum = ev.roomNumber;
        populateRoomEnemies(ev.roomNumber);
      }

      if (ev.type === 'SHIELD_APPLIED' && ev.targetId && ev.amount) {
        const h = heroesMap.get(ev.targetId);
        if (h) {
          h.shieldHp += ev.amount;
        }
      }

      if (
        (ev.type === 'BASIC_ATTACK' ||
          ev.type === 'SKILL_CAST' ||
          ev.type === 'BLEED_TICK' ||
          ev.type === 'HAZARD_RESOLVED') &&
        ev.targetId
      ) {
        const targetHero = heroesMap.get(ev.targetId);
        const targetEnemy = enemiesMap.get(ev.targetId);

        if (targetHero) {
          if (ev.shieldAbsorbed) {
            targetHero.shieldHp = Math.max(0, targetHero.shieldHp - ev.shieldAbsorbed);
          }
          if (ev.targetRemainingHp !== undefined) {
            targetHero.hp = ev.targetRemainingHp;
          }
        } else if (targetEnemy) {
          if (ev.targetRemainingHp !== undefined) {
            targetEnemy.hp = ev.targetRemainingHp;
          }
        }
      }

      if ((ev.type === 'HEAL' || ev.type === 'AURA_REGEN') && ev.targetId) {
        const targetHero = heroesMap.get(ev.targetId);
        if (targetHero && ev.targetRemainingHp !== undefined) {
          targetHero.hp = ev.targetRemainingHp;
        }
      }

      if (ev.type === 'BOSS_PHASE_SHIFT' && ev.actorId) {
        const boss = enemiesMap.get(ev.actorId);
        if (boss) {
          boss.enraged = true;
        }
      }

      if (ev.type === 'UNIT_DEFEATED' && ev.targetId) {
        const targetHero = heroesMap.get(ev.targetId);
        const targetEnemy = enemiesMap.get(ev.targetId);
        if (targetHero) targetHero.hp = 0;
        if (targetEnemy) targetEnemy.hp = 0;
      }
    }

    const activeRoomDef = dungeon.rooms.find((r) => r.roomNumber === activeRoomNum);

    return {
      activeRoomNum,
      activeRoomDef,
      heroes: Array.from(heroesMap.values()),
      enemies: Array.from(enemiesMap.values()),
    };
  }, [cursorIndex, dungeon.rooms, replay, party, resolvedImpactCursor]);

  const leadHero = stageState.heroes[0];
  const companions = stageState.heroes.slice(1);
  const currentEvent: CombatReplayEvent | undefined = replay?.events[cursorIndex];

  const targetedEnemy = currentEvent?.targetId
    ? stageState.enemies.find((e) => e.id === currentEvent.targetId)
    : undefined;
  const actingEnemy = currentEvent?.actorId
    ? stageState.enemies.find((e) => e.id === currentEvent.actorId)
    : undefined;
  const primaryHudEnemy =
    targetedEnemy ??
    actingEnemy ??
    stageState.enemies.find((e) => e.hp > 0) ??
    stageState.enemies[stageState.enemies.length - 1];

  const stageStateRef = useRef(stageState);
  stageStateRef.current = stageState;
  const isWaveTransitionRef = useRef(isWaveTransition);
  isWaveTransitionRef.current = isWaveTransition;

  // Animation completion callbacks
  const handleHeroUnitAnimComplete = useCallback(
    (heroId: string, completedState: AnimationState, completedKey?: number) => {
      if (
        heroAnimStatesRef.current[heroId] !== completedState ||
        (completedKey !== undefined && (heroActionKeysRef.current[heroId] ?? 0) !== completedKey)
      ) {
        return;
      }
      if (completedState === 'attack' || completedState === 'hurt') {
        const hero = stageStateRef.current.heroes.find((h) => h.id === heroId);
        if (hero && hero.hp <= 0) {
          triggerHeroUnitAnim(heroId, 'death');
        } else if (isWaveTransitionRef.current || stageStateRef.current.activeRoomNum === 0) {
          triggerHeroUnitAnim(heroId, 'walk');
        } else {
          triggerHeroUnitAnim(heroId, 'idle');
        }
      }
    },
    [triggerHeroUnitAnim]
  );

  const handleEnemyUnitAnimComplete = useCallback(
    (enemyId: string, completedState: AnimationState, completedKey?: number) => {
      if (
        enemyAnimStatesRef.current[enemyId] !== completedState ||
        (completedKey !== undefined && (enemyActionKeysRef.current[enemyId] ?? 0) !== completedKey)
      ) {
        return;
      }
      if (completedState === 'attack' || completedState === 'hurt') {
        const enemy = stageStateRef.current.enemies.find((e) => e.id === enemyId);
        if (enemy && enemy.hp <= 0) {
          triggerEnemyUnitAnim(enemyId, 'death');
        } else if (isWaveTransitionRef.current) {
          triggerEnemyUnitAnim(enemyId, 'walk');
        } else {
          triggerEnemyUnitAnim(enemyId, 'idle');
        }
      }
    },
    [triggerEnemyUnitAnim]
  );

  // React to combat events for lunge, hit-flash, floating text, and audio SFX
  useEffect(() => {
    if (!currentEvent || !replay) return;

    const eventKey = `${replay.seed}:${cursorIndex}`;
    if (lastProcessedEventKeyRef.current === eventKey) return;
    lastProcessedEventKeyRef.current = eventKey;

    const currentSpeed = speedMultiplierRef.current;
    const leadHeroId = stageStateRef.current.heroes[0]?.id ?? null;

    let impactTimer: ReturnType<typeof setTimeout> | null = null;
    let hitFlashTimeout: ReturnType<typeof setTimeout> | null = null;

    if (isTwoPhaseStrikeEvent(currentEvent, replay)) {
      setHeroFloatingText(null);
      setEnemyFloatingText(null);
    }

    setActiveActorId(currentEvent.actorId ?? null);
    setActiveTargetId(currentEvent.targetId ?? null);

    if (currentEvent.type === 'EXPEDITION_START') {
      return;
    }

    if (currentEvent.type === 'WORKOUT_BUFF_ACTIVE') {
      setHeroFloatingTargetId(leadHeroId);
      setHeroFloatingText('⚡ Buff Active!');
      setHeroFloatingColor(COLORS.gold);
      triggerHeroFloat(-34, Math.max(160, Math.round(400 / currentSpeed)));
      void audioManager.playSound('level-up');
      return;
    }

    if (currentEvent.type === 'ROOM_ENTER') {
      triggerWaveTransition();
      return;
    }

    if (isSupportSkillCast(currentEvent, replay)) {
      setResolvedImpactCursor(cursorIndex);
      if (currentEvent.actorId) {
        triggerHeroUnitAnim(currentEvent.actorId, 'attack');
      }
      if (currentEvent.targetId) {
        setHeroFloatingTargetId(currentEvent.targetId);
        setHeroFloatingText(`+${currentEvent.amount ?? 0} HP`);
        setHeroFloatingColor(COLORS.success);
        triggerHeroFloat(-34, Math.max(160, Math.round(400 / currentSpeed)));
        void audioManager.playSound('level-up');
      }
      return;
    }

    if (currentEvent.type === 'ROOM_CLEARED') {
      if (currentEvent.goldAwarded) {
        setHeroFloatingTargetId(leadHeroId);
        setHeroFloatingText(`💰 +${currentEvent.goldAwarded} Gold`);
        setHeroFloatingColor(COLORS.gold);
        triggerHeroFloat(-34, Math.max(160, Math.round(400 / currentSpeed)));
      }
      return;
    }

    if (currentEvent.type === 'LOOT_DROP') {
      setHeroFloatingTargetId(leadHeroId);
      const dropText = currentEvent.loot
        ? `🎁 +${currentEvent.loot.quantity}x ${currentEvent.loot.itemName}`
        : '🎁 Loot Found!';
      setHeroFloatingText(dropText);
      setHeroFloatingColor(COLORS.gold);
      triggerHeroFloat(-34, Math.max(180, Math.round(450 / currentSpeed)));
      void audioManager.playSound('level-up');
      return;
    }

    if (currentEvent.type === 'SHIELD_APPLIED' && currentEvent.targetId && currentEvent.amount) {
      setHeroFloatingTargetId(currentEvent.targetId);
      setHeroFloatingText(`+${currentEvent.amount} SHIELD`);
      setHeroFloatingColor(COLORS.shieldCyan);
      triggerHeroFloat(-34, 320);
      return;
    }

    if (
      (currentEvent.type === 'HEAL' || currentEvent.type === 'AURA_REGEN') &&
      currentEvent.targetId &&
      currentEvent.amount
    ) {
      setHeroFloatingTargetId(currentEvent.targetId);
      setHeroFloatingText(`+${currentEvent.amount} HP`);
      setHeroFloatingColor(COLORS.success);
      triggerHeroFloat(-34, 320);
      return;
    }

    if (currentEvent.type === 'BOSS_PHASE_SHIFT') {
      if (currentEvent.actorId) {
        setEnemyFloatingTargetId(currentEvent.actorId);
      }
      setEnemyFloatingText('🔥 ENRAGED!');
      setEnemyFloatingColor(COLORS.strength);
      triggerEnemyFloat(-34, 380);
      void audioManager.playSound('critical-hit');
      return;
    }

    if (currentEvent.type === 'HAZARD_RESOLVED') {
      if (currentEvent.targetId) {
        const isHeroTarget = replay.partySummaries.some((h) => h.characterId === currentEvent.targetId);
        const isDeadlyBlow = currentEvent.targetRemainingHp === 0;

        if (isHeroTarget) {
          setHeroFloatingTargetId(currentEvent.targetId);
          setHeroHitFlash(true);
          const text = `-${currentEvent.amount ?? 0}`;
          setHeroFloatingText(text);
          setHeroFloatingColor(COLORS.danger);
          triggerHeroFloat(-34, Math.max(140, Math.round(340 / currentSpeed)));

          triggerHeroUnitAnim(currentEvent.targetId, isDeadlyBlow ? 'death' : 'hurt');
          hitFlashTimeout = setTimeout(() => setHeroHitFlash(false), 90);
        }
      }
      void audioManager.playSound('enemy-damage');
      return;
    }

    if (currentEvent.type === 'BLEED_TICK') {
      setResolvedImpactCursor(cursorIndex);
      const isHeroTarget = replay.partySummaries.some((h) => h.characterId === currentEvent.targetId);
      const isDeadlyBlow = currentEvent.targetRemainingHp === 0;

      if (isHeroTarget && currentEvent.targetId) {
        setHeroFloatingTargetId(currentEvent.targetId);
        setHeroHitFlash(true);
        setHeroFloatingText(`🩸 -${currentEvent.amount ?? 0}`);
        setHeroFloatingColor(COLORS.danger);
        triggerHeroFloat(-34, Math.max(140, Math.round(340 / currentSpeed)));
        triggerHeroUnitAnim(currentEvent.targetId, isDeadlyBlow ? 'death' : 'hurt');
        hitFlashTimeout = setTimeout(() => setHeroHitFlash(false), 90);
      } else if (currentEvent.targetId) {
        setEnemyFloatingTargetId(currentEvent.targetId);
        setEnemyHitFlash(true);
        setEnemyFloatingText(`🩸 -${currentEvent.amount ?? 0}`);
        setEnemyFloatingColor(COLORS.danger);
        triggerEnemyFloat(-34, Math.max(140, Math.round(340 / currentSpeed)));
        triggerEnemyUnitAnim(currentEvent.targetId, isDeadlyBlow ? 'death' : 'hurt');
        hitFlashTimeout = setTimeout(() => setEnemyHitFlash(false), 90);
      }
      void audioManager.playSound('enemy-damage');
      return;
    }

    // Two-phase strike events (BASIC_ATTACK, offensive SKILL_CAST, DODGE)
    if (isTwoPhaseStrikeEvent(currentEvent, replay)) {
      const isHeroActor = replay.partySummaries.some((h) => h.characterId === currentEvent.actorId);
      const actorHero = isHeroActor ? stageStateRef.current.heroes.find((h) => h.id === currentEvent.actorId) : undefined;
      const actorEnemy = !isHeroActor ? stageStateRef.current.enemies.find((e) => e.id === currentEvent.actorId) : undefined;
      const actorSheet = isHeroActor
        ? resolveHeroSpriteConfig(actorHero?.name)
        : resolveEnemySpriteConfig(actorEnemy?.isBoss, actorEnemy?.name);

      const impactFrame = actorSheet.attackImpactFrame ?? 3;
      const rawImpactMs = currentEvent.type === 'DODGE'
        ? Math.round(impactFrame * actorSheet.clips.attack.frameDurationMs * 0.85)
        : impactFrame * actorSheet.clips.attack.frameDurationMs;
      const impactDelayMs = Math.max(55, Math.round(rawImpactMs / currentSpeed));
      const lungeReturnMs = Math.max(70, Math.round(250 / currentSpeed));

      // Phase 1 — Immediate at t = 0ms (Wind-Up & Lunge Start)
      if (isHeroActor && currentEvent.actorId) {
        triggerHeroUnitAnim(currentEvent.actorId, 'attack');
        triggerHeroLunge(impactDelayMs, lungeReturnMs);
      } else if (!isHeroActor && currentEvent.actorId) {
        triggerEnemyUnitAnim(currentEvent.actorId, 'attack');
        triggerEnemyLunge(impactDelayMs, lungeReturnMs);
      }

      // Phase 2 — Scheduled at t = impactDelayMs (Weapon Impact Moment!)
      impactTimer = setTimeout(() => {
        setResolvedImpactCursor(cursorIndex);

        if (currentEvent.type === 'DODGE') {
          const isHeroTarget = replay.partySummaries.some((h) => h.characterId === currentEvent.targetId);
          if (isHeroTarget && currentEvent.targetId) {
            setHeroFloatingTargetId(currentEvent.targetId);
            setHeroFloatingText('DODGE!');
            setHeroFloatingColor(COLORS.agility);
            triggerHeroFloat(-34, Math.max(160, Math.round(380 / currentSpeed)));
          } else if (currentEvent.targetId) {
            setEnemyFloatingTargetId(currentEvent.targetId);
            setEnemyFloatingText('DODGE!');
            setEnemyFloatingColor(COLORS.agility);
            triggerEnemyFloat(-34, Math.max(160, Math.round(380 / currentSpeed)));
          }
          void audioManager.playSound('enemy-damage');
          return;
        }

        // BASIC_ATTACK or offensive SKILL_CAST
        if (currentEvent.targetId) {
          const isHeroTarget = replay.partySummaries.some((h) => h.characterId === currentEvent.targetId);
          const isDeadlyBlow = currentEvent.targetRemainingHp === 0;

          if (isHeroTarget) {
            setHeroFloatingTargetId(currentEvent.targetId);
            setHeroHitFlash(true);
            const text = currentEvent.shieldAbsorbed
              ? `-${currentEvent.amount ?? 0} (🛡️${currentEvent.shieldAbsorbed})`
              : `-${currentEvent.amount ?? 0}`;

            setHeroFloatingText(text);
            setHeroFloatingColor(COLORS.danger);
            triggerHeroFloat(-34, Math.max(160, Math.round(420 / currentSpeed)));
            triggerHeroUnitAnim(currentEvent.targetId, isDeadlyBlow ? 'death' : 'hurt');
            hitFlashTimeout = setTimeout(() => setHeroHitFlash(false), 90);
          } else {
            setEnemyFloatingTargetId(currentEvent.targetId);
            setEnemyHitFlash(true);
            const skillPrefix = currentEvent.type === 'SKILL_CAST' && currentEvent.skillName ? `⚡ ${currentEvent.skillName} ` : '';
            const text = currentEvent.isCrit
              ? `💥 ${skillPrefix}-${currentEvent.amount ?? 0}`
              : `${skillPrefix}-${currentEvent.amount ?? 0}`;
            const color = currentEvent.isCrit
              ? COLORS.gold
              : currentEvent.type === 'SKILL_CAST'
                ? COLORS.agility
                : COLORS.textPrimary;

            setEnemyFloatingText(text);
            setEnemyFloatingColor(color);
            triggerEnemyFloat(-34, Math.max(160, Math.round(420 / currentSpeed)));
            triggerEnemyUnitAnim(currentEvent.targetId, isDeadlyBlow ? 'death' : 'hurt');
            hitFlashTimeout = setTimeout(() => setEnemyHitFlash(false), 90);
          }
        }

        if (currentEvent.isCrit) {
          void audioManager.playSound('critical-hit');
        } else if (isHeroActor) {
          void audioManager.playSound('hero-attack');
        } else {
          void audioManager.playSound('enemy-damage');
        }
      }, impactDelayMs);
      return;
    }

    if (currentEvent.type === 'UNIT_DEFEATED' && currentEvent.targetId) {
      setResolvedImpactCursor(cursorIndex);
      const isHeroTarget = replay.partySummaries.some((h) => h.characterId === currentEvent.targetId);
      if (isHeroTarget) {
        if (heroAnimStatesRef.current[currentEvent.targetId] !== 'death') {
          triggerHeroUnitAnim(currentEvent.targetId, 'death');
        }
      } else {
        if (enemyAnimStatesRef.current[currentEvent.targetId] !== 'death') {
          triggerEnemyUnitAnim(currentEvent.targetId, 'death');
        }
      }
      return;
    }

    if (currentEvent.type === 'EXPEDITION_END') {
      setResolvedImpactCursor(cursorIndex);
      if (replay.outcome === 'VICTORY') {
        void audioManager.playSound('level-up');
        stageStateRef.current.heroes.forEach((h) => {
          if (h.hp > 0) triggerHeroUnitAnim(h.id, 'idle');
        });
      } else {
        stageStateRef.current.heroes.forEach((h) => {
          triggerHeroUnitAnim(h.id, 'death');
        });
      }
    }

    return () => {
      if (impactTimer) {
        clearTimeout(impactTimer);
      }
      if (hitFlashTimeout) {
        clearTimeout(hitFlashTimeout);
      }
    };
  }, [
    currentEvent,
    cursorIndex,
    replay,
    triggerEnemyFloat,
    triggerEnemyLunge,
    triggerHeroFloat,
    triggerHeroLunge,
    triggerWaveTransition,
    triggerHeroUnitAnim,
    triggerEnemyUnitAnim,
  ]);

  // Compute scroll mode
  const scrollMode: ScrollMode = useMemo(() => {
    if (!replay) {
      return 'marching';
    }
    if (!isPlaying) {
      return 'paused';
    }
    if (cursorIndex >= replay.events.length - 1) {
      return 'paused';
    }
    if (isWaveTransition || stageState.activeRoomNum === 0) {
      return 'marching';
    }
    return 'combat';
  }, [replay, isPlaying, cursorIndex, isWaveTransition, stageState.activeRoomNum]);

  // Sprite configs
  const heroSheet = useMemo(() => resolveHeroSpriteConfig(leadHero?.name), [leadHero?.name]);

  const isLivePatrol = !replay;
  const isMarching = isLivePatrol || isWaveTransition || stageState.activeRoomNum === 0;

  const floatingHeroIndex = useMemo(() => {
    if (!heroFloatingTargetId) return 0;
    const idx = stageState.heroes.findIndex((h) => h.id === heroFloatingTargetId);
    return idx >= 0 ? idx : 0;
  }, [heroFloatingTargetId, stageState.heroes]);

  const floatingHeroSheet = useMemo(() => {
    const h = stageState.heroes[floatingHeroIndex];
    return resolveHeroSpriteConfig(h?.name);
  }, [stageState.heroes, floatingHeroIndex]);

  const floatingHeroPos = useMemo(() => {
    return getHeroStagePosition(floatingHeroIndex, viewportWidth, floatingHeroSheet);
  }, [floatingHeroIndex, viewportWidth, floatingHeroSheet]);

  const floatingEnemyIndex = useMemo(() => {
    if (!enemyFloatingTargetId) return 0;
    const idx = stageState.enemies.findIndex((e) => e.id === enemyFloatingTargetId);
    return idx >= 0 ? idx : 0;
  }, [enemyFloatingTargetId, stageState.enemies]);

  const floatingEnemy = stageState.enemies[floatingEnemyIndex];
  const floatingEnemySheet = useMemo(() => {
    return resolveEnemySpriteConfig(floatingEnemy?.isBoss, floatingEnemy?.name);
  }, [floatingEnemy?.isBoss, floatingEnemy?.name]);

  const floatingEnemyPos = useMemo(() => {
    return getEnemyStagePosition(floatingEnemyIndex, viewportWidth, floatingEnemySheet, floatingEnemy?.isBoss);
  }, [floatingEnemyIndex, viewportWidth, floatingEnemySheet, floatingEnemy?.isBoss]);

  const progressPct =
    replay && replay.events.length > 1 ? (cursorIndex / (replay.events.length - 1)) * 100 : 100;

  const recentFeed = replay
    ? replay.events.slice(Math.max(0, cursorIndex - 5), cursorIndex + 1).reverse()
    : [];

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* Sleek Top-Attached Expedition Status Banner */}
      <View style={styles.expeditionTopBanner}>
        <View style={styles.expeditionBannerTopRow}>
          <Text style={styles.expeditionBannerTitle}>
            {isLivePatrol
              ? '⏳ 24h Expedition Window • 🏰 Expedition Marching'
              : `📜 24h Expedition Resolved • Outcome: ${replay?.outcome ?? 'COMPLETED'}`}
          </Text>
          <Pressable
            style={styles.expeditionInfoToggleBtn}
            onPress={() => setShowExpeditionInfo((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Toggle expedition info"
          >
            <Text style={styles.expeditionInfoToggleText}>
              {showExpeditionInfo ? '✕ Close' : '? Info'}
            </Text>
          </Pressable>
        </View>

        {showExpeditionInfo && (
          <Text style={styles.expeditionInfoExplainer}>
            Log resistance or cardio workouts to inject Titanic Force or Tailwind Haste into the active vanguard party before the 24h window closes at 00:00 UTC!
          </Text>
        )}

        <View style={styles.expeditionBuffsRow}>
          {activeWorkoutBuffs && activeWorkoutBuffs.length > 0 ? (
            <View style={styles.buffsPillsCluster}>
              {activeWorkoutBuffs.map((buff) => (
                <View key={buff.buffId} style={styles.buffPill}>
                  <Text style={styles.buffPillText}>⚡ {buff.buffName}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.expeditionPromptText}>
              Log workouts to inject live party buffs before 00:00 UTC
            </Text>
          )}
        </View>
      </View>

      {/* 2D Animated Arena Stage (Z-0 through Z-20) */}
      <View style={styles.stage}>
        {/* Z-0 & Z-5: Parallax Terrain Layers */}
        <ParallaxBackground
          arenaConfig={WHITEWOOD_ARENA_PRESET}
          viewportWidth={viewportWidth}
          scrollMode={scrollMode}
          playbackRate={isLivePatrol ? 1 : speedMultiplier}
        />

        {/* Z-10: Companion Sprites */}
        {companions.map((comp, cIdx) => {
          const compIndex = cIdx + 1;
          const compSheet = resolveHeroSpriteConfig(comp.name);
          const pos = getHeroStagePosition(compIndex, viewportWidth, compSheet);
          const compAnim = heroAnimStates[comp.id] ?? 'idle';
          const effectiveCompState: AnimationState =
            comp.hp <= 0 ? 'death' : isMarching ? 'walk' : compAnim;
          const isCompActiveActor = activeActorId === comp.id;
          const isCompTarget = activeTargetId === comp.id;

          return (
            <ArenaAnimatedView
              key={comp.id}
              style={[
                styles.unitPositioner,
                {
                  left: pos.leftPx,
                  bottom: pos.bottomOffset,
                  zIndex: pos.zIndex,
                  opacity: comp.hp <= 0 ? 0.45 : 0.88,
                },
                isCompActiveActor ? heroTransformStyle : undefined,
              ]}
            >
              <SpriteAnimator
                config={compSheet}
                state={effectiveCompState}
                actionTriggerKey={heroActionKeys[comp.id] ?? 0}
                scale={pos.scale}
                flipHorizontal={false}
                playbackRate={isLivePatrol ? 1 : speedMultiplier}
                hitFlash={isCompTarget && heroHitFlash}
                paused={!isPlaying && !isLivePatrol}
                onAnimationComplete={(s, k) => handleHeroUnitAnimComplete(comp.id, s, k)}
              />
            </ArenaAnimatedView>
          );
        })}

        {/* Lead Hero Unit */}
        {leadHero && (() => {
          const leadPos = getHeroStagePosition(0, viewportWidth, heroSheet);
          const leadAnim = heroAnimStates[leadHero.id] ?? 'idle';
          const effectiveHeroState: AnimationState =
            leadHero.hp <= 0 ? 'death' : isMarching ? 'walk' : leadAnim;
          const isLeadActiveActor = activeActorId === leadHero.id;
          const isLeadTarget = activeTargetId === leadHero.id;

          return (
            <ArenaAnimatedView
              key={leadHero.id}
              style={[
                styles.unitPositioner,
                {
                  left: leadPos.leftPx,
                  bottom: leadPos.bottomOffset,
                  zIndex: leadPos.zIndex,
                },
                isLeadActiveActor ? heroTransformStyle : undefined,
              ]}
            >
              <SpriteAnimator
                config={heroSheet}
                state={effectiveHeroState}
                actionTriggerKey={heroActionKeys[leadHero.id] ?? 0}
                scale={leadPos.scale}
                flipHorizontal={false}
                playbackRate={isLivePatrol ? 1 : speedMultiplier}
                hitFlash={isLeadTarget && heroHitFlash}
                paused={!isPlaying && !isLivePatrol}
                onAnimationComplete={(s, k) => handleHeroUnitAnimComplete(leadHero.id, s, k)}
              />
            </ArenaAnimatedView>
          );
        })()}

        {/* Enemies (All living and defeated room units rendered simultaneously) */}
        {!isLivePatrol &&
          (stageState.activeRoomDef?.roomType === 'MOB_ENCOUNTER' ||
            stageState.activeRoomDef?.roomType === 'BOSS') &&
          stageState.enemies.map((enemy, eIdx) => {
            const enemySheet = resolveEnemySpriteConfig(enemy.isBoss, enemy.name);
            const pos = getEnemyStagePosition(eIdx, viewportWidth, enemySheet, enemy.isBoss);
            const animState = enemyAnimStates[enemy.id] ?? 'idle';
            const effectiveEnemyState: AnimationState =
              enemy.hp <= 0 ? 'death' : isWaveTransition ? 'walk' : animState;
            const isEnemyActiveActor = activeActorId === enemy.id;
            const isEnemyTarget = activeTargetId === enemy.id;

            return (
              <ArenaAnimatedView
                key={enemy.id}
                style={[
                  styles.unitPositioner,
                  {
                    right: pos.rightPx,
                    bottom: pos.bottomOffset,
                    zIndex: pos.zIndex,
                    opacity: enemy.hp <= 0 ? 0.55 : 1,
                  },
                  enemyApproachStyle,
                  isEnemyActiveActor ? enemyLungeStyle : undefined,
                ]}
              >
                {enemy.hp > 0 && (
                  <View
                    style={[
                      styles.enemyMiniHpTrack,
                      {
                        left: Math.round((pos.cellSize - 46) / 2),
                        bottom: (pos.baselineBottom + (enemy.isBoss ? 78 : 62)) - pos.bottomOffset,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.enemyMiniHpFill,
                        {
                          width: `${Math.max(0, Math.min(100, (enemy.hp / enemy.maxHp) * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                )}
                <SpriteAnimator
                  key={enemy.id}
                  config={enemySheet}
                  state={effectiveEnemyState}
                  actionTriggerKey={enemyActionKeys[enemy.id] ?? 0}
                  scale={pos.scale}
                  flipHorizontal={true}
                  playbackRate={speedMultiplier}
                  hitFlash={isEnemyTarget && enemyHitFlash}
                  paused={!isPlaying}
                  onAnimationComplete={(s, k) => handleEnemyUnitAnimComplete(enemy.id, s, k)}
                />
                {enemy.enraged && (
                  <View style={styles.enragedBadge}>
                    <Text style={styles.enragedBadgeText}>🔥 ENRAGED</Text>
                  </View>
                )}
              </ArenaAnimatedView>
            );
          })}

        {/* Non-combat room feature (Treasure chest or hazard) */}
        {!isLivePatrol &&
          (stageState.activeRoomDef?.roomType === 'LOOT_CHEST' ||
            stageState.activeRoomDef?.roomType === 'HAZARD_EVENT') && (
            <ArenaAnimatedView
              style={[
                styles.unitPositioner,
                {
                  right: Math.max(12, Math.round(viewportWidth * 0.13)) + 12,
                  bottom: 42,
                  zIndex: 10,
                },
                enemyApproachStyle,
              ]}
            >
              <View
                style={[
                  styles.shadowEllipse,
                  {
                    left: 10,
                    bottom: -4,
                    width: 52,
                    height: 10,
                  },
                ]}
              />
              <ExpoImage
                source={{
                  uri:
                    stageState.activeRoomDef?.roomType === 'HAZARD_EVENT'
                      ? LOOT_SPRITES.relic_trophy
                      : LOOT_SPRITES.chest_epic,
                }}
                style={styles.roomFeatureSprite}
                contentFit="contain"
              />
            </ArenaAnimatedView>
          )}

        {/* Z-20: Floating Combat Numbers */}
        {heroFloatingText && (
          <ArenaAnimatedView
            pointerEvents="none"
            style={[
              styles.floatingTextContainer,
              {
                left: floatingHeroPos.leftPx,
                width: floatingHeroPos.cellSize,
                bottom: floatingHeroPos.baselineBottom + 88,
                zIndex: 20,
              },
              heroFloatStyle,
            ]}
          >
            <Text style={[styles.floatingCombatText, { color: heroFloatingColor }]}>
              {heroFloatingText}
            </Text>
          </ArenaAnimatedView>
        )}

        {enemyFloatingText && (
          <ArenaAnimatedView
            pointerEvents="none"
            style={[
              styles.floatingTextContainer,
              {
                right: floatingEnemyPos.rightPx,
                width: floatingEnemyPos.cellSize,
                bottom: floatingEnemyPos.baselineBottom + (floatingEnemy?.isBoss ? 102 : 88),
                zIndex: 20,
              },
              enemyFloatStyle,
            ]}
          >
            <Text style={[styles.floatingCombatText, { color: enemyFloatingColor }]}>
              {enemyFloatingText}
            </Text>
          </ArenaAnimatedView>
        )}

        {/* Z-20: Compact Top Arena HUD */}
        <View style={styles.topHudBar} pointerEvents="none">
          {leadHero && (
            <View style={styles.hudCombatantBox}>
              <Text style={styles.hudNameText} numberOfLines={1}>
                🛡️ {leadHero.name}
              </Text>
              <View style={styles.hudBarTrack}>
                <View
                  style={[
                    styles.hudHpFill,
                    {
                      width: `${Math.max(0, Math.min(100, (leadHero.hp / leadHero.maxHp) * 100))}%`,
                    },
                  ]}
                />
                {leadHero.shieldHp > 0 && (
                  <View
                    style={[
                      styles.hudShieldFill,
                      {
                        width: `${Math.max(0, Math.min(100, (leadHero.shieldHp / leadHero.maxHp) * 100))}%`,
                      },
                    ]}
                  />
                )}
              </View>
              <Text style={styles.hudStatText}>
                {leadHero.hp}/{leadHero.maxHp}
                {leadHero.shieldHp > 0 ? ` (+${leadHero.shieldHp}🛡️)` : ''}
              </Text>
            </View>
          )}

          <View style={styles.hudCenterBadge}>
            <Text style={styles.hudCenterRoomText}>
              Room {stageState.activeRoomNum}/{dungeon.rooms.length}
            </Text>
            <View
              style={[
                styles.hudPhasePill,
                {
                  backgroundColor: isLivePatrol
                    ? COLORS.enduranceDim
                    : replay?.outcome === 'VICTORY'
                      ? COLORS.enduranceDim
                      : COLORS.goldDim,
                },
              ]}
            >
              <Text
                style={[
                  styles.hudPhaseText,
                  {
                    color: isLivePatrol
                      ? COLORS.endurance
                      : replay?.outcome === 'VICTORY'
                        ? COLORS.endurance
                        : COLORS.gold,
                  },
                ]}
              >
                {isLivePatrol
                  ? 'MARCHING'
                  : cursorIndex >= (replay?.events.length ?? 0) - 1
                    ? replay?.outcome ?? 'RESOLVED'
                    : isWaveTransition || stageState.activeRoomNum === 0
                      ? 'MARCHING'
                      : stageState.activeRoomDef?.roomType === 'LOOT_CHEST'
                        ? 'TREASURE'
                        : stageState.activeRoomDef?.roomType === 'HAZARD_EVENT'
                          ? 'HAZARD'
                          : 'COMBAT'}
              </Text>
            </View>
          </View>

          {!isLivePatrol &&
          primaryHudEnemy &&
          (stageState.activeRoomDef?.roomType === 'MOB_ENCOUNTER' ||
            stageState.activeRoomDef?.roomType === 'BOSS') ? (
            <View style={[styles.hudCombatantBox, styles.hudRightAlign]}>
              <Text style={styles.hudNameText} numberOfLines={1}>
                {primaryHudEnemy.isBoss ? '💀 ' : '⚔️ '}
                {primaryHudEnemy.name}
              </Text>
              <View style={styles.hudBarTrack}>
                <View
                  style={[
                    styles.hudHpFillEnemy,
                    {
                      width: `${Math.max(0, Math.min(100, (primaryHudEnemy.hp / primaryHudEnemy.maxHp) * 100))}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.hudStatText}>
                {primaryHudEnemy.hp}/{primaryHudEnemy.maxHp}
              </Text>
            </View>
          ) : (
            <View style={[styles.hudCombatantBox, styles.hudRightAlign]}>
              <Text style={styles.hudNameText} numberOfLines={1}>
                {stageState.activeRoomDef?.roomType === 'LOOT_CHEST'
                  ? '🎁 Treasure Cache'
                  : stageState.activeRoomDef?.roomType === 'HAZARD_EVENT'
                    ? '⚠️ Trap Hazard'
                    : stageState.activeRoomDef?.roomName ?? 'Expedition Gate'}
              </Text>
              <Text style={styles.hudStatText}>
                {stageState.activeRoomDef?.roomType === 'LOOT_CHEST'
                  ? 'Loot Opportunity'
                  : stageState.activeRoomDef?.roomType === 'HAZARD_EVENT'
                    ? 'Hazard Challenge'
                    : 'Safe Zone'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Telemetry & Controls Below the Arena Stage */}
      {replay && (
        <>
          <View style={styles.scrubberTrack}>
            <View style={[styles.scrubberFill, { width: `${progressPct}%` }]} />
          </View>

          <View style={styles.controlsRow}>
            <Pressable
              style={styles.controlBtn}
              onPress={() => {
                if (cursorIndex >= replay.events.length - 1) {
                  setCursorIndex(0);
                  setResolvedImpactCursor(-1);
                  setIsPlaying(true);
                  setActiveActorId(null);
                  setActiveTargetId(null);
                  setHeroFloatingTargetId(null);
                  setEnemyFloatingTargetId(null);
                  setHeroFloatingText(null);
                  setEnemyFloatingText(null);
                  heroAnimStatesRef.current = {};
                  heroActionKeysRef.current = {};
                  enemyAnimStatesRef.current = {};
                  enemyActionKeysRef.current = {};
                  lastProcessedEventKeyRef.current = '';
                  setHeroAnimStates({});
                  setHeroActionKeys({});
                  setEnemyAnimStates({});
                  setEnemyActionKeys({});
                  hasTriggeredFanfareRef.current = false;
                  setRevealedIndices([]);
                  setFanfareModalVisible(false);
                } else {
                  setIsPlaying((p) => !p);
                }
              }}
            >
              <Text style={styles.controlBtnText}>
                {cursorIndex >= replay.events.length - 1
                  ? '↻ Replay'
                  : isPlaying
                    ? '⏸ Pause'
                    : '▶ Play'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.controlBtnSecondary}
              onPress={() => {
                setIsPlaying(false);
                setIsWaveTransition(false);
                setResolvedImpactCursor(replay.events.length - 1);
                setActiveActorId(null);
                setActiveTargetId(null);
                setHeroFloatingText(null);
                setEnemyFloatingText(null);
                setCursorIndex(replay.events.length - 1);
                setFanfareModalVisible(true);
                triggerSensoryCue('DUNGEON_CLEARED_FANFARE');
                void audioManager.playSound('level-up');
              }}
            >
              <Text style={styles.controlBtnSecondaryText}>⏭ Skip to End</Text>
            </Pressable>

            <View style={styles.speedGroup}>
              {([1, 2, 4] as const).map((spd) => (
                <Pressable
                  key={spd}
                  style={[
                    styles.speedChip,
                    speedMultiplier === spd && styles.speedChipActive,
                  ]}
                  onPress={() => setSpeedMultiplier(spd)}
                >
                  <Text
                    style={[
                      styles.speedChipText,
                      speedMultiplier === spd && styles.speedChipTextActive,
                    ]}
                  >
                    {spd}x
                  </Text>
                </Pressable>
              ))}
            </View>

            {onDismiss && (
              <Pressable
                style={styles.controlDismissBtn}
                onPress={onDismiss}
                testID="dismiss-dungeon-replay-btn-top"
              >
                <Text style={styles.controlDismissBtnText}>✕ Close</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.rosterSection}>
            <Text style={styles.rosterSectionHeader}>PARTY STATUS</Text>
            <View style={styles.rosterWrap}>
              {stageState.heroes.map((h) => {
                const hpPct = Math.max(0, Math.min(100, (h.hp / h.maxHp) * 100));
                const borderColor =
                  activeActorId === h.id
                    ? COLORS.gold
                    : activeTargetId === h.id
                      ? COLORS.danger
                      : h.hp <= 0
                        ? COLORS.danger
                        : COLORS.border;
                return (
                  <View
                    key={h.id}
                    style={[
                      styles.rosterPill,
                      { borderColor },
                      h.hp <= 0 && styles.rosterPillDefeated,
                    ]}
                  >
                    <Text style={styles.rosterPillName} numberOfLines={1}>
                      {h.name}
                    </Text>
                    <View style={styles.rosterHpTrack}>
                      <View style={[styles.rosterHpFill, { width: `${hpPct}%` }]} />
                    </View>
                    <Text style={styles.rosterHpText}>
                      {h.hp}/{h.maxHp}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.logBox}>
            <Text style={styles.logHeader}>
              COMBAT EVENT LOG ({cursorIndex + 1}/{replay.events.length})
            </Text>
            <ScrollView style={styles.logScroll} nestedScrollEnabled>
              {recentFeed.map((ev) => (
                <Text key={ev.seq} style={styles.logLine}>
                  <Text style={styles.logTime}>[{ev.tSec.toFixed(1)}s] </Text>
                  {ev.message}
                </Text>
              ))}
            </ScrollView>
          </View>

          <View style={styles.lootSummaryBox}>
            <Text style={styles.lootHeader}>
              🏆 Expedition Spoils: +{replay.totalGoldEarned} Gold
            </Text>
            <View style={styles.lootWrap}>
              {replay.lootDrops.map((drop) => (
                <View key={drop.itemSlug} style={styles.lootPill}>
                  <Text
                    style={[
                      styles.lootPillText,
                      { color: RARITY_COLORS[drop.rarity] ?? COLORS.textPrimary },
                    ]}
                  >
                    {drop.quantity}x {drop.itemName} [{drop.rarity}]
                  </Text>
                </View>
              ))}
            </View>

            <Pressable
              style={styles.openSpoilsChestBtn}
              onPress={() => setFanfareModalVisible(true)}
              testID="open-expedition-spoils-chest-btn"
            >
              <Text style={styles.openSpoilsChestBtnText}>🎁 Open Expedition Spoils Chest</Text>
            </Pressable>
          </View>

          {/* Expedition Spoils Fanfare Modal */}
          <Modal
            visible={fanfareModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setFanfareModalVisible(false)}
          >
            <View style={styles.fanfareModalBackdrop}>
              <View
                style={[
                  styles.fanfareModalCard,
                  replay.outcome !== 'VICTORY' && {
                    borderColor: '#DC2626',
                    backgroundColor: '#160F13',
                  },
                ]}
              >
                <Pressable
                  style={styles.fanfareCloseCornerBtn}
                  onPress={() => setFanfareModalVisible(false)}
                  testID="fanfare-modal-close-btn"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.fanfareCloseCornerBtnText}>✕</Text>
                </Pressable>

                {replay.outcome === 'VICTORY' ? (
                  <SvgXml
                    xml={LOOT_CHEST_SVGS.MYTHIC}
                    width={96}
                    height={80}
                    style={styles.fanfareChestSvg}
                  />
                ) : (
                  <View
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: 34,
                      backgroundColor: 'rgba(220, 38, 38, 0.16)',
                      borderWidth: 1.5,
                      borderColor: '#EF4444',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ fontSize: 32 }}>💀</Text>
                  </View>
                )}

                <Text
                  style={[
                    styles.fanfareOutcome,
                    replay.outcome !== 'VICTORY' && { color: '#F87171' },
                  ]}
                >
                  {replay.outcome === 'VICTORY'
                    ? '🏆 EXPEDITION VICTORY'
                    : replay.outcome === 'TIMEOUT'
                      ? `⏳ EXPEDITION TIMED OUT (Room ${Math.min(
                          replay.totalRooms,
                          replay.roomsCleared + 1
                        )}/${replay.totalRooms})`
                      : `💀 EXPEDITION WIPED (Room ${Math.min(
                          replay.totalRooms,
                          replay.roomsCleared + 1
                        )}/${replay.totalRooms})`}
                </Text>
                <Text style={styles.fanfareDungeonName}>{dungeon.dungeonName}</Text>

                {replay.outcome !== 'VICTORY' && (
                  <View
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderWidth: 1,
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      marginTop: 6,
                      marginBottom: 4,
                      width: '100%',
                    }}
                  >
                    <Text
                      style={{
                        color: '#FCA5A5',
                        fontSize: 11,
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    >
                      💡 Log real-world workouts for Live Combat Buffs, upgrade armaments, or
                      recruit Guild allies to overcome the Boss.
                    </Text>
                  </View>
                )}

                {(replay.outcome === 'VICTORY' || replay.totalGoldEarned > 0) && (
                  <View
                    style={[
                      styles.fanfareGoldPill,
                      replay.outcome !== 'VICTORY' && {
                        borderColor: '#9CA3AF',
                        backgroundColor: 'rgba(156, 163, 175, 0.12)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.fanfareGoldText,
                        replay.outcome !== 'VICTORY' && { color: '#E5E7EB' },
                      ]}
                    >
                      +{replay.totalGoldEarned} {replay.outcome === 'VICTORY' ? 'Gold' : 'Salvaged Gold'}
                    </Text>
                  </View>
                )}

                <View style={styles.fanfareSectionHeader}>
                  <Text style={styles.fanfareSectionTitle}>
                    {replay.outcome === 'VICTORY'
                      ? `EXPEDITION SPOILS (${revealedIndices.length}/${replay.lootDrops.length})`
                      : `PARTIAL DELVE SALVAGE (${replay.roomsCleared}/${replay.totalRooms} ROOMS CLEARED)`}
                  </Text>
                  {replay.lootDrops.length > 1 && revealedIndices.length < replay.lootDrops.length && (
                    <Pressable
                      style={styles.fanfareRevealAllBtn}
                      onPress={handleRevealAllSpoils}
                      testID="fanfare-reveal-all-btn"
                    >
                      <Text style={styles.fanfareRevealAllText}>✨ Reveal All</Text>
                    </Pressable>
                  )}
                </View>

                {replay.lootDrops.length === 0 ? (
                  <Text style={styles.fanfareEmptySpoils}>
                    {replay.outcome === 'VICTORY'
                      ? 'No item spoils recovered on this delve.'
                      : replay.roomsCleared === 0
                        ? 'Fell in Room 1 before securing any room salvage. Defeat the Boss to unlock major expedition spoils!'
                        : 'No item salvage dropped in cleared rooms. Defeat the Boss to unlock 65%+ of expedition rewards!'}
                  </Text>
                ) : (
                  <ScrollView
                    style={styles.fanfareDropsList}
                    contentContainerStyle={styles.fanfareDropsListContent}
                    nestedScrollEnabled
                  >
                    {replay.lootDrops.map((drop, idx) => {
                      const isRevealed = revealedIndices.includes(idx);
                      const rarityCol = RARITY_COLORS[drop.rarity] ?? COLORS.textPrimary;
                      const iconSrc = getItemIconSource(drop.baseSlug ?? drop.itemSlug);

                      if (!isRevealed) {
                        return (
                          <Pressable
                            key={`${drop.itemSlug}-${idx}`}
                            style={[styles.fanfareSealedCard, { borderColor: rarityCol }]}
                            onPress={() => handleUnsealDrop(idx)}
                            testID={`unseal-drop-${idx}`}
                          >
                            <Text style={styles.fanfareSealedIcon}>🔒</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.fanfareSealedTitle}>Tap to Unseal Spoils</Text>
                              <Text style={[styles.fanfareSealedSubtitle, { color: rarityCol }]}>
                                {drop.rarity} {drop.tier ? `• Tier ${drop.tier}` : ''} Reliquary Cache
                              </Text>
                            </View>
                            <View style={[styles.fanfareUnsealPill, { borderColor: rarityCol }]}>
                              <Text style={[styles.fanfareUnsealPillText, { color: rarityCol }]}>
                                Unseal
                              </Text>
                            </View>
                          </Pressable>
                        );
                      }

                      return (
                        <View
                          key={`${drop.itemSlug}-${idx}`}
                          style={[styles.fanfareRevealedCard, { borderColor: rarityCol }]}
                        >
                          <View style={[styles.fanfareIconBox, { borderColor: rarityCol }]}>
                            {iconSrc ? (
                              <ExpoImage
                                source={iconSrc as any}
                                style={styles.fanfareIconImage}
                                contentFit="cover"
                              />
                            ) : (
                              <Text style={styles.fanfareFallbackGlyph}>📦</Text>
                            )}
                            {drop.tier ? (
                              <View
                                style={[
                                  styles.fanfareTierBadge,
                                  { backgroundColor: rarityCol },
                                ]}
                              >
                                <Text style={styles.fanfareTierBadgeText}>T{drop.tier}</Text>
                              </View>
                            ) : null}
                          </View>

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={styles.fanfareTitleRow}>
                              <Text
                                style={[styles.fanfareItemName, { color: rarityCol }]}
                                numberOfLines={1}
                              >
                                {drop.itemName}
                              </Text>
                              {drop.quantity > 1 && (
                                <View style={styles.fanfareQtyBadge}>
                                  <Text style={styles.fanfareQtyBadgeText}>x{drop.quantity}</Text>
                                </View>
                              )}
                            </View>

                            <View style={styles.fanfarePillsRow}>
                              <View style={[styles.fanfareRarityPill, { borderColor: rarityCol }]}>
                                <Text
                                  style={[styles.fanfareRarityPillText, { color: rarityCol }]}
                                >
                                  {drop.rarity}
                                </Text>
                              </View>
                              {drop.tier ? (
                                <View style={styles.fanfareSubPill}>
                                  <Text style={styles.fanfareSubPillText}>Tier {drop.tier}</Text>
                                </View>
                              ) : null}
                              {drop.prefixLabel ? (
                                <View style={[styles.fanfareAffixPill, styles.fanfareAffixPrefix]}>
                                  <Text style={styles.fanfareAffixPrefixText}>
                                    {drop.prefixLabel}
                                  </Text>
                                </View>
                              ) : null}
                              {drop.suffixLabel ? (
                                <View style={[styles.fanfareAffixPill, styles.fanfareAffixSuffix]}>
                                  <Text style={styles.fanfareAffixSuffixText}>
                                    {drop.suffixLabel}
                                  </Text>
                                </View>
                              ) : null}
                              {drop.uniquePassive ? (
                                <View style={[styles.fanfareAffixPill, styles.fanfareAffixUnique]}>
                                  <Text style={styles.fanfareAffixUniqueText}>
                                    ★ {drop.uniquePassive.uniqueName}
                                  </Text>
                                </View>
                              ) : null}
                            </View>

                            {drop.baseStatsSummary ? (
                              <Text style={styles.fanfareStatsText} numberOfLines={2}>
                                {drop.baseStatsSummary}
                              </Text>
                            ) : drop.primaryStatBonuses ? (
                              <Text style={styles.fanfareStatsText} numberOfLines={1}>
                                {Object.entries(drop.primaryStatBonuses)
                                  .filter(([_, v]) => (v ?? 0) > 0)
                                  .map(([k, v]) => `+${v} ${k}`)
                                  .join(' • ')}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}

                <Pressable
                  style={[
                    styles.fanfareClaimBtn,
                    replay.outcome !== 'VICTORY' && {
                      backgroundColor: '#27272A',
                      borderWidth: 1,
                      borderColor: '#EF4444',
                    },
                  ]}
                  onPress={() => {
                    setFanfareModalVisible(false);
                    onDismiss?.();
                  }}
                  testID="claim-expedition-spoils-btn"
                >
                  <Text
                    style={[
                      styles.fanfareClaimBtnText,
                      replay.outcome !== 'VICTORY' && { color: '#FCA5A5' },
                    ]}
                  >
                    {replay.outcome === 'VICTORY'
                      ? '✨ Claim Spoils & Complete Expedition'
                      : replay.roomsCleared > 0
                        ? '📦 Recover Salvage & Retreat'
                        : '🛡️ Retreat to Sanctum'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginTop: 12,
  },
  stage: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0a0d14',
  },
  shadowEllipse: {
    position: 'absolute',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    zIndex: 1,
  },
  unitPositioner: {
    position: 'absolute',
  },
  enragedBadge: {
    position: 'absolute',
    top: -20,
    alignSelf: 'center',
    backgroundColor: 'rgba(239, 83, 80, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  enragedBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  enemyMiniHpTrack: {
    position: 'absolute',
    width: 46,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    overflow: 'hidden',
    zIndex: 15,
  },
  enemyMiniHpFill: {
    height: '100%',
    backgroundColor: COLORS.strength,
    borderRadius: 2,
  },
  roomFeatureSprite: {
    width: 72,
    height: 72,
  },
  floatingTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCombatText: {
    fontSize: 14,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  topHudBar: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 20,
  },
  hudCombatantBox: {
    backgroundColor: 'rgba(18, 23, 34, 0.82)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    minWidth: 100,
  },
  hudRightAlign: {
    alignItems: 'flex-end',
  },
  hudNameText: {
    color: COLORS.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  hudBarTrack: {
    width: 90,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
    marginVertical: 2,
  },
  hudHpFill: {
    height: '100%',
    backgroundColor: COLORS.endurance,
    borderRadius: 3,
  },
  hudHpFillEnemy: {
    height: '100%',
    backgroundColor: COLORS.strength,
    borderRadius: 3,
  },
  hudShieldFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: COLORS.shieldCyan,
    opacity: 0.7,
  },
  hudStatText: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '600',
  },
  hudCenterBadge: {
    alignItems: 'center',
  },
  hudCenterRoomText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  hudPhasePill: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  hudPhaseText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  patrolBannerContainer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    zIndex: 20,
    alignItems: 'center',
  },
  patrolBanner: {
    backgroundColor: 'rgba(18, 23, 34, 0.88)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(66, 165, 245, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    width: '100%',
  },
  patrolBannerTitle: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  patrolBannerSub: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginTop: 3,
    textAlign: 'center',
  },
  buffsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    justifyContent: 'center',
  },
  buffPill: {
    backgroundColor: COLORS.bgElevated,
    borderColor: COLORS.gold,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  buffPillText: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '700',
  },
  scrubberTrack: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 10,
  },
  scrubberFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  controlBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  controlBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  controlBtnSecondary: {
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  controlBtnSecondaryText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },
  speedGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  speedChip: {
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  speedChipActive: {
    backgroundColor: COLORS.goldDim,
    borderColor: COLORS.gold,
  },
  speedChipText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  speedChipTextActive: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  rosterSection: {
    marginTop: 10,
  },
  rosterSectionHeader: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  rosterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rosterPill: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rosterPillDefeated: {
    opacity: 0.5,
    borderColor: COLORS.danger,
  },
  rosterPillName: {
    color: COLORS.textPrimary,
    fontSize: 10,
    fontWeight: '600',
  },
  rosterHpTrack: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  rosterHpFill: {
    height: '100%',
    backgroundColor: COLORS.endurance,
  },
  rosterHpText: {
    color: COLORS.textMuted,
    fontSize: 9,
  },
  logBox: {
    marginTop: 10,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
  },
  logHeader: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  logScroll: {
    maxHeight: 90,
  },
  logLine: {
    color: COLORS.textSecondary,
    fontSize: 10,
    lineHeight: 15,
  },
  logTime: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  lootSummaryBox: {
    marginTop: 10,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
  },
  lootHeader: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  lootWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  lootPill: {
    backgroundColor: COLORS.bgDeep,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lootPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  expeditionTopBanner: {
    backgroundColor: '#1C182A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4A3D63',
    padding: 10,
    marginBottom: 8,
  },
  expeditionBannerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  expeditionBannerTitle: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '900',
    flex: 1,
  },
  expeditionInfoToggleBtn: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  expeditionInfoToggleText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  expeditionInfoExplainer: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#2C273E',
  },
  expeditionBuffsRow: {
    marginTop: 6,
  },
  buffsPillsCluster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  expeditionPromptText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  controlDismissBtn: {
    backgroundColor: 'rgba(239, 83, 80, 0.18)',
    borderColor: COLORS.danger,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  controlDismissBtnText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  openSpoilsChestBtn: {
    marginTop: 10,
    backgroundColor: 'rgba(198, 154, 69, 0.16)',
    borderColor: CRIMSON_ONI.agedGold,
    borderWidth: 1.2,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openSpoilsChestBtnText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  /* Fanfare Modal */
  fanfareModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 12, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  fanfareModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#121622',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: CRIMSON_ONI.agedGold,
    padding: 18,
    maxHeight: '90%',
    position: 'relative',
    shadowColor: '#000000',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  fanfareCloseCornerBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2433',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  fanfareCloseCornerBtnText: {
    color: CRIMSON_ONI.ashGray,
    fontSize: 14,
    fontWeight: '800',
  },
  fanfareChestSvg: {
    alignSelf: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  fanfareOutcome: {
    fontSize: 18,
    fontWeight: '900',
    color: CRIMSON_ONI.agedGoldBright,
    textAlign: 'center',
    letterSpacing: 1,
  },
  fanfareDungeonName: {
    fontSize: 13,
    color: CRIMSON_ONI.ashGray,
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '700',
  },
  fanfareGoldPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(245, 184, 65, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
    marginBottom: 10,
  },
  fanfareGoldText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '900',
  },
  fanfareSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
  },
  fanfareSectionTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  fanfareRevealAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#262D3D',
    borderWidth: 1,
    borderColor: CRIMSON_ONI.agedGold,
  },
  fanfareRevealAllText: {
    color: CRIMSON_ONI.agedGoldBright,
    fontSize: 11,
    fontWeight: '800',
  },
  fanfareEmptySpoils: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginVertical: 16,
  },
  fanfareDropsList: {
    maxHeight: 280,
    marginVertical: 4,
  },
  fanfareDropsListContent: {
    paddingBottom: 4,
  },
  fanfareSealedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B29',
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 10,
    marginVertical: 4,
    gap: 10,
  },
  fanfareSealedIcon: {
    fontSize: 22,
  },
  fanfareSealedTitle: {
    color: CRIMSON_ONI.ghostWhite,
    fontSize: 13,
    fontWeight: '800',
  },
  fanfareSealedSubtitle: {
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 2,
  },
  fanfareUnsealPill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#0F131D',
  },
  fanfareUnsealPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  fanfareRevealedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B29',
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 10,
    marginVertical: 4,
    gap: 10,
  },
  fanfareIconBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: '#0B0E14',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  fanfareIconImage: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  fanfareFallbackGlyph: {
    fontSize: 20,
  },
  fanfareTierBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderBottomLeftRadius: 4,
  },
  fanfareTierBadgeText: {
    color: '#FFFFFF',
    fontSize: 7.5,
    fontWeight: '900',
  },
  fanfareTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fanfareItemName: {
    fontSize: 13,
    fontWeight: '900',
    flexShrink: 1,
  },
  fanfareQtyBadge: {
    backgroundColor: '#273248',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  fanfareQtyBadgeText: {
    color: '#F3F6FC',
    fontSize: 9,
    fontWeight: '800',
  },
  fanfarePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginVertical: 3,
  },
  fanfareRarityPill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  fanfareRarityPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  fanfareSubPill: {
    backgroundColor: '#1E2433',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  fanfareSubPillText: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  fanfareAffixPill: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  fanfareAffixPrefix: {
    backgroundColor: 'rgba(66, 165, 245, 0.15)',
    borderWidth: 1,
    borderColor: '#42A5F5',
  },
  fanfareAffixPrefixText: {
    color: '#42A5F5',
    fontSize: 8.5,
    fontWeight: '700',
  },
  fanfareAffixSuffix: {
    backgroundColor: 'rgba(255, 167, 38, 0.15)',
    borderWidth: 1,
    borderColor: '#FFA726',
  },
  fanfareAffixSuffixText: {
    color: '#FFA726',
    fontSize: 8.5,
    fontWeight: '700',
  },
  fanfareAffixUnique: {
    backgroundColor: 'rgba(171, 71, 188, 0.2)',
    borderWidth: 1,
    borderColor: '#AB47BC',
  },
  fanfareAffixUniqueText: {
    color: '#E1BEE7',
    fontSize: 8.5,
    fontWeight: '800',
  },
  fanfareStatsText: {
    color: COLORS.textSecondary,
    fontSize: 10.5,
    marginTop: 2,
  },
  fanfareClaimBtn: {
    marginTop: 14,
    backgroundColor: CRIMSON_ONI.agedGold,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: CRIMSON_ONI.agedGoldBright,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  fanfareClaimBtnText: {
    color: '#121114',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
