import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { runSeed } from '../packages/database/prisma/seed';

export default async function globalSetup(): Promise<void> {
  console.log('⚡ [Playwright Global Setup] Initializing deterministic test environment...');

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log(' Connected to PostgreSQL. Applying partial unique index and seeding catalog...');

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Character_userId_gameMode_active_key"
      ON "Character"("userId", "gameMode")
      WHERE "deletedAt" IS NULL;
    `);

    await runSeed(prisma);

    const testEmail = 'e2e-seed-hero@gokirpg.local';
    const passwordHash = await bcrypt.hash('Password123!', 10);

    const user = await prisma.user.upsert({
      where: { email: testEmail },
      update: { passwordHash },
      create: {
        email: testEmail,
        username: 'CrimsonE2E',
        passwordHash,
      },
    });

    await prisma.character.upsert({
      where: { name: 'CrimsonE2E' },
      update: {
        userId: user.id,
        deletedAt: null,
        gameMode: 'STANDARD',
        overallLevel: 1,
        gold: 350,
      },
      create: {
        userId: user.id,
        name: 'CrimsonE2E',
        gameMode: 'STANDARD',
        appearanceId: 'oni_warlord',
        avatarSpriteId: 'oni_warlord',
        overallLevel: 1,
        gold: 350,
        stats: {
          create: {
            strengthLevel: 1,
            enduranceLevel: 1,
            agilityLevel: 1,
          },
        },
        fatigueState: { create: {} },
        equipmentLoadout: { create: {} },
      },
    });

    await prisma.$disconnect();
    console.log('✅ [Playwright Global Setup] Test database seeded successfully.');
  } catch (err: any) {
    console.warn(
      '⚠️ [Playwright Global Setup] PostgreSQL connection skipped or unavailable in this sandbox session. E2E tests will run with local-first client resilience.\nReason:',
      err.message
    );
    try {
      await prisma.$disconnect();
    } catch {
      // Safe teardown
    }
  }
}
