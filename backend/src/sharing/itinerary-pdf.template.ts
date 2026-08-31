import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NARRATIVE_SEPARATOR,
  parseNoteMarkdown,
  type NoteInline,
  SHARE_DAY_KIND,
  SHARE_OP_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DETAIL_LEVEL,
  TIME_MEANING,
  type SharedDay,
  type SharedDaySummary,
  type SharedDayTitle,
  type SharedEvent,
  type SharedItinerary,
} from '@waypoint/shared';
import { PDF_COPY, PDF_DAYPART_MARK, pdfSpan } from './itinerary-pdf.copy';

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
  if (!event.time) return PDF_COPY.dayparts.flexible;
  return sharedTimeText(event.time);
}

/**
 * **A CLOCK, IN THE WORDS PAPER USES FOR IT** (ADR-0213's 2026-08-31 amendment \u00a71).
 *
 * The rule this replaces was `event.hard && event.endLabel && \u2026` \u2014 ADR-0011's commitment
 * axis answering a question about meaning, which cost a soft two-hour hike its end here
 * while the reader page kept it, and printed `10:00\u201318:00` for a week-long car hire. The
 * projection now says what the clock IS and this only spells it.
 *
 * One isolate around the whole run, so `09:20\u201314:05` cannot be reordered by the page's RTL
 * flow into its own reverse \u2014 and around the CLOCK only on the two arms carrying a Hebrew
 * word, since isolating the word with it would island the wrong thing.
 */
function sharedTimeText(time: NonNullable<SharedEvent['time']>): string {
  if (time.meaning === TIME_MEANING.NOT_BEFORE) return PDF_COPY.timeFrom(ltr(time.label));
  if (time.meaning === TIME_MEANING.NOT_AFTER) return PDF_COPY.timeUntil(ltr(time.label));
  return time.endLabel && time.endLabel !== time.label
    ? ltr(`${time.label}\u2013${time.endLabel}`)
    : ltr(time.label);
}

/**
 * **THE STAY'S TWO MOMENTS, ON THE DAY HEADER** (ADR-0213's 2026-08-31 amendment §2).
 *
 * Its own line under the stay's name, never appended to it — that line is `nowrap` with an
 * ellipsis, and the clock sits at its logical end, so a long hotel name would eat the fact
 * with no sign it had been there (measured on the reader page at ⁦275px⁩ of ink in a ⁦206px⁩
 * box). On paper the measure is half an A4 column rather than a phone's, so both moments fit
 * one line here where the screen needs a wrap — the same decision, cheaper.
 *
 * Absent on a middle night, which is most nights: nothing arrives and nothing leaves.
 */
function stayWhen(day: SharedDay): string {
  const parts = [
    day.checkOut
      ? PDF_COPY.checkOut(auto(day.checkOut.place), sharedTimeText(day.checkOut.time))
      : '',
    day.checkIn ? PDF_COPY.checkIn(sharedTimeText(day.checkIn)) : '',
  ].filter(Boolean);
  return parts.length > 0
    ? `<span class="pdf-stay-when">${parts.join(NARRATIVE_SEPARATOR)}</span>`
    : '';
}

/**
 * **One journey block: a header that is not a row, then the flights** (ADR-0213 ninth
 * amendment §1-§3).
 *
 * The owner's report arrived against PAPER, where `.pdf-trek` was **already** a bordered box
 * around the legs — and it still read as three flights. That is the proof the container alone
 * was never the fix: the row above it looked like a complete flight, so the box just nested
 * one flight inside two others. So the header replaces that row here exactly as it does on
 * screen, naming the destination with the totals beside it.
 *
 * A leg prints its own flight time, and the WAIT prints between them — the owner caught that
 * missing from the mockup's paper column (_"The pdf should also show the wait durations"_),
 * and it matters most here: whoever is holding a printout cannot tap anything to find out.
 */
function legRows(event: SharedEvent): string {
  if (!event.legs?.length) return '';
  const legTime = (leg: NonNullable<SharedEvent['legs']>[number]) =>
    ltr(
      leg.endLabel && leg.endLabel !== leg.startLabel
        ? `${leg.startLabel ?? ''}\u2013${leg.endLabel}`
        : (leg.startLabel ?? ''),
    );
  const summary = [
    PDF_COPY.journeyLegs(event.legs.length),
    timeText(event),
    event.durationMinutes ? pdfSpan(event.durationMinutes) : '',
    event.zoneShiftMinutes ? PDF_COPY.zoneShift(ltr(signedHours(event.zoneShiftMinutes))) : '',
  ]
    .filter(Boolean)
    .join(NARRATIVE_SEPARATOR);
  return (
    `<div class="pdf-trek">` +
    `<div class="pdf-trek-head"><strong>${
      event.journeyTo ? PDF_COPY.journeyTo(auto(event.journeyTo)) : auto(event.title)
    }</strong><span>${summary}</span></div>` +
    event.legs
      .map(
        (leg) =>
          (leg.layoverMinutes && leg.layoverPlace
            ? `<div class="pdf-layover">${PDF_COPY.layover(auto(leg.layoverPlace), pdfSpan(leg.layoverMinutes))}</div>`
            : '') +
          `<div class="pdf-event hard"><span class="pdf-event-time">${legTime(leg)}</span>` +
          `<span class="pdf-event-copy"><strong>${auto(leg.title)}</strong>` +
          (leg.code ? `<span class="pdf-leg-code">${ltr(leg.code)}</span>` : '') +
          (leg.durationMinutes
            ? `<span class="pdf-leg-span">${pdfSpan(leg.durationMinutes)}</span>`
            : '') +
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
/**
 * **A standalone block of text sets its own base direction; a value inside a line does not.**
 *
 * `auto()` (an FSI…PDI isolate) is right for a value sharing a line with other content: it
 * keeps the line's own direction and stops the value reordering its neighbours. It is wrong
 * for a paragraph, because an isolate inherits the CONTAINER's direction — so an English
 * description sat inside an RTL column and was right-aligned and ragged-left, which is the
 * owner's _"English lines are ltr and shouldn't be treated differently"_ (2026-08-30).
 *
 * `dir="auto"` resolves from the first strong character, so English prose left-aligns and
 * Hebrew prose right-aligns. That is the SAME attribute ADR-0213's §8 removed from titles —
 * and the distinction is the point: a title is a value that has to line up with the caption
 * under it, a description is a paragraph that has to read.
 */
const prose = (value: string): string =>
  `<span class="pdf-prose" dir="auto">${escapeHtml(value)}</span>`;

/**
 * **A note's markup, on paper** (owner, 2026-08-31: _"In the pdf, markdown not formatted"_).
 *
 * The screen has rendered headings, lists, emphasis and links since ADR-0202; paper printed
 * the markers themselves — `## 4. מה אפשר` and `**Operator Registration Number**` — because
 * the parser lived in a React app's lib the backend cannot import. It now lives in
 * `@waypoint/shared`, so both surfaces read one AST and cannot disagree about what a marker
 * means (ADR-0096).
 *
 * This is the paint half only, and it is deliberately small: paper has no taps, so a link
 * prints as its label plus its destination rather than as an anchor, and a task box is a
 * character rather than a control.
 */
/** True when a link's label IS its address in a shorter form — the case `prettyUrl` produces
 *  for a bare url, where printing the href beside it says the same thing twice. */
function namesItsOwnHref(label: string, href: string): boolean {
  const bare = (value: string) =>
    value
      .replace(/^[a-z]+:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  return bare(label) === bare(href);
}

function noteMarkup(body: string): string {
  const inline = (runs: readonly NoteInline[]): string =>
    runs
      .map((run) => {
        switch (run.kind) {
          case 'text':
            return escapeHtml(run.text);
          case 'strong':
            return `<b>${inline(run.children)}</b>`;
          case 'em':
            return `<i>${inline(run.children)}</i>`;
          // `mono: false` where the run holds Hebrew — JetBrains ships none of it, which is
          // the same trap this file has now hit seven times.
          case 'code':
            return run.mono
              ? `<span class="pdf-mono">${escapeHtml(run.text)}</span>`
              : `<b>${escapeHtml(run.text)}</b>`;
          // **No anchor, and no address twice.** A printed page cannot be tapped, so the
          // destination has to be readable — but a bare url is already its own label
          // (`prettyUrl` gives `flydrone.is` for `https://flydrone.is/`), and printing both
          // read as a stutter. The address is added only where the label is words.
          case 'link':
            return namesItsOwnHref(run.label, run.href)
              ? `<span class="pdf-url">${escapeHtml(run.label)}</span>`
              : `${escapeHtml(run.label)} <span class="pdf-url">${escapeHtml(run.href)}</span>`;
        }
      })
      .join('');

  return parseNoteMarkdown(body)
    .map((block) => {
      switch (block.kind) {
        case 'heading':
          return `<div class="pdf-note-h${block.level}">${inline(block.children)}</div>`;
        case 'list': {
          const rows = block.items
            .map(
              (item, index) =>
                `<li><span class="pdf-note-mark">${
                  block.ordered ? `${block.start + index}.` : '•'
                }</span><span>${inline(item)}</span></li>`,
            )
            .join('');
          return `<ul class="pdf-note-list">${rows}</ul>`;
        }
        case 'quote':
          return `<div class="pdf-note-quote">${inline(block.children)}</div>`;
        case 'rule':
          return '<div class="pdf-note-rule"></div>';
        case 'paragraph':
          return `<p class="pdf-note-p">${block.lines.map(inline).join('<br />')}</p>`;
      }
    })
    .join('');
}

function opsLines(ops: SharedEvent['ops']): string {
  if (!ops?.length) return '';
  const line = (label: string, body: string) =>
    `<span class="pdf-ops-line"><b>${label}</b> ${body}</span>`;
  return ops
    .map((op) => {
      // A `switch` over the discriminant rather than a ternary chain, so a new op kind is a
      // compile error here rather than a row that silently prints nothing.
      switch (op.kind) {
        case SHARE_OP_KIND.CODE:
          // **The one value that is mono, and the only one that may be.** A confirmation code
          // is ASCII by construction and wants the figure alignment; everything else on this
          // line is Hebrew, and JetBrains Mono ships none of it.
          return line(
            PDF_COPY.ops.code,
            `<span class="pdf-mono">${ltr(op.code)}</span>` +
              (op.provider ? ` ${NARRATIVE_SEPARATOR} ${auto(op.provider)}` : ''),
          );
        // **A file does not print.** Paper cannot be tapped, so a filename on it is a promise
        // the medium cannot keep (owner, 2026-08-30: _"why are there documents there? They're
        // unreachable on the pdf"_). The live page still carries them, where they download.
        case SHARE_OP_KIND.FILE:
          return '';
        case SHARE_OP_KIND.NOTE:
          return line(
            PDF_COPY.ops.note,
            (op.title ? `<b class="pdf-note-title">${auto(op.title)}</b>` : '') +
              (op.body ? `<span class="pdf-note" dir="auto">${noteMarkup(op.body)}</span>` : ''),
          );
      }
    })
    .join('');
}

/** How long it took and what the clock did — the projection's two numbers, in this file's
 *  own words (see `pdfSpan`; the screen spends `hoursPhrase` and `ZoneShiftPill` on the same
 *  pair). A whole-hour jump reads as hours, a half-hour zone as H:MM. */
/** The signed clock jump, as `+3` or `−2:30`. Extracted from `travelFactsLine` when the
 *  journey header became its second caller — one spelling, so a flight's header and a
 *  single-leg row cannot report the same crossing differently. */
function signedHours(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return rest === 0 ? `${sign}${hours}` : `${sign}${hours}:${String(rest).padStart(2, '0')}`;
}

function travelFactsLine(event: Pick<SharedEvent, 'durationMinutes' | 'zoneShiftMinutes'>): string {
  const parts: string[] = [];
  if (event.durationMinutes) parts.push(pdfSpan(event.durationMinutes));
  if (event.zoneShiftMinutes) {
    parts.push(PDF_COPY.zoneShift(ltr(signedHours(event.zoneShiftMinutes))));
  }
  return parts.length > 0
    ? `<span class="pdf-travel-facts">${parts.join(NARRATIVE_SEPARATOR)}</span>`
    : '';
}

function eventRow(event: SharedEvent, summary: boolean): string {
  if (summary) {
    // **The row §8 missed** (owner, 2026-08-30: _"the ltr English rows issue still exists"_).
    // `dir="auto"` sets this element's base direction, so an English title left-aligned right
    // out of the column while its own icon stayed at the RTL start edge — the exact defect
    // ADR-0213 §8 measured and repaired on the detail rows, on the one path it did not touch.
    // A title beside an icon is a VALUE: it is isolated and keeps the column's direction.
    return `<div class="pdf-summary-event"><span>${escapeHtml(event.icon ?? '•')}</span><strong>${auto(event.title)}</strong></div>`;
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
  // **A chained journey prints as its container and nothing above it** (§1). The header
  // carries what the row used to say, and the attachments — caption, ops — ride inside, the
  // same reason the screen wraps them rather than dropping the row.
  if (event.legs?.length) return journey + legRows(event);
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
    travelFactsLine(event) +
    (event.caption ? `<span class="pdf-cap">${prose(event.caption)}</span>` : '') +
    opsLines(event.ops) +
    `</span></div>` +
    legRows(event)
  );
}

function dayCard(day: SharedDay, summary: boolean, photoSrc?: string): string {
  const { day: dayNumber, weekday: firstWeekday } = dayLabel(day.date);
  // A card covering the day a journey flew through prints both dates (`SharedDay.endDate`)
  // and both WEEKDAYS: one name against a two-day number says the card is only the first of
  // them (owner, 2026-08-31).
  const endLabel = day.endDate ? dayLabel(day.endDate) : undefined;
  const dayNumbers = endLabel ? `${dayNumber}–${endLabel.day}` : dayNumber;
  const weekday = endLabel ? `${firstWeekday}–${endLabel.weekday}` : firstWeekday;
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
    `<span class="pdf-date"><strong>${ltr(dayNumbers)}</strong><span>${weekday}</span></span>` +
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
    `<span class="pdf-day-copy"><strong>${dayTitleText(day.title) || auto(`${weekday} ${dayNumbers}`)}</strong>` +
    // **Where you sleep frames the day.** It used to be a row sorted into the afternoon by
    // its check-in hour, which on the outbound day put it between the two legs of the
    // flight and printed 15:00-11:00 — a range that reads backwards because a stay crosses
    // midnight.
    `<span class="${day.stay ? 'pdf-stay' : ''}">${
      day.stay ? PDF_COPY.stay(auto(day.stay)) : daySummaryText(day.summary)
    }</span>` +
    stayWhen(day) +
    `</span></header>` +
    `<div class="pdf-parts">${sections}</div></article>`
  );
}

function appendixBlock(projection: SharedItinerary): string {
  // **The same renderer the rows use.** These ARE row ops — they simply have no row — so a
  // note here and a note under an event print identically (ADR-0096). Travelers left this
  // block entirely: they are who the trip IS, and they print in the masthead.
  const ops = opsLines(projection.appendix?.ops);
  return ops
    ? `<section class="pdf-ops"><h2 class="pdf-ops-title">${PDF_COPY.appendix.title}</h2>` +
        `<div class="pdf-op">${ops}</div></section>`
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
    // **Who is going, beside who the trip is for** (owner, 2026-08-30). It was a block at the
    // foot, which is where you put a fact nobody asked for; a reader opening a shared trip
    // wants to know whose it is in the first line they read.
    (projection.trip.travelers?.length
      ? `<div class="pdf-travelers">${projection.trip.travelers.map(auto).join(NARRATIVE_SEPARATOR)}</div>`
      : '') +
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
  const ledeTitle = projection.narrative.title;
  const lede =
    // **Not when it IS the trip's name** (owner, 2026-08-31, with a screenshot of the same
    // words twice). `fallbackTripTitle` was changed to return `Trip.name` — which fixed the
    // masthead naming two transit airports and, unnoticed, made the deterministic narrative
    // title identical to the `<h1>` a centimetre above it. A generated narrative still has
    // something of its own to say, so the line stays for that case.
    `<div class="pdf-lede"><div class="pdf-story">${
      ledeTitle === projection.trip.name ? '' : `<strong>${escapeHtml(ledeTitle)}</strong>`
    }` +
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
    // **Bookings, unless this is a Summary** — which projects none, because a ledger of dates
    // is the exact-fact leak that level refuses (owner, 2026-08-30). The tile is not dropped:
    // the grid is three columns and a hole reads as a rendering fault, so Summary counts the
    // events it DOES show instead. Both are aggregates, which is what this row is for.
    (summary
      ? `<div class="pdf-fact"><strong>${ltr(projection.trip.eventCount)}</strong><span>${PDF_COPY.events(projection.trip.eventCount).replace(/^\d+\s/, '')}</span></div>`
      : `<div class="pdf-fact"><strong>${ltr(projection.commitments.length)}</strong><span>${PDF_COPY.bookings(projection.commitments.length).replace(/^\d+\s/, '')}</span></div>`) +
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
/* **margin-inline:auto is what makes the block's own text-align mean anything here**
   (owner, 2026-08-31: the QR and its link do not read as aligned). A block-level box with a
   definite width ignores its parent's text-align entirely, so the 46px code sat flush
   against the inline-start edge while the caption below it — a full-width block of centred
   text — was centred: two alignments, one unit. Measured before and after in the real A4,
   because the whole defect is one nobody can see in the markup: the image was at 55..101
   inside a 0..101 block, and is now centred at 27..73 under a caption that spans it. */
.pdf-qr{display:block;width:46px;height:46px;margin-inline:auto;}
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
.pdf-section-title{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 9px;break-after:avoid;page-break-after:avoid;}
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
.pdf-part-head{min-height:18px;display:flex;align-items:center;gap:4px;color:var(--pdf-amber);font-size:8px;font-weight:700;break-after:avoid;page-break-after:avoid;}
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
/* One column, not two: a note is prose and a 2-column measure at this size is unreadable —
   which is most of what "the section is too dense" meant (owner, 2026-08-30). */
.pdf-ops{display:block;margin-block-start:12px;}
/* **A heading may not be the last thing on a page.** break-after:avoid keeps it with the
   block it names; without it the title landed alone at the foot of page 4 with its content on
   page 5, which reads as a rendering fault (owner, 2026-08-30, with a screenshot). */
.pdf-ops-title{margin:0 0 6px;font:13px 'Secular One',sans-serif;break-after:avoid;page-break-after:avoid;}
.pdf-op{break-inside:avoid;padding:9px 11px;border:1px solid var(--pdf-line);border-radius:9px;}
/* Two rules lived here for the per-family appendix markup (a title element and a
   joined-lines element) that no longer exists. They were not merely dead: the descendant
   selector .pdf-op span is (0,1,1) and beat .pdf-ops-line (0,1,0), so it silently held the
   ops line at 7.8px however large this file said to set it — the third time in this feature
   a declaration lost to a descendant selector and looked exactly like one never written. */

/* ══ ADR-0213's 2026-08-30 amendment. **LAST IN THE SHEET ON PURPOSE**: these override
   shipped rules at EQUAL specificity, so placed above them they lose and do it silently —
   the first render of this change measured a 38px time cell against 52.9px of ink and
   printed the range over its own title. ══ */
/* **What the trip IS, under its name.** Replaces .pdf-route-mini, the capped stop sample
   that printed in teal beside the QR and named two airports plus three arbitrary stops. */
.pdf-what{margin-block-start:3px;font:600 10px 'Assistant',sans-serif;color:var(--pdf-ink);}
/* Where you sleep, teal because it is a location and nothing else (ADR-0028). */
.pdf-stay{color:var(--pdf-teal);}
/* **The stay's two moments, on their own line** (2026-08-31 amendment §2). Amber, because a
   clock is time and commitment — so the line above keeps teal for the place and this one
   spends the other half of ADR-0028's pair, rather than one line carrying two meanings in
   one hue. .pdf-day-copy span is (0,1,1) and sets nowrap with an ellipsis, which is
   right for the names above and wrong here: a pair of clocks is bounded, so cutting it only
   costs the fact. (0,2,0) wins it. Measured at ⁦106px⁩ of ink in a ⁦295.5px⁩ box — one line
   on paper, where the screen needs a wrap. */
.pdf-day-copy .pdf-stay-when{margin-block-start:1px;color:var(--pdf-amber);font-size:7.6px;white-space:normal;}
/* **The time column holds a range, or it wraps** (owner, 2026-08-30: "the times wrap to
   two lines which also looks bad"). Measured in the print mockup: the shipped column is
   38px and a range is 53px of ink at this face, so every row carrying one broke across two
   lines and a flight's arrival read as a stray second number under its departure. 56px
   costs 18px of a 288px copy column and buys every title starting at the same x. */
.pdf-event{grid-template-columns:56px minmax(0,1fr);}
.pdf-event-time{white-space:nowrap;}
/* One frame over N legs, with the waits named between them. break-inside:avoid so a flight
   and its layover never land on two pages. */
/* The journey block now carries its own header, so the box holds the whole thing rather than
   nesting one flight inside two others (ninth amendment §1-§3). No tint: this sheet is a
   fixed light palette that has to stay legible in grayscale, so the border does the
   containing work the screen gives to a teal wash. */
.pdf-trek{break-inside:avoid;margin:3px 0;border:1px solid var(--pdf-line);border-radius:7px;overflow:hidden;}
.pdf-trek-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;
  padding:3px 6px;border-block-end:1px solid var(--pdf-line);background:var(--pdf-soft);}
.pdf-trek-head strong{font-size:8.4px;font-weight:700;color:var(--pdf-ink);}
.pdf-trek-head span{font-size:7.4px;color:var(--pdf-muted);white-space:nowrap;}
/* A leg's own flight time, under its code. Same relationship the screen draws at its own
   micro scale: an annotation of this row, never a rival to the header's total. */
.pdf-leg-span{display:block;font-size:7px;color:var(--pdf-muted);}
.pdf-trek .pdf-event{padding-inline:6px;border-block-start:0;}
.pdf-trek .pdf-event+.pdf-event{border-block-start:1px solid var(--pdf-line);}
.pdf-leg-code{font:600 7.2px 'JetBrains Mono',monospace;color:var(--pdf-muted)!important;}
.pdf-layover{padding:2px 6px 2px 50px;background:color-mix(in srgb,var(--pdf-ink) 3%,transparent);color:var(--pdf-muted);font-size:7px;}
/* **Printed, not folded** — paper has no setting, and whoever holds the printout is the
   operator. The one decision that inverts against the reader page. */
/* **Assistant, and JetBrains only where the value is a code.** This rule set the font
   shorthand to 600 7.2px JetBrains Mono — and JetBrains ships NO Hebrew, so every note body
   printed as empty rectangles while the bold label beside it, which overrides back to
   Assistant, printed perfectly (owner, 2026-08-30: "Notes also gibberish on the pdf"). That
   is the same defect ADR-0213 already recorded once for .pdf-subtitle, in a second element:
   the font SHORTHAND replaces the family list, so the fallback never applies. 7.2px was also
   simply too small to read. */
/* **'Noto Emoji' stays in the stack, and its absence was the tofu.** The font SHORTHAND
   replaces the whole family list, so naming only Assistant here dropped the emoji face the
   body sets — and a note written with 🚁 printed an empty rectangle (owner, 2026-08-31).
   That is the SEVENTH time this shorthand has eaten a family in this file. Anything using the
   font shorthand here must repeat the whole stack; a bare font-size property cannot make the
   mistake at all, which is why the rules below prefer one. */
.pdf-ops-line{display:block;margin-block-start:4px;color:var(--pdf-ink)!important;font-family:'Assistant','Noto Emoji',sans-serif;font-size:9.4px;font-weight:400;line-height:1.55;white-space:normal!important;}
.pdf-ops-line b{font-weight:700;color:var(--pdf-muted);}
.pdf-mono{font-family:'JetBrains Mono',monospace;font-weight:600;}
.pdf-travel-facts{display:block;margin-block-start:1px;color:var(--pdf-muted);font-size:7.6px;}
.pdf-note{display:block;}
.pdf-note-title{display:block;margin-block-end:2px;}
.pdf-note-p{margin:0 0 4px;}
.pdf-note-h1{margin:6px 0 3px;font-size:10.4px;font-weight:700;}
.pdf-note-h2{margin:5px 0 2px;font-weight:700;}
.pdf-note-list{margin:0 0 4px;padding:0;list-style:none;}
.pdf-note-list li{display:flex;gap:5px;align-items:baseline;margin-block-end:1px;}
.pdf-note-mark{flex:none;color:var(--pdf-muted);font-variant-numeric:tabular-nums;}
.pdf-note-quote{margin:0 0 4px;padding-inline-start:7px;border-inline-start:2px solid var(--pdf-line);color:var(--pdf-muted);}
.pdf-note-rule{height:1px;margin:6px 0;background:var(--pdf-line);}
/* A printed link states its destination, because it cannot be tapped. */
.pdf-url{font-family:'JetBrains Mono',monospace;font-size:0.9em;color:var(--pdf-teal);word-break:break-all;}
/* A note is prose the author wrote with line breaks in it; a paragraph that collapses them
   is the wall of text this block keeps being reported as. */
.pdf-prose{white-space:pre-line;}
.pdf-travelers{margin-block-start:3px;color:var(--pdf-muted);font-size:8.4px;}
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
