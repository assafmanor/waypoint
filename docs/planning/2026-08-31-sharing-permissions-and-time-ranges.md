# 2026-08-31 — sharing permissions, time ranges, and the hole between two events

Four reports in one session, landing on two ADRs. Every one was drawn and measured before it
was coded, on the owner's instruction (_"Mockup whatever is needed, better safe than sorry"_).

## The reports, in the order they arrived

1. _"Today only admins are able to decide what's being shared - I think that non admins should
   be able to do that too, just not add more links, but they should be able to share a summary,
   full schedule. Maybe everything is made available by the admins, after they've created links
   for them."_
2. _"The pdf and live sharing currently only shows start times (except bookings and hard
   events) … whenever there's a time range, we should display it. That also includes flexible
   times like starting from.. Or until…"_
3. _"On the plan day and day view … it first shows the transit row, then the gap + שבץ button.
   This is the wrong order: the transit row shows 'take off at X to get on time', so it only
   makes sense that slotting should be before it, before the takeoff time."_
4. _"When there's a gap before a journey, it could show `יציאה עד X` instead of the exact
   leaving time."_

## The forks put to the owner, and the answers

**Do these need mockups?** Answered before drawing: the sheet and the ordinary event rows did
not, the stay's check-in and the A4 time column did. The owner overruled the split — _"Mockup
whatever is needed, better safe than sorry"_ — and drawing the two "obvious" ones paid: the peer
sheet's render is what showed the pinned `FULL` default producing two contradictory claims on one
screen, and the A4 file's measurement inverted the assumption it was written on.

**Do reports 3 and 4 change the shared page or the PDF?** Asked mid-session, checked rather than
answered from memory: **no**. Neither renderer has a free-time strip, a `שבץ` chip or a seam
(grep for `gap` in the PDF template returns only CSS `gap:` properties), and sharing's journey
line is `mode · minutes · km` with no leave-by at all — `dayJourney`'s is counted back from
_now_, and a shared page has no reader-relative clock. What **does** connect them is the word:
`עד` arrives on three renderers this session for one meaning, which is why it is one ADR
statement rather than two amendments.

**`עד` on every `יציאה`, or only with a gap?** The owner asked this directly. The answer is
**only with a gap**, and for a stronger reason than either of us had: `heroLeaveBy` **pulls the
leave-by forward** to `departAfterMs` when the buffer lands it behind the row it leaves from
(ADR-0206 §AJ2), so on that arm the instant is the **earliest** departure and `עד` would be
false rather than merely redundant. That makes it a correctness question, not a taste one. And
the gate cannot be `free.freeSeconds > 0` — the literal reading of "when there's a gap" — because
the day's first leg out of an ambient stay has no floor to clamp to, so its `free` is `null`
rather than zero and a free-minutes test would strip the word from the leg read first every
morning. The predicate is "was it clamped?", which `heroLeaveBy` already computed and discarded.

## What reading the code changed before anything was drawn

- **Report 1 is not a permission change.** `SharingService` already lets every member list, send
  and PDF a link; only create/rotate/revoke are `assertTripAdmin`'s. The sheet was hiding a
  control the API allows — and pinning `level` to `FULL` at the same time, which is what made a
  Summary-only trip tell its own travellers it was not shared.
- **The two sharing renderers already disagreed** about report 2, and the live page was the
  lenient one. A soft two-hour hike has printed `10:00–12:00` on the phone and `10:00` on paper
  since ADR-0213 §6 shipped.
- **The `hard` gate was masking a reversed range**, not preventing one: a week-long car hire is a
  booking, so hard, so paper printed `10:00–18:00`. Same defect as the `15:00–11:00` that got
  stays pulled out of the schedule, surviving in a second booking type.
- **Report 3 is not a reversal of §AH3** but the half of it that was never decided. §AH3
  separated the two lines and never asked which goes on top; `narrowGapForTravel` already ends
  the free window at the leave-by, so they were already chronological and simply drawn backwards.

## What the renders found that reading could not

- The peer sheet's chooser costs **+89.5px** of sheet body — the honest price of the fix.
- On the reader page the stay's clock **cannot** ride the stay's own line: `nowrap` + ellipsis,
  and in RTL the cut falls at the logical end, exactly where the clock sits. **275px of ink in a
  206px box** on a real hotel name, so the check-in vanishes with nothing saying it was there.
  Its own line costs 76 → 95px, and the second moment is free.
- **The A4 time column does not need widening**, which is the opposite of what that file was
  written to prove: `מ-10:00` is 34.75px and `עד 11:00` is 38.38px against `09:20–14:05`'s 55px.
  Paper's change is a deleted condition and no CSS.
- Measuring that needed a `Range` over the cell's contents, not `scrollWidth`: the cell is a grid
  item and stretches to its column, so the first render reported all six shapes as exactly the
  column width and computed the widest as `6262px`.
- Plan's seam is `display: none` at rest and `height: 0` during a drag, so report 3's swap is a
  claim about DOM order and `elementFromPoint` on that arm rather than about pixels.
- `a-shared-time-says-what-it-means-v1.html`'s first render was **11,941px tall**: `.sh-page`
  carries `min-height: 100dvh`, correct for a page a stranger opens and absurd inside fourteen
  360px frames on one document.

## A spec that was true under both rules

`itinerary-pdf.template.spec.ts` asserted "some rows carry a dash and not all of them", which is
satisfied by the old rule and the new one alike — so it would have stayed green while the
behaviour inverted. Replaced by one that names all four arms individually. Worth recording as the
shape rather than the instance: a spec written as a proportion rather than a case cannot fail when
the case changes.

## Where it landed

- [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) §AJ4 — reports 3 and 4.
- [ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s
  twelfth amendment — reports 1 and 2.
- Four mockups, all rendered in every theme × width with no console errors.
- Two backlog lines: the car hire's return time, and the deliberate non-decision to state free
  time on a shared page.
