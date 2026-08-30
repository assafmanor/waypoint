import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import {
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  SHARE_DETAIL_LEVEL,
  SHARE_OP_KIND,
  type ShareDetailLevel,
} from '@waypoint/shared';
import { EnrichmentService } from '../enrichment/enrichment.service';
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
/** The trip's own name, which is now its title — so the assertion and the fixture cannot
 *  drift apart the way a repeated literal would. */
const TRIP_NAME = 'איסלנד עם המשפחה';

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

/** **A trip whose places carry no enrichment**, which is what every fixture below is and
 *  what a freshly picked place is until a pass runs. The projection reads the store to
 *  reach rung 2 of the place-label chain (the city an airport serves) and takes rung 3 —
 *  the stripped name — when there is nothing there, so this stub exercises the fallback
 *  rather than skipping the chain. `readForPlaces` is the only method it calls, and it
 *  ignores the `stale` half deliberately: a public read must never trigger a fetch. */
const noEnrichment = () =>
  ({ readForPlaces: async () => ({ enrichments: {}, stale: [] }) }) as unknown as EnrichmentService;

describe('SharingProjectionService', () => {
  const prisma = new PrismaService();
  const service = new SharingProjectionService(
    prisma,
    // The narrative that actually ships: no provider, so every projection below reads the
    // deterministic strings — which is also the state a provider outage produces.
    new ItineraryNarrativeService(prisma, new DisabledItineraryNarrativeGenerator()),
    noEnrichment(),
  );
  const tripIds: string[] = [];
  let tripId: string;
  let documentId: string;
  let otherDocumentId: string;

  async function seedTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: TRIP_NAME,
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
    // **The code travels on its row now, not in an appendix** (ADR-0213's 2026-08-30
    // amendment). The toggle is unchanged and still governs whether it exists at all —
    // what changed is where it lands, which is the row whose booking carries it.
    const ops = projection.days.flatMap((day) =>
      day.sections.flatMap((section) => section.events.flatMap((event) => event.ops ?? [])),
    );
    expect(ops).toContainEqual(
      expect.objectContaining({ kind: SHARE_OP_KIND.CODE, code: SECRET.confirmationCode }),
    );
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
    it('titles the trip by its NAME, isolated, and not by a route', async () => {
      const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.SUMMARY));

      // **The trip's own name** (ADR-0213's 2026-08-30 amendment; owner: _"Why נתב״ג to
      // Frankfurt?? What does it have to do with anything?"_). `fallbackTripTitle` composed
      // first-stop → last-stop, and on any trip you fly to both ends are transit airports.
      // A person already named this trip; that name is what they call it.
      expect(projection.narrative.title).toBe(`${FSI}${TRIP_NAME}${PDI}`);
      expect(plain(projection.narrative.title)).toBe(TRIP_NAME);
      expect(projection.narrative.title).not.toContain('←');
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

  /**
   * **The three defects the shipped page showed on the owner's own trip** (ADR-0213's
   * 2026-08-30 amendment). Its own trip, because each needs a shape the fixture above
   * deliberately does not have: two chained flight legs, a stay whose check-in sorts
   * between them, and a note attached to nothing.
   */
  describe('a journey, a stay and what is attached to what', () => {
    let journeyTripId = '';
    let checkInEventId = '';

    beforeAll(async () => {
      const trip = await prisma.trip.create({
        data: {
          name: "איסלנד '26",
          destination: 'איסלנד',
          startDate: new Date('2026-09-11'),
          endDate: new Date('2026-09-12'),
          timezone: 'Atlantic/Reykjavik',
          createdBy: OWNER,
          updatedBy: OWNER,
        },
      });
      journeyTripId = trip.id;
      await prisma.membership.create({
        data: { tripId: trip.id, userId: OWNER, role: 'admin' },
      });

      const place = (name: string) =>
        prisma.place.create({
          data: { tripId: trip.id, name, timezone: 'UTC', updatedBy: OWNER },
        });
      const [tlv, vie, kef, hotel] = await Promise.all([
        place('נמל התעופה בן גוריון'),
        place('נמל התעופה הבינלאומי של וינה'),
        place('נמל התעופה הבינלאומי קפלאוויק'),
        place('Gissurarbud 5'),
      ]);

      const leg = async (from: string, to: string, startsAt: string, endsAt: string) => {
        const booking = await prisma.booking.create({
          data: {
            tripId: trip.id,
            type: 'flight',
            title: 'טיסה',
            fromPlaceId: from,
            toPlaceId: to,
            updatedBy: OWNER,
          },
        });
        return prisma.event.create({
          data: {
            tripId: trip.id,
            date: new Date('2026-09-11'),
            title: 'טיסה',
            kind: 'hard',
            startsAt: new Date(startsAt),
            endsAt: new Date(endsAt),
            bookingId: booking.id,
            updatedBy: OWNER,
          },
        });
      };
      await leg(tlv.id, vie.id, '2026-09-11T14:30:00Z', '2026-09-11T18:15:00Z');

      // **The row that made the report.** Its 17:00 check-in sorts between the two legs,
      // and its 17:00→13:00 span reads backwards because it crosses midnight.
      const stayBooking = await prisma.booking.create({
        data: {
          tripId: trip.id,
          type: 'hotel',
          title: 'Gissurarbud 5',
          confirmationCode: 'HMXXJZ2FCT',
          provider: 'Airbnb',
          placeId: hotel.id,
          updatedBy: OWNER,
        },
      });
      const checkIn = await prisma.event.create({
        data: {
          tripId: trip.id,
          date: new Date('2026-09-11'),
          title: 'Gissurarbud 5',
          kind: 'hard',
          startsAt: new Date('2026-09-11T17:00:00Z'),
          endsAt: new Date('2026-09-12T13:00:00Z'),
          placeId: hotel.id,
          bookingId: stayBooking.id,
          updatedBy: OWNER,
        },
      });
      checkInEventId = checkIn.id;
      await leg(vie.id, kef.id, '2026-09-11T19:00:00Z', '2026-09-11T23:20:00Z');

      await prisma.note.createMany({
        data: [
          {
            tripId: trip.id,
            title: 'חניה בצד המערבי',
            eventId: checkIn.id,
            createdBy: OWNER,
            updatedBy: OWNER,
          },
          // Attached to nothing — the packing list, and the row the shipped page published
          // under a toggle promising `רק תוכן שמחובר למסלול`.
          { tripId: trip.id, title: 'נעלי הליכה', createdBy: OWNER, updatedBy: OWNER },
        ],
      });
    });

    afterAll(async () => {
      if (journeyTripId) await prisma.trip.deleteMany({ where: { id: journeyTripId } });
    });

    const project = async (
      sensitive: Partial<{ includeNotesAndTasks: boolean; includeBookingSecrets: boolean }> = {},
    ) => {
      const code = generatePublicCode();
      await prisma.tripShare.deleteMany({ where: { tripId: journeyTripId } });
      await prisma.tripShare.create({
        data: {
          tripId: journeyTripId,
          code,
          detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
          includeBookingSecrets: sensitive.includeBookingSecrets ?? false,
          includeNotesAndTasks: sensitive.includeNotesAndTasks ?? false,
          includeTravelerIdentity: false,
          createdBy: OWNER,
        },
      });
      return service.byCode(code);
    };

    it('makes two chained legs one journey, and names the wait between them', async () => {
      const rows = (await project()).days[0].sections.flatMap((section) => section.events);

      // One row for the pair, not two — and not three, which is what the shipped page drew
      // once the check-in had sorted itself into the middle.
      const journeys = rows.filter((event) => event.legs);
      expect(journeys).toHaveLength(1);
      expect(journeys[0].legs).toHaveLength(2);

      // 18:15 to 19:00. The gap is derived, never stored — which is why the half-built
      // `layoverMinutes` column written for this was reverted rather than migrated.
      expect(journeys[0].legs?.[0].layoverMinutes).toBeUndefined();
      expect(journeys[0].legs?.[1].layoverMinutes).toBe(45);

      // The journey carries the WHOLE span: the first leg's departure and the last leg's
      // arrival, so a renderer ignoring `legs` still shows one true row.
      expect(journeys[0].startLabel).toBe('14:30');
      expect(journeys[0].endLabel).toBe('23:20');
    });

    it('lifts the stay out of the schedule and onto the day', async () => {
      const day = (await project()).days[0];
      expect(day.stay).toBe('Gissurarbud 5');

      // And it is no longer a row, so nothing can sort between the flight legs and nothing
      // prints `17:00–13:00`.
      const rows = day.sections.flatMap((section) => section.events);
      expect(rows.map((event) => event.title)).not.toContain('Gissurarbud 5');
    });

    it('strips the airport noise the app already strips everywhere else', async () => {
      const rows = (await project()).days[0].sections.flatMap((section) => section.events);
      const journey = rows.find((event) => event.legs);
      // `shortPlaceLabel`, reached through the shared chain. With no enrichment stored
      // there is no `servedCity`, so this is rung 3 — and rung 3 alone already turns
      // `נמל התעופה הבינלאומי של וינה` into `וינה`.
      expect(plain(journey?.legs?.[0].title ?? '')).toContain('וינה');
      expect(journey?.legs?.[0].title).not.toContain('נמל התעופה');
    });

    it('publishes only the notes attached to the itinerary, and says where the rest go', async () => {
      const projection = await project({ includeNotesAndTasks: true });
      const rows = projection.days[0].sections.flatMap((section) => section.events);

      // **The privacy defect.** The toggle promises `רק תוכן שמחובר למסלול` and the query
      // was `where: { tripId }` with no linkage filter, so an unattached packing list was
      // published on the schedule. It is still published — the toggle is on — but under
      // the block that says what it is, never as itinerary content.
      // This note hangs off the CHECK-IN, and a check-in is the day's stay rather than one
      // of its rows — so it travels with the stay into the commitments block. That is the
      // one place the row's material can land once the row itself has left the schedule,
      // and it is where a reader looks for a hotel anyway.
      const attached = [
        ...rows.flatMap((event) => event.ops ?? []),
        ...projection.commitments.flatMap((row) => row.ops ?? []),
      ];
      expect(attached).toContainEqual({ kind: SHARE_OP_KIND.NOTE, title: 'חניה בצד המערבי' });
      expect(attached).not.toContainEqual(expect.objectContaining({ title: 'נעלי הליכה' }));
      expect(projection.appendix?.notesAndTasks).toContainEqual(
        expect.objectContaining({ title: 'נעלי הליכה' }),
      );
    });

    it('never publishes an op when its family is switched off', async () => {
      const projection = await project();
      const ops = projection.days[0].sections.flatMap((section) =>
        section.events.flatMap((event) => event.ops ?? []),
      );
      expect(ops).toHaveLength(0);
      expect(JSON.stringify(projection)).not.toContain('HMXXJZ2FCT');
      expect(JSON.stringify(projection)).not.toContain('חניה בצד המערבי');
    });

    it('lists the trip fixed points once, with the nights collapsed', async () => {
      const { commitments } = await project();
      expect(commitments.map((row) => row.bookingType)).toEqual(['flight', 'hotel', 'flight']);
      expect(commitments.every((row) => row.dayOrdinal === 1)).toBe(true);
    });

    it('keeps the check-in event reachable by id for its own ops', async () => {
      const projection = await project({ includeBookingSecrets: true });
      // The stay left the schedule, so its confirmation code has no row to sit on — it
      // travels on the day's commitment row instead of vanishing.
      expect(checkInEventId).not.toBe('');
      expect(JSON.stringify(projection)).toContain('HMXXJZ2FCT');
    });
  });
});
