# Session 228 — the fourth match route, for the airport nothing could reach

**Date:** 2026-08-08
**Follow-up build** on [session 227](2026-08-08-session-227-airport-label-followups.md) (PR #529, merged). Durable record: [ADR-0166 §20](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md).

## 1. The report

`נמל התעופה בנגקוק סוונאפום` never matched. Wikidata has it as `Suvarnabhumi Airport` (BKK).

## 2. Why every existing route failed

Three routes, three independent reasons — which is why nothing about §19's parenthetical fix helped:

- **The Wikidata label search could not return it.** `wbsearchentities` matches labels and aliases. We query with `language=he`; the item is labelled in Latin. A Hebrew string cannot match a Latin label, so the search returns **nothing** — there was never a candidate to score.
- **Even if it had, the comparison is unwinnable.** `סוונאפום` is a **transliteration** of Suvarnabhumi, not a translation. Token overlap is 0 by construction, the scripts are disjoint, and §15's rule already says a cross-script comparison is _uninformative_ rather than negative. No amount of scoring recovers a name written in different letters.
- **The coordinate route was looking in a 500m circle.** That radius was matched to where the distance credit runs out — correct for a café, wrong for an airport, whose `P625` centroid session 225 measured at 1.1–1.4km from the terminal pin. Suvarnabhumi is bigger than all three of those.

So the one language-independent route in the pipe was structurally blind to the entire airport category, and had been since it was built.

## 3. What was built

**A fourth route (`wiki_search`)** — Wikipedia's full-text search, which matches article **text and redirects** where the transliteration and the city both actually appear. It reuses the coordinate route's machinery wholesale: same allowlisted host, same generator trick so the QIDs arrive in the same call, same `wikibase_item` extraction. It runs only after the other two find nothing, and is capped at **0.7** against `geosearch`'s 0.8 — a text hit is real evidence and weaker than a name that agreed or a point that matched, and the ceiling is what guarantees the ordering rather than a tie-break at the call site.

**An airport-sized distance ruler** (`AIRPORT_TRUST_METERS = 3000`, decaying to nothing at 8km). The design point worth keeping: **the allowance is earned by the candidate's `P31`, not by our name.** We read the airport class off the item, so nothing that is not an airport can claim it — a hotel 2km from the pin is still scored and still refused at the ordinary radii. That is what makes this a category allowance and not a loosening of the matcher.

The geosearch request radius widened 500m → 3km alongside it. That is free: GeoData returns the N _nearest_, so in a dense city the twenty nearest are all inside 500m and nothing changes; in a sparse one it adds the airport that was previously out of reach.

## 4. Why not just use a nickname

The owner's reason, and it is the correct one: **a nickname fixes the label and leaves the fact missing.** `Place.nickname` overrides what a row _says_; it cannot supply `iata`, so the booking detail's `קודי שדות תעופה` row stays empty for an unmatched airport. An airport that does not match is not a cosmetic problem — the whole airport pair is absent. The nickname is the right answer for Keflavík (where the data is _correct_ and disagrees with what a passenger means) and the wrong answer here (where the data is right and we simply could not reach it).

## 5. Testing note

The provider spec's `provider()` helper now defaults the text-search fixture to **empty**, which is what makes every pre-existing spec still mean what it meant: those tests are about the name or the coordinate route, and "no fixture" now reads as "and Wikipedia had nothing either". Any spec that is about this route supplies its own.

The Bangkok fixture is honest about what is real in it: the transliterated Hebrew name, the Latin-only label, the ~2km offset and the `P31` class are the reported shape; the QID is a stand-in, as in the other airport fixtures.

## 6. Still owed

- Unchanged: the `airport`/`international_airport` overlap is unmeasured, and the empty-answer retry in `PlacesService.searchPlacesText` waits on it.
- **Unmeasured here too, and worth saying:** no session has been able to reach `wikidata.org` or `wikipedia.org` from the sandbox, so this route's real-world precision is reasoned about and unit-tested, **not observed**. The first live pass is the measurement — and the thing to watch is a text hit that mentions a place without being it, which is exactly what the distance check exists to refuse.
- A device pass on the label surfaces, now three sessions old.
