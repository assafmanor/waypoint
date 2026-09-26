// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DoneChip } from './DoneChip';
import { t } from '../../i18n/he';

describe('DoneChip', () => {
  afterEach(() => cleanup());

  it('is a plain record when nothing can take it back', () => {
    const { container } = render(<DoneChip />);
    const chip = container.querySelector('.wp-event-tag-done')!;
    expect(chip.textContent).toContain(t.event.didThis);
    expect(chip.getAttribute('role')).toBeNull();
    expect(chip.classList.contains('btn')).toBe(false);
  });

  it('is the undo when it can, by tap and by keyboard, without reaching its host', () => {
    const onUndo = vi.fn();
    const onHost = vi.fn();
    render(
      <div onClick={onHost}>
        <DoneChip onUndo={onUndo} />
      </div>,
    );
    const chip = screen.getByRole('button', { name: t.actions.undoDone });
    fireEvent.click(chip);
    fireEvent.keyDown(chip, { key: 'Enter' });
    expect(onUndo).toHaveBeenCalledTimes(2);
    expect(onHost).not.toHaveBeenCalled();
  });
});
