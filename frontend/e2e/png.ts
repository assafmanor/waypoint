// **A real PNG, built here** — the bytes a geometry spec needs when it measures an image.
//
// PNG rather than JPEG because it can be written by hand: a deflate stream of raw scanlines and
// three CRC'd chunks, all from `node:zlib`, with no image library in the toolchain. The sniffer
// accepts it as a stored type (`image/png` is in the avatar allow-list the enrichment pipeline
// reuses), so this is a body the real route could serve.
//
// Why real bytes at a real size, in every spec that uses this: a 404, a refused content type, a
// 1×1 stand-in or an undecodable body all leave a box that measures perfectly — which is exactly
// the failure a geometry harness cannot see. Anything asserting `object-fit`, a frame's ratio or
// a letterbox has to decode something whose own dimensions it chose.
//
// Extracted from `place-photo-frame.spec.ts` when `media-viewer-fit.spec.ts` needed the same
// bytes at different dimensions (root CLAUDE.md rule 8: generalize the one-off rather than copy
// it).
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function chunk(type: string, body: Buffer): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  let crc = ~0;
  for (const byte of typed) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(~crc >>> 0);
  return Buffer.concat([length, typed, checksum]);
}

export function pngBytes(width: number, height: number, rgb: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 2; // truecolour RGB, so a scanline is width × 3 bytes
  const scanline = Buffer.concat([
    Buffer.from([0]), // filter: none
    Buffer.from(Array.from({ length: width }, () => rgb).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => scanline));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
