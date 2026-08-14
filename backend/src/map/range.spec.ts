import { describe, expect, it } from 'vitest';
import { resolveRange } from './range';

/* The `pmtiles` protocol addresses an archive by byte range, so getting this wrong does
   not error — it silently serves the wrong bytes and the renderer draws nothing. Every
   case here is one the protocol actually emits. */

const LEN = 1000;

describe('resolveRange', () => {
  it('serves everything when nothing was asked for', () => {
    expect(resolveRange(undefined, LEN)).toBeNull();
  });

  it('reads a closed range inclusively, as the RFC does', () => {
    // `bytes=0-99` is 100 bytes, not 99 — an off-by-one here truncates every tile.
    expect(resolveRange('bytes=0-99', LEN)).toEqual({ start: 0, end: 99 });
  });

  it('reads an open range as "to the end"', () => {
    expect(resolveRange('bytes=900-', LEN)).toEqual({ start: 900, end: 999 });
  });

  it('reads the SUFFIX form as the LAST n bytes', () => {
    // The one form in this grammar that reads backwards, and the one pmtiles uses to
    // find an archive's footer. Reading it as "first 500" would break every archive.
    expect(resolveRange('bytes=-500', LEN)).toEqual({ start: 500, end: 999 });
  });

  it('clamps an end past the body rather than refusing it', () => {
    expect(resolveRange('bytes=990-99999', LEN)).toEqual({ start: 990, end: 999 });
  });

  it('calls a start past the end unsatisfiable, so a client cannot read zero bytes as valid', () => {
    expect(resolveRange('bytes=1000-1010', LEN)).toBe('unsatisfiable');
    expect(resolveRange('bytes=-0', LEN)).toBe('unsatisfiable');
  });

  it('refuses a backwards range', () => {
    expect(resolveRange('bytes=500-100', LEN)).toBe('unsatisfiable');
  });

  it('falls back to the whole body for forms we do not answer', () => {
    // A 200 is always a legal answer to a Range request; a wrong 206 is not — so a
    // multi-range header serves everything rather than guessing which part was wanted.
    expect(resolveRange('bytes=0-99,200-299', LEN)).toBeNull();
    expect(resolveRange('items=0-99', LEN)).toBeNull();
    expect(resolveRange('bytes=-', LEN)).toBeNull();
  });
});
