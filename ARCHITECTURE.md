# Gymify RPG — Project State of Affairs & Technical Brief

> **Document Purpose:** Comprehensive architectural and operational summary of the Gymify RPG codebase. Designed to be provided to any LLM or software engineer with zero prior context to immediately enable accurate technical comprehension, architectural analysis, and actionable contribution.

---

## 1. Executive Summary & Core Philosophy

**Gymify RPG** is a cross-platform, multiplayer gamified fitness tracker built as an offline-first TypeScript monorepo. It bridges real-world physical training with classic RPG character progression:

* **Physical-to-Digital Translation:** Real-world workouts (resistance training, cardio, sports, active recovery) are converted deterministically into three core RPG stats: **Strength (STR)**, **Endurance (END)**, and **Agility (AGI)**.
* **Dual-Paced Behavioral Loops:**
  * **Intra-Workout ("Zero Cognitive Drag"):** High-contrast, minimal-tap, haptic-driven UI designed for the gym floor. Focus locks prevent menu distractions while dynamic rest timers, plate warm-up calculations, and live PR tracking run seamlessly.
  * **Extra-Workout ("Tavern & World Hub"):** Rich metagame featuring a 6-class talent tree, 8-slot equipment loadouts, 2-hour idle gathering/crafting professions, 24-hour solo/co-op auto-battler dungeons, and 7-day public/guild boss raids.
* **Honesty-First MVP with Future "Ironman" Hooks:** Built on a 100% manual logging honesty system for rapid prototyping, but architected with non-breaking database hooks (`GameMode`: `STANDARD` vs `IRONMAN_VERIFIED`, `VerificationSource`: `MANUAL_HONESTY`, `APPLE_HEALTHKIT`, `GOOGLE_HEALTH_CONNECT`, `WEARABLE_TELEMETRY`) for future wearable/biometric enforcement.
* **Dual Runtime Engine:** The core RPG and fitness math lives in a zero-dependency package (`@gymify/game-engine`) that runs identically in Node.js (backend) and React Native / Expo Web (client). The mobile app remains fully functional and deterministic even when completely offline or disconnected from the server.

---

## 2. Monorepo Architecture & Tech Stack

```text
Gymify RPG/
├── docker-compose.yml              # Local PostgreSQL 16 & Redis 7 services
├── package.json                    # Monorepo root (npm workspaces, Vitest, TypeScript)
├── packages/
│   ├── game-engine/                # Pure deterministic math & RPG mechanics (@gymify/game-engine)
│   └── database/                   # Prisma ORM schema, client, & starter seed (@gymify/database)
└── apps/
    ├── server/                     # Fastify REST API & BullMQ async timer workers (@gymify/server)
    └── mobile/                     # React Native Expo SDK 58 + Expo Web client (@gymify/mobile)
```

| Layer | Technology | Key Libraries & Roles |
| :--- | :--- | :--- |
| **Monorepo** | npm workspaces | TypeScript 5.7+ / 6.0+, Vitest 2.1, Node >= 20.0 |
| **Game Engine** | Pure TypeScript | Seeded PRNG (`createSeededRng`), zero external runtime dependencies |
| **Database** | PostgreSQL 16 + Prisma ORM 6.4 | 22 relational models, 19 enums, automated seed migrations |
| **Backend API** | Fastify 5.2 (Node.js) | Zod 3.24 schema validation, `@fastify/cors`, BigInt JSON serializers |
| **Async Queues** | Redis 7 + BullMQ 5.34 | Scheduled workers for 2h gathering, 24h dungeons, 24h rest, 7d raids |
| **Mobile Client** | React Native (Expo SDK 58) | `react-native-web` (Web), `expo-file-system`, `expo-haptics`, `expo-notifications`, `react-native-svg` |

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
* **Talent Points:** Gained independently on level-up for the respective stat (`STR`, `END`, or `AGI`) and spent strictly within that stat's archetype trees.

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

1. **Multi-Class Talent Trees (10 Stat-Bound Archetypes):**
   * **Strength:** *Juggernaut* (armor, threat, damage reduction) & *Vanguard* (party damage mitigation, heavy cleaves).
   * **Endurance:** *Warden* (hazard mitigation, sustained party regeneration) & *Outrider* (cooldown haste, initiative, trailblazing).
   * **Agility:** *Berserker* (crit multiplier, execute damage, low-HP rage) & *Assassin* (crit chance, backstab bleed, dodge counter).
   * **Wisdom:** *Cleric* (divine healing power multiplier, restorative party preservation).
   * **Spirit:** *Mage* (arcane focus, maximum mana boost, spellcasting efficiency).
   * **Dexterity:** *Acrobat* (acrobatic reflexes, trap evasion, precision evasion).
   * **Constitution:** *Guardian* / *Warden Tank* (iron fortitude, maximum health boost, restorative resilience).
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
               Offline Local-First     │             │ REST API / JSON
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
   * Superset block definitions (A1/A2), set type metadata ([N], [W], [D], [F]), and 5 tailored starter presets (`workout-presets-rest.ts`).
   * Dynamic gathering cadence and stat affinity calculation (`gathering-calculator.ts`).
   * 10 stat-bound talent trees across all 7 holistic stats, point spending constraints, combat modifier aggregation, and tier prerequisite validation (`talent-engine.ts`).
   * Deterministic auto-battler simulation with room hazards, boss cleaves, and combat logs (`auto-battler-sim.ts`).
   * 7-day raid contribution scoring and tier reward resolution (`raid-rewards.ts`).
   * Equipment stat bonus aggregation and requirement checking (`character-loadout-spoils.ts`).
   * Biometric telemetry verification, physiological sanity filtering (35–240 BPM), flatline variance checks, cardiovascular zone confidence scoring (`verifyTelemetry`), mind-body activity verification via OS cryptographic classification and stable heart rate variance (`verifyMindBodyTelemetry`), and recovery telemetry verification via sleep stage validation and pedometer step verification (`verifyRecoveryTelemetry`) (`ironman-verifier.ts`).
2. **Database & Persistence Layer (`packages/database`):**
   * Complete 994-line Prisma schema with PostgreSQL models for all domain entities.
   * Fully functional seed script (`seed.ts`) populating exercise catalog (adapted for Altas AL-3058G smith/cable machine, Pepin dumbbells, badminton, boxing, cycling), 10 talent trees across all 7 stats with tier-1 starter nodes, items, gathering nodes, dungeon catacombs, guild trials, and 2 active weekly raids.
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
   * High-fidelity audio and 2D sprite asset pipeline utilizing `expo-audio` for native sound playback and `expo-image` for hardware-accelerated sprite rendering, orchestrated by the `AudioManager` singleton with procedural synthesizer fallbacks, haptic-synchronized SFX via `sensoryFeedback.ts`, floating damage numbers and hit-flash animations in `AutoBattlerCanvas.tsx`, and a persistent Gym Silence toggle in `CharacterProfileScreen.tsx`.
   * Three top-level modes on Landing Screen:
     * **Quick Offline Workout:** Zero latency, local storage persistence, set types, superset groupings, and automatic queueing for server sync.
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
  * [`render.yaml`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/render.yaml) — Render blueprint orchestrating PostgreSQL, Redis (BullMQ), and Fastify API web service.
  * [`eas.json`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/eas.json) — Expo Application Services (EAS) build profiles for standalone Android APK and iOS preview distributions.
* **Game Engine Core:**
  * [`hybrid-reward-protocol.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/hybrid-reward-protocol.ts) — 5-state FSM, 1.25x arrival boon, chest scoring, resilience logic.
  * [`workout-calculator.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/workout-calculator.ts) — e1RM formulas, PR criteria, XP calculations across STR, END, AGI.
  * [`workout-presets-rest.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/workout-presets-rest.ts) — Superset groupings, set type badges, starter presets, dynamic rest intervals.
  * [`auto-battler-sim.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/auto-battler-sim.ts) — Tick-by-tick deterministic dungeon simulator and combat replay engine.
  * [`gathering-calculator.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/gathering-calculator.ts) — Stat-affinity gathering cadence and yield formulas.
  * [`talent-engine.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/talent-engine.ts) — 6 talent trees, rank spending rules, modifier aggregation.
  * [`fatigue-manager.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/fatigue-manager.ts) — Systemic fatigue penalties, tavern rest transitions, active recovery buffs.
  * [`ironman-verifier.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/game-engine/src/ironman-verifier.ts) — Pure telemetry verification function, physiological anomaly detection, and confidence scoring.
* **Database & Server:**
  * [`schema.prisma`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/database/prisma/schema.prisma) — Complete PostgreSQL schema definition (994 lines).
  * [`seed.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/packages/database/prisma/seed.ts) — Exercises, starter presets, talent nodes, starter items, 24h dungeon, and 7d raids.
  * [`index.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/index.ts) — Fastify server entrypoint with cloud-ready `0.0.0.0` binding and dynamic port configuration.
  * [`app.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/app.ts) — Fastify instance builder, error handlers, JWT authentication, WebSockets, BigInt serialization hooks.
  * [`apps/server/src/middleware/auth.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/middleware/auth.ts) — JWT validation and route protection.
  * [`apps/server/src/routes/auth.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/routes/auth.ts) — Registration, login, and profile resolution.
  * [`apps/server/src/services/websocket-manager.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/services/websocket-manager.ts) — Room-based connection manager and BigInt-safe pubsub broadcaster.
  * [`apps/server/src/routes/websocket.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/routes/websocket.ts) — Real-time WebSocket connection route with JWT authentication.
  * [`bullmq-workers.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/server/src/queues/bullmq-workers.ts) — Redis and BullMQ async worker scheduler.
* **Mobile Client:**
  * [`App.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/App.tsx) — Top-level shell, HUD, focus lock banner, navigation between Landing, Offline, and World.
  * [`apiClient.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/api/apiClient.ts) — Dynamic API URL resolution (`resolveApiBaseUrl`) with automatic Bearer token injection.
  * [`apps/mobile/src/api/tokenStorage.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/api/tokenStorage.ts) — Multi-platform secure token persistence.
  * [`apps/mobile/src/api/websocketClient.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/api/websocketClient.ts) — Cross-platform WebSocket client with dynamic URL resolution (`resolveWsBaseUrl`), auto-reconnect, and room subscriptions.
  * [`apps/mobile/src/hooks/useWebSocket.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/hooks/useWebSocket.ts) — Declarative React hook for room-based synchronization.
  * [`apps/mobile/src/services/wearableTelemetry.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/services/wearableTelemetry.ts) — Unified wearable telemetry abstraction for Apple HealthKit and Google Health Connect.
  * [`apps/mobile/src/services/AudioManager.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/services/AudioManager.ts) — Cross-platform audio manager with preloading, sound presets, procedural synthesis fallback, and gym silence mute persistence.
  * [`apps/mobile/assets/sprites/index.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/assets/sprites/index.ts) — 2D sprite asset registry supporting drop-in PNG/WebP files and vector data URIs for heroes, enemies, and loot chests.
  * [`apps/mobile/src/utils/sensoryFeedback.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/utils/sensoryFeedback.ts) — Low-latency somatic haptics combined with `AudioManager` SFX cues.
  * [`GameContext.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/state/GameContext.tsx) — Monolithic state manager coordinating local engine fallback, offline sync queue, and server API calls.
  * [`WorkoutLoggerScreen.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/screens/WorkoutLoggerScreen.tsx) — Live hybrid workout interface with boss damage, micro-ticks, dynamic rest, and loot chest opening.
  * [`OfflineWorkoutScreen.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/screens/OfflineWorkoutScreen.tsx) — Local-first standalone logger with instant local storage persistence.
  * [`AutoBattlerCanvas.tsx`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/components/AutoBattlerCanvas.tsx) — 2D replay canvas animating combat logs generated by the engine.
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
       |   |   - Node.js Runtime (Node >= 20.0)                              |   |
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
       |   | - 22 Models, 19 Enums      |   | - MaxMemory: noeviction        |   |
       |   | - Internal Connection URI  |   | - 4 Scheduled Worker Queues    |   |
       |   +----------------------------+   +--------------------------------+   |
       +-------------------------------------------------------------------------+
```

### A. Backend Deployment: Render Blueprint (`render.yaml`)

The backend is fully declaratively configured via the repository root [`render.yaml`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/render.yaml) Blueprint, enabling 1-click infrastructure provisioning on Render:

1. **PostgreSQL Database (`gymify-postgres`):**
   * Managed PostgreSQL 16 database running with internal network isolation.
   * Auto-provisions the database connection string and injects `DATABASE_URL` directly into the Fastify Web Service.
2. **Redis Service (`gymify-redis`):**
   * Managed Redis instance dedicated to BullMQ async queue workers (`gathering-completion`, `dungeon-resolution`, `fatigue-transition`, `raid-rollover`).
   * Configured with `maxmemoryPolicy: noeviction` to ensure BullMQ delayed jobs and repeatable timers are never prematurely evicted under memory pressure.
   * Connection string is automatically injected as `REDIS_URL`.
3. **Fastify Node.js Web Service (`gymify-server`):**
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
2. **iOS Testing & Ad-Hoc Builds:**
   * Configured with `"ios": { "simulator": true }` for local iOS Simulator verification on macOS without requiring Apple Developer Program membership.
   * Ready for internal ad-hoc distribution via Apple Developer ad-hoc provisioning profiles.
3. **Dynamic Remote Environment Resolution:**
   * `eas.json` injects `EXPO_PUBLIC_API_URL` pointing to the Render web service URL (e.g. `https://gymify-server.onrender.com`).
   * [`apiClient.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/api/apiClient.ts) and [`websocketClient.ts`](file:///c:/Users/Icarus/Desktop/Gymify%20RPG/apps/mobile/src/api/websocketClient.ts) dynamically resolve base URLs at runtime:
     * Reads `process.env.EXPO_PUBLIC_API_URL` first.
     * Automatically maps `http(s)://` to `ws(s)://` for persistent bi-directional WebSockets (`resolveWsBaseUrl()`).
     * Automatically detects local LAN host IPs via `Constants.expoConfig.hostUri` when developing with Expo Go, preventing `localhost` routing failures on physical mobile devices.
