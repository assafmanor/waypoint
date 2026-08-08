import { describe, expect, it } from 'vitest';
import {
  ENRICHMENT_ABSENCE_REASON,
  ENRICHMENT_FIELD,
  ENRICHMENT_FIELD_TTL_MS,
  ENRICHMENT_MISS_TTL_MS,
  ENRICHMENT_SOURCE,
  MATCH_METHOD,
  type EnrichmentFields,
  type EnrichmentSource,
} from '@waypoint/shared';
import {
  effectiveLicense,
  fieldsWantingAttempt,
  fieldWantsAttempt,
  valueRefusal,
} from './enrichment.policy';

const NOW = new Date('2026-08-05T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const summaryValue = {
  value: 'Sensō-ji is an ancient Buddhist temple in Asakusa, Tokyo, Japan.',
  lang: 'en',
  license: 'CC BY-SA 4.0',
  attribution: 'https://en.wikipedia.org/wiki/Sens%C5%8D-ji',
};

const presentSummary = (
  fetchedAt: string,
  source: EnrichmentSource = ENRICHMENT_SOURCE.WIKIPEDIA,
): EnrichmentFields => ({
  summary: {
    state: 'present',
    value: {
      en: {
        ...summaryValue,
        source,
        fetchedAt,
        confidence: 1,
        method: MATCH_METHOD.SETTLED_ID,
        ref: 'Q615183',
      },
    },
  },
});

describe('valueRefusal', () => {
  it('accepts a well-formed Wikipedia summary', () => {
    expect(
      valueRefusal(ENRICHMENT_FIELD.SUMMARY, ENRICHMENT_SOURCE.WIKIPEDIA, summaryValue),
    ).toBeNull();
  });

  it('refuses anything from a source whose policy forbids storing — §2 as one guard', () => {
    // "No Google-sourced value is ever written to PlaceEnrichment" enforced by data, not by
    // anyone remembering the caching terms.
    expect(
      valueRefusal(ENRICHMENT_FIELD.SUMMARY, ENRICHMENT_SOURCE.GOOGLE, {
        ...summaryValue,
        license: 'proprietary',
      }),
    ).toBe(ENRICHMENT_ABSENCE_REASON.UNSTORABLE);
  });

  it('refuses a Commons value that supplied no license of its own (§12.2)', () => {
    // Commons declares none at source level because it is per file — nine distinct strings
    // across 32 files — so a value that forgot to carry one has an unknown obligation.
    expect(
      valueRefusal(ENRICHMENT_FIELD.IMAGE, ENRICHMENT_SOURCE.COMMONS, { value: 'x.jpg' }),
    ).toBe(ENRICHMENT_ABSENCE_REASON.UNSTORABLE);
  });

  it('accepts a Commons value that carries its own license', () => {
    expect(
      valueRefusal(ENRICHMENT_FIELD.IMAGE, ENRICHMENT_SOURCE.COMMONS, {
        value: 'x.jpg',
        license: 'CC BY-SA 3.0 de',
        attribution: 'Kakidai',
      }),
    ).toBeNull();
  });

  it('refuses a GFDL-only file, which is what makes it fall through (§12.2)', () => {
    // Refused HERE rather than in the Commons provider on purpose: one place decides what may
    // be kept, and a refusal here is what sends the resolver to the next candidate.
    expect(
      valueRefusal(ENRICHMENT_FIELD.IMAGE, ENRICHMENT_SOURCE.COMMONS, {
        value: 'https://commons.wikimedia.org/wiki/File:Western_Wall.jpg',
        license: 'GFDL 1.2',
        attribution: 'Ralf Roletschek',
      }),
    ).toBe(ENRICHMENT_ABSENCE_REASON.UNSTORABLE);
  });

  it('keeps a file that is GFDL alongside a usable license', () => {
    expect(
      valueRefusal(ENRICHMENT_FIELD.IMAGE, ENRICHMENT_SOURCE.COMMONS, {
        value: 'x',
        license: 'GFDL or CC BY-SA 3.0',
        attribution: 'Someone',
      }),
    ).toBeNull();
  });

  it('honours a per-FILE attribution requirement over the source policy (§12.2)', () => {
    // Commons' source policy says credit is required, because 27 of 32 files demand it. The
    // other 5 genuinely do not, and `extmetadata` says which — refusing a CC0 photograph for
    // lacking a credit nobody is owed would throw away a usable image.
    expect(
      valueRefusal(ENRICHMENT_FIELD.IMAGE, ENRICHMENT_SOURCE.COMMONS, {
        value: 'x',
        license: 'CC0',
        attributionRequired: false,
      }),
    ).toBeNull();
  });

  it('still refuses when the file itself says credit is required', () => {
    expect(
      valueRefusal(ENRICHMENT_FIELD.IMAGE, ENRICHMENT_SOURCE.COMMONS, {
        value: 'x',
        license: 'CC BY-SA 4.0',
        attributionRequired: true,
      }),
    ).toBe(ENRICHMENT_ABSENCE_REASON.ATTRIBUTION_MISSING);
  });

  it('refuses a value that owes credit and arrived without any', () => {
    // ADR-0167 §4 renders the stored string, so there would be nothing to render — and an
    // obligation we cannot discharge is not worth keeping.
    expect(
      valueRefusal(ENRICHMENT_FIELD.SUMMARY, ENRICHMENT_SOURCE.WIKIPEDIA, {
        ...summaryValue,
        attribution: undefined,
      }),
    ).toBe(ENRICHMENT_ABSENCE_REASON.ATTRIBUTION_MISSING);
  });

  it('refuses prose with no language (§11.6)', () => {
    expect(
      valueRefusal(ENRICHMENT_FIELD.SUMMARY, ENRICHMENT_SOURCE.WIKIPEDIA, {
        ...summaryValue,
        lang: undefined,
      }),
    ).toBe(ENRICHMENT_ABSENCE_REASON.UNSTORABLE);
  });

  it('does not demand a language of a value that carries no prose', () => {
    // Hours are an OSM expression, not a sentence — there is nothing to translate or mark.
    expect(
      valueRefusal(ENRICHMENT_FIELD.HOURS, ENRICHMENT_SOURCE.OSM, {
        value: 'Mo-Su 06:00-17:00',
        attribution: '© OpenStreetMap contributors',
      }),
    ).toBeNull();
  });
});

describe('effectiveLicense', () => {
  it("prefers the value's own license over its source's", () => {
    expect(
      effectiveLicense(ENRICHMENT_SOURCE.COMMONS, { value: 'x', license: 'CC BY-SA 2.5' }),
    ).toBe('CC BY-SA 2.5');
  });

  it('falls back to the source policy', () => {
    expect(effectiveLicense(ENRICHMENT_SOURCE.WIKIDATA, { value: 'x' })).toBe('CC0');
  });
});

describe('fieldWantsAttempt', () => {
  it('wants a field it has never asked about', () => {
    expect(fieldWantsAttempt({}, ENRICHMENT_FIELD.SUMMARY, NOW)).toBe(true);
  });

  it('leaves a fresh value alone', () => {
    const fields = presentSummary(ago(1000));
    expect(fieldWantsAttempt(fields, ENRICHMENT_FIELD.SUMMARY, NOW)).toBe(false);
  });

  it('wants a refresh past the value TTL', () => {
    const fields = presentSummary(ago(ENRICHMENT_FIELD_TTL_MS.summary + 1000));
    expect(fieldWantsAttempt(fields, ENRICHMENT_FIELD.SUMMARY, NOW)).toBe(true);
  });

  it("honours the SOURCE's tighter ceiling, not just the field's need", () => {
    // A summary that came from OSM would be trusted for a week, not a year (§5.4).
    const fields = presentSummary(ago(30 * 24 * 3600_000), ENRICHMENT_SOURCE.OSM);
    expect(fieldWantsAttempt(fields, ENRICHMENT_FIELD.SUMMARY, NOW)).toBe(true);
  });

  it('does not re-ask about a miss inside its TTL — the negative cache (§6.4)', () => {
    const fields: EnrichmentFields = {
      summary: { state: 'absent', attemptedAt: ago(1000), sources: [], reason: 'not_found' },
    };
    expect(fieldWantsAttempt(fields, ENRICHMENT_FIELD.SUMMARY, NOW)).toBe(false);
  });

  it('re-asks about a miss once its TTL lapses', () => {
    const fields: EnrichmentFields = {
      summary: {
        state: 'absent',
        attemptedAt: ago(ENRICHMENT_MISS_TTL_MS.summary + 1000),
        sources: [],
        reason: 'not_found',
      },
    };
    expect(fieldWantsAttempt(fields, ENRICHMENT_FIELD.SUMMARY, NOW)).toBe(true);
  });

  it('re-asks when a stored timestamp is unreadable rather than trusting it forever', () => {
    const fields: EnrichmentFields = {
      summary: { state: 'absent', attemptedAt: 'not a date', sources: [], reason: 'not_found' },
    };
    expect(fieldWantsAttempt(fields, ENRICHMENT_FIELD.SUMMARY, NOW)).toBe(true);
  });

  it('lists every field wanting an attempt on a cold row', () => {
    // Every member of the enum, in its declared order — so a field added to
    // `ENRICHMENT_FIELD` is asked about without anyone remembering to list it here.
    expect(fieldsWantingAttempt({}, NOW)).toEqual(Object.values(ENRICHMENT_FIELD));
  });

  it('lists nothing when everything held is fresh or inside its miss TTL', () => {
    const fields: EnrichmentFields = {
      ...presentSummary(ago(1000)),
      image: { state: 'absent', attemptedAt: ago(1000), sources: [], reason: 'not_found' },
      hours: { state: 'absent', attemptedAt: ago(1000), sources: [], reason: 'not_found' },
      iata: { state: 'absent', attemptedAt: ago(1000), sources: [], reason: 'not_found' },
      servedCity: { state: 'absent', attemptedAt: ago(1000), sources: [], reason: 'not_found' },
    };
    expect(fieldsWantingAttempt(fields, NOW)).toEqual([]);
  });
});
