// MiniMax M3 adapter — behind the same sendMessage interface. MiniMax exposes an
// OpenAI-compatible chat/completions endpoint, so:
//   - the system prompt is a { role: "system" } message at the START of messages
//   - response text is at data.choices[0].message.content
//   - auth is a Bearer token header
//
// Base URL + model string are clearly-marked constants in config.ts — fill them
// in from MiniMax's current docs. The key is passed in by the provider layer
// (edge secret MINIMAX_API_KEY); this file never reads env or picks a model.

import {
  MINIMAX_ENDPOINT,
  MAX_TOKENS,
  OPENROUTER_REFERER,
  OPENROUTER_TITLE
} from '../config.ts'
import type { Adapter, SendMessageInput } from '../provider.ts'

// Grounding is folded into the system message identically to the Anthropic path
// so both models receive the same instructions and grounded data.
function composeSystem(input: SendMessageInput): string {
  return input.appContext
    ? `${input.systemPrompt}\n\nCURRENT APP CONTEXT:\n${input.appContext}`
    : input.systemPrompt
}

export const minimaxAdapter: Adapter = async (input, apiKey, model) => {
  // Normalize model-agnostic history into OpenAI-style messages, with the system
  // prompt as the first { role: "system" } message.
  const messages = [
    { role: 'system' as const, content: composeSystem(input) },
    ...input.history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user' as const, content: input.userMessage }
  ]

  const body = {
    model,
    max_tokens: MAX_TOKENS,
    messages
  }

  try {
    let res: Response
    try {
      res = await fetch(MINIMAX_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          // OpenRouter attribution (optional; ignored by non-OpenRouter gateways).
          'HTTP-Referer': OPENROUTER_REFERER,
          'X-Title': OPENROUTER_TITLE
        },
        body: JSON.stringify(body)
      })
    } catch (e) {
      return { error: `Could not reach MiniMax M3: ${(e as Error).message}` }
    }

    if (!res.ok) {
      if (res.status === 429) {
        return { error: 'MiniMax M3 is rate-limited right now. Try again shortly.' }
      }
      const detail = await errorDetail(res)
      return { error: `MiniMax M3 error (${res.status})${detail ? `: ${detail}` : ''}` }
    }

    let json: unknown
    try {
      json = await res.json()
    } catch {
      return { error: 'MiniMax M3 returned an unreadable response.' }
    }

    const text = extractText(json)
    if (!text) return { error: 'MiniMax is unavailable, try again.' }
    return { text }
  } catch (e) {
    // Any unexpected failure normalizes to { error } so MiniMax being down never
    // breaks the panel.
    return { error: `MiniMax is unavailable, try again. (${(e as Error).message})` }
  }
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>
  // MiniMax echoes a base_resp status on some errors even with HTTP 200.
  base_resp?: { status_code?: number; status_msg?: string }
}

function extractText(json: unknown): string {
  return (json as OpenAIResponse)?.choices?.[0]?.message?.content?.trim() ?? ''
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const err = (await res.json()) as {
      error?: { message?: string }
      base_resp?: { status_msg?: string }
    }
    return err?.error?.message ?? err?.base_resp?.status_msg ?? ''
  } catch {
    return ''
  }
}
