# 0122 — The map split earns its screen: the controls leave the layout, the height axis becomes usable, and the location prompt moves onto the canvas

**Status:** Accepted (design) — **paper only**; the build is the Phase-2 build session, which needs a phone in hand (see [The device pass](#the-device-pass-and-what-it-owns))
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

**This closes ADR-0121 §8's open question — with a yes, and with the thing that question was protecting.** §8 asked whether a pin tap should reveal the entries "on the canvas (an info window) or only via its row", worrying that an info window is "a second way of stating a place". Judged: **on the canvas, as the row** — so the map idiom's benefit arrives with no second vocabulary, no new component, and one fewer special case than the app ships today.

**One camera consequence for the build:** while a card is shown, the fit's **bottom** inset should carry it, derived from the same constant, exactly as the top inset carries the controls row (§1) — with the same honest limit, since `fitPaddingFor` drops padding that claims half an axis. Focus is unaffected: it centres the pin, and the pane's centre is well clear of a bottom card.

### 8. The list-only path keeps the same row, in ordinary flow

Offline, or with no build config, there is no split and no sheet — the tab is "the list it has always been" (ADR-0121 §11). The same controls component renders `position: static` above the list (`.map-controls.in-flow`): **one component, two positionings, never two components.** It is also the one place where `קרוב עכשיו` cannot live in the sheet, because there is no sheet — so on that path it renders in the flow row (and offline it is absent anyway). `Map.test.tsx` runs with no build config on purpose (`frontend/CLAUDE.md`), so this path stays tested as such.

### 9. What this does not touch, and one thing it names

**The two standing constraints survive unchanged**, and both are the reason several of the choices above are shaped the way they are:

- **`--sheet-h` is still written from the SNAPPED stop height**, so a drag costs no relayout and the pane resizes on snap. The live drag height stays on the sheet element itself, as today.
- **Nothing here re-creates the `google.maps.Map`.** No new wrapper around `<MapPane>`, no new prop that flips on a tap, no `mapId` change, no remount. A re-instantiation is billed (ADR-0121 §4).

**The elephant, named and left alone: the app chrome is 276px of a 390×844 phone** (207 header + 69 nav) — 33%, before the tab's own controls, and 43% of a 640px phone. It is the single largest consumer of the split's budget, it is shared by every tab, and it is not this tab's to change: the Map is a day-scoped surface precisely _because_ it uses the same header day strip (ADR-0109 §1). A condensing pass for full-bleed surfaces is its own design session, and it goes on the backlog rather than being smuggled in here.

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
