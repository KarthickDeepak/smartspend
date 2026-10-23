import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const brandName = env.VITE_APP_NAME?.trim() || 'SmartSpend';
  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'smartspend-logo.png'],
      manifest: {
        name: `${brandName} — Family Budget Tracker`,
        short_name: brandName,
        description: 'Track family spending, budgets, and saving goals.',
        theme_color: '#101c3a',
        background_color: '#f5f7fb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true
      }
    })
  ],
  test: { include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['./src/test/setup.ts'], environment: 'jsdom' },
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' }
  };
});
