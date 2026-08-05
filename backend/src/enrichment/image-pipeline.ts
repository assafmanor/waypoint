// Remote image → bytes we own, at a same-origin immutable URL (ADR-0166 §7, Phase 2).
//
// **Every piece of this already existed and was already doing this job for avatars**
// (ADR-0133 §12), so per ADR-0096 this is a *second consumer*, not new infrastructure:
// `common/storage.ts` for the bytes, `common/image-sniff.ts` to prove they are the image
// they claim to be, and `storage.ts`'s own read-through `blob-cache.ts` on the way back out.
// Nothing here is a new cache, a new byte sink, or a second HTTP client.
//
// **There is no resize step and no image-processing dependency** (§12.1). We ask Commons for
// a nominal width, take whatever thumbnail bucket it hands back, and store those bytes. The
// spike settled that: `iiurlwidth` returned a working server-generated thumbnail for all 32
// images at 36–250 KB, so the "derive the thumbnail server-side, once" that §7 assumed was
// work we never needed to do. We still store our own copy — hotlinking would reintroduce the
// third-party-request-per-render and blank-on-a-plane defects §2 rejected for Google photos,
// and that objection does not care who the host is.
//
// **Subject-agnostic on purpose.** It takes a URL and returns a stored blob; it knows nothing
// about places, providers or Commons. ADR-0166's Consequences promise the link-preview
// backlog item reuses this rather than growing a second fetch-and-cache-a-thumbnail machine
// beside it, and that only holds if this file never learns what a place is.
import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ENRICHMENT_BLOB_KEY_PREFIX, MAX_ENRICHMENT_IMAGE_BYTES } from '@waypoint/shared';
import { sniffImageMimeType } from '../common/image-sniff';
import { putObject } from '../common/storage';
import { EnrichmentFetcher } from './outbound-fetch';

/** A stored image: where the bytes are, and what they actually turned out to be. */
export interface StoredImage {
  blobKey: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class EnrichmentImagePipeline {
  private readonly logger = new Logger(EnrichmentImagePipeline.name);

  constructor(private readonly fetcher: EnrichmentFetcher) {}

  /**
   * Fetch a remote image and store it, or return `null` if it cannot be trusted.
   *
   * Returning `null` rather than throwing is what lets a caller **fall through to the next
   * candidate or to the no-image state** (§12.2's rule for a file we must refuse) instead of
   * failing the whole enrichment pass over one bad file.
   *
   * The URL goes through the allowlisted fetcher, so an off-allowlist host is refused before
   * a socket opens — an image URL that arrived in a third-party API response is exactly the
   * SSRF seat §7 is about, and it is never followed just because a response supplied it.
   */
  async store(url: string): Promise<StoredImage | null> {
    let bytes: Buffer;
    try {
      const response = await this.fetcher.fetch(url, { maxBytes: MAX_ENRICHMENT_IMAGE_BYTES });
      if (response.status !== 200) {
        this.logger.warn(`enrichment image fetch returned ${response.status}`);
        return null;
      }
      bytes = response.body;
    } catch (err) {
      // A refused host, a timeout, an oversized body, a dead upstream: all the same outcome
      // for the caller — this candidate does not become an image.
      this.logger.warn(`enrichment image fetch failed: ${(err as Error).message}`);
      return null;
    }

    // **The sniffer decides the type and the filename never does** (§12.5). The very first
    // real fetch in the spike produced a content-type/extension mismatch — Katz's `P18` is a
    // PNG served under a `.jpg` name — and these bytes come from a third party and go back
    // out INLINE into an `<img>`, which is the trust class that makes proving the container
    // mandatory rather than tidy. `sniffImageMimeType` also rejects SVG by construction (it
    // has no binary signature to match), which is the one image type that is a script
    // document.
    const mimeType = sniffImageMimeType(bytes);
    if (!mimeType) {
      this.logger.warn('enrichment image rejected: bytes are not a supported raster image');
      return null;
    }

    // Prefixed so the `@Public` content route can tell an enrichment blob from a document's
    // ciphertext in the one flat keyspace they share.
    const blobKey = `${ENRICHMENT_BLOB_KEY_PREFIX}${randomUUID()}`;
    await putObject(blobKey, bytes);
    return { blobKey, mimeType, sizeBytes: bytes.byteLength };
  }
}
