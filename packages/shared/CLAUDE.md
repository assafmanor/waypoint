# CLAUDE.md — `@waypoint/shared`

Supplements the root `CLAUDE.md` (read that first). This package is the
**single source of truth for entity shapes and cross-layer vocabulary** — the
backend and frontend both import from here rather than each defining their own
copy. Nothing in this package talks to a database, a socket, the DOM, or a
clock.

## Look here before adding elsewhere

- **A value branched on across ≥2 call sites — especially across the FE/BE
  boundary** → it's a discriminant, and it belongs in `constants.ts` as a
  named `{ NAME: 'value' } as const satisfies Record<string, T>` object with a
  derived union type (`entities.ts` declares the union, `constants.ts` gives it
  named values — see `EVENT_KIND`, `BOOKING_TYPE`, `ERROR_CODE`,
  `ENTITY_TYPE`, `WS_MESSAGE_TYPE`). Never let the backend throw a raw string
  and the frontend re-declare a matching loose const — that's precisely what
  ADR-0095 found (`MOVE_INTO_PAST` etc., hand-duplicated in `lib/api.ts`) and
  deleted. A typo in a bare string compiles clean; a typo in a named constant
  doesn't.
- **A new member of an existing enum** (a new `BookingType`, `DocumentType`,
  `EventCategory`, …) is one line in its `entities.ts` union and one line in
  the matching `constants.ts` object/lookup — extend the existing set, don't
  start a second parallel lookup for "just this one new type." `icons.ts`'s
  `CATEGORY_TIME_PROFILE`/`BOOKING_TYPE_CATEGORY`/`CATEGORY_DEFAULT_ICON` are
  the model: one `Record<EnumType, T>`, exhaustively typed so the compiler
  flags a missing case.
- **A derived fact about an entity that both layers need** (is this event
  bracketed? multi-day? what's its closing boundary?) belongs here as a pure
  function over the shape, not re-implemented once in a Nest service and again
  in a React hook. `icons.ts`'s `isBracketed`/`isMultiDay`/`isAmbient`/
  `eventEndBoundary` are the template.

## What does _not_ belong here

- **UI copy.** Hebrew strings live in `frontend/src/i18n/`. This package
  supplies stable _keys_ a consumer looks its own copy up by — `IconGroup.id`
  is exactly that pattern: a stable key, mapped to a Hebrew label only on the
  frontend (ADR-0009: docs/code in English, product UI in Hebrew).
- **Impure or clock-aware logic.** `eventEndBoundary` returns a discriminated
  boundary (`instant` vs `day`) instead of comparing against `now` itself,
  precisely so it stays clock-free and unit-testable — the caller (which owns
  `now` + timezone) resolves it. Don't add a function here that reads
  `Date.now()`, `Intl`, or anything else environment-dependent; that's a
  frontend/backend concern.
- **Frontend-only or backend-only vocabulary "just in case it's needed later."**
  ADR-0095 deliberately keeps `OUTBOX_VERB`, `TRIP_ACTION`, `SYNC_STATE`,
  `HTTP_METHOD` co-located with the frontend type each feeds, not lifted here —
  the server never sees an outbox verb. Promote a set to `constants.ts` only
  once a second layer actually needs the same values, not preemptively.
- **Anything requiring a migration to change.** An icon glyph is a bounded
  curated set and a code change (`icons.ts` header comment); the `EventCategory`
  enum it derives from is what a schema migration touches. Keep that
  distinction — don't make a free-string set look like a schema enum or vice
  versa.

## Keeping in sync

Entity shapes here and `backend/prisma/schema.prisma` mirror each other by
hand (no generator yet) — change both in the same commit. Run
`pnpm --filter @waypoint/shared build` (or the workspace `pnpm build`) before
relying on a change from a consuming package; both `backend` and `frontend`
import the compiled output, not the source directly.

## Anti-patterns seen and fixed here before (don't reintroduce)

- A second, hand-synced copy of a wire-contract vocabulary (error codes,
  entity types, WS message types) instead of one shared constant — ADR-0095.
- A bare string literal doing the job of an enum member (`'flight'` instead of
  `BOOKING_TYPE.FLIGHT`) at a call site in `backend` or `frontend` — the
  constant exists precisely so this doesn't compile-clean as a typo.
