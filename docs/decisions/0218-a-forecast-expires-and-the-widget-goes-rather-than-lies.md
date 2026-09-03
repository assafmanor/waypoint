# 0218 — A forecast expires, and the widget goes rather than lies

**Status:** Accepted — **built 2026-09-03**; the build log at the foot records the two things the design left open and the one place the mockup was drawing another card's silhouette.
**Date:** 2026-09-03

**Refines:** [0180](0180-currency-is-derived-and-a-rate-is-a-glance-card.md) (the pipe-plus-card precedent this copies, and whose §4 freshness rule this **inverts** for the one reason §4 does not cover; also the second tenant its attribution decision was made for), [0045](0045-trip-home-real-data-only.md) §4 (the promise that reserved this slot), [0166](0166-place-enrichment-is-a-multi-source-pipe.md) §5/§6.4/§14 (the store shape, serve-stale, and the no-scheduler trigger), [0107](0107-per-place-timezones-and-multi-zone-time.md) (the per-day anchor this reads, and its "itinerary, never GPS" rule), [0004](0004-integrations-are-pipes.md) (why this never gets a tab), [0050](0050-home-quick-access-deep-links-and-empty-states.md) (the derived-tile rule the horizon state obeys)

**Relates:** the daylight half shipped separately and needs none of this — see [`packages/shared/src/daylight.ts`](../../packages/shared/src/daylight.ts) and the brief's §1, which is why it is not in this ADR.

**Drawn in:** [`mockups/weather-as-a-glance-card-v1.html`](../../mockups/weather-as-a-glance-card-v1.html) — the card, the day strip, the horizon placeholder, the staleness control, and §5's rendered refusal of the weather-app extras.
**Session note:** [`planning/2026-09-02-weather-and-daylight-brief.md`](../planning/2026-09-02-weather-and-daylight-brief.md) — the review, and its 2026-09-02 amendment carrying the provider measurement.

## Context

The ask was _"weather forecast and sunrise hours… connect to where we are and where we're going to
be."_ The review split it in two, and **daylight shipped alone** because it is arithmetic with no
provider, no store and no horizon, and would otherwise have inherited all three from its expensive
half. This ADR is the half that was left.

It was blocked on two decisions, both now answered:

- **The provider (fork B).** Open-Meteo was the standing recommendation and the review said in the
  same breath that it was **unmeasured**. The sweep ran 2026-09-02 (brief amendment) and the terms
  moved the answer.
- **The staleness bound (fork C).** Answered by the owner, 2026-09-03: **6 hours for today, 24 for
  tomorrow and beyond.**

The owner also settled what fork B actually turned on: _"It isn't commercial yet, and if it becomes,
I would still prefer to not pay if possible — weather is not a major part of the app."_ That is the
sentence this decision is built on, and it points somewhere the review's own recommendation did not.

## Decision

### 1. Weather is `PlaceEnrichment`'s store with `FxService`'s policy

The backlog line said _"`FxService` is the shape to copy rather than invent."_ That is right about
**policy** and wrong about **storage**, and the distinction is the whole design:

- **Copy the policy**: serve-stale-never-block, read-is-the-trigger, in-flight dedupe, a `_DISABLED`
  kill switch, the Dexie mirror on `snapshotMeta`.
- **Do not copy the storage.** `fx.service.ts`'s own header explains why it needs no negative cache:
  _"there is exactly one document … nothing to bound."_ Weather is keyed by **place and day**, so it
  is a bounded, expiring, many-row store — `PlaceEnrichment`'s shape, not `FxRateSet`'s.

### 2. The provider is MET Norway, and it was chosen on terms after coverage tied

Measured live across one representative coordinate per row of `DESTINATIONS`:

| candidate                       | serves our 57 | horizon    | daily aggregate       | precip probability | key  | commercial use      |
| ------------------------------- | ------------- | ---------- | --------------------- | ------------------ | ---- | ------------------- |
| Open-Meteo                      | 57            | 14–16 days | yes, in local zone    | yes                | none | **no** (free tier)  |
| **MET Norway** locationforecast | **57**        | ~10 days   | **no** — we aggregate | no (amount only)   | none | **yes**             |
| NWS `api.weather.gov`           | **1**         | 8 days     | day/night periods     | yes                | none | yes (public domain) |

**Coverage is a tie between the two keyless globals, so the terms decide.** Open-Meteo's free tier
is _"only … for non-commercial purposes"_ by its own wording; its paid plan is the commercial path.
MET Norway is free under NLOD 2.0 / CC BY 4.0, and the grant is explicit rather than merely
unprohibited — NLOD §2: _"may use the information for any purpose and in all contexts… a
non-exclusive, **free, perpetual and worldwide** licence"_, with MET's own page adding _"Data
produced by us is free to use"_ and reserving fees only for customised deliveries, partner-sourced
data and special delivery guarantees, none of which is the public API.

**This is what the owner's answer picks, and it is worth being precise about why**, because the
naive reading of "not commercial yet" points at Open-Meteo. It points the wrong way: Open-Meteo's
free tier stops being available at exactly the moment the app turns commercial, which is the moment
the owner said they would still rather not pay. MET Norway is the option that never presents a bill,
under either future. **The constraint is "free permanently", not "free today".**

**NWS is this comparison's ECB**, and inherits the standing ADR-0180 gave it: useless as a primary
at 1 of 57, and a good _second_ provider later for the one country it is best in the world at.

**MET asks three things in return, and this design already does all three**: an identifying
`User-Agent`, at most 20 req/s, and honouring `Expires` / `If-Modified-Since`. Measured on a live
response, `expires` sits ~22 min out and `last-modified` is present — so **serve-stale is their
caching contract**, not something bolted beside it.

### 3. The cache key is a rounded coordinate cell, not a `placeId`

`PlaceEnrichment` is trip-scoped by decision, so a `placeId` key fetches the same hotel twice for two
trips. The key is a **rounded coordinate cell at `0.1°`** (~11 km, the constant the frontend already
carries as `DAY_ANCHOR_AGREE_M = 11_000`), and the row is **global**, outside the change log.

**The providers confirm the cell throws nothing away.** Open-Meteo snaps requests to its own grid —
Tel Aviv `32.0853,34.7818` comes back as `32.0625,34.8125`, Athens as a flat `38,23.75`. At some
sites the source's own grid is **coarser** than the cell, so the rounding loses no resolution the
forecast ever had. §2.2 of the review argued this key from trip-scoping; it is also right about
resolution, which is the stronger argument and was not the one made.

### 4. A forecast expires — ADR-0180 §4's freshness rule is inverted here

ADR-0180 §4 says absence is keyed on **existence, not age**: a three-day-old published rate is still
the rate. **A five-day-old forecast is not stale, it is wrong**, and wrong on the surface a person
checks _instead of_ looking out of the window. So the rule flips:

> **A forecast has a shelf life. Past it the widget is absent, never approximate.**

**The bound (owner, 2026-09-03): 6 hours for today, 24 hours for tomorrow and beyond.** Today earns
the tighter one because today's weather is the fact being substituted for a window; a day-4 forecast
barely moves in a day. The accepted cost, stated rather than smoothed: **on a patchy connection
abroad the card disappears after ~6 hours offline.** That is the honest failure and it is a visible
one, which is the trade this rule exists to make.

This does not weaken root rule 5 (offline reads). Everything the rule protects — index, documents,
today — still reads offline. A forecast is the one thing whose _value_ is its age.

### 5. The horizon is a state, not an error

A provider reaches ~10 days; trips are planned further out. Day 12 is **not** an error and **not** an
empty forecast:

- the day rail draws the **dashed placeholder in the soft grammar** (`.wp-track-empty`'s own answer),
- the card is **absent**, per ADR-0050's derived-tile rule and `RateCard`'s precedent of rendering
  nothing for an unpriceable pair.

MET's ~10 days makes this state **more** load-bearing than Open-Meteo's ~15 would have: it is reached
sooner and by more trips. That is a reason to build it properly, not a reason to have picked
differently.

### 6. No route, no controller

`FxController` exists only because ADR-0180's **manual refresh** had to await a fetch. Weather has no
manual refresh — its trigger is the day turning over — so the snapshot read serves it and no
endpoint is added. One read beside `fx.readAndRefresh()`, one field on the snapshot, one field on
`snapshotMeta`.

**`EnrichmentFetcher` is reused, not duplicated.** It is the process's one allowlisted, timeboxed,
size-capped seat, and `fx.module.ts` already states why a second would be a second place to get SSRF
wrong. `api.met.no` is one line in `ALLOWED_HOSTS`, which stays code on purpose.

### 7. The condition mark is content; the sun's marks are chrome. Both, and it is not a contradiction

This is the question the handoff insisted be settled deliberately rather than by whichever file got
written first, because the design language's 2026-09-02 amendment reopened it.

**The condition mark stays an emoji**, mapped from `symbol_code` through a lookup table — the shape
`BOOKING_TYPE_ICON` already has. Three tests, and they agree:

- **Provenance.** The amendment's test is _"a mark the app **computes** is chrome"_. The app does not
  compute a condition; MET Norway does, and the app holds it. A sunrise is derived from a latitude
  and a date and so is chrome; a forecast is a fact received, and so is a per-entity badge — the
  category the design language explicitly keeps as emoji.
- **There is no surface to draw from.** `SunGlyph`'s licence to be drawn _and coloured_ is that each
  tile is literally a slice of the gradient above it — _"draw from the surface, not from a new
  palette."_ **`WeatherCard` has no illustration**: it is a head (mark, temperature, condition,
  range) plus a day strip, structurally `RateCard`, not `SunWidget`. A drawn condition mark would
  have to invent a palette, which is the exact move the amendment forbids.
- **The sibling test does not fire, and it is worth recording why**, since it is what forced the last
  two amendments. It fires on _the same kind of thing rendered two ways in one region_ — four sibling
  buttons with three emoji and one SVG compass; four `EmptyState`s in one ternary. The condition
  badge and the sun tiles are **different kinds** (a fact received, a mark derived) and are **not
  siblings**: the tiles live on `SunWidget`'s foot, one card away.

**The tripwire, so nobody re-derives this:** if `WeatherCard` ever grows its own illustration — a sky
behind the temperature, the thing fork D killed for the rail — **the condition mark joins that
illustration and becomes chrome**, drawn from that surface's ramp. The rule is not "weather is
content forever"; it is that a mark drawn on an illustration belongs to the illustration.

### 8. Attribution costs nothing, because ADR-0180 already paid for it

MET requires credit: `Data from MET Norway`. ADR-0180's amendment put FX's mark on **a line under the
card** rather than in the free section-heading slot, and said exactly why: _"a section heading
attributes the section — which ADR-0045 §4 has already promised to a second tenant, weather, from a
different source. One slot cannot carry two sources honestly."_ **This is that second tenant.** The
21px was spent in advance, deliberately, and the pattern is already built.

### 9. What v1 does not do

- **No severe-weather alert** (fork F). It is the one element with a claim on `--miss`, and it is a
  `Could`; spending a semantic hue on a `Could` is how budgets erode.
- **No hourly strip, no humidity/pressure/wind/"feels like".** §5 of the mockup rendered these and
  they are a weather tab inside a card — the move ADR-0004 exists to refuse. 18 text runs proposed
  against 24 rejected.
- **No weather-driven suggestions** ("move the walk to Tuesday"). A different feature with a
  different ADR.
- **No location permission, ever.** Everything derives from the itinerary (ADR-0107 §4).

## Consequences

- **The app rolls hourly into a day itself**, because MET publishes no daily aggregate. This is
  partly a gain: the roll-up picks the day's high, low and dominant condition **in the day's own
  zone**, which ADR-0107 already derives per day, where a provider's `timezone=auto` would hand back
  a zone the app then has to reconcile against its own. It is still code Open-Meteo would have given
  free, and it is the largest single piece of work this decision creates.
- **Precipitation is an amount, not a probability.** W4 survives on amount, and the review already
  argues a forecast claiming _"rain, afternoon"_ is right more often than one claiming `24.3°`. **The
  copy must not imply a probability the source does not publish.**
- **A shorter horizon reaches the placeholder sooner** (§5), which makes that state ordinary rather
  than exotic — it will be seen.
- **The provider stays behind a token-bound interface**, so a future swap (to Open-Meteo paid, or to
  NWS as a US second source) is a file rather than a rewrite. Nothing here is a one-way door.
- **`מבט מהיר` gets its first tenant**, ordered forecast · daylight · rate, most-volatile-first.
  `.glance-cards` already owns the rhythm, so the card needs no spacing CSS.

## Alternatives considered

- **Open-Meteo on the free tier.** Better data on every axis that is not licensing: ~15 days, daily
  aggregates, precipitation probability. Rejected on terms — non-commercial only, which fails the
  owner's stated constraint the moment it matters. It remains the first thing to price if the answer
  to paying ever changes, since the integration shape is identical.
- **Keying on `placeId`.** Rejected in §3: trip-scoped, so it double-fetches.
- **ADR-0180 §4's freshness rule as written.** Rejected in §4: correct for a published rate, actively
  harmful for a forecast.
- **A controller with a manual refresh**, mirroring FX. Rejected in §6: FX has one because a human
  taps it; nobody taps a forecast.
- **A drawn condition mark**, mirroring `SunGlyph`. Rejected in §7 — no illustration to draw from,
  and the provenance test puts it with the per-entity badges. Reopened automatically if the card ever
  gains a sky.
- **The keyed providers** (OpenWeatherMap, WeatherAPI, Tomorrow.io, Pirate Weather). Not measured —
  each needs a signup and a secret before returning a byte, and the enrichment pipe's existing
  sources are all keyless. Recorded as a stated gap rather than a comparison.

## Build log (2026-09-03)

Three findings, each recorded because a future reader could not recover it from the code alone.

**1. The hourly half of the series overlaps itself, and §2's measurement did not say so.** The
brief established that the series runs hourly for ~2.4 days and then 6-hourly, and that the roll-up
must read `next_6_hours` rather than `instant`. What it did not say is that in the hourly half
`next_6_hours` sits on **every** row — twenty-four overlapping six-hour windows a day. Summing
those quadruples a day's precipitation, and it does so **only inside the hourly window**, which
makes it the same class of trap as the `instant` roll-up: correct-looking in any test written
against tomorrow, wrong from day three on.

So the roll-up takes a **greedy disjoint cover** — take a block, skip to the first one starting at
or after its end, repeat. The obvious alternative, filtering to rows at 00/06/12/18 UTC, is worse
in a way worth writing down: the measured series starts at `07:00Z`, so an aligned filter silently
drops the first five hours of **today**, which is the day the card exists for. The greedy cover
pays for that with one bounded artifact — where the 6-hourly grid is out of phase with the cover,
up to five hours at one night boundary go uncounted, once per forecast. Losing five hours of a
day-3 night is the right side of that trade.

**2. The card is not a `<button>`, and the mockup drew one.** `.wx-widget` was drawn with
`cursor: pointer` because it was drawn as `RateCard`'s sibling — and `RateCard` is a button
because it **opens the converter**. v1 has nothing to open: §9 refuses the hourly strip, the dense
row and the alert, and there is no forecast sheet. This repo's own rule then settles it, in three
places that already agree: `ErrorState`'s retry renders only when the caller can recover,
`SyncBadge` is silent when synced, and ADR-0180 §4 refuses a standing refresh button because "a
control that reliably does nothing is the thing ADR-0133 §7 named." So the card is a plain region.
It costs nothing to reverse — and it buys one thing back immediately: §8's attribution link is
reachable rather than nested inside a button, which is invalid markup and was the constraint that
pushed FX's mark out of its card in the first place.

**3. The head prints the day's HIGH, because there is no "now" to print.** The mockup's head
carries three numbers — `26°` now, `29°/21°` the range — and the first of them does not exist in
this store. The `instant` block would supply it, but the store is keyed `(cell, date)` and §4's
shelf life is six hours, so a "now" temperature here is a number up to six hours old wearing the
one label it must not wear. Printing the high in the big run and the low beside it is two facts we
actually hold, and it avoids the duplication ADR-0214 and ADR-0215 each removed — the high at 26px
and again at 12px, 100px apart, is exactly that shape. **W4 rides the condition's own run**
(`גשום · ⁦3.2⁩ מ״מ`) rather than taking a line, and the amount-not-a-chance rule is asserted in the
component's spec.

**Two defects the tests found before the surface did.** `forecastCell` keyed `-0.02` as `"-0.0"`,
which is a second cell on the equator and the prime meridian — the rounding has to be normalised
_after_ `toFixed`, not before. And `geo-tz` **throws** on an out-of-range latitude rather than
answering empty, which mattered because generalising the two inline `geo-tz` copies into
`common/geo-zone.ts` (root rule 8 — the forecast roll-up would have been the third) put that
throw in front of a write path reading a nullable `Float` somebody else wrote.
