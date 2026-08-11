import { describe, expect, it } from 'vitest';
import type { EnrichmentFetcher } from './outbound-fetch';
import { nearbyWikidataItems } from './geosearch';
import { FixtureFetcher, geosearch } from './providers/fixtures';

const NEZU = { lat: 35.6656, lng: 139.7167 };
const fetcher = (responses: Record<string, unknown>) => new FixtureFetcher(responses);
const ask = (f: FixtureFetcher) => nearbyWikidataItems(f as unknown as EnrichmentFetcher, NEZU);

describe('nearbyWikidataItems (ADR-0166 §15)', () => {
  it('asks for what is at the point, bounded by a radius and a count', async () => {
    const f = fetcher({
      'en.wikipedia.org': geosearch([
        { qid: 'Q1054134', title: 'Nezu Museum', lat: 35.6656, lng: 139.7167 },
      ]),
    });
    const found = await ask(f);

    expect(found).toEqual([
      { qid: 'Q1054134', title: 'Nezu Museum', lang: 'en', distanceMeters: 0 },
    ]);
    const url = f.requested[0];
    expect(url).toContain('generator=geosearch');
    expect(url).toContain('ggscoord=35.6656%7C139.7167');
    expect(url).toContain('ggsradius=3000');
    // Twenty: at five the subject itself fell outside the set in central London and the
    // Underground station under the square won by default.
    expect(url).toContain('ggslimit=20');
    // The QID and the article's own coordinate in the SAME call — as a list generator this
    // would be two calls on a route that is already a fallback.
    expect(url).toContain('ppprop=wikibase_item');
    expect(url).toContain('prop=pageprops%7Ccoordinates');
  });

  // The API returns a page map, not an ordered array, so the ordering is ours to impose — and
  // the caller depends on it: the nearest candidate is the one most likely to be the subject.
  it('returns them nearest first', async () => {
    const f = fetcher({
      'en.wikipedia.org': geosearch([
        { qid: 'Q-far', title: 'Aoyama Cemetery', lat: 35.6686, lng: 139.7167 },
        { qid: 'Q-near', title: 'Nezu Museum', lat: 35.6656, lng: 139.7167 },
      ]),
    });
    expect((await ask(f)).map((item) => item.qid)).toEqual(['Q-near', 'Q-far']);
  });

  // English first for recall — it has the most geotagged articles, and the QID it carries is
  // the same one `hewiki` would have given.
  it('falls back to Hebrew only when English has nothing there', async () => {
    const f = fetcher({
      'en.wikipedia.org': geosearch([]),
      'he.wikipedia.org': geosearch([
        { qid: 'Q1054134', title: 'מוזיאון נזו', lat: 35.6656, lng: 139.7167 },
      ]),
    });
    const found = await ask(f);
    expect(found[0]?.lang).toBe('he');
    expect(f.countMatching('en.wikipedia.org')).toBe(1);
  });

  it('does not ask Hebrew when English already answered', async () => {
    const f = fetcher({
      'en.wikipedia.org': geosearch([
        { qid: 'Q1054134', title: 'Nezu Museum', lat: 35.6656, lng: 139.7167 },
      ]),
    });
    await ask(f);
    expect(f.countMatching('he.wikipedia.org')).toBe(0);
  });

  it('drops a page with no wikibase item — there is nothing to join on', async () => {
    const f = fetcher({
      'en.wikipedia.org': geosearch([
        {
          qid: 'unused',
          title: 'List of museums in Tokyo',
          lat: 35.6656,
          lng: 139.7167,
          noQid: true,
        },
      ]),
      'he.wikipedia.org': geosearch([]),
      'commons.wikimedia.org': geosearch([]),
    });
    expect(await ask(f)).toEqual([]);
  });

  it('is empty rather than throwing when nothing is anywhere near', async () => {
    const f = fetcher({
      'en.wikipedia.org': geosearch([]),
      'he.wikipedia.org': geosearch([]),
      'commons.wikimedia.org': geosearch([]),
    });
    expect(await ask(f)).toEqual([]);
  });

  // **A place can have no article in any language we ask for** (field report #41): Brúarfoss is
  // on the Golden Circle, has an Icelandic article and nothing in `en` or `he`, so a
  // Wikipedia-shaped geosearch returns literally nothing at its pin. Commons' category tree is
  // language-neutral and carries the same `wikibase_item` join.
  it('reaches Commons when no Wikipedia we ask has anything at the point', async () => {
    const f = fetcher({
      'en.wikipedia.org': geosearch([]),
      'he.wikipedia.org': geosearch([]),
      'commons.wikimedia.org': geosearch([
        { qid: 'Q2557346', title: 'Category:Brúarfoss', lat: 35.6656, lng: 139.7167 },
      ]),
    });
    const found = await ask(f);
    expect(found.map((item) => item.qid)).toEqual(['Q2557346']);
    // Categories, not files: a photograph's coordinate is where the photographer stood.
    expect(f.requested.at(-1)).toContain('ggsnamespace=14');
  });

  it('does not ask Commons when a Wikipedia already answered', async () => {
    const f = fetcher({
      'en.wikipedia.org': geosearch([
        { qid: 'Q1054134', title: 'Nezu Museum', lat: 35.6656, lng: 139.7167 },
      ]),
    });
    await ask(f);
    expect(f.countMatching('commons.wikimedia.org')).toBe(0);
  });
});
