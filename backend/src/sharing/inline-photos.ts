import { isEnrichmentBlobKey } from '@waypoint/shared';
import { sniffImageMimeType } from '../common/image-sniff';
import { getObject } from '../common/storage';

/**
 * **The photos, inlined — because this page reaches nothing.**
 *
 * `RenderBrowserService` aborts every request the page makes, and that is not a policy a
 * renderer can make an exception to: it is what makes a PDF of somebody's itinerary, or a
 * card of their trip, unable to phone anywhere. So a photo arrives the way the QR and the
 * fonts already do, as bytes in the document. Shared by the itinerary, the book and the card.
 *
 * Keyed by the projection's own root-relative URL, so the template looks up exactly what it
 * would otherwise have put in `src`. A blob that has gone (a refresh replaced it, an
 * ephemeral disk lost it) simply yields no entry, and the template prints no image — the
 * same degradation the public page gets from a 404.
 */
export async function photoDataUrls(photoUrls: readonly string[]): Promise<Record<string, string>> {
  const urls = [...new Set(photoUrls)];
  const out: Record<string, string> = {};
  await Promise.all(
    urls.map(async (url) => {
      const key = url.split('/').at(-1);
      // The same prefix check the public route makes: `storage.ts` is one flat keyspace
      // shared with document ciphertext, and a path that is not an enrichment blob has no
      // business being read here either.
      if (!key || !isEnrichmentBlobKey(key)) return;
      try {
        const bytes = await getObject(key);
        // Typed from the BYTES like the route does, and unsniffable bytes get no entry
        // rather than a guessed `image/jpeg` — a data URL lying about its type prints a
        // broken box, which is worse than the no-photo layout the template already has.
        const mimeType = sniffImageMimeType(bytes);
        if (mimeType) out[url] = `data:${mimeType};base64,${bytes.toString('base64')}`;
      } catch {
        // Gone, or never there. No entry, no image, no broken box.
      }
    }),
  );
  return out;
}
