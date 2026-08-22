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
});

// **A SHIPPED DEFECT, and the only place it can be caught** (ADR-0202 §9b's second round).
// `--np-base` is the one knob a host moves to make the prose read at reading size, and
// `.note-prose` declared it on ITSELF — a custom property on an element shadows the inherited
// one, so `.note-full-body`'s value never arrived and the size fix changed nothing. It
// typechecked and every test stayed green, because a jsdom render has no cascade to consult:
// `getComputedStyle` there resolves no `var()` and no inheritance.
//
// So the guard has to read the stylesheet as text, which is exactly what this file is for.
describe('the prose takes its size from its HOST (ADR-0202 §9b)', () => {
  it('does not declare --np-base on itself, or a host can never raise it', () => {
    expect(rule('.note-prose')).not.toMatch(/--np-base\s*:/);
  });

  it('keeps the chrome-size default in the var() fallback instead', () => {
    expect(rule('.note-prose')).toMatch(/--np-size:\s*var\(--np-base,\s*var\(--text-body\)\)/);
  });

  it('has the full screen ask for reading size', () => {
    expect(rule('.note-full-body')).toMatch(/--np-base:\s*var\(--text-reading\)/);
  });
});

// **THE OTHER HALF OF THE SAME REPORT, and a worse bug than the size** (ADR-0202 §10b). The
// prose's block spacing lives on `.note-prose > * + *`, which is specificity (0,1,0). A
// per-element reset — `.note-prose p { margin: 0 }` — is (0,1,1), so it wins NO MATTER THE
// ORDER: every block gap this file declared was dead on arrival and the prose shipped with no
// spacing between blocks at all. That is what "clumped up" was.
//
// jsdom cannot see it (no cascade, no `var()`, no specificity resolution), and a browser has to
// be looking at the right property to notice, so the guard is structural: the reset must sit at
// the same weight as the rhythm, which means on `> *` and nowhere else.
describe('the prose rhythm is not out-specified by its own reset (ADR-0202 §10b)', () => {
  it('resets margins on the direct-child selector, at the rhythm’s own weight', () => {
    expect(css).toMatch(/\.note-prose\s*>\s*\*\s*\{[^}]*margin:\s*0/);
  });

  // Every `.note-prose <tag>` block — a DESCENDANT selector, therefore one class plus one
  // element, therefore (0,1,1) and heavier than the gaps.
  it('declares no margin in any descendant-selector rule', () => {
    const offenders = [...css.matchAll(/(^|\})\s*((?:\.note-prose [^{>,]+,?\s*)+)\{([^}]*)\}/gm)]
      .filter(([, , , body]) => /(^|[;{\s])margin(-block|-inline|-top|-bottom)?\s*:/.test(body))
      .map(([, , selector]) => selector.trim());
    expect(offenders).toEqual([]);
  });

  // Not the composer's chip: a committed note collapses to ONE line there by design, and
  // the full text is one tap away (§6b). Asserted so "make notes keep their newlines" is
  // not read as applying to the one place that deliberately does not.
  it('leaves the composer chip on its one line', () => {
    expect(rule('.note-chip-t')).toMatch(/white-space:\s*nowrap/);
  });
});
