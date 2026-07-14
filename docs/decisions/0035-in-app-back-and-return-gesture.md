# 0035 — In-app "back" is one guarded history step; the PWA return gesture triggers it

**Status:** Accepted
**Date:** 2026-07-14
**Refines:** [0024](0024-app-shell-and-trip-lifecycle.md) (app shell & routing), [0033](0033-all-trips-home.md) (all-trips as the "out and across" surface), [0007](0007-platform-pwa.md) (installed PWA), [0017](0017-mobile-first-device-targets.md) (phone-first, touch-first)

## Context

The app is an **installed, `display: standalone` PWA** (ADR-0007). On an installed iOS PWA there is **no browser chrome and no system back gesture at all** — a user who drills in has no way back except affordances we build. On Android/desktop a system back exists, but today it does the wrong thing.

The reason it does the wrong thing: only _some_ of Waypoint's navigation is real browser history. React-router owns the full-page routes (`/login`, `/trips`, `/new`, `/join/:token`, `/trip/:id/settings`, and `/` = the in-trip shell). But **everything _inside_ a trip is React `useState`, invisible to history**: the bottom-nav **tab** (home / map / index / days), the open **overlays** (account sheet, the hard-edit confirm dialog, the Plan-builder gap-fill / event-menu / schedule sheets). So a "back" from deep inside a trip either does nothing (no in-app back exists) or — where a system back does exist — jumps straight out to `/trips`, discarding every in-trip step and every open sheet underneath it.

We want a **return gesture** (edge pull) that "navigates within the app, not the browser's back," _and_ a coherent back model behind it.

## Decision

**1. React-router stays the single owner of history. In-app navigation _becomes_ history; we do not build a parallel gesture-only navigation stack.** The counter-intuitive move: rather than intercept/suppress the browser's back, we make each in-app step a real history entry so that _any_ "back" trigger — Android/desktop system back **and** our own edge gesture — resolves to the same one action. (Suppressing the native back is rejected below.)

**2. There is exactly one back action: `goBack()`**, a guarded `history` step. Precedence — one `goBack()` peels the topmost layer:

1. **An open overlay** (sheet / dialog / picker) → close it.
2. **A non-Home tab** inside a trip → return to **Home** (the anchor).
3. **Home base** inside a trip → out to **`/trips`** (the all-trips "out and across" surface, ADR-0033).
4. **A shell route** (`/new`, `/join/:token`, `/trip/:id/settings`) → its parent.
5. **At `/trips` / zero-state** → **no-op**. Back never falls out to `/login` or exits the app unexpectedly.

**3. Tabs use the Home-anchor model (Material bottom-nav rule).** Home is the base. Home → a non-Home tab **pushes** one entry; switching between non-Home tabs **replaces** (the stack never accumulates a tab trail); so back from _any_ tab returns to Home, and a second back exits to `/trips`. Tab lives in the URL (`?tab=`), so it is a real, reload-surviving history entry. (Rejected: retracing the exact tab-visit order — an unbounded, unpredictable stack.)

**4. Overlays are tracked in a back-consulted stack; `goBack()` closes the topmost before touching structural history.** Sheets/dialogs/pickers register themselves (once, in the `Sheet` and confirm primitives) into an in-memory overlay stack; the first thing `goBack()` does is close the top of that stack if it is non-empty. This is what makes the return gesture close the topmost sheet instead of navigating out from under it, and it needs no per-sheet call-site work. **Structural** navigation (tabs, routes) stays genuine react-router history, so the platform's own back button peels _those_ correctly too. Reconciling the platform system-back with a still-open _transient_ sheet is deferred (§ Consequences) — it is moot on installed iOS, the motivating target, which has no system back. Day selection on the header strip is deliberately **not** a back layer — it is a lateral view change within the Days tab, not a drill-in, so back does not walk through every day you tapped.

**5. The return gesture is one _trigger_ of `goBack()`, not its own logic.** A trailing-edge horizontal pull calls `goBack()`. Because the app is **full RTL** (ADR-0009), the platform back convention mirrors: the activation edge is the **right** edge and the pull is **toward the left** (the `‹` back chevron itself flips to `›`). The gesture reads `dir`, it does not hard-code a side. It activates only from a narrow (~24px) trailing-edge zone, so it does not fight the horizontally-scrolling day-strip or the Plan-builder's pointer-capture drag-to-reorder; it shows a live peek/parallax of the surface behind and commits past a distance **or** velocity threshold, else snaps back. It is back-only (no forward/redo on a mobile pull).

**6. Root guard.** At the in-trip Home base, `goBack()` navigates **explicitly** to `/trips` rather than stepping blindly into whatever preceded the trip — so a trip opened from a cold deep link still lands somewhere sensible instead of exiting the app. At `/trips` and the zero-state, `goBack()` is a no-op.

## Consequences

- **Coherence for free on Android/desktop too:** because tabs and routes are now genuine history entries, the hardware/browser back button already peels _those_ correctly — the custom gesture's unique jobs are (a) to exist on installed iOS where no system back does, (b) the root guard, and (c) closing an open overlay (which system back does not yet do — see deferred).
- **Reload/deep-link friendliness:** `?tab=` means a refresh keeps your tab; the in-trip surface is now URL-addressable.
- **The primitives carry the wiring:** `Sheet` and the confirm provider register as overlays, so every current sheet (account, gap-fill, event-menu, schedule) and future ones inherit back-to-close without per-call-site work.
- **Bounded history growth:** stepping Home→trip repeatedly can add `/trips` entries (root guard pushes rather than pops). Acceptable at this app's scale; can be optimized to a pop-when-parent later.
- **Deferred (recorded, not built):** a visible header back-chevron mirroring the gesture on shell routes; a forward gesture; per-day history; making the platform **system-back** (Android hardware / desktop browser button) close an open overlay too — today it peels the structural layer under the sheet. The gesture already closes overlays, and iOS-standalone, the motivating case, has no system back to reconcile.

## Alternatives considered

- **Custom gesture that suppresses the native back.** Rejected: iOS Safari's edge-swipe cannot be reliably prevented, and fighting Android's back yields two desynced back mechanisms. Owning history instead of blocking it is simpler and correct.
- **Raw `history.pushState` traps alongside react-router.** Rejected: two owners of the History API desync react-router's internal index. We express every layer _through_ react-router (`navigate` + `location.state`) so there is one owner.
- **Tabs as peers, back exits immediately from any tab.** Rejected in favor of the Home-anchor rule — jumping out of the trip from a deep tab is abrupt; Home is a predictable anchor.
