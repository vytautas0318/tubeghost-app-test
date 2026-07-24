// The provider abstraction. ONE internal interface — sendMessage — that the
// request handler calls. It never talks to a provider SDK/endpoint directly;
// each adapter behind this interface owns the wire format for one provider and
// normalizes both the input (system + history + appContext + userMessage) and
// the output ({ text } | { error }) so the rest of the app is model-agnostic.
//
// Adding a provider = write an adapter with the SendMessage signature and route
// to it below. No handler changes.

import { resolveModel, type ModelChoice } from './config.ts'
import { anthropicAdapter } from './adapters/anthropic.ts'
import { minimaxAdapter } from './adapters/minimax.ts'

// One conversation turn, model-agnostic. Adapters translate this into whatever
// shape their provider expects (Anthropic messages[], OpenAI messages[], …).
export interface Turn {
  role: 'user' | 'assistant'
  text: string
}

// The normalized call. Every adapter receives exactly this and returns exactly
// SendMessageResult — differences (auth header, message layout, response path)
// are hidden inside the adapter.
export interface SendMessageInput {
  // Grounding/system instructions (knowledge base + tool catalog + live context).
  systemPrompt: string
  // Extra grounding data to inject the same way for every model. Merged into the
  // system instruction by each adapter so both providers see identical grounding.
  appContext?: string
  // Prior turns, oldest first (excludes the new user message).
  history: Turn[]
  // The user's new message.
  userMessage: string
  // Which model the user picked in the UI.
  model: ModelChoice
}

// Success returns text; failure returns a normalized, user-displayable error.
// Adapters catch their own failures and return { error } — one provider being
// down never throws out of sendMessage.
export interface SendMessageResult {
  text?: string
  error?: string
}

// Adapters implement this. apiKey/model are resolved from config by sendMessage
// so an adapter only concerns itself with the wire call.
export type Adapter = (
  input: SendMessageInput,
  apiKey: string,
  model: string
) => Promise<SendMessageResult>

const ADAPTERS: Record<string, Adapter> = {
  anthropic: anthropicAdapter,
  minimax: minimaxAdapter
}

import { ANTHROPIC_API_KEY, MINIMAX_API_KEY } from './config.ts'

const KEYS: Record<string, string | undefined> = {
  anthropic: ANTHROPIC_API_KEY,
  minimax: MINIMAX_API_KEY
}

// The single entry point. Resolves the picked model to a provider, checks the
// key, and dispatches to that provider's adapter. Always resolves (never
// throws): missing config or a downed provider comes back as { error }.
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const { config } = resolveModel(input.model)
  const apiKey = KEYS[config.provider]
  if (!apiKey) {
    return {
      error:
        config.provider === 'minimax'
          ? 'MiniMax is not configured yet. Switch to Haiku 4.5, or set MINIMAX_API_KEY.'
          : 'The assistant is not configured (missing API key).'
    }
  }
  const adapter = ADAPTERS[config.provider]
  return adapter(input, apiKey, config.model)
}
