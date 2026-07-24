// GlanceCard (design-language: GlanceCard) — the derived day-at-a-glance rail
// on the Trip-mode Home (extracted from screens/Home.tsx, U-03). A proportional
// time rail (block width = duration, gaps = free time), an amber now-marker, the
// unified amber time-anchor grammar above the bar (spans/points, ADR-0077), a
// lead "נותרו" count, the next hard anchor, and a free-until / end-of-day foot.
// A crowded day collapses the anchor band to a flow legs line (ADR-0077 §D).
// Empty day = a calm teach state (never a hidden card or a 0/0 rail).
//
// The rail model (`DayGlance`) is computed by the pure lib/glance and passed in;
// the card only renders it. Domain UI may use the shared copy/label helpers (not
// state) — it does, for the transition labels + time formatting.
import { type CSSProperties } from 'react';
import { type DayGlance, type GlanceAnchor } from '../../lib/glance';
import { formatTime } from '../../lib/time';
import { transitionLabel } from '../../lib/transitions';
import { NavArrow } from '../NavArrow';
import { ZoneShiftPill } from '../ZoneShiftPill';
import { ICONS } from '../../constants';
import { t } from '../../i18n/he';
import './glance-card.css';

/** An anchor pill within this fraction of a rail edge anchors inward (to the
 *  edge) instead of centering on its point, so it can't clip off the rail
 *  (faithful to Home's MARKER_EDGE_FRAC, ADR-0077). */
const MARKER_EDGE_FRAC = 0.12;
const markerAnchor = (frac: number): string =>
  frac <= MARKER_EDGE_FRAC ? 'at-start' : frac >= 1 - MARKER_EDGE_FRAC ? 'at-end' : '';

/** The inside of an anchor pill — shared by the positioned band and the collapsed
 *  legs line so the two renderings of the same anchor can never diverge. Each end
 *  reads in its **own** display zone when the anchor carries one (ADR-0107), with
 *  the shift as the amber pill; without zones everything reads in `tz`, as before. */
function AnchorPill({ anchor: a, tz }: { anchor: GlanceAnchor; tz: string }) {
  if (a.kind === 'span') {
    return (
      <span className="achip amber">
        <span className="mi">{a.icon}</span>{' '}
        <span className="mono" dir="ltr">
          {formatTime(new Date(a.startMs), a.zones?.startZone ?? tz)}
        </span>
        <NavArrow variant="forward" className="arr" />
        <span className="mono" dir="ltr">
          {formatTime(new Date(a.endMs), a.zones?.endZone ?? tz)}
        </span>
        {a.nextDay && (
          <span className="plus1" dir="ltr">
            {t.glance.nextDay}
          </span>
        )}
        {a.zones?.deltaMinutes != null && (
          <ZoneShiftPill minutes={a.zones.deltaMinutes} className="gl-tzdelta" />
        )}
      </span>
    );
  }
  return (
    <span className="achip amber">
      <span className="mi">{a.icon}</span> {transitionLabel(a.labelKey)}{' '}
      <span className="mono" dir="ltr">
        {formatTime(new Date(a.timeMs), a.zone ?? tz)}
      </span>
      {a.deltaMinutes != null && <ZoneShiftPill minutes={a.deltaMinutes} className="gl-tzdelta" />}
    </span>
  );
}

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
      <div className="glance-day empty">
        <div className="ei" aria-hidden="true">
          🗓️
        </div>
        <div className="et">{t.glance.emptyTitle}</div>
        <div className="es">{t.glance.emptySub}</div>
        <button type="button" className="ea" onClick={onAdd}>
          <span className="plus">{ICONS.add}</span> {t.glance.emptyAdd}
        </button>
      </div>
    );
  }

  return (
    <div className="glance-day">
      {/* Amber time-anchors in a dedicated band above the block bar so segments
          can't swallow their labels (ADR-0077). A span (both edges today) is a
          bar + feet under one centered pill; a point (one edge today) is a stem +
          pill carrying the transition word. Anchors stack into lanes when they'd
          overlap and anchor inward near an edge; a crowded day collapses to the
          legs line below instead. */}
      {glance.anchors.length > 0 && !glance.anchorsCollapsed && (
        <div
          className="glance-marks"
          aria-hidden="true"
          style={{ '--lanes': glance.anchorLaneCount } as CSSProperties}
        >
          {glance.anchors.map((a) =>
            a.kind === 'span' ? (
              <div
                className={`span-anchor ${markerAnchor((a.startFrac + a.endFrac) / 2)}`}
                key={a.key}
                style={
                  {
                    insetInlineStart: `${a.startFrac * 100}%`,
                    width: `${Math.max(0, a.endFrac - a.startFrac) * 100}%`,
                    '--lane': a.lane,
                  } as CSSProperties
                }
              >
                <span className="cap">
                  <AnchorPill anchor={a} tz={tz} />
                </span>
                <span className="bar" />
              </div>
            ) : (
              <div
                className={`tmark ${markerAnchor(a.frac)}`}
                key={a.key}
                style={{ insetInlineStart: `${a.frac * 100}%`, '--lane': a.lane } as CSSProperties}
              >
                <AnchorPill anchor={a} tz={tz} />
                <span className="stem" />
              </div>
            ),
          )}
        </div>
      )}
      <div className="rail" aria-hidden="true">
        {glance.segs.map((s) => (
          <div
            key={s.key}
            className={`seg ${s.phase}${s.composite ? ' multi' : ''}${s.point ? ' point' : ''}${s.spanned ? ' trans' : ''}`}
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
            {/* a spanned block's "+1" is carried by its span pill above, not here */}
            {s.nextDay && !s.spanned && (
              <span className="plus1" dir="ltr">
                {t.glance.nextDay}
              </span>
            )}
          </div>
        ))}
        {glance.nowFrac !== null && (
          <div className="nowmark" style={{ insetInlineStart: `${glance.nowFrac * 100}%` }} />
        )}
      </div>
      <div className="rail-ends">
        <span dir="ltr">{formatTime(new Date(glance.windowStartMs), tz)}</span>
        <span dir="ltr">{formatTime(new Date(glance.windowEndMs), tz)}</span>
      </div>
      {/* Crowded day (ADR-0077 §D): the anchors couldn't fit in the band, so they
          collapse here to a flow legs line — same amber pill, no overlap. */}
      {glance.anchorsCollapsed && (
        <div className="glance-legs">
          {glance.anchors.map((a) => (
            <AnchorPill anchor={a} tz={tz} key={a.key} />
          ))}
        </div>
      )}
      <div className="lead">
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
        <div className="glance-foot">
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
