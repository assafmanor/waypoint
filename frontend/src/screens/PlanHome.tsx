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
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BOOKING_TYPE, TASK_STATUS } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { BEAT, playBeat } from '../lib/one-shot';
import { useClock } from '../lib/useClock';
import { useCountUp } from '../lib/useCountUp';
import { daysUntilStart, tripPhase } from '../lib/mode';
import { dayPhrase } from '../lib/hebrew';
import { countdownParts, formatTripDates } from '../lib/time';
import { useAutomaticTasks } from '../lib/useAutomaticTasks';
import {
  AUTOMATIC_TASK_ACTION,
  CHECK_ICON,
  draftOverlay,
  isLive,
  type AutomaticTask,
} from '../lib/automatic-tasks';
import { AutomaticTaskRow } from '../ui/AutomaticTaskRow';
import { TaskManageSheet } from '../ui/TaskManageSheet';
import { BookingSheet, type BookingSeed, type BookingSheetDraft } from '../ui/BookingSheet';
import { usePlaceErrandReturn } from '../state/map-scope-state';
import { DAYS_TAB, FOCUS_PARAM, HOME_FOCUS, HOME_TAB } from '../state/nav-state';
import type { Task } from '@waypoint/shared';
import { DocumentUploadSheet } from '../ui/DocumentUploadSheet';
import { StatTile } from '../ui/domain';
import { CollapseToggle, Collapsible } from '../ui/primitives/Collapsible';
import { DOT_SEPARATOR, MS_PER_DAY, type TabId } from '../constants';
import { t } from '../i18n/he';
import { Icon, type IconName } from '../ui/Icon';

// `CHECK_ICON` moved to `lib/automatic-tasks.ts` with the row copy when the tasks screen
// became a second reader of both — the collapsed summary below still uses it, now imported.

// Trip-local day number (1-based) for a calendar-date string — matches the
// header's day-strip numbering. UTC-midnight diff, no timezone re-reading.
const dayNumberOf = (date: string, startDate: string) =>
  Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / MS_PER_DAY,
  ) + 1;

export function PlanHome({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { trip, events, bookings, users, setActiveDate, taskVerbs } = useTrip();
  const now = useClock();
  const navigate = useNavigate();
  const { readiness, automatic, applyVerb } = useAutomaticTasks();
  // The `⋯` on an automatic row, shared with the tasks screen's sheet.
  const [manage, setManage] = useState<Task | null>(null);
  // A create-form open seeded by a checklist CTA (null = closed). The row that
  // opened it decides the booking type (and, for a flight, the missing leg).
  const [sheetSeed, setSheetSeed] = useState<BookingSeed | null>(null);
  // RE-OPENING AFTER A PLACE ERRAND (ADR-0134 §2), through the same shared hook every other
  // form host uses: without it the sheet returns closed and the rest of what was typed is
  // gone, which is the whole reason the errand carries a draft.
  const [bookingDraft, setBookingDraft] = useState<BookingSheetDraft | null>(null);
  usePlaceErrandReturn<BookingSheetDraft>('booking', HOME_TAB, (returned) => {
    if (!returned.draft) return;
    // A seed host: nothing exists to look up, so the draft alone re-opens the sheet.
    setBookingDraft(returned.draft);
  });

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  /** **Arriving from the tasks screen's automatic row** (ADR-0190 §3). Two of the five
   *  checks resolve into a seeded `BookingSheet`, which lives here — so the tap over there
   *  deep-links with the same `focus` param the Index already answers to, and this opens the
   *  sheet on arrival. Cleared after, so back/reload do not re-trigger it. */
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const focus = params.get(FOCUS_PARAM);
    if (focus !== HOME_FOCUS.ADD_FLIGHT && focus !== HOME_FOCUS.ADD_LODGING) return;
    setSheetSeed(
      focus === HOME_FOCUS.ADD_LODGING
        ? { type: BOOKING_TYPE.HOTEL }
        : // No `missingLeg` across a URL: seed the outbound, which is the leg missing in
          // the common case and the one the form can be corrected from either way.
          { type: BOOKING_TYPE.FLIGHT, dest: trip.destination },
    );
    const next = new URLSearchParams(params);
    next.delete(FOCUS_PARAM);
    setParams(next, { replace: true });
  }, [params, setParams, trip.destination]);

  /** The prep hero answers a tap with a beat and nothing else (ADR-0160 §H).
   *
   *  **Not a `<button>`, deliberately.** Trip's board is one because it opens the lifted
   *  horizon; this hero opens nothing, because what it summarises — the readiness percent —
   *  is the checklist rendered immediately below it. Announcing a control to a screen reader
   *  and then doing nothing when it is activated is the shape ADR-0150 §8 argues against
   *  from the other direction: the affordance has to match what a press can achieve. So
   *  there is no role and no tab stop, and the beat is for the finger that already touched
   *  it. */
  const prepRef = useRef<HTMLDivElement>(null);
  const rebuff = () => {
    if (prepRef.current) playBeat(prepRef.current, BEAT.REBUFF);
  };

  const total = dayNumberOf(trip.endDate, trip.startDate);
  // Called unconditionally, above the past/upcoming branch below, because both
  // branches' StatTiles share these same three counts (ADR-0143: "a value that
  // changes should be seen to change" — day/event/booking counts were named but
  // never claimed). Hooks can't be called only from inside one branch.
  const countedTotal = useCountUp(total);
  const countedEvents = useCountUp(events.length);
  const countedBookings = useCountUp(bookings.length);

  // A finished trip is a calm read-only archive (ADR-0040): no prep dashboard,
  // no countdown, no board — a quiet retrospective and a way back into the days.
  if (tripPhase(trip, now) === 'past') {
    return (
      <>
        <div className="prep prep-past">
          <div className="prep-k">{t.planHome.past.complete}</div>
          <div className="prep-count">{trip.destination}</div>
          <div className="prep-dates">
            {formatTripDates(trip.startDate, trip.endDate, { style: 'prose' })}{' '}
            <span className="dot">{DOT_SEPARATOR}</span> {dayPhrase(total)}
          </div>
        </div>

        <div className="sec-title">{t.planHome.past.summary}</div>
        <div className="prep-stats">
          <StatTile value={countedTotal} label={t.planHome.past.days} />
          <StatTile value={countedEvents} label={t.planHome.stats.events} />
          <StatTile value={countedBookings} label={t.planHome.stats.bookings} />
        </div>

        <button className="addbtn" onClick={() => onNavigate('days')}>
          {t.planHome.past.viewDays}
        </button>
      </>
    );
  }

  const days = daysUntilStart(trip, now);
  const countdown = days === null ? null : countdownParts(days);
  // Still missing = not satisfied by the data and not waved off by a person. The completed
  // half keeps its own collapse (ADR-0190 §4): the tasks screen's `הושלמו` chip is a
  // different surface, so two toggles is not one mechanism twice — and this section's title
  // is literally "what is missing", which it stops being if the done rows never leave.
  const liveChecks = automatic.filter(isLive);
  const completedAutomatic = automatic.filter((a) => a.done);
  const completedChecks = completedAutomatic;

  /** The one verb per check (ADR-0061 §1: the CTA does the thing). The COPY moved to
   *  `lib/automatic-tasks.ts` when the tasks screen became a second reader of it; what stays
   *  here is what only this screen can do — seed its own sheet, open its own upload. */
  const runAction = (auto: AutomaticTask) => {
    switch (auto.action) {
      case AUTOMATIC_TASK_ACTION.ADD_FLIGHT:
        // Seed the missing leg: outbound needs a flight TO the destination, a return one
        // FROM it. `missingLeg` is derived beside the copy, so both hosts agree on it.
        setSheetSeed(
          auto.missingLeg === 'outbound'
            ? { type: BOOKING_TYPE.FLIGHT, dest: trip.destination }
            : { type: BOOKING_TYPE.FLIGHT, origin: trip.destination },
        );
        return;
      case AUTOMATIC_TASK_ACTION.ADD_LODGING:
        setSheetSeed({ type: BOOKING_TYPE.HOTEL });
        return;
      case AUTOMATIC_TASK_ACTION.BUILD_DAY:
        if (readiness.emptyDates[0]) setActiveDate(readiness.emptyDates[0]);
        onNavigate(DAYS_TAB);
        return;
      case AUTOMATIC_TASK_ACTION.UPLOAD_DOCS:
        setUploadingDoc(true);
        return;
      case AUTOMATIC_TASK_ACTION.INVITE:
        navigate(`/trip/${trip.id}/settings`);
        return;
    }
  };

  /** A check with no row yet is handed a draft; the verb is what writes it (brief §4). */
  const manageAutomatic = (auto: AutomaticTask) =>
    setManage(auto.task ?? draftOverlay(auto, trip.id));

  return (
    <>
      <div className="prep" ref={prepRef} onClick={rebuff}>
        {/* No "היציאה" label once the trip is underway — the countdown line
            reads "הטיול בעיצומו" on its own (would otherwise concatenate oddly).
            The "בעוד" connective rides with the count (ADR-0085), so a near date
            reads "היציאה · מחר" and a far one "היציאה · בעוד 3 ימים". */}
        {countdown && <div className="prep-k">{t.planHome.prep.departIn}</div>}
        {countdown ? (
          <div className="prep-count">
            {countdown.prefix && <span className="prep-count-u">{countdown.prefix}</span>}{' '}
            {countdown.value && (
              <span className="prep-count-n" dir="auto">
                {countdown.value}
              </span>
            )}{' '}
            <span className="prep-count-u">{countdown.unit}</span>
          </div>
        ) : (
          <div className="prep-count">{t.planHome.prep.underway}</div>
        )}
        <div className="prep-dates">
          {formatTripDates(trip.startDate, trip.endDate, { style: 'prose' })}{' '}
          <span className="dot">{DOT_SEPARATOR}</span> {dayPhrase(total)}
        </div>
        <div className="prep-ready">
          <div className="prep-ready-top">
            <span>{t.planHome.prep.readiness}</span>
            <b dir="auto">{readiness.pct}%</b>
          </div>
          <div className="prep-track">
            <div className="prep-fill" style={{ width: `${readiness.pct}%` }} />
          </div>
        </div>
      </div>

      <div className="sec-title">
        {t.planHome.checklist.title}
        <span className="sec-title-end">
          {liveChecks.length === 0 && <span className="hint">{t.planHome.checklist.allDone}</span>}
          {completedChecks.length > 0 && (
            <CollapseToggle
              expanded={showCompleted}
              onToggle={() => setShowCompleted((v) => !v)}
              expandLabel={t.planHome.checklist.showCompleted(completedChecks.length)}
              collapseLabel={t.planHome.checklist.hideCompleted}
              className="chk-toggle"
            />
          )}
        </span>
      </div>

      {/* **The convergence, and it is a DELETION** (ADR-0188 §6/§7). `.chk-row` was
          `ListRow` written a second time — badge + title + meta + trailing control, inside a
          `.checklist` card that is `.index .listcard` under another name — so this is the
          same card holding the same row the tasks screen renders, and `.chk-row`/`-ic`/`-t`/
          `-m`/`-cta`/`-ppl` are gone. `.chk-ok` survives as the completed row's trailing
          state. The CTA BUTTON goes with them: `.chk-row` was a `<div>` and needed an
          explicit button, `ListRow` already has a tap, so ADR-0061 §1's rule holds without
          one — and keeping it left the title 101.8px against a manual row's 195px. */}
      {liveChecks.length > 0 && (
        <div className="checklist">
          {liveChecks.map((auto) => (
            <AutomaticTaskRow
              key={auto.key}
              auto={auto}
              onAct={() => runAction(auto)}
              onManage={() => manageAutomatic(auto)}
            />
          ))}
        </div>
      )}

      {completedChecks.length > 0 && (
        <>
          {/* The collapsed teaser (a static pill row, not itself animated) sits
              above the animated checklist so the count-in-label toggle always
              has something legible to point at while collapsed. */}
          {!showCompleted && (
            <div className="chk-done-sum">
              <span className="ok">
                <Icon name="check" /> {t.planHome.checklist.completedSummary}
              </span>
              {completedChecks.map((auto) => (
                <span className="pill" key={auto.key}>
                  <Icon name={CHECK_ICON[auto.key]} />{' '}
                  {t.planHome.checklist.summaryLabels[auto.key]}
                </span>
              ))}
            </div>
          )}
          <Collapsible expanded={showCompleted} className="checklist">
            {completedAutomatic.map((auto) => (
              <AutomaticTaskRow
                key={auto.key}
                auto={auto}
                onAct={() => runAction(auto)}
                onManage={() => manageAutomatic(auto)}
              />
            ))}
          </Collapsible>
        </>
      )}

      <div className="sec-title">{t.planHome.stats.title}</div>
      <div className="prep-stats">
        <StatTile value={countedBookings} label={t.planHome.stats.bookings} />
        <StatTile value={countedEvents} label={t.planHome.stats.events} />
        <StatTile
          // Not counted-up: `readiness` (and so `emptyDates.length`) is computed
          // below the past-trip branch's early return above, so a `useCountUp`
          // call here would run conditionally on `tripPhase` — the hooks-rules
          // violation the two calls above avoid by sitting ahead of that return.
          value={
            <span
              style={readiness.emptyDates.length > 0 ? { color: 'var(--miss-deep)' } : undefined}
            >
              {readiness.emptyDates.length}
            </span>
          }
          label={t.planHome.stats.emptyDays}
        />
      </div>

      {(sheetSeed || bookingDraft) && (
        <BookingSheet
          booking={null}
          seed={sheetSeed ?? undefined}
          draft={bookingDraft}
          onClose={() => {
            setSheetSeed(null);
            setBookingDraft(null);
          }}
        />
      )}
      {uploadingDoc && (
        <DocumentUploadSheet tripId={trip.id} onClose={() => setUploadingDoc(false)} />
      )}
      {manage && (
        <TaskManageSheet
          task={manage}
          derivedAction={(() => {
            const auto = automatic.find((a) => a.key === manage.derivedKey);
            return auto
              ? {
                  label: auto.title,
                  onSelect: () => {
                    setManage(null);
                    runAction(auto);
                  },
                }
              : undefined;
          })()}
          onEdit={() => setManage(null)}
          onToggleImportant={() => {
            const task = manage;
            setManage(null);
            applyVerb(task, { important: !task.important });
          }}
          onDismiss={() => {
            const task = manage;
            setManage(null);
            applyVerb(task, { status: TASK_STATUS.DISMISSED });
          }}
          onReopen={() => {
            const task = manage;
            setManage(null);
            applyVerb(task, { status: TASK_STATUS.OPEN });
          }}
          onDelete={() => setManage(null)}
          onClose={() => setManage(null)}
        />
      )}
    </>
  );
}
