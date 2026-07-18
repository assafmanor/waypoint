# 0061 — Plan-mode Home "what's missing to complete" rework

**Status:** Proposed
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

## Proposed in the mockup (2026-07-18, `mockups/plan-home-readiness-v1.html`) — for sign-off

The mockup proposes a concrete reworked check set and answers the open questions below; each is a _proposal_ pending Assaf's sign-off (then this ADR → Accepted).

- **Check set (all derived, real-data-only):** keep the four existing — 🏨 `lodging`, 📅 `itinerary` (empty days), ✈️ `flights`, 👥 `group` — each with a CTA that _does the thing_ (opens the add-booking sheet / seeds the day builder on the first empty day / the settings invite), not a bare tab-switch. **Add two now-buildable checks:** 🛂 **documents/passports** (per-traveller, from the snapshot documents list post-ADR-0058) and 🔑 **confirmation-code completeness** (a hard booking missing its code). **Left out** (no data/feature, ADR-0045/0004): Google-connection, Gmail import, WhatsApp reminder.
- **Completed checks collapse into a one-line summary** ("✓ הושלמו · ✈️ טיסות · 👥 הקבוצה") with a "show completed" toggle, so the list stays about _what's missing_.
- **Readiness stays advisory** — it never gates the go-live switch (a nudge, not a blocker).
- **Documents is a per-traveller rollup** ("2 מתוך 5 העלו דרכון", with a small per-person indicator), fitting the small-group model, with the breakdown on tap.

## Open questions (confirm / adjust the proposals above)

- Which new suggestions to surface first — documents/passport proposed as the strongest; confirm, and whether the 🔑 code-completeness nudge earns a row or is too minor.
- Readiness advisory-only (proposed) vs ever gating/nudging the go-live switch.
- Collapse completed (proposed) vs keep them as ✓ rows.
- Documents per-traveller (proposed) vs trip-level only.

## Consequences

- `lib/readiness.ts` (new/changed pure checks + a unit test per check, matching `readiness.test.ts`) and `screens/PlanHome.tsx` (row behavior/CTAs), plus `i18n/he.ts` copy (no em dashes; `·` for separators).
- A documents check reads the snapshot documents list (ADR-0058) — no new fetch, offline-safe.
- Design record + mockup (`mockups/plan-home-readiness-v1.html`, session 32) land first; implementation follows on its own change.
- No data-model or backend change anticipated (all inputs already in the snapshot).

## Alternatives considered

- **Leave the four checks as-is.** Rejected: Assaf asked to revisit both content and behavior, and the CTA-target notes are stale now that the screens are real.
- **Add every deferred session-06 row now.** Rejected: Google-connection / Gmail / WhatsApp still have no data or feature behind them — adding them would reintroduce the faked-signal failure mode ADR-0045 exists to prevent. Only the now-backed ones (documents) become eligible.
- **Make readiness a stored trip field.** Rejected: same reasoning as the derived Now/Next and the existing readiness — a computed state auto-written needs a trigger, emits sync traffic, and goes stale offline (ADR-0018/0045).
