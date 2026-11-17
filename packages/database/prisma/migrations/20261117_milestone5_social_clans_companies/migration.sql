-- Milestone 5: Social, Gym Clans, Adventurer Companies, Friendships, Seasons, & Arena Matches

-- 1. Create new enums & extend RaidAccessType
DO $$ BEGIN
  CREATE TYPE "GymClanKind" AS ENUM ('OPEN_WORLD_HOME', 'GYM_VENUE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GymVenueSource" AS ENUM ('SYSTEM_SEED', 'OSM_OVERPASS', 'USER_SUBMITTED', 'EXTERNAL_PLACES');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClanRole" AS ENUM ('LEADER', 'WARDEN', 'OFFICER', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CompanyRole" AS ENUM ('COMMANDER', 'OFFICER', 'VETERAN', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ArenaMatchOutcome" AS ENUM ('CHALLENGER_VICTORY', 'DEFENDER_VICTORY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "RaidAccessType" ADD VALUE IF NOT EXISTS 'CLAN_ONLY';

-- 2. Extend Character for Arena rating & W/L tracking
ALTER TABLE "Character"
  ADD COLUMN IF NOT EXISTS "arenaRating" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS "arenaWins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "arenaLosses" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Character_arenaRating_idx" ON "Character"("arenaRating");

-- 3. Create GymClan & GymClanMember
CREATE TABLE IF NOT EXISTS "GymClan" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "venueKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "description" TEXT,
  "emblemIcon" TEXT NOT NULL DEFAULT 'shield_crest',
  "kind" "GymClanKind" NOT NULL DEFAULT 'GYM_VENUE',
  "venueSource" "GymVenueSource" NOT NULL DEFAULT 'USER_SUBMITTED',
  "externalPlaceId" TEXT,
  "address" TEXT,
  "city" TEXT,
  "countryCode" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "radiusMeters" INTEGER NOT NULL DEFAULT 150,
  "wardenCharacterId" TEXT,
  "clanLevel" INTEGER NOT NULL DEFAULT 1,
  "clanReputation" INTEGER NOT NULL DEFAULT 0,
  "maxMembers" INTEGER NOT NULL DEFAULT 200,
  "requiresVerifiedMode" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GymClan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymClan_slug_key" ON "GymClan"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "GymClan_venueKey_key" ON "GymClan"("venueKey");
CREATE INDEX IF NOT EXISTS "GymClan_kind_idx" ON "GymClan"("kind");
CREATE INDEX IF NOT EXISTS "GymClan_latitude_longitude_idx" ON "GymClan"("latitude", "longitude");
CREATE INDEX IF NOT EXISTS "GymClan_clanReputation_idx" ON "GymClan"("clanReputation");

DO $$ BEGIN
  ALTER TABLE "GymClan"
    ADD CONSTRAINT "GymClan_wardenCharacterId_fkey"
    FOREIGN KEY ("wardenCharacterId") REFERENCES "Character"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "GymClanMember" (
  "id" TEXT NOT NULL,
  "gymClanId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "clanKind" "GymClanKind" NOT NULL DEFAULT 'GYM_VENUE',
  "role" "ClanRole" NOT NULL DEFAULT 'MEMBER',
  "contributedReputation" INTEGER NOT NULL DEFAULT 0,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GymClanMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymClanMember_gymClanId_characterId_key" ON "GymClanMember"("gymClanId", "characterId");
CREATE UNIQUE INDEX IF NOT EXISTS "GymClanMember_characterId_clanKind_key" ON "GymClanMember"("characterId", "clanKind");
CREATE INDEX IF NOT EXISTS "GymClanMember_gymClanId_idx" ON "GymClanMember"("gymClanId");
CREATE INDEX IF NOT EXISTS "GymClanMember_userId_idx" ON "GymClanMember"("userId");

DO $$ BEGIN
  ALTER TABLE "GymClanMember"
    ADD CONSTRAINT "GymClanMember_gymClanId_fkey"
    FOREIGN KEY ("gymClanId") REFERENCES "GymClan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "GymClanMember"
    ADD CONSTRAINT "GymClanMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "GymClanMember"
    ADD CONSTRAINT "GymClanMember_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Create AdventurerCompany & AdventurerCompanyMember
CREATE TABLE IF NOT EXISTS "AdventurerCompany" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "motto" TEXT,
  "description" TEXT,
  "emblemIcon" TEXT NOT NULL DEFAULT 'banners',
  "commanderCharacterId" TEXT NOT NULL,
  "companyLevel" INTEGER NOT NULL DEFAULT 1,
  "companyReputation" INTEGER NOT NULL DEFAULT 0,
  "maxRosterSize" INTEGER NOT NULL DEFAULT 30,
  "maxActiveSquadSize" INTEGER NOT NULL DEFAULT 4,
  "requiresVerifiedMode" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdventurerCompany_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdventurerCompany_name_key" ON "AdventurerCompany"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "AdventurerCompany_tag_key" ON "AdventurerCompany"("tag");

DO $$ BEGIN
  ALTER TABLE "AdventurerCompany"
    ADD CONSTRAINT "AdventurerCompany_commanderCharacterId_fkey"
    FOREIGN KEY ("commanderCharacterId") REFERENCES "Character"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "AdventurerCompanyMember" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "role" "CompanyRole" NOT NULL DEFAULT 'MEMBER',
  "activeSquadSlot" INTEGER,
  "contributedReputation" INTEGER NOT NULL DEFAULT 0,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdventurerCompanyMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdventurerCompanyMember_characterId_key" ON "AdventurerCompanyMember"("characterId");
CREATE UNIQUE INDEX IF NOT EXISTS "AdventurerCompanyMember_companyId_activeSquadSlot_key" ON "AdventurerCompanyMember"("companyId", "activeSquadSlot");
CREATE INDEX IF NOT EXISTS "AdventurerCompanyMember_companyId_idx" ON "AdventurerCompanyMember"("companyId");

DO $$ BEGIN
  ALTER TABLE "AdventurerCompanyMember"
    ADD CONSTRAINT "AdventurerCompanyMember_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "AdventurerCompany"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AdventurerCompanyMember"
    ADD CONSTRAINT "AdventurerCompanyMember_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 5. Create Friendship
CREATE TABLE IF NOT EXISTS "Friendship" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "addresseeId" TEXT NOT NULL,
  "pairKey" TEXT NOT NULL,
  "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Friendship_pairKey_key" ON "Friendship"("pairKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");
CREATE INDEX IF NOT EXISTS "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");
CREATE INDEX IF NOT EXISTS "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

DO $$ BEGIN
  ALTER TABLE "Friendship"
    ADD CONSTRAINT "Friendship_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Friendship"
    ADD CONSTRAINT "Friendship_addresseeId_fkey"
    FOREIGN KEY ("addresseeId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 6. Create GymClanSeason
CREATE TABLE IF NOT EXISTS "GymClanSeason" (
  "id" TEXT NOT NULL,
  "gymClanId" TEXT NOT NULL,
  "seasonKey" TEXT NOT NULL,
  "totalSeasonPoints" INTEGER NOT NULL DEFAULT 0,
  "workoutPoints" INTEGER NOT NULL DEFAULT 0,
  "raidPoints" INTEGER NOT NULL DEFAULT 0,
  "arenaPoints" INTEGER NOT NULL DEFAULT 0,
  "workoutsCount" INTEGER NOT NULL DEFAULT 0,
  "raidBossesDefeated" INTEGER NOT NULL DEFAULT 0,
  "arenaVictories" INTEGER NOT NULL DEFAULT 0,
  "activeMemberCount" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GymClanSeason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymClanSeason_gymClanId_seasonKey_key" ON "GymClanSeason"("gymClanId", "seasonKey");
CREATE INDEX IF NOT EXISTS "GymClanSeason_seasonKey_totalSeasonPoints_idx" ON "GymClanSeason"("seasonKey", "totalSeasonPoints");

DO $$ BEGIN
  ALTER TABLE "GymClanSeason"
    ADD CONSTRAINT "GymClanSeason_gymClanId_fkey"
    FOREIGN KEY ("gymClanId") REFERENCES "GymClan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 7. Create ArenaMatch
CREATE TABLE IF NOT EXISTS "ArenaMatch" (
  "id" TEXT NOT NULL,
  "challengerCharacterId" TEXT NOT NULL,
  "defenderCharacterId" TEXT,
  "defenderName" TEXT NOT NULL,
  "isNpcRival" BOOLEAN NOT NULL DEFAULT false,
  "winnerCharacterId" TEXT,
  "seasonKey" TEXT NOT NULL,
  "outcome" "ArenaMatchOutcome" NOT NULL,
  "randomSeed" TEXT NOT NULL,
  "totalTurns" INTEGER NOT NULL DEFAULT 1,
  "challengerDamageDealt" INTEGER NOT NULL DEFAULT 0,
  "defenderDamageDealt" INTEGER NOT NULL DEFAULT 0,
  "challengerRatingBefore" INTEGER NOT NULL DEFAULT 1000,
  "challengerRatingAfter" INTEGER NOT NULL DEFAULT 1000,
  "defenderRatingBefore" INTEGER NOT NULL DEFAULT 1000,
  "defenderRatingAfter" INTEGER NOT NULL DEFAULT 1000,
  "goldAwarded" INTEGER NOT NULL DEFAULT 0,
  "seasonPointsAwarded" INTEGER NOT NULL DEFAULT 0,
  "combatSummary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ArenaMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ArenaMatch_challengerCharacterId_createdAt_idx" ON "ArenaMatch"("challengerCharacterId", "createdAt");
CREATE INDEX IF NOT EXISTS "ArenaMatch_defenderCharacterId_createdAt_idx" ON "ArenaMatch"("defenderCharacterId", "createdAt");
CREATE INDEX IF NOT EXISTS "ArenaMatch_seasonKey_idx" ON "ArenaMatch"("seasonKey");

DO $$ BEGIN
  ALTER TABLE "ArenaMatch"
    ADD CONSTRAINT "ArenaMatch_challengerCharacterId_fkey"
    FOREIGN KEY ("challengerCharacterId") REFERENCES "Character"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ArenaMatch"
    ADD CONSTRAINT "ArenaMatch_defenderCharacterId_fkey"
    FOREIGN KEY ("defenderCharacterId") REFERENCES "Character"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ArenaMatch"
    ADD CONSTRAINT "ArenaMatch_winnerCharacterId_fkey"
    FOREIGN KEY ("winnerCharacterId") REFERENCES "Character"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 8. Update DungeonRun (guildId -> companyId)
ALTER TABLE "DungeonRun" DROP CONSTRAINT IF EXISTS "DungeonRun_guildId_fkey";
DROP INDEX IF EXISTS "DungeonRun_guildId_idx";
ALTER TABLE "DungeonRun"
  ADD COLUMN IF NOT EXISTS "companyId" TEXT,
  DROP COLUMN IF EXISTS "guildId";
CREATE INDEX IF NOT EXISTS "DungeonRun_companyId_idx" ON "DungeonRun"("companyId");

DO $$ BEGIN
  ALTER TABLE "DungeonRun"
    ADD CONSTRAINT "DungeonRun_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "AdventurerCompany"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 9. Update RaidBossInstance (guildId -> gymClanId)
ALTER TABLE "RaidBossInstance" DROP CONSTRAINT IF EXISTS "RaidBossInstance_guildId_fkey";
DROP INDEX IF EXISTS "RaidBossInstance_guildId_status_idx";
ALTER TABLE "RaidBossInstance"
  ADD COLUMN IF NOT EXISTS "gymClanId" TEXT,
  DROP COLUMN IF EXISTS "guildId";
CREATE INDEX IF NOT EXISTS "RaidBossInstance_gymClanId_status_idx" ON "RaidBossInstance"("gymClanId", "status");

DO $$ BEGIN
  ALTER TABLE "RaidBossInstance"
    ADD CONSTRAINT "RaidBossInstance_gymClanId_fkey"
    FOREIGN KEY ("gymClanId") REFERENCES "GymClan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 10. Drop legacy Guild tables and GuildRole enum
DROP TABLE IF EXISTS "GuildMember";
DROP TABLE IF EXISTS "Guild";
DROP TYPE IF EXISTS "GuildRole";
