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
import { deriveNow, formatTime, hardConflicts, zonedIso } from '../lib/time';
import { nextSlot } from '../lib/gaps';
import { CODE_PREFIX, DELAY_STEP_MINUTES, ICONS, MS_PER_DAY } from '../constants';
import { t } from '../i18n/he';
import { TRIP_TZ_OFFSET, maybeMeta } from '../fixtures';
import { EventForm } from '../ui/EventForm';
import { Sheet } from '../ui/Sheet';
import { TimePicker } from '../ui/TimePicker';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

export function DayView() {
  const { trip, events, maybeItems, bookings, activeDate, ripple } = useTrip();
  const verbs = useVerbs();
  const now = useClock();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<'new' | TripEvent | null>(null);
  const [scheduleItem, setScheduleItem] = useState<MaybeItem | null>(null);

  const nowId = deriveNow(events, now).now?.id;
  const dayEvents = events
    .filter((e) => e.date === activeDate && e.status !== EVENT_STATUS.SKIPPED)
    .sort(byStart);
  // ADR-0027 — the shelf is a parking lot: a skipped soft event parks here
  // (durable, reversible) instead of just vanishing. Scoped to the day it was
  // skipped on, alongside the unplaced maybe ideas.
  const skippedToday = events.filter(
    (e) => e.date === activeDate && e.kind === EVENT_KIND.SOFT && e.status === EVENT_STATUS.SKIPPED,
  );

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
        <span className="sec-title-end">
          <button className="new-event-btn" onClick={() => setFormTarget('new')}>
            {ICONS.add} {t.actions.newEvent}
          </button>
        </span>
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
            conflicts={hardConflicts(e, dayEvents)}
            verbs={verbs}
            onEdit={() => setFormTarget(e)}
          />
        ))}
      </div>

      {formTarget && (
        <EventForm
          event={formTarget === 'new' ? null : formTarget}
          onClose={() => setFormTarget(null)}
        />
      )}

      <div className="sec-title">
        {t.day.maybeShelf}
        <span className="hint">{t.day.tapToSchedule}</span>
      </div>
      <div className="shelf">
        {/* Scheduled (consumed) ideas leave the shelf — no dead tombstone (ADR-0027). */}
        {maybeItems
          .filter((m) => !m.consumed)
          .map((m) => (
            <MaybeCard key={m.id} item={m} onSchedule={() => setScheduleItem(m)} />
          ))}
        {/* Skipped soft events park here, restorable (ADR-0027 parking lot). */}
        {skippedToday.map((e) => (
          <button
            key={e.id}
            className="maybe skipped-card"
            onClick={() => verbs.restore(e)}
            title={t.day.skippedTag}
          >
            <span className="mi">{e.icon}</span>
            <span className="mt">{e.title}</span>
            <span className="mm">{t.day.skippedTag}</span>
            <span className="add">
              {ICONS.restore} {t.actions.restore}
            </span>
          </button>
        ))}
      </div>

      {scheduleItem && (
        <ScheduleSheet
          item={scheduleItem}
          defaults={nextSlot(dayEvents, activeDate, trip.timezone)}
          onConfirm={(start, end) => {
            verbs.schedule(scheduleItem, {
              date: activeDate,
              title: scheduleItem.title,
              kind: EVENT_KIND.SOFT,
              startsAt: start ? zonedIso(activeDate, start, trip.timezone) : undefined,
              endsAt: end ? zonedIso(activeDate, end, trip.timezone) : undefined,
            });
            setScheduleItem(null);
          }}
          onClose={() => setScheduleItem(null)}
        />
      )}
    </>
  );
}

// Trip-mode quick-schedule: tap a shelf idea, adjust the prefilled time, done
// (ADR-0025 Tier-1). Just the time — day/kind/location is Plan-mode building.
function ScheduleSheet({
  item,
  defaults,
  onConfirm,
  onClose,
}: {
  item: MaybeItem;
  defaults: { start: string; end: string };
  onConfirm: (start: string, end: string) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  return (
    <Sheet title={t.day.scheduleTitle(item.title)} onClose={onClose}>
      <TimePicker
        start={start}
        end={end}
        onChange={(next) => {
          setStart(next.start);
          setEnd(next.end);
        }}
      />
      <button type="button" className="sched-confirm" onClick={() => onConfirm(start, end)}>
        {ICONS.schedule} {t.actions.scheduleToDay}
      </button>
    </Sheet>
  );
}

function EventItem({
  event,
  tz,
  isNow,
  isOpen,
  onToggle,
  booking,
  conflicts,
  verbs,
  onEdit,
}: {
  event: TripEvent;
  tz: string;
  isNow: boolean;
  isOpen: boolean;
  onToggle: () => void;
  booking?: Booking;
  conflicts: TripEvent[];
  verbs: ReturnType<typeof useVerbs>;
  onEdit: () => void;
}) {
  const isHard = event.kind === EVENT_KIND.HARD;
  const isDone = event.status === EVENT_STATUS.DONE;
  // Tier-2 structural edits (edit details, delete) don't belong on the exposed
  // quick-verb strip in Trip mode — ADR-0025 puts them behind a per-item bottom
  // sheet ("unlock this one thing"), the same ⋯ affordance Plan mode's rows use.
  // The inline row keeps only Tier-1 on-the-ground verbs.
  const [menuOpen, setMenuOpen] = useState(false);
  const runAction = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };
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
          {conflicts.length > 0 && (
            <span className="conflict-flag">
              {ICONS.warn}{' '}
              {t.event.conflictWarn(conflicts[0].title, formatTime(conflicts[0].startsAt!, tz))}
            </span>
          )}
        </span>
        {event.startsAt && (
          <span className="time" dir="ltr">
            {formatTime(event.startsAt, tz)}
            {event.endsAt && `–${formatTime(event.endsAt, tz)}`}
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
              <button className="act" onClick={() => verbs.onWay(event)}>
                {t.actions.onWay}
              </button>
              <button className="act" onClick={() => verbs.delay(event)}>
                {t.actions.delayBy(DELAY_STEP_MINUTES)}
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
              <div className="act stepper">
                <button
                  className="step"
                  onClick={() => verbs.earlier(event)}
                  aria-label={t.actions.earlierBy(DELAY_STEP_MINUTES)}
                >
                  −
                </button>
                <span className="step-label">{t.actions.stepMinutes(DELAY_STEP_MINUTES)}</span>
                <button
                  className="step"
                  onClick={() => verbs.delay(event)}
                  aria-label={t.actions.delayBy(DELAY_STEP_MINUTES)}
                >
                  +
                </button>
              </div>
              <button className="act go" onClick={() => verbs.navigate(event)}>
                {t.actions.navigate}
              </button>
            </>
          )}
          <span className="act-row-end">
            <button
              className="act icon-only more"
              onClick={() => setMenuOpen(true)}
              aria-label={t.actions.more}
            >
              {ICONS.more}
            </button>
          </span>
        </div>
        {isHard && (
          <div className="hard-warn">
            {ICONS.warn} {t.event.hardWarn} {code && <span dir="ltr">{code}</span>}
          </div>
        )}
      </div>
      {menuOpen && (
        <Sheet title={event.title} onClose={() => setMenuOpen(false)}>
          <div className="row-actions">
            {/* Swap is Tier-1 but low-frequency on the ground (it kicks you to the
                shelf to pick a replacement) — kept reachable here so the inline
                strip stays to the forward verbs. Soft events only. */}
            {!isDone && !isHard && (
              <button className="row-action" onClick={() => runAction(() => verbs.swap(event))}>
                <span className="row-action-ic" aria-hidden="true">
                  {ICONS.swap}
                </span>
                {t.actions.swap}
              </button>
            )}
            <button className="row-action" onClick={() => runAction(onEdit)}>
              <span className="row-action-ic" aria-hidden="true">
                {ICONS.edit}
              </span>
              {t.actions.edit}
            </button>
            <button
              className="row-action danger"
              onClick={() => runAction(() => verbs.remove(event))}
            >
              <span className="row-action-ic" aria-hidden="true">
                {ICONS.trash}
              </span>
              {t.actions.delete}
            </button>
          </div>
        </Sheet>
      )}
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
