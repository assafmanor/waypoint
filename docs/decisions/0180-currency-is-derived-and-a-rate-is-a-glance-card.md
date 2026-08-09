# 0180 — Currency is **derived**, a rate is a **glance card**, and money is stored in **minor units**

**Status:** Accepted (2026-08-09) — **slice 1 built** the same day (see the build log at the foot for the three places the build decided something the design left open); slices 2 and 3 (the `User` column, the feed, `RateCard`, the converter) are still unbuilt.
**Date:** 2026-08-09
**Session note:** [`planning/2026-08-09-session-238-where-money-lives-on-the-home.md`](../planning/2026-08-09-session-238-where-money-lives-on-the-home.md)
**Mockup:** [`mockups/currency-becomes-a-feature-v1.html`](../../mockups/currency-becomes-a-feature-v1.html) (§1–§8)

**Amends in place:**

- [0045](0045-trip-home-real-data-only.md) §4 — its promise that _"Weather / FX return as themselves, later … as their own glance cards"_ is **kept, not superseded**. This is that return. The `מבט מהיר` section comes back; weather is its second tenant.
- [0133](0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md) §7 — a currency preference joins the user-settings page. The rejection there was conditional (_"a switch that does nothing is worse than a thin page"_) and **the condition has expired**, exactly as it did for the theme toggle. Amended by its own terms, not overturned.
- [0014](0014-budget-display-only-v1.md)'s second amendment — this is the feature `Trip.currency` and `formatMoney` were kept **for**. Its "the minor-unit trap is waiting for a surface" note is discharged by §5 below.

**Relates:** [0004](0004-integrations-are-pipes.md) (a rate feed is a pipe, never a tab) · [0113](0113-trip-destination-place-and-primary-timezone.md) (the derived-default shape this mirrors, and its deferred _"seed `currency` from the country"_) · [0166](0166-place-enrichment-is-a-multi-source-pipe.md) §5/§6.4/§14 (the provider registry, serve-stale, and the no-scheduler trigger) · [0177](0177-a-when-reads-as-a-sentence.md) (`ValueToken`) · [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget, which this spends nothing from)

## Context

`Trip.currency` has been stored, editable in trip settings, and **read by nothing** since ADR-0014's second amendment deliberately kept it. The settings screen's own hint has been promising the feature in the future tense the whole time — _"אזור-זמן ומטבע נערכים ידנית כרגע · בעתיד ייגזרו אוטומטית מהיעד"_ — so the copy was written before the field was.

The backlog's _"Currency becomes a feature"_ named three slices and gated two of them on a design session, for one stated reason: **"the Home's card budget is the contested part, not the arithmetic."** That session is [238](../planning/2026-08-09-session-238-where-money-lives-on-the-home.md).

## Decision

### 1. The trip's currency is derived from the destination's **country code**

A static `COUNTRY_CURRENCY: Record<string, string>` in `packages/shared/src/destinations.ts` — same location, same shape and the **same doc-comment contract** as `MULTI_ZONE_COUNTRIES` beside it: _a country missing from it is a miss that degrades, never a wrong answer._ Keyed off `destinationCountryCode`, which [ADR-0113](0113-trip-destination-place-and-primary-timezone.md) already stores from the same pick. This closes that ADR's deferred _"whether to seed `currency` from the country"_.

**Not from the timezone**, though that is the intuitive route: a zone is lossy in both directions (`Europe/Zurich` and `Europe/Berlin` are different currencies; `America/New_York` and `America/Chicago` are the same one), and the country code is already in hand.

**The behaviour mirrors the timezone default exactly, including its create-vs-edit asymmetry:**

- **Creation** — a pick that resolves to a country in the table sets `currency`; a "use as typed" pick leaves it empty. There is no prior value to protect.
- **Trip settings** — a resolved pick sets it **in the form, before save**, which is what `handleDestination` already does for `timezone`: visible, and reversible with one tap before anything is written. A "use as typed" pick, **or a country the table does not carry**, keeps the trip's existing currency — the same deliberate divergence ADR-0113's amendment records for the zone ("an established trip already has a meaningful zone the editor shouldn't silently discard").

**Why overwriting a saved currency is safe, and it only became safe with §2.** The plausible deliberate non-default is _"I set ₪ on a Japan trip because I think in shekels."_ That person now has a field of their own (§2), so the trip's currency goes back to meaning the destination's and the re-pick takes nothing away.

**The settings field stops being a five-option `<select>`.** `CURRENCY_OPTIONS` is retired for the same reason `TZ_OPTIONS` was (ADR-0113 §6): the schema was never the narrow part, the UI was. It becomes the trigger + picker of §6.

**`t.settings.derivedHint` is rewritten in the same change.** It currently promises this in the future tense, and shipping the derivation without touching it leaves a lie on the screen.

### 2. The member's home currency is `User.preferredCurrency`, in user settings, in the database

Nullable, edited in `UserSettings`' existing `תצוגה` section through the same trigger + picker. **The device region is the seed, not the store**: a user who has never chosen one gets `new Intl.Locale(navigator.language).region` through the **same** `COUNTRY_CURRENCY` table §1 adds, so the card works on first open with no settings visit.

The session's own first recommendation was to store nothing and keep the override device-local. That was wrong on a simple point, recorded here because it is the kind of thing that gets re-proposed: **the same person on a phone and a tablet is the same person**, and a preference that does not travel with the account is a preference you set twice.

**This meets ADR-0133 §7's condition rather than overruling it.** That section rejected exactly this list — _"a theme toggle, a language picker, **units**, a user-level home timezone…"_ — because each was **fiction**: _"A switch that does nothing is worse than a thin page."_ A currency preference **was** that switch until this ADR gave it two readers. It is the same route the theme toggle travelled (rejected July, back once ADR-0158 §8 made the remap real), and `UserSettings.tsx` already carries the sentence: _"The rejection is amended by its own condition, not overturned."_

**It gets its own card, not a second row in the theme's** (mockup §7). One hint per card is the shipped pattern, and the two facts have **opposite** persistence — the theme's hint promises _"הבחירה נשמרת במכשיר הזה"_ and currency is account state. Sharing a card would leave two hints stacked under it with nothing to say which was which.

### 3. `מבט מהיר` returns, and `RateCard` is its first real tenant

Not a fifth quick-access tile, and not a new section: **the section that ADR-0045 removed, restored on the condition ADR-0045 set.** It was deleted for being **fixtures**, and §4 of that ADR wrote this outcome down in advance. Weather is the second tenant of the same row.

The tile alternative was drawn and measured, and lost twice (mockup §1, at 360×640): the wrapped tile row costs **+82px** against the card's **76px including its section heading**, and a fifth tile in one row renders the value as `¥100=…` — 96px of content in a 44px box. The reasoning that survives the numbers is the stronger half: **`גישה מהירה` is shortcuts into trip data we hold, and a published reference rate is a fact about the world.** This app already has a word for that.

- **`RateCard`** (`ui/domain/RateCard.tsx` + `rate-card.css`) — **not** `GlanceCard*`, which ADR-0045 repurposed to mean the day-at-a-glance **time rail**. The concept is a glance card; the name is taken.
- **The whole card is one `<button>`** that opens the converter. No link inside it, no `⋯`.
- **The section is absent when it has no cards.** A heading over nothing is the dead space ADR-0045 removed the row for.
- **It does not move the day rail.** The card sits after it, and the rail's bottom is already 228px below the fold at 360×640 before any of this.

### 4. Freshness: the "as of" is the **source's publication date**, and the refresh is the date itself

**The date is the source's, not ours.** ADR-0166 §6.4 pairs `fetchedAt` with a per-field TTL because opening hours change whenever they change. A reference rate is **published on a schedule**, so a rate fetched five minutes ago can be three days old across a weekend and still be the current rate. Showing `fetchedAt` would be precise and wrong. What is kept from ADR-0166 is the part that matters: **serve the stale value, never block, never put a spinner where a fact used to be**, and schedule the refresh on a request that was already happening (§14's snapshot-read trigger — no scheduler, consistent with ADR-0157 §6).

**Absence is keyed on existence, not age.** A cached rate of any age gets a card; only "never fetched" removes it, and offline-with-a-cache is indistinguishable from stale by design. **There is no error state anywhere on this surface.**

**The manual refresh is the `as of` itself** (mockup §8). Not a button beside it, and not on the card:

- **It appears only when a press could change the number** — a publication has closed since our date, or the last attempt failed. In the common case (we hold today's rate) there is no control, because a control that reliably does nothing is the thing ADR-0133 §7 named, and worse, it implies the number is live and contradicts the date beside it. The rule is already written in this codebase: `ErrorState`'s header says _"the retry button only renders when the caller can actually recover."_ This applies it to a **value** instead of a dead end, and it is the app's normal grammar — `SyncBadge` is _"an exception indicator: silent when synced"_, a derived tile with no source vanishes, the header's swap mark is absent at one trip.
- **The date carries the glyph and no word of its own.** The date is the only thing a refresh changes, so pressing it _is_ the gesture; the glyph (the app's existing `reset` mark, so no second "try again" shape is invented) says it is pressable, and the text beside it is the fact rather than a label.
- **`ValueToken`'s shape** (ADR-0177): a value in a line, a hairline when actionable, and the 44px floor met by an `::after` overlay. The hairline is **painted, not laid out** — as a border it took the line from 17px to 18px, so the control's appearance reflowed the fact it sits on.
- **In flight the mark spins and the date does not move**, per §6.4's "never a spinner where a fact used to be" — and it spins **anticlockwise**, because the glyph points that way. Measured, not eyeballed: sampling `reset`'s arc, the angle about its centre runs 151° → 85° → 21° → −139°, monotonically decreasing (counter-clockwise in SVG's y-down space) into the head bracket at the top-left. This is deliberately **not** the shared `@keyframes spin` (`+360deg`), and that is not a duplicate: `.spinner` is a rotationally symmetric border-arc ring with no head, so either sign is correct there. **A ring may spin either way; an arrow may not** — the rule any future glyph-based spinner inherits.
- **Not on the card**: the card is a single `<button>`, so a nested control is invalid markup before it is a second 44px target. Both routes reach the same place anyway — an old date on the card is tapped, and the sheet is where the same fact becomes pressable.

### 5. Money is stored in **minor units**, and the exponent is asked of the runtime

This discharges the backlog's _"Minor-unit currency"_ trap, whose stated trigger was "the first surface that renders an amount". This is it.

- **Storage is minor-unit integers everywhere** — the convention `dailyBudgetMinor` already encoded before it was dropped.
- **`formatMoney(minor, currency)` divides by that currency's own exponent**, read from `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`. `maximumFractionDigits: 0` is **deleted**, not parameterised, and no table is maintained — the same "ask the runtime" move `Intl.supportedValuesOf` makes in §6.
- **The `ponytail:` comment's framing is wrong and the fix is not `/100`.** Mockup §6 reads the exponent live: **0** for JPY and ISK, **2** for ILS and USD, **3** for KWD and BHD.
- **The converter's input is a major-unit decimal** — what a person types — parsed to minor units at the boundary. The two units never meet.
- **A rate is not an amount** and does not go through `formatMoney`: ILS carries two fraction digits and `₪0.0243` needs four. Significant digits, no currency style.
- **A rate is stated at a base a person can hold** — the smallest power of ten whose converted value clears 1: `¥100 = ₪2.43`, not `¥1 = ₪0.0243`. Not cosmetic: at 360px it is the difference between the line fitting and being ellipsised.

### 6. One picker, extracted — not a second one written

The currency picker is `ZonePicker`'s geometry over `Intl.supportedValuesOf('currency')` (~160 codes, against `CURRENCY_OPTIONS`' five), with Hebrew display names and symbols from `Intl.NumberFormat`. No dataset to ship and none to age — the argument ADR-0113 §6 made for zones, unchanged.

**The sheet + search + suggested-group + empty-state machinery is extracted into one shared primitive**, with `ZonePicker` and `CurrencyPicker` as thin wrappers over it; `ZonePicker` keeps its three exported label helpers. This is a **small extraction, not a refactor** — root rule 8 requires asking before reworking a shipped, tested primitive, and the owner approved it. **If the extraction turns out to be substantial once opened, the build stops and asks rather than duplicating.**

**Two things the reuse costs, both found by rendering and neither visible in the source:**

- The row's text columns **swap roles** between instances. A zone is a short name and a long id; a currency is a long name and a three-character code — so the shipped rule wrapped `דירהם של איחוד הנסיכויות הערביות` to two lines and then ellipsised `AED` to `A…`. A `[data-kind='currency']` modifier flips which column flexes; the zone instance is untouched.
- `Intl` returns the **code** as a narrow symbol when a currency has none, printing `ALL ALL` on one row. The trailing column is empty when the two agree — and the comparison must strip the bidi marks `Intl` wraps the symbol in, or it never matches in an RTL locale.

**Three call sites** for the trigger: trip settings, user settings, and both sides of the converter sheet.

### 7. The feed is a pipe: a broad-coverage source, on the provider-registry shape, behind a switch

**Coverage is the deciding constraint, because §6 offers every currency.** The ECB — which the design's first pass named — publishes roughly **30**. That gap is not theoretical for this app: **Iceland is the second entry in `DESTINATIONS`** and the ECB has not quoted ISK since 2008; Vietnam is the tenth and VND is absent too. The mockup's own pair control offers `ISK↔USD`, a pair the source printed beneath it cannot price.

- **A broad-coverage feed is the primary** (~160 ISO-4217 codes, daily, keyless). Volume is a non-issue: the server fetches **once a day** and every trip reads one cached global table.
- **The store is global**, like `PlaceEnrichment` — §1's "the trip's opinion stays trip-scoped; the world's facts go global" applies unchanged, and so does its consequence that this sits outside `ChangeService` with a stated reason.
- **The provider is declared behind [ADR-0166](0166-place-enrichment-is-a-multi-source-pipe.md) §5's registry shape rather than hardcoded.** One provider ships; the ECB can join later as the authoritative rate for the majors without a second pipe. Second consumer of an existing pattern, not new machinery.
- **A pair the source cannot price degrades exactly like "never fetched"** — no card, and the converter says so. Not an error.
- **A kill switch**, as §14 gave enrichment. This is the second thing in the app that talks to a third party on its own initiative.

**The coverage numbers here are documented, not observed** — the design session's sandbox blocked every candidate host at the egress proxy. **The build's first task is to fetch each candidate once and diff its currency list against `COUNTRY_CURRENCY`.** That diff, not a vendor's number, is what "covers our destinations" means, and it may change which provider ships.

### 8. Nothing is spent from the colour budget

No money hue is proposed. The rate is a numeric run and the app's mono treatment already says "technical value"; the card is neutral chrome end to end, with no new token. Note what this deliberately avoids: `.qa .code` paints `--amber-deep`, but it belongs to the confirmation code (commitment, ADR-0011), and lending it to a rate would take it out of its one meaning.

**The `▲/▼` change indicator is dropped** — the one element here that _did_ have a budgeted hue, since design-language names "FX ▲/▼" under `--ok`/`--miss`. It needs stored history, it serves a trader rather than a traveller, and dropping it is what makes the no-new-hue answer free rather than austere. (`fixtures.ts`'s `GLANCE.fx` carries a `changePct`; it is a pre-ADR-0045 mock, not evidence of a design.)

## Consequences

- **Schema:** `User.preferredCurrency` (nullable) in Prisma + `@waypoint/shared`'s `userSchema` + the patch schema, mirrored by hand in the same commit. A global FX-rate table. No change to `Trip.currency`.
- **`@waypoint/shared`:** `COUNTRY_CURRENCY` beside `MULTI_ZONE_COUNTRIES`, with the same degrade-don't-guess contract. Two readers, which is why it belongs there and not beside either.
- **Backend:** one out-of-band fetcher on the provider-registry shape, a global cached table, the snapshot-read trigger, `ENRICHMENT_DISABLED`'s sibling switch. Outside `ChangeService`, for ADR-0166 §6's stated reason.
- **Frontend:** `RateCard` + the restored `מבט מהיר` section on the Trip Home; the converter sheet (`Modal variant="sheet"`); the extracted picker primitive with two wrappers; the trigger at three call sites; `formatMoney` rewritten; `CURRENCY_OPTIONS` deleted.
- **Copy:** `t.settings.derivedHint` rewritten (it currently promises this in the future tense), plus the new user-settings hint, which must state **account** persistence rather than inherit the theme's device promise.
- **Three shipped defects ship their fixes with this work** (they are on the backlog, and the fifth tile / second call site are what expose them): `.qa` gains `min-width: 0` — `repeat(N,1fr)` is not N equal columns while items floor at min-content, and at five tiles the row pushes 81px off the inline-start edge; `.set-tz-trigger` goes to 44px (ADR-0017's floor, currently 40px); and it is renamed, or replaced by `ValueToken` if that turns out to be the right host.
- **`docs/design/design-language.md`'s component lexicon** gains `RateCard`, with the `GlanceCard` entry noting the collision explicitly so the next card does not reach for it.
- **`docs/product/feature-catalog.md`:** the _"Currency rate display"_ row and the FX half of _"Glance cards (weather / FX)"_ move from backlogged to designed.
- **Implementation is a separate change.** This ADR + the mockup land as the design record.

## Alternatives considered

- **A fifth quick-access tile** (the session's own first proposal). Rejected on measurement and on meaning — see §3. Drawn in mockup §1 as option ג׳ rather than deleted, because the reasoning that made it attractive is the reasoning that will make it attractive again.
- **Five tiles in one row.** Rejected twice over: `repeat(5, 1fr)` is not five equal columns and the row leaves the screen, and even repaired the value is 96px of content in a 44px box.
- **Replacing the `מסמכים` tile.** The only option costing zero height, and therefore the tempting one — but that is the row's single **managed** tile, and its permanent `＋` presence is an explicit ADR-0045/0050 decision (a tile that teaches you to set it up). Paying for a rate with the documents affordance is the wrong trade.
- **A standing refresh button.** Rejected: on a once-a-day published rate it reliably does nothing, which is ADR-0133 §7's own objection, and it implies a liveness the "as of" beside it denies. See §4.
- **A refresh on the card.** Rejected: the card is one `<button>`, so this is invalid markup before it is a second 44px target on one row.
- **A `▲/▼` change indicator.** Rejected — §8.
- **A new "money" hue.** Rejected — §8. The budget (ADR-0028) has no free slot and the surface does not need one.
- **Storing the home currency device-locally** (the session's first recommendation). Rejected by the owner — §2.
- **`Membership.preferredCurrency`** instead of `User`. Rejected: it is a property of the person, not of the trip, and per-trip storage would ask the same question once per trip.
- **The ECB as the only source.** Rejected on coverage — §7. It remains a good _second_ provider for the majors.
- **Deriving the currency from `Trip.timezone`.** Rejected — §1; the zone is lossy in both directions and the country code is already stored.

## Build log — 2026-08-09, slice 1

Built: `COUNTRY_CURRENCY` + `currencyForCountry` (§1), `lib/money.ts` (§5), the
`CodePicker` extraction + `CurrencyPicker` (§6), the derivation at both call
sites, the settings field, the copy, and both CSS defects from the Consequences.
Not built: §2's column, §3's card, §4's freshness, §7's feed.

**Three things the build decided that the design left open, and one it got wrong.**

1. **`ValueToken` is not the right host for the settings trigger**, so §Consequences'
   "renamed, or replaced by `ValueToken` if that turns out to be the right host"
   resolves to the rename. `ValueToken`'s own header defines it as a value **inside
   a line of prose** — a hairline chip wearing the type and column of the text it
   replaces. The settings control is a block-level form row with a label above it
   and a caret at its end. Sharing the name would have meant sharing chip geometry
   that is wrong for a field. It is `.set-pick-trigger`, at 44px.

2. **The create/edit asymmetry is a named rule, not an inline `if`.** The design
   describes it in prose and the obvious build is two `if`s, one per screen — which
   is exactly what the **zone** does today, as two comments with no test tying them
   together. `lib/currency.ts` names both halves (`currencyForNewTrip`,
   `currencyAfterDestinationEdit`) and its test asserts every case against **both**,
   so they cannot converge unnoticed. Cheap, and it is the drift this ADR's §1 is
   most exposed to.

3. **`.zp-*` became `.cp-*`.** The design drew the picker in the shipped zone
   classes, which was right for a drawing and wrong to ship: a shared sheet named
   after its first consumer is the same smell as `.set-tz-trigger`, which this
   change renames one directory over for the same reason. `ZonePicker`'s existing
   test passes **untouched** across the extraction, which is the check that mattered
   — the rename is cosmetic, the extraction is not.

**And the one the design had backwards.** §5 justifies rounding in `toMinor` as
"binary floats lose an agora", which measurement does not support: a bare
`Math.round(major * scale)` is correct for **all 200,000** two-decimal values from
0.00 to 1,999.99. The real defect is narrower and stranger — input carrying _more_
precision than the currency has rounds **arbitrarily**, `1.005 → 100` but
`1.015 → 102`, decided by binary representation rather than by the typed number.
The guard rounds the decimal string first so over-precise input goes half-up
consistently. The code says so; the ADR's sentence is left as written, with this
correction beside it.
