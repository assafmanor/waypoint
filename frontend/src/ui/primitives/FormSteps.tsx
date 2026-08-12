// **A stepped surface is one primitive, it never animates height, and it commits once**
// (ADR-0155).
//
// The mechanic already existed **twice, unowned** — `ResolveSheet` and the builder row's
// `הזז` position step, both in `screens/PlanDay.tsx`, each hand-rolling step state and
// each carrying the same `useBackLayer(…, { remainsActive: true })` block with a
// near-identical comment. That comment is in `frontend/CLAUDE.md` precisely because it
// had to be got right twice; this is the third time not happening.
//
// **Why the state is a HOOK and not a component.** `useBackLayer` registers in an effect,
// and child effects run before parent effects — which is the whole trick: the `Modal`'s
// own close layer must register FIRST so it lands underneath, and the step layer must
// register after so back peels the step before the sheet. A `<FormSteps>` component
// rendered *inside* the sheet would be the Modal's CHILD and would register in the wrong
// order, reintroducing exactly the bug ADR-0103 documents. So `useFormSteps` is called by
// whatever renders the `Modal` — its parent — and the panel below is only the paint.
//
// It rides what exists rather than adding beside it: `Modal` is still the surface
// (0079 — a step is content, never a second overlay), `useFormErrors` is still the
// refusal (0150), `FormActions` is still the footer (0078), and the transition borrows
// the shell's route direction (0140) rather than inventing a motion.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBackLayer } from '../../state/nav-state';
import { FormActions } from './FormActions';
import { type FieldProblem } from './useFormErrors';
import { t } from '../../i18n/he';
import './form-steps.css';

/** Which way the last move went. The names match `data-nav`'s, because the motion is
 *  the shell's and borrowing the vocabulary is half of borrowing the idiom. */
export type StepDir = 'forward' | 'back';

export interface FormStep<Id extends string, F extends string> {
  id: Id;
  /** What this step refuses, in ADR-0150's shape. **Every** problem in the step, in one
   *  call — returning at the first is the save loop that ADR exists to end, and a
   *  stepped form is where it would be easiest to reintroduce. Omit for a step that
   *  cannot refuse: a chooser advances by choosing. */
  validate?: () => readonly FieldProblem<F>[];
}

/** The slice of `useFormErrors` this needs. A slice rather than the whole hook so the
 *  primitive reports **through** the host's instance and never beside it — two
 *  independent error states on one form is the drift 0150 collected. */
export interface StepReporter<F extends string> {
  report: (list: readonly FieldProblem<F>[]) => boolean;
}

export interface FormStepsController<Id extends string> {
  step: Id;
  index: number;
  count: number;
  isFirst: boolean;
  isLast: boolean;
  dir: StepDir;
  /** Gate the current step, then advance. A refused step does not move. */
  next: () => void;
  back: () => void;
  goTo: (id: Id) => void;
  /** Back to the first step, silently — for a host reopening the surface. */
  reset: () => void;
  /** **The one commit** (§4). Re-validates EVERY step; on failure navigates to the first
   *  one carrying a problem and marks it there; otherwise runs `onCommit` once. */
  submit: () => void;
}

/** A surface with nothing to refuse. Never blocks, so a chooser's `next` always moves. */
const SILENT: StepReporter<string> = { report: () => false };

export function useFormSteps<Id extends string, F extends string>({
  steps,
  errors,
  onCommit,
}: {
  steps: readonly FormStep<Id, F>[];
  /** Omitted by a surface that cannot refuse — a chooser advances by choosing, and it
   *  has nothing to report through. A form always passes its own instance. */
  errors?: StepReporter<F>;
  /** Runs once, on the last step, only when every step validates. Never per step:
   *  the outbox is FIFO and a note queued in step 2 would overtake the host created in
   *  step 3, failing **only offline** (0152 §6b). */
  onCommit: () => void;
}): FormStepsController<Id> {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<StepDir>('forward');
  // **A refusal on another step cannot be reported until that step has RENDERED.**
  // `report` marks the field by looking its node up in the live DOM, and the node for a
  // step you are not on yet does not exist — reporting in the same tick as the navigation
  // finds nothing, marks nothing, and looks like the validation simply passed. So the
  // list is parked and flushed from an effect, after the new step is on screen.
  const [pending, setPending] = useState<{ list: readonly FieldProblem<F>[] } | null>(null);

  const latest = useRef({ steps, errors: errors ?? SILENT, onCommit });
  latest.current = { steps, errors: errors ?? SILENT, onCommit };

  useEffect(() => {
    if (!pending) return;
    latest.current.errors.report(pending.list);
    setPending(null);
  }, [pending]);

  const goToIndex = useCallback((to: number, how: StepDir) => {
    setDir(how);
    setIndex(to);
  }, []);

  const next = useCallback(() => {
    const { steps: list, errors: err } = latest.current;
    const problems = list[index]?.validate?.() ?? [];
    // Reported straight away: the step being refused is the one on screen.
    if (err.report(problems)) return;
    if (index < list.length - 1) goToIndex(index + 1, 'forward');
  }, [index, goToIndex]);

  const back = useCallback(() => {
    if (index > 0) goToIndex(index - 1, 'back');
  }, [index, goToIndex]);

  const goTo = useCallback(
    (id: Id) => {
      const to = latest.current.steps.findIndex((s) => s.id === id);
      if (to >= 0 && to !== index) goToIndex(to, to > index ? 'forward' : 'back');
    },
    [index, goToIndex],
  );

  const reset = useCallback(() => {
    setPending(null);
    goToIndex(0, 'back');
  }, [goToIndex]);

  const submit = useCallback(() => {
    const { steps: list, errors: err, onCommit: commit } = latest.current;
    for (let i = 0; i < list.length; i++) {
      const problems = list[i].validate?.() ?? [];
      if (problems.length === 0) continue;
      if (i === index) {
        err.report(problems);
      } else {
        goToIndex(i, i > index ? 'forward' : 'back');
        setPending({ list: problems });
      }
      return;
    }
    err.report([]);
    commit();
  }, [index, goToIndex]);

  // **THE IN-SURFACE STEP BACK IS A BACK LAYER** (0103, and the reason this file is a
  // hook — see the header). `remainsActive: true`: stepping back leaves the surface open,
  // so the NEXT press is the one the Modal's own layer answers. Gated on there being a
  // step to return to, which is the same condition the footer's `הקודם` renders on — the
  // two cannot drift, because they are one expression.
  useBackLayer(() => {
    back();
    return { remainsActive: true };
  }, index > 0);

  const count = steps.length;
  return {
    step: steps[index]?.id ?? steps[0].id,
    index,
    count,
    isFirst: index === 0,
    isLast: index === count - 1,
    dir,
    next,
    back,
    goTo,
    reset,
    submit,
  };
}

/** The current step's content, with the step read-out above it.
 *
 *  **It never animates height** (§4). The obvious transition animates `max-height` so the
 *  surface does not jump, which is exactly 0152 §6's trap: `.wp-event-actions` animates to
 *  a FIXED cap and clips notes at about three. A step panel can hold a composer that grows
 *  without bound, so the motion is `translateX` + `opacity` only and the sheet is allowed
 *  to resize. The jump is the accepted cost; the alternative clips a field. */
export function FormStepPanel<Id extends string>({
  steps,
  labels,
  children,
}: {
  steps: FormStepsController<Id>;
  /** One short name per step, in order — the read-out's accessible text. */
  labels?: readonly string[];
  children: ReactNode;
}) {
  return (
    <>
      <StepBar index={steps.index} count={steps.count} label={labels?.[steps.index]} />
      {/* Keyed by step, so each arrival is a MOUNT and `StepPane` can LATCH its direction
          by existing. Read live it would restart on any unrelated re-render that flipped
          the value — the defect ADR-0140 §7 logged on the route shell. */}
      <StepPane key={steps.step} dir={steps.dir}>
        {children}
      </StepPane>
    </>
  );
}

function StepPane({ dir, children }: { dir: StepDir; children: ReactNode }) {
  const [arrivedAs] = useState(dir);
  return (
    <div className="form-step" data-step-nav={arrivedAs}>
      {children}
    </div>
  );
}

/** **A read-out, not a control** (§2). Tapping a dot to jump would presume every step is
 *  independently valid, which a branching flow is not — you cannot draw the slots until
 *  you know which event moves. Navigation is the footer only. It spends no hue: a step is
 *  not time, place or plan mode (rule 4). */
function StepBar({ index, count, label }: { index: number; count: number; label?: string }) {
  const progress = t.common.steps.progress(index + 1, count);
  return (
    <div
      className="form-steps-bar"
      role="status"
      aria-label={label ? `${progress} · ${label}` : progress}
    >
      <span className="form-steps-dots" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={'form-steps-dot' + (i === index ? ' on' : i < index ? ' done' : '')}
          />
        ))}
      </span>
      {label && <span className="form-steps-label">{label}</span>}
    </div>
  );
}

/** The footer, on the one `FormActions` bar every other form uses — never a second action
 *  row beside it (§2). The labels live here rather than at each host so `הבא`/`שמירה` and
 *  `הקודם`/`ביטול` cannot drift between two stepped surfaces. */
export function FormStepActions<Id extends string>({
  steps,
  onCancel,
  saveLabel,
  saveAnywhere = false,
  busy,
  destructive,
}: {
  steps: FormStepsController<Id>;
  onCancel: () => void;
  /** Overrides `שמירה` on the last step, for a surface whose commit is not a save. */
  saveLabel?: string;
  /** **Offer the commit on every step, beside `הבא`** (owner, 2026-08-12: _"add a save button
   *  next to the הבא so that if the user is done editing they don't have to go through all
   *  steps all over just to save"_).
   *
   *  Safe by construction rather than by care, and §2 is why: `steps.submit` **re-validates
   *  every step** and navigates to the first one carrying a problem, so a save from step one
   *  cannot commit past an unanswered step two — it lands you on it, marked. And it does not
   *  touch §5's commit-once rule: this is still one commit, just reachable earlier.
   *
   *  Off by default, and `BookingSheet` turns it on only for an EDIT. On a create the steps are
   *  questions the type shapes, and a form that offers to finish before it has asked them is
   *  inviting a save it will refuse. */
  saveAnywhere?: boolean;
  busy?: boolean;
  destructive?: { label: string; onClick: () => void };
}) {
  return (
    <FormActions
      primary={{
        label: steps.isLast ? (saveLabel ?? t.common.save) : t.common.steps.next,
        onClick: steps.isLast ? steps.submit : steps.next,
        busy,
      }}
      alternate={
        saveAnywhere && !steps.isLast
          ? { label: saveLabel ?? t.common.save, onClick: steps.submit, busy }
          : undefined
      }
      secondary={{
        label: steps.isFirst ? t.common.cancel : t.common.steps.back,
        onClick: steps.isFirst ? onCancel : steps.back,
      }}
      destructive={destructive}
    />
  );
}
