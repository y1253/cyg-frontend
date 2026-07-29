import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The plugin injects the registration itself, so nothing in src/ imports
      // `virtual:pwa-register` and tsconfig needs no extra `types` entry.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // No `includeAssets` — the workbox globPatterns below already match every
      // png/ico/svg in public/, and listing them twice duplicates precache entries.
      manifest: {
        name: 'CYG Finance',
        short_name: 'CYG',
        description: 'Bookkeeping business management for CYG Finance.',
        // The router's `*` catch-all redirects to /dashboard, and PrivateRoute
        // bounces to /login when signed out — so '/' opens the right screen either way.
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0B1C2C',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // The app uses createBrowserRouter, so unknown paths must fall back to the
        // shell — but every API helper uses a relative '/api' base, and without the
        // denylist the worker would answer those navigations with index.html.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        // Deliberately no runtimeCaching for /api: every screen is live, per-user
        // authenticated data (mail, todos, internal messages), so caching it could
        // serve one user's data after logout. Installable, not offline-capable.
      },
      // Leave the service worker out of `npm run dev`; flip to true to test locally.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
