import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { SHARE_DETAIL_LEVEL } from '@waypoint/shared';
import {
  DEFAULT_PDF_CHROMIUM_PATH,
  PDF_CHROMIUM_PATH,
  PDF_RENDER_CONCURRENCY,
  PDF_RENDER_TIMEOUT_MS,
} from '../common/env';
import { NINE_DAY_REFERENCE_TRIP } from './itinerary-pdf.fixture';
import { generatedAtLabel, PdfBrowserService } from './pdf-browser.service';

const URL_UNDER_TEST = 'travelive.app/s/7Kq2mB9x';

/**
 * A mocked browser proves nothing about a PDF — the failure modes are pagination, a font
 * that did not load and Hebrew that came out as boxes, and none of them are visible to a
 * spy. So this drives a REAL Chromium wherever one is on the box: the container smoke
 * (`pdf-container-smoke.ts`) is the same check against the shipped image.
 */
const chromiumPath = [
  process.env[PDF_CHROMIUM_PATH],
  '/opt/pw-browsers/chromium',
  DEFAULT_PDF_CHROMIUM_PATH,
]
  .filter((candidate): candidate is string => Boolean(candidate))
  .find((candidate) => existsSync(candidate));

describe('generatedAtLabel', () => {
  it('stamps the paper in UTC, not in any trip zone', () => {
    // It says when the document was made, which is not a fact about the itinerary.
    expect(generatedAtLabel('2026-08-29T08:10:00.000Z')).toBe('29.08.2026 08:10');
    expect(generatedAtLabel('2026-01-05T23:07:00.000Z')).toBe('05.01.2026 23:07');
  });
});

describe('PdfBrowserService concurrency', () => {
  it('rejects queued work with a 503 rather than letting it hang', async () => {
    const previous = { ...process.env };
    process.env[PDF_RENDER_CONCURRENCY] = '1';
    process.env[PDF_RENDER_TIMEOUT_MS] = '50';
    const service = new PdfBrowserService();
    // A launch that never resolves holds the one slot, so the second caller queues.
    (service as unknown as { browser: Promise<unknown> }).browser = new Promise(() => undefined);

    const first = service.render(NINE_DAY_REFERENCE_TRIP, URL_UNDER_TEST);
    await expect(service.render(NINE_DAY_REFERENCE_TRIP, URL_UNDER_TEST)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    void first.catch(() => undefined);
    process.env = previous;
  });
});

describe.skipIf(!chromiumPath)('PdfBrowserService against a real Chromium', () => {
  const service = new PdfBrowserService();
  let pdf: Buffer;

  beforeAll(async () => {
    process.env[PDF_CHROMIUM_PATH] = chromiumPath;
    pdf = await service.render(NINE_DAY_REFERENCE_TRIP, URL_UNDER_TEST);
  }, 60_000);

  afterAll(() => service.onModuleDestroy());

  it('produces a real PDF', () => {
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(20_000);
  });

  it('lays the nine-day reference trip out on two A4 pages', () => {
    expect(countPages(pdf)).toBe(2);
  });

  it('keeps Summary to a single page', async () => {
    // **A Summary projection carries no stay moments**, so flipping only the level would
    // measure a page the server cannot produce: `stayMoments` returns `{}` below Full, and
    // the reference fixture is a Full one. The template prints what it is given and gates
    // nothing itself — the projection is the single gate (ADR-0096) — so the shaping belongs
    // here. It stopped being academic the day the fixture grew both moments (2026-09-01) and
    // this assertion went red on two lines per day card that no Summary reader ever sees.
    const summary = await service.render(
      {
        ...NINE_DAY_REFERENCE_TRIP,
        detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
        days: NINE_DAY_REFERENCE_TRIP.days.map(
          ({ checkIn: _checkIn, checkOut: _checkOut, ...day }) => day,
        ),
      },
      URL_UNDER_TEST,
    );
    expect(countPages(summary)).toBe(1);
  }, 60_000);

  it('renders a second document from the same browser', async () => {
    const again = await service.render(NINE_DAY_REFERENCE_TRIP, URL_UNDER_TEST);
    expect(again.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 60_000);
});

/** Page count straight off the object tree — `/Type /Page` occurrences, excluding `/Pages`.
 *  Enough to assert pagination without pulling a parser into the unit run; the container
 *  smoke uses `pdfjs-dist` for the fuller check. */
function countPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
