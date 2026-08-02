// Self-contained event create/edit form (T-047). Renders its fields + submit
// INSIDE the single Modal primitive (variant="sheet", ADR-0079 / U-01) — so the
// overlay stack (system-back), focus-in/Escape/restore, and backdrop-close all
// work like every other sheet; this component owns only the fields, not the
// presentation container. A dirty close is guarded by a discard confirm (U-05).
import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  carriesRoute,
  defaultKindForBookingType,
  createEventSchema,
  updateEventSchema,
  iconForCategory,
  CATEGORY_TO_BOOKING_TYPE,
  EVENT_CATEGORY,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type BookingType,
  type EventCategory,
  type MaybeItem,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { withChangeGroup } from '../lib/outbox';
import { authoringZone, eventDisplayZones, placeTimezone } from '../lib/places';
import { useAuth } from '../state/auth-state';
import { useVerbs } from '../state/verbs';
import { useStartPlaceErrand } from '../state/map-scope-state';
import { getNow } from '../lib/useClock';
import { zonedIso, isoToTimeInput, hardConflicts, formatTime, resolveEndIso } from '../lib/time';
import { useUnsavedGuard } from '../lib/useUnsavedGuard';
import { useDerivedField } from '../lib/useDerivedField';
import { buildEventSeed } from '../lib/booking-edit';
import {
  CATEGORY_DEFAULT_BOOKED,
  DEFAULT_EVENT_ICON,
  DOT_SEPARATOR,
  TRANSPORT_BOOKING_TYPES,
} from '../constants';
import { t } from '../i18n/he';
import { EVENT_CATEGORY_OPTIONS } from '../lib/category-options';
import { IconPicker } from './IconPicker';
import { TitleLabel } from './TitleLabel';
import { Icon } from './Icon';
import { Modal } from './primitives/Modal';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { Collapsible } from './primitives/Collapsible';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { PlacePicker } from './primitives/PlacePicker';
import { ToggleChip } from './primitives/ToggleChip';
import { WhenField } from './primitives/WhenField';
import { ConfirmDialog } from './primitives/ConfirmDialog';
import { useFormErrors, type FieldProblem } from './primitives/useFormErrors';
import { NoteComposer, useNoteComposer } from './NoteComposer';
import { HostNotes } from './HostNotes';
import { RouteField } from './domain';

/** **The form's own state, as one blob** (ADR-0134 §2). A form is a `Modal` with local
 *  state that no URL addresses, so sending its place field off to the Map tab means the
 *  half-typed event has to travel with it — losing one would be far worse than an extra
 *  tap. The errand channel treats this as opaque on purpose: only this file knows what an
 *  event form contains, and that is what keeps the channel from changing every time the
 *  form does.
 *
 *  `error` is deliberately absent: it is a statement about the last save attempt, not
 *  something the user typed. */
export interface EventFormDraft {
  title: string;
  date: string;
  start: string;
  end: string;
  kind: TripEvent['kind'];
  /** ADR-0136 §4: the kind follows the booking type's default only while untouched, and an
   *  existing event counts as touched — re-deriving would silently HARDEN a soft event the
   *  instant the row went on, which ADR-0011 forbids. */
  kindTouched: boolean;
  icon: string;
  iconTouched: boolean;
  /** ADR-0136: is this event also booked, and has a human said so? Both travel, because a
   *  place errand that lost either would come back having quietly changed what the save does. */
  booked: boolean;
  bookedTouched: boolean;
  /** The optional confirmation code — a detail OF a booking, never what creates one (§1). */
  code: string;
  /** An explicit booking type, overriding the category's guess; `null` re-derives. Only
   *  `transport` can set it (ADR-0136 §2) — a nullable slot rather than a fourth `*Touched`
   *  guard, which is the idiom this form's zone `override` already uses. */
  bookingType: BookingType | null;
  category?: EventCategory;
  placeId?: string;
  /** The two route ends, for a booked transport event (ADR-0154 §1/§3). Named for the
   *  `Booking` columns on purpose: `usePlaceErrandReturn` assigns its result with
   *  `draft[target.field]`, so the draft key, the errand field and the column are one
   *  string end to end. */
  fromPlaceId?: string;
  toPlaceId?: string;
  override: string | null;
}

export function EventForm({
  event,
  defaults,
  maybeItem,
  draft,
  onOpenBooking,
  onClose,
}: {
  event?: TripEvent | null;
  // Prefill for a *new* event (e.g. the builder's gap-fill: date + start of the
  // gap). Ignored when editing an existing event.
  defaults?: { date?: string; start?: string; end?: string; placeId?: string };
  /** The way in from an already-linked event's statement (ADR-0136 §3). Absent on a host with
   *  nowhere to send it, which makes the statement a plain read-out rather than a dead
   *  control — the derived-affordance rule this app runs everywhere else. */
  onOpenBooking?: (booking: Booking) => void;
  // When set, this is a "schedule from the shelf" flow: same fields, but on save
  // it creates the event AND consumes the idea (verbs.schedule) instead of a
  // plain create. Prefilled from the idea's title/kind.
  maybeItem?: MaybeItem | null;
  /** Re-opening after a place errand: every field comes from here rather than from the
   *  entity, so nothing typed before the trip to the Map is lost (ADR-0134 §2). */
  draft?: EventFormDraft | null;
  onClose: () => void;
}) {
  const { trip, activeDate, events, places, bookings, zoneEvidence, noteVerbs } = useTrip();
  const { me } = useAuth();
  const verbs = useVerbs();
  const startErrand = useStartPlaceErrand();

  // A booking-linked event's place + category live on the booking (ADR-0051 /
  // ADR-0109 §11), edited there — so the form only authors them for a standalone
  // event or a shelf schedule.
  const showPlace = !event?.bookingId;
  const showCategory = !event?.bookingId;
  // …and so does its code, which is why `יש הזמנה` follows the same rule (ADR-0136 §3): on an
  // already-linked event there is no control at all, only a statement with a way in. That is
  // also what makes the path one-way, without needing a rule for it.
  const showBooked = !event?.bookingId;
  const linkedBooking = event?.bookingId
    ? bookings.find((b) => b.id === event.bookingId)
    : undefined;

  // ── Which zone this form authors in (ADR-0107 §2-3) ───────────────────────
  // The times typed here mean a wall-clock in ONE zone, resolved the same way the
  // day view resolves the event's display zone: the manual override if pinned,
  // else the picked place, else the itinerary segment, else the trip primary. An
  // existing event is read back in that same zone, so the form and the view agree
  // (the slice-4a rule, now for events too) — via the one shared `authoringZone`,
  // which the shelf's schedule sheet reads too (session-128 amendment).
  const initialOverride = event?.displayTimezone ?? null;
  const [override, setOverride] = useState<string | null>(draft?.override ?? initialOverride);

  const derivedZone = (atDate: string, atTime: string, forPlaceId?: string): string =>
    authoringZone(
      {
        ...(event ?? {}),
        placeId: showPlace ? forPlaceId : event?.placeId,
      },
      { date: atDate, time: atTime },
      zoneEvidence,
    );

  // Initial values captured up front so the unsaved-changes guard can diff
  // against them (props are stable while the form is open).
  const initialTitle = event?.title ?? maybeItem?.title ?? '';
  const initialDate = event?.date ?? defaults?.date ?? activeDate;
  const initialZone =
    initialOverride ??
    (event
      ? eventDisplayZones(event, zoneEvidence).start
      : derivedZone(initialDate, defaults?.start ?? '', maybeItem?.placeId));
  const initialStart = event?.startsAt
    ? isoToTimeInput(event.startsAt, initialZone)
    : (defaults?.start ?? '');
  const initialEnd = event?.endsAt
    ? isoToTimeInput(event.endsAt, initialZone)
    : (defaults?.end ?? '');
  const initialKind: TripEvent['kind'] = event?.kind ?? EVENT_KIND.SOFT;
  const initialIcon = event?.icon ?? maybeItem?.icon ?? DEFAULT_EVENT_ICON;
  const initialCategory = event?.category ?? maybeItem?.category;
  // `defaults.placeId` is the Map's way in (ADR-0135 §1): you are standing on the place, so it
  // arrives pre-filled. Lowest priority of the three — an existing event's own place wins, and
  // so does the idea's, since either is a statement about THIS thing rather than a prefill.
  const initialPlaceId = event?.placeId ?? maybeItem?.placeId ?? defaults?.placeId;

  // A returning draft wins over every derived initial value (ADR-0134 §2) — including
  // the ones derived from the trip, since the user may well have changed the day since.
  const [title, setTitle] = useState(draft?.title ?? initialTitle);
  const [date, setDate] = useState(draft?.date ?? initialDate);
  const [start, setStart] = useState(draft?.start ?? initialStart);
  const [end, setEnd] = useState(draft?.end ?? initialEnd);
  // Editing an existing event counts as touched, the same way the icon treats a glyph the event
  // already carries: its kind is a fact about it, not something for the booked row to re-derive
  // (ADR-0136 §4 — re-deriving would harden a soft event on a toggle).
  const kind = useDerivedField<TripEvent['kind']>(
    draft?.kind ?? initialKind,
    draft?.kindTouched ?? Boolean(event),
  );
  // The icon is a pure badge (ADR-0109 §11): picking a category defaults the glyph via
  // `iconForCategory`, unless the user has deliberately chosen one. Editing an event that
  // already carries a glyph counts as chosen, so a later category change doesn't clobber it;
  // a fresh event starts untouched.
  const icon = useDerivedField(
    draft?.icon ?? initialIcon,
    draft?.iconTouched ?? Boolean(event?.icon ?? maybeItem?.icon),
  );
  const [category, setCategory] = useState<EventCategory | undefined>(
    draft ? draft.category : initialCategory,
  );
  const [placeId, setPlaceId] = useState<string | undefined>(
    draft ? draft.placeId : initialPlaceId,
  );
  // A booked transport event carries a ROUTE, not a place (ADR-0154 §3). Held separately
  // from `placeId` so flipping the booking type back and forth loses neither: the save
  // sends whichever shape the type actually has.
  const [fromPlaceId, setFromPlaceId] = useState<string | undefined>(draft?.fromPlaceId);
  const [toPlaceId, setToPlaceId] = useState<string | undefined>(draft?.toPlaceId);
  // Every refusal this form can make, marked at the field it is about (ADR-0150).
  const errors = useFormErrors<'title' | 'date' | 'time'>();
  const noteId = useId();
  const composer = useNoteComposer();

  // ── `יש הזמנה` (ADR-0136) ──────────────────────────────────────────────────
  // The row DEFAULTS from the category — lodging and transport open on, everything else off —
  // which is inference doing the one thing it can do honestly: offering a starting position,
  // never deciding a fact. It stops moving the moment a human touches it.
  const booked = useDerivedField(
    draft ? draft.booked : initialCategory ? CATEGORY_DEFAULT_BOOKED[initialCategory] : false,
    draft?.bookedTouched ?? false,
  );
  const [code, setCode] = useState(draft?.code ?? '');
  const [bookingType, setBookingType] = useState<BookingType | null>(draft?.bookingType ?? null);

  // The type the save will write: an explicit pick, else the category's guess. Only `transport`
  // offers the pick, because it is the only category the mapping cannot answer (§2).
  const derivedType: BookingType = bookingType ?? CATEGORY_TO_BOOKING_TYPE[category ?? 'other'];
  // **THE FIX FOR THE 400** (ADR-0154 §1). A route-shaped booking carries
  // `fromPlaceId`/`toPlaceId` and a single-place one carries `placeId` — mutually
  // exclusive, and `bookings.service.ts`'s `assertPlaceShape` throws on the wrong pair.
  // This row used to send `placeId` whatever the type was, so a transport event WITH a
  // place could not be booked at all, and one without produced a route-less booking four
  // other surfaces cannot read. One fact, read by the field below and by the save.
  const routeShaped = booked.value && showBooked && carriesRoute(derivedType);
  // The single place seeds the ORIGIN — an existing transport event carries one place and
  // cannot say which end it is, so it lands here and the swap moves it (§3). "Sensibly
  // defaulted, trivially fixable", the posture ADR-0113/0116 §1 set.
  const routeFrom = fromPlaceId ?? placeId;

  /** **ONE hand-over blob for all three place errands** (ADR-0134 §2). It was written out
   *  inline when there was one errand; there are three now (the place and the two route
   *  ends), and a field missed in one copy is silently lost on the way back — which is the
   *  failure that §2 exists to name. Built at call time so it captures the latest state. */
  const errandDraft = (): EventFormDraft => ({
    title,
    date,
    start,
    end,
    kind: kind.value,
    kindTouched: kind.touched,
    icon: icon.value,
    iconTouched: icon.touched,
    booked: booked.value,
    bookedTouched: booked.touched,
    code,
    bookingType,
    category,
    placeId,
    fromPlaceId: routeFrom,
    toPlaceId,
    override,
  });
  const askBookingType = category === EVENT_CATEGORY.TRANSPORT;

  // While untouched the kind follows the booking type's own default (`defaultKindForBookingType`) —
  // hard for a flight, train, hotel or activity; SOFT for a restaurant, which is exactly why
  // "hard ⇒ booked" could never have been the trigger (§1/§4).
  const deriveKind = (nextBooked: boolean, nextType: BookingType) =>
    kind.redrive(nextBooked ? defaultKindForBookingType(nextType) : EVENT_KIND.SOFT);

  const pickCategory = (next: EventCategory) => {
    setCategory(next);
    icon.redrive(iconForCategory(next));
    // A new category is a new question, so an explicit type does not survive it.
    setBookingType(null);
    // `redrive` answers with the value now in force, so the kind's derivation below reads the
    // row's real state rather than a `useState` React has not flushed yet.
    deriveKind(booked.redrive(CATEGORY_DEFAULT_BOOKED[next]), CATEGORY_TO_BOOKING_TYPE[next]);
  };

  const toggleBooked = () => {
    const next = !booked.value;
    booked.set(next);
    deriveKind(next, derivedType);
  };

  const pickBookingType = (next: BookingType) => {
    setBookingType(next);
    deriveKind(booked.value, next);
  };

  // The zone in force right now: the pinned override, else re-derived from the
  // fields as they stand (changing the place or the day can move it).
  const tz = override ?? derivedZone(date, start, placeId);
  // Suggested zones in the picker: what this trip actually touches (its places'
  // zones + its primary), most relevant first — never the raw IANA list alone.
  const suggestedZones = useMemo(() => {
    const zones = [tz, trip.timezone];
    for (const p of places) if (p.timezone) zones.push(p.timezone);
    return [...new Set(zones)];
  }, [tz, trip.timezone, places]);

  const dirty =
    override !== initialOverride ||
    title !== initialTitle ||
    date !== initialDate ||
    start !== initialStart ||
    end !== initialEnd ||
    kind.value !== initialKind ||
    icon.value !== initialIcon ||
    category !== initialCategory ||
    placeId !== initialPlaceId ||
    // A row the human turned on, a typed code, or a chosen type are all real edits — closing
    // with any of them unsaved has to hit the discard guard like every other field.
    booked.touched ||
    code !== '' ||
    bookingType != null ||
    // A picked route is an edit like any other (ADR-0154 §3). `fromPlaceId` rather than
    // `routeFrom`, which falls back to `placeId` and so is dirty whenever the place is.
    fromPlaceId != null ||
    toPlaceId != null;
  const { guardedClose, prompting, confirmDiscard, cancelDiscard } = useUnsavedGuard(dirty);
  const requestClose = () => guardedClose(onClose);

  // Live hard-conflict warning (ADR-0011): a soft event whose span overlaps a
  // same-day hard event is flagged as it's edited — same check the day view and
  // board use, so the warning wording is consistent. Only meaningful once the
  // event has a full span; hardConflicts itself returns [] for hard events.
  const conflicts = useMemo(() => {
    if (!start || !end) return [];
    const provisional = {
      id: event?.id ?? '__provisional__',
      kind: kind.value,
      startsAt: zonedIso(date, start, tz),
      endsAt: resolveEndIso(date, start, end, tz),
    } as TripEvent;
    const dayEvents = events.filter((e) => e.date === date && e.status !== EVENT_STATUS.SKIPPED);
    return hardConflicts(provisional, dayEvents);
  }, [start, end, kind.value, date, tz, events, event?.id]);

  /** The backstop below the checks in `submit`: a shape the schema refuses after they
   *  all passed. There is no field to point at, so it reads in the form-level slot. */
  const refuseUnexpected = (message?: string) => {
    errors.report([{ field: null, message: message ?? t.eventForm.titleRequired }]);
  };

  /**
   * **The notes, after their host and inside the same change group** (ADR-0152 §6b).
   *
   * Ordering is the whole reason this waits on the host's own promise rather than firing
   * beside it: offline the outbox is FIFO, so a note enqueued before its host's op would
   * flush first and the server would refuse a host it cannot see. That is why `verbs.create`,
   * `verbs.schedule` and `verbs.book` all resolve now — nothing here waits on a NETWORK
   * round-trip, only on the write being sent or queued.
   *
   * `hostOf` names which entity the notes belong to, because it is not the same one on every
   * path: a booked save's event is materialized by the server (ADR-0093), so its notes go on
   * the booking, whose id is client-generated.
   */
  const writeNotesBehind = async <T,>(
    host: Promise<T>,
    hostOf: (created: NonNullable<T>) => { eventId?: string; bookingId?: string },
  ): Promise<void> => {
    const bodies = composer.pending();
    if (bodies.length === 0) return;
    await withChangeGroup(async () => {
      const created = await host;
      if (created == null) return; // the write rolled back and has already said so
      const where = hostOf(created);
      for (const body of bodies) await noteVerbs.createNote({ body, ...where });
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // EVERY refusal at once (ADR-0150), each named at its own field: a form with
    // two things missing says so once, instead of sending the user round the save
    // loop a second time to be told the next one.
    const problems: FieldProblem<'title' | 'date' | 'time'>[] = [];
    if (!title.trim()) problems.push({ field: 'title', message: t.eventForm.titleRequired });
    // Native min/max guides the picker, but a typed value can still land outside
    // the trip. An event belongs to a day within [startDate, endDate] — an
    // overnight event on the last day still files under that day (ADR-0037).
    const dateProblem = !date
      ? t.eventForm.dateRequired
      : date < trip.startDate || date > trip.endDate
        ? t.eventForm.dateOutOfRange
        : null;
    if (dateProblem) problems.push({ field: 'date', message: dateProblem });

    // The instants only mean anything once the day does, so they are derived after
    // the day is known good — and then they are what the save sends.
    const startsAt = !dateProblem && start ? zonedIso(date, start, tz) : undefined;
    const endsAt =
      !dateProblem && end
        ? start
          ? resolveEndIso(date, start, end, tz)
          : zonedIso(date, end, tz)
        : undefined;
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      problems.push({ field: 'time', message: t.eventForm.endBeforeStart });
    }
    if (errors.report(problems)) return;

    const fields = {
      date,
      title: title.trim(),
      icon: icon.value,
      category,
      kind: kind.value,
      placeId: showPlace ? placeId : undefined,
      // Only ever the user's own choice (ADR-0110 §94-99): a pinned zone is sent,
      // and clearing one sends `null` to hand the event back to the derivation. An
      // untouched form sends nothing, so it can't freeze today's derived zone.
      displayTimezone: override !== initialOverride ? override : undefined,
      startsAt,
      endsAt,
    };

    // ── THE ONE BRANCH THIS ROW ADDS (ADR-0136 §1/§3) ────────────────────────
    // Everything above is unchanged: you are always creating an event, and the fields are the
    // same either way. What differs is only WHAT IS WRITTEN.
    //
    //  • new event      → `createBooking` WITH its `event` seed. The server produces the
    //                     linked pair, so the event never exists unbooked.
    //  • existing event → `createBooking` WITHOUT a seed (the event is already there; a seed
    //                     would make a second one), then a `bookingId` patch. The server nulls
    //                     its `placeId` itself (ADR-0048), so there is no migration code here.
    //  • from the shelf → plus the idea's consume (ADR-0135 §5).
    //
    // The verb keeps those writes behind ONE toast and ONE undo.
    if (booked.value && showBooked) {
      const parsed = createEventSchema.safeParse(fields);
      if (!parsed.success) return refuseUnexpected(parsed.error.issues[0]?.message);
      // **The notes go on the BOOKING here, and that is not a compromise.** On this path the
      // linked event is materialized by the SERVER from a seed (ADR-0093), so there is no
      // client-side event id to attach to — while the booking's id is client-generated and
      // comes back from the verb. It is also where they would have been written had the user
      // opened `BookingSheet` instead, so the pair stays consistent.
      void writeNotesBehind(
        verbs.book(
          {
            type: derivedType,
            title: parsed.data.title,
            // Sent only when one was typed: the code creates nothing, and an empty string here
            // would be the "clear it" intent, which makes no sense on a create.
            confirmationCode: code.trim() || undefined,
            // Mutually exclusive by type (ADR-0048), which is the whole bug: sending the
            // wrong one is a 400, and sending neither is a booking with no route.
            ...(routeShaped
              ? { fromPlaceId: routeFrom, toPlaceId }
              : { placeId: parsed.data.placeId }),
            ...(event
              ? {}
              : {
                  event: buildEventSeed(
                    { date, start, end, kind: kind.value, icon: icon.value, category },
                    tz,
                  ),
                }),
          },
          { event: event ?? null, maybeId: maybeItem?.id ?? null },
        ),
        (booking) => ({ bookingId: booking.id }),
      );
      onClose();
      return;
    }

    if (event) {
      const parsed = updateEventSchema.safeParse(fields);
      if (!parsed.success) return refuseUnexpected(parsed.error.issues[0]?.message);
      verbs.update(event, parsed.data);
      // The host is already there, so there is nothing to wait for — but this still goes
      // through the same helper, so a note written while editing is grouped and ordered
      // exactly like one written while creating.
      void writeNotesBehind(Promise.resolve(event.id), (id) => ({ eventId: id }));
    } else if (maybeItem) {
      const parsed = createEventSchema.safeParse(fields);
      if (!parsed.success) return refuseUnexpected(parsed.error.issues[0]?.message);
      void writeNotesBehind(
        verbs.schedule(maybeItem, {
          date: parsed.data.date,
          title: parsed.data.title,
          kind: parsed.data.kind,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          icon: parsed.data.icon,
          category: parsed.data.category,
          placeId: parsed.data.placeId,
          displayTimezone: parsed.data.displayTimezone ?? undefined,
        }),
        (created) => ({ eventId: created.id }),
      );
    } else {
      const parsed = createEventSchema.safeParse(fields);
      if (!parsed.success) return refuseUnexpected(parsed.error.issues[0]?.message);
      const now = new Date(getNow()).toISOString();
      const id = crypto.randomUUID();
      void writeNotesBehind(
        verbs
          .create({
            ...parsed.data,
            displayTimezone: parsed.data.displayTimezone ?? undefined,
            id,
            tripId: trip.id,
            status: EVENT_STATUS.PLANNED,
            sortOrder: 99,
            source: parsed.data.source ?? EVENT_SOURCE.MANUAL,
            createdAt: now,
            updatedAt: now,
            updatedBy: me?.user.id ?? trip.updatedBy,
          })
          .then(() => id),
        (created) => ({ eventId: created }),
      );
    }
    onClose();
  };

  const heading = event
    ? t.eventForm.editTitle
    : maybeItem
      ? t.eventForm.scheduleTitle
      : t.eventForm.newTitle;

  return (
    <>
      <Modal variant="sheet" title={heading} onClose={requestClose}>
        <form
          className="modal-form"
          onSubmit={submit}
          // THE APP DOES THE REFUSING (ADR-0150). Without this the browser's own
          // constraint validation gets there first on a date outside `min`/`max` — an
          // untranslated LTR bubble, and a save that never reaches `submit`, so the
          // form's own Hebrew refusal at the field could not run. It also puts this
          // form and `BookingSheet` (whose save is a plain button, never natively
          // validated) on the same footing.
          noValidate
          // Addressing a refusal retires it, wherever in the form it was made.
          {...errors.formProps}
          // Reveal the focused field above the keyboard within the scrolling sheet.
          onFocusCapture={(e) => {
            if (e.target instanceof HTMLElement)
              e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }}
        >
          {/* Category leads (ADR-0109 §11): choosing it defaults the badge glyph,
              so it reads naturally above the icon + name row. */}
          {showCategory && (
            <Field label={t.eventForm.categoryLabel}>
              <div className="category-pills">
                <ChoiceGrid
                  layout="pills"
                  options={EVENT_CATEGORY_OPTIONS}
                  value={category}
                  onChange={pickCategory}
                  ariaLabel={t.eventForm.categoryLabel}
                />
              </div>
            </Field>
          )}

          <Field label={t.eventForm.titleLabel} {...errors.field('title')}>
            <div className="title-row">
              <IconPicker icon={icon.value} onChange={icon.set} />
              <input
                className="title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.eventForm.titlePlaceholder}
              />
            </div>
          </Field>

          <WhenField
            variant="day"
            dateId="ef-date"
            date={date}
            start={start}
            end={end}
            onChange={(next) => {
              setDate(next.date);
              setStart(next.start);
              setEnd(next.end);
            }}
            zone={{
              value: tz,
              // A placed event's zone follows its place — correcting it there is
              // the honest edit, so the chip is read-only once a place is picked
              // (ADR-0107 §3: place wins). The override exists for the PLACELESS
              // case, where only the segment/primary fallback would decide.
              onChange: placeTimezone(places, showPlace ? placeId : undefined)
                ? undefined
                : setOverride,
              pinned: override != null,
              suggested: suggestedZones,
            }}
            minDate={trip.startDate}
            maxDate={trip.endDate}
            marks={{ date: errors.field('date'), time: errors.field('time') }}
          />

          {conflicts.length > 0 && (
            <p className="form-conflict">
              <Icon name="warn" /> {t.event.conflictWarn.before}
              <TitleLabel title={conflicts[0].title} />{' '}
              {t.event.conflictWarn.after(formatTime(conflicts[0].startsAt!, tz))}
            </p>
          )}

          {/* A booked transport event is authored as a ROUTE, not a place (ADR-0154 §3) —
              the same `RouteField` the booking sheet uses, so the two forms cannot disagree
              about what a journey looks like. Neither end is required: ADR-0136's "requires
              nothing" is the whole posture of this row, and the fix must not spend it.

              Otherwise the single place, with the same note the booking form carries under
              an empty one — an event with no place loses the same five things, and the two
              authoring forms must not disagree about whether that is worth saying. */}
          {showPlace &&
            (routeShaped ? (
              <Field label={t.index.form.routeLabel}>
                <RouteField
                  from={routeFrom}
                  to={toPlaceId}
                  onChange={({ from, to }) => {
                    setFromPlaceId(from);
                    setToPlaceId(to);
                  }}
                  onFind={(end, side) =>
                    startErrand?.({
                      target: { kind: 'event', id: event?.id, field: end },
                      label: [title.trim() || t.map.errand.untitledEvent, side]
                        .filter(Boolean)
                        .join(` ${DOT_SEPARATOR} `),
                      draft: errandDraft(),
                    })
                  }
                  hint={t.index.form.routeHintOptional}
                />
              </Field>
            ) : (
              <Field
                label={t.eventForm.locationLabel}
                hint={placeId ? undefined : t.placePicker.noLocationHint}
              >
                {/* THE MAP IS WHERE A PLACE COMES FROM (ADR-0134 §1): the field launches an
                    errand instead of opening a picker sheet here, because a place is
                    disambiguated BY PLACE and the map's own search answers both corpora —
                    the trip's own places from the first character, free and offline, before
                    Google is touched. The form writes the DRAFT, since only it knows what
                    else is half-typed. `startErrand` is null only where there is no Map tab
                    to route to, which no host of this form is (ADR-0134 §9). */}
                <PlacePicker
                  value={placeId}
                  onChange={setPlaceId}
                  placeholder={t.eventForm.locationPlaceholder}
                  onFind={() =>
                    startErrand?.({
                      target: { kind: 'event', id: event?.id, field: 'placeId' },
                      label: title.trim() || t.map.errand.untitledEvent,
                      draft: errandDraft(),
                    })
                  }
                />
              </Field>
            ))}

          {/* ── `יש הזמנה` (ADR-0136 §1) ─────────────────────────────────────
              You are always creating an event; this says it is ALSO booked, which is exactly
              what `event.bookingId != null` has always meant — the two were never
              alternatives. One tap, no typing, so it works for a table booked by phone with
              no number and for people who never record one.

              NO `field-label`: the button says `יש הזמנה`, and a label above it saying
              `הזמנה` is the same word twice for 20px (§5). */}
          {showBooked ? (
            <div className="field">
              <ToggleChip
                on={booked.value}
                tone="cta"
                size="touch"
                ariaControls="ef-booking-body"
                onClick={toggleBooked}
              >
                <Icon name={booked.value ? 'check' : 'plus'} />
                {t.eventForm.bookedLabel}
              </ToggleChip>
              <Collapsible expanded={booked.value}>
                {/* The one question the category cannot answer (§2, owner's call session
                    185): `EventCategory` has a single `transport` while `BookingType` has
                    both `flight` and `train`. Asked here and nowhere else — everywhere else
                    the category IS the answer, and a picker is what this ADR removes. */}
                {askBookingType && (
                  <div className="ef-btype">
                    <ChoiceGrid
                      layout="pills"
                      options={TRANSPORT_BOOKING_TYPES.map((ty) => ({
                        value: ty.value,
                        icon: ty.icon,
                        label: t.index.bookingType[ty.value],
                      }))}
                      value={derivedType}
                      onChange={pickBookingType}
                      ariaLabel={t.eventForm.bookedTypeLabel}
                    />
                  </div>
                )}
                {/* OPTIONAL is the whole point: the code is a detail OF a booking, never the
                    thing that creates one. Everything richer lives in `BookingSheet`. */}
                <input
                  className="ef-code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t.eventForm.bookedCodePlaceholder}
                  aria-label={t.eventForm.bookedCodePlaceholder}
                />
                {/* THE DERIVATION, STATED — never a second type picker, and it moves with
                    whatever settled the type, so the sentence and the pills cannot disagree.
                    The tail differs because the operations do: a create can be completed
                    later; a conversion moves two fields off the event being edited (§3). */}
                <p className="ef-derived">
                  <span aria-hidden="true">
                    {iconForCategory(category ?? EVENT_CATEGORY.OTHER)}
                  </span>
                  <span>
                    {event
                      ? t.eventForm.bookedDerivedConvert(t.index.bookingType[derivedType])
                      : t.eventForm.bookedDerived(t.index.bookingType[derivedType])}
                  </span>
                </p>
              </Collapsible>
            </div>
          ) : (
            /* Already linked: no control, a STATEMENT WITH A WAY IN (§3). Its code, room and
               notes live on the booking now — the rule the form already runs for place and
               category, one field wider. */
            <div className="field">
              <button
                type="button"
                className="ef-linked"
                onClick={() => linkedBooking && onOpenBooking?.(linkedBooking)}
                disabled={!linkedBooking || !onOpenBooking}
              >
                <span className="k">{t.eventForm.bookedLinkedLabel}</span>
                <span>
                  {[linkedBooking?.title, linkedBooking?.confirmationCode]
                    .filter(Boolean)
                    .join(` ${DOT_SEPARATOR} `)}
                </span>
                <Icon name="caret" dir="left" />
              </button>
            </div>
          )}

          <Field label={t.eventForm.kindLabel}>
            <div className="kind-toggle">
              {/* Touching either end stops the booking type deriving it (ADR-0136 §4): the
                  kind is a claim about commitment, and once a human has made it the row must
                  not keep moving it. */}
              <button
                type="button"
                className={'soft' + (kind.value === EVENT_KIND.SOFT ? ' on' : '')}
                onClick={() => kind.set(EVENT_KIND.SOFT)}
              >
                {t.eventForm.kindSoft}
              </button>
              <button
                type="button"
                className={'hard' + (kind.value === EVENT_KIND.HARD ? ' on' : '')}
                onClick={() => kind.set(EVENT_KIND.HARD)}
              >
                <Icon name="lock" /> {t.eventForm.kindHard}
              </button>
            </div>
          </Field>

          {/* **The note is written on the way** (ADR-0152 §6b) — one box, and a blank one
              writes nothing, so an event that needs no note costs no press.

              **On EDIT the existing notes read above that box**, which is §6b's own last
              paragraph and was missed when this form was first wired. It is not a nicety: in
              PLAN MODE this form is the only way into an event at all — the builder's row
              opens it directly, with no expanded card behind it — so until now a whole mode
              could neither read an event's notes nor write one. The section's own `＋ פתק` is
              off here (`canAdd`), because the box below it already is the way to add and it
              rides this form's save rather than opening a second sheet. */}
          {event && (
            <HostNotes host={{ kind: 'event', id: event.id, name: event.title }} canAdd={false} />
          )}
          <Field
            label={event ? t.notes.composer.labelMore : t.notes.composer.label}
            htmlFor={noteId}
            hint={t.notes.composer.hint}
          >
            <NoteComposer state={composer} id={noteId} />
          </Field>

          {/* Only what has no field to point at still reads down here. */}
          {errors.formError && (
            <p className="field-error" role="alert">
              {errors.formError}
            </p>
          )}

          <FormActions
            primary={{ label: t.common.save, type: 'submit' }}
            secondary={{ label: t.common.cancel, onClick: requestClose }}
          />
        </form>
      </Modal>

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
