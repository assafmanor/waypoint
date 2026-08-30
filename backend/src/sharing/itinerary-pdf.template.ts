import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SHARE_DETAIL_LEVEL,
  type SharedDay,
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

const dayLabel = (date: string): { day: string; weekday: string } => {
  const [year, month, day] = date.split('-').map(Number);
  return {
    day: String(day).padStart(2, '0'),
    weekday: PDF_COPY.weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
  };
};

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
  const place = [event.placeName, event.address]
    .filter((value): value is string => Boolean(value))
    .map(auto)
    .join(' · ');
  return (
    journey +
    `<div class="pdf-event${event.hard ? ' hard' : ''}">` +
    `<span class="pdf-event-time">${event.startLabel ? ltr(event.startLabel) : PDF_COPY.dayparts.flexible}</span>` +
    `<span class="pdf-event-copy"><strong>${auto(event.title)}</strong>` +
    (place ? `<span>${place}</span>` : '') +
    `</span></div>`
  );
}

function dayCard(day: SharedDay, summary: boolean): string {
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
    `<article class="pdf-day"><header class="pdf-day-head">` +
    `<span class="pdf-date"><strong>${ltr(dayNumber)}</strong><span>${weekday}</span></span>` +
    // Both are composed server-side with their values already isolated
    // (`itinerary-narrative.fallback.ts`), so neither may sniff its own direction.
    `<span class="pdf-day-copy"><strong>${escapeHtml(day.title) || auto(`${weekday} ${dayNumber}`)}</strong>` +
    `<span>${escapeHtml(day.summary)}</span></span></header>` +
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
  push(
    PDF_COPY.appendix.bookingSecrets,
    (appendix.bookingSecrets ?? []).map((entry) => [entry.title, ...entry.lines].join(' ')),
  );
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
}: Omit<PdfRenderInput, 'qrDataUrl'>): string {
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
}: PdfRenderInput): string {
  const summary = projection.detailLevel === SHARE_DETAIL_LEVEL.SUMMARY;
  const appendix = appendixBlock(projection);

  const masthead =
    `<header class="pdf-mast"><div class="pdf-mast-copy">` +
    `<div class="pdf-eyebrow">${PDF_COPY.eyebrow} · <span dir="auto">${escapeHtml(projection.trip.destination)}</span></div>` +
    `<h1 class="pdf-title" dir="auto">${escapeHtml(projection.trip.name)}</h1>` +
    // **Assistant, with only the numeric runs in mono** (design-language: "Hebrew text must
    // never sit inside a mono element"). This line was `font: … 'JetBrains Mono', monospace`
    // — and the `font` SHORTHAND replaces the family list, so Assistant was not behind it.
    // JetBrains ships no Hebrew, the fallback was generic monospace, and the container's
    // only monospace is Liberation Mono: `12 ימים · עודכן` printed as five empty rectangles
    // while the headings two lines up were perfect (owner, 2026-08-30).
    `<div class="pdf-subtitle">${num(`${projection.trip.startDate} - ${projection.trip.endDate}`)}` +
    ` · ${PDF_COPY.days(projection.trip.dayCount)} · ${PDF_COPY.updatedAt} ${num(generatedAtLabel)}</div>` +
    `</div><div class="pdf-route-mini"><strong>${escapeHtml(projection.narrative.title)}</strong>` +
    `<span>${projection.trip.routeLabels.map(auto).join(' · ')}</span></div>` +
    // The QR is printed ONCE, beside the title, rather than on every page: it is how a
    // reader walks the paper back to the live link, and one legible code does that.
    `<div class="pdf-qr-block"><img class="pdf-qr" src="${qrDataUrl}" alt="" />` +
    `<span class="pdf-qr-cap">${ltr(publicUrl)}</span></div></header>`;

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
    `<div class="pdf-fact"><strong>${ltr(projection.trip.routeLabels.length)}</strong><span>${PDF_COPY.stops(projection.trip.routeLabels.length).replace(/^\d+\s/, '')}</span></div>` +
    `<div class="pdf-fact"><strong>${ltr(projection.trip.eventCount)}</strong><span>${PDF_COPY.events(projection.trip.eventCount).replace(/^\d+\s/, '')}</span></div>` +
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
.pdf-mast-copy{min-width:0;flex:1;}
.pdf-eyebrow{margin-block-end:4px;color:var(--pdf-muted);font-size:9px;font-weight:700;letter-spacing:.08em;}
.pdf-title{margin:0;font:27px/1.1 'Secular One',sans-serif;}
.pdf-subtitle{margin-block-start:6px;color:var(--pdf-muted);font:500 9px 'Assistant',sans-serif;}
/* Mono is for the RUN, never the row: the font SHORTHAND drops the family list, and
   JetBrains Mono has no Hebrew glyphs, so a Hebrew word in a mono row prints as boxes. */
.pdf-num{font-family:'JetBrains Mono',monospace;}
.pdf-route-mini{min-width:130px;text-align:end;}
.pdf-route-mini strong,.pdf-route-mini span{display:block;}
.pdf-route-mini strong{font-size:12px;}
.pdf-route-mini span{margin-block-start:3px;color:var(--pdf-teal);font-size:9px;}
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
</style></head><body>${masthead}${lede}${sectionTitle}<div class="pdf-days">${projection.days
    .map((day) => dayCard(day, summary))
    .join('')}</div>${appendix}</body></html>`;
}
