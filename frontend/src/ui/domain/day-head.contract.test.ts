// **The day head's rules describe its LINES, so they may only match its own children** — a
// cascade regression test, in the shape `tasks-avatar-size.test.ts` already established for
// this class of defect (jsdom does no layout, so the assertion is over the parsed stylesheet
// rather than a rect).
//
// Reported as _"the day titles has gotten a little messy: too many line breaks, questionable
// ordering of the details"_ (owner, 2026-08-31). The copy column's `span` rule is (0,1,1) and
// sets `display: block; color: var(--muted)` at the micro size — right for the header's three
// lines, and it also reached every span NESTED in one. `.sh-stay-when` composes its line out of
// `.sh-said` and `.sh-time` spans, so `צ׳ק-אאוט עד 11:00` stacked as three grey blocks and lost
// the amber the clock is owed (ADR-0028 rule 4).
//
// This is the third thing that descendant selector caught that it never meant to; the other
// two are documented at `.sh-stay .icon` and `.sh-stay-when`, and both were repaired by working
// AROUND the specificity rather than narrowing it.
//
// **It moved with the head** (ADR-0219 §2): the rules are `day-head.css`'s now and the reader
// consumes the component, so the guard reads BOTH sheets — the combinator lives with the
// component, the stay line it protects is still the reader's own.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css =
  readFileSync(join(process.cwd(), 'src/ui/domain/day-head.css'), 'utf8') +
  readFileSync(join(process.cwd(), 'src/screens/shared-itinerary.css'), 'utf8');

// Comments FIRST: the prose above these rules names the very selectors under test.
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = [...bare.matchAll(/(^|\})\s*([^{}@]+?)\s*\{/gm)]
  .flatMap((m) => m[2].split(','))
  .map((s) => s.trim())
  .filter(Boolean);

describe('the day header styles only its own lines', () => {
  it('reaches the copy column’s children by the child combinator, never as descendants', () => {
    const reaching = selectors.filter((s) => /\.wp-dayhead-copy\s/.test(s));
    expect(reaching.length).toBeGreaterThan(0);
    for (const rule of reaching) expect(rule).toMatch(/\.wp-dayhead-copy\s*>/);
  });

  it('keeps the stay’s clock line amber and wrapping, which the muted block would undo', () => {
    const i = bare.indexOf('.wp-dayhead-copy > .sh-stay-when {');
    expect(i, '.wp-dayhead-copy > .sh-stay-when missing').toBeGreaterThan(-1);
    const block = bare.slice(i, bare.indexOf('}', i));
    expect(block).toContain('var(--amber-deep)');
    expect(block).toContain('white-space: normal');
  });
});
