import { describe, expect, it } from 'vitest';
import { ENRICHMENT_FIELD, MATCH_METHOD, MATCH_REFUSAL } from '@waypoint/shared';
import type { EnrichmentFetcher } from '../outbound-fetch';
import {
  BEN_GURION,
  entity,
  FixtureFetcher,
  geosearch,
  KEFLAVIK,
  LONDON_CITY,
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
  it('supplies the airport pair and nothing else — everything else is identity', async () => {
    const { provider: p } = provider({});
    // The image is Commons' to give, because the per-file license is Commons' to read, and
    // the summary is Wikipedia's. `P238`/`P931` are this item's own (§18).
    expect(p.provides).toEqual([ENRICHMENT_FIELD.IATA, ENRICHMENT_FIELD.SERVED_CITY]);
    // And it stays an identity provider now that `provides` is non-empty — which the registry
    // used to infer from the empty list.
    expect(p.settlesIdentity).toBe(true);
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
      // Nothing at the coordinates either, so the name refusal is the whole answer (§15's
      // route runs only when the name found nothing).
      'generator=geosearch': geosearch([]),
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

  // **THE FIRST LIVE RUN'S BUG** (owner, 2026-08-05: matched `Stokksnes`, did not match
  // `מגדל אייפל`). The app asks Google for `languageCode=he`, so a famous place is saved under
  // its Hebrew name — and the search request was sending `uselang=en`, which is the language of
  // the labels in the RESPONSE, not a search fallback. So every hit came back named in English
  // and the saved Hebrew name was scored against `Eiffel Tower`: similarity ~0, refused, and the
  // entity never read. The search had found the right item; the scoring threw it away.
  //
  // The place is a real one from the report, with the Eiffel Tower's real QID and coordinate.
  const EIFFEL = { name: 'מגדל אייפל', lat: 48.8584, lng: 2.2945 };
  const eiffelEntity = entity({
    qid: 'Q243',
    labels: { he: 'מגדל אייפל', en: 'Eiffel Tower' },
    instanceOf: ['Q1440300'],
    image: 'Tour Eiffel Wikimedia Commons.jpg',
    lat: 48.8584,
    lng: 2.2945,
    sitelinks: { hewiki: 'מגדל אייפל', enwiki: 'Eiffel Tower' },
  });

  it('matches a Hebrew saved name against a hit whose label came back in English', async () => {
    const { provider: p } = provider({
      // What the real API returns: the label in the response language, and `match` carrying the
      // string that actually matched — here the Hebrew label the query hit.
      wbsearchentities: search([
        { id: 'Q243', label: 'Eiffel Tower', match: { language: 'he', text: 'מגדל אייפל' } },
      ]),
      wbgetentities: eiffelEntity,
    });
    const match = await p.match(EIFFEL);

    expect(match?.ref).toBe('Q243');
    expect(match?.method).toBe(MATCH_METHOD.NAME_PROXIMITY);
    expect(match?.evidence.distanceMeters).toBeLessThan(50);
    expect(match?.settled?.articleTitles).toEqual({ he: 'מגדל אייפל', en: 'Eiffel Tower' });
  });

  it('matches when the query hit an ALIAS rather than the label', async () => {
    const { provider: p } = provider({
      wbsearchentities: search([{ id: 'Q243', label: 'Eiffel Tower', aliases: ['מגדל אייפל'] }]),
      wbgetentities: eiffelEntity,
    });
    expect((await p.match(EIFFEL))?.ref).toBe('Q243');
  });

  // The entity read re-scores with the coordinate, and it must find the Hebrew label there too
  // — otherwise the fix only moves the refusal one call later.
  it('re-scores against the entity’s own Hebrew label, not just its English one', async () => {
    const { provider: p } = provider({
      // No `match` and no alias on the hit: the pre-filter has only the English label to go on,
      // so this is the path where the search response carries nothing in the query's script.
      wbsearchentities: search([{ id: 'Q243', label: 'מגדל אייפל' }]),
      wbgetentities: eiffelEntity,
    });
    expect((await p.match(EIFFEL))?.ref).toBe('Q243');
  });

  // **The request itself**: `uselang=en` is what made every label English, so its absence is
  // part of the fix rather than a detail of it.
  it('does not ask for English labels in the search response', async () => {
    const { provider: p, fetcher } = provider({
      wbsearchentities: search([{ id: 'Q243', label: 'מגדל אייפל' }]),
      wbgetentities: eiffelEntity,
    });
    await p.match(EIFFEL);
    const url = fetcher.requested.find((u) => u.includes('wbsearchentities'))!;
    expect(url).not.toContain('uselang');
    expect(url).toContain('language=he');
  });

  // And the refusal still holds where it should: scoring against more names is not a licence to
  // accept a namesake in the wrong city (§5.5). The distance veto sees whichever name won.
  it('still refuses a namesake 9,000km away, however many names it offers', async () => {
    const { provider: p } = provider({
      wbsearchentities: search([
        { id: 'Q243', label: 'Eiffel Tower', match: { language: 'he', text: 'מגדל אייפל' } },
      ]),
      'generator=geosearch': geosearch([]),
      wbgetentities: eiffelEntity,
    });
    // The saved place is in Tokyo; the item is in Paris.
    expect(await p.match({ name: 'מגדל אייפל', lat: 35.7148, lng: 139.7967 })).toBeNull();
  });

  it('refuses when the name search comes back empty', async () => {
    const { provider: p } = provider({ wbsearchentities: search([]) });
    expect(await p.match({ name: 'ראמן קיוסק ללא ערך' })).toBeNull();
  });

  // **AND THEN IT MATCHED THE UNDERGROUND STATION UNDER IT** (owner, 2026-08-05, after the
  // coordinate route shipped: _"now it matches somewhere that's near geographically but not the
  // place itself"_). Three flaws in one report, and the real one is arithmetic: proximity is 35%
  // of the blend, and for a facility AT the place that 35% is free and separates nothing — the
  // station's own article coordinate sits exactly on the square's. `Piccadilly Circus` against
  // `Piccadilly Circus tube station` scored 0.707 on the name and **0.810 blended**, over the
  // threshold on evidence that was never about which of the two you meant.
  describe('a different subject at the same coordinates', () => {
    const CIRCUS = { name: 'Piccadilly Circus', lat: 51.51, lng: -0.1348 };
    const station = entity({
      qid: 'Q1000101',
      labels: { en: 'Piccadilly Circus tube station', he: 'תחנת הרכבת התחתית פיקדילי סירקוס' },
      instanceOf: ['Q928830'], // metro station — specific, so the granularity list cannot help
      image: 'Piccadilly Circus stn roundel.jpg',
      lat: 51.51,
      lng: -0.1348,
    });
    const square = entity({
      qid: 'Q189040',
      labels: { en: 'Piccadilly Circus', he: 'כיכר פיקדילי' },
      instanceOf: ['Q3153117'],
      image: 'Piccadilly Circus at night.jpg',
      lat: 51.51,
      lng: -0.1348,
    });
    const bothEntities = { entities: { ...station.entities, ...square.entities } };

    it('refuses the station: a name plus a qualifying noun is a different subject', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'Q1000101', title: 'Piccadilly Circus tube station', lat: 51.51, lng: -0.1348 },
        ]),
        wbgetentities: station,
      });
      // One candidate, name comparable and 0.707 — under the floor, so nothing at all.
      expect(await p.match(CIRCUS)).toBeNull();
    });

    // **The point of the floor is not refusal, it is letting the right one win.** Both are at the
    // pin; the square's name agrees exactly and the station's does not.
    it('takes the square when both are at the pin', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'Q1000101', title: 'Piccadilly Circus tube station', lat: 51.51, lng: -0.1348 },
          { qid: 'Q189040', title: 'Piccadilly Circus', lat: 51.51, lng: -0.1348 },
        ]),
        wbgetentities: bothEntities,
      });
      const match = await p.match(CIRCUS);
      expect(match?.ref).toBe('Q189040');
      expect(match?.settled?.commonsFilename).toBe('Piccadilly Circus at night.jpg');
    });

    // **Ambiguity refuses when nothing readable can arbitrate.** Same two candidates at the same
    // point, but the saved name is Hebrew and their labels here are English only — so distance is
    // the only evidence and distance cannot separate two things that share a coordinate.
    it('refuses two uncorroborated candidates at the same point rather than guessing', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'Q1000101', title: 'Piccadilly Circus tube station', lat: 51.51, lng: -0.1348 },
          { qid: 'Q189040', title: 'Piccadilly Circus', lat: 51.51, lng: -0.1348 },
        ]),
        wbgetentities: {
          entities: {
            ...entity({
              qid: 'Q1000101',
              labels: { en: 'Piccadilly Circus tube station' },
              instanceOf: ['Q928830'],
              lat: 51.51,
              lng: -0.1348,
            }).entities,
            ...entity({
              qid: 'Q189040',
              labels: { en: 'Piccadilly Circus' },
              instanceOf: ['Q3153117'],
              lat: 51.51,
              lng: -0.1348,
            }).entities,
          },
        },
      });
      expect(await p.match({ name: 'כיכר פיקדילי', lat: 51.51, lng: -0.1348 })).toBeNull();
    });

    // …and a single uncorroborated candidate at the pin is still accepted: nothing is competing
    // with it, which is the case the coordinate route exists for (§15's Nezu Museum).
    it('still accepts one uncorroborated candidate, because nothing competes with it', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'Q189040', title: 'Piccadilly Circus', lat: 51.51, lng: -0.1348 },
        ]),
        wbgetentities: entity({
          qid: 'Q189040',
          labels: { en: 'Piccadilly Circus' },
          instanceOf: ['Q3153117'],
          lat: 51.51,
          lng: -0.1348,
        }),
      });
      expect((await p.match({ name: 'כיכר פיקדילי', lat: 51.51, lng: -0.1348 }))?.ref).toBe(
        'Q189040',
      );
    });
  });

  // **PICCADILLY CIRCUS MATCHED A SONG** (owner, 2026-08-05). The precision half of the same
  // live run, and the mirror image of the recall bug above: a song named after a place has an
  // EXACT name match and no `P625` at all, so it took the "no coordinates to corroborate"
  // discount — 1.0 × 0.8 = 0.8, comfortably over the 0.6 threshold — and won.
  describe('an item that is not a place at all', () => {
    const PICCADILLY = { name: 'Piccadilly Circus', lat: 51.51, lng: -0.1348 };
    // A real Wikidata shape: an exact label, an `instance of` that is not a place, and no
    // coordinate. The coordinate is the part that matters — the type list would need an entry
    // for every song, album, film and novel ever named after somewhere.
    const song = entity({
      qid: 'Q7194656',
      labels: { en: 'Piccadilly Circus' },
      instanceOf: ['Q7366'],
    });

    it('refuses the song, however exactly its name matches', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([{ id: 'Q7194656', label: 'Piccadilly Circus' }]),
        wbgetentities: song,
        'generator=geosearch': geosearch([]),
      });
      expect(await p.match(PICCADILLY)).toBeNull();
    });

    // **AND THE TWO FIXES COMPOSE**, which is the point of doing them together: the name search
    // returns only the song, that is refused, and the coordinates then find the place itself.
    it('finds the real place through the coordinates once the song is refused', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([{ id: 'Q7194656', label: 'Piccadilly Circus' }]),
        'generator=geosearch': geosearch([
          { qid: 'Q189040', title: 'Piccadilly Circus', lat: 51.51, lng: -0.1348 },
        ]),
        wbgetentities: {
          entities: {
            ...song.entities,
            ...entity({
              qid: 'Q189040',
              labels: { en: 'Piccadilly Circus', he: 'פיקדילי סירקוס' },
              instanceOf: ['Q3153117'],
              image: 'Piccadilly Circus at night.jpg',
              lat: 51.51,
              lng: -0.1348,
            }).entities,
          },
        },
      });
      const match = await p.match(PICCADILLY);
      expect(match?.ref).toBe('Q189040');
      expect(match?.method).toBe(MATCH_METHOD.GEOSEARCH);
      expect(match?.settled?.commonsFilename).toBe('Piccadilly Circus at night.jpg');
    });

    // The pre-filter must NOT apply the veto: a search hit carries no coordinates either, and
    // rejecting on that would reject every candidate before the entity is read. Sensō-ji, whose
    // item does have a coordinate, still matches by name.
    it('still matches a real place by name, whose coordinate arrives with the entity', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([{ id: SENSOJI.qid, label: 'Sensō-ji' }]),
        wbgetentities: SENSOJI.entity,
      });
      expect((await p.match(SENSOJI.place))?.method).toBe(MATCH_METHOD.NAME_PROXIMITY);
    });
  });

  // ── THE COORDINATES DO THE FINDING (ADR-0166 §15) ────────────────────────────────────────
  // The recall half of the same report. A name search only reaches an item labelled in a
  // language we asked for; `list=geosearch` asks what is at a POINT, which has no language. The
  // place here is the owner's own case, saved in Hebrew, against an item labelled only in
  // English — the shape that no amount of fixing the comparison can reach, because the search
  // returns nothing to compare.
  describe('the coordinate-first route', () => {
    const NEZU = { name: 'מוזיאון נזו', lat: 35.6656, lng: 139.7167 };
    const nezuEntity = entity({
      qid: 'Q1054134',
      // English only, on purpose: this is why the name search could not find it.
      labels: { en: 'Nezu Museum' },
      instanceOf: ['Q207694'],
      image: 'Nezu Museum 2018.jpg',
      lat: 35.6656,
      lng: 139.7167,
      sitelinks: { enwiki: 'Nezu Museum' },
    });

    it('finds a place whose item is labelled in a language we did not search', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([]), // the name found nothing at all
        'generator=geosearch': geosearch([
          { qid: 'Q1054134', title: 'Nezu Museum', lat: 35.6656, lng: 139.7167 },
        ]),
        wbgetentities: nezuEntity,
      });
      const match = await p.match(NEZU);

      expect(match?.ref).toBe('Q1054134');
      expect(match?.method).toBe(MATCH_METHOD.GEOSEARCH);
      // Scored on distance alone — the name was not comparable, which is a fact we have no
      // evidence about rather than evidence against.
      expect(match?.evidence.nameSimilarity).toBe(0);
      // …and capped below what a name-corroborated match can score, so a named route always wins.
      expect(match?.confidence).toBeLessThanOrEqual(0.8);
      expect(match?.settled?.commonsFilename).toBe('Nezu Museum 2018.jpg');
    });

    it('is not tried at all when the name search already answered', async () => {
      const { provider: p, fetcher } = provider({
        wbsearchentities: search([{ id: SENSOJI.qid, label: 'Sensō-ji' }]),
        wbgetentities: SENSOJI.entity,
      });
      expect((await p.match(SENSOJI.place))?.method).toBe(MATCH_METHOD.NAME_PROXIMITY);
      expect(fetcher.countMatching('geosearch')).toBe(0);
    });

    // A coordless Place-lite has nothing for this route to stand on, and it must not pretend
    // otherwise — no call, no match (§10's unbuilt name-only route is still unbuilt).
    it('does not exist for a place with no coordinates', async () => {
      const { provider: p, fetcher } = provider({ wbsearchentities: search([]) });
      expect(await p.match({ name: 'מוזיאון נזו' })).toBeNull();
      expect(fetcher.countMatching('geosearch')).toBe(0);
    });

    // **Rule 2**: with the name uninformative, the nearest article being a district is evidence
    // of the WRONG subject rather than a broader view of the right one — and its `P18` on a
    // ramen bar is exactly the "confidently wrong" failure the ADR exists to prevent. §11.2's
    // refuse-the-summary-keep-the-image asymmetry is for a match the NAME established.
    it('skips a broader subject the coordinates merely landed near', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'Q217230', title: 'Minami-Aoyama', lat: 35.6657, lng: 139.7168 },
        ]),
        wbgetentities: entity({
          qid: 'Q217230',
          labels: { en: 'Minami-Aoyama' },
          instanceOf: ['Q123705'], // neighborhood
          image: 'Aoyama skyline.jpg',
          lat: 35.6657,
          lng: 139.7168,
        }),
      });
      // No enrichment beats wrong enrichment, and a district's photograph on a museum is wrong.
      expect(await p.match(NEZU)).toBeNull();
    });

    // …and it takes the next candidate rather than giving up, when the point has more than one.
    it('passes over the district and takes the place itself', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'Q217230', title: 'Minami-Aoyama', lat: 35.66565, lng: 139.71675 },
          { qid: 'Q1054134', title: 'Nezu Museum', lat: 35.6656, lng: 139.7167 },
        ]),
        // One call for both candidates.
        wbgetentities: {
          entities: {
            ...entity({
              qid: 'Q217230',
              labels: { en: 'Minami-Aoyama' },
              instanceOf: ['Q123705'],
              lat: 35.66565,
              lng: 139.71675,
            }).entities,
            ...nezuEntity.entities,
          },
        },
      });
      const match = await p.match(NEZU);
      expect(match?.ref).toBe('Q1054134');
    });

    it('reads every candidate in ONE entities call', async () => {
      const { provider: p, fetcher } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'Q1054134', title: 'Nezu Museum', lat: 35.6656, lng: 139.7167 },
          { qid: 'Q217230', title: 'Minami-Aoyama', lat: 35.6657, lng: 139.7168 },
        ]),
        wbgetentities: nezuEntity,
      });
      await p.match(NEZU);
      expect(fetcher.countMatching('wbgetentities')).toBe(1);
      expect(fetcher.requested.some((u) => u.includes('Q1054134%7CQ217230'))).toBe(true);
    });

    // **A name we CAN read still has to agree.** Both Latin, 20m apart, and about different
    // things: the coordinate is not a licence to accept whatever is nearest.
    it('refuses a comparable name that disagrees, however close it is', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'Q999', title: 'Golden Gai', lat: 35.66562, lng: 139.71672 },
        ]),
        wbgetentities: entity({
          qid: 'Q999',
          labels: { en: 'Golden Gai' },
          instanceOf: ['Q207694'],
          lat: 35.66562,
          lng: 139.71672,
        }),
      });
      expect(await p.match({ name: 'Nezu Museum', lat: 35.6656, lng: 139.7167 })).toBeNull();
    });

    it('drops an article that carries no wikibase item — there is nothing to join on', async () => {
      const { provider: p, fetcher } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'unused', title: 'Some list page', lat: 35.6656, lng: 139.7167, noQid: true },
        ]),
      });
      expect(await p.match(NEZU)).toBeNull();
      expect(fetcher.countMatching('wbgetentities')).toBe(0);
    });
  });

  /* ── THE AIRPORT PAIR (§18, field reports #7/#23) ──────────────────────────────────────── */
  describe('the airport pair', () => {
    const AIRPORT_FIELDS = [ENRICHMENT_FIELD.IATA, ENRICHMENT_FIELD.SERVED_CITY] as const;

    /** A match, as the orchestrator would hand it to `fetch` — the evidence carries the `P31`
     *  the guard reads, which is why the guard costs no request. */
    const matchOf = (qid: string, instanceOf: string[]) => ({
      ref: qid,
      method: MATCH_METHOD.SETTLED_ID,
      confidence: 1,
      evidence: { instanceOf },
    });

    it('reads the IATA code and the served city off an airport', async () => {
      const { provider: p } = provider({
        'ids=Q-airport-tlv': BEN_GURION.entity,
        'ids=Q-city-telaviv': BEN_GURION.city,
      });
      const values = await p.fetch(matchOf(BEN_GURION.qid, ['Q644371']), AIRPORT_FIELDS);

      expect(values[ENRICHMENT_FIELD.IATA]?.value).toBe('TLV');
      // Hebrew where Wikidata has it: the label lands beside the code on a Hebrew RTL row.
      expect(values[ENRICHMENT_FIELD.SERVED_CITY]).toEqual({ value: 'תל אביב', lang: 'he' });
    });

    it('REFUSES a city that carries a real metropolitan IATA code (London, P238=LON)', async () => {
      const { provider: p, fetcher } = provider({ 'ids=Q84': LONDON_CITY.entity });
      // `Q84` genuinely has `P238 = LON`. Without the `P31` guard the pipe would label the
      // city of London with a flight code — the one false positive the research found.
      const values = await p.fetch(matchOf(LONDON_CITY.qid, ['Q515']), AIRPORT_FIELDS);

      expect(values).toEqual({});
      // And it refused without spending a request: the guard reads evidence the match carried.
      expect(fetcher.countMatching('wbgetentities')).toBe(0);
    });

    it("takes Wikidata's preferred rank when it separates the values (Keflavík)", async () => {
      const { provider: p } = provider({
        'ids=Q-airport-kef': KEFLAVIK.entity,
        'ids=Q-city-keflavik': KEFLAVIK.city,
      });
      const values = await p.fetch(matchOf(KEFLAVIK.qid, ['Q644371']), AIRPORT_FIELDS);
      // The preferred claim is second in the list, so "first" alone would answer Njarðvík.
      expect(values[ENRICHMENT_FIELD.SERVED_CITY]?.value).toBe('Keflavík');
    });

    it('falls back to English where Wikidata has no Hebrew label for the city', async () => {
      const { provider: p } = provider({
        'ids=Q-airport-kef': KEFLAVIK.entity,
        'ids=Q-city-keflavik': KEFLAVIK.city,
      });
      const values = await p.fetch(matchOf(KEFLAVIK.qid, ['Q644371']), AIRPORT_FIELDS);
      expect(values[ENRICHMENT_FIELD.SERVED_CITY]?.lang).toBe('en');
    });

    it('reads the item once for both fields, however the orchestrator asks', async () => {
      const { provider: p, fetcher } = provider({
        'ids=Q-airport-tlv': BEN_GURION.entity,
        'ids=Q-city-telaviv': BEN_GURION.city,
      });
      // The orchestrator resolves fields one at a time, so this is two calls into `fetch`.
      await p.fetch(matchOf(BEN_GURION.qid, ['Q644371']), [ENRICHMENT_FIELD.IATA]);
      await p.fetch(matchOf(BEN_GURION.qid, ['Q644371']), [ENRICHMENT_FIELD.SERVED_CITY]);
      expect(fetcher.countMatching('ids=Q-airport-tlv')).toBe(1);
    });

    it('asks nothing at all for a field it does not supply', async () => {
      const { provider: p, fetcher } = provider({ 'ids=Q-airport-tlv': BEN_GURION.entity });
      expect(
        await p.fetch(matchOf(BEN_GURION.qid, ['Q644371']), [ENRICHMENT_FIELD.SUMMARY]),
      ).toEqual({});
      expect(fetcher.requested).toEqual([]);
    });
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
