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
import { BOOKING_TYPE, LEG_TRAVEL_MODES, TRANSIT_LEG_MODE, TRAVEL_MODE } from '@waypoint/shared';
import { ConnectionBand, GapStrip, JourneyBlock, JourneyRow } from './DayJoinRow';
import { Icon } from '../Icon';
import { approxTravelTime, freeTimePhrase, hoursPhrase, shortfallPhrase } from '../../lib/duration';
import { dayJourney } from '../../lib/day-joins';
import { formatDistance } from '../../lib/distance';
import { t } from '../../i18n/he';

const MINUTES = 120;
const LENGTH = hoursPhrase(MINUTES);
const FREE = freeTimePhrase(MINUTES)!;

describe('GapStrip', () => {
  afterEach(() => cleanup());

  it('states the free time as a measurement, in both postures', () => {
    render(<GapStrip minutes={MINUTES} />);
    expect(screen.getByText(FREE)).toBeTruthy();
    cleanup();
    render(<GapStrip minutes={MINUTES} onFill={vi.fn()} />);
    expect(screen.getByText(FREE)).toBeTruthy();
  });

  // ADR-0159 §1 made this a `<span>` on purpose; §9 amended that, because filling a hole on
  // the ground is Tier-1 work (ADR-0025) and this is the one surface that states the hole.
  it('is a button that answers, when the host can act on it', () => {
    const onFill = vi.fn();
    render(<GapStrip minutes={MINUTES} onFill={onFill} />);
    const strip = screen.getByRole('button', { name: t.day.join.fillFree(LENGTH) });
    fireEvent.click(strip);
    expect(onFill).toHaveBeenCalledTimes(1);
    // …and it carries the one mark that says so.
    expect(strip.querySelector('.day-gap-add')).toBeTruthy();
  });

  // A past day is a read-only archive (ADR-0029), and a strip that looks tappable and is not
  // would be worse than the statement it replaced.
  it('stays the statement it was when the host passes no handler', () => {
    const { container } = render(<GapStrip minutes={MINUTES} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.day-gap-add')).toBeNull();
    expect(container.querySelector('div.day-gap')).toBeTruthy();
  });

  // The words did not change with the posture — the tap is a `＋`. The verb exists only as the
  // accessible name, because a screen reader has no glyph to read.
  it('says the same thing either way, and names the verb only to a screen reader', () => {
    render(<GapStrip minutes={MINUTES} onFill={vi.fn()} />);
    expect(screen.queryByText(t.day.join.fillFree(LENGTH))).toBeNull();
    expect(screen.getByRole('button').textContent).toBe(FREE);
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
    tone: 'time' as const,
  };

  it('reads place · journey · place: the mode, the duration, the leave-by, the distance', () => {
    render(<JourneyBlock {...props} />);
    expect(screen.getByText(t.travelMode.walking)).toBeTruthy();
    expect(screen.getByText(props.duration)).toBeTruthy();
    expect(screen.getByText(t.travel.leaveAtDay('17:15'))).toBeTruthy();
    expect(screen.getByText('2.4 ק״מ')).toBeTruthy();
  });

  // **AND IT SAYS NOTHING ABOUT FREE TIME** (owner, 2026-08-26 — ADR-0206 §AH3). The block is
  // about the LEG; what is free is about the HOLE, and it is stated by the quiet strip below.
  it('carries no free-time run at all', () => {
    const { container } = render(<JourneyBlock {...props} />);
    expect(container.querySelector('.day-trv-free')).toBeNull();
    expect(container.textContent).not.toContain(freeTimePhrase(120)!);
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

  // **AND THE FILL LEFT WITH IT.** ADR-0161 §9's affordance belongs to the thing that states the
  // free time, which is the strip again — two `＋` marks for one hole is what keeping both would
  // have drawn.
  it('is a statement and not a control', () => {
    const { container } = render(<JourneyBlock {...props} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.day-trv-add')).toBeNull();
    expect(container.querySelector('button.day-trv-face')).toBeNull();
  });

  // **THE MODE DISCLOSURE** (M8b, the owner's round-3 question: _"does the transit line expand to
  // enable choosing which transit … it should have a small downward facing arrow like we already
  // use for events no?"_). It is OPT-IN per host, which is what keeps the spec above true: a
  // block given no `modes` is still a statement, so a read-only archive and Plan's own posture
  // are unchanged by this existing at all.
  describe('the mode disclosure (ADR-0206 §M5)', () => {
    const withModes = (
      over: Partial<Parameters<typeof JourneyBlock>[0]['modes'] & object> = {},
    ) => {
      const onPick = vi.fn();
      const onToggle = vi.fn();
      const result = render(
        <JourneyBlock
          {...props}
          modes={{
            current: TRAVEL_MODE.WALKING,
            open: false,
            onPick,
            onToggle,
            ...over,
          }}
        />,
      );
      return { ...result, onPick, onToggle };
    };

    it('turns the face into a button with the caret events already use', () => {
      const { container, onToggle } = withModes();
      const face = container.querySelector('button.day-trv-face')!;
      expect(face.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('.day-trv-chev .icon')).toBeTruthy();
      fireEvent.click(face);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('says it is open, so the caret and the panel cannot disagree', () => {
      const { container } = withModes({ open: true });
      expect(container.querySelector('button.day-trv-face')!.getAttribute('aria-expanded')).toBe(
        'true',
      );
      expect(container.querySelector('.day-trv.open')).toBeTruthy();
    });

    // Four chips and not three: תחב״צ is a mode you can DECLARE and never one we route (§AA4).
    // Glyph-only, with the word as the accessible name — §AL7's measurement, not a preference.
    it('offers all four modes, named to a screen reader, with the current one pressed', () => {
      withModes({ open: true });
      for (const m of LEG_TRAVEL_MODES) {
        const chip = screen.getByRole('button', { name: t.travelMode[m] });
        expect(chip.querySelector('svg')).toBeTruthy();
        expect(chip.textContent).toBe('');
        expect(chip.getAttribute('aria-pressed')).toBe(String(m === TRAVEL_MODE.WALKING));
      }
      expect(LEG_TRAVEL_MODES).toContain(TRANSIT_LEG_MODE);
    });

    it('hands the picked mode back, transit included', () => {
      const { onPick } = withModes({ open: true });
      fireEvent.click(screen.getByRole('button', { name: t.travelMode[TRANSIT_LEG_MODE] }));
      expect(onPick).toHaveBeenCalledWith(TRANSIT_LEG_MODE);
    });
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

// ── THE LEG THAT DOES NOT FIT, RENDERED (ADR-0206 §AG) ────────────────────────────────────
//
// Reported on both day surfaces: a 78-minute walk into a 60-minute gap read `פנוי לפני 0 דק׳` —
// not a small amount of free time, a journey nobody can make. `JourneyRow` is where the arm
// becomes words, so it is asserted here rather than through a screen.
describe('JourneyRow — the journey does not fit', () => {
  afterEach(() => cleanup());

  const START = Date.parse('2026-07-12T05:00:00Z');
  const MIN = 60_000;
  const row = (holeMinutes: number, walkMinutes: number, nowOffsetMinutes = -10) => {
    const journey = dayJourney({
      departAfterMs: START,
      arriveByMs: START + holeMinutes * MIN,
      travelSeconds: walkMinutes * 60,
      distanceMeters: 5500,
      nowMs: START + nowOffsetMinutes * MIN,
    })!;
    return render(
      <JourneyRow journey={journey} travelMode={TRAVEL_MODE.WALKING} tz="Asia/Tokyo" />,
    );
  };

  it('says the shortfall, and never states free time it does not have', () => {
    const { container } = row(60, 78);
    expect(screen.getByText(shortfallPhrase(18)!)).toBeTruthy();
    expect(container.querySelector('.day-trv.miss')).toBeTruthy();
    // The number that was reported: nought minutes of free time.
    expect(container.textContent).not.toContain(freeTimePhrase(1)!);
    expect(container.textContent).not.toContain(hoursPhrase(0));
  });

  // The coverage mockup's `tight` state puts the warn glyph in the badge column, where the day
  // says what kind of thing a row is — and what this row is is a problem. The mode is still named
  // beside the duration, so nothing is lost.
  it('marks it in the badge column, and still names the mode and the distance', () => {
    row(60, 78);
    expect(screen.getByText(t.travelMode[TRAVEL_MODE.WALKING])).toBeTruthy();
    // `formatDistance`'s own output, not a literal: it isolates the numeral (ADR-0118), so a
    // hand-written string never matches what renders.
    expect(screen.getByText(formatDistance(5500))).toBeTruthy();
    expect(document.querySelector('.day-trv-ic .icon')).toBeTruthy();
  });

  // It offers no departure, because there was never one to make — and no `בדרך`, because the
  // answer to an impossible leg is to move something, not to say you are on your way.
  it('offers no leave-by', () => {
    const { container } = row(60, 78);
    expect(container.textContent).not.toContain('יציאה');
  });

  // **§AK, and it is a REVERSAL of what shipped in M7**: an infeasible leg used to have its mode
  // glyph REPLACED by the warn mark, which deletes the answer to "which mode is this?" exactly
  // when the reader is deciding whether to switch it. The mark is composited over the glyph
  // instead — one mark that overlays any of the four modes, rather than a glyph per mode per
  // state (M8a measured that as 6 now and 8 with תחב״צ). Asserted as geometry, because both
  // versions render "an icon in the badge column" and the old spec could not tell them apart.
  it('keeps the leg its own mode glyph and composites the warning over it (§AK)', () => {
    const { container } = row(60, 78);
    const badge = container.querySelector('.day-trv-ic')!;
    const walking = render(<Icon name={TRAVEL_MODE.WALKING} />).container.querySelector('svg')!;
    expect(badge.querySelector('svg')!.querySelector('path')!.getAttribute('d')).toBe(
      walking.querySelector('path')!.getAttribute('d'),
    );
    // …and the warning is a second mark ON that tile, not the tile's content.
    const flag = badge.querySelector('.day-trv-flag');
    expect(flag).toBeTruthy();
    expect(flag!.querySelector('svg')).toBeTruthy();
  });

  // The other half of the same reversal: a leg that FITS carries no mark at all, so the
  // composited mark still means something.
  it('composites nothing where the journey fits', () => {
    const { container } = row(160, 40);
    expect(container.querySelector('.day-trv-flag')).toBeNull();
  });

  // **AND WITH NO GAP AT ALL IT DOES NOT TALK ABOUT ONE** (owner, 2026-08-26). Two rows that touch
  // have no gap for the journey to be longer THAN, and the shortfall would be the journey's own
  // duration — already in the head one line up.
  it('says there is no time, rather than a shortfall, when the rows touch', () => {
    const { container } = row(0, 12);
    expect(screen.getByText(t.travel.noTimeForTravel)).toBeTruthy();
    expect(container.textContent).not.toContain(shortfallPhrase(12)!);
    // …and the duration is stated exactly once, in the head.
    expect(container.querySelectorAll('.day-trv-hd').length).toBe(1);
  });

  it('is still the ordinary read where the journey fits', () => {
    const { container } = row(160, 40);
    expect(container.querySelector('.day-trv.miss')).toBeNull();
    expect(container.querySelector('.day-trv-ic .icon')).toBeTruthy();
    // The leave-by is the line, and free time is the strip's below (§AH3).
    expect(container.textContent).toContain('יציאה');
    expect(container.textContent).not.toContain(freeTimePhrase(120)!);
  });
});

// ── A LEG THAT WAS NEVER MAKEABLE, READ AFTER THE FACT (ADR-0206 §AH1) ────────────────────
//
// Reported off the deploy: a past hole holding a walk longer than itself read `פנוי לפני 0 דק׳`.
// `dayJourney` checks `PAST` before `OVERRUNS` on purpose — advice about a departure is useless
// once the next row has started — but `freeSeconds` is CLAMPED at zero, so the record it keeps
// was the one number that is not true. A record states what happened; it does not invent nought
// minutes of free time.
describe('JourneyRow — a hole behind you that the journey never fitted', () => {
  afterEach(() => cleanup());

  const START = Date.parse('2026-07-12T05:00:00Z');
  const MIN = 60_000;
  const past = (holeMinutes: number, walkMinutes: number) =>
    render(
      <JourneyRow
        journey={dayJourney({
          departAfterMs: START,
          arriveByMs: START + holeMinutes * MIN,
          travelSeconds: walkMinutes * 60,
          nowMs: START + (holeMinutes + 30) * MIN,
        })!}
        travelMode={TRAVEL_MODE.WALKING}
        tz="Asia/Tokyo"
      />,
    );

  it('states the shortfall rather than nought minutes free', () => {
    const { container } = past(60, 78);
    expect(screen.getByText(shortfallPhrase(18)!)).toBeTruthy();
    expect(container.textContent).not.toContain(hoursPhrase(0));
  });

  // The record keeps the measurement and drops the advice — there was never a departure to make.
  it('offers no leave-by on a hole behind you', () => {
    const { container } = past(60, 78);
    expect(container.textContent).not.toContain('יציאה');
  });

  // **And it stays quiet.** The tone is the one thing `PAST` still decides: a finished day painted
  // in `--miss` is a warning about something nobody can act on, which is the opposite of §D7's
  // reason for existing. Same sentence, no alarm.
  it('keeps the past arm quiet — no `--miss`, no warn glyph', () => {
    const { container } = past(60, 78);
    expect(container.querySelector('.day-trv.miss')).toBeNull();
  });

  // What was free is the STRIP's to say now, on this arm as on every other (§AH3).
  it('says nothing about free time itself, where the journey did fit', () => {
    const { container } = past(160, 40);
    expect(container.textContent).not.toContain(freeTimePhrase(120)!);
    expect(screen.getByText(approxTravelTime(40 * 60)!)).toBeTruthy();
  });
});

// ── A JOURNEY THE LADDER CANNOT NAME (ADR-0206 §AH2) ──────────────────────────────────────
describe('dayJourney — a hop too short to be a journey', () => {
  const START = Date.parse('2026-07-12T05:00:00Z');
  const MIN = 60_000;

  // **A twenty-metre hop is not a journey at all** (owner, 2026-08-26). The tolerance in
  // `freeAfterTravel` stops it being called impossible; this stops it being drawn. `~0 דק׳` over
  // a block of its own is a row about nothing, and the ladder cannot even state the length.
  it('is no journey at all below what the ladder can say', () => {
    expect(
      dayJourney({
        departAfterMs: START,
        arriveByMs: START,
        travelSeconds: 24,
        distanceMeters: 20,
        nowMs: START - 10 * MIN,
      }),
    ).toBeNull();
  });
});

// **THE TWO SENTENCES, AND WHEN EACH IS SAID** (ADR-0206 §AI, amended 2026-08-26).
//
// Owner, off the deploy: _"why does it sometimes say יציאה ב and some other times הגעה ב? Don't we
// prefer consistency?"_ — and they were reading THREE situations wearing two sentences. The
// amendment makes the split mean something a reader can act on: `יציאה` wherever the app has a
// deadline to advise against, the arrival beside it where the buffer had to be given up, and the
// arrival ALONE only where there is no deadline at all.
describe('JourneyRow — a departure, an arrival, or both (ADR-0206 §AI)', () => {
  afterEach(() => cleanup());

  const AT = (hhmm: string) => Date.parse(`2026-07-12T${hhmm}:00Z`);
  const meta = (journey: ReturnType<typeof dayJourney>) => {
    render(<JourneyRow journey={journey!} travelMode={TRAVEL_MODE.DRIVING} tz="UTC" />);
    return document.querySelector('.day-trv-meta')?.textContent ?? '';
  };

  it('says the departure alone where the buffer fits', () => {
    const line = meta(
      dayJourney({
        departAfterMs: AT('12:00'),
        arriveByMs: AT('14:40'),
        travelSeconds: 40 * 60,
        nowMs: AT('12:10'),
      }),
    );
    expect(line).toContain('יציאה');
    expect(line).not.toContain('הגעה');
  });

  // The reported row: a 60-minute hole, a 59-minute drive, a hard ⁦15:00⁩ start. The drive fits and
  // the BUFFER does not, so the departure is the origin's own end and the arrival says why.
  it('says both where the departure had to be pulled forward', () => {
    const line = meta(
      dayJourney({
        departAfterMs: AT('14:00'),
        arriveByMs: AT('15:00'),
        travelSeconds: 59 * 60,
        nowMs: AT('09:00'),
      }),
    );
    expect(line).toContain('יציאה');
    expect(line).toContain('הגעה');
    // The clamp is the origin's end, not the buffered ⁦13:56⁩ §AI2 refused to print.
    expect(line).toContain('14:00');
  });

  it('says the arrival alone where there is no deadline at all', () => {
    const line = meta(
      dayJourney({
        departAfterMs: AT('23:20'),
        arriveByMs: AT('15:00'),
        travelSeconds: 40 * 60,
        nowMs: AT('09:00'),
        flexibleArrival: true,
      }),
    );
    expect(line).toContain('הגעה');
    expect(line).not.toContain('יציאה');
  });
});
