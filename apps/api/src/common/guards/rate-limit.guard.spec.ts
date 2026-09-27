import { Body, Controller, Get, type INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PIPELINE_PROVIDERS } from '../../app.module';
import { configureApp } from '../../app.setup';
import { ConfigModule } from '../../config/config.module';
import { LoggerModule } from '../../infra/logger/logger.module';
import { RateLimitModule } from '../../infra/rate-limit/rate-limit.module';
import { MemoryRateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import { testEnv } from '../../testing/test-env';
import { Public } from '../decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../decorators/rate-limit.decorator';

@Controller('fixture')
@Public()
class FixtureController {
  @Post('login')
  @RateLimit(RATE_LIMITS.signInPerAccount, RATE_LIMITS.signInPerIp)
  login(@Body() _body: unknown) {
    return { ok: true };
  }

  @Get('open')
  open() {
    return { ok: true };
  }
}

@Module({ controllers: [FixtureController] })
class FixtureModule {}

describe('rate limiting', () => {
  let app: INestApplication;
  const env = testEnv();

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(env),
        RateLimitModule,
        FixtureModule,
      ],
      providers: PIPELINE_PROVIDERS,
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, env);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const login = (email: string) =>
    request(app.getHttpServer()).post('/api/v1/fixture/login').send({ email });

  it('allows 5 sign-in attempts per account per minute, then 429 with Retry-After', async () => {
    for (let i = 0; i < 5; i++) await login('dana@example.test').expect(201);
    const res = await login('DANA@example.test ').expect(429); // same account, other spelling
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    await login('someone.else@example.test').expect(201); // other accounts unaffected
  });

  it('allows 20 sign-in attempts per IP per minute across accounts', async () => {
    for (let i = 0; i < 20; i++) await login(`user${i}@example.test`).expect(201);
    await login('user-21@example.test').expect(429);
  });

  it('applies the global per-IP limit to every route', async () => {
    for (let i = 0; i < 300; i++) await request(app.getHttpServer()).get('/api/v1/fixture/open');
    await request(app.getHttpServer()).get('/api/v1/fixture/open').expect(429);
  });
});

describe('MemoryRateLimitStore', () => {
  it('counts per key and resets after the window', async () => {
    const store = new MemoryRateLimitStore();
    try {
      expect((await store.hit('k', 60, 0)).count).toBe(1);
      expect((await store.hit('k', 60, 1000)).count).toBe(2);
      expect((await store.hit('other', 60, 1000)).count).toBe(1);
      expect(await store.hit('k', 60, 61_000)).toEqual({ count: 1, resetInSec: 60 });
    } finally {
      store.onModuleDestroy();
    }
  });
});
