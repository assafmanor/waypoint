// @vitest-environment jsdom
// The back-layer registry lifecycle (ADR-0103): the executor peels the topmost
// layer NON-destructively, so a repeatable layer that reports `remainsActive`
// stays registered and handles the next back too — the fix for a handler that
// consumes a back yet keeps its owner mounted (the divergent Index-filter back).
// `useReturnControls().run` drives the same `runBack` the system-back
// interceptor uses, so this exercises the real executor, not a stand-in.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../ui/Toast';
import { NavProvider, useBackLayer, useOverlay, useReturnControls } from './nav-state';

// NavProvider needs a router (useNavigate) + toast (useToast), the same nesting
// App.tsx uses. A button drives runBack('close-overlay') — the action the
// interceptor computes whenever a layer is open — so each click is "one back".
function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>
          {node}
          <BackButton />
        </NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

function BackButton() {
  const { run } = useReturnControls();
  return (
    <button onClick={() => run({ kind: 'close-overlay' })} data-testid="back">
      back
    </button>
  );
}

function back() {
  fireEvent.click(screen.getByTestId('back'));
}

/** A repeatable layer: the first back resets its state and STAYS (remainsActive),
 *  the second back (now unmodified) leaves. Mirrors the Index bookings filter. */
function RepeatableLayer({ onLeave }: { onLeave: () => void }) {
  const [modified, setModified] = useState(true);
  useBackLayer(() => {
    if (modified) {
      setModified(false);
      return { remainsActive: true };
    }
    onLeave();
    return { remainsActive: false };
  });
  return <div>{modified ? 'modified' : 'clean'}</div>;
}

afterEach(() => cleanup());

describe('back-layer registry lifecycle (ADR-0103)', () => {
  it('keeps a repeatable layer registered after it handles a back', () => {
    const onLeave = vi.fn();
    render(wrap(<RepeatableLayer onLeave={onLeave} />));

    back(); // resets the state, stays active — must NOT leave yet
    expect(onLeave).not.toHaveBeenCalled();

    back(); // now unmodified — this back reaches the SAME layer and leaves
    expect(onLeave).toHaveBeenCalledTimes(1);
    // The pre-ADR-0103 destructive pop() removed the layer on the first back, so
    // this second back would have found an empty stack and never called onLeave.
  });

  it('closes a dismissible overlay (useOverlay) on the first back', () => {
    const onClose = vi.fn();
    function Dismissible() {
      useOverlay(onClose);
      return <div>modal</div>;
    }
    render(wrap(<Dismissible />));

    back();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('peels nested layers topmost-first: overlay closes before the layer beneath', () => {
    const order: string[] = [];
    function Under() {
      useBackLayer(() => {
        order.push('under');
        return { remainsActive: false };
      });
      return <div>under</div>;
    }
    function Over() {
      useBackLayer(() => {
        order.push('over');
        return { remainsActive: false };
      });
      return <div>over</div>;
    }
    // Over mounts after Under, so it registers on top and peels first.
    render(
      wrap(
        <>
          <Under />
          <Over />
        </>,
      ),
    );

    back();
    back();
    expect(order).toEqual(['over', 'under']);
  });
});
