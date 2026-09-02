// **A TRANSPARENT WRAPPER BREAKS EVERY CHILD COMBINATOR IT LANDS INSIDE**, and nothing in the
// unit suite can see it: jsdom loads no CSS, so a row that silently gets its border and its
// margin back inside a journey block, or a card the day's thread starts painting over, is a
// green test and a visual defect.
//
// `NowMarker` (ADR-0217) wraps whichever row the moment is inside, at any depth — so
// `.journey > .wp-event` becomes `.journey > .now-here > .wp-event` on a leg of a journey run
// that happens to be running, and `.day-thread > .wp-event` becomes
// `.day-thread > .now-here > .wp-event` on a carried flight. Both were found by grepping the
// stylesheets for child combinators over the row families the mark can wrap, which is the
// "count the call sites" rule in root `CLAUDE.md`; ADR-0212 §6's build log records the identical
// defect one rule away, from the identical cause.
//
// This asserts the repair rather than the geometry: every such rule names the wrapper too.
// A fifth family added later fails here instead of on a phone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

const dayJoinCss = read('../ui/domain/day-join.css');
const markerCss = read('../ui/domain/now-marker.css');

/** Every selector list in a sheet, normalised to single spaces. */
const selectorLists = (css: string) =>
  [...css.matchAll(/([^{}]+)\{[^}]*\}/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());

/** The lists that reach a row family through a child combinator from `host`. */
const childRules = (css: string, host: string, family: string) =>
  selectorLists(css).filter((list) =>
    list.split(',').some((sel) => sel.trim().startsWith(`${host} > ${family}`)),
  );

describe('now-marker · the wrapper is transparent to the day’s child combinators', () => {
  // `.journey > .wp-event` strips a leg's border, radius and margin so it reads as a ROW of the
  // block (ADR-0159 §3). A wrapper in between hands all three back, inside the block.
  it('lets a journey block still reach a leg the mark has wrapped', () => {
    const rules = childRules(dayJoinCss, '.journey', '.wp-event');
    expect(rules.length).toBeGreaterThan(0);
    for (const list of rules) {
      expect(list).toContain('.journey > .now-here > .wp-event');
    }
  });

  // `.day-thread > .wp-event` lifts the card above the thread's own rule so the line paints
  // BEHIND it (ADR-0212 §1). Without the wrapper in this list the thread paints over the card.
  it('lets the day’s thread still reach a card the mark has wrapped', () => {
    const rules = childRules(dayJoinCss, '.day-thread', '.wp-event');
    expect(rules.length).toBeGreaterThan(0);
    for (const list of rules) {
      expect(list).toContain('.day-thread > .now-here');
    }
  });

  // `.journey` clips for its own radius, so a mark that reaches past its box has no arrow.
  it('keeps the mark inside a journey block, which clips', () => {
    expect(dayJoinCss).toMatch(/\.journey \.now-here \{[^}]*--now-bleed:\s*0px/);
    const journeyRule = dayJoinCss.match(/\.journey \{([^}]*)\}/)?.[1] ?? '';
    // If this stops clipping, the rule above is dead weight rather than a fix — and the mark
    // should go back to the day's own bleed.
    expect(journeyRule).toMatch(/overflow:\s*hidden/);
  });

  // Both day surfaces render the same rows off the same derivation (ADR-0159 §1), so a bleed
  // named for only one of their braces is the split ADR-0171 §10e exists to repair.
  it('gives every nesting brace on both surfaces its own bleed', () => {
    for (const brace of ['.nest-kids', '.cluster-kids', '.bld-nest-kids']) {
      expect(markerCss).toContain(`${brace} .now-here`);
    }
  });
});
