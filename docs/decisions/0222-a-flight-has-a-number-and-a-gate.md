# 0222 — A flight has a **number** and a **gate**, and they are not the same kind of fact

**Status:** Proposed (2026-09-11) — drawn and measured, not yet reviewed by the owner. §4 and §5 carry the two forks that need an answer.
**Date:** 2026-09-11
**Session note:** [`planning/2026-09-11-a-flight-has-a-number-and-a-gate.md`](../planning/2026-09-11-a-flight-has-a-number-and-a-gate.md)
**Mockup:** [`mockups/a-flight-has-a-number-and-a-gate-v1.html`](../../mockups/a-flight-has-a-number-and-a-gate-v1.html)

**Extends:** [0163](0163-a-hire-is-not-a-journey.md) §2 — the same shape, for the second and third time: one `Booking` column with a `Record<BookingType, string>` of words over it. 0163 is not amended; it scoped itself to `provider` and this adds two peers beside it.
**Relates:** [0179](0179-a-booking-row-says-what-then-when-and-the-code-is-a-read.md) §2c (the code left the Index row; neither new fact asks for that slot), [0214](0214-the-night-board-has-one-subject-and-it-is-tomorrow.md) §3 (a fact you cannot act on comes off the board — the sentence §4 reads as a window), [0028](0028-plan-violet-color-budget-dark-ready.md) (amber = time & commitment, teal = location — §3 and §4 both turn on it), [0047](0047-booking-event-linkage-and-notes.md)/[0048](0048-index-build-data-model-refinements.md) (the booking shape these two columns join), [0155](0155-a-stepped-form-is-one-primitive-and-it-commits-once.md) (the `more` step they land in), [0109](0109-map-tab-design.md) §6 (the anti-nag rule `Field`'s `hint` serves), [0017](0017-mobile-first-device-targets.md) (360px is the design width), [0096](0096-per-domain-claude-md-guides.md) (rule 8 — no new mechanism here)

## Context

The owner, in full:

> Flights bookings and forms are missing 1. Flight number 2. Gate. They should both be added as optional

Two fields in one sentence. The whole of this document is the claim that they are **not one kind of thing**, and that treating them alike is the only way to get this wrong.

A flight **number** is an identity: known when you book, never changes, and it is the string a stranger at a desk uses to find your flight. A **gate** is wayfinding: unknown when you book, published a couple of hours out, changed without warning, and worthless the moment you are on board. The form can treat them alike. No other surface can.

Four things reading the code changed, none of them visible in the request:

- **This is not a flight-only change, and the app already said so.** `providerLabel` (0163 §2) is one `Booking.provider` column with a `Record<BookingType, string>` over it, written because "a single `ספק` would be the vague option everywhere […] and that is how a field stops getting filled in". A flight number **is** a train number is a bus line; a gate **is** a platform. So this is two columns with two `Record`s — not four flight-shaped fields, and not one vague `מזהה השירות`.
- **A code-like fact does not inherit a row slot — it lost one.** 0179 §2c took the confirmation code off the Index booking row after measuring it at 133px of a 330px row, leaving the title 43px, and concluded a booking is _found_ by code and _read_ by code but need not be _scanned_ by code. Neither new fact asks for that slot here.
- **`.bk-fact-v.mono` conflates a typeface with a hue** — `font-mono` **and** `--amber-deep` in one class. The confirmation code wanted both. A flight number wants the mono and must not take the amber: rule 4 spends amber on time and commitment, and `LY315` is neither. The second caller is what exposed it.
- **The gate's hue is already bought, and it is teal.** `.tlabel.loc` is the board's teal recipe for "where", `.bk-loc` is teal for location in the sheet. A gate is a location inside a terminal, so rule 4 hands it teal by construction. The one catch: `.tlabel.loc` is scoped to `.wp-board-now-meta` only, so the `הבא בתור` line has no teal at all — §4 generalises that existing rule rather than writing a second one.

## Decision

### 1. Two columns, and a `Record` of words over each

`Booking.flightNumber` and `Booking.gate`, both nullable, both collected for the types where they mean something, with the **word** coming from a `Record<BookingType, string>` exactly as `providerLabel` does:

|        | flight      | train        | transit    |
| ------ | ----------- | ------------ | ---------- |
| number | `מספר טיסה` | `מספר הרכבת` | `מספר הקו` |
| gate   | `שער`       | `רציף`       | `רציף`     |

A `Record` over the enum rather than a ternary, so a new booking type answers at compile time — 0163's own reason, unchanged.

**`flightNumber` is a column and not a `details` key**, because it joins `searchTerms` (`lib/index-bookings.ts`, built as "an array, not a fixed handful of `||`-chained fields, so the next searchable facet is a push here"). `gate` is a column too rather than the `details` JSON its volatility suggests: it is one short string per booking with a typed label already, and putting one of a matched pair in a column and the other in JSON is a split a future reader would have to reconstruct a reason for.

### 2. The form: identity, then lookup — and the gate last

Both land in the stepped form's `more` step, beside the fields they belong with. The order is **provider → number → code**: the same argument already written in `BookingSheet.tsx` for why provider sits above code ("it is the thing you remember and the code is the thing you look up"), with the flight number falling between the two because it is half of each — `LY` is the airline and `315` is the lookup.

**The gate goes last, and that is not a tidy-up.** It is the only field on this step nobody fills in while booking; it is filled at the airport, on an edit. Its `Field` carries a `hint` — `בדרך כלל מתפרסם כשעתיים לפני ההמראה · אפשר להשלים אחר כך` — which is the primitive's documented job ("what leaving it empty costs […] instead of a confirm dialog on a legitimate mid-planning path", 0109 §6's anti-nag rule). Measured: the hint costs 52.7px (89.7px against a 37px field).

Both inputs take `dir="ltr"`, for the reason the code and provider fields already have it: these are latin/numeric, and 0118 permits it on an `<input>` — the one element where `auto` would left-anchor a Hebrew placeholder.

### 3. The read: two facts, and `.mono` splits into typeface and hue

Two `Fact` rows in `BookingDetail`. The column grows 152px → 228px, two rows at ~38px each.

**`.bk-fact-v.mono` keeps both properties** (it is the confirmation code's shipped look and nothing about it changes). **A new `.bk-fact-v.ident` is the same typeface in the fact's own ink** — four lines of CSS — and the flight number takes it. Drawn side by side in the mockup §2: the naive version puts three amber values in one column, two of which are not times, and the difference is visible in both themes.

**The gate takes neither.** Plain ink. Teal in this sheet is an **affordance** (`ניווט`, `מפה`) and not a text colour; painting a gate teal here would teach the build to spend the hue decoratively, which is the one thing rule 4 is for.

### 4. The board: inside the window, the gate inherits the code's slot

**This is the fork, and it is the section where the mockup refuted its own first draft.** §4 was written on the assumption that a seventh chip breaks `.wp-board-next-meta`, and that the gate therefore had to take the code's place. The measurement says otherwise, at both widths and in both themes: the line is **already** two bands in the crowded case — the code sits alone on the second — and adding the gate beside it costs **0px** (42px → 42px on the line, 123px → 123px on the board).

So the recommendation stands and its argument does not. The gate inherits the code's slot **on meaning**: inside the departure window the gate is the only fact on that screen you cannot get anywhere else, the code is already carried by the `הכרטיס הבא` quick tile 240px lower (0050's own surface for it), and printing a ticket number you cannot act on beside a gate you must act on is the wrong sentence. That the swap is also 2px shorter and the chip 18px narrower than the code it replaces is a bonus, not the case.

The chip is `.tlabel.loc` — the existing teal recipe, with its selector **gained** by `.wp-board-next-meta` rather than a second rule written under it. Outside the window there is no gate chip at all, and in `in-transit` there is none either: a gate is meaningless once you are on board.

**The alternative is live and drawn (mockup §3b):** both chips inside the window, now that it is known to be free. It is the arm to take if the counter-side reading turns out to want the code at the same moment.

### 5. The window is a feel call, and the default is T-3h

When the gate chip lights up. `T-3h` is the recommendation — early enough to be there when you leave for the airport, late enough that the value on screen is the one that will be on the departure boards — and the mockup makes it a control (`T-4h · T-3h · T-2h`) rather than pretending to have settled it. **A device pass owns the final number.**

## Consequences

**A migration, and `packages/shared` moves first** — two nullable columns on `Booking`, the zod schemas beside them, then the form, the read and the board. Nothing existing changes shape.

**`searchTerms` gains one term** (`booking.flightNumber`), which is a push into an array the ADR-0102 build explicitly left open for this.

**No new mechanism, and the proposal's CSS is 6 lines** — one selector gained, one class added. That number is the check on rule 8: a long block here would have meant a primitive went unused.

**The gate will go stale and the app will not know.** There is no gate data source; the field is what a person typed. A gate that changed after they typed it will be shown confidently and wrongly, and the mockup's rejected list says why an alert is not the answer (a notification about a value the user wrote is a message from them to themselves). The honest mitigation is that the chip only appears inside a window where the value is recent by construction — which is §5's real argument, and worth revisiting if anyone reports being sent to the wrong gate.

**Deliberately not decided:** whether the flight number should ever displace `TLV → NRT` as the flight's title. 0059 §3 decided a flight reads as where it goes, that decision was measured, and a number is a fact inside the read rather than a name.

**Not seen on a device** (0017). Two questions belong to that pass: whether `T-3h` is the right window, and whether the teal gate chip beside the amber transition label reads as two kinds of fact or as a colour clash — it is the first time those two chips sit on the same line.

**A shipped fact this measured and is not fixing:** every `.field input` renders at 37px against 0017's 44px touch floor, app-wide and predating this change. The two new fields sit at the same 37px, so this neither causes nor fixes it. Recorded in the backlog because it is now a measured number rather than a suspicion.

**Rejected, each drawn or measured:** one generic `מזהה השירות` column (0163 §2's own argument — the abstract word that is right for every type is the one nobody fills in); the flight number on the Index row (0179 §2c already measured what a code-like string costs that row); a permanent gate chip on the board (free, as it turns out, but empty on most days of a trip, and a chip that is always there teaches the eye to skip it exactly until the morning it matters); a gate in amber beside the code (rule 4 — amber is time and commitment, and the teal recipe already exists); and an alert when a gate is published (no data source; the value is the user's own).
