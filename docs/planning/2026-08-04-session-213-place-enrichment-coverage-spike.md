# 2026-08-04 · session 213 — the enrichment coverage spike, and what it measured

**Outcome:** [ADR-0166 §11](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) (a six-part amendment to the same day's ADR) + the measured dataset at [`2026-08-04-enrichment-coverage-spike-data.csv`](2026-08-04-enrichment-coverage-spike-data.csv). Phase 1's scope changed, Phase 2 turned out to be **un-schedulable** on this data, and a narrow re-run is now the gate. Nothing built.

## Why a spike came before the design session

[ADR-0166 §10](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) gated Phase 1 on a design pass, and the owner asked the right question about ordering: _"do we need to research the backend, the apis, etc. before we know how it would look?"_

The answer was **not the backend — the returned data**, and this repo has already paid for getting that order wrong. [ADR-0115 §2](../decisions/0115-plan-mode-place-research.md) records `plan-mode-v1.html` drawing a research card with `★ 4.5`, `1.2 ק״מ` and a category glyph, all three of which were fiction against the shipped pipe, and the rule it had to write down afterwards: _"a card renders the fields we actually hold; a mockup drawn before the cost model is not a spec for what to fetch."_ Designing an enrichment card against imagined Wikipedia and Commons responses is that mistake with better sources.

The destination did not need deciding: `backend/prisma/seed.mjs` is a Tokyo trip (`יפן ׳26` / `טוקיו` / `Asia/Tokyo`), so the sample was built around it, with three places lifted from the seed and specs (Shinjuku Granbell, Park Hyatt Tokyo, Narita).

**This session could not run the spike itself** — the egress policy denies `wikidata.org`, `wikipedia.org` and `overpass-api.de` (403 on CONNECT), and WebFetch too. So a self-contained handoff went to an agent with network access, and this note assesses what came back.

## What came back, and how far to trust it

**43 places** in four strata — **A** landmark sights, **B** neighbourhood destinations, **C** restaurants/cafés, **D** hotels/transport — the 27 Tokyo places asked for plus 16 unrequested additions across Paris, Jerusalem, New York and Mexico City.

**Verified locally:** every aggregate in the report was recomputed from its own raw rows and **reconciles exactly** — strata, cities, aspect-ratio buckets, license counts, summary-length stats. The arithmetic is honest.

**Not verified, and it bounds everything below:** the spike had no direct API access either, so values were assembled from source pages rather than captured responses. Specifically — **no image bytes were ever downloaded**, so the primary design input (real thumbnails at real aspect ratios) is still missing; 23 of 33 licenses are unverified; hours are `unknown` on **40 of 43** rows; the Hebrew length "distribution" is n=3; and `iiurlwidth` was never called, so the Commons-thumbnailing claim is inference. Four manifest rows also carry placeholder text where a filename belongs, and the manifest's `Special:Redirect/file/NAME?width=400` pattern is not the documented thumbnail path.

**The headline number is selection-biased and should not be quoted.** The 76.7% image rate is inflated by the unrequested non-Tokyo restaurants, which were picked for fame (Pujol, Katz's, Chartier) rather than for being ordinary. The report says so itself. Tokyo's rate is **70.4%**, and the number that actually governs the design is in the strata table.

| Stratum                   |   n | Exact match | EN article | HE article |     Image | Hours captured |
| ------------------------- | --: | ----------: | ---------: | ---------: | --------: | -------------: |
| A — landmark sights       |  14 |        100% |       100% |      78.6% |      100% |              3 |
| B — neighbourhood         |   9 |       88.9% |      66.7% |      44.4% |     88.9% |              0 |
| **C — restaurants/cafés** |  11 |   **27.3%** |      27.3% |   **9.1%** | **27.3%** |              0 |
| D — hotels/transport      |   9 |       88.9% |      66.7% |      44.4% |     88.9% |              0 |

**Tokyo stratum C: 0 of 7.** No match, no image, no summary — and a negative result is the most robust thing in this dataset.

## What it changed

Six things, recorded in [ADR-0166 §11](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md). Two are worth repeating here for _why they were found rather than reasoned_:

**The image source was wrong, and it was a licensing landmine.** The Wikipedia REST summary's image is not reliably a free photograph of the place: the Eiffel Tower's returned a **non-free logo**, Canal Saint-Martin's returned **a map**. The naive pipeline caches a non-free file — the exact breach §2's Google-free invariant exists to prevent, arriving by a route §2 never watched. The image now resolves through Wikidata `P18` with the license verified on Commons, and no REST-summary image is ever storable. **No amount of per-file license storage would have saved this**, because the failure is picking the wrong file, not mislabelling the right one.

**"Right match, wrong granularity" is a second shape of confidently-wrong that §5 had not named.** Tsukiji Outer Market resolves to the article about the former **wholesale** market — closed, moved, a different place. Meguro River resolves to the whole river rather than the canal-side spot people go to. The entity is correct and the content still misleads. §5's refusable match guarded only against the match being _wrong_; it now also refuses a candidate whose type is _broader_ than the saved place, and it can refuse it for **summary** while still accepting its **image** — which the per-field design already made expressible without changing anything.

The rest: image and summary are independently optional (four places have an image and no article in any language read, which is the strongest validation of per-field precedence); no blind square centre-crop (5 portrait, 2 near-square, 23 landscape, 0.653–1.78, originals to 26.3 MB); and hours are provably not a seven-row weekly table, so the raw OSM expression is stored always.

## Forks put to the owner, and the answers

| Fork                                                       | Answer                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Hebrew is 33% in Tokyo — does the summary leave Phase 1?   | **No — keep it, with a `he` → `en` fallback marked in the UI** (against the spike's own recommendation) |
| Re-run the three unresolved measurements before designing? | **Yes, re-run the narrow gaps first**                                                                   |
| Raised by the owner unprompted                             | **Store the enriched language as a durable key**, not a display hint                                    |

**The Hebrew answer carries a design obligation, so it is not a free choice.** A Hebrew-first RTL app (ADR-0009/0017) will now show English prose for most places that get a summary at all, and the marker saying so becomes a **third** required item in §10's design pass, beside the thumbnail slot and the attribution slot. Mixed-direction text in an RTL surface is where ADR-0118's isolation rules bite, and its lint guard cannot see a language chosen at runtime.

**The owner's own addition is the most forward-looking thing decided today**, and it improved on what the ADR had. §4 carried `lang?` as an optional hint for marking English text; the owner's reasoning — that the recorded language is the hook for **translating English articles into Hebrew** and for **multi-language support** — makes it structural. So `lang` is now required on any value carrying prose, and a text field stores localized **variants** rather than one value, which turns "pick a summary for this reader" into a resolution function instead of a future migration. Two consequences fell out that neither of us had said aloud: a translation is **a new variant that never overwrites its original** (needed for attribution, and so a better translator can re-run without re-fetching), and a translation of CC BY-SA text is a **derivative work whose attribution must propagate along `derivedFrom`** — otherwise a translated summary silently loses the credit its source demanded. A translation provider is then just another provider under §5, whose input happens to be a value we already hold.

## What this leaves

**Phase 2 cannot be scheduled.** Hours have no fill rate, so no cost and no design. That is the single biggest thing the spike was supposed to settle and didn't.

**The design session still lacks its main input** — no image was ever fetched, so there is nothing real to lay out. The narrow re-run owns three gaps and nothing else: download the actual thumbnails, resolve licenses for all matched images, and query Overpass properly. It takes URLs from the `iiurlwidth` response rather than hand-built ones, and it must not re-litigate the sample.

## The re-run, same day — [ADR-0166 §12](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md)

It ran with real API access. **Two gaps closed, one half-closed, and it deleted a step we thought we needed.** The dataset above was refreshed in place; per-file licenses are in [`…-licenses.json`](2026-08-04-enrichment-coverage-spike-licenses.json).

**The re-run's headline number is the thing to distrust this time.** It reports hours at **15/43 = 34.9%**, which counts 11 rows that were **never queried** as failures. Of rows where an OSM object was found it is **15/31 = 48.4%** — and **8 of the 11 unqueried rows are stratum C**, so the restaurant fill rate rests on three places, all famous. The stratum that justifies the whole hours feature is still dark.

**And the reason it is dark is the spike's method, not the world.** With no coordinate column, the re-run fell back to the matched Wikidata item's `P625`, so rows with no Wikidata match had nothing to query with. **In production every place has coordinates** — they arrive with the Google pick and are cached on the `Place` row (ADR-0108 §3). The spike therefore **coupled hours coverage to Wikidata matching when the two are independent**, and that points somewhere useful: the restaurant hole is a Wikipedia/Wikidata hole, and OSM is the source that covers businesses. Hours may well be the enrichment that works best precisely where image and summary fail. Not shown — but it is the one measurement still worth taking, and it needs no Wikidata step at all.

**What did settle:**

- **The resize step is gone.** `iiurlwidth` ignores exact widths (200/400/800 → 250/500/840–960; MediaWiki rounds to buckets) but returned a working server-generated thumbnail for **all 32 images**, at **36–250 KB**, median 71 KB. So we fetch the bucket Commons already made and store those bytes — no 26 MB original, and **no image-resizing dependency in the backend**. We still store our own copy; hotlinking Commons is the same offline defect §2 rejected for Google, whoever the host is.
- **Attribution is the default state.** All 32 licenses resolved, zero exclusions, but **27 of 32 (84%) require visible credit**. That answers a design question rather than adding one: the attribution slot is laid out first and the credit-free case is the exception. Nine distinct license strings appeared, including `CC BY-SA 3.0 de` and `CC BY-SA 2.5` — which is why the license is stored as a per-file string, not an enum.
- **`QID → OSM` is often an _exact_ join.** Ten of 31 objects were found by the OSM object's own `wikidata=Q…` tag rather than by proximity. That materially de-risks the matching problem and gives the pipeline an order: exact tag, then settled id, then fuzzy — with the confidence recording which one fired.
- **One licensing exception**: the Western Wall's `P18` is **GFDL 1.2 only**, whose attribution terms are far heavier than CC's. Recommended and adopted unless overruled: **treat GFDL-only as no image.** One file in 32.
- **Two things only real bytes could show**: Katz's `P18` is a **PNG that landed under a `.jpg` name** — exactly why `image-sniff.ts` decides the type and the filename never does — and **teamLab Planets has no `P18` at all** despite having both articles, so the true image count is **32 of 43**. A Wikidata item can carry sitelinks and no image, the mirror of the image-without-article case.

**The design session is now unblocked for images** — 32 real thumbnails at real aspect ratios (**0.54 – 1.78**, six portraits), with their real licenses and credits. The URLs are in the dataset; they need fetching from a machine with network access, since this environment cannot reach `upload.wikimedia.org`.
