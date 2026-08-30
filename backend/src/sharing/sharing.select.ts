import { Prisma } from '@prisma/client';

/**
 * **What a public read is allowed to load**, written as explicit `select`s rather than
 * enforced after the fact.
 *
 * The rejected shape was: load the trip snapshot the app already builds, then delete what
 * this share level may not show. That inverts the safe default — a column added to `Event`
 * next year is published by silence, and the only thing standing between a new
 * `providerPayload` and an anonymous reader is somebody remembering to add it to a
 * blocklist. Here, a new column is invisible until someone names it below, and the strict
 * response schema turns "named it but shouldn't have" into a failed request rather than a
 * disclosure.
 *
 * Nothing here selects an email, a coordinate the reader could re-identify a home from, a
 * `googlePlaceId`, a provider payload, or an entity id. Coordinates ARE loaded for places —
 * the zone crossings and the stored travel legs are both keyed by them — but they live only
 * in this service's locals and have no field in `sharedItinerarySchema` to travel out
 * through.
 */

/** The event columns every level reads. Zone resolution needs `displayTimezone` and
 *  `date`; ADR-0011's hard/soft distinction needs `kind`. */
export const SHARE_EVENT_SELECT = {
  id: true,
  title: true,
  icon: true,
  category: true,
  kind: true,
  date: true,
  startsAt: true,
  endsAt: true,
  displayTimezone: true,
  sortOrder: true,
  placeId: true,
  bookingId: true,
  place: { select: { id: true, name: true, nickname: true, address: true, lat: true, lng: true } },
  // `type` is the discriminant a renderer captions a row from and the day derivation reads
  // to know a flight from a hotel — the booking's KIND, never its content. It is already
  // selected for zone crossings below, and everything operational (`confirmationCode`,
  // `provider`, `details`) stays behind `SHARE_SECRET_BOOKING_SELECT` and Everything.
  booking: { select: { id: true, type: true, placeId: true, fromPlaceId: true, toPlaceId: true } },
} as const satisfies Prisma.EventSelect;

/** Only what ADR-0107's crossing derivation reads. Deliberately NOT `confirmationCode`,
 *  `provider` or `details`: a Summary read must not pull a booking secret into memory at
 *  all, let alone into a response. */
export const SHARE_ZONE_BOOKING_SELECT = {
  id: true,
  type: true,
  placeId: true,
  fromPlaceId: true,
  toPlaceId: true,
  startDisplayTimezone: true,
  endDisplayTimezone: true,
} as const satisfies Prisma.BookingSelect;

/** The second booking query, run **only** when Everything enables booking secrets. */
export const SHARE_SECRET_BOOKING_SELECT = {
  /** The join key, not a published value — an op reaches its row through this and the
   *  projection copies fields by name, so it never crosses into the payload. */
  id: true,
  title: true,
  type: true,
  confirmationCode: true,
  provider: true,
  details: true,
} as const satisfies Prisma.BookingSelect;

export const SHARE_PLACE_SELECT = {
  id: true,
  name: true,
  nickname: true,
  timezone: true,
  lat: true,
  lng: true,
  /** **Not published — it is the key the enrichment store is read by** (ADR-0166 §5).
   *  `derivedPlaceLabel` needs a place's enrichment to answer rung 2 (the city an airport
   *  serves), and `EnrichmentService.readForPlaces` looks that up by Google id. It never
   *  reaches the projection: `projectEvent` copies fields by name and this is not one. */
  googlePlaceId: true,
  /** The significance rank behind a day's photo — the COUNT, never `rating`, which is
   *  4.5–4.8 for everything scenic and separates nothing. */
  userRatingsTotal: true,
  /** **A human mark on the place**, and the only rank term that is about THIS group rather
   *  than about the world — so it breaks ties in the right direction. Not published: the
   *  projection copies fields by name and this is not one. */
  icon: true,
} as const satisfies Prisma.PlaceSelect;

export type ShareEventRow = Prisma.EventGetPayload<{ select: typeof SHARE_EVENT_SELECT }>;
export type SharePlaceRow = Prisma.PlaceGetPayload<{ select: typeof SHARE_PLACE_SELECT }>;
