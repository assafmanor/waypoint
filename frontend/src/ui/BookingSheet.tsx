// Booking edit sheet + delete/unlink prompt (ADR-0047). Edits a booking's
// reference details (title, code, notes, hotel room/WiFi) via the optimistic
// indexVerbs; scheduling (date/time), the IconPicker and place authoring are the
// booking-form checkpoint. Delete surfaces the delete-both-vs-unlink choice when
// the booking is tied to an itinerary event (ADR-0047 §3).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BOOKING_TYPE, type Booking } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { Sheet } from './Sheet';
import { mergeBookingDetails, deleteFlags } from '../lib/booking-edit';
import { formatTime, todayInTz } from '../lib/time';
import { useClock } from '../lib/useClock';
import { BOOKING_TYPE_ICON, MS_PER_DAY } from '../constants';
import { t } from '../i18n/he';

interface Wifi {
  network?: string;
  password?: string;
}

export function BookingSheet({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { trip, events, indexVerbs } = useTrip();
  const now = useClock();
  const linkedEvent = events.find((e) => e.bookingId === booking.id);
  const isHotel = booking.type === BOOKING_TYPE.HOTEL;
  const wifi = booking.details?.wifi as Wifi | undefined;

  const [title, setTitle] = useState(booking.title);
  const [code, setCode] = useState(booking.confirmationCode ?? '');
  const [room, setRoom] = useState((booking.details?.room as string | undefined) ?? '');
  const [notes, setNotes] = useState((booking.details?.notes as string | undefined) ?? '');
  const [wifiNetwork, setWifiNetwork] = useState(wifi?.network ?? '');
  const [wifiPassword, setWifiPassword] = useState(wifi?.password ?? '');
  const [deleting, setDeleting] = useState(false);

  const icon = linkedEvent?.icon ?? BOOKING_TYPE_ICON[booking.type];

  const save = () => {
    void indexVerbs.updateBooking(booking.id, {
      title: title.trim() || booking.title,
      confirmationCode: code.trim() || undefined,
      details: mergeBookingDetails(booking.details, {
        room: isHotel ? room : undefined,
        notes,
        wifiNetwork: isHotel ? wifiNetwork : undefined,
        wifiPassword: isHotel ? wifiPassword : undefined,
      }),
    });
    onClose();
  };

  return (
    <>
      <Sheet ariaLabel={t.index.sheet.editTitle} onClose={onClose}>
        <div className="booking-sheet">
          <div className="titlerow">
            <span className="bs-icon" aria-hidden="true">
              {icon}
            </span>
            <input
              className="bs-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.index.sheet.titlePlaceholder}
              aria-label={t.index.sheet.titlePlaceholder}
            />
          </div>

          <div className="bs-schedule">
            {linkedEvent
              ? t.index.sheet.scheduledOn(
                  scheduleLabel(linkedEvent, trip.startDate, trip.timezone, now),
                )
              : t.index.sheet.notScheduled}
          </div>

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

          <div className="bs-actions">
            <button type="button" className="bs-cancel" onClick={onClose}>
              {t.index.sheet.cancel}
            </button>
            <button type="button" className="bs-save" onClick={save}>
              {t.index.sheet.save}
            </button>
          </div>
          <button type="button" className="bs-delete" onClick={() => setDeleting(true)}>
            🗑️ {t.index.sheet.delete}
          </button>
        </div>
      </Sheet>

      {deleting && (
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

/** "היום · 09:00" / "יום 3 · 09:00" for the read-only schedule line. */
function scheduleLabel(
  event: { date: string; startsAt?: string },
  startDate: string,
  timezone: string,
  now: Date,
): string {
  const today = todayInTz(timezone, now);
  const dayNumber = Math.round((Date.parse(event.date) - Date.parse(startDate)) / MS_PER_DAY) + 1;
  const dayLabel = event.date === today ? t.index.today : t.index.dayN(dayNumber);
  const time = event.startsAt ? formatTime(event.startsAt, timezone) : null;
  return time ? `${dayLabel} · ${time}` : dayLabel;
}
