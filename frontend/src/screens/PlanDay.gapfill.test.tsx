// @vitest-environment jsdom
//
// The gap sheet, after ADR-0116's session-202 amendment §4. It used to be handed
// the WHOLE unsorted pool on the one surface whose entire question is "which idea
// fits THIS slot" — nobody reported it because the sheet is opened less often than
// the shelf is looked at, which is what made it the worse of the two.
//
// The ranking itself is `lib/shelf.ts`'s and is tested there. What is only true on
// this surface, and what this file pins:
//   1. the cap, and a way past it that says how much it is capping;
//   2. the search appearing only past a threshold, so a small shelf never grows a
//      control it does not need — and searching past the cap, not within it;
//   3. `.gapfill-m` finally rendering, after being styled in `screens.css` and dead
//      since the sheet shipped.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SUGGESTION_REASON, type MaybeItem } from '@waypoint/shared';
import { GapFillSheet } from './PlanDay';
import type { RankedIdea } from '../lib/shelf';
import { wrapNav } from '../test/nav-harness';
import { GAP_FILL_CAP, GAP_FILL_SEARCH_AT } from '../constants';
import { t } from '../i18n/he';

const DAY = '2026-07-20';
const GAP = { date: DAY, start: '14:00', end: '16:00' };

const ranked = (title: string, i: number): RankedIdea => ({
  item: { id: `m${i}`, tripId: 't', title, consumed: false } as MaybeItem,
  reason: { code: SUGGESTION_REASON.NEAR_STOP, meters: 300 + i, stopName: 'מסעדת מון' },
});

/** `n` ideas, already ranked — the sheet never sorts, it only shows. */
const pool = (n: number) => Array.from({ length: n }, (_, i) => ranked(`רעיון ${i}`, i));

const openSheet = (ideas: RankedIdea[], onPickIdea = vi.fn()) => {
  render(
    wrapNav(
      <GapFillSheet
        gap={GAP}
        ideas={ideas}
        onPickIdea={onPickIdea}
        onNewEvent={() => {}}
        onClose={() => {}}
      />,
    ),
  );
  return onPickIdea;
};

const rowTitles = () =>
  [...document.querySelectorAll('.wp-reveal:not(.hidden) .gapfill-t')].map((n) => n.textContent);

describe('GapFillSheet', () => {
  afterEach(() => cleanup());

  it('renders the ranking reason in `.gapfill-m`, the slot that had never been emitted', () => {
    openSheet(pool(3));
    const metas = [...document.querySelectorAll('.gapfill-m')].map((n) => n.textContent);
    expect(metas).toHaveLength(3);
    expect(metas[0]).toContain('ממסעדת מון');
  });

  it('shows the whole pool below the cap, with no way-through and no search', () => {
    openSheet(pool(GAP_FILL_CAP));
    expect(rowTitles()).toHaveLength(GAP_FILL_CAP);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(t.planDay.gapFillAll(GAP_FILL_CAP))).toBeNull();
  });

  it('caps past it, and the way through names how many there are in total', () => {
    const n = GAP_FILL_SEARCH_AT + 5;
    openSheet(pool(n));
    expect(rowTitles()).toHaveLength(GAP_FILL_CAP);
    fireEvent.click(screen.getByText(t.planDay.gapFillAll(n)));
    expect(rowTitles()).toHaveLength(n);
  });

  it('grows a search only once the pool is big enough to need one', () => {
    openSheet(pool(GAP_FILL_SEARCH_AT));
    expect(screen.queryByRole('textbox')).toBeNull();
    cleanup();
    openSheet(pool(GAP_FILL_SEARCH_AT + 1));
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  // Searching only the visible six would answer the wrong question: the whole point
  // is to reach an idea the cap is hiding.
  it('searches the whole pool, not just the rows the cap left visible', () => {
    const ideas = [...pool(GAP_FILL_SEARCH_AT + 4), ranked('אודן קאשימה', 99)];
    openSheet(ideas);
    expect(rowTitles()).not.toContain('אודן קאשימה');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'אודן' } });
    expect(rowTitles()).toEqual(['אודן קאשימה']);
  });

  it('says so when a search matches nothing, rather than showing a blank sheet', () => {
    openSheet(pool(GAP_FILL_SEARCH_AT + 2));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'זזזזז' } });
    expect(rowTitles()).toHaveLength(0);
    expect(screen.getByText(t.planDay.gapFillEmpty)).toBeTruthy();
  });

  it('hands back the idea that was picked', () => {
    const onPick = openSheet(pool(3));
    fireEvent.click(screen.getByText('רעיון 1'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('still offers a fresh event, which is the answer when no idea fits', () => {
    openSheet(pool(0));
    expect(screen.getByText(t.planDay.gapFillEmpty)).toBeTruthy();
    expect(screen.getByText(t.actions.newEvent)).toBeTruthy();
  });
});
