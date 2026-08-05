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

  if (!from || !to) {
    return {
      confidence: clampToFuzzyCeiling(similarity * NO_PROXIMITY_FACTOR),
      nameSimilarity: similarity,
    };
  }

  const distanceMeters = haversineMeters(from, to);
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
