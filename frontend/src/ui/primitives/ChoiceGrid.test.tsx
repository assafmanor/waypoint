// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ChoiceGrid } from './ChoiceGrid';
import { fakeScroller } from '../../test/scroller-harness';

const OPTIONS = [
  { value: 'a', icon: '📕', label: 'Alpha' },
  { value: 'b', icon: '🛡️', label: 'Bravo' },
];

describe('ChoiceGrid', () => {
  afterEach(() => cleanup());

  it('renders a radiogroup with one radio per option, marking the selected one', () => {
    render(<ChoiceGrid options={OPTIONS} value="b" onChange={() => {}} ariaLabel="pick" />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Bravo' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Alpha' }).getAttribute('aria-checked')).toBe('false');
  });

  it('calls onChange with the option value on click', () => {
    const onChange = vi.fn();
    render(<ChoiceGrid options={OPTIONS} value="a" onChange={onChange} />);
    screen.getByRole('radio', { name: 'Bravo' }).click();
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('disables every card when disabled', () => {
    render(<ChoiceGrid options={OPTIONS} value="a" onChange={() => {}} disabled />);
    screen
      .getAllByRole('radio')
      .forEach((r) => expect((r as HTMLButtonElement).disabled).toBe(true));
  });

  it('exposes the column count as a style var for the grid', () => {
    const { container } = render(
      <ChoiceGrid options={OPTIONS} value="a" onChange={() => {}} columns={3} />,
    );
    expect(container.querySelector('.choice-grid')?.getAttribute('style')).toContain(
      '--choice-cols: 3',
    );
  });

  it('renders a scrollable pill row in pills layout, still a single-select radiogroup', () => {
    const { container } = render(
      <ChoiceGrid options={OPTIONS} value="a" onChange={() => {}} layout="pills" />,
    );
    expect(container.querySelector('.choice-grid.pills')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Alpha' }).className).toContain('choice-pill on');
    expect(screen.getByRole('radio', { name: 'Bravo' }).className).not.toContain('on');
  });

  // The selection centres itself in a scrolling row, the same as the day strip's pill
  // (`lib/useCenterSelected`, which owns the behaviour and its own test). Here: that the row
  // is wired to it at all, and only in the layout that scrolls.
  describe('the selected pill centres itself in the row', () => {
    const MANY = ['a', 'b', 'c', 'd', 'e'].map((v) => ({ value: v, icon: '📕', label: v }));

    /** 5 pills of 100px in a 300px row: pill `a`'s centre is 100px before the row's, `c`'s
     *  100px after (see the harness). */
    function scrollableRow(layout: 'grid' | 'pills', value: string) {
      const { container, rerender } = render(
        <ChoiceGrid options={MANY} value={value} onChange={() => {}} layout={layout} />,
      );
      const row = container.querySelector<HTMLElement>('.choice-grid')!;
      const pills = Array.from(container.querySelectorAll<HTMLElement>('button'));
      return {
        scroller: fakeScroller(row, pills),
        pick: (next: string) =>
          rerender(<ChoiceGrid options={MANY} value={next} onChange={() => {}} layout={layout} />),
      };
    }

    it('scrolls the row so the newly selected pill sits in the middle', () => {
      const { scroller, pick } = scrollableRow('pills', 'b');
      pick('c');
      expect(scroller.lastDelta()).toBe(100);
      pick('a');
      expect(scroller.lastDelta()).toBe(-100);
    });

    it('is pills-only: a grid has nothing to centre in', () => {
      const { scroller, pick } = scrollableRow('grid', 'b');
      pick('c');
      expect(scroller.calls).toHaveLength(0);
    });
  });

  // ADR-0122 §2: over a map the glyph is already the category's whole vocabulary
  // (ADR-0038), so the word beside it states the same thing twice. The flag is on the
  // primitive rather than a CSS trick precisely so the accessible name survives.
  describe('compact pills — glyph + count, and the label as the accessible name', () => {
    const WITH_COUNTS = [
      { value: 'a', icon: '📕', label: 'Alpha', count: 3 },
      { value: 'b', icon: '', label: 'Bravo', count: 1 },
    ];

    it('drops the word but keeps naming the button', () => {
      render(
        <ChoiceGrid options={WITH_COUNTS} value="a" onChange={() => {}} layout="pills" compact />,
      );
      const alpha = screen.getByRole('radio', { name: 'Alpha' });
      expect(alpha.textContent).not.toContain('Alpha');
      expect(alpha.textContent).toContain('📕');
      // The count is decorative, so it never becomes the name on its own.
      expect(alpha.querySelector('.choice-pill-count')?.textContent).toBe('3');
      expect(alpha.getAttribute('aria-label')).toBe('Alpha');
    });

    it('an option with no glyph keeps its word — there is nothing to stand in for it', () => {
      render(
        <ChoiceGrid options={WITH_COUNTS} value="a" onChange={() => {}} layout="pills" compact />,
      );
      const bravo = screen.getByRole('radio', { name: 'Bravo' });
      expect(bravo.textContent).toContain('Bravo');
      expect(bravo.getAttribute('aria-label')).toBeNull();
    });

    it('is a pills-only flag: the grid layout is untouched', () => {
      const { container } = render(
        <ChoiceGrid options={WITH_COUNTS} value="a" onChange={() => {}} compact />,
      );
      expect(container.querySelector('.compact')).toBeNull();
      expect(screen.getByRole('radio', { name: 'Alpha' }).textContent).toContain('Alpha');
    });

    it('says so in a class, so the dense padding is the primitive’s own', () => {
      const { container } = render(
        <ChoiceGrid options={WITH_COUNTS} value="a" onChange={() => {}} layout="pills" compact />,
      );
      expect(container.querySelector('.choice-grid.pills.compact')).toBeTruthy();
    });
  });

  // The scrolling row's edges fade where the content continues (ADR-0100 §6), through the one
  // shared mechanism `lib/edge-fade.ts` drives — not a copy of the gradient in this
  // component's stylesheet, and not on a grid, which does not scroll.
  describe('the edge fade', () => {
    it('is carried by the pills row', () => {
      const { container } = render(
        <ChoiceGrid options={OPTIONS} value="a" onChange={() => {}} layout="pills" />,
      );
      expect(container.querySelector('.choice-grid.pills.edge-fade')).toBeTruthy();
    });

    it('is not carried by the grid', () => {
      const { container } = render(<ChoiceGrid options={OPTIONS} value="a" onChange={() => {}} />);
      expect(container.querySelector('.edge-fade')).toBeNull();
    });
  });
});
