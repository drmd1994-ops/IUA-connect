import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PermissionGuard } from './common/guards/permission.guard';
import { ConfigModule } from './config/config.module';
import { type Env } from './config/env.schema';
import { LoggerModule } from './infra/logger/logger.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AuditModule } from './modules/audit';
import { HealthModule } from './modules/health';

/**
 * Global request pipeline (ARCHITECTURE.md §3): guards → pipes → handler → interceptors → filter.
 * Exported so tests can build small apps with exactly the same pipeline.
 */
export const PIPELINE_PROVIDERS: Provider[] = [
  { provide: APP_GUARD, useClass: PermissionGuard },
  { provide: APP_PIPE, useClass: ZodValidationPipe },
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
];

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(env),
        PrismaModule,
        AuditModule,
        HealthModule,
      ],
      providers: PIPELINE_PROVIDERS,
    };
  }
}
