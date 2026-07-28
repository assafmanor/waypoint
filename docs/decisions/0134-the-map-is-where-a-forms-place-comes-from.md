# 0134 — The map is where a form's place comes from, and a row tap **commits**

**Status:** Accepted — designed 2026-07-28 (session 163); **§5–§8 built session 163, and the errand's mechanism + `BookingDetail`'s caller built session 164** (see the [Build log](#build-log-2026-07-28-session-164--the-errands-mechanism-and-three-owner-corrections)). **§2's draft path is built (session 165); §9's retirement is not — `PlacePickerSheet` has one caller left, the Map's own enrich.** Three owner corrections from a device pass are recorded in that log, one of which reverses ADR-0131 §8's grouping. Three owner requests, designed together because they are one idea.
**Date:** 2026-07-28

**Amends** [0131](0131-map-search-is-a-control-not-a-screen.md) **§10** — its conclusion is **reversed by the owner**: the errand becomes the **route** for a form's place, where §10 (after four corrections) made the picker answer in place and the canvas the exception. §10's contract survives; what changes is who takes it and what it has to carry (§1/§2).
**Amends** [0129](0129-map-camera-moves-like-a-camera.md) **§1** — "a pin tap and a row tap PAN, and do not zoom" is **half right**, and this splits it: a **canvas** tap pans, a **list** tap frames (§6). §2's derived span is unchanged and gains callers.
**Amends** [0115](0115-plan-mode-place-research.md) **§2** — "the name links out to the Google Maps place so a candidate can be vetted for free" survives as a **control**, not as the row's body: the row's tap now means "show me where this is" (§5).
**Relates** [0121](0121-embedded-map-phase-6-design.md) §4 (one billed map instance, which kills the obvious alternative) + §8 (the row tap that already drops from `full`), [0122](0122-map-split-controls-over-the-canvas.md) §7 (the card, and the sheet-normalisation rule), [0126](0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md) (height is this surface's scarce axis — the measurement in §5 is that rule applied to a row), [0132](0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md) (the rings a tap now frames, and the chrome this surface reclaims), [0090](0090-back-is-computed-from-nav-state.md) (the return), [0112](0112-place-in-trip-is-referenced-not-cached.md) (why assigning is not the same as shelving), [0017](0017-mobile-first-device-targets.md) (the 44×44 floor the new control meets by geometry), [0120](0120-filter-reveal-is-shared-infrastructure.md) (a collapsed row is hidden in place — which is how this file's own panel first measured the wrong node).

Mockup: [`mockups/map-errand-v1.html`](../../mockups/map-errand-v1.html) — the errand's banner and verbs, the result row's three jobs measured per screen, and the derived frame drawn against the fixed zoom it replaces, computed from the fixture's real coordinates. Its entry in [`design/mockups.md`](../design/mockups.md) carries the detail.

## Context

Three requests, in the owner's words:

1. _"Searching for places on bookings should refer to the map instead of the current place picker used, but make sure that: in choosing a location for an event or booking you are only choosing one place and not adding more and more places, and when you're done you are automatically going back to the form."_
2. _"When in the map search, clicking on a result pans you to the location on the map, instead of opening Google maps, though we should have a button for that."_
3. _"Same for when on list only mode in map search, clicking on a result (saved or not) should open the half mode and pan to the location, dynamic zoom on both scenarios."_

**They are one idea: you choose a place by seeing where it is.** (2) and (3) are what make (1) worth doing — a list cannot tell two Starbucks in Shinjuku apart, and a map can. Designing (1) without them would move the choice to a surface that was not yet better at choosing.

**Three things are already built, so this ADR only claims what is new.** ADR-0129 §2's `focusBoundsFor` already derives a focus span from the distance to the nearest `MAP_FOCUS.NEIGHBOURS` (3) pins, ×1.6 headroom, clamped to 0.0025–0.03° — "dynamic zoom" is not a new rule, it is an existing one gaining callers. A row tap at `full` already drops the sheet to `half` (ADR-0121 §8). And ADR-0131 §10 already specified the errand's `{ target, returnTo }` contract.

## Decision

### 1. The errand is the **route**, and what reconciles that with the correction it reverses

ADR-0131 §10 landed, after four owner corrections, on "the picker answers **in place**; the canvas is the exception path, not the route" — on the owner's own instruction: _"adding places to events/bookings should be reallyyyyy easy and not refer you to the map if you want a place that already exists."_ This reverses that. It is a change of mind, not a re-reading, and it should be recorded as one.

**What reconciles the two is that the map's search now answers both halves.** Its free half filters the trip's own places **from the first character**, at no cost, offline (ADR-0131 §8b's floor is a _cost_ control, so it does not apply to the free side). So "a place we already have" is answered on the map without Google being touched at all. What the earlier correction protected — never buying a search to find something the trip is already holding — is kept. What changes is **where** it happens.

**And the reason to prefer the map is the one the owner's own instinct names:** a place is disambiguated _by place_. Two cafés with the same name in the same district are one list row apart and a kilometre apart on the canvas.

### 2. The errand carries a **draft**, not just a target — and that is the cost that moved

Promoting the errand from exception to route moves its cost from "paid for the rare case" to "paid for every place choice", which makes the form's draft the central problem instead of an incidental one.

A form is a `Modal` with local `useState` — date, start, title, timezone override, `placeId` — and **no URL addresses it** (`EventForm` and `BookingSheet` are rendered by `DayView`/`PlanDay`/`IndexBookingsView`/`PlanHome`/the Map tab). Leaving it for a tab means losing that, and losing a half-typed event is far worse than one extra tap.

So the contract grows one field:

```ts
{ target: { kind, id, field }, returnTo: string, draft: unknown }
```

- **`draft` is an opaque blob the form writes and reads.** The form is re-opened _from it_, not from whatever was in memory. That makes the forms a **third consumer** of the hand-over-and-consume-once pattern `MapScopeProvider` already runs twice (`focusPlaceId`, and ADR-0132's `queryOpen`).
- **`target.field` is not optional**, because a transport booking has **two** place fields. Without it a successful return can assign the right place to the wrong side. The mockup's ⟨רגל של הסעה⟩ state exists to make that visible rather than discovered.
- **The return is `returnTo` with `{ replace: true }`**, and `ביטול` and back both run it — one way out, as ADR-0131 §10 already specified. Cancelling assigns nothing and the draft is restored unchanged.

### 3. One pick, and **the tap is not the pick**

The owner's constraint is explicit: _"you are only choosing one place and not adding more and more places."_ So while an errand is live the verb **changes** rather than being added to: there is no `＋ אולי` and no `MaybeItem` — there is `בחירה`, which assigns to the target and runs the return.

**And the row tap deliberately does not commit.** It frames the place on the canvas (§6), so you can _look_ before choosing — which is the entire reason to be on a map. Two steps, and the second one is explicit. A tap-to-commit would make the surface worse at the job it was moved here to do.

### 4. `בחירה` **replaces** `נווט`, and the measurement is why

While an errand is live, `נווט` is absent from the trip rows. Navigating to a place is not the task when you are picking one for a form, and "a control only where it has something to do" is the derived-affordance rule this tab already runs for `קרוב עכשיו`, `אולי`, `מה נשאר`, `באזור` at zero and `frame` with nothing to frame.

It also pays for itself: `.map-right` is a `flex-direction: column`, so a verb _added_ beside `נווט` costs **height**. Measured in the mockup, the trip row is **73px in both states** — the errand's verb takes the slot rather than a new one.

### 5. A result row's third job, and the actions go **side by side**

Today a result row's whole body is one `<a>` to Google Maps and its only control is `＋ אולי`. It now has three jobs: a tap that **commits** (§6), a **verb**, and a **way out to Google**. So the body becomes a `<button>` and the Google link becomes its own control — a link wrapping the whole row cannot coexist with a tap that means something else.

**The way out is an icon, and it sits beside the verb, not under it.** Both halves of that are measured rather than preferred:

| Result row, at `half`                              | 390×844            | 360×640            |
| -------------------------------------------------- | ------------------ | ------------------ |
| Actions **side by side**                           | 68px → **6 rows**  | 68px → **4 rows**  |
| Actions **stacked** (what `.map-right` does today) | 106px → **3 rows** | 106px → **2 rows** |
| As shipped (one verb, no way out)                  | 64px → 6 rows      | 64px → 4 rows      |

**Stacking halves the results you can see.** `.map-right` is a column, so a second control buys no width and costs height — and height is the axis this surface declared scarce in ADR-0126 ("canvas furniture grows sideways"). Side by side costs 4px per row and no rows at all. The rule is scoped to `.place.result`: a trip row's `נווט` + distance genuinely want the column, and this is not a reason to restack them.

The icon meets the 44×44 floor by geometry (ADR-0017, ADR-0126 §3's insistence), and reuses `.map-navbtn`'s trailing-action grammar rather than inventing one. **What the measurement did not decide:** a _labelled_ Google button also fits — at 360 the row has 237px for name + address. The icon wins on a different argument, and it is worth stating as such: the row already has one labelled verb, and two labelled buttons side by side compete for "which is the action". The icon subordinates the secondary way-out.

### 6. A **row** tap frames; a **canvas** tap pans

ADR-0129 §1 decided "a pin tap and a row tap PAN, and do not zoom", on the owner's report from a real map that being zoomed for a pin you could already see was inconvenient — _"you asked which one it was, not to be taken somewhere."_

**That reason is exactly right for a pin and exactly wrong for a row.** A row in a list is the one case where you _cannot_ see the place, and at the `full` stop there is no canvas at all. So the tap's **source** decides:

| Tap                     | Camera                                                   |
| ----------------------- | -------------------------------------------------------- |
| A pin, or a result ring | **Pans.** You were already looking at it (§1 unchanged). |
| A row, or a result row  | **Frames**, at the derived span (§7).                    |

This completes §1 rather than reversing it wholesale: §1 named two taps together and one of them is a different question.

### 7. The span is already derived. What is new is who calls it, and what a ring's "neighbours" are

`focusBoundsFor` is the rule and it ships (ADR-0129 §2). Two things this adds:

- **Two more callers** — a row tap and a result-row tap, through the same `framePlace` spend-once path an arrival from `מפה` and the card's badge already use.
- **What counts as `others` for a result that is not in the trip:** the trip's pins **plus the other rings**. Choosing between five cafés, the useful context is the other candidates. The rings stay **out of the camera's `points`**, because a query moving the camera is exactly what ADR-0131 §5 forbids — so this is an extra argument at the frame call, not a wider `points` array.

Drawn in the mockup over the fixture's real coordinates, the derived frame is **133×124px against the fixed zoom's 320×297px** — 2.4× tighter for that fixture, which is the difference between "this café, among these three" and "somewhere in Shinjuku".

### 8. From `full`, the tap drops to `half` **first**

Otherwise the framing happens behind the list. This is ADR-0121 §8's rule verbatim — "a row tap normalises the sheet to `half`… because the map it focuses is invisible there" — gaining a second consumer in the result rows. It is one rule, not a new one, and the ordering matters: the sheet moves, then the camera frames what the sheet left.

### 9. What retires

`PlacePickerSheet` — the sheet, not the field. `PlacePicker` stays as the form's **display + launcher** (it shows the chosen place and starts the errand). `AddLocationButton`'s two callers (`BookingDetail`, and the Map tab's own `＋ מיקום`) become errands too: the same "choose exactly one place" question, so the same mechanism. On the Map tab the errand needs no navigation at all — it is already the destination, so it is the query field opening in choose mode against that target.

**Its `בטיול` half is not wasted, and that is worth saying** because it shipped four sessions ago (ADR-0131 §10, session 159): it was the proof that "the trip answers first, free and offline" is the right model, and that model is exactly what makes §1 defensible. The map's free half is the same idea on a surface that can also show you where the answer is.

### 10. What this phase does not do

- It does not reopen the map extreme (ADR-0132 §8's decision is still owed).
- It does not change what a pin tap or a ring tap does (§6).
- It does not touch the free half's floor, the paid half's SKU, or any cost control.
- It does not build ADR-0131 §9's long press.

## Alternatives considered

**Bring the map to the form — a canvas inside the picker sheet.** This dissolves the draft problem completely: you never leave the form. Rejected on a hard constraint and a soft one. The hard one: **a second `google.maps.Map` instance is billed** (ADR-0121 §4), and from the Map tab itself — where `BookingSheet` and the picker are rendered _over_ the tab — that is exactly two instances. The soft one: it is a second surface answering the same question, which is the parallel copy ADR-0096 exists to prevent and ADRs 0078/0079/0094/0095 exist to undo.

**Keep both routes — the picker for places we have, the map for new ones.** This was my recommendation; the owner chose otherwise. Recorded because their reason is better than mine: a place is confused with another place _by location_, which is the one thing a list cannot show. Two routes would also mean the "which surface answers this?" question is asked at every place field forever.

**The row tap commits directly.** One tap instead of two, and it destroys the reason to be on a map: you would be choosing without looking. Rejected in §3.

**A labelled Google button.** It fits (§5). Rejected because the row already carries one labelled verb and two compete.

**Keep the row a link, and add a separate "show on map" control.** Preserves ADR-0115 §2 literally and inverts the priority: the primary gesture would open another app, and the thing this phase exists to make easy would be the secondary control.

## Consequences

- **The forms become a third consumer of the hand-over pattern**, and they gain a serialise/rehydrate pair they did not have. That is the real cost of this phase and it should be built first, not last: everything else is inert if a draft can be lost.
- **`target.field` makes the errand's shape wider than ADR-0131 §10's**, because a transport booking has two place fields. Any future multi-place entity inherits the same requirement.
- **A tap now means different things in two places on one screen** (frame from the list, pan from the canvas). That is defensible and it is also the kind of split that gets "simplified" later by someone reading only one half — §6's table exists so that edit has to argue with a table.
- **`.map-right` gains a per-row-kind direction.** One scoped override, and the reason is a measurement, so a future "let's make all rows consistent" change has a number to answer.
- **The picker sheet's retirement removes a surface but not its lesson** (§9).
- **`נווט` is conditionally absent** on a surface where it is otherwise always present. It is the derived-affordance rule, but it is the first time that rule keys off a _mode_ rather than off data.

## The device pass, and what it owns

- **Whether a 44×44 icon reads as "open in Google Maps"** without a label, and whether it reads as _subordinate_ to the verb beside it rather than as its equal.
- **Whether the two-step (drop the sheet, then frame) reads as one movement or two.** The sheet's own curve and the camera's 480ms ease are separate animations; they may need sequencing rather than firing together.
- **Whether `בחירה` on a row that is already in the trip reads correctly** beside its own `כבר בטיול` state on the result side.
- **Whether the derived span is right for a result you have never seen.** Its neighbours are other candidates, not the trip's plan, so the frame means something slightly different there.
- **Whether returning to the form lands where you left it** — the same scroll position, the same field focused. The draft covers the values; it does not automatically cover the view.

## Build log (2026-07-28, session 164) — the errand's mechanism, and three owner corrections

Built: the hand-over channel, errand mode on the Map tab, and the first caller
(`BookingDetail`'s `＋ מיקום`). **The forms' draft path is NOT built** — see the end.

### The channel is one mechanism now, not a third copy

`lib/handoff.ts` (`useHandoff<T>`) is the generalisation the backlog asked for: set by a
producer, **taken once** by a consumer, out of the URL, held above the shell. `take()`
reads through a ref so two takes in one tick cannot both succeed — the property a copy of
this pattern would most easily lose, and the reason it has its own spec.

### Two assignment paths, and the split is whether the target exists

§2 treated the draft as the only path. It is not, and the cheaper one covers the first
caller entirely:

- **A saved booking** → an ordinary `indexVerbs.updateBooking` patch from the Map, so the
  return is purely navigational. `BookingDetail` has no unsaved state to lose, so it needs
  no draft at all.
- **Anything else** (a form mid-draft; an event, whose place edit belongs to its own
  guarded form rather than to a patch from here, ADR-0011) → the place is handed back and
  the host re-opens from the draft.

That ordering matters: it means the errand is **useful before the expensive half exists**,
which is the opposite of what §2 assumed.

### Three owner corrections from a phone, and one of them is a rule I broke

**1. `🗺️` as a UI control.** I used an emoji for §5's way-out to Google. `ui/Icon.tsx`'s own
header says _"A real SVG, never the 🗺️ emoji: emoji are content, icons are UI"_, and the
backlog already carried "emoji used as UI controls, swept out". Fixed with a real SVG — and
deliberately **not** a map glyph: `pin` already means "our map", so two map-shaped marks on
one row would compete. The new `external` icon says what the control actually does, which
is **leave**.

**2. The two corpora are not two sections.** ADR-0131 §8 grouped them under `בטיול` /
`מגוגל`, arguing a header answers "is this already ours" once instead of per row. The owner
disagrees, and the header was restating something the rows already carry: a result wears
the dashed "not ours yet" badge, and one that is ours says `כבר בטיול` in its own slot. **One
list, no headers.**

**3. And that fixes a real defect the grouping was hiding.** The screenshot: **`לא נמצאו
מקומות` in bold, with three Google results underneath it.** Each half answered for itself,
so the free half could report emptiness while the paid half was about to show something. A
list cannot say "nothing" and then show something. Emptiness is now a fact about the
**merged** list, stated once, as one quiet line rather than an illustrated `EmptyState` —
and only once the paid half has **settled**, because while a request is in flight the
skeletons are the honest answer.

### What is left, and it is the headline

**The forms.** `EventForm` and `BookingSheet` still open `PlacePickerSheet`, so §1's
"searching for places on bookings refers to the map" is true of `BookingDetail` and not yet
of the forms. What remains is exactly §2's expensive half: a draft the form serialises and
rehydrates from, and a host that re-opens it on return. The channel, the errand mode, the
verbs and the return are all in place and tested; nothing about them changes when the forms
arrive. `PlacePickerSheet` therefore does **not** retire yet (§9).

## Build log addendum (2026-07-28, session 165) — the draft path, and what it cost

§2's expensive half is built. `EventForm` and `BookingSheet` each own a **draft type**
(`EventFormDraft`, `BookingSheetDraft`) that they write when the field launches an errand
and rehydrate from when they re-open. `PlacePicker` gained one prop, `onFind`: given it, the
field launches the errand; without it (or outside the trip shell, where there is no Map tab)
it keeps its own sheet, which is what keeps the field usable anywhere.

**The form writes the draft, not the field.** The field has no idea what else is half-typed
above it, and that is the whole reason `onFind` is a callback rather than a flag.

**Five hosts, one hook.** `BookingSheet` is hosted by `DayView`, `PlanDay`, `PlanHome`,
`IndexBookingsView` and the Map tab itself; `EventForm` by two. Seven copies of
"take the answer and re-open" is exactly the parallel copy rule 8 exists to prevent, so
`useReturnedPlaceErrand<D>(kind)` is the one mechanism, reporting the payload **once** so
re-opening is an event and not a state a host can get stuck in.

**And wiring all five was not optional, which is worth stating.** The tempting shortcut was
to wire only the host whose main job is booking editing. But an errand started from a sheet
opened anywhere else would then return to a **closed** sheet with the rest of the edits
gone — the exact failure the draft exists to prevent, reintroduced in four places. A host
that renders a form owes it a way back.

**What each draft deliberately omits:** `error`, `saving`, `deleting`. Those describe the
last save attempt, not anything the user typed, and carrying them would restore a stale
error message on return.

**Not built, and now the only thing left of §9:** the Map tab's own `＋ מיקום` enrich path
still opens `PlacePickerSheet`, so the sheet has exactly one caller left. Retiring it needs
the errand to grow a fourth target — a coordless `Place` being enriched in place, which is
not an entity field but a row — and that is a small decision rather than a mechanical one.
