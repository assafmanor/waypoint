// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGeolocation } from './useGeolocation';

type SuccessFn = (position: { coords: { latitude: number; longitude: number } }) => void;
type ErrorFn = (error: { code: number; PERMISSION_DENIED: number }) => void;

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;

let getCurrentPosition: ReturnType<typeof vi.fn>;
let permissionState: PermissionState | undefined;

const install = ({ geolocation = true }: { geolocation?: boolean } = {}) => {
  getCurrentPosition = vi.fn();
  Object.defineProperty(navigator, 'geolocation', {
    value: geolocation ? { getCurrentPosition } : undefined,
    configurable: true,
  });
  Object.defineProperty(navigator, 'permissions', {
    value: permissionState
      ? {
          query: vi.fn().mockResolvedValue({
            state: permissionState,
            addEventListener: vi.fn(),
          }),
        }
      : undefined,
    configurable: true,
  });
};

const grant = (lat: number, lng: number) =>
  (getCurrentPosition.mock.calls[0][0] as SuccessFn)({ coords: { latitude: lat, longitude: lng } });
const fail = (code: number) =>
  (getCurrentPosition.mock.calls[0][1] as ErrorFn)({ code, PERMISSION_DENIED });

describe('useGeolocation (ADR-0006 own-device / ADR-0109 §6 just-in-time)', () => {
  beforeEach(() => {
    permissionState = undefined;
    install();
  });
  afterEach(() => vi.restoreAllMocks());

  it('starts idle and asks for NOTHING until requested — the tab renders without location', () => {
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.status).toBe('idle');
    expect(result.current.coords).toBeUndefined();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('goes locating → granted and exposes the fix', async () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.request());
    expect(result.current.status).toBe('locating');
    act(() => grant(35.68, 139.76));
    expect(result.current.status).toBe('granted');
    expect(result.current.coords).toEqual({ lat: 35.68, lng: 139.76 });
  });

  it('a refusal is denied AND blocked — a retry could not re-prompt', () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.request());
    act(() => fail(PERMISSION_DENIED));
    expect(result.current.status).toBe('denied');
    expect(result.current.blocked).toBe(true);
  });

  it('a failed fix is unavailable but NOT blocked — retrying is worth offering', () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.request());
    act(() => fail(POSITION_UNAVAILABLE));
    expect(result.current.status).toBe('unavailable');
    expect(result.current.blocked).toBe(false);
  });

  it('reports unavailable when the device has no geolocation at all', () => {
    install({ geolocation: false });
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.request());
    expect(result.current.status).toBe('unavailable');
  });

  it('reads a hard-denied site setting up front, before anything is requested', async () => {
    permissionState = 'denied';
    install();
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.blocked).toBe(true));
    // Still idle: knowing it is blocked is not the same as having asked.
    expect(result.current.status).toBe('idle');
  });

  it('a second request refreshes the fix', () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.request());
    act(() => grant(35.68, 139.76));
    act(() => result.current.request());
    act(() =>
      (getCurrentPosition.mock.calls[1][0] as SuccessFn)({
        coords: { latitude: 1, longitude: 2 },
      }),
    );
    expect(result.current.coords).toEqual({ lat: 1, lng: 2 });
  });

  it('ignores a fix that lands after the screen is gone', () => {
    const { result, unmount } = renderHook(() => useGeolocation());
    act(() => result.current.request());
    unmount();
    expect(() => act(() => grant(35.68, 139.76))).not.toThrow();
  });
});
