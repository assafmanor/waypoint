# Session 224 — Workstream E: flight place data (#6 airport-only search, #7 real IATA codes)

**Date:** 2026-08-08
**Branch:** `claude/workstream-e-field-report-2h2g6y`
**Research only** — no feature code, no schema change, no ADR, no migration. Output is this note plus the reworded Workstream E line in `backlog.md`.

Workstream E of the [session-216 triage](2026-08-07-session-216-field-reports-triage.md) is the one classed **E — external API/data-source uncertainty**, whose whole point is that _"a UI promise without the data is fiction"_ (§5). Both questions are now answered on the capability axis. **#7 is settled outright** (Google cannot supply it, at any price, and the answer is not a matter of tier). **#6 is capability-confirmed but not yet a safe one-liner**, for a reason found during the research and recorded in §1.3.

Both remaining decisions are the owner's, per the triage note's own routing. Nothing below is built.

## 0. Method, and the two limits on it

Per ADR-0108 §3's standing rule — the field→tier mapping is _"confirmed against Google's current field list at implementation, not hardcoded from a recalled mapping"_ — capability claims here were checked against a live source rather than recalled, and where that was impossible it is said so plainly instead of being smoothed over.

**The primary source used is stronger than the docs page.** `developers.google.com` is blocked by this session's egress policy, so the human-readable Places docs were unreachable. Instead the **live API's own machine-readable discovery document** was fetched directly from the service:

```
GET https://places.googleapis.com/$discovery/rest?version=v1     → 200, 148,503 bytes
    "version": "v1", "revision": "20260805"
```

That is the current published contract of the running API, dated three days before this session, and for the two questions asked it is a **better** source than the prose docs: it enumerates every request field and every response field exhaustively, so an absence in it is evidence rather than a failure to find the right page.

**Two things could not be checked, and neither is glossed:**

1. **No live API call was made.** There is no `GOOGLE_MAPS_SERVER_KEY` in this sandbox (no `.env`; the name exists only in `.env.example`). So every claim below is about the **published contract**, not about observed responses from our own account. This is exactly the gap the task flagged: a capability claim must be double-checked against the actual account before it is promised as done.
2. **Wikimedia is unreachable from this session.** `www.wikidata.org`, `query.wikidata.org`, `en.wikipedia.org` and `overpass-api.de` all return `403` to `CONNECT` — an organization egress-policy denial, not a fault (it is not routed around). So **no coverage measurement was run for #7**, and this note deliberately does not report a fill rate. Note this is a property of _this sandbox only_: those exact hosts are the ones ADR-0166 §7 allowlists, and the pipe reaches them normally in production.

## 1. #6 — restricting flight-leg search to airports

### 1.1 Confirmed: `searchText` does support type restriction, by a different mechanism than `autocomplete`

The triage note asked this precisely — confirm it for `searchText` specifically, since the ADR-0113 precedent is on a different endpoint. It is confirmed, and the two endpoints are **not** the same shape:

|                    | `places:autocomplete`        | `places:searchText`             |
| ------------------ | ---------------------------- | ------------------------------- |
| Parameter          | `includedPrimaryTypes`       | `includedType`                  |
| Cardinality        | **array, up to 5**           | **string, exactly one**         |
| Matches against    | the place's **primary** type | the place's types               |
| Strictness control | —                            | `strictTypeFiltering` (boolean) |

Verbatim from the live discovery document (`GoogleMapsPlacesV1SearchTextRequest`):

> **`includedType`** (string) — _"The requested place type. Full list of types supported: …/place-types. **Only support one included type.**"_
>
> **`strictTypeFiltering`** (boolean) — _"Used to set strict type filtering for included_type. If set to true, only results of the same type will be returned. Default to false."_

And for contrast, `GoogleMapsPlacesV1AutocompletePlacesRequest`:

> **`includedPrimaryTypes`** — _"A Place is only returned if its **primary type** is included in this list. **Up to 5 values** can be specified."_

So the existing `DESTINATION_PRIMARY_TYPES` precedent (ADR-0113 §1, `google-places.client.ts:76`) does **not** transfer as a parameter — a build session that copies its shape onto `searchText` will send a field the endpoint does not have. The capability exists; the parameter name, type and cardinality are all different.

### 1.2 Confirmed: cost — a request parameter is not a field, so the tier does not move

ADR-0108 §3 and ADR-0111 both locate the cost lever in exactly one place: **the `X-Goog-FieldMask` header sets the SKU tier.** ADR-0108 §3: _"Field mask decides the SKU tier — request only what we cache."_ ADR-0111 defers `rating`/`userRatingCount` on the same grounds — they are Enterprise-tier **fields**, and including them would bump the whole call.

`includedType` and `strictTypeFiltering` are **request-body parameters, not response fields**. They do not appear in the field mask and they add nothing to the response, so on the documented model they cannot move the tier: the Text Search call keeps the mask it has today (`places.id`, `places.displayName`, `places.formattedAddress`, `places.location` — `google-places.client.ts:54`) and therefore keeps its current tier. Secondary sources consulted agree the tier is field-mask-determined and say nothing about type parameters affecting it.

**Stated as the confidence it actually has:** Google's own billing page is on the blocked host, so this is reasoning from the repo's two cost ADRs plus the live request schema plus secondary sources — **not** a reading of the current pricing table. Per ADR-0108 §3's own rule, the implementing session re-reads that page before the change lands. Two request parameters on this endpoint (`evOptions`, `searchAlongRouteParameters`) are worth checking at the same time, since if any request parameter anywhere carries a billing consequence it would be one of those — neither is used here, and neither is proposed.

**Result restriction is free in a second sense worth naming:** `maxResultCount` is capped at 8 today (`TEXT_SEARCH_MAX_RESULTS`) and N results cost one call, so filtering to airports does not reduce spend and is not a cost optimization. It is purely a legibility change, which is the same argument that comment already makes.

### 1.3 The reason this is **not** yet a safe one-line change

The task allowed proposing a diff if research showed a clean, cheap, well-supported parameter. It is cheap and well-supported, and I am still **not** proposing the diff, for three findings that only appeared during the research:

1. **`includedType` takes one type, and "airport" is plausibly more than one type.** Google's Table A transportation types are widely reported to include both `airport` and `international_airport` (the latter added in the Places API (New) type expansion), and possibly `airstrip`/`heliport`. **TLV, VIE and KEF are all international airports.** If their `primaryType` is `international_airport` and we send `includedType: 'airport'` with `strictTypeFiltering: true`, the exact three airports in the owner's report are the ones most likely to be filtered **out**. The type-list page is on the blocked host and I could not confirm which value each carries — and with no key, I could not test it. A one-line change that silently returns zero results for the motivating case is the worst possible version of this fix.
2. **The `strictTypeFiltering` semantics need one empirical check.** The live doc says only _"only results of the same type will be returned"_. Whether that means "primary type equals `includedType`" or "`includedType` appears anywhere in the place's `types`" decides whether Ben Gurion survives the filter, and the one-sentence description does not settle it. This is a ten-minute test with a real key and unanswerable without one.
3. **There is no flight-aware path to put it on.** The triage note said this and it is confirmed: `searchPlacesText` (`places.service.ts:287`) passes `input` and `bias` straight through, and every place pick in the app — flight leg or restaurant — goes down the same generic route. So the change is not one line in the client; it is a `type` threaded through the shared search schema → controller → service → client, plus a frontend decision about **which** picker asks for it. That is a small, coherent piece of work, and it is a build-scoping decision rather than a parameter tweak.

**Recommendation for #6:** approve it in principle, and let the implementing session spend its first ten minutes on a keyed probe of the three airports against `includedType` × `strictTypeFiltering` before writing the plumbing. If `international_airport` turns out to be the primary type for all three, the honest options are (a) restrict with `strictTypeFiltering: false` so the broader `airport` type still matches on the type list, or (b) move the flight-leg picker to `autocomplete`, whose `includedPrimaryTypes` takes **up to 5 values** and can name every airport type at once.

**On option (b), since the triage note asked it directly:** `autocomplete` is the better _filter_ and the worse _fit_. ADR-0132 §7 chose Text Search for this surface for a reason the client comment still states — _"one call returns N results **with** coordinates, where Autocomplete + Details-per-result is one call plus N"_ — and ADR-0168's settled-results camera move (the thing Workstream A just fixed) needs those coordinates to pan to a result. Switching the flight picker to Autocomplete would buy a cleaner type filter and pay for it in both money and a regression against the camera behaviour that shipped this week. **Recommendation: stay on `searchText`**, and use the multi-type fallback only if the probe shows one type genuinely cannot cover airports.

### 1.4 Incidental, found in the same document, not acted on

`maxResultCount` — which `textSearch` sends today — is marked **deprecated** in the live schema: _"Deprecated: Use `page_size` instead."_ It is still honoured (both are documented, and `max_result_count` is ignored only when `page_size` is also present), so nothing is broken and there is no urgency. Recorded here rather than fixed, because a deprecation on the app's only paid search path is worth someone knowing about before it becomes a surprise. One backlog line, no ADR.

## 2. #7 — real IATA codes

### 2.1 Settled: Google does not have it. Not at any tier, not behind any field mask

This is the strongest result in the session, and it converts #7 from "probably not, confirm rather than assume" into a closed question.

Searched the entire live v1 discovery document — every schema, not just `Place` — for `iata` and `icao`, case-insensitively: **zero occurrences.** The `Place` resource carries 60 fields, enumerated in full; the complete list contains no airport-code field of any kind. The only appearance of the word "airport" anywhere in the document is illustrative prose inside the `subDestinations` description (_"…a large or complex place, like an airport…"_).

Two consequences worth stating precisely, because they close off the two natural follow-up questions:

- **This is not a field-mask/tier question.** ADR-0111's shape — "the field exists but costs a higher tier, so we defer it" — does not apply. There is no field to buy. Widening the Details mask to Enterprise would return ratings and hours and still no IATA code.
- **It confirms `place-label.ts:6` is right, and permanently so.** That comment (_"there's no IATA code"_) is not a temporary state of our integration; it is a property of the Places API. Nothing in the picker will ever produce it, which is what makes an external source mandatory rather than optional.

**So the owner's requirement — a real IATA code, never derived from a display name — cannot be met from any source the app pays for today.** A new data source is genuinely needed. That is the decision this note hands over.

### 2.2 IATA passes ADR-0166's own test for what belongs in the enrichment pipe

Before proposing a home, the ADR's own rule (§1) decides whether the pipe is even the right place:

> **"If two different trips could legitimately disagree about it, it is not enrichment."**

Two trips cannot disagree that Ben Gurion is `TLV`. It is a fact about the real-world entity, not this trip's opinion of it — the same category as a summary or a photo, and the opposite of `icon`/`category`. It is also effectively **permanent**, which makes it the longest-lived field the store would hold. So `PlaceEnrichment` — global, no `tripId`, no FK to `Place` — is the correct shape by the ADR's stated criterion rather than by convenience. **No `Place` migration, no change to the picker, no trip-scoped column.**

### 2.3 The leading candidate: Wikidata `P238`, and its marginal network cost is **zero**

`P238` is Wikidata's `IATA airport code` property. Confirmed to exist and to be that property; its own description notes it identifies _"airports, railway stations or cities"_ — which matters in §2.4.

What makes this markedly better than any alternative is a fact read out of our own code rather than assumed. `WikidataProvider` already fetches, today, for every place it matches:

```
backend/src/enrichment/providers/wikidata.provider.ts:315
  url.searchParams.set('props', 'labels|claims|sitelinks');
```

`props=claims` returns **all** of the entity's statements. So `P238` is **already in the response body the pipe parses on every match, and is currently discarded** — the provider reads `P18` (image), `P625` (coordinate), `P31` (instance-of) and drops the rest. Adding IATA is reading one more claim from bytes we already fetch: **no new request, no new host, no new allowlist entry, no new provider, no new spend.**

It is also the first field the Wikidata provider would ever _supply_. Today `WikidataProvider.provides` is `[]` — it is a pure matcher (it settles the QID, coordinates and type, and Wikipedia/Commons supply the fields). Adding IATA turns it into a field provider, which is a shape the registry already supports and which ADR-0166 §5.2 nominates as its own acceptance test: _"adding a source is one file plus one line per field it wins."_ Sketched (**not written**), the change is:

- `ENRICHMENT_FIELD.IATA` in `packages/shared/src/enrichment.ts`, plus its zod schema member;
- one `FIELD_SOURCE_PRECEDENCE.iata` line → `[ENRICHMENT_SOURCE.WIKIDATA]`;
- one `ENRICHMENT_FIELD_TTL_MS.iata` (effectively permanent — longer than `summary`'s 365 days) and one `ENRICHMENT_MISS_TTL_MS.iata`;
- `CLAIM_IATA = 'P238'` read through the **existing** `stringClaim()` helper, and `provides = [ENRICHMENT_FIELD.IATA]`.

Not prose, so §11.6's required-`lang` rule does not apply — an IATA code is a plain `EnrichedValue`, not an `EnrichedTextValue`. **No migration:** `fields` is already a zod-validated JSON payload, which is precisely the property §4 chose it for.

### 2.4 The risk that must be designed for, and it is bigger here than for a photo

ADR-0166 was built around one failure — _"a wrong match silently attaches the wrong photo and the wrong opening hours to a place"_ — and §11.2 added its subtler twin, the right match at the wrong granularity. **An IATA code is a worse thing to get wrong than either**, and this is the single most important point in this note for the decision session:

A wrong photo is visibly odd and costs nothing. A **wrong three-letter code on a flight leg is confidently wrong in a form a traveller acts on**, is indistinguishable from correct at a glance, and is exactly the class of error the owner's "never derived from a display name" requirement exists to prevent. Sourcing it from a fuzzy match instead of a display name is only an improvement if the match is held to a higher bar.

Three specific hazards, all of them shapes this pipe has already met:

1. **The metropolitan-area code.** `P238` covers cities, not only airports. A match that lands on the **city** rather than the airport can yield a city code (`NYC`, `LON`) that is not an airport at all — rendered on a flight leg, that is a plausible-looking lie. This is §11.2's granularity failure with a sharper edge.
2. **The wrong facility at the right coordinate.** §16's exact defect — Piccadilly Circus matching the tube station beneath it. An airport pin sits within metres of terminals, rail stations and hotels; `MATCH_MIN_NAME_SIMILARITY = 0.8` and §16.3's ambiguity refusal exist for this and should be assumed load-bearing here, not relaxed.
3. **Secondary airports near a city pin.** Nothing in the current matcher knows that `SDV` is not `TLV`.

**The mitigation is unusually clean, and it is why Wikidata is a better fit than it first appears:** unlike `P18`, the presence of `P238` is **itself corroborating evidence about what the entity is**. Combined with the `P31` instance-of check the provider already performs, the guard writes itself — accept an IATA code only from an entity that both carries `P238` **and** is an instance of an airport. That refuses the city, refuses the tube station, and refuses the hotel, using a check the provider already runs. Recommended as a **hard requirement** on this field, stricter than the pipe's general confidence threshold.

### 2.5 The alternative the owner should see before choosing, stated fairly

The triage note said to check ADR-0166's pipe **before** proposing a standalone airport dataset, and rule 8 says extend existing infrastructure. Wikidata-in-the-pipe wins on both. But there is one honest argument the other way, and the owner should hear it rather than have it filtered out:

**OurAirports** (and the OSM `aerodrome` + `iata=` tag route) offer a **closed, small, well-separated** set — roughly 9,000 IATA-coded airports worldwide, public-domain, matchable by nearest-coordinate with high confidence because airports are kilometres apart. Matching "any place on Earth" is genuinely hard (that is §Context 3, the acknowledged central risk of the whole pipe); matching "which of 9,000 airports is this pin" is genuinely easy. A standalone dataset would sidestep every hazard in §2.4 and would work offline with no third-party call at all.

**It is still not the recommendation**, for three reasons: it is a second parallel mechanism for a job the existing pipe does (the thing rule 8 and ADRs 0078/0079/0094/0095 exist to prevent); it costs a dataset to vendor, refresh and own, against zero marginal cost for the Wikidata route; and the guard in §2.4 addresses the accuracy gap that is its main advantage. Recorded so the choice is made with both options visible — this is a data-source decision, which the triage note reserves for the owner.

## 3. What is confirmed, what is open, what happens next

**Confirmed (checked against a live source, not recalled):**

- `places:searchText` supports `includedType` (**one** type) + `strictTypeFiltering`; `includedPrimaryTypes` (up to 5) is **autocomplete-only**. The ADR-0113 precedent does not port as-is.
- Adding those parameters does not change the field mask, so on the documented cost model it does not change the SKU tier.
- Google Places (New) returns **no IATA/ICAO code in any field, at any tier** — 60 `Place` fields, zero matches across the whole live v1 contract. `place-label.ts:6` is permanently correct.
- IATA satisfies ADR-0166 §1's test for enrichment, so `PlaceEnrichment` is the right home by the rule rather than by convenience. No `Place` migration.
- `WikidataProvider` already fetches `P238` in its existing `props=claims` call and discards it — zero marginal network cost.
- `maxResultCount` is deprecated in favour of `pageSize` (still honoured).

**Open — owner's call, not settled here:**

- **#7's data source.** Wikidata `P238` inside the existing pipe (recommended) vs. a standalone airport dataset (§2.5). Requires ADR-0166 amendment + a new `ENRICHMENT_FIELD` member once chosen.
- **The strictness of the IATA guard** (§2.4) — recommended as a hard `P238` + instance-of-airport requirement, stricter than the general confidence threshold. This is a product-risk judgement, not a coding one.
- **#6's build shape** — whether the flight-leg picker gets a `type` threaded through the existing `searchText` path (recommended) or moves to `autocomplete` (§1.3, not recommended).
- **Where an IATA code renders**, and what it does when absent. Not a schema question and not touched here; it belongs with the surfaces `place-label.ts` feeds.

**Unmeasured, and deliberately not estimated:**

- **IATA coverage on Wikidata for real airports** — Wikimedia is egress-blocked from this session (§0). Expected to be high (airports are exactly the well-covered stratum, against the restaurants that scored 0 of 7 in §11.3), but **expected is not measured** and this note does not report a number. If the owner wants one before deciding, it is a short spike from an unblocked environment: resolve the seed trip's airports and check `P238`.
- **Whether `includedType: 'airport'` actually returns TLV/VIE/KEF** — needs a keyed probe (§1.3), which this sandbox cannot run.

**Recommended next step:** one decision session that answers the two owner-reserved questions above. If #7 goes to Wikidata, it is an ADR-0166 amendment (§4's field set + §5's precedence + the §2.4 guard) plus a small build, with no migration. #6 can then be built alongside it, starting with the keyed probe.

## 4. Not done here, deliberately

No feature code, no schema change, no migration, no ADR, no ADR amendment, no new provider, no mockup. The `#6` parameter change was **not** written despite being cheap, because §1.3 found it is not yet safe as a one-liner and because a live capability claim was not verifiable from this session. No coverage number was invented for Wikidata. No pricing figure was written down, in keeping with ADR-0108 §3 and the `google-places.client.ts` comment that deliberately keeps per-1000 prices out of the code.
