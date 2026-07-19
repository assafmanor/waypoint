// Booking form (ADR-0047/0048) — one merged sheet for create and edit. Fields:
// type (create only), IconPicker glyph + derived category, title, confirmation
// code, transport origin/destination (each a name-only Place, authored on save),
// hotel room/WiFi, notes, and an optional date/time that seeds the linked
// itinerary event (the backend upserts it). Delete surfaces the delete-both-vs-
// unlink choice when a booking is tied to an event (ADR-0047 §3).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BOOKING_TYPE,
  BOOKING_TYPE_TO_CATEGORY,
  EVENT_KIND,
  type Booking,
  type BookingType,
  type EventCategory,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { Sheet } from './Sheet';
import { IconPicker } from './IconPicker';
import { Icon } from './Icon';
import { NavArrow } from './NavArrow';
import { TimePicker } from './TimePicker';
import {
  mergeBookingDetails,
  deleteFlags,
  buildEventSeed,
  buildSpanSeed,
  dateOutOfTripRange,
  findPlaceByName,
  isoToDateTimeLocal,
  routeTitle,
} from '../lib/booking-edit';
import { placeName } from '../lib/places';
import { isoToTimeInput } from '../lib/time';
import { timingLabels } from '../lib/booking-timing';
import { BOOKING_TYPE_ICON, DEVICE_LOCALE } from '../constants';
import { t } from '../i18n/he';

interface Wifi {
  network?: string;
  password?: string;
}

const BOOKING_TYPES = Object.values(BOOKING_TYPE);
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

  const [type, setType] = useState<BookingType>(initialType);
  const [iconTouched, setIconTouched] = useState(false);
  const [icon, setIcon] = useState(linkedEvent?.icon ?? BOOKING_TYPE_ICON[initialType]);
  const [category, setCategory] = useState<EventCategory>(
    linkedEvent?.category ?? BOOKING_TYPE_TO_CATEGORY[initialType],
  );
  const [title, setTitle] = useState(booking?.title ?? '');
  const [code, setCode] = useState(booking?.confirmationCode ?? '');
  const [origin, setOrigin] = useState(
    placeName(places, booking?.fromPlaceId) ?? seed?.origin ?? '',
  );
  const [dest, setDest] = useState(placeName(places, booking?.toPlaceId) ?? seed?.dest ?? '');
  const [room, setRoom] = useState((booking?.details?.room as string | undefined) ?? '');
  const [notes, setNotes] = useState((booking?.details?.notes as string | undefined) ?? '');
  const [wifiNetwork, setWifiNetwork] = useState(wifi?.network ?? '');
  const [wifiPassword, setWifiPassword] = useState(wifi?.password ?? '');
  // Non-transport scheduling: a single day + optional same-day time span.
  const [date, setDate] = useState(linkedEvent?.date ?? '');
  const [start, setStart] = useState(
    linkedEvent?.startsAt ? isoToTimeInput(linkedEvent.startsAt, trip.timezone) : '',
  );
  const [end, setEnd] = useState(
    linkedEvent?.endsAt ? isoToTimeInput(linkedEvent.endsAt, trip.timezone) : '',
  );
  // Span scheduling (transport departure/arrival, hotel check-in/check-out): two
  // explicit datetimes that may fall on different days.
  const [spanStart, setSpanStart] = useState(
    linkedEvent?.startsAt ? isoToDateTimeLocal(linkedEvent.startsAt, trip.timezone) : '',
  );
  const [spanEnd, setSpanEnd] = useState(
    linkedEvent?.endsAt ? isoToDateTimeLocal(linkedEvent.endsAt, trip.timezone) : '',
  );
  const defaultKind = (ty: BookingType) => (isSpanType(ty) ? EVENT_KIND.HARD : EVENT_KIND.SOFT);
  const [kind, setKind] = useState<'hard' | 'soft'>(linkedEvent?.kind ?? defaultKind(initialType));
  const [kindTouched, setKindTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isTransport = isTransportType(type);
  const isHotel = type === BOOKING_TYPE.HOTEL;
  const isSpan = isSpanType(type);
  // Bound the span datetime-local inputs to the trip's day range (matches the
  // single-date input's min/max); datetime-local honours "YYYY-MM-DDTHH:MM".
  const spanMin = `${trip.startDate}T00:00`;
  const spanMax = `${trip.endDate}T23:59`;

  const changeType = (next: BookingType) => {
    setType(next);
    if (!iconTouched) {
      setIcon(BOOKING_TYPE_ICON[next]);
      setCategory(BOOKING_TYPE_TO_CATEGORY[next]);
    }
    if (!kindTouched) setKind(defaultKind(next));
  };
  const pickKind = (k: 'hard' | 'soft') => {
    setKind(k);
    setKindTouched(true);
  };

  const resolvePlaceId = async (name: string): Promise<string | undefined> => {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    return (
      findPlaceByName(places, trimmed)?.id ?? (await indexVerbs.createPlace({ name: trimmed }))
    );
  };

  const save = async () => {
    // Transport is identified by its route, not a name (ADR-0059 §3): derive the
    // stored title from origin→destination (it backs the linked event's title and
    // any place-less fallback), so a flight never carries a hand-typed name.
    let finalTitle: string;
    if (isTransport) {
      finalTitle = routeTitle(origin, dest, t.arrows.route);
      if (!finalTitle) return setError(t.index.form.routeRequired);
    } else {
      finalTitle = title.trim();
      if (!finalTitle) return setError(t.index.form.titleRequired);
    }
    const outOfRange = (v: string) => dateOutOfTripRange(v, trip.startDate, trip.endDate);
    if (isSpan ? outOfRange(spanStart) || outOfRange(spanEnd) : outOfRange(date)) {
      return setError(t.index.form.dateOutOfRange);
    }
    setSaving(true);
    try {
      // Author places before the booking that FK-references them (see createPlace).
      const fromPlaceId = isTransport ? await resolvePlaceId(origin) : undefined;
      const toPlaceId = isTransport ? await resolvePlaceId(dest) : undefined;
      const details = mergeBookingDetails(booking?.details, {
        room: isHotel ? room : undefined,
        notes,
        wifiNetwork: isHotel ? wifiNetwork : undefined,
        wifiPassword: isHotel ? wifiPassword : undefined,
      });
      const event = isSpan
        ? buildSpanSeed({ startAt: spanStart, endAt: spanEnd, kind, icon, category }, trip.timezone)
        : buildEventSeed({ date, start, end, kind, icon, category }, trip.timezone);
      const base = {
        title: finalTitle,
        // Send the trimmed value even when empty: an empty string is the explicit
        // "clear the code" intent (undefined would be dropped by JSON.stringify and
        // read as "leave unchanged"). The backend normalizes empty → null.
        confirmationCode: code.trim(),
        details,
        event,
      };
      if (isCreate) {
        await indexVerbs.createBooking({ type, ...base, fromPlaceId, toPlaceId });
      } else {
        await indexVerbs.updateBooking(booking.id, {
          ...base,
          ...(isTransport ? { fromPlaceId, toPlaceId } : {}),
        });
      }
      onClose();
    } catch {
      setSaving(false); // the verb already toasted + rolled back
    }
  };

  return (
    <>
      <Sheet
        ariaLabel={isCreate ? t.index.form.createTitle : t.index.sheet.editTitle}
        onClose={onClose}
      >
        <div className="booking-sheet">
          {isCreate && (
            <div className="bs-typesel">
              {BOOKING_TYPES.map((ty) => (
                <button
                  key={ty}
                  type="button"
                  className={'bs-typecard' + (ty === type ? ' on' : '')}
                  onClick={() => changeType(ty)}
                >
                  <span className="bs-typecard-ic" aria-hidden="true">
                    {BOOKING_TYPE_ICON[ty]}
                  </span>
                  <span className="bs-typecard-lbl">{t.index.bookingType[ty]}</span>
                </button>
              ))}
            </div>
          )}

          <div className="titlerow">
            <IconPicker
              icon={icon}
              onChange={(next, cat) => {
                setIcon(next);
                if (cat) setCategory(cat);
                setIconTouched(true);
              }}
            />
            {isTransport ? (
              // A flight's identity is its route, not a name (ADR-0059 §3): the two
              // route endpoints ARE the title row — editable inputs beside the icon,
              // not a read-only preview that reads as a tappable title.
              <div className="bs-route-inputs">
                <input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder={t.index.form.originShort}
                  aria-label={t.index.form.originLabel}
                  autoFocus={isCreate}
                />
                <span className="arr" aria-hidden="true">
                  <NavArrow variant="forward" />
                </span>
                <input
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  placeholder={t.index.form.destShort}
                  aria-label={t.index.form.destLabel}
                />
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
                  setCategory(BOOKING_TYPE_TO_CATEGORY[type]);
                  setIconTouched(false);
                }}
              >
                <Icon name="reset" /> {t.index.form.reset}
              </button>
            )}
          </div>

          {/* The route endpoints live in the title row above; this only adds the
              place-picker hint under them. */}
          {isTransport && <div className="bs-route-hint">📍 {t.index.form.routeHint}</div>}

          <label className="bs-field">
            {t.index.sheet.codeLabel}
            <input dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>

          {isHotel && (
            <>
              <label className="bs-field">
                {t.index.sheet.roomLabel}
                <input value={room} onChange={(e) => setRoom(e.target.value)} />
              </label>
              <div className="bs-wifi">
                <div className="bs-wifi-head">
                  📶 {t.index.sheet.wifiTitle}
                  <span className="bs-hint"> · {t.index.sheet.wifiHotelOnly}</span>
                </div>
                <div className="bs-row2">
                  <label className="bs-field">
                    {t.index.sheet.wifiNetwork}
                    <input
                      dir="ltr"
                      value={wifiNetwork}
                      onChange={(e) => setWifiNetwork(e.target.value)}
                    />
                  </label>
                  <label className="bs-field">
                    {t.index.sheet.wifiPassword}
                    <input
                      dir="ltr"
                      value={wifiPassword}
                      onChange={(e) => setWifiPassword(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </>
          )}

          <label className="bs-field">
            {t.index.sheet.notesLabel}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {isSpan ? (
            <>
              {/* Two endpoints (flight departure→arrival, hotel check-in→check-out,
                  activity start→end) that may fall on different days — each a full
                  datetime, side by side. dir=ltr keeps the date+time reading L→R. */}
              <div className="bs-row2">
                <label className="bs-field">
                  {spanLabels(type).start}
                  <input
                    type="datetime-local"
                    dir="ltr"
                    lang={DEVICE_LOCALE}
                    min={spanMin}
                    max={spanMax}
                    value={spanStart}
                    onChange={(e) => setSpanStart(e.target.value)}
                  />
                </label>
                <label className="bs-field">
                  {spanLabels(type).end}
                  <input
                    type="datetime-local"
                    dir="ltr"
                    lang={DEVICE_LOCALE}
                    min={spanMin}
                    max={spanMax}
                    value={spanEnd}
                    onChange={(e) => setSpanEnd(e.target.value)}
                  />
                </label>
              </div>
              {spanStart && <KindToggle kind={kind} onPick={pickKind} />}
            </>
          ) : (
            <>
              <label className="bs-field">
                {t.index.form.dateLabel}
                <input
                  type="date"
                  lang={DEVICE_LOCALE}
                  min={trip.startDate}
                  max={trip.endDate}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              {date && (
                <>
                  <TimePicker
                    start={start}
                    end={end}
                    onChange={(next) => {
                      setStart(next.start);
                      setEnd(next.end);
                    }}
                  />
                  <KindToggle kind={kind} onPick={pickKind} />
                </>
              )}
            </>
          )}

          {error && <p className="bs-error">{error}</p>}

          <div className="bs-actions">
            <button type="button" className="bs-save" onClick={save} disabled={saving}>
              {t.index.sheet.save}
            </button>
            <button type="button" className="bs-cancel" onClick={onClose}>
              {t.index.sheet.cancel}
            </button>
          </div>
          {!isCreate && (
            <button type="button" className="bs-delete" onClick={() => setDeleting(true)}>
              🗑️ {t.index.sheet.delete}
            </button>
          )}
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
    </>
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
    <div className="bs-field">
      {t.index.form.kindLabel}
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
    </div>
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
  // Portalled to <body> with a lifted z-index so it sits above the booking
  // Sheet's own body-portalled overlay (both are z-20 otherwise, and the sheet,
  // being in the DOM, would win hit-testing).
  const body = !hasLinkedEvent ? (
    <div className="confirm-overlay bs-modal-overlay" onClick={onCancel}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={t.index.del.plainTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-title">🗑️ {t.index.del.plainTitle}</div>
        <p className="confirm-body">{t.index.del.plainBody}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onCancel}>
            {t.index.del.cancel}
          </button>
          <button className="confirm-ok bs-danger-ok" onClick={() => onChoose('unlink')}>
            {t.index.del.confirmDelete}
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div className="confirm-overlay bs-modal-overlay" onClick={onCancel}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={t.index.del.linkedTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-title">🔗 {t.index.del.linkedTitle}</div>
        <p className="confirm-body">{t.index.del.linkedBody}</p>
        {linkedIsHard && <p className="bs-hard-note">🔒 {t.index.del.hardNote}</p>}
        <div className="bs-choices">
          <button className="bs-choice danger" onClick={() => onChoose('both')}>
            <div className="bs-choice-t">{t.index.del.both}</div>
            <div className="bs-choice-s">{t.index.del.bothSub}</div>
          </button>
          <button className="bs-choice" onClick={() => onChoose('unlink')}>
            <div className="bs-choice-t">{t.index.del.unlink}</div>
            <div className="bs-choice-s">{t.index.del.unlinkSub}</div>
          </button>
        </div>
        <button className="confirm-cancel bs-choice-cancel" onClick={onCancel}>
          {t.index.del.cancel}
        </button>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
