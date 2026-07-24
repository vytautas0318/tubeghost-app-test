// Anthropic (Claude Haiku 4.5) adapter — the existing, unchanged Haiku path
// behind the sendMessage interface. Anthropic Messages API:
//   - system prompt goes in the top-level `system` field
//   - messages are { role, content }
//   - response text is at data.content[0].text (we join all text blocks; thinking
//     blocks are skipped)
//   - auth header is x-api-key + anthropic-version
//
// The key is passed in by the provider layer (edge secret ANTHROPIC_API_KEY);
// this file never reads env or picks a model.

import {
  ANTHROPIC_ENDPOINT,
  ANTHROPIC_VERSION,
  MAX_TOKENS
} from '../config.ts'
import type { Adapter, SendMessageInput } from '../provider.ts'

// Haiku 4.5 uses the legacy thinking form: budget_tokens must be < max_tokens
// and at least 1024. Gives the model room to reason before answering.
const THINKING_BUDGET = 1536

// appContext is grounding data — fold it into the system instruction the SAME
// way for every provider so both models receive identical grounding.
function composeSystem(input: SendMessageInput): string {
  return input.appContext
    ? `${input.systemPrompt}\n\nCURRENT APP CONTEXT:\n${input.appContext}`
    : input.systemPrompt
}

export const anthropicAdapter: Adapter = async (input, apiKey, model) => {
  // Normalize the model-agnostic history + new user message into Anthropic's
  // { role, content } messages array.
  const messages = [
    ...input.history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user' as const, content: input.userMessage }
  ]

  const body: Record<string, unknown> = {
    model,
    max_tokens: MAX_TOKENS,
    system: composeSystem(input),
    thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
    messages
  }

  try {
    let res: Response
    try {
      res = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify(body)
      })
    } catch (e) {
      return { error: `Could not reach Haiku 4.5: ${(e as Error).message}` }
    }

    if (!res.ok) {
      if (res.status === 429) {
        return { error: 'Haiku 4.5 is rate-limited right now. Try again shortly.' }
      }
      const detail = await errorDetail(res)
      return { error: `Haiku 4.5 error (${res.status})${detail ? `: ${detail}` : ''}` }
    }

    let json: unknown
    try {
      json = await res.json()
    } catch {
      return { error: 'Haiku 4.5 returned an unreadable response.' }
    }

    const text = extractText(json)
    if (!text) {
      const reason = stopReason(json)
      return {
        error: reason
          ? `The assistant declined to respond (${reason}).`
          : 'Haiku 4.5 returned an empty response.'
      }
    }
    return { text }
  } catch (e) {
    // Belt-and-suspenders: any unexpected failure normalizes to { error } so one
    // provider being down never breaks the panel.
    return { error: `Haiku 4.5 is unavailable: ${(e as Error).message}` }
  }
}

interface AnthropicResponse {
  // content is a list of blocks; text lives on { type: 'text', text }. Thinking
  // blocks ({ type: 'thinking' }) are skipped.
  content?: Array<{ type?: string; text?: string }>
  stop_reason?: string
  stop_details?: { category?: string }
}

function extractText(json: unknown): string {
  const blocks = (json as AnthropicResponse)?.content
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((b) => b?.type === 'text')
    .map((b) => b?.text ?? '')
    .join('')
    .trim()
}

function stopReason(json: unknown): string | null {
  const r = json as AnthropicResponse
  if (r?.stop_reason === 'refusal') return r?.stop_details?.category ?? 'refusal'
  return r?.stop_reason ?? null
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const err = await res.json()
    return err?.error?.message ?? ''
  } catch {
    return ''
  }
}
