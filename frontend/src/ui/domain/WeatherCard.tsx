// **The forecast, on the Home, as `מבט מהיר`'s first tenant** (ADR-0218 §1, brief §3.2a's
// most-volatile-first order: forecast · daylight · rate).
//
// Four shape decisions this component is not free to re-open:
//
//  - **It is not a `<button>`.** The mockup drew one, and the mockup was drawing `RateCard`'s
//    silhouette — that card is a button because it OPENS the converter. v1 has nothing to open
//    (§9 refuses the hourly strip, the dense row and the alert), and this repo's own rule is
//    that a control which reliably does nothing is worse than no control: `ErrorState`'s retry
//    renders only when the caller can recover, `SyncBadge` is silent when synced, ADR-0180 §4
//    refuses a standing refresh button. So the card is a plain region until it has a
//    destination — which is also what lets its source line live INSIDE it (amendment §A).
//  - **The mark is an emoji, looked up from `symbol_code`** (§7). The app does not compute a
//    condition — MET Norway does, and the app holds it — so it is a fact received and belongs
//    with the per-entity badges rather than with the marks the app draws. `SunGlyph` next door
//    is drawn because each of its tiles is literally a slice of the gradient above it; this card
//    has no illustration to draw from. **The tripwire**: if it ever grows a sky, the mark joins
//    that illustration and becomes chrome.
//  - **Absence is keyed on AGE, which inverts `RateCard`** (§4). A cached rate of any age gets a
//    card; a forecast has a shelf life, and past it the widget goes rather than lies. The host
//    hands over a null view for that, and there is **no error state on this surface**.
//  - **Precipitation is an amount, never a chance.** MET publishes no probability, so the copy
//    may not imply one.
//  - **The head names the place it speaks for, and the strip starts at TOMORROW** (amendment
//    §B/§C). The head follows `liveAnchorCoord` — where the plan says you are now, or where you
//    are heading — so on a travel day it is a different place from where the day began; without
//    the name, that reads as a contradiction against the strip. And a `היום` tile would repeat
//    the head's own number ⁦60px⁩ away, which is the duplication ADR-0214 and ADR-0215 each
//    measured and removed.
import { ltrIsolate } from '../../lib/bidi';
import { forecastCondition } from '@waypoint/shared';
import { t } from '../../i18n/he';
import type { WeatherTile, WeatherView } from '../../lib/weather-view';
import { CardSource } from './CardSource';
import './weather-card.css';

export interface WeatherCardProps {
  view: WeatherView | null;
  /** The credit the provider's terms require, carried on the data rather than hardcoded here
   *  (ADR-0180 §7's call, unchanged) — a second provider needs no change to this component. */
  source: { label: string; href: string } | null;
  /** Each tile's day label, formatted by the host — it owns the day's zone (ADR-0107) and the
   *  app's date grammar, and this component owns no clock. The same contract `RateCard`'s
   *  `asOf` and `SunWidget`'s `times` state. */
  dayLabels: Record<string, string>;
}

/** `⁦29°⁩` — isolated, because a numeric run inside an RTL line comes apart without it
 *  (ADR-0118). `dir="auto"` on the element and the isolate on the value, which is the pairing
 *  every other numeric run in this app uses. */
const degrees = (value: number): string => ltrIsolate(`${Math.round(value)}°`);

export function WeatherCard({ view, source, dayLabels }: WeatherCardProps) {
  if (!view) return null;
  const { head, days } = view;
  const condition = t.weather.condition[forecastCondition(head.symbolCode)];
  // `place · condition`, and the amount only when there is one — three runs in an ellipsising
  // slot at 360px is one too many, and the amount is the fact that changes a plan (W4).
  const detail =
    head.precipMm > 0
      ? t.weather.condPrecip(condition, ltrIsolate(String(head.precipMm)))
      : condition;

  return (
    <section className="wx-widget" aria-label={condition}>
      <div className="wx-head">
        {/* The emoji is the condition, and the condition is also written beside it — so the mark
            is decorative to a screen reader rather than a second reading of the same fact. */}
        <span className="wx-glyph" aria-hidden="true">
          {head.glyph}
        </span>
        <span className="wx-temp" dir="auto">
          {degrees(head.tempMax)}
        </span>
        {/* **The PLACE is the run that shrinks, not the weather.** Measured at 360px, a long
            name plus an amount overflowed 149px into 127px, and with one ellipsising run the
            thing cut was the amount — the last in the string and the most actionable fact on
            the card (W4). Three flex items instead, and only the place may give ground. */}
        <span className="wx-cond">
          {head.place && (
            <>
              <span className="wx-where">{head.place}</span>
              <span className="wx-sep" aria-hidden="true">
                ·
              </span>
            </>
          )}
          <span className="wx-detail">{detail}</span>
        </span>
        <span className="wx-low" dir="auto">
          {t.weather.low(degrees(head.tempMin))}
        </span>
      </div>
      <div className="wx-days">
        {days.map((day) => (
          <DayTile key={day.date} tile={day} label={dayLabels[day.date] ?? ''} />
        ))}
      </div>
      {source && <CardSource label={source.label} href={source.href} />}
    </section>
  );
}

function DayTile({ tile, label }: { tile: WeatherTile; label: string }) {
  if (tile.beyond) {
    // The label is on the TILE rather than on a span inside it: a `title` would be hover-only
    // on a phone-primary app (ADR-0017), and an `aria-label` on a bare span is not reliably
    // announced.
    return (
      <div className="wx-day beyond" role="group" aria-label={`${label} · ${t.weather.beyond}`}>
        <span className="wd-d">{label}</span>
        <span className="wd-p">{tile.place}</span>
        <span className="wd-g" aria-hidden="true">
          ·
        </span>
        {/* A regular dash, never an em dash, and never a zero: the day has no forecast, which is
            not the same as a forecast of nothing (root `CLAUDE.md`'s copy rule). */}
        <span className="wd-t" aria-hidden="true">
          -
        </span>
      </div>
    );
  }
  return (
    <div className="wx-day">
      <span className="wd-d">{label}</span>
      <span className="wd-p">{tile.place}</span>
      <span className="wd-g" aria-hidden="true">
        {tile.glyph}
      </span>
      <span className="wd-t" dir="auto">
        {degrees(tile.tempMax)}
      </span>
    </div>
  );
}
