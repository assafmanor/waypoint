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

## Two owner notes on the drawing, and what they changed

**"the lifted hero should also show the flight number and not only the gate."** A correction, so the default changed rather than being drawn beside the old one. It also turned out to be the _same_ rule as §4 from the other side: ADR-0214 §3 took the lock and the code off the collapsed board precisely because "the lock is on the point in the lifted hero, one press away" — the board rations, the hero carries. The first drawing gave both facts a labelled `hero-part` beside `איפה`/`הערה`/`משימה`. **The third note then killed that shape — see below.**

**"an easy way to add the gate number so that you wouldn't have to edit the entire flight just to add it."** The question §2 gestured at and did not answer. Two things settled it, neither a matter of taste:

- **Where.** `Board.tsx:797` renders the collapsed board as a `<button>` whenever it can lift (ADR-0160 §1), so it cannot host a nested control _at all_. The quick-add is the lifted hero's, one tap in — the surface the first note had just populated.
- **Which primitive.** The two candidates each hold half of it. `ValueToken` (ADR-0177 §2) has the right semantics — "a value you can change, inline", with an `empty` variant documented for exactly this case — and the wrong surface (`--ink` over `--soft-line`, all four call sites light). `.hero-act` has the right surface (the board's low-alpha-fill-under-brightened-ink recipe) and the wrong semantics: it is a way _out_ of a point, never a value. Pressing a hand-off chip into being a value editor is how a duplicate gets built, so `ValueToken` gains a `.vt.on-dark` density borrowing `.hero-act`'s measured recipe — the `.wp-tzshift.on-dark` move, for the same reason.

The render confirmed the borrowing rather than asserting it: **token and chip both 34px**, so they read as one family. Token 67px filled, 64px empty. And the 44px floor is met as ADR-0177 built it — a 34px box whose `::after` reaches **48px**, read off the live computed style.

The real cost being described was ADR-0155's: a stepped form commits once, so setting a gate today rewrites the whole booking. The build constraint that follows is the place this is most likely to be got wrong — the quick save must write `gate` alone.

## The third note, which overturned the second before it was accepted

**"the hero looks very crowded when there's lots of stuff in the flight, can you reconcile that too?"** — with two screenshots of the running app.

**This was a defect in the mockup, not in the proposal, and it is the failure the skill warns about by name.** §5 was measured against a _thin_ hero: one `איפה` part, three chips, 200px → 291px. The photographed hero already wraps its meta line to **two bands** and its chip row to **two rows** before anything is added. "Draw the crowded case, not the clean one" — and a clean case decides nothing, which is exactly what the 91px turned out to be worth.

Re-measured against the real hero (mockup §7, 360px, cap 622px):

| arm                                    | height    | cost      |
| -------------------------------------- | --------- | --------- |
| (א) today                              | 425px     | —         |
| (ב) a labelled `hero-part` (§5's draw) | 516px     | **+91px** |
| (ג) the number rides the title         | 449px     | +24px     |
| (ד) the number on the meta line        | **448px** | **+23px** |

**The finding that settles it: the gate costs nothing.** The chip row is 76px with and without the token — it already wraps and has room in its second row. So all 23px is the flight number, which makes it the price of the ask rather than of any way of paying it, and makes the labelled part 4× the cost of the same fact.

(ג) and (ד) are **1px** apart, so that choice is meaning and not width — the same shape as §4 two sections earlier. (ג)'s entire cost is the title breaking to two lines (24px → 48px), and the title is the route, which ADR-0059 §3 decided is what a flight reads as. A third band beats a wrapped route.

§5 stays in the mockup as a **rejected shape** rather than being deleted: the 91px is the argument, and a future reader proposing it again should meet the number first.

## Open, and belonging to a device pass

The gate window (`T-4h · T-3h · T-2h`, default `T-3h`) is a control in the file and not a decision it pretends to have made. And the teal gate chip sits beside the amber transition label for the first time — whether that reads as two kinds of fact or as a clash is a screen question.

## Left for the owner

ADR-0222 is **Proposed**. §4 (the gate inherits the code's slot vs. both chips, now that both are known to be free) and §5 (the window) are the two answers it needs before anything is built.

## A shipped fact measured on the way past

Every `.field input` in the app renders at 37px against ADR-0017's 44px touch floor — app-wide, predating this change, and now a number rather than a suspicion. Added to the backlog; the next form ADR should own it.
