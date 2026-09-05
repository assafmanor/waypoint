# 0219 — A day is a place you can see: the day's head is a frame with the day's shot, and the day's facts live in it

**Status:** Accepted 2026-09-05 (owner: _"figure everything out, then write up ADRs and a detailed phased plan"_). **Phases 1–4 built 2026-09-05**; phase 5 pending. Build plan: [`planning/2026-09-05-a-day-is-a-place-you-can-see-build-plan.md`](../planning/2026-09-05-a-day-is-a-place-you-can-see-build-plan.md). Mockup: [`mockups/a-day-is-a-place-you-can-see-v1.html`](../../mockups/a-day-is-a-place-you-can-see-v1.html). Brief: [`planning/2026-09-05-a-day-is-a-place-you-can-see.md`](../planning/2026-09-05-a-day-is-a-place-you-can-see.md).

## Context

Owner, with a screenshot of the public reader's day cards: _"I want to enhance my day view and plan day screens so that they look more beautiful, more professional and more stylish … the live sharing screen has images (from the place enrichment) … Try to think what fits both plan day and day view, and what fits only one."_ And, on the strip above the day's list: _"the ambient stuff (car rentals, hotel stays etc.) … I don't really like how ambient events look anyway."_

Four facts from the code frame every decision below:

1. **The day rows already have a photo slot and nobody fills it.** [ADR-0167](0167-the-badge-is-the-thumbnails-frame.md) §1 made the badge the thumbnail's frame; `PlaceBadge` takes `photoUrl`; `badgePhoto()` applies "a picked icon beats a fetched photo"; the enrichments ride the snapshot and the Dexie cache, so they are there offline. `EventCard`, the builder row, `TransitionRow` and `StayRow` render the badge **without the prop**. `Map.tsx` is the one host that passes it.
2. **The design the owner is pointing at is one-off CSS.** `.sh-shot` and `.sh-day-head` live in `screens/shared-itinerary.css` alone. The app's own day head is `.sec-title`: 12px muted text reading `יום 3 · ראשון · איסלנד`.
3. **The ambient strip is three kinds of thing in one teal box.** `.day-ambient` stacks the day's distance total (a plain line), Plan's amber fit verdict (a card), a teal card per span that no row names today (in practice a car hire's middle day: `Hertz · יום 3 מתוך 6`), and a teal card per **untimed hard event** with a settle pair (`UnplacedCommitment`, [ADR-0171](0171-a-time-can-be-a-floor-or-a-ceiling.md) §10a-i). Teal was justified as "a place, not a time"; a hire's day count is neither, and rule 4 says teal is location only.
4. **One credit line has two shipped treatments and two visual orders.** ADR-0167 §4 renders it _under_ the image (`PlaceKnowledge`); [ADR-0213](0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md) §5 renders it _on_ the image under a scrim (the reader). `placeCredit()` joins two isolated runs in an RTL paragraph (photographer at the start edge); the reader composes one server-side string that displays LTR.

## Decision

### §1 · The badge takes the photo on both day surfaces — two hosts, no new slot

`EventCard` (both variants, including the settle variant) and Plan's `BuilderRow` pass `photoUrl` to `PlaceBadge`, resolved by `badgePhoto(place, enrichments[placeId])` and served through `apiAssetUrl`. **Measured at 0px** (card ⁦71px⁩ → ⁦71px⁩, builder row ⁦69px⁩ → ⁦69px⁩, a 495px list unchanged).

- **The event's own place**, never the booking's endpoints: the row's badge has always been the event's place (`eventShowOnMap` frames it), and the photo is the same place's.
- **A picked icon beats a fetched photo, at both levels.** ADR-0167 §2 tests `place.icon`; here the row's glyph is `chosenIcon(event.icon)`, and an icon a human picked _on the event_ is the trip's opinion exactly as one picked on the place. So: photo only when neither the event nor the place carries a picked icon.
- **No category ring.** The day rows' badges were always `--paper` and never carried a hue, so there is nothing to preserve; only `PlaceBadge`'s white hairline (`.wp-placebadge-ring` with `--badge-ring` unset) holds the crop against a bright sky. Five hues on a list whose only accent is amber-for-time would spend rule 4's budget for no information the glyph did not already carry.
- **Not `TransitionRow`, not `StayRow`, not `MaybeCard`.** [ADR-0210](0210-a-day-is-points-lines-and-envelopes.md) §1 made the point's badge a 32px circle-dot and §4 took the stay's tile away; a photo in a 32px circle is a smear and a stay has no box. The shelf tile's glyph is inline content with no box at all (drawn and refused in the mockup's §5).
- **A failed image degrades to the glyph** — `useFailableImage` inside `PlaceBadge` already does this.

This amends ADR-0167 §1 in place (its §19) and needs nothing else.

### §2 · The day's head is a frame, and it is the reader's frame

`ui/domain/DayHead` replaces `.sec-title`'s heading on both day surfaces **and** the reader's day-card head. Its CSS is `.sh-day-head` / `.sh-day-date` / `.sh-day-copy` / `.sh-shot` **moved** out of `shared-itinerary.css` into `day-head.css` under `wp-dayhead-*` names — the reader consumes the component, so its rules leave its sheet. Root rule 8: the reader's head is the one-off that nearly does the job, so it is generalised rather than twinned. The mockup draws the app's head with the reader's classes verbatim, and the geometry it measures is therefore the reader's own.

**Three bands in one card**, inside the `.day-page` where `.sec-title` was: the shot (§3, when there is one) · the grid `64px minmax(0, 1fr) auto` at `min-height: 64px` holding the date tile and the name (the reader's 76 was sized for a name plus two lines; the facts now live below) · the footer band with the facts and the action. `--card`, 16px radius, the reader's hairlines.

- **The date column says the day of month and the weekday** (`13` / `ראשון`), as the reader's does. The trip ordinal (`יום 3`) is the header anchor's (`יום 3/12`) and is not repeated; the destination is the header's trip name and is not repeated either. **Today** takes the amber ground and the word `עכשיו` in that column, in **both modes** — a day is a span of time and the selected today is already amber in the day strip; Plan's ban is on the _pulse_, not on marking today.
- **The title is the day's name, from the same derivation the reader uses** — `fallbackDayTitle` over `DayFacts`, moved to `packages/shared` (§6). Flights first, then the region the stops share, then what they are, then the furthest stop or the route. On `NONE` (no places) the title is `trip.destination` — what the old heading carried, and the one word an empty day still has.
- **Under the grid, a footer band carries the day's facts and the day's action.** The facts are at most two lines, full card width, allowed to wrap, never ellipsised: the day's distance total (`DayTravelTotal`, lifted from the strip — the Home glance keeps its own copy), then in Plan only either the fit verdict when the day does not fit (in `--amber-deep` with the `warn` glyph, ADR-0206 §AN's sentence unchanged) or the past-day note (`t.planDay.pastNote`, `archive` glyph) on a read-only day. **Not the stay** — [ADR-0209](0209-a-stay-is-named-once-in-the-day-it-belongs-to.md) names it once, as the bookend rows. **And not a span's middle day** (`Hertz · יום 3 מתוך 6`): the owner asked to lose information if the head was crowded, and this is the information — on day three of six there is nothing to do with the company's name; the hire's edges are rows on their own days and its count sits on the booking in the Index. This amends [ADR-0163](0163-a-hire-is-not-a-journey.md) §3, which kept the company on the strip so it would not vanish from the day. The facts were drawn first as the reader's `.sh-day-copy > span` lines and the render clipped two of them at 360 (Plan's verdict at 247px, the past-day note at 269px, in a 238px column) — the reader's copy column is sized for a name and a stay, not for a day's facts.
- **Two text sizes and one display face.** The numeral keeps `--font-head` (the day's stamp, as in the reader); the name is `--font-body` 15px/700; the facts are `--font-body` `--sh-micro` (12.5px)/400 in `--muted`, and the total's own 11px/600 readout takes the facts' size inside the head. No mono digits, no emoji, no third size — the owner's round-three report was _"several different fonts and sizes, which looks weird"_, and the first draft had five sizes, two faces, mono and an emoji in one card.
- **The day's one action shares that footer band**: the existing `.new-event-btn` (`+ אירוע חדש`), unchanged in look, at the end edge where `.sec-title` has always put it, bottom-aligned beside the facts (`.wp-dayhead-foot`: flex, `space-between`, `align-items: flex-end`, a hairline above). A row of its own cost 39px more and read as a fourth band. **Built: the band is 46px and the button inside it is ⁦79.6×26px⁩** — which is `.new-event-btn`'s shipped size and was its size in `.sec-title` too, so ADR-0017's 44px touch floor is a standing debt of that control rather than anything this change introduced. It is the device pass's call (below), and `e2e/day-head.spec.ts` asserts the BAND's 38px floor rather than turning that question into a red test here. Two placements were drawn and rejected by rendering: an icon-only `+` in the trailing cell (the owner's first question about the render was _"what is it?"_ — an unlabelled control on a head carrying three kinds of text is not self-explanatory; the reader's caret is the universal disclosure mark and has no such problem), and the labelled button in that same cell, which **ellipsised the day's name at 360px** (`…ur crater ← Háifoss`) — a control took the width the head exists to spend on the title. The trailing track stays `auto` for the reader's caret and is 0px in the app. When the day is read-only (Trip's archive, Plan's past day) the footer is absent.
- **The archive banner keeps its control and loses its heading.** Trip's past-day banner read `{heading} · לקריאה בלבד` plus `חזרה להיום`; the head now says the date, so the banner says `לקריאה בלבד` and keeps the button.

### §3 · The day has a shot, and it is the reader's shot

Above the head's grid, inside the same card: `.sh-shot` — a **116px** `object-fit: cover` photograph with a scrim caption carrying the place's name and its credit. One number across the three surfaces (the app's two days and the reader); the mockup's height control exists to _see_ 88 and 140, and a second density is the variant rule 8 warns about.

- **Which photo:** `dayPhoto`'s ranked choice (dwell minutes + a bonus for a booked or hard stop + `log10(1 + userRatingsTotal) × 30` + a nickname/icon bonus) under its gate — **`confidence ≥ 0.9` and a non-empty credit** — moved to `packages/shared` (§6) so the reader and the app picture a day identically. A day whose stops clear no gate has no shot and no placeholder: the frame stands alone, as the reader's does.
- **The cost, stated — and the built numbers are bigger than the mockup's, in two places.** At 360×640 the head with its shot measures **240px**, ⁦38%⁩ of the raw viewport (⁦28%⁩ at 390×844), and the frame without a shot **124px** = the grid's **76px** floor + the footer band's **46px** + 2px of border. The mockup's 194/78 were right about the shot (116px, unchanged) and wrong about the other two bands.

  **The footer band is 46px, not the ~12 the drawing implied**, because it carries `.new-event-btn` at its shipped size (⁦26px⁩) inside 9+10px of padding and its hairline. The mockup drew the band without measuring the control in it.

  **And the grid's floor is 76, not 64** (owner, on the render: _"the day's date should have a better margin from the top"_). The mockup's REASONING for 64 was right — the app's row holds the name alone, since its facts live in the footer band, so its floor is the date tile's own — and it counted a two-line tile. Today's tile has three lines (⁦22px⁩ numeral + ⁦14px⁩ weekday + ⁦14px⁩ `עכשיו` = ⁦58px⁩ of stack), so 64 left **3px** of air above and below on the one day anybody looks at, against ⁦12px⁩ on every other day. 76 is the tile's own floor and it is the reader's number, so the app's override is deleted rather than retuned: all three surfaces stamp a date the same way.

  Accepted at the larger number for the same reason it was accepted at the smaller one — a day is a place before it is a list — and the trade is now stated honestly: the first row of the day sits ⁦46px⁩ nearer the fold than the drawing implied. Measured in a real Chromium at 360, both themes, both modes, with the parts broken out (`e2e/day-head.spec.ts`), so the next drift arrives as a number rather than as a red bound nobody can attribute.

- **Tapping the shot opens the full picture** in `MediaViewer`, the way `PlaceKnowledge`'s hero does on the Map (ADR-0167 §10), with the credit as its caption. The reader's shot stays inert — it has no app to open into.
- **Eager, not lazy**: the shot is the first thing on the page.
- **The photograph bleeds; the head does not** (amended 2026-09-05, off the build's own render — owner: _"when there's a picture it looks very good"_, of a head drawn flush to the day strip, then _"how do you want to gain the best of both worlds?"_). **A day with a shot loses the gap above it and its top corners**, so the picture hangs straight off the day strip; a day without one keeps the inset card exactly as §2 describes it. One rule about the PICTURE rather than two treatments of the head: a photograph is edge content and a panel of text is inset UI.

  **The majority case is what makes it conditional.** Most days have no shot — every day before enrichment lands and every city day after — and drawn flush they are a white panel welded to the strip with square top corners, round bottom ones and nothing to justify either. Drawn and refused.

  **The side gutters stay, and that is the half of "full bleed" this deliberately does not take.** Drawn at 360 and measured: bleeding to the viewport edges buys ⁦34px⁩ of picture width (326 → 360) and costs two things that hold whether or not there is a picture — every row under the head sits at the body's own inline padding, so a 360-wide head is the one object on the day that does not line up; and today's amber tile, the only hue above the list, runs off the screen instead of sitting inside a frame. Against ⁦34px⁩, the shot's own height is the lever this section already owns.

  Three conditions in the selector and each is load-bearing: `.is-card` (the reader's head is inside `.sh-day` and bleeds nothing), `:has(.wp-dayhead-shot)` (there is a picture), and **`:first-child`** — Trip's ripple bar and its archive banner both render above the head, and a head pulled up under either would sit on top of it. The negative margin is `.body`'s own inline padding, named there (`--body-pad`) so the two cannot drift.

  **The cost, stated:** swiping from a picture day to a city day now changes the head's top edge as well as its height (240 vs 124), so two things move on one seam. Owned by the device pass — it is a motion question and a still cannot answer it.

### §4 · The ambient strip is retired; a commitment without a clock is a row

`.day-ambient`, `.ambient`, `.ambient.unplaced`, `.as-open`, `.day-fit` and their rules are **deleted**. What they carried goes to two places:

- **Facts true of the whole day → the head's footer band** (§2): the total, Plan's verdict, Plan's past-day note. **A span's middle day → nowhere on the day** (§2's loss, ADR-0163 §3 amended).
- **An untimed hard event → a row at the top of `.day-list`**, on `.transition-row`'s grammar (ADR-0210 §1: the amber box and the 32px circle badge are the committed point's, and an untimed commitment is a commitment without a moment). `UnplacedCommitment` keeps its name and its props and is re-rendered on that tree: `tr-face` (opens the booking), `tr-badge`, `tr-main` with `tr-title` and a `tr-time` whose `tr-clock` reads `ללא שעה` with no bound box, and the compact `SettleControl` in Trip only (ADR-0171 §10e). It stays **above the first row** and below the head, so §10a-i's "a claim on your day reads at the top" holds without a strip to hold it.

Teal leaves the day's top entirely. The one hue left there is amber, on today's date column and on Plan's verdict line — both time (rule 4).

### §5 · A passed row's photo recedes with its card — Trip only

`.wp-event.passed .wp-placebadge-photo img { filter: grayscale(1) }`, beside `.wp-event.passed` in `event-card.css`. The card already drops to 0.66 opacity; a full-colour thumbnail inside it is the one thing on the row still saying "upcoming". The settle variant is `passed` and greys too. **`done` keeps its colour** — a record is not a fade. Plan has no phases ([ADR-0043](0043-day-view-now-line-phases-and-archive-chrome.md) §5), so nothing there changes.

### §6 · The read gets the place's knowledge, and the credit rule gets its second half

`EventDetail` renders `PlaceKnowledge` at `KNOWLEDGE_DENSITY.DECIDING` (the picture, three clamped lines, `עוד בגוגל`, nothing to expand into) **directly under `.bk-head`**, before the hard note and the facts. A place with an image but no summary shows the picture and the link; with neither, nothing renders — `PlaceKnowledge` already answers both. `EventDetail` owns the `MediaViewer` for the full picture, exactly as `Map.tsx` does (`fullPicture` state, `placeCredit` caption). The build cost is one extraction: `.map-hero`, `.map-credit`, `.map-sum*` and `.map-know-more`'s base rules move from `map.css` to `place-knowledge.css`; the `.map-placecard:has(.map-hero)` grid rules stay where they are, since they lay out the Map's card and nothing else.

**The credit line's rule, completed (amends ADR-0167 §4):**

- **On the photograph, under a scrim, when the photograph is a band with nothing under it** — the day head (§3) and the reader's day card. The scrim is black over the picture in both themes, which answers §4's "re-solved for dark mode", and it costs 0px where a line under it costs ~16px on a head already 194px tall.
- **Under the photograph, in the surface's own ink, when prose follows it** — `PlaceKnowledge`, on the Map and in the read. The summary is under it anyway and the line reads as part of the same block.
- **Composed once.** `placeCredit` moves to `packages/shared` and both renderers call it: `attribution · license`, each run isolated, so the photographer leads at the start edge everywhere. The reader's server-side composition is deleted.

### §7 · What moves to `packages/shared`, and why it is one move

`dayPhoto` (ranking + gate), `fallbackDayTitle` + `DayFacts` + the pure helpers that build them (the stops sequence's dedupe, the region/kind majority), and `placeCredit` — all pure, all currently in `backend/src/sharing/` or `frontend/src/lib/`, all now needed by both. `tripShapeOf` and `derivedPlaceLabel` already made this move for the same reason (ADR-0213's fourth pass). Nothing about the reader's output changes; its tests move with the functions.

**Built 2026-09-05, with one correction to the sentence above.** `SharedPhoto.credit` DOES change, and it is §6's point: the projection joined the raw strings and `PlaceKnowledge` isolated each run, so one composition had to lose. The app's wins, and the reader's credit gains the isolate characters (invisible; the line already resolved LTR there, so it looks the same). Day titles and photo URLs are byte-identical, which is what the build plan's acceptance was reaching for. `dayPhoto` and `placeCredit` landed in `packages/shared/src/sharing.ts` beside `tripShapeOf`; the title derivation in a new `day-title.ts`, which also exports the facts builder's two pure parts by name — `buildDayStopSequence` (a leg contributes both its ends) and `dominantValue` (the region/kind majority) — so phase 4 assembles `DayFacts` from trip state without re-deriving either. The projection maps its Prisma rows into the shared shapes rather than casting: `startsAt` is a `Date` there and an ISO string here, and a `Date` reaching `Date.parse` would have scored every stop at zero dwell in silence.

## What rendering it found

- The credit's two visual orders (Context §4). Not visible in either surface alone.
- `.wp-maybecard-ic` is `display: block` and carries `.wp-placebadge`'s ring `box-shadow`, so on a shelf tile whose idea has a place the teal ring spans the tile's width; `place-badge.css` describes that slot as "inline content, ~21×17px". One of the two is wrong — a device look, not this ADR's.

## Alternatives considered

- **An icon-only `+` in the head's trailing cell.** Drawn; the owner asked what it was. Rejected for that reason.
- **The labelled button in the trailing cell.** Drawn; at 360px it ellipsised the day's name and Plan's verdict line. A head's width belongs to its title.
- **Keeping `.sec-title` above the frame** for the button. The same ~34px as the footer, outside the card, and it repeats the date the frame says.
- **The stay as the head's second line** (the reader's second line). ADR-0209 names it once, as bookend rows.
- **A photo behind the whole event card.** A scrim on every card in both themes, and the hard/soft grammar (dashed border, hatch) disappears under it. The reader put the photo _above_ the card for the same reason.
- **A departure board on the day view.** The board is rationed — one per screen, and it is Home's.
- **Category hue on the day rows' badges.** Rule 4's budget; the glyph already says the kind.
- **An indigo day head in Trip mode.** Two boards under one dark header, and a broken mode identity in Plan.
- **A mini-map in the head.** ADR-0004; the badge is already the way to the Map (ADR-0121 §8).
- **Photo tiles on the shelf.** No box to clip into; a new slot is what ADR-0167 §1 refused; ragged on any city day. Drawn to refuse (mockup §5).
- **A different shot height in Plan.** One number, three surfaces.
- **The facts as lines in the reader's copy column.** Drawn; clipped at 360. The column is a name's width.
- **A car hire's middle day as a head line.** Drawn; dropped on the owner's "lose a little information if it's too much" — it is the one fact in the head nobody acts on.
- **Keeping the ambient strip and re-tinting it.** The strip is three kinds of thing; splitting them by what they are (a fact → a line, a commitment → a row) is what makes the top of the day read.

## Consequences

- Both day surfaces lead with a picture when the day has one, and their head says what the reader's says. The three surfaces name and picture a day from one derivation.
- `screens.css` loses `.day-ambient`, `.ambient*`, `.as-open`, `.day-fit*`; `shared-itinerary.css` loses its head and shot rules; `map.css` loses `PlaceKnowledge`'s base rules. Net CSS goes down.
- `UnplacedCommitment` stops being a fourth row grammar and becomes the third host of `.transition-row`.
- Open, and owned by the device pass: whether a real photograph is legible at 40px (ADR-0167 §18); the shot's 116px on a 640px phone.

## Build log

### Phase 4 (2026-09-05) — both day surfaces, and what the build measured

**Two numbers came out bigger than the mockup's and one came out exactly right.** The shot is 116px as drawn; the frame is **124px** where the mockup said 78, and the whole head with a shot **240px** where it said 194 (§3, amended in place above). The difference is two bands the drawing under-counted — the footer's 46px (it never measured the button inside it) and the grid's 76px floor (it counted a two-line date tile, and today's has three). Nothing else moved: the title is not ellipsised on the mockup's own worst case (`Stútur crater ← Háifoss` at ⁦240px⁩ in a ⁦240px⁩ column, both modes, both themes), and the head and the rows share one inset (x=16, w=328 at 360).

**The date tile's air was found by looking, not by measuring** (owner, off the render). Nothing in the suite could have caught it: 3px of padding is a value no assertion had a reason to name, and it only appears on `is-now`, which is one day of twelve. It is the second time in this build that a number the mockup stated confidently was short — both times because the drawing measured a band without the content that goes in it.

**Three things the build settled that the decision left flat.**

- **An untimed commitment's clock keeps its BOUND.** The plan wrote `data-bound="exact"` for the whole row; only `ללא שעה` is boxless, because it is not a clock. A floor takes `not-before` and the open-ended box it would wear one row down (ADR-0171 §10f, amended).
- **`isTransportEvent` moved to `packages/shared`.** The projection wrote the rule as a literal list of four booking types under a comment saying `BOOKING_TYPE_TO_CATEGORY` already maps between the two vocabularies and it should name no third set. The app's `buildDayFacts` needs the same question, so the one-off was generalised rather than copied (root rule 8).
- **The head's type scale is the component's** (`--dayhead-line`/`--dayhead-caption` on `.wp-dayhead`), not `.sh-page`'s `--sh-micro`/`--sh-secondary`. Same numbers; the app's head renders outside the reader's page, where those resolve to nothing.

**One e2e regression, and it was a stale box rather than a broken feature.** Five `shelf-drag` cases went red: they measured the shelf card, then called `boxOf('.day-swipe')`, whose `scrollIntoViewIfNeeded` scrolled the body back (measured `scrollTop` 212 → 120) and moved the card ⁦144px⁩ from the point the touch was aimed at. Correct until the surface grew, which is what a stale box always is. The fix is ordering — the card is measured last, every other measurement still before the touch.

**The device look** (360×640, both themes, both modes, real Chromium): the head reads date · name · facts; today's tile is amber in Plan as well as Trip; a landmark day shows its shot with a legible scrim caption; the archive banner says only `לקריאה בלבד`; an untimed hard booking is an amber row at the top with the settle pair in Trip and none in Plan; no teal remains above the list.
