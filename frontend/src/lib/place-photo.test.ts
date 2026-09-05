import { describe, expect, it } from 'vitest';
import type {
  DeliveredEnrichmentFields,
  DeliveredImageValue,
  Place,
  TripEvent,
} from '@waypoint/shared';
import { badgePhoto, rowPhoto } from './place-photo';
import { DEFAULT_EVENT_ICON } from '../constants';

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

// **THE DAY ROW ASKS THE SAME QUESTION ONE LEVEL HIGHER** (ADR-0219 §1): an icon picked on the
// EVENT is the trip's opinion exactly as one picked on the place, so it beats a fetched photo
// too. `badgePhoto` alone could not see that — its host was the Map, where a pin has no event.
describe('rowPhoto', () => {
  const place = (over: Partial<Place> = {}): Place =>
    ({ id: 'p1', tripId: 't1', name: 'Háifoss', ...over }) as Place;
  const event = (over: Partial<TripEvent> = {}): TripEvent =>
    ({
      id: 'e1',
      tripId: 't1',
      date: '2026-07-07',
      title: 'Háifoss',
      placeId: 'p1',
      ...over,
    }) as TripEvent;

  it('fills the badge when nobody picked an icon at either level', () => {
    expect(rowPhoto(event(), [place()], { p1: withImage })).toBe(IMAGE);
  });

  it('yields to an icon picked on the EVENT — the half ADR-0167 §2 could not ask', () => {
    expect(rowPhoto(event({ icon: '🍜' }), [place()], { p1: withImage })).toBeUndefined();
  });

  it('yields to an icon picked on the PLACE, as it always did', () => {
    expect(rowPhoto(event(), [place({ icon: '⛰️' })], { p1: withImage })).toBeUndefined();
  });

  // A DERIVED glyph is not a pick: `📌` is what the form leaves when nobody chose anything, so
  // treating it as one would suppress the photo on most rows (`chosenIcon`'s own reasoning).
  it('does not treat the placeholder pin as a pick', () => {
    expect(rowPhoto(event({ icon: DEFAULT_EVENT_ICON }), [place()], { p1: withImage })).toBe(IMAGE);
  });

  // The EVENT's own place, never the booking's endpoints — the row's badge has always been
  // that place, and the photo is that place's.
  it('has no photo for an event with no place of its own', () => {
    expect(rowPhoto(event({ placeId: undefined }), [place()], { p1: withImage })).toBeUndefined();
  });

  it('has no photo when the place is not in reach, or carries no enrichment', () => {
    expect(rowPhoto(event({ placeId: 'gone' }), [place()], { p1: withImage })).toBeUndefined();
    expect(rowPhoto(event(), [place()], {})).toBeUndefined();
  });
});
