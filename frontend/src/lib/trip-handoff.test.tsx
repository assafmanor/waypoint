// @vitest-environment jsdom
//
// jsdom lays nothing out, so every rect it reports is zero — the exact condition
// `beginTripHandoff` refuses. That makes this file about the STORE's rules: who may claim
// a handoff, what a claim carries, and which pill hides itself while one is in flight.
// Whether the glyph actually LANDS on the pill is geometry, and it is measured in a real
// browser by `e2e/first-run-motion.spec.ts`.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  beginTripHandoff,
  claimTripHandoff,
  endTripHandoff,
  useTripHandoff,
  useTripHandoffTarget,
} from './trip-handoff';

/** A tile with a box, since jsdom won't give us one. */
function tile(glyph: string, box: Partial<DOMRect> = {}): HTMLElement {
  const el = document.createElement('span');
  el.textContent = glyph;
  const rect = { left: 20, top: 300, width: 46, height: 46, ...box } as DOMRect;
  el.getBoundingClientRect = () => rect;
  return el;
}

/** Renders the store, so assertions read it the way the layer does. */
function Probe() {
  const { origin, target } = useTripHandoff();
  return (
    <>
      <span data-testid="glyph">{origin?.glyph ?? '-'}</span>
      <span data-testid="from">{origin ? `${origin.left},${origin.top}` : '-'}</span>
      <span data-testid="to">{target ? `${target.left},${target.top}` : '-'}</span>
    </>
  );
}

/** The receiving pill, as the header renders it. */
function Pill({ tripId, at }: { tripId: string; at: Partial<DOMRect> }) {
  const handoff = useTripHandoffTarget(tripId);
  return (
    <span
      data-testid="pill"
      data-landing={handoff.landing}
      ref={(el) => {
        if (el) el.getBoundingClientRect = () => ({ width: 22, height: 22, ...at }) as DOMRect;
        handoff.ref.current = el;
      }}
    />
  );
}

afterEach(() => {
  endTripHandoff();
  cleanup();
});

describe('trip handoff — the pick', () => {
  it('carries the tapped tile: its glyph and its box', () => {
    expect(beginTripHandoff(tile('🌊'), 't1')).toBe(true);
    render(<Probe />);
    expect(screen.getByTestId('glyph').textContent).toBe('🌊');
    expect(screen.getByTestId('from').textContent).toBe('20,300');
    expect(screen.getByTestId('to').textContent).toBe('-');
  });

  it('refuses a tile with no measurable box — there is nothing to carry', () => {
    expect(beginTripHandoff(tile('🌊', { width: 0, height: 0 }), 't1')).toBe(false);
    render(<Probe />);
    expect(screen.getByTestId('glyph').textContent).toBe('-');
  });

  it('refuses a missing tile', () => {
    expect(beginTripHandoff(null, 't1')).toBe(false);
  });

  it('replaces anything already in flight — the newest tap wins', () => {
    beginTripHandoff(tile('🌊'), 't1');
    beginTripHandoff(tile('🏔', { left: 8, top: 90 }), 't2');
    render(<Probe />);
    expect(screen.getByTestId('glyph').textContent).toBe('🏔');
    expect(screen.getByTestId('from').textContent).toBe('8,90');
  });
});

describe('trip handoff — the landing', () => {
  it('the picked trip claims it on mount, and hides its own glyph until it lands', () => {
    beginTripHandoff(tile('🌊'), 't1');
    render(
      <>
        <Probe />
        <Pill tripId="t1" at={{ left: 300, top: 60 }} />
      </>,
    );
    expect(screen.getByTestId('to').textContent).toBe('300,60');
    expect(screen.getByTestId('pill').dataset.landing).toBe('true');
  });

  it('a trip nobody picked neither claims it nor hides itself', () => {
    beginTripHandoff(tile('🌊'), 't1');
    render(
      <>
        <Probe />
        <Pill tripId="other" at={{ left: 300, top: 60 }} />
      </>,
    );
    expect(screen.getByTestId('to').textContent).toBe('-');
    expect(screen.getByTestId('pill').dataset.landing).toBe('false');
  });

  it('a cold arrival — nothing was picked — leaves the pill visible', () => {
    render(<Pill tripId="t1" at={{ left: 300, top: 60 }} />);
    expect(screen.getByTestId('pill').dataset.landing).toBe('false');
  });

  it('is claimed once: the first target wins, so a remount cannot move the landing', () => {
    beginTripHandoff(tile('🌊'), 't1');
    render(
      <>
        <Probe />
        <Pill tripId="t1" at={{ left: 300, top: 60 }} />
      </>,
    );
    claimTripHandoff('t1', tile('🌊', { left: 999, top: 999 }));
    expect(screen.getByTestId('to').textContent).toBe('300,60');
  });

  it('ending it clears both ends in one go', () => {
    beginTripHandoff(tile('🌊'), 't1');
    render(
      <>
        <Probe />
        <Pill tripId="t1" at={{ left: 300, top: 60 }} />
      </>,
    );
    act(() => endTripHandoff());
    expect(screen.getByTestId('glyph').textContent).toBe('-');
    expect(screen.getByTestId('to').textContent).toBe('-');
    expect(screen.getByTestId('pill').dataset.landing).toBe('false');
  });
});
