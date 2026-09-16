// **THE TIME CHIP TAKES ITS 5px FROM AN EMPTY LINE, NOT FROM A GLYPH** (ADR-0231 §1, amended
// 2026-09-16). `.wp-event-time.is-token` paints 5px above the digits by negative margin so the
// row measures what the plain span measured (⁦69px⁩). What that margin consumes is `.wp-event-m`'s
// 3px margin plus the 2px row gap — a line that always renders and is 0px tall on an unmarked
// row. On a row with a note, a document or a task the same 5px is the glyph's, and the chip sat
// 3px into it (owner screenshot, the Stokksnes cluster).
//
// jsdom loads no CSS, so this asserts the repair rather than the geometry: the token keeps its
// negative margin, and a face whose marks line has children takes it back at the top. The
// geometry itself was measured in Chromium against the real stylesheets: plain ⁦69⁩ → ⁦69⁩,
// two-line title ⁦88⁩ → ⁦88⁩, marked ⁦82⁩ → ⁦87⁩ with the chip 2px below the glyph.
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
const rule = (selector: string) => rules.find((r) => r.selector === selector);

describe('event-card · the time token above a marks line', () => {
  it('the token still paints into the face padding by a negative block margin', () => {
    expect(rule('.wp-event-time.is-token')?.body).toContain('margin-block: -5px');
  });

  it('a face whose marks line is not empty gives the top 5px back to the glyphs', () => {
    const scoped = rule('.wp-event-face:has(.wp-event-m:not(:empty)) .wp-event-time.is-token');
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
