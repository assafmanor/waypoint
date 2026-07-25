# Session 104 — navigate-to-next: the fourth Home tile returns, and the map gets its one time anchor

**Date:** 2026-07-25
**Kind:** Feature (Maps & Places epic, **Phase 4b**).
**ADRs:** [0106](../decisions/0106-maps-and-places-epic-scope-and-phasing.md) §6 (the decision this implements), [0045](../decisions/0045-trip-home-real-data-only.md) **session-104 amendment** (its deferred fourth tile lands), [0109](../decisions/0109-map-tab-design.md) §6 (the amber time-anchor cue this spends on the list).

## Why

Phase 4 is the epic's remaining Trip-mode work and splits cleanly in two: geolocation/near-me (4a) and navigate-to-next (4b). 4b went first because it needed no new plumbing — Phase 2 already shipped the deep-link builders and the authority rule, so the whole feature is one derivation plus two render sites — and because "how do I get to the next thing" is the highest-frequency on-the-ground action in the epic.

ADR-0045 removed a fake `ניווט למלון` tile in 2026-07-16 and recorded exactly what would let it return: **real place data on the event**. Phase 1 delivered that (picked places with coordinates, transport endpoints included, session 86), so the tile is now buildable honestly rather than as a search-query guess that can resolve to the wrong city.

## Change

**One derivation, `nextDestination` (`lib/places.ts`)** — the next place you have to get to: among timed **upcoming** events, the earliest whose resolved place is **mappable** (has coordinates). It returns `{ event, place, url }`, resolving the directions link itself, so neither call site repeats a null check for something the filter already guaranteed. Three properties worth stating:

- **The authority rule applies, so transport resolves to its ORIGIN.** The stop before a flight is the departure airport, not where it lands — the same rule `bookingPlaceId` has enforced since ADR-0048, reused rather than re-decided.
- **It looks past what it can't route to.** A placeless soft event, or a coordless Place-lite, is nothing to navigate to, so the derivation skips it and may resolve to a later event than the board's immediate next. That mirrors `nextCodedBooking`'s documented behaviour, so the two Home tiles are consistent about "next" meaning "next _of this kind_".
- **No lookahead window.** Like the board's NEXT slot it scans the whole trip. A destination days out is still the next one you have a location for, and both surfaces name it (the tile shows the place, the map row shows the departure time), so it can't read as "leave now".

A checked-in hotel needs no special-casing: its stay event is already in progress, so `upcoming` excludes it, while before check-in it is a legitimate next destination. That fell out of the phase filter rather than needing a rule.

**Home — the fourth quick-access tile.** `🧭 ניווט ליעד הבא` with the stop's name underneath, shortened through the existing `shortPlaceLabel` so a long official airport name reads like it does everywhere else. It is an **`<a>`, not a `<button>`**: the hand-off out to Maps is a real link, so long-press/share/open-in-new-tab work and no popup blocker is involved. Absent when nothing upcoming has a location, so the grid still reflows — `QUICK_TILE_MAX_COLS` raised the cap from 3 to 4 and `.quick`'s inline column count does the rest.

**Map tab — the navigate-to-next cue.** Deliberately _not_ a second control or a re-sort: the row already has a `נווט`, so what the map adds is **which** row is next. ADR-0109 §6 budgets exactly one amber time-anchor on this surface (a single ring on the next committed stop, on the rendered map); this is that cue in list form — an amber `היעד הבא · 18:40` tag plus a soft amber ring on one row. It survives Phase 6 unchanged: the ring moves onto the pin, the row keeps its tag. The time renders in the **event's own zone** via `liveZoneContext`/`eventZones` (ADR-0107), not the trip primary, and the cue is **Trip-mode only** — a live "next" says nothing while you're planning.

## Deliberately not done

- **Near-me / geolocation (Phase 4a)** is the other half of Phase 4 and stays open; nothing here presumes device location (ADR-0045's original point: Maps routes from the device's own position, so ADR-0006 never blocked this tile).
- **A Home render test.** `nextDestination` is unit-tested at the seam that carries all the logic; the tile itself is six lines of JSX mirroring its three siblings. Home has never had a render test, and standing up its first harness (the board, the glance, the change feed, several providers) is a larger task than this change earns — noted rather than silently skipped.

## Verification

- `lib/places.test.ts` (+6): earliest-upcoming-mappable wins; transport resolves to its origin; placeless and coordless events are skipped over to a later mappable one; passed/in-progress/done/skipped/untimed all ignored; a hotel offered before check-in and not once you're inside the stay; `undefined` when nothing upcoming has a location.
- `screens/Map.test.tsx` (+3): exactly one row carries the cue, it's the earliest one, and its time reads in the trip zone (04:00Z → 13:00 Tokyo); absent in Plan mode; absent when nothing upcoming has coordinates. Clock pinned with `setSimulatedNow`, the repo's existing mechanism.
- `typecheck` + `lint` (0 errors) + `build` green; frontend suite **853** passes (844 → +9); `pnpm format` clean.

## Next

Phase 4a — device geolocation permission (just-in-time, reason-first, ADR-0109 §6) → distance chips + the `לפי קרבה אליך` re-sort, with the denied/offline degradations. Then Phase 5 (Plan-mode research) and Phase 6 (the rendered map), the latter still gated on the human Phase-0 slice: Maps JS + Routes enabled, the referrer-locked browser key, the daily quota caps, and a re-confirmation of current Maps pricing.
