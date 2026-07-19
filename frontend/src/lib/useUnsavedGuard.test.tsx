// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useUnsavedGuard } from './useUnsavedGuard';

function Harness({ dirty, onClose }: { dirty: boolean; onClose: () => void }) {
  const { guardedClose, prompting, confirmDiscard, cancelDiscard } = useUnsavedGuard(dirty);
  return (
    <>
      <button onClick={() => guardedClose(onClose)}>close</button>
      {prompting && <div data-testid="prompt">discard?</div>}
      <button onClick={confirmDiscard}>discard</button>
      <button onClick={cancelDiscard}>keep</button>
    </>
  );
}

describe('useUnsavedGuard', () => {
  afterEach(() => cleanup());

  it('closes immediately when the form is clean', () => {
    const onClose = vi.fn();
    render(<Harness dirty={false} onClose={onClose} />);
    fireEvent.click(screen.getByText('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('prompt')).toBeNull();
  });

  it('prompts a discard confirm when the form is dirty', () => {
    const onClose = vi.fn();
    render(<Harness dirty onClose={onClose} />);
    fireEvent.click(screen.getByText('close'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('prompt')).toBeTruthy();
  });

  it('confirming the discard runs the intercepted close', () => {
    const onClose = vi.fn();
    render(<Harness dirty onClose={onClose} />);
    fireEvent.click(screen.getByText('close'));
    fireEvent.click(screen.getByText('discard'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('prompt')).toBeNull();
  });

  it('cancelling the discard keeps the form open', () => {
    const onClose = vi.fn();
    render(<Harness dirty onClose={onClose} />);
    fireEvent.click(screen.getByText('close'));
    fireEvent.click(screen.getByText('keep'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId('prompt')).toBeNull();
  });
});
