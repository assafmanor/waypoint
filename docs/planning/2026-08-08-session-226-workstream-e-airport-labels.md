# Session 226 — Workstream E built: airport search, real IATA codes, `City · IATA` labels

**Date:** 2026-08-08
**Build session.** Closes field reports **#6, #7 and #23** together (the 2026-08-07 triage's Workstream E, refined by [session 224 §3](2026-08-08-session-224-incremental-field-reports-addendum.md) and researched in [session 225](2026-08-08-session-225-flight-place-data-research.md)). The durable record is [ADR-0166 §18](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md); this note keeps what a decision log should keep and the ADR should not — the judgement calls made **during** the build, and what is still owed.

## 1. What shipped

- **#6** — a flight leg's place search asks Google for **airports only**. The booking sheet's route fields put a `kind` on the errand (ADR-0134's channel), the Map tab passes it to its Text Search relay, and the proxy sends `includedType: 'airport'` + `strictTypeFiltering: true`.
- **#7** — **real IATA codes**, from Wikidata `P238`, as a field in ADR-0166's existing pipe. Matched by the name route the pipe already runs, gated by a `P31`-is-airport check.
- **#23** — the label is `City · IATA` (`תל אביב · TLV`), from `P931` plus `P238`, with **`Place.nickname`** as the manual override above it and today's name-stripping below it.

## 2. The #6 endpoint call, which the handoff left open — and why it went the other way from the research

Session 225 recommended **Autocomplete** with `includedPrimaryTypes: ["airport", "international_airport"]`: it covers both of Google's current airport types in one request, where Text Search's `includedType` caps at one. On the API surface alone that is right. The handoff asked for the cost to be checked before following it, and the cost is what decides it:

- Flight-leg picking goes through `PlacePicker` → an **errand to the Map tab** (ADR-0134), and the Map draws every search result as a **ring on the canvas** (ADR-0168). That needs coordinates for every candidate, up front.
- An **Autocomplete prediction carries no coordinates** (ADR-0115 §2). Covering both types there would mean a Place Details call **per rendered result** — and Autocomplete's session token only zeroes the searches when the session ends in a pick, so those Details calls bill at the Pro tier, one per candidate, on every keystroke's worth of results.
- That is the exact shape this repo has rejected twice already: ADR-0115 §2 ("a Details call per rendered row") and ADR-0166 §13's rejected Google fallback. `google-places.client.ts`'s own field-mask comment states the same tradeoff in one line.

So the build stayed on **Text Search**. Worth stating plainly, because it is the part that makes the choice cheap rather than merely defensible: `includedType`/`strictTypeFiltering` are **request parameters, not field-mask entries**, so the mask — which ADR-0108 §3 makes the single lever on the SKU tier — is byte-for-byte unchanged. A restricted search costs exactly what an unrestricted one costs, and there is one call either way.

**The cost of the one-type cap, and what was built to bound it.** Google lists `airport` and `international_airport` as separate Table-A types and does not document that every `international_airport` also carries the generic `airport`. No session so far has had an API key to measure it. Under `strictTypeFiltering` a missing overlap fails **silently and totally**: Ben Gurion would simply not be in the list, on the surface where someone is picking their departure airport. So `PlacesService.searchPlacesText` **drops the restriction once when it returned nothing** — one extra call, only on an answer that was already empty, never on the path that works.

That fallback is deliberately a stopgap, and it is written to be deleted: **the overlap should be measured against a real key**, and if `airport` does cover both, the retry goes. If it does _not_, the retry is load-bearing and the honest fix is Autocomplete plus a design answer for the rings — which is a different session, not a parameter change. Recorded in `backlog.md`.

## 3. Judgement calls made during the build

- **`servedCity` is a variants map, not a string.** The pipe already stores localized variants for `summary` (ADR-0166 §11.6) and a city name is prose in the same way — `תל אביב` in a Hebrew RTL app, `Tel Aviv` where Wikidata has no Hebrew label. That turned `field === SUMMARY`, which four separate places tested inline, into a set named once (`TEXT_VARIANT_FIELDS`). Worth noticing as a pattern: **a literal comparison against a single enum member is a latent bug the day the enum grows**, and it read as a shortcut in all four.
- **`settlesIdentity` is now declared on a provider, not inferred.** The registry selected identity providers as "supplies no field of its own", which was true of Wikidata right up until this change gave it two. Left alone, Wikidata would have quietly stopped running on summary/image passes and every downstream match would have got fuzzier — with nothing failing, because a fuzzier match still returns a plausible answer. The inference is kept as the default so no other provider had to change.
- **The `P31` guard runs before the fetch, off evidence the match already carried.** It costs no request, and the London case (`Q84`, `P238 = LON`, a city) is refused without one.
- **A small memo on the Wikidata item read.** The orchestrator resolves fields one at a time, so one pass asks this provider for `iata` and then for `servedCity` off the same QID. A 16-entry, 60-second memo makes that one read instead of two (plus two of the city's). Framed as request coalescing rather than a cache tier on purpose — it has no invalidation story because a miss costs one more request and nothing else.
- **The frontend label channel is its own context** (`state/place-labels.tsx`), not a field of `useTrip()`. The derivation lives in `TripProvider` (the only holder of both `places` and `enrichments`) and is published through a second, tiny provider — because the components that actually draw a route take all their data as props and are rendered bare in their own tests, and **twenty-two spec files replace `state/trip-state` wholesale with a `vi.mock`**. A leaf reaching into that module breaks every one of them the day it needs a label; an unprovided context answers with no labels, which is precisely the behaviour those components had before. (This was found by breaking four of them first.)
- **A derived label is never re-stripped.** `shortRoute` returns a resolved endpoint untouched. `שדה התעופה של אמא` is a legitimate nickname and the stripper would answer `של אמא` — a nickname is not ours to edit.
- **An empty nickname is a value; an absent one is not.** The rename form reports `''` to clear a nickname and reports **no key at all** from the two add sources, so an add path can never write over a nickname the place already carries.

## 4. What is owed

- **Measure the `airport` / `international_airport` overlap with a real API key**, and delete the empty-answer retry if the generic type covers both (§2).
- **A real-device pass on the label.** `תל אביב · TLV` on a 360px day row alongside a time and an icon is arithmetic nobody has seen on glass — and the middle dot's behaviour in an RTL run beside a Latin code is exactly the class ADR-0118 warns about. The unit suite cannot see either.
- **Nothing renders `servedCity` or `iata` on their own.** They exist to compose the label. If a surface ever wants the code alone, that is a design question, not a data one.

## 5. Where the strings and shapes now live

| Thing                                                                 | Where                                                                                                                  |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `iata` / `servedCity` fields, TTLs, precedence, `TEXT_VARIANT_FIELDS` | `packages/shared/src/enrichment.ts`                                                                                    |
| `Place.nickname`                                                      | `packages/shared/src/entities.ts` + `backend/prisma/schema.prisma` (migration `20260808120000_place_nickname_adr0166`) |
| `PlaceSearchKind` / `PLACE_SEARCH_KIND`                               | `packages/shared/src/entities.ts` + `constants.ts`                                                                     |
| The `P31` airport guard                                               | `backend/src/enrichment/match.ts` (`AIRPORT_INSTANCE_OF_QIDS`, `isAirportEntity`)                                      |
| `P238` / `P931` reads and the rank tie-break                          | `backend/src/enrichment/providers/wikidata.provider.ts`                                                                |
| The restriction and its one-shot fallback                             | `backend/src/places/google-places.client.ts`, `places.service.ts`                                                      |
| The precedence chain                                                  | `frontend/src/lib/place-label.ts` (`derivedPlaceLabel`, `placeLabelOf`, `shortRoute`)                                  |
| The labels channel                                                    | `frontend/src/state/place-labels.tsx`                                                                                  |
