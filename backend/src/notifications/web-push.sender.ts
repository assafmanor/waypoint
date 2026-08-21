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

/**
 * **Why a send failed, when there is no status to name it by.**
 *
 * A no-status rejection never reached the push service — `web-push` refused before the
 * request (a malformed subscription key, a VAPID complaint) or the socket did (DNS, TLS,
 * timeout). In every one of those cases the library's own message IS the diagnosis, and
 * dropping it is what turned a real production failure into "push send failed (no status)"
 * with nothing to act on.
 *
 * **Two rules keep this inside the file's own privacy promise.** The endpoint is a bearer
 * capability, so it is subtracted from the text rather than trusted not to appear —
 * `WebPushError` carries an `endpoint` property and a future message could interpolate it.
 * And the text is capped, because a library is free to put a whole response body in there.
 */
function reasonOf(error: unknown, endpoint: string): string {
  if (typeof error !== 'object' || error === null) return String(error).slice(0, REASON_MAX_CHARS);
  const { code, message } = error as { code?: unknown; message?: unknown };
  const parts = [
    typeof code === 'string' ? code : undefined,
    typeof message === 'string' ? message : undefined,
  ].filter(Boolean);
  const text = parts.length > 0 ? parts.join(': ') : (error.constructor?.name ?? 'unknown');
  // Subtract the capability, don't hope for its absence.
  return text.split(endpoint).join('[endpoint]').slice(0, REASON_MAX_CHARS);
}

/** Enough for a library message and a Node error code, short of a response body. */
const REASON_MAX_CHARS = 200;

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
    //
    // **`.default` is not optional and its absence cost every send in production.**
    // `web-push` is CommonJS, and a dynamic `import()` of a CJS module hands back a Module
    // namespace whose named exports are whatever `cjs-module-lexer` could detect
    // statically. For this library that is `WebPushError` and `supportedContentEncodings`
    // and **not** `sendNotification` — so `webpush.sendNotification` was `undefined`, every
    // send threw `is not a function`, and because that throw carries no `statusCode` it was
    // logged as an ordinary status-less failure for as long as the feature existed. The
    // fallback keeps a real ESM build (or a spec's own shape) working if the named export
    // ever appears.
    const mod = await import('web-push');
    const webpush = mod.default ?? mod;
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
      // A status names itself; without one the reason is the only thing that can.
      this.log.warn(
        status !== undefined
          ? `push send failed (${status}) to ${endpointHost(target.endpoint)}`
          : `push send failed (no status) to ${endpointHost(target.endpoint)}: ` +
              reasonOf(error, target.endpoint),
      );
      return SEND_OUTCOME.FAILED;
    }
  }
}
