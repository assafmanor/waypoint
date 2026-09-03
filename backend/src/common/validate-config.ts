import {
  DOC_ENCRYPTION_KEY,
  FRONTEND_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_MAPS_SERVER_KEY,
  GOOGLE_OAUTH_REDIRECT_URI,
  JWT_SECRET,
  ROUTING_BASE_URL,
  ROUTING_FALLBACK_BASE_URL,
  TOKEN_ENCRYPTION_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_SUBJECT,
} from './env';
import { isAllowedEnrichmentUrl } from '../enrichment/outbound-fetch';

/** Thrown by {@link validateConfig}; carries the list of problems (var names
 *  only, never their values). */
export class ConfigValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigValidationError';
  }
}

const KEY_VARS = [JWT_SECRET, TOKEN_ENCRYPTION_KEY, DOC_ENCRYPTION_KEY] as const;

/** A key must decode from base64 to exactly 32 bytes (AES-256 / HMAC-SHA256). */
function isBase64_32Bytes(value: string): boolean {
  try {
    return Buffer.from(value, 'base64').length === 32;
  } catch {
    return false;
  }
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Fail-fast configuration validation (backend-review B-04), run in `bootstrap()`
 * before `listen()` so a misconfigured deploy dies immediately instead of booting
 * "healthy" and only failing at the first login/upload. It never logs a secret's
 * value — only which var is wrong.
 *
 * The hard guard applies in every environment: **refuse to start if `DEV_AUTH=1`
 * while `NODE_ENV=production`** (an accidental production DEV_AUTH is a latent full
 * auth bypass). Secret/URL presence is required in production; in dev the same
 * fields are still format-checked when present (so a typo is caught) but may be
 * absent (a `DEV_AUTH` sandbox needs no Google credentials).
 */
export function validateConfig(env: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = [];
  const isProd = env.NODE_ENV === 'production';

  if (env.DEV_AUTH === '1' && isProd) {
    problems.push('DEV_AUTH must not be enabled when NODE_ENV=production');
  }

  for (const name of KEY_VARS) {
    const value = env[name];
    if (!value) {
      if (isProd) problems.push(`${name} is required`);
      continue;
    }
    if (!isBase64_32Bytes(value)) {
      problems.push(`${name} must be base64 that decodes to exactly 32 bytes`);
    }
  }

  for (const name of [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET] as const) {
    if (isProd && !env[name]) problems.push(`${name} is required`);
  }

  // The Places proxy holds the server key (ADR-0108 §1); a prod deploy without it
  // would boot "healthy" and only 500 on the first place search. Dev/test may omit
  // it (the picker routes 500 if exercised — everything else runs).
  if (isProd && !env[GOOGLE_MAPS_SERVER_KEY])
    problems.push(`${GOOGLE_MAPS_SERVER_KEY} is required`);

  // Both are required in production, and both must name the SAME host (ADR-0169).
  // `FRONTEND_URL` was previously optional here while deployment.md called it required —
  // an environment missing it doesn't fail, it completes a Google login and then redirects
  // the browser to `localhost` (the session-66 symptom). And a callback host that differs
  // from the app's own host cannot log anyone in at all: the OAuth state cookie is set by
  // the host the round-trip started on and is not sent to the other one.
  const hosts = new Map<string, string>();
  for (const name of [GOOGLE_OAUTH_REDIRECT_URI, FRONTEND_URL] as const) {
    const value = env[name];
    if (!value) {
      if (isProd) problems.push(`${name} is required`);
      continue;
    }
    const url = parseUrl(value);
    if (!url) problems.push(`${name} must be a valid URL`);
    else hosts.set(name, url.host.toLowerCase());
  }
  const callbackHost = hosts.get(GOOGLE_OAUTH_REDIRECT_URI);
  const appHost = hosts.get(FRONTEND_URL);
  if (isProd && callbackHost && appHost && callbackHost !== appHost) {
    problems.push(
      `${GOOGLE_OAUTH_REDIRECT_URI} and ${FRONTEND_URL} must name the same host ` +
        `(a www./apex split here silently signs everyone out — pick one host for both, ` +
        `and for the Google Cloud console's redirect URI)`,
    );
  }

  validateVapid(env, problems, isProd);
  validateRoutingBaseUrl(env, problems, ROUTING_BASE_URL);
  validateRoutingBaseUrl(env, problems, ROUTING_FALLBACK_BASE_URL);

  if (problems.length > 0) throw new ConfigValidationError(problems);
}

/**
 * `ROUTING_BASE_URL` and `ROUTING_FALLBACK_BASE_URL`, when set (ADR-0205 §Z4, §Y5).
 *
 * Parameterised over the var name rather than copied per var: the fallback (§Y5) has to clear
 * exactly these three hurdles for exactly these reasons, and two copies would be two places for
 * the demo-web-app trap below to be re-learned.
 *
 * It is checked at boot rather than at the first call because of **how** this one goes wrong.
 * ADR-0205 §2 links `https://valhalla.openstreetmap.de/`, which is the demo **web application**:
 * it answers `200` with an HTML page for `/status` and for every API path. A deploy pointed there
 * does not fail — it returns a well-formed success carrying a document nothing can parse, forever,
 * and every travel time in the app quietly reads as ADR-0206 §D4's absence. §Z4 calls that the
 * most expensive way to be wrong, so the deploy dies here instead.
 *
 * Two rules, and the second is the one that catches it: it must be an https origin with no path
 * (the API host is the origin; paths are appended), and its host must be one the outbound
 * allowlist already knows — which is what makes ADR-0166 §7's "the allowlist is code" true rather
 * than a comment, since a host set only here would never be fetched anyway.
 */
function validateRoutingBaseUrl(env: NodeJS.ProcessEnv, problems: string[], varName: string): void {
  const value = env[varName];
  if (!value) return;
  const url = parseUrl(value);
  if (!url || url.protocol !== 'https:') {
    problems.push(`${varName} must be an https URL`);
    return;
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    problems.push(
      `${varName} must be a bare origin with no path ` +
        `(https://valhalla1.openstreetmap.de, not a link to the demo web app)`,
    );
    return;
  }
  if (!isAllowedEnrichmentUrl(url.toString())) {
    problems.push(
      `${varName} names a host the outbound allowlist does not carry ` +
        `(add it in enrichment/outbound-fetch.ts — the allowlist is code on purpose)`,
    );
  }
}

/** Base64url of exactly `bytes` bytes, which is how a VAPID key is carried. Written out
 *  rather than reusing `isBase64_32Bytes` above: that one wants standard base64 (the
 *  encryption keys are stored that way) and these are URL-safe, so the alphabets differ.
 *  Node's decoder accepts both, so the length check is what actually discriminates. */
function isBase64UrlBytes(value: string, bytes: number): boolean {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return false;
  try {
    return Buffer.from(value, 'base64url').length === bytes;
  } catch {
    return false;
  }
}

/**
 * The Web Push keypair (ADR-0197 §1), validated as a **set**.
 *
 * Two things here are deliberate. **A partial keypair is a problem in every environment,
 * production or not** — unlike the Google credentials, which a `DEV_AUTH` sandbox may
 * legitimately omit entirely, half a VAPID keypair cannot be anything but a mistake, and
 * the failure it produces is a subscribe that succeeds and a send that 401s later. And the
 * keys are **format-checked whenever present**, because the way this goes wrong in practice
 * is a copy-paste that swaps the two halves: the public key is 65 bytes (an uncompressed
 * P-256 point, `0x04` + two 32-byte coordinates) and the private one is 32, so the sizes
 * tell them apart and a swap is caught at boot instead of at the first send.
 */
function validateVapid(env: NodeJS.ProcessEnv, problems: string[], isProd: boolean): void {
  const publicKey = env[VAPID_PUBLIC_KEY];
  const privateKey = env[VAPID_PRIVATE_KEY];
  const subject = env[VAPID_SUBJECT];

  if (isProd) {
    for (const name of [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT] as const) {
      if (!env[name]) problems.push(`${name} is required`);
    }
  } else if ((publicKey || privateKey || subject) && !(publicKey && privateKey && subject)) {
    problems.push(
      `${VAPID_PUBLIC_KEY}, ${VAPID_PRIVATE_KEY} and ${VAPID_SUBJECT} must be set together ` +
        `(a partial keypair subscribes fine and fails at the first send)`,
    );
  }

  if (publicKey && !isBase64UrlBytes(publicKey, 65)) {
    problems.push(
      `${VAPID_PUBLIC_KEY} must be base64url that decodes to exactly 65 bytes ` +
        `(an uncompressed P-256 point — 32 bytes means the private key is here by mistake)`,
    );
  }
  if (privateKey && !isBase64UrlBytes(privateKey, 32)) {
    problems.push(
      `${VAPID_PRIVATE_KEY} must be base64url that decodes to exactly 32 bytes ` +
        `(65 bytes means the public key is here by mistake)`,
    );
  }
  if (subject) {
    const url = parseUrl(subject);
    if (!url || !['mailto:', 'https:'].includes(url.protocol)) {
      problems.push(`${VAPID_SUBJECT} must be a mailto: or https: URL`);
    }
  }
}
