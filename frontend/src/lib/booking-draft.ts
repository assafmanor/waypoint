// **A booking sheet's initial state, as data** (ADR-0134 §2, extracted in session 173).
//
// This derivation lived inside `BookingSheet` as twenty-odd `initial*` consts, which was
// fine while the component was its only consumer. It stopped being fine when a **place
// errand started from the booking's DETAIL** had to hand a form draft over: the detail can
// see the booking, but not how the sheet would read it — the zone each leg is authored in,
// what a seed resolves to, which kind a type defaults to. Re-deriving that at a second call
// site is how the two quietly disagree.
//
// So it is one exported function, and the component now seeds its own `useState` calls from
// it. Same values in both places by construction rather than by discipline.
//
// Pure: everything it needs is passed in. No hooks, no clock — the sheet is authored in the
// zones the trip's own places resolve (ADR-0107), never in "now".
import {
  carriesRoute,
  defaultKindForBookingType,
  BOOKING_TYPE,
  type Booking,
  type BookingType,
  type Place,
  type Trip,
  type TripEvent,
} from '@waypoint/shared';
import { findPlaceByName, isoToDateTimeLocal } from './booking-edit';
import { bookingZoneOverrides, placeTimezone } from './places';
import { isoToTimeInput } from './time';
import { BOOKING_TYPE_ICON, chosenIcon } from '../constants';

/** What a checklist CTA can prefill (`PlanHome`'s flight/lodging rows). */
export interface BookingSeed {
  type?: BookingType;
  origin?: string;
  dest?: string;
}

/** **The sheet's own state, as one blob** (ADR-0134 §2) — the booking counterpart of
 *  `EventFormDraft`, and longer because this sheet authors more. `error`/`saving`/`deleting`
 *  are deliberately absent: they describe the last save attempt, not anything typed. */
export interface BookingSheetDraft {
  type: BookingType;
  iconTouched: boolean;
  icon: string;
  title: string;
  code: string;
  fromPlaceId: string | undefined;
  toPlaceId: string | undefined;
  placeId: string | undefined;
  startOverride: string | null;
  endOverride: string | null;
  room: string;
  wifiNetwork: string;
  wifiPassword: string;
  date: string;
  start: string;
  end: string;
  spanStart: string;
  spanEnd: string;
  /** The round trip's own three fields (ADR-0154 §4). Form state, not `Booking` state —
   *  the save turns them into a SECOND booking — but they travel on the draft for the
   *  same reason everything else does: a place errand that dropped them would come back
   *  having quietly changed what the save writes (ADR-0134 §2). */
  roundTrip: boolean;
  returnStart: string;
  returnEnd: string;
  kind: 'hard' | 'soft';
  kindTouched: boolean;
}

interface Wifi {
  network?: string;
  password?: string;
}

/** **EVERY `Booking` FIELD, CLASSIFIED** — the compile-time tie between the entity and this
 *  draft (owner, session 173: _"make sure that the booking draft schema is updated on any
 *  booking schema update"_).
 *
 *  A draft cannot be derived from `Booking` by a mapped type: the sheet authors a **form**,
 *  so one entity field becomes several (`details` → room + wifi × 2) and a stored
 *  instant becomes a date plus a time in a resolved zone. What CAN be enforced is coverage —
 *  so this map is exhaustive over `keyof Booking`, and adding a field to `bookingSchema`
 *  (the source of truth, mirrored from `schema.prisma`) fails the build right here until
 *  someone says which kind it is. The same shape `constants.ts` uses for per-enum lookups,
 *  and for the same reason: a missing case should be a compile error, not a silent omission.
 *
 *   • `form`     — the sheet authors it, so it has a home in `BookingSheetDraft` below.
 *   • `identity` — the entity's own bookkeeping. A form never types it.
 *   • `unused`   — on the entity, deliberately not authored here. Adding one of these to the
 *                  form means moving it to `form` AND giving it a draft field. */
export const BOOKING_FIELD_COVERAGE = {
  id: 'identity',
  tripId: 'identity',
  createdAt: 'identity',
  updatedAt: 'identity',
  updatedBy: 'identity',
  source: 'identity',
  type: 'form',
  title: 'form',
  confirmationCode: 'form',
  placeId: 'form',
  fromPlaceId: 'form',
  toPlaceId: 'form',
  startDisplayTimezone: 'form',
  endDisplayTimezone: 'form',
  // One field, three inputs: room and the two wifi halves. **Notes left this blob**
  // (ADR-0152 §7): they are `Note` rows now, authored by the sheet's composer rather than
  // by a draft string. `details.wifi` deliberately stays — it is a field with one reader
  // (`home-quick.ts`), not a note.
  details: 'form',
  // Never surfaced in the sheet — an importer's name for where a booking came from.
  provider: 'unused',
} as const satisfies Record<keyof Booking, 'form' | 'identity' | 'unused'>;

/** The form state a booking (or a seed, or neither) opens with. */
export function bookingSheetDraft(input: {
  booking?: Booking | null;
  seed?: BookingSeed;
  trip: Pick<Trip, 'timezone'>;
  events: TripEvent[];
  places: Place[];
}): BookingSheetDraft {
  const { booking, seed, trip, events, places } = input;
  const linkedEvent = booking ? events.find((e) => e.bookingId === booking.id) : undefined;
  const type = booking?.type ?? seed?.type ?? BOOKING_TYPE.FLIGHT;
  const wifi = booking?.details?.wifi as Wifi | undefined;

  // Transport endpoints are real picked places (ADR-0113 follow-up), authored through the
  // same `PlacePicker` as a single-place booking. A free-text seed resolves only to an
  // EXISTING trip place by name; if none matches the leg starts empty and the user picks,
  // so opening the sheet never creates an orphan place.
  const fromPlaceId =
    booking?.fromPlaceId ?? (seed?.origin && findPlaceByName(places, seed.origin)?.id);
  const toPlaceId = booking?.toPlaceId ?? (seed?.dest && findPlaceByName(places, seed.dest)?.id);
  const placeId = booking?.placeId;

  // A pinned zone (ADR-0107 §6) wins over the place's — it exists precisely for when no
  // place can answer (a coordless Place-lite, or nothing picked yet).
  const overrides = bookingZoneOverrides(booking ?? undefined);
  const startOverride = overrides.start ?? null;
  const endOverride = (carriesRoute(type) ? overrides.end : null) ?? null;
  const zoneOf = (id: string | undefined, override: string | null) =>
    override ?? placeTimezone(places, id) ?? trip.timezone;
  // Each leg reads in its own endpoint's zone (ADR-0107): a flight's departure in its
  // origin, its arrival in its destination; a single-place booking in its place.
  const transport = carriesRoute(type);
  const startZone = transport
    ? zoneOf(fromPlaceId || undefined, startOverride)
    : zoneOf(placeId, startOverride);
  const endZone = transport
    ? zoneOf(toPlaceId || undefined, endOverride)
    : zoneOf(placeId, startOverride);

  return {
    type,
    iconTouched: false,
    icon: chosenIcon(linkedEvent?.icon) ?? BOOKING_TYPE_ICON[type],
    title: booking?.title ?? '',
    code: booking?.confirmationCode ?? '',
    fromPlaceId: fromPlaceId || undefined,
    toPlaceId: toPlaceId || undefined,
    placeId,
    startOverride,
    endOverride,
    room: (booking?.details?.room as string | undefined) ?? '',
    wifiNetwork: wifi?.network ?? '',
    wifiPassword: wifi?.password ?? '',
    date: linkedEvent?.date ?? '',
    start: linkedEvent?.startsAt ? isoToTimeInput(linkedEvent.startsAt, startZone) : '',
    end: linkedEvent?.endsAt ? isoToTimeInput(linkedEvent.endsAt, endZone) : '',
    spanStart: linkedEvent?.startsAt ? isoToDateTimeLocal(linkedEvent.startsAt, startZone) : '',
    spanEnd: linkedEvent?.endsAt ? isoToDateTimeLocal(linkedEvent.endsAt, endZone) : '',
    // Always off on open: editing an existing booking never offers it (the control is
    // create-only), and a fresh form defaults to one-way (§4).
    roundTrip: false,
    returnStart: '',
    returnEnd: '',
    kind: linkedEvent?.kind ?? defaultKindForBookingType(type),
    kindTouched: false,
  };
}
