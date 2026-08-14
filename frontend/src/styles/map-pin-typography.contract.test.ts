import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* **What a pin inherits from the renderer's own DOM** — a contract test, in the shape
   `map-stacking.contract.test.ts` already uses, because neither of these can fail anywhere
   else: jsdom computes no layout, so a collapsed line box and a substituted font family are
   both invisible to the component suite by construction (frontend/CLAUDE.md's "reading a rect
   and calling it visibility", one layer further down — here there is no rect at all).

   Both rules exist because the MapLibre migration put our markers INSIDE a vendor-styled
   container for the first time. Google's `OverlayView` host set no typography, so nothing had
   ever had to defend against inheriting any. */

const paneCss = readFileSync(
  fileURLToPath(new URL('../ui/domain/map-pane.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

const ruleFor = (selector: string): string =>
  paneCss.match(
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`),
  )?.[1] ?? '';

describe('the marker wrapper', () => {
  it('states no line-height, which would inherit into the pin tag and collapse it', () => {
    // Measured 2026-08-14: `line-height: 0` here bought nothing — `.map-pin` is `display:
    // block`, so the wrapper is `--pin-u` tall either way — and collapsed `.pin-tag`'s pill to
    // 8px around 17px of text, spilling the words out of their own card ground.
    expect(ruleFor('.map-marker')).not.toMatch(/\bline-height\s*:/);
  });
});

describe("the canvas's typography", () => {
  it('resets the vendor font shorthand, so markers keep the app font and no fixed line box', () => {
    // `maplibre-gl.css` opens with `.maplibregl-map { font: 12px/20px Helvetica Neue, … }` on
    // the very element we hand MapLibre. Without this, Hebrew pin copy renders Latin-stack and
    // every pin carries a 20px line box on a surface where ADR-0123 makes each length a
    // fraction of `--pin-u`.
    expect(ruleFor('.map-pane .map-canvas')).toMatch(/\bfont\s*:\s*inherit\s*;/);
  });

  it('is two classes deep, so it cannot lose a specificity tie to `.maplibregl-map`', () => {
    // A one-class rule ties with the vendor's and is decided by bundle order across two
    // component-level CSS imports. Measured: at equal specificity the vendor rule won.
    expect(paneCss).not.toMatch(/(^|\})\s*\.map-canvas\s*\{[^}]*\bfont\s*:\s*inherit/);
  });
});
