// Booking form (ADR-0047/0048) — one merged sheet for create and edit. Fields:
// type (create only), IconPicker glyph + derived category, title, confirmation
// code, transport origin/destination (each a name-only Place, authored on save),
// hotel room/WiFi, notes, and an optional date/time that seeds the linked
// itinerary event (the backend upserts it). Delete surfaces the delete-both-vs-
// unlink choice when a booking is tied to an event (ADR-0047 §3).
//
// Structure folded onto the shared editing grammar (U-01/U-02/U-05): fields wear
// the Field shell, every date/time flows through the WhenField standard (a span
// for two-endpoint bookings, a single day otherwise — never a cramped native
// datetime box), the footer is FormActions, delete routes through the generic
// ConfirmDialog, and a dirty close is guarded by a discard confirm.
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  authorsRoundTrip,
  connectionWindow,
  BOOKING_TYPE,
  BOOKING_TYPE_TO_CATEGORY,
  EVENT_KIND,
  carriesRoute,
  defaultKindForBookingType,
  hasSpanSchedule,
  titlesFromRoute,
  type Booking,
  type BookingType,
} from '@waypoint/shared';
import {
  bookingSheetDraft,
  type BookingSeed,
  type BookingSheetDraft,
  type LegTimes,
} from '../lib/booking-draft';
import { offerDayTimes, offerLegTimes, offeredEnd } from '../lib/booking-prefill';
import { useRoundTripPartner, type PartnerLeg } from '../lib/booking-journey';
import { useTrip } from '../state/trip-state';

// Re-exported so the sheet stays the obvious import for its own props (the derivation moved
// out in session 173, the vocabulary did not).
export type { BookingSeed, BookingSheetDraft };
import { Sheet } from './Sheet';
import { IconPicker } from './IconPicker';
import { Icon } from './Icon';
import { RouteLabel } from './RouteLabel';
import { RouteField } from './domain';
import { Field } from './primitives/Field';
import { PlacePicker } from './primitives/PlacePicker';
import { NoteComposer, useNoteComposer } from './NoteComposer';
import { HostNotes, useHostNoteCount } from './HostNotes';
import { FormStepActions, FormStepPanel, useFormSteps } from './primitives/FormSteps';
import { FormError } from './primitives/FormError';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { WhenField } from './primitives/WhenField';
import { type ZoneChipProps } from './primitives/ZoneChip';
import { ConfirmDialog } from './primitives/ConfirmDialog';
import { useFormErrors, type FieldProblem } from './primitives/useFormErrors';
import { useUnsavedGuard } from '../lib/useUnsavedGuard';
import {
  mergeBookingDetails,
  deleteFlags,
  buildEventSeed,
  buildSpanSeed,
  dateOutOfTripRange,
} from '../lib/booking-edit';
import { routeTitle } from '../lib/route-title';
import { placeName, placeTimezone } from '../lib/places';
import { withChangeGroup } from '../lib/outbox';
import { zoneOffsetMinutes, zonedIso } from '../lib/time';
import { hoursPhrase } from '../lib/duration';
import { bookingDurationUnit, timingLabels } from '../lib/booking-timing';
import { BOOKING_TYPE_ICON, DOT_SEPARATOR } from '../constants';
import { useStartPlaceErrand, type PlaceErrandField } from '../state/map-scope-state';
import { useDerivedField } from '../lib/useDerivedField';
import { t } from '../i18n/he';

const BOOKING_TYPE_OPTIONS = Object.values(BOOKING_TYPE).map((ty) => ({
  value: ty,
  icon: BOOKING_TYPE_ICON[ty],
  label: t.index.bookingType[ty],
}));

/** The two span-endpoint labels for a type — shared with the detail view and the
 *  Index row so the wording never drifts (`../lib/booking-timing`). */
const spanLabels = timingLabels;

/** Shared empties, so a render that authors no stops and no return hands the same
 *  arrays down every time rather than two fresh ones. */
const EMPTY_STOPS: (string | undefined)[] = [];
const EMPTY_LEGS: LegTimes[] = [];
const BLANK_LEG: LegTimes = { start: '', end: '' };

/** The journey's legs, normalised to the number of legs its ROUTE has. Read-time
 *  rather than kept in sync by a setter: state can lag the stops by a render, and
 *  normalising on read makes a leg/point mismatch unrepresentable instead of a bug
 *  that only shows when a stop is added halfway through filling the form. */
const resizeLegs = (list: LegTimes[], count: number): LegTimes[] =>
  list.length === count ? list : Array.from({ length: count }, (_, i) => list[i] ?? BLANK_LEG);

const sameLegs = (a: LegTimes[], b: LegTimes[]) =>
  a.length === b.length && a.every((leg, i) => leg.start === b[i].start && leg.end === b[i].end);

/** What this sheet can refuse, one name per BOX on screen (ADR-0150) — which is why
 *  a span's two legs are two names and the day variant's date is a third. */
type LegSide = 'out' | 'back';
type BookingField =
  | 'title'
  | 'route'
  // **The direction is its own box** (field report #8) — one name per BOX is this union's
  // rule, and an unanswered direction is a different refusal from a missing route even
  // though the two controls share a field shell.
  | 'direction'
  | 'date'
  // **One name per LEG END** (ADR-0154 §4's two names, now indexed — ADR-0159). A span
  // refuses per leg for the same reason it carries a zone per leg, and a journey with
  // a stop has four of them before the return adds its own.
  | `${LegSide}-start-${number}`
  | `${LegSide}-end-${number}`;

/** A leg end's field name. One spelling, used by the refusal, the mark and the step
 *  lookup — three places that must agree on which box is being talked about. */
const legField = (side: LegSide, index: number, edge: 'start' | 'end'): BookingField =>
  `${side}-${edge}-${index}`;

/** Pre-set fields for a create-flow open (ADR-0061): the Plan-home checklist opens
 *  the form for a specific booking type, and for a flight seeds the missing leg's
 *  destination endpoint. Ignored when editing an existing booking. */
export function BookingSheet({
  booking,
  seed,
  draft,
  focus,
  onClose,
}: {
  booking?: Booking | null;
  seed?: BookingSeed;
  /** Re-opening after a place errand (ADR-0134 §2): every field comes from here, so a
   *  half-filled booking survives the trip to the Map tab. */
  draft?: BookingSheetDraft | null;
  /** Open ON a field rather than at the top. `'when'` is what makes the row menu's
   *  `שבץ במסלול` a real shortcut rather than a second name for `ערוך` (ADR-0138 §7)
   *  — scheduling has always lived inside this form, and nothing said so. */
  focus?: 'when';
  onClose: () => void;
}) {
  const { trip, events, places, indexVerbs, noteVerbs } = useTrip();
  const startErrand = useStartPlaceErrand();
  const isCreate = !booking;

  const whenRef = useRef<HTMLDivElement>(null);
  const shortcutDone = useRef(false);
  const linkedEvent = booking ? events.find((e) => e.bookingId === booking.id) : undefined;
  // ONE derivation, shared with the errand that has to hand this state over before the sheet
  // exists (`lib/booking-draft.ts`). The `initial` blob is both the seed for every field
  // below and the baseline the unsaved-changes guard diffs against, so "what the form opened
  // with" cannot mean two things.
  const initial = useMemo(
    () => bookingSheetDraft({ booking, seed, trip, events, places }),
    [booking, seed, trip, events, places],
  );

  const [type, setType] = useState<BookingType>(draft ? draft.type : initial.type);
  // The badge glyph follows the booking TYPE while untouched, and the ✨ caption below offers a
  // revert once a human has picked one (`reset` hands it back to the derivation).
  const icon = useDerivedField(
    draft ? draft.icon : initial.icon,
    draft ? draft.iconTouched : false,
  );
  const [title, setTitle] = useState(draft ? draft.title : initial.title);
  const [code, setCode] = useState(draft ? draft.code : initial.code);
  // **The company** (ADR-0163 §2). `Booking.provider` has existed since the schema was
  // written and `BookingDetail` has always rendered it — no form ever wrote it, so an
  // airline and a hotel chain were as unenterable as a rental company. Collected for
  // EVERY type: the column and the read-out are not car-specific, and only the LABEL is.
  const [provider, setProvider] = useState(draft ? draft.provider : initial.provider);
  const [fromPlaceId, setFromPlaceId] = useState<string | undefined>(
    draft ? draft.fromPlaceId : initial.fromPlaceId,
  );
  const [toPlaceId, setToPlaceId] = useState<string | undefined>(
    draft ? draft.toPlaceId : initial.toPlaceId,
  );
  const [placeId, setPlaceId] = useState<string | undefined>(
    draft ? draft.placeId : initial.placeId,
  );
  const [startOverride, setStartOverride] = useState<string | null>(
    draft ? draft.startOverride : initial.startOverride,
  );
  const [endOverride, setEndOverride] = useState<string | null>(
    draft ? draft.endOverride : initial.endOverride,
  );
  const [room, setRoom] = useState(draft ? draft.room : initial.room);
  const composer = useNoteComposer();
  const [wifiNetwork, setWifiNetwork] = useState(draft ? draft.wifiNetwork : initial.wifiNetwork);
  const [wifiPassword, setWifiPassword] = useState(
    draft ? draft.wifiPassword : initial.wifiPassword,
  );
  // Non-transport scheduling: a single day + optional same-day time span.
  const [date, setDate] = useState(draft ? draft.date : initial.date);
  const [start, setStart] = useState(draft ? draft.start : initial.start);
  const [end, setEnd] = useState(draft ? draft.end : initial.end);
  // **The journey's stops** (ADR-0159) — create-only, and what turns one save into a
  // chain of bookings. Empty is the one-leg journey every transport booking was.
  const [stopPlaceIds, setStopPlaceIds] = useState(
    draft ? draft.stopPlaceIds : initial.stopPlaceIds,
  );
  // Span scheduling (transport departure/arrival, hotel check-in/check-out), one entry
  // per leg: two explicit datetimes that may fall on different days.
  const [legs, setLegs] = useState(draft ? draft.legs : initial.legs);
  // The round trip (ADR-0154 §4): one save, two journeys. Create-only, and it opens
  // **unanswered** (field report #8): §4's 492px measurement justifies not pre-expanding
  // the return, and `false` went further than that and pre-selected `כיוון אחד`. The
  // second leg still costs what it costed; nobody is now told they chose not to buy it.
  const [roundTrip, setRoundTrip] = useState(draft ? draft.roundTrip : initial.roundTrip);
  const [returnLegs, setReturnLegs] = useState(draft ? draft.returnLegs : initial.returnLegs);
  // **The end stops following the start once it is answered** (field report #11) — the
  // same latch `useDerivedField` puts on the icon and the kind, kept as plain state
  // because what it gates lives in `legs`/`end` rather than in a value of its own.
  const [endTouched, setEndTouched] = useState(draft ? draft.endTouched : initial.endTouched);
  const kind = useDerivedField<'hard' | 'soft'>(
    draft ? draft.kind : initial.kind,
    draft ? draft.kindTouched : false,
  );
  // Every refusal this sheet can make, marked at the field it is about (ADR-0150).
  // A span refuses per LEG for the same reason it carries a zone per leg: saying
  // "the dates are outside the trip" over two good fields and one bad one is the
  // refusal naming the wrong thing.
  const errors = useFormErrors<BookingField>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Read here rather than inside `DeletePrompt`, which is presentational and shared with
  // the manage sheet — the pair is trip state, and only a connected component reads that.
  // The two note counts the delete confirm owes (ADR-0152 §2) come from the same place for
  // the same reason.
  const pair = useRoundTripPartner(booking);
  const bookingNotes = useHostNoteCount('booking', booking?.id);
  const linkedEventNotes = useHostNoteCount('event', linkedEvent?.id);

  // ONE ERRAND BUILDER FOR THE THREE PLACE FIELDS (ADR-0134 §1/§2). Each call names its own
  // field, and the label says which end of the journey it is — a banner reading only
  // "רכבת לקיוטו" would leave you guessing which side you were choosing. `startErrand` is
  // null only where there is no Map tab to route to, which no host of this sheet is.
  const findPlace = (field: PlaceErrandField, side?: string, index?: number) => () =>
    startErrand?.({
      target: { kind: 'booking', id: booking?.id, field, index },
      label: [title.trim() || t.map.errand.untitledBooking, side]
        .filter(Boolean)
        .join(` ${DOT_SEPARATOR} `),
      draft: {
        type,
        iconTouched: icon.touched,
        icon: icon.value,
        title,
        code,
        provider,
        fromPlaceId,
        toPlaceId,
        placeId,
        startOverride,
        endOverride,
        room,
        wifiNetwork,
        wifiPassword,
        date,
        start,
        end,
        stopPlaceIds,
        legs,
        roundTrip,
        returnLegs,
        endTouched,
        kind: kind.value,
        kindTouched: kind.touched,
      } satisfies BookingSheetDraft,
    });

  /** The errand for one STOP. Same builder, one difference: the target carries an
   *  INDEX, because a stop is an element of a list rather than a `Booking` column
   *  (ADR-0159 extends ADR-0134 §2's channel by exactly that much). */
  const findStop = (index: number, side: string) => findPlace('stopPlaceIds', side, index)();

  const suggestedZones = useMemo(
    () =>
      [...new Set([trip.timezone, ...places.map((p) => p.timezone).filter(Boolean)])] as string[],
    [trip.timezone, places],
  );

  const isTransport = carriesRoute(type);
  // **Two counters, not a journey** (ADR-0163 §1). A hire carries a route like the three
  // travelling modes, and asks a completely different question about it.
  const isHire = isTransport && !titlesFromRoute(type);
  const isHotel = type === BOOKING_TYPE.HOTEL;
  // **What the provider is CALLED, per type** (ADR-0163 §2) — a `Record` over the enum, so
  // a new booking type has to answer rather than silently inheriting "ספק".
  const providerLabel = t.index.sheet.providerLabel[type];
  const providerPlaceholder = t.index.sheet.providerPlaceholder[type];
  const isSpan = hasSpanSchedule(type);
  // Offered only where there is a route to mirror, and only on a create: editing a leg
  // opens ADR-0047 §2's merged surface unchanged, and turning a saved single leg into a
  // pair is a different action (§4, out of scope).
  const offersRoundTrip = isCreate && authorsRoundTrip(type);
  const twoLegs = offersRoundTrip && roundTrip === true;
  // **Stops, on the same terms as the round trip** (ADR-0159): only where the type's
  // profile says a journey of this kind can be broken by one, and only on a create.
  const offersStops = isCreate && connectionWindow(type) != null;
  const stops = offersStops ? stopPlaceIds : EMPTY_STOPS;
  /** **A hire's return defaults to its pick-up** (ADR-0163 §1, hardened after the owner
   *  reported `נריטה ← -`). The field writes the two equal while the answer is "same
   *  counter", but that only fires when the toggle or the picker is touched — so a place
   *  arriving from a MAP ERRAND (which assigns `draft.fromPlaceId` directly) and a
   *  pre-0163 row opened and saved untouched both left the return null. Normalising on
   *  READ makes the gap unrepresentable rather than fixing it at each writer, which is
   *  the same choice the leg-resize below makes one line down. */
  const hireReturnId = isHire ? (toPlaceId ?? fromPlaceId) : toPlaceId;
  /** The journey's points in travel order: origin, every stop, destination. Legs run
   *  between consecutive points, so `legCount` is one less than this. */
  const routePoints = [fromPlaceId, ...stops, hireReturnId];
  const legCount = isSpan ? routePoints.length - 1 : 1;
  // Read through a resize rather than kept in sync by a setter: state can lag the
  // number of stops for one render, and normalising on READ makes that unrepresentable
  // instead of a bug that only appears when a stop is added mid-edit.
  const outLegs = resizeLegs(legs, legCount);
  const backLegs = twoLegs ? resizeLegs(returnLegs, legCount) : EMPTY_LEGS;
  const setLeg = (side: 'out' | 'back', index: number, next: LegTimes) => {
    const write = side === 'out' ? setLegs : setReturnLegs;
    const current = side === 'out' ? outLegs : backLegs;
    write(current.map((leg, i) => (i === index ? next : leg)));
  };
  // The LIVE zone resolver — same rule as the draft's, over the CURRENT picks rather than
  // the ones the sheet opened with (`lib/booking-draft.ts` owns the opening ones).
  const zoneOf = (id: string | undefined, override: string | null) =>
    override ?? placeTimezone(places, id) ?? trip.timezone;
  // Live per-endpoint zones (from the current picks): departure/arrival in the
  // route's origin/destination, a single-place booking in its place (ADR-0107).
  // Changing a pick keeps the typed wall-clock and re-interprets it in the new
  // zone on save (§8). Fall back to the trip primary zone when unresolved.
  const startZone = isTransport
    ? zoneOf(fromPlaceId, startOverride)
    : zoneOf(placeId, startOverride);
  const endZone = isTransport ? zoneOf(hireReturnId, endOverride) : zoneOf(placeId, startOverride);
  /** **A leg reads in the zones of ITS OWN two points** (ADR-0107, extended over a
   *  sequence). Only the journey's outer ends can carry a pinned override — an interior
   *  stop has a picked place, which is what the chip exists to stand in for when nothing
   *  else can answer. `back` walks the same points in reverse. */
  const reversed = [...routePoints].reverse();
  const legZones = (side: 'out' | 'back', index: number) => {
    const points = side === 'out' ? routePoints : reversed;
    const outerStart = side === 'out' ? startZone : endZone;
    const outerEnd = side === 'out' ? endZone : startZone;
    return {
      start: index === 0 ? outerStart : zoneOf(points[index], null),
      end: index === legCount - 1 ? outerEnd : zoneOf(points[index + 1], null),
    };
  };
  // A chip per time field (ADR-0107 §6). It is **editable only when no place
  // answers the zone** — a picked place with coordinates carries its own zone, and
  // correcting it there is the honest edit (§3); a coordless Place-lite (offline, or
  // a name Google didn't match) or an unpicked endpoint has nothing to derive from,
  // which is exactly the gap the override fills. Suggested zones are the trip's own.
  const zoneChip = (
    placeIdForEnd: string | undefined,
    value: string,
    override: string | null,
    setOverride: (zone: string | null) => void,
  ): ZoneChipProps => ({
    value,
    onChange: placeTimezone(places, placeIdForEnd) ? undefined : setOverride,
    pinned: override != null,
    suggested: suggestedZones,
  });

  // A stable instant (trip-start noon) to read the zones' offsets at, for the
  // shift the note shows — exact enough for a "how far apart" figure.
  const zoneRefMs = Date.parse(zonedIso(trip.startDate, '12:00', trip.timezone));
  // A booked event's category is its booking type's — canonical (ADR-0038), not
  // the picked glyph. The IconPicker only sets the badge icon; a ⭐ on a hotel
  // stays lodging, so nights/check-in-out/ambient behaviour all follow the type.
  const category = BOOKING_TYPE_TO_CATEGORY[type];

  // Diffed against the SAME blob the fields were seeded from, so "what did this open with"
  // has exactly one answer. `iconTouched`/`kindTouched` are not state the user typed, so
  // they are not part of dirtiness.
  const dirty =
    type !== initial.type ||
    icon.value !== initial.icon ||
    title !== initial.title ||
    code !== initial.code ||
    fromPlaceId !== initial.fromPlaceId ||
    toPlaceId !== initial.toPlaceId ||
    placeId !== initial.placeId ||
    room !== initial.room ||
    wifiNetwork !== initial.wifiNetwork ||
    wifiPassword !== initial.wifiPassword ||
    date !== initial.date ||
    start !== initial.start ||
    end !== initial.end ||
    stopPlaceIds.join() !== initial.stopPlaceIds.join() ||
    !sameLegs(legs, initial.legs) ||
    roundTrip !== initial.roundTrip ||
    !sameLegs(returnLegs, initial.returnLegs) ||
    startOverride !== initial.startOverride ||
    endOverride !== initial.endOverride ||
    kind.value !== initial.kind;
  const { guardedClose, prompting, confirmDiscard, cancelDiscard } = useUnsavedGuard(dirty);
  const requestClose = () => guardedClose(onClose);

  const changeType = (next: BookingType) => {
    setType(next);
    icon.redrive(BOOKING_TYPE_ICON[next]);
    kind.redrive(defaultKindForBookingType(next));
    // **An offered end belongs to the type that offered it** (field report #11). A
    // check-out clock must not survive a switch to a flight, where the whole point is
    // that no clock may be guessed. An end a human typed is theirs and stays.
    if (endTouched) return;
    setLegs((list) =>
      list.map((leg, i) => (i === 0 ? { ...leg, end: offeredEnd(next, leg.start) ?? '' } : leg)),
    );
    setEnd('');
  };
  const pickKind = (k: 'hard' | 'soft') => kind.set(k);

  // A JOURNEY is identified by its route, not a name (ADR-0059 §3): the stored title is
  // derived from origin→destination (it backs the linked event's title and any place-less
  // fallback), so a flight never carries a hand-typed name.
  //
  // **A HIRE is not** (ADR-0163 §3). It is called Hertz, and deriving its title from two
  // counters that are usually the same one produced `נריטה ← נריטה` — printed wherever a
  // surface gets a title and nothing else, the day's ambient strip included. So the rule
  // keys on `titlesFromRoute`, which is now its own axis, and a hire's name is its rental
  // company. With no company entered it falls back to the TYPE LABEL rather than to a
  // place: `השכרת רכב` says what the row is, where a bare counter name does not.
  const typeLabel = t.index.bookingType[type];
  const hireTitle = () => provider.trim() || typeLabel;
  /** **The name a booking falls back to when nobody types one** (field report #9,
   *  generalising ADR-0163 §3 past the car hire it was written for). The hire's rule was
   *  already "the thing it is called, else what it is"; for every remaining type the thing
   *  it is called is the PLACE it happens at — a hotel is `Granbell Shinjuku`, a
   *  restaurant is `Ichiran` — with the type label as the same last resort.
   *
   *  **`provider` is deliberately not in this chain.** It is the channel you booked
   *  through (field report #12), so it would title a hotel `Booking.com`: the name of a
   *  website, not of a place you are sleeping at. The hire is the exception that keeps its
   *  own rule, because there the provider IS the thing — you rent from Hertz. */
  const placeTitle = () => placeName(places, placeId)?.trim();
  const derivedTitle = () => placeTitle() || typeLabel;
  const finalTitle = titlesFromRoute(type)
    ? routeTitle(placeName(places, fromPlaceId) ?? '', placeName(places, toPlaceId) ?? '')
    : isHire
      ? hireTitle()
      : title.trim() || derivedTitle();

  /** **Every refusal this form can make, in one place** — and it stays one place now that
   *  the form is stepped (ADR-0155 §3). A step gate and the save both read THIS and filter
   *  by the fields their step owns, so a rule cannot hold on one path and not the other,
   *  and the save re-validating everything is the same code rather than a second copy. */
  const allProblems = (): FieldProblem<BookingField>[] => {
    const problems: FieldProblem<BookingField>[] = [];
    if (isTransport) {
      if (!finalTitle) problems.push({ field: 'route', message: t.index.form.routeRequired });
      // A stop with no place cannot be flown to, scheduled or titled. Refused at the
      // route, which is the field it is a part of (ADR-0150).
      if (stops.some((id) => !id)) {
        problems.push({ field: 'route', message: t.index.form.stopRequired });
      }
    }
    // **A direction is refused, never assumed** (field report #8). This is the price of
    // opening unanswered and it is the point of it: the app would rather ask twice than
    // write a one-way nobody chose. Only where the control is actually offered.
    if (offersRoundTrip && roundTrip === undefined) {
      problems.push({ field: 'direction', message: t.index.form.directionRequired });
    }
    // Nothing refuses a missing NAME any more (field report #9): `finalTitle` falls back
    // to the linked place and then to the type label, so for a non-route type it cannot
    // come out empty. The check that used to be here would now be unreachable.
    const outOfRange = (v: string) => dateOutOfTripRange(v, trip.startDate, trip.endDate);
    if (!isSpan && outOfRange(date)) {
      problems.push({ field: 'date', message: t.index.form.dateOutOfRange });
    }
    if (!isSpan) return problems;

    /** An end of a leg as an instant, or null when it has no time yet. A day with no
     *  time is deliberately open — the same reading the single-span form already had. */
    const instantAt = (value: string, zone: string) => {
      const [day, time] = value.split('T');
      return day && time ? Date.parse(zonedIso(day, time, zone)) : null;
    };

    /** One side of the journey, leg by leg. Two per-leg rules (in the trip's range, and
     *  an arrival after its own departure) plus the one CROSS-leg rule a sequence adds:
     *  **you cannot leave before you have arrived**, marked on the departure that is
     *  wrong rather than on the three fields around it that are fine. */
    const walk = (side: LegSide, list: LegTimes[], arrivedAt: number | null) => {
      let previousArrival = arrivedAt;
      list.forEach((leg, i) => {
        const zones = legZones(side, i);
        if (outOfRange(leg.start)) {
          problems.push({
            field: legField(side, i, 'start'),
            message: t.index.form.dateOutOfRange,
          });
        }
        if (outOfRange(leg.end)) {
          problems.push({ field: legField(side, i, 'end'), message: t.index.form.dateOutOfRange });
        }
        const departure = instantAt(leg.start, zones.start);
        const arrival = instantAt(leg.end, zones.end);
        if (departure != null && arrival != null && arrival <= departure) {
          problems.push({ field: legField(side, i, 'end'), message: t.index.form.endBeforeStart });
        }
        if (departure != null && previousArrival != null && departure < previousArrival) {
          // The return's first leg is the ONE case ADR-0154 §4 already worded: it is
          // about the whole outbound journey, not about the leg above it.
          const isReturnStart = side === 'back' && i === 0;
          problems.push({
            field: legField(side, i, 'start'),
            message: isReturnStart
              ? t.index.form.returnBeforeArrival
              : t.index.form.legBeforeArrival(
                  placeName(places, (side === 'out' ? routePoints : reversed)[i]),
                ),
          });
        }
        previousArrival = arrival ?? previousArrival;
      });
      return previousArrival;
    };

    const landed = walk('out', outLegs, null);
    if (twoLegs) walk('back', backLegs, landed);
    return problems;
  };

  /** **The steps, one per leg** (ADR-0155 §5, ADR-0159). A leg is what a step is for:
   *  two stops is two more steps rather than a form three times as long, and the
   *  cross-leg refusal above is the cross-STEP dependency ADR-0155 §5 names as the
   *  strongest argument for stepping this form at all.
   *
   *  A type with no span keeps its single day step, so a restaurant's form is the three
   *  it has always been. */
  const legSteps: StepId[] = [
    ...outLegs.map((_, i) => `out-${i}` as StepId),
    ...backLegs.map((_, i) => `back-${i}` as StepId),
  ];
  type StepId = 'type' | 'what' | 'more' | `${LegSide}-${number}`;
  /** **The type is the first question, and only when it is a question** (field report #2).
   *  It shapes every step after it — span vs point, how many legs, whether a return can be
   *  bought — so asking it on its own, first, is the honest ordering, and it is what lets
   *  the eight-card grid stop competing with the name and the place for the same screen.
   *
   *  **An edit gains no step from this.** The type of a saved booking is not editable
   *  (the grid has always been create-only), so on edit there is no question to ask and
   *  the answer rides the collapsed row instead — which is the "combine where it makes
   *  sense" half of the owner's call: the step that would have been added is folded away
   *  rather than shown with nothing to do. */
  const STEP_IDS: StepId[] = [
    ...(isCreate ? (['type'] as StepId[]) : []),
    'what',
    ...legSteps,
    'more',
  ];
  /** Where `שבץ במסלול` lands (ADR-0138 §7): the schedule is a step per leg now, so the
   *  shortcut means the first of them. */
  const FIRST_LEG_STEP: StepId = 'out-0';

  /** Which step shows a field. A FUNCTION rather than the table this replaced: the leg
   *  names are indexed, so no literal list can be exhaustive over them — and a total
   *  function is the stronger property anyway. Every field has a step, by construction. */
  const stepOf = (field: BookingField): StepId => {
    if (field === 'title' || field === 'route' || field === 'direction') return 'what';
    if (field === 'date') return 'out-0';
    const [side, , index] = field.split('-');
    return `${side as LegSide}-${index}` as StepId;
  };
  const problemsIn = (step: StepId) =>
    allProblems().filter((p) => p.field != null && stepOf(p.field) === step);

  const commit = async () => {
    setSaving(true);
    try {
      // One user action → one change group (ADR-0092): the places backing a
      // transport route and the booking itself queue together and count as a
      // single pending change, not three.
      await withChangeGroup(async () => {
        // The route endpoints are already persisted places (the PlacePicker resolved
        // them on pick); the booking just references their ids. Grouped with the
        // linked-event write so the pair counts as one pending change (ADR-0092).
        const details = mergeBookingDetails(booking?.details, {
          room: isHotel ? room : undefined,
          wifiNetwork: isHotel ? wifiNetwork : undefined,
          wifiPassword: isHotel ? wifiPassword : undefined,
        });
        // Zone overrides (ADR-0107 §6): send a key only when the chip was actually
        // used, so an untouched form can't freeze today's derived zone; `null` is the
        // reset. A single-place booking has one zone (`start` drives both ends), so
        // its end resolves to null — which also clears an end pinned while the type
        // was still transport, the one way this form can leave a stale one behind.
        const startPatch =
          startOverride !== initial.startOverride
            ? { startDisplayTimezone: startOverride }
            : undefined;
        const endPatch =
          (isTransport ? endOverride : null) !== initial.endOverride
            ? { endDisplayTimezone: isTransport ? endOverride : null }
            : undefined;
        const base = {
          // Send the trimmed value even when empty: an empty string is the explicit
          // "clear the code" intent (undefined would be dropped by JSON.stringify and
          // read as "leave unchanged"). The backend normalizes empty → null.
          confirmationCode: code.trim(),
          // Same rule as the code above, for the same reason: an empty string is an
          // explicit "clear it", where `undefined` would be dropped and read as
          // "leave unchanged" (ADR-0163 §2).
          provider: provider.trim(),
          details,
        };

        /** **One leg, as a booking + its linked event.** The journey's shared facts come
         *  from `base` by construction — the code, the icon and the kind cannot drift
         *  between legs — and everything that differs is derived from the two points the
         *  leg runs between: its route, its title (ADR-0059 §3, so nobody types a name —
         *  unless the type names itself, which since ADR-0163 §3 is the car hire) and its
         *  two zones. Only the journey's OUTER ends carry a zone override. */
        const legBooking = (side: LegSide, index: number, times: LegTimes) => {
          const points = side === 'out' ? routePoints : reversed;
          const from = points[index];
          const to = points[index + 1];
          const zones = legZones(side, index);
          const seed = buildSpanSeed(
            {
              startAt: times.start,
              endAt: times.end,
              kind: kind.value,
              icon: icon.value,
              category,
            },
            zones.start,
            zones.end,
          );
          const firstOfJourney = index === 0;
          const lastOfJourney = index === legCount - 1;
          // The overrides ride with the END they belong to: on the way out the start's
          // is the journey's start; on the way back it departs from the destination, so
          // the two swap. Same "only when the chip was used" rule as a single leg's.
          const outerStart =
            side === 'out'
              ? startPatch
              : endPatch && { startDisplayTimezone: endPatch.endDisplayTimezone };
          const outerEnd =
            side === 'out'
              ? endPatch
              : startPatch && { endDisplayTimezone: startPatch.startDisplayTimezone };
          return {
            type,
            ...base,
            // A leg of a JOURNEY is named by the two points it runs between (ADR-0059 §3).
            // A hire reaches this path too — it is route-shaped and span-scheduled, so it
            // is written as a one-leg "journey" — and it must NOT be, which is the whole
            // of ADR-0163 §3: it takes the company-derived title every other surface sees.
            title: titlesFromRoute(type)
              ? routeTitle(placeName(places, from) ?? '', placeName(places, to) ?? '')
              : finalTitle,
            fromPlaceId: from,
            toPlaceId: to,
            event: seed ? { ...seed, id: crypto.randomUUID() } : undefined,
            ...(firstOfJourney ? outerStart : undefined),
            ...(lastOfJourney ? outerEnd : undefined),
          };
        };

        let hostId = booking?.id;
        if (isCreate) {
          if (isSpan && isTransport) {
            // **A JOURNEY IS A CHAIN OF BOOKINGS, WRITTEN IN ONE GROUP** (ADR-0159,
            // generalising ADR-0154 §4's second booking). One leg per point-to-point
            // hop, then the return's legs over the same points reversed — all inside
            // the one `withChangeGroup`, so a three-leg journey is one pending change
            // and one undo, not six.
            //
            // **The note's host is the FIRST leg** (ADR-0154 §6 generalised): it is the
            // journey that happens first and the one the derived relation calls the
            // primary. `hostId` is assigned once, deliberately, rather than left to the
            // last statement to overwrite.
            for (const [i, times] of outLegs.entries()) {
              const created = await indexVerbs.createBooking(legBooking('out', i, times));
              if (i === 0) hostId = created?.id;
            }
            for (const [i, times] of backLegs.entries()) {
              await indexVerbs.createBooking(legBooking('back', i, times));
            }
          } else {
            // A single-place booking: one write, its schedule a span or a day.
            const seed = isSpan
              ? buildSpanSeed(
                  {
                    startAt: outLegs[0].start,
                    endAt: outLegs[0].end,
                    kind: kind.value,
                    icon: icon.value,
                    category,
                  },
                  startZone,
                  endZone,
                )
              : buildEventSeed(
                  { date, start, end, kind: kind.value, icon: icon.value, category },
                  startZone,
                );
            const created = await indexVerbs.createBooking({
              type,
              ...base,
              title: finalTitle,
              placeId,
              event: seed ? { ...seed, id: seed.id ?? crypto.randomUUID() } : undefined,
              ...startPatch,
              ...endPatch,
            });
            hostId = created?.id;
          }
        } else {
          // An edit is always ONE leg (stops are create-only), and it keeps the linked
          // event's id so the server upserts in place (ADR-0093).
          const seed = isSpan
            ? buildSpanSeed(
                {
                  startAt: outLegs[0].start,
                  endAt: outLegs[0].end,
                  kind: kind.value,
                  icon: icon.value,
                  category,
                },
                startZone,
                endZone,
              )
            : buildEventSeed(
                { date, start, end, kind: kind.value, icon: icon.value, category },
                startZone,
              );
          const event = seed
            ? { ...seed, id: seed.id ?? linkedEvent?.id ?? crypto.randomUUID() }
            : undefined;
          await indexVerbs.updateBooking(booking.id, {
            title: finalTitle,
            ...base,
            event,
            ...startPatch,
            ...endPatch,
            ...(isTransport ? { fromPlaceId, toPlaceId: hireReturnId } : { placeId }),
          });
        }

        // **The notes, after their host and inside the same group** (ADR-0152 §6b). Ordering
        // is the whole reason this is here rather than beside the booking write: offline the
        // outbox is FIFO, so a note queued after its booking still finds its host on the
        // server. Nothing is awaited on a network round-trip — the booking's id is
        // client-generated, so it is known the moment the verb returns, queued or not.
        //
        // These are ordinary queued ops, NOT ADR-0093 synthetic changes: that pattern is for
        // an entity the SERVER materializes with no op of its own, and a note has one.
        //
        // **On a round trip the host is the OUTBOUND** (ADR-0154 §6), and it is explicit
        // rather than incidental: `hostId` is assigned from the first `createBooking`, so
        // leaving the second one to overwrite it would hang the note on the RETURN by
        // statement order rather than by decision. The outbound is the journey that
        // happens first and the one §5's derived relation calls the primary.
        if (hostId) {
          for (const body of composer.pending()) {
            await noteVerbs.createNote({ body, bookingId: hostId });
          }
        }
      });
      onClose();
    } catch {
      setSaving(false); // the verb already toasted + rolled back
    }
  };

  // **THE FORM IS STEPPED** (ADR-0155 §5, revised by the owner 2026-08-02 — see that ADR's
  // build log). It measures ~1565px against ~675px of visible sheet on a 390×844 phone, and
  // with a round trip the entire return leg sat below the fold. Three steps, which are the
  // form's own three subjects rather than an arbitrary paging of its fields.
  //
  // Called HERE, above the `Sheet`, because the primitive's back layer must register after
  // the Modal's own — the hook's header explains why that makes it a hook.
  const steps = useFormSteps<StepId, BookingField>({
    steps: STEP_IDS.map((id) => ({ id, validate: () => problemsIn(id) })),
    errors,
    onCommit: () => void commit(),
  });
  /** The labels name what each step ASKS. A one-way single leg keeps today's three words
   *  exactly; a journey that has more than one leg has to say WHICH leg, because with
   *  four schedules on four steps "מתי" alone leaves you counting. */
  const multiLeg = legCount > 1;
  const stepLabels = STEP_IDS.map((id) => {
    if (id === 'type') return t.index.form.stepType;
    if (id === 'what') return t.index.form.stepWhat;
    if (id === 'more') return t.index.form.stepDetails;
    const [side, index] = id.split('-');
    const n = Number(index) + 1;
    if (side === 'out') {
      if (multiLeg) return t.index.form.stepLeg(n);
      return twoLegs ? t.index.form.stepWhenOut : t.index.form.stepWhen;
    }
    return multiLeg ? t.index.form.stepBackLeg(n) : t.index.form.legBack;
  });

  /** **The leg the current step is asking about**, or null when the step is not a leg.
   *  One derivation for the heading, the two fields, the zones and the marks, so a step
   *  cannot label itself one leg and edit another. */
  const legStep = (() => {
    const id = steps.step;
    if (id === 'type' || id === 'what' || id === 'more') return null;
    const [rawSide, rawIndex] = id.split('-');
    const side = rawSide as LegSide;
    const index = Number(rawIndex);
    const list = side === 'out' ? outLegs : backLegs;
    const points = side === 'out' ? routePoints : reversed;
    // Where the previous leg landed — the day this one opens on, since a connection
    // almost always departs the same day it arrived. Falls back to the trip's start.
    const previous = index > 0 ? list[index - 1] : side === 'back' ? outLegs[legCount - 1] : null;
    return {
      side,
      index,
      times: list[index] ?? BLANK_LEG,
      zones: legZones(side, index),
      fromName: placeName(places, points[index]),
      toName: placeName(places, points[index + 1]),
      first: side === 'out' && index === 0,
      // The zone chip belongs to the JOURNEY's two ends, which are the outbound's: the
      // return flies the same two places, so pinning one there would be a second control
      // for one fact.
      outerStart: side === 'out' && index === 0,
      outerEnd: side === 'out' && index === legCount - 1,
      defaultDate: previous?.end.split('T')[0] || trip.startDate,
    };
  })();

  // `שבץ במסלול` opened this sheet FOR the schedule (ADR-0138 §7), which is a STEP now — so
  // the shortcut NAVIGATES to it and then takes focus, in that order and across two renders:
  // the step's first control does not exist until the step is on screen. (Same ordering the
  // primitive's own deferred refusal needs, and for the same reason.) The ref makes it a
  // one-shot, so stepping away afterwards is not undone.
  useEffect(() => {
    if (focus !== 'when' || shortcutDone.current) return;
    // The schedule is a step per leg now, so the shortcut lands on the FIRST of them.
    if (steps.step !== FIRST_LEG_STEP) {
      steps.goTo(FIRST_LEG_STEP);
      return;
    }
    shortcutDone.current = true;
    const first = whenRef.current?.querySelector<HTMLElement>('input, button');
    first?.scrollIntoView({ block: 'center' });
    first?.focus();
    // Deps are the two facts this reacts to; `steps` itself is rebuilt every render.
  }, [focus, steps]);

  return (
    <>
      <Sheet
        ariaLabel={isCreate ? t.index.form.createTitle : t.index.sheet.editTitle}
        onClose={requestClose}
      >
        <div
          className="booking-sheet"
          // Addressing a refusal retires it, wherever in the sheet it was made.
          {...errors.formProps}
          // Reveal the focused field above the on-screen keyboard within the
          // scrolling sheet (matches EventForm — the keyboard never covers a field).
          onFocusCapture={(e) => {
            if (e.target instanceof HTMLElement)
              e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }}
        >
          <FormStepPanel steps={steps} labels={stepLabels}>
            {/* **The picked type, on every step but its own** (field report #2). Collapsed
                to the one card that was chosen, with the way back to the grid beside it —
                so the eight-option grid is paid for once, at the moment it is being
                answered, and the answer stays legible everywhere after that. On an edit it
                carries no control, because a saved booking's type is not editable. */}
            {steps.step !== 'type' && (
              <BookingTypeRow
                type={type}
                onChange={isCreate ? () => steps.goTo('type') : undefined}
              />
            )}

            {steps.step === 'type' && (
              <ChoiceGrid
                options={BOOKING_TYPE_OPTIONS}
                value={type}
                onChange={changeType}
                columns={3}
                ariaLabel={t.index.form.kindLabel}
              />
            )}

            {steps.step === 'what' && (
              <>
                {/* The identity row carries no label of its own (the caption below states
              the type), so the shell around it is here to hold the mark: a booking
              with no name is refused AT the name. */}
                <Field {...errors.field('title')}>
                  <div className="titlerow">
                    <IconPicker
                      icon={icon.value}
                      // Booking icon is a badge only — the category comes from the type
                      // (ADR-0038), so the picker's category suggestion is ignored here.
                      onChange={icon.set}
                    />
                    {isHire ? (
                      // **A hire's identity is its company** (ADR-0163 §3), so the preview
                      // shows the title this form will actually save — the company once it
                      // is typed, and the type label until then, which is the real fallback
                      // rather than a ghost. It stays READ-ONLY like the route preview it
                      // replaced: the name is entered in the field that owns it, and the
                      // journey ghost (`בחרו מוצא ויעד`) was the last place on this form
                      // still asking a hire for a route.
                      <div className="bs-route-preview">
                        <span className={provider.trim() ? undefined : 'bs-route-ghost'}>
                          {hireTitle()}
                        </span>
                      </div>
                    ) : isTransport ? (
                      // A flight's identity is its route, not a name (ADR-0059 §3). The
                      // endpoints are now picked places, so the title row shows a derived
                      // read-only route preview; the two PlacePickers live in the route
                      // field just below (ADR-0059 §3 reshaping, ADR-0113 follow-up).
                      <div className="bs-route-preview">
                        {fromPlaceId || toPlaceId ? (
                          <RouteLabel
                            from={placeName(places, fromPlaceId)}
                            to={placeName(places, toPlaceId)}
                            roundTrip={twoLegs}
                          />
                        ) : (
                          <span className="bs-route-ghost">{t.index.form.routePreviewGhost}</span>
                        )}
                      </div>
                    ) : (
                      <input
                        className="bs-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        // **The placeholder is the name this will actually save** when the
                        // linked place can supply one (field report #9) — otherwise the
                        // field looks required exactly where it stopped being required.
                        // The accessible name stays the generic prompt: the placeholder is
                        // now a value, and naming the box after it would be naming it
                        // after its own content.
                        placeholder={placeTitle() || t.index.sheet.titlePlaceholder}
                        aria-label={t.index.sheet.titlePlaceholder}
                        autoFocus={isCreate}
                      />
                    )}
                  </div>
                </Field>

                <div className="bs-caption">
                  <span>
                    <Icon name="sparkle" /> {t.index.form.autoCaption}{' '}
                    <span className="cat-readout">{t.index.bookingType[type]}</span>
                  </span>
                  {icon.touched && (
                    <button
                      type="button"
                      className="bs-revert"
                      onClick={() => icon.reset(BOOKING_TYPE_ICON[type])}
                    >
                      <Icon name="reset" /> {t.index.form.reset}
                    </button>
                  )}
                </div>

                {/* **The direction control** (ADR-0154 §4), directly ABOVE the route field
                    rather than inside it. §4 put it "in the route field" to keep it next to
                    the `⇄` in the preview, and that proximity is what matters — but once it
                    can REFUSE (field report #8) it needs a `Field` of its own to be marked
                    in, and a nested one renders its error ahead of the error belonging to
                    the field wrapping it, so a missing route was reported at the direction's
                    box. One box, one name (ADR-0150). */}
                {isTransport && offersRoundTrip && (
                  <Field {...errors.field('direction')}>
                    <div className="bs-direction">
                      <ChoiceGrid
                        layout="pills"
                        options={[
                          // No glyph: a direction is a word, not a symbol, and `Choice`'s
                          // empty string is the documented way to omit the slot.
                          { value: 'one', icon: '', label: t.index.form.oneWay },
                          { value: 'two', icon: '', label: t.index.form.roundTrip },
                        ]}
                        // **Nothing is selected until it is chosen** (field report #8).
                        // `ChoiceGrid` has taken an optional value since ADR-0109 §11, so an
                        // unanswered single-select is the primitive's own documented state
                        // rather than anything new here.
                        value={roundTrip === undefined ? undefined : roundTrip ? 'two' : 'one'}
                        onChange={(v) => setRoundTrip(v === 'two')}
                        ariaLabel={t.index.form.directionLabel}
                      />
                    </div>
                  </Field>
                )}

                {/* The route field: two real place pickers (origin → destination), so
              transport endpoints carry coords + timezones like any other place. */}
                {isTransport && (
                  <Field
                    label={isHire ? t.index.form.hireEndsLabel : t.index.form.routeLabel}
                    {...errors.field('route')}
                  >
                    {/* **The direction control** (ADR-0154 §4), in the ROUTE field rather than
                  beside the schedule: what it describes is the shape of the journey
                  between these two places, and putting it here makes the `⇄` in the
                  preview directly above the immediate feedback for the tap. Offered only
                  where there is a route to mirror, and only on a create. */}
                    {/* One component, two hosts (ADR-0154 §3) — `EventForm` renders the same
                  field, which is how a booked transport event stopped sending a single
                  `placeId` to a server that refuses one. The swap arrives here with it. */}
                    <RouteField
                      from={fromPlaceId}
                      to={toPlaceId}
                      onChange={({ from, to }) => {
                        setFromPlaceId(from);
                        setToPlaceId(to);
                      }}
                      onFind={(end, side) => findPlace(end, side)()}
                      // Stops only where the type's profile allows a sequence, and only
                      // on a create (ADR-0159) — the same terms as the direction control
                      // above, and for the same reason: turning a saved leg into a
                      // journey is a different action.
                      stops={offersStops ? stopPlaceIds : undefined}
                      onStopsChange={offersStops ? setStopPlaceIds : undefined}
                      onFindStop={(index, side) => findStop(index, side)}
                      // **A hire asks about counters, not a direction** (ADR-0163 §1).
                      shape={isHire ? 'hire' : 'journey'}
                    />
                  </Field>
                )}

                {/* Single-place types carry a location; transport's places are its route
              endpoints above (ADR-0048). It belongs in this step for the same reason the
              route does: both answer WHERE, which is half of what this step asks. */}
                {!isTransport && (
                  <Field
                    label={t.index.sheet.locationLabel}
                    hint={placeId ? undefined : t.placePicker.noLocationHint}
                  >
                    <PlacePicker
                      value={placeId}
                      onChange={setPlaceId}
                      onFind={findPlace('placeId')}
                    />
                  </Field>
                )}
              </>
            )}

            {/* "When" comes first (right after the identity row), through the one
              WhenField standard — a span for two-endpoint bookings, a single day
              otherwise. Never a cramped native datetime box (U-05).

              The wrapper exists for `focus="when"` (ADR-0138 §7): the ref goes on
              the BLOCK rather than on a `WhenField` autofocus prop, because the two
              variants have different first controls and the sheet is the one place
              that knows which is rendered. */}
            {legStep && (
              <div ref={whenRef}>
                {isSpan ? (
                  <>
                    {/* **Leg headings arrive in PAIRS or not at all** (ADR-0154 §4,
                    extended over a sequence). One journey of one leg needs no name and
                    today's form is unchanged; the moment there are two schedules to
                    keep apart — a return, a stop, or both — each says which leg it is
                    and where that leg goes. */}
                    {(multiLeg || twoLegs) && (
                      <div className="bs-leg-head">
                        <span>
                          {legStep.side === 'out'
                            ? multiLeg
                              ? t.index.form.legNumber(legStep.index + 1)
                              : t.index.form.legOut
                            : multiLeg
                              ? t.index.form.legBackNumber(legStep.index + 1)
                              : t.index.form.legBack}
                        </span>
                        <RouteLabel from={legStep.fromName} to={legStep.toName} />
                      </div>
                    )}
                    <WhenField
                      variant="span"
                      start={legStep.times.start}
                      end={legStep.times.end}
                      // **The offers ride the edit** (field reports #4/#11): the type's
                      // start clock lands when the day is first set, and the end follows
                      // the start until this call sees the END change — which is the one
                      // moment a human has said what it is.
                      onChange={({ start: s, end: e }) => {
                        const answered = e !== legStep.times.end;
                        if (answered) setEndTouched(true);
                        setLeg(
                          legStep.side,
                          legStep.index,
                          offerLegTimes(
                            type,
                            legStep.times,
                            { start: s, end: e },
                            endTouched || answered,
                          ),
                        );
                      }}
                      minDate={trip.startDate}
                      maxDate={trip.endDate}
                      labels={spanLabels(type)}
                      // Each leg opens on the day the one before it landed, which is
                      // what a connection almost always is — and on the trip's first
                      // day when there is nothing before it.
                      defaultDate={legStep.defaultDate}
                      timeZone={legStep.zones.start}
                      endTimeZone={legStep.zones.end}
                      durationUnit={bookingDurationUnit(type)}
                      // The chip is the journey's, not the leg's: only its outer ends
                      // can be pinned, because an interior stop has a picked place and
                      // that is exactly what the override stands in for (ADR-0107 §6).
                      zones={{
                        start: legStep.outerStart
                          ? zoneChip(
                              fromPlaceId ?? placeId,
                              legStep.zones.start,
                              startOverride,
                              setStartOverride,
                            )
                          : undefined,
                        end: legStep.outerEnd
                          ? zoneChip(
                              isTransport ? toPlaceId : placeId,
                              legStep.zones.end,
                              endOverride,
                              setEndOverride,
                            )
                          : undefined,
                      }}
                      marks={{
                        start: errors.field(legField(legStep.side, legStep.index, 'start')),
                        end: errors.field(legField(legStep.side, legStep.index, 'end')),
                      }}
                    />
                    <ZoneNote
                      startZone={legStep.zones.start}
                      endZone={legStep.zones.end}
                      tripZone={trip.timezone}
                      refMs={zoneRefMs}
                    />

                    {/* The commitment is the JOURNEY's, so it is asked once, on the leg
                        that starts it. */}
                    {legStep.first && legStep.times.start && (
                      <KindToggle kind={kind.value} onPick={pickKind} />
                    )}
                  </>
                ) : (
                  <>
                    <WhenField
                      variant="day"
                      dateId="bs-date"
                      dateLabel={t.index.form.dateLabel}
                      date={date}
                      start={start}
                      end={end}
                      onChange={({ date: d, start: s, end: e }) => {
                        const answered = e !== end;
                        if (answered) setEndTouched(true);
                        const next = offerDayTimes(
                          type,
                          { date, start, end },
                          { date: d, start: s, end: e },
                          endTouched || answered,
                        );
                        setDate(next.date);
                        setStart(next.start);
                        setEnd(next.end);
                      }}
                      minDate={trip.startDate}
                      maxDate={trip.endDate}
                      zone={zoneChip(placeId, startZone, startOverride, setStartOverride)}
                      marks={{ date: errors.field('date') }}
                    />
                    <ZoneNote
                      startZone={startZone}
                      endZone={endZone}
                      tripZone={trip.timezone}
                      refMs={zoneRefMs}
                    />
                    {date && <KindToggle kind={kind.value} onPick={pickKind} />}
                  </>
                )}
              </div>
            )}

            {steps.step === 'more' && (
              <>
                {/* **The company** (ADR-0163 §2), above the code because it is the thing
                    you remember and the code is the thing you look up. `dir="ltr"` for the
                    same reason the code has it: these are brand names, typed latin far
                    more often than not — and ADR-0118 permits it on an `<input>`, which is
                    the one element where `auto` would left-anchor a Hebrew placeholder. */}
                <Field label={providerLabel} htmlFor="bs-provider">
                  <input
                    id="bs-provider"
                    dir="ltr"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder={providerPlaceholder}
                  />
                </Field>

                <Field
                  label={t.index.sheet.codeLabel}
                  htmlFor="bs-code"
                  hint={twoLegs || multiLeg ? t.index.form.codeSharedHint : undefined}
                >
                  <input
                    id="bs-code"
                    dir="ltr"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>

                {isHotel && (
                  <>
                    <Field label={t.index.sheet.roomLabel} htmlFor="bs-room">
                      <input id="bs-room" value={room} onChange={(e) => setRoom(e.target.value)} />
                    </Field>
                    <div className="bs-wifi">
                      <div className="bs-wifi-head">
                        <Icon name="wifi" /> {t.index.sheet.wifiTitle}
                        <span className="bs-hint"> · {t.index.sheet.wifiHotelOnly}</span>
                      </div>
                      <div className="bs-row2">
                        <Field label={t.index.sheet.wifiNetwork} htmlFor="bs-wifi-net">
                          <input
                            id="bs-wifi-net"
                            dir="ltr"
                            value={wifiNetwork}
                            onChange={(e) => setWifiNetwork(e.target.value)}
                          />
                        </Field>
                        <Field label={t.index.sheet.wifiPassword} htmlFor="bs-wifi-pass">
                          <input
                            id="bs-wifi-pass"
                            dir="ltr"
                            value={wifiPassword}
                            onChange={(e) => setWifiPassword(e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  </>
                )}

                {/* **The note is written on the way** (ADR-0152 §6b). This is the one form that
              already had a notes field, and it keeps it — as the composer, so a booking's
              notes are rows like everyone else's rather than a string in a JSON blob.

              **On EDIT the existing notes read above that box** — §6b's own last paragraph,
              missed here exactly as it was missed on `EventForm`, so the only reading of a
              booking's notes was a count on a delete confirm. The host is the BOOKING and
              never the linked event: that event is materialized server-side from a seed
              (ADR-0093) and has no client id to hang a note on, which is why this form's
              composer, `EventForm`'s `יש הזמנה` half and a booked idea's `carryNotes` all
              write `bookingId`. `canAdd` is off for the same reason it is off there: the
              box below already is the way to add, and it rides this form's save. */}
                {booking && (
                  <HostNotes
                    host={{ kind: 'booking', id: booking.id, name: booking.title }}
                    canAdd={false}
                  />
                )}
                <Field
                  label={booking ? t.notes.composer.labelMore : t.notes.composer.label}
                  htmlFor="bs-notes"
                  hint={t.notes.composer.hint}
                >
                  <NoteComposer state={composer} id="bs-notes" />
                </Field>
              </>
            )}
          </FormStepPanel>

          {/* Only what has no field to point at still reads down here. */}
          <FormError>{errors.formError}</FormError>

          {/* `הבא` until the last step, `שמירה` there; `ביטול` on the first, `הקודם` after.
              The primitive owns those labels so two stepped surfaces cannot word them
              differently. **Delete only on the last step**: it belongs beside the decision
              to commit, not beside a control that is only navigating. */}
          <FormStepActions
            steps={steps}
            onCancel={requestClose}
            busy={saving}
            destructive={
              isCreate || !steps.isLast
                ? undefined
                : { label: t.index.sheet.delete, onClick: () => setDeleting(true) }
            }
          />
        </div>
      </Sheet>

      {deleting && booking && (
        <DeletePrompt
          hasLinkedEvent={!!linkedEvent}
          linkedIsHard={linkedEvent?.kind === 'hard'}
          partnerLeg={pair?.leg}
          notes={bookingNotes}
          linkedNotes={linkedEventNotes}
          onCancel={() => setDeleting(false)}
          onChoose={(choice) => {
            void indexVerbs.deleteBooking(booking.id, deleteFlags(choice)).catch(() => {});
            setDeleting(false);
            onClose();
          }}
        />
      )}

      {prompting && (
        <ConfirmDialog
          tone="danger"
          title={t.common.discardTitle}
          body={t.common.discardBody}
          confirmLabel={t.common.discardConfirm}
          cancelLabel={t.common.discardCancel}
          onConfirm={confirmDiscard}
          onCancel={cancelDiscard}
        />
      )}
    </>
  );
}

/** **The picked booking type, collapsed** (field report #2). The full grid is the answer
 *  to one question asked once, on its own step; from then on the sheet states the answer
 *  and offers the way back to it.
 *
 *  `onChange` is omitted on an edit, and the row is then a statement rather than a
 *  control — a saved booking's type has never been editable, so an affordance here would
 *  promise something the form does not do. */
function BookingTypeRow({ type, onChange }: { type: BookingType; onChange?: () => void }) {
  return (
    <div className="bs-type-row">
      <span className="bs-type-ic" aria-hidden="true">
        {BOOKING_TYPE_ICON[type]}
      </span>
      <span className="bs-type-lbl">{t.index.bookingType[type]}</span>
      {onChange && (
        <button type="button" className="bs-type-change" onClick={onChange}>
          <Icon name="reset" /> {t.index.form.changeType}
        </button>
      )}
    </div>
  );
}

/** The which-zone-are-these-times caption under a booking's schedule (ADR-0107).
 *  Cities aren't named (the route pickers show them); it just reassures that each
 *  end is its own local time and states how far apart, with direction: a
 *  zone-crossing route reads "זמן מקומי בכל עיר · ביעד שעה אחורה", a single-place
 *  booking (in a zone differing from the trip's) "זמן מקומי · המקום שעה קדימה".
 *  Shown only when there's a real shift — a zero difference is no ambiguity.
 *  A statement, not a control: the editable chip sits on the time fields above. */
function ZoneNote({
  startZone,
  endZone,
  tripZone,
  refMs,
}: {
  startZone: string;
  endZone: string;
  tripZone: string;
  refMs: number;
}) {
  const at = new Date(refMs);
  const crossing = startZone !== endZone;
  // Destination vs origin for a crossing; the place vs the trip's zone otherwise.
  const delta = crossing
    ? zoneOffsetMinutes(at, endZone) - zoneOffsetMinutes(at, startZone)
    : zoneOffsetMinutes(at, startZone) - zoneOffsetMinutes(at, tripZone);
  if (delta === 0) return null;
  const mag = hoursPhrase(Math.abs(delta));
  const ahead = delta > 0;
  return (
    <div className="bs-zone-note">
      <Icon name="clock" />{' '}
      {crossing
        ? t.index.form.zoneNoteTransport(mag, ahead)
        : t.index.form.zoneNotePlace(mag, ahead)}
    </div>
  );
}

function KindToggle({
  kind,
  onPick,
}: {
  kind: 'hard' | 'soft';
  onPick: (k: 'hard' | 'soft') => void;
}) {
  return (
    <Field label={t.index.form.kindLabel}>
      <div className="kind-toggle">
        <button
          type="button"
          className={'soft' + (kind === EVENT_KIND.SOFT ? ' on' : '')}
          onClick={() => onPick(EVENT_KIND.SOFT)}
        >
          {t.index.form.kindSoft}
        </button>
        <button
          type="button"
          className={'hard' + (kind === EVENT_KIND.HARD ? ' on' : '')}
          onClick={() => onPick(EVENT_KIND.HARD)}
        >
          <Icon name="lock" /> {t.index.form.kindHard}
        </button>
      </div>
    </Field>
  );
}

export function DeletePrompt({
  hasLinkedEvent,
  linkedIsHard,
  partnerLeg,
  notes,
  linkedNotes,
  onCancel,
  onChoose,
}: {
  hasLinkedEvent: boolean;
  linkedIsHard: boolean;
  /** The other leg of a derived round trip, if there is one (ADR-0154 §5). It buys a
   *  STATEMENT that the partner survives — never a fourth button. */
  partnerLeg?: PartnerLeg;
  /** The booking's own notes, which every branch of this dialog destroys (ADR-0152 §2) —
   *  and unlike an event's, they do not come back: a booking delete has no undo. */
  notes: number;
  /** The linked event's, which only `both` takes. Named on that choice rather than up here,
   *  because `unlink` keeps the event and therefore keeps them: one line above the choices
   *  would be a warning that is false in the branch beside it. */
  linkedNotes: number;
  onCancel: () => void;
  onChoose: (choice: 'both' | 'unlink') => void;
}) {
  // Reuses `.bs-hard-note`'s slot and voice: both are a quiet line of consequence above
  // the choices, and this dialog should not grow a second way of saying one.
  const pairNote = partnerLeg && (
    <p className="bs-hard-note">
      <Icon name="link" /> {t.index.del.pairNote(partnerLeg)}
    </p>
  );
  const noteNote = notes > 0 && (
    <>
      <Icon name="clipboard" /> {t.notes.hostDelete(notes)}
    </>
  );
  // A booking with no linked event is a plain confirm; a linked one offers the
  // delete-both-vs-unlink choice (ADR-0047 §3). Both route through the generic
  // danger dialog — Modal portals it above the open booking sheet.
  if (!hasLinkedEvent) {
    return (
      <ConfirmDialog
        tone="danger"
        icon={<Icon name="trash" />}
        title={t.index.del.plainTitle}
        body={t.index.del.plainBody}
        consequence={noteNote || undefined}
        confirmLabel={t.index.del.confirmDelete}
        cancelLabel={t.index.del.cancel}
        onConfirm={() => onChoose('unlink')}
        onCancel={onCancel}
      >
        {pairNote}
      </ConfirmDialog>
    );
  }
  return (
    <ConfirmDialog
      tone="danger"
      icon={<Icon name="link" />}
      title={t.index.del.linkedTitle}
      body={t.index.del.linkedBody}
      consequence={noteNote || undefined}
      onCancel={onCancel}
    >
      {linkedIsHard && (
        <p className="bs-hard-note">
          <Icon name="lock" /> {t.index.del.hardNote}
        </p>
      )}
      {pairNote}
      <div className="bs-choices">
        <button type="button" className="bs-choice danger" onClick={() => onChoose('both')}>
          <div className="bs-choice-t">{t.index.del.both}</div>
          <div className="bs-choice-s">
            {t.index.del.bothSub}
            {linkedNotes > 0 && ` ${DOT_SEPARATOR} ${t.notes.hostDelete(linkedNotes)}`}
          </div>
        </button>
        <button type="button" className="bs-choice" onClick={() => onChoose('unlink')}>
          <div className="bs-choice-t">{t.index.del.unlink}</div>
          <div className="bs-choice-s">{t.index.del.unlinkSub}</div>
        </button>
      </div>
      <button type="button" className="confirm-cancel bs-choice-cancel" onClick={onCancel}>
        {t.index.del.cancel}
      </button>
    </ConfirmDialog>
  );
}
