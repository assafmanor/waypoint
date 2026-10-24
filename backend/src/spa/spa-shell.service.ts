import { existsSync, readFileSync } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_FRONTEND_URL, FRONTEND_URL } from '../common/env';
import { SPA_INDEX } from './spa-paths';

/**
 * **The built PWA shell, answered with its social meta already in it** (ADR-0220).
 *
 * The whole reason this exists on the server: a link-preview crawler **runs no JavaScript**.
 * WhatsApp, iMessage, Slack and Twitter fetch the document, read `<head>`, and leave — so a
 * React app that sets `og:*` after mount sets them for nobody. `frontend/index.html` carries
 * a `<!--%SOCIAL_META%-->` marker and this service replaces it per request.
 *
 * It is string-in, string-out on purpose. Resolving a trip behind an invite or share code is
 * `SpaShellController`'s job, because that is the part that touches the database and needs a
 * throttle; this half has no dependencies and is therefore the half worth unit-testing
 * exhaustively — which matters, because its one job is to interpolate **trip content a
 * stranger typed** into a document.
 */
@Injectable()
export class SpaShellService {
  private readonly logger = new Logger(SpaShellService.name);
  private template: string | null = null;

  /** False in dev and test, where the built PWA does not exist (ADR-0020) and every route
   *  answers JSON. Read on each call rather than cached, so a test can create the file. */
  available(): boolean {
    return existsSync(SPA_INDEX);
  }

  /**
   * **The origin the crawler must be given, because `og:image` and `og:url` cannot be
   * relative.** Every consumer resolves them against nothing and drops them.
   *
   * `FRONTEND_URL` first, which in production is the canonical host
   * `canonicalHostMiddleware` has already redirected to — so by the time a request reaches
   * here the two agree, and preferring the env var means a preview never advertises the
   * leftover `*.up.railway.app` hostname a crawler happened to arrive on. The request's own
   * host is the fallback, which is what makes a preview branch or a local build work at all.
   */
  origin(headers: Record<string, unknown>): string {
    const configured = process.env[FRONTEND_URL]?.trim();
    if (configured) return configured.replace(/\/+$/, '');
    const host = firstHeader(headers['x-forwarded-host']) ?? firstHeader(headers['host']);
    if (!host) return DEFAULT_FRONTEND_URL;
    const proto = firstHeader(headers['x-forwarded-proto']) ?? 'https';
    return `${proto}://${host}`;
  }

  /**
   * The shell for one request. `meta` is already resolved; this only renders it.
   *
   * Returns `null` when there is no built shell to serve, so a caller in dev falls through
   * to whatever it would have done before rather than serving an empty document.
   */
  render(meta: ShareMeta, origin: string): string | null {
    const template = this.load();
    if (!template) return null;
    return (
      template
        .replace(MARKER, socialMeta(meta, origin))
        // The browser tab, which is not the same string as `og:title` and is worth setting
        // anyway: nothing in the app writes `document.title` (checked), so an invite opened in
        // a tab keeps saying the trip's name instead of the app's tagline.
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    );
  }

  private load(): string | null {
    if (this.template !== null) return this.template;
    if (!this.available()) return null;
    const html = readFileSync(SPA_INDEX, 'utf8');
    if (!html.includes(MARKER)) {
      // Not fatal — the app still works, it just shares badly — but it must not be silent:
      // the marker lives in a file the frontend owns and a rename there would otherwise
      // remove every preview in production with nothing failing anywhere.
      this.logger.error(
        `${SPA_INDEX} has no ${MARKER} — link previews will fall back to the built-in tags`,
      );
    }
    this.template = html;
    return html;
  }
}

/** The marker `frontend/index.html` carries in `<head>`. An HTML comment, so a build served
 *  by anything other than this server (or `pnpm dev`) is merely tag-less, never broken. */
const MARKER = '<!--%SOCIAL_META%-->';

/** What a preview says. `imagePath` is root-relative; the origin is added at render time. */
export interface ShareMeta {
  title: string;
  description: string;
  /** Root-relative, e.g. `/og-cover.png`. */
  imagePath: string;
  /** The canonical URL of the page being previewed, root-relative. */
  path: string;
  /** `og:image:alt`, and it is not optional: a preview card is an image with text baked into
   *  it, so a screen reader has nothing without this. */
  imageAlt: string;
  /** `false` for a bearer link (`/join/<code>`, `/s/<code>`), which must never be indexed —
   *  the code is the credential (ADR-0213 §5). The response headers carry `X-Robots-Tag`
   *  too; this is the half a crawler that ignores headers still reads. */
  indexable: boolean;
}

function socialMeta(meta: ShareMeta, origin: string): string {
  const url = `${origin}${meta.path}`;
  const image = `${origin}${meta.imagePath}`;
  const tags: [string, string, string][] = [
    ['name', 'description', meta.description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Travelive'],
    ['property', 'og:locale', 'he_IL'],
    ['property', 'og:url', url],
    ['property', 'og:title', meta.title],
    ['property', 'og:description', meta.description],
    ['property', 'og:image', image],
    // Declared, so a card renders large on the first fetch. Without them WhatsApp has to
    // download the image before it knows the aspect, and a slow fetch degrades to the small
    // thumbnail layout — the one the cover was measured against and rejected.
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:image:type', 'image/png'],
    ['property', 'og:image:alt', meta.imageAlt],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', meta.title],
    ['name', 'twitter:description', meta.description],
    ['name', 'twitter:image', image],
    ['name', 'twitter:image:alt', meta.imageAlt],
  ];
  if (!meta.indexable) tags.push(['name', 'robots', 'noindex, nofollow, noarchive']);
  return tags
    .map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`)
    .join('\n    ');
}

/**
 * **Every value above is trip content somebody typed**, so all five characters go — not the
 * three that "look like markup".
 *
 * A trip named `Osaka" /><script>…` would otherwise close the attribute and open a tag, and
 * the payload reaches here through an invite code any member can mint. `&` is first or it
 * re-escapes the escapes; `'` is included because it is a legal attribute delimiter even
 * though this renderer only emits double quotes, and relying on that is how the next edit
 * introduces the hole.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Express gives a repeated header as an array; a spoofed `X-Forwarded-Host: a, b` arrives
 *  as one comma-joined string. Take the first value either way, and never trust more of it
 *  than the first hop (`trust proxy` is 1 in production for the same reason). */
function firstHeader(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const first = raw.split(',')[0]?.trim();
  return first || undefined;
}
