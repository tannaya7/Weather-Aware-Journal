import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// GitHub Pages can't send security headers, so the policy goes in a <meta>
// tag. Built pages only: the dev server injects inline scripts of its own.
// connect-src allows any https origin because the sync server's address can
// be changed in Settings. jsdelivr serves the search-by-meaning engine's
// loader; 'wasm-unsafe-eval' lets that engine run.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "media-src 'self' data: blob:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function securityMeta() {
  return {
    name: 'security-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  // Shown in error reports, so a report says which build it came from.
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: '/Weather-Aware-Journal/',
  plugins: [
    react(),
    securityMeta(),
    VitePWA({
      // 'prompt': a new version waits until the user clicks Refresh in
      // UpdatePrompt, which also registers the service worker itself.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/icon-maskable.svg'],
      manifest: {
        name: 'Weather Journal',
        short_name: 'Weather Journal',
        description: 'A personal journal that remembers the weather with you.',
        theme_color: '#03265f',
        background_color: '#1e4986',
        display: 'standalone',
        start_url: '/Weather-Aware-Journal/',
        scope: '/Weather-Aware-Journal/',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Shows daily reminder notifications (see public/sw-push.js).
        importScripts: ['sw-push.js'],
        globPatterns: ['**/*.{js,css,html,svg}'],
        // The search-by-meaning engine is large and only needed by people
        // who turn that on, so it is cached when first used, not at install.
        globIgnores: ['**/transformers.web-*.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/(transformers\.web|ort-wasm)[^/]*\.(js|wasm)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'semantic-engine',
              expiration: { maxEntries: 6 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/(geocoding-api\.open-meteo\.com|api\.open-meteo\.com)\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather-api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.js',
    // Some tests exercise real timers and storage, and slow down when the
    // whole suite runs at once.
    testTimeout: 20000,
    // Browser tests (Playwright) live in e2e/ and run separately.
    exclude: ['e2e/**', '**/node_modules/**', 'dist/**'],
  },
});
