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
import { useState, useMemo } from 'react';
import {
  BOOKING_TYPE,
  BOOKING_TYPE_TO_CATEGORY,
  EVENT_KIND,
  type Booking,
  type BookingType,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
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
  findPlaceByName,
  isoToDateTimeLocal,
} from '../lib/booking-edit';
import { routeTitle } from '../lib/route-title';
import { bookingZoneOverrides, placeName, placeTimezone } from '../lib/places';
import { withChangeGroup } from '../lib/outbox';
import { isoToTimeInput, zoneOffsetMinutes, zonedIso } from '../lib/time';
import { hoursPhrase } from '../lib/duration';
import { bookingDurationUnit, timingLabels } from '../lib/booking-timing';
import { BOOKING_TYPE_ICON } from '../constants';
import { t } from '../i18n/he';

interface Wifi {
  network?: string;
  password?: string;
}

const BOOKING_TYPE_OPTIONS = Object.values(BOOKING_TYPE).map((ty) => ({
  value: ty,
  icon: BOOKING_TYPE_ICON[ty],
  label: t.index.bookingType[ty],
}));
const isTransportType = (ty: BookingType) =>
  ty === BOOKING_TYPE.FLIGHT || ty === BOOKING_TYPE.TRAIN;
// Two-endpoint schedule (start + end, may span days): transport departure→arrival,
// a hotel check-in→check-out, an activity start→end. Restaurant/other are a
// single point on a day (date + the events time picker).
const isSpanType = (ty: BookingType) =>
  isTransportType(ty) || ty === BOOKING_TYPE.HOTEL || ty === BOOKING_TYPE.ACTIVITY;

/** The two span-endpoint labels for a type — shared with the detail view and the
 *  Index row so the wording never drifts (`../lib/booking-timing`). */
const spanLabels = timingLabels;

/** Pre-set fields for a create-flow open (ADR-0061): the Plan-home checklist opens
 *  the form for a specific booking type, and for a flight seeds the missing leg's
 *  destination endpoint. Ignored when editing an existing booking. */
export interface BookingSeed {
  type?: BookingType;
  origin?: string;
  dest?: string;
}

export function BookingSheet({
  booking,
  seed,
  onClose,
}: {
  booking?: Booking | null;
  seed?: BookingSeed;
  onClose: () => void;
}) {
  const { trip, events, places, indexVerbs } = useTrip();
  const isCreate = !booking;
  const linkedEvent = booking ? events.find((e) => e.bookingId === booking.id) : undefined;
  const initialType = booking?.type ?? seed?.type ?? BOOKING_TYPE.FLIGHT;
  const wifi = booking?.details?.wifi as Wifi | undefined;

  const defaultKind = (ty: BookingType) => (isSpanType(ty) ? EVENT_KIND.HARD : EVENT_KIND.SOFT);

  // Initial values captured up front so the unsaved-changes guard can diff them.
  const initialIcon = linkedEvent?.icon ?? BOOKING_TYPE_ICON[initialType];
  const initialTitle = booking?.title ?? '';
  const initialCode = booking?.confirmationCode ?? '';
  // Transport endpoints are now real picked places (ADR-0113 follow-up), authored
  // through the same PlacePicker as a single-place booking — no longer free text.
  // A free-text seed (PlanHome's flight prefill) resolves only to an EXISTING trip
  // place by name; if none matches, the leg starts empty and the user picks (no
  // orphan place created on open).
  const seedFromPlaceId = seed?.origin ? findPlaceByName(places, seed.origin)?.id : undefined;
  const seedToPlaceId = seed?.dest ? findPlaceByName(places, seed.dest)?.id : undefined;
  const initialFromPlaceId = booking?.fromPlaceId ?? seedFromPlaceId;
  const initialToPlaceId = booking?.toPlaceId ?? seedToPlaceId;
  // Single-place types (hotel/restaurant/activity/other) carry one placeId (ADR-0048).
  const initialPlaceId = booking?.placeId;
  const initialRoom = (booking?.details?.room as string | undefined) ?? '';
  const initialNotes = (booking?.details?.notes as string | undefined) ?? '';
  const initialWifiNetwork = wifi?.network ?? '';
  const initialWifiPassword = wifi?.password ?? '';
  const initialDate = linkedEvent?.date ?? '';
  // Each leg reads in its own endpoint's zone (ADR-0107): a flight's departure in
  // its origin, its arrival in its destination; a single-place booking in its
  // place. Falls back to the trip primary zone when no place resolves a zone.
  // A pinned zone (ADR-0107 §6) wins over the place's — it exists precisely for
  // when no place can answer (a coordless Place-lite, or nothing picked yet).
  const initialOverrides = bookingZoneOverrides(booking ?? undefined);
  const initStartOverride = initialOverrides.start ?? null;
  const initEndOverride = (isTransportType(initialType) ? initialOverrides.end : null) ?? null;
  const zoneOf = (id: string | undefined, override: string | null) =>
    override ?? placeTimezone(places, id) ?? trip.timezone;
  const initTransport = isTransportType(initialType);
  const initStartZone = initTransport
    ? zoneOf(initialFromPlaceId, initStartOverride)
    : zoneOf(initialPlaceId, initStartOverride);
  const initEndZone = initTransport
    ? zoneOf(initialToPlaceId, initEndOverride)
    : zoneOf(initialPlaceId, initStartOverride);
  const initialStart = linkedEvent?.startsAt
    ? isoToTimeInput(linkedEvent.startsAt, initStartZone)
    : '';
  const initialEnd = linkedEvent?.endsAt ? isoToTimeInput(linkedEvent.endsAt, initEndZone) : '';
  const initialSpanStart = linkedEvent?.startsAt
    ? isoToDateTimeLocal(linkedEvent.startsAt, initStartZone)
    : '';
  const initialSpanEnd = linkedEvent?.endsAt
    ? isoToDateTimeLocal(linkedEvent.endsAt, initEndZone)
    : '';
  const initialKind: 'hard' | 'soft' = linkedEvent?.kind ?? defaultKind(initialType);

  const [type, setType] = useState<BookingType>(initialType);
  const [iconTouched, setIconTouched] = useState(false);
  const [icon, setIcon] = useState(initialIcon);
  const [title, setTitle] = useState(initialTitle);
  const [code, setCode] = useState(initialCode);
  const [fromPlaceId, setFromPlaceId] = useState<string | undefined>(initialFromPlaceId);
  const [toPlaceId, setToPlaceId] = useState<string | undefined>(initialToPlaceId);
  const [placeId, setPlaceId] = useState<string | undefined>(initialPlaceId);
  const [startOverride, setStartOverride] = useState<string | null>(initStartOverride);
  const [endOverride, setEndOverride] = useState<string | null>(initEndOverride);
  const [room, setRoom] = useState(initialRoom);
  const [notes, setNotes] = useState(initialNotes);
  const [wifiNetwork, setWifiNetwork] = useState(initialWifiNetwork);
  const [wifiPassword, setWifiPassword] = useState(initialWifiPassword);
  // Non-transport scheduling: a single day + optional same-day time span.
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  // Span scheduling (transport departure/arrival, hotel check-in/check-out): two
  // explicit datetimes that may fall on different days.
  const [spanStart, setSpanStart] = useState(initialSpanStart);
  const [spanEnd, setSpanEnd] = useState(initialSpanEnd);
  const [kind, setKind] = useState<'hard' | 'soft'>(initialKind);
  const [kindTouched, setKindTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const suggestedZones = useMemo(
    () =>
      [...new Set([trip.timezone, ...places.map((p) => p.timezone).filter(Boolean)])] as string[],
    [trip.timezone, places],
  );

  const isTransport = isTransportType(type);
  const isHotel = type === BOOKING_TYPE.HOTEL;
  const isSpan = isSpanType(type);
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

  const dirty =
    type !== initialType ||
    icon !== initialIcon ||
    title !== initialTitle ||
    code !== initialCode ||
    fromPlaceId !== initialFromPlaceId ||
    toPlaceId !== initialToPlaceId ||
    placeId !== initialPlaceId ||
    room !== initialRoom ||
    notes !== initialNotes ||
    wifiNetwork !== initialWifiNetwork ||
    wifiPassword !== initialWifiPassword ||
    date !== initialDate ||
    start !== initialStart ||
    end !== initialEnd ||
    spanStart !== initialSpanStart ||
    spanEnd !== initialSpanEnd ||
    startOverride !== initStartOverride ||
    endOverride !== initEndOverride ||
    kind !== initialKind;
  const { guardedClose, prompting, confirmDiscard, cancelDiscard } = useUnsavedGuard(dirty);
  const requestClose = () => guardedClose(onClose);

  const changeType = (next: BookingType) => {
    setType(next);
    if (!iconTouched) setIcon(BOOKING_TYPE_ICON[next]);
    if (!kindTouched) setKind(defaultKind(next));
  };
  const pickKind = (k: 'hard' | 'soft') => {
    setKind(k);
    setKindTouched(true);
  };

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
              { startAt: spanStart, endAt: spanEnd, kind, icon, category },
              startZone,
              endZone,
            )
          : buildEventSeed({ date, start, end, kind, icon, category }, startZone);
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
          ...(startOverride !== initStartOverride && { startDisplayTimezone: startOverride }),
          ...((isTransport ? endOverride : null) !== initEndOverride && {
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
              icon={icon}
              // Booking icon is a badge only — the category comes from the type
              // (ADR-0038), so the picker's category suggestion is ignored here.
              onChange={(next) => {
                setIcon(next);
                setIconTouched(true);
              }}
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
            {iconTouched && (
              <button
                type="button"
                className="bs-revert"
                onClick={() => {
                  setIcon(BOOKING_TYPE_ICON[type]);
                  setIconTouched(false);
                }}
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
                <PlacePicker
                  value={fromPlaceId}
                  onChange={setFromPlaceId}
                  ariaLabel={t.index.form.originLabel}
                  placeholder={t.index.form.originShort}
                />
                <PlacePicker
                  value={toPlaceId}
                  onChange={setToPlaceId}
                  ariaLabel={t.index.form.destLabel}
                  placeholder={t.index.form.destShort}
                />
              </div>
              <div className="bs-route-hint">📍 {t.index.form.routeHint}</div>
            </Field>
          )}

          {/* "When" comes first (right after the identity row), through the one
              WhenField standard — a span for two-endpoint bookings, a single day
              otherwise. Never a cramped native datetime box (U-05). */}
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
              {spanStart && <KindToggle kind={kind} onPick={pickKind} />}
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
              {date && <KindToggle kind={kind} onPick={pickKind} />}
            </>
          )}

          {/* Single-place types carry a location; transport's places are its
              route endpoints above (ADR-0048). */}
          {!isTransport && (
            <Field label={t.index.sheet.locationLabel}>
              <PlacePicker value={placeId} onChange={setPlaceId} />
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
 *  Read-only here; the editable zone chip is a later slice. */
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
      🕐{' '}
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
          {t.index.form.kindHard}
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
        icon="🗑️"
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
      icon="🔗"
      title={t.index.del.linkedTitle}
      body={t.index.del.linkedBody}
      onCancel={onCancel}
    >
      {linkedIsHard && <p className="bs-hard-note">🔒 {t.index.del.hardNote}</p>}
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
