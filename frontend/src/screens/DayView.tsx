// Day-by-day — the interactive core. Hard/soft grammar, tap-to-expand quick
// verbs (optimistic + undo), the hard-event guard warning, the ripple bar, and
// the "maybe" shelf. Reads events for the active day from the trip context.
//
// Presentation is derived from the clock, never stored (ADR-0027/0043): a
// now-line marks the current moment on today and the view lands on it; events
// recede once passed; a passed-but-unmarked soft event offers an inline settle
// ("we did this / skip"); the ±30 nudge only offers moves that are possible; and
// a past day reads as a read-only archive (ADR-0029), editing gated to Plan.
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  EVENT_KIND,
  EVENT_STATUS,
  type Booking,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip, byStart } from '../state/trip-state';
import { eventPlaceName } from '../lib/places';
import { useVerbs } from '../state/verbs';
import { useClock } from '../lib/useClock';
import {
  buildTimeTree,
  eventPhase,
  formatTime,
  hardConflicts,
  todayInTz,
  zonedIso,
  resolveEndIso,
  crossesMidnight,
  type EventPhase,
  type TimeGroup,
  type TimeItem,
} from '../lib/time';
import { nextSlot } from '../lib/gaps';
import { ambientEventsOnDate } from '../lib/glance';
import { CODE_PREFIX, DELAY_STEP_MINUTES, ICONS, MS_PER_DAY } from '../constants';
import { t } from '../i18n/he';
import { TRIP_TZ_OFFSET, maybeMeta } from '../fixtures';
import { EventForm } from '../ui/EventForm';
import { BookingSheet } from '../ui/BookingSheet';
import { Sheet } from '../ui/Sheet';
import { TimePicker } from '../ui/TimePicker';
import { Icon } from '../ui/Icon';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

type DayScope = 'past' | 'today' | 'future';

/** Chronological end of a top-level group, for placing the now-line above the
 *  first group that isn't fully behind us. */
function groupEndMs(g: TimeGroup): number {
  if (g.kind === 'cluster') return g.endMs;
  const e = g.item.event;
  return e.endsAt ? Date.parse(e.endsAt) : Date.parse(e.startsAt!);
}

const groupKey = (g: TimeGroup) =>
  g.kind === 'cluster' ? `cl-${g.items[0].event.id}` : g.item.event.id;

export function DayView() {
  const { trip, events, maybeItems, bookings, places, activeDate, ripple, setActiveDate } =
    useTrip();
  const verbs = useVerbs();
  const now = useClock();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<'new' | TripEvent | null>(null);
  // Editing a booking-linked event opens the merged BookingSheet, not EventForm
  // (ADR-0053 §2) — the same surface as editing from the Index.
  const [bookingTarget, setBookingTarget] = useState<Booking | null>(null);
  const [scheduleItem, setScheduleItem] = useState<MaybeItem | null>(null);

  const today = todayInTz(trip.timezone, now);
  const dayScope: DayScope = activeDate < today ? 'past' : activeDate > today ? 'future' : 'today';
  // A past day is a read-only archive within a live trip (ADR-0029): create /
  // edit / delete / move are locked; Done / Skip / Navigate stay.
  const readOnly = dayScope === 'past';

  const dayEvents = events
    .filter((e) => e.date === activeDate && e.status !== EVENT_STATUS.SKIPPED && !e.endDate)
    .sort(byStart);
  // Ambient-span stays (a hotel, ADR-0054) are backdrop, not timeline rows: shown
  // as a strip on every night they cover (not just check-in), never as a block.
  const ambientStays = ambientEventsOnDate(events, activeDate);
  const stayNights = (e: TripEvent) =>
    Math.max(1, Math.round((Date.parse(e.endDate!) - Date.parse(e.date)) / MS_PER_DAY));
  const stayNight = (e: TripEvent) =>
    Math.min(
      stayNights(e),
      Math.round((Date.parse(activeDate) - Date.parse(e.date)) / MS_PER_DAY) + 1,
    );
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
  const heading = t.day.heading(dayNumber, weekday, trip.destination);

  const dayCtx: DayCtx = {
    tz: trip.timezone,
    now,
    readOnly,
    openId,
    toggle: (id) => setOpenId((cur) => (cur === id ? null : id)),
    bookings,
    places,
    dayEvents,
    verbs,
    onEdit: (e) => {
      const booking = e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined;
      if (booking) setBookingTarget(booking);
      else setFormTarget(e);
    },
  };

  // The now-line: only on today (a past/future day has no "now"). It sits above
  // the first top-level group that isn't fully behind us; if every group is
  // passed it falls after them all.
  const groups = buildTimeTree(dayEvents);
  const showNowLine = dayScope === 'today';
  let nowLineIndex = groups.findIndex((g) => groupEndMs(g) > now.getTime());
  if (nowLineIndex === -1) nowLineIndex = groups.length;

  // Land on now: scroll the now-line into view once per day-open (today only), a
  // passed event or two left peeking above. Keyed on the viewed day — never on
  // the clock tick — so it doesn't fight a manual scroll. Instant under
  // reduced-motion.
  const nowLineRef = useRef<HTMLDivElement>(null);
  const isToday = dayScope === 'today';
  useEffect(() => {
    if (!isToday) return;
    const el = nowLineRef.current;
    if (!el) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [activeDate, isToday]);

  const untimed = dayEvents.filter((e) => !e.startsAt);

  return (
    <>
      {ripple && (
        <div className="ripple show">
          <span className="rt">{t.ripple.prompt(ripple.movedTitle, ripple.direction)}</span>
          <button className="yes" onClick={verbs.rippleApply}>
            {t.common.yes}
          </button>
          <button className="no" onClick={verbs.rippleDismiss}>
            {t.common.no}
          </button>
        </div>
      )}

      {readOnly && (
        <div className="archive-banner">
          <span className="ab-ic" aria-hidden="true">
            📖
          </span>
          <span className="ab-main">
            {heading} · {t.day.archiveTag}
          </span>
          <button className="ab-back" onClick={() => setActiveDate(today)}>
            {t.header.backToToday}
          </button>
        </div>
      )}

      <div className="sec-title">
        {heading}
        <span className="sec-title-end">
          {/* Trip-mode add is a Tier-1 quick soft-add for today (ADR-0025/0043),
              prefilled at the next open slot; heavy building lives in Plan.
              Locked on a past day (create gated, ADR-0029). */}
          {!readOnly && (
            <button className="new-event-btn" onClick={() => setFormTarget('new')}>
              {ICONS.add} {t.actions.newEvent}
            </button>
          )}
        </span>
      </div>

      {ambientStays.length > 0 && (
        <div className="day-ambient">
          {ambientStays.map((e) => (
            <div className="ambient" key={e.id}>
              <span className="ai" aria-hidden="true">
                {e.icon ?? '🏨'}
              </span>
              <span className="an">{e.title}</span>
              <span className="as">{t.glance.ambientNight(stayNight(e), stayNights(e))}</span>
            </div>
          ))}
        </div>
      )}

      <div className={'day-list' + (readOnly ? ' archive' : '')}>
        {/* Overlapping events render as the concurrency forest (ADR-0041): nests
            for containment, quiet clusters for partial overlap. The now-line is
            interleaved at the top level; untimed events have no span to place, so
            they stay plain leaf rows at the end. */}
        {groups.map((g, i) => (
          <Fragment key={groupKey(g)}>
            {showNowLine && i === nowLineIndex && (
              <NowLine ref={nowLineRef} now={now} tz={trip.timezone} />
            )}
            <GroupNode group={g} depth={0} ctx={dayCtx} />
          </Fragment>
        ))}
        {showNowLine && nowLineIndex === groups.length && (
          <NowLine ref={nowLineRef} now={now} tz={trip.timezone} />
        )}
        {untimed.map((e) => (
          <ItemNode key={e.id} item={{ event: e, children: [] }} depth={0} ctx={dayCtx} />
        ))}
      </div>

      {formTarget && (
        <EventForm
          event={formTarget === 'new' ? null : formTarget}
          defaults={
            formTarget === 'new' ? nextSlot(dayEvents, activeDate, trip.timezone) : undefined
          }
          onClose={() => setFormTarget(null)}
        />
      )}

      {bookingTarget && (
        <BookingSheet booking={bookingTarget} onClose={() => setBookingTarget(null)} />
      )}

      {/* The maybe-shelf schedules onto a day — a create action, so it's gone on
          a read-only past day (ADR-0029/0040); a build hint points to Plan. */}
      {readOnly ? (
        <div className="past-build-hint">
          <span aria-hidden="true">{ICONS.edit}</span> {t.day.pastBuildHint}
        </div>
      ) : (
        <>
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
        </>
      )}

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
              endsAt:
                end && start ? resolveEndIso(activeDate, start, end, trip.timezone) : undefined,
            });
            setScheduleItem(null);
          }}
          onClose={() => setScheduleItem(null)}
        />
      )}
    </>
  );
}

// The now-line (ADR-0043): a quiet soft-amber hairline with a flat mono time
// label, marking the current moment. It sits below the live event in the
// hierarchy — a time reference, not a second loud element (no chip fill, glow,
// or pulse). Takes a ref so the day view can scroll it into view on open.
function NowLine({ ref, now, tz }: { ref: React.Ref<HTMLDivElement>; now: Date; tz: string }) {
  return (
    <div className="nowline" ref={ref} aria-label={t.day.nowLineAria(formatTime(now, tz))}>
      <span className="nowline-chip">
        <span className="nowline-dot" aria-hidden="true" />
        <span dir="ltr">{formatTime(now, tz)}</span>{' '}
        <span className="nowline-lbl">{t.common.now}</span>
      </span>
      <span className="nowline-rule" />
    </div>
  );
}

// Shared wiring threaded through the recursive concurrency render (ADR-0041), so
// a nested/clustered EventItem keeps every quick-verb it has at the top level.
interface DayCtx {
  tz: string;
  now: Date;
  readOnly: boolean;
  openId: string | null;
  toggle: (id: string) => void;
  bookings: Booking[];
  places: Place[];
  dayEvents: TripEvent[];
  verbs: ReturnType<typeof useVerbs>;
  onEdit: (event: TripEvent) => void;
}

/** Total events nested anywhere inside an item — the "כולל N" count. */
function countDescendants(item: TimeItem): number {
  return item.children.reduce((sum, g) => {
    const items = g.kind === 'cluster' ? g.items : [g.item];
    return sum + items.reduce((s, it) => s + 1 + countDescendants(it), 0);
  }, 0);
}

// Renders one sibling-level group: a cluster gets a quiet brace + "בו-זמנית"
// header, a lone item renders directly. `depth` drives the indent cap.
function GroupNode({ group, depth, ctx }: { group: TimeGroup; depth: number; ctx: DayCtx }) {
  if (group.kind === 'cluster') {
    return (
      <div className="cluster">
        <div className="cluster-head">
          <span className="brk" aria-hidden="true">
            ⎣
          </span>{' '}
          {t.day.concurrent} ·{' '}
          <span className="win" dir="ltr">
            {formatTime(new Date(group.startMs), ctx.tz)}–
            {formatTime(new Date(group.endMs), ctx.tz)}
          </span>
        </div>
        <div className="cluster-kids">
          {group.items.map((item) => (
            <ItemNode key={item.event.id} item={item} depth={depth + 1} ctx={ctx} />
          ))}
        </div>
      </div>
    );
  }
  return <ItemNode item={group.item} depth={depth} ctx={ctx} />;
}

// One sibling level: maps each group through GroupNode (used for nested levels;
// the top level interleaves the now-line, so it maps groups itself).
function DayTree({ groups, depth, ctx }: { groups: TimeGroup[]; depth: number; ctx: DayCtx }) {
  return (
    <>
      {groups.map((g) => (
        <GroupNode key={groupKey(g)} group={g} depth={depth} ctx={ctx} />
      ))}
    </>
  );
}

// One event; if it contains others it becomes a nest (the event card + its
// contents indented beneath a brace, "כולל N" on the card).
function ItemNode({ item, depth, ctx }: { item: TimeItem; depth: number; ctx: DayCtx }) {
  const e = item.event;
  const hasKids = item.children.length > 0;
  const card = (
    <EventItem
      event={e}
      tz={ctx.tz}
      now={ctx.now}
      readOnly={ctx.readOnly}
      isOpen={ctx.openId === e.id}
      onToggle={() => ctx.toggle(e.id)}
      booking={e.bookingId ? ctx.bookings.find((b) => b.id === e.bookingId) : undefined}
      placeName={eventPlaceName(e, ctx.bookings, ctx.places)}
      conflicts={hardConflicts(e, ctx.dayEvents)}
      verbs={ctx.verbs}
      onEdit={() => ctx.onEdit(e)}
      nestedCount={hasKids ? countDescendants(item) : undefined}
    />
  );
  if (!hasKids) return card;
  return (
    <div className="nest">
      {card}
      <div className={'nest-kids' + (depth >= 1 ? ' deep' : '')}>
        <DayTree groups={item.children} depth={depth + 1} ctx={ctx} />
      </div>
    </div>
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
  now,
  readOnly,
  isOpen,
  onToggle,
  booking,
  placeName,
  conflicts,
  verbs,
  onEdit,
  nestedCount,
}: {
  event: TripEvent;
  tz: string;
  now: Date;
  readOnly: boolean;
  isOpen: boolean;
  onToggle: () => void;
  booking?: Booking;
  placeName?: string;
  conflicts: TripEvent[];
  verbs: ReturnType<typeof useVerbs>;
  onEdit: () => void;
  // Set on an envelope event that nests others: the "כולל N" contents count.
  nestedCount?: number;
}) {
  const isHard = event.kind === EVENT_KIND.HARD;
  const phase: EventPhase = eventPhase(event, now);
  const isDone = phase === 'done';
  const isNow = phase === 'now';
  const isPassed = phase === 'passed';
  // A passed-but-unmarked soft event settles inline ("we did this / skip") — the
  // honest "still on?" moment (ADR-0027/0043). On a past day every planned soft
  // event is there to be settled. Hard events aren't settled this way.
  const showSettle = !isHard && event.status === EVENT_STATUS.PLANNED && (isPassed || readOnly);

  // Tier-2 structural edits (edit details, delete) don't belong on the exposed
  // quick-verb strip in Trip mode — ADR-0025 puts them behind a per-item bottom
  // sheet ("unlock this one thing"). Locked entirely on a read-only past day.
  const [menuOpen, setMenuOpen] = useState(false);
  const runAction = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  const code = booking?.confirmationCode ? `${CODE_PREFIX}${booking.confirmationCode}` : undefined;
  const meta = [placeName, code && `${t.event.bookingLabel} ${code}`].filter(Boolean).join(' · ');

  const tag = isDone ? (
    <span className="tag-done">
      {ICONS.done} {t.event.didThis}
    </span>
  ) : isHard ? (
    <span className="tag-hard">
      {ICONS.lock} {t.event.hard}
    </span>
  ) : isPassed ? (
    <span className="tag-phase">{t.event.notMarked}</span>
  ) : (
    <span className="tag-soft">{isNow ? t.event.softNow : t.event.soft}</span>
  );

  const cls = [
    'item',
    event.kind === EVENT_KIND.SOFT ? 'soft' : '',
    isNow ? 'now' : '',
    isDone ? 'done' : '',
    isPassed && !isDone ? 'passed' : '',
    isOpen && !showSettle ? 'open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const titleBlock = (
    <span className="main">
      <span className="t">
        {event.title}
        {tag}
        {nestedCount !== undefined && (
          <span className="nest-note">{t.day.contains(nestedCount)}</span>
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
  );

  const timeBlock = event.startsAt && (
    <span className="time" dir="ltr">
      {formatTime(event.startsAt, tz)}
      {event.endsAt && `–${formatTime(event.endsAt, tz)}`}
      {event.endsAt && crossesMidnight(event.startsAt, event.endsAt, tz) && (
        <sup className="xmid" title={t.event.nextDay}>
          +1
        </sup>
      )}
    </span>
  );

  // Settle variant: a calm, non-expanding card + the inline settle strip. Its own
  // return so the forward-verb strip below stays focused on live/upcoming events.
  if (showSettle) {
    return (
      <div className={cls}>
        <div className="face static">
          <span className="badge">{event.icon}</span>
          {titleBlock}
          {timeBlock}
        </div>
        <div className="settle">
          <span className="settle-q">{t.day.settleAsk}</span>
          <button className="settle-yes" onClick={() => verbs.done(event)}>
            {ICONS.done} {t.actions.wasThere}
          </button>
          <button className="settle-skip" onClick={() => verbs.skip(event)}>
            {t.actions.skip}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cls}>
      <button className="face" onClick={onToggle} aria-expanded={isOpen}>
        <span className="badge">{event.icon}</span>
        {titleBlock}
        {/* The done ✓ doubles as a one-tap undo (ADR-0043 revision): tapping it
            restores the event, the fast twin of the row's שחזר. It's a
            role=button inside the face (not a nested <button>) that stops
            propagation so it undoes without also toggling the row open. Stays
            interactive on a read-only past day too: settling is reversible
            wherever it's allowed — restore is the inverse of the Done/Skip that
            ADR-0029/0043 keep for the archive's retrospective job. */}
        {isDone && (
          <span
            className="check btn"
            role="button"
            tabIndex={0}
            aria-label={t.actions.undoDone}
            title={t.actions.undoDone}
            onClick={(e) => {
              e.stopPropagation();
              verbs.restore(event);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                verbs.restore(event);
              }
            }}
          >
            <span className="mark" aria-hidden="true">
              {ICONS.done}
            </span>
            <span className="undo" aria-hidden="true">
              <Icon name="undo" />
            </span>
          </span>
        )}
        {timeBlock}
        <span className="chev" aria-hidden="true">
          <Icon name="caret" dir="down" />
        </span>
      </button>
      <div className="actions">
        <div className="act-row">
          {isDone ? (
            <>
              {/* שחזר stays on a past day too — un-settling is the inverse of the
                  retrospective Done the archive already allows (ADR-0043 §2). */}
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
              {!readOnly && (
                <>
                  <button className="act" onClick={() => verbs.onWay(event)}>
                    {t.actions.onWay}
                  </button>
                  <button className="act" onClick={() => verbs.delay(event)}>
                    {t.actions.delayBy(DELAY_STEP_MINUTES)}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button className="act" onClick={() => verbs.done(event)}>
                {t.actions.done}
              </button>
              <button className="act" onClick={() => verbs.skip(event)}>
                {t.actions.skip}
              </button>
              {/* The nudge adapts to phase (ADR-0043): both ways upcoming; +30
                  only for a now event (can't pull it into the past). */}
              <div className="act stepper">
                {!isNow && (
                  <button
                    className="step"
                    onClick={() => verbs.earlier(event)}
                    aria-label={t.actions.earlierBy(DELAY_STEP_MINUTES)}
                  >
                    −
                  </button>
                )}
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
          {!readOnly && (
            <span className="act-row-end">
              <button
                className="act icon-only more"
                onClick={() => setMenuOpen(true)}
                aria-label={t.actions.more}
              >
                {ICONS.more}
              </button>
            </span>
          )}
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
