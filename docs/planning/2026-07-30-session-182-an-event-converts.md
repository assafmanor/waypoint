# Session 182 — an existing event converts, and the model already knew how (2026-07-30)

Paper only, one amendment: [ADR-0135 §4a](../decisions/0135-a-place-becomes-an-event-or-a-booking.md),
plus the state it needed in `mockups/map-place-becomes-v1.html`. Nothing of ADR-0135 is built yet,
so this widens the design the build session will take rather than changing something shipped.

> _"I want the event form, from the day view too, to be able to automatically be converted to
> bookings in the same way."_

That withdraws §4's **create-only** scoping, which I wrote one session ago and hedged with "a
different operation with its own failure modes, not a field."

## The caution was answerable, and the answer was already in the tree

§4 listed what a conversion would have to do — _create the booking, link the event, move its
fields, decide what happens to the ones a booking does not have_ — and treated that list as the
reason to defer. Checked against the code, three of the four are not this design's problems:

- **The field migration is an enforced invariant, not new work.** `events.service.ts` writes
  `placeId: null` whenever `bookingId` is set, on **create and update** both, because a linked
  event's place lives on its booking (ADR-0048). The form has been reading the other half of that
  same rule since it shipped: `showPlace`/`showCategory` are `!event?.bookingId`. So the conversion
  does not move the place off the event — it puts the place on the **booking**, and the server
  takes it off.
- **Both writes are shipped verbs.** `createBooking` **without** its optional `event` seed (the
  event exists; passing a seed would create a second one), then an ordinary event patch setting
  `bookingId`. That is the two-call shape `applySchedule` already has for create-then-consume.
- **What is left is the one real cost:** the two writes have to **undo as one**. A half-applied
  conversion leaves a booking nothing links to, which is worse than no conversion. Same requirement
  §5's consume already imposes, so the build gets one pattern to be careful about, not two.

## The one thing that had to be decided rather than looked up

**The kind is preserved, and is not re-derived.** The create path takes it from
`bookingDefaultKind` because nothing has been said yet. On an existing event a human has already
said it — and re-deriving would silently **harden** a soft sightseeing event the instant a ticket
number is typed (`activity` → `hard`). ADR-0011's hard events are guarded on edit and never
auto-moved; auto-hardening through a text field is exactly that, through the back door.

So conversion changes what the thing **is**, never how committed it is. That is the same
distinction §6 already drew for creation — _the code decides the entity, not the kind_ — applied
one case further, and it is the sentence I'd expect a later reader to try to "simplify" away.

Two smaller calls that follow from it:

- **It is one-way through this field.** Once converted, the code lives on the booking and the line
  disappears from the event form, so a code cannot be cleared back into an event here. Un-converting
  is **deleting a booking** that may by then carry documents, notes, a room and wifi — destructive,
  and it belongs to the booking's own surface with the confirm it already has. A field that quietly
  deletes an entity is not a field.
- **No dialog.** The statement is the disclosure, which is the posture §2 already took; it just
  becomes a different sentence, because it is describing a different operation:
  `האירוע יהפוך להזמנה · מסעדה, והמיקום והקטגוריה יעברו אליה`.

## What the mockup gained, and one thing it would have got wrong

A `⟨הטופס פועל על⟩` toggle: **אירוע חדש** vs **אירוע קיים**. It moves the modal title, the derived
sentence, and the outcome frame's caption.

And one detail worth the trouble: on a create the outcome card wears the **green "new"** outline;
on a conversion it wears an **amber "changed"** one. Reusing the green would have been the easy
thing and it would have made the frame lie — a conversion adds nothing to the day, it changes the
card that was already sitting there. The frame's whole job is showing what a save does to a screen,
so a mark that says the wrong verb is worse than no mark.

## Not done here

The build, still. It now covers both paths in one field, which is the right shape: create and
convert are the same line doing the same job to two different starting points. The backlog line
carries the full scope.
