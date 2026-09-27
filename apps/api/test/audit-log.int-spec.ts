import { Controller, type INestApplication, Module, Param, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { PIPELINE_PROVIDERS } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Public } from '../src/common/decorators/access.decorators';
import { ConfigModule } from '../src/config/config.module';
import { LoggerModule } from '../src/infra/logger/logger.module';
import { PrismaModule } from '../src/infra/prisma/prisma.module';
import { AuditModule, AuditService, Audited } from '../src/modules/audit';
import { testEnv } from '../src/testing/test-env';
import { testAppUrl, testOwnerUrl } from './test-db';

@Controller('fixture')
class AuditedFixtureController {
  @Post('things/:id/approve')
  @Public()
  @Audited({ action: 'thing.approve', entityType: 'thing' })
  approve(@Param('id') id: string) {
    return { id, approved: true };
  }
}

@Module({ controllers: [AuditedFixtureController] })
class FixtureModule {}

async function connect(url: string): Promise<Client> {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

describe('audit log (append-only)', () => {
  const env = testEnv({ DATABASE_URL: testAppUrl() });
  let app: INestApplication;
  let audit: AuditService;
  let appDb: Client;
  let ownerDb: Client;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(env),
        PrismaModule,
        AuditModule,
        FixtureModule,
      ],
      providers: PIPELINE_PROVIDERS,
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, env);
    await app.init();
    audit = app.get(AuditService);
    appDb = await connect(testAppUrl());
    ownerDb = await connect(testOwnerUrl());
  });

  afterAll(async () => {
    await appDb.end();
    await ownerDb.end();
    await app.close();
  });

  async function insertEntry(): Promise<string> {
    return audit.record({
      action: 'test.append',
      correlationId: `test-${Date.now()}`,
      entityType: 'test',
      entityId: 'entity-1',
      changes: { before: { status: 'PENDING' }, after: { status: 'ACTIVE' }, password: 'hunter2' },
    });
  }

  it('records entries and redacts sensitive values', async () => {
    const id = await insertEntry();
    const { rows } = await appDb.query('SELECT action, changes FROM audit_logs WHERE id = $1', [
      id,
    ]);
    expect(rows[0].action).toBe('test.append');
    expect(rows[0].changes).toEqual({
      before: { status: 'PENDING' },
      after: { status: 'ACTIVE' },
      password: '[REDACTED]',
    });
  });

  describe('as the application role', () => {
    it.each([
      ['UPDATE', `UPDATE audit_logs SET action = 'tampered' WHERE id = $1`],
      ['DELETE', `DELETE FROM audit_logs WHERE id = $1`],
    ])('has no %s privilege', async (_op, sql) => {
      const id = await insertEntry();
      await expect(appDb.query(sql, [id])).rejects.toMatchObject({ code: '42501' });
    });

    it('has no TRUNCATE privilege', async () => {
      await expect(appDb.query('TRUNCATE audit_logs')).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('as the owner role (privileges alone would allow it)', () => {
    it.each([
      ['UPDATE', `UPDATE audit_logs SET action = 'tampered' WHERE id = $1`],
      ['DELETE', `DELETE FROM audit_logs WHERE id = $1`],
    ])('%s is rejected by the trigger', async (_op, sql) => {
      const id = await insertEntry();
      await expect(ownerDb.query(sql, [id])).rejects.toThrow(/append-only/);
      const { rows } = await ownerDb.query('SELECT action FROM audit_logs WHERE id = $1', [id]);
      expect(rows[0].action).toBe('test.append');
    });

    it('TRUNCATE is rejected by the trigger', async () => {
      await expect(ownerDb.query('TRUNCATE audit_logs')).rejects.toThrow(/append-only/);
    });
  });

  it('records @Audited routes with actor IP, target and correlation ID', async () => {
    // Unique per run: the audit log is append-only, so rows from earlier runs stay.
    const correlationId = `audit-trace-${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/fixture/things/thing-42/approve')
      .set('x-correlation-id', correlationId)
      .expect(201);
    expect(res.body).toEqual({ id: 'thing-42', approved: true });

    const { rows } = await appDb.query(
      `SELECT action, entity_type, entity_id, actor_ip FROM audit_logs WHERE correlation_id = $1`,
      [correlationId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'thing.approve',
      entity_type: 'thing',
      entity_id: 'thing-42',
    });
    expect(rows[0].actor_ip).toBeTruthy();
  });
});
