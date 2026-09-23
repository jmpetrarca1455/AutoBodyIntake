import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralized, validated environment configuration.
 * Fails fast at boot if required values are malformed.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  DATABASE_URL: z.string().optional(),

  // Public base URL of the customer intake app; used to build shop links/QRs.
  INTAKE_BASE_URL: z.string().url().default('http://localhost:8081'),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Where uploaded files live when no S3/R2 credentials are configured
  // (great for local dev). Ignored when the S3 driver is active.
  UPLOAD_DIR: z.string().default('./uploads'),
  // How long (seconds) a generated download link stays valid.
  DOWNLOAD_URL_TTL: z.coerce.number().int().positive().default(900),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('AutoBody Intake <intake@example.com>'),

  // SMS status updates (Twilio). Leave blank to use the "preview" fallback
  // (logged + stored, never actually sent) — zero-config dev.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),

  // Global request rate limiting (protects public, unauthenticated intake
  // endpoints from abuse). Generous defaults for legitimate multi-photo
  // submissions; tighten per-route later if needed.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  // Shop portal auth (JWT). Falls back to an obviously-insecure dev secret
  // so local setup works with zero config — MUST be overridden in production.
  JWT_SECRET: z.string().default('dev-insecure-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // AI triage layer. Falls back to a deterministic rule-based summarizer
  // when no key is set, so the feature works with zero cloud setup.
  OPENAI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gpt-4o-mini'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type AppConfig = typeof config;

export const isProd = config.NODE_ENV === 'production';

if (isProd && config.JWT_SECRET === 'dev-insecure-secret-change-me') {
  // eslint-disable-next-line no-console
  console.error('❌ Refusing to start in production with the default JWT_SECRET.');
  process.exit(1);
}

/**
 * True when an OpenAI key is configured. When false, the AI triage layer
 * falls back to a deterministic rule-based summarizer.
 */
export const hasOpenAI = Boolean(config.OPENAI_API_KEY);
export const aiDriver: 'openai' | 'rules' = hasOpenAI ? 'openai' : 'rules';

/**
 * True when all S3/R2 credentials are present. When false, the app falls back
 * to local-disk storage so development works with zero cloud setup.
 */
export const hasS3Storage = Boolean(
  config.S3_BUCKET && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY,
);

/** Active storage backend, derived from configuration. */
export const storageDriver: 's3' | 'local' = hasS3Storage ? 's3' : 'local';

/**
 * True when a Resend API key is configured. When false, emails are written to
 * disk as a preview (.html) instead of sent, so the flow is testable offline.
 */
export const hasEmail = Boolean(config.RESEND_API_KEY);
export const emailDriver: 'resend' | 'preview' = hasEmail ? 'resend' : 'preview';

/**
 * True when Twilio credentials are configured. When false, SMS "sends" are
 * logged + stored as a preview instead of actually dispatched — so the
 * status-update flow is fully testable with zero telecom setup.
 */
export const hasTwilio = Boolean(
  config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_FROM_NUMBER,
);
export const smsDriver: 'twilio' | 'preview' = hasTwilio ? 'twilio' : 'preview';

