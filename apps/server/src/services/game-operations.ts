import { PrismaClient } from '@goki/database';
import {
  CombatantCharacterInput,
  DungeonDefinition,
  DungeonRoomDefinition,
  DungeonWorkoutBuff,
  EquipmentStatBonuses,
  LootDrop,
  WeightedRaidLootEntry,
  calculateElapsedGatheringTicks,
  calculateGatheringTick,
  calculateRaidRewards,
  createSeededRng,
  evaluateFatigueStateAtTime,
  simulateDungeonRun,
} from '@goki/game-engine';

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
  const task = await db.activeGatheringTask.findUnique({
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
      await depositLootToInventory(db, task.characterId, drop);
    }
  }

  // Award XP to character stat based on profession affinity
  if (elapsed.newXpAmount > 0 && task.character.stats) {
    if (tickCalc.yieldStat === 'STRENGTH') {
      await db.characterStats.update({
        where: { characterId: task.characterId },
        data: { strengthXp: { increment: elapsed.newXpAmount } },
      });
    } else if (tickCalc.yieldStat === 'ENDURANCE') {
      await db.characterStats.update({
        where: { characterId: task.characterId },
        data: { enduranceXp: { increment: elapsed.newXpAmount } },
      });
    } else {
      await db.characterStats.update({
        where: { characterId: task.characterId },
        data: { agilityXp: { increment: elapsed.newXpAmount } },
      });
    }
  }

  const allYieldedLoot = [...existingLoot, ...distributedDrops];
  const newStatus = elapsed.isCompleted ? 'COMPLETED' : 'IN_PROGRESS';

  await db.activeGatheringTask.update({
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
    const character = await db.character.findUnique({ where: { id: task.characterId } });
    if (character && character.activityState === 'GATHERING') {
      await db.character.update({
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
}

/**
 * Resolves a Gathering/Crafting task upon expiration or completion.
 * Fully drains any remaining ticks, deposits all outstanding items, and returns character to `IDLE`.
 */
export async function completeGatheringTaskOperation(
  db: PrismaClient,
  taskId: string
): Promise<{
  alreadyCompleted: boolean;
  taskId: string;
  characterId: string;
  yieldedLoot: LootDrop[];
}> {
  const task = await db.activeGatheringTask.findUnique({
    where: { id: taskId },
    include: { gatheringNode: true },
  });

  if (!task) {
    throw new Error(`Gathering task '${taskId}' not found.`);
  }

  if (task.status !== 'IN_PROGRESS') {
    return {
      alreadyCompleted: true,
      taskId: task.id,
      characterId: task.characterId,
      yieldedLoot: (task.yieldedLoot as unknown as LootDrop[]) ?? [],
    };
  }

  // Ensure all ticks up to completion time are fully processed and deposited
  const syncResult = await syncGatheringTaskTicksOperation(db, taskId, {
    currentTimeMs: Math.max(Date.now(), task.completesAt.getTime()),
  });

  if (syncResult.status !== 'COMPLETED') {
    await db.activeGatheringTask.update({
      where: { id: task.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    const character = await db.character.findUnique({ where: { id: task.characterId } });
    if (character && character.activityState === 'GATHERING') {
      await db.character.update({
        where: { id: character.id },
        data: { activityState: 'IDLE' },
      });
    }
  }

  return {
    alreadyCompleted: false,
    taskId: task.id,
    characterId: task.characterId,
    yieldedLoot: syncResult.allYieldedLoot,
  };
}

/**
 * Builds a `CombatantCharacterInput` snapshot from a Character's live DB core stats, equipped gear,
 * unlocked talent nodes, and current Systemic Fatigue state.
 */
export async function buildCharacterCombatSnapshot(
  db: PrismaClient,
  characterId: string
): Promise<CombatantCharacterInput> {
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
    },
    equipmentBonuses,
    unlockedTalentRanks,
    systemicFatigueStacks,
  };
}

/**
 * Resolves an active 24-hour DungeonRun deterministically via `simulateDungeonRun()`,
 * persists `DungeonCombatReplay`, awards gold & loot to all party members, and sets them back to `IDLE`.
 */
export async function resolveDungeonRunOperation(db: PrismaClient, dungeonRunId: string) {
  const run = await db.dungeonRun.findUnique({
    where: { id: dungeonRunId },
    include: {
      dungeon: true,
      participants: true,
      combatReplay: true,
    },
  });

  if (!run) {
    throw new Error(`DungeonRun '${dungeonRunId}' not found.`);
  }

  if (run.combatReplay) {
    return run.combatReplay;
  }

  const partySnapshot =
    (run.partyBaselineSnapshot as unknown as CombatantCharacterInput[]) ?? [];
  const party =
    partySnapshot.length > 0
      ? partySnapshot
      : await Promise.all(
          run.participants
            .sort((a, b) => a.partySlot - b.partySlot)
            .map((p) => buildCharacterCombatSnapshot(db, p.characterId))
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
    await db.character.update({
      where: { id: participant.characterId },
      data: {
        gold: { increment: goldPerMember },
        activityState: 'IDLE',
      },
    });

    if (isVictory) {
      for (const drop of simResult.lootDrops) {
        await depositLootToInventory(db, participant.characterId, drop);
      }
    }

    await db.dungeonRunParticipant.update({
      where: { id: participant.id },
      data: {
        lootAwarded: {
          gold: goldPerMember,
          items: isVictory ? simResult.lootDrops : [],
        } as unknown as object,
      },
    });
  }

  await db.dungeonRun.update({
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

  const replayRecord = await db.dungeonCombatReplay.create({
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
  raidInstanceId: string
) {
  const raid = await db.raidBossInstance.findUnique({
    where: { id: raidInstanceId },
    include: { contributions: true },
  });

  if (!raid) {
    throw new Error(`RaidBossInstance '${raidInstanceId}' not found.`);
  }

  const mechanics = (raid.bossMechanicsConfig as Record<string, number>) ?? {};
  const lootPool = (raid.lootPoolConfig as unknown as WeightedRaidLootEntry[]) ?? [];

  const resolution = calculateRaidRewards({
    raidInstanceId: raid.id,
    accessType: raid.accessType,
    bossMaxHp: Number(raid.maxHp),
    isBossDefeated: raid.isDefeated || raid.currentHp <= 0n,
    baseGoldPool: mechanics.baseGoldPool ?? 10_000,
    baseGuildReputationPool: mechanics.baseGuildRepPool ?? 2_000,
    baseMaterialQuantity: 8,
    lootTable: lootPool,
    participants: raid.contributions.map((c) => ({
      characterId: c.characterId,
      combatDamageDealt: Number(c.combatDamageDealt),
      workoutEnergyDamage: Number(c.workoutEnergyDamage),
      supportScore: Number(c.supportScore),
    })),
    seed: `raid-rollover:${raid.id}`,
  });

  if (raid.status !== 'REWARDS_DISTRIBUTED') {
    for (const reward of resolution.participantRewards) {
      await db.raidParticipantContribution.update({
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
        await db.character.update({
          where: { id: reward.characterId },
          data: {
            gold: { increment: reward.goldAwarded },
            adventurerReputation: { increment: reward.guildReputationAwarded },
          },
        });
      }

      if (raid.guildId && reward.guildReputationAwarded > 0) {
        await db.guild.update({
          where: { id: raid.guildId },
          data: { guildReputation: { increment: reward.guildReputationAwarded } },
        });
      }

      for (const drop of reward.lootDrops) {
        await depositLootToInventory(db, reward.characterId, drop);
      }
    }

    await db.raidBossInstance.update({
      where: { id: raid.id },
      data: {
        status: 'REWARDS_DISTRIBUTED',
        isDefeated: resolution.isBossDefeated,
        resolvedAt: new Date(),
      },
    });
  }

  return resolution;
}
