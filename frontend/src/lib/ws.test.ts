import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Change } from '@waypoint/shared';
import { openTripStream } from './ws';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onmessage: ((ev: { data: string }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(_type: 'message', handler: (ev: { data: string }) => void) {
    this.onmessage = handler;
  }
  send() {}
  close() {
    this.closed = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
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
});

describe('openTripStream', () => {
  it('applies an in-order change', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    openTripStream('trip-japan-26', '1', { onChange, onResync });
    FakeWebSocket.instances[0].emit({ type: 'change', seq: '2', change });
    expect(onChange).toHaveBeenCalledWith(change);
    expect(onResync).not.toHaveBeenCalled();
  });

  it('detects a gap and triggers resync instead of applying the change', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    openTripStream('trip-japan-26', '1', { onChange, onResync });
    FakeWebSocket.instances[0].emit({ type: 'change', seq: '5', change: { ...change, seq: '5' } });
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('triggers resync when a hello carries a higher latestSeq (reconnect catch-up)', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onChange = vi.fn();
    const onResync = vi.fn();
    openTripStream('trip-japan-26', '1', { onChange, onResync });
    FakeWebSocket.instances[0].emit({ type: 'hello', latestSeq: '9' });
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('closes the socket via the returned cleanup', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const close = openTripStream('trip-japan-26', '1', { onChange: vi.fn(), onResync: vi.fn() });
    close();
    expect(FakeWebSocket.instances[0].closed).toBe(true);
  });
});
