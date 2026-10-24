// **A PASSED ROW'S PHOTOGRAPH RECEDES WITH ITS CARD** (ADR-0219 §5), asserted over the parsed
// stylesheet because jsdom can see nothing else: it loads no CSS, so `filter` is neither computed
// nor rendered and a `getComputedStyle` read here would report the empty string whether the rule
// exists or not. The shape is `now-marker.contract.test.ts`'s — the sheet is the artefact under
// test, and the assertion is that a rule with the right *selector* exists.
//
// What could actually regress is the SELECTOR, and each half of it is a decision:
//
//  - **`passed`, not "settled".** `done` is a positive record (ADR-0044) and a record is not a
//    fade, so a rule that greyed both would be saying the wrong thing about the state anybody
//    deliberately answered.
//  - **the photo's `img`, not the badge.** `.wp-placebadge-photo` also hosts the white hairline
//    ring that holds the crop against a bright sky (ADR-0167 §11.2); greying the badge would take
//    the ring with it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('./event-card.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule in the sheet as `[selectorList, body]`, whitespace normalised. */
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
  selector: m[1].replace(/\s+/g, ' ').trim(),
  body: m[2].replace(/\s+/g, ' ').trim(),
}));

const withDeclaration = (needle: string) => rules.filter((r) => r.body.includes(needle));

describe('event-card · a passed row’s photo greys with the card', () => {
  it('greys the photo INSIDE a passed card, and nothing wider', () => {
    const greyed = withDeclaration('grayscale(1)');
    expect(greyed).toHaveLength(1);
    expect(greyed[0].selector).toBe('.wp-event.passed .wp-placebadge-photo img');
  });

  it('leaves a done row in colour — a record is not a fade (ADR-0044)', () => {
    // An absence assertion against a stale literal is vacuous (`frontend/CLAUDE.md`), so this
    // asks the parsed selector rather than searching the text for a word.
    const greyed = withDeclaration('grayscale(1)').map((r) => r.selector);
    expect(greyed.some((sel) => sel.includes('.done'))).toBe(false);
  });

  it('keeps the card’s own recession, which the filter is added to rather than replacing', () => {
    // The photo needs BOTH: 0.66 alone leaves a full-contrast picture inside a faded card, and
    // grayscale alone leaves a sharp grey picture inside one.
    const faded = rules.find((r) => r.selector === '.wp-event.passed');
    expect(faded?.body).toContain('opacity: 0.66');
  });
});
