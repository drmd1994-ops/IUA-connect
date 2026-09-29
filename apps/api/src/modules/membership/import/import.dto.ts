import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** The file's text (the browser reads it); at most MAX_ROWS rows. */
const csv = z.string().min(1).max(1_000_000);

export class ImportDryRunDto extends createZodDto(
  z.strictObject({ fileName: z.string().trim().max(255).optional(), csv }),
) {}

/** Applying needs the same file as the dry run (only its keyed hash was kept). */
export class ImportApplyDto extends createZodDto(z.strictObject({ csv })) {}

export const IMPORT_ACTIONS = [
  'CREATE_ACCOUNT',
  'CREATE_MEMBERSHIP',
  'UPDATE_MEMBERSHIP',
  'UNCHANGED',
  'SKIP',
] as const;

const reportRow = z.strictObject({
  line: z.number().int(),
  email: z.string().nullable(),
  action: z.enum(IMPORT_ACTIONS),
  /** Why a row is skipped (i18n codes). */
  reasons: z.array(z.string()),
  /** What an update changes: type, endDate, paymentStatus, identifier. Never the values of numbers. */
  changes: z.array(z.string()),
});

export const importReport = z.strictObject({
  fileErrors: z.array(
    z.strictObject({
      code: z.string(),
      line: z.number().int().optional(),
      column: z.string().optional(),
    }),
  ),
  rows: z.array(reportRow),
  totals: z.record(z.enum(IMPORT_ACTIONS), z.number().int()),
});

export class ImportBatchDto extends createZodDto(
  importReport.extend({
    /** Null when the file itself was rejected (nothing to apply). */
    batchId: z.uuid().nullable(),
    status: z.enum(['DRY_RUN', 'APPLIED']).nullable(),
  }),
) {}

export type ImportReport = z.infer<typeof importReport>;
export type ImportAction = (typeof IMPORT_ACTIONS)[number];
