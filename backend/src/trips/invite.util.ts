import { generatePublicCode } from '../common/public-code.util';

/**
 * Short public invite handle (ADR-0067). The technique — 8 base58 characters, CSPRNG,
 * the code IS the grant — now lives in `common/public-code.util.ts`, because ADR-0213's
 * share link needs exactly the same one and two copies of an alphabet is how they drift
 * apart by an ambiguous glyph.
 *
 * The name stays: `generateInviteCode()` is what an invite reads as at its call sites.
 */
export function generateInviteCode(): string {
  return generatePublicCode();
}
