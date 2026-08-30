import { describe, expect, it } from 'vitest';
import {
  ENRICHMENT_FIELD,
  MATCH_METHOD,
  MATCH_METHOD_CONFIDENCE,
  MATCH_REFUSAL,
} from '@waypoint/shared';
import type { EnrichmentFetcher } from '../outbound-fetch';
import {
  BEN_GURION,
  entity,
  FixtureFetcher,
  geosearch,
  KEFLAVIK,
  BRUARFOSS,
  FEATURE_CLASSES,
  GULLFOSS_HE,
  KERID,
  LONDON_CITY,
  MEGURO_RIVER,
  search,
  SUVARNABHUMI,
  textSearch,
  SENSOJI,
  SKYTREE,
  TSUKIJI,
} from './fixtures';
import { commonName, WikidataProvider } from './wikidata.provider';

const provider = (responses: Record<string, unknown>) => {
  // **The full-text route answers nothing unless a spec says otherwise** (§20). It runs only
  // after the name and the coordinates found nothing, so for every spec that is about one of
  // those two, "no fixture" means "and Wikipedia had nothing either" — which is the state those
  // specs were written in, before the route existed.
  const fetcher = new FixtureFetcher({ 'generator=search': geosearch([]), ...responses });
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

  // **KERIÐ MATCHED NOTHING** (owner, 2026-08-11) — and the reason was the mirror image of the
  // Piccadilly refusal above, which is why the two live next to each other. Same 0.707, same
  // route, opposite direction: there the CANDIDATE's name added a qualifying noun and had to be
  // refused; here OUR name adds the feature's own type and had to be let through.
  describe('a name of ours that only says more than the candidate’s (§15)', () => {
    it('matches Kerið on the coordinates, which the name may no longer veto', async () => {
      const { provider: p } = provider({
        // No Hebrew label and no name-search hit — the real entity has neither, so the
        // coordinate route is genuinely the only one that can answer.
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: KERID.qid, title: 'Kerið', lat: 64.0409804167, lng: -20.8826540713 },
        ]),
        'props=labels&': FEATURE_CLASSES,
        wbgetentities: KERID.entity,
      });

      const match = await p.match(KERID.place);
      expect(match?.ref).toBe(KERID.qid);
      expect(match?.method).toBe(MATCH_METHOD.GEOSEARCH);
      // §22 improved on §21 here: told that a crater is what `Q1435393` IS, the two names agree
      // rather than merely failing to disagree — so the coordinates still FIND it and the name
      // now CORROBORATES it, which is a stronger claim than distance alone ever was.
      expect(match?.evidence.nameSimilarity).toBe(1);
      // A crater is a place you visit as itself, so nothing is refused per-field either.
      expect(match?.refusedFields ?? {}).toEqual({});
    });

    it('still matches it on the distance alone from a Hebrew saved name', async () => {
      // The arm §21 built, unchanged: nothing about `Q1435393` is readable from `מכתש קריד`, so
      // the distance answers alone under the `geosearch` ceiling.
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: KERID.qid, title: 'Kerið', lat: 64.0409804167, lng: -20.8826540713 },
        ]),
        'props=labels&': FEATURE_CLASSES,
        wbgetentities: KERID.entity,
      });

      const match = await p.match({ ...KERID.place, name: 'מכתש קריד' });
      expect(match?.ref).toBe(KERID.qid);
      expect(match?.confidence).toBe(MATCH_METHOD_CONFIDENCE.geosearch);
      // Zero because the name was set aside, not compared and refused (§12.3).
      expect(match?.evidence.nameSimilarity).toBe(0);
    });

    it('does not let the district our name contains ride in on the same rule', async () => {
      // The measured counter-case: `Tsukiji` is 366m from the outer market's pin, and it is a
      // `chōchō` — so distance credit is gone AND the broader-subject skip drops it first.
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'Q1201337', title: 'Tsukiji', lat: 35.6647, lng: 139.7703 },
        ]),
        wbgetentities: entity({
          qid: 'Q1201337',
          labels: { en: 'Tsukiji' },
          instanceOf: ['Q5327369'], // chōchō — a subdivision of a city
          lat: 35.6647,
          lng: 139.7703,
        }),
      });
      expect(await p.match(TSUKIJI.place)).toBeNull();
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
        // Keyed by the ids each call actually asks for, because the name route now reads the
        // hits it got and the coordinate route reads the ones the point gave — two different
        // `wbgetentities` calls, and answering both with both entities would let the name route
        // see a candidate its own search never returned.
        'ids=Q7194656': song,
        'ids=Q189040': entity({
          qid: 'Q189040',
          labels: { en: 'Piccadilly Circus', he: 'פיקדילי סירקוס' },
          instanceOf: ['Q3153117'],
          image: 'Piccadilly Circus at night.jpg',
          lat: 51.51,
          lng: -0.1348,
        }),
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
      // **The COMMON name, not the official one** (owner report, 2026-08-08): Wikidata's
      // Hebrew label is `תל אביב-יפו` and nobody says that on a day row.
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

    /**
     * **What the matcher already resolves and throws away** (ADR-0166's 2026-08-30
     * amendment). `classNouns` reads `P31` labels to decide whether a candidate is the
     * right KIND of thing and keeps none of them; `P131` is a key in a payload the pass
     * already parses. Neither is about airports, which is why they are not behind the
     * class guard above.
     */
    it('reads the class noun and the region off an ordinary place', async () => {
      const { provider: p, fetcher } = provider({
        'ids=Q38519': GULLFOSS_HE.entity,
        'ids=Q34038': FEATURE_CLASSES,
        'ids=Q-blaskogabyggd': FEATURE_CLASSES,
      });
      const values = await p.fetch(matchOf(GULLFOSS_HE.qid, ['Q34038']), [
        ENRICHMENT_FIELD.KIND,
        ENRICHMENT_FIELD.REGION,
      ]);

      // Hebrew where Wikidata has it — the same `he` → `en` preference the summary and the
      // served city carry, and for the same reason: this lands in a Hebrew RTL page.
      expect(values[ENRICHMENT_FIELD.KIND]).toEqual({ value: 'מפל מים', lang: 'he' });
      // …and English where it does not, which is most Icelandic municipalities.
      expect(values[ENRICHMENT_FIELD.REGION]).toEqual({ value: 'Bláskógabyggð', lang: 'en' });
      // The class and the region are one entity read each, off the item already read.
      expect(fetcher.countMatching('wbgetentities')).toBe(3);
    });

    it('asks for no class or region when neither is wanted', async () => {
      const { provider: p, fetcher } = provider({ 'ids=Q38519': GULLFOSS_HE.entity });
      // A waterfall is not an airport, so the pair is refused on evidence and the place
      // facts were not asked for — nothing to fetch at all.
      expect(await p.fetch(matchOf(GULLFOSS_HE.qid, ['Q34038']), AIRPORT_FIELDS)).toEqual({});
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

/* ── THE CITY'S COMMON NAME (ADR-0166 §18's amendment) ─────────────────────────────────────
   Wikidata's label is the OFFICIAL name (`תל אביב-יפו`, `Frankfurt am Main`); what a traveller
   says is usually sitting beside it as an alias. The rule is the longest alias that is a proper
   prefix of the label at a word boundary — narrow enough that only a trailing qualifier is
   dropped. */
describe('commonName', () => {
  it('drops a trailing qualifier the label carries and the alias does not', () => {
    expect(commonName('תל אביב-יפו', ['תל אביב', 'ת״א'])).toBe('תל אביב');
    expect(commonName('Frankfurt am Main', ['Frankfurt', 'FFM'])).toBe('Frankfurt');
  });

  it('takes the LONGEST such alias, so a one-word prefix cannot win', () => {
    // Shortest-first would answer `תל`, which is not a city.
    expect(commonName('תל אביב-יפו', ['תל', 'תל אביב'])).toBe('תל אביב');
  });

  it('ignores an alias that is not a prefix — a different word is a different name', () => {
    // An abbreviation, a former name and a translation are all legitimate aliases and none of
    // them is "the same name, shorter".
    expect(commonName('תל אביב-יפו', ['ת״א', 'Tel Aviv', 'יפו'])).toBe('תל אביב-יפו');
    expect(commonName('København', ['Copenhagen'])).toBe('København');
  });

  it('refuses a prefix that lands mid-word', () => {
    expect(commonName('Frankfurter', ['Frank'])).toBe('Frankfurter');
  });

  it('falls back to the label, which is every city with no alias at all', () => {
    expect(commonName('וינה', [])).toBe('וינה');
    expect(commonName('Keflavík', ['Keflavík'])).toBe('Keflavík');
  });
});

/* ── THE FULL-TEXT ROUTE (ADR-0166 §20) ────────────────────────────────────────────────────
   Owner report, 2026-08-08: Bangkok never matched. Neither name route could reach it — the
   saved name is a transliteration of a Latin-labelled item — and the coordinate route could not
   either, because an airport's centroid is kilometres from its terminal. */
describe('WikidataProvider — the article-text route', () => {
  const found = {
    wbsearchentities: search([]),
    'generator=geosearch': geosearch([]),
    'generator=search': textSearch([{ qid: SUVARNABHUMI.qid, title: 'Suvarnabhumi Airport' }]),
    wbgetentities: SUVARNABHUMI.entity,
  };

  it('finds the airport the label search and the coordinates both missed', async () => {
    const { provider: p } = provider(found);
    const match = await p.match(SUVARNABHUMI.place);

    expect(match?.ref).toBe(SUVARNABHUMI.qid);
    expect(match?.method).toBe(MATCH_METHOD.WIKI_SEARCH);
  });

  it('scores it below every route above it — a text hit is the weakest evidence', async () => {
    const { provider: p } = provider(found);
    const match = await p.match(SUVARNABHUMI.place);
    expect(match!.confidence).toBeLessThanOrEqual(MATCH_METHOD_CONFIDENCE.wiki_search);
    expect(match!.confidence).toBeLessThan(MATCH_METHOD_CONFIDENCE.geosearch);
  });

  it('runs ONLY after the other two routes found nothing', async () => {
    const { provider: p, fetcher } = provider({
      wbsearchentities: search([{ id: SENSOJI.qid, label: 'Sensō-ji' }]),
      wbgetentities: SENSOJI.entity,
    });
    await p.match(SENSOJI.place);
    expect(fetcher.countMatching('generator=search')).toBe(0);
  });

  it('still refuses a text hit that is somewhere else entirely', async () => {
    // A full-text search matches words, so an article merely MENTIONING the name is a hit —
    // the distance check is what keeps that from becoming a match.
    const { provider: p } = provider({
      wbsearchentities: search([]),
      'generator=geosearch': geosearch([]),
      'generator=search': textSearch([{ qid: 'Q-far', title: 'Some other airport' }]),
      wbgetentities: entity({
        qid: 'Q-far',
        labels: { en: 'Narita International Airport' },
        instanceOf: ['Q644371'],
        lat: 35.772,
        lng: 140.393,
      }),
    });
    expect(await p.match(SUVARNABHUMI.place)).toBeNull();
  });

  it('reads the IATA code off the item it finds — which is the point of the whole route', async () => {
    // Keyed by `ids=` rather than `wbgetentities`, so the airport read and the city read get
    // different answers — the fixture fetcher matches the FIRST key found in the URL.
    const { provider: p } = provider({
      wbsearchentities: search([]),
      'generator=geosearch': geosearch([]),
      'generator=search': textSearch([{ qid: SUVARNABHUMI.qid, title: 'Suvarnabhumi Airport' }]),
      'ids=Q-airport-bkk': SUVARNABHUMI.entity,
      'ids=Q-city-bangkok': SUVARNABHUMI.city,
    });
    const match = await p.match(SUVARNABHUMI.place);
    const values = await p.fetch(match!, [ENRICHMENT_FIELD.IATA, ENRICHMENT_FIELD.SERVED_CITY]);

    expect(values[ENRICHMENT_FIELD.IATA]?.value).toBe('BKK');
    expect(values[ENRICHMENT_FIELD.SERVED_CITY]?.value).toBe('בנגקוק');
  });
  /* ── THE THREE FIELD-REPORT WITNESSES (ADR-0166 §22, field report #41) ────────────────────
     Kerið's own regression lives with the `nameCanRefuse` specs above. These are the two the
     owner reported next, and each fails for a different reason — so each is kept as a permanent
     witness rather than folded into one "Iceland" test. Every payload is live-read; see the
     fixtures for what was measured and when. */
  describe('Brúarfoss — a namesake first, no article anywhere, and a type noun (#41)', () => {
    const searchHits = search([
      // The order is the API's own, and it is the defect: the wrong waterfall is first.
      { id: BRUARFOSS.namesakeQid, label: 'Brúarfoss' },
      { id: BRUARFOSS.qid, label: 'Brúarfoss' },
    ]);

    it('reaches the right waterfall though the search returned the wrong one first', async () => {
      const { provider: p } = provider({
        wbsearchentities: searchHits,
        'ids=Q16422005%7CQ2557346': {
          entities: { ...BRUARFOSS.namesake.entities, ...BRUARFOSS.entity.entities },
        },
        'props=labels&': FEATURE_CLASSES,
      });

      const match = await p.match(BRUARFOSS.place);
      // Not the namesake 130km away, which is what "verify only the best-named hit" returned —
      // and it returned it as `null`, because the coordinates then refuted the one it had picked.
      expect(match?.ref).toBe(BRUARFOSS.qid);
      expect(match?.method).toBe(MATCH_METHOD.NAME_PROXIMITY);
      expect(match?.settled?.commonsFilename).toBe('Brúarfoss (15657306391).jpg');
    });

    it('reads `Waterfall` as the type this candidate IS, not as a word it disagrees about', async () => {
      const { provider: p } = provider({
        wbsearchentities: search([{ id: BRUARFOSS.qid, label: 'Brúarfoss' }]),
        'ids=Q2557346': BRUARFOSS.entity,
        'props=labels&': FEATURE_CLASSES,
      });
      const match = await p.match(BRUARFOSS.place);
      // 0.707 without the class noun — under the floor, and under the threshold even before it.
      expect(match?.evidence.nameSimilarity).toBe(1);
    });

    it('still refuses it when the class label does not name the extra words', async () => {
      // The same shape with the type noun withheld — `Q131596` is a farm, and `Waterfall` is not
      // what a farm is called. This is `Tsukiji Outer Market` against `Tsukiji` in miniature.
      const { provider: p } = provider({
        wbsearchentities: search([{ id: BRUARFOSS.qid, label: 'Brúarfoss' }]),
        'ids=Q2557346': entity({
          qid: BRUARFOSS.qid,
          labels: { en: 'Brúarfoss' },
          instanceOf: ['Q131596'],
          lat: 64.2645,
          lng: -20.5165,
        }),
        'props=labels&': FEATURE_CLASSES,
        'generator=geosearch': geosearch([]),
        'commons.wikimedia.org': geosearch([]),
      });
      expect(await p.match(BRUARFOSS.place)).toBeNull();
    });

    it('finds it through Commons when no Wikipedia we ask for has an article', async () => {
      // The Hebrew saved name: the label search returns nothing, and neither `enwiki` nor
      // `hewiki` has a page at the pin. Commons' category is the only geotagged thing there.
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'en.wikipedia.org': geosearch([]),
        'he.wikipedia.org': geosearch([]),
        'commons.wikimedia.org': BRUARFOSS.commonsNearby,
        wbgetentities: {
          entities: {
            ...BRUARFOSS.entity.entities,
            ...entity({
              qid: 'Q252246',
              labels: { en: 'Árnessýsla' },
              instanceOf: ['Q56061'], // the county — the granularity skip must drop it
              lat: 64.25,
              lng: -20.5,
            }).entities,
          },
        },
      });

      const match = await p.match({ ...BRUARFOSS.place, name: 'מפלי ברואארפוס' });
      expect(match?.ref).toBe(BRUARFOSS.qid);
      expect(match?.method).toBe(MATCH_METHOD.GEOSEARCH);
    });
  });

  describe('מפלי גולפוס — one Icelandic word, three Hebrew spellings (#41)', () => {
    it('matches Gullfoss despite a Hebrew label spelled differently from ours', async () => {
      const { provider: p } = provider({
        // No Wikidata item is labelled with Google's spelling, so the name route sees nothing.
        wbsearchentities: search([]),
        'generator=geosearch': GULLFOSS_HE.nearby,
        'ids=Q38519': GULLFOSS_HE.entity,
        'props=labels&': FEATURE_CLASSES,
      });

      const match = await p.match(GULLFOSS_HE.place);
      expect(match?.ref).toBe(GULLFOSS_HE.qid);
      expect(match?.settled?.commonsFilename).toBe('GullfossOverview.jpg');
      // A waterfall is a place you visit as itself: nothing is refused per field.
      expect(match?.refusedFields ?? {}).toEqual({});
    });

    it('does not match a place whose Hebrew label genuinely disagrees', async () => {
      // The guard the case above must not break: same script, same distance, a real
      // disagreement — `גייסיר` is not `גולפוס` by any spelling, and it stays refused.
      const { provider: p } = provider({
        wbsearchentities: search([]),
        'generator=geosearch': geosearch([
          { qid: 'Q1128186', title: 'גייסיר', lat: 64.3271, lng: -20.1199 },
        ]),
        wbgetentities: entity({
          qid: 'Q1128186',
          labels: { he: 'גייסיר', en: 'Geysir' },
          instanceOf: ['Q1502963'],
          lat: 64.3271,
          lng: -20.1199,
        }),
      });
      expect(await p.match(GULLFOSS_HE.place)).toBeNull();
    });
  });
});
