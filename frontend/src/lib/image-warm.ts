// **A picture the app is about to show, fetched and decoded before it is asked for.**
//
// An `<img>` paints in the task that inserts it only when the document already holds its picture.
// The HTTP cache does not count — a disk hit still answers a frame or more later — so a day's head
// photo, mounted fresh on every day change (`PhotoBand` keys it on its URL), drew an empty band
// first even on a day already seen. Holding a decoded `Image` per URL keeps the picture in the
// document's own memory cache, which is what lets the next `<img>` with that URL be complete on
// insertion.
import { WARM_IMAGE_LIMIT } from '../constants';

/** Insertion-ordered, so the first key is the least recently asked for. */
const held = new Map<string, HTMLImageElement>();

export function warmImages(urls: Iterable<string>): void {
  for (const url of urls) {
    const image = held.get(url);
    if (image) {
      held.delete(url);
      held.set(url, image);
      continue;
    }
    const probe = new Image();
    probe.src = url;
    // A failed decode only means this picture will load the ordinary way; the `<img>` reports it.
    probe.decode?.().catch(() => {});
    held.set(url, probe);
    if (held.size > WARM_IMAGE_LIMIT) held.delete(held.keys().next().value!);
  }
}

/** Test seam: forget everything held. */
export function resetWarmImages(): void {
  held.clear();
}

/** Test seam: what is held, least recently asked for first. */
export function warmedImages(): string[] {
  return [...held.keys()];
}
