import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { InvalidEnvironmentError } from './config/env.schema';
import { loadEnv } from './config/load-env';
import { JobQueue } from './infra/jobs/job-queue';
import { ManualQueue } from './infra/jobs/manual-queue';

/**
 * Runs one scheduled job now, without waiting for its time: for the demo and for the browser
 * tests (for example the daily summary email, which otherwise goes out in the morning).
 * Usage: node dist/job-run.js <job name>      (pnpm --filter @iua/api job:run <job name>)
 * A development tool: it starts the app without its schedule, which production refuses.
 */
async function runJob(): Promise<void> {
  const name = process.argv[2];
  // Nothing runs on schedule in this process; only the job that was asked for.
  process.env.JOB_QUEUE = 'manual';
  const env = loadEnv();
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
    logger: false,
  });
  try {
    const queue = app.get(JobQueue);
    const names = queue instanceof ManualQueue ? queue.names().sort() : [];
    if (!name || !names.includes(name)) {
      process.stderr.write(`usage: job:run <job name>\nJobs:\n${names.join('\n')}\n`);
      process.exitCode = 1;
      return;
    }
    await queue.runNow(name);
    process.stdout.write(`Ran ${name}.\n`);
  } finally {
    await app.close();
  }
}

runJob().catch((error: unknown) => {
  const message = error instanceof InvalidEnvironmentError ? error.message : String(error);
  process.stderr.write(`job:run failed: ${message}\n`);
  process.exit(1);
});
