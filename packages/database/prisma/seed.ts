import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_EXERCISE_CATALOG,
  DEFAULT_TALENT_TREES,
  STARTER_WORKOUT_PRESETS,
} from '@gymify/game-engine';

const prisma = new PrismaClient();

export async function runSeed(db: PrismaClient = prisma): Promise<void> {
  console.log('🌱 Seeding Gymify RPG database...');

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
  // 2. Multi-Class Stat-Bound Talent Trees & Starter Nodes (STR, END, AGI, DEX, CON, WIS, SPR)
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

  // --------------------------------------------------------------------------
  // 3. Starter Items (Materials, Consumables, & Stat-Gated Gear)
  // --------------------------------------------------------------------------
  const items = [
    {
      slug: 'iron_ore_cluster',
      name: 'Rich Iron Ore Cluster',
      description: 'Raw iron ore mined from mountain veins.',
      itemType: 'CRAFTING_MATERIAL' as const,
      rarity: 'COMMON' as const,
      stackable: true,
      goldValue: 12,
      statBonuses: {},
    },
    {
      slug: 'sunleaf_herb_bundle',
      name: 'Sunleaf Herb Bundle',
      description: 'Restorative wild herbs used in stamina elixirs.',
      itemType: 'CRAFTING_MATERIAL' as const,
      rarity: 'COMMON' as const,
      stackable: true,
      goldValue: 12,
      statBonuses: {},
    },
    {
      slug: 'obsidian_ingot',
      name: 'Obsidian Steel Ingot',
      description: 'Smelted alloy prized by guild blacksmiths.',
      itemType: 'CRAFTING_MATERIAL' as const,
      rarity: 'UNCOMMON' as const,
      stackable: true,
      goldValue: 45,
      statBonuses: {},
    },
    {
      slug: 'vitality_elixir',
      name: 'Elixir of Peak Output',
      description: 'Alchemical draught brewed from Sunleaf herbs.',
      itemType: 'CONSUMABLE' as const,
      rarity: 'RARE' as const,
      stackable: true,
      goldValue: 85,
      statBonuses: { maxStamina: 25 },
    },
    {
      slug: 'raid_essence_crystal',
      name: 'Raid Boss Essence Crystal',
      description: 'Crystallized power harvested from weekly Raid Bosses.',
      itemType: 'CRAFTING_MATERIAL' as const,
      rarity: 'RARE' as const,
      stackable: true,
      goldValue: 120,
      statBonuses: {},
    },
    {
      slug: 'ironbound_greatsword',
      name: 'Ironbound Greatsword',
      description: 'Heavy two-handed blade forged for strength builds.',
      itemType: 'WEAPON' as const,
      weaponHandedness: 'TWO_HANDED' as const,
      rarity: 'UNCOMMON' as const,
      requiredStrength: 3,
      requiredEndurance: 0,
      requiredAgility: 0,
      stackable: false,
      maxStack: 1,
      goldValue: 180,
      statBonuses: { meleePower: 22, critChance: 0.03 },
    },
    {
      slug: 'warden_chainmail',
      name: "Warden's Tempered Hauberk",
      description: 'Endurance-fitted armor built for long dungeon expeditions.',
      itemType: 'CHEST' as const,
      rarity: 'RARE' as const,
      requiredStrength: 2,
      requiredEndurance: 3,
      requiredAgility: 0,
      stackable: false,
      maxStack: 1,
      goldValue: 260,
      statBonuses: { armorRating: 24, maxHp: 90, maxStamina: 30 },
    },
    {
      slug: 'windrunner_daggers',
      name: 'Twin Windrunner Blades',
      description: 'Featherweight blades scaling with high Agility.',
      itemType: 'WEAPON' as const,
      weaponHandedness: 'ONE_HANDED' as const,
      rarity: 'RARE' as const,
      requiredStrength: 0,
      requiredEndurance: 0,
      requiredAgility: 4,
      stackable: false,
      maxStack: 1,
      goldValue: 275,
      statBonuses: { meleePower: 17, attackSpeedPct: 0.14, dodgeRating: 0.05, critChance: 0.06 },
    },
    {
      slug: 'malakor_signet',
      name: "Malakor's Signet Ring",
      description: 'Trophy ring dropped by Bone Lord Malakor.',
      itemType: 'ACCESSORY' as const,
      rarity: 'EPIC' as const,
      requiredStrength: 2,
      requiredEndurance: 2,
      requiredAgility: 2,
      stackable: false,
      maxStack: 1,
      goldValue: 500,
      statBonuses: { meleePower: 14, maxHp: 65, critChance: 0.05 },
    },
    {
      slug: 'crown_of_the_wyrm',
      name: 'Crown of the World Wyrm',
      description: 'Mythic helm awarded exclusively to slayers of Ignisrax.',
      itemType: 'HEAD' as const,
      rarity: 'MYTHIC' as const,
      requiredStrength: 5,
      requiredEndurance: 5,
      requiredAgility: 5,
      stackable: false,
      maxStack: 1,
      goldValue: 2500,
      statBonuses: { meleePower: 35, armorRating: 35, maxHp: 180, critChance: 0.08 },
    },
  ];

  for (const item of items) {
    await db.item.upsert({
      where: { slug: item.slug },
      update: item,
      create: item,
    });
  }

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
  ];

  for (const gn of gatheringNodes) {
    await db.gatheringNode.upsert({
      where: { slug: gn.slug },
      update: gn,
      create: gn,
    });
  }

  // --------------------------------------------------------------------------
  // 5. Starter 24-Hour Dungeon Expeditions
  // --------------------------------------------------------------------------
  const obsidianCatacombsRooms = [
    {
      roomNumber: 1,
      roomName: 'Crypt Gatehouse',
      roomType: 'MOB_ENCOUNTER',
      guaranteedGold: 45,
      enemies: [
        {
          enemyId: 'skeleton_vanguard',
          name: 'Skeletal Vanguard',
          maxHp: 210,
          attackPower: 22,
          armor: 12,
          attackIntervalSeconds: 1.8,
        },
        {
          enemyId: 'crypt_archer',
          name: 'Crypt Bone-Archer',
          maxHp: 150,
          attackPower: 26,
          armor: 6,
          attackIntervalSeconds: 1.5,
        },
      ],
    },
    {
      roomNumber: 2,
      roomName: 'Corridor of Scything Pendulums',
      roomType: 'HAZARD_EVENT',
      guaranteedGold: 30,
      hazardConfig: {
        hazardName: 'Swinging Obsidian Blades',
        baseDamage: 55,
        staminaDrain: 18,
      },
    },
    {
      roomNumber: 3,
      roomName: 'Forgotten Reliquary',
      roomType: 'LOOT_CHEST',
      guaranteedGold: 80,
      lootRolls: 1,
      lootTable: [
        {
          itemSlug: 'obsidian_ingot',
          itemName: 'Obsidian Steel Ingot',
          rarity: 'UNCOMMON',
          quantity: 2,
          weight: 70,
        },
        {
          itemSlug: 'vitality_elixir',
          itemName: 'Elixir of Peak Output',
          rarity: 'RARE',
          quantity: 1,
          weight: 30,
        },
      ],
    },
    {
      roomNumber: 4,
      roomName: 'Throne of Bone Lord Malakor',
      roomType: 'BOSS',
      guaranteedGold: 160,
      lootRolls: 2,
      enemies: [
        {
          enemyId: 'bone_lord_malakor',
          name: 'Bone Lord Malakor',
          isBoss: true,
          maxHp: 680,
          attackPower: 42,
          armor: 24,
          attackIntervalSeconds: 1.6,
          cleaveTargets: 2,
        },
      ],
      lootTable: [
        {
          itemSlug: 'malakor_signet',
          itemName: "Malakor's Signet Ring",
          rarity: 'EPIC',
          quantity: 1,
          weight: 35,
        },
        {
          itemSlug: 'obsidian_ingot',
          itemName: 'Obsidian Steel Ingot',
          rarity: 'UNCOMMON',
          quantity: 3,
          weight: 65,
        },
      ],
    },
  ];

  await db.dungeon.upsert({
    where: { slug: 'obsidian_catacombs' },
    update: {
      name: 'Obsidian Catacombs',
      description: '24-hour undead sanctum for 1-5 adventurers. Rewards balanced mitigation and trap resistance.',
      minPlayers: 1,
      maxPlayers: 5,
      recommendedPower: 100,
      requiredAdventurerRank: 'COPPER',
      durationHours: 24,
      roomsConfig: obsidianCatacombsRooms,
      lootTable: obsidianCatacombsRooms[3]!.lootTable ?? [],
    },
    create: {
      slug: 'obsidian_catacombs',
      name: 'Obsidian Catacombs',
      description: '24-hour undead sanctum for 1-5 adventurers. Rewards balanced mitigation and trap resistance.',
      minPlayers: 1,
      maxPlayers: 5,
      recommendedPower: 100,
      requiredAdventurerRank: 'COPPER',
      durationHours: 24,
      roomsConfig: obsidianCatacombsRooms,
      lootTable: obsidianCatacombsRooms[3]!.lootTable ?? [],
    },
  });

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
  // 7. Demo User, Character, Guild, & Active 7-Day Boss Raids
  // --------------------------------------------------------------------------
  const demoUser = await db.user.upsert({
    where: { email: 'hero@gymify.rpg' },
    update: {
      passwordHash: '$2b$10$yhYXws24AU5CU0/LA2I5peE5cxniSnZvnOtHVL.9IROpu.j96M/oq',
    },
    create: {
      email: 'hero@gymify.rpg',
      username: 'iron_adventurer',
      passwordHash: '$2b$10$yhYXws24AU5CU0/LA2I5peE5cxniSnZvnOtHVL.9IROpu.j96M/oq',
      timezone: 'America/Los_Angeles',
    },
  });

  const existingGymCount = await db.registeredGymGuild.count({
    where: { userId: demoUser.id },
  });
  if (existingGymCount === 0) {
    await db.registeredGymGuild.createMany({
      data: [
        {
          userId: demoUser.id,
          name: 'Iron Sanctum Barbell Club',
          latitude: 37.7749,
          longitude: -122.4194,
          radiusMeters: 120,
        },
        {
          userId: demoUser.id,
          name: 'Titan Foundry Athletics',
          latitude: 37.7815,
          longitude: -122.4091,
          radiusMeters: 120,
        },
      ],
    });
  }

  const demoChar = await db.character.upsert({
    where: { name: 'Aric the Ironbound' },
    update: {},
    create: {
      userId: demoUser.id,
      name: 'Aric the Ironbound',
      gameMode: 'STANDARD',
      adventurerRank: 'IRON',
      adventurerReputation: 280,
      gold: 650,
      overallLevel: 6,
      currentLocation: 'TAVERN',
      activityState: 'RESTING_TAVERN',
      stats: {
        create: {
          strengthLevel: 5,
          strengthXp: 120,
          strengthTalentPointsAvailable: 3,
          strengthTalentPointsSpent: 2,
          enduranceLevel: 4,
          enduranceXp: 90,
          enduranceTalentPointsAvailable: 2,
          enduranceTalentPointsSpent: 1,
          agilityLevel: 4,
          agilityXp: 60,
          agilityTalentPointsAvailable: 2,
          agilityTalentPointsSpent: 1,
        },
      },
      fatigueState: {
        create: {
          isRestingInTavern: true,
          wellRestedMultiplier: 1.15,
          activeRecoveryBuffActive: false,
        },
      },
      equipmentLoadout: {
        create: {},
      },
    },
  });

  const guild = await db.guild.upsert({
    where: { tag: 'IRON' },
    update: {},
    create: {
      name: 'Iron Vanguard',
      tag: 'IRON',
      description: 'Founding Adventurers Guild for strength & conditioning hybrids.',
      leaderCharacterId: demoChar.id,
      guildLevel: 3,
      guildReputation: 1450,
    },
  });

  await db.guildMember.upsert({
    where: { characterId: demoChar.id },
    update: { guildId: guild.id, role: 'LEADER' },
    create: {
      guildId: guild.id,
      characterId: demoChar.id,
      role: 'LEADER',
      contributedReputation: 450,
    },
  });

  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const existingPublicRaid = await db.raidBossInstance.findFirst({
    where: { bossSlug: 'ignisrax_world_wyrm', status: 'ACTIVE' },
  });

  if (!existingPublicRaid) {
    const publicRaid = await db.raidBossInstance.create({
      data: {
        bossSlug: 'ignisrax_world_wyrm',
        bossName: 'Ignisrax, the World-Forge Wyrm',
        bossTier: 3,
        accessType: 'PUBLIC_WORLD',
        maxHp: 2_500_000n,
        currentHp: 1_820_000n,
        totalRaidDamage: 680_000n,
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

    await db.raidParticipantContribution.create({
      data: {
        raidInstanceId: publicRaid.id,
        characterId: demoChar.id,
        combatDamageDealt: 95_000n,
        workoutEnergyDamage: 65_000n,
        supportScore: 15_000n,
        totalContributionScore: 175_000n,
        dailyAttacksUsed: 2,
        workoutsChanneled: 3,
      },
    });
  }

  const existingGuildRaid = await db.raidBossInstance.findFirst({
    where: { bossSlug: 'dread_colossus_guild', guildId: guild.id, status: 'ACTIVE' },
  });

  if (!existingGuildRaid) {
    const guildRaid = await db.raidBossInstance.create({
      data: {
        bossSlug: 'dread_colossus_guild',
        bossName: 'Vaelgor, Guild Dread-Colossus',
        bossTier: 2,
        accessType: 'GUILD_ONLY',
        guildId: guild.id,
        maxHp: 800_000n,
        currentHp: 510_000n,
        totalRaidDamage: 290_000n,
        startsAt: now,
        endsAt: sevenDaysLater,
        status: 'ACTIVE',
        bossMechanicsConfig: { element: 'SHADOW', baseGoldPool: 9000, baseGuildRepPool: 3000 },
        lootPoolConfig: [
          {
            itemSlug: 'malakor_signet',
            itemName: "Malakor's Signet Ring",
            rarity: 'EPIC',
            quantity: 1,
            weight: 45,
          },
          {
            itemSlug: 'windrunner_daggers',
            itemName: 'Twin Windrunner Blades',
            rarity: 'RARE',
            quantity: 1,
            weight: 55,
          },
        ],
      },
    });

    await db.raidParticipantContribution.create({
      data: {
        raidInstanceId: guildRaid.id,
        characterId: demoChar.id,
        combatDamageDealt: 110_000n,
        workoutEnergyDamage: 80_000n,
        supportScore: 20_000n,
        totalContributionScore: 210_000n,
        dailyAttacksUsed: 2,
        workoutsChanneled: 3,
      },
    });
  }

  console.log(`✅ Seed complete! Demo character '${demoChar.name}' (${demoChar.id}) ready.`);
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
