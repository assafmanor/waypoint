# M8b — the leg owns its mode (2026-08-27)

**Milestone:** M8b of the routes epic ([board](2026-08-24-routes-epic-milestone-board.md)).
**Branch:** `routes/m8b-mode` · **PR:** [#727](https://github.com/assafmanor/waypoint/pull/727).
**Drawing it implements:** [`mockups/the-mode-set-and-transit-declared-v1.html`](../../mockups/the-mode-set-and-transit-declared-v1.html) (M8a, signed off).
**Decisions:** amended in place into [ADR-0206 §AM](../decisions/0206-a-travel-time-belongs-between-two-points.md) (§AM1–§AM7).
**Also closes:** M6e (the infeasible leg keeps its mode glyph) and §Z5's live canvas defect.

## The one genuinely open question, and the argument that settled it

The card said the override key was open and wanted it argued rather than chosen. It is
`(tripId, fromPlaceId, toPlaceId)`, **unordered**, and the strongest argument is from the code rather
than from taste: `useDayTravelReads` already resolves each leg to a pair of place ids (that is what
`endpointPlaceId`'s transport inversion is for), and the estimate cache below it is **coordinate**
keyed — so an event-keyed override would be finer-grained than the thing it modifies. §AM1 has the
full argument, §AM3 the three rejected alternatives (the arriving `Event`, the `Booking`, a
`defaultTravelMode` column that §Z2 forbids), and §AM2 what unordered costs plus the trigger that
would revisit it.

## What the build found that the plan did not

Three things, all in §AM6/§AM7. The first is the one worth reading before touching this code again.

1. **Suppressing the estimate made the block disappear** — and with it the control that had just
   declared the leg. `dayJourney` answers `null` with no `travelSeconds`, which is §D4's absence and
   correct for every other case; a declared leg is a **statement**, not a gap. So `DAY_JOURNEY_ARM`
   gained `DECLARED` and `travelSeconds` widened to `number | null` with that arm as the one place it
   is null. Counted before changing it, per root `CLAUDE.md`: exactly **one** consumer outside
   `day-joins.ts` reads `travelSeconds`, and it was already inside the `declared` guard; every arm
   consumer is a positive `=== ARM` test, so a fifth arm reaches none of them.
   **A screen spec found this, not a unit spec** — which is the `frontend/CLAUDE.md` rule about
   `DayView` derivations earning its keep for the third time.
2. **The distance is one derivation.** §AA4 keeps the distance on a declared leg, and there is no
   route to take one from, so `useDayTravelReads.distanceFor` answers the routed distance where there
   is an estimate and the **crow-flies floor** otherwise. That is the same claim the canvas already
   makes for such a leg — a straight segment, because we do not know the road — so the block and the
   map now state one thing rather than two.
3. **The override cascade is the fifth member of a family this repo documents four times.** Postgres
   removes a declaration with either of its places and writes no `Change`, exactly like the notes,
   tasks, attachment and place-FK cascades. It **deletes** rather than nulls, because the pair is the
   row's identity — hence `dropOverridesForPlace` beside `clearPlaceRefs` rather than a `PLACE_FK`
   entry, whose whole shape is emptying a field.

## The exit criteria, and where each is asserted

| criterion                                         | where                                                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| a switch issues **no** network request            | `lib/day-travel.mode.test.ts` — rerenders through three modes, asserts `fetchRoutes` called **once**                                          |
| every read moves at once                          | same file, plus `screens/DayView.travel.test.tsx`'s declared cases                                                                            |
| the derived default, and that it moves            | `lib/day-travel.mode.test.ts` + `packages/shared/src/routing.test.ts`                                                                         |
| survives a reload                                 | `lib/cache.test.ts` — the snapshot round-trip, and the pre-upgrade row                                                                        |
| survives an offline session                       | `lib/cache.test.ts` — the outbox mirror, canonicalised and stamped                                                                            |
| a cross-cluster drive resolves, the walk does not | `lib/day-travel.mode.test.ts` — one matrix, two answers, one request                                                                          |
| the write is a write others see                   | `backend/src/travel-modes/travel-modes.service.spec.ts` — through `ChangeService.mutate`, both directions from one row, and the place cascade |

Two smaller specs beside them: `ui/icon-mirroring.contract.test.ts` (ADR-0138 §10.3's two transform
channels are disjoint, asserted over the source because it is a fact about a **set**), and
`DayJoinRow.test.tsx`'s §AK case, which compares the badge's path against `Icon name="walking"`'s —
both the old swap and the new composition render "an icon in the badge column", so the previous spec
could not tell them apart.

## What was deliberately not done

- **`Collapsible`'s `0.32s` literal** against the caret's `--t-base`. Four hosts, so the repair
  belongs in the primitive and moves every disclosure in the app — a backlog line (§AL10's own
  second point).
- **The seven further mirroring candidates** M8a's audit found. Seven glyphs across eight screens is
  the quiet widening rule 8 forbids; the allowlist is what makes it a one-line addition later.
- **A shared `tripSnapshotFixture()` builder.** Nineteen snapshots are hand-built across the test
  suite and every new snapshot field touches all of them (this card touched seven). It is the obvious
  next extraction and it is not this card's surface.
