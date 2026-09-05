# A day is a place you can see — the build plan

**Date:** 2026-09-05 · **Decision:** [ADR-0219](../decisions/0219-a-day-is-a-place-you-can-see.md) · **Mockup:** [`mockups/a-day-is-a-place-you-can-see-v1.html`](../../mockups/a-day-is-a-place-you-can-see-v1.html) · **Brief:** [`2026-09-05-a-day-is-a-place-you-can-see.md`](2026-09-05-a-day-is-a-place-you-can-see.md)

Five phases, in order, each its own PR and each reviewable alone. A phase never depends on a later one. Every phase ends green on `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format` (after `pnpm install`), and the phases that touch the day surfaces end with a device look at 360px in both themes. Read root `CLAUDE.md`, `frontend/CLAUDE.md` and `packages/shared/CLAUDE.md` before phase 1; read `backend/CLAUDE.md` before phase 2.

**Numbers in this plan are the mockup's measurements**, read off the rendered DOM. When a built value differs, amend ADR-0219 in place with the built one and say why.

---

## Phase 1 — the badge takes the photo (ADR-0219 §1 · frontend only)

**Goal:** the event card (Trip) and the builder row (Plan) show a place's photograph in the badge, exactly as the Map row does. 0px of layout change.

**Files**

- `frontend/src/ui/domain/EventCard.tsx` — both `PlaceBadge` call sites (`:354` settle variant, `:426` expandable) take `photoUrl`. Add a prop `photoUrl?: string` to `EventCard` (it is presentational; the screen resolves the URL).
- `frontend/src/screens/DayView.tsx` — where `<EventCard …>` is built (`~:1982`), resolve `photoUrl` for the event's own place: `const place = event.placeId ? places.find(…) : undefined; const photo = place && !chosenIcon(event.icon) ? badgePhoto(place, enrichments[place.id]) : undefined; photoUrl = photo && apiAssetUrl(photo.url)`. `enrichments`, `places` are already on the trip state this screen reads.
- `frontend/src/screens/PlanDay.tsx` — the same resolution at `BuilderRow`'s call (`~:2547`), passed through to `PlaceBadge` at `:2858`.
- `frontend/src/lib/place-photo.ts` — extend `badgePhoto`'s contract to take the event's picked icon into account, or add a sibling `rowPhoto(event, place, enrichment)` that applies "picked on the event OR on the place beats the photo" and calls `badgePhoto`. One function, both screens call it; do not inline the rule twice.
- `frontend/src/ui/domain/place-badge.css` — nothing. Confirm `--badge-ring` stays unset on `.wp-event-badge` and `.bld-bd` (no category ring on day rows).

**Not touched:** `TransitionRow`, `StayRow`, `MaybeCard`, `DayJoinRow`.

**Tests**

- `EventCard.test.tsx`: renders `.wp-placebadge-photo img` with the given `photoUrl`; renders the glyph and no `img` when `photoUrl` is absent; `data-photo` present only with a photo.
- `PlanDay.builder-row.test.tsx`: same two assertions on `.bld-bd`.
- `place-photo.test.ts`: the event-level picked icon suppresses the photo; a derived (category) icon does not; no place → undefined.
- e2e is not needed: the geometry claim (row height unchanged) is the mockup's and `PlaceBadge`'s in-flow clip makes it true by construction.

**Docs:** ADR-0167 gains §19 (the day rows join §1, and the event-level picked icon joins §2) — already written as a stub in this PR; fill in the built numbers. Prune the backlog line's item (1).

**Acceptance:** on a trip with enriched landmarks, the day view and plan day show photos in the badges of those rows and glyphs everywhere else; a row with a hand-picked icon keeps its icon; offline (airplane mode after one load) the photos still render from the SW cache.

---

## Phase 2 — the derivations move to `packages/shared` (ADR-0219 §7 · shared + backend, no UI change)

**Goal:** the reader and the app can name a day, pick its photo and compose a credit from one code path. The reader's output does not change; its tests move.

**Move** (pure functions, no I/O):

1. `dayPhoto` and `PHOTO_CONFIDENCE_FLOOR` from `backend/src/sharing/sharing-projection.service.ts:408-469` → `packages/shared/src/sharing.ts` beside `tripShapeOf`. Generalise its inputs to the shared shapes: `events: { placeId?, startsAt?, endsAt?, bookingId?, kind, title }[]`, `places: Map<id, { id, nickname?, icon?, userRatingsTotal? }>`, `enrichments: TripEnrichments`, `label: (place) => string | undefined`. Output `{ url, of, credit }` unchanged (`SharedPhoto`).
2. `fallbackDayTitle`, `fallbackDaySummary`, `DayFacts`, `dedupeConsecutive`, `titleValues` from `backend/src/sharing/itinerary-narrative.fallback.ts` → `packages/shared/src/sharing.ts` (or a new `packages/shared/src/day-title.ts` re-exported from the index). Also move the **facts builder's pure parts** — the region/kind majority over the day's enrichments and the stops-sequence assembly — from their site in the projection (`~:960-1020`) so the frontend can build `DayFacts` from trip state without re-deriving the majority rule. Anything that touches Prisma stays.
3. `placeCredit` from `frontend/src/lib/place-summary.ts:74-79` → `packages/shared` (it needs `autoIsolate`/`ltrIsolate`, which are already in `@waypoint/shared`'s bidi helpers — check `lib/bidi.ts` for which side owns them; if the frontend owns them, move those two too, they are pure). The projection's `credit = [attribution, license].join(NARRATIVE_SEPARATOR)` is deleted and calls `placeCredit`.

**Then** the backend imports the three from `@waypoint/shared`; the frontend's `placeCredit` import path changes; nothing renders differently.

**Tests:** move `sharing-projection.service.spec.ts`'s `dayPhoto` cases and `itinerary-narrative.fallback.spec.ts`'s title cases to `packages/shared/src/*.test.ts`; keep one integration assertion in the projection spec that the chosen photo and title still land on `SharedDay`. Add a test that `placeCredit` produces the same string on both sides (attribution first, isolated).

**Docs:** ADR-0213 gains a one-paragraph amendment naming the move (its §5 and its fourth pass's `derivedPlaceLabel` precedent). `packages/shared/CLAUDE.md`: nothing new — this is what it already says belongs there.

**Acceptance:** `pnpm test` green in all four packages; the reader page for an existing share renders byte-identical day titles and photos (compare a projection JSON before and after).

---

## Phase 3 — `DayHead` is a component, and the reader consumes it (ADR-0219 §2/§3/§6 · frontend, reader only)

**Goal:** the reader's day-card head and shot become `ui/domain/DayHead` with its own sheet. The reader looks the same.

**Files**

- New `frontend/src/ui/domain/DayHead.tsx` + `day-head.css`. Props:
  ```ts
  {
    dayNumbers: string;           // "13" or "13–14", already isolated by the caller
    weekday: string;              // "ראשון" or "שני–שלישי"
    isNow?: boolean;              // amber ground + "עכשיו" in the date column
    title: string;                // the day's name, already composed (dayTitleText or destination)
    facts?: ReactNode[];          // at most two, rendered in the footer band as full-width wrapping lines (`.wp-dayhead-facts > span`)
    shot?: { url: string; of: string; credit: string; onOpen?: () => void };
    trailing?: ReactNode;         // the reader's caret; absent → the `auto` track is 0px
    action?: ReactNode;           // the app's `.new-event-btn`, rendered as a footer row under the grid (`.wp-dayhead-foot`); absent → no row
    as?: 'button' | 'div';        // the reader's head toggles the body; the app's is a region
    onToggle?: () => void; expanded?: boolean;   // button mode only
  }
  ```
- Move `.sh-day-head`, `.sh-day-date`, `.sh-now-mark`, `.sh-day-copy` (+ its `>` child rules), `.sh-caret`, `.sh-shot*` from `screens/shared-itinerary.css` into `day-head.css` under `wp-dayhead`, `wp-dayhead-date`, `wp-dayhead-now`, `wp-dayhead-copy`, `wp-dayhead-caret`, `wp-dayhead-shot`. Grid becomes `64px minmax(0, 1fr) auto` (the trailing track is content-sized; the reader's caret cell keeps `width: 44px` on the caret itself). Add `.wp-dayhead-foot` — `display: flex; justify-content: flex-end; padding: 6px 11px; border-top: 1px solid var(--line)` — the app's action row (the mockup's proposed block is the exact CSS). **Keep the child combinators** — `.wp-dayhead-copy > strong`, `.wp-dayhead-copy > span` — that ADR-0213's fourteenth amendment fixed. Keep `.sh-day.is-now` → `.wp-dayhead.is-now` amber ground rule; keep `.sh-stay`, `.sh-stay-when` in the reader's sheet (they are the reader's lines, passed in as `lines`).
- The shot's `img` height: 116px, one rule; `object-fit: cover`; top radius 16px; scrim caption (`strong` = `of`, `span` = `credit`). If `onOpen` is passed the figure is a `<button>` (the app), else a `<figure>` (the reader).
- `screens/SharedItinerary.tsx:586-640`: render `<DayHead as="button" … lines={[stayLine, <StayWhen/>]} trailing={<Icon name="caret"/>} />`.
- `screens/shared-day-header.contract.test.ts`: move to `ui/domain/day-head.contract.test.ts`, reading `day-head.css`, asserting the same child-combinator rule on `.wp-dayhead-copy` and the amber/`white-space: normal` rule on the reader's stay line wherever it now lives.

**Tests:** `DayHead.test.tsx` — renders the date column, the `עכשיו` mark only when `isNow`, each line as a direct child span, the shot only when given, the trailing slot; button mode toggles. `SharedItinerary.test.tsx` keeps passing unchanged (query by text, not class).

**Docs:** `docs/design/design-language.md` "Component lexicon" gains `DayHead`. ADR-0213 amendment: the head is a domain component now.

**Acceptance:** the reader at `/s/<code>` is visually identical (screenshot before/after at 360 in both themes); `pnpm test` green.

---

## Phase 4 — the app's day head, and the ambient strip retires (ADR-0219 §2/§3/§4 · frontend, both day surfaces)

**Goal:** both day surfaces open with `DayHead`; the facts that were in the strip become its lines; an untimed commitment becomes a transition-grammar row; the strip's CSS is deleted.

**Files**

- `frontend/src/lib/day-title.ts` (new): `buildDayFacts(trip, dayEvents, bookings, places, enrichments, stays) → DayFacts` using the shared helpers from phase 2 (`buildDayStopSequence` for the stops, `dayBookendStays` for `lodgingPlace`, the moved majority helper for `region`/`kind`, `tripShapeOf` for `tripShape`, the booking types from the day's bookings, `outbound`/`returning` from the trip's first/last flight days). Then `dayHeadTitle(facts, trip) = dayTitleText(fallbackDayTitle(facts)) || trip.destination`. Move `dayTitleText` out of `SharedItinerary.tsx` into this file (it is the i18n rendering of `SharedDayTitle`; both the reader and the day surfaces call it).
- `frontend/src/lib/day-photo.ts` (new, thin): `dayShot(dayEvents, places, enrichments, label) = dayPhoto(…)` from shared, mapped to `{ url: apiAssetUrl(url), of, credit }`.
- `screens/DayView.tsx` (`:1244-1357`) and `screens/PlanDay.tsx` (`:1460-1560`):
  - replace the `.sec-title` heading block with `<DayHead as="div" dayNumbers weekday isNow={activeDate === today} title lines shot trailing />`;
  - `facts`, at most two, in order: `<DayTravelTotal total={dayTotal} />` when `dayTotal.distanceMeters !== null`; Plan only: the fit verdict when `planFit.fit === TRAVEL_FIT.OVERRUNS` — `<span className="wp-dayhead-fit"><Icon name="warn"/> {infeasibleLegsPhrase(planFit.legs)} · {dayShortfallPhrase(…)}</span>`; Plan only, `readOnly`: `<span><Icon name="archive"/> {t.planDay.pastNote}</span>`. **No span lines**: the `staysToday`-not-in-`stayRowIds` rows (`ambientSpanLabel`) render nowhere on the day any more (ADR-0219 §2, ADR-0163 §3 amended) — delete that loop in both screens and its tests' expectations; `ambientSpanLabel` itself stays (Home's glance uses it);
  - `action`: the existing `<button className="new-event-btn">` when not `readOnly`, else nothing (no footer row at all);
  - `shot`: from `dayShot(…)`, with `onOpen` opening `MediaViewer` (the screen owns the viewer state, as `Map.tsx:2304/3859` does; caption = the credit);
  - remove the `.day-ambient` block; render `placement.commitments` as `<UnplacedCommitment …>` **as the first children of `.day-list`**, above `placement.overnight`;
  - Trip's archive banner (`:1258`): text becomes `t.day.archiveTag` alone.
- `ui/domain/UnplacedCommitment.tsx`: re-render on `.transition-row` markup — `<div className="transition-row"><button className="tr-face" …><PlaceBadge className="tr-badge">{icon}</PlaceBadge><span className="tr-main"><span className="tr-title">{title}</span><span className="tr-time"><span className="tr-clock" data-bound="exact">{whenLabel(row, tz)}</span></span></span></button>{settle && <SettleControl variant="compact" …/>}</div>`. Keep `labelKey` support: when present, `<span className="tr-label">` above the title, as `TransitionRow` does.
- `day-head.css`: the footer band and the facts block exactly as the mockup's proposed block writes them (`.wp-dayhead-foot`, `.wp-dayhead-facts`, `.wp-dayhead-facts > .wp-dayhead-fit`, the `.day-total-n` size override, the 15px/700 name, the grid's `min-height: 64px`). Copy the block; the numbers were measured.
- `screens.css`: **delete** `.day-ambient` (`:419-424` and the `:381-418` block), `.day-ambient .ambient`, `.ai`, `.an`, `.as`, `.as-open`, `.ambient.unplaced*`, `.day-fit*` (`:426-499`), `.day-ambient .day-total`. Keep `.day-total*` (`:500+`, unscoped by ADR-0215 §6) and `.archive-banner`. Grep `day-ambient|\.ambient\b|as-open|day-fit` across `frontend/src` and the e2e specs before deleting; update selectors in tests.
- `i18n/he.ts`: no new strings except none — every word already exists (`pastNote`, `archiveTag`, `ambientDay/Night`, `noTime`, `newEvent`).

**Tests**

- `DayView.travel.test.tsx` / `PlanDay.travel.test.tsx`: assertions on `.day-ambient` / `.day-total` move to the head (`.wp-dayhead` contains the total text).
- New `DayView` cases: the head shows the day of month + weekday, `עכשיו` on today only, the destination as title on an empty day, the shot when a stop clears the gate and none otherwise, no `new-event-btn` and no `.wp-dayhead-foot` on an archive day.
- `UnplacedCommitment.test.tsx`: renders `.transition-row`, `ללא שעה`, the compact settle in Trip, no settle in Plan; sits before the first `.wp-event`/`.stay-bookend` in `DayView`.
- e2e `e2e/plan-row-tap.spec.ts` and any spec touching `.sec-title` on the day surfaces: update selectors. Add one e2e at 360×640 asserting the head's rendered height with and without a shot (the mockup's numbers ± a few px), that the title is not ellipsised on the mockup's `Stútur crater ← Háifoss` day (`scrollWidth <= clientWidth`), and that the footer row's button is reachable at the touch floor (its row ≥ 38px, the button's hit area padded to 44 if the device pass asks).
- `glance.test.ts`'s `ambientSpanLabel` cases stay (the function is unchanged).

**Docs:** ADR-0054, ADR-0171 §10 and ADR-0184 §9f get the one-paragraph pointer amendments already stubbed in this PR (fill in built numbers); ADR-0219's build log. `docs/design/design-language.md` "Core components": the itinerary item entry gains the badge photo; a `DayHead` line. `docs/design/mockups.md`: the mockup's status → built.

**Acceptance (device, 360px, both themes, both modes):** the head reads date · name · facts; today is amber; a landmark day shows its shot with a legible caption; a city day shows the frame alone; a car-hire middle day shows `Hertz · יום 3 מתוך 6` as a line; an untimed hard booking shows as an amber row at the top with `היינו`/`דילגנו` in Trip and none in Plan; the archive banner says only `לקריאה בלבד`; Plan's overrunning day shows the amber verdict line; no teal remains above the list.

---

## Phase 5 — the photo recedes with the card, and the read knows the place (ADR-0219 §5/§6 · frontend)

**5a — grayscale (Trip).** `event-card.css`, beside `.wp-event.passed`: `.wp-event.passed .wp-placebadge-photo img { filter: grayscale(1); }`. Test: a `passed` card's img has the class chain; a `done` card's does not (jsdom cannot see the filter, so assert the selector exists in the sheet — the `*.contract.test.ts` shape in `styles/`).

**5b — `PlaceKnowledge` in the read.**

- `screens/map.css`: move the base rules `.map-hero` (`:1653`), `.map-hero img`, `.map-credit` (`:1681`), `.map-sum` (`:1609`), `.map-sum-lang`, `.map-sum-t`, `.map-sum.is-open`, `.map-sum.is-decide`, `.map-know-more` (`:1711`) into new `ui/domain/place-knowledge.css`, imported by `PlaceKnowledge.tsx`. Leave the `.map-placecard:has(.map-hero) > .place …` grid rules in `map.css`.
- `ui/EventDetail.tsx`: after `DetailSheet`'s head, render `<PlaceKnowledge density={KNOWLEDGE_DENSITY.DECIDING} image={enrichment?.image} summary={placeSummary(enrichment)} onFullPicture={…} />` where `enrichment = place && enrichments[place.id]`. `DetailSheet` needs a slot between `.bk-head` and `.bs-hard-note` — add a `knowledge?: ReactNode` prop rendered there (`BookingDetail` may pass the same later; do not wire it now). `EventDetail` owns `fullPicture` state and renders `MediaViewer` like `Map.tsx:3859` (title = place label, caption = `placeCredit(image)`).
- Suppress the picked-icon rule here? No — the read shows the photograph regardless of a picked icon; §2 of ADR-0167 is about the 40px badge, and the read is where the photo is "one tap away".

**Tests:** `EventDetail.test.tsx` — with an enrichment image the read has `.map-hero img` and `.map-credit`; with a summary, three-line clamp class `.map-sum.is-decide`; with neither, no knowledge block; tapping the hero opens the viewer (a `MediaViewer` role/dialog appears). `Map.test.tsx` unchanged.

**Docs:** ADR-0174 gains the stubbed pointer (the read shows the place's knowledge); ADR-0167 §4 amendment is already written (the on/under rule) — mark it built.

**Acceptance:** tapping Háifoss in either mode opens a read with the picture, the credit under it, three lines of summary marked `באנגלית` where relevant, and `עוד בגוגל`; tapping the picture opens it full screen; a restaurant with no enrichment opens exactly the read it opens today.

---

## After phase 5

**All five phases shipped 2026-09-05.** What the build measured differently, and the three things
in the ADR the code disagreed with, are in the build note:
[`2026-09-05-a-day-is-a-place-you-can-see-build.md`](2026-09-05-a-day-is-a-place-you-can-see-build.md).
Read it before trusting a number in this file — the head's frame is 124px and not 78, the whole
head with a shot 240px and not 194, and a day WITH a picture hangs its head off the day strip,
which this plan does not describe at all.

- Device pass: is a real photograph legible at 40px (ADR-0167 §18)? If not, the answer is to change what fills the badge for small-subject photos (e.g. prefer the glyph below some `width/height` or subject-class heuristic), never to grow the badge.
- The `.wp-maybecard-ic` ring observation (ADR-0219 "What rendering it found") — look, then fix or close.
- Prune the backlog line; move the mockup's catalog status to built; write the session note for the build.
