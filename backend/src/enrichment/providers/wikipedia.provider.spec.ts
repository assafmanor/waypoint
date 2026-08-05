import { describe, expect, it } from 'vitest';
import { ENRICHMENT_FIELD, MATCH_METHOD } from '@waypoint/shared';
import type { EnrichmentFetcher } from '../outbound-fetch';
import { FixtureFetcher, restSummary, SENSOJI, SKYTREE } from './fixtures';
import { WikipediaProvider } from './wikipedia.provider';

const provider = (responses: Record<string, unknown>) => {
  const fetcher = new FixtureFetcher(responses);
  return { provider: new WikipediaProvider(fetcher as unknown as EnrichmentFetcher), fetcher };
};

/** What the Wikidata pass hands over. */
const settledIdentity = (qid: string, articleTitles: Record<string, string>) => ({
  name: 'irrelevant to this provider',
  wikidataQid: qid,
  articleTitles,
});

const matchFor = (qid: string, articleTitles: Record<string, string>) => ({
  ref: qid,
  method: MATCH_METHOD.SETTLED_ID,
  confidence: 1,
  evidence: {},
  settled: { articleTitles },
});

describe('WikipediaProvider', () => {
  it('provides the summary and nothing else', () => {
    const { provider: p } = provider({});
    expect(p.provides).toEqual([ENRICHMENT_FIELD.SUMMARY]);
  });

  it('inherits the identity join instead of running its own name search', async () => {
    const { provider: p, fetcher } = provider({});
    const match = await p.match(settledIdentity(SENSOJI.qid, { en: 'Sensō-ji' }));

    expect(match?.method).toBe(MATCH_METHOD.SETTLED_ID);
    expect(match?.confidence).toBe(1);
    // A second fuzzy search here could disagree with Wikidata about the same place.
    expect(fetcher.requested).toEqual([]);
  });

  it('has nothing to match on when Wikidata settled no article', async () => {
    const { provider: p } = provider({});
    expect(await p.match(settledIdentity(SENSOJI.qid, {}))).toBeNull();
    expect(await p.match({ name: 'Some café', articleTitles: { en: 'X' } })).toBeNull();
  });

  it('prefers the Hebrew article when one exists', async () => {
    const { provider: p, fetcher } = provider({
      'he.wikipedia.org': SKYTREE.summaryHe,
      'en.wikipedia.org': SKYTREE.summaryEn,
    });
    const values = await p.fetch(matchFor(SKYTREE.qid, { he: 'עץ השמיים', en: 'Tokyo Skytree' }), [
      ENRICHMENT_FIELD.SUMMARY,
    ]);

    expect(values.summary?.lang).toBe('he');
    expect(values.summary?.value).toContain('מגדל תקשורת');
    // `he` answered, so `en` was never asked.
    expect(fetcher.countMatching('en.wikipedia.org')).toBe(0);
  });

  it('falls back to English, marking the value with the language that says so (§11.5)', async () => {
    const { provider: p } = provider({ 'en.wikipedia.org': SENSOJI.summaryEn });
    const values = await p.fetch(matchFor(SENSOJI.qid, { en: 'Sensō-ji' }), [
      ENRICHMENT_FIELD.SUMMARY,
    ]);

    // This is the majority case for a place that has a summary at all, which is what
    // ADR-0167 §5's `באנגלית` chip exists for — and it can only exist because `lang` is here.
    expect(values.summary?.lang).toBe('en');
    expect(values.summary?.value).toContain('Buddhist temple');
  });

  it('carries CC BY-SA attribution pointing at the article', async () => {
    const { provider: p } = provider({ 'en.wikipedia.org': SENSOJI.summaryEn });
    const values = await p.fetch(matchFor(SENSOJI.qid, { en: 'Sensō-ji' }), [
      ENRICHMENT_FIELD.SUMMARY,
    ]);

    expect(values.summary?.license).toBe('CC BY-SA 4.0');
    expect(values.summary?.attribution).toContain('en.wikipedia.org/wiki/');
  });

  it('refuses a disambiguation page', async () => {
    const { provider: p } = provider({
      'en.wikipedia.org': restSummary({
        lang: 'en',
        title: 'Skytree',
        extract: 'Skytree may refer to:',
        type: 'disambiguation',
      }),
    });
    // A list of things called this is the summary-shaped version of the wrong granularity.
    const values = await p.fetch(matchFor('Q1', { en: 'Skytree' }), [ENRICHMENT_FIELD.SUMMARY]);
    expect(values.summary).toBeUndefined();
  });

  it('refuses an article whose extract is empty', async () => {
    const { provider: p } = provider({
      'en.wikipedia.org': restSummary({ lang: 'en', title: 'X', extract: '   ' }),
    });
    expect(await p.fetch(matchFor('Q1', { en: 'X' }), [ENRICHMENT_FIELD.SUMMARY])).toEqual({});
  });

  it('trusts the response lang over the edition asked for', async () => {
    const { provider: p } = provider({
      'he.wikipedia.org': restSummary({ lang: 'en', title: 'Foo', extract: 'An English extract.' }),
    });
    // An article can be served from a redirect in another edition; the value must say what
    // it actually is, not what we hoped for.
    const values = await p.fetch(matchFor('Q1', { he: 'Foo' }), [ENRICHMENT_FIELD.SUMMARY]);
    expect(values.summary?.lang).toBe('en');
  });

  it('fetches nothing when the summary was not asked for', async () => {
    const { provider: p, fetcher } = provider({ 'en.wikipedia.org': SENSOJI.summaryEn });
    expect(
      await p.fetch(matchFor(SENSOJI.qid, { en: 'Sensō-ji' }), [ENRICHMENT_FIELD.IMAGE]),
    ).toEqual({});
    expect(fetcher.requested).toEqual([]);
  });

  it('never reads the REST summary image (§11.1)', async () => {
    // The REST thumbnail returned a non-free logo for the Eiffel Tower and a map for Canal
    // Saint-Martin — the amendment that would otherwise have caused a licensing breach.
    const { provider: p } = provider({
      'en.wikipedia.org': {
        ...SENSOJI.summaryEn,
        thumbnail: { source: 'https://upload.wikimedia.org/logo.png' },
        originalimage: { source: 'https://upload.wikimedia.org/logo.png' },
      },
    });
    const values = await p.fetch(matchFor(SENSOJI.qid, { en: 'Sensō-ji' }), [
      ENRICHMENT_FIELD.SUMMARY,
      ENRICHMENT_FIELD.IMAGE,
    ]);
    expect(values.image).toBeUndefined();
  });
});
