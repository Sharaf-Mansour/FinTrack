import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [
          { name: 'chart-renderer', test: /node_modules[\\/]zrender[\\/]/ },
          { name: 'echarts', test: /node_modules[\\/]echarts[\\/]/ }
        ] }
      }
    }
  },
  plugins: [svelte(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'icons/*.png'],
    manifest: {
      id: '/', name: 'FinTrack — Your everyday money', short_name: 'FinTrack',
      description: 'Private, offline income and spending tracking.',
      start_url: '/', scope: '/', display: 'standalone',
      background_color: '#090a0e', theme_color: '#090a0e',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'], navigateFallback: '/index.html', cleanupOutdatedCaches: true }
  })]
});
