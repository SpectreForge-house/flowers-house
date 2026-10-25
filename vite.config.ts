import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative asset URLs keep the same build working on the web and in Electron,
  // where the app:// protocol serves dist/.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('recharts') ||
            id.includes('d3-') ||
            id.includes('victory-vendor') ||
            id.includes('react-is') ||
            id.includes('react-smooth') ||
            id.includes('recharts-scale') ||
            id.includes('eventemitter3') ||
            id.includes('tiny-invariant') ||
            id.includes('/lodash/') ||
            id.includes('/clsx/')
          ) return 'charts';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('react-router') || id.includes('@remix-run')) return 'router';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react-vendor';
          if (id.includes('date-fns')) return 'date-fns';
          if (id.includes('lucide-react')) return 'icons';
          return 'vendor';
        },
      },
    },
  },
})
