// GlanceCard (design-language: GlanceCard) — the derived day-at-a-glance card on the Trip-mode
// Home (ADR-0045, reworked by ADR-0215).
//
// **What this card is for, after the board grew.** ADR-0214 gave the board what is now, what is
// next, how long until it, where we are, and the shape of tomorrow — so the only work left here is
// the one thing no other surface can do: **the whole day at once, and what is left of it.** Every
// run it prints is measured against that, which is why the anchor pills, the count chips, the
// window's own ends, `פנוי עד` and the hard-anchor readout are all gone (ADR-0215 §3/§4): each was
// either chrome describing the drawing or a fact the board carries within an inch of it.
//
// **The rail is the shared track** (`styles/day-track.css` + `lib/day-track.ts`, ADR-0214 §5) at
// this host's own height and inks, so the floor, the ⁦1px⁩ ground hairline between adjacent blocks,
// the zero-length tick, the midnight fade and the mark row all arrive by using it — including the
// two shipped defects that adoption fixes (a busy day drew back-to-back events as one bar; a
// zero-length event drew nothing at all). The view model is `lib/glance-track.ts`.
//
// Presentational and prop-fed, like everything in `ui/domain/`: `DayGlance` and its track are
// computed by the pure lib and passed in; the card only renders them.
import { type CSSProperties } from 'react';
import { type DayGlance } from '../../lib/glance';
import { trackBlockClass, trackBlockStyle } from '../../lib/day-track';
import { type GlanceTrack } from '../../lib/glance-track';
import { hasTravelTotal, type DayTravelTotal as DayTravelTotalValue } from '../../lib/day-joins';
import { t } from '../../i18n/he';
import './glance-card.css';
import '../../styles/day-track.css';
import { DayTravelTotal } from './DayTravelTotal';
import { Icon } from '../Icon';

export interface GlanceCardProps {
  glance: DayGlance;
  /** The day's blocks + marks (`glanceTrack`) — derived at the screen, which is the only layer
   *  that holds the events an icon and a commitment come from. */
  track: GlanceTrack;
  /** End-of-day time (pre-formatted). */
  dayEnd?: string | null;
  /** **How far the day goes**, when the app can say so for free (ADR-0215 §6) — `DayTravelTotal`
   *  renders it, so the words and the order are decided once, on the surface that had it first.
   *  Absent is the ordinary answer and costs no line. */
  travel?: DayTravelTotalValue | null;
  /** Empty-state CTA — jump to the day builder. */
  onAdd?: () => void;
}

export function GlanceCard({ glance, track, dayEnd, travel, onAdd }: GlanceCardProps) {
  // `DayTravelTotal` renders nothing when it has neither half, so the separator has to ask the
  // same question it does — through the one predicate rather than a second copy of the condition
  // (root rule 8; the shape `hasTravelTotal` exists for).
  const showTravel = hasTravelTotal(travel);

  if (glance.empty) {
    return (
      <div className="glance-day empty">
        <div className="ei" aria-hidden="true">
          <Icon name="calendar" />
        </div>
        <div className="et">{t.glance.emptyTitle}</div>
        <div className="es">{t.glance.emptySub}</div>
        <button type="button" className="ea" onClick={onAdd}>
          <span className="plus">
            <Icon name="plus" />
          </span>{' '}
          {t.glance.emptyAdd}
        </button>
      </div>
    );
  }

  return (
    <div className="glance-day">
      {/* `.wp-track` is the geometry and `.glance-track` is everything this host supplies: the
          height, the inks, and the ground — where "free time is the empty track" (ADR-0045) is
          the glance's own statement and not the shared sheet's. */}
      <div className="wp-track glance-track">
        {track.marks.length > 0 && (
          <div className="wp-track-marks" aria-hidden="true">
            {track.marks.map((mark) => (
              <span
                key={mark.key}
                className="wp-track-mark"
                style={{ '--s': `${mark.frac * 100}%` } as CSSProperties}
              >
                {mark.icon}
              </span>
            ))}
          </div>
        )}
        <div className="track" aria-hidden="true">
          {track.blocks.map((block) => (
            <div
              key={block.key}
              className={trackBlockClass(block)}
              style={trackBlockStyle(block) as CSSProperties}
            />
          ))}
          {/* The clock, kept from the old rail unchanged — a vertical amber line where every
              block is horizontal, which is how two legitimately amber things stay apart. */}
          {glance.nowFrac !== null && (
            <div className="nowmark" style={{ insetInlineStart: `${glance.nowFrac * 100}%` }} />
          )}
        </div>
      </div>
      {/* **A sentence, not a numeral** (ADR-0215 §4). `0 · נותרו היום` in ⁦32px⁩ mono was the
          common reading all evening, and a huge number saying nothing is the opposite of
          inviting; at zero this line goes quiet instead and leaves the moment to the night
          board, which now speaks for it. */}
      <div className={glance.remaining === 0 ? 'glance-lead done' : 'glance-lead'}>
        {t.glance.leftToday(glance.remaining)}
      </div>
      {(dayEnd || showTravel) && (
        <div className="glance-foot">
          {dayEnd && (
            <span>
              {t.glance.dayEnds}{' '}
              <span className="mono" dir="auto">
                ~{dayEnd}
              </span>
            </span>
          )}
          {dayEnd && showTravel && (
            <span className="dot" aria-hidden="true">
              ·
            </span>
          )}
          {showTravel && <DayTravelTotal total={travel!} />}
        </div>
      )}
    </div>
  );
}
