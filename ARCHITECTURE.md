# Gymify RPG — Project State of Affairs & Technical Brief

> **Document Purpose:** Comprehensive architectural and operational summary of the Gymify RPG codebase. Designed to be provided to any LLM or software engineer with zero prior context to immediately enable accurate technical comprehension, architectural analysis, and actionable contribution.

---

## 1. Executive Summary & Core Philosophy

**Gymify RPG** is a cross-platform, multiplayer gamified fitness tracker built as an offline-first TypeScript monorepo. It bridges real-world physical training with classic RPG character progression:

* **Physical-to-Digital Translation:** Real-world workouts (resistance training, low/moderate cardio, high-intensity VO2 max sport, calisthenics, daily steps, sleep, mobility, and mindfulness) are converted deterministically into a holistic **7-Stat RPG System**: **Strength (STR)**, **Endurance (END)**, **Agility (AGI)**, **Dexterity (DEX)**, **Constitution (CON)**, **Wisdom (WIS)**, and **Spirit (SPR)**, with full backward compatibility for legacy 3-stat profiles.
* **Dual-Paced Behavioral Loops:**
  * **Intra-Workout ("Zero Cognitive Drag"):** High-contrast, minimal-tap, haptic-driven UI designed for the gym floor. Focus locks prevent menu distractions while dynamic rest timers, plate warm-up calculations, real-time exercise search/filtering, and live PR tracking run seamlessly. Real-time audio cues run natively via `expo-audio` with a procedural Web Audio synthesizer fallback and a persistent Gym Silence toggle.
  * **Extra-Workout ("Tavern & World Hub"):** Rich metagame featuring 10 stat-bound talent trees across all 7 stats, 8-slot equipment loadouts, 2-hour idle gathering/crafting professions (Mining, Foraging, Smelting, Alchemy), 24-hour solo/co-op auto-battler dungeons, and 7-day public/guild boss raids.
* **Operational Ironman Verification & Hardware Telemetry:** Dual-mode architecture (`STANDARD` vs `IRONMAN_VERIFIED`). Native telemetry pipeline interfaces with Apple HealthKit (`react-native-health`) and Google Health Connect (`react-native-health-connect`), featuring permission negotiation, session BPM streaming, activity classifications, sleep stages, and pedometer steps. Server-side validation routines (`verifyTelemetry`, `verifyMindBodyTelemetry`, `verifyRecoveryTelemetry`) perform physiological sanity checks (35–240 BPM), flatline checks, and cryptographic verification to prevent spoofing.
* **Dual Runtime Engine:** The core RPG and fitness math lives in a zero-dependency package (`@gymify/game-engine`) that runs identically in Node.js (backend) and React Native / Expo Web (client). The mobile app remains fully functional and deterministic even when completely offline or disconnected from the server.

---

## 2. Monorepo Architecture & Tech Stack

```text
Gymify RPG/
├── docker-compose.yml              # Local PostgreSQL 16 & Redis 7 services
├── package.json                    # Monorepo root (npm workspaces, Vitest, Playwright, TypeScript)
├── playwright.config.ts            # E2E test harness (Fastify API + Expo Web)
├── render.yaml                     # Render Blueprint (Fastify Web Service, PostgreSQL 16, Redis 7)
├── tsconfig.base.json              # Shared TypeScript base configuration (Node16 module resolution)
├── packages/
│   ├── game-engine/                # Pure deterministic math & RPG mechanics (@gymify/game-engine)
│   └── database/                   # PostgreSQL Prisma ORM 6.4 schema, seed, & client (@gymify/database)
└── apps/
    ├── server/                     # Fastify REST/WebSocket API & BullMQ async timer workers (@gymify/server)
    └── mobile/                     # React Native Expo SDK 58 + Expo Web client (@gymify/mobile)
```

| Layer | Technology | Key Libraries & Roles |
| :--- | :--- | :--- |
| **Monorepo** | npm workspaces | TypeScript 5.7+ / 6.0+, Vitest 2.1, Playwright 1.64, Node >= 20.0 |
| **Game Engine** | Pure TypeScript | Seeded PRNG (`createSeededRng`), zero external runtime dependencies, Metro source export |
| **Database** | PostgreSQL 16 + Prisma ORM 6.4 | 31 relational models, 26 enums, automated seed migrations (1,034 lines schema) |
| **Backend API** | Fastify 5.2 (Node.js) | Zod 3.24 schema validation, `@fastify/jwt`, `@fastify/websocket`, `@fastify/cors`, BigInt JSON serializers |
| **Async Queues** | Redis 7 + BullMQ 5.34 | Scheduled workers for 2h gathering, 24h dungeons, 24h rest, 7d raids with in-memory test fallback |
| **Mobile Client** | React Native 0.88 (Expo SDK 58) | `react-native-web` (Web), `expo-audio`, `expo-image`, `expo-secure-store`, `expo-notifications`, `expo-haptics`, `react-native-svg`, `react-native-health`, `react-native-health-connect`, `expo-build-properties` |

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
* **Dynamic Rest & Stamina Ring Timers:** Calculates target rest (45s warmup, 90s–180s compound/heavy sets, RPE-scaled) and counts down on a visual SVG stamina ring. Local push notifications and haptics fire when stamina is full.
* **Resilience Bonus (Anti-Streak Collapse):** Returning after $\ge 72\text{ hours}$ or training in "Low Energy Mode" grants a flat bonus (+50 XP, +35 Gold, +15% XP) and resilience shields, combating the "what-the-hell" abandonment effect.
* **Effort-Gated Loot Chests:** Post-workout chest tiers (**Common**, **Rare**, **Epic**) depend on an effort score (0–100) derived from progressive overload, RPE, and relative intensity—**not** empty volume bloat.

### E. Metagame Systems

1. **Multi-Class Talent Trees (10 Stat-Bound Archetypes across 7 Stats):**
   * **Strength:** *Juggernaut* (armor, threat, damage barriers) & *Vanguard* (burst damage, armor-piercing cleaves).
   * **Endurance:** *Warden* (hazard mitigation, sustained party regen) & *Outrider* (cooldown haste, initiative, trailblazing).
   * **Agility:** *Berserker* (crit multiplier, execute damage, low-HP rage) & *Assassin* (crit chance, backstab bleed, dodge counter).
   * **Dexterity:** *Acrobat* (acrobatic reflexes, trap evasion, precision strikes).
   * **Constitution:** *Guardian* (iron fortitude, maximum health pool, damage mitigation).
   * **Wisdom:** *Cleric* (divine healing power multiplier, restorative party preservation).
   * **Spirit:** *Mage* (arcane focus, maximum mana boost, spellcasting efficiency).
2. **2-Hour Idle Gathering & Crafting:**
   * Professions: Mining, Foraging, Smelting, Alchemy.
   * Player stats reduce the tick interval (from a base 5 min down to 1 min) and boost yield (e.g., AGI accelerates foraging cadence; END sustains mining stamina; STR boosts ore yields).
   * Supports custom duration goals, push notification alerts on completion, and retroactive offline tick reconciliation.
3. **24-Hour Dungeons & Auto-Battler Replay:**
   * 1–5 player party expeditions spanning a 24-hour real-time window.
   * Real-world workouts completed mid-window inject live buffs into the expedition party (e.g., *Titanic Force*, *Tailwind Haste*).
   * Deterministic auto-battler engine simulates combat tick-by-tick ($250\text{ms}$ ticks) with RNG seeds.
   * Replayed visually on the mobile client using a 2D canvas animator (`AutoBattlerCanvas.tsx`).
4. **Guilds, Rank Trials, & 7-Day Raid Sanctums:**
   * Adventurer ranks from **Copper** to **Mythic**, unlocked via specific guild bounties and physical rank-up trials.
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
                            [@gymify/game-engine]  [Prisma ORM]
                            (Deterministic Math)     │
                                                     ▼
                                            [PostgreSQL 16 DB]
```

### Test Suite & Typecheck Health
* **Vitest Suite:** `10/10` test files passing in `packages/game-engine` (66 tests), `4/4` test files passing in `apps/server` (10 tests). Total: **76 passing tests, 0 failures**.
* **Playwright E2E Suite:** Automated end-to-end integration covering full-stack authentication, offline workout set logging, and background queue synchronization. Orchestrated via `playwright.config.ts` (multi-process web servers for Fastify and Expo Web), deterministic Prisma database seeding via `global-setup.ts`, and network route interception (`page.route()`) to simulate offline-to-online transitions.
* **TypeScript:** Strict typechecking passes cleanly across all 4 workspaces (`@gymify/mobile`, `@gymify/server`, `@gymify/database`, `@gymify/game-engine`).
* **Monorepo Build:** `npm run build` succeeds across all workspaces without bundling errors.

### Complete & Operational Subsystems
1. **Engine Layer (`packages/game-engine`):**
   * PR calculation, progressive overload tracking, and set RPE normalization (`workout-calculator.ts`).
   * 5-state Hybrid FSM, 1.25x arrival boon, resilience comeback logic, chest quality evaluator (`hybrid-reward-protocol.ts`).
   * Superset block definitions (A1/A2), set type metadata ([N], [W], [D], [F], [AMRAP]), 4 top-level workout categories (GYM, CARDIO, SPORT, RECOVERY), and 5 tailored starter presets (`workout-presets-rest.ts`).
   * Dynamic gathering cadence and stat affinity calculation (`gathering-calculator.ts`).
   * 10 stat-bound talent trees across all 7 holistic stats, point spending constraints, combat modifier aggregation, and tier prerequisite validation (`talent-engine.ts`).
   * Deterministic auto-battler simulation with room hazards, boss cleaves, and combat logs (`auto-battler-sim.ts`).
   * 7-day raid contribution scoring and tier reward resolution (`raid-rewards.ts`).
   * Equipment stat bonus aggregation and requirement checking (`character-loadout-spoils.ts`).
   * Biometric telemetry verification, physiological sanity filtering (35–240 BPM), flatline variance checks, cardiovascular zone confidence scoring (`verifyTelemetry`), mind-body activity verification via OS cryptographic classification and stable heart rate variance (`verifyMindBodyTelemetry`), and recovery telemetry verification via sleep stage validation and pedometer step verification (`verifyRecoveryTelemetry`) (`ironman-verifier.ts`, 15 unit tests).
2. **Database & Persistence Layer (`packages/database`):**
   * Complete 1,034-line Prisma schema with 31 models and 26 enums for all domain entities.
   * Fully functional seed script (`seed.ts`) populating exercise catalog (adapted for Altas AL-3058G smith/cable machine, Pepin dumbbells, badminton, boxing, cycling), 10 talent trees across all 7 stats with tier-1 starter nodes, items, gathering nodes, dungeon catacombs, guild trials, and 2 active weekly raids.
   * Configured with aligned `rootDir` and explicit export maps for seamless monorepo TypeScript/JavaScript compilation.
3. **Backend API & Queue Layer (`apps/server`):**
   * Fastify application with Zod validation on all workout, character, preset, dungeon, gathering, and raid routes.
   * Production JWT authentication and password hashing via `@fastify/jwt` and `bcryptjs` (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`), route protection with `requireAuth` middleware, and user context attachment.
   * Real-time bi-directional synchronization via `@fastify/websocket` and `websocketManager` with room multicasting (`raid:{raidId}`, `dungeon:{dungeonId}`), BigInt-safe serialization, and JWT connection authentication (`GET /api/ws/connect`).
   * Telemetry payload ingestion and server-side biometric re-verification routed dynamically across `verifyTelemetry`, `verifyMindBodyTelemetry`, and `verifyRecoveryTelemetry` on `POST /api/workouts`, setting hardware verification sources (`APPLE_HEALTHKIT`, `GOOGLE_HEALTH_CONNECT`, `WEARABLE_TELEMETRY`), tagging verified stat XP, and promoting character mode to `IRONMAN_VERIFIED`.
   * Pre-serialization hook for converting `BigInt` (raid damage, HP) into JSON-compatible values.
   * Redis + BullMQ runtime with 4 active queues (`gathering-completion`, `dungeon-resolution`, `fatigue-transition`, `raid-rollover`) plus an in-memory no-op fallback for headless testing.
4. **Mobile & Web Client (`apps/mobile`):**
   * Multi-platform secure token persistence via Expo Secure Store (`expo-secure-store`) with web `localStorage` fallback, automatic JWT restoration on startup, and Bearer token injection on API requests.
   * Real-time WebSocket synchronization via `GymifyWebSocketClient` and `useWebSocket` hook featuring auto-reconnect logic with exponential backoff, room subscriptions, and instant live raid UI updates.
   * Hardware wearable integration via `UnifiedWearableService` interfacing with Apple HealthKit (`react-native-health`) and Google Health Connect (`react-native-health-connect`), featuring permission requests, live session BPM polling, intra-workout HUD metrics, fetching OS Activity Classifications, Sleep Stages (Core, Deep, REM, Awake), and Pedometer step data, and payload bundling into the sync queue.
   * High-fidelity audio and 2D sprite asset pipeline utilizing modern `expo-audio` for native sound playback and `expo-image` for hardware-accelerated sprite rendering, orchestrated by the `AudioManager` singleton with procedural synthesizer fallbacks, haptic-synchronized SFX via `sensoryFeedback.ts`, floating damage numbers and hit-flash animations in `AutoBattlerCanvas.tsx`, and a persistent Gym Silence toggle in `CharacterProfileScreen.tsx`.
   * Real-time exercise search and filtering in `OfflineWorkoutScreen.tsx` with instant substring matching, active pill highlighting, and scroll containment.
   * Custom Routine Designer modal (`PresetDesignerModal.tsx`) allowing users to compose, customize, and persist tailored multi-exercise workout templates.
   * Workout Category Gateway (`WorkoutCategoryGateway.tsx`) enabling athletes to select between Gym/Resistance, Cardio, Sport, and Active Recovery logging workflows.
   * Three top-level modes on Landing Screen:
     * **Quick Offline Workout:** Zero latency, local storage persistence, set types, superset groupings, real-time exercise search filter, and automatic queueing for server sync.
     * **Enter Dungeon (Live Hybrid):** Full 5-state workout loop, boss encounter damage, dynamic rest timer, stamina ring, live BPM wearable HUD, and focus lock.
     * **Enter World:** Complete RPG navigation hub featuring a 7-Stat UI overhaul in the Character Profile (displaying STR, END, AGI, DEX, CON, WIS, SPR with levels and XP progress bars), dynamic multi-stat XP receipts in post-workout summaries, TalentBuilder across all 10 trees, GatheringNode, Dungeon, and GuildHall.
   * Low-latency (<15ms) haptic feedback (iOS/Android) and Web Audio harmonic synth fallback (Web).
   * Local push notifications for rest timer completion and gathering node capacity.
   * Visual 2D auto-battler combat replay screen (`AutoBattlerCanvas.tsx`).

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

* **Deployment & Cloud Infrastructure:**
  * [`render.yaml`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/render.yaml) — Render blueprint orchestrating PostgreSQL (`free`), Redis (`free`), and Fastify API web service (`free`).
  * [`apps/mobile/eas.json`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/eas.json) — Expo Application Services (EAS) build profiles for standalone Android APK and iOS preview distributions.
  * [`apps/mobile/app.json`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/app.json) — Expo native configuration, HealthKit / Health Connect permissions, `expo-build-properties` (`minSdkVersion: 26`, Proguard disabled).
* **Game Engine Core:**
  * [`packages/game-engine/src/hybrid-reward-protocol.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/hybrid-reward-protocol.ts) — 5-state FSM, 1.25x arrival boon, chest scoring, resilience logic.
  * [`packages/game-engine/src/workout-calculator.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/workout-calculator.ts) — e1RM formulas, PR criteria, XP calculations across all 7 holistic stats.
  * [`packages/game-engine/src/workout-presets-rest.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/workout-presets-rest.ts) — Superset groupings, set type badges, workout categories, starter presets, dynamic rest intervals.
  * [`packages/game-engine/src/auto-battler-sim.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/auto-battler-sim.ts) — Tick-by-tick deterministic dungeon simulator and combat replay engine.
  * [`packages/game-engine/src/gathering-calculator.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/gathering-calculator.ts) — Stat-affinity gathering cadence and yield formulas.
  * [`packages/game-engine/src/talent-engine.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/talent-engine.ts) — 10 stat-bound talent trees across 7 stats, rank spending rules, modifier aggregation.
  * [`packages/game-engine/src/fatigue-manager.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/fatigue-manager.ts) — Systemic fatigue penalties, tavern rest transitions, active recovery buffs.
  * [`packages/game-engine/src/ironman-verifier.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/ironman-verifier.ts) — Pure telemetry verification function, physiological anomaly detection, and confidence scoring (15 unit tests).
* **Database & Server:**
  * [`packages/database/prisma/schema.prisma`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/database/prisma/schema.prisma) — Complete PostgreSQL schema definition (31 models, 26 enums, 1,034 lines).
  * [`packages/database/prisma/seed.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/database/prisma/seed.ts) — Exercises, starter presets, 10 talent trees, starter items, 24h dungeon, and 7d raids.
  * [`apps/server/src/index.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/index.ts) — Fastify server entrypoint with cloud-ready `0.0.0.0` binding and dynamic port configuration.
  * [`apps/server/src/app.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/app.ts) — Fastify instance builder, error handlers, JWT authentication, WebSockets, BigInt serialization hooks.
  * [`apps/server/src/middleware/auth.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/middleware/auth.ts) — JWT validation and route protection.
  * [`apps/server/src/routes/auth.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/routes/auth.ts) — Registration, login, and profile resolution.
  * [`apps/server/src/routes/workouts.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/routes/workouts.ts) — Workout submission, telemetry validation (`verifyTelemetry`, `verifyMindBodyTelemetry`, `verifyRecoveryTelemetry`), and character progression.
  * [`apps/server/src/services/websocket-manager.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/services/websocket-manager.ts) — Room-based connection manager and BigInt-safe pubsub broadcaster.
  * [`apps/server/src/routes/websocket.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/routes/websocket.ts) — Real-time WebSocket connection route with JWT authentication.
  * [`apps/server/src/queues/bullmq-workers.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/queues/bullmq-workers.ts) — Redis and BullMQ async worker scheduler.
* **Mobile Client:**
  * [`apps/mobile/App.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/App.tsx) — Top-level shell, HUD, focus lock banner, navigation between Landing, Offline, and World.
  * [`apps/mobile/src/api/apiClient.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/api/apiClient.ts) — Dynamic API URL resolution (`resolveApiBaseUrl`) with automatic Bearer token injection.
  * [`apps/mobile/src/api/tokenStorage.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/api/tokenStorage.ts) — Multi-platform secure token persistence.
  * [`apps/mobile/src/api/websocketClient.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/api/websocketClient.ts) — Cross-platform WebSocket client with dynamic URL resolution (`resolveWsBaseUrl`), auto-reconnect, and room subscriptions.
  * [`apps/mobile/src/hooks/useWebSocket.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/hooks/useWebSocket.ts) — Declarative React hook for room-based synchronization.
  * [`apps/mobile/src/services/wearableTelemetry.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/services/wearableTelemetry.ts) — Unified wearable telemetry abstraction for Apple HealthKit and Google Health Connect.
  * [`apps/mobile/src/services/AudioManager.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/services/AudioManager.ts) — Cross-platform audio manager with `expo-audio`, sound presets, procedural synthesis fallback, and gym silence mute persistence.
  * [`apps/mobile/assets/sprites/index.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/assets/sprites/index.ts) — 2D sprite asset registry supporting drop-in PNG/WebP files and vector data URIs for heroes, enemies, and loot chests.
  * [`apps/mobile/src/utils/sensoryFeedback.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/utils/sensoryFeedback.ts) — Low-latency somatic haptics combined with `AudioManager` SFX cues.
  * [`apps/mobile/src/state/GameContext.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/state/GameContext.tsx) — Monolithic state manager coordinating local engine fallback, offline sync queue, and server API calls.
  * [`apps/mobile/src/screens/WorkoutLoggerScreen.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/screens/WorkoutLoggerScreen.tsx) — Live hybrid workout interface with boss damage, micro-ticks, dynamic rest, and loot chest opening.
  * [`apps/mobile/src/screens/OfflineWorkoutScreen.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/screens/OfflineWorkoutScreen.tsx) — Local-first standalone logger with instant local storage persistence and exercise search filter.
  * [`apps/mobile/src/screens/CharacterProfileScreen.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/screens/CharacterProfileScreen.tsx) — 7-stat character progression HUD, equipment loadouts, Ironman badge, Gym Silence audio toggle.
  * [`apps/mobile/src/screens/TalentBuilderScreen.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/screens/TalentBuilderScreen.tsx) — Interactive multi-class talent builder spanning all 10 trees.
  * [`apps/mobile/src/components/AutoBattlerCanvas.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/components/AutoBattlerCanvas.tsx) — 2D replay canvas animating combat logs generated by the engine.
  * [`apps/mobile/src/components/PresetDesignerModal.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/components/PresetDesignerModal.tsx) — Custom routine creation modal with exercise search and superset block configuration.
  * [`apps/mobile/src/components/WorkoutCategoryGateway.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/components/WorkoutCategoryGateway.tsx) — Gateway selector routing workouts into GYM, CARDIO, SPORT, or RECOVERY modalities.
* **E2E Testing & Orchestration:**
  * [`playwright.config.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/playwright.config.ts) — Monorepo E2E web server orchestration (Fastify + Expo Web).
  * [`e2e/global-setup.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/e2e/global-setup.ts) — Deterministic test database seeding and environment verification.
  * [`e2e/auth.spec.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/e2e/auth.spec.ts) — Full-stack authentication journey and token storage verification.
  * [`e2e/workout-sync.spec.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/e2e/workout-sync.spec.ts) — Offline-first loop, rest timers, and background sync queue verification.

---

## 7. Deployment & Infrastructure

```
                   +-------------------------------------------------+
                   |           Mobile Clients (Production)           |
                   |   - Android Standalone APK (EAS preview)        |
                   |   - iOS Simulator / Ad-Hoc Build (EAS preview)  |
                   |   - Web SPA Client (Expo Web / Static Hosting)  |
                   +-----------------------+-------------------------+
                                           |
                                HTTPS / WSS API Requests
                        (EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WS_URL)
                                           |
                                           v
       +-------------------------------------------------------------------------+
       |                         Render Cloud Platform                           |
       |                              (render.yaml)                              |
       |                                                                         |
       |   +-----------------------------------------------------------------+   |
       |   |                     Fastify Web Service                         |   |
       |   |                      (gymify-server)                            |   |
       |   |   - Node.js Runtime (Node >= 20.0, Free Plan)                   |   |
       |   |   - Bound to 0.0.0.0:${PORT}                                    |   |
       |   |   - Build: npm install --include=dev && npx prisma generate --schema=./packages/database/prisma/schema.prisma && npm run build |   |
       |   |   - Start: npm start --workspace=@gymify/server                 |   |
       |   |   - Injected Env: DATABASE_URL, REDIS_URL, NODE_ENV=production   |   |
       |   +--------------------+-----------------------+--------------------+   |
       |                        |                       |                        |
       |             Prisma ORM |                       | BullMQ Redis Client    |
       |                        v                       v                        |
       |   +----------------------------+   +--------------------------------+   |
       |   |    PostgreSQL Database     |   |       Redis Key-Value          |   |
       |   |     (gymify-postgres)      |   |        (gymify-redis)          |   |
       |   | - 31 Models, 26 Enums      |   | - MaxMemory: noeviction        |   |
       |   | - Internal Connection URI  |   | - 4 Scheduled Worker Queues    |   |
       |   | - Free Plan                |   | - Free Plan                    |   |
       |   +----------------------------+   +--------------------------------+   |
       +-------------------------------------------------------------------------+
```

### A. Backend Deployment: Render Blueprint (`render.yaml`)

The backend is fully declaratively configured via the repository root [`render.yaml`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/render.yaml) Blueprint, enabling 1-click infrastructure provisioning on Render:

1. **PostgreSQL Database (`gymify-postgres`):**
   * Managed PostgreSQL 16 database running on Render's `free` plan with internal network isolation.
   * Auto-provisions the database connection string and injects `DATABASE_URL` directly into the Fastify Web Service.
2. **Redis Service (`gymify-redis`):**
   * Managed Redis instance on Render's `free` plan dedicated to BullMQ async queue workers (`gathering-completion`, `dungeon-resolution`, `fatigue-transition`, `raid-rollover`).
   * Configured with `maxmemoryPolicy: noeviction` to ensure BullMQ delayed jobs and repeatable timers are never prematurely evicted under memory pressure.
   * Connection string is automatically injected as `REDIS_URL`.
3. **Fastify Node.js Web Service (`gymify-server`):**
   * **Plan:** Render `free` tier plan.
   * **Build Command:** `npm install --include=dev && npx prisma generate --schema=./packages/database/prisma/schema.prisma && npm run build` (installs devDependencies in production, generates Prisma client, and compiles all workspaces).
   * **Start Command:** `npm start --workspace=@gymify/server` (launches `dist/index.js`).
   * **Network Binding:** Binds explicitly to `host: '0.0.0.0'` and dynamic port `port: Number(process.env.PORT) || 4000` to satisfy Render cloud ingress routing.
   * **Injected Environment:**
     * `NODE_ENV: production`
     * `DATABASE_URL`: Injected from `gymify-postgres` connection string.
     * `REDIS_URL`: Injected from `gymify-redis` connection string.
     * `JWT_SECRET`: Cryptographically generated via Render `generateValue: true`.
     * `CORS_ORIGIN: "*"` (supports both mobile clients and web clients).

### B. Mobile Client Deployment: Expo Application Services (`eas.json`)

Mobile builds are automated and configured using [`apps/mobile/eas.json`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/eas.json) to facilitate frictionless direct distribution to friends and playtesters:

1. **Standalone Android APK Distribution:**
   * Configured with `"android": { "buildType": "apk" }` under the `preview` profile.
   * Compiles an installable `.apk` binary rather than a Google Play App Bundle (`.aab`), enabling direct sideloading and file sharing via Discord/Telegram/Drive without Google Play Console review delays.
   * Configured with `minSdkVersion: 26` via `expo-build-properties` to satisfy Google Health Connect SDK requirements.
   * Configured with `enableProguardInReleaseBuilds: false` to avoid R8 minification stripping Health Connect and Expo reflection classes during release compilation.
   * Pre-build lifecycle hook (`"eas-build-pre-build": "cd ../../ && npm run build --workspace=@gymify/game-engine"`) compiles the pure engine bundle prior to Metro bundle packaging.
2. **iOS Testing & Ad-Hoc Builds:**
   * Configured with `"ios": { "simulator": true }` for local iOS Simulator verification on macOS without requiring Apple Developer Program membership.
   * Ready for internal ad-hoc distribution via Apple Developer ad-hoc provisioning profiles.
3. **Dynamic Remote Environment Resolution:**
   * `eas.json` injects `EXPO_PUBLIC_API_URL` pointing to the Render web service URL (`https://gymify-server.onrender.com`).
   * [`apiClient.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/api/apiClient.ts) and [`websocketClient.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/api/websocketClient.ts) dynamically resolve base URLs at runtime:
     * Reads `process.env.EXPO_PUBLIC_API_URL` first.
     * Automatically maps `http(s)://` to `ws(s)://` for persistent bi-directional WebSockets (`resolveWsBaseUrl()`).
     * Automatically detects local LAN host IPs via `Constants.expoConfig.hostUri` when developing with Expo Go, preventing `localhost` routing failures on physical mobile devices.

---

## 6. Offline-First Bug Reporting, Breadcrumb Logging, & Fatal Exception Subsystem

To guarantee the **"Zero Lost Sets Guarantee"** and provide enterprise observability without telemetry vendor lock-in, Gymify RPG incorporates a unified diagnostic subsystem spanning `@gymify/database`, `@gymify/server`, `@gymify/game-engine`, and `@gymify/mobile`.

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
  * **Optional Authentication (`optionalAuth`):** If a valid Bearer JWT is passed, the user's `userId` is automatically bound to the report. If unauthenticated, reports are gracefully accepted anonymously so startup/login crashes are never dropped.
  * **Developer Alert Webhook:** If the `DIAGNOSTICS_WEBHOOK_URL` environment variable (Discord or Slack incoming webhook) is configured, the server asynchronously dispatches a rich color-coded embed with error snippets and severity tags without blocking the HTTP response.
* **`GET /api/diagnostics/reports`:** Protected route (`requireAuth`) supporting query filters (`severity`, `category`, `status`, `limit`) ordered chronologically descending (`createdAt desc`).
* **`PATCH /api/diagnostics/reports/:id`:** Protected route (`requireAuth`) allowing developers to update report triage states (`OPEN`, `INVESTIGATING`, `RESOLVED`, `IGNORED`).
* **Fastify Global Error Hook:** Unhandled 500 server exceptions automatically persist to `BugReport` with `severity: FATAL` and `deviceMetadata: { source: 'fastify-server' }`.

### C. In-Memory Ring Buffer & Sanitization (`@gymify/game-engine` & `DiagnosticLogger`)

* **Rolling Ring Buffer (`BreadcrumbRingBuffer`):**
  * Maintains an in-memory rolling buffer of the last 100 breadcrumbs (`timestamp`, `level: 'info' | 'warn' | 'error' | 'action'`, `category`, `message`, `data`).
  * When capacity is exceeded, oldest entries automatically roll off (`shift()`).
* **Automated Credential Sanitization (`sanitizeDiagnosticData`):**
  * Recursively redacts sensitive dictionary keys (`password`, `passwd`, `token`, `jwt`, `auth`, `secret`, `bearer`, `private_key`, `authorization`, `apikey`) to `"[REDACTED]"`.
  * Regular expressions redact embedded JWTs (`eyJ...`) and Bearer authorization tokens in string fields.
* **Console Interception:** Wraps `console.warn` and `console.error` with a boolean recursion guard to automatically capture unhandled warnings and console logs without recursive infinite loops.
* **Global Exception Hooks:** Listens on React Native's `ErrorUtils.setGlobalHandler` and Web `window.addEventListener('error')` / `window.addEventListener('unhandledrejection')`. Crashes immediately serialize to `@gymify_pending_crash_report` in local storage.
* **Offline-First Report Outbox Queue:**
  * Submissions via `DiagnosticLogger.submitDiagnosticReport(payload)` attempt an immediate POST to `/api/diagnostics/report`.
  * If offline or the network drops, the report is saved locally to `@gymify_bug_report_outbox`.
  * `DiagnosticLogger.flushBugReportOutbox()` is invoked automatically when connectivity returns (`online` event), when the app returns to foreground (`AppState: active`), or during `GameContext` offline workout sync passes.

### D. Mobile UI: Error Boundary, Bug Report Modal, & Developer Sanctum (`apps/mobile`)

* **`ErrorBoundary.tsx`:**
  * Root React Class Error Boundary wrapping `App.tsx`.
  * **"Zero Lost Sets Guarantee":** High-contrast dark fantasy recovery screen reassuring athletes that their local workout draft, sets, and rest timer progress are safely persisted in local storage.
  * Provides an optional user note input, a **"Transmit Crash Scroll to Developers"** button, and a **"Reload & Resume"** button.
  * On application startup, checks for `@gymify_pending_crash_report` from prior sessions and displays a non-intrusive prompt allowing the athlete to transmit the crash scroll.
* **`BugReportModal.tsx`:**
  * Accessible from the top RPG Character HUD and the `CharacterProfileScreen` badge strip.
  * Allows selecting categories (`Feature Suggestion`, `UI / Display`, `Workout Sync`, `Wearable Telemetry`, `Combat & Dungeon`, `Other`), entering titles and descriptions, and toggling diagnostic logs inclusion.
  * Dynamically pivots modal UI when **💡 Feature Suggestion** is selected: sets severity to `INFO`, adjusts placeholders for gameplay/mechanic proposals, and styles the submission button with a positive emerald theme.
  * Contains an expandable **"View Recent Logs & Telemetry"** accordion with a **"Copy JSON"** button allowing athletes and QA testers to inspect or export their diagnostic bundle directly.
* **`DeveloperTriageModal.tsx` ("Developer Sanctum"):**
  * Accessible directly from `CharacterProfileScreen` via the **🛠️ Dev Triage** badge button.
  * Connects to `GET /api/diagnostics/reports` to inspect live reports directly from mobile or desktop browser without needing database GUI clients.
  * Provides multi-dimensional filter chips (`Status`: `ALL`, `OPEN`, `INVESTIGATING`, `RESOLVED`, `IGNORED`; `Severity`: `ALL`, `FATAL`, `ERROR`, `WARNING`, `INFO`; `Type`: `All Items`, `💡 Suggestions`, `🐛 Bugs Only`, `💥 Crashes`, `🔄 Sync`, `🎨 UI/UX`).
  * Visual separation: **Feature Suggestions** are highlighted with emerald card borders and badges to immediately stand out from red crash exceptions and critical warnings.
  * Expanding a card reveals full stack traces, component stacks, sanitized state snapshots, and rolling breadcrumb event timelines.
  * Includes one-tap status updates (`Investigate`, `Resolve`, `Ignore`, `Reopen`) via `PATCH /api/diagnostics/reports/:id` and a `Copy Full JSON` action.

---

## VIII. Workout-Safe Dual-Layer Auto-Update System

### A. Dual-Layer Update Architecture
Gymify RPG targets diverse deployment targets including Standalone Android APKs, iOS builds (via EAS), and Expo Web. Updates are classified into two distinct operational layers:
1. **Over-The-Air (OTA) Updates (`expo-updates`):**
   * Transmits updated JavaScript bundles and UI assets instantly to existing installed clients.
   * Configured via runtime policy `appVersion` and EAS update channels (`preview`, `production`).
   * Downloads occur asynchronously in the background without halting application execution.
2. **Native Binary / APK Upgrades (`/api/version`):**
   * Required when adding new native device libraries, updating Android permissions (e.g. Health Connect / Bluetooth), or modifying native SDK configurations.
   * Serves an authoritative version manifest from the backend detailing the latest release, minimum required version, direct APK download links, and release notes.

### B. Pure Mathematical Version Comparison (`@gymify/game-engine`)
* **`parseSemver(version)`:** Cleans and decomposes semantic version strings (handling `v` prefixes, prereleases, and numeric tokens) into `{ major, minor, patch, prerelease }`.
* **`compareSemver(a, b)`:** Returns `-1` (`a < b`), `0` (`a == b`), or `1` (`a > b`), adhering strictly to SemVer precedence standards.
* **`isUpdateAvailable(current, latest)`:** Evaluates whether target latest version is newer than running client.
* **`isForceUpdateRequired(current, minRequired)`:** Determines if the client is below the backend's minimum required operational threshold.

### C. Backend Version Manifest Endpoint (`apps/server`)
* **`GET /api/version`:** Public, non-authenticated endpoint returning:
  * `latestVersion`: `process.env.APP_LATEST_VERSION` (default `"0.1.0"`)
  * `minRequiredVersion`: `process.env.APP_MIN_REQUIRED_VERSION` (default `"0.1.0"`)
  * `androidApkDownloadUrl`: Direct link to latest EAS preview/production APK build
  * `releaseNotes`: Descriptive summary of the release
  * `serverTimestamp`: ISO timestamp of the response

### D. Multi-Trigger Detection & Workout-Safe Reload Guard (`apps/mobile`)
* **Multi-Trigger Polling:**
  1. **Cold Start:** Queried immediately on initial application boot.
  2. **Foreground Resume:** Triggered whenever the athlete returns to Gymify RPG (`AppState: active`).
  3. **Periodic Heartbeat:** Background polling every 15 minutes while the app remains open.
  4. **Manual In-App Check:** One-tap `🔄 Updates` button with inline version badge in `CharacterProfileScreen`.
* **"Zero Interrupted Sets Guarantee":**
  * When an OTA download finishes, `AutoUpdateManager` consults registered workout guards (`isIntraWorkoutFocusLocked(phase)` and active draft set progress).
  * If the athlete is currently training, resting, or holds uncompleted sets, the reload is staged under `WAITING_FOR_WORKOUT`.
  * An ambient HUD pill (`UpdateBanner`) informs the athlete: `"✨ Update Downloaded — Will install after workout"`.
  * Athletes have the option to trigger `"Reload Now (Draft Saved)"`, which securely commits drafts before restarting.
  * When the session transitions to `Idle` or concludes `LootReview`, the update is automatically applied.

