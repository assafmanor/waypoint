import { describe, expect, it } from 'vitest';
import { ltrIsolate, measure, withoutBidiControls } from './bidi';

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
