import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// Relative source import: the app-graph alias below doesn't apply to this
// config file, and shared's dist may not be built yet when dev starts.
import { SERVER_ROUTE_PATTERN } from '../packages/shared/src/server-routes';
// The product name, defined once for the wordmarks, the <title> and the manifest
// (ADR-0170). Deliberately import-free, so reading it here costs no app graph.
import { APP_NAME, APP_TITLE } from './src/app-name';

/** A production build with no Maps config produces a Map tab with **no map** —
 *  ADR-0121 §2's graceful absence, which is correct behaviour and deliberately
 *  silent in the UI. It is also indistinguishable from a misconfigured deploy, and
 *  that cost one: the vars were set on the service but the Dockerfile did not
 *  declare them as build args, so Vite inlined nothing. Say it where whoever built
 *  the image can see it. Build-only, so it never noises up dev or the test run. */
function warnIfMapsUnconfigured() {
  const missing = ['VITE_GOOGLE_MAPS_BROWSER_KEY', 'VITE_GOOGLE_MAPS_MAP_ID'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length === 0) return;
  console.warn(
    `\n⚠️  Maps build vars missing: ${missing.join(', ')}.\n` +
      '   The Map tab will build fine and render LIST-ONLY (no rendered map).\n' +
      '   These are build-time (Vite inlines them), so a runtime service variable\n' +
      '   is not enough — a Docker build also needs a matching ARG (see Dockerfile),\n' +
      '   and local development reads frontend/.env.local. See architecture/deployment.md.\n',
  );
}

/** `index.html` is served to the browser, so it can't import `APP_NAME` — it carries a
 *  `%APP_TITLE%` token instead, substituted here in both dev and build. Without this the
 *  name would live in two files and drift the first time one of them changed. */
function appTitle() {
  return {
    name: 'app-title',
    transformIndexHtml: (html: string) => html.replaceAll('%APP_TITLE%', APP_TITLE),
  };
}

// The PWA — installable, RTL, offline-capable (ADR-0007).
export default defineConfig(({ command }) => {
  if (command === 'build') warnIfMapsUnconfigured();
  return {
    // Consume @waypoint/shared from source: its built dist is CommonJS (the backend
    // needs CJS), and Vite can't statically detect named value exports through the
    // CJS `__exportStar` helper. Source is ESM — analysable — and gets HMR. Types
    // still resolve to the built .d.ts via node_modules, so typecheck is unaffected.
    resolve: {
      alias: {
        '@waypoint/shared': fileURLToPath(
          new URL('../packages/shared/src/index.ts', import.meta.url),
        ),
      },
    },
    plugins: [
      react(),
      appTitle(),
      VitePWA({
        // Paired with `src/lib/useAppUpdate.ts` (ADR-0181), which is the actual
        // registration: importing `virtual:pwa-register/react` flips the plugin's
        // `injectRegister: 'auto'` to "don't inject", so there is exactly one
        // registration and it has callbacks. Left unset on purpose — pinning it to
        // `false` here would mean NO registration at all if that import ever went.
        //
        // **`'prompt'` is not a drop-in swap**, and the trap is silent: the plugin
        // forces `skipWaiting`/`clientsClaim` on under `autoUpdate` but does not
        // force them OFF under `'prompt'`, so the explicit `true`s below would
        // survive the change, the new SW would keep self-activating, and the
        // `waiting` event that mode's whole prompt hangs off would never fire.
        registerType: 'autoUpdate',
        // Static assets outside the Vite graph that the SW should precache.
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        // Without these, a rebuilt SW only takes over after all tabs of the old
        // one close — an offline reload in between would still run stale JS.
        // What they cost is paid in the tab that is ALREADY open: it keeps running
        // the old build's JS against the new build's precache, which is what
        // `useAppUpdate` exists to tell the user about.
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          // The self-hosted fonts (F-11) do NOT precache on their own. Being in
          // the Vite graph gets them hashed into dist/assets/, which is not the
          // same thing: workbox-build's default globPatterns is
          // `['**/*.{js,wasm,css,html}']`, so a .woff2 sitting right beside the
          // matched .css is silently skipped — the exact offline-fallback-font
          // bug self-hosting was meant to fix, only now with no CDN to fall back
          // to. Overriding replaces that default rather than extending it, so
          // the four original extensions are restated here on purpose.
          // (`includeAssets` is not the knob: it globs `public/`, and these are
          // build outputs.)
          globPatterns: ['**/*.{js,wasm,css,html,woff2}'],
          // Backend-owned navigations (OAuth redirect, /health) must hit the
          // network — the default fallback serves the cached shell for ALL paths.
          navigateFallbackDenylist: [SERVER_ROUTE_PATTERN],
        },
        manifest: {
          name: APP_TITLE,
          short_name: APP_NAME,
          dir: 'rtl',
          lang: 'he',
          theme_color: '#1B2A4A',
          background_color: '#E7EAEF',
          display: 'standalone',
          start_url: '/',
          // Chrome requires a 192px and a 512px icon before it treats the app
          // as installable — with none, "install" produces a browser shortcut
          // that keeps the address bar instead of a standalone window.
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    server: { port: 5173 },
    test: {
      // The Playwright e2e specs (frontend/e2e/*.spec.ts) run under `pnpm e2e`, not
      // vitest — they import @playwright/test and drive a real browser. Keep them
      // out of the jsdom unit run so `pnpm test` doesn't try to execute them.
      exclude: [...configDefaults.exclude, 'e2e/**'],
      /**
       * **The unit suite does not inherit `frontend/.env`.**
       *
       * Vite loads that file for the test run too, so ten specs meant something
       * different on a machine that had followed the quickstart than they did in CI
       * (which has no `.env`) — and they failed there, quietly, for anyone with a
       * working dev setup. Two distinct symptoms, one cause:
       *
       *  - `VITE_API_BASE_URL` turned every same-origin assertion into an absolute
       *    URL. `Avatar.test.tsx`'s own comment already SAID "API_BASE_URL is empty
       *    under test (same-origin)" — it was a stated assumption that nothing made
       *    true, which is the whole reason it went unnoticed.
       *  - `VITE_GOOGLE_MAPS_BROWSER_KEY`/`_MAP_ID` gave `Map.test.tsx` a rendered
       *    map. That file exists to cover the **graceful-absence, list-only** path
       *    (ADR-0121 §2, and `frontend/CLAUDE.md` says it must stay tested as such),
       *    so it deliberately does not mock `lib/map-config` the way
       *    `Map.embedded.test.tsx` does. With keys present it was testing the other
       *    branch, and the branch it names in its own describe block went uncovered.
       *
       * Pinned here rather than in a `.env.test`: the point is that the values are a
       * FACT OF THE SUITE, not a file a developer can shadow — the same reasoning as
       * pinning the clock with `setSimulatedNow` instead of reading the real one. A
       * spec that wants config supplies it by mocking `lib/map-config`, which is
       * visible in the spec that needs it.
       */
      env: {
        VITE_API_BASE_URL: '',
        VITE_GOOGLE_MAPS_BROWSER_KEY: '',
        VITE_GOOGLE_MAPS_MAP_ID: '',
        VITE_GOOGLE_MAPS_MAP_ID_DARK: '',
      },
      /** `vite-plugin-pwa`'s virtual module has no file behind it, and under vitest its id
       *  resolves to `file:///@vite-plugin-pwa/virtual:…`, which Node refuses as a filename.
       *  Any spec whose import graph reaches `lib/useAppUpdate.ts` therefore failed to
       *  COLLECT — no test in the file ran at all — which is a failure mode that looks like
       *  two red filenames and hides ~90 assertions. Aliased to a stub for the unit run;
       *  see `src/test/pwa-register-stub.ts` for why it is here and not a `vi.mock` per spec. */
      alias: {
        'virtual:pwa-register/react': fileURLToPath(
          new URL('./src/test/pwa-register-stub.ts', import.meta.url),
        ),
      },
    },
  };
});
