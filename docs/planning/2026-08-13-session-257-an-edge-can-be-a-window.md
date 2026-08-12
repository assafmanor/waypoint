---
date: 2026-08-13
session: 257
kind: design
surface: booking form, day view, Plan day, Home hero
mockup: mockups/an-edge-can-be-a-window-v1.html
status: designed, awaiting owner approval (no ADR yet)
---

# Session 257 — an edge can be a window

A design session on hotel bookings whose check-in is a **range** rather than an
instant, and on the one thing the owner asked for by name: that the range must
not be the default shape of the form.

## The brief, in the owner's words

> _"hotel bookings that don't have specified check-in and checkout times, but
> it's a range of times. For example, check-in is between five PM to nine PM.
> […] usually people won't have a range, and they don't want it to be the
> default because it would be a little confusing. So I don't want the default to
> have both the check-in start and check-in end time. I want a separate click or
> something to enable this feature. So it won't be that prominent, but it will
> be available for anyone who wants to edit."_

## What reading the code changed, before anything was drawn

**The app already models a check-in as a range — it is just open at one end.**
[ADR-0171](../decisions/0171-a-time-can-be-a-floor-or-a-ceiling.md)'s
`edgeMeaning` derives `not-before` for a held span's start and `not-after` for
its end, so `15:00` on a check-in already means `[15:00, end of day]` and renders
`מ-15:00`. This is not a fourth axis: it is **closing the open end of a window
the app already draws**.

That reframing decided the scope with no type check. The control belongs to any
edge whose meaning is not `exact` — a hotel's two ends and a car hire's two ends,
both from `midSpan.kind === 'held'`.

## The forks put to the owner, and the answers

| fork                                                      | answer                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Scope: hotel check-in, both hotel ends, or any held edge? | **Any held edge.** One control, four hosts, gated on `edgeMeaning`, no `BookingType` branch.       |
| Storage: `Booking.details` JSON, or `Event` columns?      | **Two nullable `Event` columns** (`startWindowEnd` / `endWindowStart`).                            |
| Does a closed window regain a position in the day?        | **Yes, and still no map number** — §10a's own test is the width of the window; §10b's rule stands. |
| Do ordinary events get this?                              | **Model yes, form control gated** (see §4 below).                                                  |
| Past the ceiling and not checked in?                      | **It can be missed** — the first time a lodging edge can fail at all.                              |

**On storage.** ADR-0171 §2 rejected _storing the meaning_, and that rejection
stands: a window is a **datum, not a classification**, and nobody is asked to
classify anything — they optionally type a second number. That is the extension
seam §2 named and deliberately left unbuilt, arriving as data rather than as a
form question. Instants rather than `HH:MM` so a reception open until 01:00
works, and so ADR-0107's zone handling comes free. `Booking.details` was rejected
because ADR-0047 §1 makes the Event the sole time authority, and a manual
non-booking `lodging` event could never carry a window at all (ADR-0063 §4).

**On the owner's own extension.** Mid-session: _"maybe events should gain this
ability as well"_ — correct for the model, and it is **cheaper to allow than to
refuse**: `edgeMeaning` becomes "an authored window wins, else the profile", one
branch at the top of a resolver every surface already reads. The **form** does not
generalise for free, which is §4 of the mockup: an ordinary event already draws
`18:00–20:00` as a **duration**, and a window draws the same pixels meaning the
opposite. A held edge is immune because its row already carries a word
(`צ׳ק-אין`) and a check-in has no duration. So: build the mechanism generalised,
expose the control where it is unambiguous, and leave opening it as a gate rather
than a design.

One wording correction made in session: the owner described these as bookings
"not hard on time". Hard/soft is the **commitment** axis and nothing here touches
it (ADR-0171 §1 spends a paragraph on that guard) — a windowed check-in is still
`hard`.

## What the mockup established that the prose could not

[`mockups/an-edge-can-be-a-window-v1.html`](../../mockups/an-edge-can-be-a-window-v1.html),
rendered at 360 and 390 in both themes.

- **Both affordances are made of shipped primitives**, so the comparison is
  purely cost. Measured: the whole when-block is **156.5px** under א (a second
  `ValueToken` in the `.wf-line` that already exists) and **216.5px** under ב
  (`ChoiceDisclosure` + `Collapsible`) — **ב charges 60px to everyone who never
  uses the feature**, and that is ב drawn for one edge; symmetric it is two rows.
  א's chip is 31.8px tall with a **45.8px** touch reach through `ValueToken`'s
  `::after`, clearing ADR-0017's floor without the line growing.
- **§2b is the owner's correction, and it is a real trade rather than a
  preference.** The app's two row shapes answer "where does the time go"
  oppositely and deliberately: `.transition-row` is flex with `.tr-time` at the
  trailing edge (`flex: 0 0 auto` · `nowrap`), `.wp-event-face` is a grid whose
  areas are `'badge title' / 'badge when'`. For a single time it does not matter.
  A range is twice the width, and every pixel it takes comes off `.tr-title` —
  the one element that ellipsises. Measured against a long hotel name at 360: at
  the edge the title gets **165.5px** against **210.5px** with a bare time (the
  range costs the name **45px**); under the title the name gets the full
  **259px** and the row grows **55px → 75px**. Same shape as ADR-0171's own
  38→46px finding, five times the size. **Decided in session (owner): the range
  goes under the title, and a bare time stays exactly where it is** — so no
  shipped transition row moves, and the 20px is charged only on a row that
  actually has a window. Every other section of the file now draws it that way;
  §2b keeps forcing both placements, because without both there is no number.
- **§2c is Plan**, and it is in the file because forgetting it is the defect
  ADR-0171 §10e already had to fix once. Both modes read one `placeDayEntries`,
  so a closed window regains its position in **both**; `UnplacedCommitment` in
  Plan is the same row without the settle pair.

## The gap derivation — audited, and the audit is the finding

All six `edgeMeaning`/`isExactEdge` consumers were counted rather than assumed.

| consumer                          | test               | a windowed edge                                      |
| --------------------------------- | ------------------ | ---------------------------------------------------- |
| `day-joins.ts:143` (the gap)      | `=== 'exact'`      | transparent — **`day-joins.ts`/`gaps.ts` unchanged** |
| `place-usage.ts:734` (map number) | `isExactEdge`      | false — no number, as §10b requires                  |
| `day-entries.ts:137` (the split)  | `=== 'not-before'` | **must not park** — where the position comes back    |
| `TransitionRow.tsx:104`           | `=== 'not-after'`  | the `עד` prefix becomes the range                    |
| `glance.ts:457` (`נותרו היום`)    | `!== 'not-before'` | **the trap** — see below                             |

**`glance.ts:457` is the only consumer that names a flexible value instead of
testing `exact`.** A windowed check-in falls into its "counted until settled or
the day ends" branch, which is exactly the behaviour the ceiling replaces. Left
untouched, `נותרו היום` would keep counting a check-in whose window shut at 21:00
until midnight, silently contradicting the miss mark on the board. It becomes
"until settled, **its ceiling passes**, or the day ends".

**A window holds a position and still bounds no gap.** A position is an ordering
claim; a gap is a duration claim; the real check-in moment stays unknown. _Left
open by decision:_ §5's rationale is "a room from 15:00 consumes no particular
hour", which is true of a four-hour window and shaky for a thirty-minute one.
Any threshold is a guess, so the gap stays blunt-and-honest and the question is
recorded rather than solved.

## Two shipped inconsistencies the session exposed

- **`CHECKIN_GRACE_MIN = 120` is a stand-in for the ceiling nobody authored**, and
  it already disagrees with ADR-0171 §6: `hero-booking.ts` drops a check-in from
  the hero at floor+2h, while §6 keeps a floor pending until settled or the day
  ends. Nobody noticed because neither number is real. The grace survives only for
  an edge with **no** window.
- **A range is a bidi trap in one row and not the other.** `.tr-time` carries
  `dir="auto"`, and a digits-only run has no strong character, so `auto` falls
  back to `ltr` and a range is safe there. What breaks is `UnplacedCommitment`'s
  `.as`, which renders `${label} · ${when}` with **no `dir` at all** — a Hebrew
  word leads, the element is RTL, and `17:00–21:00` renders reversed. The rule is
  ADR-0118's own: isolate the **numeric run**, never trust the container.

## Session failings, recorded on purpose

Three, all caught by the render or by the owner rather than by review. They are
written down because each has a general form that will recur.

1. **A bidi claim asserted backwards, and the file shipped it in prose.** The
   first draft said `.tr-time` reverses a range; it does not. Both trap frames
   rendered identically, which is what exposed it. The general form: a bidi claim
   is a **render result**, never a deduction — and `dir="auto"` with no strong
   character falls back to `ltr`, which is the specific fact that was missing.
2. **A row drawn without comparing it to its sibling row shape.** The range went
   into `.tr-time` (trailing, `nowrap`) without measuring what it takes off
   `.tr-title`, and without noticing that `EventCard` answers the same question
   the opposite way. Caught by the owner. The general form: when a value gets
   **wider**, find every row shape that already renders that kind of value and
   measure the trade before choosing one.
3. **Plan mode was left out of the first draft.** ADR-0171 §10e exists _because_
   a previous build shipped a split in `DayView` only — it was read this session
   and its lesson still was not carried into coverage. The general form: any
   change to a day-surface derivation covers **Trip and Plan**, and the check
   belongs on the checklist, not on the reviewer.

## Status

**Nothing here is decided.** The mockup exists so the owner can pick א vs ב, the
§2b placement, and whether §4 ever opens the control to ordinary events. An ADR
is owed on approval; the backlog carries the item and the four build pieces.
