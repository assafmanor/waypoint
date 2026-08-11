// @vitest-environment jsdom
//
// The in-trip top bar's two rows (ADR-0149). What is asserted here is what the
// header DECIDES — which affordances exist in which state — not what it measures:
// jsdom reports every rect as zero, so heights, the 3-visible-day window and the
// name's settled size are a device pass, and saying so is the point.
//
// The trip shell's state is mocked at module scope rather than provided, the way
// the Map's shell test does it: what is under test is the header, and standing up
// trip-state + auth + the outbox would be testing them instead.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from './test/nav-harness';
import { setSimulatedNow } from './lib/useClock';
import { t } from './i18n/he';

// jsdom has no layout engine, so it implements neither of these — `useShrinkToFit`
// installs a ResizeObserver and the strip centres its selected pill on every change.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = vi.fn();

const TRIP = {
  id: 't1',
  name: 'יפן 26',
  icon: '🇯🇵',
  destination: 'יפן',
  startDate: '2026-07-18',
  endDate: '2026-07-27',
  timezone: 'Asia/Tokyo',
};
const ME = { id: 'u-me', displayName: 'אסף' };
const NOON = Date.parse('2026-07-20T03:00:00Z'); // noon in Tokyo, i.e. day 3 of 10

let users = [ME];
let mode = 'trip';
let phase = 'live';
let activeDate = '2026-07-20';
let offline = false;
let pending = 0;
let failures: unknown[] = [];
const setOverride = vi.fn();

vi.mock('./state/trip-state', () => ({
  useTrip: () => ({
    trip: TRIP,
    users,
    events: [],
    zoneEvidence: {
      events: [],
      bookings: [],
      places: [],
      crossings: [],
      primaryZone: TRIP.timezone,
    },
    activeDate,
    usingCachedSnapshot: false,
  }),
}));
vi.mock('./state/auth-state', () => ({ useAuth: () => ({ me: { user: ME } }) }));
vi.mock('./state/mode-state', () => ({ useMode: () => ({ mode, phase, setOverride }) }));
vi.mock('./state/drag-state', () => ({
  useDragState: () => ({ dragging: false, overDate: null }),
}));
vi.mock('./lib/outbox', () => ({
  useIsOffline: () => offline,
  usePendingChangeCount: () => pending,
  useSyncFailures: () => failures,
  // Imported by App.tsx's device-wide flush, which never mounts here.
  flushAllOutbox: vi.fn(),
  isOffline: () => offline,
  useOutboxCount: () => 0,
}));

const { Header } = await import('./App');

const noop = () => {};
/** `at` is the URL the header is standing on: the strip's selection depends on which tab
 *  is showing (field report #39), so it is part of the header's input. */
const renderHeader = (props: Partial<Parameters<typeof Header>[0]> & { at?: string } = {}) =>
  render(
    wrapNav(
      <Header
        onSelectDay={props.onSelectDay ?? noop}
        onOpenSwitcher={props.onOpenSwitcher ?? noop}
        onOpenPeople={props.onOpenPeople ?? noop}
        onOpenSettings={props.onOpenSettings ?? noop}
        otherTripCount={props.otherTripCount}
        allDays={props.allDays}
      />,
      { path: props.at ?? '/' },
    ),
  );

beforeEach(() => {
  setSimulatedNow(NOON);
  users = [ME];
  mode = 'trip';
  phase = 'live';
  activeDate = '2026-07-20';
  offline = false;
  pending = 0;
  failures = [];
});
afterEach(() => {
  cleanup();
  setSimulatedNow(null);
  vi.clearAllMocks();
});

describe('the trip chip', () => {
  it('navigates rather than opening a menu — one tap, no detour (ADR-0033 §3)', () => {
    const onOpenSwitcher = vi.fn();
    const { container } = renderHeader({ onOpenSwitcher, otherTripCount: 2 });
    fireEvent.click(container.querySelector('.hdr-trip')!);
    expect(onOpenSwitcher).toHaveBeenCalled();
  });

  it('hands the same navigation to the condensed row, so identity never leaves', () => {
    // Row 1 lifts out on scroll and on the Map, which declares the condense as its
    // resting state — so the glyph that slides into the day row has to be the same
    // control. Only one of the two is ever in the a11y tree: CSS hides the other
    // with `visibility`, which is also what keeps it out of the tab order.
    const onOpenSwitcher = vi.fn();
    const { container } = renderHeader({ onOpenSwitcher, otherTripCount: 2 });
    fireEvent.click(container.querySelector('.hdr-minitrip')!);
    expect(onOpenSwitcher).toHaveBeenCalled();
  });

  it('draws the swap mark when there ARE other trips', () => {
    const { container } = renderHeader({ otherTripCount: 2 });
    expect(container.querySelector('.hdr-swap')).toBeTruthy();
    // And nothing behind the glyph: the deck cue was withdrawn on a device pass
    // (ADR-0149 §2's 2026-08-03 amendment), so the mark carries this alone.
    expect(container.querySelector('.hdr-deck')).toBeNull();
  });

  it('draws none of it at one trip — no source, no control (ADR-0045 / ADR-0109 §6)', () => {
    const { container } = renderHeader({ otherTripCount: 0 });
    expect(container.querySelector('.hdr-swap')).toBeNull();
    // The chip itself stays a control, which is what keeps app-shell.md §5's
    // single-trip path to /trips (and therefore to "create a second trip") alive.
    expect(container.querySelector('.hdr-trip')!.getAttribute('aria-label')).toBe(
      t.shell.switcher.title,
    );
  });
});

describe('sync state', () => {
  it('is silent when everything is saved', () => {
    const { container } = renderHeader();
    expect(container.querySelector('.hdr-sync-badge')).toBeNull();
    expect(container.querySelector('.hdr-syncfail')).toBeNull();
  });

  it('paints offline and pending as a PASSIVE badge, never a control', () => {
    offline = true;
    const { container } = renderHeader();
    const badge = container.querySelector('.hdr-sync-badge');
    expect(badge?.getAttribute('data-state')).toBe('offline');
    expect(container.querySelector('.hdr-syncfail')).toBeNull();

    cleanup();
    offline = false;
    pending = 3;
    const { container: c2 } = renderHeader();
    expect(c2.querySelector('.hdr-sync-badge')?.getAttribute('data-state')).toBe('pending');
  });

  it('gives `failed` a real control instead — the one state a person can act on', () => {
    // ADR-0080 needs a path to the dead-letter sheet that never clears, and the chip
    // navigates away, so the badge cannot be that path.
    failures = [{ id: 'f1' }, { id: 'f2' }];
    const { container } = renderHeader();
    expect(container.querySelector('.hdr-sync-badge')).toBeNull();
    const control = screen.getByRole('button', { name: t.sync.summary(2) });
    expect(control.className).toContain('hdr-syncfail');
  });

  it('keeps the live region and its strings whatever is painted', () => {
    // "Only what is painted moves" — the announcement is unchanged in all three
    // states, which is exactly what a redesign of the paint must not touch.
    offline = true;
    pending = 2;
    failures = [{ id: 'f1' }];
    const { container } = renderHeader();
    const live = container.querySelector('header [role="status"]')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toContain(t.header.offlineNow);
    expect(live.textContent).toContain(t.header.pendingSync(2));
    expect(live.textContent).toContain(t.sync.summary(1));
  });
});

describe('the anchor slot', () => {
  it('reads the trip progress on today, and is not a control', () => {
    const { container } = renderHeader();
    const anchor = container.querySelector('.hdr-anchor')!;
    expect(anchor.classList.contains('is-back')).toBe(false);
    expect(anchor.tagName).not.toBe('BUTTON');
    expect(anchor.textContent).toContain(t.header.dayCap);
    expect(anchor.textContent).toContain('3/10');
  });

  it('becomes the way back off today, in the same box', () => {
    activeDate = '2026-07-22';
    const onSelectDay = vi.fn();
    const { container } = renderHeader({ onSelectDay });
    const anchor = container.querySelector('.hdr-anchor')!;
    expect(anchor.classList.contains('is-back')).toBe(true);
    // Both states are still rendered — that is what makes the box a fixed size and
    // the swap a cross-fade rather than the reflow the ribbon used to cause.
    expect(anchor.querySelector('.anchor-progress[data-off]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.header.backToToday }));
    expect(onSelectDay).toHaveBeenCalledWith('2026-07-20');
  });

  it('stays the progress in Plan mode, which has no "now" to return to', () => {
    mode = 'plan';
    activeDate = '2026-07-22';
    const { container } = renderHeader();
    expect(container.querySelector('.hdr-anchor')!.classList.contains('is-back')).toBe(false);
  });
});

// **One remembered day, shown only where a day is what you are looking at** (field
// report #39). The day itself is the `?day=` param wherever you are (ADR-0035 §4), so
// what is asserted here is the DISPLAY half: which surface paints a selected pill.
describe('the day strip per surface', () => {
  const pillsIn = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('.wp-daypill'));
  const pillFor = (container: HTMLElement, dayOfMonth: string) =>
    pillsIn(container).find((p) => p.querySelector('.n')?.textContent === dayOfMonth)!;
  // A remembered day that is NOT today (today is the 20th here), so the filled-selection
  // classes are the ones under test rather than today's own anchor.
  const REMEMBERED = '2026-07-22';
  const at = (tab: string) => `/?tab=${tab}&day=${REMEMBERED}`;

  beforeEach(() => {
    activeDate = REMEMBERED;
  });

  it('singles the day out on the Day view and on the Map', () => {
    for (const path of [at('days'), at('map')]) {
      const { container, unmount } = renderHeader({ at: path });
      const pill = pillFor(container, '22');
      expect(pill.getAttribute('aria-pressed')).toBe('true');
      expect(pill.classList.contains('sel-future')).toBe(true);
      unmount();
    }
  });

  // The Index is trip-wide — no pill there is "the selected one", in styling OR in what
  // it announces. The ARIA half is the part a class assertion alone would have missed.
  it('singles no day out on the Index, in styling or in ARIA', () => {
    const { container } = renderHeader({ at: at('index') });
    const pills = pillsIn(container);
    expect(pills.some((p) => p.getAttribute('aria-pressed') === 'true')).toBe(false);
    expect(pills.some((p) => /(^| )(on|sel-history|sel-future)( |$)/.test(p.className))).toBe(
      false,
    );
    // Today keeps its anchor, so "where's now?" is still answerable from the chrome.
    expect(pillFor(container, '20').classList.contains('today-anchor')).toBe(true);
  });

  // …and the pills stay controls: tapping one from the Index is how you go to that day
  // (`daySelectTarget` routes a non-day-scoped tab to the Day view).
  it('keeps the Index pills tappable, including the remembered day', () => {
    const onSelectDay = vi.fn();
    const { container } = renderHeader({ at: at('index'), onSelectDay });
    fireEvent.click(pillFor(container, '22'));
    expect(onSelectDay).toHaveBeenCalledWith(REMEMBERED);
  });

  it('singles no day out on the Map at all-days, and does again once a day is picked', () => {
    const allDaysRender = renderHeader({ at: at('map'), allDays: true });
    expect(pillFor(allDaysRender.container, '22').getAttribute('aria-pressed')).toBe('false');
    allDaysRender.unmount();
    const dayScoped = renderHeader({ at: at('map'), allDays: false });
    expect(pillFor(dayScoped.container, '22').getAttribute('aria-pressed')).toBe('true');
  });

  // All-days is lifted above the shell, so it outlives a tab change (`map-scope-state`) —
  // it must not reach out and unselect the Day view's own day.
  it('ignores a stale all-days scope on the Day view', () => {
    const { container } = renderHeader({ at: at('days'), allDays: true });
    expect(pillFor(container, '22').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the people stack', () => {
  it('is one control led by your own ring, opening one people sheet', () => {
    users = [ME, { id: 'u-dana', displayName: 'דנה' }];
    const onOpenPeople = vi.fn();
    const { container } = renderHeader({ onOpenPeople });
    fireEvent.click(screen.getByRole('button', { name: t.settings.rosterOpen(2) }));
    expect(onOpenPeople).toHaveBeenCalled();
    expect(container.querySelectorAll('.hdr-people .av.is-me')).toHaveLength(1);
  });

  it('draws you even on a solo trip — the stack is also the way to your account', () => {
    const { container } = renderHeader();
    expect(container.querySelectorAll('.hdr-people .av')).toHaveLength(1);
  });

  it('caps the circles and counts the rest, so the row never grows', () => {
    users = [ME, ...['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, displayName: id }))];
    const { container } = renderHeader();
    // Four boxes: you, two others, and the bubble carrying the remaining three.
    expect(container.querySelectorAll('.hdr-people .av')).toHaveLength(4);
    expect(container.querySelector('.hdr-people .av.more')?.textContent).toContain('3');
  });
});

describe('the mode control', () => {
  it('rides the day row, icons-only, with the words as its accessible names', () => {
    const { container } = renderHeader();
    const toggle = container.querySelector('.hdr-days .hdr-mode')!;
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: t.mode.plan }));
    expect(setOverride).toHaveBeenCalledWith('plan');
  });

  it('is absent outside the live window (ADR-0040)', () => {
    phase = 'before';
    const { container } = renderHeader();
    expect(container.querySelector('.hdr-mode')).toBeNull();
  });
});
