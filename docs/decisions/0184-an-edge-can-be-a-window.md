# 0184 — An edge can be a **window**, and closing it is what gives it a position

**Status:** Accepted (owner sign-off 2026-08-13), **and built the same day**.
**Date:** 2026-08-13
**Design reference:** [`mockups/an-edge-can-be-a-window-v1.html`](../../mockups/an-edge-can-be-a-window-v1.html) — the two affordances priced against each other (§1), the day's placement (§2), the row's own placement (§2b), Plan (§2c), the hero's four states (§3) and the window-vs-duration collision (§4). Every measurement quoted below is read from that file's live DOM at 360px.
**Session note:** [2026-08-13 session 257](../planning/2026-08-13-session-257-an-edge-can-be-a-window.md).

**Extends** [0171](0171-a-time-can-be-a-floor-or-a-ceiling.md) — this is the seam its §2 named and deliberately left unbuilt, arriving as **data** rather than as a field. Its §1, §5, §6, §7, §10a and §10b all hold; §10a's own test is what decides §4 here.
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (a windowed check-in is still `hard` — the window is what the number MEANS, not whether it can move), [0047](0047-booking-event-linkage-and-notes.md) §1 (the Event stays the sole time authority), [0063](0063-category-time-behaviour-profile.md) (the profile still answers for every edge nobody has authored), [0107](0107-per-place-timezones-and-multi-zone-time.md) (a window bound is an instant, so the display-zone derivation reaches it for free), [0118](0118-numbers-in-hebrew-bidi.md) (§7), [0150](0150-a-form-refuses-at-the-field.md) §8 (the impossible bound is prevented, not refused), [0177](0177-a-when-reads-as-a-sentence.md) (the affordance is one more `ValueToken` in a line that already reads as prose).
**Answers** the owner's brief of 2026-08-12: a hotel whose check-in is a range.

## Context

> _"hotel bookings that don't have specified check-in and checkout times, but it's a range of times. For example, check-in is between five PM to nine PM. […] usually people won't have a range, and they don't want it to be the default because it would be a little confusing. So I don't want the default to have both the check-in start and check-in end time. I want a separate click or something to enable this feature. So it won't be that prominent, but it will be available for anyone who wants to edit."_

**Reading the code reframed the ask before anything was drawn.** ADR-0171's `edgeMeaning` already derives `not-before` for a held span's start and `not-after` for its end, so `15:00` on a check-in **already** means `[15:00, end of day]` and already renders `מ-15:00`. A check-in has always been a range in this app. What it has never had is the **other bound**.

So this is not a fourth axis and not a new primitive. It is **closing the open end of a window the app already draws** — which is also what settles the scope with no type check.

## Decision

### 1. A window is the closed form of the two flexible meanings

`TimeMeaning` gains `window`, and it is derived exactly like the other three:

```
exact       the instant IS the commitment
not-before  a floor, open on the side you act
not-after   a ceiling, closed on the side you act
window      BOTH bounds known, and neither is the moment
```

**An authored window wins over the profile**, and that is the whole of the resolution change — one branch at the top of `edgeMeaning`, which every time-aware surface already reads:

```ts
if (windowBoundOf(event, edge) != null) return 'window';
```

**This is not the per-event authoring question ADR-0171 §8 refused.** That refusal was about asking somebody to _classify_ the time they just typed for a museum. Nobody is asked anything here: a second number was typed, and **having one IS being bounded**. The classification is the data's shape, not a question. `ICON_TIME_PROFILE`'s explicit `edges` remains the seam for a MODE that disagrees with its category, and remains unbuilt.

### 2. The control is opt-in, costs one token, and is gated to flexible edges

**Affordance:** a second `ValueToken` in the `.wf-line` that already exists. `TimeField` **is** the affordance — it already draws itself as a dashed muted token while empty, already opens a panel, and already offers removal in that panel's footer through `onClear`. So the feature adds no mechanism, and **no new app CSS at all** on the form.

**Measured, at 360px:** the whole when-block is **156.5px** with this and **216.5px** with the `ChoiceDisclosure` row that was drawn beside it — the disclosure charges **60px to everyone who never uses the feature**, and that is it drawn for one edge; symmetric it is two rows. The token is 31.8px tall with a **45.8px** touch reach through `ValueToken`'s `::after`, clearing ADR-0017's floor without the line growing.

**Gate:** `edgeMeaning(…) !== 'exact'`, asked of the shape being edited. No `BookingType` branch — a hotel and a car hire both offer it because both are `held`; a flight never does. A booking with no span has no edge to widen.

**The impossible bound is prevented rather than refused** (ADR-0150 §8): `TimeField` gains `maxTime` as `minTime`'s mirror, so a start window offers nothing before its floor and an end window nothing after its deadline. A form that cannot express the mistake needs no error for it.

### 3. Stored, as two nullable instants on the Event

`Event.startWindowEnd` and `Event.endWindowStart`. This is the **first stored field ADR-0171 would need**, and the reasons for each choice:

- **On the Event, not `Booking.details`** — ADR-0047 §1 makes the Event the sole time authority, and a manual non-booking `lodging` event must be able to carry one (ADR-0063 §4).
- **Instants, not `HH:MM`** — a reception open until 01:00 crosses midnight, and instants make ADR-0107's display-zone handling apply unchanged. The form still collects a bare clock, because that is the only part a person knows; `windowBoundIso` resolves the day, **rolling a start window forward and never rolling an end window forward**. That rule has its own test: off by a day here reads perfectly correct.
- **A window must contain the edge it widens** — refused in the shared schema like the span itself, on both ends.
- **`null` clears** on the wire, matching `displayTimezone`'s established convention; and in the booking seed, which the client rebuilds whole on every save, **absent clears** — matching `endDate`'s rule in the same object, because a window that is gone was removed.

### 4. A closed window holds a position, and still earns no stop number

> **AMENDED 2026-08-13 (same day), and §4 and §5 below are both superseded — read §9 first.** The owner reversed the split this section makes: **every** edge holds a position, the stay keeps an ambient line on its edge days, and the time reads under the title whether or not it is a range. What follows is left as written because §9 is only legible against it.

ADR-0171 §10a's own test is the **width of the window**: a floor is unpositioned _because_ it is open on the side you act. Close it and that reason is gone, so the row leaves the `.day-ambient` strip and rejoins the list — at its floor, since the day list is an ordering and the row is placed, never re-timed.

`edgeHoldsPosition` is a predicate rather than an inlined comparison, because the day's split and the day's count must not drift apart on it.

**§10b's map rule is untouched and was not re-litigated:** a stop number is the index of a moment the app KNOWS, and a window is not a moment. `isExactEdge` stays false, the slot stays for alignment, the mark leaves.

### 5. A range reads under the title; a bare time does not move

> **REVERSED 2026-08-13 — see §9d.** The bare time moved under the title too, and the `dir="auto"` this section's CSS relies on turned out to be what mis-aligned the range it was placing.

The app's two row shapes answer "where does the time go" oppositely and deliberately — `.transition-row` is flex with `.tr-time` at the trailing edge (`flex: 0 0 auto` · `nowrap`), `.wp-event-face` is a grid whose areas are `'badge title' / 'badge when'`. It is a wash for one clock and expensive for a range: **measured, a range at the trailing edge took 45px of 210** off a long hotel name, because `.tr-title` is the only element there that ellipsises.

**Owner's call: the range goes under the title, and a bare time stays exactly where it is.** So no shipped transition row changes, and the ~20px of height (55px → 75px) is charged only to a row that actually has a window. This adopts `EventCard`'s existing answer rather than minting a third one; the CSS is three declarations, and only the placement moves.

### 6. The hero gains the state it existed for, and a lodging edge can finally fail

`CHECKIN_GRACE_MIN = 120` was **a stand-in for a ceiling nobody had authored**, and it already contradicted ADR-0171 §6, which keeps a floor pending until settled or the day ends. Nobody noticed because neither number was real. Where a window exists it is not consulted at all; where none does, nothing changes.

- **Inside the window** the check-in holds the hero for as long as it can still be done.
- **Closing** (within `WINDOW_CLOSING_MIN`, and only once the floor has passed) it **outranks a departure** — one `rankOf` rather than a new kind, because the row is still a check-in and still says so. The countdown runs to the **ceiling**, since the floor has passed and the shutting is the thing worth counting.
- **Missed** — past the ceiling and unsettled. This is the first time a lodging edge can fail at all, and it costs **one CSS rule** (`.tlabel.missed`) in the board's own low-alpha-fill recipe, in the existing `--miss`. No new hue and no new row shape.

`נותרו היום` expires with it. **`glance.ts` was the one consumer in the codebase that asked `edgeMeaning` for a specific FLEXIBLE value** (`!== 'not-before'`) rather than testing `exact` — so without a change there, a windowed check-in fell through to the clock test against its **floor** and stopped counting at 17:01 while its window ran to 21:00, silently contradicting the miss mark on the board.

### 7. What did NOT change, and the audit that proves it

**The gap derivation needs nothing**, and the count is the deliverable rather than the preamble. All six `edgeMeaning`/`isExactEdge` consumers were enumerated:

| consumer                          | test                    | a windowed edge                                  |
| --------------------------------- | ----------------------- | ------------------------------------------------ |
| `day-joins.ts:143` (the gap)      | `=== 'exact'`           | transparent — `day-joins.ts`/`gaps.ts` unchanged |
| `place-usage.ts:734` (map number) | `isExactEdge`           | false — no number, §10b holds                    |
| `day-entries.ts` (the split)      | now `edgeHoldsPosition` | positioned — §4 above (§9a: predicate deleted)   |
| `TransitionRow.tsx`               | `=== 'not-after'`       | the range replaces the `עד` prefix               |
| `glance.ts` (`נותרו היום`)        | `!== 'not-before'`      | **the one that had to change** — §6              |
| `hero-booking.ts`                 | (grace)                 | the ceiling replaces the guess — §6              |

**A window holds a position and still bounds no gap.** A position is an ordering claim; a gap is a duration claim; the actual check-in moment stays unknown. `dayBlocks` keys transparency on `=== 'exact'`, so this is true **by construction** rather than by a new rule.

**A range is a bidi trap in one place and not the other** (ADR-0118). _(§9d: half right. The order was safe; what this reasoning missed is that the same attribute also resolves the BOX to `ltr`, so `text-align: start` meant left and the range hung off the wrong margin. `dir` is gone from `.tr-time` and the isolate carries it alone.)_ `.tr-time` carries `dir="auto"`, and a digits-only run has no strong character, so `auto` falls back to `ltr` and a range is safe there. `UnplacedCommitment`'s `.as` renders `${label} · ${when}` with **no `dir` at all**, so a Hebrew word leads and the same string renders reversed. The rule that holds in both is ADR-0118's own: isolate the **numeric run**, never trust the container. Every range this ADR renders goes through `ltrIsolate`, and the render test asserts the isolate characters rather than the eye.

### 8. Deliberately not doing

- **No control on an ordinary event, though the model reaches one.** `edgeMeaning` reads an authored window on any event, and the form does not offer it, because an ordinary event already draws `18:00–20:00` as a **duration** and a window draws the same pixels meaning the opposite. Opening it is a gate to flip once that collision has an answer, not a design to redo.
- **No threshold on how narrow a window has to be before it bounds a gap.** §5's rationale ("a room from 15:00 consumes no particular hour") is true of a four-hour window and shaky for a thirty-minute one — and any number here is a guess. Recorded rather than invented.
- **No new hue, no new row shape, no new overlay, no new density.**

### 9. Amendment, 2026-08-13: an edge is a row on the day like any other

Three owner reports on the shipped device build, and the third reversed §4. They are one decision, because §4's split is what made the other two visible.

**9a. A floor and a window are the same hotel, so they read the same way.** §4 sent a bare floor to the strip above the list and a closed window into the list — one booking placed two different ways depending on whether a second number had been typed. Both are in the list now, and the stay **also** keeps its `.day-ambient` line on its edge days (`staysOnDate`, amending ADR-0064 §C, which had restricted the strip to strictly-middle nights so no day showed the stay twice). They are not the same claim: the strip says where you are sleeping tonight, the row says what you do at 15:00. `edgeHoldsPosition` is **deleted** — every edge answers yes, and a predicate that says otherwise is what the next reader trusts.

**9b. Which means a floor needs somewhere defensible to sit, and ADR-0171 §10a was right that it has no obvious one.** The reported case: a hotel check-in read _above_ the flight that brought the group to the country — "check into your Iceland hotel, then fly to Iceland". §10b already solved the mirror for a ceiling (`deadlineAt`: the earlier of the deadline and the first journey leaving before it), so this generalises that one function into `edgeAt` rather than minting a second:

| clause                | applies to | rule                                                                                     |
| --------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| overlap               | both ends  | a hard event you are **inside** bounds the edge — pushed to its end, pulled to its start |
| journey, from outside | both ends  | a leg **departing** before a ceiling pulls it; a leg **landing** after a floor pushes it |

Two refinements the code found rather than the design:

- **A `held` span is excluded from the overlap clause.** Holding a car from 09:00 is not being occupied by it, so a hire spanning an 11:00 check-out must not drag it to the counter's opening time. §10b's existing test is what caught this on the first run — the distinction is ADR-0063's `midSpan.kind` and needed no new vocabulary.
- **Overlap alone does not fix the reported bug**, which is worth recording because it was the first answer drawn. The flight sorted under that 15:00 check-in **departed at 15:30** — nothing straddled anything. The floor genuinely needs the journey clause.

**The known cost, raised by the owner as a gotcha and accepted rather than designed away:** the journey clause reads a landing as "you have arrived _here_", and only the place graph knows whether a leg relocated you. A same-day **round trip** returning at 18:00 therefore pushes a 10:00 check-in to 18:00, though you could have dropped your bags before leaving. Accepted because the failure is not symmetric — the round trip merely reads late, where a floor above its inbound flight reads _wrong_ — and because the obvious repair is not one: a flight lands at an **airport** and the hotel is in a **city**, so comparing a leg's endpoint to the stay's compares ids that never match, and city-level grouping does not exist here.

**9c. The settle pair moved with the floors, and it is a count rather than parity.** `glance.ts` keeps a `not-before` edge in `נותרו היום` until it is `DONE`, because 15:01 does not mean anybody checked in (ADR-0171 §6). The strip carried `SettleControl` for exactly that reason, so moving floors into `TransitionRow` without it would strand the number the owner reported on 2026-08-04. `TransitionRow` renders the pair on a **floor only** — a ceiling and a window expire by their own clock — at `compact`, the density `UnplacedCommitment` had already picked for this row shape. Trip mode supplies the verbs and Plan supplies none (ADR-0171 §10e's posture, unchanged).

**9d. §5 is reversed: the time reads under the title whatever it says.** §5 kept a bare clock at the row's trailing edge so no shipped row would change, and that made `.transition-row` the one row in the app whose time **moves depending on its own content** — against `EventCard`'s `'badge title' / 'badge when'` and Plan's builder row, which both put every time under the title. The owner's report is that it stood out, and worst on a long title.

**And there was a real bug hiding inside §5's own three declarations.** `.tr-time` carried `dir="auto"`. A digits-only range has no strong character, so `auto` resolved the **element** to `ltr` — and its inherited `text-align: start` therefore meant **left**, so the range hung off the wrong margin of an RTL card. §7 reasoned about `dir="auto"` protecting the range's _order_ and was right about that; what it did not consider is that the same attribute decides the _box's_ direction. The attribute is gone, every clock (bare or range) is `ltrIsolate`d at the run per ADR-0118, and a test asserts the absence — because this is the class of defect that is invisible in a screenshot, where the eye sees only the result.

Cost: the ~20px of row height §5 charged only to windowed rows is now charged to every transition row. In exchange the title gets the full column width on all of them (§5 measured 45px of 210 at 360px).

**9e. A separate authoring bug the same report surfaced.** The window token read `＋ עד` on **both** edges. On a start edge that is right — the check-in time is the floor, so the second bound is a ceiling. On an **end** edge it is backwards: the check-out time IS the deadline and the field stores `endWindowStart`, the _earliest_ you may leave. So the label invited the input it cannot mean, and the owner typed check-out `06:00` plus `עד 11:00`; `windowBoundIso` then applied its documented rule (a larger clock on an end edge reads as yesterday), rolling the bound back a day into a 19-hour window that rendered `11:00–06:00`. `maxTime` did not prevent it because the deadline can be edited after the bound.

The word is now per edge — `＋ עד` / `＋ מ־`, with `סוף החלון` / `תחילת החלון` as the caption. **`windowBoundIso` is unchanged**: its roll is correct for the case it was written for (a car returned at 02:00 against a counter open from 22:00), and §8's refusal to put a threshold on window width still stands, so there is no number to reject a wide one by.

### 9f. Amendment, 2026-08-13 (after §9 shipped): the strip states the edge, and the range stops reading `atMs`

§9a put the stay's ambient line on its edge days and left `ambientSpanLabel` on it. Owner, off that build:

> _"edge days should state 'check in from…', 'check out until…', 'car returned until' etc (and also ranges), not day 1/1, that way we can't differentiate between check in and check out."_

Correct, and the screenshot is the proof: two guesthouses on one day — Lækjaborgir being **left** that morning, Setberg being **arrived at** that evening — both read `לילה 1 מתוך 1`. The same words for opposite events, and the clamp §9a inherited from ADR-0064 §C made it worse by rendering a night count on a day that is not a night.

**An edge day states the edge; a middle day states the count.** `צ׳ק-אאוט · עד 09:40`, `צ׳ק-אין · 17:00–20:00`, `החזרת הרכב · עד 18:00` — and the car needs no branch, because `transitionLabel` resolves per profile (ADR-0063) and `החזרת הרכב` arrives with nobody having thought about cars. `N מתוך M` stays where where-you-are-sleeping is the only thing to say.

**`${label} · ${phrase}` is not a new shape**, which is what settles it against the owner's stated preference for consistency: it is exactly what `UnplacedCommitment` rendered **in this same box** until §9a emptied it, with the same `·` and the same `מ-`/`עד` vocabulary as the transition row, the hero and the Index row. The rejected alternative was a bare label with no clock (to avoid repeating the row below it) — which would invent a third form existing nowhere else, and drop the one fact the strip is pinned to the top to deliver.

Two things fall out of writing it once:

- **`edgeTimePhrase` + `edgeSentence` are shared** (`lib/transitions.ts`), read by the row and the strip, off `edgeEntryOf(placement.positioned, …)` — so the two cannot print two different clocks for one edge, since the row's instant is `edgeAt`-bounded and the authored one is not.
- **The read-out is protected and the title ellipsises** (`.day-ambient .an`), the trade `.index .bk-when` already states. A truncated guesthouse name still identifies the booking; a truncated clock is the fact the line exists for.

**And a bug in §9b, caught by writing the assertion rather than by looking at the render.** The range was built from `atMs`, which for a windowed edge is not one of the window's ends — it is wherever `edgeAt` placed the row. A 17:00–20:00 check-in window pushed to a 22:00 landing rendered **`20:00–22:00`**: a window nobody authored, concealing that the real one had shut (§6's missed state). A window now reads its **two authored numbers**, which is §4's own rule ("the row is placed, never re-timed") applied where §9b had quietly broken it.

A single clock still reads the placed instant, and that is not an inconsistency: one authored number can be intersected (§10b — "be out by 09:40" because you are on the hike), where two describe a window and intersecting one end of it invents the other. **Left open:** whether a windowed edge should show an intersected window at all (`06:00–09:40` for a 06:00–11:00 check-out against an 09:40 departure). It is a real question and inventing an answer is how §9b's bug happened.

## Consequences

- **One migration, two nullable columns, nothing to backfill** — "no window" is exactly what every booking authored so far means.
- **Both modes, from one derivation.** Trip and Plan read one `placeDayEntries`, so a closed window regains its position in both. ADR-0171 §10e exists because that was got wrong once; it was on the checklist this time.
- **`CHECKIN_GRACE_MIN` stops being load-bearing** wherever a real ceiling exists, and its comment now says so.
- **`TimeField` gains `maxTime`**, which is a primitive the next bounded picker inherits.
- **What is NOT verified: the render on a real phone.** Every decision here is covered by unit tests and by the mockup; the two new pieces of CSS have been seen only there. That is ADR-0017's device pass.

## Alternatives considered

- **A `ChoiceDisclosure` row (`שעות קבלה`).** Drawn and measured rather than argued about: 60px charged to every pass through the form for a feature the brief itself calls rare, and two rows if made symmetric. Rejected on the number.
- **A range mode inside the shared `TimePicker` panel.** Zero form footprint, but `TimePicker` serves every time in the app — a mode there is a change to all of them for four edges, and the feature would be invisible until you tapped into a panel opened for something else.
- **`Booking.details` JSON.** No migration, and it puts a _time_ outside the Event, which ADR-0047 §1 forbids; a manual `lodging` event could then never have a window at all.
- **Storing `HH:MM` instead of an instant.** Smaller, and it cannot express a reception open until 01:00 — and it would need its own zone story where an instant already has ADR-0107's.
- **A fourth explicit `edges` field on the profile.** Still two sources for one fact (ADR-0171 §2, ADR-0162 §2). The window is the per-EVENT answer; the profile stays the per-category one.
- **Letting a closed window earn a map number.** The Iceland case (§10b): a number asserts a sequence, and a window is not a moment.
- **Keeping the range at the row's trailing edge.** Cheaper by 20px of row height and costs 45px of the hotel's name at 360px. The owner picked the name.
