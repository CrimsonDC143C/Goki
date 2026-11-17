import { Prisma, PrismaClient } from '@prisma/client';
import {
  BASE_EQUIPPABLE_ITEMS,
  COMBAT_CONSUMABLE_CATALOG,
  CRAFTING_MATERIAL_CATALOG,
  DEFAULT_DUNGEON_CATALOG,
  DEFAULT_EXERCISE_CATALOG,
  DEFAULT_GUILD_QUEST_CATALOG,
  DEFAULT_TALENT_TREES,
  STARTER_WORKOUT_PRESETS,
} from '@goki/game-engine';

const prisma = new PrismaClient();

export async function runSeed(db: PrismaClient = prisma): Promise<void> {
  console.log('🌱 Seeding Goki database...');

  // --------------------------------------------------------------------------
  // 1. Tailored Exercise & Sport Catalog
  //    (Altas AL-3058G Smith/Dual Cable/Landmine/Pull-Up-Dip, Pepin DBs up to 85 lb,
  //     Badminton, Boxing, Outdoor Cycling, Daily Walks + classic barbell staples)
  // --------------------------------------------------------------------------
  const exercises = DEFAULT_EXERCISE_CATALOG.map((ex) => ({
    slug: ex.slug,
    name: ex.name,
    category: ex.category,
    workoutCategory: ex.workoutCategory,
    primaryStat: ex.primaryStat,
    muscleGroup: ex.muscleGroup,
    equipmentType: ex.equipmentType,
    activityType: ex.activityType ?? null,
    isCompound: ex.isCompound,
    baseXpFactor: ex.baseXpFactor,
    description: ex.description,
  }));

  for (const ex of exercises) {
    await db.exerciseCatalog.upsert({
      where: { slug: ex.slug },
      update: ex,
      create: ex,
    });
  }

  // --------------------------------------------------------------------------
  // 1B. 5 Ready-to-Load Starter Workout Presets (Supersets, Drop-Sets, Sport & Cardio)
  // --------------------------------------------------------------------------
  for (const preset of STARTER_WORKOUT_PRESETS) {
    const data = {
      name: preset.name,
      category: preset.category,
      notes: preset.notes,
      isSystemSeed: true,
      blocks: preset.blocks as unknown as object,
    };
    await db.workoutPreset.upsert({
      where: { slug: preset.slug },
      update: data,
      create: { ...data, slug: preset.slug, userId: null },
    });
  }

  // --------------------------------------------------------------------------
  // 2. Multi-Class Stat-Bound Talent Trees & Nodes (10 archetypes across 7 stats, 40 nodes total)
  // --------------------------------------------------------------------------
  const dbNodeIdByEngineSlug = new Map<string, string>();

  for (const treeDef of DEFAULT_TALENT_TREES) {
    const dbTree = await db.talentTree.upsert({
      where: { slug: treeDef.slug },
      update: {
        name: treeDef.name,
        governingStat: treeDef.governingStat,
        archetypeRole: treeDef.archetypeRole,
        description: treeDef.description,
      },
      create: {
        slug: treeDef.slug,
        name: treeDef.name,
        governingStat: treeDef.governingStat,
        archetypeRole: treeDef.archetypeRole,
        description: treeDef.description,
      },
    });

    // Pass 1: Upsert nodes without prerequisite FK
    for (const nodeDef of treeDef.nodes) {
      const dbNode = await db.talentNode.upsert({
        where: { slug: nodeDef.id },
        update: {
          talentTreeId: dbTree.id,
          name: nodeDef.name,
          description: nodeDef.description,
          tier: nodeDef.tier,
          maxRank: nodeDef.maxRank,
          pointCostPerRank: nodeDef.pointCostPerRank,
          requiredTreePointsSpent: nodeDef.requiredTreePointsSpent,
          nodeType: nodeDef.nodeType,
          effectConfig: {
            passivePerRank: nodeDef.passivePerRank ?? null,
            activeSkill: nodeDef.activeSkill ?? null,
            modifiers: nodeDef.modifiers ?? null,
            grantedSkillId: nodeDef.grantedSkillId ?? null,
            keystonePenalty: nodeDef.keystonePenalty ?? null,
          } as object,
        },
        create: {
          talentTreeId: dbTree.id,
          slug: nodeDef.id,
          name: nodeDef.name,
          description: nodeDef.description,
          tier: nodeDef.tier,
          maxRank: nodeDef.maxRank,
          pointCostPerRank: nodeDef.pointCostPerRank,
          requiredTreePointsSpent: nodeDef.requiredTreePointsSpent,
          nodeType: nodeDef.nodeType,
          effectConfig: {
            passivePerRank: nodeDef.passivePerRank ?? null,
            activeSkill: nodeDef.activeSkill ?? null,
            modifiers: nodeDef.modifiers ?? null,
            grantedSkillId: nodeDef.grantedSkillId ?? null,
            keystonePenalty: nodeDef.keystonePenalty ?? null,
          } as object,
        },
      });
      dbNodeIdByEngineSlug.set(nodeDef.id, dbNode.id);
    }

    // Pass 2: Wire prerequisiteNodeId foreign keys
    for (const nodeDef of treeDef.nodes) {
      if (nodeDef.prerequisiteNodeId) {
        const prereqDbId = dbNodeIdByEngineSlug.get(nodeDef.prerequisiteNodeId);
        if (prereqDbId) {
          await db.talentNode.update({
            where: { slug: nodeDef.id },
            data: { prerequisiteNodeId: prereqDbId },
          });
        }
      }
    }
  }
  const totalTalentNodes = DEFAULT_TALENT_TREES.reduce((sum, t) => sum + t.nodes.length, 0);
  console.log(`✅ Seeded ${DEFAULT_TALENT_TREES.length} talent trees and ${totalTalentNodes} talent nodes across 7 stats.`);

  // --------------------------------------------------------------------------
  // 3. Starter Items (Materials, Consumables, & 32 Base Equippable Items)
  // --------------------------------------------------------------------------
  const craftingMaterialItems = CRAFTING_MATERIAL_CATALOG.map((mat) => ({
    slug: mat.slug,
    name: mat.name,
    description: mat.description,
    itemType: 'CRAFTING_MATERIAL' as const,
    weaponHandedness: null,
    rarity: mat.rarity as any,
    requiredStrength: 0,
    requiredEndurance: 0,
    requiredAgility: 0,
    stackable: true,
    maxStack: 999,
    goldValue: mat.goldValue,
    statBonuses: {},
  }));

  const starterConsumableItems = [
    {
      slug: 'vitality_elixir',
      name: 'Elixir of Peak Output',
      description: 'Alchemical draught brewed from Sunleaf herbs.',
      itemType: 'CONSUMABLE' as const,
      weaponHandedness: null,
      rarity: 'RARE' as const,
      requiredStrength: 0,
      requiredEndurance: 0,
      requiredAgility: 0,
      stackable: true,
      maxStack: 99,
      goldValue: 85,
      statBonuses: { maxStamina: 25 },
    },
  ];

  const equippableItems = BASE_EQUIPPABLE_ITEMS.map((base) => ({
    slug: base.baseSlug,
    name: base.baseName,
    description: base.description,
    itemType: base.itemType as any,
    weaponHandedness: (base.handedness as any) ?? null,
    rarity: 'COMMON' as const,
    requiredStrength: base.statRequirements?.STR ?? 0,
    requiredEndurance: base.statRequirements?.END ?? 0,
    requiredAgility: base.statRequirements?.AGI ?? 0,
    stackable: false,
    maxStack: 1,
    goldValue: base.baseGoldValue,
    statBonuses: {
      meleePower: base.baseStats.meleePower,
      armorRating: base.baseStats.armor,
      maxHp: base.baseStats.maxHp,
      maxStamina: base.baseStats.maxStamina,
      attackSpeedPct: base.baseStats.attackSpeedPct,
      dodgeRating: base.baseStats.dodgeChancePct,
      critChance: base.baseStats.critChancePct,
      damageMitigationPct: base.baseStats.damageMitigationPct,
      lifeOnHit: base.baseStats.lifeOnHit,
      armorPenetrationPct: base.baseStats.armorPenetrationPct,
      skillPotencyPct: base.baseStats.skillPotencyPct,
      startOfCombatShieldHp: base.baseStats.startOfCombatShieldHp,
      hazardResistancePct: base.baseStats.hazardResistancePct,
    },
  }));

  const combatConsumableItems = COMBAT_CONSUMABLE_CATALOG.filter(
    (c) => c.itemSlug !== 'vitality_elixir'
  ).map((c) => ({
    slug: c.itemSlug,
    name: c.name,
    description: c.description,
    itemType: 'CONSUMABLE' as const,
    weaponHandedness: null,
    rarity: c.rarity as any,
    requiredStrength: 0,
    requiredEndurance: 0,
    requiredAgility: 0,
    stackable: true,
    maxStack: 99,
    goldValue: c.goldValue,
    statBonuses: {
      ...(c.healMaxHpPct !== undefined ? { healMaxHpPct: c.healMaxHpPct } : {}),
      ...(c.restoreStamina !== undefined ? { restoreStamina: c.restoreStamina } : {}),
      ...(c.restoreMana !== undefined ? { restoreMana: c.restoreMana } : {}),
      ...(c.attackBuffPct !== undefined ? { attackBuffPct: c.attackBuffPct } : {}),
      ...(c.buffDurationTurns !== undefined ? { buffDurationTurns: c.buffDurationTurns } : {}),
    },
  }));

  const allItems = [
    ...craftingMaterialItems,
    ...starterConsumableItems,
    ...combatConsumableItems,
    ...equippableItems,
  ];

  for (const item of allItems) {
    await db.item.upsert({
      where: { slug: item.slug },
      update: item,
      create: item,
    });
  }
  console.log(
    `✅ Seeded ${allItems.length} items (${equippableItems.length} equippable weapons/armor/accessories + ${craftingMaterialItems.length + starterConsumableItems.length + combatConsumableItems.length} materials/consumables).`
  );

  // --------------------------------------------------------------------------
  // 4. Starter 2-Hour Idle Gathering & Crafting Nodes
  // --------------------------------------------------------------------------
  const gatheringNodes = [
    {
      slug: 'iron_crag_mining',
      name: 'Mine Iron Crag Vein',
      professionType: 'MINING' as const,
      description: '2-hour idle excavation yielding Rich Iron Ore Clusters.',
      durationSeconds: 7200,
      requiredStatType: 'STRENGTH' as const,
      requiredStatLevel: 1,
      inputMaterials: [],
      lootTable: [
        {
          itemSlug: 'iron_ore_cluster',
          itemName: 'Rich Iron Ore Cluster',
          rarity: 'COMMON',
          quantity: 4,
          weight: 80,
        },
        {
          itemSlug: 'obsidian_ingot',
          itemName: 'Obsidian Steel Ingot',
          rarity: 'UNCOMMON',
          quantity: 1,
          weight: 20,
        },
      ],
    },
    {
      slug: 'whisperwood_foraging',
      name: 'Forage Whisperwood Glade',
      professionType: 'FORAGING' as const,
      description: '2-hour botanical expedition gathering Sunleaf Herbs.',
      durationSeconds: 7200,
      requiredStatType: 'ENDURANCE' as const,
      requiredStatLevel: 1,
      inputMaterials: [],
      lootTable: [
        {
          itemSlug: 'sunleaf_herb_bundle',
          itemName: 'Sunleaf Herb Bundle',
          rarity: 'COMMON',
          quantity: 4,
          weight: 85,
        },
        {
          itemSlug: 'vitality_elixir',
          itemName: 'Elixir of Peak Output',
          rarity: 'RARE',
          quantity: 1,
          weight: 15,
        },
      ],
    },
    {
      slug: 'guild_foundry_smelting',
      name: 'Smelt Obsidian Steel Ingots',
      professionType: 'SMELTING' as const,
      description: '2-hour forge task refining raw Iron Ore into Obsidian Steel.',
      durationSeconds: 7200,
      requiredStatType: 'STRENGTH' as const,
      requiredStatLevel: 2,
      inputMaterials: [{ itemSlug: 'iron_ore_cluster', quantity: 2 }],
      lootTable: [
        {
          itemSlug: 'obsidian_ingot',
          itemName: 'Obsidian Steel Ingot',
          rarity: 'UNCOMMON',
          quantity: 2,
          weight: 100,
        },
      ],
    },
    {
      slug: 'sanctum_alchemy_brewing',
      name: 'Brew Elixirs of Peak Output',
      professionType: 'ALCHEMY' as const,
      description: '2-hour alchemical distillation using Sunleaf Herb Bundles.',
      durationSeconds: 7200,
      requiredStatType: 'AGILITY' as const,
      requiredStatLevel: 2,
      inputMaterials: [{ itemSlug: 'sunleaf_herb_bundle', quantity: 2 }],
      lootTable: [
        {
          itemSlug: 'vitality_elixir',
          itemName: 'Elixir of Peak Output',
          rarity: 'RARE',
          quantity: 2,
          weight: 100,
        },
      ],
    },
    {
      slug: 'astral_glade_foraging',
      name: 'Forage Astral Glade',
      professionType: 'FORAGING' as const,
      description: '2-hour botanical expedition harvesting Astral Dew Vials and Sunleaf Herbs.',
      durationSeconds: 7200,
      requiredStatType: 'ENDURANCE' as const,
      requiredStatLevel: 2,
      inputMaterials: [],
      lootTable: [
        {
          itemSlug: 'astral_dew_vial',
          itemName: 'Astral Dew Vial',
          rarity: 'UNCOMMON',
          quantity: 2,
          weight: 65,
        },
        {
          itemSlug: 'sunleaf_herb_bundle',
          itemName: 'Sunleaf Herb Bundle',
          rarity: 'COMMON',
          quantity: 3,
          weight: 35,
        },
      ],
    },
    {
      slug: 'titanite_deep_mining',
      name: 'Mine Titanite Deep Vein',
      professionType: 'MINING' as const,
      description: '2-hour deep excavation extracting Titanite Forge Embers and Rich Iron Ore.',
      durationSeconds: 7200,
      requiredStatType: 'STRENGTH' as const,
      requiredStatLevel: 2,
      inputMaterials: [],
      lootTable: [
        {
          itemSlug: 'titanite_ember',
          itemName: 'Titanite Forge Ember',
          rarity: 'RARE',
          quantity: 1,
          weight: 50,
        },
        {
          itemSlug: 'iron_ore_cluster',
          itemName: 'Rich Iron Ore Cluster',
          rarity: 'COMMON',
          quantity: 4,
          weight: 50,
        },
      ],
    },
  ];

  for (const gn of gatheringNodes) {
    await db.gatheringNode.upsert({
      where: { slug: gn.slug },
      update: gn,
      create: gn,
    });
  }

  // --------------------------------------------------------------------------
  // 5. 24-Hour Dungeon Expeditions (5 Rank-Gated Dungeons)
  // --------------------------------------------------------------------------
  for (const dungeon of DEFAULT_DUNGEON_CATALOG) {
    const finalRoom = dungeon.rooms[dungeon.rooms.length - 1];
    const dungeonLoot = finalRoom?.lootTable ?? [];

    await db.dungeon.upsert({
      where: { slug: dungeon.dungeonSlug },
      update: {
        name: dungeon.dungeonName,
        description:
          dungeon.description ??
          `24-hour expedition with ${dungeon.rooms.length} rooms for 1-5 adventurers.`,
        minPlayers: 1,
        maxPlayers: 5,
        recommendedPower: dungeon.recommendedPower ?? 100,
        requiredAdventurerRank: (dungeon.requiredRank ?? 'COPPER') as any,
        durationHours: 24,
        roomsConfig: dungeon.rooms as any,
        lootTable: dungeonLoot as any,
      },
      create: {
        slug: dungeon.dungeonSlug,
        name: dungeon.dungeonName,
        description:
          dungeon.description ??
          `24-hour expedition with ${dungeon.rooms.length} rooms for 1-5 adventurers.`,
        minPlayers: 1,
        maxPlayers: 5,
        recommendedPower: dungeon.recommendedPower ?? 100,
        requiredAdventurerRank: (dungeon.requiredRank ?? 'COPPER') as any,
        durationHours: 24,
        roomsConfig: dungeon.rooms as any,
        lootTable: dungeonLoot as any,
      },
    });
  }

  // --------------------------------------------------------------------------
  // 6. Adventurer Guild Bounties & Rank-Up Trials
  // --------------------------------------------------------------------------
  const bounties = [
    {
      slug: 'trial_of_iron',
      title: 'Rank-Up Trial: Copper -> Iron',
      description: 'Log 3 real-world workouts and clear Obsidian Catacombs to earn your Iron Guild Crest.',
      isRankUpTrial: true,
      requiredRank: 'COPPER' as const,
      unlocksRank: 'IRON' as const,
      requirements: { workoutsLogged: 3, dungeonClears: 1 },
      reputationReward: 250,
      goldReward: 350,
    },
    {
      slug: 'trial_of_bronze',
      title: 'Rank-Up Trial: Iron -> Bronze',
      description: 'Reach total Stat Level 10 and complete 2 Dungeon Expeditions.',
      isRankUpTrial: true,
      requiredRank: 'IRON' as const,
      unlocksRank: 'BRONZE' as const,
      requirements: { totalStatLevel: 10, dungeonClears: 2 },
      reputationReward: 500,
      goldReward: 700,
    },
    {
      slug: 'weekly_zone2_patrol',
      title: 'Guild Bounty: Outrider Perimeter Patrol',
      description: 'Log at least 45 minutes of HR Zone 2 Endurance training.',
      isRankUpTrial: false,
      requiredRank: 'COPPER' as const,
      unlocksRank: null,
      requirements: { zone2Minutes: 45 },
      reputationReward: 120,
      goldReward: 200,
    },
  ];

  for (const b of bounties) {
    await db.guildBounty.upsert({
      where: { slug: b.slug },
      update: b,
      create: b,
    });
  }

  // --------------------------------------------------------------------------
  // 7. Default Open-World Home Gym Clan, Current Season, & World Boss Raid
  // --------------------------------------------------------------------------
  const now = new Date();
  const seasonKey = now.toISOString().slice(0, 7);
  const seasonStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const seasonEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

  const homeClan = await db.gymClan.upsert({
    where: { slug: 'open_world_home' },
    update: {
      name: 'Hearthstone Open-World Sanctum',
      tag: 'HOME',
      kind: 'OPEN_WORLD_HOME',
      venueSource: 'SYSTEM_SEED',
      maxMembers: 1_000_000,
      description:
        'The global sanctuary clan uniting all home, outdoor, and traveling athletes for weekly World Boss Raids.',
    },
    create: {
      slug: 'open_world_home',
      venueKey: 'system:open_world_home',
      name: 'Hearthstone Open-World Sanctum',
      tag: 'HOME',
      kind: 'OPEN_WORLD_HOME',
      venueSource: 'SYSTEM_SEED',
      maxMembers: 1_000_000,
      description:
        'The global sanctuary clan uniting all home, outdoor, and traveling athletes for weekly World Boss Raids.',
    },
  });

  await db.gymClanSeason.upsert({
    where: {
      gymClanId_seasonKey: {
        gymClanId: homeClan.id,
        seasonKey,
      },
    },
    update: {
      startsAt: seasonStart,
      endsAt: seasonEnd,
    },
    create: {
      gymClanId: homeClan.id,
      seasonKey,
      startsAt: seasonStart,
      endsAt: seasonEnd,
    },
  });

  const activeCharacters = await db.character.findMany({
    where: { deletedAt: null },
    select: { id: true, userId: true },
  });

  for (const c of activeCharacters) {
    await db.gymClanMember.upsert({
      where: {
        characterId_clanKind: {
          characterId: c.id,
          clanKind: 'OPEN_WORLD_HOME',
        },
      },
      update: {
        gymClanId: homeClan.id,
        userId: c.userId,
      },
      create: {
        gymClanId: homeClan.id,
        userId: c.userId,
        characterId: c.id,
        clanKind: 'OPEN_WORLD_HOME',
        role: 'MEMBER',
      },
    });
  }

  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const existingPublicRaid = await db.raidBossInstance.findFirst({
    where: { bossSlug: 'ignisrax_world_wyrm', status: 'ACTIVE' },
  });

  if (!existingPublicRaid) {
    await db.raidBossInstance.create({
      data: {
        bossSlug: 'ignisrax_world_wyrm',
        bossName: 'Ignisrax, the World-Forge Wyrm',
        bossTier: 3,
        accessType: 'PUBLIC_WORLD',
        gymClanId: homeClan.id,
        maxHp: 2_500_000n,
        currentHp: 2_500_000n,
        totalRaidDamage: 0n,
        startsAt: now,
        endsAt: sevenDaysLater,
        status: 'ACTIVE',
        bossMechanicsConfig: { element: 'FIRE', baseGoldPool: 15000, baseGuildRepPool: 2500 },
        lootPoolConfig: [
          {
            itemSlug: 'warden_chainmail',
            itemName: "Warden's Tempered Hauberk",
            rarity: 'RARE',
            quantity: 1,
            weight: 65,
          },
          {
            itemSlug: 'crown_of_the_wyrm',
            itemName: 'Crown of the World Wyrm',
            rarity: 'MYTHIC',
            quantity: 1,
            weight: 15,
            requiresBossDefeat: true,
            minTier: 'S',
          },
        ],
      },
    });
  } else if (!existingPublicRaid.gymClanId) {
    await db.raidBossInstance.update({
      where: { id: existingPublicRaid.id },
      data: { gymClanId: homeClan.id },
    });
  }

  // --------------------------------------------------------------------------
  // 8. Turn-Based Guild Quests & Rank-Up Trials
  // --------------------------------------------------------------------------
  for (const q of DEFAULT_GUILD_QUEST_CATALOG) {
    const data = {
      title: q.title,
      description: q.description,
      category: q.category as any,
      requiredAdventurerRank: q.requiredRank as any,
      unlocksRank: (q.unlocksRank ?? null) as any,
      recommendedPower: q.recommendedPower,
      wavesConfig: q.waves as any,
      trialRequirements: q.trialRequirements ? (q.trialRequirements as any) : Prisma.DbNull,
      goldReward: q.goldReward,
      reputationReward: q.reputationReward,
      lootTable: q.lootTable as any,
    };

    await db.guildQuest.upsert({
      where: { slug: q.questSlug },
      update: data,
      create: {
        slug: q.questSlug,
        ...data,
      },
    });
  }

  console.log(
    '✅ Seed complete! Starter exercises, presets, 10 talent trees, items, gathering nodes, dungeons, bounties, guild quests, and world raid ready.'
  );
}

if (require.main === module) {
  runSeed()
    .catch((err) => {
      console.error('❌ Seed failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
