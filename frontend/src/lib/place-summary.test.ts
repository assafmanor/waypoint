import { describe, expect, it } from 'vitest';
import type { DeliveredEnrichmentFields, EnrichedTextValue } from '@waypoint/shared';
import { placeSummary } from './place-summary';
import { t } from '../i18n/he';

const variant = (lang: string, value: string): EnrichedTextValue => ({
  value,
  lang,
  source: 'wikipedia',
  license: 'CC BY-SA 4.0',
  attribution: 'Wikipedia',
  fetchedAt: '2026-08-05T10:00:00.000Z',
  confidence: 1,
  method: 'settled_id',
  ref: 'Q615183',
});

const fields = (summary: DeliveredEnrichmentFields['summary']): DeliveredEnrichmentFields => ({
  summary,
});

describe('placeSummary (ADR-0167 §5)', () => {
  it('prefers Hebrew, and marks nothing when it has it', () => {
    const s = placeSummary(
      fields({ he: variant('he', 'מקדש בטוקיו.'), en: variant('en', 'A temple.') }),
    );
    expect(s?.text).toBe('מקדש בטוקיו.');
    expect(s?.lang).toBe('he');
    expect(s?.marker).toBeUndefined();
  });

  // The case the marker exists for, and it is the majority: 9 of 27 Tokyo places have a
  // Hebrew article against 15 of 27 in English (ADR-0166 §11.5).
  it('falls back to English and marks it', () => {
    const s = placeSummary(fields({ en: variant('en', 'A temple in Asakusa.') }));
    expect(s?.text).toBe('A temple in Asakusa.');
    expect(s?.lang).toBe('en');
    expect(s?.marker).toBe(t.map.know.langMarker.en);
  });

  // A language we have no Hebrew word for gets NO marker rather than a wrong one. Cannot
  // arrive from today's providers; the point is that it degrades quietly if it ever does.
  it('renders a third language unmarked rather than inventing a word for it', () => {
    const s = placeSummary(fields({ ja: variant('ja', '浅草の寺。') }));
    expect(s?.text).toBe('浅草の寺。');
    expect(s?.lang).toBe('ja');
    expect(s?.marker).toBeUndefined();
  });

  it('is absent when we know nothing, which is the common case', () => {
    expect(placeSummary(undefined)).toBeUndefined();
    expect(placeSummary({})).toBeUndefined();
    // A place we looked up and found only a photo for — a real, measured state.
    expect(placeSummary(fields(undefined))).toBeUndefined();
  });
});
