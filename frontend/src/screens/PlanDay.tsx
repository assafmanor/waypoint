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
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  EVENT_KIND,
  EVENT_STATUS,
  isExactEdge,
  isRoutableMode,
  isAmbient,
  TRAVEL_FIT,
  type Booking,
  type EventCategory,
  type MaybeItem,
  type Place,
  type LegTravelMode,
  type TripEnrichments,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip, byStart } from '../state/trip-state';
import { EVENT_PARAM, EVENT_ROW_ATTR, eventRowSelector, useArrivalParam } from '../state/nav-state';
import { useLandOnArrival } from '../lib/land-at-top';
import { edgeFadeRef } from '../lib/edge-fade';
import { useDragState } from '../state/drag-state';
import { apiAssetUrl } from '../lib/api-asset';
import { rowPhoto } from '../lib/place-photo';
import { dayHeadTitle } from '../lib/day-title';
import { dayShot, type DayShot } from '../lib/day-photo';
import { DayHead } from '../ui/domain/DayHead';
import { MediaViewer } from '../ui/MediaViewer';
import { useSpringLoadedDay } from '../lib/useSpringLoadedDay';
import { useEdgeDayStep } from '../lib/useEdgeDayStep';
import { useDaySurface } from '../lib/useDaySurface';
import { DayPeeks } from '../ui/domain/DayPeek';
import { useIsDayPreview } from '../state/day-preview';
import { useVerbs } from '../state/verbs';
import {
  usePlaceErrandReturn,
  useShowMaybesOnMap,
  useShowPlaceOnMap,
} from '../state/map-scope-state';
import { useClock } from '../lib/useClock';
import {
  eventDistanceLabel,
  eventDurationLabel,
  eventEdgeZone,
  eventRoute,
  eventShowOnMap,
  ideaShowOnMap,
  legShowOnMap,
  legDisplayZones,
  eventZones,
  dayZoneContext,
  liveToday,
  liveZone,
  type EventZones,
  type ShowPlaceOnMap,
  type ZoneContext,
} from '../lib/places';
import type { PlaceLabels } from '../lib/place-label';
import { usePlaceLabels } from '../state/place-labels';
import { tripPhase } from '../lib/mode';
import {
  buildTimeTree,
  clockRange,
  formatTime,
  zonedIso,
  dayOfMonth,
  weekdayName,
  crossesMidnightZoned,
  type TimeGroup,
  type TimeItem,
  tripDates,
  dayLabel,
  dayWindowMs,
} from '../lib/time';
import {
  earnsChip,
  earnsChipAt,
  freeAfterLast,
  freeBeforeFirst,
  freeBetween,
  freeWholeDay,
  ideaBlock,
  nextSlot,
  type Gap,
  type GapDefaults,
} from '../lib/gaps';
import {
  dayAirMeters,
  legDepartAfterMs,
  useDayTravelReads,
  useLegModeControl,
  type LegModeControl,
  type DayLeg,
} from '../lib/day-travel';
import {
  dayFeasibility,
  dayJourney,
  dayTravelTotal,
  narrowGapForTravel,
  windowClosesMs,
  type DayJourney,
} from '../lib/day-joins';
import { dayShortfallPhrase, infeasibleLegsPhrase } from '../lib/duration';
import { JourneyRow, type JourneyZones } from '../ui/domain/DayJoinRow';
import { StayRow } from '../ui/domain/StayRow';
import {
  dayStops,
  ideaCategory,
  ideaGlyph,
  proposedDay,
  poolStrip,
  rankIdeas,
  reasonText,
  tripDayStops,
  shelfForSlot,
  shelfGroups,
  stopReasonText,
  tileReasonText,
} from '../lib/shelf';
import { SECONDS_PER_MINUTE, SHELF_POOL_CAP } from '../constants';
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
import { BEAT, playBeat } from '../lib/one-shot';
import { useDragGhost } from '../lib/useDragGhost';
import {
  CONTROL_ICON,
  DEFAULT_MAYBE_ICON,
  DOT_SEPARATOR,
  DRAG_DAY_DWELL_MS,
  MINUTES_PER_HOUR,
} from '../constants';
import {
  dayTransitions,
  placeDayEntries,
  type DayEntry,
  groupEndEvent,
  groupMembers,
  groupStartEvent,
  mergeDayEntries,
} from '../lib/day-entries';
import { nowLinePlacement } from '../lib/now-line';
import { NOW_POSTURE, NowMarker } from '../ui/domain/NowMarker';
import { ambientSpanLabel, dayBookendStays } from '../lib/glance';
import { edgeSentence } from '../lib/transitions';
import { t } from '../i18n/he';
import { EventForm, type EventFormDraft } from '../ui/EventForm';
import { BookingSheet, type BookingSheetDraft } from '../ui/BookingSheet';
import { BookingDetail } from '../ui/BookingDetail';
import { EventDetail } from '../ui/EventDetail';
import { TransitionRow } from '../ui/TransitionRow';
import { UnplacedCommitment } from '../ui/domain/UnplacedCommitment';
import { routeDisplay } from '../ui/route-display';
import { IconPicker } from '../ui/IconPicker';
import { Icon } from '../ui/Icon';
import { HardLock } from '../ui/HardLock';
import { NavArrow } from '../ui/NavArrow';
import { ZoneShiftPill } from '../ui/ZoneShiftPill';
import { Sheet } from '../ui/Sheet';
import { FormStepPanel, useFormSteps } from '../ui/primitives/FormSteps';
import { TitleLabel } from '../ui/TitleLabel';
import {
  DocumentMark,
  NoteMark,
  RowActionList,
  SettleControl,
  type RowAction,
  TaskMark,
} from '../ui/domain';
import { DaySlotPicker, type DaySlotOption } from '../ui/domain/DaySlotPicker';
import { DayTravelTotal } from '../ui/domain/DayTravelTotal';
import { dayPositions, POSITION_AT, type DayPosition } from '../lib/day-positions';
import { MaybeCard, MaybeMoreCard } from '../ui/domain/MaybeCard';
import { MaybeManageSheet } from '../ui/MaybeManageSheet';
import { SlotFillSheet } from '../ui/domain/SlotFillSheet';
import { noteCountFor, hostCountForContext, noteCountsByHost } from '../lib/notes';
import { openTaskCountsByHost } from '../lib/tasks';
import { useSettledHosts } from '../ui/HostTasks';
import { attachmentCountForContext, attachmentCountsByHost } from '../lib/attachments';
import { resolveHostContext, type HostContextIndex } from '../lib/host-context';
import { PlaceBadge } from '../ui/domain/PlaceBadge';

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
    justAddedIdea,
    bookings,
    places,
    enrichments,
    notes,
    documentAttachments,
    travelModeOverrides,
    travelModeVerbs,
    hostContexts,
    activeDate,
    setActiveDate,
    zoneEvidence,
    tasks,
  } = useTrip();
  const verbs = useVerbs();
  // Which day this surface is showing, and how it changes (ADR-0200 §6/§7) — the same hook
  // and class Trip's day view wears, because none of it is a posture (ADR-0159 §1). Called
  // early for the declaration-order reason the hook's header states.
  // **Am I the real day, or the peek beside it?** (ADR-0200 §7) Read only to suppress what
  // reaches OUT of a preview's pane — the arrival param it must not spend, and a scroll on the
  // body it does not own. Never to change how the day LOOKS: looking identical is the point.
  const preview = useIsDayPreview();
  const daySurface = useDaySurface<HTMLDivElement>();
  const placeLabels = usePlaceLabels();
  const now = useClock();
  // The builder's way to the map (ADR-0121 §8), on every row whose event resolves a
  // coord-bearing place. It is the only surface here that needs it: the row's own tap
  // opens the edit form, which carries no location view of its own.
  const showPlaceOnMap = useShowPlaceOnMap();
  const showMaybesOnMap = useShowMaybesOnMap();
  // Multi-zone display (ADR-0107): literally the same context the Trip-mode day view builds,
  // from the same evidence — this screen used to derive its own crossings and its own ambient,
  // which is how the two day surfaces drifted apart (session 100). One builder, one input, no
  // room to diverge.
  const zoneCtx = dayZoneContext(activeDate, zoneEvidence);
  /** **THE CLOCK THIS DAY IS READ IN** — `DayView`'s `dayZone`, and the same repair (ADR-0206
   *  §AQ, finished 2026-09-05). Every wall clock this screen builds or reads is one of the day's
   *  own, and `trip.timezone` is the zone the trip is FILED under: on a trip whose primary sits
   *  an hour off its stops, every slot the builder offered was an hour off the rows above it.
   *  Shared with Trip mode because where a drop lands is a FACT, and ADR-0159 §1 forbids the two
   *  surfaces answering it twice. */
  const tz = zoneCtx.ambientZone;
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
  const today = liveToday(now.getTime(), zoneEvidence);
  // How this screen names a day (`dayLabel`): relative on a live trip, anchored on the day
  // ON SCREEN so an idea's "מחר" is the day after the one being built (ADR-0151); by trip-day
  // number off it, where "עוד 15 ימים" is only the day number plus a constant.
  const dayNaming = { trip, today, anchor: activeDate };
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
  // An UNBOOKED event's read (ADR-0174 §4). A booked one goes to `detailTarget` above.
  const [eventDetail, setEventDetail] = useState<TripEvent | null>(null);
  const [gapFill, setGapFill] = useState<GapDefaults | null>(null);
  // A shelf idea being scheduled onto a day — opens EventForm in "schedule" mode
  // so the user picks the day/time/kind (not the old hardcoded 17:30 dump).
  const [scheduleMaybe, setScheduleMaybe] = useState<MaybeItem | null>(null);
  // The idea's own surface (ADR-0116's 2026-08-01 amendment): a tap opens this, the hold
  // still drags. `שיבוץ ליום` inside it reaches `openSchedule` below.
  const [ideaSheet, setIdeaSheet] = useState<MaybeItem | null>(null);
  // **ARRIVING AT ONE ROW** (owner, 2026-08-20: _"going from a place to the event … doesn't
  // scroll correctly. Check plan day and trip day"_). A place's reference row sends you to the
  // event's day with `?event=<id>`, and this is the half that makes that land: the row is
  // brought to the top of the day, watched while the surface settles (`lib/land-at-top.ts`).
  //
  // **It does not OPEN anything, and that is a posture difference rather than half a build**
  // (ADR-0159 §1). Trip's card expands in place, so an arrival there expands it; Plan's row
  // opens a detail SHEET over the day, and a modal raised by a navigation would hide the very
  // day you were sent to. So Plan lands the row and leaves the tap to the person.
  const arrivingEvent = useArrivalParam(EVENT_PARAM, { active: !preview });
  useLandOnArrival(arrivingEvent, (id) => document.querySelector(eventRowSelector(id)));

  // Built once per note-list change rather than filtered per tile (ADR-0152 §6c).
  const noteCounts = useMemo(() => noteCountsByHost(notes), [notes]);
  // The third mark's tally (ADR-0191 §2) — OPEN tasks only, unlike the two beside it.
  const settledHosts = useSettledHosts();
  const taskCounts = useMemo(
    () => openTaskCountsByHost(tasks, settledHosts),
    [tasks, settledHosts],
  );
  // Its twin for attachments (ADR-0174 §1) — `attachmentCountsByHost` shipped with
  // ADR-0173 and had no call site at all until this row.
  const docCounts = useMemo(
    () => attachmentCountsByHost(documentAttachments),
    [documentAttachments],
  );
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
  // Multi-day bracketed bookings (a hotel, a red-eye flight) are ambient — off
  // `dayEvents` — so their edge days would show nothing in the list. Interleave
  // their transition points (check-in/out, departure/arrival) among the builder
  // groups by instant (ADR-0064 §B); same-day brackets stay a single span row.
  const transitions = dayTransitions(events, activeDate);
  // **The same split Trip mode makes, from the same derivation** (ADR-0171 §10e). The two
  // modes are allowed to differ in POSTURE and never about a FACT (ADR-0159 §1) — and
  // "15:00 on a check-in is a floor" is a fact about the booking, not about the screen
  // reading it. So Plan places nothing differently; what it does not do is offer to act
  // on it, because there is nowhere yet to store a placement.
  const planGroups = buildTimeTree(dayEvents);
  // **THE SAME TWO FACTS, FROM THE SAME FUNCTION** (ADR-0209 §1). Trip mode reads
  // `dayBookendStays` too, and so does the map's stop sequence — ADR-0159 §1 allows the two day
  // surfaces to differ in posture and forbids a difference about a fact, and "you slept there" is
  // not a posture.
  const bookends = dayBookendStays(events, activeDate);
  const stayRowIds = useMemo(
    () => new Set([bookends.woke?.id, bookends.sleeps?.id].filter((id): id is string => !!id)),
    [bookends.woke?.id, bookends.sleeps?.id],
  );
  /** **When this day's window opens** (ADR-0045/0037's 07:00) — the boundary that decides what
   *  belongs to the night before it. The same instant the Map resolves, and memoized for the same
   *  reason: `zonedIso` builds an `Intl.DateTimeFormat` and this screen re-renders on the drag. */
  const dawnMs = useMemo(
    () => dayWindowMs(activeDate, dayZoneContext(activeDate, zoneEvidence).ambientZone).startMs,
    [activeDate, zoneEvidence],
  );
  const placement = placeDayEntries(
    mergeDayEntries(planGroups, transitions),
    dayEvents.filter((e) => !e.startsAt),
    planGroups,
    stayRowIds,
    dawnMs,
  );
  const overnight = placement.overnight;

  // ── THE JOURNEY IN A HOLE, ON THE CONTROL SIDE (ADR-0206 §V1.1) ─────────────────────────
  // Plan mode does not display a hole, it OFFERS it (ADR-0161 §2), so §V1.1's overstatement
  // reaches a person here as a **slot**: a chip saying `פער של 3 שעות` over a hole a 40-minute
  // walk eats. ADR-0159 §1 allows Trip and Plan to differ in POSTURE and forbids a difference
  // about a FACT, and how much of a hole is free is a fact — so both surfaces read the one hook.
  //
  // Memoized like the day list's, and for the same reason: this screen re-renders on the drag and
  // on the clock, and the legs array is what `useDayTravelReads` fingerprints.
  const planLegs = useMemo<DayLeg[]>(() => {
    const legs: DayLeg[] = [];
    let prev: TripEvent | null = null;
    for (const group of planGroups) {
      const start = groupStartEvent(group);
      if (prev) legs.push({ from: prev, to: start });
      prev = groupEndEvent(group);
    }
    // **The day's two bookend legs** (ADR-0209 §1) — out of the stay you woke in and back into
    // the one you sleep in. **Only the first carries `fromIsStay`**, and the flag says which:
    // a stay's own `endsAt` is a check-out days away, so the leg LEAVING one has no departure
    // window (§AF3), while the leg arriving AT one leaves an ordinary row that ends when it ends.
    // Both were `bookend: true` until §AS1, where the name let Trip mode read the second as the
    // first and go silent.
    const first = planGroups.length ? groupStartEvent(planGroups[0]) : undefined;
    if (bookends.woke && first && first.id !== bookends.woke.id) {
      legs.unshift({ from: bookends.woke, to: first, fromIsStay: true });
    }
    // **AND THE DRIVE THAT BROUGHT YOU TO THE BED** (owner, 2026-08-26) — off the last overnight
    // edge, carrying the EDGE's placed instant, because a hire's `endsAt` is its return ten days
    // out (`DayLeg.departAfterMs`). Refused by ADR-0054's amendment the same morning for a reason
    // §AJ1 has since removed: a leg into a check-in floor no longer reads as impossible.
    const cameIn = overnight[overnight.length - 1];
    if (bookends.woke && cameIn && cameIn.event.id !== bookends.woke.id) {
      legs.unshift({
        from: cameIn.event,
        to: bookends.woke,
        fromEdge: cameIn.edge,
        departAfterMs: cameIn.atMs,
      });
    }
    if (bookends.sleeps && prev && prev.id !== bookends.sleeps.id) {
      legs.push({ from: prev, to: bookends.sleeps });
    }
    return legs;
  }, [planGroups, bookends.woke, bookends.sleeps, overnight]);
  const planTravel = useDayTravelReads({
    tripId: trip.id,
    legs: planLegs,
    bookings,
    places,
    overrides: travelModeOverrides,
  });
  /** **The line saying WHY the offer shrank** — `where-a-route-shows-up-v1.html` §2 drew it as
   *  `מתוך 160 דק׳ · 40 דק׳ מהם דרך` beneath the chip, and shipping the number without it is what
   *  made the smaller offer read as an unexplained one. Absent where there is no estimate, so a
   *  hole the app cannot measure looks exactly as it did before (§D4).
   *
   *  Both numbers go through `gapLabel`, not the drawing's raw `דק׳`: it is the ladder the chip
   *  above it already uses, and a note in a different unit from the number it explains is a second
   *  answer to one question. */
  const slotNote = (from: TripEvent, to: TripEvent, hole: number): string | undefined => {
    const estimate = planTravel.estimateFor(from, to);
    if (!estimate) return undefined;
    const travelMinutes = Math.round(estimate.durationSeconds / SECONDS_PER_MINUTE);
    return travelMinutes > 0
      ? t.planDay.gapOfWhich(gapLabel(hole), gapLabel(travelMinutes))
      : undefined;
  };
  /** **And the journey itself, because Plan mode draws the block too** —
   *  `where-a-route-shows-up-v1.html` §2's Plan column is `trvBlock() + planSlot(…)`, the block AND
   *  the chip. It is the same `dayJourney` Trip mode reads, so the two surfaces cannot describe one
   *  leg differently; what Plan does NOT get is the block's controls (`בדרך`, `עדיין כאן`), because
   *  Plan has no inline settle pair (ADR-0159 §1 / ADR-0171 §10e) and the drawing's Plan column has
   *  no action row for that reason. */
  /** The stay's bound in the words the strip already used — `edgeSentence` where the day is an
   *  edge of it, `ambientSpanLabel` where it is not (ADR-0209 §1). Trip mode reads the same pair. */
  const planStayBound = (stay: TripEvent): string | undefined => {
    const edge = placement.stayEdges.find((e) => e.event.id === stay.id);
    return edge
      ? edgeSentence(edge, eventEdgeZone(edge.event, edge.edge, zoneCtx).zone)
      : ambientSpanLabel(stay, activeDate);
  };
  /** **Takes the LEG, not its two ends** (ADR-0206 §AS1) — because the one thing this needs beyond
   *  the two rows is whether the ORIGIN is a stay, and the leg is where that is recorded. It used
   *  to re-derive it here as `stayRowIds.has(from.id)`: the right question, asked a second way,
   *  which is how Trip mode could get it wrong on one leg while this surface got it right. */
  const planJourney = (leg: DayLeg): DayJourney | null => {
    const { from, to } = leg;
    const estimate = planTravel.estimateFor(from, to);
    return dayJourney({
      // **One derivation, three readers** (ADR-0206 §AJ3). This surface, Trip mode and the board
      // each need the same three rules — the leg's own placed instant, no floor out of a bed
      // (§AF3), otherwise the origin's end — and two of them wrote it out while the board could
      // not apply it at all. `legDepartAfterMs` carries the reasoning; nothing is re-decided here.
      departAfterMs: legDepartAfterMs(leg),
      arriveByMs: Date.parse(to.startsAt ?? ''),
      // Same gate as Trip mode's, and it is here rather than only there because
      // `frontend/CLAUDE.md` names "changing a day-surface derivation in `DayView` only" as
      // having cost a release twice (ADR-0206 §AI1).
      flexibleArrival: !isExactEdge(to, 'start'),
      windowClosesMs: windowClosesMs(to),
      travelSeconds: estimate?.durationSeconds ?? null,
      // Both of these are Trip mode's, for the reason the comment above names twice: a declared leg
      // keeps a distance it has no estimate for (ADR-0206 §AA4), and it is a journey with no
      // duration rather than no journey — so `distanceFor` owns the first and `declared` the
      // second, in both surfaces off one derivation.
      distanceMeters: planTravel.distanceFor(from, to),
      declared: !isRoutableMode(planTravel.modeFor(from, to)),
      // …and the same for a mode the gate refuses (ADR-0206 §AM10), read off the one derivation
      // rather than re-asked here, for the reason the comment above gives twice.
      tooFarForMode: planTravel.refusedFor(from, to),
      // …and a leg whose number has not arrived yet is the third (ADR-0206 §AU1): it must RENDER,
      // because the block is what tells the reader a route is coming and what carries the control
      // that would pick a different mode for it. Ranked last of the three by `dayJourney` itself.
      warming: planTravel.warmingFor(from, to),
      nowMs: now.getTime(),
    });
  };

  /** **THE DAY'S JOURNEYS, DERIVED ONCE AND READ BY BOTH THE ROWS AND THE VERDICT**
   *  (ADR-0206 §AN).
   *
   *  Every `JourneyRow` on this screen reads its journey out of here rather than calling
   *  `planJourney` at its own site, so the day-level verdict below is a roll-up of **the same
   *  objects the rows draw** rather than a second derivation that happens to agree. That is
   *  `frontend/CLAUDE.md`'s rule about a day-surface derivation living in one place, applied
   *  inside one screen: a render site that drifts would otherwise silently take the verdict
   *  with it, and the verdict is the half nobody would notice was wrong. */
  const journeyByRows = new Map(
    planLegs.map((leg) => [`${leg.from.id}>${leg.to.id}`, planJourney(leg)]),
  );
  const journeyFor = (from: TripEvent, to: TripEvent): DayJourney | null =>
    journeyByRows.get(`${from.id}>${to.id}`) ?? null;
  /**
   * **A HOLE, CORRECTED FOR THE JOURNEY IN IT — ONE FUNCTION, EVERY SURFACE ON THIS SCREEN**
   * (ADR-0206 §V1.1, finished; owner, 2026-09-01: _"transit row says take off by 08:05, but
   * filling the gap suggests 07:30–08:30"_).
   *
   * It replaces `travelFreeMinutes`, which corrected a NUMBER and left the slot beside it raw — so
   * the chip's label shrank by the walk while the sheet it opened, the block a pick wrote and the
   * drop key all still described the whole hole. A label is not the offer: the reported
   * contradiction is what the sheet's own header says, and no amount of correcting the chip's copy
   * reaches it.
   *
   * `narrowGapForTravel` corrects both halves of one object, so a caller cannot pick up the wrong
   * one, and it is the same function Trip mode and the day's two edge slots apply — which is
   * ADR-0159 §1's rule about a fact, and `frontend/CLAUDE.md`'s note that a day-surface derivation
   * living in `DayView` alone has cost a release twice.
   *
   * **Absent where there is no pair to ask about, and that is honest rather than a gap** (§D4): the
   * day's edges have a row on one side only and a position joined around the row being MOVED has
   * two rows that are not adjacent, so both keep the raw hole — exactly as they read before any of
   * this existed.
   */
  const narrowedFree = (
    from: TripEvent | null | undefined,
    to: TripEvent | null | undefined,
    free: Gap,
  ): Gap => (from && to ? narrowGapForTravel(free, journeyFor(from, to), tz) : free);
  /** **The zones the block's two clocks read in** (ADR-0206 §AQ) — the leg is looked up in
   *  `planLegs` rather than rebuilt from the two rows, because `fromEdge` is the one thing that
   *  decides WHICH end of a span this leg leaves from and `planLegs` is where that is known.
   *
   *  Trip mode reads the same function off the same shape. It has to: ADR-0159 §1 forbids the two
   *  day surfaces differing about a **fact**, and which hour a departure is stated in is one — this
   *  is the amendment that fixed it landing on `DayView` alone, which `frontend/CLAUDE.md` names as
   *  having cost a release twice. */
  const legZones = (from: TripEvent, to: TripEvent): JourneyZones =>
    legDisplayZones(
      planLegs.find((leg) => leg.from.id === from.id && leg.to.id === to.id) ?? { from, to },
      zoneCtx,
    );
  /** **One tap from a leg to that leg on the canvas** (owner, 2026-08-27) — the same read Trip
   *  mode makes, off the same pair, because a way to the map is not a posture (ADR-0159 §1). */
  const legOnMap = (from: TripEvent, to: TripEvent) =>
    legShowOnMap(planTravel.pairFor(from, to), showPlaceOnMap);
  /** **"This day does not fit"** (ADR-0206 §V1.7) — Plan mode's one opinion, and the reason it
   *  is allowed here and not in `DayView` is ADR-0159 §1's posture clause: a day-level verdict in
   *  Trip mode is a verdict on a day you are already living. `UNKNOWN` and `FITS` both render
   *  nothing, which is §D4 rather than an omission — see `dayFeasibility`. */
  const planFit = dayFeasibility([...journeyByRows.values()]);
  /** **And how far it goes** (ADR-0206 §V1.9), off the same map for the same reason — except
   *  that this one is NOT Plan's alone: the verdict above is an opinion about a day you have not
   *  lived yet, where a total distance is a fact, and ADR-0159 §1 lets the two surfaces differ
   *  only about the former. Trip mode renders the same component off the same function. */
  const dayTotal = dayTravelTotal(
    [...journeyByRows.values()],
    planTravel.unplacedLegs,
    // The air half is a FACT about the day, so it is not Plan's to differ about either
    // (ADR-0212 §3, and ADR-0159 §1's posture clause read the same way as the line above).
    dayAirMeters(dayEvents, bookings, places),
  );

  // Reorder acts on soft events only (hard events are pinned anchors, ADR-0011).
  /** **The mode switch, the same one Trip mode offers** (ADR-0206 §AM9). Plan is where §AL10 said
   *  the override would mostly be set — _"the sort of thing set while planning rather than while
   *  standing in it"_ — and M8b shipped it in `DayView` alone, so a leg's mode was readable here
   *  and not changeable. The hook is shared, so the two surfaces cannot drift about it. */
  const modeControl = useLegModeControl({
    reads: planTravel,
    verbs: travelModeVerbs,
    readOnly,
  });

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
  // …and a drag held at the surface's own inline EDGE names the day beyond it, which is the
  // second route to the same target (ADR-0116 §2's 2026-08-22 amendment): the pill asks a
  // phone to carry a card to the top of the screen, and the edge is where the finger already
  // is. It reads the neighbours the swipe's peek already derives, so the two ways of reaching
  // tomorrow cannot disagree about which day that is.
  //
  // **It navigates and nothing else — it is deliberately not fed into `overDate`.** That field
  // is a DROP target and `resolveShelfDrop` checks it before the gap chip, which is safe only
  // because a pill and a chip can never be under one pointer. An edge band can: a gap chip
  // spans the surface, so its last 36px lie inside one, and a drop meant for that slot would
  // have silently become "aim at another day" instead.
  const edgeDay = useEdgeDayStep(daySurface.ref, daySurface.peek, daySurface.hold);
  // …and resting on either switches to that day, so a card or a row can be carried to
  // a day that isn't on screen. The dwell lives here because only the drag can
  // hit-test the pointer — see the hook for why the pill can't do it itself. The pill wins
  // when both are named: it is the more specific statement, and it is where the finger is.
  //
  // **One dwell, two outcomes** (§2d). A pill is a target you are resting ON, so it switches
  // the day and nothing turns; the EDGE has already lifted the page to its detent, so what it
  // owes is the rest of the motion — `turn` finishes it and changes the day at the end, on the
  // swipe's own path. The caller decides, which is why this stays one hook.
  //
  // **And the dwell is the TARGET's, not a constant** (§2d's repair; owner: _"hard to go
  // back"_). A pill always costs the full rest; the edge costs half when it is undoing the
  // step it just made, which is the difference between correcting a mistake and setting out
  // again.
  useSpringLoadedDay(
    overDate ?? edgeDay.date,
    activeDate,
    (date) => {
      if (overDate || edgeDay.step == null) return setActiveDate(date);
      // The edge is told at the COMMAND, not at the arrival: the page takes `--t-base` to
      // travel and the hand can be somewhere else by then (§2d's fifth repair).
      edgeDay.turning();
      daySurface.turn(edgeDay.step);
    },
    overDate ? DRAG_DAY_DWELL_MS : edgeDay.dwell,
  );

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
    edgeDay.stop();
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
  // **The hard row's half of the same gesture** (ADR-0199 §1). It never drags — a hard
  // event is a pinned anchor (ADR-0011) — so until now it got no hold props at all, and
  // with them it lost the `selectstart` cancel and the context-menu prevent: what answered
  // a press-and-hold on a commitment was the platform's text-selection UI. It takes the
  // same hook in refusal mode now, so the hold is answered and the finger comes straight
  // back to the page.
  //
  // One object for every hard row rather than a factory per id: the handler is told which
  // element was held, and unlike a drag there is nothing else about the row it needs.
  const rowRefuseProps = useMemo(
    () => holdToDrag({ onRefuse: (el) => playBeat(el, BEAT.PINNED) }),
    [holdToDrag],
  );

  const rowDragProps = (id: string) =>
    holdToDrag({
      onArm: (el, at, pressBox) => {
        autoScroll.start(el, at, hitTestRowDrop);
        edgeDay.arm(at);
        ghost.lift(el, at, pressBox);
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
        edgeDay.track(point);
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
    const overId =
      (el?.closest(`[${EVENT_ROW_ATTR}]`) as HTMLElement | null)?.getAttribute(EVENT_ROW_ATTR) ??
      null;
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
  // Capped, with the tail handed to the Map's אולי facet (§5), and the idea you just
  // added held at the head whatever it scored (ADR-0116's 2026-08-11 amendment). The
  // same shared derivation Trip mode's day view calls, for the same reason the grouping
  // above is shared: two shelves, one strip.
  const { strip: rankedPool, tail: poolTail } = poolStrip(
    shelf.pool,
    {
      places,
      date: activeDate,
      stops,
      // `fits-a-day` needs every day's stops, not just this one's (ADR-0151's 2026-08-04
      // amendment) — so a dateless idea can name the day it belongs to instead of saying
      // "added recently" on every day of the trip.
      days: tripDayStops(tripDates(trip.startDate, trip.endDate), events, bookings, places),
    },
    { justAdded: justAddedIdea, limit: SHELF_POOL_CAP },
  );
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

  // Drag a shelf card onto a gap (ADR-0116 §5). Deliberately the SAME mechanism as
  // the reorder grip above — pointer capture + a hit-test on the element under the
  // pointer — rather than a second drag implementation; only the target attribute
  // (`data-gap-key`) and the drop action differ. Dropping schedules the idea into
  // that gap's slot: exactly the write the gap-fill sheet already performs.
  const [ideaDrag, setIdeaDrag] = useState<IdeaDrag>(null);

  // **A DAY TURN TAKES THE TARGET WITH IT.** Every drop target but one — a row, a seam, a gap
  // chip, a shelf group, the empty day — lives on the day SURFACE, and the surface is what the
  // edge dwell turns (ADR-0116 §2d). So rest at the edge over a gap chip, let the day arrive
  // and release without moving: the commit landed in a gap on the day you had just left, while
  // you were looking at another one — measured, the sheet opened on `יום ד׳, 2 בספט׳` with day 5
  // on screen. The day PILL is deliberately kept: the header strip is not what turned, and
  // `overDate` is also what `useSpringLoadedDay` is aiming at, so clearing it would cancel the
  // pill's own drop the instant its dwell landed.
  //
  // This is the hit-test's own rule — "content moving under a stationary finger changes the
  // answer just as much as the finger moving does" — applied to the one thing that moves ALL of
  // it. Discarded rather than re-resolved, because a turn is animated: the surface is still in
  // flight when the day arrives, so anything `elementFromPoint` answered here would be a target
  // read mid-motion and then never read again. The next move resolves one on the day now under
  // the finger; a release before that comes to nothing, which is what `restoreDay` is for.
  //
  // **In render, beside `live.current.activeDate`'s own assignment, and neither `useEffect` nor
  // `useLayoutEffect` will do.** Both were tried and both fire too late: the release beat the
  // effect to the drop with the new day already in `live` and the old day's slot still in the
  // target (logged in that order). A ref written during render belongs to the render that wrote
  // it whether or not that render ever commits — which is exactly the pairing wanted here, since
  // the day this invalidates against is one of those refs.
  const dayOfTargets = useRef(activeDate);
  if (dayOfTargets.current !== activeDate) {
    dayOfTargets.current = activeDate;
    const row = live.current.drag;
    if (row) {
      const next = {
        ...row,
        overId: null,
        overShelf: null,
        overGap: null,
        fill: undefined,
        overDay: false,
      };
      live.current.drag = next;
      setDrag(next);
    }
    const idea = live.current.idea;
    if (idea) {
      const next = { ...idea, overShelf: null, overGap: null, fill: undefined, overDay: false };
      live.current.idea = next;
      setIdeaDrag(next);
    }
  }
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
      onArm: (el, at, pressBox) => {
        autoScroll.start(el, at, hitTestDropTarget);
        edgeDay.arm(at);
        ghost.lift(el, at, pressBox);
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
        edgeDay.track(point);
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
          onShowOnMap={eventShowOnMap(e, bookings, places, showPlaceOnMap)}
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
        icon={ideaGlyph(m, places)}
        title={m.title}
        // A pool card carries its ranking reason; the day's own group carries the
        // distance or nothing (ADR-0116 §2, ADR-0151 §8).
        meta={
          reasonById.has(m.id)
            ? tileReasonText(reasonById.get(m.id)!, dayNaming)
            : stopReasonText(forDayReasons.get(m.id))
        }
        notes={noteCountFor(noteCounts, 'maybeItem', m.id)}
        onShowOnMap={ideaShowOnMap(m, places, showPlaceOnMap)}
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
  /**
   * **THE DAY'S TWO EDGE LEGS, DERIVED ONCE** (ADR-0206 §AJ5) — the leg out of the bed you
   * woke in and the leg back into the one you sleep in.
   *
   * They were assembled inline, inside the bookend fragments, which is why §AJ4's reorder
   * reached the holes BETWEEN rows and not these two: `dayBlocks` owns the former and there
   * was nothing owning the latter. Naming them here is what lets the slot and the leg be
   * ordered against each other at all, since the slot renders outside the fragment.
   */
  const headJourney = (() => {
    if (!bookends.woke || planGroups.length === 0) return { journey: null, to: undefined };
    const to = groupStartEvent(planGroups[0]);
    return { journey: journeyFor(bookends.woke, to), to };
  })();
  const tailJourney = (() => {
    if (!bookends.sleeps || planGroups.length === 0) return { journey: null, from: undefined };
    const from = groupEndEvent(planGroups[planGroups.length - 1]);
    return { journey: journeyFor(from, bookends.sleeps), from };
  })();
  /**
   * **And the slot each of them narrows** — `narrowGapForTravel`, the same function Trip mode
   * applies between two rows, rather than a second correction of its own (root rule 8).
   *
   * **It is a deliberate no-op on the arm that matters most.** A leg out of an ambient stay
   * has no `departAfterMs` (ADR-0206 §AD/§AF3: a middle night has no check-out instant, and
   * reaching for the day window's dawn would claim you could have left at 07:00), so its
   * `journey.free` is `null` and this returns the hole untouched. That is the app declining
   * to state a number it cannot stand behind, not a gap in the correction — and it is why the
   * head slot can still read longer than the leg beside it allows. The residue is backlogged
   * rather than papered over with an invented instant.
   */
  const headSlot = edgeFree.before
    ? narrowGapForTravel(edgeFree.before, headJourney.journey, tz)
    : null;
  const tailSlot = edgeFree.after
    ? narrowGapForTravel(edgeFree.after, tailJourney.journey, tz)
    : null;
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
  /**
   * **A position's free time, once the journey into it is counted** (ADR-0206 §V1.1's correction,
   * reaching its last surface — §AN).
   *
   * A `DayPosition` is a hole with the rows either side of it named, which is exactly the pair
   * `useDayTravelReads` is keyed on — so the correction is a lookup rather than a second
   * derivation, and the sheet reads the number the chip already shows for the same hole
   * (ADR-0159 §1: two surfaces, one fact).
   *
   * **Absent where there is no pair to ask about, and that is most of them.** The day's two edges
   * have a row on one side only, and a position joined around the row being MOVED
   * (`dayPositions`' `exclude`) has two rows that are not adjacent on the day as it stands. Both
   * keep the raw hole, which is §D4 rather than a compromise: the app does not invent a walk it
   * did not measure, so a position it cannot correct reads precisely as it read before any of
   * this existed.
   */
  const positionSlot = (p: DayPosition): Gap => narrowedFree(p.afterEvent, p.beforeEvent, p.free);
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
    // **What is FREE here, not how long the hole is** (ADR-0206 §V1.1 / §AN) — the last
    // surface still stating the raw gap. The chip, the seam and the between-row label were
    // corrected in M6a; this one was not, because `dayPositions` answers with **positions**
    // and the correction is about **pairs**. So the pair is looked up where there is one and
    // the position is left exactly as it was where there is not.
    //
    // `earnsChipAt` on the corrected number, not `earnsChip` on the hole (§AG5): a 45-minute
    // hole a 40-minute walk eats is not an offer, and the sheet must not list one the day
    // itself refuses to draw. That is the same threshold asked the same question, so a
    // position offered here and a chip drawn there cannot disagree.
    //
    // **And the FILL is the same corrected slot, which is the 2026-09-01 half.** This row stated
    // the free minutes and then handed the raw hole to the write — so a position could say
    // `פנוי · 10 דק׳` and put an hour-long event across the drive it had just subtracted. One
    // sheet contradicting itself in two taps; one object now, so it cannot.
    free: (() => {
      const minutes = positionSlot(p).minutes;
      return earnsChipAt(minutes) ? t.planDay.slotFree(gapLabel(minutes)) : undefined;
    })(),
    fill: positionSlot(p).fill,
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

  /** Each pooled idea's reason, by id — the sheet needs the one for the idea it opened on,
   *  and the tiles need them anyway. */
  const poolReasonById = new Map(rankedPool.map((r) => [r.item.id, r.reason]));
  /** **The "agree with the proposal" row**, or nothing when this idea carries no proposal
   *  (ADR-0151's 2026-08-04 amendment). The day comes from the ranking's own reason, so the
   *  sheet cannot offer a day the tile did not name. */
  /** The full sentence for the idea's own sheet — the tile drops the stop name, this does not
   *  (ADR-0151's amendment). Absent when the ranking had nothing to say about it. */
  const ideaWhy = (m: MaybeItem) => {
    const reason = poolReasonById.get(m.id) ?? forDayReasons.get(m.id);
    return reason ? reasonText(reason, dayNaming) : undefined;
  };
  const markForDay = (m: MaybeItem) => {
    const date = proposedDay(poolReasonById.get(m.id));
    if (!date) return undefined;
    return {
      label: t.day.idea.markForDay(dayLabel(date, { trip, today, anchor: activeDate })),
      onSelect: () => {
        verbs.acceptDay(m, date);
        setIdeaSheet(null);
      },
    };
  };

  const weekday = weekdayName(activeDate, trip.timezone);
  /** The day of the month, which the head stamps — the trip ORDINAL is the header anchor's
   *  (`יום 3/12`) and is not repeated in the head (ADR-0219 §2). */
  const dayOfMonthLabel = dayOfMonth(activeDate);

  /**
   * **What the head says this day is, and what it shows of it** (ADR-0219 §2/§3) — the same two
   * derivations Trip mode and the public reader use, which is what makes the three surfaces name
   * and picture a day identically. Memoized on the trip state they read; both walk the whole
   * trip's events, since naming a day asks whether it is the way out or the way home.
   */
  const headTitle = useMemo(
    () =>
      dayHeadTitle({
        trip,
        date: activeDate,
        dayEvents,
        events,
        bookings,
        places,
        placeLabels,
        enrichments,
      }),
    [trip, activeDate, dayEvents, events, bookings, places, placeLabels, enrichments],
  );
  const shot = useMemo(
    () => dayShot(dayEvents, places, placeLabels, enrichments),
    [dayEvents, places, placeLabels, enrichments],
  );
  /** The full picture, opened from the shot — the screen owns the viewer, as `Map.tsx` does for
   *  `PlaceKnowledge`'s hero (ADR-0167 §10). */
  const [fullShot, setFullShot] = useState<DayShot | null>(null);

  /**
   * **The facts true of the WHOLE day, in the head's footer band** (ADR-0219 §2/§4), at most two.
   *
   * **HOW FAR THE DAY GOES** (ADR-0206 §V1.9 / §AP) leads, because it is true of every day where
   * the verdict is true of few — and it is not Plan's to differ about, so Trip renders the same
   * component off the same function.
   *
   * **THE DAY'S OWN VERDICT** (ADR-0206 §V1.7 / §AN) follows, and three things about it are
   * decisions rather than styling. **It only ever appears** — there is no positive arm, because
   * §D4 says a reader must not be able to tell "not computed" from "not computable", and a `✓` on
   * an unmeasured day is exactly that tell, in the direction that costs someone their afternoon.
   * **It is amber, not `--miss`** — what is missing is time (rule 4), and painting the whole day
   * with the status colour is the app scolding you for planning. **It says what no leg's row
   * can** — how many, and the sum; without the count it is an echo of the block below it.
   *
   * On a read-only past day the verdict gives way to the note that says so — the day is not
   * yours to fix, so an opinion about its fit has nothing to act on. That note was the
   * `.sec-title`'s trailing `hint`, which the head's footer band now carries (ADR-0219 §2).
   */
  const headFacts: ReactNode[] = [];
  if (dayTotal.distanceMeters !== null) {
    headFacts.push(<DayTravelTotal key="total" total={dayTotal} />);
  }
  if (readOnly) {
    headFacts.push(
      <span key="past">
        <Icon name="archive" /> {t.planDay.pastNote}
      </span>,
    );
  } else if (planFit.fit === TRAVEL_FIT.OVERRUNS) {
    headFacts.push(
      <span key="fit" className="wp-dayhead-fit">
        <Icon name="warn" /> {infeasibleLegsPhrase(planFit.legs)} {DOT_SEPARATOR}{' '}
        {dayShortfallPhrase(planFit.overrunSeconds / SECONDS_PER_MINUTE)}
      </span>,
    );
  }

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
    // Filled in by `BuilderEntries`, which is where the placed entries exist to derive it.
    nowMark: null,
    tz,
    zoneCtx,
    readOnly,
    nowRefMs,
    nowZone,
    bookings,
    places,
    enrichments,
    placeLabels,
    showPlaceOnMap,
    noteCounts,
    taskCounts,
    docCounts,
    hostContexts,
    verbs,
    dayEvents,
    softEvents,
    softIndex,
    drag,
    narrowedFree,
    slotNote,
    journeyFor,
    legOnMap,
    legZones,
    modeFor: planTravel.modeFor,
    modeControl,
    rowDragProps,
    rowRefuseProps,
    onEdit: (e) => {
      const booking = e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined;
      if (booking) setBookingTarget(booking);
      else setFormTarget(e);
    },
    // **A booked event's read already exists** and is `BookingDetail` (ADR-0172 §1) —
    // reached from the Index and, until now, from nowhere in Plan mode. That is what makes
    // §4 half-built rather than new: only the unbooked event needed a surface.
    onOpen: (e) => {
      const booking = e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined;
      if (booking) setDetailTarget(booking);
      else setEventDetail(e);
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
    <div className="builder day-swipe" data-preview={preview || undefined} ref={daySurface.ref}>
      {/* **THE DAY YOU ARE SWIPING TOWARD, DRAWN WHILE YOU SWIPE** (ADR-0200 §7). The same
          screen, one day over, inert — so what the page turn lands on is what the committed
          day draws, and the seam needs no cross-fade. `preview` stops the recursion at depth
          one: a peek renders no peeks of its own. */}
      {/* One condition again (§2d): a commanded lift sets the pager's own `live`, because the
          lift IS a page turn that has begun — so the panes mount for a finger and for a dwell
          through the same flag. §2c needed a second one only because it animated the pane
          instead of the strip. */}
      {!preview && daySurface.live && (
        <DayPeeks prev={daySurface.peek.prev} next={daySurface.peek.next}>
          <PlanDay />
        </DayPeeks>
      )}
      {/* Held until this device has said what travel it holds, exactly as Trip mode is and for
        the same measured reason (ADR-0206 §AT) — the two day surfaces may not differ about a
        fact, and "does the day assemble in one paint or two" is one. */}
      <div className="day-page" data-measuring={!planTravel.settled || undefined}>
        <div className="builder-main">
          {/* **A DAY IS A PLACE YOU CAN SEE** (ADR-0219 §2/§3) — the same head Trip mode and the
            public reader draw, off the same derivations. Plan's posture shows in what its
            footer band carries, never in what the head SAYS: ADR-0159 §1 allows a difference in
            posture and forbids one about a fact. */}
          <DayHead
            card
            dayNumbers={dayOfMonthLabel}
            weekday={weekday}
            /* **Amber marks today in Plan too** (ADR-0219 §2). Plan's ban is on the now PULSE
              (ADR-0043 §5), not on marking which day the trip is on — and the day strip above
              already paints today amber here. */
            isNow={activeDate === today}
            title={headTitle}
            shot={shot && { ...shot, eager: true, onOpen: () => setFullShot(shot) }}
            facts={headFacts}
            action={
              readOnly ? undefined : (
                <button className="new-event-btn" onClick={() => setFormTarget('new')}>
                  <Icon name="plus" /> {t.actions.newEvent}
                </button>
              )
            }
          />

          {/* **A COMMITMENT WITH NO CLOCK IS A ROW** (ADR-0219 §4), at the top of the list. The
            same row Trip mode draws, on `.transition-row`'s grammar, **without the settle
            control**: Plan settles through a sheet off the row menu and never inline, and
            `נותרו היום` — the number that made settling load-bearing on Trip's copy — is a
            Trip-mode number (ADR-0171 §10e). Posture differs; the fact does not. */}
          {placement.commitments.map((row) => (
            <UnplacedCommitment
              key={`${row.event.id}-${row.edge ?? 'untimed'}`}
              row={row}
              tz={tz}
              bookings={bookings}
              onOpen={setDetailTarget}
            />
          ))}

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
              {/* Overlaps render as the concurrency forest (ADR-0041): nests for
                containment, violet clusters for partial overlap. Gap chips sit
                only between top-level groups — never inside an overlap.
                Transition points interleave by instant at the top level (§B). */}
              {/* **WHAT BROUGHT YOU IN THROUGH THE NIGHT** (ADR-0054's 2026-08-26 amendment) —
                above the bed, because that is the order it happened in. The map has sorted a
                midnight car hire ahead of the hotel since 2026-08-25 and both lists drew it
                below: one fact, two answers (ADR-0159 §1). */}
              {overnight.map((entry) => (
                <TransitionRow
                  key={`${entry.event.id}-${entry.edge}`}
                  entry={entry}
                  tz={tz}
                  {...eventEdgeZone(entry.event, entry.edge, zoneCtx)}
                  bookings={bookings}
                  onOpen={setDetailTarget}
                />
              ))}
              {/* …and the drive from that edge into the bed (owner, 2026-08-26). */}
              {bookends.woke &&
                overnight.length > 0 &&
                (() => {
                  const cameIn = overnight[overnight.length - 1]!;
                  if (cameIn.event.id === bookends.woke!.id) return null;
                  const j = journeyFor(cameIn.event, bookends.woke!);
                  return j ? (
                    <JourneyRow
                      journey={j}
                      travelMode={planTravel.modeFor(cameIn.event, bookends.woke!)}
                      {...modeControl(cameIn.event, bookends.woke!)}
                      onShowOnMap={legShowOnMap(
                        planTravel.pairFor(cameIn.event, bookends.woke!),
                        showPlaceOnMap,
                      )}
                      zones={legZones(cameIn.event, bookends.woke!)}
                    />
                  ) : null;
                })()}
              {/* **WHERE THE DAY STARTS** (ADR-0209 §1) — the same two rows Trip mode draws,
                off the same `dayBookendStays`. **Without the settle pair**, which is ADR-0171
                §10e's posture difference: Plan settles through a row menu, not inline. */}
              {bookends.woke && (
                <StayRow
                  stay={bookends.woke}
                  edge="wake"
                  bound={planStayBound(bookends.woke)}
                  bookings={bookings}
                  onOpen={setDetailTarget}
                />
              )}
              {/* The day's head: free time before the first event, which `freeBetween` cannot
                see because it has an event on one side only (session-123). **Below the row the
                day starts at** since ADR-0209 put one there — a drop target for the morning was
                reading above the bed it belongs after.

                **…and ABOVE the leg out of that bed** (ADR-0206 §AJ5, owner 2026-08-31: _"there
                are some edge cases with the gap-transit ordering at the start and end of days"_).
                §AJ4 put the free time above the journey between two ROWS and left the day's two
                edges alone, where the pair is assembled by hand rather than by `dayBlocks` — so
                the head still read leg-then-hole, which is the order the report was about. */}
              {edgeFree.before && headSlot && !heldAtEdge(edgeFree.before, timed[0]) && (
                <FreeSlot
                  free={headSlot}
                  label={t.planDay.gapBefore(gapLabel(headSlot.minutes))}
                  seamLabel={t.planDay.seamDayStart}
                  over={overGap(headSlot.fill)}
                  onFill={setGapChoice}
                />
              )}
              {headJourney.journey && headJourney.to && bookends.woke && (
                <JourneyRow
                  journey={headJourney.journey}
                  travelMode={planTravel.modeFor(bookends.woke, headJourney.to)}
                  {...modeControl(bookends.woke, headJourney.to)}
                  onShowOnMap={legShowOnMap(
                    planTravel.pairFor(bookends.woke, headJourney.to),
                    showPlaceOnMap,
                  )}
                  zones={legZones(bookends.woke, headJourney.to)}
                />
              )}
              <BuilderGroups
                groups={planGroups}
                depth={0}
                ctx={builderCtx}
                entries={placement.positioned}
              />
              {/* The day's tail: free time after the last event. It stays ABOVE the line
                below, because a drop slot IS a position — everything that has one sits
                above everything that does not.

                **…and above the leg back into the bed, and above the bed** (ADR-0206 §AJ5).
                It used to sit under BOTH, which drew the evening's free time after you had
                already gone to sleep. Its window starts at the last event's end
                (`freeAfterLast`), so that is where it hangs — and the drive home is the last
                thing inside it, not something that happens before it starts. */}
              {edgeFree.after &&
                tailSlot &&
                !heldAtEdge(edgeFree.after, timed[timed.length - 1]) && (
                  <FreeSlot
                    free={tailSlot}
                    label={t.planDay.gapAfter(gapLabel(tailSlot.minutes))}
                    seamLabel={t.planDay.seamDayEnd}
                    over={overGap(tailSlot.fill)}
                    onFill={setGapChoice}
                  />
                )}
              {/* …and where the day ends, with the leg back into it above. */}
              {tailJourney.journey && tailJourney.from && bookends.sleeps && (
                <JourneyRow
                  journey={tailJourney.journey}
                  travelMode={planTravel.modeFor(tailJourney.from, bookends.sleeps)}
                  {...modeControl(tailJourney.from, bookends.sleeps)}
                  onShowOnMap={legShowOnMap(
                    planTravel.pairFor(tailJourney.from, bookends.sleeps),
                    showPlaceOnMap,
                  )}
                  zones={legZones(tailJourney.from, bookends.sleeps)}
                />
              )}
              {bookends.sleeps && (
                <StayRow
                  stay={bookends.sleeps}
                  edge="sleep"
                  bound={planStayBound(bookends.sleeps)}
                  bookings={bookings}
                  onOpen={setDetailTarget}
                />
              )}
              {/* …then what holds no position at all (ADR-0171 §10a): the same line Trip
                mode draws, over the same rows, from the same split. */}
              {placement.ideas.length > 0 && (
                <div className="day-unplaced">
                  <span className="line" />
                  <span className="lbl">{t.day.unplaced}</span>
                  <span className="line" />
                </div>
              )}
              {placement.ideas.map((row) => (
                <BuilderNode
                  key={row.event.id}
                  item={{ event: row.event, children: [] }}
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
              <Icon name="plus" /> {t.planDay.addToDay}
            </button>
          )}
        </div>

        {/* The maybe-shelf is trip-building (ADR-0025 Tier 3), so a finished
          read-only trip drops it entirely (ADR-0040). */}
        {!readOnly && (
          <div className="builder-side">
            <div className="sec-title">{t.day.maybeShelf}</div>
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
                  className={'shelf edge-fade' + (overShelf(SHELF_DROP.DAY) ? ' drop-over' : '')}
                  data-shelf-drop={SHELF_DROP.DAY}
                  ref={edgeFadeRef}
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
                  className={'shelf edge-fade' + (overShelf(SHELF_DROP.POOL) ? ' drop-over' : '')}
                  data-shelf-drop={SHELF_DROP.POOL}
                  ref={edgeFadeRef}
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
            naming={{ trip, today, anchor: gapChoice.fill.date }}
            {...shelfForSlot(
              shelf,
              gapChoice.fill,
              tz,
              { events, bookings, places },
              gapChoice.minutes,
            )}
            glyph={(m) => ideaGlyph(m, places)}
            onPickIdea={(m) => {
              // The idea's own category decides how long it gets, capped by this position's room
              // (ADR-0161 §5) — a meal is an hour and a half, a hike three hours, and the flat
              // hour every create used to get was neither.
              const block = ideaBlock(ideaCategory(m, places), gapChoice);
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
                openSchedule(
                  item,
                  position
                    ? ideaBlock(ideaCategory(item, places), positionSlot(position))
                    : option.fill,
                );
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
            markForDay={markForDay(ideaSheet)}
            why={ideaWhy(ideaSheet)}
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

        {eventDetail && (
          <EventDetail
            event={eventDetail}
            zoneCtx={zoneCtx}
            onClose={() => setEventDetail(null)}
            // A finished trip is browsable and not editable (ADR-0040), so the archive's read
            // carries no way to write — which is also what makes opening it safe there.
            onEdit={
              readOnly
                ? undefined
                : () => {
                    setEventDetail(null);
                    setFormTarget(eventDetail);
                  }
            }
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
      </div>
      {/* Whatever is under the finger — a shelf card or a builder row (sessions
          117-118). Deliberately EMPTY here: the hook appends a DOM clone of the
          source, which is what lets one mechanism serve two completely different
          pieces of markup and keeps the clone from ever drifting from the original.
          A clone rather than the original because a shelf card sits in a
          horizontally scrolling strip that would clip it the moment it left.
          `position: fixed` escapes that, so this is NOT an overlay in the ADR-0090
          sense — not a back target, never in the back stack, hence no
          `Modal`/`useOverlay`. `inert` + `aria-hidden` because it is a duplicate of
          something still in the list.

          **OUTSIDE `.day-page`, and that is load-bearing** (ADR-0116 §2d's repair). It lived
          inside until the edge dwell started translating the page under a live drag: a
          transform makes its element the containing block for every `position: fixed`
          descendant, so the clone stopped being positioned against the viewport and picked up
          the page's own offset — measured at 117px down the screen and growing, with the
          finger still at the same y, which is the owner's _"it no longer is under the
          finger"_ and _"the ghost disappears sometimes"_. `.day-swipe` itself is never
          transformed (the pager is careful to put the offset on the inner page precisely so
          the fixed panes survive), so one level out is a viewport-anchored clone again. Any
          fixed layer that must track the finger belongs here, not in there. */}
      {dragLive && <div className="wp-dragghost" ref={ghost.ref} aria-hidden="true" inert />}

      {/* **The day's picture, full screen** (ADR-0219 §3) — the same viewer Trip mode and the
        Map open, owned by the screen because the viewer is a portal. The credit is its caption:
        full screen is the photograph's most prominent display. */}
      {fullShot && (
        <MediaViewer
          title={fullShot.of}
          mimeType={fullShot.image.mimeType}
          source={{ kind: 'url', url: fullShot.url }}
          caption={fullShot.credit}
          intrinsic={fullShot.image}
          onClose={() => setFullShot(null)}
        />
      )}
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
  /** **The moment's row and where in it** — the same field `DayCtx` carries, threaded for the
   *  same reason: only `BuilderNode` knows which event it is drawing, so a NESTED row can take
   *  the mark with no case of its own (ADR-0217 §2). `null` unless the builder is on today. */
  nowMark: { key: string; thruFrac: number; label: string } | null;
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
  /** **What the world knows about each place** (ADR-0166 §6), threaded beside `places` for the
   *  same reason — read here only to fill the row's badge with a photograph (ADR-0219 §1).
   *  Trip's `DayCtx` carries the same pair: the two day surfaces answer this identically. */
  enrichments: TripEnrichments;
  /** A nickname or the city an airport serves, per place (ADR-0166 §18) — threaded with `places`
   *  because a builder row asks both questions about the same endpoint. */
  placeLabels: PlaceLabels;
  /** `useShowPlaceOnMap()` — `null` outside the trip shell, which drops the row's
   *  `מפה` action rather than breaking it (ADR-0121 §8). */
  showPlaceOnMap: ShowPlaceOnMap;
  /** **What each row's marks count** (ADR-0152 §6c / ADR-0174 §1). Both are whole-screen
   *  lookups built once per list change, and both are read through the row's CONTEXT — a
   *  booked event's notes and attachments may sit on its booking. */
  noteCounts: Map<string, number>;
  taskCounts: Map<string, number>;
  docCounts: Map<string, number>;
  hostContexts: HostContextIndex;
  verbs: ReturnType<typeof useVerbs>;
  dayEvents: TripEvent[];
  softEvents: TripEvent[];
  softIndex: Map<string, number>;
  drag: { id: string; overId: string | null } | null;
  /** **A hole corrected for its own journey** (ADR-0206 §V1.1) — the correction, applied to the
   *  CONTROL rather than to the statement. Plan mode does not display a hole, it OFFERS it, so
   *  the overstatement Trip mode was making reaches a person here as a slot: a 45-minute chip
   *  over a hole a 40-minute walk eats. The read is `useDayTravelReads`, the same hook the day
   *  list uses, so the two surfaces cannot differ about one hole (`frontend/CLAUDE.md`:
   *  ADR-0159 §1 allows a difference in posture and forbids one about a fact).
   *
   *  **The whole `Gap`, not its minute count** (2026-09-01): the label and the slot are two halves
   *  of one offer, and correcting only the first is what let the sheet's own header contradict the
   *  leave-by printed beside it. */
  narrowedFree: (
    from: TripEvent | null | undefined,
    to: TripEvent | null | undefined,
    free: Gap,
  ) => Gap;
  /** The chip's own explanation of why it shrank (§2's drawn `bld-slot-note`). */
  slotNote: (from: TripEvent, to: TripEvent, hole: number) => string | undefined;
  /** The journey across a hole, for the block Plan draws above its chip (§2's own drawing).
   *  **Read out of the day's one derivation, never re-derived here** (ADR-0206 §AN) — the same
   *  objects the day-level verdict is rolled up from. */
  journeyFor: (from: TripEvent, to: TripEvent) => DayJourney | null;
  /** One tap from a leg to that leg on the canvas (owner, 2026-08-27). */
  legOnMap: (from: TripEvent, to: TripEvent) => (() => void) | undefined;
  /** **Which zone each of a journey block's two clocks reads in** (ADR-0206 §AQ) — threaded
   *  rather than derived here, because `legZones` looks the leg up in `planLegs` and this
   *  component only has two rows. */
  legZones: (from: TripEvent, to: TripEvent) => JourneyZones;
  /** The trip's derived mode, so the block names the same three words everywhere (§Z2). */
  /** **The LEG's mode** (ADR-0206 §AM) — the override where one was set, the trip's derivation
   *  otherwise. A function rather than a value, because Plan draws several legs per day and they
   *  need not agree. */
  modeFor: (from: TripEvent, to: TripEvent) => LegTravelMode;
  /** **The mode switch for one leg** (ADR-0206 §AM9), or `{}` where the surface offers none — a
   *  read-only past day, or a leg whose ends do not both resolve to a place. */
  modeControl: (from: TripEvent, to: TripEvent) => LegModeControl;
  rowDragProps: (id: string) => HoldToDragProps;
  /** Shared by every hard row — the hold is answered rather than armed (ADR-0199 §1). */
  rowRefuseProps: HoldToDragProps;
  onEdit: (event: TripEvent) => void;
  /** The row's own tap (ADR-0174 §4) — the READ, routed by whether the event is booked. */
  onOpen: (event: TripEvent) => void;
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
  note,
  seamLabel,
  over,
  onFill,
}: {
  /** **Already corrected for the journey in it** (`narrowGapForTravel`) — its `minutes` is what is
   *  free rather than how long the hole is, and its `fill` is the window that leaves the road
   *  alone. This used to take the corrected number as a SECOND prop beside the raw gap, which is
   *  how the chip's label and the slot it opened came to describe different holes (2026-09-01).
   *  One object: `where-a-route-shows-up-v1.html` §2's `if (left >= 60)` reads off it, and so does
   *  every drop key and every fill. */
  free: Gap;
  /** The chip's copy, when there is enough free time to earn one. */
  label: string;
  /** Why the offer is smaller than the hole (§2's drawn note line). Absent with no estimate. */
  note?: string;
  /** The seam's copy — its OUTCOME, like every other drop zone in the builder. */
  seamLabel: string;
  over: boolean;
  /** The whole position, not its slot: a filler needs the room to cap a length against. */
  onFill: (free: Gap) => void;
}) {
  // Asked of `lib/gaps.ts`, never re-derived here: the threshold that decides chip-vs-seam is the
  // same one `gapBetween` applies, and two copies of it would drift. What it is asked ABOUT is the
  // free minutes rather than the hole, since §V1.1 — which the Gap itself now answers.
  const isChip = earnsChipAt(free.minutes);
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
          {note && <span className="bld-slot-note">{note}</span>}
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
  entries: placed,
}: {
  groups: TimeGroup[];
  depth: number;
  ctx: BuilderCtx;
  /** The day's rows that hold a position, already split (ADR-0171 §10a) — depth 0 only.
   *  Passed in rather than merged here because the split has to happen once, above, where
   *  the strip and the tail are rendered from the same answer. A nested depth has no
   *  transitions of its own and merges as before. */
  entries?: DayEntry[];
}) {
  // The static now-reference sits at depth 0 only, above the first entry that
  // isn't fully behind "now" (a transition point ends at its own instant); it
  // falls after them all if every entry is passed.
  const nowRefMs = depth === 0 ? ctx.nowRefMs : null;
  const entries = depth === 0 && placed ? placed : mergeDayEntries(groups, []);
  // The same placement the Trip-mode now-line uses (`lib/now-line.ts`) — this screen's
  // marker is static rather than live, which is a difference in the INSTANT it is given
  // and nothing else.
  // The same derivation Trip's marker reads (`lib/now-line.ts`), which is the point:
  // ADR-0159 §1 permits a difference in POSTURE and forbids one about a fact. This screen's
  // marker is static rather than live — a difference in the instant it is given — and now also
  // in what it says: it marks the row and does NOT count down inside it, because a countdown
  // on a drafting table is a live signal and ADR-0043 §5 refuses one here.
  const nowPlaced = nowRefMs === null ? null : nowLinePlacement(entries, nowRefMs);
  const nowRefIndex = nowPlaced?.index ?? -1;
  const nowInsideRow = nowPlaced?.inside ?? null;
  const nowRefLabel = nowRefMs === null ? '' : formatTime(new Date(nowRefMs), ctx.nowZone);
  // The ctx the rows render from, carrying the mark down to whatever depth holds the moment.
  const rowCtx: BuilderCtx = {
    ...ctx,
    nowMark: nowInsideRow ? { ...nowInsideRow, label: nowRefLabel } : null,
  };
  // Positions are measured between consecutive EVENT groups only — a transition point
  // interleaved between two groups doesn't break their adjacency.
  let prevEventGroup: TimeGroup | null = null;
  return (
    <>
      {entries.map((entry, i) => {
        const nowRef =
          i === nowRefIndex && nowRefMs !== null && !nowInsideRow ? (
            <NowMarker label={nowRefLabel} posture={NOW_POSTURE.PLAN} />
          ) : null;
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
        // **Corrected for the journey in it before anything else asks it a question** — its
        // length, its chip-versus-seam threshold, its drop key and the slot a fill lands on are
        // all read off this one object, so none of them can describe a different hole from the
        // leave-by drawn beside it (ADR-0206 §V1.1).
        const slot = between ? ctx.narrowedFree(prevEnd, groupStartEvent(g), between) : null;
        // A SEAM touching the held row is suppressed; a CHIP is not. The distinction is the
        // whole of it: a chip means "into that free afternoon", which is a real move however
        // adjacent it is, while a seam beside the held row means "start where you already
        // end" — a nudge by its own length, or nothing at all.
        const free = slot && touchesHeld && !earnsChip(slot) ? null : slot;
        prevEventGroup = g;
        const key = g.kind === 'cluster' ? `cl-${g.items[0].event.id}` : g.item.event.id;
        return (
          <Fragment key={key}>
            {nowRef}
            {/* **WHAT IS LEFT OF THE HOLE, THEN THE JOURNEY** (owner, 2026-08-31; ADR-0206
              §AH3's amendment). Plan needs both — the chip is a CONTROL and says what it
              offers, the block is the fact it is offering it around, and an infeasible leg
              has no chip at all, so the block is the only thing that can say so — but the
              order was the drawing's rather than the day's. `narrowGapForTravel` ends the
              slot AT the leave-by below it (§AY), so the two read as one sentence — and
              until that fix only the chip's LABEL shrank, which is what made the order
              look settled while the offer it opened still crossed the road.

              **Here the order is also a claim about where a drop lands.** `.gap`/`.bld-seam`
              carry `data-gap-key` and are what `gapAt` resolves a drag to, so above the block
              the seam means "here, then travel" and below it "travel, then here" — a position
              the day does not have. */}
            {free && prevEnd && between && (
              <FreeSlot
                free={free}
                label={t.planDay.gap(gapLabel(free.minutes))}
                note={ctx.slotNote(prevEnd, groupStartEvent(g), between.minutes)}
                seamLabel={t.planDay.seamAfter(prevEnd.title)}
                over={ctx.overGap(free.fill)}
                onFill={ctx.onGapFill}
              />
            )}
            {prevEnd &&
              depth === 0 &&
              (() => {
                const journey = ctx.journeyFor(prevEnd, groupStartEvent(g));
                return journey ? (
                  <JourneyRow
                    journey={journey}
                    travelMode={ctx.modeFor(prevEnd, groupStartEvent(g))}
                    {...ctx.modeControl(prevEnd, groupStartEvent(g))}
                    onShowOnMap={ctx.legOnMap(prevEnd, groupStartEvent(g))}
                    zones={ctx.legZones(prevEnd, groupStartEvent(g))}
                  />
                ) : null;
              })()}
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
                    ctx={rowCtx}
                    overlapNote={overlapSeam(g.items, idx)}
                  />
                ))}
              </div>
            ) : (
              <BuilderNode item={g.item} depth={depth} ctx={rowCtx} />
            )}
          </Fragment>
        );
      })}
      {nowRefMs !== null && !nowInsideRow && nowRefIndex === entries.length && (
        <NowMarker label={nowRefLabel} posture={NOW_POSTURE.PLAN} />
      )}
    </>
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
  const route = routeDisplay(eventRoute(e, ctx.bookings, ctx.places, ctx.placeLabels));
  // And the same badge photo, off the same `rowPhoto` (ADR-0219 §1) — a difference here would
  // be a difference about a FACT, which ADR-0159 §1 forbids between these two screens.
  const photo = rowPhoto(e, ctx.places, ctx.enrichments);
  // **THE MARK IS NAILED HERE**, at whatever depth this row is — the same three lines
  // `DayView`'s `ItemNode` carries, off the same ctx field and the same derivation
  // (ADR-0217 §2). Plan's posture makes it violet and dashed and nothing else.
  const marked = (row: ReactNode) =>
    ctx.nowMark && ctx.nowMark.key === e.id ? (
      <NowMarker
        label={ctx.nowMark.label}
        posture={NOW_POSTURE.PLAN}
        thruFrac={ctx.nowMark.thruFrac}
      >
        {row}
      </NowMarker>
    ) : (
      row
    );
  return (
    <>
      {marked(
        <BuilderRow
          event={e}
          tz={ctx.tz}
          photoUrl={photo && apiAssetUrl(photo.url)}
          title={route.title}
          zones={zones}
          duration={eventDurationLabel(e, booking, zones)}
          distance={eventDistanceLabel(booking, ctx.places)}
          readOnly={ctx.readOnly}
          notes={hostCountForContext(
            ctx.noteCounts,
            resolveHostContext(ctx.hostContexts, { kind: 'event', id: e.id }),
          )}
          documents={attachmentCountForContext(
            ctx.docCounts,
            resolveHostContext(ctx.hostContexts, { kind: 'event', id: e.id }),
          )}
          tasks={hostCountForContext(
            ctx.taskCounts,
            resolveHostContext(ctx.hostContexts, { kind: 'event', id: e.id }),
          )}
          onOpen={() => ctx.onOpen(e)}
          onEdit={() => ctx.onEdit(e)}
          onDelete={() => ctx.verbs.remove(e)}
          onShowOnMap={eventShowOnMap(e, ctx.bookings, ctx.places, ctx.showPlaceOnMap)}
          onPark={soft ? () => ctx.verbs.park(e) : undefined}
          dragProps={soft && !ctx.readOnly ? ctx.rowDragProps(e.id) : undefined}
          // A hard row refuses the same hold instead of arming it. Gated on `readOnly` for
          // the same reason the drag is: on a finished-trip archive nothing moves, so a beat
          // singling this row out as the anchored one would be saying something false.
          refuseProps={!soft && !ctx.readOnly ? ctx.rowRefuseProps : undefined}
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
        />,
      )}
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
  photoUrl,
  title,
  zones,
  duration,
  distance,
  readOnly,
  notes,
  documents,
  tasks,
  onOpen,
  onEdit,
  onDelete,
  onShowOnMap,
  onPark,
  dragProps,
  refuseProps,
  dragging,
  over,
  onPickTime,
  nestedCount,
  overlapNote,
  settle,
}: {
  event: TripEvent;
  tz: string;
  /** **A fetched photograph to fill the badge's interior** (ADR-0219 §1), or absent for the
   *  glyph. `EventCard`'s prop of the same name, resolved by the same `rowPhoto` — the two day
   *  surfaces render the same rows off the same derivation and must not differ about a fact. */
  photoUrl?: string;
  /** Title node — the screen passes the `routeDisplay` title so a transport row
   *  reads as its route; falls back to the stored title, itself route-aware
   *  (`TitleLabel`). */
  title?: ReactNode;
  /** Per-event display zones + the shift pill to show (ADR-0107). Absent → the
   *  row renders wholly in `tz` with no pill. */
  zones?: EventZones;
  /** Elapsed-duration label for transport + zone-shifted rows (ADR-0107/0084). */
  duration?: string;
  /** **How far a carried leg goes** (ADR-0212), formatted — see `EventCard`'s own prop. */
  distance?: string;
  // A finished trip is a read-only archive (ADR-0040): the row is browsable but
  // carries no edit/reorder/delete affordances.
  readOnly?: boolean;
  /** **How many notes / documents this row carries** (ADR-0152 §6c, ADR-0174 §1) — both
   *  counted over the row's whole CONTEXT, since a booked event's rows may sit on its
   *  booking. Plan mode showed neither mark before this, which is why they arrive together
   *  rather than one per session. */
  notes?: number;
  documents?: number;
  /** OPEN tasks on this row's context — the third mark (ADR-0191). */
  tasks?: number;
  /** **Open the row's READ** (ADR-0174 §4) — a booked event routes to `BookingDetail`,
   *  which is already its read because a linked pair is one context (ADR-0172 §1); an
   *  unbooked one gets `EventDetail`. Present on a read-only archive too. */
  onOpen: () => void;
  /** Open the editor. Reached from inside the read and from the `⋯` sheet — never from the
   *  row body any more. */
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
  /** Press-and-hold on a HARD row (ADR-0199 §1). Same hook, same 500ms, but the hold is
   *  answered with `BEAT.PINNED` and the gesture ends there — nothing arms, so the page
   *  keeps its scroll and the finger is handed straight back. Mutually exclusive with
   *  `dragProps` by construction: a row is one or the other. */
  refuseProps?: HoldToDragProps;
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
  // **GLYPHS ONLY ON THE ROW** (owner, 2026-08-09). The line carried
  // `placeName · הזמנה CODE` and a real code is `הזמנה #MEGAZIP-T141215488`, which
  // overflowed the row on a device and stranded the separator beside a place name
  // squeezed to zero width. Both texts come off; the place is the badge beside it and
  // the code is one tap away in the read this row now opens.
  const hasMeta = !!notes || !!documents;

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

  // **THE KIND CHIP IS GONE; THE SETTLE RECORD STAYS** (ADR-0178 §4). Hard/soft was
  // drawn three times — a leading `.bld-anchor`, this chip's text, and the border
  // (solid against soft's dashed) — and only the chip cost the TITLE anything, since
  // it is a flex sibling inside `.bld-t`. The lock now rides the when line, where
  // ADR-0011's commitment actually points; the border keeps carrying soft.
  //
  // What is left here is a different fact and is not the kind: on a finished trip a
  // soft row wears its settle status (ADR-0044), which no border says. Absent on a
  // live trip, which is why the slot is usually empty now.
  const settleTag = settle ? (
    settle.status === EVENT_STATUS.DONE ? (
      <span className="tag-done">
        <Icon name="check" /> {t.event.didThis}
      </span>
    ) : settle.status === EVENT_STATUS.SKIPPED ? (
      <span className="tag-skip">{t.event.skipped}</span>
    ) : (
      <span className="tag-phase">{t.event.notMarked}</span>
    )
  ) : null;

  // The when line is where the lock lives now — so a row that has no when slot at all
  // would lose the mark entirely. That row exists: an unplaced commitment on a
  // read-only archive renders no time element and no `＋ שעה` button. It keeps the
  // chip, which is the only surface left to carry it.
  const hasWhenSlot = !!event.startsAt || !!onPickTime;
  const hardLock = isHard ? <HardLock /> : null;

  /**
   * **THE WHOLE CARD OPENS THE READ** (owner report, 2026-08-24). The row's tap has been a
   * read since ADR-0174 §4 and only the title line carried it: `.bld-main` is ONE cell of
   * the grid ADR-0178 §1 laid out, so the row's padding, the badge's column and the free
   * width beside the when line answered nothing at all.
   *
   * **And the fix is here rather than in the stylesheet, which is the part worth keeping.**
   * The obvious answer is a hit layer stretched over the card from the button — the trade
   * `button.bld-time::after` already makes one slot over — and at THIS size it does not
   * survive a finger. A tap is arbitrated against each candidate's own layout box, so a
   * layer covering the whole card loses to `.bld`, whose box contains the point outright and
   * which is a candidate itself (the drag's pointer handlers make it one). Both layers were
   * tried against `e2e/plan-row-tap.spec.ts`'s taps — a `::after`, then a real child span —
   * and both read the same: `elementFromPoint` returned the layer at every point in the card
   * while every tap outside the title still dispatched its click to `.bld`.
   *
   * **This does not retire the idiom** — the same run has the chip's own ±8px reaching the
   * chip, because a few px out it is still the nearest candidate. It bounds it: expanding a
   * target past its neighbours' boxes is not the same trick as covering them. So the read is
   * opened from the element the browser actually hands the tap to, and the button keeps its
   * own `onClick` for the title, the keyboard and the accessible name.
   */
  const openFromCard = (e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    // This row's sheets are rendered inside this element and portal out, and a React portal
    // bubbles to its REACT parent — so a tap on a sheet's backdrop arrives here. Only a real
    // descendant is a tap on the card.
    if (!e.currentTarget.contains(target)) return;
    // A control on the card answered it already: the time, the ⋯, the badge's way to the map,
    // the settle mark — and `.bld-main`, whose own click is this same read.
    if (target.closest('button, [role="button"]')) return;
    onOpen();
  };

  const mainContent = (
    <>
      <span className="bld-t">
        <span className="bld-ttl">{title ?? <TitleLabel title={event.title} />}</span>
        {isHard && !hasWhenSlot && (
          <span className="tag-hard">
            <Icon name="lock" /> {t.event.hard}
          </span>
        )}
        {settleTag}
        {overlapNote && <span className="seam-tag">⧉ {overlapNote}</span>}
        {nestedCount !== undefined && (
          <span className="nest-note">{t.day.contains(nestedCount)}</span>
        )}
      </span>
      {/* The line renders at all only when it has a glyph to carry, so an ordinary row
          loses it entirely rather than keeping an empty box. */}
      {hasMeta && (
        <span className="bld-m">
          <NoteMark count={notes} />
          <DocumentMark count={documents} />
          <TaskMark count={tasks} />
        </span>
      )}
    </>
  );

  return (
    // The whole row is the drag surface (session-119): no ⠿ handle, no ▲/▼ pair. It
    // could only arm on contact from a dedicated handle before; a press-and-hold can
    // arm from anywhere without eating the row's tap, so the row gets that width back
    // and the gesture matches the shelf's exactly.
    <div
      className={cls}
      {...{ [EVENT_ROW_ATTR]: event.id }}
      {...(dragProps ?? refuseProps)}
      onClick={openFromCard}
    >
      {/* The badge is the way to the map, and it survives `readOnly` — a finished
          trip is a browsable archive (ADR-0040) and looking at a place changes
          nothing. */}
      <PlaceBadge className="bld-bd" onShowOnMap={onShowOnMap} photoUrl={photoUrl}>
        {event.icon}
      </PlaceBadge>
      {/* **THE ROW'S TAP IS A READ NOW, NOT AN EDIT** (ADR-0174 §4). It opened `EventForm`
          — so reading an event meant opening its editor and scrolling past a category grid,
          a title field, an icon picker, a when field and a place picker. `עריכה` is one tap
          inside the read, and it was already the first row of this row's `⋯` sheet, so the
          same route costs the same number of taps as before.

          AND IT IS A BUTTON ON A READ-ONLY ARCHIVE, which is the hole this closes: it was a
          `<div>` there, so a finished trip's events could not be opened at all — in the mode
          whose whole job is being browsable (ADR-0040). The read is exactly what an archive
          wants, and it carries no `עריכה` there. */}
      <button className="bld-main" onClick={onOpen}>
        {mainContent}
      </button>
      {event.startsAt &&
        (() => {
          const startZone = zones?.startZone ?? tz;
          const endZone = zones?.endZone ?? tz;
          const inner = (
            <>
              {hardLock}
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
              {(duration || distance || zones?.deltaMinutes != null) && (
                <span className="bld-timemeta">
                  {duration && <span className="when-dur bld-dur">{duration}</span>}
                  {/* The carried leg's length, the same fact the Trip row states and in the same
                      order (ADR-0212). ADR-0159 §1 lets the two surfaces differ in posture and
                      never about a fact. */}
                  {distance && <span className="bld-dist">{distance}</span>}
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
          {hardLock}
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
