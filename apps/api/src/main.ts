import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, mountSwaggerUi } from './app.setup';
import { InvalidEnvironmentError } from './config/env.schema';
import { loadEnv } from './config/load-env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule.forRoot(env), { bufferLogs: true });
  configureApp(app, env);
  mountSwaggerUi(app, env);
  await app.listen(env.API_PORT);
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet (e.g. invalid environment), so write to stderr directly.
  const message = error instanceof InvalidEnvironmentError ? error.message : String(error);
  process.stderr.write(`Med Connect API failed to start: ${message}\n`);
  process.exit(1);
});
