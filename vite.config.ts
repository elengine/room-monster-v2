import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version) },
  build: { target: 'es2022' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // メインJS約2.7MBをプリキャッシュ対象へ
        globPatterns: ['**/*.{js,css,html,webmanifest}'],
      },
      manifest: {
        name: 'おへやモンスター',
        short_name: 'おへやモンスター',
        description: '部屋の中でモンスターを捕まえて図鑑を集めるAR風ゲーム',
        start_url: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        lang: 'ja',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
