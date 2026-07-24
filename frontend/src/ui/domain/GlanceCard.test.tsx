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

  it('renders each end of a zone-crossing span in its OWN zone + a shift pill', () => {
    // A same-day TLV→Tokyo flight: 09:00 Jerusalem → 23:00 Tokyo (+6). Rendered in
    // one zone the arrival would read 17:00 and the shift would be invisible.
    const crossing: DayGlance = {
      ...populated,
      anchors: [
        {
          kind: 'span',
          key: 's1',
          startFrac: 0.2,
          endFrac: 0.9,
          startMs: Date.parse('2026-07-19T09:00:00+03:00'),
          endMs: Date.parse('2026-07-19T23:00:00+09:00'),
          startLabelKey: 'departure',
          endLabelKey: 'arrival',
          icon: '✈️',
          nextDay: false,
          lane: 0,
          zones: { startZone: 'Asia/Jerusalem', endZone: 'Asia/Tokyo', deltaMinutes: 360 },
        },
      ],
    };
    const { container } = render(<GlanceCard glance={crossing} tz={TZ} />);
    const pill = container.querySelector('.glance-marks .span-anchor .achip.amber')!;
    expect(pill.textContent).toContain('09:00');
    expect(pill.textContent).toContain('23:00');
    expect(pill.querySelector('.wp-tzshift')?.textContent).toContain('+6');
  });

  it('renders a point anchor in its edge zone + its shift', () => {
    const zoned: DayGlance = {
      ...populated,
      anchors: [
        {
          ...populated.anchors[0],
          zone: 'Europe/Paris',
          deltaMinutes: -420,
        } as (typeof populated.anchors)[number],
      ],
    };
    const { container } = render(<GlanceCard glance={zoned} tz={TZ} />);
    const pill = container.querySelector('.glance-marks .tmark .achip.amber')!;
    // 15:00 Tokyo is 08:00 in Paris — the edge's own zone, not the card's.
    expect(pill.textContent).toContain('08:00');
    expect(pill.querySelector('.wp-tzshift')?.textContent).toContain('−7');
  });

  it('a zone-less anchor renders wholly in the card zone with no pill (single-zone trip)', () => {
    const { container } = render(<GlanceCard glance={populated} tz={TZ} />);
    const pill = container.querySelector('.glance-marks .tmark .achip.amber')!;
    expect(pill.textContent).toContain('15:00');
    expect(pill.querySelector('.wp-tzshift')).toBeNull();
  });

  it('the collapsed legs line renders the SAME pill as the band (no divergence)', () => {
    const anchors = [
      {
        kind: 'span' as const,
        key: 's1',
        startFrac: 0.2,
        endFrac: 0.9,
        startMs: Date.parse('2026-07-19T09:00:00+03:00'),
        endMs: Date.parse('2026-07-19T23:00:00+09:00'),
        startLabelKey: 'departure',
        endLabelKey: 'arrival',
        icon: '✈️',
        nextDay: false,
        lane: 0,
        zones: { startZone: 'Asia/Jerusalem', endZone: 'Asia/Tokyo', deltaMinutes: 360 },
      },
    ];
    const band = render(<GlanceCard glance={{ ...populated, anchors }} tz={TZ} />);
    const inBand = band.container.querySelector('.glance-marks .achip.amber')!.textContent;
    cleanup();
    const legs = render(
      <GlanceCard glance={{ ...populated, anchors, anchorsCollapsed: true }} tz={TZ} />,
    );
    expect(legs.container.querySelector('.glance-legs .achip.amber')!.textContent).toBe(inBand);
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
