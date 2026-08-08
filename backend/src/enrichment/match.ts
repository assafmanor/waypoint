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
 */
export function nameSimilarity(a: string, b: string): number {
  // **A PARENTHETICAL ALIAS IS NOT PART OF THE NAME** (owner report, 2026-08-08: Frankfurt
  // Airport never matched). Google returns `נמל התעופה של פרנקפורט (Frankfurter Flughafen –
  // FRA)`, which tokenizes to SEVEN tokens against Wikidata's four — measured overlap
  // **0.756**, just under `MATCH_MIN_NAME_SIMILARITY`, so the entity was read and then
  // refused. The three extra tokens are a second name for the same place, and a name written
  // twice must not score lower than a name written once.
  //
  // Same shape as §15's cross-script bug — the search found the right item and the scoring
  // threw it away — so the fix is the same one: score every form the name offers and keep the
  // best, rather than trusting the single string we happen to hold.
  //
  // **It cannot manufacture a false match**, which is what makes it safe to do here rather
  // than at one call site: dropping a parenthetical only ever makes OUR name shorter and more
  // specific, and the distance veto in `nameProximityConfidence` still refuses a same-named
  // place 9,000km away. Scored as a max rather than replacing the raw form, because the
  // parenthetical sometimes IS the discriminating part (`Terminal 1 (Departures)`).
  return Math.max(
    tokenSimilarity(a, b),
    ...withoutParenthetical(a, b).map(([left, right]) => tokenSimilarity(left, right)),
  );
}

/** A trailing/embedded `(…)` or `[…]` segment — an alias Google appends, not a name. */
const PARENTHETICAL = /[([][^)\]]*[)\]]/gu;

const stripParenthetical = (name: string): string => name.replace(PARENTHETICAL, ' ').trim();

/** The de-parenthesised pairs worth also scoring — none when neither side has one, so the
 *  common case does no extra work. */
function withoutParenthetical(a: string, b: string): [string, string][] {
  const left = stripParenthetical(a);
  const right = stripParenthetical(b);
  if (left === a && right === b) return [];
  // Both sides stripped, and each side stripped alone: the alias may be on either name, and
  // `(Frankfurter Flughafen – FRA)` on ours must still meet a plain label on theirs.
  return [
    [left, right],
    [left, b],
    [a, right],
  ].filter(([l, r]) => l.length > 0 && r.length > 0) as [string, string][];
}

function tokenSimilarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) return 0;

  const joined = (tokens: Set<string>) => [...tokens].join('');
  if (joined(left) === joined(right)) return 1;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  // The **geometric mean** of the two coverages, not overlap against the smaller set.
  // Both halves have to be answered: `Meiji Shrine` inside `Meiji Jingū / Meiji Shrine` is
  // a strong match (0.82) and `Tsukiji` inside `Tsukiji Outer Market` is a weak one (0.58),
  // and dividing by the smaller set alone scores both a perfect 1 — which would have let a
  // one-word prefix match anything that starts with it.
  return shared / Math.sqrt(left.size * right.size);
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

/**
 * Confidence for the **last-resort** route (§12.3): name similarity plus distance, capped
 * below what an exact identity join scores so an alias or a `wikidata` tag always outranks
 * the best possible guess.
 */
export function nameProximityConfidence(
  place: { name: string; lat?: number; lng?: number },
  candidate: { name: string; lat?: number; lng?: number },
): ProximityConfidence {
  const similarity = nameSimilarity(place.name, candidate.name);
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

/** Full distance credit inside this radius, for a candidate the coordinates found. Tighter
 *  than `MATCH_NEAR_METERS` by an order of magnitude, and it has to be: that radius is what a
 *  *name* match is allowed to be wrong by, whereas here the distance is carrying the match on
 *  its own. */
const GEO_TRUST_METERS = 150;

/**
 * Confidence for the coordinate-first route: the distance found it, and the name is a check
 * that can only refuse, never promote.
 *
 * - **Names comparable** → exactly the name route's arithmetic, so a candidate whose name
 *   disagrees is refused just as it would be if the name had done the finding. The nearest
 *   article to a ramen bar is often the district it sits in, and that is a real refusal.
 * - **Names not comparable** → distance alone, capped at the `geosearch` ceiling. Nothing
 *   contradicted us and nothing corroborated us either.
 */
export function geoProximityConfidence(
  place: { name: string; lat?: number; lng?: number },
  candidate: { name: string; lat?: number; lng?: number },
): ProximityConfidence {
  const from = asLatLng(place);
  const to = asLatLng(candidate);
  // The route does not exist without both: it is the coordinates that are doing the work.
  if (!from || !to) return { confidence: 0, nameSimilarity: 0 };

  const distanceMeters = haversineMeters(from, to);
  if (namesComparable(place.name, candidate.name)) {
    return nameProximityConfidence(place, candidate);
  }
  return {
    confidence: Math.min(geoOnlyScore(distanceMeters), MATCH_METHOD_CONFIDENCE.geosearch),
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
