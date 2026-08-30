import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { chromium, type Browser } from 'playwright-core';
import QRCode from 'qrcode';
import type { SharedItinerary } from '@waypoint/shared';
import {
  DEFAULT_PDF_CHROMIUM_PATH,
  DEFAULT_PDF_RENDER_CONCURRENCY,
  DEFAULT_PDF_RENDER_TIMEOUT_MS,
  PDF_CHROMIUM_PATH,
  PDF_RENDER_CONCURRENCY,
  PDF_RENDER_TIMEOUT_MS,
} from '../common/env';
import { itineraryPdfHtml } from './itinerary-pdf.template';

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
 * **The page reaches nothing.** All requests are aborted before the content is set, so the
 * template's fonts (inlined as data URLs) and its QR (a data URL too) are the whole of what
 * it can load. A projection that somehow carried a remote URL could not fetch it, which
 * matters on a renderer that runs inside the production network.
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
        await page.setContent(
          itineraryPdfHtml({
            projection,
            publicUrl,
            qrDataUrl: await QRCode.toDataURL(`https://${publicUrl}`, { margin: 0, width: 176 }),
            generatedAtLabel: generatedAtLabel(projection.generatedAt),
          }),
          { waitUntil: 'load', timeout: this.timeoutMs },
        );
        // `preferCSSPageSize` so the template's own `@page { size: A4 }` is authoritative
        // rather than a second size declared here that could drift from it.
        return Buffer.from(
          await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }),
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
