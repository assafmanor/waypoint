# 0229 — In Trip mode the row opens **what you do**; the read is **one tap further**

**Status:** **PROPOSED** — drawn and measured, not built. Two forks are the owner's and are named at the foot.
**Date:** 2026-09-15
**Session note:** [`planning/2026-09-15-the-read-in-trip-mode.md`](../planning/2026-09-15-the-read-in-trip-mode.md)
**Mockup:** [`mockups/the-read-in-trip-mode-v1.html`](../../mockups/the-read-in-trip-mode-v1.html)

**Amends in place:** [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §6 — _"No change to how the Trip-mode day card opens. It already expands and that expansion is the read"_ — which was true when it was written and has stopped being true since.
**Completes:** [0223](0223-a-confirmation-code-is-looked-up-not-carried.md) — its mitigation, stated twice, is _"every surface that dropped the code is one tap from the booking that has it."_ The Trip-mode day view is the one surface where that sentence is false.
**Builds on:** [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §4 (`EventDetail`/`DetailSheet` — the surface this reaches rather than rebuilds), [0219](0219-a-day-is-a-place-you-can-see.md) §6 (what the read now holds), [0228](0228-the-quick-actions-are-one-list-and-a-commitment-can-be-settled.md) (the band this must not join, and why)
**Relates:** [0016](0016-plan-trip-modes-one-surface.md) / [0025](0025-trip-mode-edit-capability-tiers.md) (editing is de-emphasised in Trip, never disabled — a read is neither), [0029](0029-trip-mode-day-scope-gating.md) / [0040](0040-trip-mode-access-window-and-past-trip-archive.md) (the past day and the browsable archive, which is where this matters most), [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) §1 (why the `⋯` sheet is refused), [0028](0028-plan-violet-color-budget-dark-ready.md) (rule 4 — why the label is `--cta`)

## Context

The owner, with three screenshots of the running app — the Trip-mode day with `Jökulsárlón Zodiac Boat` expanded, and the same booking's read in Plan:

> There's a discrepancy between day view (trip mode) and plan day (plan mode), between how we display information about events and bookings. See how the plan day has a way to see info while trip mode doesn't.
>
> We should think how to do this in a way that's convenient and like not a main function probably, because trip mode should be more glanceable, different than plan mode.

Four things reading the code changed about the report, and the third turns a preference into a defect.

**1 · It is not "Plan has a read and Trip does not."** Both surfaces reach the trip's own content in one tap: `HostDocuments` → `HostTasks` → `HostNotes` render inside Trip's expanded card (`EventCard`'s `*Slot` props) and inside `DetailSheet` for Plan. What Trip cannot reach is exactly the half `DetailSheet` names `knowledge` + `facts`: the picture and the summary (ADR-0219 §6), the address, the duration, and the confirmation code. The gap is **the facts**, which are precisely the half the day row deliberately stopped printing.

**2 · The verb band cannot host the reach, and that is structural.** `event-actions.ts`'s own header: _"A quick action answers 'what do I do about this **now**'"_, and every entry is gated on `live(c) = c.today && !c.readOnly`. A row on tomorrow's day or on a past day gets `[]` and `EventActions` returns `null` — **no band at all**. Those are exactly the rows whose facts you want: tomorrow's pickup address, and the finished trip ADR-0040 promises is browsable. A read inside that band would be absent wherever it matters most.

**3 · ADR-0223 made a promise this surface does not keep.** It deleted the confirmation code from five surfaces on one mitigation, written twice. Grep the callers of `BookingDetail`: `screens/PlanDay.tsx` and `ui/IndexBookingsView.tsx`. The Trip-mode day view — the surface in your hand when somebody at a desk asks for the code — has **no path to a booking at all**. It went unnoticed because a HARD row's edit warning happens to print the code (ADR-0174 §8's carve-out); a **soft booked** row shows it nowhere in Trip mode.

**4 · ADR-0174 §6 already answered this question, and its answer expired.** _"No change to how the Trip-mode day card opens. It already expands and that expansion is the read."_ True on 2026-08-08. Since then ADR-0219 §6 gave the read a picture and a summary Trip has no way to show, ADR-0223 moved the code **into** the read, and ADR-0228's amendment moved `⋯` onto the face. This ADR is that sentence re-asked against what the read now holds.

## Decision

### 1. The rule

**In Trip mode the row opens what you DO. The read is one tap further, and it is the read that already exists.**

Not a second read surface, not a facts block copied into the card, not a new screen: the same `BookingDetail`/`EventDetail` Plan opens, reached from inside the panel the row already opens. The branch is the one `PlanDay.tsx` already has — a booked event routes to `BookingDetail` (ADR-0172 §1: a linked pair is one context), an unbooked one to `EventDetail`.

This keeps the difference the owner asked to keep. Trip mode's panel stays a doing surface with the group's own content under it; the knowing surface is the app's one read, unchanged and un-duplicated.

### 2. Where the reach lives — the read row

A full-width `.rd-row` inside `.wp-event-actions-in`, **after the verb band and the hard-edit warning, above `HostDocuments`**. That position is not arbitrary: it is the read surface's own sequence (knowledge → hard note → facts → documents → tasks → notes) with the facts compressed to one line, re-entered after the verbs because Trip mode is doing-first.

It says the **destination's name**, not a generic word: `להזמנה` on a booked row (the lifted hero's own string, `t.hero.toBooking`), `פרטים` otherwise. Under it, the one fact the row above cannot say — the address, one line, ellipsised. The way in is `<Icon name="caret" dir="left" />`, which is what `.map-know-more` already means by "through to another card"; **not** `NavArrow`, which is the app's back/route arrow.

**Measured** (360×640 and 390×844, both themes, read off the rendered DOM):

| container                         | card height | vs. today    | what it costs                                        |
| --------------------------------- | ----------- | ------------ | ---------------------------------------------------- |
| **א** today                       | ⁦393px⁩     | —            | no path to the facts at all                          |
| **ב** read row in the panel       | ⁦447px⁩     | **⁦+54px⁩**  | the row itself is ⁦54px⁩ (⁦44px⁩ without an address) |
| **ג** a fifth control on the face | ⁦393px⁩     | ⁦0px⁩        | ⁦26px⁩ of the title, at both widths                  |
| **ה** the facts inside the card   | ⁦557px⁩     | **⁦+164px⁩** | ⁦152px⁩ of `bk-facts`, copied                        |

The read row is ⁦54px⁩ with an address and ⁦44px⁩ without — on the floor, never under it — and a long address (`Nordurljosavegur 9, 240 Grindavík, Suðurnesjabær, איסלנד`) ellipsises at the same ⁦54px⁩ rather than wrapping.

### 3. Three containers drawn and refused, each for its own reason

- **A fifth control on the face (ג).** ⁦0px⁩ of height and ⁦26px⁩ of the title at 360 — 191 → ⁦165px⁩, i.e. ⁦13.6%⁩ of the name. The face already holds four targets (badge → map, face → open, `⋯` → Tier-2, chevron), and **ADR-0174 §4 refused exactly this addition on the Plan row for exactly this reason**. Also the wrong register: a face control is a main function, and the owner asked for the opposite.
- **A row in the `⋯` sheet (ד).** Free, and therefore tempting. ADR-0174 §4 already refused it, citing ADR-0138 §1's row menu as a list of **verbs**; the owner rejected the same shape once before, for notes (_"notes don't belong in a menu"_). A thing you open in order to **know** does not belong in a list of things you **do**.
- **The facts inside the card (ה).** ⁦+164px⁩ — and, by coincidence worth recording, the identical number ADR-0174 §4's mockup measured for "expansion in place" on the Plan row. It buys mode parity, which is the thing the owner asked NOT to buy, and it is a second rendering of `bk-facts`. If it is ever wanted, the route is the exported `Fact`/`LocationFact`, never a second list.

### 4. The sheet opens on a closed card

The read is a `Sheet`, so it lands over a card that is still open — and documents, tasks and notes then appear twice, once per layer. **The card closes when the read opens**: one line in the caller (`ctx.toggle`), no branch inside `DetailSheet`.

The alternative — suppressing the host sections in the sheet when it is opened from the day — is a per-caller branch inside the shared shell, which is the shape ADR-0094 is a retraction of. Refused.

## What rendering it found

- **A real confirmation code breaks the hard-edit warning onto two lines.** The stress row carries `#MEGAZIP-T141215488` — the code from ADR-0174 §8's own device report — inside the shipped `.wp-event-hard-warn`, and it wraps. It wraps rather than overflows, so it is not a defect; it is ⁦16px⁩ the card spends on a fact the read states properly as `קוד אישור`, and one more argument for where the code belongs.
- The file's first pass hand-rolled the `⋯` sheet and it rendered as one squashed line — the rule-8 failure a file that inlines the real CSS exists to catch, inside the file whose premise is that it does not invent markup.
- The way-in glyph was `NavArrow` and was wrong; see §2.

## Consequences

- `DayView.tsx` gains the `PlanDay.tsx` branch it does not have (`booking ? BookingDetail : EventDetail`) and one piece of state. No new component, no new overlay, no change to `DetailSheet`.
- The Trip-mode day view stops being the one surface where ADR-0223's mitigation is untrue.
- The open card grows ⁦54px⁩ — ⁦44px⁩ on a placeless row, ⁦0px⁩ while closed, which is every row you are not looking at.
- On a past day and on any day that is not today the read row is the **only** thing in the panel above the host sections, and that is the point (§2 / Context 2).
- `ui/domain/event-card.css` grows ~40 lines. Nothing else in the app changes.

## The two forks for the owner

1. **The row's density.** Shipped in the mockup as label + address (⁦54px⁩). Label only is ⁦44px⁩ and says less than the row above it; label + address + a two-line summary says "what is this" with no tap at all and inflates the panel on the surface that is meant to be scanned. The control is in the mockup's toolbar.
2. **Whether the card closes when the read opens** (§4), or the duplication is simply lived with as Plan effectively does.

## Rejected

- A fourth mark on the meta line ("there is a booking here"). ADR-0174 §8 closed that line to glyphs and no text, ADR-0028 has already spent its budget, and a booked row is nearly always hard — the lock on the when line says it.
- A picture in the read row. The badge already carries the photograph at ⁦0px⁩ (ADR-0219 §1), and the full hero is in the read.
- Making the badge's tap the reach. It is `מפה`, settled by ADR-0121 §8, and the map is the one destination it may have.
- A long-press anywhere. No hover, no discoverability, and nothing in this app teaches it.
