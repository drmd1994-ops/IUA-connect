import {
  RECHECK_MONTHS,
  approvalProblem,
  canAsk,
  checkSubmission,
  normalNumber,
  statusOf,
  verifiedUntil,
} from './verification-rules';

const now = new Date('2026-10-14T10:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

describe('where a person stands', () => {
  it('nobody asked: not asked', () => {
    expect(statusOf({ verifiedAt: null, verifiedUntil: null, latest: null }, now)).toBe(
      'NOT_ASKED',
    );
  });

  it('a request is waiting', () => {
    const standing = {
      verifiedAt: null,
      verifiedUntil: null,
      latest: { state: 'PENDING' as const },
    };
    expect(statusOf(standing, now)).toBe('WAITING');
    expect(canAsk(standing, now)).toBe(false);
  });

  it('refused, then may ask again with an answer', () => {
    const standing = {
      verifiedAt: null,
      verifiedUntil: null,
      latest: { state: 'REJECTED' as const },
    };
    expect(statusOf(standing, now)).toBe('REFUSED');
    expect(canAsk(standing, now)).toBe(true);
  });

  it('verified until a date ahead; renewing opens in the last 60 days', () => {
    const latest = { state: 'APPROVED' as const };
    expect(statusOf({ verifiedAt: days(-10), verifiedUntil: days(400), latest }, now)).toBe(
      'VERIFIED',
    );
    expect(canAsk({ verifiedAt: days(-10), verifiedUntil: days(400), latest }, now)).toBe(false);
    expect(canAsk({ verifiedAt: days(-10), verifiedUntil: days(59), latest }, now)).toBe(true);
  });

  it('the date passed: expired, even before the job closed the request', () => {
    const standing = {
      verifiedAt: days(-800),
      verifiedUntil: days(-1),
      latest: { state: 'APPROVED' as const },
    };
    expect(statusOf(standing, now)).toBe('EXPIRED');
    expect(canAsk(standing, now)).toBe(true);
  });

  it('an organisation vouches (no end date): verified, nothing to ask', () => {
    const standing = { verifiedAt: days(-10), verifiedUntil: null, latest: null };
    expect(statusOf(standing, now)).toBe('VERIFIED');
    expect(canAsk(standing, now)).toBe(false);
  });

  it('ended by a reviewer', () => {
    expect(
      statusOf({ verifiedAt: null, verifiedUntil: null, latest: { state: 'REVOKED' } }, now),
    ).toBe('REVOKED');
  });
});

describe('how long it lasts', () => {
  it(`a physician: ${RECHECK_MONTHS} months`, () => {
    expect(verifiedUntil('PHYSICIAN', null, now).toISOString()).toBe('2028-10-14T10:00:00.000Z');
  });

  it('a student: to the end of the expected graduation day', () => {
    const graduation = new Date('2029-06-30T00:00:00Z');
    expect(verifiedUntil('STUDENT', graduation, now).toISOString()).toBe(
      '2029-06-30T23:59:59.999Z',
    );
  });
});

describe('what each kind gives', () => {
  it('a physician: a licence number, nothing for students', () => {
    expect(checkSubmission({ kind: 'PHYSICIAN', licence: '12-345' }, now)).toEqual({
      ok: true,
      value: { licence: '12345', certificate: null, expectedGraduation: null },
    });
    expect(checkSubmission({ kind: 'RESIDENT' }, now)).toMatchObject({
      ok: false,
      field: 'licence',
      code: 'licenceRequired',
    });
    expect(
      checkSubmission({ kind: 'PHYSICIAN', licence: '1', certificate: '2' }, now),
    ).toMatchObject({ ok: false, field: 'certificate' });
    expect(checkSubmission({ kind: 'PHYSICIAN', licence: '1', schoolId: 'x' }, now)).toMatchObject({
      ok: false,
      code: 'notForPhysicians',
    });
  });

  it('a specialist: the certificate too', () => {
    expect(checkSubmission({ kind: 'SPECIALIST', licence: '1' }, now)).toMatchObject({
      ok: false,
      field: 'certificate',
    });
    expect(
      checkSubmission({ kind: 'SPECIALIST', licence: '1', certificate: 'abc' }, now),
    ).toMatchObject({ ok: false, code: 'numberInvalid' });
  });

  it('a student: school, graduation ahead, the confirmation, and no number', () => {
    const base = {
      kind: 'STUDENT' as const,
      schoolId: '00000000-0000-7000-8000-000000000009',
      expectedGraduation: '2029-06-30',
      documentFileId: '00000000-0000-7000-8000-000000000010',
    };
    expect(checkSubmission(base, now)).toMatchObject({ ok: true });
    expect(checkSubmission({ ...base, licence: '1' }, now)).toMatchObject({ field: 'licence' });
    expect(checkSubmission({ ...base, documentFileId: undefined }, now)).toMatchObject({
      code: 'documentRequired',
    });
    expect(checkSubmission({ ...base, expectedGraduation: '2026-10-13' }, now)).toMatchObject({
      code: 'graduationOutOfRange',
    });
    expect(checkSubmission({ ...base, expectedGraduation: '2040-01-01' }, now)).toMatchObject({
      code: 'graduationOutOfRange',
    });
    expect(checkSubmission({ ...base, expectedGraduation: '2026-10-14' }, now)).toMatchObject({
      ok: true,
    });
  });
});

describe('approving', () => {
  const physician = { kind: 'PHYSICIAN' as const, licenceMatches: true, certificateMatches: null };

  it('needs an active licence in the register and a matching number', () => {
    expect(approvalProblem({ ...physician, registerStatus: 'ACTIVE_PERMANENT' })).toBeNull();
    expect(approvalProblem({ ...physician, registerStatus: 'ACTIVE_TEMPORARY' })).toBeNull();
    expect(approvalProblem(physician)).toMatchObject({ code: 'registerStatusRequired' });
    expect(approvalProblem({ ...physician, registerStatus: 'SUSPENDED' })).toMatchObject({
      code: 'licenceNotActive',
    });
    expect(
      approvalProblem({ ...physician, registerStatus: 'ACTIVE_PERMANENT', licenceMatches: false }),
    ).toMatchObject({ code: 'licenceDoesNotMatch' });
    expect(
      approvalProblem({ ...physician, registerStatus: 'ACTIVE_PERMANENT', licenceMatches: null }),
    ).toMatchObject({ code: 'registerLicenceRequired' });
  });

  it('a specialist: the certificate must match too', () => {
    const specialist = {
      ...physician,
      kind: 'SPECIALIST' as const,
      registerStatus: 'ACTIVE_PERMANENT' as const,
    };
    expect(approvalProblem(specialist)).toMatchObject({ code: 'registerCertificateRequired' });
    expect(approvalProblem({ ...specialist, certificateMatches: false })).toMatchObject({
      code: 'certificateDoesNotMatch',
    });
    expect(approvalProblem({ ...specialist, certificateMatches: true })).toBeNull();
  });

  it('a student: on the reviewer reading the confirmation', () => {
    expect(
      approvalProblem({ kind: 'STUDENT', licenceMatches: null, certificateMatches: null }),
    ).toBeNull();
  });
});

describe('numbers as typed', () => {
  it('drops spaces and dashes; anything else is no number', () => {
    expect(normalNumber(' 12-34 5 ')).toBe('12345');
    expect(normalNumber('12a')).toBeNull();
    expect(normalNumber(undefined)).toBeNull();
  });
});
