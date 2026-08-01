# Notes — design brief: what actually needs designing, and where the mode line falls

**Status:** a brief, not a decision. Orientation for whoever opens the design session; nothing here is authoritative until it lands in an ADR. Written at the owner's request as the **prerequisite** for that session, because [ADR-0152](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md) settled the model and left the geometry open — and the geometry is not one screen.

**Settled already, and not up for re-litigation in the session** (ADR-0152): the entity and its fields, the typed host FK, the sync channels, the two tiers (a kept `פתק` is a row, an external tip is a card that owns no row until someone keeps it), `EventCategory` as the category, `url` instead of a "social media" taxonomy, `פתקים` as the word, the third Index tile, group-only visibility, and the booking-notes migration. If the session finds one of these wrong, that is an amendment to 0152, not a design choice.

## Why this brief exists

The request reads as "add notes", and it is four pieces of design work with different shapes, different risk and one hard dependency on another open session:

- **A** — a new surface (the tile, the screen, the editor, the card tier).
- **B** — a change to **five** existing entities' create and read surfaces. This is the big one and it is the one that will be underestimated.
- **C** — Home: the quick-access grid, the change feed, and the **Hero 2.0 collision**.
- **D** — the Plan / Trip mode boundary, which cuts across all three.

Sequencing matters because B and C touch surfaces whose density budgets were spent in the last two weeks (ADR-0149's header, ADR-0151's 140×76 tile), and C collides with a design session that is already briefed and unstarted.

---

## A. The new surface

**A1 — the third `IndexTile`.** Bookings preview `next: <title> · <when>`; documents preview their type groups. A note collection has no "next" and no natural groups. What is the one line? Candidates: the most recent note, a count split (`N כלליים · N מקושרים`), or the categories present. Whatever it is must survive a trip with 60 notes and a trip with 1.

**A2 — the screen: grouping and default order.** The unsolved one. A note list has at least three competing organisations and only one can be the default:

- by **host** (all of this event's notes together — matches how you'd look for one),
- by **category** (the chip row, which A3 gives us anyway),
- by **recency** (matches how they arrive, and what "just written" means on the ground),
- and cutting across all three: **general vs. attached**, which may be a group, a facet, or nothing at all.

Decide this against a realistic fixture, not three notes. This is where a mockup earns its keep.

**A3 — the screen's controls.** ADR-0098 §2's apparatus, adopted from day one rather than when it crowds: the `ChoiceGrid` chip row over `EventCategory`, search (ADR-0102 multi-field, now spanning title/body/url), `RevealList` on every control that changes the list (ADR-0120 — a `.filter()` here is the one-off that made the Map jump for two releases). Open: does the screen need a **collapse** the way bookings collapse past ones? A note on a past event is not "past" the way a used booking is — it may be the most useful thing in the trip.

**A4 — the note row.** What it shows and in what order: title, body excerpt, url, category glyph, host chip, author, time. That is seven things competing for a phone row, and the answer is probably three. The host chip is the novel part — a note row has to say what it is about without becoming a second copy of the host's row.

**A5 — the editor sheet.** Create and edit, one `Modal`, `useFormErrors` for its one refusal (a note with neither body nor url). Open: **can a note be attached to a host from the notes side**, or is attachment only ever established from the host's side? A host picker inside the editor is a whole sub-surface (search across five entity types) — and its absence means the notes screen can only ever create general notes, which is a real limitation to accept knowingly.

**A6 — the card tier, drawn but not wired.** ADR-0152 §3 names the grammar to spend (ADR-0132's ring, ADR-0121 §6's ghost pins) and no pixels. The session should draw it even though nothing emits cards yet, because the screen's layout has to have a place for it — retrofitting a subordinate tier into a shipped list is how you get a third grammar.

**A7 — two empty states**, both `EmptyState` (ADR-0078): no notes at all, and no match for this filter. Different copy, different affordance.

---

## B. Five hosts × (create, read) — the part that will be underestimated

Each host needs **three** decisions: how a note is added at create time, what mark the row carries, and how you reach the notes from the row.

| Host        | Form (create/edit)                                                   | Read surfaces the mark must survive                                                            |
| ----------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Event`     | `ui/EventForm.tsx`                                                   | `EventCard` collapsed **and** expanded, day view, `PlanDay`, row menu, the Map's reference row |
| `Booking`   | `ui/BookingSheet.tsx` (the merged Booking+Event editor, ADR-0047 §2) | `ui/BookingDetail.tsx`, `IndexBookingsView` rows, Home quick-access                            |
| `Place`     | `ui/domain/MapPlaceForm.tsx`                                         | the map place card, `PlaceBadge`, the `SnapSheet` rows, `PlaceResearch`                        |
| `MaybeItem` | shelf add / `＋ אולי` from map + research                            | `MaybeCard` **tile (140×76)** and sheet row, the shelf, the gap sheet, the Map's `אולי` facet  |
| `Document`  | `ui/DocumentUploadSheet.tsx`                                         | `IndexDocumentsView` rows, `DocumentManageSheet`, `DocumentViewer`                             |

**B1 — the create-time fork, and it is a real one.** `BookingSheet` has an inline notes field **today**. If a note is a row, an inline field on a create form means one save writing two entities — and offline that is two outbox ops with a dependency between them (the note needs the host's id). The options are: keep an inline field and solve the dependent-op case; or make a note strictly a second act ("save, then add a note"), which is honest and simpler and is a **regression** for the booking form that has it now. Pick deliberately; do not let it be decided by whichever form gets built first.

**B2 — the mark, on rows whose meta lines are already full.** `EventCard` already carries transition verbs, zone-shift pills, conflict and concurrency marks. The mark cannot be a fourth thing competing there. And it must not spend amber, teal or plan-violet (non-negotiable rule 4) — a note is neither time, nor place, nor plan mode, so it is neutral ink or `--cta`.

**B3 — `MaybeCard` is the hard case and should be designed first, not last.** ADR-0151's amendment refused a wrapped reason line on that tile because it took it from 76px to 84px — eight pixels it had just been redesigned to save. A note mark competes for the same space with an even weaker claim. The honest possible answer is **the tile carries no mark at all** and the sheet row does; if so, decide it on purpose and write down why, because it will look like an omission later.

**B4 — the reach.** Row menu entry (ADR-0138 — the row menu is one surface), a tap on the mark, or a section in the detail surface. Probably all three resolve to one destination, and the session should name that destination once rather than per host.

**B5 — where the body actually renders.** ADR-0152 §6 says a note is a mark on a row and a body in the detail surface. Four of five hosts have a detail surface. **`MaybeItem` does not** — it has a tile and a sheet row. So either the shelf grows one, or a maybe's notes are reachable only from the notes screen. Unresolved, and it is the one gap in §6's rule.

---

## C. Home, and the Hero 2.0 dependency

**C1 — the quick-access grid (ADR-0050/0045).** Tiles are derived and vanish with their source; the grid reflows on the visible count (`QUICK_TILE_MAX_COLS`, `Home.tsx:199`). A "note on your next stop" tile is a plausible fifth. Open, and the layout consequence is real — but note this may be answered entirely by C3 instead, and should not be settled before it.

**C2 — the change feed (ADR-0081).** A peer writing a note is already a `Change`, so the feed narrates it for free. Needs one copy line, and one call: do note **edits** narrate, or only creations? A group editing one note in the same hour should not fill a bounded 20-entry buffer.

**C3 — Hero 2.0, and this is the important one.** The [Hero 2.0 brief](2026-07-28-hero-2-0-design-brief.md) is written and unstarted, and its **sharpest open question is sub-question 1**: _"What does the expanded state show that the collapsed one cannot? Whatever expansion adds has to be worth an interaction, not a reflow of the same facts."_

A note attached to the now/next event is a strong candidate answer. It is genuinely new information the collapsed board cannot carry — not a reflow of title, kind, until-time, code, countdown, zone shift or concurrency — and it is the highest-value on-the-ground content the app can hold: _"the entrance is round the back"_, _"ask for Yossi"_, _"bring cash"_. That is the Now/Next thesis, written by the group.

**The dependency runs both ways, so state it rather than let the sessions collide:**

- **Notes must not put a mark on the Board.** A per-entity control on the app's one dark, glowing, once-per-screen surface is exactly what read too loud and got backed out in ADR-0121's 2026-07-28 amendment §4. §B's host-surface pass explicitly **excludes** the Board, and hands the board's note-reach to Hero 2.0 as a named input.
- **Hero 2.0 should not answer its sub-question 1 before it knows notes exist**, or it answers with a reflow and gets re-opened.

The clean sequence: notes design (A + B + D) → notes build → Hero 2.0 session with notes as a named input for its sub-question 1. Hero 2.0's brief should gain one line to that effect regardless of what this session decides.

---

## D. The Plan / Trip mode boundary

The framework already exists and the session should apply it rather than invent one: **[ADR-0025](../decisions/0025-trip-mode-edit-capability-tiers.md) — an edit's tier is decided by its blast radius, not by mode. Mode decides how you reach a tier.**

Applied to notes, the proposed reading — and it is an unusual answer, which is why it needs stating out loud:

- **Reading a note: every mode, every surface, no gate.** Not a tier question at all. Reads work offline (non-negotiable rule 5).
- **Writing a note, hosted or general: Tier 1.** It destroys nothing, moves nothing, ripples into nothing, and it is **most valuable exactly on the ground** — _"the entrance is round the back"_ gets written while standing at the entrance. A note is one of the very few structural-looking things whose natural home is Trip mode.
- **Editing a note: Tier 1.** Same blast radius. LWW handles the concurrent case as it does everywhere else.
- **Deleting a note: Tier 2** by ADR-0025's own Skip-vs-Delete distinction — but ungated, an inline sheet, not a Plan escape. Deleting a note destroys a sentence, not a plan, and it is not a hard commitment (ADR-0011 does not reach it).
- **Tier 3: nothing, in v1.** There is no bulk arrange, no reorder, no cross-day move. Custom categories would have been the Tier 3 candidate and ADR-0152 §5 deferred them.

**So the proposal is that notes are mode-neutral, with no Plan-mode gate anywhere.** The Index tab is already mode-neutral by ADR-0049 ("mode changes chrome only"), so the screen inherits that; what is new is that the _authoring_ is ungated too.

**The precedent that decides the tempting exception.** The obvious counter is "surely a paid AI-tip strategy is Plan-mode only". That call was made once already, on search, and **the owner overturned it**: ADR-0115 §6's "Plan mode only" was withdrawn because the real question was never which mode gets which surface — the paid half is answered **by the arm rather than by a mode gate** (backlog, Phase 10 §3). ADR-0151 §7 as amended by ADR-0152 §8 now keys arming to `cost`, not to placement and not to mode. Do not re-introduce a mode gate here; it was already tried and withdrawn one surface over.

---

## E. Cross-cutting, easy to forget

- **Colour**: notes spend no amber, teal or plan-violet (rule 4). Neutral ink / `--cta`.
- **Bidi**: a URL is an LTR run inside RTL prose — `lib/bidi.ts`'s `ltrIsolate`, never `dir="ltr"` on a non-`<input>` (lint-blocked, ADR-0118).
- **Offline**: the editor writes through the outbox and must work with no signal; the card tier is **absent** offline, never spinning and never stale (ADR-0151 §5).
- **Motion**: inherited from the primitives. A new large surface sets `--press-scale: var(--press-scale-lg)` and nothing else (ADR-0140).
- **Copy**: no em dashes in UI strings; `·` for separators, `-` for a missing value.

## Not design questions — settled, do not spend session time on them

The schema and its five FKs, the applier rule for a host's delete, the snapshot/cache/outbox channels, the booking-notes migration, `details.wifi` staying put, and the strategy contract's shape. All in ADR-0152.

## Suggested shape of the session

Two mockups, not one, because A and B fail differently and at different sizes:

1. **`notes-screen-v1.html`** — the tile, the screen (A2's grouping question against a fixture of ~40 notes, not 3), the row, the chips, search, both empty states, the editor sheet, and A6's card tier drawn.
2. **`notes-on-a-host-v1.html`** — the mark and the reach across all five hosts at 390×844 and 360×640, with the **crowded** cases reproduced rather than the clean ones: an `EventCard` already carrying a transition verb and a zone pill, and `MaybeCard` at its real 140×76.

Reproduce the real layout tree, not just the real CSS, and inline the app's stylesheets via `mockups/tools/inline-app-css.mjs` — the distinction has already burned one session (see `design/mockups.md` on `map-split-v2.html`).

Both mockups, then one ADR covering A + B + D. C3 stays a named hand-off to the Hero 2.0 session.
