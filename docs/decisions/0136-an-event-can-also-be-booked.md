# 0136 — An event can also be **booked**, and it is one tap rather than a schema question

**Status:** Accepted — extracted 2026-07-30 (session 183) from [ADR-0135](0135-a-place-becomes-an-event-or-a-booking.md), which designed it inside a map phase; **its trigger was replaced 2026-07-30 (session 184)** after the owner rejected keying on a confirmation code. **It is not a map decision** — owner's call: _"independently from the maps, events in general."_ **Design only; nothing below is built.** The numbers in §5 are read from the live DOM of the mockup named below, in a headless browser.
**Date:** 2026-07-30

**Leaves** [0011](0011-hard-soft-event-model.md) **entirely alone**, and that is a correction: two earlier passes tried to read its "hard = real commitment (flight, reservation code)" as a rule the app could execute. §4 is why that fails — commitment and booked-ness are different axes, and the app's own `bookingDefaultKind` says so by making a restaurant booking **soft**.
**Extends** [0047](0047-booking-event-linkage-and-notes.md)/[0093](0093-offline-booking-linked-event-coherence.md) — the booking↔event pair gains a **second producer**, `EventForm`, alongside `BookingSheet`. `bookingEventFields` is unchanged and is what keeps the two producers from diverging.
**Applies** [0048](0048-index-build-data-model-refinements.md) unchanged — a linked event's place lives on its booking, which is why §3's conversion has no field-migration code of its own (the server already enforces it).
**Relates** [0109](0109-map-tab-design.md) §11 + [0038](0038-icons-and-canonical-category.md) (the category field this derives the booking type from, and where that category itself comes from), [0098](0098-index-landing-and-dedicated-screens.md) (the `Collapsible` primitive §2 reuses), [0113](0113-trip-destination-place-and-primary-timezone.md)/[0116](0116-day-aware-shelf-and-idea-target-day.md) §1 (the "sensibly defaulted, trivially fixable" posture the derivation takes), [0012](0012-conflict-lww-undo.md) (the undo §3's two writes must share), [0025](0025-trip-mode-edit-capability-tiers.md) (the tiers that already gate reaching this form).

Mockup: [`mockups/event-also-booked-v1.html`](../../mockups/event-also-booked-v1.html) — **its own file since session 184**, on the day view rather than the map: `EventForm` at its real length in three states (as shipped, the row not booked, the row booked), the same form **converting** an existing event and a third state for one **already linked**, the category moving both the default and the derived type live, and what each save produces on the day screen and the Index. The map's own phase is [`map-place-becomes-v1.html`](../../mockups/map-place-becomes-v1.html) (ADR-0135), which no longer draws any of this. Both entries in [`design/mockups.md`](../design/mockups.md) carry the detail.

## Context

Authoring in this app has always made you answer a schema question first. `EventForm` makes events; `BookingSheet` makes bookings; you pick the surface **before** you start typing, on every screen that authors either. A traveller who has just been given a confirmation number for the restaurant they already put on Thursday has no path that does not involve knowing which of those two things they should have made.

This was designed inside [ADR-0135](0135-a-place-becomes-an-event-or-a-booking.md), a Maps & Places phase, because that is where it surfaced — the map needed a place to become something, and "event or booking?" was the question in the way. It is **extracted here on the owner's call**, and the extraction is the point:

- **Nothing about it is map-shaped.** It lands on `EventForm`, which is hosted by `DayView`, `PlanDay` and the Map tab; it reads the form's own category; it writes a `Booking`. There is no map in it.
- **A reader would never have found it.** `CLAUDE.md` sends every session to the router first and tells it to read only the ADRs named for its domain. Filed under the map, this rule would be invisible to anyone touching event authoring — which is exactly the failure [session 180](../planning/2026-07-29-session-180-the-router-repaired.md) spent a session repairing for the map's own ADRs. Its router row is **Data model & events**.
- **And it is independently buildable.** It needs nothing from the map phase, and the map phase needs only its existence. The backlog carries them as two lines for that reason.

## Decision

### 1. An event and a booking were never alternatives, so stop asking which

**`EventForm` gains one row: a single `יש הזמנה` toggle.**

- **Off** → the save creates an event, exactly as it does today.
- **On** → the save **also** creates a `Booking` and links it, through the shipped `bookingEventFields`.

**The framing is the decision** (owner, session 184: _"many times an event is also a booking"_). Two earlier passes treated event and booking as **alternatives** — pick one, the app decides which. The model has never agreed: a `Booking` **has** a linked event, so "this event is also booked" is exactly `event.bookingId != null`. You are always creating an event. Sometimes it is also booked.

That reframing is what makes a one-tap control honest rather than a shortcut. "Event or booking?" asks a human to know the schema before they can say what they know. "Is this booked?" is a fact about the world, and it takes one tap, no typing, and no field they must fill.

**And it is not a confirmation code, which is what the previous pass keyed on.** The schema says why: `confirmationCode` is **nullable**, and every `Booking` field but `type` and `title` is optional. A table booked by phone has no number, and plenty of people never record one even when they have it. **There was no second signal to fall back on either** — the most common booking in the app is a restaurant, which `bookingDefaultKind` also makes **soft**, so "hard ⇒ booked" would have missed exactly the same case. The conclusion is not a compromise: **booked-ness cannot be inferred, so it is stated** — and the inference is demoted to the one honest job it can do, which is §2's default.

**The control already exists in the app's vocabulary.** The boolean idiom here is an `aria-pressed` **button** — the map's scope chip, `.map-maybes`, the Index filter chips are all this — so the row is that, in a form field slot. It carries no `field-label`: the button says `יש הזמנה`, and a label above it saying `הזמנה` is the same word twice for 20px.

> **Amended 2026-07-31 (session 185, at build):** this section said _"No new primitive, and none needed"_, and that was **wrong** — it read "the idiom exists" as "the component exists". The idiom existed **four times**, hand-rolled: `.map-maybes`, `.map-scopechip`, `.map-facets` and `.map-nearchip` in `map.css`, three of whose on-states were the same three declarations written three times. This row would have been the **fifth** copy, in a form, outside `map.css` — the one-off pile root rule 8 exists to stop, and the same warning `frontend/CLAUDE.md` already carries for `ui/feedback/`. So the build **extracted `ui/primitives/ToggleChip`** (+ `toggle-chip.css` + its own test file) and migrated all four Map chips onto it; this row is a call site. Costed and put to the owner before any code was written, per rule 8's ask-first clause — four shipped call sites on the app's most camera-sensitive screen is not a small extraction.
>
> Two things the extraction had to **keep**, and they are why the primitive has tones rather than one look: `.map-nearchip`'s teal is a **location** semantic (ADR-0109 §6-7 / ADR-0028), and `.map-maybes`'s dashed off-state is **provisional** (ADR-0110 §2). Neither is drift. What was drift, and is now corrected, is `.map-maybes`'s 7px/12.5px/600 against the `.choice-pill` grammar beside it in the strip.
>
> And one finding that changes the count: **`.map-facets` was never an `aria-pressed` toggle.** It has no such attribute — its on-state states that _filtering is live_ and its tap **opens** the strip. Putting it on a pressed primitive would announce a disclosure opener as pressed, which a screen reader has no way to see through. So the primitive carries a `semantics: 'toggle' | 'indicator'` axis, and only a toggle emits `aria-pressed`. Three real toggles, one look-alike.
>
> `.map-addmaybe` was deliberately **not** absorbed. It is a create (ADR-0135 §1's footer control), so it has no on-state to carry and owns a hover/disabled grammar a state chip has no use for.

**This is not a second way to author a booking.** `BookingSheet` remains where a booking is _written_: code, room, wifi, notes, documents, spans, and a transport booking's two places. This is the fast path that creates one, and it deliberately requires nothing.

### 2. What the category _does_ decide: the row's default, and the booking's type

**The row defaults from the category.** `lodging` and `transport` open **on** — a hotel or a flight you are putting on a day is near-certainly booked — and everything else opens **off**. That is the inference doing the one thing it can do honestly: offering a starting position, not deciding a fact. It is the "sensibly defaulted, trivially fixable, never a forced choice" posture of ADR-0113 and ADR-0116 §1.

**And it stops moving the moment a human touches it** — `bookedTouched`, the same guard `BookingSheet` already carries for `kind`. Changing the category after that re-derives the type and leaves the fact alone.

**The type derives from the same category**, via a new `CATEGORY_TO_BOOKING_TYPE` in `@waypoint/shared`, the inverse of the shipped `BOOKING_TYPE_TO_CATEGORY`, `as const satisfies Record<EventCategory, BookingType>`:

| Category                              | Booking type |
| ------------------------------------- | ------------ |
| `lodging`                             | `hotel`      |
| `food`                                | `restaurant` |
| `transport`                           | `flight`     |
| `sightseeing` · `nature` · `activity` | `activity`   |
| `shopping` · `services` · `other`     | `other`      |

**The form's category, and that is the better half of this section.** The category selector already leads the form (ADR-0109 §11: choosing it defaults the badge glyph) and already defaults from the icon's group (ADR-0038). So the derivation reads a signal a human has already been given a control over — which means **the fix for a wrong guess is a control the form already has**, not a second picker. A train station opens on `transport` and guesses `flight`; a train is one tap on the category the form was showing anyway.

**And the derivation is _stated_, never silent.** With the row on, a quiet line under it names what will happen — `האירוע יירשם גם כהזמנה · מלון` — and it **moves with the category pill** — so the app is visibly understanding rather than quietly deciding. A statement, not a second type picker: a picker is precisely what this ADR removes, and the "sensibly defaulted, trivially fixable, never a forced choice" posture is ADR-0113's and ADR-0116 §1's.

**A manually chosen category survives.** `bookingEventFields` already writes `seed.category ?? BOOKING_TYPE_TO_CATEGORY[booking.type]`, so a corrected category is not overwritten by the type's own default on the way through.

**What the row reveals when it is on:** the booking's own optional details, in a `Collapsible` (`ui/primitives/Collapsible`, generalised in ADR-0098's reuse audit) — a confirmation-code input, empty, placeholder `מספר אישור · לא חובה`. **Optional is the whole point:** the code is a detail _of_ a booking here, never the thing that creates one. Everything richer (room, wifi, notes, documents) stays in `BookingSheet`. Nothing else in the form moves: the category `ChoiceGrid` and the `IconPicker` stay exactly where they are, in the shipped order.

### 3. An existing event converts, and the model already knows how

The row appears on **create and on an unlinked existing event alike**. Turning it on for an existing event **converts** it.

**On an event that is already linked there is no control at all** — the row becomes a **statement with a way in** to the booking, because its code, room and notes live there now. That is the rule the form already runs for place and category (`showPlace`/`showCategory` are `!event?.bookingId`), one field wider, and it is also what makes the path one-way.

The cautious reading — _create the booking, link the event, move its fields_ — is answered by the model rather than by this design:

- **The field migration is an enforced invariant, not new work.** `events.service.ts` sets `placeId: null` whenever `bookingId` is set, on create **and** update, because a linked event's place lives on its booking (ADR-0048). The form has read the other half of that same rule since it shipped (`showPlace`/`showCategory` are `!event?.bookingId`). So conversion does not move the place off the event — **it puts the place on the booking, and the server takes it off.**
- **Both writes are shipped verbs.** `indexVerbs.createBooking` **without** its optional `event` seed (the event exists; a seed would create a second one), then an ordinary event patch setting `bookingId`. Two calls, the same shape `applySchedule` already has.

|                          |                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Booking**              | `type` from the form's category (§2), `title`/`placeId` from the form, the code **if one was typed**, schedule from the event |
| **Event**                | gains `bookingId`; the server nulls its `placeId`; **keeps its own `kind`, `category`, `title` and times**                    |
| **The form, afterwards** | place, category and the code line all leave it — they live on the booking now                                                 |

**The statement changes with the operation.** On a create it reads `האירוע יירשם גם כהזמנה · מסעדה`; on an existing event, `האירוע הזה יירשם גם כהזמנה · מסעדה, והמיקום והקטגוריה יעברו אליה`. Same quiet line, same no-picker rule.

**One-way, deliberately.** Once converted, the row is a statement rather than a toggle, so it cannot be switched back off here. Un-converting is **deleting a booking** that may by then carry documents, notes, a room and wifi — destructive, and it belongs to the booking's own surface with the confirm it already has. A field that quietly deletes an entity is not a field.

**No dialog.** The statement is the disclosure, and the save's toast carries the app's ordinary undo (ADR-0012) — which here must cover **both** writes as one action.

### 4. Hard vs. soft is derived at create, and **preserved** on conversion

- **No code** → a soft event (`EventForm`'s existing `event?.kind ?? EVENT_KIND.SOFT`, the same default `buildScheduleEvent` uses).
- **Booked, on a new event** → the booking's shipped per-type default, `bookingDefaultKind`: `hard` for flight, train, hotel and activity; `soft` for restaurant and other.
- **Booked, on an existing event** → **whatever the event already is.** Unchanged.

**Booked-ness and commitment are different axes,** and keeping them apart is load-bearing three times over:

- **It is why the trigger could not be `hard`.** A restaurant booking is soft by `bookingDefaultKind`, so "hard ⇒ booked" would miss the commonest booking there is (§1).
- **At create**, deriving `hard` from booked-ness alone would contradict that same default and make every dinner reservation ripple-immune.
- **On a conversion**, re-deriving would silently **harden** a soft sightseeing event the instant the row is switched on (`activity` → `hard`). ADR-0011's hard events are guarded on edit and never auto-moved; auto-hardening through a toggle is precisely that, through the back door.

So the row changes what the thing **is**, never how committed it is. The kind toggle stays in the form and follows the derivation only while untouched, using the same `kindTouched` guard `BookingSheet` already carries — the sibling of §2's `bookedTouched`.

### 5. What it costs, and it is paid on every screen

Measured on the real `.modal-form` — never the `.modal-card`, which is height-capped and scrolls, so reading it returns the same number however much the content grows:

| `EventForm` content          | Height                  |
| ---------------------------- | ----------------------- |
| As shipped                   | **482px**               |
| With the row, **not** booked | **560px** (+78px, ~16%) |
| With the row, booked         | **642px** (+160px)      |

**+78px is what someone who books nothing pays**, on every host of the form — the day view, the Plan builder and the Map tab alike — and that is the common case, so it is the number that matters. The booking's own fields cost the rest and only appear when there is a booking, which is the shape the design was aiming for: the person who never books never sees a booking field.

That is the price of one authoring model instead of two, stated rather than buried, and it is the number a later "can this be tighter" change has to beat. It is also why the row carries no `field-label`: 20px for a word the button already says.

### 6. What this does not do

- **It does not merge the two forms.** `BookingSheet` keeps everything §1 lists, and a transport booking — two places and a span — is still authored there. The fast path cannot produce one usefully, and the `transport → flight` guess in §2 is the honest edge of that.
- **It does not convert in the other direction.** A booking does not become a plain event by switching the row off, because on a linked event there is no row to switch (§3).
- **It does not touch `BookingSheet`'s own create flow**, its `seed`, or the Plan-home checklist that uses it.
- **It does not decide what happens on the Index's own "add booking" path.** That surface still asks the schema question, correctly: you went there to make a booking.

## Alternatives considered

**Leave it in ADR-0135.** What sessions 181–182 did. It works and it is unfindable: a session touching event authoring reads the router's **Data model & events** row and would never open a Maps & Places phase ADR. Session 180 spent a whole session on exactly this failure mode for the map's own decisions.

**Ask the schema question better** — a segmented "event / booking" control at the top of one merged form. Rejected: it keeps the question, and the question is the defect. It also doubles the form's conditional surface for a distinction that is not a fork at all — an event is always created either way (§1).

**Derive booked-ness from the category alone** (a `lodging` event is booked, full stop). Right at the edges and useless in the middle: a restaurant, a museum, a tour are genuinely either. Category survives as the row's **default** and as the type's, where it is a good guess, and is never asked to decide the fact.

**A confirmation code as the trigger** — the previous version of this ADR. Rejected by the owner (session 184) and the schema agrees: `confirmationCode` is nullable, every `Booking` field but `type` and `title` is optional, a table booked by phone has no number, and plenty of people never record one. It would have missed the commonest booking in the app, and there was no second signal to fall back on because a restaurant booking is also **soft**. Recorded at length because it was wrong in an instructive way: it looked like an inference and was actually a proxy, and the proxy was worse than the question.

**`hard` as the trigger.** Same failure, same reason (§4).

**Both `＋ אירוע` and `＋ הזמנה` as two entries** — the first pass, from the map side. It keeps the schema question and asks it at the moment the traveller knows least.

**Put the booking's fields on the form unconditionally.** Cheaper to build and it puts an empty confirmation-code box on every walk in the park. The row alone costs +78px; the fields cost another 82px and appear only when there is something to put in them.

**A post-save action on the day card instead of a form row.** Keeps the form at 482px and puts the decision where you often learn it, since confirmations arrive later. Rejected as the primary path because it costs a second step for the case you already know while typing, which is the friction this exists to remove — but it remains the obvious future addition if the device pass finds the row underused.

## Consequences

- **`EventForm` can produce a `Booking`.** A real widening of its contract on every surface that hosts it. The branch lives at save; the fields above it are unchanged.
- **Booked-ness is a stated fact, so it can be wrong.** Nothing derives it and nothing checks it: an event with a real reservation behind it that nobody toggled is simply not a booking, and will not appear in the Index or in Plan-home's readiness checks. That is the accepted cost of not pretending to infer, and it is why §2's default leans on for the two categories where the guess is safe.
- **Conversion is a two-entity write that must undo as one.** `createBooking` then a `bookingId` patch, with the toast's undo covering both — a half-applied conversion leaves a booking nothing links to.
- **An event can now lose fields by being edited.** Converting takes place and category off the event and onto the booking. It is ADR-0048's invariant and the server enforces it, but it is the first time a user action _in the event form_ triggers it.
- **`CATEGORY_TO_BOOKING_TYPE` is the inverse of a constant that already exists.** The two must be edited together when `BookingType` grows; the `satisfies Record<…>` on both is what makes that a compile error rather than a silent gap.
- **A guessed booking type reaches the data.** The statement makes it visible and the category makes it correctable, but a transport event will produce a `flight` someone has to fix. Accepted cost of not asking.
- **Two `*Touched` guards now sit side by side** (`kindTouched`, `bookedTouched`), both meaning "a human said this, stop deriving it". If a third appears, that is the moment to generalise them rather than the moment to add it. _(Session 185: `EventForm` gained **both** — it had `iconTouched` and no `kindTouched`, because until this row nothing in it derived the kind. So the form now carries three, and the generalisation moment named above has arrived; the backlog carries it.)_
- **The pressed chip is now a primitive** (`ui/primitives/ToggleChip`), and the four Map chips are call sites of it. See §1's amendment: the ADR was wrong to say none was needed, and the fifth copy is what made that visible.
- **Every authoring surface grows by 78px.** §5.
- **The Index gains rows from somewhere new.** A booking can now appear without anyone having opened the bookings screen.

## The device pass, and what it owns

- **Whether `יש הזמנה` is noticed at all** by someone who would say yes. It is one chip in a form of seven fields, and an unticked chip is easy to walk past.
- **Whether defaulting it ON for lodging and transport reads as helpful or as presumptuous**, especially the first time someone saves a hotel event they did not book.
- **Whether +78px of permanently-visible form is worth it on the day view and the builder**, where a code is rarer than on a place just picked. If not, the line moves behind the create-flow entry point rather than living in the form.
- **Whether a statement that moves under the category pill reads as clever or as unstable.** It is the only live derivation on any authoring surface.
- **Whether conversion is legible as a conversion**, given one toggle stands in for creating an entity and moving two fields off the one being edited.
- **Whether losing the place and category controls afterwards reads as correct or as a bug.** It is the shipped rule for a linked event, but nobody has met it by arriving from an event they authored themselves.
- **Whether one-way is accepted.** The first person to type a code by mistake will find the toast's undo, then look for a later reversal and not find one outside the booking's delete.
- **Whether the fast path's minimal booking feels finished or abandoned** when opened later in `BookingSheet` with only a code in it.
