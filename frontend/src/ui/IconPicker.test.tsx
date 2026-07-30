// @vitest-environment jsdom
//
// **WHERE THE PANEL OPENS** (ADR-0144's placement, added by ADR-0148's amendment on the
// owner's report that the picker is cut off in the Map's place card).
//
// `top: calc(100% + 6px)` is right in a form that scrolls under a header and wrong in a card
// anchored to the BOTTOM of the canvas — so the side is measured, not assumed, and the panel
// is capped to the room it has there. That decision is arithmetic over a rect, which is
// exactly what jsdom cannot supply and can be handed: the trigger's box and the panel's own
// height are stubbed here, and everything else is the real component.
//
// Why the height is stubbed rather than derived: the panel's natural height is CSS (a 232px
// grid cap plus its head and tabs), and no stylesheet runs in this environment. What is under
// test is "does what I am about to draw fit below" — so the height is an input to that
// question, not part of the answer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { wrapNav } from '../test/nav-harness';
import { IconPicker } from './IconPicker';

/** The panel's natural height with the default (categorised) icon set: head + tabs + the
 *  232px grid cap. A real number, so the fit question is a real one. */
const PANEL_H = 314;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('icon-panel') ? PANEL_H : 0;
    },
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
  cleanup();
});

/** Put the trigger somewhere in a viewport of a given height, then open the panel — the
 *  measurement runs in a layout effect on open, so the box has to be in place first. */
function openAt(triggerTop: number, viewport = 800) {
  window.innerHeight = viewport;
  render(wrapNav(<IconPicker icon="📌" onChange={() => {}} />));
  const wrap = document.querySelector('.icon-picker') as HTMLElement;
  wrap.getBoundingClientRect = () =>
    ({
      top: triggerTop,
      bottom: triggerTop + 44,
      left: 0,
      right: 44,
      width: 44,
      height: 44,
      x: 0,
      y: triggerTop,
      toJSON: () => ({}),
    }) as DOMRect;
  fireEvent.click(document.querySelector('.icon-chip')!);
  return document.querySelector('.icon-panel') as HTMLElement;
}

const room = (panel: HTMLElement) => panel.style.getPropertyValue('--icon-panel-room');

describe('the panel opens on the side that has room', () => {
  it('stays BELOW its trigger when the panel fits there — every other host of it does', () => {
    const panel = openAt(100);
    expect(panel.classList.contains('up')).toBe(false);
    // 800 − 8 (edge) − 144 (the trigger's bottom) − 6 (the gap).
    expect(room(panel)).toBe('642px');
  });

  it('flips UP when the trigger sits low, which is the Map place card', () => {
    // The reported case: the card is anchored to the canvas's bottom, so the chip is ~150px
    // off the foot of the screen and a 314px panel cannot be drawn below it.
    const panel = openAt(600);
    expect(panel.classList.contains('up')).toBe(true);
    expect(room(panel)).toBe('586px');
  });

  it('does NOT flip when below is short but above is shorter', () => {
    // A flip has to be an improvement, not a reflex. Neither side fits a 314px panel here,
    // so it takes the larger one and its grid scrolls — which is a scroll inside a region
    // that already scrolls, not the form-cut ADR-0148 §1 refuses.
    const panel = openAt(40, 400);
    expect(panel.classList.contains('up')).toBe(false);
    expect(room(panel)).toBe('302px');
  });

  it('is never capped ABOVE the room it measured, however little that is', () => {
    // The first pass floored the cap at a usable 180px, and that put the panel's own title
    // off the top of a 360×640 Android with the keyboard up — the reported bug, reproduced by
    // its own fix. A short panel scrolls its grid; a tall one is cut, and cut is the thing
    // being removed. So the cap is the room, full stop.
    const panel = openAt(100, 200);
    expect(room(panel)).toBe('86px'); // 100 (the trigger's top) − 6 (gap) − 8 (edge)
  });

  it('re-measures for each opening, so a moved trigger is not remembered', () => {
    const panel = openAt(600);
    expect(panel.classList.contains('up')).toBe(true);
    fireEvent.click(document.querySelector('.icon-chip')!);
    cleanup();
    expect(openAt(100).classList.contains('up')).toBe(false);
  });
});
