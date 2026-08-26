// @vitest-environment jsdom
//
// What sits between two rows of the day (ADR-0159), and — since ADR-0161 §9 — whether it
// answers when tapped. The component shipped without a test file at all, which is how the
// `<span>`/`<button>` distinction stayed a matter of reading the source.
//
// The GEOMETRY is not asserted here and cannot be: jsdom loads no CSS and reports every rect
// as zero, so the 44px touch target (an out-of-flow `::after`, since this row's height is the
// list's rhythm) is a browser claim. What is assertable is the posture — which element it is,
// what it says, and what it does — and that is what §9 changed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BOOKING_TYPE } from '@waypoint/shared';
import { ConnectionBand, GapStrip, JourneyBlock } from './DayJoinRow';
import { approxTravelTime } from '../../lib/duration';
import { t } from '../../i18n/he';

const LENGTH = 'שעתיים';

describe('GapStrip', () => {
  afterEach(() => cleanup());

  it('states the free time as a measurement, in both postures', () => {
    render(<GapStrip length={LENGTH} />);
    expect(screen.getByText(t.day.join.free(LENGTH))).toBeTruthy();
    cleanup();
    render(<GapStrip length={LENGTH} onFill={vi.fn()} />);
    expect(screen.getByText(t.day.join.free(LENGTH))).toBeTruthy();
  });

  // ADR-0159 §1 made this a `<span>` on purpose; §9 amended that, because filling a hole on
  // the ground is Tier-1 work (ADR-0025) and this is the one surface that states the hole.
  it('is a button that answers, when the host can act on it', () => {
    const onFill = vi.fn();
    render(<GapStrip length={LENGTH} onFill={onFill} />);
    const strip = screen.getByRole('button', { name: t.day.join.fillFree(LENGTH) });
    fireEvent.click(strip);
    expect(onFill).toHaveBeenCalledTimes(1);
    // …and it carries the one mark that says so.
    expect(strip.querySelector('.day-gap-add')).toBeTruthy();
  });

  // A past day is a read-only archive (ADR-0029), and a strip that looks tappable and is not
  // would be worse than the statement it replaced.
  it('stays the statement it was when the host passes no handler', () => {
    const { container } = render(<GapStrip length={LENGTH} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.day-gap-add')).toBeNull();
    expect(container.querySelector('div.day-gap')).toBeTruthy();
  });

  // The words did not change with the posture — the tap is a `＋`. The verb exists only as the
  // accessible name, because a screen reader has no glyph to read.
  it('says the same thing either way, and names the verb only to a screen reader', () => {
    render(<GapStrip length={LENGTH} onFill={vi.fn()} />);
    expect(screen.queryByText(t.day.join.fillFree(LENGTH))).toBeNull();
    expect(screen.getByRole('button').textContent).toBe(t.day.join.free(LENGTH));
  });
});

describe('ConnectionBand', () => {
  afterEach(() => cleanup());

  // Never tappable, and not for want of a handler: you are inside a commitment for the whole
  // of it, so there is no free time there to fill (ADR-0159's own distinction).
  it('is not a control at all — a connection is presence, not free time', () => {
    render(
      <ConnectionBand
        word={t.day.join.word[BOOKING_TYPE.FLIGHT]}
        length={LENGTH}
        placeName="דובאי"
        tight={false}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/דובאי/)).toBeTruthy();
  });
});

// ── THE JOURNEY BLOCK (ADR-0206 §V1.3, drawn in `a-travel-time-between-two-points-v2.html` §1) ──
//
// What the block SAYS and which element it is. The arithmetic behind every value is
// `lib/day-joins.ts`'s and is tested there; the 360px geometry is measured in Chromium, because
// jsdom loads no CSS — so the tone assertions here are on the CLASS, which is the contract the
// stylesheet keys on, and never on a colour.
describe('JourneyBlock', () => {
  afterEach(() => cleanup());

  const props = {
    mode: t.travelMode.walking,
    icon: 'walking' as const,
    duration: approxTravelTime(40 * 60) ?? '',
    distance: '2.4 ק״מ',
    leave: t.travel.leaveAtDay('17:15'),
    free: t.travel.freeBefore('שעתיים'),
    tone: 'time' as const,
  };

  it('reads place · journey · place: the mode, the duration, the leave-by and what is free', () => {
    render(<JourneyBlock {...props} />);
    expect(screen.getByText(t.travelMode.walking)).toBeTruthy();
    expect(screen.getByText(props.duration)).toBeTruthy();
    expect(screen.getByText(t.travel.leaveAtDay('17:15'))).toBeTruthy();
    expect(screen.getByText(t.travel.freeBefore('שעתיים'))).toBeTruthy();
    expect(screen.getByText('2.4 ק״מ')).toBeTruthy();
  });

  // **The hedge, and the `~` INSIDE the isolate.** Verified by measurement rather than by reading
  // (§AE7): without the isolate the tilde renders to the RIGHT of both digits and the line says
  // `40~`. `approxTravelTime` owns it so no caller can get it wrong, and this asserts the caller
  // did not go around it.
  it('carries the hedge with the tilde inside the bidi isolate', () => {
    const { container } = render(<JourneyBlock {...props} />);
    const head = container.querySelector('.day-trv-hd')!;
    expect(head.textContent).toContain(approxTravelTime(40 * 60));
    // `⁦` is LRI. The isolate opens BEFORE the tilde — that is the whole fix.
    expect(head.textContent).toContain('⁦~40⁩');
  });

  // §D7 — a passed leave-by is a negative STATUS, and it is ink and word only: no fill, no glow,
  // no pulse, because the app has one live mark and `.nowline` is it (§D6).
  it('marks a passed leave-by with the status class and no second live mark', () => {
    const { container } = render(
      <JourneyBlock {...props} leave={t.travel.leavePassed('17:15')} tone="miss" />,
    );
    expect(container.querySelector('.day-trv.miss')).toBeTruthy();
    expect(container.querySelector('.nowline')).toBeNull();
    expect(screen.getByText(t.travel.leavePassed('17:15'))).toBeTruthy();
  });

  // ADR-0141's journey grammar: somebody said they are moving, which is a LOCATION claim.
  it('turns teal once somebody is on the way', () => {
    const { container } = render(<JourneyBlock {...props} tone="on-way" />);
    expect(container.querySelector('.day-trv.on-way')).toBeTruthy();
  });

  // ADR-0207 §2 — the app saying it CHECKED. The hue rides the pin and not the sentence.
  it('shows `עדיין כאן` beside a passed leave-by when a fix earns it', () => {
    const { container } = render(
      <JourneyBlock {...props} tone="miss" located={t.travel.stillHere} />,
    );
    expect(screen.getByText(t.travel.stillHere)).toBeTruthy();
    expect(container.querySelector('.day-trv-here .icon')).toBeTruthy();
  });

  // ADR-0207 §7 — a mark with no way out was half of the report that produced it.
  it('offers the one control the tone asks for, and calls it', () => {
    const onPress = vi.fn();
    render(<JourneyBlock {...props} tone="miss" action={{ label: t.actions.onWay, onPress }} />);
    fireEvent.click(screen.getByRole('button', { name: t.actions.onWay }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // **ADR-0161 §9 survives the absorption.** The block replaces the strip, so deleting the strip's
  // one affordance with it would take a Tier-1 action off the surface that states the hole.
  it('keeps the strip’s fill tap, on the FACE so the mark and the verb do not nest', () => {
    const onFill = vi.fn();
    const { container } = render(
      <JourneyBlock
        {...props}
        tone="miss"
        onFill={onFill}
        fillLabel={t.day.join.fillFree('שעתיים')}
        action={{ label: t.actions.onWay, onPress: vi.fn() }}
      />,
    );
    const face = screen.getByRole('button', { name: t.day.join.fillFree('שעתיים') });
    fireEvent.click(face);
    expect(onFill).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.day-trv-add')).toBeTruthy();
    // A button inside a button is invalid markup, which is why the face is the control and the
    // acts row is its sibling — asserted, because the alternative renders and only fails in a
    // validator.
    expect(face.querySelector('button')).toBeNull();
  });

  // A past day is a read-only archive (ADR-0029), exactly as on `GapStrip`.
  it('stays a statement when the host passes no fill', () => {
    const { container } = render(<JourneyBlock {...props} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.day-trv-add')).toBeNull();
  });

  // §AD's bookend leg, and M8's declared תחב״צ, both land on the same shape: a block that says
  // less. Neither may print an empty separator or a stray dot.
  it('drops a run it was given nothing for, without leaving a separator behind', () => {
    const { container } = render(
      <JourneyBlock mode={t.travelMode.walking} icon="walking" tone="time" duration="~40 דק׳" />,
    );
    expect(container.querySelector('.day-trv-meta')).toBeNull();
    expect(container.querySelector('.day-trv-dist')).toBeNull();
  });
});
