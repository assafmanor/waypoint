import 'reflect-metadata';
import type { Server as HttpServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { SyncGateway } from './sync/sync.gateway';
import { DEFAULT_FRONTEND_URL, FRONTEND_URL } from './common/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // credentials: true (+ a specific origin, never '*') is required for the
  // refresh-token cookie to cross the dev-only cross-origin gap between the
  // frontend (:5173) and this API (:3000) — ADR-0020 is single-origin in prod,
  // where this has no effect.
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

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`Waypoint API listening on http://localhost:${port}`);
}

void bootstrap();
