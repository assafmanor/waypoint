// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Field } from './Field';
import { useFormErrors, type FieldProblem } from './useFormErrors';

// jsdom has no layout engine and so no scrollIntoView — which is the thing this
// mechanism calls to make a refusal visible, so it is asserted, not just stubbed.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

type F = 'title' | 'date';

/** A two-field form that refuses whatever the test tells it to. */
function Harness({ problems }: { problems: FieldProblem<F>[] }) {
  const errors = useFormErrors<F>();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        errors.report(problems);
      }}
      {...errors.formProps}
    >
      <Field label="כותרת" htmlFor="title" {...errors.field('title')}>
        <input id="title" />
      </Field>
      <Field label="תאריך" htmlFor="date" {...errors.field('date')}>
        <input id="date" />
      </Field>
      {errors.formError && <p className="form-slot">{errors.formError}</p>}
      <button type="submit">שמירה</button>
    </form>
  );
}

const save = () => fireEvent.click(screen.getByText('שמירה'));
const fieldOf = (label: string) => screen.getByLabelText(label).closest('.field')!;

describe('useFormErrors', () => {
  afterEach(() => {
    cleanup();
    scrollIntoView.mockClear();
  });

  it('marks the field it names, and only that one', () => {
    render(<Harness problems={[{ field: 'title', message: 'חסרה כותרת' }]} />);
    save();
    expect(fieldOf('כותרת').hasAttribute('data-invalid')).toBe(true);
    expect(fieldOf('תאריך').hasAttribute('data-invalid')).toBe(false);
    expect(screen.getByRole('alert').textContent).toBe('חסרה כותרת');
  });

  // The whole point of collecting problems rather than returning at the first one:
  // a form with two things missing must not send the user round the loop twice.
  it('marks every missing field at once', () => {
    render(
      <Harness
        problems={[
          { field: 'title', message: 'חסרה כותרת' },
          { field: 'date', message: 'חסר תאריך' },
        ]}
      />,
    );
    save();
    expect(fieldOf('כותרת').hasAttribute('data-invalid')).toBe(true);
    expect(fieldOf('תאריך').hasAttribute('data-invalid')).toBe(true);
    expect(screen.getAllByRole('alert').map((el) => el.textContent)).toEqual([
      'חסרה כותרת',
      'חסר תאריך',
    ]);
  });

  it('nudges the marked field and brings the first one into view', () => {
    render(
      <Harness
        problems={[
          { field: 'date', message: 'חסר תאריך' },
          { field: 'title', message: 'חסרה כותרת' },
        ]}
      />,
    );
    save();
    expect(fieldOf('כותרת').classList.contains('is-nudging')).toBe(true);
    expect(fieldOf('תאריך').classList.contains('is-nudging')).toBe(true);
    // Document order, not the order the form authored its checks in.
    expect(document.activeElement).toBe(screen.getByLabelText('כותרת'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('retires a refusal when the field it named is addressed', () => {
    render(
      <Harness
        problems={[
          { field: 'title', message: 'חסרה כותרת' },
          { field: 'date', message: 'חסר תאריך' },
        ]}
      />,
    );
    save();
    fireEvent.input(screen.getByLabelText('כותרת'), { target: { value: 'ארוחת ערב' } });
    expect(fieldOf('כותרת').hasAttribute('data-invalid')).toBe(false);
    // …and leaves the one about a field nobody touched alone.
    expect(fieldOf('תאריך').hasAttribute('data-invalid')).toBe(true);
  });

  it('clears every mark on a save that finds nothing wrong', () => {
    const { rerender } = render(<Harness problems={[{ field: 'title', message: 'חסרה כותרת' }]} />);
    save();
    rerender(<Harness problems={[]} />);
    save();
    expect(fieldOf('כותרת').hasAttribute('data-invalid')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // A refusal with no field to point at — a failed save, an unexpected shape — has
  // to keep the one place it can read: the form's own slot.
  it('routes a fieldless problem to the form slot without marking anything', () => {
    render(<Harness problems={[{ field: null, message: 'השמירה נכשלה' }]} />);
    save();
    expect(document.querySelector('.form-slot')?.textContent).toBe('השמירה נכשלה');
    expect(document.querySelectorAll('[data-invalid]').length).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

/* ── A refusal is delivered to the DOM the refusal itself produces ─────────────────────
   The blocker behind the field report "I'm unable to continue to the next step… Perhaps I had
   missing fields in the form, but I received no nudge so idk": marking a field can be what
   PUTS it on screen (the journey rail summarises the nodes behind you and a summarised one
   renders no box), and `report` read its node map during the call — before the render its own
   state change caused. It found nothing, so nothing nudged and nothing scrolled, and the form
   declined to advance in silence. */
describe('useFormErrors — a field that appears BECAUSE it was refused', () => {
  afterEach(() => cleanup());

  /** A host that renders a field only once it carries a problem — the shape of a summarised
   *  rail node, reduced to the one property that matters. */
  function LateHost() {
    const errors = useFormErrors<'a'>();
    const mark = errors.field('a');
    return (
      <div>
        <button type="button" onClick={() => errors.report([{ field: 'a', message: 'חסר' }])}>
          שלח
        </button>
        {mark.error ? (
          <Field label="שדה" {...mark}>
            <input aria-label="a" />
          </Field>
        ) : null}
      </div>
    );
  }

  it('nudges and focuses the box that only rendered once the mark existed', () => {
    render(<LateHost />);
    expect(document.querySelector('[data-invalid]')).toBeNull();
    fireEvent.click(screen.getByText('שלח'));
    // The message arrives...
    expect(screen.getByText('חסר')).toBeTruthy();
    const box = document.querySelector('[data-invalid]');
    expect(box).toBeTruthy();
    // ...and so does the delivery: the effect runs after the commit, so the node is in the
    // map by the time it is looked up. Focus is the observable half in jsdom, which has no
    // layout and therefore no `scrollIntoView`.
    expect(document.activeElement).toBe(screen.getByLabelText('a'));
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
