import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// The product name, defined once for the wordmarks, the <title> and the manifest
// (ADR-0170). Deliberately import-free, so reading it here costs no app graph.
import { APP_NAME, APP_TITLE } from './src/app-name';

/**
 * **What build is this?** — the question a staging tester cannot otherwise answer, and the
 * reason the answer is computed here rather than typed into an env var: a label somebody has
 * to remember to bump is a label that eventually lies, and a build indicator that lies is
 * worse than none. Railway exports the commit itself, so the badge can just read it.
 *
 * `VITE_BUILD_LABEL` still wins when set, for a deploy that wants to say something else.
 * Falls back to the local git checkout so `pnpm dev` shows a real value too, and to
 * `'dev'` when git is unavailable (a Docker build without the .git directory).
 */
function buildLabel(): string {
  const git = (args: string) => {
    try {
      return execSync(`git ${args}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  };
  // **The timestamp is the part that always works, so it is never conditional.** Railway's
  // `RAILWAY_GIT_*` are provided to the SERVICE and are not forwarded into the Docker build,
  // and the build context carries no `.git` — so the first version of this printed
  // `unknown 08-14 09:22` on staging, with the commit silently missing. The clock is what
  // answered the actual question ("did my redeploy land?"); the commit is a bonus that
  // arrives only when something can supply it.
  //
  // Minute precision: two deploys of the same commit are a real thing to tell apart, and
  // seconds are noise on a badge read off a phone screen.
  const at = new Date().toISOString().slice(5, 16).replace('T', ' ');
  // `VITE_BUILD_LABEL` is how a Railway deploy supplies the commit, since it can interpolate
  // the provided vars itself: set it to `${{RAILWAY_GIT_BRANCH}} ${{RAILWAY_GIT_COMMIT_SHA}}`.
  // Read from the environment first, then the local checkout (so `pnpm dev` shows a real
  // value), and simply omitted when neither can answer — an honest gap beats "unknown".
  const explicit = process.env.VITE_BUILD_LABEL?.trim();
  const sha = (process.env.RAILWAY_GIT_COMMIT_SHA || git('rev-parse HEAD')).slice(0, 7);
  const branch = process.env.RAILWAY_GIT_BRANCH || git('rev-parse --abbrev-ref HEAD');
  const commit = explicit || [branch, sha].filter(Boolean).join(' ');
  return [commit, at].filter(Boolean).join(' · ');
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
export default defineConfig(() => {
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
    /** **MapLibre ships a web worker, and the dep optimizer breaks it** (ADR-0186 Phase 2).
     *  Pre-bundling rewrites `maplibre-gl` into `.vite/deps/` but does not emit
     *  `maplibre-gl-worker.mjs` beside it, so `pnpm dev` logs _"the file does not exist … the
     *  dependency might be incompatible with the dep optimizer"_ and the renderer's worker cannot
     *  be fetched — which on the dev server is a map that never paints a tile. Excluded rather
     *  than worked around, which is what Vite's own message asks for; production is unaffected
     *  (the optimizer is a dev-only step) and the build already verified clean. */
    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },
    plugins: [
      react(),
      appTitle(),
      VitePWA({
        // Paired with `src/lib/useAppUpdate.ts` (ADR-0181, ADR-0185), which is the
        // actual registration: importing `virtual:pwa-register/react` flips the
        // plugin's `injectRegister: 'auto'` to "don't inject", so there is exactly
        // one registration and it has callbacks. Left unset on purpose — pinning it
        // to `false` here would mean NO registration at all if that import ever went.
        //
        // **`'prompt'` is what makes the swap ATOMIC** (ADR-0185 §1). A waiting SW
        // leaves the old precache intact, so the open page keeps a complete,
        // self-consistent build instead of running old JS against a precache that has
        // already dropped every chunk it has not loaded yet. That mixed state is what
        // blanked the app after a deploy. Its other half — not calling
        // `self.skipWaiting()`, and answering a SKIP_WAITING message instead — used to
        // be `workbox.skipWaiting: false` here and is now four lines of `src/sw.ts`,
        // because `injectManifest` has no template to configure.
        registerType: 'prompt',
        // **The worker is ours** (ADR-0197 §8): a `push` listener cannot be added to a
        // generated one, so `generateSW` becomes `injectManifest` and everything the
        // template used to emit — the SKIP_WAITING listener, `clientsClaim`,
        // `cleanupOutdatedCaches`, the navigation fallback and its denylist, the
        // glyph rule — lives in `src/sw.ts`. Read that file's header before changing
        // anything here; a line lost in this move degrades the PWA silently.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        // Static assets outside the Vite graph that the SW should precache.
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        // Under `injectManifest` this block is manifest GENERATION only — which files
        // are precached. How the worker behaves is `src/sw.ts`.
        injectManifest: {
          // **`iife`, not the default `es`.** In a production build the plugin registers
          // the worker as `type: 'classic'` (it hard-codes that outside dev, see its
          // `dist/index.js` `__TYPE__` replacement), so an ES-module worker parses only
          // as long as the bundle happens to emit no top-level `import`/`export`/`await`.
          // Today it emits none and both formats work — verified by building each and
          // diffing — so this is not a fix for a live bug; it closes the trap, because
          // the day one appears the failure is a worker that never installs, with a
          // green build and no error anywhere. `iife` cannot express the syntax that
          // would break, which is the only guarantee worth having here.
          rollupFormat: 'iife',
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
    // A distinct global rather than an `import.meta.env.VITE_*` member: Vite inlines those
    // itself from the environment, so defining one here would be two replacements fighting
    // over the same expression. The BADGE is still gated by a real env var
    // (`VITE_BUILD_BADGE`) — this is only the text it shows. See `ui/BuildBadge.tsx`.
    define: { __BUILD_LABEL__: JSON.stringify(buildLabel()) },
    test: {
      // The Playwright e2e specs (frontend/e2e/*.spec.ts) run under `pnpm e2e`, not
      // vitest — they import @playwright/test and drive a real browser. Keep them
      // out of the jsdom unit run so `pnpm test` doesn't try to execute them.
      exclude: [...configDefaults.exclude, 'e2e/**'],
      /** The unit suite does not inherit `frontend/.env`: same-origin URL assertions must not
       * change meaning on a machine that followed the local quickstart. */
      env: {
        VITE_API_BASE_URL: '',
        // Same reason as the API URL above: a developer with this set locally would
        // otherwise flip `BuildBadge`'s default case in their run and not in CI.
        VITE_BUILD_BADGE: '',
        // Third instance of the same rule, and this one has teeth: a developer testing
        // push on their own device sets it, and it would then mount `PushDebugPanel` into
        // every `UserSettings` render in their unit run and nobody else's.
        VITE_PUSH_DEBUG: '',
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
