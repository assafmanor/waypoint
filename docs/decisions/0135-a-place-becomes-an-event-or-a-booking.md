# 0135 — A place becomes an event or a booking, and **the confirmation code decides which**

**Status:** Accepted — designed 2026-07-29 (session 181), after the owner rejected the session's first design in place; **§4a added 2026-07-30 (session 182)**, which withdraws §4's create-only scoping so an existing event converts too. **Design only; nothing below is built.** The mockup renders the shipped stylesheets in a headless browser and every number in §8 is read from its live DOM, but no canvas over real tiles has been seen (ADR-0121 §13) and nothing here claims otherwise.
**Date:** 2026-07-29

**Extends** [0121](0121-embedded-map-phase-6-design.md) **§8** — the selection-revealed way-in block, which lists one entry per reference a place **already has**, gains a single primary action (§1). §8's own rule (a row tap normalises the sheet to `half`) is untouched.
**Extends** [0134](0134-the-map-is-where-a-forms-place-comes-from.md) **§9** — its fourth target is the precedent this reads from, and §3 says why the errand's _channel_ is deliberately not reused. §3 of that ADR ("only one place is being chosen") is what makes §7 absent-during-an-errand.
**Amends** [0011](0011-hard-soft-event-model.md) in **application, not in substance** — its "hard = real commitment (flight, **reservation code**)" stops being a description a human applies by hand and becomes the thing the app reads (§2). The primitive is unchanged.
**Applies** [0027](0027-soft-item-lifecycle-shelf-slip.md) **§2** and [0116](0116-day-aware-shelf-and-idea-target-day.md) **§1** unchanged: consume-on-schedule is reached from a new surface, not redefined (§5), with one case named where it deliberately does not fire.
**Relates** [0112](0112-place-in-trip-is-referenced-not-cached.md) (why a create is what puts a place in the trip), [0115](0115-plan-mode-place-research.md) §3 (`＋ אולי`, the only path today, and the control this reuses), [0047](0047-booking-event-linkage-and-notes.md)/[0093](0093-offline-booking-linked-event-coherence.md) via `bookingEventFields` (the booking→event pair §2 produces), [0098](0098-index-landing-and-dedicated-screens.md) (the `Collapsible` primitive §4 reuses), [0028](0028-plan-violet-color-budget-dark-ready.md) (why the control is neutral), [0113](0113-trip-destination-place-and-primary-timezone.md) (the "sensibly defaulted, trivially fixable" posture §2's derivation takes), [0017](0017-mobile-first-device-targets.md) (the 360×640 screen §8 measures against), [0090](0090-back-is-computed-from-nav-state.md) (which this needs **nothing** from, and that is the finding).

Mockup: [`mockups/map-place-becomes-v1.html`](../../mockups/map-place-becomes-v1.html) — the block in three states (shipped, the rejected menu, the proposal), the form drawn over the map in the shipped `modal`/`field`/`collapsible`/`place-picker` css with the code line open and shut, and a panel measuring all three block states from the live DOM at three screens and two stops. Its entry in [`design/mockups.md`](../design/mockups.md) carries the detail.

## Context

A place added from the map can only ever be an **idea**. ADR-0115 §3 made `＋ אולי` one tap from a Google result, and ADR-0134 made the map the route a form takes to _get_ a place — but there is no path in the other direction. Standing on a place that is in the trip, nothing says "put this on Tuesday at 14:00" or "attach the reservation I just got".

Checked against the tree first:

- **`refEntriesFor` builds ways in to references that already exist.** One `.map-ref` per reference — an idea to the shelf, an event to its day, a booking to its detail. There is no create branch.
- **The row grammar is full** (ADR-0109 §1: badge · name · meta · distance · `נווט`), and ADR-0134 §4 already measured why nothing more fits there: `.map-right` is a column, so a verb added beside `נווט` buys no width and costs height.
- **Everything a create needs already exists on both sides.** `EventForm` takes `maybeItem` (the schedule-from-shelf flow, whose save runs `verbs.schedule` — create the event **and** consume the idea, one action). `BookingSheet` takes `seed`. `bookingEventFields` already produces a booking's linked event identically on client and server. And **the Map tab already hosts a form**, with `usePlaceErrandReturn<BookingSheetDraft>('booking', 'map', …)` already wired.

### The first design, and why the owner rejected it

This session's first pass hung **two** entries in the way-in block — `＋ אירוע` and `＋ הזמנה` — in the same grey `.map-ref` box as the references. The owner's verdict: **"cluttered and very amateur looking"**, and _"maybe the user doesn't choose one or the other but the code understands instead."_

Both halves were right, and both are recorded because the reasons generalise:

- **The shape.** A `.map-ref` says "this place is already there" and ends in a chevron because it **goes** somewhere. A create goes nowhere. Dressed in the same box, the expanded row became four equal grey rectangles — a summary, a navigation list and a **command menu** in one card. A selected item gets one obvious action; a create is not the references' peer.
- **The question.** "Event or booking?" is the app's question, not the traveller's. It asks a human to know the schema before they can say what they know.

## Decision

### 1. One action, in a control this tab already owns

The block keeps its reference list unchanged and gains a **footer with a single control**: `＋ שיבוץ ליום`.

It is `.map-addmaybe` — the pill the tab already uses for _make something out of this place_ (`＋ אולי` on a Google result). Same job, same neutral `--cta` (amber is time and commitment, plan violet is Plan mode, a create is neither: ADR-0028, root rule 4). What separates it from a reference row is **shape and weight**, not a new colour, which is what stops the block reading as a list of equals.

**One scoped size change, and it is a floor rather than a taste.** On a result row that pill is a trailing chip in a dense 68px row (~29px tall). Here it is the selected row's primary action, so it meets 44×44 (ADR-0017). Scoped to `.map-refs-foot`, so the result row is untouched.

No group header, and no second control: ADR-0134's session-164 correction ("the two corpora are not two sections") applies to a two-item menu with the same force.

### 2. The code decides the entity, and it is the app's own definition of commitment

**`EventForm` gains one collapsed line: `יש קוד הזמנה?`.**

- **Empty** → the save creates a **soft event**, exactly as it does today.
- **Filled** → the save creates a **`Booking`** (and its linked event, through the shipped `bookingEventFields`) instead of a bare event.

The traveller answers a fact about the world — _do I have a confirmation number?_ — and the app picks the entity. That is not a metaphor for ADR-0011, it is ADR-0011's own sentence: _"hard = real commitment (flight, **reservation code**)."_ The definition already existed; only nothing had ever read it.

**The booking's type is derived from the form's own category field** — a new `CATEGORY_TO_BOOKING_TYPE` in `@waypoint/shared`, the inverse of the shipped `BOOKING_TYPE_TO_CATEGORY`, `as const satisfies Record<EventCategory, BookingType>`:

| Category                              | Booking type |
| ------------------------------------- | ------------ |
| `lodging`                             | `hotel`      |
| `food`                                | `restaurant` |
| `transport`                           | `flight`     |
| `sightseeing` · `nature` · `activity` | `activity`   |
| `shopping` · `services` · `other`     | `other`      |

**The form's category, not the place's, and that is the better half of this section.** The category selector is already in the form, already leads it (ADR-0109 §11: choosing it defaults the badge glyph), and already defaults from the picked place through the icon's group (ADR-0038). So the derivation reads the signal a human has already been given a control over — which means **the fix for a wrong guess is a control the form already has**, not a second picker and not a trip to the booking. A train station opens on `transport` and guesses `flight`; a train is one tap on the category the form was showing anyway.

**And the derivation is _stated_, never silent.** With a code filled, a quiet line under it names what will be created — `תיווצר הזמנה · מסעדה, ואפשר להשלים אותה אחר כך` — and it **moves with the category pill**, so the app is visibly understanding rather than quietly deciding. A statement, not a second type picker: a picker is precisely what this section removes, and the "sensibly defaulted, trivially fixable, never a forced choice" posture is ADR-0113's and ADR-0116 §1's.

**A manually chosen category survives into the booking's linked event.** `bookingEventFields` already writes `seed.category ?? BOOKING_TYPE_TO_CATEGORY[booking.type]`, so the category a human corrected is not overwritten by the type's own default on the way through.

**This is not a second way to author a booking.** `BookingSheet` remains where a booking is _written_ (code, room, wifi, notes, documents, spans, and a transport booking's two places). This is a **fast path** that produces a minimal booking, which is then one tap away from the row you were standing on — it appears in that row's own way-in block as a `הזמנה` reference the moment it saves.

### 3. This is **not** the errand run backwards, and the difference is what the errand is for

The tempting reading is "ADR-0134 hands a place to a form; this hands a form to a place; reuse the channel." It is wrong, and saying why is most of this ADR's value.

**The errand exists because of loss, not because of direction.** A form is a `Modal` with local state that no URL addresses, so **leaving** it loses it. Everything expensive in ADR-0134 — the opaque `draft`, `usePlaceErrandReturn`'s exactly-once apply, the `hostTab` filter that took four attempts and a real browser to get right, five hosts wired — is machinery for surviving a **round trip between two screens**.

**Here there is no round trip.** The form opens **over the map, on the map's own tab**, which this tab already does for `BookingSheet`. Nothing is left, so nothing needs preserving: no draft, no `returnTo`, no host waiting on a channel, no nav-state rule. `Modal`'s own `useOverlay` is the entire back story — back closes the form and lands on the map with the row still selected.

**The precedent inside ADR-0134 is §9, not §1.** Its fourth target has no `returnTo` because it **starts on its own destination**, and session 179 named the rule: the target is the row, it has no field, and neither exit navigates. This is that shape from the other side.

**What the errand _is_ owed: one hook call.** The tab now hosts `EventForm` too, so it must call `usePlaceErrandReturn<EventFormDraft>('event', 'map', …)` — session 165's rule, _a host that renders a form owes it a way back_. Without it, a place errand started from the form's own picker (the field keeps its `onFind`, so the place stays changeable) returns to a closed form with everything typed gone. One line in a mechanism already generalised for exactly this, and the `hostTab` filter already handles a `returnTo` pointing at the Map.

### 4. What the form's new line costs, and where it lands

- **It is a `Collapsible`** (`ui/primitives/Collapsible`, ADR-0098's reuse audit generalised it), closed by default, rendering as a **link-weight line rather than a field**. For most events there is no code, and a labelled empty box implies there should be.
- **It is app-wide, deliberately** (owner's call this session). `EventForm` is hosted by `DayView` and `PlanDay` as well as the Map, and the gap it closes is the same everywhere: today you must decide "event or booking" _before you start typing_, on every authoring surface. A map-local sheet would have been a third authoring surface beside `EventForm` and `BookingSheet` — the parallel copy root rule 8 and ADRs 0078/0079/0094/0095 exist to prevent.
- **It appears on create _and_ on an unlinked existing event** — see §4a, which reverses this section's original create-only scoping at the owner's request (2026-07-30, session 182). It is absent on an event that is **already** booking-linked, for the same reason `showPlace`/`showCategory` are: that field lives on the booking now.
- **Everything else in the form is untouched, and that includes the two controls this design was first drawn without.** The category `ChoiceGrid` and the `IconPicker` stay exactly where they are, in the shipped order (category leads, then icon + title), and they are chosen exactly as they are today. The mockup draws the form **in full** for that reason: the first pass drew four fields, which made the new line look like a far bigger share of the form than it is.
- **The place arrives pre-filled** through one new field on `defaults` (`placeId`); `BookingSheet`'s `seed` is untouched by this design, since the fast path no longer opens it. `PlacePicker` renders its shipped `filled` state and keeps `onFind`.

### 4a. An existing event converts, and the model already knows how

**Amended 2026-07-30 (session 182), at the owner's request:** _"I want the event form, from the day view too, to be able to automatically be converted to bookings in the same way."_ §4's create-only scoping is withdrawn. The line appears on an existing, unlinked event, and typing a code into it **converts** the event into a booking.

The reason the original scoping was cautious — "create the booking, link the event, move its fields" — turns out to be answered by the model rather than by this design. Checked in the tree before deciding:

- **The field migration is already an enforced invariant.** `events.service.ts` sets `placeId: null` whenever `bookingId` is set, on both create and update, because "a linked event's place lives on its booking" (ADR-0048). The form has been reading the other half of the same rule since it shipped: `showPlace`/`showCategory` are `!event?.bookingId`. So the conversion does not have to move the place — **it has to put the place on the booking, and the server takes it off the event.**
- **Both writes are shipped verbs.** `indexVerbs.createBooking` (**without** its optional `event` seed — the event already exists, and passing a seed would create a second one) and an ordinary event patch setting `bookingId`. Two calls, the same shape `applySchedule` already has for create-then-consume.

**What conversion does, exactly:**

|                          |                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Booking**              | `type` from the form's category (§2), `title`/`confirmationCode`/`placeId` from the form, the schedule from the event                               |
| **Event**                | gains `bookingId`; the server nulls its `placeId`; **keeps its own `kind`, `category`, `title` and times**                                          |
| **The form, afterwards** | place, category and the code line all disappear from it — they live on the booking now, which is the rule the form already had for two of the three |

**The kind is preserved, and is _not_ re-derived.** This is the one place the create path's rule must not be copied: at create, kind comes from `bookingDefaultKind` because nothing has been said yet. On an existing event a human has already said it, and `bookingDefaultKind` would silently **harden** a soft sightseeing event the moment a ticket number is typed (`activity` → `hard`). ADR-0011's hard events are guarded on edit and never auto-moved; auto-hardening through a text field is precisely that, through the back door. So conversion changes what the thing **is**, never how committed it is.

**The statement changes with the operation, because it is a different sentence.** On a create it reads `תיווצר הזמנה · מסעדה`; on an existing event, `האירוע יהפוך להזמנה · מסעדה`. Same quiet line, same no-second-picker rule (§2) — it just stops describing a creation it is not doing.

**It is one-way through this field, and deliberately.** Once converted, the code lives on the booking and the event form no longer shows the line, so a code cannot be cleared back into an event here. Un-converting is **deleting a booking** that may by then carry documents, notes, a room and wifi; that is a destructive act and it belongs to the booking's own surface with the confirm it already has. A field that quietly deletes an entity is not a field.

**No dialog.** The statement is the disclosure, which is the posture §2 already took, and the save's toast carries the app's ordinary undo (ADR-0012) — which here has to cover **both** writes as one action, the same requirement §5's consume already imposes.

### 5. The originating idea is consumed — through the path that already consumes it

If the place has **exactly one** idea referencing it, the action opens the sheet the shelf opens (`EventForm maybeItem={idea}`) and the save runs `verbs.schedule`: the event is created and the `MaybeItem` consumed, in one action. Not a new decision — ADR-0027 §2's, reached from a new surface.

**Why consuming is not optional.** Leaving the idea parked leaves the same place both scheduled and shelved: two rows in the list, two pins on the canvas, one of them a lie. The map is where that duplication is most visible.

**The code path consumes too.** A booking creates a linked event, so it puts something on the day exactly as scheduling does, and produces the same duplication. The consume is already a **separate call** on the existing path (`OUTBOX_VERB.CONSUME_MAYBE_ITEM` — see `applySchedule`, which issues it after the create rather than as part of it), so both paths end in the same line. What the build adds is a standalone dispatch for it with the same undo coverage `applySchedule` has, not a new sync path.

**With more than one idea, nothing is consumed, and that is deliberate.** Two ideas on one place are two intentions ("a meal there", "drinks there"), and scheduling one must not eat the other. The block itself cannot tell them apart — a shipped idea entry reads `על המדף · <day>` and nothing else — so the screen does not guess: the create is fresh, and the ideas stay on the shelf where scheduling one names it.

### 6. Hard vs. soft is **derived**, and never asked at creation

- **No code** → a soft event (`EventForm`'s existing `event?.kind ?? EVENT_KIND.SOFT`, the same default `buildScheduleEvent` uses). A place you saw on a map and are putting on a day is precisely not a commitment.
- **A code** → the booking's shipped per-type default, `bookingDefaultKind`: `hard` for flight, train, hotel and activity; `soft` for restaurant and other.

**So "the code decides the entity" is not "the code decides the kind",** and that distinction is load-bearing: a dinner reservation stays **soft**, exactly as authoring it in `BookingSheet` produces today. Deriving `hard` from the mere presence of a code would have contradicted a shipped default and made every restaurant ripple-immune.

The kind toggle stays in the form and follows the derivation while untouched, using the same `kindTouched` guard `BookingSheet` already carries — so a human choice is never overwritten by a later derivation.

### 7. Absent while an errand is live

When a place errand is pending, the tab is answering one question — _choose one place_ — and ADR-0134 §3 is explicit that the verb **changes** rather than accumulating. The footer is absent, exactly as `נווט` is: a control only where it has something to do, the derived-affordance rule this tab already runs for `קרוב עכשיו`, `אולי`, `מה נשאר`, `באזור` at zero and `frame` with nothing to frame.

### 8. What it costs, measured — and the finding is not the one this was built to look for

Read from the mockup's live DOM. A plain row is **73px**; the sheet's scroller is `.wp-snapsheet-body`.

| Selected row             | 390×844 · `half` (267px) | 360×640 · `half` (153px) | `full` (517 / 313px) |
| ------------------------ | ------------------------ | ------------------------ | -------------------- |
| As shipped (1 reference) | 142px                    | 142px                    | fits                 |
| **The rejected menu**    | 234px (**+92**)          | 234px, over by 81px      | fits                 |
| **This design**          | **198px (+56)**          | 198px, over by 45px      | fits                 |

One control instead of two costs **+56px instead of +92px** — under a plain row rather than over it — and at 390 `half` it is the difference between the block fitting with room and the block being the sheet.

**The form's own length is the other half of the cost, and it is the app-wide half.** Measured on the real `.modal-form` (never the `.modal-card`, which is height-capped and scrolls — reading it returned the same number for the closed line and the open one, a measurement that stops moving when the thing it measures grows):

| `EventForm` content                   | Height                  |
| ------------------------------------- | ----------------------- |
| As shipped                            | **482px**               |
| With the line, closed                 | **560px** (+78px, ~16%) |
| With a code and the derived statement | **617px** (+135px)      |

+78px closed is what **every** host of this form pays, the day view and the Plan builder included, for a line most events will never open. That is the price of the app-wide call, stated rather than buried: it buys one authoring model instead of two, and it is the number a later "can this be tighter" change has to beat.

**And the block already overflows the `half` sheet on a 360 before this phase adds anything:** a place with two references is 186px against a 153px scroller, as shipped. So the create does not introduce the condition; it makes it ordinary. **One thing therefore ships with it that the shipped code never needed: selecting a row scrolls it into view** — `scrollIntoView({ block: 'nearest' })` inside the sheet's own scroller. Without it the footer can open entirely below the fold on the screen ADR-0017 names as the small target, and the action would be the half you cannot see. It is a fix for something already true, arriving with the change that makes it common.

### 9. What this does not do

- **It does not touch the Google result row.** A result not in the trip has no way-in block, because it has no references. The route stays `＋ אולי` and then the row's own footer — which also protects a measurement: ADR-0134 §5 measured that row to its limit (68px, six rows at 390).
- **It does not add a place-detail screen.** The place's answer is the row, not a screen of its own.
- **It does not change what a row tap or a pin tap does** (ADR-0129 §1 / ADR-0134 §6).
- **It does not take Phase 11** (booking phase labels on pins), which is a legibility question about the amber budget and deserves its own call.
- **It does not build ADR-0131 §9's long press**, still blocked on the coordinate-only `Place`.

## Alternatives considered

**Two entries, `＋ אירוע` and `＋ הזמנה`, in the block.** This session's first design; rejected by the owner and measured against in §8. It looks like a command menu because it is one, and it asks the schema's question.

**A map-local "create" sheet** carrying day, time and code. Contained blast radius, and a third authoring surface beside `EventForm` and `BookingSheet`. Rejected under root rule 8; the owner chose the app-wide line instead.

**Event only; no code line, booking stays out of the map.** The smallest change and the cleanest screen. Rejected because it drops the backlog line's second half ("attach the reservation I just got") and leaves the schema question merely moved rather than retired.

**Derive the entity from the place's category** (a hotel place → a booking, a temple → an event). Right at the edges and useless in the middle: a restaurant is the most common case and is genuinely either. Category survives as the **type** default (§2), where it is a good guess, and is not asked to decide the entity, where it is a bad one.

**A code makes it hard.** Rejected in §6: it contradicts `bookingDefaultKind` and would make every dinner reservation ripple-immune.

**Reuse the errand channel, backwards.** §3: it would navigate away from the map to author something about a place you are standing on, and pay the draft machinery's whole cost to protect a form nobody has typed into yet.

**Put the action on the row itself.** Measured and rejected before this session: ADR-0134 §4 established `.map-right` is a column, so a verb there costs height on every row rather than width on one.

## Consequences

- **`EventForm` can now produce a `Booking`.** That is a real widening of its contract, on every surface that hosts it, and it is the owner's explicit call. The branch lives at save; the fields above it are unchanged.
- **The Map tab becomes a host of `EventForm`**, and therefore owes it `usePlaceErrandReturn<EventFormDraft>('event', 'map', …)`. Forgetting it reintroduces session 165's exact failure on a fifth host.
- **Conversion is a two-entity write that must undo as one.** `createBooking` then a `bookingId` patch, with the toast's undo covering both — a half-applied conversion leaves a booking nobody linked to, which is worse than no conversion. Same requirement the consume already imposes, so there is one pattern to get right, not two.
- **An event can now lose fields by being edited.** Converting takes place and category off the event and onto the booking. It is ADR-0048's invariant rather than a new rule, and the server enforces it, but it is the first time a user action _in the event form_ triggers it.
- **A standalone consume gains a dispatch.** Today `consumed` flips only under `TRIP_ACTION.SCHEDULE`; the code path needs the same flip without an event of its own, with matching undo.
- **`CATEGORY_TO_BOOKING_TYPE` is a new shared constant**, and it is the inverse of one that already exists. The two must be edited together when `BookingType` grows — the `satisfies Record<…>` on both is what makes that a compile error rather than a silent gap.
- **A guessed booking type reaches the data.** The statement makes it visible and the booking's own form makes it correctable, but a transport place will produce a `flight` that someone has to fix. That is the accepted cost of not asking.
- **`scrollIntoView` becomes load-bearing** on the selected row (§8). A future change adding a second footer control has a table to answer.
- **"Exactly one idea" is a branch in meaning, not just in data** (§5), and it is the kind of rule that gets simplified away by someone reading one half. Its reason is stated so that edit has to argue with it.

## The device pass, and what it owns

- **Whether `יש קוד הזמנה?` is discoverable enough** for someone who _does_ have a code. It is deliberately quiet, and quiet can mean invisible.
- **Whether +78px of permanently-visible form is worth it on the day view and the builder**, where the place usually came from a picker rather than from the map and the code is rarer still. If it is not, the line moves behind the create-flow entry point rather than living in the form.
- **Whether the statement moving under the category pill reads as the app being clever or as the app being unstable.** It is the one piece of live derivation on any authoring surface.
- **Whether `תיווצר הזמנה · מסעדה` reads as an outcome or as a warning**, and whether not being able to correct the type right there is frustrating rather than calm.
- **Whether the pill reads as the row's primary action** at 44px, against a reference row above it.
- **Whether 198px at `half` on a 360 is usable** even with the scroll-into-view — or whether a row tap on a small screen should drop to `full` rather than `half` when the block will overflow.
- **Whether conversion is legible as a conversion.** `האירוע יהפוך להזמנה · מסעדה` is one quiet line standing in for an operation that creates an entity and moves two fields off the one you are editing.
- **Whether losing the place and category controls on save reads as correct or as a bug.** They vanish from the form the next time it opens, which is the shipped rule for a linked event — but nobody has met it by arriving from an event they authored themselves.
- **Whether one-way is accepted.** The first person to type a code by mistake will look for the undo, find the toast's, and then look for a way to reverse it later and not find one outside the booking's delete.
- **Whether a booking consuming an idea surprises anyone.** It is the same duplication argument as an event, but a longer inference to make.
- **Whether the fast path's minimal booking feels finished or abandoned** when you open it later in `BookingSheet` and find only a code.
