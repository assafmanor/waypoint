# Session 40 — Transition wording by mode (a train stops reading "take-off / landing")

**Date:** 2026-07-19
**Branch:** `claude/train-display-by-type-j55mff`
**Touches:** ADR-0063 §3 (amended — transition wording refines below category)

## What prompted it

A screenshot from Assaf: a **train** on the Home hero and the glance timeline read _המראה / נחיתה_ (take-off / landing) — flight wording. "It's probably always hardcoded, change so that the text is by type" — and, following up, "take other types into account (or future ones), nothing should be hardcoded this way."

## Root cause

The `transport` `CATEGORY_TIME_PROFILE` entry (ADR-0063 §3) hard-coded aviation words as its `transitions` keys (`departure`→*המראה*, `arrival`→*נחיתה*). Both flight and train are the same `category` (`transport`, ADR-0038), so every surface transport mode inherited flight vocabulary. The hero (`hero-booking.ts`), the glance markers (`glance.ts`), and `Home.tsx` all read the profile keys straight off `category`, losing the flight/train distinction the Index already makes (`booking-timing.ts::timingLabels(BookingType)`).

## What changed

- **`packages/shared/src/icons.ts`** — the `transport` profile's default wording is now the **generic** departure/arrival (correct for train/bus/ferry/car). Added `ICON_TRANSITION_KEYS` (a closed per-glyph override, bounded like the icon set) with `✈️` → `flightDeparture` / `flightArrival`, and a single resolver `eventTransitionKeys(event)` = glyph override ?? category profile `transitions`. Works for manual, non-booking events too (ADR-0063 §4), since it keys on the glyph every event already carries — not on a booking type events don't store.
- **`frontend/src/i18n/he.ts`** — `glance.transition`: `departure`→*יציאה*, `arrival`→*הגעה* (were the flight words); added `flightDeparture`→*המראה*, `flightArrival`→*נחיתה*.
- **`hero-booking.ts`, `glance.ts`, `screens/Home.tsx`** — all three read `eventTransitionKeys(e)` instead of `CATEGORY_TIME_PROFILE[e.category].transitions`. No per-screen branching.
- **ADR-0063** — added the "transition wording is by mode" amendment; §3 gains a pointer to it.

Net effect: a flight still reads _המראה / נחיתה_; a train (and every other surface transport) reads _יציאה / הגעה_; a future mode with distinct wording adds one line to `ICON_TRANSITION_KEYS`.

## Verification

- `pnpm --filter @waypoint/shared test` → 23 pass (new `eventTransitionKeys` cases: train/bus/ferry/car → generic, ✈️ → flight, lodging → check-in/out, non-bracketed → undefined).
- `pnpm --filter @waypoint/frontend test` → 376 pass (hero-booking gains a train case + flight now asserts `flightDeparture`/`flightArrival`; glance gains a train marker case).
- `typecheck` + `build` green for shared + frontend; backend typecheck green once the Prisma client is generated (the only backend failure was the missing generated client — no backend code touched).
- `pnpm format` — no changes to the touched files.
