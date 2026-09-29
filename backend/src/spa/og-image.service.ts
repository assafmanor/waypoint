import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { OG_COVER_FALLBACK } from '@waypoint/shared';
import { createByteLru } from '../common/byte-lru';
import { DEFAULT_OG_COVER_CACHE_MAX_BYTES, OG_COVER_CACHE_MAX_BYTES } from '../common/env';
import { RenderBrowserService } from '../sharing/render-browser.service';
import { coverHtml, coverSignature, type CoverKind } from './og-cover.template';
import type { TripPreviewFacts } from './share-meta';
import { STATIC_ROOT } from './spa-paths';

const COVER_WIDTH = 1200;
const COVER_HEIGHT = 630;

/** The committed cut of the same two templates, filled with `defaults.json`'s generic text.
 *  Served when a render cannot happen — see `render`. */
const FALLBACK_PNG: Record<CoverKind, string> = OG_COVER_FALLBACK;

function maxBytes(): number {
  const raw = process.env[OG_COVER_CACHE_MAX_BYTES];
  const parsed = raw ? Number(raw) : DEFAULT_OG_COVER_CACHE_MAX_BYTES;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OG_COVER_CACHE_MAX_BYTES;
}

/**
 * **The per-trip link-preview cover, rendered on demand and content-addressed**
 * (ADR-0220's 2026-09-06 amendment).
 *
 * **Why a cache is not optional here.** A crawler fetch costs a browser tab, and one pasted
 * link is fetched by every chat service the message passes through. The bound is
 * `byte-lru.ts` — the same primitive `blob-cache.ts` and the map's planet proxy use, rather
 * than a third hand-rolled Map (rule 8).
 *
 * **The key is the picture, not the trip.** `signature` hashes exactly the facts the cover
 * draws, so an entry cannot go stale: rename the trip, change its icon, move its dates, and
 * the key changes with them. That is also what makes the `?v=` on `og:image` correct — a
 * crawler that cached the old URL cached the old picture, and the new URL is a new picture.
 * There is no invalidation path to get wrong, because there is no invalidation.
 *
 * **A failed render is never a failed preview.** Chromium missing, wedged, or busy past the
 * pool's deadline falls back to the committed PNG for that surface — the generic cover the
 * link had before this existed. A chat card with a generic picture is a much smaller loss
 * than a card with a broken image, and it is the same trade `factsOr` makes one layer up.
 */
@Injectable()
export class OgImageService {
  private readonly logger = new Logger(OgImageService.name);
  private readonly cache = createByteLru(maxBytes);

  constructor(private readonly browser: RenderBrowserService) {}

  async render(kind: CoverKind, facts: TripPreviewFacts): Promise<Buffer | null> {
    const key = `${kind}:${coverSignature(kind, facts)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const html = coverHtml(kind, facts);
    if (html) {
      try {
        const png = await this.shoot(html);
        this.cache.put(key, png);
        return png;
      } catch (error: unknown) {
        this.logger.warn(`cover render failed (${kind}): ${String(error)}`);
      }
    }
    return this.generic(kind);
  }

  private shoot(html: string): Promise<Buffer> {
    return this.browser.shootElement(
      html,
      { width: COVER_WIDTH, height: COVER_HEIGHT },
      '.og-cover',
    );
  }

  /**
   * **The committed cover for this surface**, read from the built PWA's own public directory
   * — the same bytes the static route would serve.
   *
   * Two callers, one answer: a render that could not happen, and a code that did not resolve
   * (where there are no facts to draw and inventing some would be an existence oracle).
   * `null` when there is no built app at all (dev/test), where the caller answers 404 exactly
   * as the shell route does.
   */
  async generic(kind: CoverKind): Promise<Buffer | null> {
    try {
      return await readFile(join(STATIC_ROOT, FALLBACK_PNG[kind]));
    } catch {
      return null;
    }
  }
}
