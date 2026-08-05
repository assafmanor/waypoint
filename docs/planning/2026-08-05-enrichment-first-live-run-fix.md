# Enrichment's first live run — a cross-script comparison, and what it exposed

**Date:** 2026-08-05
**Scope:** What the first live deploy found: **two** matching bugs — one refusing correct matches, one accepting a song — the recall problem behind the first (now answered by a **coordinate-first identity route**), and one badge defect only a device could see. Recorded as [ADR-0166 §15](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md).
**Follows:** [the trigger](2026-08-05-place-enrichment-trigger-built.md), whose rollout note said this deploy would be the first live Wikimedia request and named what to watch.

## The report

Egress reached Wikimedia and `PlaceEnrichment` filled with `absent` / `not_found`. The owner's two data points named the shape in one line: **`Stokksnes` matched, `מגדל אייפל` did not.**

That pair is the whole diagnosis. A Latin saved name works; a Hebrew one does not; and `מגדל אייפל` **is** the Eiffel Tower's Hebrew label on Wikidata, so the search cannot have missed it.

## The defect

`search()` sent `uselang=en`. In `wbsearchentities` that selects the language of the labels in the **response** — it is not a search fallback, which is exactly what the code's own comment claimed it was. So:

1. the search found `Q243` (Hebrew label matched the query);
2. the hit came back labelled `Eiffel Tower`;
3. `matchByName` scored `מגדל אייפל` against `Eiffel Tower` → ~0;
4. `isMatchConfident` refused, and the function returned **before reading the entity** — whose `labels.he` would have scored 1.

`sources: []` and `reason: not_found` in the store, which reads as "Wikidata has nothing" when it means "we found it and threw it away".

## The fix

A candidate is scored against **every name it offers**: `match.text` first — what actually matched the query, so it is in the query's own script by construction — then the label, then the aliases. The entity re-score, which is where the coordinate veto lives, likewise scores against all of the entity's labels rather than one preferred one. `uselang` is gone; `language=he` stays, because that is the language the saved name is usually in.

**§5.5 is untouched.** Each comparison still clears the confidence gate on its own, and the distance veto still applies to whichever name won — the regression test pins a namesake 9,000km away still being refused with all three names on offer. What changed is that the right name is among the ones tried.

**The rule worth carrying:** a saved name and a source's label are routinely in **different scripts**, and comparing across scripts scores 0 — which reads as "wrong place" when it means "different alphabet". The app asks Google for `languageCode=he`, so for a famous place this is the normal case, not an edge one. Any future provider that matches by name inherits this trap.

## What that fix does not cover, and is the more important half

Scoring correctly only helps items the search **returned**, and the owner named the real limit immediately: _"there are gonna be countless more results in English … we're gonna get very few matches."_ Right, and for a reason no search language solves — a name search only ever reaches an item labelled in a language we thought to ask for, and there is none that covers a Hebrew-named trip through Iceland and Japan.

Two things were unmeasured:

- **Whether a Hebrew query reaches an item with no Hebrew label at all.** Wikidata should apply its own language fallback (`strictlanguage` is unset), and `Stokksnes` matching is evidence that it does — but that is one data point, not a measurement.
- **Whether searching by name is the right route at all.** Every picked place has coordinates, and today they only **corroborate** a name match. Inverting that removes the language question rather than tuning it.

**The owner chose the coordinate-first route, with the English name recorded for later** — so it is built, in the same change:

- `enrichment/geosearch.ts` — `generator=geosearch` on `en`, then `he.wikipedia.org`, with `pageprops.wikibase_item` turning each nearby article into a QID. One call per wiki, stopping at the first that answers; 500m radius, 5 candidates, nearest first.
- `match.ts` — `scriptsOf` / `namesComparable` / `geoProximityConfidence`, which is where **Rule 1** lives: a name comparison across disjoint scripts is uninformative, not negative. Scripts overlap → the name must corroborate exactly as on the name route. They do not → distance alone, capped at the lower `geosearch` ceiling.
- `wikidata.provider.ts` — the third route, tried **only** when the name search found nothing. **Rule 2** is here: a broader entity found only by proximity is skipped rather than accepted with per-field refusals, because §11.2's asymmetry assumes the name established the identity. A district's photograph on a museum is the failure the whole ADR exists to prevent.
- `MATCH_METHOD.GEOSEARCH` in `@waypoint/shared`, at confidence 0.8 against the name route's 0.9 — so a coordinate-only identity is always outranked by a corroborated one, by construction rather than by a tie-break at the call site.

**Cost:** two requests, and only for a place the name search already failed.

**Option 3 stays recorded** in ADR-0166 §15 and in the backlog: an English `displayName` from Google would be reliable and would help Wikipedia's own search too, but it is a second billed Details call on every pick, so it waits for a reason.

## The mirror image: `Piccadilly Circus` matched a song

The same run, the opposite failure. A Wikidata item for a **song** named after the place has an exact label and **no `P625`** — so it took §5.5's "no coordinates to corroborate" discount, scored 1.0 × 0.8 = 0.8, cleared the 0.6 threshold and won.

The discount itself is right; it was being applied to the wrong side. **"Absence of evidence is not evidence" holds when OUR place has no coordinates** — a coordless Place-lite, which §10 permits and nothing builds — and is exactly backwards when the absence is the **candidate's**. On Wikidata a real place carries `P625` as a matter of course, so an item without one, while we hold a Google pin for ours, is evidence about its **kind**: a song, an album, a film, a novel named after somewhere. Refused outright now.

Structural rather than curated on purpose: a "not a place" `P31` list would need an entry for every song ever written about a street, and would still miss the next one.

Two things make it safe to be this strict:

- **The pre-filter keeps its own veto-free question** (`nameOnlyConfidence`). A search hit carries no coordinates either — that absence is an artefact of the endpoint, not a fact about the item — so vetoing there would have rejected every candidate before the entity carrying the coordinate was read. The veto belongs to the entity pass.
- **The coordinate route is the safety net.** Refusing the song is only affordable because the geosearch then finds the real Piccadilly Circus. The two fixes compose, and there is a test that pins exactly that: the name search returns only the song, it is refused, and the match comes back `geosearch` on the actual place.

## Round two: it matched the Underground station under the square

The coordinate route shipped and the next report came the same evening: _"now it matches somewhere that's near geographically but not the place itself."_ **Piccadilly Circus matched Piccadilly Circus Underground Station** — metres away, and not a _broader_ thing, so §15's Rule 2 could not see it.

Three flaws, and the arithmetic named the first one:

| name                                                   | sim       | blended at 0m |
| ------------------------------------------------------ | --------- | ------------- |
| `Piccadilly Circus` → `Piccadilly Circus`              | 1.000     | 0.900         |
| `Meiji Jingū / Meiji Shrine` → `Meiji Shrine`          | 0.816     | 0.881         |
| `Piccadilly Circus` → `Piccadilly Circus tube station` | **0.707** | **0.810**     |
| `Tsukiji` → `Tsukiji Outer Market`                     | 0.577     | 0.725         |

**1. Proximity was carrying matches it cannot arbitrate.** Distance is 35% of the blend, and for a facility **at** the place that 35% is free — the station's article coordinate _is_ the square's. So a name that is ours plus a qualifying noun cleared the threshold on evidence that never distinguished the two. Now `MATCH_MIN_NAME_SIMILARITY = 0.8`: **the name must carry a fuzzy match; proximity corroborates and vetoes, never carries.** The table is the calibration — Meiji survives at 0.816, the station goes at 0.707.

And the floor's real value is not the refusal: with both candidates at the pin, it is what lets the **square win**, because the station can no longer outscore it on free distance. There is a test for exactly that.

**2. `ggslimit=5` dropped the subject.** GeoData returns the N nearest, and within 500m of that pin central London has dozens of articles. The square was outside the five. Now 20 — still one `wbgetentities` call, which takes 50 ids. A limit tuned for a quiet suburb silently drops the answer in a dense city.

**3. Ambiguity refuses.** When the name cannot arbitrate (disjoint scripts) distance is the only evidence, and distance cannot separate two things that share a coordinate. An uncorroborated winner with another scoreable candidate inside the trust radius is now refused. A single uncorroborated candidate is still accepted — that is the case the route exists for.

**And one process note worth keeping.** The floor appeared to pass the suite with no regressions before `@waypoint/shared` was rebuilt — which meant `MATCH_MIN_NAME_SIMILARITY` was `undefined` at runtime and every comparison against it was false, so the floor was not in effect at all. The new test that expected a refusal is what caught it. A green suite against a stale build of the package that holds your constants is not a green suite.

## And one thing only a device could find

The same deploy produced a second report, on Phase 4's badge: _"the '2' label is going over the thumbnail image."_ The order stamp is a `--cta` disc — `#e7eaf2` in dark mode — with a 1.5px `--card` ring, and 10 of its 15px sit on the badge. That ring was enough to separate it from a flat category tint and is not enough against a pale photograph; the reported place is grey rock and snow.

It cannot simply move clear: the stamp would need `-15px` to leave a 40px badge, and the badge sits against the card's own 12px padding. So under `[data-photo]` it gains a full 2px ring and a little more offset, and reads as a stamp **on the frame's corner** rather than a mark **in the picture**.

**Worth recording because of what the test suite said.** `e2e/place-photo-frame.spec.ts` asserted the stamp's box was unclipped and byte-identical with and without a photo — both true, and neither was the question. Legibility against arbitrary image content is not reachable by measurement, which is exactly what the device pass is for. The assertion now says the two states differ deliberately, and by how much.

## Re-testing after a fix

**The negative cache will hide it.** A miss is cached for 30 days (`summary`, `image`) and 3 days (`hours`), so a fixed matcher changes nothing until the TTL lapses. Force it: `delete from "PlaceEnrichment"` — it is a derived cache with no trip data in it, and the next snapshot read re-attempts three places at a time.

And read the store the way it is written, which is what makes the next report diagnosable: `sources: []` with `not_found` means **nothing matched** (nobody was asked); `sources: ["wikipedia"]` means the match was good and the article does not exist. The first is a bug, the second is coverage.

## Recorded, not built (owner, same session)

**Enrich a place before it is saved**, so the Map's Google search-result row can show a photograph and a summary while you are still deciding. ADR-0167 §9.1 already designed that surface — the deciding card is where the hero and summary get the room they are for — so what is missing is the pipe's reach, not the design. The backlog line carries the four constraints: the global `googlePlaceId`-keyed store already permits it, delivery cannot use the `placeId`-keyed snapshot join, the trigger becomes far less selective (several candidates per query, most never kept), and the coverage numbers predict a landmark looking magical and an ordinary business showing the empty card.
