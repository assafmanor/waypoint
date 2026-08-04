// Plan-mode Day-by-day — the itinerary BUILDER (modes.md; ADR-0025 Tier 3;
// mockups/plan-mode-v1.html). Trip mode follows/adjusts the day (quick verbs);
// Plan mode builds it — so rows are structural: tap the row opens the edit
// sheet, the ⋯ button opens a per-row action sheet (edit · move-to-shelf ·
// delete), and gap chips + the shelf fill the day. One trailing affordance per
// row, not a strip of icons — the phone has no width for it (ADR-0017).
//
// Editing reuses EventForm (add + edit, incl. hard↔soft flip, time, and
// cross-day via its date field). A soft row is dragged by a press-and-hold from
// anywhere on it (session-119, no grip and no ▲/▼ pair — those live in the ⋯ sheet
// now). **Where it lands names a POSITION and the event keeps its own length**
// (ADR-0161): dropping on another row TRADES POSITIONS with it (verbs.swapPositions →
// planSwap), on a seam or a gap chip moves it into that slot, on a shelf group parks it,
// on the day strip moves it to that day. The list stays time-ordered and hard events are
// pinned anchors (ADR-0011) — never a drag source, never a swap target, but the seams on
// either side of one are both.
import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
import { useDragState } from '../state/drag-state';
import { useSpringLoadedDay } from '../lib/useSpringLoadedDay';
import { useVerbs } from '../state/verbs';
import {
  usePlaceErrandReturn,
  useShowMaybesOnMap,
  useShowPlaceOnMap,
} from '../state/map-scope-state';
import { useClock } from '../lib/useClock';
import {
  eventDurationLabel,
  eventEdgeZone,
  eventPlaceName,
  eventRoute,
  eventShowOnMap,
  eventZones,
  dayZoneContext,
  liveToday,
  liveZone,
  type EventZones,
  type ShowPlaceOnMap,
  type ZoneContext,
} from '../lib/places';
import { tripPhase } from '../lib/mode';
import {
  buildTimeTree,
  clockRange,
  formatTime,
  zonedIso,
  crossesMidnightZoned,
  type TimeGroup,
  type TimeItem,
} from '../lib/time';
import {
  blockFor,
  earnsChip,
  freeAfterLast,
  freeBeforeFirst,
  freeBetween,
  freeWholeDay,
  nextSlot,
  type Gap,
  type GapDefaults,
} from '../lib/gaps';
import {
  dayStops,
  rankIdeas,
  shelfForSlot,
  shelfGroups,
  stopReasonText,
  tileReasonText,
} from '../lib/shelf';
import { SHELF_POOL_CAP } from '../constants';
import {
  resolveRowDrop,
  resolveShelfDrop,
  ROW_DROP_ACTION,
  SHELF_DRAG,
  SHELF_DROP,
  SHELF_DROP_ACTION,
  type ShelfDrop,
  type ShelfDropTarget,
} from '../lib/shelf-drop';
import { useEdgeAutoScroll, type DragPoint } from '../lib/edge-autoscroll';
import { useHoldToDrag, type HoldToDragProps } from '../lib/useHoldToDrag';
import { useDragGhost } from '../lib/useDragGhost';
import {
  CODE_PREFIX,
  CONTROL_ICON,
  DAY_NOON,
  DEFAULT_MAYBE_ICON,
  DEFAULT_STAY_ICON,
  DOT_SEPARATOR,
  MS_PER_DAY,
  MINUTES_PER_HOUR,
} from '../constants';
import {
  dayTransitions,
  groupEndEvent,
  groupMembers,
  groupStartEvent,
  mergeDayEntries,
} from '../lib/day-entries';
import { nowLinePlacement } from '../lib/now-line';
import type { BookingTransition } from '../lib/glance';
import { ambientSpanLabel } from '../lib/glance';
import { t } from '../i18n/he';
import { EventForm, type EventFormDraft } from '../ui/EventForm';
import { BookingSheet, type BookingSheetDraft } from '../ui/BookingSheet';
import { BookingDetail } from '../ui/BookingDetail';
import { TransitionRow } from '../ui/TransitionRow';
import { routeDisplay } from '../ui/route-display';
import { IconPicker } from '../ui/IconPicker';
import { Icon } from '../ui/Icon';
import { NavArrow } from '../ui/NavArrow';
import { ZoneShiftPill } from '../ui/ZoneShiftPill';
import { Sheet } from '../ui/Sheet';
import { FormStepPanel, useFormSteps } from '../ui/primitives/FormSteps';
import { TitleLabel } from '../ui/TitleLabel';
import { RowActionList, SettleControl, type RowAction } from '../ui/domain';
import { DaySlotPicker, type DaySlotOption } from '../ui/domain/DaySlotPicker';
import { dayPositions, POSITION_AT, type DayPosition } from '../lib/day-positions';
import { typicalMinutesFor } from '@waypoint/shared';
import { MaybeCard, MaybeMoreCard } from '../ui/domain/MaybeCard';
import { MaybeManageSheet } from '../ui/MaybeManageSheet';
import { SlotFillSheet } from '../ui/domain/SlotFillSheet';
import { noteCountFor, noteCountsByHost } from '../lib/notes';
import { PlaceBadge } from '../ui/domain/PlaceBadge';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

/** What is being dragged off the shelf. Both kinds travel the same drag: only the
 *  drop WRITE differs (`lib/shelf-drop.ts` decides which), so this is a tagged
 *  subject rather than a second drag implementation. */
type ShelfDragSubject =
  | { kind: typeof SHELF_DRAG.IDEA; item: MaybeItem }
  | { kind: typeof SHELF_DRAG.SKIPPED; event: TripEvent };

const subjectId = (s: ShelfDragSubject) => (s.kind === SHELF_DRAG.IDEA ? s.item.id : s.event.id);

/** A builder row being dragged, and what the pointer is over. */
type RowDrag = {
  id: string;
  /** Another soft row, to swap slots with. */
  overId: string | null;
  /** A shelf group: dropping there takes the row OFF the day and parks it as an idea
   *  (session-118) — the reverse of dragging a card onto a gap, and the same targets. */
  overShelf: ShelfDrop | null;
  /** A day pill: dropping there moves the event to that day (session-119). */
  overDate: string | null;
  /** A gap chip, and the slot it offers: dropping there moves the event into that free
   *  time, on whichever day the chip belongs to (session-123). */
  overGap: string | null;
  fill?: GapDefaults;
  /** The empty day's drop zone — which can only be another day (session-123). */
  overDay: boolean;
} | null;

/** A shelf card being dragged, and what the pointer is over. */
type IdeaDrag = {
  id: string;
  overGap: string | null;
  fill?: GapDefaults;
  /** Which shelf group the pointer is over: the day's, or the pool's. */
  overShelf: ShelfDrop | null;
  /** Over the empty day's drop zone, which has no slot to offer (session-117). */
  overDay: boolean;
  /** A day pill: dropping there aims the idea at that day (session-119). */
  overDate: string | null;
} | null;

/** A gap's identity for the drag hit-test: its own slot. Stable across renders and
 *  unique per day, so no synthetic id has to be invented or stored. */
const gapKey = (fill: GapDefaults) => `${fill.date}T${fill.start}-${fill.end}`;

// What is under the pointer, asked the same way by both drags (session-123 — the row
// drag reads gaps and the empty day now, so these stopped being the card drag's own).
/** The POSITION under the pointer, and the slot it offers — a gap chip or a seam, since
 *  both carry the same `data-gap-*` and are therefore one target here (ADR-0161 §2). The
 *  slot travels on the element itself, so no lookup table and no id has to be minted for
 *  something that only exists for this render. */
const gapAt = (el: Element | null): { key: string; fill: GapDefaults } | null => {
  const chip = el?.closest('[data-gap-key]') as HTMLElement | null;
  const { gapKey: key, gapDate, gapStart, gapEnd } = chip?.dataset ?? {};
  return key && gapDate && gapStart && gapEnd
    ? { key, fill: { date: gapDate, start: gapStart, end: gapEnd } }
    : null;
};
/** Which shelf group the pointer is over: the day's, or the pool's. */
const shelfAt = (el: Element | null) =>
  ((el?.closest('[data-shelf-drop]') as HTMLElement | null)?.dataset.shelfDrop as
    ShelfDrop | undefined) ?? null;
/** The empty day's drop zone, which exists only while a drag is in flight. */
const dayDropAt = (el: Element | null) => el?.closest('[data-day-drop]') != null;

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
  const {
    trip,
    events,
    maybeItems,
    bookings,
    places,
    notes,
    activeDate,
    setActiveDate,
    zoneEvidence,
  } = useTrip();
  const verbs = useVerbs();
  const now = useClock();
  // The builder's way to the map (ADR-0121 §8), on every row whose event resolves a
  // coord-bearing place. It is the only surface here that needs it: the row's own tap
  // opens the edit form, which carries no location view of its own.
  const showPlaceOnMap = useShowPlaceOnMap();
  const showMaybesOnMap = useShowMaybesOnMap();
  const tz = trip.timezone;
  // A finished trip is a read-only archive (ADR-0040): the builder becomes a
  // frozen, browsable history — no create/edit/delete/move, no shelf.
  const readOnly = tripPhase(trip, now) === 'past';
  // A static "now" reference while building TODAY mid-trip (ADR-0043): a drafting
  // guide for "what's still ahead to build," never a live signal. Only when the
  // day on screen is today and the trip is live — Plan has no "now" otherwise.
  // The live zone (ADR-0107 §4 + session 102): the clock reads the same in both
  // modes, so which day counts as "today" — and what the now-reference shows —
  // doesn't shift when you switch over to build.
  const nowZone = liveZone(now.getTime(), zoneEvidence);
  const nowRefMs =
    tripPhase(trip, now) === 'live' && activeDate === liveToday(now.getTime(), zoneEvidence)
      ? now.getTime()
      : null;
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
  // The idea's own surface (ADR-0116's 2026-08-01 amendment): a tap opens this, the hold
  // still drags. `שיבוץ ליום` inside it reaches `openSchedule` below.
  const [ideaSheet, setIdeaSheet] = useState<MaybeItem | null>(null);
  // Built once per note-list change rather than filtered per tile (ADR-0152 §6c).
  const noteCounts = useMemo(() => noteCountsByHost(notes), [notes]);
  // A gap the user tapped "＋ שבץ" on — opens a chooser to drop an existing shelf
  // idea into the gap's slot, or start a fresh event there (#21).
  // The POSITION a `＋ שבץ` chip was tapped on — the whole `Gap`, not just its slot, because
  // filling it needs the room to cap a category's length against (ADR-0161 §5).
  const [gapChoice, setGapChoice] = useState<Gap | null>(null);
  // An overlap cluster being resolved via "הזז" (ADR-0041). WHICH soft event moves is
  // the sheet's own first step now (ADR-0155) — it lived here only because the step
  // state was hand-rolled, and nothing outside the sheet ever read it.
  const [resolveCluster, setResolveCluster] = useState<TimeGroup | null>(null);

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

  // Multi-day bracketed bookings (a hotel, a red-eye flight) are ambient — off
  // `dayEvents` — so their edge days would show nothing in the list. Interleave
  // their transition points (check-in/out, departure/arrival) among the builder
  // groups by instant (ADR-0064 §B); same-day brackets stay a single span row.
  const transitions = dayTransitions(events, activeDate);

  // Reorder acts on soft events only (hard events are pinned anchors, ADR-0011).
  const softEvents = dayEvents.filter((e) => e.kind === EVENT_KIND.SOFT);
  const softIndex = new Map(softEvents.map((e, i) => [e.id, i]));

  // The builder has two drags — a soft row and a shelf card — and as of session-119
  // they are the same gesture (press-and-hold, from anywhere on the thing) over the
  // same mechanisms: one edge auto-scroll, so a drag can reach a target that isn't on
  // screen yet; one ghost, so the thing you're holding follows your finger; and one
  // hold arbitrator, which also owns the selection guard.
  const autoScroll = useEdgeAutoScroll();
  const ghost = useDragGhost();
  const holdToDrag = useHoldToDrag();
  // The header's day strip renders from these: `dragging` arms its pills as drop
  // targets, `overDate` shows which one a drop would land on (session-119).
  const { setDragging, overDate, setOverDate } = useDragState();
  // …and resting on a pill switches to that day, so a card or a row can be carried to
  // a day that isn't on screen. The dwell lives here because only the drag can
  // hit-test the pointer — see the hook for why the pill can't do it itself.
  useSpringLoadedDay(overDate, activeDate, setActiveDate);

  // A drag now OUTLIVES the render it began in: the window listeners that track it
  // hold the handlers from the render at touch-down, and dwelling on the day strip
  // changes the day — and therefore this screen's whole day-scoped world — underneath
  // it. So anything a drop needs is read live from here rather than closed over. (It
  // also stops a collaborator's change landing mid-gesture from being dropped onto a
  // stale list, which was always latent.)
  // Assigned during render, deliberately: every value here is read only from an event
  // handler, never during rendering, so there is nothing to tear. `drag`/`ideaDrag`
  // are in here for the same staleness reason — a release closes over the state as it
  // was at touch-down, when no drag had started yet, so the drop must read what the
  // last hit-test actually found.
  const live = useRef({ activeDate, dayEvents, drag: null as RowDrag, idea: null as IdeaDrag });
  live.current.activeDate = activeDate;
  live.current.dayEvents = dayEvents;
  /** The day the drag was lifted from, to go back to if it comes to nothing. */
  const dayAtLift = useRef(activeDate);
  /** A cancelled or invalid drop leaves no trace, and that includes which day you are
   *  looking at: the day switch was scaffolding for a drag that didn't happen. A
   *  COMMITTED drop keeps the new day — you just put something there. Day changes are
   *  `replace` navigation with no back step (ADR-0035/0090), so a switch left behind by
   *  an abandoned gesture would have no reverse gear at all. */
  const restoreDay = () => {
    if (live.current.activeDate !== dayAtLift.current) setActiveDate(dayAtLift.current);
  };
  /** Everything a finished drag must put back, whichever way it ended. */
  const endDrag = () => {
    autoScroll.stop();
    setDragging(false);
    setOverDate(null);
  };
  /** Which day pill, if any, is under the pointer — the header strip marks its own
   *  (`data-day-pill`, not to be confused with an empty day's `data-day-drop`). */
  const dayPillAt = (el: Element | null) =>
    (el?.closest('[data-day-pill]') as HTMLElement | null)?.dataset.dayPill ?? null;
  const [drag, setDrag] = useState<RowDrag>(null);
  // A row drags on a press-and-hold from ANYWHERE on it (session-119) — the same
  // gesture the shelf card uses, through the same hook. It used to need a dedicated
  // ⠿ grip because the drag armed on contact and would otherwise have eaten the row's
  // tap; time arbitrates instead, so the handle (and the ▲/▼ fallback beside it) is
  // retired and the row gets that width back. Reorder stays keyboard-reachable in the
  // row's ⋯ sheet, which is where row actions live anyway.
  const rowDragProps = (id: string) =>
    holdToDrag({
      onArm: (el, at) => {
        autoScroll.start(el, at, hitTestRowDrop);
        ghost.lift(el, at);
        dayAtLift.current = live.current.activeDate;
        setDragging(true);
        const started = {
          id,
          overId: null,
          overShelf: null,
          overDate: null,
          overGap: null,
          overDay: false,
        };
        live.current.drag = started;
        setDrag(started);
      },
      onCancel: () => {
        endDrag();
        setDrag(null);
        restoreDay();
      },
      onMove: (point) => {
        autoScroll.track(point);
        ghost.track(point);
        hitTestRowDrop(point);
      },
      onDrop: () => {
        endDrag();
        const target = live.current.drag;
        live.current.drag = null;
        setDrag(null);
        if (!target || !commitRowDrop(target)) restoreDay();
      },
    });

  // Same shape as the shelf drag's hit-test, and for the same reason: it runs on every
  // move AND on every frame the auto-scroll actually scrolls, because content moving
  // under a stationary finger changes the answer just as much as the finger moving.
  const hitTestRowDrop = (point: DragPoint) => {
    const d = live.current.drag;
    if (!d) return;
    const el = document.elementFromPoint(point.clientX, point.clientY);
    const overId = (el?.closest('[data-bld-id]') as HTMLElement | null)?.dataset.bldId ?? null;
    const overRow = overId && overId !== d.id && softIndex.has(overId) ? overId : null;
    const overShelf = shelfAt(el);
    const overDate = dayPillAt(el);
    // A position takes the row too (session-123): the same chips AND, since ADR-0161 §2,
    // the seams between every pair — read the same way the card drag reads them, so a row
    // carried anywhere has somewhere to land that isn't the shelf.
    const gap = gapAt(el);
    const overDay = dayDropAt(el);
    if (
      overRow === d.overId &&
      overShelf === d.overShelf &&
      overDate === d.overDate &&
      (gap?.key ?? null) === d.overGap &&
      overDay === d.overDay
    ) {
      return;
    }
    const next = {
      ...d,
      overId: overRow,
      overShelf,
      overDate,
      overGap: gap?.key ?? null,
      fill: gap?.fill,
      overDay,
    };
    live.current.drag = next;
    setDrag(next);
    setOverDate(overDate);
  };

  /** Carry out a row's release. Returns whether it committed anything, which is what
   *  decides if a mid-drag day switch sticks. */
  const commitRowDrop = (target: NonNullable<RowDrag>): boolean => {
    const { activeDate: day, dayEvents: rows } = live.current;
    const event = rows.find((e) => e.id === target.id) ?? dayEvents.find((e) => e.id === target.id);
    if (!event) return false;
    const action = resolveRowDrop(
      { id: target.id, date: event.date },
      {
        overRowId: target.overId,
        overShelf: target.overShelf,
        overDate: target.overDate,
        fill: target.fill,
        overDay: target.overDay,
      },
      day,
    );
    switch (action.kind) {
      case ROW_DROP_ACTION.SWAP:
        verbs.swapPositions(rows, target.id, action.targetId);
        return true;
      case ROW_DROP_ACTION.PARK:
        verbs.park(event, { targetDate: action.day });
        return true;
      case ROW_DROP_ACTION.MOVE_TO_DAY:
        // The event keeps its clock time on the new day, so the drop is "this, but
        // on Thursday" rather than "this, at some other time too". Guarded, because a
        // hard event changing days is a commitment change (ADR-0011).
        verbs.update(event, { date: action.day, ...sameTimeOn(event, action.day) });
        return true;
      case ROW_DROP_ACTION.MOVE_INTO:
        verbs.update(event, { date: action.fill.date, ...slotFor(event, action.fill) });
        return true;
      case ROW_DROP_ACTION.NONE:
        return false;
    }
  };

  /** The slot an EXISTING event gets when it is dropped into free time — a row moved
   *  into a gap, or a skipped card restored into one. It starts where the gap starts
   *  and keeps the length it already had: the chip's own end is a prefill for something
   *  being created (GAP_FILL_MINUTES), never a decision to shorten a two-hour visit to
   *  an hour. An untimed event has no length to keep, so it takes the chip's block —
   *  which is the whole point of dropping it on one. */
  const slotFor = (event: TripEvent, fill: GapDefaults) => {
    const startsAt = zonedIso(fill.date, fill.start, tz);
    if (!event.startsAt)
      return { startsAt, ...(fill.end ? { endsAt: zonedIso(fill.date, fill.end, tz) } : {}) };
    if (!event.endsAt) return { startsAt };
    const durationMs = Date.parse(event.endsAt) - Date.parse(event.startsAt);
    // Absolute ms, so an event long enough to run past midnight keeps its length
    // instead of needing the date arithmetic ADR-0037 already settled.
    return { startsAt, endsAt: new Date(Date.parse(startsAt) + durationMs).toISOString() };
  };

  /** The event's own start/end wall-clock times, rebuilt on another date. An untimed
   *  event has none, and moving it is just the date. */
  const sameTimeOn = (event: TripEvent, date: string) => {
    if (!event.startsAt) return {};
    const start = formatTime(new Date(event.startsAt), tz);
    const end = event.endsAt ? formatTime(new Date(event.endsAt), tz) : null;
    return {
      startsAt: zonedIso(date, start, tz),
      ...(end ? { endsAt: zonedIso(date, end, tz) } : {}),
    };
  };

  // The shelf, grouped by the one shared derivation (ADR-0116 §2) — same call the
  // Trip-mode day view makes, so the two shelves cannot drift again.
  const shelf = shelfGroups(maybeItems, events, activeDate);
  // …and ranked (ADR-0116 session-202 §3 / ADR-0151). Order and reason only; the
  // grouping, and every drop the drag can make, are unchanged.
  const stops = dayStops(events, bookings, places, activeDate);
  // Capped, with the tail handed to the Map's אולי facet (§5) — which is what keeps
  // the strip's width independent of how many ideas the trip has accumulated.
  const rankedPool = rankIdeas(shelf.pool, places, activeDate, stops, SHELF_POOL_CAP);
  const poolTail = shelf.pool.length - rankedPool.length;
  const reasonById = new Map(rankedPool.map((r) => [r.item.id, r.reason]));
  // The day's own group keeps its order (it is small by construction) and gains
  // only the distance line — see `stopReasonText` for why it says nothing else.
  const forDayReasons = new Map(
    rankIdeas(shelf.forDay, places, activeDate, stops).map((r) => [r.item.id, r.reason]),
  );
  /** Open the schedule form for an idea, prefilled at `fill` — the position a drop named, or
   *  the one the picker was used to choose. */
  const openSchedule = (m: MaybeItem, fill: GapDefaults) => {
    setGapFill(fill);
    setScheduleMaybe(m);
  };
  /** An idea being scheduled from its own sheet, i.e. with no position named yet: the picker
   *  asks WHERE first (ADR-0161 §4). The prefill used to be `nextSlot` — the end of the day's
   *  last event — so the app's opening offer for every idea was "after everything", on a day
   *  with a three-hour hole in the middle of it. */
  const [scheduleWhere, setScheduleWhere] = useState<MaybeItem | null>(null);
  /** The block an idea gets at a position: its category's typical length (ADR-0161 §5),
   *  capped by the room actually there. A flat hour made every meal an hour and every hike
   *  an hour. */
  const ideaBlock = (m: MaybeItem, free: Gap) => blockFor(free, typicalMinutesFor(m.category));

  // Drag a shelf card onto a gap (ADR-0116 §5). Deliberately the SAME mechanism as
  // the reorder grip above — pointer capture + a hit-test on the element under the
  // pointer — rather than a second drag implementation; only the target attribute
  // (`data-gap-key`) and the drop action differ. Dropping schedules the idea into
  // that gap's slot: exactly the write the gap-fill sheet already performs.
  const [ideaDrag, setIdeaDrag] = useState<IdeaDrag>(null);
  // What the pointer is over right now. Called on every move — and on every frame
  // the edge auto-scroll actually scrolls, because content moving under a
  // stationary finger changes the answer just as much as the finger moving does.
  const hitTestDropTarget = (point: DragPoint) => {
    const d = live.current.idea;
    if (!d) return;
    const el = document.elementFromPoint(point.clientX, point.clientY);
    const gap = gapAt(el);
    const overGap = gap?.key ?? null;
    // A shelf group is the other kind of target: dropping there re-aims the idea's DAY
    // (a pencil mark) rather than scheduling it (ADR-0116 §2).
    const overShelf = shelfAt(el);
    // …on a day with nothing on it there are no gaps at all, so the empty state itself
    // becomes a target while a drag is in flight (session-117)…
    const overDay = dayDropAt(el);
    // …and a day pill on the header strip names a day outright (session-119).
    const overDate = dayPillAt(el);
    if (
      overGap === d.overGap &&
      overShelf === d.overShelf &&
      overDay === d.overDay &&
      overDate === d.overDate
    ) {
      return;
    }
    const next = { ...d, overGap, overShelf, overDay, overDate, fill: gap?.fill };
    live.current.idea = next;
    setIdeaDrag(next);
    setOverDate(overDate);
  };

  // One drag, two subjects. Everything up to the release is identical — arm, follow,
  // hit-test, auto-scroll — so only `onDrop` asks what was being dragged.
  const shelfDragProps = (subject: ShelfDragSubject) =>
    holdToDrag({
      onArm: (el, at) => {
        autoScroll.start(el, at, hitTestDropTarget);
        ghost.lift(el, at);
        dayAtLift.current = live.current.activeDate;
        setDragging(true);
        const started = {
          id: subjectId(subject),
          overGap: null,
          overShelf: null,
          overDay: false,
          overDate: null,
        };
        live.current.idea = started;
        setIdeaDrag(started);
      },
      onCancel: () => {
        endDrag();
        setIdeaDrag(null);
        restoreDay();
      },
      onMove: (point) => {
        autoScroll.track(point);
        ghost.track(point);
        hitTestDropTarget(point);
      },
      onDrop: () => {
        endDrag();
        const target = live.current.idea;
        live.current.idea = null;
        setIdeaDrag(null);
        if (!target || !commitShelfDrop(subject, target)) restoreDay();
      },
    });

  const ideaDragProps = (m: MaybeItem) => shelfDragProps({ kind: SHELF_DRAG.IDEA, item: m });
  const skippedDragProps = (e: TripEvent) => shelfDragProps({ kind: SHELF_DRAG.SKIPPED, event: e });

  /** Every shelf card renders through here, so the day's group and the pool stop being
   *  two near-identical copies of the same markup (rule 8). The floating clone is NOT
   *  rendered from this — it's a DOM clone of the card the finger picked up
   *  (`lib/useDragGhost.ts`), which is what keeps it from drifting at all. */
  const shelfCard = (subject: ShelfDragSubject) => {
    // The source card stays in place as the slot the drag came out of.
    const dragging = ideaDrag?.id === subjectId(subject);
    if (subject.kind === SHELF_DRAG.SKIPPED) {
      const e = subject.event;
      return (
        <MaybeCard
          key={e.id}
          compact
          className="skipped-card"
          icon={e.icon}
          title={e.title}
          meta={t.day.skippedTag}
          // A skipped event's tap still restores it in place — it has a surface of its own
          // (its day row), so the gesture change is the idea's alone.
          onOpen={() => verbs.restore(e)}
          dragProps={skippedDragProps(e)}
          dragging={dragging}
        />
      );
    }
    const m = subject.item;
    return (
      <MaybeCard
        key={m.id}
        compact
        icon={m.icon}
        title={m.title}
        // A pool card carries its ranking reason; the day's own group carries the
        // distance or nothing (ADR-0116 §2, ADR-0151 §8).
        meta={
          reasonById.has(m.id)
            ? tileReasonText(reasonById.get(m.id)!, activeDate)
            : stopReasonText(forDayReasons.get(m.id))
        }
        notes={noteCountFor(noteCounts, 'maybeItem', m.id)}
        onOpen={() => setIdeaSheet(m)}
        onRemove={() => verbs.removeMaybe(m)}
        removeLabel={t.planDay.removeIdea}
        dragProps={ideaDragProps(m)}
        dragging={dragging}
      />
    );
  };

  /** Carry out what the release meant. The decision is `resolveShelfDrop`'s (one
   *  documented table, unit-tested without a browser); this only turns each outcome
   *  into the verb that already performs it. */
  const commitShelfDrop = (subject: ShelfDragSubject, target: ShelfDropTarget): boolean => {
    const action = resolveShelfDrop(subject.kind, target, live.current.activeDate);
    switch (action.kind) {
      case SHELF_DROP_ACTION.RESTORE_INTO:
        if (subject.kind !== SHELF_DRAG.SKIPPED) return false;
        // Un-skipped and moved in ONE patch, so it is one row in the change feed and
        // one undo — not "restored" followed by "moved". The gap carries its own day,
        // which is what a card dropped on a gap the drag WALKED to lands on.
        verbs.update(subject.event, {
          status: EVENT_STATUS.PLANNED,
          date: action.fill.date,
          ...slotFor(subject.event, action.fill),
        });
        return true;
      case SHELF_DROP_ACTION.RESTORE:
        if (subject.kind !== SHELF_DRAG.SKIPPED) return false;
        verbs.restore(subject.event);
        return true;
      case SHELF_DROP_ACTION.CHOOSE_TIME:
        if (subject.kind !== SHELF_DRAG.IDEA) return false;
        // A drop already named the position, so there is nothing to ask: straight to the form,
        // prefilled there. The one drop that names a DAY and no slot is the empty day's coarse
        // zone, and its answer is that day's own single position (§2's amendment) rather than
        // `nextSlot` over a day with nothing on it — same slot, derived rather than repeated.
        openSchedule(subject.item, action.fill ?? freeWholeDay(live.current.activeDate, tz).fill);
        return true;
      case SHELF_DROP_ACTION.AIM_DAY:
        if (subject.kind !== SHELF_DRAG.IDEA) return false;
        verbs.setMaybeDay(subject.item, action.day);
        return true;
      case SHELF_DROP_ACTION.NONE:
        return false;
    }
  };

  // A drag in flight conjures up whichever shelf group is empty, so there is
  // something to drop onto: a pool idea needs the day's group on a day nothing is
  // pencilled into yet, and a ROW being parked needs whichever group is missing —
  // on most days that's both (session-118). Chrome that exists only while it's useful.
  const draggingFromPool =
    ideaDrag != null && shelf.pool.some((m) => m.id === ideaDrag.id) && !ideaDrag.fill;
  const parkingRow = drag != null;
  const showDayGroup = shelf.forDay.length > 0 || shelf.skipped.length > 0;
  const showPoolGroup = shelf.pool.length > 0;
  /** Whether a floating clone is up: either drag can be the one holding it. */
  const dragLive = ideaDrag != null || drag != null;
  /** Is THIS group lit up? Either drag can be over it, and they light it the same way
   *  even though the drop means opposite things (re-aim a card / park a row). */
  const overShelf = (group: ShelfDrop) =>
    ideaDrag?.overShelf === group || drag?.overShelf === group;
  /** …and so is a position — a gap chip or a seam, which are one target in two densities
   *  (ADR-0161 §2). Both drags land in one, so both light it (session-123). */
  const overGap = (fill: GapDefaults) =>
    ideaDrag?.overGap === gapKey(fill) || drag?.overGap === gapKey(fill);
  /** The day's edge positions (session-123): the free time before the first event and
   *  after the last, which `freeBetween` cannot see because each has an event on one side
   *  only. Unfloored — `FreeSlot` decides whether each is a chip or a seam (ADR-0161 §2).
   *  Absent on a read-only archive, exactly like every other drop target. */
  const edgeFree = readOnly
    ? { before: null, after: null }
    : {
        before: freeBeforeFirst(dayEvents, activeDate, tz),
        after: freeAfterLast(dayEvents, activeDate, tz),
      };
  /** The day's first and last TIMED rows, which the edge positions sit beside — so a drag
   *  of either one can suppress the edge it is already at (the same rule the between-row
   *  positions apply in `BuilderGroups`). */
  const timed = dayEvents.filter((e) => e.startsAt);
  /** Is the held row already AT this edge, with no room there to make the drop mean
   *  anything? Same rule as between two rows: a chip is kept (it is a real move into free
   *  time), a seam beside the row being dragged is not. */
  const heldAtEdge = (free: Gap | null, edge: TripEvent | undefined) =>
    free != null && drag != null && edge?.id === drag.id && !earnsChip(free);
  /** **The day itself, when nothing timed can hold a position** — an empty day, a day of
   *  untimed rows, or one whose only entries are booking transition points. All three
   *  render a list (or an empty state) and all three used to accept a drop nowhere, because
   *  both edges answer null with no timed event to measure from. */
  const wholeDayFree = readOnly || edgeFree.before ? null : freeWholeDay(activeDate, tz);
  /** Nothing on the day at all — not even a booking's transition point. */
  const isEmptyDay = dayEvents.length === 0 && transitions.length === 0;

  // ── THE DAY AS A TIME PICKER (ADR-0161 §4/§7) ─────────────────────────────────────
  // Opened by tapping a row's own time. The options are `lib/day-positions.ts`'s, so the
  // sheet and the drag cannot disagree about where a position is or what slot it offers;
  // this only turns each one into words and performs the pick.
  const [timeTarget, setTimeTarget] = useState<TripEvent | null>(null);
  const closeTimePicker = () => setTimeTarget(null);
  /** A position, said in the same words the drag's seams use — deliberately, so the two
   *  ways to reach a position do not name it differently. */
  const positionOption = (p: DayPosition): DaySlotOption => ({
    key: p.key,
    label:
      p.at === POSITION_AT.AFTER && p.afterEvent ? (
        // The row above, and the one below when it is a HARD anchor: "before the flight" is
        // the more useful half of that pair, and the anchor is what the day is built around.
        <>
          {t.planDay.seamAfter('')}
          <TitleLabel title={p.afterEvent.title} />
          {p.beforeEvent?.kind === EVENT_KIND.HARD && (
            <span className="slotpick-before">
              {DOT_SEPARATOR} {t.planDay.seamBefore('')}
              <TitleLabel title={p.beforeEvent.title} />
            </span>
          )}
        </>
      ) : p.at === POSITION_AT.DAY_END ? (
        t.planDay.seamDayEnd
      ) : p.at === POSITION_AT.WHOLE_DAY ? (
        t.planDay.slotWholeDay
      ) : (
        t.planDay.seamDayStart
      ),
    time: p.free.fill.start,
    // `earnsChip`, not a second comparison against the threshold: the picker says "free
    // 2 hours" exactly where the day would have drawn a chip rather than a seam.
    free: earnsChip(p.free) ? t.planDay.slotFree(gapLabel(p.free.minutes)) : undefined,
    fill: p.free.fill,
  });
  /** The day's positions with one event taken out, as picker options — the row's time button
   *  and the overlap resolve both ask for exactly this. */
  const positionOptionsFor = (excludeId: string | null): DaySlotOption[] =>
    dayPositions(dayEvents, activeDate, tz, { exclude: excludeId ?? undefined }).map(
      positionOption,
    );
  /** Picking a position MOVES the event there, keeping its own length — the same write a
   *  drop on that position performs (`ROW_DROP_ACTION.MOVE_INTO`), through the same guard. */
  const pickPosition = (event: TripEvent, fill: GapDefaults) => {
    closeTimePicker();
    verbs.update(event, { date: fill.date, ...slotFor(event, fill) });
  };

  const dayNumber = daysBetween(trip.startDate, activeDate) + 1;
  const dayNoon = new Date(zonedIso(activeDate, DAY_NOON, trip.timezone));
  const weekday = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    timeZone: trip.timezone,
  }).format(dayNoon);

  // Multi-zone display (ADR-0107): literally the same context the Trip-mode day
  // view builds, from the same evidence — this screen used to derive its own
  // crossings and its own ambient, which is how the two day surfaces drifted apart
  // (session 100). One builder, one input, no room to diverge.
  const zoneCtx = dayZoneContext(activeDate, zoneEvidence);

  // RE-OPENING AFTER A PLACE ERRAND (ADR-0134 §2) — the same shape as `DayView`'s, through
  // the same shared hook: the form went to the Map tab to have a location picked, which
  // unmounted it, so it returns from its own draft with the chosen place already in place.
  const [formDraft, setFormDraft] = useState<EventFormDraft | null>(null);
  const closeForm = () => {
    setFormTarget(null);
    setGapFill(null);
    setScheduleMaybe(null);
    setFormDraft(null);
  };
  usePlaceErrandReturn<EventFormDraft>('event', 'days', (returned) => {
    if (!returned.draft) return;
    setFormTarget(events.find((e) => e.id === returned.target.id) ?? 'new');
    setFormDraft(returned.draft);
  });

  // RE-OPENING AFTER A PLACE ERRAND (ADR-0134 §2), through the same shared hook every other
  // form host uses: without it the sheet returns closed and the rest of what was typed is
  // gone, which is the whole reason the errand carries a draft.
  const [bookingDraft, setBookingDraft] = useState<BookingSheetDraft | null>(null);
  usePlaceErrandReturn<BookingSheetDraft>('booking', 'days', (returned) => {
    if (!returned.draft) return;
    setBookingTarget(bookings.find((b) => b.id === returned.target.id) ?? null);
    setBookingDraft(returned.draft);
  });

  const builderCtx: BuilderCtx = {
    tz,
    zoneCtx,
    readOnly,
    nowRefMs,
    nowZone,
    bookings,
    places,
    showPlaceOnMap,
    verbs,
    dayEvents,
    softEvents,
    softIndex,
    drag,
    rowDragProps,
    onEdit: (e) => {
      const booking = e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined;
      if (booking) setBookingTarget(booking);
      else setFormTarget(e);
    },
    onOpenDetail: setDetailTarget,
    onGapFill: setGapChoice,
    onPickTime: setTimeTarget,
    overGap,
    onResolve: (cluster) => setResolveCluster(cluster),
  };

  const closeResolve = () => setResolveCluster(null);

  return (
    // No drag-live class of this screen's own: `useHoldToDrag` already parks `wp-dragging`
    // on `<body>` for the length of an armed drag, and `screens.css` reveals §2's seams off
    // that. So the day at rest is byte-for-byte the day it was before ADR-0161, and there
    // is exactly one answer to "is a drag in flight" rather than this screen's union of
    // its own two drag states.
    <div className="builder">
      <div className="builder-main">
        <div className="sec-title">
          {t.day.heading(dayNumber, weekday, trip.destination)}
          <span className="sec-title-end">
            {readOnly ? (
              <span className="hint">{t.planDay.pastNote}</span>
            ) : (
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
                <span className="as">{ambientSpanLabel(e, activeDate)}</span>
              </div>
            ))}
          </div>
        )}

        {isEmptyDay && (
          // An empty day has no gap chips, so it had nothing to drop a card onto —
          // the one day where dragging an idea in is most obviously the point
          // (session-117). While a drag is in flight the empty state itself becomes
          // the target, the same "chrome that exists only while it's useful" move
          // the empty day GROUP already makes on the shelf (§2 amendment). It offers
          // no slot, so an idea dropped here opens the schedule sheet to pick a time,
          // and a ROW dropped here (session-123) simply moves to this day — it can only
          // be a day the drag walked to, since the day it came off has it on it.
          <div
            className={
              'builder-empty' +
              (dragLive ? ' droppable' : '') +
              (ideaDrag?.overDay || drag?.overDay ? ' drop-over' : '')
            }
            data-day-drop={dragLive ? '' : undefined}
          >
            {drag
              ? t.planDay.moveDayDropHere
              : ideaDrag
                ? t.planDay.dayDropHere
                : readOnly
                  ? t.planDay.pastEmpty
                  : t.planDay.empty}
          </div>
        )}
        {/* …and the day itself as a POSITION, which is what `שבץ` means: a drop here lands
            at a time on this day rather than carrying whatever clock time the event already
            had. It sits inside/below the empty state deliberately rather than replacing it,
            so the coarser "move it to this day, keep its time" target stays available — the
            chip is more specific, and `resolveRowDrop` already prefers a slot over a day. */}
        {wholeDayFree && (
          <FreeSlot
            free={wholeDayFree}
            label={t.planDay.gapWholeDay}
            seamLabel={t.planDay.seamDayStart}
            over={overGap(wholeDayFree.fill)}
            onFill={setGapChoice}
          />
        )}
        {!isEmptyDay && (
          <div>
            {/* The day's head: free time before the first event, which `freeBetween`
                cannot see because it has an event on one side only (session-123). */}
            {edgeFree.before && !heldAtEdge(edgeFree.before, timed[0]) && (
              <FreeSlot
                free={edgeFree.before}
                label={t.planDay.gapBefore(gapLabel(edgeFree.before.minutes))}
                seamLabel={t.planDay.seamDayStart}
                over={overGap(edgeFree.before.fill)}
                onFill={setGapChoice}
              />
            )}
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
            {/* …and its tail, below the untimed rows: they hold no clock position, so
                nothing sits "after the last event" but this. */}
            {edgeFree.after && !heldAtEdge(edgeFree.after, timed[timed.length - 1]) && (
              <FreeSlot
                free={edgeFree.after}
                label={t.planDay.gapAfter(gapLabel(edgeFree.after.minutes))}
                seamLabel={t.planDay.seamDayEnd}
                over={overGap(edgeFree.after.fill)}
                onFill={setGapChoice}
              />
            )}
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
            <Icon name="plus" /> {t.planDay.addToDay}
          </button>
        )}
      </div>

      {/* The maybe-shelf is trip-building (ADR-0025 Tier 3), so a finished
          read-only trip drops it entirely (ADR-0040). */}
      {!readOnly && (
        <div className="builder-side">
          <div className="sec-title">
            {t.day.maybeShelf}
            <span className="hint">{t.planDay.shelfHint}</span>
          </div>
          {/* Two groups (ADR-0116 §2), and Plan mode finally renders ADR-0027's
              union: the day's skipped soft events were invisible here, on the very
              surface you rebuild the day from. */}
          {/* Either group also appears while a drag is in flight, even when empty:
              without it there would be nothing to drop onto (ADR-0116 §2 amendment,
              extended in session-118 to a ROW being parked, which can target both). */}
          {(showDayGroup || draggingFromPool || parkingRow) && (
            <>
              {(showPoolGroup || draggingFromPool || parkingRow) && (
                <div className="shelf-group">{t.day.shelfForDay}</div>
              )}
              <div
                className={'shelf' + (overShelf(SHELF_DROP.DAY) ? ' drop-over' : '')}
                data-shelf-drop={SHELF_DROP.DAY}
              >
                {shelf.forDay.map((m) => shelfCard({ kind: SHELF_DRAG.IDEA, item: m }))}
                {/* A skipped card drags too (session-117): it is the card that most
                    obviously wants to go back onto the day, and it was the only one
                    you couldn't put there. */}
                {shelf.skipped.map((e) => shelfCard({ kind: SHELF_DRAG.SKIPPED, event: e }))}
                {!showDayGroup && (
                  <div className="shelf-dropzone">
                    {parkingRow ? t.planDay.parkDropHere : t.day.shelfDropHere}
                  </div>
                )}
              </div>
            </>
          )}
          {(showPoolGroup || parkingRow) && (
            <>
              {(showDayGroup || draggingFromPool || parkingRow) && (
                <div className="shelf-group">
                  {t.day.shelfRanked}
                  <span className="shelf-count">{shelf.pool.length}</span>
                </div>
              )}
              <div
                className={'shelf' + (overShelf(SHELF_DROP.POOL) ? ' drop-over' : '')}
                data-shelf-drop={SHELF_DROP.POOL}
              >
                {/* Scheduled (consumed) ideas leave the shelf — no dead "שובץ"
                    tombstone (ADR-0027: an idea is parked OR placed, never both). */}
                {rankedPool.map(({ item: m }) => shelfCard({ kind: SHELF_DRAG.IDEA, item: m }))}
                {/* The tail, and what makes the strip's width independent of N. It is
                    not a drop target: dropping an idea on a navigation means nothing,
                    and the drag is untouched by all of this. */}
                {poolTail > 0 && showMaybesOnMap && (
                  <MaybeMoreCard
                    label={t.day.shelfMore(poolTail)}
                    icon={<Icon name="map" />}
                    onOpen={showMaybesOnMap}
                  />
                )}
                {!showPoolGroup && (
                  <div className="shelf-dropzone">{t.planDay.parkSomedayDropHere}</div>
                )}
              </div>
            </>
          )}
          <AddIdea onAdd={(title, icon, category) => verbs.addMaybe(title, { icon, category })} />
        </div>
      )}

      {gapChoice && (
        <SlotFillSheet
          title={t.slotFill.gapTitle(clockRange(gapChoice.fill.start, gapChoice.fill.end))}
          mode="plan"
          date={gapChoice.fill.date}
          ideas={shelfForSlot(shelf, gapChoice.fill, tz, { events, bookings, places })}
          onPickIdea={(m) => {
            // The idea's own category decides how long it gets, capped by this position's room
            // (ADR-0161 §5) — a meal is an hour and a half, a hike three hours, and the flat
            // hour every create used to get was neither.
            const block = ideaBlock(m, gapChoice);
            verbs.schedule(m, {
              date: block.date,
              title: m.title,
              kind: EVENT_KIND.SOFT,
              startsAt: zonedIso(block.date, block.start, tz),
              endsAt: block.end ? zonedIso(block.date, block.end, tz) : undefined,
            });
            setGapChoice(null);
          }}
          onNewEvent={() => {
            // A NEW event keeps the position's own default block: its category is the form's
            // next question, so there is nothing yet to read a typical length from.
            setGapFill(gapChoice.fill);
            setFormTarget('new');
            setGapChoice(null);
          }}
          onClose={() => setGapChoice(null)}
        />
      )}

      {timeTarget && (
        <Sheet title={t.planDay.slotMoveTitle(timeTarget.title)} onClose={closeTimePicker}>
          <DaySlotPicker
            sub={t.planDay.slotWhen}
            options={positionOptionsFor(timeTarget.id)}
            onPick={(option) => pickPosition(timeTarget, option.fill)}
            // The way out to ADR-0036's start+duration setter, which is `EventForm` — where
            // an exact time and a length were always set, and still are.
            onExact={() => {
              closeTimePicker();
              setFormTarget(timeTarget);
            }}
          />
        </Sheet>
      )}

      {scheduleWhere && (
        <Sheet
          title={t.day.scheduleTitle(scheduleWhere.title)}
          onClose={() => setScheduleWhere(null)}
        >
          <DaySlotPicker
            sub={t.planDay.slotWhen}
            // Nothing to exclude: an idea is not on the day yet, so every position is a
            // candidate — including the two either side of where it will end up.
            options={positionOptionsFor(null)}
            onPick={(option) => {
              const item = scheduleWhere;
              setScheduleWhere(null);
              // Joined back to the position by key, for its ROOM: the idea's category decides
              // how long it gets and the room is what caps it (ADR-0161 §5).
              const position = dayPositions(dayEvents, activeDate, tz).find(
                (p) => p.key === option.key,
              );
              openSchedule(item, position ? ideaBlock(item, position.free) : option.fill);
            }}
            // The form with the day's next opening, which is what this path offered before —
            // kept as the escape rather than removed, for when the position is not the point.
            onExact={() => {
              const item = scheduleWhere;
              setScheduleWhere(null);
              openSchedule(item, nextSlot(dayEvents, activeDate, tz));
            }}
          />
        </Sheet>
      )}

      {ideaSheet && (
        <MaybeManageSheet
          item={ideaSheet}
          onSchedule={() => {
            const item = ideaSheet;
            setIdeaSheet(null);
            setScheduleWhere(item);
          }}
          // Plan mode is where an idea can be removed (ADR-0116 §4), so the sheet carries
          // the same verb the tile's `✕` does rather than a second capability.
          onRemove={() => {
            verbs.removeMaybe(ideaSheet);
            setIdeaSheet(null);
          }}
          onClose={() => setIdeaSheet(null)}
        />
      )}

      {resolveCluster && resolveCluster.kind === 'cluster' && (
        <ResolveSheet
          cluster={resolveCluster}
          tz={tz}
          optionsFor={(mover) => positionOptionsFor(mover.id)}
          onPick={(mover, fill) => {
            closeResolve();
            pickPosition(mover, fill);
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
          onOpen={setDetailTarget}
          onEdit={(b) => {
            setDetailTarget(null);
            setBookingTarget(b);
          }}
        />
      )}

      {/* Whatever is under the finger — a shelf card or a builder row (sessions
          117-118). Deliberately EMPTY here: the hook appends a DOM clone of the
          source, which is what lets one mechanism serve two completely different
          pieces of markup and keeps the clone from ever drifting from the original.
          A clone rather than the original because a shelf card sits in a
          horizontally scrolling strip that would clip it the moment it left.
          `position: fixed` escapes that, so this is NOT an overlay in the ADR-0090
          sense — not a back target, never in the back stack, hence no
          `Modal`/`useOverlay`. `inert` + `aria-hidden` because it is a duplicate of
          something still in the list. */}
      {dragLive && <div className="wp-dragghost" ref={ghost.ref} aria-hidden="true" inert />}
    </div>
  );
}

/** Pick which soft event moves, then pick where. */
const RESOLVE_STEPS = [{ id: 'which' }, { id: 'where' }] as const;

// The "הזז" overlap-resolve (ADR-0041): pick which SOFT event to move (hard
// members show as disabled anchors), then a one-tap clean slot before/after the
// rest of the cluster, or the exact time-setter (EventForm). Moving is a manual
// ripple — duration preserved, downstream overlap flows through the ripple bar.
//
// **Two steps, on the shared primitive** (ADR-0155). This sheet and the builder row's
// `הזז` each hand-rolled the same step state and the same back-layer block; both are
// `useFormSteps` now. Which event moves is the sheet's own state rather than the
// screen's — it lived one level up only because the step machinery did, and nothing
// outside ever read it.
//
// Exported for its own test (`PlanDay.resolve.test.tsx`), like `BuilderRow` below.
export function ResolveSheet({
  cluster,
  tz,
  optionsFor,
  onPick,
  onOther,
  onClose,
}: {
  cluster: Extract<TimeGroup, { kind: 'cluster' }>;
  tz: string;
  /** The day's positions with the mover taken out (`lib/day-positions.ts`), as the picker's
   *  options. Supplied by the screen: this sheet knows a cluster, not a day. */
  optionsFor: (mover: TripEvent) => DaySlotOption[];
  onPick: (mover: TripEvent, fill: GapDefaults) => void;
  onOther: (mover: TripEvent) => void;
  onClose: () => void;
}) {
  const members = cluster.items.map((i) => i.event);
  const softMovers = members.filter((e) => e.kind === EVENT_KIND.SOFT);
  const hardAnchors = members.filter((e) => e.kind === EVENT_KIND.HARD);
  const [mover, setMover] = useState<TripEvent | null>(null);

  // Neither step can refuse — you advance by CHOOSING, and a chooser has nothing to
  // validate — so no `validate` and no footer. `onCommit` never runs here: the sheet
  // finishes on a slot tap, not on a last-step primary.
  const steps = useFormSteps({ steps: RESOLVE_STEPS, onCommit: onClose });
  const chooseMover = (e: TripEvent) => {
    setMover(e);
    steps.next();
  };
  // One handler for the visible `חזרה` and for the step's back layer, which is the rule
  // that made this a primitive: the primitive owns the layer, so the button only has to
  // call the same `back`.
  const back = () => {
    steps.back();
    setMover(null);
  };

  if (steps.isFirst || !mover) {
    return (
      <Sheet title={t.planDay.resolveTitle} onClose={onClose}>
        <FormStepPanel steps={steps}>
          <div className="resolve-sub">{t.planDay.resolveChoose}</div>
          {softMovers.map((e) => (
            <button key={e.id} className="resolve-mover" onClick={() => chooseMover(e)}>
              <span className="ic" aria-hidden="true">
                {e.icon}
              </span>
              <span className="nm">{e.title}</span>
              <span className="tm" dir="auto">
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
                <Icon name="lock" /> {t.planDay.resolveAnchor}
              </span>
            </div>
          ))}
        </FormStepPanel>
      </Sheet>
    );
  }

  return (
    <Sheet title={t.planDay.resolveFor(mover.title)} onClose={onClose}>
      <FormStepPanel steps={steps}>
        {/* **Offered on every step 2, not only when there were several to choose from.**
            It used to be gated on `softMovers.length > 1`, together with the back layer —
            so with a single soft mover you could reach this step and neither the button
            nor a system back could return to it. Unifying the two on the primitive's one
            gate is what surfaced it: a step you can be ON is a step you can leave. */}
        <button className="resolve-backbtn" onClick={back}>
          <NavArrow variant="back" /> {t.planDay.resolveBack}
        </button>
        {/* **This step WAS the second half of ADR-0161 §4's one-off pair**: two hand-built
            options, `אחרי`/`לפני` the rest of the cluster, computed here from the cluster's
            own bounds. It is the shared picker now, and it subsumes them rather than
            approximating them — the position "after" an overlapping row resolves through
            `freeBetween` to that row's end, which is exactly what `אחרי` meant, and the list
            offers every other position in the day besides. */}
        <DaySlotPicker
          sub={t.planDay.slotWhen}
          options={optionsFor(mover)}
          onPick={(option) => onPick(mover, option.fill)}
          onExact={() => onOther(mover)}
        />
      </FormStepPanel>
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
  /** The zone the now-reference reads in — the live zone, as in Trip mode. */
  nowZone: string;
  bookings: Booking[];
  places: Place[];
  /** `useShowPlaceOnMap()` — `null` outside the trip shell, which drops the row's
   *  `מפה` action rather than breaking it (ADR-0121 §8). */
  showPlaceOnMap: ShowPlaceOnMap;
  verbs: ReturnType<typeof useVerbs>;
  dayEvents: TripEvent[];
  softEvents: TripEvent[];
  softIndex: Map<string, number>;
  drag: { id: string; overId: string | null } | null;
  rowDragProps: (id: string) => HoldToDragProps;
  onEdit: (event: TripEvent) => void;
  // Tapping a transition row opens the read-only booking detail (ADR-0064).
  onOpenDetail: (booking: Booking) => void;
  onGapFill: (free: Gap) => void;
  /** Open the day-position picker for this row (ADR-0161 §7) — the row's time is a button. */
  onPickTime: (event: TripEvent) => void;
  onResolve: (cluster: TimeGroup) => void;
  /** Is a drag currently over this gap? Either drag can be (ADR-0116 §5, extended to
   *  the row drag in session-123), and both light it the same way. */
  overGap: (fill: GapDefaults) => boolean;
}

const startMsOf = (e: TripEvent) => Date.parse(e.startsAt!);
const endMsOf = (e: TripEvent) => Date.parse(e.endsAt ?? e.startsAt!);

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

/** **A position between two rows**, in one of two densities (ADR-0161 §2).
 *
 *  Past `GAP_MIN_MINUTES` it is the `שבץ` **chip** it always was: free time worth
 *  offering, tappable, a drop target. Below that — including zero, two rows that touch —
 *  it is a **seam**: a violet hairline that exists only while a drag is live, carries no
 *  tap, and says what a drop there would do. That is what made "right after the flight"
 *  expressible; before it, a position needed 60 free minutes to exist at all.
 *
 *  ONE component for both densities and for all three places a position occurs — between
 *  two events, before the first, after the last — because the invariant that matters is
 *  that they **accept the same drop**. The slot travels on the element itself
 *  (`data-gap-*`), which is what both hit-tests read, so a seam and a chip are one target
 *  to every caller downstream. */
function FreeSlot({
  free,
  label,
  seamLabel,
  over,
  onFill,
}: {
  free: Gap;
  /** The chip's copy, when there is enough free time to earn one. */
  label: string;
  /** The seam's copy — its OUTCOME, like every other drop zone in the builder. */
  seamLabel: string;
  over: boolean;
  /** The whole position, not its slot: a filler needs the room to cap a length against. */
  onFill: (free: Gap) => void;
}) {
  // Asked of `lib/gaps.ts`, never re-derived here: the threshold that decides chip-vs-seam
  // is the same one `gapBetween` applies, and two copies of it would drift.
  const isChip = earnsChip(free);
  return (
    <div
      // Two classes, one shared geometry block in `screens.css`. Deliberately NOT
      // `.gap.seam`: `.gap` means "the chip" to app code, tests and the e2e spec that
      // counts them, and a seam is not one.
      className={(isChip ? 'gap' : 'bld-seam') + (over ? ' drop-over' : '')}
      data-gap-key={gapKey(free.fill)}
      data-gap-date={free.fill.date}
      data-gap-start={free.fill.start}
      data-gap-end={free.fill.end}
    >
      {isChip ? (
        <>
          <span className="gap-line" />
          <button className="gap-add" onClick={() => onFill(free)}>
            <Icon name="plus" /> {label}
          </button>
          <span className="gap-line" />
        </>
      ) : (
        <>
          <span className="bld-seam-line" />
          <span className="bld-seam-lbl">{seamLabel}</span>
          <span className="bld-seam-line" />
        </>
      )}
    </div>
  );
}

// One sibling level: partial-overlap clusters get a violet "חופפים" box, lone
// items render directly. Positions (a gap chip, or a drag-only seam — ADR-0161 §2) sit
// only between top-level groups (depth 0).
// At depth 0 the day's multi-day-bracket transition points are interleaved by
// instant (ADR-0064 §B) as read-only reference rows — they are not builder rows
// (no grip/drag/⋯/edit, not a drop target), and they neither open nor close a
// plannable position, so joins stay computed between consecutive EVENT groups.
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
  // The same placement the Trip-mode now-line uses (`lib/now-line.ts`) — this screen's
  // marker is static rather than live, which is a difference in the INSTANT it is given
  // and nothing else.
  const nowRefIndex = nowRefMs === null ? -1 : nowLinePlacement(entries, nowRefMs).index;
  // Positions are measured between consecutive EVENT groups only — a transition point
  // interleaved between two groups doesn't break their adjacency.
  let prevEventGroup: TimeGroup | null = null;
  return (
    <>
      {entries.map((entry, i) => {
        const nowRef =
          i === nowRefIndex && nowRefMs !== null ? <NowRef ms={nowRefMs} tz={ctx.nowZone} /> : null;
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
        const prevEnd = prevEventGroup && groupEndEvent(prevEventGroup);
        // **A position touching the row being dragged is not offered.** "Insert this
        // immediately above itself" and "…immediately below itself" are the two places it
        // already is, so drawing them invites a gesture that either does nothing or nudges
        // the event by its own length — reported as "the line appears even for the same slot
        // we're moving from". Only the ROW drag has a position in the day; a shelf card has
        // none, so for it every seam is meaningful and none is suppressed.
        const held = ctx.drag?.id;
        const touchesHeld =
          held != null && (prevEnd?.id === held || groupStartEvent(g).id === held);
        const between =
          depth === 0 && prevEnd && !ctx.readOnly
            ? freeBetween(prevEnd, groupStartEvent(g), ctx.tz)
            : null;
        // A SEAM touching the held row is suppressed; a CHIP is not. The distinction is the
        // whole of it: a chip means "into that free afternoon", which is a real move however
        // adjacent it is, while a seam beside the held row means "start where you already
        // end" — a nudge by its own length, or nothing at all.
        const free = between && touchesHeld && !earnsChip(between) ? null : between;
        prevEventGroup = g;
        const key = g.kind === 'cluster' ? `cl-${g.items[0].event.id}` : g.item.event.id;
        return (
          <Fragment key={key}>
            {nowRef}
            {free && prevEnd && (
              <FreeSlot
                free={free}
                label={t.planDay.gap(gapLabel(free.minutes))}
                seamLabel={t.planDay.seamAfter(prevEnd.title)}
                over={ctx.overGap(free.fill)}
                onFill={ctx.onGapFill}
              />
            )}
            {g.kind === 'cluster' ? (
              <div className="bld-cluster">
                <div className="bld-cluster-head">
                  <span className="lead">
                    <span aria-hidden="true">⧉</span> {t.planDay.overlapping} ·{' '}
                    <span className="win" dir="auto">
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
      {nowRefMs !== null && nowRefIndex === entries.length && (
        <NowRef ms={nowRefMs} tz={ctx.nowZone} />
      )}
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
        <span className="nowref-tm" dir="auto">
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
        onShowOnMap={eventShowOnMap(e, ctx.bookings, ctx.places, ctx.showPlaceOnMap)}
        onPark={soft ? () => ctx.verbs.park(e) : undefined}
        dragProps={soft && !ctx.readOnly ? ctx.rowDragProps(e.id) : undefined}
        dragging={ctx.drag?.id === e.id}
        over={ctx.drag?.overId === e.id}
        // The row's own time opens the day-position picker (ADR-0161 §7). Offered on any
        // editable row, hard included: a hard event's time is a commitment, so the write
        // goes through `applyGuardedUpdate` and asks — the same gate every other hard edit
        // passes. What it never does is MOVE one without being asked (ADR-0011).
        onPickTime={ctx.readOnly ? undefined : () => ctx.onPickTime(e)}
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

/** Exported for its own test (`PlanDay.builder-row.test.tsx`): the `הזז` step and
 *  its back layer are real behaviour, and the screen around this row has no test
 *  harness — mounting the whole of PlanDay to reach one sheet would test the
 *  harness rather than the row. */
export function BuilderRow({
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
  onShowOnMap,
  onPark,
  dragProps,
  dragging,
  over,
  onPickTime,
  nestedCount,
  overlapNote,
  settle,
}: {
  event: TripEvent;
  tz: string;
  /** Title node — the screen passes the `routeDisplay` title so a transport row
   *  reads as its route; falls back to the stored title, itself route-aware
   *  (`TitleLabel`). */
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
  /** Show the event's place on our map (ADR-0121 §8). Absent when there is nothing
   *  to focus — no place, a coordless Place-lite, or no Map tab to route to.
   *
   *  The builder's row has no `נווט` peer, and that is the decision, not an
   *  omission: directions are a Trip-mode, on-the-ground action (which is why the
   *  Trip-mode day view gates its own on `!readOnly` and `TransitionRow` takes none
   *  in Plan mode), while `מפה` answers the planning question — where is this in
   *  the trip. The two are not one atomic pair. */
  onShowOnMap?: () => void;
  // Present only for soft rows — move the event to the shelf as an idea.
  onPark?: () => void;
  /** Press-and-hold to drag, from anywhere on the row (session-119). Present only
   *  for soft rows — hard events are pinned anchors, not draggable (ADR-0011). */
  dragProps?: HoldToDragProps;
  dragging?: boolean;
  over?: boolean;
  /** **Open the day-position picker for this row** (ADR-0161 §4/§7). Reached by tapping the
   *  row's own time — which is also where an untimed row's `＋ שעה` goes, the one slot that
   *  held nothing at all before.
   *
   *  This replaces the `reorder` prop and the `הזז` step it fed. That step was itself a
   *  replacement for `הקדם`/`אחר` (a blind one-slot swap), and it inherited their model:
   *  it listed the day's soft peers and handed an id to a SLOT PERMUTATION, which is the
   *  defect ADR-0161 §1 exists to undo. Absent on a read-only archive. */
  onPickTime?: () => void;
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
    dragProps ? 'draggable' : '',
    dragging ? 'dragging' : '',
    over ? 'over' : '',
    isSkipped ? 'is-skip' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Row actions live behind one ⋯ button (a bottom sheet), not a strip of inline
  // icons — a phone row only has width for a title, a time and one affordance
  // (mockups/plan-mode-v1.html). Edit is also reachable by tapping the row body.
  // `menu` = the verb list; `move` = the `הזז` position step (ADR-0138 §8), which
  // is a step INSIDE the sheet rather than a second sheet.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const runAction = (fn: () => void) => {
    closeMenu();
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
        <Icon name="check" /> {t.event.didThis}
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
        <span className="bld-ttl">{title ?? <TitleLabel title={event.title} />}</span>
        {isHard ? (
          <span className="tag-hard">
            <Icon name="lock" /> {t.event.hard}
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
    // The whole row is the drag surface (session-119): no ⠿ handle, no ▲/▼ pair. It
    // could only arm on contact from a dedicated handle before; a press-and-hold can
    // arm from anywhere without eating the row's tap, so the row gets that width back
    // and the gesture matches the shelf's exactly.
    <div className={cls} data-bld-id={event.id} {...dragProps}>
      {isHard && (
        <span className="bld-anchor" aria-label={t.planDay.pinned} title={t.planDay.pinned}>
          <Icon name="lock" />
        </span>
      )}
      {/* The badge is the way to the map, and it survives `readOnly` — a finished
          trip is a browsable archive (ADR-0040) and looking at a place changes
          nothing. */}
      <PlaceBadge className="bld-bd" onShowOnMap={onShowOnMap}>
        {event.icon}
      </PlaceBadge>
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
          const inner = (
            <>
              <span dir="auto">
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
                    <ZoneShiftPill minutes={zones.deltaMinutes} className="bld-tzdelta" />
                  )}
                </span>
              )}
            </>
          );
          // **THE TIME IS A BUTTON** (ADR-0161 §7). The row already renders the answer; the
          // control is the thing it is written on, which is `PlaceBadge`'s idiom (ADR-0121
          // §8) one slot over. That is also what let `הזז` leave the `⋯` sheet: a focusable
          // control in the row satisfies ADR-0138 §8's rule (reorder without a drag) more
          // directly than a menu row, and `10:00–12:00` is a better name for "move this"
          // than the word `הזז`.
          return onPickTime ? (
            <button
              type="button"
              className="bld-time"
              onClick={onPickTime}
              aria-label={t.planDay.slotMoveTitle(event.title)}
            >
              {inner}
            </button>
          ) : (
            <span className="bld-time">{inner}</span>
          );
        })()}
      {/* A row with no time holds NOTHING in that slot today, so the only way to give an
          event a time is the whole edit form — the one case where §7 adds a control rather
          than promoting one. Same slot, same target, dashed because it marks an absence. */}
      {!event.startsAt && onPickTime && (
        <button type="button" className="bld-time empty" onClick={onPickTime}>
          <Icon name="plus" /> {t.planDay.slotAddTime}
        </button>
      )}
      {!readOnly && (
        <button
          className="bld-icon"
          onClick={() => setMenuOpen(true)}
          aria-label={t.planDay.rowActions}
        >
          <Icon name="more" />
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
              <Icon name="check" />
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
        // Through the SHARED sheet now (ADR-0138 §1) — this was the app's fifth
        // copy of one row shape, with its own `.row-actions` rules in screens.css.
        // Visible header: a flight names its route here like the row does.
        <Sheet
          title={
            <>
              <TitleLabel title={event.title} />
              <span className="wp-row-subject">
                {[
                  isHard ? t.event.hard : t.event.soft,
                  event.startsAt &&
                    clockRange(
                      formatTime(event.startsAt, tz),
                      event.endsAt && formatTime(event.endsAt, tz),
                    ),
                ]
                  .filter(Boolean)
                  .join(` ${DOT_SEPARATOR} `)}
              </span>
            </>
          }
          onClose={closeMenu}
        >
          {/* **A plain list again, not a stepped surface.** `הזז` was this sheet's second
              step (ADR-0138 §8) and it has moved to the row's own time (§7), so the step
              machinery, its back layer and its panel all go with it — the sheet is what it
              was before that step existed, one row shorter than today. */}
          <RowActionList
            actions={[
              { label: t.actions.edit, icon: CONTROL_ICON.edit, onSelect: () => runAction(onEdit) },
              ...(onPark
                ? [
                    {
                      label: t.actions.toShelf,
                      icon: CONTROL_ICON.toShelf,
                      onSelect: () => runAction(onPark),
                    } as RowAction,
                  ]
                : []),
              {
                label: t.actions.delete,
                icon: CONTROL_ICON.trash,
                danger: true,
                onSelect: () => runAction(onDelete),
              },
            ]}
          />
        </Sheet>
      )}
      {settle && settleOpen && (
        <Sheet title={t.planDay.settleTitle(event.title)} onClose={() => setSettleOpen(false)}>
          <SettleControl
            variant="sheet"
            onDone={() => {
              setSettleOpen(false);
              settle.onDone();
            }}
            onSkip={() => {
              setSettleOpen(false);
              settle.onSkip();
            }}
          />
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
        <Icon name="plus" />
      </button>
    </form>
  );
}
