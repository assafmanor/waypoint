# The server had the parts and not the answer — ADR-0107, 2026-09-01

**Date:** 2026-09-01
**Subject:** one owner report on the shared page's clocks, the arithmetic that located it in three minutes, and the second surface the call-site count found.

## What came in

> _"I now see something much worse and concerning: The timezone derivation is simply wrong - see
> how plan day doesn't agree with the times. And how the durations don't add up correctly"_

Three screenshots: the app's day, the reader page, the PDF.

## The arithmetic came before the code, and it named the bug

Reading the screenshots against each other:

| row       | app           | sharing + PDF |
| --------- | ------------- | ------------- |
| TLV → VIE | `15:30–18:15` | `14:30–18:15` |
| VIE → KEF | `21:00–23:20` | `19:00–23:20` |
| check-in  | `15:00`       | `17:00`       |

Departures off by 1h and 2h; arrivals identical. Those two numbers are the two legs' own zone
shifts (`−1 ש׳`, `−2 ש׳`, both on screen in the app's card). **A departure that is wrong by
exactly its own leg's shift, beside an arrival that is right, is one thing and not several:**
both ends are being rendered in the destination's zone. Ten lines of `datetime` arithmetic
confirmed all five numbers before any source file was opened, which is what made the rest of the
session a repair rather than a hunt.

## Why the compliant code was the wrong code

The server resolved an event's clock with `currentZone`, and `currentZone` is right about a
different question. A crossing is stamped at the flight's **departure**, and `segmentZoneAt`
returns its destination from that instant on — deliberately, so a mid-flight clock reads where
you are going (ADR-0107 §8). Ask it what a departure's own clock says and it answers with the
far end. And it has no place rung by design, so a hotel whose door opens at 15:00 local, hours
before its guests land, resolves to whichever segment the itinerary says you are in.

ADR-0107's real resolver, `eventDisplayZones`, answers both correctly — per end, with the place
rung — and lived in `frontend/src/lib/places.ts`.

## The transferable finding

ADR-0197 §5's sweep had already promoted the zone **primitives** into `packages/shared/zones.ts`
so a notification and a row could not disagree. Its file header says, in as many words, _"two
implementations that agree today are how you get there"_. It left the **composer** behind.

So the server had every part of the answer, did not have the answer, and reached for the nearest
thing that type-checked. **A promotion that stops at the primitives leaves open the door it was
closing** — the composer is the thing consumers actually call, and it is the piece worth moving
first, not last.

## The count found the worse instance

Root `CLAUDE.md` says to count the call sites rather than assert what a derivation does.
`eventDisplayZone` had two readers. The second was the notification sweep, where `event-soon`
called it with no `atMs` — resolving at the event's own start, so _"your flight leaves soon"_
stated the departure in the city you had not reached. ADR-0197 §5 calls a reminder at the wrong
local time the one bug that gets the feature turned off, which made this the higher-stakes half
of a report that never mentioned notifications.

Fixing it was mechanical once measured, which is why it was taken here rather than filed:
`loadZones` already read the bookings and places in full and simply did not keep them; the select
needed two columns; and `span-edge`'s edge was already tagged `'start' | 'end'`, so the one
genuine semantic question answered itself. `eventZone` returning a **pair** is the part that
matters beyond this fix — it makes every caller say which end it means.

## Why the suites could not see any of it

Both suites had thorough clock coverage. Every fixture was single-zone, and the notification
stubs pass `crossings: []`, which falls through to the primary zone and makes every zone question
answer the same thing whatever the derivation does. **A stub whose crossings are empty is a clock
test that cannot fail.** That is now a backlog line, because the fixtures that still cannot fail
outnumber the two that were fixed.

## What was deliberately not done

No mockup: nothing about the layout changes — the same rows in the same places, with correct
numbers in them. And `common/event-zone.util.ts` was deleted rather than left with zero callers,
because its remaining risk was larger than its remaining value: the next person asking what zone
an event's time means would have found the wrong function first.
