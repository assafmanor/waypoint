// @vitest-environment jsdom
//
// **The stragglers, one at a time** (ADR-0240 §4, epic 4.4). The walk is the part that is new:
// an answer moves to the next row, the count keeps its denominator, and the last answer closes.
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TripEvent } from '@waypoint/shared';
import { t } from '../../i18n/he';
import type { Straggler } from '../../lib/memory-home';
import { wrapNav } from '../../test/nav-harness';
import { StragglersSheet } from './StragglersSheet';

const row = (id: string): Straggler => ({
  event: { id, title: `row ${id}` } as TripEvent,
  subject: 'ש׳ 02.05',
});

/** The host's shape: an answer takes the row off the list, as the recap does. */
function Host({ initial, onClose }: { initial: Straggler[]; onClose: () => void }) {
  const [rows, setRows] = useState(initial);
  const answer = (s: Straggler) => setRows((all) => all.filter((r) => r !== s));
  return <StragglersSheet rows={rows} onDone={answer} onSkip={answer} onClose={onClose} />;
}

describe('StragglersSheet', () => {
  afterEach(() => cleanup());

  it('walks the rows one at a time and closes after the last answer', () => {
    const onClose = vi.fn();
    render(wrapNav(<Host initial={[row('a'), row('b')]} onClose={onClose} />));

    expect(screen.getByText('row a')).toBeTruthy();
    expect(document.body.textContent).toContain(t.planHome.past.settle.progress(1, 2));
    fireEvent.click(screen.getByText(t.actions.wasThere));

    expect(screen.getByText('row b')).toBeTruthy();
    expect(document.body.textContent).toContain(t.planHome.past.settle.progress(2, 2));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(t.event.skipped));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prints no count when there is one row to ask about', () => {
    render(wrapNav(<Host initial={[row('a')]} onClose={() => {}} />));
    expect(document.body.textContent).not.toContain(t.planHome.past.settle.progress(1, 1));
  });
});
