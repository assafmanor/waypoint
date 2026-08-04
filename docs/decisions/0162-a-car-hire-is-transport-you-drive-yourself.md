# 0162 — A car hire is transport you drive yourself

**Status:** Accepted. **Built 2026-08-04.**
**Date:** 2026-08-04

**Amends** [0156](0156-a-bus-is-transport-the-third-mode-the-picker-always-meant.md) §1, which named `transit` for "bus, ferry, car hire and cable car" and gave all four `transportProfile` verbatim. The naming argument there holds; the profile does not, for one of the four.
**Tests** [0154](0154-transport-authoring-a-route-shape-a-round-trip-and-a-derived-pair.md) §2's claim that a new transport mode is **one row** — for the first time with a row that is _not_ a copy of `transportProfile`. 0156 proved the copy case.
**Applies unchanged** [0048](0048-index-build-data-model-refinements.md) (route xor single place, enforced server-side from the shared profile), [0011](0011-hard-soft-event-model.md) (a hire is hard), [0136](0136-an-event-can-also-be-booked.md) §2 (the transport pills are the one question the category cannot answer) and §4 (booked-ness and commitment are different axes), [0054](0054-ambient-span-events-off-the-day-schedule.md) (a multi-day hire is an ambient backdrop), [0038](0038-icons-and-canonical-category.md), [0102](0102-search-mode-scope-and-multi-field-matching.md) (the search vocabulary per type).

## Context

The owner's report was one sentence: _"I'm missing an option to add rental cars to a trip."_

Strictly, a hire could already be recorded. 0156 §1 listed car hire among the four things `transit` covers, and `transit`'s search synonyms shipped with `רכב`, `רכב שכור` and `השכרת רכב` in them. So the answer to "can you?" was yes, and the answer to "could anyone find it?" was no — the pill reads `🚌 נסיעה`, and nothing on the transport row says car. A synonym list helps you find a booking you already made; it cannot tell you the type exists.

**And the shape underneath was wrong in three ways that only show once you use it.** `transit` carries `transportProfile`, so a hire inherited:

- **A mirrored return leg.** `authorsRoundTrip` was true, so the form offered to author the return — which for a journey is a second ticket and for a hire is a **second rental**. You do not book a car back.
- **A connection window** of six hours. Two hires four hours apart were eligible to be read as one journey with a change of vehicle between them (0159), which is not a thing.
- **`transport`'s hours.** `CATEGORY_TIME_PROFILE.transport.durationUnit` is `hours` because a flight is hours even when it crosses a night. A five-day hire read **"120 ש׳"**.

The third one is the tell that this is not a labelling problem. A bus and a car both carry you somewhere, so the _category_ is right — but you hold a car for days and ride a bus for an hour, and every surface that measures time was reading the hire as the bus.

## Decision

### 1. `car` is a `BookingType`, and it is the first one that is not `transportProfile`

One member in `bookingTypeSchema`, one in `BOOKING_TYPE`, one in the Prisma enum, one row in each `Record<BookingType, …>` table, and a fourth pill in `TRANSPORT_BOOKING_TYPES`.

Its profile keeps the two axes the other three modes share and inverts the third:

|                            | `places` | `schedule` | `defaultKind` | `legs.mirrored` | `legs.sequence` |
| -------------------------- | -------- | ---------- | ------------- | --------------- | --------------- |
| `flight`/`train`/`transit` | route    | span       | hard          | **true**        | **a window**    |
| `car`                      | route    | span       | hard          | **false**       | **null**        |

**Route-shaped, not single-place.** A hire is picked up at one counter and dropped at another, and a one-way drop is common enough on a road trip that the model has to hold it. Both ends being the same place is what a route already allows — 0048's invariant is route _xor_ single, and it never demanded two distinct places (the server's `assertPlaceShape` only forbids mixing the shapes). So the same-city hire, which is the common case, costs nothing.

**`legs: ONE_JOURNEY` is the whole point of the row.** 0154 §2 kept `places` and `legs` as separate axes and said in as many words that collapsing them would block the extension the table exists for. This is that extension: a type with a route and no second leg of either shape. The axes were right, and this is the first row that needs them apart.

### 2. The unit is the type's to override, and this is the only type that overrides it

`BookingTypeProfile` gains an optional `durationUnit`. Absent for every other type — the category answers correctly for all of them — and `auto` for `car`, which ladders to days. Read through `bookingTypeDurationUnit`, which falls back to `CATEGORY_TIME_PROFILE`.

Optional rather than a required column deliberately: making all eight types restate their category's answer would put the same fact in two places and invite the two to drift. The table carries the **exceptions**, and there is currently one.

### 3. An event's glyph refines its category's whole time profile, not just its wording

`ICON_TRANSITION_KEYS` refined `transitions` per glyph, so a flight reads המראה/נחיתה where its category reads יציאה/הגעה. A hire needs the same refinement for **two** fields: איסוף/החזרה, _and_ the unit — because §2's fix is keyed on `BookingType`, and a `TripEvent` does not carry one.

So the table became `ICON_TIME_PROFILE: Record<string, Partial<CategoryTimeProfile>>`. `eventTransitionKeys` and `eventDurationUnit` both resolve through one merge. A second glyph table beside the first, holding the second field, is the parallel-copy shape four ADRs in this repo already exist to undo (0078, 0079, 0094, 0095).

**The two paths and why both exist.** Anything with a booking behind it asks the **type** (`bookingTypeDurationUnit`) — authoritative, because a hire badged ⭐ is still a hire. An event with no booking asks its **glyph** — best effort, because the glyph is the user's to change. That split is not new; it is what `bookingDurationUnit`'s existing comment already described, now stated where both halves are visible.

### 4. `transit` keeps the other three, and loses the car words

`נסיעה` still means the bus, the ferry, the shuttle and the cable car, and 0156 §1's argument against naming it after one of them is untouched.

`רכב`, `רכב שכור` and `השכרת רכב` **move** to `car` rather than being listed on both. Left on `transit`, every bus in the trip would answer a search for `השכרת רכב`, and 0102's per-type vocabulary exists to make search sharper, not wider. The cost is stated in §5.

**The separation is real for a phrase and not for a bare word, and that is `matchesAnyTerm`, not the lists.** Matching is substring, so `רכב` is a prefix of `רכבת` (train) and `רכבל` (cable car) and reaches both; `אוטו` is a prefix of `אוטובוס` and reaches the bus. `השכרת רכב`, `רכב שכור`, `מכונית` and the brands discriminate cleanly, which is what makes the move worth doing. `אוטו` stays in the list despite the overlap — it is what people actually type, and the alternative is a car nobody finds by its everyday name. **Pinned in a test** so this is not later "fixed" by editing the synonyms: the only real cure is word-boundary matching, which would change every search in the app and is its own decision.

### 5. The migration is additive, and there is **no backfill**

0156 §3's reasoning, one level down. An existing `transit` row might be a bus or might be a hire, and **nothing stored distinguishes them** — a heuristic over free text would silently re-type real rows. Existing rows keep their type; the new pill writes the right one from now on.

Two things make this a smaller call than 0156's was. Re-typing an old hire **cannot invalidate it**: `transit` and `car` are both route-shaped and span-scheduled, so every field the row already holds stays legal — where 0156's `other → transit` would have demanded a route the row did not have. And the only user-visible consequence of leaving one alone is §4's: a pre-0162 hire is no longer found by typing `רכב`. It is still found by its title, its provider and its code, and re-typing it is one tap in the edit sheet.

### 6. The Hebrew is `השכרת רכב` — the act, not the object

Owner's call. Every other label in `bookingType` names the thing you booked (`טיסה`, `לינה`, `רכבת`), and `רכב שכור` names the car you end up with instead. `השכרת רכב` is what you would say you were doing. It stays in the synonym list, where naming the object is exactly right.

## Consequences

- **A fourth transport mode was one row, and a fifth still is** — but 0154 §2's claim is now proven in its harder form: a row that _disagrees_ with `transportProfile` needed no new branch either, because the axes were already separate. The `legs`/`places` split earned itself here.
- **`timingLabels` became a `Record<BookingType, …>`, and that exposed a shipped miss.** It was an if-chain over hotel/flight/train with a fall-through, so `transit` — added by 0156, which never touched this function — reached the generic התחלה/סיום. A bus departs and arrives exactly like the train one line above it. Fixed in passing, and the exhaustive table is why the next type cannot repeat it.
- **`BOOKING_TYPE_CATEGORY` is gone.** `icons.ts` held a private copy of `constants.ts`'s `BOOKING_TYPE_TO_CATEGORY`, identical contents, one reader. Every new booking type had to be answered twice, with nothing but the `Record` on each to notice — 0095's exact shape. Collapsed to one table.
- **A multi-day hire is an ambient backdrop for free** (0054): `transport` is already `ambientWhenMultiDay`, so "we have a car until Friday" renders off the counted schedule with its two ends as transition markers, exactly like a stay. Nothing was added for this, which is the profile doing its job.
- **Three transport-pill specs gained a member** rather than being relaxed, and one new spec asserts the gap itself: the pill row is `flight, train, transit, car` and picking the fourth writes `car`.
- **The picker is at four pills, and needed no layout work — but it is now a scrolling row.** Measured at 360px (the narrow end of ADR-0017's range) the strip is 344px of content in a 326px box: it overflows by ~18px and scrolls. That is `ChoiceGrid`'s `pills` layout doing exactly what ADR-0098 built it for — a snap strip with a trailing mask fade so the peek reads as "scroll for more" — with `useCenterSelected` bringing the picked pill into view. Worth knowing rather than discovering: **a fifth mode lands in a row that already scrolls**, so the question it has to answer is whether four visible pills plus a peek is still the right control, not whether one more fits.
- **`EventForm`'s derived sentence took the type's glyph instead of the category's.** It read `iconForCategory(category)`, which is ✈️ for all of `transport` — so the sentence said "✈️ … רכבת" before this change and "✈️ … השכרת רכב" after it. The sentence names the **type**, so the glyph is `BOOKING_TYPE_ICON[derivedType]`. Wrong for three of the four modes, and only conspicuous on the fourth.

## Alternatives considered

- **Leave it under `transit` and fix discoverability only** — a clearer label, a hint, a second glyph on the pill. Rejected: it addresses the report and none of the three behaviours in Context. The round-trip offer authoring a second rental is the one that would have produced a bug report of its own.
- **`places: 'single'`,** on the grounds that most hires return to the same counter. Rejected in §1: it makes the common case marginally simpler and the one-way drop unrepresentable, and 0048's invariant means it could never be given a second endpoint later — the exact trap 0156 §1 found `other` in.
- **Name it `rental`.** Rejected: the trip may also rent bikes, scooters or ski gear, and `rental` promises to cover them while the profile (a route, a span, hard) is specifically a car's. `car` is narrow and honest; a bike hire is a later row, not a stretched one.
- **Give `car` its own `EventCategory`.** Rejected — it is transport by every question the category answers (the map pin, the filter, the semantic type), and the two things it actually disagrees with its category about are handled in §2 and §3 without a ninth category.
- **Put `durationUnit` on every `BookingTypeProfile` row** rather than making it optional. Rejected in §2: seven rows restating their category's answer is a second source for one fact.
- **Backfill `transit` rows whose title or provider looks like a hire** (`Hertz`, `רכב`). Rejected in §5, and it is 0156 §3's rejected alternative unchanged: a heuristic over free text, re-typing real rows.
