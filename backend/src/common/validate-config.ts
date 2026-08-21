import {
  DOC_ENCRYPTION_KEY,
  FRONTEND_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_MAPS_SERVER_KEY,
  GOOGLE_OAUTH_REDIRECT_URI,
  JWT_SECRET,
  TOKEN_ENCRYPTION_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_PUBLIC_KEY,
  VAPID_SUBJECT,
} from './env';

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

  if (problems.length > 0) throw new ConfigValidationError(problems);
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
