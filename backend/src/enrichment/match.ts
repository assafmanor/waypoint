// Matching — **the hard problem, and the real engineering risk in the whole idea**
// (ADR-0166 §Context 3). We hold a name and coordinates; reaching a Wikidata QID from
// that is a fuzzy join, and a wrong match silently attaches the wrong photo and the wrong
// opening hours to a place. That is materially worse than no enrichment: it is
// confidently wrong, on the surface people trust while standing outside the building.
//
// So the match is evidenced and **refusable**, for two reasons with two different scopes
// (§5.5 + §11.2):
//
//   - **below the confidence threshold → no match at all.** No enrichment beats wrong
//     enrichment.
//   - **the candidate's type is broader than the saved place → refused per field.** A
//     river for a riverside spot, a chain for a branch, a district for a shop. The entity
//     is right; its content describes something else. Refused for `summary`, fine for
//     `image`.
import {
  ENRICHMENT_FIELD,
  haversineMeters,
  MATCH_CONFIDENCE_THRESHOLD,
  MATCH_METHOD_CONFIDENCE,
  MATCH_MIN_NAME_SIMILARITY,
  MATCH_REFUSAL,
  normalizeSearchTerm,
  type EnrichmentField,
  type LatLng,
  type MatchRefusal,
} from '@waypoint/shared';

/** Full proximity credit inside this radius. A Google pin and a Wikidata `P625` centroid
 *  for the same place rarely coincide — a shrine's gate against its grounds — so this is
 *  "the same spot" rather than "the same point". */
const MATCH_NEAR_METERS = 500;

/** No proximity credit at all beyond this. Loose on purpose: Ueno Park's centroid sits
 *  well away from the entrance a traveller pins, and the spike matched exactly such places
 *  correctly. Past 5 km the name is carrying the whole match and should have to. */
const MATCH_FAR_METERS = 5000;

/** How much of a fuzzy match's confidence the name can earn, with proximity supplying the
 *  rest. Weighted toward the name because a distinctive name is stronger evidence than
 *  being nearby — half of Tokyo is within 5 km of the other half. */
const NAME_WEIGHT = 0.65;

/** Penalty applied when there are no coordinates on one side to corroborate the name at
 *  all, so a coordless Place-lite can still match on a strong name and never scores as
 *  high as one that was also in the right place. */
const NO_PROXIMITY_FACTOR = 0.8;

/**
 * 0–1 similarity between two place names.
 *
 * Built on the shared `normalizeSearchTerm` (case, quote-ish punctuation, whitespace) so
 * this agrees with every other name comparison in the app rather than drifting its own
 * normalization — the exact class of duplication that helper was extracted to end. On top
 * of it, two things the real data forced:
 *
 *  - **Diacritics are folded.** Google's name and Wikidata's label differ by a macron more
 *    often than they differ by a word (`Sensō-ji` / `Sensoji`, `Meiji Jingū` / `Meiji
 *    Jingu`), and an unfolded comparison scores those two 0.
 *  - **A name that is the same word differently punctuated is the same name.** `Sensō-ji`
 *    tokenizes to `senso`+`ji` and `Sensoji` to one token, so the joined forms are
 *    compared before the token sets are.
 *
 * Otherwise token-set overlap rather than an edit distance, because the differences that
 * matter here are whole words: `Meiji Jingū / Meiji Shrine` against `Meiji Shrine`. An edit
 * distance calls those distant and a human does not.
 *
 * **Every form of the name is scored and the best kept** (`nameVariants`), which is the same
 * fix §15's cross-script bug got: the search found the right item and the scoring threw it
 * away, so the answer is to stop trusting the single string we happen to hold. Two classes of
 * variant have earned their place, both **additive** — a variant can only raise a score, never
 * lower one, so nothing that matches today stops matching.
 */
export function nameSimilarity(a: string, b: string): number {
  return similarityAgainst(a, b, undefined);
}

/**
 * The same score, **asymmetric**, told what the candidate IS.
 *
 * `classNouns` are the labels of the candidate's own `P31` classes (`waterfall`, `מפל מים`,
 * `volcanic crater`), and they license exactly one extra variant of OUR name: the one with the
 * feature-type words taken out. See `nameVariants`' third clause for why only our side.
 */
export function descriptorAwareSimilarity(
  ourName: string,
  candidateName: string,
  classNouns: readonly string[] | undefined,
): number {
  return similarityAgainst(ourName, candidateName, classNouns);
}

function similarityAgainst(
  a: string,
  b: string,
  classNouns: readonly string[] | undefined,
): number {
  let best = 0;
  for (const left of nameVariants(a, classNouns)) {
    for (const right of nameVariants(b)) {
      best = Math.max(best, tokenSimilarity(left, right));
      if (best === 1) return best;
    }
  }
  return best;
}

/**
 * The forms of a name worth comparing: the raw string, plus one per documented mismatch class.
 * Deduped and de-emptied, so the ordinary name costs exactly one comparison.
 *
 * **1. A PARENTHETICAL ALIAS IS NOT PART OF THE NAME** (owner report, 2026-08-08: Frankfurt
 * Airport never matched). Google returns `נמל התעופה של פרנקפורט (Frankfurter Flughafen – FRA)`,
 * which tokenizes to SEVEN tokens against Wikidata's four — measured overlap **0.756**, just
 * under `MATCH_MIN_NAME_SIMILARITY`, so the entity was read and then refused. The three extra
 * tokens are a second name for the same place, and a name written twice must not score lower
 * than a name written once. Kept as a variant rather than replacing the raw form, because the
 * parenthetical sometimes IS the discriminating part (`Terminal 1 (Departures)`).
 *
 * **2. A LETTER THAT IS NOT AN ACCENTED LETTER DOESN'T FOLD** (field report #29). `tokenize`'s
 * `NFD` + `\p{M}` fold rescues `Sensō-ji`/`Sensoji` because a macron is a combining mark; `ð`,
 * `þ`, `ø`, `ß` are letters in their own right and decompose to themselves, so `Gießen` never
 * meets Google's own `Giessen` and the two score 0 on the syllable they agree about. See
 * `NON_DECOMPOSING_LATIN`.
 *
 * Both are cross-producted rather than applied to one side: the alias may be on either name,
 * and it is as often Wikidata that keeps the local spelling as it is Google.
 *
 * **3. GOOGLE APPENDS THE FEATURE'S OWN TYPE TO A LABEL THAT OMITS IT** (field reports #29/#41,
 * ADR-0166 §22). `Brúarfoss Waterfall` against `Brúarfoss`, `Kerið Crater` against `Kerið`,
 * `מפלי גולפוס` against `גאלפוס` — one shared token over `sqrt(2 × 1)` is 0.707, under the
 * floor, on two names that name the same thing. The word that makes the difference is the
 * candidate's own `P31` class, so this variant only exists when the caller supplies those class
 * labels: it is not "drop the last word", it is "drop the word that names what this candidate
 * is". `Tsukiji Outer Market` keeps refusing `Tsukiji`, because a `chōchō` is not an outer
 * market.
 *
 * **Only ever OUR name is stripped**, which is `nameCanRefuse`'s direction guard restated: strip
 * a candidate's type word too and `Piccadilly Circus tube station` becomes `Piccadilly Circus
 * tube` — 0.816 against the square, and §16's defect is back.
 */
function nameVariants(name: string, classNouns?: readonly string[]): string[] {
  const written = [name, stripParenthetical(name)];
  if (classNouns?.length) {
    for (const form of [...written]) {
      const stripped = stripClassNouns(form, classNouns);
      if (stripped) written.push(stripped);
    }
  }
  return [...new Set([...written, ...written.map(transliterate)])].filter((v) => v.length > 0);
}

/** The name with every word that names the candidate's own type removed — or `undefined` when
 *  that would leave nothing, which is the `Waterfall`-saved-as-`Waterfall` case and is not a
 *  name at all. */
function stripClassNouns(name: string, classNouns: readonly string[]): string | undefined {
  const nouns = new Set(classNouns.flatMap((noun) => [...tokenize(noun)]));
  if (nouns.size === 0) return undefined;
  const kept = [...tokenize(name)].filter(
    (token) => ![...nouns].some((noun) => namesClass(noun, token)),
  );
  return kept.length > 0 && kept.length < tokenize(name).size ? kept.join(' ') : undefined;
}

/**
 * **Is `token` the word for this class?** An inflection of it, or the same word spelled the way
 * the other language spells it — `Strokkur Geysir` against a class Wikidata calls `geyser` is
 * one edit, and refusing over that would be `tokensNear`'s own lesson unlearned one line later.
 */
const namesClass = (noun: string, token: string): boolean =>
  isInflectionOf(noun, token) || tokensNear(noun, token);

/**
 * Is `token` the class noun `noun` in some inflected form?
 *
 * A prefix plus at most two letters, which is what a plural or a construct state costs:
 * `waterfall`/`waterfalls`, `beach`/`beaches`, `מפל`/`מפלי`. Deliberately not an edit distance —
 * `park`/`part` differ by one letter and are different words, while every inflection this needs
 * to catch grows at the end.
 */
function isInflectionOf(noun: string, token: string): boolean {
  if (noun === token) return true;
  const [short, long] = noun.length <= token.length ? [noun, token] : [token, noun];
  return short.length >= 3 && long.length - short.length <= 2 && long.startsWith(short);
}

/** A trailing/embedded `(…)` or `[…]` segment — an alias Google appends, not a name. */
const PARENTHETICAL = /[([][^)\]]*[)\]]/gu;

const stripParenthetical = (name: string): string => name.replace(PARENTHETICAL, ' ').trim();

/**
 * **Latin letters that survive `tokenize`'s diacritic fold untouched**, with the plain spelling
 * the English-speaking world writes them as. Every entry was checked in the runtime: unlike
 * `ō`/`é`/`å`, none of these has a combining-mark decomposition to strip.
 *
 * A curated table rather than a transliteration dependency — the class is small and closed, and
 * a general romanizer would bring opinions about scripts this function deliberately does not
 * compare at all (`namesComparable` sets a Hebrew name against a Japanese one aside; it must not
 * quietly start "reading" one).
 *
 * **It cannot manufacture a false match on its own** — the same property that makes the
 * parenthetical variant safe. It only ever spells one side the way the other already does, and
 * a name that clears `MATCH_MIN_NAME_SIMILARITY` on the strength of it still faces the distance
 * veto in `nameProximityConfidence`, which refuses a same-named place 9,000km away.
 */
const NON_DECOMPOSING_LATIN: Readonly<Record<string, string>> = {
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'Th',
  æ: 'ae',
  Æ: 'Ae',
  œ: 'oe',
  Œ: 'Oe',
  ø: 'o',
  Ø: 'O',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ß: 'ss',
  ẞ: 'SS',
};

const NON_DECOMPOSING_LATIN_PATTERN = new RegExp(
  `[${Object.keys(NON_DECOMPOSING_LATIN).join('')}]`,
  'gu',
);

const transliterate = (name: string): string =>
  name.replace(NON_DECOMPOSING_LATIN_PATTERN, (letter) => NON_DECOMPOSING_LATIN[letter] ?? letter);

function tokenSimilarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) return 0;

  const joined = (tokens: Set<string>) => [...tokens].join('');
  if (joined(left) === joined(right)) return 1;

  const { exact, near } = sharedTokens(left, right);
  const shared = exact + near * NEAR_TOKEN_CREDIT;
  // The **geometric mean** of the two coverages, not overlap against the smaller set.
  // Both halves have to be answered: `Meiji Shrine` inside `Meiji Jingū / Meiji Shrine` is
  // a strong match (0.82) and `Tsukiji` inside `Tsukiji Outer Market` is a weak one (0.58),
  // and dividing by the smaller set alone scores both a perfect 1 — which would have let a
  // one-word prefix match anything that starts with it.
  return shared / Math.sqrt(left.size * right.size);
}

/**
 * How many of `left`'s words `right` also says — **exact matches first**, so a near match can
 * never consume the token an exact one needed, and each token on the right is spent once.
 *
 * Counted apart, because they are not worth the same: see `NEAR_TOKEN_CREDIT`.
 */
function sharedTokens(left: Set<string>, right: Set<string>): { exact: number; near: number } {
  const unspent = [...right].filter((token) => !left.has(token));
  const exact = [...left].filter((token) => right.has(token)).length;
  let near = 0;
  for (const token of left) {
    if (right.has(token)) continue;
    const at = unspent.findIndex((other) => tokensNear(token, other));
    if (at >= 0) {
      unspent.splice(at, 1);
      near += 1;
    }
  }
  return { exact, near };
}

/**
 * **What a word spelled two ways is worth against the same word spelled once**, and the number
 * is chosen so that **a lone near-spelled word can never carry a match**: below
 * `MATCH_MIN_NAME_SIMILARITY`, so a one-word name agreeing only by spelling scores under the
 * floor and the name refuses exactly as it did before.
 *
 * Measured, not picked. `Kensington` and `Kennington` are two real London places one edit apart
 * and **4.9km apart** — inside `MATCH_FAR_METERS`, so the distance veto does NOT save them, and
 * at full credit they score 0.652 and match each other. That is the false positive this rule
 * would otherwise buy, and it is not affordable (§5.5: no enrichment beats wrong enrichment).
 *
 * So a spelling variant **corroborates and never carries**: it lifts a multi-word name that
 * agrees about its other words (`Wat Phra Kaew` / `Wat Phra Keo` → 0.92), and it lets
 * `nameCanRefuse` see that `מפלי גולפוס` does not contradict `גאלפוס` — after which the distance
 * answers alone, under the `geosearch` ceiling, which is precisely where §21 put Kerið.
 */
const NEAR_TOKEN_CREDIT = 0.75;

/**
 * **The same word, transliterated twice** (field report #41, ADR-0166 §22).
 *
 * Google's Hebrew for Gullfoss is `גולפוס`; Wikidata's Hebrew label is `גאלפוס`; the Hebrew
 * Wikipedia calls its article `גוטלפוס`. Three spellings of one Icelandic word, and token-set
 * overlap scores every pair of them **0** — the same "different alphabet reads as wrong place"
 * mistake §15 fixed for scripts, one level down at the word. There is no folding table for this:
 * the variance is in how a language without those sounds writes them down, and it is the normal
 * case for every place whose name reached Hebrew, Cyrillic, Greek, Thai or Arabic by ear.
 *
 * **Tight on purpose, because this is the one rule here that can invent a match.** A word has to
 * be long enough that a single-letter difference is unlikely to be a different word: five letters
 * for one edit, eight for two. That is what keeps `Bali` and `Bari`, `Ueno` and `Ueda`, `park`
 * and `part` apart — all four are too short to qualify at all. Everything that clears it still
 * faces the distance veto, which refuses a same-named place 9,000 km away.
 */
export function tokensNear(a: string, b: string): boolean {
  if (a === b) return true;
  const shortest = Math.min(a.length, b.length);
  const budget = shortest >= 8 ? 2 : shortest >= 5 ? 1 : 0;
  if (budget === 0 || Math.abs(a.length - b.length) > budget) return false;
  return editDistanceWithin(a, b, budget);
}

/** Levenshtein, abandoned as soon as it exceeds `budget` — the strings here are single words
 *  and the budget is 1 or 2, so this never walks a full matrix. */
function editDistanceWithin(a: string, b: string, budget: number): boolean {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    if (Math.min(...row) > budget) return false;
    previous = row;
  }
  return previous[b.length]! <= budget;
}

/** Words worth comparing. Folds diacritics, splits on non-alphanumerics so `Sensō-ji` →
 *  `senso`, `ji`, and keeps Unicode letters so a Hebrew or Japanese name tokenizes at all
 *  — Google returns Hebrew names where it has one (ADR-0108), so a Latin-only matcher
 *  would refuse every place the app actually saves. */
function tokenize(name: string): Set<string> {
  return new Set(
    normalizeSearchTerm(name)
      // NFD splits a letter from its accent; dropping the combining marks leaves the
      // letter. Harmless on scripts that have none.
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

/** 0–1 proximity credit: full inside `MATCH_NEAR_METERS`, decaying linearly to nothing at
 *  `MATCH_FAR_METERS`. */
export function proximityScore(distanceMeters: number): number {
  if (distanceMeters <= MATCH_NEAR_METERS) return 1;
  if (distanceMeters >= MATCH_FAR_METERS) return 0;
  return 1 - (distanceMeters - MATCH_NEAR_METERS) / (MATCH_FAR_METERS - MATCH_NEAR_METERS);
}

export interface ProximityConfidence {
  confidence: number;
  nameSimilarity: number;
  distanceMeters?: number;
}

/** A candidate's name, with the labels of the classes it is an instance of when the caller has
 *  read them — the input to `nameVariants`' feature-type clause (§22). Absent means "not looked
 *  up", which scores exactly as this file did before that clause existed. */
export interface CandidateName {
  name: string;
  classNouns?: readonly string[];
}

/**
 * Confidence for the **last-resort** route (§12.3): name similarity plus distance, capped
 * below what an exact identity join scores so an alias or a `wikidata` tag always outranks
 * the best possible guess.
 */
export function nameProximityConfidence(
  place: { name: string; lat?: number; lng?: number },
  candidate: CandidateName & { lat?: number; lng?: number },
): ProximityConfidence {
  const similarity = descriptorAwareSimilarity(place.name, candidate.name, candidate.classNouns);
  const from = asLatLng(place);
  const to = asLatLng(candidate);

  // **A CANDIDATE WITH NO COORDINATES, WHEN WE KNOW WHERE OUR PLACE IS, IS PROBABLY NOT A
  // PLACE AT ALL** (owner, 2026-08-05: _"Piccadilly Circus matched a song instead of the
  // place"_). On Wikidata a real place carries `P625` as a matter of course, so an item with
  // none — while we hold a Google pin for ours — is evidence about its **kind**: a song, an
  // album, a film, a book named after the place. And its name matches perfectly, which is
  // exactly what made it win: 1.0 × `NO_PROXIMITY_FACTOR` = 0.8, comfortably over the threshold.
  //
  // This is the asymmetry the branch below missed. "Absence of evidence is not evidence" is
  // right when OUR side has no coordinates (a coordless Place-lite, §10) and wrong here, where
  // the absence is the candidate's and is itself informative. Structural rather than a curated
  // "not a place" type list, which would need a QID for every song, album, film and novel.
  //
  // Refusing costs nothing now that the coordinate-first route exists (§15): if the real
  // Piccadilly Circus is not what the name search returned, the geosearch finds it.
  if (from && !to) return { confidence: 0, nameSimilarity: similarity };

  if (!from || !to) {
    return {
      confidence:
        similarity < MATCH_MIN_NAME_SIMILARITY
          ? 0
          : clampToFuzzyCeiling(similarity * NO_PROXIMITY_FACTOR),
      nameSimilarity: similarity,
    };
  }

  const distanceMeters = haversineMeters(from, to);
  // **The name has to carry it.** Proximity is 35% of the blend and for anything AT the place
  // that 35% is free — a station inside a square shares the pin — so a candidate whose name is
  // ours plus a qualifying noun could clear the threshold on evidence that never distinguished
  // the two. Checked here rather than folded into the weights so the refusal is legible, and
  // AFTER the distance so the evidence still records how far away it was.
  if (similarity < MATCH_MIN_NAME_SIMILARITY) {
    return { confidence: 0, nameSimilarity: similarity, distanceMeters };
  }
  // **Coordinates that contradict veto the name; coordinates we don't have merely fail to
  // corroborate it.** Absence of evidence is not evidence, so a coordless Place-lite can
  // still match on a strong name above — but a place with the exact same name 9,000 km away
  // is a different place, and "Sensō-ji" scores a perfect 1 against the one in Paris.
  // Without the veto, a name-only match clears the threshold on its own.
  if (distanceMeters >= MATCH_FAR_METERS) {
    return { confidence: 0, nameSimilarity: similarity, distanceMeters };
  }
  const blended = NAME_WEIGHT * similarity + (1 - NAME_WEIGHT) * proximityScore(distanceMeters);
  return { confidence: clampToFuzzyCeiling(blended), nameSimilarity: similarity, distanceMeters };
}

/* ── THE COORDINATE-FIRST ROUTE (ADR-0166 §15) ─────────────────────────────────────────────
   Everything above finds a candidate **by name** and lets the coordinates corroborate it. That
   has a recall hole with a hard floor: a name search only ever reaches an item labelled in a
   language we thought to ask for, and the app saves Hebrew names (Google is asked with
   `languageCode=he`) for places whose Wikidata items are often labelled only in English or
   Japanese. So the route below inverts the roles — **the coordinates find it and the name
   checks it** — which is the right order for a place the user picked off a map.

   The whole subtlety is in one rule:

   > **A name comparison across disjoint scripts is UNINFORMATIVE, not negative.**

   `nameSimilarity` returns 0 for "these are different places" and 0 for "these are the same
   place written in two alphabets", and treating the second as the first is precisely the bug
   that made the first live run return `not_found` for `מגדל אייפל`. So the scripts are checked
   before the score is believed: when they overlap, a disagreeing name still refuses the
   candidate; when they do not, the name is set aside and the distance answers alone — under a
   lower ceiling, because a claim nothing corroborated is a weaker claim. */

/** Scripts we can tell apart, which is all we need: the question is only whether two names
 *  are written in the same alphabet, never which alphabet that is. */
const SCRIPT_PATTERNS: Readonly<Record<string, RegExp>> = {
  latin: /\p{Script=Latin}/u,
  hebrew: /\p{Script=Hebrew}/u,
  arabic: /\p{Script=Arabic}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  greek: /\p{Script=Greek}/u,
  // Japanese mixes three and Chinese shares one of them, so the CJK block is treated as one
  // script: a name in kana and a label in kanji are the same alphabet for this purpose.
  cjk: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u,
  thai: /\p{Script=Thai}/u,
  devanagari: /\p{Script=Devanagari}/u,
};

/** Which of those a name uses. Digits and punctuation are deliberately not scripts: `7-Eleven`
 *  and `7-אלוון` share their numerals and nothing that tells us they are the same place. */
export function scriptsOf(name: string): Set<string> {
  const found = new Set<string>();
  for (const [script, pattern] of Object.entries(SCRIPT_PATTERNS)) {
    if (pattern.test(name)) found.add(script);
  }
  return found;
}

/**
 * **Can these two names be compared at all?** True when they share at least one script.
 *
 * A name with no recognised script on either side (pure digits, an emoji) answers `false`: we
 * cannot read it either, and pretending we can is the failure this exists to prevent.
 */
export function namesComparable(a: string, b: string): boolean {
  const left = scriptsOf(a);
  if (left.size === 0) return false;
  for (const script of scriptsOf(b)) if (left.has(script)) return true;
  return false;
}

/**
 * **May this name REFUSE the candidate the coordinates found?** (owner report, 2026-08-11:
 * Kerið still matched nothing.)
 *
 * §15 established that a name comparison can be *uninformative* rather than negative, and set
 * one case aside: disjoint scripts. **There is a second, and it was measured on Kerið.** Google
 * saves `Kerið Crater`; Wikidata's label for the same entity (`Q1435393`, sitting ~100m from the
 * pin and the only article within 150m of it) is `Kerið`. One shared token over `sqrt(2 × 1)` is
 * **0.707**, under `MATCH_MIN_NAME_SIMILARITY`, so the name vetoed the one candidate the
 * coordinates had found — and the identical entity would have matched at 0.8 had our name been
 * in Hebrew, because then nothing would have been readable enough to refuse it. **A name that
 * half-agrees was worse evidence than no readable name at all**, which cannot be right.
 *
 * So the rule §15 states for scripts is stated once more for words:
 *
 * > **A name that says strictly MORE than the candidate's has not disagreed with it.**
 *
 * `Kerið Crater` contains everything `Kerið` says and adds the feature's own type. That is a
 * failure to discriminate, not a contradiction, and the honest answer is to set the name aside
 * and let the distance answer alone — under the `geosearch` ceiling, with the broader-subject
 * skip and the ambiguity refusal still standing behind it, exactly as for a name we cannot read.
 *
 * **Two guards keep this from becoming §15's own false positive**, and both are load-bearing:
 *
 *  - **Direction.** Only OUR name may say more. A *candidate* whose name is ours plus a
 *    qualifying noun is the documented Piccadilly Circus failure — the tube station under the
 *    square, the shop inside the mall — and `MATCH_MIN_NAME_SIMILARITY` exists to refuse it at
 *    that same 0.707. It still does: `Piccadilly Circus` does not contain
 *    `Piccadilly Circus tube station`.
 *  - **Only where the name was going to refuse anyway.** At or above the floor the name is
 *    corroborating and keeps deciding, so `Meiji Jingū / Meiji Shrine` against `Meiji Shrine`
 *    (0.816, which §12.3 says must survive) is untouched and still scores on the name route
 *    rather than being demoted to distance.
 *
 * Asymmetric, so the argument order is the whole meaning: **ours first, theirs second.**
 */
export function nameCanRefuse(ourName: string, candidate: CandidateName | string): boolean {
  const { name, classNouns } = typeof candidate === 'string' ? { name: candidate } : candidate;
  if (!namesComparable(ourName, name)) return false;
  if (descriptorAwareSimilarity(ourName, name, classNouns) >= MATCH_MIN_NAME_SIMILARITY) {
    return true;
  }
  return !surplusIsOnlyTypeWords(ourName, name, classNouns);
}

/**
 * **Does our name say all of theirs, and add nothing but the word for what they ARE?**
 *
 * §21 asked only the first half — "does ours contain theirs and more?" — and the second half is
 * what a **measured false positive** put here (§22). `בית קפה גולפוס`, a café named after the
 * waterfall, contains `גולפוס` and adds more, exactly as `מפלי גולפוס` does; both sit inside
 * `GEO_TRUST_METERS` of the waterfall's own coordinate, so setting the name aside for both hands
 * the café the waterfall's article and photograph. Distance cannot separate them and was never
 * going to.
 *
 * **The surplus words are what separates them, and Rule 1c already knows how to read them.** A
 * waterfall's class is called `waterfall` / `מפל מים`, so `מפלי` is a type word and `בית`/`קפה`
 * are not. So §21's Rule 1b and §22's Rule 1c are one rule with one test:
 *
 * > **a word of OURS that names what the candidate IS has not disagreed with it — and every
 * > other extra word HAS.**
 *
 * Its default is the safe one: told nothing about the candidate's type, there is no word that
 * can be surplus, so the name refuses exactly as it did before §21 — and the caller that could
 * have looked the type up is the one route that ever needs this (`descriptorCouldRescue`).
 */
function surplusIsOnlyTypeWords(
  ours: string,
  theirs: string,
  classNouns: readonly string[] | undefined,
): boolean {
  const typeWords = new Set((classNouns ?? []).flatMap((noun) => [...tokenize(noun)]));
  if (typeWords.size === 0) return false;
  for (const mine of nameVariants(ours, classNouns)) {
    const left = tokenize(mine);
    for (const yours of nameVariants(theirs)) {
      const right = tokenize(yours);
      if (right.size === 0 || left.size <= right.size) continue;
      // Containment counts words, not credit: "did our name say all of theirs?" is a yes/no
      // question, and a word we spell differently is still a word we said.
      const { exact, near } = sharedTokens(right, left);
      if (exact + near < right.size) continue;
      const surplus = [...left].filter(
        (token) => ![...right].some((word) => tokensNear(token, word)),
      );
      if (surplus.every((token) => [...typeWords].some((word) => namesClass(word, token)))) {
        return true;
      }
    }
  }
  return false;
}

/** Full distance credit inside this radius, for a candidate the coordinates found. Tighter
 *  than `MATCH_NEAR_METERS` by an order of magnitude, and it has to be: that radius is what a
 *  *name* match is allowed to be wrong by, whereas here the distance is carrying the match on
 *  its own. */
const GEO_TRUST_METERS = 150;

/** **What an airport is allowed to be wrong by** (§20, owner report: Bangkok never matched).
 *
 *  Every radius above is calibrated for a place you can stand in front of. An airport is not
 *  that: its Wikidata coordinate is a centroid over several square kilometres, and the pin
 *  Google gives us is a terminal door — measured at 1.1–1.4km apart on three airports (session
 *  225) and larger still at a Suvarnabhumi. At 150m the coordinate route could never confirm
 *  one, which is why airports fell through every route the pipe had.
 *
 *  **Earned by the candidate's own `P31`, not by our name.** The airport class is a fact we
 *  read off the item, so this can only widen the radius for something that IS an airport —
 *  a hotel 2km away is scored at the ordinary distances and still refused. That is what keeps
 *  this a category allowance rather than a loosening. */
const AIRPORT_TRUST_METERS = 3000;

/** Where an airport's distance credit runs out. Past this the coordinate is not corroborating
 *  anything — two airports 8km apart are two airports. */
const AIRPORT_FAR_METERS = 8000;

/**
 * Confidence for the coordinate-first route: the distance found it, and the name is a check
 * that can only refuse, never promote.
 *
 * - **The name may refuse** → exactly the name route's arithmetic, so a candidate whose name
 *   disagrees is refused just as it would be if the name had done the finding. The nearest
 *   article to a ramen bar is often the district it sits in, and that is a real refusal.
 * - **The name may not** — a script we cannot compare, or a name of ours that only says more
 *   than theirs (`nameCanRefuse`) → distance alone, capped at the `geosearch` ceiling. Nothing
 *   contradicted us and nothing corroborated us either.
 */
export function geoProximityConfidence(
  place: { name: string; lat?: number; lng?: number },
  candidate: CandidateName & { lat?: number; lng?: number; isAirport?: boolean },
): ProximityConfidence {
  const from = asLatLng(place);
  const to = asLatLng(candidate);
  // The route does not exist without both: it is the coordinates that are doing the work.
  if (!from || !to) return { confidence: 0, nameSimilarity: 0 };

  const distanceMeters = haversineMeters(from, to);
  // **The name still wins when it can be read** — but an airport's ordinary distance veto is
  // the wrong ruler even then, since `nameProximityConfidence` refuses past `MATCH_FAR_METERS`
  // on a centroid that is legitimately kilometres from the door.
  if (nameCanRefuse(place.name, candidate) && !candidate.isAirport) {
    return nameProximityConfidence(place, candidate);
  }
  return {
    confidence: Math.min(
      candidate.isAirport ? airportScore(distanceMeters) : geoOnlyScore(distanceMeters),
      MATCH_METHOD_CONFIDENCE.geosearch,
    ),
    // Zero because it was not compared, which is a different fact from "compared and did not
    // match" — the stored evidence has to be able to say which happened (§12.3).
    nameSimilarity: 0,
    distanceMeters,
  };
}

/**
 * **More than one thing at the pin, and nothing readable to tell them apart** (owner report,
 * 2026-08-05). When the name cannot arbitrate — disjoint scripts — distance is the only
 * evidence, and distance cannot separate two subjects that share a coordinate: the Underground
 * station's article sits exactly on the square's. Picking the nearest is then a coin toss
 * dressed as a match, and §5.5's rule applies without qualification: no enrichment beats wrong
 * enrichment.
 *
 * Only bites the uncorroborated path. With a readable name, several candidates at the pin are
 * not ambiguous at all — the one whose name agrees wins, which is exactly what should happen.
 */
export function coordinatesAreAmbiguous(distancesMeters: readonly number[]): boolean {
  return distancesMeters.filter((d) => d <= GEO_TRUST_METERS).length > 1;
}

/** An airport's own ruler: full credit out to `AIRPORT_TRUST_METERS`, decaying to nothing at
 *  `AIRPORT_FAR_METERS`. Same shape as `geoOnlyScore`, three numbers apart. */
function airportScore(distanceMeters: number): number {
  if (distanceMeters <= AIRPORT_TRUST_METERS) return MATCH_METHOD_CONFIDENCE.geosearch;
  if (distanceMeters >= AIRPORT_FAR_METERS) return 0;
  const span = AIRPORT_FAR_METERS - AIRPORT_TRUST_METERS;
  return MATCH_METHOD_CONFIDENCE.geosearch * (1 - (distanceMeters - AIRPORT_TRUST_METERS) / span);
}

/** Distance as the whole evidence: full inside `GEO_TRUST_METERS`, decaying to nothing at
 *  `MATCH_NEAR_METERS`, where a name match's own "same spot" radius ends. */
function geoOnlyScore(distanceMeters: number): number {
  if (distanceMeters <= GEO_TRUST_METERS) return MATCH_METHOD_CONFIDENCE.geosearch;
  if (distanceMeters >= MATCH_NEAR_METERS) return 0;
  const span = MATCH_NEAR_METERS - GEO_TRUST_METERS;
  return MATCH_METHOD_CONFIDENCE.geosearch * (1 - (distanceMeters - GEO_TRUST_METERS) / span);
}

/**
 * **The name alone, for a cheap pre-filter** — which is a different question from
 * `nameProximityConfidence` and must not be answered by it.
 *
 * A search response carries no coordinates, so passing its hits through the full scorer would
 * hit the "candidate has none" veto above and reject **every** candidate before the entity that
 * carries the coordinate is ever read. That veto is about a real item's real absence of `P625`;
 * a search hit's absence is an artefact of the endpoint.
 */
export function nameOnlyConfidence(place: { name: string }, candidateName: string): number {
  return clampToFuzzyCeiling(nameSimilarity(place.name, candidateName) * NO_PROXIMITY_FACTOR);
}

const asLatLng = (p: { lat?: number; lng?: number }): LatLng | undefined =>
  p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : undefined;

const clampToFuzzyCeiling = (score: number): number =>
  Math.min(score, MATCH_METHOD_CONFIDENCE.name_proximity);

/** Does this confidence clear the bar, or is the honest answer "we don't know"? (§5.5) */
export function isMatchConfident(confidence: number): boolean {
  return confidence >= MATCH_CONFIDENCE_THRESHOLD;
}

/**
 * **Wikidata types whose article describes something broader than a place you visit**
 * (ADR-0166 §11.2). Curated, and extended as cases appear — this is the deny-list form of
 * the granularity check, and it fails **safe in both directions**: a type missing from it
 * means we accept a summary we might have refused (today's behaviour), and a wrong QID in
 * it means we refuse one we could have kept. Neither can attach the wrong photo.
 *
 * Each entry traces to a measured case or to one the ADR names:
 *   - watercourses — **Meguro River** resolved to the whole river rather than the
 *     canal-side spot people actually go to, and **Canal Saint-Martin** likewise;
 *   - chains — "a chain for a branch";
 *   - settlements and districts — "a district for a shop".
 *
 * Deliberately NOT here: anything a traveller visits as itself. A temple, a park, a
 * museum, a crossing, a market are all specific, and 14 of 14 landmark sights matched
 * correctly (§11.3) — so this list must stay small or it will start refusing the summaries
 * the feature is for.
 */
export const BROADER_INSTANCE_OF_QIDS: Readonly<Record<string, string>> = {
  Q4022: 'river',
  Q355304: 'watercourse',
  Q12284: 'canal',
  Q507619: 'chain store',
  Q486972: 'human settlement',
  Q56061: 'administrative territorial entity',
  Q123705: 'neighborhood',
  Q188509: 'suburb',
  Q515: 'city',
  Q3957: 'town',
  // **The districts this list already meant and did not name** (2026-08-11). Checked against
  // live Wikidata while measuring `nameCanRefuse`: Tokyo's districts carry none of the classes
  // above — `Tsukiji` is a `chōchō` (Q5327369), `Ueno` adds `city center`, `Shibuya` is a
  // `ward`/`special ward` — so "a district for a shop" was landing unrefused for exactly the
  // city the coverage spike was built on. Each is a subdivision of a city, which is the same
  // fact `neighborhood` and `suburb` state for other countries.
  Q5327369: 'chōchō (Japanese city subdivision)',
  Q5327704: 'special ward of Japan',
  Q137773: 'ward of Japan',
  Q1468524: 'city center',
};

/**
 * **Wikidata types that make an entity an airport** (ADR-0166 §18, field report #7).
 *
 * The guard in front of `P238` (IATA) and `P931` (place served), and it exists for one
 * measured hazard: **London's city entity `Q84` carries `P238 = LON`** — a real metropolitan
 * IATA code — and a name search for a trip's `לונדון` finds it. Without a class check the pipe
 * would label a city with an airport code and, worse, would do it confidently.
 *
 * Curated QIDs rather than a `P279*` subclass walk, matching `BROADER_INSTANCE_OF_QIDS` above:
 * the traversal needs SPARQL (a second endpoint, a second failure mode) to answer a question
 * whose real answer is four entries long. It fails **safe in both directions** — a class
 * missing from this list means an airport gets no code (today's behaviour, which is a label
 * that stays as it is), and a wrong QID in it means we read `P238` off something that does not
 * have one, and get nothing.
 */
export const AIRPORT_INSTANCE_OF_QIDS: Readonly<Record<string, string>> = {
  Q1248784: 'airport',
  Q644371: 'international airport',
  Q62447: 'aerodrome',
  Q1774898: 'regional airport',
};

/** Is this candidate an airport — i.e. may its `P238`/`P931` be believed? */
export function isAirportEntity(instanceOf: readonly string[]): boolean {
  return instanceOf.some((qid) => qid in AIRPORT_INSTANCE_OF_QIDS);
}

/** Wikidata properties that say the entity **has ended**. A dissolved entity's article is
 *  history, not a description of the place standing there now — which is exactly the
 *  **Tsukiji Outer Market** case (§11.2): the match resolves to the former *wholesale*
 *  market, closed and moved, and the summary would describe a different place entirely. */
export const DISSOLVED_PROPERTIES = ['P576', 'P3999'] as const;

export interface GranularityInput {
  /** The candidate's `instance of` (`P31`) QIDs. */
  instanceOf: readonly string[];
  /** Which of `DISSOLVED_PROPERTIES` the candidate carries a claim for. */
  endedProperties?: readonly string[];
}

/**
 * The per-field refusals a candidate's granularity earns (§11.2).
 *
 * Both signals refuse **`summary` only**, and both are name-independent — which matters,
 * because Meguro River's saved name and the river's label are *identical*. A rule that
 * asked "does the name differ?" would have let exactly the measured case through.
 * The image stays acceptable because a photograph of the river is a photograph of the
 * place, which is the asymmetry per-field precedence exists to express.
 */
export function granularityRefusals(
  candidate: GranularityInput,
): Partial<Record<EnrichmentField, MatchRefusal>> {
  const isBroaderType = candidate.instanceOf.some((qid) => qid in BROADER_INSTANCE_OF_QIDS);
  const hasEnded = (candidate.endedProperties ?? []).length > 0;
  return isBroaderType || hasEnded
    ? { [ENRICHMENT_FIELD.SUMMARY]: MATCH_REFUSAL.BROADER_TYPE }
    : {};
}
