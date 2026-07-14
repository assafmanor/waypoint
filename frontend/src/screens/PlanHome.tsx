// Plan-mode Home — the prep dashboard (modes.md; mockups/plan-mode-v1.html).
// The single loud element is the violet prep hero (countdown + readiness) —
// plan violet, never amber, no pulse (design-language: mode identity, ADR-0028).
//
// Readiness and the checklist are DERIVED from the snapshot, never stored
// (lib/readiness.ts). Only rows we can honestly detect appear; the mockup's
// Gmail / passport / Google-connection rows wait for their features (see the
// DEFERRED prep-dashboard tasks) rather than shipping placeholder counts.
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../state/trip-state';
import { useClock } from '../lib/useClock';
import { daysUntilStart } from '../lib/mode';
import { dayCount, dayPhrase } from '../lib/hebrew';
import { computeReadiness, type ReadinessCheck } from '../lib/readiness';
import { MS_PER_DAY, type TabId } from '../constants';
import { t } from '../i18n/he';

// Trip-local day number (1-based) for a calendar-date string — matches the
// header's day-strip numbering. UTC-midnight diff, no timezone re-reading.
const dayNumberOf = (date: string, startDate: string) =>
  Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / MS_PER_DAY,
  ) + 1;

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const dayMonth = new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const dayOnly = new Intl.DateTimeFormat('he-IL', { day: 'numeric', timeZone: 'UTC' });
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return sameMonth
    ? `${dayOnly.format(start)}–${dayMonth.format(end)}`
    : `${dayMonth.format(start)} – ${dayMonth.format(end)}`;
}

export function PlanHome({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { trip, events, bookings, users, setActiveDate } = useTrip();
  const now = useClock();
  const navigate = useNavigate();

  const days = daysUntilStart(trip, now);
  const countdown = days === null ? null : dayCount(days);
  const total = dayNumberOf(trip.endDate, trip.startDate);
  const readiness = computeReadiness({
    startDate: trip.startDate,
    endDate: trip.endDate,
    events,
    bookings,
    memberCount: users.length,
  });
  const incomplete = readiness.checks.filter((c) => !c.done).length;

  // Each derivable check → its row copy + the one action that resolves it.
  // The CTA targets (Index entry, Plan Day builder, trip settings) are still
  // Placeholder screens in Plan mode — switching to the right tab is honest
  // until those land (DEFERRED task #11).
  const rowFor = (check: ReadinessCheck) => {
    const c = t.planHome.checklist;
    switch (check.id) {
      case 'flights':
        return {
          icon: '✈️',
          title: c.flightsTitle,
          meta: check.done ? c.flightsDoneMeta : c.flightsMissingMeta,
          cta: { label: c.addBooking, onClick: () => onNavigate('index') },
        };
      case 'lodging':
        return {
          icon: '🏨',
          title: c.lodgingTitle,
          meta: check.done ? c.lodgingDoneMeta : c.lodgingMissingMeta,
          cta: { label: c.addBooking, onClick: () => onNavigate('index') },
        };
      case 'itinerary': {
        const nums = readiness.emptyDates.map((d) => dayNumberOf(d, trip.startDate)).join(', ');
        return {
          icon: '📅',
          title: check.done ? c.itineraryDoneTitle : c.itineraryTitle(check.count ?? 0),
          meta: check.done ? c.itineraryDoneMeta : c.itineraryMeta(nums),
          cta: {
            label: c.buildDay,
            onClick: () => {
              if (readiness.emptyDates[0]) setActiveDate(readiness.emptyDates[0]);
              onNavigate('days');
            },
          },
        };
      }
      case 'group':
        return {
          icon: '👥',
          title: check.done ? c.groupTitle : c.groupMissingTitle,
          meta: check.done ? c.groupDoneMeta(users.length) : c.groupMissingMeta,
          cta: { label: c.invite, onClick: () => navigate(`/trip/${trip.id}/settings`) },
        };
    }
  };

  return (
    <>
      <div className="prep">
        <div className="prep-k">{t.planHome.prep.departIn}</div>
        {countdown ? (
          <div className="prep-count">
            {countdown.value && (
              <span className="prep-count-n" dir="ltr">
                {countdown.value}
              </span>
            )}{' '}
            <span className="prep-count-u">{countdown.unit}</span>
          </div>
        ) : (
          <div className="prep-count">{t.planHome.prep.underway}</div>
        )}
        <div className="prep-dates">
          {formatDateRange(trip.startDate, trip.endDate)} <span className="dot">·</span>{' '}
          {dayPhrase(total)}
        </div>
        <div className="prep-ready">
          <div className="prep-ready-top">
            <span>{t.planHome.prep.readiness}</span>
            <b dir="ltr">{readiness.pct}%</b>
          </div>
          <div className="prep-track">
            <div className="prep-fill" style={{ width: `${readiness.pct}%` }} />
          </div>
        </div>
      </div>

      <div className="sec-title">
        {t.planHome.checklist.title}
        <span className="hint">
          {incomplete === 0
            ? t.planHome.checklist.allDone
            : t.planHome.checklist.remaining(incomplete)}
        </span>
      </div>
      <div className="checklist">
        {readiness.checks.map((check) => {
          const row = rowFor(check)!;
          return (
            <div className="chk-row" key={check.id}>
              <div className="chk-ic">{row.icon}</div>
              <div className="chk-main">
                <div className="chk-t">{row.title}</div>
                <div className="chk-m">{row.meta}</div>
              </div>
              {check.done ? (
                <div className="chk-ok">✓ {t.planHome.checklist.done}</div>
              ) : (
                <button className="chk-cta" onClick={row.cta.onClick}>
                  {row.cta.label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="sec-title">{t.planHome.stats.title}</div>
      <div className="prep-stats">
        <div className="prep-stat">
          <div className="prep-stat-v" dir="ltr">
            {bookings.length}
          </div>
          <div className="prep-stat-l">{t.planHome.stats.bookings}</div>
        </div>
        <div className="prep-stat">
          <div className="prep-stat-v" dir="ltr">
            {events.length}
          </div>
          <div className="prep-stat-l">{t.planHome.stats.events}</div>
        </div>
        <div className="prep-stat">
          <div
            className="prep-stat-v"
            dir="ltr"
            style={readiness.emptyDates.length > 0 ? { color: 'var(--miss)' } : undefined}
          >
            {readiness.emptyDates.length}
          </div>
          <div className="prep-stat-l">{t.planHome.stats.emptyDays}</div>
        </div>
      </div>
    </>
  );
}
