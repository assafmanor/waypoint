// **`PlaceKnowledge` HAS TWO HOSTS AND ONE SHEET** (ADR-0219 §6), and the split between them is
// what this guards. Its base rules left `screens/map.css` when the event read became the second
// host; what stayed there is the geometry that lays the block out ON THE MAP'S CARD — the grid
// whose notes list is the one scrolling track, which is a fact about a card pinned over a canvas
// and about nothing else.
//
// jsdom loads no CSS, so nothing in the unit suite can see a rule that came back to the wrong
// sheet: the block would render, the classes would all be there, and it would lay out wrong on
// one of the two hosts. The sheets are the artefact under test, in the shape
// `now-marker.contract.test.ts` and `day-head.contract.test.ts` already use.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

const knowledgeCss = read('./place-knowledge.css');
const mapCss = read('../../screens/map.css');

/** Every selector list in a sheet, normalised to single spaces. */
const selectors = (css: string) =>
  [...css.matchAll(/([^{}]+)\{[^}]*\}/g)].flatMap((m) =>
    m[1].split(',').map((sel) => sel.replace(/\s+/g, ' ').trim()),
  );

/** The block's own classes — what the component renders, wherever it renders it. */
const BASE = ['.map-sum', '.map-sum-lang', '.map-sum-t', '.map-hero', '.map-credit'];

describe('place-knowledge · the base rules moved, the Map’s layout did not', () => {
  it('carries a base rule for every class the block renders', () => {
    const own = selectors(knowledgeCss);
    for (const cls of BASE) {
      expect(own, `${cls} has no base rule`).toContain(cls);
    }
    // The exit control and the two clamp states came with them.
    expect(own).toContain('.map-know-more');
    expect(own.some((sel) => sel.includes('.map-sum.is-decide'))).toBe(true);
    expect(own.some((sel) => sel.includes('.map-sum.is-open'))).toBe(true);
  });

  it('leaves no bare base rule behind in the Map’s sheet', () => {
    // A bare `.map-hero {` back in `map.css` is the regression this file exists for: it would
    // win nothing on the Map (the rules are identical) and silently diverge for the read.
    const strays = selectors(mapCss).filter((sel) => BASE.includes(sel));
    expect(strays).toEqual([]);
  });

  it('keeps the Map card’s own layout in the Map’s sheet', () => {
    // `.map-placecard:has(.map-hero) > .place` is the canvas card's grid, and it must NOT follow
    // the block to a sheet every host imports — a column elsewhere would inherit a grid it has
    // no rows for.
    const cardRules = selectors(mapCss).filter((sel) => sel.startsWith('.map-placecard:has('));
    expect(cardRules.length).toBeGreaterThan(0);
    expect(selectors(knowledgeCss).some((sel) => sel.includes('.map-placecard'))).toBe(false);
  });

  it('gives a plain column the flex row the block’s `flex-basis: 100%` needs', () => {
    // Every base rule sets `flex-basis: 100%`, because on the Map these are wrapped items in
    // `.place`'s flex row. A host that is a column supplies one — that container IS the whole of
    // what the second host needed, which is what made the extraction worth doing.
    expect(selectors(knowledgeCss)).toContain('.wp-read-know');
    const block = knowledgeCss.slice(knowledgeCss.indexOf('.wp-read-know {'));
    expect(block).toContain('display: flex');
    expect(block).toContain('flex-wrap: wrap');
  });
});
