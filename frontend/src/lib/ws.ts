// Realtime channel client (sync-and-offline.md "Realtime channel"). Native
// WebSocket — no client library needed for one connection per trip. Handles its
// own reconnect (bounded exponential backoff) + heartbeat so a foreground socket
// drop (proxy/idle timeout, server restart) is detected and recovered, not left
// silently stale until the next online/visibility event (F-04).
import { WS_MESSAGE_TYPE, type Change } from '@waypoint/shared';
import {
  WS_HEARTBEAT_INTERVAL_MS,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_CAP_MS,
  WS_WATCHDOG_TIMEOUT_MS,
} from '../constants';
import { API_BASE_URL } from './api';

export interface TripStreamHandlers {
  /** A `Change` broadcast in-order (no gap). */
  onChange: (change: Change) => void;
  /** Gap detected (seq skipped) or a post-reconnect `hello` is ahead of our cursor —
   *  caller should refetch the whole snapshot (no incremental catch-up, per the doc). */
  onResync: () => void;
  /** The socket was re-opened after dropping. The caller should run its catch-up
   *  (flush the outbox + replay `changes?sinceSeq=`) since frames may have been
   *  missed while the socket was down. Not fired on the very first connect. */
  onReconnect?: () => void;
}

// No API_BASE_URL (prod, same-origin) → a relative URL, which the WebSocket
// constructor resolves against the page's own origin and maps http(s) to
// ws(s) itself (WHATWG spec) — avoids depending on `window` here at all.
function streamUrl(tripId: string): string {
  const path = `/trips/${tripId}/stream`;
  return API_BASE_URL ? `${API_BASE_URL.replace(/^http/, 'ws')}${path}` : path;
}

type ServerMessage =
  | { type: typeof WS_MESSAGE_TYPE.HELLO; latestSeq: string }
  | { type: typeof WS_MESSAGE_TYPE.CHANGE; seq: string; change: Change }
  | { type: typeof WS_MESSAGE_TYPE.PRESENCE }
  | { type: typeof WS_MESSAGE_TYPE.PONG };

/** Backoff delay for reconnect attempt `n` (0-based): exponential from base,
 *  clamped to the cap, with "equal jitter" so a fleet of clients reconnecting
 *  after the same server blip don't thunder in lockstep. Result lands in
 *  `[ceiling/2, ceiling]` where `ceiling = min(cap, base * 2^n)`. Pure — `rand`
 *  is injectable so it can be unit-tested deterministically. */
export function reconnectDelay(attempt: number, rand: () => number = Math.random): number {
  const ceiling = Math.min(WS_RECONNECT_CAP_MS, WS_RECONNECT_BASE_MS * 2 ** attempt);
  const half = ceiling / 2;
  return Math.round(half + rand() * half);
}

/** Opens the per-trip stream and tracks `lastSeq`, reconnecting on drop with a
 *  heartbeat/watchdog. Returns a cleanup function that cancels all timers, stops
 *  further reconnects, and closes the socket. */
export function openTripStream(
  tripId: string,
  initialSeq: string,
  handlers: TripStreamHandlers,
): () => void {
  let lastSeq = BigInt(initialSeq);
  let ws: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  function stopLiveness(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (watchdogTimer !== null) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  }

  // Any inbound frame proves the socket is alive; re-arm the no-frames watchdog.
  function kickWatchdog(): void {
    if (watchdogTimer !== null) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(forceReconnect, WS_WATCHDOG_TIMEOUT_MS);
  }

  function startHeartbeat(): void {
    stopLiveness();
    heartbeatTimer = setInterval(() => {
      try {
        ws?.send(JSON.stringify({ type: WS_MESSAGE_TYPE.PING }));
      } catch {
        // A send on a not-open socket throws; the watchdog/close path recovers.
      }
    }, WS_HEARTBEAT_INTERVAL_MS);
    kickWatchdog();
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer !== null) return;
    const delay = reconnectDelay(attempt);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open(true);
    }, delay);
  }

  // Watchdog tripped (or an error with no close): tear the dead socket down and
  // let its close handler — or the fallback here — schedule the reconnect.
  function forceReconnect(): void {
    stopLiveness();
    const dead = ws;
    ws = null;
    if (dead) {
      try {
        dead.close();
      } catch {
        // ignore — we only care that it stops delivering frames.
      }
    }
    scheduleReconnect();
  }

  function open(isReconnect: boolean): void {
    if (stopped) return;
    const socket = new WebSocket(streamUrl(tripId));
    ws = socket;

    socket.addEventListener('open', () => {
      if (stopped) return;
      attempt = 0; // a clean connection resets the backoff
      startHeartbeat();
      if (isReconnect) handlers.onReconnect?.();
    });

    socket.addEventListener('message', (ev: MessageEvent) => {
      if (watchdogTimer !== null) kickWatchdog();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === WS_MESSAGE_TYPE.HELLO) {
        if (BigInt(msg.latestSeq) > lastSeq) handlers.onResync();
        lastSeq = BigInt(msg.latestSeq);
      } else if (msg.type === WS_MESSAGE_TYPE.CHANGE) {
        const seq = BigInt(msg.seq);
        const isGap = seq > lastSeq + 1n;
        lastSeq = seq;
        if (isGap) handlers.onResync();
        else handlers.onChange(msg.change);
      }
    });

    socket.addEventListener('close', () => {
      if (ws === socket) ws = null;
      if (stopped) return;
      stopLiveness();
      scheduleReconnect();
    });

    // `error` is usually followed by `close`; closing here guarantees the
    // reconnect path runs even on environments that fire only `error`.
    socket.addEventListener('error', () => {
      try {
        socket.close();
      } catch {
        // ignore
      }
    });
  }

  open(false);

  return () => {
    stopped = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stopLiveness();
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
  };
}
