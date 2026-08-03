// @vitest-environment jsdom
//
// jsdom has no `Element.prototype.animate` and no CSS engine, so nothing here can
// assert that the hero LOOKS right — the geometry is verified in a real browser against
// the real stylesheets, which is the only place this class of defect is visible
// (`frontend/CLAUDE.md`: jsdom reports every rect as zero).
//
// What a fake `animate` CAN cover is every decision the hook makes: whether to fly at
// all, which boxes it flies between, which channels it touches, and whether the styles
// it borrows come back. That is `useMapCamera`'s precedent — count the methods actually
// called and a fake is cheaper than the bug.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { useLiftFlight } from './useLiftFlight';

interface Call {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

let calls: Call[] = [];
let resolveFinished: (() => void)[] = [];
let cancelled = 0;

/** A minimal `Animation`: the four members the hook touches. */
function fakeAnimation(): Animation {
  let settle: () => void = () => {};
  const finished = new Promise<Animation>((resolve) => {
    settle = () => resolve({} as Animation);
  });
  resolveFinished.push(settle);
  return {
    finished,
    cancel: () => {
      cancelled += 1;
    },
  } as unknown as Animation;
}

const BOARD = { left: 8, top: 300, width: 358, height: 290 };
const SETTLED = { left: 8, top: 128, width: 374, height: 584 };

function rect(box: typeof BOARD): DOMRect {
  return { ...box, right: box.left + box.width, bottom: box.top + box.height } as DOMRect;
}

/** The hero under test, with both ends measurable. */
function Harness({ closing, origin }: { closing: boolean; origin: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useLiftFlight({ subject: ref, origin, closing });
  return <div data-testid="hero" ref={ref} />;
}

function makeOrigin(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => rect(BOARD);
  document.body.appendChild(el);
  return el;
}

describe('useLiftFlight', () => {
  beforeEach(() => {
    calls = [];
    resolveFinished = [];
    cancelled = 0;
    // `--t-base` / `--t-quick` are unreadable in jsdom, so `motionDurationMs` answers 0
    // and nothing would fly. Stub the read rather than the tokens: every duration in the
    // app comes through here, so this is the one seam.
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) => (name === '--t-quick' ? '140ms' : '240ms'),
    } as unknown as CSSStyleDeclaration);
    Element.prototype.animate = function (
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      calls.push({ keyframes, options });
      return fakeAnimation();
    } as typeof Element.prototype.animate;
    HTMLDivElement.prototype.getBoundingClientRect = () => rect(SETTLED);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('flies from the board box to the measured settled box', () => {
    render(<Harness closing={false} origin={makeOrigin()} />);
    expect(calls).toHaveLength(1);
    const [from, to] = calls[0].keyframes;
    expect(from).toMatchObject({ left: '8px', top: '300px', width: '358px', height: '290px' });
    expect(to).toMatchObject({ left: '8px', top: '128px', width: '374px', height: '584px' });
  });

  // §5: the box animates so text is crisp at both ends, and the swing is the one thing
  // `transform` is spent on. A scale anywhere in here would be the rejected option (b).
  it('carries the swing on the entrance and nothing that scales', () => {
    render(<Harness closing={false} origin={makeOrigin()} />);
    const [from, to] = calls[0].keyframes;
    expect(from.transform).toBe('perspective(900px) rotateX(9deg) translateZ(-46px)');
    expect(to.transform).toBe('none');
    expect(JSON.stringify(calls[0].keyframes)).not.toMatch(/scale/);
  });

  it('runs the entrance at --t-base and the descent at --t-quick', () => {
    const origin = makeOrigin();
    const view = render(<Harness closing={false} origin={origin} />);
    expect(calls[0].options.duration).toBe(240);
    view.rerender(<Harness closing origin={origin} />);
    expect(calls[1].options.duration).toBe(140);
  });

  // §7: the exit is not the entrance reversed, and a rotation on the way down is exactly
  // that. The path is the descent; the contact is the board's landing beat.
  it('descends without the swing', () => {
    const origin = makeOrigin();
    const view = render(<Harness closing={false} origin={origin} />);
    view.rerender(<Harness closing origin={origin} />);
    const [from, to] = calls[1].keyframes;
    expect(from.transform).toBe('none');
    expect(to.transform).toBe('none');
    // …and it lands ON the board, which is why the board may never be `display: none`.
    expect(to).toMatchObject({ top: '300px', height: '290px' });
  });

  it('borrows position: fixed for the flight and gives it back', async () => {
    const view = render(<Harness closing={false} origin={makeOrigin()} />);
    const hero = view.getByTestId('hero');
    expect(hero.style.position).toBe('fixed');
    expect(hero.style.margin).toBe('0px');
    resolveFinished[0]();
    await vi.waitFor(() => expect(hero.style.position).toBe(''));
    expect(hero.style.margin).toBe('');
  });

  // A close landing mid-entrance must supersede the flight, not race it: the entrance's
  // own cleanup would otherwise strip the styles the descent is using.
  it('cancels a flight still running when the next one starts', () => {
    const origin = makeOrigin();
    const view = render(<Harness closing={false} origin={origin} />);
    view.rerender(<Harness closing origin={origin} />);
    expect(cancelled).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it('leaves the styles to the live flight when a superseded one finishes', async () => {
    const origin = makeOrigin();
    const view = render(<Harness closing={false} origin={origin} />);
    const hero = view.getByTestId('hero');
    view.rerender(<Harness closing origin={origin} />);
    resolveFinished[0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(hero.style.position).toBe('fixed');
  });

  // The three cases the lifted state has to be correct as a STATIC state for.
  it('does not fly with no origin to fly from', () => {
    render(<Harness closing={false} origin={null} />);
    expect(calls).toEqual([]);
  });

  it('does not fly when the origin has no measurable box', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 0, height: 0 });
    document.body.appendChild(el);
    render(<Harness closing={false} origin={el} />);
    expect(calls).toEqual([]);
  });

  it('does not fly under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<Harness closing={false} origin={makeOrigin()} />);
    expect(calls).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('cancels an in-flight animation on unmount', () => {
    const view = render(<Harness closing={false} origin={makeOrigin()} />);
    view.unmount();
    expect(cancelled).toBe(1);
  });
});
