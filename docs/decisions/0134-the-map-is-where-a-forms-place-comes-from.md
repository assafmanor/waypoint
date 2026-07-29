# 0134 — The map is where a form's place comes from, and a row tap **commits**

**Status:** Accepted — designed 2026-07-28 (session 163); **§5–§8 built session 163, and the errand's mechanism + `BookingDetail`'s caller built session 164** (see the [Build log](#build-log-2026-07-28-session-164--the-errands-mechanism-and-three-owner-corrections)). **§2's draft path is built (session 165); §9 is built (session 179) — `PlacePickerSheet` is retired, and the Map's own enrich is the fourth errand target.** Three owner corrections from a device pass are recorded in that log, one of which reverses ADR-0131 §8's grouping. Three owner requests, designed together because they are one idea.
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

## Build log addendum (2026-07-28, session 166) — the owner's four reports

Three of the four are about the tab in errand mode. All four are recorded here, since none
of them changes a decision above; the first changes a **claim** this ADR made.

### The re-open fired more than once, which is the errand's one real failure mode

> _"Moving from event/booking to maps and back again created multiple forms or something so
> that the form got duplicated over and over, so saving the event had the form below so it
> never cleared, and the event was duplicated many times."_

Session 165's log says `useReturnedPlaceErrand` reports the payload **"once, so re-opening
is an event and not a state a host can get stuck in"**. The channel really is once-only —
`take()` cleared it correctly, and `lib/handoff.test.ts` proves that. **The bug was one
layer downstream, and the shape of the hook is what put it there.** Reporting the payload
as a return value made it STATE, so it stayed readable for the rest of the host's life,
while every host applied it from an effect that also depended on `events`/`bookings` — it
must, to look the entity up by id. So: re-open the form, save, the entity list changes, the
effect re-fires on the same payload, the form re-opens on top of itself, and the next save
writes another copy. Four of the five hosts had it; `PlanHome` escaped only because it is a
seed host with nothing to look up.

**A once-only channel does not give you a once-only effect** — the "once" has to live where
the effect does. So the hook is a **callback** now, `usePlaceErrandReturn(kind, apply)`,
with `apply` read through a latest-ref: the effect depends on nothing but the channel, and a
host may close over whatever it likes. One copy of "once", in the place that owns it.

### While you are choosing a place, the trip's own pins are context

> _"Opening the map from events still had the existing events very prominent, they should
> probably be low tier on this case (little circles)."_

Right, and it is the same argument §4 makes about `נווט`: under an errand the tab has one
job, so what does not serve it steps back. The canvas shipped with the full ladder —
numbered teardrops, an amber next stop — so the loudest object on screen was the thing you
were **not** there to choose.

It is the **dot tier** (ADR-0128 §1), not a seventh rung: same ratio, same round silhouette,
same dropped glyph/number/tag, off the same one-attribute-on-the-screen mechanism, so no
marker re-renders and nothing is re-diffed on a live map. What differs is only the trigger —
the zoom tier asks _is this legible at this zoom_, this asks _is this what you are choosing_.
Two deliberate differences follow from that: the amber cues are **not** spared here (they
claim priority among things you are looking at, and under an errand none of them is), and
there is no `data-scope` split (nothing turns on which day chose the pin).

**The pins' `tier` and `aside` are deliberately untouched**, and that is the load-bearing
part: those are what the camera reads (`isFramedByCamera`), so the opening fit still frames
the trip's places. Where you are is exactly where you want to start looking; it is just not
the answer.

### The chosen candidate has to look chosen, on both halves

> _"The selected Google search result is not prominent enough to distinguish from other
> results."_

`.place.selected` is calibrated for a trip row — one of many like it, all of them yours — so
an ink hairline and a 12% halo carry it. A result row is not that case: it sits under a list
of near-identical Google answers, its resting badge is the **quietest** on the surface (a
dashed neutral outline), and the selection is the answer to the only question being asked.
So the selection now **fills** rather than outlines, in both form factors and as one idea:
the row's badge goes solid, and the ring on the canvas inverts to solid `--ink` at full
`--pin-base` — the row's badge is the ring's picture, so filling both is one cue twice, the
same relationship ADR-0109 §3 set up between a pin and a badge. Still `--ink`: selection has
never been a semantic colour here (ADR-0028).

It also **rises above the pins**: `MAP_RESULT_SELECTED_Z` beside `MAP_RESULT_Z`. The rule
that rings sit under every trip pin is about a **population**; a selection is about one
member of it, and a chosen candidate hidden behind a teardrop is the one case where "what
you already have outranks what you might add" gives the wrong answer.

### And the map extreme came back

Answered in ADR-0132 §8, which is where the decision was owed and where the amendment lives.
The one thing that belongs here: at that stop the **place card** gained `בחירה` under an
errand, because a card is the only way to reach one of our own places there — without it a
trip place would be pickable from the list and not from the canvas, on the tab that exists
to show you where things are.

## Build log addendum (2026-07-28, session 168) — three more from the same pass

### `ביטול` has to give the form back, and §2 only ever said so for the success path

> _"Canceling a place pin doesn't return to the event form."_

§2 says the errand carries a draft because "leaving a form for a tab would otherwise lose a
half-typed event". The build honoured that on the way **in** and on a successful pick, and
`cancelErrand` navigated to `returnTo` handing **nothing** over — so the host had nothing to
re-open from and the half-typed event died anyway, through the other exit. The draft is not
insurance against choosing wrong; it is insurance against leaving, and both exits leave.

So a cancel hands the draft back with `placeId: null`, and `PlaceErrandResult.placeId` is
nullable to say exactly that. Handed **only when there is a draft**: a saved booking's errand
patches in place and has no form to restore, so an empty result would be left pending for a
host that never wants it.

**And the assignment moved into the hook** while this was being fixed. All five hosts wrote
`{ ...draft, [target.field]: placeId }` — the one expression whose whole point is that
`field` is not optional (§2), copied five times, one host away from being written slightly
differently. `usePlaceErrandReturn` now returns the draft **already merged**, which is also
what makes the cancel path free: no place, no merge, draft unchanged.

### Arriving on an errand opens the query field

> _"Opening map search for event/booking doesn't start on keyboard open."_

You were sent here to **find** a place, so the tab opens on the control that does that; the
field's own `autoFocus` brings the keyboard. It spends nothing — the min-chars floor is what
stands between a keystroke and a paid call — and it lands on the **free** half first, which
is the fact §1 reconciled this whole reversal on: the trip's own places filter from the first
character, at no cost, offline.

Once per errand, keyed on the errand object rather than a boolean: closing the field is a
decision, and re-opening it under the user is the nag `locationOffered` already exists to
prevent (ADR-0109 §6).

### The context demotion exempts a search result — per pin, not per screen

> _"I don't see them on the canvas either, on search for event/booking."_ …and then, on the
> first fix: _"not every trip pin — just search results that are already saved."_

Session 166's demotion asks **"is this what you are choosing"**, and a place your search
surfaced is an answer to that question, not the backdrop to it. Shipped, it shrank the one
place you were looking for to a ~14px dot among full-size rings.

The first fix turned the demotion off whenever a query was live, which is right by accident
today (under a query every pin on the canvas is a match) and wrong in principle — it would
promote anything the canvas carried for any other reason. The owner's correction is the
better rule and the one the file already had a shape for: the exemption rides on the **pin**
(`MapPin.match`, read by `:not(.match)`), exactly as ADR-0131 §4 put the `aside` withdrawal
on the pin rather than on the screen. `match` is derived from the very predicate that admits
the pin, so the flag and the filter cannot drift.

## Build log addendum (2026-07-28, session 169) — the second exemption

> _"Selected should be promoted to pin."_

Session 168 exempted a **search result** from the errand's context demotion. The same
argument covers **selection**, and the device pass found the gap: with no query live, the
place you had tapped drew as a dot with the selection ring around it — a ring drawn around
nothing.

The demotion asks _"is this what you are choosing"_. A tap is the strongest answer the tab
has to that question, so it outranks a rule about the backdrop by definition. Both
exemptions are classes on the pin (`:not(.match, .selected)`), never a switch on the screen:
the exemption belongs to the pin that earned it, which is ADR-0131 §4's split and the
correction the owner already made once.

**The camera half of the same screenshot is in [ADR-0129](0129-map-camera-moves-like-a-camera.md) §2's amendment** — the focus
reach took the furthest of the nearest three unconditionally, so a close neighbour could not
tighten the frame.

## Build log addendum (2026-07-28, session 170) — the return owed to a booking, and a double tap

### `returnTo` is a URL, and half the things you can be looking at have none

> _"Return to booking isn't working."_

§2 gives the errand a draft because a form is a `Modal` with local state that no URL
addresses. **The saved-booking path has the same problem and no draft**, and the build missed
it: `finishErrand` patched the booking, navigated to `returnTo`, and handed nothing over — so
the return rendered the screen with every sheet closed. The place was correctly assigned to a
booking you could no longer see. `ביטול` was worse: the same landing, nothing assigned.

The draft was never really about the typing. It is about the fact that **the URL does not
describe what was on screen** — and a `BookingDetail` (a `Modal`) inside `IndexBookingsView`
(view state, not a route, ADR-0098) is two layers of exactly that.

So the result is handed back on **both** exits, and the host re-opens what it owns: a result
with a **draft** re-opens the form, one with only a saved `target.id` re-opens that booking's
**detail**. All four `BookingDetail` hosts already ran `usePlaceErrandReturn`, so this is one
branch each — the channel §2 built, reaching the one case it had not covered.

### A double tap is the verb

> _"Double clicking on a map result should select it (same as selecting then clicking on
> `בחירה`)."_

§3 split looking from committing — the tap frames, `בחירה` assigns — and that split stands;
this is a **shortcut through it**, not a reversal. The two single taps still fire first, so
the sequence is literally the one the report describes.

**Errand-scoped, on both row kinds**, because §3's verb is what it stands in for: a trip row
and a Google row are answers to the same question while an errand is live. Outside one the
verb shelves a `MaybeItem`, and a stray double tap that silently adds something is a
different feature nobody asked for. No gesture machinery — `touch-action: manipulation` is
app-wide (ADR-0062), so a `dblclick` already arrives promptly.

### And an audit that is mostly not fixed

The rest of the report (_"some backs aren't working intuitively… and more edge cases that I
want you to identify"_) is five findings in
[`planning/2026-07-28-session-170-back-audit-and-the-double-tap.md`](../planning/2026-07-28-session-170-back-audit-and-the-double-tap.md),
recorded rather than fixed. The two worth naming here: **a non-Home tab backs to trip Home
even when you arrived from elsewhere** (ADR-0090 §2 working as designed — changing it is that
ADR's amendment, not a bug fix), and **an errand now costs two backs** because session 168's
auto-opened query field registers a second layer over it.

## Build log addendum (2026-07-28, session 171) — both of session 170's fixes were wrong

Two corrections, and both are cases of building the right idea on the wrong surface.

### The gesture is on the CANVAS, and it is not a double tap

> _"I meant on the map `＋` or existing, and not really double tap, more like tapping the pin
> when already selected."_

Session 170 put an `onDoubleClick` on the ROWS. The rows already have `בחירה` sitting on
them; the surface with no verb in reach is the **canvas**. And the gesture is not a double
tap at all — it is **tapping what is already selected**, which needs no timing window, no
gesture machinery, and reads as a sentence: the first tap says _this one_, the second says
_yes, that one_.

It composes with §3 rather than reversing it: the **first** tap still only selects, so you
still look before you commit. Both populations answer it the same way — a trip pin and a
Google ring are the owner's `＋ or existing` — and both are errand-scoped, because outside an
errand there is nothing to commit to.

### `returnTo` was fixed for the three hosts that stay mounted, and not for the one that does not

> _"It now goes back to the index main screen (where you choose between documents and
> bookings), not on the form itself."_

Session 170 had hosts re-open the booking's detail on return. That works for `DayView`,
`PlanDay` and the Map — all mounted when the return lands. **The Index's bookings screen is
not**: it is view state inside `Index.tsx` (ADR-0098), so returning to `?tab=index` renders
the LANDING and the host that would have re-opened the detail no longer exists to hear about
it. The fix helped three hosts and left the reported one exactly as broken.

The answer was already in the app: **ADR-0050's `?booking=<id>` deep link** opens the
bookings screen with that detail on top, then clears the param. So the return uses it —
`withBookingDetail`, applied only when the destination IS the Index tab, since anywhere else
the host is mounted and the param would be litter nothing clears. The param gets a name
(`BOOKING_PARAM`) now that it has a second writer.

**The pattern worth keeping:** _"the host re-opens itself"_ is not a rule, it is a rule with
a precondition — the host has to still be there. Where it is not, the destination has to be
a URL, and this app already has one for every such case it has met so far.

## Build log addendum (2026-07-29, session 172) — the host was never there, and the destination is the FORM

> _"When the booking is still unsaved, exactly the same behavior as before, it goes to the
> index main screen, not back to the form. When exiting an existing booking, it still
> doesn't return to the edit form, instead it just displays the booking preview. Both need
> to act the same way: return to the booking form and maintain the same state the form had
> before entering the map."_

Two more corrections, and the first one is the same root cause I had already written up
twice and still keyed the fix on the wrong thing.

### There is nothing wrong with the return channel. The listener is not there

Sessions 170 and 171 both keyed on `target.id` — 170 to decide whether to re-open a detail,
171 to decide whether to add a deep link. **Neither addresses the actual failure**, which is
that the Index's bookings screen is view state inside `Index.tsx` (ADR-0098) and is simply
**not mounted** when the return lands: `usePlaceErrandReturn` never runs, so the result sits
pending and nothing re-opens. That is true for a saved booking and an unsaved one alike, and
the unsaved case has no id to key on at all — which is exactly why the id-keyed fix in 171
appeared to work for one case and did nothing for the other.

So the return asks the Index to **mount the screen**, through the `focus` param ADR-0050
already uses for the documents screen: `?focus=bookings`, no id. The pending result is what
says which booking and what was typed, and the host takes it the moment it mounts. An id in
the URL would be a second, weaker copy of the answer the errand is already holding.

### And the destination is the form, in both cases

The other half of the report: returning from a `BookingDetail` errand re-opened the
**detail**, which is where you started rather than where the work is. Both paths now land on
the **form** — the draft rehydrates the unsaved one, and the saved one opens on an entity
whose place has already been patched, so the chosen place is showing either way.

### The lesson, stated once so it stops recurring

_"The host re-opens itself"_ is not a rule. It is a rule with a precondition — **the host has
to still be mounted** — and this app has two shapes that break it: a `Modal` (no URL) and a
screen that is view state rather than a route (ADR-0098). Where the precondition fails the
return needs a URL that RE-CREATES the host, and the id of what to re-open belongs in the
channel, not in that URL.

## Build log addendum (2026-07-29, session 173) — §2's "cheap path" is withdrawn

> _"When the booking doesn't exist, it returns to the bookings view but not to the form. When
> the booking exists, it also returns to the bookings view and not the form, and saves the new
> location instead of simply returning to the edit form. Both need to act the same way: return
> to the booking form and maintain the same state the form had before entering the map."_

**§2 had two paths and the cheap one is now gone.** It said a saved booking needs no draft —
patch it from the Map with `updateBooking`, return with nothing to restore, "the expensive
path is paid only where it is needed". Both halves were wrong on a device:

- **Choosing a place on a map is not the same act as saving the booking.** The patch wrote
  through before the user had agreed to anything, which is the opposite of the guard a hard
  commitment is supposed to have (ADR-0011). The save belongs where every other save is: the
  form's own button.
- **The form is where you were going either way.** Returning to the read-only detail put you
  one tap short of where the errand started.

So there is **one path**: every errand carries a draft, returns a draft, and lands on the
form with the place assigned and unsaved. The saved and unsaved cases are now the same code.

### What that needed: the sheet's opening state as data

A `BookingDetail` can see the booking but not **how the sheet would read it** — the zone each
leg is authored in, what a seed resolves to, which kind a type defaults to. That derivation
was twenty-odd `initial*` consts inside `BookingSheet`, reachable only by rendering it.

It is now `lib/booking-draft.ts`'s `bookingSheetDraft()`, and the component seeds its own
`useState` calls from the same call — so "what the form opened with" has one answer, used
both by the fields and by the unsaved-changes diff. Re-deriving it at a second call site is
precisely how two copies drift.

### And the draft cannot silently fall behind the entity

> _"Make sure that the booking draft schema is updated on any booking schema update."_

A draft cannot be a mapped type over `Booking` — the sheet authors a **form**, so one entity
field becomes four (`details` → room, notes, wifi × 2) and a stored instant becomes a date
plus a time in a resolved zone. What can be enforced is **coverage**: `BOOKING_FIELD_COVERAGE`
is exhaustive over `keyof Booking`, so adding a field to `bookingSchema` fails the build until
someone classifies it as `form`, `identity` or (explicitly) `unused`. Same shape
`constants.ts` uses for per-enum lookups, and for the same reason — a missing case should be
a compile error, not a silent omission.

## Build log addendum (2026-07-29, session 174) — the answer had a thief, and only a browser could see it

> _"Unfortunately I'm still not getting back to the draft, same exact thing as before except
> when returning from editing it doesn't auto save the location."_ … _"If you could add a
> playwright test for that."_

The fifth report of one sentence, and the first one with a cause. Sessions 170–173 each fixed
something real about the return — the missing host, the landing that had no form, the cheap
path that saved without asking — and the form still did not open. It never was those.

### The Map takes its own hand-off

`finishErrand` does two things in one click handler: `errandResult.hand(...)` and
`navigate(returnTo, { replace: true })`. Both land in **one React batch**, so the Map is still
mounted for the render that publishes the answer — and the Map is itself a **booking-form
host** (a selected row's way-in opens a `BookingSheet`, §8). Its own `usePlaceErrandReturn`
effect re-ran, matched on kind, took the result meant for the Index, applied it to state that
was about to be destroyed, and unmounted. The Index then mounted to an empty channel.

From outside this is indistinguishable from the channel never delivering: the right screen
arrives, and no form opens. Which is why four fixes aimed at the delivery.

### The filter has to be a fact about the host, not about the URL

The first attempt compared the errand's `returnTo` against `window.location`. It fixed
nothing, and the reason is the whole lesson: **by the time the thief's effect runs, the
location is already the destination.** Anything read off the URL describes where the app is
going, which both hosts now agree on — it cannot tell them apart.

So `usePlaceErrandReturn` takes a **`hostTab`**: the tab that host lives on, a static property
of the component, matched against the tab in the errand's `returnTo`. It cannot race a
navigation because it does not observe one. Every host is reachable under exactly one tab
(mode picks between the two that share `home` and `days`), so it identifies the host — and
comparing the tab rather than the whole path is deliberate, since the destination strips
params on arrival (the Index clears `?focus=` once it has acted).

### The test is an e2e, and that is the finding

Every previous attempt was unit-tested and green. They had to be: the bug lives in the seam
between a screen unmounting, a navigation, and a screen mounting on the far side, and a jsdom
test of the channel mocks away at least one of those — most of all the **second host**, which
no unit test had any reason to mount. `e2e/booking-place-errand.spec.ts` asserts the owner's
sentence instead of an implementation detail (you come back to the form you left, with the
place in it, nothing saved), and it reproduced on the first run.

`state/map-scope-state.test.tsx` now carries the thief case too, so the regression is cheap to
catch — but it was written **after** the browser found it, and would not have been written
otherwise. When a fix for a hand-over ships and the report comes back unchanged, the next step
is a real browser, not a fifth reading of the code.

## Build log addendum (2026-07-29, session 179) — §9 is built, and the sheet is gone

The last piece. `PlacePickerSheet` had one caller left — the Map tab's own `＋ מיקום`, the
coordless row's way to get a location — so the tab that **is** a search over a map was
opening a second search surface over itself.

### The fourth target is a ROW, and it never travels

`PlaceErrandTarget` becomes a union: the three form targets keep their `field` (§2's whole
point — a transport booking has two place fields), and the new one is
`{ kind: 'place', id }`. It carries **no `field`**, because there is no form and nothing to
assign: the row _is_ the thing being answered, and the answer is written by the pick itself
(`usePlaceSearch`'s `enrichPlaceId`, adopting the found place onto the row so a booking's
reference still points at it).

It is a `PlaceErrand` rather than a mechanism of its own so the tab's errand **mode** stays
one thing: the banner, `בחירה` replacing `＋ אולי`, `נווט` withdrawn, the dot tier, the back
layer and the field opening on arrival are all written once against `pendingErrand`.

**`returnTo` becomes optional, and that single field is what both exits branch on.** A row
errand starts on its own destination, so it has nowhere to return to — no hand-over, no
navigation, and `useTakePlaceErrandResult` answers "not for this host" one branch earlier
than the tab check. No exit asks what kind of errand it is holding.

### Only Google can answer it, and that removed a control that did nothing

A form errand takes either half — the trip's own places answer it free and offline, which is
the fact §1 reconciled the whole reversal on. A **row** errand cannot: the coordless row is
already in that list, and a second row of ours cannot tell it where it is. So the trip's rows
keep their ordinary grammar while one is live (`errandTakesOurPlaces`), which also covers the
second-tap commit on a pin.

That is not a restriction added here so much as a dead control removed: the retired sheet
offered the trip's own places for the enrich too, and the Map **discarded the id it handed
back** (`onPick={() => setEnrichTarget(null)}`). Picking one did nothing, silently, and had
since the enrich shipped.

### What retiring the sheet actually cost, said plainly

`PlacePicker`'s `onFind` is now **required**, and the sheet fallback behind it is gone. That
fallback was written for a `PlacePicker` rendered outside `MapScopeProvider`, where
`useStartPlaceErrand()` is null — and no such surface exists: both forms, on all five hosts,
render under the provider. The invariant is now named on the prop instead of stood in for by
90 lines of second search UI.

The file's tests went with it — the debounce, the resolve, the `בטיול` half, the min-chars
floor, the name-only fallback were all asserted **through the field**, and each is asserted
where it now lives (`Map.test.tsx`, `lib/usePlaceSearch.test.ts`). §9 already answered the
objection this raises: that half was the proof that "the trip answers first, free and
offline" is the right model, and the map's free half is the same idea on a surface that can
also show you where the answer is.

### Coverage

Three new cases on the errand (it starts named after the row and opens the field; only
Google's rows can answer it; `ביטול` puts the tab back without navigating), plus one that
asserts the **construction** rather than the click — `usePlaceSearch` receiving
`enrichPlaceId`, which is the whole of "enrich in place rather than mint a duplicate" and the
one thing a click-level test would miss. Each was checked against the wrong behaviour first:
the grammar case fails if `errandTakesOurPlaces` is relaxed to `pendingErrand != null`.
