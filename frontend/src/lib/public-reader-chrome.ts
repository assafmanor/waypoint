import { useEffect } from 'react';

/**
 * **The public reader is a document, not the app** (owner, 2026-08-31: _"the live share should
 * not inherit some of the app's quirks: it should be able to refresh, zoom in/out etc."_).
 *
 * Three separate mechanisms turn zoom and pull-to-refresh off app-wide, and all three are
 * right for the app and wrong for `/s/<code>`:
 *
 *   1. the viewport meta's `user-scalable=no, maximum-scale=1` (honoured by Android Chrome);
 *   2. `index.html`'s gesture blocker (iOS Safari ignores the meta, so pinch is suppressed
 *      in script);
 *   3. `tokens.css`'s `overscroll-behavior-y: contain` and `touch-action: manipulation`.
 *
 * ADR-0062 chose all of that to make the app feel native, and a shared itinerary is not the
 * app: it is a page a stranger opens in a browser tab, often standing up, sometimes with
 * reading glasses they do not have on them. A document you cannot enlarge is a document some
 * people cannot read, and a page that swallows a pull is a page that looks stuck when the
 * network drops.
 *
 * So the screen announces itself on `<html>` for as long as it is mounted, and the other two
 * layers key off that attribute — one switch, three consumers, and the app's own posture
 * restored on unmount. The meta is swapped rather than removed because a viewport meta is not
 * re-parsed when deleted; the original string is captured first so this survives any future
 * edit to `index.html` without a second copy of it here.
 */
const READER_VIEWPORT =
  'width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content';

export function usePublicReaderChrome(): void {
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const appViewport = meta?.content;

    root.setAttribute('data-public-reader', '');
    if (meta) meta.content = READER_VIEWPORT;

    return () => {
      root.removeAttribute('data-public-reader');
      if (meta && appViewport !== undefined) meta.content = appViewport;
    };
  }, []);
}
