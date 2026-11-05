import { describe, expect, it } from 'vitest';
import {
  CombatantCharacterInput,
  DEFAULT_DUNGEON_CATALOG,
  DungeonDefinition,
  createLiveDungeonWorkoutBuff,
  isAdventurerRankSufficient,
  simulateDungeonRun,
} from '../src/auto-battler-sim';

const SAMPLE_DUNGEON: DungeonDefinition = {
  dungeonSlug: 'obsidian_catacombs',
  dungeonName: 'Obsidian Catacombs',
  maxSimulationSeconds: 300,
  rooms: [
    {
      roomNumber: 1,
      roomName: 'Crypt Gatehouse',
      roomType: 'MOB_ENCOUNTER',
      guaranteedGold: 40,
      enemies: [
        {
          enemyId: 'skeleton_guard',
          name: 'Skeletal Vanguard',
          maxHp: 220,
          attackPower: 24,
          armor: 15,
          attackIntervalSeconds: 1.8,
        },
        {
          enemyId: 'crypt_archer',
          name: 'Crypt Archer',
          maxHp: 160,
          attackPower: 28,
          armor: 8,
          attackIntervalSeconds: 1.5,
        },
      ],
    },
    {
      roomNumber: 2,
      roomName: 'Hall of Pendulum Blades',
      roomType: 'HAZARD_EVENT',
      guaranteedGold: 25,
      hazardConfig: {
        hazardName: 'Swinging Obsidian Blades',
        baseDamage: 65,
        staminaDrain: 20,
      },
    },
    {
      roomNumber: 3,
      roomName: 'Sanctum of the Bone Lord',
      roomType: 'BOSS',
      guaranteedGold: 150,
      lootRolls: 2,
      enemies: [
        {
          enemyId: 'bone_lord_malakor',
          name: 'Bone Lord Malakor',
          isBoss: true,
          maxHp: 850,
          attackPower: 52,
          armor: 30,
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
          weight: 40,
        },
        {
          itemSlug: 'ancient_bone_dust',
          itemName: 'Ancient Bone Dust',
          rarity: 'RARE',
          quantity: 3,
          weight: 60,
        },
      ],
    },
    {
      roomNumber: 4,
      roomName: 'Sunken Reliquary',
      roomType: 'LOOT_CHEST',
      guaranteedGold: 75,
      lootRolls: 1,
      lootTable: [
        {
          itemSlug: 'obsidian_ingot',
          itemName: 'Obsidian Ingot',
          rarity: 'UNCOMMON',
          quantity: 2,
          weight: 70,
        },
        {
          itemSlug: 'catacomb_blade',
          itemName: 'Catacomb Greatsword',
          rarity: 'RARE',
          quantity: 1,
          weight: 30,
        },
      ],
    },
  ],
};

const SAMPLE_PARTY: CombatantCharacterInput[] = [
  {
    characterId: 'hero_tank',
    name: 'Valeria',
    coreStats: { strengthLevel: 12, enduranceLevel: 10, agilityLevel: 5 },
    equipmentBonuses: { armorRating: 35, maxHp: 120, meleePower: 18 },
    unlockedTalentRanks: {
      jug_iron_skin: 3,
      jug_shield_slam: 1,
      jug_bulwark_stance: 2,
      jug_unstoppable: 1,
    },
  },
  {
    characterId: 'hero_warden',
    name: 'kael',
    coreStats: { strengthLevel: 5, enduranceLevel: 14, agilityLevel: 8 },
    equipmentBonuses: { maxHp: 90, maxStamina: 50, meleePower: 14 },
    unlockedTalentRanks: {
      war_deep_lungs: 3,
      war_renewal_aura: 2,
      war_second_wind_hymn: 1,
      out_trailblazer: 2,
    },
  },
  {
    characterId: 'hero_assassin',
    name: 'Nyx',
    coreStats: { strengthLevel: 8, enduranceLevel: 6, agilityLevel: 15 },
    equipmentBonuses: { meleePower: 38, critChance: 0.10, attackSpeedPct: 0.15 },
    unlockedTalentRanks: {
      ass_shadowstep_reflexes: 3,
      ass_ambush_lethality: 2,
      ass_phantom_strike: 1,
      ber_serrated_strikes: 1,
    },
  },
];

describe('auto-battler-sim', () => {
  it('enforces party size between 1 and 5 characters', () => {
    expect(() =>
      simulateDungeonRun({
        dungeon: SAMPLE_DUNGEON,
        party: [],
        seed: 'empty-party',
      })
    ).toThrow(/between 1 and 5/);

    const sixPlayers = Array.from({ length: 6 }, (_, i) => ({
      ...SAMPLE_PARTY[0]!,
      characterId: `p_${i}`,
    }));
    expect(() =>
      simulateDungeonRun({
        dungeon: SAMPLE_DUNGEON,
        party: sixPlayers,
        seed: 'six-party',
      })
    ).toThrow(/between 1 and 5/);
  });

  it('produces 100% deterministic tick-by-tick JSON event logs for identical inputs and seed', () => {
    const buffs = [
      ...createLiveDungeonWorkoutBuff({
        workoutId: 'wk_leg_day',
        characterId: 'hero_tank',
        workoutType: 'RESISTANCE',
        triggeredPrCrit: true,
      }),
      ...createLiveDungeonWorkoutBuff({
        workoutId: 'wk_hiit_run',
        characterId: 'hero_assassin',
        workoutType: 'CARDIO_HIGH_INTENSITY',
        averageHrZone: 4,
      }),
    ];

    const runA = simulateDungeonRun({
      dungeon: SAMPLE_DUNGEON,
      party: SAMPLE_PARTY,
      workoutBuffs: buffs,
      seed: 'deterministic-seed-42',
    });

    const runB = simulateDungeonRun({
      dungeon: SAMPLE_DUNGEON,
      party: SAMPLE_PARTY,
      workoutBuffs: buffs,
      seed: 'deterministic-seed-42',
    });

    expect(runA).toEqual(runB);
    expect(runA.outcome).toBe('VICTORY');
    expect(runA.roomsCleared).toBe(4);
    expect(runA.lootDrops.length).toBeGreaterThan(0);

    // Verify chronological monotonic timestamps from t=0s to t=end
    for (let i = 1; i < runA.events.length; i++) {
      expect(runA.events[i]!.tMs).toBeGreaterThanOrEqual(runA.events[i - 1]!.tMs);
    }
    expect(runA.events[0]!.type).toBe('EXPEDITION_START');
    expect(runA.events[runA.events.length - 1]!.type).toBe('EXPEDITION_END');

    // Verify Titanic Force Boss Shield triggered specifically on Room 3 (BOSS)
    const bossShieldEvents = runA.events.filter(
      (e) =>
        e.roomNumber === 3 &&
        e.type === 'SHIELD_APPLIED' &&
        e.message.includes('Titanic Force')
    );
    expect(bossShieldEvents.length).toBe(SAMPLE_PARTY.length);
  });

  it('allows Live 24-Hour Workout Injection Buffs to turn a borderline solo wipe into a stronger boss push', () => {
    const soloHero: CombatantCharacterInput = {
      characterId: 'solo_fighter',
      name: 'Solo Striker',
      coreStats: { strengthLevel: 8, enduranceLevel: 7, agilityLevel: 7 },
      equipmentBonuses: { meleePower: 20, armorRating: 15 },
    };

    const unbuffed = simulateDungeonRun({
      dungeon: SAMPLE_DUNGEON,
      party: [soloHero],
      workoutBuffs: [],
      seed: 'solo-test-seed',
    });

    const liveBuffs = [
      ...createLiveDungeonWorkoutBuff({
        workoutId: 'w1',
        characterId: 'solo_fighter',
        workoutType: 'RESISTANCE',
        triggeredPrCrit: true,
      }),
      ...createLiveDungeonWorkoutBuff({
        workoutId: 'w2',
        characterId: 'solo_fighter',
        workoutType: 'CARDIO_HIGH_INTENSITY',
        averageHrZone: 5,
      }),
      ...createLiveDungeonWorkoutBuff({
        workoutId: 'w3',
        characterId: 'solo_fighter',
        workoutType: 'ACTIVE_RECOVERY',
      }),
    ];

    const buffed = simulateDungeonRun({
      dungeon: SAMPLE_DUNGEON,
      party: [soloHero],
      workoutBuffs: liveBuffs,
      seed: 'solo-test-seed',
    });

    expect(buffed.partySummaries[0]!.totalDamageDealt).toBeGreaterThan(
      unbuffed.partySummaries[0]!.totalDamageDealt
    );
  });

  describe('DEFAULT_DUNGEON_CATALOG & Adventurer Rank Gating', () => {
    it('contains all 5 rank-gated dungeons with room counts [4, 6, 8, 10, 12]', () => {
      expect(DEFAULT_DUNGEON_CATALOG).toHaveLength(5);
      const slugs = DEFAULT_DUNGEON_CATALOG.map((d) => d.dungeonSlug);
      expect(slugs).toEqual([
        'obsidian_catacombs',
        'bloodfang_warcamp',
        'traitors_garrison',
        'blighted_ossuary',
        'hellforge_sanctum',
      ]);

      const roomCounts = DEFAULT_DUNGEON_CATALOG.map((d) => d.rooms.length);
      expect(roomCounts).toEqual([4, 6, 8, 10, 12]);

      const ranks = DEFAULT_DUNGEON_CATALOG.map((d) => d.requiredRank);
      expect(ranks).toEqual(['COPPER', 'IRON', 'BRONZE', 'SILVER', 'GOLD']);

      for (const d of DEFAULT_DUNGEON_CATALOG) {
        expect(d.recommendedPower).toBeGreaterThan(0);
        expect(d.rewardMultiplierLabel).toBeDefined();
        expect(d.themeLabel).toBeDefined();
        expect(d.rooms[d.rooms.length - 2]!.roomType).toBe('BOSS');
        expect(d.rooms[d.rooms.length - 1]!.roomType).toBe('LOOT_CHEST');
      }
    });

    it('correctly checks adventurer rank sufficiency', () => {
      expect(isAdventurerRankSufficient('COPPER', 'COPPER')).toBe(true);
      expect(isAdventurerRankSufficient('COPPER', 'IRON')).toBe(false);
      expect(isAdventurerRankSufficient('BRONZE', 'IRON')).toBe(true);
      expect(isAdventurerRankSufficient('GOLD', 'COPPER')).toBe(true);
      expect(isAdventurerRankSufficient('SILVER', 'GOLD')).toBe(false);
      expect(isAdventurerRankSufficient('MYTHIC', 'GOLD')).toBe(true);
    });

    it('executes a deterministic 12-room run of hellforge_sanctum', () => {
      const hellforge = DEFAULT_DUNGEON_CATALOG.find((d) => d.dungeonSlug === 'hellforge_sanctum')!;
      expect(hellforge.rooms.length).toBe(12);

      const highTierParty: CombatantCharacterInput[] = [
        {
          characterId: 'warrior_1',
          name: 'Oni Warlord',
          coreStats: { strengthLevel: 40, enduranceLevel: 35, agilityLevel: 30 },
          equipmentBonuses: { meleePower: 120, armorRating: 80, maxHp: 500 },
        },
        {
          characterId: 'paladin_2',
          name: 'Oath Sentinel',
          coreStats: { strengthLevel: 30, enduranceLevel: 45, agilityLevel: 25 },
          equipmentBonuses: { meleePower: 90, armorRating: 110, maxHp: 650 },
        },
        {
          characterId: 'assassin_3',
          name: 'Duskblade Shinobi',
          coreStats: { strengthLevel: 25, enduranceLevel: 25, agilityLevel: 50 },
          equipmentBonuses: { meleePower: 130, critChance: 0.25, attackSpeedPct: 0.3 },
        },
      ];

      const simA = simulateDungeonRun({
        dungeon: hellforge,
        party: highTierParty,
        seed: 'hellforge-deterministic-seed-42',
        tickIntervalMs: 250,
      });

      const simB = simulateDungeonRun({
        dungeon: hellforge,
        party: highTierParty,
        seed: 'hellforge-deterministic-seed-42',
        tickIntervalMs: 250,
      });

      expect(simA).toEqual(simB);
      expect(simA.totalRooms).toBe(12);
      expect(simA.events.length).toBeGreaterThan(12);
      expect(simA.events[0]!.type).toBe('EXPEDITION_START');
      expect(simA.events[simA.events.length - 1]!.type).toBe('EXPEDITION_END');
    });
  });
});
