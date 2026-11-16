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
      registerType: 'autoUpdate',
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
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
