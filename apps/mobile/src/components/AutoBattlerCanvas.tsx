import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Rect, Stop } from 'react-native-svg';
import { Image } from 'expo-image';
import {
  CombatReplayEvent,
  DungeonCombatReplayResult,
  DungeonDefinition,
} from '@gymify/game-engine';
import { COLORS, RARITY_COLORS } from '../theme';
import {
  getHeroSpriteUri,
  getEnemySpriteUri,
  LOOT_SPRITES,
} from '../assets/sprites';
import { audioManager } from '../services/AudioManager';

interface AutoBattlerCanvasProps {
  replay: DungeonCombatReplayResult;
  dungeon: DungeonDefinition;
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

export const AutoBattlerCanvas: React.FC<AutoBattlerCanvasProps> = ({
  replay,
  dungeon,
}) => {
  const [cursorIndex, setCursorIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 4>(2);

  const heroLungeAnim = useRef(new Animated.Value(0)).current;
  const enemyShakeAnim = useRef(new Animated.Value(0)).current;
  const hitFlashAnim = useRef(new Animated.Value(0)).current;
  const damageFloatAnim = useRef(new Animated.Value(0)).current;
  const [hitTargetId, setHitTargetId] = useState<string | null>(null);

  // Reset cursor when a new replay arrives
  useEffect(() => {
    setCursorIndex(0);
    setIsPlaying(true);
  }, [replay.seed]);

  // Advance event cursor smoothly on playback timer
  useEffect(() => {
    if (!isPlaying) return;
    if (cursorIndex >= replay.events.length - 1) {
      setIsPlaying(false);
      return;
    }

    const intervalMs = Math.max(45, Math.round(180 / speedMultiplier));
    const timer = setInterval(() => {
      setCursorIndex((prev) => {
        if (prev >= replay.events.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [cursorIndex, isPlaying, replay.events.length, speedMultiplier]);

  const currentEvent: CombatReplayEvent | undefined = replay.events[cursorIndex];

  // Trigger lunge/shake 2D animation, hit-flash, floating numbers, and audio SFX
  useEffect(() => {
    if (!currentEvent) return;

    if (
      currentEvent.type === 'BASIC_ATTACK' ||
      currentEvent.type === 'SKILL_CAST' ||
      currentEvent.type === 'BLEED_TICK' ||
      currentEvent.type === 'HAZARD_RESOLVED'
    ) {
      const isHeroActor = replay.partySummaries.some(
        (h) => h.characterId === currentEvent.actorId
      );

      // 1. Attack Lunge Animations
      if (isHeroActor) {
        Animated.sequence([
          Animated.timing(heroLungeAnim, {
            toValue: 18,
            duration: 65,
            useNativeDriver: false,
          }),
          Animated.timing(heroLungeAnim, {
            toValue: 0,
            duration: 85,
            useNativeDriver: false,
          }),
        ]).start();
      } else {
        Animated.sequence([
          Animated.timing(enemyShakeAnim, {
            toValue: -18,
            duration: 65,
            useNativeDriver: false,
          }),
          Animated.timing(enemyShakeAnim, {
            toValue: 0,
            duration: 85,
            useNativeDriver: false,
          }),
        ]).start();
      }

      // 2. Hit-Flash Effect & Floating Damage Trigger
      if (currentEvent.targetId) {
        setHitTargetId(currentEvent.targetId);
        Animated.sequence([
          Animated.timing(hitFlashAnim, {
            toValue: 1,
            duration: 25,
            useNativeDriver: false,
          }),
          Animated.timing(hitFlashAnim, {
            toValue: 0,
            duration: 100,
            useNativeDriver: false,
          }),
        ]).start();

        damageFloatAnim.setValue(0);
        Animated.timing(damageFloatAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: false,
        }).start();

        setTimeout(() => {
          setHitTargetId(null);
        }, 110);
      }

      // 3. Audio SFX coordination
      if (currentEvent.isCrit) {
        void audioManager.playSound('critical-hit');
      } else if (isHeroActor) {
        void audioManager.playSound('hero-attack');
      } else {
        void audioManager.playSound('enemy-damage');
      }
    }
  }, [
    currentEvent,
    damageFloatAnim,
    enemyShakeAnim,
    heroLungeAnim,
    hitFlashAnim,
    replay.partySummaries,
  ]);

  // Reconstruct exact deterministic battlefield state at `cursorIndex`
  const stageState = useMemo(() => {
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

    let activeRoomNum = 1;
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

    populateRoomEnemies(1);

    const slice = replay.events.slice(0, cursorIndex + 1);
    for (let i = 0; i < slice.length; i++) {
      const ev = slice[i]!;
      const isLatest = i === slice.length - 1;

      if (ev.type === 'ROOM_ENTER' && ev.roomNumber > 0) {
        activeRoomNum = ev.roomNumber;
        populateRoomEnemies(ev.roomNumber);
      }

      if (ev.type === 'SHIELD_APPLIED' && ev.targetId && ev.amount) {
        const h = heroesMap.get(ev.targetId);
        if (h) {
          h.shieldHp += ev.amount;
          if (isLatest) {
            h.popupText = `+${ev.amount} SHIELD`;
            h.popupColor = COLORS.shieldCyan;
          }
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
          if (isLatest) {
            if (ev.type === 'SKILL_CAST' && ev.skillId?.includes('hymn')) {
              targetHero.popupText = `+${ev.amount} HP`;
              targetHero.popupColor = COLORS.success;
            } else {
              targetHero.popupText = `-${ev.amount ?? 0}`;
              targetHero.popupColor = COLORS.danger;
            }
          }
        } else if (targetEnemy) {
          if (ev.targetRemainingHp !== undefined) {
            targetEnemy.hp = ev.targetRemainingHp;
          }
          if (isLatest) {
            targetEnemy.popupText = ev.isCrit
              ? `💥 CRIT -${ev.amount}`
              : `-${ev.amount ?? 0}`;
            targetEnemy.popupColor = ev.isCrit ? COLORS.gold : COLORS.textPrimary;
          }
        }
      }

      if ((ev.type === 'HEAL' || ev.type === 'AURA_REGEN') && ev.targetId) {
        const targetHero = heroesMap.get(ev.targetId);
        if (targetHero && ev.targetRemainingHp !== undefined) {
          targetHero.hp = ev.targetRemainingHp;
          if (isLatest) {
            targetHero.popupText = `+${ev.amount} HP`;
            targetHero.popupColor = COLORS.success;
          }
        }
      }

      if (ev.type === 'DODGE' && ev.targetId && isLatest) {
        const unit = heroesMap.get(ev.targetId) ?? enemiesMap.get(ev.targetId);
        if (unit) {
          unit.popupText = 'DODGE!';
          unit.popupColor = COLORS.agility;
        }
      }

      if (ev.type === 'BOSS_PHASE_SHIFT' && ev.actorId) {
        const boss = enemiesMap.get(ev.actorId);
        if (boss) {
          boss.enraged = true;
          if (isLatest) {
            boss.popupText = '🔥 ENRAGED!';
            boss.popupColor = COLORS.strength;
          }
        }
      }
    }

    const activeRoomDef = dungeon.rooms.find((r) => r.roomNumber === activeRoomNum);

    return {
      activeRoomNum,
      activeRoomDef,
      heroes: Array.from(heroesMap.values()),
      enemies: Array.from(enemiesMap.values()),
    };
  }, [cursorIndex, dungeon.rooms, replay.events, replay.partySummaries]);

  const progressPct =
    replay.events.length > 1 ? (cursorIndex / (replay.events.length - 1)) * 100 : 100;

  const recentFeed = replay.events
    .slice(Math.max(0, cursorIndex - 5), cursorIndex + 1)
    .reverse();

  return (
    <View style={styles.container}>
      {/* Room Progression Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.stageTitle}>
            Room {stageState.activeRoomNum}/{dungeon.rooms.length}:{' '}
            {stageState.activeRoomDef?.roomName ?? 'Expedition Gate'}
          </Text>
          <Text style={styles.subLabel}>
            t = {currentEvent?.tSec.toFixed(2) ?? '0.00'}s /{' '}
            {(replay.totalDurationMs / 1000).toFixed(1)}s • Seed: {replay.seed.slice(0, 18)}
          </Text>
        </View>
        <View
          style={[
            styles.outcomeBadge,
            {
              backgroundColor:
                replay.outcome === 'VICTORY' ? COLORS.enduranceDim : COLORS.strengthDim,
            },
          ]}
        >
          <Text
            style={[
              styles.outcomeText,
              { color: replay.outcome === 'VICTORY' ? COLORS.endurance : COLORS.strength },
            ]}
          >
            {replay.outcome}
          </Text>
        </View>
      </View>

      {/* 2D Animated Dungeon Arena Stage */}
      <View style={styles.battleStage}>
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="arenaGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#101829" stopOpacity="1" />
              <Stop offset="0.5" stopColor="#161E31" stopOpacity="1" />
              <Stop offset="1" stopColor="#221526" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" rx="12" fill="url(#arenaGrad)" />
          <Line
            x1="50%"
            y1="12"
            x2="50%"
            y2="92%"
            stroke={COLORS.border}
            strokeDasharray="4,6"
            strokeWidth="1"
          />
          <Circle cx="24%" cy="52%" r="72" fill="#42A5F5" fillOpacity="0.05" />
          <Circle cx="76%" cy="52%" r="72" fill="#EF5350" fillOpacity="0.06" />
        </Svg>

        {/* Left Column: Party Heroes (1-5) */}
        <Animated.View
          style={[
            styles.combatColumn,
            { transform: [{ translateX: heroLungeAnim }] },
          ]}
        >
          <Text style={styles.sideLabel}>PARTY ({stageState.heroes.length})</Text>
          {stageState.heroes.map((hero) => {
            const hpPct = Math.max(0, Math.min(100, (hero.hp / hero.maxHp) * 100));
            const isTargetHit = hitTargetId === hero.id;

            return (
              <View
                key={hero.id}
                style={[
                  styles.unitCard,
                  hero.hp <= 0 && styles.unitDefeated,
                  isTargetHit && styles.hitFlashCard,
                ]}
              >
                <View style={styles.unitRowWithAvatar}>
                  <Image
                    source={{ uri: getHeroSpriteUri(hero.name) }}
                    style={styles.unitSpriteAvatar}
                    contentFit="contain"
                  />
                  <View style={{ flex: 1 }}>
                    <View style={styles.unitTopRow}>
                      <Text style={styles.unitName} numberOfLines={1}>
                        {hero.name}
                      </Text>
                      <Text style={styles.hpNumbers}>
                        {hero.hp}/{hero.maxHp}
                      </Text>
                    </View>

                    <View style={styles.hpTrack}>
                      <View
                        style={[
                          styles.hpFill,
                          {
                            width: `${hpPct}%`,
                            backgroundColor:
                              hpPct > 45 ? COLORS.success : COLORS.warning,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>

                {hero.shieldHp > 0 && (
                  <Text style={styles.shieldTag}>💠 Shield: {hero.shieldHp}</Text>
                )}

                {/* Floating Combat Numbers Animation */}
                {hero.popupText && (
                  <Animated.View
                    style={[
                      styles.floatingDamageContainer,
                      {
                        transform: [
                          {
                            translateY: damageFloatAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, -18],
                            }),
                          },
                        ],
                        opacity: damageFloatAnim.interpolate({
                          inputRange: [0, 0.7, 1],
                          outputRange: [1, 1, 0],
                        }),
                      },
                    ]}
                  >
                    <Text style={[styles.floatingDamageText, { color: hero.popupColor }]}>
                      {hero.popupText}
                    </Text>
                  </Animated.View>
                )}
              </View>
            );
          })}
        </Animated.View>

        {/* Right Column: Room Enemies / Hazard / Treasure */}
        <Animated.View
          style={[
            styles.combatColumn,
            { transform: [{ translateX: enemyShakeAnim }] },
          ]}
        >
          <Text style={styles.sideLabel}>ENCOUNTER</Text>
          {stageState.enemies.length > 0 ? (
            stageState.enemies.map((enemy) => {
              const hpPct = Math.max(0, Math.min(100, (enemy.hp / enemy.maxHp) * 100));
              const isTargetHit = hitTargetId === enemy.id;

              return (
                <View
                  key={enemy.id}
                  style={[
                    styles.unitCard,
                    enemy.isBoss && styles.bossCard,
                    enemy.enraged && styles.bossEnragedCard,
                    enemy.hp <= 0 && styles.unitDefeated,
                    isTargetHit && styles.hitFlashCard,
                  ]}
                >
                  <View style={styles.unitRowWithAvatar}>
                    <Image
                      source={{ uri: getEnemySpriteUri(enemy.isBoss, enemy.name) }}
                      style={[
                        styles.unitSpriteAvatar,
                        enemy.isBoss && styles.bossSpriteAvatar,
                      ]}
                      contentFit="contain"
                    />
                    <View style={{ flex: 1 }}>
                      <View style={styles.unitTopRow}>
                        <Text style={styles.unitName} numberOfLines={1}>
                          {enemy.isBoss ? '💀 ' : '⚔️ '}
                          {enemy.name}
                        </Text>
                        <Text style={styles.hpNumbers}>
                          {enemy.hp}/{enemy.maxHp}
                        </Text>
                      </View>

                      <View style={styles.hpTrack}>
                        <View
                          style={[
                            styles.hpFill,
                            { width: `${hpPct}%`, backgroundColor: COLORS.strength },
                          ]}
                        />
                      </View>
                    </View>
                  </View>

                  {enemy.enraged && (
                    <Text style={styles.enrageTag}>🔥 Phase 2 Frenzy (+25% ATK)</Text>
                  )}

                  {/* Floating Combat Numbers Animation */}
                  {enemy.popupText && (
                    <Animated.View
                      style={[
                        styles.floatingDamageContainer,
                        {
                          transform: [
                            {
                              translateY: damageFloatAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, -18],
                              }),
                            },
                          ],
                          opacity: damageFloatAnim.interpolate({
                            inputRange: [0, 0.7, 1],
                            outputRange: [1, 1, 0],
                          }),
                        },
                      ]}
                    >
                      <Text style={[styles.floatingDamageText, { color: enemy.popupColor }]}>
                        {enemy.popupText}
                      </Text>
                    </Animated.View>
                  )}
                </View>
              );
            })
          ) : (
            <View style={styles.specialRoomBox}>
              <Image
                source={{
                  uri:
                    stageState.activeRoomDef?.roomType === 'HAZARD_EVENT'
                      ? LOOT_SPRITES.relic_trophy
                      : LOOT_SPRITES.chest_epic,
                }}
                style={styles.specialRoomSprite}
                contentFit="contain"
              />
              <Text style={styles.specialRoomTitle}>
                {stageState.activeRoomDef?.roomType === 'HAZARD_EVENT'
                  ? stageState.activeRoomDef.hazardConfig?.hazardName
                  : 'Ancient Reliquary Chest'}
              </Text>
            </View>
          )}
        </Animated.View>
      </View>

      {/* Scrubber Bar & Playback Controls */}
      <View style={styles.scrubberTrack}>
        <View style={[styles.scrubberFill, { width: `${progressPct}%` }]} />
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          style={styles.controlBtn}
          onPress={() => {
            if (cursorIndex >= replay.events.length - 1) {
              setCursorIndex(0);
              setIsPlaying(true);
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
            setCursorIndex(replay.events.length - 1);
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
      </View>

      {/* Live Deterministic Combat Event Feed */}
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

      {/* Expedition Rewards & Damage Summary */}
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
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stageTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  subLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  outcomeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  outcomeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  battleStage: {
    minHeight: 215,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderHighlight,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    overflow: 'hidden',
    gap: 12,
  },
  combatColumn: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  sideLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  unitCard: {
    backgroundColor: 'rgba(18, 23, 34, 0.90)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
  },
  bossCard: {
    borderColor: COLORS.gold,
    paddingVertical: 12,
  },
  bossEnragedCard: {
    borderColor: COLORS.strength,
    backgroundColor: 'rgba(59, 24, 27, 0.85)',
  },
  unitDefeated: {
    opacity: 0.35,
  },
  hitFlashCard: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.30)',
  },
  unitRowWithAvatar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitSpriteAvatar: {
    width: 34,
    height: 34,
    borderRadius: 6,
  },
  bossSpriteAvatar: {
    width: 42,
    height: 42,
  },
  floatingDamageContainer: {
    position: 'absolute',
    top: -6,
    right: 8,
    zIndex: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  floatingDamageText: {
    fontSize: 11,
    fontWeight: '900',
  },
  specialRoomSprite: {
    width: 48,
    height: 48,
    marginBottom: 6,
  },
  unitTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  unitName: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  hpNumbers: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginLeft: 6,
  },
  hpTrack: {
    height: 6,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
    borderRadius: 4,
  },
  shieldTag: {
    color: COLORS.shieldCyan,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  enrageTag: {
    color: COLORS.strength,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  popupBadge: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  specialRoomBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(26, 34, 50, 0.75)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  specialRoomIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  specialRoomTitle: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  scrubberTrack: {
    height: 5,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 999,
    marginTop: 10,
    overflow: 'hidden',
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
    flexWrap: 'wrap',
    gap: 8,
  },
  controlBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  controlBtnText: {
    color: COLORS.bgDeep,
    fontWeight: '800',
    fontSize: 12,
  },
  controlBtnSecondary: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  controlBtnSecondaryText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  speedGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  speedChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  speedChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  speedChipText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  speedChipTextActive: {
    color: COLORS.gold,
  },
  logBox: {
    marginTop: 12,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logHeader: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  logScroll: {
    maxHeight: 96,
  },
  logLine: {
    color: COLORS.textPrimary,
    fontSize: 12,
    marginBottom: 3,
  },
  logTime: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  lootSummaryBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  lootHeader: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  lootWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  lootPill: {
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lootPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
