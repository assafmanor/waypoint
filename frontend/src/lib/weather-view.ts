// The forecast card's view model (ADR-0218, mockup `weather-as-a-glance-card-v1.html`).
//
// Pure and injected, the same shape as `lib/daylight-view.ts` beside it: evidence and a clock
// in, tiles out. No formatting, no Hebrew, no `Date.now()` — the widget renders what this
// returns, which is what keeps `ui/domain` prop-fed (`frontend/CLAUDE.md`'s layering).
//
// **This is where ADR-0218 §4's shelf life is actually enforced, and it has to be here.** The
// snapshot is mirrored into Dexie and read offline, so a bound applied only on the server is a
// bound that stops applying at exactly the moment it matters — a plane, a tunnel, a foreign SIM.
// The rule inverts ADR-0180 §4 for the one case that ADR does not cover: a three-day-old
// published rate is still the rate, and a five-day-old forecast is misinformation on the surface
// a person checks instead of a window.
//
// **The strip's whole point is that each row names its own PLACE** (brief §3.2b). A weather app
// answers "what is the weather in Tokyo"; this app knows the group is in Tokyo tonight, Hakone
// tomorrow and Kyoto on Thursday, and says so. A tile with no place would be the weather app's
// answer wearing this app's chrome.
import {
  derivedPlaceLabel,
  forecastCell,
  forecastDayAt,
  forecastGlyph,
  isForecastFresh,
  shortPlaceLabel,
  type Forecast,
  type Place,
  type ZoneEvidence,
} from '@waypoint/shared';
import { dayAnchorCoord } from './places';

/** One day in the strip. `beyond` is BOTH "past the provider's horizon" and "we hold nothing
 *  yet", deliberately: §5 draws one dashed placeholder for both, because from the reader's side
 *  they are the same fact — nobody can tell you about that day yet. */
export type WeatherTile =
  | { date: string; place: string | null; beyond: true }
  | {
      date: string;
      place: string | null;
      beyond: false;
      glyph: string;
      symbolCode: string;
      tempMax: number;
      tempMin: number;
      precipMm: number;
    };

export interface WeatherView {
  /** The head — the active day, always present and always fresh, because a card whose head has
   *  expired is absent entirely rather than a strip with nothing to lead it. */
  head: Extract<WeatherTile, { beyond: false }>;
  /** The head's day and the days after it, in order. Includes the head. */
  days: WeatherTile[];
}

export interface WeatherViewInput {
  /** The days to draw, ascending, starting with the active one. */
  dates: readonly string[];
  evidence: ZoneEvidence;
  places: readonly Place[];
  /** ADR-0113's destination, the anchor for every day nothing else places. */
  destination?: { lat: number; lng: number };
  /** The trip's display destination, for a day the anchor resolves to no place of ours. */
  destinationName?: string;
  forecast: Forecast | null | undefined;
  nowMs: number;
  /** The live "today", in the zone the day is lived in — which is the caller's to resolve
   *  (ADR-0107), and which decides whether a day gets the ⁦6⁩-hour bound or the ⁦24⁩-hour one. */
  today: string;
}

/**
 * The card, or `null` when it should not exist.
 *
 * `null` for three reasons that are one reason: there is no anchor, we hold nothing for the head
 * day, or what we hold for it is past its shelf life. All three are absence, none is an error,
 * and there is **no error state anywhere on this surface** — the same call `RateCard` makes for
 * a pair it cannot price.
 */
export function weatherView(input: WeatherViewInput): WeatherView | null {
  if (input.dates.length === 0) return null;
  const days = input.dates.map((date) => tileFor(date, input));
  const head = days[0];
  // The head is the one tile whose absence removes the whole card rather than dimming a square:
  // a strip with nothing to lead it is not a designed state, and §4 says absent, never
  // approximate.
  if (head.beyond) return null;
  return { head, days };
}

function tileFor(date: string, input: WeatherViewInput): WeatherTile {
  const { evidence, places, destination, destinationName, forecast, nowMs, today } = input;
  const anchor = dayAnchorCoord(date, evidence, destination);
  const cell = anchor ? forecastCell(anchor.lat, anchor.lng) : undefined;
  // The place whose forecast this IS — found by the cell rather than by coordinate equality, so
  // a day anchored on one stop is named by whichever of the group's places sits in that same
  // ~11km square. Falling back to the trip's own destination name keeps the row from ever being
  // a nameless number.
  const place =
    (cell
      ? places.find((p) => p.lat != null && p.lng != null && forecastCell(p.lat, p.lng) === cell)
      : undefined) ?? undefined;
  const label = place
    ? (derivedPlaceLabel(place) ?? shortPlaceLabel(place.name))
    : (destinationName ?? null);

  const found = forecastDayAt(forecast, cell, date);
  if (!found || !isForecastFresh(found.cell.issuedAt, nowMs, date === today)) {
    return { date, place: label, beyond: true };
  }
  return {
    date,
    place: label,
    beyond: false,
    glyph: forecastGlyph(found.day.symbolCode),
    symbolCode: found.day.symbolCode,
    tempMax: found.day.tempMax,
    tempMin: found.day.tempMin,
    precipMm: found.day.precipMm,
  };
}
