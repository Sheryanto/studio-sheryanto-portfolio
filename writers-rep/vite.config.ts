import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Relative base so the build works from any static path (and later inside a Capacitor WebView).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): never reload the page under the writer's fingers.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: './',
        name: "Writer's Rep — تمرين الكتابة",
        short_name: "Writer's Rep",
        description: 'مدرّب كتابة شخصي: تمارين يومية، حفظ تلقائي، ومتابعة صارمة.',
        lang: 'ar',
        dir: 'rtl',
        start_url: './#/today',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e0f11',
        theme_color: '#0e0f11',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // App shortcuts (long-press on the launcher icon). This is NOT a home-screen widget.
        shortcuts: [
          { name: 'ابدأ جلسة اليوم', short_name: 'ابدأ', url: './#/start', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
