import { z } from 'zod';

const csv = (fallback = '') =>
  z
    .string()
    .optional()
    .transform((value) =>
      (value ?? fallback)
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    );

const intEnv = (fallback: number, min = 0) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === '') {
        return fallback;
      }
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Entier >= ${min} attendu` });
        return z.NEVER;
      }
      return parsed;
    });

const boolEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === '') {
        return fallback;
      }
      if (value === 'true' || value === '1') {
        return true;
      }
      if (value === 'false' || value === '0') {
        return false;
      }
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Booléen attendu (true/false)' });
      return z.NEVER;
    });

const jsonEnv = <T extends z.ZodTypeAny>(schema: T) =>
  z.string().transform((value, ctx) => {
    try {
      return schema.parse(JSON.parse(value));
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'JSON invalide' });
      return z.NEVER;
    }
  });

export const fieldMapSchema = z.object({
  items: z.string().min(1),
  externalId: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  sourceStatus: z.string().min(1),
  clientName: z.string().optional(),
  alertEmails: z.string().optional(),
  criticality: z.string().optional(),
});
export type FieldMap = z.infer<typeof fieldMapSchema>;

export const sourceStatusMapSchema = z.record(
  z.string(),
  z.object({
    monitoringEnabled: z.boolean().optional(),
    state: z.enum(['MAINTENANCE']).nullable().optional(),
  }),
);
export type SourceStatusMap = z.infer<typeof sourceStatusMapSchema>;

const DEFAULT_FIELD_MAP: FieldMap = {
  items: 'sites',
  externalId: 'id',
  name: 'name',
  url: 'url',
  sourceStatus: 'status',
  clientName: 'client',
  alertEmails: 'contactEmail',
};

const DEFAULT_STATUS_MAP: SourceStatusMap = {
  active: { monitoringEnabled: true },
  maintenance: { state: 'MAINTENANCE', monitoringEnabled: false },
  suspendu: { state: 'MAINTENANCE', monitoringEnabled: false },
  suspended: { state: 'MAINTENANCE', monitoringEnabled: false },
  inactive: { monitoringEnabled: false },
};

export const envSchema = z.object({
  NODE_ENV: z.string().optional().default('development'),
  PORT: intEnv(3000, 1),
  LOG_LEVEL: z.string().optional().default('info'),
  CORS_ORIGINS: z.string().optional().default('*'),
  DASHBOARD_BASE_URL: z.string().optional().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SITES_ENDPOINT_URL: z.string().url(),
  SITES_ENDPOINT_TOKEN: z.string().optional().default(''),
  SITES_FIELD_MAP: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const raw = value && value.trim() !== '' ? value : JSON.stringify(DEFAULT_FIELD_MAP);
      const parsed = jsonEnv(fieldMapSchema).safeParse(raw);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SITES_FIELD_MAP invalide' });
        return z.NEVER;
      }
      return parsed.data;
    }),
  SOURCE_STATUS_MAP: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const raw = value && value.trim() !== '' ? value : JSON.stringify(DEFAULT_STATUS_MAP);
      const parsed = jsonEnv(sourceStatusMapSchema).safeParse(raw);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SOURCE_STATUS_MAP invalide' });
        return z.NEVER;
      }
      return parsed.data;
    }),
  RULES_FILE: z.string().optional().default('rules/error-rules.json'),
  MONITOR_TOKEN: z.string().min(8),
  MONITOR_USER_AGENT: z
    .string()
    .optional()
    .default('BrokenWebsiteDetector/1.0 (+https://localhost; monitoring)'),
  VIEWPORTS: z
    .string()
    .optional()
    .default('desktop')
    .transform((value, ctx) => {
      const items = value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      const parsed = z.array(z.enum(['desktop', 'mobile'])).min(1).safeParse(items);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'VIEWPORTS: desktop et/ou mobile' });
        return z.NEVER;
      }
      return parsed.data;
    }),
  INSPECT_TIMEOUT_MS: intEnv(25000, 1000),
  INSPECT_CONCURRENCY: intEnv(10, 1),
  NETWORKIDLE_CAP_MS: intEnv(5000, 0),
  LOG_SETTLE_MS: intEnv(3000, 0),
  CAPTURE_WARNINGS: boolEnv(false),
  MAX_LOG_ENTRIES: intEnv(80, 1),
  MAX_LOG_TEXT_LENGTH: intEnv(500, 40),
  IGNORED_THIRD_PARTY_DOMAINS: csv(''),
  CRITICAL_THIRD_PARTY_DOMAINS: csv(
    'cdnjs.cloudflare.com,cdn.jsdelivr.net,unpkg.com,ajax.googleapis.com',
  ),
  UNKNOWN_THIRD_PARTY_POLICY: z.enum(['ignore', 'doubtful']).optional().default('ignore'),
  NOISE_VISITS: intEnv(3, 1),
  NOISE_VISIT_INTERVAL_SECONDS: intEnv(0, 0),
  JUDGE_ENABLED: boolEnv(false),
  JUDGE_MODEL: z.string().optional().default('claude-haiku-4-5'),
  JUDGE_DAILY_CALL_LIMIT: intEnv(50, 0),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  MAIL_PROVIDER: z.enum(['console', 'resend', 'brevo']).optional().default('console'),
  MAIL_API_KEY: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default('monitor@localhost'),
  ADMIN_ALERT_EMAIL: z.string().email(),
  API_TOKEN: z.string().min(16),
  BATCH_SIZE: intEnv(10, 1),
  BATCH_INTERVAL_CRON: z.string().optional().default('* * * * *'),
  SYNC_INTERVAL_CRON: z.string().optional().default('0 * * * *'),
  CHECK_INTERVAL_MINUTES: intEnv(60, 1),
  RECHECK_DELAY_MINUTES: intEnv(2, 1),
  FAILURE_THRESHOLD: intEnv(2, 1),
  CYCLE_STALE_MINUTES: intEnv(15, 1),
  VISIBLE_TEXT_MIN_LENGTH: intEnv(20, 0),
  CHECK_RETENTION_DAYS: intEnv(30, 1),
  BROWSER_RESTART_EVERY: intEnv(50, 1),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuration invalide: ${details}`);
  }
  cached = parsed.data;
  return parsed.data;
}

export function getEnv(): Env {
  if (!cached) {
    return loadEnv();
  }
  return cached;
}

export const ENV = Symbol('ENV');
