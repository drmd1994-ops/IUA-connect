import { Global, Module } from '@nestjs/common';
import { ConsoleMailer } from './console-mailer';
import { Mailer } from './mailer';

/** MAILER_ADAPTER=console is the only implementation so far (refused in production). */
@Global()
@Module({
  providers: [{ provide: Mailer, useClass: ConsoleMailer }],
  exports: [Mailer],
})
export class MailerModule {}
