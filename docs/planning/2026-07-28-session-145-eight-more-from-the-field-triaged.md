# Session 145 — eight more from the field: the split's grammar, the canvas's finger, a booking's phase

**Date:** 2026-07-28
**Branch:** `claude/maps-issues-fixes-plan-jw5lzc`
**Paper only** — no feature code. Reads against ADR-0106, 0109, 0117, 0121, 0122, 0123, 0124; ADR-0028/0105 for the amber question, ADR-0063 for the transition vocabulary, ADR-0017 for the touch floor.

The [second pass](2026-07-26-session-135-map-panel-second-pass-triage-and-phasing.md) triaged fifteen
reports into six phases; four of them have shipped (1, 2, 4, plus five unplanned repairs). These are
the next **eight**, reported from using the tab after all of that landed. Same job as session 135: trace
each against the code, sort them, and say which session takes them — not fix anything.

**The headline: two of the eight are already-phased work getting its open question answered, and one is
free work that was wrongly parked behind a cost gate.** The other five are new, and they split cleanly
into "the two halves of the split disagree" (cheap, decided) and three surfaces that need a design
session before anyone builds them.

> **Read the `#18` correction below before trusting this headline.** The "free work wrongly parked" is
> only the day-scoped-grammar defect; #18 itself, which this note billed with it, is a design job about
> the search **surface** — so the count is **four** design surfaces, not three.

They continue the second pass's numbering — **#16–#23** — because they are reports against the same
shipped tab, and a second `#1` in the same epic would be unreadable. The new phases continue it too
(**7–11**, not a fresh 1–5) for the same reason.

## The reports, traced

| #   | Report                                         | Traced to                                                                                                                                                                                                                                                                                                                                    | Verdict                                |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 16  | Numbering makes sense per day, not in all-days | `buildPinOrderIndex(dayScoped, { onDate: scopedDate })` and `scopedDate` is **`undefined`** in all-days (`Map.tsx:326`, `:481`), so `comparePlacesBySchedule` sequences the **whole trip**: a pin reads `27`. ADR-0121 §6 defined the number as the index in **the day's** sequence — in all-days there is no day                            | **Defect** against §6's own definition |
| 17  | One-finger zoom (tap, then press and drag)     | `gestureHandling="greedy"` (`MapPane.tsx:124`) buys one-finger **pan**; zoom stays the pinch. Google's web gesture set is two-finger pinch / double-tap-in / two-finger-tap-out — **one-finger double-tap-drag is an Android/iOS SDK gesture**, same shape as session 135's my-location finding                                              | Build + reconfirm; not a flag          |
| 18  | Search should show results on the map          | **See the correction below** — the real trace is that search **is** `SearchOverlay` (ADR-0101, shared with the Index), which covers the canvas, so the answer renders as a list with the map hidden. (The original entry read: `query` reaches only `searchRows`, `pinsNow` never sees it, `cameraSignal` omits it — true, and unobservable) | **Gap; a design job, not a cheap one** |
| 19  | Split "focus the filtered set" from "focus me" | One button, one `if`: `if (me) focus(me); else reframe(points)` (`MapPane.tsx:297`). This **answers session 135's open question for #5** — the owner's call is a separate control                                                                                                                                                            | Decision: answered → design            |
| 20  | Tapping locate again should zoom to me         | `focus` pans and never zooms (ADR-0121 §7), so a second tap on an already-centred map does nothing visible                                                                                                                                                                                                                                   | Phase 3's zoom ladder                  |
| 21  | Past places should fade in the list too        | The row fades on a **human's** `skipped` only (`Map.tsx:1394`); the pin fades on the **clock** (`PIN_TIER.behind` → `PIN_TIER_CLASS` → the `skipped` class → `saturate(.3)`). Canvas and list disagree about "behind you" — session 144's finding, from the other side                                                                       | **Defect** (asymmetry)                 |
| 22  | Booking phases labelled on the map             | The mechanism is built and has **two users**: `.pin-tag` renders `עכשיו` / `היעד הבא` (`MapPane.tsx:186`), and ADR-0063's `transitionLabel`/`eventTransitionKeys` already own the words (`צ׳ק-אין`, `המראה`). What is missing is the pre/during **vocabulary**, not a mechanism                                                              | New surface: design                    |
| 23  | The `X באזור` label could be a button          | `role="status" aria-live="polite"`, 11.5px, `padding: 5px 10px` ≈ **24px tall** (`map-pane.css:400`) — under design-language's 44×44 floor, and a live region is the wrong role for a control. Also: ADR-0106 §4 said pan/zoom **is** the area filter and no chip would ever be built                                                        | Decision + design                      |

### CORRECTION (2026-07-28, owner-caught): #18 is about the search **surface**, not pin syncing

**The trace below is true and describes the wrong problem.** The Map tab's search is `SearchOverlay` —
ADR-0101's full-screen `Modal` `'full'` variant, shared with the Index — which **covers the canvas
completely**. So "typing changes the list and the canvas does not move" describes a symptom **nobody can
observe**: the map is not on screen while you are searching. The report ("search as an overlay of maps so
that you instantly see them on the map") is about the surface — search should overlay the map rather than
replace it — and pin syncing is a consequence of that, not the job.

Two conclusions in this note are wrong as a result, and `backlog.md`'s Phase 10 line carries the corrected
version:

- **"No new shape, cheap"** — wrong. It is a layout change on the canvas whose control budget ADR-0122
  just spent a design session setting, so Phase 10 is a **design session with a mockup**, then a build.
  The `docs/planning/…-145` handoff written from this trace claimed "this changes no layout"; it changes
  the layout entirely.
- **"Not cost-gated"** (below) — half right, and the half it drops is a scoping call. The trip-places
  half really is free. But both halves share **one overlay**, so reshaping it is where Phase 6a's #7
  ("search needs a map") lives: the design either covers both, inheriting 6a's gate for the **research**
  half only, or scopes itself to Trip mode and leaves Plan mode's overlay alone.

What survives unchanged: the **day-scoped-grammar defect** really is free and really was parked behind the
wrong gate. It is now standalone rather than folded into Phase 10 — it is a wrong context object with no
design content, and pinning it to a design session was the over-correction.

**The lesson worth keeping:** this trace followed the data flow (`query` → `searchRows` → not `pinsNow`)
and never asked what is on screen while the flow runs. A trace that reads the plumbing but not the surface
can be correct in every clause and still phase the work wrongly.

### #18 is not gated by Phase 6a, and that unparks a defect

Worth stating plainly because the plan currently implies the opposite. **Phase 6a's blocker does not
apply here.** #7's cost problem is that a Google Autocomplete _prediction_ carries no coordinates, so
mapping one needs a paid Details call before the pick. The Map tab's own search is a different search:
it runs over `allUsages` — **places already in the trip**, which already carry `lat`/`lng` because
that is what put them on the canvas. Drawing a search result on the map costs nothing and calls nothing.

So the [session 144](2026-07-27-session-144-what-is-left-means-somewhere-you-can-go.md) defect parked
behind the cost gate — the Map's search rendering in day-scoped grammar, where a hit from another day
shows no day at all and files under `ללא יום` — does not have to wait. It is the same surface as #18,
so the two become one phase, and that phase can run whenever. Phase 6a still owns the **picker's**
search, which is genuinely cost-gated.

### #16, and why dropping the number is the right answer rather than renumbering per day

Three options, and only one survives §6's own invariants. **Renumber per day** (`1..n` within each day,
repeating) breaks the canvas: two pins both reading `1` on one screen, with nothing on the pin saying
which day either belongs to. **Keep the trip-wide sequence** is what ships today, and `27` is the report.
**Drop it in all-days** is the fix — and the reason it is not a loss is that all-days rows already carry
`relativeDayLabel` (session 136), so the day is stated in words exactly where the number would have been
ambiguous. One guard in `buildPinOrderIndex`, and both halves lose it together because they read the same
map.

Two consequences to note rather than discover: `pinZIndex`'s `ORDER_SPREAD` nudge goes inert in all-days
(fine — the tier z-order still holds, and the nudge only ever ordered _within_ `upcoming`), and
`.map-badge[data-order]` simply stops rendering, which it already does for every unnumbered row.

### #21's trap is the fade session 137 just removed

The obvious implementation — reuse `.place.skipped` for past rows — is wrong twice over, and both ways
have already cost a session.

- **It re-fades what session 137 deliberately un-faded.** ADR-0109's 2026-07-27 amendment took the quiet
  treatment off the **ambient** tier precisely because "the one place you are guaranteed to come back to"
  was reading as finished. A fade keyed on "quiet" instead of on the **clock** walks straight back into it.
- **It conflates an outcome with a time.** `.place.skipped` means _a human said this did not happen_
  (ADR-0117 §4). "Behind you" is the clock. They coincide often and are not the same claim, so the row
  wants its own `behind` class — and a skipped-and-past row must not stack two opacities.

The block header `מה שמאחורינו` already says it in words, so the fade is a reinforcement, not the
message: keep it light, and let `isDayUsagePast` — the one predicate ADR-0124 already made the single
answer to "is this closed" — decide it, so the row, the pin, the block and `מה נשאר` all close a place
at the same instant.

### #17: plan for "implement it", not "enable it"

Same posture session 135 took on the my-location button, and for the same reason. Google's web gesture
set is documented as pinch-to-zoom, double-tap to zoom in, and two-finger tap to zoom out; the
tap-then-press-and-drag one-finger zoom the report describes is documented for the **Maps SDK for
Android/iOS**, and other web map libraries (MapLibre, MapTiler) ship it as their own handler rather than
inheriting it. **Reconfirm against live docs at the head of that session** — the docs page 403s through
this sandbox's proxy, so this is a search-level finding, not a read of the reference — but budget for
building it.

Two things make it a phase of its own rather than a line in Phase 3:

- **It is input arbitration, not camera tuning.** The screen already has a vertical-drag consumer — the
  sheet's drag region with its slop threshold, window listeners and capture-at-drag-start (ADR-0122) —
  and under `greedy` Google owns one-finger drag on the canvas. This repo has arbitrated a drag against
  a competing gesture five times (sessions 115, 116, 119, 122, 125) and has scars from every one.
- **Anchoring is a real decision.** Google Maps anchors the zoom at the tapped point; zooming about the
  canvas centre is far cheaper and may read the same on a phone. Decide it in the ADR, don't discover it.

### #22 reuses everything and still needs a design session

The reuse story is unusually complete — `.pin-tag` (the element), ADR-0063's `transitionLabel` (the
words), `deriveNow`/`eventPhase` (the pre/during distinction), and `MAP_PIN.TAG_RISE` (the room the
camera already reserves above a pin for exactly this ink). Nothing new has to be invented. What has to
be **decided** is what makes it a design session:

- **The tag slot is already occupied.** A pin renders `עכשיו` or `היעד הבא` there. A phase label competes
  with both, and they are not mutually exclusive with it.
- **The amber budget breaks if every booking gets one.** ADR-0028 and ADR-0105 both say amber is an
  accent, not a ground. Two amber pins on a canvas is a cue; eight is a colour scheme.
- **Tags overlap sooner than pins do.** Session 143 left "look at a dense all-days day" open for pin
  size at 56px; `התחנה הבאה` already measures 1.10× the pin's height _per side_ (`constants.ts`'s note
  on why the tag is excluded from the camera's horizontal inset). N tags on a dense day is that problem
  multiplied.

It also **absorbs the hotel-changing-day follow-up** already on the backlog: that item is precisely "a
day with a check-out and a check-in, viewed ahead of time, has no cue distinguishing them", and a
pre-check-out / pre-check-in phase label is that cue. The owner's own "next phase maybe small cute
specific animations" is taken as an explicit deferral — the `nowstop` pulse is the only motion on the
canvas today, and adding more is a separate call under design-language's reduced-motion rule.

### #23 is a product question wearing a CSS problem

"Make it a button" is two decisions, not one. The mechanical part is small and not free: at ~24px the
readout is under the 44×44 floor, and `role="status"` + `aria-live` is a live region, which is the wrong
role for something tappable — a control that also announces its own changes needs both, carefully.

The part that needs the owner is **what it does**. ADR-0106 §4 decided that pan/zoom _is_ the area
filter and that no area chip would ever be built; a tappable count is arguably that chip arriving
through the back door. The plausible jobs are different enough to matter: _scope the list to what is in
view_ (the chip §4 declined), _fit the camera to the in-view pins_ (nearly a no-op), or _raise the sheet
and scroll to the first of them_ (a way in, not a filter). That is a question for the owner, and it is in
the list below.

## Where each one lands

| #   | Report                       | Phase                                                  |
| --- | ---------------------------- | ------------------------------------------------------ |
| 16  | all-days numbering           | **Phase 7** (new) — build                              |
| 21  | past rows fade               | **Phase 7** (new) — build                              |
| 19  | two controls, not one        | **Phase 8** (new) — design; behaviour lands in Phase 3 |
| 23  | `באזור` becomes a button     | **Phase 8** (new) — design                             |
| 20  | locate zooms on a repeat tap | **Phase 3** (existing) — joins the zoom ladder         |
| 17  | one-finger zoom              | **Phase 9** (new) — reconfirm, design, build           |
| 18  | search overlays the map      | **Phase 10** (new) — design (mockup) + build           |
| 22  | booking phase labels         | **Phase 11** (new) — design + build                    |

### The sequencing, and the one dependency that matters

**Phase 7 first** — it is the new cheap half: two defects, both decided, one build session, no new shape.
Phase 1 played exactly this role in the second pass and it is why that pass moved.

**Phase 8's design gates Phase 3's build, and does not gate anything else.** Phase 3 has to know whether
it is implementing two controls or one before it writes `recentre`, and it is a layout question — how
many controls the canvas carries and where — which is the thing ADR-0122 just spent a design session
budgeting. Phase 3 was always going to have an ADR written at its head with no mockup (a zoom level only
means something on a real map); Phase 8 is the mockup half that has to precede it. They then share one
device pass, along with everything else in Phase 3's tuning cluster.

Phases 9, 10 and 11 are independent of all of the above and of each other. This note originally called
**Phase 10 the cheapest of the three** and the natural filler between the device-gated ones; the correction
above retires that claim — it is a design session about a surface, not a cheap build. What is left as the
natural filler is the **day-scoped-grammar defect**, now standalone, which really is small and really does
wait on nothing.

## Open questions for the owner

- **#23** — what does tapping `X באזור` do: scope the list to what is in view, fit the camera to it, or
  raise the sheet and scroll to the first one? The first is the area chip ADR-0106 §4 explicitly declined,
  so choosing it is a reversal worth stating.
- **#22** — when a pin is both "now" and a booking phase (you are mid-check-in), which tag wins, or do
  they compose? And does a phase label appear on **every** booking pin in range, or only the nearest one
  in time — the amber budget answers differently for each.
- **#19** — where does the second control go? The canvas's top corners are both spent (`באזור` at
  inline-end, re-centre opposite it), and ADR-0122 just decluttered this surface to three controls at rest.
- **#17** — is zooming about the **canvas centre** acceptable, or must it anchor at the tapped point like
  Google's? The first is a fraction of the work.

## Not done here, deliberately

No code, no ADRs — the same call session 135 made, and for the same reason: three of these five new
phases exist **to make a decision**, and writing those decisions now would front-run the design sessions
and the device pass that are supposed to produce them. The amendments each phase owes
(ADR-0121 §6 for #16, §7/§12 for #19/#20, ADR-0117's row vocabulary for #21, ADR-0106 §4 for #23) land
with their builds, where they can state what was actually built.
