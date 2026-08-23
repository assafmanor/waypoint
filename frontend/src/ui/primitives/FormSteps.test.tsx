// @vitest-environment jsdom
// ADR-0155. Two halves are tested here for different reasons: the **navigation and the
// back layer** because two shipped surfaces depend on them, and the **footer plus §3's
// re-validate-everything** because nothing else does yet — `BookingSheet` is deferred by
// §5, so until a form adopts it this file is the only thing holding those rules up.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { wrapNav } from '../../test/nav-harness';
import { Sheet } from '../Sheet';
import { Field } from './Field';
import { useFormErrors, type FieldProblem } from './useFormErrors';
import { FormStepActions, FormStepPanel, useFormSteps } from './FormSteps';
import { t } from '../../i18n/he';

type F = 'a' | 'b';

/** A two-step form on the primitive, whose two steps refuse whatever the test says.
 *  Deliberately shaped like a real host: the hook is called by whatever renders the
 *  `Sheet`, never inside it, which is the ordering the back layer depends on. */
function Host({
  problems = {},
  breakLater,
  onCommit = () => {},
  onCancel = () => {},
  header,
}: {
  problems?: Partial<Record<'one' | 'two', readonly FieldProblem<F>[]>>;
  /** Step one passes its gate and only fails afterwards — which is what a field
   *  emptied AFTER you stepped past it looks like, and the only way step one's
   *  problem can still be there when the save runs. */
  breakLater?: readonly FieldProblem<F>[];
  onCommit?: () => void;
  onCancel?: () => void;
  /** What the host pins beside the read-out — the panel's header slot. */
  header?: ReactNode;
}) {
  const errors = useFormErrors<F>();
  const [past, setPast] = useState(false);
  const steps = useFormSteps({
    steps: [
      {
        id: 'one',
        validate: () => (past && breakLater ? breakLater : (problems.one ?? [])),
      },
      { id: 'two', validate: () => problems.two ?? [] },
    ],
    errors,
    onCommit,
  });
  if (!steps.isFirst && !past) setPast(true);
  return (
    <Sheet title="טופס" onClose={onCancel}>
      <FormStepPanel steps={steps} labels={['ראשון', 'שני']} header={header}>
        {steps.isFirst ? (
          <Field label="שדה א" {...errors.field('a')}>
            <input aria-label="a" />
          </Field>
        ) : (
          <Field label="שדה ב" {...errors.field('b')}>
            <input aria-label="b" />
          </Field>
        )}
      </FormStepPanel>
      <FormStepActions steps={steps} onCancel={onCancel} />
    </Sheet>
  );
}

const next = () => fireEvent.click(screen.getByText(t.common.steps.next));
const save = () => fireEvent.click(screen.getByText(t.common.save));
const fieldOf = (name: string) => screen.getByLabelText(name).closest('.field');

describe('FormSteps — the footer says where you are', () => {
  afterEach(() => cleanup());

  it('offers הבא and ביטול on the first step', () => {
    render(wrapNav(<Host />));
    expect(screen.getByText(t.common.steps.next)).toBeTruthy();
    expect(screen.getByText(t.common.cancel)).toBeTruthy();
    expect(screen.queryByText(t.common.save)).toBeNull();
    expect(screen.queryByText(t.common.steps.back)).toBeNull();
  });

  it('becomes שמירה and הקודם on the last', () => {
    render(wrapNav(<Host />));
    next();
    expect(screen.getByText(t.common.save)).toBeTruthy();
    expect(screen.getByText(t.common.steps.back)).toBeTruthy();
    expect(screen.queryByText(t.common.steps.next)).toBeNull();
    expect(screen.queryByText(t.common.cancel)).toBeNull();
  });

  it('cancels rather than stepping back from the first step', () => {
    const onCancel = vi.fn();
    render(wrapNav(<Host onCancel={onCancel} />));
    fireEvent.click(screen.getByText(t.common.cancel));
    expect(onCancel).toHaveBeenCalled();
  });

  it('states the step as a read-out, with no way to jump', () => {
    render(wrapNav(<Host />));
    const bar = document.querySelector('.form-steps-bar')!;
    expect(bar.getAttribute('aria-label')).toBe(`${t.common.steps.progress(1, 2)} · ראשון`);
    // A dot is not a control (§2): jumping would presume every step is independently
    // valid, which a branching flow is not.
    expect(bar.querySelector('button')).toBeNull();
    next();
    expect(document.querySelector('.form-steps-bar')!.getAttribute('aria-label')).toBe(
      `${t.common.steps.progress(2, 2)} · שני`,
    );
  });
});

describe('FormSteps — a step gate refuses at the field (ADR-0150)', () => {
  afterEach(() => cleanup());

  it('holds the step and marks the field when the current step refuses', () => {
    render(wrapNav(<Host problems={{ one: [{ field: 'a', message: 'חסר' }] }} />));
    next();
    expect(fieldOf('a')?.hasAttribute('data-invalid')).toBe(true);
    expect(fieldOf('a')?.querySelector('.field-error')?.textContent).toBe('חסר');
    // Still on step one.
    expect(screen.getByText(t.common.steps.next)).toBeTruthy();
  });

  it('advances once the step reports nothing', () => {
    render(wrapNav(<Host />));
    next();
    expect(screen.getByLabelText('b')).toBeTruthy();
  });
});

describe('FormSteps — the save re-validates every step (ADR-0155 §3)', () => {
  afterEach(() => cleanup());

  it('commits once when every step is clean', () => {
    const onCommit = vi.fn();
    render(wrapNav(<Host onCommit={onCommit} />));
    next();
    save();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  // The rule the whole §3 exists for: a problem left behind on step one must not be
  // saved past just because you are standing on step two.
  it('navigates BACK to the first step carrying a problem, and marks it there', () => {
    const onCommit = vi.fn();
    render(wrapNav(<Host breakLater={[{ field: 'a', message: 'חסר' }]} onCommit={onCommit} />));
    next();
    expect(screen.getByLabelText('b')).toBeTruthy();
    save();

    expect(onCommit).not.toHaveBeenCalled();
    // Back on step one, carrying the mark.
    expect(screen.getByLabelText('a')).toBeTruthy();
    expect(fieldOf('a')?.hasAttribute('data-invalid')).toBe(true);
    expect(fieldOf('a')?.querySelector('.field-error')?.textContent).toBe('חסר');
    // **And the field is FOCUSED**, which is the half a message alone does not buy and
    // the reason the report is deferred past the step's render. `report` marks by looking
    // the node up in the live DOM; run in the same tick as the navigation it finds a step
    // that has not mounted yet, so it silently skips the nudge and the focus while the
    // caption still appears — a refusal you cannot see, which is the whole of ADR-0150.
    expect(document.activeElement).toBe(screen.getByLabelText('a'));
  });

  it('marks in place when the failing step is the one you are on', () => {
    const onCommit = vi.fn();
    render(
      wrapNav(<Host problems={{ two: [{ field: 'b', message: 'גם חסר' }] }} onCommit={onCommit} />),
    );
    next();
    save();
    expect(onCommit).not.toHaveBeenCalled();
    expect(fieldOf('b')?.hasAttribute('data-invalid')).toBe(true);
  });

  it('reports the EARLIEST failing step, not the nearest', () => {
    render(
      wrapNav(
        <Host
          breakLater={[{ field: 'a', message: 'ראשון חסר' }]}
          problems={{ two: [{ field: 'b', message: 'שני חסר' }] }}
        />,
      ),
    );
    next();
    save();
    expect(screen.getByLabelText('a')).toBeTruthy();
    expect(fieldOf('a')?.querySelector('.field-error')?.textContent).toBe('ראשון חסר');
  });
});

describe('FormSteps — the step back is a back layer (ADR-0103)', () => {
  afterEach(() => cleanup());

  it('peels the step before the sheet, and the sheet only after', () => {
    const onCancel = vi.fn();
    render(wrapNav(<Host onCancel={onCancel} />));
    next();
    expect(screen.getByLabelText('b')).toBeTruthy();

    // Escape runs the resolver, so whichever listener fires the stack decides what peels.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByLabelText('a')).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();

    // Now there is no step left, so the next one reaches the Modal's own layer.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('registers nothing on the first step, so back leaves immediately', () => {
    const onCancel = vi.fn();
    render(wrapNav(<Host onCancel={onCancel} />));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('FormSteps — a chooser has nothing to refuse', () => {
  afterEach(() => cleanup());

  /** No `errors`, no `validate`, no footer: the shape both `PlanDay` surfaces have. */
  function Chooser({ onCommit }: { onCommit: () => void }) {
    const [picked, setPicked] = useState<string | null>(null);
    const steps = useFormSteps({ steps: [{ id: 'which' }, { id: 'where' }], onCommit });
    return (
      <Sheet title="בחירה" onClose={onCommit}>
        <FormStepPanel steps={steps}>
          {steps.isFirst ? (
            <button
              onClick={() => {
                setPicked('א');
                steps.next();
              }}
            >
              בחר
            </button>
          ) : (
            <div>נבחר {picked}</div>
          )}
        </FormStepPanel>
      </Sheet>
    );
  }

  it('advances on a choice with no reporter wired', () => {
    render(wrapNav(<Chooser onCommit={() => {}} />));
    fireEvent.click(screen.getByText('בחר'));
    expect(screen.getByText('נבחר א')).toBeTruthy();
  });

  it('still gives the step its own back layer', () => {
    const onClose = vi.fn();
    render(wrapNav(<Chooser onCommit={onClose} />));
    fireEvent.click(screen.getByText('בחר'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('בחר')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('FormSteps — the pane travels, it never animates height', () => {
  afterEach(() => cleanup());

  // ADR-0155 §4, and the reason it is a rule: a step panel can hold a composer that
  // grows without bound, and a height tween needs a fixed cap that would clip it —
  // ADR-0152 §6's `.wp-event-actions` defect, one surface over.
  it('marks its arrival direction and nothing else', () => {
    render(wrapNav(<Host />));
    expect(document.querySelector('.form-step')?.getAttribute('data-step-nav')).toBe('forward');
    next();
    expect(document.querySelector('.form-step')?.getAttribute('data-step-nav')).toBe('forward');
    fireEvent.click(screen.getByText(t.common.steps.back));
    expect(document.querySelector('.form-step')?.getAttribute('data-step-nav')).toBe('back');
  });
});

/* ── The step's identity stays on screen (field report, 2026-08-23) ────────────────────
   Two screenshots, before and after scrolling, in which both the step name and the booking
   type were gone: a journey with three stops scrolls well past a screen, and once the heading
   leaves there is nothing saying which step you are on. */
describe('FormSteps — the identity is pinned, in ONE box', () => {
  afterEach(() => cleanup());

  it('keeps the read-out and whatever the host pins in a single sticky box', () => {
    render(wrapNav(<Host header={<div className="host-pin">טיסה</div>} />));
    const head = document.querySelector('.form-steps-head')!;
    expect(head).toBeTruthy();
    // **One box, and this is the assertion that matters.** Two sticky siblings would leave
    // the container's own gap between them, and the content scrolls THROUGH that gap —
    // measured at 24px. So both live inside this element, not beside it.
    expect(head.querySelector('.form-steps-bar')).toBeTruthy();
    expect(head.querySelector('.host-pin')).toBeTruthy();
    // And it is not inside the pane that travels, which is what would scroll it away.
    expect(head.closest('.form-step')).toBeNull();
  });

  it('sticks the read-out alone when the host pins nothing', () => {
    render(wrapNav(<Host />));
    const head = document.querySelector('.form-steps-head')!;
    expect(head.querySelector('.form-steps-bar')).toBeTruthy();
    expect(head.children.length).toBe(1);
  });
});
