import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_KIND, PUSH_PAYLOAD_MAX_BYTES, type PushPayload } from '@waypoint/shared';
import { SEND_OUTCOME } from './notification-sender';
import { WebPushSender } from './web-push.sender';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}));

const TARGET = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'k', auth: 'a' };
const PAYLOAD: PushPayload = {
  kind: NOTIFICATION_KIND.TEST,
  title: 'משימה להיום',
  body: 'צילום דרכונים',
  url: '/',
};

/** What `web-push` throws: an Error carrying the push service's status on `statusCode`. */
function pushError(statusCode: number): Error {
  return Object.assign(new Error(`push service said ${statusCode}`), { statusCode });
}

describe('WebPushSender', () => {
  /** **Installed by the hook, never in a test body.** A `mockRestore()` written as the last
   *  line of a test does not run when an assertion above it fails — and because this spies a
   *  shared PROTOTYPE method, the leaked spy is then reused by the next `spyOn`, carrying its
   *  predecessor's calls with it. That cost a green-but-vacuous assertion here once: the cap
   *  test read `calls[0]`, which was the previous test's line, and passed with the cap
   *  removed. Hence both halves of the rule — hook-scoped teardown, and `lastWarning()`. */
  let warn: ReturnType<typeof vi.spyOn>;
  const lastWarning = () => String(warn.mock.calls.at(-1)?.[0] ?? '');

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
    process.env.VAPID_PUBLIC_KEY = Buffer.alloc(65, 4).toString('base64url');
    process.env.VAPID_PRIVATE_KEY = Buffer.alloc(32, 9).toString('base64url');
    process.env.VAPID_SUBJECT = 'mailto:ops@example.com';
    delete process.env.PUSH_DISABLED;
  });

  afterEach(() => {
    warn.mockRestore();
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    delete process.env.PUSH_DISABLED;
  });

  it('sends the payload as JSON with the VAPID details', async () => {
    await expect(new WebPushSender().send(TARGET, PAYLOAD)).resolves.toBe(SEND_OUTCOME.SENT);

    const [subscription, body, options] = sendNotification.mock.calls[0];
    expect(subscription).toEqual({
      endpoint: TARGET.endpoint,
      keys: { p256dh: 'k', auth: 'a' },
    });
    expect(JSON.parse(body as string)).toEqual(PAYLOAD);
    expect((options as { vapidDetails: { subject: string } }).vapidDetails.subject).toBe(
      'mailto:ops@example.com',
    );
  });

  // ADR-0197 §10. These two are a subscription's normal death, and the distinction is what
  // lets the caller prune the row instead of retrying forever against a device that is gone.
  it.each([404, 410])('maps %i to GONE rather than to a failure', async (status) => {
    sendNotification.mockRejectedValueOnce(pushError(status));
    await expect(new WebPushSender().send(TARGET, PAYLOAD)).resolves.toBe(SEND_OUTCOME.GONE);
  });

  it.each([400, 413, 429, 500, 503])('maps %i to FAILED, so the row survives', async (status) => {
    sendNotification.mockRejectedValueOnce(pushError(status));
    await expect(new WebPushSender().send(TARGET, PAYLOAD)).resolves.toBe(SEND_OUTCOME.FAILED);
  });

  it('treats a status-less network fault as FAILED', async () => {
    sendNotification.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(new WebPushSender().send(TARGET, PAYLOAD)).resolves.toBe(SEND_OUTCOME.FAILED);
  });

  it('NAMES the reason when there is no status, because nothing else can', async () => {
    // The production failure that prompted this: `push send failed (no status) to
    // fcm.googleapis.com` and nothing to act on. A no-status rejection never reached the
    // service, so the library's own message is the entire diagnosis.
    sendNotification.mockRejectedValueOnce(
      Object.assign(new Error('Vapid subject is not a url or mailto url'), { code: 'EINVAL' }),
    );

    await expect(new WebPushSender().send(TARGET, PAYLOAD)).resolves.toBe(SEND_OUTCOME.FAILED);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(lastWarning()).toContain('no status');
    expect(lastWarning()).toContain('EINVAL');
    expect(lastWarning()).toContain('Vapid subject is not a url or mailto url');
  });

  it('still logs a reason when the error is not an Error at all', async () => {
    sendNotification.mockRejectedValueOnce('a string, not an Error');

    await expect(new WebPushSender().send(TARGET, PAYLOAD)).resolves.toBe(SEND_OUTCOME.FAILED);
    expect(lastWarning()).toContain('a string, not an Error');
  });

  it('SUBTRACTS the endpoint from the reason — it is a bearer capability', async () => {
    // `WebPushError` carries an `endpoint` property, so a future library version could
    // interpolate it into the message. The host is fine in a log line; the path never is.
    sendNotification.mockRejectedValueOnce(new Error(`refused to POST ${TARGET.endpoint} today`));

    await new WebPushSender().send(TARGET, PAYLOAD);

    expect(lastWarning()).not.toContain('/fcm/send/abc');
    expect(lastWarning()).toContain('[endpoint]');
  });

  it('caps the reason, so a response body cannot become a log entry', async () => {
    sendNotification.mockRejectedValueOnce(new Error('x'.repeat(5_000)));

    await new WebPushSender().send(TARGET, PAYLOAD);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(lastWarning().length).toBeLessThan(400);
  });

  it('says nothing extra when there IS a status — the number is the diagnosis', async () => {
    sendNotification.mockRejectedValueOnce(pushError(429));

    await new WebPushSender().send(TARGET, PAYLOAD);
    expect(lastWarning()).toBe('push send failed (429) to fcm.googleapis.com');
  });

  it('never throws at the caller, whatever comes back', async () => {
    sendNotification.mockRejectedValueOnce('a string, not an Error');
    await expect(new WebPushSender().send(TARGET, PAYLOAD)).resolves.toBe(SEND_OUTCOME.FAILED);
  });

  it('refuses an oversized payload BEFORE the request, measuring bytes not characters', async () => {
    // Hebrew is ≥2 bytes a character, which is exactly why the check is on bytes: a body
    // whose `.length` is comfortably under the cap can still be over it on the wire.
    const long = 'א'.repeat(PUSH_PAYLOAD_MAX_BYTES);
    expect(long.length).toBeLessThanOrEqual(PUSH_PAYLOAD_MAX_BYTES);
    expect(Buffer.byteLength(long, 'utf8')).toBeGreaterThan(PUSH_PAYLOAD_MAX_BYTES);

    await expect(new WebPushSender().send(TARGET, { ...PAYLOAD, body: long })).resolves.toBe(
      SEND_OUTCOME.FAILED,
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends nothing while PUSH_DISABLED is set', async () => {
    process.env.PUSH_DISABLED = '1';
    await expect(new WebPushSender().send(TARGET, PAYLOAD)).resolves.toBe(SEND_OUTCOME.FAILED);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('does not send when the server holds no keypair', async () => {
    // The throw is `requireEnv`'s and names the variable. It reaches the caller rather than
    // becoming a `FAILED`, because a missing key is a misconfiguration to fix, not a device
    // to mark — and `validateConfig` makes it impossible in production.
    delete process.env.VAPID_PRIVATE_KEY;
    await expect(new WebPushSender().send(TARGET, PAYLOAD)).rejects.toThrow(
      /VAPID_PRIVATE_KEY not configured/,
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
