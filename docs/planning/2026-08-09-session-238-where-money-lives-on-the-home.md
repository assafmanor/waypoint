# Session 238 — where money lives on the Home

**2026-08-09 · design session, nothing built.**
Deliverable: [`mockups/currency-becomes-a-feature-v1.html`](../../mockups/currency-becomes-a-feature-v1.html)
(+ its catalog entry, + the backlog line rewritten) → **[ADR-0180](../decisions/0180-currency-is-derived-and-a-rate-is-a-glance-card.md), Accepted the same day**, once the owner had answered every fork. It was deliberately not written before that: this repo's convention is to record a decision, not to invent one. The answer, in full: _"I accept your recommendations."_ The build follows.

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

## Slice 2's hidden schema question — **answered by the owner, against the recommendation**

The pair is trip currency ↔ the member's **home** currency, and `User` has no preference field of
any kind today. This note originally recommended adding **no column**: derive from the device
region, keep the override device-local beside `waypoint:theme`, on the ADR-0113 precedent that a
stored value's "only real value is marginal against the model cost".

**Owner's call (2026-08-09): it is a user preference, it lives in user settings, and it is
persisted in the database.** That is the better answer and the recommendation was wrong on a
simple point — the same person on a phone and on a tablet is the same person, and a preference
that does not travel with the account is a preference you set twice. Recorded as a reversal
rather than quietly rewritten, because the rejected reasoning is the part a future reader would
otherwise re-propose.

So: **`User.preferredCurrency`**, nullable, edited in `UserSettings`' existing `תצוגה` section
through the same trigger + picker both other call sites now use (mockup §7). The device region
survives only as the **seed** for a user who has never set one — `new Intl.Locale(navigator.language).region`
through the same `COUNTRY_CURRENCY` table slice 1 adds — so the card still works on first open
without a settings visit.

**This does not overrule [ADR-0133](../decisions/0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md) §7 —
it meets the condition §7 itself set.** That section rejected exactly this list ("a theme toggle,
a language picker, **units**, a user-level home timezone…") for one stated reason: _"A switch that
does nothing is worse than a thin page."_ A currency preference **was** that switch, until this
slice gave it two readers. It is the same route the theme toggle already travelled — rejected in
July, back once ADR-0158 §8 made the remap real — and `UserSettings.tsx`'s own comment states the
principle: _"The rejection is amended by its own condition, not overturned."_ Second instance,
same sentence.

**One trap, and §7 draws it.** The new row's neighbour in `תצוגה` is the theme, whose hint reads
_"הבחירה נשמרת במכשיר הזה"_. Currency is the opposite — account, not device — so a row that
inherits its neighbour's hint promises the reverse of the truth. It gets its own.

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

## Owner answers, 2026-08-09 (second pass)

Four of the questions came back, plus one defect caught on a real phone. Recorded here; §7 was
added to the mockup and §3 was fixed.

**The reported defect — the currency chip's contents sat high in the chip.** Two faults stacked,
and only one is the obvious one. `align-items: baseline` on `.cv-cur`: an inline SVG has **no
baseline**, so the caret aligned by its bottom margin edge and landed 4.5px above the code beside
it — and on a flex line **taller than its content** (the chip is floored at 44px for ADR-0017),
`baseline` parks the whole group near the top rather than centring it. Measured **13.0px** off
the chip's own centre; `center` takes it to **0.0px**. A row of a symbol, a code and a caret has
nothing to align baselines _for_.

The instrument matters more than the fix, and it is the same lesson as session 236's: **the
measurement table could not see this.** Every reading was a width or a height, and the chip's
width and height were correct the whole time — the contents inside it were not. The file now
measures **each child's centre against its container's centre**, and prints the `baseline`
counterfactual beside it by forcing the old value and re-reading. An alignment bug is a
relationship, and a table of boxes cannot express one.
_(Worth a look during the build: `zone-picker.css:43` sets `align-items: baseline` on `.zp-row`,
which is fine today because that row is all text — but it is the rule this chip copied.)_

**And a second correction, against the running app.** §7's first drawing showed the display card
alone and _invented its contents_ — a `.lab`/`.val` pair — where the shipped theme control is a
label-only `.id-row` followed by a real `ChoiceGrid`. That is `pitfalls.md`'s "real CSS over an
invented tree" landing on this file, and the fix is not a patch: §7 now draws **the whole
`UserSettings` screen**, header to sign-out, with `avatar.css` and `choice-grid.css` added to the
manifest. Drawing the neighbours is load-bearing rather than decorative — the claim this section
makes is _which hint belongs to which card_, and it cannot be judged with the neighbours cropped
out. It is also what made the first layout's failure obvious on sight: theme and currency in one
card with both hints stacked beneath, promising opposite things (device vs. account) with nothing
to say which was which. One hint per card is the shipped pattern; each now gets its own card
inside the same `תצוגה` section, with no extra section heading.

**Currencies: all of them.** Already true of the picker, which reads
`Intl.supportedValuesOf('currency')` rather than a curated list — nothing to decide, and nothing
to ship or age. What this **does** decide is fork 4, below, because it makes the picker's reach
and the rate source's reach two different numbers.

**The trip's currency is auto-derived** — slice 1, unchanged. One correction of key rather than
of intent: the derivation runs off the destination's **`destinationCountryCode`**, not off the
timezone. A timezone is a poor route to a currency (`Europe/Zurich` and `Europe/Berlin` are
different currencies; `America/New_York` and `America/Chicago` are the same one), and ADR-0113
already stores the country code from the same pick. Same behaviour, better key, and it is what
§5 draws.

## Fork 4 — the rate source, and no, it was not covered

It was named (ECB reference rates) and never decided, and **"all currencies" is what breaks it.**
The ECB publishes a euro reference rate for roughly **30** currencies once per TARGET business
day. The picker offers ~160. That gap is not theoretical for this app:

- It covers **30 of our 152 codes**, and cannot price **17 of the app's own 57 destinations**:
  Vietnam, Georgia, Nepal, Sri Lanka, Cambodia, Taiwan, the UAE, Jordan, Egypt, Morocco, Kenya,
  Tanzania, Argentina, Peru, Chile, Colombia, Costa Rica.

So a decision is needed, and the shape of it is:

- **Primary: a broad-coverage feed.** The candidates that need no key and cover ~160+ ISO-4217
  codes daily are ExchangeRate-API's open-access endpoint (`open.er-api.com`, attribution
  required on the free tier) and the CDN-hosted `@fawazahmed0/exchange-api` dataset (200+,
  including crypto, no key). Volume is a non-issue either way: the server fetches **once a day**
  and every trip reads one cached global table.
- **ECB stays useful as the authoritative rate for the majors**, and the way to hold both without
  building two pipes now is the shape ADR-0166 §5 already established — a **provider registry
  with field-level precedence**. Declare the interface, ship one provider, add the second when
  someone wants the ECB's authority for EUR pairs. Second consumer of an existing pattern, not
  new machinery.
- **A pair the source cannot price is a real state, not an error.** With a broad source it is
  rare rather than impossible (a currency dropped, a crypto code, a newly redenominated one), and
  it degrades exactly like the never-fetched case in §2: no card, and the converter says so.
- **Kill switch**, as ADR-0166 §14 gave enrichment. This is the second thing in the app that
  talks to a third party on its own initiative.

**Everything in that paragraph needs a live check before it is written into an ADR**, and this
session could not do one: the sandbox's egress proxy blocks all three hosts (`api.frankfurter.dev`,
`open.er-api.com`, `ecb.europa.eu` — 403 at the tunnel), so the coverage counts and the free-tier
terms here come from documentation and recall, not from a response. **The build's first task is
to fetch each candidate once and diff its currency list against the `COUNTRY_CURRENCY` table** —
that diff, not a vendor's marketing number, is what "covers our destinations" means.

## The forks, answered

> "I accept your recommendations."

1. **§1 — the card (ד׳).** `מבט מהיר` returns with `RateCard` as its first real tenant, the section
   absent when it has no cards, weather joining later. The tile draft stays drawn as option ג׳.
2. **§4 — the small extraction.** The sheet + search + suggested-group + empty-state machinery
   becomes one shared primitive with `ZonePicker` and `CurrencyPicker` as thin wrappers. Root
   rule 8's condition carries into the build: **if it turns out to be a substantial refactor
   rather than a small extraction, the build stops and asks — it does not duplicate instead.**

## §8 — the refresh, and why it is not a button

> "Do we want to add a small refresh button that fetches the current rates?"

**Yes to the action, no to a standing button** — and the second draft moved it again, on the
owner's steer ("a glyph with no text, and let's rethink the placement").

**Why not a standing control.** A reference rate is published **once per business day**. Pressing
refresh while holding today's rate returns the same number, always. A control that reliably does
nothing is ADR-0133 §7's own objection, and it is worse than inert here: it **implies the number
is live**, contradicting the "as of" sitting beside it.

**Why an action all the same.** Three states where a press changes something: we were offline and
business days have closed since; the last attempt failed; the source was down. So the rule is not
"add a button" but **show it exactly when it can change the number** — which is already written
in this codebase. `ui/feedback/ErrorState.tsx`'s header: _"the retry button only renders when the
caller can actually recover."_ This applies it to a **value** instead of a dead end, and it is the
screen's normal grammar rather than an exception — `SyncBadge` is _"an exception indicator: silent
when synced"_, a derived tile with no source vanishes, the header's swap mark is absent at one trip.

**The placement, after the rethink: there is no separate control at all.** The first drawing put a
`רענון` button _beside_ the date — wrong twice over, a second word on a 17px line and a control
competing with the fact it exists to change. **The date is the button.** "נכון ל־6.8" is the only
thing a refresh changes, so pressing it _is_ the gesture; the glyph says it is pressable and
carries no word of its own, because the text beside it is the fact rather than a label. That is
`ValueToken`'s shape at a read-only value (ADR-0177) — a value in a line, a hairline when
actionable, the 44px floor met by an `::after` overlay.

**And one measured correction inside that.** The hairline was a `border-block-end`, which is _in
layout_ — so the line measured 17px without the control and **18px with it**: the control's
appearance reflowed the fact it sits on. Painted as a `box-shadow` instead: 17px either way, with
the target still 45px. `ValueToken`'s own comment records the same class of mistake one size up
(_"`min-height: 44px` took that row from 58px to 75px"_).

**And the spin runs anticlockwise**, which the owner caught on the moving version. Not a taste
call and now measured: sampling `reset`'s own arc with `getPointAtLength`, the angle about its
centre runs 151° → 85° → 21° → −139° — monotonically decreasing, which is counter-clockwise in
SVG's y-down space — terminating at the head bracket in the top-left, so the arc arrives
right-to-left across the top. **The glyph points anticlockwise**, and spinning it the other way
animates an arrow against its own barb.

It is deliberately not the shared `@keyframes spin` (`screens.css:3719`, `+360deg`), and that is
not a duplicate to collapse: `.spinner` is a rotationally symmetric border-arc **ring** with no
head, so either sign is correct there. **A ring may spin either way; an arrow may not.**

Worth noting what this has in common with the chip's alignment earlier in the session: both are
defects the measurement table was structurally blind to, because **a direction is not a size** any
more than a child's offset inside its parent is. Two of this file's three owner-caught defects were
invisible to a table of widths and heights, which is an argument about what a design file should
measure, not about this file.

**Not on the card**, for a reason that is structural before it is aesthetic: the card is a single
`<button>`, so a control inside it is invalid markup before it is a second 44px target on one row.
Both routes reach the same place anyway — an old date on the card is what you tap, and the sheet is
where that same fact becomes pressable.

## Owed next, once those are answered

- ~~The ADR~~ — **[ADR-0180](../decisions/0180-currency-is-derived-and-a-rate-is-a-glance-card.md), Accepted 2026-08-09.** It amends ADR-0045 §4 **in place** (its promise is being kept, not superseded),
  ADR-0014's second amendment cross-linked as the origin story, and **ADR-0133 §7 amended in
  place too** — `User.preferredCurrency` meets that section's own condition, exactly as the theme
  toggle did, and the amendment belongs beside the rejection rather than in a new ADR.
- ~~`design-language.md`'s lexicon, `feature-catalog.md`'s two rows~~ — **done in the same change.**
- **A live coverage check against every candidate rate source**, diffed against `COUNTRY_CURRENCY`
  — the one thing this session could not do, and the thing fork 4 actually turns on.
- `design-language.md`'s component lexicon: `RateCard` added, and the `GlanceCard` entry noting
  the name collision explicitly so the next card does not reach for it.
- `feature-catalog.md`: the _"Currency rate display"_ row and the FX half of
  _"Glance cards (weather / FX)"_ move from backlogged to designed.
- Three device-pass questions this file cannot settle (ADR-0017): whether the neutral card reads
  as informative or as inert next to the amber glance above it; whether `נכון ל־6.8` on a Sunday
  reads as _current_ or as _stale_ (the design says they are the same rate and treats them
  identically — that is the claim to test on a phone); and whether the swap's 34px visible /
  44px target pair is comfortable one-handed.
