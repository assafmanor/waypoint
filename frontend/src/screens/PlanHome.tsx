// Plan-mode Home — the prep dashboard (modes.md; mockups/plan-home-readiness-v1.html).
// The single loud element is the violet prep hero (countdown + readiness) —
// plan violet, never amber, no pulse (design-language: mode identity, ADR-0028).
//
// Readiness and the checklist are DERIVED from the snapshot, never stored
// (lib/readiness.ts, ADR-0061). Each incomplete row's CTA *does the thing* —
// opens the type-specific create form (flight seeded with the missing leg /
// lodging), seeds the day builder, or the settings invite — not a bare tab
// switch. Completed checks collapse into a summary. Only rows we can honestly
// derive appear; Gmail / Google-connection / WhatsApp stay out (ADR-0045/0004).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BOOKING_TYPE } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useClock } from '../lib/useClock';
import { daysUntilStart, tripPhase } from '../lib/mode';
import { dayCount, dayPhrase } from '../lib/hebrew';
import { computeReadiness, type CheckId, type ReadinessCheck } from '../lib/readiness';
import { BookingSheet, type BookingSeed } from '../ui/BookingSheet';
import { DocumentUploadSheet } from '../ui/DocumentUploadSheet';
import { MS_PER_DAY, type TabId } from '../constants';
import { t } from '../i18n/he';

const CHECK_ICON: Record<CheckId, string> = {
  flights: '✈️',
  lodging: '🏨',
  itinerary: '📅',
  documents: '🛂',
  group: '👥',
};

interface ChecklistRow {
  icon: string;
  title: string;
  meta: string;
  /** Documents row: the per-traveller passport indicator (filled = uploaded). */
  dots?: { have: number; total: number };
  cta: { label: string; warn?: boolean; onClick: () => void };
}

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
  const { trip, events, bookings, places, documents, users, setActiveDate } = useTrip();
  const now = useClock();
  const navigate = useNavigate();
  // A create-form open seeded by a checklist CTA (null = closed). The row that
  // opened it decides the booking type (and, for a flight, the missing leg).
  const [sheetSeed, setSheetSeed] = useState<BookingSeed | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const total = dayNumberOf(trip.endDate, trip.startDate);

  // A finished trip is a calm read-only archive (ADR-0040): no prep dashboard,
  // no countdown, no board — a quiet retrospective and a way back into the days.
  if (tripPhase(trip, now) === 'past') {
    return (
      <>
        <div className="prep prep-past">
          <div className="prep-k">{t.planHome.past.complete}</div>
          <div className="prep-count">{trip.destination}</div>
          <div className="prep-dates">
            {formatDateRange(trip.startDate, trip.endDate)} <span className="dot">·</span>{' '}
            {dayPhrase(total)}
          </div>
        </div>

        <div className="sec-title">{t.planHome.past.summary}</div>
        <div className="prep-stats">
          <div className="prep-stat">
            <div className="prep-stat-v" dir="ltr">
              {total}
            </div>
            <div className="prep-stat-l">{t.planHome.past.days}</div>
          </div>
          <div className="prep-stat">
            <div className="prep-stat-v" dir="ltr">
              {events.length}
            </div>
            <div className="prep-stat-l">{t.planHome.stats.events}</div>
          </div>
          <div className="prep-stat">
            <div className="prep-stat-v" dir="ltr">
              {bookings.length}
            </div>
            <div className="prep-stat-l">{t.planHome.stats.bookings}</div>
          </div>
        </div>

        <button className="addbtn" onClick={() => onNavigate('days')}>
          {t.planHome.past.viewDays}
        </button>
      </>
    );
  }

  const days = daysUntilStart(trip, now);
  const countdown = days === null ? null : dayCount(days);
  const readiness = computeReadiness({
    startDate: trip.startDate,
    endDate: trip.endDate,
    destination: trip.destination,
    events,
    bookings,
    places,
    documents,
    travelerIds: users.map((u) => u.id),
  });
  const incompleteChecks = readiness.checks.filter((c) => !c.done);
  const completedChecks = readiness.checks.filter((c) => c.done);

  // Each check → its row copy + the one action that resolves it. Actionable CTAs
  // open the thing itself (ADR-0061): flight/lodging → the seeded create form,
  // empty-day → the day builder on the first empty day, group → the settings
  // invite, documents → the passport upload sheet.
  const rowFor = (check: ReadinessCheck): ChecklistRow => {
    const c = t.planHome.checklist;
    switch (check.id) {
      case 'flights': {
        // Seed the missing leg: outbound needs a flight TO the destination (seed
        // its `dest`), a return needs one FROM it (seed its `origin`).
        const seed: BookingSeed = !check.hasOutbound
          ? { type: BOOKING_TYPE.FLIGHT, dest: trip.destination }
          : { type: BOOKING_TYPE.FLIGHT, origin: trip.destination };
        const meta = check.done
          ? c.flightsDoneMeta
          : !check.hasOutbound && !check.hasReturn
            ? c.flightsMissingBothMeta
            : check.hasOutbound
              ? c.flightsMissingReturnMeta
              : c.flightsMissingOutboundMeta;
        return {
          icon: CHECK_ICON.flights,
          title: c.flightsTitle,
          meta,
          cta: { label: c.addFlight, warn: true, onClick: () => setSheetSeed(seed) },
        };
      }
      case 'lodging':
        return {
          icon: CHECK_ICON.lodging,
          title: c.lodgingTitle,
          meta: check.done
            ? c.lodgingDoneMeta
            : c.lodgingMissingMeta(check.count ?? 0, check.total ?? 0),
          cta: {
            label: c.addLodging,
            warn: true,
            onClick: () => setSheetSeed({ type: BOOKING_TYPE.HOTEL }),
          },
        };
      case 'itinerary': {
        const nums = readiness.emptyDates.map((d) => dayNumberOf(d, trip.startDate)).join(', ');
        return {
          icon: CHECK_ICON.itinerary,
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
      case 'documents':
        return {
          icon: CHECK_ICON.documents,
          title: c.documentsTitle,
          meta: check.done
            ? c.documentsDoneMeta
            : c.documentsMissingMeta(check.count ?? 0, check.total ?? 0),
          dots: { have: check.count ?? 0, total: check.total ?? 0 },
          cta: { label: c.uploadDocs, onClick: () => setUploadingDoc(true) },
        };
      case 'group':
        return {
          icon: CHECK_ICON.group,
          title: check.done ? c.groupTitle : c.groupMissingTitle,
          meta: check.done ? c.groupDoneMeta(users.length) : c.groupMissingMeta,
          cta: { label: c.invite, onClick: () => navigate(`/trip/${trip.id}/settings`) },
        };
    }
  };

  return (
    <>
      <div className="prep">
        {/* No "היציאה בעוד" label once the trip is underway — the countdown line
            reads "הטיול בעיצומו" on its own (would otherwise concatenate oddly). */}
        {countdown && <div className="prep-k">{t.planHome.prep.departIn}</div>}
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
        <span className="sec-title-end">
          {incompleteChecks.length === 0 && (
            <span className="hint">{t.planHome.checklist.allDone}</span>
          )}
          {completedChecks.length > 0 && (
            <button
              type="button"
              className="chk-toggle"
              onClick={() => setShowCompleted((v) => !v)}
            >
              {showCompleted
                ? t.planHome.checklist.hideCompleted
                : t.planHome.checklist.showCompleted(completedChecks.length)}
            </button>
          )}
        </span>
      </div>

      {incompleteChecks.length > 0 && (
        <div className="checklist">
          {incompleteChecks.map((check) => {
            const row = rowFor(check);
            return (
              <div className="chk-row" key={check.id}>
                <div className="chk-ic">{row.icon}</div>
                <div className="chk-main">
                  <div className="chk-t">{row.title}</div>
                  <div className="chk-m">
                    {row.meta}
                    {row.dots && (
                      <span className="chk-ppl" aria-hidden="true">
                        {Array.from({ length: row.dots.total }).map((_, i) => (
                          <i key={i} className={i < row.dots!.have ? 'on' : undefined} />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className={row.cta.warn ? 'chk-cta warn' : 'chk-cta'}
                  onClick={row.cta.onClick}
                >
                  {row.cta.label}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {completedChecks.length > 0 &&
        (showCompleted ? (
          <div className="checklist">
            {completedChecks.map((check) => {
              const row = rowFor(check);
              return (
                <div className="chk-row" key={check.id}>
                  <div className="chk-ic">{row.icon}</div>
                  <div className="chk-main">
                    <div className="chk-t">{row.title}</div>
                    <div className="chk-m">{row.meta}</div>
                  </div>
                  <div className="chk-ok">✓ {t.planHome.checklist.done}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="chk-done-sum">
            <span className="ok">✓ {t.planHome.checklist.completedSummary}</span>
            {completedChecks.map((check) => (
              <span className="pill" key={check.id}>
                {CHECK_ICON[check.id]} {t.planHome.checklist.summaryLabels[check.id]}
              </span>
            ))}
          </div>
        ))}

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

      {sheetSeed && (
        <BookingSheet booking={null} seed={sheetSeed} onClose={() => setSheetSeed(null)} />
      )}
      {uploadingDoc && (
        <DocumentUploadSheet tripId={trip.id} onClose={() => setUploadingDoc(false)} />
      )}
    </>
  );
}
