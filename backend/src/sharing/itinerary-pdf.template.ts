import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NARRATIVE_SEPARATOR,
  SHARE_DAY_KIND,
  SHARE_OP_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DETAIL_LEVEL,
  type SharedDay,
  type SharedDaySummary,
  type SharedDayTitle,
  type SharedEvent,
  type SharedItinerary,
} from '@waypoint/shared';
import { PDF_COPY, PDF_DAYPART_MARK } from './itinerary-pdf.copy';

/**
 * **The paper, and it is not a screenshot of the page** (ADR-0213 §4).
 *
 * It shares the projection and the daypart grouping with the public reader and nothing
 * else: no accordions, no touch targets, no shadows, no theme. A4 at a fixed light palette,
 * two compact day columns, and a footer that carries the live URL and a real QR of it — so
 * a printed itinerary can be walked back to the page it came from.
 *
 * **Every string is escaped and nothing is fetched.** The renderer aborts all network
 * requests before this HTML is set (`pdf-browser.service.ts`), and the fonts are inlined as
 * data URLs below rather than linked, so a trip whose event title contains markup, or a
 * network the container cannot reach, both produce the same correct document.
 */

const FONT_DIR_CANDIDATES = [
  // The runtime image copies both sets — the app's faces and the PDF-only emoji — here.
  '/app/pdf-fonts',
  // Running from source (`pnpm dev`, specs): the frontend's own copies…
  join(__dirname, '..', '..', '..', 'frontend', 'src', 'assets', 'fonts'),
  join(process.cwd(), '..', 'frontend', 'src', 'assets', 'fonts'),
  // …and the one face the app has no use for (see `backend/assets/fonts/README.md`).
  join(__dirname, '..', '..', 'assets', 'fonts'),
  join(process.cwd(), 'assets', 'fonts'),
  join(process.cwd(), 'backend', 'assets', 'fonts'),
];

let fontCache: string | undefined;

/**
 * **The unicode-range split is load-bearing, exactly as it is in `styles/fonts.css`.**
 *
 * Google ships each family as several files split by script, and this app is Hebrew-first
 * (ADR-0009). Declaring both Assistant faces without a range makes the LATIN one — which
 * carries no Hebrew glyphs — win for every Hebrew codepoint, and every heading and event
 * title silently falls back to a system font. That is invisible to a screenshot in a
 * container that happens to have Hebrew coverage, and it is what made the first render of
 * this template produce a document whose Hebrew could not be extracted at all.
 */
const HEBREW_RANGE = 'U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F';
const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, ' +
  'U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

/**
 * **An event's icon is an emoji, so the paper needs emoji glyphs of its own** (owner report,
 * 2026-08-30: every icon printed as a rectangle).
 *
 * `icons.ts` calls the glyph content, and the runtime image is `node:22-slim` plus
 * `fonts-liberation` — which has no emoji coverage at all. The first version of this
 * template asked for none, so Chromium fell through to a system face that does not exist
 * and drew `.notdef` boxes. It looked correct on every developer machine, because a desktop
 * has an emoji font; the tell in the artifact was a NUL where each glyph should be.
 *
 * Deliberately excludes the ranges the app faces already answer — U+2000-206F (which
 * carries the bidi isolates `ltr()` writes) and U+25CC (Assistant's dotted circle) — so the
 * only codepoints that reach this face are ones nothing else can draw.
 */
const EMOJI_RANGE =
  'U+203C, U+2049, U+2139, U+2194-21AA, U+231A-231B, U+2328, U+23CF-23FA, U+24C2, ' +
  'U+25AA-25AB, U+25B6, U+25C0, U+25FB-25FE, U+2600-27BF, U+2934-2935, U+2B00-2B55, ' +
  'U+3030, U+303D, U+3297, U+3299, U+FE0F, U+20E3, U+1F000-1FAFF';

const FONT_FACES = [
  ['Assistant', '200 800', 'assistant-hebrew.woff2', HEBREW_RANGE],
  ['Assistant', '200 800', 'assistant-latin.woff2', LATIN_RANGE],
  ['Secular One', '400', 'secular-one-hebrew.woff2', HEBREW_RANGE],
  ['Secular One', '400', 'secular-one-latin.woff2', LATIN_RANGE],
  // Latin-only on purpose (design-language.md): it carries times, codes and money, never
  // prose, so it ships no Hebrew glyphs and must not be asked for any.
  ['JetBrains Mono', '100 800', 'jetbrains-mono-latin.woff2', LATIN_RANGE],
  // Monochrome on purpose: the document is a fixed light palette that has to stay legible
  // in grayscale, and a colour (CBDT) face embeds as images, which would stop the glyph
  // being extractable — the property the container smoke actually checks.
  ['Noto Emoji', '400', 'noto-emoji.woff2', EMOJI_RANGE],
] as const;

/** Inline `@font-face` rules. Read once — the bytes are ~100 KB and identical per render,
 *  and a disk read per PDF is a syscall on the hot path for nothing. */
function fontFaces(): string {
  if (fontCache !== undefined) return fontCache;
  const faces: string[] = [];
  for (const [family, weight, file, range] of FONT_FACES) {
    for (const dir of FONT_DIR_CANDIDATES) {
      try {
        const bytes = readFileSync(join(dir, file));
        faces.push(
          `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
            `font-display:block;unicode-range:${range};` +
            `src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');}`,
        );
        break;
      } catch {
        // Try the next candidate. A missing font is not a failed itinerary: the page still
        // renders in the fallback stack below, and the fixture spec asserts we found them.
      }
    }
  }
  fontCache = faces.join('');
  return fontCache;
}

/** Reset the memoized fonts. Tests only — the paths never change at runtime. */
export function resetPdfFontCache(): void {
  fontCache = undefined;
}

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

/** A Latin/numeric run inside Hebrew prose, isolated so it reads left-to-right (ADR-0118).
 *  The same instrument `lib/bidi.ts` uses on screen, spelled here because the print
 *  renderer cannot import the frontend. */
const ltr = (value: string | number): string => `⁦${escapeHtml(String(value))}⁩`;

/** **A value the app did not write, inside a line the app composed** — a place name, an
 *  event title, a person. First-strong rather than forced-LTR, because it can be either
 *  script; the same instrument `lib/bidi.ts`'s `autoIsolate` is on screen. A container of
 *  these must NOT carry `dir="auto"`, which skips isolates when it sniffs. */
const auto = (value: string): string => `\u2068${escapeHtml(value)}\u2069`;

/** A date, a code or a stamp — mono, isolated, and **only ever the numeric run**. Its
 *  element sets the row in Assistant so Hebrew beside it has a face with Hebrew glyphs. */
const num = (value: string): string => `<span class="pdf-num">${ltr(value)}</span>`;

/**
 * **The derived headline, said in words** (ADR-0213's 2026-08-30 amendment). The projection
 * ships `{ kind, …values }` and this is where a `flightOut` becomes `טסים לאיסלנד`. Values
 * are escaped and isolated here, one at a time, so the sentence around them stays in the
 * page's RTL flow — the container must therefore not carry `dir="auto"`, which skips
 * isolates when it sniffs.
 *
 * `NONE` returns empty and the caller falls back to the date: a day with nothing in it has
 * no true title, and inventing one is the mandatory day title the owner rejected.
 */
function dayTitleText(title: SharedDayTitle): string {
  switch (title.kind) {
    case SHARE_DAY_KIND.FLIGHT_OUT:
      return PDF_COPY.dayTitle.flightOut(auto(title.to));
    case SHARE_DAY_KIND.FLIGHT_HOME:
      return PDF_COPY.dayTitle.flightHome;
    case SHARE_DAY_KIND.FLIGHT:
      return PDF_COPY.dayTitle.flight(auto(title.to));
    case SHARE_DAY_KIND.ROUTE:
      return PDF_COPY.dayTitle.route(auto(title.from), auto(title.to));
    case SHARE_DAY_KIND.PLACE:
      return auto(title.at);
    case SHARE_DAY_KIND.REGION:
      return auto(title.at);
    case SHARE_DAY_KIND.KIND:
      return PDF_COPY.dayTitle.kind(auto(title.of));
    case SHARE_DAY_KIND.TEXT:
      return escapeHtml(title.text);
    case SHARE_DAY_KIND.NONE:
      // No places and no events: the caller falls back to the date rather than inventing a
      // title, which is the mandatory day title ADR-0213 §2 refused.
      return '';
    default:
      // **Exhaustive on purpose.** The `default: return ''` this replaces would have
      // rendered the two kinds added on 2026-08-30 as nothing at all, on a green typecheck.
      return assertNeverTitle(title);
  }
}

/** The compiler's proof that the union was handled; unreachable by construction. */
function assertNeverTitle(value: never): string {
  void value;
  return '';
}

function daySummaryText(summary: SharedDaySummary): string {
  switch (summary.kind) {
    case SHARE_DAY_SUMMARY_KIND.STAY:
      return PDF_COPY.daySummary.stay(auto(summary.place));
    case SHARE_DAY_SUMMARY_KIND.EVENTS:
      return summary.titles.map(auto).join(NARRATIVE_SEPARATOR);
    case SHARE_DAY_SUMMARY_KIND.TEXT:
      return escapeHtml(summary.text);
    default:
      return '';
  }
}

/** `DD.MM–DD.MM`, the app's own trip-range shape (`lib/time.ts`'s `formatTripDates`), which
 *  the masthead was printing as two raw ISO dates the app shows nowhere else. */
const tripRange = (startDate: string, endDate: string): string => {
  const dayMonth = (iso: string) => {
    const [, month, day] = iso.split('-');
    return `${day}.${month}`;
  };
  return `${dayMonth(startDate)}–${dayMonth(endDate)}`;
};

const dayLabel = (date: string): { day: string; weekday: string } => {
  const [year, month, day] = date.split('-').map(Number);
  return {
    day: String(day).padStart(2, '0'),
    weekday: PDF_COPY.weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
  };
};

/** The hour, or the range where there is one — a flight has to say when it lands (owner,
 *  2026-08-30). One isolate around the whole run, so `09:20–14:05` cannot be reordered by the
 *  page's RTL flow into its own reverse. */
function timeText(event: SharedEvent): string {
  if (!event.startLabel) return PDF_COPY.dayparts.flexible;
  // **A range only where the end is a commitment** (owner, 2026-08-30: exact clocks for
  // hard pins and bookings, a start for everything else). A flight's arrival is a fact you
  // plan around; a viewpoint's 14:30 is when somebody typed they would leave, and printing
  // it as a window tells the reader it means something it does not.
  const range = event.hard && event.endLabel && event.endLabel !== event.startLabel;
  return range ? ltr(`${event.startLabel}\u2013${event.endLabel}`) : ltr(event.startLabel);
}

/** The legs of one journey, and the wait between them, inside one frame. */
function legRows(event: SharedEvent): string {
  if (!event.legs?.length) return '';
  const legTime = (leg: NonNullable<SharedEvent['legs']>[number]) =>
    ltr(
      leg.endLabel && leg.endLabel !== leg.startLabel
        ? `${leg.startLabel ?? ''}\u2013${leg.endLabel}`
        : (leg.startLabel ?? ''),
    );
  return (
    `<div class="pdf-trek">` +
    event.legs
      .map(
        (leg) =>
          (leg.layoverMinutes
            ? `<div class="pdf-layover">${PDF_COPY.layover(auto(leg.title), leg.layoverMinutes)}</div>`
            : '') +
          `<div class="pdf-event hard"><span class="pdf-event-time">${legTime(leg)}</span>` +
          `<span class="pdf-event-copy"><strong>${auto(leg.title)}</strong>` +
          (leg.code ? `<span class="pdf-leg-code">${ltr(leg.code)}</span>` : '') +
          `</span></div>`,
      )
      .join('') +
    `</div>`
  );
}

/**
 * **The operational material, PRINTED under its row rather than folded behind it.**
 *
 * This is the one decision that inverts between the two renderers. The reader page hides a
 * booking code behind a disclosure because a reader wants the schedule and an operator
 * wants the code, and they are the same person at different moments. Paper has no such
 * setting: whoever is holding the printout is, by that act, the operator — it is why they
 * printed it.
 */
function opsLines(ops: SharedEvent['ops']): string {
  if (!ops?.length) return '';
  const line = (label: string, body: string) =>
    `<span class="pdf-ops-line"><b>${label}</b> ${body}</span>`;
  return ops
    .map((op) => {
      // A `switch` over the discriminant rather than a ternary chain, so a sixth op kind is
      // a compile error here rather than a row that silently prints nothing.
      switch (op.kind) {
        case SHARE_OP_KIND.CODE:
          return line(
            PDF_COPY.ops.code,
            ltr(op.code) + (op.provider ? ` ${NARRATIVE_SEPARATOR} ${auto(op.provider)}` : ''),
          );
        case SHARE_OP_KIND.FILE:
          return line(PDF_COPY.ops.file, auto(op.title));
        case SHARE_OP_KIND.TASK:
          return line(PDF_COPY.ops.task, auto(op.title));
        case SHARE_OP_KIND.NOTE:
          return line(
            PDF_COPY.ops.note,
            auto([op.title, op.body].filter(Boolean).join(NARRATIVE_SEPARATOR)),
          );
      }
    })
    .join('');
}

function eventRow(event: SharedEvent, summary: boolean): string {
  if (summary) {
    return `<div class="pdf-summary-event"><span>${escapeHtml(event.icon ?? '•')}</span><strong dir="auto">${escapeHtml(event.title)}</strong></div>`;
  }
  // The mode leads the numbers, and the numbers carry their units — it printed as `37 · 30.5`,
  // two bare figures with nothing saying what either measured (owner, 2026-08-30).
  const journey = event.journey
    ? `<div class="pdf-journey">${PDF_COPY.travelMode[event.journey.mode]} · ` +
      `${ltr(event.journey.minutes)} ${PDF_COPY.minutes} · ${ltr(event.journey.km)} ${PDF_COPY.km}</div>`
    : '';
  // Each value isolated, the separator left in the RTL flow — a `dir="auto"` over the JOIN
  // would let an English address decide which side the place name sits on.
  // **The row says what it IS before it says where** (owner, 2026-08-30: _"hotels and other
  // derivable stuff texts should be enhanced … and that also includes bookings"_). A
  // booking states its type, so `The Hill Hotel at Fludir` gets `לינה` in front of its hour
  // and stops being a bare proper noun. An event no booking backs is captioned with
  // nothing — a guess in this slot is worse than a gap.
  const kind = event.bookingType ? PDF_COPY.bookingType[event.bookingType] : undefined;
  const place = [event.placeName, event.address]
    .filter((value): value is string => Boolean(value))
    .map(auto)
    .join(' · ');
  return (
    journey +
    `<div class="pdf-event${event.hard ? ' hard' : ''}">` +
    `<span class="pdf-event-time">${timeText(event)}</span>` +
    `<span class="pdf-event-copy"><strong>${auto(event.title)}</strong>` +
    (kind || place
      ? `<span>${[kind ? `<b class="pdf-kind">${kind}</b>` : '', place]
          .filter(Boolean)
          .join(NARRATIVE_SEPARATOR)}</span>`
      : '') +
    // A stop's one-line description. Two lines on paper as on screen, though the measure is
    // wider here so the same sentence usually fits in one.
    (event.caption ? `<span class="pdf-cap">${auto(event.caption)}</span>` : '') +
    opsLines(event.ops) +
    `</span></div>` +
    legRows(event)
  );
}

function dayCard(day: SharedDay, summary: boolean, photoSrc?: string): string {
  const { day: dayNumber, weekday } = dayLabel(day.date);
  // Daypart headings appear only above events that belong to them — the projection has
  // already dropped the empty groups, so this loop cannot render one.
  const sections = day.sections
    .map(
      (section) =>
        `<section class="pdf-part"><header class="pdf-part-head">` +
        `<span class="pdf-part-mark">${PDF_DAYPART_MARK[section.daypart]}</span>` +
        `<span>${PDF_COPY.dayparts[section.daypart]}</span></header>` +
        section.events.map((event) => eventRow(event, summary)).join('') +
        `</section>`,
    )
    .join('');
  return (
    `<article class="pdf-day"><header class="pdf-day-head${photoSrc ? '' : ' no-photo'}">` +
    `<span class="pdf-date"><strong>${ltr(dayNumber)}</strong><span>${weekday}</span></span>` +
    // **A 34px SQUARE, not the reader page's 116px band.** A band is nothing on a page you
    // scroll and about a page and a half across twelve days at this column density; the
    // square fits inside the header's existing 47px minimum and costs no paper. Same photo,
    // same gate. The credit rides the `alt`, since a printed page has no hover — and the
    // licence line for the whole document is the appendix's job, not every square's.
    (day.photo && photoSrc
      ? `<img class="pdf-shot" src="${photoSrc}" alt="${escapeHtml(day.photo.of)}" />`
      : '') +
    // Both are composed server-side with their values already isolated
    // (`itinerary-narrative.fallback.ts`), so neither may sniff its own direction.
    `<span class="pdf-day-copy"><strong>${dayTitleText(day.title) || auto(`${weekday} ${dayNumber}`)}</strong>` +
    // **Where you sleep frames the day.** It used to be a row sorted into the afternoon by
    // its check-in hour, which on the outbound day put it between the two legs of the
    // flight and printed 15:00-11:00 — a range that reads backwards because a stay crosses
    // midnight.
    `<span class="${day.stay ? 'pdf-stay' : ''}">${
      day.stay ? PDF_COPY.stay(auto(day.stay)) : daySummaryText(day.summary)
    }</span></span></header>` +
    `<div class="pdf-parts">${sections}</div></article>`
  );
}

function appendixBlock(projection: SharedItinerary): string {
  const appendix = projection.appendix;
  if (!appendix) return '';
  const blocks: string[] = [];
  const push = (title: string, lines: string[]) => {
    if (lines.length > 0) {
      blocks.push(
        `<div class="pdf-op"><strong>${title}</strong><span>${lines.map(auto).join(' · ')}</span></div>`,
      );
    }
  };
  // No booking block any more: every booking has a host by construction (`Event.bookingId`
  // is `@unique`), so a confirmation code prints under its own row. What is left here is
  // what is attached to nothing.
  push(
    PDF_COPY.appendix.notesAndTasks,
    (appendix.notesAndTasks ?? []).map((entry) => [entry.title, ...entry.lines].join(' ')),
  );
  push(PDF_COPY.appendix.travelers, appendix.travelers ?? []);
  push(
    PDF_COPY.appendix.documents,
    (appendix.documents ?? []).map((document) => document.title),
  );
  return blocks.length > 0
    ? `<section class="pdf-ops"><h2 class="pdf-ops-title">${PDF_COPY.appendix.title}</h2>${blocks.join('')}</section>`
    : '';
}

export interface PdfRenderInput {
  projection: SharedItinerary;
  /** The written link — the same string the reader sees, host and path, scheme stripped. */
  publicUrl: string;
  /** A data-URL PNG of `publicUrl`. Generated by the caller so this stays synchronous and
   *  pure, which is what lets the template be tested without a browser or a QR library. */
  qrDataUrl: string;
  /** Rendered as the generated-at stamp; injected so the output is deterministic in a test. */
  generatedAtLabel: string;
  /** Each day photo's root-relative URL to its bytes as a data URL. The renderer aborts every
   *  request the page makes (`PdfBrowserService`), so an `<img src="/enrichment/images/...">`
   *  would print an empty box; a URL missing from this map prints no image at all. */
  photoDataUrls: Record<string, string>;
}

/**
 * **The running footer, and why it is a second document rather than an element in the first.**
 *
 * A page number can only be true if the thing counting pages is the thing that made them.
 * The first version of this renderer split the days into fixed groups of five, wrapped each
 * in a 297mm box and printed "עמוד 2 מתוך 3" from that arithmetic — so a dense trip whose
 * group overflowed its box produced five physical pages numbered up to three, and the
 * absolutely-positioned footer inside an overflowing box printed ON TOP of the schedule
 * (owner report, 2026-08-30: page numbers, lines over lines). Chromium's `footerTemplate`
 * asks the paginator, which cannot disagree with itself.
 *
 * Its cost is that the template renders in a separate document that shares nothing with the
 * page — no stylesheet, no fonts — and the container has no Hebrew coverage, so a footer
 * that simply said `עמוד` would print boxes. It carries its own inlined `@font-face` for
 * exactly that reason. Verified in a real render, not assumed.
 */
export function itineraryPdfFooterHtml({
  projection,
  publicUrl,
  generatedAtLabel,
}: Omit<PdfRenderInput, 'qrDataUrl' | 'photoDataUrls'>): string {
  return (
    `<style>${fontFaces()}` +
    `.wp-foot{width:100%;box-sizing:border-box;padding:0 13mm;` +
    `display:flex;align-items:center;justify-content:space-between;gap:12px;` +
    `direction:rtl;font-family:'Assistant',sans-serif;font-size:7.5px;color:#626b7e;}` +
    `.wp-foot b{color:#16233d;}.wp-foot .u{font-family:'JetBrains Mono',monospace;}` +
    `</style>` +
    `<div class="wp-foot"><span><b>${PDF_COPY.brand}</b> · ` +
    `<span dir="auto">${escapeHtml(projection.trip.name)}</span> · ` +
    `${PDF_COPY.updatedAt} ${ltr(generatedAtLabel)}</span>` +
    `<span><span class="u">${ltr(publicUrl)}</span> · ` +
    `${PDF_COPY.pagePrefix}<span class="pageNumber"></span> ${PDF_COPY.pageOf}` +
    `<span class="totalPages"></span></span></div>`
  );
}

export function itineraryPdfHtml({
  projection,
  publicUrl,
  qrDataUrl,
  generatedAtLabel,
  photoDataUrls,
}: PdfRenderInput): string {
  const summary = projection.detailLevel === SHARE_DETAIL_LEVEL.SUMMARY;
  const appendix = appendixBlock(projection);

  const masthead =
    `<header class="pdf-mast"><div class="pdf-mast-copy">` +
    `<div class="pdf-eyebrow">${PDF_COPY.eyebrow}</div>` +
    `<h1 class="pdf-title">${auto(projection.trip.name)}</h1>` +
    // **What the trip IS, in the trip's own words.** The line under the name used to be
    // fallbackTripTitle's first-place-to-last-place over the whole schedule, and on any
    // trip you fly to both ends are transit airports (owner, 2026-08-30: "Why נתב״ג to
    // Frankfurt?? What does it have to do with anything?"). Both values were already here.
    `<div class="pdf-what">${[
      PDF_COPY.what(projection.trip.dayCount, auto(projection.trip.destination)),
      PDF_COPY.tripShape[projection.trip.shape],
      // The base count only earns its place where the shape implies several — on a star
      // trip it would print `1 בסיס`, which is the same sentence twice.
      projection.trip.baseCount > 1 ? PDF_COPY.bases(projection.trip.baseCount) : '',
    ]
      .filter(Boolean)
      .join(NARRATIVE_SEPARATOR)}</div>` +
    // **Assistant, with only the numeric runs in mono** (design-language: "Hebrew text must
    // never sit inside a mono element"). This line was `font: … 'JetBrains Mono', monospace`
    // — and the `font` SHORTHAND replaces the family list, so Assistant was not behind it.
    // JetBrains ships no Hebrew, the fallback was generic monospace, and the container's
    // only monospace is Liberation Mono: `12 ימים · עודכן` printed as five empty rectangles
    // while the headings two lines up were perfect (owner, 2026-08-30).
    // **Two lines, by design rather than by wrapping** (owner, 2026-08-30: _"Dates and
    // length too long split to two lines"_). The trip's own facts lead; the provenance
    // stamp is a different KIND of fact and drops to a quieter line of its own rather than
    // sharing a middot with them and pushing the whole run past the column.
    `<div class="pdf-subtitle">${num(tripRange(projection.trip.startDate, projection.trip.endDate))}` +
    ` · ${PDF_COPY.days(projection.trip.dayCount)}</div>` +
    `<div class="pdf-stamp">${PDF_COPY.updatedAt} ${num(generatedAtLabel)}</div>` +
    // **The route strip, and NOT the title above it** (owner: _"Why do they exist? … Seems
    // very redundant"_). `narrative.title` was printed here and again in the lede one
    // centimetre below — the same string twice, which is what made the block read as a
    // leak of something rather than as the route. The strip stays because it is the only
    // place the whole route is written; the title stays in the lede, once.
    // **AND THEN THE STRIP ITSELF WENT** (owner, 2026-08-30, the same day it came off the
    // reader page: "What's the teal random places on top?"). routeLabels is a CAPPED
    // sample — Dyrholaey, Stokksnes, Svartifoss and an airport, on a twelve-day ring road
    // — so it is not the route and never was. It came off SharedItinerary.tsx first and
    // printed here for a week longer, which is the whole argument for one ADR section
    // covering both renderers rather than two fixes. The field stays on the contract:
    // buildSummaryNarrativeInput consumes it.
    `</div>` +
    // The QR is printed ONCE, beside the title, rather than on every page: it is how a
    // reader walks the paper back to the live link, and one legible code does that.
    `<div class="pdf-qr-block"><img class="pdf-qr" src="${qrDataUrl}" alt="" />` +
    `<span class="pdf-qr-cap">${ltr(publicUrl)}</span></div></header>`;

  // **12 azorim counted pins**, which on a ring road is exactly the number of stops and
  // tells a reader nothing. Nights and bookings are the two counts somebody planning
  // against this page actually uses, and both derive from what is already here.
  const nights = projection.days.filter((day) => day.stay).length;
  const lede =
    `<div class="pdf-lede"><div class="pdf-story"><strong>${escapeHtml(projection.narrative.title)}</strong>` +
    // Skipped rather than emptied: a generated summary is optional, and an empty paragraph
    // still takes its line-height and leaves a gap that reads as a missing sentence.
    (projection.narrative.summary
      ? `<p dir="auto">${escapeHtml(projection.narrative.summary)}</p>`
      : '') +
    `</div>` +
    `<div class="pdf-facts">` +
    `<div class="pdf-fact"><strong>${ltr(projection.trip.dayCount)}</strong><span>${PDF_COPY.days(projection.trip.dayCount).replace(/^\d+\s/, '')}</span></div>` +
    // The ROUTE's count, not the strip's: `routeLabels` is capped, so this read `8 אזורים`
    // on every trip long enough to be capped, whatever it actually visited.
    `<div class="pdf-fact"><strong>${ltr(nights)}</strong><span>${PDF_COPY.nights(nights).replace(/^\d+\s/, '')}</span></div>` +
    `<div class="pdf-fact"><strong>${ltr(projection.commitments.length)}</strong><span>${PDF_COPY.bookings(projection.commitments.length).replace(/^\d+\s/, '')}</span></div>` +
    `</div></div>`;

  const sectionTitle =
    `<div class="pdf-section-title"><h2>${summary ? PDF_COPY.summaryTitle : PDF_COPY.scheduleTitle}</h2>` +
    `<span>${summary ? PDF_COPY.summaryHint : PDF_COPY.scheduleHint}</span></div>`;

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><style>
${fontFaces()}
/* Fixed light. The PDF has no theme: a document printed on paper has one palette, and
   structure stays legible in grayscale (ADR-0213 §4). */
:root{--pdf-ink:#16233d;--pdf-muted:#626b7e;--pdf-line:#d8dde6;--pdf-soft:#f3f5f8;--pdf-amber:#915e1e;--pdf-teal:#237d7a;}
/* **No @page margin and no paper box.** The margins are Chromium's, declared beside
   displayHeaderFooter in pdf-browser.service.ts, because the running footer lives IN the
   page margin box — set them here and the footer would print over the last line of every
   page, which is the defect this replaced. Only the SIZE stays here, so preferCSSPageSize
   has something to prefer. */
@page{size:A4;}
*{box-sizing:border-box;}
html,body{margin:0;background:#fff;color:var(--pdf-ink);font-family:'Assistant','Noto Emoji',system-ui,sans-serif;}
.pdf-mast{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-block-end:15px;padding-block-end:11px;border-block-end:2px solid var(--pdf-ink);}
/* Takes what it needs before the strip does — it holds the title and the dates, which are the
   two things a reader looks at first. */
.pdf-mast-copy{min-width:0;flex:1 1 auto;}
.pdf-eyebrow{margin-block-end:4px;color:var(--pdf-muted);font-size:9px;font-weight:700;letter-spacing:.08em;}
.pdf-title{margin:0;font:27px/1.1 'Secular One',sans-serif;}
/* **The trip's own facts may not wrap** (owner, 2026-08-30: _"why is the title area on the pdf
   so compact … it doesn't need to be compacted to the right like that"_). The masthead is a flex
   row and the copy block was the only shrinkable thing in it, so the strip and the QR took their
   width first and the date-and-length line broke across three lines mid-phrase. It is short
   and fixed; it says so, and the strip beside it yields instead. */
.pdf-subtitle{margin-block-start:6px;color:var(--pdf-muted);font:500 9px 'Assistant',sans-serif;white-space:nowrap;}
/* The provenance stamp: a line of its own and a step quieter, so it cannot push the trip's
   own dates into a wrap (owner report, 2026-08-30). */
.pdf-stamp{margin-block-start:2px;color:var(--pdf-muted);font:500 8px 'Assistant',sans-serif;opacity:0.8;white-space:nowrap;}
/* The derived kind in front of an event's place line — the noun, so it reads as a label
   rather than as part of the address. */
.pdf-kind{font-weight:700;color:var(--pdf-ink);}
/* Mono is for the RUN, never the row: the font SHORTHAND drops the family list, and
   JetBrains Mono has no Hebrew glyphs, so a Hebrew word in a mono row prints as boxes. */
.pdf-num{font-family:'JetBrains Mono',monospace;}
/* Yields. It is a summary of a route whose ends the title already names, so it is the part of
   the masthead that can afford to be narrow. */

.pdf-qr-block{flex:0 0 auto;text-align:center;}
.pdf-qr{display:block;width:46px;height:46px;}
/* Latin by construction (a host and a path), so mono over the whole element is correct. */
.pdf-qr-cap{display:block;margin-block-start:3px;color:var(--pdf-muted);font:7px 'JetBrains Mono',monospace;}
.pdf-lede{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(200px,1fr);gap:16px;margin-block-end:15px;border:1px solid var(--pdf-line);border-radius:11px;overflow:hidden;}
.pdf-story{padding:11px 13px;}
.pdf-story strong{font:15px 'Secular One',sans-serif;}
.pdf-story p{margin:3px 0 0;color:var(--pdf-muted);font-size:9px;line-height:1.5;}
.pdf-facts{display:grid;grid-template-columns:repeat(3,1fr);border-inline-start:1px solid var(--pdf-line);}
.pdf-fact{display:grid;align-content:center;justify-items:center;padding:8px 5px;}
.pdf-fact+.pdf-fact{border-inline-start:1px solid var(--pdf-line);}
.pdf-fact strong,.pdf-fact span{display:block;}
.pdf-fact strong{font:17px/1 'Secular One',sans-serif;}
.pdf-fact span{margin-block-start:3px;color:var(--pdf-muted);font-size:8px;}
.pdf-section-title{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 9px;}
.pdf-section-title h2{margin:0;font:17px 'Secular One',sans-serif;}
.pdf-section-title span{color:var(--pdf-muted);font-size:9px;}
/* **Two columns as a MULTICOL, not a grid.** Chromium fragments a multi-column block across
   printed pages a column at a time and honours break-inside inside it; a grid container that
   outgrows the page fragments by ROW, which is where the overlapping lines came from. The
   flow is one list from the first day to the last, so a page holds whatever fits and the
   next one continues — nothing here decides how many days a page takes. */
.pdf-days{column-count:2;column-gap:11px;}
/* A day is the break-safe unit and an event row never splits across a page. */
.pdf-day{break-inside:avoid;margin-block-end:9px;overflow:hidden;border:1px solid var(--pdf-line);border-radius:10px;}
.pdf-day-head{display:grid;grid-template-columns:48px minmax(0,1fr);min-height:47px;background:var(--pdf-soft);}
.pdf-date{display:grid;place-items:center;align-content:center;border-inline-end:1px solid var(--pdf-line);}
.pdf-date strong{font:17px/1 'Secular One',sans-serif;}
.pdf-date span{margin-block-start:3px;color:var(--pdf-muted);font-size:8px;}
.pdf-day-copy{min-width:0;align-self:center;padding:6px 8px;}
.pdf-day-copy strong,.pdf-day-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pdf-day-copy strong{font-size:11px;}
.pdf-day-copy span{margin-block-start:2px;color:var(--pdf-muted);font-size:8px;}
.pdf-parts{padding:4px 8px 6px;}
.pdf-part{break-inside:avoid;}
.pdf-part-head{min-height:18px;display:flex;align-items:center;gap:4px;color:var(--pdf-amber);font-size:7.5px;font-weight:700;}
.pdf-part-head::after{content:'';height:1px;flex:1;background:color-mix(in srgb,var(--pdf-amber) 24%,var(--pdf-line));}
.pdf-part-mark{width:15px;font-size:10px;text-align:center;}
.pdf-event{break-inside:avoid;display:grid;grid-template-columns:38px minmax(0,1fr);gap:6px;padding:4px 0;border-block-start:1px solid var(--pdf-line);}
/* A commitment reads firmer on paper too — ADR-0011's distinction survives printing. */
.pdf-event.hard{border-inline-start:2px solid var(--pdf-amber);padding-inline-start:4px;}
.pdf-event-time{color:var(--pdf-amber);font:600 8px 'JetBrains Mono',monospace;}
.pdf-event-copy{min-width:0;}
.pdf-event-copy strong,.pdf-event-copy span{display:block;}
.pdf-event-copy strong{font-size:8.5px;}
.pdf-event-copy span{margin-block-start:1px;overflow:hidden;color:var(--pdf-teal);font-size:7.4px;text-overflow:ellipsis;white-space:nowrap;}
.pdf-summary-event{break-inside:avoid;min-height:18px;display:grid;grid-template-columns:17px minmax(0,1fr);align-items:center;gap:3px;border-block-start:1px solid var(--pdf-line);font-size:8.2px;}
.pdf-summary-event span:first-child{text-align:center;}
.pdf-summary-event strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pdf-journey{padding:2px 0;color:var(--pdf-muted);font-size:7px;}
.pdf-ops{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-block-start:12px;}
.pdf-ops-title{grid-column:1/-1;margin:0;font:13px 'Secular One',sans-serif;}
.pdf-op{break-inside:avoid;padding:8px 9px;border:1px solid var(--pdf-line);border-radius:9px;}
.pdf-op strong{display:block;font-size:9px;}
.pdf-op span{display:block;margin-block-start:2px;color:var(--pdf-muted);font-size:7.8px;line-height:1.4;}

/* ══ ADR-0213's 2026-08-30 amendment. **LAST IN THE SHEET ON PURPOSE**: these override
   shipped rules at EQUAL specificity, so placed above them they lose and do it silently —
   the first render of this change measured a 38px time cell against 52.9px of ink and
   printed the range over its own title. ══ */
/* **What the trip IS, under its name.** Replaces .pdf-route-mini, the capped stop sample
   that printed in teal beside the QR and named two airports plus three arbitrary stops. */
.pdf-what{margin-block-start:3px;font:600 10px 'Assistant',sans-serif;color:var(--pdf-ink);}
/* Where you sleep, teal because it is a location and nothing else (ADR-0028). */
.pdf-stay{color:var(--pdf-teal);}
/* **The time column holds a range, or it wraps** (owner, 2026-08-30: "the times wrap to
   two lines which also looks bad"). Measured in the print mockup: the shipped column is
   38px and a range is 53px of ink at this face, so every row carrying one broke across two
   lines and a flight's arrival read as a stray second number under its departure. 56px
   costs 18px of a 288px copy column and buys every title starting at the same x. */
.pdf-event{grid-template-columns:56px minmax(0,1fr);}
.pdf-event-time{white-space:nowrap;}
/* One frame over N legs, with the waits named between them. break-inside:avoid so a flight
   and its layover never land on two pages. */
.pdf-trek{break-inside:avoid;margin:3px 0;border:1px solid var(--pdf-line);border-radius:7px;overflow:hidden;}
.pdf-trek .pdf-event{padding-inline:6px;border-block-start:0;}
.pdf-trek .pdf-event+.pdf-event{border-block-start:1px solid var(--pdf-line);}
.pdf-leg-code{font:600 7.2px 'JetBrains Mono',monospace;color:var(--pdf-muted)!important;}
.pdf-layover{padding:2px 6px 2px 50px;background:color-mix(in srgb,var(--pdf-ink) 3%,transparent);color:var(--pdf-muted);font-size:7px;}
/* **Printed, not folded** — paper has no setting, and whoever holds the printout is the
   operator. The one decision that inverts against the reader page. */
.pdf-ops-line{display:block;margin-block-start:2px;color:var(--pdf-ink)!important;font:600 7.2px 'JetBrains Mono',monospace;white-space:normal!important;}
.pdf-ops-line b{font-family:'Assistant',sans-serif;font-weight:700;color:var(--pdf-muted);}
/* A stop's description, clamped — a caption is two lines and four is a paragraph. */
.pdf-cap{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:normal!important;color:var(--pdf-muted)!important;}
/* **The day's photo, as a square in the header.** See dayCard for why it is not a band. */
.pdf-day-head{grid-template-columns:48px 34px minmax(0,1fr);}
.pdf-day-head.no-photo{grid-template-columns:48px minmax(0,1fr);}
.pdf-shot{align-self:center;justify-self:center;width:34px;height:34px;border-radius:5px;object-fit:cover;}
</style></head><body>${masthead}${lede}${sectionTitle}<div class="pdf-days">${projection.days
    .map((day) => dayCard(day, summary, day.photo ? photoDataUrls[day.photo.url] : undefined))
    .join('')}</div>${appendix}</body></html>`;
}
