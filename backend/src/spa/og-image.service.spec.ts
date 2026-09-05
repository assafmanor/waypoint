import { describe, expect, it } from 'vitest';
import type { RenderBrowserService } from '../sharing/render-browser.service';
import { OgImageService } from './og-image.service';
import type { TripPreviewFacts } from './share-meta';

const FACTS: TripPreviewFacts = {
  name: 'יפן 2026',
  destination: 'אוסקה',
  startDate: '2026-09-11',
  endDate: '2026-09-22',
  travellers: 3,
  icon: '🗻',
};

const PNG = Buffer.from('fake-png-bytes');

/**
 * A fake page rather than a real Chromium: what this file is about is the CACHE and the
 * FALLBACK, both of which are decided before any pixel exists. The artwork itself is proved
 * by `og-cover.template.spec.ts` (the markup) and by a real render — a spy could not tell a
 * correct cover from a blank one either way.
 */
function poolWith(screenshot: () => Promise<Buffer>): {
  pool: RenderBrowserService;
  pages: () => number;
} {
  let pages = 0;
  const page = {
    setViewportSize: () => Promise.resolve(),
    setContent: () => Promise.resolve(),
    evaluate: () => Promise.resolve(),
    locator: () => ({ screenshot }),
  };
  const pool = {
    timeoutMs: 5_000,
    withPage: (work: (p: unknown) => Promise<unknown>) => {
      pages += 1;
      return work(page);
    },
  } as unknown as RenderBrowserService;
  return { pool, pages: () => pages };
}

describe('OgImageService', () => {
  it('renders a cover for the trip', async () => {
    const { pool } = poolWith(() => Promise.resolve(PNG));
    await expect(new OgImageService(pool).render('invite', FACTS)).resolves.toEqual(PNG);
  });

  /**
   * **One pasted link is fetched by every chat service the message passes through**, and each
   * fetch would otherwise cost a browser tab on an unauthenticated route.
   */
  it('renders a given cover once and serves the rest from cache', async () => {
    const { pool, pages } = poolWith(() => Promise.resolve(PNG));
    const service = new OgImageService(pool);
    await service.render('invite', FACTS);
    await service.render('invite', { ...FACTS });
    expect(pages()).toBe(1);
  });

  /** The key is the picture, so a trip that changed is a miss rather than a stale hit —
   *  there is no invalidation path to forget to call. */
  it('re-renders when something the cover draws has changed', async () => {
    const { pool, pages } = poolWith(() => Promise.resolve(PNG));
    const service = new OgImageService(pool);
    await service.render('invite', FACTS);
    await service.render('invite', { ...FACTS, icon: '🗺️' });
    expect(pages()).toBe(2);
  });

  /** Two surfaces, two pictures, from one set of facts. */
  it('does not serve the live cover from the invitation’s entry', async () => {
    const { pool, pages } = poolWith(() => Promise.resolve(PNG));
    const service = new OgImageService(pool);
    await service.render('invite', FACTS);
    await service.render('live', FACTS);
    expect(pages()).toBe(2);
  });

  /**
   * **A failed render is never a failed preview.** A wedged or missing Chromium falls back to
   * the committed generic cover; with no built PWA to read it from (which is every test run,
   * ADR-0020) that is `null`, and the controller answers the same honest 404 the shell route
   * gives. What must not happen is the rejection propagating — a chat card would then show a
   * broken image rather than a plain one.
   */
  it('falls back instead of throwing when the render fails', async () => {
    // The `cover render failed` WARN in this suite's output is this test working: Nest's
    // Logger writes to stdout rather than through `console.warn`, so there is nothing a spy
    // here would suppress — and a spy that suppresses nothing is worse than the noise.
    const { pool } = poolWith(() => Promise.reject(new Error('chromium is gone')));
    await expect(new OgImageService(pool).render('invite', FACTS)).resolves.toBeNull();
  });

  /** And a failure is not cached: the next request tries again rather than inheriting a
   *  generic cover for the life of the process. */
  it('does not cache a failure', async () => {
    let attempts = 0;
    const { pool } = poolWith(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('transient')) : Promise.resolve(PNG);
    });
    const service = new OgImageService(pool);
    await service.render('invite', FACTS);
    await expect(service.render('invite', FACTS)).resolves.toEqual(PNG);
  });
});
