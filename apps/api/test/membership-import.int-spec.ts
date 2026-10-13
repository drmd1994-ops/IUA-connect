import { uuidv7 } from '@medconnect/shared';
import {
  type Harness,
  STRONG_PASSWORD,
  bearer,
  createVerifiedUser,
  expectAdminOnly,
  signIn,
  signInAdmin,
  startHarness,
  uniqueEmail,
} from './auth-harness';

/** M2 checkpoint 6: CSV membership import with a dry run. */
describe('membership import (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string; userId: string };
  let number = (Date.now() % 1_000_000_000) + 700_000;
  const newNumber = () => String(++number);
  const HEADER =
    'email,first_name,last_name,membership_type,identifier,end_date,payment_status,locale';
  const nextYearEnd = () => `${new Date().getUTCFullYear() + 1}-12-31`;

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h);
  });

  afterAll(async () => {
    await h.close();
  });

  const dryRun = (csv: string) =>
    h
      .http()
      .post('/api/v1/admin/memberships/import')
      .set(bearer(admin.accessToken))
      .send({ fileName: 'members.csv', csv });
  const apply = (batchId: string, csv: string) =>
    h
      .http()
      .post(`/api/v1/admin/memberships/import/${batchId}/apply`)
      .set(bearer(admin.accessToken))
      .send({ csv });

  const counts = async () =>
    (
      await h.db.query<{ users: number; memberships: number }>(
        `SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM memberships)::int AS memberships`,
      )
    ).rows[0]!;

  it('is admin-only', async () => {
    const csv = `${HEADER}\n${uniqueEmail()},A,B,STUDENT,,,,`;
    await expectAdminOnly(h, 'post', '/api/v1/admin/memberships/import', { csv });
    await expectAdminOnly(h, 'post', `/api/v1/admin/memberships/import/${uuidv7()}/apply`, { csv });
  });

  it('reports what would happen without changing anything, then applies it', async () => {
    // An existing account without a membership, one with a membership, one disabled.
    const existing = await createVerifiedUser(h, 'import-existing');
    const { accessToken } = await signIn(h, existing);
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(accessToken))
      .send({ firstName: 'Own', lastName: 'Name' })
      .expect(200);
    const member = await createVerifiedUser(h, 'import-member');
    await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(bearer(admin.accessToken))
      .send({
        email: member,
        typeId: (await h.db.query(`SELECT id FROM membership_types WHERE key = 'STUDENT'`)).rows[0]
          .id,
      })
      .expect(201);
    const disabled = await createVerifiedUser(h, 'import-disabled');
    await h.db.query(`UPDATE users SET status = 'DISABLED' WHERE email = $1`, [disabled]);

    const fresh = uniqueEmail('import-new');
    const certificate = newNumber();
    const csv = [
      HEADER,
      `${fresh},נועה,לוי,FULL_MEMBER,${certificate},,PAID,he`,
      `${existing},Imported,Person,RESIDENT,${newNumber()},,,en`,
      `${member},M,M,RESIDENT,${newNumber()},${nextYearEnd()},,`,
      `${disabled},D,D,STUDENT,,,,`,
      `bad-email,X,Y,STUDENT,,,,`,
    ].join('\r\n');

    const before = await counts();
    const report = await dryRun(csv).expect(200);
    expect(await counts()).toEqual(before);
    expect(report.body).toMatchObject({
      status: 'DRY_RUN',
      fileErrors: [],
      totals: {
        CREATE_ACCOUNT: 1,
        CREATE_MEMBERSHIP: 1,
        UPDATE_MEMBERSHIP: 1,
        UNCHANGED: 0,
        SKIP: 2,
      },
    });
    expect(report.body.rows).toEqual([
      { line: 2, email: fresh, action: 'CREATE_ACCOUNT', reasons: [], changes: [] },
      { line: 3, email: existing, action: 'CREATE_MEMBERSHIP', reasons: [], changes: [] },
      {
        line: 4,
        email: member,
        action: 'UPDATE_MEMBERSHIP',
        reasons: [],
        changes: ['type', 'endDate', 'identifier'],
      },
      { line: 5, email: disabled, action: 'SKIP', reasons: ['accountNotActive'], changes: [] },
      { line: 6, email: null, action: 'SKIP', reasons: ['invalidEmail'], changes: [] },
    ]);
    // Numbers are in neither the report nor the stored batch.
    expect(JSON.stringify(report.body)).not.toContain(certificate);
    const stored = await h.db.query(
      `SELECT report::text, content_hash FROM import_batches WHERE id = $1`,
      [report.body.batchId],
    );
    expect(JSON.stringify(stored.rows)).not.toContain(certificate);

    // Applying needs the same file.
    const changed = await apply(report.body.batchId, `${csv}\n`).expect(422);
    expect(changed.body.error.details).toEqual([{ code: 'fileChanged' }]);

    const applied = await apply(report.body.batchId, csv).expect(200);
    expect(applied.body).toMatchObject({
      status: 'APPLIED',
      totals: { CREATE_ACCOUNT: 1, CREATE_MEMBERSHIP: 1, UPDATE_MEMBERSHIP: 1, SKIP: 2 },
    });
    expect(await counts()).toEqual({
      users: before.users + 1,
      memberships: before.memberships + 2,
    });

    // The new account: verified, named, a membership from the import, and a setup email.
    const created = await h.db.query(
      `SELECT u.locale, u.email_verified_at IS NOT NULL AS verified, p.first_name, m.source,
              m.payment_status, t.key AS type
       FROM users u JOIN profiles p ON p.user_id = u.id JOIN memberships m ON m.user_id = u.id
       JOIN membership_types t ON t.id = m.type_id WHERE u.email = $1`,
      [fresh],
    );
    expect(created.rows[0]).toEqual({
      locale: 'he',
      verified: true,
      first_name: 'נועה',
      source: 'IMPORT',
      payment_status: 'PAID',
      type: 'FULL_MEMBER',
    });
    const welcome = h.mailer.last(fresh, 'membershipImportWelcome');
    expect(welcome).toMatchObject({ locale: 'he', params: { typeName: 'חברות מלאה' } });

    // The link sets a password, after which the member can sign in.
    const token = h.mailer.token(fresh, 'membershipImportWelcome');
    await h
      .http()
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: STRONG_PASSWORD })
      .expect(200);
    await signIn(h, fresh);

    // An existing profile keeps the member's own name.
    const profile = await h.db.query(
      `SELECT p.first_name FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.email = $1`,
      [existing],
    );
    expect(profile.rows[0].first_name).toBe('Own');

    // The update is in the member's history.
    const history = await h.db.query(
      `SELECT h.event, h.details FROM membership_history h JOIN memberships m ON m.id = h.membership_id
       JOIN users u ON u.id = m.user_id WHERE u.email = $1 ORDER BY h.at DESC LIMIT 1`,
      [member],
    );
    expect(history.rows[0]).toMatchObject({
      event: 'IMPORTED',
      details: { type: 'RESIDENT', endDate: nextYearEnd(), batch: report.body.batchId },
    });

    // A batch applies once; the same file again finds nothing to change.
    const again = await apply(report.body.batchId, csv).expect(409);
    expect(again.body.error.details).toEqual([{ code: 'batchApplied' }]);
    const rerun = await dryRun(csv).expect(200);
    expect(rerun.body.totals).toMatchObject({
      CREATE_ACCOUNT: 0,
      CREATE_MEMBERSHIP: 0,
      UPDATE_MEMBERSHIP: 0,
      UNCHANGED: 3,
      SKIP: 2,
    });
  });

  it('skips a number that belongs to someone else', async () => {
    const certificate = newNumber();
    const first = uniqueEmail('first');
    const csv1 = `${HEADER}\n${first},A,B,FULL_MEMBER,${certificate},,,`;
    const batch = await dryRun(csv1).expect(200);
    await apply(batch.body.batchId, csv1).expect(200);

    const res = await dryRun(
      `${HEADER}\n${uniqueEmail('second')},C,D,FULL_MEMBER,${certificate},,,`,
    ).expect(200);
    expect(res.body.rows[0]).toMatchObject({ action: 'SKIP', reasons: ['identifierInUse'] });
  });

  it('rejects a malformed file without creating a batch', async () => {
    const res = await dryRun('email,name\nx@example.test,X').expect(200);
    expect(res.body).toMatchObject({
      batchId: null,
      status: null,
      rows: [],
      fileErrors: [
        { code: 'unknownColumn', column: 'name' },
        { code: 'missingColumn', column: 'first_name' },
        { code: 'missingColumn', column: 'last_name' },
        { code: 'missingColumn', column: 'membership_type' },
      ],
    });
    await apply(uuidv7(), 'x').expect(404);
  });

  it('accepts a file of a few thousand rows', async () => {
    const lines = Array.from(
      { length: 3000 },
      (_, i) => `bulk-${i}-${uuidv7()}@example.test,Bulk,Row,STUDENT,,,,`,
    );
    const res = await dryRun([HEADER, ...lines].join('\n')).expect(200);
    expect(res.body.totals.CREATE_ACCOUNT).toBe(3000);
  });
});
