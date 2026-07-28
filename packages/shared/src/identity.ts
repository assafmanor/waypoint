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

/** djb2, the classic string hash — small, stable, and dependency-free. Stability is
 *  the whole requirement: the same id must pick the same hue on every runtime and
 *  every deploy, since this is what a user sees as "their" colour. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
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
