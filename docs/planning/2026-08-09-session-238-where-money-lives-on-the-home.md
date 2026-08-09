# Session 238 — where money lives on the Home

**2026-08-09 · design session, nothing built.**
Deliverable: [`mockups/currency-becomes-a-feature-v1.html`](../../mockups/currency-becomes-a-feature-v1.html)
(+ its catalog entry, + the backlog line rewritten) → **ADR pending the owner's answers to the
four forks at the foot of this note.** The ADR is deliberately not written yet: this repo's
convention is to record a decision, not to invent one, and three of the four forks are the
owner's call rather than a detail a build can settle.

## The brief

`docs/backlog.md`, _"Currency becomes a feature"_ — three slices in dependency order, of which
(2) and (3) were explicitly **"gated on a design session … the Home's card budget is the
contested part, not the arithmetic."**

1. Derive `Trip.currency` from the destination (a static country→ISO-4217 table, mirroring
   ADR-0113's timezone default).
2. A rate card on the Trip-mode Home — an ADR-0004 pipe, short TTL, a visible "as of", a
   graceful-absence state, and a **home** currency that nothing stores today.
3. A small converter sheet the card leads to, which is the first surface that makes
   `lib/money.ts`'s minor-unit trap load-bearing.

## The reversal, and it is the useful part of the session

**The file's first draft proposed a fifth quick-access tile, and the measurements killed it.**
The reasoning was clean and wrong: a tile costs no new component, `.qa .sub` is already a muted
mono one-liner shaped for a rate, `Icon.tsx` already ships a `currency` wallet glyph, and
ADR-0050 already makes a derived tile with no source vanish — so absence would be free.

Then the tile was drawn at 360px:

|                                               |                              |
| --------------------------------------------- | ---------------------------- |
| the quick row today (4 tiles)                 | 115px                        |
| five tiles in one row                         | 115px, and the value clipped |
| five tiles wrapping to 3+2                    | **197px · +82px**            |
| the standalone card **+ its section heading** | **76px**                     |

The tile costs more than the card it was avoiding. And at five-in-a-row the rate reads
`¥100=…` — 96px of content in a 44px box — so the single row was never available anyway.

**What survives the numbers is stronger than the numbers.** ADR-0045 is the ADR that _removed_
the FX card from the Home, and its §4 already wrote the answer down:

> **Weather / FX return as themselves, later.** When those integration pipes land they come back
> as their own glance cards (exactly ADR-0004's "an integration feeds an existing surface") — not
> as pre-wired empty shells now.

`מבט מהיר` was not deleted for being a section. It was deleted for being **fixtures**. This work
is its return, and weather is the second tenant of the same row. A tile in `גישה מהירה` would
have been the wrong home for a different reason: that row is shortcuts into **trip data we
hold**, and a published reference rate is a fact about the world. This app already has a word
for that and it is a glance card.

The rejected draft is drawn in the file as option ג׳ rather than deleted.

## The objection that closes on measurement rather than argument

> "A card down there pushes the day-at-a-glance below the fold."

At 360×640 the glance card's bottom is **already 228px below the fold**, before any proposal.
The rate card sits _after_ it, so option ד׳ moves it by **0px** — the table reports 228px for
today and 228px for the proposal. (The tile options, which sit _above_ the glance, push it to
310px.) The `.body` at 360×640 is 453px once the real header (116px) and tab bar (71px) are
paid for; the file draws both, so those are measured, not assumed.

## Three shipped defects the render found, none of them about currency

1. **`.quick`'s columns are not equal, and the row can leave the screen.**
   `grid-template-columns: repeat(N, 1fr)` is `minmax(auto, 1fr)`, and a grid item's `min-width`
   is `auto` — its min-content width. `.qa` sets no `min-width: 0`. At five tiles the row
   measures **407px of content inside a 326px box**: columns come out `56 · 68 · 81 · 56 · 110`
   and 81px is pushed off the inline-start edge. Four tiles happen to fit, so it is latent, not
   live — but the comment above `.quick` states an equal-column assumption ("a derived tile with
   no source just reflows the row") that the CSS does not hold. One line (`min-width: 0`) fixes
   it; the mockup has a control to see the break and the repair.
2. **`.set-tz-trigger` is 40px tall**, under ADR-0017's 44px floor. §5 gives it a second call
   site, so the floor gets fixed as part of giving it one.
3. **…and its name says `tz`** for what is now a two-instance shape. Rename, don't copy — a
   third `.set-*-trigger` is how that class of duplicate gets born.

## What reading the code changed

- **The picker already exists, one concept over.** `Intl.supportedValuesOf('currency')` is
  `ZonePicker`'s own move with a different argument — **159 codes** in Chromium, with Hebrew
  display names and symbols from `Intl.NumberFormat`, against `CURRENCY_OPTIONS`'s hardcoded 5.
  No dataset to ship, none to age, exactly as ADR-0113 §6 argued for zones. §4 is drawn with the
  shipped `.zp-*` geometry unaltered.
- **The reuse costs exactly one variant, and only a render could find it.** The row's two text
  columns swap roles between instances: a zone is a short name + a long id, a currency is a long
  name + a 3-char code. Rendered with the shipped rule,
  `דירהם של איחוד הנסיכויות הערביות` wrapped to two lines and then `AED` was the thing
  ellipsised — to `A…`. So it is a `[data-kind='currency']` modifier on the sheet, and the zone
  instance keeps its behaviour byte for byte. Second one: `Intl` returns the **code** as a
  currency's narrow symbol when there is no distinct one, so `ALL ALL` / `ANG ANG` rendered the
  same three letters twice on one row (and the comparison that suppresses it has to strip the
  bidi marks `Intl` wraps the symbol in, or it never matches in an RTL locale).
- **The minor-unit trap is not binary.** `lib/money.ts`'s `ponytail:` comment says "correct for
  JPY … ILS/USD will need /100", which reads as two cases. §6 reads the exponent from
  `Intl.NumberFormat(...).resolvedOptions()` live in the page: **0** for JPY and ISK, **2** for
  ILS and USD, **3** for KWD and BHD. The exponent is not a table we maintain — ask the runtime,
  same move as `supportedValuesOf`.
- **"As of" means the source's date, not ours.** ADR-0166 §6.4's pattern is `fetchedAt` + a
  per-field TTL, because opening hours change whenever they change. An ECB reference rate is
  _published_ once per TARGET day at ~16:00 CET, so a rate fetched five minutes ago can be three
  days old over a weekend and still be **the current rate**. What is kept from ADR-0166 is the
  part that matters: serve the stale value, never block, never show a spinner where a fact used
  to be, and schedule the refresh on a request that was already happening (§14's two triggers, no
  scheduler).
- **A rate is not an amount.** ILS carries 2 fraction digits and the rate `₪0.0243` needs 4, so
  `formatMoney` is the wrong function for the rate line — two functions, not one.
- **And the rate's base is a design decision, not formatting.** `¥1 = ₪0.0243` is a number nobody
  can hold; `¥100 = ₪2.43` is the same fact at the smallest power of ten that puts the result
  above 1, which is how a person on the ground already thinks. It is also 7px shorter, which at
  360px is the difference between a line that fits and one that is ellipsised.
- **Nothing new is spent from the colour budget.** The rate is a numeric run and the app's mono
  treatment already says "technical value"; the card is neutral chrome end to end. Note what that
  avoids: `.qa .code` paints `--amber-deep`, but it is the confirmation code's (commitment,
  ADR-0011), and lending it to a rate would take it out of its one meaning. The `▲/▼` delta —
  the only thing here that _did_ have a budgeted hue, since design-language names "FX ▲/▼" under
  `--ok`/`--miss` — is dropped: it needs stored history, it serves a trader rather than a
  traveller, and dropping it is what makes the no-new-hue answer free rather than austere.
- **`fixtures.ts`'s `GLANCE.fx` is not evidence.** `¥1=₪0.024` + `changePct` predates ADR-0045
  and is a mock of exactly this card; ADR-0045 pulled the fixture glance cards for being
  fixtures. Nothing here is anchored to it, and the `1`-base it used is the thing §1 measured
  and replaced.
- **`GlanceCard` is taken.** ADR-0045 repurposed that component to mean the day-at-a-glance time
  rail. The new component is `RateCard` (`ui/domain/RateCard.tsx` + `rate-card.css`); the
  concept is a glance card, the name is not available.

## Slice 1, which needed no new frame — only the behaviour decided

`Trip.currency` is stored, editable, and read by nothing. `Trip.destinationCountryCode` already
exists (ADR-0113). The table is `COUNTRY_CURRENCY` in `packages/shared/src/destinations.ts`,
same shape and same doc-comment contract as `MULTI_ZONE_COUNTRIES` beside it: **a miss degrades,
never a wrong answer.**

**Currency mirrors the timezone default exactly, including its create-vs-edit asymmetry.**

- **Creation** — a pick that resolves to a country in the table sets `currency`; a "use as typed"
  pick leaves it empty (there is no prior value to keep).
- **Settings** — a resolved pick sets it **in the form, before save, where it is visible and
  reversible**, which is precisely what `handleDestination` already does for `timezone`. A "use
  as typed" pick, or a country the table doesn't carry, **keeps the trip's existing currency** —
  the same deliberate divergence ADR-0113's amendment records for the zone ("an established trip
  already has a meaningful zone the editor shouldn't silently discard").
- The case the zone doesn't have is a **known country missing from a curated table**, and it
  folds into the rule above: keep what is there, never clear.

**Why overwriting a saved currency is safe here, and this only became true with slice 2.** The
plausible deliberate non-default is "I set ₪ on a Japan trip because I think in shekels" — and
that person now has a field of their own, the **home** currency. So the trip currency goes back
to meaning the destination's, and the re-pick is not taking anything away.

The settings field stops being a 5-option `<select>` and becomes the same trigger the zone
already uses, opening the currency picker. **The screen's own copy has to change with it**:
`t.settings.derivedHint` currently promises _"אזור-זמן ומטבע נערכים ידנית כרגע · בעתיד ייגזרו
אוטומטית מהיעד"_, which becomes a lie the day this ships.

## Slice 2's hidden schema question

The pair is trip currency ↔ the member's **home** currency, and `User` has no preference field of
any kind today. The recommendation is **to add no column in this version**:

- the default is derived from the device region
  (`new Intl.Locale(navigator.language).region` → `IL`) through **the same** `COUNTRY_CURRENCY`
  table slice 1 adds, so the card works on first open with no settings visit;
- the override is stored per device beside `waypoint:theme`, and lives in the converter sheet
  (tap the home currency → the picker), so the card carries no control;
- it is reversible upward — a `User.homeCurrency` column can land later and be seeded from the
  local value.

The cost is honest and small: someone with a phone and a tablet sets it twice. The precedent is
ADR-0113's rejection of a stored trip origin — "its only real value is marginal against the model
cost". This is fork 3 below.

## Slice 3, and where the minor-unit decision actually lands

The converter is `Modal variant="sheet"` and nothing else (every overlay is `Modal`;
a hand-rolled panel is lint-blocked). Two sides, one active, a swap on the seam, and the rate +
"as of" + attribution on one line because they are one fact. The currency on each side is a
value that opens a picker, so it wears `ValueToken`'s hairline chip rather than a box of its own
(ADR-0177). Measured: amount field 44px, currency chip 44px, swap 34px visible with a 44px
`::after` target, whole sheet 278px against a 453px body — it does not fill the screen.

The design-level statement the build inherits:

- **storage is minor-unit integers** (`dailyBudgetMinor` already encoded that convention before
  it was dropped);
- **`formatMoney(minor, currency)` divides by that currency's own exponent**, read from `Intl` —
  `maximumFractionDigits: 0` is deleted, not parameterised;
- **the converter's input is a major-unit decimal** — what a person types — parsed to minor units
  at the boundary, and the two units never meet.

The file draws JPY↔ILS (0 against 2) and ILS↔KWD (2 against **3**) as switchable frames, so no
reader can come away thinking the world is `/1` or `/100`.

## The forks for the owner

1. **§1 — is it the card (ד׳) or the tile (ג׳)?** The recommendation is ד׳: `מבט מהיר` restored,
   `RateCard` as its first real tenant, the section absent when it has no cards, weather joining
   later. It is cheaper by measurement and it is what ADR-0045 §4 said would happen. The thing
   worth saying no to it for, if anything, is the third section heading on a screen whose
   grammar is "one loud element, two quiet sections".
2. **§4 — extract a shared picker, or write a sibling?** The recommendation is a **small
   extraction**: the sheet + search + suggested-group + empty-state machinery is ~40 lines and
   entirely label-agnostic, and `ZonePicker` keeps its three exported helpers. Root rule 8
   requires asking before taking on a refactor of a shipped, tested primitive rather than
   quietly duplicating it — so this is the ask.
3. **Where does the home currency live?** Recommendation above: derived + device-local, no
   `User` or `Membership` column in v1. The alternative is a `User.homeCurrency` column now,
   which syncs across devices and costs a migration for a display preference.
4. **The source, and whether it may be called at all.** ECB daily reference rates (free, keyless,
   attribution "שער יציג · ECB"), fetched server-side, stored globally like `PlaceEnrichment`
   (§1's "the world's facts go global"), triggered off the snapshot read. This is the second
   thing in the app that talks to a third party on its own initiative, so it should ship behind
   the same kind of kill switch ADR-0166 §14 gave enrichment.

## Owed next, once those are answered

- The ADR, with ADR-0045 §4 amended **in place** (its promise is being kept, not superseded) and
  ADR-0014's second amendment cross-linked as the origin story.
- `design-language.md`'s component lexicon: `RateCard` added, and the `GlanceCard` entry noting
  the name collision explicitly so the next card does not reach for it.
- `feature-catalog.md`: the _"Currency rate display"_ row and the FX half of
  _"Glance cards (weather / FX)"_ move from backlogged to designed.
- Three device-pass questions this file cannot settle (ADR-0017): whether the neutral card reads
  as informative or as inert next to the amber glance above it; whether `נכון ל־6.8` on a Sunday
  reads as _current_ or as _stale_ (the design says they are the same rate and treats them
  identically — that is the claim to test on a phone); and whether the swap's 34px visible /
  44px target pair is comfortable one-handed.
