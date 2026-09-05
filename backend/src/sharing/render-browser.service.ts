import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { chromium, type Browser, type Page } from 'playwright-core';
import {
  DEFAULT_PDF_CHROMIUM_PATH,
  DEFAULT_PDF_RENDER_CONCURRENCY,
  DEFAULT_PDF_RENDER_TIMEOUT_MS,
  PDF_CHROMIUM_PATH,
  PDF_RENDER_CONCURRENCY,
  PDF_RENDER_TIMEOUT_MS,
} from '../common/env';

/**
 * **A phase that cannot answer must not hold a slot forever** (2026-09-04).
 *
 * A render spends its deadline on `setContent` and then makes awaits Playwright gives no
 * timeout at all: `page.evaluate`, `page.pdf()` (whose options carry no `timeout` field,
 * checked in `types.d.ts` rather than assumed) and `locator.screenshot()`. A Chromium that
 * wedges in any of them hangs the render, and a hang costs more here than anywhere else:
 * `release()` sits in a `finally` that is never reached, so the wedged render keeps one of
 * `PDF_RENDER_CONCURRENCY` for the life of the process. Two of them and every later caller
 * queues behind a slot nobody will give back, takes the 503, and the public routes are down
 * until a deploy — the exact outcome the bound exists to prevent.
 *
 * The loser is left to reject later: `Promise.race` subscribes to both, so the abandoned call
 * settling after the deadline is already handled and never surfaces as an unhandled rejection
 * (the reasoning `frontend/src/lib/deadline.ts` states for the same shape). `page.close()` in
 * `withPage`'s `finally` is what actually settles it.
 */
export function withPhaseDeadline<T>(phase: string, ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`render phase '${phase}' did not settle within ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}

const numberEnv = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * **One Chromium, a hard cap on concurrent pages, and a deadline** — because this renders
 * on unauthenticated routes.
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
 * **The page reaches nothing.** All requests are aborted before any content is set, so what
 * arrives as bytes IN the document — the fonts, the QR, the day photos, a cover's brand mark
 * — is the whole of what it can load. A projection that somehow carried a remote URL could
 * not fetch it, which matters on a renderer that runs inside the production network.
 *
 * **Extracted from `PdfBrowserService` when the link-preview covers needed the same pool**
 * (ADR-0220's 2026-09-06 amendment) — rule 8's "generalize the one-off rather than add a
 * second one beside it". A second browser would double the memory ceiling this class exists
 * to bound, and the two callers would each have had their own idea of how many tabs is too
 * many. The env names stay `PDF_*`: they are one budget for one browser, and renaming them
 * would be a deploy-time break for a word.
 */
@Injectable()
export class RenderBrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(RenderBrowserService.name);
  private browser: Promise<Browser> | undefined;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  get concurrency(): number {
    return numberEnv(PDF_RENDER_CONCURRENCY, DEFAULT_PDF_RENDER_CONCURRENCY);
  }

  get timeoutMs(): number {
    return numberEnv(PDF_RENDER_TIMEOUT_MS, DEFAULT_PDF_RENDER_TIMEOUT_MS);
  }

  /** A page with the network already cut, a slot held for its lifetime, and both given back
   *  however it ends. Everything a caller does with the page happens inside `work`. */
  async withPage<T>(work: (page: Page) => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const browser = await this.launch();
      const page = await browser.newPage();
      try {
        // Before any `setContent`, so the document cannot make a single outbound request.
        await page.route('**/*', (route) => route.abort());
        return await work(page);
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
        // Do not cache a failed launch — a transient one would otherwise disable every
        // render for the life of the process.
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
        reject(new ServiceUnavailableException('renderer is busy'));
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
