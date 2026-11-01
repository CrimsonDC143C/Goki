# Gymify RPG — Gamified Multiplayer Fitness Tracker

Cross-platform multiplayer RPG fitness tracker where real-world workouts translate directly into a holistic 7-stat character progression system (`STR`, `END`, `AGI`, `DEX`, `CON`, `WIS`, `SPR`), 10 stat-bound Talent Trees, automatic Tavern rest & Active Recovery buffs, 2-hour idle gathering/crafting professions, 24-hour solo/co-op auto-battler dungeons, 7-day public & guild boss raids, and hardware-verified Ironman Mode biometrics via Apple HealthKit & Google Health Connect.

---

## Monorepo Structure

```text
Gymify RPG/
├── docker-compose.yml          # Local PostgreSQL 16 + Redis 7 (for Prisma & BullMQ workers)
├── package.json                # Monorepo root (npm workspaces, Vitest, Playwright, TypeScript)
├── playwright.config.ts        # Playwright E2E configuration for full-stack integration testing
├── render.yaml                 # 1-Click Render Cloud blueprint (Fastify Server, Postgres, Redis)
├── tsconfig.base.json          # Shared TypeScript base configuration (Node16 module resolution)
├── apps/
│   ├── mobile/                 # React Native (Expo SDK 58) + Expo Web client & 2D Auto-Battler replay viewer
│   └── server/                 # Fastify + Zod REST & WebSocket API, BullMQ timer workers
└── packages/
    ├── database/               # PostgreSQL Prisma ORM 6.4 schema (31 models, 26 enums), seed & client
    └── game-engine/            # Pure, deterministic, zero-dependency RPG & fitness mathematical engine
```

---

## Quickstart Guide

### 1. Install Dependencies & Build Engine
```bash
npm install
npm run db:generate
npm run build
```

### 2. Spin Up PostgreSQL + Redis & Seed Database
```bash
# Start local Postgres (5432) and Redis (6379)
docker compose up -d

# Push Prisma schema (31 models, 26 enums) & populate starter Exercises, 10 Talent Trees, Nodes, Dungeons, Guild & 7d Raids
npm run db:push
npm run db:seed

# Start Fastify API + BullMQ async workers on http://localhost:4000
npm run dev:server
```

### 3. Launch Expo Client on Desktop Browser or Mobile Device
```bash
# Launch directly in desktop web browser (react-native-web):
npm run dev:web

# Or launch Expo Metro server & scan QR code in Expo Go on your Android/iOS phone:
npm run dev:mobile
```
> **Offline-First Resilience:** `apps/mobile` runs `@gymify/game-engine` deterministically in-client if `localhost:4000` is offline, so you can preview and test every screen immediately without Docker running.

### 4. Run Test Suites & Strict Typechecks
```bash
npm run db:validate   # Validate Prisma schema
npm run typecheck     # Strict TypeScript check across all 4 workspaces
npm test              # Run Vitest unit & API tests (85 passing tests across game-engine & server)
npm run test:e2e      # Run Playwright full-stack E2E tests (auth, offline logging, background sync)
```

---

## Diagnostics, Bug Reporting, & Crash Handling

Gymify RPG includes a built-in offline-first diagnostic subsystem:

* **Persistent Bug Reports (`packages/database`):** Relational `BugReport` model tracking severity (`INFO`, `WARNING`, `ERROR`, `FATAL`), category (`UI_UX`, `WORKOUT_SYNC`, `WEARABLE_TELEMETRY`, `COMBAT_DUNGEON`, `CRASH_EXCEPTION`, `OTHER`), triage status (`OPEN`, `INVESTIGATING`, `RESOLVED`, `IGNORED`), sanitized snapshots, breadcrumb ring-buffers, and device metadata.
* **REST API (`apps/server`):**
  * `POST /api/diagnostics/report`: Accepts reports anonymously or with Bearer JWT, validated via Zod.
  * `GET /api/diagnostics/reports`: Protected endpoint with multi-criteria filtering (`severity`, `category`, `status`, `limit`).
  * `PATCH /api/diagnostics/reports/:id`: Protected endpoint for developer status triage.
  * **Developer Webhook Forwarding:** Set `DIAGNOSTICS_WEBHOOK_URL` (Discord/Slack incoming webhook) in `.env` to receive real-time color-coded crash alerts.
  * **Global Fastify Hook:** Automatically persists unhandled 500 server errors to `BugReport`.
* **Mobile Ring-Buffer & Exception Boundary (`apps/mobile`):**
  * `DiagnosticLogger`: 100-event rolling ring-buffer, recursive credential sanitization (`password`, `jwt`, `bearer`), and offline outbox (`@gymify_bug_report_outbox`) with automatic reconnection flush.
  * `ErrorBoundary`: High-contrast "Encounter Interrupted" crash recovery screen with **Zero Lost Sets Guarantee** and startup crash prompt (`@gymify_pending_crash_report`).
  * `BugReportModal`: Manual bug reporting interface accessible via the top HUD and Profile screen, complete with an expandable diagnostic JSON viewer and clipboard copy fallback.

---

## Technical Documentation

For the complete architectural blueprint, mathematical formulas, state machine definitions, Ironman verification protocols, and cloud infrastructure specifications, refer to:

👉 **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — *Gymify RPG Project State of Affairs & Technical Brief*
