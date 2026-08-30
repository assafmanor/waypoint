import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  NARRATIVE_SEPARATOR,
  ROUTE_ARROW,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DETAIL_LEVEL,
  type SharedDay,
  type SharedDaySummary,
  type SharedDayTitle,
  type SharedEvent,
  type SharedItinerary as SharedItineraryProjection,
} from '@waypoint/shared';
import { GLYPH } from '../constants';
import { Icon } from '../ui/Icon';
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
    case SHARE_DAY_KIND.TEXT:
      return title.text;
    default:
      return '';
  }
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
        <div className="sh-kicker">
          {t.share.public.kicker} · <span dir="auto">{projection.trip.destination}</span>
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

function DayCard({ day, open, onToggle }: { day: SharedDay; open: boolean; onToggle: () => void }) {
  const { day: dayNumber, weekday } = dayParts(day.date);
  return (
    <section className={`sh-day${open ? ' open' : ''}`}>
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
          <span>{daySummaryText(day.summary)}</span>
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
                <EventRow key={`${event.title}-${index}`} event={event} />
              ))}
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EventRow({ event }: { event: SharedEvent }) {
  // Summary carries no time, place, address, map link or journey at all, so the compact row
  // is not a different rendering of the same data — it is all the data there is.
  const detailed = event.startLabel !== undefined || event.placeName !== undefined;
  if (!detailed) {
    return (
      <div className="sh-summary-row">
        <span className="sh-mark" aria-hidden="true">
          {event.icon ?? '•'}
        </span>
        <strong dir="auto">{event.title}</strong>
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
          <strong dir="auto">{event.title}</strong>
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
            {event.startLabel ? (
              <span className="sh-time">{ltrIsolate(event.startLabel)}</span>
            ) : null}
            {event.placeName ? (
              <>
                {event.startLabel ? ' · ' : null}
                <span dir="auto">{event.placeName}</span>
              </>
            ) : null}
            {event.address ? (
              <>
                {' · '}
                <span dir="auto">{event.address}</span>
              </>
            ) : null}
          </span>
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
        </span>
      </article>
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
      {appendix.bookingSecrets?.length ? (
        <Block title={t.share.public.appendix.bookingSecrets}>
          {appendix.bookingSecrets.map((entry, index) => (
            // The line joins values from different sources, so each is isolated on its
            // own and the row keeps the page's direction — never `dir="auto"` over a
            // composition (`lib/bidi.ts`). Codes are Latin by construction; the title is
            // not.
            <p key={`${entry.title}-${index}`}>
              <strong dir="auto">{entry.title}</strong> {entry.lines.map(ltrIsolate).join(' · ')}
            </p>
          ))}
        </Block>
      ) : null}
      {appendix.notesAndTasks?.length ? (
        <Block title={t.share.public.appendix.notesAndTasks}>
          {appendix.notesAndTasks.map((entry, index) => (
            <p key={`${entry.title}-${index}`}>
              <strong dir="auto">{entry.title}</strong> {entry.lines.map(autoIsolate).join(' · ')}
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
              <a href={sharedDocumentUrl(code, document.handle)} dir="auto">
                {document.title}
              </a>
            </p>
          ))}
        </Block>
      ) : null}
    </section>
  );
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
