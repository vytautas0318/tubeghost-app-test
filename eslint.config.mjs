import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  // supabase/functions/** are Deno edge functions with their own runtime,
  // globals, and conventions (intentional _-prefixed unused params) — they are
  // not part of the web app's TypeScript project and must not be linted here.
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'supabase/**',
      'scripts/**',
      // Bundled third-party browser-extension assets — not app source.
      'resources/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier
)
