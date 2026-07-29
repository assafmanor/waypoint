# Session 179 — a query widens the list, and the second search surface retires (2026-07-29)

Two fixes, both named by [session 178](2026-07-29-session-178-the-epic-reconciled.md)'s
reconciliation as decided-and-waiting-on-nothing, and both on the same screen. Neither needed
a design session: one is a wrong context object, the other is ADR-0134 §9 built as written.

## 1. A query widens the list, so a row can state its own day

**The defect, and why it survived a device check.** Search on this tab is global by rule —
scope-blind and facet-blind, the Index's rule (ADR-0102) — but only the **predicate** was.
Every row still read itself against the strip's day, so a hit from another day resolved no
`placeDay` at all: no day, no time, no meta, filed under **`ללא יום`**. That is a claim about
the place made out of a fact about the scope, and `ללא יום` is a real block with a real
meaning (ADR-0109's session-127 amendment) that a mis-scoped row was walking into.

The owner checked it on a real device and read it as already fixed, from a screenshot of a
`TGI` search at the map extreme showing `TGI Fridays · לפני 5 ימים · 14:00`. That reading was
reasonable and the surface was wrong: **this row grammar has three renderers** — the list, the
place card, the surfaced ghost — and two of them already force the day. "Is it fixed" was
never a question about the tab.

**The fix is one named fact, not a `searching` test at three call sites.** The scope a ROW is
read against is no longer `allDays` but `listSpansTrip = allDays || searching`, which feeds
the order, the block and what the row says. They diverging is the defect itself, so they read
one value. `forceDay` survives untouched as the per-row override the card and the ghost need.

What deliberately does **not** widen: the facet counts, `מה נשאר` and the pin numbering keep
reading `dayCtx`. The chips are covered by the query field while it is open, and a pin's
number must not renumber under a keystroke (#16's rule, from the other direction).

**The tests are the reproduction, and one of them is a guard.** A hit from tomorrow names its
day; it sorts ahead of a genuinely dateless idea rather than into its block; and closing the
query hands the day scope back, so today's row does not start saying `היום`. The first two
fail before the fix, which is what makes them worth having.

### A selector nearly cost the diagnosis

The first reproduction read `.map-meta`, which does not exist — the meta line is `.map-m` —
so every row came back `meta: null` and the "before" looked worse than it was. The headers
half of that reproduction was real and the meta half was an artefact. **A green or red
assertion on a selector that matches nothing is not evidence either way**, and the check that
catches it is asserting a positive on a row you know is fine before trusting a negative on the
one you suspect.

## 2. `＋ מיקום` is an errand, and `PlacePickerSheet` is gone (ADR-0134 §9)

The coordless row's way to get a location was opening `PlacePickerSheet` — a second search
surface over the map, on the one tab that already **is** a search over a map. It is now the
**fourth errand target**, and the details are in ADR-0134's fourth build-log addendum. Three
things worth carrying out of it:

- **The target is a ROW, so it has no `field`.** The three form targets keep theirs (§2's
  point: a transport booking has two place fields). This one has nothing to assign — the pick
  writes the answer onto the row itself through `enrichPlaceId`, which is what keeps a
  booking's reference pointing at the same place.
- **`returnTo` became optional, and that one field is what both exits branch on.** A row
  errand starts on its own destination, so it has nowhere to return to. No exit asks what kind
  of errand it is holding.
- **Retiring the sheet removed a control that did nothing.** It offered the trip's own places
  for the enrich, and the Map discarded the id it handed back — a pick there had been silently
  inert since the enrich shipped. Only Google can answer a row errand, which is now stated
  rather than accidentally true.

**The fallback that justified keeping the sheet did not survive contact with the call sites.**
`PlacePicker` kept it for a render outside `MapScopeProvider`, where `useStartPlaceErrand()`
is null. There is no such render: both forms, on all five hosts, are under the provider. So
`onFind` is required now and the invariant is named on the prop instead of stood in for by
ninety lines of parallel search UI.

## Coverage

1636 → 1640 unit tests, all green; the picker's own file went from eight tests to three, and
the five that went were asserting a sheet that no longer exists (each already asserted where
it now lives). Every new test was checked against the wrong behaviour first — the "only Google
can answer it" case fails if `errandTakesOurPlaces` is relaxed to `pendingErrand != null`.

## Not done here

The e2e specs were not re-run (they need a live server). `back-map.spec.ts` drives the errand
round trip for a **booking**, which is untouched by either change, but the row errand's back
behaviour is asserted only at unit level — worth one pass on the device, along with whether a
row errand's banner reads right when the thing it names is the row directly under it.
