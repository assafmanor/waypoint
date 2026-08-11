# Session 252 — a blank title is the Place's answer (field report #37, workstream P reopened)

**Date:** 2026-08-11
**Workstream:** `P`, the reopened half. [Session 249](2026-08-11-session-249-third-incremental-field-reports-addendum.md) §4 refined #30's latch into a **precedence** and named three residuals in `EventForm`; all three held on `main` (`1a79ffe`) and this is the fix.
**Touches:** `frontend/src/lib/places.ts` (+ test), `frontend/src/ui/EventForm.tsx` (+ test), `frontend/src/ui/BookingSheet.tsx` (+ test), `frontend/src/screens/Map.test.tsx`, `docs/backlog.md`.
**No ADR** — this refines behaviour no ADR owns, and nothing it does contradicts ADR-0163 §3 (a hire is named by its company, then the type label) or ADR-0150 (the refusal is still made at the field). **No mockup:** no new surface; a placeholder that was already a value in one form becomes one in the other.

## 1. The three residuals, re-confirmed before anything was touched

All three are #565's, and all three were still on `main`:

1. `EventForm:367` **copied** the Place's name into the field's own value (`title.redrive(placeDerivedTitle(…) ?? '')`), and `:522` persisted whatever was in the box.
2. `useDerivedField.set` marks `touched` on **any** keystroke, so the keystroke that emptied the box left `touched: true` with `''` — and `:495`'s `titleRequired` then refused a save that **nothing in the open form could cure**. That is the owner's report verbatim. (A reopen recovered, via the value test — but only after a save that could not happen.)
3. `:686`'s placeholder was the generic `t.eventForm.titlePlaceholder` where the owner wants the Place's name, which `BookingSheet:1007` has shown since field report #9.

## 2. The design question, and what was chosen

**Save-time resolution, not read-time.** The persisted `Event.title` carries the resolved string, exactly as `BookingSheet`'s `finalTitle` has always written it. Read-time (store blank, resolve in every consumer) was rejected on evidence rather than on preference: a grep for a display-side fallback finds **none** — no card, rail, list, Map row, readiness read or change-feed line has any notion of "untitled, ask the Place". Read-time resolution would therefore mean teaching every one of them a rule that does not exist today, and the first consumer to miss it renders a blank name. The owner's "do not copy into explicit title state" is about the **authoring field**, and that is where it is honoured: the box holds the explicit half only.

**What makes the two halves safe is the value test, kept from #565.** A stored title equal to what its Place currently derives reopens as the derivation's answer — the box opens empty and the Place goes on answering. Anything else opens as the text a person typed. No persisted explicitness bit, no schema change, and `chosenIcon`'s reasoning is unchanged and unrepeated here.

## 3. What was built

**One precedence, in one function.** `lib/places.ts` gains `effectiveTitle(...candidates)` — first nonblank wins, trimmed. It is `BookingSheet`'s own `finalTitle` chain generalised (rule 8) rather than a third algorithm: that sheet now calls it with `(title, placeName, typeLabel)` and `EventForm` with `(title, placeName)`. Booking's type-label tail and its route/hire exceptions are untouched.

**`EventForm` holds the explicit half only.** The title stopped being a `useDerivedField` pair and went back to a plain `useState` — not a regression to what #565 replaced, but the mechanism becoming unnecessary: **the emptiness is the provenance**. So `pickPlace` touches no title state, the name in force (`finalTitle`) is recomputed each render from whatever place is linked **now**, and four consumers read that one value: the box's placeholder, the errand's label, the save, and — through the save — everything downstream of `Event.title`. Changing the Place while the box is blank changes the name; typing overrides; deleting hands control back; whitespace is blank at every rung.

**Two things went with the flag they served.** `EventFormDraft.titleTouched` is gone: an untouched title travels as `''` and the place it comes back with answers on the next render, so there is nothing for an errand to catch up on. `titleAfterErrand` **survives with one caller** — `BookingSheet` still carries the derived name as its field's _value_, so its errand round trip still needs the catch-up. It is documented as such at the definition; the day both forms author alike, it goes.

**One hole found while building, and it is the shape of the whole change.** The value test and the name in force must read the **same** place, or a form can decide a stored title is derived and then have nothing to derive it from. A booking-linked event is exactly that case: it authors no place here (ADR-0051), so an event titled after a place it once carried opened with an empty box and refused its own save. Both reads are guarded by `showPlace` now, and the case has a test that fails without the guard (verified by backing it out, not by reasoning).

**The title input gained an `aria-label`.** Its `Field` caption sits over a two-control row (glyph + input) and names neither, and the placeholder is a value now — so the caption is the accessible name, the same call `BookingSheet` made for the same reason.

## 4. Booking parity: checked, not changed — and one honest divergence

`BookingSheet`'s behaviour is asserted, not moved: blank name + place saves the place name, a replacement place follows while blank, a typed name survives a place change and a save, clearing falls back, whitespace-only is blank, a flight stays route-derived, a hire stays company-derived. Two of those are new tests written here; the rest are #565's, and they pass unchanged with the shared function underneath.

**The divergence, stated plainly rather than smuggled:** Booking still _copies_ the derived name into its input's value (via `initial.title`/`titleAfterErrand`), where Event now shows it as a placeholder over an empty box. Both resolve the same effective name and both save the same string, so no acceptance case here fails — but the owner's "do not fill/copy the text just to create a title" reads as general, and if it is, `BookingSheet` wants the same treatment. Out of scope by instruction and not done on a guess; noted on the backlog's `P` line so it is not lost.

## 5. Tests

Every case on the owner's acceptance list, at the layer that can see it:

- **`places.test.ts`** — `effectiveTitle`'s four rungs: explicit wins, each blank falls through in order, whitespace-only is blank at every position, and the empty answer that _is_ the Event's refusal.
- **`EventForm.test.tsx`** — the box stays empty while the placeholder becomes the Place that came back; a replacement Place changes the placeholder **and the saved title**; a typed name survives a Place change, an errand and the save; the draft carries the explicit text and no flag beside it; **deleting a typed name restores the Place's and produces no refusal** (the reported dead end); whitespace-only derives where a Place can answer and is refused where none can; **removing the Place restores the refusal**; a place-named event reopens derived and a typed one reopens chosen; a **booking-linked** event keeps its stored title even when a place shares it; a derived title is still not an unsaved change on open; the derived name is still saved with no typing at all. The `#31` icon block is untouched and green — the icon still rides `useDerivedField`.
- **`BookingSheet.test.tsx`** — §4's parity block.
- **`Map.test.tsx`** — the Map's way in prefills a place, so its form's placeholder is now that place's name; the helper queries the box by label. That failure was the fix working.

Full frontend suite green (207 files, 3482 tests — ten more than the 3472 session 251 left), `pnpm typecheck` and `pnpm build` clean.

**Not covered, and said rather than implied:** no device pass — every assertion here is jsdom, and the one thing a phone would add is whether the placeholder reads as a name rather than as a hint at real text scales (workstream `S`'s question, on a different control). And the value test's documented cost is unchanged: type a Place's own name by hand and the app cannot tell you chose it, so the derivation keeps following — which costs nothing, because what it re-derives is what you typed.
