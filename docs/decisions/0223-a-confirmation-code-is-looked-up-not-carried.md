# 0223 — A confirmation code is **looked up**, not carried

**Status:** **Accepted and built 2026-09-11**
**Date:** 2026-09-11
**Session note:** [`planning/2026-09-11-a-flight-has-a-number-and-a-gate.md`](../planning/2026-09-11-a-flight-has-a-number-and-a-gate.md)

**Extends:** [0179](0179-a-booking-row-says-what-then-when-and-the-code-is-a-read.md) §2c — the same rule, finished. That ADR took the code off the Index row and said a booking is "_found_ by code and _read_ by code but need not be _scanned_ by code"; it scoped itself to one surface and flagged the risk of being wrong. This applies the sentence everywhere.
**Amends in place:** [0050](0050-home-quick-access-deep-links-and-empty-states.md) — the `הכרטיס הבא` tile keeps its tap and loses its printed code. [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §M and [0214](0214-the-night-board-has-one-subject-and-it-is-tomorrow.md) §3 — the board's and hero's code chips are gone, so 0214's "the code comes off at rank 1" is now true at every rank. [0222](0222-a-flight-has-a-number-and-a-gate.md) §4 — the gate no longer **inherits** the code's slot, because the code no longer has one.
**Relates:** [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §8 (the day card deleted the code first, and wrote down the argument this generalises), [0028](0028-plan-violet-color-budget-dark-ready.md) (rule 4 — why the tile's value stops being amber), [0011](0011-hard-soft-event-model.md) (the hard-edit warning, the one print that stays)

## Context

The owner, on the deployed ADR-0222 build, with two screenshots of the running app:

> I think that we should demote the confirmation code, it shouldn't appear outside the booking itself and in the booking. The flight number should though, also in flight

**The repo had already written the argument down twice and never finished it.** 0179 §2c took the code off the Index row on a measurement (133px of a 330px row) and concluded a booking is found and read by code but need not be scanned by one. 0174 §8 took it off the day card independently, and its comment states the rest of the case outright: _"the code is one tap away in the card this row opens, where the hard-edit warning already prints it, and on `BookingDetail`."_

So two of the five ambient surfaces had already deleted it, each for its own local reason, and neither generalised. The screenshots show what was left: `#8JHEI4` on the collapsed board mid-flight, the same code and `#HMXXJZ2FCT` on the lifted hero, and the `הכרטיס הבא` tile beneath them.

**And there is now a fact that wants that space.** 0222 shipped `flightNumber` the day before. `LY315` is what the departure boards, the gate agents and the cabin announcements all use; the confirmation code is a key for a desk you have already left. The owner's second sentence — _"also in flight"_ — names the one slot 0222 did not fill.

## Decision

### 1. The code appears in the booking, and in the guard that names a commitment

`BookingDetail`'s `Fact` keeps it. So does the **hard-edit warning** (`EventCard`, ADR-0011's guard): that is not an ambient print but an identification under warning — "the thing you are about to move is the one you booked, `#…`" — and 0174 §8 already named it as the place the code legitimately survives. Search keeps matching on it (`searchTerms`), because matching is not printing.

Everywhere else it goes.

### 2. Off the board and off the hero, and the flight's own name takes the mid-journey slot

The collapsed board loses the code on **both** slots; the lifted hero loses it on the transit point and the next line. In its place, mid-journey, the board and hero carry `flightNumber` in the neutral `.ident` register 0222 §6 established — no fill, no hue, because an identifier is neither a time nor a commitment.

This is the same slot, re-spent on the fact that is true for the whole journey rather than the one that stopped being actionable at the desk.

### 3. The gate stops inheriting and simply occupies

0222 §4 drew the gate as **inheriting** the confirmation code's slot inside the departure window, on the argument that printing a ticket number you cannot act on beside a gate you must act on is the wrong sentence. That argument is now moot in the best way: there is no code on this surface at all, so there is nothing to inherit and the branch that chose between them is gone. **The window survives unchanged** — `GATE_WINDOW_MINUTES` is about when a gate is worth saying, which never depended on the code.

### 4. A way IN to a booking does not print what is inside it

Two surfaces exist to _reach_ a booking, and both were printing the thing you go there for:

- **The `הכרטיס הבא` quick tile** (0050) — built for the code, which is exactly what makes it the clearest case: printing it here _is_ what "outside the booking" means. The tile keeps its job (the tap, the deep link) and says **which** booking it opens: the flight's own name where there is one, the title otherwise. Its value moves from `.code` (amber) to `.sub` (muted mono) — rule 4, since amber is commitment and an identifier is not one. `nextCodedBooking`'s selection is unchanged and is now load-bearing for a different reason: a booking that carries a code is exactly the one worth a shortcut **to**.
- **`EventForm`'s linked-booking statement** — `title · code` becomes `title · flightNumber`.

## Consequences

**`.qa .code` has no caller and is deleted rather than left as dead amber.** The one CSS rule this removes.

**Five surfaces lost a fact and one gained one**, and the compiler found every test that asserted the old behaviour — seven of them across `Board`, `HeroLift` and `EventForm`. Each was turned into an assertion of the new rule rather than deleted, so the sweep is pinned rather than merely performed.

**The risk 0179 named is now taken across the whole app**: "if that is wrong, the symptom will be people opening rows to check codes, which is worth listening for." One surface's worth of that risk has been live since 2026-08-09 without a report, and the owner's instruction is what extends it. The mitigation is unchanged and is the reason this is affordable: every surface that dropped the code is one tap from the booking that has it, and the quick tile — the fastest of those taps — still exists for exactly this.

**Not seen on a device.** Whether the mid-flight `.ident` reads as information or as a stray string beside the countdown belongs to the same pass that owns `GATE_WINDOW_MINUTES`.

**No mockup, deliberately.** This is a deletion applying a rule two ADRs already measured (0179 §2c's 133px, 0174 §8's overflow report) plus a like-for-like substitution into a chip slot 0222 measured last session. There is no new geometry to falsify; drawing it would have been ceremony.

**Rejected:** deleting the `הכרטיס הבא` tile along with its code (it is the fastest path to the booking, and demoting a fact is a reason to keep the path to it, not to cut it); keeping the code on the in-transit slot only (mid-flight is where it is _least_ actionable — the opposite of the case); and removing it from the hard-edit warning (that print identifies a commitment at the moment you are about to break it, which is 0174 §8's own carve-out).
