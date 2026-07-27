# Session 136 — Map panel, Phase 1: the tab tells the truth

**Date:** 2026-07-27
**Branch:** `claude/map-phase-1-scope-and-references`
**Build session.** Executes Phase 1 of
[session 135's triage](2026-07-26-session-135-map-panel-second-pass-triage-and-phasing.md):
items **#10, #9, #4, #13, #8**, plus the **#14 triage** (a lookup, no build).
Read: `frontend/CLAUDE.md`, ADR-0121 §8, ADR-0110 §4, ADR-0109 §1/§2.

Five fixes, no new surface and no new mechanism. Four are defects against ADRs that
already said what should happen; the fifth is a one-line reversal the owner asked for.
Everything below was re-verified against the code before it was touched — the triage
note was written a few commits earlier, and every root cause it named still held.

## What changed

### #10 — the day strip's tap clears `כל הימים` as an intent

`onSelectDay` was literally `setActiveDate`, and the Map inferred "a day was chosen"
by watching `activeDate` **change**. Those are different rules, and the gap is the case
that matters most: **tapping the day you are already on writes the same date**, nothing
changes, and all-days stayed on. Worse, `allScope` deliberately suppresses the filled
selection while all-days is on — so the already-active pill is the one that _looks_
unselected, and therefore the one you tap. The strip's most obvious way out of
`כל הימים` did nothing at all.

The signal is now stated where the tap lands, not inferred downstream:
`useSelectDay()` in `state/map-scope-state.tsx` clears all-days and then sets the date.
It is composed in that file for the same reason `useShowPlaceOnMap` is — one surface
telling the Map tab something, and the Map's scope already lives there. `App.tsx`'s
`Shell` swaps `const onSelectDay = setActiveDate` for `useSelectDay()`; `DayStrip`
itself is untouched, which matters because it is shared with the Day view.

The `activeDate`-changed effect in `Map.tsx` **stays**: arriving on a different day
from elsewhere (a `daySelectTarget`, a deep link) must still narrow. It is now the
secondary path rather than the mechanism.

### #9 — a linked booking is two ways in, not one

`refEntriesFor` did `if (booking) return …`, which made the event branch unreachable
for every booking-linked reference — against ADR-0121 §8's "one entry per in-scope
reference". `placeRefs` emits a single `PlaceRef` carrying **both** ids, so the screen
was silently choosing for you, and choosing away the half that holds _when it happens_.

Now a `flatMap`: the booking entry leads (it holds the code, the notes, the documents —
what a traveller standing at the place wants first), the event entry follows (its day).
Keys are suffixed with the kind so the pair is stable in React. A reference resolving to
neither emits nothing rather than a button with an empty label — the one behaviour
difference beyond the fix, and it cannot happen on a consistent snapshot.

### #4 — a pin tap raises the sheet, mirroring the row tap's drop

The row→pin path lowered `full`→`half` ("focusing a map you cannot see is useless").
The pin→row path had no matching raise: it called `scrollIntoView({ block: 'nearest' })`
and left the sheet where it was. At `peek` that is a ~116px lip, so the row it just
selected was behind the sheet — the list was scrolling a viewport nobody could see.

`select()` now raises `peek`→`half` before the deferred scroll, and the scroll became
`block: 'center'`. The two are a pair: `nearest` on a row already barely on screen is a
no-op, so centring is only honest once there is room to centre into. The rest of the
axis is untouched — a pin tap at `half` or `full` leaves the height alone, because
nothing is hidden there.

### #13 — the pin's number, on its row

`buildPinOrderIndex` already computed the number and already handed it to every pin;
`PlaceRow` simply never received it. So the split showed a numbered canvas above an
unnumbered list, and the number read as belonging to the map rather than to the place.

`orderIndex.get(usage.placeId)` is threaded into `PlaceRow` and rendered on the
**existing** `.map-badge` as `data-order` + a `::before` — no new element beside the
badge, no new token. The CSS is `.pin-n`'s recipe verbatim (same corner, `--ink` on
`--card`, mono, the same 15px stamp), because the point is that it is _one number shown
twice_, not a second treatment that happens to agree.

Both invariants survive by construction, and both are now asserted:

- **A filter never renumbers.** The index is built over the whole scoped set before any
  chip, so `1, 3, 4` is correct and says something is filtered out.
- **A row with no position in the schedule has no number** — a ghost, an idea, an
  ambient stay night. The attribute is absent, so the selector doesn't match.

One thing the number now explains that it didn't before: a **coordless** row holds its
place in the sequence (it always did — `buildPinOrderIndex` doesn't filter on coords),
so the gap on the canvas where it has no pin is legible from the list.

### #8 — both modes open day-scoped

`setAllDays(mode === 'plan')` → `setAllDays(false)`. Still keyed on `mode`, because a
mode switch is a context reset. Recorded as an amendment to ADR-0109 (which is where
the mode pivot is actually written — §1 and its "All days" bullet; the triage table's
"§2" pointer was one section off), with the day-1 consequence stated: pre-trip,
`activeDate` is today clamped into the trip range, so **Plan opens on day 1** with
`כל הימים` one tap away. ADR-0110 §4 restated the by-mode default, so it carries a
pointer to the amendment rather than being left stale.

One shipped test encoded the old default (`Plan defaults to all-days, where connecting
every day would be spaghetti`) and is inverted rather than deleted: Plan now draws the
day connector on open, and **widening** to all days is what drops it.

## #14 — the triage, answered: **branch (b)**

The question was whether a multi-night hotel is missing its middle days because the
authoring path never sets `endDate` on the linked event (**a**), or because the ambient
treatment is too quiet to register (**b**).

**The authoring path is correct. It is (b).** Traced end to end:

1. `isSpanType` includes `BOOKING_TYPE.HOTEL` (`ui/BookingSheet.tsx:67`), so a hotel is
   authored through **one** booking with a `WhenField variant="span"` — check-in →
   check-out — not as two separate events.
2. On save, `buildSpanSeed` (`lib/booking-edit.ts:148`) sets
   `endDate = endParts.date` whenever the check-out day differs from the check-in day.
3. `bookingEventFields` (`packages/shared/src/booking-event.ts:39`) passes `seed.endDate`
   straight through, and both the server (`events.service.ts:84`) and the client's
   optimistic mirror persist it.
4. `lodging.ambientWhenMultiDay` is `true` (`packages/shared/src/icons.ts:237`), so
   `isMultiDay` + `isAmbient` hold, and `spanDays` (`lib/place-usage.ts:142-158`) emits
   a middle-day `DayUsage` with `prominence: 'ambient'`.
5. `placePinTier` returns `PIN_TIER.ambient` for it, which **is** pinned
   (`saturate(.45) opacity(.8)`) and **is** framed by the camera, and the row renders
   with `.place.ambient`.

So the stay genuinely is on every day it covers, as a row and as a pin, on the normal
authoring path. What the report is about is prominence — **Phase 4 takes branch (b): a
design session first** (what an ambient middle day should look like as a pin and read as
in a row, against ADR-0054/0063/0121 §6), then a build.

**Two caveats to check against the owner's real trip before that design starts**, because
each produces the same symptom from a different cause and neither is (b):

- **An open-ended stay has no span.** `buildSpanSeed` returns `endDate: undefined` when
  the check-out field is empty (`splitLocal` yields nothing), so a hotel saved with only
  a check-in is a single-day event with no middle days at all. Nothing to make louder.
- **An unlinked hotel booking has no day at all.** The dev seed's `bk-hotel`
  (`backend/prisma/seed.mjs:80`) is exactly this: a hotel booking with **no linked
  event**, so its place carries no day facet and surfaces only under all-days. If the
  hotel was added from the Index without a check-in/check-out, that is what you'd see,
  and the fix is authoring, not prominence.

Phase 4's own invariant is unchanged and is now guarded by a test here: an ambient day
stays **unnumbered**, because giving it a schedule slot would renumber every real stop.

## Tests

`frontend/src/screens/Map.test.tsx` (the list-only, no-build-config path) and
`Map.embedded.test.tsx` (the split, pane stubbed). Both pin the clock with
`setSimulatedNow` and assert **across both day scopes** — the rule that exists because
an ordering bug survived three sessions behind day-scoped-only tests.

| Item | Where                                   | What it holds down                                                                                                                                 |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| #10  | `Map.test.tsx`                          | Choosing the **already-active** day leaves all-days (`setActiveDate` called with the same value, scope hint flips); tapping again stays day-scoped |
| #8   | `Map.test.tsx`                          | Plan opens day-scoped, and widens on the chip                                                                                                      |
| #13  | `Map.test.tsx`                          | Numbers in day order, day scope **and** all-days; a filter leaves gaps and never renumbers, in both; an idea and an ambient middle night take none |
| #13  | `Map.embedded.test.tsx`                 | Row and pin carry the **same** number in both scopes; a coordless row keeps its place in the sequence                                              |
| #9   | `Map.test.tsx`, `Map.embedded.test.tsx` | A linked booking yields exactly `[booking, event]` in both scopes; an unlinked booking still yields one                                            |
| #4   | `Map.embedded.test.tsx`                 | A pin tap at `peek` raises to `half` and centres the row (both scopes); at `half`/`full` the height is left alone                                  |

#4 is in the embedded file rather than `Map.test.tsx` because the sheet only exists
when there is a map: `Map.test.tsx` runs with **no** build config on purpose, and that
graceful-absence path has no pin to tap. The pairing is the one `frontend/CLAUDE.md`
describes; the number (#13) is asserted in both files precisely because it must be true
on the list-only tab too.

`Element.prototype.scrollIntoView` is stubbed in the embedded file (jsdom has no layout
engine) so the deferred scroll's shape can be asserted rather than assumed.

Full suite green: 1245 tests, 106 files.

## Not done here

- No camera work (#11/#5/#15 are Phase 3, and share one zoom constant).
- No layout work (#1/#2/#3 are Phase 2 — a design session first, phone in hand).
- Nothing built for #14. The triage above decides its shape; the build is Phase 4.
- The rendered canvas was **not** looked at. Everything above is asserted through the
  suite or read off the code; the pixels remain a human pass (ADR-0121 §13).
