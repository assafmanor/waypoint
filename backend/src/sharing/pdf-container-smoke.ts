import { writeFileSync } from 'node:fs';
import { DENSE_REFERENCE_TRIP, NINE_DAY_REFERENCE_TRIP } from './itinerary-pdf.fixture';
import { PdfBrowserService } from './pdf-browser.service';
import { RenderBrowserService } from './render-browser.service';

/**
 * **Render one real PDF, in the real image, through the real service.**
 *
 * The unit spec proves the template and drives whatever Chromium is on a developer's box.
 * This is the other half, and it is the half that catches what actually breaks in
 * production: the runtime stage forgot to install `chromium`, the font files were not
 * copied forward, `--no-sandbox` is not enough in this base image, or the shared-memory
 * default is too small for a page this size. Every one of those is invisible until an image
 * is built and something inside it asks for a document.
 *
 * Deliberately not a spec: it runs as the container's entrypoint under `node`, with no
 * vitest, no source transform and no DATABASE_URL — the same shape the deployed process has.
 *
 * **Two documents, because one of them never broke.** The reference trip fits with room to
 * spare; what shipped wrong was a DENSE itinerary, whose pages the template had numbered by
 * its own arithmetic and whose footer then printed over the schedule. A smoke that renders
 * only the comfortable case is a smoke that was green through all of it.
 *
 *   node dist/sharing/pdf-container-smoke.js /out/sample.pdf /out/dense.pdf
 */
async function main(): Promise<void> {
  const outputs = process.argv.slice(2);
  if (outputs.length < 2) {
    throw new Error('usage: pdf-container-smoke <reference.pdf> <dense.pdf>');
  }

  const pool = new RenderBrowserService();
  const service = new PdfBrowserService(pool);
  try {
    for (const [index, projection] of [NINE_DAY_REFERENCE_TRIP, DENSE_REFERENCE_TRIP].entries()) {
      const pdf = await service.render(projection, 'travelive.app/s/7Kq2mB9x');
      writeFileSync(outputs[index], pdf);
      console.log(`wrote=${outputs[index]} bytes=${pdf.byteLength}`);
    }
  } finally {
    await pool.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
