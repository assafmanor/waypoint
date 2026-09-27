// **A FINISHED TRIP'S COVER** — the memory Home's first card (ADR-0240 §4).
//
// A day head's card at trip scale, and built from the head's own parts rather than a copy of
// them: `PhotoBand` at its `cover` density bleeds to the strip the way a day's picture does
// (`day-head.css`'s `:first-child:has()` rule), and the footer band is the head's
// `.wp-dayhead-foot`, where a day keeps its one action. There the stragglers sit: the rows the
// trip still has not marked, which ADR-0239 §9 requires every figure below to admit to.
//
// No placeholder when there is no picture (ADR-0219 §3): the card starts at its title.
//
// Presentational, `ui/domain/`: every value arrives composed by the screen.
import { Fragment } from 'react';
import { ROUTE_ARROW } from '@waypoint/shared';
import { DOT_SEPARATOR } from '../../constants';
import { autoIsolate } from '../../lib/bidi';
import { t } from '../../i18n/he';
import { Avatar, type AvatarPerson } from '../primitives/Avatar';
import { BAND_DENSITY, PhotoBand, type PhotoBandShot } from './PhotoBand';
import './day-head.css';
import './memory-cover.css';

export interface MemoryCoverProps {
  shot?: PhotoBandShot;
  name: string;
  /** Dates, length and destination, composed and isolated by the screen. */
  when: string;
  people: readonly (AvatarPerson & { id: string })[];
  /** Cities in the order the trip reached them. Absent on a one-city trip. */
  route?: readonly string[];
  /** Rows nobody marked, and what they were called. Absent when there are none. */
  stragglers?: { count: number; titles: readonly string[] };
}

export function MemoryCover({ shot, name, when, people, route, stragglers }: MemoryCoverProps) {
  return (
    <section className="wp-dayhead is-card mem-cover">
      {shot && <PhotoBand shot={{ ...shot, eager: true }} density={BAND_DENSITY.COVER} />}
      <div className="mem-head">
        <h2>{autoIsolate(name)}</h2>
        <span className="mem-when">{when}</span>
        {route && route.length > 1 && (
          <div className="mem-route" aria-label={route.join(', ')}>
            {route.map((city, i) => (
              <Fragment key={`${i}-${city}`}>
                {i > 0 && (
                  <span className="mem-route-arrow" aria-hidden="true">
                    {ROUTE_ARROW}
                  </span>
                )}
                <span>{autoIsolate(city)}</span>
              </Fragment>
            ))}
          </div>
        )}
        {people.length > 0 && (
          <div className="mem-faces">
            <span className="mem-faces-row">
              {people.map((person) => (
                <Avatar key={person.id} person={person} size="inherit" />
              ))}
            </span>
            <span className="mem-faces-names">
              {people.map((person) => autoIsolate(person.displayName)).join(` ${DOT_SEPARATOR} `)}
            </span>
          </div>
        )}
      </div>
      {stragglers && stragglers.count > 0 && (
        <div className="wp-dayhead-foot">
          <div className="wp-dayhead-facts">
            <span className="mem-stragglers">
              <b className="mem-open" aria-hidden="true">
                ○
              </b>
              {t.planHome.past.unresolved(stragglers.count)}
              {stragglers.titles.length > 0 &&
                ` ${DOT_SEPARATOR} ${stragglers.titles.map(autoIsolate).join(', ')}`}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
