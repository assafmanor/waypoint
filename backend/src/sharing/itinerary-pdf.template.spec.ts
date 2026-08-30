import { describe, expect, it } from 'vitest';
import { SHARE_DAYPART, SHARE_DETAIL_LEVEL, type SharedItinerary } from '@waypoint/shared';
import {
  itineraryPdfFooterHtml,
  itineraryPdfHtml,
  resetPdfFontCache,
} from './itinerary-pdf.template';
import { PDF_COPY } from './itinerary-pdf.copy';
import { NINE_DAY_REFERENCE_TRIP } from './itinerary-pdf.fixture';

const QR = 'data:image/png;base64,iVBORw0KGgo=';

const input = (projection: SharedItinerary) => ({
  projection,
  publicUrl: 'travelive.app/s/7Kq2mB9x',
  qrDataUrl: QR,
  generatedAtLabel: '29.08.2026 08:10',
});

const render = (projection: SharedItinerary) => itineraryPdfHtml(input(projection));

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

  it('carries the written URL and the generated stamp', () => {
    expect(full).toContain('travelive.app/s/7Kq2mB9x');
    expect(full).toContain('29.08.2026 08:10');
  });

  // **The document does not paginate itself, and that is the point.** It used to slice the
  // days into groups of five, wrap each in a 297mm box and print the resulting arithmetic
  // as the page number — which a dense trip made false (five sheets numbered to three) and
  // whose absolutely-positioned footer then printed over the schedule. The days are one
  // flow; Chromium breaks it and Chromium counts it.
  it('lays the days out as one flow with no page boxes of its own', () => {
    expect(full).not.toContain('pdf-paper');
    expect(full).not.toContain('break-after:page');
    expect(full.match(/class="pdf-days"/g)).toHaveLength(1);
    expect(full.match(/class="pdf-day"/g)).toHaveLength(NINE_DAY_REFERENCE_TRIP.days.length);
    // The margins belong to `page.pdf()`, because the running footer sits in the margin box.
    expect(full).toContain('@page{size:A4;}');
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
    // After the whole schedule — it is the tail of the document, so it lands on whatever
    // page the days end on and never interrupts them.
    expect(everything.indexOf('class="pdf-ops"')).toBeGreaterThan(
      everything.lastIndexOf('class="pdf-day"'),
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
    // Six faces: two Assistant, two Secular One, one JetBrains Mono, one Noto Emoji.
    expect(fresh.match(/@font-face/g)).toHaveLength(6);
  });

  // An event's icon is an emoji and therefore content (`icons.ts`). The container has no
  // emoji coverage of its own, so a face that is merely absent prints rectangles — which is
  // what shipped, and which looked correct on every machine that has one.
  it('inlines an emoji face and asks for it after the app faces', () => {
    expect(full).toContain("font-family:'Noto Emoji'");
    expect(full).toContain("font-family:'Assistant','Noto Emoji'");
    const emojiFace = (full.match(/@font-face\{[^}]*Noto Emoji[^}]*\}/g) ?? [])[0] ?? '';
    expect(emojiFace).toContain('U+1F000-1FAFF');
    // Never the bidi isolates `ltr()` writes, which Assistant already carries.
    expect(emojiFace).not.toContain('U+2000-206F');
  });

  // The bug this caught: with no `unicode-range`, the Latin Assistant face wins for every
  // Hebrew codepoint and every title falls back to a system font. It still LOOKS right in a
  // container that has Hebrew coverage — the tell was a PDF whose Hebrew could not be
  // extracted at all. So the ranges are asserted, not just present.
  it('gives every face a unicode-range, and the Hebrew one to a Hebrew file', () => {
    const faces = full.match(/@font-face\{[^}]*\}/g) ?? [];
    expect(faces).toHaveLength(6);
    for (const face of faces) expect(face).toContain('unicode-range:');

    const hebrewFaces = faces.filter((face) => face.includes('U+0590-05FF'));
    expect(hebrewFaces).toHaveLength(2); // Assistant + Secular One
    // JetBrains Mono ships no Hebrew glyphs and must never be asked for any.
    expect(faces.filter((f) => f.includes('U+0590-05FF') && f.includes('JetBrains'))).toEqual([]);
  });
});

// The footer is a SEPARATE document Chromium renders into the page margin. It shares no
// stylesheet and no font with the page, and the container has no Hebrew coverage — so a
// footer that did not carry its own faces would print the word `עמוד` as boxes.
describe('itineraryPdfFooterHtml', () => {
  const footer = itineraryPdfFooterHtml(input(NINE_DAY_REFERENCE_TRIP));

  it('leaves both numbers to the paginator', () => {
    expect(footer).toContain('<span class="pageNumber"></span>');
    expect(footer).toContain('<span class="totalPages"></span>');
    expect(footer).toContain(PDF_COPY.pagePrefix);
    expect(footer).toContain(PDF_COPY.pageOf);
  });

  it('inlines its own fonts, because it inherits none from the page', () => {
    expect(footer).toContain('src:url(data:font/woff2;base64,');
    expect(footer).toContain("font-family:'Assistant'");
  });

  it('names the trip and the live link on every page, and escapes both', () => {
    expect(footer).toContain('travelive.app/s/7Kq2mB9x');
    expect(
      itineraryPdfFooterHtml(
        input({
          ...NINE_DAY_REFERENCE_TRIP,
          trip: { ...NINE_DAY_REFERENCE_TRIP.trip, name: '<script>alert(1)</script>' },
        }),
      ),
    ).toContain('&lt;script&gt;');
  });
});
