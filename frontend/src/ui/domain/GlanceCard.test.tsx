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
    },
  ],
  markers: [
    { key: 'm1', frac: 0.5, labelKey: 'checkin', timeMs: DAY + 15 * 3600_000, icon: '🏨', lane: 0 },
  ],
  markerLaneCount: 1,
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
      markers: [],
      markerLaneCount: 0,
      nowFrac: null,
      remaining: 0,
    };
    const { container } = render(<GlanceCard glance={empty} tz={TZ} onAdd={onAdd} />);
    expect(container.querySelector('.wp-glance.empty')).toBeTruthy();
    expect(container.querySelector('.wp-glance-rail')).toBeNull();
    expect(screen.getByText(t.glance.emptyTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('populated: renders the rail segments with per-phase coding + the now-marker', () => {
    const { container } = render(<GlanceCard glance={populated} tz={TZ} />);
    expect(container.querySelector('.wp-glance-seg.done')).toBeTruthy();
    expect(container.querySelector('.wp-glance-seg.now')).toBeTruthy();
    // Hollow-ahead composite carries the layered "multi" cue.
    expect(container.querySelector('.wp-glance-seg.upcoming.multi')).toBeTruthy();
    expect(container.querySelector('.wp-glance-nowmark')).toBeTruthy();
  });

  it('renders the lead "נותרו" count and a transition marker chip (uncounted)', () => {
    const { container } = render(<GlanceCard glance={populated} tz={TZ} />);
    expect(container.querySelector('.wp-glance-lead .v')?.textContent).toBe('4');
    expect(screen.getByText(t.glance.remaining)).toBeTruthy();
    // The uncounted check-in marker (ADR-0054/0059) sits in the marker lane.
    expect(container.querySelector('.wp-glance-marks .wp-glance-tmark')).toBeTruthy();
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
    expect(container.querySelector('.wp-glance-lead .anchor')?.textContent).toContain('15:00');
    expect(container.querySelector('.wp-glance-foot')?.textContent).toContain('12:30');
    expect(container.querySelector('.wp-glance-foot')?.textContent).toContain('22:00');
  });
});
