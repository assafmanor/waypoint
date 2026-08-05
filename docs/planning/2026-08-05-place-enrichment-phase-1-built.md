# Place enrichment — Phase 1 built: the store, the registry, two providers

**Date:** 2026-08-05
**Scope:** Phase 1 of the [build plan](2026-08-05-place-enrichment-build-plan.md) — [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) (§11–§13). `packages/shared`, one migration, a new `backend/src/enrichment/` module. **Invisible: no UI, no route, and nothing calls it yet.**
**Not this phase:** the image pipeline (2), delivery (3), the badge (4), the cards (5–6).

## What shipped

| Piece                                                                                    | Where                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Vocabulary, source policies, per-field precedence, TTLs, match methods/refusals, payload | `packages/shared/src/enrichment.ts`                           |
| The global store                                                                         | `PlaceEnrichment` + `20260805120000_place_enrichment_adr0166` |
| Host-allowlisted, timeboxed, size-capped fetcher                                         | `enrichment/outbound-fetch.ts`                                |
| Refusable match: confidence per route, granularity check                                 | `enrichment/match.ts`                                         |
| Storability guard + freshness/negative-cache rules                                       | `enrichment/enrichment.policy.ts`                             |
| Registry, per-field precedence resolution                                                | `enrichment/enrichment.registry.ts`                           |
| Orchestrator                                                                             | `enrichment/enrichment.service.ts`                            |
| Wikidata (identity spine) + Wikipedia (`he` → `en` summary)                              | `enrichment/providers/`                                       |

107 tests across the module, plus 23 in shared. `resolvePlace` is untouched; `Place` has no
migration and no new column. The module is registered in `app.module.ts` so it is proven to
construct, and **called by nothing** — the trigger arrives with Phase 3's delivery.

## The four things the plan flagged as most easily got wrong, and where each landed

- **`lang` required, text as localized variants.** `enrichedTextValueSchema` requires `lang`;
  `summary`'s slot holds a `Record<lang, EnrichedTextValue>`. `resolveTextVariant` is the
  resolution function §11.6 asked for, and `governingAttribution` walks `derivedFrom` so a
  future translation cannot silently drop the credit its source demanded.
- **Two refusal reasons, two scopes.** Below the threshold, `match()` returns `null` — the
  whole candidate. `broader_type` lands in `refusedFields`, per field, so `summary` is refused
  while `image` is not. Both signals behind it are **name-independent**, which matters more
  than it sounds: see below.
- **Negative caching.** A per-field `absent` state with its own miss TTL, plus the row's
  `attemptedAt` column as the queryable clock. A warm row calls no provider at all — asserted,
  not assumed.
- **Allowlisted fetcher.** The host is checked before the socket opens **and on every redirect
  hop**, which is where the interesting attack is: a 302 to `169.254.169.254`. `redirect:
'manual'` plus re-validation, because `follow` would take it.

## Three places the ADR's rule needed a decision the build could not avoid, all small

Recorded because a future reader would otherwise think these were arbitrary.

**1. The granularity check cannot key on the name.** The obvious implementation of "the
candidate's type is broader than the saved place" is to compare the label with the saved name
— and the measured case defeats it: **Meguro River's saved name is identical to the river's
label.** So the check reads only the candidate's own claims: `P31` against a small curated
deny-list of categorical types, or any "this has ended" claim (`P576`/`P3999`), which is what
catches Tsukiji. The list fails safe both ways — a missing type accepts a summary we might
have refused, a wrong QID refuses one we could have kept, and neither can attach a wrong
photo. It must stay small or it will start refusing the summaries the feature is for.

**2. Distance vetoes, absence of distance does not.** A perfect name match alone clears the
confidence threshold, which is right for a coordless Place-lite and wrong for the same-named
temple in Paris. So coordinates that _contradict_ (past the 5 km radius) drop the match to
zero, while coordinates we simply do not have only cost the name a discount. Absence of
evidence is not evidence.

**3. `hours` inverts §6.4's "shorter" miss TTL, deliberately.** §6.4 calls the negative-cache
TTL shorter, written against a summary that is effectively permanent. An hours _value_ is
trusted for a day (§3), so a miss shorter than that would re-query Overpass about every café
with no `opening_hours` on essentially every pass — the exact waste §6.4 exists to prevent.
The two clocks answer different questions: how long a known fact stays true, versus how long
"nobody knows" stays worth believing. Commented at the constant, and asserted.

## What building found that reading would not

**Wikidata provides no field value, and that is the design rather than a gap.** §11.1 requires
an image's own license to be read on Commons before storage, so the image value is Commons'
(`FIELD_SOURCE_PRECEDENCE.image` names Commons, not Wikidata). Wikidata's contribution is
_identity_: the QID, the `P625` coordinate, the `P18` pointer, and the sitelinks. So its
`provides` is empty and the registry runs it first anyway — which is what makes §12.3's
exact-first match order performable at all, since Wikipedia matching without the QID would be
a second, fuzzier guess about the same place.

**Wikipedia therefore does no matching of its own.** It inherits the identity join and carries
its confidence, rather than running a name search that could disagree with Wikidata about the
same place. The article titles come from the item's **sitelinks**, filtered to `hewiki|enwiki`
— which also means langlinks is not needed: a missing `hewiki` sitelink _is_ the answer that
there is no Hebrew article, and a second round trip could not invent one.

**One alias edge the store's unique columns create.** Two Google entries can resolve to one
real-world place, and the second pass then collides with a `wikidataQid` another row holds.
The pass keeps its work and drops the contested alias rather than losing the fetch; merging
the two rows is a decision this phase does not need to take.

## Environment

**Egress to `wikidata.org`, `wikipedia.org` and `upload.wikimedia.org` is blocked here**, as
it was for the design session, so both providers were built and tested against recorded
fixtures whose QIDs, filenames, licenses, coordinates and article titles are real data from
the [coverage spike](2026-08-04-enrichment-coverage-spike-data.csv). The four fixture places
are the ones carrying a measured lesson: Sensō-ji (happy path, English-only article), Tokyo
Skytree (the Hebrew branch), Meguro River (right match, wrong granularity), Tsukiji (dissolved
entity). **No real provider response has been observed** — the first networked run is worth
watching, and it is the one thing these 130 tests cannot stand in for.

Postgres was run from the system cluster (`pg_ctlcluster 16 main start`) rather than Docker,
per the prerequisites checklist's no-Docker note, so the migration and the orchestrator's
integration spec both ran for real. Note for the next agent session: `vitest.config.ts` reads
**`backend/.env`** only, so a root-only `.env` leaves every integration spec failing with
`User was denied access on the database` — copy it to `backend/.env`.

## Still open, unchanged by this phase

- **The device pass with real Commons files** — whether a photograph is legible at 40px. Phase
  4's premise, and nothing here touches it.
- **Hours (ADR-0166 Phase 2)** — still uncosted for restaurants. The measurement it wants is
  Overpass by coordinate for ordinary businesses, with no Wikidata step. `FIELD_SOURCE_PRECEDENCE`
  already names OSM for `hours`, so that phase is a provider plus a registration.
- **`DocumentViewer`'s shape** (Phase 6) — not looked at, deliberately, per the plan.
