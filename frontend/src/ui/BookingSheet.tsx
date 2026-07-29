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
  BOOKING_TYPE,
  BOOKING_TYPE_TO_CATEGORY,
  EVENT_KIND,
  type Booking,
  type BookingType,
} from '@waypoint/shared';
import {
  bookingSheetDraft,
  bookingDefaultKind,
  isSpanType,
  isTransportType,
  type BookingSeed,
  type BookingSheetDraft,
} from '../lib/booking-draft';
import { useTrip } from '../state/trip-state';

// Re-exported so the sheet stays the obvious import for its own props (the derivation moved
// out in session 173, the vocabulary did not).
export type { BookingSeed, BookingSheetDraft };
import { Sheet } from './Sheet';
import { IconPicker } from './IconPicker';
import { Icon } from './Icon';
import { RouteLabel } from './RouteLabel';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { PlacePicker } from './primitives/PlacePicker';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { WhenField } from './primitives/WhenField';
import { type ZoneChipProps } from './primitives/ZoneChip';
import { ConfirmDialog } from './primitives/ConfirmDialog';
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
  const { trip, events, places, indexVerbs } = useTrip();
  const startErrand = useStartPlaceErrand();
  const isCreate = !booking;

  // `שבץ במסלול` opened this sheet FOR the schedule (ADR-0138 §7), so land there
  // rather than at the title. Runs once on open; `Modal` has already taken focus
  // to the card by then, which is why this re-takes it rather than racing it.
  const whenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus !== 'when') return;
    const first = whenRef.current?.querySelector<HTMLElement>('input, button');
    first?.scrollIntoView({ block: 'center' });
    first?.focus();
  }, [focus]);
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
  const [notes, setNotes] = useState(draft ? draft.notes : initial.notes);
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
  const kind = useDerivedField<'hard' | 'soft'>(
    draft ? draft.kind : initial.kind,
    draft ? draft.kindTouched : false,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        notes,
        wifiNetwork,
        wifiPassword,
        date,
        start,
        end,
        spanStart,
        spanEnd,
        kind: kind.value,
        kindTouched: kind.touched,
      } satisfies BookingSheetDraft,
    });

  const suggestedZones = useMemo(
    () =>
      [...new Set([trip.timezone, ...places.map((p) => p.timezone).filter(Boolean)])] as string[],
    [trip.timezone, places],
  );

  const isTransport = isTransportType(type);
  const isHotel = type === BOOKING_TYPE.HOTEL;
  const isSpan = isSpanType(type);
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
    notes !== initial.notes ||
    wifiNetwork !== initial.wifiNetwork ||
    wifiPassword !== initial.wifiPassword ||
    date !== initial.date ||
    start !== initial.start ||
    end !== initial.end ||
    spanStart !== initial.spanStart ||
    spanEnd !== initial.spanEnd ||
    startOverride !== initial.startOverride ||
    endOverride !== initial.endOverride ||
    kind.value !== initial.kind;
  const { guardedClose, prompting, confirmDiscard, cancelDiscard } = useUnsavedGuard(dirty);
  const requestClose = () => guardedClose(onClose);

  const changeType = (next: BookingType) => {
    setType(next);
    icon.redrive(BOOKING_TYPE_ICON[next]);
    kind.redrive(bookingDefaultKind(next));
  };
  const pickKind = (k: 'hard' | 'soft') => kind.set(k);

  const save = async () => {
    // Transport is identified by its route, not a name (ADR-0059 §3): derive the
    // stored title from origin→destination (it backs the linked event's title and
    // any place-less fallback), so a flight never carries a hand-typed name.
    let finalTitle: string;
    if (isTransport) {
      finalTitle = routeTitle(
        placeName(places, fromPlaceId) ?? '',
        placeName(places, toPlaceId) ?? '',
      );
      if (!finalTitle) return setError(t.index.form.routeRequired);
    } else {
      finalTitle = title.trim();
      if (!finalTitle) return setError(t.index.form.titleRequired);
    }
    const outOfRange = (v: string) => dateOutOfTripRange(v, trip.startDate, trip.endDate);
    if (isSpan ? outOfRange(spanStart) || outOfRange(spanEnd) : outOfRange(date)) {
      return setError(t.index.form.dateOutOfRange);
    }
    // A span's end must be after its start. WhenField bounds the end's earliest
    // day to the start day; this also rejects a same-day end at/before the start
    // time (a time-less end stays open-ended, so only guard when both have one).
    if (isSpan) {
      const [sDay, sTime] = spanStart.split('T');
      const [eDay, eTime] = spanEnd.split('T');
      if (sTime && eTime) {
        const s = Date.parse(zonedIso(sDay, sTime, startZone));
        const e = Date.parse(zonedIso(eDay, eTime, endZone));
        if (e <= s) return setError(t.index.form.endBeforeStart);
      }
    }
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
          notes,
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
        if (isCreate) {
          await indexVerbs.createBooking(
            isTransport
              ? { type, ...base, ...zonePatch, fromPlaceId, toPlaceId }
              : { type, ...base, ...zonePatch, placeId },
          );
        } else {
          await indexVerbs.updateBooking(booking.id, {
            ...base,
            ...zonePatch,
            ...(isTransport ? { fromPlaceId, toPlaceId } : { placeId }),
          });
        }
      });
      onClose();
    } catch {
      setSaving(false); // the verb already toasted + rolled back
    }
  };

  return (
    <>
      <Sheet
        ariaLabel={isCreate ? t.index.form.createTitle : t.index.sheet.editTitle}
        onClose={requestClose}
      >
        <div
          className="booking-sheet"
          // Reveal the focused field above the on-screen keyboard within the
          // scrolling sheet (matches EventForm — the keyboard never covers a field).
          onFocusCapture={(e) => {
            if (e.target instanceof HTMLElement)
              e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }}
        >
          {isCreate && (
            <ChoiceGrid
              options={BOOKING_TYPE_OPTIONS}
              value={type}
              onChange={changeType}
              columns={3}
              ariaLabel={t.index.form.kindLabel}
            />
          )}

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

          <div className="bs-caption">
            <span>
              ✨ {t.index.form.autoCaption}{' '}
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
            <Field label={t.index.form.routeLabel}>
              <div className="bs-route-pickers">
                {/* TWO FIELDS, TWO ERRANDS — this is why `target.field` is not optional
                    (ADR-0134 §2): without it a successful return could assign the right
                    place to the wrong end of the journey. */}
                <PlacePicker
                  value={fromPlaceId}
                  onChange={setFromPlaceId}
                  ariaLabel={t.index.form.originLabel}
                  placeholder={t.index.form.originShort}
                  onFind={findPlace('fromPlaceId', t.index.form.originLabel)}
                />
                <PlacePicker
                  value={toPlaceId}
                  onChange={setToPlaceId}
                  ariaLabel={t.index.form.destLabel}
                  placeholder={t.index.form.destShort}
                  onFind={findPlace('toPlaceId', t.index.form.destLabel)}
                />
              </div>
              <div className="bs-route-hint">📍 {t.index.form.routeHint}</div>
            </Field>
          )}

          {/* "When" comes first (right after the identity row), through the one
              WhenField standard — a span for two-endpoint bookings, a single day
              otherwise. Never a cramped native datetime box (U-05).

              The wrapper exists for `focus="when"` (ADR-0138 §7): the ref goes on
              the BLOCK rather than on a `WhenField` autofocus prop, because the two
              variants have different first controls and the sheet is the one place
              that knows which is rendered. */}
          <div ref={whenRef}>
            {isSpan ? (
              <>
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

          {/* Single-place types carry a location; transport's places are its
              route endpoints above (ADR-0048). Transport needs no note of its own:
              `routeTitle` → `routeRequired` already refuses to save without both
              endpoints, so it is the one type that cannot be placeless. */}
          {!isTransport && (
            <Field
              label={t.index.sheet.locationLabel}
              hint={placeId ? undefined : t.placePicker.noLocationHint}
            >
              <PlacePicker value={placeId} onChange={setPlaceId} onFind={findPlace('placeId')} />
            </Field>
          )}

          <Field label={t.index.sheet.codeLabel} htmlFor="bs-code">
            <input id="bs-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>

          {isHotel && (
            <>
              <Field label={t.index.sheet.roomLabel} htmlFor="bs-room">
                <input id="bs-room" value={room} onChange={(e) => setRoom(e.target.value)} />
              </Field>
              <div className="bs-wifi">
                <div className="bs-wifi-head">
                  📶 {t.index.sheet.wifiTitle}
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

          <Field label={t.index.sheet.notesLabel} htmlFor="bs-notes">
            <textarea id="bs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <FormActions
            primary={{ label: t.common.save, onClick: save, disabled: saving }}
            secondary={{ label: t.common.cancel, onClick: requestClose }}
            destructive={
              isCreate
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
  onCancel,
  onChoose,
}: {
  hasLinkedEvent: boolean;
  linkedIsHard: boolean;
  onCancel: () => void;
  onChoose: (choice: 'both' | 'unlink') => void;
}) {
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
      />
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
