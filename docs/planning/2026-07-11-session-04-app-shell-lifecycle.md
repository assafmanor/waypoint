# Session 04 — App shell & trip lifecycle

**Date:** 2026-07-11
**Participants:** Assaf + Claude
**Outcome:** [ADR-0024](../decisions/0024-app-shell-and-trip-lifecycle.md) (Accepted) + [`architecture/app-shell.md`](../architecture/app-shell.md) (spec)

## Why this session

A progress review flagged that every designed surface — the mockup, the built Home/Day screens, Plan mode — assumes you are _already inside one trip_. Assaf named the gap directly: the homepage when you have no trips, trip switching, the trip-creation page, the join page. These live in the docs as words (ADR-0021 calls the switcher "the app entry point" then defers it; PRD/feature-catalog mention "create trip / join via link") but were designed nowhere, and the mockup covers none of them.

Diagnosis: this is a distinct, un-designed category — the **app shell / trip lifecycle**, the outer ring _outside_ a single trip — separate from the in-trip experience and from the in-trip screens still to design (Map/Index). Building it screen-by-screen would fragment it, because the pieces share one navigation model, one auth gate (ADR-0020), and one active-trip state (ADR-0021). So we fixed the model as one decision.

## What we decided

Full rationale in ADR-0024; surface-by-surface spec in `architecture/app-shell.md`. The spine:

- **The shell is chrome, not a surface** — indigo/neutral only, never amber/teal; minimize screens and taps to "inside a trip." Guards against Waypoint drifting from "living visibility layer" toward a planner.
- **Routing:** not-auth → `/login`; auth + has-trips → active trip at `/`; auth + no-trips → zero-state. Deep-link intents (esp. invite links) survive the login gate and resume after sign-in.
- **Only three full-page routes** — `/login`, `/new`, `/join/:token`. The **switcher** and **account** are header sheets, not pages.
- **Zero-state weights Create and Join equally** (5-friend model: one creates, four join).
- **Creation = one form** (`createTripSchema`), land in the new (Plan-mode) trip, prompt to invite.
- **Join = confirm with a minimal preview** via a new **public `GET /invites/:token`** ({tripName, destination, dates, memberCount}) — needed because `snapshot` is membership-guarded.
- **Switcher = header sheet** (trips list + now/soon/past chip + Create/Join); selection sets active-trip in `localStorage`.
- **Account = minimal menu** (name + sign out; profile editing deferred).
- **Trip settings/members = one in-trip screen** off the header (invite share, member list + roles, remove/leave, edit details) — not a new tab (ADR-0004).

## Timing (agreed)

- The shell **design is ungated** and was the highest-priority _Must_ surface untouched — so we specced it now, ahead of the in-trip Map/Index design (_Should_).
- The shell **build rides with T-007 (auth)** — the shell _is_ the auth flow (logged-out → sign-in → zero-state/switcher → create-or-join → in-trip). It also finalizes **T-027** (switcher) and widens **T-008** (Home) / **T-019** (mode) to be active-trip-aware.

## Follow-ups

- **New backend task:** public `GET /invites/:token` preview endpoint (the only net-new backend obligation from this spec).
- Flip `architecture/app-shell.md` PROPOSED → current when the shell ships.
- Deferred (recorded): profile editing; rich trips archive/search; overlapping in-progress trips (already deferred in ADR-0021).
