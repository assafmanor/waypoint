# Session 251 — one remembered day across Day-by-day and Map, and none on the Index (field report #39, workstream T)

**Date:** 2026-08-11
**Workstream:** `T` — the whole of it, in one sitting. [Session 249](2026-08-11-session-249-third-incremental-field-reports-addendum.md) §6 located the bug in two halves and both held on `main`; this is the fix.
**Touches:** `frontend/src/state/nav-state.tsx` (+ its test), `frontend/src/state/map-scope-state.tsx`, `frontend/src/App.tsx` (`Header`), `frontend/src/ui/domain/DayStrip.tsx` (+ test), `frontend/src/test/nav-harness.tsx`, `frontend/src/Header.test.tsx`, `frontend/src/screens/Index.test.tsx`, `frontend/src/state/trip-state.render.test.tsx`, `frontend/src/state/nav-state.system-back.test.tsx`, `docs/decisions/0110-…md` (§4, amended in place), `docs/backlog.md`.
**ADR-0110 §4 amended in place. No new ADR** — ADR-0035 §4's single-source day is **preserved**, not revised. **No mockup:** nothing new is drawn; one existing suppression is extended to a second surface.

## 1. The diagnosis, re-run on `main` before anything was touched

Both halves are exactly as session 249 §6 wrote them, and the loss was reproduced rather than reasoned:

- **The loss is one function.** With the fix backed out of `useTripTab` alone (`tabTarget(next)` instead of `tabTarget(next, dayCarriedFrom(params))`), the new provider-level test reports `AT:days DAY:2026-07-08` where the URL had carried `2026-07-11` — the day resolved back to **today** on the way through the tab bar. Three of the eight assertions in that block fail; the other five (Home's own reset, the existing deep-link cases) pass, which is the shape of the report: entering the Map **by choosing a day** kept the day, entering it **from the tab bar** did not.
- **The Index half is display state, and only that.** `screens/Index.tsx` reads no `activeDate` and filters by no date — re-checked, and now asserted: the landing renders **byte-identical** text with and without a `?day=` on its URL. What painted the selected pill is the shared header, on every tab.

## 2. What was built

**The navigation half — the day rides the move.** `tabTarget(next, day?)` takes the day, and `dayCarriedFrom(params)` decides which day: the one on the URL you are leaving, and **nothing out of Home** (a stray `?day=` on a Home URL is already ignored by `activeDate`, so leaving must not resurrect it). `useTripTab.goToTab` passes it. `?day=` is still the only copy of the day — no `useState` was added, and none may be: what changed is which transitions carry the param, which is the question ADR-0035 §4 leaves open rather than one it answers.

The three way-ins in `map-scope-state.tsx` were each appending `&day=` to `tabTarget('map')` by hand. **That copy is why the bug survived:** the rule lived in the callers, so the one caller that did not copy it was silently wrong. They now share one `useGoToMapTab`, which keeps their identity-stable callbacks and their call-time read of the live URL. `tabOfPath` there also stopped open-coding the tab read and calls the shared `tabOfParams`.

**The display half — one predicate, read by the header.** `tabShowsSelectedDay(tab)`: true for `DAY_SCOPED_TABS` and for today-anchored Home, false for the trip-wide Index. `Header` reads it against the tab it is standing on and hands `DayStrip` the result, OR'd with the Map's all-days scope. So the header now owns the whole "does this surface single out a day" question in one line, and the shell hands it `allDays` rather than a pre-composed flag.

**The prop was generalised, not duplicated.** `DayStrip`'s `allScope` is now **`unscoped`** — named after the surface (this one is not showing a single day) rather than after the Map's scope, because it has two callers with nothing else in common. Behaviour is unchanged for both: no filled-selection classes, no `aria-pressed`, no force-scroll to a day it is not showing as selected, today-anchor and empty-day markers kept. **The pills stay tappable everywhere**, including on the Index, where a tap routes to the Day view (`daySelectTarget`, already tab-aware).

## 3. Two things this deliberately does not change

- **Home still drops the day.** `tabTarget(HOME_TAB)` returns the clean `/` whatever day it is handed, and that is what makes "Home is today, in both modes" structural instead of an effect somebody can forget to fire (ADR-0035 §4). Asserted, so nobody later reads it as the same bug.
- **Back is untouched.** A structural back from a day surface still resolves `to-home` (ADR-0090 rule 2) — the day-carrying moves are all `replace`, so the top entry can now carry `?day=` without there being a second entry for a back to walk into. That is asserted in the system-back harness, where a real `BrowserRouter` and a real traversal can see it.

A **foreground/resume** cannot move the day either, and for the same reason the fix is small: the day is `?day=` and nothing else, so only a navigation can touch it. Below ADR-0060's idle threshold nothing navigates at all; at it, the reset to Home is that ADR's own decision, and Home is today by construction.

## 4. Tests

Every case on the owner's list, at the layer that can actually see it:

- **`nav-state.test.ts`** — `tabTarget` with and without a day (including "Home stays clean whatever it is handed"), `dayCarriedFrom` off each tab and out of Home, `tabShowsSelectedDay` per tab, and the pairing that is the report's whole invariant: the Index does not display the day it does carry.
- **`trip-state.render.test.tsx`** — the transitions end to end, through the real `TripProvider` and the real `goToTab`, asserting the derived `activeDate` rather than a URL: repeated Day ↔ Map (three rounds), then Day → Index → Day, Map → Index → Map, **Day → Index → Map** and **Map → Index → Day**. The remembered day is `2026-07-11` against a pinned today of `2026-07-08` and a trip starting `2026-07-05`, so a reset to today, to the first trip day, or to a stale default are three distinguishable failures. The fixture carries **no events**, so every day in that block is an empty day — "a selected day with no items is still the same selected day after a switch" is the default state of the whole block rather than one case in it.
- **`Header.test.tsx`** — the display half per surface, driven by the URL (`wrapNav` gained an optional `path`): the day is singled out on the Day view and the Map, and on the Index **neither the styling nor the `aria-pressed`** says a day is selected while today keeps its anchor. Plus the pills still calling `onSelectDay` from there, the Map at all-days, and a stale all-days not reaching out to unselect the Day view's own day.
- **`Index.test.tsx`** — the landing is identical with a remembered `?day=` on its URL. There is no date filter on that screen to remove; this is what stops one growing.
- **`DayStrip.test.tsx`** — `unscoped` in both modes (Plan keeps its empty-day markers), and every pill still a live control under it.
- **`nav-state.system-back.test.tsx`** — a system back off a day-scoped tab carrying a remembered day still lands on Home.

Full frontend suite green (207 files, 3472 tests), `pnpm typecheck` and `pnpm build` clean. Not covered, and stated rather than implied: the three Map way-ins read the live `window.location` by design, so their day-carrying is asserted through the shared `tabTarget`/`dayCarriedFrom` rather than end to end (they had no such coverage before either); and no Android device was in the room — the platform-back reasoning rests on the fake-Navigation harness, as it has since ADR-0103.
