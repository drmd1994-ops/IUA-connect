import { z } from 'zod';

/**
 * Typed environment (ARCHITECTURE.md §5, §11). Validated once at startup; the process exits
 * with a list of the offending keys (never their values) when anything is wrong.
 *
 * Adapters: only the demo implementations exist so far. Each production implementation is
 * added to its enum in the milestone that builds it (S3 storage, SMTP mailer, ClamAV, Redis).
 */
const DEMO_ADAPTERS = {
  STORAGE_ADAPTER: 'local',
  MAILER_ADAPTER: 'console',
  MALWARE_SCANNER: 'noop',
  RATE_LIMIT_STORE: 'memory',
} as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_ORIGIN: z
      .string()
      .min(1)
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(z.array(z.url())),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string'),
    STORAGE_ADAPTER: z.enum(['local']).default('local'),
    MAILER_ADAPTER: z.enum(['console']).default('console'),
    MALWARE_SCANNER: z.enum(['noop']).default('noop'),
    RATE_LIMIT_STORE: z.enum(['memory']).default('memory'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const [key, demoValue] of Object.entries(DEMO_ADAPTERS)) {
      if (env[key as keyof typeof DEMO_ADAPTERS] === demoValue) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `demo adapter "${demoValue}" is not allowed in production`,
        });
      }
    }
  });

export type Env = z.output<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

/** Parses the environment. Error messages name the key and the rule, never the value. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  throw new InvalidEnvironmentError(problems);
}
