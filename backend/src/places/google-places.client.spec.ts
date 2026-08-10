import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLACE_SEARCH_KIND } from '@waypoint/shared';
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

  /* ── AN UNSENDABLE VIEWPORT IS DROPPED, NOT SENT (field report #34) ────────────────────────
     Production: `/v1/places:searchText` → `400 INVALID_ARGUMENT — Invalid rectangle viewport.
     The rectangle viewport cannot be wider than 180.` The bias is a ranking hint, so every case
     below still sends a complete, valid query; what changes is only whether `locationBias` is on
     it. Nothing is clamped: a narrower rectangle would rank results toward somewhere the user is
     not looking, which reads as an answer and is not one. */
  const sentBody = (mock: ReturnType<typeof stubFetch>) =>
    JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);

  it('drops a world-wide viewport bias and still sends the query', async () => {
    const mock = stubFetch({ places: [] });
    await client.textSearch('קפה', { south: -85, west: -180, north: 85, east: 180 });
    const body = sentBody(mock);
    expect(body.locationBias).toBeUndefined();
    // The query itself is untouched — the whole point of #34 is that it must still run.
    expect(body.textQuery).toBe('קפה');
    expect(body.languageCode).toBe('he');
  });

  it('sends an antimeridian-wrapped viewport as the inverted range Google reads it as', async () => {
    const mock = stubFetch({ places: [] });
    // Auckland↔Fiji across ±180: `west > east`, true span 10°.
    await client.textSearch('קפה', { south: -20, west: 175, north: -15, east: -175 });
    expect(sentBody(mock).locationBias).toEqual({
      rectangle: {
        low: { latitude: -20, longitude: 175 },
        high: { latitude: -15, longitude: -175 },
      },
    });
  });

  it('drops a wrapped viewport whose real span is the whole world', async () => {
    const mock = stubFetch({ places: [] });
    // `east - west` here is -0.1; the span is 359.9. The naive subtraction is what shipped the 400.
    await client.textSearch('קפה', { south: -85, west: 100, north: 85, east: 99.9 });
    expect(sentBody(mock).locationBias).toBeUndefined();
  });

  it('OMITS a non-finite or inverted bias rather than refusing the search', async () => {
    // The deliberate choice, pinned: an unusable bias is never an error of ours. Rejecting it
    // would turn a valid query into a 400 from our own API, which is the failure #34 removes.
    const nan = stubFetch({ places: [] });
    await expect(
      client.textSearch('קפה', { south: NaN, west: 139.6, north: 35.75, east: 139.8 }),
    ).resolves.toEqual([]);
    expect(sentBody(nan).locationBias).toBeUndefined();

    const inverted = stubFetch({ places: [] });
    await client.textSearch('קפה', { south: 35.75, west: 139.6, north: 35.6, east: 139.8 });
    expect(sentBody(inverted).locationBias).toBeUndefined();
  });

  it('keeps the airport restriction intact when the bias is dropped', async () => {
    const mock = stubFetch({ places: [] });
    await client.textSearch(
      'נתב"ג',
      { south: -85, west: -180, north: 85, east: 180 },
      PLACE_SEARCH_KIND.AIRPORT,
    );
    const body = sentBody(mock);
    expect(body.locationBias).toBeUndefined();
    expect(body.includedType).toBe('airport');
    expect(body.strictTypeFiltering).toBe(true);
  });

  // ── AIRPORT-ONLY SEARCH (field report #6) ─────────────────────────────────────
  it('textSearch restricts to airports when asked, strictly, and not otherwise', async () => {
    const mock = stubFetch({ places: [] });
    await client.textSearch('נתב"ג', undefined, PLACE_SEARCH_KIND.AIRPORT);
    const body = JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.includedType).toBe('airport');
    // Without strict filtering `includedType` is a ranking preference and the hotel beside
    // the airport still comes back, which is the answer field report #6 is against.
    expect(body.strictTypeFiltering).toBe(true);

    const bare = stubFetch({ places: [] });
    await client.textSearch('קפה');
    const bareBody = JSON.parse((bare.mock.calls[0][1] as RequestInit).body as string);
    expect(bareBody.includedType).toBeUndefined();
    expect(bareBody.strictTypeFiltering).toBeUndefined();
  });

  it('the restriction moves neither the field mask nor the SKU tier it sets', async () => {
    const mock = stubFetch({ places: [] });
    await client.textSearch('נתב"ג', undefined, PLACE_SEARCH_KIND.AIRPORT);
    const init = mock.mock.calls[0][1] as RequestInit;
    // ADR-0108 §3: the mask is the single lever on what we are billed. `includedType` is a
    // request parameter, so a restricted search costs exactly what an unrestricted one does.
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(
      'places.id,places.displayName,places.formattedAddress,places.location',
    );
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
