# 2026-08-23 — The arrival was read as a return flight

Design session on the transit booking form. Owner-relayed field report, quoted in
[ADR-0203](../decisions/0203-a-journey-has-one-date-and-its-arrival-is-a-clock.md);
the deliverables are that ADR and
[`mockups/a-journey-has-one-date-v1.html`](../../mockups/a-journey-has-one-date-v1.html).

## The forks put to the owner, and the answers

**1. One step per journey, or keep a step per leg?** → **one step per journey**,
reversing ADR-0159 §5. The measurement that justified "a leg is a step" was the
span field's 492px, and a clock-plus-relative-day leg costs two lines.

**2. How far should the date offer go — pills, pre-fill, or only where
unambiguous?** → **suggestion pills, never pre-filled.** A guessed date on a hard
commitment looks answered.

**3. Should `הלוך ושוב` be pre-offered from the trip's readiness?** → the owner did
not take the recommendation as written, and the objection is the useful part:

> _"when there's no transit at all I'm not sure if we want to prefill because lots of
> times the to and from are a little different (for example not the same airport,
> different layovers etc.). If you could think of an easy way to round trip without
> assuming that the journeys are identical (but opposite) then yeah maybe"_

That is what produced §6 — a **seeded** return rather than a derived one — and the
code agreed with the owner: `legBooking` already writes one `Booking` per leg with
its own two places and its own derived title, so the mirror was never in the model.
Four call sites of `const reversed = [...routePoints].reverse()`, all authoring
state. The pre-offer itself is left as a control in the mockup, because a "maybe" is
not settled from a desktop browser.

## Two owner notes that changed the design after it was drawn

**The suggestion should be filtered, not offered twice.**

> _"if you're, for example, choosing your origin, then it doesn't make sense that you
> do it on your day of coming back"_

Correct, and the app already had the predicate: `readiness.ts`'s
`reachesDestination`, module-private, three tiers, already deciding
`hasOutbound`/`hasReturn`. It became §5's filter and it is why the proposal's empty
step measures **238.5px against the shipped 241.5px** rather than more — one pill
instead of two. It is also ADR-0154's own founding observation one function over.

**Places can be suggested too, off the trip's existing legs.**

> _"at least we can for example suggest the arrival airport for the return flight if we
> have the flight to the destination"_

This narrowed a gap I had described too widely. I had said the home airport is
unknowable because `Place` is trip-scoped — true, but only for the very first
endpoint of the very first trip. Once a trip holds one leg, the return's departure is
that leg's landing and its **arrival is that leg's origin**. That is §8, and it
avoids the Map errand entirely.

Then, on the shape: _"add infra for future improvements if we decide"_ — so §8 is a
**table of sources** rather than two features, in the idiom ADR-0154 §5 already
chose. A cross-trip memory, a Gmail-parsed PNR, a Places call: each is a row.

## What reading the code changed before anything was drawn

- **`booking-prefill.ts` already drew the line this ADR needs:** _"No clock may be
  guessed, but the DAY still may."_ So offering a date is sanctioned and offering a
  time is not, and §5 did not have to argue it.
- **The words do not disambiguate either** — a return flight also has a `המראה`, and
  `bs-leg-head`'s `RouteLabel` renders only when `multiLeg || twoLegs`, i.e. exactly
  not in the reported case. Naming the place at each moment is half the fix and it
  is free.
- **The empty stop is unremovable.** `pp-clear` renders `{current && …}`, so the row
  that most needs removing has no control. ADR-0159 §5's _"clearing IS removing"_
  assumes a ✕ that is there.
- **`PLACE_SEARCH_KIND` has one member**, and `findPlace`'s own comment names the
  consequence: _"a train's stop is a station this restriction has no type for yet."_

## What the render falsified

The file's header lists eight. The three worth repeating here:

- **§7's central claim was wrong.** "A three-leg journey fits one step" measured
  **708px against 675px** — over. The section now states the ladder (220 / 396 /
  607px for 0 / 1 / 2 stops, and **720.5px for the whole step** at two stops, which
  scrolls) and leans on the two arguments that do not depend on the fold: the
  cross-leg refusal becomes in-step, and a hard commitment can be reviewed whole.
- **The data disagreed with itself** — a segment read `3:20 שע׳` between two clocks
  1:20 apart. Deriving every duration from the clocks plus each point's zone offset
  then found the real rule: **a day rollover is computed on instants, not wall
  clocks.** Tel Aviv 23:40 → Reykjavík 23:55 is the same calendar day, because the
  flight crossed three hours westward. §2's first frame is that case.
- **The footer was drawn with classes the app does not have** (`btn-primary` /
  `btn-ghost` against the real `fa-primary` / `fa-secondary`), so it rendered as two
  native buttons — a frame lying in the one place the format promises not to. Caught
  by looking at the dark render, not by reading.

## The owner's last note found the biggest thing in the session

> _"When the next checkpoint (arrival / layover) time is earlier than the previous, we
> should auto change it from 'same day' to 'next day'"_

That is what §2 already did, and verifying it rather than asserting it is what mattered:
dumping every derived word off the rendered page showed `19:40 → באותו יום | 19:05 →
למחרת`, in the very frame captioned **"the refusal, in-step"**. So the file was
contradicting its own design — because under §2 that refusal **cannot fire at all**.
`legBeforeArrival` exists only because two absolute dates let you enter a departure
before the previous arrival; with one date and every later moment resolved to the
nearest forward instant, an "earlier" clock is simply tomorrow. **Prevented rather than
refused** (ADR-0150 §8's own words), which is stronger than making it in-step — and it
deletes the argument ADR-0159 §5 called the strongest reason to step this form, so §7
now rests on the two that survive.

The same check found §2's first frame was passing for the wrong reason: `23:40 → 23:55`
is later by the wall clock too, so it never tested instants against wall clocks. It is
replaced by **Tokyo 21:00 → Honolulu 09:00** — an arrival twelve hours _earlier_ by the
clock that is still the same calendar day, 19 hours of zone shift against a 7-hour
flight. A wall-clock rule gets that one wrong by a full day, which is the whole
justification for the instants machinery.

## Left open, deliberately

Three device questions, all wired as controls with the recommendation as the
default: whether `באותו יום` shows always, whether the date suggestion is a pill or
a pre-fill, and whether `הלוך ושוב` is pre-offered. And one deferred feature with
its reason written down: a cross-trip place memory for the first endpoint of a first
trip.
