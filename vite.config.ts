import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Plain Vite config for the standalone React SPA (replaces electron.vite.config.ts).
//
// `root` points at src/renderer/ — the directory that holds index.html and src/ —
// so the existing renderer tree keeps working in place with no file moves. The
// physical flatten (src/renderer/src → src/) is deferred to the Phase 5 cleanup.
//
// The `@` / `@renderer` aliases mirror the old electron-vite renderer config.
// Renderer modules reach the shared types via relative `../../../shared/*` paths,
// which resolve to <repo>/src/shared under this root.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  // `root` is src/renderer/, but the .env lives at the repo root — point Vite's
  // env loader there so VITE_* vars are picked up (envDir otherwise defaults to
  // `root` and would miss the repo-root .env).
  envDir: __dirname,
  // Serve assets from the app root; SPA host rewrites all paths → index.html.
  base: '/',
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  build: {
    // Emit into <repo>/dist rather than src/renderer/dist.
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  plugins: [react(), tailwindcss()]
})
