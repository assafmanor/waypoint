import { writeFileSync } from 'node:fs';
import { NINE_DAY_REFERENCE_TRIP } from './itinerary-pdf.fixture';
import { PdfBrowserService } from './pdf-browser.service';

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
 *   node dist/sharing/pdf-container-smoke.js /out/sample.pdf
 */
async function main(): Promise<void> {
  const out = process.argv[2];
  if (!out) throw new Error('usage: pdf-container-smoke <output.pdf>');

  const service = new PdfBrowserService();
  try {
    const pdf = await service.render(NINE_DAY_REFERENCE_TRIP, 'travelive.app/s/7Kq2mB9x');
    writeFileSync(out, pdf);
    console.log(`wrote=${out} bytes=${pdf.byteLength}`);
  } finally {
    await service.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
