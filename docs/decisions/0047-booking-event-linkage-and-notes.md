# 0047 — Booking↔Event linkage, delete/unlink, and booking notes (incl. hotel WiFi)

**Status:** Accepted
**Date:** 2026-07-16
**Refines:** [0004](0004-integrations-are-pipes.md) (a Booking still only ever feeds the index/timeline, never its own screen), [0011](0011-hard-soft-event-model.md) (hard events are never silently destroyed — the delete/unlink prompt), [0018](0018-timeline-data-model-shape.md) (the `endDate` ambient-span field this reuses for hotel stays), [0025](0025-trip-mode-edit-capability-tiers.md) (Tier 2 already sanctions quick-add/link-a-booking in Trip mode), [0045](0045-trip-home-real-data-only.md) (changes Home's WiFi quick-access source from `TripNote` to the active hotel `Booking`)

## Context

The Index tab (`Booking`s + `Document`s) is an unbuilt `Placeholder`; backend CRUD/storage already exist and a mockup (`mockups/trip-dashboard-v2.html`, `mockups/plan-mode-v1.html`) already sketches the layout. What was undecided was the _behavior_: how a `Booking` relates to the `Event` it may back, what happens on edit/delete once linked, how `Document`s are organized against the one-row-per-file model, and where practical per-booking details (a hotel's WiFi) live. Full design discussion: `docs/superpowers/specs/2026-07-16-index-bookings-documents-design.md`.

## Decision

1. **Booking↔Event is strict 1:1, optional.** A Booking backs zero or one hard Event, never many. Saving a Booking with a `startsAt` auto-creates its Event immediately — no separate "schedule later" step. A multi-night hotel stay is **one** Booking backing **one** Event that uses the existing `Event.endDate` ambient-span field for check-in/check-out (not two Events sharing a `bookingId`). A round-trip flight is **two** Bookings (outbound, return), each optionally backing its own Event.

2. **One merged edit surface.** Editing a linked Booking+Event — from the Index or the day view — opens the same form; each field has exactly one owner (Booking: `title`/`confirmationCode`/`provider`/`details`; Event: `startsAt`/`endsAt`/`kind`/`status`). One copy of each fact, nothing to drift.

3. **Delete/unlink is an explicit two-choice prompt.** Deleting a Booking that backs an Event blocks with: delete both, or unlink-and-keep-Event (the Event survives as a plain manual entry, losing its confirmation code). This is the UI for the backend's existing `onDelete: SetNull` + 409 (`data-model.md` "Key relationships & rules"), not a new mechanism.

4. **Documents: one row per file, grouped by type.** Matches the `Document` entity exactly (the mockup's single-row-per-type was a visual simplification). Documents stay independent of Bookings/Events — no linkage field added.

5. **Generic booking notes + hotel WiFi, no schema migration.** Every Booking gains a free-text notes field; hotel Bookings additionally get a WiFi network/password field. Both live inside the existing `Booking.details` JSON blob.

6. **WiFi moves from `TripNote` onto the hotel Booking, replacing it entirely.** Home's WiFi quick-access (ADR-0045) changes from reading a `TripNote` (category `wifi`) to looking up the active/next hotel Booking's `details.wifi`. `TripNoteCategory` narrows to `note`-only. A trip with no hotel Booking on file has no WiFi quick-access — accepted, since WiFi is now tied to where it actually comes from.

7. **Both modes can add a Booking.** The booking form is reachable from Plan mode and directly from the Trip-mode Index tab (Tier 2, ADR-0025 already names "quick-add a booking" / "link a booking" as in-scope there).

## Consequences

- No schema migration for notes/WiFi (both ride in `Booking.details Json?`, already present). The one real schema change is narrowing `TripNoteCategory` from `wifi | note` to `note`-only — deferred to the implementation PR; `docs/architecture/data-model.md` is annotated with a forward pointer to this ADR rather than rewritten ahead of the code (matches how ADR-0038's still-unimplemented `category` field is handled there today).
- Home's WiFi quick-access (ADR-0045 §2) reads a different source once implemented; ADR-0045 itself is not edited (per this repo's "never edit an Accepted ADR's decision" rule) — this ADR is the record of the change.
- `docs/backlog.md`'s "Index tab" / "Documents UI" lines get the specifics (auto-create-on-save, the delete/unlink prompt, per-file grouped documents, notes/wifi fields) once an implementation plan exists.
- No visual redesign — `mockups/trip-dashboard-v2.html` and `mockups/plan-mode-v1.html` remain the layout reference; only behavior was undecided.
- ADR-0038 (category unification) is untouched — a separate, still-proposed thread about grouping the index by `EventCategory`, orthogonal to this ADR.

## Alternatives considered

- **1:many Booking↔Event** (e.g. separate check-in/check-out Events sharing one `bookingId`). Rejected: duplicates what `Event.endDate` already covers and adds a relationship shape nothing else in the schema needs.
- **Fully decoupled booking creation** (adding a Booking never auto-schedules; scheduling is a separate explicit step). Rejected: adds mandatory friction to the common case and leaves a hard commitment with a known time off the timeline, which contradicts what "hard" means (ADR-0011).
- **Independent edit surfaces with explicit re-sync** between Booking and Event copies of overlapping facts. Rejected: reopens the exact drift problem a merged surface avoids.
- **Always-cascade delete.** Rejected: too destructive for a hard commitment (ADR-0011). **Block delete until manually unlinked first.** Rejected: unnecessary extra step when the user wants both gone (e.g. a cancelled hotel).
- **Document↔Booking linkage** (e.g. a boarding pass tied to its flight). Rejected for now: out of scope, keeps Documents simple and independent.
- **Keep TripNote wifi as a fallback** alongside Booking-sourced wifi. Rejected: two places wifi can live reopens a sync question this ADR is trying to close; a trip with no hotel Booking simply has no WiFi shortcut.
