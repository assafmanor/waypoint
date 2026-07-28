// Normalize a picked photo into the square an avatar actually renders — ADR-0133 §12.
//
// This runs on the phone, before the bytes cross the wire, and it is doing three jobs
// at once: it makes the byte ceiling a non-event (a 12 MP camera photo is ~4 MB and
// arrives as ~60 KB), it produces the SQUARE the design needs rather than letting CSS
// crop a rectangle to a circle and hope the face is centred, and it collapses every
// input type — HEIC included — to the one type we serve.
//
// It is emphatically NOT a security boundary: a hostile client can post whatever it
// likes, which is why the server sniffs the bytes it receives (`image/sniff`) and keeps
// its own ceiling. This is about the honest path being small and square.
//
// Per the frontend testing rule: the DECISION (what rectangle to take from what source)
// is the pure function below and is tested; the canvas call that executes it is the thin
// part, because jsdom has neither `createImageBitmap` nor a real 2D context.
import {
  AVATAR_IMAGE_EDGE_PX,
  AVATAR_IMAGE_MIME_TYPE,
  AVATAR_IMAGE_QUALITY,
} from '@waypoint/shared';

export interface SquareCrop {
  /** Source-space rectangle to copy: always the largest centred square available. */
  sx: number;
  sy: number;
  size: number;
  /** Destination edge — the source square when it is already smaller than the target,
   *  so a small picture is never upscaled into a blurry one. */
  edge: number;
}

/** The largest centred square of a `width`×`height` source, and the edge to draw it at.
 *
 *  Centred rather than top-anchored: a portrait photo's face is nearer the middle than
 *  the top edge, and a landscape one has nothing to prefer. Downscale-only, because
 *  upscaling a 64px picture to 512 only makes it a bigger blur and a larger upload. */
export function squareCrop(
  width: number,
  height: number,
  target = AVATAR_IMAGE_EDGE_PX,
): SquareCrop {
  const size = Math.min(width, height);
  return {
    sx: Math.round((width - size) / 2),
    sy: Math.round((height - size) / 2),
    size,
    edge: Math.min(size, target),
  };
}

/** Decode, centre-crop to a square, downscale, and re-encode as JPEG.
 *
 *  Throws when the file cannot be decoded as an image — which is the honest outcome for
 *  a picked file that is not a picture, and the caller turns it into a message rather
 *  than sending bytes the server would only reject. */
export async function toAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { sx, sy, size, edge } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('avatar: no 2d context');
    ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, edge, edge);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, AVATAR_IMAGE_MIME_TYPE, AVATAR_IMAGE_QUALITY),
    );
    if (!blob) throw new Error('avatar: encode failed');
    return blob;
  } finally {
    // Free the decoded bitmap explicitly — a 12 MP decode is tens of MB, and on a
    // phone waiting for GC to notice is how a picker that works once fails the
    // third time.
    bitmap.close();
  }
}
