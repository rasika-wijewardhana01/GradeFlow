import { defineConfig } from 'vite';
import { resolve } from 'path';

// Manual chunk map — keeps large, stable modules in separate browser-cached bundles.
const CHUNK_MAP = {
  'storage':      'src/modules/storage.js',
  'analytics':    'src/modules/analytics.js',
  'exam-manager': 'src/modules/exam-manager.js',
  'splash':       'src/splash-screen.js',
  'tour':         'src/tour.js',
  'swipe':        'src/swipe-gestures.js',
};

export default defineConfig({
  root: '.',

  // public/ contains static assets that Vite copies verbatim to dist/:
  //   • sw.js      — service worker (must be at site root for full-scope control)
  //   • manifest.json — PWA manifest
  //   • icons/     — app icons referenced by manifest + <link rel="apple-touch-icon">
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'src/[name]-[hash].js',
        chunkFileNames: 'src/[name]-[hash].js',
        assetFileNames: 'src/[name]-[hash][extname]',
        // Vite 8 / Rolldown requires a function for manualChunks
        manualChunks(id) {
          for (const [chunkName, modulePath] of Object.entries(CHUNK_MAP)) {
            if (id.includes(modulePath)) return chunkName;
          }
        },
      },
    },
    minify: true,
    sourcemap: true,
    // analytics.js is intentionally large (71 KB source) — silence the warning.
    chunkSizeWarningLimit: 800,
  },

  server: {
    port: 3000,
    open: true,
    hmr: {
      overlay: false,
    },
  },
});
