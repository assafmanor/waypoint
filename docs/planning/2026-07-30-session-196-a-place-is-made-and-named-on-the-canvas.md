# Session 196 — a place is made, and named, on the canvas (design)

**Date:** 2026-07-30
**Branch:** `claude/maps-device-pass-panel-07sxmg` (restarted from `main` after #380 merged)
**ADR:** [0147](../decisions/0147-a-place-is-made-on-the-canvas.md) — **PROPOSED, not built.** Its §1–§7 cover the two gestures; the naming/renaming half arrived mid-session and the mockup is the current record.
**Mockup:** [`mockups/map-make-a-place-v1.html`](../../mockups/map-make-a-place-v1.html) — the spec for the build.

A design session, and it was **redirected twice**. It began as Phase 6(b)+(c) and I started building; the owner stopped it — _"design this whole thing as a ui/ux design expert, think design language and most intuitive. Then mockup. Only after deciding we continue to build"_ — and then added naming/renaming on top, which reframed the whole surface. That order was right and the build I had started was wrong to have started.

## 1. What the scope turned into, and why it is one thing

Three gestures plus a fourth capability, and treating them as four features is what made the first pass incoherent:

- **6b** a long press on the canvas drops a pin — a coordinate and nothing else (no name, no `place_id`, no reverse geocode).
- **6c** a tap on one of Google's own sights — a coordinate **and** a `place_id`, on a thing you are already looking at.
- **A Google search result** — the add that ships today, straight to the shelf with no form.
- **Renaming any place** — the owner's addition.

**They are one act: a place's NAME is the user's**, and naming and renaming differ only in whether the field starts empty. Four sources, one form.

**And it is not a new policy.** `places.service.ts`'s `enrichExisting` writes `googlePlaceId`/`address`/`lat`/`lng`/`timezone` and **deliberately not `name`**, so a user-authored name already survives Google enriching the row; `createEnriched`'s comment states the other half ("a fresh pick has no user-authored name, so it takes Google's displayName"). Rename gives an existing rule a surface. That find is what made the feature coherent rather than bolted on.

## 2. Three things checked against the code that the design would otherwise have got wrong

- **A `Place` has no category and no icon.** Its columns are `googlePlaceId · name · address · lat · lng · timezone · rating · userRatingsTotal`. The pin's hue is _always_ derived from the referencing entity. `MaybeItem` is what carries `icon`/`category`.
- **The icon hierarchy is the reverse of how it was remembered.** The shipped chain is `chosenIcon(event?.icon) ?? BOOKING_TYPE_ICON[booking.type]` — a linked event's **deliberate** pick beats the booking's type glyph. `chosenIcon` exists because a _default_ `📌` is not a pick and used to shadow ✈️.
- **All nine categories already exist, `other` included.** The mockup's first pass drew five and invented a label (`ביקור`; `sightseeing` is `אתרים`).

## 3. The design

**The affordance is revealed by selection**, which is the pattern the tab already runs — a selected row reveals `.map-refs` (ADR-0121 §8), carries a create in its footer (ADR-0135 §1) and the settle verbs on its reference rows (ADR-0139). So a pencil beside the name on the **selected** row costs an unselected row nothing, which is the whole of the measured constraint.

**Every in-row slot is spent, and all three rejections are measurements** — drawn in the mockup's §D rather than asserted: a `⋯` in `.map-right` takes the row to **113px** and a control on the name line to **90px**, against the **73px** ADR-0134 §5 protects; and ADR-0135 §1 is the owner rejecting a second control in the way-in footer.

**The form is the card, not a field in the row.** The first pass swapped the name for a field _inside_ `.map-t`, which was elegant while the form was a name alone and has nowhere to put an icon and nine categories. So the form is one card and the pencil is only the way in — which still reaches both hosts, because `screens/Map.tsx` renders the canvas card as `renderRow(…)(cardUsage)`: the card **is** the row.

**Decided by the owner, in order:** any place is renameable (not just coordinate-only ones); a real **`Place.icon`** column, accepting the migration; the POI name stays **unprefilled** so an exploratory tap is free; the icon picker is the app's own **`IconPicker`**, floating rather than expanding the form; nine categories including `other`; and **a category drives the icon until a human says otherwise**, via the existing `useDerivedField` whose `initiallyTouched` covers rename with no special case.

**One consequence wider than the feature, recorded so it is not rediscovered:** `Place.icon` **disqualifies a cross-trip global place cache.** A user-chosen icon is trip-scoped data about a place, not a property of the entity Google describes, so `Place` stays a row inside a trip (`@@unique([tripId, googlePlaceId])`).

**The POI collision is resolved by suppressing Google's card, not by exempting the tap.** ADR-0125 §6's rule is "never two cards" — the owner's words were about a mess, and clearing our selection was the means. `event.stop()` suppresses Google's info window, so ours is the only card and §6 holds by construction.

## 4. What rendering against the app's real CSS caught — six defects, in my own proposal

The `APP-CSS` binding earned its keep, and every one of these would have shipped:

1. **`hidden` is inert on an explicit `display`** — the new flex/grid containers showed three surfaces at once.
2. **The draft card had no surface at all** — `.map-placecard` is positioning only; the card look comes from its `.place` child.
3. **A 44px button grew the selected row 4px and its negative margin overlapped the ellipsis-truncated name** — now 16px of layout with a 44px `::after` target, hit-tested.
4. **Confirm/cancel overflowed the card** — a grid child defaults to `min-width: auto`.
5. **The pending pin was drawn on top of Google's own sight icon** — two markers for one place. Now the app's own **ring** (ADR-0132 §6's silhouette for a Google candidate that is not yours yet).
6. **The uncategorised fallback hue is `leisure`**, not the `services` the first pass guessed.

Plus one process defect: the mockup was **not in `.prettierignore`**, so `pnpm format` reflowed the generated CSS block and made the inliner non-idempotent — which is exactly what that list exists to prevent.

## 5. A real bug found in the build I had started

The owner reported the `IconPicker` not closing on an outside tap and attributed it to the app. **It is not there** — the picker registers a back layer and a `document` click listener gated on `open`. It was in **my** pipeline: a completed gesture arms a capture-phase listener to swallow the one `click` the release fires, and the DROP path copied `SETTLE`'s arm **without a disarm**. `SETTLE` survives that because a drag reliably ends in a click; a long press does not, because the pipeline `preventDefault`s the touch stream that would have synthesised one. The listener strands and eats the user's next genuine tap — and the picker's dismissal is exactly a bubble-phase `click` on `document`.

`useHoldToDrag` already carried the fallback **and** the note. Copying the arm without the disarm is how the shelf's lesson got lost on the way to the canvas. Fixed with three disarms (the click, `DRAG_CLICK_SWALLOW_MS`, unmount — the last because the arm outlived the effect's cleanup, which was removing a listener that was no longer the one registered), and covered by `lib/useCanvasGestures.test.tsx`. **Verified by reverting the fix:** two of the seven fail against the old code, so they test the bug rather than the implementation.

## 6. Rule 8, honestly

Applied unevenly on the first pass, and the owner caught it. Right: the recogniser extended rather than a second pipeline; `anchoredCentre`'s projection round trip **extracted** to `throughProjection` when the long press became its second caller; `DRAG_HOLD_MS`/`DRAG_HOLD_SLOP_PX` reused rather than a new `MAP_HOLD`; `mapsSearchUrl` reused; `useDerivedField` and the real `IconPicker` reused. Wrong, and **still owed by the build**: `screens/Map.tsx` duplicates `addResult`'s three-way destination branch instead of extracting it — the parallel copy ADR-0094/0095 exist to undo, in the one composition ADR-0131 §11 says must live in one place — and the draft card mints `.map-draft-cancel` where `.map-gbtn` exists and hand-rolls label/hint/error markup where `Field` is exactly that shape.

## 7. State of the branch

Six commits: five design, one **held WIP** (`372d49a`) that typechecks and is green but implements the superseded half and carries the two defects above in its own message. `Place.icon`, the form, the affordance and the four wirings are **unbuilt**.

## What is next

The build, in a fresh session — the mockup is the spec and ADR-0147 needs rewriting to match it. The device-pass sitting (ADR-0146) is still owed and still needs a real phone.
