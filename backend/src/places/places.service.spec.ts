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

  // ── THE TEXT SEARCH ADD PATH (ADR-0132 §7) ───────────────────────────────────
  // That SKU already returned the name, the address and the point, so paying Place
  // Details to fetch them again would buy the same place twice. The zone is still ours
  // to resolve from the coordinates, and dedup is unchanged.
  it('resolvePlace with client-supplied details makes NO Place Details call', async () => {
    const tripId = await newTrip();

    const place = await service.resolvePlace(tripId, DEV_USER, {
      googlePlaceId: 'g-text-search',
      details: {
        name: 'קפה בלו בוטל',
        address: 'שינג׳וקו, טוקיו',
        lat: SHIBUYA_DETAILS.lat,
        lng: SHIBUYA_DETAILS.lng,
      },
    });

    expect(detailsSpy).not.toHaveBeenCalled();
    expect(place.name).toBe('קפה בלו בוטל');
    expect(place.googlePlaceId).toBe('g-text-search');
    expect(place.lat).toBeCloseTo(SHIBUYA_DETAILS.lat as number, 4);
    // The zone is resolved server-side from the coordinates either way (ADR-0107).
    expect(place.timezone).toBe('Asia/Tokyo');
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
    expect(enriched.lat).toBeCloseTo(35.6595);
    expect(enriched.name).toBe('somewhere in Shibuya'); // user's label preserved (ADR-0110 §1)
    expect(await prisma.place.count({ where: { tripId } })).toBe(1);
  });

  it('resolvePlace rejects a foreign/unknown enrichPlaceId before spending a Place Details call', async () => {
    const tripId = await newTrip();

    await expect(
      service.resolvePlace(tripId, DEV_USER, {
        googlePlaceId: SHIBUYA_DETAILS.googlePlaceId,
        sessionToken: 'tok-1',
        enrichPlaceId: 'pl-not-in-this-trip',
      }),
    ).rejects.toThrow();
    expect(detailsSpy).not.toHaveBeenCalled(); // validated before the paid call
  });

  // ── ADR-0147: THE ZONE, AND THE TWO USER-AUTHORED FIELDS ────────────────────
  // `resolveTimezone` used to be called only on the enriched path, because until the canvas
  // could drop a pin the only place with coordinates came from Google. A pin dropped across a
  // border would have landed with `timezone: null` and silently inherited the TRIP's zone
  // (ADR-0107) — wrong for exactly the traveller who marks a spot there.
  //
  // Pinned as a PROPERTY over several real points rather than one: "Shibuya gives Asia/Tokyo"
  // would also pass with the zone hard-coded, and the whole bug was a hard-coded fallback.
  it('create() resolves the zone from the coordinates, wherever they are', async () => {
    const tripId = await newTrip();
    const points = [
      { name: 'Shibuya', lat: 35.6595, lng: 139.7005, zone: 'Asia/Tokyo' },
      { name: 'Paris', lat: 48.8584, lng: 2.2945, zone: 'Europe/Paris' },
      { name: 'NYC', lat: 40.7484, lng: -73.9857, zone: 'America/New_York' },
    ];
    for (const point of points) {
      const created = await service.create(tripId, DEV_USER, point);
      expect(created.timezone, `${point.name} got the wrong zone`).toBe(point.zone);
    }
    // …and a name-only Place-lite has no coordinates, so it has no zone by definition.
    const lite = await service.create(tripId, DEV_USER, { name: 'somewhere' });
    expect(lite.timezone).toBeUndefined();
  });

  // Moving a place moves its zone with it — the same rule, from the other verb. Only when BOTH
  // coordinates arrive: a partial update that renames says nothing about where the place is.
  it('update() re-resolves the zone when a place moves, and leaves it alone otherwise', async () => {
    const tripId = await newTrip();
    const place = await service.create(tripId, DEV_USER, {
      name: 'Shibuya',
      lat: 35.6595,
      lng: 139.7005,
    });
    expect(place.timezone).toBe('Asia/Tokyo');

    const renamed = await service.update(tripId, place.id, DEV_USER, { name: 'הצומת' });
    expect(renamed.timezone).toBe('Asia/Tokyo');

    const moved = await service.update(tripId, place.id, DEV_USER, { lat: 48.8584, lng: 2.2945 });
    expect(moved.timezone).toBe('Europe/Paris');
  });

  it('carries a chosen icon through create, update and list', async () => {
    const tripId = await newTrip();
    const created = await service.create(tripId, DEV_USER, { name: 'רמן נאגי', icon: '🍜' });
    expect(created.icon).toBe('🍜');

    const changed = await service.update(tripId, created.id, DEV_USER, { icon: '☕' });
    expect(changed.icon).toBe('☕');

    const [listed] = await service.list(tripId);
    expect(listed.icon).toBe('☕');
  });

  // **THE POLICY ADR-0147 GAVE A SURFACE TO**, and it is implemented as an ABSENCE: what a
  // human authored about a place outranks what Google says about it. `enrichExisting` adopts
  // the id, address, coordinates and zone — and neither the name nor the icon. Adding a field
  // to that `data` object hands it back to Google, so this is the test that notices.
  it('enriching a place never overwrites the name or the icon a human authored', async () => {
    const tripId = await newTrip();
    const mine = await service.create(tripId, DEV_USER, {
      name: 'הרמן ליד המלון',
      icon: '🍜',
    });

    const enriched = await service.resolvePlace(tripId, DEV_USER, {
      googlePlaceId: SHIBUYA_DETAILS.googlePlaceId,
      sessionToken: 'tok-1',
      enrichPlaceId: mine.id,
    });

    expect(enriched.id).toBe(mine.id);
    // Google's half was adopted…
    expect(enriched.googlePlaceId).toBe(SHIBUYA_DETAILS.googlePlaceId);
    expect(enriched.address).toBe(SHIBUYA_DETAILS.address);
    expect(enriched.timezone).toBe('Asia/Tokyo');
    // …and the two user-authored fields survived it.
    expect(enriched.name).toBe('הרמן ליד המלון');
    expect(enriched.icon).toBe('🍜');
  });

  // A fresh pick has nothing authored, so it takes Google's name and carries no icon — the
  // other half of the same rule, and what keeps the chain deriving from the category.
  it('a place Google mints carries no icon, so its glyph keeps deriving', async () => {
    const tripId = await newTrip();
    const place = await service.resolvePlace(tripId, DEV_USER, {
      googlePlaceId: SHIBUYA_DETAILS.googlePlaceId,
      sessionToken: 'tok-1',
    });
    expect(place.name).toBe('Shibuya Crossing');
    expect(place.icon).toBeUndefined();
  });

  it('create() with an already-present googlePlaceId returns the existing row (dedup, not 404)', async () => {
    const tripId = await newTrip();
    const first = await service.create(tripId, DEV_USER, {
      name: 'Tower A',
      googlePlaceId: 'ChIJ-dup',
    });

    // A different client id but the same googlePlaceId trips the new unique constraint;
    // the P2002 recovery returns the existing row instead of 404ing the never-inserted id.
    const second = await service.create(tripId, DEV_USER, {
      name: 'Tower B',
      googlePlaceId: 'ChIJ-dup',
    });

    expect(second.id).toBe(first.id);
    expect(await prisma.place.count({ where: { tripId } })).toBe(1);
  });

  // ── ADR-0157: DELETING A PLACE ───────────────────────────────────────────────
  // The service writes one change and lets the FKs do the rest, so what this pins is the
  // SHAPE OF THE CASCADE rather than the call: an event survives without its location, and
  // the place's notes do not survive at all. Both are `schema.prisma`'s to enforce, and both
  // are what the client mirrors locally off the single change — if either flips, the client's
  // local rule is wrong and nothing else would say so.
  it('deletes a place: the event survives without its location, the notes do not', async () => {
    const tripId = await newTrip();
    const place = await service.create(tripId, DEV_USER, {
      name: 'Shibuya',
      lat: 35.6595,
      lng: 139.7005,
    });
    const event = await prisma.event.create({
      data: {
        tripId,
        title: 'הצומת',
        date: new Date('2027-03-02'),
        kind: 'soft',
        placeId: place.id,
        updatedBy: DEV_USER,
      },
    });
    const note = await prisma.note.create({
      data: {
        tripId,
        body: 'הכי יפה בלילה',
        placeId: place.id,
        createdBy: DEV_USER,
        updatedBy: DEV_USER,
      },
    });

    await service.remove(tripId, place.id, DEV_USER);

    expect(await prisma.place.findUnique({ where: { id: place.id } })).toBeNull();
    const survivor = await prisma.event.findUnique({ where: { id: event.id } });
    expect(survivor).not.toBeNull();
    expect(survivor?.placeId).toBeNull();
    expect(await prisma.note.findUnique({ where: { id: note.id } })).toBeNull();

    // One change for the place and none for what the cascade took — the fact the client's
    // local mirror is built on (ADR-0152 §2's precedent).
    const changes = await prisma.change.findMany({ where: { tripId, action: 'delete' } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ entityType: 'place', entityId: place.id });
  });

  it('refuses to delete a place belonging to another trip', async () => {
    const mine = await newTrip();
    const theirs = await newTrip();
    const place = await service.create(theirs, DEV_USER, { name: 'לא שלי' });

    await expect(service.remove(mine, place.id, DEV_USER)).rejects.toThrow();
    expect(await prisma.place.findUnique({ where: { id: place.id } })).not.toBeNull();
  });

  // ── ADR-0157 §6: THE ORPHAN SWEEP ───────────────────────────────────────────
  // The GC ADR-0112 left open. What these pin is not "it deletes rows" but the three things
  // it must REFUSE to delete — a referenced place, a place carrying notes, and a place young
  // enough that an undo might still want it. `graceMs: 0` is how the first two are asserted
  // without a clock: the grace is the third test's subject, not the others'.
  describe('sweepOrphans', () => {
    const noGrace = (tripId: string) => service.sweepOrphans(tripId, DEV_USER, 0);

    it('takes a place nothing points at', async () => {
      const tripId = await newTrip();
      const orphan = await service.create(tripId, DEV_USER, { name: 'שריד של בחירה שבוטלה' });

      const swept = await noGrace(tripId);

      expect(swept.map((p) => p.id)).toEqual([orphan.id]);
      expect(await prisma.place.count({ where: { tripId } })).toBe(0);
      // Through `ChangeService`, so a peer's list and Dexie cache lose it too (ADR-0019).
      const change = await prisma.change.findFirst({
        where: { tripId, entityId: orphan.id, action: 'delete' },
      });
      expect(change).toMatchObject({ entityType: 'place' });
    });

    // One test per FK, driven as a table: a sixth reference added to the schema and not to
    // the sweep's `where` would delete a row something still points at, and only this notices.
    it('spares a place any reference points at, whichever FK it is', async () => {
      const tripId = await newTrip();
      const place = async (name: string) => (await service.create(tripId, DEV_USER, { name })).id;
      const onEvent = await place('event');
      const onBooking = await place('booking');
      const onFrom = await place('from');
      const onTo = await place('to');
      const onIdea = await place('idea');
      const onNote = await place('note');

      await prisma.event.create({
        data: {
          tripId,
          title: 'יש לו מקום',
          date: new Date('2027-03-02'),
          kind: 'soft',
          placeId: onEvent,
          updatedBy: DEV_USER,
        },
      });
      await prisma.booking.create({
        data: { tripId, type: 'hotel', title: 'מלון', placeId: onBooking, updatedBy: DEV_USER },
      });
      await prisma.booking.create({
        data: {
          tripId,
          type: 'train',
          title: 'רכבת',
          fromPlaceId: onFrom,
          toPlaceId: onTo,
          updatedBy: DEV_USER,
        },
      });
      await prisma.maybeItem.create({
        data: { tripId, title: 'רעיון', placeId: onIdea, createdBy: DEV_USER, updatedBy: DEV_USER },
      });
      // A place carrying notes is NOT an orphan, and this is the one that would be data
      // loss rather than a stale row: `Note.placeId` cascades, and the notes screen lists
      // them under this place's name (ADR-0153 §8).
      await prisma.note.create({
        data: {
          tripId,
          body: 'שווה לחזור',
          placeId: onNote,
          createdBy: DEV_USER,
          updatedBy: DEV_USER,
        },
      });

      expect(await noGrace(tripId)).toEqual([]);
      expect(await prisma.place.count({ where: { tripId } })).toBe(6);
    });

    // The grace is what makes an undo safe: deleting the last reference orphans a place, and
    // undoing that delete puts the reference back. It also keeps the PAID cache warm across
    // a cancel-and-re-pick (ADR-0108 §3).
    it('spares a freshly orphaned place until the grace has passed', async () => {
      const tripId = await newTrip();
      await service.create(tripId, DEV_USER, { name: 'זה עתה נוצר' });

      expect(await service.sweepOrphans(tripId, DEV_USER)).toEqual([]);
      expect(await prisma.place.count({ where: { tripId } })).toBe(1);
    });

    it('never reaches into another trip', async () => {
      const mine = await newTrip();
      const theirs = await newTrip();
      const theirOrphan = await service.create(theirs, DEV_USER, { name: 'לא שלי' });

      expect(await noGrace(mine)).toEqual([]);
      expect(await prisma.place.findUnique({ where: { id: theirOrphan.id } })).not.toBeNull();
    });

    // Where it runs, which is the whole scheduling decision (§6): a create is the only
    // moment the table grows, so it is the moment it gets tidied — and the row the caller
    // is being handed is never a candidate for its own sweep.
    it('runs on a mint, and never takes the place that mint just made', async () => {
      const tripId = await newTrip();
      const stale = await service.create(tripId, DEV_USER, { name: 'ישן' });
      await prisma.$executeRaw`UPDATE "Place" SET "updatedAt" = NOW() - INTERVAL '30 days' WHERE id = ${stale.id}`;

      const fresh = await service.create(tripId, DEV_USER, { name: 'חדש' });

      const left = await prisma.place.findMany({ where: { tripId } });
      expect(left.map((p) => p.id)).toEqual([fresh.id]);
    });
  });

  // The restore half of the undo (ADR-0157 §4): every field a deleted place carried comes
  // back through `create`, including the two Google-sourced numbers nothing else could
  // re-assert without paying for a second Place Details call.
  it('re-creates a deleted place with its id, its icon and its rating (the undo path)', async () => {
    const tripId = await newTrip();
    const place = await service.create(tripId, DEV_USER, {
      name: 'רמן נאגי',
      icon: '🍜',
      lat: 35.6595,
      lng: 139.7005,
      rating: 4.4,
      userRatingsTotal: 1820,
    });
    expect(place.rating).toBe(4.4);

    await service.remove(tripId, place.id, DEV_USER);
    const restored = await service.create(tripId, DEV_USER, {
      id: place.id,
      name: place.name,
      icon: place.icon,
      lat: place.lat,
      lng: place.lng,
      rating: place.rating,
      userRatingsTotal: place.userRatingsTotal,
    });

    expect(restored.id).toBe(place.id);
    expect(restored.icon).toBe('🍜');
    expect(restored.rating).toBe(4.4);
    expect(restored.userRatingsTotal).toBe(1820);
    // Re-derived rather than restored, which is why the input has no `timezone` field.
    expect(restored.timezone).toBe('Asia/Tokyo');
  });
});
