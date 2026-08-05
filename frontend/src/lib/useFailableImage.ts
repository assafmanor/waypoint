// **An image URL that may simply be gone**, in one place instead of two (root rule 8).
//
// An enrichment image URL is immutable (ADR-0166 §7), so a refresh does not update it — it
// **replaces** it, deletes the old blob, and the old URL 404s for good. Anything rendering one
// therefore has to degrade to the no-image state rather than to the browser's broken-image mark:
// a glyph in the badge (ADR-0167 §1), nothing at all where the hero would be.
//
// Keyed off the URL, which is what lets a replacement get a fresh chance instead of inheriting
// the last one's failure — a subtlety worth having in one place, since it is invisible until the
// day an image is refreshed.
//
// Extracted from `PlaceBadge`, which had it first and alone: ADR-0167 §10.2's hero is the second
// caller, and rule 8 asks for the existing one-off to be generalized rather than copied.
import { useEffect, useState } from 'react';

export function useFailableImage(url?: string): {
  /** The URL when it is safe to render, `undefined` once it has failed — so a caller can gate
   *  the whole image slot on it rather than reasoning about a broken `<img>`. */
  src?: string;
  onError: () => void;
} {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [url]);
  return {
    src: url && url !== failedUrl ? url : undefined,
    onError: () => setFailedUrl(url ?? null),
  };
}
