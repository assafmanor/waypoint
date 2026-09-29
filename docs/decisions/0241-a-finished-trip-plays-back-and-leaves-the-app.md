# 0241 — A finished trip plays back, and leaves the app: the journey, replay, coming home and the outputs

**Status:** Accepted 2026-09-27 as the epic's Phase 1B design (the owner's calls are marked as recommendations below; each is drawn, not forked). **5.1, 5.2 and 5.3 built 2026-09-27**; 6A.0 to 6A.3 built 2026-09-29; 6A.4 designed and built in [0242](0242-a-list-leaves-the-trip.md). Mockups: [`mockups/a-finished-trip-plays-back-v1.html`](../../mockups/a-finished-trip-plays-back-v1.html) (§1–§3) and [`mockups/a-finished-trip-leaves-the-app-v1.html`](../../mockups/a-finished-trip-leaves-the-app-v1.html) (§4–§7). Session note: [`planning/2026-09-27-a-finished-trip-plays-back.md`](../planning/2026-09-27-a-finished-trip-plays-back.md). Epic plan: [`planning/2026-09-25-a-finished-trip-is-a-memory-build-plan.md`](../planning/2026-09-25-a-finished-trip-is-a-memory-build-plan.md) §1B, Phases 5, 6A and 6B.3.
**Date:** 2026-09-27

**Fills in** [0239](0239-a-finished-trip-is-a-memory-not-a-plan.md) §7 (the beat) and §8 (the push's copy and its place). **Amends** [0182](0182-a-day-is-a-sequence-you-can-step-through.md) §11 (all days has a sequence on a finished trip), [0137](0137-the-pin-says-what-happened.md) (a finished trip's pin reads `recapHappened` and gains a third mark), [0130](0130-a-maybe-is-not-a-past-place.md) §2 (a finished trip is not `planning`), `design-language.md`'s motion budget ("exactly one `--t-cinematic` moment" becomes one per end of a trip), and the build plan's 6A.3 (the card is a third og-cover source, not new renderer work). **Applies unchanged** [0240](0240-the-archive-is-rose.md) (rose, both themes), [0121](0121-embedded-map-phase-6-design.md) §7 (the user wins the camera), [0129](0129-map-camera-moves-like-a-camera.md) §3 (every camera move is `easeTo`), [0213](0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md) §4 (the paper is fixed light), [0219](0219-a-day-is-a-place-you-can-see.md) §3 (no picture is an honest absence).

## Context

Phase 1B owed the motion and the outputs ADR-0239 decided in principle: the map as a journey (spec 1d), replay (1e), the coming-home beat (1f, §7), the trip book (3c), the group-chat card (3d) and the anniversary push's copy (§8). Reading the code before drawing changed five of the brief's assumptions:

1. **A finished trip's map marks no outcome at all.** `Map.tsx` builds `pinCtx` with `planning: mode === 'plan'`, a finished trip's mode is `plan`, and `planning` withdraws the `behind` tier, so `pinOutcome` returns nothing for every filled pin. The spec's "ADR-0137 already draws it" holds only on a live trip.
2. **`pinOutcome` reads the stored status,** and a hard row is never settled (ADR-0044). Even with (1) fixed, the booked dinner would read "nobody said".
3. **All days has no traversal by construction** (`buildDayStopSequence` returns `[]` without a date, ADR-0182 §11). A finished trip's whole route is each day's sequence, by date.
4. **The card is not new renderer work.** `spa/og-cover.template.ts` has filled `scripts/og-covers/og-*.html` with one trip's facts over the app's real stylesheets since 2026-09-06, and `og-image.service.ts` screenshots it in the shared Chromium.
5. **The figures are picked and formatted on the client** (`memoryFigures`, `recapKm`, `recapHours` in `frontend/src/lib/memory-home.ts`). The server adapter returns the raw recap, so a server-rendered card or book would pick and format again.

## Decision

### §1 · The map on `כל הימים` draws the journey (5.1)

On a finished trip, the Map at all days (where it already opens, Phase 0.3):

- **One line through what happened, in order.** The journey is every day's `buildDayStopSequence`, concatenated by date, filtered to rows that happened (`recapHappened`, ADR-0239 §9). Consecutive repeats fold, so the bed that ends one day and starts the next is one point (the day's bookends are already the stays, ADR-0054's 2026-08-25 amendment). A skipped or unmarked stop keeps its pin and its mark, and **the line does not pass through it**: a line through a place nobody went is the plan counted as the trip.
- **The line is the connector's neutral ink,** in the existing layers: a leg the cache holds draws its geometry solid, a leg it does not draws straight and dashed. No amber (it marks the live trip's next leg, ADR-0206 §D1, and a finished trip has none) and no rose (the pins must win the canvas, ADR-0121 §9).
- **Each pin says what happened, in the record's words.** A finished trip passes a `finished` arm to `PinContext` instead of `planning`, and the outcome comes from `recapHappened` over the place's rows:
  - **happened:** a full-colour pin with no mark. The record needs no mark (4.7's rule), and a ✓ on nearly every pin is the six loud discs ADR-0137 §3 already refused.
  - **skipped (every visit):** `.map-pin.skipped` with the `✕` shoulder badge, as today on a live trip.
  - **never marked:** a new third shoulder mark, `.pin-n.outcome.open`, an empty ring in the same slot and size (0.44 of the pin, 15px at the 34px base). It is the `○` the Home's footer and `SettleControl` already use for an open question.
  - The `behind` desaturation does not apply: after the trip everything is behind, so it would grey the whole map, the same wash ADR-0240 §3 removed from the day strip.
- **Where we slept:** a stay's pin carries its nights in the pin's own neutral tag (`.pin-tag.plain`: `לילה אחד`, `2 לילות`), which a finished trip leaves free (there is no next transition). Not in the shoulder badge, where a numeral reads as a stop's order.
- **The row's trailing slot opens its day.** `.map-addmaybe` as it is, the `--cta` pill that already replaces `ניווט` in that slot under an errand, reading `יום 3` with the calendar glyph and opening the first day the place happened on. Measured: 64×29px, and the row stays 64px. It was drawn first as `.map-navbtn`, and the render painted it teal. A day is not a location (rule 4).

### §2 · Replay (5.2)

- **Where:** a fourth member of `.map-camctl`, `.map-replay`, in the seat `onLocate` leaves empty on a finished trip. The band stays 148px wide. Two new `Icon` paths, `play` and `pause`. Media glyphs are not mirrored in RTL on any platform, and an SVG is not flipped by `dir`. Pressed is `aria-pressed`, painted like `.map-compass.on` (`--idx-accent`, rose on a finished trip).
- **What it plays:** the sheet drops to its `map` stop, and then for each day with a record (the contact sheet's rule, so empty days are skipped):
  1. the camera eases to fit that day's sequence through the existing `easeTo` (`MAP_CAMERA_EASE.DURATION_MS`, 480ms);
  2. the day's stops light in `buildDayStopSequence` order;
  3. the day holds.

  At the end the camera eases back to the whole journey and the sheet returns to where it was.

- **The pacing, as `REPLAY` in `constants.ts` beside `GOING_LIVE`:**

  | Constant       | Value  | What it is                                                            |
  | -------------- | ------ | --------------------------------------------------------------------- |
  | `STOP_STEP_MS` | 220ms  | Between two stops lighting                                            |
  | `STOPS_MAX_MS` | 1320ms | A day's lighting never runs longer: the step shrinks on a crowded day |
  | `DAY_HOLD_MS`  | 1000ms | The pause on a finished day (owner, 2026-09-27; drawn at 700)         |

  The seeded road trip plays in 11.2s, 2.14s a day, against the spec's "about two seconds". The hold was drawn at 700ms and the owner set it to 1000ms on review. The mockup still offers 160/300 for the step and 500/700 for the hold as controls, and the device pass confirms them.

- **What lights:** a stop not reached yet stays where it is at opacity 0.22 and scale 0.82, so the map never jumps. It arrives over `--t-base` on `--ease-arrive`: an object settling, which is that easing's stated use. A skipped stop lights with its `✕`. A segment appears with the stop it reaches. It is not drawn on: MapLibre has no cheap per-layer line trim, and re-setting GeoJSON per frame on a screen that re-renders every second is what ADR-0121 §4 warns against.
- **The day's name:** `יום 3 · <fallbackDayTitle>` in a status pill at the canvas foot (`.map-replay-caption`, the area count's paint, one line, ellipsised). The area count steps aside while a replay runs, since it has nothing to count. Its seat up top was drawn first and rejected: beside the camera band it leaves a name 186px at 360, and a day's name is free text of any length. At the foot it gets 342px.
- **The user wins:** a finger on the canvas stops the replay (the existing `easeTo` already stands down when the camera is not where it last wrote it). Pressing again starts over. The day strip is not driven: selecting a day would re-scope the Map to one day, and there would be no whole route to return to.

### §3 · Coming home (5.3)

**Recommendation (the tone is the owner's):** a `full` `Modal` (so back, Escape and `דילוג` are one skip, ADR-0103) on the archive's band colour (`--chrome-bg-memory`):

1. **An opener,** held `OPEN_HOLD_MS` (1600ms): the kicker `חזרנו הביתה` in `--memory-deep`, the trip's name in `--font-head` at 34px, the cover's `when` line, and the faces.
2. **One card per figure,** each held `CARD_MS` (1800ms). The cards are exactly `memoryFigures`, in its order, capped by `MEMORY_FIGURES_MAX`. The value is the StatTile's mono face at 64px in `--memory-deep` (5.68:1 on the band), with the label under it. A figure that admits unmarked rows says so (`2 לא סומנו`, 5.97:1). The value counts up from 0 with the existing `useCountUp`. A card enters over `--t-deliberate` on `--ease-arrive` (14px up) and leaves over `--t-quick` on `--ease-exit`. A row of segments at the top (one per card) says how long it is.
3. **The settle, over `--t-cinematic`:** the card clips to the `.mem-cover` rect measured at that moment (a FLIP) and fades. The memory Home is already mounted under it, so there is no empty frame.

With three figures it runs 7.6s, and with five 11.2s. Any tap advances; `דילוג` (49×44px) ends it.

- **When it plays:** on the first mount of the memory Home for that trip on this install. A deep link into another tab does not consume it. It does not play when `memoryFigures` is empty (nothing to count). It plays for any finished trip this install has never shown, however old: a cutoff would be a number with no source, and one tap skips.
- **Remembered:** `waypoint:came-home:<tripId>` in `lib/mode-seen.ts`, beside `mode-seen` and in its shape (per trip, never throws, a private window simply plays it again). It is marked when the beat ends, is skipped, or is withheld under reduced motion. It is **not** folded into `mode-seen`'s value: the provider writes that on every mode as it mounts, which would mark the beat before the Home was ever on screen.
- **The motion budget is re-cut, not broken:** `--t-cinematic` goes from "exactly one moment" to **one at each end of a trip**, going live and coming home. Both play once per trip per install, so they are equally rare, and they are the two ends of the same thing. `design-language.md` and the `tokens.css` comment change with 5.3.
- **No new CSS motion tokens.** Every duration and easing is the ramp's; the holds are `COMING_HOME` in `constants.ts` beside `GOING_LIVE`, the precedent for a beat's holds.

### §4 · The share sheet's preview, and the sheet after the trip (6A)

**A preview heads the share sheet in every phase** (owner, 2026-09-27: _"the sharing thumbnail preview should be available for all trip phases"_). It is a raised box in `.share-send`'s paint (`.share-preview`) holding a thumbnail of what the recipient's chat will show:

- **Before and during the trip**, the chosen audience's own link cover: the invitation (`og-invite`) for `להצטרף`, the live itinerary (`og-live`) for `רק לצפייה`. These are the covers `og-cover.template.ts` already draws per trip, at 120px wide (1200×630). The thumbnail follows the audience choice. It has no button of its own: the link's own outcome sends it and stays the sheet's primary. The unit is 89px tall.
- **After the trip**, the card (§5), at 76px (4:5), titled `כרטיס לקבוצה`, with one outcome, `שליחה לקבוצה`. That outcome is **the sheet's one primary**, and the link below gives up `.primary`. The card does not depend on the level: everything on it is safe at Summary. The unit is 140px tall, and absent when there is neither a cover nor a figure.

The client needs the cover's URL, not a render of its own. It is the same image a crawler fetches for that link.

Also on a finished trip, which Phase 0.6 already opens on `רק לצפייה`:

- **`שיתוף PDF` becomes `ספר הטיול`** in the outcomes row. After the trip there is nothing to plan, and the book prints at the same link's level. Showing both would put three buttons in a 360px row, two of them the same trip on paper; the itinerary is still one tap away through the link.

### §5 · The group-chat card (6A.3)

- **1080×1350 (4:5), fixed light:** the cover (`tripRecap.cover`) at 720px with its place and credit on the picture (ADR-0219 §6: the licence does not end at the app's edge); then, on `--chrome-bg-memory`, the trip's name (`--font-head` 92px), its `when` line, and **the first three of `memoryFigures`** as white tiles (mono 100px in `--memory-deep`, 7.60:1; labels 42px, 9.2px at chat width). A `Travelive` mark in the foot.
- **No faces and no names.** It goes to a group that knows who was there, and on from there without anyone's say.
- **No cover:** the band carries it and the name grows. There is never a placeholder picture.
- **Delivered as a file,** through the PDF's own `shareFileOrDownload`. **It is not the finished trip's link preview:** `og-cover.template.ts`'s own rule is that nothing on a cover may go stale, and a finished trip's figures move while its stragglers are settled.
- **Built as the third og-cover source** (`scripts/og-covers/og-memory.html`), filled by `og-cover.template.ts`'s code and screenshotted by `og-image.service.ts` at a second size. It is an authenticated member route, not a crawler route.

### §6 · The trip book (6A.2)

- **A second template beside `itinerary-pdf.template.ts`, on the same share projection plus the server recap.** A4, fixed light, the same inlined faces, and the same footer with the live URL and its QR.
- **The share policy decides what a page may say. The book adds no switch of its own.** At Summary it has no clocks and no addresses. At Full it has both. With notes in the policy (Everything, `notesAndTasks`), each day gains its `מה כתבנו`, in the memory Home's journal order (ADR-0240 §4, 4.6).
- **Pages:**
  - **The cover:** the kicker `ספר הטיול`, the name, the `when` line, a 3px `--memory-deep` rule (a finished trip's mark, and it survives greyscale as a rule), the cover shot, and the figures.
  - **The days:** only the days with a record, as on the contact sheet. Each block holds the day's shot at 220px, its stops with times in the paper's amber, and `דילגנו · …` beneath. The days flow **two to a page and never split** (`break-inside: avoid`): drawn one to a page first, the render left about 60% of each A4 blank, and two fill 80%.
  - **The back:** `במספרים`, `ראשונים וטובים` and `בפעם הבאה`, in the Home's words.

### §7 · The anniversary push's copy (6B.3)

**Recommendation (the wording is the owner's):**

- **Title:** the trip's name (`יפן ׳26`).
- **Body:** `לפני שנה בדיוק · <place>`, the same line the /trips anniversary card shows that day (ADR-0240 §7). No question, no call to action, no exclamation mark.
- **The place is the cover's place** (`tripRecap.cover`), so the push and the card it opens show the same place. With no cover, it is the first place by time among those counted in `places` (lodging and transport ends are already excluded). With none, **no send**.
- **"Marked `היינו`" in ADR-0239 §8 reads with §9's rule, `recapHappened`:** a booked dinner nobody skipped is a place we went.
- **Later years** climb the anchor's ladder (`formatDuration`, ADR-0240 §3): `לפני שנתיים בדיוק`, `לפני 3 שנים בדיוק`. There is no second ladder.
- **February 29:** a trip whose first day was February 29 fires on February 28 in a common year.
- **Two trips on one day:** two pushes. The ledger key is trip plus year, and "once per trip per year" does not merge trips.

The rest of §8 stands as written: one send per trip per year, quiet hours and a morning hour, `notifyMemories` on by default, members at send time, and it opens the trip through `?trip=`.

### Reduced motion

- **Coming home:** skipped, not shortened (§7 as decided). The Home opens as it always does, and the install remembers.
- **Replay:** **no play control** (spec 1e: "reduced motion gets the static journey"). A button that makes the camera jump seven times without a transition is not a replay. The static journey of §1 is the answer. The band measures 96px without it.
- **Everything else** is already covered: `easeTo` moves the camera without easing under reduced motion, and `App.css` kills every transition.

## Build notes (what each build item now needs)

- **6A.0 (new, before 6A.2/6A.3):** `memoryFigures`' selection and `recapKm` / `recapHours` move to `packages/shared` beside `tripRecap`, so the Home, the beat, the card and the book print one string per figure. `memory-home.ts` re-exports them. This is a small extraction, not a refactor. **As built:** `recap-figures.ts` carries the values only (`memoryFigureValues`), since a label is copy; `memory-home.ts`'s `memoryFigures` adds the Home's by key, and the book and card add theirs.
- **5.1:**
  - `PinContext` gains `finished`, and `Map.tsx` passes it in place of `planning` when `isFinished`.
  - `pinOutcome` reads `recapHappened` under it and answers `open` for a place none of whose rows happened or was skipped.
  - `buildJourney` concatenates the days' sequences.
  - The stay's nights ride `transition`'s tag slot.
  - **As built:** the journey is the existing connector's plain leg in both cases, a routed leg along its geometry and an unshaped one straight, and both dashed. §1's "solid where the cache holds it" would be a fourth line layer, since `line-dasharray` is one value per layer; the leg's shape already says which it is. The `unrouted` flag (amber, long dash) is withheld on the journey, so a flight home draws neutral.
  - A place skipped on every visit keeps the `behind` tier on a finished trip, so its pin is still `.map-pin.skipped` (grey) under the `✕`. Everything else leaves `behind`.
- **5.2:**
  - `REPLAY` in `constants.ts`, and `play` and `pause` in `Icon.tsx`.
  - `.map-replay` joins the camera band's selector list in `map-pane.css`.
  - `.map-replay-caption` is new.
  - The sequencing is a hook over `easeTo` that cancels on the camera's own "a finger moved it" signal.
  - **As built:** `lib/useMapReplay.ts` sequences the camera's `reframe` (the one ease) with `REPLAY`'s pacing (`lib/map-replay.ts`). It stops on a `pointerdown` or `wheel` on the pane that is not a control, not on the camera's own signal: that signal only fires once a move has already been overwritten, and the run must also stop during a hold, when no move is in flight. A leg carries `reach` (day plus place), and a replay dims every leg whose stop has not lit through one `line-opacity` override, with no source write.
- **5.3:**
  - `COMING_HOME` in `constants.ts`, and `ui/domain/ComingHome` on `Modal variant="full"`.
  - `cameHome` and `markCameHome` in `lib/mode-seen.ts`.
  - The budget line in `design-language.md` and `tokens.css`.
  - **As built:** `MemoryHome` mounts it while `cameHome` is false and `memoryFigures` has anything; with no figures yet (the recap still reading) it waits rather than being spent. The `full` Modal's opaque ground and card are made transparent under `.mem-beat` (`coming-home.css`), or the settle would reveal a blank page instead of the Home. A figure counts up on its own face (`~`, a sign, a comma or a decimal kept) through `useCountUp`. The e2e harness seeds `waypoint:came-home:t1` unless a spec asks for the beat (`bootIntoTrip({ comingHome: true })`).
- **6A.1 (as built):**
  - The tense is an input, not a second pipe. `NARRATIVE_TENSE` sits in `sharing.ts`, and `summaryNarrativeInputSchema` gains `tense`, present only when it is `retrospective`. Every planned input therefore hashes as before, and no stored narrative went stale.
  - The port carries a skill version **per tense** (`skillVersions`), so revising the past-tense prompt retires only past-tense text.
  - The retrospective input is the projection of the record (6A.2's `record` option, which replaced 6A.1's `narrativeTense`): the same projection over the rows `recapHappened` keeps, so a day where nothing happened has no line and the route is where the trip went. The deterministic fallback is unchanged, because its words carry no tense.
  - **The caller decides that a trip is behind it; the projection never reads the clock.** A finished trip is the frontend's `tripPhase`, which weighs zone evidence and a commitment still holding the trip open, and a server copy of it would be a second answer. The book asks for the record, and the live link keeps the planned narrative.
  - `status` joins `SHARE_EVENT_SELECT` for this reason and is never published.
- **6A.2 (as built):**
  - `GET /shared-itineraries/:code/book`, public beside `:code/pdf` with its cap (5/min), rendered fresh and stored nowhere. `SharingService.book` reads `project(share, locale, { record: true })` and `TripRecapService.recordFor`, which returns the recap with the rows it counted, so the back page names rows without a second query.
  - **The record.** Filtering to `recapHappened` before the days are built makes every derivation downstream (the day titles, the beds, the route, the photo, the narrative) the trip's rather than the plan's. A day with no row left is dropped. Each day carries `skipped` (the titles of its skipped rows) and, at Everything with notes, `notes`: the notes on its rows, lifted off them in the order they were written. Both are optional `SharedDay` fields the live link never sets.
  - **A note on nothing stays in the appendix, not on its written day.** The journal files it by `liveToday`, the zone the trip was in when it was written, and that is a frontend derivation (`liveZone`) the server does not have. Moving it to shared is a larger change than this item, so it waits on its own backlog line.
  - **The back page's rows are shared's `memoryBestPicks`**, extracted from `memoryBests` as 6A.0 extracted the figures, so the Home and the book name the same five. Their clocks are `shareTimeLabel` in the row's own zone (`eventDisplayZones`), and none prints at Summary.
  - **One set of paper rules.** `trip-book.template.ts` imports the itinerary's faces, escaping, time text, note markup, appendix and footer, and the appendix and note CSS moved into two constants both sheets interpolate. `PdfBrowserService.render` and `renderBook` share one print path, and the cover's picture rides the day photos' inlining.
  - The share sheet's paper button reads `ספר הטיול` once the sheet knows the trip has ended, and fetches the book instead of the PDF.
- **6A.3 (as built):**
  - `scripts/og-covers/og-memory.html` is the third source, and its rules sit in `_cover.css` on the app's tokens. `og-cover.template.ts`'s `memoryCardHtml` fills it with the covers' own slot filler and sheets, and reads the template apart from the two covers, so a deploy missing it cannot break the link previews. `gen-app-icons.mjs` does not cut it: with nothing to draw there is no card, rather than a generic one.
  - **The screenshot is the pool's, not `og-image.service.ts`'s.** `RenderBrowserService.shootElement` is the one element screenshot, and the covers and the card both call it. The card is rendered by `SharingService.card` behind `GET /trips/:tripId/share/card` (`MembershipGuard`, 5/min, `private, no-store`). The route answers 204 when the trip has neither a cover nor a figure. The cover's picture is inlined by `inline-photos.ts`, which the PDFs now share.
  - **A figure's size follows the longest value** (`--og-chars`): the drawn 100px mono ran `9,203` off its tile in the first render, so the digits scale down only when a value would not fit. **The name is at most two lines**, and the body's bottom padding, the tiles' padding and the foot's margin are 8–10px under the drawing: the card is a fixed 1350 and clips, and with a cover a two-line name put the foot 4px past its edge (measured, then fixed and re-measured at one, two and three lines).
  - The link covers' paths and fallback PNGs are `OG_COVER_PATH` / `OG_COVER_FALLBACK` in shared, since the sheet's preview now reads them too.
  - `.share-preview` (`ui/domain/SharePreview`) heads the sheet in every phase. It shows the audience's own link cover (the generic cut until the link exists), and after the trip the card, whose `שליחה לקבוצה` is the sheet's one primary, sent as a PNG through `shareFileOrDownload`. With no card, there is no unit and the link keeps `.primary`.

## Consequences

- The device pass owns five numbers: the three replay paces, the beat's card dwell, and whether the empty ring reads against park-green tiles, the same open question ADR-0137 left for the ghost's stroke.
- A card and a book printed before a straggler is settled say `2 לא סומנו`. That is §9 working, not a defect. The Home's footer is where it gets fixed.
- The mockups' "today" frames are drawn from the code (the `planning` path), not captured from the running app.

## Alternatives considered

- **Keep the `behind` grey on a finished trip.** It greys the whole map, as `.wp-daypill.past` greyed the whole strip.
- **A ✓ on every pin that happened.** The loudest object on the canvas, and 4.7's record already marks only what did not happen.
- **The line through every planned stop.** It draws the plan as the trip.
- **Nights in the shoulder badge.** A numeral there reads as the stop's order.
- **The day button as `.map-navbtn`.** It is teal.
- **Replay drives the day strip.** It re-scopes the Map to one day.
- **A draw-on line.** No cheap line trim in MapLibre, and a per-frame GeoJSON write on a per-second screen.
- **The replay caption in the area count's seat.** It has ~186px at 360 beside the camera band.
- **Coming home without `--t-cinematic`.** The budget exists against frequency, and the beat is exactly as rare as going live.
- **Coming home inside `mode-seen`'s value.** The provider writes it on mount, so a deep link would consume the beat.
- **Play coming home only for a recently finished trip.** Any cutoff is a number with no source.
- **The card as the read link's `og:image`.** Chat apps cache previews, and the figures still move.
- **A landscape 1200×630 card.** A chat app shows it as a low strip.
- **Faces and names on the card.** It is forwarded without anyone's say, and Summary carries no names either.
- **A book-only "include notes" switch.** The share policy already has one.
- **Both the itinerary PDF and the book on a finished trip's sheet.** Three buttons in a 360px row, two of them the same trip.
- **One day per book page.** About 60% of every page was blank.
- **`זוכרים את יפן?`** A question demands an answer, and §8 already rules out a generic "remember your trip?".
