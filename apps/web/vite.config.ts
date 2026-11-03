import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

import { readFileSync } from 'node:fs';

const BG = '#02040a';
const APP_VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const BUILD_ID = new Date().toISOString();

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION), __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      injectManifest: {
        // the map chunk + MapLibre worker are large; precache them so the map opens offline
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: 'Norðurljós: Aurora Hunter',
        short_name: 'Norðurljós',
        description: 'Should I go out and look for the aurora right now, and where?',
        theme_color: BG,
        background_color: BG,
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/#/tonight',
        categories: ['weather', 'travel', 'photo'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'Tonight', url: '/#/tonight', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Map', url: '/#/map', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Cameras', url: '/#/cameras', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Score widget', url: '/#/widget', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:8787' },
  },
  preview: { proxy: { '/api': 'http://localhost:8787' } },
});
