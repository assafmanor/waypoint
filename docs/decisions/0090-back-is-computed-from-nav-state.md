# 0090 — Back is computed from navigation state, not traversed through browser history

**Status:** Accepted (Assaf sign-off 2026-07-20)
**Date:** 2026-07-20
**Supersedes the _mechanism_ of:** [0035](0035-in-app-back-and-return-gesture.md) — its **behavior** (the §2 layer-peeling precedence, the two-tap trip-exit confirm, the single-source day model §4) is **retained unchanged**; only _how_ a back is resolved changes. ADR-0035 stays the behavioral reference; this ADR replaces §1's "in-app navigation _is_ history" bet and every refinement that grew from it (the 2026-07-19 / -19b / -19c history-index machinery). §5, the RTL return gesture, was later retired outright by [0099](0099-retire-the-custom-edge-swipe-gesture.md) (2026-07-21) — every mention of it below (as a trigger alongside system-back/tabs/shell buttons) is historical.
**Refines:** [0060](0060-reopen-after-idle-returns-to-trip-home.md) (idle-resume still `navigate('/')`s to Home; unchanged), [0007](0007-platform-pwa.md) (installed PWA, no system back on iOS), [0017](0017-mobile-first-device-targets.md) (phone-first; desktop = graceful minimum), [0079](0079-single-modal-primitive.md) (the overlay-stack registration this consults).

## Context

ADR-0035's founding bet was: **make every in-app step a real browser-history entry, and resolve every "back" trigger to `history.back()` / `navigate(-1)`.** The appeal was "one history owner, the OS back button works for free."

That bet is the source of the recurring breakage. `navigate(-1)` is a **blind traversal** — it goes to whatever entry physically sits behind you in the browser stack, which is only "Home" when the stack is exactly what the app assumed. But the stack is polluted by things the app doesn't control:

- the Google OAuth round-trip (ADR-0004/auth-and-google) leaves foreign entries;
- a PWA cold-launch / deep-link / external-app launch starts at an arbitrary index with foreign-or-empty history behind;
- react-router's internal `idx` desyncs.

So each refinement tried to _prove_ what was physically behind before daring to call `back` — `homeBaseIdxRef`, `historyIdx()`, `homeIsBehind()`, a `homeBehind` flag threaded through **three** separate decision functions (`tabStep`, `structuralBackStep`, `systemBackDecision`), plus a Navigation-API interceptor. This is unwinnable in principle: a page can read the history stack's _length/index_, never its _contents_. Every new launch path is a new way for the proxy to lie → a new bug (2026-07-18, -19, -19b, -19c). The three parallel triggers (edge gesture, Android system-back, desktop system-back) each re-encoded the same precedence, so every future tab/route had to be threaded through all three correctly — the "breaks as we expand" failure mode.

The through-line: **the app's current navigation state already fully determines what back should do, but the architecture threw that away and asked the browser history stack instead, then spent five refinements reconstructing the state it already had from an unreliable proxy.**

## Decision

**The current navigation state is the single source of truth for "back." Back is a pure function of that state, executed as an explicit navigation. The browser history stack is a mirror we write to and never interrogate.**

**1. One pure decision, `resolveBack(snapshot) → BackAction`.** The `NavSnapshot` is `{ hasOverlay, insideTrip, tab, pathname, armed }`. The function is the entire layer-peeling policy (ADR-0035 §2, byte-for-byte the same behavior):

1. an open overlay → `close-overlay`;
2. a non-Home tab in a trip → `to-home` (navigate `/` explicitly);
3. the Home base in a trip → `arm-exit`, then `exit-trip` on a second back within `EXIT_CONFIRM_MS` (the two-tap confirm);
4. a shell route → `to` its explicit parent (`parentRoute`: `/trip/:id/settings` → `/` back into the trip; `/new`, `/join/:token` → `/trips`);
5. a root surface (`/`, `/trips`, `/login`) outside a trip → `none` (never falls off-app).

No history index, no `homeBehind`, no "is Home provably behind" — every structural action is an explicit target we _know_, so it can never strand on a blind traversal.

**2. Every "back" trigger routes through the same `resolveBack` + one executor `runBack`.** The edge gesture, the platform system-back interceptor, the nav-bar Home tab, and the shell back buttons all build the same snapshot and run the same action. Adding a trigger never re-encodes precedence; **changing the behavior is a one-function edit.** `classifyBack`/`runBack` live once in `NavProvider`; hooks (`useReturnControls`, `useAppBack`) and the interceptor are thin shells over them.

**3. `navigate(-1)` / `history.back()` are never used for structural navigation.** `to-home`/`to` navigate with `{ replace: true }`; `exit-trip` navigates to `/trips`. Deleted outright: `tabStep`, `structuralBackStep`, `systemBackDecision`, `homeBaseIdxRef`, `historyIdx()`, `homeIsBehind()`, the `homeBehind`/`canGoBack` params, and the `navigate(-1)` in the two shell back buttons (`TripSettings`, `CreateTrip` now call `useAppBack()`).

**4. In-trip history is flat: tabs and the day are written with `replace`, always.** `tabTarget(next)` navigates Home → `/` and any tab → `?tab=` with `replace`; `daySelectTarget` drops its old push-from-Home branch and always replaces. The URL still carries the tab and `?day=` for reload/deep-link survival — it just never accumulates history depth, because depth is no longer what resolves _the decision_. (History still needs one entry of _fuel_ for Android's OS-back to be interceptable — see Refinement 2026-07-20, the back-guard.)

**5. The platform system-back is intercepted and run through `resolveBack`, never allowed to traverse structurally.** The Navigation API (`navigation` `'navigate'`, Chromium/Android; absent on Safari/iOS) cancels a backward `traverse` and runs the computed action instead. The interceptor is now trivial — build the snapshot, `resolveBack`, and if the action is anything but `none`, `preventDefault()` + `runBack`; a forward traverse (redo) and a `none` pass through. Our own programmatic navigations are `push`/`replace`, not `traverse`, so they don't re-enter the handler. There is no `allow`-a-structural-back path and no history-index reasoning left.

## Consequences

- **The whole class of bug is gone.** No code reads the browser history stack, so no launch path (OAuth, cold deep-link, external app, `idx` desync) can mislead a back. The five history-index refinements collapse into one pure function.
- **It lasts as the app grows.** Adding a tab, a shell route, or an overlay is a _data_ change — a `?tab=` value, one `parentRoute` line, one `useOverlay` call — not a new branch in three history-guessing functions. The infrastructure (triggers → `resolveBack` → `runBack`) is fixed once; behavior lives in the single ordered `resolveBack`, which stays unit-tested (`state/nav-state.test.ts`).
- **Behavior is identical to ADR-0035** on every path that worked, and _deterministic_ on the paths that didn't: a non-Home tab always lands on Home, a shell route always backs to its known parent, the Home base always confirms-then-exits — regardless of how the app was launched.
- **The one honest limitation: a non-Chromium desktop browser tab** (Firefox/Safari desktop, no Navigation API) can't have its system-back intercepted, so its back button traverses the flat history — from an in-trip tab that leaves the trip in one step rather than peeling to Home first. Accepted: desktop-in-a-browser is the "graceful minimum" (ADR-0017), not an installed-PWA target, and because everything is `replace`d there is little stray history to land in. The **installed-PWA targets are fully covered**: iOS (no system back → the edge gesture, which computes back) and Chromium Android/desktop (Navigation API → intercepted).
- **Idle-resume (ADR-0060) is unchanged** — it closes overlays and `navigate('/')`s, which resolves to Home + today (Home carries no `?day=`). The single-source day model (ADR-0035 §4) is unchanged; only `daySelectTarget`'s always-replace is new.
- **The overlay-stack invariant (ADR-0035 §Consequences, ADR-0079) still holds:** overlays register through `Modal`/`useOverlay`, and `resolveBack` consults `hasOverlay` first, so one back/gesture/system-back closes the topmost sheet. The `createPortal` lint allowlist is unchanged.
- **The convention invariant simplifies:** "only Home→tab may push; laterals replace" becomes just **"in-trip navigation is always `replace`"** — there is no anchor entry to protect anymore, because back doesn't depend on history shape.

## Alternatives considered

- **Keep patching the history model.** Rejected — the user's call after seven refinements ("managing history is just not working"). Each fix reconstructs unknowable state; the next launch path reopens it.
- **An explicit app-owned visited-stack (array of views), back = pop.** Considered. Unnecessary: the §2 precedence is a _derivation from current state_, not a retrace of visited screens (ADR-0035 §3 already rejected retracing tab order), so no stack is needed for structural back. If a future behavior ever needs remembered history (e.g. "back to the _previous_ tab"), that memory is added as explicit app state feeding the snapshot — a localized, additive change to the provider + one rule in `resolveBack`, still never touching the triggers, the executor, or the browser history stack.
- **Keep pushing tabs so non-Chromium desktop native-back peels tab→Home→exit.** Rejected — that reintroduces exactly the history-shape dependency this ADR removes, to serve the one non-target platform. Flat history + a documented graceful-minimum limit is the durable trade.
- **Suppress the native back instead of intercepting it.** Rejected for the same reasons ADR-0035 gave: iOS can't reliably prevent it, and fighting Android's back desyncs two mechanisms. We cancel-and-recompute via the Navigation API where it exists, and rely on the gesture where it doesn't.

## Refinements

**2026-07-20 (Assaf, on-device). The Android system-back was exiting the app from anywhere in the trip — a regression this ADR shipped.** Decision §4's "flat history" removed the very thing Android's OS-back needs. The OS back is a history **traversal**: it consumes an entry _behind_ the current one. On a **cold launch straight into the live trip** (`resolveLanding` lands on `/` at history index 0 — the common installed-PWA case) there is nothing behind, so with everything `replace`d the traverse leaves the app; an **app-leaving traversal is non-cancelable**, so the Navigation-API interceptor's `!e.cancelable` guard bails and the OS exits. (Settings was exempt only because it is reached by a `push`, so it always had the trip behind it.) The interceptor was fine; there was simply no cancelable in-app entry to catch.

_The correction — separate "don't *read* history" from "have no history."_ The back **decision** stays a pure function of state (`resolveBack`), but history must still hold **one entry of fuel** so the OS back is interceptable. `useTripBackGuard` (called by the trip Shell) pushes **one duplicate "guard" history entry** when the shell mounts at index 0 (`needsBackGuard`, unit-tested). From then on every in-trip OS back traverses into that in-app, cancelable entry; the interceptor `preventDefault()`s before the URL changes (so the guard is never seen) and runs the computed action, and because every in-trip back is cancelled the index never actually drops onto the guard — it persists for the trip session. No-op where there's no OS back (iOS/Safari: no Navigation API) or where an entry already sits behind us (entered from `/trips`, an OAuth round-trip). This makes §4's flat history safe on Android and turns the Home-base OS-back into the two-tap leave-confirm instead of an instant exit. Verified with a Playwright/Chromium e2e (real Navigation API + `page.goBack()`), since jsdom can't model history traversal — which is why the merge slipped through unit-green. The non-Chromium-desktop limitation in Consequences stands (no Navigation API there to intercept, guard or not).
