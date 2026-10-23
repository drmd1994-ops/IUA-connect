import { type PatientDetail, type PatientDetailKind, findPatientDetails } from '@medconnect/shared';
import { AppException } from '../../common/errors/app.exception';

/** The limits of communities (M25 plan §2). */
export const POST_TITLE_MAX = 200;
export const POST_BODY_MAX = 10_000;
export const COMMENT_MAX = 4000;
/** A post's writer can change it for a day; a comment, for 15 minutes as in chat. */
export const POST_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_POST_FILES = 3;
export const MAX_MENTIONS = 10;
export const POSTS_PAGE_SIZE = 20;
/** Chat's six reactions (M12). */
export const REACTIONS = ['like', 'heart', 'laugh', 'wow', 'thanks', 'check'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** Whether a change is still allowed, `windowMs` after the thing was written. */
export function withinWindow(createdAt: Date, windowMs: number, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() <= windowMs;
}

/**
 * Refuses text with what looks like a patient's details (owner answer §10.4: it blocks). Each
 * finding goes back as a detail, so the writer sees what and where.
 */
export function refusePatientDetails(fields: Record<string, string | undefined>): void {
  const found: (PatientDetail & { field: string })[] = [];
  for (const [field, text] of Object.entries(fields)) {
    if (!text) continue;
    for (const detail of findPatientDetails(text)) found.push({ ...detail, field });
  }
  if (found.length === 0) return;
  throw new AppException(
    'VALIDATION_FAILED',
    found.map((detail) => ({
      field: detail.field,
      code: PATIENT_DETAIL_CODES[detail.kind],
      value: detail.text,
    })),
  );
}

/** The error code of each kind of finding (errors.details.* says what it is). */
export const PATIENT_DETAIL_CODES: Record<PatientDetailKind, string> = {
  idNumber: 'patientIdNumber',
  phone: 'patientPhone',
  date: 'patientDate',
  recordNumber: 'patientRecordNumber',
  patientName: 'patientName',
  email: 'patientEmail',
};

/** Whether a ban is in force now. */
export function banInForce(ban: { until: Date | null } | null, now = new Date()): boolean {
  return ban !== null && (ban.until === null || ban.until > now);
}
