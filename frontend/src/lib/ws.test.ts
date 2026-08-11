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
    FakeWebSocket.instances[0].emit({ type: 'change', seq: '2', prevSeq: '1', change });
    expect(onChange).toHaveBeenCalledWith(change, false);
    expect(onResync).not.toHaveBeenCalled();
    close();
  });

  // `Change.seq` is a GLOBAL autoincrement, so a skip is what an ordered frame for one
  // trip normally looks like once a second trip exists (field report #32). `prevSeq` says
  // this one follows ours, so the skip must not read as a gap.
  it('applies a change whose seq skipped, when prevSeq says nothing was missed', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    const close = openTripStream('trip-japan-26', '1', { onChange, onResync });
    FakeWebSocket.instances[0].emit({
      type: 'change',
      seq: '40',
      prevSeq: '1',
      change: { ...change, seq: '40' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...change, seq: '40' }, false);
    expect(onResync).not.toHaveBeenCalled();
    close();
  });

  // A REAL gap. The change is still applied — it is data we are holding, and the resync
  // that reconciles what came before it is a network round-trip that is allowed to fail.
  it('applies a gapped change AND resyncs, flagging it so the caller holds its cursor', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    const close = openTripStream('trip-japan-26', '1', { onChange, onResync });
    FakeWebSocket.instances[0].emit({
      type: 'change',
      seq: '5',
      prevSeq: '4',
      change: { ...change, seq: '5' },
    });
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...change, seq: '5' }, true);
    close();
  });

  // A server that predates `prevSeq` (mid-deploy): fall back to the arithmetic rather
  // than treating every frame as in order.
  it('falls back to seq arithmetic when a frame carries no prevSeq', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    const close = openTripStream('trip-japan-26', '1', { onChange, onResync });
    FakeWebSocket.instances[0].emit({ type: 'change', seq: '5', change: { ...change, seq: '5' } });
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...change, seq: '5' }, true);
    close();
  });

  // The mount-time reconnect briefly runs two sockets, so a frame can arrive twice.
  it('ignores a repeated frame, and does not read the repeat as a gap', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    const close = openTripStream('trip-japan-26', '1', { onChange, onResync });
    const frame = { type: 'change', seq: '2', prevSeq: '1', change };
    FakeWebSocket.instances[0].emit(frame);
    FakeWebSocket.instances[0].emit(frame);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onResync).not.toHaveBeenCalled();
    close();
  });

  // The trip-deletion broadcast is ephemeral: nothing persisted it, so it carries no
  // cursor at all (`seq: '0'`). It must be delivered without touching the sequence.
  it('delivers the cursor-less trip-deletion frame without disturbing the cursor', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    const close = openTripStream('trip-japan-26', '1', { onChange, onResync });
    const gone = { ...change, seq: '0' };
    FakeWebSocket.instances[0].emit({ type: 'change', seq: '0', change: gone });
    expect(onChange).toHaveBeenCalledWith(gone);
    expect(onResync).not.toHaveBeenCalled();
    // The cursor is untouched, so the next real change is still in order.
    FakeWebSocket.instances[0].emit({ type: 'change', seq: '2', prevSeq: '1', change });
    expect(onChange).toHaveBeenCalledWith(change, false);
    expect(onResync).not.toHaveBeenCalled();
    close();
  });

  it('delivers an enrichment nudge with its place and fields', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onEnrichment = vi.fn();
    const close = openTripStream('trip-japan-26', '1', {
      onChange: vi.fn(),
      onResync: vi.fn(),
      onEnrichment,
    });
    FakeWebSocket.instances[0].emit({
      type: 'enrichment',
      placeId: 'pl-sensoji',
      fields: { summary: { en: { value: 'A temple.' } } },
    });
    expect(onEnrichment).toHaveBeenCalledWith('pl-sensoji', {
      summary: { en: { value: 'A temple.' } },
    });
    close();
  });

  it('does not advance the cursor on an enrichment, so the next change is not a gap', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    const close = openTripStream('trip-japan-26', '1', {
      onChange,
      onResync,
      onEnrichment: vi.fn(),
    });
    // Enrichment is outside the change log (ADR-0166 §6), so it must be invisible to the
    // sequence. If it advanced `lastSeq`, seq 2 below would read as already-seen; if it were
    // gap-checked, it would have triggered a needless full resync of its own.
    FakeWebSocket.instances[0].emit({ type: 'enrichment', placeId: 'pl-1', fields: {} });
    FakeWebSocket.instances[0].emit({ type: 'change', seq: '2', prevSeq: '1', change });
    expect(onChange).toHaveBeenCalledWith(change, false);
    expect(onResync).not.toHaveBeenCalled();
    close();
  });

  it('ignores an enrichment when no handler is registered', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onResync = vi.fn();
    // The handler is optional, so a client that does not care must not crash on one.
    const close = openTripStream('trip-japan-26', '1', { onChange: vi.fn(), onResync });
    expect(() =>
      FakeWebSocket.instances[0].emit({ type: 'enrichment', placeId: 'pl-1', fields: {} }),
    ).not.toThrow();
    expect(onResync).not.toHaveBeenCalled();
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
