import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import {
  NO_SENSITIVE_FIELDS,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  SHARE_DETAIL_LEVEL,
  SHARE_OP_KIND,
  TIME_MEANING,
  TRAVEL_MODE,
  routeLegKey,
  type ShareDetailLevel,
} from '@waypoint/shared';
import { EnrichmentService } from '../enrichment/enrichment.service';
import { PrismaService } from '../prisma/prisma.service';
import { generatePublicCode } from '../common/public-code.util';
import { sharePolicyHash } from './share-policy';
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

/** A store that answers with exactly what a test hands it, keyed by place id. `readForPlaces`
 *  is the only method the projection calls, and it drops the `stale` half deliberately — a
 *  public read must never trigger a fetch. */
const enrichmentOf = (byPlaceId: Record<string, unknown>) =>
  ({
    readForPlaces: async () => ({ enrichments: byPlaceId, stale: [] }),
  }) as unknown as EnrichmentService;

/** The provenance a delivered value carries. `confidence` is the field under test; the rest
 *  is the shape `deliveredImageValueSchema` requires. */
const imageValue = (confidence: number, extra: Record<string, unknown> = {}) => ({
  url: '/enrichment/images/abc',
  mimeType: 'image/jpeg',
  width: 1200,
  height: 800,
  sizeBytes: 90_000,
  source: 'commons',
  license: 'CC BY-SA 4.0',
  attribution: 'A. Photographer',
  fetchedAt: '2026-08-01T00:00:00.000Z',
  method: 'name_proximity',
  ref: 'Q38519',
  confidence,
  ...extra,
});

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
          // **`lodging` is what makes this a HELD edge** (ADR-0063 / ADR-0184). The profile
          // resolves from the CATEGORY, with the glyph only refining it — so a check-in with
          // no category is an ordinary point, and one with `lodging` has `midSpan.kind:
          // 'held'`, which is what makes `edgeMeaning` answer `not-before` for its start: a
          // room you may take FROM 15:00, never an appointment at 15:00.
          category: 'lodging',
          icon: '🏨',
          kind: 'soft',
          startsAt: new Date('2026-08-29T15:00:00Z'),
          // Three days later: the far end of a held span, and the reason a "print both ends"
          // rule reads `15:00–11:00` on a row like this.
          endsAt: new Date('2026-09-01T11:00:00Z'),
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
          // **A SOFT span with two ends** (2026-08-31). The row ADR-0213 §6's `hard` gate
          // truncated on paper while the reader page printed it whole — the disagreement
          // that report is about, seeded so a spec can name it.
          endsAt: new Date('2026-08-30T02:40:00Z'),
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
        policyHash: sharePolicyHash({
          detailLevel,
          sensitive: {
            bookingSecrets: sensitive.includeBookingSecrets ?? false,
            notesAndTasks: sensitive.includeNotesAndTasks ?? false,
            travelerIdentity: sensitive.includeTravelerIdentity ?? false,
          },
          documentIds: sensitive.withDocument ? [documentId] : [],
        }),
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
      // …including the meaning-bearing one, which is the same rule and a second field to
      // forget (ADR-0213's 2026-08-31 amendment §1).
      expect(event.time).toBeUndefined();
      expect(event.address).toBeUndefined();
      expect(event.mapUrl).toBeUndefined();
      expect(event.journey).toBeUndefined();
    }
    // **Searched over the DAYS, not the whole projection** (2026-08-31). Stringifying the
    // whole thing includes `generatedAt`, a real server stamp — so this assertion failed on
    // CI the moment a run happened to land in the second `10:09:20`, and the received blob in
    // that log reads `"generatedAt":"2026-08-31T10:09:20.560Z"`. A latent time bomb rather
    // than a defect: `09:20` matches any stamp carrying that substring, which is several
    // minutes of every day. The exact facts this test is about live in `days`, and the server
    // metadata around them was never its subject.
    expect(JSON.stringify(projection.days)).not.toContain('09:20');
  });

  /** **And the assertion above is not vacuous**, which is the failure mode an absence test
   *  has: the SAME literal in the SAME place is present at Full, so Summary's silence is a
   *  real difference rather than an empty search. */
  it('proves that absence by finding the same time at Full', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.FULL));
    expect(JSON.stringify(projection.days)).toContain('09:20');
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

  /**
   * **WHAT A ROW'S CLOCK MEANS** (ADR-0213's 2026-08-31 amendment §1; owner: _"whenever
   * there's a time range, we should display it. That also includes flexible times like
   * starting from.. Or until..."_).
   *
   * The rule this replaced was `event.hard`, ADR-0011's COMMITMENT axis answering a question
   * about MEANING — which is why paper withheld a soft span's end while the reader page
   * printed it, and why a booking-backed `held` span printed its far end as though the two
   * were one afternoon.
   */
  it('says what each clock means, off `edgeMeaning` rather than off `hard`', async () => {
    const projection = await service.byCode(await shareAt(SHARE_DETAIL_LEVEL.FULL));
    const events = projection.days.flatMap((day) => day.sections).flatMap((s) => s.events);

    // An ordinary point: one clock, and nothing invented beside it.
    const arrival = events.find((event) => event.title === 'נחיתה בקפלוויק');
    expect(arrival?.time).toEqual({ label: '09:20', meaning: 'exact' });

    // **A SOFT span keeps both ends** — the row the two renderers disagreed about, since
    // §6's `hard` gate withheld it on paper and never on the phone.
    const lights = events.find((event) => event.title === 'אורות הצפון');
    expect(lights?.hard).toBeFalsy();
    expect(lights?.time).toEqual({ label: '01:10', endLabel: '02:40', meaning: 'exact' });

    // **A held resource's start is a FLOOR, never half a range.** Its `endsAt` is three days
    // later, so a rule that printed "both ends whenever there are two" would read
    // `15:00–11:00` here — the exact reversed range the fourth amendment pulled stays out of
    // the schedule over, and which survived in every other `held` row until this change.
    const checkin = events.find((event) => event.title === 'כניסה לדירה');
    expect(checkin?.time).toEqual({ label: '15:00', meaning: 'not-before' });
    // The raw pair is still projected — the journey header and its legs read it — and this
    // row deliberately does not print it.
    expect(checkin?.endLabel).toBe('11:00');
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

  /**
   * **The zone travels; "today" does not** (ADR-0213's eleventh amendment §6). Every other
   * time on this contract is pre-formatted so two renderers cannot format one instant two
   * ways — but a stamped calendar day would be stale a minute after it was sent, on a page
   * that holds its projection in memory for as long as the tab is open. So the reader's own
   * device resolves the day, from the trip's primary zone, at every level: it is implied by
   * the destination the masthead already prints and reveals nothing the link did not.
   */
  it('ships the trip zone at every level, and never a stamped today', async () => {
    for (const level of [
      SHARE_DETAIL_LEVEL.SUMMARY,
      SHARE_DETAIL_LEVEL.FULL,
      SHARE_DETAIL_LEVEL.EVERYTHING,
    ]) {
      const projection = await service.byCode(await shareAt(level));
      expect(projection.trip.timezone).toBe('Atlantic/Reykjavik');
      // Strict schemas make this an assertion about the CONTRACT and not just this response:
      // an added `today` would have to be declared, and declaring it is what this refuses.
      expect(Object.keys(projection.trip)).not.toContain('today');
    }
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
    expect(projection.appendix?.ops).toBeUndefined();
    expect(projection.trip.travelers).toBeUndefined();
    expect(JSON.stringify(projection)).not.toContain(SECRET.noteBody);
  });

  it('publishes traveller names and never an email, even at Everything', async () => {
    const projection = await service.byCode(
      await shareAt(SHARE_DETAIL_LEVEL.EVERYTHING, { includeTravelerIdentity: true }),
    );
    // On the trip, not in a block at the foot: who is going is part of the trip's identity.
    expect(projection.trip.travelers).toEqual(expect.arrayContaining(['אסף']));
    expect(projection.appendix?.ops).toBeUndefined();
    expect(JSON.stringify(projection)).not.toContain(SECRET.email);
  });

  it('publishes only the documents chosen for this share', async () => {
    const projection = await service.byCode(
      await shareAt(SHARE_DETAIL_LEVEL.EVERYTHING, { withDocument: true }),
    );
    // Attached to no event, so it rides the appendix — as a `FILE` op, the same shape the
    // rows carry, rather than a per-family list of its own.
    expect(projection.appendix?.ops).toEqual([
      {
        kind: SHARE_OP_KIND.FILE,
        handle: documentId,
        title: 'הזמנת הדירה.pdf',
        mimeType: 'application/pdf',
      },
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
          policyHash: sharePolicyHash({
            detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
            sensitive: {
              bookingSecrets: sensitive.includeBookingSecrets ?? false,
              notesAndTasks: sensitive.includeNotesAndTasks ?? false,
              travelerIdentity: false,
            },
            documentIds: [],
          }),
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
      // **And so does `time`, which is the field a renderer actually spells** (2026-09-01).
      // `endLabel` was overridden for the journey and `time` was not, so it still described
      // leg one — invisible on the reader page, which derived its own span, and printed on
      // paper, which obeys the contract. Asserting the pair together is what stops one of
      // them going stale again.
      expect(journeys[0].time).toEqual({
        label: '14:30',
        endLabel: '23:20',
        meaning: TIME_MEANING.EXACT,
      });
    });

    /**
     * **The reported case: a red-eye whose second leg lands on the next calendar day**
     * (owner, 2026-08-30: _"Sometimes journeys with layovers aren't recognized properly, for
     * example when it crosses a day"_).
     *
     * The chain condition never had anything to do with the calendar — only the loop did:
     * `withJourneys` walked one day's own events, so the two legs of exactly the flight most
     * likely to HAVE a layover were two unrelated rows on two different days. The pass now
     * runs over the whole trip, and the journey belongs to the day it departs on.
     */
    it('chains a journey whose second leg lands on the next day', async () => {
      const trip = await prisma.trip.create({
        data: {
          name: 'לילה באוויר',
          destination: 'Iceland',
          startDate: new Date('2026-09-11'),
          endDate: new Date('2026-09-12'),
          timezone: 'UTC',
          createdBy: OWNER,
          updatedBy: OWNER,
        },
      });
      await prisma.membership.create({ data: { tripId: trip.id, userId: OWNER, role: 'admin' } });
      const place = (name: string) =>
        prisma.place.create({ data: { tripId: trip.id, name, timezone: 'UTC', updatedBy: OWNER } });
      const [tlv, vie, kef] = await Promise.all([place('TLV'), place('VIE'), place('KEF')]);

      const leg = async (
        from: string,
        to: string,
        date: string,
        startsAt: string,
        endsAt: string,
      ) => {
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
        await prisma.event.create({
          data: {
            tripId: trip.id,
            date: new Date(date),
            title: 'טיסה',
            kind: 'hard',
            startsAt: new Date(startsAt),
            endsAt: new Date(endsAt),
            bookingId: booking.id,
            updatedBy: OWNER,
          },
        });
      };
      // Departs 22:40 on the 11th, lands 01:15 on the 12th — the two legs are on two days.
      await leg(tlv.id, vie.id, '2026-09-11', '2026-09-11T22:40:00Z', '2026-09-12T01:15:00Z');
      await leg(vie.id, kef.id, '2026-09-12', '2026-09-12T03:05:00Z', '2026-09-12T05:50:00Z');

      const code = generatePublicCode();
      await prisma.tripShare.create({
        data: {
          tripId: trip.id,
          code,
          createdBy: OWNER,
          detailLevel: SHARE_DETAIL_LEVEL.FULL,
          policyHash: sharePolicyHash({
            detailLevel: SHARE_DETAIL_LEVEL.FULL,
            sensitive: NO_SENSITIVE_FIELDS,
            documentIds: [],
          }),
        },
      });
      const projection = await service.byCode(code);
      const rowsOf = (index: number) =>
        projection.days[index].sections.flatMap((section) => section.events);

      // One journey, on the day it DEPARTS — which is the day a reader is packing for.
      const journeys = projection.days.flatMap((day) =>
        day.sections.flatMap((section) => section.events.filter((event) => event.legs)),
      );
      expect(journeys).toHaveLength(1);
      expect(journeys[0].legs).toHaveLength(2);
      expect(rowsOf(0).filter((event) => event.legs)).toHaveLength(1);

      // 01:15 to 03:05. The wait is what the whole chain exists to name.
      expect(journeys[0].legs?.[1].layoverMinutes).toBe(110);

      // **And the day it flew through is folded into the card, not left blank** (owner,
      // 2026-08-31). It has no rows of its own — the journey took them — so it stops being a
      // card and becomes this one's `endDate`, which is what the header prints as `11–12`.
      expect(projection.days).toHaveLength(1);
      expect(projection.days[0].endDate).toBe('2026-09-12');

      // **The journey totals; a leg states its own flight time and not the clock change**
      // (ADR-0213 ninth amendment §2).
      //
      // This assertion is INVERTED from the one it replaces, on purpose. The eighth
      // amendment read the owner's "confusing" as too many numbers and removed both leg
      // fields; the owner asked the duration back the same day, and the container — not the
      // arithmetic — is what stopped a connecting flight reading as three peers.
      expect(journeys[0].durationMinutes).toBeGreaterThan(0);
      // No assertion on the journey's zone shift here: this fixture's trip is single-zone
      // (`UTC`), so an absent shift is the correct answer and asserting one would be
      // asserting the fixture rather than the rule.
      // Where it ENDS, for the container's header: the legs already spell the route out.
      expect(journeys[0].journeyTo).toBeTruthy();
      for (const leg of journeys[0].legs ?? []) {
        expect(leg.durationMinutes).toBeGreaterThan(0);
        // The shift a traveller acts on is origin-to-destination, so it stays on the
        // journey — and `SharedLeg` does not declare it, so this reads the keys.
        expect(Object.keys(leg)).not.toContain('zoneShiftMinutes');
      }

      await prisma.trip.deleteMany({ where: { id: trip.id } });
    });

    /**
     * **A nine-hour wait is not a layover, and treating it as one emptied a day** (owner,
     * 2026-08-30: _"the next flight is only at 11am to 3pm, so well after the previous day,
     * yet it shows on the prev day. The last day is then rendered empty"_).
     *
     * A journey renders on the day its first leg departs, and a 02:00 departure belongs to
     * the night before (`sharePreviousNight`) — so chaining a 02:00 arrival to an 11:00
     * departure moved the whole return two days back and left the trip's last day blank.
     */
    it('refuses to chain two legs separated by more than a layover', async () => {
      const trip = await prisma.trip.create({
        data: {
          name: 'יום שלם בשדה',
          destination: 'Iceland',
          startDate: new Date('2026-09-11'),
          endDate: new Date('2026-09-12'),
          timezone: 'UTC',
          createdBy: OWNER,
          updatedBy: OWNER,
        },
      });
      await prisma.membership.create({ data: { tripId: trip.id, userId: OWNER, role: 'admin' } });
      const place = (name: string) =>
        prisma.place.create({ data: { tripId: trip.id, name, timezone: 'UTC', updatedBy: OWNER } });
      const [kef, fra, tlv] = await Promise.all([place('KEF'), place('FRA'), place('TLV')]);
      const leg = async (from: string, to: string, date: string, a: string, b: string) => {
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
        await prisma.event.create({
          data: {
            tripId: trip.id,
            date: new Date(date),
            title: 'טיסה',
            kind: 'hard',
            startsAt: new Date(a),
            endsAt: new Date(b),
            bookingId: booking.id,
            updatedBy: OWNER,
          },
        });
      };
      // Lands 02:00, next departs 11:00 — nine hours, which is a day, not a connection.
      await leg(kef.id, fra.id, '2026-09-12', '2026-09-11T22:00:00Z', '2026-09-12T02:00:00Z');
      await leg(fra.id, tlv.id, '2026-09-12', '2026-09-12T11:00:00Z', '2026-09-12T15:00:00Z');

      const code = generatePublicCode();
      await prisma.tripShare.create({
        data: {
          tripId: trip.id,
          code,
          createdBy: OWNER,
          detailLevel: SHARE_DETAIL_LEVEL.FULL,
          policyHash: sharePolicyHash({
            detailLevel: SHARE_DETAIL_LEVEL.FULL,
            sensitive: NO_SENSITIVE_FIELDS,
            documentIds: [],
          }),
        },
      });
      const projection = await service.byCode(code);
      const rowsOf = (index: number) =>
        projection.days[index].sections.flatMap((section) => section.events);

      // Two separate rows, not one journey — and crucially the LAST day still has content.
      expect(
        projection.days
          .flatMap((d) => d.sections.flatMap((x) => x.events))
          .filter((event) => event.legs),
      ).toHaveLength(0);
      expect(rowsOf(projection.days.length - 1).length).toBeGreaterThan(0);

      await prisma.trip.deleteMany({ where: { id: trip.id } });
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
      expect(projection.appendix?.ops).toContainEqual(
        expect.objectContaining({ kind: SHARE_OP_KIND.NOTE, title: 'נעלי הליכה' }),
      );
      // **And the attached note is NOT here too.** The assertion this pair was missing, and
      // its absence is why the defect shipped: `buildAppendix` ran its own unfiltered
      // `where: { tripId }` queries beside `loadOps`, so EVERY note was published here —
      // the one-directional check above passed either way. The appendix is what has no
      // host, and a note with a host appears exactly once, on it.
      expect(projection.appendix?.ops).not.toContainEqual(
        expect.objectContaining({ title: 'חניה בצד המערבי' }),
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
  /**
   * **The photo gate and the majority rule** (ADR-0213 / ADR-0166's 2026-08-30 amendments).
   * Both are places where a confident wrong answer is expensive and a missing answer is
   * cheap, so both are tested for what they REFUSE as much as for what they produce.
   */
  describe('what enrichment adds, and what it refuses to add', () => {
    /** The projection, with a store that answers for the trip's places. Built per test
     *  because the enrichment is the variable under test. */
    const project = async (byPlaceId: Record<string, unknown>) => {
      const withStore = new SharingProjectionService(
        prisma,
        new ItineraryNarrativeService(prisma, new DisabledItineraryNarrativeGenerator()),
        enrichmentOf(byPlaceId),
      );
      return withStore.byCode(await shareAt(SHARE_DETAIL_LEVEL.FULL));
    };

    const placeIds = async () =>
      (await prisma.place.findMany({ where: { tripId }, select: { id: true, name: true } })).reduce<
        Record<string, string>
      >((all, place) => ({ ...all, [place.name]: place.id }), {});

    it('publishes no photo below the confidence floor, and one at it', async () => {
      const ids = await placeIds();
      const under = await project({ [ids['Reykjavík']]: { image: imageValue(0.8) } });
      // 0.8 is `geosearch`: found by coordinates, corroborated by nothing readable. Enough
      // for a summary, not enough for a picture — a wrong photo is visibly wrong.
      expect(under.days.some((day) => day.photo)).toBe(false);

      const at = await project({ [ids['Reykjavík']]: { image: imageValue(0.9) } });
      // 0.9 is `name_proximity`: the name agreed.
      expect(at.days.some((day) => day.photo)).toBe(true);
    });

    it('publishes no photo it cannot credit, however confident the match', async () => {
      const ids = await placeIds();
      // 27 of the 32 Commons files ADR-0166 §12.2 surveyed require attribution. A file we
      // cannot credit is one we may not publish — the licence is not ours to drop.
      const projection = await project({
        [ids['Reykjavík']]: { image: imageValue(1, { attribution: undefined, license: '' }) },
      });
      expect(projection.days.some((day) => day.photo)).toBe(false);
    });

    it('carries the credit with the photo, never the photo alone', async () => {
      const ids = await placeIds();
      const projection = await project({ [ids['Reykjavík']]: { image: imageValue(1) } });
      const photo = projection.days.find((day) => day.photo)?.photo;
      expect(photo?.credit).toContain('A. Photographer');
      expect(photo?.credit).toContain('CC BY-SA 4.0');
      expect(photo?.url).toBe('/enrichment/images/abc');
    });

    it('names a stop by what it is, in the reader language', async () => {
      const ids = await placeIds();
      const projection = await project({
        [ids['Reykjavík']]: {
          summary: { he: { value: 'בירת איסלנד ועיר הנמל שלה', lang: 'he' } },
        },
      });
      const captions = projection.days.flatMap((day) =>
        day.sections.flatMap((section) => section.events.map((event) => event.caption)),
      );
      expect(captions).toContain('בירת איסלנד ועיר הנמל שלה');
    });

    it('refuses to name a day for a region only one of its stops agrees on', async () => {
      const ids = await placeIds();
      // One stop out of several is not a day about that region, and naming it one is the
      // same confident-and-wrong move as `Stuðlagil Canyon ← Baugur Bjólfs`.
      const projection = await project({
        [ids['Reykjavík']]: { region: { he: { value: 'מיוואטן', lang: 'he' } } },
      });
      expect(projection.days.every((day) => day.title.kind !== 'region')).toBe(true);
    });
  });

  /**
   * **A row with no place must not delete the journeys around it** (owner, 2026-08-31:
   * _"between day parts, the transit line gets omitted"_).
   *
   * Reported against the dayparts and it is not a daypart bug — the sections are cut from
   * the same rows the pairing walks. `journeyLookup` used to pair `events[i - 1]` with
   * `events[i]`, so an ice cave with no address broke the chain on BOTH sides and a day with
   * three drives printed one. The fixture is that exact shape: placed → placeless → placed,
   * with a stored leg for the two ENDS and none for either adjacent pair, so the assertion
   * can only pass if the pairing skipped the middle row.
   */
  describe('the journey between two placed rows, across a row with no place', () => {
    let gapTripId = '';
    let farEventId = '';

    const A = { lat: 64.1466, lng: -21.9426 };
    const B = { lat: 63.9861, lng: -22.5654 };

    beforeAll(async () => {
      const trip = await prisma.trip.create({
        data: {
          name: 'איסלנד · מערות',
          destination: 'איסלנד',
          startDate: new Date('2026-09-11'),
          endDate: new Date('2026-09-11'),
          timezone: 'Atlantic/Reykjavik',
          createdBy: OWNER,
          updatedBy: OWNER,
          memberships: { create: [{ userId: OWNER, role: 'admin' }] },
        },
      });
      gapTripId = trip.id;

      const [near, far] = await Promise.all([
        prisma.place.create({
          data: {
            tripId: trip.id,
            name: 'רייקיאוויק',
            lat: A.lat,
            lng: A.lng,
            timezone: 'Atlantic/Reykjavik',
            updatedBy: OWNER,
          },
        }),
        prisma.place.create({
          data: {
            tripId: trip.id,
            name: 'הבלו לגון',
            lat: B.lat,
            lng: B.lng,
            timezone: 'Atlantic/Reykjavik',
            updatedBy: OWNER,
          },
        }),
      ]);

      const event = (title: string, at: string, placeId?: string) =>
        prisma.event.create({
          data: {
            tripId: trip.id,
            date: new Date('2026-09-11'),
            title,
            kind: 'soft',
            startsAt: new Date(at),
            placeId,
            updatedBy: OWNER,
          },
        });
      await event('ארוחת בוקר', '2026-09-11T08:00:00Z', near.id);
      // No place at all: the row the owner's screenshot showed, and the one that used to
      // swallow the drive on either side of it.
      await event('צפייה בזוהר הצפוני', '2026-09-11T12:00:00Z');
      const arrival = await event('הבלו לגון', '2026-09-11T16:00:00Z', far.id);
      farEventId = arrival.id;

      // The trip has no booking, so `derivedTravelMode` cannot infer a car; the seeded walk
      // is what `defaultLegTravelMode` reads to pick a mode, and the driving row is what the
      // projection then prints. Both are needed — one alone answers a different question.
      await prisma.routeLeg.createMany({
        data: [TRAVEL_MODE.WALKING, TRAVEL_MODE.DRIVING].map((mode) => ({
          key: routeLegKey(A, B, mode),
          mode,
          fromLat: A.lat,
          fromLng: A.lng,
          toLat: B.lat,
          toLng: B.lng,
          durationSeconds: mode === TRAVEL_MODE.WALKING ? 32_400 : 2_700,
          distanceMeters: 48_000,
          provider: 'test',
        })),
      });
    });

    afterAll(async () => {
      await prisma.routeLeg.deleteMany({
        where: {
          key: { in: [TRAVEL_MODE.WALKING, TRAVEL_MODE.DRIVING].map((m) => routeLegKey(A, B, m)) },
        },
      });
      if (gapTripId) await prisma.trip.deleteMany({ where: { id: gapTripId } });
    });

    it('prints the drive on the row it leads into, not nowhere', async () => {
      const code = generatePublicCode();
      await prisma.tripShare.create({
        data: {
          tripId: gapTripId,
          code,
          policyHash: sharePolicyHash({
            detailLevel: SHARE_DETAIL_LEVEL.FULL,
            sensitive: { bookingSecrets: false, notesAndTasks: false, travelerIdentity: false },
            documentIds: [],
          }),
          detailLevel: SHARE_DETAIL_LEVEL.FULL,
          includeBookingSecrets: false,
          includeNotesAndTasks: false,
          includeTravelerIdentity: false,
          createdBy: OWNER,
        },
      });
      const projection = await service.byCode(code);
      const rows = projection.days.flatMap((day) =>
        day.sections.flatMap((section) => section.events),
      );

      // The far row carries it, which is what puts the line in that row's own daypart —
      // "the most fitting part of the day" in the report's words.
      const arrival = rows.find((event) => event.title.includes('הבלו לגון'));
      expect(arrival?.journey).toEqual({ mode: TRAVEL_MODE.DRIVING, minutes: 45, km: 48 });
      expect(farEventId).toBeTruthy();

      // **And exactly one row carries a journey.** A pairing that also emitted one for the
      // placeless row would satisfy the assertion above and still be wrong: there is no
      // second known point for it to be a journey TO.
      expect(rows.filter((event) => event.journey)).toHaveLength(1);
    });
  });
});
