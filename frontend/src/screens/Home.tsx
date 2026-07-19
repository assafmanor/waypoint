// Home — the departure-board hero (the one loud element), a real-data-only
// quick-access grid, and a derived "day at a glance" card. Nothing on this
// screen is a fixture for an unbuilt feature (ADR-0045). "Now/Next" and the
// glance are derived from the clock + events, never stored (ADR-0018). The
// board + glance render via the D0 domain components (ui/domain, U-03); this
// screen orchestrates the data and feeds them, layout lives in the components.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BOOKING_TYPE,
  EVENT_KIND,
  eventTransitionKeys,
  isAmbient,
  isBracketed,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useToast } from '../ui/Toast';
import { EventTitle } from '../ui/EventTitle';
import {
  Board,
  ChangeFeed,
  GlanceCard,
  type BoardNext,
  type BoardRow,
  type BoardTransit,
  type BoardVariant,
} from '../ui/domain';
import { useClock } from '../lib/useClock';
import { nextCodedBooking } from '../lib/home-quick';
import { eventRoute } from '../lib/places';
import { TAB_PARAM } from '../state/nav-state';
import {
  countdownParts,
  dayProgress,
  deriveNow,
  eventPhase,
  formatCountdown,
  formatTime,
  hardConflicts,
  minutesUntil,
  todayInTz,
  zonedIso,
} from '../lib/time';
import { buildDayGlance, ambientEventsOnDate } from '../lib/glance';
import { deriveHeroBooking } from '../lib/hero-booking';
import {
  CODE_PREFIX,
  DAY_WINDOW,
  ICONS,
  MINUTES_PER_DAY,
  MS_PER_DAY,
  STAY_STRIP_DISMISS_STORAGE_KEY,
  type TabId,
} from '../constants';
import { t } from '../i18n/he';

/** The start transition label key for a bracketed upcoming event (ADR-0063),
 *  by mode — a flight's take-off, a train's departure (via eventTransitionKeys). */
const startTransitionKey = (e: TripEvent): string | undefined =>
  isBracketed(e) ? eventTransitionKeys(e)?.startKey : undefined;

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** WiFi lives on the hotel booking's details blob now (ADR-0047), not a TripNote.
 *  Derived quick-access: absent when there's no hotel booking with WiFi. */
type HotelWifi = { network?: string; password?: string };
function hotelWifi(bookings: Booking[]): HotelWifi | undefined {
  const details = bookings.find((b) => b.type === BOOKING_TYPE.HOTEL)?.details;
  const wifi = details?.wifi as HotelWifi | undefined;
  if (!wifi || (!wifi.network && !wifi.password)) return undefined;
  return wifi;
}

export function Home({ onNavigate }: { onNavigate?: (tab: TabId) => void }) {
  const { trip, bookings, places, events, activeDate, changeFeed, dismissChange, clearChangeFeed } =
    useTrip();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useClock();
  const tz = trip.timezone;
  const nowMs = now.getTime();
  const today = todayInTz(tz, now);

  // Ambient hotels are backdrop, never a now/next block — once you've checked in
  // they'd otherwise hijack the hero for the whole stay (ADR-0059 §1 / ADR-0054).
  // Their transitions surface via the hero-booking derivation below; before
  // check-in a hotel stays in, so it can be the natural "next" fairly.
  const scheduleEvents = events.filter((e) => !(isAmbient(e) && nowMs >= Date.parse(e.startsAt!)));
  const { now: nowEvent, next: nextEvent, nowAll } = deriveNow(scheduleEvents, now);
  const dayEvents = events.filter((e) => e.date === activeDate);

  // A bracketed booking surfaces on the hero only at its transition moments
  // (ADR-0059 §1): a flight in the air fills the NOW slot (in-transit), a hotel
  // check-in/out or flight departure decorates the NEXT slot.
  const hero = deriveHeroBooking(events, nowMs, today);
  const inTransit = hero.kind === 'in-transit' || hero.kind === 'transition-arrival';
  const arriving = hero.kind === 'transition-arrival';

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
  const countdown = !nextInstant
    ? null
    : minsToNext >= MINUTES_PER_DAY
      ? countdownParts(nextDayDelta)
      : formatCountdown(minsToNext);

  // In-transit hero derivations (flight in the air): time-to-landing progress
  // and the code chip.
  const transitEvent = inTransit ? hero.event : undefined;
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
  const transitRoute = transitEvent ? eventRoute(transitEvent, bookings, places) : null;

  const wifi = hotelWifi(bookings);
  // Quick-access derived tiles (ADR-0050): the next confirmation code you'll need
  // (may differ from the board's immediate next event) + WiFi from the hotel
  // booking. Each is absent when there's no source; the grid reflows.
  const nextCoded = nextCodedBooking(bookings, events, now.getTime());
  const quickTileCount = (nextCoded ? 1 : 0) + (wifi ? 1 : 0) + 1; // documents is always present
  const quickCols = Math.min(3, Math.max(2, quickTileCount));

  // ── Day at a glance (derived) — a proportional time rail (lib/glance) ──
  const day07 = Date.parse(zonedIso(activeDate, hourLabel(DAY_WINDOW.START_HOUR), tz));
  const day23 = Date.parse(zonedIso(activeDate, hourLabel(DAY_WINDOW.END_HOUR), tz));
  const glance = buildDayGlance(events, activeDate, nowMs, day07, day23, tz);
  // Ambient-span stays active today (a hotel spanning several nights, ADR-0054).
  // No persistent band on Home (ADR-0064 §A): the hero surfaces the transition
  // moments and the glance draws the check-in/out markers. This only feeds the
  // clock-gated "inside a booking now" strip below.
  const ambientStays = ambientEventsOnDate(events, activeDate);
  // Same-day (non-ambient) events drive the day's own end / hard-anchor stats —
  // a multi-night hotel's check-out is days away and must not skew them.
  const sameDayEvents = dayEvents.filter((e) => !isAmbient(e));
  const stayNights = (e: TripEvent) =>
    Math.max(1, Math.round((Date.parse(e.endDate!) - Date.parse(e.date)) / MS_PER_DAY));
  const stayNight = (e: TripEvent) =>
    Math.min(
      stayNights(e),
      Math.round((Date.parse(activeDate) - Date.parse(e.date)) / MS_PER_DAY) + 1,
    );
  // "Inside a booking now" (ADR-0059 §2): the ambient stay whose span currently
  // contains the clock — a slim, dismissible teal strip subordinate to the hero.
  const stayNow = ambientStays.find(
    (e) =>
      e.startsAt && e.endsAt && Date.parse(e.startsAt) <= nowMs && nowMs < Date.parse(e.endsAt),
  );
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
    toast(ICONS.wifi, t.quick.wifiCopied);
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
    inTransit && transitEvent
      ? {
          labelKey: hero.labelKey ?? 'arrival',
          arriving,
          endTime: transitEvent.endsAt ? formatTime(transitEvent.endsAt, tz) : undefined,
          code: transitCode,
          progress: transitProgress,
          startTime: transitEvent.startsAt ? formatTime(transitEvent.startsAt, tz) : undefined,
          fromPlace: transitRoute?.from,
          toPlace: transitRoute?.to,
          showCountdown: countdown !== null,
        }
      : undefined;
  const splitRows: BoardRow[] = nowAll.map((e) => ({
    key: e.id,
    icon: e.icon,
    title: <EventTitle event={e} bookings={bookings} places={places} />,
    until: e.endsAt ? formatTime(e.endsAt, tz) : undefined,
  }));
  const alsoNowRows: BoardRow[] = alsoNow.map((e) => ({
    key: e.id,
    icon: e.icon,
    title: <EventTitle event={e} bookings={bookings} places={places} />,
    until: e.endsAt ? formatTime(e.endsAt, tz) : undefined,
    hard: e.kind === EVENT_KIND.HARD,
  }));
  const boardNext: BoardNext | null = shownNext
    ? {
        title: <EventTitle event={shownNext} bookings={bookings} places={places} />,
        icon: shownNext.icon,
        labelKey: nextLabelKey,
        time: nextInstant ? formatTime(nextInstant, tz) : undefined,
        hard: shownNext.kind === EVENT_KIND.HARD,
        code: nextCode,
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
            {stayNow.icon ?? '🏨'}
          </span>
          <span className="ss-txt">
            {t.glance.stayingPrefix}
            <b>{stayNow.title}</b> · {t.glance.nightLabel}{' '}
            <span className="mono" dir="ltr">
              {stayNight(stayNow)}/{stayNights(stayNow)}
            </span>
          </span>
          <button
            type="button"
            className="ss-x"
            onClick={dismissStay}
            aria-label={t.glance.dismissStay}
          >
            ✕
          </button>
        </div>
      )}

      <Board
        variant={boardVariant}
        clock={formatTime(now, tz)}
        nowIcon={boardNowEvent?.icon}
        nowTitle={
          boardNowEvent ? (
            <EventTitle event={boardNowEvent} bookings={bookings} places={places} />
          ) : undefined
        }
        nowKind={nowEvent?.kind === EVENT_KIND.HARD ? 'hard' : 'soft'}
        nowUntil={nowEvent?.endsAt ? formatTime(nowEvent.endsAt, tz) : undefined}
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

      {/* Group change-feed (ADR-0081, U-09): a quiet strip below the board that
          narrates recent peer edits (attributed). Auto-collapses when empty, so
          it costs no space until a peer changes something. Not a second board. */}
      <ChangeFeed
        entries={changeFeed}
        now={nowMs}
        onDismiss={dismissChange}
        onDismissAll={clearChangeFeed}
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
            <span className="ic">{ICONS.ticket}</span>
            <span className="lb">{t.quick.nextTicket}</span>
            <span className="code" dir="ltr">
              {CODE_PREFIX}
              {nextCoded.booking.confirmationCode}
            </span>
          </button>
        )}
        {wifi && (
          <button className="qa" onClick={copyWifi}>
            <span className="ic">{ICONS.wifi}</span>
            <span className="lb">{t.quick.wifiCode}</span>
            {wifi.network && (
              <span className="sub" dir="ltr">
                {wifi.network}
              </span>
            )}
          </button>
        )}
        {/* Managed tile: always present. Deep-links to the Index documents
            section (ADR-0050). */}
        <button className="qa empty" onClick={() => navigate(`/?${TAB_PARAM}=index&focus=docs`)}>
          <span className="ic">{ICONS.documents}</span>
          <span className="lb">
            <span className="plus">{ICONS.add}</span> {t.quick.documents}
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
    </>
  );
}
