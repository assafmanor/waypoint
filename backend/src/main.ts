import 'reflect-metadata';
import { existsSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { SyncGateway } from './sync/sync.gateway';
import { DEFAULT_FRONTEND_URL, FRONTEND_URL } from './common/env';
import { AllExceptionsFilter, SPA_INDEX, STATIC_ROOT } from './common/all-exceptions.filter';
import { ConfigValidationError, validateConfig } from './common/validate-config';

async function bootstrap() {
  // Fail fast on a misconfigured deploy (B-04) before doing anything else — never
  // boot "healthy" only to fail at the first login/upload, and never run the
  // DEV_AUTH bypass in production.
  try {
    validateConfig();
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      console.error(`Refusing to start.\n${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Needed for the refresh-token cookie to survive the dev-only cross-origin
  // gap (:5173 → :3000); no-op in prod, which is single-origin (ADR-0020).
  app.enableCors({ origin: process.env[FRONTEND_URL] ?? DEFAULT_FRONTEND_URL, credentials: true });

  // Raw `ws` upgrade handling for WS /trips/:tripId/stream (sync-and-offline.md).
  app.get(SyncGateway).attach(app.getHttpServer() as HttpServer);

  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Waypoint API').setVersion('1').addBearerAuth().build(),
    ),
  ); // ADR-0023: fixes up refs/nullability for the zod-derived (createZodDto) schemas
  SwaggerModule.setup('api/docs', app, document);

  // One global filter for the whole app: the documented error envelope (B-05),
  // and — in production, where the built PWA exists — the SPA shell fallback for
  // browser navigations. Passing the index path only when it exists keeps the
  // fallback off in dev/test (JSON for everything).
  const spaAvailable = existsSync(STATIC_ROOT);
  if (spaAvailable) app.useStaticAssets(STATIC_ROOT);
  app.useGlobalFilters(new AllExceptionsFilter(spaAvailable ? SPA_INDEX : undefined));

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`Waypoint API listening on http://localhost:${port}`);
}

void bootstrap();
