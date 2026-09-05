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
import type { ReactNode } from 'react';
import {
  EVENT_KIND,
  EVENT_STATUS,
  edgeMeaning,
  isAmbient,
  isExactEdge,
  isRoutableMode,
  type Booking,
  type MaybeItem,
  type Place,
  spendsSpanInMotion,
  type TripEnrichments,
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
import { apiAssetUrl } from '../lib/api-asset';
import { rowPhoto } from '../lib/place-photo';
import { dayHeadTitle } from '../lib/day-title';
import { dayShot, type DayShot } from '../lib/day-photo';
import { DayHead } from '../ui/domain/DayHead';
import { MediaViewer } from '../ui/MediaViewer';
import { useLandOnArrival } from '../lib/land-at-top';
import { useDaySurface } from '../lib/useDaySurface';
import { DayPeeks } from '../ui/domain/DayPeek';
import { DayTravelTotal } from '../ui/domain/DayTravelTotal';
import { useIsDayPreview } from '../state/day-preview';
import { edgeFadeRef } from '../lib/edge-fade';
import {
  authoringZone,
  ideaShowOnMap,
  eventDirectionsUrl,
  eventDistanceLabel,
  eventDurationLabel,
  eventEdgeZone,
  eventRoute,
  eventShowOnMap,
  legShowOnMap,
  eventDisplayZones,
  eventPlaceId,
  eventZones,
  dayZoneContext,
  isDayOver,
  legDisplayZones,
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
  DAY_PHASE,
  dayPhase,
  eventPhase,
  formatTime,
  isoToTimeInput,
  hardConflicts,
  zonedIso,
  dayOfMonth,
  weekdayName,
  resolveEndIso,
  type TimeGroup,
  type TimeItem,
  tripDates,
  dayLabel,
  dayWindowMs,
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
  narrowGapToNow,
  nextSlot,
  statesFreeTime,
  type Gap,
  type GapDefaults,
} from '../lib/gaps';
import { dayPositions, firstPositionFitting } from '../lib/day-positions';
import {
  dayTransitions,
  groupEndEvent,
  groupStartEvent,
  mergeDayEntries,
  placeDayEntries,
  type DayEntry,
  type TransitionEntry,
} from '../lib/day-entries';
import {
  DAY_JOURNEY_ARM,
  dayBlocks,
  dayJourney,
  dayTravelTotal,
  holeDepartsMs,
  narrowGapForTravel,
  windowClosesMs,
  type DayBlock,
  type DayJoin,
  type DayJourney,
} from '../lib/day-joins';
import {
  dayAirMeters,
  legDepartAfterMs,
  useDayTravelReads,
  useLegModeControl,
  type DayLeg,
} from '../lib/day-travel';
import { travelStance, remainingTravelSeconds, TRAVEL_STANCE } from '../lib/travel-position';
import { travelOrigin } from '../lib/hero-travel';
import { useGeolocation } from '../lib/useGeolocation';
import { clearOnWay, useOnWay } from '../lib/on-way';
import type { NowInside } from '../lib/now-inside';
import {
  JOIN_BOX,
  journeyIsAhead,
  nowInJoin,
  nowInJourney,
  nowLinePlacement,
  type JoinBox,
} from '../lib/now-line';
import { NowMarker } from '../ui/domain/NowMarker';
import { StayRow } from '../ui/domain/StayRow';
import { type SettleOutcome } from '../ui/domain/SettleControl';
import { UnplacedCommitment } from '../ui/domain/UnplacedCommitment';
import { bookingWhen } from '../lib/booking-journey';
import { hoursPhrase, remainingPhrase } from '../lib/duration';
import {
  ConnectionBand,
  GapStrip,
  JourneyRow,
  type JourneyRowProps,
} from '../ui/domain/DayJoinRow';
import { CODE_PREFIX, MS_PER_MINUTE, SHELF_POOL_CAP } from '../constants';
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

/** **What the day hands a hole about the moment**: the instants, not a placement. The host knows
 *  the hole holds `now`; `JoinRow` knows how many boxes it is drawing, so it is what resolves the
 *  two into one nailed row (ADR-0217's 2026-09-04 amendment). */
interface JoinNowMark {
  nowMs: number;
  /** The hole's own extent — the row above's end and the row below's start. */
  opensMs: number;
  closesMs: number;
  label: string;
  ref: React.Ref<HTMLDivElement>;
}

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
  tz,
  places,
  placeLabels,
  onFillGap,
  nowMark,
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
  /** **The zone the GAP's own wall-clocks are in**, and not the journey's — `gapBetween` built
   *  `fill.start`/`fill.end` as strings in `dayBlocks`' `ctx.tz`, so `narrowGapForTravel` has to
   *  read them back in that same zone or it caps the slot against a different hour. The block's
   *  clocks take `zones` instead (ADR-0206 §AQ): one prop was serving two questions, and the
   *  answer only one of them wanted was the one that shipped. */
  tz: string;
  places: Place[];
  placeLabels: PlaceLabels;
  /** What a tap on a gap opens (ADR-0161 §9), or absent where a write is gated. A connection
   *  never takes one: you are inside a commitment for the whole of it, so there is nothing
   *  free there to fill. */
  onFillGap?: (free: Gap) => void;
  /** **The moment, and where in the hole it stands — unresolved** (ADR-0217's 2026-09-04
   *  amendment). The host says the hole holds it; WHICH BOX holds it is answered here, because
   *  this is the only thing that knows how many boxes it is drawing. The same move the shared
   *  reader made into `EventRow` on 2026-09-03, for the same defect. */
  nowMark?: JoinNowMark;
} & Omit<JourneyRowProps, 'journey' | 'tz'>) {
  const connection = join !== null && join.kind === 'connection';
  // **The slot is narrowed by the journey** — the statement and the control must not disagree
  // about one hole, which is what §V1.1 is about one elevation down.
  const planned =
    join && !connection ? (journey ? narrowGapForTravel(join.free, journey, tz) : join.free) : null;
  // **AND BY THE CLOCK, IN THE HOLE YOU ARE STANDING IN** (ADR-0217's 2026-09-05 amendment) — the
  // other end of the same window, and it was as stale as this one was: at ⁦16:10⁩ the strip still
  // stated the whole ⁦8:46⁩ and its `＋` opened on ⁦08:00⁩. `nowMark` IS the condition, not merely
  // the source of the instant: the screen hands it down exactly when the moment is inside this
  // hole on today, so no other day and no hole behind you is touched.
  //
  // The window's end is `holeDepartsMs`' — the same instant `nowInJoin` hands the hole to the
  // journey — so `statesHole` below can never be true with no strip under it.
  const slot =
    planned && nowMark
      ? narrowGapToNow(
          planned,
          nowMark.nowMs,
          holeDepartsMs(journey, nowMark.opensMs, nowMark.closesMs) ?? nowMark.closesMs,
          tz,
        )
      : planned;
  // **And it is stated below the block rather than inside it** (owner, 2026-08-26: _"do we
  // really want to state on this row that we have free time, or should it be written in a quiet
  // way and not in the row?"_). M6a absorbed the strip into the block to keep ADR-0159's one
  // object per hole, and the absorption put two subjects on one ⁦180px⁩ line: the block is about
  // the LEG (mode, distance, when to go) and free time is about the HOLE. The measurement that
  // shipped M6a is the argument against it — ⁦219.70px⁩ of ink in that box, "fixed" by hiding the
  // free time on half the arms, which is what a line holding two subjects looks like.
  // **Worth STATING is asked of the plan; what is LEFT is asked of the clock.** Two thresholds
  // would be one too many: `FREE_TIME_MIN_MINUTES` is a judgement about whether a hole counts as
  // free time at all (`lib/gaps.ts`), and re-asking it of the remainder would retire the strip
  // ⁦15⁩ minutes early — taking the marker's own box with it, since `statesHole` is this row.
  const strip =
    planned && slot && statesFreeTime(planned.minutes) ? (
      <GapStrip minutes={slot.minutes} onFill={onFillGap && (() => onFillGap(slot))} />
    ) : null;
  /** **Which of this hole's boxes the mark belongs to** — the free time or the journey out of it.
   *  A connection draws neither: it is one band over a stop you are inside for the whole of it,
   *  and the journey prop it never renders must not be offered a share of it either. */
  const placed = nowMark
    ? nowInJoin(
        {
          opensMs: nowMark.opensMs,
          closesMs: nowMark.closesMs,
          journey: connection ? null : journey,
        },
        nowMark.nowMs,
      )
    : null;
  const nail = (box: JoinBox, row: ReactNode) =>
    nowMark && row && placed?.key === box ? (
      <NowMarker ref={nowMark.ref} label={nowMark.label} thruFrac={placed.thruFrac}>
        {row}
      </NowMarker>
    ) : (
      row
    );
  /** **And where the hole's own part holds the moment with nothing drawn for it, the mark stands
   *  ABOVE the journey** — the same answer the day's edge legs take (the 2026-09-04 amendment).
   *  Two holes reach here: one too short to state free time in at all (§AG6's ⁦45⁩-minute hole
   *  holding a ⁦40⁩-minute walk), and one whose free time the clock has now spent. */
  const holeMark =
    nowMark && placed?.key === JOIN_BOX.HOLE && !strip ? (
      <NowMarker ref={nowMark.ref} label={nowMark.label} />
    ) : null;
  if (!connection) {
    if (!journey) return nail(JOIN_BOX.HOLE, strip);
    /**
     * **THE FREE TIME COMES FIRST, BECAUSE IT ENDS WHERE THE JOURNEY BEGINS** (owner,
     * 2026-08-31: _"the transit row shows 'take off at X to get on time', so it only makes
     * sense that slotting should be before it, before the takeoff time"_).
     *
     * §AH3 separated these two lines — the block is about the LEG, the strip about the HOLE —
     * and never asked which goes on top. The arithmetic already answers: `narrowGapForTravel`
     * shrinks the slot BY the journey, so the window the strip states ENDS at the leave-by the
     * block advises. Drawn in that order they read as one sentence; drawn the other way the
     * day offers you a slot for time it has just said you must spend travelling.
     *
     * Measured at ⁦0px⁩ (`free-time-comes-before-the-leave-by-v1.html` §5): no rule in
     * `day-join.css` or `screens.css` keys on the two being siblings in either order.
     */
    return (
      <>
        {nail(JOIN_BOX.HOLE, strip)}
        {holeMark}
        {nail(JOIN_BOX.JOURNEY, <JourneyRow journey={journey} {...journeyRest} />)}
      </>
    );
  }
  return nail(
    JOIN_BOX.HOLE,
    <ConnectionBand
      word={t.day.join.word[join.type] ?? t.day.join.word.flight}
      length={hoursPhrase(join.minutes)}
      // The SHORT label, like every other route surface (ADR-0059 §3's amendment):
      // `נמל התעופה דובאי (DXB)` in a one-line band pushes the length out of the
      // row, and the two cards around it already name the place in full.
      placeName={shortPlaceName(places, placeLabels, join.stopPlaceId)}
      tight={join.tight}
    />,
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
    enrichments,
    notes,
    documentAttachments,
    travelModeOverrides,
    travelModeVerbs,
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
    // **Every position corrected for the journey into it BEFORE one is chosen** (ADR-0206 §V1.1,
    // 2026-09-01). `firstPositionFitting` asks each hole whether it has room, and the room it was
    // asking about was the whole hole — so a one-tap schedule picked a 70-minute gap for a
    // 60-minute idea when 60 of those minutes were the drive, and `blockFor` then wrote the block
    // across it. The same correction the chip and the strip apply, so the day cannot offer a slot
    // on one surface that it refuses on another.
    const positions = dayPositions(dayEvents, activeDate, zone).map((p) => {
      const journey = p.beforeEvent ? journeyFor(p.afterEvent, p.beforeEvent) : null;
      return journey ? { ...p, free: narrowGapForTravel(p.free, journey, zone) } : p;
    });
    const position = firstPositionFitting(positions, minutes);
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
  /** **How long a row occupies**, in minutes — what an idea replacing it has to fit inside
   *  (ADR-0216 §2). Off the instants rather than the wall clocks beside it, so a zone-crossing
   *  row measures its own elapsed length; `0` where there is nothing to measure, which drops
   *  nothing (§D4). */
  const eventMinutes = (e: TripEvent): number | undefined => {
    const startMs = Date.parse(e.startsAt ?? '');
    const endMs = Date.parse(e.endsAt ?? '');
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined;
    return Math.max(0, Math.round((endMs - startMs) / MS_PER_MINUTE));
  };
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
  useLandOnArrival(arrivingEvent, (id) => document.querySelector(eventRowSelector(id)));
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
  // How this screen names a day (`dayLabel`): relative on a live trip, anchored on the day
  // ON SCREEN so an idea's "מחר" is the day after the one being built (ADR-0151); by trip-day
  // number off it, where "עוד 15 ימים" is only the day number plus a constant.
  const dayNaming = { trip, today, anchor: activeDate };
  const dayScope = dayPhase(activeDate, today);
  // A past day is a read-only archive within a live trip (ADR-0029) — but "past"
  // for EDITING is not the live zone's answer, nor even this day's ambient: a day
  // is over only once it is over in EVERY zone it touched (ADR-0029 session-103
  // amendment), so a travel day can't lock itself while you're still inside it.
  const readOnly = isDayOver(activeDate, zoneEvidence, now.getTime());

  const dayEvents = events
    .filter((e) => e.date === activeDate && e.status !== EVENT_STATUS.SKIPPED && !isAmbient(e))
    .sort(byStart);
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

  // Per-event display zones (ADR-0107): one builder over the one evidence, shared
  // with the Plan-mode builder so the two day surfaces cannot diverge.
  const zoneCtx = dayZoneContext(activeDate, zoneEvidence);
  /**
   * **THE CLOCK THIS DAY IS READ IN** — ADR-0206 §AQ, finished (owner, 2026-09-05).
   *
   * Every wall clock the day PRINTS resolves through `zoneCtx`, whose floor is the day's own
   * ambient zone. **A slot is a wall clock too**: `Gap.fill`, `Gap.until`, the fill sheet's
   * header, a new event's prefill and the instants a pick writes are all built and read as
   * `HH:MM` strings, and they were built in `trip.timezone` — the zone §AQ already had to take
   * away from the journey block, being _"the zone the trip is FILED under and not the one
   * anybody on it is reading a watch in"_.
   *
   * Internally consistent, so nothing was written to the wrong instant; and an hour off every
   * row beside it on any trip whose primary sits off its stops. Reported as a `44 דק׳ פנויות`
   * strip whose `＋` opened on `18:05–18:45` — straight through the ⁦18:00⁩ row below.
   *
   * **And not `authoringZone`, which answers the neighbouring question** (`frontend/CLAUDE.md`'s
   * own anti-pattern): that resolves the zone a DRAFT's typed time means, from the draft's own
   * place, and a hole has no place and no draft. Asked with neither it falls to the segment zone
   * and then to the primary — which is the zone this is here to stop reaching for. What the hole
   * belongs to is the DAY, and `ambientZone` is the day's answer: the zone its own events resolve
   * to, which is the fallback every row on this screen already prints through.
   */
  const dayZone = zoneCtx.ambientZone;
  /** **When this day's window opens** (ADR-0045/0037's 07:00) — the boundary that decides what
   *  belongs to the night before it. Memoized for the reason the Map's copy is: `zonedIso` builds
   *  an `Intl.DateTimeFormat`, and this screen re-renders every second on the clock. */
  const dawnMs = useMemo(
    () => dayWindowMs(activeDate, dayZoneContext(activeDate, zoneEvidence).ambientZone).startMs,
    [activeDate, zoneEvidence],
  );
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
    tz: dayZone,
    // Filled in below, once `merged` exists to derive the placement from.
    nowMark: null,
    zoneCtx,
    now,
    readOnly,
    openId,
    toggle: (id) => setOpenId((cur) => (cur === id ? null : id)),
    bookings,
    places,
    enrichments,
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
    dawnMs,
  );
  const merged = placement.positioned;

  // **What sits between two rows** (ADR-0159): free time stated, or a connection that
  // is not free time at all and takes both legs into one block. The join derivation is
  // shared with nothing else on this screen and the same `gapBetween` Plan mode fills
  // from, so the two modes cannot disagree about where a hole is.
  const blocks = dayBlocks(merged, { bookings, when: bookingWhen(events), tz: dayZone });

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
      woke && first && first.id !== woke.id
        ? { from: woke, to: first, fromIsStay: true }
        : undefined;
    // **AND THE DRIVE THAT BROUGHT YOU TO THE BED** (owner, 2026-08-26: _"it should also show the
    // way from the car rental to the hotel, right?"_). ADR-0054's amendment refused this leg the
    // same day and gave a reason that has since been fixed: a stay's only arrival bound is its
    // check-in FLOOR, and a leg into a floor used to read `אין זמן לדרך`. §AJ1 makes a floor a
    // non-deadline, so the leg now says the one thing it can — `הגעה ~00:31` — which is the fact
    // somebody landing at midnight actually wants.
    //
    // `departAfterMs` is the EDGE's placed instant, not the event's `endsAt`: a hire's `endsAt` is
    // its return, ten days out (`DayLeg.departAfterMs`).
    const cameIn = placement.overnight[placement.overnight.length - 1];
    const arrive =
      woke && cameIn && cameIn.event.id !== woke.id
        ? {
            from: cameIn.event,
            to: woke,
            fromEdge: cameIn.edge,
            departAfterMs: cameIn.atMs,
          }
        : undefined;
    // **AND THE LEG BACK** (ADR-0209 §1/§3), which is the other half of §AD and did not exist: the
    // day's last row is where you end it, so the journey into tonight's stay is as certain as the
    // one out of last night's.
    //
    // **This carried `bookend: true` and the line above said why, and the why was right about a
    // hazard the flag never addressed** (ADR-0206 §AS1). _"A stay has no per-day arrival instant,
    // so reading its `startsAt` as this hole's deadline would measure a window from its check-in
    // day"_ — true, and what handles it is `flexibleArrival`, which asks `isExactEdge(to, 'start')`
    // and gets `not-before` from any stay. The flag's only reader asks about the ORIGIN, so setting
    // it here suppressed this leg's `departAfterMs` instead — and with no departure instant there
    // was no arrival either, leaving the row silent at every hour of every day while Plan mode,
    // which asked the origin question directly, printed `הגעה ~21:26` all along.
    const lastBlock = blocks[blocks.length - 1];
    const lastEntry = lastBlock?.entries[lastBlock.entries.length - 1]?.entry;
    const last = lastEntry?.kind === 'event' ? groupEndEvent(lastEntry.group) : undefined;
    const home =
      bookends.sleeps && last && last.id !== bookends.sleeps.id
        ? // **No `fromIsStay` here, and that is §AS1's fix.** The stay is this leg's DESTINATION;
          // its origin is the day's last ordinary row, whose `endsAt` is exactly when you leave.
          { from: last, to: bookends.sleeps }
        : undefined;
    return {
      between,
      wake,
      home,
      arrive,
      legs: [arrive, wake, ...between, home].filter((l): l is DayLeg => !!l),
    };
  }, [blocks, bookends.woke, bookends.sleeps, placement.overnight]);
  const dayLegs = day.legs;

  const travelReads = useDayTravelReads({
    tripId: trip.id,
    legs: dayLegs,
    bookings,
    places,
    overrides: travelModeOverrides,
  });

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
    if (dayScope !== DAY_PHASE.TODAY) return null;
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
        // **`legDepartAfterMs` owns the three rules** (ADR-0206 §AJ3): the leg's own placed
        // instant, **no floor out of a bed** (§AF3 — a stay's `endsAt` is a check-out days away,
        // and reading it here measured a window from next Wednesday), otherwise the origin's end.
        // It was written out here, again in Plan mode, and nowhere on the board — which is how the
        // board came to skip §AJ2's clamp entirely and mark a traveller late for a departure this
        // surface was correctly printing as the origin's own end.
        departAfterMs: legDepartAfterMs(leg),
        arriveByMs: Date.parse(leg.to.startsAt ?? ''),
        // **A destination with no DEADLINE licenses no leave-by** (ADR-0206 §AI1). A check-in's
        // `17:00` is the hour the door opens, and counting back from it told you to leave in time
        // to arrive the instant it does — then marked you late against it. `isExactEdge` is the
        // predicate (`@waypoint/shared`), asked here because `dayJourney` holds instants and
        // cannot see an event.
        flexibleArrival: !isExactEdge(leg.to, 'start'),
        windowClosesMs: windowClosesMs(leg.to),
        travelSeconds: estimate?.durationSeconds ?? null,
        // **The distance is the reads' own, not the estimate's** (ADR-0206 §AA4): a declared leg
        // has no estimate to take one from and still keeps a distance, and `distanceFor` is the one
        // place that rule lives so Plan mode cannot answer it differently.
        distanceMeters: travelReads.distanceFor(leg.from, leg.to),
        // A declared leg is a journey with no duration rather than no journey — and it is also the
        // only thing carrying the mode control, so it must render (§AA4).
        declared: !isRoutableMode(travelReads.modeFor(leg.from, leg.to)),
        // …and a mode the gate refuses is the same shape of fact (ADR-0206 §AM10): no estimate is
        // ever coming, and the block is the only thing carrying the control that would change it.
        tooFarForMode: travelReads.refusedFor(leg.from, leg.to),
        // …and a leg whose number has not arrived yet is the third (ADR-0206 §AU1): it must RENDER,
        // because the block is what tells the reader a route is coming and what carries the control
        // that would pick a different mode for it. Ranked last of the three by `dayJourney` itself.
        warming: travelReads.warmingFor(leg.from, leg.to),
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

  /** **Is this row a leg you are carried on?** (ADR-0212 §1) — the one question the thread is
   *  drawn off, asked through `spendsSpanInMotion` so a hire is excluded for the reason that
   *  predicate already exists to state. */
  const carriedRow = (entry: DayEntry): boolean => {
    if (entry.kind !== 'event') return false;
    const event = groupStartEvent(entry.group);
    const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
    return !!booking && spendsSpanInMotion(booking.type);
  };

  /** **How far the day goes in the AIR** (ADR-0212 §3) — computed off the day's own events rather
   *  than rolled up from `journeys`, because a flight is not a hole between two rows: it IS a
   *  row, and nothing in the journey list has ever known about one. Kept apart from the ground
   *  total for the reason `DayTravelTotal.airMeters` measures.
   *
   *  `dayEvents` and not `merged`, so a leg counts on the day it DEPARTS and on no other. The
   *  merged list also carries ADR-0064's transition rows, and a red-eye owns one on each side of
   *  midnight — reading those would count Keflavík twice across two days, each of them looking
   *  perfectly reasonable on its own. `staysToday` is out of `dayEvents` already, and a stay is
   *  not carried anyway. */
  const airMeters = useMemo(
    () => dayAirMeters(dayEvents, bookings, places),
    [dayEvents, bookings, places],
  );

  /** **The day's total, off the journeys the rows above drew** (ADR-0206 §V1.9) — a roll-up
   *  rather than a second pass over `dayLegs`, so the header cannot claim kilometres for a hole
   *  the list shows no block for. `dayTravelTotal`'s docblock owns the asymmetry between the two
   *  halves; Plan mode reads the same function over its own map. */
  const dayTotal = useMemo(
    () => dayTravelTotal([...journeys.values()], travelReads.unplacedLegs, airMeters),
    [journeys, travelReads.unplacedLegs, airMeters],
  );

  /**
   * **What the head says this day is, and what it shows of it** (ADR-0219 §2/§3) — the same two
   * derivations the public reader names and pictures a day with (`@waypoint/shared`).
   *
   * Both are memoized on the trip state they read because this screen re-renders every second on
   * the clock, and both walk the whole trip's events: naming a day asks whether it is the way out
   * or the way home, which is a whole-trip question.
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
    () => dayShot(dayEvents, bookings, places, placeLabels, enrichments),
    [dayEvents, bookings, places, placeLabels, enrichments],
  );
  /** The full picture, opened from the shot — the screen owns the viewer, exactly as `Map.tsx`
   *  does for `PlaceKnowledge`'s hero (ADR-0167 §10). */
  const [fullShot, setFullShot] = useState<DayShot | null>(null);

  /**
   * **The facts true of the WHOLE day, in the head's footer band** (ADR-0219 §2/§4) — what the
   * teal strip above the list used to hold, minus the two things that were never facts about the
   * day. Trip mode has one: how far the day goes.
   *
   * **HOW FAR THE DAY GOES** (ADR-0206 §V1.9 / §AP) is Trip mode AND Plan mode, off one
   * derivation and one component: a day's total distance is a FACT, and ADR-0159 §1 allows the
   * two surfaces a difference in posture and forbids one about a fact.
   */
  const headFacts =
    dayTotal.distanceMeters !== null
      ? [<DayTravelTotal key="total" total={dayTotal} />]
      : undefined;

  /** The live hole's one control, and the arm decides what it means: `בדרך` answers the mark,
   *  `ביטול סימון` takes it back (ADR-0207 §7 — a toast is transient and a mark is not). Nothing
   *  on a read-only archive, where every other write is gated too (ADR-0029). */
  const liveAction = (journey: DayJourney): { label: string; onPress: () => void } | undefined => {
    if (readOnly || !liveLeg) return undefined;
    // **A mark that is set is always takeable back, whatever the block went on to say** (ADR-0206
    // §AQ3). Asked FIRST, and that ordering is the fix: `dayJourney` answers `OVERRUNS` before it
    // ever looks at `onWay`, so on a leg that does not fit the arm stays `OVERRUNS` after somebody
    // presses `בדרך` — and the branch below, keyed on `ON_WAY`, then offered nothing to undo. This
    // is the hero's own rule (`Home.tsx`: `onWayToNext ? undoSettle : …`), which is the point.
    if (liveOnWay) {
      return { label: t.actions.undoSettle, onPress: () => clearOnWay(trip.id, liveLeg.to.id) };
    }
    // The position said so rather than a person: there is no mark of theirs to withdraw, and the
    // app does not offer to take back something it worked out for itself (ADR-0207 §2).
    if (journey.arm === DAY_JOURNEY_ARM.ON_WAY) return undefined;
    // **`OVERRUNS` earns the mark too, and that is the half that was missing.** The two arms are
    // one question — is the departure still the live thing to say — and an infeasible leg answers
    // it more loudly than a passed one: there was never a leave-by to pass, so `בדרך` is the only
    // way to tell an app with no sensor that you went anyway. Withheld, the day offered a shortfall
    // and no way to answer it on exactly the leg where being late is already the fact.
    //
    // The row keeps saying the shortfall (`journeyMetaLine` is untouched): what the mark withdraws
    // is the NUDGE, not the warning, and the warning is still true once you are moving.
    return journey.arm === DAY_JOURNEY_ARM.PASSED || journey.arm === DAY_JOURNEY_ARM.OVERRUNS
      ? { label: t.actions.onWay, onPress: () => verbs.onWay(liveLeg.to) }
      : undefined;
  };
  /** `עדיין כאן` — the app saying it CHECKED, and the only claim a position licenses that the
   *  clock could not (ADR-0207 §2). Only where the fix actually puts them at the origin. */
  const liveLocated = (journey: DayJourney) =>
    liveStance?.stance === TRAVEL_STANCE.AT_ORIGIN && journey.arm === DAY_JOURNEY_ARM.PASSED
      ? t.travel.stillHere
      : undefined;
  /** **The mode control, shared with Plan mode** (ADR-0206 §AM9) — the hook owns the open state,
   *  the clear-vs-set rule and both gates, so the two day surfaces cannot offer different switches
   *  for the same leg. It lived here alone in M8b, which is what left Plan unable to change a mode. */
  const modeControl = useLegModeControl({ reads: travelReads, verbs: travelModeVerbs, readOnly });

  /** **The props a hole's journey block needs**, in one place, because the day's first leg renders
   *  outside the block loop and a second assembly is how the two would drift. */
  const journeyProps = (
    journey: DayJourney,
    live: boolean,
    leg: { from: TripEvent; to: TripEvent; fromEdge?: 'start' | 'end' },
  ) => ({
    journey,
    // **The LEG's mode, not the trip's** (ADR-0206 §AM). `modeFor` answers the override where one
    // was set and the derivation otherwise, and it is the same read the Map makes — one leg cannot
    // be a train in the list and a drive on the canvas (ADR-0159 §1).
    travelMode: travelReads.modeFor(leg.from, leg.to),
    // **The leg's own two zones, never the trip's primary** (ADR-0206 §AQ). This row used to take
    // `trip.timezone`, which is the zone the trip is FILED under and not the one anybody on it is
    // reading a watch in — so on a trip whose primary sits an hour off its stops the block printed
    // a departure after the arrival it was counted back from.
    zones: legDisplayZones(leg, zoneCtx),
    // **One tap to this leg on the canvas** (owner, 2026-08-27) — the pair comes from the one
    // function that resolves it, so the map lights the leg this row is about (ADR-0206 §AB2).
    onShowOnMap: legShowOnMap(travelReads.pairFor(leg.from, leg.to), showPlaceOnMap),
    ...(live ? { action: liveAction(journey), located: liveLocated(journey) } : {}),
    ...modeControl(leg.from, leg.to),
  });

  /** **The day's first leg — out of the stay you woke in** (ADR-0206 §AD). It has no `join` above
   *  it because it has no row above it, so it renders outside the block loop rather than inside
   *  one; everything it says is the same component saying it. */
  const wakeJourney = day.wake ? journeyFor(day.wake.from, day.wake.to) : null;
  const arriveJourney = day.arrive ? journeyFor(day.arrive.from, day.arrive.to) : null;
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

  // Land on now: scroll the now-line into view once per day-open (today only), a
  // passed event or two left peeking above. Keyed on the viewed day — never on
  // the clock tick — so it doesn't fight a manual scroll. Instant under
  // reduced-motion.
  const nowLineRef = useRef<HTMLDivElement>(null);
  const isToday = dayScope === DAY_PHASE.TODAY;

  // **Where the moment is** — only on today, because a past or future day has no "now"
  // (ADR-0043 §1/§4). `lib/now-line.ts` answers both halves (ADR-0217 §1/§2): `inside` names
  // the row the moment is IN and how far through it we are, and `index` is the boundary the
  // mark falls back to when no row holds it — before the day's first row, after its last, and
  // in a hole `dayBlocks` draws no row for. One derivation, shared with Plan's own reference.
  const showNowLine = isToday;
  const nowPlaced = nowLinePlacement(merged, now.getTime());
  const nowLineIndex = nowPlaced.index;
  const nowInsideRow = showNowLine ? nowPlaced.inside : null;
  const nowLabel = formatTime(now, nowZone);
  // **AND THE SPACE BETWEEN TWO ROWS HOLDS THE MOMENT TOO** (ADR-0217 §4) — a hole is an
  // interval like any other, and "you are in the gap, with 40 minutes of it left" is the
  // useful half of "what next". It is derived HERE rather than in `nowLinePlacement` because a
  // hole is not an entry: `dayBlocks` measures it between two of them, after the placement
  // exists. Which is also why it needs no second rule — a hole is precisely where no row holds
  // the moment, so `inside === null` at this index already identifies it, and the two answers
  // cannot disagree.
  //
  // **What this hands down is the hole, not a fraction** (the 2026-09-04 amendment): a hole
  // draws up to two rows and only `JoinRow` knows which, so the screen says WHETHER the moment
  // is in it and that row says which box of it holds the moment.
  const nowInHole = (from?: TripEvent, to?: TripEvent): JoinNowMark | null => {
    if (!showNowLine || nowInsideRow || !from?.endsAt || !to?.startsAt) return null;
    const opensMs = Date.parse(from.endsAt);
    const closesMs = Date.parse(to.startsAt);
    const nowMs = now.getTime();
    return closesMs > opensMs && nowMs >= opensMs && nowMs < closesMs
      ? { nowMs, opensMs, closesMs, label: nowLabel, ref: nowLineRef }
      : null;
  };
  // **AND THE DAY'S EDGE LEGS HOLD IT TOO** (the 2026-09-04 amendment) — `arriveJourney`,
  // `wakeJourney` and `homeJourney` render OUTSIDE the block loop because they have no join to
  // hang off (ADR-0206 §AD, ADR-0209 §1), so the boundary mark had exactly one position against
  // all three: below them. At ⁦05:00⁩ that said an ⁦08:40⁩ drive out of the hotel was behind us —
  // the reported defect, one row up and at the other end of the day.
  //
  // Three rows in a fixed order, so the mark takes the FIRST place that is true of it and the
  // ones after it stand down: nailed inside a leg under way, else above the first leg still
  // ahead, else its shipped place. `merged.length > 0` keeps a day with no entries on the tail
  // alone, which is the only mark it draws.
  const atHead = showNowLine && !nowInsideRow && nowLineIndex === 0 && merged.length > 0;
  const atTail = showNowLine && !nowInsideRow && nowLineIndex === merged.length;
  const inArriveLeg = atHead ? nowInJourney(arriveJourney, now.getTime()) : null;
  const inWakeLeg = atHead && !inArriveLeg ? nowInJourney(wakeJourney, now.getTime()) : null;
  const inHomeLeg = atTail ? nowInJourney(homeJourney, now.getTime()) : null;
  const overEdgeLeg = Boolean(inArriveLeg || inWakeLeg);
  const aboveArriveLeg = atHead && !overEdgeLeg && journeyIsAhead(arriveJourney, now.getTime());
  const aboveWakeLeg =
    atHead && !overEdgeLeg && !aboveArriveLeg && journeyIsAhead(wakeJourney, now.getTime());
  const aboveHomeLeg = atTail && !inHomeLeg && journeyIsAhead(homeJourney, now.getTime());
  /** An edge leg wrapped in the mark, or handed back plain. */
  const nailEdge = (inside: NowInside | null, row: ReactNode) =>
    inside ? (
      <NowMarker ref={nowLineRef} label={nowLabel} thruFrac={inside.thruFrac}>
        {row}
      </NowMarker>
    ) : (
      row
    );
  /** **And the loop's own boundary stands down where an edge leg has taken the mark** — it is the
   *  same mark, and all three of these can only fire at `nowLineIndex === 0`, which is the one
   *  index that boundary draws at. Without this the day draws two. */
  const headTaken = overEdgeLeg || aboveArriveLeg || aboveWakeLeg;
  // The ctx the ROWS render from. `dayCtx` itself carries no mark, which is what the tail of
  // untimed rows below wants: ADR-0171 §10a says they hold no position in the day, and
  // `eventSpans` agrees by skipping an event with no `startsAt` — so they can never be the
  // moment's row and must not be handed a key that might match one.
  const rowCtx: DayCtx = {
    ...dayCtx,
    nowMark: nowInsideRow ? { ...nowInsideRow, label: nowLabel, ref: nowLineRef } : null,
  };
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
      {/* **THE DAY PAINTS ONCE** (ADR-0206 §AT). Held — laid out, not painted — until this device
        has said what travel it holds for these legs, because the journey rows and the total
        APPEAR when an estimate lands: measured on a warm cache the day painted, then ⁦174ms⁩ later
        redrew ⁦162px⁩ taller, on every open and every swipe. `settled` is the local read only and
        never the network, so nothing here waits on a request; `visibility` rather than a mount
        gate so the surface's own layout, refs and scroll restoration are unaffected by the hold. */}
      <div className="day-page" data-measuring={!travelReads.settled || undefined}>
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
            {/* **The banner keeps its control and loses its heading** (ADR-0219 §2). It read
              `{heading} · לקריאה בלבד`, and the head under it now says the date — so the
              banner says only what the banner is for. */}
            <span className="ab-main">{t.day.archiveTag}</span>
            <button className="ab-back" onClick={() => setActiveDate(today)}>
              {t.header.backToToday}
            </button>
          </div>
        )}

        {/* **A DAY IS A PLACE YOU CAN SEE** (ADR-0219 §2/§3), and this replaces `.sec-title`'s
          12px muted `יום 3 · ראשון · איסלנד`. The trip ordinal is the header anchor's
          (`יום 3/12`) and the destination is the trip's name, so neither is repeated: the head
          says the date, what the day IS, and — when a stop clears `dayPhoto`'s gate — shows it.
          The same component and the same derivations the public reader uses. */}
        <DayHead
          card
          dayNumbers={dayOfMonthLabel}
          weekday={weekday}
          isNow={isToday}
          title={headTitle}
          shot={
            shot && {
              ...shot,
              eager: true,
              onOpen: () => setFullShot(shot),
            }
          }
          facts={headFacts}
          action={
            /* Trip-mode add is a Tier-1 quick soft-add for today (ADR-0025/0043), prefilled at
              the next open slot; heavy building lives in Plan. Locked on a past day (create
              gated, ADR-0029) — and then the footer band is absent entirely. */
            readOnly ? undefined : (
              <button className="new-event-btn" onClick={() => setFormTarget('new')}>
                <Icon name="plus" /> {t.actions.newEvent}
              </button>
            )
          }
        />

        <div className={'day-list' + (readOnly ? ' archive' : '')}>
          {/* **A COMMITMENT WITH NO CLOCK IS A ROW** (ADR-0219 §4), at the top of the list and
            below the head. It used to sit in the teal strip a multi-night stay's middle days
            also used — three unrelated kinds of thing in one box — and it is on
            `.transition-row`'s grammar now, because ADR-0210 §1 made the amber box and the 32px
            circle badge the committed point's and an untimed commitment is a commitment without
            a moment. Above the first row, so §10a-i's "a claim on your day reads at the top"
            holds with no strip to hold it. */}
          {placement.commitments.map((row) => (
            <UnplacedCommitment
              key={`${row.event.id}-${row.edge ?? 'untimed'}`}
              row={row}
              tz={dayZone}
              bookings={bookings}
              onDone={() => verbs.done(row.event)}
              onSkip={() => verbs.skip(row.event)}
              onUndo={() => verbs.restore(row.event)}
              onOpen={setDetailTarget}
            />
          ))}
          {/* **The walk out of the bed** (ADR-0206 §AD). Above the first row rather than between
            two, which is the one place in the day where a journey has no hole to sit in — and the
            leg you can be surest of, since the hotel is where you both started and finished. */}
          {/* **WHERE THE DAY STARTS** (ADR-0209 §1) — the row §AD's leg has never had an origin
            for. It states the place and, quietly, the stay's own bound; the leg below it is an
            ordinary journey block, which is why this row carries no clock (§3). */}
          {/* **WHAT BROUGHT YOU IN THROUGH THE NIGHT** (ADR-0054's 2026-08-26 amendment) — above
            the bed, because that is the order it happened in. The map has sorted a midnight car
            hire ahead of the hotel since 2026-08-25 and the list drew it below, with a ⁦25km⁩ drive
            out to the counter in between: one fact, two answers (ADR-0159 §1).
            **No journey block into the stay above it**, deliberately — a stay has no per-day
            arrival instant, so the only deadline available is its check-in floor from YESTERDAY,
            and inventing one is the mistake ADR-0206 §AI was written about. */}
          {placement.overnight.map((entry) => (
            <TransitionRow
              key={`${entry.event.id}-${entry.edge}`}
              entry={entry}
              tz={dayCtx.tz}
              {...transitionZoneProps(entry, dayCtx.zoneCtx)}
              bookings={dayCtx.bookings}
              onOpen={dayCtx.onOpenDetail}
              onNavigate={dayCtx.readOnly ? undefined : navigateHandler(entry.event, dayCtx)}
              onShowOnMap={eventShowOnMap(
                entry.event,
                dayCtx.bookings,
                dayCtx.places,
                dayCtx.showPlaceOnMap,
                entry.edge,
              )}
              onDone={dayCtx.readOnly ? undefined : () => verbs.done(entry.event)}
              onSkip={dayCtx.readOnly ? undefined : () => verbs.skip(entry.event)}
              onUndo={dayCtx.readOnly ? undefined : () => verbs.restore(entry.event)}
            />
          ))}
          {aboveArriveLeg && <NowMarker ref={nowLineRef} label={nowLabel} />}
          {arriveJourney &&
            day.arrive &&
            nailEdge(
              inArriveLeg,
              <JourneyRow
                {...journeyProps(arriveJourney, day.arrive.to === liveLeg?.to, day.arrive)}
              />,
            )}
          {bookends.woke && (
            <StayRow
              stay={bookends.woke}
              edge="wake"
              bound={stayBound(bookends.woke)}
              bookings={bookings}
              onOpen={setDetailTarget}
              onShowOnMap={eventShowOnMap(bookends.woke, bookings, places, showPlaceOnMap)}
              {...staySettle(bookends.woke)}
            />
          )}
          {aboveWakeLeg && <NowMarker ref={nowLineRef} label={nowLabel} />}
          {wakeJourney &&
            day.wake &&
            nailEdge(
              inWakeLeg,
              <JourneyRow {...journeyProps(wakeJourney, day.wake.to === liveLeg?.to, day.wake)} />,
            )}
          {/* Overlapping events render as the concurrency forest (ADR-0041): nests
            for containment, quiet clusters for partial overlap. The now-line is
            interleaved at the top level; untimed events have no span to place, so
            they stay plain leaf rows at the end. */}
          {/* **Which rows ride the thread** (ADR-0212 §1) — `spendsSpanInMotion` and not
            `carriesRoute`, because a car hire carries a route and is the one transport you
            drive yourself: threading it would draw a line through a counter you walked to.
            That predicate already separates the two for ADR-0061's bed-shaped gap, so a
            fourth carried mode joins by being one. */}
          {blocks.map((block) => {
            const rows = block.entries.map(({ entry, index, join, from }) => {
              const joinTo = entry.kind === 'event' ? groupStartEvent(entry.group) : undefined;
              const joinJourney = joinTo ? journeyFor(from, joinTo) : null;
              // A hole with no row drawn for it has nothing to nail the mark to, so the
              // boundary form keeps that case (§5's day-head hole).
              const joinNow = join || joinJourney ? nowInHole(from, joinTo) : null;
              return (
                <Fragment
                  key={
                    entry.kind === 'event'
                      ? groupKey(entry.group)
                      : `${entry.event.id}-${entry.edge}`
                  }
                >
                  {/* The join reads BEFORE the now-line: it is a fact about the plan, and
                  the now-line is the clock arriving inside it. */}
                  {(() => {
                    const to = joinTo;
                    const journey = joinJourney;
                    // **A join OR a journey**: the two are independent facts about one hole, and a
                    // hole too short for a join can still hold a leg (§AG6, and Plan has always
                    // drawn it).
                    if (!join && !journey) return null;
                    return (
                      <JoinRow
                        join={join ?? null}
                        nowMark={joinNow ?? undefined}
                        {...(journey && from && to
                          ? journeyProps(journey, to === liveLeg?.to && from === liveLeg?.from, {
                              from,
                              to,
                            })
                          : {
                              journey: null,
                              travelMode: travelReads.mode,
                              // No block renders on this branch — the row is a gap — but the zones
                              // are required so a journey can never reach it without them (§AQ),
                              // and they are the same two this hole would state if one appeared.
                              zones:
                                from && to
                                  ? legDisplayZones({ from, to }, zoneCtx)
                                  : { depart: zoneCtx.ambientZone, arrive: zoneCtx.ambientZone },
                            })}
                        tz={dayZone}
                        places={places}
                        placeLabels={placeLabels}
                        onFillGap={readOnly ? undefined : setGapTarget}
                      />
                    );
                  })()}
                  {/* The BOUNDARY form, and only when no row holds the moment: with an
                    `inside` the mark is nailed to that row instead (`ItemNode`). */}
                  {showNowLine &&
                    !nowInsideRow &&
                    !headTaken &&
                    joinNow === null &&
                    index === nowLineIndex && <NowMarker ref={nowLineRef} label={nowLabel} />}
                  {entry.kind === 'event' ? (
                    // **A CARRIED LEG SITS ON THE DAY'S THREAD** (ADR-0212 §1). The card is
                    // untouched — ADR-0210 §1 reserved the box for commitments and a flight is the
                    // strongest one a day holds — and the wrapper adds only the line it sits on.
                    // Skipped when the block is a journey run: the thread then belongs to the whole
                    // run (below), and a wrapper per leg would draw one line per card.
                    !block.journey && carriedRow(entry) ? (
                      <div className="day-thread">
                        <GroupNode group={entry.group} depth={0} ctx={rowCtx} />
                      </div>
                    ) : (
                      <GroupNode group={entry.group} depth={0} ctx={rowCtx} />
                    )
                  ) : (
                    <TransitionRow
                      entry={entry}
                      tz={dayCtx.tz}
                      {...transitionZoneProps(entry, dayCtx.zoneCtx)}
                      bookings={dayCtx.bookings}
                      onOpen={dayCtx.onOpenDetail}
                      onNavigate={
                        dayCtx.readOnly ? undefined : navigateHandler(entry.event, dayCtx)
                      }
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
              );
            });
            // A journey's legs live INSIDE one block, so the band between them belongs to
            // an object rather than floating between two cards (ADR-0159 §3) — and the thread
            // wraps the whole RUN rather than each leg (ADR-0212 §1/§5), which is also the
            // honest drawing: one journey, two legs, one line.
            return block.journey ? (
              <div className="day-thread" key={blockKey(block)}>
                <div className="journey">{rows}</div>
              </div>
            ) : (
              <Fragment key={blockKey(block)}>{rows}</Fragment>
            );
          })}
          {/* **AND WHERE THE DAY ENDS** (ADR-0209 §1) — the other half of §AD, which only ever
            built the leg OUT of a stay. The journey back is as certain as the one out, and it
            reads above the row it arrives at, exactly like every other leg in the day. */}
          {aboveHomeLeg && <NowMarker ref={nowLineRef} label={nowLabel} />}
          {homeJourney &&
            day.home &&
            nailEdge(
              inHomeLeg,
              <JourneyRow {...journeyProps(homeJourney, day.home.to === liveLeg?.to, day.home)} />,
            )}
          {bookends.sleeps && (
            <StayRow
              stay={bookends.sleeps}
              edge="sleep"
              bound={stayBound(bookends.sleeps)}
              bookings={bookings}
              onOpen={setDetailTarget}
              onShowOnMap={eventShowOnMap(bookends.sleeps, bookings, places, showPlaceOnMap)}
              {...staySettle(bookends.sleeps)}
            />
          )}
          {atTail && !inHomeLeg && !aboveHomeLeg && <NowMarker ref={nowLineRef} label={nowLabel} />}
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
                ? (formSlot ?? nextSlot(dayEvents, activeDate, dayZone))
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
                      meta={tileReasonText(reason, dayNaming)}
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
            naming={{ ...dayNaming, anchor: replaceTarget.date }}
            {...shelfForSlot(
              shelf,
              slotOf(replaceTarget),
              dayZone,
              { events, bookings, places },
              // **A replacement's window is the row's own length** (ADR-0216 §2): `החלף` keeps the
              // hour and the length, so what an idea has to fit here is exactly what the row being
              // displaced occupied — not a hole's free time, which this slot never had.
              eventMinutes(replaceTarget),
            )}
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
            naming={{ ...dayNaming, anchor: gapTarget.fill.date }}
            {...shelfForSlot(
              shelf,
              gapTarget.fill,
              dayZone,
              { events, bookings, places },
              gapTarget.minutes,
            )}
            glyph={(m) => ideaGlyph(m, places)}
            onPickIdea={(m) => {
              const block = ideaBlock(ideaCategory(m, places), gapTarget);
              verbs.schedule(m, {
                date: block.date,
                title: m.title,
                kind: EVENT_KIND.SOFT,
                startsAt: zonedIso(block.date, block.start, dayZone),
                endsAt: block.end ? zonedIso(block.date, block.end, dayZone) : undefined,
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

        {/* **The day's picture, full screen** (ADR-0219 §3) — the same viewer `PlaceKnowledge`'s
          hero opens on the Map (ADR-0167 §10), owned by the screen because the viewer is a
          portal. The credit is its caption: full screen is the photograph's most prominent
          display, so it is where the licence is owed most plainly. */}
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
    </div>
  );
}

// Shared wiring threaded through the recursive concurrency render (ADR-0041), so
// a nested/clustered EventCard keeps every quick-verb it has at the top level.
interface DayCtx {
  tz: string;
  /** **The moment's row and where in it**, threaded down the recursive concurrency render so
   *  the mark can be nailed to a NESTED row (ADR-0217 §2) — an envelope's child and a
   *  cluster's peer are both rendered by `ItemNode` at depth ≥ 1, and only `ItemNode` knows
   *  which event it is drawing. `null` on a past or future day, and whenever the moment is in
   *  a hole no row holds. */
  nowMark: { key: string; thruFrac: number; label: string; ref: React.Ref<HTMLDivElement> } | null;
  /** The trip's zone crossings + the day's ambient zone, so each event resolves
   *  its display zone(s) and the non-trivial-suppression rule (ADR-0107). */
  zoneCtx: ZoneContext;
  now: Date;
  readOnly: boolean;
  openId: string | null;
  toggle: (id: string) => void;
  bookings: Booking[];
  places: Place[];
  /** **What the world knows about each place** (ADR-0166 §6) — threaded beside `places` for the
   *  same reason they are: the row asks both questions about the same endpoint. Read here only
   *  to fill the badge with a photograph (ADR-0219 §1). */
  enrichments: TripEnrichments;
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

  // **The badge is the thumbnail's frame** (ADR-0167 §1) and the day rows never filled it.
  // `rowPhoto` answers the whole "was a glyph picked" question — on the event or on its place —
  // so the rule is not written out here and again in Plan.
  const photo = rowPhoto(e, ctx.bookings, ctx.places, ctx.enrichments);

  const card = (
    <EventCard
      icon={e.icon}
      photoUrl={photo && apiAssetUrl(photo.url)}
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
      // What is LEFT replaces the total on the ONE row the moment is inside (ADR-0217 §3).
      remaining={
        ctx.nowMark?.key === e.id && e.endsAt
          ? remainingPhrase(Date.parse(e.endsAt) - ctx.now.getTime())
          : undefined
      }
      distance={eventDistanceLabel(booking, ctx.places)}
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
  // **THE MARK IS NAILED HERE, at whatever depth this row is** (ADR-0217 §1). `ItemNode` is
  // the only place that knows which event it is drawing, which is what makes an envelope's
  // child and a cluster's peer work with no case of their own — `nowInside` already chose the
  // innermost holder, and this just recognises itself in the answer.
  //
  // It wraps the CARD and not the nest: the mark belongs to the row that holds the moment, and
  // a nest is that row plus everything under it.
  const marked = (row: ReactNode) =>
    ctx.nowMark && ctx.nowMark.key === e.id ? (
      <NowMarker ref={ctx.nowMark.ref} label={ctx.nowMark.label} thruFrac={ctx.nowMark.thruFrac}>
        {row}
      </NowMarker>
    ) : (
      row
    );
  if (!hasKids) return marked(card);
  return (
    <div className="nest">
      {marked(card)}
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
