// What the BYTES say they are, as opposed to what the upload claimed (ADR-0133 §12).
//
// The document path can trust a declared `mimetype` because it never renders what it
// stored: every document goes back out as `Content-Disposition: attachment` with
// `nosniff`, so a lying header costs a wrong file name and nothing else. An avatar is
// the opposite — it is served **inline** to be drawn in an `<img>` — so "is this
// actually an image" has to be answered from the content, once, at the door.
//
// This is a signature check, not a decoder: it proves the container, and the pinned
// `Content-Type` + `nosniff` on the way out is what makes that sufficient. A file that
// is a valid JPEG *and* valid HTML (the polyglot worry) is still only ever parsed as
// the type we declare, and an `<img>` executes nothing either way.
import { ALLOWED_AVATAR_MIME_TYPES } from '@waypoint/shared';

type SniffableMimeType = (typeof ALLOWED_AVATAR_MIME_TYPES)[number];

/** Longest signature we compare, so a caller can cheaply reject a truncated body. */
const MIN_SNIFF_BYTES = 12;

const startsWith = (buffer: Buffer, bytes: readonly number[], offset = 0): boolean =>
  bytes.every((byte, i) => buffer[offset + i] === byte);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
// WebP is a RIFF container: "RIFF" <4-byte length> "WEBP", so the tag at 8 is what
// separates it from any other RIFF payload (a .wav would match the first four).
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50] as const;

/** The image type these bytes actually are, or `null` for anything not in the avatar
 *  allow-list — which includes every non-image and, importantly, SVG: it has no binary
 *  signature to match, so "unrecognised" already rejects the one image type that is a
 *  script document. */
export function sniffImageMimeType(buffer: Buffer): SniffableMimeType | null {
  if (buffer.length < MIN_SNIFF_BYTES) return null;
  if (startsWith(buffer, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(buffer, JPEG_SIGNATURE)) return 'image/jpeg';
  if (startsWith(buffer, RIFF_SIGNATURE) && startsWith(buffer, WEBP_TAG, 8)) return 'image/webp';
  return null;
}
