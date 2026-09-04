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

  /**
   * **The wedge that could not be reported and could not be recovered from** (2026-09-04).
   *
   * `page.evaluate` and `page.pdf` take no timeout — `pdf()`'s options have no `timeout` field
   * at all — so a Chromium that stopped answering hung the await forever. `release()` is in a
   * `finally` below it, so the render kept its slot: after `PDF_RENDER_CONCURRENCY` of them
   * every later caller queued behind slots nobody would give back and took the 503, and the
   * public PDF route stayed down until the process was replaced.
   *
   * Both halves are asserted, because the first without the second is the bug: the phase names
   * itself, AND the next caller is admitted rather than met with the busy answer.
   */
  it('gives its slot back when a render phase wedges, and says which phase', async () => {
    const previous = { ...process.env };
    process.env[PDF_RENDER_CONCURRENCY] = '1';
    process.env[PDF_RENDER_TIMEOUT_MS] = '50';
    const service = new PdfBrowserService();
    let closed = 0;
    const page = {
      route: () => Promise.resolve(),
      setContent: () => Promise.resolve(),
      evaluate: () => Promise.resolve(),
      pdf: () => new Promise(() => undefined),
      close: () => {
        closed += 1;
        return Promise.resolve();
      },
    };
    (service as unknown as { browser: Promise<unknown> }).browser = Promise.resolve({
      newPage: () => Promise.resolve(page),
    });

    try {
      await expect(service.render(NINE_DAY_REFERENCE_TRIP, URL_UNDER_TEST)).rejects.toThrow(
        /phase 'pdf'/,
      );
      expect(closed).toBe(1);
      // Admitted, and wedged the same way — not a `ServiceUnavailableException`, which is what
      // a slot nobody returned would have produced.
      await expect(service.render(NINE_DAY_REFERENCE_TRIP, URL_UNDER_TEST)).rejects.toThrow(
        /phase 'pdf'/,
      );
      expect(closed).toBe(2);
    } finally {
      process.env = previous;
    }
  });
});

/**
 * **What a real browser actually costs on the runner that ships this suite** (measured
 * 2026-09-04, off a green CI run and the one that went red).
 *
 * On a warm Playwright Chromium the whole render is **⁦0.8 s⁩** — launch ⁦133 ms⁩, `setContent`
 * ⁦190 ms⁩, `page.pdf` ⁦249 ms⁩. On CI's `ci` job it is not that browser: that job installs none
 * (the workflow says so — the container smoke is the check that owns a provisioned one), so
 * this falls through to the system `/usr/bin/chromium`, and it runs while the frontend suite
 * renders 293 files in parallel on the same box. There the file measured **⁦17,996 ms⁩** — the
 * slowest backend spec by seventeen times, against ⁦1,032 ms⁩ for the next one — of which
 * ~⁦14.5 s⁩ is the launch-and-first-render below and ~⁦1.5 s⁩ each is the two renders after it.
 *
 * **All three caps were one number, ⁦60 s⁩, and the three jobs are not one size.** Against the
 * two renders' ⁦1.7 s⁩ that is 35× and fine; against the hook's ⁦14.5 s⁩ it is **4×** — a budget,
 * not a hang-catcher, on the one step in this suite that is a PROCESS LAUNCH rather than
 * JavaScript and so degrades hardest exactly when the runner is busy. Only the hook moves.
 * It blew on 2026-09-04 and could report only `Hook timed out in 60000ms`, naming no phase.
 *
 * Sized off the PHASE bounds now, which is what makes these numbers derivable rather than
 * guessed: a render can spend at most `PDF_RENDER_TIMEOUT_MS` (⁦15 s⁩) in each of `setContent`,
 * the font wait and `page.pdf` (`withPhaseDeadline`), and a launch at most Playwright's own
 * ⁦30 s⁩. A cap above that sum can only fire on something no phase covers — and everything a
 * phase does cover now fails by name, in a second, instead of as an anonymous hook timeout a
 * minute later. Do not re-tighten these to the wall time; the wall time is not the ceiling.
 */
const LAUNCH_AND_RENDER_MS = 120_000;
const RENDER_MS = 60_000;

describe.skipIf(!chromiumPath)('PdfBrowserService against a real Chromium', () => {
  const service = new PdfBrowserService();
  let pdf: Buffer;

  beforeAll(async () => {
    process.env[PDF_CHROMIUM_PATH] = chromiumPath;
    pdf = await service.render(NINE_DAY_REFERENCE_TRIP, URL_UNDER_TEST);
  }, LAUNCH_AND_RENDER_MS);

  afterAll(() => service.onModuleDestroy());

  it('produces a real PDF', () => {
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(20_000);
  });

  it('lays the nine-day reference trip out on two A4 pages', () => {
    expect(countPages(pdf)).toBe(2);
  });

  it(
    'keeps Summary to a single page',
    async () => {
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
    },
    RENDER_MS,
  );

  it(
    'renders a second document from the same browser',
    async () => {
      const again = await service.render(NINE_DAY_REFERENCE_TRIP, URL_UNDER_TEST);
      expect(again.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    },
    RENDER_MS,
  );
});

/** Page count straight off the object tree — `/Type /Page` occurrences, excluding `/Pages`.
 *  Enough to assert pagination without pulling a parser into the unit run; the container
 *  smoke uses `pdfjs-dist` for the fuller check. */
function countPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
