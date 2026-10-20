import { describe, expect, it } from 'vitest';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Place,
  type TripEnrichments,
  type TripEvent,
} from '@waypoint/shared';
import { tripDayShotUrls } from './day-photo';

const stamps = {
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  updatedBy: 'u1',
};
const RANGE = { startDate: '2026-08-03', endDate: '2026-08-05' };

const place = (id: string): Place => ({ id, tripId: 't1', name: id, lat: 64, lng: -20, ...stamps });

const ev = (
  id: string,
  date: string,
  placeId: string,
  status: TripEvent['status'] = EVENT_STATUS.PLANNED,
): TripEvent => ({
  id,
  tripId: 't1',
  title: id,
  kind: EVENT_KIND.SOFT,
  status,
  source: EVENT_SOURCE.MANUAL,
  date,
  placeId,
  startsAt: `${date}T10:00:00Z`,
  endsAt: `${date}T12:00:00Z`,
  sortOrder: 0,
  ...stamps,
});

const image = (url: string) => ({
  url,
  mimeType: 'image/jpeg',
  width: 840,
  height: 560,
  sizeBytes: 90_000,
  source: 'commons' as const,
  license: 'CC BY-SA 4.0',
  attribution: 'A. Photographer',
  fetchedAt: '2026-08-01T00:00:00.000Z',
  method: 'name_proximity' as const,
  ref: 'Q1',
  confidence: 1,
});

const places = ['a', 'b', 'c', 'outside'].map(place);
const enrichments: TripEnrichments = Object.fromEntries(
  places.map((p) => [p.id, { image: image(`/enrichment/images/${p.id}`) }]),
);

describe('tripDayShotUrls', () => {
  it("is every day's picture across the trip, and no day's outside it", () => {
    const events = [
      ev('e1', '2026-08-03', 'a'),
      ev('e2', '2026-08-05', 'b'),
      ev('e3', '2026-08-09', 'outside'),
    ];
    const urls = tripDayShotUrls(RANGE, events, [], places, {}, enrichments);
    expect([...urls]).toEqual(['/enrichment/images/a', '/enrichment/images/b']);
  });

  it('holds both pictures of a day whose skipped stop Plan keeps and Trip drops', () => {
    const events = [
      ev('e1', '2026-08-04', 'a'),
      { ...ev('e2', '2026-08-04', 'c', EVENT_STATUS.SKIPPED), endsAt: '2026-08-04T18:00:00Z' },
    ];
    const urls = tripDayShotUrls(RANGE, events, [], places, {}, enrichments);
    expect(urls).toEqual(new Set(['/enrichment/images/a', '/enrichment/images/c']));
  });
});
