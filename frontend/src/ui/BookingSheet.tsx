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
  edgeMeaning,
  placeSearchKindFor,
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
import { generateId } from '../lib/id';
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
import { JourneyField, type JourneyNode } from './domain/JourneyField';
import { resolveJourneyDays } from '../lib/journey-days';
import {
  journeyViewOf,
  withJourneyDate,
  withMomentDayOffset,
  withMomentTime,
} from '../lib/journey-legs';
import { DATE_SOURCES, suggest, type KnownLeg } from '../lib/form-suggest';
import { destinationRefOf } from '@waypoint/shared';
import { Field } from './primitives/Field';
import { PlacePicker } from './primitives/PlacePicker';
import { NoteComposer, useNoteComposer } from './NoteComposer';
import { DocumentAttachField, useDocumentAttach, writeStagedAttachments } from './DocumentAttach';
import { HostNotes, useHostNoteCount } from './HostNotes';
import { HostTasks, useTaskStaging, writeStagedTasks } from './HostTasks';
import { ChoiceDisclosure } from './primitives/ChoiceDisclosure';
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
  switchIsLossy,
  type BookingSwitchState,
} from '../lib/booking-edit';
import { routeTitle } from '../lib/route-title';
import {
  effectiveTitle,
  placeDerivedTitle,
  placeName,
  placeTimezone,
  titleAfterErrand,
} from '../lib/places';
import { withChangeGroup } from '../lib/outbox';
import { zoneOffsetMinutes, zonedIso } from '../lib/time';
import { hoursPhrase } from '../lib/duration';
import { bookingDurationUnit, timingLabels } from '../lib/booking-timing';
import { BOOKING_TYPE_ICON, DOT_SEPARATOR, SUMMARISE_FROM_NODES } from '../constants';
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
  const { trip, events, places, bookings, indexVerbs, noteVerbs, attachmentVerbs, taskVerbs } =
    useTrip();
  const startErrand = useStartPlaceErrand();
  const isCreate = !booking;

  const whenRef = useRef<HTMLDivElement>(null);
  const shortcutDone = useRef(false);
  /** One-shot, like `shortcutDone`: stepping away after the errand return is not undone. */
  const errandDone = useRef(false);
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
  /** The in-place chooser's disclosure state, on an edit. Create keeps its own step. */
  const [typeOpen, setTypeOpen] = useState(false);
  /** A lossy switch waiting on its confirm. `null` = nothing pending. */
  const [pendingType, setPendingType] = useState<BookingType | null>(null);
  // The badge glyph follows the booking TYPE while untouched, and the ✨ caption below offers a
  // revert once a human has picked one (`reset` hands it back to the derivation). Whether a
  // SAVED glyph counts as picked is `bookingSheetDraft`'s value test (field report #31) — it
  // used to be a flat `false` here, so the ✨ never appeared on a reopened booking.
  const icon = useDerivedField(
    draft ? draft.icon : initial.icon,
    draft ? draft.iconTouched : initial.iconTouched,
  );
  // **The name follows the linked Place until a person types one** (field report #30). It was
  // a plain `useState` whose derived value showed only as a PLACEHOLDER, so the field looked
  // empty while the save (`finalTitle`, field report #9) already knew what it would write —
  // the visible value and the saved value are one precedence rule now, not two.
  //
  // `titleAfterErrand` is why the draft branch is not a plain read: the errand assigns the
  // chosen place into the blob without knowing the title derives from it.
  const title = useDerivedField(
    draft
      ? titleAfterErrand(places, draft.placeId, draft.title, draft.titleTouched)
      : initial.title,
    draft ? draft.titleTouched : initial.titleTouched,
  );
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
  /** Whether the notes section's inline box is showing anything — open, or holding notes
   *  typed and not yet saved. The section reads its empty line off this (ADR-0192 §2). */
  const composerActive = composer.open || composer.drafts.length > 0;
  // Tasks typed before the booking exists, held until it does (ADR-0191 §7).
  const taskStaging = useTaskStaging();
  const attach = useDocumentAttach();
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
  /** **The way home's own stops** (ADR-0203 §6), `null` while it mirrors the outbound. The
   *  draft beside it holds what was typed, so leaving "a different way" and coming back is
   *  free — see `bookingSheetDraft`'s note on why they are two fields. */
  const [returnStops, setReturnStops] = useState(
    draft ? draft.returnStopPlaceIds : initial.returnStopPlaceIds,
  );
  const [returnStopsDraft, setReturnStopsDraft] = useState(
    draft ? draft.returnStopsDraft : initial.returnStopsDraft,
  );
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
  /** **Which node of the journey you have OPENED; the rest summarise** (ADR-0203 §9). Per
   *  side, so stepping to the return does not inherit the outbound's place in the rail.
   *  `null` means you have not picked one, and `journeyOf` derives which node that opens —
   *  the state holds the choice, not the answer. */
  const [openNode, setOpenNode] = useState<{ out: number | null; back: number | null }>({
    out: null,
    back: null,
  });
  const bookingNotes = useHostNoteCount('booking', booking?.id);
  const linkedEventNotes = useHostNoteCount('event', linkedEvent?.id);

  // ONE ERRAND BUILDER FOR THE THREE PLACE FIELDS (ADR-0134 §1/§2). Each call names its own
  // field, and the label says which end of the journey it is — a banner reading only
  // "רכבת לקיוטו" would leave you guessing which side you were choosing. `startErrand` is
  // null only where there is no Map tab to route to, which no host of this sheet is.
  const findPlace = (field: PlaceErrandField, side?: string, index?: number) => () =>
    startErrand?.({
      target: { kind: 'booking', id: booking?.id, field, index },
      // **A route field wants the kind of place its type is boarded at** (field report #6,
      // widened by ADR-0203 §8): searching `נתב"ג` unrestricted answers with the terminal, the
      // car park and the hotel beside it, and the one you need is not reliably among them.
      //
      // The type no longer decides that here. `placeSearchKindFor` reads it off
      // `BOOKING_TYPE_PROFILE`, which closes the gap this comment used to name itself — "a
      // train's stop is a station this restriction has no type for yet" — so a train, a bus
      // and a ferry stopped searching the whole corpus, and a fifth transport mode answers by
      // existing. Route fields only, still: a hotel's `placeId` is a hotel, and a hire's two
      // counters are counters, so its profile restricts nothing on purpose.
      ...(field === 'placeId' ? undefined : { kind: placeSearchKindFor(type) }),
      label: [title.value.trim() || t.map.errand.untitledBooking, side]
        .filter(Boolean)
        .join(` ${DOT_SEPARATOR} `),
      draft: {
        type,
        iconTouched: icon.touched,
        icon: icon.value,
        title: title.value,
        titleTouched: title.touched,
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
        startWindow,
        endWindow,
        roundTrip,
        returnLegs,
        returnStopPlaceIds: returnStops,
        returnStopsDraft,
        endTouched,
        kind: kind.value,
        kindTouched: kind.touched,
      } satisfies BookingSheetDraft,
    });

  /** The errand for one STOP. Same builder, one difference: the target carries an
   *  INDEX, because a stop is an element of a list rather than a `Booking` column
   *  (ADR-0159 extends ADR-0134 §2's channel by exactly that much). */
  const findStop = (index: number, side: string) => findPlace('stopPlaceIds', side, index)();
  /** The way back's stops are their OWN errand target (ADR-0203 §6): the two lists can be
   *  different lengths, so an index into one is not an index into the other. */
  const findReturnStop = (index: number, side: string) =>
    findPlace('returnStopPlaceIds', side, index)();

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
  /** **A JOURNEY, which is not the same set as "has a span"** (ADR-0203 §3, corrected in the
   *  build after the first attempt drew a rail for a car hire).
   *
   *  `isSpan && isTransport` is true for `car`, because a hire carries a route — so the rail
   *  claimed it, and dropped ADR-0184 §2's `＋ עד` window, which a HELD edge offers and a
   *  journey never has. ADR-0163's own title is the sentence the design needed first: a hire
   *  is not a journey. A hotel is not one either, and it genuinely has two calendar dates —
   *  a stay spans them — so both keep `WhenField`'s span, its two dates and its windows.
   *
   *  `titlesFromRoute` is the discriminant rather than a fifth predicate, for the reason
   *  ADR-0163 §3 separated it: a journey is the thing the route NAMES. */
  const isJourney = isSpan && isTransport && titlesFromRoute(type);
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
  /** **The OUTBOUND's leg count.** Kept as a plain name because three readers genuinely mean
   *  that journey — the outbound resize, the "is this a sequence" display flag, and the day a
   *  return's first leg opens on. Every reader that depends on WHICH side asks
   *  `legCountFor(side)` instead; the two stopped being the same number when a return got its
   *  own stops (§6). */
  const legCount = isSpan ? routePoints.length - 1 : 1;
  const reversed = [...routePoints].reverse();
  /** **The way home's own points, when it has them** (ADR-0203 §6). Reported from the field:
   *  a round trip's stops "could be different stops and/or a different number of stops".
   *
   *  **The ENDS stay mirrored and that is what keeps this small** — you fly home from where
   *  you landed, so what varies is the middle. An open-jaw trip (in to Tbilisi, out of
   *  Kutaisi) is a different feature and is deliberately not half-built here.
   *
   *  `null` means the whole way back is still `reversed`, which is the common case and costs
   *  nothing: no second list, no second leg count. */
  const backPoints = returnStops === null ? reversed : [hireReturnId, ...returnStops, fromPlaceId];
  /** **The points a SIDE walks**, which five call sites spelled out inline before a sixth
   *  read `routePoints` directly and told the flight home it was the flight out. A journey's
   *  side is the only thing that decides the direction, so it is one function. */
  function pointsFor(side: LegSide) {
    return side === 'out' ? routePoints : backPoints;
  }
  /** **How many legs a SIDE has, which used to be one number for both journeys.** That single
   *  `legCount` is the reason §6 was never a small change: nine call sites read it, and each
   *  had to learn which side it was talking about before a return could have a different
   *  number of stops.
   *
   *  **Declared ABOVE the leg resize that reads it**, which the first attempt was not: a
   *  hoisted `function` is reachable early but the `const backPoints` it closes over is not,
   *  so `legCountFor('back')` threw "cannot access before initialization" on every round trip.
   *  Caught by eight specs at once, and the reason this block sits here rather than beside
   *  `legZones` where it reads more naturally. */
  function legCountFor(side: LegSide) {
    return isSpan ? pointsFor(side).length - 1 : 1;
  }
  // Read through a resize rather than kept in sync by a setter: state can lag the
  // number of stops for one render, and normalising on READ makes that unrepresentable
  // instead of a bug that only appears when a stop is added mid-edit.
  const outLegs = resizeLegs(legs, legCount);
  const backLegs = twoLegs ? resizeLegs(returnLegs, legCountFor('back')) : EMPTY_LEGS;
  const setLeg = (side: 'out' | 'back', index: number, next: LegTimes) => {
    const write = side === 'out' ? setLegs : setReturnLegs;
    const current = side === 'out' ? outLegs : backLegs;
    write(current.map((leg, i) => (i === index ? next : leg)));
  };
  /** The whole side at once — the rail edits a JOURNEY, and one moment can move more than
   *  one leg (the date moves all of them, keeping every offset). */
  const setSideLegs = (side: 'out' | 'back', next: LegTimes[]) =>
    (side === 'out' ? setLegs : setReturnLegs)(next);
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
   *  else can answer. `back` walks its own points, which since §6 may not be the outbound's
   *  reversed at all. */
  const legZones = (side: 'out' | 'back', index: number) => {
    const points = pointsFor(side);
    const outerStart = side === 'out' ? startZone : endZone;
    const outerEnd = side === 'out' ? endZone : startZone;
    return {
      start: index === 0 ? outerStart : zoneOf(points[index], null),
      end: index === legCountFor(side) - 1 ? outerEnd : zoneOf(points[index + 1], null),
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

  /** **The rail's own view of one side of the journey** (ADR-0203 §1/§3). Everything here is
   *  derived from `LegTimes[]` through `lib/journey-legs`, which is what keeps the save path,
   *  the per-end zones, the note host and every refusal name working on the shape they
   *  already read (see that module's header for the 32-spec version of this mistake).
   *
   *  A node's zone is its own place's; only the journey's OUTER ends carry a chip, because an
   *  interior stop has a picked place and that is what an override stands in for (ADR-0107
   *  §6). On the return the two outer ends swap, which is the same rule `legZones` follows. */
  const journeyOf = (side: LegSide) => {
    const legs = side === 'out' ? outLegs : backLegs;
    const points = pointsFor(side);
    const view = journeyViewOf(legs);
    const zoneAt = (i: number) =>
      i === 0
        ? side === 'out'
          ? startZone
          : endZone
        : i === legCountFor(side)
          ? side === 'out'
            ? endZone
            : startZone
          : zoneOf(points[i], null);
    /** Which node a moment belongs to, in the rail's order: node 0 departs, then each later
     *  node arrives and (if interior) departs. */
    const nodeOfMoment = (m: number) => (m === 0 ? 0 : Math.floor((m + 1) / 2));
    const moments = view.moments.map((moment, m) => ({
      time: moment.time,
      timeZone: zoneAt(nodeOfMoment(m)),
      dayOffset: moment.time ? moment.dayOffset : undefined,
    }));
    const resolved = resolveJourneyDays(view.date, moments);
    const labels = spanLabels(type);
    const nodes: JourneyNode[] = points.map((pointId, i) => ({
      placeName: placeName(places, pointId),
      arriveLabel: labels.end,
      departLabel: labels.start,
      timeZone: zoneAt(i),
      zone:
        i === 0
          ? zoneChip(
              side === 'out' ? (fromPlaceId ?? placeId) : toPlaceId,
              zoneAt(0),
              side === 'out' ? startOverride : endOverride,
              side === 'out' ? setStartOverride : setEndOverride,
            )
          : i === legCountFor(side)
            ? zoneChip(
                side === 'out' ? toPlaceId : (fromPlaceId ?? placeId),
                zoneAt(legCountFor(side)),
                side === 'out' ? endOverride : startOverride,
                side === 'out' ? setEndOverride : setStartOverride,
              )
            : undefined,
      arrive: i > 0 ? { time: view.moments[2 * i - 1]?.time ?? '' } : undefined,
      depart:
        i < legCountFor(side) ? { time: view.moments[i === 0 ? 0 : 2 * i]?.time ?? '' } : undefined,
      marks: {
        /** **The journey's date wears the first departure's refusal**, because that field IS
         *  the journey's date: `legField(side, 0, 'start')` holds the day every later moment
         *  is derived from. It is also the box the two controls that fix it live in — the
         *  date and the first clock share one `Field` in the rail — so a `returnBeforeArrival`
         *  lands on exactly what you would edit (ADR-0150). Reading `errors.field('date')`
         *  here marked nothing at all: `allProblems` guards that name behind `!isSpan`. */
        date: i === 0 ? errors.field(legField(side, 0, 'start')) : undefined,
        arrive: i > 0 ? errors.field(legField(side, i - 1, 'end')) : undefined,
        // Node 0's departure is inside the date's box above, so a second mark for the same
        // field would render the same message twice.
        depart:
          i > 0 && i < legCountFor(side) ? errors.field(legField(side, i, 'start')) : undefined,
      },
    }));
    /** **Which node is open when nobody has picked one** (ADR-0203 §9, threshold corrected
     *  2026-08-24). The first whose moments are not all filled, so filling the rail walks it
     *  and the nodes behind you summarise as you go; the LAST once the journey is complete, so
     *  a finished rail is reviewed at one screen rather than at the 708px §7 measured.
     *
     *  **`null` — nothing summarises — up to and including ONE stop, because up to one stop
     *  there is nothing to buy.** §9's own fold table says a journey with 0–1 stops is inside
     *  the fold on both a 390×844 and a 360×640 phone; the cases it was written for are two
     *  stops (718.5px all-open against a 675px fold) and three (894px). The threshold shipped
     *  at `<= 2` nodes, which is ZERO stops — so a one-stop journey compacted to fix an
     *  overflow it never had, and reported back as exactly that: "the lines collapsing under
     *  your fingers could be a little confusing… maybe do it only when the form is very long."
     *
     *  Confirmed on a device rather than only against that table, which matters because the
     *  rail grew since it was measured (per-moment captions, the 44px time rows): the owner's
     *  own screenshot of a one-stop train journey shows the whole step — dots, type row, rail,
     *  zone note, commitment toggle and footer — with no scrolling.
     *
     *  So the number is `<= 3`: nothing summarises at one stop or fewer. Above it the height
     *  is real and compaction is the cheaper of the two costs. */
    const filled = (node: JourneyNode, i: number) =>
      (i > 0 || !!view.date) &&
      (!node.arrive || !!node.arrive.time) &&
      (!node.depart || !!node.depart.time);
    const unfilled = nodes.findIndex((node, i) => !filled(node, i));
    /** **The threshold gates the explicit pick too, and that ordering is the fix for a hole
     *  found re-reading this change.** `openNode[side]` used to short-circuit it: tap a
     *  summarised row at two stops, go back to `מה ואיפה`, remove a stop, and the pick came
     *  back with you — so a one-stop journey compacted again, and a pick left pointing past
     *  the shortened rail (index 3 of 3 nodes) matched no node at all and collapsed EVERY
     *  summarisable one. Below the threshold the answer is `null` whatever was tapped, because
     *  the threshold is a fact about the form's height and not about the last tap. */
    const openIndex =
      nodes.length <= SUMMARISE_FROM_NODES
        ? null
        : (openNode[side] ?? (unfilled === -1 ? nodes.length - 1 : unfilled));
    return { legs, view, resolved, nodes, openIndex };
  };

  /** **The legs the TRIP already holds**, for §8's place suggestion and §5's date one. Read
   *  off the snapshot rather than this form, so a return authored weeks after its outbound
   *  still finds it (ADR-0203 §8). */
  const knownLegs: KnownLeg[] = useMemo(
    () =>
      bookings
        .filter(
          (b: Booking) => b.id !== booking?.id && carriesRoute(b.type) && titlesFromRoute(b.type),
        )
        .map((b: Booking) => ({
          from: places.find((p) => p.id === b.fromPlaceId),
          to: places.find((p) => p.id === b.toPlaceId),
        })),
    [bookings, booking?.id, places],
  );
  // A booked event's category is its booking type's — canonical (ADR-0038), not
  // the picked glyph. The IconPicker only sets the badge icon; a ⭐ on a hotel
  // stays lodging, so nights/check-in-out/ambient behaviour all follow the type.
  const category = BOOKING_TYPE_TO_CATEGORY[type];

  // **The opt-in window bounds** (ADR-0184). Bare clocks; the day each lands on is its
  // edge's own and is resolved at save by `windowBoundIso`.
  const [startWindow, setStartWindow] = useState(draft ? draft.startWindow : initial.startWindow);
  const [endWindow, setEndWindow] = useState(draft ? draft.endWindow : initial.endWindow);

  /** **Which ends may carry a window: the flexible ones, asked of the profile.**
   *  `edgeMeaning` on the shape being edited — no `BookingType` branch, so a hotel and a
   *  car hire both offer it because both are `held`, and a flight never does because its
   *  ends are instants. A booking with no span has no edge to widen at all. */
  const windowOffer = (edge: 'start' | 'end') =>
    isSpan && edgeMeaning({ category, icon: icon.value }, edge) !== 'exact';

  // Diffed against the SAME blob the fields were seeded from, so "what did this open with"
  // has exactly one answer. `iconTouched`/`kindTouched` are not state the user typed, so
  // they are not part of dirtiness.
  const dirty =
    type !== initial.type ||
    startWindow !== initial.startWindow ||
    endWindow !== initial.endWindow ||
    icon.value !== initial.icon ||
    title.value !== initial.title ||
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
    (returnStops ?? []).join() !== (initial.returnStopPlaceIds ?? []).join() ||
    startOverride !== initial.startOverride ||
    endOverride !== initial.endOverride ||
    kind.value !== initial.kind;
  const { guardedClose, prompting, confirmDiscard, cancelDiscard } = useUnsavedGuard(dirty);
  const requestClose = () => guardedClose(onClose);

  const applyType = (next: BookingType) => {
    setType(next);
    // The chooser is answered, so it collapses — and only here, on the change itself, which is
    // what leaves the grid up after a REFUSED confirm for the next choice to be made from.
    setTypeOpen(false);
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

  /** **What the form is holding that this switch would delete** — read off the live form and
   *  not off the saved booking, because the form is what the person is looking at: an end
   *  they already cleared cannot be lost. */
  const switchState = (): BookingSwitchState => ({
    hasRoute: Boolean(fromPlaceId || toPlaceId),
    hasPlace: Boolean(placeId),
    hasEnd: Boolean(legs[0]?.end || end),
    hasStayDetails: Boolean(room.trim() || wifiNetwork.trim() || wifiPassword.trim()),
  });

  /** **A lossy switch asks, AT THE TAP** (owner, 2026-08-12: _"does it make sense to first
   *  remove the fields from the form, then after the user went through the whole form and
   *  decided to save, only then you'll warn?"_).
   *
   *  The tap is the destructive action, not the save: it is what takes the route field, the
   *  span's end and the stay block OFF the form, so it is the last moment the thing being
   *  warned about is on screen. Confirming at the save would ask about boxes that are already
   *  gone — and would leave `ביטול` with nothing clean to return to, which is the tell that a
   *  confirm is sitting at the wrong moment.
   *
   *  A switch that strands nothing is silent and instant, so browsing the grid on create — a
   *  near-empty form, where almost nothing can be lost — never sees this at all. And because
   *  the form commits once (ADR-0155), confirming is still cheap: tapping the original type
   *  back restores everything from form state. */
  const pickType = (next: BookingType) => {
    if (switchIsLossy(type, next, switchState())) return setPendingType(next);
    applyType(next);
  };
  const pickKind = (k: 'hard' | 'soft') => kind.set(k);

  /** **The place fills the name until a person types one** (field report #30). The only
   *  in-form path is the clear (a pick is a Map errand, applied at mount): an untouched
   *  title was never anything but the place's echo, so it goes back to empty and the
   *  placeholder — and `finalTitle` — fall through to the type label, exactly as they did
   *  before a place was ever linked. */
  const pickPlace = (next?: string) => {
    setPlaceId(next);
    title.redrive(placeDerivedTitle(places, next) ?? '');
  };

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
  const placeTitle = () => placeDerivedTitle(places, placeId);
  // Unchanged by field reports #30/#37, and that is the point: this chain is now the SHARED
  // `effectiveTitle` (`EventForm` adopted this precedence rather than inventing a third one),
  // and it resolves every branch exactly as the hand-written `||` did — a typed name whenever
  // there is one, a place's name when one is linked, the type label when nothing is, and the
  // fallback again the moment the box is emptied.
  const finalTitle = titlesFromRoute(type)
    ? routeTitle(placeName(places, fromPlaceId) ?? '', placeName(places, toPlaceId) ?? '')
    : isHire
      ? hireTitle()
      : effectiveTitle(title.value, placeTitle(), typeLabel);

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
      // The way back's own stops answer the same rule, in their own words so the message
      // says which journey is short a place (ADR-0203 §6).
      if (twoLegs && returnStops?.some((id) => !id)) {
        problems.push({ field: 'route', message: t.index.form.returnStopRequired });
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
      /** **A journey reports out-of-range ONCE, at the earliest moment that is out** (ADR-0203
       *  §2). Its days all descend from one date, so a date past the trip's end puts every
       *  later moment out with it, and marking four fields for one wrong fact is the refusal
       *  naming things that are not wrong (ADR-0150). The earliest one is also the only one
       *  you can act on. A per-leg form keeps every mark, because there each date is its own
       *  answer and any of them can be the wrong one on its own. */
      let rangeReported = false;
      const outsideTrip = (field: BookingField) => {
        if (isJourney && rangeReported) return;
        rangeReported = true;
        problems.push({ field, message: t.index.form.dateOutOfRange });
      };
      list.forEach((leg, i) => {
        const zones = legZones(side, i);
        if (outOfRange(leg.start)) outsideTrip(legField(side, i, 'start'));
        if (outOfRange(leg.end)) outsideTrip(legField(side, i, 'end'));
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
              : t.index.form.legBeforeArrival(placeName(places, pointsFor(side)[i])),
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
  /** **A JOURNEY is one step; anything else keeps a step per leg** (ADR-0203 §7, reversing
   *  ADR-0159 §5). That reversal is not a preference: §5 chose per-leg out of the 492px a
   *  span schedule cost, and a rail leg is two lines. What it buys is that the layover's wait
   *  is stated while you type it — two steps can never show that, because the legs are never
   *  on screen together — and that a hard commitment can be reviewed whole before it is
   *  signed, which ADR-0155 §1 lists as chunking's unmitigated third cost.
   *
   *  Keyed `out-0`/`back-0` rather than a new id shape, so `StepId`, `FIRST_LEG_STEP` and
   *  every refusal name below keep working: a journey collapses the INDEX, not the scheme. */
  const legSteps: StepId[] = isJourney
    ? (['out-0' as StepId, ...(twoLegs ? ['back-0' as StepId] : [])] as StepId[])
    : [
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
    // A journey has one step per SIDE, so every leg's refusal lands on it — which is what
    // turns the cross-leg dependency into an in-step one (ADR-0150, ADR-0203 §7).
    return `${side as LegSide}-${isJourney ? 0 : index}` as StepId;
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
          const points = pointsFor(side);
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
          const lastOfJourney = index === legCountFor(side) - 1;
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
            event: seed ? { ...seed, id: generateId() } : undefined,
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
                    startWindow,
                    endWindow,
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
              event: seed ? { ...seed, id: seed.id ?? generateId() } : undefined,
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
                  startWindow,
                  endWindow,
                },
                startZone,
                endZone,
              )
            : buildEventSeed(
                { date, start, end, kind: kind.value, icon: icon.value, category },
                startZone,
              );
          const event = seed
            ? { ...seed, id: seed.id ?? linkedEvent?.id ?? generateId() }
            : undefined;
          await indexVerbs.updateBooking(booking.id, {
            // **The type, and it was the bug.** This payload never carried it — for the honest
            // reason that the type was not editable, so there was nothing to send — and the
            // omission survived making it editable: every other edited field saved and the
            // type silently did not, which reads exactly as "the category did not change",
            // since a booking's category IS its type (ADR-0038). The create paths always
            // spread it (`legBooking`, `createBooking`); only the update had no reason to.
            type,
            title: finalTitle,
            ...base,
            event,
            ...startPatch,
            ...endPatch,
            // **The shape the NEW type has, and an explicit clear of the other one.** `null`
            // rather than an absent key, because absent means untouched: `JSON.stringify`
            // drops `undefined`, so the server would merge the previous shape's places under
            // the new type and `assertPlaceShape` would reject the pair with a 400 — which is
            // what made a type change across this axis impossible before
            // `updateBookingSchema` learned that null clears. It also fixes clearing a
            // place without changing type at all, which was a silent no-op for the same
            // reason.
            ...(isTransport
              ? { fromPlaceId: fromPlaceId ?? null, toPlaceId: hireReturnId ?? null, placeId: null }
              : { placeId: placeId ?? null, fromPlaceId: null, toPlaceId: null }),
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
          // **The document links, on the same host and in the same group** (ADR-0173 §5).
          // Everything the paragraph above says about ordering and about the outbound leg
          // owning the row applies to them unchanged — which is why they read `hostId` too
          // rather than resolving a host of their own.
          await writeStagedAttachments(attach, attachmentVerbs.attachDocument, {
            bookingId: hostId,
          });
          // **And the tasks** (ADR-0191 §7a), reading `hostId` for the same reason: the
          // outbound leg owns the row, and the ordering above is theirs too.
          await writeStagedTasks(taskStaging, taskVerbs.createTask, { bookingId: hostId });
        }
      });
      onClose();
    } catch {
      setSaving(false); // the verb already toasted + rolled back
    }
  };

  /** **The type chooser, written once** and rendered by whichever surface is showing it —
   *  the create form's own step, or the edit form's in-place disclosure. Two copies of an
   *  eight-card grid is how the two modes start disagreeing about what a type picker is. */
  const typeGrid = (
    <ChoiceGrid
      options={BOOKING_TYPE_OPTIONS}
      value={type}
      onChange={pickType}
      columns={3}
      ariaLabel={t.index.form.kindLabel}
    />
  );

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

  /** **The step's identity, for the panel's pinned header** (field report, 2026-08-23).
   *
   *  Unchanged in what it renders — a create jumps to the type STEP, an edit reveals the grid
   *  in place (ADR-0192's `ChoiceDisclosure`) — and moved out of the step body so it survives
   *  a scroll. On its own step there is nothing to pin: the grid IS the question.
   *
   *  An edit's disclosure can open inside the pinned box, and a sticky element taller than
   *  its scrollport simply stops sticking — so the tall case degrades to scrolling rather
   *  than pinning most of the sheet. Left as that: it collapses on the next tap. */
  const typeRow =
    steps.step === 'type' ? null : isCreate ? (
      <BookingTypeRow type={type} onChange={() => steps.goTo('type')} />
    ) : (
      <ChoiceDisclosure
        glyph={BOOKING_TYPE_ICON[type]}
        label={typeLabel}
        open={typeOpen}
        onToggle={() => setTypeOpen((v) => !v)}
        ariaLabel={t.index.form.stepType}
      >
        {typeGrid}
      </ChoiceDisclosure>
    );
  /** The labels name what each step ASKS. A one-way single leg keeps today's three words
   *  exactly; a journey that has more than one leg has to say WHICH leg, because with
   *  four schedules on four steps "מתי" alone leaves you counting. */
  /** **Either journey being a sequence makes this a multi-leg booking.** A return with its
   *  own stops can be a chain while the outbound is a single hop (§6), and the readers of this
   *  flag — the shared-code hint, the leg headings — are about the booking as a whole. */
  const multiLeg = legCount > 1 || legCountFor('back') > 1;
  const stepLabels = STEP_IDS.map((id) => {
    if (id === 'type') return t.index.form.stepType;
    if (id === 'what') return t.index.form.stepWhat;
    if (id === 'more') return t.index.form.stepDetails;
    const [side, index] = id.split('-');
    const n = Number(index) + 1;
    // **A journey's step names the JOURNEY, never a leg** (ADR-0203 §7): its legs are all on
    // this one step, so "קטע 2" would be counting something that is not a step any more.
    const countsLegs = multiLeg && !isJourney;
    if (side === 'out') {
      if (countsLegs) return t.index.form.stepLeg(n);
      return twoLegs ? t.index.form.stepWhenOut : t.index.form.stepWhen;
    }
    return countsLegs ? t.index.form.stepBackLeg(n) : t.index.form.legBack;
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
    const points = pointsFor(side);
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

  // **A form coming back from a place errand does not re-ask its type** (field report #2's
  // consequence, ADR-0134 §2's channel). A create form now OPENS on the type step, and the
  // errand returns by re-mounting the sheet — so without this you would come back from
  // picking a place one step behind the field you left, and have to answer a question you
  // already answered. The draft is what says "this is a return, not an opening".
  useEffect(() => {
    if (!draft || !isCreate || focus || errandDone.current) return;
    errandDone.current = true;
    steps.goTo('what');
  }, [draft, isCreate, focus, steps]);

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
          <FormStepPanel
            steps={steps}
            labels={stepLabels}
            /* **Pinned, because the rail scrolls further than a screen** (field report,
               2026-08-23). The type row is the step's identity and it left with the content:
               once it and the read-out were gone there was nothing on screen saying which
               step this was. It goes in the primitive's header slot rather than growing a
               sticky rule of its own — see `FormStepPanel.header` for why it has to be one
               box and not two sticky siblings. */
            header={typeRow}
          >
            {/* **The picked type, on every step but its own** (field report #2). Collapsed to
                the one card that was chosen, with the way back to the grid on the row itself —
                so the eight-option grid is paid for once, at the moment it is being answered,
                and the answer stays legible everywhere after that.

                **And on an edit it is a CONTROL now**, which is the whole of this change. The
                grid reached only create, so the only way to fix a stay filed as `אחר` was to
                delete it and start again — losing its code, its documents, its notes and its
                linked event. Nothing decided that: session 221 recorded it as a premise, and
                one `isCreate` here withheld a row that already had an `onChange`.

                On create the row still jumps to the type STEP, which shapes every step after
                it and earns one. On an edit there is no step to jump to (a step is paid on
                every pass through the form, and this is a rare edit — owner, 2026-08-12), so
                the grid reveals in place through `ChoiceDisclosure`: 0px until it is asked
                for. Note that the row being a `<button>` is what makes the revealed grid
                scroll itself into view — the body's own `onFocusCapture` above catches a
                focusable row where the old `<div>` was invisible to it. */}
            {steps.step === 'type' && typeGrid}

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
                        value={title.value}
                        onChange={(e) => title.set(e.target.value)}
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

                {/* The way BACK to the derived glyph, and nothing else. The caption that
                    used to lead it narrated the derivation and repeated the type — which
                    `BookingTypeRow` already states on this very step — and it said
                    "נבחר לפי סוג ההזמנה" even once a person had overridden it, i.e. exactly
                    when it was no longer true. */}
                {icon.touched && (
                  <div className="bs-caption">
                    <button
                      type="button"
                      className="bs-revert"
                      onClick={() => icon.reset(BOOKING_TYPE_ICON[type])}
                    >
                      <Icon name="reset" /> {t.index.form.reset}
                    </button>
                  </div>
                )}

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
                      /* **The way back's own route, offered only where there IS one**
                         (ADR-0203 §6) — a round trip, on a type that can hold a sequence, on
                         a create. Same terms as the stops above and the direction control,
                         and for the same reason: turning a saved leg into a journey is a
                         different action. `undefined` here is "this host authors no return",
                         which is what `EventForm` and a one-way both are. */
                      returnStops={offersStops && twoLegs ? returnStops : undefined}
                      onReturnStopsChange={
                        offersStops && twoLegs
                          ? (next) => {
                              // A LIST edit, taken as given — including an empty one, which is
                              // "the way home is direct". Remembered so leaving and coming
                              // back is free.
                              setReturnStops(next);
                              if (next !== null) setReturnStopsDraft(next);
                              // `null` (back to a mirror) deliberately leaves the draft alone
                              // — that is the whole point of keeping two fields.
                            }
                          : undefined
                      }
                      /* **The list and the flag are separate, and this is where that pays.**
                         Going back to `אותה דרך` keeps what was typed, and `דרך אחרת` RESTORES
                         it rather than re-seeding — so a change of mind inside one form costs
                         nothing and no confirm dialog has to ask. The outbound reversed is the
                         seed only the first time, when nothing is remembered yet.

                         A callback of its own, because the first attempt folded this into the
                         list write and could not tell "give me my own route" from "I cleared
                         the last stop" — so emptying the list restored the very stop that had
                         just been removed. Two intents, two callbacks. */
                      onReturnDiverge={
                        offersStops && twoLegs
                          ? () => setReturnStops(returnStopsDraft ?? [...stopPlaceIds].reverse())
                          : undefined
                      }
                      onFindReturnStop={(index, side) => findReturnStop(index, side)}
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
                      onChange={pickPlace}
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
                {isJourney ? (
                  (() => {
                    /* **THE JOURNEY, AS ONE OBJECT WITH PARTS** (ADR-0203 §1/§3). The two
                       identical date+time blocks are gone: this side of the journey carries
                       ONE calendar date and every later moment is a clock plus a derived
                       relative day, so a return flight would need a second date and there is
                       exactly one on screen. That is what makes the reported misread
                       impossible rather than merely less likely. */
                    const side = legStep.side;
                    const { legs, view, resolved, nodes, openIndex } = journeyOf(side);
                    const write = (next: LegTimes[]) => setSideLegs(side, next);
                    /** **Each side reads its OWN endpoints.** `routePoints` is the outbound's,
                     *  so passing it on both sides told `tripEdgeFor` that the return also
                     *  flies TOWARDS the destination — and it offered the trip's first day for
                     *  the flight home. `reversed` is the same array the refusals already walk
                     *  with (`side === 'out' ? routePoints : reversed`); this was the one call
                     *  site still reading past it. */
                    const sidePoints = pointsFor(side);
                    const dateSug =
                      !view.date && isCreate
                        ? suggest(DATE_SOURCES, {
                            from: places.find((p) => p.id === sidePoints[0]),
                            to: places.find((p) => p.id === sidePoints[legCountFor(side)]),
                            destination: destinationRefOf(trip),
                            trip: { startDate: trip.startDate, endDate: trip.endDate },
                            legs: knownLegs,
                            words: t.journey.suggest,
                          })
                        : null;
                    return (
                      <>
                        <JourneyField
                          nodes={nodes}
                          date={view.date}
                          onDateChange={(d) => write(withJourneyDate(legs, d))}
                          minDate={trip.startDate}
                          maxDate={trip.endDate}
                          resolved={resolved}
                          /* **The day a candidate clock would land on**, so the time list can
                             show where the day turns while you choose (§10). The same probe
                             the writer below builds, asked without writing: one moment's clock
                             replaced, the whole journey re-resolved on INSTANTS, and the
                             answer read off that moment. Which is why the divider is correct
                             across a westward crossing, where local midnight is not the
                             turn. */
                          dayOffsetOf={(m, hhmm) =>
                            resolveJourneyDays(
                              view.date,
                              view.moments.map((moment, i) => ({
                                time: i === m ? hhmm : moment.time,
                                timeZone: nodes[i === 0 ? 0 : Math.floor((i + 1) / 2)].timeZone,
                                dayOffset: i === m ? undefined : moment.dayOffset,
                              })),
                            )[m]?.dayOffset ?? 0
                          }
                          onTimeChange={(node, which, time) => {
                            /* The offset is DERIVED for the clock just typed — the moment
                               loses its explicit day so §2's forward resolution decides it,
                               and the adapter writes only the day it is handed. */
                            const at =
                              node === 0 ? 0 : which === 'arrive' ? 2 * node - 1 : 2 * node;
                            const probe = view.moments.map((m, i) => ({
                              time: i === at ? time : m.time,
                              timeZone: nodes[i === 0 ? 0 : Math.floor((i + 1) / 2)].timeZone,
                              dayOffset: i === at ? undefined : m.time ? m.dayOffset : undefined,
                            }));
                            const offset = resolveJourneyDays(view.date, probe)[at].dayOffset;
                            write(withMomentTime(legs, node, which, time, offset));
                          }}
                          onDayOffsetChange={(node, which, offset) =>
                            write(withMomentDayOffset(legs, node, which, offset))
                          }
                          openNodeIndex={openIndex}
                          onOpenNode={(i) => setOpenNode((o) => ({ ...o, [side]: i }))}
                          heading={
                            twoLegs
                              ? side === 'out'
                                ? t.index.form.legOut
                                : t.index.form.legBack
                              : undefined
                          }
                          connection={
                            connectionWindow(type)
                              ? {
                                  word: t.day.join.word[type] ?? t.index.form.addStop,
                                  tightMinutes: connectionWindow(type)!.tightMinutes,
                                }
                              : undefined
                          }
                          alwaysShowDay
                          dateSuggestion={
                            dateSug
                              ? {
                                  label: dateSug.label,
                                  detail: dateSug.detail,
                                  mono: dateSug.mono,
                                  onAccept: () => write(withJourneyDate(legs, dateSug.value)),
                                }
                              : undefined
                          }
                        />
                        <ZoneNote
                          startZone={legStep.zones.start}
                          endZone={legStep.zones.end}
                          tripZone={trip.timezone}
                          refMs={zoneRefMs}
                        />
                        {/* The commitment is the JOURNEY's, so it is asked once, on the side
                            that starts it. */}
                        {side === 'out' && view.date && (
                          <KindToggle kind={kind.value} onPick={pickKind} />
                        )}
                      </>
                    );
                  })()
                ) : isSpan ? (
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
                      // Only a held edge has an open side to close, and only the one
                      // leg an edit has — a journey's stops are exact at both ends.
                      windows={{
                        start: windowOffer('start')
                          ? { value: startWindow, onChange: setStartWindow }
                          : undefined,
                        end: windowOffer('end')
                          ? { value: endWindow, onChange: setEndWindow }
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
                {/* **A document is attached on the way** (ADR-0173 §5), ABOVE the notes
                    (ADR-0174 §5, owner's ask — and the same order every read surface uses,
                    so the app does not teach one sequence for authoring and another for
                    reading). The host is this BOOKING — the anchor of its context, so a chip
                    added here shows on the linked event as well — and on a create there is
                    no id yet, so the picks are staged and ride the save. */}
                <DocumentAttachField
                  state={attach}
                  host={booking ? { kind: 'booking', id: booking.id } : undefined}
                />

                {/* **On a CREATE too** (owner: _"why not on creation?"_) — staged until the
                    booking has an id, exactly as the notes composer and the document picker
                    on this form already are. `quiet`, because a form is not the main add
                    point. */}
                <HostTasks
                  host={
                    booking
                      ? { kind: 'booking', id: booking.id, name: booking.title }
                      : { kind: 'booking', name: title.value }
                  }
                  staging={taskStaging}
                  quiet
                />
                {/* **ONE section, whose last row is the composer** (ADR-0192 §2) — the same
                    collapse `EventForm` takes, and for the same reason: this was a section
                    plus a `Field`, so an edit headed `פתקים` twice. */}
                <HostNotes
                  host={{ kind: 'booking', id: booking?.id, name: booking?.title ?? title.value }}
                  onAdd={composer.openNew}
                  composeActive={composerActive}
                  composeHint={t.notes.composer.hint}
                  compose={<NoteComposer state={composer} id="bs-notes" />}
                />
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
            // An EDIT can be finished from any step (owner, 2026-08-12) — the save re-validates
            // every step and lands on the first refusal, so it cannot commit an unanswered one.
            // A CREATE cannot: its steps are questions the type shaped, and offering to finish
            // before they are asked is offering a save the form will refuse.
            saveAnywhere={!isCreate}
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

      {/* **A lossy type switch, confirmed at the tap.** Three words and no list: the itemised
          version was drawn and cut (owner, 2026-08-12 — _"really short and no need to list
          everything that will be deleted"_), which is also why `switchIsLossy` answers a
          boolean rather than a list nobody would print. A second call of the one confirm
          primitive, not a second prompt (ADR-0079). */}
      {pendingType && (
        <ConfirmDialog
          tone="danger"
          icon={<Icon name="warn" />}
          title={t.index.form.switchTitle(t.index.bookingType[pendingType])}
          body={t.index.form.switchBody}
          confirmLabel={t.index.form.switchConfirm}
          onConfirm={() => {
            applyType(pendingType);
            setPendingType(null);
          }}
          onCancel={() => setPendingType(null)}
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
          <Icon name="reset" /> {t.common.change}
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
  /** The booking's own notes. On an UNLINKED booking they are the whole context and this
   *  delete destroys them (ADR-0152 §2) — and unlike an event's, they do not come back: a
   *  booking delete has no undo. */
  notes: number;
  /** The linked event's own. Added to `notes` on the `both` choice, which is the only branch
   *  that takes either: since ADR-0172 §5, `unlink` MOVES the booking's notes onto the
   *  surviving event rather than letting the cascade have them, so the line that used to sit
   *  above both choices is now simply false in one of them and is gone. */
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
            {/* The whole CONTEXT's notes, not the event's alone (ADR-0172 §6): since the
                booking is the anchor, a note written on the event card — or through a place
                this booking uniquely references — is on the booking, and only this branch
                takes it. */}
            {notes + linkedNotes > 0 &&
              ` ${DOT_SEPARATOR} ${t.notes.hostDelete(notes + linkedNotes)}`}
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
