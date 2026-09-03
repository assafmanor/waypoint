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
//    destination, and the attribution link below it stays reachable rather than being nested
//    inside a button, which would be invalid markup.
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
import { ltrIsolate } from '../../lib/bidi';
import { forecastCondition } from '@waypoint/shared';
import { t } from '../../i18n/he';
import type { WeatherTile, WeatherView } from '../../lib/weather-view';
import './weather-card.css';

export interface WeatherCardProps {
  view: WeatherView | null;
  /** Each tile's day label, formatted by the host — it owns the day's zone (ADR-0107) and the
   *  app's date grammar, and this component owns no clock. The same contract `RateCard`'s
   *  `asOf` and `SunWidget`'s `times` state. */
  dayLabels: Record<string, string>;
}

/** `⁦29°⁩` — isolated, because a numeric run inside an RTL line comes apart without it
 *  (ADR-0118). `dir="auto"` on the element and the isolate on the value, which is the pairing
 *  every other numeric run in this app uses. */
const degrees = (value: number): string => ltrIsolate(`${Math.round(value)}°`);

export function WeatherCard({ view, dayLabels }: WeatherCardProps) {
  if (!view) return null;
  const { head, days } = view;
  const condition = t.weather.condition[forecastCondition(head.symbolCode)];

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
        <span className="wx-cond">
          {head.precipMm > 0
            ? t.weather.condPrecip(condition, ltrIsolate(String(head.precipMm)))
            : condition}
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
