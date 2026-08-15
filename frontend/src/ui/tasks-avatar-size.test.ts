// @vitest-environment jsdom
// **The row's assignee avatar is 18px, and the editor's is 38px** — a CSS regression test,
// because the suite was fully green while the row's circle rendered at 38px on a real phone
// (owner, 2026-08-16: "the avatar is too big").
//
// The cause was a class-name collision inside one stylesheet: the editor's density wrapper
// and the row's assignee span were both `.tsk-who`, so `.tsk-who .wp-av { width: 38px }`
// (0-2-0) outranked the row's own `.tsk-who-mini` (0-1-0). Nothing about the DOM was wrong,
// which is why every existing assertion passed — the defect lived entirely in the cascade.
//
// jsdom does not do layout, so this asserts the CASCADE rather than a rect: it parses the
// real stylesheet and checks that no editor-scoped selector can match the row's markup.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vite serves the module graph, so `import.meta.url` is an http URL under vitest — read the
// sheet off the filesystem relative to the project root instead.
const css = readFileSync(join(process.cwd(), 'src/ui/tasks.css'), 'utf8');

/** Every selector in the sheet, flattened from its comma groups. Comments are stripped
 *  FIRST — this file's own prose mentions the very selectors under test, so parsing them in
 *  makes the assertions read their own documentation. */
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = [...bare.matchAll(/(^|\})\s*([^{}@]+?)\s*\{/gm)]
  .flatMap((m) => m[2].split(','))
  .map((s) => s.trim())
  .filter(Boolean);

describe('the row avatar cannot inherit the editor’s 38px', () => {
  it('scopes every `.tsk-who` descendant rule to the editor’s own ChoiceGrid', () => {
    const editorRules = selectors.filter((s) => /\.tsk-who[\s>]/.test(s));
    expect(editorRules.length).toBeGreaterThan(0);
    // If one of these ever loses its `.choice-grid`, it can reach a row again.
    for (const rule of editorRules) expect(rule).toContain('.choice-grid');
  });

  it('does not name the row’s wrapper `.tsk-who`, which is the editor’s', () => {
    expect(selectors).toContain('.tsk-assignee');
    expect(selectors).not.toContain('.tsk-who');
  });

  it('sizes the row’s avatar at 18px and the editor’s at 38px', () => {
    const block = (selector: string) => {
      const i = css.indexOf(`${selector} {`);
      expect(i, `${selector} missing`).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i));
    };
    expect(block('.tsk-who-mini')).toContain('width: 18px');
    expect(block('.tsk-who .choice-grid .wp-av')).toContain('width: 38px');
  });
});
