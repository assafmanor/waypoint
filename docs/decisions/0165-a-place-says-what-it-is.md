# 0165 — A place says what it is, and the pills that say it write

**Status:** Accepted. **Built 2026-08-04.**
**Date:** 2026-08-04

**Closes** an owner report: _"setting a place category & icon isn't working (it's a no op), no network error or console error."_ Both halves were true, and one of them was already written down as a limitation.
**Amends** [0147](0147-a-place-is-made-on-the-canvas.md) §5's _"on a **rename** it is not persisted — a `Place` has no category, and the referencing entity that does is ambiguous… This is a real limitation and it is stated rather than hidden."_ The limitation is now removed rather than restated: a `Place` has a category.
**Extends** the same section's argument for `Place.icon` — _"the icon belongs to the place, so it must survive deleting the idea it was written through"_ — to the second field it applies to word for word.
**Applies unchanged** [0038](0038-icons-and-canonical-category.md) (`EventCategory` is the taxonomy; a glyph is a badge over it), [0110](0110-maps-and-places-frontend-architecture.md) §2 (one `place-usage` derivation feeds the chips and the pin), [0019](0019-atomic-writes-and-broadcast.md) (the write is a `ChangeService.mutate`), [0136](0136-an-event-can-also-be-booked.md) §2 (a default nobody touched must not perform a write).

## Context

The map's place form has carried nine category pills since ADR-0147, on the reasoning that stands: on a surface whose grammar is "colour = category", a restaurant's pin coming out `leisure` green is _wrong_ information rather than absent information. Tapping a pill moves the glyph chip, and the pin under the form takes the hue. It reads like a control.

On a **rename** it wrote nothing at all, and the report is exactly right that nothing said so:

- **The category had no column.** `Place` carried `name`, `icon`, and Google's fields. ADR-0147 §5 sent the category to the `MaybeItem` an add creates and, on a rename, dropped it — recorded as a limitation, with the ambiguity that justified it (`soleIdeaFor`: two ideas on one place are two intentions and the screen does not guess).
- **And the icon half did not hold up either.** `applyAuthored` writes `Place.icon` only when `iconTouched`, and a pill tap uses `useDerivedField`'s `redrive`, which deliberately leaves `touched` false so a second pill tap still moves the glyph. So the visible glyph changed, `iconTouched` stayed false, the category was dropped, **the patch came out empty and no request was made** — and `applyAuthored` returns early on an empty patch, which is the same code path that (correctly) makes accepting a name as offered cost nothing. A silent success is what a no-op with no error looks like from the outside. `Map.embedded.test.tsx` pinned it as intended behaviour: _"stores a picked glyph on the place, and a derived one nowhere"_, asserting `updatePlace` was **not** called.

So the limitation was not what the owner hit. What they hit is that ADR-0147 §5's own promise for a rename — _"the category is the icon's driver, and the icon is what persists"_ — was false in precisely the case where a category tap is the only act: a place with no stored glyph, which is every place that arrived from a search or a drop without a pick.

## Decision

### 1. `Place.category` is a real column, for the reason `Place.icon` is

Nullable `EventCategory?`, additive migration, no backfill: every existing row reads as "nobody said" and keeps deriving its category from what references it.

The argument is not new, it is ADR-0147 §5's, applied to the field beside the one it was written for. A category a human chose is **data about the place**, so it has to survive deleting the idea it was written through — and the ambiguity that blocked it (which referencing entity should hold it?) is an argument for the place owning it, not against the field existing. The two rejected alternatives are recorded below, and both were live options: the pills could have been deleted instead.

One consequence carries over verbatim: like `icon`, this **keeps `Place` trip-scoped**. A chosen category is this trip's view of a place, not a property of the entity Google describes, so it is a second reason a cross-trip global place cache cannot work.

### 2. The place's own word beats the references', and only about the category

`buildPlaceUsageIndex` resolves `pin.category` as **the place's own if set, else the most-committed reference's**. One resolution, so the pin's hue, the row badge's glyph (`placeGlyph` reads the same value) and the type facet cannot disagree about one place.

This is the same precedence the icon chain already had: `chosenIcon(place.icon)` sits **above** the derived category glyph on every place surface. Saying "this is a restaurant" while a hard sightseeing event is booked there is the case the column exists for, and the derived answer is the one that must yield.

Two boundaries:

- **`commitment` stays the references' to say.** Hard/soft is about the plan, not about the place. Only the category moves.
- **The facet is a UNION, never a replacement.** `usage.categories` gains the place's own alongside the referencing ones — otherwise saying what a place is would take it out of the chip its schedule earned, which is the one thing a filter must not do quietly.
- **An event's own surfaces are untouched.** An `Event` still carries its category and still renders from it; the deliberate choice at the nearest scope wins, which is why a place — the widest scope — wins only where the subject IS the place.

### 3. A pill tap is a choice; the pill it opens on is not

The pills open on the category **in force** (the place's own, else the derived one) so the card opens where the place already is and the glyph chip shows what the pin shows. That seed must not be writable, or every rename that only fixes a typo would stamp the referencing entities' derived category onto the row — a conversion performed by a default nobody touched, which this repo has now fixed twice (ADR-0136 §2's `booked` row, ADR-0136 §4's `kind`).

So the form reports `categoryTouched` beside `iconTouched`, and the host writes only on `touched && changed`. It is the **existing** mechanism, not a new flag pair: `useDerivedField(spec.category)` is exactly this shape (derived until a human speaks), and a hand-rolled boolean beside `icon`'s is what that hook was extracted to prevent. Nothing ever `redrive`s it — the seed changes only when the form is re-keyed — so the hook is being used for `touched` alone, which is the one thing the host needs.

**And ADR-0147 §5's icon rule survives unchanged, now load-bearing rather than lossy:** a glyph the category derived is still never stored. Before this it meant the tap was lost; now the category itself persists and the glyph is a _rendering_ of stored data. Storing the derived glyph too would re-freeze the icon at whatever the category said that day and shadow the category from then on — the defect `chosenIcon` exists to undo one rung down.

### 4. Every source writes it, in the write it already makes

- **A dropped pin** carries it on the `createPlace`, beside the name and the glyph, so the place never exists un-authored and there is no second request to categorise it.
- **A search result and a rename** go through `applyAuthored`, which is one `updatePlace` with a diff — so accepting everything as offered still costs nothing.
- **The idea keeps its own category too.** `landPlace`'s `addMaybe` is unchanged: an idea's category is its own field, it drives the shelf's badge, and the two are free to diverge later. What changed is that the place no longer depends on the idea to remember.

**Amended 2026-08-20** (owner: _"maybe items added from the map don't inherit the place category and icon"_). The bullet above is where this ADR was wrong, and the sentence that gave it away is _"it drives the shelf's badge"_: `addMaybe` receives a category only when the same gesture happened to author one, and on the two add paths the pills open on **nothing** — so accepting a name as offered (the common add) leaves the idea with no category and the shelf's placeholder `💡`, beside a pin the place itself colours and glyphs correctly. Scheduling it then produced an uncategorised event, because `buildScheduleEvent` copies the idea's two fields onto the day.

So an idea's category and glyph are **resolved, not read**: `ideaCategory` / `ideaGlyph` (`lib/shelf.ts`) answer with the idea's own value, else its place's, and the glyph runs the app's icon chain at the rungs an idea occupies — `chosenIcon(idea.icon) ?? chosenIcon(place.icon) ?? iconForCategory(category) ?? 💡`. "The two are free to diverge" survives exactly as stated: an idea's own answer still wins wherever it has one. What no longer happens is an absence being taken for an answer.

Derived rather than copied at creation, for §3's own reason one entity over: a stored copy freezes the idea at whatever the place said that day, and it would leave every idea already on a shelf behind — including the ones this report is about. The consumers are the shelf tile, the block a dragged idea gets (`ideaBlock`/`typicalMinutesFor`), the note badge in the idea's own sheet, `EventForm`'s opening category and glyph, and the two verbs that turn an idea into an event (`schedule`, `החלף`).

### 5. What this does not do

- **There is no way back to "no category".** The pills are single-select with no clear, exactly as they were, and `undefined` from the form means "nothing chosen", never "clear it". A place miscategorised is re-categorised.
- **No custom categories.** `EventCategory` is the taxonomy (ADR-0038); the open-taxonomy question stays deferred with its reasons recorded (ADR-0152's Consequences).
- **No new surface.** The pills were already there on all three sources; this ADR is about where a tap lands, not about a control.

## Alternatives considered

- **Leave the model alone and delete the pills from the rename form.** Honest, no migration, and it was a real option: the form would then only show what it can save. Rejected because it leaves a place permanently uncategorised once it exists — you could say what a place is only in the seconds you added it — on the one tab whose grammar is built out of the answer.
- **Persist the derived glyph on a rename, and nothing else.** The cheap fix: the pills stop being a no-op visually, since the badge and the pin's glyph change. Rejected because the pin's **hue** would still not follow — a place a hard event categorises would keep the event's colour while its glyph said something else — so the control would be half-connected in a way nothing on screen explains. It also re-introduces the frozen-icon defect the icon rule exists to prevent.
- **Write the category onto the referencing entity when there is exactly one live idea (`soleIdeaFor`).** Zero migration, and it works for the add paths. Rejected on two counts: it silently does nothing for a place referenced by an event or by two ideas (i.e. it is the same no-op with a narrower blast radius), and it makes the place's category depend on the lifetime of an idea — which is the exact failure ADR-0147 §5 accepted a migration to avoid for the icon.

## Consequences

- **`buildPlaceUsageIndex` now reads a field off the `Place` row for the pin, not only for `coordless`.** It already took `places` for that reason, so the signature is unchanged — but the derivation is no longer purely a function of the references, which is worth knowing before adding a caller.
- **The pin's hue can now disagree with the day's schedule, deliberately.** A hard event's category no longer decides the colour of the place it is at. That is the point, and it is the one visible behaviour change for a trip that never touches the pills — which none can be, since no existing row has a category.
- **A third field is on the protected side of Google's enrich.** `enrichExisting` omits `name`/`icon`/`category` by construction; the backend spec asserts all three survive a re-pick. Adding a field to that `data` object hands it to Google, and the comment there says so.
- **`MapPlaceFormValue` carries two `*Touched` flags now.** Both exist for the same call-site policy (the host writes only a human's answer), and a third field wanting one is a sign the whole value should carry its seed instead.
- **The test that pinned the defect is now the test that pins the fix**, with its old assertion inverted: a category tap writes `{ category }`, and the derived glyph is still stored nowhere.
