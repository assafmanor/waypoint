// Plan-mode Day-by-day — the itinerary BUILDER (modes.md; ADR-0025 Tier 3;
// mockups/plan-mode-v1.html). Trip mode follows/adjusts the day (quick verbs);
// Plan mode builds it — so rows are structural: tap (or the pencil) opens the
// edit sheet, ✎ edits, 🗑 deletes, and gap chips + the shelf fill the day.
//
// Editing reuses EventForm (add + edit, incl. hard↔soft flip, time, and
// cross-day via its date field). Retiming and moving across days happen there;
// one-tap drag/up-down reorder is a separate, decision-worthy piece (see the
// DEFERRED builder-reorder task) — the row order follows event times, as in
// Trip mode.
import { Fragment, useState } from 'react';
import { EVENT_KIND, EVENT_STATUS, type MaybeItem, type TripEvent } from '@waypoint/shared';
import { useTrip, byStart } from '../state/trip-state';
import { useVerbs } from '../state/verbs';
import { formatTime, isoToTimeInput } from '../lib/time';
import { CODE_PREFIX, ICONS, MS_PER_DAY, MINUTES_PER_HOUR } from '../constants';
import { t } from '../i18n/he';
import { TRIP_TZ_OFFSET, maybeMeta } from '../fixtures';
import { EventForm } from '../ui/EventForm';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

/** Only surface a gap worth filling — below this it's just breathing room. */
const GAP_MIN_MINUTES = 60;

type GapDefaults = { date: string; start: string; end: string };

// Minutes of dead time between one event's end and the next event's start, plus
// the wall-clock endpoints for prefilling a new event into the gap. Null unless
// both instants exist and the gap clears the threshold.
function gapBetween(
  a: TripEvent,
  b: TripEvent,
  tz: string,
): { minutes: number; fill: GapDefaults } | null {
  if (!a.endsAt || !b.startsAt) return null;
  const minutes = Math.round((Date.parse(b.startsAt) - Date.parse(a.endsAt)) / 60000);
  if (minutes < GAP_MIN_MINUTES) return null;
  return {
    minutes,
    fill: {
      date: a.date,
      start: isoToTimeInput(a.endsAt, tz),
      end: isoToTimeInput(b.startsAt, tz),
    },
  };
}

function gapLabel(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) return t.planDay.gapMinutes(minutes);
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  return hours === 1
    ? t.planDay.gapHour
    : hours === 2
      ? t.planDay.gapTwoHours
      : t.planDay.gapHours(hours);
}

export function PlanDay() {
  const { trip, events, maybeItems, bookings, activeDate } = useTrip();
  const verbs = useVerbs();
  const tz = trip.timezone;
  const [formTarget, setFormTarget] = useState<'new' | TripEvent | null>(null);
  const [gapFill, setGapFill] = useState<GapDefaults | null>(null);

  const dayEvents = events
    .filter((e) => e.date === activeDate && e.status !== EVENT_STATUS.SKIPPED)
    .sort(byStart);

  const dayNumber = daysBetween(trip.startDate, activeDate) + 1;
  const weekday = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    timeZone: trip.timezone,
  }).format(new Date(`${activeDate}T12:00:00${TRIP_TZ_OFFSET}`));

  const closeForm = () => {
    setFormTarget(null);
    setGapFill(null);
  };

  return (
    <div className="builder">
      <div className="builder-main">
        <div className="sec-title">
          {t.day.heading(dayNumber, weekday, trip.destination)}
          <span className="sec-title-end">
            <button className="new-event-btn" onClick={() => setFormTarget('new')}>
              {ICONS.add} {t.actions.newEvent}
            </button>
          </span>
        </div>

        {dayEvents.length === 0 ? (
          <div className="builder-empty">{t.planDay.empty}</div>
        ) : (
          <div>
            {dayEvents.map((e, i) => {
              const next = dayEvents[i + 1];
              const gap = next ? gapBetween(e, next, tz) : null;
              return (
                <Fragment key={e.id}>
                  <BuilderRow
                    event={e}
                    tz={tz}
                    booking={e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined}
                    onEdit={() => setFormTarget(e)}
                    onDelete={() => verbs.remove(e)}
                  />
                  {gap && (
                    <div className="gap">
                      <span className="gap-line" />
                      <button
                        className="gap-add"
                        onClick={() => {
                          setFormTarget('new');
                          setGapFill(gap.fill);
                        }}
                      >
                        {t.planDay.gap(gapLabel(gap.minutes))}
                      </button>
                      <span className="gap-line" />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}

        <button className="addbtn" onClick={() => setFormTarget('new')}>
          {ICONS.add} {t.planDay.addToDay(dayNumber)}
        </button>
      </div>

      <div className="builder-side">
        <div className="sec-title">
          {t.day.maybeShelf}
          <span className="hint">{t.day.tapToSchedule}</span>
        </div>
        <div className="shelf">
          {maybeItems.map((m) => (
            <MaybeCard key={m.id} item={m} onSchedule={() => verbs.schedule(m)} />
          ))}
        </div>
      </div>

      {formTarget && (
        <EventForm
          event={formTarget === 'new' ? null : formTarget}
          defaults={gapFill ?? undefined}
          onClose={closeForm}
        />
      )}
    </div>
  );
}

function BuilderRow({
  event,
  tz,
  booking,
  onEdit,
  onDelete,
}: {
  event: TripEvent;
  tz: string;
  booking?: { confirmationCode?: string };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isHard = event.kind === EVENT_KIND.HARD;
  const code = booking?.confirmationCode ? `${CODE_PREFIX}${booking.confirmationCode}` : undefined;
  const meta = [event.location, code && `${t.event.bookingLabel} ${code}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={'bld' + (isHard ? '' : ' soft')}>
      <span className="bld-bd" aria-hidden="true">
        {event.icon}
      </span>
      <button className="bld-main" onClick={onEdit}>
        <span className="bld-t">
          {event.title}
          {isHard ? (
            <span className="tag-hard">
              {ICONS.lock} {t.event.hard}
            </span>
          ) : (
            <span className="tag-soft">{t.event.soft}</span>
          )}
        </span>
        {meta && <span className="bld-m">{meta}</span>}
      </button>
      {event.startsAt && (
        <span className="bld-time" dir="ltr">
          {formatTime(event.startsAt, tz)}
        </span>
      )}
      <button className="bld-icon" onClick={onEdit} aria-label={t.actions.edit}>
        {ICONS.edit}
      </button>
      <button className="bld-icon danger" onClick={onDelete} aria-label={t.actions.delete}>
        {ICONS.trash}
      </button>
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
