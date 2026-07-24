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
  isAmbient,
  type Booking,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip, byStart } from '../state/trip-state';
import { prefersReducedMotion } from '../lib/motion';
import {
  eventDirectionsUrl,
  eventDurationLabel,
  eventEdgeZone,
  eventPlaceName,
  eventPlaceUrl,
  eventRoute,
  eventZones,
  currentZone,
  segmentZoneAt,
  type ZoneContext,
} from '../lib/places';
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
  type TimeGroup,
  type TimeItem,
} from '../lib/time';
import { nextSlot } from '../lib/gaps';
import {
  dayTransitions,
  mergeDayEntries,
  type DayEntry,
  type TransitionEntry,
} from '../lib/day-entries';
import { CODE_PREFIX, ICONS, MS_PER_DAY } from '../constants';
import { t } from '../i18n/he';
import { EventForm } from '../ui/EventForm';
import { BookingSheet } from '../ui/BookingSheet';
import { BookingDetail } from '../ui/BookingDetail';
import { TransitionRow } from '../ui/TransitionRow';
import { Sheet } from '../ui/Sheet';
import { TimePicker } from '../ui/TimePicker';
import { EventCard, type EventPhaseName } from '../ui/domain/EventCard';
import { routeDisplay } from '../ui/route-display';
import { MaybeCard } from '../ui/domain/MaybeCard';
import { EntitySyncBadge, useUnsynced } from '../ui/EntitySyncBadge';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

// Open a Google Maps universal URL in a new tab (on device it hands off to the
// Maps app). Only ever called with a non-null URL — the ניווט button is hidden
// when the event has no mappable location (ADR-0106/0109 Phase 2).
const openMaps = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

// A navigate handler for an event, or `undefined` when it has no mappable place
// (no place, or a coordless name-only Place-lite). The EventCard/TransitionRow
// then drop the ניווט button entirely — "no location, no button" (Phase 2).
function navigateHandler(
  event: TripEvent,
  ctx: Pick<DayCtx, 'bookings' | 'places'>,
): (() => void) | undefined {
  const url = eventDirectionsUrl(event, ctx.bookings, ctx.places);
  return url ? () => openMaps(url) : undefined;
}

// The view-on-map peer of navigateHandler: opens the place (not directions), or
// `undefined` when there's no mappable place so the מפה button drops too.
function showOnMapHandler(
  event: TripEvent,
  ctx: Pick<DayCtx, 'bookings' | 'places'>,
): (() => void) | undefined {
  const url = eventPlaceUrl(event, ctx.bookings, ctx.places);
  return url ? () => openMaps(url) : undefined;
}

/** The zone display props for a transition entry's edge (ADR-0107): the edge's
 *  zone for the time, and the shift vs the day's ambient zone when non-zero. */
function transitionZoneProps(
  entry: TransitionEntry,
  zoneCtx: ZoneContext,
): { zone: string; deltaMinutes?: number } {
  return eventEdgeZone(entry.event, entry.edge, zoneCtx);
}

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
  const {
    trip,
    events,
    maybeItems,
    bookings,
    places,
    zoneCrossings,
    activeDate,
    ripple,
    setActiveDate,
  } = useTrip();
  const verbs = useVerbs();
  const now = useClock();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<'new' | TripEvent | null>(null);
  // Editing a booking-linked event opens the merged BookingSheet, not EventForm
  // (ADR-0053 §2) — the same surface as editing from the Index.
  const [bookingTarget, setBookingTarget] = useState<Booking | null>(null);
  // Tapping a transition row opens the read-only booking detail (ADR-0053/0064),
  // the same pattern as the Index; editing from there opens the BookingSheet.
  const [detailTarget, setDetailTarget] = useState<Booking | null>(null);
  const [scheduleItem, setScheduleItem] = useState<MaybeItem | null>(null);

  // The live "now" sits in the zone of the itinerary segment you're in (ADR-0107
  // §4), so "today" rolls at THAT zone's midnight — cross a zone and the calendar
  // day re-anchors. Trip mode only; Plan mode frames everything in the trip primary.
  const liveZone = currentZone(now.getTime(), zoneCrossings, trip.timezone);
  const today = todayInTz(liveZone, now);
  const dayScope: DayScope = activeDate < today ? 'past' : activeDate > today ? 'future' : 'today';
  // The day's OWN ambient zone (its segment zone at noon) — what decides when this
  // day is over, below.
  const dayNoon = new Date(zonedIso(activeDate, '12:00', trip.timezone));
  const ambientZone = segmentZoneAt(dayNoon.getTime(), zoneCrossings) ?? trip.timezone;
  // A past day is a read-only archive within a live trip (ADR-0029) — but "past"
  // for EDITING is decided in the day's own zone, not the live one (ADR-0029
  // amendment / ADR-0107 §4). Otherwise crossing east mid-flight rolls the live
  // clock into tomorrow and the day you're still flying through would lock itself
  // while you're living it. A day ends when that day's clock says so.
  const readOnly = todayInTz(ambientZone, now) > activeDate;

  const dayEvents = events
    .filter((e) => e.date === activeDate && e.status !== EVENT_STATUS.SKIPPED && !isAmbient(e))
    .sort(byStart);
  // Ambient-span stays (a hotel, ADR-0054/0063) are backdrop, not timeline rows.
  // The strip now renders only on STRICTLY-MIDDLE nights (ADR-0064 §C): edge days
  // show the transition entry instead, so no day shows the stay twice and the
  // (wrong) checkout-day strip disappears. A 1-night stay has no middle day → no
  // strip, just its two edge entries.
  const middleStays = events.filter(
    (e) => isAmbient(e) && e.date < activeDate && activeDate < e.endDate!,
  );
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
  }).format(dayNoon);
  const heading = t.day.heading(dayNumber, weekday, trip.destination);

  // Per-event display zones (ADR-0107): the shared crossings anchor them, and the
  // day's ambient zone is what the shift pill measures deviations from.
  const zoneCtx: ZoneContext = {
    bookings,
    places,
    crossings: zoneCrossings,
    primaryZone: trip.timezone,
    ambientZone,
  };

  const dayCtx: DayCtx = {
    tz: trip.timezone,
    zoneCtx,
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
    onOpenDetail: setDetailTarget,
  };

  // Multi-day bracketed bookings (a hotel, a red-eye flight) are ambient — off
  // `dayEvents` — so their edge days would show nothing in the list. Interleave
  // their transition points (check-in/out, departure/arrival) among the event
  // groups by instant (ADR-0064 §B). Same-day brackets stay a single span row.
  const merged = mergeDayEntries(buildTimeTree(dayEvents), dayTransitions(events, activeDate));

  // The now-line: only on today (a past/future day has no "now"). It sits above
  // the first entry that isn't fully behind us (a transition point ends at its
  // own instant); if every entry is passed it falls after them all.
  const entryEndMs = (entry: DayEntry) =>
    entry.kind === 'event' ? groupEndMs(entry.group) : entry.atMs;
  const showNowLine = dayScope === 'today';
  let nowLineIndex = merged.findIndex((entry) => entryEndMs(entry) > now.getTime());
  if (nowLineIndex === -1) nowLineIndex = merged.length;

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
    el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
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

      {middleStays.length > 0 && (
        <div className="day-ambient">
          {middleStays.map((e) => (
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
        {merged.map((entry, i) => (
          <Fragment
            key={entry.kind === 'event' ? groupKey(entry.group) : `${entry.event.id}-${entry.edge}`}
          >
            {showNowLine && i === nowLineIndex && (
              <NowLine ref={nowLineRef} now={now} tz={liveZone} />
            )}
            {entry.kind === 'event' ? (
              <GroupNode group={entry.group} depth={0} ctx={dayCtx} />
            ) : (
              <TransitionRow
                entry={entry}
                tz={dayCtx.tz}
                {...transitionZoneProps(entry, dayCtx.zoneCtx)}
                bookings={dayCtx.bookings}
                onOpen={dayCtx.onOpenDetail}
                onNavigate={dayCtx.readOnly ? undefined : navigateHandler(entry.event, dayCtx)}
              />
            )}
          </Fragment>
        ))}
        {showNowLine && nowLineIndex === merged.length && (
          <NowLine ref={nowLineRef} now={now} tz={liveZone} />
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

      {detailTarget && (
        <BookingDetail
          booking={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={(b) => {
            setDetailTarget(null);
            setBookingTarget(b);
          }}
        />
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
                <MaybeCard
                  key={m.id}
                  icon={m.icon}
                  title={m.title}
                  action={`${ICONS.add} ${t.actions.scheduleToDay}`}
                  onSchedule={() => setScheduleItem(m)}
                />
              ))}
            {/* Skipped soft events park here, restorable (ADR-0027 parking lot). */}
            {skippedToday.map((e) => (
              <MaybeCard
                key={e.id}
                className="skipped-card"
                icon={e.icon}
                title={e.title}
                meta={t.day.skippedTag}
                action={`${ICONS.restore} ${t.actions.restore}`}
                onSchedule={() => verbs.restore(e)}
              />
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
// a nested/clustered EventCard keeps every quick-verb it has at the top level.
interface DayCtx {
  tz: string;
  /** The trip's zone crossings + the day's ambient zone, so each event resolves
   *  its display zone(s) and the non-trivial-suppression rule (ADR-0107). */
  zoneCtx: ZoneContext;
  now: Date;
  readOnly: boolean;
  openId: string | null;
  toggle: (id: string) => void;
  bookings: Booking[];
  places: Place[];
  dayEvents: TripEvent[];
  verbs: ReturnType<typeof useVerbs>;
  onEdit: (event: TripEvent) => void;
  onOpenDetail: (booking: Booking) => void;
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
  const booking = e.bookingId ? ctx.bookings.find((b) => b.id === e.bookingId) : undefined;
  const code = booking?.confirmationCode ? `${CODE_PREFIX}${booking.confirmationCode}` : undefined;
  const conflicts = hardConflicts(e, ctx.dayEvents);
  // A queued (pending) edit fades the card to read as provisional (ADR-0092).
  const unsynced = useUnsynced(e.id);

  // The screen derives the phase from the clock (ADR-0043) and passes it in. On a
  // read-only past day every planned soft event is there to be settled (ADR-0029),
  // including untimed ones the clock alone would call 'upcoming' — force 'passed'
  // so the card shows the settle strip, matching the pre-migration EventItem.
  const raw = eventPhase(e, ctx.now);
  const phase: EventPhaseName =
    ctx.readOnly &&
    e.kind === EVENT_KIND.SOFT &&
    e.status === EVENT_STATUS.PLANNED &&
    raw !== 'done'
      ? 'passed'
      : raw === 'skipped'
        ? 'upcoming'
        : raw;

  const zones = eventZones(e, ctx.zoneCtx);
  // A transport row reads as its (shortened) route, dropping to a
  // destination-primary line if even that overflows — one decision driving both
  // the title and the meta so they can't disagree (ADR-0059 §3 amendment).
  const route = routeDisplay(eventRoute(e, ctx.bookings, ctx.places));

  const card = (
    <EventCard
      icon={e.icon}
      // `titleText` stays the plain stored title for the menu header + a11y names.
      title={route.title ?? e.title}
      titleText={e.title}
      placeName={route.meta ?? eventPlaceName(e, ctx.bookings, ctx.places)}
      code={code}
      kind={e.kind === EVENT_KIND.HARD ? 'hard' : 'soft'}
      phase={phase}
      sync={<EntitySyncBadge id={e.id} />}
      unsynced={unsynced}
      readOnly={ctx.readOnly}
      isOpen={ctx.openId === e.id}
      onToggle={() => ctx.toggle(e.id)}
      startsAt={e.startsAt}
      endsAt={e.endsAt}
      tz={ctx.tz}
      zones={zones}
      duration={eventDurationLabel(e, booking, zones)}
      conflict={
        conflicts.length > 0
          ? { title: conflicts[0].title, startsAt: conflicts[0].startsAt! }
          : undefined
      }
      nestedCount={hasKids ? countDescendants(item) : undefined}
      onNavigate={navigateHandler(e, ctx)}
      onShowOnMap={showOnMapHandler(e, ctx)}
      onDone={() => ctx.verbs.done(e)}
      onSkip={() => ctx.verbs.skip(e)}
      onDelay={() => ctx.verbs.delay(e)}
      onEarlier={() => ctx.verbs.earlier(e)}
      onOnWay={() => ctx.verbs.onWay(e)}
      onRestore={() => ctx.verbs.restore(e)}
      onSwap={() => ctx.verbs.swap(e)}
      onEdit={() => ctx.onEdit(e)}
      onRemove={() => ctx.verbs.remove(e)}
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
