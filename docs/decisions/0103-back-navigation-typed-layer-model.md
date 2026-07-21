# 0103 — Back navigation: a typed, non-destructive layer model over ADR-0090's resolver

**Status:** Proposed
**Date:** 2026-07-21

## Context

Back is reported "sort of working, but sometimes not as expected" app-wide
(`backlog.md`, from session 63). ADR-0090 is the current, sound mechanism: `back`
is a pure function of structural nav state (`resolveBack(snapshot) → BackAction`),
executed as an explicit `replace` navigation, with a Navigation-API interceptor for
Android/Chromium system-back and a cold-launch history guard. In-trip history is
flat; the app never traverses (`navigate(-1)`) or reads history depth. That core is
correct and well-tested and is **not** the problem — this ADR keeps it.

The problem is one layer below it. ADR-0090's rule 1 (`hasOverlay → close-overlay`)
consults a **single mutable LIFO stack of `{id, close}` callbacks** (`state/nav-state.tsx`)
that four very different things register into via `useOverlay`:

1. real modals/sheets/dialogs (ADR-0079 `Modal`) — close means unmount;
2. the full-screen Index Documents subview (ADR-0098) — clean;
3. the full-screen Index Bookings subview (ADR-0098) — which _also_ carries a
   category filter that peels before it (ADR-0102 `peelBack`);
4. the full-screen search overlay (ADR-0101 `Modal variant="full"`).

`runBack('close-overlay')` executes `stackRef.current.pop()?.close()` — it removes the
top entry _before_ invoking its callback. That is only correct when the callback
unmounts its owner. It is wrong for a callback that **handles a back yet stays
mounted**. `IndexBookingsView` registers `backOrResetCategory = () => peelBack(active,
() => setCategory(ALL), onClose)`: with a filter active, back pops the Bookings entry,
the callback only resets the category, and Bookings **stays mounted but unregistered**.
The next system-back (or Escape) then leaks past the still-visible screen into
structural back — while the visible arrow, which calls the function directly rather than
through the stack, still works. Result: one back removes two semantic states, system
back and the app button diverge, and a layer gets skipped — exactly the reported
symptoms. (Verified in code, session 65.)

Two adjacent facts compound it. **Escape** (`lib/useDialogFocus.ts`) closes the topmost
overlay by calling `onClose` directly in a capture listener — a second, independent
close owner outside `runBack`. And **local destinations have no durable
representation**: the Index subview, active category, and search-open live only in
component state (`?booking=`/`?focus=docs` deep-link params are stripped after use), so
reload, Forward, deep-link, and restored sessions cannot reconstruct them.

The failure is therefore a **layer-lifecycle + local-durability** problem, not a
history-conflation one. (The previous history-first model — ADR-0035 — _was_ a
history-conflation problem: `history.back()` traversed blindly into OAuth/cold-launch/
`idx`-desynced entries; ADR-0090 already fixed that and must not be undone.)

## Decision

Keep ADR-0090's pure `resolveBack` + interception-first + flat-history core unchanged,
including its principle (reaffirmed by ADR-0102) that `resolveBack` is a pure function
of **structural** nav state and never carries screen-specific state. Change only what
`close-overlay` operates on and how local destinations persist:

1. **Replace the destructive LIFO close-stack with a typed, non-destructive
   `BackLayer` registry.** Each active layer declares a type and a handler that returns
   a result; the executor calls the topmost active layer's handler and lets the
   **result plus the component's own mount lifecycle** decide registration — it never
   blindly `pop()`s.

   ```ts
   type BackLayer =
     | RouteLayer // structural route; owned by React Router + resolveBack
     | LocalSubviewLayer // Index bookings/documents; URL-param mirrored
     | RepeatableStateLayer // active category filter; back resets, stays active
     | TransientOverlayLayer // real modal/sheet/dialog/search; back closes + unmounts
     | ExitBoundaryLayer; // trip-Home arm/exit + root native-exit boundary

   type BackResult =
     | { handled: false }
     | { handled: true; remainsActive: true } // repeatable — stays registered
     | { handled: true; remainsActive: false }; // dismissed — unregisters
   ```

   `resolveBack` is unchanged: it still returns `close-overlay` whenever any layer is
   active. The registry decides _which_ typed layer peels and whether it survives. A
   `RepeatableStateLayer` (the category filter) returns `remainsActive:true` — its owner
   stays mounted **and registered**, so the next back still sees it. This is the fix.

2. **One owner per trigger.** `resolveBack(snapshot, trigger)` gains a trigger input and
   is the single owner for every trigger:
   `type BackTrigger = 'system' | 'app-button' | 'escape' | 'explicit-close' | 'browser-forward'`.
   The visible Back button resolves to the logical parent via the registry, never
   traverses unknown history, and never causes a second resolution. Escape is routed
   through the same resolver (removing the independent `useDialogFocus` close path) with
   a restricted policy: it closes only `TransientOverlayLayer`/search, not filters or
   subviews. Explicit close buttons invoke the same semantic layer action as back.

3. **Give local destinations a durable URL representation — as a restoration mirror,
   not the back-driver.** The registry remains the peel authority for subviews/filters/
   search (ADR-0098 §5 rejected making them routes/`?tab=` because `resolveBack`'s
   "non-Home tab → Home" rule would jump past the landing — that constraint stands). On
   top of the registry, each local destination mirrors itself to a **replace-written URL
   search param** (`?tab=index&view=bookings&cat=<c>&q=<q>`), reusing the existing
   `?tab=`/`?day=`/`?booking=` convention (ADR-0096 reuse), written on change and read
   once on mount. History stays flat; **Forward is a defined no-op** for local layers
   (only cross-surface pushes create forward entries). Invalid params canonicalize to the
   landing. The sync is explicitly one-directional (state→param on change; param→state on
   mount only).

4. **URL fragments are rejected.** They carry identical session-history semantics to
   search params but add scroll-jump/`#anchor`/`hashchange`-vs-`popstate` hazards and no
   capability params don't already give here; adopting them would be a second competing
   convention against ADR-0096's reuse rule. The durable-destination need they were
   floated for is met by the param mirror.

5. **Harden root/native-exit.** True root stays All Trips (`/trips`) and zero-state `/`:
   `resolveBack → none`, interceptor lets the OS proceed, native PWA exit preserved. Trip
   Home keeps the two-tap arm→exit, with `exitPendingRef` now cleared on **any** navigation
   away (not only `exit-trip`) to close the cross-surface "one back unexpectedly exits"
   edge. `useTripBackGuard` stays scoped to inside-a-trip cold launch, documented as
   interception fuel, never a trap.

6. **Test the platform, not only the policy.** Add real-traversal Playwright coverage
   (`page.goBack/goForward`) for the Bookings→filter→search flow, Documents, nested
   overlays, reload, deep-link, Forward, and root native-exit — the paths the pure
   `nav-state.test.ts` structurally cannot prove. A physical-Android PWA script covers
   the gesture/3-button/keyboard/cold-launch acceptance criteria that cannot be automated.

Migration is phased and incremental (session-65 plan): repro coverage → typed registry
behind a `useOverlay` shim → separate overlays from repeatable/local layers (the fix) →
trigger-source + Escape unification → URL-param durability → search → structural/guard
hardening → Forward/reload tests → Android validation → dead-code removal. Phases through
the registry fix ship independently of the durability work.

## Consequences

- **Easier:** one back removes exactly one semantic layer; the filter-reset handler stays
  eligible after handling a back; system back and the visible button can no longer
  diverge; every trigger has one owner; reload/deep-link/restore reconstruct the exact
  Index destination; the resolver stays pure and structural (ADR-0102's principle intact).
- **Harder / constrained:** a new Back-capable surface must now declare its layer _type_
  rather than dropping a bare close callback — a deliberate cost that makes lifecycle
  explicit. `useOverlay` becomes a thin deprecated shim over `useBackLayer` during
  migration. Two representations (registry + URL param) exist for local state, bound by
  the one-directional sync rule above.
- **Unchanged limits:** iOS/Safari/Firefox still have no Navigation-API interception
  (graceful minimum, ADR-0090) — but URL durability now _improves_ their button-only back;
  iOS still has no gesture back (ADR-0099 preserved). No production behavior unrelated to
  Back changes.
- **Relationship to prior ADRs:** refines ADR-0090 (same resolver/interception/flat-history
  core; the overlay mechanism it consults becomes typed and non-destructive); preserves
  ADR-0035's retained _behavior_ (layer-peel precedence, two-tap exit) while keeping its
  _mechanism_ retired; keeps ADR-0098's registry-peeled subviews (adds a URL mirror, not a
  route); keeps ADR-0101's full-screen search as a `TransientOverlayLayer`; folds ADR-0102's
  `peelBack` into a `RepeatableStateLayer` (honoring its "don't thread screen state into
  `resolveBack`" rejection); preserves ADR-0099 (no custom gesture). Remains **Proposed**
  pending review of the two open product decisions below.

## Alternatives considered

- **A — keep the current state-only interception as-is.** Rejected: the destructive stack
  - missing local durability _are_ the bug. This ADR is its repair, not a replacement.
- **B — history-first (meaningful layers become history entries; system back traverses
  naturally).** Rejected: reintroduces the exact ADR-0035 failure class (blind traversal
  into untrusted/foreign entries, double-handling, router desync).
- **D — URL fragments for local layers.** Rejected (§4).
- **E — nested routes for every subview.** Rejected: heavy migration, competes with the
  `?tab=` convention, and pushes history entries (Forward-restore surface) for what are
  local drill-downs; the param mirror gives the durability without the route/Forward cost.

## Open product decisions (do not block acceptance of the model; defaults chosen)

- **Local-destination durability** — mirror subview/filter/search to the URL (reload- and
  deep-link-durable, chosen default) vs. strictly in-memory (smaller change, reload drops
  to the landing). If in-memory is preferred, the URL-mirror phase is dropped and the
  registry fix still resolves the primary bug.
- **Escape scope** — overlays + search only (chosen default) vs. full peel (Escape resets
  filters/exits subviews like system back).
