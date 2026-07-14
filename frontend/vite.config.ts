import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
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
        icons: [],
      },
    }),
  ],
  server: { port: 5173 },
});
