// GlanceCard (design-language: GlanceCard) — the derived day-at-a-glance rail
// on the Trip-mode Home (screens/Home.tsx ~505). Reproduced faithfully: a
// proportional time rail (block width = duration, gaps = free time), an amber
// now-marker at the true clock position, uncounted check-in/out transition
// markers in a dedicated upper lane (ADR-0054/0059), a lead "נותרו" count, the
// next hard anchor, and a free-until / end-of-day foot. Empty day = a calm
// teach state (never a hidden card or a 0/0 rail).
//
// The rail model (`DayGlance`) is computed by the pure lib/glance and passed in;
// the card only renders it. Domain UI may use the shared copy/label helpers (not
// state) — it does, for the transition labels + time formatting.
import { type CSSProperties } from 'react';
import { type DayGlance } from '../../lib/glance';
import { formatTime } from '../../lib/time';
import { transitionLabel } from '../../lib/transitions';
import { ICONS } from '../../constants';
import { t } from '../../i18n/he';
import './glance-card.css';

/** A marker chip within this fraction of a rail edge anchors inward so it can't
 *  clip off the rail (faithful to Home's MARKER_EDGE_FRAC). */
const MARKER_EDGE_FRAC = 0.12;
const markerAnchor = (frac: number): string =>
  frac <= MARKER_EDGE_FRAC ? 'at-start' : frac >= 1 - MARKER_EDGE_FRAC ? 'at-end' : '';

export interface GlanceCardProps {
  glance: DayGlance;
  tz: string;
  /** The next hard anchor's time (pre-formatted), if any — the amber anchor. */
  hardAnchorTime?: string;
  /** "free until" time (pre-formatted), shown only when nothing is on now. */
  freeUntil?: string | null;
  /** End-of-day time (pre-formatted). */
  dayEnd?: string | null;
  /** Empty-state CTA — jump to the day builder. */
  onAdd?: () => void;
}

export function GlanceCard({
  glance,
  tz,
  hardAnchorTime,
  freeUntil,
  dayEnd,
  onAdd,
}: GlanceCardProps) {
  if (glance.empty) {
    return (
      <div className="wp-glance empty">
        <div className="wp-glance-ei" aria-hidden="true">
          🗓️
        </div>
        <div className="wp-glance-et">{t.glance.emptyTitle}</div>
        <div className="wp-glance-es">{t.glance.emptySub}</div>
        <button type="button" className="wp-glance-ea" onClick={onAdd}>
          <span className="wp-glance-plus">{ICONS.add}</span> {t.glance.emptyAdd}
        </button>
      </div>
    );
  }

  return (
    <div className="wp-glance">
      {/* Amber transition markers in a dedicated lane above the block bar so
          segments can't swallow their labels (ADR-0054 amendment / ADR-0059). */}
      {glance.markers.length > 0 && (
        <div
          className="wp-glance-marks"
          aria-hidden="true"
          style={{ '--lanes': glance.markerLaneCount } as CSSProperties}
        >
          {glance.markers.map((m) => (
            <div
              className={`wp-glance-tmark ${markerAnchor(m.frac)}`}
              key={m.key}
              style={{ insetInlineStart: `${m.frac * 100}%`, '--lane': m.lane } as CSSProperties}
            >
              <span className="chip">
                <span className="mi">{m.icon}</span> {transitionLabel(m.labelKey)}{' '}
                <span className="mono" dir="ltr">
                  {formatTime(new Date(m.timeMs), tz)}
                </span>
              </span>
              <span className="stem" />
            </div>
          ))}
        </div>
      )}
      <div className="wp-glance-rail" aria-hidden="true">
        {glance.segs.map((s) => (
          <div
            key={s.key}
            className={`wp-glance-seg ${s.phase}${s.composite ? ' multi' : ''}${s.point ? ' point' : ''}`}
            style={{
              insetInlineStart: `${s.startFrac * 100}%`,
              ...(s.point ? {} : { width: `${Math.max(0, s.endFrac - s.startFrac) * 100}%` }),
            }}
          >
            {s.showCount && (
              <span className="n">
                {s.clusterLike ? t.glance.concurrent(s.count) : t.glance.contains(s.count)}
              </span>
            )}
            {s.nextDay && (
              <span className="plus1" dir="ltr">
                {t.glance.nextDay}
              </span>
            )}
          </div>
        ))}
        {glance.nowFrac !== null && (
          <div
            className="wp-glance-nowmark"
            style={{ insetInlineStart: `${glance.nowFrac * 100}%` }}
          />
        )}
      </div>
      <div className="wp-glance-rail-ends">
        <span dir="ltr">{formatTime(new Date(glance.windowStartMs), tz)}</span>
        <span dir="ltr">{formatTime(new Date(glance.windowEndMs), tz)}</span>
      </div>
      <div className="wp-glance-lead">
        <div className="big">
          <span className="v" dir="ltr">
            {glance.remaining}
          </span>
          <span className="k">{t.glance.remaining}</span>
        </div>
        {hardAnchorTime && (
          <div className="anchor">
            {ICONS.lock} {t.glance.hardAnchor}
            <br />
            <span className="tm" dir="ltr">
              {hardAnchorTime}
            </span>
          </div>
        )}
      </div>
      {(freeUntil || dayEnd) && (
        <div className="wp-glance-foot">
          {freeUntil && (
            <span>
              🕓 {t.glance.freeUntil}{' '}
              <span className="mono" dir="ltr">
                {freeUntil}
              </span>
            </span>
          )}
          {freeUntil && dayEnd && (
            <span className="dot" aria-hidden="true">
              ·
            </span>
          )}
          {dayEnd && (
            <span>
              {t.glance.dayEnds}{' '}
              <b className="mono" dir="ltr">
                ~{dayEnd}
              </b>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
