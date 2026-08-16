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
import { useEffect, useMemo, useRef, useState } from 'react';
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
  isManual,
  resolvedReadinessPct,
  tickedAutomaticStatus,
  type AutomaticTask,
} from '../lib/automatic-tasks';
import { AutomaticTaskRow } from '../ui/AutomaticTaskRow';
import { TaskBandRow } from '../ui/TaskBandRow';
import {
  isSettled,
  openManualTasks,
  orderTaskRows,
  sortTasks,
  taskBand,
  taskRowKey,
  tasksDueSoon,
  tickedStatus,
  TASK_BAND,
  type TaskClock,
} from '../lib/tasks';
import { toHeroTask } from '../lib/hero-task';
import { PlanLift } from '../ui/domain/PlanLift';
import { TaskManageSheet } from '../ui/TaskManageSheet';
import { BookingSheet, type BookingSeed, type BookingSheetDraft } from '../ui/BookingSheet';
import { usePlaceErrandReturn } from '../state/map-scope-state';
import {
  DAYS_TAB,
  FOCUS_PARAM,
  HOME_FOCUS,
  HOME_TAB,
  INDEX_FOCUS,
  INDEX_TAB,
  TAB_PARAM,
} from '../state/nav-state';
import type { Task } from '@waypoint/shared';
import { DocumentUploadSheet } from '../ui/DocumentUploadSheet';
import { StatTile } from '../ui/domain';
import { CollapseToggle, Collapsible } from '../ui/primitives/Collapsible';
import { DOT_SEPARATOR, MS_PER_DAY, PLAN_LIFT_TASK_CAP, type TabId } from '../constants';
import { t } from '../i18n/he';
import { Icon } from '../ui/Icon';
import { useSettledHosts } from '../ui/HostTasks';

// `CHECK_ICON` moved to `lib/automatic-tasks.ts` with the row copy when the tasks screen
// became a second reader of both — the collapsed summary below still uses it, now imported.

// Trip-local day number (1-based) for a calendar-date string — matches the
// header's day-strip numbering. UTC-midnight diff, no timezone re-reading.
const dayNumberOf = (date: string, startDate: string) =>
  Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / MS_PER_DAY,
  ) + 1;

export function PlanHome({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { trip, events, bookings, users, setActiveDate, taskVerbs, tasks, zoneCrossings } =
    useTrip();
  const now = useClock();
  const navigate = useNavigate();
  const { readiness, automatic, applyVerb } = useAutomaticTasks();
  // **The percentage reads the same resolution the rows do** — otherwise the hero can say
  // 60% directly above a list where every row is ticked. `computeReadiness` stays pure; what
  // moved is only which number this hero prints.
  const readinessPct = resolvedReadinessPct(automatic);
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

  /** **THE HERO LIFTS NOW** (ADR-0193 §4), and this replaces ADR-0160 §H's rebuff rather
   *  than sitting beside it. §H made this a `<div>` with a beat because the hero opened
   *  nothing — "announcing a control to a screen reader and then doing nothing when it is
   *  activated" is ADR-0150 §8 from the other side. That argument was right and its premise
   *  has expired: §3 folds the far and undated tasks behind one row, so the hero now
   *  summarises what the screen keeps folded, which is the condition §H itself named for
   *  revisiting. A press has something to open, so it is a `<button>`.
   *
   *  The ref survives the change with a second job: it is the box the flight measures
   *  (ADR-0160 §5) — held rather than measured at press time, because `--press-scale-lg` is
   *  still applied under the finger and `getBoundingClientRect` includes transforms. */
  const prepRef = useRef<HTMLButtonElement>(null);
  const [lifted, setLifted] = useState(false);
  const wasLifted = useRef(false);
  /** The landing beat (ADR-0160 §7), played AFTER the render that reveals the hero — not in
   *  the close handler, which is where it is tempting to put it and would not survive:
   *  React owns `className` on that node, so a class added imperatively before its next
   *  reconcile is overwritten by it. */
  useEffect(() => {
    if (wasLifted.current && !lifted && prepRef.current) {
      playBeat(prepRef.current, BEAT.LANDING, '--t-quick');
    }
    wasLifted.current = lifted;
  }, [lifted]);

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
  // **The CONVERGED list** (ADR-0188 §6: "Plan Home carries the converged list, automatic
  // first and manual after"). Phase 2 built the automatic half only; the manual half arrives
  // here (owner, 2026-08-16: tasks belong on Plan Home too, not only Trip Home).
  //
  // Ordered by the same `orderTaskRows` the tasks screen uses — urgent manual, then the
  // checks, then the rest — so the two surfaces cannot disagree about what leads. Which
  // manual tasks: the band's, i.e. overdue or due within the week, because Plan Home is
  // where you prepare and a task due next month is not yet preparation.
  const taskClock: TaskClock = {
    nowMs: now.getTime(),
    crossings: zoneCrossings,
    primaryZone: trip.timezone,
  };
  const settledHosts = useSettledHosts();
  /** **Everything open, with no date window** (ADR-0193 §1). `tasksDueSoon` used to be this
   *  list and it is Trip Home's rule: dated, and overdue or inside a week. On the screen
   *  whose countdown reads `בעוד 47 ימים` that made an undated task and anything a week out
   *  invisible — while `completedManual` below has never had a window at all, so the same
   *  task appeared under `הושלמו` the instant it was ticked. Widening is what makes the two
   *  halves ask one question. */
  const openTasks = openManualTasks(tasks, taskClock, settledHosts);
  const overdueCount = openTasks.filter(
    (task) => taskBand(task, taskClock) === TASK_BAND.OVERDUE,
  ).length;
  /** **What stays inline, and what folds** (§3). Near = what a person has already called
   *  urgent, plus what is actually due this week; everything else sits behind one row.
   *  `tasksDueSoon` is REUSED to answer the second half rather than re-derived — it is
   *  still the right predicate, it was only ever the wrong list. */
  const soonIds = new Set(tasksDueSoon(tasks, taskClock, settledHosts).map((task) => task.id));
  const isNear = (task: Task) => task.important || soonIds.has(task.id);
  const nearTasks = openTasks.filter(isNear);
  const farTasks = openTasks.filter((task) => !isNear(task));
  const converged = orderTaskRows(nearTasks, liveChecks, taskClock);
  const [showFar, setShowFar] = useState(false);
  // **The completed half is the same noun the open half is** (phase 3r). It was
  // `automatic.filter(done)` alone, so a completed MANUAL task could never appear and the
  // toggle's count answered about half the feature — the one-noun failure ADR-0188 §4 and
  // ADR-0190 §1 have each already corrected on other surfaces.
  const completedAutomatic = automatic.filter((a) => a.done);
  const completedManual = useMemo(
    () =>
      sortTasks(
        tasks.filter((task) => isManual(task) && isSettled(task)),
        taskClock,
      ),
    [tasks, taskClock],
  );
  const completedCount = completedAutomatic.length + completedManual.length;

  /** **The run-up the lift opens onto** (ADR-0193 §4, amended 2026-08-16 on the owner's call).
   *
   *  **ONE list, in the tasks screen's own order** — `orderTaskRows`, which already
   *  interleaves urgent → the live checks → the rest (ADR-0190 §2). The first build split the
   *  remainder into `לפני היציאה` / `בזמן הטיול` / `ללא תאריך` and derived it with a
   *  `planRunUp` of its own; that derivation is DELETED rather than left unused. A task with
   *  no date is not a different KIND of thing from one with a date, and two surfaces
   *  disagreeing about what leads is the thing §2 of that ADR exists to prevent.
   *
   *  Capped at `PLAN_LIFT_TASK_CAP` with the remainder stated, never dropped silently. */
  const liftRows = orderTaskRows(openTasks, liveChecks, taskClock);
  const liftTasks = liftRows.slice(0, PLAN_LIFT_TASK_CAP).map((row) =>
    row.kind === 'task'
      ? toHeroTask(row.task, taskClock, users)
      : // A check is a task all the way through (ADR-0190 §1 as amended), so it renders as
        // one here too. Its second line goes in `meta`, NOT in `due`: a check has no `dueAt`
        // and never can, and `due` draws a clock — which made every check read as though
        // `חסרות טיסת הלוך` were a deadline. Caught in the running app, not by a spec.
        { title: row.auto.title, meta: row.auto.meta },
  );

  /** **A press that produces nothing reads as a dead surface** (ADR-0160 §9's own rule, and
   *  the reason §H put a rebuff here). So the hero is a control only while it has something
   *  to open. The rebuff is gone with the condition it answered: there is no state now where
   *  the card is pressable and empty. */
  const liftable = liftRows.length > 0;

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

  /** A band row's tap reaches the tasks SCREEN, the same way Trip Home's does (ADR-0050's
   *  deep-link), so a task is read where it lives rather than on a band that is a window. */
  const openTasksScreen = () =>
    navigate(`/?${TAB_PARAM}=${INDEX_TAB}&${FOCUS_PARAM}=${INDEX_FOCUS.TASKS}`);

  /** The tick — the same verb the tasks screen fires, and the act that mints the overlay
   *  row when there is not one yet (brief §4). */
  const tickAutomatic = (auto: AutomaticTask) =>
    applyVerb(auto.task ?? draftOverlay(auto, trip.id), {
      status: tickedAutomaticStatus(auto),
    });

  /** A check with no row yet is handed a draft; the verb is what writes it (brief §4). */
  const manageAutomatic = (auto: AutomaticTask) =>
    setManage(auto.task ?? draftOverlay(auto, trip.id));

  return (
    <>
      {/* **The hero, and whether it is a CONTROL is the caller's call** (ADR-0193 §4) —
          `Board`'s own shape, one screen over: a `<button>` when there is a run-up to open,
          the `<div>` it has always been when there is not. A pressable card with nothing
          behind it is the dead tap ADR-0160 §9 exists to prevent, and announcing a control
          that does nothing on activation is ADR-0150 §8 from the other side. The rebuff §H
          added is gone with the condition it answered.

          **NOTHING INTERACTIVE MAY EVER GO INSIDE THIS ELEMENT.** Chrome closes a
          `<button>` at a nested one and reparents everything after it (ADR-0160 §4,
          reproduced live at 1 of 4 children left) — which is also why the second readout
          below is a readout. `PlanHome.lift.test.tsx` fails the build if a control
          appears in here, because no snapshot can see that. */}
      {(() => {
        const inner = (
          <>
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
                <b dir="auto">{readinessPct}%</b>
              </div>
              <div className="prep-track">
                <div className="prep-fill" style={{ width: `${readinessPct}%` }} />
              </div>
            </div>
            {/* **The second number, with its own noun** (§2). The bar above is the five
                derived checks and nothing else, so 100% over eight open tasks was the same
                claim `הכול מוכן` was making one line down. Absent at zero — there is no
                "0 משימות פתוחות" state, because a card that says so is ADR-0045's empty
                shell in one line. */}
            {openTasks.length > 0 && (
              <div className="prep-tasks">
                <span>{t.planHome.prep.openTasks}</span>
                <span className="prep-tasks-end">
                  {overdueCount > 0 && (
                    <span className="prep-tasks-late">{t.tasks.band.overdue(overdueCount)}</span>
                  )}
                  <b className="prep-tasks-n" dir="auto">
                    {openTasks.length}
                  </b>
                </span>
              </div>
            )}
          </>
        );
        return liftable ? (
          <button
            type="button"
            className={'prep is-tappable' + (lifted ? ' is-lifted' : '')}
            ref={prepRef}
            onClick={() => setLifted(true)}
            aria-label={t.planHome.lift.title}
          >
            {inner}
          </button>
        ) : (
          <div className="prep">{inner}</div>
        );
      })()}

      <div className="sec-title">
        {t.planHome.checklist.title}
        <span className="sec-title-end">
          {/* **The reported sentence, re-gated** (ADR-0193 §1). It used to read
              `converged.length === 0`, i.e. "no live check and nothing due within a week" —
              a condition a well-prepared trip with a to-do list satisfies constantly, which
              is how it came to sit above open tasks. It is NOT deleted: it is the only
              moment this screen says something good, and it is true when nothing is open. */}
          {converged.length === 0 && farTasks.length === 0 && (
            <span className="hint">{t.planHome.checklist.allDone}</span>
          )}
          {/* **The far group's toggle lives HERE, in `allDone`'s own slot** (owner,
              2026-08-16: _"this should replace the 'you're ready 🎉' in placing and look like
              the הצג/כווץ שהושלמו"_). The two can never collide — far tasks existing is
              exactly what makes `allDone` false — so one slot holds whichever is true.

              `.chk-toggle`, the class the completed toggle already wears, and NOT the
              `.chk-more` row this shipped as. That row was reported as _"really ugly (what's
              this font? Sizing?)"_ and the cause is worth knowing: `.wp-collapse-toggle` sets
              the `font` SHORTHAND to `inherit`, which resets `font-size` and `font-weight` at
              the same specificity — and `tasks.css` loads BEFORE `collapsible.css`, so the
              primitive won and the row rendered at the inherited 16px/400 instead of
              13px/700. `.chk-toggle` escapes it by re-declaring `font: inherit` inside its
              own rule before setting its size, which is the convention every caller of this
              primitive has to follow. */}
          {farTasks.length > 0 && (
            <CollapseToggle
              expanded={showFar}
              onToggle={() => setShowFar((v) => !v)}
              expandLabel={t.planHome.checklist.showFar(farTasks.length)}
              collapseLabel={t.planHome.checklist.hideFar}
              className="chk-toggle"
            />
          )}
          {completedCount > 0 && (
            <CollapseToggle
              expanded={showCompleted}
              onToggle={() => setShowCompleted((v) => !v)}
              expandLabel={t.planHome.checklist.showCompleted(completedCount)}
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
          `-m`/`-cta`/`-ppl` are gone, and so is `.chk-ok` — a completed check now shows the
          same filled tick and struck title a completed task does (owner, 2026-08-16), so the
          trailing "הושלם" was a second vocabulary for one state. The CTA BUTTON goes with them: `.chk-row` was a `<div>` and needed an
          explicit button, `ListRow` already has a tap, so ADR-0061 §1's rule holds without
          one — and keeping it left the title 101.8px against a manual row's 195px. */}
      {(converged.length > 0 || farTasks.length > 0) && (
        <div className="checklist">
          {converged.map((row) =>
            row.kind === 'auto' ? (
              <AutomaticTaskRow
                key={taskRowKey(row)}
                auto={row.auto}
                onTick={() => tickAutomatic(row.auto)}
                onAct={() => runAction(row.auto)}
                onManage={() => manageAutomatic(row.auto)}
              />
            ) : (
              <TaskBandRow
                key={taskRowKey(row)}
                task={row.task}
                users={users}
                clock={taskClock}
                onTick={() =>
                  void taskVerbs.updateTask(row.task.id, { status: tickedStatus(row.task) })
                }
                onOpen={openTasksScreen}
              />
            ),
          )}
          {/* The far group's rows. The TOGGLE is in the section head (see above) — this is
              only the drawer it opens, and it stays inside the same card so the list reads as
              one list that happens to be partly folded. */}
          <Collapsible expanded={showFar}>
            {farTasks.map((task) => (
              <TaskBandRow
                key={task.id}
                task={task}
                users={users}
                clock={taskClock}
                onTick={() => void taskVerbs.updateTask(task.id, { status: tickedStatus(task) })}
                onOpen={openTasksScreen}
              />
            ))}
          </Collapsible>
        </div>
      )}

      {completedCount > 0 && (
        <>
          {/* The collapsed teaser (a static pill row, not itself animated) sits
              above the animated checklist so the count-in-label toggle always
              has something legible to point at while collapsed. */}
          {!showCompleted && (
            <div className="chk-done-sum">
              <span className="ok">
                <Icon name="check" /> {t.planHome.checklist.completedSummary}
              </span>
              {completedAutomatic.map((auto) => (
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
                onTick={() => tickAutomatic(auto)}
                onAct={() => runAction(auto)}
                onManage={() => manageAutomatic(auto)}
              />
            ))}
            {/* …and the manual half, which this section could never show before (3r). */}
            {completedManual.map((task) => (
              <TaskBandRow
                key={task.id}
                task={task}
                users={users}
                clock={taskClock}
                onTick={() => void taskVerbs.updateTask(task.id, { status: tickedStatus(task) })}
                onOpen={openTasksScreen}
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

      {/* **The lift** (ADR-0193 §4). `origin` is the collapsed hero's own box, measured by
          the flight rather than written as a constant — the mistake this repo has made
          three times (ADR-0142's 118px, ADR-0143's 58px, the trip handoff's target). */}
      {lifted && (
        <PlanLift
          origin={prepRef.current}
          countdown={countdown}
          underway={t.planHome.prep.underway}
          dates={
            <>
              {formatTripDates(trip.startDate, trip.endDate, { style: 'prose' })}{' '}
              <span className="dot">{DOT_SEPARATOR}</span> {dayPhrase(total)}
            </>
          }
          readinessPct={readinessPct}
          openTasks={openTasks.length}
          overdue={overdueCount}
          tasks={liftTasks}
          more={liftRows.length - liftTasks.length || undefined}
          onClose={() => setLifted(false)}
        />
      )}

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
