// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type DayGlance } from '../../lib/glance';
import { GlanceCard } from './GlanceCard';
import { t } from '../../i18n/he';

const TZ = 'Asia/Tokyo';
const DAY = Date.parse('2026-07-19T00:00:00+09:00');

const populated: DayGlance = {
  empty: false,
  windowStartMs: DAY + 7 * 3600_000,
  windowEndMs: DAY + 23 * 3600_000,
  segs: [
    {
      key: 'a',
      startFrac: 0.1,
      endFrac: 0.25,
      phase: 'done',
      composite: false,
      clusterLike: false,
      count: 1,
      showCount: false,
      point: false,
      nextDay: false,
      spanned: false,
    },
    {
      key: 'b',
      startFrac: 0.4,
      endFrac: 0.6,
      phase: 'now',
      composite: false,
      clusterLike: false,
      count: 1,
      showCount: false,
      point: false,
      nextDay: false,
      spanned: false,
    },
    {
      key: 'c',
      startFrac: 0.7,
      endFrac: 0.9,
      phase: 'upcoming',
      composite: true,
      clusterLike: false,
      count: 3,
      showCount: true,
      point: false,
      nextDay: false,
      spanned: false,
    },
  ],
  anchors: [
    {
      kind: 'point',
      key: 'p1',
      frac: 0.5,
      labelKey: 'checkin',
      timeMs: DAY + 15 * 3600_000,
      icon: '🏨',
      lane: 0,
    },
  ],
  anchorLaneCount: 1,
  anchorsCollapsed: false,
  nowFrac: 0.45,
  remaining: 4,
};

describe('GlanceCard', () => {
  afterEach(() => cleanup());

  it('empty day → a calm teach state (not a 0/0 rail); onAdd fires', () => {
    const onAdd = vi.fn();
    const empty: DayGlance = {
      empty: true,
      windowStartMs: DAY,
      windowEndMs: DAY,
      segs: [],
      anchors: [],
      anchorLaneCount: 0,
      anchorsCollapsed: false,
      nowFrac: null,
      remaining: 0,
    };
    const { container } = render(<GlanceCard glance={empty} tz={TZ} onAdd={onAdd} />);
    expect(container.querySelector('.glance-day.empty')).toBeTruthy();
    expect(container.querySelector('.rail')).toBeNull();
    expect(screen.getByText(t.glance.emptyTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('populated: renders the rail segments with per-phase coding + the now-marker', () => {
    const { container } = render(<GlanceCard glance={populated} tz={TZ} />);
    expect(container.querySelector('.seg.done')).toBeTruthy();
    expect(container.querySelector('.seg.now')).toBeTruthy();
    // Hollow-ahead composite carries the layered "multi" cue.
    expect(container.querySelector('.seg.upcoming.multi')).toBeTruthy();
    expect(container.querySelector('.nowmark')).toBeTruthy();
  });

  it('renders the lead "נותרו" count and a point time-anchor pill (ADR-0077)', () => {
    const { container } = render(<GlanceCard glance={populated} tz={TZ} />);
    expect(container.querySelector('.lead .v')?.textContent).toBe('4');
    expect(screen.getByText(t.glance.remaining)).toBeTruthy();
    // The check-in point anchor sits in the amber time-anchor band above the bar.
    expect(container.querySelector('.glance-marks .tmark .achip.amber')).toBeTruthy();
  });

  it('renders a span anchor (both edges today) as a bar + centered pill', () => {
    const spanGlance: DayGlance = {
      ...populated,
      anchors: [
        {
          kind: 'span',
          key: 's1',
          startFrac: 0.2,
          endFrac: 0.6,
          startMs: DAY + 10 * 3600_000,
          endMs: DAY + 14 * 3600_000,
          startLabelKey: 'departure',
          endLabelKey: 'arrival',
          icon: '✈️',
          nextDay: false,
          lane: 0,
        },
      ],
    };
    const { container } = render(<GlanceCard glance={spanGlance} tz={TZ} />);
    expect(container.querySelector('.glance-marks .span-anchor .bar')).toBeTruthy();
    expect(container.querySelector('.glance-marks .span-anchor .achip.amber')).toBeTruthy();
  });

  it('a crowded day collapses the anchor band to the legs line (ADR-0077 §D)', () => {
    const collapsed: DayGlance = { ...populated, anchorsCollapsed: true };
    const { container } = render(<GlanceCard glance={collapsed} tz={TZ} />);
    // The positioned band is gone; the flow legs line carries the same pills.
    expect(container.querySelector('.glance-marks')).toBeNull();
    expect(container.querySelector('.glance-legs .achip.amber')).toBeTruthy();
  });

  it('shows the hard anchor + foot (free-until / day-end) when provided', () => {
    const { container } = render(
      <GlanceCard
        glance={populated}
        tz={TZ}
        hardAnchorTime="15:00"
        freeUntil="12:30"
        dayEnd="22:00"
      />,
    );
    expect(container.querySelector('.lead .anchor')?.textContent).toContain('15:00');
    expect(container.querySelector('.glance-foot')?.textContent).toContain('12:30');
    expect(container.querySelector('.glance-foot')?.textContent).toContain('22:00');
  });
});
