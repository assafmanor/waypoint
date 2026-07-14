# 0024 — App shell & trip-lifecycle navigation

**Status:** Accepted
**Date:** 2026-07-11

## Context

Every surface we have designed — the mockup, the built Home and Day-by-day screens, Plan mode — lives _inside a single trip_. The mockup is a one-trip dashboard; it assumes you are already in a trip. But you cannot reach any of it without first passing through surfaces that have never been designed: signing in, landing with **no trips**, **creating** a trip, **joining** one from an invite link, and **switching** between trips.

These exist in the docs as words — ADR-0021 calls the trip switcher "the app entry point" then defers it as "minimal"; the PRD says "members join via invite link"; the feature catalog says "Create trip, invite 5" — but nothing specifies the flow, and the mockup covers none of it. Building them ad hoc, screen by screen, would produce an incoherent shell, because they share one navigation model, one auth gate (ADR-0020), and one active-trip state (ADR-0021). This ADR fixes that model as a single decision; the buildable surface-by-surface spec lives in [`architecture/app-shell.md`](../architecture/app-shell.md).

The governing tension: Waypoint is a **living visibility layer for when you're on the ground — not a planner** (vision.md). The in-trip moment is the product. Everything outside it is connective tissue and should stay deliberately thin, or it will scope-creep into a second product.

## Decision

**The shell is chrome, not a surface.** It exists only to get you into a trip and back out to another. It never competes with the in-trip experience, and it uses indigo/neutral chrome only — **never amber or teal** (those stay reserved for now/active and location, ADR/design-language). We minimize both the number of shell screens and the taps between "app open" and "inside a trip."

Concretely:

1. **Routing (client-side, single-origin PWA — ADR-0020).** On load:
   - **Not authenticated →** `/login`.
   - **Authenticated, has trips →** resolve the active trip (ADR-0021 derivation: current in-progress → nearest upcoming → most recent, overridable) and render its in-trip surface at `/`.
   - **Authenticated, no trips →** the **zero-state** home.
   - A **deep-link intent is preserved across the login gate** — tapping an invite link while logged out sends you through sign-in and _resumes_ the join.

2. **Only three full-page shell routes:** `/login`, `/new` (create), `/join/:token`. Everything else that's "shell" — the **trip switcher** and the **account menu** — is an **overlay/sheet invoked from the in-trip header**, not a page. Fewer destinations, phone-first (ADR-0017).

3. **Zero-state gives Create and Join equal weight.** In the ~5-friend model one person creates and four join, so "I have a link" is not a secondary path.

4. **Trip creation is one form, not a wizard** — the fields of `createTripSchema`. On submit you become `admin` (ADR-0005), land _in the new trip_ (which is in Plan mode, being future-dated), and are prompted to invite.

5. **Join is a confirm with a minimal preview.** A new **public** `GET /invites/:token` (unguarded, validates the HMAC token) returns just enough to show _which_ trip — `{ tripName, destination, startDate, endDate, memberCount }` — before you commit. The preview always renders first, regardless of auth state. From there it's **one meaningful tap**: a signed-in visitor taps **Join**; a signed-out visitor taps **Continue with Google** — and because that tap happens _on the preview_, it **is** the confirm, so the join **auto-completes on return** from sign-in rather than demanding a second tap. (Consent/settings are not collected here — joining is one tap; per-member preferences like calendar sync are set later in trip settings. T-042/T-044.)

6. **The switcher is a header sheet**, not a dashboard: the active trip's name in the header opens a list of your trips (each with a now/soon/past chip) plus Create and Join. Selecting one sets active-trip state (localStorage, per-device, ADR-0021) and navigates.

7. **Account is a minimal menu** off the avatar: display name and **sign out**. Profile editing is deferred.

8. **Trip settings/members is one in-trip screen**, reached from the header — invite-link share, member list + roles, remove-member (admin-gated, ADR-0005), leave-trip, and edit-trip-details. It is _not_ a new bottom-nav tab (ADR-0004).

## Consequences

- **Easier:** the frontend shell and the T-007 auth backend get built against one agreed flow instead of improvised together; the switcher, zero-state, and join-landing stop being "TBD."
- **One net-new backend obligation:** the public `GET /invites/:token` preview endpoint (the existing `snapshot` is membership-guarded, so it can't preview a trip you haven't joined yet).
- **Constrained on purpose:** the shell is capped at three routes + two sheets. Anything richer (trip archive/search, profile editing, a real "trips dashboard") is an explicit future decision, not a default.
- **Offline (ADR sync/offline):** switching among already-cached trips works offline (reads); sign-in, create, and join require the network, and the zero-state says so when offline.
- Feeds the task graph: this is the design half of the **app shell**, built alongside **T-007 (auth)**; it also finalizes **T-027 (switcher)** and widens **T-019 (mode)** / **T-008 (Home)** to be active-trip-aware.

## Alternatives considered

- **A full "trips dashboard" as the home.** Rejected: it makes multi-trip the centerpiece and pulls the product toward a planner/organizer. ADR-0021 already chose "minimal list + switch"; the sheet honors that.
- **Auto-join on invite tap, with no preview shown.** Rejected: joining a shared object blind is bad. Note this is _not_ the same as auto-completing the join after sign-in (point 5) — there the preview was shown and the "Continue with Google" tap on it was the explicit confirm, so finishing the join on return isn't blind. What's rejected is joining with no preview/action at all.
- **A multi-step creation wizard.** Rejected as planner-creep; one form matches the thin-shell principle and the small `createTripSchema`.
- **Making the switcher and settings full routes/tabs.** Rejected: more destinations for a phone-first shell, and a settings _tab_ would violate ADR-0004 ("the trip is the only surface").
