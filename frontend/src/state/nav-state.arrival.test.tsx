// @vitest-environment jsdom
//
// **The one-shot id in the URL** (`useArrivalParam`), which three surfaces run and which now
// has to be right for two more: `?event=` is what makes a place's reference land on the card
// it names, on both day surfaces.
//
// Two properties, and the second is the one a copy of this discipline keeps getting wrong: the
// value has to be readable **on the render it arrives** (the Day view's "land on now" decides
// at mount whether to stand down, and by the next render the param is gone), and it has to be
// **spent**, so a back or a reload does not re-open what you have since closed.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { EVENT_PARAM, useArrivalParam } from './nav-state';

/** Reports what the hook answered on each render, plus the live URL — so "taken" and "spent"
 *  are both visible to the assertions rather than inferred from one of them. */
function Probe({ seen }: { seen: string[] }) {
  const value = useArrivalParam(EVENT_PARAM);
  const { search } = useLocation();
  seen.push(String(value));
  return <span data-testid="url">{search}</span>;
}

const url = () => screen.getByTestId('url').textContent;

describe('useArrivalParam', () => {
  afterEach(() => cleanup());

  it('answers with the id on the arriving render, then spends it', () => {
    const seen: string[] = [];
    act(() => {
      render(
        <MemoryRouter initialEntries={['/?tab=days&event=ev-1']}>
          <Probe seen={seen} />
        </MemoryRouter>,
      );
    });
    // The first render — the one a mount-time decision sees — has the id.
    expect(seen[0]).toBe('ev-1');
    // …and it is gone from the URL, which is what stops a reload re-opening the card. The day
    // rides along untouched: only the one-shot is deleted.
    expect(url()).toBe('?tab=days');
    expect(seen.at(-1)).toBe('null');
  });

  it('answers null with nothing to take, and leaves the URL alone', () => {
    const seen: string[] = [];
    render(
      <MemoryRouter initialEntries={['/?tab=days&day=2026-07-20']}>
        <Probe seen={seen} />
      </MemoryRouter>,
    );
    expect(seen).toEqual(['null']);
    expect(url()).toBe('?tab=days&day=2026-07-20');
  });
});
