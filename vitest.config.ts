import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Vitest config for the standalone SPA. Only the framework-free / renderer
// pure-logic suites run — the Electron main-process tests (api-server, mcp)
// belong to dropped features and are removed in Phase 6.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/renderer/src/lib/__tests__/**/*.test.ts',
      // Pure-logic suites that live beside their page module (batch naming).
      'src/renderer/src/pages/**/__tests__/**/*.test.ts',
      'src/shared/**/*.test.ts',
      // MCP relay: contract (pure) + api server-libs (crypto, fake-Redis integ).
      'lib/mcp/__tests__/**/*.test.ts',
      'api/_lib/__tests__/**/*.test.ts'
    ],
    globals: true
  },
  resolve: {
    alias: {
      // Mirror the app aliases so renderer-side units resolve the same
      // specifiers the app does. `@shared` is the pricing module shared with
      // the serverless functions — billing tests import it directly.
      // Exact match only: '@/lib/automations/…' is a DIFFERENT, desktop-only
      // directory that must keep resolving inside the host app.
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  }
})
