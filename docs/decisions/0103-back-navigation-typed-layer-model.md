# 0103 — Back navigation: a typed, non-destructive layer model over ADR-0090's resolver

**Status:** Accepted (core shipped + device-validated; deferred items enumerated under "Device validation")
**Date:** 2026-07-21 (revised 2026-07-22 after physical-Android validation)

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

## Device validation (2026-07-22) — what shipped, and the platform finding that reshaped it

The registry fix (§1) shipped first (PR #213) and closed the reported filter divergence.
Validating the rest on a Railway **staging** build with an on-screen nav-trace HUD
(`VITE_NAV_DEBUG`, kept in the tree — `lib/navDebug.ts` + `ui/NavDebugHud.tsx`, inert in
production) then surfaced two more "back closes the app" bugs on a physical Android PWA, and
one platform fact that reshaped the overlay half of this decision.

**The platform finding (the reframe).** Per the WHATWG nav-history spec, a _user-initiated_
backward traversal is only cancelable while the window holds a **consumable user activation**
— and the hardware/gesture back button does **not** grant one. So a page can reliably
`preventDefault` only about **one** system-back per real interaction. The original Decision's
premise ("intercept every system-back") therefore cannot hold for _consecutive_ backs:
peeling several stacked overlays with several presses exhausts the activation and the OS
force-exits. Confirmed on-device — after three intercepted backs the 4th read
`cancelable=false` at a fixed history index and the app left.

**Bug 1 — cross-document exit (shipped fix).** After a reload / WebView eviction (e.g.
returning from the camera) / OAuth round-trip, the fresh document sits above prior-document
entries; a back into them is a non-cancelable _cross-document_ traverse. The old guard only
fueled a **cold-launch index 0**. Fix: `useTripBackGuard` now pushes its same-URL fuel entry
on **any fresh document load** inside a trip (`needsBackGuard(index, freshLoad)`).

**Bug 2 — multi-back exit (shipped fix, a bounded departure).** Since we cannot cancel
consecutive backs, overlays stop relying on cancellation: each active overlay layer now owns
one **same-URL history "marker" entry**, and a system-back **rides** the traversal off the
marker to close the top layer (never `preventDefault`). No cancellation → no activation
dependency → no force-exit at any stack depth. Marker bookkeeping is **push-only** (never a
programmatic `history.back` — StrictMode-safe, and never traverses blindly, honoring ADR-0090
§3); an overlay closed off-back (X/backdrop/Escape) leaves a "spent" marker a later back
harmlessly consumes (cost: at most one no-op back after an off-back close). **Structural** back
(tabs → Home → exit) keeps the ADR-0090 interception — single structural backs have a fresh
activation. This is a deliberate, **bounded** revision of §2's "flat history / interception-first"
(overlays now push markers, so in-trip history is no longer strictly flat) — but **not** a
return to ADR-0035's history-first model: structural back still _computes_ its destination and
never traverses blindly; only overlays ride their own same-URL markers.

**Bug 3 — structural two-tap trip-exit (shipped fix, ride-and-correct).** The same activation
limit hits Home → arm → exit on a _cold-launched_ trip: the 2nd (armed) back arrives
non-cancelable, so the interceptor can't `preventDefault` it and the OS traverses onto the
guard's Home-duplicate fuel — looping back to Home instead of leaving to All Trips (the reported
"press again to leave, second back returns to trip home"). Rather than reseed history so All
Trips sits one entry below the trip (a naive `replace('/trips')` + push remounts the shell
mid-boot and was reverted), the interceptor now **rides then corrects**, mirroring the overlay
fix: on a non-cancelable structural back it lets the traverse commit and, in a `queueMicrotask`,
redirects to `/trips` **iff** the resolved action was `exit-trip` (`correctionForUncancelableBack`).
The redirect is a `push`, not a `traverse`, so it doesn't re-enter the interceptor; every other
action already lands on the correct same-URL entry (an arm keeps Home; a root `none` stays a
legitimate native exit), so only an exit is corrected. The caught (cancelable) two-tap path is
unchanged. Verified device-only (Playwright can't withhold the activation, so the ride path is
covered by the pure `correctionForUncancelableBack` unit test; the cancelable two-tap and
cold-launch guard stay e2e-covered).

**Shipped in this decision:** the typed non-destructive registry (§1); the fresh-load guard;
history-backed overlays; the structural exit ride-and-correct; the env-gated nav-debug HUD.
Real-Chromium e2e covers nested-overlay multi-back peel, search close, the filter lifecycle, the
cold-launch guard, and tab/exit structural back.

**Deferred / still open (not built in this decision):**

- Trigger-aware `resolveBack` + Escape unification (§2) and URL-param durability (§3) — still
  the intended direction, not yet built.

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
  `resolveBack`" rejection); preserves ADR-0099 (no custom gesture). **Refines ADR-0090 §4**:
  overlays now push same-URL history markers (bounded), so in-trip history is no longer strictly
  flat — see "Device validation." The shipped core is **Accepted**; the deferred items there stay
  open.

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

---

## Amendment (2026-07-29, session 175) — a marker is only ridable at the URL it was pushed at, and a visible back control is a layer

> _"When there's a back button on a form or a search or whatever, a system back should do the
> same as if the button was clicked. I want you to do a full app scan for all of these and
> create an app wide solution for all of this once and for all. System backs (android swipe
> gesture) shouldn't do anything different when there's a back button (or cancel, exit)."_

Two changes, one repair and one rule. Both were reproduced in a real browser before being
fixed (`e2e/back-parity.spec.ts`, `e2e/back-map.spec.ts`) — the whole class hides in the seam
between a DOM handler and a history traversal, where a jsdom fixture asserts nothing.

### The repair: `markerDepthRef` is scoped to a URL

The marker bookkeeping counted markers **globally**. It is push-only by design, and the
accepted tradeoff was stated here as _"at most one no-op back after an overlay is closed
off-back"_. That was true only while the app stayed put.

It does not stay put. When a surface navigates while its overlays unmount — precisely what a
place errand does (ADR-0134 §1) — the count keeps the markers those overlays pushed **at the
old URL**. The new screen's layers then look already-markered and get no markers of their own,
and the next back rides an entry belonging to the screen you left. Observed: two Index
overlays closing as an errand navigated to the Map left depth 2, the Map's field and errand
layers got none, and one press rode onto a stale `?tab=index` entry — leaving the tab with the
errand still live. That is the owner's _"it sometimes exits to the main screen"_, and **leaving
the screen was never inside the accepted tradeoff.**

So the depth carries the URL it was counted at, and a navigation resets it: every marker behind
is spent as far as the new screen is concerned. The interceptor checks the same thing before
riding — and when there is no marker here to ride it now **cancels and peels** (ADR-0090's
original interception) instead of riding a foreign entry. That fallback is a safety net, not
the usual path: with per-URL depth a registered layer normally has its own marker already.

### The rule: if a surface shows a way back, that way back is a `useBackLayer`

The scan found three surfaces where the visible control and the system back did different
things. None was a mechanism failure — each was a control that had never been registered:

- **The Map's filter panel.** The row's one pinned `✕` serves both the query and the facets
  and runs `openDisclosure(null)`, but the layer was gated on the QUERY. With the filter open
  a back walked past a visible close control and left the tab. Gated on the disclosure now,
  which is what the `✕` is bound to.
- **Plan mode's resolve sheet.** A two-step sheet whose step 2 renders its own `אירוע אחר`
  step-back. `Modal` registers `onClose`, so a system back dismissed the whole sheet while the
  button one line above went back a step. It registers a repeatable layer
  (`remainsActive: true`) in the sheet's own component — the Modal's PARENT, so child-first
  effect ordering puts the step layer above the close layer and back peels the step first.
- **The all-trips screen.** A declared root (`ROOT_PATHS`), so a structural back is a no-op and
  the OS leaves the app — right when there is nowhere in-app to go, wrong the moment the header
  renders its arrow back into a live trip. Cold-launched at `/trips` there is no history entry
  to fall back on either, so the gesture quit the app while the button returned to the trip.
  A layer gated on exactly what renders the arrow, bound to the same handler.

Stated as the rule the owner asked for, and now the first thing to check when adding a
surface: **a control that means "go back one step" belongs in the back stack.** `Modal` does
this for free (`useOverlay(onClose)`) and covers most of the app — every sheet, dialog,
picker and confirm. What needs a deliberate `useBackLayer` is the other two shapes: a **state a
mounted screen enters and leaves** (the Map's disclosure row), and a **step inside an overlay**
(the resolve sheet). Both were already supported; neither had been used at the sites above.

Not in scope, and deliberately: a `✕` that **clears a value or dismisses a notice** — the
place picker's clear, `FilePicker`'s remove, `StatusBanner`'s dismiss, the shelf card's remove.
Those are content actions wearing the same glyph. Back navigates; it does not edit.

## Amendment (2026-07-29, session 176) — an implicit way out is still a way out

> _"When there's an implicit way to go back (closing a modal by tapping outside it for
> example) we should also treat system back as the same."_

The session-175 rule was stated in terms of a **visible** control. That was too narrow: what
makes a surface owe back an outcome is that the surface can be dismissed at all, not that the
dismissal has a label. A backdrop tap, a tap outside a popover and Escape are the same promise
as a `✕`.

`Modal` already honours this — its backdrop `onClick` and its Escape handler are the very
`onClose` it registers — which is why every sheet, dialog, picker and confirm needed nothing.
The gaps were all **hand-rolled panels that never went through it**, so they were not in the
back stack at all and back fell through to whatever was underneath:

- **The icon picker's panel.** Closes on an outside tap and on Escape. A system back inside an
  event or booking form fell through to the FORM's layer and discarded what you were typing —
  while a tap two pixels to the left only closed the panel.
- **`TimeField` / `TimePicker`.** Both render a `.tp-backdrop` whose entire job is "tap here
  to close me", with the same fall-through consequence.
- **A selected place on the Map.** Selecting raises the place card and a tap on blank canvas
  clears it (`onCanvasTap`). Back left the tab instead — throwing away the screen where the
  canvas would only have thrown away the selection.

All four register through the existing `useBackLayer`, gated on the open/selected state. That
gate is also what makes the ordering correct without anyone reasoning about component trees: a
layer joins the stack **when it becomes active**, so a popover opened inside a form lands above
the form's layer, and on the Map whichever of {selection, query row, errand} you opened last is
the one back peels first.

**The boundary stays where §175 put it.** A `✕` that clears a value or dismisses a notice —
`FilePicker`'s remove, `StatusBanner`'s dismiss, a picker's clear, the shelf card's remove — is
not a way out of a surface, and back must not start editing content. The test is whether the
gesture _dismisses something you are in_, not whether it removes something from the screen.

### One consequence worth naming

Leaf primitives now participate in the back stack, so they can no longer be rendered bare in a
test — `useBackLayer` needs `NavProvider`, which needs a router and the toast. That harness was
already open-coded **identically in fourteen** `*.test.tsx` files; it is now
`src/test/nav-harness.tsx`'s `wrapNav`, and all fourteen use it (rule 8 — the alternative was a
fifteenth copy). The seven wrappers that genuinely differ (extra providers, a `BrowserRouter`,
in-tree probes) keep their own.

## Amendment (2026-07-29, session 177) — markers follow the URL, not just the layer stack

> _"Home → events → + add event → add location → back (closes keyboard) → back (goes back to
> event form) → back (closes app instead of closing the modal)."_

Reconciling markers only on register/unregister assumed **a layer's URL never moves under it**.
Every errand return breaks that assumption: the form re-opens, and _then_ the destination
rewrites its own URL with `replace` — the Index stripping `?focus=bookings` once it has acted
on it, `cancelErrand` navigating to `returnTo`. The layer stays registered across that, so
nothing reconciled, and its marker was left describing a URL the app had already left. The
session-175 `ridable` check (marker URL === current URL, which is what stops a ride escaping to
another screen) then reads **false while a layer is plainly open**.

A **cancelable** press hides this completely: the fallback added in 175 cancels the traversal
and peels the layer, so the outcome is right. The device does not grant that. Consecutive
presses arrive **uncancelable** — the activation gate this entire scheme exists for — and then
there is nothing to ride and nothing to cancel. The traversal commits and takes the screen with
it; from the trip's first form, that is the app closing.

The fix is one effect: run the same `reconcileMarkers` on every location change. The per-URL
depth resets and each still-open layer gets a marker at the URL it is actually on. It cannot
loop — `pushMarker` navigates to the same URL, so the next pass finds the depth already
matching the stack and pushes nothing.

### Why a browser harness could not find this

`e2e/back-map.spec.ts` drives the owner's exact sequence and **passes**, before and after. Every
traversal Playwright can fire arrives `cancelable: true`, so the interceptor always gets to
cancel and the missing marker never matters. The one axis that reproduces it is the one a real
Android varies and a headless browser does not.

So this regression lives in `state/nav-state.system-back.test.tsx`, whose fake Navigation API
takes `cancelable` as a **test input** precisely for this. Two cases, same flow: a layer whose
URL was replaced under it peels on a cancelable press (already true) and on a non-cancelable
one (the fix). **Read that as the general rule: an e2e is the right tool for "does the app do
the right thing", and the wrong tool for anything gated on user activation.**

### Known and NOT fixed here: the errand leaks history

Each place-errand round trip permanently adds **two** history entries and strands a `?tab=map`
entry behind the user — measured, three round trips leave you at index 7 of 9. ADR-0090 says
in-trip history stays flat; with an errand in the flow it does not.

It is left alone deliberately. Markers are push-only by design here, and the "spent marker"
tradeoff was accepted on the explicit grounds that programmatic `history.back()` reconciliation
races Strict Mode and rapid re-renders. Unwinding them is that rejected design, re-opened —
a decision, not a patch. Nothing observable misbehaves today: structural backs always
`replace`, so the stranded entries are never traversed into; the cost is an unbounded forward
stack and a longer history than the model claims.

**And the invariant that keeps it harmless is now enforced rather than remembered.** Those
entries are unreachable for exactly one reason: no back ever traverses. That was documented in
ADR-0090 and honoured by hand. It is now two guards:

- **A lint rule** (`BACK_TRAVERSAL_SELECTORS` in `eslint.config.mjs`) bans `navigate(-1)`,
  `history.back()`/`forward()`/`go()` and reads of `history.length` in frontend app code.
  Tests are exempt by pattern — `nav-state.system-back.test.tsx` and `Map.back.test.tsx` call
  `history.back()` to SIMULATE the platform, which is the one legitimate use.
- **An exhaustive `runStructural`.** Its `default: break` meant a new `BackAction` kind became
  a silent no-op — the state in which someone reaches for `history.back()` to "make back work
  again". It is now a `never` check, so a new kind fails the build until it says what explicit
  navigation it performs.

Both were verified to fire, not just written: six traversal shapes each raise the lint error,
and adding a seventh `BackAction` kind fails `tsc`.
