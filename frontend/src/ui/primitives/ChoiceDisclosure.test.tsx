// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ChoiceDisclosure } from './ChoiceDisclosure';
import { t } from '../../i18n/he';

const open = (props: Partial<Parameters<typeof ChoiceDisclosure>[0]> = {}) =>
  render(
    <ChoiceDisclosure
      glyph="🏨"
      label="לינה"
      open={false}
      onToggle={() => {}}
      ariaLabel="סוג"
      {...props}
    >
      <div role="radiogroup" aria-label="בחירה">
        <button type="button" role="radio" aria-checked="true">
          לינה
        </button>
      </div>
    </ChoiceDisclosure>,
  );

describe('ChoiceDisclosure', () => {
  afterEach(() => cleanup());

  it('states the value on the row, and names the row for assistive tech', () => {
    open();
    const row = screen.getByRole('button', { name: 'סוג' });
    expect(within(row).getByText('לינה')).toBeTruthy();
    expect(within(row).getByText(new RegExp(t.common.change))).toBeTruthy();
  });

  it('is the control: the whole row toggles, and there is only one target', () => {
    const onToggle = vi.fn();
    open({ onToggle });
    // One button, not a row plus a `שינוי` button inside it — two targets for one action is
    // what `.bs-type-change` (11px, under ADR-0017's floor) used to be.
    expect(screen.getAllByRole('button', { name: 'סוג' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'סוג' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reports its state through aria-expanded', () => {
    const { rerender } = open();
    expect(screen.getByRole('button', { name: 'סוג' }).getAttribute('aria-expanded')).toBe('false');
    rerender(
      <ChoiceDisclosure glyph="🏨" label="לינה" open onToggle={() => {}} ariaLabel="סוג">
        <div />
      </ChoiceDisclosure>,
    );
    expect(screen.getByRole('button', { name: 'סוג' }).getAttribute('aria-expanded')).toBe('true');
  });

  // **The panel is MOUNTED while closed and must not be reachable.** `Collapsible` never
  // unmounts its children (its transition needs something to animate against) and
  // `max-height: 0` hides a thing from the eye only — so without `inert` a screen reader reads
  // out a chooser that is not on screen and a keyboard tabs into it.
  it('keeps the closed panel out of reach, and lets it back in when open', () => {
    const { rerender } = open();
    expect(screen.getByRole('radiogroup', { name: 'בחירה' }).closest('[inert]')).toBeTruthy();
    rerender(
      <ChoiceDisclosure glyph="🏨" label="לינה" open onToggle={() => {}} ariaLabel="סוג">
        <div role="radiogroup" aria-label="בחירה" />
      </ChoiceDisclosure>,
    );
    expect(screen.getByRole('radiogroup', { name: 'בחירה' }).closest('[inert]')).toBeNull();
  });

  it('names where an unchosen value came from, and only while it is unchosen', () => {
    const { rerender } = open({ from: 'לפי ההזמנה' });
    expect(screen.getByText('לפי ההזמנה')).toBeTruthy();
    rerender(
      <ChoiceDisclosure glyph="🍽️" label="אוכל" open={false} onToggle={() => {}} ariaLabel="סוג">
        <div />
      </ChoiceDisclosure>,
    );
    expect(screen.queryByText('לפי ההזמנה')).toBeNull();
  });
});
