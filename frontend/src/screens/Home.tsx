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
  derivedTravelMode,
  EVENT_KIND,
  eventTransitionKeys,
  isAmbient,
  isBracketed,
  isJourney,
  windowBoundOf,
  type DocumentSummary,
  type Task,
  type TripEvent,
} from '@waypoint/shared';
import { ltrIsolate } from '../lib/bidi';
import { useTrip } from '../state/trip-state';
import { useAuth } from '../state/auth-state';
import { useVerbs } from '../state/verbs';
import { useToast } from '../ui/Toast';
import { EventTitle } from '../ui/EventTitle';
import { DocumentViewer } from '../ui/MediaViewer';
import {
  Board,
  ChangeFeed,
  DayRail,
  GlanceCard,
  RateCard,
  TransitProgress,
  type BoardNext,
  type BoardRow,
  type BoardTransit,
  type BoardVariant,
} from '../ui/domain';
import { useClock } from '../lib/useClock';
import { hotelWifi, nextCodedBooking } from '../lib/home-quick';
import { orderTaskRows, tasksDueSoon, type TaskClock } from '../lib/tasks';
import { TripHomeTaskBand } from '../ui/TripHomeTaskBand';
import {
  dayZoneContext,
  eventPlaceId,
  liveZone,
  liveZoneContext,
  eventRoute,
  eventZones,
  mapsDirectionsUrl,
  nextDestination,
} from '../lib/places';
import { placeLabelOf, shortRoute } from '../lib/place-label';
import { usePlaceLabels } from '../state/place-labels';
import { eventMidSpanWords, transitionLabel } from '../lib/transitions';
import { approxDuration, clockShiftSentence, formatDuration } from '../lib/duration';
import { TAB_PARAM, FOCUS_PARAM, INDEX_FOCUS, INDEX_TAB } from '../state/nav-state';
import {
  countdownParts,
  dayProgress,
  deriveNow,
  eventPhase,
  formatCountdown,
  formatDayMonth,
  formatTime,
  hardConflicts,
  minutesUntil,
  relativeDayLabel,
  todayInTz,
  dayWindowMs,
  hourLabel,
} from '../lib/time';
import {
  ambientEventsOnDate,
  ambientSpanPosition,
  buildDayGlance,
  countsNights,
} from '../lib/glance';
import { deriveHeroBooking } from '../lib/hero-booking';
import { LEAVE_PHASE, heroLeaveBy, travelOrigin } from '../lib/hero-travel';
import { TRAVEL_STANCE, remainingTravelSeconds, travelStance } from '../lib/travel-position';
import { useGeolocation } from '../lib/useGeolocation';
import { useDayTravel } from '../lib/travel';
import { clearOnWay, useOnWay } from '../lib/on-way';
import { canLift, heroHorizon, type HeroPoint } from '../lib/hero-horizon';
import { BEAT, playBeat } from '../lib/one-shot';
import {
  HeroLift,
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
} from '../constants';
import { t } from '../i18n/he';
import { Icon } from '../ui/Icon';
import { useSettledHosts } from '../ui/HostTasks';

/** The start transition label key for a bracketed upcoming event (ADR-0063),
 *  by mode — a flight's take-off, a train's departure (via eventTransitionKeys). */
const startTransitionKey = (e: TripEvent): string | undefined =>
  isBracketed(e) ? eventTransitionKeys(e)?.startKey : undefined;

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
    changeFeed,
    dismissChange,
    clearChangeFeed,
    fxRates,
    refreshFx,
    tasks,
    subtasks,
    users,
    zoneCrossings,
    taskVerbs,
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

  // Ambient hotels are backdrop, never a now/next block — once you've checked in
  // they'd otherwise hijack the hero for the whole stay (ADR-0059 §1 / ADR-0054).
  // Their transitions surface via the hero-booking derivation below; before
  // check-in a hotel stays in, so it can be the natural "next" fairly.
  //
  // **A journey is exempt, and that exemption is a red-eye's whole bug.** An overnight
  // flight has an `endDate`, so it is `isMultiDay` and therefore ambient — and this filter
  // dropped it from `deriveNow` the moment it took off, which is why the board stopped
  // seeing it as happening at all. Ambient says how a span RENDERS across days; what its
  // middle IS is `midSpan.kind`, and a journey's middle is you, inside it.
  const scheduleEvents = events.filter(
    (e) => !(isAmbient(e) && !isJourney(e) && nowMs >= Date.parse(e.startsAt!)),
  );
  const { now: nowEvent, next: nextEvent, nowAll, nextAll } = deriveNow(scheduleEvents, now);
  const dayEvents = events.filter((e) => e.date === activeDate);

  // A bracketed booking surfaces on the hero only at its transition moments
  // (ADR-0059 §1): a flight in the air fills the NOW slot (in-transit), a hotel
  // check-in/out or flight departure decorates the NEXT slot.
  const hero = deriveHeroBooking(events, nowMs, today);
  const inTransit = hero.kind === 'in-transit' || hero.kind === 'transition-arrival';
  const arriving = hero.kind === 'transition-arrival';

  // In-transit hero derivations (flight in the air): time-to-landing progress
  // and the code chip.
  const transitEvent = inTransit ? hero.event : undefined;
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
  const transitCode = transitBooking?.confirmationCode
    ? `${CODE_PREFIX}${transitBooking.confirmationCode}`
    : undefined;
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
    return landsOn === today ? undefined : relativeDayLabel(landsOn, today);
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

  const nextBooking = shownNext?.bookingId
    ? bookings.find((b) => b.id === shownNext!.bookingId)
    : undefined;
  const nextCode = nextBooking?.confirmationCode
    ? `${CODE_PREFIX}${nextBooking.confirmationCode}`
    : undefined;
  // ── What a task derivation is read against ─────────────────────────────────
  // Declared here rather than beside the band below, because the lifted hero reads tasks too
  // (ADR-0160 §U) and both must be the SAME clock and the SAME settled-host set — a hero that
  // still offers a task the band has already dropped is two answers to one question.
  const taskClock: TaskClock = useMemo(
    () => ({ nowMs, crossings: zoneCrossings, primaryZone: trip.timezone }),
    [nowMs, zoneCrossings, trip.timezone],
  );
  const settledHosts = useSettledHosts();

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
    events: dayEvents,
    // Mid-flight the point's place is where you are GOING; the authority rule's origin is
    // the airport you have already left (session 215).
    midSpanEventId: transitEvent?.id,
    nowAll,
    nextAll: shownNext ? [shownNext] : nextAll.slice(0, 0),
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
              code: transitCode,
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
      note: p.notes[0]?.body,
      noteMore: Math.max(0, p.notes.length - 1),
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
      ...(isMidSpan
        ? {}
        : {
            onDone: () => verbs.done(p.event),
            onSkip: () => verbs.skip(p.event),
            onUndo: () => verbs.restore(p.event),
          }),
    };
  };

  // ── THE JOURNEY BETWEEN TWO POINTS (ADR-0206 §V1.2 / §Z1) ──────────────────
  // The app's third question — _what do I need in the next 30 minutes_ — answered for the
  // first time, and answered in the slot that is already BETWEEN the horizon's two points
  // (§D2). Not a fifth point-depth item: a journey is a property of neither point, which is
  // how this answers ADR-0160 §U0's admission rule instead of spending it.
  //
  // **What kind of trip this is, derived rather than stored** (§Z2) — the same read the Map
  // makes, off the same function, so a leg cannot be a drive on the canvas and a walk here.
  const travelMode = useMemo(() => derivedTravelMode(bookings), [bookings]);
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
  const travelPrev = travelOrigin({
    events: events.filter((e) => e.date === today),
    nowMs,
    excludeEventId: shownNext?.id,
  });
  const travelFromId =
    horizon.now[0]?.placeId ??
    (travelPrev
      ? eventPlaceId(
          travelPrev,
          travelPrev.bookingId ? bookings.find((b) => b.id === travelPrev.bookingId) : undefined,
        )
      : undefined);
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
  // One leg, every mode the gate admits, so §Z2's switch stays a read from cache when M8 builds
  // it. An empty `stops` asks for nothing at all — the hook's own fingerprint is empty.
  const dayTravel = useDayTravel({
    tripId: trip.id,
    stops: travelLeg ? [travelLeg.from, travelLeg.to] : [],
  });
  const travelEstimate = travelLeg
    ? dayTravel.estimateFor(travelLeg.from, travelLeg.to, travelMode)
    : null;
  // **`null` is the ordinary answer** (§D4): offline, refused, over the ceiling, still warming,
  // provider down, or a leg somebody declared תחב״צ (§AA4 — a stored mode with no provider, so
  // `estimateFor` cannot be asked for it and this cannot be anything but `null`). Every one of
  // them leaves the board counting to the event and this block absent, with no layout shift.
  const leave = nextInstant
    ? heroLeaveBy({
        arriveByMs: Date.parse(nextInstant),
        travelSeconds: travelEstimate?.durationSeconds ?? null,
        nowMs,
      })
    : null;
  // **Somebody said `בדרך`** (§Z5 §M4) — a person telling the app what it should have been able
  // to see. It withdraws the whole leave read: once they are moving, counting to a departure they
  // have already made is the wrong question. It stays the floor, and ADR-0207 is the ceiling.
  const onWayToNext = useOnWay(trip.id, shownNext?.id);

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
  const geo = useGeolocation();
  useEffect(() => {
    if (geo.permission === 'granted' && geo.status === 'idle') geo.request();
  }, [geo]);
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
  const nextDayDelta = nextInstant
    ? Math.round(
        (Date.parse(`${todayInTz(tz, new Date(nextInstant))}T00:00:00Z`) -
          Date.parse(`${today}T00:00:00Z`)) /
          MS_PER_DAY,
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
  const leaveTile =
    leave && !leaveAnswered && leave.phase !== LEAVE_PHASE.AHEAD
      ? {
          at: leave.minutesToLeave,
          countdown:
            leave.phase === LEAVE_PHASE.PASSED
              ? {
                  ...formatCountdown(-leave.minutesToLeave),
                  unit: t.board.sinceLeave,
                  missed: true,
                }
              : { ...formatCountdown(leave.minutesToLeave), unit: t.board.leaveIn },
        }
      : null;
  // ⚠ **A shutting check-in window and a live leave-by can both be true in one minute**, and
  // this epic inherited the collision rather than creating it (§Z5 §M1). There is ONE tile, so
  // the NEARER NUMBER WINS — drawing both costs 11px of the `הבא בתור` title and breaks it onto
  // a second line at 360px. A passed leave-by is negative, so it is nearer than any window.
  const countdown =
    closingMins != null && (leaveTile === null || closingMins <= leaveTile.at)
      ? { ...formatCountdown(closingMins), unit: t.board.closesIn }
      : (leaveTile?.countdown ??
        (!nextInstant
          ? null
          : minsToNext >= MINUTES_PER_DAY
            ? countdownParts(nextDayDelta)
            : formatCountdown(minsToNext)));

  const nowZones = zonesOf(nowEvent);
  // The NEXT slot's instant is a start for an ordinary event but an **end** for a
  // check-out (deriveNow can't surface an end), so its zone follows that edge.
  const nextZones = zonesOf(shownNext);
  const nextZone =
    nextInstant && nextInstant === shownNext?.endsAt ? nextZones?.endZone : nextZones?.startZone;

  /** **The window on the NEXT slot, when the row showing there has one** (ADR-0184 §6).
   *  Same isolate rule as the day row: a range is a run of digits with no strong
   *  character, so the RUN is isolated rather than the box it sits in (ADR-0118). */
  const nextWindowBound =
    shownNext && shownNext === hero.event ? windowBoundOf(shownNext, 'start') : undefined;
  const nextRange =
    nextWindowBound && nextInstant
      ? ltrIsolate(
          `${formatTime(nextInstant, nextZone ?? tz)}–${formatTime(nextWindowBound, nextZone ?? tz)}`,
        )
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
  // **§6 — what is LEFT, once the fix says you are on the way.** Scaled by the remaining crow
  // fraction rather than re-routed (§1), and `~` is what says it is an approximation. The
  // alternative was the untouched total, which read as "44 minutes still to walk" two minutes
  // from the door — not more honest but less, because it was confidently wrong.
  const remainingSeconds = stance
    ? remainingTravelSeconds(stance, travelEstimate?.durationSeconds ?? null)
    : null;
  const enRoute = stance?.stance === TRAVEL_STANCE.EN_ROUTE || onWayToNext;
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
            : (approxDuration(travelEstimate.durationSeconds / 60) ?? undefined),
          leave: enRoute
            ? remainingSeconds !== null
              ? `${t.actions.onWay} · ${t.hero.remaining(approxDuration(remainingSeconds / 60) ?? '')}`
              : t.actions.onWay
            : leave.phase === LEAVE_PHASE.PASSED
              ? t.hero.leavePassed(leaveClock)
              : t.hero.leaveAt(leaveClock),
          tone: enRoute ? 'on-way' : leave.phase === LEAVE_PHASE.PASSED ? 'miss' : 'time',
          // **`עדיין כאן` — the app saying it CHECKED**, and the only claim a position licenses
          // that the clock could not (§2). Only where the fix actually puts them at the origin.
          ...(stance?.stance === TRAVEL_STANCE.AT_ORIGIN && leave.phase === LEAVE_PHASE.PASSED
            ? { located: t.hero.stillHere }
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
  // Ambient-span stays active today (a hotel spanning several nights, ADR-0054).
  // No persistent band on Home (ADR-0064 §A): the hero surfaces the transition
  // moments and the glance draws the check-in/out markers. This only feeds the
  // clock-gated "inside a booking now" strip below.
  const ambientStays = ambientEventsOnDate(events, activeDate);
  // Same-day (non-ambient) events drive the day's own end / hard-anchor stats —
  // a multi-night hotel's check-out is days away and must not skew them.
  const sameDayEvents = dayEvents.filter((e) => !isAmbient(e));
  // "Inside a booking now" (ADR-0059 §2): the ambient stay whose span currently
  // contains the clock — a slim, dismissible teal strip subordinate to the hero.
  //
  // **A journey is not something you are "inside" in this sense**, and without the guard a
  // red-eye would be in two places at once the moment the hero learned to keep it: the
  // board saying `בטיסה` and this strip saying `LH692 · יום 1 מתוך 2` underneath. The strip
  // is for a span whose middle is passive, which is exactly `midSpan.kind === 'held'`.
  const stayNow = ambientStays.find(
    (e) =>
      !isJourney(e) &&
      e.startsAt &&
      e.endsAt &&
      Date.parse(e.startsAt) <= nowMs &&
      nowMs < Date.parse(e.endsAt),
  );
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
  // Hard anchors matter individually, so this counts leaves, not blocks — the one
  // deliberate roots/leaves exception (ADR-0045).
  const hardAhead = sameDayEvents
    .filter((e) => e.kind === EVENT_KIND.HARD && e.startsAt)
    .filter((e) => {
      const p = eventPhase(e, now);
      return p === 'now' || p === 'upcoming';
    })
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!))[0];
  // "Free until" only reads honestly when there's no current event; otherwise the
  // board already says what's on. Day-end is the latest instant of the day.
  const freeUntil = !nowEvent && nextEvent?.startsAt ? formatTime(nextEvent.startsAt, tz) : null;
  const dayEndMs = sameDayEvents.reduce((max, e) => {
    const end = e.endsAt ? Date.parse(e.endsAt) : e.startsAt ? Date.parse(e.startsAt) : 0;
    return end > max ? end : max;
  }, 0);
  const dayEnd = dayEndMs > 0 ? formatTime(new Date(dayEndMs), tz) : null;

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
          code: transitCode,
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
  const boardNext: BoardNext | null = shownNext
    ? {
        title: <EventTitle event={shownNext} bookings={bookings} places={places} />,
        icon: shownNext.icon,
        labelKey: nextLabelKey,
        // A window reads as its range; everything else is the one clock it always was.
        time: nextRange ?? (nextInstant ? formatTime(nextInstant, nextZone ?? tz) : undefined),
        missed: hero.missed && shownNext === hero.event,
        hard: shownNext.kind === EVENT_KIND.HARD,
        code: nextCode,
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
        countdown={countdown}
        progress={progress}
        windowStartHour={hourLabel(DAY_WINDOW.START_HOUR)}
        windowEndHour={hourLabel(DAY_WINDOW.END_HOUR)}
      />

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
          nextTime={boardNext?.time}
          nextCode={nextCode}
          countdown={countdown}
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
            inTransit && transit ? undefined : (
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

      {/* Group change-feed (ADR-0081, U-09): a quiet strip below the board that
          narrates recent peer edits (attributed). Auto-collapses when empty, so
          it costs no space until a peer changes something. Not a second board. */}
      <ChangeFeed
        entries={changeFeed}
        now={nowMs}
        onDismiss={dismissChange}
        onDismissAll={clearChangeFeed}
      />

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
            <span className="code" dir="auto">
              {CODE_PREFIX}
              {nextCoded.booking.confirmationCode}
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

      <div className="sec-title">{t.glance.title}</div>
      <GlanceCard
        glance={glance}
        tz={tz}
        hardAnchorTime={hardAhead ? formatTime(hardAhead.startsAt!, tz) : undefined}
        freeUntil={freeUntil}
        dayEnd={dayEnd}
        onAdd={() => onNavigate?.('days')}
      />

      {/* `מבט מהיר`, restored on the condition ADR-0045 set (ADR-0180 §3). It was
          removed for being FIXTURES, and §4 of that ADR wrote this outcome down in
          advance: "Weather / FX return as themselves, later … as their own glance
          cards." Weather is the next tenant of the same section.

          The SECTION goes when it has no cards — a heading over nothing is the dead
          space ADR-0045 removed the row for — which is why the whole block is gated
          on the card rendering rather than on the section existing. */}
      {rateCardVisible && (
        <>
          <div className="sec-title">{t.fx.sectionTitle}</div>
          <RateCard
            fx={fxRates}
            from={trip.currency}
            to={homeCurrency}
            asOf={formatDayMonth(fxRates!.publishedAt)}
            onOpen={() => setConverting(true)}
          />
          {/* §9: the attribution the source's terms make MANDATORY and visible,
              per card rather than per section — the section's next tenant will
              have a different source, and one shared line would credit it wrong.
              Outside the card because the card is a `<button>`. */}
          <p className="fx-attr">
            <a
              className="fx-attr-link"
              href={fxRates!.providerUrl}
              target="_blank"
              rel="noopener noreferrer"
              dir="auto"
            >
              {fxRates!.provider}
            </a>
          </p>
        </>
      )}

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
