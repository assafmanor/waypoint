# 0166 — Place enrichment is a multi-source pipe, and what we may **cache** decides its shape

**Status:** Accepted (architecture + cost/licensing model for the enrichment pipe; owner sign-off 2026-08-04 on four forks. **No feature code** — this is the shape the build phases fill in, the same posture [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) took for the picker.) **AMENDED ELEVEN TIMES — read §11–§21 before building anything.** A coverage spike measured what the sources actually return, and it changed the image source, added a risk class §5 had not named, and put a language marker into Phase 1's scope (§11). Its narrow re-run then settled images and licenses, **removed the image-resizing step §7 assumed**, and found that the hours gap it was meant to close is still open for the one stratum that justifies the feature (§12). Then §13 answered the coverage hole §2 accepted: **a free deep link, not a Google fallback fetch** — and rejected the fetch with the arithmetic, naming the one condition that would reopen it. Then §14 (2026-08-05, after Phases 1–3 shipped) answered the question §6 only appeared to answer: **when a pass actually happens** — two triggers riding existing requests, no scheduler, enabled behind a kill switch. Then the first live run produced §15 and §16 — four defects across two evenings, all of them the same mistake in different places (**treating an absence of discriminating evidence as evidence**) — plus one new route: a **cross-script name comparison** was refusing correct matches (`מגדל אייפל` found and discarded), a **candidate with no coordinates** was winning on an exact name (`Piccadilly Circus` matched a song), and the recall hole behind the first is now answered by a **coordinate-first identity route** — the coordinates find it, the name checks it. Then §17 (owner's ask, same day) extended the pipe to the place you have **not** saved: a third trigger with a person waiting on it, one membership-scoped read route, and the trust boundary that comes with a client-supplied identity landing in a global store. Then §18 (2026-08-08) added the **airport pair** — `P238`/`P931`, gated by a `P31`-is-airport guard that refuses the one measured false positive — closing field reports #6/#7/#23, and put a user-authored `Place.nickname` above the derived label for the case the data cannot settle — with the label reading as the **city** on every row and the code kept for the booking detail, which has room for it. Then §19 (the first real trip's own bookings) fixed the two things that made the derivation miss — an appended parenthetical scoring a correct match under the floor, and Wikidata's official label where the common name was wanted — and recorded the one it deliberately did not. Then §20 added a **fourth match route** — Wikipedia's full-text search — and an airport-sized distance ruler, for the airport that neither a label search nor a 500m coordinate search could ever have reached. Then §21 (2026-08-11, owner report: Kerið matched nothing) found the floor refusing a candidate the coordinates had found alone and at the pin, and gave §15's Rule 1 a second clause: **a name of ours that only says more than the candidate's has not disagreed with it**, so it is set aside rather than believed.
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

> **Amended 2026-08-11 (owner report: enrichment "takes a long time"), and the clause above is where it was wrong.** The read trigger _is_ idempotent — but "it re-fires on the next snapshot" quietly assumes a next snapshot, and a snapshot read happens when somebody **opens the trip**, not on a clock. So a read started three passes, discarded the rest, and stopped. With the negative cache cleared — which §6.4 tells anyone re-testing a match to do — every place in a trip is stale at once, and a 40-place trip needed **fourteen app-opens** to fill in. The owner reported it as slowness and it was: places the matcher resolves perfectly well (`פסל החירות`, `Q9202`, name route, 0.900) simply had not been asked about yet.
>
> **What changed is one thing, and deliberately not the rate: a pass's completion takes the next stale place.** The surplus from a read is now _held_ rather than dropped, and each freed slot pulls from it, so a backlog drains from one app-open instead of one open per three places.
>
> **The concurrency cap is unchanged at 3, and that is the measured half of this amendment.** The obvious reading of "it is too slow" is "raise the caps", and the recall probe (§22) is the first thing in this repo to have generated real Wikimedia traffic: ~2,000 requests from one client with a proper `User-Agent`, and even at roughly 1.3 requests/second it drew occasional `429`s that a single retry cleared. That does **not** support a higher ceiling. The defect was never the rate — it was stopping. So the fix keeps the same three slots and keeps them busy, which is the polite version of the same outcome.
>
> **It is still not a scheduler**, and ADR-0157 §6's refusal still stands: nothing ticks, nothing is persisted, nothing needs shutting down, and a restart loses the backlog exactly as before — the next snapshot read rebuilds it for free, which is what made dropping it safe to begin with. The backlog is bounded (`MAX_PENDING_BACKFILL`) as a memory bound rather than a rate, and anything past it is **logged**, not silently truncated.

**This narrowly revises §6's "`resolvePlace` is untouched", and keeps the guarantee that clause was protecting.** The call is synchronous, returns `void` immediately, and cannot throw — so the pick stays _exactly as fast and exactly as failable_ as it was, which is what §6 actually cared about. It is wrapped in a `try` at the call site rather than trusting the scheduler to stay well-behaved, the same way `sweepAfterMint` is: a pick is a paid, user-blocking write with a form waiting on it, and no housekeeping may be what fails it.

**It ships enabled, behind one kill switch** (`ENRICHMENT_DISABLED`, owner's call) — the same env-gated-with-a-switch shape as the document blob cache. Enrichment is the only thing in this app that talks to a third party on its own initiative, so it gets the one variable that stops it doing so, without touching the reads, which serve already-stored data. **Nothing here has ever made a live Wikimedia request**, which is the reason a switch is worth having on the first deploy rather than a nicety.

### 15. Amendment (2026-08-05) — the first live run: a cross-script comparison, and the recall question it exposes

Egress reached Wikimedia for the first time and the store filled with `absent` / `not_found`. The owner's two data points named the shape of it precisely: **`Stokksnes` matched, `מגדל אייפל` did not.**

**The defect was a comparison, not a search.** `wbsearchentities` was called with `uselang=en`, and `uselang` selects the language of the labels in the **response** — it is not a search fallback, which is what the code's comment claimed it was. So every hit came back named in English and the name score compared a Hebrew saved name against `Eiffel Tower`: ~0, refused by §5.5's confidence gate before the entity was ever read. **The search had found the right item; the scoring threw it away.** A Latin saved name compared fine, which is why the two reports differ.

Fixed by scoring a candidate against **every name it offers** — `match.text` (what actually matched the query, so it is in the query's own script by construction), the label, and the aliases — and by re-scoring against all of the entity's labels rather than one preferred label. §5.5 is untouched: each comparison still clears the gate on its own and the distance veto still applies to whichever name won. What changed is that the right name is among the ones tried.

**The general rule, because it will recur in every provider that matches by name:** a saved name and a source's label are routinely in **different scripts**, and comparing across scripts scores 0 — which reads as "wrong place" when it means "different alphabet". The app asks Google for `languageCode=he`, so this is the normal case for a famous place, not an edge one.

**And the deeper problem the fix exposes: recall.** Scoring correctly only helps items the search **returned**. A name search only ever reaches an item labelled in a language we thought to ask for, and there is no language we can ask for that covers a Hebrew-named trip through Iceland and Japan. Three options were put to the owner; **(2) is built, (3) is recorded for later, and (1) happens by itself now that both are in place:**

1. Measure first — re-run on real data and size the hole.
2. **A coordinate-first identity route — BUILT.** `generator=geosearch` on `en`, then `he.wikipedia.org` (GeoData) returns the articles within 500m of a point with no name matching at all, and `pageprops.wikibase_item` turns each into the QID the pipe already runs on. Free, language-independent, one call to a host §7 already allows, and **a fourth match method** (`geosearch`) so a match made this way stays diagnosable.
3. An English name from Google — reliable, and it would help Wikipedia's own search too, but `displayName` returns one language per request, so it is a second billed Details call on every pick (ADR-0108 §3's envelope). **Recorded, not built.**

**The coordinate route needs two rules to be safe, and they are the whole of its design.**

**Rule 1 — a name comparison across disjoint scripts is UNINFORMATIVE, not negative.** This is the same insight as the bug above, generalized: `nameSimilarity` returns 0 both for "different places" and for "the same place in two alphabets", and conflating them is what broke the first live run. So the scripts are checked before the score is believed. When they overlap, a disagreeing name refuses the candidate exactly as it would on the name route — the article nearest a ramen bar is often the district, and that is a real refusal. When they do not overlap, the distance answers alone, under the lower `geosearch` ceiling: a claim nothing corroborated is a weaker claim, so a named match always outranks a coordinate-only one.

**Rule 2 — a broader entity found ONLY by proximity is skipped, not accepted with per-field refusals.** §11.2's asymmetry (refuse the summary, keep the image) is right when the _name_ established the identity and the entity is a broader description of the right subject. With the name uninformative, the nearest article being a district is evidence of the **wrong** subject, and its `P18` on a museum is precisely §Context 3's confidently-wrong failure. So it is dropped and the next candidate is tried.

**What it costs:** two requests, and only on places the name search already failed — one geosearch, then one `wbgetentities` for every candidate at once. `MATCH_METHOD_CONFIDENCE.geosearch` is 0.8 against the name route's 0.9, both above the 0.6 threshold.

**And the same run produced the mirror-image defect — a precision one.** _"Piccadilly Circus matched a song instead of the place."_ A song named after a place has an **exact** label and **no `P625`**, so it took §5.5's "no coordinates to corroborate" discount — 1.0 × 0.8 = 0.8, comfortably over the threshold — and won.

That discount is right, and it was being applied to the wrong side. **"Absence of evidence is not evidence" holds when OUR place has no coordinates** (a coordless Place-lite, §10) and is exactly backwards when the absence is the **candidate's**: on Wikidata a real place carries `P625` as a matter of course, so an item without one, while we hold a Google pin for ours, is evidence about its **kind** — a song, an album, a film, a novel named after somewhere. So that case is now refused outright. Structural on purpose: a curated "not a place" type list would need a QID for every song ever written about a street.

Two things make it safe to be this strict. The **pre-filter keeps its own veto-free question** (`nameOnlyConfidence`) — a search hit carries no coordinates either, and vetoing there would reject every candidate before the entity that carries the coordinate is read. And **the coordinate route is the safety net**: refusing the song is only affordable because the geosearch then finds the real Piccadilly Circus, which is the pair of fixes composing rather than two independent patches.

### 16. Amendment (2026-08-05, seventh) — the coordinate route's own precision, in three numbers

§15's route shipped and the owner reported the next failure the same evening: _"now it matches somewhere that's near geographically but not the place itself."_ **Piccadilly Circus matched the Underground station under it.** Three flaws, and the first is the one worth carrying.

**1. Proximity was carrying matches it cannot arbitrate.** The blend gives distance 35% of the score, and for a facility **at** the place that 35% is free: the station's own article coordinate _is_ the square's. So `Piccadilly Circus` against `Piccadilly Circus tube station` scored 0.707 on the name and **0.810 blended** — over the threshold on evidence that never distinguished the two. A station inside a square, a shop inside a mall, a statue in a plaza are all this shape.

So **the name must carry a fuzzy match; proximity may corroborate it and may veto it, but never carry it** — `MATCH_MIN_NAME_SIMILARITY = 0.8`. Calibrated against the measured cases rather than picked: `Meiji Jingū / Meiji Shrine` → `Meiji Shrine` is 0.816 and §11 wants it; the tube station is 0.707 and must go; `Tsukiji` → `Tsukiji Outer Market` is 0.577, which §11 already called weak. **The floor is not primarily a refusal** — with both at the pin, it is what lets the square _win_, because the station can no longer outscore it on free distance.

**2. `ggslimit=5` dropped the subject in a dense city.** GeoData returns the N _nearest_, and within 500m of that pin there are dozens of articles — theatres, statues, streets. The square was outside the five and the station won by default. Now 20, which is still one `wbgetentities` call (it takes 50 ids).

**3. Ambiguity refuses.** When the name cannot arbitrate — disjoint scripts, §15's Rule 1 — distance is the only evidence, and distance cannot separate two subjects that share a coordinate. So an uncorroborated winner with **another scoreable candidate inside the trust radius** is refused rather than picked: "the nearest" would be a coin toss dressed as a match. A single uncorroborated candidate is still accepted, which is the case the route exists for.

**What this says about the design as a whole:** every one of §15's and §16's defects is the same mistake in a different place — **treating an absence of discriminating evidence as evidence.** A missing coordinate, an unreadable script, a shared point, a truncated candidate list. The matcher is now explicit about which of its inputs is informative in each direction, and that is the property to preserve when the next source is added.

### 17. Amendment (2026-08-05, eighth) — the pipe reaches the place you have **not** saved (owner's ask)

The owner, with a screenshot of a Google search result on the Map: _"I want that places will be enriched even before getting saved, so that we'll be able to see images and read summary even before saving."_ Asked whether it needed a mockup, the answer was no — [ADR-0167](0167-the-badge-is-the-thumbnails-frame.md) §9.1 designed and measured this card already, and `mockups/place-enrichment-v2.html` draws it. What was missing was never the surface; it was the pipe's reach.

**§1's decision is what makes this a small change.** `PlaceEnrichment` is global, keyed by alias columns, with no `tripId` and no FK to `Place` — so a candidate nobody adds has a legitimate row, and the work is already done if anyone later adds it. This amendment is that decision paying off; a trip-scoped store would have needed a schema change to answer at all.

**1. A third trigger, and the first one with a person waiting.** §14's two both deliver by _push_: the snapshot join and the WS nudge, both keyed by `placeId`. A search result has no `placeId` and no row anywhere, so it can be neither joined nor nudged — its answer has to travel back down a request. So: `POST /trips/:tripId/enrichment/lookup`, membership-scoped, rate-limited, and the only door in this module that returns a value.

**2. On tap only** (owner's call, from three offered). A query returns several candidates and most of them nobody keeps, so enriching the list would spend Wikimedia's patience on places no one looked at — and a tap already means "this one". One fetch per place a person actually looked at, no cap to tune, and the trigger rides a gesture that was already happening. Answers are kept for the session so re-selecting asks nothing, **including when the answer was empty** — the majority case (§11.3) is the one that must not be re-asked.

**3. It waits, and that does not contradict §6.** §6's guarantee is that no request _ever waits on a third party_, and its subject is requests that exist for something else: a pick, a snapshot. This request exists **for** the enrichment, so waiting for it is its own job rather than a source slowing something unrelated down — and the wait is bounded (5s) and answers with whatever the store holds when it lapses. Nothing is lost when it does: the pass keeps running into the store, so the next tap is instant and so is the place once it is added. A pass a person is waiting for may also take a slot above §14's background cap (6 vs 3) — a tap is somebody looking at a blank card; a backfill is nobody.

**4. The identity travels with the question, and that is a trust boundary worth naming.** Matching needs a name and a point, and the server holds neither for a place nobody has added. The client supplies them — exactly as `resolvePlaceSchema.details` already does, and for the same reason (the Text Search call returned them; asking Google again would be spending twice). What is genuinely new is _where they land_: the store is **global**, so a member who lied about a name would mismatch a row other trips read, until the field's TTL lapses or a verified pass overwrites it. Accepted deliberately: the app is invite-only, the blast radius is one wrong picture on one place, the bytes are still re-sniffed and the license still rendered verbatim, and the repairs are cheap (the kill switch, a row delete). The alternative — a Place Details call per tap to verify the name — would spend money on every result anyone looks at, which is the cost model this whole surface exists to avoid.

**What it will look like is already measured**, and worth saying out loud before anyone calls it broken: landmarks were 14 of 14 for images and Tokyo restaurants 0 of 7 (§11.3). A landmark search will look magical; an ordinary business shows the card it always was, whose way to more is `עוד בגוגל` (§13). That is a complete state, not a loading one — so there is no skeleton where the hero would go, which would promise a picture that is usually not coming.

### 18. Amendment (2026-08-08) — the **airport pair**, and the label a person can overrule (field reports #6/#7/#23)

Three field reports from the 2026-08-07 triage close here, and they are one feature: an airport should read as **the city it serves** rather than its official name, its IATA code must be **real** rather than derived from a name, and a flight leg's place search should only offer airports. (The label started as `City · IATA` everywhere and was split the same day — see the surfaces note below.) Research in [session 225](../planning/2026-08-08-session-225-flight-place-data-research.md); build and the decisions taken during it in [session 226](../planning/2026-08-08-session-226-workstream-e-airport-labels.md).

**Two new fields in this pipe, not a new mechanism** (rule 8). `iata` (Wikidata `P238`) and `servedCity` (`P931`) join `ENRICHMENT_FIELD`, `FIELD_SOURCE_PRECEDENCE` and the stored payload, and they satisfy §1's test for what belongs in a global store: two trips cannot legitimately disagree that TLV serves Tel Aviv. Both come off the item the identity pass already matched, so an airport costs one extra read and its city's labels.

- **`servedCity` is a variants map, like `summary`** (§11.6) — a city is a name a person reads, and this app is Hebrew-first. That made `field === SUMMARY` a bug rather than a shortcut in four places, so the set is now named once (`TEXT_VARIANT_FIELDS`).
- **`iata` is shape-validated** (`^[A-Z]{3}$`) on the way into the store. It lands in a label someone reads at an airport; a malformed claim is refused rather than rendered.
- **The miss TTL is 180 days, against 30 for the prose fields.** The hopeful case behind the shorter number — an article gets written — has no counterpart here: a restaurant does not become an airport, and re-asking monthly for every café in a trip is exactly the waste §6.4 exists to prevent.

**The match is gated by `P31`, and that guard is the whole of #7's difficulty.** Coordinate-proximity matching from a terminal pin is unreliable — a terminal building sits 1.1–1.4km from the airport item's own `P625` and a 500m geosearch misses it entirely — so the identity comes from the name route this pipe already runs. What that admits, and the reason the guard is not a formality: **London's city entity `Q84` carries `P238 = LON`**, a real metropolitan IATA code, with no airport class anywhere on it. `AIRPORT_INSTANCE_OF_QIDS` (curated, like `BROADER_INSTANCE_OF_QIDS` beside it, and for the same reason — a `P279*` walk needs SPARQL to answer a four-entry question) refuses it, before spending a request.

**`P931` is multi-valued with no reliable winner, so the automatic answer is a default and a person can overrule it.** Ben Gurion lists Tel Aviv _and_ Jerusalem at equal rank; Keflavík carries a preferred rank that does separate its two. So: preferred rank when stated, first otherwise, deprecated skipped. This is the only place in this pipe where "first" is an answer rather than a refusal — affordable because a debatable city costs a label somebody can correct, not a wrong photograph on a place (§Context 3's failure has a floor here that it does not have for images).

**`Place.nickname` is the override, and it is `Place.icon`'s pattern exactly** (ADR-0147 §5): user-authored, trip-scoped, and it must survive deleting the idea or booking it was written through. Display-only — `name` still holds the official name, and the record surfaces still show it. The precedence chain, resolved in `frontend/src/lib/place-label.ts`:

> **nickname** (if set) → **the city the airport serves** → **the existing name-stripping fallback**.

The UI is one field on the rename form (ADR-0148's card), offered only where the place already exists, whose hint states what the row will say if it is left empty.

**The code is NOT in that chain, and the surfaces are the reason** (owner's call, 2026-08-08, revising this amendment's own first build). The label was `City · IATA` on every surface, so a flight read `תל אביב · TLV ← פרנקפורט · FRA`. Every reader of this chain is width-starved by construction — a day row, a board card, a route with **two** of these on one line — and the compound form spends the whole budget saying twice what `תל אביב ← פרנקפורט` says once. It also pushed most real pairs past `ROUTE_INLINE_MAX_CHARS`, which would have collapsed the inline route ADR-0059 §3 wants into its destination-primary fallback on the common case. So:

- **Route and row surfaces read as cities.** `תל אביב ← פרנקפורט`.
- **The code lives on the booking detail**, as its own fact beside the confirmation code — the record surface, which is not width-starved and is where you check a code against a ticket. Absent entirely when neither endpoint has one (a train's do not), and it states the half it knows when only one resolved.

The general rule worth carrying: **a derived label belongs where it is read, and a fact belongs where it is checked.** They are not the same surface, and putting both in one string is what made the label too long to be either.

**#6 — the flight-leg search restriction stays on Text Search, and that is a cost decision.** Autocomplete's `includedPrimaryTypes` takes five types and would cover `airport` _and_ `international_airport` in one request, which the research called the cleaner API. It is the wrong one **here**: flight-leg picking goes through `PlacePicker` → an errand to the Map (ADR-0134), and the Map draws every candidate as a ring on the canvas (ADR-0168), which needs coordinates for all of them up front. An Autocomplete prediction has none (ADR-0115 §2), so covering both types would cost a Place Details call per rendered result — the "a Details call per rendered row" shape ADR-0115 §2 and §13 above have each rejected once, and the session-224 comment in `google-places.client.ts` already spelled out. So: `includedType: 'airport'` + `strictTypeFiltering: true`, one call, unchanged field mask, unchanged SKU tier (ADR-0108 §3: the mask is the lever, and this is a request parameter).

The cost of that choice is the one-type cap, against an **unverified** overlap: Google lists `airport` and `international_airport` separately and does not promise the latter also carries the former, and no session has had an API key to measure it. Under strict filtering that failure would be silent and total — the departure airport simply absent from the list. So **an empty restricted answer is re-asked once, unrestricted**: one extra call, only when the first already returned nothing, never on the path that works. It is deletable the day the overlap is verified against a real key, and the session note records that as owed.

**Consequences of this amendment:** one new nullable column (`Place.nickname`, additive, nothing to backfill); two new `ENRICHMENT_FIELD` members and their TTLs; `EnrichmentProvider` gains a declared `settlesIdentity` — the registry used to infer it from an empty `provides`, which stopped being true the moment Wikidata supplied a field of its own, and would have taken it out of every summary pass silently; and one new frontend channel (`state/place-labels.tsx`) publishing the resolved labels to the leaf components that draw a route.

### 19. Amendment (2026-08-08, second) — three things the first real trip found

§18 shipped and the owner looked at their own bookings. Three findings, and the first is the one with a lesson in it. Session note: [session 227](../planning/2026-08-08-session-227-airport-label-followups.md).

**1. Frankfurt never matched, and the search was not the problem.** Google's stored name is `נמל התעופה של פרנקפורט (Frankfurter Flughafen – FRA)` — seven tokens against Wikidata's four. Measured against every label the item plausibly carries, the best score was **0.756**, just under `MATCH_MIN_NAME_SIMILARITY`. So the search returned the right item, the pre-filter passed it at 0.605 (against a 0.6 threshold), we **spent the entity read**, and then refused. The coordinate route could not save it either: its radius is 500m and §225's research measured a terminal pin sitting **1.1–1.4km** from an airport's own `P625`.

This is §15's bug again — _the search found it and the scoring threw it away_ — with a different cause. So it takes §15's fix again: **score every form the name offers and keep the best**, now including the de-parenthesised form on either side. An appended alias is a second name for the same place, and a name written twice must not score lower than a name written once.

It cannot manufacture a false match, which is why it lives in `nameSimilarity` rather than at one call site: dropping a parenthetical only makes a name **shorter and more specific**, and the distance veto still refuses a same-named place 9,000km away. The raw form stays in the comparison because the bracket is sometimes the discriminating part (`Terminal 1 (Departures)`). §16's calibrated numbers — 0.816 / 0.707 / 0.577 — are unmoved, and pinned by test.

**2. The city read as `תל אביב-יפו`, because that is Wikidata's LABEL.** The label is the official name (`Frankfurt am Main` is the same shape); what a traveller says is usually sitting beside it as an **alias**, and there is no "common name" property to ask for. So: **the longest alias that is a proper prefix of the label, ending at a word boundary.** Narrow by construction — it can only drop a trailing qualifier. _Prefix_ excludes an abbreviation, a former name or a translation, which are all legitimate aliases and none of them "the same name, shorter". _Longest_ is what stops `תל` winning if anyone ever adds it. Falls back to the label, so a city with no alias is unchanged.

**3. The booking detail reads as cities too** (owner's call), which narrowly revises [0059](0059-index-first-navigation.md) §3's _"the detail keeps the full names"_. That rule was written when the only alternative was the name-stripping heuristic, and keeping the record's own words was plainly better than a guess at them. A resolved city is not a guess. The full name is still one row down in the location fact, which is where a record belongs — and the fallback here is the **full** name, never the stripping, because shortening is a concession rows make for width and this surface has none to make.

**What was deliberately NOT fixed: Keflavík reads as Keflavík, not Reykjavík.** `P931` is _correct_ by its own definition — the airport serves the town it sits beside, and Wikidata's editors have marked that value preferred. The disagreement is with what a passenger means, which is not a data question and not one more heuristic's to answer. **This is the case `Place.nickname` exists for**, and it is worth being honest that it will not be rare: of the three airports in the owner's own trip, one needed the alias rule and one needs a nickname. The automation earns its place by making the common case right, not by being right everywhere.

### 20. Amendment (2026-08-08, third) — the airport neither the label nor the point could reach

Owner report, on their own trip: **Bangkok never matched.** The saved name is `נמל התעופה בנגקוק סוונאפום`; the item is labelled `Suvarnabhumi Airport`. Session note: [session 228](../planning/2026-08-08-session-228-the-fourth-match-route.md).

**Both name routes were structurally unable to find it, and §19's fix does not apply.** `סוונאפום` is a **transliteration**, not a translation — it shares no tokens and no script with `Suvarnabhumi`, so no scoring recovers it, and `wbsearchentities` matches Wikidata **labels**, so a Hebrew query cannot return a Latin-only item in the first place. This is the recall hole §15 named exactly (_"a name search only ever reaches an item labelled in a language we thought to ask for"_) and left open, with the Google-English-name option costed and rejected.

**And the coordinate route could not save it either, because of one number.** `GEOSEARCH_RADIUS_M` was 500m, matched to where the distance credit runs out. Session 225 measured an airport's own `P625` sitting **1.1–1.4km** from the terminal pin Google gives us, and Suvarnabhumi is larger than any of those. So the one language-independent route in the pipe was, for this entire category, looking in the wrong place.

Two changes, and they are deliberately separate:

**1. A fourth match method: `wiki_search`.** Wikipedia's own full-text search (`generator=search`), which matches article **text and redirects** rather than labels — where a transliteration and the city actually appear. It reuses the coordinate route's machinery exactly: same host (already allowlisted, §7), same response shape, same `pageprops.wikibase_item` extraction, one call. It runs **only** when the name and the coordinates have both found nothing, and it is capped at `MATCH_METHOD_CONFIDENCE.wiki_search = 0.7` — below `geosearch`'s 0.8 — because "this article mentions these words" is real evidence and less than a name that agreed or a point that matched. Every check the other routes apply still applies to its candidates: the name where the scripts allow it, the distance otherwise, the broader-subject skip, and the `P31` guard before any value is read.

**2. An airport gets its own distance ruler** (`AIRPORT_TRUST_METERS = 3000`, out to 8km). Every radius in this file was calibrated for a place you can stand in front of; an airport's coordinate is a centroid over square kilometres. **The allowance is earned by the candidate's own `P31`, not by our name** — so it can only ever widen the radius for something that IS an airport, and a hotel 2km away is still scored and refused at the ordinary distances. The geosearch request radius widened with it (500m → 3km), which costs nothing and loses nothing: GeoData returns the N _nearest_, so in a dense city the twenty nearest are all well inside 500m and the result is unchanged; what it adds is the case that was unreachable.

**Why this was worth building rather than defaulting to a nickname** (owner's call, and it is the right one): a nickname fixes the _label_ and leaves `iata` unmatched, so the booking detail's `קודי שדות תעופה` row stays empty. The nickname is a display override; it cannot supply a fact. An airport that does not match is not a cosmetic problem — it is the whole airport pair missing.

### 21. Amendment (2026-08-11) — a name that says MORE has not disagreed (owner report: Kerið matched nothing)

Owner report, twice: **`Kerið Crater` matched nothing**, and it still matched nothing after the transliteration fix that was first blamed for it. Session note: [session 248](../planning/2026-08-11-session-248-a-letter-that-is-not-an-accent.md).

**The letters were a red herring, and the numbers say so.** `ð` genuinely does not fold — it is a letter, not a letter with an accent, and `NFD` + `\p{M}` leaves it untouched — but Kerið never needed folding: Wikidata's label for `Q1435393` is `Kerið` **with** the eth, and so is Google's own name for it. Both sides already agreed. (The fold was still a real recall hole and shipped on its own evidence: Google says `Giessen`, Wikidata's German label says `Gießen`, and those scored **0**.)

**What actually refused it was `MATCH_MIN_NAME_SIMILARITY`, on the one route that had found it.** Measured against the live APIs on 2026-08-11:

- `wbsearchentities` for the saved name returns **zero hits** — `Q1435393` has no Hebrew label at all, so §15's recall hole is total here;
- `generator=geosearch` around Google's pin returns **exactly two** articles in 3km: Kerið at **27m**, and Grímsnes at 1.2km;
- the entity's own `P625` is **~102m** from the pin, inside `GEO_TRUST_METERS`, and its `P31`s (`Q109391` volcanic crater, `Q204324` volcanic crater lake) are correctly absent from the granularity deny-list.

So the coordinate route found the right entity, alone, essentially at the pin — and then the name check threw it away: `Kerið Crater` against `Kerið` is one shared token over `sqrt(2 × 1)` = **0.707**, under the 0.8 floor, so `confidence = 0`. **The identical entity would have matched at 0.8 had the saved name been Hebrew**, because then nothing would have been readable enough to refuse it. A name that half-agrees was worse evidence than no readable name at all, which cannot be right.

**This is §15/§16's own diagnosis one more time — treating an absence of discriminating evidence as evidence — so it takes §15's own remedy.** Rule 1 says a comparison across disjoint scripts is _uninformative, not negative_. There is a second way to be uninformative, and it is now stated alongside it:

> **Rule 1b — a name of OURS that says strictly more than the candidate's has not disagreed with it.**

`Kerið Crater` contains everything `Kerið` says and adds the feature's own type. That is a failure to discriminate, not a contradiction, so the name is set aside and the distance answers alone — under the `geosearch` ceiling, with Rule 2's broader-subject skip and §16's ambiguity refusal still standing behind it, exactly as for a name we cannot read. Expressed as `nameCanRefuse(ourName, candidateName)`, which both the scorer and the two coordinate-fed routes now ask instead of `namesComparable`.

**Two guards keep this from re-opening §16's own defect, and both are load-bearing:**

**Direction.** Only _our_ name may say more. A **candidate** whose name is ours plus a qualifying noun is precisely the Piccadilly Circus failure §16 built the floor to refuse — the station under the square, the shop inside the mall — and it scores the same 0.707. It still refuses, because `Piccadilly Circus` does not contain `Piccadilly Circus tube station`. The rule is asymmetric and the argument order is its whole meaning.

**Only where the name was going to refuse anyway.** At or above the floor the name is corroborating and keeps deciding, so `Meiji Jingū / Meiji Shrine` → `Meiji Shrine` (0.816, which §16 requires to survive) is untouched and still scores on the name route rather than being demoted to a distance-only match.

**The residual risk was measured, not assumed, and it is what the deny-list is for.** The dangerous shape is a _district_ whose name our own place name contains. Checked against live Wikidata: distance-only credit reaches the 0.6 threshold **only within 238m**, and a district's centroid is nowhere near that from a specific pin inside it — Tsukiji's is **366m** from the fish market (scoring 0.31), Ueno's **492m** from the park (0.02), Shibuya's **529m** from the crossing (0.00). All three refuse on distance alone.

**But the check also found a real gap in `BROADER_INSTANCE_OF_QIDS`, and it predates this change.** Tokyo's districts carry none of the classes the list names — `Tsukiji` is a `chōchō` (`Q5327369`), `Shibuya` a ward/special ward (`Q137773`/`Q5327704`), `Ueno` adds `city center` (`Q1468524`) — so "a district for a shop", §11.2's own motivating case, was landing **unrefused** for the very city the coverage spike was built on. Those four classes are added. They are subdivisions of a city, which is the same fact `neighborhood` and `suburb` already state for other countries.

**Verified end to end on live payloads**, not on hand-written fixtures: the real geosearch, `wbgetentities` and search responses captured on 2026-08-11 and replayed through `WikidataProvider`. Before: `null`. After: `Q1435393`, method `geosearch`, confidence **0.8**, image `Kerid-08-Krater-1980-gje.jpg`, no per-field refusals.

### 22. Amendment (2026-08-11, second) — recall, measured: what the matcher could not RETRIEVE, could not READ, and would not FORGIVE

Owner report `#41`, the same day as §21: enrichment still missed **`Brúarfoss`** and **`מפלי גולפוס`**. Session note: [session 254](../planning/2026-08-11-session-254-what-a-name-says-and-what-it-cannot-carry.md).

**The first thing this amendment changes is that recall is now a number.** §11's coverage spike measured what the sources _have_; nobody had ever measured what the matcher _reaches_. A live probe now runs the production pipeline against the real Wikimedia APIs over a **170-name corpus** — most of it Hebrew, because Google is asked with `languageCode=he` and a Hebrew saved name is the normal case, with the same place repeated under a Latin name so the alphabet is the only variable — plus refusal controls that must keep refusing. It is checked in, opt-in and skipped by CI (`ENRICHMENT_LIVE_PROBE=1`), and every claim below is a diff between two of its runs, not an argument.

**The three witnesses failed in three unrelated ways, and none of them was §21's.** That is the finding that reframed the report: `Kerið` was one defect, and "still missing" was three more.

**1. Retrieval — the route threw the right answer away.** `matchByName` scored the search hits on their names, picked the single best, read _that_ entity, and returned `null` if its coordinates then refuted it. Wikidata holds **two waterfalls named exactly `Brúarfoss`**, 130km apart, and the search returns the wrong one first — so the route picked the namesake, the distance veto correctly killed it, and the right entity sat unread at rank 2. `wbgetentities` takes 50 ids, so **reading all five hits is the same one call** the single winner already cost. The pre-filter that did the discarding was §15's own `nameOnlyConfidence`, and §15's lesson applies to it too: **a candidate discarded before its coordinate has been read was refused on evidence we did not have yet.**

**2. Retrieval — the coordinate route is Wikipedia-shaped, and some places have no article.** `Q2557346` has an Icelandic article and none in `en` or `he`, so a geosearch at its pin returns **literally nothing** in both wikis we ask. A Wikidata item reachable only through a wiki outside that pair — or through none at all — was structurally invisible to the route built to be language-independent. **Commons closes it**: its category tree is language-neutral by construction, far more of the world is geotagged there than in any single Wikipedia, its categories carry the same `wikibase_item` join, and it is already on §7's allowlist because the image pipeline reads licenses there. Asked last, only when both wikis were silent, so the common case costs nothing.

**3. Reading — a same-script label in a different transliteration was worse than no label at all.** This is §15 and §21's mistake one level further down, and `מפלי גולפוס` is the measured case. Wikidata's Hebrew label for Gullfoss is **`גאלפוס`**; the Hebrew Wikipedia's article is **`גוטלפוס`**; Google's is **`גולפוס`**. Three transliterations of one Icelandic word, and token-set overlap scores every pair of them **0** — so the label was Hebrew enough to be _comparable_, disagreed completely, and vetoed the one candidate the coordinates had found. Had the entity carried no Hebrew label at all, the scripts would have been disjoint and Kerið's own rule would have matched it at 0.8. **A word we can read but cannot spell the same way is not a disagreement**, so tokens now match within a bounded edit distance.

**4. Forgiving — the descriptor-suffix gap, which §2 of session 248 deferred and this amendment closes.** `Brúarfoss Waterfall` against `Brúarfoss`, `Kerið Crater` against `Kerið`, `מפלי גולפוס` against `מפל מים` — Google habitually appends the feature's own type to a label that omits it, and one shared token over `sqrt(2 × 1)` is **0.707**. §21 let that case survive on the _coordinate_ routes by setting the name aside; on the **name** route it still refused, and below the 0.6 threshold outright once `NO_PROXIMITY_FACTOR` was applied.

> **Rule 1c — a word of OURS that names what the candidate IS has not disagreed with it.**

Session 248 §2 said the only honest version of this rule "would have to read the candidate's `P31` and ask whether the dropped word _names that class_", called it a matching-policy change with a false-positive budget, and left it. **That is exactly what is now built, because it is the version that keeps §11.2 intact.** The class labels are read from Wikidata (one extra call, gated to candidates a type noun could actually rescue, memoized process-wide because a waterfall is a waterfall for every waterfall a trip saves), and our name is scored again with those words removed. `Brúarfoss Waterfall` becomes `Brúarfoss` and matches at 1.0. **`Tsukiji Outer Market` still scores 0.577 against `Tsukiji`**, because a `chōchō` is not an outer market — which is the whole difference between this rule and the "strip a trailing word" rule §2 rejected, and the reason the deny-list is not quietly undermined. And it is **asymmetric for §21's reason**: strip a candidate's type word too and `Piccadilly Circus tube station` becomes `Piccadilly Circus tube`, 0.816 against the square, and §16's defect is back.

**5. Reading — the scorer was never shown most of the names the candidate offers.** It compared against the `he` and `en` _labels_ only, while the same response carried **aliases** (`Fontana di Trevi`, sitting under a label of `Trevi Fountain`) and **article titles** (`גוטלפוס`), both free. Additive like every other variant here: an extra name can only raise a score, and whatever it raises still faces the distance veto and the granularity skip.

**The false-positive cost, measured against live data rather than reasoned about — and one of the four fixes had to be weakened because of it.** The near-token rule was drafted counting a spelling variant as a whole shared word. **`Kensington` and `Kennington` are two real London places one edit apart and 4.9km apart** — _inside_ `MATCH_FAR_METERS`, so the distance veto does not fire — and at full credit they matched each other at 0.652. So a near-spelled word is now worth **0.75 of an exact one**, deliberately below `MATCH_MIN_NAME_SIMILARITY`: **a spelling variant corroborates and can never carry.** It lifts a multi-word name that agrees about its other words, and it lets `nameCanRefuse` see that `מפלי גולפוס` does not contradict `גאלפוס` — after which the distance answers alone under the `geosearch` ceiling, which is precisely where §21 put Kerið. Tokens shorter than five letters are never near at all, which is what keeps `Bali`/`Bari`, `Ueno`/`Ueda` and `park`/`part` apart.

**What the corpus says — both runs on the live APIs the same day, same 170 names, same pins:**

| saved name                           | before  | after   |
| ------------------------------------ | ------- | ------- |
| **all 170**                          | **114** | **142** |
| Hebrew (93 of them, the normal case) | 54      | 67      |
| Latin (77)                           | 60      | 75      |
| refusal controls                     | 2 of 3  | 2 of 3  |

**Twenty-eight names newly matched and not one newly wrong.** The refusal controls are part of that number rather than a separate reassurance — the ambiguous same-name cases, the multi-country ones (`Cambridge` twice, `Santiago`, `San José`), the district-for-a-shop cases and §16's Piccadilly pair all answer as they did. The one control that does not pass fails **identically before and after**: a shop inside Shibuya still matches a school 200m away, which is a pre-existing hole in the country-shaped `BROADER_INSTANCE_OF_QIDS` (§5.3's finding, still open) and not something this branch touched. One control **did** move mid-branch, and moving it back is what produced the rule above.

**What is still missed, and why — because a recall number with an unexplained tail is not a measurement.** Three residual classes, each now classified rather than guessed at:

- **Distance, not naming.** `מפלי סקוגאפוס`: the entity offers no Hebrew name, so distance decides alone — and its `P625` is **294m** from the visitor pin, past the ~238m where distance-only credit reaches 0.6. Widening that is precisely what §21 measured as unsafe (Tsukiji's district centroid is 366m), so this stays refused **on purpose**.
- **A colloquial descriptor is not a class label.** `Jökulsárlón Glacier Lagoon`: Wikidata's classes for it are not called "glacier lagoon", so Rule 1c has nothing to strip. Rule 1c is deliberately not a synonym table.
- **`wbsearchentities` is a label search.** `Sun Voyager` does not prefix-match the label `The Sun Voyager`, and that article carries no GeoData coordinate, so neither name nor point reaches it. Recorded, not fixed.

**And the miss now leaves evidence.** Every route records the candidates it saw, each one's similarity, distance and confidence, and the guard that refused it; on a total miss the provider logs the lot at `debug`. Two sessions have been spent reconstructing that by hand from the live APIs. The next one reads a log line.

### 23. Amendment (2026-08-30) — two fields the matcher was already resolving and throwing away

A sharing session (ADR-0213's fourth pass) needed two things this pipe could answer and did not store: **what a place IS** and **where it is**. Both are claims on the item the identity pass has already matched, and one of them the matcher was literally computing and discarding.

**`kind` (`P31`, "instance of") and `region` (`P131`, "located in the administrative territorial entity")** join `ENRICHMENT_FIELD`, `TEXT_VARIANT_FIELDS`, `FIELD_SOURCE_PRECEDENCE` (Wikidata alone — Google has a types array, but §2's cache rule means we may not keep it), and the stored payload. They pass §1's test as cleanly as the airport pair did: two trips cannot legitimately disagree that Skógafoss is a waterfall in Suðurland.

- **`kind` is not new work, it is a value being thrown away.** `classNouns` resolves `P31` labels on every candidate so `descriptorCouldRescue`/`nameCanRefuse` can ask whether it is the right kind of thing, memoizes 256 of them, and keeps none. Storing it costs a key in a `Json` column that already exists.
- **`region` is the answer to a backlog line that had been written off.** "The day's `לינה ב…` could name the town, and there is no town to name" assumed a locality column or an address parse. `P131` answers structurally, on an entity read already being made, and does not break in the next country the way an address-format guess does.
- **Both are variants maps** (`TEXT_VARIANT_FIELDS`), for §18's reason: they are nouns a person reads, and this app is Hebrew-first.
- **TTL 365 days, miss TTL 180.** §18's argument, unchanged: a waterfall does not become a museum, and a place with no `P31` label in either language will not grow one next month.

**The class guard moved, and the ordering is the whole change.** `iata`/`servedCity` are refused for a non-airport **before spending a request**, on evidence the match already carried — `wikidata.provider.spec.ts` asserts `wbgetentities` is called **zero** times for London, and the first draft of this change read the entity before the guard and turned that spec red. `kind` and `region` are questions every place can answer, so they are gated on nothing; what the two families share is the entity read, which is why `airportEntity` is now `memoizedEntity` and one place costs one read of its item plus one of each claim target.

**`claimLabel` is deliberately not `servedCity`.** They are the same three lines plus one: a city's label wants its shortest common alias (`תל אביב`, not `תל אביב-יפו`), and a class noun or a region does not — `Suðurland` is not improved by aliasing, and a waterfall's noun has no alias worth preferring. Collapsing them would have made `commonName` a flag, which is how a shared helper starts meaning two things.

**What the images slice needed from §7, and what it cost.** ADR-0213 prints one photo a day, gated at `MATCH_METHOD_CONFIDENCE ≥ 0.9` with a non-empty credit — a stricter bar than any read surface, because a wrong photograph on a page you hand to somebody else is not recoverable the way a wrong thumbnail in your own app is. §7's decision to hold **our own bytes at our own URL** is what makes that possible offline and in print; the A4 renderer aborts every request the page makes, so `PdfBrowserService.dayPhotoDataUrls` reads each blob through `getObject` behind the **same `isEnrichmentBlobKey` prefix check the public route makes** (§7's key-prefix guard is the access control, and a second reader of that keyspace must not weaken it), types it from the bytes with `sniffImageMimeType`, and hands the template a data URL. Bytes that are gone, or that sniff to nothing, yield no entry and the day header falls back to its no-photo columns.

**Consequences of this amendment:** two new `ENRICHMENT_FIELD` members with their TTLs and precedence rows; no migration (the payload is a `Json` column and the fields are additive); one renamed private method; and one new reader of the enrichment blob keyspace, holding to the same prefix check as the first.

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
