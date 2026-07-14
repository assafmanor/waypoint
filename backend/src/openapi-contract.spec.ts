import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, ModulesContainer, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { SERVER_ROUTE_PATTERN } from '@waypoint/shared';
import { AppModule } from './app.module';

// RouteParamtypes.BODY (@nestjs/common/enums/route-paramtypes.enum) — not part of the
// public API surface, but a stable wire-format value Nest bakes into every @Body()
// decorator's emitted metadata; safe to depend on without importing the internal enum.
const BODY_PARAM_TYPE = 3;

/**
 * Regression test for the bug where `create()` on TripsController took
 * `body: CreateTripInput` (a type alias, erased at compile time) instead of a
 * real DTO class: Nest's Swagger reflection had nothing to introspect, so
 * `POST /trips` silently documented no request body at all. This walks every
 * controller in the app (not just trips) and fails if any @Body()-decorated
 * method isn't backed by a documented request body — so a future endpoint
 * can't reintroduce the same silent gap.
 */
let document: OpenAPIObject;
let app: Awaited<ReturnType<typeof NestFactory.create>>;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
});

afterAll(() => app.close());

describe('OpenAPI contract: every @Body() handler documents a request body', () => {
  it('has a non-empty requestBody for every handler with a @Body() parameter', () => {
    const discovery = new DiscoveryService(app.get(ModulesContainer));
    const scanner = new MetadataScanner();
    const checked: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance);

      for (const methodName of scanner.getAllMethodNames(prototype)) {
        const argsMeta = Reflect.getMetadata(ROUTE_ARGS_METADATA, metatype, methodName) ?? {};
        const hasBodyParam = Object.keys(argsMeta).some((key) =>
          key.startsWith(`${BODY_PARAM_TYPE}:`),
        );
        if (!hasBodyParam) continue;

        const operationId = `${metatype.name}_${methodName}`;
        checked.push(operationId);
        const operation = Object.values(document.paths)
          .flatMap((methods) => Object.values(methods ?? {}))
          .find(
            (op): op is NonNullable<typeof op> =>
              typeof op === 'object' &&
              op !== null &&
              'operationId' in op &&
              op.operationId === operationId,
          );

        expect(operation, `${operationId} should be present in the OpenAPI doc`).toBeTruthy();
        const schema = (
          operation as { requestBody?: { content?: Record<string, { schema?: unknown }> } }
        ).requestBody?.content?.['application/json']?.schema;
        expect(
          schema,
          `${operationId} has a @Body() param but no documented requestBody`,
        ).toBeTruthy();
      }
    }

    // Guard against the check itself going stale (e.g. no @Body() handlers left to scan).
    expect(checked.length).toBeGreaterThan(0);
  });
});

// The PWA service worker only lets navigations under SERVER_ROUTE_PREFIXES
// reach the backend (vite.config.ts navigateFallbackDenylist); a route outside
// them would be answered by the cached app shell in production.
describe('route ownership: every route lives under a shared server prefix', () => {
  it('matches SERVER_ROUTE_PATTERN for every documented path', () => {
    const paths = Object.keys(document.paths);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path, `${path} is outside SERVER_ROUTE_PREFIXES (@waypoint/shared)`).toMatch(
        SERVER_ROUTE_PATTERN,
      );
    }
  });
});
