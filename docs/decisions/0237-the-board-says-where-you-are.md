# 0237 — The board says where you are, and a fix may supply the words

**Status:** Accepted 2026-09-20, on the owner's "build with your recommendations". **Built the same day.**
**Date:** 2026-09-20
**Reported:** the owner, two device screenshots one minute apart — _"There's some bug in the way the hero decides what to show for the now and for the next. See for example the way that the day view shows correctly that we're on the way (and the right time for arrival estimate, based on where we actually are), vs. the hero that doesn't."_
**Drawn in:** [`mockups/the-board-says-where-you-are-v1.html`](../../mockups/the-board-says-where-you-are-v1.html)
**Session note:** [2026-09-20](../planning/2026-09-20-the-board-does-not-know-it-is-moving.md)
**Amends in place:** [0207](0207-a-fix-may-withdraw-a-claim-it-may-not-make-one.md) §2 and §4 ·
[0211](0211-a-gap-has-a-character.md) §3, §5 and its build log §1 ·
[0206](0206-a-travel-time-belongs-between-two-points.md) §AF3.
**Constrained by** [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §12 — no third slot — and
[0028](0028-plan-violet-color-budget-dark-ready.md) rule 4.

## Context

At ⁦17:07⁩ on an Iceland driving day the day view drew the leg into `Kolgrafarfjörður Viewpoint` as
in progress — `נסיעה · ~3:26 שע׳` over `בדרך · נותרו ~1:12 שע׳`, the remainder scaled by a device
fix. The board, one tab away at the same minute, read `פנוי · זמן חופשי · עד 17:18` with
`11 · דקות · ליציאה`.

**Four causes, and only the first is a design question.** Each is recorded because three of them
are invisible in the diff that fixes them.

1. **The board had no journey slot at all.** `heroTravel` is built in `Home.tsx` — mode, duration,
   `בדרך`, `נותרו`, the leave-by, the tone — and handed to exactly one consumer, `HeroLift`.
   `Board` has no `travel` prop. The collapsed card could not say what the day view said however
   correct every derivation under it was, so the one surface you read from a moving car said less
   about the drive than the one you have to open.

2. **A fix could withdraw a claim here and could not supply one.** `gapCharacter` was passed
   `onWay` — the `בדרך` device MARK — and never `stance`, which the same screen computed ⁦600⁩ lines
   above and spent only on `positionAnswered`. So `GAP_CHARACTER.ON_THE_WAY` existed from ADR-0211's
   first commit and **nothing but a human press could reach it**: an `en-route` fix deleted the
   leave-by tile and the read fell through to `open`. ADR-0207 §2's asymmetry is right and what it
   left standing here was the loudest false statement on the card, not a safe silence.

3. **The fix expired after two minutes and nothing re-asked.** `useGeolocation` is per-component
   one-shot state and Home requested once — its effect fires only while `geoStatus === 'idle'`, and
   after a success the status is `granted` forever — against a `POSITION_FRESH_MS` of ⁦2⁩ minutes.
   Tabs mount and unmount, so swiping to יום-יום mounted `DayView` with a **fresh** fix. That is the
   whole of "the day view knows and the hero doesn't", and it was never about the hero: every
   position read on the board was dead from two minutes after it opened.

4. **The two surfaces measured different legs**, which no stance disagreement explains — see §5.

## Decision

### 1. Between two stops, the thing that is happening is the journey

The board's now-slot answers in this order: an event in progress → **the journey you are on** → the
character of the gap. The second was missing, and it is most of an Iceland day.

Everything below lands in slots that already exist. **Measured: the board is ⁦292px⁩ in every arm —
the shipped one, the on-the-way one late, the on-the-way one on time, and the arrived one — so this
costs ⁦0px⁩**, with zero new controls and two declarations of CSS.

**What this does not re-open.** ADR-0211 §1 option א׳ — the destination becomes the now point and
`הבא בתור` moves on — was drawn on 2026-08-29 and rejected on cost (⁦+20px⁩, the countdown tile off
the screen, `אחר כך` pulled into ADR-0160 §12's Day-tab competition). The shipped split stands: the
destination is named once, in `הבא בתור`, and the now-slot says where you are.

### 2. A fix may supply the character — which is ADR-0207 §2 amended, not reversed

§2 says a fix may withdraw a claim and may not make one. The asymmetry was written against
**assertions about a person** — `אתם באיחור`, `יוצאים` — and applied to the whole surface, which
is how it came to forbid the one statement it should have licensed: a fix that has just deleted
`זמן לצאת` knows something, and leaving `זמן חופשי` in its place is not silence, it is the reverse.

So the closed set gains one member and one door:

| character    | stands on                                                | label · title    |
| ------------ | -------------------------------------------------------- | ---------------- |
| `arrived`    | an `arrived` fix on the live leg, before the stop starts | `כרגע` · `הגענו` |
| `on-the-way` | the `בדרך` mark **or** an `en-route` fix                 | `כרגע` · `בדרך`  |

**`arrived` is first in the set**, which is `travelStance`'s own order for its own reason: being
where you are going is the more specific fact. It has to outrank the mark, because a `בדרך` pressed
half an hour ago has since been answered by arriving — and ADR-0207 §2 already withdraws the mark
on that stance. This is that withdrawal reaching the words.

**`on-the-way` is one character with two kinds of evidence.** The board is not obliged to say how
it knows.

**`at-origin` is deliberately not a character.** The traveller is where the plan says, which is what
`open` and `due-out` already describe; what it earns is the `עדיין כאן` mark on the journey line,
which is §2's own spend and unchanged.

**Both wear teal** (rule 4). `arrived` is the clearest case the hue has: the fix says the traveller
is at a particular place. It is also why `due-out` staying amber is not an inconsistency — that
state is a clock with no position behind it, and this one is a position with no clock in it.

### 3. The journey's numbers land in the meta slot ADR-0211 §5 opened and never spent

`on-the-way` rendered a label and a title and nothing under them, because the only thing that could
reach it carried no numbers. A fix does: `remainingTravelSeconds` answers how much road is left, and
the clock plus that answers when you get there (`heroArrival`, beside `heroLeaveBy` for that
function's own reason — the two elevations must not be able to disagree about a journey).

`נותרו ⁦~1:12⁩ שע׳ · הגעה ⁦~18:19⁩`, in `.wp-board-now-meta`, ⁦17px⁩, ⁦147px⁩ of ink in a ⁦290px⁩ box at
⁦360⁩. Both hedged, because both are a routed estimate scaled by a crow fraction — **still never a
re-route from the live position** (§1 of ADR-0207, untouched: it breaks ADR-0205 §4's place-keyed
cache and buys a number that is stale a step later).

**Absence is the ordinary answer** (§D4), and a `בדרך` mark with no fix is exactly it: somebody who
says they are moving has told the app where they are and not how far along, so the board says what
it knows and stops.

### 4. The arrival is a claim about the JOURNEY, and the lateness about the NUMBER

When the ETA lands after the point's own start, the arrival takes `--miss` ink and the tile says
`49 · דקות באיחור · להגעה` — ADR-0208 §1's three-part slot with a third referent, and
`t.board.lateBy` verbatim.

**The ink is on the arrival alone.** Painting the line said the driving was late, which is not a
thing that can be true; what is late is where you land. Found by rendering.

**The meta and the tile are not one fact twice.** The meta says WHEN you land, the tile says BY HOW
MUCH you are past the start — the `due-out` precedent exactly, where the title carries the state and
the tile carries the number. ADR-0211 §8's "would say it twice" was about a title restating a
countdown and still holds for everything it was written about.

**And only where the start is a deadline** (ADR-0206 §AI1's gate, read the same way the leave-by
reads it): a check-in's ⁦17:00⁩ is the hour the door opens, so nothing arrives late to it and a red
tile counting against one would be lateness for nothing.

`אתם מאחרים` and `יוצאים` stay refused (ADR-0208 §Z5 M4). A fix knows where a device is, not what
the travellers are doing, and that does not weaken because there is now a sensor.

### 5. The tile counts the road — §Z1's swap, a third time

Today the tile counted to the event: `23 · דקות` while ⁦72⁩ minutes of driving were left. That is the
same class of statement ADR-0206 §Z1 replaced when leaving became the live question, so it takes the
same mechanism — one tile that changes what it counts to, never a second box. `1:12 · שעות · לדרך`.

This closes the open backlog line from 2026-08-05 about what the board's countdown means inside a
journey.

### 6. Three things the build found that the drawing could not

- **`arrived` gets no meta line.** The mockup drew `מתחיל ב־17:30` under it; the next row says that
  clock ⁦40px⁩ lower and the tile counts to it, so a third printing is the duplication ADR-0214 §3
  took off this card once already. Cut.
- **The badge stops repeating the title** — amending ADR-0211's build log §1. That log kept
  `on-the-way` swapping the badge to the gap's own title _"because there the swap is the shipped
  transit costume rather than a repetition"_, which was true while the title had nothing under it
  and false the moment the journey's numbers landed below it: rendered, `בדרך` printed in the badge
  and again in the title ⁦85px⁩ apart. The **blip** stays teal — that is the live mark, not the word.
  `in-transit` keeps its word, because there the badge says the MODE (`בטיסה`) and the title says
  the flight: two facts, not one twice.
- **The free-time ceiling stops printing while you are moving** — amending ADR-0211 §5. `until` was
  unconditional on the character, which was invisible while `on-the-way` drew nothing else: the
  shipped card printed `כרגע · בדרך` over `עד 14:15`, a free-time ceiling for somebody who has
  already left. `due-out` excluded itself by arithmetic and nothing else did.

### 7. The fix is asked for again while the leg is live — ADR-0207 §4 amended

§4 rejected `watchPosition` on battery and wrote that a one-shot _"buys accuracy only while the app
is open and in front of you, which is when a one-shot already works"_. It does not: `useGeolocation`
asks once per **mount**.

`useLiveFix` is the mount-time effect Home and `DayView` each held a copy of, generalised (rule 8 —
the refresh is the reason a third would have been written), plus a re-ask every
`POSITION_REFRESH_MS` while a leg is live and the screen is visible, and one immediately on
`visibilitychange`. Still one-shot, still not a subscription, still gated on
`permission === 'granted'` so no surface ever prompts (§3, unchanged). `POSITION_REFRESH_MS` is ⁦75s⁩:
under the freshness bound with room for a slow fix to land.

**No shared store, and the reason is structural rather than a shortcut.** Tabs mount and unmount, so
the two surfaces are never on screen at once and cannot be seen disagreeing; hoisting
`useGeolocation`'s state would also make the Map's own `locating` chip and prompt machinery respond
to a refresh it did not ask for. `active` is the leg, so a board with no journey in front of it
costs nothing at all.

### 8. An hour the door opens is not a position — ADR-0206 §AF3 amended

**This is cause 4, and it is the whole of the reported card's arithmetic.** `travelOrigin` reads
"the last thing that STARTED" as where the plan left you. Tonight's hotel checks in at ⁦16:00⁩, so
from ⁦16:00⁩ it was the latest started row on the day and the board measured the evening's drive out
of a bed nobody had reached: ⁦7 דק׳⁩ against the day view's ⁦3:26⁩ out of the stop they were actually
driving from. `17:30 − 7 − TRAVEL_BUFFER_SECONDS` is `17:18`, and `11 · דקות · ליציאה` follows.

The day view never had the bug because its journey chain is built from `dayEvents`, which drops
ambient spans before it starts.

**§AF3 found this row through the FLAG and fixed the flag.** Its own note says a stay _"that is
simply the latest thing to have started — every check-in evening has one"_ answered `isStay: false`
and handed `legDepartAfterMs` a check-out days away. That repair was right and did not go far
enough: the row is not the origin at all.

**The rule is `isExactEdge(event, 'start')`**, the predicate both surfaces already share for the
mirror question — whether an ARRIVAL is a deadline worth counting back from (§AI1). The same
reasoning read backwards: a check-in's ⁦15:00⁩ is when you MAY be there, so the clock passing it says
nothing about whether you are. Today it answers `not-before` for exactly the held spans
(`midSpan.kind === 'held'`), which is why it is the rule rather than a `lodging` test: a car you
collect at ⁦09:00⁩ is the same floor as a room you take at ⁦15:00⁩.

**The bed still reaches the function** by the two doors built for it — `wokeIn` and `sleepsIn`,
handed in deliberately, dated, and bounded by ADR-0211 §4's waking window. That is the difference
between a position the plan is sure of and one the clock merely walked past.

## Consequences

- One derivation, two elevations, **seven** characters. `t.board.gap` is a keyed record, so the
  seventh had to say what it prints or the build stops.
- `BoardGap` gains one optional field. `Board` still decides nothing: the screen derives the
  character, the numbers and the lateness, and the board draws them.
- **Height:** ⁦0px⁩ in every arm, measured off the mockup's own DOM at ⁦360⁩ and ⁦390⁩ in both themes.
  Two CSS declarations, both reusing shipped values (`#f0a0a0` is the brightened `--miss` the
  shut-window label and the countdown's passed arm already use; the dimmed dot is `.hero-trv .sep`).
- **A contract test pins what the report was about**: `board-and-day-one-leg.test.ts` asserts the
  board's origin derivation and the day's journey chain name the same leg on the reported day, on a
  settled stop, across a placeless stop, and — the repro — on a day with tonight's bed in it.
- Verified: `pnpm typecheck` and `pnpm build` green, the full frontend suite at **5,918** tests
  across **322** files, with new specs on `gapCharacter` (8), `heroArrival` (7), `useLiveFix` (7),
  `Board` (4), the Home seam (9) and the two-surface contract (5).

## Alternatives considered

- **The destination becomes the now point** (ADR-0211 §1 option א׳). Rejected there on cost, and
  nothing here revisits it: §1.
- **`נותרו` alone, or `הגעה` alone, in the meta.** `נותרו` answers "how much longer" and makes the
  reader compare it against a `17:30` ⁦20px⁩ away to learn the one thing the read exists to tell
  them; `הגעה` alone drops the number you act on while still driving. Both fit (⁦147px⁩ in a ⁦290px⁩
  box), so the cost argument for choosing one never arrived.
- **The lateness in words in the meta** (`הגעה ~18:19 · באיחור 49 דק׳`). Drawn; it wraps to a second
  line at ⁦360⁩ and spends the tile's job on the meta.
- **A `.tlabel.missed` mark on the next row's clock** instead of the tile. Drawn. It says the START
  is gone rather than that you are arriving after it, which is a weaker version of the same fact and
  leaves the tile counting something irrelevant.
- **Doing nothing on `arrived`** (the shipped behaviour — it falls to `open`). Honest and flat: it
  spends the one minute the fix is most certain about saying `זמן חופשי`.
- **Promoting the next point to `now` when a fix says you are there.** Refused. The plan says
  ⁦17:30⁩, `deriveNow` is the one resolver, and a fix is not grounds to move an event.
- **Inferring `on-the-way` from a passed leave-by with only a drive between you and the next stop.**
  Put to the owner and refused by them: it is a claim the app cannot back, and it is exactly the
  shape ADR-0208 exists to stop.
- **`watchPosition`**, and **hoisting `useGeolocation` into a shared store**. §7.
- **A `lodging` test in `travelOrigin`** instead of the edge's meaning. §8 — it would have left the
  car hire wrong and said nothing about why.
