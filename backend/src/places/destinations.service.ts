import { Injectable } from '@nestjs/common';
import { find as findTimezone } from 'geo-tz';
import {
  MULTI_ZONE_COUNTRIES,
  type DestinationResult,
  type PlacePrediction,
  type ResolveDestinationInput,
  type SearchPlacesInput,
} from '@waypoint/shared';
import { DESTINATION_PRIMARY_TYPES, GooglePlacesClient } from './google-places.client';

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
