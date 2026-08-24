// @vitest-environment jsdom
//
// ADR-0204 §2 and §5. The clauses that matter most here are the ones about NOT appearing:
// the whole first half of the brief ("not too invasive and annoying") is a set of silences,
// and a silence is only real if something asserts it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { t } from '../i18n/he';
import { INSTALL_ASK_BUDGET, INSTALL_DEPARTURE_WINDOW_DAYS } from '../constants';

const overlay = vi.hoisted(() => ({ open: false }));
vi.mock('../state/nav-state', () => ({
  useHasOverlay: () => () => overlay.open,
  useOverlay: () => {},
}));

import { InstallAskBanner } from './InstallAskBanner';
import {
  __resetSessionForTest,
  __setDeferredPromptForTest,
  armInstallAskAfterJoin,
  installAskRecord,
  markInstallAsked,
} from '../lib/install';
import { INSTALL_ASK_GAP_MS } from '../constants';
import { getNow } from '../lib/useClock';

const TRIP = {
  name: 'יפן · אביב 2027',
  startDate: '2027-04-10',
  endDate: '2027-04-24',
  timezone: 'Asia/Tokyo',
};

/** Freeze the wall clock `daysUntilStart` reads, `days` before the trip starts. */
function atDaysBefore(days: number) {
  const start = Date.parse(`${TRIP.startDate}T00:00:00Z`);
  vi.setSystemTime(new Date(start - days * 86_400_000 + 6 * 3_600_000));
}

function show(trip = TRIP) {
  render(<InstallAskBanner trip={trip} />);
}

const askText = () => screen.queryByRole('status')?.textContent ?? '';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  overlay.open = false;
  __resetSessionForTest();
  // A device that CAN install, or every case below short-circuits on capability.
  __setDeferredPromptForTest({
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  } as never);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  atDaysBefore(60);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __setDeferredPromptForTest(null);
});

describe('door A — the first arrival after joining', () => {
  it('names the trip that was just joined', () => {
    armInstallAskAfterJoin();
    show();
    expect(askText()).toContain(TRIP.name);
  });

  it('fires once and never again, even on a remount', () => {
    armInstallAskAfterJoin();
    show();
    expect(screen.queryByRole('status')).toBeTruthy();
    cleanup();
    __resetSessionForTest();
    show();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('door B — departure is close', () => {
  it('stays silent while the trip is far off', () => {
    show();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('opens inside the window, and says how long', () => {
    atDaysBefore(INSTALL_DEPARTURE_WINDOW_DAYS);
    show();
    expect(askText()).toContain(String(INSTALL_DEPARTURE_WINDOW_DAYS));
  });

  it('says "tomorrow" rather than "in 1 days"', () => {
    atDaysBefore(1);
    show();
    expect(askText()).toContain(t.install.ask.soon(1));
    // The point of the branch: no digit reaches the sentence at all.
    expect(askText()).not.toMatch(/\d/);
  });

  it('stays silent once the trip has started', () => {
    atDaysBefore(-1);
    show();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('the budget (§5)', () => {
  it('records an answer when dismissed, and goes away', () => {
    armInstallAskAfterJoin();
    show();
    act(() => screen.getByLabelText(t.feedback.dismiss).click());
    expect(screen.queryByRole('status')).toBeNull();
    expect(installAskRecord().count).toBe(1);
  });

  it('holds one ask per session however many doors are open', () => {
    armInstallAskAfterJoin();
    atDaysBefore(1);
    show();
    act(() => screen.getByLabelText(t.feedback.dismiss).click());
    cleanup();
    // Same session: departure is still inside the window, and it must not re-ask.
    show();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('spends the session on the SHOWING, so an ignored banner still counts', () => {
    armInstallAskAfterJoin();
    show();
    cleanup();
    atDaysBefore(1);
    show();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('will not ask again inside the gap', () => {
    atDaysBefore(1);
    markInstallAsked(getNow());
    __resetSessionForTest();
    show();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('asks a second time once the gap has passed — a refusal is a snooze, not a verdict', () => {
    atDaysBefore(1);
    markInstallAsked(getNow() - INSTALL_ASK_GAP_MS - 1);
    __resetSessionForTest();
    show();
    expect(screen.queryByRole('status')).toBeTruthy();
  });

  it('stops for good at the budget', () => {
    atDaysBefore(1);
    for (let i = 0; i < INSTALL_ASK_BUDGET; i += 1) {
      markInstallAsked(getNow() - INSTALL_ASK_GAP_MS * (INSTALL_ASK_BUDGET - i + 1));
    }
    __resetSessionForTest();
    show();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('the quiet-moment guard', () => {
  it('waits rather than covering an open sheet, and does not spend the arm doing so', () => {
    overlay.open = true;
    armInstallAskAfterJoin();
    show();
    expect(screen.queryByRole('status')).toBeNull();
    // The arm survived, so the next quiet moment still gets its door.
    cleanup();
    overlay.open = false;
    show();
    expect(askText()).toContain(TRIP.name);
  });

  it('says nothing on a device that could not install anyway', () => {
    __setDeferredPromptForTest(null);
    armInstallAskAfterJoin();
    show();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says nothing when the app is already installed', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('display-mode') }));
    armInstallAskAfterJoin();
    show();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
