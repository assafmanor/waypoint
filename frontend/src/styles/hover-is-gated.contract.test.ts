// A CSS contract test in the shape of `exit-animations.contract.test.ts`, guarding a rule
// no rendering test can see: jsdom has no hover, and the e2e suite's touch emulation
// would need a per-control "tap, then read the paint" assertion for every hover rule.
//
// On a touch device `:hover` LATCHES after a tap and clears only when something else is
// tapped, so every hover rule is also a stuck state — a row still highlighted, a control
// asserting a state it is not in (ADR-0195 §4, the tick's ghost ✓ in a green ring). The
// app is phone-primary (ADR-0017), so a hover may exist only where a pointer can hover:
// inside `@media (hover: hover) and (pointer: fine)`. Swept app-wide 2026-09-08; this
// keeps it swept.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const GATE = /^@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)$/;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return full.endsWith('.css') ? [full] : [];
  });
}

/** Every selector containing `:hover`, with whether an enclosing at-rule is the gate.
 *  A small brace walk rather than a CSS parser: the sheets are Prettier-formatted and
 *  comments (which discuss `:hover` at length) are stripped first. */
function hoverSelectors(css: string): { selector: string; gated: boolean }[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack: string[] = [];
  const found: { selector: string; gated: boolean }[] = [];
  let prelude = '';
  for (const ch of stripped) {
    if (ch === '{') {
      const sel = prelude.trim();
      if (sel.includes(':hover')) {
        found.push({ selector: sel.replace(/\s+/g, ' '), gated: stack.some((s) => GATE.test(s)) });
      }
      stack.push(sel.replace(/\s+/g, ' '));
      prelude = '';
    } else if (ch === '}') {
      stack.pop();
      prelude = '';
    } else if (ch === ';') {
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return found;
}

const FILES = cssFiles(SRC).map((file) => ({
  name: path.relative(SRC, file),
  hovers: hoverSelectors(readFileSync(file, 'utf8')),
}));

describe('hover is gated', () => {
  it('finds hover rules to check (guards against the walk silently matching nothing)', () => {
    expect(FILES.length).toBeGreaterThan(5);
    expect(FILES.flatMap((f) => f.hovers).length).toBeGreaterThan(20);
  });

  // The rule. A `:hover` selector lives inside `@media (hover: hover) and (pointer: fine)`.
  it('never writes a :hover rule outside @media (hover: hover) and (pointer: fine)', () => {
    const offenders = FILES.flatMap(({ name, hovers }) =>
      hovers.filter((h) => !h.gated).map((h) => `${name}: ${h.selector}`),
    );
    expect(offenders).toEqual([]);
  });
});
