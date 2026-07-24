import { Injectable } from '@nestjs/common';
import { find as findTimezone } from 'geo-tz';
import type {
  DestinationResult,
  PlacePrediction,
  ResolveDestinationInput,
  SearchPlacesInput,
} from '@waypoint/shared';
import { DESTINATION_PRIMARY_TYPES, GooglePlacesClient } from './google-places.client';

/**
 * Known multi-zone countries (ADR-0113 §2). `geo-tz` maps the picked point to one
 * concrete zone at every granularity (the derived default), but for these the
 * point is arbitrary within the country — so we surface `candidateZones` and the
 * creation UI shows a soft "spans several zones" note + pre-filters the picker.
 * A country NOT in this map trusts its single derived zone silently. A small
 * curated map, not a shipped dataset — extend as needed; a miss just omits the note.
 */
const MULTI_ZONE_COUNTRIES: Record<string, string[]> = {
  US: [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
  ],
  AU: [
    'Australia/Sydney',
    'Australia/Brisbane',
    'Australia/Adelaide',
    'Australia/Perth',
    'Australia/Darwin',
    'Australia/Hobart',
  ],
  RU: [
    'Europe/Kaliningrad',
    'Europe/Moscow',
    'Asia/Yekaterinburg',
    'Asia/Novosibirsk',
    'Asia/Krasnoyarsk',
    'Asia/Irkutsk',
    'Asia/Vladivostok',
    'Asia/Kamchatka',
  ],
  CA: [
    'America/St_Johns',
    'America/Halifax',
    'America/Toronto',
    'America/Winnipeg',
    'America/Edmonton',
    'America/Vancouver',
  ],
  BR: ['America/Noronha', 'America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco'],
  MX: ['America/Mexico_City', 'America/Cancun', 'America/Chihuahua', 'America/Tijuana'],
  ID: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'],
  KZ: ['Asia/Almaty', 'Asia/Aqtobe', 'Asia/Aqtau'],
  CL: ['America/Santiago', 'Pacific/Easter'],
  CD: ['Africa/Kinshasa', 'Africa/Lubumbashi'],
};

/**
 * Trip-agnostic destination resolution (ADR-0113): the creation-time counterpart
 * to the trip-scoped `PlacesService`. No trip exists yet, so there is nothing to
 * persist and no `(tripId, googlePlaceId)` dedup — it is a pure relay to Google +
 * a `geo-tz` zone derivation. Rate-limiting is per-user (the throttler guard keys
 * on the actor when there's no `tripId`).
 */
@Injectable()
export class DestinationsService {
  constructor(private readonly google: GooglePlacesClient) {}

  /** Geo-type-restricted autocomplete (cities / regions / countries, ADR-0113 §1). */
  search(input: SearchPlacesInput): Promise<PlacePrediction[]> {
    return this.google.autocomplete(input.input, input.sessionToken, DESTINATION_PRIMARY_TYPES);
  }

  /** Geocode the pick into its point + country + derived zone (ADR-0113 §2/§4). */
  async resolve(input: ResolveDestinationInput): Promise<DestinationResult> {
    const geo = await this.google.geocode(input.googlePlaceId, input.sessionToken);
    const timezone =
      geo.lat !== undefined && geo.lng !== undefined
        ? findTimezone(geo.lat, geo.lng)[0]
        : undefined;
    const candidateZones = geo.countryCode ? MULTI_ZONE_COUNTRIES[geo.countryCode] : undefined;
    return {
      googlePlaceId: geo.googlePlaceId,
      name: geo.name,
      countryCode: geo.countryCode,
      lat: geo.lat,
      lng: geo.lng,
      timezone,
      candidateZones,
    };
  }
}
