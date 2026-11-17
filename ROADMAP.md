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
| **M3** | Live Turn-Based Combat & Adventurer's Guild Hub | `[ ]` Planned |
| **M4** | Artisan Economy, NPC Cast, & Fitness Coaching | `[ ]` Planned |
| **M5** | Social Hub, Real-World Gym Clans, & Adventurer Companies | `[ ]` Planned |
| **M6** | Full RPG Illustration Polish & Real-Time Co-op Readiness | `[ ]` Planned |

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
**Status:** `[ ]` Planned  
**Goal:** Introduce interactive turn-based dungeons and rank-gated quests hosted at the **Adventurer's Guild** so players actively fight with their built heroes and equipped Talent Skills.

### Actionable Steps
- [ ] **Pure Deterministic Turn-Based Engine (`@goki/game-engine`):**
  - [ ] Implement `createTurnBasedEncounter` and `stepTurnBasedCombat(state, action, rng)` as a pure deterministic FSM (explicitly structured to support future server-authoritative WebSocket co-op).
  - [ ] Implement `AGI`-based turn-order timeline, Stamina (`END`) & Mana/Resolve (`WIS`/`SPR`) resource pools, `Basic Attack`, `Guard/Parry`, `Belt Consumable`, and `3–4` equipped Active Skills from `talent-engine.ts`.
  - [ ] Implement enemy intent telegraphs, status effects, wave progression, and AI companion behavior for Adventurer Company allies.
- [ ] **Active Skill & Belt Loadout (`@goki/game-engine`, `schema.prisma`, `Hero` tab):**
  - [ ] Persist up to 4 equipped Talent Active Skills and belt potion slots per character.
  - [ ] Add Loadout Bar selector UI under `Hero` / pre-quest staging.
- [ ] **Adventurer's Guild & Live Quest Routes (`packages/database`, `apps/server`):**
  - [ ] Separate rank-gated Live Quests and Rank-Up Trials into the Adventurer's Guild catalog (`Adventure` tab), keeping 24-hour Expeditions in a dedicated Passive Expeditions sub-view.
  - [ ] Add server endpoints to start, checkpoint, and verify/claim rewards for live turn-based runs (with offline local play + deferred sync support).
- [ ] **Interactive Turn-Based Arena UI (`apps/mobile`):**
  - [ ] Render bone-rigged hero (+ optional AI squad) vs. enemy waves with turn-order bar, target selection, enemy intent icons, skill hotbar, and animated floating damage/status popups.
  - [ ] Integrate **Guild Receptionist NPC** pop-up dialogue for quest briefing, rank trials, and victory debriefs.
- [ ] **Verification:** Comprehensive `@goki/game-engine` combat state-machine tests, server quest completion tests, and E2E live encounter run.

---

## Milestone 4: Artisan Economy, NPC Cast, & Fitness Coaching
**Status:** `[ ]` Planned  
**Goal:** Close the gathering-to-combat economy loop, bring the RPG hub to life with functional NPCs, and connect real-world training landmarks to actionable coaching.

### Actionable Steps
- [ ] **Crafting, Reforging & Potion Brewing (`@goki/game-engine`, `apps/server`):**
  - [ ] Define crafting recipes turning gathered Mining, Foraging, Smelting, and Alchemy outputs into combat consumables, gear upgrades, and affix reforges.
  - [ ] Add `/api/crafting` routes with transactional material deduction and item minting.
  - [ ] Upgrade the `Artisan` tab into unified `Gather | Craft & Reforge` sub-views.
- [ ] **NPC Trader & Trainer Systems (`apps/server`, `apps/mobile`):**
  - [ ] Add **Trader NPC** rotating shop stock and Gold-sink purchases/selling.
  - [ ] Add **Trainer NPC** talent tree respec functionality (Gold cost) and stat build guidance.
- [ ] **Trainer NPC Smart Fitness Coaching (`@goki/game-engine`, `Train` / `Hero`):**
  - [ ] Connect `calculateWeeklyMuscleVolumeLandmarks` (`MEV/MAV/MRV` in `intra-workout-ergonomics.ts`) and `fatigue-manager.ts` to generate deterministic split recommendations, deload prompts, and progressive overload cues delivered via Trainer NPC pop-ups.
  - [ ] Add multi-week workout program templates built on `workout-presets-rest.ts`.
- [ ] **Guide NPC Onboarding (FTUE):**
  - [ ] Build a clean Level-1 walkthrough led by the **Guide NPC** introducing race selection, the first workout log, the Adventurer's Guild, and the default Home/Open-World Clan.
- [ ] **Verification:** Unit tests for crafting/reforging & coaching rules, API transaction tests for shop/respec/crafting, and onboarding flow verification.

---

## Milestone 5: Social Hub, Real-World Gym Clans, & Adventurer Companies
**Status:** `[ ]` Planned  
**Goal:** Replace the legacy `Guild` model and tab with a dedicated `Social` hub housing location-deduped **Gym Clans**, the default **Home/Open-World Clan** with weekly Raids, **Adventurer Companies**, Friends, Leaderboards, and Async Arena Sparring.

### Actionable Steps
- [ ] **Database & Domain Split (`packages/database/prisma/schema.prisma`):**
  - [ ] Refactor `Guild` into:
    - `GymClan` (canonical real-world gym venue with normalized coordinates/venue key, plus seeded default `OPEN_WORLD_HOME` clan for all users).
    - `AdventurerCompany` (player-created cross-gym group: max `30` roster members, `4`-player active squad slot designation).
  - [ ] Add `Friendship` model, `GymClanSeason` standings, and `ArenaMatch` records.
  - [ ] Bind public `RaidBossInstance` encounters directly to the default **Home/Open-World Clan** and support Gym-Clan-specific raid tiers.
- [ ] **Gym Discovery & Social APIs (`apps/server`):**
  - [ ] Build gym venue search & coordinate-deduped Clan creation/joining (OSM/Places lookup + user-submitted venue fallback).
  - [ ] Build `/api/social` routes for Gym Clans, Weekly Raids, Adventurer Companies (roster + 4-player active squad management), Friends, and Leaderboards.
  - [ ] Implement Async Arena AI sparring and monthly Gym Clan seasonal scoring endpoints powered by `stepTurnBasedCombat`.
- [ ] **Social Hub UI (`apps/mobile`):**
  - [ ] Build the `Social` tab with sub-views for `My Clan & Raid | Company | Friends | Leaderboards | Arena`.
  - [ ] Integrate **Company Quartermaster NPC** and **Clan Warden NPC** dialogues for roster management, seasonal standings, and raid coordination.
- [ ] **Verification:** Database migration & seed validation, server authorization/membership tests (1 Gym Clan + default Home Clan + 1 Company), and E2E social flow tests.

---

## Milestone 6: Full RPG Illustration Polish & Real-Time Co-op Readiness
**Status:** `[ ]` Planned  
**Goal:** Deliver the high-impact visual art pass across all RPG screens and unlock live real-time multiplayer Adventurer Company co-op over WebSockets.

### Actionable Steps
- [ ] **Bespoke RPG Environment & NPC Art Pass (`apps/mobile`):**
  - [ ] Commission/generate cohesive layered backgrounds and illustrated headers for `Hero`, `Adventure` (Adventurer's Guild), `Artisan` (Forge & Apothecary), and `Social` (Clan Hall & Tavern).
  - [ ] Upgrade all hub NPC portraits (**Guide**, **Guild Receptionist**, **Trader**, **Trainer**, **Quartermaster**, **Clan Warden**) with expression variants.
  - [ ] Polish combat VFX, skill animations, and parallax battle backdrops while keeping screen density clean and scannable.
- [ ] **Real-Time Co-op Turn-Based Combat (`apps/server/src/routes/websocket.ts`, `@goki/game-engine`):**
  - [ ] Host `stepTurnBasedCombat` authoritatively in Fastify WebSocket rooms (`company-quest:{runId}`) for up to 4 active Adventurer Company squadmates.
  - [ ] Add live lobby readiness, turn countdown timers, and automatic AI takeover if a teammate disconnects.
- [ ] **Final Release QA:** Full monorepo typecheck, Vitest suite, Playwright E2E verification, and mobile performance profiling across iOS, Android, and Web.

---

## Future Backlog (Milestone 7+)
_Add new milestones and post-V1.0 expansion ideas here as they arise:_

- [ ] **M7 — Live Wearable HR Combat Sync:** Stream Zone 4–5 heart rate telemetry during hybrid/live sessions to charge rage, stamina regen, or party shields in real time.
- [ ] **M8 — Remote APNs / FCM Push Notifications:** Alert players when Company co-op lobbies open, Gym Clan raid milestones hit, or 2-hour Artisan tasks complete.
- [ ] **M9 — Cryptographic Ironman Gym Geofencing:** Hardware-verified facility attestation for Ironman-mode Gym Clan seasonal rankings.
