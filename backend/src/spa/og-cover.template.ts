import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DEFAULT_TRIP_ICON, INVITE_AVATARS } from '@waypoint/shared';
import { HEBREW_RANGE, inlineFaces, LATIN_RANGE, type FontFace } from '../common/inline-fonts';
import { heTravellersInside, heTripRange, heTripRangeNumeric } from '../sharing/hebrew.copy';
import { STATIC_ROOT } from './spa-paths';
import { escapeHtml } from './spa-shell.service';
import type { TripPreviewFacts } from './share-meta';

/**
 * **The link-preview cover, drawn for one trip** (ADR-0220's 2026-09-06 amendment).
 *
 * Owner, on a real WhatsApp thread: _"I noticed that it doesn't render the trip's icon."_ The
 * covers were two PNGs cut at build time and served to every crawler, so an invitation to
 * Georgia and an invitation to Iceland were the same picture — while `og:title` beside it
 * named the trip. `README.md` in `scripts/og-covers/` said **"No trip name, ever"**; that rule
 * was a consequence of cutting at build time, and this is the amendment that lifts it.
 *
 * **The markup is not here.** `scripts/og-covers/og-invite.html` and `og-live.html` are the
 * one source, filled twice: by `scripts/gen-app-icons.mjs` with generic defaults into the
 * committed fallback PNGs, and here with a trip's own facts. So the picture a person sees is
 * literally the join ticket / the reader masthead they are about to open, and neither filler
 * can drift from the other.
 *
 * **Nothing on a cover may go stale.** It is cached by us and then by every chat app that
 * ever fetched it, so what it carries has to still be true a week later: an icon, a name, a
 * destination, a date range. Not a countdown, not "updated 3 minutes ago", not a member list
 * that changes with every join — see `og-invite.html`'s header.
 */

/** The three families the covers use. **No emoji face**, deliberately: the paper inlines a
 *  monochrome one because a PDF needs extractable glyphs, and a cover is a screenshot that
 *  wants the trip's flag in colour — so it falls through to the image's system
 *  `fonts-noto-color-emoji`, which is what the `Dockerfile` installs it for. */
const COVER_FACES: readonly FontFace[] = [
  ['Assistant', '200 800', 'assistant-hebrew.woff2', HEBREW_RANGE],
  ['Assistant', '200 800', 'assistant-latin.woff2', LATIN_RANGE],
  ['Secular One', '400', 'secular-one-hebrew.woff2', HEBREW_RANGE],
  ['Secular One', '400', 'secular-one-latin.woff2', LATIN_RANGE],
  ['JetBrains Mono', '100 800', 'jetbrains-mono-latin.woff2', LATIN_RANGE],
];

/**
 * The app's real stylesheets, in the app's own import order — the same manifest
 * `gen-app-icons.mjs` reads, and the reason a cover that borrows `.join-ticket` or `.sh-hero`
 * renders the SHIPPED rules rather than a transcription of them.
 *
 * Order among these three is not actually load-bearing (custom properties resolve at use
 * time, and the class prefixes do not overlap) — but `_cover.css` must come LAST, because its
 * `html,body{overflow:visible}` undoes `tokens.css`'s `overflow: clip`, without which a cover
 * taller than the viewport is cropped by the wrong box.
 */
const APP_SHEETS = ['styles/tokens.css', 'App.css', 'screens/shared-itinerary.css'] as const;

/** Where the cover sources live. The runtime image flattens them (`Dockerfile`); a source
 *  checkout keeps them where they are authored. Same shape as `inline-fonts.ts`'s candidate
 *  list, and for the same reason: one lookup that works in the container and in `pnpm dev`. */
const COVER_ROOTS = [
  '/app/og-covers',
  join(__dirname, '..', '..', '..', 'scripts', 'og-covers'),
  join(process.cwd(), '..', 'scripts', 'og-covers'),
  join(process.cwd(), 'scripts', 'og-covers'),
];

const SHEET_ROOTS = [
  '/app/og-covers/app',
  join(__dirname, '..', '..', '..', 'frontend', 'src'),
  join(process.cwd(), '..', 'frontend', 'src'),
  join(process.cwd(), 'frontend', 'src'),
];

/** The mark the reader page's own bar loads. Read from the BUILT app first, so the cover and
 *  the page a crawler is previewing carry the same bytes. */
const MARK_ROOTS = [
  STATIC_ROOT,
  join(__dirname, '..', '..', '..', 'frontend', 'public'),
  join(process.cwd(), '..', 'frontend', 'public'),
  join(process.cwd(), 'frontend', 'public'),
];

function readFrom(roots: readonly string[], file: string): string | null {
  for (const root of roots) {
    for (const candidate of [join(root, file), join(root, basename(file))]) {
      try {
        return readFileSync(candidate, 'utf8');
      } catch {
        // Try the next candidate.
      }
    }
  }
  return null;
}

let assetCache: { css: string; markUrl: string; covers: Record<CoverKind, string> } | null = null;
let assetsMissing = false;

export type CoverKind = 'invite' | 'live';

const COVER_FILE: Record<CoverKind, string> = {
  invite: 'og-invite.html',
  live: 'og-live.html',
};

/** Read the sheets, the mark and the two templates once. Returns `null` when any of them is
 *  missing, which is how a deploy without the cover assets degrades to the committed PNG
 *  rather than rendering a cover with no CSS. */
function assets(): typeof assetCache {
  if (assetCache || assetsMissing) return assetCache;
  const sheets = APP_SHEETS.map((sheet) => readFrom(SHEET_ROOTS, sheet));
  const own = readFrom(COVER_ROOTS, '_cover.css');
  const mark = readFrom(MARK_ROOTS, 'icon-mark-bright.svg');
  const invite = readFrom(COVER_ROOTS, COVER_FILE.invite);
  const live = readFrom(COVER_ROOTS, COVER_FILE.live);
  if (sheets.some((sheet) => sheet === null) || !own || !mark || !invite || !live) {
    assetsMissing = true;
    return null;
  }
  assetCache = {
    css: `${sheets.join('\n')}\n${own}`,
    markUrl: `data:image/svg+xml;base64,${Buffer.from(mark, 'utf8').toString('base64')}`,
    covers: { invite, live },
  };
  return assetCache;
}

/** Tests only — the paths never change at runtime. */
export function resetCoverAssetCache(): void {
  assetCache = null;
  assetsMissing = false;
}

/**
 * **`{{slot}}` -> value, and an unfilled slot is an error rather than visible braces.** Two
 * programs fill these templates — this one and `scripts/gen-app-icons.mjs` — so a slot added
 * for one of them would otherwise ship as a literal `{{name}}` in the other's output. The
 * cutter's copy of this throws for the same reason; it is eight lines, and sharing it would
 * mean the runtime image carrying that script.
 */
function fillSlots(
  template: string,
  values: Record<string, string>,
  raw: Record<string, string>,
): string {
  return template.replace(
    /\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g,
    (_, rawKey: string | undefined, textKey: string | undefined) => {
      if (rawKey !== undefined) {
        if (!(rawKey in raw)) throw new Error(`no value for raw cover slot ${rawKey}`);
        return raw[rawKey];
      }
      const key = textKey as string;
      if (!(key in values)) throw new Error(`no value for cover slot ${key}`);
      // Every value in `values` is trip content a member typed. The document is then rendered
      // in a browser, so an unescaped `<` in a trip name is script execution inside our own
      // renderer. **A triple brace is a separate map on purpose**: raw markup is built here
      // from `INVITE_AVATARS` and never from anything a user can write, and keeping the two
      // maps apart is what stops a later slot being handed trip text by mistake.
      return escapeHtml(values[key]);
    },
  );
}

/** The ticket's face row, as many faces as members and no more than the join screen draws —
 *  the count and the row are one fact (`INVITE_AVATARS`). */
function avatarRow(travellers: number): string {
  return Array.from({ length: Math.min(travellers, INVITE_AVATARS.MAX) }, (_, i) => {
    const colour = INVITE_AVATARS.COLORS[i % INVITE_AVATARS.COLORS.length];
    return `<span class="ticket-av" style="background: ${colour}">${INVITE_AVATARS.GLYPH}</span>`;
  }).join('');
}

function slotsFor(
  kind: CoverKind,
  facts: TripPreviewFacts,
  markUrl: string,
): { text: Record<string, string>; raw: Record<string, string> } {
  const icon = facts.icon || DEFAULT_TRIP_ICON;
  // `heTripRange` isolates its own numeric run where one is needed (ADR-0118); a second
  // isolate around the whole string is what put the month ahead of its day on a real preview.
  const dates = heTripRange(facts.startDate, facts.endDate);
  return kind === 'invite'
    ? {
        text: {
          icon,
          name: facts.name,
          meta: `${facts.destination}, ${dates}`,
          members: heTravellersInside(facts.travellers),
        },
        raw: { avatars: avatarRow(facts.travellers) },
      }
    : {
        // Digits, because `.sh-dates` is the reader page's MONO slot — see
        // `heTripRangeNumeric`. The ticket's own meta line is body font and takes the prose.
        text: {
          icon,
          name: facts.name,
          kicker: facts.destination,
          dates: heTripRangeNumeric(facts.startDate, facts.endDate),
        },
        raw: { brandMark: markUrl },
      };
}

/**
 * **A stable short hash of what the cover will draw**, and the reason the cache and the
 * `?v=` on `og:image` need no invalidation between them.
 *
 * The cover is a pure function of these six values, so hashing them content-addresses the
 * picture: rename the trip, change its icon, move its dates, and both the cache key and the
 * URL a crawler stores change with it. Ten hex characters — this is a cache bust, not a
 * security boundary, and the URL it rides on already carries the bearer code.
 */
export function coverSignature(kind: CoverKind, facts: TripPreviewFacts): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        kind,
        facts.name,
        facts.destination,
        facts.startDate,
        facts.endDate,
        facts.travellers,
        facts.icon ?? '',
      ]),
    )
    .digest('hex')
    .slice(0, 10);
}

/**
 * The whole document, ready for `page.setContent`.
 *
 * **`dir="rtl"` and no `data-theme`**, both deliberate and both the cutter's own choices: the
 * app is RTL and half of what these draw is Hebrew, and a PNG has no theme — leaving the
 * attribute off is what pins the artwork to `tokens.css`'s `:root` (light) block.
 *
 * Returns `null` when the cover assets are not in this deploy.
 */
export function coverHtml(kind: CoverKind, facts: TripPreviewFacts): string | null {
  const loaded = assets();
  if (!loaded) return null;
  const slots = slotsFor(kind, facts, loaded.markUrl);
  const body = fillSlots(loaded.covers[kind], slots.text, slots.raw);
  return (
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="UTF-8">` +
    `<style>${inlineFaces('cover', COVER_FACES)}${loaded.css}</style></head>` +
    `<body>${body}</body></html>`
  );
}
