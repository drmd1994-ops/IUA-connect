import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { testEnv } from '../src/testing/test-env';
import { testAppUrl } from './test-db';

async function startApp(databaseUrl: string): Promise<INestApplication> {
  const env = testEnv({ DATABASE_URL: databaseUrl });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(env)],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, env);
  await app.init();
  return app;
}

describe('health endpoints', () => {
  describe('with the database available', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await startApp(testAppUrl());
    });
    afterAll(async () => {
      await app.close();
    });

    it('GET /health/live is up and unversioned', async () => {
      await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    });

    it('GET /health/ready checks the database', async () => {
      await request(app.getHttpServer()).get('/health/ready').expect(200, { status: 'ok' });
    });

    it('health routes are not under the API prefix', async () => {
      await request(app.getHttpServer()).get('/api/v1/health/live').expect(404);
    });
  });

  describe('with the database unreachable', () => {
    let app: INestApplication;
    beforeAll(async () => {
      // Nothing listens on port 1; the connection is refused immediately.
      app = await startApp('postgresql://nobody:nothing@127.0.0.1:1/none');
    });
    afterAll(async () => {
      await app.close();
    });

    it('GET /health/ready returns 503 without leaking connection details', async () => {
      const res = await request(app.getHttpServer()).get('/health/ready').expect(503);
      expect(res.body.error).toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
        details: [{ field: 'database', code: 'UNAVAILABLE' }],
      });
      expect(JSON.stringify(res.body)).not.toContain('127.0.0.1');
    });

    it('GET /health/live stays up', async () => {
      await request(app.getHttpServer()).get('/health/live').expect(200);
    });
  });
});
