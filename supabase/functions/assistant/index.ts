// TubeGhost Assistant edge function. A multi-turn, grounded, AGENTIC helper: the
// renderer sends the conversation + live context + the real tool catalog +
// response schema (from shared/assistant/plan.ts) + the user's model choice. We
// call the selected provider through the sendMessage abstraction (provider.ts)
// and return structured JSON text — either a prose reply or an action plan. The
// renderer parses it, confirms any plan with the user, and EXECUTES actions
// itself (never the edge function).
//
// Provider keys live ONLY here (Deno.env edge secrets), never in the bundle.
// The handler is model-agnostic: it never touches a provider SDK/endpoint — all
// per-provider differences live behind sendMessage.

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'
import { sendMessage, type Turn } from './provider.ts'
import { assistantSystem } from './knowledge.ts'

interface ChatTurn {
  role?: 'user' | 'assistant'
  text?: string
}

interface RequestBody {
  // Full conversation so far, oldest first, ending with the user's new message.
  messages?: ChatTurn[]
  // A short human-readable description of the user's current app state.
  context?: string
  // The real action catalog + response schema, derived renderer-side from
  // shared/assistant/plan.ts (single source of truth for the tool set).
  toolCatalog?: string
  responseSchema?: unknown
  // Which model the user picked in the Copilot UI ('haiku-4.5' | 'minimax-m3').
  // Defaults to Haiku inside the provider layer if absent/unknown.
  model?: string
}

// Cap history so a runaway transcript can't blow the token budget.
const MAX_TURNS = 20

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonResponse({ error: 'authentication required' }, 401)

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const turns = Array.isArray(body.messages) ? body.messages : []
  const history: Turn[] = turns
    .slice(-MAX_TURNS)
    .filter((t) => typeof t.text === 'string' && t.text.trim())
    .map((t) => ({
      role: t.role === 'assistant' ? 'assistant' : 'user',
      text: String(t.text)
    }))

  // The transcript must end with the user's new message.
  const last = history[history.length - 1]
  if (!last || last.role !== 'user') {
    return jsonResponse({ error: 'Ask the assistant a question.' }, 400)
  }
  const userMessage = last.text
  const priorHistory = history.slice(0, -1)

  const toolCatalog = typeof body.toolCatalog === 'string' ? body.toolCatalog : ''
  const appContext = typeof body.context === 'string' ? body.context : ''

  // The SAME system prompt + grounding is used for every model. assistantSystem
  // already merges the app context into the knowledge base + tool catalog; we
  // pass appContext through the abstraction too for full model-agnostic parity.
  const result = await sendMessage({
    systemPrompt: assistantSystem(appContext, toolCatalog),
    history: priorHistory,
    userMessage,
    model: body.model as never
  })

  if (result.error) return jsonResponse({ error: result.error }, 502)
  // Return raw text; the renderer parses it into a reply or an action plan
  // against the real schema (shared/assistant/plan.ts).
  return jsonResponse({ text: result.text })
})
