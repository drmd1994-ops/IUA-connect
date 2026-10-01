import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildOpenApiDocument, configureApp } from './app.setup';
import { generateDevSecrets } from './config/dev-secrets';
import { parseEnv } from './config/env.schema';

/**
 * Writes the OpenAPI document without starting the server or touching the database, so it
 * can run in CI. Usage: node dist/openapi-export.js <output.json>
 */
async function exportOpenApi(): Promise<void> {
  const output = process.argv[2];
  if (!output) throw new Error('usage: openapi-export <output.json>');

  const env = parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGIN: 'http://localhost:3001',
    DATABASE_URL: 'postgresql://unused@localhost:5432/unused',
    JOB_QUEUE: 'manual',
    ...generateDevSecrets(),
  });
  const app = await NestFactory.create(AppModule.forRoot(env), { logger: false });
  configureApp(app, env);
  await app.init();
  const document = buildOpenApiDocument(app);
  writeFileSync(path.resolve(output), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

exportOpenApi().catch((error: unknown) => {
  process.stderr.write(`OpenAPI export failed: ${String(error)}\n`);
  process.exit(1);
});
