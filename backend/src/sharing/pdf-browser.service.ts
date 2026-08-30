import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { chromium, type Browser } from 'playwright-core';
import QRCode from 'qrcode';
import { isEnrichmentBlobKey, type SharedItinerary } from '@waypoint/shared';
import {
  DEFAULT_PDF_CHROMIUM_PATH,
  DEFAULT_PDF_RENDER_CONCURRENCY,
  DEFAULT_PDF_RENDER_TIMEOUT_MS,
  PDF_CHROMIUM_PATH,
  PDF_RENDER_CONCURRENCY,
  PDF_RENDER_TIMEOUT_MS,
} from '../common/env';
import { sniffImageMimeType } from '../common/image-sniff';
import { getObject } from '../common/storage';
import { itineraryPdfFooterHtml, itineraryPdfHtml } from './itinerary-pdf.template';

/**
 * **The paper's margins, and they belong here rather than in the template's `@page`.**
 *
 * `displayHeaderFooter` renders the running footer INSIDE the bottom margin, so the two
 * numbers are one decision: the bottom band has to hold the footer and still leave air above
 * it. Generous rather than tight — a document read on paper is not a screen competing for
 * density, and the first pass at 12/13/15mm put the last day card against the footer.
 */
const PDF_PAGE_MARGIN = { top: '16mm', right: '17mm', bottom: '18mm', left: '17mm' } as const;

const numberEnv = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * **One Chromium, a hard cap on concurrent pages, and a deadline** — because this renders
 * on an unauthenticated route.
 *
 * Each render is a real browser tab holding tens of megabytes. A public endpoint with no
 * bound on how many may exist at once is a memory-exhaustion lever anyone holding a link
 * can pull, and the per-IP throttle in front of it does not help against many IPs. So:
 *
 * - the browser is **lazily launched once** and reused (a launch is ~300 ms and a process);
 * - at most `PDF_RENDER_CONCURRENCY` pages exist at any moment;
 * - work queued behind that cap is rejected after `PDF_RENDER_TIMEOUT_MS` with a 503 and a
 *   `Retry-After`, which is an honest answer — better than a request that never returns;
 * - every page is closed in `finally`, so a render that throws mid-way does not leak a tab.
 *
 * **The page reaches nothing.** All requests are aborted before the content is set, so what
 * arrives as bytes IN the document — the fonts, the QR, the day photos (`dayPhotoDataUrls`) —
 * is the whole of what it can load. A projection that somehow carried a remote URL could not
 * fetch it, which matters on a renderer that runs inside the production network.
 */
@Injectable()
export class PdfBrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfBrowserService.name);
  private browser: Promise<Browser> | undefined;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  private get concurrency(): number {
    return numberEnv(PDF_RENDER_CONCURRENCY, DEFAULT_PDF_RENDER_CONCURRENCY);
  }

  private get timeoutMs(): number {
    return numberEnv(PDF_RENDER_TIMEOUT_MS, DEFAULT_PDF_RENDER_TIMEOUT_MS);
  }

  async render(projection: SharedItinerary, publicUrl: string): Promise<Buffer> {
    await this.acquire();
    try {
      const browser = await this.launch();
      const page = await browser.newPage();
      try {
        // Before `setContent`, so the document cannot make a single outbound request.
        await page.route('**/*', (route) => route.abort());
        const input = {
          projection,
          publicUrl,
          qrDataUrl: await QRCode.toDataURL(`https://${publicUrl}`, { margin: 0, width: 176 }),
          generatedAtLabel: generatedAtLabel(projection.generatedAt),
          photoDataUrls: await dayPhotoDataUrls(projection),
        };
        await page.setContent(itineraryPdfHtml(input), {
          waitUntil: 'load',
          timeout: this.timeoutMs,
        });
        // The faces are `font-display: block` data URLs, so they resolve without the network
        // — but `load` fires before the last of them is applied, and a page printed a frame
        // early lays its Hebrew out in fallback metrics. Passed as a string because this
        // package compiles without the DOM lib: the expression runs in the page, not here.
        await page.evaluate('document.fonts.ready.then(() => undefined)');
        // **The page count is the paginator's, never ours** (see `itineraryPdfFooterHtml`).
        // `displayHeaderFooter` puts the running footer in the page MARGIN, which is why the
        // margins are declared here and the template's `@page` carries only the size: the
        // footer and the content cannot then be asked to share the same band.
        return Buffer.from(
          await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            displayHeaderFooter: true,
            // Chromium's default header is a date and a title in a font this container does
            // not have; an empty element is how you say "no header" and keep the footer.
            headerTemplate: '<span></span>',
            footerTemplate: itineraryPdfFooterHtml(input),
            margin: PDF_PAGE_MARGIN,
          }),
        );
      } finally {
        await page.close().catch(() => undefined);
      }
    } finally {
      this.release();
    }
  }

  private launch(): Promise<Browser> {
    this.browser ??= chromium
      .launch({
        executablePath: process.env[PDF_CHROMIUM_PATH] || DEFAULT_PDF_CHROMIUM_PATH,
        // The container runs as a single-tenant process rendering only our own HTML with
        // networking disabled, and it has no user namespaces to build a sandbox with.
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        headless: true,
      })
      .catch((error: unknown) => {
        // Do not cache a failed launch — a transient one would otherwise disable PDFs for
        // the life of the process.
        this.browser = undefined;
        throw error;
      });
    return this.browser;
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiting.indexOf(admit);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(new ServiceUnavailableException('PDF renderer is busy'));
      }, this.timeoutMs);
      const admit = () => {
        clearTimeout(timer);
        this.active++;
        resolve();
      };
      this.waiting.push(admit);
    });
  }

  private release(): void {
    this.active--;
    this.waiting.shift()?.();
  }

  async onModuleDestroy(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    if (!browser) return;
    await browser
      .then((instance) => instance.close())
      .catch((error: unknown) => this.logger.warn(`chromium close failed: ${String(error)}`));
  }
}

/**
 * **The day photos, inlined — because this page reaches nothing.**
 *
 * The route abort above is not a policy the renderer can make an exception to: it is what
 * makes a PDF of somebody's itinerary unable to phone anywhere. So a photo has to arrive
 * the way the QR and the fonts already do, as bytes in the document — the sibling field of
 * `qrDataUrl` in the render input.
 *
 * Keyed by the projection's own root-relative URL, so the template looks up exactly what it
 * would otherwise have put in `src`. A blob that has gone (a refresh replaced it, an
 * ephemeral disk lost it) simply yields no entry, and the template prints no image — the
 * same degradation the public page gets from a 404.
 */
async function dayPhotoDataUrls(projection: SharedItinerary): Promise<Record<string, string>> {
  const urls = [...new Set(projection.days.flatMap((day) => day.photo?.url ?? []))];
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

/** `DD.MM.YYYY HH:MM` in UTC. The stamp says when the paper was made, not when anything on
 *  it happens — so it is deliberately not in any trip's display zone. */
export function generatedAtLabel(iso: string): string {
  const at = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${pad(at.getUTCDate())}.${pad(at.getUTCMonth() + 1)}.${at.getUTCFullYear()} ` +
    `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`
  );
}
