import { sep } from 'node:path';
import type { ServerResponse } from 'node:http';

/**
 * Cache headers for the built PWA (ADR-0185).
 *
 * One invariant: **the shell must never outlive the assets it names.** `index.html`
 * carries the hashed filenames of the current build and a deploy deletes the
 * previous build's files, so a shell served from any cache after a deploy points
 * at bytes that no longer exist — a blank page with no JavaScript running, and so
 * no way for the app to say anything about it.
 *
 * `express.static`'s default (`public, max-age=0`) already forces revalidation, so
 * this is not the cure for that freeze — the service worker was (ADR-0185). It is
 * stated explicitly because the SW change deliberately keeps serving a whole old
 * build for a while, which promotes this from incidental to load-bearing.
 *
 * The other half is the trade `max-age=0` gets wrong: Vite fingerprints everything
 * under `/assets/`, so those bytes are immutable by construction and were paying a
 * conditional GET each anyway — a full round trip per asset, on the weak
 * connectivity abroad the code-splitting exists for.
 */
const IMMUTABLE_ASSETS_DIR = `${sep}assets${sep}`;
const ONE_YEAR_S = 31_536_000;

/** Revalidate every time. Not `no-store`: a 304 is still cheap and still offline-safe. */
export const REVALIDATE = 'no-cache';
export const IMMUTABLE = `public, max-age=${ONE_YEAR_S}, immutable`;

/** `express.static`'s `setHeaders` hook. Takes the on-disk path, not the URL. */
export function setStaticCacheHeaders(res: ServerResponse, filePath: string): void {
  res.setHeader('Cache-Control', filePath.includes(IMMUTABLE_ASSETS_DIR) ? IMMUTABLE : REVALIDATE);
}
