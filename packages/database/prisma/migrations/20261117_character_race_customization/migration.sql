DO $$ BEGIN
  CREATE TYPE "CharacterRace" AS ENUM ('HUMAN', 'ONI', 'KITSUNE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Character"
  ADD COLUMN IF NOT EXISTS "race" "CharacterRace" NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN IF NOT EXISTS "customizationConfig" JSONB;
