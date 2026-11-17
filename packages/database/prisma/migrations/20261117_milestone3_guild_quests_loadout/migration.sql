DO $$ BEGIN
  CREATE TYPE "GuildQuestCategory" AS ENUM ('LIVE_QUEST', 'RANK_UP_TRIAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GuildQuestRunStatus" AS ENUM ('IN_PROGRESS', 'VICTORY', 'DEFEAT', 'ABANDONED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Character"
  ADD COLUMN IF NOT EXISTS "activeSkillLoadout" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "beltLoadout" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "GuildQuest" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" "GuildQuestCategory" NOT NULL DEFAULT 'LIVE_QUEST',
  "requiredAdventurerRank" "AdventurerRank" NOT NULL DEFAULT 'COPPER',
  "unlocksRank" "AdventurerRank",
  "recommendedPower" INTEGER NOT NULL DEFAULT 60,
  "wavesConfig" JSONB NOT NULL,
  "trialRequirements" JSONB,
  "goldReward" INTEGER NOT NULL DEFAULT 100,
  "reputationReward" INTEGER NOT NULL DEFAULT 50,
  "lootTable" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuildQuest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GuildQuest_slug_key" ON "GuildQuest"("slug");
CREATE INDEX IF NOT EXISTS "GuildQuest_category_requiredAdventurerRank_idx" ON "GuildQuest"("category", "requiredAdventurerRank");

CREATE TABLE IF NOT EXISTS "GuildQuestRun" (
  "id" TEXT NOT NULL,
  "clientRunId" TEXT,
  "questId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "status" "GuildQuestRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "randomSeed" TEXT NOT NULL,
  "companionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "partySnapshot" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "checkpointState" JSONB,
  "actionLog" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "wavesCleared" INTEGER NOT NULL DEFAULT 0,
  "totalTurns" INTEGER NOT NULL DEFAULT 0,
  "consumablesUsed" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "rewardsGranted" JSONB,
  "rankPromotedTo" "AdventurerRank",
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "syncedFromOffline" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuildQuestRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GuildQuestRun_clientRunId_key" ON "GuildQuestRun"("clientRunId");
CREATE INDEX IF NOT EXISTS "GuildQuestRun_characterId_status_idx" ON "GuildQuestRun"("characterId", "status");
CREATE INDEX IF NOT EXISTS "GuildQuestRun_questId_idx" ON "GuildQuestRun"("questId");

DO $$ BEGIN
  ALTER TABLE "GuildQuestRun"
    ADD CONSTRAINT "GuildQuestRun_questId_fkey"
    FOREIGN KEY ("questId") REFERENCES "GuildQuest"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "GuildQuestRun"
    ADD CONSTRAINT "GuildQuestRun_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
