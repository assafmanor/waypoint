import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PlacePrediction } from '@waypoint/shared';
import { GOOGLE_MAPS_SERVER_KEY, requireEnv } from '../common/env';

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACE_DETAILS_BASE = 'https://places.googleapis.com/v1/places';

/** Cap on the upstream error body we log — enough to carry Google's `error.status`
 *  + message (the diagnostic bit), bounded so a stray large body can't flood logs. */
const MAX_ERROR_BODY_LOG = 500;

/**
 * The Place Details field mask — the single lever that sets the SKU tier we're
 * billed at (ADR-0108 §3). Confirmed against Google's live field→tier list
 * (2026-07-23, ADR-0111): `id` is Essentials, `formattedAddress`/`location` are
 * Essentials, `displayName` is Pro — so this mask bills at the **Pro** tier
 * (~$17/1k, 5,000/mo free), the cheapest tier that still returns a human-readable
 * name. `rating`/`userRatingCount` are **Enterprise**-tier and deliberately left
 * out (ADR-0111): they'd bump every pick to Enterprise (~$20/1k, 1,000/mo free)
 * for a star we don't render until a later phase. Adding them later is a one-line
 * change here — the `Place.rating`/`userRatingsTotal` columns already exist.
 */
const PLACE_DETAILS_FIELD_MASK = ['id', 'displayName', 'formattedAddress', 'location'].join(',');

/** Geocode field mask for the destination resolve (ADR-0113): swaps
 *  `formattedAddress` for `addressComponents` (both Essentials tier, so this stays
 *  Pro alongside `displayName`) to read the ISO country code off the country
 *  component. */
const GEOCODE_FIELD_MASK = ['id', 'displayName', 'location', 'addressComponents'].join(',');

/** Destination autocomplete is restricted to geo place types (ADR-0113 §1) so a
 *  city, region, or whole country resolves — never a business/POI. Kept ≤5 per the
 *  Places API (New) cap on `includedPrimaryTypes`. */
export const DESTINATION_PRIMARY_TYPES = [
  'locality',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'country',
];

/** The subset of the Place Details (New) response we cache on the row. */
export interface PlaceDetails {
  googlePlaceId: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
}

/** A geocoded destination (ADR-0113): the picked place's point + ISO country. */
export interface GeocodedPlace {
  googlePlaceId: string;
  name: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
}

// Shapes of the Google responses we read — only the fields the mask requests.
interface AutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }[];
}
interface PlaceDetailsResponse {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: { shortText?: string; longText?: string; types?: string[] }[];
}

/**
 * The thin outbound HTTP wrapper for Places API (New) — the only place the server
 * key is held (ADR-0108 §1). All Autocomplete/Place Details spend goes through here
 * behind the trip-scoped, membership-guarded, rate-limited proxy routes. Dedup and
 * persistence live in `PlacesService`; this client just talks to Google.
 */
@Injectable()
export class GooglePlacesClient {
  private readonly logger = new Logger(GooglePlacesClient.name);

  private key(): string {
    return requireEnv(GOOGLE_MAPS_SERVER_KEY);
  }

  /** Autocomplete relay. The `sessionToken` groups these keystrokes with the
   *  terminating Place Details pick so Google bills them at $0 (ADR-0108 §1).
   *  `includedPrimaryTypes` restricts results to those place types (ADR-0113 §1
   *  passes the geo-type set for destination search); omitted = unrestricted. */
  async autocomplete(
    input: string,
    sessionToken: string,
    includedPrimaryTypes?: string[],
  ): Promise<PlacePrediction[]> {
    const body = await this.post<AutocompleteResponse>(AUTOCOMPLETE_URL, {
      headers: { 'X-Goog-Api-Key': this.key(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input,
        sessionToken,
        ...(includedPrimaryTypes && { includedPrimaryTypes }),
      }),
    });
    return (body.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .map((p) => ({
        googlePlaceId: p.placeId as string,
        primaryText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondaryText: p.structuredFormat?.secondaryText?.text,
      }));
  }

  /** Terminating Place Details call (spends one Pro-tier SKU, ADR-0108 §3). The
   *  same `sessionToken` as the searches closes the session so those bill at $0. */
  async placeDetails(googlePlaceId: string, sessionToken?: string): Promise<PlaceDetails> {
    const url = new URL(`${PLACE_DETAILS_BASE}/${encodeURIComponent(googlePlaceId)}`);
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
    const body = await this.get<PlaceDetailsResponse>(url.toString(), {
      headers: {
        'X-Goog-Api-Key': this.key(),
        'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
      },
    });
    return {
      googlePlaceId: body.id ?? googlePlaceId,
      name: body.displayName?.text ?? '',
      address: body.formattedAddress,
      lat: body.location?.latitude,
      lng: body.location?.longitude,
    };
  }

  /** Geocode a picked destination (ADR-0113): its point + ISO country code, read
   *  off the `country` address component. Same Pro-tier billing as `placeDetails`
   *  (swaps `formattedAddress` for `addressComponents`, both Essentials). */
  async geocode(googlePlaceId: string, sessionToken?: string): Promise<GeocodedPlace> {
    const url = new URL(`${PLACE_DETAILS_BASE}/${encodeURIComponent(googlePlaceId)}`);
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
    const body = await this.get<PlaceDetailsResponse>(url.toString(), {
      headers: { 'X-Goog-Api-Key': this.key(), 'X-Goog-FieldMask': GEOCODE_FIELD_MASK },
    });
    const country = (body.addressComponents ?? []).find((c) => c.types?.includes('country'));
    return {
      googlePlaceId: body.id ?? googlePlaceId,
      name: body.displayName?.text ?? '',
      countryCode: country?.shortText,
      lat: body.location?.latitude,
      lng: body.location?.longitude,
    };
  }

  private get<T>(url: string, init: RequestInit): Promise<T> {
    return this.fetchJson<T>(url, { ...init, method: 'GET' });
  }

  private post<T>(url: string, init: RequestInit): Promise<T> {
    return this.fetchJson<T>(url, { ...init, method: 'POST' });
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // A network/DNS fault reaching Google is a transient upstream outage, not a
      // client error — 503 so the client can degrade softly (ADR-0108 §5 / ADR-0070).
      this.logger.error(`Places API request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Places service unavailable');
    }
    if (!res.ok) {
      // Log Google's error body **server-side only** (never returned to the client):
      // it carries the actionable reason — PERMISSION_DENIED, "Places API (New) has
      // not been used…", a referrer/IP-restriction message, quota state — and NOT the
      // API key, so it's safe to log and is the fastest way to diagnose a 403/misconfig.
      const detail = (await res.text().catch(() => '')).slice(0, MAX_ERROR_BODY_LOG);
      this.logger.error(
        `Places API responded ${res.status} for ${new URL(url).pathname}` +
          (detail ? `: ${detail}` : ''),
      );
      // A 400/404 means the caller sent a bad input/googlePlaceId — a permanent client
      // error, so surface a 400 (retrying can't help). Everything else (a bad/over-quota
      // key = 401/403/429, or a 5xx) is an upstream fault the client should treat as
      // transient — 503, degrade softly (ADR-0108 §5).
      if (res.status === 400 || res.status === 404) {
        throw new BadRequestException('Invalid place request');
      }
      throw new ServiceUnavailableException('Places service unavailable');
    }
    return (await res.json()) as T;
  }
}
