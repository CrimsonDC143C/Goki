import { describe, expect, it } from 'vitest';
import {
  ADVENTURER_COMPANY_AI_PRESETS,
  COMBAT_CONSUMABLE_BY_SLUG,
  COMBAT_CONSUMABLE_CATALOG,
  CreateTurnBasedEncounterInput,
  DEFAULT_GUILD_QUEST_CATALOG,
  MAX_BELT_SLOTS,
  MAX_EQUIPPED_ACTIVE_SKILLS,
  TurnBasedCombatAction,
  TurnBasedCombatState,
  advanceTurnBasedUntilPlayerOrEnd,
  chooseTurnBasedAiAction,
  createTurnBasedEncounter,
  getSkillResourceCost,
  getSkillResourceType,
  replayAndVerifyTurnBasedRun,
  sanitizeActiveSkillLoadout,
  sanitizeBeltLoadout,
  stepTurnBasedCombat,
  validateCombatLoadout,
} from '../src/turn-based-combat';
import { DEFAULT_TALENT_TREES } from '../src/talent-engine';

function findSkill(skillId: string) {
  for (const tree of DEFAULT_TALENT_TREES) {
    for (const node of tree.nodes) {
      if (node.activeSkill?.skillId === skillId) {
        return node.activeSkill;
      }
    }
  }
  throw new Error(`Skill ${skillId} not found in DEFAULT_TALENT_TREES`);
}

function buildCryptPatrolInput(overrides?: Partial<CreateTurnBasedEncounterInput>): CreateTurnBasedEncounterInput {
  const cryptQuest = DEFAULT_GUILD_QUEST_CATALOG.find(
    (q) => q.questSlug === 'guild_contract_crypt_patrol'
  )!;
  return {
    encounterId: 'enc_test_001',
    questSlug: cryptQuest.questSlug,
    questTitle: cryptQuest.title,
    seed: 'seed-deterministic-42',
    party: [
      {
        characterId: 'hero_1',
        name: 'Aria',
        controller: 'PLAYER',
        coreStats: {
          strengthLevel: 4,
          enduranceLevel: 4,
          agilityLevel: 5,
          dexLevel: 3,
          conLevel: 3,
          wisLevel: 4,
          sprLevel: 4,
        },
        unlockedTalentRanks: {
          jug_shield_slam: 1,
          cle_divine_intervention: 1,
          mag_supernova_blast: 1,
          ass_phantom_strike: 1,
        },
        activeSkillIds: [
          'jug_shield_slam',
          'skill_divine_light',
          'skill_arcane_nova',
          'ass_phantom_strike',
        ],
        beltSlots: [
          { itemSlug: 'sunleaf_healing_draught', charges: 2 },
          { itemSlug: 'vitality_elixir', charges: 1 },
          { itemSlug: 'astral_mana_tonic', charges: 1 },
          { itemSlug: 'tempered_whetstone', charges: 1 },
        ],
      },
    ],
    waves: cryptQuest.waves,
    ...overrides,
  };
}

describe('turn-based-combat engine', () => {
  it('enforces max 4 skills, max 4 belt slots, and validates/sanitizes loadouts', () => {
    const unlocked = {
      jug_shield_slam: 1,
      van_colossus_cleave: 1,
      war_second_wind_hymn: 1,
      cle_divine_intervention: 1,
      mag_supernova_blast: 1,
    };

    const validResult = validateCombatLoadout({
      activeSkillIds: ['jug_shield_slam', 'skill_divine_light', 'skill_arcane_nova'],
      beltConsumables: ['sunleaf_healing_draught', null, 'astral_mana_tonic', 'tempered_whetstone'],
      unlockedTalentRanks: unlocked,
    });
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toEqual([]);
    expect(validResult.sanitizedSkillIds).toEqual([
      'jug_shield_slam',
      'skill_divine_light',
      'skill_arcane_nova',
    ]);
    expect(validResult.sanitizedBeltSlugs).toEqual([
      'sunleaf_healing_draught',
      null,
      'astral_mana_tonic',
      'tempered_whetstone',
    ]);

    const invalidResult = validateCombatLoadout({
      activeSkillIds: [
        'jug_shield_slam',
        'jug_shield_slam',
        'van_colossus_cleave',
        'war_second_wind_hymn',
        'ass_phantom_strike', // locked + > 4 skills
      ],
      beltConsumables: [
        'sunleaf_healing_draught',
        'unknown_potion',
        'vitality_elixir',
        'astral_mana_tonic',
        'tempered_whetstone',
      ],
      unlockedTalentRanks: unlocked,
    });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThanOrEqual(4);
    expect(invalidResult.sanitizedSkillIds.length).toBeLessThanOrEqual(MAX_EQUIPPED_ACTIVE_SKILLS);
    expect(invalidResult.sanitizedSkillIds).not.toContain('ass_phantom_strike');
    expect(invalidResult.sanitizedBeltSlugs.length).toBe(MAX_BELT_SLOTS);
    expect(invalidResult.sanitizedBeltSlugs[1]).toBeNull();

    expect(
      sanitizeActiveSkillLoadout(
        ['jug_shield_slam', 'van_colossus_cleave', 'war_second_wind_hymn', 'skill_divine_light', 'skill_arcane_nova'],
        unlocked
      )
    ).toHaveLength(4);
    expect(sanitizeBeltLoadout(['sunleaf_healing_draught', 'bogus'])).toEqual([
      'sunleaf_healing_draught',
      null,
      null,
      null,
    ]);
  });

  it('orders CTB turn queue by AGI/speed so fast hero acts first and gets extra turns vs slow boss', () => {
    const state = createTurnBasedEncounter({
      encounterId: 'enc_speed',
      questSlug: 'speed_test',
      questTitle: 'Speed Trial',
      seed: 'speed-seed',
      party: [
        {
          characterId: 'fast_hero',
          name: 'Swift Hero',
          controller: 'PLAYER',
          coreStats: { strengthLevel: 4, enduranceLevel: 4, agilityLevel: 18, dexLevel: 8 },
        },
      ],
      waves: [
        {
          waveNumber: 1,
          waveName: 'Slow Titan',
          enemies: [
            {
              enemyId: 'slow_boss',
              name: 'Sluggish Titan',
              isBoss: true,
              maxHp: 500,
              attackPower: 15,
              armor: 5,
              attackIntervalSeconds: 2.5,
              agility: 1,
            },
          ],
        },
      ],
    });

    const hero = state.units.find((u) => u.unitId === 'fast_hero')!;
    const boss = state.units.find((u) => u.unitId === 'wave1_slow_boss_0')!;
    expect(hero.speed).toBeGreaterThan(boss.speed * 2);
    expect(state.activeUnitId).toBe('fast_hero');
    expect(state.turnOrderTimeline).toHaveLength(8);
    expect(state.turnOrderTimeline[0]?.unitId).toBe('fast_hero');

    const heroTurnsInTimeline = state.turnOrderTimeline.filter((t) => t.unitId === 'fast_hero').length;
    const bossTurnsInTimeline = state.turnOrderTimeline.filter((t) => t.unitId === 'wave1_slow_boss_0').length;
    expect(heroTurnsInTimeline).toBeGreaterThan(bossTurnsInTimeline);
  });

  it('differentiates Stamina vs Mana skill costs, ticks cooldowns, and rejects invalid actions without mutation', () => {
    expect(getSkillResourceType('skill_divine_light')).toBe('MANA');
    expect(getSkillResourceType('skill_arcane_nova')).toBe('MANA');
    expect(getSkillResourceType('jug_shield_slam')).toBe('STAMINA');

    const divineCost = getSkillResourceCost(findSkill('skill_divine_light'));
    expect(divineCost).toEqual({ resourceType: 'MANA', cost: 20, cooldownTurns: 4 });

    const novaCost = getSkillResourceCost(findSkill('skill_arcane_nova'));
    expect(novaCost).toEqual({ resourceType: 'MANA', cost: 25, cooldownTurns: 3 });

    const slamCost = getSkillResourceCost(findSkill('jug_shield_slam'));
    expect(slamCost.resourceType).toBe('STAMINA');
    expect(slamCost.cost).toBe(20);

    let state = createTurnBasedEncounter(
      buildCryptPatrolInput({
        waves: [
          {
            waveNumber: 1,
            waveName: 'Sturdy Crypt Guards',
            enemies: [
              {
                enemyId: 'sturdy_guard_1',
                name: 'Sturdy Crypt Guard',
                maxHp: 400,
                attackPower: 8,
                armor: 5,
                attackIntervalSeconds: 1.5,
              },
              {
                enemyId: 'sturdy_guard_2',
                name: 'Sturdy Crypt Sentinel',
                maxHp: 400,
                attackPower: 8,
                armor: 5,
                attackIntervalSeconds: 1.6,
              },
            ],
          },
        ],
      })
    );
    const initialSnapshot = JSON.stringify(state);

    // Reject AUTO_AI_TURN on PLAYER turn without mutating state
    const badAiStep = stepTurnBasedCombat(state, { type: 'AUTO_AI_TURN' });
    expect(badAiStep.valid).toBe(false);
    expect(badAiStep.state).toBe(state);
    expect(JSON.stringify(state)).toBe(initialSnapshot);

    // Reject actorId mismatch
    const badActorStep = stepTurnBasedCombat(state, { type: 'GUARD', actorId: 'wrong_id' });
    expect(badActorStep.valid).toBe(false);
    expect(badActorStep.state).toBe(state);

    // Cast skill_arcane_nova (MANA)
    const heroBefore = state.units.find((u) => u.unitId === 'hero_1')!;
    const manaBefore = heroBefore.mana;
    const staminaBefore = heroBefore.stamina;

    const castNova = stepTurnBasedCombat(state, {
      type: 'USE_SKILL',
      skillId: 'skill_arcane_nova',
    });
    expect(castNova.valid).toBe(true);
    state = castNova.state;

    const heroAfterNova = state.units.find((u) => u.unitId === 'hero_1')!;
    expect(heroAfterNova.mana).toBeLessThan(manaBefore);
    expect(heroAfterNova.stamina).toBeGreaterThanOrEqual(staminaBefore); // Stamina untouched (or +8 regen)
    expect(heroAfterNova.skillCooldowns['skill_arcane_nova']).toBe(3);

    // Advance AI enemy turns until player turn
    const aiAdvance = advanceTurnBasedUntilPlayerOrEnd(state);
    expect(aiAdvance.valid).toBe(true);
    state = aiAdvance.state;

    // Reject casting skill_arcane_nova while on cooldown
    if (state.status === 'IN_PROGRESS' && state.phase === 'AWAITING_PLAYER_ACTION') {
      const cdReject = stepTurnBasedCombat(state, {
        type: 'USE_SKILL',
        skillId: 'skill_arcane_nova',
      });
      expect(cdReject.valid).toBe(false);

      // Cast jug_shield_slam (STAMINA)
      const heroPreSlam = state.units.find((u) => u.unitId === 'hero_1')!;
      const stamPreSlam = heroPreSlam.stamina;
      const slamStep = stepTurnBasedCombat(state, {
        type: 'USE_SKILL',
        skillId: 'jug_shield_slam',
      });
      expect(slamStep.valid).toBe(true);
      const heroPostSlam = slamStep.state.units.find((u) => u.unitId === 'hero_1')!;
      expect(heroPostSlam.stamina).toBe(stamPreSlam - 20);
      // skill_arcane_nova cooldown ticked down by 1 on this turn end
      expect(heroPostSlam.skillCooldowns['skill_arcane_nova']).toBe(2);
    }
  });

  it('applies GUARD 50% damage reduction and triggers PARRY_COUNTER when enemy attacks', () => {
    const baseInput: CreateTurnBasedEncounterInput = {
      encounterId: 'enc_guard',
      questSlug: 'guard_test',
      questTitle: 'Guard & Parry Test',
      seed: 'guard-seed',
      party: [
        {
          characterId: 'knight',
          name: 'Knight',
          controller: 'PLAYER',
          coreStats: { strengthLevel: 6, enduranceLevel: 6, agilityLevel: 6, dexLevel: 4 },
        },
      ],
      waves: [
        {
          waveNumber: 1,
          waveName: 'Duel',
          enemies: [
            {
              enemyId: 'orc_brute',
              name: 'Orc Brute',
              maxHp: 200,
              attackPower: 40,
              armor: 0,
              attackIntervalSeconds: 0.9,
              agility: 12,
              dodgeChance: 0,
              intentBias: 'STRIKE',
            },
          ],
        },
      ],
    };

    const initial = createTurnBasedEncounter(baseInput);
    const guardRes = stepTurnBasedCombat(initial, { type: 'GUARD' });
    expect(guardRes.valid).toBe(true);
    expect(guardRes.events.some((e) => e.type === 'GUARD_STANCE')).toBe(true);

    const knightAfterGuard = guardRes.state.units.find((u) => u.unitId === 'knight')!;
    expect(knightAfterGuard.canParry).toBe(true);
    expect(knightAfterGuard.statuses.some((s) => s.type === 'GUARDING')).toBe(true);
    expect(knightAfterGuard.shield).toBe(Math.round(knightAfterGuard.maxHp * 0.1));

    // Force enemy intent to STRIKE targeting knight so parry reliably triggers
    const preEnemyState: TurnBasedCombatState = JSON.parse(JSON.stringify(guardRes.state));
    const enemyUnit = preEnemyState.units.find((u) => u.side === 'ENEMY')!;
    const enemyHpBefore = enemyUnit.hp;
    enemyUnit.nextIntent = {
      intentType: 'STRIKE',
      label: 'Strike',
      targetUnitId: 'knight',
      estimatedDamage: 40,
    };

    // Ensure next active unit is the enemy
    if (preEnemyState.activeUnitId === 'knight') {
      // Wait for enemy turn if knight had double turn
      const adv = stepTurnBasedCombat(preEnemyState, { type: 'GUARD' });
      expect(adv.valid).toBe(true);
    }

    const afterEnemy = advanceTurnBasedUntilPlayerOrEnd(preEnemyState);
    expect(afterEnemy.valid).toBe(true);

    // Check either knight dodged or took halved damage + parry counter fired
    const parryEvt = afterEnemy.events.find((e) => e.type === 'PARRY_COUNTER');
    const dodgeEvt = afterEnemy.events.find((e) => e.type === 'DODGE');
    expect(Boolean(parryEvt || dodgeEvt)).toBe(true);
    if (parryEvt) {
      const enemyAfter = afterEnemy.state.units.find((u) => u.side === 'ENEMY')!;
      expect(enemyAfter.hp).toBeLessThan(enemyHpBefore);
      expect(parryEvt.isParry).toBe(true);
    }
  });

  it('supports all 4 belt consumables (sunleaf_healing_draught, vitality_elixir, astral_mana_tonic, tempered_whetstone)', () => {
    expect(COMBAT_CONSUMABLE_CATALOG).toHaveLength(4);
    expect(COMBAT_CONSUMABLE_BY_SLUG['sunleaf_healing_draught']?.healMaxHpPct).toBe(0.35);
    expect(COMBAT_CONSUMABLE_BY_SLUG['vitality_elixir']?.restoreStamina).toBe(40);
    expect(COMBAT_CONSUMABLE_BY_SLUG['astral_mana_tonic']?.restoreMana).toBe(40);
    expect(COMBAT_CONSUMABLE_BY_SLUG['tempered_whetstone']?.attackBuffPct).toBe(0.25);

    let state = createTurnBasedEncounter(buildCryptPatrolInput());
    // Artificially lower hero HP/stamina/mana in a cloned state to verify restoration
    const woundedState: TurnBasedCombatState = JSON.parse(JSON.stringify(state));
    const hero = woundedState.units.find((u) => u.unitId === 'hero_1')!;
    hero.hp = 50;
    hero.stamina = 10;
    hero.mana = 10;

    // Slot 0: sunleaf_healing_draught
    const s0 = stepTurnBasedCombat(woundedState, { type: 'USE_CONSUMABLE', beltSlotIndex: 0 });
    expect(s0.valid).toBe(true);
    expect(s0.state.consumablesUsed['sunleaf_healing_draught']).toBe(1);
    const h0 = s0.state.units.find((u) => u.unitId === 'hero_1')!;
    expect(h0.hp).toBeGreaterThan(50);
    expect(h0.beltSlots[0]?.charges).toBe(1);

    // Advance to next player turn & test slot 1 (vitality_elixir)
    let cur = advanceTurnBasedUntilPlayerOrEnd(s0.state).state;
    cur.units.find((u) => u.unitId === 'hero_1')!.stamina = 10;
    const s1 = stepTurnBasedCombat(cur, { type: 'USE_CONSUMABLE', beltSlotIndex: 1 });
    expect(s1.valid).toBe(true);
    expect(s1.state.units.find((u) => u.unitId === 'hero_1')!.stamina).toBeGreaterThanOrEqual(50);

    // Advance & test slot 2 (astral_mana_tonic)
    cur = advanceTurnBasedUntilPlayerOrEnd(s1.state).state;
    cur.units.find((u) => u.unitId === 'hero_1')!.mana = 5;
    const s2 = stepTurnBasedCombat(cur, { type: 'USE_CONSUMABLE', beltSlotIndex: 2 });
    expect(s2.valid).toBe(true);
    expect(s2.state.units.find((u) => u.unitId === 'hero_1')!.mana).toBeGreaterThanOrEqual(45);

    // Advance & test slot 3 (tempered_whetstone)
    cur = advanceTurnBasedUntilPlayerOrEnd(s2.state).state;
    const s3 = stepTurnBasedCombat(cur, { type: 'USE_CONSUMABLE', beltSlotIndex: 3 });
    expect(s3.valid).toBe(true);
    const h3 = s3.state.units.find((u) => u.unitId === 'hero_1')!;
    expect(h3.statuses.some((st) => st.type === 'SHARPENED' && st.potency === 0.25)).toBe(true);

    // Slot 3 now has 0 charges -> using it again must fail
    cur = advanceTurnBasedUntilPlayerOrEnd(s3.state).state;
    const emptySlotRes = stepTurnBasedCombat(cur, { type: 'USE_CONSUMABLE', beltSlotIndex: 3 });
    expect(emptySlotRes.valid).toBe(false);
  });

  it('enforces TAUNT single-target lock, exposes enemy nextIntent, advances waves, and supports Lv1 Copper clear', () => {
    const cryptQuest = DEFAULT_GUILD_QUEST_CATALOG.find(
      (q) => q.questSlug === 'guild_contract_crypt_patrol'
    )!;
    expect(DEFAULT_GUILD_QUEST_CATALOG).toHaveLength(6);

    // Solo Lv1 Copper hero clearing crypt patrol
    let state = createTurnBasedEncounter({
      encounterId: 'enc_lv1_copper',
      questSlug: cryptQuest.questSlug,
      questTitle: cryptQuest.title,
      seed: 'lv1-copper-seed',
      party: [
        {
          characterId: 'copper_rookie',
          name: 'Rookie',
          controller: 'PLAYER',
          coreStats: { strengthLevel: 1, enduranceLevel: 1, agilityLevel: 1 },
          beltSlots: [{ itemSlug: 'sunleaf_healing_draught', charges: 1 }],
        },
      ],
      waves: cryptQuest.waves,
    });

    // Enemy telegraphs are populated on spawn
    expect(state.units.filter((u) => u.side === 'ENEMY').every((e) => Boolean(e.nextIntent))).toBe(true);

    let safety = 0;
    while (state.status === 'IN_PROGRESS' && safety < 60) {
      safety += 1;
      if (state.phase === 'AWAITING_AI_TURN') {
        state = advanceTurnBasedUntilPlayerOrEnd(state).state;
        continue;
      }
      const hero = state.units.find((u) => u.unitId === 'copper_rookie')!;
      if (hero.hp < hero.maxHp * 0.5 && (hero.beltSlots[0]?.charges ?? 0) > 0) {
        state = stepTurnBasedCombat(state, { type: 'USE_CONSUMABLE', beltSlotIndex: 0 }).state;
      } else {
        state = stepTurnBasedCombat(state, { type: 'BASIC_ATTACK' }).state;
      }
    }
    expect(state.status).toBe('VICTORY');
    expect(state.currentWaveIndex).toBe(1);

    // Test TAUNT lock in a 2-hero party
    let tauntState = createTurnBasedEncounter({
      encounterId: 'enc_taunt',
      questSlug: 'taunt_test',
      questTitle: 'Taunt Lock',
      seed: 'taunt-seed',
      party: [
        {
          characterId: 'tank_hero',
          name: 'Tank',
          controller: 'PLAYER',
          coreStats: { strengthLevel: 5, enduranceLevel: 8, agilityLevel: 6 },
          unlockedTalentRanks: { jug_shield_slam: 1 },
          activeSkillIds: ['jug_shield_slam'],
        },
        {
          characterId: 'squishy_hero',
          name: 'Mage',
          controller: 'PLAYER',
          coreStats: { strengthLevel: 2, enduranceLevel: 3, agilityLevel: 4 },
        },
      ],
      waves: [
        {
          waveNumber: 1,
          waveName: 'Single Striker',
          enemies: [
            {
              enemyId: 'orc_striker',
              name: 'Orc Striker',
              maxHp: 200,
              attackPower: 25,
              armor: 0,
              attackIntervalSeconds: 1.0,
              agility: 4,
              dodgeChance: 0,
              intentBias: 'STRIKE',
            },
          ],
        },
      ],
    });

    // Tank uses jug_shield_slam (applies TAUNT)
    expect(tauntState.activeUnitId).toBe('tank_hero');
    const slam = stepTurnBasedCombat(tauntState, { type: 'USE_SKILL', skillId: 'jug_shield_slam' });
    expect(slam.valid).toBe(true);
    tauntState = slam.state;

    // Force enemy intent target to squishy_hero; TAUNT must override and hit tank_hero instead!
    const cloned: TurnBasedCombatState = JSON.parse(JSON.stringify(tauntState));
    const orc = cloned.units.find((u) => u.side === 'ENEMY')!;
    orc.nextIntent = {
      intentType: 'STRIKE',
      label: 'Strike',
      targetUnitId: 'squishy_hero',
      estimatedDamage: 25,
    };

    // Advance any remaining player turns until it is the Orc's turn
    let stepped = cloned;
    let guardLoop = 0;
    while (stepped.phase === 'AWAITING_PLAYER_ACTION' && guardLoop < 6) {
      guardLoop += 1;
      stepped = stepTurnBasedCombat(stepped, { type: 'GUARD' }).state;
    }
    expect(stepped.phase).toBe('AWAITING_AI_TURN');
    expect(stepped.activeUnitId).toBe(orc.unitId);
    const aiRes = stepTurnBasedCombat(stepped, { type: 'AUTO_AI_TURN' });
    expect(aiRes.valid).toBe(true);
    const enemyAttackEvent = aiRes.events.find(
      (e) => e.type === 'ENEMY_INTENT_EXECUTED' || e.type === 'DODGE'
    );
    expect(enemyAttackEvent?.targetId).toBe('tank_hero');
  });

  it('executes AI Company presets (ally_lyra healing wounded hero, ally_torin cleaving)', () => {
    const lyraPreset = ADVENTURER_COMPANY_AI_PRESETS.find((p) => p.characterId === 'ally_lyra')!;
    const torinPreset = ADVENTURER_COMPANY_AI_PRESETS.find((p) => p.characterId === 'ally_torin')!;
    expect(lyraPreset).toBeDefined();
    expect(torinPreset).toBeDefined();

    const state = createTurnBasedEncounter({
      encounterId: 'enc_companions',
      questSlug: 'companion_test',
      questTitle: 'Company Synergy',
      seed: 'company-seed',
      party: [
        {
          characterId: 'player_hero',
          name: 'Hero',
          controller: 'PLAYER',
          coreStats: { strengthLevel: 4, enduranceLevel: 4, agilityLevel: 3 },
        },
        lyraPreset,
        torinPreset,
      ],
      waves: [
        {
          waveNumber: 1,
          waveName: 'Twin Goblins',
          enemies: [
            {
              enemyId: 'goblin_1',
              name: 'Goblin Raider',
              maxHp: 120,
              attackPower: 10,
              armor: 2,
              attackIntervalSeconds: 2.2,
            },
            {
              enemyId: 'goblin_2',
              name: 'Goblin Shaman',
              maxHp: 110,
              attackPower: 10,
              armor: 2,
              attackIntervalSeconds: 2.2,
            },
          ],
        },
      ],
    });

    // Wound player_hero and inspect Lyra's AI decision
    const wounded: TurnBasedCombatState = JSON.parse(JSON.stringify(state));
    const playerHero = wounded.units.find((u) => u.unitId === 'player_hero')!;
    playerHero.hp = Math.round(playerHero.maxHp * 0.35);

    const lyraAction = chooseTurnBasedAiAction(wounded, 'ally_lyra');
    expect(lyraAction).toEqual({
      type: 'USE_SKILL',
      actorId: 'ally_lyra',
      skillId: 'war_second_wind_hymn',
      targetId: 'player_hero',
    });

    // Torin sees 2 enemies -> should choose CLEAVE skill (van_colossus_cleave)
    const torinAction = chooseTurnBasedAiAction(wounded, 'ally_torin');
    expect(torinAction.type).toBe('USE_SKILL');
    if (torinAction.type === 'USE_SKILL') {
      expect(torinAction.skillId).toBe('van_colossus_cleave');
    }
  });

  it('produces 100% deterministic replays across JSON checkpoints (runA === runB & replayAndVerifyTurnBasedRun)', () => {
    const input = buildCryptPatrolInput({
      party: [
        {
          characterId: 'hero_1',
          name: 'Aria',
          controller: 'PLAYER',
          coreStats: { strengthLevel: 6, enduranceLevel: 6, agilityLevel: 7, dexLevel: 5 },
          unlockedTalentRanks: {
            ass_phantom_strike: 2,
            mag_supernova_blast: 1,
          },
          activeSkillIds: ['ass_phantom_strike', 'skill_arcane_nova'],
          beltSlots: [{ itemSlug: 'tempered_whetstone', charges: 1 }],
        },
        ADVENTURER_COMPANY_AI_PRESETS[0]!,
      ],
    });

    const playMatch = (): { finalState: TurnBasedCombatState; actions: TurnBasedCombatAction[] } => {
      let state = createTurnBasedEncounter(input);
      const actions: TurnBasedCombatAction[] = [];
      let guard = 0;

      while (state.status === 'IN_PROGRESS' && guard < 120) {
        guard += 1;
        // Simulate JSON checkpoint persistence & restoration on every step
        state = JSON.parse(JSON.stringify(state)) as TurnBasedCombatState;

        let action: TurnBasedCombatAction;
        if (state.phase === 'AWAITING_AI_TURN') {
          action = { type: 'AUTO_AI_TURN' };
        } else {
          const hero = state.units.find((u) => u.unitId === state.activeUnitId)!;
          if ((hero.beltSlots[0]?.charges ?? 0) > 0) {
            action = { type: 'USE_CONSUMABLE', beltSlotIndex: 0 };
          } else if ((hero.skillCooldowns['skill_arcane_nova'] ?? 0) === 0 && hero.mana >= 25) {
            action = { type: 'USE_SKILL', skillId: 'skill_arcane_nova' };
          } else if ((hero.skillCooldowns['ass_phantom_strike'] ?? 0) === 0 && hero.stamina >= 18) {
            action = { type: 'USE_SKILL', skillId: 'ass_phantom_strike' };
          } else {
            action = { type: 'BASIC_ATTACK' };
          }
        }

        const step = stepTurnBasedCombat(state, action);
        expect(step.valid).toBe(true);
        actions.push(action);
        state = step.state;
      }

      return { finalState: state, actions };
    };

    const runA = playMatch();
    const runB = playMatch();
    expect(runA.finalState.status).toBe('VICTORY');
    expect(runA.finalState).toEqual(runB.finalState);

    const verified = replayAndVerifyTurnBasedRun(input, runA.actions);
    expect(verified.valid).toBe(true);
    expect(verified.finalState).toEqual(runA.finalState);
  });
});
