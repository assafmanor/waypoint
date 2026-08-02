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
  BOOKING_TYPE,
  BOOKING_TYPE_TO_CATEGORY,
  EVENT_KIND,
  carriesRoute,
  defaultKindForBookingType,
  hasSpanSchedule,
  type Booking,
  type BookingType,
} from '@waypoint/shared';
import { bookingSheetDraft, type BookingSeed, type BookingSheetDraft } from '../lib/booking-draft';
import { useRoundTripPartner, type PartnerLeg } from '../lib/booking-pair';
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
import { FormStepActions, FormStepPanel, useFormSteps } from './primitives/FormSteps';
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

/** What this sheet can refuse, one name per BOX on screen (ADR-0150) — which is why
 *  a span's two legs are two names and the day variant's date is a third. */
type BookingField =
  | 'title'
  | 'route'
  | 'date'
  | 'spanStart'
  | 'spanEnd'
  // The return's own two legs (ADR-0154 §4). A span refuses per leg for the same reason
  // it carries a zone per leg, and a round trip has four of them.
  | 'returnStart'
  | 'returnEnd';

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
  // Span scheduling (transport departure/arrival, hotel check-in/check-out): two
  // explicit datetimes that may fall on different days.
  const [spanStart, setSpanStart] = useState(draft ? draft.spanStart : initial.spanStart);
  const [spanEnd, setSpanEnd] = useState(draft ? draft.spanEnd : initial.spanEnd);
  // The round trip (ADR-0154 §4): one save, two bookings. Create-only, default OFF —
  // the control row costs 44px on every transport booking and the second leg a further
  // 492px, which only an explicit tap should buy (measured, `booking-round-trip-v1.html`).
  const [roundTrip, setRoundTrip] = useState(draft ? draft.roundTrip : initial.roundTrip);
  const [returnStart, setReturnStart] = useState(draft ? draft.returnStart : initial.returnStart);
  const [returnEnd, setReturnEnd] = useState(draft ? draft.returnEnd : initial.returnEnd);
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
  const pair = useRoundTripPartner(booking);

  // ONE ERRAND BUILDER FOR THE THREE PLACE FIELDS (ADR-0134 §1/§2). Each call names its own
  // field, and the label says which end of the journey it is — a banner reading only
  // "רכבת לקיוטו" would leave you guessing which side you were choosing. `startErrand` is
  // null only where there is no Map tab to route to, which no host of this sheet is.
  const findPlace = (field: PlaceErrandField, side?: string) => () =>
    startErrand?.({
      target: { kind: 'booking', id: booking?.id, field },
      label: [title.trim() || t.map.errand.untitledBooking, side]
        .filter(Boolean)
        .join(` ${DOT_SEPARATOR} `),
      draft: {
        type,
        iconTouched: icon.touched,
        icon: icon.value,
        title,
        code,
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
        spanStart,
        spanEnd,
        roundTrip,
        returnStart,
        returnEnd,
        kind: kind.value,
        kindTouched: kind.touched,
      } satisfies BookingSheetDraft,
    });

  const suggestedZones = useMemo(
    () =>
      [...new Set([trip.timezone, ...places.map((p) => p.timezone).filter(Boolean)])] as string[],
    [trip.timezone, places],
  );

  const isTransport = carriesRoute(type);
  const isHotel = type === BOOKING_TYPE.HOTEL;
  const isSpan = hasSpanSchedule(type);
  // Offered only where there is a route to mirror, and only on a create: editing a leg
  // opens ADR-0047 §2's merged surface unchanged, and turning a saved single leg into a
  // pair is a different action (§4, out of scope).
  const offersRoundTrip = isCreate && authorsRoundTrip(type);
  const twoLegs = offersRoundTrip && roundTrip;
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
  const endZone = isTransport ? zoneOf(toPlaceId, endOverride) : zoneOf(placeId, startOverride);
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
    spanStart !== initial.spanStart ||
    spanEnd !== initial.spanEnd ||
    roundTrip !== initial.roundTrip ||
    returnStart !== initial.returnStart ||
    returnEnd !== initial.returnEnd ||
    startOverride !== initial.startOverride ||
    endOverride !== initial.endOverride ||
    kind.value !== initial.kind;
  const { guardedClose, prompting, confirmDiscard, cancelDiscard } = useUnsavedGuard(dirty);
  const requestClose = () => guardedClose(onClose);

  const changeType = (next: BookingType) => {
    setType(next);
    icon.redrive(BOOKING_TYPE_ICON[next]);
    kind.redrive(defaultKindForBookingType(next));
  };
  const pickKind = (k: 'hard' | 'soft') => kind.set(k);

  // Transport is identified by its route, not a name (ADR-0059 §3): the stored title is
  // derived from origin→destination (it backs the linked event's title and any place-less
  // fallback), so a flight never carries a hand-typed name.
  const finalTitle = isTransport
    ? routeTitle(placeName(places, fromPlaceId) ?? '', placeName(places, toPlaceId) ?? '')
    : title.trim();

  /** **Every refusal this form can make, in one place** — and it stays one place now that
   *  the form is stepped (ADR-0155 §3). A step gate and the save both read THIS and filter
   *  by the fields their step owns, so a rule cannot hold on one path and not the other,
   *  and the save re-validating everything is the same code rather than a second copy. */
  const allProblems = (): FieldProblem<BookingField>[] => {
    const problems: FieldProblem<BookingField>[] = [];
    if (isTransport) {
      if (!finalTitle) problems.push({ field: 'route', message: t.index.form.routeRequired });
    } else if (!finalTitle) {
      problems.push({ field: 'title', message: t.index.form.titleRequired });
    }
    const outOfRange = (v: string) => dateOutOfTripRange(v, trip.startDate, trip.endDate);
    if (!isSpan && outOfRange(date)) {
      problems.push({ field: 'date', message: t.index.form.dateOutOfRange });
    }
    if (isSpan) {
      if (outOfRange(spanStart))
        problems.push({ field: 'spanStart', message: t.index.form.dateOutOfRange });
      if (outOfRange(spanEnd))
        problems.push({ field: 'spanEnd', message: t.index.form.dateOutOfRange });
      // A span's end must be after its start. WhenField bounds the end's earliest
      // day to the start day; this also rejects a same-day end at/before the start
      // time (a time-less end stays open-ended, so only guard when both have one).
      const [sDay, sTime] = spanStart.split('T');
      const [eDay, eTime] = spanEnd.split('T');
      if (sTime && eTime) {
        const s = Date.parse(zonedIso(sDay, sTime, startZone));
        const e = Date.parse(zonedIso(eDay, eTime, endZone));
        if (e <= s) problems.push({ field: 'spanEnd', message: t.index.form.endBeforeStart });
      }
    }
    // The return leg (ADR-0154 §4). Same two checks as the outbound, on its own two names
    // — plus the one rule a round trip adds, which is the only CROSS-leg constraint in the
    // form: you cannot leave before you have arrived. Marked on the return's DEPARTURE,
    // the field that is actually wrong, not on the three around it that are fine.
    if (twoLegs) {
      if (outOfRange(returnStart))
        problems.push({ field: 'returnStart', message: t.index.form.dateOutOfRange });
      if (outOfRange(returnEnd))
        problems.push({ field: 'returnEnd', message: t.index.form.dateOutOfRange });
      const [rsDay, rsTime] = returnStart.split('T');
      const [reDay, reTime] = returnEnd.split('T');
      // The return's own legs read in the SWAPPED zones — it flies the route backwards.
      if (rsTime && reTime) {
        const rs = Date.parse(zonedIso(rsDay, rsTime, endZone));
        const re = Date.parse(zonedIso(reDay, reTime, startZone));
        if (re <= rs) problems.push({ field: 'returnEnd', message: t.index.form.endBeforeStart });
      }
      const [oeDay, oeTime] = spanEnd.split('T');
      if (rsTime && oeTime) {
        const arrival = Date.parse(zonedIso(oeDay, oeTime, endZone));
        const departure = Date.parse(zonedIso(rsDay, rsTime, endZone));
        if (departure < arrival) {
          problems.push({ field: 'returnStart', message: t.index.form.returnBeforeArrival });
        }
      }
    }
    return problems;
  };

  /** The fields each step owns, so a gate reports only what is on screen and the save's
   *  jump lands on the step that can actually answer. Exhaustive over `BookingField` by
   *  construction: a new refusal has to say which step shows it, or this stops compiling. */
  const STEP_FIELDS = {
    what: ['title', 'route'],
    when: ['date', 'spanStart', 'spanEnd'],
    // The return's two legs live with the shared fields, which is also where the one
    // CROSS-step rule lands: `returnBeforeArrival` needs the outbound's arrival from the
    // previous step, and it is marked here because this is the field that is wrong.
    more: ['returnStart', 'returnEnd'],
  } as const satisfies Record<string, readonly BookingField[]>;
  type StepId = keyof typeof STEP_FIELDS;
  const problemsIn = (step: StepId) => {
    const owned = STEP_FIELDS[step] as readonly BookingField[];
    return allProblems().filter((p) => p.field != null && owned.includes(p.field));
  };

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
        const seed = isSpan
          ? buildSpanSeed(
              { startAt: spanStart, endAt: spanEnd, kind: kind.value, icon: icon.value, category },
              startZone,
              endZone,
            )
          : buildEventSeed(
              { date, start, end, kind: kind.value, icon: icon.value, category },
              startZone,
            );
        // Give the seed a stable event id (ADR-0093): the existing linked event's
        // on edit, a fresh one otherwise. The server upserts under it, so the
        // optimistic linked event the verb mirrors reconciles in place on flush.
        const event = seed
          ? { ...seed, id: seed.id ?? linkedEvent?.id ?? crypto.randomUUID() }
          : undefined;
        // Zone overrides (ADR-0107 §6): send a key only when the chip was actually
        // used, so an untouched form can't freeze today's derived zone; `null` is the
        // reset. A single-place booking has one zone (`start` drives both ends), so
        // its end resolves to null — which also clears an end pinned while the type
        // was still transport, the one way this form can leave a stale one behind.
        const zonePatch = {
          ...(startOverride !== initial.startOverride && { startDisplayTimezone: startOverride }),
          ...((isTransport ? endOverride : null) !== initial.endOverride && {
            endDisplayTimezone: isTransport ? endOverride : null,
          }),
        };
        const base = {
          title: finalTitle,
          // Send the trimmed value even when empty: an empty string is the explicit
          // "clear the code" intent (undefined would be dropped by JSON.stringify and
          // read as "leave unchanged"). The backend normalizes empty → null.
          confirmationCode: code.trim(),
          details,
          event,
        };
        // Transport carries fromPlaceId/toPlaceId; every other type a single
        // placeId — mutually exclusive (ADR-0048), so send only the relevant side.
        let hostId = booking?.id;
        if (isCreate) {
          const created = await indexVerbs.createBooking(
            isTransport
              ? { type, ...base, ...zonePatch, fromPlaceId, toPlaceId }
              : { type, ...base, ...zonePatch, placeId },
          );
          hostId = created?.id;

          // **THE SECOND BOOKING** (ADR-0154 §4). Inside the same change group, so one
          // user action stays one pending change (ADR-0092) rather than four.
          //
          // Everything non-schedule is shared by construction — it is the same `base`,
          // so the code, the icon and the kind cannot drift between the legs. What is
          // mirrored is the route and, with it, the zones: the return departs from the
          // destination and arrives at the origin, so its per-endpoint zones are the
          // outbound's swapped (ADR-0107). `routeTitle` derives its stored title, so
          // nobody types a name for either leg.
          if (twoLegs) {
            const returnSeed = buildSpanSeed(
              {
                startAt: returnStart,
                endAt: returnEnd,
                kind: kind.value,
                icon: icon.value,
                category,
              },
              endZone,
              startZone,
            );
            await indexVerbs.createBooking({
              type,
              ...base,
              title: routeTitle(
                placeName(places, toPlaceId) ?? '',
                placeName(places, fromPlaceId) ?? '',
              ),
              event: returnSeed ? { ...returnSeed, id: crypto.randomUUID() } : undefined,
              fromPlaceId: toPlaceId,
              toPlaceId: fromPlaceId,
              // The overrides swap with the ends they belong to, and only when the chip
              // was actually used — same rule as the outbound's `zonePatch`.
              ...(endOverride !== initial.endOverride && { startDisplayTimezone: endOverride }),
              ...(startOverride !== initial.startOverride && {
                endDisplayTimezone: startOverride,
              }),
            });
          }
        } else {
          await indexVerbs.updateBooking(booking.id, {
            ...base,
            ...zonePatch,
            ...(isTransport ? { fromPlaceId, toPlaceId } : { placeId }),
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
    steps: [
      { id: 'what', validate: () => problemsIn('what') },
      { id: 'when', validate: () => problemsIn('when') },
      { id: 'more', validate: () => problemsIn('more') },
    ],
    errors,
    onCommit: () => void commit(),
  });
  // The labels name what each step ASKS, and two of them change for a round trip: with two
  // journeys "מתי" alone leaves you checking which one you are answering.
  const stepLabels = twoLegs
    ? [t.index.form.stepWhat, t.index.form.stepWhenOut, t.index.form.stepBackAndShared]
    : [t.index.form.stepWhat, t.index.form.stepWhen, t.index.form.stepDetails];

  // `שבץ במסלול` opened this sheet FOR the schedule (ADR-0138 §7), which is a STEP now — so
  // the shortcut NAVIGATES to it and then takes focus, in that order and across two renders:
  // the step's first control does not exist until the step is on screen. (Same ordering the
  // primitive's own deferred refusal needs, and for the same reason.) The ref makes it a
  // one-shot, so stepping away afterwards is not undone.
  useEffect(() => {
    if (focus !== 'when' || shortcutDone.current) return;
    if (steps.step !== 'when') {
      steps.goTo('when');
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
            {steps.step === 'what' && (
              <>
                {isCreate && (
                  <ChoiceGrid
                    options={BOOKING_TYPE_OPTIONS}
                    value={type}
                    onChange={changeType}
                    columns={3}
                    ariaLabel={t.index.form.kindLabel}
                  />
                )}

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
                    {isTransport ? (
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
                        placeholder={t.index.sheet.titlePlaceholder}
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

                {/* The route field: two real place pickers (origin → destination), so
              transport endpoints carry coords + timezones like any other place. */}
                {isTransport && (
                  <Field label={t.index.form.routeLabel} {...errors.field('route')}>
                    {/* **The direction control** (ADR-0154 §4), in the ROUTE field rather than
                  beside the schedule: what it describes is the shape of the journey
                  between these two places, and putting it here makes the `⇄` in the
                  preview directly above the immediate feedback for the tap. Offered only
                  where there is a route to mirror, and only on a create. */}
                    {offersRoundTrip && (
                      <div className="bs-direction">
                        <ChoiceGrid
                          layout="pills"
                          options={[
                            // No glyph: a direction is a word, not a symbol, and `Choice`'s
                            // empty string is the documented way to omit the slot.
                            { value: 'one', icon: '', label: t.index.form.oneWay },
                            { value: 'two', icon: '', label: t.index.form.roundTrip },
                          ]}
                          value={roundTrip ? 'two' : 'one'}
                          onChange={(v) => setRoundTrip(v === 'two')}
                          ariaLabel={t.index.form.directionLabel}
                        />
                      </div>
                    )}
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
            {steps.step === 'when' && (
              <div ref={whenRef}>
                {isSpan ? (
                  <>
                    {/* **Leg headings arrive in PAIRS or not at all** (ADR-0154 §4). With one
                    journey the span needs no name and today's form is unchanged; the
                    moment there are two, an unlabelled block above a labelled one reads
                    as a defect. Each states its own direction, because "חזרה" alone
                    still leaves you checking which end is which. */}
                    {twoLegs && (
                      <div className="bs-leg-head">
                        <span>{t.index.form.legOut}</span>
                        <RouteLabel
                          from={placeName(places, fromPlaceId)}
                          to={placeName(places, toPlaceId)}
                        />
                      </div>
                    )}
                    <WhenField
                      variant="span"
                      start={spanStart}
                      end={spanEnd}
                      onChange={({ start: s, end: e }) => {
                        setSpanStart(s);
                        setSpanEnd(e);
                      }}
                      minDate={trip.startDate}
                      maxDate={trip.endDate}
                      labels={spanLabels(type)}
                      defaultDate={trip.startDate}
                      timeZone={startZone}
                      endTimeZone={endZone}
                      durationUnit={bookingDurationUnit(type)}
                      zones={{
                        start: zoneChip(
                          fromPlaceId ?? placeId,
                          startZone,
                          startOverride,
                          setStartOverride,
                        ),
                        end: zoneChip(
                          isTransport ? toPlaceId : placeId,
                          endZone,
                          endOverride,
                          setEndOverride,
                        ),
                      }}
                      marks={{ start: errors.field('spanStart'), end: errors.field('spanEnd') }}
                    />
                    <ZoneNote
                      startZone={startZone}
                      endZone={endZone}
                      tripZone={trip.timezone}
                      refMs={zoneRefMs}
                    />

                    {spanStart && <KindToggle kind={kind.value} onPick={pickKind} />}
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
                        setDate(d);
                        setStart(s);
                        setEnd(e);
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
                {/* **The second journey**, on its own step (ADR-0155 §5). Dates and times only —
              the route is the outbound's mirror and every other field is shared, so this
              block asks for the one thing that genuinely differs. Its zones are swapped:
              the return departs from the destination and arrives at the origin. It sits
              with the shared fields because that is what the step is: everything the
              outbound leg did not already answer. */}
                {twoLegs && (
                  <div className="bs-leg bs-leg-return">
                    <div className="bs-leg-head">
                      <span>{t.index.form.legBack}</span>
                      <RouteLabel
                        from={placeName(places, toPlaceId)}
                        to={placeName(places, fromPlaceId)}
                      />
                    </div>
                    <WhenField
                      variant="span"
                      start={returnStart}
                      end={returnEnd}
                      onChange={({ start: s, end: e }) => {
                        setReturnStart(s);
                        setReturnEnd(e);
                      }}
                      minDate={trip.startDate}
                      maxDate={trip.endDate}
                      labels={spanLabels(type)}
                      defaultDate={spanEnd.split('T')[0] || trip.startDate}
                      timeZone={endZone}
                      endTimeZone={startZone}
                      durationUnit={bookingDurationUnit(type)}
                      marks={{
                        start: errors.field('returnStart'),
                        end: errors.field('returnEnd'),
                      }}
                    />
                    <ZoneNote
                      startZone={endZone}
                      endZone={startZone}
                      tripZone={trip.timezone}
                      refMs={zoneRefMs}
                    />
                  </div>
                )}

                <Field
                  label={t.index.sheet.codeLabel}
                  htmlFor="bs-code"
                  hint={twoLegs ? t.index.form.codeSharedHint : undefined}
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
              notes are rows like everyone else's rather than a string in a JSON blob. */}
                <Field
                  label={t.notes.composer.label}
                  htmlFor="bs-notes"
                  hint={t.notes.composer.hint}
                >
                  <NoteComposer state={composer} id="bs-notes" />
                </Field>
              </>
            )}
          </FormStepPanel>

          {/* Only what has no field to point at still reads down here. */}
          {errors.formError && (
            <p className="field-error" role="alert">
              {errors.formError}
            </p>
          )}

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
  onCancel,
  onChoose,
}: {
  hasLinkedEvent: boolean;
  linkedIsHard: boolean;
  /** The other leg of a derived round trip, if there is one (ADR-0154 §5). It buys a
   *  STATEMENT that the partner survives — never a fourth button. */
  partnerLeg?: PartnerLeg;
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
          <div className="bs-choice-s">{t.index.del.bothSub}</div>
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
