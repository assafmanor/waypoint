# 0061 — Plan-mode Home "what's missing to complete" rework

**Status:** Accepted (Assaf sign-off 2026-07-18; mockup `mockups/plan-home-readiness-v1.html`)
**Date:** 2026-07-18
**Refines:** [0045](0045-trip-home-real-data-only.md) (real-data-only home — the sibling principle the checklist already follows), [0004](0004-integrations-are-pipes.md) (deferred suggestions wait for their pipes/data). Builds on the plan-home built in `planning/2026-07-14-session-06-plan-home.md`.

## Context

The Plan-mode Home is a **prep dashboard**: a violet readiness hero + a derived "what's missing" checklist (`screens/PlanHome.tsx`, `lib/readiness.ts`). `computeReadiness` (`readiness.ts:44-64`) runs **four** derived, never-stored checks:

- `flights` — a flight booking exists (`:56`)
- `lodging` — a hotel booking exists (`:57`)
- `itinerary` — no empty days (`:58`, counts empty dates)
- `group` — more than one member (`:59`)

Each incomplete row shows one CTA (`PlanHome.tsx:105-145`): flights/lodging → `onNavigate('index')`; itinerary → seed the first empty day then `onNavigate('days')`; group → the settings invite. Session 06 deferred a set of richer signals as "recorded, not faked" (Google-connection status, passports/documents, Gmail-import flavor, WhatsApp reminder, specific "required booking missing" detection) because the data/features didn't exist.

Assaf (2026-07-18): "כפתורי מסך הבית במצב תכנון 'מה חסר להשלמה', גם לחשוב על איזה הצעות וגם התנהגות הקיימים" — revisit **both** (a) _what_ the checklist suggests and (b) the _behavior_ of the existing rows. Two things have changed since session 06 that make this timely: the Index booking-entry flow and the Day builder are now **real screens** (session 06 noted their CTAs pointed at `Placeholder`s — that note is stale), and **documents are now in the trip snapshot** (ADR-0058), so a documents/passport check is finally buildable from real data.

## Decision (direction — the exact set is settled in the design pass)

**Keep the real-data-only, derived-never-stored foundation (ADR-0045 sibling); rework the checklist's contents and the existing rows' behavior against the screens and data we now actually have.**

1. **Re-verify the four existing rows' behavior now that their targets are real.** Each CTA should _do the thing_, not just switch tabs: flights/lodging → open the add-booking flow in the Index (not merely land on the tab); itinerary → the Day builder seeded on the first empty day (already close, `PlanHome.tsx:122-136` — confirm it still lands right); group → the settings invite. Retire the session-06 placeholder-era stopgaps.

2. **Reconsider the suggestion set.** Now-buildable candidates to add: a **documents/passport** check (feasible post-ADR-0058 — the snapshot carries documents), a **"hard bookings have confirmation codes"** completeness nudge, finer itinerary signals beyond a bare "empty day." Still-deferred (no data/feature): Google-connection status, Gmail-import, WhatsApp reminders — these stay recorded-not-faked per ADR-0004.

3. **The exact final check set, copy, ordering, and CTA behavior are settled in a design pass** (a mockup + this ADR flipping to Accepted). This ADR fixes the direction and the constraint (real data only, derived), not the final row list.

## Settled (Assaf sign-off, 2026-07-18; mockup `mockups/plan-home-readiness-v1.html`)

- **Check set (all derived, real-data-only):** keep the four existing — 🏨 `lodging`, 📅 `itinerary` (empty days), ✈️ `flights`, 👥 `group` — each with a CTA that _does the thing_ (opens the add-booking sheet / seeds the day builder on the first empty day / the settings invite), not a bare tab-switch. **Add exactly one new check:** 🛂 **documents/passports** (per-traveller, from the snapshot documents list post-ADR-0058).
- **Confirmation-code completeness (🔑) is dropped** — considered, but "too minor for its own row" (Assaf). It can live as a subtle inline hint on a booking later, not as a readiness check.
- **Documents is a per-traveller rollup** ("2 מתוך 5 העלו דרכון", with a small per-person indicator), breakdown on tap — fits the small-group model.
- **Completed checks collapse into a one-line summary** ("✓ הושלמו · ✈️ טיסות · 👥 הקבוצה") with a "show completed" toggle, so the list stays about _what's missing_.
- **Readiness stays advisory** — a nudge, never a blocker; it does **not** gate the go-live mode switch.
- **Left out** (no data/feature, ADR-0045/0004): Google-connection, Gmail import, WhatsApp reminder.

## Refinement (2026-07-18, Assaf) — type-specific CTA targets + flights = round-trip

- **Each actionable row's CTA opens the type-specific create form, pre-set** — not a generic "add booking." The 🏨 lodging row opens the **create-lodging** form (booking type = hotel); the ✈️ flights row opens the **create-flight** form (booking type = flight, seeded with the missing direction where known). The row already knows which type is missing, so it seeds the form. (📅 empty-day → the day builder on the first empty day; 👥 group → the settings invite — unchanged.)
- **The flights check is round-trip aware.** It is complete only when there is **at least one flight to the destination (outbound) _and_ at least one flight from the destination (return)** — "a way in and a way out." A single one-way flight leaves the check **open**, with copy naming the missing leg ("יש טיסת הלוך · חסרה טיסת חזור") and a CTA that opens the create-flight form for that direction. Derived from flight bookings' origin/destination `Place` FKs (ADR-0048/0051): an outbound leg's destination is the trip destination, a return leg's origin is the trip destination. "Source"/home need not be stored — only that a leg lands at the destination and a leg leaves it.
- **Degradation until the Place-picker lands** (backlog; direction rests on name-only Places today): if a flight's origin/destination isn't recorded, the check can't confirm that leg, so it **stays open** — conservatively nudging the traveller to record both legs rather than falsely reading "done." Revisit if that proves too strict in practice.

`readiness.ts`: the `flights` check reads flight bookings' origin/destination Places and requires both directions (a small pure predicate, unit-tested). `PlanHome.tsx`: each CTA passes the target booking type (and, for the return flight, the direction) into the create form.

## Consequences

- `lib/readiness.ts` (new/changed pure checks + a unit test per check, matching `readiness.test.ts`) and `screens/PlanHome.tsx` (row behavior/CTAs), plus `i18n/he.ts` copy (no em dashes; `·` for separators).
- A documents check reads the snapshot documents list (ADR-0058) — no new fetch, offline-safe.
- Design record + mockup (`mockups/plan-home-readiness-v1.html`, session 32) land first; implementation follows on its own change.
- No data-model or backend change anticipated (all inputs already in the snapshot).

## Alternatives considered

- **Leave the four checks as-is.** Rejected: Assaf asked to revisit both content and behavior, and the CTA-target notes are stale now that the screens are real.
- **Add every deferred session-06 row now.** Rejected: Google-connection / Gmail / WhatsApp still have no data or feature behind them — adding them would reintroduce the faked-signal failure mode ADR-0045 exists to prevent. Only the now-backed ones (documents) become eligible.
- **Make readiness a stored trip field.** Rejected: same reasoning as the derived Now/Next and the existing readiness — a computed state auto-written needs a trigger, emits sync traffic, and goes stale offline (ADR-0018/0045).
