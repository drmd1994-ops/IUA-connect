import { errorEnvelopeSchema } from '@iua/shared';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  expectAdminOnly,
  signIn,
  signInAdmin,
  startHarness,
  uniqueEmail,
} from './auth-harness';

/** M2 checkpoint 1: reference lists, hospitals and departments, department directors. */
describe('institutions (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string; userId: string };

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h);
  });

  afterAll(async () => {
    await h.close();
  });

  const code = (body: unknown) => errorEnvelopeSchema.parse(body).error.code;
  const asAdmin = () => bearer(admin.accessToken);

  async function createHospital(nameEn = 'Fictional General Hospital') {
    const res = await h
      .http()
      .post('/api/v1/admin/institutions/hospitals')
      .set(asAdmin())
      .send({ nameHe: 'בית חולים בדוי', nameEn, cityHe: 'עיר', cityEn: 'Town' })
      .expect(201);
    return res.body.id as string;
  }

  async function createDepartment(hospitalId: string) {
    const res = await h
      .http()
      .post(`/api/v1/admin/institutions/hospitals/${hospitalId}/departments`)
      .set(asAdmin())
      .send({ nameHe: 'אורולוגיה', nameEn: 'Urology' })
      .expect(201);
    return res.body.id as string;
  }

  describe('public reference lists', () => {
    it('lists the five membership types with what each one requires', async () => {
      const res = await h.http().get('/api/v1/membership-types').expect(200);
      expect(res.headers['cache-control']).toBe('public, max-age=300');
      const byKey = Object.fromEntries(
        (res.body.items as { key: string }[]).map((item) => [item.key, item]),
      );
      expect(Object.keys(byKey)).toEqual([
        'FULL_MEMBER',
        'NON_FULL_MEMBER',
        'RESIDENT',
        'STUDENT',
        'HONORARY_MEMBER',
      ]);
      expect(byKey.FULL_MEMBER).toMatchObject({
        identifier: 'SPECIALIST_CERTIFICATE',
        selfApply: true,
        directorApproval: true,
      });
      expect(byKey.NON_FULL_MEMBER).toMatchObject({ identifier: 'MEDICAL_LICENCE' });
      expect(byKey.RESIDENT).toMatchObject({ identifier: 'MEDICAL_LICENCE' });
      expect(byKey.STUDENT).toMatchObject({ identifier: 'NONE', directorApproval: false });
      expect(byKey.HONORARY_MEMBER).toMatchObject({ selfApply: false });
    });

    it('lists the 11 subspecialties in Hebrew and English', async () => {
      const res = await h.http().get('/api/v1/subspecialties').expect(200);
      expect(res.body.items).toHaveLength(11);
      expect(res.body.items[0]).toMatchObject({
        key: 'URO_ONCOLOGY',
        nameEn: 'Uro-oncology',
        nameHe: 'אורו־אונקולוגיה',
      });
    });

    it('lists active hospitals and their active departments only', async () => {
      const hospitals = await h.http().get('/api/v1/hospitals').expect(200);
      expect(hospitals.body.items.length).toBeGreaterThanOrEqual(21);
      const rambam = (hospitals.body.items as { id: string; nameEn: string }[]).find(
        (item) => item.nameEn === 'Rambam Health Care Campus',
      )!;
      const departments = await h
        .http()
        .get(`/api/v1/hospitals/${rambam.id}/departments`)
        .expect(200);
      expect(departments.body.items).toEqual([
        { id: expect.any(String), nameHe: 'המחלקה האורולוגית', nameEn: 'Department of Urology' },
      ]);

      const hidden = await createHospital('Hidden Hospital');
      const hiddenDepartment = await createDepartment(hidden);
      await h
        .http()
        .patch(`/api/v1/admin/institutions/departments/${hiddenDepartment}`)
        .set(asAdmin())
        .send({ active: false })
        .expect(204);
      expect(
        (await h.http().get(`/api/v1/hospitals/${hidden}/departments`).expect(200)).body.items,
      ).toEqual([]);

      await h
        .http()
        .patch(`/api/v1/admin/institutions/hospitals/${hidden}`)
        .set(asAdmin())
        .send({ active: false })
        .expect(204);
      const after = await h.http().get('/api/v1/hospitals').expect(200);
      expect((after.body.items as { id: string }[]).map((item) => item.id)).not.toContain(hidden);
      const res = await h.http().get(`/api/v1/hospitals/${hidden}/departments`).expect(404);
      expect(code(res.body)).toBe('NOT_FOUND');
    });
  });

  describe('admin: hospitals and departments', () => {
    it('is admin-only on every route', async () => {
      const hospital = await createHospital();
      const department = await createDepartment(hospital);
      const base = '/api/v1/admin/institutions';
      const someone = '0190a000-0000-7000-8000-000000000000';
      await expectAdminOnly(h, 'get', `${base}/hospitals`);
      await expectAdminOnly(h, 'post', `${base}/hospitals`, {
        nameHe: 'א',
        nameEn: 'A',
        cityHe: 'ב',
        cityEn: 'B',
      });
      await expectAdminOnly(h, 'patch', `${base}/hospitals/${hospital}`, { active: true });
      await expectAdminOnly(h, 'post', `${base}/hospitals/${hospital}/departments`, {
        nameHe: 'א',
        nameEn: 'A',
      });
      await expectAdminOnly(h, 'patch', `${base}/departments/${department}`, { active: true });
      await expectAdminOnly(h, 'get', `${base}/departments/${department}/directors`);
      await expectAdminOnly(h, 'post', `${base}/departments/${department}/directors`, {
        email: uniqueEmail(),
      });
      await expectAdminOnly(h, 'delete', `${base}/departments/${department}/directors/${someone}`);
    });

    it('creates and edits hospitals and departments, with audit entries', async () => {
      const hospital = await createHospital('Created Hospital');
      const department = await createDepartment(hospital);
      await h
        .http()
        .patch(`/api/v1/admin/institutions/hospitals/${hospital}`)
        .set(asAdmin())
        .send({ nameEn: 'Renamed Hospital', cityEn: 'New Town' })
        .expect(204);
      await h
        .http()
        .patch(`/api/v1/admin/institutions/departments/${department}`)
        .set(asAdmin())
        .send({ nameEn: 'Urology and Andrology' })
        .expect(204);

      const list = await h.http().get('/api/v1/admin/institutions/hospitals').set(asAdmin());
      const row = (list.body.items as { id: string }[]).find((item) => item.id === hospital);
      expect(row).toMatchObject({
        nameEn: 'Renamed Hospital',
        cityEn: 'New Town',
        active: true,
        departments: [
          { id: department, nameEn: 'Urology and Andrology', active: true, directors: [] },
        ],
      });

      const audit = await h.db.query<{ action: string; entity_id: string }>(
        `SELECT action, entity_id FROM audit_logs WHERE actor_user_id = $1 AND entity_id = ANY($2)
         ORDER BY at`,
        [admin.userId, [hospital, department]],
      );
      expect(audit.rows.map((r) => r.action)).toEqual([
        'institutions.hospital.create',
        'institutions.department.create',
        'institutions.hospital.update',
        'institutions.department.update',
      ]);
    });

    it('validates input and reports unknown IDs', async () => {
      const bad = await h
        .http()
        .post('/api/v1/admin/institutions/hospitals')
        .set(asAdmin())
        .send({ nameHe: '', nameEn: 'X', cityHe: 'Y', cityEn: 'Z' })
        .expect(400);
      expect(code(bad.body)).toBe('VALIDATION_FAILED');
      await h
        .http()
        .patch('/api/v1/admin/institutions/hospitals/0190a000-0000-7000-8000-000000000000')
        .set(asAdmin())
        .send({ active: false })
        .expect(404);
      await h
        .http()
        .patch('/api/v1/admin/institutions/departments/not-a-uuid')
        .set(asAdmin())
        .send({ active: false })
        .expect(400);
    });
  });

  describe('admin: department directors', () => {
    it('assigns a director, who then holds the department-scoped role', async () => {
      const department = await createDepartment(await createHospital());
      const email = await createVerifiedUser(h, 'director');
      const res = await h
        .http()
        .post(`/api/v1/admin/institutions/departments/${department}/directors`)
        .set(asAdmin())
        .send({ email })
        .expect(200);
      expect(res.body.items).toEqual([
        { userId: expect.any(String), email, grantedAt: expect.any(String) },
      ]);
      const directorId = res.body.items[0].userId as string;

      // Idempotent: assigning again changes nothing.
      await h
        .http()
        .post(`/api/v1/admin/institutions/departments/${department}/directors`)
        .set(asAdmin())
        .send({ email })
        .expect(200);
      const grants = await h.db.query(
        `SELECT scope_type, scope_id, granted_by FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1 AND r.key = 'DEPARTMENT_DIRECTOR'`,
        [directorId],
      );
      expect(grants.rows).toEqual([
        { scope_type: 'DEPARTMENT', scope_id: department, granted_by: admin.userId },
      ]);

      // The role requires MFA: the director is asked to enrol.
      const { accessToken } = await signIn(h, email);
      const me = await h.http().get('/api/v1/me').set(bearer(accessToken)).expect(200);
      expect(me.body).toMatchObject({
        roles: ['DEPARTMENT_DIRECTOR'],
        permissions: [],
        mfaEnrollmentRequired: true,
      });

      await h
        .http()
        .delete(`/api/v1/admin/institutions/departments/${department}/directors/${directorId}`)
        .set(asAdmin())
        .expect(204);
      const after = await h
        .http()
        .get(`/api/v1/admin/institutions/departments/${department}/directors`)
        .set(asAdmin())
        .expect(200);
      expect(after.body.items).toEqual([]);
      await h
        .http()
        .delete(`/api/v1/admin/institutions/departments/${department}/directors/${directorId}`)
        .set(asAdmin())
        .expect(404);

      const audit = await h.db.query<{ action: string; changes: unknown }>(
        `SELECT action, changes FROM audit_logs WHERE entity_id = $1 AND action LIKE 'institutions.director.%'
         ORDER BY at`,
        [department],
      );
      expect(audit.rows).toEqual([
        { action: 'institutions.director.assign', changes: { directorUserId: directorId } },
        { action: 'institutions.director.remove', changes: { directorUserId: directorId } },
      ]);
    });

    it('refuses unknown and unverified accounts', async () => {
      const department = await createDepartment(await createHospital());
      const unknown = await h
        .http()
        .post(`/api/v1/admin/institutions/departments/${department}/directors`)
        .set(asAdmin())
        .send({ email: uniqueEmail('nobody') })
        .expect(404);
      expect(errorEnvelopeSchema.parse(unknown.body).error.details).toEqual([
        { field: 'email', code: 'userNotFound' },
      ]);

      const unverified = uniqueEmail('unverified');
      await h
        .http()
        .post('/api/v1/auth/register')
        .send({ email: unverified, password: 'olive trees near the old port 2026' })
        .expect(202);
      const res = await h
        .http()
        .post(`/api/v1/admin/institutions/departments/${department}/directors`)
        .set(asAdmin())
        .send({ email: unverified })
        .expect(422);
      expect(code(res.body)).toBe('BUSINESS_RULE_VIOLATION');
    });
  });

  describe('database rules', () => {
    it('refuses scoped grants that point nowhere, and deleting a department with a director', async () => {
      const department = await createDepartment(await createHospital());
      const email = await createVerifiedUser(h, 'scope');
      await expect(
        h.db.query(
          `INSERT INTO user_roles (id, user_id, role_id, scope_type, scope_id)
           SELECT gen_random_uuid(), u.id, r.id, 'DEPARTMENT', gen_random_uuid()
           FROM users u, roles r WHERE u.email = $1 AND r.key = 'DEPARTMENT_DIRECTOR'`,
          [email],
        ),
      ).rejects.toThrow(/is not a department/);

      await h
        .http()
        .post(`/api/v1/admin/institutions/departments/${department}/directors`)
        .set(asAdmin())
        .send({ email })
        .expect(200);
      await expect(
        h.db.query('DELETE FROM departments WHERE id = $1', [department]),
      ).rejects.toThrow(/referenced by user_roles/);
    });

    it('keeps a fee and its currency together', async () => {
      await expect(
        h.db.query(`UPDATE membership_types SET annual_fee = 100 WHERE key = 'STUDENT'`),
      ).rejects.toThrow(/membership_types_fee_consistent/);
      await expect(
        h.db.query(`UPDATE membership_types SET self_apply = true WHERE key = 'HONORARY_MEMBER'`),
      ).rejects.toThrow(/membership_types_honorary_admin_only/);
    });
  });
});
