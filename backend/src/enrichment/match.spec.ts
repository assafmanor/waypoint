import { describe, expect, it } from 'vitest';
import {
  ENRICHMENT_FIELD,
  MATCH_CONFIDENCE_THRESHOLD,
  MATCH_MIN_NAME_SIMILARITY,
  MATCH_REFUSAL,
} from '@waypoint/shared';
import {
  coordinatesAreAmbiguous,
  descriptorAwareSimilarity,
  geoProximityConfidence,
  granularityRefusals,
  isMatchConfident,
  nameOnlyConfidence,
  nameProximityConfidence,
  nameCanRefuse,
  namesComparable,
  nameSimilarity,
  proximityScore,
  tokensNear,
} from './match';

// Real coordinates and names from the coverage spike dataset
// (docs/planning/2026-08-04-enrichment-coverage-spike-data.csv).
const SENSOJI = { name: 'Sensō-ji', lat: 35.7148, lng: 139.7967 };
const MEIJI = { name: 'Meiji Jingū / Meiji Shrine', lat: 35.6764, lng: 139.6993 };
const SHIBUYA_CROSSING = { name: 'Shibuya Crossing', lat: 35.6595, lng: 139.7005 };

/** What one near-spelled word is worth (`NEAR_TOKEN_CREDIT`) — asserted here rather than
 *  exported, so a change to it has to come back through these cases. */
const NEAR_CREDIT = 0.75;

describe('nameSimilarity', () => {
  it('scores an exact name 1', () => {
    expect(nameSimilarity('Ueno Park', 'Ueno Park')).toBe(1);
  });

  it('ignores case and punctuation, via the shared normalizer', () => {
    expect(nameSimilarity('Sensō-ji', 'sensō ji')).toBe(1);
  });

  it('folds diacritics and punctuation differences to the same name', () => {
    // Google's name and Wikidata's label differ by a macron more often than by a word.
    expect(nameSimilarity('Sensō-ji', 'Sensoji')).toBe(1);
    expect(nameSimilarity('Meiji Jingū', 'Meiji Jingu')).toBe(1);
  });

  it('scores a contained name highly without scoring it perfect', () => {
    // The spike's own label for this place is the double-barrelled one; Wikidata's is
    // `Meiji Shrine`. Strong evidence, but the longer name says something the shorter
    // one does not, so it is not the same string.
    const contained = nameSimilarity(MEIJI.name, 'Meiji Shrine');
    expect(contained).toBeGreaterThan(0.8);
    expect(contained).toBeLessThan(1);
  });

  it('scores a bare one-word prefix well below a contained full name', () => {
    // Dividing by the smaller token set alone scores both of these a perfect 1, which
    // would let any one-word prefix match everything that starts with it.
    expect(nameSimilarity('Tsukiji Outer Market', 'Tsukiji')).toBeLessThan(
      nameSimilarity(MEIJI.name, 'Meiji Shrine'),
    );
  });

  it('scores partial word overlap partially', () => {
    expect(nameSimilarity('Tsukiji Outer Market', 'Tsukiji fish market')).toBeCloseTo(2 / 3, 5);
  });

  it('folds a letter that is not an accented letter (field report #29)', () => {
    // `ð`/`þ`/`ø`/`ß` are letters, not letters-with-an-accent: they decompose to themselves,
    // so `tokenize`'s `NFD` + `\p{M}` fold leaves them untouched and the two spellings of one
    // name score 0 on the syllable they agree about.
    //
    // Giessen is the measured case. Google's own name for the place is `Giessen`; Wikidata's
    // German label (`Q3874`) is `Gießen`, and its English one is the plain form — which is
    // exactly the split this variant closes.
    expect(nameSimilarity('Giessen', 'Gießen')).toBe(1);
    // Þingvellir's IS label against the EN alias the same entity (`Q107370`) carries.
    expect(nameSimilarity('Þingvellir', 'Thingvellir')).toBe(1);
    expect(nameSimilarity('Kerið', 'Kerid Crater lake')).toBeGreaterThan(0);
    expect(nameSimilarity('Røros', 'Roros')).toBe(1);
  });

  it('does not disturb a name both sides already spell the same way', () => {
    // Kerið and Røros are the field report's own places, and Wikidata labels both with the
    // local letter — as does Google (`Kerið Crater`, `Røros`). Nothing here needed folding;
    // the variant must not make that worse.
    expect(nameSimilarity('Kerið', 'Kerið')).toBe(1);
    expect(nameSimilarity('Røros', 'Røros')).toBe(1);
  });

  it('scores a name plus a bare feature-type word below the threshold', () => {
    // The scorer is NOT changed for this: `Kerið Crater` against `Kerið` is one shared token
    // over `sqrt(2 × 1)`, and a partial overlap is a partial score. What changed is who is
    // allowed to act on it — `nameCanRefuse` (§21), and, once the caller has read what the
    // candidate IS, `descriptorAwareSimilarity` (§22). Told nothing about the candidate's type,
    // this still refuses, and that is the safe default it should keep.
    expect(nameSimilarity('Kerið Crater', 'Kerið')).toBeCloseTo(0.7071, 4);
    expect(nameSimilarity('Kerið Crater', 'Kerið')).toBeLessThan(MATCH_MIN_NAME_SIMILARITY);
  });

  it('scores unrelated names 0', () => {
    expect(nameSimilarity('Ueno Park', 'Katz’s Delicatessen')).toBe(0);
  });

  it('tokenizes a non-Latin name rather than returning nothing', () => {
    // Google returns Hebrew names where it has one (ADR-0108), so a matcher that only
    // spoke Latin would refuse every place the app actually saves in Hebrew.
    expect(nameSimilarity('עץ השמיים', 'עץ השמיים')).toBe(1);
    expect(nameSimilarity('浅草寺', '浅草寺')).toBe(1);
  });

  it('scores an empty name 0 rather than dividing by zero', () => {
    expect(nameSimilarity('', 'Ueno Park')).toBe(0);
    expect(nameSimilarity('...', 'Ueno Park')).toBe(0);
  });
});

describe('proximityScore', () => {
  it('gives full credit to the same spot', () => {
    expect(proximityScore(0)).toBe(1);
    expect(proximityScore(400)).toBe(1);
  });

  it('decays with distance and bottoms out', () => {
    expect(proximityScore(2750)).toBeCloseTo(0.5, 1);
    expect(proximityScore(5000)).toBe(0);
    expect(proximityScore(50_000)).toBe(0);
  });
});

describe('nameProximityConfidence', () => {
  it('is confident about the same name in the same spot', () => {
    const result = nameProximityConfidence(SENSOJI, { ...SENSOJI, name: 'Sensoji' });
    expect(result.confidence).toBeGreaterThan(MATCH_CONFIDENCE_THRESHOLD);
    expect(result.distanceMeters).toBeLessThan(50);
  });

  it('never outranks an exact identity join, however good the guess (§12.3)', () => {
    const perfect = nameProximityConfidence(SENSOJI, SENSOJI);
    expect(perfect.confidence).toBeLessThan(1);
  });

  it('refuses a same-named place in the wrong city', () => {
    // A name that matches perfectly is not a match if the thing is 9,000 km away — and a
    // perfect name alone clears the threshold, so this needs the distance to veto.
    const result = nameProximityConfidence(SENSOJI, {
      name: 'Sensō-ji',
      lat: 48.8584,
      lng: 2.2945,
    });
    expect(result.nameSimilarity).toBe(1);
    expect(result.confidence).toBe(0);
    expect(isMatchConfident(result.confidence)).toBe(false);
  });

  it('still corroborates a name across a large site rather than vetoing it', () => {
    // A big park's Wikidata centroid sits well away from the gate a traveller pins; the
    // veto must not fire on that, which is why its radius is loose.
    const result = nameProximityConfidence(
      { name: 'Ueno Park', lat: 35.7154, lng: 139.7737 },
      { name: 'Ueno Park', lat: 35.7188, lng: 139.7745 },
    );
    expect(isMatchConfident(result.confidence)).toBe(true);
  });

  it('refuses a nearby place with an unrelated name', () => {
    const result = nameProximityConfidence(SHIBUYA_CROSSING, {
      name: 'Katz’s Delicatessen',
      lat: 35.6596,
      lng: 139.7006,
    });
    expect(isMatchConfident(result.confidence)).toBe(false);
  });

  it('lets a coordless Place-lite match on a strong name, at a discount', () => {
    const coordless = nameProximityConfidence({ name: 'Ueno Park' }, { name: 'Ueno Park' });
    const withCoords = nameProximityConfidence(SENSOJI, SENSOJI);
    expect(isMatchConfident(coordless.confidence)).toBe(true);
    expect(coordless.confidence).toBeLessThan(withCoords.confidence);
    expect(coordless.distanceMeters).toBeUndefined();
  });

  it('refuses a coordless place whose name only half matches', () => {
    const result = nameProximityConfidence({ name: 'Tsukiji Outer Market' }, { name: 'Tsukiji' });
    expect(isMatchConfident(result.confidence)).toBe(false);
  });

  it('reports the evidence it used, not just a number', () => {
    const result = nameProximityConfidence(MEIJI, { ...MEIJI, name: 'Meiji Shrine' });
    // Both halves of the evidence, so a bad match is diagnosable later rather than
    // mysterious (§5.5) — the score alone would not say which half was weak.
    expect(result.nameSimilarity).toBeGreaterThan(0.8);
    expect(result.nameSimilarity).toBeLessThan(1);
    expect(result.distanceMeters).toBeDefined();
  });
});

describe('the name must carry the match, proximity may only corroborate (§15)', () => {
  const CIRCUS = { name: 'Piccadilly Circus', lat: 51.51, lng: -0.1348 };
  const at = (name: string) => nameProximityConfidence(CIRCUS, { name, lat: 51.51, lng: -0.1348 });

  // THE BUG, in its arithmetic: 0.707 on the name, and proximity — free, because the station's
  // article coordinate IS the square's — carried it to 0.810.
  it('refuses a name that is ours plus a qualifying noun, at zero distance', () => {
    const scored = at('Piccadilly Circus tube station');
    expect(scored.nameSimilarity).toBeCloseTo(0.707, 2);
    expect(scored.confidence).toBe(0);
    // The distance is still recorded: the refusal is about the name, and the evidence should
    // say how near the thing we refused was.
    expect(scored.distanceMeters).toBeLessThan(5);
  });

  it('keeps the measured case the floor was calibrated against', () => {
    // `Meiji Jingū / Meiji Shrine` → `Meiji Shrine` is 0.816, and ADR-0166 §11 wants it.
    const meiji = nameProximityConfidence(
      { name: 'Meiji Jingū / Meiji Shrine', lat: 35.6764, lng: 139.6993 },
      { name: 'Meiji Shrine', lat: 35.6764, lng: 139.6993 },
    );
    expect(meiji.nameSimilarity).toBeGreaterThan(0.8);
    expect(isMatchConfident(meiji.confidence)).toBe(true);
    // And an exact name is untouched.
    expect(at('Piccadilly Circus').confidence).toBe(0.9);
  });

  it('applies to a name-only match too, so a coordless place gets no easier ride', () => {
    const scored = nameProximityConfidence(
      { name: 'Piccadilly Circus' },
      { name: 'Piccadilly Circus tube station' },
    );
    expect(scored.confidence).toBe(0);
  });
});

describe('coordinatesAreAmbiguous — two things at one pin (§15)', () => {
  it('is true when more than one candidate is inside the trust radius', () => {
    expect(coordinatesAreAmbiguous([0, 3])).toBe(true);
    expect(coordinatesAreAmbiguous([12, 80, 140])).toBe(true);
  });

  it('is false for one candidate, however many others are further out', () => {
    // The case the coordinate route exists for: one thing at the pin, the rest are elsewhere.
    expect(coordinatesAreAmbiguous([4])).toBe(false);
    expect(coordinatesAreAmbiguous([4, 220, 480])).toBe(false);
    expect(coordinatesAreAmbiguous([])).toBe(false);
  });
});

describe('a candidate with no coordinates is probably not a place (§15)', () => {
  const PICCADILLY = { name: 'Piccadilly Circus', lat: 51.51, lng: -0.1348 };

  // THE BUG, in one assertion: an exact name and no coordinate used to score 0.8 and win.
  it('refuses it outright when WE have coordinates', () => {
    const scored = nameProximityConfidence(PICCADILLY, { name: 'Piccadilly Circus' });
    expect(scored.nameSimilarity).toBe(1);
    expect(scored.confidence).toBe(0);
    expect(isMatchConfident(scored.confidence)).toBe(false);
  });

  // The other side of the asymmetry, unchanged: when OUR place is the one with no coordinates
  // (a coordless Place-lite, §10) the name still carries the match at a discount. Absence of
  // evidence is not evidence — on the side where the absence is ours.
  it('still lets a coordless place of ours match on a strong name alone', () => {
    const scored = nameProximityConfidence(
      { name: 'Piccadilly Circus' },
      { name: 'Piccadilly Circus' },
    );
    expect(scored.confidence).toBeCloseTo(0.8, 5);
    expect(isMatchConfident(scored.confidence)).toBe(true);
  });

  // And the pre-filter keeps its own, veto-free question: a search hit has no coordinates
  // either, so scoring hits through the full function would refuse every candidate before the
  // entity that carries the coordinate is ever read.
  it('nameOnlyConfidence answers the pre-filter’s question instead', () => {
    expect(nameOnlyConfidence(PICCADILLY, 'Piccadilly Circus')).toBeCloseTo(0.8, 5);
    expect(nameOnlyConfidence(PICCADILLY, 'Trafalgar Square')).toBe(0);
  });
});

describe('namesComparable — a cross-script comparison is uninformative, not negative (§15)', () => {
  it('is false for the same place written in two alphabets', () => {
    // THE BUG, in one assertion: `nameSimilarity` scores this 0, and 0 was read as "wrong
    // place" when it means "we cannot read this".
    expect(namesComparable('מגדל אייפל', 'Eiffel Tower')).toBe(false);
    expect(nameSimilarity('מגדל אייפל', 'Eiffel Tower')).toBe(0);
  });

  it('is true whenever the two share a script, so a real disagreement is still visible', () => {
    expect(namesComparable('מגדל אייפל', 'מגדל אייפל')).toBe(true);
    expect(namesComparable('Stokksnes', 'Stokksnes')).toBe(true);
    // Different places, same alphabet — the comparison is meaningful and it says no.
    expect(namesComparable('Nezu Museum', 'Golden Gai')).toBe(true);
  });

  it('treats the CJK scripts as one, so kana against kanji is comparable', () => {
    expect(namesComparable('浅草寺', 'せんそうじ')).toBe(true);
    expect(namesComparable('浅草寺', 'Sensō-ji')).toBe(false);
  });

  it('does not count digits or punctuation as a shared script', () => {
    // `7-Eleven` and `7-אלוון` share their numerals and nothing that says they are one place.
    expect(namesComparable('7-Eleven', '7-אלוון')).toBe(false);
    expect(namesComparable('123', '456')).toBe(false);
  });
});

describe('nameCanRefuse — a name that says MORE has not disagreed (owner report, 2026-08-11)', () => {
  it('lets the name DECIDE once the extra word is known to be the candidate’s type', () => {
    // Kerið, measured: Google saves `Kerið Crater`, `Q1435393` is labelled `Kerið`, and 0.707
    // vetoed the only article within 150m of the pin. §21 answered that by setting the name
    // aside; §22 does better — told that a crater is what `Q1435393` IS, the two names AGREE,
    // so the name corroborates and the match is a named one rather than a distance-only one.
    const crater = ['volcanic crater', 'volcanic crater lake'];
    expect(nameCanRefuse('Kerið Crater', { name: 'Kerið', classNouns: crater })).toBe(true);
    expect(descriptorAwareSimilarity('Kerið Crater', 'Kerið', crater)).toBe(1);
    // Across the transliterated variants too, since those are what `nameSimilarity` scores.
    expect(descriptorAwareSimilarity('Kerið Crater', 'Kerid', crater)).toBe(1);
  });

  it('sets the name aside when the type word agrees but the spelling only nearly does', () => {
    // Hebrew Gullfoss, which is what the second clause is FOR: `מפלי` is the class noun, and
    // `גולפוס`/`גאלפוס` are one edit apart — corroborating, not carrying, so the pair lands
    // under the floor and the distance answers alone exactly as it does for a script we cannot
    // read at all.
    expect(nameCanRefuse('מפלי גולפוס', { name: 'גאלפוס', classNouns: ['מפל מים'] })).toBe(false);
  });

  it('REFUSES when the extra words are not what the candidate is (§22)', () => {
    // The measured false positive: a café named after the waterfall says `גולפוס` and more,
    // exactly as `מפלי גולפוס` does, and sits inside the trust radius of the same coordinate.
    // Distance cannot separate them; the surplus words can, and `בית קפה` is not a waterfall.
    expect(nameCanRefuse('בית קפה גולפוס', { name: 'גאלפוס', classNouns: ['מפל מים'] })).toBe(true);
    expect(nameCanRefuse('Tsukiji Outer Market', { name: 'Tsukiji', classNouns: ['chōchō'] })).toBe(
      true,
    );
  });

  it('refuses by default when nobody looked up what the candidate is', () => {
    // The safe direction: with no type words there is no word that can be surplus, so this is
    // the pre-§21 answer. The one route that needs the exception is the one that fetches them.
    expect(nameCanRefuse('Kerið Crater', 'Kerið')).toBe(true);
  });

  it('STILL refuses the candidate whose name is ours plus a qualifying noun (§15)', () => {
    // The direction is the whole guard. Piccadilly Circus matched the tube station under it,
    // and `MATCH_MIN_NAME_SIMILARITY` exists to refuse that at this very same 0.707 — so the
    // rule above must not reach it.
    expect(nameSimilarity('Piccadilly Circus', 'Piccadilly Circus tube station')).toBeCloseTo(
      0.7071,
      4,
    );
    expect(nameCanRefuse('Piccadilly Circus', 'Piccadilly Circus tube station')).toBe(true);
  });

  it('leaves a name that already corroborates on the name route (§12.3)', () => {
    // 0.816 is above the floor, so the name is deciding rather than refusing, and it keeps
    // deciding — this must not be demoted to a distance-only match.
    expect(nameCanRefuse('Meiji Jingū / Meiji Shrine', 'Meiji Shrine')).toBe(true);
    expect(nameCanRefuse('Nezu Museum', 'Nezu Museum')).toBe(true);
    // A one-word descriptor on a two-word name is already 0.816 and already matched — this
    // rule is only for the names that fell UNDER the floor.
    expect(nameCanRefuse('Sensō-ji Temple', 'Sensō-ji')).toBe(true);
  });

  it('keeps refusing a name that genuinely disagrees', () => {
    expect(nameCanRefuse('Nezu Museum', 'Golden Gai')).toBe(true);
    // A shared word is not containment: neither name says everything the other does.
    expect(nameCanRefuse('Ueno Park', 'Ueno Zoo')).toBe(true);
  });

  it('still answers false for a comparison across scripts (§15, unchanged)', () => {
    expect(nameCanRefuse('מגדל אייפל', 'Eiffel Tower')).toBe(false);
  });
});

describe('geoProximityConfidence — the coordinates find it, the name checks it (§15)', () => {
  const NEZU = { name: 'מוזיאון נזו', lat: 35.6656, lng: 139.7167 };

  it('scores on distance alone when the name cannot be read', () => {
    const scored = geoProximityConfidence(NEZU, {
      name: 'Nezu Museum',
      lat: 35.6656,
      lng: 139.7167,
    });
    // Capped at the geosearch ceiling, so a name-corroborated match always outranks it.
    expect(scored.confidence).toBe(0.8);
    expect(isMatchConfident(scored.confidence)).toBe(true);
    // Zero because it was never compared — the stored evidence must say which happened.
    expect(scored.nameSimilarity).toBe(0);
  });

  it('decays with distance and stops being a match well before the name route would', () => {
    const at = (lat: number) =>
      geoProximityConfidence(NEZU, { name: 'Nezu Museum', lat, lng: 139.7167 });
    // 0.0009° of latitude is ~100m, 0.003° ~333m, 0.0055° ~610m.
    expect(at(35.6665).confidence).toBe(0.8);
    expect(at(35.6686).confidence).toBeGreaterThan(0);
    expect(at(35.6686).confidence).toBeLessThan(0.8);
    expect(at(35.6711).confidence).toBe(0);
  });

  it('defers to the name’s own arithmetic when the scripts DO overlap', () => {
    const agreeing = geoProximityConfidence(
      { name: 'Nezu Museum', lat: 35.6656, lng: 139.7167 },
      { name: 'Nezu Museum', lat: 35.6656, lng: 139.7167 },
    );
    // The name route's ceiling, not the geosearch one — a corroborated name is worth more.
    expect(agreeing.confidence).toBe(0.9);
    expect(agreeing.nameSimilarity).toBe(1);

    // …and a readable name that disagrees still refuses, however close it is.
    const disagreeing = geoProximityConfidence(
      { name: 'Nezu Museum', lat: 35.6656, lng: 139.7167 },
      { name: 'Golden Gai', lat: 35.66562, lng: 139.71672 },
    );
    expect(isMatchConfident(disagreeing.confidence)).toBe(false);
  });

  it('matches Kerið, now that its name can no longer veto it', () => {
    // Every number here is real (2026-08-11): the pin is what Google gives for `Kerið Crater`,
    // the candidate is `Q1435393`'s own `P625`, and the live geosearch returns exactly one
    // other article within 3km (Grímsnes, 1.2km away). Before §21 the confidence was 0; §21
    // made it 0.8 on the distance, and §22's type word makes it a NAMED match at 0.9.
    const scored = geoProximityConfidence(
      { name: 'Kerið Crater', lat: 64.0408, lng: -20.8847 },
      {
        name: 'Kerið',
        classNouns: ['volcanic crater', 'volcanic crater lake'],
        lat: 64.0409804167,
        lng: -20.8826540713,
      },
    );
    expect(scored.distanceMeters).toBeLessThan(150);
    expect(isMatchConfident(scored.confidence)).toBe(true);
    expect(scored.nameSimilarity).toBe(1);

    // And with nothing known about the candidate's type, §21's distance-only answer stands —
    // the name is set aside rather than believed, and the evidence says so with a 0 (§12.3).
    const unTyped = geoProximityConfidence(
      { name: 'מכתש קריד', lat: 64.0408, lng: -20.8847 },
      { name: 'Kerið', lat: 64.0409804167, lng: -20.8826540713 },
    );
    expect(unTyped.confidence).toBe(0.8);
    expect(unTyped.nameSimilarity).toBe(0);
  });

  it('will not let a district ride in on a name our own place name contains', () => {
    // The measured risk of the rule above, at the real distances: a district's centroid is
    // far from any one place inside it, and distance-only credit is gone well before it.
    // Tsukiji's `chōchō` sits 366m from the fish market, Ueno 492m from the park.
    const district = (distanceLat: number) =>
      geoProximityConfidence(
        { name: 'Tsukiji Outer Market', lat: 35.6614, lng: 139.7697 },
        { name: 'Tsukiji', lat: 35.6614 + distanceLat, lng: 139.7697 },
      );
    expect(isMatchConfident(district(0.0033).confidence)).toBe(false); // ~366m
    expect(isMatchConfident(district(0.0044).confidence)).toBe(false); // ~492m
    // And the classes themselves are now named, so the geo route skips them outright.
    expect(granularityRefusals({ instanceOf: ['Q5327369'] })).toEqual({
      summary: MATCH_REFUSAL.BROADER_TYPE,
    });
  });

  it('is no match at all without coordinates on both sides — the route IS the coordinates', () => {
    expect(
      geoProximityConfidence({ name: 'מוזיאון נזו' }, { name: 'Nezu Museum' }).confidence,
    ).toBe(0);
    expect(geoProximityConfidence(NEZU, { name: 'Nezu Museum' }).confidence).toBe(0);
  });
});

describe('granularityRefusals', () => {
  it('refuses a summary for a watercourse, keeping the image (§11.2)', () => {
    // Meguro River: the entity is right and the article is about the whole river, not the
    // canal-side spot people go to.
    const refusals = granularityRefusals({ instanceOf: ['Q4022'] });
    expect(refusals[ENRICHMENT_FIELD.SUMMARY]).toBe(MATCH_REFUSAL.BROADER_TYPE);
    expect(refusals[ENRICHMENT_FIELD.IMAGE]).toBeUndefined();
  });

  it('refuses on a broad type even when the name matches exactly', () => {
    // The measured case's saved name IS the river's label, so a rule keyed on "does the
    // name differ" would have let it straight through.
    expect(granularityRefusals({ instanceOf: ['Q4022'] })[ENRICHMENT_FIELD.SUMMARY]).toBe(
      MATCH_REFUSAL.BROADER_TYPE,
    );
  });

  it('refuses a summary for a dissolved entity', () => {
    // Tsukiji: the match resolves to the former wholesale market, closed and moved.
    const refusals = granularityRefusals({ instanceOf: ['Q330284'], endedProperties: ['P576'] });
    expect(refusals[ENRICHMENT_FIELD.SUMMARY]).toBe(MATCH_REFUSAL.BROADER_TYPE);
  });

  it('refuses a summary for a chain rather than the branch you are standing at', () => {
    expect(granularityRefusals({ instanceOf: ['Q507619'] })[ENRICHMENT_FIELD.SUMMARY]).toBe(
      MATCH_REFUSAL.BROADER_TYPE,
    );
  });

  it('refuses nothing for the landmarks that matched 14 of 14', () => {
    // A temple, a park, a crossing and a museum are all specific. If this list ever starts
    // refusing these, it has grown past its job.
    for (const instanceOf of [['Q44539'], ['Q22698'], ['Q33506'], ['Q1046088']]) {
      expect(granularityRefusals({ instanceOf })).toEqual({});
    }
  });

  it('refuses nothing for a candidate with no type claims at all', () => {
    expect(granularityRefusals({ instanceOf: [] })).toEqual({});
  });
});

/* ── A PARENTHETICAL ALIAS IS NOT PART OF THE NAME (ADR-0166 §18's amendment) ───────────────
   Owner report, 2026-08-08: Frankfurt Airport never matched. Google's stored name carries an
   appended alias, and the extra tokens dragged a correct match under the 0.8 floor — measured
   at 0.756 against Wikidata's own label, so the entity was READ and then refused. */
describe('nameSimilarity — an appended alias must not lower the score', () => {
  const FRANKFURT = 'נמל התעופה של פרנקפורט (Frankfurter Flughafen – FRA)';

  it('matches the label the search actually returns, where it used to score 0.756', () => {
    const score = nameSimilarity(FRANKFURT, 'נמל התעופה של פרנקפורט');
    expect(score).toBe(1);
    expect(score).toBeGreaterThanOrEqual(MATCH_MIN_NAME_SIMILARITY);
  });

  it('clears the floor for the label variants Wikidata might carry instead', () => {
    for (const label of ['נמל התעופה פרנקפורט', 'נמל התעופה הבינלאומי של פרנקפורט']) {
      expect(nameSimilarity(FRANKFURT, label)).toBeGreaterThanOrEqual(MATCH_MIN_NAME_SIMILARITY);
    }
  });

  it('reads an alias on the CANDIDATE side too', () => {
    expect(nameSimilarity('פרנקפורט', 'פרנקפורט (Frankfurt am Main)')).toBe(1);
  });

  it('never scores a name LOWER than it did before', () => {
    // The raw comparison is still one of the forms considered, so this can only add recall.
    expect(nameSimilarity('Sensō-ji', 'Sensoji')).toBe(1);
    expect(nameSimilarity('Ueno Park', 'Ueno Park')).toBe(1);
  });

  it('leaves the calibrated cases exactly where ADR-0166 §16 measured them', () => {
    // None of these carry a parenthetical, so the fix must not move them at all.
    expect(nameSimilarity('Meiji Jingū / Meiji Shrine', 'Meiji Shrine')).toBeCloseTo(0.816, 3);
    expect(nameSimilarity('Piccadilly Circus', 'Piccadilly Circus tube station')).toBeCloseTo(
      0.707,
      3,
    );
    expect(nameSimilarity('Tsukiji', 'Tsukiji Outer Market')).toBeCloseTo(0.577, 3);
  });

  it('still refuses a genuinely different place that shares the alias shape', () => {
    expect(nameSimilarity('נמל התעופה של פרנקפורט (FRA)', 'נמל התעופה של מינכן')).toBeLessThan(
      MATCH_MIN_NAME_SIMILARITY,
    );
  });

  // The whole point of scoring the raw form as well: sometimes the bracket IS the subject.
  it('keeps the parenthetical when it is the discriminating part', () => {
    expect(nameSimilarity('Terminal 1 (Departures)', 'Terminal 1 (Departures)')).toBe(1);
  });
});

/** The distance veto is untouched by any of it — a same-named place far away is still refused,
 *  which is what makes the recall increase safe (§18's amendment). */
describe('nameProximityConfidence — the veto survives the alias fix', () => {
  it('refuses a perfectly-named candidate 9,000km away', () => {
    const scored = nameProximityConfidence(
      { name: 'נמל התעופה של פרנקפורט (Frankfurter Flughafen – FRA)', lat: 50.03, lng: 8.56 },
      { name: 'נמל התעופה של פרנקפורט', lat: 35.55, lng: 139.78 },
    );
    expect(scored.nameSimilarity).toBe(1);
    expect(scored.confidence).toBe(0);
  });

  it('accepts it at the right coordinates, which is the reported case', () => {
    const scored = nameProximityConfidence(
      { name: 'נמל התעופה של פרנקפורט (Frankfurter Flughafen – FRA)', lat: 50.0379, lng: 8.5622 },
      { name: 'נמל התעופה של פרנקפורט', lat: 50.0379, lng: 8.5622 },
    );
    expect(scored.confidence).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_THRESHOLD);
  });
});

describe('tokensNear — one word, two transliterations (§22, field report #41)', () => {
  // The measured case: Google's Hebrew for Gullfoss is `גולפוס`, Wikidata's label is `גאלפוס`,
  // and the Hebrew Wikipedia's article is `גוטלפוס`. Token-set overlap scored every pair 0.
  it('is true for two spellings of the same borrowed word', () => {
    expect(tokensNear('גולפוס', 'גאלפוס')).toBe(true);
    expect(tokensNear('גולפוס', 'גוטלפוס')).toBe(true);
  });

  it('is false for short words, where one letter is a different word', () => {
    // The whole false-positive budget: at four letters a single edit is not a spelling variant.
    expect(tokensNear('bali', 'bari')).toBe(false);
    expect(tokensNear('ueno', 'ueda')).toBe(false);
    expect(tokensNear('park', 'part')).toBe(false);
    expect(tokensNear('oia', 'oea')).toBe(false);
  });

  it('allows a second edit only in a word long enough to survive it', () => {
    expect(tokensNear('suvarnabhumi', 'suvarnaphumi')).toBe(true);
    expect(tokensNear('reykjavik', 'reykjanes')).toBe(false);
  });

  it('is false for words that merely start alike', () => {
    expect(tokensNear('tsukiji', 'tsukishima')).toBe(false);
    expect(tokensNear('ueno', 'uenohara')).toBe(false);
  });

  it('is knowingly true for the long near-pairs the FLOOR has to settle', () => {
    // `Kensington` and `Kennington` are two real London places one edit apart, and this rule
    // cannot tell them apart — nor is it asked to.
    expect(tokensNear('kensington', 'kennington')).toBe(true);
    // 4.9km apart: INSIDE `MATCH_FAR_METERS`, so the distance veto does not fire and the name
    // floor is the only thing refusing them. That is why a near word is worth less than a whole
    // one — see `NEAR_TOKEN_CREDIT`.
    expect(
      nameProximityConfidence(
        { name: 'Kensington', lat: 51.4988, lng: -0.1749 },
        { name: 'Kennington', lat: 51.4879, lng: -0.1053 },
      ).confidence,
    ).toBe(0);
  });

  it('reaches the scorer, so a near-spelled name is not scored 0', () => {
    // What `מפלי גולפוס` against Wikidata's `גאלפוס` used to be worth: nothing at all.
    expect(nameSimilarity('מפלי גולפוס', 'גאלפוס')).toBeGreaterThan(0);
  });

  it('corroborates but never carries — a lone near word stays under the floor', () => {
    // The false-positive budget in one line: two long words one edit apart cannot match on the
    // name, however long they are. A name that agrees about its OTHER words is lifted.
    expect(nameSimilarity('Kensington', 'Kennington')).toBeLessThan(MATCH_MIN_NAME_SIMILARITY);
    expect(nameSimilarity('Fushimi Inari Taisha', 'Fushimi Inari Taisya')).toBeGreaterThan(
      MATCH_MIN_NAME_SIMILARITY,
    );
  });
});

describe('descriptorAwareSimilarity — the word that names what the candidate IS (§22)', () => {
  it('reads Google’s appended feature type as agreement, not disagreement', () => {
    expect(descriptorAwareSimilarity('Brúarfoss Waterfall', 'Brúarfoss', ['waterfall'])).toBe(1);
    expect(descriptorAwareSimilarity('Kerið Crater', 'Kerið', ['volcanic crater'])).toBe(1);
  });

  it('reads a Hebrew descriptive name against the class’s own Hebrew label', () => {
    // `מפלי` is the construct plural of `מפל`, the first word of `Q34038`'s Hebrew label —
    // and `גולפוס`/`גאלפוס` then meet through `tokensNear`.
    // `גולפוס` against `גאלפוס` is a spelling variant, which corroborates rather than carries —
    // so this clears 0 and stays under the floor, and the distance decides, as it did for Kerið.
    expect(descriptorAwareSimilarity('מפלי גולפוס', 'גאלפוס', ['מפל מים'])).toBe(NEAR_CREDIT);
    expect(nameCanRefuse('מפלי גולפוס', { name: 'גאלפוס', classNouns: ['מפל מים'] })).toBe(false);
  });

  it('KEEPS refusing the district our own name contains (§11.2’s motivating case)', () => {
    // `Outer` and `Market` do not name what a `chōchō` is, so nothing is stripped and the
    // deny-list case is untouched. This is the guard that made the rule safe to build.
    expect(
      descriptorAwareSimilarity('Tsukiji Outer Market', 'Tsukiji', ['chōchō', 'neighborhood']),
    ).toBeCloseTo(0.5774, 4);
  });

  it('is asymmetric — a CANDIDATE’s type word is never stripped (§16)', () => {
    // Strip both sides and `Piccadilly Circus tube station` becomes `Piccadilly Circus tube`,
    // 0.816 against the square: §16's exact defect, reopened. Only our name may be shortened.
    expect(
      descriptorAwareSimilarity('Piccadilly Circus', 'Piccadilly Circus tube station', [
        'London Underground station',
      ]),
    ).toBeCloseTo(0.7071, 4);
  });

  it('does not strip a name down to nothing', () => {
    // A place actually saved as `Waterfall` is a name, not a descriptor.
    expect(descriptorAwareSimilarity('Waterfall', 'Brúarfoss', ['waterfall'])).toBe(0);
  });

  it('scores exactly as before when the caller knows no classes', () => {
    expect(descriptorAwareSimilarity('Kerið Crater', 'Kerið', undefined)).toBeCloseTo(0.7071, 4);
    expect(descriptorAwareSimilarity('Kerið Crater', 'Kerið', [])).toBeCloseTo(0.7071, 4);
  });

  it('lets a type noun promote a coordinate match to a NAMED one', () => {
    // The difference this makes downstream: 0.707 is refused, 1.0 blends with the distance and
    // matches on the name route, which outranks a distance-only identity (§12.3).
    const scored = nameProximityConfidence(
      { name: 'Brúarfoss Waterfall', lat: 64.2646, lng: -20.5145 },
      { name: 'Brúarfoss', classNouns: ['waterfall'], lat: 64.2645, lng: -20.5165 },
    );
    expect(scored.nameSimilarity).toBe(1);
    expect(isMatchConfident(scored.confidence)).toBe(true);
  });

  it('still refuses the same name in the wrong country, type noun or not', () => {
    // Brúarfoss's own namesake, 130km away on the Hítará — the distance veto is untouched.
    const scored = nameProximityConfidence(
      { name: 'Brúarfoss Waterfall', lat: 64.2646, lng: -20.5145 },
      { name: 'Brúarfoss', classNouns: ['waterfall'], lat: 64.7317, lng: -22.1852 },
    );
    expect(scored.confidence).toBe(0);
  });
});
