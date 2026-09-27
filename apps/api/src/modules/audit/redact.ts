export const REDACTED = '[REDACTED]';

/** Keys whose values never reach the audit log (SECURITY_MODEL.md §3). Matched case-insensitively. */
const SENSITIVE_KEY =
  /pass(word)?|token|secret|certificate|mfa|otp|totp|recovery|cookie|authorization|card/i;

const MAX_DEPTH = 8;

/** Returns a deep copy with sensitive values replaced. Never mutates the input. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(child, depth + 1);
  }
  return result;
}
