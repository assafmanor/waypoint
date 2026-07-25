// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useDragGhost, type DragGhost } from './useDragGhost';

/** The card the drag starts from, at a known place on screen. jsdom reports a zero
 *  rect for everything, so the box is stubbed — the hook's whole job is arithmetic
 *  on that rect against the pointer, which is exactly what's under test. */
function cardAt(left: number, top: number): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left, top, width: 150, height: 132, right: left + 150, bottom: top + 132 }) as DOMRect;
  return el;
}

function harness(): { ghost: DragGhost; node: () => HTMLElement } {
  let ghost!: DragGhost;
  function Host() {
    ghost = useDragGhost();
    return <div data-testid="ghost" ref={ghost.ref} />;
  }
  const { getByTestId } = render(<Host />);
  return { ghost, node: () => getByTestId('ghost') };
}

const transform = (el: HTMLElement) => el.style.transform;

describe('useDragGhost (ADR-0116 session-117)', () => {
  afterEach(cleanup);

  // The point of the grab offset: the clone has to appear exactly where the card was,
  // not snap its own top-left corner under the finger.
  it('keeps the clone under the finger where the card was grabbed', () => {
    const { ghost, node } = harness();
    // Grabbed 30px in and 20px down from the card's corner…
    ghost.lift(cardAt(200, 400), { clientX: 230, clientY: 420 });
    // …so a finger at (330, 520) puts the clone's corner at (300, 500).
    ghost.track({ clientX: 330, clientY: 520 });
    expect(transform(node())).toBe('translate3d(300px, 500px, 0)');
  });

  it('places the clone at the lift point before the finger has moved', () => {
    const { ghost, node } = harness();
    ghost.lift(cardAt(10, 60), { clientX: 20, clientY: 80 });
    ghost.track({ clientX: 20, clientY: 80 });
    expect(transform(node())).toBe('translate3d(10px, 60px, 0)');
  });

  it('follows every move', () => {
    const { ghost, node } = harness();
    ghost.lift(cardAt(0, 0), { clientX: 0, clientY: 0 });
    ghost.track({ clientX: 5, clientY: 5 });
    expect(transform(node())).toBe('translate3d(5px, 5px, 0)');
    ghost.track({ clientX: 5, clientY: 200 });
    expect(transform(node())).toBe('translate3d(5px, 200px, 0)');
  });

  // The clone renders a frame AFTER the lift (it only exists once the drag is in
  // state), so the ref attaching is what has to apply the first position — otherwise
  // the first paint flashes at the origin before the first move arrives.
  it('positions a clone that mounts after the lift', () => {
    let ghost!: DragGhost;
    let show = false;
    function Host() {
      ghost = useDragGhost();
      return show ? <div data-testid="ghost" ref={ghost.ref} /> : null;
    }
    const { rerender, getByTestId } = render(<Host />);
    ghost.lift(cardAt(100, 100), { clientX: 100, clientY: 100 });
    show = true;
    rerender(<Host />);
    expect(transform(getByTestId('ghost'))).toBe('translate3d(100px, 100px, 0)');
  });

  it('tracking before anything mounted is not an error', () => {
    function Host() {
      const ghost = useDragGhost();
      ghost.track({ clientX: 1, clientY: 1 });
      return null;
    }
    expect(() => render(<Host />)).not.toThrow();
  });
});
