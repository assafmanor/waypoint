// Plan-mode Day-by-day — the itinerary BUILDER (modes.md; ADR-0025 Tier 3;
// mockups/plan-mode-v1.html). Trip mode follows/adjusts the day (quick verbs);
// Plan mode builds it — so rows are structural: tap the row opens the edit
// sheet, the ⋯ button opens a per-row action sheet (edit · move-to-shelf ·
// delete), and gap chips + the shelf fill the day. One trailing affordance per
// row, not a strip of icons — the phone has no width for it (ADR-0017).
//
// Editing reuses EventForm (add + edit, incl. hard↔soft flip, time, and
// cross-day via its date field). Reorder = drag a soft row's grip (or the ▲/▼
// fallback) to reassign the day's soft time slots (verbs.reorder → planReorder);
// the list stays time-ordered and hard events are pinned anchors (ADR-0011).
import {
  Fragment,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  EVENT_KIND,
  EVENT_STATUS,
  isAmbient,
  type Booking,
  type EventCategory,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip, byStart } from '../state/trip-state';
import { useVerbs } from '../state/verbs';
import { useClock } from '../lib/useClock';
import {
  eventDurationLabel,
  eventEdgeZone,
  eventPlaceName,
  eventRoute,
  eventZones,
  segmentZoneAt,
  tripZoneCrossings,
  type EventZones,
  type ZoneContext,
} from '../lib/places';
import { tripPhase } from '../lib/mode';
import {
  buildTimeTree,
  formatTime,
  formatZoneDelta,
  todayInTz,
  zonedIso,
  crossesMidnightZoned,
  type TimeGroup,
  type TimeItem,
} from '../lib/time';
import { gapBetween, nextSlot, type GapDefaults } from '../lib/gaps';
import { CODE_PREFIX, DEFAULT_MAYBE_ICON, ICONS, MS_PER_DAY, MINUTES_PER_HOUR } from '../constants';
import { dayTransitions, mergeDayEntries, type DayEntry } from '../lib/day-entries';
import type { BookingTransition } from '../lib/glance';
import { t } from '../i18n/he';
import { EventForm } from '../ui/EventForm';
import { BookingSheet } from '../ui/BookingSheet';
import { BookingDetail } from '../ui/BookingDetail';
import { TransitionRow } from '../ui/TransitionRow';
import { routeDisplay } from '../ui/route-display';
import { IconPicker } from '../ui/IconPicker';
import { Icon } from '../ui/Icon';
import { NavArrow } from '../ui/NavArrow';
import { Sheet } from '../ui/Sheet';
import { MaybeCard } from '../ui/domain/MaybeCard';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

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
  const { trip, events, maybeItems, bookings, places, activeDate } = useTrip();
  const verbs = useVerbs();
  const now = useClock();
  const tz = trip.timezone;
  // A finished trip is a read-only archive (ADR-0040): the builder becomes a
  // frozen, browsable history — no create/edit/delete/move, no shelf.
  const readOnly = tripPhase(trip, now) === 'past';
  // A static "now" reference while building TODAY mid-trip (ADR-0043): a drafting
  // guide for "what's still ahead to build," never a live signal. Only when the
  // day on screen is today and the trip is live — Plan has no "now" otherwise.
  const nowRefMs =
    tripPhase(trip, now) === 'live' && activeDate === todayInTz(tz, now) ? now.getTime() : null;
  const [formTarget, setFormTarget] = useState<'new' | TripEvent | null>(null);
  // A booking-linked event edits through the merged BookingSheet (ADR-0053 §2).
  const [bookingTarget, setBookingTarget] = useState<Booking | null>(null);
  // Tapping a transition row opens the read-only booking detail (ADR-0053/0064),
  // the same pattern as the Trip-mode day view; editing from there opens the sheet.
  const [detailTarget, setDetailTarget] = useState<Booking | null>(null);
  const [gapFill, setGapFill] = useState<GapDefaults | null>(null);
  // A shelf idea being scheduled onto a day — opens EventForm in "schedule" mode
  // so the user picks the day/time/kind (not the old hardcoded 17:30 dump).
  const [scheduleMaybe, setScheduleMaybe] = useState<MaybeItem | null>(null);
  // A gap the user tapped "＋ שבץ" on — opens a chooser to drop an existing shelf
  // idea into the gap's slot, or start a fresh event there (#21).
  const [gapChoice, setGapChoice] = useState<GapDefaults | null>(null);
  // An overlap cluster being resolved via "הזז" (ADR-0041), and the soft event
  // chosen to move (null = still choosing which one).
  const [resolveCluster, setResolveCluster] = useState<TimeGroup | null>(null);
  const [resolveMover, setResolveMover] = useState<TripEvent | null>(null);

  // A live trip hides skipped soft events (they park on the shelf); a finished
  // trip's archive shows them in place — struck-through, restorable — so the
  // record reads "what we did / what we skipped" (ADR-0044).
  const dayEvents = events
    .filter(
      (e) =>
        e.date === activeDate && (readOnly || e.status !== EVENT_STATUS.SKIPPED) && !isAmbient(e),
    )
    .sort(byStart);
  // Ambient-span stays (a hotel, ADR-0054/0063): backdrop, not builder rows. The
  // strip now renders only on STRICTLY-MIDDLE nights (ADR-0064 §C, mirroring the
  // Trip-mode day view): edge days show the transition entry instead, so no day
  // shows the stay twice and the (wrong) checkout-day strip disappears. A 1-night
  // stay has no middle day → no strip, just its two edge entries.
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

  // Multi-day bracketed bookings (a hotel, a red-eye flight) are ambient — off
  // `dayEvents` — so their edge days would show nothing in the list. Interleave
  // their transition points (check-in/out, departure/arrival) among the builder
  // groups by instant (ADR-0064 §B); same-day brackets stay a single span row.
  const transitions = dayTransitions(events, activeDate);

  // Reorder acts on soft events only (hard events are pinned anchors, ADR-0011).
  const softEvents = dayEvents.filter((e) => e.kind === EVENT_KIND.SOFT);
  const softIndex = new Map(softEvents.map((e, i) => [e.id, i]));

  // Drag-to-reorder: a soft event's grip is the handle. Pointer capture keeps
  // move/up on the grip; the row under the pointer (data-bld-id) is the drop
  // target. Drop reassigns the soft time slots (verbs.reorder → planReorder).
  const [drag, setDrag] = useState<{ id: string; overId: string | null } | null>(null);
  const gripProps = (id: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDrag({ id, overId: null });
    },
    onPointerMove: (e: ReactPointerEvent) => {
      setDrag((d) => {
        if (!d) return d;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const overId = (el?.closest('[data-bld-id]') as HTMLElement | null)?.dataset.bldId ?? null;
        const next = overId && overId !== d.id && softIndex.has(overId) ? overId : null;
        return next === d.overId ? d : { ...d, overId: next };
      });
    },
    onPointerUp: () => {
      if (drag?.overId && drag.overId !== drag.id) verbs.reorder(dayEvents, drag.id, drag.overId);
      setDrag(null);
    },
  });

  const dayNumber = daysBetween(trip.startDate, activeDate) + 1;
  const dayNoon = new Date(zonedIso(activeDate, '12:00', trip.timezone));
  const weekday = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    timeZone: trip.timezone,
  }).format(dayNoon);

  // Multi-zone display (ADR-0107): same per-event zone resolution as the Trip-mode
  // day view — the day's ambient zone (its segment zone at noon, else the trip
  // primary) is what the shift pill measures against.
  const crossings = tripZoneCrossings(events, bookings, places);
  const ambientZone = segmentZoneAt(dayNoon.getTime(), crossings) ?? trip.timezone;
  const zoneCtx: ZoneContext = {
    bookings,
    places,
    crossings,
    primaryZone: trip.timezone,
    ambientZone,
  };

  const closeForm = () => {
    setFormTarget(null);
    setGapFill(null);
    setScheduleMaybe(null);
  };

  const builderCtx: BuilderCtx = {
    tz,
    zoneCtx,
    readOnly,
    nowRefMs,
    bookings,
    places,
    verbs,
    dayEvents,
    softEvents,
    softIndex,
    drag,
    gripProps,
    onEdit: (e) => {
      const booking = e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined;
      if (booking) setBookingTarget(booking);
      else setFormTarget(e);
    },
    onOpenDetail: setDetailTarget,
    onGapFill: (fill) => setGapChoice(fill),
    onResolve: (cluster) => {
      setResolveCluster(cluster);
      setResolveMover(null);
    },
  };

  const closeResolve = () => {
    setResolveCluster(null);
    setResolveMover(null);
  };

  return (
    <div className="builder">
      <div className="builder-main">
        <div className="sec-title">
          {t.day.heading(dayNumber, weekday, trip.destination)}
          <span className="sec-title-end">
            {readOnly ? (
              <span className="hint">{t.planDay.pastNote}</span>
            ) : (
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

        {dayEvents.length === 0 && transitions.length === 0 ? (
          <div className="builder-empty">{readOnly ? t.planDay.pastEmpty : t.planDay.empty}</div>
        ) : (
          <div>
            {/* Overlaps render as the concurrency forest (ADR-0041): nests for
                containment, violet clusters for partial overlap. Gap chips sit
                only between top-level groups — never inside an overlap.
                Transition points interleave by instant at the top level (§B). */}
            <BuilderGroups
              groups={buildTimeTree(dayEvents)}
              depth={0}
              ctx={builderCtx}
              transitions={transitions}
            />
            {dayEvents
              .filter((e) => !e.startsAt)
              .map((e) => (
                <BuilderNode
                  key={e.id}
                  item={{ event: e, children: [] }}
                  depth={0}
                  ctx={builderCtx}
                />
              ))}
          </div>
        )}

        {/* Header's "new event" is a blank form; this one continues the day at
            the next open slot. Frozen on a finished trip (ADR-0040). */}
        {!readOnly && (
          <button
            className="addbtn"
            onClick={() => {
              setGapFill(nextSlot(dayEvents, activeDate, tz));
              setFormTarget('new');
            }}
          >
            {ICONS.add} {t.planDay.addToDay}
          </button>
        )}
      </div>

      {/* The maybe-shelf is trip-building (ADR-0025 Tier 3), so a finished
          read-only trip drops it entirely (ADR-0040). */}
      {!readOnly && (
        <div className="builder-side">
          <div className="sec-title">
            {t.day.maybeShelf}
            <span className="hint">{t.day.tapToSchedule}</span>
          </div>
          <div className="shelf">
            {/* Scheduled (consumed) ideas leave the shelf — no dead "שובץ"
                tombstone (ADR-0027: an idea is parked OR placed, never both). */}
            {maybeItems
              .filter((m) => !m.consumed)
              .map((m) => (
                <MaybeCard
                  key={m.id}
                  icon={m.icon}
                  title={m.title}
                  action={`${ICONS.add} ${t.actions.scheduleToDay}`}
                  onSchedule={() => {
                    setGapFill(nextSlot(dayEvents, activeDate, tz));
                    setScheduleMaybe(m);
                  }}
                  onRemove={() => verbs.removeMaybe(m)}
                  removeLabel={t.planDay.removeIdea}
                />
              ))}
          </div>
          <AddIdea onAdd={(title, icon, category) => verbs.addMaybe(title, icon, category)} />
        </div>
      )}

      {gapChoice && (
        <GapFillSheet
          gap={gapChoice}
          ideas={maybeItems.filter((m) => !m.consumed)}
          onPickIdea={(m) => {
            verbs.schedule(m, {
              date: gapChoice.date,
              title: m.title,
              kind: EVENT_KIND.SOFT,
              startsAt: zonedIso(gapChoice.date, gapChoice.start, tz),
              endsAt: zonedIso(gapChoice.date, gapChoice.end, tz),
            });
            setGapChoice(null);
          }}
          onNewEvent={() => {
            setGapFill(gapChoice);
            setFormTarget('new');
            setGapChoice(null);
          }}
          onClose={() => setGapChoice(null)}
        />
      )}

      {resolveCluster && resolveCluster.kind === 'cluster' && (
        <ResolveSheet
          cluster={resolveCluster}
          mover={resolveMover}
          tz={tz}
          onChooseMover={setResolveMover}
          onBack={() => setResolveMover(null)}
          onMove={(mover, minutes) => {
            verbs.moveBy(mover, minutes);
            closeResolve();
          }}
          onOther={(mover) => {
            closeResolve();
            setFormTarget(mover);
          }}
          onClose={closeResolve}
        />
      )}

      {(formTarget || scheduleMaybe) && (
        <EventForm
          event={formTarget && formTarget !== 'new' ? formTarget : null}
          maybeItem={scheduleMaybe}
          defaults={gapFill ?? undefined}
          onClose={closeForm}
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
    </div>
  );
}

// The "הזז" overlap-resolve (ADR-0041): pick which SOFT event to move (hard
// members show as disabled anchors), then a one-tap clean slot before/after the
// rest of the cluster, or the exact time-setter (EventForm). Moving is a manual
// ripple — duration preserved, downstream overlap flows through the ripple bar.
function ResolveSheet({
  cluster,
  mover,
  tz,
  onChooseMover,
  onBack,
  onMove,
  onOther,
  onClose,
}: {
  cluster: Extract<TimeGroup, { kind: 'cluster' }>;
  mover: TripEvent | null;
  tz: string;
  onChooseMover: (e: TripEvent) => void;
  onBack: () => void;
  onMove: (mover: TripEvent, minutes: number) => void;
  onOther: (mover: TripEvent) => void;
  onClose: () => void;
}) {
  const members = cluster.items.map((i) => i.event);
  const softMovers = members.filter((e) => e.kind === EVENT_KIND.SOFT);
  const hardAnchors = members.filter((e) => e.kind === EVENT_KIND.HARD);
  const fmt = (ms: number) => formatTime(new Date(ms), tz);

  if (!mover) {
    return (
      <Sheet title={t.planDay.resolveTitle} onClose={onClose}>
        <div className="resolve-sub">{t.planDay.resolveChoose}</div>
        {softMovers.map((e) => (
          <button key={e.id} className="resolve-mover" onClick={() => onChooseMover(e)}>
            <span className="ic" aria-hidden="true">
              {e.icon}
            </span>
            <span className="nm">{e.title}</span>
            <span className="tm" dir="ltr">
              {formatTime(e.startsAt!, tz)}
              {e.endsAt && `–${formatTime(e.endsAt, tz)}`}
            </span>
            <span className="chev" aria-hidden="true">
              <Icon name="caret" dir="down" />
            </span>
          </button>
        ))}
        {hardAnchors.map((e) => (
          <div key={e.id} className="resolve-mover anchor">
            <span className="ic" aria-hidden="true">
              {e.icon}
            </span>
            <span className="nm">{e.title}</span>
            <span className="anchor-note">
              {ICONS.lock} {t.planDay.resolveAnchor}
            </span>
          </div>
        ))}
      </Sheet>
    );
  }

  const others = members.filter((e) => e.id !== mover.id);
  const mStart = Date.parse(mover.startsAt!);
  const dur = Date.parse(mover.endsAt ?? mover.startsAt!) - mStart;
  const othersStart = Math.min(...others.map((e) => Date.parse(e.startsAt!)));
  const othersEnd = Math.max(...others.map((e) => Date.parse(e.endsAt ?? e.startsAt!)));
  const afterStart = othersEnd;
  const beforeStart = othersStart - dur;

  return (
    <Sheet title={t.planDay.resolveFor(mover.title)} onClose={onClose}>
      {softMovers.length > 1 && (
        <button className="resolve-backbtn" onClick={onBack}>
          <NavArrow variant="back" /> {t.planDay.resolveBack}
        </button>
      )}
      <button
        className="resolve-opt"
        onClick={() => onMove(mover, Math.round((afterStart - mStart) / 60000))}
      >
        <span className="ttl">
          {t.planDay.resolveAfter} · {others.length === 1 ? others[0].title : t.planDay.overlapping}
        </span>
        <span className="tm" dir="ltr">
          {fmt(afterStart)}
        </span>
      </button>
      <button
        className="resolve-opt"
        onClick={() => onMove(mover, Math.round((beforeStart - mStart) / 60000))}
      >
        <span className="ttl">
          {t.planDay.resolveBefore} ·{' '}
          {others.length === 1 ? others[0].title : t.planDay.overlapping}
        </span>
        <span className="tm" dir="ltr">
          {fmt(beforeStart)}
        </span>
      </button>
      <button className="resolve-opt other" onClick={() => onOther(mover)}>
        {t.planDay.resolveOther}
      </button>
    </Sheet>
  );
}

// Gap-fill chooser (#21): drop an existing shelf idea into the gap's slot, or
// start a fresh event there. Scheduling an idea reuses verbs.schedule with the
// gap's exact start/end so it lands in the hole, not the old default slot.
function GapFillSheet({
  gap,
  ideas,
  onPickIdea,
  onNewEvent,
  onClose,
}: {
  gap: GapDefaults;
  ideas: MaybeItem[];
  onPickIdea: (m: MaybeItem) => void;
  onNewEvent: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={t.planDay.gapFillTitle(gap.start, gap.end)} onClose={onClose}>
      <div className="gapfill-list">
        {ideas.map((m) => (
          <button key={m.id} className="gapfill-row" onClick={() => onPickIdea(m)}>
            <span className="gapfill-ic">{m.icon}</span>
            <span className="gapfill-main">
              <span className="gapfill-t">{m.title}</span>
            </span>
            <span className="gapfill-add">{ICONS.add}</span>
          </button>
        ))}
        {ideas.length === 0 && <div className="gapfill-empty">{t.planDay.gapFillEmpty}</div>}
      </div>
      <button className="btn-primary gapfill-new" onClick={onNewEvent}>
        {ICONS.add} {t.actions.newEvent}
      </button>
    </Sheet>
  );
}

// Shared wiring for the recursive concurrency render (ADR-0041): keeps every
// builder row's edit/park/delete/reorder identical whether it's top-level,
// nested inside an envelope, or a member of an overlap cluster.
interface BuilderCtx {
  tz: string;
  /** Per-event zone resolution + the day's ambient zone (ADR-0107 multi-zone). */
  zoneCtx: ZoneContext;
  readOnly: boolean;
  // Epoch ms of "now" when the builder should show the static now-reference at
  // depth 0 (viewing today, mid-trip); null otherwise (ADR-0043).
  nowRefMs: number | null;
  bookings: Booking[];
  places: Place[];
  verbs: ReturnType<typeof useVerbs>;
  dayEvents: TripEvent[];
  softEvents: TripEvent[];
  softIndex: Map<string, number>;
  drag: { id: string; overId: string | null } | null;
  gripProps: (id: string) => {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: () => void;
  };
  onEdit: (event: TripEvent) => void;
  // Tapping a transition row opens the read-only booking detail (ADR-0064).
  onOpenDetail: (booking: Booking) => void;
  onGapFill: (fill: GapDefaults) => void;
  onResolve: (cluster: TimeGroup) => void;
}

const groupMembers = (g: TimeGroup): TimeItem[] => (g.kind === 'cluster' ? g.items : [g.item]);
const startMsOf = (e: TripEvent) => Date.parse(e.startsAt!);
const endMsOf = (e: TripEvent) => Date.parse(e.endsAt ?? e.startsAt!);
const groupStartEvent = (g: TimeGroup): TripEvent =>
  groupMembers(g).reduce((a, b) => (startMsOf(b.event) < startMsOf(a.event) ? b : a)).event;
const groupEndEvent = (g: TimeGroup): TripEvent =>
  groupMembers(g).reduce((a, b) => (endMsOf(b.event) > endMsOf(a.event) ? b : a)).event;

/** Total events nested anywhere inside an item — the "כולל N" count. */
function countDescendants(item: TimeItem): number {
  return item.children.reduce(
    (sum, g) => sum + groupMembers(g).reduce((s, it) => s + 1 + countDescendants(it), 0),
    0,
  );
}

/** Minutes this cluster member overlaps an earlier one (the seam tag), or none. */
function overlapSeam(items: TimeItem[], idx: number): string | undefined {
  const cur = items[idx].event;
  let best = 0;
  for (let j = 0; j < idx; j++) {
    const prev = items[j].event;
    const ov = Math.min(endMsOf(cur), endMsOf(prev)) - Math.max(startMsOf(cur), startMsOf(prev));
    if (ov > best) best = ov;
  }
  return best > 0 ? t.planDay.overlapSeam(gapLabel(Math.round(best / 60000))) : undefined;
}

// One sibling level: partial-overlap clusters get a violet "חופפים" box, lone
// items render directly. Gap chips sit only between top-level groups (depth 0).
// At depth 0 the day's multi-day-bracket transition points are interleaved by
// instant (ADR-0064 §B) as read-only reference rows — they are not builder rows
// (no grip/drag/⋯/edit, not a drop target), and they neither open nor close a
// plannable gap, so gap chips stay computed between consecutive EVENT groups.
function BuilderGroups({
  groups,
  depth,
  ctx,
  transitions,
}: {
  groups: TimeGroup[];
  depth: number;
  ctx: BuilderCtx;
  transitions?: BookingTransition[];
}) {
  // The static now-reference sits at depth 0 only, above the first entry that
  // isn't fully behind "now" (a transition point ends at its own instant); it
  // falls after them all if every entry is passed.
  const nowRefMs = depth === 0 ? ctx.nowRefMs : null;
  const entries = mergeDayEntries(groups, depth === 0 ? (transitions ?? []) : []);
  const entryEndMs = (entry: DayEntry) =>
    entry.kind === 'event' ? endMsOf(groupEndEvent(entry.group)) : entry.atMs;
  const nowRefIndex =
    nowRefMs === null
      ? -1
      : (() => {
          const i = entries.findIndex((e) => entryEndMs(e) > nowRefMs);
          return i === -1 ? entries.length : i;
        })();
  // Gaps are measured between consecutive EVENT groups only — a transition point
  // interleaved between two groups doesn't break their adjacency for gap-fill.
  let prevEventGroup: TimeGroup | null = null;
  return (
    <>
      {entries.map((entry, i) => {
        const nowRef =
          i === nowRefIndex && nowRefMs !== null ? <NowRef ms={nowRefMs} tz={ctx.tz} /> : null;
        if (entry.kind === 'transition') {
          return (
            <Fragment key={`${entry.event.id}-${entry.edge}`}>
              {nowRef}
              <TransitionRow
                entry={entry}
                tz={ctx.tz}
                {...eventEdgeZone(entry.event, entry.edge, ctx.zoneCtx)}
                bookings={ctx.bookings}
                onOpen={ctx.onOpenDetail}
              />
            </Fragment>
          );
        }
        const g = entry.group;
        const gap =
          depth === 0 && prevEventGroup && !ctx.readOnly
            ? gapBetween(groupEndEvent(prevEventGroup), groupStartEvent(g), ctx.tz)
            : null;
        prevEventGroup = g;
        const key = g.kind === 'cluster' ? `cl-${g.items[0].event.id}` : g.item.event.id;
        return (
          <Fragment key={key}>
            {nowRef}
            {gap && (
              <div className="gap">
                <span className="gap-line" />
                <button className="gap-add" onClick={() => ctx.onGapFill(gap.fill)}>
                  {t.planDay.gap(gapLabel(gap.minutes))}
                </button>
                <span className="gap-line" />
              </div>
            )}
            {g.kind === 'cluster' ? (
              <div className="bld-cluster">
                <div className="bld-cluster-head">
                  <span className="lead">
                    <span aria-hidden="true">⧉</span> {t.planDay.overlapping} ·{' '}
                    <span className="win" dir="ltr">
                      {formatTime(new Date(g.startMs), ctx.tz)}–
                      {formatTime(new Date(g.endMs), ctx.tz)}
                    </span>
                  </span>
                  {!ctx.readOnly && (
                    <button className="bld-resolve" onClick={() => ctx.onResolve(g)}>
                      {t.planDay.resolve} <Icon name="caret" dir="down" />
                    </button>
                  )}
                </div>
                {g.items.map((item, idx) => (
                  <BuilderNode
                    key={item.event.id}
                    item={item}
                    depth={depth + 1}
                    ctx={ctx}
                    overlapNote={overlapSeam(g.items, idx)}
                  />
                ))}
              </div>
            ) : (
              <BuilderNode item={g.item} depth={depth} ctx={ctx} />
            )}
          </Fragment>
        );
      })}
      {nowRefMs !== null && nowRefIndex === entries.length && <NowRef ms={nowRefMs} tz={ctx.tz} />}
    </>
  );
}

// The Plan builder's static now-reference (ADR-0043): a drafting guide for where
// "now" falls while building today — deliberately NOT the Trip now-line. Plan's
// violet, a dashed rule, a hollow marker, no pulse or glow, so it can never read
// as a live signal ("nothing in Plan mode is live", design-language).
function NowRef({ ms, tz }: { ms: number; tz: string }) {
  return (
    <div className="nowref" aria-label={t.day.nowLineAria(formatTime(new Date(ms), tz))}>
      <span className="nowref-tag">
        <span className="nowref-ring" aria-hidden="true" />
        {t.common.now}{' '}
        <span className="nowref-tm" dir="ltr">
          {formatTime(new Date(ms), tz)}
        </span>
      </span>
      <span className="nowref-rule" />
    </div>
  );
}

// One builder row; if it contains others it becomes a nest (the row + its
// contents indented beneath a brace).
function BuilderNode({
  item,
  depth,
  ctx,
  overlapNote,
}: {
  item: TimeItem;
  depth: number;
  ctx: BuilderCtx;
  overlapNote?: string;
}) {
  const e = item.event;
  const si = ctx.softIndex.get(e.id);
  const soft = si !== undefined;
  const earlierId = soft && si > 0 ? ctx.softEvents[si - 1].id : undefined;
  const laterId = soft && si < ctx.softEvents.length - 1 ? ctx.softEvents[si + 1].id : undefined;
  const hasKids = item.children.length > 0;
  const booking = e.bookingId ? ctx.bookings.find((b) => b.id === e.bookingId) : undefined;
  const zones = eventZones(e, ctx.zoneCtx);
  // Same route treatment as the Trip-mode day row (ADR-0059 §3 amendment).
  const route = routeDisplay(eventRoute(e, ctx.bookings, ctx.places));
  return (
    <>
      <BuilderRow
        event={e}
        tz={ctx.tz}
        title={route.title}
        placeName={route.meta ?? eventPlaceName(e, ctx.bookings, ctx.places)}
        zones={zones}
        duration={eventDurationLabel(e, booking, zones)}
        readOnly={ctx.readOnly}
        booking={booking}
        onEdit={() => ctx.onEdit(e)}
        onDelete={() => ctx.verbs.remove(e)}
        onPark={soft ? () => ctx.verbs.park(e) : undefined}
        grip={soft && !ctx.readOnly ? ctx.gripProps(e.id) : undefined}
        dragging={ctx.drag?.id === e.id}
        over={ctx.drag?.overId === e.id}
        onMoveEarlier={
          earlierId ? () => ctx.verbs.reorder(ctx.dayEvents, e.id, earlierId) : undefined
        }
        onMoveLater={laterId ? () => ctx.verbs.reorder(ctx.dayEvents, e.id, laterId) : undefined}
        nestedCount={hasKids ? countDescendants(item) : undefined}
        overlapNote={overlapNote}
        // Finished-trip archive: soft rows settle in place (ADR-0044). Hard
        // events aren't settled this way (ADR-0043), so they get no control.
        settle={
          ctx.readOnly && e.kind === EVENT_KIND.SOFT
            ? {
                status: e.status,
                onDone: () => ctx.verbs.done(e),
                onSkip: () => ctx.verbs.skip(e),
                onRestore: () => ctx.verbs.restore(e),
              }
            : undefined
        }
      />
      {hasKids && (
        <div className={'bld-nest-kids' + (depth >= 1 ? ' deep' : '')}>
          <BuilderGroups groups={item.children} depth={depth + 1} ctx={ctx} />
        </div>
      )}
    </>
  );
}

function BuilderRow({
  event,
  tz,
  title,
  zones,
  duration,
  readOnly,
  booking,
  placeName,
  onEdit,
  onDelete,
  onPark,
  grip,
  dragging,
  over,
  onMoveEarlier,
  onMoveLater,
  nestedCount,
  overlapNote,
  settle,
}: {
  event: TripEvent;
  tz: string;
  /** Title node — the screen passes `<EventTitle/>` so a transport row reads as
   *  its route; falls back to the stored title. */
  title?: ReactNode;
  /** Per-event display zones + the shift pill to show (ADR-0107). Absent → the
   *  row renders wholly in `tz` with no pill. */
  zones?: EventZones;
  /** Elapsed-duration label for transport + zone-shifted rows (ADR-0107/0084). */
  duration?: string;
  // A finished trip is a read-only archive (ADR-0040): the row is browsable but
  // carries no edit/reorder/delete affordances.
  readOnly?: boolean;
  booking?: { confirmationCode?: string };
  placeName?: string;
  onEdit: () => void;
  onDelete: () => void;
  // Present only for soft rows — move the event to the shelf as an idea.
  onPark?: () => void;
  // Present only for soft rows (hard events are pinned anchors, not draggable).
  grip?: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: () => void;
  };
  dragging?: boolean;
  over?: boolean;
  // undefined at the ends of the soft list (nothing to swap with)
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
  // Set on an envelope row that nests others: the "כולל N" contents count.
  nestedCount?: number;
  // Set on a cluster member that overlaps an earlier one: the seam tag text.
  overlapNote?: string;
  // Present only on a finished-trip archive soft row (ADR-0044): the settle
  // status + the verbs to change it. Absent = no settle control (live trip, or
  // a hard event, which isn't settled this way).
  settle?: {
    status: TripEvent['status'];
    onDone: () => void;
    onSkip: () => void;
    onRestore: () => void;
  };
}) {
  const isHard = event.kind === EVENT_KIND.HARD;
  const code = booking?.confirmationCode ? `${CODE_PREFIX}${booking.confirmationCode}` : undefined;
  const meta = [placeName, code && `${t.event.bookingLabel} ${code}`].filter(Boolean).join(' · ');

  const isSkipped = settle?.status === EVENT_STATUS.SKIPPED;
  const cls = [
    'bld',
    isHard ? '' : 'soft',
    dragging ? 'dragging' : '',
    over ? 'over' : '',
    isSkipped ? 'is-skip' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Row actions live behind one ⋯ button (a bottom sheet), not a strip of inline
  // icons — a phone row only has width for grip + title + time + one affordance
  // (mockups/plan-mode-v1.html). Edit is also reachable by tapping the row body.
  const [menuOpen, setMenuOpen] = useState(false);
  const runAction = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };
  // The archive settle control replaces the (hidden) ⋯ slot; an unresolved row
  // opens this chooser to record "we were there / skip" (ADR-0044).
  const [settleOpen, setSettleOpen] = useState(false);
  const onSettleKey = (fn: () => void) => (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  // In the archive a soft row wears its settle status (done/skipped/unresolved),
  // not the generic "גמיש" — the record is what matters there (ADR-0044).
  const softTag = settle ? (
    settle.status === EVENT_STATUS.DONE ? (
      <span className="tag-done">
        {ICONS.done} {t.event.didThis}
      </span>
    ) : settle.status === EVENT_STATUS.SKIPPED ? (
      <span className="tag-skip">{t.event.skipped}</span>
    ) : (
      <span className="tag-phase">{t.event.notMarked}</span>
    )
  ) : (
    <span className="tag-soft">{t.event.soft}</span>
  );

  const mainContent = (
    <>
      <span className="bld-t">
        <span className="bld-ttl">{title ?? event.title}</span>
        {isHard ? (
          <span className="tag-hard">
            {ICONS.lock} {t.event.hard}
          </span>
        ) : (
          softTag
        )}
        {overlapNote && <span className="seam-tag">⧉ {overlapNote}</span>}
        {nestedCount !== undefined && (
          <span className="nest-note">{t.day.contains(nestedCount)}</span>
        )}
      </span>
      {meta && <span className="bld-m">{meta}</span>}
    </>
  );

  return (
    <div className={cls} data-bld-id={event.id}>
      {grip ? (
        <span className="bld-reorder">
          <button className="bld-grip" aria-label={t.planDay.drag} {...grip}>
            ⠿
          </button>
          <span className="bld-move-stack">
            <button
              className="bld-move"
              onClick={onMoveEarlier}
              disabled={!onMoveEarlier}
              aria-label={t.planDay.moveEarlier}
            >
              <Icon name="caret" dir="up" />
            </button>
            <button
              className="bld-move"
              onClick={onMoveLater}
              disabled={!onMoveLater}
              aria-label={t.planDay.moveLater}
            >
              <Icon name="caret" dir="down" />
            </button>
          </span>
        </span>
      ) : isHard ? (
        <span className="bld-anchor" aria-label={t.planDay.pinned} title={t.planDay.pinned}>
          {ICONS.lock}
        </span>
      ) : (
        <span className="bld-reorder" aria-hidden="true" />
      )}
      <span className="bld-bd" aria-hidden="true">
        {event.icon}
      </span>
      {readOnly ? (
        <div className="bld-main">{mainContent}</div>
      ) : (
        <button className="bld-main" onClick={onEdit}>
          {mainContent}
        </button>
      )}
      {event.startsAt &&
        (() => {
          const startZone = zones?.startZone ?? tz;
          const endZone = zones?.endZone ?? tz;
          return (
            <span className="bld-time">
              <span dir="ltr">
                {formatTime(event.startsAt, startZone)}
                {event.endsAt && `–${formatTime(event.endsAt, endZone)}`}
                {event.endsAt &&
                  crossesMidnightZoned(event.startsAt, event.endsAt, startZone, endZone) && (
                    <sup className="xmid" title={t.event.nextDay}>
                      +1
                    </sup>
                  )}
              </span>
              {(duration || zones?.deltaMinutes != null) && (
                <span className="bld-timemeta">
                  {duration && <span className="bld-dur">{duration}</span>}
                  {zones?.deltaMinutes != null && (
                    <span className="bld-tzdelta" dir="ltr" title={t.event.zoneShift}>
                      🕐 {formatZoneDelta(zones.deltaMinutes)}
                    </span>
                  )}
                </span>
              )}
            </span>
          );
        })()}
      {!readOnly && (
        <button
          className="bld-icon"
          onClick={() => setMenuOpen(true)}
          aria-label={t.planDay.rowActions}
        >
          {ICONS.more}
        </button>
      )}
      {/* Archive settle control (ADR-0044) — takes the ⋯ slot the read-only row
          leaves free. Done ✓ / skipped ↩ restore in one tap (the ✓ morphs to an
          undo arrow on hover/focus); an unresolved ○ opens the settle chooser. */}
      {settle &&
        (settle.status === EVENT_STATUS.DONE ? (
          <span
            className="bld-settle done"
            role="button"
            tabIndex={0}
            aria-label={t.actions.undoDone}
            title={t.actions.undoDone}
            onClick={settle.onRestore}
            onKeyDown={onSettleKey(settle.onRestore)}
          >
            <span className="mark" aria-hidden="true">
              {ICONS.done}
            </span>
            <span className="undo" aria-hidden="true">
              <Icon name="undo" />
            </span>
          </span>
        ) : settle.status === EVENT_STATUS.SKIPPED ? (
          <span
            className="bld-settle restore"
            role="button"
            tabIndex={0}
            aria-label={t.actions.restore}
            title={t.actions.restore}
            onClick={settle.onRestore}
            onKeyDown={onSettleKey(settle.onRestore)}
          >
            <Icon name="undo" />
          </span>
        ) : (
          <span
            className="bld-settle ghost"
            role="button"
            tabIndex={0}
            aria-label={t.planDay.settleUnresolved}
            title={t.planDay.settleUnresolved}
            onClick={() => setSettleOpen(true)}
            onKeyDown={onSettleKey(() => setSettleOpen(true))}
          >
            ○
          </span>
        ))}
      {!readOnly && menuOpen && (
        <Sheet title={event.title} onClose={() => setMenuOpen(false)}>
          <div className="row-actions">
            <button className="row-action" onClick={() => runAction(onEdit)}>
              <span className="row-action-ic" aria-hidden="true">
                {ICONS.edit}
              </span>
              {t.actions.edit}
            </button>
            {onPark && (
              <button className="row-action" onClick={() => runAction(onPark)}>
                <span className="row-action-ic" aria-hidden="true">
                  {ICONS.toShelf}
                </span>
                {t.planDay.toShelf}
              </button>
            )}
            <button className="row-action danger" onClick={() => runAction(onDelete)}>
              <span className="row-action-ic" aria-hidden="true">
                {ICONS.trash}
              </span>
              {t.actions.delete}
            </button>
          </div>
        </Sheet>
      )}
      {settle && settleOpen && (
        <Sheet title={t.planDay.settleTitle(event.title)} onClose={() => setSettleOpen(false)}>
          <div className="settle-choose">
            <button
              className="settle-yes"
              onClick={() => {
                setSettleOpen(false);
                settle.onDone();
              }}
            >
              {ICONS.done} {t.actions.wasThere}
            </button>
            <button
              className="settle-skip"
              onClick={() => {
                setSettleOpen(false);
                settle.onSkip();
              }}
            >
              {t.actions.skip}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// Add an idea to the shelf (Plan-mode Tier 3). Manual entry until Places
// research (Map tab) lands; icon defaults server-agnostically in verbs.addMaybe.
function AddIdea({
  onAdd,
}: {
  onAdd: (title: string, icon: string, category: EventCategory | undefined) => void;
}) {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(DEFAULT_MAYBE_ICON);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    // A shelf idea is a quick jot — no category here (ADR-0109 §11 revised, session
    // 76 feedback): a full category picker on the day-view quick-add is awkward and
    // category isn't a must for a maybe. It's captured when the idea is scheduled
    // into an event (EventForm's selector), the point category actually matters.
    onAdd(trimmed, icon, undefined);
    setTitle('');
    setIcon(DEFAULT_MAYBE_ICON);
  };
  return (
    <form className="add-idea" onSubmit={submit}>
      <IconPicker icon={icon} onChange={(next) => setIcon(next)} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t.planDay.addIdeaPlaceholder}
        aria-label={t.planDay.addIdea}
      />
      <button type="submit" className="add-idea-btn" disabled={!title.trim()}>
        {ICONS.add}
      </button>
    </form>
  );
}
