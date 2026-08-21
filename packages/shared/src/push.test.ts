import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND, parsePushPayload, PUSH_PAYLOAD_MAX_BYTES } from './push';

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
