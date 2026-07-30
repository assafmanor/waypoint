# CLAUDE.md — Frontend (React)

Supplements the root `CLAUDE.md` (read that first, plus the ADR(s) for your
domain via `docs/INDEX.md`'s router before an architectural change). This file
is about **which existing layer/mechanism to reach for** before writing a new
one.

## Component layering — check these three before writing a new component

- **`ui/primitives/`** — generic UI mechanics with no trip-domain shape:
  `Modal` (+ its `Sheet`/`ConfirmDialog`/`RowManageSheet` wrappers), `Field`,
  `FormActions`, `FilePicker`, `WhenField`/`TimeField`, `ChoiceGrid`,
  `SnapSheet`. **Every**
  overlay (sheet/dialog/picker/popover) renders through `Modal`, which
  registers into the back stack via `useOverlay` — never hand-roll a floating
  overlay (`createPortal` / `position:fixed`); it's lint-blocked
  (`eslint.config.mjs`'s `createPortal` guard) precisely because a bespoke
  overlay breaks the one-back-action invariant (ADR-0090). If a bespoke portal
  is truly unavoidable, call `useOverlay()` yourself and add the file to the
  lint allowlist — don't route around it silently. **The exception that proves
  the rule:** `SnapSheet` (the Map's list sheet, ADR-0121 §5) is a pane _of_ a
  screen, not a layer _over_ it — it renders inline, whatever is behind it stays
  interactive, and nothing dismisses it — so it deliberately registers nothing
  with the back stack and back leaves the tab at any height. A new sheet is an
  overlay unless it is genuinely inline like that; if it opens and closes, it is
  a `Modal`.
- **A full-bleed surface that owns its own layout** — `AppShell`'s
  `bodyClassName={BODY_FULLBLEED}` (`overflow: hidden; padding: 0`), not a
  screen-local hack to escape the scrolling body. The layout layer is where this
  belongs (ADR-0078); the Map tab's split is the first consumer, the screen then
  supplying its own edge padding and owning its one scroll region.
- **`ui/domain/`** — presentational, trip-domain-shaped components that take
  **all** data via props (no `state`/screen imports): `Board`, `EventCard`,
  `GlanceCard`, `DayStrip`, `MaybeCard`, `StatTile`, `ListRow`/
  `RowManageSheet`, `ChangeFeed`. Before adding "a row that shows an X with a
  ⋯ menu," check `ListRow`/`RowManageSheet` — it's the generic managed-list
  row + kebab-menu shape already reused across bookings, documents, and
  members; a fourth managed list extends it rather than growing a new
  bespoke row component. Same for "was this done or skipped?": that is
  `SettleControl`, whose `prompt`/`sheet`/`compact` densities serve the day
  card, Plan's archive chooser and the Map's reference row — a fourth host
  adds a density, and the words/marks/hues are not its to choose.
- **A list that filters, searches, scopes, or re-orders** — `lib/filter-reveal.ts`
  (`revealRows` + your predicate) through `ui/primitives/RevealList` (ADR-0120).
  Every control that changes the list is animated: rows leaving/arriving collapse
  and reveal (so a row is hidden in place, never dropped from the array — count
  `countVisible(rows)`, not `rows.length`), and rows that merely move slide there.
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

**If a surface can be dismissed at all, that dismissal is in the back stack**
(ADR-0103's two 2026-07-29 amendments; owner: _"system backs shouldn't do
anything different when there's a back button (or cancel, exit)"_ and _"when
there's an implicit way to go back (closing a modal by tapping outside it for
example) we should also treat system back as the same"_). A back / cancel /
close / exit control, a **backdrop or outside tap**, Escape, and the Android
gesture must all run the **same function** — bind them to one handler rather
than writing a second one beside it. What obliges back is that the surface can
be left, not that leaving it has a label.

`Modal` already does this for you — its backdrop, its Escape and its `useOverlay`
registration all end up at the same place — which covers every sheet, dialog,
picker and confirm.

**Escape reaches that place through the back stack, not through `onClose`**
(ADR-0103's 2026-08-01 amendment). The distinction only shows when a second layer
sits above a Modal's own: `onClose` is _that dialog's_ dismissal, so Escape used to
reach past the top layer and close the whole sheet where back peeled one step — and
in a form with an `IconPicker`/`TimePicker` panel open, that meant Escape discarded
what you had typed. `useEscapeAsBack` (called by `useOverlay`) runs the resolver
instead, so whichever listener fires, the stack decides what peels. **Do not add an
Escape handler to a new surface** — if it registers a layer, it already has one, and
a second owner is the bug.

Two shapes need a deliberate `useBackLayer` and are exactly where the app had
diverged:

- **A state a mounted screen enters and leaves** — the Map's disclosure row. The
  screen never unmounts, so it cannot express "there is something to peel" by
  existing; gate the layer on whatever renders the close control (`active`), not
  on a narrower condition. Gating it on the query while one `✕` served the query
  _and_ the filter is precisely how a back walked past a visible control.
- **A step INSIDE an overlay** — Plan mode's resolve sheet. Register in the
  component that renders the `Modal`, i.e. its parent: child effects run first, so
  the Modal's close layer lands underneath and back peels the step first. Return
  `{ remainsActive: true }` — a step back leaves the overlay open.
- **A hand-rolled panel with a backdrop or an outside-tap handler** —
  `IconPicker`, `TimeField`/`TimePicker`. These don't go through `Modal`, so
  nothing registered them and back fell through to the host form's layer,
  discarding what was typed. Gate the layer on the panel's own open state.

**Always gate on the open/selected state, never register unconditionally.** That
gate is what orders the stack correctly with no reasoning about component trees:
a layer joins when it becomes _active_, so a popover opened inside a form lands
above the form's layer, and whichever thing you opened last is what back peels
first.

Not this: a `✕` that clears a value or dismisses a notice (`FilePicker`'s remove,
`StatusBanner`'s dismiss, a picker's clear). Back navigates; it does not edit.
The test is whether the gesture dismisses something you are _in_, not whether it
removes something from the screen.

Consequence for tests: anything registering a layer needs `NavProvider` (plus a
router and the toast), so it can't be rendered bare. Use `wrapNav` from
`src/test/nav-harness.tsx` — don't open-code the provider stack again.

## Anti-patterns already found and fixed once (don't reintroduce)

- A hand-rolled floating overlay (`createPortal`/`position:fixed`) instead of
  `Modal` + `useOverlay` — silently breaks system-back/Escape for that one
  surface (ADR-0090); lint-blocked for a reason.
- A bespoke empty/loading/error `<div>` per screen instead of the
  `ui/feedback/` family (ADR-0078).
- A chip/search/scope control `.filter()`ing rows out of the array instead of the
  shared reveal (ADR-0120) — the Map jumped for two releases because the Index's
  motion was a one-off.
- Handing a `memo`ized component a **fresh object or function each render** on a
  screen that re-renders on the clock. `screens/Map.tsx` ticks every second, and
  `MapPane` holds a live `google.maps.Map` where a needless re-diff of every
  marker is the cheap failure and a re-instantiation is a **billed** one
  (ADR-0121 §4/§6): so its array prop is memoized on a **content key** (the
  `RevealList` trick), its handlers are `useCallback(…, [])` over a latest-ref,
  and even `defaultCentre` is a `useMemo`. One inline `{ lat, lng }` in the JSX
  undoes all of it silently.
- Three divergent confirm-dialog implementations instead of one variant-driven
  `ConfirmDialog` (ADR-0079) — if you're about to write a second confirm
  prompt, its variant belongs on the existing one.
- The same shape one layer up, and it ran for three sessions before anyone
  counted: three hand-rolled settle affordances, which drifted on **four**
  axes before `SettleControl` collected them (ADR-0139's Consequences) — a
  ✓ with a mark beside a skip with none, `--ok` with no `--miss`, `היינו`
  (a record) beside `דלג` (an instruction), and two different focus rings.
  Note what all four are: they are the **vocabulary**, not the sizes, so
  every test on those surfaces stayed green the whole time. When you copy a
  small widget "because the geometry is different", the geometry is the part
  that was fine.
- Per-entity-type `if`/`else` in a change-apply or cache-mirror function
  instead of extending the `CACHE_CHANNELS`-style registry (ADR-0094).
- A bare string literal for a reducer action type / sync state / outbox verb /
  HTTP method (ADR-0095) — name it beside the type it feeds.
- Redefining an entity shape locally instead of importing it from
  `@waypoint/shared` — the package exists precisely so this can't drift.
- A screen assembling its own `ZoneContext` (or deriving its own crossings /
  ambient zone) instead of `dayZoneContext`/`liveZoneContext` over trip-state's
  `zoneEvidence` — shared resolver + per-screen input is not shared behaviour, and
  the two day surfaces diverged for a release (ADR-0107 session-102).
- Turning a typed wall-clock into an instant with `trip.timezone` (or any zone the
  call site happened to have) instead of `authoringZone(…, zoneEvidence)` — the
  event then renders at a different time than it was typed at. A `WhenField`
  without a `zone`/`zones` prop is exactly that surface: the chip is opt-in per
  call site, so a form doesn't get it "for free" (ADR-0107 session-128).
- `navigate(-1)`, `history.back()/forward()/go()`, or any read of
  `history.length` for a back action — back is computed from nav state
  (ADR-0090), never traversed. **Lint-blocked since session 178**, because the
  app leaves entries behind it that are harmless only while nothing walks into
  them (an errand strands one per round trip): a traversal lands on one and drops
  the user on a screen they never asked for. Tests are exempt — two harnesses
  call `history.back()` to simulate the platform, which is the legitimate use.
- **`dir="ltr"` on anything but an `<input>`** (lint-blocked, ADR-0118). It sets
  the base direction of the whole element, so a token carrying a Hebrew unit
  lays out left-to-right and reads unit-first: `9 ק״מ` became `ק״מ 9`, `+3 ש׳`
  became `ש׳ 3+`. Use `dir="auto"` (or no `dir`), and make the **numeric run**
  the island via `ltrIsolate` / `measure` in `lib/bidi.ts` — a number-and-unit
  string is `measure(9, 'ק״מ')`, never a hand-built template. A signed number
  needs the isolate independently: in the RTL flow the `−` of `−3` drifts to the
  wrong side of the digits. Same care for `direction: ltr` in CSS, which lint
  can't see.

## Testing

Vitest + React Testing Library. Component tests for the interaction verbs; a
new `ui/domain/` or `ui/primitives/` component ships with its own test file
alongside it (the existing `*.test.tsx` co-location is the pattern, not the
exception).

**A surface Google renders can't be tested, but almost all of it can.** The Map
tab is the worked example (ADR-0121 §13): every decision about what a pin looks
like lives in pure `lib/` functions tested with no Google in the process
(`map-pins.ts`, `map-camera.ts`, `place-refs.ts`, `snap-sheet.ts`,
`map-config.ts`); `MapPane`'s own test stubs `@vis.gl/react-google-maps` to plain
DOM and asserts the markup that is **ours**; and the shell's test
(`Map.embedded.test.tsx`) stubs the pane. The render itself is a human pass, and
saying so is the point — don't imply a canvas was seen. Note the pairing:
`Map.test.tsx` runs with **no** build config, which is the graceful-absence
(list-only) path and must stay tested as such, so the split has its own file.

**"It talks to a third-party object" is not the same as "it can't be tested",** and
reading it that way shipped a camera that opened on the whole world (ADR-0121's
session-134 build-log entry). `useMapCamera` touches eight `google.maps.Map`
methods, so a ~60-line fake map covers it completely — see
`lib/useMapCamera.test.tsx`. Before declaring imperative glue untestable, count
the methods it actually calls; usually a fake is cheaper than the bug.

Two rules that exist because their absence hid real bugs for three review
rounds (the Map tab's ordering, ADR-0109 session-110):

- **Pin the clock.** A test whose fixtures carry fixed dates must set its own
  `now` via `setSimulatedNow` (`lib/useClock.ts`) — otherwise it silently reads
  the real system clock, so it means something different every day it runs and
  passes for the wrong reason. Reset it in `afterEach`.
- **Assert across both day scopes** on any day-scoped surface (the Day view and
  the **Map**, `DAY_SCOPED_TABS`). The Map's day-scoped and all-days paths are
  genuinely different renders: an ordering bug that only showed in all-days
  survived three sessions because every test for it was day-scoped.
