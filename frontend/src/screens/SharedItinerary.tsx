import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  SHARE_DETAIL_LEVEL,
  type SharedDay,
  type SharedEvent,
  type SharedItinerary as SharedItineraryProjection,
} from '@waypoint/shared';
import { GLYPH } from '../constants';
import { Icon } from '../ui/Icon';
import { t } from '../i18n/he';
import { ltrIsolate } from '../lib/bidi';
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
          <span className="sh-brand-mark" aria-hidden="true">
            T
          </span>
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
        <div className="sh-dates">
          {ltrIsolate(`${projection.trip.startDate} - ${projection.trip.endDate}`)}
        </div>
        {summary && projection.trip.routeLabels.length > 0 ? (
          <div className="sh-route">
            {projection.trip.routeLabels.map((label, index) => (
              <span className="sh-route-stop" key={`${label}-${index}`}>
                <strong dir="auto">{label}</strong>
                {index < projection.trip.routeLabels.length - 1 ? (
                  <>
                    <span className="sh-route-line" aria-hidden="true" />
                    <span className="sh-route-dot" aria-hidden="true" />
                  </>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {stale ? <div className="sh-stale">{t.share.public.staleBody}</div> : null}

      {summary ? (
        <div className="sh-story">
          <strong dir="auto">{projection.narrative.title}</strong>
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
          <strong dir="auto">{day.title || `${weekday} ${ltrIsolate(dayNumber)}`}</strong>
          <span dir="auto">{day.summary}</span>
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
          {t.share.public.journey(event.journey.minutes, event.journey.km)}
        </div>
      ) : null}
      <article className={`sh-event${event.hard ? ' hard' : ''}`}>
        <span className="sh-event-glyph" aria-hidden="true">
          {event.icon ?? '•'}
        </span>
        <span className="sh-event-main">
          <strong dir="auto">{event.title}</strong>
          <span className="sh-place-line">
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
            <p key={`${entry.title}-${index}`} dir="auto">
              <strong>{entry.title}</strong> {entry.lines.map(ltrIsolate).join(' · ')}
            </p>
          ))}
        </Block>
      ) : null}
      {appendix.notesAndTasks?.length ? (
        <Block title={t.share.public.appendix.notesAndTasks}>
          {appendix.notesAndTasks.map((entry, index) => (
            <p key={`${entry.title}-${index}`} dir="auto">
              <strong>{entry.title}</strong> {entry.lines.join(' · ')}
            </p>
          ))}
        </Block>
      ) : null}
      {appendix.travelers?.length ? (
        <Block title={t.share.public.appendix.travelers}>
          <p dir="auto">{appendix.travelers.join(' · ')}</p>
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
