import { PrismaClient } from '@goki/database';
import {
  ADVENTURER_COMPANY_AI_PRESETS,
  COMBAT_CONSUMABLE_BY_SLUG,
  CharacterCustomizationConfig,
  CharacterRace,
  DEFAULT_GUILD_QUEST_CATALOG,
  DungeonRequiredRank,
  EquipmentStatBonuses,
  GuildQuestCategory,
  GuildQuestDefinition,
  GuildQuestWaveDefinition,
  LootDrop,
  MAX_BELT_SLOTS,
  MAX_EQUIPPED_ACTIVE_SKILLS,
  PrimaryStatBonuses,
  TurnBasedCombatAction,
  TurnBasedCombatState,
  TurnBasedPartyMemberInput,
  WeightedDungeonLoot,
  advanceTurnBasedUntilPlayerOrEnd,
  aggregateTalentModifiers,
  createSeededRng,
  createTurnBasedEncounter,
  evaluateFatigueStateAtTime,
  isAdventurerRankSufficient,
  replayAndVerifyTurnBasedRun,
  sanitizeActiveSkillLoadout,
  sanitizeBeltLoadout,
  stepTurnBasedCombat,
} from '@goki/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertCharacterActiveAndOwned, requireAuth } from '../middleware/auth';
import { depositLootToInventory, withDbTransaction } from '../services/game-operations';

export interface NormalizedGuildQuest {
  id: string;
  questSlug: string;
  slug: string;
  title: string;
  description: string;
  category: GuildQuestCategory;
  requiredRank: DungeonRequiredRank;
  unlocksRank: DungeonRequiredRank | null;
  recommendedPower: number;
  goldReward: number;
  reputationReward: number;
  trialRequirements: { workoutsLogged?: number; totalStatLevel?: number } | null;
  waves: GuildQuestWaveDefinition[];
  lootTable: WeightedDungeonLoot[];
  lootRolls: number;
  briefingLines: string[];
  victoryDebriefLines: string[];
}

const STARTER_GUILD_RATIONS: Readonly<Record<string, number>> = {
  sunleaf_healing_draught: 2,
  vitality_elixir: 1,
};

const startQuestSchema = z.object({
  characterId: z.string().min(1),
  companionIds: z.array(z.string()).max(3).default([]),
  clientRunId: z.string().optional(),
  clientSeed: z.string().optional(),
});

const stepActionSchema = z.discriminatedUnion('type', [
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
  z.object({
    type: z.literal('AUTO_AI_TURN'),
    actorId: z.string().optional(),
  }),
]);

const stepRunSchema = z.object({
  action: z.record(z.any()),
  autoAdvanceAi: z.boolean().default(true),
});

const completeRunSchema = z
  .object({
    actions: z.array(z.any()).optional(),
  })
  .optional()
  .default({});

const syncOfflineSchema = z.object({
  characterId: z.string().min(1),
  completedRuns: z
    .array(
      z.object({
        clientRunId: z.string().min(1),
        questSlug: z.string().min(1),
        randomSeed: z.string().min(1),
        companionIds: z.array(z.string()).max(3).default([]),
        actions: z.array(z.any()),
        beltSnapshot: z
          .array(
            z.object({
              itemSlug: z.string().nullable(),
              charges: z.number().int().min(0).max(5),
            })
          )
          .max(4)
          .optional(),
        completedAt: z.string().optional(),
      })
    )
    .max(25),
});

function normalizeQuestRecord(raw: any): NormalizedGuildQuest {
  const questSlug = String(raw.questSlug ?? raw.slug);
  const catalogMatch: GuildQuestDefinition | undefined = DEFAULT_GUILD_QUEST_CATALOG.find(
    (q) => q.questSlug === questSlug
  );
  const waves = Array.isArray(raw.waves)
    ? (raw.waves as GuildQuestWaveDefinition[])
    : Array.isArray(raw.wavesConfig)
      ? (raw.wavesConfig as GuildQuestWaveDefinition[])
      : catalogMatch?.waves ?? [];

  const lootTable = Array.isArray(raw.lootTable)
    ? (raw.lootTable as WeightedDungeonLoot[])
    : catalogMatch?.lootTable ?? [];

  return {
    id: String(raw.id ?? questSlug),
    questSlug,
    slug: questSlug,
    title: String(raw.title ?? catalogMatch?.title ?? questSlug),
    description: String(raw.description ?? catalogMatch?.description ?? ''),
    category: (raw.category ?? catalogMatch?.category ?? 'LIVE_QUEST') as GuildQuestCategory,
    requiredRank: (raw.requiredRank ??
      raw.requiredAdventurerRank ??
      catalogMatch?.requiredRank ??
      'COPPER') as DungeonRequiredRank,
    unlocksRank: (raw.unlocksRank ?? catalogMatch?.unlocksRank ?? null) as DungeonRequiredRank | null,
    recommendedPower: Number(raw.recommendedPower ?? catalogMatch?.recommendedPower ?? 60),
    goldReward: Number(raw.goldReward ?? catalogMatch?.goldReward ?? 100),
    reputationReward: Number(raw.reputationReward ?? catalogMatch?.reputationReward ?? 50),
    trialRequirements: (raw.trialRequirements ?? catalogMatch?.trialRequirements ?? null) as {
      workoutsLogged?: number;
      totalStatLevel?: number;
    } | null,
    waves,
    lootTable,
    lootRolls: Number(raw.lootRolls ?? catalogMatch?.lootRolls ?? (lootTable.length > 0 ? 1 : 0)),
    briefingLines: Array.isArray(raw.briefingLines)
      ? (raw.briefingLines as string[])
      : catalogMatch?.briefingLines ?? [],
    victoryDebriefLines: Array.isArray(raw.victoryDebriefLines)
      ? (raw.victoryDebriefLines as string[])
      : catalogMatch?.victoryDebriefLines ?? [],
  };
}

async function resolveQuestDefinition(
  db: PrismaClient,
  questIdOrSlug: string
): Promise<NormalizedGuildQuest | null> {
  if (typeof (db as any).guildQuest?.findFirst === 'function') {
    const dbQuest = await (db as any).guildQuest.findFirst({
      where: { OR: [{ id: questIdOrSlug }, { slug: questIdOrSlug }] },
    });
    if (dbQuest) {
      return normalizeQuestRecord(dbQuest);
    }
  } else if (typeof (db as any).guildQuest?.findUnique === 'function') {
    const dbQuest = await (db as any).guildQuest.findUnique({
      where: { slug: questIdOrSlug },
    });
    if (dbQuest) {
      return normalizeQuestRecord(dbQuest);
    }
  }

  const catalogQuest = DEFAULT_GUILD_QUEST_CATALOG.find((q) => q.questSlug === questIdOrSlug);
  return catalogQuest ? normalizeQuestRecord(catalogQuest) : null;
}

async function upsertQuestIfSupported(db: PrismaClient, quest: NormalizedGuildQuest): Promise<string> {
  if (typeof (db as any).guildQuest?.upsert === 'function') {
    const upserted = await (db as any).guildQuest.upsert({
      where: { slug: quest.questSlug },
      create: {
        slug: quest.questSlug,
        title: quest.title,
        description: quest.description,
        category: quest.category,
        requiredAdventurerRank: quest.requiredRank,
        unlocksRank: quest.unlocksRank,
        recommendedPower: quest.recommendedPower,
        wavesConfig: quest.waves as any,
        trialRequirements: quest.trialRequirements as any,
        goldReward: quest.goldReward,
        reputationReward: quest.reputationReward,
        lootTable: quest.lootTable as any,
      },
      update: {
        title: quest.title,
        description: quest.description,
        category: quest.category,
        requiredAdventurerRank: quest.requiredRank,
        unlocksRank: quest.unlocksRank,
        recommendedPower: quest.recommendedPower,
        wavesConfig: quest.waves as any,
        trialRequirements: quest.trialRequirements as any,
        goldReward: quest.goldReward,
        reputationReward: quest.reputationReward,
        lootTable: quest.lootTable as any,
      },
    });
    return String(upserted?.id ?? quest.id);
  }
  return quest.id;
}

async function loadCharacterForGuildEncounter(db: PrismaClient, characterId: string) {
  return db.character.findUnique({
    where: { id: characterId },
    include: {
      stats: true,
      fatigueState: true,
      talentUnlocks: { include: { talentNode: true } },
      inventoryItems: { include: { item: true } },
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
      _count: { select: { workoutLogs: true } },
    },
  });
}

async function getWorkoutsLoggedCount(db: PrismaClient, character: any): Promise<number> {
  if (typeof character?._count?.workoutLogs === 'number') {
    return character._count.workoutLogs;
  }
  if (typeof (db as any).workoutLog?.count === 'function') {
    return await (db as any).workoutLog.count({
      where: { characterId: character.id },
    });
  }
  return 0;
}

function getCharacterTotalStatLevel(character: any): number {
  return (
    (character?.stats?.strengthLevel ?? 1) +
    (character?.stats?.enduranceLevel ?? 1) +
    (character?.stats?.agilityLevel ?? 1) +
    (character?.dexLevel ?? 1) +
    (character?.conLevel ?? 1) +
    (character?.wisLevel ?? 1) +
    (character?.sprLevel ?? 1)
  );
}

function checkQuestGateRequirements(params: {
  quest: NormalizedGuildQuest;
  adventurerRank: string;
  workoutsLogged: number;
  totalStatLevel: number;
}): { ok: boolean; error?: string } {
  const { quest, adventurerRank, workoutsLogged, totalStatLevel } = params;

  if (!isAdventurerRankSufficient(adventurerRank, quest.requiredRank)) {
    return {
      ok: false,
      error: `Requires Adventurer Rank ${quest.requiredRank} (current: ${adventurerRank}).`,
    };
  }

  if (
    quest.category === 'RANK_UP_TRIAL' &&
    quest.unlocksRank &&
    isAdventurerRankSufficient(adventurerRank, quest.unlocksRank)
  ) {
    return {
      ok: false,
      error: `Rank ${quest.unlocksRank} already achieved.`,
    };
  }

  const reqWorkouts = quest.trialRequirements?.workoutsLogged;
  if (typeof reqWorkouts === 'number' && workoutsLogged < reqWorkouts) {
    return {
      ok: false,
      error: `Trial requires at least ${reqWorkouts} logged workout(s) (current: ${workoutsLogged}).`,
    };
  }

  const reqTotalStat = quest.trialRequirements?.totalStatLevel;
  if (typeof reqTotalStat === 'number' && totalStatLevel < reqTotalStat) {
    return {
      ok: false,
      error: `Trial requires total stat level ${reqTotalStat} (current: ${totalStatLevel}).`,
    };
  }

  return { ok: true };
}

function buildOwnedConsumableMap(character: any): Map<string, number> {
  const owned = new Map<string, number>();
  for (const inv of character?.inventoryItems ?? []) {
    const slug = inv?.item?.slug ?? inv?.itemSlug;
    if (slug) {
      owned.set(slug, (owned.get(slug) ?? 0) + Math.max(0, Number(inv.quantity ?? 0)));
    }
  }
  return owned;
}

function buildHeroPartyMember(
  character: any,
  options?: {
    ownedOverrides?: Map<string, number>;
    beltSnapshot?: ReadonlyArray<{ itemSlug: string | null; charges: number }>;
  }
): TurnBasedPartyMemberInput {
  const equipmentBonuses: EquipmentStatBonuses = {};
  const equipmentPrimaryStatBonuses: PrimaryStatBonuses = {};
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
      const meta = (slot?.itemMetadata ?? null) as Record<string, any> | null;
      const b = ((meta?.statBonuses ?? slot?.item?.statBonuses) ?? null) as EquipmentStatBonuses | null;
      if (b) {
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
        equipmentBonuses.damageMitigationPct =
          (equipmentBonuses.damageMitigationPct ?? 0) + (b.damageMitigationPct ?? 0);
        equipmentBonuses.lifeOnHit = (equipmentBonuses.lifeOnHit ?? 0) + (b.lifeOnHit ?? 0);
        equipmentBonuses.armorPenetrationPct =
          (equipmentBonuses.armorPenetrationPct ?? 0) + (b.armorPenetrationPct ?? 0);
        equipmentBonuses.skillPotencyPct =
          (equipmentBonuses.skillPotencyPct ?? 0) + (b.skillPotencyPct ?? 0);
        equipmentBonuses.startOfCombatShieldHp =
          (equipmentBonuses.startOfCombatShieldHp ?? 0) + (b.startOfCombatShieldHp ?? 0);
      }

      const prim = (meta?.primaryStatBonuses ?? null) as PrimaryStatBonuses | null;
      if (prim) {
        equipmentPrimaryStatBonuses.STR = (equipmentPrimaryStatBonuses.STR ?? 0) + (prim.STR ?? 0);
        equipmentPrimaryStatBonuses.END = (equipmentPrimaryStatBonuses.END ?? 0) + (prim.END ?? 0);
        equipmentPrimaryStatBonuses.AGI = (equipmentPrimaryStatBonuses.AGI ?? 0) + (prim.AGI ?? 0);
        equipmentPrimaryStatBonuses.DEX = (equipmentPrimaryStatBonuses.DEX ?? 0) + (prim.DEX ?? 0);
        equipmentPrimaryStatBonuses.CON = (equipmentPrimaryStatBonuses.CON ?? 0) + (prim.CON ?? 0);
        equipmentPrimaryStatBonuses.WIS = (equipmentPrimaryStatBonuses.WIS ?? 0) + (prim.WIS ?? 0);
        equipmentPrimaryStatBonuses.SPR = (equipmentPrimaryStatBonuses.SPR ?? 0) + (prim.SPR ?? 0);
      }
    }
  }

  const unlockedTalentRanks: Record<string, number> = {};
  for (const unlock of character.talentUnlocks ?? []) {
    const slug = unlock?.talentNode?.slug;
    if (slug) {
      unlockedTalentRanks[slug] = unlock.currentRank ?? 1;
    }
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

  let activeSkillIds = sanitizeActiveSkillLoadout(character.activeSkillLoadout, unlockedTalentRanks);
  if (activeSkillIds.length === 0) {
    const aggregated = aggregateTalentModifiers(unlockedTalentRanks);
    activeSkillIds = aggregated.unlockedSkills
      .slice(0, MAX_EQUIPPED_ACTIVE_SKILLS)
      .map((s) => s.skillId);
  }

  const remainingOwned = new Map(options?.ownedOverrides ?? buildOwnedConsumableMap(character));
  const beltSlots: Array<{ itemSlug: string | null; charges: number }> = [];

  if (options?.beltSnapshot && options.beltSnapshot.length > 0) {
    const remainingRations = new Map<string, number>(Object.entries(STARTER_GUILD_RATIONS));
    for (let i = 0; i < MAX_BELT_SLOTS; i++) {
      const snapSlot: { itemSlug: string | null; charges: number } | undefined =
        options.beltSnapshot[i];
      const slug = snapSlot?.itemSlug ?? null;
      if (!slug || !COMBAT_CONSUMABLE_BY_SLUG[slug] || !snapSlot || snapSlot.charges <= 0) {
        beltSlots.push({ itemSlug: null, charges: 0 });
        continue;
      }
      const ownedQty = remainingOwned.get(slug) ?? 0;
      const rationQty = remainingRations.get(slug) ?? 0;
      const allowedCap = Math.min(3, Math.max(ownedQty, rationQty));
      const charges = Math.min(snapSlot.charges, allowedCap);
      if (ownedQty > 0) {
        const deductFromOwned = Math.min(ownedQty, charges);
        remainingOwned.set(slug, Math.max(0, ownedQty - deductFromOwned));
      }
      if (rationQty > 0 && charges > ownedQty) {
        const deductFromRation = Math.min(rationQty, charges - ownedQty);
        remainingRations.set(slug, Math.max(0, rationQty - deductFromRation));
      }
      beltSlots.push({ itemSlug: charges > 0 ? slug : null, charges });
    }
  } else {
    const sanitizedBelt = sanitizeBeltLoadout(character.beltLoadout);
    for (let i = 0; i < MAX_BELT_SLOTS; i++) {
      const slug = sanitizedBelt[i] ?? null;
      if (!slug || !COMBAT_CONSUMABLE_BY_SLUG[slug]) {
        beltSlots.push({ itemSlug: null, charges: 0 });
        continue;
      }
      const ownedQty = remainingOwned.get(slug) ?? 0;
      const charges = Math.min(3, ownedQty);
      remainingOwned.set(slug, Math.max(0, ownedQty - charges));
      beltSlots.push({ itemSlug: slug, charges });
    }
  }

  return {
    characterId: character.id,
    name: character.name,
    controller: 'PLAYER',
    ownerUserId: character.userId,
    race: ((character as any).race as CharacterRace | undefined) ?? 'HUMAN',
    appearanceId: character.appearanceId,
    customizationConfig:
      ((character as any).customizationConfig as CharacterCustomizationConfig | undefined) ??
      undefined,
    coreStats: {
      strengthLevel: character.stats?.strengthLevel ?? 1,
      enduranceLevel: character.stats?.enduranceLevel ?? 1,
      agilityLevel: character.stats?.agilityLevel ?? 1,
      dexLevel: (character as any).dexLevel ?? 1,
      conLevel: (character as any).conLevel ?? 1,
      wisLevel: (character as any).wisLevel ?? 1,
      sprLevel: (character as any).sprLevel ?? 1,
    },
    equipmentBonuses,
    equipmentPrimaryStatBonuses,
    unlockedTalentRanks,
    activeSkillIds,
    beltSlots,
    systemicFatigueStacks,
  };
}

function appendSelectedCompanions(
  party: TurnBasedPartyMemberInput[],
  companionIds: readonly string[]
): string[] {
  const seen = new Set<string>();
  const selectedIds: string[] = [];

  for (const cid of companionIds) {
    if (seen.has(cid)) continue;
    const preset = ADVENTURER_COMPANY_AI_PRESETS.find((p) => p.characterId === cid);
    if (preset) {
      seen.add(cid);
      selectedIds.push(cid);
      party.push(preset);
    }
  }

  return selectedIds;
}

function rollQuestLootDrops(quest: NormalizedGuildQuest, seed: string): LootDrop[] {
  if (!quest.lootTable || quest.lootTable.length === 0 || quest.lootRolls <= 0) {
    return [];
  }
  const rng = createSeededRng(`${seed}:loot`);
  const drops: LootDrop[] = [];
  for (let i = 0; i < quest.lootRolls; i++) {
    const picked = rng.pickWeighted(quest.lootTable);
    drops.push({
      itemSlug: picked.itemSlug,
      itemName: picked.itemName,
      rarity: picked.rarity,
      quantity: picked.quantity,
      ...(picked.tier !== undefined ? { tier: picked.tier } : {}),
      ...(picked.prefixId !== undefined ? { prefixId: picked.prefixId } : {}),
      ...(picked.prefixLabel !== undefined ? { prefixLabel: picked.prefixLabel } : {}),
      ...(picked.prefixSummary !== undefined ? { prefixSummary: picked.prefixSummary } : {}),
      ...(picked.suffixId !== undefined ? { suffixId: picked.suffixId } : {}),
      ...(picked.suffixLabel !== undefined ? { suffixLabel: picked.suffixLabel } : {}),
      ...(picked.suffixSummary !== undefined ? { suffixSummary: picked.suffixSummary } : {}),
      ...(picked.baseStatsSummary !== undefined ? { baseStatsSummary: picked.baseStatsSummary } : {}),
      ...(picked.statBonuses !== undefined ? { statBonuses: picked.statBonuses } : {}),
      ...(picked.primaryStatBonuses !== undefined
        ? { primaryStatBonuses: picked.primaryStatBonuses }
        : {}),
      ...(picked.uniquePassive !== undefined ? { uniquePassive: picked.uniquePassive } : {}),
    });
  }
  return drops;
}

async function deductConsumablesUsed(
  tx: PrismaClient,
  characterId: string,
  consumablesUsed: Record<string, number> | undefined
): Promise<void> {
  if (!consumablesUsed || typeof (tx as any).inventoryItem?.findMany !== 'function') return;
  const entries = Object.entries(consumablesUsed).filter(([, count]) => count > 0);
  if (entries.length === 0) return;

  const invItems = await (tx as any).inventoryItem.findMany({
    where: { characterId },
    include: { item: true },
  });

  for (const [slug, usedCount] of entries) {
    let remaining = Math.max(0, Math.floor(usedCount));
    if (remaining === 0) continue;

    for (const inv of invItems ?? []) {
      if (remaining <= 0) break;
      const invSlug = inv?.item?.slug ?? inv?.itemSlug;
      if (invSlug !== slug || (inv?.quantity ?? 0) <= 0) continue;

      const currentQty = Math.max(0, Number(inv.quantity ?? 0));
      const deduct = Math.min(currentQty, remaining);
      const nextQty = Math.max(0, currentQty - deduct);
      remaining -= deduct;
      inv.quantity = nextQty;

      if (typeof (tx as any).inventoryItem?.update === 'function') {
        await (tx as any).inventoryItem.update({
          where: { id: inv.id },
          data: { quantity: nextQty },
        });
      }
    }
  }
}

async function findGuildQuestRunByIdOrClientId(db: PrismaClient, runId: string) {
  if (typeof (db as any).guildQuestRun?.findFirst === 'function') {
    return (db as any).guildQuestRun.findFirst({
      where: { OR: [{ id: runId }, { clientRunId: runId }] },
      include: { quest: true },
    });
  }
  if (typeof (db as any).guildQuestRun?.findUnique === 'function') {
    return (db as any).guildQuestRun.findUnique({
      where: { id: runId },
      include: { quest: true },
    });
  }
  return null;
}

export function registerAdventurersGuildRoutes(app: FastifyInstance, db: PrismaClient): void {
  /**
   * GET /api/adventurers-guild/quests
   * Lists Live Quests & Rank-Up Trials separately from 24h passive expeditions (/api/dungeons).
   */
  app.get('/api/adventurers-guild/quests', async (_request, reply) => {
    let dbRows: any[] = [];
    if (typeof (db as any).guildQuest?.findMany === 'function') {
      try {
        dbRows = await (db as any).guildQuest.findMany({
          orderBy: { recommendedPower: 'asc' },
        });
      } catch {
        dbRows = [];
      }
    }

    const quests: NormalizedGuildQuest[] =
      dbRows.length > 0
        ? dbRows.map((row) => normalizeQuestRecord(row))
        : DEFAULT_GUILD_QUEST_CATALOG.map((q) => normalizeQuestRecord(q));

    const liveQuests = quests.filter((q) => q.category === 'LIVE_QUEST');
    const rankUpTrials = quests.filter((q) => q.category === 'RANK_UP_TRIAL');

    return reply.send({ quests, liveQuests, rankUpTrials });
  });

  /**
   * POST /api/adventurers-guild/quests/:questId/start
   * Starts a live turn-based Adventurer's Guild quest or Rank-Up Trial encounter.
   */
  app.post(
    '/api/adventurers-guild/quests/:questId/start',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { questId } = z.object({ questId: z.string() }).parse(request.params);
      const body = startQuestSchema.parse(request.body);

      await assertCharacterActiveAndOwned(db, body.characterId, request.user.userId);

      const quest = await resolveQuestDefinition(db, questId);
      if (!quest) {
        return reply.status(404).send({ error: 'Guild quest not found.' });
      }

      const character = await loadCharacterForGuildEncounter(db, body.characterId);
      if (!character) {
        return reply.status(404).send({ error: 'Character not found.' });
      }

      const workoutsLogged = await getWorkoutsLoggedCount(db, character);
      const totalStatLevel = getCharacterTotalStatLevel(character);
      const gate = checkQuestGateRequirements({
        quest,
        adventurerRank: (character as any).adventurerRank ?? 'COPPER',
        workoutsLogged,
        totalStatLevel,
      });
      if (!gate.ok) {
        return reply.status(400).send({ error: gate.error });
      }

      const hero = buildHeroPartyMember(character);
      const party: TurnBasedPartyMemberInput[] = [hero];
      const chosenCompanionIds = appendSelectedCompanions(party, body.companionIds);

      const seed = body.clientSeed || `guild:${quest.questSlug}:${Date.now()}:${character.id}`;
      const encounterId = body.clientRunId || `grun_${Date.now()}`;

      const encounterState = createTurnBasedEncounter({
        encounterId,
        questSlug: quest.questSlug,
        questTitle: quest.title,
        party,
        waves: quest.waves,
        seed,
      });

      const persistedQuestId = await upsertQuestIfSupported(db, quest);

      let run: any;
      if (typeof (db as any).guildQuestRun?.create === 'function') {
        run = await (db as any).guildQuestRun.create({
          data: {
            questId: persistedQuestId,
            characterId: character.id,
            clientRunId: body.clientRunId ?? null,
            status: 'IN_PROGRESS',
            randomSeed: seed,
            companionIds: chosenCompanionIds as any,
            partySnapshot: party as any,
            checkpointState: encounterState as any,
            actionLog: [] as any,
            wavesCleared: 0,
            totalTurns: 0,
            consumablesUsed: {} as any,
          },
          include: { quest: true },
        });
      } else {
        run = {
          id: encounterId,
          questId: persistedQuestId,
          characterId: character.id,
          clientRunId: body.clientRunId ?? null,
          status: 'IN_PROGRESS',
          randomSeed: seed,
          companionIds: chosenCompanionIds,
          partySnapshot: party,
          checkpointState: encounterState,
          actionLog: [],
          wavesCleared: 0,
          totalTurns: 0,
          consumablesUsed: {},
          startedAt: new Date(),
        };
      }

      return reply.status(201).send({ run, encounterState });
    }
  );

  /**
   * POST /api/adventurers-guild/runs/:runId/step
   * Executes one player (or AI) tactical turn and optionally auto-advances AI turns.
   */
  app.post(
    '/api/adventurers-guild/runs/:runId/step',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { runId } = z.object({ runId: z.string() }).parse(request.params);
      const body = stepRunSchema.parse(request.body);
      const parsedAction = stepActionSchema.safeParse(body.action);
      if (!parsedAction.success) {
        return reply.status(400).send({
          error: 'Invalid combat action payload.',
          issues: parsedAction.error.issues,
        });
      }

      const run = await findGuildQuestRunByIdOrClientId(db, runId);
      if (!run) {
        return reply.status(404).send({ error: 'Guild quest run not found.' });
      }

      await assertCharacterActiveAndOwned(db, run.characterId, request.user.userId);

      if (run.status !== 'IN_PROGRESS') {
        return reply.status(400).send({
          error: `Cannot step guild quest run in status ${run.status}.`,
        });
      }

      const checkpointState = run.checkpointState as unknown as TurnBasedCombatState | null;
      if (!checkpointState) {
        return reply.status(400).send({ error: 'Run checkpoint state is missing.' });
      }

      const stepRes = stepTurnBasedCombat(
        checkpointState,
        parsedAction.data as TurnBasedCombatAction
      );
      if (!stepRes.valid) {
        return reply.status(400).send({ error: stepRes.error ?? 'Invalid combat step.' });
      }

      const events = [...stepRes.events];
      let finalState = stepRes.state;

      if (body.autoAdvanceAi && finalState.status === 'IN_PROGRESS') {
        const aiRes = advanceTurnBasedUntilPlayerOrEnd(finalState);
        if (!aiRes.valid) {
          return reply.status(400).send({ error: aiRes.error ?? 'AI turn progression failed.' });
        }
        finalState = aiRes.state;
        events.push(...aiRes.events);
      }

      const wavesCleared =
        finalState.currentWaveIndex + (finalState.status === 'VICTORY' ? 1 : 0);

      let updatedRun = run;
      if (typeof (db as any).guildQuestRun?.update === 'function') {
        updatedRun = await (db as any).guildQuestRun.update({
          where: { id: run.id },
          data: {
            checkpointState: finalState as any,
            actionLog: finalState.actionLog as any,
            wavesCleared,
            totalTurns: finalState.turnNumber,
            consumablesUsed: finalState.consumablesUsed as any,
          },
          include: { quest: true },
        });
      }

      return reply.send({
        valid: true,
        events,
        encounterState: finalState,
        run: updatedRun,
      });
    }
  );

  /**
   * POST /api/adventurers-guild/runs/:runId/complete
   * Finalizes an online Guild Quest run, deducts used consumables, and grants deterministic rewards.
   */
  app.post(
    '/api/adventurers-guild/runs/:runId/complete',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { runId } = z.object({ runId: z.string() }).parse(request.params);
      const body = completeRunSchema.parse(request.body);

      const run = await findGuildQuestRunByIdOrClientId(db, runId);
      if (!run) {
        return reply.status(404).send({ error: 'Guild quest run not found.' });
      }

      await assertCharacterActiveAndOwned(db, run.characterId, request.user.userId);

      if (run.status === 'VICTORY' || run.status === 'DEFEAT') {
        return reply.status(409).send({ error: 'Guild quest run already completed.' });
      }

      const quest = run.quest
        ? normalizeQuestRecord(run.quest)
        : await resolveQuestDefinition(db, run.questId);
      if (!quest) {
        return reply.status(404).send({ error: 'Guild quest definition not found.' });
      }

      let finalState: TurnBasedCombatState;
      if (body.actions !== undefined) {
        const verified = replayAndVerifyTurnBasedRun(
          {
            encounterId: run.id,
            questSlug: quest.questSlug,
            questTitle: quest.title,
            party: (run.partySnapshot as unknown as TurnBasedPartyMemberInput[]) ?? [],
            waves: quest.waves,
            seed: run.randomSeed,
          },
          body.actions as TurnBasedCombatAction[]
        );
        if (!verified.valid) {
          return reply.status(400).send({
            error: verified.error ?? 'Replay verification failed.',
          });
        }
        finalState = verified.finalState;
      } else {
        const checkpoint = run.checkpointState as unknown as TurnBasedCombatState | null;
        if (!checkpoint) {
          return reply.status(400).send({ error: 'Encounter checkpoint state is missing.' });
        }
        finalState = checkpoint;
      }

      if (finalState.status === 'IN_PROGRESS') {
        return reply.status(400).send({ error: 'Encounter is still in progress.' });
      }

      const txResult = await withDbTransaction(
        db,
        async (tx) => {
          const freshRun = await findGuildQuestRunByIdOrClientId(tx, run.id);
          if (freshRun && (freshRun.status === 'VICTORY' || freshRun.status === 'DEFEAT')) {
            throw Object.assign(new Error('Guild quest run already completed.'), { statusCode: 409 });
          }

          await deductConsumablesUsed(tx, run.characterId, finalState.consumablesUsed);

          const isVictory = finalState.status === 'VICTORY';
          let lootDrops: LootDrop[] = [];
          let rankPromotedTo: DungeonRequiredRank | null = null;
          let updatedChar = await tx.character.findUnique({ where: { id: run.characterId } });

          if (isVictory) {
            lootDrops = rollQuestLootDrops(quest, run.randomSeed);
            if (typeof (tx as any).item?.findUnique === 'function') {
              for (const drop of lootDrops) {
                await depositLootToInventory(tx, run.characterId, drop);
              }
            }

            const currentRank = ((updatedChar as any)?.adventurerRank ?? 'COPPER') as string;
            const shouldPromote =
              quest.category === 'RANK_UP_TRIAL' &&
              quest.unlocksRank !== null &&
              !isAdventurerRankSufficient(currentRank, quest.unlocksRank);

            if (shouldPromote && quest.unlocksRank) {
              rankPromotedTo = quest.unlocksRank;
            }

            updatedChar = await tx.character.update({
              where: { id: run.characterId },
              data: {
                gold: { increment: quest.goldReward },
                adventurerReputation: { increment: quest.reputationReward },
                ...(rankPromotedTo ? { adventurerRank: rankPromotedTo } : {}),
              },
              include: {
                stats: true,
                inventoryItems: { include: { item: true } },
              },
            });
          }

          const rewards = isVictory
            ? {
                gold: quest.goldReward,
                reputation: quest.reputationReward,
                lootDrops,
                rankPromotedTo,
              }
            : {
                gold: 0,
                reputation: 0,
                lootDrops: [],
                rankPromotedTo: null,
              };

          const wavesCleared =
            finalState.currentWaveIndex + (finalState.status === 'VICTORY' ? 1 : 0);

          let updatedRun = run;
          if (typeof (tx as any).guildQuestRun?.update === 'function') {
            updatedRun = await (tx as any).guildQuestRun.update({
              where: { id: run.id },
              data: {
                status: finalState.status,
                checkpointState: finalState as any,
                actionLog: finalState.actionLog as any,
                completedAt: new Date(),
                wavesCleared,
                totalTurns: finalState.turnNumber,
                consumablesUsed: finalState.consumablesUsed as any,
                rewardsGranted: rewards as any,
                rankPromotedTo,
              },
              include: { quest: true },
            });
          }

          return {
            run: updatedRun,
            outcome: finalState.status,
            rewards,
            character: updatedChar,
          };
        },
        `guild-run:${run.id}`
      );

      return reply.send(txResult);
    }
  );

  /**
   * POST /api/adventurers-guild/sync-offline
   * Deterministically replays and verifies offline-completed Adventurer's Guild quest runs.
   */
  app.post(
    '/api/adventurers-guild/sync-offline',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = syncOfflineSchema.parse(request.body);

      await assertCharacterActiveAndOwned(db, body.characterId, request.user.userId);

      const character = await loadCharacterForGuildEncounter(db, body.characterId);
      if (!character) {
        return reply.status(404).send({ error: 'Character not found.' });
      }

      const workoutsLogged = await getWorkoutsLoggedCount(db, character);
      const totalStatLevel = getCharacterTotalStatLevel(character);
      let inFlightRank = ((character as any).adventurerRank ?? 'COPPER') as string;
      let latestCharacter: any = character;
      const inFlightOwnedConsumables = buildOwnedConsumableMap(character);

      const syncedRuns: Array<Record<string, any>> = [];

      for (const item of body.completedRuns) {
        if (typeof (db as any).guildQuestRun?.findUnique === 'function') {
          const existing = await (db as any).guildQuestRun.findUnique({
            where: { clientRunId: item.clientRunId },
          });
          if (existing) {
            syncedRuns.push({
              clientRunId: item.clientRunId,
              questSlug: item.questSlug,
              status: existing.status,
              synced: true,
              alreadySynced: true,
              rewards: existing.rewardsGranted ?? null,
            });
            continue;
          }
        }

        const quest = await resolveQuestDefinition(db, item.questSlug);
        if (!quest) {
          syncedRuns.push({
            clientRunId: item.clientRunId,
            questSlug: item.questSlug,
            synced: false,
            error: `Guild quest '${item.questSlug}' not found.`,
          });
          continue;
        }

        const gate = checkQuestGateRequirements({
          quest,
          adventurerRank: inFlightRank,
          workoutsLogged,
          totalStatLevel,
        });
        if (!gate.ok) {
          syncedRuns.push({
            clientRunId: item.clientRunId,
            questSlug: item.questSlug,
            synced: false,
            error: gate.error ?? 'Quest requirements not met.',
          });
          continue;
        }

        const hero = buildHeroPartyMember(latestCharacter, {
          ownedOverrides: inFlightOwnedConsumables,
          beltSnapshot: item.beltSnapshot,
        });
        const party: TurnBasedPartyMemberInput[] = [hero];
        const chosenCompanionIds = appendSelectedCompanions(party, item.companionIds);

        const verified = replayAndVerifyTurnBasedRun(
          {
            encounterId: item.clientRunId,
            questSlug: quest.questSlug,
            questTitle: quest.title,
            party,
            waves: quest.waves,
            seed: item.randomSeed,
          },
          item.actions as TurnBasedCombatAction[]
        );

        if (!verified.valid) {
          syncedRuns.push({
            clientRunId: item.clientRunId,
            questSlug: item.questSlug,
            synced: false,
            error: verified.error ?? 'Replay verification failed.',
          });
          continue;
        }

        const finalState = verified.finalState;

        const runOutcome = await withDbTransaction(
          db,
          async (tx) => {
            const persistedQuestId = await upsertQuestIfSupported(tx, quest);

            await deductConsumablesUsed(tx, body.characterId, finalState.consumablesUsed);
            for (const [slug, used] of Object.entries(finalState.consumablesUsed ?? {})) {
              const cur = inFlightOwnedConsumables.get(slug) ?? 0;
              inFlightOwnedConsumables.set(slug, Math.max(0, cur - Math.max(0, used)));
            }

            const isVictory = finalState.status === 'VICTORY';
            let lootDrops: LootDrop[] = [];
            let rankPromotedTo: DungeonRequiredRank | null = null;

            if (isVictory) {
              lootDrops = rollQuestLootDrops(quest, item.randomSeed);
              if (typeof (tx as any).item?.findUnique === 'function') {
                for (const drop of lootDrops) {
                  await depositLootToInventory(tx, body.characterId, drop);
                }
              }

              if (
                quest.category === 'RANK_UP_TRIAL' &&
                quest.unlocksRank &&
                !isAdventurerRankSufficient(inFlightRank, quest.unlocksRank)
              ) {
                rankPromotedTo = quest.unlocksRank;
                inFlightRank = quest.unlocksRank;
              }

              latestCharacter = await tx.character.update({
                where: { id: body.characterId },
                data: {
                  gold: { increment: quest.goldReward },
                  adventurerReputation: { increment: quest.reputationReward },
                  ...(rankPromotedTo ? { adventurerRank: rankPromotedTo } : {}),
                },
                include: {
                  stats: true,
                  inventoryItems: { include: { item: true } },
                },
              });
            }

            const rewards = isVictory
              ? {
                  gold: quest.goldReward,
                  reputation: quest.reputationReward,
                  lootDrops,
                  rankPromotedTo,
                }
              : {
                  gold: 0,
                  reputation: 0,
                  lootDrops: [],
                  rankPromotedTo: null,
                };

            const wavesCleared =
              finalState.currentWaveIndex + (finalState.status === 'VICTORY' ? 1 : 0);

            if (typeof (tx as any).guildQuestRun?.create === 'function') {
              await (tx as any).guildQuestRun.create({
                data: {
                  clientRunId: item.clientRunId,
                  questId: persistedQuestId,
                  characterId: body.characterId,
                  status: finalState.status,
                  randomSeed: item.randomSeed,
                  companionIds: chosenCompanionIds as any,
                  partySnapshot: party as any,
                  checkpointState: finalState as any,
                  actionLog: item.actions as any,
                  wavesCleared,
                  totalTurns: finalState.turnNumber,
                  consumablesUsed: finalState.consumablesUsed as any,
                  rewardsGranted: rewards as any,
                  rankPromotedTo,
                  completedAt: item.completedAt ? new Date(item.completedAt) : new Date(),
                  syncedFromOffline: true,
                },
              });
            }

            return {
              status: finalState.status,
              rewards,
              rankPromotedTo,
            };
          },
          `guild-sync:${body.characterId}:${item.clientRunId}`
        );

        syncedRuns.push({
          clientRunId: item.clientRunId,
          questSlug: item.questSlug,
          status: runOutcome.status,
          synced: true,
          alreadySynced: false,
          rewards: runOutcome.rewards,
          rankPromotedTo: runOutcome.rankPromotedTo,
        });
      }

      return reply.status(200).send({
        syncedRuns,
        character: latestCharacter,
      });
    }
  );
}
