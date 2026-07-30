// @vitest-environment jsdom
//
// **The invite join had no tests at all** — the same gap session 186 found on
// `CreateTrip`, on the other first-run surface, and no e2e spec reaches this route
// either. ADR-0143 put a state machine into it (the stamp, the tear, the handoff) and a
// refusal that renders rather than narrates, so the machine gets covered here.
//
// Scope is the OUTCOME path and the load states, not the ticket's layout: what can be
// logically wrong is which beat has landed, whether the handoff races it, and whether a
// dead invite still reads as a refusal.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../test/nav-harness';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useParams: () => ({ token: 'abc' }),
  useNavigate: () => navigate,
}));
vi.mock('../lib/outbox', () => ({ useIsOffline: () => false }));
vi.mock('../state/active-trip-id', () => ({ useActiveTripId: () => ({ setTripId: vi.fn() }) }));
vi.mock('../state/auth-state', () => ({
  useAuth: () => ({
    status: 'authed',
    me: { user: { id: 'u1' }, memberships: [] },
    login: vi.fn(),
  }),
}));
vi.mock('../lib/intent', () => ({
  consumeJoinIntent: () => null,
  saveIntent: vi.fn(),
  saveJoinIntent: vi.fn(),
}));

const fetchInvitePreview = vi.fn();
const joinTrip = vi.fn();
vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {},
  fetchInvitePreview: (...a: unknown[]) => fetchInvitePreview(...a),
  joinTrip: (...a: unknown[]) => joinTrip(...a),
  isInviteExpiredError: (e: unknown) => (e as { expired?: boolean })?.expired === true,
  isRemovedFromTripError: () => false,
}));

import { JoinTrip } from './JoinTrip';
import { setSimulatedNow } from '../lib/useClock';
import { JOIN_PASS } from '../constants';
import { t } from '../i18n/he';

// PIN THE CLOCK (frontend/CLAUDE.md): the countdown is derived from `now`, so an
// unpinned run asserts a different number every day.
const NOW = Date.parse('2026-07-31T09:00:00Z');
const PREVIEW = {
  tripId: 't1',
  tripName: 'יפן · ספטמבר',
  destination: 'יפן',
  startDate: '2026-09-12',
  endDate: '2026-09-23',
  memberCount: 4,
  icon: '🇯🇵',
};

describe('JoinTrip — the pass, its stamp and its tear (ADR-0143)', () => {
  beforeEach(() => {
    setSimulatedNow(NOW);
    navigate.mockClear();
    fetchInvitePreview.mockReset();
    joinTrip.mockReset();
  });
  afterEach(() => {
    setSimulatedNow(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  const land = () => document.querySelector<HTMLElement>('.join-land')!;

  async function openPass() {
    fetchInvitePreview.mockResolvedValue(PREVIEW);
    await act(async () => {
      render(wrapNav(<JoinTrip />));
    });
  }

  // Loading is the pass's own shape — but the sentence has to survive for anyone who
  // cannot see a shape, so the skeleton is an enhancement of the status, not a swap.
  it('shows a pass-shaped skeleton while loading, keeping the status text', async () => {
    fetchInvitePreview.mockReturnValue(new Promise(() => {}));
    render(wrapNav(<JoinTrip />));
    expect(document.querySelector('.join-ticket-skel')).toBeTruthy();
    expect(screen.getByText(t.shell.join.loading)).toBeTruthy();
  });

  it('marks the pass ready so the anticipation glow can ramp with it', async () => {
    await openPass();
    expect(land().dataset.pass).toBe('ready');
    expect(document.querySelector('.join-ticket-skel')).toBeNull();
  });

  it('stamps only on the server’s success, never optimistically', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openPass();
    // A join that never resolves must leave the pass unstamped — a stamp that has to be
    // un-stamped is worse than no stamp.
    joinTrip.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(screen.getByText(t.shell.join.joinButton));
    });
    expect(land().dataset.outcome).toBeUndefined();
    expect(document.querySelector('.ticket-stamp')).toBeNull();
  });

  it('plays stamp → tear → handoff, with the navigation last', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openPass();
    joinTrip.mockResolvedValue({ tripId: 't1' });
    await act(async () => {
      fireEvent.click(screen.getByText(t.shell.join.joinButton));
    });

    expect(land().dataset.outcome).toBe('stamped');
    expect(document.querySelector('.ticket-stamp')).toBeTruthy();
    // Nothing may race the beats: the handoff is the LAST thing that happens.
    expect(navigate).not.toHaveBeenCalled();

    await act(async () => void vi.advanceTimersByTime(JOIN_PASS.STAMP_MS));
    expect(land().dataset.outcome).toBe('torn');
    expect(navigate).not.toHaveBeenCalled();

    await act(async () => void vi.advanceTimersByTime(JOIN_PASS.TEAR_MS));
    expect(navigate).toHaveBeenCalledWith('/');
  });

  // A tappable "join" over a pass that has already been accepted is a second join.
  it('drops the CTA once the pass is stamped', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openPass();
    joinTrip.mockResolvedValue({ tripId: 't1' });
    await act(async () => {
      fireEvent.click(screen.getByText(t.shell.join.joinButton));
    });
    expect(document.querySelector('.join-cta')).toBeNull();
  });

  // Reduced motion does not skip the OUTCOME, it skips the performance (ADR-0140 §5).
  it('hands off immediately under prefers-reduced-motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    await openPass();
    joinTrip.mockResolvedValue({ tripId: 't1' });
    await act(async () => {
      fireEvent.click(screen.getByText(t.shell.join.joinButton));
    });
    expect(navigate).toHaveBeenCalledWith('/');
  });

  // An expired invite is a REJECTION (ADR-0067), and it was a paragraph — which on a
  // loading screen reads as a loading state that never resolved.
  it('renders an expired invite as a refused pass, not a sentence', async () => {
    fetchInvitePreview.mockRejectedValue({ expired: true });
    await act(async () => {
      render(wrapNav(<JoinTrip />));
    });
    expect(land().hasAttribute('data-refused')).toBe(true);
    expect(document.querySelector('.ticket-stamp.is-refused')?.textContent).toBe(
      t.shell.join.stampRefused,
    );
    expect(screen.getByText(t.shell.join.expired)).toBeTruthy();
    // …and no CTA: there is nothing to join.
    expect(document.querySelector('.join-cta')).toBeNull();
  });

  // Offline is a connectivity fact, not an invitation that failed — it keeps its
  // sentence rather than being dressed as a refusal.
  it('keeps offline as a plain status, not a refusal', async () => {
    fetchInvitePreview.mockRejectedValue(new TypeError('network'));
    await act(async () => {
      render(wrapNav(<JoinTrip />));
    });
    expect(land().hasAttribute('data-refused')).toBe(false);
    expect(screen.getByText(t.shell.join.offline)).toBeTruthy();
  });

  // The countdown counts UP to its value, and must END on the real number — a partial
  // value left on screen would report a date the trip does not have.
  it('counts the countdown up and lands on the true day count', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openPass();
    const shown = () => document.querySelector('.ticket-countdown')?.textContent ?? '';
    await act(async () => void vi.advanceTimersByTime(2000));
    // 2026-07-31 → 2026-09-12 is 43 days.
    expect(shown()).toContain('43');
  });
});
