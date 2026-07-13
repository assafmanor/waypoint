import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { JWT_SECRET, requireEnv } from '../common/env';

// Hand-rolled HS256 JWT (header.payload.signature, base64url + HMAC-SHA256) — same
// technique trips.service.ts already uses for invite tokens, just with a JWT shape
// so the "stateless JWT" from ADR-0020 is literal, without adding a JWT library.
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
}

function sign(data: string): string {
  return createHmac('sha256', requireEnv(JWT_SECRET)).update(data).digest('base64url');
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ACCESS_TOKEN_TTL_SECONDS };
  const bodyEnc = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${HEADER}.${bodyEnc}.${sign(`${HEADER}.${bodyEnc}`)}`;
}

/** Returns the payload if the token is well-formed, signed, and unexpired — else null. */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerEnc, bodyEnc, signature] = parts;

  const expected = sign(`${headerEnc}.${bodyEnc}`);
  const actual = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) return null;

  try {
    const body = JSON.parse(Buffer.from(bodyEnc, 'base64url').toString('utf8')) as {
      sub?: unknown;
      email?: unknown;
      exp?: unknown;
    };
    if (typeof body.sub !== 'string' || typeof body.email !== 'string') return null;
    if (typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: body.sub, email: body.email };
  } catch {
    return null;
  }
}

/** Opaque refresh token (ADR-0020) — the value that goes in the httpOnly cookie. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the hash is stored server-side, so a DB read can't recover the live cookie value. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
