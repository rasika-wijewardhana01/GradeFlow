import { defineConfig } from 'vite';
import { resolve } from 'path';

// Manual chunk map — only truly self-contained modules go here.
//
// IMPORTANT: exam-manager.js and analytics.js must NOT be split into their
// own chunks. They use bare identifiers (_exams, _activeExamId, EM_STORAGE_KEY,
// students, subjects, marks, results, autoIndexCounter, etc.) that live in the
// autosave.js / state.js module closures in the main bundle. When Vite extracts
// them into separate ES module chunks those bare names become ReferenceErrors
// because each chunk has its own strict-mode module scope.
//
// splash, tour, and swipe are safe to split because they are genuinely
// self-contained IIFEs with no cross-module closure dependencies.
const CHUNK_MAP = {
  'splash': 'src/splash-screen.js',
  'tour':   'src/tour.js',
  'swipe':  'src/swipe-gestures.js',
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
    // exam-manager + analytics are now in the main bundle (see CHUNK_MAP comment).
    // The main chunk is intentionally large — silence the warning.
    chunkSizeWarningLimit: 1200,
  },

  server: {
    port: 3000,
    open: true,
    hmr: {
      overlay: false,
    },
  },
});
