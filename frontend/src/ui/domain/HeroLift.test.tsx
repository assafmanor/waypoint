// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_STATUS } from '@waypoint/shared';
import { DayRail } from './Board';
import { HeroLift, type HeroLiftPoint, type HeroLiftTask } from './HeroLift';
import { t } from '../../i18n/he';
import { wrapNav } from '../../test/nav-harness';

/** The lifted hero registers a back layer (it is a `Modal`), so it cannot be
 *  rendered bare — `wrapNav` supplies the provider stack rather than this file
 *  open-coding it a second time.
 *
 *  Queries go through `document`, not the render's `container`: a `Modal` portals
 *  into `document.body`, so a container query finds nothing and every assertion
 *  would pass vacuously the moment it was written as `queryBy…`. */
const show = (props: Partial<Parameters<typeof HeroLift>[0]> = {}) => {
  render(wrapNav(<HeroLift clock="14:12" now={[point()]} onClose={() => {}} {...props} />));
  return document;
};

const point = (over: Partial<HeroLiftPoint> = {}): HeroLiftPoint => ({
  key: 'now',
  title: <span>סיור אוכל</span>,
  kind: 'soft',
  until: '15:30',
  ...over,
});

describe('HeroLift', () => {
  afterEach(() => cleanup());

  it('renders the horizon: the live point, next, and אחר כך', () => {
    const container = show({
      now: [point({ place: 'Via dei Tribunali' })],
      next: point({ key: 'next', title: <span>מלון סנטרו</span>, kind: 'hard' }),
      nextTime: '16:00',
      nextCode: '#7QK4LM',
      then: { title: 'ארוחת ערב', time: '19:30' },
      foot: <DayRail progress={48} startHour="07:00" endHour="23:00" />,
    });
    expect(container.querySelector('.hero-lifted')).toBeTruthy();
    expect(screen.getByText('סיור אוכל')).toBeTruthy();
    expect(screen.getByText('מלון סנטרו')).toBeTruthy();
    expect(container.querySelector('.wp-board-next-meta .code')?.textContent).toBe('#7QK4LM');
    expect(container.querySelector('.hero-then')?.textContent).toContain('ארוחת ערב');
    // The foot is the collapsed board's own COMPONENT, not a copy of its markup.
    expect(container.querySelector('.hero-foot .wp-board-progress')).toBeTruthy();
  });

  it('has exactly one scroller, with the head and foot outside it', () => {
    const container = show({ foot: <DayRail progress={48} startHour="07:00" endHour="23:00" /> });
    expect(container.querySelectorAll('.hero-scroll')).toHaveLength(1);
    const scroll = container.querySelector('.hero-scroll')!;
    expect(scroll.querySelector('.hero-head')).toBeNull();
    expect(scroll.querySelector('.hero-foot')).toBeNull();
  });

  // Each part is absent when its datum is — the common case is an event with a
  // place and no note, so "no note" must be silence rather than an empty block.
  it('omits איפה, פתק and the settle strip when the point carries none of them', () => {
    const container = show({ now: [point()] });
    expect(screen.queryByText(t.hero.where)).toBeNull();
    expect(screen.queryByText(t.hero.note)).toBeNull();
    expect(container.querySelector('.wp-settle')).toBeNull();
  });

  it('shows a note, and says how many it is NOT showing', () => {
    show({ now: [point({ note: 'הכניסה מהחצר האחורית', noteMore: 2 })] });
    expect(screen.getByText('הכניסה מהחצר האחורית')).toBeTruthy();
    expect(screen.getByText(t.hero.moreNotes(2))).toBeTruthy();
  });

  it('the note count is silent when there is only one note', () => {
    show({ now: [point({ note: 'יש תור', noteMore: 0 })] });
    expect(screen.queryByText(t.hero.moreNotes(0))).toBeNull();
  });

  // ── משימה (ADR-0160 §U) ───────────────────────────────────────────────────
  const withTask = (over: Partial<HeroLiftTask> = {}) =>
    point({
      task: { title: 'להזמין מקומות לסושי', ...over },
      taskMore: 0,
    });

  it('shows one task, and says how many it is NOT showing', () => {
    show({ now: [point({ task: { title: 'לקנות JR Pass' }, taskMore: 2 })] });
    expect(screen.getByText(t.hero.task)).toBeTruthy();
    expect(screen.getByText('לקנות JR Pass')).toBeTruthy();
    expect(screen.getByText(t.hero.moreTasks(2))).toBeTruthy();
  });

  it('is silent about משימה when the point carries none', () => {
    show({ now: [point()] });
    expect(screen.queryByText(t.hero.task)).toBeNull();
  });

  it('the task count is silent when there is only one', () => {
    show({ now: [withTask()] });
    expect(screen.queryByText(t.hero.moreTasks(0))).toBeNull();
  });

  // **THE SLOT IS A READ** (brief §13 — the owner was offered the tickable version and
  // declined). This is also what pays brief §A's constraint: ADR-0160 §4's parser finding
  // binds a real nested `<button>`, and the collapsed board's tap area is one — so a control
  // arriving here is a defect with a rendering consequence, not a preference. A test rather
  // than a comment, because the next person to add a tick will not read the comment.
  it('renders NOTHING interactive in the task block', () => {
    const container = show({
      now: [withTask({ important: true, due: { text: 'עד היום 20:00', late: false } })],
    });
    const block = container.querySelector('.hero-task')!;
    expect(block).toBeTruthy();
    expect(block.querySelectorAll('button, a, [role="button"], input')).toHaveLength(0);
  });

  // **The box is EMPTY** (ADR-0160 §U amended 2026-08-16, owner: the ticked box _"reads as
  // 'task complete' and is misleading"_). The hero only ever names an OPEN task, so the ✓
  // said the opposite of the block's purpose. Asserted on the path data rather than on a
  // class, because the defect this replaces was a glyph choice and nothing else about the
  // DOM changes when it is wrong — the same reason `.tsk-tick-sec` shipped unpainted with a
  // green suite. The tick segment is `checkbox`'s second sub-path; `checkbox-empty` is
  // literally that string minus this one, which is what keeps them one family.
  const TICK_SEGMENT = 'M8.5 12l2.5 2.5 4.5-5';
  it('marks the task with an EMPTY box, never a ticked one', () => {
    const container = show({ now: [withTask({})] });
    const glyph = container.querySelector('.hero-task-ic path')!;
    expect(glyph).toBeTruthy();
    // The box itself is still there — this must fail if the glyph goes missing entirely.
    expect(glyph.getAttribute('d')).toContain('M5.5 4.5h13');
    expect(glyph.getAttribute('d')).not.toContain(TICK_SEGMENT);
  });

  it('draws the deadline, and marks a passed one', () => {
    const container = show({
      now: [withTask({ due: { text: 'באיחור · אתמול 18:00', late: true } })],
    });
    expect(container.querySelector('.hero-task-due.late')).toBeTruthy();
    expect(screen.getByText(/באיחור/)).toBeTruthy();
  });

  it('the deadline is unmarked when it has not passed', () => {
    const container = show({ now: [withTask({ due: { text: 'עד מחר 09:00', late: false } })] });
    expect(container.querySelector('.hero-task-due')).toBeTruthy();
    expect(container.querySelector('.hero-task-due.late')).toBeNull();
  });

  // The face is `aria-hidden` (`Avatar`'s non-interactive form), so the row would say nothing
  // at all about who owes this without the visually-hidden name beside it — ADR-0190 §6.
  it('says who owes the task in text, since the face itself is aria-hidden', () => {
    const container = show({
      now: [
        withTask({
          assignee: {
            person: { displayName: 'דנה', avatarHue: 'plum' },
            name: 'אחראי/ת: דנה',
          },
        }),
      ],
    });
    expect(container.querySelector('.hero-task-hd .wp-av')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(screen.getByText('אחראי/ת: דנה')).toBeTruthy();
  });

  // `הבא בתור` gets the block too, and ADR-0160 §13's "no note on the next event" is the
  // reason this is asserted rather than assumed: that bullet forbade the sibling case and the
  // app had been doing it since the first build. §U7 withdraws it; this pins what replaced it.
  it('gives הבא בתור the same block', () => {
    show({
      now: [point()],
      next: point({ key: 'next', title: <span>צ׳ק-אין</span>, task: { title: 'לבקש חדר גבוה' } }),
      nextTime: '22:30',
    });
    expect(screen.getByText('לבקש חדר גבוה')).toBeTruthy();
  });

  it('the map way-in is a button and ניווט is a real link', () => {
    const onMap = vi.fn();
    show({
      now: [point({ place: 'Via Toledo', onMap, navigateUrl: 'https://maps.example/x' })],
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.hero.onMap) }));
    expect(onMap).toHaveBeenCalledOnce();
    // An anchor, so long-press/share work and no popup blocker is involved.
    const nav = screen.getByRole('link', { name: new RegExp(t.hero.navigate) });
    expect(nav.getAttribute('href')).toBe('https://maps.example/x');
    expect(nav.getAttribute('rel')).toContain('noopener');
  });

  // ADR-0139: a fourth host adds a DENSITY. The words, marks and hues are not the
  // host's to choose, so the assertion is that they are the shipped ones.
  it('settles through SettleControl’s board density, with the shipped words', () => {
    const onDone = vi.fn();
    const onSkip = vi.fn();
    const container = show({ now: [point({ onDone, onSkip })] });
    const settle = container.querySelector('.wp-settle.board');
    expect(settle).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.actions.wasThere }));
    fireEvent.click(screen.getByRole('button', { name: t.event.skipped }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('a settled point shows the record and the one verb left', () => {
    const onUndo = vi.fn();
    const container = show({
      now: [point({ settled: EVENT_STATUS.DONE, onDone: () => {}, onSkip: () => {}, onUndo })],
    });
    expect(container.querySelector('.wp-settle-tag.ok')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.actions.undoSettle }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  // The gap, which is most of a real day and the state the lift is worth the most in.
  // It shipped rendering nothing at all where the now point goes, so the words the
  // collapsed board was showing disappeared as it lifted.
  it('says זמן חופשי when nothing is in progress', () => {
    const container = show({
      now: [],
      next: point({ key: 'next', title: <span>מלון סנטרו</span>, place: 'Via Toledo' }),
      nextTime: '16:00',
    });
    expect(container.querySelector('.wp-board-now-label')?.textContent).toBe(t.board.freeLabel);
    expect(container.querySelector('.wp-board-now-title')?.textContent).toBe(t.board.freeTitle);
    // …and the horizon it opened onto is still there under it.
    expect(screen.getByText('מלון סנטרו')).toBeTruthy();
  });

  // The free words belong to the empty case ALONE — a board with something in progress
  // that also printed `זמן חופשי` would be the same bug from the other side.
  it('says nothing about free time while a point is in progress', () => {
    const container = show({ now: [point()] });
    expect(container.querySelector('.hero-lifted')?.textContent).not.toContain(t.board.freeTitle);
  });

  // ADR-0041 §6: the split exists on there being no primary, so no equal is
  // promoted and each carries the same depth.
  it('the group split promotes no equal and gives each the same depth', () => {
    const container = show({
      split: true,
      now: [
        point({
          key: 'a',
          title: <span>סיור</span>,
          place: 'A',
          onDone: () => {},
          onSkip: () => {},
        }),
        point({
          key: 'b',
          title: <span>שוק</span>,
          place: 'B',
          onDone: () => {},
          onSkip: () => {},
        }),
      ],
    });
    expect(screen.getByText(t.board.concurrentNow)).toBeTruthy();
    // No point is the lead, and both carry a place and a settle strip.
    expect(container.querySelectorAll('.hero-point[data-lead]')).toHaveLength(0);
    expect(container.querySelectorAll('.hero-equal-hd')).toHaveLength(2);
    expect(container.querySelectorAll('.wp-settle.board')).toHaveLength(2);
    expect(container.querySelectorAll('.hero-where-nm')).toHaveLength(2);
  });

  // A span you are inside takes the collapsed board's grammar, and the rail is part of the
  // POINT rather than the card. Before session 215 this shape did not exist here at all: a
  // flight arrived as an ordinary hard event and its rail was handed in as `foot`.
  it('a point you are inside wears the mid-span grammar, rail included', () => {
    const container = show({
      liveWord: t.board.midSpan.flightLive,
      now: [
        point({
          kind: undefined,
          transit: {
            label: t.board.midSpan.transitLabel,
            endLabel: t.glance.transition.flightArrival,
            endTime: '22:15',
            inPhrase: t.board.inPhrase('1:39 שע׳'),
            code: '#LH692',
            rail: <div className="wp-board-transit-prog" />,
          },
        }),
      ],
    });
    const live = container.querySelector('.wp-board-live')!;
    expect(live.className).toContain('loc');
    expect(live.textContent).toContain(t.board.midSpan.flightLive);
    const lead = container.querySelector('.hero-point[data-lead]')!;
    expect(lead.querySelector('.wp-board-now-label.loc')?.textContent).toBe(
      t.board.midSpan.transitLabel,
    );
    expect(lead.querySelector('.wp-board-now-meta .tlabel.loc')?.textContent).toBe(
      t.glance.transition.flightArrival,
    );
    expect(lead.querySelector('.hero-eta')?.textContent).toBe(t.board.inPhrase('1:39 שע׳'));
    // The rail is INSIDE the point, and the card pins nothing.
    expect(lead.querySelector('.hero-transit .wp-board-transit-prog')).toBeTruthy();
    expect(container.querySelector('.hero-foot')).toBeNull();
    // `קשיח` and `עד` belong to the ordinary grammar and must not double up on it.
    expect(lead.textContent).not.toContain(t.event.hard);
    expect(lead.querySelector('.wp-board-now-meta')?.textContent).not.toContain(t.board.until);
    // Nothing said the landing is on another day, so nothing claims one — the same-day
    // journey is nearly every journey, and this row stays as short as it was.
    expect(lead.querySelector('.wp-board-now-meta')?.textContent).not.toContain('מחר');
  });

  // The same token the collapsed board carries, in the same place: beside the arrival time
  // it disambiguates, not beside the countdown (ADR-0160 §M).
  it('names the arrival day when the landing is not today', () => {
    const container = show({
      liveWord: t.board.midSpan.flightLive,
      now: [
        point({
          kind: undefined,
          transit: {
            label: t.board.midSpan.transitLabel,
            endLabel: t.glance.transition.flightArrival,
            endTime: '06:00',
            endDay: 'מחר',
            inPhrase: t.board.inPhrase('1:40 שע׳'),
          },
        }),
      ],
    });
    const meta = container.querySelector('.hero-point[data-lead] .wp-board-now-meta')!;
    const spans = [...meta.querySelectorAll('span')].map((s) => s.textContent);
    expect(spans.indexOf('מחר')).toBe(spans.indexOf('06:00') + 1);
    expect(meta.querySelector('.hero-eta')?.textContent).toBe(t.board.inPhrase('1:40 שע׳'));
  });

  // Reported from a device: the promoted card glowed amber over a board glowing teal. The
  // hero IS `.wp-board`, so it has to take the board's variant classes too — `transit` is
  // what shifts `::before` from amber to teal, and nothing else in the hero paints.
  it('wears the board’s transit costume while you are inside a span', () => {
    const inside = show({
      liveWord: t.board.midSpan.flightLive,
      now: [point({ kind: undefined, transit: { label: 'x', endLabel: 'y' } })],
    });
    expect(inside.querySelector('.hero-lifted')?.className).toContain('transit');
    cleanup();
    const ordinary = show({ now: [point()] });
    expect(ordinary.querySelector('.hero-lifted')?.className).not.toContain('transit');
  });

  it('keeps the ordinary grammar on a point you are not inside', () => {
    const container = show({ now: [point({ kind: 'hard', until: '15:30' })] });
    expect(container.querySelector('.wp-board-live')?.className).not.toContain('loc');
    expect(container.querySelector('.wp-board-now-label')?.textContent).toContain(t.event.hard);
    expect(container.querySelector('.wp-board-now-meta')?.textContent).toContain(t.board.until);
    expect(container.querySelector('.hero-transit')).toBeNull();
  });

  // Session 215's report: `ניווט` was pushed to its own line and `להזמנה` to a third.
  // The DOM invariant that fixes it is what is asserted — one action row per point, the
  // name outside it — because the wrap itself is a layout fact jsdom cannot see (every
  // rect there is zero), and the measurement lives in `mockups/hero-in-transit-v1.html`.
  it('every way out of a point is in ONE action row, with the name on its own line', () => {
    const container = show({
      now: [
        point({
          place: 'פרנקפורט (Frankfurter Flughafen – FRA)',
          onMap: () => {},
          navigateUrl: 'https://maps.google.com/?q=FRA',
          onBooking: () => {},
        }),
      ],
    });
    const rows = container.querySelectorAll('.hero-acts');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelectorAll('.hero-act')).toHaveLength(3);
    // The name is a sibling of the row, never inside it — that is what lets it ellipsize
    // instead of pushing a chip onto a second line.
    expect(rows[0].querySelector('.hero-where-nm')).toBeNull();
    expect(container.querySelector('.hero-where-nm')?.textContent).toContain('FRA');
  });

  it('shows an action row with no place, and no bare label without one', () => {
    // A booking-backed point with no place still has a way through; and the `איפה`
    // label must not appear over an empty name.
    const container = show({ now: [point({ onBooking: () => {} })] });
    expect(container.querySelectorAll('.hero-acts .hero-act')).toHaveLength(1);
    expect(screen.queryByText(t.hero.where)).toBeNull();
  });

  it('what the horizon adds to NEXT is the way through, not a second code', () => {
    const onBooking = vi.fn();
    show({
      next: point({ key: 'next', title: <span>מלון</span>, onBooking }),
      nextCode: '#ABC',
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.hero.toBooking) }));
    expect(onBooking).toHaveBeenCalledOnce();
    // The code is printed once, by the next-row, not again by the hand-off.
    expect(screen.getAllByText('#ABC')).toHaveLength(1);
  });

  // ADR-0160 §12's condition, asserted on the render as well as on the type: one
  // line, and nothing in it is pressable.
  it('אחר כך is one line with no control in it', () => {
    const container = show({ then: { title: 'ארוחת ערב', time: '19:30' } });
    const then = container.querySelector('.hero-then')!;
    expect(then.querySelectorAll('button, a')).toHaveLength(0);
    expect(then.textContent).toContain('19:30');
  });

  // ADR-0103/0090: it can be dismissed, so the dismissal is ONE handler. The `✕`
  // must reach the primitive's animated close rather than the caller's onClose.
  it('the ✕ closes it', () => {
    const onClose = vi.fn();
    show({ onClose });
    fireEvent.click(screen.getByRole('button', { name: t.hero.close }));
    // The exit runs first, so the caller is told after the animation — which in
    // jsdom is 0ms (`motionDurationMs` answers 0 with no CSS engine).
    expect(onClose).toHaveBeenCalled();
  });

  it('every time is the caller’s, pre-formatted — the hero derives none of them', () => {
    // The zone pill is the shared one (ADR-0107): more times on this surface means
    // more pills, and each rides its own point's shift.
    const container = show({
      now: [point({ shift: 120 })],
      next: point({ key: 'next', title: <span>מלון</span>, shift: 120 }),
      nextTime: '16:00',
    });
    expect(container.querySelectorAll('.wp-tzshift')).toHaveLength(2);
  });
});
