# 0023 — Zod-first entity shapes; OpenAPI generated from schemas

**Status:** Accepted
**Date:** 2026-07-11

## Context

`packages/shared` has two disconnected shape systems: plain TS `interface`s in `entities.ts` (entity/response shapes — `Trip`, `Membership`, `TripEvent`, `Booking`, `MaybeItem`, `TripNote`, `TripSnapshot`, ...) and zod schemas in `schemas.ts` (request/input shapes only). Nothing validates that a response actually matches the interface it claims to return.

This surfaced in T-036 (Swagger docs, PR #13): `@nestjs/swagger`'s reflection can't derive an OpenAPI schema from a plain interface imported from a compiled sibling package, so the PR hand-wrote `@ApiProperty`-decorated DTO classes (`backend/src/trips/trips.dto.ts`) that mirror `@waypoint/shared` entities field-for-field — a second, unchecked copy of every field list that drifts silently as entities change, and grows per entity × per route.

The backend already has a hand-rolled `ZodValidationPipe` (`backend/src/common/zod-validation.pipe.ts`, from T-009) that validates request bodies against `schemas.ts` zod schemas. There is no equivalent for responses.

## Decision

Define entity shapes as zod schemas in `packages/shared` (the way request inputs already are), and derive the `interface` types from them via `z.infer`. Generate OpenAPI schemas directly from those zod schemas instead of hand-authoring DTO classes.

**Library: [`nestjs-zod`](https://github.com/BenLorantfy/nestjs-zod) v5.** It's purpose-built for NestJS: `createZodDto` gives a class that `@nestjs/swagger`'s existing reflection already understands (via a static `_OPENAPI_METADATA_FACTORY`, the same hook class-validator DTOs use) and that also validates/serializes at runtime — no separate OpenAPI registry to keep synced with the Nest app, just `cleanupOpenApiDoc()` over the generated document for ref/nullability edge cases. Its `ZodValidationPipe`/`ZodSerializerDto` can replace the repo's hand-rolled request pipe. As of v5 it supports zod v4 natively (`z.toJSONSchema` under the hood), matching this repo's `zod@^4.4.3`.

Considered `@asteasolutions/zod-to-openapi` (v8, also zod-v4-native) — it's framework-agnostic and would require manually building and wiring an OpenAPI registry alongside `@nestjs/swagger`'s document builder. `nestjs-zod` does the equivalent with less glue because it targets Nest directly.

`entities.ts`'s plain interfaces are **removed**; the corresponding types become `z.infer<typeof xSchema>` exports from the new entity schemas in `schemas.ts` (or a new `entities-schemas.ts` if that keeps the file organized — implementation detail, not part of this decision).

## Consequences

**Easier:**

- One shape per entity, not two. Adding/renaming a field touches one place.
- Response validation becomes possible for free (the schema already exists) — this task wires it for T-033/T-009/T-036's routes; expanding to every route is separate, later work.
- Swagger/OpenAPI docs are correct for nested shapes (e.g. `TripSnapshot`) without hand-maintaining nested DTO classes.
- `backend/src/trips/trips.dto.ts` (T-036) is deleted.

**Harder / constrained:**

- Entity schemas now live in `packages/shared` and must stay expressible in zod — anything TS-only (e.g. certain conditional/mapped types) needs a zod-shaped equivalent or an escape hatch (`z.custom<T>()`).
- Adds a new runtime dependency (`nestjs-zod`) to `backend`; `packages/shared` stays zod-only (no new dep there).
- The existing hand-rolled `ZodValidationPipe` becomes redundant once `nestjs-zod`'s is adopted — not swapped in this task (scope is response validation + OpenAPI), but flagged as follow-up.

## Alternatives considered

- **Status quo + hand-written DTOs per entity.** Rejected — this is the problem being fixed; the DTO duplication in `trips.dto.ts` was flagged in T-036's review as a growing, unchecked drift risk.
- **Keep `entities.ts` interfaces, add per-route manual `@ApiProperty` for nested shapes.** Rejected — same duplication problem, just deeper (nested DTOs multiply combinatorially with nesting).
- **`@asteasolutions/zod-to-openapi` instead of `nestjs-zod`.** Viable, zod-v4-native — not picked because it's framework-agnostic and needs more manual wiring into `@nestjs/swagger` than a Nest-native library.
