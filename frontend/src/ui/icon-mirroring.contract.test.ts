// **ADR-0138 §10's two rules, asserted over the source rather than over a render** — because both
// are about the SET of icons, and neither can fail in a single component's test.
//
// §10.1 One declaration: the mirror is `--dir` in `App.css`, so there is exactly one place a
// direction is named. §10.3 A `MIRRORED` member may not also take `dir`: the rotation is an
// INLINE transform and would win over the stylesheet, so a glyph cannot be both rotated and
// mirrored — and the collision would be silent, which is what a spec is for.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIRRORED } from './Icon';

const SRC = fileURLToPath(new URL('..', import.meta.url));

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });

/** Every `<Icon … dir=… />` in the app, and the name it was given. A `name` written as an
 *  expression is not matched, and that is deliberate: the rule is about the literal pairs a
 *  reader can check, and a computed name that mirrors is a case for the reviewer. */
const dirCallSites = sources(SRC).flatMap((file) => {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/<Icon\b[^>]*?\bdir=/g)].flatMap((m) => {
    const tag = src.slice(m.index, src.indexOf('/>', m.index));
    return [...tag.matchAll(/name="([a-z-]+)"/g)].map((n) => n[1]);
  });
});

describe('icon mirroring (ADR-0138 §10)', () => {
  it('finds the dir call sites at all, so the assertion below is not vacuous', () => {
    expect(dirCallSites.length).toBeGreaterThan(0);
  });

  /** §10.3 — the two channels are disjoint, so no glyph is asked to rotate and mirror at once. */
  it('never passes dir to a MIRRORED glyph', () => {
    expect(dirCallSites.filter((name) => MIRRORED.has(name as never))).toEqual([]);
  });

  /** §10.1 — one declaration, and it reads `--dir` rather than naming a side. A second rule
   *  keyed on `[dir='rtl']` is exactly the drift this ADR exists to prevent. */
  it('mirrors from the --dir token in one place', () => {
    const css = readFileSync(fileURLToPath(new URL('../App.css', import.meta.url)), 'utf8');
    const rules = [...css.matchAll(/\.icon\[data-mirror\][^{]*\{([^}]*)\}/g)];
    expect(rules).toHaveLength(1);
    expect(rules[0][1]).toMatch(/transform\s*:\s*scaleX\(var\(--dir\)\)/);
  });
});
