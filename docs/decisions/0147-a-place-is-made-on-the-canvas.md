# 0147 — A place is made on the canvas: a long press drops one, a tap on Google's own sight adds it, and one card hosts both

**Status:** **PROPOSED — decision pending, NOT built.** Phase 6(b) + 6(c), the last unbuilt feature work in the Maps & Places epic and the only phase that spends. Designed 2026-07-30 (session 196).

> **This draft is INCOMPLETE and is superseded in part by its own mockup.** It was written for 6b + 6c alone; the owner then added **naming and renaming any place** — from the sheet's rows and from the canvas card — which turned out to be the same act and reframed the whole surface. The design now lives in
> [`mockups/map-make-a-place-v1.html`](../../mockups/map-make-a-place-v1.html) and **four decisions are open**: whether the form carries a category (against session 76's recorded rejection of a category picker on quick-add — the map's case for differing is that here the category IS the pin's hue); whether the icon lives on the existing `MaybeItem.icon` or a new `Place.icon` at the bottom of the resolution chain; whether a Google **search result** routes through the same form; and the rename affordance's placement. §1–§7 below stand as written for the two gestures. Do not build from this file until those are settled and it is rewritten.
>
> One correction it should carry regardless: the shipped icon chain is `chosenIcon(event?.icon) ?? BOOKING_TYPE_ICON[booking.type]` — a linked event's **deliberate** pick beats the booking's type glyph, not the reverse — and `chosenIcon` exists because a **default** `📌` is not a pick.
> **Date:** 2026-07-30
> **Amends** [0125](0125-map-canvas-terrain-vocabulary.md) §6 — a POI tap still never stacks two cards, and the card it leaves standing is now **ours**. The owner's constraint is honoured by suppressing Google's, not by exempting the tap.
> **Amends** [0131](0131-map-search-is-a-control-not-a-screen.md) §11 — the three-source table gains a **fourth** source, and §9's two build-time questions are answered here.
> **Builds** [0131](0131-map-search-is-a-control-not-a-screen.md) §9 (the long press, designed there and unbuilt since) on [0145](0145-the-canvas-takes-a-one-finger-zoom.md)'s recogniser.
> **Relates** [0112](0112-place-in-trip-is-referenced-not-cached.md) (a `Place` with no reference is cache-only — why dropping must also create one), [0115](0115-plan-mode-place-research.md) §1/§3 (armed by intent; the uncategorised `MaybeItem` and its free vet link), [0121](0121-embedded-map-phase-6-design.md) §4 (a re-instantiation is billed), [0122](0122-map-split-controls-over-the-canvas.md) §7 (`.map-placecard` is the row wherever the sheet cannot show it), [0107](0107-per-place-timezones-and-multi-zone-time.md) (`Place.timezone`, and the gap this phase found in it), [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) §3/§6 (the cost envelope and the hard cap), [0129](0129-map-camera-moves-like-a-camera.md) §3 (do not re-derive Google's projection).

## Context

Phase 6 is the epic's last feature work and its only spending one. (a) was closed in session 158 by a session not looking at it — ADR-0132 §7 switched the paid half to Text Search, which returns each result **with its location**, so "see where it is before you pick" is answered for free. What is left is **(b) drop a pin manually** and **(c) tap one of Google's own sight icons**.

**(b)'s design is already done and is not reopened here.** ADR-0131 §9 settled the gesture, the cost (nothing), the naming step, the write's destination, the camera and the offline behaviour. It handed on exactly two build-time questions, both of them rule 8's escape hatch, and one data-model pair to Phase 6b. **This ADR answers those and designs (c).**

**(c) exists because ADR-0125 §6 re-enabled Google's sights.** A tap on the Eiffel Tower's icon arrives as a map click carrying a **`place_id`**, on a thing the user is already looking at — which sidesteps the fact that blocked (a) for three weeks, since nothing has to be searched, previewed or session-tokened. But §6 also **deliberately** made that tap clear our selection, on the owner's rejection of the alternative: _"they might go one over another and become a mess."_ So (c) cannot be built by exempting the tap. That is the collision to design around, and it is the interesting part.

## Decision

### 1. The long press is a third phase of the canvas's existing recogniser, not a second mechanism

ADR-0131 §9 asked whether the shelf's `useHoldToDrag` extracts cleanly, and said to **ask first** if it meant a substantial refactor. **It does not extract, and the reason is better than the answer:** by the time §9 was written the canvas had no gesture pipeline. ADR-0145 gave it one.

`useDragZoom` already owns this pane's pointer stream, and owns it in the only way that works here:

- **capture-phase** listeners on `.map-pane`, because Google's listeners are on descendants and its pan **writes the camera on the first move**;
- all three event streams suppressed (`pointer*`, `touch*`, `mouse*`), because `stopPropagation` on one says nothing to another;
- attached **at mount**, never at arm time, which is session 116's scar;
- pointer capture taken at arm, and a one-shot capture-phase `click` swallow on release.

`useHoldToDrag` is bubble-phase, and its machinery is about a **row that unmounts mid-drag** while a ghost follows the finger — none of which a canvas long press has. Making it capture-phase and canvas-aware is the substantial refactor §9 told us to ask about, and we would be refactoring it **towards something that already exists**.

**And a second pipeline beside `useDragZoom` is not merely duplication — it is a race.** Two capture-phase `pointerdown` listeners on the same element both run (`stopPropagation` does not stop listeners on the same node), so they would contend for `setPointerCapture` on one pointer id and both arm a one-shot click swallow.

So the long press is a **new phase in the pure recogniser**, and `lib/drag-zoom.ts` becomes **`lib/canvas-gestures.ts`**: a file named for one gesture that now holds two would mislead the next reader, and this repo renames those (`peek`→`map`, `GHOST_SCALE`→`ASIDE_SCALE`).

**The arbitration with the one-finger zoom then falls out rather than being written.** That gesture is a double-tap whose second finger stays down, so it arms on a `DOWN` that **pairs**; a long press is a single `DOWN` that does not. One state machine sees both, and it cannot emit a hold from `ARMED` because that is a different branch of the same `switch`. A tap-then-hold is a drag zoom; a hold is a drop. **Two gestures that would have needed arbitrating are instead two arms of one conditional** — which is the whole argument for putting it here.

**The timeout arrives as a synthetic event.** A hold is the _absence_ of anything for `MAP_HOLD.MS`, and a reducer over `(type, x, y, t)` cannot observe absence. So the imperative half runs the timer and feeds `HOLD`, which keeps every branch of the recogniser a table the suite can drive with no Google in the process (ADR-0121 §13's standard). The timer is cancelled by a move past slop, an up, a cancel, or the pairing that arms a zoom.

### 2. The point comes back through Google's own projection, in world coordinates

A long press yields a **pixel**; the write needs a `LatLng`. ADR-0129 §3 warns against re-deriving Google's projection maths, and ADR-0145 §3's amendment already established the way through that: work in **world coordinates**, where the relationship between world units and screen pixels is a pure power of two, and let `fromLatLngToPoint`/`fromPointToLatLng` carry every nonlinear part.

`zoomAboutPoint` is that arithmetic for a zoom. A long press needs its plainer sibling — `latLngAtOffset`: centre in world units, plus the pixel offset from the canvas centre divided by `2^zoom`, projected back. **There is no Mercator in it, which is the point.** It degrades the same way the double-tap anchor does: no projection yet (a map that has not rendered) means no drop, rather than a wrong one.

### 3. Two data-model answers Phase 6b owned, and one gap it exposed

- **The nullable `@@unique([tripId, googlePlaceId])` does let several coordinate-only places coexist.** Postgres treats `NULL`s as distinct in a unique index (`NULLS NOT DISTINCT` is opt-in and not used here), so N dropped pins on one trip are N rows. **Verified against a real Postgres, not reasoned** — see §8 — because this is precisely the assumption the phase was told to check rather than assume.
- **`createPlace` already accepts what a dropped pin is.** `createPlaceSchema` has `name` required and `googlePlaceId`/`lat`/`lng` optional, and `places.service.create` writes `lat`/`lng` straight through. So (b) needs **no** backend or `@waypoint/shared` change — which the backlog had listed as a blocker on the strength of "the only create path is `createPlace({ name })`". That was true of the _call sites_, not of the endpoint.
- **But `create` never resolves the timezone, and that is a real gap this phase must not walk past.** `resolveTimezone` (geo-tz) is called only on the enriched path, because until now the only place with coordinates came from Google. A dropped pin has coordinates and would land with `timezone: null`, so ADR-0107's per-event zone would silently fall back to the trip's — wrong for exactly the traveller who drops a pin across a border. The zone is now resolved in `create` too, from the same one helper. **It is a fix to `create`, not a special case for the map:** any caller that supplies coordinates gets the zone, which is what the field meant all along.
- **No reverse geocode.** §9's call, unchanged: it is paid, and the user is typing the name anyway.

### 4. A POI tap is answered by OUR card, because Google's is suppressed

This is (c)'s design, and it turns ADR-0125 §6 from an obstacle into the constraint that shapes it.

§6's rule is **"never two cards"**, not "Google answers POI taps" — the owner's words were about a mess, and clearing our selection was the means, not the end. The Maps JS API lets a POI click's default info window be suppressed by calling **`stop()`** on the event. So:

**A tap on one of Google's sights suppresses Google's card and opens ours.** There is still exactly one card on the canvas, so §6's constraint holds by construction, and the tap now lands on the surface whose job is putting places on your trip. Our selection still clears, exactly as §6 says — tapping a new thing replaces the selection — it is simply replaced by the new-place card rather than by nothing.

**What our card can say before anything is paid, and what it cannot.** The click carries a `placeId` and a `latLng` and **no name**. Naming it before the confirm is a Place Details call — i.e. paying to browse, which is the exact spend that blocked (a) for three weeks. So the card does not name it, and **Google's own label is the preview**: it is rendered under the finger, at the point the card is anchored to, which is (c)'s whole premise. Beside the confirm sits the **free `place_id` deep-link** ADR-0115 already ships for exactly this job — vetting a candidate at no cost before committing.

**The spend lands on the confirm**, which is ADR-0115 §1's "armed by intent, not by opening" read literally: opening the card costs nothing, and one Details call happens when the user says add. `resolvePlace({ googlePlaceId })` is that call and it already exists, with the trip-scoped dedup, the zone resolution and the change feed already on it — so a place Google names and a place the user drops converge on one write path.

### 5. One card, two variants, and it renders at every stop — which the existing rule requires

ADR-0122 §7 made `.map-placecard` "the row, wherever the sheet cannot show it", and ADR-0131 §9 already pointed at it: a pin that does not exist yet is the sharpest case of that. Both new sources use it, with the only difference being what the place is missing:

|                   | (b) long press                    | (c) Google's sight              |
| ----------------- | --------------------------------- | ------------------------------- |
| Arrives with      | a `LatLng`                        | a `LatLng` **and** a `placeId`  |
| Name              | **typed** (the field is the card) | Google's, after the confirm     |
| Costs             | nothing                           | one Details call **on confirm** |
| Vet before commit | you chose the spot                | the free `place_id` deep-link   |

**And it renders at every sheet stop, unlike the selection card.** That is a derivation from §7's rule rather than an exception to it: the selection card is `map`-stop-only _because at `half` and `full` the row is in the list_. A place that is not in the trip yet **has no row at any stop**, so there is nowhere else for it to be. In practice the gesture can only start on visible canvas, so `full` — where the sheet leaves almost none — never raises one.

**The camera frames it once** through `framePlace` (ADR-0131 §5/§9), so the pin you just made is the pin you are looking at. **Offline both are absent**, not disabled: there is no canvas offline, so neither gesture has anywhere to happen (ADR-0121 §11).

### 6. Four sources, and the invocation still decides the destination

ADR-0131 §11's table, extended. The rule it exists to protect is unchanged and is what keeps four sources from becoming four flows:

|                    | Trip's own places | Google (search)    | Long press  | Google's sight     |
| ------------------ | ----------------- | ------------------ | ----------- | ------------------ |
| Cost               | free              | paid (Text Search) | **free**    | **paid (Details)** |
| Where it renders   | pins **and** rows | rows + rings       | a card      | a card             |
| Has coordinates    | already           | on the search      | immediately | immediately        |
| Needs a name typed | no                | no                 | **yes**     | no                 |
| Offline            | works             | absent             | absent      | absent             |

**Destination, decided by the invocation and not by the source:** with no errand live, a new place goes to the shelf as an uncategorised `MaybeItem` (ADR-0115 §3, with its toast and undo); with an errand live, it is **assigned to the target** and the tab returns. Both new sources join `addResult`'s existing three-way branch rather than growing a fourth — the branch was already the one place this composition is written.

### 7. What this phase does not do

**No reverse geocode** (§3). **No name for a POI before the confirm** (§4) — and no Details call to browse, ever; if that is wanted it is a new cost decision, not an oversight. **No drag to reposition a dropped pin** — the gesture already puts it where your finger was, and editing coordinates is the place surface's job, not the canvas's. **No new tab, no new overlay, no new floating object** (ADR-0126 §1's slot is unchanged). **Nothing is re-instantiated:** both gestures are handlers on the existing pane and the existing card, so no wrapper, no new prop that flips on a tap, no `mapId` change (ADR-0121 §4, ADR-0122 §9).

## Alternatives considered

- **Reuse `useHoldToDrag`.** §1 — bubble-phase, ghost-oriented, and refactoring it towards a pipeline that already exists. This is the rule-8 check ADR-0131 §9 demanded, answered rather than skipped.
- **A second capture-phase pipeline beside `useDragZoom`.** §1 — not duplication but a race, on one pointer id and one click swallow.
- **Google's own `contextmenu` map event**, which would hand us a `latLng` for free and needs no recogniser change. Rejected because it is **not actually independent of the machinery it would avoid**: `useDragZoom` already suppresses the pointer/touch/mouse streams while it owns the finger, so whether a `contextmenu` survives depends on which gesture is in flight — the arbitration would exist either way, split across two places instead of one. It also surrenders the hold duration to the platform and gives no way to keep the native menu down, which we must do regardless.
- **`clickableIcons: false`**, to stop Google answering POI taps. It does not suppress _a card_, it suppresses _the tap_ — the click then carries no `placeId` at all, which deletes (c)'s only free input. It would also undo ADR-0125 §6, whose whole point was that the Eiffel Tower is why you are looking at the map.
- **Let Google's card answer the POI tap and put our add verb elsewhere** (the controls row, the sheet). Rejected: it separates the verb from its subject, and there is no name in our hand to label it with, so a control somewhere else could not say what it would add.
- **Pay one Details call on the POI tap so the card can name it.** This is (a)'s blocker wearing a different hat — a browse-time spend on a tap that may be exploratory — and the free deep-link vets it for nothing. Recorded because the temptation is obvious and the argument against it is the phase's oldest.
- **Normalise the sheet to `map` on a drop**, so the card has room. Rejected: it takes away the list you were reading, and §5's rule already puts the card at every stop for a reason that is not about room.

## Consequences

- **The Maps & Places epic's feature work is complete.** What remains on it is the device pass's sitting (ADR-0146) and the paid-Routes enhancement, which was always sequenced after the epic (ADR-0121 §14).
- **`lib/drag-zoom.ts` → `lib/canvas-gestures.ts`**, with its test file and two importers following. A rename, not a rewrite: every existing export keeps its name and behaviour.
- **`create` resolves the timezone for any caller that supplies coordinates** (§3). That is a behaviour change beyond the map, and it is the correct one — but it is the sort of thing worth knowing about, so it is stated here rather than left in a diff.
- **One free gesture and one paid one now sit on the same canvas**, distinguished only by what they land on. The cost note that matters: the paid one spends **once per confirm**, never per tap, and ADR-0108 §6's daily cap bounds it regardless.
- **Two device-pass items join ADR-0146's line, and one of them can block rather than tune** — ADR-0131 §9 flagged it and it is still unanswered: whether a long press survives Google's own tiles on a real phone at all. The suite can prove the recogniser correct and cannot prove the platform lets it happen.
- **Touched:** `lib/canvas-gestures.ts` (renamed from `drag-zoom.ts`, plus the hold phase and `latLngAtOffset`), `lib/useDragZoom.ts` (the hold timer and the new callback), `constants.ts` (`MAP_HOLD`), `ui/domain/MapPane.tsx` (the POI tap's `stop()` and the two new callbacks), `screens/Map.tsx` (the draft-place state, the card's two variants, the two write paths), `screens/map.css`, `i18n/he.ts`, `backend/src/places/places.service.ts` (the zone on `create`).
