# 0166 — Place enrichment is a multi-source pipe, and what we may **cache** decides its shape

**Status:** Accepted (architecture + cost/licensing model for the enrichment pipe; owner sign-off 2026-08-04 on four forks. **No feature code** — this is the shape the build phases fill in, the same posture [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) took for the picker.)
**Date:** 2026-08-04

**Implements** [0106](0106-maps-and-places-epic-scope-and-phasing.md) §7's deferred vNext pipe (_"AI / web enrichment of places (hours, photos, descriptions) — a vNext pipe; we keep `source`/keys separable so it stays unblocked, but it is not built here"_) and delivers on [`integrations/overview.md`](../integrations/overview.md)'s "Web / AI enrichment" keep-open requirements, which asked for exactly two things: **provenance per enriched value** and **a stable key to hang enrichment on**.

**Refines:** [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) §3 (which predicted this as "further nullable columns/source keys kept separable" — §4 below takes a different shape, and says why), [0112](0112-place-in-trip-is-referenced-not-cached.md)'s closing "Related, explicitly not decided here" (the cross-trip global cache — now decided, and the `Place.icon` objection against it is answered in §3), [0055](0055-document-blob-read-caching.md) (the blob-cache template, reached for here on purpose where ADR-0108 §3 correctly refused it), [0133](0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md) §12 (the avatar's image pipeline, second consumer)
**Applies unchanged:** [0004](0004-integrations-are-pipes.md) (enrichment feeds existing surfaces, never a screen), [0011](0011-hard-soft-event-model.md) (enrichment never moves an event), [0019](0019-sync-protocol.md) (and §6 records why enrichment is deliberately **outside** the change log), [0096](0096-per-domain-claude-md-guides.md) (§5's whole point), [0147](0147-a-place-is-made-on-the-canvas.md)/[0165](0165-a-place-says-what-it-is.md) (the trip's opinion of a place stays the trip's — §3)
**Carves out:** ETA / travel time, which is **not enrichment** — §8.

## Context

The owner opened the enrichment question directly: summaries, images (_"also used as thumbnails!"_), opening times, ETA between two points by mode, "and other stuff" — with the instinct that Google Places covers some of it but not all, that **multiple sources** are needed, that Wikipedia is free, and that **caching data and images is a must, globally rather than per trip**.

Three facts, established this session against the live terms and the tree rather than recalled, reframe the request.

### 1. Google Places content may not be cached — and that inverts the design

Confirmed 2026-08-04 against Google's Places API policies and the Maps Platform service terms:

- **`place_id` is exempt** from the caching restrictions and may be stored **indefinitely**.
- **Coordinates** may be cached ~**30 consecutive days**.
- **Everything else** — names, ratings, reviews, photos, phone numbers — is to be **requested live and displayed with attribution**, not warehoused.
- **Photos are stricter than the general rule:** a **photo name must not be cached and can expire**; it has to come from a fresh Details/Search response each time.

So the owner's "cache it, and globally" and Google are in direct conflict, and the resolution is not to cache Google harder. **The cacheable fields must come from cacheable sources.** That inverts the naive design (Google first, fill the gaps from elsewhere) into the rule this ADR is built on:

> **Open-licensed sources are the own-and-cache tier. Google is the live tier.**

The multi-source enricher is therefore not a nice-to-have that a single-source version could ship without — **multi-source is what makes caching legal at all.** It has a second payoff that decides §7: bytes we are licensed to keep live on our own origin behind immutable URLs, so **enriched thumbnails work offline** (non-negotiable rule 5). A Google-hotlinked photo never will — that is the same defect the backlog already regrets for `googleAvatarUrl`.

_Accuracy note, inherited from [0106](0106-maps-and-places-epic-scope-and-phasing.md)/[0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md): Google's terms move. These were read on the date above. The **architecture** below does not change if a clause moves, because it depends only on the *direction* of the constraint (Google live, open sources stored) — but the Phase-1 build re-reads the policy page, as ADR-0108 §3's rule already requires for field tiers._

### 2. The sources, and what each is actually licensed for

| Source                                        | Gives us                                                                         | License                                | Storable                                          | Key             |
| --------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------- | --------------- |
| **Wikidata** (REST/SPARQL)                    | Commons image filename, official website, official name, coords, heritage status | **CC0** (public domain)                | **Yes — no attribution required**                 | none            |
| **Wikipedia** (`/api/rest_v1/page/summary/…`) | 1–3 sentence extract, lead image, page URL                                       | CC BY-SA                               | Yes, **with attribution** + share-alike           | none            |
| **Wikimedia Commons**                         | the image **bytes**                                                              | **per file** (CC0 / PD / CC BY-SA / …) | Yes, **if** we store that file's license + author | none            |
| **OpenStreetMap** (Overpass)                  | `opening_hours`, phone, website, cuisine, wheelchair                             | ODbL                                   | Yes, with `© OpenStreetMap contributors`          | none            |
| **Google Places**                             | name, address, coords, rating, hours, photos, phone                              | proprietary                            | **No** — `place_id` only (§1)                     | paid server key |

Two honest caveats that shape §5 more than the table does:

- **Coverage is lopsided and partial is normal.** Wikipedia/Wikidata cover **sights** (museums, landmarks, parks) well and **businesses** (a specific café) barely at all; OSM is the reverse but its `opening_hours` fill rate is patchy and regional. A per-field "we don't know" is the **common** state, not the error state — so the pipe is built around partial results, and the UI must render a place with three of six fields as normal rather than as broken.
- **The app is Hebrew-first ([0009](0009-docs-english-ui-hebrew.md)) and `he.wikipedia` is far thinner than `en`.** Language is therefore part of the fetch (try `he`, fall back to `en`) and the **language of a stored summary is recorded**, so a surface can mark a Hebrew-UI place described in English.

### 3. The hard problem is **matching**, not fetching

We hold a `googlePlaceId`, a name, and coordinates. Reaching a Wikidata QID or an OSM element from that is a **fuzzy join** (name similarity + proximity + type), and it is the real engineering risk in the whole idea: **a wrong match silently attaches the wrong photo and the wrong opening hours to a place**, which is materially worse than no enrichment at all — it is confidently wrong, on the surface people trust while standing outside the building.

This is why §5 makes the match a first-class, evidenced, _refusable_ step rather than an implementation detail inside a fetch.

## Decision

### 1. The trip's opinion stays trip-scoped; the world's facts go global

The global cache the owner asked for is legitimate, and the objection already recorded against it is answered rather than overridden.

`backlog.md` records that the `Place.icon` column **"disqualifies a cross-trip global place cache since a chosen icon is trip-scoped"**, and `schema.prisma` says the same in the column comment: an icon is _"data about this trip's view of the place, not about the entity Google describes."_ That is **correct about the `Place` row** and is **not** a verdict on global caching. The fix is not to make `Place` global — it is to **split the two things the row would otherwise conflate**, which is the same move [0112](0112-place-in-trip-is-referenced-not-cached.md) already made once for "cached" vs. "in the trip":

- **`Place` is unchanged.** Trip-scoped; owns the trip's opinion (`icon`, `category`, a renamed `name`) and its identity (`googlePlaceId`). **No migration, no column moved, no behaviour changed.** ADR-0112's cache-only state, ADR-0147's icon pick, ADR-0165's category pills and ADR-0157's delete/GC all keep working exactly as they do.
- **`PlaceEnrichment` is new and global.** Facts about the real-world entity. **No `tripId`, no FK to `Place`.** Every trip that references the same place reads the same row.

The line between them is a rule, not a judgement call: **if two different trips could legitimately disagree about it, it is not enrichment.** An icon and a category are opinions and stay on `Place`; a summary, an image and opening hours are facts about the world and go global.

### 2. Google-free by construction (owner's call, fork 1)

**No Google-sourced value is ever written to `PlaceEnrichment`.** Google fields stay exactly where they are today — `name`/`address`/`lat`/`lng`/`timezone` on the trip-scoped `Place` row, at today's volume, written at pick time by the existing `resolvePlace` (ADR-0108 §3).

This is chosen over the alternative of admitting Google's hours/photos into the global store behind a short TTL. Three reasons, in priority order:

1. **It is a testable invariant, not a promise.** "A provider whose policy says `storable: false` cannot write to the store" is one guard with one spec, and the compliance question stops depending on anyone remembering §1.
2. **A _global_ store is a conspicuously different thing from a per-trip row.** One row per real-world place, shared across every trip, is a warehouse of exactly the content the terms say to request live. The per-trip row we already ship is a much narrower claim, and it stays that narrow.
3. **It is the only version where images work offline** (§7) — which is a non-negotiable rule, not a preference.

The cost of this call, stated plainly: **the café that Wikipedia and OSM have never heard of gets no enrichment.** We accept a coverage hole rather than a defensibility hole. If Google's hours or photos are ever wanted on a surface, they are fetched **live**, rendered with Google attribution, and marked as the one thing that does not survive going offline — never persisted.

### 3. What we enrich with — and the field set is tiered by what it changes

Enrichment feeds the existing surfaces and never earns a screen (ADR-0004). Fields are adopted in tiers, by what a traveller can _do_ differently once they exist:

- **Tier A (this ADR's scope, Phase 1–2):** **image** (hero + derived thumbnail), **summary** (1–3 sentences, with its language), **opening hours**.
- **Tier B (recorded, unbuilt):** website, phone, price level, source-suggested **types** — the last is interesting because it would let ADR-0165's `category` be _suggested_ instead of only hand-set, which is a design question that ADR owns, not this one.
- **Tier C:** `rating`/`userRatingsTotal` — **not this pipe's business.** ADR-0111 deferred them on Google field-tier grounds and the columns already exist on `Place`; they light up the day that mask changes.

**Opening hours are singled out for the thing that makes them hard:** they are the one Tier-A field that is **semi-volatile** — they change, holidays override them, and a stale "open until 18:00" read at 17:50 is the worst possible failure of this feature. So hours carry a **short TTL and a visible "as of"**, and the honest operational payoff (hours × an event's own time → _"you will arrive 20 minutes after it closes"_) is deliberately sequenced **after** the image slice, because that warning must not be built on a value we are not yet confident is fresh.

### 4. Representation: a global row, a provenance-wrapped JSON payload (owner's call, fork 3)

```
PlaceEnrichment
  id             String  @id           — our own key, so alias columns can be added later
  googlePlaceId  String? @unique       — the alias we can hold indefinitely (§1); nullable
  wikidataQid    String? @unique       — added when Wikidata matches; an alias, not the key
  osmRef         String? @unique       — "node/123456"; likewise
  fields         Json                  — Record<EnrichmentField, EnrichedValue>, zod-validated
  attemptedAt    DateTime              — the negative-cache clock (§6)
  createdAt / updatedAt
```

**The key is our own `id`, with `googlePlaceId` as a unique _alias column_.** Keying the store directly on `googlePlaceId` would have been simpler and works today, but it makes Google the identity spine of a store whose entire purpose is to not depend on Google — and it strands a coordless/manually-pinned Place-lite (ADR-0147) forever. With aliases, adding `wikidataQid`/`osmRef` (or later matching a Place-lite by name + coords) is **a column and an index, not a re-key**.

**Fields are one zod-validated JSON payload, not a column per field.** This departs from ADR-0108 §3's prediction ("further nullable columns") and from this codebase's column-per-field habit, so the argument is recorded rather than slipped in: every value must carry its **own** provenance —

```
EnrichedValue = { value, source, license, attribution?, fetchedAt, confidence, lang? }
```

— which is ~6 facts per field. As columns that is a migration every time a field or a source is added, for data we never filter or join on. The type safety a column would give comes instead from the **zod schema in `@waypoint/shared`** (non-negotiable rule 3), which is where the shapes belong anyway. What stays a real column is only what we query: the alias keys and the clocks.

**Per-field provenance is the deliverable, not decoration.** It is precisely what `integrations/overview.md` asked this pipe to preserve, and it is what makes a source removable: if a source is ever dropped, its values are identifiable and deletable, and CC BY-SA's attribution obligation is carried by the value that owes it rather than by a comment somewhere.

### 5. The enricher: a provider registry with **field-level** precedence

The mechanism the owner asked for — "accept data from multiple sources, expandable easily" — is a registry of providers plus a **declared, per-field** precedence table. Living in a new `backend/src/enrichment/` module (`backend/CLAUDE.md`: a new domain gets its own module), with `providers/` inside it.

```ts
interface EnrichmentProvider {
  readonly id: EnrichmentSourceId; // ENRICHMENT_SOURCE, named constant
  readonly provides: readonly EnrichmentField[]; // what it can supply
  readonly policy: SourcePolicy; // license, storable, attribution, default TTL
  match(identity: PlaceIdentity): Promise<ProviderMatch | null>;
  fetch(match: ProviderMatch, fields: EnrichmentField[]): Promise<ProviderFieldValues>;
}
```

Five properties, each load-bearing:

1. **Precedence is per field, not per source, and it is declared data.** A `FIELD_SOURCE_PRECEDENCE` constant maps each field to an ordered list of source ids — so one place can take its summary from Wikipedia, its hours from OSM and its image from Commons. A source-level winner would discard the best available value for every _other_ field, which is the single most common way this kind of pipe is built wrong.
2. **Adding a source is one file plus one line per field it wins.** That is the concrete form of "easily expanded", and it is the acceptance test for this design.
3. **A provider is pure.** `(identity) → match → fields`. No DB access, no `ChangeService`, no trip knowledge, no storage. That is what makes it unit-testable against recorded fixtures and what keeps the store global.
4. **Providers are independently failable and time-boxed.** One source being down, slow, or rate-limited degrades that field and nothing else. Public Overpass instances explicitly disclaim production volume, so OSM is expected to be the flakiest and must not be able to hold up an image.
5. **A refusable match, per §3's risk.** `match()` returns evidence and a confidence, both stored; **below the threshold it returns `null` rather than a guess.** No enrichment beats wrong enrichment, and the stored evidence is what makes a bad match diagnosable later instead of mysterious.

**Google is a provider like any other**, wrapping the existing `google-places.client.ts` — which is **not moved, absorbed or rewritten**, so ADR-0108's server key, field masks, throttler and dedup-before-spend all stay exactly where they are. Its policy declares `storable: false`, so §2's invariant applies to it by data rather than by special case.

### 6. Enrichment is out-of-band, server-owned, and **not** in the change log

**It never touches the pick.** `resolvePlace` stays exactly as fast and exactly as failable as it is today; enrichment is scheduled after the fact. A source being slow can never make picking a place slow, and a source being down can never make picking a place fail.

**It is deliberately outside `ChangeService`** — and that needs saying, because `backend/CLAUDE.md` makes routing data-plane mutations through it the one hard boundary in the codebase. It does not apply here, for a structural reason: `PlaceEnrichment` **has no `tripId`**, is **never mutated by a client**, and needs none of the change log's machinery — no LWW (there is one writer: the server), no undo (nobody performed an action), no per-trip ordering. Writing a global row into a trip-scoped change log would mean fanning one fact out as N trip changes. So enrichment is a **server-owned read model**: the trip snapshot **joins** the enrichment for the trip's places, and a live client is nudged by a new `WS_MESSAGE_TYPE` member when enrichment lands for a place it holds. This is an exception with a stated reason, not an oversight — the boundary still stands for everything that has a `tripId`.

**Caching, layered, each layer reusing a template that already exists:**

1. **`PlaceEnrichment`** is the primary cache — global, shared across trips, **per-field `fetchedAt` + per-field TTL** (summary: effectively permanent; image: long; hours: short, per §3). A read past TTL **serves the stale value and schedules a refresh** — it never blocks and never shows a spinner where a fact used to be.
2. **Image bytes** — §7.
3. **The client** gets enrichment in the snapshot, so Dexie caches it like everything else and offline reads work unchanged.
4. **Negative caching is mandatory, not an optimization.** "We looked; Wikipedia and OSM have nothing for this café" is **stored** with its own shorter TTL. Without it, the majority of places — the ones that will never have a summary (§Context 2) — re-attempt every provider on every cold read forever. This is the single easiest thing to leave out of this design and the most expensive.

### 7. Images: the avatar pipeline is the template, and this is the blob-cache's first honest place

Every piece needed already exists and is already doing this exact job for avatars (ADR-0133 §12) — so per ADR-0096 this slice is a **second consumer**, not new infrastructure:

- **`common/storage.ts`** for the bytes (S3, local-disk dev fallback).
- **`common/image-sniff.ts`** to prove the bytes are the image they claim to be — non-negotiable here, since these arrive from a **third party** and are served **inline** into an `<img>`.
- **A `@Public` content route with immutable `Cache-Control`**, exactly as `GET /users/:userId/avatar/:key` works, and for the same reason: an `<img>` cannot send a bearer token.
- **`blob-cache.ts`** read-through (memory → filesystem → S3).

The last one is worth flagging: ADR-0108 §3 explicitly warned a future session **not** to reach for the blob-cache template for place enrichment, and it was right — the `Place` row is mutable domain data, not an immutable ciphertext mirror. Here the subject genuinely **is** immutable content-keyed bytes, so this is the template's first correct second use, and the two statements do not conflict.

Three specifics:

- **Thumbnails are derived server-side, once**, at fetch time — a map list row must never pull a 4 MB Commons original. Same intent as the avatar's client-side 512px re-encode, moved server-side because we are _fetching_ rather than _receiving_.
- **Only bytes we are licensed to keep are stored**, and the per-file Commons license + author are stored **with** them (§4) — a Commons file is not blanket-CC0, and the license lives per file.
- **A Google photo is never stored.** If one is ever shown it is live, attributed, and marked as not offline-capable.

**The fetcher is host-allowlisted, and that is a security requirement rather than tidiness.** A server that retrieves a URL which arrived in a third-party API response is an **SSRF seat** — the same seat the backlog's link-preview item already names as constraint (4) for notes, and the reason that item calls for an allowlist plus a timeout. Enrichment is the far easier case (our sources are a fixed, known set, not a URL a member pasted), so the rule is cheap to hold and stated here so the easier case does not get the weaker treatment: **outbound enrichment fetches go only to allowlisted hosts** (`www.wikidata.org`, `*.wikipedia.org`, `upload.wikimedia.org`, the configured Overpass instance), with a timeout and a response-size cap, and an image URL returned by a provider is validated against that allowlist **before** it is fetched — never followed because a response supplied it.

### 8. ETA is carved out: it is not enrichment

The owner listed _"ETA from point A to B depending on transportation"_ alongside summaries and photos. It does not belong in this pipe, and the reason is structural rather than a scoping preference: **an ETA is not a property of a place.** It is a property of `(origin, destination, mode, departure time)`, and it is traffic-sensitive — so it is per-trip, per-day, and stale within minutes. Putting it in a **global, long-lived** store would poison exactly the properties §1 and §6 are built for.

This is also already decided: [ADR-0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) §4 routes live ETAs through the Routes API on the same server-key proxy and states that results are **"not cached on the `Place` row … If a cache is ever wanted, it's a short-TTL derivation keyed by the day's ordered stops."** That stands unchanged. ETA shares this pipe's **outbound-client and rate-limit infrastructure** and none of its **store**. It is sequenced third (§9) and it is the only slice here that spends money.

### 9. Sequencing

- **Phase 1 — summary + image** (owner's call, fork 2). Wikidata + Wikipedia + Commons providers, the registry, the global store, the image/thumbnail pipeline, negative caching. All-free sources, **zero new Google spend**, and it builds the image half everything later reuses. Needs the design pass in §10 first.
- **Phase 2 — opening hours.** OSM/Overpass, per-field TTL, the "as of" surface, and only then the arrive-after-closing warning (§3).
- **Phase 3 — ETA.** Routes API, its own short-TTL keyed derivation, not this store (§8). Spends.

### 10. What this ADR does **not** decide, and cannot

**There is no image anywhere in this app today** — no place photo, no thumbnail; the hero (ADR-0160) lifts a _horizon_, not a picture. So Phase 1 introduces genuinely new visual surface area, and two questions belong to a **design session with a mockup**, not to this architecture:

1. **Where a thumbnail goes** — map list rows, shelf ideas, event rows, the place form (ADR-0148), the hero — and what it costs in a density budget that ADR-0149/0116 already record as overspent.
2. **Where attribution renders.** This is a legal obligation, not a nicety: CC BY-SA text and many Commons files require visible credit, and anything of Google's requires it too. It needs a real slot in the design language, and its copy obeys the app's separator rule (`·`, and **no em dashes**).

Also left open, recorded so it is not mistaken for an oversight: **Tier-B fields** (§3), **matching a Place-lite by name + coords** (the alias design in §4 permits it; nothing builds it), and whether source-suggested types should feed ADR-0165's `category`.

## Consequences

- **The global cross-trip cache ADR-0112 left open is now decided** — as a _sibling_ table rather than as a change to `Place`, which is why the `Place.icon` objection recorded in the backlog does not block it. ADR-0112's own "cache vs trip entity" split is the precedent, applied once more.
- **`Place` needs no migration and no behaviour change.** Everything about picking, dedup-before-spend, icons, categories, delete and the orphan sweep is untouched.
- **The compliance position is structural.** No Google-sourced value can reach the global store, enforced by a provider's declared policy and one guard — not by anyone remembering a terms clause.
- **Offline holds (rule 5).** Enrichment ships in the snapshot; images are same-origin and immutable, so the service worker caches them. The one thing that would not have worked offline — a hotlinked Google photo — is the one thing §2 excludes.
- **New: an `enrichment` module** (providers, registry, store, scheduler), **new named constants** in `@waypoint/shared` (`ENRICHMENT_SOURCE`, `ENRICHMENT_FIELD`, source policies, `FIELD_SOURCE_PRECEDENCE`) and their zod schemas, **one new `WS_MESSAGE_TYPE` member** (§6), and **one new table**. No new cache mechanism, no second HTTP client for Google, no change to the picker.
- **No new Google spend in Phases 1–2.** Every Phase-1/2 source is free and keyless. The cost note that _does_ land is a different one: public Overpass instances are not for production volume (§5.4), so Phase 2 must decide between a hosted instance, a commercial mirror, or accepting best-effort hours.
- **`api-contract.md` gains the enrichment read + the public image route** when Phase 1 lands; `data-model.md` gains `PlaceEnrichment`. Noted, not written this session.
- **The link-preview backlog item inherits half of this** (fork 4): the store and image pipeline are built subject-agnostic, so previews for a note reuse them without bending the place-shaped provider interface. Deliberately _not_ generalized further — designing one abstraction against one real consumer and one imagined one produces the wrong seams.

## Alternatives considered

- **One global `Place` table shared across trips** (the literal reading of "cached data should be global"). Rejected — this is what the backlog objection correctly kills: `icon` and `category` are the trip's opinion (ADR-0147/0165) and two trips may legitimately disagree. The sibling table gets the entire benefit and costs no migration.
- **Admit Google hours/photos into the global store behind a short TTL.** The owner's fork 1, rejected: better coverage, but it warehouses precisely the content the terms say to request live, cannot go offline, and replaces a testable invariant with a judgement call about what "temporary" means.
- **A column per enriched field, as ADR-0108 §3 predicted.** Rejected on the arithmetic: per-field provenance is ~6 facts per field, so a conventional column layout means a migration per field _and_ per source, for data nothing queries. zod-in-shared supplies the type safety the columns would have.
- **Key the global store on `googlePlaceId` directly.** Simplest and legal, rejected as an identity choice: it makes Google the spine of a Google-free store and permanently strands Place-lites. An alias column costs nothing now and keeps the door open.
- **Source-level precedence ("Wikipedia wins, else OSM").** Rejected — it discards the best value for every field the winning source happens not to have, which for these lopsidedly-covering sources (§Context 2) is most fields most of the time.
- **Enrich synchronously inside `resolvePlace`.** Tempting (one round trip, the data is there when the form opens) and rejected: it puts four third-party dependencies on the latency and failure path of the app's one paid, user-blocking write. A picked place must appear instantly.
- **Route enrichment through `ChangeService` for consistency.** Rejected for the structural reason in §6 — a global row has no `tripId` to write a `Change` against, and none of LWW/undo/ordering applies to a value no client ever authored.
- **Fold ETA into the enricher** (as the request grouped it). Rejected per §8: a traffic-sensitive tuple has no business in a long-lived global place store, and ADR-0108 §4 already decided where it goes.
- **An LLM as the summary source.** Considered and deliberately not adopted now: it would answer the coverage hole §2 accepts (it can describe the café Wikipedia never heard of), but it introduces a per-place cost, a hallucination surface on facts a traveller acts on, and an attribution story that does not exist. It is a real candidate for a later provider — which is exactly the shape §5 makes cheap to add — and it should arrive as its own decision, with the confidence and provenance machinery already in place to carry it honestly.
