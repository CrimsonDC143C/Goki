# Gymify RPG — Gamified Multiplayer Fitness Tracker (MVP)

Cross-platform multiplayer RPG fitness tracker where manually logged real-world workouts translate directly into core character stats (`STR`, `END`, `AGI`), multi-class Talent Tree currency, automatic Tavern rest & Active Recovery buffs, 2-hour idle gathering/crafting, 24-hour solo/co-op auto-battler dungeons, and 7-day public & guild boss raids.

## Monorepo Structure

```text
.
├── docker-compose.yml          # Local PostgreSQL 16 + Redis 7 (for Prisma & BullMQ workers)
├── apps/
│   ├── mobile/                 # React Native (Expo) + Expo Web client & 2D Auto-Battler replay viewer
│   └── server/                 # Fastify + Zod REST API & BullMQ timer workers
└── packages/
    ├── database/               # PostgreSQL Prisma ORM schema, generated client, & starter seed script
    └── game-engine/            # Pure, deterministic, unit-tested RPG & fitness math engine
```

## Quickstart Guide

### 1. Install Dependencies & Build Engine
```bash
npm install
npm run db:generate
npm run build
```

### 2. Spin Up PostgreSQL + Redis & Seed Database (Phase 3 Backend)
```bash
# Start local Postgres (5432) and Redis (6379)
docker compose up -d

# Push Prisma schema & populate starter Exercises, 6 Talent Trees, Nodes, Dungeon, Guild & 7d Raids
npm run db:push
npm run db:seed

# Start Fastify API + BullMQ async workers on http://localhost:4000
npm run dev:server
```

### 3. Launch Expo Client on Desktop Browser or Physical Android Device (Phase 4 UI)
```bash
# Launch directly in desktop web browser (react-native-web):
npm run dev:web

# Or launch Expo Metro server & scan QR code in Expo Go on your Android phone:
npm run dev:mobile
```
> Note: `apps/mobile` runs `@gymify/game-engine` deterministically in-client if `localhost:4000` is offline, so you can also preview and test every screen immediately without Docker running.

### 4. Run Test Suites & Strict Typechecks
```bash
npm run db:validate   # Validate Prisma schema
npm run typecheck     # Strict TypeScript check across all 4 workspaces
npm test              # Run Vitest unit & API tests (@gymify/game-engine + @gymify/server)
```
