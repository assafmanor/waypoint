// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ChoiceGrid } from './ChoiceGrid';

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
});
