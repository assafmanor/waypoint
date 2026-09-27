// **THE MEMORY HOME** — what the Home is once a trip has finished (ADR-0240 §4, epic Phase 4).
//
// It replaces `PlanHome`'s past branch, which was three counts and a button. Every number on it
// is `tripRecap`'s (ADR-0239 §9, through `useTripRecap`), so this page and every share print
// the same figure for the same trip. Built in the epic's order, one item per change: 4.1 is the
// frame — the cover and `במספרים`; the days as a contact sheet, firsts and bests, the stragglers
// sheet and next time follow inside it.
import { useState } from 'react';
import { t } from '../i18n/he';
import { DOT_SEPARATOR, type TabId } from '../constants';
import { autoIsolate } from '../lib/bidi';
import type { DayShot } from '../lib/day-photo';
import { dayPhrase } from '../lib/hebrew';
import { memoryFigures } from '../lib/memory-home';
import { formatTripDates, tripDayNumber } from '../lib/time';
import { useTripRecap } from '../lib/trip-recap';
import { useTrip } from '../state/trip-state';
import { MemoryCover } from '../ui/domain/MemoryCover';
import { StatTile } from '../ui/domain/StatTile';
import { MediaViewer } from '../ui/MediaViewer';
import './memory-home.css';

/** How many straggler titles the cover's footer names before the sheet (4.4) takes over. */
const STRAGGLER_TITLES = 2;

export function MemoryHome({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { trip, users, events } = useTrip();
  const recap = useTripRecap();
  const [fullShot, setFullShot] = useState<DayShot | null>(null);

  const when = [
    formatTripDates(trip.startDate, trip.endDate, { style: 'prose' }),
    dayPhrase(tripDayNumber(trip.endDate, trip.startDate)),
    autoIsolate(trip.destination),
  ].join(` ${DOT_SEPARATOR} `);

  const titleOf = new Map(events.map((event) => [event.id, event.title]));
  const figures = recap ? memoryFigures(recap) : [];
  const cover = recap?.cover;
  const route = recap?.figures.route.state === 'present' ? recap.figures.route.value : undefined;

  return (
    <>
      <MemoryCover
        shot={cover && { ...cover, onOpen: () => setFullShot(cover) }}
        name={trip.name}
        when={when}
        people={users}
        route={route}
        stragglers={
          recap && {
            count: recap.stragglers.length,
            titles: recap.stragglers
              .slice(0, STRAGGLER_TITLES)
              .map((id) => titleOf.get(id))
              .filter((title): title is string => Boolean(title)),
          }
        }
      />

      {figures.length > 0 && (
        <>
          <div className="sec-title">{t.planHome.past.figures}</div>
          <div className="mem-figs" data-n={figures.length}>
            {figures.map((figure) => (
              <StatTile
                key={figure.key}
                value={figure.value}
                label={
                  <>
                    {figure.label}
                    {!!figure.unresolved && (
                      <span className="mem-fig-open">
                        {t.planHome.past.unresolved(figure.unresolved)}
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </div>
        </>
      )}

      <button className="addbtn" onClick={() => onNavigate('days')}>
        {t.planHome.past.viewDays}
      </button>

      {fullShot && (
        <MediaViewer
          title={fullShot.of}
          mimeType={fullShot.image.mimeType}
          source={{ kind: 'url', url: fullShot.url }}
          caption={fullShot.credit}
          intrinsic={fullShot.image}
          onClose={() => setFullShot(null)}
        />
      )}
    </>
  );
}
