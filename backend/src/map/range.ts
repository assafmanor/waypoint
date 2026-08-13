// **RFC 7233 byte ranges**, because the `pmtiles` protocol reads an archive by range and
// a server that ignores `Range` makes the client fetch a 23MB file to draw one tile
// (ADR-0186 §3).
//
// Deliberately only what that protocol sends — a single `bytes=start-end`. Multipart
// ranges are a real part of the RFC and no client of ours emits one, so the honest answer
// to a multi-range header is to serve the whole body (a 200 is always a legal answer to a
// Range request; a wrong 206 is not).
import type { Response } from 'express';

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Resolve one `Range` header against a known length.
 *
 * - `null` — no range asked for, or one we do not answer: serve everything.
 * - `'unsatisfiable'` — a range that starts past the end. RFC 7233 says 416, and saying so
 *   is what stops a client silently reading zero bytes as a valid empty archive.
 *
 * `bytes=-500` is the SUFFIX form and means the LAST 500 bytes, not the first 500 — the
 * one case in this grammar that reads backwards, and the one `pmtiles` uses to find an
 * archive's footer.
 */
export function resolveRange(
  header: string | undefined,
  length: number,
): ByteRange | null | 'unsatisfiable' {
  if (!header) return null;
  const match = SINGLE_RANGE.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;

  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfiable';
    return { start: Math.max(0, length - suffix), end: length - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= length) return 'unsatisfiable';
  const end = rawEnd === '' ? length - 1 : Math.min(Number(rawEnd), length - 1);
  if (!Number.isFinite(end) || end < start) return 'unsatisfiable';
  return { start, end };
}

/** Send a buffer, honouring one byte range. */
export function sendRange(res: Response, body: Buffer, mimeType: string): void {
  res.setHeader('Content-Type', mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Advertised so a client knows ranges are worth asking for at all.
  res.setHeader('Accept-Ranges', 'bytes');

  const range = resolveRange(res.req.headers.range, body.length);
  if (range === 'unsatisfiable') {
    res.setHeader('Content-Range', `bytes */${body.length}`);
    res.status(416).end();
    return;
  }
  if (!range) {
    res.setHeader('Content-Length', String(body.length));
    res.status(200).send(body);
    return;
  }
  res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${body.length}`);
  res.setHeader('Content-Length', String(range.end - range.start + 1));
  res.status(206).send(body.subarray(range.start, range.end + 1));
}
