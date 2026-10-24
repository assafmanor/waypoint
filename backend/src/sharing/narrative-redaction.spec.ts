import { describe, expect, it } from 'vitest';
import { redactedOrUndefined, redactNarrativeText } from './narrative-redaction';

describe('redactNarrativeText', () => {
  it.each([
    ['write assaf@example.com', 'assaf@example.com'],
    ['call +972-50-123-4567', '972-50-123-4567'],
    ['call 050-123-4567 later', '050-123-4567'],
    ['open https://secret.example/x', 'https://secret.example/x'],
    ['see www.travelive.app/s/abc', 'www.travelive.app/s/abc'],
    ['booking travelive.app/private', 'travelive.app/private'],
    ['confirmation ABCD-123456', 'ABCD-123456'],
    ['דירה 4B/7731 בקומה', '4B/7731'],
  ])('removes the identifier from %s', (text, secret) => {
    expect(redactNarrativeText(text)).not.toContain(secret);
  });

  it('keeps the itinerary text around what it removed, with no dangling separator', () => {
    expect(redactNarrativeText('נחיתה בקפלוויק · אישור KEF-4821')).toBe('נחיתה בקפלוויק · אישור');
  });

  it('drops a segment whose entire content was the secret', () => {
    expect(redactNarrativeText('נחיתה בקפלוויק · KEF-4821 · ארוחת ערב')).toBe(
      'נחיתה בקפלוויק · ארוחת ערב',
    );
  });

  // The line between a code and a place name is the whole risk of a pattern filter: strip
  // too eagerly and the shared page loses the itinerary it exists to show.
  it.each(['כביש 1', 'Route 35', 'מפל גולפוס', 'Laugavegur 22', 'טרמינל 3', 'Reykjavík'])(
    'leaves ordinary itinerary text alone: %s',
    (text) => {
      expect(redactNarrativeText(text)).toBe(text);
    },
  );

  it('removes rather than masks, so nothing advertises that a secret was here', () => {
    expect(redactNarrativeText('אישור ABCD-123456')).not.toMatch(/redacted|\*{2,}|xxx/i);
  });

  it('drops a string that was only a secret', () => {
    expect(redactedOrUndefined('ABCD-123456')).toBeUndefined();
    expect(redactedOrUndefined('')).toBeUndefined();
    expect(redactedOrUndefined(null)).toBeUndefined();
    expect(redactedOrUndefined('גייזר וסטרוקור')).toBe('גייזר וסטרוקור');
  });
});
