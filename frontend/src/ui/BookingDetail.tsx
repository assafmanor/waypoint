// Booking detail view (ADR-0053) — tapping a booking opens this read-only sheet
// of facts with a visible "✏️ עריכה" button and a "⋯" menu (edit / delete),
// mirroring the event card. The read-only view is the guard for a hard
// commitment (ADR-0011); editing/deleting are deliberate. Edit opens the merged
// BookingSheet; Delete reuses the delete/unlink prompt (ADR-0047 §3).
import { useState } from 'react';
import { BOOKING_TYPE, type Booking, type BookingType } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { Sheet } from './Sheet';
import { DeletePrompt } from './BookingSheet';
import { deleteFlags } from '../lib/booking-edit';
import { placeName } from '../lib/places';
import { formatTime } from '../lib/time';
import { BOOKING_TYPE_ICON, CODE_PREFIX, DEVICE_LOCALE } from '../constants';
import { t } from '../i18n/he';

interface Wifi {
  network?: string;
  password?: string;
}

const isTransport = (ty: BookingType) => ty === BOOKING_TYPE.FLIGHT || ty === BOOKING_TYPE.TRAIN;

function timingLabels(ty: BookingType): { start: string; end: string } {
  if (ty === BOOKING_TYPE.HOTEL) {
    return { start: t.index.form.checkinLabel, end: t.index.form.checkoutLabel };
  }
  if (isTransport(ty)) return { start: t.index.form.departLabel, end: t.index.form.arriveLabel };
  return { start: t.index.form.startLabel, end: t.index.form.endLabel };
}

function dayTime(iso: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat(DEVICE_LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(iso));
  return `${day} · ${formatTime(iso, timeZone)}`;
}

export function BookingDetail({
  booking,
  onClose,
  onEdit,
}: {
  booking: Booking;
  onClose: () => void;
  onEdit: (booking: Booking) => void;
}) {
  const { trip, events, places, indexVerbs } = useTrip();
  const linkedEvent = events.find((e) => e.bookingId === booking.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tz = trip.timezone;
  const icon = linkedEvent?.icon ?? BOOKING_TYPE_ICON[booking.type];
  const wifi = booking.details?.wifi as Wifi | undefined;
  const room = booking.details?.room as string | undefined;
  const notes = booking.details?.notes as string | undefined;
  const from = placeName(places, booking.fromPlaceId);
  const to = placeName(places, booking.toPlaceId);
  const isSpan = !!linkedEvent?.endDate;
  const labels = timingLabels(booking.type);

  const heading =
    isTransport(booking.type) && (from || to) ? `${from ?? '-'} → ${to ?? '-'}` : booking.title;

  const edit = () => {
    onEdit(booking);
  };

  return (
    <>
      <Sheet ariaLabel={heading} onClose={onClose}>
        <div className="bk-detail">
          <div className="bk-actions">
            <button type="button" className="bk-edit" onClick={edit}>
              <span aria-hidden="true">✏️</span> {t.index.detail.edit}
            </button>
            <button
              type="button"
              className="bk-menu-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t.index.detail.actions}
              aria-expanded={menuOpen}
            >
              ⋯
            </button>
          </div>

          <div className="bk-head">
            <div className="bk-badge">{icon}</div>
            <div className="bk-headtext">
              <div className="bk-title" dir={isTransport(booking.type) ? 'ltr' : undefined}>
                {heading}
              </div>
              <div className="bk-type">{t.index.bookingType[booking.type]}</div>
            </div>
          </div>

          {menuOpen ? (
            <div className="row-actions bk-menu">
              <button type="button" className="row-action" onClick={edit}>
                <span className="row-action-ic" aria-hidden="true">
                  ✏️
                </span>
                {t.index.detail.edit}
              </button>
              <button
                type="button"
                className="row-action danger"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleting(true);
                }}
              >
                <span className="row-action-ic" aria-hidden="true">
                  🗑️
                </span>
                {t.index.detail.delete}
              </button>
            </div>
          ) : (
            <>
              {linkedEvent?.kind === 'hard' && (
                <div className="bs-hard-note">🔒 {t.index.detail.hardNote}</div>
              )}
              <div className="bk-facts">
                {!linkedEvent ? (
                  <Fact k={t.index.detail.timing} v={t.index.detail.unscheduled} />
                ) : isSpan ? (
                  <>
                    <Fact
                      k={labels.start}
                      v={linkedEvent.startsAt ? dayTime(linkedEvent.startsAt, tz) : '-'}
                    />
                    <Fact
                      k={labels.end}
                      v={linkedEvent.endsAt ? dayTime(linkedEvent.endsAt, tz) : '-'}
                    />
                  </>
                ) : (
                  <Fact
                    k={t.index.detail.timing}
                    v={linkedEvent.startsAt ? dayTime(linkedEvent.startsAt, tz) : linkedEvent.date}
                  />
                )}
                {booking.confirmationCode && (
                  <Fact
                    k={t.index.detail.code}
                    v={`${CODE_PREFIX}${booking.confirmationCode}`}
                    mono
                  />
                )}
                {booking.provider && <Fact k={t.index.detail.provider} v={booking.provider} />}
                {room && <Fact k={t.index.detail.room} v={room} />}
                {(wifi?.network || wifi?.password) && (
                  <Fact
                    k={t.index.detail.wifi}
                    v={[wifi.network, wifi.password].filter(Boolean).join(' · ')}
                    mono
                  />
                )}
                {notes && <Fact k={t.index.detail.notes} v={notes} />}
              </div>
            </>
          )}
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

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="bk-fact">
      <span className="bk-fact-k">{k}</span>
      <span className={'bk-fact-v' + (mono ? ' mono' : '')} dir={mono ? 'ltr' : undefined}>
        {v}
      </span>
    </div>
  );
}
