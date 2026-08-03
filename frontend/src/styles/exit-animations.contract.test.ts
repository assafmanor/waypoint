// A CSS contract test, which is an unusual shape here and exists for a specific
// reason: the defect it guards is INVISIBLE to every other kind of test we have.
//
// ADR-0140 §G1 gave every overlay an exit by playing the entrance's keyframes with
// `reverse`. That does not run. The same `animation-name` is the same animation, so
// changing only duration/easing/direction retargets the running one instead of
// starting a new one — it keeps its current time, which by the time anyone closes an
// overlay is far past the new `--t-quick` duration, so it is already complete and
// `fill: both` paints the reversed END state on the first frame. Measured on a sheet:
// open for >=200ms and it is at `translateY(100%)` with the scrim at 0 the instant
// `.is-closing` lands. Six rules shipped that way and none of them ever animated.
//
// Why a test that reads text instead of one that renders:
//   - jsdom has no CSS engine. `getComputedStyle` returns no animated values, and
//     `motionDurationMs` correctly answers 0 there, so the whole unit suite takes the
//     no-animation branch by construction. It cannot see this and never could.
//   - The e2e suite runs a real engine, but catching this needs a per-overlay timing
//     assertion mid-exit; the rule is one line of CSS grammar, so assert the grammar.
//
// This is a lint rule that happens to live in vitest — there is no stylelint in the
// toolchain, and adding one for a single rule would be the heavier answer.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return full.endsWith('.css') ? [full] : [];
  });
}

/** Declarations only — comments legitimately discuss `reverse` (this rule is explained
 *  at length at the top of `modal.css`), so strip them before matching. */
function declarations(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const FILES = cssFiles(SRC).map((file) => ({
  name: path.relative(SRC, file),
  css: declarations(readFileSync(file, 'utf8')),
}));

describe('exit animations', () => {
  it('finds stylesheets to check (guards against the glob silently matching nothing)', () => {
    expect(FILES.length).toBeGreaterThan(5);
    expect(FILES.map((f) => f.name)).toContain(path.join('ui', 'primitives', 'modal.css'));
  });

  // The rule. An exit is its own `@keyframes`, never the entrance's played backwards.
  it('never expresses an exit as the entrance played in reverse', () => {
    const offenders = FILES.flatMap(({ name, css }) =>
      [...css.matchAll(/animation(?:-direction)?\s*:[^;}]*\breverse\b[^;}]*/g)].map(
        (m) => `${name}: ${m[0].trim().replace(/\s+/g, ' ')}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  // A hand-written `-out` pair is the cost of the rule above, and a typo in one is a
  // channel that silently does not animate — the same symptom, a different cause.
  it('only references keyframes that exist', () => {
    const defined = new Set(
      FILES.flatMap(({ css }) => [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])),
    );
    const missing = FILES.flatMap(({ name, css }) =>
      [...css.matchAll(/animation\s*:\s*([\w-]+)/g)]
        .map((m) => m[1])
        // The shorthand may lead with a duration/keyword rather than the name.
        .filter((token) => !/^(?:none|inherit|initial|unset|\d)/.test(token))
        .filter((token) => !defined.has(token))
        .map((token) => `${name}: ${token}`),
    );
    expect(missing).toEqual([]);
  });
});
