/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /<repo>/, so the deploy workflow sets VITE_BASE.
// Locally and on Netlify the app lives at the root.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  // The engine worker is an ES module, like the app.
  worker: { format: 'es' },
  plugins: [
    preact(),
    VitePWA({
      // A new version waits until the player taps "Update" (src/ui/UpdateBanner.tsx).
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Dip Lab',
        short_name: 'Dip Lab',
        description: 'Offline stock market simulator. Learn by replaying markets.',
        theme_color: '#0B0D14',
        background_color: '#0B0D14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything the game needs so it runs with zero network after first load.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,bin}'],
        // Update notifications and the background update check (public/sw-update.js);
        // streak reminders (public/sw-reminders.js).
        importScripts: ['sw-update.js', 'sw-reminders.js'],
        // Control the first visit right away so it works offline without a reload.
        clientsClaim: true,
        // The landing page (dist/welcome/, added by scripts/build-site.mjs) is a separate site.
        navigateFallbackDenylist: [/\/welcome(\/|$)/],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Full-run simulations take seconds on CI runners, more with coverage instrumentation.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary', 'json-summary'],
      // The engine is the part that must stay correct; the UI is checked by the e2e smoke test.
      thresholds: {
        'src/engine/**': { statements: 90, branches: 75, functions: 95, lines: 95 },
      },
    },
  },
});
