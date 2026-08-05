// The provider contract (ADR-0166 §5). Backend-only vocabulary on purpose: a provider is
// an outbound HTTP client, and nothing on the frontend has one — what crosses the layer
// boundary is the *stored value* and its provenance, which live in `@waypoint/shared`.
import type {
  EnrichmentField,
  EnrichmentSource,
  MatchMethod,
  MatchRefusal,
  SourcePolicy,
} from '@waypoint/shared';

/**
 * What a provider gets to match on — and nothing else.
 *
 * No `tripId`, no `Place` row, no trip knowledge of any kind (§5.3): a provider is pure
 * `(identity) → match → fields`, which is what makes it unit-testable against recorded
 * fixtures and what keeps the store global. The trip's own opinion of the place (`icon`,
 * `category`, a renamed `name`) is deliberately not here — it is not a fact about the
 * world, and a provider that could see it could be influenced by it.
 */
export interface PlaceIdentity {
  /** The saved place's name. In production this is Google's, in Hebrew where Google has
   *  one (ADR-0108) — so a provider must not assume Latin script. */
  name: string;
  lat?: number;
  lng?: number;
  /** Aliases already settled for this place, from the store's own columns (§4) — an
   *  earlier pass's `wikidataQid` is what turns this pass's fuzzy match into an exact one. */
  googlePlaceId?: string;
  wikidataQid?: string;
  osmRef?: string;
  /** Wikidata `P18` — the Commons filename. **A pointer, not a value:** §11.1 requires
   *  reading the file's own license on Commons before anything is stored, so the image
   *  value is Commons' to produce (Phase 2) and this is what it follows. */
  commonsFilename?: string;
  /** Article titles per language, from the matched item's sitelinks. Absence is an answer:
   *  no `hewiki` sitelink means there is no Hebrew article, which is the case for 18 of 27
   *  Tokyo places (§11.5). */
  articleTitles?: Record<string, string>;
  /** **How much the provider that settled this identity trusted it.**
   *
   *  A downstream provider reaching an article or a file through a settled QID is making an
   *  exact join — but only to an item that may itself have been matched by name and
   *  proximity. So a summary or a photo inherits the *weakest* link in the chain rather than
   *  claiming the certainty of its own last hop; otherwise a fuzzy Wikidata match would
   *  launder itself into a confidence-1 photograph, which is precisely the "confidently
   *  wrong" failure §Context 3 is about. */
  identityConfidence?: number;
}

/**
 * The part of an identity a match can **contribute** — for the providers that run after it,
 * and (for the two aliases that are columns) for the store (§4: "`wikidataQid` — added when
 * Wikidata matches").
 *
 * This is what makes §12.3's match order performable: `QID → OSM wikidata tag` requires the
 * QID to exist before OSM is asked, so the Wikidata pass settles it and the identity flowing
 * forward is richer than the one the pass started with. It is a subset of `PlaceIdentity`
 * rather than a parallel type precisely so "accumulating identity" is a merge and not a
 * translation.
 */
export type SettledIdentity = Pick<
  PlaceIdentity,
  | 'wikidataQid'
  | 'osmRef'
  | 'lat'
  | 'lng'
  | 'commonsFilename'
  | 'articleTitles'
  | 'identityConfidence'
>;

/** The confidence a provider may claim for a value reached through a settled identity: its
 *  own exactness, capped by how much the identity itself was trusted. */
export function inheritedConfidence(identity: PlaceIdentity, own = 1): number {
  return Math.min(own, identity.identityConfidence ?? 1);
}

/** Merge what a match settled into the running identity, ignoring keys it had no answer
 *  for — a provider that returns `{ lat: undefined }` must not erase coordinates an earlier
 *  one established. */
export function mergeSettled(identity: PlaceIdentity, settled: SettledIdentity): PlaceIdentity {
  const merged = { ...identity };
  for (const [key, value] of Object.entries(settled)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/** Why we believe the match — stored with the value, because a bad match has to be
 *  diagnosable later instead of mysterious (§5.5). */
export interface MatchEvidence {
  /** The candidate's own label, so a wrong match is legible at a glance. */
  label?: string;
  /** 0–1 similarity between the place's name and the candidate's, when that was consulted. */
  nameSimilarity?: number;
  /** Metres between the place and the candidate, when both had coordinates. */
  distanceMeters?: number;
  /** The candidate's `instance of` claims — what the granularity check read (§11.2). */
  instanceOf?: string[];
}

/** A provider's answer to "is this the same real-world thing?" */
export interface ProviderMatch {
  /** The source's own id for the matched entity — a QID, an article title, `node/123`. */
  ref: string;
  method: MatchMethod;
  confidence: number;
  evidence: MatchEvidence;
  settled?: SettledIdentity;
  /** **Per-field refusals** (§11.2): the entity is right and its content still describes
   *  something broader or historical, so `summary` is refused while `image` is fine. A
   *  refusal of the *whole* candidate is a `null` match, not an entry here. */
  refusedFields?: Partial<Record<EnrichmentField, MatchRefusal>>;
}

/** A value a provider produced, before the orchestrator wraps it in provenance. The
 *  provider supplies only what it knows better than its own policy does — a per-file
 *  license (Commons), the credit target, the language of prose. */
export interface ProviderValue {
  value: string;
  /** Required on prose (§11.6). The orchestrator refuses to store text without it. */
  lang?: string;
  /** Overrides `SourcePolicy.license` — mandatory for Commons, whose license is per file. */
  license?: string;
  attribution?: string;
  /** Overrides `SourcePolicy.attributionRequired`, for a source where the obligation is also
   *  **per file** rather than per source. Commons is exactly that: 27 of 32 spike files
   *  require visible credit and 5 genuinely do not (2× CC0, 3× public domain, §12.2), and
   *  `extmetadata` says which. Absent = trust the source policy. */
  attributionRequired?: boolean;
  /** **This value's real payload is bytes, at an allowlisted URL.**
   *
   *  A provider never stores anything itself (§5.3 keeps it pure), so an image arrives as a
   *  *pointer plus the facts about it* and the orchestrator materializes it through the
   *  subject-agnostic image pipeline. The URL is validated against the allowlist before it is
   *  fetched — never followed because a response supplied it (§7). */
  binary?: {
    url: string;
    /** The dimensions of the bytes at `url` — for an `iiurlwidth` thumbnail, the bucket's
     *  own, not the original's. */
    width: number;
    height: number;
  };
}

export type ProviderFieldValues = Partial<Record<EnrichmentField, ProviderValue>>;

/**
 * One source, wired in by the registry (§5).
 *
 * The acceptance test for this whole design is §5.2: **adding a source is one file plus
 * one line per field it wins** in `FIELD_SOURCE_PRECEDENCE`. If a new source needs more
 * than that, this interface is wrong rather than the source being unusual.
 */
export interface EnrichmentProvider {
  readonly id: EnrichmentSource;
  /** Which fields this provider can supply a **storable value** for.
   *
   *  Legitimately empty: Wikidata provides no Tier-A value in Phase 1 and is still
   *  essential — it is the identity spine that settles the QID, the coordinates and the
   *  `P18` pointer for everyone downstream. */
  readonly provides: readonly EnrichmentField[];
  readonly policy: SourcePolicy;
  match(identity: PlaceIdentity): Promise<ProviderMatch | null>;
  fetch(match: ProviderMatch, fields: readonly EnrichmentField[]): Promise<ProviderFieldValues>;
}
