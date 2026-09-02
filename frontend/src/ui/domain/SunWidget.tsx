// **The daylight widget** — `מבט מהיר`'s tenant, drawn in
// `mockups/daylight-on-the-day-v1.html` and built at its recommended defaults.
//
// The design took three corrections to land, and two of them are constraints
// this component is not free to re-open:
//
//  - **It is small.** A ⁦244.8px⁩ card was drawn and rejected ("too big! this
//    should be a fun little widget"), so the sky is ⁦64px⁩ and every fact shares
//    one foot line. What was NOT sacrificed to that is the arc — the shrink cost
//    the second times row, not the picture.
//  - **It is the only surface this feature touches.** An earlier pass put a
//    pressable mark on the glance card's foot and a row in the day view's
//    `.day-ambient` strip; both were removed, because once the widget sits on
//    the same screen the mark printed the same fact one scroll away — the
//    duplication ADR-0214 and ADR-0215 each measured and deleted. Nothing here
//    should grow a second host without re-reading that.
//
// **The arc is the sun's real altitude**, sampled by `lib/daylight-view.ts`, and
// that is what makes the polar states pictures rather than apologies: a curve
// that never meets the horizon line says "the sun does not set today" without
// the sentence. The sentence is still there, as a caption under the picture.
//
// Presentational and prop-fed, like everything in `ui/domain/`: the model comes
// from the pure lib and the times arrive **already formatted**, because the host
// owns the day's zone (ADR-0107) and this component owns no clock — the same
// contract `RateCard` states for its `asOf`.
import { type CSSProperties } from 'react';
import { type DayLight } from '@waypoint/shared';
import { type SunArc, type SkyStops } from '../../lib/daylight-view';
import { SUN_ARC } from '../../constants';
import { ltrIsolate } from '../../lib/bidi';
import { t } from '../../i18n/he';
import './sun-widget.css';

/** The day's times, formatted by the host in the day's own zone. `null` is a
 *  state to render, never a dash to print. */
export interface SunWidgetTimes {
  sunrise: string | null;
  sunset: string | null;
  goldenStart: string | null;
  goldenEnd: string | null;
}

export interface SunWidgetProps {
  light: DayLight;
  arc: SunArc;
  sky: SkyStops;
  times: SunWidgetTimes;
}

/** The viewBox width. Arbitrary and unitless — the SVG stretches to the card. */
const VIEW_W = 360;
const VIEW_H = 100;

/** Altitude (degrees) to a y in the viewBox. Fixed ⁦±90°⁩ scale, so two days are
 *  comparable and a polar curve is not stretched into looking ordinary. */
const yOf = (altitude: number) =>
  VIEW_H * SUN_ARC.HORIZON_FRAC - (altitude / 90) * (VIEW_H * SUN_ARC.HORIZON_FRAC * SUN_ARC.SCALE);

/** **RTL: the day runs right to left**, the same direction the glance rail runs
 *  (`.wp-track-blk` anchors on `inset-inline-start`), so the two surfaces agree
 *  about which end of a day is which. */
const xOf = (frac: number) => VIEW_W * (1 - frac);

export function SunWidget({ light, arc, sky, times }: SunWidgetProps) {
  const horizonY = yOf(0);
  const path = arc.points
    .map((p, i) => `${i ? 'L' : 'M'}${xOf(p.frac).toFixed(1)},${yOf(p.altitude).toFixed(1)}`)
    .join('');

  // One custom property per stop, in the order the gradient consumes them.
  const style = Object.fromEntries(
    Object.entries(sky).map(([key, frac]) => [
      `--sky-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`,
      `${(frac * 100).toFixed(2)}%`,
    ]),
  ) as CSSProperties;

  return (
    <div className="sun-widget" style={style}>
      <div className="sun-sky">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
          {/* The lit run is the whole path clipped to above the horizon, so the
              crossing needs no path surgery and cannot disagree with the curve. */}
          <defs>
            <clipPath id="sun-lit">
              <rect x="0" y="0" width={VIEW_W} height={Math.max(horizonY, 0)} />
            </clipPath>
          </defs>
          {arc.bands.map((b) => (
            <rect
              key={b.from}
              className="sun-gold-band"
              x={xOf(b.to)}
              y={0}
              width={Math.abs(xOf(b.from) - xOf(b.to))}
              height={VIEW_H}
            />
          ))}
          <line className="sun-horizon" x1="0" y1={horizonY} x2={VIEW_W} y2={horizonY} />
          <path className="sun-arc" d={path} />
          <path className="sun-arc-lit" d={path} clipPath="url(#sun-lit)" />
          {arc.now && (
            <>
              <circle
                className="sun-disc-ring"
                cx={xOf(arc.now.frac)}
                cy={yOf(arc.now.altitude)}
                r={6}
              />
              <circle
                className="sun-disc"
                cx={xOf(arc.now.frac)}
                cy={yOf(arc.now.altitude)}
                r={4}
              />
            </>
          )}
        </svg>
      </div>
      <div className="sun-foot">
        {light.polar ? (
          <span className="sf-polar">
            {light.polar === 'day' ? t.sun.polarDay : t.sun.polarNight}
          </span>
        ) : (
          <>
            <span className="sf-t">
              <span className="sf-ic" aria-hidden="true">
                {t.sun.sunriseGlyph}
              </span>
              <span dir="auto">{ltrIsolate(times.sunrise ?? '')}</span>
            </span>
            <GoldenChip start={times.goldenStart} end={times.goldenEnd} />
            <span className="sf-t">
              <span className="sf-ic" aria-hidden="true">
                {t.sun.sunsetGlyph}
              </span>
              <span dir="auto">{ltrIsolate(times.sunset ?? '')}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Golden hour, as the foot's middle fact.
 *
 * **A half-open interval reads as open, not as a dash.** Above the polar circles
 * the sun can enter gold and never leave it, so `end` is legitimately absent
 * while `start` is real — and `A–undefined` is what a naive range prints. Absent
 * on both ends the chip is not drawn at all, which is the app's ordinary grammar
 * for a fact it does not have (ADR-0045).
 */
function GoldenChip({ start, end }: { start: string | null; end: string | null }) {
  if (!start) return null;
  return (
    <span className="sf-gold">
      <span aria-hidden="true">{t.sun.goldenGlyph}</span>{' '}
      {end ? (
        <>
          {t.sun.golden}{' '}
          <span className="mono" dir="auto">
            {ltrIsolate(`${start}–${end}`)}
          </span>
        </>
      ) : (
        <>
          {t.sun.goldenFrom}{' '}
          <span className="mono" dir="auto">
            {ltrIsolate(start)}
          </span>
        </>
      )}
    </span>
  );
}
