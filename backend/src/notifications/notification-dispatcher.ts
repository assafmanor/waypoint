// **Seam B of ADR-0197 §3.1: the dispatch.** It exists now, and not before, because phase 3
// is the first thing that produces a `DueSend[]` for it to carry — an interface with no
// caller was the speculative abstraction §3.1 was careful not to ask for.
//
// The distinction the whole seam rests on: **this carries "deliver this now", never "fire
// this at 18:00".** The first is a stateless unit of work that cannot go stale; the second is
// a prediction six edit paths can invalidate, which is what §3 rejects a queue for. So the
// sweep keeps the decision forever and only the delivery is ever handed off — and when
// volume asks for BullMQ, the swap is a `QueueDispatcher` beside `DirectDispatcher`, calling
// the same `NotificationSender`, with the ledger and the catalogue untouched.
import { Injectable, Logger } from '@nestjs/common';
import type { DueSend } from './notification-kind';
import { NotificationsService } from './notifications.service';

export interface NotificationDispatcher {
  /** Deliver everything in the list. Already deduped by the caller's ledger insert, so a
   *  dispatcher never decides whether something should be sent — only how it gets there. */
  dispatch(due: readonly DueSend[]): Promise<void>;
}

/** DI token — Nest cannot inject a TypeScript interface. */
export const NOTIFICATION_DISPATCHER = Symbol('NOTIFICATION_DISPATCHER');

/**
 * Today's dispatcher: send them in order, in this process.
 *
 * **Sequential rather than concurrent, deliberately.** A tick's list is small by
 * construction (ADR-0198 §5 caps a person at a handful a day), and the ceiling that matters
 * is §3.1's threshold 2 — a tick that cannot finish inside its 60-second interval, which is
 * ~4,000 sends. Sequential is simpler to reason about at this size and the concurrency knob
 * is exactly what `QueueDispatcher` is for; adding a bounded pool here first would be
 * optimising the thing that is measured to be free.
 *
 * One failure never stops the rest: a device that is unreachable is not a reason the next
 * person goes unnotified.
 */
@Injectable()
export class DirectDispatcher implements NotificationDispatcher {
  private readonly log = new Logger(DirectDispatcher.name);

  constructor(private readonly notifications: NotificationsService) {}

  async dispatch(due: readonly DueSend[]): Promise<void> {
    for (const send of due) {
      try {
        await this.notifications.sendToUser(send.userId, send.payload);
      } catch (error) {
        // Logged with the kind, never the payload: the payload is what a lock screen shows,
        // so it is content, and content does not belong in a server log.
        this.log.warn(`dispatch failed for ${send.kind}: ${String(error)}`);
      }
    }
  }
}
