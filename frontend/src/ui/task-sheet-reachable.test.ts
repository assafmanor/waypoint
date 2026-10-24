// @vitest-environment jsdom
// **The task editor can reach its own top** (owner, 2026-08-16: the editor is "cut off from
// the top", reported with the keyboard up).
//
// `Sheet` bottom-anchors its card and caps NOTHING, so a form taller than the viewport grows
// past the top edge with no scroll to get back — and a phone keyboard is exactly what makes
// the viewport short enough. Measured in the running app at 401px of viewport: the card
// rendered 545px tall starting at −144, `max-height: none`, nothing scrollable, and the title
// input at −62.
//
// jsdom does no layout, so this cannot measure the overflow. What it CAN pin is the thing that
// was missing: the body carries the app's shipped scroll container, and that container still
// declares the cap and the scroll. A rect-based version of this belongs in e2e.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the task editor is bounded and scrollable', () => {
  it('gives its body the shipped scroll container rather than a cap of its own', () => {
    const sheet = read('src/ui/TaskSheet.tsx');
    expect(sheet).toContain('task-sheet modal-form');
  });

  // If `.modal-form` ever loses either half, the editor silently goes back to overflowing —
  // and so does `EventForm`, which has depended on it since U-01.
  it('and `.modal-form` still caps and scrolls', () => {
    const css = read('src/ui/primitives/form-actions.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const block = css.slice(
      css.indexOf('.modal-form {'),
      css.indexOf('}', css.indexOf('.modal-form {')),
    );
    expect(block).toContain('overflow-y: auto');
    expect(block).toMatch(/max-height:\s*75dvh/);
  });
});
