import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// Relative source import: the app-graph alias below doesn't apply to this
// config file, and shared's dist may not be built yet when dev starts.
import { SERVER_ROUTE_PATTERN } from '../packages/shared/src/server-routes';

// Waypoint PWA — installable, RTL, offline-capable (ADR-0007).
export default defineConfig({
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
    VitePWA({
      registerType: 'autoUpdate',
      // Static assets outside the Vite graph that the SW should precache.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // Without these, a rebuilt SW only takes over after all tabs of the old
      // one close — an offline reload in between would still run stale JS.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Backend-owned navigations (OAuth redirect, /health) must hit the
        // network — the default fallback serves the cached shell for ALL paths.
        navigateFallbackDenylist: [SERVER_ROUTE_PATTERN],
      },
      manifest: {
        name: 'Waypoint · מרכז שליטה לטיול',
        short_name: 'Waypoint',
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
  },
});
