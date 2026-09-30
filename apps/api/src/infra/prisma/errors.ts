/**
 * True when a Prisma call failed on a unique constraint or index (P2002). With `name`, only when
 * that constraint or index is the one violated (checked against the error's metadata, whose shape
 * differs between the native engine and driver adapters).
 */
export function isUniqueViolation(error: unknown, name?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: unknown };
  if (code !== 'P2002') return false;
  return name === undefined || JSON.stringify(meta ?? {}).includes(name);
}
