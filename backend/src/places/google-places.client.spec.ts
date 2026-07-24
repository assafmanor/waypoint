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
