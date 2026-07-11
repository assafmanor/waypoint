// Realtime channel client (sync-and-offline.md "Realtime channel"). Native
// WebSocket — no client library needed for one connection per trip.
import type { Change } from '@waypoint/shared';
import { API_BASE_URL } from './api';

export interface TripStreamHandlers {
  /** A `Change` broadcast in-order (no gap). */
  onChange: (change: Change) => void;
  /** Gap detected (seq skipped) or a post-reconnect `hello` is ahead of our cursor —
   *  caller should refetch the whole snapshot (no incremental catch-up, per the doc). */
  onResync: () => void;
}

function streamUrl(tripId: string): string {
  const base = API_BASE_URL || window.location.origin;
  return `${base.replace(/^http/, 'ws')}/trips/${tripId}/stream`;
}

type ServerMessage =
  | { type: 'hello'; latestSeq: string }
  | { type: 'change'; seq: string; change: Change }
  | { type: 'presence' }
  | { type: 'pong' };

/** Opens the per-trip stream and tracks `lastSeq`. Returns a cleanup function. */
export function openTripStream(
  tripId: string,
  initialSeq: string,
  handlers: TripStreamHandlers,
): () => void {
  let lastSeq = BigInt(initialSeq);
  const ws = new WebSocket(streamUrl(tripId));

  ws.addEventListener('message', (ev: MessageEvent) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(ev.data as string) as ServerMessage;
    } catch {
      return;
    }
    if (msg.type === 'hello') {
      if (BigInt(msg.latestSeq) > lastSeq) handlers.onResync();
      lastSeq = BigInt(msg.latestSeq);
    } else if (msg.type === 'change') {
      const seq = BigInt(msg.seq);
      const isGap = seq > lastSeq + 1n;
      lastSeq = seq;
      if (isGap) handlers.onResync();
      else handlers.onChange(msg.change);
    }
  });

  return () => ws.close();
}
