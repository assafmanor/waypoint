import { describe, expect, it, vi } from 'vitest';
import type { GeocodedPlace } from './google-places.client';
import { DESTINATION_PRIMARY_TYPES, GooglePlacesClient } from './google-places.client';
import { DestinationsService } from './destinations.service';

// Pure unit test (no DB): DestinationsService is a relay to Google + a geo-tz zone
// derivation, with no persistence (there's no trip yet at creation, ADR-0113).
function make(geo?: Partial<GeocodedPlace>) {
  const google = {
    autocomplete: vi.fn(async () => []),
    geocode: vi.fn(async (): Promise<GeocodedPlace> => ({
      googlePlaceId: 'g-x',
      name: 'X',
      ...geo,
    })),
  } as unknown as GooglePlacesClient;
  return { google, service: new DestinationsService(google) };
}

describe('DestinationsService', () => {
  it('search restricts autocomplete to the geo primary types (ADR-0113 §1)', async () => {
    const { google, service } = make();
    await service.search({ input: 'par', sessionToken: 'tok' });
    expect(google.autocomplete).toHaveBeenCalledWith('par', 'tok', DESTINATION_PRIMARY_TYPES);
  });

  it('resolves a city to its derived zone, no candidate zones (single-zone)', async () => {
    // Tokyo — a single-zone country (JP not in the multi-zone map).
    const { service } = make({ countryCode: 'JP', lat: 35.6812, lng: 139.7671, name: 'Tokyo' });
    const result = await service.resolve({ googlePlaceId: 'g-x' });
    expect(result.timezone).toBe('Asia/Tokyo');
    expect(result.candidateZones).toBeUndefined();
    expect(result.countryCode).toBe('JP');
  });

  it('resolves a multi-zone country: derived default + candidate zones (ADR-0113 §2)', async () => {
    // A US point (New York) — the derived default is one zone, but the country
    // spans several, so candidateZones is surfaced for the note + picker pre-filter.
    const { service } = make({
      countryCode: 'US',
      lat: 40.7128,
      lng: -74.006,
      name: 'United States',
    });
    const result = await service.resolve({ googlePlaceId: 'g-x' });
    expect(result.timezone).toBe('America/New_York');
    expect(result.candidateZones).toContain('America/Los_Angeles');
    expect(result.candidateZones!.length).toBeGreaterThan(1);
  });

  it('a place with no coordinates yields no derived zone', async () => {
    const { service } = make({ countryCode: undefined, lat: undefined, lng: undefined });
    const result = await service.resolve({ googlePlaceId: 'g-x' });
    expect(result.timezone).toBeUndefined();
    expect(result.candidateZones).toBeUndefined();
  });
});
