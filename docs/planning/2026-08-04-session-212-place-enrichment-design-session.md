# 2026-08-04 · session 212 — enriching a place from many sources (design session)

**Outcome:** [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md), plus in-place amendments to [`integrations/overview.md`](../integrations/overview.md) (the "future pipe 🔭" it described is now decided), [0106 §7](../decisions/0106-maps-and-places-epic-scope-and-phasing.md) (its deferred vNext pipe), [0108 §3](../decisions/0108-maps-and-places-backend-architecture-key-model-and-cost.md) (its prediction about the shape) and [0112](../decisions/0112-place-in-trip-is-referenced-not-cached.md) (its open "related, explicitly not decided here"). Three phases sequenced; **nothing built** — paper only, the posture ADR-0108 took for the picker.

## What the owner brought

_"Something big into discussion: enriching places with information"_ — a summary, images (_"also used as thumbnails!"_), opening times, ETA from A to B by transportation mode, "and other stuff". With three instincts and one requirement attached:

- Google Places supports **some** of this but not all.
- We should build infra that can enrich **from multiple sources**, expandable later.
- Wikipedia is free and could supply some of it.
- **Caching data and images is a must** — to save time and money — and cached enrichment should be **global, not per trip**.

Five questions asked explicitly: what data, what sources, how to build a generic multi-source enricher, how to represent enriched data, and caching.

## What reading the docs and the terms changed

**The pipe was already named and already constrained.** ADR-0106 §7 deferred exactly this ("AI / web enrichment of places (hours, photos, descriptions) — a vNext pipe"), and `integrations/overview.md` had already written down its two keep-open requirements: **provenance per value** and **a stable key to hang enrichment on**. So this session implemented a promise rather than opening virgin ground — and both requirements turned out to be the load-bearing parts of the design, not preamble.

**One verified fact reorganized everything else.** Read against Google's live policies rather than recalled: **Places content may not be cached.** `place_id` is exempt (indefinite), coordinates get ~30 days, and names/ratings/photos/phone are to be requested live with attribution. Photos are stricter still — **the photo name itself must not be cached and can expire**.

So "cache it, and globally" and Google are in direct conflict, and the resolution is not to cache Google harder: **the cacheable fields must come from cacheable sources.** That inverts the naive design into _open sources are the own-and-cache tier, Google is the live tier_ — which means the owner's multi-source instinct is right for a stronger reason than the one given. **Multi-source is what makes caching legal at all**, not a nice-to-have a single-source version could ship without. It also has a second payoff that decided the image design: bytes we may keep sit on our own origin behind immutable URLs, so enriched thumbnails **work offline** (rule 5), where a Google-hotlinked photo never would — the defect the backlog already regrets for `googleAvatarUrl`.

**The backlog's objection to a global cache was answerable, not overridable.** `backlog.md` records that `Place.icon` _"disqualifies a cross-trip global place cache since a chosen icon is trip-scoped"_, and `schema.prisma` says the same in the column comment. That is right about the **`Place` row** and is not a verdict on global caching: don't make `Place` global, put a sibling table on the other side of the line the comment already draws. Which is [ADR-0112](../decisions/0112-place-in-trip-is-referenced-not-cached.md)'s own "cache vs trip entity" split applied once more — and it means **no migration to `Place` at all**.

**Two of the owner's five questions turned out to be one question with a different answer than expected, and one item was not enrichment.**

- **Representation and caching are the same question**, because the answer to both is "it depends per field, per source" — so the field descriptor has to carry `{source, license, storable, fetchedAt, ttl, confidence}` as first-class data. Licensing is not metadata about the pipe; it is a field of every value flowing through it.
- **ETA is not enrichment.** It is a property of `(origin, destination, mode, departure time)` and it is traffic-sensitive — per-trip, per-day, stale in minutes. ADR-0108 §4 had already decided it: Routes API, explicitly **not** cached on the row. Folding it in would have poisoned the exact properties the global store exists for. Carved out and sequenced third.

**The real risk is matching, not fetching.** We hold a `googlePlaceId` + name + coords; reaching a Wikidata QID or an OSM element is a fuzzy join, and a wrong match **silently attaches the wrong photo and the wrong opening hours** — confidently wrong, on the surface people trust while standing outside the building. So the match became a first-class, evidenced, **refusable** step: below a confidence threshold it yields nothing rather than a guess.

**Coverage is lopsided, and that decided the merge strategy.** Wikipedia/Wikidata cover _sights_ well and _businesses_ barely; OSM is the reverse, with patchy `opening_hours` fill. So partial results are the **normal** state, and precedence must be **per field** — one place taking its summary from Wikipedia, its hours from OSM, its image from Commons. A source-level winner would discard the best value for every other field, which for these sources is most fields most of the time.

## The decision, in one line

**What we may cache decides the architecture: open-licensed sources are the store, Google stays live, and the trip's opinion of a place never becomes the world's facts.**

## Forks put to the owner, and the answers

| Fork                                                    | Answer                                                                                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Should the global store be Google-free by construction? | **Yes** — a testable invariant beats a judgement call about "temporary", and it is the only version where images work offline                       |
| Which slice ships first?                                | **Summary + image/thumbnail** — all-free sources, zero new Google spend, and it builds the image pipeline everything later reuses                   |
| Field storage shape                                     | **Typed JSON payload, zod-validated in shared** — accepted as a departure from the column-per-field habit, argued in the ADR rather than slipped in |
| Enricher subject width                                  | **Place-shaped providers, subject-agnostic store + image pipeline** — so link previews reuse that half without bending the interface                |

The first answer is the one worth remembering: it **accepts a coverage hole rather than a defensibility hole.** The café Wikipedia and OSM have never heard of gets no enrichment, on purpose.

## What the reuse audit found

Checked against the tree, not recalled — and the image slice turned out to own almost no new infrastructure:

- **All four image pieces already exist and already do this job for avatars** (ADR-0133 §12): `common/storage.ts`, `common/image-sniff.ts`, a `@Public` immutable content route, and `blob-cache.ts` read-through. Phase 1 is a **second consumer**, not new infra.
- **`blob-cache.ts` is finally in the right place** — ADR-0108 §3 explicitly warned a future session not to reach for it for place enrichment, and it was right, because the `Place` row is mutable domain data. Here the subject genuinely is immutable content-keyed bytes, so this is the template's first correct second use and the two statements don't conflict. Worth noting precisely _because_ the ADR says "don't".
- **`google-places.client.ts` is not moved, absorbed or rewritten** — Google becomes one provider wrapping it, so ADR-0108's server key, field masks, throttler and dedup-before-spend all stay put.
- **One deliberate exception to a hard boundary, with its reason recorded.** Enrichment does **not** go through `ChangeService`, which `backend/CLAUDE.md` calls the one hard boundary in the codebase. It doesn't apply: a global row has **no `tripId`** to write a `Change` against, no client ever authors it, and none of LWW/undo/per-trip ordering is relevant. Stated in ADR-0166 §6 so a future reader sees an argued exception rather than an oversight.

## What this session could not decide

**There is no image anywhere in this app today** — no place photo, no thumbnail, and the hero (ADR-0160) lifts a _horizon_, not a picture. So Phase 1 introduces genuinely new visual surface area, and two questions need a **design session with a mockup** before it can be built:

1. **Where a thumbnail goes** (map rows, shelf ideas, event rows, the place form, the hero) — against a density budget ADR-0149/0116 already record as overspent.
2. **Where attribution renders** — a legal obligation, not a nicety (CC BY-SA text and many Commons files require visible credit; so does anything of Google's). Its copy obeys the separator rule (`·`, no em dashes).

One cost note that is **not** about Google, recorded because it will bite Phase 2: public Overpass instances explicitly disclaim production volume, so opening hours will need a hosted instance, a commercial mirror, or an accepted best-effort posture.

## Next

Phase 1 needs the design pass above, then builds: the `enrichment` module, the provider registry with per-field precedence, the global `PlaceEnrichment` table, negative caching, and the Wikidata/Wikipedia/Commons providers behind the existing image pipeline.
