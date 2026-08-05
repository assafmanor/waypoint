import { describe, expect, it } from 'vitest';
import type { DeliveredEnrichmentFields, DeliveredImageValue } from '@waypoint/shared';
import { badgePhoto } from './place-photo';

const IMAGE: DeliveredImageValue = {
  url: '/enrichment/images/enr_1111',
  mimeType: 'image/jpeg',
  width: 840,
  height: 600,
  sizeBytes: 120_000,
  source: 'commons',
  license: 'CC BY-SA 3.0',
  attribution: 'Kakidai',
  fetchedAt: '2026-08-05T10:00:00.000Z',
  confidence: 1,
  method: 'settled_id',
  ref: 'Sensoji 2023.jpg',
};

const withImage: DeliveredEnrichmentFields = { image: IMAGE };

describe('badgePhoto', () => {
  it('fills the badge with the photo when nobody picked an icon', () => {
    expect(badgePhoto({ icon: undefined }, withImage)).toBe(IMAGE);
  });

  it('yields to a picked icon — the trip’s opinion wins (§2)', () => {
    // ADR-0147 stores `icon` only on a human's pick, so its presence IS the choice. A photo
    // replacing it would be that rule broken automatically, by a background fetch.
    expect(badgePhoto({ icon: '🍜' }, withImage)).toBeUndefined();
  });

  it('renders as it always did when there is no enrichment at all', () => {
    // The common case: Tokyo restaurants scored 0 of 7 (ADR-0166 §11.3).
    expect(badgePhoto({ icon: undefined }, undefined)).toBeUndefined();
    expect(badgePhoto({ icon: undefined }, {})).toBeUndefined();
  });

  it('renders as it always did when we looked and found no image', () => {
    // A summary but no photo is a real, measured state — four spike places had the reverse.
    const summaryOnly: DeliveredEnrichmentFields = {
      summary: {
        en: {
          value: 'A temple.',
          lang: 'en',
          source: 'wikipedia',
          license: 'CC BY-SA 4.0',
          fetchedAt: '2026-08-05T10:00:00.000Z',
          confidence: 1,
          method: 'settled_id',
          ref: 'Q615183',
        },
      },
    };
    expect(badgePhoto({ icon: undefined }, summaryOnly)).toBeUndefined();
  });
});
