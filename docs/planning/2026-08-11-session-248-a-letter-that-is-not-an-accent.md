# Session 248 — a letter that is not an accent (field report #29, workstream N)

**Date:** 2026-08-11
**Workstream:** `N` — a bounded normalization extension that ships, **plus a finding that redirects the report's own diagnosis and is deliberately left unfixed**.
**Touches:** `backend/src/enrichment/match.ts`, `backend/src/enrichment/match.spec.ts`, `docs/backlog.md`.
**No new ADR** — matching _policy_ is unchanged; this extends the "score every form the name offers, keep the best" mechanism [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) §15 already established and §19 already built once (the parenthetical alias). **No mockup** — nothing visual.

## 0. Read this first: what shipped is not what the report is about

The backlog line for `N` names a mechanism — `match.ts`'s `tokenize` folds diacritics with `NFD` + `\p{M}` removal, which does nothing for `ð`, so `Kerið` never meets `Kerid`. That mechanism is **real and is now fixed**. It is **not** what rejected Kerið.

**Kerið's own Wikidata label is `Kerið`, with the eth — and so is Google's name for it (`Kerið Crater`).** Both sides already spell it the same way, so there was never a fold to perform for this specific place. Verified against the live entity (`Q1435393`) by the paired research session that fed this one; recorded here because the backlog line reads as though the letter were the cause, and the next person should not re-derive that it isn't.

Two things follow, and they are the whole point of this note:

1. §1's fix is justified **on its own evidence** (Gießen, below), not on Kerið. It ships because the gap is real, measured, and cheap.
2. §2's finding is a **better-evidenced hypothesis for the actual field report** — and it is left unfixed on purpose, because fixing it is a policy call this session was not scoped to make and should not have made quietly.

**This PR does not reproduce field report #29 and does not claim to.** Nobody has seen the owner's stored `Place` row for Kerið — its saved `name` string, its coordinates, or which of the four routes the live pipe took. §2 is arithmetic over the two labels we now know; it is not a trace.

## 1. What shipped: the non-decomposing Latin letters

`tokenize` folds `Sensō-ji` → `senso`+`ji` because a macron is a **combining mark** and `NFD` splits it off the letter. `ð`, `þ`, `æ`, `œ`, `ø`, `ł`, `đ`, `ß` are not letters-with-an-accent — they are letters, and they decompose to themselves. Checked every one of them in the runtime rather than trusting the table from the handoff:

```
ð Ð þ Þ æ Æ œ Œ ø Ø ł Ł đ Đ ß   → all unchanged by NFD + \p{M}
ō é å Å ñ                        → all folded
```

**The measured case is Gießen** (`Q3874`), and it is clean in a way Kerið is not: Google's own name for the place is **`Giessen`**, plain; Wikidata's German label is **`Gießen`**. Before this change `nameSimilarity('Giessen', 'Gießen')` was **0** — not "weak", zero, on a one-token name where the two sides agree about every sound. After, it is **1**. That is the proof the mechanism works, and it is a real recall hole independent of anything Icelandic. `Þingvellir` (`Q107370`) supplies the second: the entity carries `Þingvellir` as its Icelandic label and `Thingvellir` as its English one, and those two scored 0 against each other for the same reason. (Note the trap: that entity's _English label_ is already `Thingvellir National Park`, which matches Google's own string — comparing at the EN-label level never exercised the þ at all, so the test uses the IS/EN alias pair, which does.)

**Where it went, and why not somewhere else.** The backlog line left the placement open — shared normalization, provider query expansion, candidate scoring, or a combination — and asked for the call to be made on false-positive risk. It went into **candidate scoring only**, as a variant:

- **Not into `normalizeSearchTerm`** (`packages/shared`). That helper is the app's substring search — destinations, icons, the Index booking search. Folding `ø → o` there changes what a user's typing matches app-wide, which is a different decision with different evidence, and nothing in this report asks for it.
- **Not into `tokenize`.** That would be a destructive replacement: the local spelling would stop existing as far as the matcher is concerned. The backlog line asks for transliterated forms as _additional evidence, never destructive replacement_, and a variant is exactly that — it can only raise a score, never lower one, so nothing that matches today stops matching.
- **Not into provider query expansion.** A second search per name for a class of letters this narrow buys recall at the cost of a request budget, and the scoring fix already reaches every route (see below).

**One edit covers all four routes.** Traced every call site: the name-search route, `matchByArticleText` (`wiki_search`), and the coordinate-first `geosearch` route all funnel through `nameOnlyConfidence`/`nameProximityConfidence`, and both of those call `nameSimilarity`. `wikidata.provider.ts` is untouched.

**Shape.** `nameSimilarity`'s two ad-hoc variant forms became one `nameVariants(name)` — the raw string, the de-parenthesised string, and each of those transliterated — cross-producted, best kept. This is the rule-8 move rather than a second `Math.max` limb beside the first: the parenthetical fix was a one-off that already wanted to be a list, and a third mismatch class is now a one-line addition instead of another copy. Deduped and de-emptied, so an ordinary ASCII name with no parenthetical still costs exactly one comparison.

The table is curated (16 entries, both cases, including `ẞ`), not a transliteration dependency. The class is small and closed, and a general romanizer would bring opinions about scripts this function deliberately refuses to compare at all — `namesComparable` sets a Hebrew name against a Japanese one aside precisely so the matcher never pretends to read one, and a library that "helpfully" romanizes both would undo §15's whole lesson.

**Why it cannot manufacture a false match**, the same property that made the parenthetical variant safe to do here rather than at one call site: it only ever spells one side the way the other already does, and anything that clears `MATCH_MIN_NAME_SIMILARITY` on the strength of it still faces the distance veto in `nameProximityConfidence`, which refuses a same-named place 9,000 km away.

## 2. The finding: Google appends a feature-type word Wikidata's label doesn't carry

**This is the more likely cause of field report #29, and it is not fixed.**

Google's label: `Kerið Crater` — two tokens. Wikidata's: `Kerið` — one token, no descriptor. `nameSimilarity` scores by token-set overlap over the **geometric mean** of both sizes:

```
shared = 1  ("kerið")
score  = 1 / sqrt(2 × 1) = 0.7071
```

**`MATCH_MIN_NAME_SIMILARITY` is 0.8.** So this is a calculable refusal in code that exists today, on the exact two strings the two services actually return, with no letter-folding involved at either end. It is the kind of thing Google does habitually — `Crater`, and by the same pattern `Falls`, `Lake`, `Beach`, `Park` — appending the feature's own type to a terse label that omits it.

(The arithmetic was checked against the file's own worked example before being trusted: `Tsukiji` vs `Tsukiji Outer Market` reproduces as `1 / sqrt(3)` = **0.577**, matching the number the comment at `match.ts` has always claimed.)

**Why this is not a mechanical extension of the parenthetical pattern, and why it was left alone.**

The file already treats a short name inside a longer one as _correctly weak_, and says so in a comment about this very arithmetic: `Tsukiji` inside `Tsukiji Outer Market` scores 0.58 **on purpose**, because a one-word match against a bigger, genuinely broader place must not be rewarded — that is §11.2's granularity concern expressed in the scorer instead of the deny-list. `Kerið` vs `Kerið Crater` has the identical _shape_ and the opposite _meaning_: the entity is the same thing, and the extra word is a type noun that equals the entity's own `P31` class (`Q109391`, volcanic crater — not in `BROADER_INSTANCE_OF_QIDS`, so the granularity check already considers it specific enough).

A rule that strips a trailing word cannot tell those two apart from the strings alone. `Central Park` vs `Central`, `Tsukiji Outer Market` vs `Tsukiji`, `Kerið Crater` vs `Kerið` are the same shape to any such rule, and two of the three must keep refusing. Anything that works would have to read the candidate's `P31` and ask whether the dropped word _names that class_ — which is a matching-policy change with a false-positive budget, most likely an ADR-0166 amendment, and exactly the "measured false-positive risk" call the backlog line reserves. Doing it here, in a normalization PR, on one place's arithmetic, is how §11.2's deny-list gets quietly undermined.

So it is **encoded as a test that asserts the current, refusing behaviour**, with a comment saying in as many words that it is a known unfixed gap and not a regression — so that someone tightening the geometric mean later has to read this reasoning before they can make it pass. And it has its own backlog line.

## 3. What is still open

- **The actual reproduction.** The stored `Place` row for Kerið — saved name, coordinates, route taken, refusal recorded — has still never been looked at. If the owner can supply it, §2 becomes confirmed or falsified in one step. **Clear the negative cache before re-testing** (30-day miss TTL; `delete from "PlaceEnrichment"` is safe, it holds no trip data).
- **The descriptor-suffix question** (§2), now its own backlog line.
- **The table is a starting set, not a survey.** Eight letter-pairs, chosen because they are the ones that show up in European place names an Israeli traveller plausibly saves. Extending it is a one-line change; it should be extended when a case appears, not preemptively.

## 4. Build log

- `pnpm install`, then `pnpm --filter @waypoint/shared build` (vitest resolves `@waypoint/shared` through its compiled output, so a cold clone fails to resolve the import before that runs), then `pnpm --filter @waypoint/backend prisma:generate` — the generated client is what `typecheck` needs.
- Four new cases in `match.spec.ts`'s existing `describe('nameSimilarity', …)` block, in that block's own style: plain string literals, no fixture machinery. **No entries were added to `fixtures.ts`** — those exist for provider-level tests (`wikidata.provider.spec.ts`), and nothing here needs a provider round trip to prove. The real research data (QIDs, coordinates, `P31`s) is recorded in this note instead of being frozen into fixtures no test would read.
- `match.spec.ts` 53 passed. `pnpm typecheck` and `pnpm build` green across the workspace.
- **The DB-backed backend specs cannot run in this sandbox** — no Docker daemon, so no Postgres, and `enrichment.service.spec.ts` (plus 16 other service specs) fails with `Can't reach database server at 127.0.0.1:5432`. Confirmed identical on an unmodified tree before making any change; these are environmental, not this PR's. Everything that runs without a database passes.
