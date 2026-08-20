// @vitest-environment jsdom
//
// The slot-fill sheet, after ADR-0116's session-202 amendment §4 and ADR-0161 §6. It used to
// be handed the WHOLE unsorted pool on the one surface whose entire question is "which idea
// fits THIS slot" — nobody reported it because the sheet is opened less often than the shelf
// is looked at, which is what made it the worse of the two.
//
// The ranking itself is `lib/shelf.ts`'s and is tested there. What is only true on this
// surface, and what this file pins:
//   1. the cap, and a way past it that says how much it is capping;
//   2. the search appearing only past a threshold, so a small shelf never grows a
//      control it does not need — and searching past the cap, not within it;
//   3. `.slotfill-m` rendering the reason at all, after being styled and dead since the
//      sheet shipped;
//   4. the accent following the MODE (ADR-0161 §6), which is what makes one sheet serving
//      both modes legal under root rule 4 rather than plan violet leaking into Trip mode.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SUGGESTION_REASON, type MaybeItem } from '@waypoint/shared';
import { clockRange } from '../../lib/time';
import { SlotFillSheet } from './SlotFillSheet';
import type { RankedIdea } from '../../lib/shelf';
import { wrapNav } from '../../test/nav-harness';
import { SLOT_FILL_CAP, SLOT_FILL_SEARCH_AT } from '../../constants';
import { t } from '../../i18n/he';
import type { Mode } from '../../lib/mode';

const DAY = '2026-07-20';
const GAP = { date: DAY, start: '14:00', end: '16:00' };

const ranked = (title: string, i: number): RankedIdea => ({
  item: { id: `m${i}`, tripId: 't', title, consumed: false } as MaybeItem,
  reason: { code: SUGGESTION_REASON.NEAR_STOP, meters: 300 + i, stopName: 'מסעדת מון' },
});

/** `n` ideas, already ranked — the sheet never sorts, it only shows. */
const pool = (n: number) => Array.from({ length: n }, (_, i) => ranked(`רעיון ${i}`, i));

const openSheet = (ideas: RankedIdea[], onPickIdea = vi.fn(), mode: Mode = 'plan') => {
  render(
    wrapNav(
      <SlotFillSheet
        title={t.slotFill.gapTitle(clockRange(GAP.start, GAP.end))}
        mode={mode}
        date={GAP.date}
        ideas={ideas}
        glyph={(m) => m.icon ?? ''}
        onPickIdea={onPickIdea}
        onNewEvent={() => {}}
        onClose={() => {}}
      />,
    ),
  );
  return onPickIdea;
};

const rowTitles = () =>
  [...document.querySelectorAll('.wp-reveal:not(.hidden) .slotfill-t')].map((n) => n.textContent);

describe('SlotFillSheet', () => {
  afterEach(() => cleanup());

  it('renders the ranking reason in `.slotfill-m`, the slot that had never been emitted', () => {
    openSheet(pool(3));
    const metas = [...document.querySelectorAll('.slotfill-m')].map((n) => n.textContent);
    expect(metas).toHaveLength(3);
    expect(metas[0]).toContain('ממסעדת מון');
  });

  it('shows the whole pool below the cap, with no way-through and no search', () => {
    openSheet(pool(SLOT_FILL_CAP));
    expect(rowTitles()).toHaveLength(SLOT_FILL_CAP);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(t.slotFill.all(SLOT_FILL_CAP))).toBeNull();
  });

  it('caps past it, and the way through names how many there are in total', () => {
    const n = SLOT_FILL_SEARCH_AT + 5;
    openSheet(pool(n));
    expect(rowTitles()).toHaveLength(SLOT_FILL_CAP);
    fireEvent.click(screen.getByText(t.slotFill.all(n)));
    expect(rowTitles()).toHaveLength(n);
  });

  it('grows a search only once the pool is big enough to need one', () => {
    openSheet(pool(SLOT_FILL_SEARCH_AT));
    expect(screen.queryByRole('textbox')).toBeNull();
    cleanup();
    openSheet(pool(SLOT_FILL_SEARCH_AT + 1));
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  // Searching only the visible six would answer the wrong question: the whole point
  // is to reach an idea the cap is hiding.
  it('searches the whole pool, not just the rows the cap left visible', () => {
    const ideas = [...pool(SLOT_FILL_SEARCH_AT + 4), ranked('אודן קאשימה', 99)];
    openSheet(ideas);
    expect(rowTitles()).not.toContain('אודן קאשימה');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'אודן' } });
    expect(rowTitles()).toEqual(['אודן קאשימה']);
  });

  it('says so when a search matches nothing, rather than showing a blank sheet', () => {
    openSheet(pool(SLOT_FILL_SEARCH_AT + 2));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'זזזזז' } });
    expect(rowTitles()).toHaveLength(0);
    expect(screen.getByText(t.slotFill.empty)).toBeTruthy();
  });

  it('hands back the idea that was picked', () => {
    const onPick = openSheet(pool(3));
    fireEvent.click(screen.getByText('רעיון 1'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('still offers a fresh event, which is the answer when no idea fits', () => {
    openSheet(pool(0));
    expect(screen.getByText(t.slotFill.empty)).toBeTruthy();
    expect(screen.getByText(t.actions.newEvent)).toBeTruthy();
  });

  // ADR-0161 §6: one sheet, two questions — and the second one is asked in Trip mode, where
  // plan violet is not available (root rule 4). The accent is a local variable the surface's
  // own `data-mode` re-points, so this is the assertion that keeps the reuse legal.
  describe('the accent follows the mode', () => {
    const modeOf = () => document.querySelector('.slotfill')?.getAttribute('data-mode');

    it('carries its own data-mode, because a Modal portals outside .app', () => {
      openSheet(pool(2), vi.fn(), 'plan');
      expect(modeOf()).toBe('plan');
      cleanup();
      openSheet(pool(2), vi.fn(), 'trip');
      expect(modeOf()).toBe('trip');
    });
  });

  // The two headers are the only thing that differs between the questions, and both come from
  // the host — so what this pins is that the sheet SHOWS what it was given, including the
  // second line a replacement carries and a gap fill does not.
  describe('the two headers', () => {
    it('says the slot for a gap, with the range in one LTR run', () => {
      openSheet(pool(1));
      // Not `18:00–15:00`: two clocks either side of a dash are two islands in an RTL flow,
      // so the range is isolated whole (ADR-0118, and the defect this shipped with).
      expect(screen.getByText(t.slotFill.gapTitle(clockRange('14:00', '16:00')))).toBeTruthy();
    });

    it('names the displaced event for a replacement, and says what it inherits', () => {
      render(
        wrapNav(
          <SlotFillSheet
            title={t.slotFill.replaceTitle('מוזיאון אדו')}
            sub={t.slotFill.replaceSub(clockRange('14:00', '16:00'))}
            mode="trip"
            date={DAY}
            ideas={pool(2)}
            glyph={(m) => m.icon ?? ''}
            onPickIdea={vi.fn()}
            onNewEvent={() => {}}
            onClose={() => {}}
          />,
        ),
      );
      expect(screen.getByText(t.slotFill.replaceTitle('מוזיאון אדו'))).toBeTruthy();
      expect(screen.getByText(t.slotFill.replaceSub(clockRange('14:00', '16:00')))).toBeTruthy();
    });

    it('shows no such line on a gap fill, which said it in the header', () => {
      openSheet(pool(1));
      expect(document.querySelector('.slotfill-sub')).toBeNull();
    });
  });
});
