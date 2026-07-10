// Day-by-day — the interactive core. Hard/soft grammar, tap-to-expand quick
// verbs (optimistic + undo), the hard-event guard warning, the ripple bar, and
// the "maybe" shelf. Reads events for the active day from the trip context.
import { useState } from 'react';
import {
  EVENT_KIND,
  EVENT_STATUS,
  type Booking,
  type MaybeItem,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip, byStart } from '../state/trip-state';
import { useVerbs } from '../state/verbs';
import { useClock } from '../lib/useClock';
import { deriveNow, formatTime } from '../lib/time';
import { CODE_PREFIX, DELAY_STEP_MINUTES, ICONS, MS_PER_DAY } from '../constants';
import { t } from '../i18n/he';
import { TRIP_TZ_OFFSET, maybeMeta } from '../fixtures';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

export function DayView() {
  const { trip, events, maybeItems, bookings, activeDate, ripple } = useTrip();
  const verbs = useVerbs();
  const now = useClock();
  const [openId, setOpenId] = useState<string | null>(null);

  const nowId = deriveNow(events, now).now?.id;
  const dayEvents = events
    .filter((e) => e.date === activeDate && e.status !== EVENT_STATUS.SKIPPED)
    .sort(byStart);

  const dayNumber = daysBetween(trip.startDate, activeDate) + 1;
  const weekday = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    timeZone: trip.timezone,
  }).format(new Date(`${activeDate}T12:00:00${TRIP_TZ_OFFSET}`));

  return (
    <>
      {ripple && (
        <div className="ripple show">
          <span className="rt">{t.ripple.prompt(ripple.movedTitle)}</span>
          <button className="yes" onClick={verbs.rippleApply}>
            {t.common.yes}
          </button>
          <button className="no" onClick={verbs.rippleDismiss}>
            {t.common.no}
          </button>
        </div>
      )}

      <div className="sec-title">
        {t.day.heading(dayNumber, weekday, trip.destination)}
        <span className="hint">{t.day.tapToChange}</span>
      </div>

      <div>
        {dayEvents.map((e) => (
          <EventItem
            key={e.id}
            event={e}
            tz={trip.timezone}
            isNow={e.id === nowId}
            isOpen={openId === e.id}
            onToggle={() => setOpenId((id) => (id === e.id ? null : e.id))}
            booking={e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined}
            verbs={verbs}
          />
        ))}
      </div>

      <div className="sec-title">
        {t.day.maybeShelf}
        <span className="hint">{t.day.tapToSchedule}</span>
      </div>
      <div className="shelf">
        {maybeItems.map((m) => (
          <MaybeCard key={m.id} item={m} onSchedule={() => verbs.schedule(m)} />
        ))}
      </div>

      <p className="empty-note">
        {t.day.legendHardLead}
        <b>{t.day.legendHardWord}</b>
        {t.day.legendHardRest}
        <br />
        {t.day.legendSoftLead}
        <b>{t.day.legendSoftWord}</b>
        {t.day.legendSoftRest}
      </p>
    </>
  );
}

function EventItem({
  event,
  tz,
  isNow,
  isOpen,
  onToggle,
  booking,
  verbs,
}: {
  event: TripEvent;
  tz: string;
  isNow: boolean;
  isOpen: boolean;
  onToggle: () => void;
  booking?: Booking;
  verbs: ReturnType<typeof useVerbs>;
}) {
  const isHard = event.kind === EVENT_KIND.HARD;
  const isDone = event.status === EVENT_STATUS.DONE;
  const cls = [
    'item',
    event.kind === EVENT_KIND.SOFT ? 'soft' : '',
    isNow ? 'now' : '',
    isDone ? 'done' : '',
    isOpen ? 'open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const code = booking?.confirmationCode ? `${CODE_PREFIX}${booking.confirmationCode}` : undefined;
  const meta = [event.location, code && `${t.event.bookingLabel} ${code}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={cls}>
      <button className="face" onClick={onToggle} aria-expanded={isOpen}>
        <span className="badge">{event.icon}</span>
        <span className="main">
          <span className="t">
            {event.title}
            {isHard ? (
              <span className="tag-hard">
                {ICONS.lock} {t.event.hard}
              </span>
            ) : (
              <span className="tag-soft">{isNow ? t.event.softNow : t.event.soft}</span>
            )}
          </span>
          <span className="m">{meta}</span>
        </span>
        {event.startsAt && (
          <span className="time" dir="ltr">
            {formatTime(event.startsAt, tz)}
          </span>
        )}
        <span className="chev" aria-hidden="true" />
      </button>
      <div className="actions">
        <div className="act-row">
          {isDone ? (
            <>
              <button className="act" onClick={() => verbs.restore(event)}>
                {t.actions.restore}
              </button>
              <button className="act go" onClick={() => verbs.navigate(event)}>
                {t.actions.navigate}
              </button>
            </>
          ) : isHard ? (
            <>
              <button className="act go" onClick={() => verbs.navigate(event)}>
                {t.actions.navigate}
              </button>
              <button className="act" onClick={() => verbs.delay(event)}>
                {t.actions.delayBy(DELAY_STEP_MINUTES)}
              </button>
              <button className="act" onClick={() => verbs.onWay(event)}>
                {t.actions.onWay}
              </button>
            </>
          ) : (
            <>
              <button className="act" onClick={() => verbs.done(event)}>
                {t.actions.done}
              </button>
              <button className="act" onClick={() => verbs.skip(event)}>
                {t.actions.skip}
              </button>
              <button className="act" onClick={() => verbs.delay(event)}>
                {t.actions.delayBy(DELAY_STEP_MINUTES)}
              </button>
              <button className="act" onClick={() => verbs.swap(event)}>
                {t.actions.swap}
              </button>
              <button className="act go" onClick={() => verbs.navigate(event)}>
                {t.actions.navigate}
              </button>
            </>
          )}
        </div>
        {isHard && (
          <div className="hard-warn">
            {ICONS.warn} {t.event.hardWarn} {code && <span dir="ltr">{code}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function MaybeCard({ item, onSchedule }: { item: MaybeItem; onSchedule: () => void }) {
  return (
    <button
      className={'maybe' + (item.consumed ? ' consumed' : '')}
      onClick={onSchedule}
      disabled={item.consumed}
    >
      <span className="mi">{item.icon}</span>
      <span className="mt">{item.title}</span>
      <span className="mm">{maybeMeta(item.id)}</span>
      <span className="add">
        {item.consumed
          ? `${ICONS.done} ${t.actions.scheduled}`
          : `${ICONS.add} ${t.actions.scheduleToDay}`}
      </span>
    </button>
  );
}
