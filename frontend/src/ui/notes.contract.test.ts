// A CSS contract test, in the shape `styles/exit-animations.contract.test.ts` established
// and for its stated reason: **jsdom has no CSS engine.** `HostNotes.test.tsx` can assert
// that a body reaches the DOM with its newlines intact, and cannot see that the default
// `white-space: normal` then collapses them on screen — which is exactly the round trip
// this rule cost. Enter was made a newline (ADR-0152 §6b's 2026-08-07 amendment), the note
// was written and stored correctly, and it rendered as one line, so the reversal looked
// like it had not shipped at all.
//
// No jsdom here: this reads the stylesheet as text, the way that precedent does.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Declarations only — the comments beside these rules discuss `white-space` at length. */
const css = readFileSync(fileURLToPath(new URL('./notes.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

const rule = (selector: string): string =>
  new RegExp(`(^|\\})\\s*\\${selector}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[2] ?? '';

describe('a note body keeps the newlines the composer writes (ADR-0152 §6b)', () => {
  // The two surfaces that render a BODY as content: the host section (unclamped, and where
  // the report came from) and the notes screen's row (clamped to two lines — the clamp
  // counts RENDERED lines, so preserving them does not fight it).
  //
  // **The host section's breaks are no longer this rule's doing** (ADR-0202 §6): its body is
  // rendered by `NoteProse`, which emits a `<br />` per authored line, and
  // `HostNotes.test.tsx` asserts that directly — a stronger guard than reading CSS text,
  // which is all this file can do. The declaration stays because `.note-item-b` still holds a
  // raw text node in the url-only case, and because the class is the one a future raw render
  // would land in. What must not be deleted is `.note-body-line`'s: the notes screen's row
  // renders a FLATTENED string (`flattenNoteMarkdown`) whose newlines are real characters,
  // and nothing but this rule makes them visible.
  it.each(['.note-item-b', '.note-body-line'])('%s declares white-space: pre-wrap', (selector) => {
    expect(rule(selector)).toMatch(/white-space:\s*pre-wrap/);
  });

  // …and the prose must NOT inherit it, or the `<br />`s stack with preserved space runs.
  it('insulates .note-prose from an inherited pre-wrap', () => {
    expect(rule('.note-prose')).toMatch(/white-space:\s*normal/);
  });

  // Not the composer's chip: a committed note collapses to ONE line there by design, and
  // the full text is one tap away (§6b). Asserted so "make notes keep their newlines" is
  // not read as applying to the one place that deliberately does not.
  it('leaves the composer chip on its one line', () => {
    expect(rule('.note-chip-t')).toMatch(/white-space:\s*nowrap/);
  });
});
