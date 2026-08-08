// Place enrichment — the cross-layer vocabulary and the shape of what gets stored
// (ADR-0166, **read §11–§13**; the surface that renders it is ADR-0167).
//
// Two things here are load-bearing and cheap now / expensive later, which is why they
// are in Phase 1 before anything renders:
//
//  1. **`lang` is required on any value carrying prose, and a text field holds localized
//     VARIANTS rather than one value** (§11.6). Stored text whose language is unknown
//     cannot be marked, translated, or selected against a reader's locale. Retrofitting
//     the variants map would mean migrating every stored summary.
//  2. **Per-value provenance** (§4) — source, license, attribution, when, how confident.
//     It is what makes a source removable and what carries CC BY-SA's obligation on the
//     value that owes it. The store keeps this as one zod-validated JSON payload rather
//     than a column per field, because ~6 facts × every field × every source is a
//     migration treadmill for data nothing queries.
//
// Nothing here reads a clock: `enrichmentValueTtlMs` returns a duration and the caller
// (which owns `now`) compares against it, the same way `eventEndBoundary` stays
// clock-free.
import { z } from 'zod';

/** The sources ADR-0166 §2 tabulates, with what each is licensed for in
 *  `SOURCE_POLICY` below. All five are named here — not only Phase 1's two — because
 *  the policy table is what makes §2's "no Google-sourced value reaches the store"
 *  a **testable invariant** rather than a clause someone has to remember, and a
 *  `storable: false` entry is the thing that test needs. */
export const enrichmentSourceSchema = z.enum(['wikidata', 'wikipedia', 'commons', 'osm', 'google']);
export type EnrichmentSource = z.infer<typeof enrichmentSourceSchema>;

export const ENRICHMENT_SOURCE = {
  WIKIDATA: 'wikidata',
  WIKIPEDIA: 'wikipedia',
  COMMONS: 'commons',
  OSM: 'osm',
  GOOGLE: 'google',
} as const satisfies Record<string, EnrichmentSource>;

/** Tier A (ADR-0166 §3) — the fields a traveller can act on. Tier B (website, phone,
 *  price level, source-suggested types) and Tier C (`rating`) are recorded in the ADR
 *  and deliberately unbuilt.
 *
 *  **`iata` and `servedCity` are the airport pair** (ADR-0166 §18, field reports #7/#23).
 *  They are facts about the real-world entity — two trips cannot legitimately disagree
 *  that TLV serves Tel Aviv — so they belong in this global store rather than on the
 *  trip-scoped `Place` row, and they arrive from the same Wikidata item the identity pass
 *  already settles. */
export const enrichmentFieldSchema = z.enum(['image', 'summary', 'hours', 'iata', 'servedCity']);
export type EnrichmentField = z.infer<typeof enrichmentFieldSchema>;

export const ENRICHMENT_FIELD = {
  IMAGE: 'image',
  SUMMARY: 'summary',
  HOURS: 'hours',
  IATA: 'iata',
  SERVED_CITY: 'servedCity',
} as const satisfies Record<string, EnrichmentField>;

/** Fields whose value is a map of localized **variants** rather than one value (§11.6).
 *
 *  Named once, here, because four different places have to branch on it — the orchestrator's
 *  `wrap`, the freshness read below, the policy's source lookup and the delivered mapper —
 *  and each of them used to test `field === SUMMARY` inline. A second variant field is what
 *  turns that literal into a bug rather than a shortcut: a city name is prose in exactly the
 *  way a summary is (`תל אביב` / `Tel Aviv`), so it is stored the same way. */
export const TEXT_VARIANT_FIELDS = [
  ENRICHMENT_FIELD.SUMMARY,
  ENRICHMENT_FIELD.SERVED_CITY,
] as const satisfies readonly EnrichmentField[];

export function isTextVariantField(field: EnrichmentField): boolean {
  return (TEXT_VARIANT_FIELDS as readonly EnrichmentField[]).includes(field);
}

/** A BCP-47-ish language tag (`he`, `en`, `pt-BR`). Deliberately not an enum: the
 *  languages we hold are whatever the sources have articles in, which is not a set we
 *  get to choose or migrate. */
export const langCodeSchema = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'invalid lang');
export type LangCode = z.infer<typeof langCodeSchema>;

/** What a source is licensed for, per ADR-0166 §2's table.
 *
 *  `storable` is the whole point: a provider whose policy says `false` **cannot write to
 *  the store** (§2), which is one guard with one spec instead of a compliance question
 *  that depends on anyone remembering Google's caching terms. */
export interface SourcePolicy {
  /** The license the source's own content carries, or `null` when it is per-file and the
   *  value must supply its own (Commons — nine distinct strings in 32 files, §12.2). */
  readonly license: string | null;
  /** May a value from this source be written to the global store at all? (§2) */
  readonly storable: boolean;
  /** Does using a value from this source require visible credit? At 27 of 32 Commons
   *  files this is the **default**, not an edge case (§12.2), which is why ADR-0167 §4
   *  lays the credit line out first. */
  readonly attributionRequired: boolean;
  /** Ceiling on how long any value from this source is trusted. Composed with the
   *  per-field TTL below — see `enrichmentValueTtlMs`. */
  readonly defaultTtlMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const SOURCE_POLICY = {
  wikidata: {
    license: 'CC0',
    storable: true,
    attributionRequired: false,
    defaultTtlMs: 365 * DAY_MS,
  },
  wikipedia: {
    license: 'CC BY-SA 4.0',
    storable: true,
    attributionRequired: true,
    defaultTtlMs: 365 * DAY_MS,
  },
  // Per-file, always: a Commons file is not blanket-CC0 and the license lives on the
  // file (§4/§12.2), so the policy declares none and the value carries its own.
  commons: { license: null, storable: true, attributionRequired: true, defaultTtlMs: 365 * DAY_MS },
  osm: {
    license: 'ODbL',
    storable: true,
    attributionRequired: true,
    // Hours are the one semi-volatile Tier-A field and a stale "open until 18:00" read
    // at 17:50 is this feature's worst failure (§3), so OSM's own ceiling is short.
    defaultTtlMs: 7 * DAY_MS,
  },
  // Google's content may not be warehoused (§1) — `place_id` is the only exempt field
  // and it already lives on the trip-scoped `Place` row. Declared so the invariant has
  // something to refuse, not because a Google provider exists yet.
  google: { license: 'proprietary', storable: false, attributionRequired: true, defaultTtlMs: 0 },
} as const satisfies Record<EnrichmentSource, SourcePolicy>;

/** **Precedence is per FIELD, not per source, and it is declared data** (ADR-0166 §5.1).
 *  One place can take its summary from Wikipedia and its image from Commons — a
 *  source-level winner would discard the best available value for every *other* field,
 *  which for these lopsidedly-covering sources is most fields most of the time. Four
 *  places in the spike had a usable image and no article in any language we read
 *  (§11.3), which is the measurement behind this.
 *
 *  Adding a source is one file plus one line here (§5.2) — that is the acceptance test
 *  for the whole design. A source listed with no provider registered simply contributes
 *  nothing: `hours` names OSM today and no OSM provider exists, because ADR-0166's
 *  Phase 2 is blocked on measuring the restaurant fill rate (§12.4).
 *
 *  `image` names **Commons and not Wikidata** on purpose: Wikidata's `P18` is the
 *  *pointer*, and §11.1 requires verifying the file's own license on Commons before
 *  storing anything — a REST-summary or unverified image is never a storable source. */
export const FIELD_SOURCE_PRECEDENCE = {
  image: [ENRICHMENT_SOURCE.COMMONS],
  summary: [ENRICHMENT_SOURCE.WIKIPEDIA],
  hours: [ENRICHMENT_SOURCE.OSM],
  // Wikidata's `P238`/`P931`, and it is the whole chain on purpose: Google has no IATA
  // field at all and no "city served" field either (§18), so there is no second source to
  // fall through to — a place with no airport-classed Wikidata item simply has neither.
  iata: [ENRICHMENT_SOURCE.WIKIDATA],
  servedCity: [ENRICHMENT_SOURCE.WIKIDATA],
} as const satisfies Record<EnrichmentField, readonly EnrichmentSource[]>;

/** How long a stored value of this field is fresh (ADR-0166 §6.1: summary effectively
 *  permanent, image long, hours short). A read past it serves the stale value and
 *  schedules a refresh — it never blocks and never shows a spinner where a fact was. */
export const ENRICHMENT_FIELD_TTL_MS = {
  image: 180 * DAY_MS,
  summary: 365 * DAY_MS,
  hours: 1 * DAY_MS,
  // An airport's IATA code and the city it serves are the most stable facts in this store —
  // they change when an airport is renamed or closed, which is a decade-scale event. Capped
  // at the source's own year rather than given a longer number of their own, since
  // `enrichmentValueTtlMs` takes the tighter of the two anyway.
  iata: 365 * DAY_MS,
  servedCity: 365 * DAY_MS,
} as const satisfies Record<EnrichmentField, number>;

/** **Negative caching is mandatory, not an optimization** (ADR-0166 §6.4). "We looked;
 *  nobody has a summary for this café" is stored, with its own shorter TTL. Without it
 *  the majority of places — the ones that will never have a summary (Tokyo restaurants
 *  scored 0 of 7, §11.3) — re-attempt every provider on every cold read forever.
 *
 *  Much shorter than the value TTL for the long-lived fields, because a miss is the more
 *  hopeful state: an article can be written, and a file can be uploaded.
 *
 *  **`hours` inverts that, and the inversion is deliberate.** §6.4 calls the miss TTL
 *  "shorter", written against a summary that is effectively permanent — but an hours
 *  *value* is only trusted for a day (§3: a stale "open until 18:00" read at 17:50 is
 *  this feature's worst failure), and a miss shorter than that would re-ask Overpass
 *  about every café that has no `opening_hours` on essentially every pass, which is the
 *  exact waste §6.4 exists to prevent. The two clocks answer different questions: how
 *  long a known fact stays true, versus how long "nobody knows" stays worth believing. */
export const ENRICHMENT_MISS_TTL_MS = {
  image: 30 * DAY_MS,
  summary: 30 * DAY_MS,
  hours: 3 * DAY_MS,
  // **The miss is the answer here, for nearly every place in a trip.** A café has no IATA
  // code and never will, so re-asking on the ordinary miss clock would spend a Wikidata pass
  // per place per month to re-learn the same nothing. Longer than the prose fields'
  // 30 days because the hopeful case behind that number — an article gets written — has no
  // counterpart: a restaurant does not become an airport.
  iata: 180 * DAY_MS,
  servedCity: 180 * DAY_MS,
} as const satisfies Record<EnrichmentField, number>;

/** How long a value of `field` from `source` is trusted: the tighter of the field's own
 *  freshness need and the source's ceiling. The field usually wins — the exception that
 *  makes this a `min` rather than a lookup is OSM, whose whole-source ceiling is short
 *  because a public Overpass mirror is best-effort (§5.4). */
export function enrichmentValueTtlMs(field: EnrichmentField, source: EnrichmentSource): number {
  return Math.min(ENRICHMENT_FIELD_TTL_MS[field], SOURCE_POLICY[source].defaultTtlMs);
}

/** **Which matching route produced a match — they are not equally trustworthy**
 *  (ADR-0166 §12.3, §15). The order is exact-first:
 *
 *  - `wikidata_tag` — an OSM object's own `wikidata=Q…` tag. An identity join, not a
 *    guess; 10 of 31 OSM objects in the spike were found this way.
 *  - `settled_id` — an alias this store already holds for the place (§4's alias columns).
 *  - `name_proximity` — name similarity, corroborated by distance.
 *  - `geosearch` — **the coordinates did the finding and the name only checked** (§15). The
 *    inverse of the route above, and the answer to its recall hole: a name search only
 *    reaches an item labelled in a language we happened to ask for, while "what is within
 *    150m of this pin" is language-independent. Last resort, and scored lowest, because a
 *    name that could not be compared is evidence we do not have rather than evidence for. */
export const matchMethodSchema = z.enum([
  'wikidata_tag',
  'settled_id',
  'name_proximity',
  'geosearch',
]);
export type MatchMethod = z.infer<typeof matchMethodSchema>;

export const MATCH_METHOD = {
  WIKIDATA_TAG: 'wikidata_tag',
  SETTLED_ID: 'settled_id',
  NAME_PROXIMITY: 'name_proximity',
  GEOSEARCH: 'geosearch',
} as const satisfies Record<string, MatchMethod>;

/** The confidence an exact route carries, and the **ceiling** on the fuzzy one — so an
 *  identity join always outranks the best possible guess. */
export const MATCH_METHOD_CONFIDENCE = {
  wikidata_tag: 1,
  settled_id: 1,
  name_proximity: 0.9,
  // **Below the name route on purpose, and still above the threshold.** A place found by its
  // coordinates and corroborated by nothing readable is a weaker claim than one whose name
  // agreed — so wherever both routes could answer, the named one wins, and this ceiling is
  // what guarantees it rather than a tie-break at the call site (§15).
  geosearch: 0.8,
} as const satisfies Record<MatchMethod, number>;

/** Below this, `match()` returns null rather than a guess (ADR-0166 §5.5): **no
 *  enrichment beats wrong enrichment**, because a wrong match silently attaches the
 *  wrong photo to a place, on the surface people trust while standing outside the
 *  building. Tuned so a name that matches well with no coordinates to corroborate it
 *  still clears, and a name that matches poorly does not — see `nameProximityConfidence`. */
export const MATCH_CONFIDENCE_THRESHOLD = 0.6;

/** **The name must CARRY a fuzzy match; proximity may corroborate it and never carry it**
 *  (ADR-0166 §15, owner report 2026-08-05: Piccadilly Circus matched the Underground
 *  station under it).
 *
 *  The blend gives proximity 35% of the score, and for a facility **at** the place that
 *  35% is free and discriminates nothing: a station inside a square, a shop inside a mall,
 *  a statue in a plaza all share the pin. So `Piccadilly Circus` against `Piccadilly Circus
 *  tube station` scored 0.707 on the name and 0.810 blended — over the threshold on
 *  evidence that was never about which of the two you meant.
 *
 *  A candidate whose name is ours **plus a qualifying noun** is a different subject, and
 *  this floor is where that is refused. Calibrated against the measured cases rather than
 *  chosen: `Meiji Jingū / Meiji Shrine` → `Meiji Shrine` is 0.816 and must survive; the
 *  tube station is 0.707 and must not; `Tsukiji` → `Tsukiji Outer Market` is 0.577, which
 *  §11's own note calls a weak match. */
export const MATCH_MIN_NAME_SIMILARITY = 0.8;

/** **The match is refusable for two different reasons, and they have different scopes**
 *  (ADR-0166 §5.5 + §11.2):
 *
 *  - `low_confidence` refuses the **whole** candidate — the identity is not established.
 *  - `broader_type` refuses **per field** — the entity is right and the content still
 *    describes something broader or historical. A river for a riverside spot, a chain
 *    for a branch, a district for a shop, or the former wholesale market for the outer
 *    market that replaced it. Refused for `summary`, fine for `image`, which is what
 *    per-field precedence makes expressible.
 *
 *  §5 guarded against the match being *wrong*. §11.2 found matches that are *right and
 *  still misleading* — the "confidently wrong" failure has two shapes, not one. */
export const matchRefusalSchema = z.enum(['low_confidence', 'broader_type']);
export type MatchRefusal = z.infer<typeof matchRefusalSchema>;

export const MATCH_REFUSAL = {
  LOW_CONFIDENCE: 'low_confidence',
  BROADER_TYPE: 'broader_type',
} as const satisfies Record<string, MatchRefusal>;

/** Why a field ended up with nothing. The refusals above plus the ordinary case, which
 *  for most places is the *common* one rather than an error (§Context 2). */
export const enrichmentAbsenceReasonSchema = z.union([
  matchRefusalSchema,
  z.enum(['not_found', 'unstorable', 'attribution_missing']),
]);
export type EnrichmentAbsenceReason = z.infer<typeof enrichmentAbsenceReasonSchema>;

export const ENRICHMENT_ABSENCE_REASON = {
  ...MATCH_REFUSAL,
  /** Nobody we asked had it. */
  NOT_FOUND: 'not_found',
  /** A provider returned a value its own policy forbids storing (§2's invariant firing). */
  UNSTORABLE: 'unstorable',
  /** The value requires visible credit and arrived without any, so it cannot be rendered
   *  lawfully — refused rather than stored as an obligation we cannot discharge. */
  ATTRIBUTION_MISSING: 'attribution_missing',
} as const satisfies Record<string, EnrichmentAbsenceReason>;

/** The width asked of Commons' own thumbnailer (`iiurlwidth`).
 *
 *  **`iiurlwidth` does not honour exact widths** — MediaWiki rounds up to its own
 *  thumbnail buckets, and the spike's requests for 200/400/800 came back as 250/500/840–960
 *  (§12.1). So this is a *nominal* ask and the bucket we get is the answer; nothing
 *  downstream may assume the returned image is this wide.
 *
 *  800 rather than the spike's 400 because ADR-0167 §3's hero is 132px tall at full row
 *  width (~390px) and wants more than one device pixel per CSS pixel. The spike measured the
 *  500 bucket at 36–250 KB (median 71 KB), so this lands in the low hundreds of KB — worth it
 *  for bytes we store once, serve immutably and cache offline. **The one number a device pass
 *  should revisit**, since no bucket above 500 has been measured. */
export const ENRICHMENT_IMAGE_NOMINAL_WIDTH_PX = 800;

/** Ceiling on the image bytes we will accept and store.
 *
 *  Generous against the measured thumbnail range and still far below the **26.3 MB**
 *  originals the spike found (§11.4), so it doubles as a guard: if a bug ever pointed the
 *  fetch at a Commons *original* instead of a bucket, this refuses it rather than quietly
 *  warehousing it. */
export const MAX_ENRICHMENT_IMAGE_BYTES = 4 * 1024 * 1024;

/** Prefix on every enrichment blob key.
 *
 *  `common/storage.ts` is **one flat keyspace** shared with document blobs and avatars, and
 *  the enrichment image route is `@Public` — so the prefix is what stops that route being a
 *  way to ask for any blob in the bucket. A document is encrypted at rest and auth-guarded
 *  (ADR-0015/0034); handing out even its ciphertext to an unauthenticated caller is a
 *  weakening nobody asked for, and one string comparison closes it. */
export const ENRICHMENT_BLOB_KEY_PREFIX = 'enr_';

export function isEnrichmentBlobKey(key: string): boolean {
  return key.startsWith(ENRICHMENT_BLOB_KEY_PREFIX);
}

/** Where a stored enrichment image is served from — the mirror of `avatarContentPath`, and
 *  same-origin for the same two reasons: an `<img>` cannot send a bearer token, and
 *  same-origin immutable bytes are what let the service worker cache them so an enriched
 *  thumbnail survives going offline (non-negotiable rule 5, ADR-0166 §2). */
export function enrichmentImageContentPath(blobKey: string): string {
  return `/enrichment/images/${blobKey}`;
}

/** Licenses whose obligations we cannot reasonably discharge in a thumbnail caption, so a
 *  file carrying **only** one of them is treated as no image at all (ADR-0166 §12.2).
 *
 *  GFDL is the measured case — the Western Wall's `P18` is GFDL 1.2 only, with an empty
 *  machine-readable `License` field. It is a *documentation* license: it contemplates
 *  reproducing the license text alongside the work, which is not a thing a 40px badge or an
 *  11px credit line can do. One file in 32, so refusing costs almost nothing and shipping an
 *  obligation we silently breach costs a lot. */
const UNUSABLE_LICENSE_PATTERN = /\bGFDL\b|\bGNU Free Documentation\b/i;

/** Anything that makes a file usable *despite* also being GFDL — Commons files are often
 *  dual-licensed, and refusing those would throw away most of the CC BY-SA corpus. */
const USABLE_LICENSE_PATTERN = /\bCC[\s-]|\bcc0\b|public domain|\bPD\b/i;

/** Is this license string one we must refuse? Only when the unusable term is the **whole**
 *  story — a `GFDL or CC BY-SA 3.0` dual license is fine, and is common. */
export function isUnusableLicense(license: string): boolean {
  return UNUSABLE_LICENSE_PATTERN.test(license) && !USABLE_LICENSE_PATTERN.test(license);
}

/** Per-value provenance (ADR-0166 §4) — ~6 facts, on **every** value. This is the
 *  deliverable `integrations/overview.md` asked this pipe to preserve, not decoration:
 *  it is what makes a source removable, and it carries CC BY-SA's attribution
 *  obligation on the value that owes it rather than in a comment somewhere. */
const enrichmentProvenanceSchema = z.object({
  source: enrichmentSourceSchema,
  /** The license **string**, never a normalized enum: nine distinct strings appeared
   *  across 32 files, including regional ports (`CC BY-SA 3.0 de`) and older versions
   *  (`CC BY-SA 2.5`), and ADR-0167 §4 renders the stored string verbatim. */
  license: z.string().min(1),
  /** Who to credit and where — the author, and the page the credit points at. Required
   *  in practice whenever `SOURCE_POLICY[source].attributionRequired`. */
  attribution: z.string().min(1).optional(),
  fetchedAt: z.iso.datetime({ offset: true }),
  confidence: z.number().min(0).max(1),
  /** Which route established the match (§12.3) — stored because a bad match has to be
   *  diagnosable later instead of mysterious. */
  method: matchMethodSchema,
  /** What the match was made against, kept as evidence for the same reason. */
  ref: z.string().min(1),
});
export type EnrichmentProvenance = z.infer<typeof enrichmentProvenanceSchema>;

/** A value carrying prose. **`lang` is required** (ADR-0166 §11.6, superseding §4's
 *  optional hint): the recorded language is the hook for machine translation and for
 *  multi-language support, and there is no defensible state where we hold a sentence and
 *  don't know what it is written in. */
export const enrichedTextValueSchema = enrichmentProvenanceSchema.extend({
  value: z.string().min(1),
  lang: langCodeSchema,
  /** Set on a **translation**, which is a new variant rather than an overwrite (§11.6).
   *  A translation of CC BY-SA text is a derivative work, so its license and attribution
   *  obligations **propagate** from here — see `governingAttribution`. Keeping the
   *  original is what satisfies attribution and what lets a better translator re-run
   *  later without re-fetching Wikipedia. */
  derivedFrom: z
    .object({
      value: z.string().min(1),
      lang: langCodeSchema,
      source: enrichmentSourceSchema,
      license: z.string().min(1),
      attribution: z.string().min(1).optional(),
    })
    .optional(),
});
export type EnrichedTextValue = z.infer<typeof enrichedTextValueSchema>;

/** A stored image. **Not a URL we hotlink** — hotlinking reintroduces the
 *  third-party-request-per-render and blank-on-a-plane defects §2 rejected for Google
 *  photos, whoever the host is (§12.1). `blobKey` is our own copy; `width`/`height` are
 *  the bucket's real dimensions, because the measured aspect range is 0.54–1.78 with six
 *  portraits in 32 and a blind square centre-crop of a building is frequently sky (§11.4).
 *
 *  Phase 1 writes no image: it has no Commons provider, and §11.1 forbids storing a file
 *  whose own license has not been read. The shape lands here so Phase 2 fills it in
 *  rather than inventing it. */
export const enrichedImageValueSchema = enrichmentProvenanceSchema.extend({
  /** Opaque key into `common/storage.ts`, the avatar pipeline's second consumer. */
  blobKey: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  /** The Commons file this came from, so the credit can point at it. */
  sourceFile: z.string().min(1).optional(),
});
export type EnrichedImageValue = z.infer<typeof enrichedImageValueSchema>;

/** Opening hours, as **the raw OSM expression** (ADR-0166 §11's closing note / ADR-0167
 *  §7). Thirteen distinct syntax shapes appeared across 15 values, including seasonal
 *  overrides and past-midnight ranges (`09:30-23:45; Jun 21-Sep 02: 09:00-00:45; Jul
 *  14,Jul 15 off`), so no display may be derived from a seven-row weekly model — store
 *  the string, always, and derive any rendering from it. */
export const enrichedHoursValueSchema = enrichmentProvenanceSchema.extend({
  value: z.string().min(1),
});
export type EnrichedHoursValue = z.infer<typeof enrichedHoursValueSchema>;

/** **An airport's IATA code** (ADR-0166 §18, field report #7) — Wikidata `P238`, and the
 *  thing Google has no field for at all, which is why `place-label.ts` spent a year
 *  stripping category nouns off a name instead.
 *
 *  Shape-validated rather than trusted: three uppercase letters is what an IATA location
 *  identifier IS, and the value lands in a label a person reads at an airport, so a
 *  malformed claim is refused on the way into the store rather than rendered. */
export const enrichedCodeValueSchema = enrichmentProvenanceSchema.extend({
  value: z.string().regex(/^[A-Z]{3}$/, 'invalid IATA code'),
});
export type EnrichedCodeValue = z.infer<typeof enrichedCodeValueSchema>;

/** "We looked and there is nothing" — a first-class state, not an error (§Context 2,
 *  §11.3), and the negative cache §6.4 makes mandatory. Carries which sources were asked
 *  so a later pass can tell "Wikipedia has no article" from "Wikipedia was down". */
export const enrichmentAbsenceSchema = z.object({
  state: z.literal('absent'),
  attemptedAt: z.iso.datetime({ offset: true }),
  sources: z.array(enrichmentSourceSchema),
  reason: enrichmentAbsenceReasonSchema,
});
export type EnrichmentAbsence = z.infer<typeof enrichmentAbsenceSchema>;

/** A field is in one of three states, and the distinction between the last two is what
 *  the negative cache buys: **the key is missing** (never asked), **`absent`** (asked,
 *  nothing there — don't ask again until the miss TTL lapses), or **`present`**. */
function fieldStateSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('state', [
    z.object({ state: z.literal('present'), value }),
    enrichmentAbsenceSchema,
  ]);
}

/** **A text field holds localized variants, not a single value** (ADR-0166 §11.6). Keyed
 *  by language, each variant a full value with its own source, license and `fetchedAt`.
 *  Picking one for a reader is then a resolution function over the variants
 *  (`resolveTextVariant`) rather than a schema change — and a translation is one more
 *  entry, not an overwrite. Doing this now costs one type; retrofitting it would mean
 *  migrating every stored summary. */
export const textVariantsSchema = z.record(langCodeSchema, enrichedTextValueSchema);
export type TextVariants = z.infer<typeof textVariantsSchema>;

/** The `PlaceEnrichment.fields` JSON payload — `Record<EnrichmentField, …>` per §4, with
 *  §11.6's variants applied to the one field that carries prose. */
export const enrichmentFieldsSchema = z.object({
  summary: fieldStateSchema(textVariantsSchema).optional(),
  image: fieldStateSchema(enrichedImageValueSchema).optional(),
  hours: fieldStateSchema(enrichedHoursValueSchema).optional(),
  iata: fieldStateSchema(enrichedCodeValueSchema).optional(),
  /** **Variants, like a summary** (§11.6): the city is a name a person reads, and this app
   *  is Hebrew-first — `תל אביב · TLV` is the label, not `Tel Aviv · TLV`, wherever Wikidata
   *  has the Hebrew label. Storing one value would throw the other language away. */
  servedCity: fieldStateSchema(textVariantsSchema).optional(),
});
export type EnrichmentFields = z.infer<typeof enrichmentFieldsSchema>;

/** An image as a **client** sees it: a URL instead of a `blobKey`.
 *
 *  Same move `documentSummarySchema` makes by omitting `fileRef` — the storage key stays
 *  server-side and the client gets something it can put in an `<img src>`. The server builds
 *  it with `enrichmentImageContentPath`, so **no client knows the route shape**, and a blob
 *  that has been replaced simply stops appearing (the `uploadedAvatarUrl` precedent,
 *  ADR-0133 §12). */
export const deliveredImageValueSchema = enrichmentProvenanceSchema.extend({
  /** Root-relative, since the server has no reliable view of its own public origin. */
  url: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  sourceFile: z.string().min(1).optional(),
});
export type DeliveredImageValue = z.infer<typeof deliveredImageValueSchema>;

/** What a client receives for one place: **only what we actually know.**
 *
 *  No `absent` state and no `state` discriminant at all, which is the one real difference
 *  from the stored payload beyond the image's URL. The three states the store distinguishes —
 *  never asked, asked-and-nothing-there, present — collapse to two for a reader, because a
 *  surface renders "we know nothing" identically either way: ADR-0167 §6's empty card is *a
 *  card whose whole content is the way to the answer*, and it does not care which kind of
 *  nothing it is showing.
 *
 *  Keeping `absent` server-side is not just simpler, it is more correct. The negative cache
 *  is a **fetch-scheduling** concern (§6.4 — don't re-ask for a month), and shipping it to
 *  clients would both grow the payload with every place ever attempted and invite a surface
 *  to render a distinction it has no business drawing. */
export const deliveredEnrichmentFieldsSchema = z.object({
  summary: textVariantsSchema.optional(),
  image: deliveredImageValueSchema.optional(),
  hours: enrichedHoursValueSchema.optional(),
  iata: enrichedCodeValueSchema.optional(),
  servedCity: textVariantsSchema.optional(),
});
export type DeliveredEnrichmentFields = z.infer<typeof deliveredEnrichmentFieldsSchema>;

/** **Enrichment as the trip snapshot carries it: keyed by `placeId`** (ADR-0166 §6's
 *  server-owned read model).
 *
 *  The store itself is global and keyed by alias columns — no `tripId`, no `placeId` (§1) —
 *  and resolving that to the trip's own place ids is exactly the join the server owes the
 *  client. Keyed rather than a list because every consumer's question is "what do we know
 *  about *this* place", which is a lookup, not a scan. */
export const tripEnrichmentsSchema = z.record(z.string(), deliveredEnrichmentFieldsSchema);
export type TripEnrichments = z.infer<typeof tripEnrichmentsSchema>;

/**
 * **What a client asks about a place the trip does not hold yet** (ADR-0166 §17) — the body of
 * `POST /trips/:tripId/enrichment/lookup`.
 *
 * The snapshot join cannot answer for a Google search result: it is keyed by `placeId` and a
 * candidate has none. So this is the first enrichment read a client **addresses** rather than
 * receives, and the identity has to travel with the question — matching needs a name and a
 * point, and the server holds neither for a place nobody has added.
 *
 * Same trust level as `resolvePlaceSchema.details`, and for the same reason: the Text Search
 * call already returned these values, so asking Google for them again would be spending twice.
 * The one thing that is genuinely new is where they land — the enrichment store is **global**,
 * so a wrong name here mismatches a row other trips read. §17 takes that trade deliberately and
 * records what bounds it.
 */
export const enrichmentLookupSchema = z.object({
  googlePlaceId: z.string().min(1),
  name: z.string().min(1).max(200),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export type EnrichmentLookupInput = z.infer<typeof enrichmentLookupSchema>;

/** What the value of `field` looks like when present — the two text fields are variants
 *  maps (`TEXT_VARIANT_FIELDS`). */
export type EnrichmentFieldValue<F extends EnrichmentField> = F extends 'summary' | 'servedCity'
  ? TextVariants
  : F extends 'image'
    ? EnrichedImageValue
    : F extends 'iata'
      ? EnrichedCodeValue
      : EnrichedHoursValue;

/** The license + credit that actually **govern** a value, walking `derivedFrom` to its
 *  origin (ADR-0166 §11.6). A translation of CC BY-SA text is a derivative work whose
 *  credit belongs to the Wikipedia authors, not to us or the translator — so the
 *  obligation propagates along the chain rather than being re-derived from the
 *  translating source's own policy, which would silently drop it. */
export function governingAttribution(value: EnrichedTextValue): {
  license: string;
  attribution?: string;
} {
  const origin = value.derivedFrom;
  return origin
    ? { license: origin.license, attribution: origin.attribution }
    : { license: value.license, attribution: value.attribution };
}

/** Pick the variant to show a reader: the first `preferred` language we hold, else any.
 *
 *  The fallback is not a nicety — Hebrew articles exist for 9 of 27 Tokyo places against
 *  15 of 27 in English (§11.5), so **most places that get a summary at all will show
 *  English in a Hebrew RTL app**, and ADR-0167 §5 is the `באנגלית` marker that keeps
 *  that honest. Returning the chosen variant (which carries its own `lang`) rather than
 *  just its text is what lets the caller mark it. */
export function resolveTextVariant(
  variants: TextVariants,
  preferred: readonly LangCode[],
): EnrichedTextValue | undefined {
  for (const lang of preferred) {
    const variant = variants[lang];
    if (variant) return variant;
  }
  return Object.values(variants)[0];
}

/** Reader language preference for a Hebrew-first app (ADR-0009): Hebrew, then the
 *  English fallback the owner chose in §11.5. */
export const SUMMARY_LANG_PREFERENCE = ['he', 'en'] as const satisfies readonly LangCode[];

/** When each present value in the payload was fetched — the clock-free half of the
 *  freshness question. The caller compares against its own `now` (this package never
 *  reads one), so a stale value can be served **and** a refresh scheduled, per §6.1. */
export function enrichmentValueFetchedAt(
  fields: EnrichmentFields,
  field: EnrichmentField,
): string | undefined {
  const state = fields[field];
  if (state?.state !== 'present') return undefined;
  if (isTextVariantField(field)) {
    // A variants map is as fresh as its **oldest** variant: refreshing the field
    // re-asks for all of them, so the earliest fetch is what governs.
    const variants = Object.values(state.value as TextVariants);
    return variants.map((v) => v.fetchedAt).sort()[0];
  }
  return (state.value as EnrichedImageValue | EnrichedHoursValue | EnrichedCodeValue).fetchedAt;
}
