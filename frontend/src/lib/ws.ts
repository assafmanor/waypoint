// Realtime channel client (sync-and-offline.md "Realtime channel"). Native
// WebSocket — no client library needed for one connection per trip. Handles its
// own reconnect (bounded exponential backoff) + heartbeat so a foreground socket
// drop (proxy/idle timeout, server restart) is detected and recovered, not left
// silently stale until the next online/visibility event (F-04).
import { WS_MESSAGE_TYPE, type Change, type DeliveredEnrichmentFields } from '@waypoint/shared';
import {
  WS_HEARTBEAT_INTERVAL_MS,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_CAP_MS,
  WS_WATCHDOG_TIMEOUT_MS,
} from '../constants';
import { API_BASE_URL } from './api';

export interface TripStreamHandlers {
  /** A `Change` that arrived over the socket. **Always called for a frame we hold**,
   *  gap or no gap: a delivered change is certain data, and trading it for a network
   *  round-trip that is allowed to fail is how a peer's edit went missing until the
   *  screen was remounted (field report #32).
   *
   *  `afterGap` says the frames before this one were missed, so the caller must apply
   *  the payload but **not** advance its `sinceSeq` cursor past it — the resync that
   *  follows owns the cursor, and if the resync fails, the next `changes?sinceSeq=`
   *  catch-up still has to replay what was skipped rather than start after it. */
  onChange: (change: Change, afterGap?: boolean) => void;
  /** Frames were missed, or a post-reconnect `hello` is ahead of our cursor — caller
   *  should refetch the whole snapshot (no incremental catch-up, per the doc). Fires
   *  IN ADDITION to `onChange` for a gapped frame, never instead of it. */
  onResync: () => void;
  /** The socket was re-opened after dropping. The caller should run its catch-up
   *  (flush the outbox + replay `changes?sinceSeq=`) since frames may have been
   *  missed while the socket was down. Not fired on the very first connect. */
  onReconnect?: () => void;
  /** **Enrichment landed for a place this trip holds** (ADR-0166 §6). Not a `Change` and
   *  carries no `seq`, so missing one costs nothing: the value is in the next snapshot. */
  onEnrichment?: (placeId: string, fields: DeliveredEnrichmentFields) => void;
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
  // `prevSeq` is THIS TRIP's preceding change, stamped by the writer under the same
  // per-trip lock that allocated `seq` (sync-and-offline.md "Realtime channel").
  // Optional only so a client running against an older server still connects.
  | { type: typeof WS_MESSAGE_TYPE.CHANGE; seq: string; prevSeq?: string; change: Change }
  | { type: typeof WS_MESSAGE_TYPE.PRESENCE }
  // No `seq`: enrichment is outside the change log (ADR-0166 §6).
  | {
      type: typeof WS_MESSAGE_TYPE.ENRICHMENT;
      placeId: string;
      fields: DeliveredEnrichmentFields;
    }
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
        // The trip-deletion frame is EPHEMERAL: nothing persisted it, so it carries no
        // cursor at all (`seq: '0'`, trips.service's `syntheticChange`). Deliver it and
        // touch neither `lastSeq` nor the gap test — the same rule enrichment follows.
        if (seq === 0n) {
          handlers.onChange(msg.change);
          return;
        }
        // A frame we already applied — the mount-time reconnect briefly runs two
        // sockets, so the same change can arrive twice. Nothing to do, and it must
        // not read as a gap on the way past.
        if (seq <= lastSeq) return;
        // **`Change.seq` is a GLOBAL autoincrement, not a per-trip one** (schema.prisma):
        // a write to ANY trip advances it, so `seq === lastSeq + 1` stops being true for a
        // perfectly ordered frame the moment the database holds a second active trip. That
        // arithmetic was the whole gap test, so ordinary live delivery was being classified
        // as a gap. `prevSeq` answers the question exactly instead of inferring it.
        const isGap =
          msg.prevSeq === undefined ? seq > lastSeq + 1n : BigInt(msg.prevSeq) !== lastSeq;
        lastSeq = seq;
        // Apply first, reconcile second — see `onChange`. A gapped frame is still a real
        // change we are holding; the resync only fills in what came before it.
        handlers.onChange(msg.change, isGap);
        if (isGap) handlers.onResync();
      } else if (msg.type === WS_MESSAGE_TYPE.ENRICHMENT) {
        // **Touches neither `lastSeq` nor the gap check** (ADR-0166 §6): enrichment is outside
        // the change log, so it has no place in the cursor. Advancing on one would make the
        // next real change look like a gap and trigger a needless full resync; testing it for
        // a gap would be reading a sequence it was never part of.
        handlers.onEnrichment?.(msg.placeId, msg.fields);
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
