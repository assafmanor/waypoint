# Session 184 — booked is a fact, not a confirmation code (2026-07-30)

Paper only. [ADR-0136](../decisions/0136-an-event-can-also-be-booked.md)'s **trigger is replaced**,
its file renamed, and its mockup split out of the map's:
[`mockups/event-also-booked-v1.html`](../../mockups/event-also-booked-v1.html) is new,
`map-place-becomes-v1.html` is back to drawing only the map.

> _"Many times an event is also a booking… but not all bookings have booking numbers and not all
> people are interested in booking numbers. So I liked the general idea but it shouldn't trigger
> on booking number."_

## The trigger was a proxy, and the schema refutes it

Two sessions keyed on a confirmation code. The repo says no, in two places I had read and not used:

- **`confirmationCode` is nullable**, and every `Booking` field but `type` and `title` is optional.
  A table booked by phone has no number. The model already said a booking needn't have one.
- **There was no fallback signal either.** The obvious second guess — hard ⇒ booked — fails on the
  same case, because `bookingDefaultKind` makes a **restaurant booking soft**. The commonest
  booking in the app is invisible to both signals.

So the conclusion is not a compromise: **booked-ness cannot be inferred.** It has to be stated.
What inference keeps is the one honest job it has — a _default_.

That is worth naming as a pattern, because I got it wrong twice in a row: **a proxy that correlates
with the thing is not the thing.** A code correlates with booked-ness and is absent in the case
that matters most, which is the worst possible shape for a trigger — it works in testing and fails
on the ordinary user.

## The reframe did the actual work

The owner's first clause is the design:

> _"Many times an event is **also** a booking."_

I had been treating them as **alternatives** — "the code decides which" — through three passes. The
model has never agreed: a `Booking` **has** a linked event, so "this event is also booked" is
exactly `event.bookingId != null`. There was no fork to decide.

So: you are **always** creating an event. One `יש הזמנה` toggle says it is **also** booked, which
additionally creates the `Booking` and links it. One tap, no typing, no required field — which is
what makes it work for a phoned-in table and for people who never record numbers.

Once that lands, the rest falls out:

- **The default comes from the category** — `lodging` and `transport` open **on**, everything else
  off — and stops moving once a human touches it (`bookedTouched`, the sibling of the shipped
  `kindTouched`). Inference offering a starting position is honest; inference deciding a fact was
  not.
- **The optional code becomes a detail _of_ a booking** rather than the thing that creates one,
  revealed only when the row is on, placeholder `מספר אישור · לא חובה`.
- **The control already existed.** The app's boolean idiom is an `aria-pressed` button — the map's
  scope chip, `.map-maybes`, the Index filter chips. No new primitive.
- **An already-linked event gets no control at all**, only a statement with a way in — the rule the
  form already runs for place and category, one field wider. Which is also what makes the path
  one-way, without needing a rule for it.

## Two files, two subjects

The map mockup had grown four surfaces, three of which belonged to a decision that had just been
moved out of the map. Session 183 papered over that with a "shared mockup, older filename" note in
the catalog; the owner asked for the split instead, and they were right — **two files claiming one
design is how the older one starts to rot.**

- `event-also-booked-v1.html` — new, on the **day view**. The form in full, three states, the
  category moving the default and the type live, and what each save produces.
- `map-place-becomes-v1.html` — back to the way-in block alone. Its manifest fell from nineteen
  stylesheets to **eleven** when the form left, which is a decent proxy for how much of it was
  someone else's subject.

The ADR was renamed too (`0136-a-confirmation-code-…` → `0136-an-event-can-also-be-booked`), which
is free here because it has not been merged. Renaming after a merge is the churn session 183 chose
to avoid; renaming before one is just correcting a name.

## What was measured, again

| `EventForm` content          | Height                  |
| ---------------------------- | ----------------------- |
| As shipped                   | **482px**               |
| With the row, **not** booked | **560px** (+78px, ~16%) |
| With the row, booked         | **642px** (+160px)      |

**+78px is what someone who books nothing pays**, on every host — the common case, so it is the
number that matters. The booking's own fields cost the rest and only exist when there is a booking.

Dropping the row's `field-label` was worth **20px**: the button says `יש הזמנה` and a label above it
saying `הזמנה` is the same word twice. And `.field` is a column, so the `inline-flex` pill stretched
to full width and read as a **disabled input** until it was given `width: fit-content` — a control
that looks inert is a worse defect than one that is slightly too small.

## Not done here

The build. Both backlog lines are current, and they remain independent: the map half can ship
against today's `EventForm` and simply produce events until this one lands.
