// Home — the departure-board hero (the one loud element), a real-data-only
// quick-access grid, and a derived "day at a glance" card. Nothing on this
// screen is a fixture for an unbuilt feature (ADR-0045). "Now/Next" and the
// glance are derived from the clock + events, never stored (ADR-0018).
import { useState } from 'react';
import { EVENT_KIND, TRIP_NOTE_CATEGORY } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useToast } from '../ui/Toast';
import { useClock } from '../lib/useClock';
import {
  dayProgress,
  deriveNow,
  eventPhase,
  formatCountdown,
  formatTime,
  hardConflicts,
  minutesUntil,
  zonedIso,
} from '../lib/time';
import { buildDayGlance } from '../lib/glance';
import { CODE_PREFIX, DAY_WINDOW, ICONS, type TabId } from '../constants';
import { t } from '../i18n/he';

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export function Home({ onNavigate }: { onNavigate?: (tab: TabId) => void }) {
  const { trip, bookings, notes, events, activeDate } = useTrip();
  const toast = useToast();
  const now = useClock();
  const tz = trip.timezone;

  const { now: nowEvent, next: nextEvent, nowAll } = deriveNow(events, now);
  const dayEvents = events.filter((e) => e.date === activeDate);
  const conflicts = nowEvent ? hardConflicts(nowEvent, dayEvents) : [];
  // Concurrency on the board (ADR-0041): one loud hero + a quiet "ועוד N" for the
  // rest, unless several soft events run at once with no hard anchor to lead —
  // then it's a group-split ("עכשיו · במקביל"), shown as equals.
  const alsoNow = nowAll.slice(1);
  const groupSplit = nowAll.length >= 2 && nowAll.every((e) => e.kind === EVENT_KIND.SOFT);
  const [alsoOpen, setAlsoOpen] = useState(false);
  const nextBooking = nextEvent?.bookingId
    ? bookings.find((b) => b.id === nextEvent.bookingId)
    : undefined;
  const nextCode = nextBooking?.confirmationCode
    ? `${CODE_PREFIX}${nextBooking.confirmationCode}`
    : undefined;
  const progress = Math.round(dayProgress(now, tz) * 100);
  const countdown = nextEvent?.startsAt
    ? formatCountdown(minutesUntil(nextEvent.startsAt, now))
    : null;
  const wifi = notes.find((n) => n.category === TRIP_NOTE_CATEGORY.WIFI);

  // ── Day at a glance (derived) — a proportional time rail (lib/glance) ──
  const day07 = Date.parse(zonedIso(activeDate, hourLabel(DAY_WINDOW.START_HOUR), tz));
  const day23 = Date.parse(zonedIso(activeDate, hourLabel(DAY_WINDOW.END_HOUR), tz));
  const glance = buildDayGlance(dayEvents, now.getTime(), day07, day23, tz);
  const remaining = glance.remaining;
  // Hard anchors matter individually, so this counts leaves, not blocks — the one
  // deliberate roots/leaves exception (ADR-0045).
  const hardAhead = dayEvents
    .filter((e) => e.kind === EVENT_KIND.HARD && e.startsAt)
    .filter((e) => {
      const p = eventPhase(e, now);
      return p === 'now' || p === 'upcoming';
    })
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!))[0];
  // "Free until" only reads honestly when there's no current event; otherwise the
  // board already says what's on. Day-end is the latest instant of the day.
  const freeUntil = !nowEvent && nextEvent?.startsAt ? formatTime(nextEvent.startsAt, tz) : null;
  const dayEndMs = dayEvents.reduce((max, e) => {
    const end = e.endsAt ? Date.parse(e.endsAt) : e.startsAt ? Date.parse(e.startsAt) : 0;
    return end > max ? end : max;
  }, 0);
  const dayEnd = dayEndMs > 0 ? formatTime(new Date(dayEndMs), tz) : null;

  const copyWifi = async () => {
    if (wifi && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(wifi.value);
      } catch {
        /* clipboard blocked — still confirm to the user */
      }
    }
    toast(ICONS.wifi, t.quick.wifiCopied);
  };

  return (
    <>
      <div className="board">
        <div className="board-top">
          <div className="live">
            <span className="blip" />
            {t.common.now}
          </div>
          <div className="clock" dir="ltr">
            {formatTime(now, tz)}
          </div>
        </div>

        {groupSplit ? (
          <div className="now-split">
            <div className="now-label">{t.board.concurrentNow}</div>
            <div className="also-list">
              {nowAll.map((e) => (
                <div className="also-row" key={e.id}>
                  {e.icon && <span className="ic">{e.icon}</span>}
                  <span className="nm">{e.title}</span>
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
              {nowEvent.title}
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
                    {alsoOpen ? '▴' : '▾'}
                  </span>
                </button>
                {alsoOpen && (
                  <div className="also-list">
                    {alsoNow.map((e) => (
                      <div className="also-row" key={e.id}>
                        {e.icon && <span className="ic">{e.icon}</span>}
                        <span className="nm">{e.title}</span>
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

        <div className="board-divider" />
        <div className="next-row">
          <div>
            <div className="next-label">{t.board.nextLabel}</div>
            <div className="next-title">
              {nextEvent?.icon && <span className="board-ic">{nextEvent.icon}</span>}
              {nextEvent ? nextEvent.title : t.board.endOfDay}
            </div>
            {nextEvent && (
              <div className="next-meta">
                <span dir="ltr">{formatTime(nextEvent.startsAt!, tz)}</span>
                {nextEvent.kind === EVENT_KIND.HARD && (
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
      </div>

      <div className="sec-title">{t.quick.title}</div>
      <div className="quick">
        <button className="qa" onClick={() => onNavigate?.('index')}>
          <span className="ic">{ICONS.ticket}</span>
          <span className="lb">{t.quick.nextTicket}</span>
          {nextCode && (
            <span className="code" dir="ltr">
              {nextCode}
            </span>
          )}
        </button>
        {wifi ? (
          <button className="qa" onClick={copyWifi}>
            <span className="ic">{ICONS.wifi}</span>
            <span className="lb">{t.quick.wifiCode}</span>
          </button>
        ) : (
          <button className="qa empty" onClick={() => toast(ICONS.wifi, t.quick.addWifiSoon)}>
            <span className="ic">{ICONS.wifi}</span>
            <span className="lb">
              <span className="plus">{ICONS.add}</span> {t.quick.wifiCode}
            </span>
            <span className="sub">{t.quick.addHint}</span>
          </button>
        )}
        {/* Documents: an honest fixture until the FE supports documents (ADR-0045). */}
        <button className="qa empty" onClick={() => toast(ICONS.documents, t.quick.addDocsSoon)}>
          <span className="ic">{ICONS.documents}</span>
          <span className="lb">
            <span className="plus">{ICONS.add}</span> {t.quick.documents}
          </span>
          <span className="sub">{t.quick.addHint}</span>
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
          <div className="rail" aria-hidden="true">
            {glance.segs.map((s) => (
              <div
                key={s.key}
                className={`seg ${s.phase}${s.composite ? ' multi' : ''}${s.point ? ' point' : ''}`}
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
                {s.nextDay && (
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
