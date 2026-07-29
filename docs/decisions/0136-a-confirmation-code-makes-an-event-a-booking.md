# 0136 — A confirmation code makes an event a booking, on every surface that authors one

**Status:** Accepted — extracted 2026-07-30 (session 183) from [ADR-0135](0135-a-place-becomes-an-event-or-a-booking.md) §2/§4/§4a/§6, which designed it (sessions 181–182) as part of a map phase. **It is not a map decision** — owner's call: _"independently from the maps, events in general."_ **Design only; nothing below is built.** The numbers in §5 are read from the live DOM of the mockup named below, in a headless browser.
**Date:** 2026-07-30

**Amends** [0011](0011-hard-soft-event-model.md) in **application, not in substance** — its "hard = real commitment (flight, **reservation code**)" stops being a description a human applies by hand and becomes the thing the app reads (§1). The primitive is unchanged, and §4 is careful about the one place reading it too eagerly would break it.
**Extends** [0047](0047-booking-event-linkage-and-notes.md)/[0093](0093-offline-booking-linked-event-coherence.md) — the booking↔event pair gains a **second producer**, `EventForm`, alongside `BookingSheet`. `bookingEventFields` is unchanged and is what keeps the two producers from diverging.
**Applies** [0048](0048-index-build-data-model-refinements.md) unchanged — a linked event's place lives on its booking, which is why §3's conversion has no field-migration code of its own (the server already enforces it).
**Relates** [0109](0109-map-tab-design.md) §11 + [0038](0038-icons-and-canonical-category.md) (the category field this derives the booking type from, and where that category itself comes from), [0098](0098-index-landing-and-dedicated-screens.md) (the `Collapsible` primitive §2 reuses), [0113](0113-trip-destination-place-and-primary-timezone.md)/[0116](0116-day-aware-shelf-and-idea-target-day.md) §1 (the "sensibly defaulted, trivially fixable" posture the derivation takes), [0012](0012-conflict-lww-undo.md) (the undo §3's two writes must share), [0025](0025-trip-mode-edit-capability-tiers.md) (the tiers that already gate reaching this form).

Mockup: [`mockups/map-place-becomes-v1.html`](../../mockups/map-place-becomes-v1.html) — **shared with ADR-0135, and its name is older than this split.** Its ⟨הטופס⟩, ⟨קטגוריה⟩, ⟨הטופס פועל על⟩ and ⟨התוצאה⟩ frames are this ADR's: `EventForm` at its real length with the code line shut, open and converting, the derivation moving live under the category pill, and what each save produces on the day screen and the Index. Only its way-in-block frame belongs to 0135. Its entry in [`design/mockups.md`](../design/mockups.md) says which is which.

## Context

Authoring in this app has always made you answer a schema question first. `EventForm` makes events; `BookingSheet` makes bookings; you pick the surface **before** you start typing, on every screen that authors either. A traveller who has just been given a confirmation number for the restaurant they already put on Thursday has no path that does not involve knowing which of those two things they should have made.

This was designed inside [ADR-0135](0135-a-place-becomes-an-event-or-a-booking.md), a Maps & Places phase, because that is where it surfaced — the map needed a place to become something, and "event or booking?" was the question in the way. It is **extracted here on the owner's call**, and the extraction is the point:

- **Nothing about it is map-shaped.** It lands on `EventForm`, which is hosted by `DayView`, `PlanDay` and the Map tab; it reads the form's own category; it writes a `Booking`. There is no map in it.
- **A reader would never have found it.** `CLAUDE.md` sends every session to the router first and tells it to read only the ADRs named for its domain. Filed under the map, this rule would be invisible to anyone touching event authoring — which is exactly the failure [session 180](../planning/2026-07-29-session-180-the-router-repaired.md) spent a session repairing for the map's own ADRs. Its router row is **Data model & events**.
- **And it is independently buildable.** It needs nothing from the map phase, and the map phase needs only its existence. The backlog carries them as two lines for that reason.

## Decision

### 1. The code decides the entity, and it is the app's own definition of commitment

**`EventForm` gains one collapsed line: `יש קוד הזמנה?`.**

- **Empty** → the save creates a **soft event**, exactly as it does today.
- **Filled** → the save creates a **`Booking`** (and its linked event, through the shipped `bookingEventFields`) instead of a bare event.

The traveller answers a fact about the world — _do I have a confirmation number?_ — and the app picks the entity. That is not a metaphor for ADR-0011, it is ADR-0011's own sentence: _"hard = real commitment (flight, **reservation code**)."_ The definition already existed; only nothing had ever read it.

**"Event or booking?" is the app's question, not the traveller's.** It asks a human to know the schema before they can say what they know, and it asks it at the moment they know least — before anything is typed.

**This is not a second way to author a booking.** `BookingSheet` remains where a booking is _written_: code, room, wifi, notes, documents, spans, and a transport booking's two places. This is a **fast path** that produces a minimal booking, which is then one tap away wherever bookings are listed.

### 2. The type is derived from the form's own category, and the guess is stated

A new `CATEGORY_TO_BOOKING_TYPE` in `@waypoint/shared`, the inverse of the shipped `BOOKING_TYPE_TO_CATEGORY`, `as const satisfies Record<EventCategory, BookingType>`:

| Category                              | Booking type |
| ------------------------------------- | ------------ |
| `lodging`                             | `hotel`      |
| `food`                                | `restaurant` |
| `transport`                           | `flight`     |
| `sightseeing` · `nature` · `activity` | `activity`   |
| `shopping` · `services` · `other`     | `other`      |

**The form's category, and that is the better half of this section.** The category selector already leads the form (ADR-0109 §11: choosing it defaults the badge glyph) and already defaults from the icon's group (ADR-0038). So the derivation reads a signal a human has already been given a control over — which means **the fix for a wrong guess is a control the form already has**, not a second picker. A train station opens on `transport` and guesses `flight`; a train is one tap on the category the form was showing anyway.

**And the derivation is _stated_, never silent.** With a code filled, a quiet line under it names what will happen, and it **moves with the category pill** — so the app is visibly understanding rather than quietly deciding. A statement, not a second type picker: a picker is precisely what this ADR removes, and the "sensibly defaulted, trivially fixable, never a forced choice" posture is ADR-0113's and ADR-0116 §1's.

**A manually chosen category survives.** `bookingEventFields` already writes `seed.category ?? BOOKING_TYPE_TO_CATEGORY[booking.type]`, so a corrected category is not overwritten by the type's own default on the way through.

**The line itself:** a `Collapsible` (`ui/primitives/Collapsible`, generalised in ADR-0098's reuse audit), closed by default, rendering as a **link-weight line rather than a field** — for most events there is no code, and a labelled empty box implies there should be. Nothing else in the form moves: the category `ChoiceGrid` and the `IconPicker` stay exactly where they are, in the shipped order.

### 3. An existing event converts, and the model already knows how

The line appears on **create and on an unlinked existing event alike**. Typing a code into an existing event **converts** it. It is absent once the event is booking-linked, for the same reason `showPlace`/`showCategory` are: that field lives on the booking now.

The cautious reading — _create the booking, link the event, move its fields_ — is answered by the model rather than by this design:

- **The field migration is an enforced invariant, not new work.** `events.service.ts` sets `placeId: null` whenever `bookingId` is set, on create **and** update, because a linked event's place lives on its booking (ADR-0048). The form has read the other half of that same rule since it shipped (`showPlace`/`showCategory` are `!event?.bookingId`). So conversion does not move the place off the event — **it puts the place on the booking, and the server takes it off.**
- **Both writes are shipped verbs.** `indexVerbs.createBooking` **without** its optional `event` seed (the event exists; a seed would create a second one), then an ordinary event patch setting `bookingId`. Two calls, the same shape `applySchedule` already has.

|                          |                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Booking**              | `type` from the form's category (§2), `title`/`confirmationCode`/`placeId` from the form, schedule from the event |
| **Event**                | gains `bookingId`; the server nulls its `placeId`; **keeps its own `kind`, `category`, `title` and times**        |
| **The form, afterwards** | place, category and the code line all leave it — they live on the booking now                                     |

**The statement changes with the operation.** On a create it reads `תיווצר הזמנה · מסעדה`; on an existing event, `האירוע יהפוך להזמנה · מסעדה, והמיקום והקטגוריה יעברו אליה`. Same quiet line, same no-picker rule — it just stops describing a creation it is not doing.

**One-way through this field, deliberately.** Once converted, the code lives on the booking and the line leaves the event form, so a code cannot be cleared back into an event here. Un-converting is **deleting a booking** that may by then carry documents, notes, a room and wifi — destructive, and it belongs to the booking's own surface with the confirm it already has. A field that quietly deletes an entity is not a field.

**No dialog.** The statement is the disclosure, and the save's toast carries the app's ordinary undo (ADR-0012) — which here must cover **both** writes as one action.

### 4. Hard vs. soft is derived at create, and **preserved** on conversion

- **No code** → a soft event (`EventForm`'s existing `event?.kind ?? EVENT_KIND.SOFT`, the same default `buildScheduleEvent` uses).
- **A code, on a new event** → the booking's shipped per-type default, `bookingDefaultKind`: `hard` for flight, train, hotel and activity; `soft` for restaurant and other.
- **A code, on an existing event** → **whatever the event already is.** Unchanged.

**"The code decides the entity" is not "the code decides the kind",** and the distinction is load-bearing twice over:

- At create, deriving `hard` from the mere presence of a code would contradict a shipped default and make every dinner reservation ripple-immune.
- On a conversion, re-deriving would silently **harden** a soft sightseeing event the instant a ticket number is typed (`activity` → `hard`). ADR-0011's hard events are guarded on edit and never auto-moved; auto-hardening through a text field is precisely that, through the back door.

So the code changes what the thing **is**, never how committed it is. The kind toggle stays in the form and follows the derivation only while untouched, using the same `kindTouched` guard `BookingSheet` already carries.

### 5. What it costs, and it is paid on every screen

Measured on the real `.modal-form` — never the `.modal-card`, which is height-capped and scrolls, so reading it returned the same number for the closed line and the open one:

| `EventForm` content                   | Height                  |
| ------------------------------------- | ----------------------- |
| As shipped                            | **482px**               |
| With the line, closed                 | **560px** (+78px, ~16%) |
| With a code and the derived statement | **617px** (+135px)      |

**+78px closed is what every host pays** — the day view, the Plan builder and the Map tab alike — for a line most events will never open. That is the price of one authoring model instead of two, stated rather than buried, and it is the number a later "can this be tighter" change has to beat.

### 6. What this does not do

- **It does not merge the two forms.** `BookingSheet` keeps everything §1 lists, and a transport booking — two places and a span — is still authored there. The fast path cannot produce one usefully, and the `transport → flight` guess in §2 is the honest edge of that.
- **It does not convert in the other direction.** A booking does not become an event by clearing its code (§3).
- **It does not touch `BookingSheet`'s own create flow**, its `seed`, or the Plan-home checklist that uses it.
- **It does not decide what happens on the Index's own "add booking" path.** That surface still asks the schema question, correctly: you went there to make a booking.

## Alternatives considered

**Leave it in ADR-0135.** What sessions 181–182 did. It works and it is unfindable: a session touching event authoring reads the router's **Data model & events** row and would never open a Maps & Places phase ADR. Session 180 spent a whole session on exactly this failure mode for the map's own decisions.

**Ask the schema question better** — a segmented "event / booking" control at the top of one merged form. Rejected: it keeps the question, and the question is the defect. It also doubles the form's conditional surface for a distinction the app can derive.

**Derive the entity from the category alone** (a `lodging` event is a booking). Right at the edges and useless in the middle: a restaurant is the most common case and is genuinely either. Category survives as the **type** default, where it is a good guess, and is not asked to decide the entity, where it is a bad one.

**A code makes it hard.** §4.

**Put the code field on the form unconditionally, not behind a `Collapsible`.** Cheaper to build and it puts an empty confirmation-code box on every walk in the park. The collapsed line costs +78px; an open field would cost more and imply the code is expected.

## Consequences

- **`EventForm` can produce a `Booking`.** A real widening of its contract on every surface that hosts it. The branch lives at save; the fields above it are unchanged.
- **Conversion is a two-entity write that must undo as one.** `createBooking` then a `bookingId` patch, with the toast's undo covering both — a half-applied conversion leaves a booking nothing links to.
- **An event can now lose fields by being edited.** Converting takes place and category off the event and onto the booking. It is ADR-0048's invariant and the server enforces it, but it is the first time a user action _in the event form_ triggers it.
- **`CATEGORY_TO_BOOKING_TYPE` is the inverse of a constant that already exists.** The two must be edited together when `BookingType` grows; the `satisfies Record<…>` on both is what makes that a compile error rather than a silent gap.
- **A guessed booking type reaches the data.** The statement makes it visible and the category makes it correctable, but a transport event will produce a `flight` someone has to fix. Accepted cost of not asking.
- **Every authoring surface grows by 78px.** §5.
- **The Index gains rows from somewhere new.** A booking can now appear without anyone having opened the bookings screen.

## The device pass, and what it owns

- **Whether a deliberately quiet `יש קוד הזמנה?` is discoverable** by someone who _does_ have a code. Quiet can mean invisible.
- **Whether +78px of permanently-visible form is worth it on the day view and the builder**, where a code is rarer than on a place just picked. If not, the line moves behind the create-flow entry point rather than living in the form.
- **Whether a statement that moves under the category pill reads as clever or as unstable.** It is the only live derivation on any authoring surface.
- **Whether conversion is legible as a conversion**, given one quiet line stands in for creating an entity and moving two fields off the one being edited.
- **Whether losing the place and category controls afterwards reads as correct or as a bug.** It is the shipped rule for a linked event, but nobody has met it by arriving from an event they authored themselves.
- **Whether one-way is accepted.** The first person to type a code by mistake will find the toast's undo, then look for a later reversal and not find one outside the booking's delete.
- **Whether the fast path's minimal booking feels finished or abandoned** when opened later in `BookingSheet` with only a code in it.
