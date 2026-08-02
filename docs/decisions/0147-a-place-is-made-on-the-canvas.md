# 0147 — A place is made, and named, on the canvas: four sources, one form, and the name is the user's

**Status:** **Accepted** — designed 2026-07-30 (session 196), built 2026-07-30 (session 197). Phase 6(b) + 6(c) of the Maps & Places epic, its last feature work and its only spending phase, plus the naming/renaming capability the owner added on top.

> **Date:** 2026-07-30
> **Rewritten, not amended.** The first draft covered 6b + 6c alone. The owner then added **naming and renaming any place**, which turned out to be the same act and reframed the whole surface — so this file was rewritten against [`mockups/map-make-a-place-v1.html`](../../mockups/map-make-a-place-v1.html), the approved design. §1–§3 below are the two gestures, unchanged from that draft; §4 onward is the form the four sources share.
> **Amended by** [0148](0148-the-place-form-has-the-room-it-needs.md) the same day, from three reports off a real phone, in four places. Read it before touching this surface: the **fourth source is gone** (a form on every POI tap is noise, so §4's POI column and the `stop()` below it are removed and ADR-0125 §6 stands unamended); the form now **implies the `map` stop** and the sheet stands down, which reverses the "normalise the sheet" rejection in Alternatives — both halves of it; §3's coordinates row and §4's hint are **one** quiet line rather than two; and §7's pencil only works from a sheet row because of that normalisation plus a measured camera reserve, since at the `full` stop this card's room is **−38px, constant**.
> **Amends** [0125](0125-map-canvas-terrain-vocabulary.md) §6 — a POI tap still never stacks two cards, and the card it leaves standing is now **ours**. The owner's constraint is honoured by suppressing Google's, not by exempting the tap. **Reverted by [0148](0148-the-place-form-has-the-room-it-needs.md) §6:** §6 stands as originally written.
> **Amends** [0131](0131-map-search-is-a-control-not-a-screen.md) §11 — the three-source table gains a **fourth** source, §9's two build-time questions are answered here, and one shipped behaviour changes: outside an errand a search result's add now opens the form instead of shelving straight away (§6).
> **Amends** [0110](0110-maps-and-places-frontend-architecture.md) §1 — "the user's label is preserved on enrich" now covers `icon` as well as `name`, and it is a rule with a surface rather than an implementation detail (§4).
> **Builds** [0131](0131-map-search-is-a-control-not-a-screen.md) §9 (the long press, designed there and unbuilt since) on [0145](0145-the-canvas-takes-a-one-finger-zoom.md)'s recogniser.
> **Relates** [0112](0112-place-in-trip-is-referenced-not-cached.md) (a `Place` with no reference is cache-only — why every add must also create one), [0115](0115-plan-mode-place-research.md) §1/§3 (armed by intent; the uncategorised `MaybeItem` and its free vet link), [0109](0109-map-tab-design.md) §11 (session 76's rejection of a category picker on quick-add, and why the map differs), [0121](0121-embedded-map-phase-6-design.md) §4 (a re-instantiation is billed), [0122](0122-map-split-controls-over-the-canvas.md) §7 (`.map-placecard` is the row wherever the sheet cannot show it), [0134](0134-the-map-is-where-a-forms-place-comes-from.md) §1/§3/§5 (the trip answers first; the verbs change rather than accumulate; the row's measured height), [0136](0136-an-event-can-also-be-booked.md) (`useDerivedField`'s origin), [0107](0107-per-place-timezones-and-multi-zone-time.md) (`Place.timezone`, and the gap this phase found in it), [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) §3/§6 (the cost envelope and the hard cap), [0129](0129-map-camera-moves-like-a-camera.md) §3 (do not re-derive Google's projection), [0132](0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md) §6 (a ring is a different silhouette, not a rung on the pin ladder).

## Context

Phase 6 is the epic's last feature work and its only spending one. (a) was closed in session 158 by a session not looking at it — ADR-0132 §7 switched the paid half to Text Search, which returns each result **with its location**, so "see where it is before you pick" is answered for free. What was left was **(b) drop a pin manually** and **(c) tap one of Google's own sight icons**.

**(c) exists because ADR-0125 §6 re-enabled Google's sights.** A tap on the Eiffel Tower's icon arrives as a map click carrying a **`place_id`**, on a thing the user is already looking at — which sidesteps the fact that blocked (a) for three weeks, since nothing has to be searched, previewed or session-tokened. But §6 also **deliberately** made that tap clear our selection, on the owner's rejection of the alternative: _"they might go one over another and become a mess."_ So (c) could not be built by exempting the tap. That was the collision to design around, and it is the interesting part.

**And then the scope changed, correctly.** Mid-design the owner asked for **renaming a place**, from the sheet's rows and from the canvas. Treating that as a fifth feature is what made the first pass incoherent. It is not a fifth feature — see §4.

## Decision

### 1. The long press is a third phase of the canvas's existing recogniser, not a second mechanism

ADR-0131 §9 asked whether the shelf's `useHoldToDrag` extracts cleanly, and said to **ask first** if it meant a substantial refactor. **It does not extract, and the reason is better than the answer:** by the time §9 was written the canvas had no gesture pipeline. ADR-0145 gave it one.

`useDragZoom` already owns this pane's pointer stream, and owns it in the only way that works here: **capture-phase** listeners on `.map-pane` (Google's listeners are on descendants and its pan **writes the camera on the first move**); all three event streams suppressed (`pointer*`, `touch*`, `mouse*`), because `stopPropagation` on one says nothing to another; attached **at mount**, never at arm time, which is session 116's scar; pointer capture taken at arm, and a one-shot capture-phase `click` swallow on release.

`useHoldToDrag` is bubble-phase, and its machinery is about a **row that unmounts mid-drag** while a ghost follows the finger — none of which a canvas long press has. Making it capture-phase and canvas-aware is the substantial refactor §9 told us to ask about, and we would be refactoring it **towards something that already exists**.

**And a second pipeline beside `useDragZoom` is not merely duplication — it is a race.** Two capture-phase `pointerdown` listeners on the same element both run (`stopPropagation` does not stop listeners on the same node), so they would contend for `setPointerCapture` on one pointer id and both arm a one-shot click swallow.

So the long press is a **new phase in the pure recogniser**, and `lib/drag-zoom.ts` becomes **`lib/canvas-gestures.ts`**: a file named for one gesture that now holds two would mislead the next reader, and this repo renames those (`peek`→`map`, `GHOST_SCALE`→`ASIDE_SCALE`).

**The arbitration with the one-finger zoom then falls out rather than being written.** That gesture is a double-tap whose second finger stays down, so it arms on a `DOWN` that **pairs**; a long press is a single `DOWN` that does not. One state machine sees both, and it cannot emit a hold from `ARMED` because that is a different branch of the same `switch`. A tap-then-hold is a drag zoom; a hold is a drop. **Two gestures that would have needed arbitrating are instead two arms of one conditional** — which is the whole argument for putting it here.

**The timeout arrives as a synthetic event.** A hold is the _absence_ of anything for the hold window, and a reducer over `(type, x, y, t)` cannot observe absence. So the imperative half runs the timer and feeds `HOLD`, which keeps every branch of the recogniser a table the suite can drive with no Google in the process (ADR-0121 §13's standard). The timer is cancelled by a move past slop, an up, a cancel, or the pairing that arms a zoom.

**And arming a click swallow requires a disarm.** A completed gesture arms a capture-phase listener to swallow the one `click` the release fires. The DROP path first copied `SETTLE`'s arm **without** it. `SETTLE` survives that because a drag reliably ends in a click; a long press does not, because the pipeline `preventDefault`s the touch stream that would have synthesised one. The listener then strands and eats the user's next genuine tap — which presents as "the icon picker won't close", since a picker's dismissal is exactly a bubble-phase `click` on `document`. Three disarms (the click, the `DRAG_CLICK_SWALLOW_MS` fallback, unmount), and the fallback is the reason `useHoldToDrag` carries one.

**Amended (2026-08-02, [ADR-0157](0157-a-place-can-be-removed.md) §2) — the recogniser reports WHAT the press landed on, and the long press has two objects.** A marker is a DOM overlay inside `.map-pane`, so a hold over a pin always reached this same recogniser — and was answered the same way, which means the gesture used to drop a **second place on top of the one under your finger**. The fix is inside the one machine, exactly as this section demands: the recogniser latches the press's `target` at `pointerdown` and hands it to `onHold` alongside the point; `MapPane` resolves `data-pin`; the screen makes a place, or opens that place's menu. The recogniser still does not know what a pin is, and there is still one pipeline.

### 2. The point comes back through Google's own projection, in world coordinates

A long press yields a **pixel**; the write needs a `LatLng`. ADR-0129 §3 warns against re-deriving Google's projection maths, and ADR-0145 §3's amendment already established the way through that: work in **world coordinates**, where the relationship between world units and screen pixels is a pure power of two, and let `fromLatLngToPoint`/`fromPointToLatLng` carry every nonlinear part.

`zoomAboutPoint` is that arithmetic for a zoom. A long press needs its plainer sibling — `latLngAtOffset`: centre in world units, plus the pixel offset from the canvas centre divided by `2^zoom`, projected back. **There is no Mercator in it, which is the point.** It degrades the same way the double-tap anchor does: no projection yet (a map that has not rendered) means no drop, rather than a wrong one. The round trip itself is `throughProjection`, **extracted** from `anchoredCentre` when the long press became its second caller.

### 3. Two data-model answers Phase 6b owned, and one gap it exposed

- **The nullable `@@unique([tripId, googlePlaceId])` does let several coordinate-only places coexist.** Postgres treats `NULL`s as distinct in a unique index (`NULLS NOT DISTINCT` is opt-in and not used here), so N dropped pins on one trip are N rows. **Verified against a real Postgres, not reasoned** — this is precisely the assumption the phase was told to check rather than assume.
- **`createPlace` already accepts what a dropped pin is.** `createPlaceSchema` has `name` required and `googlePlaceId`/`lat`/`lng` optional, and `places.service.create` writes `lat`/`lng` straight through. So (b) needed **no** endpoint change — which the backlog had listed as a blocker on the strength of "the only create path is `createPlace({ name })`". That was true of the _call sites_, not of the endpoint. (`icon` is a change, and it is §5's, not this one's.)
- **But `create` never resolved the timezone, and that is a real gap this phase must not walk past.** `resolveTimezone` (geo-tz) was called only on the enriched path, because until now the only place with coordinates came from Google. A dropped pin has coordinates and would land with `timezone: null`, so ADR-0107's per-event zone would silently fall back to the trip's — wrong for exactly the traveller who drops a pin across a border. The zone is now resolved in `create` too, and re-resolved in `update` when **both** coordinates change. **It is a fix to the endpoints, not a special case for the map:** any caller that supplies coordinates gets the zone, which is what the field meant all along.
- **No reverse geocode.** §9's call, unchanged: it is paid, and the user is typing the name anyway. The coordinates are shown instead, as confirmation that the pin fell where the finger was. ([ADR-0148](0148-the-place-form-has-the-room-it-needs.md) §1 makes that the card's **one** quiet line, in `Field`'s hint slot — a drop shows the point, the other sources show the address, and never both a hint and a coordinates row.)

### 4. Four sources, one form, because a place's NAME is the user's

This is the decision the rewrite exists for, and the one that made the feature coherent rather than bolted on.

|                   | 6b long press      | 6c Google's sight               | A search result                    | Rename                     |
| ----------------- | ------------------ | ------------------------------- | ---------------------------------- | -------------------------- |
| Arrives with      | a `LatLng`         | a `LatLng` **and** a `placeId`  | a name, address, point             | a `Place` in the trip      |
| Name field opens  | empty              | empty, Google fills it          | prefilled (Google's)               | prefilled (whatever it is) |
| Costs             | nothing            | one Details call **on confirm** | nothing (Text Search paid already) | nothing                    |
| Vet before commit | you chose the spot | the free `place_id` deep-link   | the free deep-link                 | it is already yours        |

**The 6c column above is history, not behaviour** — [ADR-0148](0148-the-place-form-has-the-room-it-needs.md) §6 removed that source on the owner's report the same day, so the shipped form has **three**. The rest of this section is unchanged by that: the claim was never about the count.

**They are one act in four states, and the state is only what the field starts as.** So they share one form — **name · the app's own `IconPicker` · nine categories** — and only the title, what is prefilled, the hint and the confirm's word differ. A fifth source is a new spec object, not a new flow.

**AND IT IS NOT A NEW POLICY — IT IS AN EXISTING ONE GETTING A SURFACE.** `places.service.ts`'s `enrichExisting` writes `googlePlaceId`/`address`/`lat`/`lng`/`timezone` and **deliberately not `name`**; `createEnriched`'s own comment states the other half ("a fresh pick has no user-authored name, so it takes Google's displayName"). _Your name outranks Google's_ is already how this system behaves, **implemented as an absence**. Renaming is the missing way in to a rule the backend has always kept — and `icon` now sits on the same protected side of it.

**The next three paragraphs are the removed 6c source and describe nothing that ships** ([ADR-0148](0148-the-place-form-has-the-room-it-needs.md) §6): the `stop()`, the unprefilled-name reasoning, the ⟨חלופה⟩ costing, and the free owned-sight rename all went with it. Kept because the _costing_ is the durable part — if prefilling a POI name is ever wanted, this is what it costs.

**A POI tap is answered by OUR card, because Google's is suppressed.** ADR-0125 §6's rule is "never two cards", not "Google answers POI taps" — the owner's words were about a mess, and clearing our selection was the means, not the end. Calling **`stop()`** on the click suppresses Google's info window, so ours is the only one and §6 holds by construction. Our selection still clears, exactly as §6 says; it is simply replaced by the form rather than by nothing.

**The POI name stays unprefilled**, and the hint says who fills it. Naming a tapped sight before the confirm is a Place Details call — paying to browse, which is the exact spend that blocked (a) for three weeks. Google's own label is already drawn under the finger, which is the preview. Prefilling is **costed, not rejected**: it moves the same Pro-tier mask (`id,displayName,formattedAddress,location`, ADR-0111) earlier rather than adding a tier, and it is kept in the mockup as ⟨חלופה⟩ if the owner later wants it.

**But the trip answers first.** A tapped sight the trip **already owns** needs no call at all — we have its name — so that tap opens the form as a **rename**, free. Same rule ADR-0134 §1 reconciled the errand with.

**The form is the CARD, not a field in the row.** The first pass swapped the name for an input inside `.map-t`, which was elegant while the form was a name alone and has nowhere to put an icon and nine categories. So the form is one card and the pencil is only the way in — and that still reaches both hosts for free, because `screens/Map.tsx` renders the canvas card as `renderRow(…)(cardUsage)`: **the card is the row.**

### 5. `Place.icon` is a real column, at the bottom of the chain

Decided by the owner, accepting the migration: the icon belongs to the **place**, so it must survive deleting the idea it was written through. The alternative (the icon on the existing `MaybeItem`, zero migration) loses it exactly there.

```
chosenIcon(event.icon)              ← a linked event's deliberate pick
?? BOOKING_TYPE_ICON[booking.type]  ← the booking's type glyph
?? chosenIcon(place.icon)           ← NEW
?? iconForCategory(category)
?? DEFAULT_PLACE_ICON
```

**Note the direction, because intuition gets it backwards** and the first draft of this ADR did: a linked event's **deliberate** pick beats the booking's type glyph, not the reverse. The principle is that the deliberate choice at the **nearest scope** wins, and a place is the widest scope — which is why "the place goes at the bottom" is the same rule, not an exception to it. `chosenIcon` is in there because a **default** `📌` is not a pick; it shadowed ✈️ once, and reading `place.icon` raw would bring that back one rung down.

**Only a PICK is ever stored.** A glyph the category derived is not written to `Place.icon`, because storing one would freeze the place's icon at whatever the category said that day and shadow the category from then on. `useDerivedField`'s `touched` is what the write reads.

**And one consequence wider than the feature, recorded here so it is not rediscovered: `Place.icon` disqualifies a cross-trip global place cache.** A user-chosen icon is trip-scoped data about a place, not a property of the entity Google describes — so `Place` stays a row _inside a trip_ (`@@unique([tripId, googlePlaceId])`) rather than a shared record a trip merely points at. If someone proposes that cache later, this is the reason it will not work.

**A category drives the icon until a human says otherwise**, through `lib/useDerivedField.ts` — the mechanism extracted precisely because five hand-rolled `*Touched` pairs said the same thing five times. Three lines: `icon.redrive(iconForCategory(next))` on a category tap, `icon.set(glyph)` on a pick, and `initiallyTouched: Boolean(place.icon)`, which is **the whole of rename's special-casing** — a place that already carries a glyph counts as chosen, so a category tap never stomps it.

**The nine categories are the shipped `EVENT_CATEGORY_OPTIONS`**, so `other` (`כללי`) is present and last because the enum puts it there. There is a **recorded decision against a category picker on quick-add** (session 76, ADR-0109 §11: _"a full category picker in quick-add is clumsy, and a category is not required for a maybe"_), and the map is not quietly overriding it — **the map differs for a stated reason.** There a category is invisible metadata; **here it is the pin's HUE.** Without a choice a restaurant's pin comes out `leisure` green, and on a surface whose entire grammar is "colour = category" that is _wrong information_, not absent information.

**Where the category lands:** on the uncategorised `MaybeItem` every add creates anyway (`verbs.addMaybe` already takes `icon` and `category`), so the form carries one with **no new column**. On a **rename** it is not persisted — a `Place` has no category, and the referencing entity that does is ambiguous the moment there are two ideas on one place (`soleIdeaFor`'s recorded rule: two ideas are two intentions and the screen does not guess). So on a rename the category is the **icon's driver**, and the icon is what persists. This is a real limitation and it is stated rather than hidden.

### 6. The invocation still decides the destination — in ONE composition

ADR-0131 §11's rule is unchanged and is what keeps four sources from becoming four flows. With no errand live, a new place goes to the shelf as an uncategorised `MaybeItem` (ADR-0115 §3, with its toast and undo); under a **row** errand the pick already enriched the row, so the tab clears the errand and selects it; under a **form** errand the place is assigned and the tab returns, with no `MaybeItem`.

**That branch is now written exactly once** (`landPlace`), and every source calls it. It was duplicated in the first build — the parallel copy ADR-0094/0095 exist to undo, in the one composition §11 says must live in one place.

**A `Place` with no reference is cache-only and would not list at all** (ADR-0112), so **every** add must also create one. That is stated as a property in the suite over all three add sources rather than asserted once per flow.

**One shipped behaviour changes, and it is recorded rather than smuggled.** Outside an errand, a search result's `＋ אולי` now **opens the form** instead of shelving straight away (§11's "picked → shelf"). The gain is that the place enters the trip with the name and glyph you chose rather than Google's for you to correct later, and that all four sources really are one form. Under an errand the control is `בחירה` — a different verb answering one question — and it still commits directly: a naming form in the middle of choosing a place for a booking is not that question (ADR-0134 §3).

### 7. The affordance is revealed by selection, and all three rejections are measurements

**Any place is renameable**, including one Google named — otherwise the same row would be editable or not depending on where it came from, which is a distinction the user never made.

Every obvious slot on the row is already spent:

- **`.map-right` is a COLUMN**, so a control _added_ beside `נווט` costs **height** — ADR-0134 §5 measured it, which is why `בחירה` _replaces_ `נווט` and the row stays 73px. A `⋯` there takes it to **113px**.
- **A trailing control on the name line wraps** — ADR-0121's session-148 amendment measured it taking `Ichiran Ramen` to two lines at 390px and a long Hebrew title to five at 360px, which is why the map way-in became the category **badge**, an element that already existed. Here it measures **90px**.
- **The way-in footer already held this argument** — ADR-0135 §1 is the owner rejecting a second entry in that grey box: _"two entries in the same grey box read as a command menu."_

**So the pencil is revealed by SELECTION, and an unselected row pays nothing — which is the whole of the constraint.** That is also the pattern this tab already runs: a selected row reveals `.map-refs` (ADR-0121 §8), carries a create in that block's footer (ADR-0135 §1) and the settle verbs on its reference rows (ADR-0139). It is **16px of layout with a 44px `::after` target**: measuring the first draft caught both reasons that split is needed — a 44px box grew the selected row by 4px, and the negative inline margin absorbing that pulled the button over the ellipsis-truncated name.

It is **absent under an errand**, like every other verb on this row.

**What this section got wrong, and [ADR-0148](0148-the-place-form-has-the-room-it-needs.md) §2/§3 fixed:** the pencil sits on a **sheet row**, so unlike the two canvas gestures it can be pressed at the `full` stop — where the card's room is **−38px** — and on a row whose pin is off screen or not drawn at all. §1's "the gesture can only start on visible canvas" was true of the gestures and false of the pencil. The form now normalises the sheet to `map` and frames its subject from **every** source.

### 8. Two markers, and which one is not a style choice

**6b marks its spot with OUR pin**, dashed — ADR-0011's soft grammar reused for "provisional", not a new colour — and in the category's hue, so the pills move it. It lands on bare canvas, and nothing else says where it went.

**6c and a search result get the app's own RING**, because Google has already drawn a marker there and ours would be **two markers for one place** — the exact mess §6 refused. A ring is already this app's word for "a Google-sourced candidate that is not yours yet" (ADR-0132 §6: a different KIND of object gets a different SILHOUETTE, not another rung on the pin ladder). A **rename** gets no extra marker at all: the place has its own selected pin.

**The camera frames the spot once** through `framePlace`, so the pin you just made is the pin you are looking at. **Offline both gestures are absent**, not disabled: there is no canvas offline, so neither has anywhere to happen (ADR-0121 §11).

### 9. What this phase does not do

**No reverse geocode** (§3). **No name for a POI before the confirm** (§4) — and no Details call to browse, ever; if that is wanted it is a new cost decision, not an oversight. **No drag to reposition a dropped pin** — the gesture already puts it where your finger was, and editing coordinates is the place surface's job, not the canvas's. **No category persisted on a rename** (§5), stated as a limitation. **No new tab, no new overlay, no new floating object** (ADR-0126 §1's slot is unchanged). **Nothing is re-instantiated:** both gestures are handlers on the existing pane and the form is the existing card, so no wrapper, no new prop that flips on a tap, no `mapId` change (ADR-0121 §4, ADR-0122 §9).

## Alternatives considered

- **Reuse `useHoldToDrag`.** §1 — bubble-phase, ghost-oriented, and refactoring it towards a pipeline that already exists. This is the rule-8 check ADR-0131 §9 demanded, answered rather than skipped.
- **A second capture-phase pipeline beside `useDragZoom`.** §1 — not duplication but a race, on one pointer id and one click swallow.
- **Google's own `contextmenu` map event**, which would hand us a `latLng` for free and needs no recogniser change. Rejected because it is **not actually independent of the machinery it would avoid**: `useDragZoom` already suppresses the pointer/touch/mouse streams while it owns the finger, so whether a `contextmenu` survives depends on which gesture is in flight — the arbitration would exist either way, split across two places instead of one. It also surrenders the hold duration to the platform and gives no way to keep the native menu down, which we must do regardless.
- **`clickableIcons: false`**, to stop Google answering POI taps. It does not suppress _a card_, it suppresses _the tap_ — the click then carries no `placeId` at all, which deletes (c)'s only free input. It would also undo ADR-0125 §6, whose whole point was that the Eiffel Tower is why you are looking at the map. **Adopted 2026-07-30 ([ADR-0125](0125-map-canvas-terrain-vocabulary.md) §6's amendment), once both halves of this bullet had expired:** [ADR-0148](0148-the-place-form-has-the-room-it-needs.md) §6 removed (c), so nothing reads the `placeId`; and the second half was wrong on the facts — the option takes the **tap**, not the label, so §6's sights set is unaffected and the Eiffel Tower is still drawn and named.
- **Let Google's card answer the POI tap and put our add verb elsewhere** (the controls row, the sheet). Rejected: it separates the verb from its subject, and there is no name in our hand to label it with, so a control somewhere else could not say what it would add.
- **Pay one Details call on the POI tap so the card can name it.** Costed and kept as ⟨חלופה⟩ rather than rejected on taste (§4): it is the same Pro-tier mask a pick already sends, moved earlier. Not built, because an exploratory tap should be free.
- **A `⋯` → sheet for rename, leaving the card to creation.** Rejected on the strongest of the three grounds: a brand-new pin needs a form _somewhere_ regardless, so the app would be saying "a place is made in a card and edited in a modal" — **two grammars for one act**, which is the exact drift `SettleControl` was extracted to undo (ADR-0139's four axes were the vocabulary, not the sizes).
- **A name field inside `.map-t`**, swapping the name for an input in place. Elegant while the form was a name alone; nowhere to put an icon and nine categories once it was not. Superseded by "the form is the card" — which loses nothing, because the card _is_ the row.
- **The icon on the existing `MaybeItem`** (zero migration). §5 — it is lost when the idea is deleted, and the icon is the place's.
- **A cross-trip global place cache.** §5 — disqualified by `Place.icon`, recorded here because it is a tempting future optimisation.
- **A search result keeping its no-form add.** §6 — it would leave one of the four sources speaking a different grammar, and the place would enter the trip with a name to correct later.
- **Normalise the sheet to `map` on a drop**, so the card has room. Rejected: it takes away the list you were reading, and the card renders at every stop for a reason that is not about room — a place that is not in the trip yet has **no row at any stop**, which is the sharpest case of ADR-0122 §7 rather than an exception to it. **Reversed by [ADR-0148](0148-the-place-form-has-the-room-it-needs.md) §2**, on two facts this bullet was argued without: the list you were reading is already behind a keyboard (and the sheet **returns** to its stop, so nothing is taken), and at the `full` stop the card's room is negative, so §7's pencil opens a form that cannot be drawn. The ADR-0122 §7 half stands — the card still renders where there is no row; it renders it at `map`.

## Consequences

- **The Maps & Places epic's feature work is complete.** What remains on it is the device pass's sitting (ADR-0146) and the paid-Routes enhancement, which was always sequenced after the epic (ADR-0121 §14).
- **`Place` gains a nullable `icon` column** (migration `20260730160000_place_icon_adr0147`, additive, no backfill) — and with it, `Place` is now permanently trip-scoped (§5).
- **`enrichExisting`'s omission list is load-bearing and now has two members.** Adding a field to that `data` object hands it back to Google. There is a test that notices.
- **`create` and `update` resolve the timezone for any caller that supplies coordinates** (§3). That is a behaviour change beyond the map, and it is the correct one — stated here rather than left in a diff.
- **`lib/drag-zoom.ts` → `lib/canvas-gestures.ts`**, with its test file and two importers following. A rename, not a rewrite: every existing export keeps its name and behaviour.
- **One free gesture and two paid-adjacent ones now sit on the same canvas.** The cost note that matters: 6c spends **once per confirm**, never per tap; a sight the trip already owns spends **nothing**; and ADR-0108 §6's daily cap bounds it regardless.
- **A search result's add outside an errand now costs one extra tap** (the confirm), and buys a name and glyph you chose. Under an errand it is unchanged.
- **Two device-pass items join ADR-0146's line, and one of them can block rather than tune** — ADR-0131 §9 flagged it and it is still unanswered: whether a long press survives Google's own tiles on a real phone at all. The suite can prove the recogniser correct and cannot prove the platform lets it happen.
- **Touched:** `packages/shared` (`placeSchema.icon`, `createPlaceSchema.icon`), `backend/prisma/schema.prisma` + migration, `backend/src/places/places.service.ts` (the zone on `create`/`update`, the icon), `backend/src/trips/trips.mapper.ts`, `frontend/src/ui/domain/MapPlaceForm.tsx` (new, with its test), `frontend/src/lib/map-pins.ts` (`placeGlyph`), `frontend/src/lib/places.ts` (`mapsPlaceIdUrl`, `coordLabel`), `frontend/src/lib/canvas-gestures.ts` + `useCanvasGestures.ts` + `useMapCamera.ts` (§1/§2), `frontend/src/ui/domain/MapPane.tsx` (the POI `stop()`, the two gestures, the draft marker), `frontend/src/screens/Map.tsx` (the four sources, `landPlace`, `applyAuthored`, the pencil), `frontend/src/screens/map.css`, `frontend/src/ui/domain/map-pane.css`, `frontend/src/i18n/he.ts`.

## Build log

**2026-07-30 (session 197) — built.** Six things worth knowing, in the order they cost something:

1. **The `hidden`-is-inert gotcha did not apply, and that is worth saying.** The mockup needed `[hidden] { display: none }` re-asserted over its new flex/grid containers, because a static HTML file toggles visibility that way and an explicit `display` beats the attribute. React renders the form **conditionally**, so the state cannot arise — and adding the rule anyway would have been dead CSS carried forward as a rule. The app has no `[hidden]` rule anywhere, which is the same fact from the other end.
2. **A grid child's `min-width: auto` did apply**, and it is stated once as `.map-draft > * { min-width: 0 }` rather than per child, so the next row added to the card inherits the fix.
3. **`dir="auto"` on the name input was wrong, and only in the state a value test would miss.** On an INPUT it sniffs the **value**, so an empty field has no strong character, falls back to LTR, and left-anchors the Hebrew placeholder `שם המקום`. Caught on the render, not by the suite. No other text field in this app sets `dir` at all — inheriting the page's RTL is the idiom, and a Latin name typed into it still reads left-to-right because bidi resolves the **run**, not the field. Pinned across all three states (empty, Hebrew, Latin), because "it looks right with a Hebrew name in it" was true the whole time it was broken.
4. **The `.map-t` gap was left at 6px.** The mockup's delta restated the whole rule with `gap: 2px`, but the rest of that block was already true of the shipped `.map-t` — the 2px was incidental, and it also spaces the 🔒 on every hard row. Not a redesign to decline it; a shared value the delta touched in passing.
5. **The form's category pills use `layout="pills"` without `compact`** — words plus glyphs, the same `EventForm` renders. The mockup hand-wrote labels while carrying `compact` on the container, which in the app means glyph-only. The labels are what was drawn, so the labels are what shipped.
6. **Every test was verified against the un-fixed code before being believed**, which is the standard the click-swallow fix set. Reverting `chosenIcon` in the glyph chain, `initiallyTouched`, `redrive`→`set`, `landPlace`'s reference, the pencil's `selected` gate, `create`'s zone, and `enrichExisting`'s omission each fail the tests written for them — and `dir="auto"` fails the one written for the defect above.
