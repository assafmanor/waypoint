# Session 205 — The notes design session: two mockups, and four times the render disagreed with the design

**Date:** 2026-08-01
**Kind:** Design session with mockups → decision. **Docs + mockups only** — nothing built.
**Outcome:** [ADR-0153](../decisions/0153-the-notes-surface-the-mark-and-no-mode-gate.md) (the brief's §A + §B + §D), four in-place amendments to [ADR-0152](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md), and two mockups in the catalogue.

## What it was for

[The brief](2026-08-01-notes-design-brief.md) split "add notes" into four pieces and said the second would be underestimated. This session built the two mockups it asked for and closed §A, §B and §D. §C (Home + Hero 2.0) stays open **as a stated hand-off**, not as an unscheduled question.

## The part worth keeping: four times the file disagreed with me

This is the argument for mockups that reproduce the real layout tree, so it is recorded rather than smoothed over.

1. **`.idx-screen` needs its `.index` ancestor.** `IndexBookingsView` returns `.idx-screen`, but `Index.tsx:71` wraps it — and every rule the screen depends on (`.index .filter-row`, `.index .listcard`, `.index .idx-head`, `.index .addbtn`) is scoped to that ancestor. Rendered without it the screen still **looked fine**, which is exactly the `map-split-v2.html` lesson in `design/mockups.md`.
2. **`.modal-head` / `.modal-body` / `.sheet-card` do not exist.** A Sheet is `.modal-overlay[data-variant='sheet'] > .modal-card > .modal-title`. `Field` is a `div` with `data-invalid=""` and a `<p role="alert">` **after** the control; `FormActions` renders the **primary first**. Four inventions in one component, all caught by rendering it.
3. **`.sr-only` is not this app's helper** (`.visually-hidden` is, `App.css:666`), so the mark's accessible label rendered as visible text and broke the maybe tile's layout. `SyncBadge` already had the right pattern — `role="img"` + `aria-label` + `title` — and reusing it was the fix.
4. **The mark cost 19px on a 102px day row, and the obvious fix measured identically.** `.wp-event-m` is `flex-wrap: wrap` and **flex wraps before it shrinks**, so giving the meta text a shrinkable span did nothing at all. Only `nowrap` + ellipsis returns the row to 0px — and that then truncated the **confirmation code**, which is the fact the row is opened for.

Points 1–3 are process; point 4 became [ADR-0152 §6c](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md), because two of its three consequences change rows that have **no notes at all**.

## The owner's calls, and the two of mine they overturned

| Question                                  | What I proposed                                                   | **Decided**                                         |
| ----------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| Notes on a host form                      | A second form, or an inline field — flagged as an outbox decision | **Inline, "on the way", no second form ever**       |
| More than one note before saving          | Not designed (the mockup showed one box)                          | **Yes**                                             |
| How several notes are entered             | An auto-opening `textarea` per note                               | **One input; a committed note collapses to a chip** |
| The meta line, once the code is protected | Left open with a recommendation                                   | **A coded + noted row drops its place name**        |

**The B1 overturn is the one that matters, because my objection was simply wrong.** I argued an inline note makes one save into two outbox ops with an id dependency. The code says otherwise: host ids are **client-generated** (`crypto.randomUUID()`, `trip-state.tsx:930`), so the id exists before the save; the outbox is **FIFO**, stated verbatim above `createPlace` for the Place→Booking case that already relies on it; and [ADR-0093](../decisions/0093-offline-booking-linked-event-coherence.md) had already solved the shape _and_ left a reusable pattern. Checking the two ADRs the brief itself cited would have avoided raising it.

**The composer overturn was a design error of a familiar kind:** the auto-opening stack optimised the **rare** case (several notes at once) at the expense of the **common** one (nought or one). The owner named both symptoms — the sheet got too long, and a box appearing unasked is a surprise — and they are one mistake. The replacement is one input that never moves, with committed notes as one-line chips: **113px for three notes against 152px**, measured. Two follow-ups came out of that review and are in the ADR: a committed note is **tappable to keep editing** (otherwise a typo costs a delete and a retype), and the chip is the neutral ink wash rather than `--paper`, which is a warm cream that reads as beige at full width.

## What the mockups measured that a prop list could not

- **22 hosts for 40 notes** — 1.4 rows per group header. This is what kills grouping-by-host, though §2 of the ADR rests on the argument (the host surfaces already answer "what did we say about X"), not the number.
- **The day row's meta line is exactly full**: 151px available, 151px used. The mark's 21px do not exist, which is why the place name had to yield. Not a defect the mark created — a ceiling it revealed.
- **The maybe tile's three options**: corner **0px**, replacing ADR-0151's ranking reason 0px, both-at-once **+6px** — against the 8px that ADR refused eight days ago on the same tile.

## Open, and deliberately

- **Home + Hero 2.0** (the brief's §C). Notes puts **no mark on the Board** and hands that reach to the Hero 2.0 session, whose brief now carries the pointer. A note on the now/next event is a candidate answer to that brief's own sharpest question.
- **Two things a desktop browser cannot settle**: whether the editor's textarea autofocuses, and whether the note mark wants a tap target after all (16px against a 44px floor).
- **A host picker in the notes editor** — not built, so a note written from the notes screen is always general.

## Next

The build, in one branch: the `Note` model + shared schema, the sync channels, the composer on five host forms, the mark and the note section on their read surfaces, the Index tile and screen, and the `Booking.details.notes` migration. `EventCard` carries three changes of its own (ADR-0152 §6c), two of which touch rows with no notes — worth its own commit and its own tests.
