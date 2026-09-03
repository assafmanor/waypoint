// The one way out of the process for enrichment (ADR-0166 §7), and it is a security
// boundary rather than tidiness.
//
// A server that retrieves a URL which **arrived in a third-party API response** is an
// SSRF seat — the same seat the backlog's link-preview item names as its constraint (4).
// Enrichment is the far easier case (our sources are a fixed, known set, not a URL a
// member pasted), so the rule is cheap to hold and it is held here so the easy case does
// not get the weaker treatment: **an image URL returned by a provider is validated
// against the allowlist before it is fetched, never followed because a response supplied
// it.**
//
// Three properties, all of which a provider gets for free by going through this:
//   - **host-allowlisted**, checked before the socket opens, and re-checked on every
//     redirect hop (a 302 to `169.254.169.254` is the interesting attack, not the
//     original URL);
//   - **timeboxed**, so one slow source degrades one field and nothing else (§5.4);
//   - **size-capped**, streamed and aborted at the cap rather than buffered first.
import {
  DEFAULT_ENRICHMENT_FETCH_TIMEOUT_MS,
  DEFAULT_ENRICHMENT_JSON_MAX_BYTES,
  ENRICHMENT_FETCH_TIMEOUT_MS,
  ENRICHMENT_JSON_MAX_BYTES,
  envInt,
} from '../common/env';

/**
 * Every host enrichment may talk to (§7), and why each is here:
 *
 *  - `www.wikidata.org` — entity reads (`wbgetentities`, `wbsearchentities`).
 *  - `*.wikipedia.org` — the REST summary endpoint, per language.
 *  - `commons.wikimedia.org` — `imageinfo`, which is where a file's own license is read.
 *    §7's list predates §11.1's rule that the license must be verified on Commons before
 *    an image is stored, so this host is what makes that rule performable.
 *  - `upload.wikimedia.org` — the thumbnail bytes Commons generated (§12.1).
 *
 * The configured Overpass instance joins this list with ADR-0166's Phase 2, which is
 * blocked on measuring the restaurant fill rate (§12.4) — deliberately not added now,
 * because an allowlist entry for a host nothing calls is an allowlist entry nobody
 * checked.
 *
 * `open.er-api.com` is the exception to this file's title: it is the exchange-rate
 * source (ADR-0180 §7), not an enrichment source. See the note beside it.
 */
const ALLOWED_HOSTS = [
  'www.wikidata.org',
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  // The FX rate source (ADR-0180 §7). It is not enrichment, and it is here
  // anyway: this file is the process's ONE outbound seat, and the three
  // properties it enforces — allowlisted, timeboxed, size-capped — are exactly
  // what a daily third-party JSON fetch needs. A second fetcher for a second
  // caller would be a second place to get SSRF wrong (rule 8; ADR-0166 §8
  // already said ETA would share this client and none of enrichment's store).
  //
  // The class is still named for its first consumer, which is now behind its
  // scope. Renaming it is a follow-up rather than a rider here, because the knobs
  // are ENV VARS (`ENRICHMENT_FETCH_TIMEOUT_MS`) and renaming those is a breaking
  // config change for anyone who has set them.
  'open.er-api.com',
  // The routing engine (ADR-0205 §2/§Z4), added for the same reason and with the same caveat as
  // the line above. **`valhalla1` is the API host; `valhalla.openstreetmap.de` is the demo WEB
  // APP** and answers `200` with HTML for every API path, which is why only the real one is here
  // and why `ROUTING_BASE_URL` is boot-validated against this list rather than trusted.
  //
  // A self-hosted Valhalla (ADR-0205 §Y1) is a line HERE plus the env var — deliberately not one
  // or the other, because this file's whole posture is that the allowlist is code.
  'valhalla1.openstreetmap.de',
  // **The fallback router** (ADR-0205 §Y5) — FOSSGIS's OSRM host, which is what the
  // openstreetmap.org website routes with. Here for the same reason as the line above and under
  // the same rule: a host named only in an env var would never be fetched, because the allowlist
  // is code. Separate infrastructure from `valhalla1`, which is what makes it a fallback rather
  // than a second name for the same outage.
  'routing.openstreetmap.de',
];

/** Suffix rules, for the one source that is genuinely per-language. Matched as a real
 *  label boundary (`.wikipedia.org`), never a substring — `evilwikipedia.org` and
 *  `wikipedia.org.attacker.test` must both fail. */
const ALLOWED_HOST_SUFFIXES = ['.wikipedia.org'];

/** Redirect hops followed before giving up. Wikimedia uses a redirect for
 *  `Special:Redirect/file`, so zero is too few; anything beyond a couple is a loop. */
const MAX_REDIRECTS = 3;

/** Thrown when a URL fails the allowlist. Distinct from a network failure on purpose: a
 *  provider handing us an off-allowlist host is a **refusal to fetch**, which is a fact
 *  worth logging loudly, not a transient outage to retry. */
export class DisallowedHostError extends Error {
  constructor(readonly url: string) {
    super(`enrichment fetch refused: host not allowlisted (${safeHostOf(url)})`);
    this.name = 'DisallowedHostError';
  }
}

/** **A non-2xx, carrying what the server actually said.** Distinct from the two refusals below
 *  it: this one is the far end answering, and whether that answer is transient is the caller's
 *  to decide from `status` and `body` — ADR-0205 §Z4's `400 error_code 154` is a stated limit
 *  that no retry will change, and a message string would have flattened it into "it failed". */
export class OutboundHttpError extends Error {
  constructor(
    readonly status: number,
    readonly host: string,
    readonly body: string,
  ) {
    super(`outbound fetch failed: ${status} for ${host}`);
    this.name = 'OutboundHttpError';
  }
}

/** Thrown when a response exceeds its byte cap — also a refusal, not an outage. */
export class ResponseTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`enrichment fetch refused: response exceeded ${maxBytes} bytes`);
    this.name = 'ResponseTooLargeError';
  }
}

function safeHostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '<unparseable>';
  }
}

/** Is this a URL enrichment is allowed to fetch at all?
 *
 *  `https` only: an allowlisted host reached over plain http is a downgrade an attacker on
 *  the path chooses, and every source here speaks TLS. This also rejects the schemes that
 *  make SSRF interesting (`file:`, `gopher:`, `http+unix:`) without enumerating them. */
export function isAllowedEnrichmentUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  // `hostname`, not `host` — `host` carries the port, so a suffix check against it would
  // read `wikipedia.org:8080` differently from `wikipedia.org`.
  const host = parsed.hostname.toLowerCase();
  return (
    ALLOWED_HOSTS.includes(host) || ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

/** The same question as an assertion, for the call sites where continuing would mean
 *  fetching something we said we would not. */
export function assertAllowedEnrichmentUrl(url: string): void {
  if (!isAllowedEnrichmentUrl(url)) throw new DisallowedHostError(url);
}

export interface EnrichmentFetchOptions {
  /** Byte ceiling for this response. Defaults to the JSON cap; Phase 2's image fetch
   *  passes its own, larger one. */
  maxBytes?: number;
  timeoutMs?: number;
  /** **A body to POST, already serialised.** Every source before ADR-0205 read with a `GET`;
   *  Valhalla's matrix takes a JSON document, and its `GET ?json=` spelling puts a whole day's
   *  coordinates in a URL. Sending it as a body is not a preference — it is what keeps a 24-stop
   *  request off the wrong side of a proxy's URL limit. Present ⇒ `POST`. */
  json?: unknown;
  /** Extra request headers. FOSSGIS asks every client to identify itself with `X-Client-Id`
   *  (ADR-0205 §2) and that is a condition of using the server at all. */
  headers?: Record<string, string>;
}

/** What a fetch came back with. The `url` is the **final** one after redirects, which is
 *  what a caller should record as provenance rather than the URL it asked for. */
export interface EnrichmentResponse {
  url: string;
  status: number;
  contentType: string | null;
  body: Buffer;
}

/**
 * The allowlisted, timeboxed, size-capped fetcher every provider goes through.
 *
 * Injectable so a spec can hand a provider recorded fixtures instead of a socket — which
 * is what keeps providers pure `(identity) → match → fields` and testable with no network
 * and no DB (§5.3).
 */
export class EnrichmentFetcher {
  /** Fetch and parse JSON. Rejects on a non-2xx, an off-allowlist host (including one
   *  reached only via redirect), a timeout, or a body past the cap.
   *
   *  The non-2xx throw carries the **status and the body** (`OutboundHttpError`), because one
   *  caller has to tell two failures apart that look identical from out here: ADR-0205 §Z4's
   *  `400 error_code 154` is the provider stating a limit, not an outage, and a bare message
   *  string would make it one. */
  async fetchJson<T>(url: string, options: EnrichmentFetchOptions = {}): Promise<T> {
    const response = await this.fetch(url, options);
    if (response.status < 200 || response.status >= 300) {
      throw new OutboundHttpError(response.status, safeHostOf(url), response.body.toString('utf8'));
    }
    return JSON.parse(response.body.toString('utf8')) as T;
  }

  /** Fetch raw bytes. Redirects are followed **manually**, re-validating each hop's host,
   *  because `redirect: 'follow'` would take us wherever the response pointed — the whole
   *  thing the allowlist exists to prevent. */
  async fetch(url: string, options: EnrichmentFetchOptions = {}): Promise<EnrichmentResponse> {
    const maxBytes =
      options.maxBytes ?? envInt(ENRICHMENT_JSON_MAX_BYTES, DEFAULT_ENRICHMENT_JSON_MAX_BYTES);
    const timeoutMs =
      options.timeoutMs ?? envInt(ENRICHMENT_FETCH_TIMEOUT_MS, DEFAULT_ENRICHMENT_FETCH_TIMEOUT_MS);

    const body = options.json === undefined ? undefined : JSON.stringify(options.json);

    let target = url;
    let method = body === undefined ? 'GET' : 'POST';
    for (let hop = 0; ; hop++) {
      assertAllowedEnrichmentUrl(target);
      const res = await fetch(target, {
        method,
        ...(method === 'POST' && body !== undefined ? { body } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        // Wikimedia asks API clients to identify themselves, and an unidentified client is
        // the one they rate-limit first.
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Encoding': 'gzip',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...options.headers,
        },
      });

      const location = res.headers.get('location');
      if (isRedirect(res.status) && location) {
        if (hop >= MAX_REDIRECTS) throw new Error('enrichment fetch failed: too many redirects');
        // Resolved against the current URL so a relative `Location` works — and then run
        // back through the allowlist at the top of the loop.
        target = new URL(location, target).toString();
        // 307/308 preserve the method and body; 301/302/303 are defined to turn a POST into a
        // GET, and re-POSTing a body the server told us to move is how a request gets sent
        // twice to somewhere that did not ask for it.
        if (res.status !== 307 && res.status !== 308) method = 'GET';
        continue;
      }

      return {
        url: target,
        status: res.status,
        contentType: res.headers.get('content-type'),
        body: await readCapped(res, maxBytes),
      };
    }
  }
}

/** Identifies us to Wikimedia per their API etiquette. */
const USER_AGENT = 'Waypoint/1.0 (place enrichment; +https://github.com/assafmanor/waypoint)';

const isRedirect = (status: number): boolean =>
  status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

/** Read a body, refusing past `maxBytes`.
 *
 *  Streamed rather than `await res.arrayBuffer()` then checked, because buffering first is
 *  what the cap is meant to prevent: a 4 GB response would already be in memory by the
 *  time the check ran. `Content-Length` is consulted as a cheap early out but never
 *  trusted as the answer — it is absent under chunked encoding and can simply lie. */
async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ResponseTooLargeError(maxBytes);

  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new ResponseTooLargeError(maxBytes);
      chunks.push(Buffer.from(value));
    }
  } finally {
    // Releasing the lock lets the underlying socket be torn down on the refusal path
    // instead of being held until GC.
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
