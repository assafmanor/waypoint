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
  edgeMeaning,
  isAmbient,
  isExactEdge,
  type Booking,
  type MaybeItem,
  type Place,
  type TripEvent,
  typicalMinutesFor,
} from '@waypoint/shared';
import { useTrip, byStart } from '../state/trip-state';
import {
  usePlaceErrandReturn,
  useShowMaybesOnMap,
  useShowPlaceOnMap,
} from '../state/map-scope-state';
import { prefersReducedMotion } from '../lib/motion';
import { landAtTop } from '../lib/land-at-top';
import { useDaySurface } from '../lib/useDaySurface';
import { DayPeeks } from '../ui/domain/DayPeek';
import { useIsDayPreview } from '../state/day-preview';
import { edgeFadeRef } from '../lib/edge-fade';
import {
  authoringZone,
  ideaShowOnMap,
  eventDirectionsUrl,
  eventDurationLabel,
  eventEdgeZone,
  eventRoute,
  eventShowOnMap,
  eventDisplayZones,
  eventPlaceId,
  eventZones,
  dayZoneContext,
  isDayOver,
  liveToday,
  liveZone,
  placeName,
  placeTimezone,
  type ShowPlaceOnMap,
  type ZoneContext,
  type ZoneEvidence,
} from '../lib/places';
import {
  EVENT_PARAM,
  EVENT_ROW_ATTR,
  IDEA_PARAM,
  eventRowSelector,
  useArrivalParam,
} from '../state/nav-state';
import { useVerbs } from '../state/verbs';
import { useClock } from '../lib/useClock';
import {
  buildTimeTree,
  clockRange,
  eventPhase,
  formatTime,
  isoToTimeInput,
  hardConflicts,
  zonedIso,
  weekdayName,
  resolveEndIso,
  type TimeGroup,
  type TimeItem,
  tripDates,
  relativeDayLabel,
} from '../lib/time';
import {
  dayStops,
  ideaCategory,
  ideaGlyph,
  poolStrip,
  proposedDay,
  rankIdeas,
  reasonText,
  tripDayStops,
  shelfForSlot,
  shelfGroups,
  stopReasonText,
  tileReasonText,
} from '../lib/shelf';
import {
  blockFor,
  ideaBlock,
  nextSlot,
  statesFreeTime,
  type Gap,
  type GapDefaults,
} from '../lib/gaps';
import { dayPositions, firstPositionFitting } from '../lib/day-positions';
import {
  dayTransitions,
  edgeEntryOf,
  groupEndEvent,
  groupStartEvent,
  mergeDayEntries,
  placeDayEntries,
  staysOnDate,
  type TransitionEntry,
} from '../lib/day-entries';
import {
  DAY_JOURNEY_ARM,
  dayBlocks,
  dayJourney,
  narrowGapForTravel,
  windowClosesMs,
  type DayBlock,
  type DayJoin,
  type DayJourney,
} from '../lib/day-joins';
import { useDayTravelReads, type DayLeg } from '../lib/day-travel';
import { travelStance, remainingTravelSeconds, TRAVEL_STANCE } from '../lib/travel-position';
import { travelOrigin } from '../lib/hero-travel';
import { useGeolocation } from '../lib/useGeolocation';
import { clearOnWay, useOnWay } from '../lib/on-way';
import { nowLinePlacement } from '../lib/now-line';
import { StayRow } from '../ui/domain/StayRow';
import { type SettleOutcome } from '../ui/domain/SettleControl';
import { UnplacedCommitment } from '../ui/domain/UnplacedCommitment';
import { bookingWhen } from '../lib/booking-journey';
import { hoursPhrase } from '../lib/duration';
import {
  ConnectionBand,
  GapStrip,
  JourneyRow,
  type JourneyRowProps,
} from '../ui/domain/DayJoinRow';
import { CODE_PREFIX, DEFAULT_STAY_ICON, MS_PER_DAY, SHELF_POOL_CAP } from '../constants';
import { ambientSpanLabel, dayBookendStays } from '../lib/glance';
import { edgeSentence } from '../lib/transitions';
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
import { placeLabelOf, type PlaceLabels } from '../lib/place-label';
import { usePlaceLabels } from '../state/place-labels';
import { noteCountFor, hostCountForContext, noteCountsByHost } from '../lib/notes';
import { openTaskCountsByHost } from '../lib/tasks';
import { useSettledHosts } from '../ui/HostTasks';
import { attachmentCountForContext, attachmentCountsByHost } from '../lib/attachments';
import { resolveHostContext, type HostContextIndex } from '../lib/host-context';
import { MaybeCard, MaybeMoreCard } from '../ui/domain/MaybeCard';
import { MaybeManageSheet } from '../ui/MaybeManageSheet';
import { SlotFillSheet } from '../ui/domain/SlotFillSheet';
import { HostNotes } from '../ui/HostNotes';
import { HostTasks } from '../ui/HostTasks';
import { HostDocuments } from '../ui/HostDocuments';
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

const groupKey = (g: TimeGroup) =>
  g.kind === 'cluster' ? `cl-${g.items[0].event.id}` : g.item.event.id;

/** A block is keyed by its first row, which is stable across a clock tick — the
 *  journey it holds can gain a leg, and re-keying the whole run would remount both. */
const blockKey = (block: DayBlock) => {
  const first = block.entries[0].entry;
  return first.kind === 'event' ? groupKey(first.group) : `${first.event.id}-${first.edge}`;
};

const shortPlaceName = (places: Place[], labels: PlaceLabels, id: string | undefined) =>
  placeLabelOf(labels, id, placeName(places, id));

/** The one row that draws whatever sits above an entry (ADR-0159). A gap states free time; a
 *  connection names the stop and how long you are in it, and only ever renders inside a
 *  `.journey` block, because that is what makes it part of an object instead of a mark between
 *  two cards.
 *
 *  **And a gap with a journey in it is a third thing** (ADR-0206 §V1.3): the same slot, saying
 *  what is true of it, which is §D2's own "one slot, three meanings". The journey ABSORBS the
 *  free-time statement — one object, both of `freeAfterTravel`'s numbers (§Z5 §M2) — so this
 *  function chooses between two renders rather than stacking them. */
function JoinRow({
  join,
  journey,
  places,
  placeLabels,
  onFillGap,
  ...journeyRest
}: {
  /** **Nullable, and that is ADR-0206 §AG6 finished.** `gapBetween` is floored at
   *  `GAP_MIN_MINUTES`, so a hole under an hour has no join at all — and gating the JOURNEY on the
   *  join left §Z5 §M2's own example silent ("a 45-minute hole holding a 40-minute walk"), which
   *  §AG6 recorded as fixed by setting `DayBlockEntry.from` on every adjacency. It was half-fixed:
   *  the leg was derived and then not rendered. **Plan mode gates on `prevEnd` instead and has
   *  been drawing it all along**, so the two day surfaces disagreed about a fact — the thing
   *  ADR-0159 §1 forbids and ADR-0171 §10e already had to repair once. */
  join: DayJoin | null;
  /** What the journey across this hole costs and says, or `null` — which is the ordinary answer
   *  (§D4) and leaves the strip below reading exactly as it read before this milestone. */
  journey: DayJourney | null;
  places: Place[];
  placeLabels: PlaceLabels;
  /** What a tap on a gap opens (ADR-0161 §9), or absent where a write is gated. A connection
   *  never takes one: you are inside a commitment for the whole of it, so there is nothing
   *  free there to fill. */
  onFillGap?: (free: Gap) => void;
} & Omit<JourneyRowProps, 'journey'>) {
  if (join === null || join.kind === 'gap') {
    // **The slot is narrowed by the journey** — the statement and the control must not disagree
    // about one hole, which is what §V1.1 is about one elevation down.
    const slot = join
      ? journey
        ? narrowGapForTravel(join.free, journey, journeyRest.tz)
        : join.free
      : null;
    // **And it is stated below the block rather than inside it** (owner, 2026-08-26: _"do we
    // really want to state on this row that we have free time, or should it be written in a quiet
    // way and not in the row?"_). M6a absorbed the strip into the block to keep ADR-0159's one
    // object per hole, and the absorption put two subjects on one ⁦180px⁩ line: the block is about
    // the LEG (mode, distance, when to go) and free time is about the HOLE. The measurement that
    // shipped M6a is the argument against it — ⁦219.70px⁩ of ink in that box, "fixed" by hiding the
    // free time on half the arms, which is what a line holding two subjects looks like.
    const strip =
      slot && statesFreeTime(slot.minutes) ? (
        <GapStrip minutes={slot.minutes} onFill={onFillGap && (() => onFillGap(slot))} />
      ) : null;
    if (!journey) return strip;
    return (
      <>
        <JourneyRow journey={journey} {...journeyRest} />
        {strip}
      </>
    );
  }
  return (
    <ConnectionBand
      word={t.day.join.word[join.type] ?? t.day.join.word.flight}
      length={hoursPhrase(join.minutes)}
      // The SHORT label, like every other route surface (ADR-0059 §3's amendment):
      // `נמל התעופה דובאי (DXB)` in a one-line band pushes the length out of the
      // row, and the two cards around it already name the place in full.
      placeName={shortPlaceName(places, placeLabels, join.stopPlaceId)}
      tight={join.tight}
    />
  );
}

export function DayView() {
  const {
    trip,
    events,
    maybeItems,
    justAddedIdea,
    bookings,
    places,
    notes,
    documentAttachments,
    hostContexts,
    zoneEvidence,
    activeDate,
    ripple,
    setActiveDate,
    tasks,
  } = useTrip();
  const verbs = useVerbs();
  // Which day this surface is showing, and how it changes (ADR-0200 §6/§7): the swipe,
  // the neighbour days the peek renders, and the rule that a day opens at its top however
  // you got here. Called EARLY on purpose — the arrival landing and "land on now" below
  // both key on the same day change and both mean to win, and effects run in declaration
  // order. The same hook and class as Plan's builder: none of this is a posture.
  // **Am I the real day, or the peek beside it?** (ADR-0200 §7) Read only to suppress what
  // reaches OUT of a preview's pane — the arrival param it must not spend, and a scroll on the
  // body it does not own. Never to change how the day LOOKS: looking identical is the point.
  const preview = useIsDayPreview();
  const daySurface = useDaySurface<HTMLDivElement>();
  const placeLabels = usePlaceLabels();
  const now = useClock();
  // `מפה` is an in-app destination now (ADR-0121 §8): it hands the Map tab a focus
  // and lands there, instead of deep-linking out to Google's place view.
  const showPlaceOnMap = useShowPlaceOnMap();
  const showMaybesOnMap = useShowMaybesOnMap();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<'new' | TripEvent | null>(null);
  /** The slot a new event opens on, when something chose it — the slot a replacement was
   *  going into (ADR-0161 §6). Unset means the day's next opening, which is what a plain
   *  `＋` means. */
  const [formSlot, setFormSlot] = useState<GapDefaults | null>(null);
  // RE-OPENING AFTER A PLACE ERRAND (ADR-0134 §2). The form went to the Map tab to have a
  // location picked, which unmounted it — so it comes back from its own draft with the
  // chosen place already in the named field, rather than from whatever the entity holds.
  const [formDraft, setFormDraft] = useState<EventFormDraft | null>(null);
  const closeForm = () => {
    setFormTarget(null);
    setFormSlot(null);
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
  /** Where a quick-schedule opens: the first position on the day with room for this idea, and
   *  the block its category usually takes there (ADR-0161 §4/§5). One derivation shared with
   *  Plan mode's picker, so the two modes cannot disagree about where an idea should go. */
  const scheduleDefaults = (item: MaybeItem) => {
    const zone = authoringZone({ placeId: item.placeId }, { date: activeDate }, zoneEvidence);
    const minutes = typicalMinutesFor(ideaCategory(item, places));
    const position = firstPositionFitting(dayPositions(dayEvents, activeDate, zone), minutes);
    return position ? blockFor(position.free, minutes) : nextSlot(dayEvents, activeDate, zone);
  };
  /** The event `החלף` was pressed on — the one being displaced (ADR-0161 §6). */
  const [replaceTarget, setReplaceTarget] = useState<TripEvent | null>(null);
  /** The free slot a gap strip was tapped on (ADR-0161 §9). The same sheet `החלף` opens, with
   *  the gap's own header — filling a hole on the ground is Tier-1 work (ADR-0025), and the one
   *  surface that states the hole was the one place it could not be done. */
  const [gapTarget, setGapTarget] = useState<Gap | null>(null);
  /** An event's own slot as a wall clock, read in the zone the day shows it in (ADR-0107) —
   *  what the replacement inherits, and what the shelf is ranked against. */
  const slotOf = (e: TripEvent): GapDefaults => {
    const zones = eventDisplayZones(e, zoneCtx);
    return {
      date: e.date,
      start: e.startsAt ? isoToTimeInput(e.startsAt, zones.start) : '',
      end: e.endsAt ? isoToTimeInput(e.endsAt, zones.end) : '',
    };
  };
  // The idea's own surface (ADR-0116's 2026-08-01 amendment): a tap opens this, and
  // `שיבוץ ליום` inside it is what reaches `scheduleItem` above.
  const [ideaSheet, setIdeaSheet] = useState<MaybeItem | null>(null);

  // **ARRIVING AT ONE CARD** (ADR-0153 §8's way-in amendment; extended 2026-08-20 to the
  // Map's place references). A note about an event or an idea — and now a place's reference
  // row — sends you to that host's day, and the id says which one to open once the day is on
  // screen: `?event=<id>` expands the card, `?idea=<id>` opens the idea's sheet. Both params
  // are spent on arrival by `useArrivalParam`, so a back or a reload does not re-open what you
  // have since closed.
  const arrivingEvent = useArrivalParam(EVENT_PARAM, { active: !preview });
  const arrivingIdea = useArrivalParam(IDEA_PARAM, { active: !preview });
  useEffect(() => {
    if (arrivingEvent) setOpenId(arrivingEvent);
  }, [arrivingEvent]);
  useEffect(() => {
    if (!arrivingIdea) return;
    const idea = maybeItems.find((m) => m.id === arrivingIdea);
    if (idea) setIdeaSheet(idea);
  }, [arrivingIdea, maybeItems]);
  // **AND THE CARD IS BROUGHT TO YOU** (owner, 2026-08-20: _"going from a place to the event
  // (and maybe also booking) doesn't scroll correctly"_). Opening it was never the whole job:
  // a day is a long scroller and the card you were sent to is wherever it happens to be, so
  // the arrival expanded something off screen. The same watched landing the Map's own row
  // gets (`lib/land-at-top.ts`) — and it has to be watched here too, because expanding the
  // card grows it by its documents, tasks and notes sections after the first aim.
  useEffect(() => {
    if (!arrivingEvent) return;
    return landAtTop(() => document.querySelector(eventRowSelector(arrivingEvent)));
  }, [arrivingEvent]);
  /** **Did THIS day-open name a card?** — read by "land on now" below, which must not walk over
   *  an arrival's landing with an answer to a question nobody asked this time. A ref written
   *  from an effect declared HERE rather than a dependency down there, and both halves are
   *  deliberate: effects run in declaration order, so this is already true by the time that one
   *  looks; and adding the id to its deps would re-run it a render later, when the param has
   *  been spent — scrolling to now on the strength of the arrival having finished. */
  const aimedAtCard = useRef(false);
  useEffect(() => {
    aimedAtCard.current = arrivingEvent != null;
  }, [arrivingEvent]);

  // The live "now" sits in the zone of the itinerary segment you're in (ADR-0107
  // §4), so "today" rolls at THAT zone's midnight — cross a zone and the calendar
  // day re-anchors. Trip mode only; Plan mode frames everything in the trip primary.
  const nowZone = liveZone(now.getTime(), zoneEvidence);
  const nowMs = now.getTime();
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
  // Ambient-span stays (a hotel, ADR-0054/0063) are backdrop, not timeline rows — and the
  // backdrop is there on every day of the stay now, edges included. One shared predicate
  // with Plan, which is where that rule belongs (ADR-0171 §10e).
  const staysToday = staysOnDate(events, activeDate);
  // The shelf, grouped (ADR-0116 §2) by one shared derivation both hosts call —
  // ideas pencilled in for this day, the rest of the pool, and (ADR-0027's parking
  // lot) the day's skipped soft events, durable and restorable in place.
  const shelf = shelfGroups(maybeItems, events, activeDate);
  // …and ranked (ADR-0116 session-202 §3 / ADR-0151). The grouping above is
  // untouched — this only orders what it produced, and attaches each idea's reason.
  const stops = dayStops(events, bookings, places, activeDate);
  // Capped, with the tail handed to the Map's אולי facet (§5), and the idea you just
  // added held at the head whatever it scored (ADR-0116's 2026-08-11 amendment). One
  // shared derivation, so this shelf and Plan's cannot draw two different strips.
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
  // The day's own group keeps its order (it is small by construction) and gains
  // only the distance line — see `stopReasonText` for why it says nothing else.
  const forDayReasons = new Map(
    rankIdeas(shelf.forDay, places, activeDate, stops).map((r) => [r.item.id, r.reason]),
  );

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
    return reason ? reasonText(reason, activeDate) : undefined;
  };
  const markForDay = (m: MaybeItem) => {
    const date = proposedDay(poolReasonById.get(m.id));
    if (!date) return undefined;
    return {
      label: t.day.idea.markForDay(relativeDayLabel(date, activeDate)),
      onSelect: () => {
        verbs.acceptDay(m, date);
        setIdeaSheet(null);
      },
    };
  };

  const dayNumber = daysBetween(trip.startDate, activeDate) + 1;
  const weekday = weekdayName(activeDate, trip.timezone);
  const heading = t.day.heading(dayNumber, weekday, trip.destination);

  // Per-event display zones (ADR-0107): one builder over the one evidence, shared
  // with the Plan-mode builder so the two day surfaces cannot diverge.
  const zoneCtx = dayZoneContext(activeDate, zoneEvidence);
  const noteCounts = useMemo(() => noteCountsByHost(notes), [notes]);
  // The third mark's tally (ADR-0191 §2) — OPEN tasks only, unlike the two beside it.
  const settledHosts = useSettledHosts();
  const taskCounts = useMemo(
    () => openTaskCountsByHost(tasks, settledHosts),
    [tasks, settledHosts],
  );
  const docCounts = useMemo(
    () => attachmentCountsByHost(documentAttachments),
    [documentAttachments],
  );

  const dayCtx: DayCtx = {
    tz: trip.timezone,
    zoneCtx,
    now,
    readOnly,
    openId,
    toggle: (id) => setOpenId((cur) => (cur === id ? null : id)),
    bookings,
    places,
    placeLabels,
    noteCounts,
    taskCounts,
    docCounts,
    hostContexts,
    dayEvents,
    verbs,
    onEdit: (e) => {
      const booking = e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined;
      if (booking) setBookingTarget(booking);
      else setFormTarget(e);
    },
    onReplace: setReplaceTarget,
    onOpenDetail: setDetailTarget,
    showPlaceOnMap,
  };

  // Multi-day bracketed bookings (a hotel, a red-eye flight) are ambient — off
  // `dayEvents` — so their edge days would show nothing in the list. Interleave
  // their transition points (check-in/out, departure/arrival) among the event
  // groups by instant (ADR-0064 §B). Same-day brackets stay a single span row.
  const groups = buildTimeTree(dayEvents);
  // **Not everything that happens today holds a position in it** (ADR-0171 §10a). A
  // check-in "from 15:00" is a floor, open on the side you act, so no reading of the
  // clock says where it goes; an untimed event is the same fact with a wider window.
  // Both leave the ordered list — and then split by ADR-0011's own axis, because a
  // commitment buried under an optional errand is the demotion that rule exists to
  // prevent: `hard` reads in the strip above, `soft` in the tail below.
  //
  // Ordering matters here: this runs BEFORE `dayBlocks`, so a check-in that used to
  // sit between two flight legs stops suppressing the join between them (`dayBlocks`
  // ends a run on anything that is not a leaf event entry, so no gap AND no connection
  // band could be derived for that window at all).
  // **THE TWO FACTS A STAY GETS A ROW FOR** (ADR-0209 §1): you started the day there, and/or you
  // end it there. `dayBookendStays` is the same answer the MAP already reads for its stop sequence
  // (ADR-0054's 2026-08-25 amendment), so the list and the canvas cannot disagree about a night.
  const bookends = dayBookendStays(events, activeDate);
  const stayRowIds = useMemo(
    () => new Set([bookends.woke?.id, bookends.sleeps?.id].filter((id): id is string => !!id)),
    [bookends.woke?.id, bookends.sleeps?.id],
  );
  const placement = placeDayEntries(
    mergeDayEntries(groups, dayTransitions(events, activeDate)),
    dayEvents.filter((e) => !e.startsAt),
    groups,
    stayRowIds,
  );
  const merged = placement.positioned;

  // **What sits between two rows** (ADR-0159): free time stated, or a connection that
  // is not free time at all and takes both legs into one block. The join derivation is
  // shared with nothing else on this screen and the same `gapBetween` Plan mode fills
  // from, so the two modes cannot disagree about where a hole is.
  const blocks = dayBlocks(merged, { bookings, when: bookingWhen(events), tz: trip.timezone });

  // ══ THE JOURNEY IN A HOLE (ADR-0206 §V1.1 / §V1.3 / §V1.4) ═══════════════════════════════
  //
  // §V1.1 is the one line of that ADR that is a **bug fix**: the day has stated the whole of a
  // hole as free since ADR-0159 shipped, so a 2:40 hole holding a 40-minute walk told you about
  // forty minutes you do not have — on the one surface built to be a statement. The block that
  // corrects it **absorbs** the free-time strip rather than sitting beside it (§Z5 §M2), so the
  // slot still holds one object.
  //
  // **Every derivation here is memoized, and on this screen that is a defect class rather than a
  // preference.** `useClock` ticks once a second, so anything in this render body runs 3,600 times
  // an hour — the shape `frontend/CLAUDE.md` names for exactly this screen family, and what turned
  // `e2e (preview)` red on M7c's second field report.
  //
  // **The legs are read off `dayBlocks` rather than re-derived**, because that function is the one
  // place that knows which rows are adjacent: a flexible edge is transparent to the measurement
  // (ADR-0171 §5), and a second walk would have to reproduce that rule to agree with the join it
  // sits beside.
  const day = useMemo(() => {
    const between: DayLeg[] = [];
    for (const block of blocks) {
      for (const { entry, join, from } of block.entries) {
        // **A connection is the one join that has no journey to draw** — you are inside one
        // commitment for the whole of it (`joinBetween`'s own rule). Everything else does,
        // INCLUDING a hole too short to earn a `gap` join at all: the floor is about whether free
        // time is worth stating and says nothing about travel (§Z5 §M2, and `DayBlockEntry.from`).
        if (!from || join?.kind === 'connection' || entry.kind !== 'event') continue;
        between.push({ from, to: groupStartEvent(entry.group) });
      }
    }
    // **THE DAY'S FIRST LEG, OUT OF THE STAY YOU WOKE IN** (§AD, and §AE3 named it as the first
    // thing to reconcile here). A journey block sits between two ROWS, and on a mid-stay day the
    // hotel is ambient — off the day's schedule (ADR-0054) — so the first row has nothing above
    // it and the one leg you are certain to make was the one leg the list could never draw. It is
    // returned SEPARATELY rather than unshifted into the list, because it renders outside the
    // block loop: there is no join for it to hang off.
    const firstRow = blocks[0]?.entries[0]?.entry;
    const woke = bookends.woke;
    const first = firstRow?.kind === 'event' ? groupStartEvent(firstRow.group) : undefined;
    const wake =
      woke && first && first.id !== woke.id ? { from: woke, to: first, bookend: true } : undefined;
    // **AND THE LEG BACK** (ADR-0209 §1/§3), which is the other half of §AD and did not exist: the
    // day's last row is where you end it, so the journey into tonight's stay is as certain as the
    // one out of last night's. `bookend` on it too — a stay has no per-day arrival instant, so
    // reading its `startsAt` as this hole's deadline would measure a window from its check-in day.
    const lastBlock = blocks[blocks.length - 1];
    const lastEntry = lastBlock?.entries[lastBlock.entries.length - 1]?.entry;
    const last = lastEntry?.kind === 'event' ? groupEndEvent(lastEntry.group) : undefined;
    const home =
      bookends.sleeps && last && last.id !== bookends.sleeps.id
        ? { from: last, to: bookends.sleeps, bookend: true }
        : undefined;
    return {
      between,
      wake,
      home,
      legs: [wake, ...between, home].filter((l): l is DayLeg => !!l),
    };
  }, [blocks, bookends.woke, bookends.sleeps]);
  const dayLegs = day.legs;

  const travelReads = useDayTravelReads({ tripId: trip.id, legs: dayLegs, bookings, places });

  // **WHAT A DEVICE POSITION LETS THIS SURFACE CLAIM** (ADR-0207). The day row inherits the same
  // four stances the hero reads, off the same module, so the two elevations withdraw one claim at
  // the same moment rather than one of them keeping a mark the other has dropped.
  //
  // **Requested only where consent already exists, so the day never prompts** (§3) — the same rule
  // Home follows: a read is never blocked on a permission, and a surface you swiped to is not an
  // intent to be located.
  const geo = useGeolocation();
  const { permission: geoPermission, status: geoStatus, request: requestGeo } = geo;
  useEffect(() => {
    if (geoPermission === 'granted' && geoStatus === 'idle') requestGeo();
  }, [geoPermission, geoStatus, requestGeo]);

  // **WHICH HOLE IS THE LIVE ONE.** Only one hole of a day is the journey you are about to make,
  // and it is the only one a position or a `בדרך` mark can say anything about: the rest are a
  // record (behind you) or a plan (ahead of the row you are in). Scoped to today, because a day
  // you swiped to has no "now" in it at all.
  const liveLeg = useMemo(() => {
    if (dayScope !== 'today') return null;
    let soonest: DayLeg | null = null;
    let soonestAt = Infinity;
    for (const leg of dayLegs) {
      const at = Date.parse(leg.to.startsAt ?? '');
      if (!Number.isFinite(at) || at <= nowMs || at >= soonestAt) continue;
      soonest = leg;
      soonestAt = at;
    }
    return soonest;
  }, [dayLegs, dayScope, nowMs]);

  // **AND WHETHER THE PLAN MAY STILL CLAIM IT** (ADR-0208 §2). `travelOrigin` is the hero's own
  // derivation, read here rather than re-implemented — which is what stops the day row asserting a
  // leave-by out of a café nobody went to while the board correctly says nothing.
  //
  // **The verdict is read WITHOUT matching it to the row above the hole, and that is the point.**
  // A skipped event leaves the day list entirely (ADR-0027's parking lot, `dayEvents` above), so
  // the hole is measured from the previous NON-SKIPPED row — which is precisely the repair
  // ADR-0208 §2 refuses in as many words: _"it swaps a wrong claim for a staler one, and errs
  // toward a louder app, since a longer leg is an earlier leave-by is a more confident late
  // mark."_ The list does it structurally rather than deliberately, and the first version of this
  // compared the claim's stop against the hole's own origin, which meant the two ids never matched
  // and the denial could never fire. The MEASUREMENT still stands — the hole is the hole and the
  // walk is in it — so what is withdrawn is the leave-by and the mark, never §V1.1's correction.
  const liveClaim = useMemo(
    () =>
      liveLeg
        ? travelOrigin({
            events: events.filter((e) => e.date === today),
            nowMs,
            excludeEventId: liveLeg.to.id,
          })
        : null,
    [liveLeg, events, today, nowMs],
  );
  const liveOriginDenied = liveClaim?.denied === true;

  /** The one thing this screen needs a coordinate lookup for: the live leg's two ends, so the fix
   *  can be tested against them. Only that leg — a stance on a hole you are not in answers a
   *  question nobody asked, and §1 forbids a request from a position either way. */
  const liveStance = useMemo(() => {
    if (!liveLeg) return null;
    const coordOf = (event: TripEvent, leaving: boolean) => {
      const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
      const id = eventPlaceId(event, booking, leaving);
      const place = id ? places.find((p) => p.id === id) : undefined;
      return place?.lat != null && place.lng != null
        ? { lat: place.lat, lng: place.lng }
        : undefined;
    };
    const from = coordOf(liveLeg.from, true);
    const to = coordOf(liveLeg.to, false);
    if (!from || !to) return null;
    return travelStance({
      fix:
        geo.coords && geo.fixedAt !== undefined
          ? {
              coords: geo.coords,
              fixedAt: geo.fixedAt,
              ...(geo.accuracyMeters !== undefined ? { accuracyMeters: geo.accuracyMeters } : {}),
            }
          : undefined,
      from,
      to,
      nowMs,
    });
  }, [liveLeg, places, bookings, geo.coords, geo.fixedAt, geo.accuracyMeters, nowMs]);

  // **Somebody said `בדרך`** — a person telling the app what it should have been able to see, and
  // reversible since ADR-0207 §7. Read through the same `useOnWay` the hero and the board read, so
  // a mark set on one elevation withdraws the nudge on all three.
  const liveOnWay = useOnWay(trip.id, liveLeg?.to.id);

  /** **Every hole's journey, computed once per tick and read by key.** The arithmetic is
   *  `dayJourney`'s (`lib/day-joins.ts`) and the leave-by inside it is `heroLeaveBy`'s, so the
   *  board, the lifted hero and this row cannot name three different minutes for one departure.
   *
   *  The live hole is the only one handed a position or a mark: a stance on a hole you are not in
   *  answers a question nobody asked, and a `בדרך` mark is about the journey you are on. */
  const journeys = useMemo(() => {
    const byLeg = new Map<string, DayJourney>();
    const remaining =
      liveStance && liveStance.stance === TRAVEL_STANCE.EN_ROUTE
        ? remainingTravelSeconds(
            liveStance,
            travelReads.estimateFor(liveLeg!.from, liveLeg!.to)?.durationSeconds ?? null,
          )
        : null;
    for (const leg of dayLegs) {
      const estimate = travelReads.estimateFor(leg.from, leg.to);
      const live = leg === liveLeg;
      const journey = dayJourney({
        // **Absent on the day's first leg, and that is a property of the LEG rather than of its
        // event** (ADR-0206 §AF3). A stay's own `endsAt` is its check-out, days away on a middle
        // night — reading it as this hole's departure measured a window from next Wednesday and
        // reported zero minutes free. There is no window out of a bed: the day window's dawn
        // would claim you could have left at 07:00, and the stay's ends are not this day's.
        ...(leg.bookend
          ? {}
          : { departAfterMs: Date.parse(leg.from.endsAt ?? leg.from.startsAt!) }),
        arriveByMs: Date.parse(leg.to.startsAt ?? ''),
        // **A destination with no DEADLINE licenses no leave-by** (ADR-0206 §AI1). A check-in's
        // `17:00` is the hour the door opens, and counting back from it told you to leave in time
        // to arrive the instant it does — then marked you late against it. `isExactEdge` is the
        // predicate (`@waypoint/shared`), asked here because `dayJourney` holds instants and
        // cannot see an event.
        flexibleArrival: !isExactEdge(leg.to, 'start'),
        windowClosesMs: windowClosesMs(leg.to),
        travelSeconds: estimate?.durationSeconds ?? null,
        distanceMeters: estimate?.distanceMeters ?? null,
        nowMs,
        // `arrived` needs no separate arm here: a fix at the next stop means you got there, and
        // the day list is a record either way — what it must not do is keep offering a departure.
        onWay:
          live &&
          (liveOnWay ||
            liveStance?.stance === TRAVEL_STANCE.EN_ROUTE ||
            liveStance?.stance === TRAVEL_STANCE.ARRIVED),
        remainingSeconds: live ? remaining : null,
        claimDenied: live && liveOriginDenied,
      });
      if (journey) byLeg.set(`${leg.from.id}>${leg.to.id}`, journey);
    }
    return byLeg;
  }, [dayLegs, travelReads, nowMs, liveLeg, liveOnWay, liveStance, liveOriginDenied]);
  const journeyFor = (from: TripEvent | undefined, to: TripEvent) =>
    (from && journeys.get(`${from.id}>${to.id}`)) ?? null;

  /** The live hole's one control, and the arm decides what it means: `בדרך` answers the mark,
   *  `ביטול סימון` takes it back (ADR-0207 §7 — a toast is transient and a mark is not). Nothing
   *  on a read-only archive, where every other write is gated too (ADR-0029). */
  const liveAction = (journey: DayJourney): { label: string; onPress: () => void } | undefined => {
    if (readOnly || !liveLeg) return undefined;
    if (journey.arm === DAY_JOURNEY_ARM.ON_WAY) {
      return liveOnWay
        ? { label: t.actions.undoSettle, onPress: () => clearOnWay(trip.id, liveLeg.to.id) }
        : undefined;
    }
    if (journey.arm !== DAY_JOURNEY_ARM.PASSED) return undefined;
    return { label: t.actions.onWay, onPress: () => verbs.onWay(liveLeg.to) };
  };
  /** `עדיין כאן` — the app saying it CHECKED, and the only claim a position licenses that the
   *  clock could not (ADR-0207 §2). Only where the fix actually puts them at the origin. */
  const liveLocated = (journey: DayJourney) =>
    liveStance?.stance === TRAVEL_STANCE.AT_ORIGIN && journey.arm === DAY_JOURNEY_ARM.PASSED
      ? t.travel.stillHere
      : undefined;
  /** **The props a hole's journey block needs**, in one place, because the day's first leg renders
   *  outside the block loop and a second assembly is how the two would drift. */
  const journeyProps = (journey: DayJourney, live: boolean) => ({
    journey,
    travelMode: travelReads.mode,
    ...(live ? { action: liveAction(journey), located: liveLocated(journey) } : {}),
  });

  /** **The day's first leg — out of the stay you woke in** (ADR-0206 §AD). It has no `join` above
   *  it because it has no row above it, so it renders outside the block loop rather than inside
   *  one; everything it says is the same component saying it. */
  const wakeJourney = day.wake ? journeyFor(day.wake.from, day.wake.to) : null;
  const homeJourney = day.home ? journeyFor(day.home.from, day.home.to) : null;

  /** **The stay's own bound, in the words the strip already used** (ADR-0209 §1) — `edgeSentence`
   *  where the day is an edge of it, `ambientSpanLabel` where it is not. Both sentences existed in
   *  the band this row replaces, so nothing is reworded: `placement.stayEdges` is that edge, kept
   *  precisely so its sentence survives leaving the list. */
  const stayBound = (stay: TripEvent): string | undefined => {
    const edge = placement.stayEdges.find((e) => e.event.id === stay.id);
    return edge
      ? edgeSentence(edge, transitionZoneProps(edge, zoneCtx).zone)
      : ambientSpanLabel(stay, activeDate);
  };

  /** **The settle pair, on a FLOOR only** — inherited from the edge row this replaces, and
   *  load-bearing rather than parity: `glance.ts` keeps a `not-before` edge in `נותרו היום` until
   *  it is `DONE`, because 15:01 does not mean anybody checked in (ADR-0171 §6). A ceiling and a
   *  window expire by their own clock and need none. Gated on the archive like every other write
   *  (ADR-0029). */
  const staySettle = (stay: TripEvent) => {
    if (readOnly || edgeMeaning(stay, 'start') !== 'not-before') return {};
    return {
      outcome:
        stay.status === EVENT_STATUS.DONE || stay.status === EVENT_STATUS.SKIPPED
          ? (stay.status as SettleOutcome)
          : undefined,
      onDone: () => verbs.done(stay),
      onSkip: () => verbs.skip(stay),
      onUndo: () => verbs.restore(stay),
    };
  };

  // The now-line: only on today (a past/future day has no "now"). Where it lands is
  // `lib/now-line.ts` — one derivation shared with Plan's static now-reference, and
  // the seam for the generalization that will let it sit INSIDE a running event
  // rather than always above it.
  const showNowLine = dayScope === 'today';
  const nowLineIndex = nowLinePlacement(merged, now.getTime()).index;

  // Land on now: scroll the now-line into view once per day-open (today only), a
  // passed event or two left peeking above. Keyed on the viewed day — never on
  // the clock tick — so it doesn't fight a manual scroll. Instant under
  // reduced-motion.
  const nowLineRef = useRef<HTMLDivElement>(null);
  const isToday = dayScope === 'today';
  useEffect(() => {
    // A preview must not scroll: its pane is not a scroller, so `scrollIntoView` would walk
    // out and move the REAL day's body under the finger (ADR-0200 §7).
    if (preview || !isToday || aimedAtCard.current) return;
    const el = nowLineRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [activeDate, isToday, preview]);

  return (
    <div className="day-swipe" data-preview={preview || undefined} ref={daySurface.ref}>
      {/* **THE DAY YOU ARE SWIPING TOWARD, DRAWN WHILE YOU SWIPE** (ADR-0200 §7). The same
          screen, one day over, inert — so what the page turn lands on is what the committed
          day draws, and the seam needs no cross-fade. `preview` stops the recursion at depth
          one: a peek renders no peeks of its own. */}
      {!preview && daySurface.live && (
        <DayPeeks prev={daySurface.peek.prev} next={daySurface.peek.next}>
          <DayView />
        </DayPeeks>
      )}
      <div className="day-page">
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

        {(staysToday.length > 0 || placement.commitments.length > 0) && (
          <div className="day-ambient">
            {/* **AN EDGE DAY SAYS THE EDGE; A MIDDLE DAY SAYS THE COUNT** (owner, 2026-08-13).
              `לילה 1 מתוך 1` on both of two guesthouses — one being left this morning, one
              being arrived at tonight — is the same words for opposite events. The sentence
              comes from the day's PLACED entry, so this line and the row below it cannot
              print two different clocks for one edge. */}
            {staysToday
              // **A stay named by its own row is not also named in the strip** (ADR-0209 §1). This
              // is the subtraction the whole ADR turns on: one hotel was reading twice on one
              // screen, here and as a row at its bound.
              .filter((e) => !stayRowIds.has(e.id))
              .map((e) => {
                const edge = edgeEntryOf(placement.positioned, e.id);
                return (
                  <div className="ambient" key={e.id}>
                    <span className="ai" aria-hidden="true">
                      {e.icon ?? DEFAULT_STAY_ICON}
                    </span>
                    <span className="an">{e.title}</span>
                    <span className="as">
                      {edge
                        ? edgeSentence(edge, transitionZoneProps(edge, zoneCtx).zone)
                        : ambientSpanLabel(e, activeDate)}
                    </span>
                  </div>
                );
              })}
            {/* **A commitment with no position reads at the TOP** (ADR-0171 §10a-i) — a
              claim on your day, carried all day, rather than something buried at its
              foot. It lands in the strip a multi-night stay's MIDDLE days already use,
              so one hotel reads the same way on every day of itself, edges included,
              and no second band is invented. */}
            {placement.commitments.map((row) => (
              <UnplacedCommitment
                key={`${row.event.id}-${row.edge ?? 'untimed'}`}
                row={row}
                tz={trip.timezone}
                bookings={bookings}
                onDone={() => verbs.done(row.event)}
                onSkip={() => verbs.skip(row.event)}
                onUndo={() => verbs.restore(row.event)}
                onOpen={setDetailTarget}
              />
            ))}
          </div>
        )}

        <div className={'day-list' + (readOnly ? ' archive' : '')}>
          {/* **The walk out of the bed** (ADR-0206 §AD). Above the first row rather than between
            two, which is the one place in the day where a journey has no hole to sit in — and the
            leg you can be surest of, since the hotel is where you both started and finished. */}
          {/* **WHERE THE DAY STARTS** (ADR-0209 §1) — the row §AD's leg has never had an origin
            for. It states the place and, quietly, the stay's own bound; the leg below it is an
            ordinary journey block, which is why this row carries no clock (§3). */}
          {bookends.woke && (
            <StayRow
              stay={bookends.woke}
              bound={stayBound(bookends.woke)}
              bookings={bookings}
              onOpen={setDetailTarget}
              onShowOnMap={eventShowOnMap(bookends.woke, bookings, places, showPlaceOnMap)}
              {...staySettle(bookends.woke)}
            />
          )}
          {wakeJourney && day.wake && (
            <JourneyRow
              {...journeyProps(wakeJourney, day.wake.to === liveLeg?.to)}
              tz={trip.timezone}
            />
          )}
          {/* Overlapping events render as the concurrency forest (ADR-0041): nests
            for containment, quiet clusters for partial overlap. The now-line is
            interleaved at the top level; untimed events have no span to place, so
            they stay plain leaf rows at the end. */}
          {blocks.map((block) => {
            const rows = block.entries.map(({ entry, index, join, from }) => (
              <Fragment
                key={
                  entry.kind === 'event' ? groupKey(entry.group) : `${entry.event.id}-${entry.edge}`
                }
              >
                {/* The join reads BEFORE the now-line: it is a fact about the plan, and
                  the now-line is the clock arriving inside it. */}
                {(() => {
                  const to = entry.kind === 'event' ? groupStartEvent(entry.group) : undefined;
                  const journey = to ? journeyFor(from, to) : null;
                  // **A join OR a journey**: the two are independent facts about one hole, and a
                  // hole too short for a join can still hold a leg (§AG6, and Plan has always
                  // drawn it).
                  if (!join && !journey) return null;
                  return (
                    <JoinRow
                      join={join ?? null}
                      {...(journey
                        ? journeyProps(journey, to === liveLeg?.to && from === liveLeg?.from)
                        : { journey: null, travelMode: travelReads.mode })}
                      tz={trip.timezone}
                      places={places}
                      placeLabels={placeLabels}
                      onFillGap={readOnly ? undefined : setGapTarget}
                    />
                  );
                })()}
                {showNowLine && index === nowLineIndex && (
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
                    // THIS EDGE's end, so a `נחיתה` row goes to where you landed rather than to
                    // the airport you took off from (2026-08-06). The row already knows which end
                    // it is; it simply was not saying so.
                    onShowOnMap={eventShowOnMap(
                      entry.event,
                      dayCtx.bookings,
                      dayCtx.places,
                      dayCtx.showPlaceOnMap,
                      entry.edge,
                    )}
                    // The settle pair the strip used to carry, moved with the floors that
                    // moved into this list (2026-08-13). `TransitionRow` renders it on a
                    // FLOOR only; passing it unconditionally here keeps that one rule in
                    // one place. Trip mode's alone — Plan settles off a row menu (ADR-0171
                    // §10e) — and gated on `readOnly` like every other write on a past day.
                    onDone={dayCtx.readOnly ? undefined : () => verbs.done(entry.event)}
                    onSkip={dayCtx.readOnly ? undefined : () => verbs.skip(entry.event)}
                    onUndo={dayCtx.readOnly ? undefined : () => verbs.restore(entry.event)}
                  />
                )}
              </Fragment>
            ));
            // A journey's legs live INSIDE one block, so the band between them belongs to
            // an object rather than floating between two cards (ADR-0159 §3).
            return block.journey ? (
              <div className="journey" key={blockKey(block)}>
                {rows}
              </div>
            ) : (
              <Fragment key={blockKey(block)}>{rows}</Fragment>
            );
          })}
          {/* **AND WHERE THE DAY ENDS** (ADR-0209 §1) — the other half of §AD, which only ever
            built the leg OUT of a stay. The journey back is as certain as the one out, and it
            reads above the row it arrives at, exactly like every other leg in the day. */}
          {homeJourney && day.home && (
            <JourneyRow
              {...journeyProps(homeJourney, day.home.to === liveLeg?.to)}
              tz={trip.timezone}
            />
          )}
          {bookends.sleeps && (
            <StayRow
              stay={bookends.sleeps}
              bound={stayBound(bookends.sleeps)}
              bookings={bookings}
              onOpen={setDetailTarget}
              onShowOnMap={eventShowOnMap(bookends.sleeps, bookings, places, showPlaceOnMap)}
              {...staySettle(bookends.sleeps)}
            />
          )}
          {showNowLine && nowLineIndex === merged.length && (
            <NowLine ref={nowLineRef} now={now} tz={nowZone} />
          )}
          {/* **The tail, and the line that finally names it** (ADR-0171 §10a). These rows
            have always rendered here; what they never had was anything saying they hold
            no position, so one of them read as "the last thing today". The line is the
            gap strip's own dashed hairline at the same 9px rhythm — the other thing a
            line between rows can say — so the day gains no new grammar for it. */}
          {placement.ideas.length > 0 && (
            <div className="day-unplaced">
              <span className="line" />
              <span className="lbl">{t.day.unplaced}</span>
              <span className="line" />
            </div>
          )}
          {placement.ideas.map((row) => (
            <ItemNode
              key={row.event.id}
              item={{ event: row.event, children: [] }}
              depth={0}
              ctx={dayCtx}
            />
          ))}
        </div>

        {formTarget && (
          <EventForm
            event={formTarget === 'new' ? null : formTarget}
            defaults={
              formTarget === 'new'
                ? (formSlot ?? nextSlot(dayEvents, activeDate, trip.timezone))
                : undefined
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
            onOpen={setDetailTarget}
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
            <div className="sec-title">{t.day.maybeShelf}</div>
            {/* Two groups (ADR-0116 §2): what's pencilled in for this day — plus the
              day's skipped events, which belong to it — then the rest of the pool,
              each out-of-day idea naming its own day. A header appears only when its
              group has content, so a trip with no target days reads as one strip. */}
            {(shelf.forDay.length > 0 || shelf.skipped.length > 0) && (
              <>
                {shelf.pool.length > 0 && <div className="shelf-group">{t.day.shelfForDay}</div>}
                <div className="shelf edge-fade" ref={edgeFadeRef}>
                  {shelf.forDay.map((m) => (
                    <MaybeCard
                      key={m.id}
                      compact
                      icon={ideaGlyph(m, places)}
                      title={m.title}
                      meta={stopReasonText(forDayReasons.get(m.id))}
                      notes={noteCountFor(noteCounts, 'maybeItem', m.id)}
                      onShowOnMap={ideaShowOnMap(m, places, showPlaceOnMap)}
                      onOpen={() => setIdeaSheet(m)}
                    />
                  ))}
                  {/* Skipped soft events park here, restorable (ADR-0027 parking lot).
                    No action line: the card is a button and `skippedTag` marks the state
                    it is in, which is the part a reader cannot get from the tile itself. */}
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
                      onShowOnMap={eventShowOnMap(e, bookings, places, showPlaceOnMap)}
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
                <div className="shelf edge-fade" ref={edgeFadeRef}>
                  {/* Scheduled (consumed) ideas leave the shelf — no dead tombstone
                    (ADR-0027); `shelfGroups` already dropped them. */}
                  {/* The tile's meta carries the ranking reason — a fact that VARIES
                    per card, which is what the retired action line never was. */}
                  {rankedPool.map(({ item: m, reason }) => (
                    <MaybeCard
                      key={m.id}
                      compact
                      icon={ideaGlyph(m, places)}
                      title={m.title}
                      meta={tileReasonText(reason, activeDate)}
                      notes={noteCountFor(noteCounts, 'maybeItem', m.id)}
                      onShowOnMap={ideaShowOnMap(m, places, showPlaceOnMap)}
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
            markForDay={markForDay(ideaSheet)}
            why={ideaWhy(ideaSheet)}
            onClose={() => setIdeaSheet(null)}
          />
        )}

        {scheduleItem && (
          <ScheduleSheet
            item={scheduleItem}
            // The free slot is read on the same clock the sheet types on, so the
            // prefilled time means what the day means by it (ADR-0107 session 128).
            // **The first position with room for it**, not the end of the day's last event
            // (ADR-0161 §4/§5). Trip mode is Tier-1, so it defaults rather than asking — but the
            // default used to be `nextSlot`, so the opening offer for every idea was "after
            // everything", on days with a three-hour hole in the middle. The length is the
            // idea's category's, capped by whatever room that position actually has.
            //
            // Read on the same clock the sheet types on, so the prefilled time means what the
            // day means by it (ADR-0107 session 128).
            defaults={scheduleDefaults(scheduleItem)}
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

        {/* **`החלף`, taken on the slot** (ADR-0161 §6). The same sheet the gap fill uses, with
          its other header: pick a replacement, the displaced event goes to the shelf, and the
          replacement takes its exact start and length — one write, one toast, one undo. The
          verb used to skip the event and tell you to go looking. */}
        {replaceTarget && (
          <SlotFillSheet
            title={t.slotFill.replaceTitle(replaceTarget.title)}
            sub={t.slotFill.replaceSub(
              clockRange(slotOf(replaceTarget).start, slotOf(replaceTarget).end),
            )}
            mode="trip"
            date={replaceTarget.date}
            ideas={shelfForSlot(shelf, slotOf(replaceTarget), trip.timezone, {
              events,
              bookings,
              places,
            })}
            glyph={(m) => ideaGlyph(m, places)}
            onPickIdea={(m) => {
              verbs.replace(replaceTarget, m);
              setReplaceTarget(null);
            }}
            // **Nothing on the shelf fits, so build it** — and this branch is deliberately TWO
            // actions where a pick is one (ADR-0161 §6's amendment). The displaced event goes to
            // the shelf now, and the form opens on the slot it freed. Not one atomic write,
            // because there is nothing to write yet: the form can be cancelled, and the two
            // separate undos are the better shape for that — backing out of the form leaves the
            // event on the shelf, which is a decision the user did make, and one more undo puts
            // it back on the day.
            onNewEvent={() => {
              verbs.park(replaceTarget);
              setFormSlot(slotOf(replaceTarget));
              setFormTarget('new');
              setReplaceTarget(null);
            }}
            onClose={() => setReplaceTarget(null)}
          />
        )}

        {/* **A tap on the day's free time** (ADR-0161 §9), through the same sheet with its other
          header. The idea's category decides how long it gets, capped by the room actually
          there (§5) — one derivation shared with Plan mode's chip, so the two modes cannot put
          the same idea in two different slots. */}
        {gapTarget && (
          <SlotFillSheet
            title={t.slotFill.gapTitle(clockRange(gapTarget.fill.start, gapTarget.fill.end))}
            mode="trip"
            date={gapTarget.fill.date}
            ideas={shelfForSlot(shelf, gapTarget.fill, trip.timezone, { events, bookings, places })}
            glyph={(m) => ideaGlyph(m, places)}
            onPickIdea={(m) => {
              const block = ideaBlock(ideaCategory(m, places), gapTarget);
              verbs.schedule(m, {
                date: block.date,
                title: m.title,
                kind: EVENT_KIND.SOFT,
                startsAt: zonedIso(block.date, block.start, trip.timezone),
                endsAt: block.end ? zonedIso(block.date, block.end, trip.timezone) : undefined,
              });
              setGapTarget(null);
            }}
            // A NEW event keeps the gap's own default block: its category is the form's next
            // question, so there is nothing yet to read a typical length from.
            onNewEvent={() => {
              setFormSlot(gapTarget.fill);
              setFormTarget('new');
              setGapTarget(null);
            }}
            onClose={() => setGapTarget(null)}
          />
        )}
      </div>
    </div>
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
  /** A nickname or the city an airport serves, per place (ADR-0166 §18) — threaded with `places`
   *  because every row that names a place asks both questions at once. */
  placeLabels: PlaceLabels;
  /** How many notes each host carries (ADR-0152 §6c), built once per note-list change
   *  rather than filtered per row — a day of twelve events asks this twelve times. */
  noteCounts: Map<string, number>;
  taskCounts: Map<string, number>;
  /** Its twin for attachments (ADR-0174 §1) — the count `attachmentCountsByHost` was
   *  written for and that nothing called until this row. */
  docCounts: Map<string, number>;
  /** Which hosts share a note list (ADR-0172 §1) — so a booked event's mark counts the
   *  notes its booking holds, which is where the create path puts them. */
  hostContexts: HostContextIndex;
  dayEvents: TripEvent[];
  verbs: ReturnType<typeof useVerbs>;
  onEdit: (event: TripEvent) => void;
  /** `החלף` — open the slot's own chooser (ADR-0161 §6). The screen owns the sheet, because
   *  the sheet needs the shelf and the day; the row only says which event. */
  onReplace: (event: TripEvent) => void;
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
  const route = routeDisplay(eventRoute(e, ctx.bookings, ctx.places, ctx.placeLabels));

  const card = (
    <EventCard
      icon={e.icon}
      // No route in reach: the stored title may still BE one, so it goes through
      // `TitleLabel` rather than out raw. `titleText` stays the plain string.
      title={route.title ?? <TitleLabel title={e.title} />}
      titleText={e.title}
      code={code}
      notes={hostCountForContext(
        ctx.noteCounts,
        resolveHostContext(ctx.hostContexts, { kind: 'event', id: e.id }),
      )}
      // The same question about the other content type (ADR-0174 §1), over the same
      // context — so the mark and the section under it cannot disagree.
      documents={attachmentCountForContext(
        ctx.docCounts,
        resolveHostContext(ctx.hostContexts, { kind: 'event', id: e.id }),
      )}
      tasks={hostCountForContext(
        ctx.taskCounts,
        resolveHostContext(ctx.hostContexts, { kind: 'event', id: e.id }),
      )}
      // The mark says there are notes; this is where they are read and written. Connected
      // here rather than inside the card, which is presentational (`ui/domain/`).
      documentsSlot={<HostDocuments host={{ kind: 'event', id: e.id }} />}
      tasksSlot={<HostTasks host={{ kind: 'event', id: e.id, name: e.title }} />}
      notesSlot={<HostNotes host={{ kind: 'event', id: e.id, name: e.title }} />}
      kind={e.kind === EVENT_KIND.HARD ? 'hard' : 'soft'}
      phase={phase}
      sync={<EntitySyncBadge id={e.id} />}
      unsynced={unsynced}
      readOnly={ctx.readOnly}
      anchor={{ [EVENT_ROW_ATTR]: e.id }}
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
      onReplace={ctx.readOnly ? undefined : () => ctx.onReplace(e)}
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
