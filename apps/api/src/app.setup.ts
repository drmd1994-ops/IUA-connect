import { type INestApplication, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { type Application } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { type Env } from './config/env.schema';

export const API_PREFIX = 'api/v1';

/** Applies the HTTP pipeline shared by the server, the tests and the OpenAPI export. */
export function configureApp(app: INestApplication, env: Env): void {
  app.useLogger(app.get(Logger));
  // The web app proxies /api/v1 to this server (same-origin cookies); trust X-Forwarded-For only
  // from loopback, so req.ip is the browser's address and can't be spoofed by remote clients.
  (app.getHttpAdapter().getInstance() as Application).set('trust proxy', 'loopback');
  app.use(cookieParser());
  app.use(
    helmet({
      // Swagger UI (development only) needs inline scripts; production keeps helmet's strict CSP.
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('IUA Connect API')
    .setDescription('REST API for IUA Connect. Conventions: API_DESIGN.md.')
    .setVersion('v1')
    .setOpenAPIVersion('3.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

export function mountSwaggerUi(app: INestApplication, env: Env): void {
  if (env.NODE_ENV === 'production') return;
  SwaggerModule.setup('api/docs', app, () => buildOpenApiDocument(app));
}
