// Single source of truth for provider endpoints/keys/model strings. Both API
// keys live ONLY as Supabase Edge Function secrets (Deno.env) — never shipped to
// the renderer or bundled anywhere client-side. Set them with:
//   npx supabase secrets set ANTHROPIC_API_KEY=...
//   npx supabase secrets set MINIMAX_API_KEY=...
//
// A "model choice" is the stable id the UI toggles between; each maps to a
// provider + concrete model string here. Add a model = add one row.

export type ModelChoice = 'haiku-4.5' | 'minimax-m3'

export interface ProviderConfig {
  provider: 'anthropic' | 'minimax'
  // The concrete model string sent on the wire for this choice.
  model: string
}

// ── Anthropic (existing Haiku 4.5 path) ────────────────────────────────────
export const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_VERSION = '2023-06-01'
export const ANTHROPIC_MODEL = 'claude-haiku-4-5'

// ── MiniMax M3 via OpenRouter (OpenAI-compatible chat/completions) ──────────
// We reach MiniMax M3 through OpenRouter's OpenAI-compatible gateway, so the key
// here is an OpenRouter key, not a direct-MiniMax key. Set it with:
//   npx supabase secrets set MINIMAX_API_KEY=<your OpenRouter key>
export const MINIMAX_API_KEY = Deno.env.get('MINIMAX_API_KEY')
export const MINIMAX_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
export const MINIMAX_MODEL = 'minimax/minimax-m3'
// OpenRouter attribution headers (optional; used for their dashboard/rankings).
export const OPENROUTER_REFERER = 'https://tubeghost.app'
export const OPENROUTER_TITLE = 'TubeGhost Assistant'

// Shared generation budget so both providers behave the same for the UI.
export const MAX_TOKENS = 2048

// Map a UI model choice to its provider + concrete model. Unknown/undefined
// choices fall back to Haiku so the existing path is never broken.
const CHOICES: Record<ModelChoice, ProviderConfig> = {
  'haiku-4.5': { provider: 'anthropic', model: ANTHROPIC_MODEL },
  'minimax-m3': { provider: 'minimax', model: MINIMAX_MODEL }
}

export function resolveModel(choice: unknown): { choice: ModelChoice; config: ProviderConfig } {
  const key = choice === 'minimax-m3' ? 'minimax-m3' : 'haiku-4.5'
  return { choice: key, config: CHOICES[key] }
}
