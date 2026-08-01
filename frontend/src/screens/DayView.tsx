// Day-by-day — the interactive core. Hard/soft grammar, tap-to-expand quick
// verbs (optimistic + undo), the hard-event guard warning, the ripple bar, and
// the "maybe" shelf. Reads events for the active day from the trip context.
//
// Presentation is derived from the clock, never stored (ADR-0027/0043): a
// now-line marks the current moment on today and the view lands on it; events
// recede once passed; a passed-but-unmarked soft event offers an inline settle
// ("we did this / skip"); the ±30 nudge only offers moves that are possible; and
// a past day reads as a read-only archive (ADR-0029), editing gated to Plan.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  usePlaceErrandReturn,
  useShowMaybesOnMap,
  useShowPlaceOnMap,
} from '../state/map-scope-state';
import { prefersReducedMotion } from '../lib/motion';
import {
  authoringZone,
  eventDirectionsUrl,
  eventDurationLabel,
  eventEdgeZone,
  eventPlaceName,
  eventRoute,
  eventShowOnMap,
  eventZones,
  dayZoneContext,
  isDayOver,
  liveToday,
  liveZone,
  placeTimezone,
  type ShowPlaceOnMap,
  type ZoneContext,
  type ZoneEvidence,
} from '../lib/places';
import { useVerbs } from '../state/verbs';
import { useClock } from '../lib/useClock';
import {
  buildTimeTree,
  eventPhase,
  formatTime,
  hardConflicts,
  zonedIso,
  resolveEndIso,
  type TimeGroup,
  type TimeItem,
} from '../lib/time';
import { dayStops, rankIdeas, shelfGroups, stopReasonText, tileReasonText } from '../lib/shelf';
import { nextSlot } from '../lib/gaps';
import {
  dayTransitions,
  mergeDayEntries,
  type DayEntry,
  type TransitionEntry,
} from '../lib/day-entries';
import { CODE_PREFIX, DAY_NOON, DEFAULT_STAY_ICON, MS_PER_DAY, SHELF_POOL_CAP } from '../constants';
import { t } from '../i18n/he';
import { EventForm, type EventFormDraft } from '../ui/EventForm';
import { BookingSheet, type BookingSheetDraft } from '../ui/BookingSheet';
import { BookingDetail } from '../ui/BookingDetail';
import { TransitionRow } from '../ui/TransitionRow';
import { TitleLabel } from '../ui/TitleLabel';
import { Sheet } from '../ui/Sheet';
import { WhenField } from '../ui/primitives/WhenField';
import { EventCard, type EventPhaseName } from '../ui/domain/EventCard';
import { routeDisplay } from '../ui/route-display';
import { noteCountFor, noteCountsByHost } from '../lib/notes';
import { MaybeCard, MaybeMoreCard } from '../ui/domain/MaybeCard';
import { MaybeManageSheet } from '../ui/MaybeManageSheet';
import { EntitySyncBadge, useUnsynced } from '../ui/EntitySyncBadge';
import { Icon } from '../ui/Icon';

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
    notes,
    zoneEvidence,
    activeDate,
    ripple,
    setActiveDate,
  } = useTrip();
  const verbs = useVerbs();
  const now = useClock();
  // `מפה` is an in-app destination now (ADR-0121 §8): it hands the Map tab a focus
  // and lands there, instead of deep-linking out to Google's place view.
  const showPlaceOnMap = useShowPlaceOnMap();
  const showMaybesOnMap = useShowMaybesOnMap();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<'new' | TripEvent | null>(null);
  // RE-OPENING AFTER A PLACE ERRAND (ADR-0134 §2). The form went to the Map tab to have a
  // location picked, which unmounted it — so it comes back from its own draft with the
  // chosen place already in the named field, rather than from whatever the entity holds.
  const [formDraft, setFormDraft] = useState<EventFormDraft | null>(null);
  const closeForm = () => {
    setFormTarget(null);
    setFormDraft(null);
  };
  usePlaceErrandReturn<EventFormDraft>('event', 'days', (returned) => {
    if (!returned.draft) return;
    setFormTarget(events.find((e) => e.id === returned.target.id) ?? 'new');
    setFormDraft(returned.draft);
  });
  // RE-OPENING AFTER A PLACE ERRAND (ADR-0134 §2), through the same shared hook every other
  // form host uses. Without this the sheet would come back closed and the rest of what was
  // typed would be gone — the whole reason the errand carries a draft.
  const [bookingDraft, setBookingDraft] = useState<BookingSheetDraft | null>(null);
  usePlaceErrandReturn<BookingSheetDraft>('booking', 'days', (returned) => {
    if (!returned.draft) return;
    setBookingTarget(bookings.find((b) => b.id === returned.target.id) ?? null);
    setBookingDraft(returned.draft);
  });
  // Editing a booking-linked event opens the merged BookingSheet, not EventForm
  // (ADR-0053 §2) — the same surface as editing from the Index.
  const [bookingTarget, setBookingTarget] = useState<Booking | null>(null);

  // Tapping a transition row opens the read-only booking detail (ADR-0053/0064),
  // the same pattern as the Index; editing from there opens the BookingSheet.
  const [detailTarget, setDetailTarget] = useState<Booking | null>(null);
  const [scheduleItem, setScheduleItem] = useState<MaybeItem | null>(null);
  // The idea's own surface (ADR-0116's 2026-08-01 amendment): a tap opens this, and
  // `שיבוץ ליום` inside it is what reaches `scheduleItem` above.
  const [ideaSheet, setIdeaSheet] = useState<MaybeItem | null>(null);

  // The live "now" sits in the zone of the itinerary segment you're in (ADR-0107
  // §4), so "today" rolls at THAT zone's midnight — cross a zone and the calendar
  // day re-anchors. Trip mode only; Plan mode frames everything in the trip primary.
  const nowZone = liveZone(now.getTime(), zoneEvidence);
  const today = liveToday(now.getTime(), zoneEvidence);
  const dayScope: DayScope = activeDate < today ? 'past' : activeDate > today ? 'future' : 'today';
  // A past day is a read-only archive within a live trip (ADR-0029) — but "past"
  // for EDITING is not the live zone's answer, nor even this day's ambient: a day
  // is over only once it is over in EVERY zone it touched (ADR-0029 session-103
  // amendment), so a travel day can't lock itself while you're still inside it.
  const readOnly = isDayOver(activeDate, zoneEvidence, now.getTime());

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
  // The shelf, grouped (ADR-0116 §2) by one shared derivation both hosts call —
  // ideas pencilled in for this day, the rest of the pool, and (ADR-0027's parking
  // lot) the day's skipped soft events, durable and restorable in place.
  const shelf = shelfGroups(maybeItems, events, activeDate);
  // …and ranked (ADR-0116 session-202 §3 / ADR-0151). The grouping above is
  // untouched — this only orders what it produced, and attaches each idea's reason.
  const stops = dayStops(events, bookings, places, activeDate);
  // Capped, with the tail handed to the Map's אולי facet (§5) — which is what keeps
  // the strip's width independent of how many ideas the trip has accumulated.
  const rankedPool = rankIdeas(shelf.pool, places, activeDate, stops, SHELF_POOL_CAP);
  const poolTail = shelf.pool.length - rankedPool.length;
  // The day's own group keeps its order (it is small by construction) and gains
  // only the distance line — see `stopReasonText` for why it says nothing else.
  const forDayReasons = new Map(
    rankIdeas(shelf.forDay, places, activeDate, stops).map((r) => [r.item.id, r.reason]),
  );

  const dayNumber = daysBetween(trip.startDate, activeDate) + 1;
  const weekday = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    timeZone: trip.timezone,
  }).format(new Date(zonedIso(activeDate, DAY_NOON, trip.timezone)));
  const heading = t.day.heading(dayNumber, weekday, trip.destination);

  // Per-event display zones (ADR-0107): one builder over the one evidence, shared
  // with the Plan-mode builder so the two day surfaces cannot diverge.
  const zoneCtx = dayZoneContext(activeDate, zoneEvidence);
  const noteCounts = useMemo(() => noteCountsByHost(notes), [notes]);

  const dayCtx: DayCtx = {
    tz: trip.timezone,
    zoneCtx,
    now,
    readOnly,
    openId,
    toggle: (id) => setOpenId((cur) => (cur === id ? null : id)),
    bookings,
    places,
    noteCounts,
    dayEvents,
    verbs,
    onEdit: (e) => {
      const booking = e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined;
      if (booking) setBookingTarget(booking);
      else setFormTarget(e);
    },
    onOpenDetail: setDetailTarget,
    showPlaceOnMap,
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
            <Icon name="archive" />
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
              <Icon name="plus" /> {t.actions.newEvent}
            </button>
          )}
        </span>
      </div>

      {middleStays.length > 0 && (
        <div className="day-ambient">
          {middleStays.map((e) => (
            <div className="ambient" key={e.id}>
              <span className="ai" aria-hidden="true">
                {e.icon ?? DEFAULT_STAY_ICON}
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
              <NowLine ref={nowLineRef} now={now} tz={nowZone} />
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
                // Not gated on `readOnly`: a past day is a browsable archive
                // (ADR-0029), and looking at where you were changes nothing.
                onShowOnMap={eventShowOnMap(
                  entry.event,
                  dayCtx.bookings,
                  dayCtx.places,
                  dayCtx.showPlaceOnMap,
                )}
              />
            )}
          </Fragment>
        ))}
        {showNowLine && nowLineIndex === merged.length && (
          <NowLine ref={nowLineRef} now={now} tz={nowZone} />
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
          draft={formDraft}
          onClose={closeForm}
        />
      )}

      {(bookingTarget || bookingDraft) && (
        <BookingSheet
          booking={bookingTarget}
          draft={bookingDraft}
          onClose={() => {
            setBookingTarget(null);
            setBookingDraft(null);
          }}
        />
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
          <span aria-hidden="true">
            <Icon name="edit" />
          </span>{' '}
          {t.day.pastBuildHint}
        </div>
      ) : (
        <>
          <div className="sec-title">
            {t.day.maybeShelf}
            <span className="hint">{t.day.tapToSchedule}</span>
          </div>
          {/* Two groups (ADR-0116 §2): what's pencilled in for this day — plus the
              day's skipped events, which belong to it — then the rest of the pool,
              each out-of-day idea naming its own day. A header appears only when its
              group has content, so a trip with no target days reads as one strip. */}
          {(shelf.forDay.length > 0 || shelf.skipped.length > 0) && (
            <>
              {shelf.pool.length > 0 && <div className="shelf-group">{t.day.shelfForDay}</div>}
              <div className="shelf">
                {shelf.forDay.map((m) => (
                  <MaybeCard
                    key={m.id}
                    compact
                    icon={m.icon}
                    title={m.title}
                    meta={stopReasonText(forDayReasons.get(m.id))}
                    notes={noteCountFor(noteCounts, 'maybeItem', m.id)}
                    onOpen={() => setIdeaSheet(m)}
                  />
                ))}
                {/* Skipped soft events park here, restorable (ADR-0027 parking lot).
                    The tile drops the action line; `skippedTag` already says what a
                    tap does, which is why it is the one card that loses nothing. */}
                {shelf.skipped.map((e) => (
                  <MaybeCard
                    key={e.id}
                    compact
                    className="skipped-card"
                    icon={e.icon}
                    title={e.title}
                    meta={t.day.skippedTag}
                    // A skipped event's tap still restores it in place: it HAS a surface of
                    // its own (its day row), so the gesture change is the idea's alone.
                    onOpen={() => verbs.restore(e)}
                  />
                ))}
              </div>
            </>
          )}
          {shelf.pool.length > 0 && (
            <>
              {(shelf.forDay.length > 0 || shelf.skipped.length > 0) && (
                <div className="shelf-group">
                  {t.day.shelfRanked}
                  <span className="shelf-count">{shelf.pool.length}</span>
                </div>
              )}
              <div className="shelf">
                {/* Scheduled (consumed) ideas leave the shelf — no dead tombstone
                    (ADR-0027); `shelfGroups` already dropped them. */}
                {/* The tile's meta carries the ranking reason — a fact that VARIES
                    per card, which is what the retired action line never was. */}
                {rankedPool.map(({ item: m, reason }) => (
                  <MaybeCard
                    key={m.id}
                    compact
                    icon={m.icon}
                    title={m.title}
                    meta={tileReasonText(reason, activeDate)}
                    notes={noteCountFor(noteCounts, 'maybeItem', m.id)}
                    onOpen={() => setIdeaSheet(m)}
                  />
                ))}
                {/* The tail, and what makes the strip's width independent of N. Absent
                    rather than broken outside the trip shell (no Map tab to route to). */}
                {poolTail > 0 && showMaybesOnMap && (
                  <MaybeMoreCard
                    label={t.day.shelfMore(poolTail)}
                    icon={<Icon name="map" />}
                    onOpen={showMaybesOnMap}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}

      {ideaSheet && (
        <MaybeManageSheet
          item={ideaSheet}
          onSchedule={() => {
            setScheduleItem(ideaSheet);
            setIdeaSheet(null);
          }}
          onClose={() => setIdeaSheet(null)}
        />
      )}

      {scheduleItem && (
        <ScheduleSheet
          item={scheduleItem}
          // The free slot is read on the same clock the sheet types on, so the
          // prefilled time means what the day means by it (ADR-0107 session 128).
          defaults={nextSlot(
            dayEvents,
            activeDate,
            authoringZone({ placeId: scheduleItem.placeId }, { date: activeDate }, zoneEvidence),
          )}
          // The day is now part of the sheet (ADR-0116 §5), defaulting to the idea's
          // own pencilled-in day: putting something on Thursday stops requiring a
          // trip to Thursday first. Day-scope still gates the range — scheduling is
          // a create, and creates are locked on a past day in Trip mode (ADR-0029).
          date={scheduleItem.targetDate ?? activeDate}
          minDate={today > trip.startDate ? today : trip.startDate}
          maxDate={trip.endDate}
          evidence={zoneEvidence}
          onConfirm={({ date, start, end, zone, override }) => {
            verbs.schedule(scheduleItem, {
              date,
              title: scheduleItem.title,
              kind: EVENT_KIND.SOFT,
              // Typed in the day's own zone, not the trip primary — the zone the
              // chip states and the day view will read the event back in.
              startsAt: start ? zonedIso(date, start, zone) : undefined,
              endsAt: end && start ? resolveEndIso(date, start, end, zone) : undefined,
              displayTimezone: override ?? undefined,
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
        <span dir="auto">{formatTime(now, tz)}</span>{' '}
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
  /** How many notes each host carries (ADR-0152 §6c), built once per note-list change
   *  rather than filtered per row — a day of twelve events asks this twelve times. */
  noteCounts: Map<string, number>;
  dayEvents: TripEvent[];
  verbs: ReturnType<typeof useVerbs>;
  onEdit: (event: TripEvent) => void;
  onOpenDetail: (booking: Booking) => void;
  /** `מפה` — show this place on OUR map (ADR-0121 §8), not Google's. */
  /** Absent outside the trip shell, where there is no Map tab to route to. */
  showPlaceOnMap: ShowPlaceOnMap;
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
            <Icon name="bracket" />
          </span>{' '}
          {t.day.concurrent} ·{' '}
          <span className="win" dir="auto">
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
      // No route in reach: the stored title may still BE one, so it goes through
      // `TitleLabel` rather than out raw. `titleText` stays the plain string.
      title={route.title ?? <TitleLabel title={e.title} />}
      titleText={e.title}
      placeName={route.meta ?? eventPlaceName(e, ctx.bookings, ctx.places)}
      code={code}
      notes={noteCountFor(ctx.noteCounts, 'event', e.id)}
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
      onShowOnMap={eventShowOnMap(e, ctx.bookings, ctx.places, ctx.showPlaceOnMap)}
      onDone={() => ctx.verbs.done(e)}
      onSkip={() => ctx.verbs.skip(e)}
      onDelay={() => ctx.verbs.delay(e)}
      onEarlier={() => ctx.verbs.earlier(e)}
      onOnWay={() => ctx.verbs.onWay(e)}
      onRestore={() => ctx.verbs.restore(e)}
      onSwap={() => ctx.verbs.swap(e)}
      onPark={ctx.readOnly ? undefined : () => ctx.verbs.park(e)}
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

// Trip-mode quick-schedule: tap a shelf idea, adjust the prefilled day + time, done
// (ADR-0025 Tier-1). The day joined the sheet in ADR-0116 §5, which also retires the
// last bespoke time-only control here in favour of the app's one date/time primitive
// (`WhenField`, ADR-0083). Kind/location stay Plan-mode building.
//
// It types in the zone the day view will read the event back in, stated on the
// `WhenField`'s zone chip (ADR-0107 §6, session-128 amendment): a time slotted here
// used to be interpreted in the trip primary while the row rendered in the day's
// own zone, so on a multi-zone trip an idea dropped at 19:00 reappeared shifted.
// Editable only when no place answers the zone — the same rule as every other form.
function ScheduleSheet({
  item,
  defaults,
  date,
  minDate,
  maxDate,
  evidence,
  onConfirm,
  onClose,
}: {
  item: MaybeItem;
  defaults: { start: string; end: string };
  date: string;
  minDate: string;
  maxDate: string;
  evidence: ZoneEvidence;
  onConfirm: (picked: {
    date: string;
    start: string;
    end: string;
    zone: string;
    override: string | null;
  }) => void;
  onClose: () => void;
}) {
  const [when, setWhen] = useState({ date, start: defaults.start, end: defaults.end });
  const [override, setOverride] = useState<string | null>(null);

  // The day and the time both move the answer (a later day can sit past a
  // crossing), so it re-resolves with the fields rather than once on open.
  const zone =
    override ??
    authoringZone({ placeId: item.placeId }, { date: when.date, time: when.start }, evidence);
  const placeAnswers = placeTimezone(evidence.places, item.placeId) != null;
  const suggestedZones = useMemo(() => {
    const zones = [zone, evidence.primaryZone];
    for (const p of evidence.places) if (p.timezone) zones.push(p.timezone);
    return [...new Set(zones)];
  }, [zone, evidence.primaryZone, evidence.places]);

  return (
    <Sheet title={t.day.scheduleTitle(item.title)} onClose={onClose}>
      <WhenField
        variant="day"
        date={when.date}
        start={when.start}
        end={when.end}
        minDate={minDate}
        maxDate={maxDate}
        onChange={setWhen}
        zone={{
          value: zone,
          onChange: placeAnswers ? undefined : setOverride,
          pinned: override != null,
          suggested: suggestedZones,
        }}
      />
      <button
        type="button"
        className="sched-confirm"
        onClick={() => onConfirm({ ...when, zone, override })}
      >
        <Icon name="calendar" /> {t.actions.scheduleToDay}
      </button>
    </Sheet>
  );
}
