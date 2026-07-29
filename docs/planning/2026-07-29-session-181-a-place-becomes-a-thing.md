# Session 181 — a place becomes an event or a booking, and the code decides which (2026-07-29)

A **design session**: [ADR-0135](../decisions/0135-a-place-becomes-an-event-or-a-booking.md) +
[`mockups/map-place-becomes-v1.html`](../../mockups/map-place-becomes-v1.html). No feature code.
The epic's remaining product hole, named on the backlog since session 144: a place added from the
map can only ever be an **idea**.

The session's first design was rejected by the owner mid-session, and the second is better because
of what they said. Both are recorded, because the reasons generalise past this surface.

## 1. The first design was a command menu wearing a list's clothes

It hung two entries in the way-in block, `＋ אירוע` and `＋ הזמנה`, in the same grey `.map-ref` box
as the references. The verdict: **"cluttered and very amateur looking."**

Correct, and the diagnosis is reusable: a `.map-ref` says _this place is already there_ and ends in
a chevron because it **goes** somewhere; a create goes nowhere. Dressed the same, the expanded row
became four equal grey rectangles doing three jobs — a summary, a navigation list, and a command
menu. **A selected item gets one obvious action.** The references are navigation; a create is not
their peer.

The fix is one control, and it is one the tab already owns: `.map-addmaybe`, the pill `＋ אולי`
already uses for _make something out of this place_, on the same neutral `--cta`. What separates it
from a reference row is **shape and weight**, not a new colour.

## 2. "Maybe the code understands instead" is the better half, and it retires a question

The owner's second sentence was the real redesign: _"maybe the user doesn't choose one or the other
but the code understands instead."_

**"Event or booking?" is the app's question, not the traveller's.** It asks a human to know the
schema before they can say what they know. What they do know is _when_ it is, and whether they have
a confirmation number.

So `EventForm` gains one collapsed line, `יש קוד הזמנה?`. Empty → a soft event. Filled → a
`Booking` and its linked event. And the striking part is that nothing had to be invented for it:
**ADR-0011 already defines commitment as "a real commitment (flight, reservation code)"**. The
definition has been in the repo since ADR-0011; nothing had ever read it.

Three things fall out, and the third is the one I got wrong first:

- **The type derives from the form's own category**, not the place's — the category already leads
  the form (ADR-0109 §11) and already defaults from the picked place through the icon's group
  (ADR-0038). So the fix for a wrong guess is a control the form already has, and the derived
  statement moves live under the category pill.
- **The guess is stated, never asked.** A quiet line, not a second type picker — a picker being
  precisely what this removes.
- **"The code decides the entity" is _not_ "the code decides the kind".** My first draft had a code
  imply `hard`. It contradicts `bookingDefaultKind`, which ships and makes a restaurant booking
  **soft** — so that draft would have made every dinner reservation ripple-immune. The kind derives
  from the **type**, which derives from the category. Three links, each one already in the code.

The line is **create-only**: typing a code into an existing event is a _conversion_ (create the
booking, link the event, move its fields), which is a different operation with its own failure
modes, not a field.

## 3. The mockup drew four surfaces, and two of them because the owner asked

The first mockup drew the form as four fields and stopped at the map. Two corrections:

- **Draw the form in full** — the category `ChoiceGrid` and the `IconPicker` are in it and stay
  exactly as they are. Drawing four fields made the new line look like a far bigger share of the
  form than it is, which is a way of lying with a mockup.
- **Draw what a save produces.** The file now carries two frames: the surface being acted on, and
  the day screen / Index bookings screen the save lands on. `EventForm` is hosted by the Map, the
  day view and the Plan builder, so "app-wide" is a claim about screens and had to be shown.

## 4. What was measured, and the finding was not the one it looked for

|                                  | 390×844 · `half` | 360×640 · `half`         |
| -------------------------------- | ---------------- | ------------------------ |
| scroller                         | 267px            | **153px**                |
| selected row, as shipped (1 ref) | 142px            | 142px                    |
| …as shipped, **2 refs**          | 186px            | **186px — already over** |
| the rejected menu                | 234px (+92)      | 234px                    |
| **this design**                  | **198px (+56)**  | 198px                    |

The menu cost more than adding a whole row to the list (73px); one pill costs less. But the real
finding is the third line: **the block already overflows the `half` sheet on a small screen before
this phase adds anything.** So a `scrollIntoView({ block: 'nearest' })` on selection ships with the
control — a fix for something already true, arriving with the change that makes it common.

And the form's own cost, on the real `.modal-form`: **482px → 560px** with the line closed
(+78px, ~16%), 617px with a code. That +78px is paid by **every** host of the form, which is the
app-wide call priced rather than buried.

## 5. Five things the mockup got wrong first, and each one looked like evidence

Worth keeping as a list, because four are measurement traps and the fifth is new:

1. **The sheet and the collapsible both animate.** A panel reading one frame after a toggle printed
   `208px` for a viewport that settles at `153px`, and reported the open code line as costing
   **nothing**. Transitions are cut inside the frames now.
2. **`[hidden]` loses to any rule with its own `display`.** `.map-ref` is flex, `.modal-overlay` is
   a grid, the footer is flex — all hidden in name only.
3. **`.wp-collapsible` opens on an `.on` class, not on `[hidden]`.** The toggle flipped, the state
   was right, and it rendered a zero-height box. Caught by looking, not by reading the state.
4. **`.modal-card` is height-capped and scrolls**, so measuring it returned the same number for the
   closed line and the open one — a measurement that stops moving when the thing it measures grows.
5. **A frame inherited from an older mockup is stale markup.** The chrome started as a copy of
   `map-errand-v1`'s (session 163) and four pieces had drifted: the header's cluster is now a real
   `<button class="avatars-btn">` around `Avatar` (`.wp-av .av`, ADR-0133 §9); a pin's glyph lives
   inside **`.pin-b`**; `PlaceBadge` adds its mark **only when interactive**; and `ListRow`'s
   `.wp-listrow-right` is a **sibling** of the open button, not a child. **The `APP-CSS` manifest
   keeps the styles honest and does nothing for the markup** — a frame more than a session old has
   to be re-read against the components before it is trusted.

## Not done here

The build. The backlog line now carries the full scope, including the two pieces that are not
drawing: a standalone consume dispatch with `applySchedule`'s undo coverage, and
`usePlaceErrandReturn<EventFormDraft>('event', 'map', …)` on the Map, which now hosts the event form
(session 165's rule — a host that renders a form owes it a way back).

Phase 11 (booking phase labels on pins) was deliberately not taken: it is a legibility improvement
on something the row already states in words, and its real question is the amber budget.
