import { BugReportCategory, BugReportSeverity, BugReportStatus, Prisma, PrismaClient } from '@gymify/database';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config';
import { optionalAuth, requireAuth } from '../middleware/auth';

const severityEnum = z.enum(['INFO', 'WARNING', 'ERROR', 'FATAL']);
const categoryEnum = z.enum([
  'UI_UX',
  'WORKOUT_SYNC',
  'WEARABLE_TELEMETRY',
  'COMBAT_DUNGEON',
  'CRASH_EXCEPTION',
  'FEATURE_SUGGESTION',
  'OTHER',
]);
const statusEnum = z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED']);

const breadcrumbSchema = z.object({
  timestamp: z.union([z.number(), z.string()]),
  level: z.enum(['info', 'warn', 'error', 'action']).default('info'),
  category: z.string().max(100).default('general'),
  message: z.string().max(2000),
  data: z.record(z.unknown()).optional().nullable(),
});

export const createBugReportSchema = z.object({
  severity: severityEnum.default('ERROR'),
  category: categoryEnum.default('OTHER'),
  title: z.string().min(1, 'Title is required').max(250, 'Title is too long'),
  userDescription: z.string().max(4000).optional().nullable(),
  errorMessage: z.string().max(4000).optional().nullable(),
  stackTrace: z.string().max(25000).optional().nullable(),
  componentStack: z.string().max(25000).optional().nullable(),
  breadcrumbs: z.array(breadcrumbSchema).max(200).optional().default([]),
  stateSnapshot: z.record(z.unknown()).optional().default({}),
  deviceMetadata: z.record(z.unknown()).optional().default({}),
  characterId: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
});

export const queryReportsSchema = z.object({
  severity: severityEnum.optional(),
  category: categoryEnum.optional(),
  status: statusEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const updateReportStatusSchema = z.object({
  status: statusEnum,
});

export async function forwardWebhookAlert(
  webhookUrl: string,
  report: {
    id: string;
    severity: string;
    category: string;
    title: string;
    userDescription?: string | null;
    errorMessage?: string | null;
    stackTrace?: string | null;
    userId?: string | null;
    createdAt?: Date | string;
  }
): Promise<void> {
  const isFeatureSuggestion = report.category === 'FEATURE_SUGGESTION';

  const severityEmoji: Record<string, string> = {
    FATAL: '💥 [FATAL]',
    ERROR: '🚨 [ERROR]',
    WARNING: '⚠️ [WARNING]',
    INFO: 'ℹ️ [INFO]',
  };

  const tag = isFeatureSuggestion
    ? '💡 [FEATURE SUGGESTION]'
    : (severityEmoji[report.severity] ?? '🐛 [BUG]');

  const embedColor: Record<string, number> = {
    FATAL: 0xe02424,
    ERROR: 0xf05252,
    WARNING: 0xff8a4c,
    INFO: 0x3f83f8,
  };

  const color = isFeatureSuggestion ? 0x10b981 : (embedColor[report.severity] ?? 0xf05252);
  const headline = isFeatureSuggestion
    ? `💡 **Feature Suggestion: ${report.title}**`
    : `${tag} **Bug Report: ${report.title}**`;

  const payload = {
    content: headline,
    embeds: [
      {
        title: isFeatureSuggestion ? `💡 Suggestion: ${report.title}` : report.title,
        description: report.userDescription || (isFeatureSuggestion ? 'No details provided.' : 'No user description provided.'),
        color,
        fields: [
          { name: 'Report ID', value: report.id, inline: true },
          { name: 'Severity', value: report.severity, inline: true },
          { name: 'Category', value: isFeatureSuggestion ? '💡 Feature Suggestion' : report.category, inline: true },
          { name: 'User ID', value: report.userId || 'Anonymous', inline: true },
          ...(report.errorMessage
            ? [
                {
                  name: 'Error Message',
                  value: `\`\`\`\n${report.errorMessage.slice(0, 500)}\n\`\`\``,
                  inline: false,
                },
              ]
            : []),
          ...(report.stackTrace
            ? [
                {
                  name: 'Stack Trace Snippet',
                  value: `\`\`\`\n${report.stackTrace.slice(0, 950)}\n\`\`\``,
                  inline: false,
                },
              ]
            : []),
        ],
        timestamp: (report.createdAt instanceof Date ? report.createdAt : new Date()).toISOString(),
      },
    ],
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Non-blocking catch to ensure developer notifications never break or crash app flow
    console.error('Failed to dispatch diagnostics webhook alert:', err);
  }
}

export function registerDiagnosticsRoutes(app: FastifyInstance, db: PrismaClient): void {
  /**
   * POST /api/diagnostics/report
   * Offline-friendly submission of diagnostic bug reports & fatal exceptions.
   * Allows optional authentication: Bearer JWT is attached if present, otherwise accepted anonymously.
   */
  app.post(
    '/api/diagnostics/report',
    {
      preHandler: optionalAuth,
    },
    async (request, reply) => {
      const parsed = createBugReportSchema.parse(request.body);

      // Authenticated user ID takes precedence if present in JWT token
      const resolvedUserId = (request.user as { userId?: string } | undefined)?.userId ?? parsed.userId ?? null;

      const created = await db.bugReport.create({
        data: {
          severity: parsed.severity as BugReportSeverity,
          category: parsed.category as BugReportCategory,
          status: 'OPEN' as BugReportStatus,
          title: parsed.title,
          userDescription: parsed.userDescription ?? null,
          errorMessage: parsed.errorMessage ?? null,
          stackTrace: parsed.stackTrace ?? null,
          componentStack: parsed.componentStack ?? null,
          breadcrumbs: parsed.breadcrumbs as unknown as Prisma.InputJsonValue,
          stateSnapshot: parsed.stateSnapshot as unknown as Prisma.InputJsonValue,
          deviceMetadata: parsed.deviceMetadata as unknown as Prisma.InputJsonValue,
          userId: resolvedUserId,
          characterId: parsed.characterId ?? null,
        },
      });

      // Asynchronously fire developer alert webhook if configured (without blocking response)
      const webhookUrl = env.DIAGNOSTICS_WEBHOOK_URL || process.env.DIAGNOSTICS_WEBHOOK_URL;
      if (webhookUrl) {
        forwardWebhookAlert(webhookUrl, created).catch(() => {});
      }

      return reply.status(201).send({
        ok: true,
        id: created.id,
        status: created.status,
        createdAt: created.createdAt,
      });
    }
  );

  /**
   * GET /api/diagnostics/reports
   * Protected developer endpoint to query recent bug reports.
   */
  app.get(
    '/api/diagnostics/reports',
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const query = queryReportsSchema.parse(request.query);

      const where: {
        severity?: BugReportSeverity;
        category?: BugReportCategory;
        status?: BugReportStatus;
      } = {};

      if (query.severity) where.severity = query.severity as BugReportSeverity;
      if (query.category) where.category = query.category as BugReportCategory;
      if (query.status) where.status = query.status as BugReportStatus;

      const reports = await db.bugReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      });

      return reply.send({
        reports,
        total: reports.length,
      });
    }
  );

  /**
   * PATCH /api/diagnostics/reports/:id
   * Protected endpoint to update a report's status (OPEN, INVESTIGATING, RESOLVED, IGNORED).
   */
  app.patch(
    '/api/diagnostics/reports/:id',
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { status } = updateReportStatusSchema.parse(request.body);

      const updated = await db.bugReport.update({
        where: { id },
        data: { status: status as BugReportStatus },
      });

      return reply.send({
        ok: true,
        report: updated,
      });
    }
  );
}
