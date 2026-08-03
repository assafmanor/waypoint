import { describe, expect, it } from 'vitest';
import { shortPlaceLabel } from './place-label';

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
