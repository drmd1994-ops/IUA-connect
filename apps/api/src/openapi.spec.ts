import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildOpenApiDocument, configureApp } from './app.setup';
import { testEnv } from './testing/test-env';

type Schema = Record<string, unknown>;

/**
 * The OpenAPI document drives the web app's types. A bare `z.string().nullable()` comes out as an
 * array there (see common/dto/nullable-string.ts), so the web would compile against wrong types.
 */
describe('OpenAPI document', () => {
  let schemas: Record<string, { properties: Record<string, Schema> }>;

  beforeAll(async () => {
    const env = testEnv();
    const app = await NestFactory.create(AppModule.forRoot(env), { logger: false });
    configureApp(app, env);
    await app.init();
    schemas = buildOpenApiDocument(app).components!.schemas as typeof schemas;
    await app.close();
  });

  it('describes nullable strings as a string or null', () => {
    const stringOrNull = expect.objectContaining({
      anyOf: expect.arrayContaining([
        expect.objectContaining({ type: 'string' }),
        { type: 'null' },
      ]),
    });
    expect(schemas.ProfileDto!.properties.firstName).toEqual(stringOrNull);
    expect(schemas.ProfileDto!.properties.contactPhone).toEqual(stringOrNull);
    expect(schemas.UpdateProfileDto!.properties.orcid).toEqual(stringOrNull);
    expect(schemas.CardVerificationDto!.properties.name).toEqual(stringOrNull);
  });

  it('has no bare z.string().nullable() in the source', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'generated') walk(full);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          if (/z\.string\(\)\.nullable\(\)/.test(readFileSync(full, 'utf8'))) offenders.push(full);
        }
      }
    };
    walk(path.join(__dirname));
    expect(offenders.filter((file) => !file.endsWith('nullable-string.ts'))).toEqual([]);
  });
});
