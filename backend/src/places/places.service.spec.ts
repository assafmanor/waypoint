import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { GooglePlacesClient, type PlaceDetails } from './google-places.client';
import { PlacesService } from './places.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const DEV_USER = 'u-assaf';

// Shibuya Crossing — real coords so geo-tz resolves a real zone (Asia/Tokyo).
const SHIBUYA_DETAILS: PlaceDetails = {
  googlePlaceId: 'ChIJ-shibuya',
  name: 'Shibuya Crossing',
  address: 'Shibuya City, Tokyo, Japan',
  lat: 35.6595,
  lng: 139.7005,
};

describe('PlacesService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  // A stub Google client so the proxy paths never make a real network call; the
  // spies let us assert dedup-before-spend (Place Details fires at most once).
  const google = {
    autocomplete: vi.fn(),
    placeDetails: vi.fn(async () => SHIBUYA_DETAILS),
  } as unknown as GooglePlacesClient;
  const detailsSpy = vi.mocked(google.placeDetails);
  const service = new PlacesService(prisma, changes, google);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'PlacesService test trip',
        destination: 'Testland',
        startDate: new Date('2027-03-01'),
        endDate: new Date('2027-03-07'),
        createdBy: DEV_USER,
        updatedBy: DEV_USER,
      },
    });
    createdTripIds.push(trip.id);
    return trip.id;
  }

  afterEach(async () => {
    detailsSpy.mockClear();
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('creates a name-only place and reads it back via list()', async () => {
    const tripId = await newTrip();

    const created = await service.create(tripId, DEV_USER, { name: 'Shibuya' });

    expect(created.name).toBe('Shibuya');
    expect(created.googlePlaceId).toBeUndefined();
    const list = await service.list(tripId);
    expect(list.map((p) => p.id)).toContain(created.id);

    const change = await prisma.change.findFirst({ where: { tripId, entityId: created.id } });
    expect(change).toMatchObject({ entityType: 'place', action: 'create' });
  });

  it('enriches a place on update (the picker path)', async () => {
    const tripId = await newTrip();
    const place = await service.create(tripId, DEV_USER, { name: 'Shibuya' });

    const updated = await service.update(tripId, place.id, DEV_USER, {
      googlePlaceId: 'ChIJ123',
      lat: 35.6595,
      lng: 139.7005,
    });

    expect(updated.googlePlaceId).toBe('ChIJ123');
    expect(updated.lat).toBeCloseTo(35.6595);
  });

  it('treats a re-POST of the same client id as already applied (offline retry)', async () => {
    const tripId = await newTrip();
    const input = { id: 'pl-retry-1', name: 'Asakusa' };

    const first = await service.create(tripId, DEV_USER, input);
    const second = await service.create(tripId, DEV_USER, input);

    expect(second.id).toBe(first.id);
    expect(await prisma.place.count({ where: { tripId } })).toBe(1);
  });

  it('resolvePlace enriches a new row: Google id, coords, and a geo-tz zone', async () => {
    const tripId = await newTrip();

    const place = await service.resolvePlace(tripId, DEV_USER, {
      googlePlaceId: SHIBUYA_DETAILS.googlePlaceId,
      sessionToken: 'tok-1',
    });

    expect(place.googlePlaceId).toBe(SHIBUYA_DETAILS.googlePlaceId);
    expect(place.name).toBe('Shibuya Crossing');
    expect(place.lat).toBeCloseTo(35.6595);
    expect(place.timezone).toBe('Asia/Tokyo');
    // ratings deliberately not requested in the Phase-1 field mask (ADR-0111).
    expect(place.rating).toBeUndefined();
    expect(detailsSpy).toHaveBeenCalledTimes(1);
  });

  it('dedup-before-spend: a second resolve of the same place makes no Place Details call', async () => {
    const tripId = await newTrip();

    const first = await service.resolvePlace(tripId, DEV_USER, {
      googlePlaceId: SHIBUYA_DETAILS.googlePlaceId,
      sessionToken: 'tok-1',
    });
    detailsSpy.mockClear();
    const second = await service.resolvePlace(tripId, DEV_USER, {
      googlePlaceId: SHIBUYA_DETAILS.googlePlaceId,
      sessionToken: 'tok-2',
    });

    expect(second.id).toBe(first.id);
    expect(detailsSpy).not.toHaveBeenCalled();
    expect(await prisma.place.count({ where: { tripId } })).toBe(1);
  });

  it('resolvePlace with enrichPlaceId adopts Google fields onto an existing Place-lite', async () => {
    const tripId = await newTrip();
    const lite = await service.create(tripId, DEV_USER, { name: 'somewhere in Shibuya' });

    const enriched = await service.resolvePlace(tripId, DEV_USER, {
      googlePlaceId: SHIBUYA_DETAILS.googlePlaceId,
      sessionToken: 'tok-1',
      enrichPlaceId: lite.id,
    });

    expect(enriched.id).toBe(lite.id); // same row, enriched in place — no duplicate
    expect(enriched.googlePlaceId).toBe(SHIBUYA_DETAILS.googlePlaceId);
    expect(enriched.timezone).toBe('Asia/Tokyo');
    expect(await prisma.place.count({ where: { tripId } })).toBe(1);
  });
});
