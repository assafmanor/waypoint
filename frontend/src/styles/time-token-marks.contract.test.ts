// **THE TIME CHIP TAKES ITS 5px FROM AN EMPTY LINE, NOT FROM A GLYPH** (ADR-0231 §1, amended
// 2026-09-16 and 2026-09-18). `.wp-event-time.is-token` paints 5px above the digits by negative
// margin so the row measures what the plain span measured (⁦69px⁩). What that margin consumes is
// `.wp-event-m`'s 3px margin plus the 2px row gap — a line that always renders and is 0px tall on
// an unmarked row. Two things can stand in that space instead, and each was reported from the
// day: a note/document/task glyph on the marks line (the Stokksnes cluster), and the conflict
// flag a soft row carries when it overlaps a hard one (Selfoss under מפלי דטיפוס) — a THIRD
// line in the same cell, which the marks selector does not see.
//
// jsdom loads no CSS, so this asserts the repair rather than the geometry: the token keeps its
// negative margin, and a face carrying either occupant takes it back at the top. The geometry
// itself was measured in Chromium against the real stylesheets: plain ⁦69⁩ → ⁦69⁩,
// two-line title ⁦88⁩ → ⁦88⁩, marked ⁦82⁩ → ⁦87⁩, flagged ⁦79⁩ → ⁦84⁩ — each with the
// chip 2px below the line above it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('../ui/domain/event-card.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
  selector: m[1].replace(/\s+/g, ' ').trim(),
  body: m[2].replace(/\s+/g, ' ').trim(),
}));
// A rule is found by any MEMBER of its selector list: the give-the-5px-back rule now names
// two occupants of the title cell, and a whole-string match would have read as "the rule is
// gone" the moment the second was added.
const rule = (selector: string) =>
  rules.find((r) => r.selector.split(',').some((s) => s.trim() === selector));

describe('event-card · the time token above a marks line', () => {
  it('the token still paints into the face padding by a negative block margin', () => {
    expect(rule('.wp-event-time.is-token')?.body).toContain('margin-block: -5px');
  });

  // Both occupants of the title cell, one test: whichever of them renders, the chip must stop
  // at the face's own padding instead of climbing into the line above it.
  it.each([
    [
      'a marks line with a glyph',
      '.wp-event-face:has(.wp-event-m:not(:empty)) .wp-event-time.is-token',
    ],
    ['the conflict flag', '.wp-event-face:has(.wp-event-conflict-flag) .wp-event-time.is-token'],
  ])('%s gives the top 5px back', (_what, selector) => {
    const scoped = rule(selector);
    expect(scoped).toBeDefined();
    expect(scoped?.body).toContain('margin-block-start: 0');
    // The bottom stays negative: below the chip is the face's own padding on every row.
    expect(scoped?.body).not.toContain('margin-block:');
    expect(scoped?.body).not.toContain('margin-block-end');
  });

  // Owner, same day, Plan and Trip side by side: "the right alignment is wrong". The chip's
  // BOX sits on the title's start edge as `button.bld-time`'s does; the digits take the inset.
  // `margin-inline-start: calc(var(--space-3) - 8px)` aligned the digits and pushed the border
  // 8px into the gutter, so the token must not override the plain line's start margin at all.
  it('the token’s box starts where the plain when line starts — no negative inline offset', () => {
    expect(rule('.wp-event-time')?.body).toContain('margin-inline-start: var(--space-3)');
    expect(rule('.wp-event-time.is-token')?.body).not.toContain('margin-inline-start');
  });

  it('the marks line keeps the 3px margin the plain row’s chip is designed to consume', () => {
    expect(rule('.wp-event-m')?.body).toContain('margin-top: 3px');
  });
});
