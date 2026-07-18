import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Change } from '@waypoint/shared';
import {
  WS_HEARTBEAT_INTERVAL_MS,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_CAP_MS,
  WS_WATCHDOG_TIMEOUT_MS,
} from '../constants';
import { openTripStream, reconnectDelay } from './ws';

// Spec-ish fake: dispatches by event type (the real code registers open/message/
// close/error separately) and exposes helpers to drive the lifecycle from a test.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0; // CONNECTING
  closed = false;
  sent: string[] = [];
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type: string, handler: (ev: unknown) => void) {
    (this.listeners[type] ??= []).push(handler);
  }
  private dispatch(type: string, ev: unknown) {
    (this.listeners[type] ?? []).forEach((h) => h(ev));
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.dispatch('close', {});
  }
  // --- test drivers ---
  open() {
    this.readyState = 1;
    this.dispatch('open', {});
  }
  emit(data: unknown) {
    this.dispatch('message', { data: JSON.stringify(data) });
  }
}

const change: Change = {
  id: 'ch-1',
  seq: '2',
  tripId: 'trip-japan-26',
  actorUserId: 'u-someone-else',
  entityType: 'event',
  entityId: 'ev-goldengai',
  action: 'status',
  after: { status: 'done' },
  createdAt: '2026-07-11T00:00:00.000Z',
};

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('reconnectDelay', () => {
  it('is exponential, jittered within [ceiling/2, ceiling], and capped', () => {
    // Deterministic bounds via an injected rand.
    expect(reconnectDelay(0, () => 0)).toBe(WS_RECONNECT_BASE_MS / 2);
    expect(reconnectDelay(0, () => 1)).toBe(WS_RECONNECT_BASE_MS);
    // A large attempt saturates at the cap.
    expect(reconnectDelay(100, () => 0)).toBe(WS_RECONNECT_CAP_MS / 2);
    expect(reconnectDelay(100, () => 1)).toBe(WS_RECONNECT_CAP_MS);
  });

  it('stays within bounds for the default random source', () => {
    for (let a = 0; a < 8; a += 1) {
      const ceiling = Math.min(WS_RECONNECT_CAP_MS, WS_RECONNECT_BASE_MS * 2 ** a);
      const d = reconnectDelay(a);
      expect(d).toBeGreaterThanOrEqual(ceiling / 2);
      expect(d).toBeLessThanOrEqual(ceiling);
    }
  });
});

describe('openTripStream', () => {
  it('applies an in-order change', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    const close = openTripStream('trip-japan-26', '1', { onChange, onResync });
    FakeWebSocket.instances[0].emit({ type: 'change', seq: '2', change });
    expect(onChange).toHaveBeenCalledWith(change);
    expect(onResync).not.toHaveBeenCalled();
    close();
  });

  it('detects a gap and triggers resync instead of applying the change', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    const close = openTripStream('trip-japan-26', '1', { onChange, onResync });
    FakeWebSocket.instances[0].emit({ type: 'change', seq: '5', change: { ...change, seq: '5' } });
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    close();
  });

  it('triggers resync when a hello carries a higher latestSeq (reconnect catch-up)', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    const close = openTripStream('trip-japan-26', '1', { onChange, onResync });
    FakeWebSocket.instances[0].emit({ type: 'hello', latestSeq: '9' });
    expect(onResync).toHaveBeenCalledTimes(1);
    close();
  });

  it('closes the socket via the returned cleanup', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const close = openTripStream('trip-japan-26', '1', { onChange: vi.fn(), onResync: vi.fn() });
    close();
    expect(FakeWebSocket.instances[0].closed).toBe(true);
  });

  it('schedules a reconnect on close and runs onReconnect once reopened', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onReconnect = vi.fn();
    const close = openTripStream('trip-japan-26', '1', {
      onChange: vi.fn(),
      onResync: vi.fn(),
      onReconnect,
    });
    FakeWebSocket.instances[0].open(); // first (initial) connection
    FakeWebSocket.instances[0].close(); // silent foreground drop
    expect(onReconnect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WS_RECONNECT_CAP_MS); // past any backoff delay
    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);

    FakeWebSocket.instances[1].open(); // the reconnect succeeds
    expect(onReconnect).toHaveBeenCalledTimes(1);
    close();
  });

  it('forces a reconnect when no frame arrives within the watchdog window', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const close = openTripStream('trip-japan-26', '1', { onChange: vi.fn(), onResync: vi.fn() });
    FakeWebSocket.instances[0].open();

    vi.advanceTimersByTime(WS_WATCHDOG_TIMEOUT_MS + 1); // no messages → watchdog trips
    expect(FakeWebSocket.instances[0].closed).toBe(true);

    vi.advanceTimersByTime(WS_RECONNECT_CAP_MS); // backoff elapses
    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    close();
  });

  it('sends periodic pings while open', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const close = openTripStream('trip-japan-26', '1', { onChange: vi.fn(), onResync: vi.fn() });
    FakeWebSocket.instances[0].open();

    vi.advanceTimersByTime(WS_HEARTBEAT_INTERVAL_MS + 1);
    expect(FakeWebSocket.instances[0].sent).toContain(JSON.stringify({ type: 'ping' }));
    close();
  });

  it('stops reconnecting after cleanup', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const close = openTripStream('trip-japan-26', '1', { onChange: vi.fn(), onResync: vi.fn() });
    FakeWebSocket.instances[0].open();
    close();
    FakeWebSocket.instances[0].close(); // a close after cleanup must not reconnect
    vi.advanceTimersByTime(WS_RECONNECT_CAP_MS * 2);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
