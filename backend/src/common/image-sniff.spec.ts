import { describe, expect, it } from 'vitest';
import { sniffImageMimeType } from './image-sniff';

/** A buffer whose first bytes are `head` and which is long enough to be sniffed. */
const withHead = (...head: number[]): Buffer =>
  Buffer.concat([Buffer.from(head), Buffer.alloc(64)]);

describe('sniffImageMimeType', () => {
  it('recognises a JPEG', () => {
    expect(sniffImageMimeType(withHead(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
  });

  it('recognises a PNG', () => {
    expect(sniffImageMimeType(withHead(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      'image/png',
    );
  });

  it('recognises a WebP by its RIFF container AND its WEBP tag', () => {
    const riff = Buffer.from('RIFF');
    const size = Buffer.alloc(4);
    const webp = Buffer.from('WEBP');
    expect(sniffImageMimeType(Buffer.concat([riff, size, webp, Buffer.alloc(64)]))).toBe(
      'image/webp',
    );
  });

  it('rejects a non-WebP RIFF payload — a .wav opens with the same four bytes', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
    expect(sniffImageMimeType(Buffer.concat([wav, Buffer.alloc(64)]))).toBeNull();
  });

  it('rejects SVG — the one image type that is a script document', () => {
    // The point: SVG has no binary signature, so "unrecognised" already rejects it.
    // Nothing here has to know it is dangerous.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(sniffImageMimeType(svg)).toBeNull();
  });

  it('rejects HTML wearing an image name', () => {
    expect(sniffImageMimeType(Buffer.from('<!doctype html><script>alert(1)</script>'))).toBeNull();
  });

  it('rejects a PDF — allowed as a document, never as an avatar', () => {
    expect(sniffImageMimeType(Buffer.from('%PDF-1.7\n' + 'x'.repeat(64)))).toBeNull();
  });

  it('rejects a body too short to carry any signature', () => {
    expect(sniffImageMimeType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it('rejects an empty body', () => {
    expect(sniffImageMimeType(Buffer.alloc(0))).toBeNull();
  });

  it('is not fooled by a signature that appears later in the file', () => {
    const late = Buffer.concat([Buffer.alloc(16), Buffer.from([0xff, 0xd8, 0xff])]);
    expect(sniffImageMimeType(late)).toBeNull();
  });
});
