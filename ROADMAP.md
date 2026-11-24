# Goki: Living Product & Engineering Roadmap

> **How to use this document:** This is the living source of truth for Goki's upcoming architecture, gameplay, and visual overhauls. Check off actionable steps (`[x]`) as milestones are implemented and verified, update milestone status headers, and append new milestones (`Milestone 7+`) under the Backlog section as new priorities emerge.

**Status Legend:** `[ ]` Planned · `[/]` In Progress · `[x]` Complete

---

## Locked Architectural & Design Pillars

These core decisions guide every milestone below:

1. **Character Rig (`react-native-svg` + `react-native-reanimated`):** Modular 2D bone-rigged paperdoll system built on the existing SVG + Reanimated stack so character morphs and equipment anchors scale cleanly with full Expo Web and OTA update parity (no native binary rebuilds required).
2. **3 Purely Cosmetic Races:** **Human**, **Oni**, and **Kitsune** share identical stat caps and combat math—zero min-max race pressure.
3. **Stat-Unlocked Opt-In Physique & Evolutions:** Characters start unmuscled at baseline stature with free Level-1 identity choices (hair, face, skin/fur palette). Real-world training across the 7 holistic stats unlocks aesthetic tiers (`STR` muscle mass, `CON` frame/height, `AGI`/`DEX` lean definition & combat stances, `END` scars/vascularity, `WIS`/`SPR` Oni horns, Kitsune tails 1–9, and energy auras), which players toggle on/off freely.
4. **Live Turn-Based Combat + Passive Coexistence:** Live interactive turn-based quests coexist alongside 24-hour Expeditions and 7-day Raids. Live play is unlimited (not stamina-locked), while real-world workouts govern stat levels, talent points, and gear power.
5. **Co-op-Ready Deterministic Combat Engine:** Live combat runs `AGI`-ordered turns (`Basic Attack`, `Guard/Counter`, `Belt Consumables`, and `3–4` equipped Talent Active Skills) with solo + optional AI-controlled Company allies, implemented as a pure state machine in `@goki/game-engine` so WebSocket real-time co-op slots in cleanly later.
6. **Dual Social Membership:** Characters belong simultaneously to:
   - **1 Real-World Gym Clan** (location-deduped per gym venue) plus automatic membership in the default **Home / Open-World Clan** (which hosts the public weekly Raid Bosses).
   - **1 Adventurer Company** (user-created cross-gym group: up to `30` roster members, `4`-player active squad).
7. **5-Tab World Navigation Shell:** `Hero | Adventure | Artisan | Social | Train`.
8. **Dual Cohesive Visual System:**
   - **Workout Logging:** Layered-Canvas Dark Fantasy + Hevy-clean zero-clutter gym floor ergonomics.
   - **RPG Hub:** Visually striking illustrated scenes with pop-up NPC dialogues (**Guide**, **Traders**, **Trainers**, **Guild Receptionist**, **Company Quartermaster**).

---

## Milestone Progress Overview

| Milestone | Focus | Status |
| :--- | :--- | :--- |
| **M1** | Design System, 5-Tab Shell, & Workout Canvas Cleanup | `[x]` Complete |
| **M2** | Modular 2D Bone-Rigged Character & Morphable Gear Engine | `[x]` Complete |
| **M3** | Live Turn-Based Combat & Adventurer's Guild Hub | `[x]` Complete |
| **M4** | Artisan Economy, NPC Cast, & Fitness Coaching | `[x]` Complete |
| **M5** | Social Hub, Real-World Gym Clans, & Adventurer Companies | `[x]` Complete |
| **M6** | Full RPG Illustration Polish & Real-Time Co-op Readiness | `[x]` Complete |

---

## Milestone 1: Design System, 5-Tab Shell, & Workout Canvas Cleanup
**Status:** `[x]` Complete  
**Goal:** Establish an uncluttered visual foundation and the 5-tab navigation layout so every new RPG and fitness feature lands in a clean interface rather than dense boxed cards.

### Actionable Steps
- [x] **Design Tokens & Surface System (`apps/mobile`):** Define layered dark-slate background tokens, hairline dividers, typography scale, and bottom-sheet progressive disclosure primitives to eliminate nested border boxes.
- [x] **Custom RPG SVG Icon Library (`apps/mobile`):** Replace raw OS emojis across navigation, stats, statuses, and action buttons with unified custom vector RPG icons.
- [x] **5-Tab World Navigation Refactor (`apps/mobile/App.tsx`):**
  - [x] Restructure top-level World tabs into `Hero`, `Adventure`, `Artisan`, `Social`, and `Train`.
  - [x] Consolidate `CharacterProfileScreen` + `TalentBuilderScreen` into segmented sub-views under `Hero` (`Overview & Gear | Appearance | Talents`).
  - [x] Route `Train` cleanly to the workout gateway, logger, and `TrainingHistoryScreen`.
- [x] **Hevy-Clean Workout Logger Pass (`WorkoutLoggerScreen.tsx`, `OfflineWorkoutScreen.tsx`):** Strip redundant outer containers and visual noise from the gym-floor logger while preserving the 6-column set table, plate visualizer, and two-stage rest timer.
- [x] **Reusable Pop-Up NPC Dialogue Component (`apps/mobile`):** Build a shared modal/overlay component featuring NPC portrait bust, dialogue text, quick-action chips, and dismiss/next controls.
- [x] **Verification:** Pass `@goki/mobile` TypeScript check and Playwright E2E workout logging smoke tests under the new 5-tab shell.

---

## Milestone 2: Modular 2D Bone-Rigged Character & Morphable Gear Engine
**Status:** `[x]` Complete  
**Goal:** Replace static portrait PNGs and fixed `100×100` combat sprite sheets with a customizable bone-rigged character system supporting **Human**, **Oni**, and **Kitsune**, opt-in stat-unlocked body morphs, and size-adapting equipment.

### Actionable Steps
- [x] **Stat-to-Aesthetic Unlock Rules (`@goki/game-engine`):**
  - [x] Define race definitions (`HUMAN`, `ONI`, `KITSUNE`) and Level-1 base identity options (hair, face, eyes, skin/fur palette, base silhouette).
  - [x] Define 7-stat unlock thresholds (`STR` muscle mass tiers, `CON` frame width & height tiers, `AGI`/`DEX` lean definition & combat stances, `END` battle scars & vascularity, `WIS`/`SPR` Oni horn/tusk growth, Kitsune tails 1–9, and energy auras).
  - [x] Implement pure validation helpers ensuring players can equip/toggle any unlocked aesthetic tier without forced auto-morphing.
- [x] **Database & API Support (`packages/database/prisma/schema.prisma`, `apps/server/src/routes/characters.ts`):**
  - [x] Add `race` and `customizationConfig` (JSON for base identity + selected opt-in morph tiers) to `Character`.
  - [x] Enforce server-side stat-requirement validation on `PATCH /api/characters/:id` when saving morph selections.
- [x] **Modular Bone-Rigged SVG Renderer (`apps/mobile`):**
  - [x] Build articulated SVG body-part rigs (`head`, `torso`, `upperArm`, `forearm`, `thigh`, `shin`, `horns`, `tails`) driven by `react-native-reanimated` bone transforms (`idle`, `walk`, `attack`, `guard`, `hurt`, `victory`).
  - [x] Implement bone length/width scaling from the character's selected morph configuration.
  - [x] Map all 8 equipment slots (`HEAD`, `CHEST`, `LEGS`, `BOOTS`, `ONE_HANDED`/`TWO_HANDED`, `OFFHAND`, `ACCESSORY`) to bone anchor transforms so equipped gear morphs and animates in sync with body proportions.
- [x] **Character Forge & Morph Wardrobe UI (`CharacterManagerModal.tsx`, `Hero` tab):**
  - [x] Overhaul character creation to start characters unmuscled with race selection (Human, Oni, Kitsune) and Level-1 identity customization.
  - [x] Build the Appearance Wardrobe showing locked vs. unlocked physique/evolution tiers with clear stat-level requirements and opt-in toggles.
- [x] **Verification:** Unit tests in `@goki/game-engine` for morph unlock validation, server API tests in `characters.test`, and visual rig verification across Expo Web and mobile.

---

## Milestone 3: Live Turn-Based Combat & Adventurer's Guild Hub
**Status:** `[x]` Complete  
**Goal:** Introduce interactive turn-based dungeons and rank-gated quests hosted at the **Adventurer's Guild** so players actively fight with their built heroes and equipped Talent Skills.

### Actionable Steps
- [x] **Pure Deterministic Turn-Based Engine (`@goki/game-engine`):**
  - [x] Implement `createTurnBasedEncounter` and `stepTurnBasedCombat(state, action, rng)` as a pure deterministic FSM (explicitly structured to support future server-authoritative WebSocket co-op).
  - [x] Implement `AGI`-based turn-order timeline, Stamina (`END`) & Mana/Resolve (`WIS`/`SPR`) resource pools, `Basic Attack`, `Guard/Parry`, `Belt Consumable`, and `3–4` equipped Active Skills from `talent-engine.ts`.
  - [x] Implement enemy intent telegraphs, status effects, wave progression, and AI companion behavior for Adventurer Company allies.
- [x] **Active Skill & Belt Loadout (`@goki/game-engine`, `schema.prisma`, `Hero` tab):**
  - [x] Persist up to 4 equipped Talent Active Skills and belt potion slots per character.
  - [x] Add Loadout Bar selector UI under `Hero` / pre-quest staging.
- [x] **Adventurer's Guild & Live Quest Routes (`packages/database`, `apps/server`):**
  - [x] Separate rank-gated Live Quests and Rank-Up Trials into the Adventurer's Guild catalog (`Adventure` tab), keeping 24-hour Expeditions in a dedicated Passive Expeditions sub-view.
  - [x] Add server endpoints to start, checkpoint, and verify/claim rewards for live turn-based runs (with offline local play + deferred sync support).
- [x] **Interactive Turn-Based Arena UI (`apps/mobile`):**
  - [x] Render bone-rigged hero (+ optional AI squad) vs. enemy waves with turn-order bar, target selection, enemy intent icons, skill hotbar, and animated floating damage/status popups.
  - [x] Integrate **Guild Receptionist NPC** pop-up dialogue for quest briefing, rank trials, and victory debriefs.
- [x] **Verification:** Comprehensive `@goki/game-engine` combat state-machine tests, server quest completion tests, and E2E live encounter run.

---

## Milestone 4: Artisan Economy, NPC Cast, & Fitness Coaching
**Status:** `[x]` Complete  
**Goal:** Close the gathering-to-combat economy loop, bring the RPG hub to life with functional NPCs, and connect real-world training landmarks to actionable coaching.

### Actionable Steps
- [x] **Crafting, Reforging & Potion Brewing (`@goki/game-engine`, `apps/server`):**
  - [x] Define crafting recipes turning gathered Mining, Foraging, Smelting, and Alchemy outputs into combat consumables, gear upgrades, and affix reforges.
  - [x] Add `/api/crafting` routes with transactional material deduction and item minting.
  - [x] Upgrade the `Artisan` tab into unified `Gather | Craft & Reforge` sub-views.
- [x] **NPC Trader & Trainer Systems (`apps/server`, `apps/mobile`):**
  - [x] Add **Trader NPC** rotating shop stock and Gold-sink purchases/selling.
  - [x] Add **Trainer NPC** talent tree respec functionality (Gold cost) and stat build guidance.
- [x] **Trainer NPC Smart Fitness Coaching (`@goki/game-engine`, `Train` / `Hero`):**
  - [x] Connect `calculateWeeklyMuscleVolumeLandmarks` (`MEV/MAV/MRV` in `intra-workout-ergonomics.ts`) and `fatigue-manager.ts` to generate deterministic split recommendations, deload prompts, and progressive overload cues delivered via Trainer NPC pop-ups.
  - [x] Add multi-week workout program templates built on `workout-presets-rest.ts`.
- [x] **Guide NPC Onboarding (FTUE):**
  - [x] Build a clean Level-1 walkthrough led by the **Guide NPC** introducing race selection, the first workout log, the Adventurer's Guild, and the default Home/Open-World Clan.
- [x] **Verification:** Unit tests for crafting/reforging & coaching rules, API transaction tests for shop/respec/crafting, and onboarding flow verification.

---

## Milestone 5: Social Hub, Real-World Gym Clans, & Adventurer Companies
**Status:** `[x]` Complete  
**Goal:** Replace the legacy `Guild` model and tab with a dedicated `Social` hub housing location-deduped **Gym Clans**, the default **Home/Open-World Clan** with weekly Raids, **Adventurer Companies**, Friends, Leaderboards, and Async Arena Sparring.

### Actionable Steps
- [x] **Database & Domain Split (`packages/database/prisma/schema.prisma`):**
  - [x] Refactor `Guild` into:
    - `GymClan` (canonical real-world gym venue with normalized coordinates/venue key, plus seeded default `OPEN_WORLD_HOME` clan for all users).
    - `AdventurerCompany` (player-created cross-gym group: max `30` roster members, `4`-player active squad slot designation).
  - [x] Add `Friendship` model, `GymClanSeason` standings, and `ArenaMatch` records.
  - [x] Bind public `RaidBossInstance` encounters directly to the default **Home/Open-World Clan** and support Gym-Clan-specific raid tiers.
- [x] **Gym Discovery & Social APIs (`apps/server`):**
  - [x] Build gym venue search & coordinate-deduped Clan creation/joining (OSM/Places lookup + user-submitted venue fallback).
  - [x] Build `/api/social` routes for Gym Clans, Weekly Raids, Adventurer Companies (roster + 4-player active squad management), Friends, and Leaderboards.
  - [x] Implement Async Arena AI sparring and monthly Gym Clan seasonal scoring endpoints powered by `stepTurnBasedCombat`.
- [x] **Social Hub UI (`apps/mobile`):**
  - [x] Build the `Social` tab with sub-views for `My Clan & Raid | Company | Friends | Leaderboards | Arena`.
  - [x] Integrate **Company Quartermaster NPC** and **Clan Warden NPC** dialogues for roster management, seasonal standings, and raid coordination.
- [x] **Verification:** Database migration & seed validation, server authorization/membership tests (1 Gym Clan + default Home Clan + 1 Company), and E2E social flow tests.

---

## Milestone 6: Full RPG Illustration Polish & Real-Time Co-op Readiness
**Status:** `[x]` Complete  
**Goal:** Deliver the cohesive 2.5D anime cel-shaded visual art pass across all RPG screens, battles, NPCs, and items while maintaining OTA `0.1.0` compatibility, strict Creative Unit discipline, and real-time Adventurer Company co-op over WebSockets.

### Locked Art Pipeline & Visual Guardrails
* **Layer.ai Workspace:** `02c84d2c-9787-43a9-865c-f2bfd9149993` (`Warm Hyrax of Energy`)
* **Locked Reference Sets:**
  * `ANIME_WORLD` (`scene`): `295d3143-1cf3-40cd-a091-bad7357f44cb`
  * `ANIME_ARENA` (`scene`): `708ccd8a-bd42-4e63-a1d9-e9ee6cb158d1`
  * `ANIME_RIG_PARTS` (`character`): `73986943-ee0b-47da-a609-17fe660d595a`
  * `ANIME_ITEMS` (`object`): `b59306b4-5ca1-4c47-a0ed-97eed6cf8f47` (`defaultModelId: "nano-banana-2.1"`)
* **Model & Workflow Policy:**
  * **Item Icons & NPC Portrait Edits:** Lock to `nano-banana-2.1` (`1024×1024` opaque RGB) for reliable style lock; use Google AI Studio single-icon prompt packs (`0 Layer CU`, no `3×3` grids) for Wave 3C icons and Wave 3D race cards.
  * **Battle Parallax Biomes:** Permanently retire `export_parallax` Z-depth slicing. Generate 6 clean individual semantic layers (`2560×1080`) via Google AI Studio (`0 CU`) or `nano-banana-2.1` + local `sharp` alpha unmixing, seam blending, and surgical targeted repairs (`nano-banana-2.1`).
  * **Pre-Wave Reuse Checks:** Always inspect and confirm local asset mappings in `art-pipeline/raw/` before calling Layer MCP. Keep `art-pipeline/raw/npcs/references/` strictly for NPCs (never reuse NPC art as hero race baselines).
* **Architecture Guardrails:**
  * Keep `tools/asset-pipeline` isolated from root `package.json` `workspaces` and `npm run build` (`render.yaml` safety).
  * Stay strictly under `600` compiled mobile assets (well below Expo EAS's `2,000`-asset OTA cap).
  * Preserve `runtimeVersion: "0.1.0"` OTA compatibility (zero native binary rebuilds for Stage 1C, Stage 3, and Reanimated 4 combatants).
  * Retire legacy `CHARACTER_APPEARANCES` (deprecated) and legacy `100×100` enemy pixel sprite sheets in Stage 5A.

### Actionable Steps — Execution Sequence (`1A/1B → 1C → Stage 3 OTA Waves → Stage 2 Bake-Off → Stage 4 → Stage 5`)
- [x] **Real-Time Co-op Turn-Based Combat (`apps/server/src/routes/websocket.ts`, `@goki/game-engine`):**
  - [x] Host `stepTurnBasedCombat` authoritatively in Fastify WebSocket rooms (`company-quest:{runId}`) for up to 4 active Adventurer Company squadmates.
  - [x] Add live lobby readiness, turn countdown timers, and automatic AI takeover if a teammate disconnects.
- [x] **Stage 1A & 1B — Asset Pipeline Scaffold & Vertical Slice (`21` Approved WebPs, `3.12 MB`):**
  - [x] Wire drop-in asset-registry slots (`rpgArtRegistry.ts`, `itemArtRegistry.ts`) and zero-reflow scene layout hooks (`HubSceneShell.tsx`) across `Hero`, `Adventure`, `Artisan`, `Social`, `NpcDialogueOverlay`, `CharacterRigRenderer`, and `ParallaxBackground`.
  - [x] Build standalone `tools/asset-pipeline/` (`sharp`, `ajv`, `tsx`), `art-pipeline/manifest/assets-manifest.json`, and `npm run assets:build` emitting `apps/mobile/src/assets/generated/compiledAssets.generated.ts`.
  - [x] Approve and compile all `21` vertical-slice assets: `7` Hub backdrops (`1080×1920`), `1` `hero_sanctum` banner (`1440×480`), `6` seamless `whitewood_forest` semantic parallax layers (`2560×1080`), `4` repaired belt-free `GUIDE` (*Auren*) portraits (`512×512`), and `3` `nano-banana-2.1` item icons (`iron_greatsword`, `ashen_iron_helm`, `vitality_elixir`, `256×256`).
- [x] **Stage 1C — Scrim Tuning & Live Verification (`0 CU`, OTA `0.1.0`):**
  - [x] Lighten `HubSceneShell.tsx` backdrop and banner scrims gently so twilight anime backdrops and lanterns read clearly behind dark-slate cards without reducing legibility.
  - [x] Run `npm run typecheck`, `npm run test`, and `npx playwright test e2e/milestone6-coop-and-art-hooks.spec.ts`.
- [x] **Stage 3 — Full-World 2D/2.5D OTA Art Scale-Out (`352.11 CU` Remaining after Wave 3A):**
  - [x] **Wave 3A — Hub Banners & 4 Remaining Biomes (`51.71 CU` actual, `51/51` Compiled WebPs):** Approved and compiled all `6` remaining Hub header banners (`7/7` total) and all `4` remaining 6-layer semantic battle biomes (`crypt_catacombs`, `obsidian_citadel`, `sun_scorched_caldera`, `arena_courtyard` — `5/5` biomes total), aligned `ParallaxBackground.tsx` to native `2560×1080` full-frame framing (`verticalOffset: 0`), and wired `AutoBattlerArena.tsx` to `resolveBattleArenaPreset`.
  - [x] **Wave 3B — Remaining 5 Hub NPCs (`0.00 Layer CU`, Gemini Nano Banana 2.1 via Ultra Cloud Credits, `71/71` Compiled WebPs):** Mapped local references for *Lyra Vance*, *Master Kaelen*, *Commander Veyra* (Kitsune Tactician), and *Warden Torin* (Horned Oni Warlord with obsidian-sclera eyes & lower tusks) plus style-locked *Bramwell*, generated all `20` `1024×1024` portraits (`4` expressions each), passed human QA, and compiled all `24/24` Hub NPC portraits to `512×512` WebP via `npm run assets:build`.
  - [x] **Wave 3C — 38 Canonical Base Item Icons (`0.00 Layer CU`, Gemini Nano Banana 2.1 via Ultra Cloud Credits, `109/109` Compiled WebPs):** Generated all `38` remaining canonical `BASE_ITEM_ICON_REGISTRY` `1024×1024` WoW-style icons (applying all 12 QA redesigns & 9 display-name updates), passed human QA, and compiled all `40/40` base item icons to `256×256` WebP via `npm run assets:build`.
  - [x] **Wave 3D — 9 Dedicated Hero Race Cards (`0.00 Layer CU`, Gemini Nano Banana 2.1 via Ultra Cloud Credits, `127/127` Compiled WebPs):** Generated all `9` `RACE_ILLUSTRATION_SLOTS` `2:3` standing cards (`HUMAN`, `ONI`, `KITSUNE` × `balanced`, `lithe`, `broad_shouldered` with silhouette-locked apparel & V-taper/muscularity polish), added deterministic `cropRegion` `384×384` bust cropping in `tools/asset-pipeline/src/build-assets.ts`, merged into `rpgArtRegistry.ts` / `characterArtRegistry.ts`, passed human QA, and compiled all `18` WebPs (`9` `640×960` standing + `9` `384×384` bust). Skipped deprecated `CHARACTER_APPEARANCES`.
- [x] **Stage 2 — Hero Rig Visual Bake-Off Gate (`0.00 Layer CU` actual):**
  - [x] Built interactive live HTML motion bake-offs over `whitewood_forest` comparing **(a)** Reanimated 4 12-bone layered anime paperdoll (`stage2_hero_rig_bakeoff.html`), **(b)** Reanimated 4 full-body illustrated anime hero + code-driven slash VFX, and **(c)** a live Rive-style 2D skeletal mesh simulation (`stage2_path_c_mesh_demo.html`).
  - [x] Selected **Path B now (`OTA 0.1.0`) — Reanimated 4 Full-Body Illustrated Anime Hero + Slash VFX**, preserving a clean drop-in upgrade slot for a future Rive (`hero_rig.riv`) mesh rig in `0.2.0` (avoiding `34+` modular overlays and keeping `0.1.0` OTA compatibility).
- [x] **Stage 4 — Reanimated Enemies, Raid Bosses, VFX & Hero Visuals (`0.00 Layer CU`, `164/164` Compiled WebPs):**
  - [x] Standardized all `6` mob archetypes (`Skeleton Grunt`, `Orc Marauder`, `Dreadsword Skeleton`, `Corrupted Knight`, `Ashblade Duelist`, `Duskwood Archer`, `512×512`) and all `7` live raid/dungeon bosses (*Ignisrax*, *Vaelgor*, *Bone Lord Malakor*, *Warchief Goretooth*, *Fallen Commander Vane*, *Arch-Lich Valerius*, *Chronos*, `768×768`) as left-facing transparent anime cutouts + `7` dedicated `256×256` illustrated boss bust portraits for `GuildHallScreen.tsx` and `WorkoutLoggerScreen.tsx`.
  - [x] Implemented Path B (`12` full-body combat Hero cutouts: `9` race/silhouette stances + `3` Armored Vanguard skins with 2-tail Kitsune parity across Wave 3D & 4B), `5` T1–T5 rarity loot chests (`256×256`), and `ReanimatedCombatantSprite.tsx` (breathing, telegraph glow, attack lunge, hitstop, guard barrier, and weapon-matched slash VFX) across `AutoBattlerArena.tsx` and `TurnBasedArenaScreen.tsx`.
- [x] **Stage 5 — Bundle Audit, Legacy Cleanup & Release Cut (`246` Bundled Mobile Assets, `37.26 MB` Saved):**
  - [x] Verified `246` bundled static + compiled mobile assets (`251` total files in `apps/mobile/assets/`, `16.63 MB`, strictly under the `600`-asset target and Expo EAS `2,000`-asset cap); retired deprecated `CHARACTER_APPEARANCES` + `20` legacy character PNGs (`10.57 MB`), `40` legacy `512×512` item PNGs (`19.13 MB`), `35` legacy `100×100` enemy pixel sprite sheets (`0.07 MB`) + dead `SpriteAnimator`/`spriteManifest` files, `7` legacy static Whitewood PNGs (`7.48 MB`), and `scripts/generate-layer-icons.mjs` + `scripts/resize-image.ps1`.
  - [x] Passed full automated verification gate: `npm run assets:build` (`164/164` WebPs), `npm run typecheck` (`4/4` workspaces), `npm run build` (`3/3` workspaces, `tools/asset-pipeline` isolated), `npm run test` (`282/282` unit/integration tests), and `npm run test:e2e` (`8/8` Playwright E2E specs).
  - [x] Verified `runtimeVersion: "0.1.0"` OTA compatibility in `apps/mobile/app.json` and `apps/mobile/package.json` (Reanimated 4 Path B, zero native binary rebuilds required); ready for user-confirmed `eas update` OTA release cut.
- [x] **Post-M6 Visual QA Remediation & Hardening (OTA `0.1.0`):** Audited the 6.5-minute end-to-end mobile walkthrough and resolved all 22 P0–P2 sync, economy, combat hit-flash, HP parity, raid leaderboard, layout, and contrast defects across `@goki/game-engine`, `@goki/server`, and `@goki/mobile`; added `temp video refs/` to `.gitignore` and published OTA `0.1.0` updates.

---

## Future Backlog (Milestone 7+)
_Add new milestones and post-V1.0 expansion ideas here as they arise:_

- [ ] **M7 — Live Wearable HR Combat Sync:** Stream Zone 4–5 heart rate telemetry during hybrid/live sessions to charge rage, stamina regen, or party shields in real time.
- [ ] **M8 — Remote APNs / FCM Push Notifications:** Alert players when Company co-op lobbies open, Gym Clan raid milestones hit, or 2-hour Artisan tasks complete.
- [ ] **M9 — Cryptographic Ironman Gym Geofencing:** Hardware-verified facility attestation for Ironman-mode Gym Clan seasonal rankings.
