import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/gymify_rpg?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  CORS_ORIGIN: z.string().default('*'),
  JWT_SECRET: z.string().default('gymify_jwt_super_secret_dev_secret_key_2026'),
  DIAGNOSTICS_WEBHOOK_URL: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  APP_LATEST_VERSION: z.string().default('0.2.0'),
  APP_MIN_REQUIRED_VERSION: z.string().default('0.1.0'),
  ANDROID_APK_DOWNLOAD_URL: z
    .string()
    .default('https://expo.dev/artifacts/eas/cl7bfJE2S84ueb4LuUG0ygjs4jvN51jLO1SbKpsN9M0.apk'),
  APP_RELEASE_NOTES: z
    .string()
    .default('Performance improvements, bug fixes, and new RPG content.'),
});

export type ServerEnv = z.infer<typeof envSchema>;

export const env: ServerEnv = envSchema.parse(process.env);

/**
 * Recursively converts `bigint` properties into safe JSON numbers/strings so Fastify
 * responses containing `RaidBossInstance` HP/damage fields serialize cleanly.
 */
export function serializeBigInts<T>(value: T): unknown {
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeBigInts(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeBigInts(v);
    }
    return out;
  }
  return value;
}
