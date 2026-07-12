import { createHash, randomBytes } from 'node:crypto';

// Thin wrapper over Google's OAuth/OpenID endpoints — plain `fetch`, no
// `googleapis`/`google-auth-library` dependency needed for sign-in + one-way
// Calendar push (auth-and-google.md).
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const SIGN_IN_SCOPES = 'openid email profile';

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
  scope: string;
}

export interface GoogleUserinfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} not configured`);
  return value;
}

export function generatePkceVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function pkceChallengeFromVerifier(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function generateOAuthState(): string {
  return randomBytes(16).toString('base64url');
}

export function buildGoogleAuthUrl(opts: {
  state: string;
  codeChallenge: string;
  forceConsent: boolean;
}): string {
  const params = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: env('GOOGLE_OAUTH_REDIRECT_URI'),
    response_type: 'code',
    scope: SIGN_IN_SCOPES,
    access_type: 'offline',
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
  });
  // Google only returns a refresh token on first consent — force the consent
  // screen again when the callback comes back without one (auth-and-google.md).
  if (opts.forceConsent) params.set('prompt', 'consent');
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: env('GOOGLE_OAUTH_REDIRECT_URI'),
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function fetchGoogleUserinfo(accessToken: string): Promise<GoogleUserinfo> {
  const res = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google userinfo fetch failed: ${res.status}`);
  return res.json() as Promise<GoogleUserinfo>;
}

/** Best-effort — logout succeeds even if Google's revoke endpoint is unreachable. */
export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(
    () => undefined,
  );
}
