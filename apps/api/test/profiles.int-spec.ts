import { errorEnvelopeSchema } from '@iua/shared';
import { type Harness, bearer, createVerifiedUser, signIn, startHarness } from './auth-harness';

/** M2 checkpoint 2: a member's own profile with per-field visibility. */
describe('profiles (integration)', () => {
  let h: Harness;
  let rambam: { hospitalId: string; departmentId: string };
  let sheba: { hospitalId: string; departmentId: string };
  let subspecialties: { id: string; key: string }[];

  beforeAll(async () => {
    h = await startHarness();
    const { rows } = await h.db.query<{ code: string; hospital_id: string; id: string }>(
      `SELECT h.code, d.hospital_id, d.id FROM departments d JOIN hospitals h ON h.id = d.hospital_id
       WHERE h.code IN ('rambam', 'sheba') AND d.code = 'urology'`,
    );
    const pick = (code: string) => {
      const row = rows.find((r) => r.code === code)!;
      return { hospitalId: row.hospital_id, departmentId: row.id };
    };
    rambam = pick('rambam');
    sheba = pick('sheba');
    subspecialties = (await h.http().get('/api/v1/subspecialties').expect(200)).body.items;
  });

  afterAll(async () => {
    await h.close();
  });

  const details = (body: unknown) => errorEnvelopeSchema.parse(body).error.details;

  async function member() {
    const email = await createVerifiedUser(h, 'profile');
    const { accessToken } = await signIn(h, email);
    const patch = (body: object) =>
      h.http().patch('/api/v1/me/profile').set(bearer(accessToken)).send(body);
    const get = () => h.http().get('/api/v1/me/profile').set(bearer(accessToken));
    return { email, patch, get };
  }

  it('requires a signed-in user', async () => {
    await h.http().get('/api/v1/me/profile').expect(401);
    await h.http().patch('/api/v1/me/profile').send({ firstName: 'Noa' }).expect(401);
  });

  it('starts empty, with every field private', async () => {
    const { get } = await member();
    const res = await get().expect(200);
    expect(res.body).toMatchObject({
      firstName: null,
      hospitalId: null,
      subspecialtyIds: [],
      languages: [],
    });
    expect(Object.values(res.body.visibility)).toHaveLength(14);
    expect(new Set(Object.values(res.body.visibility))).toEqual(new Set(['PRIVATE']));
  });

  it('saves every field and the chosen visibility', async () => {
    const { patch, get } = await member();
    const body = {
      firstName: 'Noa',
      lastName: 'Bar-Levi',
      nameHe: 'נועה בר־לוי',
      nameEn: 'Noa Bar-Levi',
      title: 'Dr.',
      position: 'Senior physician',
      hospitalId: rambam.hospitalId,
      departmentId: rambam.departmentId,
      subspecialtyIds: [subspecialties[1]!.id, subspecialties[0]!.id],
      bio: 'A fictional urologist for the demo.',
      researchInterests: 'Stone disease',
      orcid: '0000-0002-1694-233x',
      languages: ['he', 'en', 'he'],
      contactEmail: 'Noa.Office@Example.test',
      contactPhone: '+972 4-000-0000',
      visibility: { NAME: 'PUBLIC', INSTITUTION: 'MEMBERS', CONTACT_PHONE: 'PRIVATE' },
    };
    const res = await patch(body).expect(200);
    expect(res.body).toMatchObject({
      ...body,
      subspecialtyIds: [subspecialties[0]!.id, subspecialties[1]!.id], // catalogue order
      orcid: '0000-0002-1694-233X',
      languages: ['he', 'en'],
      contactEmail: 'noa.office@example.test',
      visibility: { NAME: 'PUBLIC', INSTITUTION: 'MEMBERS', BIO: 'PRIVATE' },
    });
    expect((await get().expect(200)).body).toEqual(res.body);
  });

  it('changes only the fields sent, and clears a field with null or an empty string', async () => {
    const { patch } = await member();
    await patch({ firstName: 'Tal', bio: 'Bio', visibility: { BIO: 'MEMBERS' } }).expect(200);
    const res = await patch({ bio: '', position: 'Resident', visibility: { NAME: 'PUBLIC' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      firstName: 'Tal',
      bio: null,
      position: 'Resident',
      visibility: { BIO: 'MEMBERS', NAME: 'PUBLIC' },
    });
    const cleared = await patch({ position: null, subspecialtyIds: [] }).expect(200);
    expect(cleared.body).toMatchObject({ position: null, subspecialtyIds: [] });
  });

  it('keeps the department within its hospital', async () => {
    const { patch } = await member();
    const wrong = await patch({
      hospitalId: sheba.hospitalId,
      departmentId: rambam.departmentId,
    }).expect(400);
    expect(details(wrong.body)).toEqual([{ field: 'departmentId', code: 'unknownDepartment' }]);

    await patch({ hospitalId: rambam.hospitalId }).expect(400); // set together
    const moved = await patch({ hospitalId: sheba.hospitalId, departmentId: null }).expect(200);
    expect(moved.body).toMatchObject({ hospitalId: sheba.hospitalId, departmentId: null });
    const none = await patch({ hospitalId: null, departmentId: null }).expect(200);
    expect(none.body).toMatchObject({ hospitalId: null, departmentId: null });
  });

  it('rejects invalid values', async () => {
    const { patch } = await member();
    await patch({ orcid: '0000-0002-1825-0098' }).expect(400); // wrong check digit
    await patch({ languages: ['Hebrew'] }).expect(400);
    await patch({ contactPhone: 'call me' }).expect(400);
    await patch({ bio: 'x'.repeat(4001) }).expect(400);
    await patch({ visibility: { NAME: 'EVERYONE' } }).expect(400);
    await patch({ visibility: { PASSWORD: 'PUBLIC' } }).expect(400);
    await patch({ email: 'other@example.test' }).expect(400); // not a profile field
    const unknown = await patch({ subspecialtyIds: [rambam.departmentId] }).expect(400);
    expect(details(unknown.body)).toEqual([
      { field: 'subspecialtyIds', code: 'unknownSubspecialty' },
    ]);
  });

  it('audits which fields changed, never their values', async () => {
    const { email, patch } = await member();
    await patch({ contactPhone: '050-0000000', visibility: { CONTACT_PHONE: 'MEMBERS' } }).expect(
      200,
    );
    const { rows } = await h.db.query<{ changes: unknown; text: string }>(
      `SELECT a.changes, a.changes::text AS text FROM audit_logs a JOIN users u ON u.id = a.actor_user_id
       WHERE u.email = $1 AND a.action = 'profile.update'`,
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.changes).toEqual({ fields: ['contactPhone'], visibility: ['CONTACT_PHONE'] });
    expect(rows[0]!.text).not.toContain('050');
  });
});
