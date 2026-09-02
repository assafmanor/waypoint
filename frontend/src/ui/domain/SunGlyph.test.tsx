// @vitest-environment jsdom
//
// The marks' contract. Two of these guard decisions that cost a render to find,
// and neither is visible in a diff: a `stop-color` ATTRIBUTE does not accept
// `var()`, and two glyphs on one screen must not share gradient ids.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SunGlyph, type SunGlyphName } from './SunGlyph';

afterEach(cleanup);

const NAMES: SunGlyphName[] = ['sunrise', 'sunset', 'golden', 'polar-day', 'polar-night'];

describe('SunGlyph', () => {
  it('paints every sky from the ramp, never from a literal', () => {
    // The correction this file was written after: the first version was drawn in
    // saturated hex and measured level with `--amber` in chroma, which is what
    // the decorative palette exists NOT to be. Every colour now arrives through
    // a class, so `sun-widget.css` is the single place they can change.
    for (const name of NAMES) {
      const { container } = render(<SunGlyph name={name} />);
      for (const stop of container.querySelectorAll('stop')) {
        expect(stop.getAttribute('stop-color')).toBeNull();
        expect(stop.getAttribute('class')).toMatch(/^sg-(night|twilight|dawn|day)$/);
      }
      cleanup();
    }
  });

  it('gives every instance its own gradient ids', () => {
    // Two marks sit on one foot and a third in the chip beside them. Shared ids
    // mean the last one mounted repaints the others.
    const { container } = render(
      <>
        <SunGlyph name="sunrise" />
        <SunGlyph name="sunset" />
        <SunGlyph name="golden" />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids.length).toBe(6);
    expect(new Set(ids).size).toBe(ids.length);
    // A colon is legal in an XML name and a trap in a CSS selector; `useId`
    // hands one over, so it is stripped at the source.
    expect(ids.some((id) => id.includes(':'))).toBe(false);
  });

  it('points each reference at an id that exists in its own svg', () => {
    for (const name of NAMES) {
      const { container } = render(<SunGlyph name={name} />);
      const svg = container.querySelector('svg')!;
      const own = new Set([...svg.querySelectorAll('[id]')].map((el) => el.id));
      for (const el of svg.querySelectorAll('[clip-path], [fill^="url"]')) {
        const ref = (el.getAttribute('clip-path') ?? el.getAttribute('fill'))!.match(/#(.+)\)/);
        if (ref) expect(own.has(ref[1])).toBe(true);
      }
      cleanup();
    }
  });

  it('draws the sun on the four skies that have one, and not on the polar night', () => {
    // The absence IS the statement: a tile for "the sun does not rise" cannot
    // contain a sun.
    for (const name of NAMES) {
      const { container } = render(<SunGlyph name={name} />);
      expect(container.querySelector('.sg-sun') !== null).toBe(name !== 'polar-night');
      cleanup();
    }
  });

  it('draws a horizon on the crossings and withholds it from the ranges', () => {
    // Golden hour is a RANGE, not a crossing, and a polar day has no crossing to
    // draw — so a horizon on either would state something untrue of it.
    const has = (name: SunGlyphName) => {
      const { container } = render(<SunGlyph name={name} />);
      const found = container.querySelector('.sg-horizon') !== null;
      cleanup();
      return found;
    };
    expect(has('sunrise')).toBe(true);
    expect(has('sunset')).toBe(true);
    expect(has('polar-night')).toBe(true);
    expect(has('golden')).toBe(false);
    expect(has('polar-day')).toBe(false);
  });

  it('puts the rising sun above its horizon and the setting one below', () => {
    // The second channel behind hue, and the one that survives muting: the two
    // tiles are the same scene at two heights.
    const sun = (name: SunGlyphName) => {
      const { container } = render(<SunGlyph name={name} />);
      const cy = Number(container.querySelector('.sg-sun')!.getAttribute('cy'));
      const y = Number(
        container
          .querySelector('.sg-horizon')!
          .getAttribute('d')!
          .match(/M0 ([\d.]+)/)![1],
      );
      cleanup();
      return { cy, y };
    };
    const rise = sun('sunrise');
    const set = sun('sunset');
    expect(rise.cy).toBeLessThan(rise.y);
    expect(set.cy).toBeGreaterThan(set.y);
  });

  it('is hidden from the accessibility tree — the time beside it carries the fact', () => {
    const { container } = render(<SunGlyph name="sunrise" />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});
