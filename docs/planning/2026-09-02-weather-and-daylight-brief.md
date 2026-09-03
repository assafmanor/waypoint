# Weather & daylight — the tech review, the product shape, and what is being asked

**Date:** 2026-09-02
**Status:** **daylight BUILT (2026-09-02); weather reviewed and drawn, not built.** The daylight
half needed no fork answered, so it shipped as §1 recommends — `packages/shared/src/daylight.ts`
(the solar math + its table), `lib/places.ts`'s `dayAnchorCoord`, `lib/daylight-view.ts`, and
`ui/domain/SunWidget` in `מבט מהיר`. **Weather is still blocked on forks B and C** (§6), which are
the provider-with-its-terms-review and the staleness bound. **Both forks are now answered (owner, 2026-09-03) and the decision is recorded in
[ADR-0218](../decisions/0218-a-forecast-expires-and-the-widget-goes-rather-than-lies.md)**: the provider is MET Norway (fork B's
measurement ran as the 2026-09-02 amendment, and the owner's _"prefer not to pay"_ confirmed it rather
than flipping it), and a forecast expires at 6h for today, 24h beyond (fork C). What remains is the build
and the real-device pass.
Two things the build changed from the drawing, both recorded in §2.4 and §2.6:
sun instants are **rounded to the whole minute** at the source (`Intl` truncates, so a 06:16:52
sunrise would print `06:16` where every published table says `06:17`), and the sky needs **eight**
gradient stops rather than four — two a side renders as hard vertical stripes, because a gradient
needs a position to interpolate toward.

**Originally:** **reviewed and drawn, not built.** Two mockups carry the design
([`mockups/daylight-on-the-day-v1.html`](../../mockups/daylight-on-the-day-v1.html),
[`mockups/weather-as-a-glance-card-v1.html`](../../mockups/weather-as-a-glance-card-v1.html)).
**No ADR yet, deliberately** — six forks are with the owner (§6), and three of them decide the
store shape. Writing the ADR now would be answering them. Same posture as the
[glance-v2 brief](2026-08-31-glance-v2-brief.md), and for the same reason.

**Asked for:** _"Weather forecast and sunrise hours. This should connect to where we are and where
we're going to be. On the home screen it could be like after the day ends, it could show the
forecast for tomorrow. Sunrise and sunset times could also be on the home screen and also on the day
view, to indicate exactly where it catches us. It could also show golden hour times etc."_

**Read first:** [ADR-0180](../decisions/0180-currency-is-derived-and-a-rate-is-a-glance-card.md)
(the pipe-plus-card precedent this is measured against, §3/§4/§7 especially),
[ADR-0045](../decisions/0045-trip-home-real-data-only.md) §4 (the promise that reserved this slot),
[ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) §5/§6.4/§14 (the store
shape that actually fits, as opposed to the one that looks like it does),
[ADR-0214](../decisions/0214-the-night-board-has-one-subject-and-it-is-tomorrow.md) and
[ADR-0215](../decisions/0215-the-glance-card-says-what-only-it-can-say.md) (two rounds of the owner
correcting this app for putting too much on exactly the two surfaces this feature wants),
[ADR-0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) (the day-anchor derivation this
extends), and [ADR-0004](../decisions/0004-integrations-are-pipes.md) (why neither of these ever
gets a tab).

**Backlog:** [the Weather line](../backlog.md) already scopes half of this and names the two things
left to decide — _"the source, and whether a forecast is per-day (the day rail) or current-only (the
glance card)"_. Both are answered below. What the line did not anticipate is §1.

---

## 1 · The finding that reorganises the whole task: this is two features

The ask reads as one feature with two halves. It is two features that share a screen, and they have
almost nothing in common technically:

|                                                   | **Daylight** (sunrise · sunset · golden hour)         | **Weather** (forecast)                   |
| ------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| Where it comes from                               | arithmetic over (lat, lng, date)                      | a third party                            |
| Network                                           | **never**                                             | always, to fill the cache                |
| Works offline                                     | **by construction, forever**                          | only for what was cached                 |
| Horizon                                           | **every day of every trip**, including one a year out | ~7–16 days, provider-dependent           |
| Cold state                                        | **there isn't one**                                   | `null`, and it is the normal first state |
| Store                                             | **none**                                              | a row per (place, day)                   |
| Kill switch, attribution, allowlist, retry policy | **none needed**                                       | all four                                 |
| Can be wrong                                      | only if our maths is wrong                            | routinely, and silently, with age        |

Building them as one feature makes the free half inherit every cost of the expensive half. The
concrete loss is not hypothetical: a trip being planned in March would show **no sunrise for a June
day** — not because sunrise is unknowable, but because a forecast provider's horizon does not reach
it. That is a fiction the app would have manufactured for itself.

So the recommendation that governs everything below: **ship daylight first, alone, and completely.**
It has no provider decision to make, no key to obtain, no bill, no privacy surface and no failure
mode, and it satisfies root rule 5 (offline reads) by construction rather than by mirroring. Weather
follows as a second, separable change — the one that needs the forks in §6 answered.

## 2 · Tech review

### 2.1 `FxService` is the right shape to copy, and its store shape is the wrong one

The backlog says _"`FxService` is the shape to copy rather than invent"_. That is right about
**policy** and wrong about **storage**, and the distinction matters because copying the wrong half
is how the app would end up with a table it cannot bound.

**Transfers unchanged** (all five, and none of them should be re-argued):

- **Serve stale, never block.** A read returns what is stored and schedules a refresh if one is due.
  Nothing user-facing waits on a third party (`fx.service.ts`'s `readAndRefresh`).
- **The read is the trigger.** No scheduler. The snapshot read already happens; deciding whether the
  set has lapsed costs one indexed lookup we are doing anyway (ADR-0157 §6, ADR-0166 §14, ADR-0180
  §4 — three ADRs have now answered this the same way).
- **Surplus work is dropped, never queued.** One in-flight pass, a second caller joins it.
- **A `_DISABLED` kill switch** in `common/env.ts`, beside `ENRICHMENT_DISABLED` and `FX_DISABLED`.
- **The Dexie mirror on `snapshotMeta`**, which `cache.ts` names as _"what makes the rate card work
  offline at all"_. One small object per trip, no schema version bump.

**Does not transfer:** the store. `FxService`'s own header states why it needs no negative cache —
_"there is exactly one document, fetched at most once a day for the whole install, so there is
nothing to bound."_ Weather is the opposite of that sentence in every clause: it is keyed by
**location and day**, a trip has N locations × M days, and the set grows with every trip the app
ever runs. The bounding problem it therefore has is **`PlaceEnrichment`'s**, which was built for
precisely this (ADR-0166 §6.4's per-field TTL and negative cache).

The accurate one-line statement of the build, and the one worth putting in the ADR:

> **Weather is `PlaceEnrichment`'s store with `FxService`'s policy.** Neither on its own.

### 2.2 The cache key is a coordinate grid, not a `placeId`

Keying on `placeId` looks obvious and is wrong twice. `Place` is **trip-scoped by decision**
(`schema.prisma:373`, and ADR-0147 gives the reason: a chosen icon is data about _this trip's_ view
of the place), so two trips at the same hotel would fetch the same forecast twice and store it
twice. And a weather model's own grid is coarser than a street address — asking it about the
restaurant and the hotel 400m away returns the same numbers.

So: **round the coordinate to a grid and key on that plus the date.** At `0.1°` a cell is ~11km,
which is finer than any public model's native resolution and coarse enough that a whole day in one
city collapses to one row. That also makes the store **global and server-owned** — no `tripId`, one
writer, never client-written — which puts it in exactly the category ADR-0166 §1 drew a line around
and `FxRateSet` already sits in: no `Change`, no LWW to arbitrate, no undo to offer, and nothing to
fan out across trips.

A second, quieter benefit worth naming because it is a privacy property and not just an efficiency
one: a rounded cell is what we send a third party, so the provider never learns a member's exact
address, only a ~11km square.

### 2.3 "Where we are and where we're going to be" is already derived — for zones, not coordinates

This is the part of the ask the app has most of the answer to already, and the review's second
substantive finding.

`dayAmbientZone(date, evidence)` (`lib/places.ts:325`) answers _"which zone is this day lived in"_ in
three steps: the day's own events **when the ones with a known zone agree**, else the itinerary
segment at the day's noon, else the trip primary. `dayZoneContext` bundles it. Its `eventKnownZone`
helper carries a rule the weather feature needs verbatim and would otherwise have got wrong:
**a zone-crossing booking does not vote**, because it is the thing that moves you between places and
so cannot testify about where a day sits.

Sun position and a forecast both need the same question answered in **coordinates**. So the one
genuinely new derivation this feature needs is a sibling of that function, not a new mechanism:

```
dayAnchorCoord(date, evidence): LatLng | undefined
  1. the day's own placed events, when the ones with coordinates agree within a cell
     (same abstention rule: a crossing does not vote)
  2. where the night is spent — `dayBookendStays` already answers this
  3. `Trip.destinationLat` / `destinationLng` (ADR-0113 already stores both)
```

Three things make this an extension rather than an invention, and all three are root rule 8:

- It reads the **same `ZoneEvidence` bundle** already assembled and already passed to
  `dayZoneContext` at four call sites. No new argument reaches any screen.
- The coordinate read is **`coordOf(places, placeId)`** from `lib/day-travel.ts:189`, whose own
  docblock says it exists so two surfaces cannot disagree about whether a place is placed.
- `undefined` is a first-class answer, exactly as it is for `crossRate` — a trip with no destination
  coordinates and no placed events gets **no daylight line**, rather than a wrong one.

**The correctness trap, and it is a real one.** A sun time is computed from a _coordinate_ and
rendered in a _display zone_. Those are two derivations, and if they are resolved from different
evidence or on different dates the app prints a sunrise at 21:40 and nobody notices for a month.
The rule is therefore inherited whole from `dayZoneContext`'s own docblock: **one evidence, one
date, both reads.** Worth a test rather than a comment, and the arrival-day case (Tokyo morning,
Tel Aviv evening) is the one to write.

### 2.4 Daylight is ~60 lines of arithmetic, and owning it beats depending on it

The NOAA solar-position algorithm is deterministic, dependency-free, and accurate to about a minute
below |lat| 65°. The angles are standard and are the whole feature:

| Event               | Solar altitude                              |
| ------------------- | ------------------------------------------- |
| Sunrise / sunset    | −0.833° (refraction + the sun's own radius) |
| Golden hour         | +6° → −4°                                   |
| Blue hour           | −4° → −6°                                   |
| Civil twilight ends | −6°                                         |

**Recommendation: own it, in `packages/shared`.** `suncalc` is small and good, but
`@waypoint/shared` today has **exactly one runtime dependency** (`zod`, and nothing else in the
`dependencies` block), it is imported by both apps, and this is arithmetic we would have to write a
test table for either way. Doubling that package's dependency surface for sixty lines of trigonometry
is the wrong trade. It belongs beside `travel-time.ts` and `crossRate` for the reason
`packages/shared/CLAUDE.md` already gives: **this package supplies values, consumers supply words.**

**The state that is not an error and must be designed:** above the polar circles there are days with
**no sunrise and no sunset at all**. Tromsø in June is not a hypothetical trip for a travel app. The
function returns `undefined` for those edges and the surface says so in words — `השמש לא שוקעת היום`
— which is the same "a miss degrades, never a wrong answer" contract `COUNTRY_CURRENCY` and
`crossRate` both already carry. Clamping it to 23:59 would be the wrong answer wearing a time.

### 2.5 Two rules inherited from ADR-0180, and one of them must be inverted

ADR-0180 §4 decided **"absence is keyed on existence, not age — a cached rate of any age gets a
card"**, on a good argument: a reference rate is _published on a schedule_, so one fetched five
minutes ago can be three days old and still be the current rate.

**That argument does not survive the move to weather, and inverting it is the sharpest thing in this
review.** A five-day-old exchange rate is still the rate. A five-day-old forecast is
**misinformation**, and it is misinformation of the specific kind this app exists to prevent — it
would say "take a jacket" on the wrong day, on the surface a person checks _instead of_ looking out
of the window. So:

- Weather carries a **staleness bound**, and past it the card **goes** rather than lies.
- Daylight carries **none**, and cannot: it is computed on the spot from a date the device already
  knows.

The rule that _does_ transfer intact is the freshness _source_: ADR-0180 §4's "the date is the
source's, not ours". A forecast has a model run time, and that is what an "as of" would state.

### 2.6 The concrete build surface

Nothing here is a new mechanism; every line names the thing it extends.

**Daylight (no network, no store):**

| Layer                           | Change                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared`               | new `daylight.ts` — the solar math + `DayLight` type, `undefined` on polar days. Pure, tested against a published table. |
| `frontend/lib/places.ts`        | `dayAnchorCoord(date, evidence)` beside `dayAmbientZone`, same evidence bundle                                           |
| `frontend/lib/day-track.ts`     | daylight fractions over the rail's existing window — the track already normalises a day to 0..1                          |
| `frontend/styles/day-track.css` | one custom property for the night ground (`--track-night`), the sheet ADR-0214 §5 split out for exactly this             |
| `frontend/screens/DayView.tsx`  | one row in the existing `.day-ambient` strip                                                                             |
| backend                         | **nothing at all**                                                                                                       |

**Weather (the pipe):**

| Layer                                  | Change                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/weather/`                 | new module — `weather.service.ts` (FX's policy), `weather.provider.ts` (token-bound, one implementation), `weather.module.ts` |
| `backend/prisma`                       | one `WeatherForecast` model keyed `(cell, date)`, global, outside the change log — `FxRateSet`'s neighbours in the schema     |
| `backend/enrichment/outbound-fetch.ts` | **one line** in `ALLOWED_HOSTS`. The allowlist is code, deliberately (that file's own posture)                                |
| `backend/common/env.ts`                | `WEATHER_DISABLED`, the fifth of its kind                                                                                     |
| `packages/shared`                      | `forecastSchema` + the snapshot field, `.default(null)` for the same mid-deploy compatibility reason `fxRates` is             |
| `backend/trips.service.ts`             | one read on the snapshot, beside `fx.readAndRefresh()`                                                                        |
| `frontend/lib/cache.ts`                | one field on `snapshotMeta`, beside `fxRates`                                                                                 |
| `frontend/ui/domain/`                  | `WeatherCard` — `מבט מהיר`'s second tenant, `RateCard`'s sibling                                                              |

**The outbound fetcher is reused, not rebuilt.** `EnrichmentFetcher` is the process's one
allowlisted, timeboxed, size-capped seat, and `fx.module.ts` already states why a second one would
be a second place to get SSRF wrong.

**No route.** ADR-0180 needed `FxController` for exactly one reason: §4's manual-refresh affordance
had to _await_ a fetch. Weather's refresh is the day turning over, not a tap, so the snapshot push
serves it and the module has no controller. If a "refresh now" is ever wanted, `FxController`'s
header is the precedent and its two guards are the shape.

### 2.7 What this feature must not do

- **No tab, no screen** (ADR-0004). Both halves feed the Now/Next timeline and the day; the day rail
  and the glance card are their whole surface area.
- **No semantic hue.** Rule 4 / ADR-0028: amber is the clock, teal is the place, violet is Plan.
  The condition is an **emoji glyph** (content the world chose, exactly as an event's mark is
  content the group chose) and the temperature is a mono numeric run — the treatment ADR-0180 §8
  already chose for a fact about the world.

  **The daylight widget's sky is illustration, not an accent**, and the mockup measures that rather
  than asserting it. The first measurement refuted the _wording_: in HSL saturation the dawn wash
  scored 57% against teal's 56%, a near-tie. That is a bad metric, not a bad design — HSL inflates
  pale tints, and the design language itself reasons in **chroma** (_"chroma, not hue angle, is what
  separates it from the pin hues"_). Measured as chroma, and composited over the card as it is
  actually painted, **the most colourful sky stop is 1.7× paler than the palest semantic hue**. The
  one element with a real claim on a hue is a severe-weather alert, which genuinely is a status;
  that is fork F in §6.

- **No location permission, ever.** Everything here is derived from the itinerary, which is
  ADR-0107 §4's standing rule (_"driven by the itinerary, never GPS"_). The app already knows where
  you will be; asking the device is both unnecessary and a permission prompt we would owe an answer
  for.

## 3 · Product design

### 3.1 The one sentence

**Daylight tells you how much day you have left; weather tells you what to carry.** Both are only
worth a pixel where they change what a person does in the next few hours — which is the
living-visibility charter, and it is also the test that kills most of the feature list in §4.

### 3.2 Where each fact lands — settled by two owner corrections, not by argument

**This section was rewritten twice, and the history is the decision.** The first draft reasoned
from ADR-0214's and ADR-0215's subtraction discipline and proposed daylight as a night-tinted
_ground_ behind the glance rail: +0px of height, +0 text runs, +0 marks. Every number in its
measurement table was a zero, and in dark it rendered pixel-identical to the rail beside it. The
owner: _"All your suggestions are soooo ugly. I want something inviting, more prominent, more
friendly, not so cramped up. Also in the day view."_

The second draft over-corrected into a **244.8px** daylight card that cost 292.8px of Home. The
owner: _"Too big! This should be a fun little widget, maybe have an indication on the glance and
day view to easily link to where it finds us."_

**What the first draft got wrong was the precedent, not the execution.** ADR-0214 and ADR-0215
subtract _duplicated_ facts and chrome that describes the drawing — a confirmation code printed
twice 240px apart, a caption naming the rail beneath it. Daylight and weather are neither: they are
facts the app says **nowhere** today, asked for by name. New information earns room; a second copy
of an old fact does not. Those ADRs are a rule about redundancy, not a budget forbidding the app a
new surface. Recorded here because it is the kind of mistake that gets made again.

**The shape both corrections converge on — a widget plus a mark:**

1. **Two small widgets, side by side, in `מבט מהיר`.** Daylight measures **105px**, weather
   **143px**. That section is ADR-0045 §4's promised home and ADR-0180 §3 restored it for exactly
   this; it still vanishes when it has no cards. The daylight widget draws the sun's **real
   altitude curve** for that place and date, which is what makes the polar states pictures rather
   than apologies (§3.4).

2. **Nothing else on Home changes, and nothing at all on the day view.** An intermediate version
   added a pressable `.sun-mark` chip to the glance card's foot and a row to the day view's
   `.day-ambient` strip. The owner removed both, and each removal stands on its own reason:

   - **The day view's strip** already stacks a row per stay (a hotel-change day is two), the day's
     distance total (`DayTravelTotal`) and Plan's fit verdict (`.day-fit`) — daylight would be a
     fifth row for a fact no truer of that day than of any other.
   - **The glance card's mark** printed the same fact the widget prints one scroll away. That is
     the duplication ADR-0214 measured (a confirmation code twice, 240px apart) and ADR-0215
     measured again (`19:00` four times on one screen), each time removing it.
   - **And the sky behind the glance rail went with it**, which is the consequence worth not
     leaving dangling: it was justified _only_ by making the mark's word and the rail's picture
     agree. With no mark it is pass 1's rejected idea returning unargued, so it is gone.

   Both surfaces are therefore byte-for-byte what ships today, asserted at **113px → 113px** on the
   glance card and **41px → 41px** on the day view. What is lost is the ask's own _"also on the day
   view"_, recorded rather than smoothed over; if it returns it does not return to the strip, since
   the day's `.sec-title` is the only slot there that costs no row and it already carries the add
   button.

3. **The whole feature is two widgets in one section.** That is the shape ADR-0180 §3 already built
   `מבט מהיר` for, and ADR-0045 §4 reserved it for. No new host, no new mechanism, no second
   grammar anywhere else on the screen.

4. **Tomorrow's forecast on the night board, at ≤1 run.** ADR-0214 already made tomorrow that
   board's rank-1 subject, so the host exists; it got there by removing four things, and its census
   counts text runs. Tomorrow's weather is therefore one glyph and one number on the line that
   already says `מחר`.

### 3.2a The order inside `מבט מהיר`: forecast, daylight, rate

Asked directly — _"are we fine with the ordering? Sunrise sunset widget before the forecast?"_ — and
no, it was wrong, so it changed. **The rule is most volatile and most actionable first.** A forecast
moves hourly and decides what you carry in the next thirty minutes; daylight is **fixed for the
whole day**; a published reference rate moves once a day at most (ADR-0180 §4). That yields one
order — **forecast · daylight · rate** — and it is also the order the ask itself wrote ("weather
forecast and sunrise hours").

**The counter-argument, and why it loses.** Daylight is the only one of the three that is _always_
present: no cold state, no horizon, never expires. Leading with it gives the section a stable head,
where a missing forecast shifts everything. That loses because it optimises for the **layout**
rather than for the **reader** — and the app already handles vanishing tenants everywhere (ADR-0050's
derived tiles, `RateCard` returning `null` on a pair it cannot price). When the forecast is absent,
daylight simply moves up; nothing breaks, the section just gets shorter. The weather mockup's §8
draws both states side by side.

### 3.2b The one thing this app can do that a weather app cannot

A weather app answers "what is the weather in Tokyo". This app knows the group is in **Tokyo
tonight, Hakone tomorrow, Kyoto on Thursday** — so every row in the forecast strip names its own
day, its own **place**, and the forecast _there_. That is the whole of "where we are and where
we're going to be", it is the reason this stays a pipe rather than a tab (ADR-0004), and it is what
the weather mockup's §2 draws against a generic three-day strip.

### 3.3 The two questions the card must answer, and the one it must not

A weather card that says `24°` has said nothing a person acts on. The two questions worth the space
are **"do I need a jacket or an umbrella in the next few hours"** and **"is tomorrow going to change
the plan"**. The question it must _not_ answer is "what is the weather" in the general sense — that
is a weather app, and this is not one (ADR-0004: integrations are pipes). Concretely: no radar, no
humidity, no pressure, no ten-day strip, no "feels like" as a second number.

## 4 · The feature list

MoSCoW against the two-phase split in §1. **Phase D** = daylight (no provider needed, buildable
today). **Phase W** = weather (gated on §6's forks).

### Phase D — daylight

| #   | Feature                                                 | Priority                 | Surface                 | Notes                                                                                                                    |
| --- | ------------------------------------------------------- | ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D1  | Sunrise / sunset for the day, in the day's own zone     | **Must**                 | Day view `.day-ambient` | The core of the ask. One line, one row in an existing strip                                                              |
| D2  | Night/day ground behind the day rail                    | **Must**                 | Home glance card        | §3.2's zero-cost move; "exactly where it catches us" made visual                                                         |
| D3  | `dayAnchorCoord` — the day's coordinate anchor          | **Must**                 | derivation              | The prerequisite for D1/D2/W1 alike                                                                                      |
| D4  | Golden hour (start/end, both ends of the day)           | **Should**               | Day view                | The ask names it. Belongs where there is room for a third time                                                           |
| D5  | Day length, and whether it is getting longer or shorter | **Could**                | Day view                | Cheap once D1 exists; genuinely useful on a long trip                                                                    |
| D6  | Blue hour / civil twilight                              | **Could**                | Day view, folded        | One angle away from D4. Only if D4's line is not already full                                                            |
| D7  | Polar day / polar night, said in words                  | **Must** _(if D1 ships)_ | Day view                | Not a feature, a correctness obligation — see §2.4                                                                       |
| D8  | "Sunset in 40 min" as a live countdown                  | **Won't (v1)**           | —                       | Amber is the clock's and this would spend it on something that is not a commitment. Re-propose only with a measured case |

### Phase W — weather

| #   | Feature                                                 | Priority                 | Surface             | Notes                                                                                                          |
| --- | ------------------------------------------------------- | ------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| W1  | Today's condition + temperature                         | **Must**                 | `מבט מהיר` card     | The section's promised second tenant                                                                           |
| W2  | Tomorrow's condition + high, at night                   | **Must**                 | Night board, ≤1 run | The ask's own example. ADR-0214's census is the acceptance test                                                |
| W3  | Per-day forecast on the day view                        | **Should**               | Day view            | Answers the backlog's open "per-day or current-only" — **both**, and they are different surfaces, not a choice |
| W4  | Precipitation as the one thing that changes a plan      | **Should**               | card + day          | The single most actionable fact; the reason "do I need an umbrella" beats "what is the weather"                |
| W5  | High / low for the day                                  | **Should**               | day view            | One extra run, on the surface that has room                                                                    |
| W6  | Forecast at the _next_ place, not just this one         | **Could**                | card                | "Where we're going to be", literally. Needs the anchor to be the next day's, not today's                       |
| W7  | Staleness bound — the card goes rather than lies        | **Must** _(if W1 ships)_ | all                 | §2.5. A correctness obligation, not a feature                                                                  |
| W8  | Severe-weather alert                                    | **Could**                | card                | The only element with a claim on `--miss`. Fork F                                                              |
| W9  | Hourly strip                                            | **Won't (v1)**           | —                   | This is the weather-app move ADR-0004 exists to refuse                                                         |
| W10 | Weather-driven suggestions ("move the walk to Tuesday") | **Won't (v1)**           | —                   | A different feature with a different ADR. Worth a backlog line, not this one                                   |

## 5 · Risks

- **The rail gets busy again.** Mitigated by construction — D2 spends ground, not marks, and the
  mockup asserts `0` touching pairs the way ADR-0214's and ADR-0215's did.
- **A forecast is confidently wrong.** Mitigated by W7 and by never saying more than the two
  questions in §3.3. A forecast that only claims "rain, afternoon" is right far more often than one
  that claims `24.3°`.
- **A provider disappears or changes terms.** Mitigated by the token-bound provider interface, which
  `fx.provider.ts` already argues for: one interface makes a swap a file, no interface makes it a
  rewrite.
- **Coordinate drift between the zone read and the coordinate read.** §2.3. Mitigated by one
  evidence, one date, and a test on the arrival day.

## 6 · The forks — what is actually being asked of the owner

Everything above is a recommendation; these six are decisions.

- **A · Ship daylight first, on its own?** _Recommended: yes._ It has no provider decision in it and
  no failure mode, so it can be built and shipped while B is still open.
- **B · The provider.** ~~Open-Meteo is the standing recommendation.~~ **Measured 2026-09-02 — see
  the amendment at the foot of this document, which unseated it.** Coverage is a tie (both keyless
  globals serve all 57 destinations); the terms are not (Open-Meteo's free tier is non-commercial by
  its own wording). **The recommendation is now MET Norway**, and the owner **answered
  (2026-09-03)**: _"It isn't commercial yet, and if it becomes, I would still prefer to not pay if
  possible — weather is not a major part of the app."_ That **confirms** MET Norway rather than
  flipping to Open-Meteo, and sharpens why: Open-Meteo's free tier stops being available at exactly
  the moment the app turns commercial, so the binding constraint is **free permanently, not free
  today**. NLOD 2.0 §2 was then read directly and grants _"any purpose … free, perpetual and
  worldwide"_ — an explicit permission rather than an absent prohibition, which is the bar ADR-0180
  set. **Settled in [ADR-0218](../decisions/0218-a-forecast-expires-and-the-widget-goes-rather-than-lies.md) §2.**
- **C · The staleness bound.** ~~How long?~~ **Answered (owner, 2026-09-03): 6 hours for today,
  24 for tomorrow and beyond** — the proposal, taken as proposed. The accepted cost is stated in the
  ADR rather than smoothed: on a patchy connection abroad the card disappears after ~6 hours offline,
  which is the honest failure and a visible one. **Settled in
  [ADR-0218](../decisions/0218-a-forecast-expires-and-the-widget-goes-rather-than-lies.md) §4.**
- **D · ~~Ground on the ribbon as well as the rail?~~ Settled by the corrections.** The ground is no
  longer the feature — it survives only as a quiet backdrop on the glance rail, behind the mark that
  actually carries the message. Two feel calls remain in its place, both device reads (ADR-0017) and
  both controls in the mockup: the widget's **sky height** (48 · **64** · 80px) and the sky's
  **strength** (70 · **100** · 130%).
- **E · Where does the mark lead when the widget is on another screen?** Drawn as leading to the
  widget on the same screen. If the widget lives only on Home, the day view's mark needs a **sheet**
  — and a sheet is `Modal`/`Sheet`, never a hand-rolled layer (lint-blocked, ADR-0090).
- **F · May a severe-weather alert spend `--miss`?** It is genuinely a status, which is what `--miss`
  is for, and it is the one weather element the colour budget can argue for. Default: **no for v1** —
  W8 is a `Could`, and spending a semantic hue on a `Could` is how budgets erode.

## 7 · What was checked, and what was not

**Checked, in the source:** the FX pipe end to end (`fx.service.ts`, `fx.provider.ts`,
`fx.controller.ts`, `fx.module.ts`), the snapshot and Dexie path for `fxRates`
(`entities.ts:700` → `trips.service.ts:526` → `cache.ts:105`), `RateCard` and its host block in
`Home.tsx:1422`, the zone-evidence derivation (`places.ts:265–360`), `coordOf`
(`day-travel.ts:189`), the rail's window and model (`glance.ts`, `day-track.ts`,
`day-track.css`), `.day-ambient`'s gating (`DayView.tsx:1114`), the outbound allowlist
(`outbound-fetch.ts:44`), the kill-switch convention (`env.ts:147`), and
`packages/shared/package.json`'s dependency block (one entry, which is what §2.4 turns on).

**Not checked, and owed before the ADR:** ~~the provider comparison and its terms (fork B)~~ — **run
2026-09-02, see the amendment**; and a real-device pass on both mockups (ADR-0017), which is where C,
D and E should actually be settled, and which remains the largest unblocked piece of work here.

---

## Amendment (2026-09-02) — the provider comparison ran, and it unseated the standing recommendation

§6's fork B named Open-Meteo as "the standing recommendation" and said in the same breath that the
recommendation was **unmeasured**. It has now been measured. **The measurement moved it**, and not
on the column anyone expected: coverage is effectively a tie, and the terms are not.

This environment's egress reaches every candidate host, so unlike
[ADR-0180](../decisions/0180-currency-is-derived-and-a-rate-is-a-glance-card.md)'s design session —
which had to defer its coverage check to the build — the sweep ran here.

### The sweep

One representative coordinate per row of `DESTINATIONS` (the iconic city in that row's `aliases`,
else the capital), one request per coordinate, live 2026-09-02.

| candidate                       | serves our 57 | horizon    | daily aggregate       | precip probability | key  | commercial use      |
| ------------------------------- | ------------- | ---------- | --------------------- | ------------------ | ---- | ------------------- |
| Open-Meteo                      | 57 †          | 14–16 days | yes, in local zone    | **yes**            | none | **no** (§ below)    |
| **MET Norway** locationforecast | **57**        | ~10 days   | **no** — we aggregate | no (amount only)   | none | yes                 |
| NWS `api.weather.gov`           | **1**         | 8 days ‡   | day/night periods     | **yes**            | none | yes (public domain) |

† **The four that failed are operational, not geographic, and saying so took a second pass.** The
first sweep returned 53/57 for Open-Meteo. Re-tested individually: `GB` and `JP` succeeded (transient
`503`), `US` returned an explicit `429 Daily API request limit exceeded`, and `TH` returned `500
Something went wrong` repeatedly — including at a neighbouring coordinate, and only on the 16-day
`daily=` request, while `current=` at the same point returned `200`. **Reported as 57 because none of
the four is a coverage gap**, which is the number that matters for a provider decision; the `TH`
result is a reliability note, not a hole in the map. A first-pass "53/57" would have been a fabricated
gap in a table whose whole job is to be trusted.

‡ Measured at New York rather than assumed: the gridpoint forecast returns 14 named day/night
periods spanning 8 calendar days, each carrying `probabilityOfPrecipitation`. Every number in this
table is a response this session read, which is the whole point of running the sweep instead of
citing a vendor page.

**NWS is this comparison's ECB** — authoritative, free of every licensing question, and useless as a
primary at **1 of 57**. It keeps the same standing ADR-0180 gave the ECB: a good _second_ provider
later, for the one destination it is best in the world at, behind the same token-bound interface.

### Coverage is a tie, so the terms decide — and they go the other way

This is the same shape as ADR-0180 (which chose "on more than the coverage column"), with the sign
reversed. Quoted from the terms, not recalled:

- **Open-Meteo: _"You may only use the free API services for non-commercial purposes."_** Commercial
  use is a paid plan. Data is CC-BY 4.0; caching is not addressed either way. Free tier is
  600/min · 5,000/hr · **10,000/day**, weighted — their own worked example is _"2 weeks of data with
  15 weather variables … 1.5 API calls"_.
- **MET Norway: no commercial restriction.** NLOD 2.0 / CC BY 4.0, credit as _"Data from MET
  Norway"_. It asks for three concrete things in return, and **all three are things this design
  already does**: an identifying `User-Agent`, ≤20 req/s, and honouring `Expires` /
  `If-Modified-Since`. Measured on a live response: `expires` sits ~22 min out and `last-modified` is
  present, so serve-stale-never-block (§2.1's inherited policy) _is_ their caching contract rather
  than something bolted beside it.

**The `429` does not prove the quota is too small for this app, and I am not going to imply it
does.** It came from a shared egress IP whose weighted allowance was already partly spent — ~57
requests at ~1.5 weight each is ~85 calls against 10,000. What it proves is that the free tier is
**per-IP quota'd**, which is a fact about the backend's fetch volume worth sizing once: one fetch per
coordinate cell per refresh, ~10 cells a trip, refreshed 4× a day, is ~40 calls/trip/day — about 250
concurrent trips inside the free allowance. That is a grow-later number, not a v1 one.

### Recommendation: MET Norway for v1

It is the only candidate that is correct under **both** answers to the one question fork B actually
turns on — _is Travelive commercial?_ — and that question is the owner's, not this document's. Root
`CLAUDE.md` says invite-only and not production-scaled, with a **grow-later** mindset; ADR-0180 has
already spent a paragraph preferring a source whose terms do not foreclose. Choosing the source that
needs no answer is the cheaper move than choosing the one that needs the answer to stay "no".

**Three real costs, stated rather than smoothed:**

1. **~10 days of horizon instead of ~15.** This makes §2.7's horizon state _more_ load-bearing, not
   less — the dashed placeholder is reached sooner and by more trips. It does not change any
   mechanism.
2. **No daily aggregate — the app rolls hourly into a day itself.** The honest read is that this is
   partly a _feature_: aggregating means picking the day's high, low and dominant condition **in the
   day's own zone**, which the app already derives per day (ADR-0107, and `dayAnchorCoord` beside
   it), where `timezone=auto` would hand back a zone the app then has to reconcile with its own.
   It is still code that Open-Meteo would have given for free.
3. **No precipitation probability globally — amount only.** W4 ("the one thing that changes a plan")
   survives on amount, and §5 already argues a forecast claiming _"rain, afternoon"_ is right more
   often than one claiming `24.3°`. But "40% chance" is not available and W4's copy must not imply it.

**If the answer is "non-commercial, and I will pay if it grows", Open-Meteo is the better data and
the swap is one file** — which is exactly what §5's token-bound provider interface was argued for.
Nothing here is a one-way door.

### Three things this hands the ADR for free

- **The attribution slot is already paid for.** ADR-0180's amendment put the mark on a line under the
  card _specifically_ because "a section heading attributes the _section_ — which ADR-0045 §4 has
  already promised to a second tenant, weather, from a different source." That second tenant is this
  one. `Data from MET Norway` takes the pattern already built; the 21px was spent in advance.
- **The coordinate-cell key (§2.2) is confirmed by the providers themselves.** Open-Meteo snapped
  requested coordinates to its own grid — Tel Aviv `32.0853,34.7818` came back as `32.0625,34.8125`,
  Athens as a flat `38,23.75`. **At some sites the provider's own grid is coarser than the proposed
  `0.1°` cell**, so the cell throws away nothing the source preserved. §2.2's key was argued from
  trip-scoping; it is also right about resolution.
- **§7.5's condition-glyph question gets an input, not an answer.** MET's `symbol_code` carries
  **day/night variants natively** (`clearsky_day` / `clearsky_night` — 24 distinct codes observed
  across the 57 sites, against 16 WMO codes from Open-Meteo in the same snapshot). A glyph that
  already knows whether the sun is up sits very close to the drawn marks `SunGlyph` now renders. The
  handoff's instruction stands: **decide it in the ADR, deliberately, not in whichever file is
  written first.**

### What §6 got wrong, in the sentence that recommended the loser

Fork B sold Open-Meteo partly on _"no key, **no attribution requirement to place**"_. **That is
false.** Open-Meteo's data is CC-BY 4.0, which requires attribution exactly as MET Norway's NLOD /
CC BY 4.0 does — so attribution was never a column that separated the candidates, and the one
sentence claiming it did was pointing at the wrong winner. Recalled rather than checked, in the
paragraph whose entire purpose was to admit it had not been measured. The same failure mode
ADR-0180's amendment caught in itself over ISK, one document later.

Practically it costs nothing — the previous section shows the slot was already paid for by ADR-0180
— but it removes a reason that was doing real work in the recommendation.

### What was not measured, and why

**The keyed class** — OpenWeatherMap, WeatherAPI, Tomorrow.io, Pirate Weather — was not measured.
Each needs a signup and a secret before it returns a single byte, and no key was created for this
review. That is a stated gap, but a small one: a key is itself a cost this app has so far avoided
(the enrichment pipe's existing sources are keyless), and none of them offers coverage the two
keyless globals lack. **If fork B is answered "pay for it", the paid tier to price first is
Open-Meteo's own** — same shape, same fields, no integration change.

**Fork C is untouched by all of this.** The staleness bound is still a feel call, and it is still
the owner's. The measurement narrows nothing there: both candidates publish an issue time, so
either can support any bound chosen.
