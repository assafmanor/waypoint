# CLAUDE.md — Frontend (React)

Supplements the root `CLAUDE.md` (read that first, plus the ADR(s) for your
domain via `docs/INDEX.md`'s router before an architectural change). This file
is about **which existing layer/mechanism to reach for** before writing a new
one.

## Component layering — check these three before writing a new component

- **`ui/primitives/`** — generic UI mechanics with no trip-domain shape:
  `Modal` (+ its `Sheet`/`ConfirmDialog`/`RowManageSheet` wrappers), `Field`,
  `FormActions`, `FilePicker`, `WhenField`/`TimeField`, `ChoiceGrid`. **Every**
  overlay (sheet/dialog/picker/popover) renders through `Modal`, which
  registers into the back stack via `useOverlay` — never hand-roll a floating
  overlay (`createPortal` / `position:fixed`); it's lint-blocked
  (`eslint.config.mjs`'s `createPortal` guard) precisely because a bespoke
  overlay breaks the one-back-action invariant (ADR-0090). If a bespoke portal
  is truly unavoidable, call `useOverlay()` yourself and add the file to the
  lint allowlist — don't route around it silently.
- **`ui/domain/`** — presentational, trip-domain-shaped components that take
  **all** data via props (no `state`/screen imports): `Board`, `EventCard`,
  `GlanceCard`, `DayStrip`, `MaybeCard`, `StatTile`, `ListRow`/
  `RowManageSheet`, `ChangeFeed`. Before adding "a row that shows an X with a
  ⋯ menu," check `ListRow`/`RowManageSheet` — it's the generic managed-list
  row + kebab-menu shape already reused across bookings, documents, and
  members; a fourth managed list extends it rather than growing a new
  bespoke row component.
- **`ui/feedback/`** — the empty/loading/error/status shell family (ADR-0078):
  `EmptyState`, `ErrorState`, `LoadingState`+`Skeleton`, `StatusBanner`,
  `SyncBadge`. A screen needing "no data yet" / "failed to load" / "offline"
  reaches for these, never a bespoke `<div>` shell — this family replaced
  roughly six one-off copies of exactly that; don't add a seventh.

## State & sync — table-driven, not per-type branching

- Reducer action types are a named `TRIP_ACTION` const object + discriminated
  `Action` union (`state/trip-state.tsx`), never bare string literals at the
  `dispatch`/`case` sites (ADR-0095) — a typo in a bare action-type string is a
  silent no-op `default` case, not a compile error.
- "A change came in, apply it to local state/cache" is a **registry keyed by
  `ENTITY_TYPE`**, not an `if`/`else` chain: the memory channels in
  `state/trip-state.tsx` and the cache channels (`CACHE_CHANNELS`) in
  `lib/cache.ts` (ADR-0094). Adding a new offline-syncable entity type means
  adding one registry entry in each place it's mirrored (memory + Dexie
  cache), not a new branch in an existing `switch`.
- Offline write queuing follows the same shape: `lib/outbox.ts`'s
  `OUTBOX_VERB` (named constants, ADR-0095) + `lib/cache.ts`'s
  `outboxOpToCacheChanges`, which maps a queued op to the same `Change` shape
  the WS echo would produce, applied through the one `applyChangeToCache` —
  a new offline-capable write reuses that path rather than writing a parallel
  Dexie mutation.
- Per-enum-value lookups (an icon, a color, a label per `BookingType` /
  `DocumentType` / …) are one `Record<Enum, T> as const satisfies …` object
  (see `constants.ts`'s `BOOKING_TYPE_ICON`/`DOCUMENT_TYPE_ICON`), not a
  `switch` or a set of per-call-site ternaries — the compiler then flags a
  missing case when the enum grows.

## Constants & copy

No hardcoded UI copy or magic numbers/strings in logic (root `CLAUDE.md`'s "No
magic values", `conventions.md`). Hebrew strings live in `i18n/he.ts`; tunables
(durations, thresholds, sizes) live in `constants.ts`; domain enum values come
from `@waypoint/shared`. A literal appearing at more than one call site, or
carrying meaning beyond its immediate context, gets a name in one of those
three places — not copied inline a second time.

## Navigation & back

Covered in the root `CLAUDE.md` (`Modal`/`useOverlay` for every overlay;
`resolveBack` + explicit `{ replace: true }` navigation for every in-trip
transition, never `navigate(-1)` or reading history depth) — restated here
only because it's the sharpest example of "the mechanism already exists, use
it": a new structural back case is a rule added to `resolveBack`
(`state/nav-state.tsx`), not a one-off handler at the call site.

## Anti-patterns already found and fixed once (don't reintroduce)

- A hand-rolled floating overlay (`createPortal`/`position:fixed`) instead of
  `Modal` + `useOverlay` — silently breaks system-back/Escape for that one
  surface (ADR-0090); lint-blocked for a reason.
- A bespoke empty/loading/error `<div>` per screen instead of the
  `ui/feedback/` family (ADR-0078).
- Three divergent confirm-dialog implementations instead of one variant-driven
  `ConfirmDialog` (ADR-0079) — if you're about to write a second confirm
  prompt, its variant belongs on the existing one.
- Per-entity-type `if`/`else` in a change-apply or cache-mirror function
  instead of extending the `CACHE_CHANNELS`-style registry (ADR-0094).
- A bare string literal for a reducer action type / sync state / outbox verb /
  HTTP method (ADR-0095) — name it beside the type it feeds.
- Redefining an entity shape locally instead of importing it from
  `@waypoint/shared` — the package exists precisely so this can't drift.
- `navigate(-1)` or any read of `window.history.length` for a back action —
  back is computed from nav state (ADR-0090), never traversed.

## Testing

Vitest + React Testing Library. Component tests for the interaction verbs; a
new `ui/domain/` or `ui/primitives/` component ships with its own test file
alongside it (the existing `*.test.tsx` co-location is the pattern, not the
exception).
