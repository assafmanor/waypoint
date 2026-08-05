# 0166 — Place enrichment is a multi-source pipe, and what we may **cache** decides its shape

**Status:** Accepted (architecture + cost/licensing model for the enrichment pipe; owner sign-off 2026-08-04 on four forks. **No feature code** — this is the shape the build phases fill in, the same posture [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) took for the picker.) **AMENDED FOUR TIMES — read §11–§14 before building anything.** A coverage spike measured what the sources actually return, and it changed the image source, added a risk class §5 had not named, and put a language marker into Phase 1's scope (§11). Its narrow re-run then settled images and licenses, **removed the image-resizing step §7 assumed**, and found that the hours gap it was meant to close is still open for the one stratum that justifies the feature (§12). Then §13 answered the coverage hole §2 accepted: **a free deep link, not a Google fallback fetch** — and rejected the fetch with the arithmetic, naming the one condition that would reopen it. Then §14 (2026-08-05, after Phases 1–3 shipped) answered the question §6 only appeared to answer: **when a pass actually happens** — two triggers riding existing requests, no scheduler, enabled behind a kill switch.
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
- **The app is Hebrew-first ([0009](0009-docs-english-ui-hebrew.md)) and `he.wikipedia` is far thinner than `en`.** Language is therefore part of the fetch (try `he`, fall back to `en`) and the **language of a stored summary is recorded**, so a surface can mark a Hebrew-UI place described in English. _(How thin, measured: **9 of 27** Tokyo places have a Hebrew article — §11.5. And "so a surface can mark it" undersold what the recorded language is for: **§11.6 supersedes this clause** — `lang` is required rather than optional, and it is the hook for translation and multi-language support, not a display hint.)_

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

- **Phase 1 — summary + image** (owner's call, fork 2). Wikidata + Wikipedia + Commons providers, the registry, the global store, the image/thumbnail pipeline, negative caching. All-free sources, **zero new Google spend**, and it builds the image half everything later reuses. Needs the design pass in §10 first. _(§11.5: the summary stays in this phase and gains a `he` → `en` fallback plus a language marker; §11.1: the image resolves through Wikidata `P18`, never the REST summary.)_
- **Phase 2 — opening hours.** OSM/Overpass, per-field TTL, the "as of" surface, and only then the arrive-after-closing warning (§3). _(§11: **cannot be scheduled yet** — the spike left the hours fill rate unmeasured, so this phase has no cost and no design. The narrow re-run unblocks it.)_
- **Phase 3 — ETA.** Routes API, its own short-TTL keyed derivation, not this store (§8). Spends.

### 10. What this ADR does **not** decide, and cannot

**There is no image anywhere in this app today** — no place photo, no thumbnail; the hero (ADR-0160) lifts a _horizon_, not a picture. So Phase 1 introduces genuinely new visual surface area, and two questions belong to a **design session with a mockup**, not to this architecture:

1. **Where a thumbnail goes** — map list rows, shelf ideas, event rows, the place form (ADR-0148), the hero — and what it costs in a density budget that ADR-0149/0116 already record as overspent.
2. **Where attribution renders.** This is a legal obligation, not a nicety: CC BY-SA text and many Commons files require visible credit, and anything of Google's requires it too. It needs a real slot in the design language, and its copy obeys the app's separator rule (`·`, and **no em dashes**).

Also left open, recorded so it is not mistaken for an oversight: **Tier-B fields** (§3), **matching a Place-lite by name + coords** (the alias design in §4 permits it; nothing builds it), and whether source-suggested types should feed ADR-0165's `category`.

### 11. Amendment (2026-08-04) — what the coverage spike measured, and the five things it changed

§10 said the design session was gated on real data, so a **coverage spike** was run over 43 places — the 27-place Tokyo sample (the seed trip's city) plus 16 across Paris, Jerusalem, New York and Mexico City — in four strata: **A** landmark sights, **B** neighbourhood destinations, **C** restaurants/cafés, **D** hotels/transport. Data: [`planning/2026-08-04-enrichment-coverage-spike-data.csv`](../planning/2026-08-04-enrichment-coverage-spike-data.csv); analysis and provenance caveats in the [session note](../planning/2026-08-04-session-213-place-enrichment-coverage-spike.md).

**Read the numbers with their limits.** Every aggregate was recomputed from the raw rows and reconciles exactly, but the spike could not make direct API calls, so values were assembled from source pages rather than captured responses: **no image bytes were ever downloaded**, 23 of 33 licenses are unverified, and hours are `unknown` on 40 of 43 rows. The findings below are the ones that survive those limits — mostly negative results and real dimensions, which are the robust kinds here.

**1. The image comes from Wikidata `P18`, never from the Wikipedia REST summary.** This is the amendment that would have caused a licensing breach. The REST summary's `thumbnail`/`originalimage` is **not reliably a free photograph of the place**: for the Eiffel Tower it returned a **non-free logo**, and for Canal Saint-Martin **a map**. §7's rule therefore tightens: resolve the image through Wikidata `P18` → verify the file's own license on Commons → only then store. A REST-summary image is never a storable source. The naive path here caches a non-free file, which is exactly what §2's invariant exists to prevent, and no amount of per-file license _storage_ would have helped if the file itself was the wrong one.

**2. A new risk class §5 did not name: a _right_ match at the _wrong granularity_.** §5 guarded against the match being wrong. The spike found matches that are correct and still misleading: **Tsukiji Outer Market** resolves to the article about the former **wholesale** market (a different place, since closed and moved), and **Meguro River** resolves to the whole river rather than the canal-side spot people actually go to. The entity is right; the content describes something broader or historical. So the refusable match gains a **granularity check** alongside its identity check — a candidate whose `instance of` is a category broader than the saved place (a river for a riverside spot, a chain for a branch, a district for a shop) is refused for **summary** even where it is fine for **image**, which the per-field design in §5.1 already makes expressible. The "confidently wrong" failure this ADR was built to avoid has two shapes, not one.

**3. Image and summary are independently optional, and "no image" is a first-class state.** Four places have a usable image and **no Wikipedia article in any language we read** (Yanaka Ginza, Omoide Yokochō, Shinjuku Granbell, Park Hyatt Tokyo) — a source-level winner would have discarded those images, so this is the strongest validation of §5.1's per-field precedence. In the other direction, the number that governs the design: **Tokyo restaurants and cafés scored 0 of 7** — no match, no image, no summary — against 14 of 14 for landmark sights. The overall 76.7% image rate is **selection-biased upward** by the non-Tokyo restaurants, which were chosen for fame (Pujol, Katz's, Chartier); Tokyo's honest rate is 70.4%. An image-led card is right for landmark discovery and **wrong for a mixed itinerary**, where the ordinary branch is the common row.

**4. No blind square centre-crop.** Across 30 captured dimensions: **5 portrait, 2 near-square, 23 landscape**, spanning **0.653 to 1.78**, with originals up to **26.3 MB**. So store the original dimensions, render into a bounded container, and treat extreme portraits (Tokyo Skytree at 0.653, Park Hyatt at 0.75) as a case the layout must survive rather than an outlier. The avatar precedent's square centre-crop does **not** transfer — a building centre-cropped square is frequently sky. And the 26 MB original settles that a thumbnail is mandatory regardless of who generates it: **Commons' own `iiurlwidth` thumbnailing was never actually exercised**, so §7's "derive server-side, once" stands until it is.

**5. Phase 1 keeps the summary, with a `he` → `en` fallback and an explicit language marker (owner's call, 2026-08-04).** Hebrew articles exist for only **9 of 27 Tokyo places (33%)** against 15 of 27 in English — the risk §Context 2 flagged, confirmed. The spike recommended demoting summaries out of Phase 1; the owner kept them and chose the English fallback instead, marked in the UI. That is a **product-voice decision with a design obligation attached**, so it is recorded as such: a Hebrew-first, RTL app (ADR-0009/0017) will show English prose for most places that get a summary at all, and the marker that says so is now a **third** required item in §10's design pass, alongside the thumbnail slot and the attribution slot. Mixed-direction text in an RTL surface is exactly where ADR-0118's isolation rules bite, and its lint guard cannot see a runtime-chosen language.

**6. `lang` is required on every text-bearing value, and a text field stores localized _variants_ rather than one value (owner's call, 2026-08-04).** §4 had `lang?` as an optional display hint — "so a surface can mark a Hebrew-UI place described in English". The owner's reason is better and makes it structural: the recorded language is the **hook for machine translation** of English articles into Hebrew, and for **multi-language support** in the app, both of which are plausible enough that throwing the information away now would be the expensive choice. Four consequences, each of which keeps the change additive:

- **`lang` becomes required, not optional**, on any value carrying prose. Stored text whose language is unknown cannot be marked, translated, or selected against a user's locale — there is no defensible state where we hold a sentence and don't know what it is written in.
- **A text field holds localized variants, not a single value** — `summary` becomes a set keyed by language, each variant a full `EnrichedValue` with its own source, license and `fetchedAt`. Picking one for a reader is then a **resolution function** over the variants (the same shape as §5.1's precedence), not a schema change. Doing this now costs one type; retrofitting it later would mean migrating every stored summary.
- **A translation never overwrites its original.** It is a new variant carrying `derivedFrom` (the original value + its language) and the translator as its `source`. Keeping the original is not tidiness: it is required to satisfy attribution, and it is what lets a better translator re-run later without re-fetching Wikipedia.
- **A translation of CC BY-SA text is a derivative work**, so it **inherits** the license and its attribution and share-alike obligations — the credit belongs to the Wikipedia authors, not to us or the translator. §4's per-value license field already carries this; what §11.6 adds is that the obligation must **propagate** along `derivedFrom` rather than being re-derived, or a translated summary would silently lose the attribution its source demanded. (A translation provider is otherwise just another provider under §5 — its input happens to be a value we already hold instead of a remote API, which is why it needs no new machinery.)

**What the spike failed to measure, so it is still open.** **Opening hours: 3 values across 43 places, with the rest `unknown` rather than `absent`.** Phase 2 has no fill rate, which means it has no cost and no design either — it cannot be scheduled on this data. The three values captured do already prove hours are not a seven-row weekly table (`Mo-Su 06:00-17:00`; `Mo off; Tu-Su 09:30-16:00; Dec 29-Jan 03 off`; `09:30-23:45; Jun 21-Sep 02: 09:00-00:45; Jul 14,Jul 15 off`), so §3's "keep the raw expression" holds and hardens: **store the original OSM string, always**, and derive any display from it. A narrow re-run owns the three gaps — download real images, resolve the remaining licenses, and query Overpass properly (see the backlog). _(**Ran the same day — §12 has the results.** Two gaps closed, the third only half-closed, and it removed an image-processing step we had assumed we needed.)_

### 12. Amendment (2026-08-04, second) — the re-run: images and licenses settled, hours still half-dark

The narrow re-run §11 called for ran with real API access. Data refreshed in place at [`planning/2026-08-04-enrichment-coverage-spike-data.csv`](../planning/2026-08-04-enrichment-coverage-spike-data.csv), with the full per-file license table at [`…-licenses.json`](../planning/2026-08-04-enrichment-coverage-spike-licenses.json).

**1. The image pipeline loses its resize step — a simplification, not a compromise.** `iiurlwidth` does **not** honour arbitrary widths (a request for 200/400/800 returned 250/500/840–960 — MediaWiki rounds up to thumbnail buckets), but it returned a **working, server-generated thumbnail for all 32 images, every time**, at **36–250 KB** (median 71 KB). So §7's "derive the thumbnail server-side, once" is **replaced by: fetch the bucket Commons already generated and store those bytes.** We never download the 26 MB original, and the backend needs **no image-resizing dependency at all**. What does **not** change is that we store our own copy: hotlinking Commons would reintroduce the third-party-request-per-render and not-available-offline defect that §2 rejected for Google photos, and the same objection applies whoever the host is. Ask for a nominal width, accept the bucket you get, size with CSS.

**2. Licenses are fully resolved: 0 exclusions, and attribution is the _default_, not an edge case.** All 32 files carry recognized free licenses — **27 of 32 (84%) require visible attribution**; only 5 do not (2× CC0, 3× public domain). This settles the design question §10 raised: the attribution slot is not a rare state to accommodate, it is what almost every enriched image will need, so it is laid out first and the credit-free case is the exception. Nine distinct license strings appeared across 32 files, including regional ports (`CC BY-SA 3.0 de`) and older versions (`CC BY-SA 2.5`) — which is why §4 stores the license string per file rather than a normalized enum.

- **One licensing exception worth a decision: GFDL.** The Western Wall's `P18` is **GFDL 1.2 only**, with an empty machine-readable `License` field. GFDL is a documentation license whose attribution terms are far heavier than CC's — it contemplates reproducing the license text — and it is widely treated as impractical for image reuse in an application. **Recommendation, adopted unless overruled: treat a GFDL-only file as no image** (fall through to the next candidate or to the no-image state) rather than shipping an obligation we cannot reasonably discharge in a thumbnail caption. It is one file in 32, so the cost of refusing is small and the cost of getting it wrong is not.

**3. The `wikidata` tag makes QID → OSM an _exact_ join, which materially de-risks §Context 3.** Ten of the 31 OSM objects were found not by fuzzy proximity but by the OSM object's own `wikidata=Q…` tag. That is an identity join, not a guess. So the matching pipeline gains a clear order: **QID → OSM `wikidata` tag first (exact), settled OSM id second, proximity + name similarity only as a last resort** — and the confidence recorded in §5.5 should reflect which of the three produced the match, because they are not equally trustworthy.

**4. The hours number is real but its headline is not, and the stratum that matters is still dark.** The re-run reports **15/43 = 34.9%**. That denominator counts 11 rows that were **never queried** as though they had failed. Of rows where an OSM object was actually found it is **15/31 = 48.4%**, and even that hides the thing we needed:

| Stratum                   | present | absent | never queried | present ÷ queried |
| ------------------------- | ------: | -----: | ------------: | ----------------: |
| A — landmarks             |      10 |      4 |             0 |           **71%** |
| B — neighbourhood         |       1 |      6 |             2 |               14% |
| **C — restaurants/cafés** |       2 |      1 |         **8** |      67% **of 3** |
| D — hotels/transport      |       2 |      5 |             2 |               29% |

**Eight of the eleven never-queried rows are stratum C.** So the fill rate for restaurants — the stratum where an opening time is the entire point — rests on three places, all of them famous ones. Phase 2 is better costed than it was and is **still not costed for the case that justifies it**.

**And the reason those rows went unqueried is an artifact of the spike, not a property of the world** — which is the most consequential thing in this amendment. The spike had no coordinate column, so it fell back to the matched Wikidata item's `P625`; rows with no Wikidata match therefore had nothing to query with. **In production every place has coordinates** — they arrive with the Google pick and are cached on the `Place` row (ADR-0108 §3). So the real pipeline can ask OSM about a café that Wikipedia has never heard of, and the spike's method accidentally **coupled hours coverage to Wikidata matching when the two are independent**.

That reopens a sequencing question in a useful direction: the restaurant coverage hole §11.3 measured is a **Wikipedia/Wikidata** hole, and OSM is the source that covers businesses. It is therefore plausible — **not yet shown** — that hours are the enrichment that works best for exactly the places where image and summary fail. If a third measurement is ever run, it is this one: query Overpass by coordinate for ordinary businesses, with no Wikidata step in the way.

**5. Two smaller things the real bytes exposed.** The very first real fetch produced a **content-type/extension mismatch** — Katz's `P18` is a PNG that landed under a `.jpg` name — which is precisely why `image-sniff.ts` is in the pipeline (§7); the sniffer decides the type, the filename never does. And **teamLab Planets has no `P18` claim at all** despite having both English and Hebrew articles, so the true image count is **32 of 43, not 33**: a Wikidata item can carry sitelinks and no image, which is the mirror of §11.3's image-without-article case and further evidence that the two fields travel separately.

**Aspect range widens.** With the corrected Eiffel Tower file (2900×5367), the measured range is now **0.54 – 1.78** with **6 portraits in 32**. §11.4's rule is unchanged and its worst case is worse than it looked.

### 13. Amendment (2026-08-04, third) — the coverage hole's answer is a **link**, not a fallback fetch

§11.3 measured a hole and §2 accepted it on principle: the café Wikipedia and OSM never heard of gets nothing. The owner asked the obvious follow-up — **fill the gap from Google, but only where the open sources missed, so we spend as little as possible** — plus a second, smaller idea: **a button through to the place on Google Maps**. They turn out to be the same question, and the second is the answer to the first.

**The Google-fallback arithmetic runs backwards, so it is rejected.** The instinct is that querying Google only on a miss is the cheap version. It is the opposite, and the reason is §1: **the open-source pipe is not cheap because it queries rarely — it is cheap because it queries once, ever, for every trip.** Google can never do that, because its content may not be cached. So a conditional Google fallback is not a cheaper Google; it is the **most expensive possible** Google:

- **The cost is per render, not per place.** One trip with ~20 Google-only places × 5 members × ~10 app-opens is ~1,000 Place Details calls — the whole monthly free allowance at the higher tier, for a single trip. (Hours and photos move the mask above the Pro tier the picker uses today; the exact tier is confirmed at implementation per ADR-0108 §3, not from a recalled mapping — but the direction is not in doubt.)
- **It fires on the most-viewed rows.** The places with no open-source coverage are the restaurants, which is where the hole is and also where people look most while deciding.
- **Photos are worse.** The photo name must come from a fresh Details call and then be fetched separately, neither cacheable, so the image cannot go offline — breaking non-negotiable rule 5 on the majority of rows.
- **It dissolves the invariant that makes §2 testable.** "No Google-sourced value reaches the store" is one guard with one spec; "…unless the open sources missed" is exactly the judgement call §2 was chosen over.
- **It is a pattern this codebase already rejected once**, in nearly these words — [ADR-0115](0115-plan-mode-place-research.md)'s _"Resolve every visible prediction so cards can show rating + distance… the most expensive possible reading of the epic — a Details call per rendered row."_

And to close the near-miss: we **already** make a Details call at pick time, so widening that mask costs no additional calls. It still fails, because the blocker was never call volume — we would pay a higher tier on every pick for a value the terms then require us to throw away.

**A deep link is free and gives strictly more.** `https://www.google.com/maps/search/?api=1&query=…&query_place_id=…` costs **nothing** — no API call, no key, no quota — and hands over everything Google holds: hours, photos, reviews, phone, live busy-ness, all current. Against a paid, uncacheable, offline-hostile snapshot of two fields that are stale the moment they land, the link wins on every axis. So the answer to the coverage hole is to **hand the question over**, which is also what [ADR-0004](0004-integrations-are-pipes.md) and the vision have always said about not rebuilding Google.

**Where it goes: the place detail / selection surface only** (owner's call). This narrowly revises [ADR-0121](0121-embedded-map-phase-6-design.md) §8, which retired "View on Google Maps" from the Map-tab **row** — and the revision is narrow because §8's argument still holds where it was aimed. §8 retired a **"where is it"** link, on the grounds that _"with our own map on screen a second Google destination competes with the thing it was standing in for"_, leaving `נווט` as the row's one Google button. That reasoning is untouched: the row keeps exactly one Google exit, and our map still answers _where_. What is new is a question our map does **not** answer and, per §11.3, our enrichment will not answer either for most restaurants: **what does Google know about this place.** Same URL, different question, and it belongs beside the enrichment it supplements — where a missing summary or a missing image is visible in the same glance.

**Reuse, verified against the tree:** `mapsSearchUrl(query, googlePlaceId)` already exists in `frontend/src/lib/places.ts`, built for exactly this and currently narrowed to serve research predictions (`mapsPredictionUrl`). This widens its job back out; it adds a caller, not a builder, and no new URL construction (ADR-0096).

**The one condition that would reopen the fallback.** A link is something a person reads; it cannot be **computed against**. The arrive-after-closing warning (§3) needs hours as _data_, and if OSM's coverage for restaurants proves too thin to support it (§12.4 — still unmeasured for exactly that stratum), then a live, user-initiated, **unstored** Google fetch for that single field becomes worth costing. That is the only case. It would arrive as its own decision with its own cost line, and it would still store nothing.

### 14. Amendment (2026-08-05) — **when** a pass happens, which §6 never said (owner's call)

§6 settled that enrichment is out-of-band, server-owned and outside the change log, and then described its timing in four words: _"enrichment is scheduled after the fact."_ That sentence reads as a decision and is not one — it names a constraint (not during the pick) and no mechanism. **No phase of the [build plan](../planning/2026-08-05-place-enrichment-build-plan.md) claimed the trigger either**, so Phases 1–3 shipped a complete pipe that nothing ever started: the store, the providers, the image pipeline, the snapshot join and the WS nudge all worked, and `snapshot.enrichments` was `{}` in production. Recorded plainly because the way it went missing is instructive — a design sentence in the present tense ("is scheduled") reads as already-true, so nobody costed it.

**Two triggers, both riding a request that was already happening.**

1. **A pick.** `resolvePlace` schedules one pass for the place just picked — the moment a person is looking at the thing they just added, and therefore the moment enrichment is worth having.
2. **A snapshot read.** The enrichment join added in Phase 3 already reads the rows for the trip's places, so deciding _which are missing or past TTL_ costs **no extra query**. That list is handed to the scheduler.

The second is what makes the set complete, and it is worth being explicit about what each of its jobs would otherwise need its own mechanism for: it **backfills** every place picked before this existed, it **refreshes** a value once its TTL lapses, and it **recovers** a pass a redeploy interrupted. Nothing else has to remember to do any of that.

**No scheduler, and that is consistent with decided practice rather than a new preference.** [ADR-0157](0157-a-place-can-be-removed.md) §6 already faced this question for the orphan sweep and answered it in the same direction — the sweep runs where places are minted, and its own code says _"the repo has no scheduler and this is not a good enough reason to introduce one"_. Enrichment is a weaker case for one, not a stronger one: the work is a few dozen rows per trip, and a clock-driven sweep would need its own dependency, its own overlap guard, and a story for a multi-instance deploy that ADR-0019 explicitly does not have.

**What bounds the outbound traffic is the negative cache, not the scheduler.** §6.4's miss TTL means a place with nothing is re-attempted at most once every 30 days however often it is read, so fetch volume is bounded by the number of **places**, not by traffic. The scheduler's own caps are the second line of defence for the cold-start case: at most 3 passes in flight process-wide, at most 3 started per snapshot read, and one pass per real-world place regardless of how many trips hold it.

**Surplus work is dropped, never queued.** This looks lossy and is not: the read trigger is idempotent and re-fires on the next snapshot, and `attemptedAt` is written only when a pass completes — so a dropped or interrupted pass simply still reads as stale. A queue would be state a redeploy loses anyway, protecting work that costs nothing to redo.

**This narrowly revises §6's "`resolvePlace` is untouched", and keeps the guarantee that clause was protecting.** The call is synchronous, returns `void` immediately, and cannot throw — so the pick stays _exactly as fast and exactly as failable_ as it was, which is what §6 actually cared about. It is wrapped in a `try` at the call site rather than trusting the scheduler to stay well-behaved, the same way `sweepAfterMint` is: a pick is a paid, user-blocking write with a form waiting on it, and no housekeeping may be what fails it.

**It ships enabled, behind one kill switch** (`ENRICHMENT_DISABLED`, owner's call) — the same env-gated-with-a-switch shape as the document blob cache. Enrichment is the only thing in this app that talks to a third party on its own initiative, so it gets the one variable that stops it doing so, without touching the reads, which serve already-stored data. **Nothing here has ever made a live Wikimedia request**, which is the reason a switch is worth having on the first deploy rather than a nicety.

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
