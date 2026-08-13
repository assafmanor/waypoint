// A lazy route that heals itself when its chunk is gone (ADR-0185).
//
// The failure this exists for: a deploy replaces `dist`, so every
// `assets/*-<oldhash>.js` stops existing on the server. Any page still holding
// the old build's chunk graph then gets a 404 on the next route it opens, the
// dynamic import rejects, and — because the throw surfaces through `React.lazy`
// with nothing above it that catches — React unmounts the whole tree. A blank
// page, no error, no way back.
//
// ADR-0185's service-worker change is what stops the page and the precache from
// disagreeing in the first place, and this is the belt to that pair of braces: it
// also covers the cases the SW never sees — the browser holding a stale document,
// a chunk lost between deploys, an ordinary flaky fetch abroad.
//
// **One reload, then stop.** A reload cures a stale chunk (the fresh document
// names chunks that exist) and cannot cure a chunk that was never deployed, so
// retrying past the first is a spin, not a recovery. The cooldown lives in
// `sessionStorage`, which is per-tab and dies with it — and if storage refuses
// (Safari private mode), we cannot tell a first attempt from a tenth and so do
// not reload at all; the boundary shows a recoverable error instead.
import { lazy } from 'react';
import { CHUNK_RELOAD_COOLDOWN_MS } from '../constants';
import { getNow } from './useClock';

const RELOAD_STAMP_KEY = 'waypoint:chunk-reload';

function healedRecently(): boolean {
  try {
    const stamp = Number(window.sessionStorage.getItem(RELOAD_STAMP_KEY));
    if (!stamp) return false;
    return getNow() - stamp < CHUNK_RELOAD_COOLDOWN_MS;
  } catch {
    // No storage means no loop detection, so treat every attempt as a repeat.
    return true;
  }
}

function stampHeal(): void {
  try {
    window.sessionStorage.setItem(RELOAD_STAMP_KEY, String(getNow()));
  } catch {
    /* handled by healedRecently refusing to reload without storage */
  }
}

/** Exported for the boundary's copy, and for the test that proves one reload. */
export function healChunkFailure(error: unknown): Promise<never> {
  if (healedRecently()) return Promise.reject(error);
  stampHeal();
  window.location.reload();
  // The reload is asynchronous. Never settling keeps the Suspense fallback up
  // rather than flashing an error state onto a document that is already leaving.
  return new Promise<never>(() => {});
}

/** `React.lazy` for a route chunk: identical to use, recovers from a build that
 *  moved underneath the page. Every code-split route goes through this, not
 *  `lazy` directly — a route that skips it is the one that blanks the app. */
//
// Typed as `typeof lazy` rather than with a generic of its own: React's signature
// is `<T extends ComponentType<any>>`, and every hand-written restatement of that
// either loses the call site's props (so `<MapView>` stops being type-checked) or
// needs an `any` this repo does not otherwise spend. Borrowing the declaration
// verbatim keeps both.
export const lazyRoute: typeof lazy = (load) => lazy(() => load().catch(healChunkFailure));
