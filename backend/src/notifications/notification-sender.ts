// **Seam A of ADR-0197 §3.1: the transport.** One method, and the only thing in the epic
// that talks to a push service.
//
// It exists from this phase because the specs need a fake — not because anything is
// swapped yet. What a later phase swaps is the DISPATCH (`NotificationDispatcher`,
// `Direct` → `Queue`), which is a different seam and is not written until the sweep that
// feeds it exists (§3.1); both dispatchers would call this same sender. The other reason
// this interface is worth its file: §1's deferred email transport is an implementation of
// it, so the iOS coverage hole has somewhere to land without touching a caller.
import type { PushPayload } from '@waypoint/shared';

/** The device to reach, as the sender needs it — the row's three fields and nothing else,
 *  so a sender cannot read (or log) the rest of a subscription. */
export interface SubscriptionTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What happened, as a closed set rather than an exception, because **all three outcomes
 *  are ordinary** and the caller acts differently on each (ADR-0197 §10):
 *
 *  - `sent` — delivered to the push service. Not "read by a human"; nothing here can know that.
 *  - `gone` — a `404`/`410`. **A subscription's normal death, not an error**: the caller
 *    deletes the row. Making this an exception would put the most routine outcome on the
 *    failure path.
 *  - `failed` — anything else (`429`, `5xx`, a network fault). Recorded and dropped; §3's
 *    sweep re-derives on the next tick rather than retrying here. */
export const SEND_OUTCOME = {
  SENT: 'sent',
  GONE: 'gone',
  FAILED: 'failed',
} as const;
export type SendOutcome = (typeof SEND_OUTCOME)[keyof typeof SEND_OUTCOME];

/**
 * **How the PUSH SERVICE should treat this message** — the two transport knobs RFC 8030
 * defines, both derived from policy a kind already declares.
 *
 * They exist because leaving them unset was a real, reported failure: `web-push`'s default
 * TTL is **four weeks**, so a device that was unreachable when a send went out received
 * "your flight is in two hours" whenever it next reconnected. The sweep already refuses to
 * re-derive a candidate past `staleAfterMs`; the push service was holding the same send for
 * 672 hours because nobody told it not to.
 */
export interface DeliveryOptions {
  /**
   * RFC 8030 §5.3. `high` is the row for "incoming call or time-sensitive alert" and is the
   * one delivered to a device on low battery — which is exactly what `timeCritical` means, so
   * the mapping is a rename rather than a judgement.
   */
  urgency: 'normal' | 'high';
  /**
   * How long the push service may hold this if the device is unreachable. **The kind's own
   * `staleAfterMs`**, because a send our sweep would refuse to make is not one a push service
   * should deliver on our behalf: past that point the notification is a lie about the time,
   * and expiring it is the honest outcome.
   */
  ttlSeconds: number;
}

export interface NotificationSender {
  send(
    target: SubscriptionTarget,
    payload: PushPayload,
    delivery: DeliveryOptions,
  ): Promise<SendOutcome>;
}

/** DI token — Nest cannot inject a TypeScript interface. A `Symbol`, matching `FX_PROVIDER`. */
export const NOTIFICATION_SENDER = Symbol('NOTIFICATION_SENDER');
