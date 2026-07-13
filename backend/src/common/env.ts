// Env var *names* used by more than one call site, defined once so a typo or a
// bracket-vs-dot slip can't silently read the wrong (undefined) property.
export const JWT_SECRET = 'JWT_SECRET';
export const TOKEN_ENCRYPTION_KEY = 'TOKEN_ENCRYPTION_KEY';
export const GOOGLE_CLIENT_ID = 'GOOGLE_CLIENT_ID';
export const GOOGLE_CLIENT_SECRET = 'GOOGLE_CLIENT_SECRET';
export const GOOGLE_OAUTH_REDIRECT_URI = 'GOOGLE_OAUTH_REDIRECT_URI';
export const FRONTEND_URL = 'FRONTEND_URL';
export const DEV_AUTH = 'DEV_AUTH';

/** Throws with the var's own name if unset — pass one of the constants above. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} not configured`);
  return value;
}
