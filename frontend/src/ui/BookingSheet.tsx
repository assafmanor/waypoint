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
import { TimePicker } from './TimePicker';
import {
  mergeBookingDetails,
  deleteFlags,
  buildEventSeed,
  buildSpanSeed,
  findPlaceByName,
  isoToDateTimeLocal,
} from '../lib/booking-edit';
import { placeName } from '../lib/places';
import { isoToTimeInput } from '../lib/time';
import { BOOKING_TYPE_ICON, DEVICE_LOCALE } from '../constants';
import { t } from '../i18n/he';

interface Wifi {
  network?: string;
  password?: string;
}

const BOOKING_TYPES = Object.values(BOOKING_TYPE);
const isTransportType = (ty: BookingType) =>
  ty === BOOKING_TYPE.FLIGHT || ty === BOOKING_TYPE.TRAIN;
// Two-endpoint schedule (start + end, may span days): transport departure→arrival
// and a hotel check-in→check-out. Others are a single point on a day.
const isSpanType = (ty: BookingType) => isTransportType(ty) || ty === BOOKING_TYPE.HOTEL;

export function BookingSheet({
  booking,
  onClose,
}: {
  booking?: Booking | null;
  onClose: () => void;
}) {
  const { trip, events, places, indexVerbs } = useTrip();
  const isCreate = !booking;
  const linkedEvent = booking ? events.find((e) => e.bookingId === booking.id) : undefined;
  const initialType = booking?.type ?? BOOKING_TYPE.FLIGHT;
  const wifi = booking?.details?.wifi as Wifi | undefined;

  const [type, setType] = useState<BookingType>(initialType);
  const [iconTouched, setIconTouched] = useState(false);
  const [icon, setIcon] = useState(linkedEvent?.icon ?? BOOKING_TYPE_ICON[initialType]);
  const [category, setCategory] = useState<EventCategory>(
    linkedEvent?.category ?? BOOKING_TYPE_TO_CATEGORY[initialType],
  );
  const [title, setTitle] = useState(booking?.title ?? '');
  const [code, setCode] = useState(booking?.confirmationCode ?? '');
  const [origin, setOrigin] = useState(placeName(places, booking?.fromPlaceId) ?? '');
  const [dest, setDest] = useState(placeName(places, booking?.toPlaceId) ?? '');
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
    const finalTitle = title.trim();
    if (!finalTitle) return setError(t.index.form.titleRequired);
    const scheduleDate = isSpan ? spanStart.split('T')[0] : date;
    if (scheduleDate && (scheduleDate < trip.startDate || scheduleDate > trip.endDate)) {
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
        confirmationCode: code.trim() || undefined,
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
            <input
              className="bs-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.index.sheet.titlePlaceholder}
              aria-label={t.index.sheet.titlePlaceholder}
              autoFocus={isCreate}
            />
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
                ↺ {t.index.form.reset}
              </button>
            )}
          </div>

          <label className="bs-field">
            {t.index.sheet.codeLabel}
            <input dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>

          {isTransport && (
            <>
              <div className="bs-row2">
                <label className="bs-field">
                  {t.index.form.originLabel}
                  <input value={origin} onChange={(e) => setOrigin(e.target.value)} />
                </label>
                <label className="bs-field">
                  {t.index.form.destLabel}
                  <input value={dest} onChange={(e) => setDest(e.target.value)} />
                </label>
              </div>
              <div className="bs-route-hint">📍 {t.index.form.routeHint}</div>
            </>
          )}

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
              {/* A flight/train (departure→arrival) or a hotel stay (check-in→
                  check-out) has two endpoints that may fall on different days, so
                  each is a full datetime rather than a single same-day span. */}
              <label className="bs-field">
                {isHotel ? t.index.form.checkinLabel : t.index.form.departLabel}
                <input
                  type="datetime-local"
                  lang={DEVICE_LOCALE}
                  value={spanStart}
                  onChange={(e) => setSpanStart(e.target.value)}
                />
              </label>
              <label className="bs-field">
                {isHotel ? t.index.form.checkoutLabel : t.index.form.arriveLabel}
                <input
                  type="datetime-local"
                  lang={DEVICE_LOCALE}
                  value={spanEnd}
                  onChange={(e) => setSpanEnd(e.target.value)}
                />
              </label>
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

function DeletePrompt({
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
