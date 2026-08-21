import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND, parsePushPayload, PUSH_PAYLOAD_MAX_BYTES } from './push';
import { PUSH_KEY_BYTES } from './constants';
import { createPushSubscriptionSchema } from './schemas';

const valid = {
  kind: NOTIFICATION_KIND.TEST,
  title: 'משימה להיום',
  body: 'צילום דרכונים · עד 18:00',
  url: '/trips/abc',
};

describe('parsePushPayload', () => {
  it('reads a well-formed payload', () => {
    expect(parsePushPayload(valid)).toEqual(valid);
  });

  it('allows an empty body — a title alone is a legitimate notification', () => {
    expect(parsePushPayload({ ...valid, body: '' })?.body).toBe('');
  });

  it('drops fields it was not asked for, so a sender cannot smuggle one through', () => {
    const parsed = parsePushPayload({ ...valid, tripId: 'x', secret: 'y' });
    expect(parsed).toEqual(valid);
  });

  // The whole reason this function returns `null` instead of throwing: the caller is a
  // service worker that must still show something (ADR-0197 §8).
  it.each([
    ['not an object', 'nope'],
    ['null', null],
    ['undefined', undefined],
    ['no kind', { ...valid, kind: undefined }],
    ['empty kind', { ...valid, kind: '' }],
    ['no title', { ...valid, title: undefined }],
    ['empty title', { ...valid, title: '' }],
    ['a non-string body', { ...valid, body: 42 }],
    ['no url', { ...valid, url: undefined }],
  ])('answers null for %s, and does not throw', (_label, input) => {
    expect(() => parsePushPayload(input)).not.toThrow();
    expect(parsePushPayload(input)).toBeNull();
  });

  // The url is the one field a payload aims, so it is the one with a rule rather than a
  // shape. A notification must only ever be able to open a screen of ours.
  it.each([
    ['another origin', 'https://evil.example/steal'],
    ['a protocol-relative url', '//evil.example/steal'],
    ['a relative path', 'trips/abc'],
    ['a javascript: url', 'javascript:alert(1)'],
    ['a data: url', 'data:text/html,<script>x</script>'],
  ])('refuses %s as a tap target', (_label, url) => {
    expect(parsePushPayload({ ...valid, url })).toBeNull();
  });

  it('keeps the payload ceiling well clear of what a real notification needs', () => {
    // Hebrew is two bytes a character, which is exactly why the sender measures bytes
    // rather than string length — assert the realistic case has room to spare.
    expect(Buffer.byteLength(JSON.stringify(valid), 'utf8')).toBeLessThan(
      PUSH_PAYLOAD_MAX_BYTES / 4,
    );
  });
});

describe('createPushSubscriptionSchema — the device’s own keys', () => {
  /** base64url of `bytes` bytes, which is what a browser hands `getKey` back as. */
  const key = (bytes: number) =>
    Buffer.alloc(bytes, 7)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const subscription = (over: Record<string, unknown> = {}) => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: key(PUSH_KEY_BYTES.p256dh),
    auth: key(PUSH_KEY_BYTES.auth),
    ...over,
  });

  it('accepts what a real browser produces', () => {
    expect(createPushSubscriptionSchema.safeParse(subscription()).success).toBe(true);
  });

  it('refuses a p256dh that is not 65 bytes, at the subscribe rather than hours later', () => {
    // The failure this closes: `web-push` checks both lengths and throws BEFORE any
    // request, so a wrong-length key is a send that fails with no status and nothing to
    // point at — never a verdict from the push service.
    for (const bytes of [32, 64, 66, 16]) {
      expect(
        createPushSubscriptionSchema.safeParse(subscription({ p256dh: key(bytes) })).success,
      ).toBe(false);
    }
  });

  it('refuses an auth that is not 16 bytes', () => {
    for (const bytes of [8, 15, 17, 32]) {
      expect(
        createPushSubscriptionSchema.safeParse(subscription({ auth: key(bytes) })).success,
      ).toBe(false);
    }
  });

  it('refuses a key that is the right length but not base64url at all', () => {
    expect(
      createPushSubscriptionSchema.safeParse(subscription({ auth: '!'.repeat(22) })).success,
    ).toBe(false);
  });

  it('accepts the padded variant, since not every client strips it', () => {
    const padded = Buffer.alloc(PUSH_KEY_BYTES.auth, 7).toString('base64url') + '==';
    expect(createPushSubscriptionSchema.safeParse(subscription({ auth: padded })).success).toBe(
      true,
    );
  });

  it('names WHICH key is wrong, so the client error is actionable', () => {
    const result = createPushSubscriptionSchema.safeParse(subscription({ p256dh: key(32) }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('p256dh');
      expect(JSON.stringify(result.error.issues)).toContain('65');
    }
  });
});
