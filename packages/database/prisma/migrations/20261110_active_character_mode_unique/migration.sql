CREATE UNIQUE INDEX IF NOT EXISTS "Character_userId_gameMode_active_key"
ON "Character"("userId", "gameMode")
WHERE "deletedAt" IS NULL;
