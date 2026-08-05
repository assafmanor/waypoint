import { describe, expect, it } from 'vitest';
import {
  ENRICHMENT_FIELD,
  ENRICHMENT_FIELD_TTL_MS,
  ENRICHMENT_MISS_TTL_MS,
  ENRICHMENT_SOURCE,
  enrichmentFieldsSchema,
  enrichmentValueFetchedAt,
  enrichmentValueTtlMs,
  FIELD_SOURCE_PRECEDENCE,
  governingAttribution,
  MATCH_CONFIDENCE_THRESHOLD,
  MATCH_METHOD,
  MATCH_METHOD_CONFIDENCE,
  resolveTextVariant,
  SOURCE_POLICY,
  SUMMARY_LANG_PREFERENCE,
  type EnrichedTextValue,
} from './enrichment';

// A real Wikipedia extract's provenance — Sensō-ji, from the coverage spike dataset.
const HE_SUMMARY: EnrichedTextValue = {
  value: 'מקדש בודהיסטי בשכונת אסקוסה בטוקיו.',
  lang: 'he',
  source: ENRICHMENT_SOURCE.WIKIPEDIA,
  license: 'CC BY-SA 4.0',
  attribution: 'https://he.wikipedia.org/wiki/סנסו-ג׳י',
  fetchedAt: '2026-08-05T09:00:00.000Z',
  confidence: 1,
  method: MATCH_METHOD.SETTLED_ID,
  ref: 'Q615183',
};

const EN_SUMMARY: EnrichedTextValue = {
  ...HE_SUMMARY,
  value: 'Sensō-ji is an ancient Buddhist temple in Asakusa, Tokyo, Japan.',
  lang: 'en',
  attribution: 'https://en.wikipedia.org/wiki/Sens%C5%8D-ji',
  fetchedAt: '2026-08-05T09:00:01.000Z',
};

describe('source policy', () => {
  it('declares Google unstorable, which is what makes ADR-0166 §2 testable', () => {
    expect(SOURCE_POLICY[ENRICHMENT_SOURCE.GOOGLE].storable).toBe(false);
  });

  it('declares every open-licensed source storable', () => {
    for (const source of [
      ENRICHMENT_SOURCE.WIKIDATA,
      ENRICHMENT_SOURCE.WIKIPEDIA,
      ENRICHMENT_SOURCE.COMMONS,
      ENRICHMENT_SOURCE.OSM,
    ]) {
      expect(SOURCE_POLICY[source].storable).toBe(true);
    }
  });

  it('leaves Commons without a source-level license, since it is per file (§12.2)', () => {
    expect(SOURCE_POLICY[ENRICHMENT_SOURCE.COMMONS].license).toBeNull();
  });

  it('resolves an image through Commons, never Wikidata (§11.1)', () => {
    expect(FIELD_SOURCE_PRECEDENCE.image).toEqual([ENRICHMENT_SOURCE.COMMONS]);
  });
});

describe('enrichmentValueTtlMs', () => {
  it('takes the field TTL when the source ceiling is looser', () => {
    expect(enrichmentValueTtlMs(ENRICHMENT_FIELD.SUMMARY, ENRICHMENT_SOURCE.WIKIPEDIA)).toBe(
      ENRICHMENT_FIELD_TTL_MS.summary,
    );
  });

  it("takes the source ceiling when it is tighter than the field's need", () => {
    // OSM's whole-source ceiling is short because a public Overpass mirror is
    // best-effort (§5.4) — the case that makes this a min() rather than a lookup.
    const summaryFromOsm = enrichmentValueTtlMs(ENRICHMENT_FIELD.SUMMARY, ENRICHMENT_SOURCE.OSM);
    expect(summaryFromOsm).toBe(SOURCE_POLICY[ENRICHMENT_SOURCE.OSM].defaultTtlMs);
    expect(summaryFromOsm).toBeLessThan(ENRICHMENT_FIELD_TTL_MS.summary);
  });

  it('keeps a miss far shorter-lived than a long-lived value (§6.4)', () => {
    for (const field of [ENRICHMENT_FIELD.SUMMARY, ENRICHMENT_FIELD.IMAGE]) {
      expect(ENRICHMENT_MISS_TTL_MS[field]).toBeLessThan(ENRICHMENT_FIELD_TTL_MS[field]);
    }
  });

  it('never re-asks about a miss more often than it would refresh a value', () => {
    // Hours invert §6.4's "shorter": the value is trusted for a day, and a miss shorter
    // than that would re-query Overpass about every hours-less café on every pass —
    // which is the waste the negative cache exists to prevent.
    for (const field of Object.values(ENRICHMENT_FIELD)) {
      expect(ENRICHMENT_MISS_TTL_MS[field]).toBeGreaterThanOrEqual(
        Math.min(ENRICHMENT_FIELD_TTL_MS[field], ENRICHMENT_MISS_TTL_MS[field]),
      );
    }
    expect(ENRICHMENT_MISS_TTL_MS.hours).toBeGreaterThan(ENRICHMENT_FIELD_TTL_MS.hours);
  });
});

describe('match confidence', () => {
  it('ranks an identity join above the best possible guess (§12.3)', () => {
    expect(MATCH_METHOD_CONFIDENCE.name_proximity).toBeLessThan(
      MATCH_METHOD_CONFIDENCE.wikidata_tag,
    );
    expect(MATCH_METHOD_CONFIDENCE.name_proximity).toBeLessThan(MATCH_METHOD_CONFIDENCE.settled_id);
  });

  it('lets both exact routes clear the refusal threshold', () => {
    expect(MATCH_METHOD_CONFIDENCE.wikidata_tag).toBeGreaterThan(MATCH_CONFIDENCE_THRESHOLD);
    expect(MATCH_METHOD_CONFIDENCE.settled_id).toBeGreaterThan(MATCH_CONFIDENCE_THRESHOLD);
  });
});

describe('resolveTextVariant', () => {
  it('prefers Hebrew when we hold it', () => {
    const chosen = resolveTextVariant({ he: HE_SUMMARY, en: EN_SUMMARY }, SUMMARY_LANG_PREFERENCE);
    expect(chosen?.lang).toBe('he');
  });

  it('falls back to English, carrying the lang the marker renders from (§11.5)', () => {
    const chosen = resolveTextVariant({ en: EN_SUMMARY }, SUMMARY_LANG_PREFERENCE);
    expect(chosen?.lang).toBe('en');
  });

  it('returns something rather than nothing for a language we did not ask for', () => {
    const ja = { ...EN_SUMMARY, lang: 'ja' };
    expect(resolveTextVariant({ ja }, SUMMARY_LANG_PREFERENCE)?.lang).toBe('ja');
  });

  it('has nothing to resolve from an empty variants map', () => {
    expect(resolveTextVariant({}, SUMMARY_LANG_PREFERENCE)).toBeUndefined();
  });
});

describe('governingAttribution', () => {
  it('reads the value itself when it is the original', () => {
    expect(governingAttribution(EN_SUMMARY)).toEqual({
      license: EN_SUMMARY.license,
      attribution: EN_SUMMARY.attribution,
    });
  });

  it("propagates a derivative's obligation from its origin, not its translator (§11.6)", () => {
    const translated: EnrichedTextValue = {
      ...HE_SUMMARY,
      value: 'תרגום מכונה של הערך האנגלי.',
      license: 'CC BY-SA 4.0',
      attribution: undefined,
      derivedFrom: {
        value: EN_SUMMARY.value,
        lang: 'en',
        source: ENRICHMENT_SOURCE.WIKIPEDIA,
        license: EN_SUMMARY.license,
        attribution: EN_SUMMARY.attribution,
      },
    };
    // The credit belongs to the Wikipedia authors — a translation that lost it would be
    // a licensing breach the store cannot see.
    expect(governingAttribution(translated).attribution).toBe(EN_SUMMARY.attribution);
  });
});

describe('enrichmentFieldsSchema', () => {
  it('accepts a summary as localized variants', () => {
    const parsed = enrichmentFieldsSchema.parse({
      summary: { state: 'present', value: { he: HE_SUMMARY, en: EN_SUMMARY } },
    });
    expect(Object.keys(parsed.summary?.state === 'present' ? parsed.summary.value : {})).toEqual([
      'he',
      'en',
    ]);
  });

  it('rejects prose with no language (§11.6 makes lang required)', () => {
    const { lang: _dropped, ...langless } = HE_SUMMARY;
    const result = enrichmentFieldsSchema.safeParse({
      summary: { state: 'present', value: { he: langless } },
    });
    expect(result.success).toBe(false);
  });

  it('accepts an absent field as the negative cache entry it is', () => {
    const parsed = enrichmentFieldsSchema.parse({
      summary: {
        state: 'absent',
        attemptedAt: '2026-08-05T09:00:00.000Z',
        sources: [ENRICHMENT_SOURCE.WIKIPEDIA],
        reason: 'not_found',
      },
    });
    expect(parsed.summary?.state).toBe('absent');
  });

  it('treats a missing key and an absent field as different things', () => {
    // Never asked vs. asked-and-nothing-there: the whole point of §6.4's negative cache.
    expect(enrichmentFieldsSchema.parse({}).summary).toBeUndefined();
  });

  it('rejects an unrecognised field state', () => {
    expect(enrichmentFieldsSchema.safeParse({ summary: { state: 'pending' } }).success).toBe(false);
  });
});

describe('enrichmentValueFetchedAt', () => {
  it('reports a variants map as being as old as its oldest variant', () => {
    const fields = enrichmentFieldsSchema.parse({
      summary: { state: 'present', value: { en: EN_SUMMARY, he: HE_SUMMARY } },
    });
    expect(enrichmentValueFetchedAt(fields, ENRICHMENT_FIELD.SUMMARY)).toBe(HE_SUMMARY.fetchedAt);
  });

  it('has no fetch time for an absent or unasked field', () => {
    const fields = enrichmentFieldsSchema.parse({
      hours: {
        state: 'absent',
        attemptedAt: '2026-08-05T09:00:00.000Z',
        sources: [],
        reason: 'not_found',
      },
    });
    expect(enrichmentValueFetchedAt(fields, ENRICHMENT_FIELD.HOURS)).toBeUndefined();
    expect(enrichmentValueFetchedAt(fields, ENRICHMENT_FIELD.IMAGE)).toBeUndefined();
  });
});
