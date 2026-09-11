# 2026-09-11 — A flight has a number and a gate

**ADR:** [0222](../decisions/0222-a-flight-has-a-number-and-a-gate.md) (Proposed)
**Mockup:** [`mockups/a-flight-has-a-number-and-a-gate-v1.html`](../../mockups/a-flight-has-a-number-and-a-gate-v1.html)

## The ask

> Flights bookings and forms are missing 1. Flight number 2. Gate. They should both be added as optional

## The fork put to the owner first, and the answer

Asked whether to mock up before building, the recommendation was **split**: no mockup for the flight number (it behaves exactly like `confirmationCode`, whose surfaces are settled), a mockup for the gate (volatile, competes for the board's one booking-fact slot, and has a colour-budget question). The owner's answer was **"Mockup both because why not"** — so both were drawn. Recorded because the split recommendation still holds as an explanation of _why the two halves of one ADR are argued so differently_, not because it was overridden.

## What reading the code changed, before anything was drawn

- Neither field exists anywhere today. Every `gate` hit in the repo is English prose about guard conditions.
- `providerLabel` (ADR-0163 §2) is the shape this wants: one column, a `Record<BookingType, string>` of words over it, written because "a single `ספק` would be the vague option everywhere". A flight number is a train number; a gate is a platform. So: two columns, not four fields.
- ADR-0179 §2c already took the confirmation code **off** the Index row on a measurement (133px of 330px, title left with 43px). A new code-like fact therefore starts with no claim on that row.
- `.bk-fact-v.mono` sets a typeface **and** a hue in one class. The second caller is what exposed it.
- `.tlabel.loc` — the board's teal "where" recipe — is scoped to `.wp-board-now-meta` only, so the `הבא בתור` line has no teal at all.

## What the render refuted — the file's own first draft

§3 was written on the assumption that a seventh chip breaks the board's meta line, and that the gate therefore **had** to inherit the code's slot. Measured at both widths, both themes: the line is **already** two bands in the crowded case (the code sits alone on the second), and adding the gate beside it costs **0px** — 42px → 42px on the line, 123px → 123px on the board.

The recommendation did not change; its argument did. The gate inherits the code's slot because printing a ticket number you cannot act on beside a gate you must act on is the wrong sentence, **not** because the line cannot afford both. The width argument would have been the easier one to write and the wrong one to defend at review. Both the mockup §3 note and the rejected-alternatives list were rewritten to say so, and the "both chips" arm is now recorded as live rather than as refuted.

## Measured, off the live DOM

| what                                   | number                           |
| -------------------------------------- | -------------------------------- |
| board meta line — today / +gate / swap | 42px / 42px / 40px, 2 bands each |
| board card — today / swap              | 123px → 121px                    |
| gate chip vs the code it inherits      | 50px vs 68px (−18px)             |
| the `more` step — before / after       | 196px → 385.7px                  |
| gate field with its hint / without     | 89.7px / 37px                    |
| detail fact column — before / after    | 152px → 228px                    |

## Open, and belonging to a device pass

The gate window (`T-4h · T-3h · T-2h`, default `T-3h`) is a control in the file and not a decision it pretends to have made. And the teal gate chip sits beside the amber transition label for the first time — whether that reads as two kinds of fact or as a clash is a screen question.

## Left for the owner

ADR-0222 is **Proposed**. §4 (the gate inherits the code's slot vs. both chips, now that both are known to be free) and §5 (the window) are the two answers it needs before anything is built.

## A shipped fact measured on the way past

Every `.field input` in the app renders at 37px against ADR-0017's 44px touch floor — app-wide, predating this change, and now a number rather than a suspicion. Added to the backlog; the next form ADR should own it.
