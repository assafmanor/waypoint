# Session 197 — the place form is built (ADR-0147)

**Date:** 2026-07-30
**Branch:** `claude/maps-device-pass-panel-07sxmg` (PR #381, continued from session 196)
**ADR:** [0147](../decisions/0147-a-place-is-made-on-the-canvas.md) — **rewritten and Accepted.**
**Spec:** [`mockups/map-make-a-place-v1.html`](../../mockups/map-make-a-place-v1.html), read in a browser.

Session 196 designed it and stopped. This session built it: Phase 6(b) + 6(c) plus naming/renaming, four sources through one form. The Maps & Places epic's feature work is now complete.

## 1. What shipped, in the order it matters

**`ui/domain/MapPlaceForm.tsx`** — the one form. Presentational, and every varying thing is data (`MapPlaceFormSpec`), which is the design's whole claim made structural: a fifth source is a new spec object, not a new flow. The app's own `IconPicker`, the shipped `EVENT_CATEGORY_OPTIONS`, `useDerivedField` for the category→icon derivation, and `Field` for the label/hint/error shell. Reset by `key`, not by a synchronising effect.

**`Place.icon`** — a real column and a migration, at the bottom of the resolution chain. The build made one decision the design left open and it turned out to matter: **only a PICK is stored.** A glyph the category derived is not written, because storing one would freeze the icon and shadow the category from then on — the same defect `chosenIcon` exists to undo one rung up. `useDerivedField.touched` is what the write reads, surfaced through the form's value as `iconTouched`.

**`lib/map-pins.ts`'s `placeGlyph`** — the chain's bottom two rungs as one function, because the pin, the row and the card all ask.

**The backend's timezone gap**, fixed in `create` **and** `update`. The ADR only named `create`; `update` had the same hole and would have grown it the moment a place could move.

**The two rule-8 defects the held WIP commit named, both paid.** `addResult`'s three-way destination branch extracted to `landPlace` with every source calling it; `.map-draft-cancel` gone for `.map-gbtn`, and the hand-rolled label/hint/error gone for `Field`.

## 2. One behaviour change, recorded not smuggled

Outside an errand, a search result's `＋ אולי` now opens the form instead of shelving straight away — amending ADR-0131 §11's "picked → shelf". Under an errand the control is `בחירה`, a different verb answering one question, and it still commits directly. The existing test for the old behaviour was rewritten rather than deleted, which is where the change is visible in the diff.

## 3. What the mockup got right about itself, and one thing it did not

The `APP-CSS` binding kept earning its keep in both directions:

- **The `hidden`-is-inert gotcha did not apply**, and noticing that is the point. It exists because a static HTML file toggles visibility with the attribute; React renders the form conditionally, so the state cannot arise. Adding the rule anyway would have been dead CSS carried forward as a rule — the app has no `[hidden]` rule anywhere, which is the same fact from the other end.
- **The grid child's `min-width: auto` did apply.** Stated once as `.map-draft > * { min-width: 0 }` rather than per child.
- **`.map-t`'s gap was left at 6px.** The mockup's delta restated the rule with `gap: 2px`, but everything else in that block was already true of the shipped `.map-t` — the 2px was incidental, and it also spaces the 🔒 on every hard row. Declining a shared value a delta touched in passing is not redesigning.
- **The category pills kept their words.** The mockup hand-wrote labels while carrying `compact` on the container, which in the app means glyph-only. What was drawn is what shipped.

## 4. The defect the render caught, and the suite could not have

**`dir="auto"` on the name input left-anchored the Hebrew placeholder.** On an `<input>`, `dir="auto"` sniffs the **value** — and an empty field has no strong character, so it falls back to LTR and `שם המקום` sits at the left. Reported by the owner off a screenshot.

Two things worth keeping from it:

1. **No other text field in this app sets `dir` at all.** They inherit the page's RTL, and a Latin name typed in still reads left-to-right because bidi resolves the **run**, not the field. ADR-0118's rule is against `dir="ltr"`, and its "or no `dir`" is this. Reaching for `dir="auto"` was inventing a second idiom on a surface that had one.
2. **The state that broke is the state a value test skips.** With a Hebrew name in it the field looked right the entire time. So the regression test asserts across all three states — empty, Hebrew, Latin — which is the same shape as everything else pinned this session.

## 5. Properties, not values — and each one verified against the un-fixed code

The epic has been corrected on a real device five times, every time with the tests asserting what the code did while the model was wrong. So each thing landed was asked what property it must satisfy, and then the property was **checked by breaking the code**:

| Property                                                    | Broken by                            | Caught  |
| ----------------------------------------------------------- | ------------------------------------ | ------- |
| A stored placeholder glyph does not shadow a category       | reading `place.icon` raw             | 1 test  |
| A category drives the icon; a human's pick is never stomped | `initiallyTouched: false`            | 2 tests |
| …and for **no** category, once a human has spoken           | `redrive` → `set`                    | 4 tests |
| **Every** add creates a reference (ADR-0112)                | removing `addMaybe` from `landPlace` | 5 tests |
| The pencil is on exactly the selected row                   | dropping the `selected` gate         | 5 tests |
| A place with coordinates gets a zone                        | reverting `create`'s `timezone`      | 2 tests |
| Enrich never overwrites an authored field                   | adding `name` back to its `data`     | 2 tests |
| The name field never forces a direction                     | `dir="auto"`                         | 1 test  |

Two of them are exhaustive over `EVENT_CATEGORY` rather than sampled, and that is deliberate: "food gives 🍽️" would pass with the derivation wired to the wrong glyph, and a guard that leaks on one category is only caught by a test that tries all nine.

## 6. Rendering the built component against the real stylesheets

The Map tab cannot be driven headlessly — it needs a browser key — so the form was rendered to static HTML from the **shipped component**, wrapped in the mockup's own phone chrome with the same `APP-CSS` manifest, and screenshotted at 390 and 360. That is what caught §4 and what confirmed the icon panel floats rather than expanding the card. It is not a canvas pass: the gestures themselves are still the device pass's (ADR-0146), and whether a long press survives Google's own tiles is still the one item that can block rather than tune.

## What is next

The device-pass sitting (ADR-0146): 12 open questions needing a real phone with a browser key, plus ADR-0131 §9's long-press question, which this build cannot answer and the suite cannot either.
