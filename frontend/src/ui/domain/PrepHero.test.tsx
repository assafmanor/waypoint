// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { PrepHero } from './PrepHero';
import { PREP_TIER } from '../../lib/prep-tier';
import { t } from '../../i18n/he';

afterEach(cleanup);

const NOW = Date.parse('2026-09-10T13:18:00Z');
const FLIGHT = Date.parse('2026-09-11T03:40:00Z');

const base = {
  dates: <>11–22 בספטמבר</>,
  readinessPct: 80,
  openTasks: 3,
  overdue: 1,
  nowMs: NOW,
};

describe('PrepHero — the run-up to departure (ADR-0221)', () => {
  // The reported defect: `countdownParts` returns `מחר`/`מחרתיים` as a UNIT with no value,
  // and the hero printed the unit in the 15px rung. A standalone word is the value now.
  it('prints a standalone word in the value slot, and a numeral with its unit', () => {
    const { container, rerender } = render(
      <PrepHero
        {...base}
        tier={PREP_TIER.EVE2}
        countdown={{ prefix: '', value: '', unit: 'מחרתיים' }}
      />,
    );
    expect(container.querySelector('.prep-count-n')?.textContent).toBe('מחרתיים');
    expect(container.querySelector('.prep-count-u')).toBeNull();
    expect(container.querySelector('.prep')?.getAttribute('data-tier')).toBe('eve2');

    rerender(
      <PrepHero
        {...base}
        tier={PREP_TIER.FAR}
        countdown={{ prefix: 'בעוד', value: '47', unit: 'ימים' }}
      />,
    );
    expect(container.querySelector('.prep-count-n')?.textContent).toBe('47');
    expect([...container.querySelectorAll('.prep-count-u')].map((n) => n.textContent)).toEqual([
      'בעוד',
      'ימים',
    ]);
  });

  it('lights the runway inside the last week only', () => {
    const lamps = [true, true, false, false, false, false, false];
    const { container, rerender } = render(
      <PrepHero
        {...base}
        tier={PREP_TIER.WEEK}
        runway={lamps}
        countdown={{ prefix: 'בעוד', value: '5', unit: 'ימים' }}
      />,
    );
    expect(container.querySelectorAll('.prep-runway i')).toHaveLength(7);
    expect(container.querySelectorAll('.prep-runway i.on')).toHaveLength(2);
    rerender(
      <PrepHero
        {...base}
        tier={PREP_TIER.FAR}
        runway={lamps}
        countdown={{ prefix: 'בעוד', value: '9', unit: 'ימים' }}
      />,
    );
    expect(container.querySelector('.prep-runway')).toBeNull();
  });

  // The eve: the headline is the departure-board clock, the word drops to the kicker, and
  // the first timed thing on day 1 is named — the same fact `trip.tomorrow` pushes.
  it('on the eve, the headline is a ticking flap clock to the first thing and the word is the kicker', () => {
    const { container, rerender } = render(
      <PrepHero
        {...base}
        tier={PREP_TIER.EVE}
        countdown={{ prefix: '', value: '', unit: 'מחר' }}
        eve={{ targetMs: FLIGHT, title: 'טיסה לקפלביק', icon: '✈️', time: '06:40' }}
      />,
    );
    expect(container.querySelector('.prep-k-eve')?.textContent).toBe(
      `${t.planHome.prep.departIn} מחר`,
    );
    const clock = container.querySelector('[role="timer"]')!;
    const digits = [...clock.querySelectorAll('.prep-flap')].map((c) => c.textContent).join('');
    expect(digits).toBe('142200');
    expect(clock.getAttribute('aria-label')).toBe(t.board.inPhrase('14:22 שעות'));
    expect(container.querySelector('.prep-eve')?.textContent).toContain('טיסה לקפלביק');
    expect(container.querySelector('.prep-eve')?.textContent).toContain('06:40');

    // A tick: only the seconds cells change, and they carry no stagger.
    rerender(
      <PrepHero
        {...base}
        nowMs={NOW + 1000}
        tier={PREP_TIER.EVE}
        countdown={{ prefix: '', value: '', unit: 'מחר' }}
        eve={{ targetMs: FLIGHT, title: 'טיסה לקפלביק', time: '06:40' }}
      />,
    );
    const after = [...container.querySelectorAll('.prep-flap')].map((c) => c.textContent).join('');
    expect(after).toBe('142159');
  });

  it('counts to the day itself, with no sentence, when nothing on day 1 is timed', () => {
    const { container } = render(
      <PrepHero
        {...base}
        tier={PREP_TIER.EVE}
        countdown={{ prefix: '', value: '', unit: 'מחר' }}
        eve={{ targetMs: FLIGHT }}
      />,
    );
    expect(container.querySelector('[role="timer"]')).toBeTruthy();
    expect(container.querySelector('.prep-eve')).toBeNull();
  });

  // Readiness at 100% is a status and takes `--ok`; anything less stays the plan ink.
  it('marks the readiness bar full only at 100%', () => {
    const { container, rerender } = render(
      <PrepHero
        {...base}
        tier={PREP_TIER.FAR}
        countdown={{ prefix: 'בעוד', value: '9', unit: 'ימים' }}
        readinessPct={99}
      />,
    );
    expect(container.querySelector('.prep-fill.is-full')).toBeNull();
    rerender(
      <PrepHero
        {...base}
        tier={PREP_TIER.FAR}
        countdown={{ prefix: 'בעוד', value: '9', unit: 'ימים' }}
        readinessPct={100}
      />,
    );
    expect(container.querySelector('.prep-fill.is-full')).toBeTruthy();
  });

  // ADR-0160 §4: the pressable hero is a `<button>`, and nothing interactive may live in it —
  // the flap clock included. Chrome closes a `<button>` at a nested one.
  it('is a button with no nested control when pressable, and a div otherwise', () => {
    const onPress = vi.fn();
    const { container, rerender } = render(
      <PrepHero
        {...base}
        tier={PREP_TIER.EVE}
        countdown={{ prefix: '', value: '', unit: 'מחר' }}
        eve={{ targetMs: FLIGHT, title: 'טיסה' }}
        onPress={onPress}
        pressLabel="open"
      />,
    );
    const hero = container.querySelector('.prep')!;
    expect(hero.tagName).toBe('BUTTON');
    expect(hero.querySelectorAll('button, a, input, select, textarea')).toHaveLength(0);
    fireEvent.click(hero);
    expect(onPress).toHaveBeenCalledWith(hero);

    const onRebuff = vi.fn();
    rerender(
      <PrepHero
        {...base}
        tier={PREP_TIER.FAR}
        countdown={{ prefix: 'בעוד', value: '9', unit: 'ימים' }}
        onRebuff={onRebuff}
      />,
    );
    const plain = container.querySelector('.prep')!;
    expect(plain.tagName).toBe('DIV');
    fireEvent.click(plain);
    expect(onRebuff).toHaveBeenCalledWith(plain);
  });
});
