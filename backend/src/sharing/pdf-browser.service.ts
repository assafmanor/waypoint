import { Injectable } from '@nestjs/common';
import QRCode from 'qrcode';
import { isEnrichmentBlobKey, type SharedItinerary } from '@waypoint/shared';
import { sniffImageMimeType } from '../common/image-sniff';
import { getObject } from '../common/storage';
import { itineraryPdfFooterHtml, itineraryPdfHtml } from './itinerary-pdf.template';
import { RenderBrowserService, withPhaseDeadline } from './render-browser.service';
import { tripBookHtml } from './trip-book.template';
import type { TripRecord } from './trip-recap.service';

/**
 * **The paper's margins, and they belong here rather than in the template's `@page`.**
 *
 * `displayHeaderFooter` renders the running footer INSIDE the bottom margin, so the two
 * numbers are one decision: the bottom band has to hold the footer and still leave air above
 * it. Generous rather than tight — a document read on paper is not a screen competing for
 * density, and the first pass at 12/13/15mm put the last day card against the footer.
 */
const PDF_PAGE_MARGIN = { top: '16mm', right: '17mm', bottom: '18mm', left: '17mm' } as const;

/**
 * **The itinerary PDF's own render**, on the shared browser pool.
 *
 * The pool — one lazily-launched Chromium, `PDF_RENDER_CONCURRENCY` pages at most, a
 * deadline, a page that reaches nothing — is `RenderBrowserService`, which this class held
 * inline until the link-preview covers needed the identical bound (ADR-0220's 2026-09-06
 * amendment). What is left here is the part that is about a PDF: the paper's margins, the
 * running footer, the fonts wait, and the photos that have to arrive as bytes.
 */
@Injectable()
export class PdfBrowserService {
  constructor(private readonly browser: RenderBrowserService) {}

  async render(projection: SharedItinerary, publicUrl: string): Promise<Buffer> {
    const input = {
      projection,
      publicUrl,
      qrDataUrl: await qrOf(publicUrl),
      generatedAtLabel: generatedAtLabel(projection.generatedAt),
      photoDataUrls: await photoDataUrls(dayPhotoUrls(projection)),
    };
    return this.print(itineraryPdfHtml(input), itineraryPdfFooterHtml(input));
  }

  /** **The trip book** (ADR-0241 §6): the record's projection and the recap, on the itinerary's
   *  paper, footer and QR. The cover's picture rides the day photos' path. */
  async renderBook(
    projection: SharedItinerary,
    record: TripRecord,
    publicUrl: string,
  ): Promise<Buffer> {
    const cover = record.recap.cover ? [record.recap.cover.url] : [];
    const html = tripBookHtml({
      projection,
      record,
      publicUrl,
      qrDataUrl: await qrOf(publicUrl),
      photoDataUrls: await photoDataUrls([...dayPhotoUrls(projection), ...cover]),
    });
    const footer = itineraryPdfFooterHtml({
      projection,
      publicUrl,
      generatedAtLabel: generatedAtLabel(projection.generatedAt),
    });
    return this.print(html, footer);
  }

  private async print(html: string, footerTemplate: string): Promise<Buffer> {
    const timeoutMs = this.browser.timeoutMs;
    return this.browser.withPage(async (page) => {
      await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
      // The faces are `font-display: block` data URLs, so they resolve without the network
      // — but `load` fires before the last of them is applied, and a page printed a frame
      // early lays its Hebrew out in fallback metrics. Passed as a string because this
      // package compiles without the DOM lib: the expression runs in the page, not here.
      await withPhaseDeadline(
        'fonts',
        timeoutMs,
        page.evaluate('document.fonts.ready.then(() => undefined)'),
      );
      // **The page count is the paginator's, never ours** (see `itineraryPdfFooterHtml`).
      // `displayHeaderFooter` puts the running footer in the page MARGIN, which is why the
      // margins are declared here and the template's `@page` carries only the size: the
      // footer and the content cannot then be asked to share the same band.
      return Buffer.from(
        await withPhaseDeadline(
          'pdf',
          timeoutMs,
          page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            displayHeaderFooter: true,
            // Chromium's default header is a date and a title in a font this container does
            // not have; an empty element is how you say "no header" and keep the footer.
            headerTemplate: '<span></span>',
            footerTemplate,
            margin: PDF_PAGE_MARGIN,
          }),
        ),
      );
    });
  }
}

const qrOf = (publicUrl: string): Promise<string> =>
  QRCode.toDataURL(`https://${publicUrl}`, { margin: 0, width: 176 });

const dayPhotoUrls = (projection: SharedItinerary): string[] =>
  projection.days.flatMap((day) => day.photo?.url ?? []);

/**
 * **The photos, inlined — because this page reaches nothing.**
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
async function photoDataUrls(photoUrls: readonly string[]): Promise<Record<string, string>> {
  const urls = [...new Set(photoUrls)];
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
