import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Explicit "update available, reload?" prompt instead of silent
      // auto-update: safer for a collaborative app, since a stale client
      // shouldn't silently keep writing mismatched data shapes into a
      // shared workspace while an update is available.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Listpad',
        short_name: 'Listpad',
        description: 'A shared shopping list',
        display: 'standalone',
        start_url: '/',
        // Matches --color-accent / --color-paper in src/styles/tokens.css
        theme_color: '#3b6ea5',
        background_color: '#fdfdf7',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell only (JS/CSS/HTML/icons/fonts). Firestore's
        // own IndexedDB persistence already handles offline data + queued
        // writes, so Firestore traffic is intentionally not proxied through
        // the service worker.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
      },
    }),
  ],
})
