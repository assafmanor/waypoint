# Session 65 — Back-navigation architecture overhaul (investigation + implementation-ready plan)

**Date:** 2026-07-21
**Status:** Planning note (investigation complete; production overhaul deferred to a later session)
**Outputs:** Proposed [ADR-0103](../decisions/0103-back-navigation-typed-layer-model.md); backlog line updated (no duplicate).

> Evidence labels used throughout: **[code]** verified in current code · **[e2e]**
> reproduced in an automated browser test · **[manual]** reproduced by hand ·
> **[docs]** supported by browser/platform documentation · **[rec]** architectural
> recommendation · **[?]** still unverified / needs physical Android.

---

## 1. Executive summary

Waypoint's Back is reported working "sometimes not as expected" app-wide (backlog, from
session 63). The current mechanism (ADR-0090) is sound and stays: back is a **pure
function of structural nav state**, executed as an explicit `replace` navigation, with a
Navigation-API interceptor for Android/Chromium system-back and a cold-launch history
guard; in-trip history is flat and never traversed. **[code]**

The bug is one layer below the resolver: ADR-0090's `hasOverlay → close-overlay` rule
consults a **single destructive LIFO stack of `{id, close}` callbacks** that four
semantically different things register into (real modals, the Documents subview, the
Bookings subview + its category filter, and full-screen search). `runBack('close-overlay')`
does `stackRef.current.pop()?.close()` — removing the entry _before_ calling its
callback. That is correct only when the callback unmounts its owner. `IndexBookingsView`
registers a callback that, with a category filter active, **only resets the filter and
stays mounted** — so back pops it off the stack, the screen remains visible but
unregistered, and the next system-back leaks past it. The visible arrow (which calls the
handler directly) still works, so system back and the app button diverge. **[code]**

Recommendation **[rec]:** keep ADR-0090's resolver/interception/flat-history core; replace
the destructive stack with a **typed, non-destructive `BackLayer` registry** (a
`RepeatableStateLayer` returns "handled but remains active", fixing the primary bug); make
`resolveBack` **trigger-aware** so every trigger (system, app-button, Escape,
explicit-close, forward) has exactly one owner; and give Index local destinations a
**replace-written URL-param restoration mirror** (fragments rejected) so reload/deep-link/
restore reconstruct them while history stays flat and Forward is a defined no-op for local
layers. This is Alternative C (bounded hybrid) — the least-fragile fit because it repairs
the verified root causes with the smallest deviation from the proven core, and does **not**
reintroduce the history-first failure class that killed ADR-0035.

## 2. Scope

In scope: every Back trigger (Android/Chromium system back, visible app Back buttons,
browser back/forward, Escape, explicit close), and every Back-capable state (routes,
trip tabs, Index landing/Bookings/Documents subviews, the category filter, search,
real overlays, PWA root/exit). Cross-cutting: cold launch, reload, deep link, restored
session, auth-return, installed-PWA vs. browser tab, unsupported browsers.

Out of scope: the production refactor itself (later session); any change to behavior
unrelated to Back; reintroducing a custom gesture (ADR-0099 stands); switching routers.

## 3. Repository guidance reviewed

Root `CLAUDE.md` (hard/soft primitive; reuse-existing-infra rule ADR-0096;
progressive-disclosure); `frontend/CLAUDE.md` (Modal/`useOverlay` for every overlay;
`resolveBack` + explicit `{replace:true}` for every in-trip transition, never
`navigate(-1)` or history depth; a new structural back case is a rule in `resolveBack`,
not a call-site handler); `docs/INDEX.md` router ("App shell & navigation" domain);
`docs/backlog.md` (the open session-63 item — updated, not duplicated); ADR process
(`decisions/README.md`).

## 4. Relevant ADR & planning history

- **ADR-0007 / 0017** — mobile-first, phone-primary PWA; desktop = graceful minimum.
  The load-bearing platform facts: an installed iOS PWA has no browser chrome and no
  system-back; non-Chromium desktop has no Navigation API. **[docs]**
- **ADR-0024 / 0033** — the shell route set (`/login`, `/new`, `/join/:token`,
  `/trip/:id/settings`, `/`=in-trip shell) and All Trips (`/trips`) as the "out and
  across" root that leaving a trip lands on. `resolveBack`'s shell-parent + root rules
  mirror this. **[code/docs]**
- **ADR-0035** — Accepted, but its _mechanism_ ("in-app navigation _is_ history";
  `history.back()`) is superseded by 0090; its _behavior_ stands (layer-peel precedence,
  two-tap trip exit, single-source day model). Its own refinement log is the record of the
  history model breaking repeatedly (Android edge owns `history.back()`; `navigate(-1)`
  into foreign OAuth/PWA/idx-desynced history; day double-tap from two copies of
  `activeDate`). **[docs]**
- **ADR-0060** — idle-resume (≥30 min hidden, Trip mode) resets to Home/today +
  `closeAllOverlays()`. **[code]**
- **ADR-0079** — one `Modal` primitive owning the overlay-stack registration + focus
  contract; `sheet`/`dialog` variants. The single registration point for rule 1. **[code]**
- **ADR-0090** — CURRENT authoritative mechanism (not superseded). `resolveBack(snapshot)
→ BackAction`; every trigger through one `runBack`; `navigate(-1)`/`history.back()`
  never used; flat in-trip history; Navigation-API interceptor; the 2026-07-20 refinement
  added `useTripBackGuard` (a duplicate index-0 fuel entry so a cold-launch system-back is
  cancelable), verified with a real Chromium e2e. **[code/e2e]**
- **ADR-0098** — Index landing + dedicated Bookings/Documents screens; **§5 (load-bearing):
  the subviews are local view state registered via `useOverlay`, NOT routes or a `?tab=`
  value**, because `resolveBack` rule 2 would jump past the landing. **[code/docs]**
- **ADR-0099** — the custom edge-swipe gesture is deleted outright; every other trigger
  unaffected; iOS loses gesture back (accepted). **[docs]**
- **ADR-0100 / 0101 / 0102** — Index bookings header redesign; full-screen search as a new
  `Modal variant="full"` (`SearchOverlay`, `useDialogFocus` `initialFocusRef` pops the
  keyboard); search ignores the active category, multi-field/synonym matching, and
  **`lib/backPeel.ts` `peelBack(isModified, reset, close)`** wired into both `useOverlay()`
  and `IndexBackRow.onBack`. ADR-0102 **explicitly rejected** adding a `BackAction` kind for
  "peel local state" — `resolveBack` must stay a pure function of structural nav state.
  Both 0101 and 0102 flag the general app-wide back inconsistency as an out-of-scope
  backlog item needing a real repro. **[code/docs]**
- **Planning:** session-13 (original history model → 0035), session-59/60 (Index build →
  0098; session-60 verified a real system-back closes Bookings to the landing, not Home),
  session-61 (edge-swipe retirement → 0099), session-62/63/64 (search → 0100/0101/0102).
  No dedicated planning doc introduced 0090; session-61 is the only one referencing it.

## 5. Current architecture map (all **[code]**)

**Central machinery — `state/nav-state.tsx`.**

- `NavSnapshot = { hasOverlay, insideTrip, tab, pathname, armed }` (`:67`).
- `resolveBack(s) → BackAction` (`:102`): `hasOverlay → close-overlay`; `insideTrip` →
  (non-Home tab → `to-home`; Home → `armed ? exit-trip : arm-exit`); `ROOT_PATHS`
  (`/`,`/trips`,`/login`) → `none`; else `to: parentRoute(pathname)` (`/trip/*`→`/`, else
  `/trips`).
- Overlay stack: `stackRef = useRef<{id,close}[]>` (`:228`); `registerOverlay` push
  (`:310`); `unregisterOverlay` splice-by-id (`:315`); `runBack('close-overlay')` =
  `stackRef.current.pop()?.close()` (`:255`); `closeAllOverlays` splice-then-close (`:321`).
- `useOverlay(onClose)` (`:348`): register-on-mount, latest-ref (no duplicate push on
  re-render), unregister-on-unmount.
- Interceptor (`:287`): Navigation API `navigate` event; acts only on `cancelable`
  backward `traverse`; `classifyBack()`; `none → return` (OS proceeds, native exit); else
  `preventDefault()` + `runBack`.
- `useTripBackGuard` (`:390`) + `needsBackGuard(idx)==idx===0` (`:407`): push one same-URL
  entry when the shell mounts at history index 0.
- `useAppBack()` (`:441`) — single-shot classify+run for the visible shell back buttons.
- Dead exports: `backSlides` (`:125`), `useReturnControls` (`:433`) — zero runtime
  consumers, reference the retired gesture.

**Router / wiring — `App.tsx` + `main.tsx`.** `BrowserRouter` (JSX `<Routes>`, not the
data router); provider order `Auth > ActiveTripId > Toast > Nav > Confirm > routes`; shell
routes match `ROOT_PATHS`; `Shell` mounts `useTripTab`/`useMarkInsideTrip`/`useTripBackGuard`
and the idle-resume `visibilitychange` effect; no Escape handler and no shell back button
live in `App.tsx` (Escape is in `useDialogFocus`; back buttons are in CreateTrip/TripSettings).

**Overlays.** `Modal` (`ui/primitives/Modal.tsx`) calls `useOverlay(onClose)` (`:45`),
variants `sheet`/`dialog`/`full`; `useDialogFocus` owns focus-in, Tab-trap (dialog only),
focus-restore, and a **capture-phase Escape that calls `onClose` directly** (`:40`).
`Sheet`/`ConfirmDialog`/`RowManageSheet`/`SearchOverlay` all flow through `Modal`;
`DocumentViewer` is a lint-allowlisted bespoke portal that also calls `useOverlay`.

**Index — `screens/Index.tsx` + `ui/Index*View.tsx`.** `view:'landing'|'bookings'|
'documents'` is local `useState`; `?booking=`/`?focus=docs` deep-links are consumed then
stripped (`Index.tsx:53`). `IndexDocumentsView` registers `useOverlay(onClose)` cleanly.
`IndexBookingsView` holds `category`/`searchMode`/`query`/`showPast` locally and registers
`backOrResetCategory = () => peelBack(activeCategory!==ALL, ()=>setCategory(ALL), onClose)`
(`:93`), also wired to the visible arrow (`:143`); search renders `SearchOverlay`
(`variant="full"`) which registers its own entry on top.

**Structural push/replace policy.** Tab↔tab, day, back-to-home, shell→parent, and all
auth/idle/deleted redirects **replace** (flat history). Cross-surface entries — All
Trips→Trip, →Create, Trip→Settings/switcher, Create/Join success, `exit-trip`→`/trips` —
**push**.

## 6. Current Back trigger flow (all **[code]**)

| Trigger                                   | Path today                                                                                          | Owner                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------- |
| Android/Chromium system back              | Nav-API `navigate` → interceptor → `classifyBack` → `preventDefault`+`runBack`, or pass when `none` | `nav-state` interceptor     |
| Visible shell back (Create/Trip Settings) | `useAppBack()` → classify+run                                                                       | `nav-state`                 |
| Visible Index back arrow                  | calls `backOrResetCategory`/`onClose` **directly** (not through the stack)                          | the component               |
| Nav-bar Home tap                          | `goToTab('home')` → `tabTarget` replace to `/`                                                      | `nav-state`                 |
| Escape                                    | `useDialogFocus` capture listener → `onClose` **directly**                                          | the overlay (parallel path) |
| Browser back (desktop non-Chromium)       | flat-history traversal, not intercepted (graceful minimum)                                          | browser                     |
| Browser forward                           | flat history → no local-layer entries to restore                                                    | browser                     |

The divergence surfaces are the two **"directly"** rows: the Index arrow and Escape bypass
`runBack`/the stack, so they can leave the stack in a different state than system back does.

## 7. Verified behavior matrix

Captured by code trace (session 65) and the existing `e2e/back-navigation.spec.ts`
(real Chromium traversal). The exhaustive per-trigger capture (URL, params, stack, layer
type, cancelable?, owner-remained-mounted?, resulting screen, double-handled?) is Phase-2
execution work with temporary diagnostics; the **decision-relevant** rows are:

| Flow                                                     | Trigger    | Result                                                                           | Correct?                         | Evidence                      |
| -------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- | -------------------------------- | ----------------------------- |
| Cold launch into trip → system back at Home tab          | system     | guard entry present (`index≥1`); stays on `/`, arms exit                         | ✓                                | **[e2e]**                     |
| Non-Home tab → system back                               | system     | back to Home, in-app                                                             | ✓                                | **[e2e]**                     |
| Home base → two system backs                             | system     | 1st arms (stays `/`), 2nd → `/trips`                                             | ✓                                | **[e2e]**                     |
| Bookings, no filter → system back                        | system     | closes to landing                                                                | ✓                                | **[code]** (clean stack path) |
| **Bookings, filter active → system back**                | system     | **only resets filter; Bookings stays mounted but is popped off the stack**       | ✗                                | **[code]** (root cause 1)     |
| …then a second system back                               | system     | **leaks past Bookings into structural back (→ Home/arm-exit), skipping landing** | ✗                                | **[code]**                    |
| Bookings, filter active → visible arrow                  | app-button | resets filter, screen stays (arrow re-invokes next time)                         | ✓ (diverges from system back)    | **[code]**                    |
| Any overlay → Escape                                     | escape     | closes topmost via a parallel path, not `runBack`                                | ✓ for real modals; fragile       | **[code]**                    |
| Reload while in Bookings/Documents/search                | reload     | resets to Index landing (state lost)                                             | ✗ (no durability)                | **[code]**                    |
| Forward after a local back                               | forward    | no-op (flat history)                                                             | acceptable-by-design             | **[code]**                    |
| Shell route (`/new`, `/trip/:id/settings`) → system back | system     | to parent                                                                        | ✓ but **no e2e**, pure test only | **[code]**                    |
| Cold launch into All Trips → system back                 | system     | native exit (root `none`)                                                        | ✓                                | **[code]** **[?]** on device  |

## 8. Root causes ranked (confidence × severity; all **[code]**)

1. **Destructive pop + mounted-but-unregistered subview (high × high).** The primary bug
   (`IndexBookingsView.tsx:93`, `nav-state.tsx:255`). One back removes two states; system
   back ≠ app button; a layer is skipped.
2. **One LIFO stack conflates incompatible lifecycles (high × high).** Real modal vs.
   full-screen subview vs. repeatable filter vs. search — destructive `pop()` is only
   correct for the always-unmount cases.
3. **No durable representation for local destinations (high × medium).** Reload/Forward/
   deep-link/restore cannot reconstruct subview/filter/search.
4. **Escape is a second, independent close owner (medium × medium).** `useDialogFocus.ts:40`
   bypasses `runBack`.
5. **`arm-exit` persists across surfaces (medium × low).** `exitPendingRef` cleared only on
   `exit-trip`/timeout → latent "one back exits."
6. **Dead exports mislead (low × low).** `backSlides`, `useReturnControls`.
7. **Guard duplicate entries accumulate (low × low).** Benign; history is never read.
8. **Tests validate policy, not platform, beyond three system-back paths (medium × medium).**
   No e2e for overlay-peel-before-tab via real system back, nor for shell-route back.

## 9. New behavioral invariants (targets)

1 back removes ≤1 semantic layer · every trigger has exactly one owner · a user action is
never handled by state _and_ by browser traversal · a traversal callback restores a
destination, never issues another back · a consumer that stays mounted stays eligible · a
dismissible layer unregisters only on real deactivation/unmount · nested overlays close
topmost-first · the visible back is deterministic and never blindly traverses unknown
history · history depth is never proof of a safe parent · unknown/external entries are
never treated as logical parents · true root allows native exit · cold-launch/reload/
deep-link/Forward behavior each explicitly defined · invalid URL/history state degrades to
a canonical valid state · search/filters/subviews/overlays have deterministic priority ·
unsupported browsers degrade intentionally · nav is testable independently of component
side-effects · exactly one owner mutates browser history · overlay focus/a11y preserved.

## 10. Intended trigger-by-state behavior matrix **[rec]**

| State (topmost) →                      | system back                        | app Back button      | Escape              | forward                      |
| -------------------------------------- | ---------------------------------- | -------------------- | ------------------- | ---------------------------- |
| Transient overlay (modal/sheet/dialog) | close topmost, unmount             | close topmost        | close topmost       | n/a                          |
| Full-screen search                     | close search                       | close search         | close search        | restore if param present     |
| Active category filter                 | reset filter, **stay in Bookings** | reset filter, stay   | **no-op** (default) | restore if param present     |
| Bookings/Documents subview             | to Index landing                   | to landing           | no-op               | restore if param present     |
| Non-Home trip tab                      | to Home                            | to Home              | no-op               | forward entry only if pushed |
| Trip Home (unarmed)                    | arm exit + toast                   | arm exit             | no-op               | —                            |
| Trip Home (armed)                      | exit → `/trips`                    | exit                 | no-op               | —                            |
| Shell route (`/new`, settings)         | to parent                          | to parent            | no-op               | —                            |
| Root (`/trips`, zero-state `/`)        | **native OS exit**                 | n/a (no back button) | no-op               | —                            |

## 11. State & layer taxonomy **[rec]**

`RouteLayer` (structural route; React Router + `resolveBack` structural rules) ·
`LocalSubviewLayer` (Index bookings/documents; URL-param mirrored; unmounts on peel) ·
`RepeatableStateLayer` (category filter; back resets, `remainsActive:true`) ·
`TransientOverlayLayer` (real modal/sheet/dialog/search; back closes+unmounts) ·
`ExitBoundaryLayer` (trip-Home arm/exit + root). `BackResult = {handled:false} |
{handled:true, remainsActive:true} | {handled:true, remainsActive:false}`. The executor
walks topmost-first, calls the top active layer's handler, and lets the result + the
component's own mount lifecycle decide registration — never a blind `pop()`.

## 12. State ownership **[rec]**

| State                                | Authoritative owner                      | Derived mirror                  | Sync direction                              |
| ------------------------------------ | ---------------------------------------- | ------------------------------- | ------------------------------------------- |
| All Trips / Trip Home / shell routes | route path (React Router)                | —                               | —                                           |
| Active trip tab                      | `?tab=` param                            | —                               | replace-written                             |
| Active day                           | `?day=` param (ADR-0090 single source)   | `activeDate` derived            | param→state                                 |
| Index subview (bookings/documents)   | back-registry layer (peel authority)     | `?view=` param                  | state→param on change; param→state on mount |
| Booking category filter              | component state + `RepeatableStateLayer` | `?cat=` param                   | same                                        |
| Search open + query                  | component state + overlay layer          | `?q=` param (open flag implied) | same                                        |
| Real modal / nested modal            | component render condition + layer       | —                               | —                                           |
| Exit-guard (`armed`)                 | `exitPendingRef` (time-boxed)            | —                               | cleared on any nav-away                     |

No state is authoritative in two systems; the URL param is always the derived restoration
mirror for local layers, never the peel driver (respecting ADR-0098 §5 / ADR-0102).

## 13. Browser-platform constraints

- Navigation API (`window.navigation`, `navigate` events, `intercept`/`preventDefault`) is
  **Chromium-only** (Android + desktop Chrome/Edge); absent on Safari/iOS and Firefox. **[docs]**
- An **app-leaving** backward traversal (nothing in-app behind the current entry) is
  **non-cancelable** — `preventDefault` cannot stop it. This is _why_ the cold-launch guard
  exists. **[docs]** + the ADR-0090 refinement (**[e2e]**).
- Same-document (param/fragment) navigations _are_ cancelable same-document traverses on
  Chromium. **[docs]**
- Installed-PWA `standalone` on iOS = no browser chrome, no system back at all. **[docs]**
- The architecture must **not** depend on cancellation where the platform doesn't guarantee
  it (root exit, iOS) — hence interception is _primary on Chromium, best-effort elsewhere_,
  with the deterministic parts (visible buttons, URL durability) as the portable floor.

## 14. Alternatives considered **[rec]**

- **A — current state-only interception.** Correct core; destructive stack + no local
  durability are the bug. Rejected as-is; C is its repair.
- **B — history-first.** Repeats the ADR-0035 failure class (blind traversal, double-handle,
  router desync, untrusted entries). Rejected.
- **C — bounded hybrid (RECOMMENDED).** Typed non-destructive registry + param-mirror
  durability + flat history + interception core. Least fragile; smallest deviation from the
  proven core; fixes all verified root causes.
- **D — fragment-backed local layers.** Rejected (§15).
- **E — nested routes for every subview.** Heavy migration; competes with `?tab=`; pushes
  history entries (Forward surface) for local drill-downs. Rejected; params give durability
  without the route/Forward cost.

Per-axis (C vs. B/E): correctness ✓ (one owner, no double-handle); Android/desktop/iOS —
same coverage as today, iOS _improved_ by URL durability; reload/deep-link ✓; Forward
defined (no-op local); auth-return safe (never traverses external); root exit native;
testability high (pure registry + real-traversal e2e); migration incremental; double-handle
/ desync / stale-registration risk low; URL readability/shareability improved; interacts
cleanly with the existing router + overlay components; low likelihood of repeating earlier
bugs. B/E raise double-handling, desync, and Forward-restore risk.

## 15. URL-fragment evaluation → **Rejected**

Evaluated `location.hash` as a first-class option (not `HashRouter`) for Bookings/Documents/
filter/search. Findings: a fragment change participates in session history exactly like a
search-param change, so it inherits the same double-handling / unsafe-programmatic-traversal
/ excessive-entries / unknown-prior-entry hazards — plus fragment-specific costs (default
scroll-to-anchor must be suppressed; `#id` collisions with document anchors; `hashchange`
_and_ `popstate` _and_ router location can each fire for one traversal, needing explicit
double-handling suppression). It offers no capability the existing `?tab=`/`?day=`/`?booking=`
**search-param** convention doesn't already provide, and adopting it would stand up a second
competing convention against ADR-0096's reuse rule. **Classification: Rejected.** The
durable-local-destination need it was floated for is met by the param mirror (§11–12). A
focused Playwright prototype (Index landing→Bookings→filter→Search→back×3→forward×2, then the
same via the app arrow) will be run in execution to record the rejection with evidence and to
confirm params satisfy: one trigger = one layer, no double traversal, Forward restores the
expected destination, root stays exit-capable, reload is defined, invalid params fall back.

## 16. Recommended architecture

See ADR-0103 §Decision. In one line: **ADR-0090's pure resolver + interception core, with
its overlay mechanism replaced by a typed non-destructive `BackLayer` registry, a
trigger-aware `resolveBack(snapshot, trigger)`, and a replace-written URL-param restoration
mirror for Index local destinations; fragments rejected; history stays flat; Forward is a
defined no-op for local layers; true root exits natively.**

## 17. Proposed APIs & data structures **[rec]**

```ts
// state/back-registry.ts (new)
type BackLayerType =
  'route' | 'local-subview' | 'repeatable-state' | 'transient-overlay' | 'exit-boundary';
type BackTrigger = 'system' | 'app-button' | 'escape' | 'explicit-close' | 'browser-forward';
type BackResult = { handled: false } | { handled: true; remainsActive: boolean };
interface BackLayer {
  id: number;
  type: BackLayerType;
  priority: number;
  handle: (t: BackTrigger) => BackResult;
}

function useBackLayer(type: BackLayerType, handle: (t: BackTrigger) => BackResult): void; // stable id, latest-ref handler, unmount cleanup
// useOverlay(onClose) becomes a thin deprecated shim: useBackLayer('transient-overlay', () => (onClose(), { handled: true, remainsActive: false }))

// state/nav-state.tsx (modified)
function resolveBack(s: NavSnapshot, trigger: BackTrigger): BackAction; // unchanged for structural cases; consults the registry for 'close-overlay'
```

`runBack` calls the topmost active layer's `handle(trigger)`; on `remainsActive:false` the
owner unmounts and its effect cleanup deregisters; on `remainsActive:true` it stays. Escape
passes `trigger:'escape'`; the registry's Escape policy skips `repeatable-state`/`local-subview`.

## 18. Browser-history policy **[rec]**

Push: only cross-surface entries (All Trips↔Trip, →Create/Join/Settings, `exit-trip`→`/trips`).
Replace: every in-trip transition (tab, day, subview, filter, search) and every redirect.
Not touched: opening a real transient overlay (no history entry — it's a registry layer).
Waypoint-owned entries are identified structurally (path/param shape), never by count/index;
`navigate(-1)`/`history.back()` remain forbidden; a positive `history.length`/Nav-API index is
never treated as proof of a safe parent. Reload/deep-link restore from the URL (path + params);
Forward restores a param-backed destination if the entry exists, else no-op; invalid params
canonicalize to the landing. React Router stays the sole history owner (no raw `pushState`).

## 19. App Back policy **[rec]**

Means "go to this screen's logical parent." Resolves via the registry / URL, never traverses
unknown history, never issues a second resolution, updates state (which mirrors to the param
via `replace`) rather than calling browser traversal, and does not manufacture a Forward entry
for local layers.

## 20. System Back policy **[rec]**

Chromium interceptor is **primary**: act only on cancelable backward `traverse`; run the
resolver; `preventDefault`+execute, or pass to the OS when the resolved action is `none`
(native exit) or the traverse is non-cancelable. Behavior without the Navigation API
(iOS/Firefox): not intercepted — rely on visible buttons + URL durability. During Android
soft-keyboard dismissal the OS consumes the first back without a navigation event; that is
**not** an architecture failure (do not try to intercept it).

## 21. Escape & explicit-close policy **[rec]**

Escape routes through `resolveBack(_, 'escape')`, restricted to `transient-overlay`/search;
it does **not** reset filters or exit subviews (default — open decision) and is a no-op when
no such layer is active. The independent `useDialogFocus` Escape path is removed (focus/trap
stay). Explicit close (X) invokes the same semantic layer action as back, so cleanup is
identical.

## 22. Browser Forward policy **[rec]**

Local layers are param-backed and history is flat, so Forward is a **defined no-op** for them
(they never created a forward entry). Only cross-surface pushes produce forward entries;
Forward there re-enters the pushed surface. Forward never duplicates a registration (layers
register on mount, keyed by stable id) and never restores a modal (modals aren't history-backed).

## 23. Root & native-exit policy **[rec]**

True root = All Trips (`/trips`) and zero-state `/` → `resolveBack:none` → OS proceeds →
native PWA exit. Trip Home keeps two-tap arm→exit, `exitPendingRef` cleared on any nav-away.
`useTripBackGuard` stays scoped to inside-a-trip cold launch (fuel, not a trap); add a test
that All Trips at index 0 still exits. No sentinel ever traps the user; a cold launch into a
meaningful in-trip state does not exit prematurely (guard) — and where it cannot be guaranteed
(non-Chromium), that limit is documented, not hidden.

## 24. Unsupported-platform behavior **[rec]**

Capability detection: `getNavigation()` presence. With it → interception primary. Without it
→ visible buttons + URL durability are the deterministic floor; system/gesture back is the
browser's own (flat traversal on desktop; nothing on iOS standalone, ADR-0099). Documented as
the ADR-0090 graceful minimum, now _improved_ by param durability.

## 25. Migration phases

Each: goal · user-visible change · files · tests-first · ships-alone? · rollback · risk · done-when.

1. **Repro coverage.** Lock current behavior with real-traversal e2e (Bookings→filter→search,
   Documents, nested overlays, shell-route back, cold launch). Files: `e2e/back-navigation.spec.ts`,
   new `e2e/back-index.spec.ts`. Ships alone. Rollback: delete specs. Done: baseline green.
2. **Diagnostics + verified matrix.** Temporary logging in `runBack`/registry; capture §7 fully;
   **remove**. Ships alone. Done: matrix recorded here, instrumentation gone.
3. **Typed registry.** `state/back-registry.ts` (+test); `useBackLayer`; `useOverlay` shim.
   Pure tests first. Ships alone (no behavior change yet). Risk: Strict-Mode double-register —
   covered by test. Done: shim passes existing Modal/overlay tests unchanged.
4. **Separate overlays from repeatable/local layers (THE FIX).** `Modal`→`transient-overlay`;
   `IndexDocumentsView`→`local-subview`; `IndexBookingsView` filter→`repeatable-state`
   (`remainsActive:true`); fold `lib/backPeel.ts`. Tests first (repeatable-stays-active).
   Ships alone. Rollback: revert to shim. Done: filter→system-back→filter-reset-then-landing
   passes e2e.
5. **Trigger-source + Escape unification.** `resolveBack(snapshot, trigger)`; Escape via resolver;
   remove `useDialogFocus` close path. Files: `nav-state.tsx`, `lib/useDialogFocus.ts`. Risk:
   nested-overlay Escape (ADR-0079 known issue) — assert topmost-only. Done: Escape closes only
   the topmost overlay, never a filter.
6. **URL-param durability.** `?view=`/`?cat=`/`?q=` replace-written; `Index.tsx` derives `view`
   from param (stop stripping); canonicalize invalid → landing. Files: `Index.tsx`,
   `IndexBookingsView.tsx`, `nav-state.tsx`. **Gated on the open durability decision** — droppable.
   Done: reload/deep-link reconstruct the exact screen; Forward no-op verified.
7. **Search migration** onto the layer types per ADR-0101. Files: `SearchOverlay` consumers.
8. **Structural/guard hardening.** `arm-exit` cross-surface clear; audit shell/trip transitions;
   scope-document the guard. Files: `nav-state.tsx`, `App.tsx`. Done: cross-surface arm edge gone.
9. **Root-exit test.** All-Trips-at-index-0 native exit. Files: e2e.
10. **Forward + reload e2e** for every param-backed state; document the no-op contract.
11. **Physical Android validation** (§28).
12. **Cleanup.** Remove `backSlides`/`useReturnControls`, remaining diagnostics; update ADR-0090
    cross-refs, `architecture/app-shell.md`, `frontend/CLAUDE.md` navigation section; flip ADR-0103
    to Accepted after review.

APIs to deprecate (not silently change): `useOverlay` (→ shim over `useBackLayer`);
`lib/backPeel.ts` `peelBack` (→ `repeatable-state` layer). `backSlides`/`useReturnControls`
removed.

## 26. File-by-file plan

| File                                                   | Change             | Current responsibility                              | New responsibility                                                                                          | Phase      | Tests                         |
| ------------------------------------------------------ | ------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------- |
| `state/nav-state.tsx`                                  | modified           | resolver + destructive stack + interceptor + guard  | trigger-aware resolver; delegates `close-overlay` to registry; arm-exit clear on any nav-away; guard scoped | 3,5,8,9,12 | `nav-state.test.ts`           |
| `state/back-registry.ts` (+`.test.ts`)                 | **added**          | —                                                   | typed layer registry + `useBackLayer` + pure priority/lifecycle policy                                      | 3          | new unit                      |
| `lib/backPeel.ts` (+test)                              | deprecated→removed | `peelBack` primitive                                | folded into `repeatable-state`                                                                              | 4          | migrate to registry test      |
| `lib/useDialogFocus.ts` (+test)                        | modified           | focus/trap/Escape                                   | focus/trap only; Escape via resolver                                                                        | 5          | `useDialogFocus.test.tsx`     |
| `ui/primitives/Modal.tsx` (+test)                      | modified           | `useOverlay(onClose)`                               | register `transient-overlay`                                                                                | 3–4        | `Modal.test.tsx`              |
| `ui/primitives/SearchOverlay.tsx` (+test)              | modified           | full-screen search modal                            | `transient-overlay`; `?q=` mirror                                                                           | 6–7        | `SearchOverlay.test.tsx`      |
| `ui/IndexBookingsView.tsx` (+test)                     | modified           | filter/search local; `backOrResetCategory` on stack | `repeatable-state` filter (`remainsActive:true`) + `?cat=`/`?q=` mirror                                     | 4,6        | `IndexBookingsView.test.tsx`  |
| `ui/IndexDocumentsView.tsx` (+test)                    | modified           | `useOverlay(onClose)`                               | `local-subview` + `?view=docs`                                                                              | 4,6        | `IndexDocumentsView.test.tsx` |
| `screens/Index.tsx` (+test)                            | modified           | `view` local state; strips deep-link params         | derive `view` from `?view=`; canonicalize                                                                   | 6          | `Index.test.tsx`              |
| `ui/DocumentViewer.tsx`                                | modified           | bespoke portal + `useOverlay`                       | register via shim/`transient-overlay`                                                                       | 4          | existing                      |
| `App.tsx`                                              | modified           | shell wiring, idle-resume                           | unchanged wiring; arm-exit audit                                                                            | 8          | `layout.test.tsx`             |
| `e2e/back-navigation.spec.ts`                          | modified           | 3 system-back paths                                 | + overlay-peel-before-tab, shell-route, root-exit, forward                                                  | 1,9,10     | e2e                           |
| `e2e/back-index.spec.ts`                               | **added**          | —                                                   | Bookings/filter/search/Documents real traversal + fragment-vs-param prototype (removed after)               | 1,15       | e2e                           |
| `docs/decisions/0103-*.md`                             | added              | —                                                   | this proposal                                                                                               | —          | —                             |
| `docs/architecture/app-shell.md`, `frontend/CLAUDE.md` | modified           | back described per 0090                             | note the layer model                                                                                        | 12         | —                             |

## 27. Automated test plan

**Unit (pure):** resolver by trigger; layer priority ordering; repeatable vs. dismissible
lifecycle; stable identity across re-render; Strict-Mode double-register cleanup; unmount
cleanup; rapid repeated events / reentrancy idempotency; root/`none`; unknown-history not a
parent; Waypoint-owned-entry validation; push-vs-replace policy; param parse + canonicalization;
Forward restoration; unsupported-platform fallback.
**Component/integration:** first back resets category **and Bookings stays back-active**;
second back → landing; search closes before filter; nested modal before search; visible back
causes no second traversal; system traversal issues no second back; Escape only transient
overlays; manual close and back share cleanup; Forward restores param-backed state; Strict Mode
makes no duplicate layers; invalid param canonicalizes; a close animation can't drop a second
layer.
**E2E (real browser):** browser back/forward, visible back, explicit close, Escape, cold launch,
entry from All Trips, reload, deep link, auth-return where feasible, search, filters, Bookings,
Documents, nested overlays, unknown prior history where feasible, the fragment prototype, and
true-root native exit to the degree Playwright allows.
Commands: `pnpm --filter @waypoint/frontend test`; `pnpm --filter @waypoint/frontend exec
playwright test`; `pnpm format && pnpm typecheck && pnpm build`.

## 28. Physical-device validation plan (installed Android PWA) **[?]**

Gesture nav + 3-button nav; keyboard open vs. closed; cold launch (into trip / into All Trips);
warm launch; resume after backgrounding (<30 min and ≥30 min, ADR-0060); reload; deep link;
auth return; search open/close/query; active filter reset-then-leave; nested modal over search;
rapid repeated back; back from a non-Home tab; back from Trip Home (arm then exit); back from
All Trips (native exit); relaunch after exit. **Acceptance (cannot be automated):** one back =
one layer everywhere; the true root leaves/closes the PWA; no cold-launch premature exit from a
meaningful in-trip state; keyboard-dismiss consumes the first back without a nav event and is not
treated as a failure; system back and the visible button never diverge.

## 29. Risks

Strict-Mode duplicate registration (unit-tested); nested-overlay Escape closing two at once
(ADR-0079 known issue — assert topmost-only); a param-mirror desync if a write path is missed
(single directional rule + canonicalization guard); Playwright's `goBack` commit-wait fighting
`preventDefault` (use `window.history.back()` as the existing spec does); non-Chromium coverage
remains manual; the durability decision reversal (isolated to Phase 6).

## 30. Rollback strategy

Each phase ships behind the `useOverlay`→`useBackLayer` shim so any phase reverts to the prior
behavior by reverting its commit without touching the resolver. Phases 1–4 (fix) are independent
of 6 (durability); 6 is independent of 7+. The shim is the compatibility bridge; removing it is
the last step, after all consumers are migrated.

## 31. Open product decisions

1. **Local-destination durability** — URL-mirror (reload/deep-link durable; chosen default) vs.
   strictly in-memory (smaller change; reload → landing). Reversible in Phase 6 only.
2. **Escape scope** — overlays + search only (chosen default) vs. full peel.
3. (Confirmed, not open: true root = All Trips / zero-state `/`; Trip Home two-tap arm→exit.)

## 32. Explicitly deferred work

The production refactor (this note is planning + repro-test design only); iOS gesture back stays
absent (ADR-0099); no HashRouter / nested-route-per-subview / history-first; `SearchOverlay` for
Documents and search-by-linked-place (existing backlog lines) ride the search migration when
wanted; the ADR-0079 nested-overlay Escape refinement folds into Phase 5.
