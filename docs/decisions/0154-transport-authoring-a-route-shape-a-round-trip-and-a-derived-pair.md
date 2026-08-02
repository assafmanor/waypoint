# 0154 — Transport authoring: a route is a **shape**, a round trip is a **control**, and a pair is **derived**

**Status:** Accepted (owner sign-off 2026-08-02). **Built 2026-08-02** — §1–3 and §4–6, each with its own build log at the foot. The stepping question stays open and belongs to [0155](0155-a-stepped-form-is-one-primitive-and-it-commits-once.md).
**Date:** 2026-08-02
**Design reference:** [`mockups/booking-round-trip-v1.html`](../../mockups/booking-round-trip-v1.html) — every number below is read from that file's live DOM in a headless browser, not estimated. Its §6 and the stepping question belong to [0155](0155-a-stepped-form-is-one-primitive-and-it-commits-once.md).

**Leaves [0047](0047-booking-event-linkage-and-notes.md) §1 alone, deliberately, and that is the first decision.** A round trip stays **two `Booking`s**. The tempting move is to make it one booking with two legs; the timeline forbids it, because these are two hard events weeks apart with their own instants, their own `done`/`skipped`, their own origin/destination zones and their own slip. That ADR already rejected 1:many `Booking→Event` for the same reason. **Nothing here is an entity, a table, a relationship or a migration.** It is authoring, plus one derivation.

**Corrects [0136](0136-an-event-can-also-be-booked.md) §2.** Its session-185 amendment found that `EventCategory` has one `transport` where `BookingType` has three, and fixed it with the three pills. It did not find the second half: transport also has a different **place shape**, so the `יש הזמנה` row sends `placeId` with `type: 'flight'` — which [0048](0048-index-build-data-model-refinements.md)'s invariant, enforced in `bookings.service.ts`'s `assertPlaceShape`, **rejects with a 400**.
**Extends** [0048](0048-index-build-data-model-refinements.md) (the route/single place shapes this makes readable as data), [0059](0059-booking-presentation-on-home-and-index.md) §3 (a flight is identified by its route, not a name), [0107](0107-per-place-timezones-and-multi-zone-time.md) (per-endpoint zones, which a route-less booking has nothing to resolve).
**Applies unchanged** [0092](0092-unsynced-treatment-and-change-groups.md) (one save, one change group), [0150](0150-a-form-refuses-at-the-field.md) (a refusal lands on the field it is about), [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §6b (the note written on the way), [0093](0093-offline-booking-linked-event-coherence.md), [0134](0134-the-map-is-where-a-forms-place-comes-from.md) (a place field is an errand to the Map).
**Relates** [0038](0038-icons-and-canonical-category.md), [0063](0063-category-time-behaviour-profile.md) (the per-category profile §2 is the booking-type peer of), [0061](0061-plan-home-readiness-rework.md) (the readiness check that already knows what a round trip is), [0096](0096-per-domain-claude-md-guides.md) / root rule 8.

## Context

Adding a flight is the app's most common hard commitment and its worst-served authoring path, in two different ways that turned out to have one cause.

**A round trip is bought once and written twice.** `BookingSheet` authors one leg. The second is a full re-do: pick the same two places in reverse, retype the same PNR — a round trip genuinely has one — re-pick the icon, re-set the kind. Nothing afterwards records that the two rows are related, so deleting one says nothing about the other. Meanwhile `lib/readiness.ts` already computes `hasOutbound`/`hasReturn` and `PlanHome` already seeds the missing leg: **the app knows what a round trip is, in exactly one corner, and the form it would help never hears about it.**

**And a transport booking authored from `EventForm` is broken, not merely thin.** Reproduced rather than inferred (rendering the form on a transport event with a place and reading the payload): it sends `{ type: 'flight', title: '…', placeId: 'p-nrt' }`, and `assertPlaceShape` throws on precisely that. **A transport event that has a place cannot be booked at all.** With no place it saves, and the route-less booking that results loses the route title (0059 §3), the location fact, the map pin, `נווט`, the per-endpoint zones — so a zone-crossing flight renders both ends in the trip primary zone, wrong on the surface where it matters most — the Plan readiness count, and the ability to re-save it from `BookingSheet` at all, since `routeRequired` refuses a booking with no endpoints.

**The one cause.** "Is this transport?" is written **six times, by hand, in two packages** — `bookings.service.ts:26`, `booking-draft.ts:67` (`isTransportType`, exported), `places.ts:21` (`isTransportBooking`, exported **as well**, and imported by different call sites), `place-usage.ts:91`, `BookingTitle.tsx:12`, `BookingDetail.tsx:37`. None is in `@waypoint/shared`, although the backend keeps its own copy — the cross-boundary discriminant `packages/shared/CLAUDE.md` says belongs in a shared table. Every one of them is really asking **"does this carry a route?"**, and because none of them is exhaustive, a form that forgets the question compiles clean.

**It already costs something shipped.** `TRANSPORT_BOOKING_TYPES` offers `🚌 אחר` for "bus, car, ferry, cable car", but `other` is not transport by any of the six — so a bus saves with a single `placeId`, `BookingSheet` never shows it a route field, and it **can never be given a route**. A bus is transport in the picker and is not transport in the model. The app already wants a third transport mode and has nowhere to put it.

## Decision

### 1. The 400 is a bug, and it is fixed first and alone

`EventForm` sends `fromPlaceId`/`toPlaceId` for a route-shaped type and `placeId` otherwise — the same conditional `BookingSheet` already carries. **Phase 0, its own change, no dependency on anything below**, because a shipped crash should not wait on a design. A regression test pins the payload shape per booking type; the reproduction that found it is the test.

### 2. A booking type's shape is a **table**, not a predicate

`BOOKING_TYPE_PROFILE` in `packages/shared/src/icons.ts`, beside `CATEGORY_TIME_PROFILE` — **the second instance of a pattern this repo already chose**, in the same file, the same `Record<BookingType, T>` idiom, exhaustively typed so the compiler flags a missing member:

| axis          | values                   | replaces                                               |
| ------------- | ------------------------ | ------------------------------------------------------ |
| `places`      | `'route' \| 'single'`    | all six definitions above, **and** the backend's guard |
| `schedule`    | `'span' \| 'point'`      | `isSpanType`                                           |
| `defaultKind` | `'hard' \| 'soft'`       | `bookingDefaultKind`                                   |
| `legs`        | `'single' \| 'mirrored'` | §4's control (new)                                     |

**The reframing is the decision, not the table.** The question stops being "is it transport" and becomes "does it carry a route" — which is what all six call sites were already asking, and the reason a ferry then becomes one row instead of a tour of two packages. `legs` stays a **separate axis** rather than deriving from `places`: a split hotel stay is `places: 'single'` with more than one leg, and collapsing the two would block exactly the extension this table exists for.

The precedent is fresher than 0063. `NOTE_HOST_FIELD` (0152, three days earlier) states the same property in its own words — _"a sixth hostable entity adds a line in `@waypoint/shared` and nothing here"_ — which is what this buys for a third transport mode.

### 3. The route field is **one component**, and it gains the swap neither host had

`ui/domain/RouteField` (+ its own `route-field.css`) owns the two stacked `PlacePicker`s, the hint, the two errand field names, and a **swap**. `BookingSheet` and `EventForm` are call sites; the CSS leaves `screens.css`'s `.booking-sheet .bs-route-pickers`, because a rule scoped to one host is wrong the moment there are two.

**This is a correction to the design's own first draft**, recorded because it is the failure mode rule 8 names: that draft copied the route markup into `EventForm` — a second copy, added by the change that complains about copies. `ui/HostNotes.tsx` made the identical call three days earlier and said why: _"`BookingDetail` did it inline first, which was right for one host; documents and ideas would have been the second and third copy of the same eight lines."_

**The swap is what makes the extraction pay rather than cost.** An existing transport event carries one place and cannot say which end it is, so it lands in the **origin** and one tap moves it — no errand, no second trip to the Map. `BookingSheet` never had this either: today a route entered backwards costs two errands. Its glyph is `Icon`'s `swap`, a **vertical** pair, which here is not a compromise but the literal motion — the pickers are stacked. (That icon's own comment warns a horizontal pair reads backwards in RTL; this layout never tests the rule.)

### 4. Round trip is a **create-time control on the route field**, and it defaults **off**

Two `.choice-pill`s at the top of the route field — `כיוון אחד` · `הלוך ושוב` — offered when `legs === 'mirrored'`. Choosing round trip does three things and no more: the title preview's arrow becomes **double-headed** (symmetric on purpose — a round trip has no direction, and a mirrored glyph would claim one), both journeys gain a leg heading, and a second `WhenField` span appears. The return's route is **derived**, never picked again; its zones are the outbound's, swapped.

Shared by one input: type, icon, confirmation code, kind. Written twice: dates and times only. One save writes two bookings and two linked events inside one `withChangeGroup` (0092), so the pair is one pending change. `routeTitle` derives both stored titles, so nobody types a name.

**Create only**, like the type `ChoiceGrid` already is — editing a leg opens 0047 §2's merged surface unchanged. Turning a saved single leg into a pair is a different action and is out of scope.

**Default off, and the measurement is the argument.** The control row costs **44px on every transport booking**, paid by everyone. The second leg costs a further **492px**, paid only after an explicit tap. Defaulting on moves 492px into the first column and charges it to people booking one way. This also corrects a claim the design made before measuring: one-way is **not** byte-for-byte today's form, it is today's form plus 44px.

**One new refusal**, on the leg it is about (0150): `החזרה יוצאת לפני ההגעה ליעד`, marked on the return's departure. Type-independent wording, so flight and train share it. Two names join the form's field union; every problem is still reported in one call.

### 5. The pair is **derived, not stored**

A pure function over booking shape in `@waypoint/shared`: two bookings pair when both are route-shaped and the same type, **and** either their routes mirror or they share a non-empty confirmation code, with the nearest in time winning among candidates. The later one is the return. It is a **table of relation rules** rather than a hard-coded `||`, so a second relation is an entry.

A `pairId` written by §4's control was rejected: it needs a migration, it drifts the moment a route is edited, and it would only ever know about pairs created through that one control — missing legs written separately, legs written in the two different forms, and anything imported from Gmail (0004: integrations are pipes). The derivation is the same posture readiness and Now/Next already take (0018/0027): computed state is not written back.

It surfaces twice and quietly. On `BookingDetail`, **one fact, last** in `bk-facts` — last because everything above describes this booking and this one describes its neighbour — carrying the date and a way through, in **ink and never teal**, since teal is location only (rule 4) and a sibling booking is not a location. On the delete prompt, **a statement, not a fourth button**: the partner is named and said to survive. A destructive dialog growing an extra verb is the defect 0138 §2 logged.

### 6. A round-trip note goes on the **outbound**

0152's phase 5b settled the principle without knowing it: a note hangs on the host whose id the **client** holds, which is why a booked event's notes go on the booking. Both round-trip bookings have client-generated ids, so the principle narrows without deciding — and it exposes a defect. `BookingSheet` sets `hostId = created?.id` and hangs the notes there, so two `createBooking` calls would put the note on **whichever ran last** (the return), by statement order rather than by decision.

**The outbound**, explicitly: it is the journey that happens first and the one §5 calls the primary of the pair. One line, but it must be written.

### 7. What this does not decide

**Whether the form should be stepped** — that is [0155](0155-a-stepped-form-is-one-primitive-and-it-commits-once.md), and its answer for this form is "try `Collapsible` first, and settle stepping on a phone".
**Connections and multi-city.** Adjacent but a different shape: a layover is a **sequence**, a round trip is a **mirror**. `legs` is the axis that would carry it; deliberately not populated now.
**A real third transport mode.** The `🚌 אחר` gap above is stated, not closed — once §2 lands it is one row, and it should be taken as its own change with its own migration.

## Consequences

- **Three phases, and only the first is urgent.** §1 alone fixes a shipped crash. §2 and §3 are the extractions that make the rest expandable; they touch six sites in two packages and move CSS between files, which is why they were put to the owner before being taken (rule 8's ask-first clause) and approved 2026-08-02.
- **The compiler starts helping.** A new `BookingType` fails to build until its profile row exists, where today it silently defaults to whatever the six predicates' `else` branch happens to be.
- **`assertPlaceShape` reads the shared table**, so the invariant is stated once and enforced in the place it always was.
- **The Index gains nothing**, deliberately. A `הלוך ושוב` tag on the row was drawn and rejected: the meta line already carries time, duration and the note mark, the tag breaks it to a second line, and the question it answers is already answered by the readiness check and by the detail.
- `BookingSheet` grows to ~1565px with a round trip, against ~675px visible on a 390×844 phone. Stated here, owned by 0155.
- `mockups/booking-round-trip-v1.html` remains the build spec; its measurements, its rejected options and its rule-8 ledger are not repeated here.

## Alternatives considered

- **One booking, two legs.** Rejected — reopens 0047 §1 for no gain; two independent hard events is what the timeline needs.
- **A `roundtrip` `BookingType`.** Rejected: a type is what the thing **is**, not how many you bought, and it would force a new case into every `Record<BookingType, T>`.
- **An empty, dateless return created alongside the outbound.** Rejected: a hard commitment with no time is the state 0011 says must not exist.
- **A post-save nudge ("add the return?").** The signal exists (`hasReturn`), but `Toast` carries no action, so it is the most expensive of the options and the easiest to ignore. Not rejected on merit — deferred, and it composes with §4 rather than replacing it.
- **A `pairId` column.** Rejected in §5, with its three costs.
- **Keeping `isTransport` and adding a seventh copy.** Rejected — this is the pile 0078, 0079, 0094 and 0095 all exist to undo.
- **A free-text destination in `EventForm`** instead of a second `PlacePicker`, to avoid a Map errand. Rejected: session 86 deliberately upgraded transport endpoints from name-only lites to picked places because 0107's zones need coordinates, and this would walk it back. Both endpoints being **optional** already buys the cheapness that motivated it.

## Build log — §1–3, 2026-08-02

Three things the build found that the design had not, recorded because each would
otherwise be re-derived:

- **The six predicates were three implementations, not one repeated.** Four sites asked
  `flight || train`; `places.ts` and `place-usage.ts` asked
  `categoryForBookingType(…) === 'transport'`. They agreed on today's enum and would have
  diverged the moment a type's category and its place shape stopped lining up — which is
  exactly what a third transport mode does. `carriesRoute` is now the only spelling, and
  `icons.test.ts` pins the two answers against each other rather than restating the table.

- **§2 retired a fourth helper the ADR had not counted.** `bookingDefaultKind` was a
  frontend wrapper over `isSpanType`, so it moved too (`defaultKindForBookingType`). Both
  exported names are gone rather than kept as one-line aliases: two names for one question
  is what the ADR is about, and an alias is still a second name.

- **The route field is optional in `EventForm` and required in `BookingSheet`, and that is
  deliberate.** `BookingSheet` keeps `routeRequired` (a booking written on its own surface
  should name its journey); `EventForm` refuses nothing, because ADR-0136's "requires
  nothing" is that row's whole posture and a fix that spent it would be a different
  regression. The shared component therefore carries no validation of its own — the host
  decides, which is also why `RouteField` takes no `error` prop.

- **Two defects the build introduced and caught in self-review, both invisible to the
  suite as it stood.** `EventForm`'s `dirty` guard lists its fields by hand, so a picked
  route closed with no discard prompt; and its authoring zone read the single `placeId`,
  so a departure typed at a Tokyo origin would have been stored as an instant in the trip's
  primary zone — a wrong moment that does not look wrong. Both now follow the route, and
  both have a test verified to fail without the fix. The second is the rule
  `bookingSheetDraft` already followed, which is the argument for the two forms sharing a
  component in the first place.

**The reproduction is the regression test**, and it was verified to fail without the fix:
reverting the payload conditional turns two `EventForm` specs red. The backend's guard
gained a loop over every `BookingType` asserting it follows the shared profile in both
directions, so a profile row changed without the server agreeing now fails there too.

## Build log — §4–6, 2026-08-02

- **§6 was a one-line change and it is the one line the design was written for.** The save
  now leaves `hostId` alone in the second `createBooking` rather than reassigning it, and
  the test for it fails on the mutation that restores the reassignment. Nothing about the
  code makes the omission look deliberate, which is why the comment above it says the
  return is what it would otherwise be.

- **A round trip cannot be authored in a unit test through the route pickers**, because a
  `PlacePicker` tap is an errand to the Map (0134 §1) and the sheet unmounts. The tests go
  through the `draft` prop — the errand-return path — which is not a shortcut around the
  real entry point but the second one, and the one a user comes back through.

- **§5's ordering is decided by a field the shared rule cannot see.** A `Booking` carries
  no schedule, so `roundTripPartner` takes a `BookingStartAt`, and everything about which
  leg is the return depends on how the frontend supplies it. Reading only `startsAt` makes
  a leg scheduled to a **day** look unscheduled and lets the earlier journey be named the
  return; `useRoundTripPartner` falls back to the event's `date`, with a test that fails
  without the fallback. This is the whole reason the hook exists rather than each surface
  deriving its own `startAt`.

- **The way through needed a prop at four hosts.** `BookingDetail` is rendered by the
  Index, the Map, the Day view and Plan's day — each already holding the detail's state —
  so `onOpen` is their existing setter and nothing new coordinates it. It is **optional**:
  a host without detail state still gets the fact, stated rather than linked, which is the
  rule `onShowOnMap` in the same file already follows. **It registers no back layer**,
  and that is not an oversight: swapping which booking a sheet is about is not entering
  a surface you can leave, there is no visible control for back to mirror (0103's test),
  and `onEdit` beside it already replaces the sheet's subject the same way.

- **`הלוך`/`חזרה` are now one pair of words in `i18n/he.ts`** rather than two, because §4
  writes them as leg headings and §5 reads them back as a fact and as a sentence. The
  delete prompt's sentence still cannot be a single template — ההלוך and החזרה disagree on
  gender — so that one string is two, and the words inside it are interpolated from the
  same const.
