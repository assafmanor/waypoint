// Home — the departure-board hero (the one loud element), a real-data-only
// quick-access grid, and a derived "day at a glance" card. Nothing on this
// screen is a fixture for an unbuilt feature (ADR-0045). "Now/Next" and the
// glance are derived from the clock + events, never stored (ADR-0018).
import { useState, type CSSProperties } from 'react';
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
import { Icon } from '../ui/Icon';
import { NavArrow } from '../ui/NavArrow';
import { EventTitle } from '../ui/EventTitle';
import { useClock } from '../lib/useClock';
import { nextCodedBooking } from '../lib/home-quick';
import { eventRoute } from '../lib/places';
import { TAB_PARAM } from '../state/nav-state';
import {
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
import { transitionLabel } from '../lib/transitions';
import {
  CODE_PREFIX,
  DAY_WINDOW,
  ICONS,
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

/** A marker chip within this fraction of a rail edge anchors inward (to the edge)
 *  instead of centering on its point, so it can't clip off the rail. */
const MARKER_EDGE_FRAC = 0.12;
const markerAnchor = (frac: number): string =>
  frac <= MARKER_EDGE_FRAC ? 'at-start' : frac >= 1 - MARKER_EDGE_FRAC ? 'at-end' : '';

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
  const { trip, bookings, places, events, activeDate } = useTrip();
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
  const [alsoOpen, setAlsoOpen] = useState(false);

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
  const countdown = nextInstant ? formatCountdown(minutesUntil(nextInstant, now)) : null;

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
  const remaining = glance.remaining;
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

      <div className={'board' + (inTransit ? ' transit' : '')}>
        <div className="board-top">
          <div className={'live' + (inTransit ? ' loc' : '')}>
            <span className="blip" />
            {inTransit ? t.board.inTransitLive : t.common.now}
          </div>
          <div className="clock" dir="ltr">
            {formatTime(now, tz)}
          </div>
        </div>

        {inTransit && transitEvent ? (
          <>
            <div className="now-label loc">{t.board.inTransitLabel}</div>
            <div className="now-title">
              {transitEvent.icon && <span className="board-ic">{transitEvent.icon}</span>}
              <EventTitle event={transitEvent} bookings={bookings} places={places} />
            </div>
            <div className="now-meta">
              <span className={'tlabel loc' + (arriving ? ' emph' : '')}>
                {transitionLabel(hero.labelKey ?? 'arrival')}
              </span>
              {transitEvent.endsAt && <span dir="ltr">{formatTime(transitEvent.endsAt, tz)}</span>}
              {transitCode && (
                <span className="code" dir="ltr">
                  {transitCode}
                </span>
              )}
            </div>
            {transitEvent.startsAt && transitEvent.endsAt && (
              <div className="transit-prog">
                <div className="tp-track">
                  <div className="tp-fill" style={{ width: `${transitProgress * 100}%` }} />
                  <div
                    className="tp-plane"
                    style={{ insetInlineStart: `${transitProgress * 100}%` }}
                  >
                    ✈️
                  </div>
                </div>
                {/* The ends anchor departure and arrival by place + time (ADR-0059
                    §3: from/to, not a name); the middle counts down to landing. */}
                <div className="tp-ends">
                  <span className="tp-end">
                    <span className="mono" dir="ltr">
                      {formatTime(transitEvent.startsAt, tz)}
                    </span>
                    {transitRoute?.from && <span className="pl">{transitRoute.from}</span>}
                  </span>
                  {countdown && (
                    <span className="tp-left">
                      {t.board.until}{' '}
                      <span className="mono" dir="ltr">
                        {formatTime(transitEvent.endsAt, tz)}
                      </span>
                    </span>
                  )}
                  <span className="tp-end end">
                    {transitRoute?.to && <span className="pl">{transitRoute.to}</span>}
                    <span className="mono" dir="ltr">
                      {formatTime(transitEvent.endsAt, tz)}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </>
        ) : groupSplit ? (
          <div className="now-split">
            <div className="now-label">{t.board.concurrentNow}</div>
            <div className="also-list">
              {nowAll.map((e) => (
                <div className="also-row" key={e.id}>
                  {e.icon && <span className="ic">{e.icon}</span>}
                  <span className="nm">
                    <EventTitle event={e} bookings={bookings} places={places} />
                  </span>
                  {e.endsAt && (
                    <span className="tm">
                      {t.board.until} <span dir="ltr">{formatTime(e.endsAt, tz)}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : nowEvent ? (
          <>
            <div className="now-label">
              {nowEvent.kind === EVENT_KIND.HARD ? `${ICONS.lock} ${t.event.hard}` : t.event.soft}
            </div>
            <div className="now-title">
              {nowEvent.icon && <span className="board-ic">{nowEvent.icon}</span>}
              <EventTitle event={nowEvent} bookings={bookings} places={places} />
            </div>
            {nowEvent.endsAt && (
              <div className="now-meta">
                {t.board.until} <span dir="ltr">{formatTime(nowEvent.endsAt, tz)}</span>
              </div>
            )}
            {conflicts.length > 0 && (
              <div className="now-conflict">
                {ICONS.warn}{' '}
                {t.event.conflictWarn(conflicts[0].title, formatTime(conflicts[0].startsAt!, tz))}
              </div>
            )}
            {alsoNow.length > 0 && (
              <div className="also-now">
                <button
                  className="also-toggle"
                  onClick={() => setAlsoOpen((v) => !v)}
                  aria-expanded={alsoOpen}
                >
                  <span className="dot" aria-hidden="true" />
                  {t.board.alsoNow(alsoNow.length)}
                  <span className="chev" aria-hidden="true">
                    <Icon name="caret" dir={alsoOpen ? 'up' : 'down'} />
                  </span>
                </button>
                {alsoOpen && (
                  <div className="also-list">
                    {alsoNow.map((e) => (
                      <div className="also-row" key={e.id}>
                        {e.icon && <span className="ic">{e.icon}</span>}
                        <span className="nm">
                          <EventTitle event={e} bookings={bookings} places={places} />
                        </span>
                        {e.kind === EVENT_KIND.HARD && (
                          <span className="mini-lock" aria-hidden="true">
                            {ICONS.lock}
                          </span>
                        )}
                        {e.endsAt && (
                          <span className="tm">
                            {t.board.until} <span dir="ltr">{formatTime(e.endsAt, tz)}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="now-label">{t.board.freeLabel}</div>
            <div className="now-title">{t.board.freeTitle}</div>
          </>
        )}

        {/* In transit, the transit-progress bar replaces the next-row + day rail
            (the flight IS the current activity). */}
        {!inTransit && (
          <>
            <div className="board-divider" />
            <div className="next-row">
              <div>
                <div className="next-label">{t.board.nextLabel}</div>
                <div className="next-title">
                  {shownNext?.icon && <span className="board-ic">{shownNext.icon}</span>}
                  {shownNext ? (
                    <EventTitle event={shownNext} bookings={bookings} places={places} />
                  ) : (
                    t.board.endOfDay
                  )}
                </div>
                {shownNext && (
                  <div className="next-meta">
                    {/* A bracketed booking leads with its transition label
                        (המראה / צ׳ק-אין …) — the shared grammar (ADR-0059 §3). */}
                    {nextLabelKey && (
                      <span className="tlabel">{transitionLabel(nextLabelKey)}</span>
                    )}
                    {nextInstant && <span dir="ltr">{formatTime(nextInstant, tz)}</span>}
                    {shownNext.kind === EVENT_KIND.HARD && (
                      <span className="lockmini">
                        {ICONS.lock} {t.event.hard}
                      </span>
                    )}
                    {nextCode && (
                      <span className="code" dir="ltr">
                        {nextCode}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {countdown !== null && (
                <div className="countdown">
                  {countdown.value && (
                    <div className="t" dir="ltr">
                      {countdown.value}
                    </div>
                  )}
                  <div className="u">{countdown.unit}</div>
                </div>
              )}
            </div>

            <div className="progress" aria-hidden="true">
              <div className="track">
                <div className="fill" style={{ width: `${progress}%` }} />
                <div className="knob" style={{ insetInlineStart: `${progress}%` }} />
              </div>
              <div className="ends">
                <span dir="ltr">{hourLabel(DAY_WINDOW.START_HOUR)}</span>
                <span>{t.common.now}</span>
                <span dir="ltr">{hourLabel(DAY_WINDOW.END_HOUR)}</span>
              </div>
            </div>
          </>
        )}
      </div>

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
      {glance.empty ? (
        <div className="glance-day empty">
          <div className="ei" aria-hidden="true">
            🗓️
          </div>
          <div className="et">{t.glance.emptyTitle}</div>
          <div className="es">{t.glance.emptySub}</div>
          <button className="ea" onClick={() => onNavigate?.('days')}>
            <span className="plus">{ICONS.add}</span> {t.glance.emptyAdd}
          </button>
        </div>
      ) : (
        <div className="glance-day">
          {/* Amber time-anchors in a dedicated band above the block bar so
              segments can't swallow their labels (ADR-0077). A span (both edges
              today) is a bar + feet under one centered pill; a point (one edge
              today) is a stem + pill carrying the transition word. Anchors stack
              into lanes when they'd overlap and anchor inward near an edge; a
              crowded day collapses to the legs line below instead. */}
          {glance.anchors.length > 0 && !glance.anchorsCollapsed && (
            <div
              className="glance-marks"
              aria-hidden="true"
              style={{ '--lanes': glance.anchorLaneCount } as CSSProperties}
            >
              {glance.anchors.map((a) =>
                a.kind === 'span' ? (
                  <div
                    className={`span-anchor ${markerAnchor((a.startFrac + a.endFrac) / 2)}`}
                    key={a.key}
                    style={
                      {
                        insetInlineStart: `${a.startFrac * 100}%`,
                        width: `${Math.max(0, a.endFrac - a.startFrac) * 100}%`,
                        '--lane': a.lane,
                      } as CSSProperties
                    }
                  >
                    <span className="cap">
                      <span className="achip amber">
                        <span className="mi">{a.icon}</span>{' '}
                        <span className="mono" dir="ltr">
                          {formatTime(new Date(a.startMs), tz)}
                        </span>
                        <NavArrow variant="forward" className="arr" />
                        <span className="mono" dir="ltr">
                          {formatTime(new Date(a.endMs), tz)}
                        </span>
                        {a.nextDay && (
                          <span className="plus1" dir="ltr">
                            {t.glance.nextDay}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="bar" />
                  </div>
                ) : (
                  <div
                    className={`tmark ${markerAnchor(a.frac)}`}
                    key={a.key}
                    style={
                      { insetInlineStart: `${a.frac * 100}%`, '--lane': a.lane } as CSSProperties
                    }
                  >
                    <span className="achip amber">
                      <span className="mi">{a.icon}</span> {transitionLabel(a.labelKey)}{' '}
                      <span className="mono" dir="ltr">
                        {formatTime(new Date(a.timeMs), tz)}
                      </span>
                    </span>
                    <span className="stem" />
                  </div>
                ),
              )}
            </div>
          )}
          <div className="rail" aria-hidden="true">
            {glance.segs.map((s) => (
              <div
                key={s.key}
                className={`seg ${s.phase}${s.composite ? ' multi' : ''}${s.point ? ' point' : ''}${s.spanned ? ' trans' : ''}`}
                style={{
                  insetInlineStart: `${s.startFrac * 100}%`,
                  ...(s.point ? {} : { width: `${Math.max(0, s.endFrac - s.startFrac) * 100}%` }),
                }}
              >
                {s.showCount && (
                  <span className="n">
                    {s.clusterLike ? t.glance.concurrent(s.count) : t.glance.contains(s.count)}
                  </span>
                )}
                {/* a spanned block's "+1" is carried by its span pill above, not here */}
                {s.nextDay && !s.spanned && (
                  <span className="plus1" dir="ltr">
                    {t.glance.nextDay}
                  </span>
                )}
              </div>
            ))}
            {glance.nowFrac !== null && (
              <div className="nowmark" style={{ insetInlineStart: `${glance.nowFrac * 100}%` }} />
            )}
          </div>
          <div className="rail-ends">
            <span dir="ltr">{formatTime(new Date(glance.windowStartMs), tz)}</span>
            <span dir="ltr">{formatTime(new Date(glance.windowEndMs), tz)}</span>
          </div>
          {/* Crowded day (ADR-0077 §D): the anchors couldn't fit in the band, so
              they collapse here to a flow legs line — same amber pill, no overlap. */}
          {glance.anchorsCollapsed && (
            <div className="glance-legs">
              {glance.anchors.map((a) =>
                a.kind === 'span' ? (
                  <span className="achip amber" key={a.key}>
                    <span className="mi">{a.icon}</span>{' '}
                    <span className="mono" dir="ltr">
                      {formatTime(new Date(a.startMs), tz)}
                    </span>
                    <NavArrow variant="forward" className="arr" />
                    <span className="mono" dir="ltr">
                      {formatTime(new Date(a.endMs), tz)}
                    </span>
                    {a.nextDay && (
                      <span className="plus1" dir="ltr">
                        {t.glance.nextDay}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="achip amber" key={a.key}>
                    <span className="mi">{a.icon}</span> {transitionLabel(a.labelKey)}{' '}
                    <span className="mono" dir="ltr">
                      {formatTime(new Date(a.timeMs), tz)}
                    </span>
                  </span>
                ),
              )}
            </div>
          )}
          <div className="lead">
            <div className="big">
              <span className="v" dir="ltr">
                {remaining}
              </span>
              <span className="k">{t.glance.remaining}</span>
            </div>
            {hardAhead && (
              <div className="anchor">
                {ICONS.lock} {t.glance.hardAnchor}
                <br />
                <span className="tm" dir="ltr">
                  {formatTime(hardAhead.startsAt!, tz)}
                </span>
              </div>
            )}
          </div>
          {(freeUntil || dayEnd) && (
            <div className="glance-foot">
              {freeUntil && (
                <span>
                  🕓 {t.glance.freeUntil}{' '}
                  <span className="mono" dir="ltr">
                    {freeUntil}
                  </span>
                </span>
              )}
              {freeUntil && dayEnd && (
                <span className="dot" aria-hidden="true">
                  ·
                </span>
              )}
              {dayEnd && (
                <span>
                  {t.glance.dayEnds}{' '}
                  <b className="mono" dir="ltr">
                    ~{dayEnd}
                  </b>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
