# Session 137 — Map panel, Phase 4: a night you are staying is not a night you are past

**Date:** 2026-07-27
**Branch:** `claude/map-ambient-stay-prominence`
**Build session, ADR written at its head** (the shape Phase 3 was scoped as — a mockup
cannot meaningfully express "remove a `saturate` filter", and a design session would
have produced a file for a two-line change). Executes **Phase 4**, branch (b), of
[session 135's triage](2026-07-26-session-135-map-panel-second-pass-triage-and-phasing.md).

## How the triage resolved

Session 136 answered #14 as **branch (b)** from the code alone: the hotel authoring
path does set `endDate`, so the middle days exist. This session confirmed it **against
a real two-night stay** — and the confirmation came the long way round.

The owner first reported the stay missing from the map _entirely_, on all three days.
That is a bigger failure than #14 and it briefly put the whole triage in doubt, since
(b) presumes the stay is on the map at all. It turned out to be a hotel with **no place
attached** — nothing for the map to pin. Once a place was added, the stay appeared on
every day it covers, ambient nights included, exactly as the derivation said it would.

So the triage stands, now on evidence rather than on a code read. The report is purely
about prominence.

That detour produced its own finding, recorded in the backlog rather than built here:
**a booking can be saved with no place and no surface says so.** See "Not done here".

## The change

**An ambient stay night renders at full strength.** ADR-0109 §5 had given a multi-day
stay two prominences — loud on its edge days, "a quiet ambient 'your base' row
(desaturated pin, ..., hatched-paper row)" on the strictly-middle days — and the build
spent that as a literal fade.

The owner's objection is exact, and it is about what the fade _says_. On this canvas
desaturation already means **behind you** — done, skipped, or simply passed. A stay you
are in the middle of is the opposite: it is the most current fact on the day, and the
one place you are guaranteed to return to that night. The same paint on both made it
read as finished.

**What still marks a night as ambient is what it lacks:** no number (`hasScheduleSlot`
requires `prominence === 'edge'`) and no clock or "what happens here" (`dayMeta` returns
nothing for it). That was always true; it is now the _whole_ distinction, which is why
the invariant below is load-bearing rather than incidental.

### What moved

| File                     | Change                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `ui/domain/map-pane.css` | `.map-pin.ambient .pin-b` (`saturate(.45) opacity(.8)`) deleted                                              |
| `ui/domain/map-pane.css` | `.ambient` dropped from the muted-number rule — it could never fire (an ambient night has no number to mute) |
| `screens/map.css`        | `.place.ambient, .place.skipped` **split**; skipped keeps the quiet treatment verbatim                       |
| `screens/map.css`        | `.ambient` dropped from the desaturated-badge rule and the muted-name rule                                   |

CSS only. No component, derivation, or constant changed.

### The trap, and the split

`.place.ambient` and `.place.skipped` shared **one** rule, deliberately, on the
reasoning that both mean "present but not a live commitment". Half of that was wrong,
and deleting the rule wholesale would have silently un-faded every skipped place too
(ADR-0117 §4). The rule splits; skipped is byte-for-byte unchanged, and there is now a
test that they no longer travel together.

### Deliberately unchanged

- **ADR-0054 is not overturned.** Its §4 already scopes "ambient" to how a span appears
  **on the day timeline/glance** — backdrop rather than a counted block — and states the
  axis is orthogonal to commitment. The Day view's ambient band is a teal-tinted card
  (`.day-ambient`), never a faded one; Home carries no band at all (ADR-0064 §A). The
  fade was a Map-side over-reading of 0054, not something 0054 asked for. Nothing
  outside the two map stylesheets changes.
- **ADR-0121 §6 needed no amendment.** Its ladder table never listed ambient, and both
  places it does mention ambient — "a pin with no position in the schedule gets no
  number" and the coincident-pin z-order — are still true.
- **`TIER_Z`.** Ambient still ranks below ideas. A middle night has no position in the
  day, so it should not outrank something that does, and z-order only decides which of
  two _coincident_ pins you tap. Revisit if a real trip puts an idea on top of a hotel.
- **The `ambient` class itself**, on both halves. It now carries no styles, which is
  ordinarily a smell — but the pin's tier class is asserted in `MapPane.test.tsx` and
  `map-pane.css` states the pin mirrors its `.place` counterpart, so removing the row's
  would break a stated symmetry. It earns its keep as the hook the new tests read.

## Tests

The paint is CSS and therefore a **human pass** — jsdom has no cascade, and saying so
is the point (ADR-0121 §13). What the suite can hold down is that the derivation still
tells the two states apart, and that the one distinction the amendment now rests on is
intact.

| Where                   | What                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Map.test.tsx`          | The middle night is marked `ambient` and **not** `skipped`                                                          |
| `Map.test.tsx`          | A skipped place keeps the quiet treatment the stay gave up (`skipped`, not `ambient`)                               |
| `Map.test.tsx`          | A **check-in** day is an ordinary row and is **numbered `1`** — the one thing ambient is not                        |
| `Map.test.tsx`          | All-days has no mid-stay night to mark, so the stay is one ordinary row                                             |
| `Map.test.tsx`          | (Phase 1, retained) A middle night takes **no number**                                                              |
| `Map.embedded.test.tsx` | The middle night pins as `PIN_TIER.ambient` with no `order`, and does not take a position from the day's real stops |

**Two assertions were written, passed, and then rewritten**, because they passed for
the wrong reason: `renderRow` reads prominence off the **active** day
(`allDays ? undefined : …`), so in all-days scope _no_ row is ever `ambient`, and
"expect not ambient" there is vacuous. One became an explicit statement of that
behaviour; the other was re-pointed at a stay whose check-in actually lands on the
active date. Worth recording — it is the exact failure mode the "assert across both day
scopes" rule is meant to catch, and it caught it.

## Not done here

- **The hotel-changing-day question**, raised in the same conversation: on a day with a
  check-out from one stay and a check-in to another, the two pins are same-hue,
  same-glyph, same-tier and differ only by their (chronological) number. Backlogged
  under Phase 4, **not** built, and deliberately **not** a pin change — ADR-0121 §6 took
  the 🔒 off the pin to free that corner for the number, the glyph slot is the category
  (ADR-0038), and a colour would spend ADR-0028's budget. The row already says
  `צ׳ק-אאוט` / `צ׳ק-אין` in words, and the live case is covered twice (the arriving stay
  is `nextDestination` and carries the amber cue; the departed one drops to `behind`).
  The uncovered case is a changing day viewed _ahead of time_. If it needs anything it
  is typographic emphasis on the existing tag — after a look at a real changing day.
- **A booking with no place** (the false-alarm detour above). `BookingSheet` validates
  the title and the dates and nothing else, so every non-transport type saves happily
  with no location, and `BookingDetail`'s `LocationFact` then simply does not render —
  no surface anywhere says the booking is placeless. Decided (surface it, do **not** gate
  the save) and backlogged to ride with Phase 5, whose audit this is the other side of.
- **The device pass.** Nobody has looked at the un-faded pin on a phone. It is the
entire visible content of this change.
</content>
