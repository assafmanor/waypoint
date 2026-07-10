# PRD — Version 1

**Status:** DRAFT (PM proposal for review — decisions flagged with 🔶)

## 1. Goal of v1

Ship a usable trip control-center for **one real trip with one real group of ~5 friends**. Success is measured on the ground, not in a store: *did we actually reach for it during the trip instead of scattering across WhatsApp, screenshots, and Google Maps?*

The north-star behavior: **during the trip, the app is the first thing you open to answer "what now / what next."**

## 2. Who it's for

Five friends traveling abroad together. Each is a peer — there is no "admin who owns the trip" in the everyday sense (though someone creates it). Everyone can see everything and edit soft plans. See [personas.md](personas.md).

## 3. Platform decision ✅

**Device targets (ADR-0017):** **phone-primary** — the design baseline is the phone, used in hand on the ground. **Tablet** is secondary and matters most for **Plan mode** (input/research use the width). **Desktop** is a rare, graceful-minimum case. Mobile-first, touch-first, responsive by breakpoints.

**Decided (ADR-0007):** a **mobile-first responsive web app (PWA)** — installable to the home screen, works offline for the index/documents, one codebase, no app-store friction for a 5-person private tool.

- **Why not native:** app-store distribution, review, and per-platform builds are overhead a private tool doesn't need. A PWA installs from a link.
- **What we give up:** some native niceties (background location, rich push on iOS is limited, true offline maps). We accept these for v1; revisit if a specific need bites.
- **Revisit trigger:** if live location-based discovery or reliable push becomes core, reconsider a thin native shell (e.g. Capacitor) wrapping the same web app.

## 4. In scope for v1

### 4.1 The trip surface (the four tabs)
- **Home** — the departure-board "Now/Next" hero (live clock, countdown, day progress), quick-access actions, glance cards (weather / FX / today's budget).
- **Day-by-day** — the itinerary with hard/soft events, quick actions per card, the "maybe" shelf, ripple suggestions, undo.
- **Index** — all bookings with confirmation codes; documents; **works offline**.
- **Map** — pinned events + "near me now" list.

### 4.2 Real collaboration (multi-user) — see [collaboration-model.md](../architecture/collaboration-model.md)
- A trip is a shared object; members join via invite link.
- Everyone sees the same itinerary and index in near-real-time.
- Edits by one member propagate to others; a lightweight **change-feed** ("Noam moved ramen to 20:00").
- Presence-light: who's a member, who's connected to Google. (No live GPS-sharing in v1 🔶.)

### 4.3 Hard/soft event model
- Events typed hard 🔒 or soft; hard events warn on edit and are never auto-moved.
- Verbs: skip · delay 30m · swap · done · on our way.
- Ripple suggestion when moving an event (always a suggestion, never touches a hard anchor).
- Undo everywhere.

### 4.4 The "maybe" shelf
- Saved ideas not yet scheduled; drop one onto a day to schedule it.

### 4.5 Practical layer
- Currency rate, weather, emergency numbers, WiFi codes, per-day budget (display; see below).
- Encrypted offline documents (passports, insurance).

### 4.6 Minimum integrations for v1 ✅
- **Google Maps/Places** — navigation deep-links, hours, ratings, "near me."
- **One-way calendar sync** — trip → each member's personal Google Calendar.
- **Gmail booking import** is **deferred to v1.1** — high effort, and manual booking entry covers v1. (ADR/catalog)
- **Auth: Google-only** (ADR-0013).

## 5. Explicitly OUT of scope for v1

- A user belonging to **multiple trips** is **in** for v1 as a *simple list + switcher* (ADR-0021 — the model already supports it). What stays out: polished multi-trip UX and **overlapping in-progress trips** (deferred).
- Two-way calendar sync (a conflict trap — see ADR-0003).
- Expense splitting / Splitwise-style settlement (nice-to-have; v1.1+).
- Shared photo album (Google Photos) (v1.1+).
- Live GPS location sharing between members.
- Public/discovery/social features. This is private, invite-only.
- Building for scale (many trips, many users). Architected to allow it, not optimized for it.

## 6. Success criteria

- The group uses it as the primary "what now/next" reference for at least one full real trip.
- The index works with zero connectivity (airplane, dead SIM).
- A plan change by one person is visible to the others without anyone re-sending a message.
- Adding a booking (manually or via Gmail import) takes < 30 seconds.

## 7. Decisions status

**All v1 scope decisions resolved (2026-07-09):**
- ✅ Platform: PWA (ADR-0007)
- ✅ Backend: traditional self-owned **Node/TypeScript** (NestJS), TS end-to-end (ADR-0008)
- ✅ Auth: Google-only (ADR-0013)
- ✅ Gmail import: deferred to v1.1
- ✅ Own-device location in v1; member-to-member sharing deferred (ADR-0006)
- ✅ Budget: display-only (ADR-0014)
- ✅ Document encryption: server-side at rest (ADR-0015)
