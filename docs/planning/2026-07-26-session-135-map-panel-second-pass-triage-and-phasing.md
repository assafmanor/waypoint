# Session 135 — the map panel's second pass: 15 field reports, triaged and phased

**Date:** 2026-07-26
**Branch:** `claude/new-map-categorize-plan-2jt468`
**Paper only** — no feature code. Reads against ADR-0106, 0109, 0110, 0111, 0112, 0115, 0117, 0119, 0120, 0121; ADR-0054/0063 for the span question.

Phase 6 shipped in session 133 and got three production fixes in 134. This is the first
**field report from using the finished tab**: fifteen items from the owner, in the order they
were reported. The session's job was to understand each one against the code, sort them, and
lay out an order to take them in — not to fix anything.

**The headline finding: only four of the fifteen are defects.** Three are decisions the owner
is reversing (all documented, all deliberate), two are new product surfaces with money
attached, and the rest are ergonomics on a shell that was designed on a mockup and is now being
used on a phone. That ratio is why the phasing below front-loads the cheap half — five items
can be closed in one session without a single new design decision.

## The reports, traced

| #   | Report                                           | Traced to                                                                                                                                                                                                                                         | Verdict                       |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | מפה קטנה מדי, רשימה קטנה מדי                     | `MAP_SHEET_STOPS.half = 0.56` gives the map 44% of the split — and the split itself is shortened by a **permanently fixed two-row header** (`.map-filter-row` + `.map-sortstrip`, `constants.ts:223`, `map.css:28`)                               | Design: re-proportion         |
| 2   | הגרירה בין שני המצבים לא נוחה                    | Only the grab line drags (`useSnapDrag` spread on `.wp-snapsheet-grab` alone ≈ 76×16px, under ADR-0017's touch floor); `nearestStop` is distance-only, no velocity, so a real flick that travels little snaps back                                | Design + build                |
| 3   | מיקום אישור שיתוף מיקום לא נוח                   | The pre-prompt renders **inside `.map-sheet-scroll`** (`Map.tsx:1002`) — a scrolling list item, for a question about the map; at `peek` it lives in a ~40px viewport                                                                              | Design: relocate              |
| 4   | רשימה לא מתמקדת במה שמסומן, במיוחד כשהיא ממוזערת | `select()` scrolls the row with `block:'nearest'` but **never raises the sheet**. The row→pin path lowers `full`→`half`; the pin→row path has no matching `peek`→`half` raise (`Map.tsx:499-515`)                                                 | **Bug** (asymmetry)           |
| 5   | כפתור מטרה צריך זום כמו גוגל                     | `recentre` calls `focus(me)` = `panTo` — it **never zooms**; with no fix it silently reframes the pin set instead of locating you; ADR-0121 §12 forbids it asking for permission                                                                  | Decision: revise §12          |
| 6   | אין דרך קלה לנווט בין מיקומים לאירועים והזמנות   | `useShowPlaceOnMap` exists but has **two call sites** (DayView's `EventCard`, `BookingDetail`). Absent from Index bookings rows, Home board/tiles, PlanDay, the shelf                                                                             | Gap: widen                    |
| 7   | חיפוש מקומות צריך מפה                            | `PlacePickerSheet` is a text list, and **a prediction carries no coordinates** (exactly why ADR-0115 dropped distance from a result card). Mapping one means a paid Details call **before** the pick                                              | Decision: cost ADR            |
| 8   | פתיחה בסינון כל הימים                            | Working as designed: `setAllDays(mode === 'plan')` (`Map.tsx:140`), ADR-0109 §2 — Plan researches the whole trip. **Owner reverses it** (see below)                                                                                               | Decision: revise §2           |
| 9   | מעבר רק אל ההזמנה ולא אל האירוע                  | `Map.tsx:619-625` — `if (booking) return …` makes the event branch **unreachable** for a linked booking, though §8 promised one entry per in-scope reference                                                                                      | **Bug**                       |
| 10  | לחיצה על יום לא מורידה את "כל הימים"             | `onSelectDay = setActiveDate` (`App.tsx:399`) only sets a value; the Map clears all-days on a **change** (`Map.tsx:142-147`). Tapping the already-active day changes nothing                                                                      | **Bug**                       |
| 11  | בחירת מקום צריכה לזום אליו                       | ADR-0121 §7 decided "focus pans, it does not zoom" deliberately, to preserve the context you were reading                                                                                                                                         | Decision: revise §7           |
| 12  | סימון מקום ידני על המפה                          | A new `Place` origin: coords, **no** `googlePlaceId`, user-typed name. Touches the dedup unique, `geo-tz` (unaffected — lat/lng based), and ADR-0112                                                                                              | New ADR                       |
| 13  | מקומות ממוספרים על המפה צריכים מספור גם ברשימה   | `orderIndex` is already computed (`buildPinOrderIndex`) and handed to every pin as `order`; `PlaceRow` simply never receives it                                                                                                                   | **Bug** (cheapest of the set) |
| 14  | מלון (וכל אירוע/הזמנה מתמשכים) בסקופ של כל יום   | `spanDays` **does** emit a middle-day `DayUsage` (`prominence: 'ambient'`) and it **is** pinned (`PIN_TIER.ambient`, `saturate(.45) opacity(.8)`). So either the treatment is too quiet to register, or the stay carries no `endDate` span at all | **Triage first**              |
| 15  | כשיש מיקום אחד, הזום קרוב מדי                    | A lone point takes the `centre` branch and lands at `MAP_ZOOM.SINGLE_PIN` = **15**; a tight _cluster_ takes the `fit` branch and clamps at `MAP_ZOOM.MAX_FIT` = **16**, closer still. Both are street-level with no surrounding context           | Tuning (two constants)        |

### The three reversals, stated plainly

These are not bugs, and it matters that the ADRs record them being overturned rather than
quietly drifting:

- **#8 — Plan opens day-scoped.** ADR-0109 §2 gave Plan mode all-days because research is a
  whole-trip activity. The owner's call is that both modes open on the day you're on. One
  consequence to accept: before the trip starts `activeDate` is today clamped into the trip
  range, i.e. **day 1** — so Plan opens on day 1 with `כל הימים` one tap away.
- **#11 — selection zooms.** ADR-0121 §7's argument (zooming on selection throws away the
  context you were reading) is real but loses to the reported feel. The resolution that honours
  both is **zoom-to-at-least**: always pan, zoom **in** only when currently below a
  selection-zoom threshold, never zoom out.
- **#5 — the locate button locates.** ADR-0121 §12 kept permission-asking with the near-me
  chip's reason-first card. Today that leaves a compass button that, without a fix, quietly
  does something else entirely (reframes the pin set). It should behave like Google's: centre
  **and** zoom, and route to the same reason-first card when it has no permission.

**On "can we embed Google's own button" (#5): no — there is nothing to embed.** The Maps
**JavaScript** API ships zoom / mapType / streetView / fullscreen / rotate / camera controls;
the my-location button is a **Maps SDK for Android/iOS** control, not a web one. We already
render our own (`.map-recenter`), so this is a behaviour change to that button, not an
integration. Worth re-confirming against live docs when the phase is picked up, but plan for
"replicate", not "adopt".

### #14 is a fork, and the triage is 30 minutes

The derivation already does what was asked: `spanDays` walks every date from `event.date` to
`event.endDate`, marking the strictly-middle ones `ambient`, and `placePinTier` renders those
as a real (quiet) pin that the camera does frame. So the report means one of two things:

- **(a) The stay has no span.** ADR-0054's ambient model needs `endDate` **set on the event**.
  A hotel authored as a check-in event plus a separate check-out event produces two edge days
  and no middle at all — which matches the report's wording exactly ("only on check-in or
  check-out days"). If so this is an authoring/data-shape fix, and it generalizes to every
  prolonged booking as the owner asked.
- **(b) The ambient treatment is too quiet.** `saturate(.45) opacity(.8)`, no number, no meta
  line, is by design "backdrop, not a stop" — and the owner is saying the backdrop should read
  as present. Then it is a prominence revision against ADR-0054/0063/0121 §6.

Answer (a) vs (b) by opening a trip with a real multi-night hotel on a middle night and looking
at the DB row for `endDate`. **Do this in Phase 1** — it is a lookup, not a build — then let the
answer decide which phase the fix lands in.

## The five categories

1. **Scope & reference correctness** — the tab says something untrue about what's in scope or
   what a place is attached to: #4, #8, #9, #10, #13.
2. **The split's ergonomics** — the shell was proportioned on a mockup and is now being thumbed:
   #1, #2, #3.
3. **Camera behaviour** — what a tap and a button do to the viewport: #5, #11.
4. **The model of what belongs to a day** — #14.
5. **Place authoring, and reaching the map from elsewhere** — #6, #7, #12.

## Session types, and which phase needs which

**A phase is not a session.** This repo separates designing from building — session 131 designed
the embedded map (paper only: ADR-0121 + `mockups/map-embedded-v1.html`), session 133 built it;
ADR-0105 shipped as design + mockup with the build left in the backlog. The first draft of this
plan collapsed the two, which would have had a build session inventing a layout at the keyboard.
It doesn't. Four session types recur in this epic's history, and each phase below names the ones
it needs:

- **Design** (paper only) — a mockup in `mockups/` + an ADR. For anything with a new visual or
  interaction shape. Ends with no feature code, and updates `docs/design/mockups.md` in the same
  change (it's a living index, ADR-0097).
- **Cost / reconfirmation** (paper only) — an ADR pricing the options before a design exists.
  ADR-0108 and ADR-0111 are both this, and ADR-0121 required an API/pricing reconfirmation before
  it could be written at all. Only Phase 6 needs one, and it is a **go/no-go**.
- **Build** — the code, its tests, and the backlog prune.
- **Device pass** — a human looking at a real phone. Not optional on this tab: the rendered map
  is unverifiable by the suite by design (ADR-0121 §13), and both remaining tuning jobs (sheet
  stops, zoom ladder) are meaningless in a desktop viewport.

**The mockup hazard, which Phase 2 walks straight into.** Session 131's note recorded that the
Phase-6 mockup _silently supplied a flex column the app didn't have_, so the design read as
correct against the real tokens while being unbuildable — "a mockup that reads the app's CSS
still does not inherit its layout tree." Phase 2 **is** a layout-tree change. Its design session
must check every proposed height against `AppShell` + `BODY_FULLBLEED` + `.map-split` as they
actually nest, not against a standalone HTML file that happens to use the same variables.

### The sessions, in order

| #   | Session      | Type               | Output                                                        |
| --- | ------------ | ------------------ | ------------------------------------------------------------- |
| 1   | Phase 1      | build              | Code, the ADR-0109 §2 amendment, and the #14 triage answer    |
| 2   | Phase 2      | **design**         | Mockup + ADR amending 0121 §5; no code                        |
| 3   | Phases 2 + 3 | build + **device** | Both builds with a phone in hand; Phase 3's ADR written first |
| 4   | Phase 4      | depends on triage  | Branch (a): build. Branch (b): **design**, then build         |
| 5   | Phase 5      | build              | Code + an ADR-0121 §8 amendment                               |
| 6   | Phase 6a     | **cost**           | The go/no-go ADR. Nothing downstream starts until it lands    |
| 7   | Phase 6a     | **design**         | Mockup + ADR                                                  |
| 8   | Phase 6a     | build              | Code, plus backend if the field mask moves                    |
| 9   | Phase 6b     | **design**         | Mockup + ADR                                                  |
| 10  | Phase 6b     | build              | Code, plus a BE-arch pass if the schema moves                 |

So: **~10 sessions, not 6.** Five of them are paper. Two notes on the shape:

- **Phase 3 gets an ADR but no mockup.** A mockup cannot express a zoom level — the only honest
  surface for "how close is close enough" is the real map on a real phone. Its decision is small
  enough to write at the head of its build session, which is why it rides along with Phase 2's
  build rather than getting a design session of its own.
- **Phase 6's cost session is a gate, not a stage.** If the answer is "a Details call per preview
  is too expensive", the design session that follows is a _different_ design (keep the free
  `place_id` deep-link), and 6b's surface changes with it. Don't design ahead of it.

## The phases

Six phases, each **one branch, one PR**. The order front-loads certainty: everything in Phase 1
is already decided, everything in Phase 6 needs a cost decision first.

### Phase 1 — the tab tells the truth (#10, #9, #4, #13, #8) + triage #14

**One build session.** Nothing here has a new shape to design.

The whole cheap half. No new surface, no new mechanism, and four of the five are defects
against ADRs that already say what should happen.

- **#10** — the day strip's tap must clear all-days as an **intent**, not as a side effect of the
  date changing. `onSelectDay` currently is `setActiveDate`; it needs to signal "a day was
  chosen" so the Map can drop `allDays` even when the chosen day is the active one. Keep the
  existing `activeDate`-changed effect as well, so arriving from `daySelectTarget` still narrows.
- **#9** — in `refEntriesFor`, a ref carrying **both** `bookingId` and `eventId` emits **two**
  entries (booking → `BookingDetail`, event → its day) instead of returning early.
- **#4** — give the pin→row path the raise that mirrors the row→pin path's drop: selecting from a
  pin at `peek` lifts the sheet to `half`. Once it does, `block:'nearest'` can become a centred
  scroll, which is what "focuses on what's marked" actually means.
- **#13** — thread `orderIndex.get(usage.placeId)` into `PlaceRow` and render it on (or beside)
  `.map-badge`. Note the two properties the number already guarantees and must keep: a filter
  never renumbers, and gaps like `1, 3, 4` are **correct**. Ghosts have no number.
- **#8** — one line (`setAllDays(false)`), plus a one-line amendment to ADR-0109 §2 recording the
  reversal and the day-1 consequence.
- **#14 triage** — the lookup above. Write the answer into the session note; don't build here.

**Read first:** ADR-0121 §8 (selection), ADR-0110 §4 (day scope), ADR-0109 §2. **Files:**
`screens/Map.tsx`, `App.tsx` (`onSelectDay`), `ui/domain/DayStrip.tsx`, `lib/map-pins.ts`.
**Tests:** each of #10/#9/#4/#13 is a `Map.test.tsx` case; per `frontend/CLAUDE.md`, pin the
clock and **assert across both day scopes**. **Docs:** amend ADR-0109 §2; the rest are bug
fixes, so the session note carries them.

### Phase 2 — the split earns its screen (#1, #2, #3)

**A design session, then a build session** (the latter shared with Phase 3, phone in hand). Read the mockup hazard above before starting the design: this phase is a layout-tree change, which is the exact thing a standalone mockup gets wrong.

One coherent redesign of the shell ADR-0121 §5 built. Needs an ADR because the stops, the
header, and the pre-prompt's home are all documented decisions.

The three reports share one cause worth naming: **the fixed header is charged to both halves**.
`.map-filter-row` + `.map-sortstrip` never scroll away, so they shorten the pane and the sheet
at the same time, and then `half` splits what's left 56/44. Candidate moves, to be decided in
the ADR: merge the two header rows into one (the Index already did exactly this in ADR-0100),
let the header collapse as the sheet rises, and re-tune the stops against a real phone rather
than a mockup viewport.

For #2 specifically: widen the drag target to the whole `.wp-snapsheet-top` (the handle **and**
its header row), which is the standard sheet idiom and immediately clears ADR-0017's touch
floor; and give `nearestStop` a velocity term so a flick commits in its direction of travel
instead of falling back to nearest-by-distance. Also reconcile "two states" (what the toggle
exposes) against three stops (what the axis has) — the mismatch is part of why the gesture reads
as unpredictable.

For #3: the pre-prompt is about the map, so it belongs over the map pane (or pinned between
header and pane), not as the first item in the list's scroll region. It stays **inline, not an
overlay** — that is ADR-0109's session-105 reading and ADR-0121 §5's rule, and it should survive
the move.

**Read first:** ADR-0121 §5, ADR-0109 §6 + its session-105 amendment, ADR-0017, ADR-0100.
**Files:** `constants.ts` (`MAP_SHEET_STOPS`), `lib/snap-sheet.ts`, `lib/useSnapDrag.ts`,
`ui/primitives/SnapSheet.tsx`, `screens/map.css`, `ui/primitives/snap-sheet.css`, `Map.tsx`.
**Watch:** `--sheet-h` is written from the **snapped** height so a drag costs no relayout — keep
that. And the pane must not be re-created by any of this (ADR-0121 §4 — a re-instantiation is
billed). **Docs:** new ADR amending 0121 §5.

### Phase 3 — the camera answers the tap (#11, #5, #15)

**One build session, its ADR written at the head of it**, sharing the device pass with Phase 2's build. No mockup: a zoom level only means something on a real map.

Both reverse a documented camera decision, so they belong in one ADR and one PR.

- **#11** — zoom-to-at-least on selection, as above. Implement in `useMapCamera.focus`, keeping
  the reduced-motion branch (a pan becomes a jump).
- **#5** — `recentre` centres **and** zooms; with no permission it opens the same reason-first
  card the near-me chip uses rather than silently reframing the pin set. Decide in the ADR
  whether the button keeps its "reframe the filtered set" job as a second tap or loses it.

- **#15** — a single pin lands too close. `cameraTargetFor` sends a lone point (or several
  coincident ones) down the `centre` branch → `setZoom(MAP_ZOOM.SINGLE_PIN)` = **15**, while a
  tight cluster takes the `fit` branch and gets clamped at `MAP_ZOOM.MAX_FIT` = **16** — so the
  cluster case is the tighter of the two and both need lowering. Each zoom step halves the span,
  so this is a one- or two-step change, not a rewrite. Tune both against a real phone.

**Do these three together, because they share one ladder.** #11's zoom-to-at-least threshold,
#15's single-pin zoom, and #5's locate zoom are the same question asked three ways — "how close
is close enough to read a place in context". Pick the value once and let all three name the same
constant, or the tab will answer it differently depending on how you got there.

**Read first:** ADR-0121 §7 and §12, ADR-0109 §6, ADR-0006 (location stays on the device).
**Files:** `lib/useMapCamera.ts`, `lib/map-camera.ts`, `ui/domain/MapPane.tsx`, `constants.ts`
(`MAP_ZOOM`). **Tests:** `lib/useMapCamera.test.tsx` already fakes a `google.maps.Map` in ~60
lines — extend it; per `frontend/CLAUDE.md`, "it talks to a third-party object" is not "it can't
be tested". **Docs:** new ADR amending 0121 §7/§12.

### Phase 4 — a continuing stay is on every day it covers (#14)

**One or two sessions, decided by the Phase-1 triage:** branch (a) is a build; branch (b) changes what an ambient pin and row look like, so it needs a design session first.

Shape decided by the Phase-1 triage. If **(a)**, it is an authoring fix (spans get `endDate`)
plus a migration question for stays already authored as two events, and it generalizes to every
prolonged booking. If **(b)**, it is a prominence revision: what an ambient middle day looks like
as a pin and reads as in a row, against ADR-0054's "backdrop, not schedule".

Either way, one thing must not regress: an ambient day is deliberately **unnumbered** and
**unclocked** (`hasScheduleSlot` requires `prominence === 'edge'`), so making it louder must not
give it a position in the day's sequence — that would renumber every real stop.

**Read first:** ADR-0054, ADR-0063, ADR-0121 §6, ADR-0077. **Files:** `lib/place-usage.ts`
(`spanDays`, `isDayUsagePast`), `lib/map-pins.ts`, `ui/domain/map-pane.css`, `Map.tsx`
(`dayMeta`).

### Phase 5 — every place-bearing surface reaches the map (#6)

**One build session.** The affordance already exists and is already designed — this phase only decides where it appears, which is an ADR amendment, not a mockup.

`useShowPlaceOnMap` is built, correct, and under-used. This phase is an **audit, not a
mechanism**: list every surface that renders a place-bearing entity, and give each the same one
affordance. Known gaps: the Index bookings rows, Home's board and quick-access tiles, PlanDay,
the shelf's `MaybeCard`. The hook already returns `null` outside the trip shell, so a leaf that
can't route simply drops the affordance — that pattern is the template for each new call site.

The decision the ADR amendment must settle: does `מפה` sit beside `נווט` everywhere (as it does
on `EventCard` today), and does a row with **no** coordinates show it at all?

**Read first:** ADR-0121 §8, the ADR-0109 2026-07-24 amendment (which scoped the single-`נווט`
rule to the Map row), ADR-0106 §F (`נווט` stays a Google deep-link permanently).

### Phase 6 — authoring a place on a map (#7, then #12)

**Five sessions: cost → design → build for 6a, then design → build for 6b.** The cost session gates everything after it.

The only phase that spends money and touches the backend. Two ADRs, sequenced — #7 first,
because whatever surface it builds is the one #12 drops a pin on.

**#7 (search with a map).** The blocker is factual: an Autocomplete **prediction has no
coordinates**, so there is nothing to place on a map until a Details call resolves one — and
ADR-0111 already pinned the field mask at Pro tier precisely to control that spend. Three
options for the ADR to choose between: preview only on an explicit "vet it" tap (one Details
call, which is what the free `place_id` deep-link does today); keep the deep-link and add no
map; or accept a Details call per preview under the existing session token, which changes the
per-search cost model. This is a **cost decision before it is a design decision** — cost the
options against ADR-0108 §3's envelope first.

**#12 (drop a pin manually).** A `Place` with real coords, no `googlePlaceId`, and a user-typed
name. Four things to settle: the `@@unique([tripId, googlePlaceId])` dedup assumption (nullable,
so several manual pins should coexist — verify); `geo-tz` still resolves a timezone from lat/lng,
so that is free and unchanged; **ADR-0112 means a dropped pin with no reference is cache-only
and would not appear on the list at all**, so dropping must also create a reference — most
plausibly the same uncategorised `MaybeItem` that ADR-0115's `＋ אולי` creates; and whether we
reverse-geocode for an address (paid — likely skip, let the user name it).

**Read first:** ADR-0111, ADR-0115, ADR-0108 §1/§3/§6, ADR-0112, ADR-0110 §1.
**Files:** `ui/primitives/PlacePicker.tsx`, `lib/usePlaceSearch.ts`, `screens/PlaceResearch.tsx`,
`backend`'s `places` module.

## The playbook — what every one of these sessions does

The repo's own rules, in the order they bite on this particular epic:

1. **Open with the backlog.** `docs/backlog.md`'s Maps section is long and mostly `done` lines
   with the reasoning inline — find the phase line added by this session, and read the
   neighbouring `done` line for the surface you're touching. It usually names the trap.
2. **Branch before the first commit**, docs-only changes included.
3. **Read the router, not the tree.** `docs/INDEX.md`'s "Decisions by domain" → only the ADRs
   named in the phase above. The Maps epic has fifteen ADRs; no phase needs more than four.
4. **Read `frontend/CLAUDE.md`** — it is not loaded automatically from a root session, and its
   anti-patterns list is specific to this tab (the memoization rules exist because `Map.tsx`
   re-renders every second and a needless re-diff is cheap while a re-instantiation is billed).
5. **Reuse before adding** (CLAUDE.md rule 8). On this tab specifically: a list that changes goes
   through `RevealList`; an overlay is a `Modal`; a per-enum lookup is a `Record`, not a switch.
   `SnapSheet` is the one deliberate non-overlay, and the reason is written at the top of it.
6. **Three standing constraints for anything touching the map pane:** one `google.maps.Map` per
   tab visit (never re-create it); the screen ticks every second, so props handed to `MapPane`
   stay identity-stable; a filter never renumbers a pin.
7. **Test what is ours.** Pure logic in `lib/` with no Google in the process; `MapPane`'s test
   stubs `@vis.gl/react-google-maps`; the rendered canvas is a **human pass** and saying so is
   the point — don't imply a canvas was seen.
8. **Pin the clock** (`setSimulatedNow`) in any test with dated fixtures, and **assert across
   both day scopes** on this tab. An ordering bug survived three sessions because every test for
   it was day-scoped.
9. **Close the loop in the same change:** ADR for any decision that moves, a dated session note,
   and prune the backlog line the work completes.
10. **`pnpm format` → `pnpm typecheck` → `pnpm build` green, then the PR.** Format again before
    opening it; unformatted code fails CI regularly.

## Open questions for the owner

- **#5** — after the locate button centres and zooms, should a second tap still reframe the
  filtered set, or does that job move entirely to a separate control?
- **#7** — which of the three cost options (vet-on-tap / no map / Details-per-preview) is
  acceptable? This gates the whole of Phase 6.
- **#12** — should a dropped pin land on the shelf as an idea (reusing `＋ אולי`), or does it
  need a reference kind of its own?
- **#1/#2** — the stops should be re-tuned against a real device, not a mockup. Phase 2 needs a
  phone in hand to land honestly.

## Not done here, deliberately

No code, no ADRs. The phasing itself is recorded here rather than promoted to an ADR because
three of the six phases exist **to make a decision** — writing that decision now, before the
cost work in Phase 6 and the device pass in Phase 2, would be front-running them. If the owner
wants the epic framed the way ADR-0106 framed the first one, this note is the draft for it.
</content>
</invoke>
