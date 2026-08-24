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
import { bookingZoneOverrides, placeDerivedTitle, placeTimezone } from './places';
import { isoToTimeInput } from './time';
import { BOOKING_TYPE_ICON, chosenIcon } from '../constants';
import { t } from '../i18n/he';

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
  /** **Has a human picked this glyph?** (field report #31.) A value test rather than a
   *  stored flag — see `chosenIcon`, whose comment argues the case, and `EventForm`'s
   *  own initial state, which answers the same question the same way. */
  iconTouched: boolean;
  icon: string;
  title: string;
  /** **Has a human typed this name?** (field report #30.) While false the title follows the
   *  linked Place, so the value on screen is the one `finalTitle` would save rather than a
   *  ghost of it — and it travels on the draft so a Map errand cannot reset the answer. */
  titleTouched: boolean;
  code: string;
  /** **The company behind the booking** (ADR-0163 §2) — `Booking.provider`. Travels in
   *  the draft like every other typed field, so a place errand to the Map cannot lose it. */
  provider: string;
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
  /** **The journey's stops** (ADR-0159) — the places between the two ends. Create-only,
   *  and the reason `legs` below is a list: a journey with two stops is three legs and
   *  three bookings. An entry is `undefined` while its picker is still empty. */
  stopPlaceIds: (string | undefined)[];
  /** **Departure and arrival per leg, in travel order.** `legs[0]` is the span a one-leg
   *  journey has always had; there are `stopPlaceIds.length + 1` of them once there are
   *  stops. A type whose schedule is a point on a day carries it in `date`/`start`/`end`
   *  above instead, and this stays a single empty-stringed leg.
   *
   *  A list rather than `spanStart`/`spanEnd` plus extras for the rest, because two
   *  spellings of "when does leg N happen" is exactly the drift this file exists to
   *  prevent. */
  legs: LegTimes[];
  /** The opt-in window bounds, `HH:MM` in each edge's zone; '' when there is none
   *  (ADR-0184). Only a held edge ever offers them, which the sheet decides. */
  startWindow: string;
  endWindow: string;
  /** The round trip (ADR-0154 §4) and its own legs, which mirror the outbound sequence
   *  in reverse. Form state, not `Booking` state — the save turns them into more
   *  bookings — but they travel on the draft for the same reason everything else does:
   *  a place errand that dropped them would come back having quietly changed what the
   *  save writes (ADR-0134 §2).
   *
   *  **`undefined` is "not answered yet"** (field report #8), and it is the value a fresh
   *  form opens with. It used to be `false`, which rendered `כיוון אחד` pre-selected with
   *  nobody having tapped it — the app assuming a one-way, which is exactly what the
   *  direction control exists to stop it doing. */
  roundTrip: boolean | undefined;
  returnLegs: LegTimes[];
  /** **The way home's OWN stops** (ADR-0203 §6), and `null` while it is still a mirror of
   *  the outbound. Reported from the field: "there's a good chance that it isn't going to be
   *  the same stops exactly - it could be different stops and/or a different number of
   *  stops."
   *
   *  A separate list rather than a flag over `stopPlaceIds`, because the whole point is that
   *  it can be a DIFFERENT LENGTH — `reversed` could only ever be the same array read
   *  backwards. `null` is what keeps the common case free: a round trip that does come home
   *  the same way carries no second list at all.
   *
   *  **The flag and the list are separate on purpose.** Going back to "same way" sets this
   *  to `null` for the save, and `returnStopsDraft` below keeps what was typed — so a change
   *  of mind inside one form costs nothing and no confirm dialog has to ask. */
  returnStopPlaceIds: (string | undefined)[] | null;
  /** What the way-back list held last, so toggling back to a mirror is not destructive.
   *  Never read by the save — only by the control that restores it.
   *
   *  **`null` is "never diverged", and `[]` is "diverged, and the way home is direct".** They
   *  are different answers and the first version could not tell them apart, so clearing the
   *  last stop and then toggling twice re-seeded the stop that had just been removed. */
  returnStopsDraft: (string | undefined)[] | null;
  /** **Has a human said when this ends?** (field report #11.) While false, the end
   *  follows the start — the type's conventional check-out clock, or a typical length
   *  after whatever the start becomes. The same latch `iconTouched`/`kindTouched` put on
   *  their derivations: an offer stops offering the moment it is answered.
   *
   *  One flag rather than one per leg, because every type that offers a time has exactly
   *  one leg — a journey, which is the only shape with more, offers none. */
  endTouched: boolean;
  kind: 'hard' | 'soft';
  kindTouched: boolean;
}

interface Wifi {
  network?: string;
  password?: string;
}

/** One leg's two ends, as the form holds them: `YYYY-MM-DDTHH:mm` wall-clock strings,
 *  each resolved to an instant in its own endpoint's zone on save (ADR-0107). */
export interface LegTimes {
  start: string;
  end: string;
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
  // **Now a form field** (ADR-0163 §2). This line read `'unused'`, with the comment
  // "never surfaced in the sheet — an importer's name for where a booking came from" —
  // which is how the gap survived: `BookingDetail` renders it as `ספק` for every type,
  // so the value was displayable and unenterable at the same time, and a rental company
  // had nowhere to go. The label is per type; the column is not.
  provider: 'form',
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

  // **STORING AN EFFECTIVE VALUE IS NOT EVIDENCE OF A CHOICE** (field reports #30/#31).
  // Both flags below are value tests, the shape `chosenIcon` established: a stored
  // explicitness column would have to be maintained by every writer, would go stale the
  // moment someone genuinely picks the default, and would be wrong for every row written
  // before it existed. The cost is the same honest one: pick the glyph the type would have
  // picked anyway, or type the place's own name, and the derivation keeps following — which
  // costs nothing, since what it re-derives is exactly what was picked.
  const storedIcon = chosenIcon(linkedEvent?.icon);
  // The full fallback chain `finalTitle` saves through — the place's name, then the type
  // label (field report #9) — so a booking saved with either reopens still following it.
  // A journey's and a hire's titles come from their route and their company instead
  // (ADR-0059 §3 / ADR-0163 §3), so neither reads this flag.
  const derivedTitle = placeDerivedTitle(places, placeId) ?? t.index.bookingType[type];
  const title = booking?.title ?? '';

  return {
    type,
    icon: storedIcon ?? BOOKING_TYPE_ICON[type],
    iconTouched: storedIcon != null && storedIcon !== BOOKING_TYPE_ICON[type],
    title,
    titleTouched: title.trim() !== '' && title.trim() !== derivedTitle,
    code: booking?.confirmationCode ?? '',
    provider: booking?.provider ?? '',
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
    // The one leg an existing booking has. Stops are create-only, so a booking opened
    // for editing is always a journey of exactly one (ADR-0159): turning a saved leg
    // into a sequence is a different action, the same way turning one into a pair is.
    stopPlaceIds: [],
    legs: [
      {
        start: linkedEvent?.startsAt ? isoToDateTimeLocal(linkedEvent.startsAt, startZone) : '',
        end: linkedEvent?.endsAt ? isoToDateTimeLocal(linkedEvent.endsAt, endZone) : '',
      },
    ],
    // **Unanswered on open** (field report #8, revising ADR-0154 §4's "default off"). §4
    // measured the 492px a second leg costs and concluded the control should default to
    // one-way; the owner's report is that a DEFAULT is the wrong instrument — the cost
    // argument only ever justified not pre-expanding the return, and `false` also
    // pre-selected `כיוון אחד`, answering for the traveller. `undefined` keeps the 492px
    // unspent and leaves the question open. Editing never offers the control at all.
    roundTrip: undefined,
    returnLegs: [],
    returnStopPlaceIds: null,
    returnStopsDraft: null,
    // The two optional window bounds (ADR-0184), as bare clocks in each edge's own
    // zone — the same read as `start`/`end` above, so a stay opened for editing shows
    // the window it was saved with and an empty pair simply offers.
    startWindow: linkedEvent?.startWindowEnd
      ? isoToTimeInput(linkedEvent.startWindowEnd, startZone)
      : '',
    endWindow: linkedEvent?.endWindowStart
      ? isoToTimeInput(linkedEvent.endWindowStart, endZone)
      : '',
    // A saved end is an answer; a form with none is still offering (field report #11).
    endTouched: !!linkedEvent?.endsAt,
    kind: linkedEvent?.kind ?? defaultKindForBookingType(type),
    kindTouched: false,
  };
}
