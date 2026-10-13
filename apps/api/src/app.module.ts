import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PermissionGuard } from './common/guards/permission.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { ConfigModule } from './config/config.module';
import { type Env } from './config/env.schema';
import { CryptoModule } from './infra/crypto/crypto.module';
import { JobsModule } from './infra/jobs/jobs.module';
import { LoggerModule } from './infra/logger/logger.module';
import { MailerModule } from './infra/mailer/mailer.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { PushModule } from './infra/push/push.module';
import { RateLimitModule } from './infra/rate-limit/rate-limit.module';
import { RealtimeModule } from './infra/realtime/realtime.module';
import { StorageModule } from './infra/storage/storage.module';
import { VideoModule } from './infra/video/video.module';
import { AuditModule } from './modules/audit';
import { AccessModule } from './modules/access';
import { AdminModule } from './modules/admin';
import { AuthModule } from './modules/auth';
import { ChatModule } from './modules/chat';
import { EducationModule } from './modules/education';
import { EventsModule } from './modules/events';
import { FilesModule } from './modules/files';
import { GuidelinesModule } from './modules/guidelines';
import { HealthModule } from './modules/health';
import { InstitutionsModule } from './modules/institutions';
import { MembershipModule } from './modules/membership';
import { NewsModule } from './modules/news';
import { NotificationsModule } from './modules/notifications';
import { OrganisationsModule } from './modules/organisations';
import { ProfilesModule } from './modules/profiles';
import { SearchModule } from './modules/search';

/**
 * Global request pipeline (ARCHITECTURE.md §3): guards → pipes → handler → interceptors → filter.
 * Exported so tests can build small apps with exactly the same pipeline.
 */
export const PIPELINE_PROVIDERS: Provider[] = [
  // Guards run in this order: rate limit (step 3), then authentication/authorization (4–5).
  { provide: APP_GUARD, useClass: RateLimitGuard },
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
        CryptoModule,
        MailerModule,
        RateLimitModule,
        StorageModule,
        VideoModule,
        PushModule,
        RealtimeModule,
        JobsModule.forRoot(env),
        AuditModule,
        HealthModule,
        AuthModule,
        OrganisationsModule,
        InstitutionsModule,
        ProfilesModule,
        MembershipModule,
        FilesModule,
        AccessModule,
        NewsModule,
        GuidelinesModule,
        EventsModule,
        EducationModule,
        NotificationsModule,
        SearchModule,
        ChatModule,
        AdminModule,
      ],
      providers: PIPELINE_PROVIDERS,
    };
  }
}
