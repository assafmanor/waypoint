// Avatar identity hues — the decorative ramp named in design-language.md and
// decided in ADR-0133 §5. Two rules govern it, and both are why this is a fixed
// named set rather than a free colour:
//
//   1. It sits OUTSIDE the semantic budget (never amber/teal/plan, ADR-0028), and
//      BELOW the five `--cat-*` pin hues in chroma — hue angle alone can't separate
//      them, because a member avatar in the chrome co-occurs with a category pin on
//      the Map canvas.
//   2. One dark ink must clear contrast on every hue in BOTH themes, which is what
//      keeps the Avatar primitive from carrying a per-hue ink table.
//
// A hue is stored and transported as its KEY, never as a hex. The values live once,
// in `tokens.css`, under both `:root` and `:root[data-theme='dark']` — so a stored
// `denim` follows the dark remap for free, which a stored `#8496B5` could never do.
import { z } from 'zod';

export const IDENTITY_HUES = ['plum', 'rose', 'moss', 'denim', 'cocoa'] as const;

export const identityHueSchema = z.enum(IDENTITY_HUES);
export type IdentityHue = z.infer<typeof identityHueSchema>;

/** Which picture source the user chose. `initials` is precisely "chose not to use a
 *  photo" — the state that makes the hue a real choice (ADR-0133 §6). */
export const avatarChoiceSchema = z.enum(['google', 'upload', 'initials']);
export type AvatarChoice = z.infer<typeof avatarChoiceSchema>;

/** djb2 plus an avalanche finalizer (murmur3's `fmix32`). Stability is the whole
 *  requirement — the same id must pick the same hue on every runtime and every
 *  deploy, since this is what a user sees as "their" colour — so both halves are
 *  plain integer arithmetic with no dependency and no randomness.
 *
 *  The finalizer is not decoration. Plain djb2 barely mixes its low bits, so short
 *  ids sharing a prefix collapse onto the same `% 5`: the seed's own five users
 *  (`u-assaf`, `u-noam`, `u-dana`, `u-maor`, `u-ron`) came out **plum, plum, rose,
 *  cocoa, plum** — three of five identical, on exactly the ~5-person trip this
 *  product is built for. Real ids are high-entropy cuids and would have hidden the
 *  clustering; the seed's human-readable ids exposed it.
 *
 *  To be clear about what this does and does not buy: it fixes the CLUSTERING, not
 *  collisions. Five hues over five people are all-distinct only ~4% of the time, so
 *  a repeat inside a group is normal and expected — ADR-0133 §5 accepts it, because
 *  the letter and the name identify and the hue only helps the eye. What is not
 *  acceptable is a hash whose output barely depends on its input. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  // murmur3 fmix32 — spreads the low bits so a small modulus sees the whole hash.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** The hue a user gets before they ever open the picture page.
 *
 *  Derived from the id rather than stored as a column default, because one shared
 *  default is exactly what made every real user identical: `avatarColor` was
 *  `@default("#E9A63C")` and nothing overrode it on create, so the field meant to
 *  tell members apart told them apart not at all (ADR-0133's Context).
 *
 *  Repeats inside a group are accepted — five hues against a five-person trip will
 *  sometimes collide. This is gentle variety, not identification: the letter and the
 *  name identify, the hue only helps the eye. */
export function deriveAvatarHue(userId: string): IdentityHue {
  return IDENTITY_HUES[hashString(userId) % IDENTITY_HUES.length];
}

/** The stored pick when there is one, else the derived hue. The one place that
 *  question is answered, so a null column can never reach a render. */
export function resolveAvatarHue(userId: string, stored: string | null | undefined): IdentityHue {
  const parsed = identityHueSchema.safeParse(stored);
  return parsed.success ? parsed.data : deriveAvatarHue(userId);
}
