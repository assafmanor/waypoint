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

ADR-0171 §10a's own test is the **width of the window**: a floor is unpositioned _because_ it is open on the side you act. Close it and that reason is gone, so the row leaves the `.day-ambient` strip and rejoins the list — at its floor, since the day list is an ordering and the row is placed, never re-timed.

`edgeHoldsPosition` is a predicate rather than an inlined comparison, because the day's split and the day's count must not drift apart on it.

**§10b's map rule is untouched and was not re-litigated:** a stop number is the index of a moment the app KNOWS, and a window is not a moment. `isExactEdge` stays false, the slot stays for alignment, the mark leaves.

### 5. A range reads under the title; a bare time does not move

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
| `day-entries.ts` (the split)      | now `edgeHoldsPosition` | positioned — §4 above                            |
| `TransitionRow.tsx`               | `=== 'not-after'`       | the range replaces the `עד` prefix               |
| `glance.ts` (`נותרו היום`)        | `!== 'not-before'`      | **the one that had to change** — §6              |
| `hero-booking.ts`                 | (grace)                 | the ceiling replaces the guess — §6              |

**A window holds a position and still bounds no gap.** A position is an ordering claim; a gap is a duration claim; the actual check-in moment stays unknown. `dayBlocks` keys transparency on `=== 'exact'`, so this is true **by construction** rather than by a new rule.

**A range is a bidi trap in one place and not the other** (ADR-0118). `.tr-time` carries `dir="auto"`, and a digits-only run has no strong character, so `auto` falls back to `ltr` and a range is safe there. `UnplacedCommitment`'s `.as` renders `${label} · ${when}` with **no `dir` at all**, so a Hebrew word leads and the same string renders reversed. The rule that holds in both is ADR-0118's own: isolate the **numeric run**, never trust the container. Every range this ADR renders goes through `ltrIsolate`, and the render test asserts the isolate characters rather than the eye.

### 8. Deliberately not doing

- **No control on an ordinary event, though the model reaches one.** `edgeMeaning` reads an authored window on any event, and the form does not offer it, because an ordinary event already draws `18:00–20:00` as a **duration** and a window draws the same pixels meaning the opposite. Opening it is a gate to flip once that collision has an answer, not a design to redo.
- **No threshold on how narrow a window has to be before it bounds a gap.** §5's rationale ("a room from 15:00 consumes no particular hour") is true of a four-hour window and shaky for a thirty-minute one — and any number here is a guess. Recorded rather than invented.
- **No new hue, no new row shape, no new overlay, no new density.**

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
