# Index tab: bookings, documents, and the booking↔event link

**Status:** ACCEPTED (brainstorm session 2026-07-16)
**Produces:** an ADR for the booking↔event linkage model + booking notes/wifi fields (new, domain: data model & events); a revision note on ADR-0045 (Home's WiFi source changes); ADR-0038 status unaffected (category unification is separate and still proposed).
**Builds on:** ADR-0004 (integrations are pipes, not screens), ADR-0011 (hard/soft events), ADR-0015 + ADR-0034 (document encryption), ADR-0025 (trip-mode edit tiers — Tier 2 already sanctions "quick-add a booking" / "link a booking"), ADR-0045 (Home real-data-only, documents + wifi quick-access).

## Problem

The Index tab is an unbuilt `Placeholder` in `App.tsx`. Backend CRUD for `Booking` and encrypted storage for `Document` already exist; a mockup already sketches the layout (`mockups/trip-dashboard-v2.html`, `mockups/plan-mode-v1.html`). What was never decided is the _behavior_: how a Booking relates to the Event it may back, what happens on edit/delete when they're linked, how Documents are organized relative to the 1-row-per-file data model, and where practical details like a hotel's WiFi password live. This spec settles those questions; it does not re-design the visual layout, which the mockups already cover.

## Decisions

### A. Booking↔Event linkage is strict 1:1, optional

A Booking backs **zero or one** hard Event — never many. Saving a Booking with a `startsAt` auto-creates its hard Event immediately; there is no separate "schedule it later" step for a booking with a known time. A Booking with no `startsAt` just sits in the index, unlinked.

- **Multi-night hotel stays** use the existing `Event.endDate` ambient-span field (already in the data model for exactly this) for check-in/check-out, rendered as a single Event with two edges — not two separate Events sharing a `bookingId`. This reuses a mechanism that already exists instead of introducing a new one-to-many relationship.
- **Round-trip flights** are **two separate Bookings** (outbound leg, return leg), each with its own gate/seat/confirmation-code details, each optionally backing its own Event. This keeps the 1:1 rule uniform rather than carving out an exception for flights.

Rejected: allowing one Booking to back multiple Events (more granular, but duplicates what the span field already covers and adds a relationship shape nothing else needs). Rejected: fully decoupled creation where adding a Booking never auto-schedules it (adds a mandatory extra step for the common case, and leaves a hard commitment with a known time sitting off the timeline, which contradicts what "hard" means).

### B. One merged edit surface

Editing a linked Booking+Event — from the Index or from the day view — opens the same form, patching whichever entity owns each field: Booking owns `title` / `confirmationCode` / `provider` / `details`; Event owns `startsAt` / `endsAt` / `kind` / `status`. There is exactly one copy of each fact, so there is nothing to keep in sync. (Rejected: independent edit surfaces with explicit re-sync — reopens the drift problem this is meant to close, and lets a hard event's "real" time disagree with its Booking's.)

### C. Delete/unlink is an explicit two-choice prompt

Deleting a Booking that backs an Event blocks with a prompt: **delete both**, or **unlink and keep the Event** (the Event survives as a plain manual entry, losing its confirmation code). This turns the backend's existing 409 (`docs/architecture/data-model.md:132`, `onDelete: SetNull` + API warn) into a UI decision instead of a raw error. Deleting the Event side of a linked pair leaves the Booking untouched and unlinked in the index. (Rejected: always-cascade — too destructive for a hard commitment per ADR-0011. Rejected: block delete until manually unlinked first — an unnecessary extra step when the user genuinely wants both gone, e.g. a cancelled hotel.)

### D. Documents: one row per file, grouped by type

The Document list shows one row per file (matching the `Document` entity exactly — the existing mockup's single-row-per-type was a visual simplification the schema doesn't support), grouped under collapsible headers (Passports / Insurance / Visas / Other). Documents stay fully independent of Bookings/Events — no `bookingId`/`eventId` on `Document`. (Considered and rejected: keep the mockup's one-row-per-type — loses per-file management with no drill-down. Considered and rejected: flat ungrouped list — loses the at-a-glance "do we have everyone's passport" scan once there are 5 people × several types.)

### E. Generic booking notes + hotel WiFi, no schema migration

Every Booking gains a generic free-text notes field. Hotel bookings additionally get a WiFi network/password field. Both live in the existing `Booking.details` JSON blob (already used for seat/room/gate info) — no new column, no new table.

### F. WiFi consolidates onto the hotel Booking, replacing `TripNote`

This **replaces** the `TripNote`-based WiFi entirely (not a fallback alongside it). Home's WiFi quick-access (ADR-0045) changes from reading a `TripNote` (category `wifi`) to looking up the active/next hotel Booking's `details.wifi`. `TripNoteCategory` narrows from `wifi | note` to just `note`. This is a behavioral revision to ADR-0045 and needs a superseding note there — Home's quick-access logic, not its visual design, changes.

Consequence: a trip with no hotel Booking on file (e.g. staying with friends) has no WiFi quick-access on Home. Accepted as correct — WiFi is now tied to where it actually comes from, not a manually-entered trip-wide fact.

### G. Entry points: both modes can add a Booking

The booking form is reachable from Plan mode and directly from the Trip-mode Index tab (on-the-ground additions like a same-day restaurant reservation). This is already Tier 2 per ADR-0025 ("quick-add a booking," "link a booking to an event" — inline bottom sheet, first-class in Trip mode, not gated to Plan mode).

## Scope boundary

- No visual redesign — `mockups/trip-dashboard-v2.html` (Index tab layout) and `mockups/plan-mode-v1.html` (booking-entry form) remain the reference; this spec only fills in behavior the mockups don't show.
- ADR-0038 (category unification) is untouched — it's a separate, still-proposed thread about grouping the index by `EventCategory`, orthogonal to the linkage/document/wifi decisions here.
- Document↔Booking linkage (e.g. a boarding pass tied to its flight) is explicitly out of scope — Documents stay independent, per (D).
- Type-specific Booking fields are scoped to hotel→wifi only, plus the generic notes field for every type. No other type-specific fields (flight seat, train car, etc.) are being added now.

## Follow-up doc work

- New ADR for (A)-(C), (E)-(G) — the booking↔event linkage model, delete/unlink behavior, and booking notes/wifi fields. Domain: "Data model & events" in `docs/INDEX.md`'s router.
- ADR-0045 gets a short superseding note: Home's WiFi source moves from `TripNote` to the active hotel Booking's `details.wifi`.
- `docs/architecture/data-model.md` gets the `Booking.details.notes` / `details.wifi` shape documented, and a note that `TripNoteCategory` narrows to `note`-only.
- `docs/backlog.md`'s "Index tab" and "Documents UI" lines get updated to point at this spec once an implementation plan exists.
