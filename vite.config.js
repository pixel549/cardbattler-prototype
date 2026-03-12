import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// When built in GitHub Actions, GITHUB_REPOSITORY is "owner/reponame".
// We derive the base path from it so assets resolve correctly on GitHub Pages
// (e.g. https://jaste.github.io/cardbattler/ needs base = '/cardbattler/').
// Locally, base stays '/' so dev server works without any changes.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base      = repoName ? `/${repoName}/` : '/';
const playtestDir = path.resolve(process.cwd(), 'playtest_sessions');

function sanitiseSessionId(sessionId) {
  return String(sessionId || 'session')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .slice(0, 80);
}

function buildPlaytestHandler() {
  return (req, res, next) => {
    if (req.method !== 'POST' || req.url !== '/__playtest/upload') {
      next();
      return;
    }

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        const payload = JSON.parse(raw);
        const sessionId = sanitiseSessionId(payload.sessionId);
        const outputPath = path.join(playtestDir, `${sessionId}.json`);
        const now = new Date().toISOString();

        fs.mkdirSync(playtestDir, { recursive: true });

        let existing = {};
        if (fs.existsSync(outputPath)) {
          try {
            existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
          } catch {
            existing = {};
          }
        }

        const nextPayload = {
          sessionId,
          screen: payload.screen ?? existing.screen ?? 'unknown',
          startedAt: existing.startedAt ?? payload.startedAt ?? now,
          updatedAt: now,
          meta: {
            ...(existing.meta || {}),
            ...(payload.meta || {}),
          },
          uploads: [
            ...(existing.uploads || []),
            {
              receivedAt: now,
              reason: payload.reason ?? 'unspecified',
              eventCount: Array.isArray(payload.events) ? payload.events.length : 0,
            },
          ],
          events: [
            ...(existing.events || []),
            ...(Array.isArray(payload.events) ? payload.events : []),
          ],
        };

        fs.writeFileSync(outputPath, JSON.stringify(nextPayload, null, 2), 'utf8');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, file: outputPath, events: nextPayload.events.length }));
      } catch (error) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : 'Unable to save playtest payload',
        }));
      }
    });
  };
}

function playtestCapturePlugin() {
  const handler = buildPlaytestHandler();
  return {
    name: 'cardbattler-playtest-capture',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function getManualChunkName(id) {
  const normalized = id.split(path.sep).join('/');

  if (normalized.includes('/node_modules/react/') || normalized.includes('/node_modules/react-dom/')) {
    return 'react-vendor';
  }
  if (normalized.includes('/node_modules/')) {
    return 'vendor';
  }
  if (normalized.includes('/src/data/gamedata.json')) {
    return 'gamedata';
  }
  if (
    normalized.includes('/src/components/CombatScreen.jsx')
    || normalized.includes('/src/game/engine.js')
    || normalized.includes('/src/game/game_core.js')
    || normalized.includes('/src/game/combatMeta.js')
    || normalized.includes('/src/game/combatDirectives.js')
    || normalized.includes('/src/game/sounds.js')
  ) {
    return 'combat-systems';
  }
  if (
    normalized.includes('/src/components/AIDebugPanel.jsx')
    || normalized.includes('/src/game/aiPlayer.js')
    || normalized.includes('/src/game/aiPlaystyles.js')
  ) {
    return 'ai-tools';
  }
  if (
    normalized.includes('/src/components/MainMenuHub.jsx')
    || normalized.includes('/src/game/tutorial.js')
    || normalized.includes('/src/playtest/visualScenes.js')
    || normalized.includes('/src/game/runProfiles.js')
    || normalized.includes('/src/game/metaProgression.js')
    || normalized.includes('/src/game/achievements.js')
    || normalized.includes('/src/game/dailyRun.js')
    || normalized.includes('/src/game/bossIntel.js')
  ) {
    return 'progression-systems';
  }
  return null;
}

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return getManualChunkName(id);
        },
        assetFileNames: (assetInfo) => {
          const originalName = assetInfo.names?.[0] ?? assetInfo.name ?? '';
          if (/\.(png|jpe?g|gif|svg|webp|avif)$/i.test(originalName)) {
            return 'assets/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  plugins: [
    react(),
    playtestCapturePlugin(),
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
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        // Precache the app shell only. Artwork is runtime-cached so deploys
        // stay lightweight and installed PWAs update promptly on phones.
        globPatterns: ['**/*.{js,css,html,svg,ico,json,woff,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'cardbattler-images-v1',
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
});
