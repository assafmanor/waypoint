import { describe, expect, it } from 'vitest';
import { baseDirection, ltrIsolate, measure, withoutBidiControls } from './bidi';

const LRI = '⁦';
const PDI = '⁩';

describe('ltrIsolate', () => {
  it('wraps a run in an LTR isolate so its own order survives an RTL flow', () => {
    expect(ltrIsolate('−3')).toBe(`${LRI}−3${PDI}`);
    expect(ltrIsolate(9)).toBe(`${LRI}9${PDI}`);
  });

  it('adds nothing visible', () => {
    expect(withoutBidiControls(ltrIsolate('+5:30'))).toBe('+5:30');
  });
});

describe('measure (number before its Hebrew unit)', () => {
  it('puts the number first and the unit last, in logical order', () => {
    expect(withoutBidiControls(measure(9, 'ק״מ'))).toBe('9 ק״מ');
    expect(withoutBidiControls(measure('−3', 'ש׳'))).toBe('−3 ש׳');
  });

  it('isolates only the number, leaving the unit in the RTL flow', () => {
    // The unit outside the isolate is what makes the token RTL (and what makes
    // `dir="auto"` resolve it RTL), so the number renders in front of it.
    expect(measure(9, 'ק״מ')).toBe(`${LRI}9${PDI} ק״מ`);
  });
});

describe('withoutBidiControls', () => {
  it('strips isolates, embeddings, and marks but keeps the text', () => {
    expect(withoutBidiControls('‪9 ק״מ‬‎')).toBe('9 ק״מ');
  });

  it('leaves plain text untouched', () => {
    expect(withoutBidiControls('9 ק״מ')).toBe('9 ק״מ');
  });
});

// **THE REPORTED DEFECT** (owner, 2026-08-22): a Hebrew note read from the wrong end on the
// note's full screen, and the tell was that its title was fine. `dir="auto"` resolves from
// the first strong character and nothing else, so the `T` of `TL;DR` laid out 26 Hebrew
// letters as if they were English.
describe('baseDirection', () => {
  const REPORTED = 'TL;DR — מה לעשות כדי להטיס DJI Mini 5 Pro כחוק באיסלנד';

  it('calls a Hebrew note Hebrew even when it opens with Latin', () => {
    expect(baseDirection(REPORTED)).toBe('rtl');
  });

  it('calls an English note English even when it carries a Hebrew word', () => {
    expect(
      baseDirection('Check the wifi password with the front desk, the סיסמה is on the card'),
    ).toBe('ltr');
  });

  it('reads a single-script text the obvious way', () => {
    expect(baseDirection('הכניסה מהחניון האחורי')).toBe('rtl');
    expect(baseDirection('Back entrance, by the flower shop')).toBe('ltr');
  });

  // Hebrew-first app (design-language.md), so a genuinely balanced text is a Hebrew one with
  // a lot of Latin in it.
  it('gives a tie to Hebrew', () => {
    expect(baseDirection('abcd אבגד')).toBe('rtl');
  });

  // Digits and punctuation are bidi-neutral — counting them would let a price list decide.
  it('answers undefined when there are no letters, so the element inherits the page', () => {
    expect(baseDirection('17:00 · 12.50 · +81 3-1234-5678')).toBeUndefined();
    expect(baseDirection('')).toBeUndefined();
    expect(baseDirection('🍜 📌')).toBeUndefined();
  });

  it('does not let a numeric run outvote the letters around it', () => {
    expect(baseDirection('הפיקדון 5000 ין במזומן בלבד')).toBe('rtl');
  });
});
