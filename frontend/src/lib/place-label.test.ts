import { describe, expect, it } from 'vitest';
import type { DeliveredEnrichmentFields } from '@waypoint/shared';
import { derivedPlaceLabel, placeLabelOf, shortPlaceLabel, shortRoute } from './place-label';

/** The provenance every stored enrichment value carries (ADR-0166 §4) — irrelevant to the
 *  label and required by the shape, so it is written once here. */
const PROVENANCE = {
  source: 'wikidata',
  license: 'CC0',
  fetchedAt: '2026-08-08T00:00:00.000Z',
  confidence: 1,
  method: 'name_proximity',
  ref: 'Q-airport-tlv',
} as const;

describe('shortPlaceLabel', () => {
  // The point of the rule: it strips generic CATEGORY words, so it handles
  // places it has never "seen" — no per-place dictionary anywhere.
  it('drops Hebrew airport/station category phrasing', () => {
    expect(shortPlaceLabel('נמל התעופה בן גוריון')).toBe('בן גוריון');
    expect(shortPlaceLabel('נמל התעופה הבינלאומי קפלאוויק')).toBe('קפלאוויק');
    expect(shortPlaceLabel('נמל התעופה הבינלאומי נריטה')).toBe('נריטה');
    expect(shortPlaceLabel('שדה התעופה רמון')).toBe('רמון');
    expect(shortPlaceLabel('תחנת הרכבת המרכזית חיפה')).toBe('חיפה');
    expect(shortPlaceLabel('תחנת רכבת סבידור מרכז')).toBe('סבידור מרכז');
    expect(shortPlaceLabel('תחנת האוטובוסים המרכזית תל אביב')).toBe('תל אביב');
  });

  it('drops English trailing category phrasing', () => {
    expect(shortPlaceLabel('Keflavík International Airport')).toBe('Keflavík');
    expect(shortPlaceLabel('Charles de Gaulle Airport')).toBe('Charles de Gaulle');
    expect(shortPlaceLabel('Tokyo Station')).toBe('Tokyo');
    expect(shortPlaceLabel('Kyoto Railway Station')).toBe('Kyoto');
    expect(shortPlaceLabel('Amsterdam Central Station')).toBe('Amsterdam');
  });

  it('prefers the more specific phrase (International Airport over Airport)', () => {
    // Either rule would leave a valid label; the longer strip is the useful one.
    expect(shortPlaceLabel('Haneda International Airport')).toBe('Haneda');
  });

  it('leaves a name with no category phrasing alone', () => {
    for (const name of [
      'מוזיאון תל אביב לאמנות',
      'איצ׳ירן ראמן שיבויה',
      'Louvre Museum',
      'Hotel Sacher',
      '東京駅', // no patterns for this script — passes through, never mangled
    ]) {
      expect(shortPlaceLabel(name)).toBe(name);
    }
  });

  it('never strips a name down to nothing — the category phrase alone is kept', () => {
    expect(shortPlaceLabel('Airport')).toBe('Airport');
    expect(shortPlaceLabel('Station')).toBe('Station');
    expect(shortPlaceLabel('נמל התעופה')).toBe('נמל התעופה');
    expect(shortPlaceLabel('תחנת הרכבת המרכזית')).toBe('תחנת הרכבת המרכזית');
  });

  it('trims surrounding whitespace', () => {
    expect(shortPlaceLabel('  נמל התעופה בן גוריון  ')).toBe('בן גוריון');
  });
});

describe('shortPlaceLabel — leftover-modifier guard', () => {
  it('keeps a name that is only the category phrase plus its qualifier', () => {
    expect(shortPlaceLabel('נמל התעופה הבינלאומי')).toBe('נמל התעופה הבינלאומי');
    expect(shortPlaceLabel('International Airport')).toBe('International Airport');
    expect(shortPlaceLabel('Central Station')).toBe('Central Station');
  });

  // A name ending in the particle has no whitespace after it for the pattern's optional
  // group to consume, so the strip leaves a bare `של` — two characters, which clears
  // MIN_LABEL_CHARS and would otherwise be returned as if it were a place.
  it('keeps a name that is the category phrase plus a dangling particle', () => {
    expect(shortPlaceLabel('נמל התעופה של')).toBe('נמל התעופה של');
  });
});

// Google's Hebrew names come in BOTH bindings, and the genitive one shipped broken: the
// category phrase was stripped without the particle that binds it to the name, so the label
// opened with "of". Seen on a device, in the lifted hero's `הבא בתור` title.
describe('shortPlaceLabel — the genitive binding', () => {
  it('takes `של` with the category phrase instead of leaving it dangling', () => {
    expect(shortPlaceLabel('נמל התעופה של פרנקפורט')).toBe('פרנקפורט');
    expect(shortPlaceLabel('שדה התעופה של איסטנבול')).toBe('איסטנבול');
    expect(shortPlaceLabel('תחנת הרכבת של ברלין')).toBe('ברלין');
    expect(shortPlaceLabel('תחנת האוטובוסים המרכזית של רומא')).toBe('רומא');
  });

  // The exact string from the report, parenthetical and all. The bracketed alias is NOT
  // stripped — that is a separate decision about what counts as noise, and this change is
  // only about the particle.
  it('is the reported case, minus the particle and nothing else', () => {
    expect(shortPlaceLabel('נמל התעופה של פרנקפורט (Frankfurter Flughafen – FRA)')).toBe(
      'פרנקפורט (Frankfurter Flughafen – FRA)',
    );
  });

  it('leaves the non-genitive binding exactly as it was', () => {
    expect(shortPlaceLabel('נמל התעופה בן גוריון')).toBe('בן גוריון');
    expect(shortPlaceLabel('תחנת הרכבת המרכזית חיפה')).toBe('חיפה');
  });
});

/* ── THE PRECEDENCE CHAIN (ADR-0166 §18, field report #23) ─────────────────────────────────
   nickname → derived `City · IATA` → the stripping above. */
describe('derivedPlaceLabel', () => {
  const tlv: DeliveredEnrichmentFields = {
    iata: { ...PROVENANCE, value: 'TLV' },
    servedCity: {
      he: { ...PROVENANCE, value: 'תל אביב', lang: 'he' },
      en: { ...PROVENANCE, value: 'Tel Aviv', lang: 'en' },
    },
  };

  it('derives City · IATA when the pipe resolved both halves', () => {
    expect(derivedPlaceLabel({ name: 'נמל התעופה בן גוריון' }, tlv)).toBe('תל אביב · TLV');
  });

  it('prefers the Hebrew city, and falls back to English where there is no Hebrew label', () => {
    const kef: DeliveredEnrichmentFields = {
      iata: { ...PROVENANCE, value: 'KEF' },
      servedCity: { en: { ...PROVENANCE, value: 'Keflavík', lang: 'en' } },
    };
    expect(derivedPlaceLabel({ name: 'Keflavík International Airport' }, kef)).toBe(
      'Keflavík · KEF',
    );
  });

  // **The whole reason a manual override exists** (§18): Ben Gurion's `P931` lists Tel Aviv
  // AND Jerusalem at equal rank, so the derived city is a defensible guess and not a fact.
  // A person's answer is not a tie-break — it replaces the question.
  it('lets a nickname win outright over a fully resolved derivation', () => {
    expect(derivedPlaceLabel({ name: 'נמל התעופה בן גוריון', nickname: 'נתב״ג' }, tlv)).toBe(
      'נתב״ג',
    );
  });

  it('ignores a nickname that is only whitespace — that is a cleared field, not a label', () => {
    expect(derivedPlaceLabel({ name: 'נמל התעופה בן גוריון', nickname: '   ' }, tlv)).toBe(
      'תל אביב · TLV',
    );
  });

  it('derives NOTHING from half an answer, so the stripping stays in charge', () => {
    // A code with no city names nothing to someone who does not fly often, and a city with no
    // code is what the stripping already approximates. Both or neither.
    expect(
      derivedPlaceLabel(
        { name: 'נמל התעופה בן גוריון' },
        { iata: { ...PROVENANCE, value: 'TLV' } },
      ),
    ).toBeUndefined();
    expect(
      derivedPlaceLabel({ name: 'נמל התעופה בן גוריון' }, { servedCity: tlv.servedCity }),
    ).toBe(undefined);
    expect(derivedPlaceLabel({ name: 'קפה בלו בוטל' }, {})).toBeUndefined();
    expect(derivedPlaceLabel(undefined)).toBeUndefined();
  });
});

describe('placeLabelOf — the whole chain for one place', () => {
  const labels = { 'p-tlv': 'תל אביב · TLV' };

  it('takes the derived label when there is one', () => {
    expect(placeLabelOf(labels, 'p-tlv', 'נמל התעופה בן גוריון')).toBe('תל אביב · TLV');
  });

  it('falls through to the stripped name when there is not', () => {
    expect(placeLabelOf(labels, 'p-nrt', 'נמל התעופה הבינלאומי נריטה')).toBe('נריטה');
    expect(placeLabelOf({}, undefined, 'Tokyo Station')).toBe('Tokyo');
    expect(placeLabelOf({}, 'p-nrt', undefined)).toBeUndefined();
  });
});

describe('shortRoute — a resolved label is not stripped again', () => {
  it('returns a derived endpoint untouched and shortens the other', () => {
    expect(
      shortRoute({
        from: 'נמל התעופה בן גוריון',
        to: 'נמל התעופה הבינלאומי קפלאוויק',
        fromLabel: 'תל אביב · TLV',
      }),
    ).toEqual({ from: 'תל אביב · TLV', to: 'קפלאוויק' });
  });

  it('leaves a NICKNAME alone even when it looks like category noise', () => {
    // A nickname is not ours to edit: `שדה התעופה של אמא` is what a person calls the place,
    // and stripping it would answer with `של אמא`.
    expect(shortRoute({ from: 'X', fromLabel: 'שדה התעופה של אמא' }).from).toBe(
      'שדה התעופה של אמא',
    );
  });
});
