# Session 221 — Workstream D: booking authoring, decided then built

**Date:** 2026-08-07
**Branch:** `claude/waypoint-booking-sheet-decisions-1o0jp4`
**Scope:** field reports #2, #4, #8, #9, #11, #12 — the whole of Workstream D from
[session 216's triage](2026-08-07-session-216-field-reports-triage.md).
**Shape:** decision session first, build second, mirroring
[session 220](2026-08-07-session-220-temporal-semantics-decision-session.md). Four of the
six items arrived with their shape unsettled; none of those four was built until the owner
had answered it.

## 0. What the session was for

The triage routed these six together deliberately — _"D is one coherent authoring pass, not
six divergent form tweaks"_ — because they all land on the same three files
(`BookingSheet.tsx`, `booking-draft.ts`, `WhenField.tsx`) and several of them decide the
same thing twice if taken separately. That turned out to be right in a way the triage could
not have predicted: **#12 changes what `provider` means, which decides what #9 may derive a
title from, which decides whether the title field can stop being required.** Taken as three
tickets, the middle one would have titled every hotel `Booking.com`.

## 1. The decisions

Two rounds of questions. Round one settled #2's direction, #12's copy, #9's fallback chain
and #4's time rule; round two settled #2's relationship to the stepped form, #4's date
half, and #11 — which the owner then **restated**, and the restatement is the most
consequential thing in this note (§2).

| #   | Question                             | Owner's answer                                                                                                                                                                                                                                 |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | What replaces the grid after a pick? | Collapse to the picked card + `שינוי`. **And the type gets its own first step** — but an edit must not gain one: _"when editing a created form we don't want this many steps, combine when it makes sense, don't let the category be changed"_ |
| 4   | Same-day end times                   | **Hide** the ones before the start; a later end day keeps the full 24 hours                                                                                                                                                                    |
| 4   | Should the end DATE pre-fill?        | Yes, **per type**: same day, hotel +1                                                                                                                                                                                                          |
| 9   | What derives a title?                | **Place name → type label.** Provider is deliberately not in the chain                                                                                                                                                                         |
| 11  | Which clock values prefill?          | Restated — see §2                                                                                                                                                                                                                              |
| 12  | The hotel provider label             | `הוזמן דרך`, **hotel only**; the other types keep their per-type labels                                                                                                                                                                        |

### 1a. #8 needed no decision and its ADR needed no amendment

The triage was right that ADR-0154 §4 (the round-trip control) is not what #8 is about.
§4's argument is a **measurement** — the control row costs 44px and the second leg a further
492px, so the return must not be pre-expanded — and that argument survives untouched. What
did not follow from it, and was never argued, is that `כיוון אחד` should render
**pre-selected**. `undefined` keeps every pixel of §4's reasoning and stops the form
answering for the traveller. Recorded in `booking-draft.ts` at the value itself rather than
as an ADR amendment, because nothing in §4's decision changed.

## 2. The one thing that was reopened: #11

The session's first answer to #11 was _"only floors and deadlines"_ — prefill only where
ADR-0171 §1's `edgeMeaning` says the edge is not an `exact` instant, i.e. hotel and car
only. It was built that way. **The owner then restated the requirement**, and the restated
one is broader:

> conventional times should be guessed where possible … Most events (except maybe flights)
> are at least on the day start, so like 7:00 should be the default starting time, and end
> time should always be prefilled ahead of start time, and here we can prefill with a
> duration that makes sense for the booking type … When changing the start time, if the end
> time wasn't touched, the duration should also move

Three things changed, and the third is the interesting one:

1. **Check-out is 10:00**, not the 11:00 the session had proposed.
2. **The `exact`-edge line is not the boundary of what may be offered.** It is still the
   reason **flights, trains and transit get nothing** — a departure is the commitment
   itself, and guessing one writes a false instant onto a hard event — but everything else
   now gets an offer whether or not its edges are exact. So the rule shipped as: **a type
   whose middle is a `journey` offers nothing; every other type offers something.** That is
   pinned as a property test against `eventMidSpan`, not against a list of type names, so a
   future mode inherits the answer by saying what its middle is.
3. **An end that follows its start is not the same mechanism as a value filled in once.**
   The first build filled blanks; the restatement asks for a _derivation with a latch_ —
   which is `useDerivedField`'s exact shape, already used in this very form for the icon and
   the kind. `endTouched` is that latch.

The three offer kinds fall out of it and are the actual product decision:

| kind         | types                              | what it means                                                                            |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `convention` | hotel 15:00→10:00, car 10:00→10:00 | Two **clocks**, not a length — moving check-in to 18:00 does not move check-out to 13:00 |
| `duration`   | activity, restaurant, other        | The day's start (07:00), then `typicalMinutes` later                                     |
| `none`       | flight, train, transit             | Nothing may be guessed                                                                   |

`duration` reuses `CATEGORY_TIME_PROFILE.typicalMinutes` (ADR-0161 §5) rather than adding a
second per-type list of lengths — a meal is already known to run 90 minutes. Note the trap
that avoided: `transport`'s `typicalMinutes` is 60 and **its own comment says it means
nothing by it**, because a journey's length comes from its two ends. A naive "use
typicalMinutes everywhere" would have offered every flight a one-hour arrival.

## 3. What shipped

- **`packages/shared/src/icons.ts`** — `BookingTypeProfile.times: BookingTimeOffer`, a
  **required** column so a new booking type must answer rather than inherit; `DAY_START_TIME`;
  readers `bookingTimeOffer`, `bookingTypicalMinutes`, `bookingSpanDayOffset`. The last one
  reads the end-date offset off `durationUnit === 'nights'` — a stay counted in nights
  cannot be zero of them — rather than adding an offset column that would say the same
  thing a second time.
- **`frontend/src/lib/booking-prefill.ts`** (new) — `offeredEnd`, `offerLegTimes`,
  `offerDayTimes`. Keyed on the **day changing**, which is what makes clearing a time
  possible; without that the clear empties the field and the offer puts it straight back.
- **`TimeField`** — a `minTime` prop (exclusive) that filters the 15-minute list and sets
  the native input's `min`. **`WhenField`'s span passes it only while the end's own day
  equals the start's**, which is what leaves overnight flights and multi-day stays offering
  the full 24 hours untouched. `variant="span"` has exactly one caller, so the blast radius
  of the shared-primitive change is `BookingSheet` alone; `EventForm` and `DayView` use the
  `day` variant and are unaffected.
- **`BookingSheet`** — a create-only `type` step; the collapsed `BookingTypeRow` on every
  later step (with `שינוי` on create, a statement on edit); the direction control lifted out
  of the route field into a `Field` of its own; `roundTrip: undefined` + a `direction`
  refusal; the derived-title chain; the two schedule `onChange`s routed through the offers.
- **`he.ts`** — `הוזמן דרך` + `Booking.com · Airbnb · אתר המלון` for hotel; `stepType`,
  `changeType`, `directionRequired`.

**Two things the build changed that the decisions did not name**, both recorded because a
reader would otherwise think them arbitrary:

- **The direction control moved out of the route `Field`.** ADR-0154 §4 put it "in the route
  field" for proximity to the `⇄` in the preview. Once it can _refuse_, it needs a box of its
  own to be marked in — and a nested `Field` renders its error **ahead of** the error of the
  field wrapping it, so a missing route was being reported at the direction's box. It now
  sits directly above the route field, which keeps §4's proximity and ADR-0150's one-box-one-
  name.
- **`changeType` clears an untouched offered end.** A check-out clock must not survive a
  switch to a flight, where the whole point is that no clock may be guessed. An end a human
  typed is theirs and stays.

## 4. The judgment call inside #2, stated because it was mine

The owner's answer was "type gets its own first step" **plus** "when editing, combine when
it makes sense". Those pull in opposite directions and the second delegates the resolution.
What shipped: **an edit gains no step at all.** A saved booking's type has never been
editable, so on an edit there is no question to ask — the step that would have been added is
folded away entirely and the answer rides the collapsed row instead. Create goes 3→4 steps;
edit stays at 3.

The alternative reading — merge `what` and `when` on edit to get back to 2 — was rejected:
it would make the two modes disagree about what a booking form _is_, and ADR-0155 is
explicit that this form's steps are "the form's own three subjects". Worth re-checking with
the owner on a device if the create flow now feels a step too long.

## 5. Still owed

- **A mockup was not produced.** The triage asked for one booking-sheet-flow mockup carrying
  the shape-changing pieces. The owner resolved all three of those pieces in conversation
  before a drawing was needed, and the previews in the questions themselves carried the
  comparison. The **render has not been seen on a device** — the collapsed row, the four-step
  create bar, and the offered times are unit-tested and not eyeballed. That is the honest
  gap, and it is ADR-0017's pass, not a mockup.
- **`restaurant`/`other` now offer 07:00.** Correct by the owner's rule and slightly odd for
  a restaurant specifically; it is one value in one table if it wants re-tuning.
- **No ADR was written.** Nothing here revises a decision an ADR owns: #8 leaves ADR-0154 §4's
  reasoning intact (§1a), #9 generalises ADR-0163 §3's own rule to the types it already
  implied, #11 reuses ADR-0171 §1 as a _reason_ without changing it, and #2/#4/#12 are
  authoring adjustments of the kind CLAUDE.md's "write only what a future reader would
  otherwise get wrong" says not to ceremonialise. The two non-obvious _whys_ — the nested-
  `Field` refusal ordering and why `typicalMinutes` cannot be universal — are comments at
  the code that would otherwise mislead.
