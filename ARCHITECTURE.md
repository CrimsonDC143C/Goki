# Goki: Fitness RPG — Project State of Affairs & Technical Brief

> **Document Purpose:** Comprehensive architectural and operational summary of the Goki codebase. Designed to be provided to any LLM or software engineer with zero prior context to immediately enable accurate technical comprehension, architectural analysis, and actionable contribution.

---

## 1. Executive Summary & Core Philosophy

**Goki** is a cross-platform, multiplayer gamified fitness tracker built as an offline-first TypeScript monorepo. It bridges real-world physical training with classic RPG character progression:

* **Physical-to-Digital Translation:** Real-world workouts (resistance training, low/moderate cardio, high-intensity VO2 max sport, calisthenics, daily steps, sleep, mobility, and mindfulness) are converted deterministically into a holistic **7-Stat RPG System**: **Strength (STR)**, **Endurance (END)**, **Agility (AGI)**, **Dexterity (DEX)**, **Constitution (CON)**, **Wisdom (WIS)**, and **Spirit (SPR)**, with full backward compatibility for legacy 3-stat profiles.
* **Dual-Paced Behavioral Loops:**
  * **Intra-Workout ("Zero Cognitive Drag"):** High-contrast, minimal-tap, haptic-driven UI designed for the gym floor. Focus locks prevent menu distractions while dynamic rest timers, plate warm-up calculations, real-time exercise search/filtering, and live PR tracking run seamlessly. Real-time audio cues run natively via `expo-audio` with a procedural Web Audio synthesizer fallback and a persistent Gym Silence toggle.
  * **Extra-Workout ("Tavern & World Hub"):** Rich metagame featuring 10 stat-bound talent trees across all 7 stats, 8-slot equipment loadouts, 2-hour idle gathering/crafting professions (Mining, Foraging, Smelting, Alchemy), 24-hour solo/co-op auto-battler dungeons, and 7-day public/guild boss raids.
* **Operational Ironman Verification & Hardware Telemetry:** Dual-mode architecture (`STANDARD` vs `IRONMAN_VERIFIED`). Native telemetry pipeline interfaces with Apple HealthKit (`react-native-health`) and Google Health Connect (`react-native-health-connect`), featuring permission negotiation, session BPM streaming, activity classifications, sleep stages, and pedometer steps. Server-side validation routines (`verifyTelemetry`, `verifyMindBodyTelemetry`, `verifyRecoveryTelemetry`) perform physiological sanity checks (35–240 BPM), flatline checks, and cryptographic verification to prevent spoofing.
* **Dual Runtime Engine:** The core RPG and fitness math lives in a zero-dependency package (`@goki/game-engine`) that runs identically in Node.js (backend) and React Native / Expo Web (client). The mobile app remains fully functional and deterministic even when completely offline or disconnected from the server.

---

## 2. Monorepo Architecture & Tech Stack

```text
goki/
├── docker-compose.yml              # Local PostgreSQL 16 & Redis 7 services
├── package.json                    # Monorepo root (npm workspaces, Vitest, Playwright, TypeScript)
├── playwright.config.ts            # E2E test harness (Fastify API + Expo Web)
├── render.yaml                     # Render Blueprint (Fastify Web Service, PostgreSQL 16, Redis 7)
├── tsconfig.base.json              # Shared TypeScript base configuration (Node16 module resolution)
├── packages/
│   ├── game-engine/                # Pure deterministic math & RPG mechanics (@goki/game-engine)
│   └── database/                   # PostgreSQL Prisma ORM 6.4 schema, seed, & client (@goki/database)
└── apps/
    ├── server/                     # Fastify REST/WebSocket API & BullMQ async timer workers (@goki/server)
    └── mobile/                     # React Native Expo SDK 58 + Expo Web client (@goki/mobile)
```

| Layer | Technology | Key Libraries & Roles |
| :--- | :--- | :--- |
| **Monorepo** | npm workspaces | TypeScript 5.7+ / 6.0+, Vitest 2.1, Playwright 1.64, Node >= 20.0 |
| **Game Engine** | Pure TypeScript | Seeded PRNG (`createSeededRng`), zero external runtime dependencies, Metro source export |
| **Database** | PostgreSQL 16 + Prisma ORM 6.4 | 31 relational models, 26 enums, automated seed migrations (1,034 lines schema) |
| **Backend API** | Fastify 5.2 (Node.js) | Zod 3.24 schema validation, `@fastify/jwt`, `@fastify/websocket`, `@fastify/cors`, BigInt JSON serializers |
| **Async Queues** | Redis 7 + BullMQ 5.34 | Scheduled workers for 2h gathering, 24h dungeons, 24h rest, 7d raids with in-memory test fallback |
| **Mobile Client** | React Native 0.88 (Expo SDK 58) | `react-native-web` (Web), `react-native-reanimated` (runtime TurboModule detection with 60 FPS `RNAnimated` native-driver fallback for OTA binary compatibility), `expo-audio`, `expo-image`, `expo-secure-store`, `expo-notifications`, `expo-haptics`, `react-native-svg`, `react-native-health`, `react-native-health-connect`, `expo-build-properties` |

---

## 3. Core Mechanics & Mathematical Specifications

### A. 7-Stat Holistic Progression System

| Stat | Real-World Input Modality | Core Formula & Scaling | Combat & Gameplay Impact |
| :--- | :--- | :--- | :--- |
| **Strength (STR)** | Resistance / Weightlifting (barbell, dumbbell, cables, bodyweight) | Volume ($W \times R$) modulated by Relative Intensity ($W / \text{e1RM}$) and RPE. Drop-sets add +10% metabolic XP. | Melee Attack Power, Gear Equip Requirements, Physical Damage Mitigation. |
| **Endurance (END)** | Low-to-Moderate Cardio (HR Zones 1–3, Zone 2 aerobic base rides, brisk walks) | Minutes spent in HR Zones 1–3 ($Z_1=4.5$, $Z_2=9.0$, $Z_3=7.8$ XP/min) $\times$ sport modality factor. | Max Stamina pool, Dungeon Trap/Hazard Resistance, Gathering swing cadence. |
| **Agility (AGI)** | High-Intensity Cardio & Sports (HR Zones 4–5, VO2 Max, HIIT, Badminton, Boxing) | Minutes spent in HR Zones 4–5 ($Z_4=11.5$, $Z_5=14.5$ XP/min) $\times$ sport modality factor. | Attack Speed, Dodge Chance, Crit Chance, Skill Cooldown Haste. |
| **Dexterity (DEX)** | Calisthenics & Rock Climbing (bodyweight progressions, bouldering, gymnastic rings) | Duration & Volume Reps modulated by RPE ($0.5 + \text{RPE}/10$) and skill tier ($+15\%/\text{tier}$), with climbing tension multiplier ($1.15\times$). | Precision / Accuracy, Critical Strike Multiplier, Armor Penetration, Dual-wielding / Offhand balance. |
| **Constitution (CON)** | Sleep Tracking & Daily Steps (sleep duration, sleep quality, daily pedometer step counts) | Effective Sleep Hours ($8.0\text{ XP/hr}$) modulated by Quality Score ($0\text{--}100$) + Step Volume ($5\text{ XP per }1,000\text{ steps}$) with diminishing returns past $15,000$ steps. | Maximum Health (HP) Pool, Systemic Damage Mitigation, Health Regeneration, Disease/Poison Resistance. |
| **Wisdom (WIS)** | Mindful Mobility & Flexibility (Yoga, Pilates, deep stretching, mobility routines) | Duration in minutes ($5.0\text{ XP/min}$) with piecewise diminishing returns after $45\text{ min}$ ($0.5\times$) and $90\text{ min}$ ($0.2\times$), with Pilates core multiplier ($1.05\times$). | Status Effect Duration Reduction, Dungeon Trap Detection, Spell/Buff Potency, Resource Efficiency. |
| **Spirit (SPR)** | Mental Restorative & Thermal Conditioning (Meditation, Breathwork, Sauna, Cold Plunge) | Duration in minutes ($6.0\text{ XP/min}$) with diminishing returns past $30\text{ min}$, scaled by thermal/mindfulness factor (Sauna $1.15\times$, Cold Plunge $1.25\times$, Breathwork $1.1\times$). | Mental Resolve, Fatigue Resistance / Recovery Speed, Resilience Shield Generation, Raid Aura Synergy. |

* **Overall Level Formula:** $\text{Overall Level} = \max\left(1, \left\lfloor \frac{\text{STR} + \text{END} + \text{AGI} + \text{DEX} + \text{CON} + \text{WIS} + \text{SPR}}{7} \right\rfloor\right)$ (with legacy 3-stat backward compatibility: $\max(1, \lfloor (\text{STR Level} + \text{END Level} + \text{AGI Level}) / 2 \rfloor)$).
* **Talent Points:** Gained independently on level-up for the respective stat (`STR`, `END`, `AGI`, etc.) and spent strictly within that stat's archetype trees.

### B. Personal Records (PRs) & "Critical Training Bonus"

* **Estimated 1-Rep Max (e1RM):** Calculated using the Epley formula: $\text{e1RM} = \text{Weight} \times (1 + \text{Reps} / 30)$.
* **Live PR Breaks:** Detected on individual sets (e1RM break, reps-at-weight break, or single-set volume break).
* **PR Crit Bonus:** First PR break in a session awards **+75 bonus XP**; subsequent breaks award **+35 XP** (capped at 3 per workout). Triggers an immediate guaranteed roll on the rare material/gear loot table.

### C. Fatigue Management & Active Recovery

* **Automatic Tavern Rest:** Triggered after $\ge 24\text{ hours}$ without a strenuous workout (lifting or HR Zones 3–5). Grants the **Well-Rested** state, providing an XP multiplier $> 1.0\times$ for the next session.
* **Active Recovery Sessions:** Logging mobility, stretching, foam rolling, or Zone 1 walks clears 1 stack of Systemic Fatigue and primes a **+25% XP multiplier** on the next strenuous workout.
* **Systemic Fatigue Stacks:** Triggered by 5–6+ consecutive high-intensity days without rest. Applies percentage debuffs to combat accuracy, dodge rating, and base stats during dungeon encounters.

### D. Hybrid Reward Protocol & Behavioral Ergonomics

* **5-State Finite State Machine:** `Idle` $\rightarrow$ `DungeonActive` $\rightarrow$ `Resting` $\rightarrow$ `DungeonComplete` $\rightarrow$ `LootReview`.
* **Equal Arrival Boon (1.25x):** Awarded identically whether the athlete logs via a registered gym geofence or open-world manual session, preventing home/outdoor penalties.
* **Focus Lock:** While in `DungeonActive` or `Resting`, navigation to other tabs is restricted by an explicit confirmation dialog to maintain gym focus.
* **Micro-Reward Ticks:** Logging a set immediately executes a sensory tick (haptic/audio chime), ticks micro-XP/gold, and inflicts damage on a mini-encounter boss.
* **Two-Stage Unified Rest Timer (`DynamicRestTimer.tsx`, `StaminaRingTimer.tsx`, `OfflineWorkoutScreen.tsx`, `WorkoutLoggerScreen.tsx`, `restNotificationScheduler.ts`):**
  * **Stage 1 (Center-Screen Focus Overlay):** High-focus modal overlay (`rgba(10, 12, 18, 0.82)` backdrop) triggered immediately upon set logging. Features an SVG stamina ring countdown, elapsed-time-preserving adjustments (`-15s`, `+15s`, `+30s`, and quick-tap preset buttons `1m`, `1.5m`, `2m`, `3m`, `4m` highlighting recommended duration), compact `(i)` physiological rationale tooltip toggle, and state-aware action buttons (`"View Workout / Minimize Timer"` + muted `"Skip Rest & Begin Next Set"` while counting down, transitioning to emerald `"⚡ STAMINA FULL — BEGIN NEXT SET"` at `0:00` with somatic haptic and audio chime triggers).
  * **Stage 2 (Pinned Parallax Floating HUD Pill/Ring):** Anchored to the viewport header with scroll-reactive parallax depth (`scrollOffsetY`) when minimized or during intra-workout browsing. Features a compact SVG stamina ring, remaining time countdown, emerald completion flash, and tap-to-expand gesture.
  * **Elapsed-Time-Preserving Math (`ADJUST_REST_TIMER`):** Mid-rest adjustments—whether switching preset durations (`45s`, `60s`, `90s`, `120s`, `180s`, `240s`), entering custom second intervals, or tapping `-15s` / `+15s` / `+30s`—preserve all time already rested (`elapsedMs = max(0, nowMs - restStartedAtMs)`) and dynamically recalculate `remainingMs = max(0, newDurationMs - elapsedMs)` (instantly completing if `elapsedMs >= newDurationMs`), operating identically across both live hybrid dungeon workouts (`hybrid-reward-protocol.ts`, `DynamicRestTimer.tsx`) and standalone offline workouts (`OfflineWorkoutScreen.tsx`).
  * **Unified Lockscreen Notification Scheduler (`restNotificationScheduler.ts`):** Single-slot OS notification manager (`scheduleRestNotification`, `cancelRestNotification`) with an Android `MAX`-importance haptic vibration channel (`rest-timer-alerts`), automatically rescheduling or canceling background OS alerts whenever rest durations are adjusted, skipped, or completed so overlapping timers never fire stale notifications.
* **Resilience Bonus (Anti-Streak Collapse):** Returning after $\ge 72\text{ hours}$ or training in "Low Energy Mode" grants a flat bonus (+50 XP, +35 Gold, +15% XP) and resilience shields, combating the "what-the-hell" abandonment effect.
* **Effort-Gated Loot Chests:** Post-workout chest tiers (**Common**, **Rare**, **Epic**) depend on an effort score (0–100) derived from progressive overload, RPE, and relative intensity—**not** empty volume bloat.

### E. Metagame Systems

1. **Multi-Class Talent Trees (10 Stat-Bound Archetypes across 7 Stats, 55 Pts/Tree, 110 Total Nodes):**
   * **Strength:** *Juggernaut* (armor, threat, damage barriers) & *Vanguard* (burst damage, armor-piercing cleaves).
   * **Endurance:** *Warden* (hazard mitigation, sustained party regen) & *Outrider* (cooldown haste, initiative, trailblazing).
   * **Agility:** *Berserker* (crit multiplier, execute damage, low-HP rage) & *Assassin* (crit chance, backstab bleed, dodge counter).
   * **Dexterity:** *Acrobat* (acrobatic reflexes, trap evasion, precision strikes).
   * **Constitution:** *Guardian* (iron fortitude, maximum health pool, damage mitigation).
   * **Wisdom:** *Cleric* (divine healing power multiplier, restorative party preservation).
   * **Spirit:** *Mage* (arcane focus, maximum mana boost, spellcasting efficiency).
   * **5-Tier, 11-Node Structure per Tree:** Each tree contains 11 nodes spanning 5 distinct tiers where the sum of `maxRank` across all nodes equals **55 talent points** (550 talent points across all 10 trees, 110 nodes total):
     * *Tier 1: Foundation* (0 pts spent required; 3 starter nodes, max rank 5 each = 15 pts).
     * *Tier 2: Early Conditioning* (5 pts spent required in tree; 2 nodes, max rank 5 each = 10 pts).
     * *Tier 3: Combat Specialization* (15 pts spent required in tree; 2 nodes including 1 Active Combat Skill, max rank 5 each = 10 pts).
     * *Tier 4: Veteran Mastery* (30 pts spent required in tree; 2 nodes, max rank 5 each = 10 pts).
     * *Tier 5: Apex Capstone* (40 pts spent required in tree; 2 powerful keystone capstone nodes, max rank 5 each = 10 pts).
   * **Inverted Bottom-to-Top Node Graph (`TalentBuilderScreen.tsx`):** Renders nodes vertically inverted matching authentic RPG progression trees, with *Tier 1 Foundation* at the bottom (`y = 474`) climbing upward via dynamic SVG Bezier connection curves to *Tier 5 Apex Capstone* at the summit (`y = 58`), complete with active node inspector, unspent point badges, and tier unlock thresholds.

2. **Procedural Itemization & 5-Tier Affix Engine (`item-affix-engine.ts`):**
   * **32 Base Equippable Items (`BASE_EQUIPPABLE_ITEMS`):** Comprehensive equipment catalog covering all 8 equipment slots (`TWO_HANDED` & `ONE_HANDED` weapons, `OFFHAND` shields/relics, `HEAD`, `CHEST`, `LEGS`, `BOOTS`, `ACCESSORY`).
   * **5-Tier Scaling (`ITEM_TIER_CONFIG`):**
     * **Tier 1 (`COMMON`, `T1`, Roman `I`):** `1.00x` base stat multiplier, `1.00x` affix multiplier, `1.0x` gold multiplier. At most one affix (Prefix XOR Suffix, never both).
     * **Tier 2 (`UNCOMMON`, `T2`, Roman `II`):** `1.20x` base stat multiplier, `1.25x` affix multiplier, `1.6x` gold multiplier. Independent 65% prefix / 65% suffix roll allowing dual affixes.
     * **Tier 3 (`RARE`, `T3`, Roman `III`):** `1.45x` base stat multiplier, `1.55x` affix multiplier, `2.6x` gold multiplier. 85% prefix / 85% suffix roll with at least one affix guaranteed.
     * **Tier 4 (`EPIC`, `T4`, Roman `IV`):** `1.80x` base stat multiplier, `2.00x` affix multiplier, `4.5x` gold multiplier. 100% guaranteed Prefix AND Suffix.
     * **Tier 5 (`MYTHIC`, `T5`, Roman `V`):** `2.25x` base stat multiplier, `2.50x` affix multiplier, `8.0x` gold multiplier. 100% guaranteed Prefix + Suffix + transforms into a **Unique Named Counterpart** (`★ <Unique Name>`) with unique lore and an innate **Unique Passive Effect** (e.g. *Ashbringer*, *Aegis of the Sun*, *Malakor's Signet*, *Windrunner's Reflex*).
   * **Affix Pools:**
      * **12 Secondary Combat Prefixes (`ITEM_PREFIXES`):** E.g. *Brutal* (+Melee Power), *Stalwart* (+Armor), *Swift* (+Attack Speed), *Deadly* (+Crit Chance), *Savage* (+Crit Damage), *Unyielding* (+Damage Mitigation), *Sundering* (+Armor Pen), *Vampiric* (+Life on Hit).
      * **10 Primary 7-Stat Suffixes (`ITEM_SUFFIXES`):** E.g. *of the Titan* (+STR), *of the Juggernaut* (+END), *of the Wind* (+AGI), *of the Duelist* (+DEX), *of the Colossus* (+CON), *of the Sage* (+WIS), *of the Seraph* (+SPR).
   * **40 Bespoke `1:1` Dark-Fantasy RPG Item Icon Pipeline & Registry (`itemArtRegistry.ts`, `assets/items/*.png`, `scripts/generate-layer-icons.mjs`):**
     * 40 bespoke `512x512` (`1:1`) Oni-style dark-fantasy PNG icons covering all 32 Base Equippable Items plus 8 Consumables & Crafting Materials (`vitality_elixir`, `berserker_draught`, `ironwood_stew`, `hearty_trail_rations`, `shadowsilk_spool`, `moonstone_crystal`, `void_essence_vial`, `obsidian_iron_ingot`).
     * `ITEM_ICON_REGISTRY`, `ITEM_ICON_ALIASES`, and `getItemIconSource()` provide instant, zero-overhead asset resolution across Paperdoll `58x58` slots, Satchel `44x44` rows, Pinned Bottom Tooltip `56x56` header, Post-Workout Spoils Receipt (`WorkoutLoggerScreen.tsx`), Gathering yield projections (`GatheringNodeScreen.tsx`), and Expedition Spoils Fanfare cards (`AutoBattlerArena.tsx`).
   * **Integration:** Direct mathematical feeding into `aggregateEquippedItemModifiers` and `calculateDerivedCombatStats` for full dynamic combat attribute scaling.

3. **2-Hour Idle Gathering & Crafting:**
   * Professions: Mining, Foraging, Smelting, Alchemy.
   * Player stats reduce the tick interval (from a base 5 min down to 1 min) and boost yield (e.g., AGI accelerates foraging cadence; END sustains mining stamina; STR boosts ore yields).
   * Supports custom duration goals, push notification alerts on completion, and retroactive offline tick reconciliation.

4. **24-Hour Dungeons & Auto-Battler Replay:**
   * 1–5 player party expeditions spanning a 24-hour real-time window.
   * Real-world workouts completed mid-window inject live buffs into the expedition party (e.g., *Titanic Force*, *Tailwind Haste*).
   * Deterministic auto-battler engine simulates combat tick-by-tick ($250\text{ms}$ ticks) with RNG seeds.
   * **Boss-Then-Chest Room Sequence (`N - 1` Boss -> `N` Treasure Chest):**
     * Across all 5 rank-gated expeditions (`COPPER` Obsidian Catacombs, `IRON` Bloodfang Warcamp, `BRONZE` Traitors' Garrison, `SILVER` Blighted Ossuary, `GOLD` Hellforge Sanctum), all Mob/Hazard rooms precede the climax, the **Boss Encounter (`roomType: 'BOSS'`) is always the second-to-last room (`N - 1`)**, and the **Treasure Cache (`roomType: 'LOOT_CHEST'`) is always the final room (`N`)** with sequential room numbers.
     * Both the Boss room and final Loot Chest room are eligible for boss-tier procedural item roll odds.
   * **5 Rank-Gated 24-Hour Expeditions (`DEFAULT_DUNGEON_CATALOG`):**
     1. **`COPPER` — *Obsidian Catacombs*:** 4 Rooms (Room 1 Mob, Room 2 Hazard, Room 3 Boss *Malakor, Warden of the Ash Vault*, Room 4 Loot Chest *Sunken Reliquary Chest*).
     2. **`IRON` — *Bloodfang Warcamp*:** 6 Rooms (Rooms 1–4 Mobs/Hazard, Room 5 Boss *Warchief Gromkhar the Gore-Crowned*, Room 6 Loot Chest *War-Spoils Cache*).
     3. **`BRONZE` — *Traitors' Garrison*:** 8 Rooms (Rooms 1–6 Mobs/Hazard, Room 7 Boss *Lord Commander Vaelen the Forsworn*, Room 8 Loot Chest *Garrison Armory Chest*).
     4. **`SILVER` — *Blighted Ossuary*:** 10 Rooms (Rooms 1–8 Mobs/Hazard, Room 9 Boss *Arch-Lich Vorathis, Sovereign of Bone*, Room 10 Loot Chest *Ancient Ossuary Reliquary*).
     5. **`GOLD` — *Hellforge Sanctum*:** 12 Rooms (Rooms 1–10 Mobs/Hazard, Room 11 Boss *Ignis-Vorr, The Hellforge Colossus*, Room 12 Loot Chest *Mythic Hellforge Vault*).
   * **Rank Gating & UI Experience (`DungeonScreen.tsx`):**
     * Expeditions are strictly gated by athlete Adventurer Rank (`isAdventurerRankSufficient`).
     * Horizontal expedition tier selector bar displaying Rank badges, room counts, and lock status with decluttered headers.
   * **Interactive Expedition Spoils Fanfare Modal & Single Claim Flow (`AutoBattlerArena.tsx` & `DungeonScreen.tsx`):**
     * Automatically triggers when the combat replay reaches and unseals the final Treasure Chest room after the boss (or when tapping `⏭ Skip to End`).
     * Features an illustrated Mythic Treasure Chest SVG header (`LOOT_CHEST_SVGS.MYTHIC`), Victory banner, dungeon title, and gold reward badge.
     * **Interactive Tap-to-Unseal / Flip Loot Cards:** Sealed cards display a glowing reliquary border with `"🔒 Tap to Unseal Spoils"`. Tapping any card (or tapping `"✨ Reveal All Spoils"`) triggers somatic haptics and audio level-up chimes (`CHEST_OPEN_REVEAL`), revealing the `1:1` bespoke item icon, `T1–T5` tier badge, rarity border, full rolled name, Prefix/Suffix/Unique badges, and stat bonuses.
     * **Single Primary CTA (`"✨ Claim Spoils & Complete Expedition"`):** Closes the fanfare modal, claims all rewards, and calls `onDismiss` (`dismissCompletedDungeonReplay`) to immediately exit the arena and return cleanly to the Expedition Lobby (eliminating redundant bottom close buttons, with a `"🎁 Open Expedition Spoils Chest"` button remaining in the arena for log review).
   * **2D Sprite Combat & Multi-Layer Parallax Auto-Battler Arena (`AutoBattlerArena.tsx` / `AutoBattlerCanvas.tsx`):**
     * **6-Layer Seamless Parallax Environment:** Rendered via `ParallaxBackground.tsx` and `ParallaxLayer.tsx` with twin-strip seamless looping and dynamic scroll modes (`marching` during wave transitions and live patrol, `combat` atmospheric micro-drift during clashes, and `paused`).
     * **Hardware-Accelerated Sprite Sheet Slicer:** Implemented in `SpriteAnimator.tsx` and `spriteManifest.ts` slicing 100×100 px PNG sprite sheets across 7 rigs (`knight`, `swordsman`, `archer`, `skeleton`, `orc`, `greatsword_skeleton`, `demon_boss`) and 5 animation states (`idle`, `walk`, `attack`, `hurt`, `death`) with pixel-accurate foot-row ground alignment (`footRow: 59`).
     * **Multi-Hero & Multi-Enemy Formations:** Simultaneous rendering of all living and defeated party heroes and room enemies with per-unit state machines, inline enemy mini HP bars, and two-phase frame-accurate strike synchronization (`attackImpactFrame` + `resolvedImpactCursor`). Lunges, weapon contact frames, HP/shield drops, target `hurt`/`death` reactions, floating combat popups, and `expo-audio` SFX align to the exact millisecond of weapon impact.
     * **Dual-Driver Motion Runtime Adapter (`reanimatedRuntime.ts`):** Dynamically probes for native worklet TurboModules (`WorkletsModule`), executing UI-thread `react-native-reanimated` physics when available while seamlessly falling back to 60 FPS `RNAnimated` (`useNativeDriver: true`) on existing `0.1.0` standalone binaries to maintain 100% crash-free OTA compatibility.

5. **Guilds, Rank Trials, & 7-Day Raid Sanctums:**
   * Adventurer ranks from **Copper** to **Mythic**, unlocked via specific guild bounties and physical rank-up trials.
   * **Character-Scoped Rank Trial Progression & Persistent Global Training History:** Every logged workout record (`CompletedWorkoutRecord`), offline sync payload (`QueuedOfflineWorkoutPayload`), and spoils receipt (`WorkoutSpoilsReceipt`) silently attaches `characterId`. While the athlete's real-world **Training History** (`TrainingHistoryScreen.tsx`) permanently preserves all historical workouts across character switches and deletions, RPG progression metrics (`workoutsLoggedCount` via `countWorkoutsForCharacter`, completed guild bounties, streaks, PRs, and unclaimed spoils) and server-side rank-up trial checks (`db.workoutLog.count({ where: { characterId } })`) are strictly isolated per character—ensuring newly created heroes start at `0` workouts counted toward their trials.
   * Public and Guild-only raid bosses with millions of HP. Athletes channel daily attack cooldowns and physical workout energy. End-of-week reward distributions scale by contribution tiers (**S**, **A**, **B**, **C**, **Participation**).

---

## 4. Current State of Implementation

```
                                  [Mobile App (Expo / Web)]
                                       │             │
               Offline Local-First     │             │ REST API / WebSockets
               (AsyncStorage/Filesystem)             ▼
                                       │     [Fastify Server (Node 20)]
                                       │             │
                                       │             ├─► [BullMQ Queues] ──► [Redis 7]
                                       │             │   (2h Gather, 24h Dungeon,
                                       ▼             ▼    24h Rest, 7d Raid)
                            [@goki/game-engine]  [Prisma ORM]
                            (Deterministic Math)     │
                                                     ▼
                                            [PostgreSQL 16 DB]
```

### Test Suite & Typecheck Health
* **Vitest Suite:** `15/15` test files passing in `packages/game-engine` (138 tests), `7/7` test files passing in `apps/server` (28 tests). Total: **22 test files, 166 passing tests, 0 failures**.
* **Playwright E2E Suite:** Automated end-to-end integration covering full-stack authentication, offline workout set logging, and background queue synchronization. Orchestrated via `playwright.config.ts` (multi-process web servers for Fastify and Expo Web), deterministic Prisma database seeding via `global-setup.ts`, and network route interception (`page.route()`) to simulate offline-to-online transitions.
* **TypeScript:** Strict typechecking passes cleanly across all 4 workspaces (`@goki/mobile`, `@goki/server`, `@goki/database`, `@goki/game-engine`).
* **Monorepo Build:** `npm run build` succeeds across all workspaces without bundling errors.

### Complete & Operational Subsystems
1. **Engine Layer (`packages/game-engine`):**
   * PR calculation, progressive overload tracking, and set RPE normalization (`workout-calculator.ts`).
   * 5-state Hybrid FSM, 1.25x arrival boon, resilience comeback logic, chest quality evaluator (`hybrid-reward-protocol.ts`).
   * Superset block definitions (A1/A2), set type metadata ([N], [W], [D], [F], [AMRAP]), 4 top-level workout categories (GYM, CARDIO, SPORT, RECOVERY), and 5 tailored starter presets (`workout-presets-rest.ts`).
   * Dynamic gathering cadence and stat affinity calculation (`gathering-calculator.ts`).
   * 10 stat-bound talent trees across all 7 holistic stats with 5-tier, 11-node bottom-up graphs totaling 55 talent points per tree (550 points total), active skills, keystones, and combat modifier aggregation (`talent-engine.ts`).
   * Procedural Itemization & 5-Tier Affix Engine with 32 base equippable items, 12 secondary combat prefixes, 10 primary stat suffixes, 32 Tier 5 Mythic Uniques with unique passives, and affix roll generators (`item-affix-engine.ts`, 9 unit tests).
   * 5 rank-gated 24-hour expeditions (`DEFAULT_DUNGEON_CATALOG`) covering Copper, Iron, Bronze, Silver, and Gold with boss-then-chest sequencing (Room $N-1$ Boss $\rightarrow$ Room $N$ Loot Chest), procedural drop scaling, and boss-tier odds on both final rooms (`auto-battler-sim.ts`).
   * 7-day raid contribution scoring and tier reward resolution (`raid-rewards.ts`).
   * Equipment stat bonus aggregation, requirement checking, and `characterId`-scoped offline workout queues & spoils receipts (`character-loadout-spoils.ts`).
   * Biometric telemetry verification, physiological sanity filtering (35–240 BPM), flatline variance checks, cardiovascular zone confidence scoring (`verifyTelemetry`), mind-body activity verification via OS cryptographic classification and stable heart rate variance (`verifyMindBodyTelemetry`), and recovery telemetry verification via sleep stage validation and pedometer step verification (`verifyRecoveryTelemetry`) (`ironman-verifier.ts`, 15 unit tests).
   * Training History, Progression Matrix, & Composable Prune/Wipe engine (`training-history-tracker.ts`, 33 unit tests): Pure deterministic progression evaluation featuring `calculateSetE1RM` (Epley formula with raw weight fallback at 0/1 reps), `selectSessionTopSet` (best e1RM candidate filtering zero-weight/rep entries), `computeProgressionDelta` (delta e1RM, weight, reps, single-set volume, and percentage gains against personal history), `buildTrainingHistoryMatrix` (multi-exercise progression mapping across chronologically sorted sessions), `evaluatePostWorkoutSummary` (evaluates lift progression, PRs, tonnage gains, or effort/streak sustaining dialogue to generate deterministic post-workout encouragement summaries), `filterWorkoutsForCharacter` / `countWorkoutsForCharacter` (scopes RPG workout progression to a specific `characterId` while preserving full global training history, plus silent `gymId` and `gymName` location tagging on `CompletedWorkoutRecord`), and composable history pruning (`doesWorkoutMatchPruneFilter`, `pruneTrainingHistory`, `rebuildHistoricalPRsFromWorkouts`) supporting multi-modifier filtering by time window (`ALL_TIME`, `LAST_24H`, `LAST_7D`, `LAST_30D`, `OLDER_THAN_30D`, `OLDER_THAN_90D`), gym location, workout modality, log source (`ONLINE`, `OFFLINE`, `SAMPLE_ONLY`), and per-exercise stripping vs. full session removal with automatic PR baseline recalculation.
   * Intra-Workout Ergonomics, Progressive Overload Coach, & Volume Landmarks engine (`intra-workout-ergonomics.ts`, 6 unit tests): Gym-scoped per-set `PREV` session lookup with global fallback (`resolvePreviousExerciseSessionSets`, `resolveGhostRowForSetOrder`, `formatCompactPrevPill`), RPE Double-Progression target calculator (`calculateProgressiveOverloadTarget` with `⚡ PR Crit` detection), configurable `1/2/3`-set ramped warm-up generator & commercial barbell/landmine plate breakdown (`generateConfigurableWarmupSets`, `calculateBarbellPlatesPerSide`), `KG ⇄ LBS` display conversion helpers (`convertKgToDisplayWeight`, `convertDisplayWeightToKg`), gym-scoped sticky setup notes and per-exercise weight unit preferences (`resolveExerciseStickyNote`, `upsertExerciseStickyNote`, `resolveExerciseWeightUnit`), 7-day muscle volume landmark aggregator (`calculateWeeklyMuscleVolumeLandmarks` across `MEV / MAV / MRV`, excluding `[W]` warm-up sets), and beginner-friendly `(i)` metric tooltip dictionary (`TRAINING_METRIC_TOOLTIPS`).
2. **Database & Persistence Layer (`packages/database`):**
   * Complete 1,034-line Prisma schema with 31 models and 26 enums for all domain entities.
   * Fully functional seed script (`seed.ts`) populating exercise catalog, 10 55-pt talent trees across all 7 stats, 32 base equippable items from `BASE_EQUIPPABLE_ITEMS`, gathering nodes, 5 rank-scaled expeditions, and 2 active weekly raids.
   * Soft-delete archival timestamp (`deletedAt`) on `Character` model supporting 30-day retention and restoration.
   * Configured with aligned `rootDir` and explicit export maps for seamless monorepo TypeScript/JavaScript compilation.
3. **Backend API & Queue Layer (`apps/server`):**
   * Fastify application with Zod validation on all workout, character, preset, dungeon, gathering, and raid routes.
   * Production JWT authentication and password hashing via `@fastify/jwt` and `bcryptjs` (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`), route protection with `requireAuth` middleware, and user context attachment.
   * **Dual-Character Account Constraint & Roster Routes (`/api/characters`):**
     * Strict account ceiling enforcing exactly 2 characters per user account: one for `STANDARD` mode (100% manual honesty) and one for `IRONMAN_VERIFIED` mode (wearable biometric verified).
     * `GET /api/characters` & `GET /api/characters/:id` (plus `/api/auth/login` and `/api/auth/me`): Protected endpoints returning active and archived characters belonging to the authenticated account, hydrated with per-character `inventoryItems` (including relational `item` definitions), 8-slot relational `equipmentLoadout`, `bountyCompletions`, and `_count.workoutLogs`.
     * `POST /api/characters`: Protected endpoint allowing users to forge their second hero in the complementary game mode, rejecting duplicate game modes (409) and rejecting creation when account capacity (2 heroes) is reached (400).
     * `PATCH /api/characters/:id`: Live character updates including cosmetic appearance switching (`appearanceId`).
     * `DELETE /api/characters/:id`: 30-day soft-delete archival setting `deletedAt = now()` or permanent erasure (`?permanent=true`).
     * `POST /api/characters/:id/restore`: Restores archived fallen heroes within the 30-day retention window.
   * **Character-Scoped Guild Bounties & Rank-Up Verification (`/api/characters/:characterId/bounties/:bountyId/complete`):**
     * Enforces both stat-level requirements (`STR`, `END`, `AGI`) and character-specific workout count requirements (`db.workoutLog.count({ where: { characterId } }) >= requirements.workoutsLogged`) before awarding reputation, gold, and Adventurer Rank promotions.
   * Procedural item metadata (`prefixId`, `suffixId`, `tier`, `uniquePassive`) preservation in `InventoryItem.itemMetadata` JSON upon inventory mutation.
   * Real-time bi-directional synchronization via `@fastify/websocket` and `websocketManager` with room multicasting (`raid:{raidId}`, `dungeon:{dungeonId}`), BigInt-safe serialization, and JWT connection authentication (`GET /api/ws/connect`).
   * Telemetry payload ingestion and server-side biometric re-verification routed dynamically across `verifyTelemetry`, `verifyMindBodyTelemetry`, and `verifyRecoveryTelemetry` on `POST /api/workouts`, setting hardware verification sources (`APPLE_HEALTHKIT`, `GOOGLE_HEALTH_CONNECT`, `WEARABLE_TELEMETRY`), tagging verified stat XP, and tagging verified mode.
   * Pre-serialization hook for converting `BigInt` (raid damage, HP) into JSON-compatible values.
   * Redis + BullMQ runtime with 4 active queues (`gathering-completion`, `dungeon-resolution`, `fatigue-transition`, `raid-rollover`) plus an in-memory no-op fallback for headless testing.
4. **Mobile & Web Client (`apps/mobile`):**
   * Multi-platform secure token persistence via Expo Secure Store (`expo-secure-store`) with web `localStorage` fallback, automatic JWT restoration on startup, and Bearer token injection on API requests.
   * **Full Parity Character Hydration, Dual-Scope Persistence, & Local Storage:**
     * `GameContext` hydrates the active character sheet (`characterName`, `stats`, `adventurerRank`, `adventurerReputation`, `gold`, `overallLevel`, `inventory`, `equipmentLoadout`, `unlockedTalentRanks`, `fatigueState`) directly from server responses (`/api/auth/me`, `/api/auth/login`, `/api/characters`, `/api/characters/:id`).
     * **Strict Per-Character Inventory & Equipment Loadout Isolation (`GameContext.tsx`, `offlineStorage.ts`):** `rawInventory` (`[]`) and `equipmentLoadout` (`EMPTY_EQUIPMENT_LOADOUT`) are strictly character-scoped and never fall back to `rawInventoryRef.current` or `equipmentLoadoutRef.current` across character switches or new hero creation. `applyCharacterToState` resolves inventory strictly from the target character (`char.inventory` $\rightarrow$ same-ID `existingLocal.inventory` $\rightarrow$ `mapServerInventoryItems(fullSheet?.character?.inventoryItems)` $\rightarrow$ `[]`), sanitizes 8-slot loadouts via `sanitizeEquipmentLoadout`, strips any equipped slot whose slug is not present in that hero's inventory, and `clearActiveCharacterState` resets inventory, loadout, talents, stats, and gold whenever the last active hero is deleted/archived or the user signs out.
     * Offline bundle persistence (`offlineStorage.ts`) snapshots the full `PersistedCharacterProfile` (including per-character `inventory`, `equipmentLoadout`, `workoutsLoggedCount`, `completedBountySlugs`, `consistencyStreak`, and `historicalPRs`) and `availableCharacters` to `goki_offline_bundle_v1.json` (`expo-file-system`), ensuring local RPG stat gains, material deductions (`startGatheringTask`), and character customization persist durably across restarts without cell/Wi-Fi connection.
     * **Dual-Scope Workout Persistence (`GameContext.tsx`, `TrainingHistoryScreen.tsx`):** Every completed workout (`CompletedWorkoutRecord`), offline sync payload (`QueuedOfflineWorkoutPayload`), and spoils receipt (`WorkoutSpoilsReceipt`) is tagged with the active `characterId`. Global `workoutHistory` permanently retains all historical sessions across character switches and deletions for the 3-mode **Training History** screen (`Matrix`, `By Exercise`, `Session Log`), while `workoutsLoggedCount`, `bounties` completion states, `consistencyStreak`, `historicalPRs`, and unclaimed spoils/queues are strictly isolated per character.
     * **Paired Bust/Standing Character Appearance Registry (`characterArtRegistry.ts`), Hall of Heroes Manager Modal (`CharacterManagerModal.tsx`), & Active Hero Hub Gating (`LandingScreen.tsx`, `App.tsx`):**
       * 10 paired 1:1 Bust Portrait and 2:3 Full-Body Standing PNG character appearances (`oni_warlord`, `dread_knight`, `oath_sentinel`, `wayfarer`, `northern_reaver`, `dusk_shinobi`, `blade_dancer`, `bastion_ironclad`, `sun_templar`, `void_walker`).
       * Appearance selection decoupled from archetype class, with live cosmetic appearance switching (`PATCH /api/characters/:id`).
       * Displays active and archived hero slots with live active status, level, rank, and gold, plus direct creation entry (`initialView="CREATE"`) with an inline Realm Game Mode (`Standard` vs `Ironman`) selector.
       * 30-Day Soft-Delete & Fallen Hero Archive Restoration (`DELETE /api/characters/:id`, `POST /api/characters/:id/restore`) with visual 30-day countdown timer pills and instant recovery.
       * **Active Hero Verification & World Entry Gating:** `GameContext` initializes `activeCharacterId` to `null` until a persisted or remote hero is loaded or forged (and `POST /api/auth/login` never auto-creates a placeholder hero when an account has zero active characters). When no active hero is created or selected (`!hasActiveHero`), `LandingScreen.tsx` hides the character portrait frame and displays a **No Active Hero Selected** panel with a `⚡ Forge Your Hero` CTA button that opens `CharacterManagerModal` directly into character creation, locks **Enter World** and **Online Workout** with `Hero Required` badges, and `AppRouter` (`App.tsx`) automatically redirects out of `WORLD` mode back to `LANDING` if the last active hero is deleted or signed out.
   * **40 Bespoke `1:1` Dark-Fantasy RPG Item Icon Pipeline & Registry (`itemArtRegistry.ts`, `assets/items/*.png`, `scripts/generate-layer-icons.mjs`):**
     * 40 bespoke `512x512` (`1:1`) Oni-style dark-fantasy PNG icons covering all 32 Base Equippable Items plus 8 Consumables & Crafting Materials (`vitality_elixir`, `berserker_draught`, `ironwood_stew`, `hearty_trail_rations`, `shadowsilk_spool`, `moonstone_crystal`, `void_essence_vial`, `obsidian_iron_ingot`).
     * `ITEM_ICON_REGISTRY`, `ITEM_ICON_ALIASES`, and `getItemIconSource()` provide instant, zero-overhead asset resolution across Paperdoll `58x58` slots, Satchel `44x44` rows, Pinned Bottom Tooltip `56x56` header, Post-Workout Spoils Receipt (`WorkoutLoggerScreen.tsx`), Gathering yield projections (`GatheringNodeScreen.tsx`), and Expedition Spoils Fanfare cards (`AutoBattlerArena.tsx`).
   * Real-time WebSocket synchronization via `GokiWebSocketClient` and `useWebSocket` hook featuring auto-reconnect logic with exponential backoff, room subscriptions, and instant live raid UI updates.
   * Hardware wearable integration via `UnifiedWearableService` interfacing with Apple HealthKit (`react-native-health`) and Google Health Connect (`react-native-health-connect`), featuring permission requests, live session BPM polling, intra-workout HUD metrics, fetching OS Activity Classifications, Sleep Stages (Core, Deep, REM, Awake), and Pedometer step data, and payload bundling into the sync queue.
   * High-fidelity audio and 2D sprite asset pipeline utilizing modern `expo-audio` for native sound playback and `expo-image` for hardware-accelerated sprite rendering, orchestrated by the `AudioManager` singleton with procedural synthesizer fallbacks, haptic-synchronized SFX via `sensoryFeedback.ts`, two-phase weapon strike impact sync and floating combat telemetry in `AutoBattlerArena.tsx` (wrapped by `AutoBattlerCanvas.tsx`), sprite sheet clipping and foot-row ground alignment in `SpriteAnimator.tsx` and `spriteManifest.ts`, seamless 6-layer background parallax in `ParallaxBackground.tsx`, dual-driver motion runtime in `reanimatedRuntime.ts`, and a persistent Gym Silence toggle in `CharacterProfileScreen.tsx`.
   * **Two-Stage Unified Rest Timer (`DynamicRestTimer.tsx`, `StaminaRingTimer.tsx`, `OfflineWorkoutScreen.tsx`, `WorkoutLoggerScreen.tsx`):**
     * **Stage 1 (Center-Screen Focus Overlay):** High-focus modal overlay (`rgba(10, 12, 18, 0.82)` backdrop) triggered on set log across both live hybrid dungeon and offline logging sessions. Features an SVG stamina ring countdown, elapsed-time-preserving interval controls (`-15s`, `+15s`, `+30s`, and quick-tap presets `1m`, `1.5m`, `2m`, `3m`, `4m` highlighting recommended rest duration), compact `(i)` physiological rationale tooltip toggle, and state-aware action buttons (`"View Workout / Minimize Timer"` + muted `"Skip Rest & Begin Next Set"` while counting down, transitioning automatically to emerald `"⚡ STAMINA FULL — BEGIN NEXT SET"` at `0:00` with somatic haptic and audio chime triggers).
     * **Stage 2 (Pinned Parallax Floating HUD Pill/Ring):** Anchored to the viewport header with scroll-reactive parallax depth (`scrollOffsetY`) when minimized or during ambient browsing. Displays a miniature SVG stamina ring, remaining countdown, emerald completion flash, and tap-to-expand gesture.
   * **Visual RPG Paperdoll Equipment Screen, 2–3–2 Hexagonal Stat Honeycomb, & Non-Blocking Scroll-Through Parallax Tooltip (`CharacterProfileScreen.tsx`):**
     * **Single-Row Utility Header Bar:** Cleanly deduplicated bar housing the Standard/Ironman roster pill, persistent SFX mute toggle, `Report Bug`, gated `🛠️ Dev Triage` (hidden by default for playtesters and unlocked via `EXPO_PUBLIC_ENABLE_DEV_TOOLS === 'true'`, an admin email check, or a secret 5-tap developer gesture on the `v0.2.0` version badge), and `Updates` with inline `v0.2.0` version pill.
     * **2–3–2 Pointy-Top Hexagonal Stat Honeycomb Grid:** Replaces rectangular stat cards with a centered 3-row SVG `<Polygon>` honeycomb (`AGI, DEX` on top; `STR, CON, END` in the middle; `SPR, WIS` on the bottom). Each `96x108` hexagon renders a dark track (`#141722`), inner border track (`#2A2F3D`), and a **glowing purple XP progress outline** (`stroke="#A855F7"`, outer glow `#C084FC`) proportional to `currentXp / xpToNextLevel`, stat glyph, 3-letter code, level, and gold `+N` unspent talent point badge, paired with a clean headerless Attribute Radar card (`height={210}`).
     * **True `2:3` Character Art Frame & Relocated Appearance (`🎨`) Button:** `CharacterPortraitFrame.tsx` (`variant="hero"`), `CharacterProfileScreen.tsx`, and `LandingScreen.tsx` constrain the standing hero frame to explicit `aspectRatio: 2 / 3` (`contentFit="cover"`, `contentPosition="top center"`), eliminating side pillarbox bars. The `🎨 Appearance` button (`testID="profile-customize-appearance-btn"`) is relocated off the artwork into the Paperdoll section header row next to the `⚡ Power {totalItemPower}` badge.
     * **Wide Full-Art Paperdoll with 58x58 Square Frames:** Dual-layer hero composition flanked by Left Column (Helm, Chest, Greaves, Boots) and Right Column (Main Hand, Off-Hand, Ring 1, Amulet 2) with uniform 58x58 px slot frames, rarity-colored glow borders, 1:1 bespoke icons, and `T1`–`T5` corner badges.
     * **6-Category Satchel Filter & Compact 58px Rows:** Filter satchel inventory into `All`, `Weapons`, `Armor`, `Accessories`, `Consumables`, and `Materials`. Rows are streamlined to sleek 58px rows (`[44x44 Icon + T1–T5 Badge] | Rolled Item Name + Rarity/Slot Subtitle | Stack Count / Status`) removing inline clutter.
     * **Non-Blocking Scroll-Through Parallax Item Tooltip:** Rendered as an absolute-positioned bottom `Animated.View` (`pointerEvents="box-none"`, `zIndex: 50`) with dynamic `paddingBottom: 420` on the background `ScrollView` and a scroll-linked `Animated.Value` (`scrollY`) parallax micro-shift (`tooltipParallaxY`). Displays full item breakdown upon slot or satchel selection: Base Armament Box, Prefix/Suffix affix pills, Tier 5 Unique Passive Box with gold badge and passive description, and Roman Numeral tier pill. Supports instant item switching on tap, toggle-off on re-tap, stationary background tap dismissal (`Math.hypot(dx, dy) < 6`), and an interactive Compare view with the equipped slot.
     * **Interactive Slot Inspector Modal:** Detailed inspection modal displaying equipped item stats, `Unequip` action, and compatible bag swap candidates.
   * **Interactive Bottom-Up Constellation Talent Tree (`TalentBuilderScreen.tsx`):**
     * **Sticky 7-Stat Horizontal Icon Selector Bar:** Sticky navigation strip (`STR | END | AGI | DEX | CON | WIS | SPR` using `STAT_GLYPH_SVGS`) with unspent talent point badges and compact single-row stat summary.
     * **5-Tier, 11-Node Inverted Graph:** Vertical flow climbing upward from Tier 1 Foundation (`y = 474`) to Tier 5 Apex Capstone (`y = 58`) via dynamic SVG Bezier connection curves, totaling 55 points per tree.
     * **Node Inspector Card:** Interactive bottom card displaying rank progression, stat modifiers, active skill details, and unlock requirements.
   * **5 Rank-Scaled Expeditions & Replay Arena (`DungeonScreen.tsx` & `AutoBattlerArena.tsx`):**
     * Rank-gated expedition selection covering Copper, Iron, Bronze, Silver, and Gold dungeons with decluttered headers.
     * Horizontal rank selector bar displaying expedition room counts, themes, bosses, and lock status.
     * **Boss-Then-Chest Sequence & Loot Fanfare:** Mob/hazard encounters precede the climax, the Boss Encounter (`roomType: 'BOSS'`) is always room `N - 1`, and the Treasure Cache (`roomType: 'LOOT_CHEST'`) is always final room `N`, both eligible for boss-tier item rolls.
     * **Interactive Expedition Spoils Fanfare Modal:** Auto-triggers at replay conclusion (or on `⏭ Skip to End`), featuring a Mythic Treasure Chest SVG, gold reward pill, interactive tap-to-unseal / flip loot cards (`"🔒 Tap to Unseal Spoils"` / `"✨ Reveal All"`), and a single primary `"✨ Claim Spoils & Complete Expedition"` CTA that closes the modal, claims rewards, and automatically dismisses the arena to return cleanly to the lobby (with `"🎁 Open Expedition Spoils Chest"` button remaining in the arena for log review).
   * **Streamlined Workout Flows & World UI Polish:**
     * **Readiness & 6-Column Intra-Workout Set Table (`WorkoutLoggerScreen.tsx` & `OfflineWorkoutScreen.tsx`):** Compact 4-row Pre-Flight Readiness Summary Card in `Idle` phase keeping the gold `⚔️ ENTER ...` CTA above the fold; 6-column intra-workout set logger (`SET (i) | PREV | KG/LBS | REPS | RPE (i) | ✓`) with compact 1-tap `PREV` copy pills (`75×8` + `@8.5`), ghost placeholders, and 1-tap `✓` (`DONE`) auto-fill when inputs are left blank; mid-workout `↑`/`↓` exercise block reordering, smart `⇄ ▼` exercise swap (preserving supersets and refreshing unit/ghost rows), and per-exercise `KG ⇄ LBS` toggle; consolidated `LootReview` phase with direct navigation banner to Talents and Paperdoll.
     * **Gym-Aware Tagging, Sticky Setup Notes, & Overload Coaching (`ExerciseStickyNoteRow.tsx`, `PlatesAndWarmupModal.tsx`, `MetricInfoTooltipModal.tsx`):** Silently tags workouts and drafts with `gymId` and `gymName` (`iron-sanctum`, `titan-foundry`, `home-outpost`, `open-world`), scoping `📌` setup notes, `KG/LBS` unit preferences, `PREV` lookups, and `🎯 Overload Target` Double-Progression pills to `[exerciseId + activeGymId]` with automatic cross-gym fallback (`↪ from <Other Gym>`) and 1-tap copy chips. Includes a unified `🧮 Plates / Warm-Up` modal (`20kg/45lb`, `15kg/35lb`, `10kg/25lb EZ/Smith`, `0kg Landmine` per-side plate breakdown + remembered `1 / 2 / 3 Set` `[W]` warm-up generator) and beginner-friendly `(i)` metric tooltips (`SET`, `RPE`, `e1RM`, `Overload Target`, `MEV/MAV/MRV`).
     * **Weekly Muscle Volume Landmarks, Composable History Prune/Wipe, & Shareable 9:16 RPG Receipt (`WeeklyVolumeLandmarksCard.tsx`, `WipeTrainingHistoryModal.tsx`, `ShareableWorkoutReceiptModal.tsx`, `TrainingHistoryScreen.tsx`):** Collapsible 6-muscle (`Chest`, `Back`, `Legs`, `Shoulders`, `Arms`, `Core`) 7-day working-set tracker (`[W]` warm-ups excluded) against `MEV / MAV / MRV` hypertrophy landmarks in `TrainingHistoryScreen.tsx`, composable `🧹 Wipe / Prune History` modal (`WipeTrainingHistoryModal.tsx`) with live impact preview and multi-modifier filtering (time window, gym location, modality, source, and per-exercise strip vs. session removal) plus 1-tap `🗑️` individual session deletion and automatic PR baseline rebuilding, and a `9:16` dark-fantasy Guild Raid / Sanctum receipt card with `📍` gym tag, `KG ⇄ LBS` toggle, top working sets + PR deltas, RPG stat XP/spoils footer, and native `Share.share` + web clipboard export across post-workout summaries and Session Log cards.
     * **Relocated Finish Workout Button & Zero-Clutter Canvas (`WorkoutLoggerScreen.tsx`):** Relocated the primary `Finish Workout` action button to the bottom of the workout logger where the preset button previously sat, and removed the inline save-preset button to eliminate distraction and cognitive clutter during active gym floor logging.
     * **Post-Workout Encouragement Pop-Up Modal (`PostWorkoutCelebrationModal.tsx` / `WorkoutLoggerScreen.tsx`):** High-impact celebratory modal that triggers upon workout completion, evaluating deterministic lift progression, personal records (PRs), tonnage gains, or effort/streak sustaining dialogue to provide encouraging narrative feedback.
     * **Embedded Session Routine Preset Creation:** Features an embedded `"💾 Save Session as Routine Preset"` CTA directly within the post-workout encouragement modal that seamlessly opens and pre-populates `PresetDesignerModal` with the session's completed exercise blocks, sets, and cardio segments.
     * **Relocated Layoff Simulation (`DeveloperTriageModal.tsx`):** Relocated the `"Simulate 96h Missed-Session Gap"` debug tool (`simulateLayoffHours(96)`) into the Developer Sanctum to test Tavern Well-Rested and comeback boosts without cluttering athlete profile views.
     * **Routine Designer & Activity Picker (`PresetDesignerModal.tsx` & `ActivityPickerModal.tsx`):** 90%-height bottom-sheet Routine Designer with sticky header/footer and compact ~54px 2-line exercise rows (displaying 9–10 visible exercises simultaneously).
     * **Gathering Duration Step Slider (`GatheringNodeScreen.tsx`):** Decluttered subheaders, 1:1 bespoke material icons, smooth interactive Horizontal Step Slider (`15m` to `120m` in `5m` increments) with `30m / 60m / 120m` quick-tap labels.
     * **Expedition & Workout Buff Banners (`DungeonScreen.tsx` & `AutoBattlerArena.tsx`):** Unified top-attached expedition status & live workout buff banner.
     * **Guild Boss Sprite Avatars (`GuildHallScreen.tsx` & `SpriteAnimator.tsx`):** Animated boss sprite avatars rendered alongside *Ignisrax* and *Vaelgor* HP bars. Features portrait-mode (`size={56}`) single-frame clipping and worklet-safe `useAnimatedStyle` dependency array (`[activeClip.frameCount, cellWidth]`) ensuring *Ignisrax* and *Vaelgor* render a crisp centered cropped `100x100` frame inside their `56x56` avatar boxes without off-center clipping or sprite sheet shrinking.
   * Real-time exercise search and filtering in `OfflineWorkoutScreen.tsx` with instant substring matching, active pill highlighting, and scroll containment.
   * Workout Category Gateway (`WorkoutCategoryGateway.tsx`) enabling athletes to select between Gym/Resistance, Cardio, Sport, and Active Recovery logging workflows.
   * Three top-level modes on Landing Screen:
     * **Quick Offline Workout:** Minimalist zero-HUD spreadsheet logger with zero latency, local storage persistence, set types, superset groupings, real-time exercise search filter, and automatic queueing for deferred RPG spoils sync.
     * **Enter Dungeon (Live Hybrid):** Recommended full 5-state RPG boss encounter + 6-column workout logger with dynamic rest timer, stamina ring, live BPM wearable HUD, focus lock, and local resilience that survives signal drops.
     * **Enter World:** Complete RPG navigation hub featuring a 7-Stat UI overhaul in the Character Profile (displaying STR, END, AGI, DEX, CON, WIS, SPR with levels and XP progress bars), dynamic multi-stat XP receipts in post-workout summaries, TalentBuilder across all 10 trees, GatheringNode, Dungeon, and GuildHall.
   * Low-latency (<15ms) haptic feedback (iOS/Android) and Web Audio harmonic synth fallback (Web).
   * Local push notifications for rest timer completion and gathering node capacity.
   * Visual 2D auto-battler combat replay arena (`AutoBattlerArena.tsx`, with backward-compatible re-export in `AutoBattlerCanvas.tsx`).

---

## 5. Future Roadmap & Expansion Vectors

With core mechanics, authentication, WebSockets, wearable Ironman telemetry, audio/visual pipelines, Playwright E2E verification, and initial remote deployment infrastructure (Render + EAS) fully established, the following areas represent vectors for post-V1.0 expansion:

### 1. Guild vs. Guild Competitions
* **Vision:** Cross-guild competitive seasons where multiple adventurer factions channel collective physical volume into asynchronous territory control and shared boss race leaderboards, complete with guild sanctum buffs, guildhall banner trophies, and seasonal mythic relics.

### 2. Wearable HR Telemetry during Live Combat
* **Vision:** Real-time bi-directional streaming of biometric heart rate zones during 2D auto-battler raids and live boss encounters. Elevating into Zone 4/5 during physical training dynamically charges in-combat rage, mana regeneration, or party shields, creating true physical-to-virtual synchronized combat.

### 3. Remote Push Notification Engine Expansion
* **Vision:** Scale the Expo local notification scheduler with remote APNs / FCM push triggers, alerting athletes when 24h dungeon expedition windows open, when idle gathering nodes reach maximum capacity, or when guildmates request assistance on a live raid boss.

### 4. Cryptographic Ironman Geofencing & GPS Anti-Spoofing
* **Vision:** Hardware-verified gym location attestation via device geofencing, cell tower triangulation heuristics, and anti-spoofing checks to guarantee that Ironman participants log workouts inside sanctioned athletic facilities.

### 5. Social Feed & Athlete Activity Streams
* **Vision:** Real-time feed of guildmate achievements, personal record (PR) breaks, rare dungeon loot drops, and interactive celebration cheers/emotes.

---

## 6. Key File & Symbol Index

* **Deployment, Cloud Infrastructure, & Asset Pipelines:**
  * [`render.yaml`](./render.yaml) — Render Pro Workspace blueprint orchestrating paid, always-on instances for Managed PostgreSQL 16 (`goki-postgres`), Managed Redis 7 (`goki-redis` with `noeviction`), and the Fastify API web service (`goki-server`).
  * [`apps/mobile/eas.json`](./apps/mobile/eas.json) — Expo Application Services (EAS) build profiles for standalone Android APK and iOS preview distributions.
  * [`apps/mobile/app.json`](./apps/mobile/app.json) — Expo native configuration (`v0.2.0`), HealthKit / Health Connect permissions, `expo-build-properties` (`minSdkVersion: 26`, Proguard disabled).
  * [`scripts/generate-layer-icons.mjs`](./scripts/generate-layer-icons.mjs) — Standalone generation and asset processing script connecting to Layer.ai MCP for batch 1:1 dark fantasy RPG icon synthesis.
* **Game Engine Core:**
  * [`packages/game-engine/src/item-affix-engine.ts`](./packages/game-engine/src/item-affix-engine.ts) — Procedural Itemization & 5-Tier Affix Engine: 32 base equippable items, 12 prefixes, 10 suffixes, 32 T5 Mythic Uniques with passives, affix scaling, and equipment modifier aggregation.
  * [`packages/game-engine/src/hybrid-reward-protocol.ts`](./packages/game-engine/src/hybrid-reward-protocol.ts) — 5-state FSM, 1.25x arrival boon, chest scoring, resilience logic.
  * [`packages/game-engine/src/workout-calculator.ts`](./packages/game-engine/src/workout-calculator.ts) — e1RM formulas, PR criteria, XP calculations across all 7 holistic stats.
  * [`packages/game-engine/src/workout-presets-rest.ts`](./packages/game-engine/src/workout-presets-rest.ts) — Superset groupings, set type badges, workout categories, starter presets, dynamic rest intervals.
  * [`packages/game-engine/src/auto-battler-sim.ts`](./packages/game-engine/src/auto-battler-sim.ts) — Tick-by-tick deterministic dungeon simulator, combat replay engine, and 5 rank-gated 24h expeditions (Obsidian Catacombs, Bloodfang Warcamp, Traitors' Garrison, Blighted Ossuary, Hellforge Sanctum) with boss-then-chest ordering (Room $N-1$ Boss $\rightarrow$ Room $N$ Loot Chest) and dual boss-tier loot roll eligibility.
  * [`packages/game-engine/src/gathering-calculator.ts`](./packages/game-engine/src/gathering-calculator.ts) — Stat-affinity gathering cadence and yield formulas.
  * [`packages/game-engine/src/talent-engine.ts`](./packages/game-engine/src/talent-engine.ts) — 10 stat-bound talent trees across 7 stats, 5-tier 11-node bottom-up graphs totaling 55 pts/tree, active skills, keystones, and combat modifier aggregation.
  * [`packages/game-engine/src/fatigue-manager.ts`](./packages/game-engine/src/fatigue-manager.ts) — Systemic fatigue penalties, tavern rest transitions, active recovery buffs.
  * [`packages/game-engine/src/ironman-verifier.ts`](./packages/game-engine/src/ironman-verifier.ts) — Pure telemetry verification function, physiological anomaly detection, and confidence scoring (15 unit tests).
  * [`packages/game-engine/src/character-loadout-spoils.ts`](./packages/game-engine/src/character-loadout-spoils.ts) — Equipment loadout stat aggregation, requirement checks, and `characterId`-scoped offline workout queues & spoils receipt consolidation.
  * [`packages/game-engine/src/training-history-tracker.ts`](./packages/game-engine/src/training-history-tracker.ts) — Training History, Progression Matrix, & Composable Prune/Wipe engine: e1RM formulas, top set selection, progression deltas, multi-exercise history matrices, deterministic post-workout encouragement summaries, silent `gymId`/`gymName` tagging, `filterWorkoutsForCharacter` / `countWorkoutsForCharacter` character progression scoping, and composable history pruning (`doesWorkoutMatchPruneFilter`, `pruneTrainingHistory`, `rebuildHistoricalPRsFromWorkouts`) (33 unit tests).
  * [`packages/game-engine/src/intra-workout-ergonomics.ts`](./packages/game-engine/src/intra-workout-ergonomics.ts) — Gym-aware per-set `PREV` lookup, RPE Double-Progression overload coach, configurable `1/2/3`-set warm-up & barbell/landmine plate breakdown math, `KG ⇄ LBS` unit conversion, gym-scoped sticky notes, 7-day `MEV/MAV/MRV` muscle volume landmark aggregator, and `(i)` metric tooltip dictionary (6 unit tests).
* **Database & Server:**
  * [`packages/database/prisma/schema.prisma`](./packages/database/prisma/schema.prisma) — Complete PostgreSQL schema definition (31 models, 26 enums, 1,034 lines).
  * [`packages/database/prisma/seed.ts`](./packages/database/prisma/seed.ts) — Exercises, starter presets, 10 talent trees, starter items, 24h dungeon, and 7d raids.
  * [`apps/server/src/index.ts`](./apps/server/src/index.ts) — Fastify server entrypoint with cloud-ready `0.0.0.0` binding and dynamic port configuration.
  * [`apps/server/src/app.ts`](./apps/server/src/app.ts) — Fastify instance builder, error handlers, JWT authentication, WebSockets, BigInt serialization hooks.
  * [`apps/server/src/middleware/auth.ts`](./apps/server/src/middleware/auth.ts) — JWT validation (`requireAuth`, `optionalAuth`) and admin route protection (`requireAdmin` via `ADMIN_EMAILS`).
  * [`apps/server/src/routes/auth.ts`](./apps/server/src/routes/auth.ts) — Registration, login, and profile resolution.
  * [`apps/server/src/routes/characters.ts`](./apps/server/src/routes/characters.ts) — Dual-character roster routes (`STANDARD` vs `IRONMAN_VERIFIED`), 30-day soft-delete archival & restoration, permanent erasure, and hydration of per-character `inventoryItems`, relational `equipmentLoadout`, `bountyCompletions`, and `_count.workoutLogs`.
  * [`apps/server/src/routes/guilds-raids.ts`](./apps/server/src/routes/guilds-raids.ts) — Guild bounties, character-scoped Rank-Up Trial verification (`workoutsLogged` count per `characterId`), and 7-day Raid Boss attacks.
  * [`apps/server/src/routes/workouts.ts`](./apps/server/src/routes/workouts.ts) — Workout submission, telemetry validation (`verifyTelemetry`, `verifyMindBodyTelemetry`, `verifyRecoveryTelemetry`), and character progression.
  * [`apps/server/src/services/websocket-manager.ts`](./apps/server/src/services/websocket-manager.ts) — Room-based connection manager and BigInt-safe pubsub broadcaster.
  * [`apps/server/src/routes/websocket.ts`](./apps/server/src/routes/websocket.ts) — Real-time WebSocket connection route with JWT authentication.
  * [`apps/server/src/queues/bullmq-workers.ts`](./apps/server/src/queues/bullmq-workers.ts) — Redis and BullMQ async worker scheduler.
* **Mobile Client:**
  * [`apps/mobile/App.tsx`](./apps/mobile/App.tsx) — Top-level shell, overhauled HUD with aesthetic Japanese Oni `TopMenuBorderArt` header offset, centered circular character portrait medallion with Lv and spoils indicators (tapping routes to Character Profile), right-aligned gold and instant transit dropdown menu, intra-workout focus lock banner, and streamlined 5-tab bottom navigation (`Workout`, `Talents`, `Artisan`, `Expeditions`, `Guild`).
  * [`apps/mobile/src/components/TopMenuBorderArt.tsx`](./apps/mobile/src/components/TopMenuBorderArt.tsx) — Dark fantasy Japanese Oni architectural SVG trim providing an ornamental header cushion protecting HUD elements and update banners from screen notches and bezels.
  * [`apps/mobile/src/assets/characterArtRegistry.ts`](./apps/mobile/src/assets/characterArtRegistry.ts) — Paired character appearance registry housing 10 paired 1:1 Bust Portraits and 2:3 Full-Body Standing PNG character artworks, display metadata, and archetype presets.
  * [`apps/mobile/src/assets/itemArtRegistry.ts`](./apps/mobile/src/assets/itemArtRegistry.ts) — Bespoke 1:1 Dark-Fantasy RPG item artwork registry mapping 40 512x512 Oni-style PNG icons across all 32 base equipment items plus 8 consumables and crafting materials, providing instant resolution via `getItemIconSource()`.
  * [`apps/mobile/src/components/CharacterManagerModal.tsx`](./apps/mobile/src/components/CharacterManagerModal.tsx) — Hall of Heroes manager modal: archetype-decoupled appearance selection, live appearance switching, dual-hero management (Standard vs. Ironman), and 30-day soft-delete fallen hero archive restoration.
  * [`apps/mobile/src/components/CharacterPortraitFrame.tsx`](./apps/mobile/src/components/CharacterPortraitFrame.tsx) — Multi-variant character frame supporting full hero frame with explicit 2:3 aspect ratio (eliminating side pillarbox bars via edge-to-edge cover layout), rounded avatar, and circular HUD medallion with active golden aura.
  * [`apps/mobile/src/components/UpdateBanner.tsx`](./apps/mobile/src/components/UpdateBanner.tsx) — OTA and binary update banner with dynamic `useSafeAreaInsets` top offset and expanded 44px+ hit targets on the restart action button.
  * [`apps/mobile/src/api/apiClient.ts`](./apps/mobile/src/api/apiClient.ts) — Dynamic API URL resolution (`resolveApiBaseUrl`) with automatic Bearer token injection.
  * [`apps/mobile/src/api/tokenStorage.ts`](./apps/mobile/src/api/tokenStorage.ts) — Multi-platform secure token persistence.
  * [`apps/mobile/src/api/websocketClient.ts`](./apps/mobile/src/api/websocketClient.ts) — Cross-platform WebSocket client with dynamic URL resolution (`resolveWsBaseUrl`), auto-reconnect, and room subscriptions.
  * [`apps/mobile/src/hooks/useWebSocket.ts`](./apps/mobile/src/hooks/useWebSocket.ts) — Declarative React hook for room-based synchronization.
  * [`apps/mobile/src/services/wearableTelemetry.ts`](./apps/mobile/src/services/wearableTelemetry.ts) — Unified wearable telemetry abstraction for Apple HealthKit and Google Health Connect.
  * [`apps/mobile/src/services/AudioManager.ts`](./apps/mobile/src/services/AudioManager.ts) — Cross-platform audio manager with `expo-audio`, sound presets, procedural synthesis fallback, and gym silence mute persistence.
  * [`apps/mobile/assets/sprites/index.ts`](./apps/mobile/assets/sprites/index.ts) — 2D sprite asset registry supporting drop-in PNG/WebP files and vector data URIs for heroes, enemies, and loot chests.
  * [`apps/mobile/src/utils/sensoryFeedback.ts`](./apps/mobile/src/utils/sensoryFeedback.ts) — Low-latency somatic haptics combined with `AudioManager` SFX cues.
  * [`apps/mobile/src/utils/restNotificationScheduler.ts`](./apps/mobile/src/utils/restNotificationScheduler.ts) — Unified single-slot lockscreen/background rest timer notification scheduler (`scheduleRestNotification`, `cancelRestNotification`) with Android `MAX`-importance haptic vibration channel.
  * [`apps/mobile/src/utils/offlineStorage.ts`](./apps/mobile/src/utils/offlineStorage.ts) — Local file-system and `localStorage` persistence bundle storing global `workoutHistory` (initialized to a clean `[]` slate for new playtesters) alongside per-character `PersistedCharacterProfile` state (`inventory`, `equipmentLoadout`, `workoutsLoggedCount`, `completedBountySlugs`, `consistencyStreak`, `historicalPRs`).
  * [`apps/mobile/src/state/GameContext.tsx`](./apps/mobile/src/state/GameContext.tsx) — Monolithic state manager coordinating local engine fallback, strict per-character inventory & 8-slot equipment loadout isolation (`EMPTY_EQUIPMENT_LOADOUT`, `sanitizeEquipmentLoadout`, `mapServerInventoryItems`, `clearActiveCharacterState`), character-scoped workout progression & guild bounties, clean `[]` initial training history slate for new installs, offline sync queue, server API calls, procedural gear drops, and aggregated equipment combat modifiers.
  * [`apps/mobile/src/screens/LandingScreen.tsx`](./apps/mobile/src/screens/LandingScreen.tsx) — Main Hub landing screen with active hero verification, conditional 2:3 full-body hero portrait vs. **No Active Hero Selected** creation gateway (`⚡ Forge Your Hero`), `Hero Required` locks on **Enter Dungeon (Live Hybrid)** and **Enter World**, clarified playtester workout mode subtitles (**Enter Dungeon (Live Hybrid)** vs. **Quick Offline Workout**), and unclaimed spoils badges.
  * [`apps/mobile/src/screens/TrainingHistoryScreen.tsx`](./apps/mobile/src/screens/TrainingHistoryScreen.tsx) — 3-mode global Training History hub (`Matrix`, `By Exercise`, `Session Log`) displaying all historical workouts across characters, routine scopes, 7-day `MEV/MAV/MRV` muscle volume landmarks, e1RM progression sparklines, PR badges, `9:16` receipt cards, and composable history pruning (`WipeTrainingHistoryModal`).
  * [`apps/mobile/src/components/WipeTrainingHistoryModal.tsx`](./apps/mobile/src/components/WipeTrainingHistoryModal.tsx) — Composable training history wipe/prune modal with live impact preview, multi-modifier filters (time window, gym, modality, source, exercise strip vs. session removal), 2-step armed confirmation, and demo sample restoration.
  * [`apps/mobile/src/screens/WorkoutLoggerScreen.tsx`](./apps/mobile/src/screens/WorkoutLoggerScreen.tsx) — Live hybrid workout interface featuring a compact 4-row Pre-Flight Readiness Summary in `Idle`, 6-column `SET | PREV | KG/LBS | REPS | RPE | ✓` intra-workout set table with ghost placeholders and 1-tap `✓` auto-fill, `🎯 Overload Target` pill, `🧮 Plates / Warm-Up` helper, gym-aware sticky notes, mid-workout `↑`/`↓` reorder & swap, two-stage dynamic rest timer, boss encounter damage, and consolidated `LootReview` phase with `9:16` receipt export.
  * [`apps/mobile/src/screens/OfflineWorkoutScreen.tsx`](./apps/mobile/src/screens/OfflineWorkoutScreen.tsx) — Local-first standalone logger with instant local storage persistence, `📍` gym switcher, 6-column `PREV` & ghost-fill set table, `🎯 Overload Target` pill, `🧮 Plates / Warm-Up` sheet, `KG ⇄ LBS` toggle, and integrated two-stage dynamic rest timer with elapsed-time preservation.
  * [`apps/mobile/src/components/ExerciseStickyNoteRow.tsx`](./apps/mobile/src/components/ExerciseStickyNoteRow.tsx) — Inline `📌` per-exercise setup note editor scoped to `[exerciseId + activeGymId]` with automatic cross-gym fallback and 1-tap copy chips.
  * [`apps/mobile/src/components/PlatesAndWarmupModal.tsx`](./apps/mobile/src/components/PlatesAndWarmupModal.tsx) — Unified `🧮 Plates & Warm-Up` modal with per-side plate breakdown (`20kg/45lb`, `15kg/35lb`, `10kg/25lb EZ/Smith`, `0kg Landmine`) and remembered `1 / 2 / 3 Set` `[W]` warm-up generator.
  * [`apps/mobile/src/components/MetricInfoTooltipModal.tsx`](./apps/mobile/src/components/MetricInfoTooltipModal.tsx) — Beginner-friendly `(i)` badge (`MetricInfoBadge`) and tooltip modal explaining `SET`, `RPE`, `RIR`, `e1RM`, `Overload Target`, and `MEV/MAV/MRV` with RPG tie-ins.
  * [`apps/mobile/src/components/WeeklyVolumeLandmarksCard.tsx`](./apps/mobile/src/components/WeeklyVolumeLandmarksCard.tsx) — Collapsible 6-muscle 7-day working-set tracker (`[W]` warm-ups excluded) with `MEV / MAV / MRV` progress bars and deload watch indicators.
  * [`apps/mobile/src/components/ShareableWorkoutReceiptModal.tsx`](./apps/mobile/src/components/ShareableWorkoutReceiptModal.tsx) — Shareable `9:16` Guild Raid / Sanctum receipt card with `KG ⇄ LBS` toggle, top working sets + PR deltas, RPG stat XP footer, and native `Share.share` + web clipboard export.
  * [`apps/mobile/src/screens/CharacterProfileScreen.tsx`](./apps/mobile/src/screens/CharacterProfileScreen.tsx) — 7-stat progression HUD with 2–3–2 pointy-top SVG hexagonal honeycomb grid and purple XP glow, true 2:3 full-art paperdoll frame with relocated Appearance button, 58x58 square equipment slot frames with T1–T5 badges, compact 58px satchel rows, non-blocking scroll-through parallax bottom tooltip, and interactive Slot Inspector modal.
  * [`apps/mobile/src/screens/TalentBuilderScreen.tsx`](./apps/mobile/src/screens/TalentBuilderScreen.tsx) — Interactive 5-tier 11-node inverted bottom-up constellation talent tree (Tier 1 Foundation at y = 474 climbing to Tier 5 Apex Capstone at y = 58) across 10 trees (55 pts/tree), sticky stat selector bar, SVG bezier dependency lines, and bottom Node Inspector card.
  * [`apps/mobile/src/components/DynamicRestTimer.tsx`](./apps/mobile/src/components/DynamicRestTimer.tsx) & [`StaminaRingTimer.tsx`](./apps/mobile/src/components/StaminaRingTimer.tsx) — Two-stage rest timer: Stage 1 center-screen focus overlay (`rgba(10, 12, 18, 0.82)`) with preset selector, rationale tooltip toggle, and state-aware action buttons; Stage 2 pinned parallax floating HUD pill/ring with scroll-reactive depth (`scrollOffsetY`) and tap-to-expand.
  * [`apps/mobile/src/screens/Battle/AutoBattlerArena.tsx`](./apps/mobile/src/screens/Battle/AutoBattlerArena.tsx) — 2D multi-layer parallax & sprite auto-battler arena with two-phase strike synchronization, multi-unit formations, interactive Expedition Spoils Fanfare Modal with tap-to-unseal flip loot cards, and single Claim-and-Complete expedition flow.
  * [`apps/mobile/src/components/AutoBattlerCanvas.tsx`](./apps/mobile/src/components/AutoBattlerCanvas.tsx) — Backward-compatible wrapper forwarding props directly to `AutoBattlerArena`.
  * [`apps/mobile/src/components/battle/reanimatedRuntime.ts`](./apps/mobile/src/components/battle/reanimatedRuntime.ts) — Runtime TurboModule guard and dual-driver motion adapter (`react-native-reanimated` UI-thread driver + 60 FPS `RNAnimated` native-driver fallback).
  * [`apps/mobile/src/components/battle/background/ParallaxBackground.tsx`](./apps/mobile/src/components/battle/background/ParallaxBackground.tsx) & [`ParallaxLayer.tsx`](./apps/mobile/src/components/battle/background/ParallaxLayer.tsx) — Seamless 6-layer twin-strip parallax renderer with `marching`, `combat`, and `paused` scroll modes.
  * [`apps/mobile/src/components/battle/sprites/SpriteAnimator.tsx`](./apps/mobile/src/components/battle/sprites/SpriteAnimator.tsx) & [`spriteManifest.ts`](./apps/mobile/src/components/battle/sprites/spriteManifest.ts) — 100×100 px hardware-accelerated sprite sheet slicer, worklet-safe animated style dependencies, portrait-mode (size=56) single-frame centering, foot-row baseline alignment, and attackImpactFrame manifest.
  * [`apps/mobile/src/components/PresetDesignerModal.tsx`](./apps/mobile/src/components/PresetDesignerModal.tsx) & [`ActivityPickerModal.tsx`](./apps/mobile/src/components/ActivityPickerModal.tsx) — 90%-height bottom-sheet Routine Designer and exercise selector with sticky header/footer and compact ~54px 2-line exercise rows (displaying 9–10 visible exercises simultaneously).
  * [`apps/mobile/src/components/PostWorkoutCelebrationModal.tsx`](./apps/mobile/src/components/PostWorkoutCelebrationModal.tsx) — Post-workout encouragement pop-up modal displaying deterministic lift progression callouts, PR breaks, streak sustaining dialogue, and embedded routine preset saving.
  * [`apps/mobile/src/components/DeveloperTriageModal.tsx`](./apps/mobile/src/components/DeveloperTriageModal.tsx) — In-app diagnostics and developer sanctum connecting to `/api/diagnostics/reports` (gated by `EXPO_PUBLIC_ENABLE_DEV_TOOLS`, admin email check, or 5-tap version badge unlock gesture), featuring multi-dimensional status/severity/type filters, triage actions, demo sample workout restoration, and the relocated 96h missed-session gap debug simulator (`simulateLayoffHours(96)`).
  * [`apps/mobile/src/screens/GatheringNodeScreen.tsx`](./apps/mobile/src/screens/GatheringNodeScreen.tsx) — Idle gathering screen with decluttered subheaders, 1:1 material item icons, interactive Horizontal Step Slider (15m to 120m in 5m increments), and quick-tap duration labels (30m, 60m, 120m).
  * [`apps/mobile/src/screens/DungeonScreen.tsx`](./apps/mobile/src/screens/DungeonScreen.tsx) — 24-hour dungeon expeditions across 5 rank-gated tiers with boss-then-chest sequence (N-1 Boss $\rightarrow$ N Loot Cache), horizontal rank selector bar, uncluttered header, and streamlined battle replay player.
  * [`apps/mobile/src/screens/GuildHallScreen.tsx`](./apps/mobile/src/screens/GuildHallScreen.tsx) — Guild hub and weekly raid sanctum featuring crisp 56x56 cropped boss sprite avatars (SpriteAnimator with DEMON_BOSS_SPRITE_CONFIG and GREATSWORD_SKELETON_SPRITE_CONFIG) alongside Ignisrax and Vaelgor HP bars.
  * [`apps/mobile/src/assets/v0Vault.ts`](./apps/mobile/src/assets/v0Vault.ts) — Vector SVG asset registry including Japanese Oni header trim (`ONI_HEADER_SVG`), 8-slot equipment paperdoll silhouette (`CHARACTER_SILHOUETTE_SVG`), 7-stat glyphs (`STAT_GLYPH_SVGS`), and constellation background art (`HUD_SVGS.talentTreeConstellation`).
  * [`apps/mobile/src/components/WorkoutCategoryGateway.tsx`](./apps/mobile/src/components/WorkoutCategoryGateway.tsx) — Gateway selector routing workouts into GYM, CARDIO, SPORT, or RECOVERY modalities.
* **E2E Testing & Orchestration:**
  * [`playwright.config.ts`](./playwright.config.ts) — Monorepo E2E web server orchestration (Fastify + Expo Web).
  * [`e2e/global-setup.ts`](./e2e/global-setup.ts) — Deterministic test database seeding and environment verification.
  * [`e2e/auth.spec.ts`](./e2e/auth.spec.ts) — Full-stack authentication journey and token storage verification.
  * [`e2e/workout-sync.spec.ts`](./e2e/workout-sync.spec.ts) — Offline-first loop, rest timers, and background sync queue verification.

---

## 7. Deployment & Infrastructure

```
                   +-------------------------------------------------+
                   |           Mobile Clients (Production)           |
                   |   - Android Standalone APK (EAS preview v0.2.0) |
                   |   - iOS Simulator / Ad-Hoc Build (EAS preview)  |
                   |   - Web SPA Client (Expo Web / Static Hosting)  |
                   +-----------------------+-------------------------+
                                           |
                                HTTPS / WSS API Requests
                        (EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WS_URL)
                                           |
                                           v
       +-------------------------------------------------------------------------+
       |               Render Cloud Platform (Render Pro Workspace)              |
       |                              (render.yaml)                              |
       |                                                                         |
       |   +-----------------------------------------------------------------+   |
       |   |                     Fastify Web Service                         |   |
       |   |                      (goki-server)                            |   |
       |   |   - Node.js Runtime (Node >= 20.0, Paid Always-On Instance)     |   |
       |   |   - Bound to 0.0.0.0:${PORT}                                    |   |
       |   |   - Build: npm install --include=dev && npx prisma generate --schema=./packages/database/prisma/schema.prisma && npm run build |   |
       |   |   - Start: npm start --workspace=@goki/server                 |   |
       |   |   - Injected Env: DATABASE_URL, REDIS_URL, NODE_ENV=production   |   |
       |   +--------------------+-----------------------+--------------------+   |
       |                        |                       |                        |
       |             Prisma ORM |                       | BullMQ Redis Client    |
       |                        v                       v                        |
       |   +----------------------------+   +--------------------------------+   |
       |   |    PostgreSQL Database     |   |       Redis Key-Value          |   |
       |   |     (goki-postgres)      |   |        (goki-redis)          |   |
       |   | - Managed PostgreSQL 16    |   | - Managed Redis 7              |   |
       |   | - 31 Models, 26 Enums      |   | - MaxMemory: noeviction        |   |
       |   | - Internal Connection URI  |   | - 4 Scheduled Worker Queues    |   |
       |   | - Paid Always-On Instance  |   | - Paid Always-On Instance      |   |
       |   +----------------------------+   +--------------------------------+   |
       +-------------------------------------------------------------------------+
```

### A. Backend Deployment: Render Blueprint (`render.yaml`)

The backend is declaratively configured via the repository root [`render.yaml`](./render.yaml) Blueprint and deployed in our **Render Pro Workspace** running paid, always-on instances:

1. **PostgreSQL Database (`goki-postgres`):**
   * Managed PostgreSQL 16 database running on a paid, always-on Render Pro instance with internal network isolation.
   * Auto-provisions the database connection string and injects `DATABASE_URL` directly into the Fastify Web Service.
2. **Redis Service (`goki-redis`):**
   * Managed Redis 7 instance running on a paid, always-on Render Pro instance dedicated to BullMQ async queue workers (`gathering-completion`, `dungeon-resolution`, `fatigue-transition`, `raid-rollover`).
   * Configured with `maxmemoryPolicy: noeviction` to ensure BullMQ delayed jobs and repeatable timers are never prematurely evicted under memory pressure.
   * Connection string is automatically injected as `REDIS_URL`.
3. **Fastify Node.js Web Service (`goki-server`):**
   * **Plan:** Paid, always-on Render Pro instance (zero cold-start spin-down latency).
   * **Build Command:** `npm install --include=dev && npx prisma generate --schema=./packages/database/prisma/schema.prisma && npm run build` (installs devDependencies in production, generates Prisma client, and compiles all workspaces).
   * **Start Command:** `npx prisma db push --schema=./packages/database/prisma/schema.prisma && npm start --workspace=@goki/server` (applies schema migrations and launches `dist/index.js`).
   * **Network Binding:** Binds explicitly to `host: '0.0.0.0'` and dynamic port `port: Number(process.env.PORT) || 4000` to satisfy Render cloud ingress routing.
   * **Injected Environment:**
     * `NODE_ENV: production`
     * `DATABASE_URL`: Injected from `goki-postgres` connection string.
     * `REDIS_URL`: Injected from `goki-redis` connection string.
     * `JWT_SECRET`: Cryptographically generated via Render `generateValue: true`.
     * `CORS_ORIGIN: "*"` (supports both mobile clients and web clients).
     * `DIAGNOSTICS_WEBHOOK_URL`: Connected to our dedicated `#bug-reports` Discord server channel for real-time playtester alerts.
     * `ADMIN_EMAILS`: Optional comma-separated list of developer emails permitted to query/mutate `/api/diagnostics/reports` in production.
     * `APP_LATEST_VERSION: "0.2.0"` & `APP_MIN_REQUIRED_VERSION: "0.1.0"` (keeping `minRequiredVersion` at `"0.1.0"` so existing `0.1.0` standalone APKs receive `v0.2.0` seamlessly via OTA without a forced binary download prompt).

### B. Mobile Client Deployment: Expo Application Services (`eas.json`)

Mobile builds are automated and configured using [`apps/mobile/eas.json`](./apps/mobile/eas.json) to facilitate frictionless direct distribution to friends and playtesters:

1. **Standalone Android APK Distribution:**
   * Configured with `"android": { "buildType": "apk" }` under the `preview` profile.
   * Compiles an installable `.apk` binary rather than a Google Play App Bundle (`.aab`), enabling direct sideloading and file sharing via Discord/Telegram/Drive without Google Play Console review delays.
   * Configured with `minSdkVersion: 26` via `expo-build-properties` to satisfy Google Health Connect SDK requirements.
   * Configured with `enableProguardInReleaseBuilds: false` to avoid R8 minification stripping Health Connect and Expo reflection classes during release compilation.
   * Pre-build lifecycle hook (`"eas-build-pre-build": "cd ../../ && npm run build --workspace=@goki/game-engine"`) compiles the pure engine bundle prior to Metro bundle packaging.
2. **iOS Testing & Ad-Hoc Builds:**
   * Configured with `"ios": { "simulator": true }` for local iOS Simulator verification on macOS without requiring Apple Developer Program membership.
   * Ready for internal ad-hoc distribution via Apple Developer ad-hoc provisioning profiles.
3. **Dynamic Remote Environment Resolution:**
   * `eas.json` injects `EXPO_PUBLIC_API_URL` pointing to the Render web service URL (`https://goki-server.onrender.com`).
   * [`apiClient.ts`](./apps/mobile/src/api/apiClient.ts) and [`websocketClient.ts`](./apps/mobile/src/api/websocketClient.ts) dynamically resolve base URLs at runtime:
     * Reads `process.env.EXPO_PUBLIC_API_URL` first.
     * Automatically maps `http(s)://` to `ws(s)://` for persistent bi-directional WebSockets (`resolveWsBaseUrl()`).
     * Automatically detects local LAN host IPs via `Constants.expoConfig.hostUri` when developing with Expo Go, preventing `localhost` routing failures on physical mobile devices.

---

## 8. Offline-First Bug Reporting, Breadcrumb Logging, & Fatal Exception Subsystem

To guarantee the **"Zero Lost Sets Guarantee"** and provide enterprise observability without telemetry vendor lock-in, Goki incorporates a unified diagnostic subsystem spanning `@goki/database`, `@goki/server`, `@goki/game-engine`, and `@goki/mobile`.

### A. Database Schema (`BugReport` Model & Enums)

The Prisma schema (`packages/database/prisma/schema.prisma`) defines the persistent bug reporting entity:

* **Enums:**
  * `BugReportSeverity`: `INFO`, `WARNING`, `ERROR`, `FATAL`
  * `BugReportCategory`: `UI_UX`, `WORKOUT_SYNC`, `WEARABLE_TELEMETRY`, `COMBAT_DUNGEON`, `CRASH_EXCEPTION`, `OTHER`
  * `BugReportStatus`: `OPEN`, `INVESTIGATING`, `RESOLVED`, `IGNORED`
* **Model `BugReport`:**
  * `id`: Unique UUID identifier (`@id @default(uuid())`).
  * `userId`: Optional foreign key to `User` (`onDelete: SetNull`), allowing anonymous pre-login crash reports and unauthenticated startup error preservation.
  * `characterId`: Optional character identifier associated with the incident.
  * `severity` / `category` / `status`: Categorization and lifecycle management.
  * `title`: Concise human-readable summary of the defect.
  * `userDescription`: Optional context provided by the athlete.
  * `errorMessage` / `stackTrace` / `componentStack`: Complete technical stack diagnostics.
  * `breadcrumbs`: JSON array of the most recent rolling ring-buffer events.
  * `stateSnapshot`: Sanitized application state (active screen, FSM state, sync queue count, focus locks).
  * `deviceMetadata`: JSON payload capturing platform, OS version, app version, and web vs native flags.
  * `createdAt` / `updatedAt`: Timestamps with indexed queries (`[status, severity]`, `[createdAt]`, `[userId]`).

### B. Backend Diagnostics API & Webhook Forwarding (`apps/server`)

* **`POST /api/diagnostics/report`:**
  * **Zod Payload Validation:** Validates payload boundaries, enforcing string length limits and capping breadcrumbs (max 200) to eliminate payload bloat vulnerabilities.
  * **Optional Authentication (`optionalAuth`):** If a valid Bearer JWT is passed, the user's `userId` is automatically bound to the report. If unauthenticated, reports are gracefully accepted anonymously so startup/login crashes and playtester submissions are never dropped.
  * **Live Discord `#bug-reports` Alert Webhook (`DIAGNOSTICS_WEBHOOK_URL`):** Actively connected in production to our dedicated `#bug-reports` Discord server channel. Whenever a playtester submits a bug report, fatal crash scroll, or feature suggestion, the server asynchronously dispatches a rich color-coded Discord embed with error snippets, stack traces, and severity tags in real time without blocking the HTTP response.
* **`GET /api/diagnostics/reports`:** Protected developer route (`[requireAuth, requireAdmin]`) supporting query filters (`severity`, `category`, `status`, `limit`) ordered chronologically descending (`createdAt desc`). Access is permitted if `process.env.ADMIN_EMAILS` is unset/empty, if the authenticated user's email is in `process.env.ADMIN_EMAILS`, or in non-production (`development`/`test`) environments.
* **`PATCH /api/diagnostics/reports/:id`:** Protected developer route (`[requireAuth, requireAdmin]`) allowing admins to update report triage states (`OPEN`, `INVESTIGATING`, `RESOLVED`, `IGNORED`).
* **Fastify Global Error Hook:** Unhandled 500 server exceptions automatically persist to `BugReport` with `severity: FATAL` and `deviceMetadata: { source: 'fastify-server' }`.

### C. In-Memory Ring Buffer & Sanitization (`@goki/game-engine` & `DiagnosticLogger`)

* **Rolling Ring Buffer (`BreadcrumbRingBuffer`):**
  * Maintains an in-memory rolling buffer of the last 100 breadcrumbs (`timestamp`, `level: 'info' | 'warn' | 'error' | 'action'`, `category`, `message`, `data`).
  * When capacity is exceeded, oldest entries automatically roll off (`shift()`).
* **Automated Credential Sanitization (`sanitizeDiagnosticData`):**
  * Recursively redacts sensitive dictionary keys (`password`, `passwd`, `token`, `jwt`, `auth`, `secret`, `bearer`, `private_key`, `authorization`, `apikey`) to `"[REDACTED]"`.
  * Regular expressions redact embedded JWTs (`eyJ...`) and Bearer authorization tokens in string fields.
* **Console Interception:** Wraps `console.warn` and `console.error` with a boolean recursion guard to automatically capture unhandled warnings and console logs without recursive infinite loops.
* **Global Exception Hooks:** Listens on React Native's `ErrorUtils.setGlobalHandler` and Web `window.addEventListener('error')` / `window.addEventListener('unhandledrejection')`. Crashes immediately serialize to `@goki_pending_crash_report` in local storage.
* **Offline-First Report Outbox Queue:**
  * Submissions via `DiagnosticLogger.submitDiagnosticReport(payload)` attempt an immediate POST to `/api/diagnostics/report`.
  * If offline or the network drops, the report is saved locally to `@goki_bug_report_outbox`.
  * `DiagnosticLogger.flushBugReportOutbox()` is invoked automatically when connectivity returns (`online` event), when the app returns to foreground (`AppState: active`), or during `GameContext` offline workout sync passes.

### D. Mobile UI: Error Boundary, Bug Report Modal, & Developer Sanctum (`apps/mobile`)

* **`ErrorBoundary.tsx`:**
  * Root React Class Error Boundary wrapping `App.tsx`.
  * **"Zero Lost Sets Guarantee":** High-contrast dark fantasy recovery screen reassuring athletes that their local workout draft, sets, and rest timer progress are safely persisted in local storage.
  * Provides an optional user note input, a **"Transmit Crash Scroll to Developers"** button, and a **"Reload & Resume"** button.
  * On application startup, checks for `@goki_pending_crash_report` from prior sessions and displays a non-intrusive prompt allowing the athlete to transmit the crash scroll.
* **`BugReportModal.tsx`:**
  * Accessible from the single global `🐛` button in the top RPG Character HUD (`App.tsx`), eliminating duplicate bug buttons on `CharacterProfileScreen`.
  * Allows selecting categories (`Feature Suggestion`, `UI / Display`, `Workout Sync`, `Wearable Telemetry`, `Combat & Dungeon`, `Other`), entering titles and descriptions, and toggling diagnostic logs inclusion.
  * Dynamically pivots modal UI when **💡 Feature Suggestion** is selected: sets severity to `INFO`, adjusts placeholders for gameplay/mechanic proposals, and styles the submission button with a positive emerald theme.
  * Contains an expandable **"View Recent Logs & Telemetry"** accordion with a **"Copy JSON"** button allowing athletes and QA testers to inspect or export their diagnostic bundle directly.
* **`DeveloperTriageModal.tsx` ("Developer Sanctum"):**
  * Accessible from `CharacterProfileScreen` via the **🛠️ Dev Triage** badge button in the deduplicated single-row utility bar. Hidden by default for normal playtesters and only shown when `process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === 'true'`, when the signed-in user's email passes the admin check (`EXPO_PUBLIC_ADMIN_EMAILS` / `@gokirpg.com`), or when unlocked for the current session via a **secret 5-tap developer gesture** on the inline `v0.2.0` version badge (`"🛠️ Developer Sanctum Unlocked"` toast + somatic haptic).
  * Connects to `GET /api/diagnostics/reports` to inspect live reports directly from mobile or desktop browser without needing database GUI clients.
  * Houses the relocated debug action **"Simulate 96h Missed-Session Gap"** (`simulateLayoffHours(96)`) as well as **"Restore Demo Sample Workouts"** (`restoreSampleWorkoutHistory()`), moving debug utilities out of the main athlete profile so fresh playtesters start with a clean `[]` training history slate.
  * Provides multi-dimensional filter chips (`Status`: `ALL`, `OPEN`, `INVESTIGATING`, `RESOLVED`, `IGNORED`; `Severity`: `ALL`, `FATAL`, `ERROR`, `WARNING`, `INFO`; `Type`: `All Items`, `💡 Suggestions`, `🐛 Bugs Only`, `💥 Crashes`, `🔄 Sync`, `🎨 UI/UX`).
  * Visual separation: **Feature Suggestions** are highlighted with emerald card borders and badges to immediately stand out from red crash exceptions and critical warnings.
  * Expanding a card reveals full stack traces, component stacks, sanitized state snapshots, and rolling breadcrumb event timelines.
  * Includes one-tap status updates (`Investigate`, `Resolve`, `Ignore`, `Reopen`) via `PATCH /api/diagnostics/reports/:id` and a `Copy Full JSON` action.

---

## 9. Workout-Safe Dual-Layer Auto-Update System

### A. Dual-Layer Update Architecture
Goki targets diverse deployment targets including Standalone Android APKs, iOS builds (via EAS), and Expo Web. Updates are classified into two distinct operational layers:
1. **Over-The-Air (OTA) Updates (`expo-updates`):**
   * Transmits updated JavaScript bundles and UI assets instantly to existing installed clients.
   * Configured via runtime policy `appVersion` and EAS update channels (`preview`, `production`).
   * Downloads occur asynchronously in the background without halting application execution.
2. **Native Binary / APK Upgrades (`/api/version`):**
   * Required when adding new native device libraries, updating Android permissions (e.g. Health Connect / Bluetooth), or modifying native SDK configurations.
   * Serves an authoritative version manifest from the backend detailing the latest release, minimum required version, direct APK download links, and release notes.

### B. Pure Mathematical Version Comparison (`@goki/game-engine`)
* **`parseSemver(version)`:** Cleans and decomposes semantic version strings (handling `v` prefixes, prereleases, and numeric tokens) into `{ major, minor, patch, prerelease }`.
* **`compareSemver(a, b)`:** Returns `-1` (`a < b`), `0` (`a == b`), or `1` (`a > b`), adhering strictly to SemVer precedence standards.
* **`isUpdateAvailable(current, latest)`:** Evaluates whether target latest version is newer than running client.
* **`isForceUpdateRequired(current, minRequired)`:** Determines if the client is below the backend's minimum required operational threshold.

### C. Backend Version Manifest Endpoint (`apps/server`)
* **`GET /api/version`:** Public, non-authenticated endpoint returning:
  * `latestVersion`: `process.env.APP_LATEST_VERSION` (default `"0.2.0"`)
  * `minRequiredVersion`: `process.env.APP_MIN_REQUIRED_VERSION` (default `"0.1.0"`, ensuring OTA-compatible `0.1.0` binaries are never blocked by a false-positive APK force-update modal)
  * `androidApkDownloadUrl`: Direct link to latest EAS preview/production APK build
  * `releaseNotes`: Descriptive summary of the release
  * `serverTimestamp`: ISO timestamp of the response

### D. Multi-Trigger Detection & Workout-Safe Reload Guard (`apps/mobile`)
* **Multi-Trigger Polling:**
  1. **Cold Start:** Queried immediately on initial application boot.
  2. **Foreground Resume:** Triggered whenever the athlete returns to Goki (`AppState: active`).
  3. **Periodic Heartbeat:** Background polling every 15 minutes while the app remains open.
  4. **Manual In-App Check:** One-tap `🔄 Updates` button with inline `v0.2.0` version badge in `CharacterProfileScreen` (tapping the inline version badge 5 times also triggers the secret Developer Sanctum unlock gesture).
* **"Zero Interrupted Sets Guarantee":**
  * When an OTA download finishes, `AutoUpdateManager` consults registered workout guards (`isIntraWorkoutFocusLocked(phase)` and active draft set progress).
  * If the athlete is currently training, resting, or holds uncompleted sets, the reload is staged under `WAITING_FOR_WORKOUT`.
  * An ambient HUD pill (`UpdateBanner`) informs the athlete: `"✨ Update Downloaded — Will install after workout"`.
  * Athletes have the option to trigger `"Reload Now (Draft Saved)"`, which securely commits drafts before restarting.
  * When the session transitions to `Idle` or concludes `LootReview`, the update is automatically applied.

---

## 10. Mobile Walkthrough UI/UX Ergonomics & Dungeon Balance Architecture (`v0.2.0`)

Following a live 5-minute mobile walkthrough audit of `v0.2.0`, 11 core workout ergonomics, RPG presentation, and dungeon balance improvements were engineered across `@goki/game-engine` and `@goki/mobile`:

### A. Workout Logger Ergonomics & State Hygiene (`OfflineWorkoutScreen.tsx`, `WorkoutLoggerScreen.tsx`, `WorkoutCategoryGateway.tsx`)
* **Discipline Selection Gateway Default & Clean Back/Abandon Flow (`OfflineWorkoutScreen.tsx`, `WorkoutLoggerScreen.tsx`, `WorkoutCategoryGateway.tsx`):**
  * Both Offline and Live Dungeon workout loggers always open on the **Select Training Discipline** selector screen (`selectedCategory = null`) whenever there is no active workout progress (`0` checked sets, `0` conditioning segments, and boss not engaged), hiding the bottom `🏁 Finish Workout` button and pre-flight boss card until a discipline is chosen.
  * Tapping `← Back` on the selector screen exits directly to the Main Hub (`LandingScreen`); tapping `← Back` inside an unstarted discipline returns to `Select Training Discipline`; confirming `Abandon Raid` / `Abandon Workout` resets the session, triggers a feedback banner (`"🛡️ Raid Abandoned — Retreated to Sanctum"`), and navigates back to the Main Hub.
* **Press-and-Hold Vertical Drag-to-Reorder & Direct Segment Removal (`OfflineWorkoutScreen.tsx`, `WorkoutLoggerScreen.tsx`, `WorkoutCategoryGateway.tsx`):**
  * Long-pressing (~220ms) and dragging vertically on any exercise card's `⠿` drag handle or any workout segment's `⠿` header smoothly reorders individual exercises or entire workout segments (`GYM`, `CARDIO`, `SPORT`, `RECOVERY`) in real time with `ScrollView` scroll-locking and haptic ticks.
  * Active segments can be removed directly from their top discipline pill (`✕` badge inside each active pill in the 4-pill bar), from the secondary segment chips, from the `Manage Workout Segments` modal, or via the `✕ Remove` button on each segment's section header.
* **Separated `"Barbell Plates Visualizer"` & `"Warm-Up Sets"` Tools + `⋯` Set Designation Menu (`PlatesAndWarmupModal.tsx`):**
  * Replaced the combined `🧮 Plates / Warm-Up` button on each exercise card with two dedicated buttons: **`🧮 Barbell Plates Visualizer`** (`mode: 'PLATES'`) and **`🌡️ Warm-Up Sets`** (`mode: 'WARMUP'`).
  * Streamlined the `⋯` exercise menu to house only unique actions (`🔗 Link/Unlink Superset`, `🌡️ Set / Add Warm-Up [W]`, `🔥 Set / Add Drop-Set [D]`, `⚡ Set / Add Failure / AMRAP [F]`, and `🗑️ Remove Exercise`).
* **Smooth Vertical RPE Slider (`RpeVerticalSliderModal.tsx`):**
  * Tapping any set or session RPE pill opens the vertical RPE slider modal where dragging anywhere on the left track smoothly updates RPE (`6.0`–`10.0` in `0.5` increments) via cached track layout geometry, paired with a green `✓ Confirm RPE` button and backdrop tap-to-confirm.
* **Training History & Recent "Quick" Exercises Memory Wipe (`GameContext.tsx`, `WipeTrainingHistoryModal.tsx`):**
  * Executing a training history wipe (`pruneWorkoutHistory`) also clears `recentActivityIds` in state and persisted storage, resetting both the `ActivityPickerModal` recent list and the conditioning `Quick:` activity bar.
* **Artisan Gathering Node Harvest Feedback (`GatheringNodeScreen.tsx`):**
  * Harvesting a gathering node triggers immediate scale-bounce animation, haptic feedback, a floating `+1 Yield • +XP` badge over the node card, and a top loot toast banner.

### B. 9:16 Sanctum Receipt Conditioning Ledger (`ShareableWorkoutReceiptModal.tsx` & `training-history-tracker.ts`)
* **`cardioEntries` Persistence:** `CompletedWorkoutRecord` persists all logged `CompletedCardioEntry` items (`workoutCategory`, `durationSeconds`, `averageHrZone`, `rpe`).
* **Smart Duration & Conditioning Telemetry:** Receipt duration resolves to `Math.max(workout.durationSeconds, totalCardioSeconds)`, renders all Cardio/Sport/Recovery entries (`🏃` / `🥊` / `🧘`) in the receipt ledger and plain-text share summary, and dynamically adapts the 4-cell Hero Telemetry Strip (`DURATION`, `CONDITIONING`, `SEGMENTS`, `AVG HR ZONE`) for pure conditioning sessions.

### C. HUD, Guild Hall, Boss Portraits, Talent Tree & Auto-Battler Balance
* **Cosmetic Top-Right Location Badge (`App.tsx`):** Converted the top-right HUD location badge into a non-interactive cosmetic indicator synced to the active tab (`🍺 Tavern`, `🛡️ Guild Hall`, `⛏️ Gathering Nodes`, `🏰 Dungeon`, `🐉 Raid Sanctum`), and consolidated Bug Reporting into the single global top-left `🐛` HUD button.
* **Dynamic Guild Raid Hero Identity & Centered Boss Portrait Crops (`GuildHallScreen.tsx`, `SpriteAnimator.tsx`, `spriteManifest.ts`):**
  * Guild Raid contribution rows bind `player_hero` to `${characterName} (You)` with gold highlighting.
  * `SpriteSheetConfig` supports per-rig `portraitCrop` (`zoom`, `offsetX`, `offsetY`) so 48×48 and 56×56 boss portraits zoom and center on the head/upper torso of Ignisrax and Vaelgor.
* **Inline Guild Bounty & Rank Trial Progress (`GuildHallScreen.tsx`):** Bounty and trial cards display live inline requirement pills (`🏋️ 1/3 Workouts`), progress bars, and a 3-state button (`🔒 X/Y` locked, `✨ Claim` glowing gold, `✓ Claimed` completed).
* **Collapsible Talent Tree Combat Bonuses (`TalentBuilderScreen.tsx`):** Replaced the bottom `Aggregated Omni-Class Combat Profile` card and equipment link with a collapsible `📊 Bonuses ▾` pill in the top stat summary bar so the Talent Tree and Node Inspector fit cleanly on screen.
* **Tier-1 Solo Dungeon Calibration, Partial Salvage & Crimson Defeat Modal (`auto-battler-sim.ts`, `AutoBattlerArena.tsx`, `GameContext.tsx`):**
  * Rebalanced `DEFAULT_DUNGEON_CATALOG` so a solo hero with average stat level ~3 can clear Tier 1 (`Obsidian Catacombs`, `COPPER`) solo, scaling `IRON`–`GOLD` expeditions smoothly from that baseline.
  * Pre-boss rooms award partial salvage (~21–32% of total gold + minor drops) even on a mid-expedition wipe, while >65% of expedition gold and major gear drops are gated behind defeating the Boss and claiming the final Reliquary chest.
  * When an expedition ends in `WIPE` or `TIMEOUT`, `AutoBattlerArena` renders a distinct crimson defeat modal (`💀 EXPEDITION WIPED (Room X/Y)`, readiness tip, partial salvage summary, and `"🛡️ Retreat to Sanctum"` / `"📦 Recover Salvage & Retreat"`).


