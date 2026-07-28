# 0126 — The canvas's own chrome, restated: two camera controls, and `באזור` becomes a sort

**Status:** Accepted — designed 2026-07-28 (session 149), **built the same day (session 150; see the build log)**. Phase 3 still owns the camera's zoom behaviour on top of it. The rendered canvas has still not been seen (ADR-0121 §13) and nothing below claims otherwise.
**Date:** 2026-07-28
**Amends** [0121](0121-embedded-map-phase-6-design.md) **§12** (re-centre's "it re-frames, it never locates, and it never requests the permission" — it becomes two controls, and locate routes to the pre-prompt) and [0122](0122-map-split-controls-over-the-canvas.md) **§1/§2** (the canvas's control budget: the furniture band, and the gap at the `map` stop that §2 handed forward). **Leaves [0106](0106-maps-and-places-epic-scope-and-phasing.md) §4 and [0121](0121-embedded-map-phase-6-design.md) §9's ghost-counting rule unamended** — see §4 and §5, which is the point of both.
Relates [0017](0017-mobile-first-device-targets.md) (the 44×44 floor), [0109](0109-map-tab-design.md) §6-7 (the reason-first pre-prompt, the near-me chip), [0119](0119-map-maybes-facet-is-the-shelf.md) §3 (count coupling), [0122](0122-map-split-controls-over-the-canvas.md) §9 (no `MapPane` prop that changes on a tap).

Mockup: [`mockups/map-chrome-v1.html`](../../mockups/map-chrome-v1.html) — the real layout tree, the shipped stylesheets, and a panel that measures the band at 390×844 / 390×734 / 360×640 rather than asserting it.

## Context

Phase 6 shipped a canvas with exactly two pieces of furniture: a re-centre control at the top inline-start and a `X באזור` readout opposite it. Phase 2 (ADR-0122) then moved the filter row over the canvas, decluttered it to three controls at rest, and made the `map` stop the sheet's own top row and nothing of the list. The third pass of field reports says both pieces of the original furniture are now wrong, and the owner settled what each becomes before this session began:

- **#19 — one button doing two jobs.** `recentre` is `if (me) focus(me); else reframe(points)` (`ui/domain/MapPane.tsx`). The same tap centres you or re-frames the filtered set depending on a permission you cannot see, which is why it reads as "silently does something else entirely". **Owner's call: split it into two controls.**
- **#23 — `X באזור` could be a button.** **Owner's call: the area is a SORT, not a filter.** A tap raises the sheet and orders the in-view places first. It hides nothing.

What was left to this session is the part a code reading cannot answer: **where the controls go**, whether a live region can also be a control, and a prerequisite that holds whether or not the button ships — that the count names a set the list is structurally unable to produce.

Two things are already true and shape everything below. Both top corners of the canvas are spent. And the surface's scarce axis is **height**: ADR-0122 exists because 276 of a 390×844 phone's pixels are app chrome before either half of the split gets one.

## Decision

### 1. One furniture band, laid out along the axis that has room

The two camera controls and the readout are **one horizontal band**, pinned under the controls row at `top: calc(var(--map-controls-h) + 8px)`: the camera pair at the inline start, the readout at the inline end where ADR-0121 §9 put it and clear of Google's bottom-inline-start attribution.

**The obvious alternative is a vertical stack, and it is not close.** Every desktop map stacks its camera controls; drawn against the real tree it fails on a phone. Measured in the mockup, "canvas left clear below the band, after the controls row and the attribution":

| Screen · stop    | Pane    | Band as a **row** | Band as a **column** |
| ---------------- | ------- | ----------------: | -------------------: |
| 390×844 · `half` | 390×250 |         **139px** |                 87px |
| 390×734 · `half` | 390×201 |          **90px** |                 38px |
| 360×640 · `half` | 360×160 |          **49px** |             **−3px** |
| 360×640 · `map`  | 360×312 |         **149px** |                 45px |

The column does not merely crowd the small phone at `half` — it **overlaps Google's attribution**, which the ToS forbids (ADR-0106 §B). The mockup draws it doing so.

The row costs 164px of a 390px inline axis (202 spare) and of a 360px one (172 spare). **So the rule this phase adds, and the reason it generalises past these two controls: furniture on this canvas grows along the inline axis, never the block axis.** Height is the resource ADR-0122 spent a whole session recovering; width was never the problem. A third piece of furniture, if one is ever justified, joins this band rather than opening a second one.

### 2. Both controls belong to the pane, and locate does not move

They are `MapPane`'s own children, exactly as the single control is today, wrapped in one `.map-camctl` cluster that owns the band's geometry once. Three things fall out for free rather than being designed:

- At `full` the pane is `visibility: hidden`, so a camera control cannot be tapped where there is no camera. No stop-driven rule, no dead button.
- ADR-0122 §6's **one-floating-object-at-a-time** rule keeps working by naming the cluster instead of the single control: `.map-split:has(> .map-geoprompt) .map-camctl { display: none }`. Still `:has()`, still not a prop.
- Nothing new floats. The only card that opens is the pre-prompt that already exists, which is deliberate canvas furniture and not a `Modal` layer.

**Locate keeps the corner it shipped in, and the new control goes beside it.** The control whose _behaviour_ changes is the one that does not move: a tap on the crosshair still centres you, and what changed is that it now asks when it cannot. Moving it as well would spend the user's muscle memory to advertise a change that is a strengthening.

### 3. The band is 44 on the block axis, and that fixes two things that were already broken

One number, `--map-furniture-h: 44px`, because design-language's floor is 44×44. Note what the mockup measured about what already shipped: `.map-recenter` is **38×38** and `.map-areacount` **64×26**. Both were under the floor before this phase added a third object; #23 only noticed the second one.

The floor is met by geometry, never by a hit area painted smaller than it is. That forces one small change to how the readout is painted: a `min-height: 44px` on the region plus its own hairline is 46px outer, and the box that must clear the floor is the **tappable** one. So `.map-areacount` becomes a bare positioned wrapper and the pill — background, hairline, radius, shadow, padding — is painted on its child. Nothing about how it looks changes.

### 4. `באזור` becomes a control without ceasing to be a readout: the region wraps the button

`role="status"` and `aria-live="polite"` stay exactly where they shipped, on `.map-areacount`. It does **not** become a `<button>`: one node cannot hold both roles, and `role="status"` would win over `role="button"` anyway. Instead the live region **wraps** the control — which is not a new pattern in this repo, it is `StatusBanner`'s own shape (`ui/feedback/StatusBanner.tsx`: a polite live region with a dismiss button inside it).

- **The count text exists once in the DOM**, so what the region announces is the button's own words rather than a second copy of them. ADR-0121 §9's churn rule is untouched: updated on the map's `idle`, never during a pan.
- **The action is the button's `title`** (an accessible description), never an `aria-label`. The visible `7 באזור` has to stay the accessible **name** or a voice-control user cannot say what they can see (WCAG 2.5.3), and a name that rewrites itself on every camera idle is its own kind of churn.
- **Zero renders no button.** `אין מקומות באזור` stays a readout: sorting the list by an empty area is a control that does nothing, which ADR-0109's session-105 amendment refused. It is the same derived-affordance rule as `אולי` and `מה נשאר`.
- **On, it takes `.on` and the mode accent**, like every other stateful chip on this tab — a control that hides the fact that it is on is the defect ADR-0119 exists to prevent.

### 5. The area is a sort, and the prerequisite is answered by keeping the count spatial

**The mechanism is a sibling of `sortByDistance`, not a new one.** Session 138 split `located` (a fact) from `sortByDistance` (an intent) precisely so an intent could re-order the list without pretending to be a filter. The area intent joins it: **the list has one order, so the two intents are mutually exclusive**, and both feed `listOrder`.

- **In-view first, each group in the day's own schedule order.** Under a sort intent the day blocks (`עכשיו` / `מה שלפנינו` / `מה שמאחורינו`) drop and a group header states what the order is — today's behaviour for `קרוב עכשיו`. The difference is that distance is legible per row (each row carries a `.map-dist` chip) and "in view" is not, so the area sort needs a **second** header to draw the boundary the first group ends at: `באזור שבמסך`, then `שאר המקומות`. Both are the shipped `.map-grouphead`; no new element.
- **The bounds are snapshotted at the tap, before the sheet moves — and that is not a detail.** Raising the sheet changes the pane's box, which fires a fresh `idle` with fresh bounds; a sort that cleared itself on camera movement would kill itself the instant it was created. The right bounds are the ones you were looking at when you tapped. It clears on a second tap, on the other sort intent, or on a day-scope change.
- **A stale snapshot is cheap here and expensive as a filter**, which is the whole reason the owner's call lands where it does.

**The prerequisite, and it holds whether or not the button ships: `areaCount` counts places the list cannot show.** It is `countPointsInBounds(pins, viewBounds)` over **all** pins, and `pins` includes **ghosts** — places in view but outside the scoped day, of which the sheet contains none. `orderedStops`, twelve lines above it, excludes ghosts explicitly. So `7 באזור` names a set the list is structurally unable to produce.

**The answer: the count stays spatial, and the list says what it could not bring.** The rejected alternative is to couple the count to the list and stop counting ghosts (ADR-0119 §3's shape) — and it makes things worse, not better: you would see seven pins and read `4 באזור`. That is the same two-halves-disagreeing family Phase 7 closed for #16/#21, only pointing the other way and with the two halves two centimetres apart. ADR-0121 §9's reasoning for counting ghosts is good and survives: it is a **spatial** readout, not a facet count, and "how many of our places are around here" is exactly what the ghost tier is for.

What changes is the **button's promise**, not the number. It does not promise "these seven rows"; it promises "order the list by what is on screen". The list then states the shortfall in session 144's own grammar — a neutral `StatusBanner` at the head of the scroll saying how many of them are not in this day, with `הצגת כל מקומות הטיול` (the existing string, the existing `setAllDays(true)`) beside it. **And the offered way out actually resolves it:** with all-days on there are no ghosts, the count and the list agree exactly, and the banner removes itself.

### 6. Locate with no permission routes to the card that is already allowed to ask

Locate becomes locate-only and stops branching on whether there is a fix. Two things it never does: `focus(me)` is a camera call and cannot prompt — it only runs with a fix already in hand — and the control itself never calls `getCurrentPosition`. Only `geo.request()`, behind the card, can raise a dialog.

| State at the tap                 | What locate does                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| Fix in hand                      | Centres on you. (Phase 3 adds the zoom, and #20's repeat-tap step-in.)                           |
| `granted`, no coordinates yet    | Requests; the button reads its locating state. **The outcome is not knowable here** — see below. |
| `prompt` / unknown / unsupported | Opens the **existing reason-first pre-prompt** — the same card the chip opens.                   |
| `denied` / `blocked`             | Sets the intent and normalises the sheet to `half`, so the existing refusal banner is on screen. |

**The table branches on the state at the tap, and one state is only knowable afterwards.** "Location is off" is three different things and the Permissions API answers about only two of them: it reports whether _permission_ exists, never whether the device can actually produce a fix. So a device with location services off, or in airplane mode, can sit at `permission: 'granted'` and still fail — `getCurrentPosition` calls back with `POSITION_UNAVAILABLE`/`TIMEOUT`, `refused` is false, and `useGeolocation` lands on **`status: 'unavailable'`** with `blocked` false. No dialog of ours appears; some platforms raise their own "turn on Location Services" alert, which is the OS's and is neither detectable nor controllable from a web page.

`showNotice` already covers that state (`locationRefused` is `denied || unavailable`), and the notice is the right answer — but it lives in the **list's** scroll region, so **the rule in §7 has to key on the request's outcome, not only on the pre-tap state.** When a locate-initiated request settles to `denied` **or** `unavailable`, the sheet normalises to `half`. Without that clause a locate tap at the `map` stop with the radio off spins, fails, and files its explanation somewhere that is not on screen — the silent-nothing that #19 is a report about, reintroduced one branch over.

**ADR-0121 §12's invariant survives intact: the pre-prompt is still the only thing allowed to ask.** What is amended is the claim that re-centre "never requests the permission" — a second control may now _route to_ the card. That is exactly the piece ADR-0122 §2 handed forward: at the `map` stop the near-me chip is absent, so nothing on the canvas could ask at all, and the stopgap ("one tap on the view toggle") retires.

**Two things make this cheap, and both are session 138's split paying off.** Locate sets `nearMe` (the fact, and your dot) and never touches `sortByDistance` (the intent) — so granting through the locate button lights the me-dot and the distance chips and leaves the list in schedule order, which is precisely the regression session 138 fixed. And the refused case needs no new copy or new card, because of the rule in §7.

**The second control frames what `reframe` already frames**: the day's own pins after the filters, ghosts excluded (`isFramedByCamera`). It is **absent when there is nothing to frame** — a day with no placed stops — the derived-affordance rule this tab already runs. It needs a new `frame` entry in `ui/Icon.tsx`'s `PATHS`, a one-line addition to the registry exactly as `locate` was, and never a raw glyph.

### 7. One rule covers three cases: a canvas control whose answer lives in the list normalises the sheet to `half`

A row tap already does this (ADR-0121 §8 / ADR-0122 §7). The area sort does it, because the order it produces is invisible at the `map` stop. And a locate that **cannot deliver** does it, because ADR-0122 §6 deliberately left that notice in the list's scroll region — it explains the _list's_ order — and at the `map` stop that region is not on screen. Stating it as one rule is what keeps the refusal from growing a second card with a second copy of the same sentence.

**The trigger is the outcome, not the tap.** A hard refusal is known before the request (`blocked`), but an unobtainable fix is only known when the request fails (§6), so the rule fires on the settled state: `denied` or `unavailable`, whichever way it was reached. Writing it as "a refused locate normalises the sheet" was this ADR's own first draft and it silently missed the radio-off case — the one shape of "location is off" that a permission query cannot see coming.

### 8. What this does not touch

- **`MAP_CONTROLS_H` stays 46**, and `MAP_FIT_PADDING.top` stays derived from it at 118px. The band sits _under_ the row and occupies only the two corners; growing the inset to clear it would make `fitPaddingFor` drop the whole thing at `half`, where 118 is already nearly half of a 250px pane. ADR-0122 §1's honest limit stands unchanged and is now slightly more likely to bite: a manually panned pin can sit under a corner, and its row in the sheet is the way to it. What stays clear is the pane's centre, which is where `focus` puts a selected pin.
- **No `MapPane` prop that changes on a tap** (ADR-0122 §9). The area sort's state lives in the screen, like `sortByDistance`; the mutual suppression with the pre-prompt stays CSS `:has()`. The pane holds a live `google.maps.Map` where a re-diff is cheap and a re-instantiation is billed.
- **No semantic colour.** The new control is chrome. It takes `--card`/`--line`/`--ink` like the control beside it; amber stays time and commitment, teal stays location (ADR-0028). The readout's `.on` state takes `--idx-accent`, which is the tab's existing "this control is on" accent, not a new colour.
- **ADR-0106 §4 is unamended.** Pan/zoom remains the only area **filter**.

## Alternatives considered

- **Stack the two camera controls vertically**, the way every desktop map does. Rejected on measurement, not on taste: −3px of clear canvas at 360×640 `half`, i.e. it overlaps Google's attribution. Drawn in the mockup under ⟨עמודה אנכית⟩ so the difference can be seen.
- **Scope the list to the viewport** (the true area filter). Rejected, and recorded so it is not re-derived: an area predicate is the only facet whose predicate moves **without the user touching the list**. Every other facet is over data; this one is over the viewport. So it either re-filters live — the list churning under a panning finger, the exact churn ADR-0121 §9 keeps out of this readout — or it snapshots bounds and becomes a frozen "area" that silently stops matching the canvas. As a **sort**, both failure modes get cheap: nothing is hidden either way.
- **Couple the count to the list and stop counting ghosts** (ADR-0119 §3's shape). Rejected in §5: it makes the readout disagree with the pins two centimetres above it, which is the worse half of the same defect.
- **Move `באזור` into the sheet's own top row**, beside `קרוב עכשיו`, on ADR-0122 §2's "sort belongs to the list" rule. Genuinely tempting, and rejected on one asymmetry: `קרוב עכשיו` is absent at the `map` stop because it re-orders nothing you can see, and by that rule the area sort would be absent there too — at exactly the stop where you are panning the canvas and the count means the most. The area control is the way _from_ the canvas _into_ the list, so it belongs on the canvas.
- **Put "frame the set" in the floating controls row**, beside search. Rejected: at `full` the pane is hidden and the row is the list's header, so the control would be dead there — and ADR-0122 §1's row is deliberately the same row at every stop. As a child of the pane it disappears with the pane for free.
- **Make `באזור` a `<button>` and drop the live region.** Rejected: the count changing without announcement is a regression for the one user who cannot see the canvas change.
- **Keep one node and give it both roles.** Not a trade-off, a bug: `role="status"` wins.
- **A 44px hit area painted around a 24px pill.** Rejected: the floor is `≥ 44×44` for the target, and painting a control smaller than it is invites the next person to lay something out against the ink instead of the box. The pill is genuinely 44 tall.
- **Grow `MAP_FIT_PADDING.top` to clear the band.** Rejected in §8: `fitPaddingFor` would drop the padding entirely at `half`, trading a rare corner collision for no top inset at all.
- **Label the two camera controls with words.** Rejected: it re-clutters exactly what ADR-0122 §2 decluttered, and both glyphs are conventional. See the device pass.

## Consequences

- **Phase 3's build knows whether it is writing one control or two.** It is two, and it now has the locate ladder, the icon registry entry, and the "route to the pre-prompt" shape it was blocked on. Its own questions — the zoom-to-at-least threshold, the single-pin zoom, the locate zoom, #20's stateless repeat-tap step-in — are unchanged and still one question.
- **Touched by the build:** `ui/domain/MapPane.tsx` (the cluster, the second button, locate's ladder, the readout's wrapper/button split), `ui/domain/map-pane.css` (`.map-camctl`, `.map-frame`, `--map-furniture-h`, the pill moving onto the child, the `:has()` selector), `ui/Icon.tsx` (`frame`), `screens/Map.tsx` (the area intent, `listOrder`'s third value, the two group headers, the ghost banner, the sheet normalisation), `screens/map.css`, `i18n/he.ts`, `constants.ts` if the band's height is named there rather than in CSS.
- **`MAP_CONTROLS_H` and the camera are untouched**, so no test in `lib/map-camera.test.ts` changes. The area partition and the two-group header split are pure functions and belong beside `place-usage.ts`'s, testable with no Google in the process (`frontend/CLAUDE.md`); assert them across **both day scopes**, since the ghost banner exists only in the day-scoped one.
- **The 38×38 control and the 26px readout are fixed as a side effect**, and the fix is stated rather than smuggled: two shipped touch targets were under ADR-0017's floor.
- **A rule the next canvas addition inherits:** furniture grows along the inline axis, and it joins the one band.

## The device pass, and what it owns

- **Whether a crosshair and a corner-bracket frame read as distinct at a glance over real cloud-styled tiles.** ADR-0121 §12 argued the single control was "not the pair ADR-0109 §1 rejected"; two icon-only controls side by side is a fair place to re-ask. The argument on paper is silhouette — round versus rectangular — and both marks are conventional. A fake base cannot settle it.
- **Whether a 44px band reads as right or as heavy at `half` on a 360×640 phone**, where it leaves 49px of clear canvas. If it is heavy, the lever is `half`'s fraction, which is already in Phase 3's tuning cluster — not a control that comes and goes by stop.
- **Whether the readout reads as tappable.** It is a pill among two circles; on a canvas that may be enough, or it may need the affordance stating. This is the one thing the mockup cannot answer at all, because the question is "does a reader try it".

## Build log (2026-07-28, session 150)

The design above is what shipped and §1–§8 needed no reversal. What the build had to
decide, refine or read against the letter is here rather than in a new ADR, because
none of it changes a decision this one made. The rendered canvas is still unchanged
from ADR-0121 §13: it was **not** seen in this session, and none of what follows
claims otherwise. What was re-rendered is `mockups/map-chrome-v1.html` against the
**shipped** stylesheets — it measures the band at 44×44 / 68×44 and the same clear
canvas per stop as it did against the design's own delta, which is the cross-check
that the built CSS is the designed CSS and not merely a plausible neighbour.

1. **`areaSorted` IS a `MapPane` prop that changes on a tap, and §8 has to be read
   precisely for that to be allowed.** ADR-0122 §9's words are "no new prop that flips
   on a tap", but its subject is re-instantiating the map: the rejected case was §7's
   bottom camera inset, which would have changed what the CAMERA does. This one is a
   boolean the pane hands to `aria-pressed` and a class, it never reaches the map
   instance, and `pins`/handlers keep their identities — so the markers do not re-diff
   and nothing is billed. It is also not avoidable in CSS the way `:has()` avoided the
   last one: a `data-` attribute on `.map-screen` can paint the pressed state but
   cannot express `aria-pressed`, and a control that looks pressed without saying so is
   the half-fix. The one thing kept from that rule is the identity discipline —
   `onAreaSort` and `onLocate` are `useCallback(…, [])` over latest-refs, like every
   other pane handler.
2. **`placesInArea` is derived from PLACE COORDINATES and `ghostsInArea` from `pins`,
   and the split is deliberate rather than incidental.** `pins` is declared eighty
   lines below `listOrder`, so the sort's predicate could not read it without moving
   things — and it should not: the sort orders list ROWS, and whether a row's place is
   inside the snapshot is a fact about its coordinates. The shortfall count is the
   opposite case: it has to be the same number the readout is taken from, or the banner
   and the pill drift, so it filters the very `pins` array `areaCount` counts.
3. **The block-header map is now keyed by the header STRING, not by `PlaceBlock`.**
   `headerFor` used to hold a block and the renderer looked up `t.map.blockHeader[…]`.
   The area sort's two headers are not blocks, and widening the value to a union would
   have made every consumer branch on which kind it got. Resolving the string at the
   point that knows which partition it is keeps one renderer and one `.map-grouphead`.
4. **The area notice reuses `.map-georetry` inside a `StatusBanner`.** Not a new
   affordance: the refusal notice already puts a button in that banner, so the
   "explanation plus one way out" shape existed and only needed a second caller. Its
   words are `t.map.emptyDay.action` verbatim — session 144's, as §5 asks.
5. **A test-harness bug worth naming, because it hid a real state.** `MapPane.test.tsx`
   defaulted `areaCount` with `??`, which swallows an explicit `null` — and `null`
   ("no idle yet") is a distinct state from `0` ("nothing in view") that renders
   differently. The assertion that neither renders a button was passing against `1`.
   `=== undefined` is the fix; `??` is wrong in any harness whose prop is nullable.
6. **Both new screen-level behaviours are asserted across the seam that hid the last
   ordering bug.** The suite drives `onViewChange` directly, because that is the only
   way `viewBounds` is ever written, and it asserts the ORDER of the rendered rows
   rather than the state behind them — including that a later idle does not re-order
   (the snapshot) and that nothing is hidden (the sort). The `unavailable` path is
   tested with `POSITION_UNAVAILABLE` specifically, since that is the state §6's own
   correction exists for and a `PERMISSION_DENIED` fixture would pass without covering
   it.
