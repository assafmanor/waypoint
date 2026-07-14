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
import { SpaFallbackFilter, STATIC_ROOT } from './common/spa-fallback.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Needed for the refresh-token cookie to survive the dev-only cross-origin
  // gap (:5173 → :3000); no-op in prod, which is single-origin (ADR-0020).
  app.enableCors({ origin: process.env[FRONTEND_URL] ?? DEFAULT_FRONTEND_URL, credentials: true });

  // Raw `ws` upgrade handling for WS /trips/:tripId/stream (sync-and-offline.md).
  app.get(SyncGateway).attach(app.getHttpServer() as HttpServer);

  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Waypoint API').setVersion('1').build(),
    ),
  ); // ADR-0023: fixes up refs/nullability for the zod-derived (createZodDto) schemas
  SwaggerModule.setup('api/docs', app, document);

  if (existsSync(STATIC_ROOT)) {
    app.useStaticAssets(STATIC_ROOT);
    app.useGlobalFilters(new SpaFallbackFilter());
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`Waypoint API listening on http://localhost:${port}`);
}

void bootstrap();
