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

export interface NotificationSender {
  send(target: SubscriptionTarget, payload: PushPayload): Promise<SendOutcome>;
}

/** DI token — Nest cannot inject a TypeScript interface. A `Symbol`, matching `FX_PROVIDER`. */
export const NOTIFICATION_SENDER = Symbol('NOTIFICATION_SENDER');
