// **The lifted PLAN hero** (ADR-0193 §4) — the prep hero, promoted, showing the run-up to
// the departure that the screen underneath it no longer shows whole.
//
// **ADR-0160 §H said this hero does not lift, and this is §H's own revisit clause firing
// rather than a reversal of it.** §H refused the lift because what the hero summarised —
// the readiness percent — was "the checklist rendered immediately beneath it", so a lifted
// copy would show you what you were already looking at. That stopped being true the moment
// ADR-0193 §3 collapsed the far and undated tasks behind one row: the hero's numbers now
// cover things the screen keeps folded, which is the exact condition §H wrote down.
//
// Everything structural is the shipped path, and deliberately so — this is a second HOST
// for the lift, not a second lift:
//
//   · `Modal` variant `lift` — so the overlay stack, the focus contract, Escape, the
//     backdrop and the Android gesture are all the ones ADR-0103/0090 already own. It can
//     be dismissed, so it is a back layer; what ADR-0160 §2 rejects is the sheet's grammar,
//     never the back contract.
//   · `useLiftFlight` off the MEASURED collapsed box — never a constant, which is the
//     mistake this repo has made three times (ADR-0142's 118px, ADR-0143's 58px, the trip
//     handoff's target).
//   · `HeroTaskRows` — the same rows the trip hero draws. Zero new row CSS.
//
// Presentational, like `HeroLift` beside it: every task arrives already formatted (through
// `lib/hero-task.ts`, shared with Home for exactly this reason) and this file resolves no
// zone, reads no state and formats no time.
//
// **A READ.** No tick, no menu, nothing pressable in the list at all. That is what §U
// settled for the trip hero — the owner was offered the tickable version and declined —
// and it also pays ADR-0160 §4's constraint for free: the card is opened from a
// `<button>`, and §4's finding is that Chrome tears a `<button>` apart at a nested one.
import { useRef, type ReactNode } from 'react';
import { useLiftFlight } from '../../lib/useLiftFlight';
import { Modal } from '../primitives/Modal';
import { Icon } from '../Icon';
import { HeroTaskRows, type HeroLiftTask } from './HeroLift';
import { t } from '../../i18n/he';
import './plan-lift.css';

export interface PlanLiftProps {
  /** The countdown, pre-split exactly as the collapsed hero renders it, so the head of the
   *  lifted card and the card it flew out of print the same words. */
  countdown: { prefix?: string; value?: string; unit: string } | null;
  /** `הטיול בעיצומו` when there is no countdown — the collapsed hero's own fallback. */
  underway: string;
  dates: ReactNode;
  readinessPct: number;
  openTasks: number;
  overdue: number;
  /** The run-up, in ONE list and in the tasks screen's own order (owner, 2026-08-16).
   *
   *  **This replaces five date-keyed bands, and the deletion is the decision.** The first
   *  build split the remainder into `לפני היציאה` / `בזמן הטיול` / `ללא תאריך` on the
   *  argument that cutting against the departure is the one thing this hero can say that no
   *  other surface can. The owner's call is that it is not worth a heading apiece: a task
   *  without a date is not a different KIND of thing from one with a date, and the screen
   *  behind the lift already answers "what first" with `orderTaskRows`. Two surfaces, one
   *  order — which is the rule ADR-0190 §2 set and the bands were quietly bending. */
  tasks: HeroLiftTask[];
  /** Whatever `PLAN_TASK_CAP` left behind. The card shows a bounded list and must not
   *  imply it is all — `HeroTaskRows`' own rule, and `פתק`'s before it. */
  more?: number;
  /** The collapsed hero this was lifted out of — the box the flight starts from and
   *  descends back to (ADR-0160 §5). Absent → no flight, and the card is simply there,
   *  which is the correct static state under reduced motion anyway. */
  origin?: HTMLElement | null;
  onClose: () => void;
}

export function PlanLift(props: PlanLiftProps) {
  const { countdown, underway, dates, readinessPct, openTasks, overdue, tasks, more } = props;

  return (
    <Modal variant="lift" ariaLabel={t.planHome.lift.title} onClose={props.onClose}>
      {(close, closing) => (
        <Lifted origin={props.origin ?? null} closing={closing}>
          <div className="prep-lift-head">
            <div className="prep-lift-top">
              <div>
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
                  <div className="prep-count">{underway}</div>
                )}
                <div className="prep-dates">{dates}</div>
              </div>
              {/* Bound to the primitive's OWN animated close, not to the caller's
                  `onClose` — the same path the backdrop, a back and Escape take. Calling
                  the caller directly would snap past the exit. */}
              <button
                type="button"
                className="prep-lift-x"
                onClick={close}
                aria-label={t.hero.close}
              >
                <Icon name="close" />
              </button>
            </div>

            {/* The two numbers, exactly as the collapsed hero prints them (ADR-0193 §2).
                Same markup, not a re-statement: the lifted card is the same object, and a
                readiness bar that rounded differently one elevation up would say so. */}
            <div className="prep-ready">
              <div className="prep-ready-top">
                <span>{t.planHome.prep.readiness}</span>
                <b dir="auto">{readinessPct}%</b>
              </div>
              <div className="prep-track">
                <div className="prep-fill" style={{ width: `${readinessPct}%` }} />
              </div>
            </div>
            {openTasks > 0 && (
              <div className="prep-tasks">
                <span>{t.planHome.prep.openTasks}</span>
                <span className="prep-tasks-end">
                  {overdue > 0 && (
                    <span className="prep-tasks-late">{t.tasks.band.overdue(overdue)}</span>
                  )}
                  <b className="prep-tasks-n" dir="auto">
                    {openTasks}
                  </b>
                </span>
              </div>
            )}
          </div>

          {/* ONE scroller between a pinned head and no foot — ADR-0148 §1's bounded card,
              third consumer, reached for the same reason it was there: a card that is as
              tall as its content still has to stop at the screen. */}
          <div className="prep-lift-body">
            <div className="hero-part">
              <HeroTaskRows tasks={tasks} more={more} />
            </div>
          </div>
        </Lifted>
      )}
    </Modal>
  );
}

/** The card itself, and the one component that holds a ref to it.
 *
 *  Split out for the same non-tidiness reason `HeroLift.Lifted` is: the flight is a hook,
 *  and inside `PlanLift` it would have to be called above the `Modal` — where the card does
 *  not exist yet. A component rendered as the Modal's child mounts with the card, so its
 *  layout effect runs with a real box to measure. */
function Lifted({
  origin,
  closing,
  children,
}: {
  origin: HTMLElement | null;
  closing: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLiftFlight({ subject: ref, origin, closing });
  // `.prep` as well as `.prep-lifted`: being the same object is what the whole lift rests
  // on, and the shipped hero's own class is where its violet, its radius and its ink ramp
  // live. `hero-lifted` makes the identical claim about `.wp-board` one screen over.
  return (
    <div className="prep prep-lifted" ref={ref}>
      {children}
    </div>
  );
}
