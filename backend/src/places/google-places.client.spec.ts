import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_MAPS_SERVER_KEY } from '../common/env';
import { GooglePlacesClient } from './google-places.client';

// Pure unit test: stub global fetch, assert what the client sends to Google.
const client = new GooglePlacesClient();

function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('GooglePlacesClient (ADR-0113: Hebrew-first place names)', () => {
  beforeEach(() => {
    process.env[GOOGLE_MAPS_SERVER_KEY] = 'test-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env[GOOGLE_MAPS_SERVER_KEY];
  });

  it('autocomplete requests Hebrew names + Israel region, and passes through primary types', async () => {
    const mock = stubFetch({ suggestions: [] });
    await client.autocomplete('par', 'tok', ['locality']);
    const body = JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.languageCode).toBe('he');
    expect(body.regionCode).toBe('IL');
    expect(body.includedPrimaryTypes).toEqual(['locality']);
    expect(body.sessionToken).toBe('tok');
  });

  // ── TEXT SEARCH (ADR-0132 §7) — the half whose results can be drawn ──────────
  it('textSearch asks for the four fields a result needs to be a row AND a ring', async () => {
    const mock = stubFetch({ places: [] });
    await client.textSearch('קפה');
    const init = mock.mock.calls[0][1] as RequestInit;
    const mask = (init.headers as Record<string, string>)['X-Goog-FieldMask'];
    // `places.`-prefixed, which is what this endpoint requires — and `location` is the
    // field that makes the whole SKU switch worth it.
    expect(mask).toBe('places.id,places.displayName,places.formattedAddress,places.location');
    const body = JSON.parse(init.body as string);
    expect(body.textQuery).toBe('קפה');
    expect(body.languageCode).toBe('he');
    expect(body.regionCode).toBe('IL');
    // NO session token: this SKU has none, which is the cost story (every call bills).
    expect(body.sessionToken).toBeUndefined();
  });

  it('textSearch biases to the caller viewport when given one, and omits it otherwise', async () => {
    const mock = stubFetch({ places: [] });
    await client.textSearch('קפה', { south: 1, west: 2, north: 3, east: 4 });
    expect(JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string).locationBias).toEqual({
      rectangle: { low: { latitude: 1, longitude: 2 }, high: { latitude: 3, longitude: 4 } },
    });
    const bare = stubFetch({ places: [] });
    await client.textSearch('קפה');
    expect(
      JSON.parse((bare.mock.calls[0][1] as RequestInit).body as string).locationBias,
    ).toBeUndefined();
  });

  it('textSearch flattens results with their coordinates and drops the id-less', async () => {
    stubFetch({
      places: [
        {
          id: 'g1',
          displayName: { text: 'קפה בלו בוטל' },
          formattedAddress: 'שינג׳וקו, טוקיו',
          location: { latitude: 35.69, longitude: 139.7 },
        },
        { displayName: { text: 'no id' } },
      ],
    });
    expect(await client.textSearch('קפה')).toEqual([
      {
        googlePlaceId: 'g1',
        primaryText: 'קפה בלו בוטל',
        secondaryText: 'שינג׳וקו, טוקיו',
        lat: 35.69,
        lng: 139.7,
      },
    ]);
  });

  it('placeDetails carries the languageCode + regionCode query params', async () => {
    const mock = stubFetch({ id: 'g', displayName: { text: 'טוקיו' }, location: {} });
    await client.placeDetails('g', 'tok');
    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain('languageCode=he');
    expect(url).toContain('regionCode=IL');
  });

  it('geocode carries the language params and reads the ISO country code + Hebrew name', async () => {
    const mock = stubFetch({
      id: 'g',
      displayName: { text: 'יפן' },
      location: { latitude: 36, longitude: 138 },
      addressComponents: [{ longText: 'Japan', shortText: 'JP', types: ['country', 'political'] }],
    });
    const geo = await client.geocode('g');
    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain('languageCode=he');
    expect(geo.name).toBe('יפן');
    expect(geo.countryCode).toBe('JP');
    expect(geo.lat).toBe(36);
  });
});
