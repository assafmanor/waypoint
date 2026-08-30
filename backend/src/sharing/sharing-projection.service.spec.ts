import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import {
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  SHARE_DETAIL_LEVEL,
  type ShareDetailLevel,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { generatePublicCode } from '../common/public-code.util';
import { SharingProjectionService } from './sharing-projection.service';
import { ItineraryNarrativeService } from './itinerary-narrative.service';
import { DisabledItineraryNarrativeGenerator } from './itinerary-narrative.generator';

/**
 * The leak fixture, and the point of this whole file.
 *
 * Every value below is something an anonymous reader must never see unless the owner
 * explicitly published it, and each is planted where a lazy projection would pick it up: an
 * email on the member, a confirmation code on the booking, coordinates and a `googlePlaceId`
 * on the place, a note body, a task body, entity ids everywhere. The tests then assert
 * against the SERIALISED projection, because that is the only thing that actually crosses
 * the wire — a mapper that "doesn't read" a field but passes the row through fails here.
 */
const OWNER = 'u-assaf';
const PEER = 'u-noam';
const SECRET = {
  email: 'assaf@example.com',
  confirmationCode: 'KEF-4821',
  googlePlaceId: 'ChIJ_secret_place_id',
  noteBody: 'קוד הכספת בדירה 7731',
  taskBody: 'לאסוף את המפתח מהשכנה',
  lat: 64.1355,
  lng: -21.8954,
} as const;

/** U+2068 FIRST STRONG ISOLATE / U+2069 POP DIRECTIONAL ISOLATE — invisible in a rendered
 *  string, which is exactly why they are asserted by codepoint here. */
const FSI = '\u2068';
const PDI = '\u2069';

/** The words, with the bidi controls taken back off. */
const plain = (value: string): string => value.replace(/[\u2066-\u2069]/g, '');

describe('SharingProjectionService', () => {
  const prisma = new PrismaService();
  const service = new SharingProjectionService(
    prisma,
    // The narrative that actually ships: no provider, so every projection below reads the
    // deterministic strings — which is also the state a provider outage produces.
    new ItineraryNarrativeService(prisma, new DisabledItineraryNarrativeGenerator()),
  );
  const tripIds: string[] = [];
  let tripId: string;
  let documentId: string;
  let otherDocumentId: string;

  async function seedTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'איסלנד עם המשפחה',
        destination: 'Iceland',
        icon: '🇮🇸',
        startDate: new Date('2026-08-29'),
        endDate: new Date('2026-08-31'),
        timezone: 'Atlantic/Reykjavik',
        createdBy: OWNER,
        updatedBy: OWNER,
        memberships: {
          create: [
            { userId: OWNER, role: 'admin' },
            { userId: PEER, role: 'peer' },
          ],
        },
      },
    });
    tripIds.push(trip.id);

    const [kef, apartment] = await Promise.all([
      prisma.place.create({
        data: {
          tripId: trip.id,
          name: 'Keflavík',
          address: 'Keflavíkurflugvöllur',
          googlePlaceId: SECRET.googlePlaceId,
          lat: SECRET.lat,
          lng: SECRET.lng,
          timezone: 'Atlantic/Reykjavik',
          updatedBy: OWNER,
        },
      }),
      prisma.place.create({
        data: {
          tripId: trip.id,
          name: 'Reykjavík',
          nickname: 'רייקיאוויק',
          address: 'Laugavegur 22',
          lat: 64.1466,
          lng: -21.9426,
          timezone: 'Atlantic/Reykjavik',
          updatedBy: OWNER,
        },
      }),
    ]);

    const booking = await prisma.booking.create({
      data: {
        tripId: trip.id,
        type: 'flight',
        title: 'טיסה לאיסלנד',
        confirmationCode: SECRET.confirmationCode,
        provider: 'Icelandair',
        fromPlaceId: apartment.id,
        toPlaceId: kef.id,
        updatedBy: OWNER,
      },
    });

    await prisma.event.createMany({
      data: [
        {
          tripId: trip.id,
          date: new Date('2026-08-29'),
          title: 'נחיתה בקפלוויק',
          icon: '✈️',
          kind: 'hard',
          startsAt: new Date('2026-08-29T09:20:00Z'),
          placeId: null,
          bookingId: booking.id,
          updatedBy: OWNER,
        },
        {
          tripId: trip.id,
          date: new Date('2026-08-29'),
          title: 'כניסה לדירה',
          kind: 'soft',
          startsAt: new Date('2026-08-29T15:00:00Z'),
          placeId: apartment.id,
          updatedBy: OWNER,
        },
        {
          // **01:10 on the 30th is the night of the 29th** (`sharePreviousNight`). Seeded
          // here rather than in a spec of its own because the defect is in the GROUPING,
          // and grouping only exists once there is a day spine to group into.
          tripId: trip.id,
          date: new Date('2026-08-30'),
          title: 'אורות הצפון',
          kind: 'soft',
          startsAt: new Date('2026-08-30T01:10:00Z'),
          placeId: apartment.id,
          updatedBy: OWNER,
        },
        {
          tripId: trip.id,
          date: new Date('2026-08-30'),
          title: 'הליכה לאורך החוף',
          kind: 'soft',
          startsAt: null, // no time at all -> flexible
          placeId: apartment.id,
          updatedBy: OWNER,
        },
      ],
    });

    await prisma.note.create({
      data: {
        tripId: trip.id,
        title: 'פתק',
        body: SECRET.noteBody,
        createdBy: OWNER,
        updatedBy: OWNER,
      },
    });
    await prisma.task.create({
      data: {
        tripId: trip.id,
        title: 'משימה',
        body: SECRET.taskBody,
        createdBy: OWNER,
        updatedBy: OWNER,
      },
    });

    const [mine, theirs] = await Promise.all([
      prisma.document.create({
        data: {
          tripId: trip.id,
          type: 'other',
          title: 'הזמנת הדירה.pdf',
          fileRef: 'ref-shared',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          updatedBy: OWNER,
        },
      }),
      prisma.document.create({
        data: {
          tripId: trip.id,
          type: 'other',
          title: 'דרכון.pdf',
          fileRef: 'ref-private',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          updatedBy: OWNER,
        },
      }),
    ]);
    documentId = mine.id;
    otherDocumentId = theirs.id;
    return trip.id;
  }

  async function shareAt(
    detailLevel: ShareDetailLevel,
    sensitive: Partial<{
      includeBookingSecrets: boolean;
      includeNotesAndTasks: boolean;
      includeTravelerIdentity: boolean;
      withDocument: boolean;
    }> = {},
  ): Promise<string> {
    const code = generatePublicCode();
    await prisma.tripShare.deleteMany({ where: { tripId } });
    await prisma.tripShare.create({
      data: {
        tripId,
        code,
        detailLevel,
        includeBookingSecrets: sensitive.includeBookingSecrets ?? false,
        includeNotesAndTasks: sensitive.includeNotesAndTasks ?? false,
        includeTravelerIdentity: sensitive.includeTravelerIdentity ?? false,
        createdBy: OWNER,
        documents: sensitive.withDocument ? { create: { documentId } } : undefined,
      },
    });
    return code;
  }

  beforeAll(async () => {
    tripId = await seedTrip();
  });

  afterEach(async () => {
    await prisma.tripShare.deleteMany({ where: { tripId } });
  });

  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { id: { in: tripIds.splice(0) } } });
    await prisma.$disconnect();
  });

  it.each([SHARE_DETAIL_LEVEL.SUMMARY, SHARE_DETAIL_LEVEL.FULL, SHARE_DETAIL_LEVEL.EVERYTHING])(
    'never leaks identifiers, emails, coordinates or provider keys in %s',
    async (detailLevel) => {
      const json = JSON.stringify(await service.byCode(await shareAt(detailLevel)));
      expect(json).not.toContain(tripId);
      expect(json).not.toContain(OWNER);
      expect(json).not.toContain(SECRET.email);
      expect(json).not.toContain(SECRET.googlePlaceId);
      expect(json).not.toContain(String(SECRET.lat));
      expect(json).not.toContain(String(SECRET.lng));
      expect(json).not.toContain('fileRef');
      expect(json).not.toContain('ref-private');
    },
  );

  it.each([SHARE_DETAIL_LEVEL.SUMMARY, SHARE_DETAIL_LEVEL.FULL])(
    'withholds every sensitive family below Everything in %s',
    async (detailLevel) => {
      const projection = await service.byCode(await shareAt(detailLevel));
      const json = JSON.stringify(projection);
      expect(projection.appendix).toBeUndefined();
      expect(json).not.toContain(SECRET.confirmationCode);
      expect(json).not.toContain(SECRET.noteBody);
      expect(json).not.toContain(SECRET.taskBody);
      expect(json).not.toContain('אסף');
    },
  );

  it('keeps Summary identity while removing every exact orientation fact', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.SUMMARY));
    const events = projection.days.flatMap((day) => day.sections).flatMap((s) => s.events);

    expect(events[0]).toEqual(
      expect.objectContaining({ title: 'נחיתה בקפלוויק', daypart: SHARE_DAYPART.MORNING }),
    );
    for (const event of events) {
      expect(event.startLabel).toBeUndefined();
      expect(event.address).toBeUndefined();
      expect(event.mapUrl).toBeUndefined();
      expect(event.journey).toBeUndefined();
    }
    expect(JSON.stringify(projection)).not.toContain('09:20');
  });

  it('adds times, addresses and map links at Full', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.FULL));
    const events = projection.days.flatMap((day) => day.sections).flatMap((s) => s.events);
    const arrival = events.find((event) => event.title === 'נחיתה בקפלוויק');
    const checkin = events.find((event) => event.title === 'כניסה לדירה');

    expect(arrival?.startLabel).toBe('09:20');
    expect(checkin?.placeName).toBe('רייקיאוויק'); // the chosen nickname, not the official name
    expect(checkin?.address).toBe('Laugavegur 22');
    expect(checkin?.mapUrl).toContain('google.com/maps');
    // The map link is built from the public label, so it carries no coordinate.
    expect(checkin?.mapUrl).not.toContain(String(SECRET.lat));
  });

  it('groups by daypart, in order, and renders no empty section', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.FULL));
    const firstDay = projection.days[0];

    // `night` is here because the 01:10 event on the 30th belongs to this day's night —
    // and it is LAST, which is the order that made the rollback necessary in the first
    // place: rendered on its own date it would have sat under an evening that had not
    // happened yet.
    expect(firstDay.sections.map((section) => section.daypart)).toEqual([
      SHARE_DAYPART.MORNING,
      SHARE_DAYPART.AFTERNOON,
      SHARE_DAYPART.NIGHT,
    ]);
    for (const section of projection.days.flatMap((day) => day.sections)) {
      expect(section.events.length).toBeGreaterThan(0);
    }
  });

  it('puts an event with no start time in flexible', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.FULL));
    const walk = projection.days
      .flatMap((day) => day.sections)
      .find((section) => section.daypart === SHARE_DAYPART.FLEXIBLE);
    expect(walk?.events[0].title).toBe('הליכה לאורך החוף');
  });

  it('keeps the day spine complete, including a day with nothing on it', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.SUMMARY));
    expect(projection.days.map((day) => day.date)).toEqual([
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
    ]);
    expect(projection.days[2].sections).toEqual([]);
    expect(projection.trip.dayCount).toBe(3);
  });

  it('includes only the Everything families that are switched on', async () => {
    const projection = await service.byCode(
      await shareAt(SHARE_DETAIL_LEVEL.EVERYTHING, { includeBookingSecrets: true }),
    );
    expect(projection.appendix?.bookingSecrets?.[0].lines).toContain(SECRET.confirmationCode);
    expect(projection.appendix?.notesAndTasks).toBeUndefined();
    expect(projection.appendix?.travelers).toBeUndefined();
    expect(JSON.stringify(projection)).not.toContain(SECRET.noteBody);
  });

  it('publishes traveller names and never an email, even at Everything', async () => {
    const projection = await service.byCode(
      await shareAt(SHARE_DETAIL_LEVEL.EVERYTHING, { includeTravelerIdentity: true }),
    );
    expect(projection.appendix?.travelers).toEqual(expect.arrayContaining(['אסף']));
    expect(JSON.stringify(projection)).not.toContain(SECRET.email);
  });

  it('publishes only the documents chosen for this share', async () => {
    const projection = await service.byCode(
      await shareAt(SHARE_DETAIL_LEVEL.EVERYTHING, { withDocument: true }),
    );
    expect(projection.appendix?.documents).toEqual([
      { handle: documentId, title: 'הזמנת הדירה.pdf', mimeType: 'application/pdf' },
    ]);
    expect(JSON.stringify(projection)).not.toContain(otherDocumentId);
  });

  it('derives a route and a day title from real places, with no authored title anywhere', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.SUMMARY));
    expect(projection.trip.routeLabels).toEqual(['רייקיאוויק']);
    // **The kind and its values, never a sentence** (ADR-0213's 2026-08-30 amendment). The
    // words are each renderer's, so what the projection owes is the shape they key off.
    // Day one holds the trip's only flight and is its first day with anything on it, so it
    // is the way out — named by where the trip is GOING, not by the airport it lands at.
    expect(projection.days[0].title).toEqual({
      kind: SHARE_DAY_KIND.FLIGHT_OUT,
      to: 'Iceland',
    });
    expect(projection.days[0].summary).toEqual({
      kind: SHARE_DAY_SUMMARY_KIND.EVENTS,
      titles: ['נחיתה בקפלוויק', 'כניסה לדירה'],
    });
    expect(projection.narrative.source).toBe('deterministic');
  });

  // **The night before is not the morning after** (owner, 2026-08-30: _"The night part gets
  // folded at the end of the wrong day"_). The share groups by daypart and renders `night`
  // last, so a 01:10 event filed on its own calendar date printed below an evening that had
  // happened nineteen hours earlier. `SHARE_DAYPART_START_HOUR.morning` already declared
  // that the day begins at 05:00; the grouping now honours it.
  it('files a pre-dawn event on the night before, not at the foot of its own day', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.FULL));

    const titlesOn = (date: string) =>
      projection.days
        .find((day) => day.date === date)
        ?.sections.flatMap((section) => section.events.map((event) => event.title)) ?? [];

    expect(titlesOn('2026-08-29')).toContain('אורות הצפון');
    expect(titlesOn('2026-08-30')).not.toContain('אורות הצפון');
  });

  // **The route is where the trip WAS, not the airports it passed through** (owner, on the
  // PDF masthead: _"Seems very redundant"_). The flight's endpoints are on its booking, so
  // before this a trip's strip opened and closed on two airport names.
  it('builds the route from settled stops, skipping transport endpoints', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.SUMMARY));
    expect(projection.trip.routeLabels).toEqual(['רייקיאוויק']);
    expect(projection.trip.routeLabels).not.toContain('קפלוויק');
  });

  // `routeLabels` is capped at `MAX_ROUTE_LABELS`; the masthead was printing its length as
  // the trip's `אזורים` count, so a long trip reported eight however many it visited.
  it('counts the whole route, not the capped strip', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.SUMMARY));
    expect(projection.trip.routeStopCount).toBe(1);
  });

  // A booking states its kind, and the kind is what a renderer captions a row from. Nothing
  // operational travels with it — that stays behind Everything's appendix.
  it('carries a booking type, and nothing else off the booking', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.FULL));
    const arrival = projection.days
      .flatMap((day) => day.sections.flatMap((section) => section.events))
      .find((event) => event.title === 'נחיתה בקפלוויק');

    expect(arrival?.bookingType).toBe('flight');
    expect(JSON.stringify(projection)).not.toContain(SECRET.confirmationCode);
  });

  // **A line the server composed cannot be allowed to sniff its own direction** (ADR-0118;
  // the owner's report that route arrows pointed the wrong way when the stops were Latin).
  // The projection is where both renderers get these strings, so the isolates are asserted
  // here rather than once per renderer.
  describe('bidi isolation', () => {
    // **The trip title is the one line the server still composes**, because a generated
    // narrative replaces it with prose and there is no kind to give that. Day titles moved
    // out: they are now a kind plus its values, and each renderer isolates them itself —
    // which is why those assertions are the renderers' and this one is not.
    it('isolates each value in the composed trip title, and not the punctuation', async () => {
      const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.SUMMARY));

      expect(projection.narrative.title).toBe(`${FSI}רייקיאוויק${PDI}`);
      expect(plain(projection.narrative.title)).toBe('רייקיאוויק');
    });

    // A day ships raw values now, so the guarantee the renderers depend on is that nothing
    // arrives pre-wrapped — an isolate applied twice is what puts a stray control character
    // inside a value a renderer then isolates again.
    it('ships day values raw, for the renderer to isolate', async () => {
      const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.SUMMARY));
      expect(JSON.stringify(projection.days)).not.toContain(FSI);
      expect(JSON.stringify(projection.days)).not.toContain(PDI);
    });
  });

  it('makes a revoked code indistinguishable from one that never existed', async () => {
    const code = await shareAt(SHARE_DETAIL_LEVEL.FULL);
    await prisma.tripShare.updateMany({ where: { code }, data: { revokedAt: new Date() } });

    await expect(service.byCode(code)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.byCode('zzzzzzzz')).rejects.toBeInstanceOf(NotFoundException);
  });
});
