import {
  eventDisplayZones,
  memoryBestPicks,
  memoryFigureValues,
  NARRATIVE_SEPARATOR,
  NARRATIVE_SOURCE,
  SHARE_DETAIL_LEVEL,
  shareTimeLabel,
  type MemoryBestPick,
  type SharedDay,
  type SharedEvent,
  type SharedItinerary,
  type SharedPhoto,
  type TripEvent,
} from '@waypoint/shared';
import { PDF_COPY, pdfSpan } from './hebrew.copy';
import {
  appendixBlock,
  auto,
  dayTitleText,
  escapeHtml,
  fontFaces,
  ltr,
  noteMarkup,
  num,
  PDF_APPENDIX_CSS,
  PDF_NOTE_CSS,
  timeText,
  tripRange,
} from './itinerary-pdf.template';
import type { TripRecord } from './trip-recap.service';

/**
 * **The trip book** (ADR-0241 §6): a finished trip on paper, a second template beside the
 * itinerary's. It prints the projection of the RECORD (`project(…, { record: true })`: only the
 * rows that happened, told in the past tense) plus the server recap, at the link's own policy.
 *
 * **The policy decides what a page may say, and the book adds no switch.** At Summary the
 * projection carries no clock and no address, and the back page's rows drop their clocks too.
 * Notes arrive on the days only when the policy includes them (Everything with notes).
 *
 * Same paper as the itinerary: A4, fixed light, the same inlined faces, the same running footer
 * with the live URL, and the same QR on the first page. Everything is escaped and nothing is
 * fetched; photos arrive as data URLs.
 */
export interface TripBookInput {
  projection: SharedItinerary;
  record: TripRecord;
  publicUrl: string;
  qrDataUrl: string;
  /** Root-relative image URL → data URL, for the day shots and the cover alike. */
  photoDataUrls: Record<string, string>;
}

const COPY = PDF_COPY.book;

function dayParts(date: string): { weekday: string; dayMonth: string } {
  const [year, month, day] = date.split('-').map(Number);
  return {
    weekday: COPY.weekdayLetters[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
    dayMonth: `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`,
  };
}

/** `ה׳ 25.09`: how the Home names a day (`dayWhen` in `lib/memory-home.ts`). */
export function bookDayWhen(date: string): string {
  const { weekday, dayMonth } = dayParts(date);
  return `${weekday} ${dayMonth}`;
}

/** The same, as markup: **only the digits are mono**. The weekday is a Hebrew letter and
 *  JetBrains Mono ships none, so wrapping the whole run in `num` printed it as a box. */
export function bookDayWhenHtml(date: string): string {
  const { weekday, dayMonth } = dayParts(date);
  return `${weekday} ${num(dayMonth)}`;
}

/** A picture with its subject and credit on it: the licence does not end at the app's edge
 *  (ADR-0219 §6). No bytes, no figure: an absent picture is an honest absence. */
function shot(photo: SharedPhoto | undefined, dataUrls: Record<string, string>, height: number) {
  const src = photo ? dataUrls[photo.url] : undefined;
  if (!photo || !src) return '';
  return (
    `<figure class="bk-shot" style="height:${height}px"><img src="${src}" alt="" />` +
    `<figcaption>${auto(photo.of)} · ${escapeHtml(photo.credit)}</figcaption></figure>`
  );
}

function figuresBlock(record: TripRecord): string {
  const figures = memoryFigureValues(record.recap);
  if (figures.length === 0) return '';
  return (
    `<div class="bk-figs">` +
    figures
      .map(
        (figure) =>
          `<div class="bk-fig"><b>${ltr(figure.value)}</b><span>${PDF_COPY.memory.fig[figure.key]}</span>` +
          (figure.unresolved
            ? `<small>${PDF_COPY.memory.unresolved(figure.unresolved)}</small>`
            : '') +
          `</div>`,
      )
      .join('') +
    `</div>`
  );
}

/** One stop: its clock where the level has one, its title, and what it was. */
function stopRow(event: SharedEvent, timed: boolean): string {
  const kind = event.bookingType ? PDF_COPY.bookingType[event.bookingType] : undefined;
  // A stop named for its place (`שוק צוקיג׳י` at שוק צוקיג׳י) says the place once.
  const place =
    event.placeName && event.placeName !== event.title ? auto(event.placeName) : undefined;
  const facts = [kind, place].filter(Boolean);
  return (
    `<li><span class="t">${timed ? timeText(event) : ''}</span>` +
    `<span>${auto(event.title)}` +
    (facts.length
      ? `<span class="k">${NARRATIVE_SEPARATOR}${facts.join(NARRATIVE_SEPARATOR)}</span>`
      : '') +
    `</span></li>`
  );
}

function dayBlock(day: SharedDay, timed: boolean, dataUrls: Record<string, string>): string {
  const events = day.sections.flatMap((section) => section.events);
  return (
    `<section class="bk-day">` +
    `<div class="bk-kicker">${COPY.dayKicker(day.ordinal, bookDayWhen(day.date))}</div>` +
    `<h2 class="bk-day-title">${dayTitleText(day.title) || bookDayWhenHtml(day.date)}</h2>` +
    `<div class="bk-rule"></div>` +
    shot(day.photo, dataUrls, 220) +
    `<ul class="bk-stops">${events.map((event) => stopRow(event, timed)).join('')}</ul>` +
    (day.skipped?.length
      ? `<div class="bk-skip">${COPY.skipped(day.skipped.map(auto).join(NARRATIVE_SEPARATOR))}</div>`
      : '') +
    (day.notes?.length
      ? `<div class="bk-h2">${COPY.notes}</div>` +
        day.notes
          .map(
            (note) =>
              `<div class="bk-note">` +
              (note.title ? `<strong class="pdf-note-title">${auto(note.title)}</strong>` : '') +
              (note.body ? `<div class="pdf-note">${noteMarkup(note.body)}</div>` : '') +
              `</div>`,
          )
          .join('')
      : '') +
    `</section>`
  );
}

/** A row of the back page: what it is, the facts behind it, and a clock where the level has one. */
interface BackRow {
  clock?: string;
  lead: string;
  detail?: string;
}

function backRows(rows: readonly BackRow[]): string {
  return (
    `<ul class="bk-stops">` +
    rows
      .map(
        (row) =>
          `<li><span class="t">${row.clock ? `<span class="pdf-mono">${ltr(row.clock)}</span>` : ''}</span>` +
          `<span>${row.lead}${row.detail ? `<span class="k">${NARRATIVE_SEPARATOR}${row.detail}</span>` : ''}</span></li>`,
      )
      .join('') +
    `</ul>`
  );
}

/**
 * **`ראשונים וטובים`, worded for paper.** The picks are shared's `memoryBestPicks`, so the book
 * and the Home name the same rows; a day is named by its record title where the book has one.
 */
export function bookBests(input: {
  record: TripRecord;
  days: readonly SharedDay[];
  timed: boolean;
}): BackRow[] {
  const { record, days, timed } = input;
  const copy = COPY.bests;
  const clockOf = (event: TripEvent) =>
    timed && event.startsAt
      ? shareTimeLabel(event.startsAt, eventDisplayZones(event, record.evidence).start)
      : undefined;
  const dayName = (date: string) => {
    const day = days.find((d) => d.date === date);
    const title = day ? dayTitleText(day.title) : '';
    return [bookDayWhenHtml(date), title].filter(Boolean).join(NARRATIVE_SEPARATOR);
  };
  const eventRow = (label: string, event: TripEvent, detail?: string): BackRow => ({
    clock: clockOf(event),
    lead: `${label}${NARRATIVE_SEPARATOR}${auto(event.title)}`,
    detail,
  });
  return memoryBestPicks(record).map((pick: MemoryBestPick): BackRow => {
    switch (pick.key) {
      case 'first':
      case 'last':
        return eventRow(copy[pick.key], pick.event);
      case 'longestStop':
        return eventRow(copy.longestStop, pick.event, pdfSpan(pick.minutes));
      case 'busiestDay':
        return {
          lead: `${copy.busiestDay}${NARRATIVE_SEPARATOR}${dayName(pick.date)}`,
          detail: copy.places(pick.places),
        };
    }
  });
}

/** **`בפעם הבאה`**: the recap's own list and order, skipped rows then ideas never used. */
export function bookNextTime(record: TripRecord): BackRow[] {
  const copy = COPY.nextTime;
  const eventById = new Map(record.events.map((event) => [event.id, event]));
  const maybeById = new Map(record.maybes.map((maybe) => [maybe.id, maybe]));
  return [
    ...record.recap.nextTime.skipped.flatMap((id): BackRow[] => {
      const event = eventById.get(id);
      return event
        ? [
            {
              lead: auto(event.title),
              detail: `${copy.skipped}${NARRATIVE_SEPARATOR}${bookDayWhenHtml(event.date)}`,
            },
          ]
        : [];
    }),
    ...record.recap.nextTime.ideas.flatMap((id): BackRow[] => {
      const maybe = maybeById.get(id);
      return maybe ? [{ lead: auto(maybe.title), detail: copy.idea }] : [];
    }),
  ];
}

export function tripBookHtml({
  projection,
  record,
  publicUrl,
  qrDataUrl,
  photoDataUrls,
}: TripBookInput): string {
  const timed = projection.detailLevel !== SHARE_DETAIL_LEVEL.SUMMARY;
  const { trip, narrative } = projection;
  const figures = figuresBlock(record);

  const cover =
    `<section class="bk-cover">` +
    `<div class="bk-kicker">${COPY.kicker}</div>` +
    `<h1 class="bk-title">${auto(trip.name)}</h1>` +
    `<div class="bk-sub">${num(tripRange(trip.startDate, trip.endDate))}${NARRATIVE_SEPARATOR}${PDF_COPY.days(trip.dayCount)}</div>` +
    `<div class="bk-rule"></div>` +
    // Only a generated narrative has something of its own to say. The deterministic one's title
    // is the trip's name in bidi isolates, which compares unequal to the name and printed it
    // twice in the first render.
    (narrative.source === NARRATIVE_SOURCE.GENERATED
      ? `<p class="bk-story"><strong>${escapeHtml(narrative.title)}</strong>` +
        (narrative.summary ? ` ${escapeHtml(narrative.summary)}` : '') +
        `</p>`
      : '') +
    shot(record.recap.cover, photoDataUrls, 520) +
    figures +
    `<div class="bk-qr"><img src="${qrDataUrl}" alt="" /><span>${ltr(publicUrl)}</span></div>` +
    `</section>`;

  const days = projection.days.map((day) => dayBlock(day, timed, photoDataUrls)).join('');

  const bests = bookBests({ record, days: projection.days, timed });
  const nextTime = bookNextTime(record);
  const back =
    `<section class="bk-back">` +
    (figures
      ? `<div class="bk-kicker">${COPY.figures}</div><div class="bk-rule"></div>${figures}`
      : '') +
    (bests.length ? `<div class="bk-h2">${COPY.bests.title}</div>${backRows(bests)}` : '') +
    (nextTime.length
      ? `<div class="bk-h2">${COPY.nextTime.title}</div>${backRows(nextTime)}`
      : '') +
    appendixBlock(projection) +
    `</section>`;

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><style>
${fontFaces()}
/* Fixed light, legible in greyscale (ADR-0213 §4). Rose is spent on the kicker and the rule
   alone: a finished trip's own mark, and a rule survives greyscale (ADR-0241 §6). The margins
   are the renderer's, beside the running footer, exactly as for the itinerary. NOTE: no
   backticks in this sheet, which is a template literal. */
:root{--pdf-ink:#16233d;--pdf-muted:#626b7e;--pdf-line:#d8dde6;--pdf-amber:#915e1e;--pdf-teal:#237d7a;--bk-memory-deep:#86395f;}
@page{size:A4;}
*{box-sizing:border-box;}
html,body{margin:0;background:#fff;color:var(--pdf-ink);font-family:'Assistant','Noto Emoji',system-ui,sans-serif;}
.pdf-num{font-family:'JetBrains Mono',monospace;}
.pdf-word{font-family:'Assistant',sans-serif;}
.bk-cover{display:flex;flex-direction:column;gap:12px;break-after:page;}
.bk-kicker{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--bk-memory-deep);}
.bk-title{margin:0;font:44px/1.05 'Secular One','Noto Emoji',sans-serif;}
.bk-sub{font-size:13px;color:var(--pdf-muted);}
/* 3px of the archive's deep rose: the book's one mark, and a rule survives greyscale. */
.bk-rule{height:3px;margin:2px 0 6px;background:var(--bk-memory-deep);}
.bk-story{margin:0;font-size:12px;line-height:1.6;color:var(--pdf-muted);}
.bk-story strong{color:var(--pdf-ink);}
.bk-shot{position:relative;margin:0;border-radius:6px;overflow:hidden;}
.bk-shot img{display:block;width:100%;height:100%;object-fit:cover;}
.bk-shot figcaption{position:absolute;inset-inline-end:12px;bottom:8px;font-size:10px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.7);}
.bk-figs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.bk-fig{padding:12px 8px;border:1px solid var(--pdf-line);border-radius:8px;text-align:center;break-inside:avoid;}
.bk-fig b{display:block;font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:700;}
.bk-fig span{font-size:11px;font-weight:600;color:var(--pdf-muted);}
.bk-fig small{display:block;font-size:10px;color:var(--pdf-muted);}
.bk-qr{display:flex;align-items:center;gap:8px;margin-block-start:4px;color:var(--pdf-muted);font:7px 'JetBrains Mono',monospace;}
.bk-qr img{width:46px;height:46px;}
/* **Two to a page and never split.** A day is the unit that may not break; drawn one to a
   page first, the render left about 60% of every A4 blank (ADR-0241 §6). */
.bk-day{display:flex;flex-direction:column;gap:10px;break-inside:avoid;margin-block-end:22px;}
.bk-day-title{margin:0;font:28px/1.1 'Secular One','Noto Emoji',sans-serif;}
.bk-h2{margin:10px 0 0;font:20px 'Secular One',sans-serif;break-after:avoid;}
.bk-stops{display:grid;gap:8px;margin:0;padding:0;list-style:none;font-size:13px;}
/* 92px holds a range (22:15–06:20 is ~80px of mono at 12px): the first render at 56px ran every
   range into its title. */
.bk-stops li{display:grid;grid-template-columns:92px 1fr;gap:10px;align-items:baseline;padding-block-end:8px;border-block-end:1px solid var(--pdf-line);break-inside:avoid;}
/* A clock is amber on paper as on screen: time and commitment only. font-family and never the
   font shorthand, which would drop the Assistant that .pdf-word gives the cell's Hebrew. */
.bk-stops .t{color:var(--pdf-amber);font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;white-space:nowrap;}
.bk-stops .k{color:var(--pdf-muted);font-size:11px;}
.bk-skip{font-size:11px;color:var(--pdf-muted);}
.bk-note{margin:0;padding-inline-start:10px;border-inline-start:3px solid var(--pdf-line);font-size:12px;line-height:1.6;break-inside:avoid;}
.bk-back{display:flex;flex-direction:column;gap:10px;break-before:page;}
${PDF_APPENDIX_CSS}
${PDF_NOTE_CSS}
</style></head><body>${cover}${days}${back}</body></html>`;
}
