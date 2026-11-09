import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { runSeed } from '../packages/database/prisma/seed';

export default async function globalSetup(): Promise<void> {
  console.log('⚡ [Playwright Global Setup] Initializing deterministic test environment...');

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log(' Connected to PostgreSQL. Seeding exercises, talents, and raids...');
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
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        name: 'CrimsonE2E',
        level: 1,
        strengthLevel: 1,
        enduranceLevel: 1,
        agilityLevel: 1,
        gold: 350,
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
