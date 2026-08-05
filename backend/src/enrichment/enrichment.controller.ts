// The stored enrichment image's bytes — the route `enrichmentImageContentPath` names
// (ADR-0166 §7, Phase 2). The mirror of the avatar content route (ADR-0133 §12), for the same
// structural reason and with the same headers.
//
// **`@Public` on purpose.** An `<img>` cannot send a bearer token, so an authenticated route
// would force every thumbnail through a fetch-to-object-URL dance in a presentational
// primitive — and it would break the offline half outright, since the service worker caches
// same-origin immutable GETs and not authenticated fetches. Non-negotiable rule 5 (enriched
// thumbnails work offline) is the whole reason §2 insisted these bytes be ours rather than
// hotlinked, and an auth-guarded route would give that back.
//
// The trust-class question is easier here than it was for avatars, not harder: these are
// **published Commons files** about public places, already served to the world by
// upload.wikimedia.org under a free license. There is nothing to protect, and unlike an avatar
// there is not even a face. What *is* protected is the rest of the bucket — see the key-prefix
// check below.
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { isEnrichmentBlobKey } from '@waypoint/shared';
import { Public } from '../auth/public.decorator';
import { sniffImageMimeType } from '../common/image-sniff';
import { getObject } from '../common/storage';

/** The subset of the response we touch — same shape the avatar route declares. */
interface ImageResponse {
  setHeader(name: string, value: string): void;
  send(body: Buffer): void;
}

/** A year. The URL carries the blob's own id, so it can never serve different bytes — the only
 *  reason not to cache it forever is that "forever" isn't a real value. */
const IMAGE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 365;

@ApiTags('enrichment')
@Controller('enrichment')
export class EnrichmentImageController {
  @Get('images/:key')
  @Public()
  @ApiExcludeEndpoint()
  async getImage(@Param('key') key: string, @Res() res: ImageResponse): Promise<void> {
    // **The prefix is the access check.** `common/storage.ts` is one flat keyspace shared with
    // document blobs and avatars, so without this an unauthenticated caller could ask this
    // route for a document's ciphertext. Documents are trip-scoped, encrypted at rest and
    // auth-guarded (ADR-0015/0034); handing out even their ciphertext is a weakening nobody
    // asked for, and one string comparison closes it.
    if (!isEnrichmentBlobKey(key)) throw new NotFoundException('Image not found');

    let buffer: Buffer;
    try {
      // Read-through memory → filesystem → S3 (ADR-0055), via `storage.ts`'s own blob-cache
      // tier. Second consumer of a cache that already existed, not a new one.
      buffer = await getObject(key);
    } catch {
      // A deleted blob (a refresh replaced it), a key that was never real, or bytes gone
      // missing: all the same 404, and all of them must degrade to the no-image state rather
      // than a broken image.
      throw new NotFoundException('Image not found');
    }

    // The type is re-derived from the BYTES, never echoed from what a third party said they
    // were, and `nosniff` pins the browser to it — together that is what makes serving this
    // inline safe. The CSP is belt-and-braces for a direct navigation to this URL: nothing
    // this response can reference is allowed to load.
    const mimeType = sniffImageMimeType(buffer);
    if (!mimeType) throw new NotFoundException('Image not found');

    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', 'inline');
    // Immutable is honest, not optimistic: the key IS the blob's id, so these bytes can never
    // change at this URL — a refresh mints a new key and a new URL.
    res.setHeader('Cache-Control', `public, max-age=${IMAGE_CACHE_TTL_SECONDS}, immutable`);
    res.send(buffer);
  }
}
