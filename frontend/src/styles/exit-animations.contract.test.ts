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
  //
  // **It resolves one level of `var()`, and that is the interesting half now.** Two rules in
  // this app reach their keyframes through a custom property rather than naming them inline:
  // the board fills a slot (`--board-beat`) because the Plan→Trip power-on already owns its
  // `animation` property, and the shared rebuff declares the whole shorthand once
  // (`--beat-rebuff`) so two surfaces cannot drift (ADR-0160 §Q). An indirection is exactly
  // where a misspelled name hides best — nothing anywhere fails, the channel just never
  // animates — so the guard follows it instead of skipping it.
  it('only references keyframes that exist', () => {
    const defined = new Set(
      FILES.flatMap(({ css }) => [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])),
    );
    /** Every custom property's declared value, so `var(--x)` inside an `animation` can be
     *  resolved to whatever `--x` was set to. Last declaration wins, which is close enough:
     *  what matters is that SOME rule declares a name, since a name nothing declares is the
     *  bug this looks for. */
    const customProps = new Map<string, string>(
      FILES.flatMap(
        ({ css }) =>
          [...css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].map((m) => [m[1], m[2].trim()]) as [
            string,
            string,
          ][],
      ),
    );
    /** Split on TOP-LEVEL commas only. A naive `split(',')` cuts inside `cubic-bezier(…)`
     *  and `steps(4, end)`, which is how the first version of this reported `end)` as a
     *  missing keyframe — a false alarm is as bad as a miss in a guard nobody re-reads. */
    const slots = (value: string): string[] => {
      const out: string[] = [];
      let depth = 0;
      let current = '';
      for (const ch of value) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ',' && depth === 0) {
          out.push(current);
          current = '';
        } else current += ch;
      }
      return [...out, current];
    };

    /** The animation-name candidates in one `animation` shorthand: every slot's leading
     *  token, with a `var()` slot replaced by what it points at. */
    const namesIn = (value: string): string[] =>
      slots(value).flatMap((slot) => {
        const trimmed = slot.trim();
        const indirect = trimmed.match(/^var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/);
        if (!indirect) return [trimmed.split(/\s+/)[0] ?? ''];
        // A `var()` slot contributes its target's leading token, plus its fallback's — the
        // fallback is what paints when nothing sets the property, so it is also a reference.
        const target = customProps.get(indirect[1]);
        return [...(target ? namesIn(target) : []), ...(indirect[2] ? namesIn(indirect[2]) : [])];
      });

    const missing = FILES.flatMap(({ name, css }) =>
      [...css.matchAll(/animation\s*:\s*([^;}]+)/g)]
        .flatMap((m) => namesIn(m[1]))
        // A slot may lead with a duration/keyword rather than the name.
        .filter((token) => token && !/^(?:none|inherit|initial|unset|\d|var\()/.test(token))
        .filter((token) => !defined.has(token))
        .map((token) => `${name}: ${token}`),
    );
    expect(missing).toEqual([]);
  });

  // The guard above is only worth having if it can still fail, and an indirection is where
  // it would quietly stop being able to: a `var()` it cannot resolve looks exactly like a
  // clean sheet. So this asserts the resolution itself on the one rule that uses it.
  it('resolves a keyframe reached through a custom property', () => {
    const beats = FILES.find((f) => f.name === path.join('styles', 'beats.css'));
    expect(beats, 'the shared beat stylesheet moved — update this check with it').toBeTruthy();
    // The rebuff names its keyframes once, in a custom property, and plugs that same value
    // into the board's own animation slot (ADR-0160 §Q).
    expect(beats!.css).toMatch(/--beat-rebuff\s*:\s*wp-rebuff\b/);
    expect(beats!.css).toMatch(/animation\s*:\s*var\(\s*--beat-rebuff\s*\)/);
    expect(beats!.css).toMatch(/@keyframes\s+wp-rebuff\b/);
  });
});
