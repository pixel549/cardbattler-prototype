import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// When built in GitHub Actions, GITHUB_REPOSITORY is "owner/reponame".
// We derive the base path from it so assets resolve correctly on GitHub Pages
// (e.g. https://jaste.github.io/cardbattler/ needs base = '/cardbattler/').
// Locally, base stays '/' so dev server works without any changes.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base      = repoName ? `/${repoName}/` : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: ['icon-192.png', 'icon-512.png', 'vite.svg'],

      // ── Web App Manifest ──────────────────────────────────────────────────
      manifest: {
        name: 'CardBattler',
        short_name: 'CardBattler',
        description: 'AI-powered card-battler roguelike — play & balance offline',
        theme_color: '#0d0d18',
        background_color: '#0d0d18',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },

      // ── Workbox service-worker config ──────────────────────────────────────
      workbox: {
        // Precache the full app shell + all card art.
        // Images were resized to ~60 KB JPEGs (total ~31 MB), so they are
        // small enough to fully precache — the game is then playable offline
        // after the very first load, even on a slow connection.
        globPatterns: ['**/*.{js,css,html,svg,ico,json,woff,woff2,jpg,jpeg,png}'],
        // 50 MB limit to accommodate the image set (~31 MB) + JS bundle
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
      },
    }),
  ],
});
