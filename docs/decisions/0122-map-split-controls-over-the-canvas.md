# 0122 — The map split earns its screen: the controls leave the layout, the height axis becomes usable, and the location prompt moves onto the canvas

**Status:** Accepted — **built 2026-07-27 (session 141)**; §1–§9 needed no reversal. **§1/§2 amended 2026-07-28 by [ADR-0126](0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md)** (the furniture band) and again by **[ADR-0131](0131-map-search-is-a-control-not-a-screen.md)** (the row's disclosure slot gains a second occupant: the query takes the row instead of opening a screen, and the search button stops being a way out of the tab — §2's third resting control keeps its place and changes what it does). ADR-0131 also runs **§7**'s sheet-normalisation rule in a fourth case and, for the first time, in both directions. See the [amendment note](#amendment-2026-07-28-adr-0131--the-query-is-the-rows-second-occupant) below. See the [Build log](#build-log-2026-07-27-session-141) for what the build refined, the one place it read against the letter (§7's bottom camera inset, deferred to Phase 3 rather than bought with a prop that flips on a tap), and the one file the Consequences list missed. The **numbers** still want a phone — see [The device pass](#the-device-pass-and-what-it-owns), which is unchanged and unspent.
**Date:** 2026-07-27
**Amends** [0121](0121-embedded-map-phase-6-design.md) **§5** (the shell it designed: the filter row + sort strip stop being the split's fixed header, the stops change shape, and the drag gets a real target), and touches **§7** (the fit's top inset grows by the controls row), **§8** (its full→half rule is reused verbatim for the location prompt), **§12** (the pane's floating furniture moves below the row).
**Refines:** [0109](0109-map-tab-design.md) §1 (its "filter chip row → scope/sort strip" pair dissolves: scope goes over the canvas, the sort goes to the sheet, the scope-hint sentence retires) and §6 (the pre-prompt's home, not its rule — it stays inline, as the session-105 amendment settled), [0100](0100-index-bookings-header-search-redesign.md) §3 (its cover-the-row-in-place shape returns here, for facets rather than for search — [0101](0101-index-search-mode-and-header-titles.md) superseded it on the Index for a reason that does not apply to a facet strip; see §2), [0017](0017-mobile-first-device-targets.md) (the drag target finally clears the touch floor), [0038](0038-icons-and-canonical-category.md) (the category glyph is the whole vocabulary, so the chip drops the word), [0119](0119-map-maybes-facet-is-the-shelf.md) (the collapsed filter control carries no count, deliberately), [0096](0096-per-domain-claude-md-guides.md) (extend `ChoiceGrid` / `SnapStop`, don't fork them)

Mockup: [`mockups/map-split-v2.html`](../../mockups/map-split-v2.html) — the tab in the **real layout tree** (`.app` → `.header.mode-chrome` → `main.body.is-fullbleed` → `.map-screen.is-split` → `.map-split` → pane + sheet → `.nav`), at three phone sizes, with a **live measured height budget** and a working drag. Its entry in [`design/mockups.md`](../design/mockups.md) carries the detail.

## Context

Phase 6 shipped (session 133), got three production fixes (134) and four more in sessions 136–139. Then the owner used the finished tab on a phone and filed fifteen reports; three of them are this phase (`planning/2026-07-26-session-135-…`):

1. **מפה קטנה מדי, רשימה קטנה מדי** — the map and the list are both too small.
2. **הגרירה בין שני המצבים לא נוחה** — moving between the sheet's heights is unpleasant.
3. **מיקום אישור שיתוף מיקום לא נוח** — the geolocation pre-prompt is in the wrong place.

Plus a fourth thing the owner said while this session was designing: the filter chrome — categories, `אולי`, `מה נשאר`, search, `כל הימים`, `קרוב עכשיו` — **is cluttered and takes too much room**, and the controls can render **over** the map rather than above it, as long as they do not cover pins.

### The trap this session was warned about, and what was done about it

Session 131's Phase-6 mockup read the app's real stylesheets and still designed something unbuildable: it silently supplied a flex column `.map-screen` did not have (ADR-0121 revision 5 — _"a mockup that reads the app's CSS still does not inherit its layout tree"_). Phase 2 **is** a layout-tree change, so every number below was measured in Chromium against `AppShell` + `BODY_FULLBLEED` + `.map-split` **as they actually nest**, including the `.nav` and the `<main class="body is-fullbleed">` element that the Phase-6 mockup did not have at all.

That is not pedantry: those two omissions are exactly why nobody noticed that **370 of 844 phone pixels are spent before either half of the split gets one.**

### The measured budget, as shipped

Phone at 390×844 (a PWA's `dvh`, so no OS status bar), Trip mode, one row of avatars, no day-context ribbon:

| Element                                         |  Height | Charged to         |
| ----------------------------------------------- | ------: | ------------------ |
| `.header.mode-chrome` (mode bar + trip + strip) | **207** | both halves        |
| `.nav`                                          |  **69** | both halves        |
| `.map-filter-row` + `.map-sortstrip`            |  **94** | both halves        |
| `.map-split` — what is left to divide           | **474** | the map + the list |

And what the stops then do with 474 (a `.place` row is 82px including its margin):

| Stop   | Pane | List viewport | Whole rows |
| ------ | ---: | ------------: | ---------: |
| `peek` |  358 |            65 |    **0.8** |
| `half` |  208 |           214 |        2.6 |
| `full` |    — |           423 |        5.2 |

Three facts fall out, and they reframe all three reports:

- **The `half = 0.56` fraction was never the villain.** It splits what is left almost exactly in half. What is small is _what is left_.
- **`peek` does not show one whole row** — 116px minus the sheet's own 51px top is 65px, i.e. 0.8 of a row. The stop whose job is "handle + a row or two" (ADR-0121 §5's words) shows neither. §7 then asks what that row is worth at all, and retires it.
- **In Safari (734 usable) the same layout gives `half` a 160px map and 1.9 rows; on a 360×640 phone, a 119px map and 1.2 rows.** At that point the split is two strips, not two views.

## Decision

### 1. The controls leave the layout and become canvas furniture

`.map-filter-row` + `.map-sortstrip` stop being the split's fixed header. One row, **absolutely positioned at the top of `.map-split`**, over the canvas. The consequences, measured at 390×844:

| Stop                    | Pane (was → is) | List rows (was → is) |
| ----------------------- | --------------: | -------------------: |
| `peek` → **`map`** (§7) |   358 → **517** |     0.8 → **0** (§7) |
| `half`                  |   208 → **250** |        2.6 → **3.2** |
| `full`                  |             n/a |        5.2 → **5.7** |

The split becomes the whole body (474 → 568), so **every stop gains**, and the map runs _underneath_ the controls instead of starting below them. On the small phones the relative gain is larger, not smaller (`half`'s pane +26% at 390×734, +34% at 360×640) — which matters, because that is where the shipped split fails worst.

**Merging the two rows into one _inside_ the layout was the first draft, and it is not enough.** Measured, it recovers 94 → 66px, i.e. **28px**, split 56/44 by the stop: at `half` that is +13px of map and +16px of list, about 6% each. The report is not "6% too small".

**The header does not collapse or move per stop, and the row is the same row at every stop.** Two reasons, both concrete: every control in it changes _both_ halves (ADR-0121 §6 — one derivation, one filter layer, so a chip that changes the list changes the pins in the same pass), so it belongs to the split rather than to a half; and a height above the split that changes with the stop would relayout the _canvas_ on the one gesture ADR-0121 §5 deliberately made relayout-free.

**Pins are kept out from under the row by the camera, not by the layout.** ADR-0121 §7 already insets the fit by a pin's own height, because the teardrop's tip is the anchor; that inset now also carries the controls row. `MAP_FIT_PADDING.top` is **derived from the same constant that writes `--map-controls-h`**, so the two cannot drift apart — the mockup's ⟨אזור שהמצלמה שומרת פנוי⟩ state draws the band this produces.

Two honest limits on that promise, both stated rather than papered over:

- It governs a **fit**. A manual pan can still put a pin under the row, and nothing can prevent that on a map larger than its frame. The row is mostly transparent gaps between chips, so a pin under it stays visible; a pin under a _chip_ is not tappable there, and its row in the sheet is.
- **`fitPaddingFor` (session 134) drops padding that would claim half an axis.** A ~118px top inset on a 250px pane is nearly half, and more than half on a small phone — so at `half` the inset will sometimes be dropped and a fitted pin _can_ land under the row. This is a build check, not a surprise, and it is one more argument for the axis: at `peek` the pane is 420px and the inset is cheap.

**At `full` the sheet stops below the row instead of covering it** — otherwise the list you are reading cannot be filtered. Behind the row at that stop is the split's own `--screen` backdrop, which is the sheet's background too, so the same row reads as the list's ordinary header. One treatment, no second grammar, and no scrim: the map shows _between_ the chips, which is the whole point of moving them there.

### 2. Three controls at rest, not seven

Six chips and a search button over a 200px map is chrome, not a map. At rest the row carries:

**`🗓️ כל הימים` · `סינון` · `🔍`** — the day scope (the tab's mode pivot, ADR-0109 §1), one filter control, and search.

- **The facets open in place, on one tap.** Tapping `סינון` replaces the row's contents with the facet strip and a pinned `✕`. That is ADR-0100 §3's cover-the-row-in-place shape — **and ADR-0101 superseded it on the Index**, so the citation needs its correction rather than its authority: search-in-place failed because "once the on-screen keyboard opens it covers most of the remaining screen, hiding almost every result. There was no room in that design for the keyboard at all." A facet strip has **no keyboard and no result list** — its results are the pins and the rows already on screen — so the reason that killed it for search is the reason it is right here: the change has to be visible while you make it, which is what a full-screen overlay cannot do. (The shipped CSS for it is gone with the mechanism, so this is new CSS in the app's own naming, not a revival. `Collapsible` is vertical disclosure and does not fit.) A close control you have to scroll to reach is not a close control, so the `✕` sits at the row's fixed end, where the search button was.
- **The category chips are glyph + count, with no word.** The glyph _is_ the category's whole vocabulary here (ADR-0038), and the row badge and the pin already carry the same glyph — so the word beside it states the same thing twice, and that duplication is most of why the shipped row is as wide as it is. Measured: all six categories plus `הכל` fit one 390px row with the `✕` pinned, where the shipped worded pills fit two and a half. `הכל` keeps its word because it has no glyph. **The label stays as the button's accessible name** — a `compact` flag on `ChoiceGrid` (extend the primitive, ADR-0096), not a CSS trick that would leave a pill named by its count alone.
- **`אולי` and `מה נשאר` keep their words and their counts**, unchanged, inside the strip. Their relative order is the shipped row's order; nothing about which facets exist or what they count changes here (ADR-0119's coupling included).
- **The collapsed control says that it is filtering, and carries no number.** At rest it reads `סינון`; with a facet on it states _which_ facets are on and takes the mode accent (`--idx-accent`), because a filter that hides the fact that it is filtering is the defect ADR-0119 exists to prevent. It carries **no count**: the open strip already answers "how many", and a fourth number would be a fourth thing to keep coupled.
- **`.map-scopehint`'s sentence retires** (`המקומות של היום` / `כל המקומות בטיול`). The chip's own on/off state says it, and the day strip above already drops its filled selection while all-days is on (session 81's `allScope`).
- **The free whole-day `מסלול היום בגוגל` link rides with the connector** — Plan mode + day scope only, exactly the state where the dashed day line is drawn (ADR-0121 §10). It is about the shape on the canvas, so it lives on the canvas.

**`קרוב עכשיו` moves to the sheet's own top row, beside the `רשימה · מפה` toggle — and is absent at the map extreme.** It is neither a filter nor a scope: it re-orders the list and adds distance chips — session 138 split `located` (a fact) from `sortByDistance` (an intent) precisely to say so. So the rule is **scope belongs to the tab, filters belong to the split, sort belongs to the list**, and the sheet's top row is fixed, visible at every stop, and costs no height (the row already holds the toggle at 28px). Offline the chip is still absent, unchanged (ADR-0109 §7). **And at the `map` stop it is absent too**, because there is no list on screen for it to re-order or to annotate with distances: a control whose effect is invisible is the "button that looks like it does something and does nothing" that ADR-0109's session-105 amendment refused. Nothing is lost by hiding it there — what carries the _fact_ on the canvas is the **"me" dot**, which comes from `located`, not from the sort intent (session 138 split the two precisely so this could be said), and the chip and its `לפי קרבה אליך` header are both back at `half`. **One handoff to state:** with the chip gone at that stop, the canvas has no way to _ask_ for the permission there, since ADR-0121 §12 makes the re-centre control re-frame and never locate. The way in is one tap on the toggle — and Phase 3 is already scoped to give the canvas its own answer (report #5: re-centre centres **and** zooms, and routes to the same reason-first card when it has no permission), which is exactly the missing piece, in the very next phase.

### 3. The stops: derivations first, numbers second

`MAP_SHEET_STOPS` keeps its shape (the bottom stop in px because fixed chrome is the same size on every screen; `half` a fraction because a proportion should not be) and gains one variant:

- **`peek` is retired, and the map extreme becomes the sheet's own top row and nothing of the list** (see §7 — this is the owner's second steer, and it is the one place where a first draft of this ADR was overturned rather than refined). Named **`map`**, after the word the toggle already uses for it. Its height is the sheet's top chrome — the handle, `קרוב עכשיו` and the view toggle — reserved from a single constant (`MAP_SHEET_STRIP_H`) that also writes the CSS `min-height`, so a taller top can never clip: **52px measured**, which gives the map **517px** of the 568 split at 390×844, against 358 shipped.
- **`half` keeps `0.56`.** The measurement is the argument: once the controls leave the layout, 0.56 lands on **3.2 whole rows and a 250px map** on the baseline phone. Whether it should lean list (0.56) or map (0.5) is a judgement about a _rendered_ map, which is the device pass's, not a desktop viewport's.
- **`full` becomes `{ inset: MAP_CONTROLS_H }`** — the container minus the controls row (§1). That is one new variant on `SnapStop` (`px | fraction | inset`), which `stopHeightPx`/`stopHeightCss`/`clampToStops`/`nearestStop` all read through the same two helpers they already use; the clamp then keeps a drag from pulling the sheet over the row for free.
- **The axis is still three stops and one gesture** — `map | half | full` — so the drag, the flick, the toggle's thumb and the splitter's arrow keys are unchanged by the rename. Verified in the mockup: a short fast flick down from `half` lands on `map`, the same drag done slowly stays at `half`.
- **The stops stay constants in `constants.ts`, never measured at runtime.** `screens/Map.tsx` re-renders every second; a layout measurement there is the anti-pattern `frontend/CLAUDE.md` names. The one number the CSS also needs (`--map-controls-h`) is **written by the screen from the TS constant**, so there is one source of truth rather than a literal on each side.

### 4. The drag: a region, a slop threshold, and a flick that commits

**The whole `.wp-snapsheet-top` is the drag target**, not the ~76×16px grab line, which is under ADR-0017's touch floor. Measured, that is 390×51 instead of 76×16. `touch-action: none` moves to the region; the grab line stays as the visible affordance.

Three mechanisms that only matter once the target is a region, all three implemented in the mockup so they can be felt rather than argued about — two of them are there because the mockup got them **wrong first**:

1. **A movement slop threshold is load-bearing, not a nicety.** Today `useSnapDrag` sets `moved` on the _first_ `pointermove`, and a finger emits moves on a tap — so a widened region containing the toggle (and now the near-me chip) would swallow their taps. Below `SNAP_DRAG_SLOP_PX` (~4px) the gesture is a tap and the click passes through; above it, it is a drag and the click that follows is suppressed.
2. **Pointer capture is taken at drag start, never at `pointerdown`.** Capture is still needed — it keeps the greedy canvas underneath from stealing the gesture, which is why `useSnapDrag` has it — but with capture active the following `click` is **retargeted to the capturing element**, so capturing early kills every tap inside the region. Harmless while the target was a bare handle with nothing to click; fatal now.
3. **The move listeners must sit on the `window`.** The region is ~51px tall and the gesture travels hundreds of pixels: two frames in, the pointer is outside it, and `pointermove` then bubbles from whatever is under the finger instead. This is a **partial** convergence with the shelf's `useHoldToDrag`, and it is still not an extraction: that hook listens on the window because its element can unmount mid-gesture, and it is hold-gated because a card is also a scroll surface. Neither applies here, so ADR-0121's build-log entry 5 stands — this remains the small dedicated hook, with a wider target.

**`nearestStop` gains a velocity term.** It measures distance only, so a real flick that travels little snaps back to where it started, which is most of what "the drag is unpleasant" means. Released at or above `SNAP_FLICK_PX_PER_MS` (~0.5 px/ms, sampled from the **last two** moves, not the whole gesture), it lands on the first stop strictly beyond the release height _in the direction of travel_, clamped at the extremes; below the threshold it is nearest-by-distance, exactly as today. A press with no movement still snaps nothing.

**The handle becomes a real ARIA splitter** (`role="separator"` + `aria-valuenow`/`aria-valuetext`), with ArrowUp/ArrowDown moving one stop and Home/End going to the extremes. Today it is a focusable button that does nothing on a keyboard, which means `half` is unreachable without a pointer.

### 5. The motion: the axis drawn, and one idiom for the furniture that comes and goes

ADR-0121 §5 says the toggle and the handle drive "one state, two controls, so they cannot disagree", and then renders `half` as _neither button on_, which reads as a broken segmented control. So the toggle's fill becomes a **thumb whose position is the stop**: at `full` it sits on `רשימה`, at `peek` on `מפה`, and at `half` it **narrows and centres** so it sits visibly _between_ the two labels rather than mostly over one. The `.on` fill moves to the thumb; only the ink weight still says which extreme is live. Under `prefers-reduced-motion` the thumb jumps.

**Three objects on this surface come and go, and they share one rule rather than growing three motion vocabularies on one canvas:** the sort chip leaving at the map extreme (§2), the place card arriving on a pin tap (§7), and the pre-prompt arriving on intent (§6). All three **rise ~4–6px and fade** at `--t-quick` (the token whose stated job is toggles), `--ease-standard` in and `--ease-exit` out. Two build details that are the decision rather than the polish:

- **The chip is hidden with `visibility`, not `display`, and stays mounted** — that is what lets _both_ directions animate, while still taking it out of the tab order and the accessibility tree and making it unhittable, because a control you cannot see must not be tappable. The switch to `hidden` is held by a `0s` delay until the fade finishes. Verified in the mockup: mid-fade at 60ms, settled and un-focusable after.
- **Stop-driven hiding animates; capability-driven absence does not.** The chip fades because it has nothing to act on _at this stop_; offline it is **unmounted** instead, unchanged, because it cannot exist at all (ADR-0121 §11's "absent, not disabled"). Two different facts, two different mechanisms, and neither borrows the other's.

App.css kills every transition and animation under `prefers-reduced-motion` with `!important`, so **the resting states have to carry the whole meaning** — the same lesson `map.css` already records for the `עכשיו` dot. They do here: present or absent is the entire state, and nothing is information only the motion conveys.

### 6. The pre-prompt moves onto the canvas; the refusal notice stays in the list

The geolocation pre-prompt asks a question about the **map** and renders inside `.map-sheet-scroll`, the **list's** scroll region — at `peek` that is a ~40px viewport (65px today, and the card is ~110px). It becomes canvas furniture:

- **Absolutely positioned inside `.map-split`, below the controls row**, so it costs the split **no** height: neither half shrinks, the pane's box does not change, and therefore **the camera does not move for it**. That is the deciding argument over the obvious alternative (a card between the controls and the split), which would shorten the pane while open and re-fit the camera under the reader.
- **A sibling of `.map-pane`, never inside it and never a wrapper around it.** Google owns the canvas div's children; and wrapping `<MapPane>` in a new element remounts it, which is a **billed** map load (ADR-0121 §4).
- **It stays inline, not an overlay** — no `Modal`, no `useOverlay`, no back registration, nothing dismisses it, both halves stay usable. That is ADR-0109's session-105 reading unchanged, and it puts the card in the same category as `.map-recenter` and `.map-areacount`, which already float over the pane without being overlays.
- **Not the pane's bottom:** Google's attribution is bottom-inline-start and the ToS forbids obscuring it (ADR-0106 §B).
- **One floating object over the canvas at a time.** While the card is open the `באזור` readout and the re-centre control are not rendered: a 250px pane cannot hold a card and two floating controls and still read as a map, and the card is transient (once per session, both of its buttons dismiss it). Done in CSS (`:has()`), deliberately, so `MapPane`'s props stay identity-stable on a screen that re-renders every second (`frontend/CLAUDE.md`).
- **Raised while the sheet is at `full`, the sheet drops to `half`** — the identical rule and reason as ADR-0121 §8's row-tap-at-full: a question about a map you cannot see lowers the sheet enough to see it.

**The denied / unavailable `StatusBanner` does not move.** It explains why the _list_ is in schedule order, so it belongs to the list's scroll region, where it is today. One card moves and one does not, and the split is exactly what each of them is about.

### 7. The list-sliver peek is retired; a tapped pin surfaces its place as a card on the canvas

Two questions the owner asked of the draft above: **when the map is maxed, what does the sliver of list add?** And: **tapping a pin should surface the place, but not necessarily on the list — it must not interrupt the interactive map.**

The first draft answered them with the peek row itself ("the row is where a tapped pin speaks"). That answer only holds **while something is selected**; with nothing selected the row is 97px of map spent on a row nobody asked for. So the peek loses the argument, and the design changes:

- **The map extreme shows no list at all** (§3). 517px of map instead of 420, and the sheet's top row stays — the handle, the sort chip and the toggle — so the list is always one gesture away, which is the part of ADR-0121 §5's "the sheet always peeks" that was ever load-bearing (its stated reason is that the list is the only view that works offline and the only one that can hold a coordless place; that needs the sheet to be **reachable**, not to be showing a row).
- **A tapped pin's place surfaces as a card over the canvas, and nothing moves.** The pane's box does not change, so the camera does not shift, no re-fit fires, and the map keeps every pixel — which is precisely the "don't interrupt" requirement, met more completely than the peek row met it.
- **The card is the row, not a new object.** Same `.place` markup, same badge/name/meta/distance/`נווט`, and the same way-in block revealed by selection (ADR-0121 §8) — so acting on a reference no longer needs the sheet to move at all. One grammar, two hosts, exactly as the pin is the list badge in a second form factor (ADR-0109 §3).
- **It generalises a mechanism the app already ships.** `.map-ghostrow` surfaces a tapped ghost as "the one row it is — reusing `.place` rather than inventing an info window", because its row is not in the sheet. The card is that rule with the special case removed: **the row surfaces wherever the sheet cannot show it**, and a ghost is simply the case where it is not in the list either. One mechanism fewer, not one more (rule 8).
- **It exists exactly where the list cannot show the row, so it never doubles it.** At `map` the sheet shows no rows, so the card carries the selection; at `half` and `full` the row is in the list and gets scrolled into view as it does today, and no card is rendered.
- **The card clears Google's attribution by the attribution's own height.** The logo and terms link are drawn at the bottom-inline-start of the **map div** and the ToS forbids obscuring them (ADR-0106 §B) — the same constraint that decided §5's pane sizing in ADR-0121. Measured in the mockup: the attribution sits 13px clear below the card. Its clearance is a named constant, not a hand-tuned offset, and the card's `bottom` is measured from the **pane's** bottom (i.e. it includes `--sheet-h`), because its containing block is the split, whose bottom is the screen's.
- **Dismissal is the map idiom:** tapping the canvas background clears the selection, and selecting another pin swaps it. Nothing registers with the back stack — it is not an overlay, for the same reasons the sheet is not (ADR-0121 §5, ADR-0103).
- **The card's body is inert; its buttons are not.** There is nowhere for a tap on it to "go" — it already shows everything the row shows, way-in included — and raising the sheet from it would take away the map the card is sitting on.
- **This revises the raise session 136 shipped** for report #4 ("the list doesn't focus what's marked, especially when minimized"). That fix was right that both directions must show what you selected, and it used the only mechanism a 65px viewport allowed. With the peek retired the raise is exactly the interruption being reported, and the surviving half is the scroll: at `half`/`full` a pin tap still scrolls its row into view.
- **One rule covers both directions: a tap never takes away the surface it was made on.** A **pin** tap moves nothing (the card answers on the canvas). A **row** tap normalises the sheet to `half` — from `full` because the map it focuses is invisible there (ADR-0121 §8, unchanged in substance), and from `map` because a row tapped in a list belongs in its list. That is a better formulation than "the raise mirrors the drop", which is what session 136 reached for: symmetry of _mechanism_ was never the goal.

> **Amended 2026-08-06 — "nothing moves" is a rule about the CAMERA NOT BEING GRABBED, not a licence to sit on the pin. And the fix that was supposed to have landed the day before was inert.** Owner, on a screenshot of the card at the `map` stop: _"Simply doesn't work. See that the card for נמל התעופה בן גוריון completely covers the pin"_ — then, on the latest build: _"Not panning in full map when clicking on a pin. Not panning when selected on half/full list and then scrolling to full map."_
>
> The bullet above was written when the card was a **73px row**, and every argument in it is about not taking the map away from under your finger. The card has since grown a summary (ADR-0167 §9.3), a note section (ADR-0153 §8) and a way-in block, so the literal reading now produces the exact failure the bullet exists to prevent: **the surface the tap was made on is the pin, and covering it is taking it away.**
>
> **Two independent defects, and the owner's two sentences are one each.**
>
> **1. The pan was reading a reserve of 0 — on precisely the gesture it exists for.** [ADR-0128 §2's 2026-08-06 amendment](0128-map-camera-fit-padding-and-zoom-tuning.md) taught the pan to clear the card, and moved the screen's measurement into a `useLayoutEffect` on the reasoning that layout effects all precede passive ones, so the number would be committed before `MapPane` panned. **That reasoning is wrong, and it took an experiment to see it:** setting state from a layout effect schedules a _synchronous_ re-render, and React flushes the **pending passive effects of the commit already done** before starting it. So the child's pan — keyed on the new selection — ran against the previous render's value. Reproduced in isolation (a parent measuring in `useLayoutEffect`, a memoized child storing the prop in a ref during render and reading it in an effect keyed on the selection): the child sees `0`, every time. The whole feature was inert, and nothing in the suite could tell, because every camera test handed the reserve in as a settled number.
>
> **The cure is to stop routing a measurement through React state.** The camera now takes the reserve as a **getter** and calls it when it moves, so the card it clears is the card that is on screen — correct under any effect ordering. That is this repo's own recurring lesson (`frontend/CLAUDE.md`: "a landing position written as a constant instead of measured", three prior instances) arriving in a fourth disguise: the value was measured, and then staled by the transport. The regression test asserts the property rather than the plumbing — a reserve that is 0 at mount and non-zero when the move runs must still clear the card.
>
> **2. Nothing fires at all when the card arrives over a selection already made.** `MapPane`'s focus effect is keyed on the selection _on purpose_ (a re-render must never re-move the camera), which leaves a hole no pan can fill: **selecting in the list and then dragging the sheet to the map extreme** raises a card and changes no selection — the owner's second sentence, exactly — and an enrichment or a note list landing in an open card makes it taller under a pin that was clear a moment ago.
>
> **So the second half is a NUDGE, keyed on the card's reserve rather than on the selection** (`nudgeToClear`, beside `panShiftForReserve`). A place already inside the visible band moves the camera **not at all** — the common case is a projection read and no write — and one outside moves by the smallest amount that clears it, landing on the band's edge rather than being re-centred. That is what makes it compatible with this section rather than a reversal of it: the rule survives exactly where it was aimed (a pin tap on a pin you can see still moves nothing), and stops applying where it had turned into its own opposite.
>
> Two guards keep it from becoming a second camera driver fighting the first (ADR-0129 §3): it **stands down while an ease is in flight** — that move already chose its destination with the reserve in hand — and it reads the reserve through the **same getter**, so the two halves cannot disagree about how big the card is.
>
> **One more thing the build found, recorded because it fails silently rather than loudly:** `map.getCenter()` returns a `google.maps.LatLng`, whose `lat`/`lng` are **methods**. Handing that to `fromLatLngToPoint` where every other call site in the file passes a literal yields `NaN` through the arithmetic and a nudge of **0** — a no-op that looks exactly like "nothing was owed". Caught only because the fake map in the suite is stricter than Google is.
>
> **Not fixed here, and worth its own look:** the card is simply large. Measured off the report at the `map` stop it takes well over half the canvas, and a nudge that has to move the camera on most selections is a symptom of that as much as a cure for it. What it spends most cheaply is an **empty** note section, which costs a header and a "no notes yet" line to say nothing.

**This closes ADR-0121 §8's open question — with a yes, and with the thing that question was protecting.** §8 asked whether a pin tap should reveal the entries "on the canvas (an info window) or only via its row", worrying that an info window is "a second way of stating a place". Judged: **on the canvas, as the row** — so the map idiom's benefit arrives with no second vocabulary, no new component, and one fewer special case than the app ships today.

**One camera consequence for the build:** while a card is shown, the fit's **bottom** inset should carry it, derived from the same constant, exactly as the top inset carries the controls row (§1) — with the same honest limit, since `fitPaddingFor` drops padding that claims half an axis. Focus is unaffected: it centres the pin, and the pane's centre is well clear of a bottom card.

### 8. The list-only path keeps the same row, in ordinary flow

Offline, or with no build config, there is no split and no sheet — the tab is "the list it has always been" (ADR-0121 §11). The same controls component renders `position: static` above the list (`.map-controls.in-flow`): **one component, two positionings, never two components.** It is also the one place where `קרוב עכשיו` cannot live in the sheet, because there is no sheet — so on that path it renders in the flow row (and offline it is absent anyway). `Map.test.tsx` runs with no build config on purpose (`frontend/CLAUDE.md`), so this path stays tested as such.

### 9. What this does not touch, and one thing it names

**The two standing constraints survive unchanged**, and both are the reason several of the choices above are shaped the way they are:

- **`--sheet-h` is still written from the SNAPPED stop height**, so a drag costs no relayout and the pane resizes on snap. The live drag height stays on the sheet element itself, as today.
- **Nothing here re-creates the `google.maps.Map`.** No new wrapper around `<MapPane>`, no new prop that flips on a tap, no `mapId` change, no remount. A re-instantiation is billed (ADR-0121 §4).

**The elephant, named and left alone: the app chrome is 276px of a 390×844 phone** (207 header + 69 nav) — 33%, before the tab's own controls, and 43% of a 640px phone. It is the single largest consumer of the split's budget, it is shared by every tab, and it is not this tab's to change: the Map is a day-scoped surface precisely _because_ it uses the same header day strip (ADR-0109 §1). A condensing pass for full-bleed surfaces is its own design session, and it goes on the backlog rather than being smuggled in here.

## Amendment (2026-07-28, ADR-0131) — the query is the row's second occupant

**§2's "three controls at rest" is unchanged in count, and one of them changes what it does.** The search button no longer opens a full-screen overlay in Trip mode (ADR-0101's, which covers the canvas); it opens the **query in place**, in the same slot `סינון` covers the row with, behind the same pinned `✕`.

Four consequences for the sections above, all of them extensions rather than reversals:

- **§1's row is unchanged.** `MAP_CONTROLS_H` stays 46, `MAP_FIT_PADDING.top` stays derived from it at 118, and the field is 44 _inside_ the 46 — so the split pays no height, the camera reads the same number, and §1's honest limits are neither improved nor worsened.
- **§2's disclosure becomes one slot with two occupants**, expressed as one three-valued state rather than two booleans. Its citation of ADR-0100 §3 needed a correction for the facet strip ("a facet strip has no keyboard and no result list"); the query **does** have both, and ADR-0131 §2 is why that turns out to be the argument here rather than against it — the field is at the top of the split and the canvas is under it, so the keyboard eats the sheet and the pins survive.
- **§2's measurement is now the reason the obvious alternative is dead.** A _permanent_ field in this row was the phasing note's leading candidate. Measured against this tree, the row at rest leaves 163.5px in Trip mode at 390 but **12.8px in Plan mode + day scope, and −17.2px at 360** once the free `מסלול היום בגוגל` link rides along. So the field takes the row instead of joining it.
- **§7's rule gains its fourth case and its first two-directional one.** Opening search normalises the sheet to `half` from `full` (the canvas is the half the report is about) **and** from `map` (the list holds a coordless match the canvas cannot pin, and the day a ghost's teardrop cannot say). It fires on the open tap, never per keystroke.

## Amendment (2026-08-06) — §4's region gains the sheet's body, while the body cannot scroll

> _"There's currently a small stripe in the middle where you can scroll up/down to change between
> states. Sometimes there's a lot of free space that I feel like it would be easier and more
> intuitive to scroll from, for example when the list is empty or there's a large area that's
> empty."_ — owner, 2026-08-06
>
> And, on the first build, which answered with a spacer below the content: _"when the list doesn't
> scroll (or there's text that's not list items, for example the empty state has a glyph+text that
> doesn't allow us to scroll), we should be able to use the same gesture."_

**§4 widened the target from a 76×16px handle to a 390×51 region and stopped there.** 51px is a
real touch target and it is still the only one, so on a sheet whose list fits, the gesture is a thin
stripe over a large useless area. The report is right for the reason §4 already gave: this is a
gesture looking for the biggest honest surface.

### The rule: the body is a drag target exactly while it cannot scroll

**That one fact is also what makes this easy, and the first answer to the report was written as if
it were hard.** Dragging from a scroller genuinely is: `touch-action: none` is what lets a drag be
seen at all and is precisely what makes a list unscrollable, and the choice cannot be deferred to
the first move either, because a browser will not hand a native pan back once it has started one —
so the direction, which is the thing that would decide, arrives too late to use.

**None of that arises when the content fits.** No pan can start, so there is nothing to arbitrate
against, and the whole body is as safe a target as the handle row. The hard problem is real and it
is simply not this problem.

### What it replaced, and why the replacement is smaller

The first build was a `flex: 1 0 0` spacer after the caller's content, taking the space the content
did not. That is the same idea reaching a **subset** of the same cases, and it under-delivered on
the case the owner had named first: an empty state is a tall glyph-and-text block, so it leaves
little or no gap below itself while scrolling nothing at all.

So the spacer is gone, and with it the flex column it needed and the `flex-shrink` guard that column
needed — a scroller laid out as a flex column **compresses** content taller than its port instead of
overflowing, silently destroying the scroll on the one region this component has. One rule replaced
two mechanisms and removed a trap.

### Four things it is made of

- **One gesture, two targets.** The same `useSnapDrag` handler; the body wraps it in a gate.
  `e.currentTarget` is what the hook captures and swallows the click on, so the slop threshold, the
  late capture and the clamp are not re-implemented per target.
- **`data-drag` and a live read are two readers of one fact, deliberately.** The attribute carries
  `touch-action`, which the browser evaluates when a gesture **starts** — so it cannot be written
  when the press lands, and comes from a `ResizeObserver` on the body **and its children** (the
  body's box changes on a stop change, the content's when a row is selected and grows severalfold).
  The gate is the decision and must be current, so it reads the DOM at `pointerdown` and cannot be
  a frame stale.
- **Three exclusions, and each names a gesture that is already someone's.** The body scrolls → the
  list's. Something inside it scrolls on this axis → that scroller's (`scrollerWithin` stops
  _below_ the body, since the body is itself an `overflow-y: auto` box and a walk including it would
  always find one). The press is on an `input`/`textarea`/`select`/`[contenteditable]` → a caret or
  a text selection, and a sheet that moves under that is worse than no gesture; the Map's sheet
  holds a note composer on every selected row.
- **Two extractions rather than two new copies** (root rule 8): `lib/scrollable.ts` now owns the
  ancestor walk `useCenterSelected` had kept private, asked a second way; and `lib/observe-resize.ts`
  owns the five lines of `ResizeObserver` boilerplate that existed **three** times already — in
  `useShrinkToFit`, `CreateTrip` and the Map's card reserve, the last of which documented itself as
  _"the same trade `CreateTrip` makes"_, a comment admitting a copy. It is a function returning a
  disposer rather than a hook, because the callers differ in exactly what a hook would have had to
  own: `CreateTrip` must measure in a `useLayoutEffect` and every one of them has different deps.

### What it still does not do

**A list that fills the sheet has no drag.** That case needs overscroll chaining — the list runs out
of scroll and hands the gesture on — which is the genuinely hard problem above, and the one place a
drag and a scroll really do compete. The handle row and the view toggle both still work there, so
this is a convenience gap on dense lists rather than a dead end, and it is stated here so the next
reader knows it was scoped out rather than missed.

## The device pass, and what it owns

**The stops cannot be honestly tuned without a phone, and this ADR does not pretend otherwise.** What is decided here is the _shape_: what the controls cost, where they live, how the stops are derived, and how the gesture behaves. The numbers printed above are the derivations' output on a measured 390×844 baseline — a starting point, not a calibration. Specifically the device pass owns:

- **`half`'s fraction.** "Big enough to read a rendered map" is a legibility judgement, and the trade between 250px of map and 3.2 rows of list is a preference someone has to _feel_. It joins `MAP_ZOOM` and `MAP_REFIT_FILL_SHARE` in Phase 3's tuning cluster.
- **Whether the map extreme wants anything at all above the sheet's 52px strip.** The strip is derived, not chosen, but "is a bare canvas the right resting state" is a feel question — and it is the call the owner already made once on paper, which a phone can confirm or reverse.
- **`SNAP_FLICK_PX_PER_MS` and `SNAP_DRAG_SLOP_PX`.** A threshold in px/ms is roughly device-independent on paper; finger speed is not mouse speed, and a desktop drag is not evidence.
- **Whether the controls row reads as light over a real cloud-styled canvas**, and whether the place card reads as floating over it. The mockup's base is faked; our chrome over Google's own tiles is a contrast question a fake cannot answer.

## Consequences

- **Phase 2's build has a decided frame and no open layout question.** It touches `constants.ts` (`MAP_SHEET_STOPS`, `MAP_CONTROLS_H`, `MAP_FIT_PADDING`, the two drag constants), `lib/snap-sheet.ts` (the `inset` variant + the velocity term), `lib/useSnapDrag.ts` (region target, slop, window listeners, capture-at-drag-start, velocity sampling), `ui/primitives/SnapSheet.tsx` (the splitter role + keyboard, the header row), `ui/primitives/ChoiceGrid.tsx` (`compact`), `screens/Map.tsx` (the controls row, the disclosure, the pre-prompt's new home, near-me's new home, and the selection paths of §7 — the pin branch loses its raise, the row branch normalises to `half`, the card renders `renderRow` output over the canvas, and a canvas tap clears the selection), `screens/map.css`, `ui/primitives/snap-sheet.css`, `ui/domain/map-pane.css`.
- **The `peek` → `map` rename is a real (small) sweep**: `MAP_SHEET_VIEW`/`MAP_SHEET_ORDER`/`MAP_SHEET_STOPS`, the `[data-view='peek']` CSS selectors in `map.css`/`map-pane.css`, and the existing tests that name the stop. Worth doing rather than leaving a stop called `peek` that no longer peeks.
- **Three pure functions absorb most of the risk, so most of this is testable with no Google in the process**: `stopHeightPx`/`stopHeightCss` with the third variant, `nearestStop` with velocity (a table of release height × velocity → stop), and the fit padding's derivation. The gesture's slop/capture behaviour is testable through the existing jsdom `PointerEvent` shim (`src/test/pointer-events.ts`). What cannot be tested is what the canvas looks like — unchanged from ADR-0121 §13, and stated rather than implied.
- **`ChoiceGrid` gains a `compact` pills variant** that any future dense chip row can use, rather than the Map growing a second pill component (rule 8).
- **`SnapStop` gains a third variant**, which is what makes "a sheet that must not cover the thing above it" expressible at all — the next in-pane sheet gets it for free.
- **ADR-0109 §1's row anatomy is unchanged**; only the chrome above it moves. The list rows, the pins, the counts, the ordering and the derivation layer are all untouched: this is a layout and control-density change, not a content one.
- **The mockup is now the repo's layout-tree reference**, not just a CSS reference: it reproduces the shell and prints its own measurements. The next full-bleed design should start from it rather than from a standalone file.

## Alternatives considered

- **Merge the two rows into one, inside the layout** (the phasing note's first candidate, and this session's first draft). Rejected on measurement: 28px, ~6% per half, when the report is that both halves are too small. Its _shape_ survives — the merged row is what now floats.
- **Collapse the header as the sheet rises** (the phasing note's second candidate). Rejected: at `full` — the only stop where hiding the filters is even defensible, since the pane is hidden — it buys the list one row out of six, and it pays for that by resizing the canvas on a stop change and by hiding the filters of the list being read. Once the controls float, the arithmetic disappears entirely.
- **Keep the controls always-visible as glyph chips, with no disclosure.** Considered seriously, since it costs no taps. Rejected because eight chips plus a search button over the canvas is the clutter the owner reported, and because the summary chip keeps the state visible for the price of one tap on the _filter_, never on the read.
- **A `סינון` control that opens a sheet or a popover.** Rejected: an overlay for a chip row is a back-stack layer (ADR-0090) for something that must be visible _while_ you watch the pins change. Covering the row in place keeps the change on screen.
- **Put the whole controls row inside the sheet's top region** (so it travels with the list). Rejected: the filters change the pins as much as the rows, and at `peek` the sheet's top is 51px — the row would either blow the peek or vanish exactly when the canvas is the subject.
- **Give the floating row a scrim or a card background.** Rejected: it re-introduces the chrome the move was meant to remove, and the `--screen` backdrop at `full` already makes the row read correctly without one.
- **Anchor the pre-prompt to the bottom of the pane** (clear of the controls row). Rejected on Google's ToS: the attribution is bottom-inline-start and must not be obscured (ADR-0106 §B).
- **Suppress `באזור`/re-centre via a `MapPane` prop** instead of `:has()`. Rejected: the pane's props are kept identity-stable on purpose, and this is a pure presentation question CSS can answer.
- **Derive the stops from the measured row height at runtime** ("N whole rows, whatever a row is"). Rejected: it measures layout on a screen that re-renders every second, and it makes `--sheet-h` depend on a measurement instead of a constant, which is the one thing ADR-0121 §5 forbids.
- **Trim the app header on the Map tab** (drop the mode bar or the day strip to recover ~40–75px). Rejected as out of scope, not as wrong: it is cross-tab chrome, the day strip is _why_ the Map is a day-scoped surface, and doing it quietly here would be exactly the kind of drift the ADRs exist to prevent. Backlogged.
- **Raise the sheet on a pin tap** (what session 136 shipped, and the obvious symmetry). Rejected in §7: it takes away the surface the tap was made on. It was the right fix for a 65px viewport, where no row could be shown without moving.
- **Keep a one-row peek and let it host the tapped place** — this ADR's own first draft, and the reason §7 exists. Rejected once the question was put properly: the row earns its 97px only while something is selected, and the rest of the time it is map spent on a row nobody asked for. The card pays the same cost, on demand.
- **Size a peek to fit a selected row _with_ its way-in entries** (~198px, measured). Rejected for the same reason, twice over: 150px of permanent chrome at the stop whose entire point is the map.
- **Let the sheet vanish completely at the map extreme** (no 52px strip), with the toggle as the only way back. Rejected: the toggle and `קרוב עכשיו` would have to move onto the canvas, re-cluttering exactly what §2 decluttered, and the drag would lose its start edge — a flick down would make the sheet disappear and the way back would be a different control.
- **Grow the sheet to hold the tapped place** (a selection-driven stop, ~200px, instead of a card). Considered seriously: it needs no new host, and "the sheet moves because you asked" is defensible. Rejected because it still shortens the pane — the map physically shrinks and the camera's aspect changes — where the card leaves the pane's box alone; and because it gives the minimum stop two heights, which the drag then has to reason about.
- **Pick new numbers for `half` now.** Rejected: see the device pass. A fraction chosen in a desktop viewport is a number that looks right, which is how the shipped 0.56 came to be blamed for a problem it did not cause.

## Build log (2026-07-27, session 141)

The design above is what shipped, and §1–§9 needed no reversal. What the build had to
decide, refine or read against the letter is here rather than in a new ADR, because none
of it changes a decision this one made. The rendered canvas is unchanged from ADR-0121
§13: it was **not** seen in this session — no phone, no browser key — and none of what
follows claims otherwise.

1. **§7's bottom camera inset is deliberately NOT built, and Phase 3 owns it.** §7 asks
   that while a card is shown the fit's bottom inset carry it, "derived from the same
   constant, exactly as the top inset carries the controls row". The top inset is derived
   and shipped (`MAP_FIT_PADDING.top` = `MAP_CONTROLS_H` + the floating gap + the pin
   clearance the fit already reserved = **118px**, the number §1 printed). The bottom one
   cannot be done the same way: the controls row is _always_ there, so its inset is a
   constant, while the card comes and goes on a **tap** — so carrying it means a
   `MapPane` prop that changes when a pin is tapped, which is the one thing §9 lists as
   a constraint that must survive and §6 already avoided for the same reason by
   suppressing `באזור`/re-centre in CSS. Against that: the card exists only at the `map`
   stop, a fit is never what put it there, and §7 itself records that focus is unaffected
   because it centres the pin. What is genuinely left open is narrow — a chip tapped
   **while** a card is open re-fits with 118px reserved at the top and 28 at the bottom,
   so a fitted pin can land under the card at that one stop. Phase 3 is the camera's
   phase and already revises `recentre`; this belongs in it, not in a prop that costs the
   map's memo. Noted on the backlog with the phase.
2. **The Consequences file list missed `ui/domain/MapPane.tsx`.** §7's "a canvas tap
   clears the selection" needs the map instance's own `click` event, which only the pane
   has, so it gained one prop — `onCanvasTap`, a `useCallback(…, [])` over `setState`, so
   it is identity-stable and the memo is untouched (ADR-0121 §4). It also carries a guard
   the ADR does not mention: an `AdvancedMarker` is a DOM overlay, so a pin tap should
   never reach the map's click at all, but "select a pin, then instantly clear it" is the
   one ordering that would fail silently, and the guard is one `closest('.map-pin')`.
3. **The `map` stop's strip height reaches CSS under the PRIMITIVE's name, not the map's.**
   §3 asks one constant to write both the stop and the CSS `min-height`. That
   `min-height` lives in `snap-sheet.css`, which is generic — a primitive reading a
   `--map-*` variable would invert the layering — so the screen writes **`--snap-top-h`**
   from `MAP_SHEET_STRIP_H`. Same single source of truth, correct direction of knowledge:
   the caller tells the primitive how much top it must reserve.
4. **§5's two hiding mechanisms are in two different languages, and the tests are what
   keep them apart.** Stop-driven hiding is CSS on a chip that stays **mounted**
   (`visibility`, so both directions animate and the control is untabbable while
   invisible); capability-driven absence is an **unmounted** chip. jsdom applies no CSS,
   so the suite asserts the mechanism rather than the pixels: the chip is present at the
   `map` stop and absent offline. That pairing is the decision; the fade itself is a human
   pass.
5. **`nearestStop`'s velocity term is a separate branch, so zero velocity is byte-for-byte
   the shipped behaviour.** The flick path ranks stops by height (it needs "the next one
   beyond, in the direction of travel"); the distance path still iterates `order`, which
   is what keeps ties going to the earlier entry. That is why the shipped release table
   could stay verbatim as the regression net while the new table was added beside it. One
   detail the ADR could not have known to state: a flick released **exactly on** a stop
   needs a 1px epsilon, or "the first stop strictly beyond" is the stop you are already
   on and a fast gesture that lands on a boundary is a no-op.
6. **The drag's click-swallow is armed on `pointerup` only.** §4 says a real drag
   suppresses the click that follows. A **cancelled** gesture dispatches no click, so a
   `{ once: true }` listener armed after `pointercancel` sits there and swallows the next
   genuine tap in the region — the same class of bug as capturing early, found by asking
   what happens to the listener nobody consumes.
7. **The facet disclosure cost the tests more than the code.** Every existing test that
   touched a category chip, `אולי` or `מה נשאר` now has to open the strip first, and the
   scope chip is only reachable with it closed — because the strip covers the row in
   place, which is §2's whole point. Two idempotent helpers per suite (`openFacets` /
   `closeFacets`) rather than twenty rewritten call sites; `Map.test.tsx` keeps running
   with no build config, so §8's in-flow row is tested as the list-only path it is.
8. **`t.map.scopeAll` / `t.map.scopeDay` are deleted, not orphaned.** §2 retires
   `.map-scopehint`'s sentence, and the two strings had no other call site. Where the
   suites read that sentence to learn the day scope they now read the chip's own
   `aria-pressed`, which is what the ADR says says it.
