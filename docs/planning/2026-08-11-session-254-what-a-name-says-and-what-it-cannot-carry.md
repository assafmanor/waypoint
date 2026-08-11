# Session 254 — what a name says, and what it cannot carry (field report #41, workstream N)

**Date:** 2026-08-11
**Workstream:** `N` — reopened by field report #41. Four defects, none of them session 248's, each measured against the live APIs and fixed; plus the first measurement of enrichment **recall** that has ever existed in this repo.
**Touches:** `backend/src/enrichment/match.ts` (+ spec), `backend/src/enrichment/geosearch.ts` (+ spec), `backend/src/enrichment/providers/wikidata.provider.ts` (+ spec), `backend/src/enrichment/providers/fixtures.ts`, `backend/src/enrichment/live-recall.probe.spec.ts` + `live-recall.corpus.ts` (new), `docs/decisions/0166-place-enrichment-is-a-multi-source-pipe.md` (§22), `docs/backlog.md`.
**ADR-0166 amended in place (§22)** — retrieval, scoring and confidence policy all moved. **No mockup** — nothing visual.

## 0. The negative cache, first, because "still missing" means two different things

Session 249 §8 and the backlog both say to do this before anything else, so: **there was no reachable copy of the owner's database in this session.** A local Postgres 16 was stood up under the `postgres` user, migrated and used for the DB-backed specs (§7), and its `PlaceEnrichment` table is empty because it was created empty — `select count(*)` returns 0. That is not the same as clearing the owner's.

So the ~30-day miss TTL (`ENRICHMENT_MISS_TTL_MS`, `enrichment.policy.ts:105-110`) **remains a live alternative explanation for the field observation** and this session cannot exclude it. It is still true that `delete from "PlaceEnrichment"` is safe on the deployment — it holds no trip data — and it still has to happen there before "still missing" can be read as "the fix did not work."

**What this session can say instead, and it is stronger than a cache argument:** the two witnesses were reproduced against the live APIs and **they genuinely did not match**, on `edc68e5`, with no cache involved at all. The report was right. It was right for four reasons, and none of them was #29's.

## 1. What the trace found, per witness

Not arithmetic — the real endpoints, captured 2026-08-11, with the production `WikidataProvider` driven route by route.

### 1.1 `Brúarfoss` — three holes in one place

| route                              | what happened                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `wbsearchentities` (`language=he`) | **five hits**: `Q16422005` (a waterfall on the Hítará, **130km away**) first, `Q2557346` (the right one) second, then three ships |
| `generator=geosearch`, `en`        | **empty**                                                                                                                         |
| `generator=geosearch`, `he`        | **empty**                                                                                                                         |
| `generator=search` (wiki_search)   | shipwreck lists and `Golden Circle` — never the waterfall                                                                         |

- **`Q2557346` has no `enwiki` and no `hewiki` article.** Its sitelinks are `is`, `de`, `it`, `nl`, `sv`, `ceb`, `commons`. A geosearch at its pin therefore returns **literally nothing** in both wikis we ask, which is not a tuning problem — the coordinate route is Wikipedia-shaped and this place is invisible to it by construction.
- **So the name route held the only copy of the right answer, and threw it away.** `matchByName` scored the hits on name alone, picked the single best, read _that_ entity, and returned `null` when its coordinates refuted it. Both waterfalls are labelled exactly `Brúarfoss`, so they tie at 1.0 and the **first** wins — the wrong one. The right entity, at rank 2, ~100m from the pin, was never read.
- **And under Google's own name it did not even get that far.** `wbsearchentities` for `Brúarfoss Waterfall` returns exactly one hit, the correct `Q2557346` — and then `nameOnlyConfidence` scores `Brúarfoss Waterfall` against `Brúarfoss` at 0.707 × `NO_PROXIMITY_FACTOR` = **0.566**, under the 0.6 threshold, and the pre-filter discarded it before its coordinate was ever read.

**Classification: candidate retrieval and candidate selection.** Not naming, not normalization, not a safety guard.

### 1.2 `מפלי גולפוס` — one Icelandic word, three Hebrew spellings

| what                                 | result                                           |
| ------------------------------------ | ------------------------------------------------ |
| `wbsearchentities` for `מפלי גולפוס` | **zero hits**                                    |
| `wbsearchentities` for bare `גולפוס` | **zero hits**                                    |
| `generator=geosearch`, `en`          | `Gullfoss` `Q38519` at **124m**, alone           |
| `Q38519` labels                      | `en: Gullfoss`, `is: Gullfoss`, **`he: גאלפוס`** |
| `Q38519` `hewiki` sitelink           | **`גוטלפוס`**                                    |

Google's Hebrew is `גולפוס`. Wikidata's Hebrew label is `גאלפוס`. The Hebrew Wikipedia's article is `גוטלפוס`. **Three transliterations of one Icelandic word**, and token-set overlap scores every pair of them **0**.

The consequence is the sharp part, and it is §15's own lesson one level further down. The label is Hebrew, so `namesComparable` says the names **can** be compared; the comparison scores 0; so `nameCanRefuse` returned `true` and the name vetoed the one candidate the coordinates had found, at 124m. **Had `Q38519` carried no Hebrew label at all — Kerið's exact situation — the scripts would have been disjoint and the identical entity would have matched at 0.8.** A word we can read but cannot spell the same way was worse evidence than no word at all.

**Classification: normalization (within-token), exposed through language selection.** The `language=he` search finding nothing is real and is §15's known recall hole; what was new is that the coordinate route's rescue was then vetoed by a spelling.

### 1.3 `Kerið`, for completeness

Matches, on `edc68e5`, exactly as session 248 §5.4 recorded. It is in the corpus as a regression witness and it stays green throughout.

## 2. The four fixes, and the one that had to be weakened

**(a) Read every hit the search returned.** `wbgetentities` takes 50 ids, so scoring five candidates with their coordinates is the **same single call** the one winner already cost. The pre-filter that was doing the discarding is gone, and its removal is §15's own argument applied to itself: a candidate rejected before its coordinate is read was rejected on evidence we did not have yet.

**(b) Commons is the coordinate route's last step.** Its category tree is language-neutral by construction, far more of the world is geotagged there than in any single Wikipedia, its categories carry the same `wikibase_item` join, and it is already on §7's allowlist. Asked only when both wikis were silent, so the common case makes no extra request. At Brúarfoss's pin it returns `Category:Brúarfoss` → `Q2557346`, and `Category:Árnessýsla` → the county, which the granularity skip drops.

**Measured and rejected on the way:** Wikidata's _own_ `generator=geosearch` works and is one call to a host already allowlisted — but its index is **incomplete**. At the Kerið and Eiffel Tower pins it returns the right item; at the Gullfoss and Brúarfoss pins it returns **neither**, though both carry a `P625` within 150m. Recorded here so the next person does not re-derive it.

**(c) A word spelled two ways is the same word.** Tokens now match within a bounded edit distance — one edit at five letters, two at eight, nothing below five. That is what keeps `Bali`/`Bari`, `Ueno`/`Ueda` and `park`/`part` apart: they are too short to qualify at all.

**And this is the fix that had to be weakened, on a measured false positive.** Drafted with a spelling variant counting as a whole shared word, and then: **`Kensington` and `Kennington` are two real London places one edit apart and 4.9km apart** — _inside_ `MATCH_FAR_METERS`, so the distance veto does not fire — and they matched each other at 0.652. So a near-spelled word is worth **0.75** of an exact one, deliberately below `MATCH_MIN_NAME_SIMILARITY`: **a spelling variant corroborates and can never carry.** It lifts a multi-word name that agrees about its other words, and it lets `nameCanRefuse` see that `מפלי גולפוס` does not contradict `גאלפוס`, after which the distance answers alone under the `geosearch` ceiling — which is precisely where §21 put Kerið.

**(d) The descriptor-suffix gap, which session 248 §2 deferred, is closed — in the form §2 itself named.** §2 said the only honest version "would have to read the candidate's `P31` and ask whether the dropped word _names that class_", called it a matching-policy change with a false-positive budget, and left it. That is what is built. The class labels are read from Wikidata (one extra call, gated to candidates a type noun could actually rescue, memoized process-wide because a waterfall is a waterfall for every waterfall a trip saves), and our name is scored again with those words removed.

- `Brúarfoss Waterfall` vs `Brúarfoss` → **1.0**.
- `Kerið Crater` vs `Kerið` → **1.0**, which is better than §21's answer: the name now _corroborates_ instead of being set aside, so the match is a named one rather than distance-only.
- **`Tsukiji Outer Market` vs `Tsukiji` → still 0.577**, because a `chōchō` is not an outer market. That is the entire difference between this rule and the "strip a trailing word" rule §2 rejected, and it is why §11.2's deny-list is not undermined.
- Asymmetric, for §21's reason: strip a _candidate's_ type word and `Piccadilly Circus tube station` becomes `Piccadilly Circus tube`, 0.816 against the square, and §16's defect is back.

**(e) The scorer had never been shown most of the candidate's names.** It compared against the `he` and `en` labels only, while the same response carried **aliases** (`Fontana di Trevi`, under a label of `Trevi Fountain`) and **article titles** (`גוטלפוס`), both already paid for.

## 3. The measured false positive that changed the design, and the rule it produced

The corpus carries refusal controls, and one of them **regressed**: `בית קפה גולפוס`, a café named after the waterfall, sitting **133m from `Q38519`'s own `P625`** — inside `GEO_TRUST_METERS`. Before this branch it was refused, because `גולפוס` and `גאלפוס` shared no token and the name vetoed. After (c) it matched the waterfall at 0.8, and would have been handed the waterfall's article and photograph.

That is not acceptable under §5.5, and the honest reading is that **§21's Rule 1b was always half a rule**. It asked "does our name contain theirs and add more?" — and `בית קפה גולפוס` does exactly that, as surely as `מפלי גולפוס` does. Distance cannot separate them and was never going to. What separates them is _which_ words were added, and (d) had just built the machinery to read them:

> **A word of OURS that names what the candidate IS has not disagreed with it — and every other extra word HAS.**

So §21's Rule 1b and §22's Rule 1c became one rule with one test. `מפלי` is an inflection of `מפל`, the first word of `Q34038`'s Hebrew label, so it is a type word; `בית` and `קפה` are not. The café refuses again. Its default is the safe one: told nothing about the candidate's type, no word can be surplus, so the name refuses exactly as it did before §21 — and the only caller that ever needs the exception is the one that looks the type up.

**This tightens §21 rather than loosening it**, which is worth stating plainly: the branch's net effect on the coordinate route's permissiveness is negative, not positive.

## 4. Recall, measured — and the corpus is mostly Hebrew on purpose

§11's coverage spike measured what the sources _have_. Nobody had ever measured what the matcher **reaches**. There is now a checked-in, opt-in probe (`ENRICHMENT_LIVE_PROBE=1`) that runs the production pipeline against the real Wikimedia APIs over a corpus of saved names, records every route's answer per case, and writes the lot to a file so two runs can be diffed.

**The corpus is 60% Hebrew, and that is the correction that mattered most.** The first version was mostly Latin, which is backwards: the app asks Google with `languageCode=he` (ADR-0108), so a **Hebrew** saved name is the normal case and a Latin one the exception. The corpus now carries most places **twice** — same pin, same expected QID, only the alphabet changed — which makes the Hebrew/Latin gap a controlled comparison rather than two separate samples. It also carries refusal controls (ambiguous same-name, multi-country `Cambridge`/`Santiago`/`San José`, the district-for-a-shop cases, §16's Piccadilly pair), because **a recall number without them is not a measurement**.

### 4.1 The numbers

Two runs of the same 170 names against the live APIs on the same day, one on `2570735` and one on this branch:

| saved name                          | before  | after   |
| ----------------------------------- | ------- | ------- |
| **all 170**                         | **114** | **142** |
| Hebrew (93 — the app's normal case) | 54      | **67**  |
| Latin (77)                          | 60      | **75**  |
| refusal controls                    | 2 of 3  | 2 of 3  |

**Twenty-eight names newly matched, and not one newly wrong.** An earlier 110-name cut of the corpus, before the Hebrew half was added, ran 82 → 103 on the same code.

The control that does not pass fails **identically in both runs**: `רמן איצ׳ירן שיבויה`, a shop inside Shibuya, matches a school ~170m away. That is §5.3's still-open finding — `BROADER_INSTANCE_OF_QIDS` is country-shaped and a Japanese school is not a broad type — and this branch neither caused it nor fixed it. It is left failing on purpose: a control that is quietly deleted is a control nobody re-runs.

### 4.2 What is still missed, classified rather than rounded off

**Twenty-eight of the 170 still miss, and they are one story with three footnotes.** The story: in **every** remaining Hebrew miss the name route returned **zero hits** — `wbsearchentities` is a label search, the item carries no Hebrew label, and §15's recall hole is total. That leaves the coordinate route deciding on distance alone, and distance alone is deliberately weak, so it then refuses for one of three reasons, each of which is a guard working:

- **the pin is ambiguous** — `פיקדילי סירקוס` has a dozen articles inside the trust radius and nothing readable to arbitrate, which is §16's refusal by design;
- **the entity's `P625` is further than distance-only credit reaches** (~238m) — `מפלי סקוגאפוס` is 294m from `Q1130718`'s coordinate. Widening that is exactly what §21 measured as unsafe (Tsukiji's district centroid is 366m from the market), so this stays refused **on purpose**;
- **a broader entity is nearer** — `חוף קופקבנה` reaches Copacabana the _bairro_ rather than the beach, which is §5.3's country-shaped `BROADER_INSTANCE_OF_QIDS` again: a Brazilian neighbourhood class is not in it.

The three footnotes, all Latin-name and all classified:

- **A colloquial descriptor is not a class label.** `Jökulsárlón Glacier Lagoon`: Wikidata's classes for it are not called "glacier lagoon", so Rule 1c has nothing to strip. Rule 1c is deliberately not a synonym table.
- **`wbsearchentities` matches label prefixes.** `Sun Voyager` does not reach the label `The Sun Voyager`, and that article carries no GeoData coordinate, so neither the name nor the point can find it.
- **`הקולוסיאום` / `Colosseum`.** The Hebrew search finds nothing, and the pin sits inside a monument dense enough that the ambiguity refusal fires. Same shape as `פיקדילי סירקוס`.

**One candidate fix was identified and deliberately not taken.** The geosearch route already knows the _article's_ own coordinate, which for a natural feature is often nearer the visitor pin than the item's `P625`; scoring on the nearer of the two would recover several of the distance-limited misses. It is a **relaxation of the one number §21 measured as load-bearing**, and the owner's constraint is that a relaxation is measured before it ships, not reasoned about. It is a whole probe run's worth of work and it is written down here rather than guessed at.

### 4.3 The limit of this measurement, stated rather than buried

**The pins are visitor coordinates and the Hebrew names are plausible reconstructions, not captured Google responses.** Nobody in this session or in 248 has seen the owner's actual stored `Place` rows or a real `languageCode=he` Google payload. Two consequences, and they pull in different directions:

- Every **mechanism** finding above is independent of that: which route ran, which candidate it returned, and which guard refused it are properties of the payloads the live APIs actually returned, and those are real.
- The **absolute** recall figure for the Hebrew half is indicative only. A case whose verdict turns on a hundred metres, or on whether Google really says `כנסיית הלגרימסקירקיה`, is evidence about the radius or about my reconstruction — not about the place. Three such cases are named in §4.2 rather than hidden.

If the owner supplies the stored rows, the corpus is one file and those entries are one edit each.

## 5. So the next miss does not cost a session

Every route now records the candidates it saw, each one's name, similarity, distance and confidence, and the guard that refused it; on a total miss the provider logs the lot on one line at `debug`. Sessions 248 and 254 were both spent reconstructing precisely that by hand against the live APIs. The third should read a log line, and if it needs more than that, run the probe with `PROBE_ONLY=<case>`.

## 6. What is NOT changed, deliberately

- **No one-off aliases for Brúarfoss, Kerið or Gullfoss.** Nothing in this branch names a place; every fix is a rule, and the three witnesses are fixtures, not data.
- **The raw name is preserved everywhere.** Transliteration, de-parenthesisation and class-noun stripping are all _variants_ scored alongside the raw string, never a replacement — a variant can only raise a score.
- **The distance, place-type, granularity, airport-identity and confidence/refusal guards are intact**, and the one rule this branch touched (§21's) came out **tighter**.
- **`BROADER_INSTANCE_OF_QIDS` was not extended for Iceland.** Session 248 §5.3 flagged it as country-shaped and it still is; nothing in this trace produced an Icelandic district that needed refusing, and adding classes nobody measured is how the list stops being small enough to be safe (`match.ts` says so in as many words).

## 7. Build log

- `pnpm install`, then `pnpm --filter @waypoint/shared build` (vitest resolves `@waypoint/shared` through its compiled output), then `prisma:generate`.
- **Postgres stood up rather than skipped**, as session 248 §5.4 did: Postgres 16 is in the image, started under the `postgres` user against `/etc/postgresql/16/main/postgresql.conf`, role + database created, `prisma migrate deploy` applied. The DB-backed specs run.
- `pnpm format` after `pnpm install`, per the root `CLAUDE.md` (an unpinned `prettier` on `PATH` rewrites files CI then rejects; the repo pins 3.9.5).
- `pnpm typecheck` + `pnpm build` green across the workspace.
- The live probe is **skipped by default** and asserts nothing about the score — Wikidata changes under us, and a probe that fails the build on somebody else's edit is a probe people delete. The permanent guarantees are the offline fixtures.
