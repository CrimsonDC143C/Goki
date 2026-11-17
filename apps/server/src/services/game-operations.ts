import { PrismaClient } from '@goki/database';
import {
  CharacterCustomizationConfig,
  CharacterRace,
  CombatantCharacterInput,
  DungeonDefinition,
  DungeonRoomDefinition,
  DungeonWorkoutBuff,
  EquipmentStatBonuses,
  LootDrop,
  WeightedRaidLootEntry,
  applyStatXpProgression,
  calculateElapsedGatheringTicks,
  calculateGatheringTick,
  calculateOverallLevel,
  calculateRaidRewards,
  createSeededRng,
  evaluateFatigueStateAtTime,
  simulateDungeonRun,
} from '@goki/game-engine';

const inProcessKeyLocks = new Map<string, Promise<unknown>>();
const inFlightClaims = new Set<string>();
const claimedGatheringTasks = new Set<string>();
const claimedDungeonRuns = new Set<string>();
const claimedRaidBosses = new Set<string>();

/**
 * Serializes operations on a per-key basis in-process, and executes `fn(tx)` inside
 * `db.$transaction` when available (falling back to `fn(db)` for lightweight test mocks).
 */
export async function withDbTransaction<T>(
  db: PrismaClient,
  fn: (tx: PrismaClient) => Promise<T>,
  lockKey = 'global'
): Promise<T> {
  const previous = inProcessKeyLocks.get(lockKey) ?? Promise.resolve();
  let releaseLock!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const chained = previous.then(() => current, () => current);
  inProcessKeyLocks.set(lockKey, chained);

  await previous.catch(() => {});
  try {
    if (typeof (db as unknown as { $transaction?: unknown }).$transaction === 'function') {
      return await (db as unknown as {
        $transaction: (cb: (tx: PrismaClient) => Promise<T>) => Promise<T>;
      }).$transaction(async (tx) => fn(tx));
    }
    return await fn(db);
  } finally {
    releaseLock();
    if (inProcessKeyLocks.get(lockKey) === chained) {
      inProcessKeyLocks.delete(lockKey);
    }
  }
}

export function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}

export interface GatheringLootTemplate extends LootDrop {
  weight: number;
}

/**
 * Deposits a `LootDrop` into a character's inventory, creating a catalog placeholder if needed
 * or incrementing stackable quantities.
 */
export async function depositLootToInventory(
  db: PrismaClient,
  characterId: string,
  drop: LootDrop
): Promise<void> {
  if (drop.quantity <= 0) return;

  let item = await db.item.findUnique({ where: { slug: drop.itemSlug } });
  if (!item) {
    item = await db.item.create({
      data: {
        slug: drop.itemSlug,
        name: drop.itemName,
        description: `Reward item: ${drop.itemName}`,
        itemType: 'CRAFTING_MATERIAL',
        rarity: drop.rarity,
        stackable: true,
        statBonuses: {},
      },
    });
  }

  const itemMetadata =
    drop.tier ||
    drop.prefixId ||
    drop.suffixId ||
    drop.statBonuses ||
    drop.primaryStatBonuses ||
    drop.uniquePassive
      ? {
          tier: drop.tier ?? 1,
          prefixId: drop.prefixId ?? null,
          prefixLabel: drop.prefixLabel ?? null,
          prefixSummary: drop.prefixSummary ?? null,
          suffixId: drop.suffixId ?? null,
          suffixLabel: drop.suffixLabel ?? null,
          suffixSummary: drop.suffixSummary ?? null,
          baseStatsSummary: drop.baseStatsSummary ?? null,
          rolledName: drop.itemName,
          rarity: drop.rarity,
          statBonuses: drop.statBonuses ?? {},
          primaryStatBonuses: drop.primaryStatBonuses ?? {},
          uniquePassive: drop.uniquePassive ?? null,
        }
      : null;

  if (item.stackable && !itemMetadata) {
    const existing = await db.inventoryItem.findFirst({
      where: { characterId, itemId: item.id },
    });
    if (existing) {
      await db.inventoryItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + drop.quantity },
      });
      return;
    }
  }

  await db.inventoryItem.create({
    data: {
      characterId,
      itemId: item.id,
      quantity: drop.quantity,
      itemMetadata: itemMetadata as any,
    },
  });
}

/**
 * Synchronizes partial tick progress for an ActiveGatheringTask.
 * Calculates elapsed ticks since lastTickProcessedAt, distributes accrued items and XP,
 * and updates lastTickProcessedAt to prevent double-dipping.
 */
export async function syncGatheringTaskTicksOperation(
  db: PrismaClient,
  taskId: string,
  options?: { currentTimeMs?: number }
): Promise<{
  alreadyCompleted: boolean;
  taskId: string;
  characterId: string;
  elapsedTicks: number;
  totalCompletedTicks: number;
  newYieldAmount: number;
  newXpAmount: number;
  distributedDrops: LootDrop[];
  allYieldedLoot: LootDrop[];
  isCompleted: boolean;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  nextTickAtMs: number | null;
  tickIntervalMs: number;
}> {
  return withDbTransaction(
    db,
    async (tx) => {
      const task = await tx.activeGatheringTask.findUnique({
        where: { id: taskId },
        include: {
          gatheringNode: true,
          character: { include: { stats: true } },
        },
      });

      if (!task) {
        throw new Error(`Gathering task '${taskId}' not found.`);
      }

      const existingLoot = ((task.yieldedLoot as unknown as LootDrop[]) ?? []);

      if (task.status !== 'IN_PROGRESS') {
        return {
          alreadyCompleted: true,
          taskId: task.id,
          characterId: task.characterId,
          elapsedTicks: 0,
          totalCompletedTicks: task.accumulatedTicks,
          newYieldAmount: 0,
          newXpAmount: 0,
          distributedDrops: [],
          allYieldedLoot: existingLoot,
          isCompleted: true,
          status: task.status,
          nextTickAtMs: null,
          tickIntervalMs: 0,
        };
      }

      const charStats = task.character.stats ?? {
        strengthLevel: 1,
        enduranceLevel: 1,
        agilityLevel: 1,
      };

      const tickCalc = calculateGatheringTick(
        charStats,
        task.character.overallLevel,
        task.gatheringNode.requiredStatLevel,
        task.gatheringNode.professionType
      );

      const currentTimeMs = options?.currentTimeMs ?? Date.now();
      const startedAtMs = task.startedAt.getTime();
      const completesAtMs = task.completesAt.getTime();
      const targetDurationMs = task.targetDurationMs ?? Math.max(0, completesAtMs - startedAtMs);
      const lastTickProcessedAtMs = task.lastTickProcessedAt
        ? task.lastTickProcessedAt.getTime()
        : startedAtMs;

      const elapsed = calculateElapsedGatheringTicks({
        startedAtMs,
        lastTickProcessedAtMs,
        currentTimeMs,
        targetDurationMs,
        tickIntervalMs: tickCalc.tickIntervalMs,
        yieldPerTick: tickCalc.yieldPerTick,
        xpPerTick: tickCalc.xpPerTick,
      });

      const distributedDrops: LootDrop[] = [];
      const lootTable = (task.gatheringNode.lootTable as unknown as GatheringLootTemplate[]) ?? [];

      if (elapsed.elapsedTicks > 0 && lootTable.length > 0) {
        for (let i = 1; i <= elapsed.elapsedTicks; i++) {
          const stepSeed = `gather:${task.id}:${task.characterId}:${task.accumulatedTicks + i}`;
          const rng = createSeededRng(stepSeed);
          const picked = rng.pickWeighted(lootTable);
          const scaledQty = Math.max(1, picked.quantity * tickCalc.yieldPerTick);
          const drop: LootDrop = {
            itemSlug: picked.itemSlug,
            itemName: picked.itemName,
            rarity: picked.rarity,
            quantity: scaledQty,
          };
          distributedDrops.push(drop);
          await depositLootToInventory(tx, task.characterId, drop);
        }
      }

      // Award XP & apply stat level-up progression based on profession affinity
      if (elapsed.newXpAmount > 0 && task.character.stats) {
        const stats = task.character.stats;
        let nextStrLevel = stats.strengthLevel ?? 1;
        let nextEndLevel = stats.enduranceLevel ?? 1;
        let nextAgiLevel = stats.agilityLevel ?? 1;

        if (tickCalc.yieldStat === 'STRENGTH') {
          const prog = applyStatXpProgression(
            nextStrLevel,
            stats.strengthXp ?? 0,
            elapsed.newXpAmount
          );
          nextStrLevel = prog.newLevel;
          await tx.characterStats.update({
            where: { characterId: task.characterId },
            data: {
              strengthLevel: prog.newLevel,
              strengthXp: prog.remainingXp,
              ...(prog.talentPointsEarned > 0
                ? { strengthTalentPointsAvailable: { increment: prog.talentPointsEarned } }
                : {}),
            },
          });
        } else if (tickCalc.yieldStat === 'ENDURANCE') {
          const prog = applyStatXpProgression(
            nextEndLevel,
            stats.enduranceXp ?? 0,
            elapsed.newXpAmount
          );
          nextEndLevel = prog.newLevel;
          await tx.characterStats.update({
            where: { characterId: task.characterId },
            data: {
              enduranceLevel: prog.newLevel,
              enduranceXp: prog.remainingXp,
              ...(prog.talentPointsEarned > 0
                ? { enduranceTalentPointsAvailable: { increment: prog.talentPointsEarned } }
                : {}),
            },
          });
        } else {
          const prog = applyStatXpProgression(
            nextAgiLevel,
            stats.agilityXp ?? 0,
            elapsed.newXpAmount
          );
          nextAgiLevel = prog.newLevel;
          await tx.characterStats.update({
            where: { characterId: task.characterId },
            data: {
              agilityLevel: prog.newLevel,
              agilityXp: prog.remainingXp,
              ...(prog.talentPointsEarned > 0
                ? { agilityTalentPointsAvailable: { increment: prog.talentPointsEarned } }
                : {}),
            },
          });
        }

        const nextOverallLevel = calculateOverallLevel({
          strengthLevel: nextStrLevel,
          enduranceLevel: nextEndLevel,
          agilityLevel: nextAgiLevel,
          dexLevel: task.character.dexLevel,
          conLevel: task.character.conLevel,
          wisLevel: task.character.wisLevel,
          sprLevel: task.character.sprLevel,
        });

        if (
          nextOverallLevel !== task.character.overallLevel &&
          typeof (tx.character as any)?.update === 'function'
        ) {
          await tx.character.update({
            where: { id: task.characterId },
            data: { overallLevel: nextOverallLevel },
          });
        }
      }

      const allYieldedLoot = [...existingLoot, ...distributedDrops];
      const newStatus = elapsed.isCompleted ? 'COMPLETED' : 'IN_PROGRESS';

      await tx.activeGatheringTask.update({
        where: { id: task.id },
        data: {
          lastTickProcessedAt: new Date(elapsed.newLastTickProcessedAtMs),
          accumulatedTicks: task.accumulatedTicks + elapsed.elapsedTicks,
          yieldedLoot: allYieldedLoot as unknown as object,
          status: newStatus,
          completedAt: elapsed.isCompleted ? new Date(Math.min(currentTimeMs, completesAtMs)) : null,
        },
      });

      if (elapsed.isCompleted) {
        const character = await tx.character.findUnique({ where: { id: task.characterId } });
        if (character && character.activityState === 'GATHERING') {
          await tx.character.update({
            where: { id: character.id },
            data: { activityState: 'IDLE' },
          });
        }
      }

      return {
        alreadyCompleted: false,
        taskId: task.id,
        characterId: task.characterId,
        elapsedTicks: elapsed.elapsedTicks,
        totalCompletedTicks: task.accumulatedTicks + elapsed.elapsedTicks,
        newYieldAmount: elapsed.newYieldAmount,
        newXpAmount: elapsed.newXpAmount,
        distributedDrops,
        allYieldedLoot,
        isCompleted: elapsed.isCompleted,
        status: newStatus,
        nextTickAtMs: elapsed.isCompleted ? null : elapsed.newLastTickProcessedAtMs + tickCalc.tickIntervalMs,
        tickIntervalMs: tickCalc.tickIntervalMs,
      };
    },
    `gathering-sync:${taskId}`
  );
}

/**
 * Resolves a Gathering/Crafting task upon expiration or completion.
 * Fully drains any remaining ticks, deposits all outstanding items, and returns character to `IDLE`.
 */
export async function completeGatheringTaskOperation(
  db: PrismaClient,
  taskId: string,
  options?: { gracefulMissing?: boolean }
): Promise<{
  alreadyCompleted: boolean;
  taskId: string;
  characterId: string;
  yieldedLoot: LootDrop[];
}> {
  if (inFlightClaims.has(`gather:${taskId}`)) {
    return withDbTransaction(
      db,
      async (tx) => {
        const existing = await tx.activeGatheringTask.findUnique({ where: { id: taskId } });
        return {
          alreadyCompleted: true,
          taskId,
          characterId: existing?.characterId ?? '',
          yieldedLoot: ((existing?.yieldedLoot as unknown as LootDrop[]) ?? []),
        };
      },
      `gathering:${taskId}`
    );
  }

  inFlightClaims.add(`gather:${taskId}`);
  try {
    return await withDbTransaction(
      db,
      async (tx) => {
        const task = await tx.activeGatheringTask.findUnique({
          where: { id: taskId },
          include: { gatheringNode: true },
        });

        if (!task) {
          if (options?.gracefulMissing) {
            return {
              alreadyCompleted: true,
              taskId,
              characterId: '',
              yieldedLoot: [],
            };
          }
          const err = new Error(`Gathering task '${taskId}' not found.`) as Error & {
            statusCode?: number;
          };
          err.statusCode = 404;
          throw err;
        }

        const characterCheck = await tx.character.findUnique({ where: { id: task.characterId } });
        if (!characterCheck) {
          if (options?.gracefulMissing) {
            return {
              alreadyCompleted: true,
              taskId: task.id,
              characterId: task.characterId,
              yieldedLoot: (task.yieldedLoot as unknown as LootDrop[]) ?? [],
            };
          }
        }

        if (task.status !== 'IN_PROGRESS' || claimedGatheringTasks.has(taskId)) {
          return {
            alreadyCompleted: true,
            taskId: task.id,
            characterId: task.characterId,
            yieldedLoot: (task.yieldedLoot as unknown as LootDrop[]) ?? [],
          };
        }

        // Ensure all ticks up to completion time are fully processed and deposited
        const syncResult = await syncGatheringTaskTicksOperation(tx, taskId, {
          currentTimeMs: Math.max(Date.now(), task.completesAt.getTime()),
        });

        if (typeof (tx.activeGatheringTask as any)?.updateMany === 'function') {
          const claimed = await tx.activeGatheringTask.updateMany({
            where: { id: task.id, status: 'IN_PROGRESS' },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });
          if (claimed.count === 0 && syncResult.alreadyCompleted) {
            return {
              alreadyCompleted: true,
              taskId: task.id,
              characterId: task.characterId,
              yieldedLoot: syncResult.allYieldedLoot,
            };
          }
        } else if (syncResult.status !== 'COMPLETED') {
          await tx.activeGatheringTask.update({
            where: { id: task.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });
        }

        claimedGatheringTasks.add(taskId);

        const character = await tx.character.findUnique({ where: { id: task.characterId } });
        if (character && character.activityState === 'GATHERING') {
          await tx.character.update({
            where: { id: character.id },
            data: { activityState: 'IDLE' },
          });
        }

        return {
          alreadyCompleted: false,
          taskId: task.id,
          characterId: task.characterId,
          yieldedLoot: syncResult.allYieldedLoot,
        };
      },
      `gathering:${taskId}`
    );
  } finally {
    inFlightClaims.delete(`gather:${taskId}`);
  }
}

/**
 * Builds a `CombatantCharacterInput` snapshot from a Character's live DB core stats, equipped gear,
 * unlocked talent nodes, and current Systemic Fatigue state.
 */
export interface CharacterCombatSnapshot extends CombatantCharacterInput {
  race: CharacterRace;
  appearanceId: string;
  customizationConfig?: CharacterCustomizationConfig;
}

export async function buildCharacterCombatSnapshot(
  db: PrismaClient,
  characterId: string
): Promise<CharacterCombatSnapshot> {
  const character = await db.character.findUnique({
    where: { id: characterId },
    include: {
      stats: true,
      fatigueState: true,
      talentUnlocks: { include: { talentNode: true } },
      equipmentLoadout: {
        include: {
          mainHand: { include: { item: true } },
          offHand: { include: { item: true } },
          head: { include: { item: true } },
          chest: { include: { item: true } },
          legs: { include: { item: true } },
          boots: { include: { item: true } },
          accessory1: { include: { item: true } },
          accessory2: { include: { item: true } },
        },
      },
    },
  });

  if (!character || !character.stats) {
    throw new Error(`Character '${characterId}' or stats not found.`);
  }

  const equipmentBonuses: EquipmentStatBonuses = {};
  const loadout = character.equipmentLoadout;
  if (loadout) {
    const slots = [
      loadout.mainHand,
      loadout.offHand,
      loadout.head,
      loadout.chest,
      loadout.legs,
      loadout.boots,
      loadout.accessory1,
      loadout.accessory2,
    ];
    for (const slot of slots) {
      if (!slot?.item?.statBonuses) continue;
      const b = slot.item.statBonuses as EquipmentStatBonuses;
      equipmentBonuses.maxHp = (equipmentBonuses.maxHp ?? 0) + (b.maxHp ?? 0);
      equipmentBonuses.maxStamina = (equipmentBonuses.maxStamina ?? 0) + (b.maxStamina ?? 0);
      equipmentBonuses.meleePower = (equipmentBonuses.meleePower ?? 0) + (b.meleePower ?? 0);
      equipmentBonuses.armorRating = (equipmentBonuses.armorRating ?? 0) + (b.armorRating ?? 0);
      equipmentBonuses.attackSpeedPct =
        (equipmentBonuses.attackSpeedPct ?? 0) + (b.attackSpeedPct ?? 0);
      equipmentBonuses.dodgeRating = (equipmentBonuses.dodgeRating ?? 0) + (b.dodgeRating ?? 0);
      equipmentBonuses.critChance = (equipmentBonuses.critChance ?? 0) + (b.critChance ?? 0);
      equipmentBonuses.critMultiplier =
        (equipmentBonuses.critMultiplier ?? 0) + (b.critMultiplier ?? 0);
    }
  }

  const unlockedTalentRanks: Record<string, number> = {};
  for (const unlock of character.talentUnlocks) {
    unlockedTalentRanks[unlock.talentNode.slug] = unlock.currentRank;
  }

  let systemicFatigueStacks = 0;
  if (character.fatigueState) {
    const projected = evaluateFatigueStateAtTime(
      {
        isRestingInTavern: character.fatigueState.isRestingInTavern,
        tavernEnteredAt: character.fatigueState.tavernEnteredAt,
        lastStrenuousWorkoutAt: character.fatigueState.lastStrenuousWorkoutAt,
        lastWorkoutAt: character.fatigueState.lastWorkoutAt,
        consecutiveHighIntensityDays: character.fatigueState.consecutiveHighIntensityDays,
        lastHighIntensityDayKey: character.fatigueState.lastHighIntensityDayKey,
        systemicFatigueStacks: character.fatigueState.systemicFatigueStacks,
        fatigueScore: character.fatigueState.fatigueScore,
        wellRestedMultiplier: character.fatigueState.wellRestedMultiplier,
        activeRecoveryBuffActive: character.fatigueState.activeRecoveryBuffActive,
        activeRecoveryGrantedAt: character.fatigueState.activeRecoveryGrantedAt,
      },
      new Date()
    );
    systemicFatigueStacks = projected.systemicFatigueStacks;
  }

  return {
    characterId: character.id,
    name: character.name,
    coreStats: {
      strengthLevel: character.stats.strengthLevel,
      enduranceLevel: character.stats.enduranceLevel,
      agilityLevel: character.stats.agilityLevel,
      dexLevel: (character as any).dexLevel ?? 1,
      conLevel: (character as any).conLevel ?? 1,
      wisLevel: (character as any).wisLevel ?? 1,
      sprLevel: (character as any).sprLevel ?? 1,
    },
    race: ((character as any).race as CharacterRace | undefined) ?? 'HUMAN',
    appearanceId: character.appearanceId,
    customizationConfig:
      ((character as any).customizationConfig as CharacterCustomizationConfig | undefined) ??
      undefined,
    equipmentBonuses,
    unlockedTalentRanks,
    systemicFatigueStacks,
  };
}

/**
 * Resolves an active 24-hour DungeonRun deterministically via `simulateDungeonRun()`,
 * persists `DungeonCombatReplay`, awards gold & loot to all party members, and sets them back to `IDLE`.
 */
export async function resolveDungeonRunOperation(
  db: PrismaClient,
  dungeonRunId: string,
  options?: { gracefulMissing?: boolean }
) {
  return withDbTransaction(
    db,
    async (tx) => {
      const run = await tx.dungeonRun.findUnique({
        where: { id: dungeonRunId },
        include: {
          dungeon: true,
          participants: true,
          combatReplay: true,
        },
      });

      if (!run) {
        if (options?.gracefulMissing) {
          return { dungeonRunId, alreadyResolved: true };
        }
        const err = new Error(`DungeonRun '${dungeonRunId}' not found.`) as Error & {
          statusCode?: number;
        };
        err.statusCode = 404;
        throw err;
      }

      if (
        run.combatReplay ||
        run.status === 'COMPLETED' ||
        run.status === 'FAILED' ||
        run.status === 'SIMULATING' ||
        claimedDungeonRuns.has(dungeonRunId)
      ) {
        if (run.combatReplay) {
          return run.combatReplay;
        }
        if (typeof (tx.dungeonCombatReplay as any)?.findUnique === 'function') {
          const existingReplay = await tx.dungeonCombatReplay.findUnique({
            where: { dungeonRunId },
          });
          if (existingReplay) return existingReplay;
        }
        return run.rewardsDistributed ?? { dungeonRunId, alreadyResolved: true };
      }

      if (typeof (tx.dungeonRun as any)?.updateMany === 'function') {
        const claimed = await tx.dungeonRun.updateMany({
          where: {
            id: run.id,
            status: { in: ['ACTIVE_WINDOW', 'RECRUITING'] as any },
          },
          data: { status: 'SIMULATING' },
        });
        if (claimed.count === 0) {
          const refreshed = await tx.dungeonRun.findUnique({
            where: { id: dungeonRunId },
            include: { combatReplay: true },
          });
          if (refreshed?.combatReplay) return refreshed.combatReplay;
          return refreshed?.rewardsDistributed ?? { dungeonRunId, alreadyResolved: true };
        }
      }

      claimedDungeonRuns.add(dungeonRunId);

      const partySnapshot =
        (run.partyBaselineSnapshot as unknown as CombatantCharacterInput[]) ?? [];
      const party =
        partySnapshot.length > 0
          ? partySnapshot
          : await Promise.all(
              run.participants
                .sort((a, b) => a.partySlot - b.partySlot)
                .map((p) => buildCharacterCombatSnapshot(tx, p.characterId))
            );

      const workoutBuffs = (run.activeWorkoutBuffs as unknown as DungeonWorkoutBuff[]) ?? [];
      const rooms = (run.dungeon.roomsConfig as unknown as DungeonRoomDefinition[]) ?? [];

      const dungeonDef: DungeonDefinition = {
        dungeonSlug: run.dungeon.slug,
        dungeonName: run.dungeon.name,
        rooms,
      };

      const simResult = simulateDungeonRun({
        dungeon: dungeonDef,
        party,
        workoutBuffs,
        seed: run.randomSeed,
        tickIntervalMs: 250,
      });

      const isVictory = simResult.outcome === 'VICTORY';
      const goldPerMember =
        party.length > 0 ? Math.max(10, Math.round(simResult.totalGoldEarned / party.length)) : 0;

      for (const participant of run.participants) {
        await tx.character.update({
          where: { id: participant.characterId },
          data: {
            gold: { increment: goldPerMember },
            activityState: 'IDLE',
          },
        });

        if (isVictory) {
          for (const drop of simResult.lootDrops) {
            await depositLootToInventory(tx, participant.characterId, drop);
          }
        }

        await tx.dungeonRunParticipant.update({
          where: { id: participant.id },
          data: {
            lootAwarded: {
              gold: goldPerMember,
              items: isVictory ? simResult.lootDrops : [],
            } as unknown as object,
          },
        });
      }

      await tx.dungeonRun.update({
        where: { id: run.id },
        data: {
          status: isVictory ? 'COMPLETED' : 'FAILED',
          wasSuccessful: isVictory,
          roomsCleared: simResult.roomsCleared,
          completedAt: new Date(),
          rewardsDistributed: {
            totalGoldEarned: simResult.totalGoldEarned,
            goldPerMember,
            lootDrops: simResult.lootDrops,
          } as unknown as object,
        },
      });

      const replayRecord = await tx.dungeonCombatReplay.create({
        data: {
          dungeonRunId: run.id,
          engineVersion: simResult.engineVersion,
          seed: simResult.seed,
          totalDurationMs: simResult.totalDurationMs,
          tickIntervalMs: simResult.tickIntervalMs,
          outcome: simResult.outcome,
          summaryMetrics: {
            roomsCleared: simResult.roomsCleared,
            totalRooms: simResult.totalRooms,
            totalGoldEarned: simResult.totalGoldEarned,
            lootDrops: simResult.lootDrops,
            partySummaries: simResult.partySummaries,
          } as unknown as object,
          eventLog: simResult.events as unknown as object,
        },
      });

      return replayRecord;
    },
    `dungeon:${dungeonRunId}`
  );
}

/**
 * Transitions a character into the Tavern Resting State once 24+ hours have elapsed without
 * a strenuous workout (invoked by the BullMQ `fatigue-transition` delayed worker).
 */
export async function applyAutomaticTavernTransitionOperation(
  db: PrismaClient,
  characterId: string
): Promise<void> {
  const fatigue = await db.fatigueAndRestState.findUnique({ where: { characterId } });
  if (!fatigue) return;

  const projected = evaluateFatigueStateAtTime(
    {
      isRestingInTavern: fatigue.isRestingInTavern,
      tavernEnteredAt: fatigue.tavernEnteredAt,
      lastStrenuousWorkoutAt: fatigue.lastStrenuousWorkoutAt,
      lastWorkoutAt: fatigue.lastWorkoutAt,
      consecutiveHighIntensityDays: fatigue.consecutiveHighIntensityDays,
      lastHighIntensityDayKey: fatigue.lastHighIntensityDayKey,
      systemicFatigueStacks: fatigue.systemicFatigueStacks,
      fatigueScore: fatigue.fatigueScore,
      wellRestedMultiplier: fatigue.wellRestedMultiplier,
      activeRecoveryBuffActive: fatigue.activeRecoveryBuffActive,
      activeRecoveryGrantedAt: fatigue.activeRecoveryGrantedAt,
    },
    new Date()
  );

  await db.fatigueAndRestState.update({
    where: { characterId },
    data: {
      isRestingInTavern: projected.isRestingInTavern,
      tavernEnteredAt: projected.tavernEnteredAt,
      consecutiveHighIntensityDays: projected.consecutiveHighIntensityDays,
      systemicFatigueStacks: projected.systemicFatigueStacks,
      fatigueScore: projected.fatigueScore,
      wellRestedMultiplier: projected.wellRestedMultiplier,
    },
  });

  if (projected.isRestingInTavern) {
    const character = await db.character.findUnique({ where: { id: characterId } });
    if (character && character.activityState === 'IDLE') {
      await db.character.update({
        where: { id: characterId },
        data: { currentLocation: 'TAVERN', activityState: 'RESTING_TAVERN' },
      });
    }
  }
}

/**
 * Resolves a 7-day Public or Guild-Only Raid Boss rollover using `calculateRaidRewards()`,
 * distributing gold, guild reputation, and loot drops to participants.
 */
export async function resolveRaidBossRolloverOperation(
  db: PrismaClient,
  raidInstanceId: string,
  options?: { gracefulMissing?: boolean }
) {
  return withDbTransaction(
    db,
    async (tx) => {
      const raid = await tx.raidBossInstance.findUnique({
        where: { id: raidInstanceId },
        include: { contributions: true },
      });

      if (!raid) {
        if (options?.gracefulMissing) {
          return { raidInstanceId, alreadyResolved: true };
        }
        const err = new Error(`RaidBossInstance '${raidInstanceId}' not found.`) as Error & {
          statusCode?: number;
        };
        err.statusCode = 404;
        throw err;
      }

      const mechanics = (raid.bossMechanicsConfig as Record<string, number>) ?? {};
      const lootPool = (raid.lootPoolConfig as unknown as WeightedRaidLootEntry[]) ?? [];

      const maxVal = raid.contributions.reduce((acc, c) => {
        const cMax = [c.combatDamageDealt, c.workoutEnergyDamage, c.supportScore].reduce(
          (m, v) => (v > m ? v : m),
          0n
        );
        return cMax > acc ? cMax : acc;
      }, raid.maxHp);

      const scale =
        maxVal > BigInt(Number.MAX_SAFE_INTEGER)
          ? maxVal / BigInt(1_000_000_000) + 1n
          : 1n;

      const resolution = calculateRaidRewards({
        raidInstanceId: raid.id,
        accessType: raid.accessType,
        bossMaxHp: Number(raid.maxHp / scale),
        isBossDefeated: raid.isDefeated || raid.currentHp <= 0n,
        baseGoldPool: mechanics.baseGoldPool ?? 10_000,
        baseGuildReputationPool: mechanics.baseGuildRepPool ?? 2_000,
        baseMaterialQuantity: 8,
        lootTable: lootPool,
        participants: raid.contributions.map((c) => ({
          characterId: c.characterId,
          combatDamageDealt: Number(c.combatDamageDealt / scale),
          workoutEnergyDamage: Number(c.workoutEnergyDamage / scale),
          supportScore: Number(c.supportScore / scale),
        })),
        seed: `raid-rollover:${raid.id}`,
      });

      if (raid.status !== 'REWARDS_DISTRIBUTED' && !claimedRaidBosses.has(raidInstanceId)) {
        let shouldAward = true;

        if (typeof (tx.raidBossInstance as any)?.updateMany === 'function') {
          const claimed = await tx.raidBossInstance.updateMany({
            where: {
              id: raid.id,
              status: { not: 'REWARDS_DISTRIBUTED' },
            },
            data: {
              status: 'REWARDS_DISTRIBUTED',
              isDefeated: resolution.isBossDefeated,
              resolvedAt: new Date(),
            },
          });
          if (claimed.count === 0) {
            shouldAward = false;
          }
        }

        if (shouldAward) {
          claimedRaidBosses.add(raidInstanceId);

          for (const reward of resolution.participantRewards) {
            await tx.raidParticipantContribution.update({
              where: {
                raidInstanceId_characterId: {
                  raidInstanceId: raid.id,
                  characterId: reward.characterId,
                },
              },
              data: {
                contributionRatio: reward.contributionRatio,
                rewardTier: reward.rewardTier,
                rewardsClaimed: true,
                rewardPayload: {
                  goldAwarded: reward.goldAwarded,
                  guildReputationAwarded: reward.guildReputationAwarded,
                  lootDrops: reward.lootDrops,
                } as unknown as object,
              },
            });

            if (reward.goldAwarded > 0 || reward.guildReputationAwarded > 0) {
              await tx.character.update({
                where: { id: reward.characterId },
                data: {
                  gold: { increment: reward.goldAwarded },
                  adventurerReputation: { increment: reward.guildReputationAwarded },
                },
              });
            }

            if (
              raid.gymClanId &&
              reward.guildReputationAwarded > 0 &&
              typeof (tx as any).gymClan?.update === 'function'
            ) {
              await tx.gymClan.update({
                where: { id: raid.gymClanId },
                data: { clanReputation: { increment: reward.guildReputationAwarded } },
              });
            }

            for (const drop of reward.lootDrops) {
              await depositLootToInventory(tx, reward.characterId, drop);
            }
          }

          await tx.raidBossInstance.update({
            where: { id: raid.id },
            data: {
              status: 'REWARDS_DISTRIBUTED',
              isDefeated: resolution.isBossDefeated,
              resolvedAt: new Date(),
            },
          });
        }
      }

      return resolution;
    },
    `raid-rollover:${raidInstanceId}`
  );
}
