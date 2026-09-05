import { describe, expect, it } from 'vitest';
import {
  NARRATIVE_SEPARATOR,
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
import { PDF_COPY } from './hebrew.copy';
// `DENSE_REFERENCE_TRIP` is no longer imported here: the only test that rendered it was the
// journey-block guard, which matched zero blocks in it (2026-09-01). The dense trip's real
// guard is `pdf-container-smoke`'s page count, which still renders it.
import { NINE_DAY_REFERENCE_TRIP } from './itinerary-pdf.fixture';

const QR = 'data:image/png;base64,iVBORw0KGgo=';

/** One event row's time cell and its contents. `.pdf-event-copy` always follows it, which is
 *  what lets a lazy match reach the cell's OWN close tag rather than a nested one. */
const TIME_CELL = /<span class="pdf-event-time">([\s\S]*?)<\/span><span class="pdf-event-copy">/g;

/** The WORDS a cell prints, with its markup and its bidi isolates taken back off. The cell
 *  holds markup since 2026-08-31 (a flexible word is set in Assistant while its clock stays
 *  mono), so no assertion about what paper says can read the raw HTML. */
const strip = (html: string): string =>
  html.replace(/<[^>]*>/g, '').replace(/[\u2066-\u2069]/g, '');

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

  /**
   * **AMENDED 2026-08-31.** This asserted the rule ADR-0213 §6 set — a range only where the
   * end is a commitment — and the owner reversed it: _"whenever there's a time range, we
   * should display it. That also includes flexible times like starting from.. Or until..."_.
   * Paper now spells what `edgeMeaning` says, exactly as the reader page does.
   *
   * The old assertion was ALSO too loose to have caught the change: "some rows carry a dash
   * and not all of them" is true under either rule, so it would have stayed green while the
   * behaviour inverted. The four arms are named individually here for that reason.
   */
  it('spells each of the four time meanings, and gates none of them on `hard`', () => {
    // **The cell holds MARKUP now**, since the flexible words are set in Assistant while
    // their clock stays mono (2026-08-31). It is always followed by `.pdf-event-copy`, which
    // is what makes the lazy match exact rather than stopping at a nested close tag.
    const timesOf = (html: string) => [...html.matchAll(TIME_CELL)].map((m) => strip(m[1]));

    const day = NINE_DAY_REFERENCE_TRIP.days[0]!;
    const arms = render({
      ...NINE_DAY_REFERENCE_TRIP,
      days: [
        {
          ...day,
          sections: [
            {
              daypart: SHARE_DAYPART.MORNING,
              events: [
                // A SOFT span, which is the row §6's rule silently truncated.
                {
                  title: 'מסלול רייקיאדלור',
                  daypart: SHARE_DAYPART.MORNING,
                  time: { label: '10:00', endLabel: '12:00', meaning: 'exact' },
                },
                {
                  title: 'מוזיאון',
                  daypart: SHARE_DAYPART.MORNING,
                  time: { label: '13:00', meaning: 'exact' },
                },
                {
                  title: 'השכרת רכב',
                  daypart: SHARE_DAYPART.MORNING,
                  hard: true,
                  time: { label: '10:00', meaning: 'not-before' },
                },
                {
                  title: 'עזיבת הגסטהאוס',
                  daypart: SHARE_DAYPART.MORNING,
                  hard: true,
                  time: { label: '11:00', meaning: 'not-after' },
                },
                {
                  title: 'The Hill Hotel',
                  daypart: SHARE_DAYPART.MORNING,
                  hard: true,
                  time: { label: '17:00', endLabel: '21:00', meaning: 'window' },
                },
              ],
            },
          ],
        },
      ],
    });
    const times = timesOf(arms);
    // A soft span keeps BOTH ends — the change itself, and the row the two renderers
    // disagreed about (the reader page has always printed it).
    expect(times).toContain('10:00\u201312:00');
    expect(times).toContain('13:00');
    // A floor and a deadline say which they are, rather than printing a bare clock that
    // reads as an appointment.
    expect(times).toContain(PDF_COPY.timeFrom('10:00'));
    expect(times).toContain(PDF_COPY.timeUntil('11:00'));
    // A closed window prints both bounds (ADR-0184 §1).
    expect(times).toContain('17:00\u201321:00');
    // …and none of it came from `hard`: the two rows carrying a range here are the SOFT
    // hike and the hotel window, while the hard car hire deliberately carries none.
    expect(times).not.toContain('10:00\u201318:00');
  });

  // **Hebrew must never be inside a mono element** (design-language: JetBrains Mono ships no
  // Hebrew glyphs). `.pdf-subtitle` was `font: … 'JetBrains Mono', monospace`, and the `font`
  // SHORTHAND replaces the family list — so Assistant was not behind it, the fallback was the
  // container's Liberation Mono, and `12 ימים · עודכן` printed as empty rectangles while the
  // headings two lines above were perfect. The check is structural rather than visual: no
  // element that sets a mono face may receive a Hebrew codepoint.
  /** **The untimed cell, which is prose in a mono box** — the older half of the same defect,
   *  found by widening the guard below rather than by looking. Pinned separately because the
   *  reference trip has no untimed row, so the guard alone would go quiet the moment one
   *  stopped being rendered. */
  it('wraps the flexible word so it is not asked of a Latin-only face', () => {
    const withUntimed = render({
      ...NINE_DAY_REFERENCE_TRIP,
      days: [
        {
          ...NINE_DAY_REFERENCE_TRIP.days[0]!,
          sections: [
            {
              daypart: SHARE_DAYPART.FLEXIBLE,
              events: [{ title: 'שוק הפשפשים', daypart: SHARE_DAYPART.FLEXIBLE }],
            },
          ],
        },
      ],
    });
    expect(withUntimed).toContain(`<span class="pdf-word">${PDF_COPY.dayparts.flexible}</span>`);
  });

  it('keeps every Hebrew run out of a mono element', () => {
    const HEBREW = /[\u0590-\u05FF]/;
    for (const run of full.match(/<span class="pdf-num">[^<]*<\/span>/g) ?? []) {
      expect(HEBREW.test(run)).toBe(false);
    }
    // **`.pdf-num` was the whole of this check, and that is how the tofu shipped**
    // (2026-08-31). `.pdf-event-time` is a SECOND element setting a mono `font` shorthand,
    // and it only ever held digits until the flexible edges put `מ-`/`עד` in it — so the
    // loop above was true and useless. Every element that names a mono face is listed here
    // now, and a mixed-script one must scope the mono to an inner run.
    for (const run of full.match(/<span class="pdf-mono">[^<]*<\/span>/g) ?? []) {
      expect(HEBREW.test(run)).toBe(false);
    }
    for (const [, cell] of full.matchAll(TIME_CELL)) {
      // Hebrew may appear in the cell, but ONLY inside `.pdf-word`, which re-sets Assistant.
      // Everything else there inherits the cell's mono shorthand and would print boxes.
      expect(HEBREW.test(cell.replace(/<span class="pdf-word">[\s\S]*<\/span>/g, ''))).toBe(false);
    }
    // The rows that DO mix scripts must be set in Assistant, with mono scoped to the run.
    expect(full).toContain(
      ".pdf-subtitle{margin-block-start:6px;color:var(--pdf-muted);font:500 9px 'Assistant'",
    );
    expect(full).toContain(".pdf-num{font-family:'JetBrains Mono',monospace;}");
    // …and the time cell's escape hatch really is declared, or the carve-out above lets a
    // Hebrew run through on the word of a class nothing defines.
    expect(full).toContain(".pdf-word{font-family:'Assistant',sans-serif;}");
    // …and the subtitle really does carry both scripts, or the assertion above is vacuous.
    const subtitle = /<div class="pdf-subtitle">.*?<\/div>/s.exec(full)?.[0] ?? '';
    expect(HEBREW.test(subtitle)).toBe(true);
    expect(subtitle).toContain('class="pdf-num"');
  });

  /**
   * **A number-and-unit span reads number-first, and the isolate is what breaks that**
   * (owner, 2026-08-31: _"it shows שע׳ 3:30 instead of 3:30 שע׳"_).
   *
   * `pdfSpan` composes `3:30 שע׳`, which is correct as bare text in the RTL flow — the flow
   * puts the first logical run at the right. Wrapping it in `ltr()` forces the whole run
   * left-to-right, so the reader meets the unit first. Two call sites shipped it (the facts
   * line and the layover), and the assertion is the absence of U+2066 in front of the phrase
   * rather than a rendered position, because the string is where the defect is.
   */
  it('prints a duration span without forcing it left-to-right', () => {
    const spans = full.match(/\u2066[^\u2069]*(?:שע׳|דק׳|שעתיים|שעה)[^\u2069]*\u2069/g) ?? [];
    expect(spans).toEqual([]);
    // …and the phrases really are on the page, so the assertion above is not vacuous.
    expect(full).toMatch(/\d+:\d+ שע׳|\d+ דק׳|שעתיים|שעה/);
  });

  /**
   * **A card covering two days names both of them, weekday included.** `21–22 שני` says the
   * card is Monday when it is also Tuesday (owner, 2026-08-31). No shared fixture carries a
   * spanned day, so the case is built here — one day given the next one's date as its
   * `endDate`, which is exactly what `absorbSpannedDays` produces.
   */
  it('prints both weekdays on a day that swallowed the one a journey flew through', () => {
    const [first, second] = NINE_DAY_REFERENCE_TRIP.days;
    const spanned: SharedItinerary = {
      ...NINE_DAY_REFERENCE_TRIP,
      days: [{ ...first, endDate: second.date }, ...NINE_DAY_REFERENCE_TRIP.days.slice(2)],
    };
    const block = /<span class="pdf-date">.*?<\/span><\/span>/s.exec(
      itineraryPdfHtml(input(spanned)),
    )?.[0];
    expect(block).toBeDefined();
    // Both halves of the header are ranges: the number, and the weekday under it.
    expect(/<strong>[^<]*\u2013[^<]*<\/strong>/.test(block ?? '')).toBe(true);
    const weekday = /<span>([^<]*)<\/span><\/span>$/.exec(block ?? '')?.[1] ?? '';
    expect(weekday).toContain('\u2013');
  });

  /** Every journey block the reference trip draws. Named because it is what makes the two
   *  assertions below MEAN anything: until 2026-09-01 no fixture in the repo had a chained
   *  journey, so a `for` over this list ran zero times and reported green forever. */
  const treks = (html: string) => html.match(/<div class="pdf-trek">[\s\S]*?<\/div><\/div>/g) ?? [];

  /** The first journey block, refusing outright if the fixture has none — the assertion that
   *  turns every check below from "vacuously true" into a claim about paper. */
  const firstTrek = (html: string): string => {
    const [trek] = treks(html);
    expect(trek, 'no journey block in the reference trip').toBeTruthy();
    return trek!;
  };

  /** A leg prints its clock and its flight code; the totals are the frame's (owner,
   *  2026-08-31). Four durations on one flight is what this removes. */
  it('prints no facts line inside a journey block', () => {
    const blocks = treks(full);
    expect(blocks.length, 'no journey block in the reference trip').toBeGreaterThan(0);
    for (const trek of blocks) expect(trek).not.toContain('pdf-facts-line');
  });

  /**
   * **A CHAINED JOURNEY KEEPS ITS ATTACHMENTS, ON PAPER TOO** (found 2026-09-01 while
   * auditing the same row shape the head's clock came from — owner: _"possibly leading to
   * more"_, and it did).
   *
   * `eventRow` did `if (event.legs?.length) return journey + legRows(event)` and stopped, so
   * the caption and the ops fold were dropped for a chain — a printout of a connecting flight
   * carried no confirmation number, which is the one thing a printout is FOR. The comment
   * directly above that early return already claimed the attachments "ride inside"; nothing
   * implemented it, and the reader page's own guard (_"keeps a journey row's ops fold inside
   * the container"_) had no paper twin.
   */
  it('keeps a chained journey’s caption and ops fold inside the container', () => {
    const trek = firstTrek(full);
    // The confirmation number is inside the block, not merely somewhere on the page — the
    // appendix also prints codes, so an unscoped search would pass on a dropped fold.
    expect(strip(trek)).toContain('KEF-4821');
    expect(strip(trek)).toContain('צ׳ק-אין מקוון נפתח 24 שעות לפני');
    expect(strip(trek)).toContain('שדה התעופה קפלאוויק');
  });

  /**
   * **THE HEAD STATES THE WHOLE JOURNEY, NOT LEG ONE** (owner, 2026-09-01, with a screenshot
   * of each renderer side by side: _"The pdf shows on the title row the flight times wrong,
   * it only shows the first flight and not the overall journey. The live sharing page shows
   * this correctly"_).
   *
   * The defect was in the projection — `endLabel` was overridden for a chain and `time` was
   * not — but only paper could show it, because the reader page composed its own span from
   * `startLabel`/`endLabel` instead of reading the contract. So the assertion lives here, on
   * the renderer that obeys the field.
   */
  it('states the journey’s whole span on the block head, not the first leg’s', () => {
    const trek = firstTrek(full);
    const head = /<div class="pdf-trek-head">[\s\S]*?<\/div>/.exec(trek)?.[0] ?? '';
    const legTimes = [...trek.matchAll(TIME_CELL)].map(([, cell]) => strip(cell));

    // 02:20 to 15:25 — the first leg's departure and the LAST leg's arrival.
    expect(strip(head)).toContain('02:20\u201315:25');
    // And not leg one's own range, which is what it printed.
    expect(strip(head)).not.toContain('02:20\u201305:50');
    // The legs still carry their own clocks, so the fix did not move the span down a level.
    expect(legTimes).toContain('02:20\u201305:50');
    expect(legTimes).toContain('11:10\u201315:25');
  });

  /**
   * **THE STAY'S TWO MOMENTS ARE TWO LINES, ON PAPER AS ON THE READER** (owner, 2026-09-01:
   * _"I wanted a line break between the check out and check in times"_).
   *
   * They were joined by the narrative separator here, on the reasoning that half an A4 column
   * is wide enough that the run never wraps — which is true and answers the wrong question:
   * the break is how the two moments read, not a wrap being repaired, and the two renderers
   * must not teach different shapes for one line (ADR-0159 §1).
   */
  it('breaks the stay’s two moments onto their own lines, with no separator between them', () => {
    // The FIRST day leaves nothing behind it, so it carries one moment; the transfer days
    // carry both, and both is the shape the break is about.
    const headers = full.match(/<span class="pdf-day-copy">[\s\S]*?<\/header>/g) ?? [];
    const lines = headers
      .filter((block) => block.includes('pdf-stay-when'))
      .map((block) => block.slice(block.indexOf('<span class="pdf-stay-when">')));
    expect(lines.length, 'no stay-when line in the reference trip').toBeGreaterThan(0);

    const both = lines.filter(
      (line) => line.includes(PDF_COPY.checkOut('')) && line.includes(PDF_COPY.checkIn('')),
    );
    expect(both.length, 'no day carries both moments').toBeGreaterThan(0);
    for (const line of both) {
      expect((line.match(/class="pdf-moment"/g) ?? []).length).toBe(2);
      // The `·` is what put a noun on one line and its own clock on the next.
      expect(line).not.toContain(NARRATIVE_SEPARATOR);
    }
    // Every moment is a block, on a one-moment day too — so a day with one never quietly
    // becomes the inline shape the pair was joined in.
    for (const line of lines) expect(line).toContain('class="pdf-moment"');
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

// **What paper can and cannot carry**, and the font that decides whether it carries Hebrew
// at all (owner, 2026-08-30).
describe('the appendix on paper', () => {
  const withOps = (ops: SharedItinerary['appendix']) => ({
    ...NINE_DAY_REFERENCE_TRIP,
    detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
    appendix: ops,
  });

  it('sets the ops line in Assistant, because JetBrains Mono ships no Hebrew', () => {
    const css = render(NINE_DAY_REFERENCE_TRIP);
    const rule = css.match(/\.pdf-ops-line\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain("'Assistant'");
    expect(rule).not.toContain('JetBrains');
    // The one value that may be mono is a confirmation code, which is ASCII by construction.
    expect(css).toMatch(/\.pdf-mono\{[^}]*JetBrains/);
  });

  it('never prints a file, because paper cannot be tapped', () => {
    const html = render(
      withOps({
        ops: [
          {
            kind: SHARE_OP_KIND.FILE,
            handle: 'd1',
            title: 'כרטיס טיסה',
            mimeType: 'application/pdf',
          },
        ],
      }),
    );
    expect(html).not.toContain('כרטיס טיסה');
  });

  it('keeps a heading with the block it names, so it cannot end a page alone', () => {
    const css = render(NINE_DAY_REFERENCE_TRIP);
    for (const selector of ['.pdf-ops-title', '.pdf-section-title', '.pdf-part-head']) {
      const rule = css.match(new RegExp(selector.replace('.', '\\.') + '\\{[^}]*\\}'))?.[0] ?? '';
      expect(rule).toContain('break-after:avoid');
    }
  });

  // **Paper renders the markup, it does not print the markers** (owner, 2026-08-31: _"In the
  // pdf, markdown not formatted"_). The parser moved to `@waypoint/shared` so both surfaces
  // read one AST; this asserts paper actually walks it.
  it('renders a note as markup rather than as its own markers', () => {
    const html = render(
      withOps({
        ops: [
          {
            kind: SHARE_OP_KIND.NOTE,
            body: '## כותרת\n\n- פריט ראשון\n- פריט שני\n\nטקסט **מודגש** וקישור https://road.is',
          },
        ],
      }),
    );
    expect(html).toContain('class="pdf-note-h1"');
    expect(html).toContain('class="pdf-note-list"');
    expect(html).toContain('<b>מודגש</b>');
    // A bare url prints as its readable form, once — see the link test below.
    expect(html).toContain('road.is');
    // The markers themselves are gone — that is the whole report.
    expect(html).not.toContain('## כותרת');
    expect(html).not.toContain('**מודגש**');
  });

  // A bare url is already its own label, so printing the href beside it says the address
  // twice — which is what the first render of this feature did.
  it('prints a bare url once, and a worded link with its destination', () => {
    const bare = render(
      withOps({ ops: [{ kind: SHARE_OP_KIND.NOTE, body: 'ראו https://road.is/' }] }),
    );
    expect(bare.match(/road\.is/g)?.length).toBe(1);

    const worded = render(
      withOps({ ops: [{ kind: SHARE_OP_KIND.NOTE, body: 'ראו [מצב הכבישים](https://road.is/)' }] }),
    );
    expect(worded).toContain('מצב הכבישים');
    expect(worded).toContain('https://road.is/');
  });

  // The emoji face must survive the font shorthand, which has eaten a family in this file
  // seven times: a note written with an emoji printed an empty rectangle.
  it('keeps the emoji face in the ops line stack', () => {
    const rule = render(NINE_DAY_REFERENCE_TRIP).match(/\.pdf-ops-line\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain("'Noto Emoji'");
    expect(rule).not.toContain('font:');
  });
});

// **A title beside its icon is a value.** `dir="auto"` sets the element's base direction, so
// an English title left-aligned out of an RTL column while its own icon stayed at the start
// edge — ADR-0213 §8's defect, on the one path that fix did not reach.
describe('the summary row', () => {
  it('isolates its title instead of setting a base direction', () => {
    const html = itineraryPdfHtml(
      input({ ...NINE_DAY_REFERENCE_TRIP, detailLevel: SHARE_DETAIL_LEVEL.SUMMARY }),
    );
    expect(html).toContain('class="pdf-summary-event"');
    expect(html).not.toMatch(/<strong dir="auto">/);
  });
});

// A Summary inspires; a ledger of dates is what Full and Everything are for.
describe('summary carries no booking ledger', () => {
  it('counts the events it shows rather than bookings it does not', () => {
    const html = itineraryPdfHtml(
      input({
        ...NINE_DAY_REFERENCE_TRIP,
        detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
        commitments: [],
      }),
    );
    expect(html).toContain(
      PDF_COPY.events(NINE_DAY_REFERENCE_TRIP.trip.eventCount).replace(/^\d+\s/, ''),
    );
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
