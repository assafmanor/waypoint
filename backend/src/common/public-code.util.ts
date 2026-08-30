import { randomInt } from 'node:crypto';

/**
 * **A short public capability**, and the one place the app spells that technique.
 *
 * ADR-0067 chose it for invites: 8 base58 characters (no `0`/`O`/`I`/`l` to mistype), a
 * ~2^47 keyspace, case-sensitive, and the code IS the grant — resolve code → row → trip,
 * with no separate token to mint or verify. ADR-0213's `/s/<code>` share link needs the
 * same shape for the same reasons, so it needs the same generator rather than a second
 * alphabet that drifts by one ambiguous glyph.
 *
 * `randomInt` (CSPRNG), not `Math.random`: these are guessable-by-construction if the
 * source is not. The tight per-IP throttle on every public code lookup is the other half.
 */
const CODE_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const PUBLIC_CODE_LENGTH = 8;

/** Matches what this generates, and nothing else. Exported so a route can reject a
 *  malformed code before it ever reaches the database. */
export const PUBLIC_CODE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{8}$/;

export function generatePublicCode(length: number = PUBLIC_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
