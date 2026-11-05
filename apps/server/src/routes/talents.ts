import { PrismaClient } from '@gymify/database';
import {
  DEFAULT_TALENT_TREES,
  aggregateTalentModifiers,
  spendTalentPoint,
} from '@gymify/game-engine';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const unlockTalentSchema = z.object({
  nodeSlug: z.string().min(1),
});

export function registerTalentRoutes(app: FastifyInstance, db: PrismaClient): void {
  // Fetch the 6 Stat-Bound Multi-Class Talent Trees
  app.get('/api/talents/trees', async (_request, reply) => {
    return reply.send({ trees: DEFAULT_TALENT_TREES });
  });

  // Spend Stat-Specific Talent Points into any multi-class Talent Node
  app.post('/api/characters/:characterId/talents/unlock', async (request, reply) => {
    const { characterId } = z.object({ characterId: z.string() }).parse(request.params);
    const { nodeSlug } = unlockTalentSchema.parse(request.body);

    const character = await db.character.findUnique({
      where: { id: characterId },
      include: {
        stats: true,
        talentUnlocks: { include: { talentNode: true } },
      },
    });

    if (!character || !character.stats) {
      return reply.status(404).send({ error: 'Character not found.' });
    }

    const unlockedNodeRanks: Record<string, number> = {};
    const spentByStat: Record<string, number> = {};
    for (const unlock of character.talentUnlocks) {
      unlockedNodeRanks[unlock.talentNode.slug] = unlock.currentRank;
      const tree = DEFAULT_TALENT_TREES.find((t) =>
        t.nodes.some((n) => n.id === unlock.talentNode.slug)
      );
      if (tree) {
        const spent = unlock.pointsSpent ?? unlock.currentRank ?? 0;
        spentByStat[tree.governingStat] = (spentByStat[tree.governingStat] ?? 0) + spent;
      }
    }

    const spendRes = spendTalentPoint(
      {
        availablePoints: {
          STRENGTH: character.stats.strengthTalentPointsAvailable,
          ENDURANCE: character.stats.enduranceTalentPointsAvailable,
          AGILITY: character.stats.agilityTalentPointsAvailable,
          DEXTERITY:
            (character.stats as any).dexterityTalentPointsAvailable ??
            Math.max(0, (character.dexLevel ?? 5) - (spentByStat.DEXTERITY ?? 0)),
          CONSTITUTION:
            (character.stats as any).constitutionTalentPointsAvailable ??
            Math.max(0, (character.conLevel ?? 5) - (spentByStat.CONSTITUTION ?? 0)),
          WISDOM:
            (character.stats as any).wisdomTalentPointsAvailable ??
            Math.max(0, (character.wisLevel ?? 5) - (spentByStat.WISDOM ?? 0)),
          SPIRIT:
            (character.stats as any).spiritTalentPointsAvailable ??
            Math.max(0, (character.sprLevel ?? 5) - (spentByStat.SPIRIT ?? 0)),
        },
        unlockedNodeRanks,
      },
      nodeSlug,
      DEFAULT_TALENT_TREES
    );

    if (!spendRes.ok) {
      return reply.status(400).send({ error: spendRes.error });
    }

    // Ensure matching TalentNode exists in DB
    let dbNode = await db.talentNode.findUnique({ where: { slug: nodeSlug } });
    if (!dbNode) {
      const engineTree = DEFAULT_TALENT_TREES.find((t) =>
        t.nodes.some((n) => n.id === nodeSlug)
      )!;
      const engineNode = engineTree.nodes.find((n) => n.id === nodeSlug)!;
      const dbTree = await db.talentTree.upsert({
        where: { slug: engineTree.slug },
        update: {},
        create: {
          slug: engineTree.slug,
          name: engineTree.name,
          governingStat: engineTree.governingStat,
          archetypeRole: engineTree.archetypeRole,
          description: engineTree.description,
        },
      });
      dbNode = await db.talentNode.create({
        data: {
          talentTreeId: dbTree.id,
          slug: engineNode.id,
          name: engineNode.name,
          description: engineNode.description,
          tier: engineNode.tier,
          maxRank: engineNode.maxRank,
          pointCostPerRank: engineNode.pointCostPerRank,
          requiredTreePointsSpent: engineNode.requiredTreePointsSpent,
          nodeType: engineNode.nodeType,
          effectConfig: {
            passivePerRank: engineNode.passivePerRank ?? null,
            activeSkill: engineNode.activeSkill ?? null,
          } as object,
        },
      });
    }

    await db.characterTalentUnlock.upsert({
      where: {
        characterId_talentNodeId: {
          characterId,
          talentNodeId: dbNode.id,
        },
      },
      update: {
        currentRank: spendRes.newRank,
        pointsSpent: { increment: spendRes.pointsSpent },
      },
      create: {
        characterId,
        talentNodeId: dbNode.id,
        currentRank: spendRes.newRank,
        pointsSpent: spendRes.pointsSpent,
      },
    });

    let updatedStats = character.stats;
    const statUpdateData: any = {};
    if (spendRes.governingStat === 'STRENGTH') {
      statUpdateData.strengthTalentPointsAvailable = { decrement: spendRes.pointsSpent };
      statUpdateData.strengthTalentPointsSpent = { increment: spendRes.pointsSpent };
    } else if (spendRes.governingStat === 'ENDURANCE') {
      statUpdateData.enduranceTalentPointsAvailable = { decrement: spendRes.pointsSpent };
      statUpdateData.enduranceTalentPointsSpent = { increment: spendRes.pointsSpent };
    } else if (spendRes.governingStat === 'AGILITY') {
      statUpdateData.agilityTalentPointsAvailable = { decrement: spendRes.pointsSpent };
      statUpdateData.agilityTalentPointsSpent = { increment: spendRes.pointsSpent };
    }

    if (Object.keys(statUpdateData).length > 0) {
      updatedStats = await db.characterStats.update({
        where: { characterId },
        data: statUpdateData,
      });
    }

    const aggregatedTalents = aggregateTalentModifiers(spendRes.nextState.unlockedNodeRanks);

    return reply.send({
      unlockedNodeSlug: nodeSlug,
      newRank: spendRes.newRank,
      governingStat: spendRes.governingStat,
      updatedStats,
      aggregatedTalents,
    });
  });
}
