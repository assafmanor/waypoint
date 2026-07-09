import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Waypoint PWA — installable, RTL, offline-capable (ADR-0007).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
