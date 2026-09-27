import {
  Body,
  Controller,
  Get,
  type INestApplication,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { z } from 'zod';
import { type PermissionKey, errorEnvelopeSchema } from '@iua/shared';
import { PIPELINE_PROVIDERS } from '../app.module';
import { configureApp } from '../app.setup';
import { ConfigModule } from '../config/config.module';
import { LoggerModule } from '../infra/logger/logger.module';
import { testEnv } from '../testing/test-env';
import { type RequestWithPrincipal } from './auth/principal';
import { Public, RequirePermission } from './decorators/access.decorators';

class EchoDto extends createZodDto(z.strictObject({ name: z.string().min(2) })) {}

@Controller('fixture')
class FixtureController {
  @Get('public')
  @Public()
  open() {
    return { ok: true };
  }

  @Get('audit')
  @RequirePermission('audit.read')
  guarded() {
    return { ok: true };
  }

  @Get('undeclared')
  undeclared() {
    return { ok: true };
  }

  @Post('echo')
  @Public()
  echo(@Body() body: EchoDto) {
    return body;
  }

  @Get('boom')
  @Public()
  boom() {
    throw new Error('connection to db-host-17 failed: password authentication failed');
  }
}

/** Stands in for the M1 authentication guard: a test header selects the caller's permissions. */
@Module({ controllers: [FixtureController] })
class FixtureModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        (
          req: RequestWithPrincipal & { headers: Record<string, string> },
          _res: unknown,
          next: () => void,
        ) => {
          const header = req.headers['x-test-permissions'];
          if (header !== undefined) {
            req.principal = {
              userId: '0199a000-0000-7000-8000-000000000001',
              sessionId: '0199a000-0000-7000-8000-000000000002',
              mfa: true,
              permissions: new Set(header.split(',').filter(Boolean) as PermissionKey[]),
            };
          }
          next();
        },
      )
      .forRoutes('*path');
  }
}

describe('HTTP pipeline', () => {
  let app: INestApplication;
  const env = testEnv();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(env), LoggerModule.forRoot(env), FixtureModule],
      providers: PIPELINE_PROVIDERS,
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, env);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const expectEnvelope = (body: unknown, code: string) => {
    const parsed = errorEnvelopeSchema.parse(body);
    expect(parsed.error.code).toBe(code);
    expect(parsed.error.message).toMatch(/^errors\./);
    return parsed;
  };

  describe('deny by default', () => {
    it('allows @Public() routes anonymously', async () => {
      await request(app.getHttpServer()).get('/api/v1/fixture/public').expect(200, { ok: true });
    });

    it('returns 401 for a permission route without a principal', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/fixture/audit').expect(401);
      expectEnvelope(res.body, 'UNAUTHENTICATED');
    });

    it('returns 403 when the principal lacks the permission', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/fixture/audit')
        .set('x-test-permissions', 'news.create')
        .expect(403);
      expectEnvelope(res.body, 'FORBIDDEN');
    });

    it('allows a principal holding the permission', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/fixture/audit')
        .set('x-test-permissions', 'audit.read')
        .expect(200);
    });

    it('denies a route that declares nothing, even to a principal with every permission', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/fixture/undeclared')
        .set('x-test-permissions', 'audit.read,users.manage,settings.manage')
        .expect(403);
      expectEnvelope(res.body, 'FORBIDDEN');
    });
  });

  describe('error envelope', () => {
    it('returns 404 in the envelope for unknown routes', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
      expectEnvelope(res.body, 'NOT_FOUND');
    });

    it('returns field-level validation details and rejects unknown keys', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fixture/echo')
        .send({ name: 'x', isAdmin: true })
        .expect(400);
      const { error } = expectEnvelope(res.body, 'VALIDATION_FAILED');
      expect(error.details).toEqual(
        expect.arrayContaining([
          { field: 'name', code: 'TOO_SMALL' },
          expect.objectContaining({ code: 'UNRECOGNIZED_KEYS' }),
        ]),
      );
    });

    it('never leaks internals on unexpected errors', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/fixture/boom').expect(500);
      expectEnvelope(res.body, 'INTERNAL_ERROR');
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('db-host-17');
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('stack');
    });
  });

  describe('correlation IDs', () => {
    it('creates one when absent and returns it in the header and the envelope', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/fixture/audit').expect(401);
      const header = res.headers['x-correlation-id'];
      expect(header).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.error.correlationId).toBe(header);
    });

    it('keeps a well-formed incoming ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/fixture/public')
        .set('x-correlation-id', 'client-trace-12345')
        .expect(200);
      expect(res.headers['x-correlation-id']).toBe('client-trace-12345');
    });

    it('replaces a malformed incoming ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/fixture/public')
        .set('x-correlation-id', '<script>alert(1)</script>')
        .expect(200);
      expect(res.headers['x-correlation-id']).not.toContain('<');
    });
  });

  describe('security headers', () => {
    it('sets helmet headers', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/fixture/public');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });
});
