// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_STATUS } from '@waypoint/shared';
import { DayRail } from './Board';
import { HeroLift, type HeroLiftPoint, type HeroLiftTask } from './HeroLift';
import { GAP_CHARACTER } from '../../lib/gap-character';
import { t } from '../../i18n/he';
import { wrapNav } from '../../test/nav-harness';
import { withoutBidiControls } from '../../lib/bidi';

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
      tasks: [{ title: 'להזמין מקומות לסושי', ...over }],
      taskMore: 0,
    });

  it('shows the tasks it was given, and says how many it is NOT showing', () => {
    show({ now: [point({ tasks: [{ title: 'לקנות JR Pass' }], taskMore: 2 })] });
    expect(screen.getByText(t.hero.task)).toBeTruthy();
    expect(screen.getByText('לקנות JR Pass')).toBeTruthy();
    expect(screen.getByText(t.hero.moreTasks(2))).toBeTruthy();
  });

  // **Three rows, not one** (ADR-0160 §U5 as amended 2026-08-16, owner: _"it is limited to
  // showing only one task. It should be 3"_). The cap itself lives in `constants.ts` and is
  // applied by `Home`; what this block owes is that it RENDERS every task handed to it —
  // the shipped defect was that it took one and silently dropped the rest.
  it('renders every task it is handed, each with its own row', () => {
    show({
      now: [
        point({
          tasks: [{ title: 'לקנות JR Pass' }, { title: 'להזמין סושי' }, { title: 'לאשר שעה' }],
          taskMore: 1,
        }),
      ],
    });
    expect(document.querySelectorAll('.hero-task')).toHaveLength(3);
    for (const title of ['לקנות JR Pass', 'להזמין סושי', 'לאשר שעה']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText(t.hero.moreTasks(1))).toBeTruthy();
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
      next: point({
        key: 'next',
        title: <span>צ׳ק-אין</span>,
        tasks: [{ title: 'לבקש חדר גבוה' }],
      }),
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
      gap: { read: { kind: GAP_CHARACTER.OPEN } },
      next: point({ key: 'next', title: <span>מלון סנטרו</span>, place: 'Via Toledo' }),
      nextTime: '16:00',
    });
    expect(container.querySelector('.wp-board-now-label')?.textContent).toBe(t.board.freeLabel);
    expect(container.querySelector('.wp-board-now-title')?.textContent).toBe(t.board.freeTitle);
    // …and the horizon it opened onto is still there under it.
    expect(screen.getByText('מלון סנטרו')).toBeTruthy();
  });

  // ONE answer, rendered at both elevations (ADR-0211 §2). §S had to repair this drift once
  // already, when `free` was `Board`'s `else` and an empty array here — so the words vanished
  // on the way up. A second copy of them is how that comes back.
  it('carries the gap CHARACTER up, not just the free words', () => {
    const container = show({
      now: [],
      gap: { read: { kind: GAP_CHARACTER.ON_THE_WAY } },
      next: point({ key: 'next', title: <span>BBQ Mirage</span> }),
    });
    expect(container.querySelector('.wp-board-now-title')?.textContent).toBe(
      t.board.gap.onTheWay.title,
    );
    expect(container.querySelector('.hero-lifted')?.textContent).not.toContain(t.board.freeTitle);
  });

  it('and says which day the next point is on', () => {
    const container = show({
      now: [],
      gap: { read: { kind: GAP_CHARACTER.DAY_DONE } },
      next: point({ key: 'next', title: <span>טיסה לבטומי</span> }),
      nextTime: '07:00',
      nextDay: 'מחר',
    });
    expect(container.querySelector('.wp-board-next-meta')?.textContent).toContain('מחר');
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

describe('HeroLift — the journey between two points (ADR-0206 §V1.2 / §D2)', () => {
  afterEach(() => cleanup());

  const withTravel = (travel: Parameters<typeof HeroLift>[0]['travel']) =>
    show({
      now: [point()],
      next: point({ key: 'next', title: <span>מלון סנטרו</span>, kind: 'hard' }),
      nextTime: '18:00',
      travel,
    });

  // §D2 is a claim about WHERE it lives, so the assertion is structural rather than about the
  // words: between the divider and the `הבא בתור` block, which is the slot that was already
  // between two points. Anywhere else and it has become a fifth point-depth item — the thing
  // ADR-0160 §U0's rule refuses and §D2 answers instead of spending.
  it('renders BETWEEN the two points, not on either of them', () => {
    const container = withTravel({
      mode: t.travelMode.walking,
      duration: '⁦~23⁩ דק׳',
      leave: 'צאו ב־⁦18:37⁩',
      tone: 'time',
    });
    const parts = [...container.querySelectorAll('.hero-scroll > *')];
    const divider = parts.findIndex((el) => el.classList.contains('wp-board-divider'));
    const travel = parts.findIndex((el) => el.querySelector('.hero-trv'));
    const next = parts.findIndex((el) => el.querySelector('.wp-board-next-row'));
    expect(divider).toBeGreaterThanOrEqual(0);
    expect(travel).toBe(divider + 1);
    expect(next).toBe(travel + 1);
    // Not inside a point, and the points keep the depth blocks they had.
    expect(container.querySelector('.hero-point .hero-trv')).toBeNull();
  });

  // **The mode LEADS**, which is §D10's dodge (`~23 דקות הליכה` disagrees; `הליכה · ~23 דק׳` does
  // not) and is how the mockup drew it — 40 minutes is a different fact walking and driving.
  it('reads mode · hedged duration · leave-by, in that order, as one line', () => {
    const container = withTravel({
      mode: t.travelMode.walking,
      duration: '⁦~23⁩ דק׳',
      leave: 'צאו ב־⁦18:37⁩',
      tone: 'time',
    });
    const row = container.querySelector('.hero-trv')!;
    const text = withoutBidiControls(row.textContent ?? '');
    expect(text).toContain('הליכה');
    expect(text.indexOf('הליכה')).toBeLessThan(text.indexOf('~23'));
    expect(text.indexOf('~23')).toBeLessThan(text.indexOf('צאו'));
    // §D10: the separator is the middle dot, never an em dash — and one dot per join, so a
    // three-run line carries two.
    expect(row.querySelectorAll('.sep')).toHaveLength(2);
    expect(row.textContent).not.toContain('—');
  });

  // A run that is absent takes its separator with it, rather than leaving a leading dot.
  it('joins only the runs it has', () => {
    const container = withTravel({ leave: 'צאו ב־⁦18:37⁩', tone: 'time' });
    const row = container.querySelector('.hero-trv')!;
    expect(row.querySelectorAll('.sep')).toHaveLength(0);
    expect((row.textContent ?? '').trim().startsWith('צאו')).toBe(true);
  });

  // **§D4, and the exit criterion.** An absent estimate is the ordinary case, so the card must
  // read exactly as it did before this milestone — no empty row, no placeholder, no height.
  it('renders NOTHING at all with no estimate, so there is no layout shift', () => {
    const container = withTravel(undefined);
    expect(container.querySelector('.hero-trv')).toBeNull();
    expect(container.querySelectorAll('.wp-board-divider')).toHaveLength(1);
  });

  // §M4: from the clock alone the only supportable claim is that the leave-by has passed. The
  // sentence is the caller's, so what this asserts is that the tone reaches the ink and the
  // answer reaches the row — a mark you have to change tabs to withdraw stays on screen.
  it('a passed leave-by wears --miss and offers בדרך, which is the mark’s own answer', () => {
    const onOnWay = vi.fn();
    const container = withTravel({
      duration: '⁦~23⁩ דק׳',
      leave: t.travel.leavePassed('18:37'),
      tone: 'miss',
      action: { label: t.actions.onWay, onPress: onOnWay },
    });
    const row = container.querySelector('.hero-trv')!;
    expect(row.classList.contains('miss')).toBe(true);
    expect(row.textContent).toContain('זמן היציאה עבר');
    expect(row.textContent).not.toContain('באיחור');
    fireEvent.click(screen.getByRole('button', { name: t.actions.onWay }));
    expect(onOnWay).toHaveBeenCalled();
  });

  // §D6: the app has one live mark and `.nowline` is it. A swap re-points a countdown; it does
  // not mint a second pulse, glow or countdown, and the risk mark is text (§D7).
  it('spends no second live mark and no second countdown', () => {
    const container = withTravel({
      duration: '⁦~23⁩ דק׳',
      leave: t.travel.leavePassed('18:37'),
      tone: 'miss',
    });
    expect(container.querySelectorAll('.wp-board-countdown')).toHaveLength(0);
    expect(container.querySelectorAll('.nowline')).toHaveLength(0);
    expect(container.querySelector('.hero-trv')?.querySelector('button')).toBeNull();
  });

  it('once somebody says בדרך the row is teal and the leave-by is gone', () => {
    const container = withTravel({ duration: '⁦~23⁩ דק׳', leave: t.actions.onWay, tone: 'on-way' });
    const row = container.querySelector('.hero-trv')!;
    expect(row.classList.contains('on-way')).toBe(true);
    expect(row.textContent).not.toContain('צאו');
    expect(row.textContent).not.toContain('עבר');
    expect(screen.queryByRole('button', { name: t.actions.onWay })).toBeNull();
  });

  // The tile is the collapsed board's, one elevation up, so §Z1's third arm has to reach it
  // here too — the two elevations may not disagree about what the countdown counts to.
  it('carries the board’s own missed countdown', () => {
    const container = show({
      next: point({ key: 'next', title: <span>מלון</span> }),
      countdown: {
        value: '7',
        unit: t.board.lateBy('דקות'),
        unitBelow: t.board.leaveIn,
        missed: true,
      },
    });
    expect(container.querySelector('.wp-board-countdown.missed')).toBeTruthy();
    // Both lines, because the two elevations render two copies of this tile and a field added to
    // one and not the other is how they start saying different things about one leave-by.
    expect(
      [...container.querySelectorAll('.wp-board-countdown .u')].map((u) => u.textContent),
    ).toEqual([t.board.lateBy('דקות'), t.board.leaveIn]);
  });
});

describe('HeroLift — what a device position adds (ADR-0207 §2)', () => {
  afterEach(() => cleanup());

  const withTravel = (travel: Parameters<typeof HeroLift>[0]['travel']) =>
    show({
      now: [point()],
      next: point({ key: 'next', title: <span>מלון סנטרו</span> }),
      nextTime: '18:00',
      travel,
    });

  // The one claim a fix licenses that the clock could not: the app saying it CHECKED, rather than
  // assuming. Teal inside a `--miss` row on purpose — two different facts, one mark.
  it('draws עדיין כאן beside a passed leave-by, and only when the fix says so', () => {
    const located = withTravel({
      mode: t.travelMode.walking,
      leave: t.travel.leavePassed('⁦18:37⁩'),
      tone: 'miss',
      located: t.travel.stillHere,
    });
    expect(located.querySelector('.hero-trv-here')?.textContent).toContain(t.travel.stillHere);
    cleanup();
    // §2: absent is the DEFAULT — no permission, a refusal, a stale fix, a position that settles
    // nothing. The row then reads exactly as it did before ADR-0207.
    const blind = withTravel({
      mode: t.travelMode.walking,
      leave: t.travel.leavePassed('⁦18:37⁩'),
      tone: 'miss',
    });
    expect(blind.querySelector('.hero-trv-here')).toBeNull();
    expect(blind.querySelector('.hero-trv')?.textContent).toContain('זמן היציאה עבר');
  });

  // §7 — the second half of the same report: the mark had no way back. `ביטול סימון` is the word
  // `SettleControl` already uses for taking back a mark you set, not a new one.
  it('offers a way BACK on the on-way row, because a toast is transient and a mark is not', () => {
    const onPress = vi.fn();
    const container = withTravel({
      mode: t.travelMode.walking,
      leave: `${t.actions.onWay} · ${t.travel.remaining('⁦~12⁩ דק׳')}`,
      tone: 'on-way',
      action: { label: t.actions.undoSettle, onPress },
    });
    expect(container.querySelector('.hero-trv')?.classList.contains('on-way')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t.actions.undoSettle }));
    expect(onPress).toHaveBeenCalled();
    // §6: what is LEFT, not the leg's total — the total read as "still to walk" from the door.
    expect(withoutBidiControls(container.querySelector('.hero-trv')?.textContent ?? '')).toContain(
      'נותרו ~12 דק׳',
    );
  });
});
