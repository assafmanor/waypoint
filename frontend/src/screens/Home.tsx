// Home — the departure-board hero (the one loud element), quick-access grid,
// and glance cards. "Now/Next" is derived from the clock, never stored (ADR-0018).
import { EVENT_KIND, TRIP_NOTE_CATEGORY } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useToast } from '../ui/Toast';
import { useClock } from '../lib/useClock';
import { deriveNow, dayProgress, formatTime, hardConflicts, minutesUntil } from '../lib/time';
import { formatMoney } from '../lib/money';
import { CODE_PREFIX, DAY_WINDOW, ICONS } from '../constants';
import { t } from '../i18n/he';

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export function Home() {
  const { trip, bookings, glance, notes, events, activeDate } = useTrip();
  const toast = useToast();
  const now = useClock();
  const tz = trip.timezone;

  const { now: nowEvent, next: nextEvent } = deriveNow(events, now);
  const dayEvents = events.filter((e) => e.date === activeDate);
  const conflicts = nowEvent ? hardConflicts(nowEvent, dayEvents) : [];
  const nextBooking = nextEvent?.bookingId
    ? bookings.find((b) => b.id === nextEvent.bookingId)
    : undefined;
  const nextCode = nextBooking?.confirmationCode
    ? `${CODE_PREFIX}${nextBooking.confirmationCode}`
    : undefined;
  const progress = Math.round(dayProgress(now, tz) * 100);
  const countdown = nextEvent?.startsAt ? minutesUntil(nextEvent.startsAt, now) : null;
  const wifi = notes.find((n) => n.category === TRIP_NOTE_CATEGORY.WIFI);
  const budgetPct = Math.min(
    100,
    Math.round((glance.budget.spentMinor / (trip.dailyBudgetMinor || 1)) * 100),
  );
  const overBudget = glance.budget.spentMinor > (trip.dailyBudgetMinor ?? 0);

  const copyWifi = async () => {
    if (wifi && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(wifi.value);
      } catch {
        /* clipboard blocked — still confirm to the user */
      }
    }
    toast(ICONS.wifi, wifi ? t.quick.wifiCopied : t.quick.noWifi);
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

        {nowEvent ? (
          <>
            <div className="now-label">
              {nowEvent.kind === EVENT_KIND.HARD ? `${ICONS.lock} ${t.event.hard}` : t.event.soft}
            </div>
            <div className="now-title">{nowEvent.title}</div>
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
            <div className="next-title">{nextEvent ? nextEvent.title : t.board.endOfDay}</div>
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
              <div className="t" dir="ltr">
                {countdown}
              </div>
              <div className="u">{t.board.minutes}</div>
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
        <button className="qa" onClick={() => toast(ICONS.navigate, t.quick.openingNav)}>
          <span className="ic">{ICONS.navigate}</span>
          <span className="lb">{t.quick.navHotel}</span>
        </button>
        <button
          className="qa"
          onClick={() =>
            toast(ICONS.ticket, nextCode ? t.quick.nextTicketToast(nextCode) : t.quick.noTicket)
          }
        >
          <span className="ic">{ICONS.ticket}</span>
          <span className="lb">{t.quick.nextTicket}</span>
        </button>
        <button className="qa" onClick={() => toast(ICONS.atm, t.quick.atmToast)}>
          <span className="ic">{ICONS.atm}</span>
          <span className="lb">{t.quick.nearbyAtm}</span>
        </button>
        <button className="qa" onClick={copyWifi}>
          <span className="ic">{ICONS.wifi}</span>
          <span className="lb">{t.quick.wifiCode}</span>
        </button>
      </div>

      <div className="sec-title">{t.glance.title}</div>
      <div className="glance">
        <div className="gcard">
          <div className="k">
            {ICONS.weather} {trip.destination}
          </div>
          <div className="v">{glance.weather.tempC}°</div>
          <div className="s">{glance.weather.note}</div>
        </div>
        <div className="gcard">
          <div className="k">
            {ICONS.fx} {t.glance.fx}
          </div>
          <div className="v small">{glance.fx.label}</div>
          <div className={glance.fx.changePct >= 0 ? 's up' : 's down'}>
            {glance.fx.changePct >= 0 ? ICONS.fxUp : ICONS.fxDown}{' '}
            {t.glance.fxChange(glance.fx.changePct)}
          </div>
        </div>
        <div className="gcard wide">
          <div className="k">
            {ICONS.budget} {t.glance.budgetToday}
          </div>
          <div className="v">
            {formatMoney(glance.budget.spentMinor, trip.currency!)}{' '}
            <span className="v-sub">
              / {formatMoney(trip.dailyBudgetMinor ?? 0, trip.currency!)}
            </span>
          </div>
          <div className="budget-bar">
            <i className={overBudget ? 'over' : undefined} style={{ width: `${budgetPct}%` }} />
          </div>
        </div>
      </div>
    </>
  );
}
