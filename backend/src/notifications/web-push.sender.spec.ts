import 'reflect-metadata';
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
  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
    process.env.VAPID_PUBLIC_KEY = Buffer.alloc(65, 4).toString('base64url');
    process.env.VAPID_PRIVATE_KEY = Buffer.alloc(32, 9).toString('base64url');
    process.env.VAPID_SUBJECT = 'mailto:ops@example.com';
    delete process.env.PUSH_DISABLED;
  });

  afterEach(() => {
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
