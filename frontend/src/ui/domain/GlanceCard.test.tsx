// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type DayGlance, type GlanceSeg } from '../../lib/glance';
import { glanceTrack } from '../../lib/glance-track';
import { GlanceCard } from './GlanceCard';
import { t } from '../../i18n/he';

const DAY = Date.parse('2026-07-19T00:00:00+09:00');
const at = (hour: number) => DAY + hour * 3600_000;

const seg = (over: Partial<GlanceSeg> & Pick<GlanceSeg, 'key'>): GlanceSeg => ({
  startFrac: 0.1,
  endFrac: 0.25,
  phase: 'upcoming',
  composite: false,
  clusterLike: false,
  count: 1,
  showCount: false,
  point: false,
  nextDay: false,
  spanned: false,
  ...over,
});

const glanceOf = (over: Partial<DayGlance> = {}): DayGlance => ({
  empty: false,
  windowStartMs: at(7),
  windowEndMs: at(23),
  segs: [
    seg({ key: 'a', startFrac: 0.1, endFrac: 0.25, phase: 'done' }),
    seg({ key: 'b', startFrac: 0.4, endFrac: 0.6, phase: 'now' }),
    seg({ key: 'c', startFrac: 0.7, endFrac: 0.9, composite: true, count: 3, showCount: true }),
  ],
  anchors: [],
  nowFrac: 0.45,
  remaining: 4,
  ...over,
});

/** The card takes its track already derived, exactly as the board takes its ribbon — so the spec
 *  builds it through the real adapter rather than hand-writing blocks that could disagree with it. */
const cardOf = (glance: DayGlance, props: Partial<Parameters<typeof GlanceCard>[0]> = {}) => (
  <GlanceCard
    glance={glance}
    track={glanceTrack({ glance, meta: { a: { icon: '🍜' }, b: { icon: '⛩️', hard: true } } })}
    {...props}
  />
);

describe('GlanceCard', () => {
  afterEach(() => cleanup());

  it('empty day → a calm teach state (not a 0/0 rail); onAdd fires', () => {
    const onAdd = vi.fn();
    const empty = glanceOf({ empty: true, segs: [], nowFrac: null, remaining: 0 });
    const { container } = render(cardOf(empty, { onAdd }));
    expect(container.querySelector('.glance-day.empty')).toBeTruthy();
    expect(container.querySelector('.wp-track')).toBeNull();
    expect(screen.getByText(t.glance.emptyTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  // ── THE RAIL IS THE SHARED TRACK (ADR-0215 §2) ─────────────────────────────
  it('draws one shared-track block per segment, positioned by time', () => {
    const { container } = render(cardOf(glanceOf()));
    const blocks = [...container.querySelectorAll('.glance-track .wp-track-blk')];
    expect(blocks).toHaveLength(3);
    expect((blocks[0] as HTMLElement).style.getPropertyValue('--s')).toBe('10%');
    expect((blocks[0] as HTMLElement).style.getPropertyValue('--w')).toBe('15%');
    // The old `.seg`/`.rail` vocabulary is gone rather than aliased: a second spelling of one
    // block is the drift `trackBlockClass` exists to prevent.
    expect(container.querySelector('.rail')).toBeNull();
    expect(container.querySelector('.seg')).toBeNull();
  });

  it('spends the fill on TWO axes: behind/ahead, and hard/soft', () => {
    const { container } = render(cardOf(glanceOf()));
    const blocks = [...container.querySelectorAll('.wp-track-blk')];
    // `done` is behind the clock → spent, and it is NOT green: the five phase fills went, so the
    // commitment axis could have the channel (ADR-0215 §3).
    expect(blocks[0].className).toContain('spent');
    // `now` is not spent — the clock's own line says where we are.
    expect(blocks[1].className).not.toContain('spent');
    expect(blocks[1].className).toContain('hard');
    // A composite keeps its cue and loses its number.
    expect(blocks[2].className).toContain('multi');
    expect(container.textContent).not.toContain('כולל');
    expect(container.textContent).not.toContain('×3');
  });

  it('keeps the clock, and drops the window own ends', () => {
    const { container } = render(cardOf(glanceOf()));
    const now = container.querySelector('.nowmark') as HTMLElement;
    expect(now.style.insetInlineStart).toBe('45%');
    expect(container.querySelector('.rail-ends')).toBeNull();
    expect(container.textContent).not.toContain('07:00');
    expect(container.textContent).not.toContain('23:00');
  });

  it('a browsed day has no clock in its window, and draws none', () => {
    const { container } = render(cardOf(glanceOf({ nowFrac: null })));
    expect(container.querySelector('.nowmark')).toBeNull();
  });

  // ── THE MARKS ──────────────────────────────────────────────────────────────
  it('marks are the events own icons, over the middle of their blocks', () => {
    const { container } = render(cardOf(glanceOf()));
    const marks = [...container.querySelectorAll('.wp-track-mark')];
    expect(marks.map((m) => m.textContent)).toEqual(['🍜', '⛩️']);
    // (0.1 + 0.25) / 2 — the block's midpoint, which is also the position thinning spaced by.
    expect((marks[0] as HTMLElement).style.getPropertyValue('--s')).toBe('17.5%');
    // `c` has no icon in the meta, so it carries no mark and its block stays.
    expect(container.querySelectorAll('.wp-track-blk')).toHaveLength(3);
  });

  it('no marks at all → no mark row, so the card does not reserve its height', () => {
    const glance = glanceOf();
    const { container } = render(
      <GlanceCard glance={glance} track={glanceTrack({ glance, meta: {} })} />,
    );
    expect(container.querySelector('.wp-track-marks')).toBeNull();
    expect(container.querySelectorAll('.wp-track-blk')).toHaveLength(3);
  });

  // ── A BRACKETED EDGE WITH NO BLOCK (ADR-0215 §2) ───────────────────────────
  it('an ambient stay edge becomes a hard tick at its own instant', () => {
    const glance = glanceOf({
      // ⁦0.32⁩ is BETWEEN the fixture's blocks (⁦0.1–0.25⁩ and ⁦0.4–0.6⁩) — an instant nothing else
      // occupies, which is the case the tick exists for. `glanceTrack` drops one that falls
      // inside a block, and this spec started life at ⁦0.2⁩ and correctly went red for it.
      anchors: [
        {
          kind: 'point',
          key: 'checkout',
          frac: 0.32,
          labelKey: 'checkOut',
          timeMs: at(10),
          icon: '🏨',
          standalone: true,
        },
      ],
    });
    const { container } = render(
      <GlanceCard glance={glance} track={glanceTrack({ glance, meta: {} })} />,
    );
    const tick = container.querySelector('.wp-track-blk.point.hard') as HTMLElement;
    expect(tick).toBeTruthy();
    expect(tick.style.getPropertyValue('--s')).toBe('32%');
    expect(container.querySelector('.wp-track-mark')?.textContent).toBe('🏨');
    // And the words that used to ride an amber pill are NOT here — they read on the day's rows.
    expect(container.textContent).not.toContain(t.glance.transition.checkOut);
    expect(container.querySelector('.achip')).toBeNull();
    expect(container.querySelector('.glance-marks')).toBeNull();
    expect(container.querySelector('.glance-legs')).toBeNull();
  });

  it('an anchor whose event IS on the rail draws no second object', () => {
    const glance = glanceOf({
      anchors: [
        {
          kind: 'span',
          key: 'b',
          startFrac: 0.4,
          endFrac: 0.6,
          startMs: at(13),
          endMs: at(16),
          startLabelKey: 'departure',
          endLabelKey: 'arrival',
          icon: '✈️',
          nextDay: false,
          standalone: false,
        },
      ],
    });
    const { container } = render(
      <GlanceCard glance={glance} track={glanceTrack({ glance, meta: {} })} />,
    );
    expect(container.querySelectorAll('.wp-track-blk')).toHaveLength(3);
  });

  // ── THE TWO LINES OF WORDS (ADR-0215 §4) ──────────────────────────────────
  it('the lead is a sentence, and the hard-anchor readout is gone', () => {
    const { container } = render(cardOf(glanceOf({ remaining: 4 })));
    expect(screen.getByText(t.glance.leftToday(4))).toBeTruthy();
    expect(container.querySelector('.glance-lead.done')).toBeNull();
    expect(container.querySelector('.lead .anchor')).toBeNull();
  });

  it('one thing left reads as one thing, not as a numeral', () => {
    render(cardOf(glanceOf({ remaining: 1 })));
    expect(screen.getByText(t.glance.leftToday(1))).toBeTruthy();
  });

  it('at zero the line goes quiet and leaves the evening to the night board', () => {
    const { container } = render(cardOf(glanceOf({ remaining: 0 })));
    expect(screen.getByText(t.glance.leftToday(0))).toBeTruthy();
    expect(container.querySelector('.glance-lead.done')).toBeTruthy();
  });

  it('the foot says where the day ends, and never `פנוי עד`', () => {
    const { container } = render(cardOf(glanceOf(), { dayEnd: '21:00' }));
    const foot = container.querySelector('.glance-foot')!;
    expect(foot.textContent).toContain(t.glance.dayEnds);
    expect(foot.textContent).toContain('~21:00');
    // The board's gap slot carries this within an inch of here (ADR-0215 §4).
    expect(container.textContent).not.toContain('פנוי עד');
  });

  it('the travel line renders through DayTravelTotal, and its absence costs no line', () => {
    const { container: withAir } = render(
      cardOf(glanceOf(), {
        dayEnd: '21:00',
        travel: {
          distanceMeters: null,
          travelSeconds: null,
          partial: false,
          airMeters: 1_240_000,
        },
      }),
    );
    expect(withAir.querySelector('.glance-foot .day-total-air')).toBeTruthy();
    expect(withAir.querySelector('.glance-foot .dot')).toBeTruthy();

    // A day with nothing measurable: no line, and no orphan separator either.
    const { container: bare } = render(
      cardOf(glanceOf(), {
        dayEnd: '21:00',
        travel: { distanceMeters: null, travelSeconds: null, partial: false, airMeters: null },
      }),
    );
    expect(bare.querySelector('.day-total')).toBeNull();
    expect(bare.querySelector('.glance-foot .dot')).toBeNull();
  });

  it('no foot at all when there is neither an end nor a distance', () => {
    const { container } = render(cardOf(glanceOf()));
    expect(container.querySelector('.glance-foot')).toBeNull();
  });
});
