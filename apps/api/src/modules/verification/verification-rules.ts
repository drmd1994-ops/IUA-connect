/**
 * The rules of the platform's own verification (M17 plan §2, §10), without the database.
 */
export type Kind = 'SPECIALIST' | 'RESIDENT' | 'PHYSICIAN' | 'STUDENT';
export type RequestState =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'REVOKED' | 'EXPIRED';
export type Status = 'NOT_ASKED' | 'WAITING' | 'VERIFIED' | 'REFUSED' | 'REVOKED' | 'EXPIRED';

/** A physician's verification is looked at again after this long. */
export const RECHECK_MONTHS = 24;
/** A new request may be sent this many days before a verification ends. */
export const RENEW_WINDOW_DAYS = 60;
/** The person is told this many days before it ends. */
export const EXPIRY_NOTICE_DAYS = 30;
/** A student's expected graduation is at most this far ahead. */
export const MAX_STUDY_YEARS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A number as people type it: digits only, 1 to 15, spaces and dashes ignored. */
function checkNumber(
  input: string | undefined,
): { ok: true; value: string } | { ok: false; code: 'identifierRequired' | 'identifierInvalid' } {
  const given = input?.replace(/[\s-]/g, '') ?? '';
  if (given === '') return { ok: false, code: 'identifierRequired' };
  if (!/^\d{1,15}$/.test(given)) return { ok: false, code: 'identifierInvalid' };
  return { ok: true, value: given };
}

export interface Standing {
  verifiedAt: Date | null;
  verifiedUntil: Date | null;
  /** The person's latest request to the platform, if any. */
  latest: { state: RequestState } | null;
}

export function isVerified(standing: Standing, now: Date): boolean {
  return (
    standing.verifiedAt !== null &&
    (standing.verifiedUntil === null || standing.verifiedUntil > now)
  );
}

/**
 * Where the person stands. Verified wins (a renewal may be waiting meanwhile); otherwise the
 * latest request says: waiting, refused, ended by a reviewer, or ended by its date.
 */
export function statusOf(standing: Standing, now: Date): Status {
  if (isVerified(standing, now)) return 'VERIFIED';
  switch (standing.latest?.state) {
    case 'PENDING':
      return 'WAITING';
    case 'REJECTED':
      return 'REFUSED';
    case 'REVOKED':
      return 'REVOKED';
    case 'EXPIRED':
    case 'APPROVED':
      // An approved request whose date passed and the daily job has not closed yet.
      return 'EXPIRED';
    default:
      return 'NOT_ASKED';
  }
}

/**
 * Whether a request may be sent now: none is waiting, and the person is not verified, or their
 * verification ends within the renewal window. Someone an organisation vouches for (no end
 * date) has nothing to ask.
 */
export function canAsk(standing: Standing, now: Date): boolean {
  if (standing.latest?.state === 'PENDING') return false;
  if (!isVerified(standing, now)) return true;
  if (standing.verifiedUntil === null) return false;
  return standing.verifiedUntil.getTime() - now.getTime() <= RENEW_WINDOW_DAYS * DAY_MS;
}

/** When an approved verification is looked at again. */
export function verifiedUntil(kind: Kind, expectedGraduation: Date | null, now: Date): Date {
  if (kind === 'STUDENT') {
    // The end of the expected graduation day, in UTC.
    return new Date(expectedGraduation!.getTime() + DAY_MS - 1);
  }
  const until = new Date(now);
  until.setUTCMonth(until.getUTCMonth() + RECHECK_MONTHS);
  return until;
}

export interface Submission {
  kind: Kind;
  licence?: string;
  certificate?: string;
  schoolId?: string;
  expectedGraduation?: string;
  documentFileId?: string;
}

export interface Checked {
  licence: string | null;
  certificate: string | null;
  expectedGraduation: Date | null;
}

export type SubmissionCheck =
  { ok: true; value: Checked } | { ok: false; field: string; code: string };

/**
 * What each kind needs: a physician a licence number; a specialist a certificate number too; a
 * student a school, a graduation date ahead (within MAX_STUDY_YEARS) and the school's
 * confirmation, and no numbers.
 */
export function checkSubmission(input: Submission, now: Date): SubmissionCheck {
  if (input.kind === 'STUDENT') {
    if (input.licence) return { ok: false, field: 'licence', code: 'numberNotExpected' };
    if (input.certificate) {
      return { ok: false, field: 'certificate', code: 'numberNotExpected' };
    }
    if (!input.schoolId) return { ok: false, field: 'schoolId', code: 'schoolRequired' };
    if (!input.expectedGraduation) {
      return { ok: false, field: 'expectedGraduation', code: 'graduationRequired' };
    }
    const graduation = new Date(`${input.expectedGraduation}T00:00:00Z`);
    const latest = new Date(now);
    latest.setUTCFullYear(latest.getUTCFullYear() + MAX_STUDY_YEARS);
    if (graduation.getTime() + DAY_MS <= now.getTime() || graduation > latest) {
      return { ok: false, field: 'expectedGraduation', code: 'graduationOutOfRange' };
    }
    if (!input.documentFileId) {
      return { ok: false, field: 'documentFileId', code: 'documentRequired' };
    }
    return {
      ok: true,
      value: { licence: null, certificate: null, expectedGraduation: graduation },
    };
  }

  if (input.schoolId || input.expectedGraduation || input.documentFileId) {
    return { ok: false, field: 'schoolId', code: 'notForPhysicians' };
  }
  const licence = checkNumber(input.licence);
  if (!licence.ok)
    return { ok: false, field: 'licence', code: numberProblem('licence', licence.code) };
  if (input.kind !== 'SPECIALIST') {
    if (input.certificate) {
      return { ok: false, field: 'certificate', code: 'numberNotExpected' };
    }
    return {
      ok: true,
      value: { licence: licence.value, certificate: null, expectedGraduation: null },
    };
  }
  const certificate = checkNumber(input.certificate);
  if (!certificate.ok) {
    return {
      ok: false,
      field: 'certificate',
      code: numberProblem('certificate', certificate.code),
    };
  }
  return {
    ok: true,
    value: { licence: licence.value, certificate: certificate.value, expectedGraduation: null },
  };
}

function numberProblem(which: 'licence' | 'certificate', code: string): string {
  if (code === 'identifierRequired')
    return which === 'licence' ? 'licenceRequired' : 'certificateRequired';
  return 'numberInvalid';
}

/** A number as typed: digits only, spaces and dashes dropped. Empty: not given. */
export function normalNumber(input: string | undefined): string | null {
  const value = input?.replace(/[\s-]/g, '') ?? '';
  return /^\d{1,15}$/.test(value) ? value : null;
}

/** What is hashed to compare numbers; the kind keeps a licence and a certificate apart. */
export function numberHashInput(kind: 'licence' | 'certificate', value: string): string {
  return `physician-verification:${kind}:${value}`;
}

export interface Approval {
  kind: Kind;
  registerStatus?: 'ACTIVE_PERMANENT' | 'ACTIVE_TEMPORARY' | 'SUSPENDED' | 'NOT_FOUND';
  licenceMatches: boolean | null;
  certificateMatches: boolean | null;
}

/**
 * Whether a reviewer may approve: for a physician, the register showed an active licence, and
 * the number typed from it matches the one given (and, for a specialist, the certificate too).
 * A student is approved on the reviewer's reading of the confirmation.
 */
export function approvalProblem(approval: Approval): { field: string; code: string } | null {
  if (approval.kind === 'STUDENT') return null;
  if (!approval.registerStatus) return { field: 'registerStatus', code: 'registerStatusRequired' };
  if (
    approval.registerStatus !== 'ACTIVE_PERMANENT' &&
    approval.registerStatus !== 'ACTIVE_TEMPORARY'
  ) {
    return { field: 'registerStatus', code: 'licenceNotActive' };
  }
  if (approval.licenceMatches === null) {
    return { field: 'registerLicence', code: 'registerLicenceRequired' };
  }
  if (!approval.licenceMatches) return { field: 'registerLicence', code: 'licenceDoesNotMatch' };
  if (approval.kind === 'SPECIALIST') {
    if (approval.certificateMatches === null) {
      return { field: 'registerCertificate', code: 'registerCertificateRequired' };
    }
    if (!approval.certificateMatches) {
      return { field: 'registerCertificate', code: 'certificateDoesNotMatch' };
    }
  }
  return null;
}
