// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useDragGhost, type DragGhost } from './useDragGhost';

/** The thing the drag starts from, at a known place on screen and with the kind of
 *  attributes a real draggable carries. jsdom reports a zero rect for everything, so
 *  the box is stubbed — the arithmetic on that rect against the pointer is exactly
 *  what's under test. */
function source(left: number, top: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bld soft';
  el.id = 'row-1';
  el.dataset.bldId = 'ev-1';
  el.innerHTML = '<span class="bld-ttl" data-shelf-drop="day">בוקר</span>';
  el.getBoundingClientRect = () =>
    ({ left, top, width: 340, height: 56, right: left + 340, bottom: top + 56 }) as DOMRect;
  return el;
}

function harness(): { ghost: DragGhost; host: () => HTMLElement } {
  let ghost!: DragGhost;
  function Host() {
    ghost = useDragGhost();
    return <div data-testid="ghost" ref={ghost.ref} />;
  }
  const { getByTestId } = render(<Host />);
  return { ghost, host: () => getByTestId('ghost') };
}

describe('useDragGhost (ADR-0116 sessions 117-118)', () => {
  afterEach(cleanup);

  // A DOM clone, not a re-render: that is what lets ONE ghost serve a shelf card and a
  // builder row without either needing a bespoke "draw me while dragging" renderer.
  it('clones the source into the host', () => {
    const { ghost, host } = harness();
    ghost.lift(source(0, 0), { clientX: 0, clientY: 0 });
    ghost.track({ clientX: 0, clientY: 0 });
    const clone = host().firstElementChild as HTMLElement;
    expect(clone.className).toBe('bld soft');
    expect(clone.textContent).toBe('בוקר');
  });

  // `pointer-events: none` keeps the clone out of `elementFromPoint`, but a
  // `querySelector` — in app code or in a test — would still find a duplicate id or
  // hit-test attribute. So the copy carries neither, at any depth.
  it('strips ids and data attributes from the clone, including nested ones', () => {
    const { ghost, host } = harness();
    ghost.lift(source(0, 0), { clientX: 0, clientY: 0 });
    const clone = host().firstElementChild as HTMLElement;
    expect(clone.id).toBe('');
    expect(clone.dataset.bldId).toBeUndefined();
    expect(clone.querySelector('[data-shelf-drop]')).toBeNull();
    expect(clone.querySelector('.bld-ttl')).not.toBeNull();
  });

  // Lifted out of its parent, a row that was full-width (or a card sized by a flex
  // strip) would otherwise shrink to fit its text.
  it('sizes the host to the source', () => {
    const { ghost, host } = harness();
    ghost.lift(source(0, 0), { clientX: 0, clientY: 0 });
    expect(host().style.width).toBe('340px');
    expect(host().style.height).toBe('56px');
  });

  // The point of the grab offset: the clone appears exactly where the original was,
  // rather than snapping its own top-left corner under the finger.
  it('keeps the clone under the finger where the source was grabbed', () => {
    const { ghost, host } = harness();
    // Grabbed 30px in and 20px down from the corner…
    ghost.lift(source(200, 400), { clientX: 230, clientY: 420 });
    // …so a finger at (330, 520) puts the corner at (300, 500).
    ghost.track({ clientX: 330, clientY: 520 });
    expect(host().style.transform).toBe('translate3d(300px, 500px, 0)');
  });

  it('follows every move', () => {
    const { ghost, host } = harness();
    ghost.lift(source(0, 0), { clientX: 0, clientY: 0 });
    ghost.track({ clientX: 5, clientY: 5 });
    expect(host().style.transform).toBe('translate3d(5px, 5px, 0)');
    ghost.track({ clientX: 5, clientY: 200 });
    expect(host().style.transform).toBe('translate3d(5px, 200px, 0)');
  });

  // The host renders a frame AFTER the lift (it only exists once the drag is in
  // state), so the ref attaching is what has to apply the clone and the first
  // position — otherwise the first paint flashes empty at the origin.
  it('fills and positions a host that mounts after the lift', () => {
    let ghost!: DragGhost;
    let show = false;
    function Host() {
      ghost = useDragGhost();
      return show ? <div data-testid="ghost" ref={ghost.ref} /> : null;
    }
    const { rerender, getByTestId } = render(<Host />);
    ghost.lift(source(100, 100), { clientX: 100, clientY: 100 });
    show = true;
    rerender(<Host />);
    expect(getByTestId('ghost').firstElementChild).not.toBeNull();
    expect(getByTestId('ghost').style.transform).toBe('translate3d(100px, 100px, 0)');
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
