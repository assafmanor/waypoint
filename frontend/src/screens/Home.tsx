// Home — the departure-board hero (the one loud element), a real-data-only
// quick-access grid, and a derived "day at a glance" card. Nothing on this
// screen is a fixture for an unbuilt feature (ADR-0045). "Now/Next" and the
// glance are derived from the clock + events, never stored (ADR-0018). The
// board + glance render via the D0 domain components (ui/domain, U-03); this
// screen orchestrates the data and feeds them, layout lives in the components.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  canPrice,
  EVENT_KIND,
  eventMidSpan,
  eventTransitionKeys,
  gateIsDue,
  isAmbient,
  isBracketed,
  isExactEdge,
  type Booking,
  type DocumentSummary,
  type Note,
  type EventEdge,
  type Task,
  type TripEvent,
  dayLight,
  zonedIso,
} from '@waypoint/shared';
import { ltrIsolate } from '../lib/bidi';
import { sunArc, skyStops, nextGoldenHour } from '../lib/daylight-view';
import { weatherView } from '../lib/weather-view';
import { SunWidget } from '../ui/domain/SunWidget';
import { useTrip } from '../state/trip-state';
import { useAuth } from '../state/auth-state';
import { useVerbs } from '../state/verbs';
import { useToast } from '../ui/Toast';
import { EventTitle } from '../ui/EventTitle';
import { DocumentViewer } from '../ui/MediaViewer';
import { GateSheet } from '../ui/GateSheet';
import { NoteFullScreen } from '../ui/NoteFullScreen';
import { NoteSheet } from '../ui/NoteSheet';
import { noteHost } from '../lib/notes';
import {
  Board,
  DayRail,
  GlanceCard,
  RateCard,
  WeatherCard,
  TransitProgress,
  type BoardCountdown,
  type BoardGap,
  type BoardTomorrow,
  type BoardNext,
  type BoardRow,
  type BoardTransit,
  type BoardVariant,
} from '../ui/domain';
import { useClock } from '../lib/useClock';
import { hotelWifi, nextCodedBooking } from '../lib/home-quick';
import { orderTaskRows, tasksDueSoon, type TaskDueClock } from '../lib/tasks';
import { TripHomeTaskBand } from '../ui/TripHomeTaskBand';
import {
  dayZoneContext,
  liveZone,
  liveZoneContext,
  eventRoute,
  eventZones,
  mapsDirectionsUrl,
  nextDestination,
  dayAnchorCoord,
  dayAmbientZone,
} from '../lib/places';
import { placeLabelOf, shortRoute } from '../lib/place-label';
import { usePlaceLabels } from '../state/place-labels';
import {
  edgeSettleWords,
  edgeTimePhrase,
  eventMidSpanWords,
  transitionLabel,
} from '../lib/transitions';
import { approxTravelTime, clockShiftSentence, formatDuration } from '../lib/duration';
import { TAB_PARAM, FOCUS_PARAM, DAY_PARAM, INDEX_FOCUS, INDEX_TAB } from '../state/nav-state';
import {
  countdownParts,
  dayProgress,
  deriveNow,
  formatCountdown,
  formatDayMonth,
  clockRange,
  formatTime,
  hardConflicts,
  minutesUntil,
  dayLabel,
  addDays,
  todayInTz,
  weekdayLetter,
  tzParts,
  dayWindowMs,
  hourLabel,
} from '../lib/time';
import {
  ambientSpanPosition,
  heldSpansOnDate,
  buildDayGlance,
  countsNights,
  dayBookendStays,
} from '../lib/glance';
import { deriveHeroBooking } from '../lib/hero-booking';
import {
  LEAVE_PHASE,
  heroArrival,
  heroLeaveBy,
  travelOrigin,
  type HeroLeaveBy,
} from '../lib/hero-travel';
import { TIME_FACT, statedTime, type TimeFactClaim } from '../lib/time-claim';
import { GAP_CHARACTER, gapCharacter, gapDrawsDayRail } from '../lib/gap-character';
import { tomorrowRibbon } from '../lib/tomorrow';
import { TRAVEL_STANCE, remainingTravelSeconds, travelStance } from '../lib/travel-position';
import { useLiveFix } from '../lib/useLiveFix';
import {
  dayAirMeters,
  endpointPlaceId,
  legDepartAfterMs,
  useDayTravelReads,
  type DayLeg,
} from '../lib/day-travel';
import { dayTravelTotal } from '../lib/day-joins';
import { trackMetaFor } from '../lib/day-track';
import { glanceTrack } from '../lib/glance-track';
import { clearOnWay, useOnWay } from '../lib/on-way';
import { canLift, heroHorizon, type HeroPoint } from '../lib/hero-horizon';
import { BEAT, playBeat } from '../lib/one-shot';
import {
  HeroLift,
  type HeroLiftPeer,
  type HeroLiftPoint,
  type HeroLiftTask,
  type HeroLiftTravel,
} from '../ui/domain/HeroLift';
import { toHeroTask } from '../lib/hero-task';
import { ConverterSheet } from '../ui/domain/ConverterSheet';
import { currencyForDeviceRegion } from '../lib/currency';
import { useShowPlaceOnMap } from '../state/map-scope-state';
import {
  CODE_PREFIX,
  DAY_WINDOW,
  CONTROL_ICON,
  DEFAULT_STAY_ICON,
  HERO_TASK_CAP,
  MINUTES_PER_DAY,
  MS_PER_DAY,
  QUICK_TILE_MAX_COLS,
  STAY_STRIP_DISMISS_STORAGE_KEY,
  type TabId,
  DAY_MIDNIGHT,
  WEATHER_STRIP_DAYS,
} from '../constants';
import { t } from '../i18n/he';
import { Icon } from '../ui/Icon';
import { useSettledHosts } from '../ui/HostTasks';
import { useMode } from '../state/mode-state';
import { useAutomaticTasks } from '../lib/useAutomaticTasks';
import { resolvedReadinessPct } from '../lib/automatic-tasks';
import { taskPreview } from '../lib/tasks';
import { prepHeroFacts } from '../lib/prep-hero-facts';
import { firstTimedOn } from '../lib/prep-tier';
import { PrepDates, PrepHero } from '../ui/domain/PrepHero';
import { GoingLiveMorph } from '../ui/domain/GoingLiveMorph';

/** The start transition label key for a bracketed upcoming event (ADR-0063),
 *  by mode — a flight's take-off, a train's departure (via eventTransitionKeys). */
const startTransitionKey = (e: TripEvent): string | undefined =>
  isBracketed(e) ? eventTransitionKeys(e)?.startKey : undefined;

/**
 * **The passed-leave arm's three parts** (ADR-0208 §1) — `15 · דקות באיחור · ליציאה`.
 *
 * Two words were reported unclear in this slot before this one, each missing a different half of
 * the sentence: `מהיציאה` read as _measured from_ ("15, counted from the departure"), and a bare
 * `באיחור` said the number was lateness while naming nothing it was late FOR — so `15` could as
 * easily have meant the event started a quarter of an hour ago.
 *
 * **The measure word is the ladder's own, never a literal.** `formatCountdown` steps to `H:MM`
 * past an hour, and a leg long enough to be an hour late is a drive rather than a walk — so a
 * hardcoded `דק׳` would have labelled `1:20` as minutes. The third part is `leaveIn` verbatim,
 * because both arms are about the same departure and differ only on which side of it the clock is.
 */
function passedLeaveCountdown(leave: HeroLeaveBy): BoardCountdown {
  const ladder = formatCountdown(-leave.minutesToLeave);
  return {
    ...ladder,
    unit: t.board.lateBy(ladder.unit),
    unitBelow: t.board.leaveIn,
    missed: true,
  };
}

export function Home({ onNavigate }: { onNavigate?: (tab: TabId) => void }) {
  const {
    trip,
    bookings,
    places,
    events,
    notes,
    documents,
    documentAttachments,
    hostContexts,
    zoneEvidence,
    activeDate,
    fxRates,
    forecast,
    refreshFx,
    tasks,
    subtasks,
    users,
    zoneCrossings,
    travelModeOverrides,
    taskVerbs,
    noteHosts,
    noteVerbs,
  } = useTrip();
  const { me } = useAuth();
  const placeLabels = usePlaceLabels();
  const verbs = useVerbs();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useClock();
  const nowMs = now.getTime();
  // The board is Trip mode's live surface, so its framing — "today", the day
  // window, the progress bar, the now/next clock — reads in the zone of the
  // itinerary segment you're currently in (ADR-0107 §4), not a fixed trip zone.
  const tz = liveZone(nowMs, zoneEvidence);
  const today = todayInTz(tz, now);
  // Each hero slot renders in its **own** event's zone (sticky display, ADR-0107
  // §2-3) — the live zone is only the frame + what a shift is measured against,
  // so "ambient" here is where you are standing now.
  const zoneCtx = liveZoneContext(nowMs, zoneEvidence);
  const zonesOf = (e: TripEvent | undefined) => (e ? eventZones(e, zoneCtx) : undefined);

  // ── Money (ADR-0180 §3/§4) ───────────────────────────────────────────────
  // The pair is **the trip's currency against the member's HOME currency** — what
  // you pay in against what you think in. The device region seeds the second when
  // the account has never chosen one, so the card works on first open with no
  // settings visit (§2); the stored preference is what travels between devices.
  const homeCurrency = me?.user.preferredCurrency ?? currencyForDeviceRegion();
  // Existence, not age (§4). A set of any age renders; only "never fetched", a
  // trip with no currency, or a pair this source cannot price removes the card —
  // and offline-with-a-cache is indistinguishable from stale here by design.
  const rateCardVisible =
    !!trip.currency && !!homeCurrency && canPrice(fxRates, trip.currency, homeCurrency);
  // §4's rule for whether the "as of" is a control at all: a press can only change
  // the number once the source says a newer set should exist. This is a comparison
  // rather than a client-side guess about business days precisely because the
  // provider publishes `nextUpdateAt` — the reason it was the one chosen (§7).
  const canRefreshFx = !!fxRates && nowMs >= Date.parse(fxRates.nextUpdateAt);
  const [converting, setConverting] = useState(false);
  // The converter's own pair, which starts at the card's and is then the SHEET's
  // to change: swapping or picking there must not rewrite the trip's currency or
  // the member's preference, both of which are settings with their own screens.
  const [converterFrom, setConverterFrom] = useState<string | null>(null);
  const [converterTo, setConverterTo] = useState<string | null>(null);

  // A span you are INSIDE is backdrop, never a now/next block — once you've checked in it
  // would otherwise hijack the hero for the whole stay (ADR-0059 §1 / ADR-0054). Its
  // transitions surface via the hero-booking derivation below; before it starts it stays in,
  // so it can be the natural "next" fairly.
  //
  // **A journey is exempt, and that exemption is a red-eye's whole bug.** An overnight
  // flight has an `endDate`, so it is `isMultiDay` and therefore ambient — and this filter
  // dropped it from `deriveNow` the moment it took off, which is why the board stopped
  // seeing it as happening at all. Ambient says how a span RENDERS across days; what its
  // middle IS is `midSpan.kind`, and a journey's middle is you, inside it.
  //
  // **So ask `midSpan.kind` DIRECTLY, which is what this was reaching for all along**
  // (ADR-0227 §B). `isAmbient(e) && !isJourney(e)` is "a multi-day held span", and the
  // multi-day half was never part of the argument — it is just where the predicate came
  // from. A SAME-day car hire is not `isMultiDay`, so it survived this filter, and
  // `byPrimaryNow` puts a hard event first: measured, `deriveNow(12:20)` answered
  // `Iceland Car Rental` with the lunch you are actually at in `nowAll[1]`, for the nine
  // hours between pick-up and return. The replacement is both simpler and broader, and it
  // changes nothing for a multi-day span, whose only ambient categories are lodging (held)
  // and transport (journey, exempt above and below alike).
  const scheduleEvents = events.filter(
    (e) => !(eventMidSpan(e)?.kind === 'held' && nowMs >= Date.parse(e.startsAt!)),
  );
  const { now: nowEvent, next: nextEvent, nowAll, nextAll } = deriveNow(scheduleEvents, now);
  const dayEvents = events.filter((e) => e.date === activeDate);

  // A bracketed booking surfaces on the hero only at its transition moments
  // (ADR-0059 §1): a flight in the air fills the NOW slot (in-transit), a hotel
  // check-in/out or flight departure decorates the NEXT slot.
  const hero = deriveHeroBooking(events, nowMs, today);
  /** **A held span's MIDDLE yields the slot to whatever you are actually doing** (ADR-0227 §B).
   *
   *  Session 215 designed what a held middle LOOKS like on this card — `כרגע · הרכב אצלנו`,
   *  no rail, no travelling mark — and the question it never asked is whether that middle
   *  should be the card's SUBJECT while something else is running. It should not: holding a
   *  car is a condition you are under, and the `.stay-strip` below is the surface this app
   *  already has for one. When nothing else is in progress the middle keeps the slot exactly
   *  as it was, because then there is nothing for it to talk over.
   *
   *  **Its ENDS are untouched, and that is the line.** `transition-arrival` is the return
   *  deadline inside its emphasis window — the "what do I need in the next 30 minutes"
   *  question this card exists for — so it outranks lunch and is deliberately not gated. */
  const heldMiddleYields =
    hero.kind === 'in-transit' &&
    !!hero.event &&
    eventMidSpan(hero.event)?.kind === 'held' &&
    nowAll.length > 0;
  const inTransit =
    (hero.kind === 'in-transit' || hero.kind === 'transition-arrival') && !heldMiddleYields;
  const arriving = hero.kind === 'transition-arrival';
  // In-transit hero derivations (flight in the air): time-to-landing progress
  // and the code chip.
  const transitEvent = inTransit ? hero.event : undefined;
  /** **The horizon's now-points are whatever the BOARD is showing**, which is ADR-0160 §1's
   *  one-object rule stated as an expression rather than trusted.
   *
   *  `nowAll` is the activities, and a span you are inside is deliberately not one of them
   *  (§B's filter above). A JOURNEY was never filtered, so it has always arrived here inside
   *  `nowAll`; a held span that keeps the slot because nothing else is running now has to be
   *  added back, or the two elevations disagree — which is exactly what the suite caught:
   *  the collapsed board drew `כרגע · הרכב אצלנו` correctly and `canLift` then answered
   *  "nothing to lift", so the one surface carrying that span's booking, notes, files and
   *  settle could not be opened at all. Written as "is the board's now-point already in the
   *  list" rather than as a second reading of `midSpan.kind`, so there is one rule here and
   *  not a copy of the one above. */
  const heroNowAll =
    transitEvent && !nowAll.some((e) => e.id === transitEvent.id)
      ? [transitEvent, ...nowAll]
      : nowAll;
  const transitZones = zonesOf(transitEvent);
  const transitStart = transitEvent?.startsAt ? Date.parse(transitEvent.startsAt) : 0;
  const transitEnd = transitEvent?.endsAt ? Date.parse(transitEvent.endsAt) : 0;
  const transitProgress =
    transitEvent && transitEnd > transitStart
      ? Math.min(1, Math.max(0, (nowMs - transitStart) / (transitEnd - transitStart)))
      : 0;
  const transitBooking = transitEvent?.bookingId
    ? bookings.find((b) => b.id === transitEvent.bookingId)
    : undefined;
  // **The flight's name, not its ticket number** (ADR-0223 §2). Mid-flight the code is a
  // lookup key for a desk you have already left; `LY315` is what every screen and
  // announcement around you is using, and it stays true for the whole journey.
  const transitFlightNumber = transitBooking?.flightNumber;
  // Origin/destination anchor the in-transit progress ends (ADR-0059 §3): a
  // flight reads as where it goes, not a name.
  const transitRoute = transitEvent
    ? shortRoute(eventRoute(transitEvent, bookings, places, placeLabels) ?? {})
    : null;
  // What this span's middle is called, by mode (`בטיסה` for a flight, `בדרך` for
  // anything else that carries you) and whether it is a journey at all — one
  // resolution shared by the collapsed board and the lifted hero, off the same
  // profile that already names the two ends.
  const transitWords = transitEvent ? eventMidSpanWords(transitEvent) : undefined;
  // How long is left, on the app's one elapsed ladder (ADR-0114) — the answer to
  // "when do we land", which no surface carried until now. Absent once the end has
  // passed, so a rail never says `נותרו 0`.
  // `hours` and not `auto`: a journey's length is read in hours however long it runs
  // (ADR-0084), so a 30h ferry says `30 שעות` rather than stepping up to a day.
  const transitRemaining =
    transitEvent?.endsAt && transitEnd > nowMs
      ? formatDuration(minutesUntil(transitEvent.endsAt, now), 'hours')
      : null;
  // The crossing in words, for the LIFTED hero only — `null` on a single-zone leg, the
  // same gate `ZoneShiftPill` already applies to itself.
  const transitClockShift = transitZones?.deltaMinutes
    ? clockShiftSentence(transitZones.deltaMinutes)
    : null;
  // **`מחר` beside the arrival, and ONLY when it is not today** (ADR-0160 §M, finally
  // buildable). The duration is the fact you act on and it is already on the row; the
  // calendar day is a disambiguator for the one case where the time alone misleads — a
  // red-eye landing at 06:00 reads as this morning, and the zone jump breaks the arithmetic
  // you would use to work it out, which is the same reason the clock shift is a sentence.
  //
  // The comparison is well-defined because both sides are read in the zone you are standing
  // in: mid-journey the live zone IS the destination's (ADR-0107 §4), so `today` and the
  // landing's own day are the same calendar. That is the fact that made the "time there"
  // chip redundant, paying for itself twice.
  const transitArrivalDay = (() => {
    const zone = transitZones?.endZone;
    if (!transitEvent?.endsAt || !zone) return undefined;
    const landsOn = todayInTz(zone, new Date(transitEvent.endsAt));
    return landsOn === today ? undefined : dayLabel(landsOn, { trip, today });
  })();

  const conflicts = nowEvent ? hardConflicts(nowEvent, dayEvents) : [];
  // Concurrency on the board (ADR-0041): one loud hero + a quiet "ועוד N" for the
  // rest, unless several soft events run at once with no hard anchor to lead —
  // then it's a group-split ("עכשיו · במקביל"), shown as equals.
  const alsoNow = nowAll.slice(1);
  const groupSplit = nowAll.length >= 2 && nowAll.every((e) => e.kind === EVENT_KIND.SOFT);

  // The NEXT item: normally deriveNow's next, but check-out is an END transition
  // deriveNow can't surface — offer the hotel and pick whichever comes sooner.
  let shownNext = nextEvent;
  let nextInstant = nextEvent?.startsAt;
  let nextLabelKey: string | undefined;
  if (hero.kind === 'transition-checkout' && hero.event?.endsAt) {
    if (!nextInstant || Date.parse(hero.event.endsAt) < Date.parse(nextInstant)) {
      shownNext = hero.event;
      nextInstant = hero.event.endsAt;
      nextLabelKey = hero.labelKey;
    }
  }
  if (!nextLabelKey && shownNext) nextLabelKey = startTransitionKey(shownNext);
  /** **WHICH END the next slot is showing** (ADR-0224 §1) — `end` exactly when the branch
   *  above filled the slot with a check-out, `start` everywhere else. Asked once here and
   *  read three times (the horizon's `nextEdge`, the zone that instant renders in, and the
   *  bound its clock states): three call sites were re-deriving the same comparison, which is
   *  the shape of thing that reads fine and inverts silently in one of them. */
  const nextShownEdge: EventEdge =
    nextInstant && nextInstant === shownNext?.endsAt ? 'end' : 'start';

  const nextBooking = shownNext?.bookingId
    ? bookings.find((b) => b.id === shownNext!.bookingId)
    : undefined;
  // **The gate, but only inside its window** (ADR-0222 §4/§5). Resolved here rather than in
  // `Board` so the card never asks what time it is, and shared with the lifted hero below so
  // the two surfaces cannot disagree about whether a gate is due.
  const nextGateDue = gateIsDue(nextBooking, shownNext?.startsAt, nowMs);
  const nextGate =
    nextGateDue && nextBooking?.gate
      ? `${t.index.sheet.gateLabel[nextBooking.type]} ${nextBooking.gate}`.trim()
      : undefined;
  // ── What a task derivation is read against ─────────────────────────────────
  // Declared here rather than beside the band below, because the lifted hero reads tasks too
  // (ADR-0160 §U) and both must be the SAME clock and the SAME settled-host set — a hero that
  // still offers a task the band has already dropped is two answers to one question.
  const { goingLive, skipGoingLive, phase } = useMode();
  const taskClock: TaskDueClock = useMemo(
    () => ({ nowMs, crossings: zoneCrossings, primaryZone: trip.timezone, trip, phase }),
    [nowMs, zoneCrossings, trip, phase],
  );
  const settledHosts = useSettledHosts();
  // ── THE FIRST MORNING (ADR-0221 §4) ─────────────────────────────────────────
  // On the first open of a live trip the plan face sits over the board and turns into it.
  // Its facts are the prep hero's own derivation, so the face the board grows out of is the
  // card the evening before showed — same tier, same clock, same two numbers.
  const { automatic } = useAutomaticTasks();
  const prepFacts = goingLive ? prepHeroFacts({ trip, events, now, zoneEvidence }) : null;
  const prepPreview = goingLive ? taskPreview(tasks, automatic, taskClock, settledHosts) : null;

  // ── THE LIFTED HERO (ADR-0160) ─────────────────────────────────────────────
  // The horizon is DERIVED from what the board is already showing, never
  // re-derived from the clock: `nowAll` and the board's own `shownNext` go in, so
  // the collapsed and lifted states cannot disagree about what is happening.
  //
  // `shownNext` and not `nextAll` is the load-bearing bit. A hotel CHECK-OUT is an
  // END transition `deriveNow` cannot surface (see above), so the board sometimes
  // shows a next that is not `deriveNow`'s — and a horizon built off `nextAll`
  // would name a different "next" than the board it grew out of.
  const horizon = heroHorizon({
    // **The whole trip, so `אחר כך` stops stopping at midnight** (ADR-0211 §7). This was
    // `dayEvents`, and `thenAfter` is the ONLY consumer of the field (grepped, not assumed) —
    // it looks for the first event starting after the `next` cluster. `next` has always been
    // trip-scoped (`deriveNow` has no date filter), so a day-scoped `events` meant the third
    // point could never follow it past midnight: at ⁦22:40⁩ the lifted hero showed tomorrow's
    // flight and then nothing, while the same function handed the whole trip finds the stop
    // after it. `thenAfter` keys off `nextAll[0].startsAt` rather than the clock, so widening
    // the pool cannot pull in anything earlier than the point it follows.
    events,
    // Mid-flight the point's place is where you are GOING; the authority rule's origin is
    // the airport you have already left (session 215).
    midSpanEventId: transitEvent?.id,
    nowAll: heroNowAll,
    // **The whole STOP when the board shows `deriveNow`'s own next** (ADR-0225 §6/§7): the
    // horizon lists the peers and `אחר כך` skips them. A check-out standing in for next has
    // no peers — a stay's edge is one moment — so it goes in alone, as before.
    nextAll: shownNext ? (shownNext === nextEvent ? nextAll : [shownNext]) : nextAll.slice(0, 0),
    // **Which END that slot is showing** (ADR-0224 §1). `nextInstant` is the event's `endsAt`
    // exactly when the board filled the slot with a check-out (see `shownNext` above), which
    // is the same test `nextZone` already makes a few lines down — asked once, read twice.
    nextEdge: nextShownEdge,
    bookings,
    places,
    notes,
    // The hero's own reach to an attached file (ADR-0174 §6) — resolved inside the horizon,
    // through the same context the notes go through, so the board and the day row cannot
    // disagree about what a point carries.
    attachments: documentAttachments,
    documents,
    // The same three the band and the Index tile read (ADR-0160 §U8) — passed, never rebuilt.
    tasks,
    taskClock,
    settledHosts,
    hostContexts,
  });
  const liftable = canLift(horizon);
  const [lifted, setLifted] = useState(false);
  /** The board element that was pressed — the box the hero flies from and back to
   *  (ADR-0160 §5). Held rather than measured here: a rect read at press time would be
   *  the PRESSED box, since `--press-scale-lg` is still applied under the finger and
   *  `getBoundingClientRect` includes transforms. The flight measures it a frame later,
   *  after `:active` has been released. */
  /** The attached file the hero was asked to open, if any (ADR-0174 §6). Held here rather
   *  than inside `HeroLift`, which is presentational like `Board` beside it — the same reason
   *  every other hand-off on that card arrives as a callback. */
  const [viewingDoc, setViewingDoc] = useState<DocumentSummary | null>(null);
  // The booking whose gate is being set (ADR-0222 §7). Held here rather than inside the hero
  // so the sheet outlives a hero close — the same reason `viewingDoc` lives at this level.
  const [gateBooking, setGateBooking] = useState<Booking | null>(null);
  /** **The hero's note, opened on its own screen** (ADR-0235 §5). Held here for the reason
   *  every other hand-off off that card is: `HeroLift` is presentational, and the screen
   *  needs the trip's users and the note's resolved host — both of which live up here. */
  const [readingNote, setReadingNote] = useState<Note | null>(null);
  /** The same note, being edited. A second piece of state rather than a mode on the first,
   *  because the editor OUTLIVES the screen it was opened from: closing the reader on the way
   *  into the form is what keeps one `Modal` on screen at a time (ADR-0090's one-back-action
   *  invariant), and a single `'read' | 'edit'` would have to remember the note twice anyway. */
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const boardEl = useRef<HTMLElement | null>(null);
  const wasLifted = useRef(false);
  const showPlaceOnMap = useShowPlaceOnMap();

  // The landing beat (ADR-0160 §7), played AFTER the render that reveals the board —
  // not in the close handler, which is where it was first written and would not have
  // survived. React owns `className` on that node, so a class added imperatively before
  // its next reconcile is overwritten by it: dropping `is-lifted` rewrites the whole
  // attribute and takes `is-landing` with it.
  useEffect(() => {
    if (wasLifted.current && !lifted && boardEl.current) {
      playBeat(boardEl.current, BEAT.LANDING, '--t-quick');
    }
    wasLifted.current = lifted;
  }, [lifted]);

  /** One of the hero's tasks, made view-ready (ADR-0160 §U) — the deadline phrased in ITS OWN
   *  zone through the same `taskDue` the section and the screen use, so a task cannot read
   *  one way here and another one tab over.
   *
   *  **Lives in `lib/hero-task.ts` since ADR-0193 §4**, because the lifted PLAN hero renders
   *  the same row and two formatters for one row is what drifts. */
  const heroTask = (task: Task): HeroLiftTask =>
    toHeroTask(task, taskClock, users, subtasks.get(task.id));

  /** A horizon point, made view-ready: titles become nodes, times are formatted in
   *  the point's OWN zone (ADR-0107 §2-3), and the hand-offs become callbacks the
   *  presentational layer can fire without knowing how a route is built. */
  const liftPoint = (p: HeroPoint, key: string): HeroLiftPoint => {
    const zones = eventZones(p.event, zoneCtx);
    const dest = p.placeId ? places.find((pl) => pl.id === p.placeId) : undefined;
    // The one point you are INSIDE, if any. It takes the collapsed board's own mid-span
    // grammar rather than the ordinary now-grammar, and it is the only point that can:
    // a concurrent event running alongside a flight is still an ordinary point.
    const isMidSpan = !!transitEvent && p.event.id === transitEvent.id;
    return {
      key,
      title: <EventTitle event={p.event} bookings={bookings} places={places} />,
      icon: p.event.icon,
      // `קשיח` on a flight you are sitting inside is true and useless — the label slot
      // says what you are doing instead (`כרגע · בדרך`).
      kind: isMidSpan ? undefined : p.event.kind === EVENT_KIND.HARD ? 'hard' : 'soft',
      ...(isMidSpan && transit
        ? {
            transit: {
              label: transit.label,
              endLabel: transitionLabel(transit.labelKey),
              endTime: transit.endTime,
              endDay: transitArrivalDay,
              inPhrase: transitRemaining ? t.board.inPhrase(transitRemaining) : undefined,
              flightNumber: transitFlightNumber,
              // The zone crossing in words, plus the destination's clock right now. The
              // pill stays on the collapsed board: same number, and this is the state you
              // asked for, so it can afford the sentence the pill cannot say.
              ...(transitClockShift ? { clockShift: transitClockShift } : {}),
              // The SAME component the collapsed board renders, one level in — not a copy
              // of its markup, and not the card's foot, which is what made it read as the
              // next event's progress. A held span renders nothing here (the component
              // answers null), so the hero shows its held line instead.
              rail: <TransitProgress transit={transit} />,
              held: transit.heldSince ? t.board.heldSince(transit.heldSince) : undefined,
            },
          }
        : {}),
      until: p.event.endsAt ? formatTime(p.event.endsAt, zones?.endZone ?? tz) : undefined,
      shift: zones?.deltaMinutes,
      place: placeLabelOf(placeLabels, p.placeId, p.place),
      // **The gate, as a value you can set from here** (ADR-0222 §7). Present whenever this
      // point is a booking whose type HAS a gate — not gated on the departure window the
      // board uses, because the window decides what is worth SHOUTING and the hero is where
      // you come to fill something in. An unset gate renders the inviting empty token.
      ...(() => {
        const b = p.bookingId ? bookings.find((x) => x.id === p.bookingId) : undefined;
        const label = b ? t.index.sheet.gateLabel[b.type] : '';
        return b && label ? { gate: { label, value: b.gate, onSet: () => setGateBooking(b) } } : {};
      })(),
      note: p.notes[0]?.body,
      noteMore: Math.max(0, p.notes.length - 1),
      // **Three lines and then a way to the rest** (ADR-0235 §5). The hero shows the newest
      // note, so this opens exactly the one it is showing — not the host's list. Captured
      // rather than re-indexed inside the closure, so the control cannot open a different
      // note than the one whose words are on screen.
      ...(() => {
        const shown = p.notes[0];
        return shown ? { onReadNote: () => setReadingNote(shown) } : {};
      })(),
      // **The one surface a boarding pass is actually needed on, and the one that never
      // showed it.** One chip per document, in this point's own action row — `אחר כך` gets
      // none for free, because `HeroThen` carries no id (ADR-0160 §12's condition).
      documents: p.documents.map((doc) => ({
        key: doc.id,
        title: doc.title,
        onOpen: () => setViewingDoc(doc),
      })),
      // **UP TO `HERO_TASK_CAP`, and how many are left over** (ADR-0160 §U5 as amended
      // 2026-08-16). The list arrives already in the screen's own urgency order, so the ones
      // shown are the ones the tasks screen puts on top — the cap slices, it does not re-rank.
      tasks: p.tasks.slice(0, HERO_TASK_CAP).map(heroTask),
      taskMore: Math.max(0, p.tasks.length - HERO_TASK_CAP),
      settled: p.settled,
      // The Map's focus channel is absent when its provider is not mounted, so the
      // way-in is absent too rather than a control that cannot work (ADR-0150 §8).
      onMap: p.placeId && showPlaceOnMap ? () => showPlaceOnMap(p.placeId!) : undefined,
      navigateUrl: mapsDirectionsUrl(dest) ?? undefined,
      onBooking: p.bookingId
        ? () => navigate(`/?${TAB_PARAM}=index&booking=${p.bookingId}`)
        : undefined,
      // **A flight you are sitting inside settles itself by landing** (ADR-0160 §10), so
      // the transit point drops the verbs — not a density question but a nonsense one.
      // Derived from the point rather than threaded as a flag, so a concurrent event during
      // a flight keeps its own.
      // **The pair's words are the EDGE's** (ADR-0224 §3) — `יצאנו` on a check-out where the
      // shipped pair says `היינו`, and never `דילגנו`, which on an edge you made is a false
      // record (ADR-0208). Absent on a stop, where the shipped pair is right.
      settleWords: edgeSettleWords(p.event, p.edge),
      ...(isMidSpan
        ? {}
        : {
            onDone: () => verbs.done(p.event, p.edge),
            onSkip: () => verbs.skip(p.event, p.edge),
            onUndo: () => verbs.restore(p.event, p.edge),
          }),
    };
  };

  // ── THE JOURNEY BETWEEN TWO POINTS (ADR-0206 §V1.2 / §Z1) ──────────────────
  // The app's third question — _what do I need in the next 30 minutes_ — answered for the
  // first time, and answered in the slot that is already BETWEEN the horizon's two points
  // (§D2). Not a fifth point-depth item: a journey is a property of neither point, which is
  // how this answers ADR-0160 §U0's admission rule instead of spending it.
  //
  // **Where the journey starts.** The leg is between two SCHEDULED stops, which is what makes
  // it a fact about the plan rather than a claim about a person: during an event the schedule
  // says you are at that event's place, and in a gap it says the last thing that started is
  // where it left you. That is the same leg `DayJoinRow` measures a hole with (§V1.1), so the
  // day row's leave-by and the board's cannot differ.
  //
  // The now point's own `placeId` is read from the horizon rather than re-resolved, because
  // mid-span it already resolves to where you are GOING (`midSpanEventId`) — a flight in the
  // air measures the leg out of the airport it lands at, not the one it left.
  //
  // Scoped to the CLOCK's own day and not to `activeDate`: the board is the live surface, so
  // swiping the day strip to tomorrow must not change where the journey it draws starts from.
  //
  // **And on a morning before anything has started, the bed** (§AD, built in M6a). Until then the
  // clock's own day had no started stop, so the board drew no journey at all on the read where
  // "when do I have to leave" is asked most — while the one position the plan is surest of, the
  // hotel you woke in, sat one derivation away. `dayBookendStays` is that derivation, and the day
  // list's own first leg reads it too, so the two surfaces start their morning in one place.
  const wokeIn = useMemo(() => dayBookendStays(events, today).woke, [events, today]);
  // **AND A JOURNEY THAT CROSSES A NIGHT STARTS FROM THE BED, NOT FROM TODAY'S LAST STOP** (field
  // report, 2026-09-12). The night board's `הבא בתור` is TOMORROW's first stop (ADR-0214 §7) and
  // the leg into it was still measured from wherever today left you — so the board read
  // `נסיעה · ~1:36 שע׳ · צאו ב־05:33` off the previous evening's last waterfall while the day view
  // one tab away, measuring the same morning out of the hotel, read `~1:02 שע׳ · יציאה עד 06:08`.
  // ADR-0159 §1 forbids the two surfaces differing about a FACT, and when to leave is a fact.
  //
  // The bed is the destination day's own `woke` — literally the row `DayView` draws its first leg
  // out of — so the two now measure one morning from one place by construction.
  const nextDate = nextInstant ? todayInTz(tz, new Date(nextInstant)) : undefined;
  const sleepsIn = useMemo(
    () => (nextDate && nextDate > today ? dayBookendStays(events, nextDate).woke : undefined),
    [events, nextDate, today],
  );
  const travelPrev = travelOrigin({
    // The point in progress, handed over rather than applied here: `travelOrigin` owns the
    // precedence now that a night can outrank it, and a precedence split across two files is one
    // the next reader has to reassemble.
    ...(horizon.now[0]?.event ? { nowEvent: horizon.now[0].event } : {}),
    events: events.filter((e) => e.date === today),
    nowMs,
    excludeEventId: shownNext?.id,
    // **Whether a stop's leaving end is somewhere** (ADR-0232 R6) — the same resolution the leg's
    // own coordinates take three lines down, so the origin the plan names and the origin the read
    // is made from cannot disagree about which stops have a place.
    placed: (event) => {
      const id = endpointPlaceId(event, bookings, 'leaving');
      return places.some((p) => p.id === id && p.lat != null && p.lng != null);
    },
    ...(wokeIn ? { wokeIn } : {}),
    ...(sleepsIn ? { sleepsIn } : {}),
  });
  /** **THE LEG, AS TWO ROWS** (ADR-0206 §AQ) — and it is two ROWS rather than two coordinates
   *  because that is the only shape the day's own derivation can be asked about. The board used to
   *  resolve its own places, its own mode and its own estimate here, which is how it ended up
   *  reading a leg somebody had declared a drive as a walk (§AQ2). */
  const originEvent = travelPrev.event;
  const destEvent = horizon.next?.event;
  /** **`endpointPlaceId`'s inversion, asked the right way round** (`lib/day-travel.ts`). This line
   *  read `eventPlaceId(prevEvent, booking)` — whose default is `arriving` — so the leg out of a
   *  flight you had just got off started at the airport it TOOK OFF from. Where the now point
   *  supplies the origin the two agree by construction: `heroHorizon` passes `heading` for the
   *  mid-span event, which is the only transport row that can be in progress. */
  const travelFromId = originEvent ? endpointPlaceId(originEvent, bookings, 'leaving') : undefined;
  // **And whether the plan may still claim it** (ADR-0208 §2). A skipped stop is still the last
  // thing that started, so it is still where the plan left you — except the group has said they
  // did not go, which denies exactly that. Only when the leg actually starts from that stop: an
  // in-progress point supplies its own place, and `deriveNow` never hands back a skipped one —
  // which `travelOrigin` now answers for itself, since it is handed that point.
  const originDenied = travelPrev.denied;
  const travelToId = horizon.next?.placeId;
  const coordOf = (placeId?: string) => {
    const place = placeId ? places.find((p) => p.id === placeId) : undefined;
    return place?.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : undefined;
  };
  const travelFrom = coordOf(travelFromId);
  const travelTo = coordOf(travelToId);
  // Two stops that are one place is not a journey — and `ROUTE_MIN_CROW_M` would refuse it
  // anyway, so asking costs a request to be told what we already know.
  const travelLeg =
    travelFrom && travelTo && travelFromId !== travelToId
      ? { from: travelFrom, to: travelTo }
      : null;
  /** The same leg as two ROWS, which is what `useDayTravelReads` is asked about. `travelLeg` above
   *  stays coordinates because it answers a different question — where the traveller IS (§1's
   *  stance) — and a fix is never an input to an estimate. */
  const heroLeg: DayLeg | null =
    originEvent && destEvent
      ? {
          from: originEvent,
          to: destEvent,
          // **THERE IS NO WINDOW OUT OF A BED** (ADR-0206 §AF3), and the board's origin can be
          // one: the morning before anything has started (§AD), the night the next stop is on the
          // other side of, and the check-in evening whose hotel is simply the latest thing to have
          // started. The flag is what stops `legDepartAfterMs` reading a check-out — days away —
          // as the instant this journey may leave, and the claim answers it for all three.
          ...(travelPrev.isStay ? { fromIsStay: true } : {}),
        }
      : null;
  // ── WHAT A DEVICE POSITION LETS THIS SURFACE CLAIM (ADR-0207) ──────────────
  // Reported twice from a real day: the board said the leave-by had passed while the owner stood
  // ⁦200m⁩ from the door of the next stop, and the Map tab was drawing their blue dot beside that
  // stop's pin at the same moment. The arithmetic was right about the PLAN and wrong about the
  // world, and the app had the answer one tab over.
  //
  // **Requested only where consent already exists, so Home never prompts** (§3). `permission`
  // exists for exactly this: the front door is not an intent to be located, so anyone who has
  // used the Map gets the fix free and anyone who has not sees today's behaviour and is never
  // asked. A prompt here would need its own reason-first card (ADR-0109 §6) and its own decision.
  //
  // **AND ASKED AGAIN WHILE THE LEG IS LIVE** (§4 as amended, 2026-09-20). This screen held its
  // own mount-time `useEffect` and `DayView` held the identical one — two copies of a one-shot
  // against a ⁦2⁩-minute freshness bound, so the board's stance was `unknown` from two minutes
  // after it opened and the day view was right only because a tab switch had just remounted it.
  // `useLiveFix` is that effect, generalised, with the refresh the ADR's own reasoning already
  // assumed (root rule 8: generalise the one-off rather than add a third beside it).
  const geo = useLiveFix(!!travelLeg);
  // **A fix decides what we may CLAIM, and is never an input to an estimate** (§1) — no request
  // is issued from a position, so ADR-0205 §4's place-keyed cache is untouched.
  const stance = travelLeg
    ? travelStance({
        fix:
          geo.coords && geo.fixedAt !== undefined
            ? {
                coords: geo.coords,
                fixedAt: geo.fixedAt,
                ...(geo.accuracyMeters !== undefined ? { accuracyMeters: geo.accuracyMeters } : {}),
              }
            : undefined,
        from: travelLeg.from,
        to: travelLeg.to,
        nowMs,
      })
    : null;
  // **A read needs something to stand on** (ADR-0208 §2). With the plan's claim denied, the
  // clock alone can say nothing about this leg — so it is believed only where a fix puts the
  // traveller ON it, at either end or between them. `unknown` (no consent, a stale fix, a leg
  // too short to resolve) is §D4's absence: no duration, no leave-by, and above all no late
  // mark. **Gated here rather than at the two reads** because the request is the thing worth
  // not making: a route nobody may be shown is a call against §D8's budget for nothing.
  const originStands =
    !originDenied ||
    stance?.stance === TRAVEL_STANCE.AT_ORIGIN ||
    stance?.stance === TRAVEL_STANCE.EN_ROUTE;
  /**
   * **THE SAME READS THE TWO DAY SURFACES MAKE** (ADR-0206 §AQ2) — the mode of THIS leg and the
   * estimate for it, off `useDayTravelReads`, which is where that pair already lives.
   *
   * The board used to hold its own two: `derivedTravelMode(bookings)` for the mode and
   * `useDayTravel` for the estimate. The first is the **trip's** default, and §AM made the mode
   * per LEG — so a leg somebody had switched to a car kept printing the walk, on the one surface
   * whose whole job is "when do I have to leave". Reported off a real day: the day row said
   * `נסיעה · ~23 דק׳` and the hero said `הליכה · ~1:16 שע׳` about one leg at one moment, and the
   * hero was 53 minutes wrong about the departure because of it.
   *
   * **Passing the mode into the old call would have been the wrong fix**, and the reason is
   * written into `useDayTravelReads`' own `overrides` docblock: a surface that resolves the mode
   * itself is a surface that can forget to, and forgetting is indistinguishable from nobody having
   * declared anything. So the board asks the same function the day asks, about the same leg, and
   * there is no second derivation left to drift.
   *
   * **An empty `legs` asks for nothing at all**, which is the gate the old `stops` was: a route
   * nobody may be shown is a call against §D8's budget for nothing.
   */
  const travelReads = useDayTravelReads({
    tripId: trip.id,
    legs: heroLeg && travelLeg && originStands ? [heroLeg] : [],
    bookings,
    places,
    overrides: travelModeOverrides,
  });
  /** The LEG's mode, falling back to the trip's where there is no leg to ask about — the same
   *  fallback `useDayTravelReads` itself applies, so the word the block leads with is never a
   *  claim about a different journey. */
  const travelMode = heroLeg ? travelReads.modeFor(heroLeg.from, heroLeg.to) : travelReads.mode;
  const travelEstimate =
    heroLeg && travelLeg && originStands ? travelReads.estimateFor(heroLeg.from, heroLeg.to) : null;
  // **`null` is the ordinary answer** (§D4): offline, refused, over the ceiling, still warming,
  // provider down, or a leg somebody declared תחב״צ (§AA4 — a stored mode with no provider, so
  // `estimateFor` cannot be asked for it and this cannot be anything but `null`). Every one of
  // them leaves the board counting to the event and this block absent, with no layout shift.
  //
  // **And a destination with no DEADLINE is not asked at all** (ADR-0206 §AI1). A check-in's
  // `17:00` is the hour the door OPENS; counting back from it would put a departure on the board
  // for a deadline nobody set, and then `באיחור` in the countdown tile's unit slot (ADR-0208 §1)
  // for being late to nothing. The gate is on the REQUEST rather than on the words, which is
  // ADR-0208's own shape — and `null` here is already the ordinary answer every consumer below
  // renders, so nothing else changes.
  const arrivalIsDeadline = !shownNext || isExactEdge(shownNext, 'start');
  const leave =
    nextInstant && arrivalIsDeadline
      ? heroLeaveBy({
          arriveByMs: Date.parse(nextInstant),
          travelSeconds: travelEstimate?.durationSeconds ?? null,
          nowMs,
          // **The floor the day view has always applied and this board never did** (ADR-0206
          // §AJ3). Without it the buffered instant can sit inside the event you are still in, and
          // the board marks you late for a departure nobody could have made — reported as
          // `6 דקות באיחור` beside a day view reading `יציאה 00:30`, off one estimate.
          ...(heroLeg && legDepartAfterMs(heroLeg) !== undefined
            ? { departAfterMs: legDepartAfterMs(heroLeg)! }
            : {}),
        })
      : null;
  // **Somebody said `בדרך`** (§Z5 §M4) — a person telling the app what it should have been able
  // to see. It withdraws the whole leave read: once they are moving, counting to a departure they
  // have already made is the wrong question. It stays the floor, and ADR-0207 is the ceiling.
  const onWayToNext = useOnWay(trip.id, shownNext?.id);

  // **`arrived` and `en-route` answer the leave-by question, so the mark goes** — automatically,
  // with nobody having to press anything (v2 §3d's _"נענה מעצמו"_). `at-origin` is the one arm
  // that makes the app LOUDER, and it is the one that earns it. `unknown` changes nothing.
  const positionAnswered =
    stance?.stance === TRAVEL_STANCE.ARRIVED || stance?.stance === TRAVEL_STANCE.EN_ROUTE;
  const leaveAnswered = onWayToNext || positionAnswered;

  const progress = Math.round(dayProgress(now, tz) * 100);
  // Board countdown: minutes/hours while the next event is under a day out; past
  // that, a calendar-relative day word (ADR-0085) — "מחר"/"מחרתיים" derived from
  // the event's date, not the raw hour-count (37h out is calendar-"מחרתיים",
  // never a duration-"יום"). Durations elsewhere stay counts (formatCountdown).
  const minsToNext = nextInstant ? minutesUntil(nextInstant, now) : 0;
  // Off `nextDate` — the same "which day is the next point on" the journey's origin asks above,
  // asked once.
  const nextDayDelta = nextDate
    ? Math.round(
        (Date.parse(`${nextDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / MS_PER_DAY,
      )
    : 0;
  // **Inside a window, the thing worth counting is the SHUTTING** (ADR-0184 §6): the
  // floor has passed, so a countdown to it would be negative and meaningless, while the
  // ceiling is the moment you can no longer check in at all.
  const closingMins = hero.closing && hero.closesAt ? minutesUntil(hero.closesAt, now) : null;
  // **The board's ONE countdown changes what it counts to** (ADR-0206 §Z1). `עוד 45 דק׳` is not
  // merely less useful once you should be leaving — it is wrong, it says you have 45 minutes —
  // so this is a third arm on the ternary above rather than a second tile beside it. The `unit`
  // slot has said what the minutes are left OF since ADR-0184 §6, which is the whole mechanism.
  //
  // Measured on time-to-leave and not time-to-event (§AA1): on the other end the length of the
  // walk would move the swap. Suppressed once somebody says they are moving.
  //
  // `at` rides along because the collision below compares the two CANDIDATES rather than the
  // words they print, and a formatted `H:MM` cannot be compared to a minute count.
  /** The departure this board is counting to, named once (ADR-0226) and spent by both the tile
   *  and the hero's own `צאו ב־` line — so the two cannot be tagged with different instants. */
  const leaveFact: TimeFactClaim | null =
    leave && shownNext
      ? { kind: TIME_FACT.LEAVE_BY, atMs: leave.leaveByMs, zone: tz, of: shownNext.id }
      : null;
  /** **The leave-by has gone by and nothing has withdrawn it** — the gap's `due-out` gate (the
   *  2026-09-15 amendment to ADR-0211 §8), and deliberately the same condition the red tile below
   *  prints on rather than a second one beside it. Two reads of one departure is how the title
   *  and the tile would come to disagree again, which is the defect being fixed. */
  const leavePassed = !!leave && !leaveAnswered && leave.phase === LEAVE_PHASE.PASSED;
  const leaveTile =
    leave && !leaveAnswered && leave.phase !== LEAVE_PHASE.AHEAD
      ? {
          at: leave.minutesToLeave,
          countdown:
            leave.phase === LEAVE_PHASE.PASSED
              ? passedLeaveCountdown(leave)
              : // **The ladder's word STAYS, and `ליציאה` goes below it** (ADR-0208 §1 as amended
                // by ADR-0206 §AR2). This spread the ladder and then overwrote its `unit`, so the
                // tile read `6 · ליציאה` — a number with no measure at all. Reported in one line:
                // _"it says 6 to take off, but 6 what?"_ The passed arm one function up has said
                // all three parts since §1; this is the same slot, two arms apart, and it had one.
                { ...formatCountdown(leave.minutesToLeave), unitBelow: t.board.leaveIn },
        }
      : null;
  // ⚠ **A shutting check-in window and a live leave-by can both be true in one minute**, and
  // this epic inherited the collision rather than creating it (§Z5 §M1). There is ONE tile, so
  // the NEARER NUMBER WINS — drawing both costs 11px of the `הבא בתור` title and breaks it onto
  // a second line at 360px. A passed leave-by is negative, so it is nearer than any window.

  const nowZones = zonesOf(nowEvent);
  // The NEXT slot's instant is a start for an ordinary event but an **end** for a
  // check-out (deriveNow can't surface an end), so its zone follows that edge.
  const nextZones = zonesOf(shownNext);
  const nextZone = nextShownEdge === 'end' ? nextZones?.endZone : nextZones?.startZone;
  /** **The calendar day the NEXT slot's own clock falls on** (ADR-0224 §7). Read in the zone
   *  that clock is rendered in, not the ambient one, so the token and the time it annotates
   *  cannot disagree across a crossing — the same pairing `transitArrivalDay` makes one slot
   *  up. `undefined` when there is no next at all. */
  const nextDay = nextInstant ? todayInTz(nextZone ?? tz, new Date(nextInstant)) : undefined;

  /** **WHAT THE NEXT SLOT'S CLOCK SAYS** (ADR-0227 §C) — a floor as `מ-16:00`, a ceiling as
   *  `עד 11:00`, a window as its two authored numbers, and an exact moment as the bare clock
   *  it always was.
   *
   *  `edgeMeaning` has answered `not-before` for a check-in and `not-after` for a check-out
   *  since ADR-0171, and `.tr-clock[data-bound]` has drawn the open bracket on the DAY row
   *  since ADR-0210 §2 — the board printed a bare `16:00` beside `🔒 קשיח`, and the pair reads
   *  as an appointment you can be late for. One character fixes it, and the character is not
   *  this file's to choose: `edgeTimePhrase` is the app's one answer to this question and had
   *  two callers already (the day's transition row, the ambient strip). This is the third,
   *  not a fourth phrasing (root rule 8).
   *
   *  **It supersedes the `nextRange` special case it replaces, and slightly widens it.** That
   *  branch printed a window only while the next slot WAS the hero booking; the helper asks
   *  `windowBoundOf` unconditionally, exactly as the day row does. So a windowed event that
   *  is merely next now reads as a range here too — which is the board agreeing with the day
   *  rather than a new behaviour, and the isolate comes from the helper for free.
   *
   *  The lift takes this same string (`nextTime={boardNext?.time}`), so both elevations are
   *  one derivation and cannot disagree about what the bound is. */
  const nextTimeText =
    shownNext && nextInstant
      ? edgeTimePhrase(shownNext, nextShownEdge, Date.parse(nextInstant), nextZone ?? tz)
      : undefined;

  /** **§V1.2's read, for the horizon** — `~23 דק׳ · צאו ב־18:37`, where the collapsed board
   *  carries only the one urgent phrase (§Z1's last paragraph).
   *
   *  Three things about the strings, each of which is a rule rather than a preference. The
   *  duration is `approxDuration`'s, so the `~` sits INSIDE the bidi isolate and the number
   *  rounds onto ADR-0114's ladder (§D3/§D5) — `~40` renders `40~` without it. The leave-by is
   *  read in the **live** zone and not the destination's, because it is a moment on the wrist of
   *  whoever is leaving (ADR-0107 §4). And a passed leave-by says only that it passed
   *  (`זמן היציאה עבר ב־18:37`), never `אתם באיחור`: the app has no sensor, a settle mark is not
   *  one, and own-device position wants its own ADR before this surface reads it (§Z5 §M4). */
  const leaveClock = leave ? ltrIsolate(formatTime(new Date(leave.leaveByMs), tz)) : '';
  /** The leave-by's own calendar day in the live zone, when it is not today (ADR-0214 §7). */
  const leaveDayLabel = (() => {
    if (!leave) return undefined;
    const day = todayInTz(tz, new Date(leave.leaveByMs));
    return day === today ? undefined : dayLabel(day, { trip, today });
  })();
  // **§6 — what is LEFT, once the fix says you are on the way.** Scaled by the remaining crow
  // fraction rather than re-routed (§1), and `~` is what says it is an approximation. The
  // alternative was the untouched total, which read as "44 minutes still to walk" two minutes
  // from the door — not more honest but less, because it was confidently wrong.
  const remainingSeconds = stance
    ? remainingTravelSeconds(stance, travelEstimate?.durationSeconds ?? null)
    : null;
  const enRoute = stance?.stance === TRAVEL_STANCE.EN_ROUTE || onWayToNext;
  /** **When we get there, and whether that is late** (2026-09-20) — `heroArrival`, off the same
   *  `remainingSeconds` the lifted hero's journey line already spends. Scoped to the `deadline`
   *  gate the leave-by uses (§AI1): a check-in's hour is when the door opens, and nothing arrives
   *  late to it. `null` on every arm with no position behind it, including a bare `בדרך` mark. */
  const arrival = heroArrival({
    remainingSeconds,
    nowMs,
    ...(nextInstant ? { arriveByMs: Date.parse(nextInstant) } : {}),
    arrivalIsDeadline,
  });
  const heroTravel: HeroLiftTravel | undefined =
    // **Arrived is the one state with nothing to report**, so the block goes entirely rather
    // than saying something quieter about a journey that is over (§2, §D4).
    leave && travelEstimate && stance?.stance !== TRAVEL_STANCE.ARRIVED
      ? {
          // **The mode leads, as the M3 mockup drew it** — §D10's noun-first dodge, and the thing
          // that makes the number mean anything: 40 minutes is a different fact walking and
          // driving. The mode is DERIVED (§Z2), so naming it claims nothing a control has to
          // back; §AA3's three icons are the control's, and M8's.
          mode: t.travelMode[travelMode],
          // **En route the duration slot goes empty**, and that is a correction caught by
          // rendering: printing the remaining time here AND in the labelled run below put the
          // same number on the line twice (`~12 דק׳ · בדרך · נותרו ~12 דק׳`). The bare number is
          // also the exact ambiguity §6 exists to remove — unlabelled, it reads as the leg's
          // length — so the labelled one is the one that survives.
          duration: enRoute
            ? undefined
            : (approxTravelTime(travelEstimate.durationSeconds) ?? undefined),
          leave: enRoute
            ? remainingSeconds !== null
              ? `${t.actions.onWay} · ${t.travel.remaining(approxTravelTime(remainingSeconds) ?? '')}`
              : t.actions.onWay
            : leave.phase === LEAVE_PHASE.PASSED
              ? t.travel.leavePassed(leaveClock)
              : t.travel.leaveAt(leaveClock),
          // **WHICH DAY THAT LEAVE-BY IS ON** (ADR-0214 §7), and it is the third slot of a shape
          // this app has now fixed twice: this line hangs off `horizon.next`, which carries no
          // date filter, so on a finished evening it is already a leave-by for TOMORROW —
          // `צאו ב־06:40`, a bare clock ⁦40px⁩ under a meta row reading `07:12 · מחר`. ADR-0160 §M
          // named the ambiguity for the landing and ADR-0211 §6 fixed it for `הבא בתור`; the same
          // `dayLabel`, the same words, the slot nobody had asked. Absent when the leave-by is
          // today, which is nearly always — and read off the leave-by's own instant rather than
          // the event's date, because those differ exactly when it matters (a ⁦00:20⁩ departure is
          // left for the evening before).
          ...(leaveDayLabel ? { leaveDay: leaveDayLabel } : {}),
          tone: enRoute ? 'on-way' : leave.phase === LEAVE_PHASE.PASSED ? 'miss' : 'time',
          // **`עדיין כאן` — the app saying it CHECKED**, and the only claim a position licenses
          // that the clock could not (§2). Only where the fix actually puts them at the origin.
          ...(stance?.stance === TRAVEL_STANCE.AT_ORIGIN && leave.phase === LEAVE_PHASE.PASSED
            ? { located: t.travel.stillHere }
            : {}),
          // One control, and the tone decides what it does: answer the mark, or take back a mark
          // you set. A nudge you must change tabs to dismiss is a nudge that stays on screen, and
          // a mark with no way out was the second half of the same report (§7).
          ...(shownNext && onWayToNext
            ? {
                action: {
                  label: t.actions.undoSettle,
                  onPress: () => clearOnWay(trip.id, shownNext.id),
                },
              }
            : shownNext && !enRoute && leave.phase === LEAVE_PHASE.PASSED
              ? { action: { label: t.actions.onWay, onPress: () => verbs.onWay(shownNext) } }
              : {}),
        }
      : undefined;

  const wifi = hotelWifi(bookings, events, nowMs);
  // Quick-access derived tiles (ADR-0050): the next confirmation code you'll need
  // (may differ from the board's immediate next event) + WiFi from the hotel
  // booking, shown only while you're checked in (ADR-0088). Each is absent when
  // there's no source; the grid reflows.
  const nextCoded = nextCodedBooking(bookings, events, now.getTime());
  // navigate-to-next (ADR-0106 §6): the fourth tile ADR-0045 held back until places
  // carried real coordinates. Absent when nothing upcoming has a location, so the
  // grid still reflows — a tile that can't route is worse than no tile.
  const nextDest = nextDestination(events, bookings, places, nowMs);
  const quickTileCount = (nextCoded ? 1 : 0) + (wifi ? 1 : 0) + (nextDest ? 1 : 0) + 1; // documents is always present
  const quickCols = Math.min(QUICK_TILE_MAX_COLS, Math.max(2, quickTileCount));

  // ── The tasks band (ADR-0188 §6) ────────────────────────────────────────
  // Derived here and passed down, so the band component stays presentational like every
  // other `ui/`-shaped one. `tasksDueNow` owns "manual only, due today or overdue" —
  // including WHY an automatic check is excluded, which is not a detail a screen re-decides.
  // **Ordered the way the Index orders** (phase 3r): urgent first, then the rest. The band
  // carries no readiness checks (an automatic task's deadline is departure, so mid-trip they
  // would all read overdue), so `orderTaskRows` is handed an empty second half — the point is
  // that ONE function decides what leads, rather than the band keeping a second answer.
  const dueTasks = useMemo(() => {
    const due = tasksDueSoon(tasks, taskClock, settledHosts);
    return orderTaskRows(due, [], taskClock).flatMap((row) =>
      row.kind === 'task' ? [row.task] : [],
    );
  }, [tasks, taskClock, settledHosts]);
  const openTasks = () =>
    navigate(`/?${TAB_PARAM}=${INDEX_TAB}&${FOCUS_PARAM}=${INDEX_FOCUS.TASKS}`);

  // ── Daylight (derived, no provider) — design brief 2026-09-02 ───────────
  // **One evidence, one date, both reads.** The instant comes from the day's
  // COORDINATE anchor and the wall clock from its ZONE, and they are two
  // derivations feeding one printed time — resolving them from different days
  // is how an app prints a sunrise at 21:40 and nobody notices for a month. So
  // `dayAnchorCoord` and the `tz` below both read `zoneEvidence` on `activeDate`.
  const sunAnchor = useMemo(
    () =>
      dayAnchorCoord(
        activeDate,
        zoneEvidence,
        trip.destinationLat != null && trip.destinationLng != null
          ? { lat: trip.destinationLat, lng: trip.destinationLng }
          : undefined,
      ),
    [activeDate, zoneEvidence, trip.destinationLat, trip.destinationLng],
  );
  // Local midnight, in the zone the DAY is lived in — `dayLight` takes an
  // instant rather than a zone precisely so `@waypoint/shared` never has to ask
  // the environment where it is.
  const sunZone = useMemo(
    () => dayAmbientZone(activeDate, zoneEvidence),
    [activeDate, zoneEvidence],
  );
  const sunDayStartMs = useMemo(
    () => Date.parse(zonedIso(activeDate, DAY_MIDNIGHT, sunZone)),
    [activeDate, sunZone],
  );
  const sunLight = useMemo(
    () => (sunAnchor ? dayLight(sunAnchor, sunDayStartMs) : null),
    [sunAnchor, sunDayStartMs],
  );
  // The sun disc marks NOW, and only on a day that has one: browsing a future
  // day must not draw a position the clock is nowhere near — the same call
  // `buildDayGlance` makes when it returns a null `nowFrac`.
  const sunArcModel = useMemo(
    () =>
      sunAnchor && sunLight
        ? sunArc(sunAnchor, sunDayStartMs, sunLight, activeDate === today ? nowMs : null)
        : null,
    [sunAnchor, sunLight, sunDayStartMs, activeDate, today, nowMs],
  );
  const sunSky = useMemo(
    () => (sunLight ? skyStops(sunDayStartMs, sunLight) : null),
    [sunLight, sunDayStartMs],
  );
  // Formatted HERE because the host owns the zone (ADR-0107) and the widget owns
  // no clock — the same contract `RateCard`'s `asOf` states.
  //
  // **The golden hour is the one still AHEAD, not always the evening's.** The
  // first build passed `goldenEvening*` unconditionally and a report off the
  // deployed app at 01:18 caught it: the widget named a band ⁦17⁩ hours away while
  // the morning's was ⁦4½⁩ hours off. `nextGoldenHour` owns the choice, and it
  // takes the same clock the arc's sun disc does — so the chip and the picture
  // cannot disagree about which day is being lived.
  const sunTimes = useMemo(() => {
    const at = (ms: number | null) => (ms === null ? null : formatTime(new Date(ms), sunZone));
    const gold = sunLight ? nextGoldenHour(sunLight, activeDate === today ? nowMs : null) : null;
    return {
      sunrise: at(sunLight?.sunriseMs ?? null),
      sunset: at(sunLight?.sunsetMs ?? null),
      goldenStart: at(gold?.startMs ?? null),
      goldenEnd: at(gold?.endMs ?? null),
    };
  }, [sunLight, sunZone, activeDate, today, nowMs]);

  // ── Weather (the pipe) — ADR-0218, `מבט מהיר`'s FIRST tenant ─────────────
  // **The strip is the itinerary's own days, each named by the place it happens in** (brief
  // §3.2b). That is the one thing a weather app cannot do, and it is why this stays a pipe
  // rather than a tab (ADR-0004): the group is in Tokyo tonight and Hakone tomorrow, and the
  // card says so.
  //
  // The anchor is `dayAnchorCoord` on the SAME `zoneEvidence` the daylight block above reads,
  // per day — so the forecast, the sunrise and the day's clock cannot disagree about where the
  // day is lived. And the shelf life (§4) is applied HERE rather than on the server, because
  // this snapshot is mirrored into Dexie: a bound enforced only server-side would stop applying
  // at exactly the moment it matters.
  // The head's day plus the strip's. `WEATHER_STRIP_DAYS` counts the STRIP, and the head is not
  // one of its tiles (ADR-0218's amendment §C) — the head and a `היום` tile printed the same
  // number twice, which is the duplication ADR-0214 and ADR-0215 each removed.
  const weatherDates = useMemo(
    () => Array.from({ length: WEATHER_STRIP_DAYS + 1 }, (_, i) => addDays(activeDate, i)),
    [activeDate],
  );
  const weather = useMemo(
    () =>
      weatherView({
        dates: weatherDates,
        evidence: zoneEvidence,
        places,
        destination:
          trip.destinationLat != null && trip.destinationLng != null
            ? { lat: trip.destinationLat, lng: trip.destinationLng }
            : undefined,
        destinationName: trip.destination,
        forecast,
        nowMs,
        today,
      }),
    [
      weatherDates,
      zoneEvidence,
      places,
      trip.destinationLat,
      trip.destinationLng,
      trip.destination,
      forecast,
      nowMs,
      today,
    ],
  );
  // Formatted here because the host owns the day's zone and the app's date grammar, and the
  // widget owns no clock — the same contract `RateCard`'s `asOf` and `SunWidget`'s `times` state.
  //
  // **The weekday is `weekdayLetter` bare, and the geresh is not ours to add** (owner report,
  // 2026-09-03): ICU's `weekday: 'narrow'` already returns `ש׳` for Hebrew, so the wrapper that
  // appended one rendered `ש׳׳`. `App.tsx`'s day pills have always called it bare — which is what
  // makes this strip agree with them rather than merely being un-doubled.
  //
  // `היום` is gone from this map and not merely unused: the head IS today, so no tile is.
  const weatherDayLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const date of weatherDates) {
      labels[date] = date === addDays(today, 1) ? t.weather.tomorrow : weekdayLetter(date);
    }
    return labels;
  }, [weatherDates, today]);

  // ── Day at a glance (derived) — a proportional time rail (lib/glance) ──
  // One derivation, because the Map's route now reads the SAME dawn instant to tell a night
  // arrival from an early start (root rule 8) — a copy that drifted would put a stop on one
  // side of dawn here and the other side there.
  const { startMs: day07, endMs: day23 } = dayWindowMs(activeDate, tz);
  // The glance is a **day** surface, so its anchors' shifts read against the day's
  // own ambient zone (the same context both day timelines use) — not the live zone,
  // which would nag on every anchor of a day you're merely browsing.
  const glanceCtx = dayZoneContext(activeDate, zoneEvidence);
  const glance = buildDayGlance(events, activeDate, nowMs, day07, day23, tz, glanceCtx);
  // **Today's rail, as the shared track** (ADR-0215 §2) — the same geometry the night board's
  // strip draws, with this surface's own inks and one thing the lookahead has no use for: a
  // bracketed booking's edge that the rail never had a block for (an ambient stay's check-out)
  // arrives as an instant, so withdrawing ADR-0077's pills cannot delete a moment `remaining` is
  // still counting.
  //
  // **Not memoized, and that is deliberate rather than an omission:** `glance` itself is rebuilt
  // every render (this screen ticks on the clock), so a `useMemo` keyed on it would miss on every
  // pass and read as a claim that it does not. Tomorrow's strip below memoizes for the opposite
  // reason — its inputs really are stable.
  const glanceTrackModel = glanceTrack({ glance, meta: trackMetaFor(events, glance.segs) });
  // Same-day (non-ambient) events drive the day's own end / hard-anchor stats —
  // a multi-night hotel's check-out is days away and must not skew them.
  const sameDayEvents = dayEvents.filter((e) => !isAmbient(e));
  // "Inside a booking now" (ADR-0059 §2): the held span whose span currently contains the
  // clock — a slim, dismissible teal strip subordinate to the hero.
  //
  // **A journey is not something you are "inside" in this sense**, and without the guard a
  // red-eye would be in two places at once the moment the hero learned to keep it: the
  // board saying `בטיסה` and this strip saying `LH692 · יום 1 מתוך 2` underneath. The strip
  // is for a span whose middle is passive, which is exactly `midSpan.kind === 'held'` — so
  // since ADR-0227 §B the SOURCE asks that directly (`heldSpansOnDate`) and the `!isJourney`
  // guard is gone with it, not weakened: a journey can no longer reach this list at all.
  // What the wider source adds is the same-day hire, which is the span §B moves off the
  // board's now-slot and therefore the one that most needs somewhere to land.
  const heldNow = heldSpansOnDate(events, activeDate).find(
    (e) =>
      e.startsAt && e.endsAt && Date.parse(e.startsAt) <= nowMs && nowMs < Date.parse(e.endsAt),
  );
  // **Never both.** §B leaves a held middle on the board when nothing else is running, and
  // this strip is what carries it otherwise — so the one state the wider source newly creates
  // is the one where the board is already saying it, twelve pixels up. One fact, one place.
  const stayNow = heldNow && heldNow.id === transitEvent?.id ? undefined : heldNow;
  // Where the strip's span has got to, computed once for its mono fraction.
  const stayProgress = stayNow ? ambientSpanPosition(stayNow, activeDate) : null;
  // A dismiss persists across reload/navigation but self-expires on the next
  // night or the next hotel: it is keyed to (trip + stay + day), and the strip
  // is hidden only while the stored key still matches the one showing now.
  const stayStripKey = stayNow ? `${trip.id}:${stayNow.id}:${activeDate}` : null;
  const [dismissedStrip, setDismissedStrip] = useState(() =>
    localStorage.getItem(STAY_STRIP_DISMISS_STORAGE_KEY),
  );
  const stayDismissed = stayStripKey != null && dismissedStrip === stayStripKey;
  const dismissStay = () => {
    if (!stayStripKey) return;
    localStorage.setItem(STAY_STRIP_DISMISS_STORAGE_KEY, stayStripKey);
    setDismissedStrip(stayStripKey);
  };
  // **The hard-anchor readout is gone from the card** (ADR-0215 §4) and its derivation with it:
  // when the next thing is hard, that time is what the board prints with a countdown beside it —
  // measured ⁦214px⁩ away on one screen — and on an arrival day the card printed the same clock
  // three times. ADR-0045's "hard anchors matter individually, so this counts leaves rather than
  // blocks" was the right rule for a readout this surface no longer owns; the leaf-level answer
  // now lives on the board, which reads its own next.
  // "Free until" only reads honestly when there's no current event; otherwise the
  // board already says what's on.
  //
  // **And it ends at the DEPARTURE, not at the point** (ADR-0206 §AJ4.1, which this surface
  // never got). `narrowGapForTravel` has shrunk the day's holes by the journey in them since
  // §AJ4 — "the window the strip states ends at the leave-by the block advises" — while the
  // board went on printing the next point's own clock. So one card counted `7 דקות ליציאה` in
  // its tile and said `עד 10:30` two lines above it, off one estimate: the free time ran 15
  // minutes past the departure it was measured from, and both numbers were on screen together
  // (field report, 2026-09-14). ADR-0159 §1 allows the two elevations a difference in POSTURE
  // and forbids one about a FACT, and when the free time ends is a fact.
  //
  // **Off `nextInstant`, which is the second defect underneath it.** Every other line on this
  // card is about `shownNext` — the gap's own read is derived from it — and on the check-out
  // arm above that is a different event at a different instant than `nextEvent`, so the
  // ceiling named a point the card was not about.
  //
  // Three arms leave it reading exactly as it shipped. No estimate is the ORDINARY answer
  // (§D4: absence, never a pessimistic guess), so the raw hole stays the honest statement. A
  // CLAMPED instant is the earliest departure rather than the latest (§AJ2), where `עד` is
  // false rather than merely redundant — so it states no ceiling at all, which is the same
  // `goMs = null` `narrowGapForTravel` takes on that arm, for the same reason. And a ceiling
  // already behind us is withdrawn rather than restated: the tile is saying `באיחור ליציאה`.
  const freeUntilMs = (() => {
    if (nowEvent || !nextInstant) return null;
    if (leave) return leave.clamped ? null : leave.leaveByMs;
    const arrival = Date.parse(nextInstant);
    return Number.isFinite(arrival) ? arrival : null;
  })();
  /** **Tagged with the instant it was derived from** (ADR-0226), so the suite can hold this
   *  ceiling against the departure the tile below it is counting to. The two disagreeing by
   *  exactly the walk plus the buffer is what §BF was, and nothing could see it. */
  const freeUntil =
    freeUntilMs !== null && freeUntilMs > nowMs
      ? statedTime({
          kind: TIME_FACT.FREE_UNTIL,
          atMs: freeUntilMs,
          zone: tz,
          ...(shownNext ? { of: shownNext.id } : {}),
        })
      : null;
  /** `~1:12 שע׳` — `approxTravelTime`'s ladder, the same hedge and the same rounding the lifted
   *  hero's journey line and the day row both print, so one leg is one number on three surfaces. */
  const journeyRemaining =
    remainingSeconds !== null ? (approxTravelTime(remainingSeconds) ?? undefined) : undefined;
  /** `~18:19`, tagged with the instant it was derived from (ADR-0226) so a suite can hold it
   *  against the point's own clock — which is the comparison the `late` ink is made of. The `~`
   *  is inside the isolate, `approxDuration`'s own rule for a hedged number (ADR-0118). */
  const journeyArrival =
    arrival && shownNext
      ? statedTime(
          { kind: TIME_FACT.ARRIVE_AT, atMs: arrival.etaMs, zone: tz, of: shownNext.id },
          (clock) => ltrIsolate(`~${clock}`),
        )
      : null;
  const dayEndMs = sameDayEvents.reduce((max, e) => {
    const end = e.endsAt ? Date.parse(e.endsAt) : e.startsAt ? Date.parse(e.startsAt) : 0;
    return end > max ? end : max;
  }, 0);
  const dayEnd = dayEndMs > 0 ? formatTime(new Date(dayEndMs), tz) : null;
  /** **How far the day flies, and deliberately not how far it drives** (ADR-0215 §6).
   *
   *  `dayAirMeters` is a great-circle sum over stored coordinates: pure, synchronous, offline-safe
   *  (rule 5) and free. The GROUND half is not, and that is why it is absent rather than
   *  forgotten — it is a roll-up of `useDayTravelReads` over every hole in the day, and this
   *  screen asks that hook about **one** leg on purpose: _"an empty `legs` asks for nothing at
   *  all … a route nobody may be shown is a call against §D8's budget for nothing"_. Putting the
   *  day's every gap behind a provider call on the app's most-loaded screen is a cost decision,
   *  not a card layout, and offline it would leave the foot flickering between two shapes. The
   *  real `dayTravelTotal` composes the value, with no journeys and nothing unplaced to claim. */
  const glanceTravel = dayTravelTotal(
    [],
    { unplacedLegs: 0, spanningLegs: 0 },
    dayAirMeters(sameDayEvents, bookings, places),
  );

  const copyWifi = async () => {
    if (wifi && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(wifi.password ?? wifi.network ?? '');
      } catch {
        /* clipboard blocked — still confirm to the user */
      }
    }
    toast(CONTROL_ICON.clipboard, t.quick.wifiCopied);
  };

  // ── Board props (U-03): the screen picks the variant + feeds every slot; the
  // Board owns the markup, states, and the "ועוד N" expander. Title nodes stay
  // here (the screen still renders <EventTitle>), the component takes them as
  // props (dependency direction §12). ──
  const boardVariant: BoardVariant =
    inTransit && transitEvent
      ? 'in-transit'
      : groupSplit
        ? 'group-split'
        : nowEvent
          ? 'now'
          : 'free';
  const boardNowEvent = inTransit && transitEvent ? transitEvent : nowEvent;
  /** **What the now-slot says when nothing is running** (ADR-0211).
   *
   *  Derived here and handed to BOTH elevations, because `Board` and `HeroLift` rendering one
   *  answer is the whole of §2 — ADR-0160 §S had to repair this drift once already.
   *
   *  Every input is something the screen already holds for another reason: `onWayToNext` is the
   *  device mark the leave-by reads, `travelPrev.event` is `travelOrigin`'s answer (which falls
   *  through to the bed exactly when nothing has started today, ADR-0206 §AD), and `today` is
   *  the CLOCK's day rather than `activeDate` — swiping the day strip must not change what the
   *  live surface says about the minute you are in.
   *
   *  **`clockDayEvents` is not `sameDayEvents`**, which is `activeDate`-scoped for the glance.
   *  Same distinction the journey origin above already makes, and for the same reason. */
  const clockDayEvents = useMemo(
    () => events.filter((e) => e.date === today && !isAmbient(e) && e.startsAt),
    [events, today],
  );
  const gapRead = gapCharacter({
    hour: tzParts(now, tz).hour,
    ...(shownNext ? { next: shownNext } : {}),
    today,
    dayHasEvents: clockDayEvents.length > 0,
    // `travelOrigin` reaches the bed only when nothing has started today; asking `wokeIn`
    // directly would claim it all day, which is the stale read `gapCharacter`'s window bound
    // exists to refuse.
    ...(travelPrev.event && travelPrev.event.id === wokeIn?.id ? { wokeIn: travelPrev.event } : {}),
    onWay: onWayToNext,
    leavePassed,
    // **THE FIX REACHES THE TITLE** (2026-09-20). It was computed ⁦600⁩ lines up and spent only on
    // `positionAnswered`, so an `en-route` fix withdrew the leave-by tile and the read fell
    // through to `open` — the board printing `זמן חופשי` at 90 km/h, which is ADR-0211's own
    // thesis one state further along. `GAP_CHARACTER.ON_THE_WAY` has existed since that ADR and
    // nothing but a human press could reach it.
    ...(stance ? { stance: stance.stance } : {}),
  });

  // ── THE TILE (ADR-0206 §Z1) ────────────────────────────────────────────────
  // **Declared here rather than beside the leave-by it extends**, because its first arm asks the
  // gap's CHARACTER and that is resolved above. The ordering of the arms is unchanged; what moved
  // is where the expression sits.
  /**
   * **THE TILE, POINTED AT THE JOURNEY** (2026-09-20) — ADR-0206 §Z1's swap, a third and fourth
   * time, and for its own reason: once a fix says you are on the leg, counting to a departure you
   * have made is the wrong question, and counting to the event says you have ⁦23⁩ minutes when you
   * have ⁦72⁩ of driving. It is one tile that changes what it counts to, never a second box.
   *
   * **The late arm and the meta line are not one fact twice** — the meta says WHEN you land, this
   * says BY HOW MUCH you are past the start, which is the `due-out` precedent exactly (the title
   * carries the state and the tile carries the number). ADR-0211 §8's "would say it twice" was
   * about a title restating a countdown, and it still holds for everything it was written about.
   *
   * It outranks nothing: the ordering below is unchanged, and this arm only ever replaces the
   * count-to-event that had nothing true to say on this state.
   */
  const journeyTile =
    gapRead.kind === GAP_CHARACTER.ON_THE_WAY && remainingSeconds !== null
      ? arrival?.lateMinutes != null
        ? {
            at: -arrival.lateMinutes,
            countdown: {
              ...formatCountdown(arrival.lateMinutes),
              unit: t.board.lateBy(formatCountdown(arrival.lateMinutes).unit),
              unitBelow: t.board.lateToArrival,
              missed: true,
            },
          }
        : {
            at: Math.round(remainingSeconds / 60),
            countdown: {
              ...formatCountdown(Math.max(1, Math.round(remainingSeconds / 60))),
              unitBelow: t.board.toTravel,
            },
          }
      : null;
  const countdown = journeyTile
    ? // **The journey's own number, tagged with where it lands** (ADR-0226), so the suite can
      // hold the tile against the arrival stated two lines above it — which is the pairing §BF
      // was, one slot over.
      {
        ...journeyTile.countdown,
        ...(journeyArrival ? { fact: journeyArrival.fact } : {}),
      }
    : closingMins != null && (leaveTile === null || closingMins <= leaveTile.at)
      ? // **The same defect, one arm over, and it was never reported** (ADR-0206 §AR2). `closesIn`
        // is the precedent `leaveIn` copied — including the overwrite — so a shutting window read
        // `15 · לסגירה`, a number with no measure either. Fixed with it rather than after it: they
        // are one slot, and leaving the sibling wrong is the shape `frontend/CLAUDE.md` names.
        { ...formatCountdown(closingMins), unitBelow: t.board.closesIn }
      : // **The leave-by arm carries what it counts to** (ADR-0226). The window arm above states
        // a closing no day surface prints, and the event arms below count to the point's own
        // `startsAt` — a datum, not a derivation — so this is the one arm with a claim to tag.
        leaveTile
        ? { ...leaveTile.countdown, ...(leaveFact ? { fact: leaveFact } : {}) }
        : !nextInstant
          ? null
          : minsToNext >= MINUTES_PER_DAY
            ? countdownParts(nextDayDelta)
            : formatCountdown(minsToNext);

  // **The morning of departure** (ADR-0221 §3): until the first timed thing starts, the tile is
  // the same split-flap clock the prep hero showed the evening before (`FlapClock`, one
  // component), so the clock hands over from one hero to the other without a gap. Only while
  // the tile counts to the next thing itself — a leave-by or a shutting window keeps its word.
  //
  // **And only to the day's FIRST timed thing** (2026-09-10). `!nowEvent` alone let the flaps
  // come back every time day 1 fell quiet — in the layover between two legs, on the drive to
  // the hotel — so the departure clock was counting to a connection. The clock ends once, at
  // the first thing; from there the trip counts on the `H:MM` ladder like every other day.
  const dayOneClock =
    countdown &&
    !('unitBelow' in countdown && countdown.unitBelow) &&
    !('missed' in countdown && countdown.missed) &&
    !nowEvent &&
    nextInstant &&
    today === trip.startDate &&
    shownNext?.date === today &&
    shownNext.id === firstTimedOn(events, today)?.id &&
    minsToNext < MINUTES_PER_DAY
      ? { ...countdown, flap: { targetMs: Date.parse(nextInstant), nowMs } }
      : countdown;
  // ── TOMORROW, WHEN TODAY'S PLAN IS FINISHED (ADR-0214) ─────────────────────
  // **The clock's day plus one, never `activeDate` plus one.** Swiping the day strip must not
  // change what the live surface says about the minute you are in — the same rule ADR-0211
  // wrote for the gap's own read, and the reason `today` is what this counts from.
  const tomorrowDate = addDays(today, 1);
  // `dayLabel` rather than a literal `מחר`, so the word is the app's one answer to "which day
  // is that" (ADR-0085 / ADR-0176's amendment) and a board that ever points further out says
  // `מחרתיים` instead of lying by a day.
  const tomorrowLabel = dayLabel(tomorrowDate, { trip, today });
  const tomorrowWindow = dayWindowMs(tomorrowDate, tz);
  // Tomorrow's own glance, from the SAME derivation today's rail is built from: `buildDayGlance`
  // already answers for a future date and already knows it has no now (`nowFrac: null`). The
  // zone context is the day's own, not the live one — a shift on tomorrow's anchor is measured
  // against tomorrow's ambient zone, exactly as the glance card does for the day on screen.
  const tomorrowGlance = useMemo(
    () =>
      buildDayGlance(
        events,
        tomorrowDate,
        nowMs,
        tomorrowWindow.startMs,
        tomorrowWindow.endMs,
        tz,
        dayZoneContext(tomorrowDate, zoneEvidence),
      ),
    [events, tomorrowDate, nowMs, tomorrowWindow.startMs, tomorrowWindow.endMs, tz, zoneEvidence],
  );
  // **The two facts a glance segment cannot carry** — the icon (content the group chose) and the
  // commitment (ADR-0011) — resolved by `trackMetaFor`, which is the same lookup today's rail
  // makes above. It moved into `lib/day-track.ts` when the second consumer arrived (ADR-0215 §2):
  // two screens-worth of the same `Map` read is how a strip and a rail start disagreeing about
  // which glyph one event has.
  const tomorrowMeta = useMemo(
    () => trackMetaFor(events, tomorrowGlance.segs),
    [events, tomorrowGlance],
  );
  const tomorrowRibbonModel = useMemo(
    () => tomorrowRibbon({ glance: tomorrowGlance, meta: tomorrowMeta }),
    [tomorrowGlance, tomorrowMeta],
  );
  // **Where tomorrow ends up, and only when it moves** (ADR-0209: a stay is named once). The
  // same bed is on the stay strip at the top of this screen, so repeating it here would be the
  // third printing of one hotel on one screen — measured in the mockup, and the duplication that
  // ADR removed by subtraction.
  const tomorrowSleeps = dayBookendStays(events, tomorrowDate).sleeps;
  const tonightSleeps = dayBookendStays(events, today).sleeps;
  /** **Whether tomorrow is the board's subject at all**, and the gate is the gap's CHARACTER
   *  rather than the clock: `day-done` is the state ADR-0211 already derives for "today had a
   *  plan and it is finished". `empty-day` deliberately does not qualify — a board with nothing
   *  to say about today is not thereby a board about tomorrow — and anything running now, in
   *  transit or split keeps the board it has.
   *
   *  **The second half of the gate is the trip's own window, and only the EMPTY arm needs it.**
   *  Tomorrow having blocks is itself proof that tomorrow belongs to the trip; saying
   *  `מחר · יום פנוי` does not, so on the last night that arm would be inventing a day after
   *  the trip ends. Which is why this is two conditions rather than one, and why a trip whose
   *  `endDate` is stale still gets the strip whenever there is anything real to draw. */
  const dayDone = !nowEvent && !inTransit && !groupSplit && gapRead.kind === GAP_CHARACTER.DAY_DONE;
  const tomorrowInTrip = !trip.endDate || tomorrowDate <= trip.endDate;
  const boardTomorrow: BoardTomorrow | null =
    dayDone && (tomorrowRibbonModel.count > 0 || tomorrowInTrip)
      ? {
          label: tomorrowLabel,
          ribbon: tomorrowRibbonModel,
          ...(tomorrowSleeps && tomorrowSleeps.id !== tonightSleeps?.id
            ? { sleeps: tomorrowSleeps.title }
            : {}),
        }
      : null;
  /** **The two arms that say you are not sitting still** — written out rather than asked of
   *  `gapIsLocative`, which answers a question about the HUE and happens to have the same two
   *  members today. */
  const movingRead =
    gapRead.kind === GAP_CHARACTER.ON_THE_WAY || gapRead.kind === GAP_CHARACTER.ARRIVED;
  const boardGap: BoardGap | null =
    nowEvent || inTransit || groupSplit
      ? null
      : {
          read: gapRead,
          // **The stay's own title, which is how this app names a stay** — `.stay-strip` one
          // surface down renders `<b>{stayNow.title}</b>`, so the hero saying anything else
          // would be two names for one bed (ADR-0138's "one word per thing").
          ...(gapRead.stay ? { stayName: gapRead.stay.title } : {}),
          // `עד HH:MM` — the fact the `free` branch never said while `GlanceCard` said it two
          // inches lower (§5). Only when the gap actually runs to something today.
          //
          // **And never while you are moving** (2026-09-20). This was unconditional on the
          // character, which was invisible while `on-the-way` drew nothing else: the shipped
          // card printed `כרגע · בדרך` over `עד 14:15`, a free-time ceiling for somebody who
          // has already left, and `הגענו` would have printed one for somebody already there.
          // Found by wiring the journey line in beside it. `due-out` excludes itself by
          // arithmetic — its leave-by is in the past, and `freeUntilMs` refuses one.
          ...(freeUntil && !movingRead ? { until: freeUntil } : {}),
          // **THE JOURNEY, ON THE COLLAPSED CARD** (2026-09-20). `heroTravel` below has carried
          // these two facts to the LIFTED hero since §V1.2, and `Board` had no slot for them at
          // all — so the one surface you read from a moving car said less about the drive than
          // the one you have to open. Only on `on-the-way`, and only with a position behind it:
          // a `בדרך` mark says where you are, not how far along, and §D4's absence is the answer
          // for everything else.
          ...(gapRead.kind === GAP_CHARACTER.ON_THE_WAY && (journeyRemaining || journeyArrival)
            ? {
                journey: {
                  ...(journeyRemaining ? { remaining: journeyRemaining } : {}),
                  ...(journeyArrival ? { arrival: journeyArrival } : {}),
                  ...(arrival?.lateMinutes !== null && arrival?.lateMinutes !== undefined
                    ? { late: true }
                    : {}),
                },
              }
            : {}),
        };
  const transit: BoardTransit | undefined =
    inTransit && transitEvent && transitWords
      ? {
          labelKey: hero.labelKey ?? 'arrival',
          liveWord: transitWords.live,
          label: transitWords.label,
          // The event's own glyph rides the rail. Nothing else in the app knows what
          // mode this is, and the user may re-badge it.
          mark: transitEvent.icon,
          arriving,
          endTime: transitEvent.endsAt
            ? formatTime(transitEvent.endsAt, transitZones?.endZone ?? tz)
            : undefined,
          flightNumber: transitFlightNumber,
          progress: transitProgress,
          startTime: transitEvent.startsAt
            ? formatTime(transitEvent.startsAt, transitZones?.startZone ?? tz)
            : undefined,
          fromPlace: transitRoute?.from,
          toPlace: transitRoute?.to,
          remaining: transitRemaining ?? undefined,
          endDay: transitArrivalDay,
          shift: transitZones?.deltaMinutes,
          // A hire mid-hire is not a leg between two places: no rail, no travelling mark,
          // and its end is a deadline (ADR-0163 §4's rule — the verb and the unit belong to
          // the span's own mode — reaching the hero).
          kind: transitWords.kind,
          heldSince:
            transitWords.kind === 'held' && transitEvent.startsAt
              ? formatTime(transitEvent.startsAt, transitZones?.startZone ?? tz)
              : undefined,
        }
      : undefined;
  const boardRow = (e: TripEvent): BoardRow => {
    const z = zonesOf(e);
    return {
      key: e.id,
      icon: e.icon,
      title: <EventTitle event={e} bookings={bookings} places={places} />,
      until: e.endsAt ? formatTime(e.endsAt, z?.endZone ?? tz) : undefined,
      shift: z?.deltaMinutes,
    };
  };
  const splitRows: BoardRow[] = nowAll.map(boardRow);
  const alsoNowRows: BoardRow[] = alsoNow.map((e) => ({
    ...boardRow(e),
    hard: e.kind === EVENT_KIND.HARD,
  }));
  // **The next stop's other places** (ADR-0225 §6) — the horizon's `nextPeers`, in the two
  // shapes the two elevations need: a title for the board's meta line, a titled and timed row
  // for the lift. Derived once here so the collapsed and lifted states name the same peers.
  const nextPeerRows: HeroLiftPeer[] = horizon.nextPeers.map((p) => {
    const zones = eventZones(p.event, zoneCtx);
    return {
      key: p.event.id,
      icon: p.event.icon,
      title: <EventTitle event={p.event} bookings={bookings} places={places} />,
      time: p.event.startsAt
        ? clockRange(
            formatTime(p.event.startsAt, zones.startZone),
            p.event.endsAt ? formatTime(p.event.endsAt, zones.endZone) : undefined,
          )
        : undefined,
    };
  });
  const boardNext: BoardNext | null = shownNext
    ? {
        title: <EventTitle event={shownNext} bookings={bookings} places={places} />,
        icon: shownNext.icon,
        labelKey: nextLabelKey,
        // A window reads as its range; everything else is the one clock it always was.
        time: nextTimeText,
        // **Which day, when it is not today** (ADR-0211 §6). `deriveNow` has no date filter, so
        // this slot has always crossed midnight and never said so — `07:00` at ⁦22:40⁩ reads as
        // this morning. `relativeDayLabel` is the same derivation five other surfaces use, and
        // the same words `BoardTransit.endDay` already puts one row up (ADR-0160 §M).
        //
        // **Off the INSTANT this slot is showing, not off the row it came from** (ADR-0224 §7,
        // from an owner screenshot). This read `shownNext.date`, and for a check-out
        // `shownNext` is the STAY, whose `date` is the CHECK-IN day — so one minute before an
        // 11:00 check-out the board printed `11:00` and `אתמול` on the same line. `nextInstant`
        // is what the clock beside it renders, and `todayInTz` reads it in the same zone the
        // day comparison uses.
        ...(nextDay && nextDay !== today ? { day: dayLabel(nextDay, { trip, today }) } : {}),
        peers: nextPeerRows.map((row) => row.title),
        missed: hero.missed && shownNext === hero.event,
        hard: shownNext.kind === EVENT_KIND.HARD,
        // The gate, while it is due (ADR-0222 §4). It used to REPLACE the code in this slot;
        // ADR-0223 took the code off the board entirely, so it now simply occupies it.
        gate: nextGate,
        // For a zone-crossing flight this is the jump the flight itself makes
        // (destination minus origin), the same number its day-timeline row shows;
        // for anything else it's that event's zone vs where you are.
        shift: nextZones?.deltaMinutes,
      }
    : null;

  return (
    <>
      {/* "Inside a booking now" (ADR-0059 §2): a slim, dismissible teal strip for
          an ambient hotel mid-stay — subordinate to the hero, a quiet reminder.
          The persistent stay signal is the day-view backdrop + the Index. */}
      {stayNow && !stayDismissed && (
        <div className="stay-strip">
          <span className="ss-ic" aria-hidden="true">
            {stayNow.icon ?? DEFAULT_STAY_ICON}
          </span>
          {/* **The verb and the unit are the span's, not lodging's** (ADR-0163 §4). This
              strip fires for any ambient event whose span contains the clock, so a car
              hire reached it and read `שוהים ב־Hertz · לילה 2/5` — wrong twice. A stay
              keeps `שוהים ב־` and its nights; anything else states itself and counts days,
              with no prefix rather than a contrived one (a hire whose company was never
              entered is titled `השכרת רכב`, and `הרכב מ־השכרת רכב` is worse than nothing). */}
          <span className="ss-txt">
            {countsNights(stayNow) && t.glance.stayingPrefix}
            <b>{stayNow.title}</b> ·{' '}
            {countsNights(stayNow) ? t.glance.nightLabel : t.glance.dayLabel}{' '}
            <span className="mono" dir="auto">
              {stayProgress!.position}/{stayProgress!.total}
            </span>
          </span>
          <button
            type="button"
            className="ss-x"
            onClick={dismissStay}
            aria-label={t.glance.dismissStay}
          >
            <Icon name="close" />
          </button>
        </div>
      )}

      {/* THE BOARD — and on the first morning, the plan face it grows out of (ADR-0221 §4).
          The wrapper stays for the life of this mount once the sequence has played, so the
          board is never remounted (a remount replays its power-on); a later mount of Home in
          the same session sees `goingLive` done and renders the board bare. */}
      {goingLive && prepFacts && prepPreview ? (
        <GoingLiveMorph
          stage={goingLive.stage}
          onSkip={skipGoingLive}
          face={
            <PrepHero
              tier={prepFacts.tier}
              countdown={prepFacts.countdown}
              runway={prepFacts.runway}
              eve={prepFacts.eve}
              nowMs={nowMs}
              dates={<PrepDates startDate={trip.startDate} endDate={trip.endDate} />}
              readinessPct={resolvedReadinessPct(automatic)}
              openTasks={prepPreview.open}
              overdue={prepPreview.overdue}
            />
          }
        >
          <Board
            variant={boardVariant}
            lifted={lifted}
            onLift={
              liftable
                ? (el) => {
                    boardEl.current = el;
                    setLifted(true);
                  }
                : undefined
            }
            // **A press with nothing to lift is answered** (ADR-0160 §Q, reversing §A's
            // silence): the board rises 7px and settles, the same beat Plan's prep hero
            // plays — one shared rule, not a second copy (`styles/beats.css`). It stays a
            // `<div>`, so nothing announces a control that cannot open.
            onRebuff={liftable ? undefined : (el) => playBeat(el, BEAT.REBUFF)}
            clock={formatTime(now, tz)}
            nowIcon={boardNowEvent?.icon}
            nowTitle={
              boardNowEvent ? (
                <EventTitle event={boardNowEvent} bookings={bookings} places={places} />
              ) : undefined
            }
            nowKind={nowEvent?.kind === EVENT_KIND.HARD ? 'hard' : 'soft'}
            nowUntil={
              nowEvent?.endsAt ? formatTime(nowEvent.endsAt, nowZones?.endZone ?? tz) : undefined
            }
            nowShift={nowZones?.deltaMinutes}
            conflict={
              conflicts.length > 0
                ? { title: conflicts[0].title, atLabel: formatTime(conflicts[0].startsAt!, tz) }
                : undefined
            }
            transit={transit}
            splitRows={splitRows}
            alsoNow={alsoNowRows}
            next={boardNext}
            countdown={dayOneClock}
            gap={boardGap}
            tomorrow={boardTomorrow}
            progress={progress}
            windowStartHour={hourLabel(DAY_WINDOW.START_HOUR)}
            windowEndHour={hourLabel(DAY_WINDOW.END_HOUR)}
            showRail={!boardGap || gapDrawsDayRail(boardGap.read)}
          />
        </GoingLiveMorph>
      ) : (
        <Board
          variant={boardVariant}
          lifted={lifted}
          onLift={
            liftable
              ? (el) => {
                  boardEl.current = el;
                  setLifted(true);
                }
              : undefined
          }
          // **A press with nothing to lift is answered** (ADR-0160 §Q, reversing §A's
          // silence): the board rises 7px and settles, the same beat Plan's prep hero
          // plays — one shared rule, not a second copy (`styles/beats.css`). It stays a
          // `<div>`, so nothing announces a control that cannot open.
          onRebuff={liftable ? undefined : (el) => playBeat(el, BEAT.REBUFF)}
          clock={formatTime(now, tz)}
          nowIcon={boardNowEvent?.icon}
          nowTitle={
            boardNowEvent ? (
              <EventTitle event={boardNowEvent} bookings={bookings} places={places} />
            ) : undefined
          }
          nowKind={nowEvent?.kind === EVENT_KIND.HARD ? 'hard' : 'soft'}
          nowUntil={
            nowEvent?.endsAt ? formatTime(nowEvent.endsAt, nowZones?.endZone ?? tz) : undefined
          }
          nowShift={nowZones?.deltaMinutes}
          conflict={
            conflicts.length > 0
              ? { title: conflicts[0].title, atLabel: formatTime(conflicts[0].startsAt!, tz) }
              : undefined
          }
          transit={transit}
          splitRows={splitRows}
          alsoNow={alsoNowRows}
          next={boardNext}
          countdown={dayOneClock}
          gap={boardGap}
          tomorrow={boardTomorrow}
          progress={progress}
          windowStartHour={hourLabel(DAY_WINDOW.START_HOUR)}
          windowEndHour={hourLabel(DAY_WINDOW.END_HOUR)}
          showRail={!boardGap || gapDrawsDayRail(boardGap.read)}
        />
      )}

      {/* The board, promoted (ADR-0160). Mounted only while lifted, so it registers
          its back layer exactly when there is something to peel — the rule that
          orders the overlay stack with no reasoning about component trees. */}
      {lifted && (
        <HeroLift
          origin={boardEl.current}
          clock={formatTime(now, tz)}
          liveWord={inTransit ? transitWords?.live : undefined}
          now={horizon.now.map((p, i) => liftPoint(p, `now-${i}`))}
          split={groupSplit}
          next={horizon.next ? liftPoint(horizon.next, 'next') : undefined}
          nextLabel={nextLabelKey ? transitionLabel(nextLabelKey) : undefined}
          nextPeers={nextPeerRows}
          nextTime={boardNext?.time}
          {...(boardNext?.day ? { nextDay: boardNext.day } : {})}
          nextFlightNumber={nextBooking?.flightNumber}
          gap={boardGap}
          tomorrow={boardTomorrow}
          // The Day tab at tomorrow's date, through the same `date` deep link every other
          // hand-off on this screen uses (ADR-0050) — so back resolves from there exactly as it
          // does from a quick tile, and the hero closes behind it.
          onTomorrowDay={() => {
            setLifted(false);
            navigate(`/?${TAB_PARAM}=days&${DAY_PARAM}=${tomorrowDate}`);
          }}
          // The board's own tile, flaps included (ADR-0221 §7's rule on the trip lift): the two
          // elevations may not disagree about what the countdown looks like, any more than about
          // what it counts to.
          countdown={dayOneClock}
          travel={heroTravel}
          then={
            horizon.then
              ? { title: horizon.then.title, time: formatTime(horizon.then.startsAt, tz) }
              : undefined
          }
          foot={
            // The SAME component the collapsed board pins, not a copy of its markup. In
            // transit the foot is EMPTY: the journey's own rail now sits inside the point
            // it describes, and the day rail stays out (ADR-0059 §2 — the flight IS the
            // day's current activity). Pinning the rail here is what made it read as the
            // progress of `הבא בתור`, the block directly above it (session 215).
            // **The same question the collapsed board asks** (ADR-0211 §4). The transit gate was
            // already here for ADR-0059 §2's reason; the night is that reason from the other
            // end, so it is one condition rather than a second one beside it.
            (inTransit && transit) || (boardGap && !gapDrawsDayRail(boardGap.read)) ? undefined : (
              <DayRail
                progress={progress}
                startHour={hourLabel(DAY_WINDOW.START_HOUR)}
                endHour={hourLabel(DAY_WINDOW.END_HOUR)}
              />
            )
          }
          onClose={() => setLifted(false)}
        />
      )}

      {/* The app's ONE viewer, reached from the hero for the first time (ADR-0174 §2/§6).
          It portals above the lifted card and registers its own back layer, so the gesture
          peels the file first and leaves the hero up — which is what you want when you have
          just checked a gate number. */}
      {viewingDoc && (
        <DocumentViewer tripId={trip.id} doc={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}

      {/* **The gate's own way in** (ADR-0222 §7) — one field, one write. It portals above the
          lifted card for the same reason the viewer does, so closing it leaves the hero up. */}
      {gateBooking && <GateSheet booking={gateBooking} onClose={() => setGateBooking(null)} />}

      {/* **The note's own screen, reached from the board** (ADR-0235 §5) — the container
          ADR-0202 built, mounted here for the first time outside `HostNotes` and the notes
          screen. `noteHost` resolves the host from the note's own FKs, which is the same
          lookup both of those go through, so the bar names the host the same way they do.
          No `onEdit`: the board is a read surface, and ADR-0153 §4 already puts the editor
          one surface further in. */}
      {readingNote && (
        <NoteFullScreen
          note={readingNote}
          host={noteHost(readingNote, noteHosts)}
          users={users}
          now={now}
          onEdit={() => {
            setEditingNote(readingNote);
            setReadingNote(null);
          }}
          onClose={() => setReadingNote(null)}
        />
      )}
      {/* The editor the reader's foot reaches, so a note found on the board can be fixed
          where it was found. `host` is resolved rather than passed: the sheet states the
          category the note inherits, and inventing one here would be the second derivation
          of a fact ADR-0152 §5 keeps in one place. */}
      {editingNote && (
        <NoteSheet
          note={editingNote}
          host={noteHost(editingNote, noteHosts)}
          onSave={(draft) => {
            const note = editingNote;
            setEditingNote(null);
            void noteVerbs.updateNote(note.id, draft);
          }}
          onClose={() => setEditingNote(null)}
        />
      )}

      {/* **THE TASKS BAND** (ADR-0188 §6, brief §11) — above quick-access on purpose: this
          answers "what do I owe today", which belongs with the board's what-now/what-next
          rather than beside a WiFi code. Absent entirely when nothing is due (ADR-0045), so
          it costs no space on a day with nothing outstanding. */}
      <TripHomeTaskBand
        due={dueTasks}
        users={users}
        subtasks={subtasks}
        clock={taskClock}
        onTick={(task) => void taskVerbs.tickTask(task)}
        // Both land on the tasks SCREEN, not the Index landing — through the same
        // `focus` deep-link the quick tiles above already use (ADR-0050), so back
        // resolves exactly as it does from every other tile.
        onOpen={openTasks}
        onSeeAll={openTasks}
      />

      {/* **THE DAY'S SHAPE, ABOVE THE SHORTCUTS** (ADR-0215 §1). The slot this card had was never
          chosen: ADR-0045 removed the fixture `מבט מהיר` row and put the derived card "in its
          place". This is ADR-0188 §6's own rule applied to the next surface — the board and this
          card are both derived TIME surfaces, where `גישה מהירה`'s tiles are deep links into
          stored data (ADR-0050), so a WiFi code was sitting between the two halves of one
          subject. On an ordinary day (nothing due, no peer edits) both bands above are absent and
          this lands directly under the hero, which is where it belongs and why nothing in
          ADR-0188 §6 had to be re-argued. */}
      <div className="sec-title">{t.glance.title}</div>
      <GlanceCard
        glance={glance}
        track={glanceTrackModel}
        dayEnd={dayEnd}
        travel={glanceTravel}
        onAdd={() => onNavigate?.('days')}
      />

      <div className="sec-title">{t.quick.title}</div>
      {/* ADR-0050: derived tiles (next code, WiFi) deep-link into the Index and
          vanish when there's no source; the managed documents tile is always
          present with a ＋ invite. Grid columns follow the visible-tile count. */}
      <div className="quick" style={{ gridTemplateColumns: `repeat(${quickCols}, 1fr)` }}>
        {nextCoded && (
          <button
            className="qa"
            onClick={() => navigate(`/?${TAB_PARAM}=index&booking=${nextCoded.booking.id}`)}
          >
            <span className="ic">
              <Icon name="ticket" />
            </span>
            <span className="lb">{t.quick.nextTicket}</span>
            {/* **The tile keeps its job and loses its value** (ADR-0223 §4). It was the one
                surface built FOR the code (ADR-0050), and printing it here is exactly what
                "outside the booking" means — so the tile stays a way IN and says which
                booking it goes to instead: the flight's own name where there is one, the
                title otherwise. `.sub` rather than `.code`, because that amber is spent on
                commitment and an identifier is not one. */}
            <span className="sub" dir="auto">
              {nextCoded.booking.flightNumber || nextCoded.booking.title}
            </span>
          </button>
        )}
        {wifi && (
          <button className="qa" onClick={copyWifi}>
            <span className="ic">
              <Icon name="wifi" />
            </span>
            <span className="lb">{t.quick.wifiCode}</span>
            {wifi.network && (
              <span className="sub" dir="auto">
                {wifi.network}
              </span>
            )}
          </button>
        )}
        {/* navigate-to-next: an anchor, not a button — the hand-off out to Maps is
            a real link (long-press/share work, no popup blocker), and it's the same
            deep-link the day cards and the Map rows use (ADR-0106 §F). The subtitle
            names the stop, shortened like every other glanceable surface. */}
        {nextDest && (
          <a className="qa" href={nextDest.url} target="_blank" rel="noopener noreferrer">
            <span className="ic">
              <Icon name="navigate" />
            </span>
            <span className="lb">{t.quick.navigateNext}</span>
            <span className="sub name">
              {placeLabelOf(placeLabels, nextDest.place.id, nextDest.place.name)}
            </span>
          </a>
        )}
        {/* Managed tile: always present. Deep-links to the Index documents
            section (ADR-0050). */}
        <button
          className="qa empty"
          onClick={() => navigate(`/?${TAB_PARAM}=index&${FOCUS_PARAM}=${INDEX_FOCUS.DOCS}`)}
        >
          <span className="ic">
            <Icon name="documents" />
          </span>
          <span className="lb">
            <span className="plus">
              <Icon name="plus" />
            </span>{' '}
            {t.quick.documents}
          </span>
          <span className="sub">{t.quick.docsInvite}</span>
        </button>
      </div>

      {/* `מבט מהיר`, restored on the condition ADR-0045 set (ADR-0180 §3). It was
          removed for being FIXTURES, and §4 of that ADR wrote this outcome down in
          advance: "Weather / FX return as themselves, later … as their own glance
          cards." Daylight is the second tenant; the forecast is the third, and it
          leads once it exists.

          **The order is most-volatile-first** (design brief 2026-09-02 §3.2a): a
          forecast moves hourly and decides what you carry in the next half hour,
          daylight is fixed for the whole day, and a published rate moves once a day
          at most (ADR-0180 §4). A tenant that is absent simply does not take its
          turn — the app already handles that everywhere (ADR-0050's derived tiles,
          `RateCard` returning null on a pair it cannot price).

          The SECTION goes when it has no cards — a heading over nothing is the dead
          space ADR-0045 removed the row for — so the gate is "either tenant", not
          the rate card alone. */}
      {(weather || sunLight || rateCardVisible) && (
        <div className="sec-title">{t.fx.sectionTitle}</div>
      )}
      {/* The section owns the gap between its tenants (`.glance-cards`), because
          neither card carries a margin and the set grows — see `screens.css`. */}
      <div className="glance-cards">
        {/* Each card now carries its own source INSIDE it (ADR-0218's amendment §A). ADR-0180
            §9's reasoning is kept and its conclusion is not: a section heading cannot honestly
            attribute two tenants from two sources, so the line stays per-card — it has simply
            moved in from under the card, which only became legal once neither card was itself
            a `<button>`. */}
        {weather && (
          <WeatherCard
            view={weather}
            source={forecast ? { label: forecast.provider, href: forecast.providerUrl } : null}
            dayLabels={weatherDayLabels}
          />
        )}
        {sunLight && sunArcModel && sunSky && (
          <SunWidget light={sunLight} arc={sunArcModel} sky={sunSky} times={sunTimes} />
        )}
        {rateCardVisible && (
          <RateCard
            fx={fxRates}
            from={trip.currency}
            to={homeCurrency}
            asOf={formatDayMonth(fxRates!.publishedAt)}
            onOpen={() => setConverting(true)}
          />
        )}
      </div>

      {converting && trip.currency && homeCurrency && (
        <ConverterSheet
          fx={fxRates}
          from={converterFrom ?? trip.currency}
          to={converterTo ?? homeCurrency}
          asOf={fxRates ? formatDayMonth(fxRates.publishedAt) : ''}
          canRefresh={canRefreshFx}
          onRefresh={refreshFx}
          onChangeFrom={setConverterFrom}
          onChangeTo={setConverterTo}
          onSwap={() => {
            const a = converterFrom ?? trip.currency!;
            const b = converterTo ?? homeCurrency;
            setConverterFrom(b);
            setConverterTo(a);
          }}
          onClose={() => setConverting(false)}
        />
      )}
    </>
  );
}
