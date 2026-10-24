// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useLiveFix } from './useLiveFix';
import { POSITION_REFRESH_MS, POSITION_FRESH_MS } from './travel-position';

type SuccessFn = (position: {
  coords: { latitude: number; longitude: number; accuracy?: number };
  timestamp: number;
}) => void;

let getCurrentPosition: ReturnType<typeof vi.fn>;
let visibility: DocumentVisibilityState = 'visible';

const install = (state: PermissionState = 'granted') => {
  getCurrentPosition = vi.fn();
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
  Object.defineProperty(navigator, 'permissions', {
    value: { query: vi.fn().mockResolvedValue({ state, addEventListener: vi.fn() }) },
    configurable: true,
  });
  Object.defineProperty(document, 'visibilityState', {
    get: () => visibility,
    configurable: true,
  });
};

/** Answer the Nth outstanding ask, so a refresh can be told apart from the first fix. */
const answer = (n: number, at: number) =>
  act(() => {
    (getCurrentPosition.mock.calls[n]![0] as SuccessFn)({
      coords: { latitude: 64.9, longitude: -23.2 },
      timestamp: at,
    });
  });

beforeEach(() => {
  visibility = 'visible';
  // `shouldAdvanceTime` so `waitFor` (which polls on a real timer) still resolves the
  // Permissions promise while the refresh cadence below is under this test's control.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  install();
});
afterEach(() => {
  // **Explicit, because this hook listens on the DOCUMENT.** A hook left mounted keeps its
  // `visibilitychange` listener on a document every test shares, so the next test's dispatch
  // reaches it and asks through whatever `navigator.geolocation` is current — which reads as an
  // extra refresh and is a leaked subscription. Auto-cleanup is not configured in this suite.
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useLiveFix (ADR-0207 §4 as amended, 2026-09-20)', () => {
  it('asks once on mount where consent already exists, and never prompts without it', async () => {
    const { result } = renderHook(() => useLiveFix(false));
    await waitFor(() => expect(result.current.permission).toBe('granted'));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('asks nothing at all when the permission is only `prompt`', async () => {
    install('prompt');
    const { result } = renderHook(() => useLiveFix(true));
    await waitFor(() => expect(result.current.permission).toBe('prompt'));
    act(() => void vi.advanceTimersByTime(POSITION_REFRESH_MS * 3));
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  // The defect this hook exists for: one ask per mount against a two-minute bound, so the board
  // was reading an expired fix from two minutes after it opened.
  it('re-asks while a leg is live, inside the freshness bound', async () => {
    const { result } = renderHook(() => useLiveFix(true));
    await waitFor(() => expect(result.current.permission).toBe('granted'));
    answer(0, 1_000);
    act(() => void vi.advanceTimersByTime(POSITION_REFRESH_MS));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    answer(1, 1_000 + POSITION_REFRESH_MS);
    expect(result.current.fixedAt).toBe(1_000 + POSITION_REFRESH_MS);
  });

  it('and the cadence leaves room for a slow fix to land before the old one expires', () => {
    expect(POSITION_REFRESH_MS).toBeLessThan(POSITION_FRESH_MS);
  });

  it('asks nothing while there is no live leg — the battery argument, intact', async () => {
    const { result } = renderHook(() => useLiveFix(false));
    await waitFor(() => expect(result.current.permission).toBe('granted'));
    act(() => void vi.advanceTimersByTime(POSITION_REFRESH_MS * 3));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('asks nothing while the screen is hidden, and at once when it comes back', async () => {
    const { result } = renderHook(() => useLiveFix(true));
    await waitFor(() => expect(result.current.permission).toBe('granted'));
    visibility = 'hidden';
    act(() => void vi.advanceTimersByTime(POSITION_REFRESH_MS * 2));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    visibility = 'visible';
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('stops asking once the leg is gone', async () => {
    const { result, rerender } = renderHook(({ live }) => useLiveFix(live), {
      initialProps: { live: true },
    });
    await waitFor(() => expect(result.current.permission).toBe('granted'));
    act(() => void vi.advanceTimersByTime(POSITION_REFRESH_MS));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    rerender({ live: false });
    act(() => void vi.advanceTimersByTime(POSITION_REFRESH_MS * 3));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });
});
