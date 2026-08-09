# Session 233 — the row shows glyphs, and an event finally gets its read

**Date:** 2026-08-09
**Outcome:** [ADR-0174](../decisions/0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) **fully built** (§4 shipped, §8 added). [ADR-0152](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md) §6c **retired**; [ADR-0053](../decisions/0053-index-booking-detail-view-and-merged-edit-reach.md) amended (the read surface is a shared shell).
**Branch:** `claude/attachments-followup-overflow-and-event-read`.

## What the owner reported

From a device, with a screenshot of a Plan day:

> "Not everything from the mockups was built, for example the plan event preview. Make sure that you build everything that we've decided."
>
> "The text is overflowing … I don't think that we even need to write the attachment names."

and, on being asked where the names should go:

> "The hero should still write the names, but events and bookings should only show the glyphs in their row, no names or ids."

## The audit — everything decided and not built

Asked for an enumeration rather than a fix to the one reported symptom, and there were **four**:

| Decided in             | What                                              | Why it was missed                                                      |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| ADR-0174 §4            | The **event read surface** in Plan mode           | Held for the owner's call, which had since been given                  |
| ADR-0174 §5            | The attach slot **above** the notes               | The control's _look_ shipped; the **reorder did not** — on either form |
| ADR-0174 §2 / ADR-0092 | A queued upload's chip reading as **provisional** | Drawn in the mockup's §2E and never wired                              |
| —                      | The row overflowing on a real confirmation code   | New, and it retires a rule                                             |

Verified as **not** missed: the map's canvas place card (it shares `renderRow`, so the documents slot reaches both), and the marks on all four row hosts.

## §8 — the row shows glyphs, and §6c goes with it

The overflowing text was not an attachment name, it was `הזמנה #MEGAZIP-T141215488`. Every
measurement ADR-0152 §6c was built on used `הזמנה MN-4471` — four characters where the world
supplies twenty. §6c makes the code `flex: 0 0 auto` on purpose (a shortened code is the fact
you opened the row to read), so it could not shrink; the place name was squeezed to **zero
width**, leaving a stranded `·`; and the line overflowed into the badge and the `⋯`. That is
§6c's own "a stub is noise" complaint arriving through the one item §6c had protected.

The owner's call removes the problem rather than re-tuning it: **no names, no ids, glyphs
only**. `eventMetaParts` is deleted rather than narrowed, and the line does not render at all
on a row with no glyph and no sync marker. Neither fact is lost — the place is the badge
(which is the way to its pin) and the code is one tap away in the read the row now opens.

**The lesson worth keeping past this ADR:** when a rule's whole justification is a width, the
width has to come from real stored content, not a fixture.

## §4 — and what building it revealed

`EventDetail` was written out by hand first, and its shell came out **identical to
`BookingDetail`'s, line for line**: `Sheet` → `.bk-detail` → `.bk-actions` → `.bk-head` →
`.bs-hard-note` → `.bk-facts` → `HostDocuments` → `HostNotes`. That is exactly the
parallel-copy shape ADR-0078/0079/0094/0095 are retractions of, and it only became visible
once both were on screen together.

So the shell was **extracted into `ui/DetailSheet.tsx`** and both surfaces render it; the
facts stay per-file, because that is the part that genuinely differs (a booking has a code, a
provider, WiFi, a journey and a round-trip partner; an event has a place and a time). A shell
modelling both would grow a per-entity branch, which is ADR-0094's anti-pattern one layer up.
**`BookingDetail`'s 30 tests pass unchanged through the extraction**, which is the evidence it
is faithful rather than a rewrite.

Two behaviours came with it:

- A **booked** event routes to `BookingDetail`, which is already its read (ADR-0172 §1) — so
  §4 was half-built all along and only the unbooked event needed a surface.
- The **archived trip** opens. `.bld-main` was a `<div>` on `readOnly`, so a finished trip's
  events could not be opened at all, in the mode whose whole job is being browsable
  (ADR-0040). It is a `<button>` at every scope now, and the read carries no `עריכה` there —
  absent rather than disabled (ADR-0150 §8).

## The reuse audit

**Reused:** `DetailSheet` (extracted from `BookingDetail` rather than written twice), `Fact`
and `LocationFact` (exported from `BookingDetail` rather than redrawn), `Sheet`/`Modal`,
`EventTitle`, `eventMapPlace`/`eventShowOnMap`/`mapsDirectionsUrl`/`eventZones`,
`HostDocuments`/`HostNotes`, the existing `detailTarget` + `BookingDetail` plumbing in
`PlanDay` for the booked route, and `EntitySyncBadge`/`useUnsynced` for the queued-upload chip
— the app's ONE per-entity sync grammar rather than a chip-sized copy of it.

**Net-new:** `DetailSheet` (an extraction), `EventDetail` (facts only), and one
`.doc-chip.unsynced` rule.

**Deleted:** `eventMetaParts`, `EventCard`'s `placeName`/`routeRow` props, `BuilderRow`'s
`placeName`/`booking` props, and the `.bld-m-txt`/`-sep`/`-code` spans' call sites.

## What is left

- The lifted hero's bound (ADR-0160 §T) — still a backlog line, still needs an e2e assertion.
- The reverse read on the documents screen — drawn once in the mockup's §8, still not built.
