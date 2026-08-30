import { describe, expect, it } from 'vitest';
import {
  SHARE_DAYPART,
  SHARE_OP_KIND,
  SHARE_DETAIL_LEVEL,
  type SharedItinerary,
} from '@waypoint/shared';
import {
  itineraryPdfFooterHtml,
  itineraryPdfHtml,
  resetPdfFontCache,
} from './itinerary-pdf.template';
import { PDF_COPY } from './itinerary-pdf.copy';
import { NINE_DAY_REFERENCE_TRIP } from './itinerary-pdf.fixture';

const QR = 'data:image/png;base64,iVBORw0KGgo=';

const input = (projection: SharedItinerary, photoDataUrls: Record<string, string> = {}) => ({
  projection,
  publicUrl: 'travelive.app/s/7Kq2mB9x',
  qrDataUrl: QR,
  generatedAtLabel: '29.08.2026 08:10',
  photoDataUrls,
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

  /** The same first-strong isolate the template wraps every foreign value in. */
  const auto = (value: string) => `\u2068${value}\u2069`;

  it('prints a daypart heading only above events that belong to it', () => {
    expect(full).toContain(PDF_COPY.dayparts[SHARE_DAYPART.MORNING]);
    // The fixture carries exactly one night event — the 01:40 aurora on day one, which is
    // there to exercise `sharePreviousNight` — so the heading appears exactly once.
    expect(full.match(new RegExp(PDF_COPY.dayparts[SHARE_DAYPART.NIGHT], 'g'))).toHaveLength(1);
    // …and no `צהריים` on a day that has nothing at noon: an empty section is never
    // projected, so this is the claim the heading is a group and not a spine.
    expect(full).not.toContain(
      PDF_COPY.dayparts[SHARE_DAYPART.FLEXIBLE] + '</span></header></section>',
    );
  });

  // **A flight has to say when it lands** (owner, 2026-08-30). Both ends were in the
  // projection all along and both renderers printed only the first, so an eleven-hour leg and
  // a forty-minute one were the same shape of line.
  it('prints a range where the event carries both ends, and one hour where it does not', () => {
    expect(full).toContain('09:20\u201314:05');
    // …and an event with only a start is untouched, not padded into a fake range.
    expect(full).toContain('15:00');
    expect(full).not.toContain('15:00\u201315:00');
  });

  // **The words the renderer owns** (ADR-0213's 2026-08-30 amendment). The projection ships
  // `{ kind, …values }`, so a day headline exists only if this file said it.
  it('says the derived day headlines and the booking captions in Hebrew', () => {
    expect(full).toContain(PDF_COPY.dayTitle.flightOut(auto('איסלנד')));
    expect(full).toContain(PDF_COPY.dayTitle.flightHome);
    // **The stay is the day's frame now**, so it prints in the header's second line
    // instead of the derived `לינה ב…` summary (ADR-0213's 2026-08-30 amendment).
    expect(full).toContain(PDF_COPY.stay(auto('Reykjavík')));
    expect(full).toContain('class="pdf-stay"');
    expect(full).toContain(PDF_COPY.bookingType.hotel);
    expect(full).toContain(PDF_COPY.bookingType.car);
  });

  // **The masthead said the trip's title twice** — here and in the lede one centimetre
  // below — which is what made the block read as an unexplained leak (owner, 2026-08-30).
  it('prints the trip title once, and no stop sample beside the QR', () => {
    expect(full.match(/רייקיאוויק ← סנייפלסנס/g)).toHaveLength(1);
    // **The teal strip is gone** (ADR-0213's 2026-08-30 amendment; owner: _"What's the
    // teal random places on top?"_). `routeLabels` is CAPPED, so it was never the route —
    // it came off the reader page first and printed here for a week longer.
    expect(full).not.toContain('class="pdf-route-mini"');
    expect(full).not.toContain(PDF_COPY.routeLabel);
    // And what took its place says what the trip is, from values already on the projection.
    expect(full).toContain('pdf-what');
    expect(full).toContain(NINE_DAY_REFERENCE_TRIP.trip.destination);
  });

  // Two lines by design rather than by wrapping, in the app's own date shape — it printed
  // `2026-09-11 - 2026-09-22 · 12 ימים · עודכן …` on one line and overflowed the column.
  it('splits the trip facts from the provenance stamp, in the app date shape', () => {
    expect(full).toContain('29.08–06.09');
    expect(full).not.toContain('2026-08-29 - 2026-09-06');
    expect(full).toContain('class="pdf-stamp"');
  });

  // `routeLabels` is capped; printing its length as the trip's stop count is what told a
  // long trip it had eight.
  it('counts the whole route rather than the drawn strip', () => {
    expect(NINE_DAY_REFERENCE_TRIP.trip.routeStopCount).toBeGreaterThan(
      NINE_DAY_REFERENCE_TRIP.trip.routeLabels.length,
    );
    expect(full).toContain(`<strong>⁦${NINE_DAY_REFERENCE_TRIP.trip.routeStopCount}⁩</strong>`);
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
      appendix: { ops: [{ kind: SHARE_OP_KIND.NOTE, title: 'רשימת ציוד', body: 'נעלי הליכה' }] },
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

  /**
   * **The amendment's rules must come LAST in the sheet**, and this is the guard for a
   * failure that is otherwise silent: `.pdf-event` is redefined at equal specificity, so
   * above the original it simply loses. The first render measured a 38px time cell against
   * 52.9px of ink and printed a flight's range over its own title — and the PDF smoke
   * verifier's `no-overprint` check passed the whole time, because an inline overflowing
   * its grid cell is not two runs colliding as far as the paginator is concerned.
   */
  it('places the overriding rules after the ones they override', () => {
    const override = full.lastIndexOf('.pdf-event{grid-template-columns:56px');
    const original = full.indexOf('.pdf-event{break-inside:avoid');
    expect(override).toBeGreaterThan(-1);
    expect(original).toBeGreaterThan(-1);
    expect(override).toBeGreaterThan(original);
  });

  it('prints a range only for a commitment, and a start for everything else', () => {
    // A flight has to say when it lands; a viewpoint's end is when somebody typed they
    // would leave, and a window there claims a precision the plan does not have.
    const times = [...full.matchAll(/class="pdf-event-time">([^<]*)</g)].map((m) =>
      m[1].replace(/[\u2066-\u2069]/g, ''),
    );
    expect(times.some((value) => value.includes('\u2013'))).toBe(true);
    expect(times.filter((value) => value.includes('\u2013')).length).toBeLessThan(times.length);
  });

  // **Hebrew must never be inside a mono element** (design-language: JetBrains Mono ships no
  // Hebrew glyphs). `.pdf-subtitle` was `font: … 'JetBrains Mono', monospace`, and the `font`
  // SHORTHAND replaces the family list — so Assistant was not behind it, the fallback was the
  // container's Liberation Mono, and `12 ימים · עודכן` printed as empty rectangles while the
  // headings two lines above were perfect. The check is structural rather than visual: no
  // element that sets a mono face may receive a Hebrew codepoint.
  it('keeps every Hebrew run out of a mono element', () => {
    const HEBREW = /[\u0590-\u05FF]/;
    for (const run of full.match(/<span class="pdf-num">[^<]*<\/span>/g) ?? []) {
      expect(HEBREW.test(run)).toBe(false);
    }
    // The rows that DO mix scripts must be set in Assistant, with mono scoped to the run.
    expect(full).toContain(
      ".pdf-subtitle{margin-block-start:6px;color:var(--pdf-muted);font:500 9px 'Assistant'",
    );
    expect(full).toContain(".pdf-num{font-family:'JetBrains Mono',monospace;}");
    // …and the subtitle really does carry both scripts, or the assertion above is vacuous.
    const subtitle = /<div class="pdf-subtitle">.*?<\/div>/s.exec(full)?.[0] ?? '';
    expect(HEBREW.test(subtitle)).toBe(true);
    expect(subtitle).toContain('class="pdf-num"');
  });

  // A composed line cannot sniff its own direction — see `itinerary-narrative.fallback.ts`.
  // The template's half of that is: isolate each value it joins, and never `dir="auto"` over
  // the join.
  it('isolates the values it joins, and lets none of those lines sniff', () => {
    const composed = [
      /<span class="pdf-day-copy">.*?<\/span><\/header>/s,
      // The masthead's own line, which joins the day count with the destination.
      /<div class="pdf-what">.*?<\/div>/s,
    ];
    for (const pattern of composed) {
      const block = pattern.exec(full)?.[0] ?? '';
      expect(block).not.toBe('');
      expect(block).not.toContain('dir="auto"');
    }
    // Every value the page prints arrives first-strong isolated.
    expect(full).toContain('\u2068');
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

// **The renderer aborts every request the page makes** (`PdfBrowserService`), so the day
// photo cannot arrive by URL the way it does on the reader page — it arrives as bytes, and
// the template's job is to use the bytes it was handed and to print nothing when it wasn't.
describe('day photos on paper', () => {
  const PHOTO_URL = '/enrichment/images/enr-abc123';
  const withPhoto: SharedItinerary = {
    ...NINE_DAY_REFERENCE_TRIP,
    days: NINE_DAY_REFERENCE_TRIP.days.map((day, index) =>
      index === 0
        ? { ...day, photo: { url: PHOTO_URL, of: 'Skogafoss', credit: 'CC BY-SA 4.0' } }
        : day,
    ),
  };
  const PHOTO_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQ';

  it('prints the inlined bytes, never the URL the page could not fetch', () => {
    const html = itineraryPdfHtml(input(withPhoto, { [PHOTO_URL]: PHOTO_DATA_URL }));
    expect(html).toContain(`<img class="pdf-shot" src="${PHOTO_DATA_URL}"`);
    expect(html).toContain('alt="Skogafoss"');
    expect(html).not.toContain(PHOTO_URL);
  });

  // A blob that has gone yields no entry, and a header that reserved a column for an image
  // it cannot draw leaves a 34px hole beside the date.
  it('falls back to the no-photo header when the bytes are missing', () => {
    const html = itineraryPdfHtml(input(withPhoto));
    expect(html).not.toContain('class="pdf-shot"');
    expect(html).toContain('class="pdf-day-head no-photo"');
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
