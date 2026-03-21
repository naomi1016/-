import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          name: '北圖本月新書通報',
          short_name: '北圖新書',
          description: '台北市立圖書館本月新進書目，支援語義搜尋與色系篩選',
          theme_color: '#10b981',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          lang: 'zh-TW',
          icons: [
            { src: 'pwa-192x192.png',         sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png',         sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // books.json 體積大，使用 stale-while-revalidate：先用快取，背景更新
          runtimeCaching: [
            {
              urlPattern: /\/books\.json$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'books-data',
                expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24 小時
              },
            },
            // 書封圖片：快取優先，最多 500 張
            {
              urlPattern: /\.(jpg|jpeg|png|webp|gif)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'cover-images',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
          ],
          // neural_embeddings.json 太大（25MB），不預先快取
          globIgnores: ['**/neural_embeddings.json'],
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // @xenova/transformers 使用 WASM，需排除預先打包
    optimizeDeps: {
      exclude: ['@xenova/transformers'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // 本地開發：/api/* 代理到 vercel dev（預設 port 3000）
      proxy: {
        '/api': { target: 'http://localhost:3000', changeOrigin: true },
      },
    },
  };
});
