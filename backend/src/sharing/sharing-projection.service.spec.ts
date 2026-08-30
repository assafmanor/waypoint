import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SHARE_DAYPART, SHARE_DETAIL_LEVEL, type ShareDetailLevel } from '@waypoint/shared';
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

    expect(firstDay.sections.map((section) => section.daypart)).toEqual([
      SHARE_DAYPART.MORNING,
      SHARE_DAYPART.AFTERNOON,
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
    // Read through the bidi controls: every projected value the server COMPOSED carries
    // isolates now, and what this test is about is which words came out (see the
    // `bidi isolation` block for the controls themselves).
    expect(plain(projection.days[0].title)).toBe('רייקיאוויק');
    expect(plain(projection.days[0].summary)).toBe('נחיתה בקפלוויק · כניסה לדירה');
    expect(projection.narrative.source).toBe('deterministic');
  });

  // **A line the server composed cannot be allowed to sniff its own direction** (ADR-0118;
  // the owner's report that route arrows pointed the wrong way when the stops were Latin).
  // The projection is where both renderers get these strings, so the isolates are asserted
  // here rather than once per renderer.
  describe('bidi isolation', () => {
    it('isolates each value and leaves the punctuation between them alone', async () => {
      const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.SUMMARY));

      expect(projection.days[0].title).toBe(`${FSI}רייקיאוויק${PDI}`);
      expect(projection.days[0].summary).toBe(
        `${FSI}נחיתה בקפלוויק${PDI} · ${FSI}כניסה לדירה${PDI}`,
      );
      // The separator itself must NOT be isolated — it belongs to the RTL flow, which is
      // what puts it between the values rather than at one end of them.
      expect(projection.days[0].summary).not.toContain(`${PDI}${FSI}`);
    });
  });

  it('makes a revoked code indistinguishable from one that never existed', async () => {
    const code = await shareAt(SHARE_DETAIL_LEVEL.FULL);
    await prisma.tripShare.updateMany({ where: { code }, data: { revokedAt: new Date() } });

    await expect(service.byCode(code)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.byCode('zzzzzzzz')).rejects.toBeInstanceOf(NotFoundException);
  });
});
