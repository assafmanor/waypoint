// The one implementation of ADR-0197 §1's transport: `web-push` over VAPID.
//
// Three properties, and the first two are the same ones every outbound pipe in this repo
// already has (ADR-0166 §7, ADR-0180 §7):
//
//  - **A kill switch, read per send** (`PUSH_DISABLED`), so it can be flipped without a
//    deploy and stubbed in a test. This is the third thing in the app that acts on its own
//    initiative and it gets the one switch that stops it doing so.
//  - **Never throws at the caller.** Every outcome is a value (`SEND_OUTCOME`), because a
//    dead subscription is the routine case, not an exception — see the interface.
//  - **Nothing about a subscription is logged whole.** An endpoint is a bearer capability:
//    anyone holding it can send this device a notification. So the log carries its HOST and
//    never its path, which is enough to tell FCM from Mozilla when reading an error and
//    useless to anyone who reads the log.
import { Injectable, Logger } from '@nestjs/common';
import { PUSH_PAYLOAD_MAX_BYTES, type PushPayload } from '@waypoint/shared';
import { PUSH_DISABLED } from '../common/env';
import { requireVapid } from './vapid';
import {
  SEND_OUTCOME,
  type NotificationSender,
  type SendOutcome,
  type SubscriptionTarget,
} from './notification-sender';

/** Statuses that mean *this subscription no longer exists* rather than *this send failed*
 *  (ADR-0197 §10). `404` is "we never had it", `410` is "it is gone"; both end the row. */
const GONE_STATUSES = new Set([404, 410]);

/** `web-push`'s error carries the push service's status on a non-standard field. Narrowed
 *  here rather than cast at the use site, so a library shape change is one edit. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : undefined;
}

/** The host of an endpoint, for a log line that identifies the push service and nothing
 *  else. Answers `'?'` rather than throwing on an unparseable value — a log line is not
 *  worth an exception. */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return '?';
  }
}

@Injectable()
export class WebPushSender implements NotificationSender {
  private readonly log = new Logger(WebPushSender.name);

  async send(target: SubscriptionTarget, payload: PushPayload): Promise<SendOutcome> {
    if (process.env[PUSH_DISABLED]) return SEND_OUTCOME.FAILED;

    const vapid = requireVapid();
    const body = JSON.stringify(payload);
    // Checked before the call, not after a rejection: a payload over the service's ceiling
    // is our bug, and a 413 from the far end is a slower way to learn it. Byte length, not
    // string length — the copy is Hebrew, so every character is two bytes or more.
    if (Buffer.byteLength(body, 'utf8') > PUSH_PAYLOAD_MAX_BYTES) {
      this.log.error(`push payload over ${PUSH_PAYLOAD_MAX_BYTES} bytes; dropped`);
      return SEND_OUTCOME.FAILED;
    }

    // Imported lazily so the library is not loaded by a process that never sends — and so
    // the module graph of a spec that stubs this sender stays free of it.
    const webpush = await import('web-push');
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        body,
        { vapidDetails: vapid },
      );
      return SEND_OUTCOME.SENT;
    } catch (error) {
      const status = statusOf(error);
      if (status !== undefined && GONE_STATUSES.has(status)) return SEND_OUTCOME.GONE;
      this.log.warn(
        `push send failed (${status ?? 'no status'}) to ${endpointHost(target.endpoint)}`,
      );
      return SEND_OUTCOME.FAILED;
    }
  }
}
