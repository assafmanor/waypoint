import { describe, expect, it } from 'vitest';
import { ENRICHMENT_FIELD, MATCH_CONFIDENCE_THRESHOLD, MATCH_REFUSAL } from '@waypoint/shared';
import {
  granularityRefusals,
  isMatchConfident,
  nameProximityConfidence,
  nameSimilarity,
  proximityScore,
} from './match';

// Real coordinates and names from the coverage spike dataset
// (docs/planning/2026-08-04-enrichment-coverage-spike-data.csv).
const SENSOJI = { name: 'Sensō-ji', lat: 35.7148, lng: 139.7967 };
const MEIJI = { name: 'Meiji Jingū / Meiji Shrine', lat: 35.6764, lng: 139.6993 };
const SHIBUYA_CROSSING = { name: 'Shibuya Crossing', lat: 35.6595, lng: 139.7005 };

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
