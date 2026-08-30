import { describe, expect, it } from 'vitest';
import { SHARE_DAYPART, SHARE_DETAIL_LEVEL, type SharedItinerary } from '@waypoint/shared';
import { itineraryPdfHtml, resetPdfFontCache } from './itinerary-pdf.template';
import { PDF_COPY } from './itinerary-pdf.copy';
import { NINE_DAY_REFERENCE_TRIP } from './itinerary-pdf.fixture';

const QR = 'data:image/png;base64,iVBORw0KGgo=';

const render = (projection: SharedItinerary) =>
  itineraryPdfHtml({
    projection,
    publicUrl: 'travelive.app/s/7Kq2mB9x',
    qrDataUrl: QR,
    generatedAtLabel: '29.08.2026 08:10',
  });

describe('itineraryPdfHtml', () => {
  const full = render(NINE_DAY_REFERENCE_TRIP);

  it('renders A4, break-safe, with none of the public page in it', () => {
    expect(full).toContain('@page{size:A4');
    expect(full).toContain('break-inside:avoid');
    // Not a screenshot of the reader: no accordion, no theme, no touch chrome.
    expect(full).not.toContain('accordion');
    expect(full).not.toContain('data-theme');
    expect(full).not.toContain('sh-day-head');
    // No touch floor on paper — ADR-0017's 44px is a rule about thumbs, and a printed
    // page that reserves room for one wastes a third of its density.
    expect(full).not.toContain('min-height:44px');
  });

  it('makes no outbound request — fonts and QR are inlined', () => {
    expect(full).not.toContain('<link');
    expect(full).toContain('src:url(data:font/woff2;base64,');
    expect(full).toContain(`src="${QR}"`);
    // The only http:// or https:// anywhere would be something the renderer cannot fetch.
    expect(full.match(/https?:\/\//g)).toBeNull();
  });

  it('carries the written URL, the generated stamp and a page count', () => {
    expect(full).toContain('travelive.app/s/7Kq2mB9x');
    expect(full).toContain('29.08.2026 08:10');
    expect(full).toContain(PDF_COPY.page(1, 2));
    expect(full).toContain(PDF_COPY.page(2, 2));
  });

  // ADR-0213 §4's density target for the nine-day reference trip.
  it('paginates the reference trip to two pages at Full and one at Summary', () => {
    expect(full.match(/class="pdf-paper"/g)).toHaveLength(2);
    const summary = render({
      ...NINE_DAY_REFERENCE_TRIP,
      detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
    });
    expect(summary.match(/class="pdf-paper"/g)).toHaveLength(1);
  });

  it('prints a daypart heading only above events that belong to it', () => {
    expect(full).toContain(PDF_COPY.dayparts[SHARE_DAYPART.MORNING]);
    // No event anywhere in the fixture is at night, so that heading must not appear.
    expect(full).not.toContain(PDF_COPY.dayparts[SHARE_DAYPART.NIGHT]);
  });

  it('shows exact times at Full and none at Summary', () => {
    expect(full).toContain('09:20');
    expect(
      render({ ...NINE_DAY_REFERENCE_TRIP, detailLevel: SHARE_DETAIL_LEVEL.SUMMARY }),
    ).not.toContain('09:20');
  });

  it('puts Everything material in a labelled appendix, on the last page only', () => {
    const everything = render({
      ...NINE_DAY_REFERENCE_TRIP,
      detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
      appendix: { bookingSecrets: [{ title: 'טיסה', lines: ['KEF-4821'] }] },
    });
    expect(everything).toContain(PDF_COPY.appendix.title);
    expect(everything.match(/class="pdf-ops"/g)).toHaveLength(1);
    // It belongs to the LAST sheet: measured against the final `<section class="pdf-paper">`
    // rather than the first mention of the class, which is in the stylesheet.
    expect(everything.indexOf('class="pdf-ops"')).toBeGreaterThan(
      everything.lastIndexOf('<section class="pdf-paper">'),
    );
  });

  // A title is trip data typed by a person. It must never become markup.
  it('escapes projected text rather than trusting it', () => {
    const injected = render({
      ...NINE_DAY_REFERENCE_TRIP,
      trip: { ...NINE_DAY_REFERENCE_TRIP.trip, name: '<script>alert(1)</script>' },
    });
    expect(injected).not.toContain('<script>alert(1)</script>');
    expect(injected).toContain('&lt;script&gt;');
  });

  it('finds the app fonts rather than falling back silently', () => {
    resetPdfFontCache();
    const fresh = render(NINE_DAY_REFERENCE_TRIP);
    // Five faces: two Assistant, two Secular One, one JetBrains Mono.
    expect(fresh.match(/@font-face/g)).toHaveLength(5);
  });

  // The bug this caught: with no `unicode-range`, the Latin Assistant face wins for every
  // Hebrew codepoint and every title falls back to a system font. It still LOOKS right in a
  // container that has Hebrew coverage — the tell was a PDF whose Hebrew could not be
  // extracted at all. So the ranges are asserted, not just present.
  it('gives every face a unicode-range, and the Hebrew one to a Hebrew file', () => {
    const faces = full.match(/@font-face\{[^}]*\}/g) ?? [];
    expect(faces).toHaveLength(5);
    for (const face of faces) expect(face).toContain('unicode-range:');

    const hebrewFaces = faces.filter((face) => face.includes('U+0590-05FF'));
    expect(hebrewFaces).toHaveLength(2); // Assistant + Secular One
    // JetBrains Mono ships no Hebrew glyphs and must never be asked for any.
    expect(faces.filter((f) => f.includes('U+0590-05FF') && f.includes('JetBrains'))).toEqual([]);
  });
});
