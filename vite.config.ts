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
  // Static assets served at the web root (e.g. /favicon.png). Lives at the repo
  // root, not <root>/public (which would be src/renderer/public), so point Vite
  // at it explicitly — otherwise these files are never copied into the build.
  publicDir: resolve(__dirname, 'public'),
  // Serve assets from the app root; SPA host rewrites all paths → index.html.
  base: '/',
  resolve: {
    // ORDER MATTERS: Vite matches aliases by prefix in declaration order, so
    // the more specific '@flags' / '@renderer' must come before the bare '@'
    // (otherwise '@flags/…' is rewritten by the '@' rule and resolves nowhere).
    alias: {
      // Country flag SVGs (components/Flag.tsx globs these). Aliased because
      // `root` is src/renderer/, so a root-absolute '/node_modules/…' glob
      // would resolve to src/renderer/node_modules and match nothing.
      '@flags': resolve(__dirname, 'node_modules/country-flag-icons/3x2'),
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
    emptyOutDir: true,
    // Country flags are globbed as a whole set (~260 SVGs) but any one page
    // shows a handful. Left to the default 4 KB rule they'd all be inlined as
    // base64 into the main bundle (+230 kB) for flags nobody looks at. Forcing
    // them to separate files keeps the bundle flat — the browser fetches only
    // the flags actually rendered, and caches them. Everything else keeps the
    // default behaviour.
    assetsInlineLimit: (filePath: string) =>
      filePath.includes('country-flag-icons') ? false : undefined
  },
  plugins: [react(), tailwindcss()]
})
