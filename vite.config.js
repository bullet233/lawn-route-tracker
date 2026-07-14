import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the site under /<repo-name>/, so the production build
// needs a matching base path. If you name the repo something other than
// "lawn-route-tracker", change BASE (or set VITE_BASE when building).
const BASE = process.env.VITE_BASE || '/lawn-route-tracker/'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? BASE : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.svg'],
      manifest: {
        name: 'Lawn Route Tracker',
        short_name: 'Lawn Route',
        description: 'Route planning, GPS visit timing, and EPA records for a solo lawn-care operator.',
        theme_color: '#10b981',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // precache the built app shell + assets so it opens offline after first load
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // the live screen must work offline; map/weather calls are network-only
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://maps.googleapis.com',
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://api.open-meteo.com',
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
}))
