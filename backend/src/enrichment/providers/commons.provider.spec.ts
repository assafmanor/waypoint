import { describe, expect, it } from 'vitest';
import {
  ENRICHMENT_ABSENCE_REASON,
  ENRICHMENT_FIELD,
  ENRICHMENT_IMAGE_NOMINAL_WIDTH_PX,
  ENRICHMENT_SOURCE,
  MATCH_METHOD,
} from '@waypoint/shared';
import { valueRefusal } from '../enrichment.policy';
import type { ProviderMatch } from '../enrichment.provider';
import type { EnrichmentFetcher } from '../outbound-fetch';
import { COMMONS_LICENSES, FixtureFetcher, imageInfo } from './fixtures';
import { CommonsProvider } from './commons.provider';

const provider = (responses: Record<string, unknown>) => {
  const fetcher = new FixtureFetcher(responses);
  return { provider: new CommonsProvider(fetcher as unknown as EnrichmentFetcher), fetcher };
};

const SENSOJI_FILE = 'Sensoji 2023.jpg';

const matchFor = (filename: string): ProviderMatch => ({
  ref: filename,
  method: MATCH_METHOD.SETTLED_ID,
  confidence: 1,
  evidence: {},
  settled: { commonsFilename: filename },
});

/** What the Wikidata pass hands over: the `P18` pointer. */
const settled = (filename: string, identityConfidence?: number) => ({
  name: 'Sensō-ji',
  wikidataQid: 'Q615183',
  commonsFilename: filename,
  identityConfidence,
});

const fetchImage = (p: CommonsProvider, filename = SENSOJI_FILE) =>
  p.fetch(matchFor(filename), [ENRICHMENT_FIELD.IMAGE]);

describe('CommonsProvider', () => {
  it('provides the image, which Wikidata deliberately does not', () => {
    const { provider: p } = provider({});
    expect(p.provides).toEqual([ENRICHMENT_FIELD.IMAGE]);
  });

  it('matches only on the P18 pointer, with no fuzzy matching of its own', async () => {
    const { provider: p, fetcher } = provider({});
    const match = await p.match(settled(SENSOJI_FILE));

    expect(match?.method).toBe(MATCH_METHOD.SETTLED_ID);
    expect(match?.ref).toBe(SENSOJI_FILE);
    // Reaching the file is exact — there is no second chance here to pick the wrong one.
    expect(fetcher.requested).toEqual([]);
  });

  it('has nothing to match when Wikidata settled no P18 (§12.5)', async () => {
    const { provider: p } = provider({});
    // teamLab Planets has both articles and no image claim — the normal absent case.
    expect(await p.match({ name: 'teamLab Planets TOKYO', wikidataQid: 'Q97613610' })).toBeNull();
  });

  it('inherits the identity confidence rather than laundering a fuzzy match to 1', async () => {
    const { provider: p } = provider({});
    const match = await p.match(settled(SENSOJI_FILE, 0.72));
    // A photograph reached through a name-and-proximity Wikidata match is only as trustworthy
    // as that match — this is the "confidently wrong" failure §Context 3 is about.
    expect(match?.confidence).toBe(0.72);
  });

  it('asks for a nominal width and reports the BUCKET it got back (§12.1)', async () => {
    const { provider: p, fetcher } = provider({
      'commons.wikimedia.org': imageInfo({ filename: SENSOJI_FILE, ...COMMONS_LICENSES.cc0 }),
    });
    const values = await fetchImage(p);

    expect(fetcher.requested[0]).toContain(`iiurlwidth=${ENRICHMENT_IMAGE_NOMINAL_WIDTH_PX}`);
    // MediaWiki rounds up to its own buckets, so 800 asked yields 840 — and nothing may
    // assume otherwise.
    expect(values.image?.binary?.width).toBe(840);
    expect(values.image?.binary?.width).not.toBe(ENRICHMENT_IMAGE_NOMINAL_WIDTH_PX);
  });

  it('points at the thumbnail bucket, never the 26 MB original (§11.4)', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({ filename: SENSOJI_FILE, ...COMMONS_LICENSES.cc0 }),
    });
    const values = await fetchImage(p);
    expect(values.image?.binary?.url).toContain('/thumb/');
    expect(values.image?.binary?.url).toContain('840px-');
  });

  it('reports the bucket dimensions, which carry the aspect a layout needs', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({
        filename: 'Tokyo Skytree 2014 Ⅲ.jpg',
        ...COMMONS_LICENSES.ccBySa3,
        // The measured 0.653 portrait — Tokyo Skytree, the difficult crop case.
        thumbWidth: 840,
        thumbHeight: 1286,
        width: 1632,
        height: 2500,
      }),
    });
    const values = await fetchImage(p, 'Tokyo Skytree 2014 Ⅲ.jpg');
    const binary = values.image!.binary!;
    // Same aspect as the original 1632×2500, which is what §11.4's bounded container needs.
    expect(binary.width / binary.height).toBeCloseTo(1632 / 2500, 2);
  });

  it('stores the license STRING verbatim, including a regional port (§12.2)', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({
        filename: 'Toyosu.jpg',
        ...COMMONS_LICENSES.ccBySa3De,
      }),
    });
    const values = await fetchImage(p, 'Toyosu.jpg');
    // Nine distinct strings across 32 files is why this is never a normalized enum.
    expect(values.image?.license).toBe('CC BY-SA 3.0 de');
  });

  it('strips the HTML that extmetadata really returns', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({ filename: SENSOJI_FILE, ...COMMONS_LICENSES.ccBySa3 }),
    });
    const values = await fetchImage(p);
    // `Artist` arrives as an `<a>` to a user page; a credit line must get text.
    expect(values.image?.attribution).toBe('Kakidai');
    expect(values.image?.attribution).not.toContain('<');
  });

  it('falls back to UsageTerms when the short name is missing', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({
        filename: 'X.jpg',
        license: '',
        usageTerms: 'Creative Commons Attribution-Share Alike 4.0',
        artist: 'Someone',
      }),
    });
    const values = await fetchImage(p, 'X.jpg');
    expect(values.image?.license).toContain('Attribution-Share Alike 4.0');
  });

  it('records that a CC0 file owes no credit, per file not per source (§12.2)', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({ filename: SENSOJI_FILE, ...COMMONS_LICENSES.cc0 }),
    });
    const values = await fetchImage(p);
    expect(values.image?.attributionRequired).toBe(false);
  });

  it('records that a CC BY-SA file does owe credit', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({ filename: SENSOJI_FILE, ...COMMONS_LICENSES.ccBySa4 }),
    });
    const values = await fetchImage(p);
    expect(values.image?.attributionRequired).toBe(true);
  });

  it('lets the storability guard refuse a GFDL-only file, so it falls through (§12.2)', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({
        filename: 'Western Wall.jpg',
        ...COMMONS_LICENSES.gfdlOnly,
      }),
    });
    const values = await fetchImage(p, 'Western Wall.jpg');

    // The provider still returns it — one place decides what may be kept, and the refusal
    // reason is what makes the resolver fall through rather than silently find nothing.
    expect(values.image?.license).toBe('GFDL 1.2');
    expect(valueRefusal(ENRICHMENT_FIELD.IMAGE, ENRICHMENT_SOURCE.COMMONS, values.image!)).toBe(
      ENRICHMENT_ABSENCE_REASON.UNSTORABLE,
    );
  });

  it('accepts every other license the spike measured', async () => {
    for (const [name, meta] of Object.entries(COMMONS_LICENSES)) {
      if (name === 'gfdlOnly') continue;
      const { provider: p } = provider({
        'commons.wikimedia.org': imageInfo({ filename: `${name}.jpg`, ...meta }),
      });
      const values = await fetchImage(p, `${name}.jpg`);
      expect(
        valueRefusal(ENRICHMENT_FIELD.IMAGE, ENRICHMENT_SOURCE.COMMONS, values.image!),
        name,
      ).toBeNull();
    }
  });

  it('points the credit at the file page', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({ filename: SENSOJI_FILE, ...COMMONS_LICENSES.cc0 }),
    });
    const values = await fetchImage(p);
    expect(values.image?.value).toContain('commons.wikimedia.org/wiki/File:');
  });

  it('namespaces a bare P18 filename as a File: title', async () => {
    const { provider: p, fetcher } = provider({
      'commons.wikimedia.org': imageInfo({ filename: SENSOJI_FILE, ...COMMONS_LICENSES.cc0 }),
    });
    await fetchImage(p);
    expect(fetcher.requested[0]).toContain('titles=File%3A');
  });

  it('asks for exactly the imageinfo properties the plan names', async () => {
    const { provider: p, fetcher } = provider({
      'commons.wikimedia.org': imageInfo({ filename: SENSOJI_FILE, ...COMMONS_LICENSES.cc0 }),
    });
    await fetchImage(p);
    expect(fetcher.requested[0]).toContain('iiprop=url%7Csize%7Cmime%7Cextmetadata');
  });

  it('returns nothing for a file Commons does not have', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({
        filename: 'Gone.jpg',
        license: 'CC0',
        missing: true,
      }),
    });
    // A missing file comes back as a page with `missing: ''`, not an error.
    expect(await fetchImage(p, 'Gone.jpg')).toEqual({});
  });

  it('returns nothing when Commons generated no thumbnail', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({
        filename: 'Odd.tif',
        ...COMMONS_LICENSES.cc0,
        noThumb: true,
      }),
    });
    // We never fall back to the original — that is the 26 MB download §12.1 removed.
    expect(await fetchImage(p, 'Odd.tif')).toEqual({});
  });

  it('fetches nothing when the image was not asked for', async () => {
    const { provider: p, fetcher } = provider({
      'commons.wikimedia.org': imageInfo({ filename: SENSOJI_FILE, ...COMMONS_LICENSES.cc0 }),
    });
    expect(await p.fetch(matchFor(SENSOJI_FILE), [ENRICHMENT_FIELD.SUMMARY])).toEqual({});
    expect(fetcher.requested).toEqual([]);
  });

  it('never stores anything itself — a provider stays pure (§5.3)', async () => {
    const { provider: p } = provider({
      'commons.wikimedia.org': imageInfo({ filename: SENSOJI_FILE, ...COMMONS_LICENSES.cc0 }),
    });
    const values = await fetchImage(p);
    // It hands over a pointer plus the facts; materializing bytes is the orchestrator's job.
    expect(values.image?.binary?.url).toBeDefined();
    expect(values.image).not.toHaveProperty('blobKey');
  });
});
