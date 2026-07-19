import {
  DOC_ENCRYPTION_KEY,
  FRONTEND_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI,
  JWT_SECRET,
  TOKEN_ENCRYPTION_KEY,
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

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
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

  for (const name of [GOOGLE_OAUTH_REDIRECT_URI, FRONTEND_URL] as const) {
    const value = env[name];
    if (!value) {
      if (isProd && name === GOOGLE_OAUTH_REDIRECT_URI) problems.push(`${name} is required`);
      continue;
    }
    if (!isValidUrl(value)) problems.push(`${name} must be a valid URL`);
  }

  if (problems.length > 0) throw new ConfigValidationError(problems);
}
