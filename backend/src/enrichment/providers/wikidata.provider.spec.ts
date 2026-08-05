import { describe, expect, it } from 'vitest';
import { ENRICHMENT_FIELD, MATCH_METHOD, MATCH_REFUSAL } from '@waypoint/shared';
import type { EnrichmentFetcher } from '../outbound-fetch';
import {
  entity,
  FixtureFetcher,
  MEGURO_RIVER,
  search,
  SENSOJI,
  SKYTREE,
  TSUKIJI,
} from './fixtures';
import { WikidataProvider } from './wikidata.provider';

const provider = (responses: Record<string, unknown>) => {
  const fetcher = new FixtureFetcher(responses);
  return {
    provider: new WikidataProvider(fetcher as unknown as EnrichmentFetcher),
    fetcher,
  };
};

describe('WikidataProvider', () => {
  it('supplies no field value — it is the identity spine (§11.1)', async () => {
    const { provider: p } = provider({});
    // The image is Commons' to give, because the per-file license is Commons' to read.
    expect(p.provides).toEqual([]);
    expect(await p.fetch()).toEqual({});
  });

  it('matches a settled QID as an identity join, with no name search at all', async () => {
    const { provider: p, fetcher } = provider({ wbgetentities: SENSOJI.entity });
    const match = await p.match({ ...SENSOJI.place, wikidataQid: SENSOJI.qid });

    expect(match?.method).toBe(MATCH_METHOD.SETTLED_ID);
    expect(match?.confidence).toBe(1);
    expect(fetcher.countMatching('wbsearchentities')).toBe(0);
  });

  it('settles the QID, the P18 pointer, the coordinate and the sitelinks', async () => {
    const { provider: p } = provider({ wbgetentities: SENSOJI.entity });
    const match = await p.match({ ...SENSOJI.place, wikidataQid: SENSOJI.qid });

    expect(match?.settled).toMatchObject({
      wikidataQid: 'Q615183',
      commonsFilename: 'Sensoji 2023.jpg',
      lat: 35.7148,
      lng: 139.7967,
      articleTitles: { en: 'Sensō-ji' },
    });
  });

  it('reports no Hebrew article as an absence rather than a failure (§11.5)', async () => {
    const { provider: p } = provider({ wbgetentities: SENSOJI.entity });
    const match = await p.match({ ...SENSOJI.place, wikidataQid: SENSOJI.qid });
    // 18 of 27 Tokyo places are in this state; it is the normal case, not an error.
    expect(match?.settled?.articleTitles?.he).toBeUndefined();
    expect(match?.settled?.articleTitles?.en).toBe('Sensō-ji');
  });

  it('settles both article titles when a Hebrew one exists', async () => {
    const { provider: p } = provider({ wbgetentities: SKYTREE.entity });
    const match = await p.match({ ...SKYTREE.place, wikidataQid: SKYTREE.qid });
    expect(match?.settled?.articleTitles).toEqual({ en: 'Tokyo Skytree', he: 'עץ השמיים' });
  });

  it('matches by name and proximity when nothing is settled yet', async () => {
    const { provider: p } = provider({
      wbsearchentities: search([{ id: SENSOJI.qid, label: 'Sensō-ji' }]),
      wbgetentities: SENSOJI.entity,
    });
    const match = await p.match(SENSOJI.place);

    expect(match?.method).toBe(MATCH_METHOD.NAME_PROXIMITY);
    // Computed, and capped below an exact join (§12.3).
    expect(match?.confidence).toBeLessThan(1);
    expect(match?.evidence.distanceMeters).toBeLessThan(50);
  });

  it('refuses rather than guessing when the only candidate is a namesake elsewhere', async () => {
    const { provider: p } = provider({
      wbsearchentities: search([{ id: 'Q243', label: 'Eiffel Tower' }]),
      wbgetentities: entity({
        qid: 'Q243',
        labels: { en: 'Eiffel Tower' },
        instanceOf: ['Q200334'],
        lat: 48.8584,
        lng: 2.2945,
      }),
    });
    // No enrichment beats wrong enrichment (§5.5).
    expect(await p.match(SENSOJI.place)).toBeNull();
  });

  it('refuses when the name search comes back empty', async () => {
    const { provider: p } = provider({ wbsearchentities: search([]) });
    expect(await p.match({ name: 'ראמן קיוסק ללא ערך' })).toBeNull();
  });

  it('refuses the summary for a river, keeping the image (§11.2)', async () => {
    const { provider: p } = provider({ wbgetentities: MEGURO_RIVER.entity });
    const match = await p.match({ ...MEGURO_RIVER.place, wikidataQid: MEGURO_RIVER.qid });

    // The entity is right; the article describes the whole river, not the canal-side spot.
    expect(match).not.toBeNull();
    expect(match?.refusedFields?.[ENRICHMENT_FIELD.SUMMARY]).toBe(MATCH_REFUSAL.BROADER_TYPE);
    expect(match?.refusedFields?.[ENRICHMENT_FIELD.IMAGE]).toBeUndefined();
    expect(match?.settled?.commonsFilename).toBe('Meguro River.jpg');
  });

  it('refuses the summary for a dissolved entity', async () => {
    const { provider: p } = provider({ wbgetentities: TSUKIJI.entity });
    const match = await p.match({ ...TSUKIJI.place, wikidataQid: TSUKIJI.qid });
    // The item is the former wholesale market — closed and moved, a different place.
    expect(match?.refusedFields?.[ENRICHMENT_FIELD.SUMMARY]).toBe(MATCH_REFUSAL.BROADER_TYPE);
  });

  it('records the type claims the granularity check read, as evidence', async () => {
    const { provider: p } = provider({ wbgetentities: MEGURO_RIVER.entity });
    const match = await p.match({ ...MEGURO_RIVER.place, wikidataQid: MEGURO_RIVER.qid });
    expect(match?.evidence.instanceOf).toEqual(['Q4022']);
    expect(match?.evidence.label).toBe('Meguro River');
  });

  it('survives an item with sitelinks and no P18 at all (§12.5)', async () => {
    // teamLab Planets: both articles, no image claim. A Wikidata item can carry sitelinks
    // and no image — the mirror of an image with no article.
    const { provider: p } = provider({
      wbgetentities: entity({
        qid: 'Q97613610',
        labels: { en: 'teamLab Planets TOKYO' },
        instanceOf: ['Q33506'],
        sitelinks: { enwiki: 'teamLab Planets', hewiki: 'teamLab Planets' },
      }),
    });
    const match = await p.match({ name: 'teamLab Planets TOKYO', wikidataQid: 'Q97613610' });
    expect(match).not.toBeNull();
    expect(match?.settled?.commonsFilename).toBeUndefined();
  });

  it('asks for only the two sitelinks it reads', async () => {
    const { provider: p, fetcher } = provider({ wbgetentities: SENSOJI.entity });
    await p.match({ ...SENSOJI.place, wikidataQid: SENSOJI.qid });
    // An item like Tokyo has hundreds of sitelinks and we need two.
    expect(fetcher.requested[0]).toContain('sitefilter=hewiki%7Cenwiki');
  });
});
