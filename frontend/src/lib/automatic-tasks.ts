// **An automatic task is a readiness check wearing a task row** (tasks brief §3/§4,
// ADR-0188 §4, decisions in ADR-0190). `computeReadiness` is untouched: it keeps returning
// its five derived checks, and this module is the overlay that turns each into a row.
//
// **The whole model is one sentence, and it is the predicate below:** `status` is the
// derivation's answer **unless** the row says `dismissed`. Human dismissal wins because a
// dismissal cannot be derived — it has to survive a reload and reach the other four people —
// and done-ness stays derived because a stored copy of it would go stale the moment someone
// books the hotel.
//
// A check nobody has touched has **no `Task` row at all**. The moment someone dismisses,
// assigns or flags it, a row carrying `derivedKey` is written: same entity, same sync
// channel, same appliers, nothing net-new.
//
// **Why the copy lives here and not on a screen.** It was `PlanHome`'s private `rowFor`
// closure, and phase 2 gives it a second host (the tasks screen). Two hosts rendering one
// vocabulary from two copies is the pile root rule 8 exists to stop, so the one-off was
// generalised here rather than copied there. What stays with each host is the ACTION —
// `PlanHome` can seed its own booking sheet, the Index has to navigate — which is why this
// returns an action *id* rather than a closure.
import type { Task, TaskDerivedKey } from '@waypoint/shared';
import { TASK_STATUS } from '@waypoint/shared';
import type { CheckId, ReadinessCheck } from './readiness';
import { MS_PER_DAY } from '../constants';
import { t } from '../i18n/he';
import type { IconName } from '../ui/Icon';

/** The five checks' glyphs. Moved here from `PlanHome`'s private const so the tasks screen
 *  renders the same badge without importing a screen. */
export const CHECK_ICON: Record<CheckId, IconName> = {
  flights: 'flight',
  lodging: 'hotel',
  itinerary: 'calendar',
  documents: 'documents',
  group: 'members',
};

/** **The one verb that resolves each check** (ADR-0061 §1: the CTA does the thing). An id
 *  rather than a callback, because the two hosts reach the same destination differently —
 *  Plan Home opens its own seeded sheet, the Index has to leave for it (ADR-0190 §3). */
export const AUTOMATIC_TASK_ACTION = {
  ADD_FLIGHT: 'add-flight',
  ADD_LODGING: 'add-lodging',
  BUILD_DAY: 'build-day',
  UPLOAD_DOCS: 'upload-docs',
  INVITE: 'invite',
} as const;
export type AutomaticTaskAction =
  (typeof AUTOMATIC_TASK_ACTION)[keyof typeof AUTOMATIC_TASK_ACTION];

/** One check, resolved against its overlay row. */
export interface AutomaticTask {
  key: TaskDerivedKey;
  icon: IconName;
  title: string;
  meta: string;
  /** The derivation's answer, which a stored value may not override. */
  done: boolean;
  /** The one thing a human CAN say about a derived check, and the only stored state here. */
  dismissed: boolean;
  action: AutomaticTaskAction;
  /** Which leg a flights check is missing, so a host can seed the right direction. */
  missingLeg?: 'outbound' | 'return';
  /** The overlay row, when someone has dismissed, assigned or flagged this check. Absent
   *  means the check is a pure derivation and there is nothing stored about it at all. */
  task?: Task;
}

/** Everything the copy needs that a `ReadinessCheck` does not carry. */
export interface AutomaticTaskContext {
  emptyDates: string[];
  tripStartDate: string;
  travelerCount: number;
}

/** Trip-local day number (1-based), matching the header's day-strip numbering. */
const dayNumberOf = (date: string, startDate: string) =>
  Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / MS_PER_DAY,
  ) + 1;

/** A check's words and its verb. Lifted from `PlanHome.rowFor` unchanged in wording — the
 *  copy keys are the same `t.planHome.checklist` entries, so nothing re-translates. */
function copyFor(
  check: ReadinessCheck,
  ctx: AutomaticTaskContext,
): Pick<AutomaticTask, 'icon' | 'title' | 'meta' | 'action' | 'missingLeg'> {
  const c = t.planHome.checklist;
  switch (check.id) {
    case 'flights':
      return {
        icon: CHECK_ICON.flights,
        title: c.flightsTitle,
        meta: check.done
          ? c.flightsDoneMeta
          : !check.hasOutbound && !check.hasReturn
            ? c.flightsMissingBothMeta
            : check.hasOutbound
              ? c.flightsMissingReturnMeta
              : c.flightsMissingOutboundMeta,
        action: AUTOMATIC_TASK_ACTION.ADD_FLIGHT,
        missingLeg: check.hasOutbound ? 'return' : 'outbound',
      };
    case 'lodging':
      return {
        icon: CHECK_ICON.lodging,
        title: c.lodgingTitle,
        meta: check.done
          ? c.lodgingDoneMeta
          : c.lodgingMissingMeta(check.count ?? 0, check.total ?? 0),
        action: AUTOMATIC_TASK_ACTION.ADD_LODGING,
      };
    case 'itinerary':
      return {
        icon: CHECK_ICON.itinerary,
        title: check.done ? c.itineraryDoneTitle : c.itineraryTitle(check.count ?? 0),
        meta: check.done
          ? c.itineraryDoneMeta
          : c.itineraryMeta(
              ctx.emptyDates.map((d) => dayNumberOf(d, ctx.tripStartDate)).join(', '),
            ),
        action: AUTOMATIC_TASK_ACTION.BUILD_DAY,
      };
    case 'documents':
      return {
        icon: CHECK_ICON.documents,
        title: c.documentsTitle,
        // The per-traveller pips (`.chk-ppl`) retire with the rest of `.chk-*` and are NOT
        // replaced (ADR-0190 §5, owner's call): this line already says the same thing in
        // words, and the dots only ever appeared on one row of five.
        meta: check.done
          ? c.documentsDoneMeta
          : c.documentsMissingMeta(check.count ?? 0, check.total ?? 0),
        action: AUTOMATIC_TASK_ACTION.UPLOAD_DOCS,
      };
    case 'group':
      return {
        icon: CHECK_ICON.group,
        title: check.done ? c.groupTitle : c.groupMissingTitle,
        meta: check.done ? c.groupDoneMeta(ctx.travelerCount) : c.groupMissingMeta,
        action: AUTOMATIC_TASK_ACTION.INVITE,
      };
  }
}

/** **The predicate the whole feature turns on.** Every check becomes a row; the stored row,
 *  when there is one, contributes exactly one fact — whether a human dismissed it. */
export function automaticTasks(
  checks: ReadinessCheck[],
  tasks: Task[],
  ctx: AutomaticTaskContext,
): AutomaticTask[] {
  const overlay = new Map<string, Task>();
  for (const task of tasks) if (task.derivedKey) overlay.set(task.derivedKey, task);
  return checks.map((check) => {
    const task = overlay.get(check.id);
    return {
      key: check.id,
      ...copyFor(check, ctx),
      // Derived, never read off the row: a stored `done` would go stale the moment the
      // hotel is booked, which is the whole reason §3 of the brief refuses to materialise.
      done: check.done,
      dismissed: task?.status === TASK_STATUS.DISMISSED,
      task,
    };
  });
}

/** **What "still missing" means for a derived check**, and it is the only thing either
 *  surface lists: not already satisfied by the data, and not waved off by a person.
 *
 *  **An automatic task therefore appears under `הכל` and under no other facet** (ADR-0190
 *  §1, owner's call). The two other chips read a `Task` row, and an untouched check has
 *  none — `שלי` is `assigneeUserId === meId` and `הושלמו` is `status`, so a pure derivation
 *  can satisfy neither by construction. Rather than invent a second meaning for each chip,
 *  the checks sit out of both: `שלי` stays "what I personally owe" and `הושלמו` stays "what
 *  I am finished with", and both keep answering about things people wrote.
 *
 *  A DONE check drops out for the same reason a done task does — the list is what is still
 *  missing, and Plan Home's own section title says so. */
export const isLive = (auto: AutomaticTask): boolean => !auto.done && !auto.dismissed;

/** **The `⋯` sheet's subject for a check nobody has touched yet.** The sheet takes a `Task`
 *  and an untouched check has none — but opening a MENU must not write anything: brief §4 is
 *  explicit that the row is minted the moment someone *dismisses, assigns or flags*, which
 *  is a verb, not a read. So the sheet is handed a Task-shaped value that has never been
 *  written, and `isUnwritten` is what tells the verb handlers to create instead of patch. */
export function draftOverlay(auto: AutomaticTask, tripId: string): Task {
  return {
    id: UNWRITTEN_ID,
    tripId,
    title: auto.title,
    dueHasTime: false,
    important: false,
    status: TASK_STATUS.OPEN,
    derivedKey: auto.key,
    createdBy: '',
    createdAt: '',
    updatedAt: '',
    updatedBy: '',
  };
}

/** An id no row can have, because the server assigns real ones and the client generates
 *  uuids. Empty is the honest spelling of "this has never been written". */
const UNWRITTEN_ID = '';
export const isUnwritten = (task: Task): boolean => task.id === UNWRITTEN_ID;

/** **Is this a task a person wrote?** The Index tile counts these and the facet axis filters
 *  them, so an untouched check cannot inflate either (ADR-0190 §1) — a brand-new trip must
 *  not read "5 משימות פתוחות" before anyone has written one. A row carrying `derivedKey` is
 *  the derivation's overlay however much a human has since said about it. */
export const isManual = (task: Task): boolean => task.derivedKey === undefined;
