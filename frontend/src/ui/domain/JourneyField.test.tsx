// @vitest-environment jsdom
// JourneyField (ADR-0203 §1–§3, §9). What is worth pinning is what the reported defect was
// about — how many DATES are on screen — and the two things the mockup's render got wrong
// before it was looked at: a summarised row that did not look tappable, and a summary that
// swallowed the journey's one date.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../state/nav-state', () => ({ useBackLayer: () => {} }));

import { JourneyField, type JourneyNode } from './JourneyField';
import { resolveJourneyDays } from '../../lib/journey-days';

const TLV = 'Asia/Jerusalem';
const AMS = 'Europe/Amsterdam';
const KEF = 'Atlantic/Reykjavik';
const DATE = '2026-08-12';

const node = (over: Partial<JourneyNode> & { timeZone: string }): JourneyNode => ({
  arriveLabel: 'נחיתה',
  departLabel: 'המראה',
  ...over,
});

/** One stop: TLV departs 15:30, AMS lands 19:40 and leaves 21:45, KEF lands 23:00. */
const withStop = (): JourneyNode[] => [
  node({ timeZone: TLV, placeName: 'נתב״ג', depart: { time: '15:30' } }),
  node({
    timeZone: AMS,
    placeName: 'אמסטרדם',
    arrive: { time: '19:40' },
    depart: { time: '21:45' },
  }),
  node({ timeZone: KEF, placeName: 'קפלוויק', arrive: { time: '23:00' } }),
];

const momentsOf = (nodes: JourneyNode[]) => {
  const out: { time: string; timeZone: string; dayOffset?: number }[] = [];
  nodes.forEach((n, i) => {
    if (i === 0) out.push({ time: n.depart?.time ?? '', timeZone: n.timeZone });
    else {
      out.push({
        time: n.arrive?.time ?? '',
        timeZone: n.timeZone,
        dayOffset: n.arrive?.dayOffset,
      });
      if (n.depart)
        out.push({ time: n.depart.time, timeZone: n.timeZone, dayOffset: n.depart.dayOffset });
    }
  });
  return out;
};

const draw = (nodes: JourneyNode[], over: Partial<Parameters<typeof JourneyField>[0]> = {}) =>
  render(
    <JourneyField
      nodes={nodes}
      date={DATE}
      onDateChange={vi.fn()}
      resolved={resolveJourneyDays(over.date ?? DATE, momentsOf(nodes))}
      onTimeChange={vi.fn()}
      onDayOffsetChange={vi.fn()}
      openNodeIndex={null}
      onOpenNode={vi.fn()}
      connection={{ word: 'עצירת ביניים', tightMinutes: 90 }}
      {...over}
    />,
  );

afterEach(cleanup);

describe('JourneyField — one date, and that is the whole point', () => {
  it('renders exactly ONE date control for the whole journey', () => {
    // The reported defect: two date+time pairs read as two flights. A return would need a
    // second absolute date, and there is one on screen — so the misread is not available.
    draw(withStop());
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(1);
  });

  it('names the PLACE on every moment, which the shipped form did not', () => {
    // `bs-leg-head`'s RouteLabel rendered only for a multi-leg journey, so the reported
    // single-leg case named neither end. `נחיתה · קפלוויק` cannot be a return's departure.
    draw(withStop());
    for (const name of ['נתב״ג', 'אמסטרדם', 'קפלוויק']) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it('states a later moment as a relative day rather than a date', () => {
    const nodes: JourneyNode[] = [
      node({ timeZone: TLV, placeName: 'נתב״ג', depart: { time: '23:40' } }),
      node({ timeZone: KEF, placeName: 'קפלוויק', arrive: { time: '04:25' } }),
    ];
    draw(nodes);
    expect(screen.getByText('למחרת')).toBeTruthy();
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(1);
  });
});

describe('JourneyField — the layover is stated while you type it', () => {
  it('draws the day view’s own band, with the wait it measures', () => {
    draw(withStop());
    // 19:40 → 21:45 in one zone is 2:05, and 125 minutes is over a flight's 90-minute line,
    // so it is not "short".
    const band = document.querySelector('.journey-stop');
    expect(band).not.toBeNull();
    expect(band!.textContent).toContain('2:05');
    expect(band!.className).not.toContain('tight');
  });

  it('says a short connection is short, at the type’s own line', () => {
    const nodes = withStop();
    nodes[1].depart = { time: '20:55' }; // 75 minutes, under 90
    draw(nodes);
    expect(document.querySelector('.journey-stop')!.className).toContain('tight');
  });

  it('states what each leg cost, on instants', () => {
    draw(withStop());
    // TLV 15:30 (+3) → AMS 19:40 (+2) is 5:10 elapsed, not the 4:10 a wall clock reads.
    expect(document.body.textContent).toContain('5:10');
  });
});

describe('JourneyField — a summarised node (§9)', () => {
  const summarised = () => draw(withStop(), { openNodeIndex: 2 });

  it('is a real token, because behaviour without affordance is the worse half', () => {
    // `ValueToken`'s own note: "a tappable thing inside a line has to look tappable… hence
    // a resting hairline rather than bold text that happens to open a panel". The first
    // drawing of this row was a bare button with no border and a 30px target.
    summarised();
    const tok = document.querySelector('.jf-sum .jf-sum-tok');
    expect(tok).not.toBeNull();
    expect(tok!.tagName).toBe('BUTTON');
    expect(tok!.className).toContain('vt');
    expect(tok!.className).toContain('vt-word');
  });

  it('keeps the journey’s ONE date when the first node is summarised', () => {
    // The first render of §9 collapsed it away — the date lives on node 0, so summarising
    // that node hid the single fact the design rests on.
    draw(withStop(), { openNodeIndex: 1 });
    expect(document.querySelector('.jf-sum .jf-sum-tok')!.textContent).toContain('12.8');
  });

  it('reopens the node it belongs to, rather than a step', () => {
    const onOpenNode = vi.fn();
    draw(withStop(), { openNodeIndex: 2, onOpenNode });
    fireEvent.click(document.querySelector<HTMLElement>('.jf-sum .jf-sum-tok')!);
    expect(onOpenNode).toHaveBeenCalledWith(0);
  });

  it('shows a stop’s wait on its summarised line, so nothing is lost by collapsing', () => {
    summarised();
    const rows = [...document.querySelectorAll('.jf-sum .jf-sum-tok')].map((r) => r.textContent);
    expect(rows.some((r) => r?.includes('המתנה'))).toBe(true);
  });

  it('opens every node when no index is given, which a single-leg journey wants', () => {
    draw(withStop());
    expect(document.querySelector('.jf-sum')).toBeNull();
  });
});

describe('JourneyField — the suggestion is offered only into an empty date (§5)', () => {
  const suggestion = { label: 'תחילת הטיול', detail: '12.8', mono: true, onAccept: vi.fn() };

  it('offers it when the date is empty', () => {
    draw(withStop(), { date: '', dateSuggestion: suggestion });
    expect(screen.getByText('תחילת הטיול')).toBeTruthy();
  });

  it('never offers it over a date that already has a value', () => {
    // The line between offering a DAY and guessing a value on a hard commitment.
    draw(withStop(), { dateSuggestion: suggestion });
    expect(screen.queryByText('תחילת הטיול')).toBeNull();
  });

  it('sets a numeral in the mono face and a word not', () => {
    draw(withStop(), { date: '', dateSuggestion: suggestion });
    expect(document.querySelector('.jf-offer-num')).not.toBeNull();
    cleanup();
    draw(withStop(), {
      date: '',
      dateSuggestion: { label: 'יום הקטע הקודם', detail: 'x', onAccept: vi.fn() },
    });
    expect(document.querySelector('.jf-offer-word')).not.toBeNull();
  });
});

describe('JourneyField — the mirror note (§6)', () => {
  it('says a seeded return is still a mirror, and drops the clause when it is not', () => {
    draw(withStop(), { heading: 'חזרה', mirrorNote: 'אותו מסלול בהיפוך' });
    expect(screen.getByText('אותו מסלול בהיפוך')).toBeTruthy();
    cleanup();
    draw(withStop(), { heading: 'חזרה' });
    expect(screen.queryByText('אותו מסלול בהיפוך')).toBeNull();
  });
});
