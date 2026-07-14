# Session 06 — Plan-mode Home (the prep dashboard) + plan chrome (2026-07-14)

**Outcome:** Built the Plan-mode Home — the **prep dashboard** (`modes.md`; `mockups/plan-mode-v1.html`) — and re-skinned the Plan-mode chrome as the light "drafting table" (design-language mode identity, ADR-0028). No new ADR: this implements already-decided design.

## The problem we discussed first

The plan-mode mockup's Home shows several rows whose data/features don't exist yet: Gmail-imported flights, "3 of 5 passports uploaded", "2 travelers not connected to Google" (+ a WhatsApp reminder CTA), and a specific "hotel in Kyoto not booked". `User`/`Membership` carry no Google-connection state; `TripDocument` isn't in the snapshot; Gmail import + WhatsApp are v1.1; there's no "what this trip requires" model. Decision (with the human): **build from real signals only** — never ship faked counts — and **track the deferred rows as todos** rather than dropping them silently.

## What was decided

- **Readiness + checklist are derived, never stored** — same reasoning as the derived Now/Next (ADR-0018/0027): auto-writing a computed state needs a trigger, emits sync traffic, and goes stale offline.
- **Four honest checks** (`lib/readiness.ts`): flights in the index, lodging booked, no empty days, group actually joined (>1 member). Readiness % = fraction complete. Each incomplete row gets one CTA toward the fix.
- **Deferred rows are recorded, not faked** — Google-connection status, passport/documents, Gmail-import flavor, WhatsApp reminder, and specific "required booking missing" detection all wait for their features/data.
- **Plan chrome = the light drafting table now** — the header/toggle/day-strip re-skin as light paper + violet accents + a faint drafting grid under `[data-mode='plan']`; Trip mode's dark board chrome is untouched. This retires the "designed follow-up" caveat the mockup and `App.css` carried.

## What landed in the repo

- `frontend/src/lib/readiness.ts` (+ `readiness.test.ts`) — pure `computeReadiness()`.
- `frontend/src/screens/PlanHome.tsx` — violet prep hero (countdown + readiness bar, no amber/pulse), derived checklist, overview stats. Routed via `App.tsx` `Screen()` for `home` + Plan mode.
- Mode-aware header subtitle: Plan pre-trip shows "יוצאים בעוד N ימים", else "יום X מתוך Y".
- `frontend/src/App.css` — `[data-mode='plan']` chrome block. `frontend/src/screens.css` — prep-dashboard styles.
- `frontend/src/i18n/he.ts` — `planHome` copy + `header.leavingIn`.
- `frontend/src/fixtures.ts` — flight + hotel bookings and events spread across more days (day 3 untouched; the tests' pinned now/next hold) so the whole-trip dashboard reads believably (3 empty days).

## Verified

- `pnpm typecheck` green (4/4 packages); frontend build green; **138** frontend unit tests pass.
- Not done: a live browser screenshot — driving the real Plan-mode Home needs the full backend + Postgres + Google OAuth stack (the trip snapshot is server-fetched), which isn't stood up in this session.

## Deferred (tracked as session todos)

Google-connection status on the prep dashboard · documents/passport row · required-booking-missing detection · Gmail-import row + WhatsApp reminder CTA · real CTA targets (the Plan Day builder + Index entry screens are still `Placeholder`, so checklist CTAs switch to the tab for now).
