import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertAllowedEnrichmentUrl,
  DisallowedHostError,
  EnrichmentFetcher,
  isAllowedEnrichmentUrl,
  ResponseTooLargeError,
} from './outbound-fetch';

describe('isAllowedEnrichmentUrl', () => {
  it('allows the four Wikimedia hosts enrichment actually reads', () => {
    for (const url of [
      'https://www.wikidata.org/w/api.php?action=wbgetentities',
      'https://he.wikipedia.org/api/rest_v1/page/summary/Tokyo',
      'https://en.wikipedia.org/api/rest_v1/page/summary/Tokyo',
      'https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Sensoji_2023.jpg/500px-x.jpg',
    ]) {
      expect(isAllowedEnrichmentUrl(url), url).toBe(true);
    }
  });

  it('refuses a host that merely ends with the allowed name', () => {
    // The suffix rule matches a real label boundary, so neither of these is "wikipedia".
    expect(isAllowedEnrichmentUrl('https://evilwikipedia.org/x')).toBe(false);
    expect(isAllowedEnrichmentUrl('https://wikipedia.org.attacker.test/x')).toBe(false);
  });

  it('refuses the SSRF targets that make this a security boundary', () => {
    for (const url of [
      'https://169.254.169.254/latest/meta-data/',
      'https://localhost/admin',
      'https://10.0.0.1/',
      'file:///etc/passwd',
      'http://www.wikidata.org/w/api.php', // an allowlisted host, downgraded to plaintext
    ]) {
      expect(isAllowedEnrichmentUrl(url), url).toBe(false);
    }
  });

  it('refuses a URL it cannot even parse', () => {
    expect(isAllowedEnrichmentUrl('not a url')).toBe(false);
  });

  it('ignores a port when matching the suffix', () => {
    expect(isAllowedEnrichmentUrl('https://he.wikipedia.org:443/x')).toBe(true);
  });

  it('asserts with the host in the message and nothing else from the URL', () => {
    // The refused URL can carry a provider's query string; the message names the host.
    try {
      assertAllowedEnrichmentUrl('https://attacker.test/steal?token=secret');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DisallowedHostError);
      expect((err as Error).message).toContain('attacker.test');
      expect((err as Error).message).not.toContain('secret');
    }
  });
});

describe('EnrichmentFetcher', () => {
  const fetcher = new EnrichmentFetcher();
  const ALLOWED = 'https://www.wikidata.org/w/api.php';

  afterEach(() => vi.unstubAllGlobals());

  /** A `Response` whose body streams the given chunks, so the cap is exercised the way it
   *  runs in production (streamed, not buffered-then-checked). */
  function streamed(chunks: Uint8Array[], init: ResponseInit = {}): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    return new Response(body, { status: 200, ...init });
  }

  it('never opens a socket for a disallowed host', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await expect(fetcher.fetch('https://attacker.test/x')).rejects.toBeInstanceOf(
      DisallowedHostError,
    );
    // The point of validating *before* fetching: the request does not happen at all.
    expect(spy).not.toHaveBeenCalled();
  });

  it('parses an allowlisted JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ entities: { Q615183: {} } }))),
    );
    await expect(fetcher.fetchJson<{ entities: object }>(ALLOWED)).resolves.toHaveProperty(
      'entities',
    );
  });

  it('rejects a non-2xx rather than parsing an error page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 429 })),
    );
    await expect(fetcher.fetchJson(ALLOWED)).rejects.toThrow('429');
  });

  it('re-validates the host on a redirect and refuses an off-allowlist hop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/' } }),
      ),
    );
    // The interesting attack is not the URL we asked for — it is where the response
    // pointed. `redirect: 'follow'` would have taken it.
    await expect(fetcher.fetch(ALLOWED)).rejects.toBeInstanceOf(DisallowedHostError);
  });

  it('follows a redirect that stays on the allowlist', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://upload.wikimedia.org/wikipedia/commons/x.jpg' },
        }),
      )
      .mockResolvedValueOnce(new Response('bytes', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    const res = await fetcher.fetch('https://commons.wikimedia.org/w/index.php');
    expect(res.status).toBe(200);
    // The final URL is what a caller records as provenance, not the one it asked for.
    expect(res.url).toContain('upload.wikimedia.org');
  });

  it('gives up on a redirect loop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 302, headers: { location: ALLOWED } })),
    );
    await expect(fetcher.fetch(ALLOWED)).rejects.toThrow('too many redirects');
  });

  it('refuses a body past the cap while it is still streaming', async () => {
    const chunk = new Uint8Array(64);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamed([chunk, chunk, chunk])),
    );
    await expect(fetcher.fetch(ALLOWED, { maxBytes: 100 })).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
  });

  it('refuses early on a declared length past the cap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x', { headers: { 'content-length': '99999' } })),
    );
    await expect(fetcher.fetch(ALLOWED, { maxBytes: 100 })).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
  });

  it('accepts a body under the cap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamed([new Uint8Array(32)])),
    );
    const res = await fetcher.fetch(ALLOWED, { maxBytes: 100 });
    expect(res.body.byteLength).toBe(32);
  });

  it('passes an abort signal so a slow source cannot hold up a pass', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', spy);
    await fetcher.fetchJson(ALLOWED, { timeoutMs: 1234 });
    expect(spy.mock.calls[0]?.[1]).toHaveProperty('signal');
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });
});
