import { describe, expect, it } from 'vitest';
import {
  deliveredEnrichmentFieldsSchema,
  ENRICHMENT_SOURCE,
  enrichmentFieldsSchema,
  MATCH_METHOD,
  type EnrichmentFields,
} from '@waypoint/shared';
import { toDeliveredEnrichment } from './enrichment.mapper';

const PROVENANCE = {
  source: ENRICHMENT_SOURCE.COMMONS,
  license: 'CC BY-SA 3.0',
  attribution: 'Kakidai',
  fetchedAt: '2026-08-05T10:00:00.000Z',
  confidence: 1,
  method: MATCH_METHOD.SETTLED_ID,
  ref: 'Tokyo Skytree 2014 Ⅲ.jpg',
};

const withImage = (): EnrichmentFields =>
  enrichmentFieldsSchema.parse({
    image: {
      state: 'present',
      value: {
        ...PROVENANCE,
        blobKey: 'enr_11111111-2222-3333-4444-555555555555',
        mimeType: 'image/jpeg',
        width: 840,
        height: 1286,
        sizeBytes: 120_000,
        sourceFile: 'https://commons.wikimedia.org/wiki/File:Tokyo_Skytree.jpg',
      },
    },
  });

describe('toDeliveredEnrichment', () => {
  it('replaces the blobKey with a URL a client can put in an img src', () => {
    const image = toDeliveredEnrichment(withImage()).image;

    expect(image?.url).toBe('/enrichment/images/enr_11111111-2222-3333-4444-555555555555');
    // The storage key never leaves the server — the same move `documentSummarySchema` makes
    // by omitting `fileRef`.
    expect(image).not.toHaveProperty('blobKey');
  });

  it('keeps everything a credit line and a layout need', () => {
    const image = toDeliveredEnrichment(withImage()).image;

    expect(image?.license).toBe('CC BY-SA 3.0');
    expect(image?.attribution).toBe('Kakidai');
    // The 0.653 portrait: the aspect has to survive the trip to the client.
    expect(image?.width).toBe(840);
    expect(image?.height).toBe(1286);
    expect(image?.sourceFile).toContain('commons.wikimedia.org');
  });

  it('drops an absent field — the negative cache is not the client’s business', () => {
    const fields = enrichmentFieldsSchema.parse({
      image: {
        state: 'absent',
        attemptedAt: '2026-08-05T10:00:00.000Z',
        sources: [ENRICHMENT_SOURCE.COMMONS],
        reason: 'unstorable',
      },
    });
    // A GFDL-only file, for instance. The surface renders the no-image state either way
    // (ADR-0167 §6), and "don't re-ask for a month" is a fetch-scheduling fact (§6.4).
    expect(toDeliveredEnrichment(fields)).toEqual({});
  });

  it('unwraps summary and hours — they carry no storage handles', () => {
    const fields = enrichmentFieldsSchema.parse({
      summary: {
        state: 'present',
        value: {
          en: {
            ...PROVENANCE,
            source: ENRICHMENT_SOURCE.WIKIPEDIA,
            value: 'Sensō-ji is an ancient Buddhist temple in Asakusa, Tokyo, Japan.',
            lang: 'en',
          },
        },
      },
      hours: { state: 'present', value: { ...PROVENANCE, value: 'Mo-Su 06:00-17:00' } },
    });
    const delivered = toDeliveredEnrichment(fields);
    // No `state` wrapper to unwrap at every call site — `summary.en.value` is the reader's
    // whole path.
    expect(delivered.summary?.en?.value).toContain('Buddhist temple');
    expect(delivered.hours?.value).toBe('Mo-Su 06:00-17:00');
  });

  it('omits a field that was never asked about rather than sending an empty one', () => {
    // A missing key is the client's "we know nothing"; sending `undefined` keys would make
    // every place look enriched-but-empty.
    expect(toDeliveredEnrichment({})).toEqual({});
    expect(Object.keys(toDeliveredEnrichment(withImage()))).toEqual(['image']);
  });

  it('parses as the delivered schema, so the wire shape is checked not assumed', () => {
    expect(
      deliveredEnrichmentFieldsSchema.safeParse(toDeliveredEnrichment(withImage())).success,
    ).toBe(true);
  });
});
