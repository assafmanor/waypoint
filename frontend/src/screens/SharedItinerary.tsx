import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  NARRATIVE_SEPARATOR,
  ROUTE_ARROW,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DETAIL_LEVEL,
  SHARE_OP_KIND,
  type ShareOpKind,
  type SharedDay,
  type SharedDaySummary,
  type SharedDayTitle,
  type SharedEvent,
  type SharedItinerary as SharedItineraryProjection,
} from '@waypoint/shared';
import { BOOKING_TYPE_MARK, GLYPH } from '../constants';
import { Icon, type IconName } from '../ui/Icon';
import { t } from '../i18n/he';
import { autoIsolate, ltrIsolate } from '../lib/bidi';
import { formatTripDates } from '../lib/time';
import brandMark from '/icon-mark-bright.svg';
import {
  fetchSharedItinerary,
  sharedDocumentUrl,
  SharedItineraryUnavailable,
} from '../lib/share-itinerary';
import './shared-itinerary.css';

const WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

/** `YYYY-MM-DD` split without a `Date`, so a browser in any zone reads the same day the
 *  server named — parsing it as a date would shift the label across the date line. */
function dayParts(date: string): { day: string; weekday: string } {
  const [year, month, day] = date.split('-').map(Number);
  return {
    day: String(day).padStart(2, '0'),
    weekday: WEEKDAY[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
  };
}

/**
 * **The derived headline, said in words** (ADR-0213's 2026-08-30 amendment).
 *
 * The projection ships `{ kind, …values }` rather than a composed line, so the words are
 * this renderer's and the PDF's own — one derivation, two locales' worth of copy. Values are
 * isolated one at a time here (`autoIsolate`), which leaves the sentence around them in the
 * page's RTL flow; the element must therefore NOT carry `dir="auto"`, which skips isolates
 * when it sniffs and would fall back to LTR on a fully isolated line.
 *
 * Empty for `NONE`: a day with nothing in it has no true title, and the caller falls back to
 * its date rather than inventing one.
 */
function dayTitleText(title: SharedDayTitle): string {
  switch (title.kind) {
    case SHARE_DAY_KIND.FLIGHT_OUT:
      return t.share.public.dayTitle.flightOut(autoIsolate(title.to));
    case SHARE_DAY_KIND.FLIGHT_HOME:
      return t.share.public.dayTitle.flightHome;
    case SHARE_DAY_KIND.FLIGHT:
      return t.share.public.dayTitle.flight(autoIsolate(title.to));
    case SHARE_DAY_KIND.ROUTE:
      return `${autoIsolate(title.from)}${ROUTE_ARROW}${autoIsolate(title.to)}`;
    case SHARE_DAY_KIND.PLACE:
      return autoIsolate(title.at);
    case SHARE_DAY_KIND.REGION:
      return autoIsolate(title.at);
    case SHARE_DAY_KIND.KIND:
      return t.share.public.dayTitle.kind(autoIsolate(title.of));
    case SHARE_DAY_KIND.TEXT:
      return title.text;
    case SHARE_DAY_KIND.NONE:
      // A day with no places has no true title, and the server sends none rather than
      // inventing one — the caller falls back to the date.
      return '';
    default:
      // **Exhaustive, and it has to be.** A `default: return ''` swallowed a new kind
      // silently — the two added on 2026-08-30 would have rendered as nothing at all, on a
      // typecheck that passed. `never` makes the next one a compile error here.
      return assertNever(title);
  }
}

/** The compiler's proof that a union was handled. Throwing is unreachable by construction;
 *  it exists so the type error is the one that fires. */
function assertNever(value: never): string {
  void value;
  return '';
}

function daySummaryText(summary: SharedDaySummary): string {
  switch (summary.kind) {
    case SHARE_DAY_SUMMARY_KIND.STAY:
      return t.share.public.daySummary.stay(autoIsolate(summary.place));
    case SHARE_DAY_SUMMARY_KIND.EVENTS:
      return summary.titles.map(autoIsolate).join(NARRATIVE_SEPARATOR);
    case SHARE_DAY_SUMMARY_KIND.TEXT:
      return summary.text;
    default:
      return '';
  }
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; projection: SharedItineraryProjection; stale: boolean }
  | { kind: 'unavailable' };

/**
 * **The page a stranger sees**, and the only screen in the app written for somebody with no
 * account (ADR-0213).
 *
 * Two decisions from the mockup carry all the way through here. The day is the spine — a
 * card per day, one open at a time, with dayparts as section headings *inside* it and no
 * heading at all where nothing belongs. And the level is never a client concern: this
 * renders whatever the projection carries, so a field that is absent at Summary is absent
 * because the server never sent it, not because a branch here chose to hide it.
 *
 * Nothing it loads is persisted. There is no Dexie write and no cache entry (the response
 * is `no-store`), so a revoked link cannot be read back off a device — which is what makes
 * revocation mean what it says. An already-open page keeps working from React memory when
 * the connection drops; a reload needs the network.
 */
export function SharedItinerary() {
  const { code = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [openDay, setOpenDay] = useState(0);

  const load = useCallback(async () => {
    try {
      const projection = await fetchSharedItinerary(code);
      setState({ kind: 'ready', projection, stale: false });
    } catch (error) {
      setState((previous) =>
        // A failed REFRESH keeps what is on screen and says so; only a failed first load is
        // "unavailable". A page that blanks itself because a tunnel ate one request is
        // worse than one that admits it is a minute old.
        previous.kind === 'ready'
          ? { ...previous, stale: true }
          : error instanceof SharedItineraryUnavailable || error instanceof Error
            ? { kind: 'unavailable' }
            : { kind: 'unavailable' },
      );
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') return <div className="sh-boot">{t.share.public.loading}</div>;
  if (state.kind === 'unavailable') return <Unavailable />;

  const { projection, stale } = state;
  const summary = projection.detailLevel === SHARE_DETAIL_LEVEL.SUMMARY;

  return (
    <div className="sh-page">
      <div className="sh-public-bar">
        <span className="sh-brand">
          {/* The app's own mark, not its initial (owner, 2026-08-30). `public/` rather than
              an inline SVG: the same file the favicon and the PWA icon are cut from, so the
              page a stranger lands on cannot drift from the icon in their tab. */}
          <img className="sh-brand-mark" src={brandMark} alt="" width={20} height={20} />
          {t.share.public.brand}
        </span>
        <span className={`sh-freshness${stale ? ' stale' : ''}`}>
          <span className="sh-live-dot" aria-hidden="true" />
          {stale ? t.share.public.stale : t.share.public.live}
        </span>
      </div>

      <header className="sh-hero">
        {/* **How the trip moves**, beside where it goes (owner, 2026-08-30). Two trips with
            the same destination and length read completely differently depending on it, and
            the page said nothing — worse, it printed a ROUTE for both, which on a star trip
            describes the commute. The base count is only added where the shape implies
            several; on a star trip `1 בסיס` is the same sentence twice. */}
        <div className="sh-kicker">
          {[
            t.share.public.kicker,
            t.share.public.tripShape[projection.trip.shape],
            projection.trip.baseCount > 1
              ? t.share.public.bases(projection.trip.baseCount)
              : undefined,
          ]
            .filter(Boolean)
            .join(NARRATIVE_SEPARATOR)}
          {' · '}
          <span>{autoIsolate(projection.trip.destination)}</span>
        </div>
        <h1 className="sh-title">
          {projection.trip.icon ? (
            <span className="sh-title-mark" aria-hidden="true">
              {projection.trip.icon}
            </span>
          ) : null}
          <span>{projection.trip.name}</span>
        </h1>
        {/* The app's own trip-range shape (`lib/time.ts`), not two raw ISO dates — the
            All Trips card has read `27.08–02.09` since long before this page existed. */}
        <div className="sh-dates">
          {ltrIsolate(formatTripDates(projection.trip.startDate, projection.trip.endDate))}
          {' · '}
          {t.share.public.counts(projection.trip.dayCount, projection.trip.eventCount)}
        </div>
        {/* **THE ROUTE STRIP IS GONE FROM THE PHONE** (owner, 2026-08-30: _"The amber line is
            meaningless, no one can get any info from just the initials. I say drop it or
            change it entirely."_).

            It was `routeLabels` laid out as a connected strip, and the arithmetic was never
            going to work: `MAX_ROUTE_LABELS` is 8, and eight labels plus their connectors
            inside 390px leaves about 30px each — so every stop ellipsised to an initial and
            the line read `נמל הת… — S. — S. — D. — G.`. A row of first letters is not a
            summary of a route, it is a row of first letters.

            **Deleted here and kept on paper**, which is not an inconsistency: the PDF lays
            the same eight labels across an A4 column and prints them whole. The strip was
            always a width bet, and only one of the two media can afford it (ADR-0213 §3).
            What the phone keeps instead is the line that already said the same thing in
            words — the trip's own route title, one element down. */}
      </header>

      {stale ? <div className="sh-stale">{t.share.public.staleBody}</div> : null}

      {summary ? (
        <div className="sh-story">
          {/* **No `dir="auto"` on a COMPOSED line** — the server already isolated every
              value inside it (`itinerary-narrative.fallback.ts`), and `auto` ignores
              isolated content when it sniffs, so it would find no strong character and fall
              back to LTR. Inheriting the page's RTL is what makes the route arrow mean the
              same thing whether the stops are Hebrew or Latin. */}
          <strong>{projection.narrative.title}</strong>
          <p>
            {/* The generated line when there is one; otherwise the counts sentence, which
                the server deliberately does not compose — it ships the numbers. */}
            {projection.narrative.summary ||
              t.share.public.counts(projection.trip.dayCount, projection.trip.eventCount)}
          </p>
        </div>
      ) : null}

      {/* **Above the days, not among them** — a reader looks for the flights first, and the
          day spine stays the spine (ADR-0004: no second tab, and this is not one). */}
      {projection.commitments.length > 0 ? (
        <Commitments commitments={projection.commitments} code={code} />
      ) : null}

      <main className="sh-days">
        <div className="sh-days-head">
          <h2>{summary ? t.share.public.days : t.share.public.schedule}</h2>
          <span>{t.share.public.daysHint}</span>
        </div>
        {projection.days.map((day, index) => (
          <DayCard
            key={day.date}
            day={day}
            open={openDay === index}
            onToggle={() => setOpenDay(openDay === index ? -1 : index)}
            code={code}
          />
        ))}
      </main>

      {projection.appendix ? <Appendix appendix={projection.appendix} code={code} /> : null}

      <footer className="sh-footer">
        <strong>{t.share.public.inviteTitle}</strong>
        <span>{t.share.public.inviteBody}</span>
        <a href="/">{t.share.public.inviteCta}</a>
      </footer>
    </div>
  );
}

function DayCard({
  day,
  open,
  onToggle,
  code,
}: {
  day: SharedDay;
  open: boolean;
  onToggle: () => void;
  code: string;
}) {
  const { day: dayNumber, weekday } = dayParts(day.date);
  return (
    <section className={`sh-day${open ? ' open' : ''}`} id={`day-${day.ordinal}`}>
      {/* **A real photo of a real stop, credited** (ADR-0213's 2026-08-30 amendment). Not
          stock and not generated: a Commons file already in the store, already licensed,
          already rendered elsewhere in the app — which is why §3's refusal of "a new media
          dependency" does not reach it. `loading="lazy"` because twelve of these below the
          fold is twelve requests nobody asked for. */}
      {day.photo ? (
        <figure className="sh-shot">
          <img src={day.photo.url} alt={day.photo.of} loading="lazy" decoding="async" />
          <figcaption>
            <strong>{autoIsolate(day.photo.of)}</strong>
            <span>{autoIsolate(day.photo.credit)}</span>
          </figcaption>
        </figure>
      ) : null}
      <button className="sh-day-head" onClick={onToggle} aria-expanded={open} type="button">
        <span className="sh-day-date">
          <strong>{ltrIsolate(dayNumber)}</strong>
          <span>{weekday}</span>
        </span>
        <span className="sh-day-copy">
          {/* A day with no places has no true title, and the server sends none rather than
              inventing one — the date is then the name. */}
          {/* Composed server-side with its values already isolated — see the story line
              above for why this must not sniff. */}
          <strong>{dayTitleText(day.title) || `${weekday} ${ltrIsolate(dayNumber)}`}</strong>
          {/* **Where you sleep frames the day** (ADR-0213's 2026-08-30 amendment). It used
              to be a row in the afternoon, sorted there by its check-in hour — which on the
              outbound day put it between the two legs of the flight, and printed
              `15:00–11:00` because a stay's span crosses midnight. */}
          {day.stay ? (
            <span className="sh-stay">
              <Icon name="hotel" />
              {t.share.public.stay(autoIsolate(day.stay))}
            </span>
          ) : (
            <span>{daySummaryText(day.summary)}</span>
          )}
        </span>
        <span className="sh-caret">
          <Icon name="caret" />
        </span>
      </button>
      {open ? (
        <div className="sh-day-body">
          {day.sections.map((section) => (
            <section className="sh-part" key={section.daypart}>
              <header className="sh-part-head">
                <span className="sh-part-mark" aria-hidden="true">
                  {GLYPH.daypart[section.daypart]}
                </span>
                <span>{t.share.dayparts[section.daypart]}</span>
              </header>
              {section.events.map((event, index) => (
                <EventRow key={`${event.title}-${index}`} event={event} code={code} />
              ))}
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EventRow({ event, code }: { event: SharedEvent; code: string }) {
  // Summary carries no time, place, address, map link or journey at all, so the compact row
  // is not a different rendering of the same data — it is all the data there is.
  const detailed = event.startLabel !== undefined || event.placeName !== undefined;
  if (!detailed) {
    return (
      <div className="sh-summary-row">
        <span className="sh-mark" aria-hidden="true">
          {event.icon ?? '•'}
        </span>
        <strong>{autoIsolate(event.title)}</strong>
      </div>
    );
  }
  return (
    <>
      {event.journey ? (
        <div className="sh-journey">
          {/* The mode is a control-shaped fact, so it gets the app's own icon beside its
              own word — `Icon`'s names ARE the mode keys, which is how `DayJoinRow`
              already draws it. */}
          <Icon name={event.journey.mode} />
          {t.share.public.journey(
            t.travelMode[event.journey.mode],
            event.journey.minutes,
            event.journey.km,
          )}
        </div>
      ) : null}
      <article className={`sh-event${event.hard ? ' hard' : ''}`}>
        <span className="sh-event-glyph" aria-hidden="true">
          {event.icon ?? '•'}
        </span>
        <span className="sh-event-main">
          {/* **`autoIsolate`, NEVER `dir="auto"` on a value block** (found by rendering
              `a-shared-itinerary-is-printed-as-a-story-v3.html` §6). `auto` sets the
              element's BASE DIRECTION, and base direction drives `text-align: start` as
              well as bidi resolution — so a Latin place name lands against the opposite
              edge of the column from its own caption. Measured 212px of separation here
              and 229px on paper, in a 288px column, and on an Iceland trip most stops are
              Latin. FSI resolves direction for the RUN and leaves the block RTL, so the
              alignment is inherited. `lib/bidi.ts`'s docblock covers a composed line
              joining several values, which is why one value alone in a block slipped
              ADR-0118's sweep. */}
          <strong>{autoIsolate(event.title)}</strong>
          <span className="sh-place-line">
            {/* **The row says what it IS before it says where** (owner, 2026-08-30: _"hotels
                and other derivable stuff texts should be enhanced … and that also includes
                bookings"_). A booking states its type, so a hotel's own name gets `לינה` in
                front of its hour. An event no booking backs is captioned with nothing — a
                guess in this slot is worse than a gap. The words are the app's own
                (`t.index.bookingType`), never a second set for this page. */}
            {event.bookingType ? (
              <>
                <b className="sh-kind">{t.index.bookingType[event.bookingType]}</b>
                {' · '}
              </>
            ) : null}
            {/* The range where there is one, so a flight says when it lands. Isolated as ONE
                run rather than two: `09:20–14:05` reads left-to-right whole, and isolating
                each end separately would let the RTL flow put the arrival first. */}
            {event.startLabel ? (
              <span className="sh-time">
                {ltrIsolate(
                  event.endLabel && event.endLabel !== event.startLabel
                    ? t.share.public.timeRange(event.startLabel, event.endLabel)
                    : event.startLabel,
                )}
              </span>
            ) : null}
            {event.placeName ? (
              <>
                {event.startLabel ? ' · ' : null}
                <span>{autoIsolate(event.placeName)}</span>
              </>
            ) : null}
            {event.address ? (
              <>
                {' · '}
                <span>{autoIsolate(event.address)}</span>
              </>
            ) : null}
          </span>
          {/* **A stop's one-line description, at every level** (owner, 2026-08-30). Clamped
              to two lines: a caption is two lines, and four is a paragraph — the mockup
              measured day 9 growing 230px on captions alone before the clamp. */}
          {event.caption ? (
            <span className="sh-place-line sh-cap">{autoIsolate(event.caption)}</span>
          ) : null}
          {event.mapUrl ? (
            <a
              className="sh-map-link"
              href={event.mapUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon name="map" />
              {t.share.public.map}
            </a>
          ) : null}
          {event.ops?.length ? <Ops ops={event.ops} code={code} /> : null}
        </span>
      </article>
      {/* **The legs, under the journey they belong to** — with the wait named between them.
          The frame above already says the whole span, so this is the detail inside it and
          not a second copy of the row. */}
      {event.legs?.length ? (
        <div className="sh-legs">
          {event.legs.map((leg, index) => (
            <div className="sh-leg" key={`${leg.title}-${index}`}>
              {leg.layoverMinutes ? (
                <span className="sh-layover">
                  <Icon name="clock" />
                  {t.share.public.layover(leg.title, leg.layoverMinutes)}
                </span>
              ) : null}
              <span className="sh-leg-row">
                <span className="sh-time">
                  {ltrIsolate(
                    leg.endLabel && leg.endLabel !== leg.startLabel
                      ? t.share.public.timeRange(leg.startLabel ?? '', leg.endLabel)
                      : (leg.startLabel ?? ''),
                  )}
                </span>
                <span>
                  <strong>{autoIsolate(leg.title)}</strong>
                  {leg.code ? <span className="sh-kind">{ltrIsolate(leg.code)}</span> : null}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function Appendix({
  appendix,
  code,
}: {
  appendix: NonNullable<SharedItineraryProjection['appendix']>;
  code: string;
}) {
  return (
    <section className="sh-appendix">
      <h2>{t.share.public.appendix.title}</h2>
      {/* No booking block: every booking has a host by construction, so a confirmation
          code now travels under its own row (`Ops`). */}
      {appendix.notesAndTasks?.length ? (
        <Block title={t.share.public.appendix.notesAndTasks}>
          {appendix.notesAndTasks.map((entry, index) => (
            <p key={`${entry.title}-${index}`}>
              <strong>{autoIsolate(entry.title)}</strong> {entry.lines.map(autoIsolate).join(' · ')}
            </p>
          ))}
        </Block>
      ) : null}
      {appendix.travelers?.length ? (
        <Block title={t.share.public.appendix.travelers}>
          <p>{appendix.travelers.map(autoIsolate).join(' · ')}</p>
        </Block>
      ) : null}
      {appendix.documents?.length ? (
        <Block title={t.share.public.appendix.documents}>
          {appendix.documents.map((document) => (
            <p key={document.handle}>
              <a href={sharedDocumentUrl(code, document.handle)}>{autoIsolate(document.title)}</a>
            </p>
          ))}
        </Block>
      ) : null}
    </section>
  );
}

/**
 * **The operational material, under the row it belongs to and folded** (ADR-0213's
 * 2026-08-30 amendment, reversing §4's appendix).
 *
 * Closed by default, and that is the whole reason a fold rather than a printed line: a
 * reader wants the schedule and an operator wants the code, and the two are the same person
 * at different moments. The print renderer inverts this — paper has no setting, and whoever
 * is holding the printout is by that act the operator.
 */
function Ops({ ops, code }: { ops: NonNullable<SharedEvent['ops']>; code: string }) {
  return (
    <details className="sh-ops">
      {/* 44px of target without 44px of line — the summary keeps its own 28px box and the
          hit area is an `::after` overlay, exactly as `ValueToken` does it (ADR-0177). A
          `min-height` here would add 16px to every row that carries a detail. */}
      <summary>
        <Icon name="caret" />
        {t.share.public.ops.more(ops.length)}
      </summary>
      <span className="sh-ops-body">
        {ops.map((op, index) => (
          <span className="sh-op" key={`${op.kind}-${index}`}>
            <Icon name={OP_ICON[op.kind]} />
            {op.kind === SHARE_OP_KIND.CODE ? (
              <>
                <code>{ltrIsolate(op.code)}</code>
                {op.provider ? <span>{autoIsolate(op.provider)}</span> : null}
              </>
            ) : null}
            {op.kind === SHARE_OP_KIND.NOTE ? (
              <span>
                {autoIsolate([op.title, op.body].filter(Boolean).join(NARRATIVE_SEPARATOR))}
              </span>
            ) : null}
            {op.kind === SHARE_OP_KIND.TASK ? <span>{autoIsolate(op.title)}</span> : null}
            {op.kind === SHARE_OP_KIND.FILE ? (
              <a href={sharedDocumentUrl(code, op.handle)}>{autoIsolate(op.title)}</a>
            ) : null}
          </span>
        ))}
      </span>
    </details>
  );
}

/** One glyph per op kind, as a `Record` over the closed union — so a sixth kind is a
 *  compile error here rather than a missing icon in production (`frontend/CLAUDE.md`'s
 *  constants convention). */
const OP_ICON = {
  [SHARE_OP_KIND.CODE]: 'clipboard',
  [SHARE_OP_KIND.NOTE]: 'edit',
  [SHARE_OP_KIND.TASK]: 'check',
  [SHARE_OP_KIND.FILE]: 'documents',
} as const satisfies Record<ShareOpKind, IconName>;

/**
 * **The trip's fixed points, above the schedule** (owner, 2026-08-30: _"Maybe these
 * sharings should have sections for important stuff, like flights, reservations etc."_).
 *
 * Not a tab (ADR-0004) and not a second spine — a list of five or six lines above the days,
 * each jumping to its own. It is what a reader looks for first and what they screenshot.
 */
function Commitments({
  commitments,
  code,
}: {
  commitments: SharedItineraryProjection['commitments'];
  code: string;
}) {
  return (
    <section className="sh-fixed">
      <h2>{t.share.public.commitments.title}</h2>
      {commitments.map((row, index) => (
        <a className="sh-fixed-row" href={`#day-${row.dayOrdinal}`} key={`${row.title}-${index}`}>
          <Icon name={BOOKING_TYPE_MARK[row.bookingType]} />
          <span>
            <b>{autoIsolate(row.title)}</b>
            {row.detail ? <i>{autoIsolate(row.detail)}</i> : null}
            {row.ops?.length ? <Ops ops={row.ops} code={code} /> : null}
          </span>
          <span className="sh-fixed-when">{ltrIsolate(commitmentWhen(row))}</span>
        </a>
      ))}
    </section>
  );
}

/** `11.09`, or `11–21.09` for a stay that spans nights. Day-and-month only: the year is on
 *  the masthead and a reader checking a flight date does not need it twice. */
function commitmentWhen(row: SharedItineraryProjection['commitments'][number]): string {
  const short = (date: string) => date.slice(8, 10) + '.' + date.slice(5, 7);
  if (!row.endDate || row.endDate === row.date) return short(row.date);
  return `${row.date.slice(8, 10)}–${short(row.endDate)}`;
}

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="sh-private">
    <strong>{title}</strong>
    {children}
  </div>
);

const Unavailable = () => (
  <div className="sh-unavailable">
    <div>
      <div className="sh-unavailable-mark" aria-hidden="true">
        <Icon name="link" />
      </div>
      <h2>{t.share.public.unavailableTitle}</h2>
      <p>{t.share.public.unavailableBody}</p>
    </div>
  </div>
);
