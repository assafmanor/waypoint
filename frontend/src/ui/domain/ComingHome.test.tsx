// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ComingHome } from './ComingHome';
import { wrapNav } from '../../test/nav-harness';
import { COMING_HOME } from '../../constants';
import type { MemoryFigure } from '../../lib/memory-home';
import { t } from '../../i18n/he';

const FIGURES: MemoryFigure[] = [
  { key: 'places', value: '12', label: 'מקומות', unresolved: 2 },
  { key: 'air', value: '9,120', label: 'ק״מ באוויר' },
];

function paint(onDone = vi.fn()) {
  render(
    wrapNav(
      <ComingHome name="יפן ׳26" when="ספט׳ 2026" people={[]} figures={FIGURES} onDone={onDone} />,
    ),
  );
  return onDone;
}
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
/** A card's exit is `--t-quick`, which reads 0 in jsdom; a timer queued inside an earlier advance
 *  still needs a tick of its own. */
const flush = () => {
  tick(1);
  tick(1);
};

describe('ComingHome (ADR-0241 §3)', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('opens on the kicker and the name, then counts each figure, then settles and ends', () => {
    vi.useFakeTimers();
    const onDone = paint();
    expect(screen.getByText(t.planHome.past.comingHome.kicker)).toBeTruthy();
    expect(document.querySelector('.mem-beat-name')?.textContent).toContain('יפן ׳26');
    tick(COMING_HOME.OPEN_HOLD_MS);
    flush();
    expect(screen.getByText('מקומות')).toBeTruthy();
    expect(screen.getByText(t.planHome.past.unresolved(2))).toBeTruthy();
    tick(500);
    expect(document.querySelector('.mem-beat-v')?.textContent).toBe('12');
    expect(document.querySelectorAll('.mem-beat-steps > i.on')).toHaveLength(1);
    tick(COMING_HOME.CARD_MS);
    flush();
    expect(screen.getByText('ק״מ באוויר')).toBeTruthy();
    tick(500);
    // The count lands on the figure's own face, comma included.
    expect(document.querySelector('.mem-beat-v')?.textContent).toBe('9,120');
    tick(COMING_HOME.CARD_MS);
    flush();
    expect(document.querySelector('.mem-beat.is-settling')).toBeTruthy();
    flush();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a tap advances, and `דילוג` ends it at once', () => {
    vi.useFakeTimers();
    const onDone = paint();
    fireEvent.click(document.querySelector('.mem-beat')!);
    flush();
    expect(screen.getByText('מקומות')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.planHome.past.comingHome.skip }));
    flush();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
