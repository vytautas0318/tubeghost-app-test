// Renderer-side wrapper around the `assistant` Edge Function — a grounded,
// multi-turn in-app help assistant. The Gemini key stays server-side in the
// edge function (never in the bundle). Mirrors lib/edge.ts invoke pattern.

import { getSupabase } from '@/lib/supabase'
import {
  ASSISTANT_RESPONSE_SCHEMA,
  toolCatalogForPrompt,
  parseResponse,
  type ActionPlan
} from '../../../shared/assistant/plan'

export interface AssistantTurn {
  role: 'user' | 'assistant'
  text: string
}

// Which model the Copilot UI is set to. Kept as a stable id the edge function
// maps to a provider + concrete model (see supabase/functions/assistant/config).
export type ModelChoice = 'haiku-4.5' | 'minimax-m3'

// Labels for the model selector in the panel header. Order = selector order.
export const MODEL_OPTIONS: { value: ModelChoice; label: string }[] = [
  { value: 'haiku-4.5', label: 'Haiku 4.5' },
  { value: 'minimax-m3', label: 'MiniMax M3' }
]

export const DEFAULT_MODEL: ModelChoice = 'haiku-4.5'

function client() {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured')
  return c
}

interface AssistantResponse {
  text?: string
  error?: string
}

// The assistant's answer: EITHER prose (reply) OR an action plan awaiting the
// user's confirmation. Exactly one is set.
export interface AssistantResult {
  reply?: string
  plan?: ActionPlan
}

// Hard ceiling on a single assistant request so the UI can never hang on
// "Thinking…" forever (e.g. if the edge function / model stalls).
const REQUEST_TIMEOUT_MS = 45_000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error('The assistant took too long to respond. Please try again.')),
      ms
    )
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

// Send the conversation (+ context + the real tool catalog/schema) and get back
// either a prose reply or a proposed action plan.
export async function askAssistant(
  messages: AssistantTurn[],
  context: string,
  model: ModelChoice = DEFAULT_MODEL
): Promise<AssistantResult> {
  const { data, error } = await withTimeout(
    client().functions.invoke<AssistantResponse>('assistant', {
      body: {
        messages,
        context,
        model,
        toolCatalog: toolCatalogForPrompt(),
        responseSchema: ASSISTANT_RESPONSE_SCHEMA
      }
    }),
    REQUEST_TIMEOUT_MS
  )
  if (error) throw new Error(await readableInvokeError(error))
  if (!data) throw new Error('The assistant returned no response.')
  if (data.error) throw new Error(data.error)
  if (!data.text) throw new Error('The assistant returned an empty response.')

  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(data.text))
  } catch {
    // Model returned plain prose instead of JSON — treat it as a reply.
    return { reply: data.text }
  }
  const result = parseResponse(parsed)
  if (result.plan) return { plan: result.plan }
  if (result.reply) return { reply: result.reply }
  throw new Error(result.errors[0] ?? 'The assistant returned an empty response.')
}

// Pull the JSON object out of a model response that may be wrapped in ```json
// fences or have stray prose around it. Falls back to the raw text.
function extractJson(text: string): string {
  const t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last > first) return t.slice(first, last + 1)
  return t
}

// supabase-js wraps a non-2xx as a FunctionsHttpError whose top-level message is
// generic; the REAL reason our function sent lives in the JSON body of
// error.context (the raw Response). Read it so the user sees the true cause.
async function readableInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const parsed = (await ctx.clone().json()) as { error?: string }
      if (parsed?.error) return parsed.error
    } catch {
      /* body not JSON — fall through */
    }
  }
  const msg = (error as { message?: string })?.message ?? ''
  if (/failed to fetch|network/i.test(msg)) return 'Could not reach the assistant. Check your connection.'
  return msg || 'The assistant request failed.'
}

// Human-readable label for a route path, used to tell the assistant which page
// the user is on. Falls back to the raw path for unmapped routes.
const ROUTE_LABELS: Record<string, string> = {
  '/profiles': 'Profiles',
  '/proxies': 'Proxies',
  '/team/members': 'Members',
  '/team/roles': 'Roles & access',
  '/extensions': 'Extensions',
  '/authenticator': 'Authenticator',
  '/automations': 'Automations',
  '/synchronizer': 'Synchronizer',
  '/api': 'API & AI MCP',
  '/billing': 'Billing',
  '/settings': 'Settings',
  '/bulk': 'Bulk create'
}

export function routeLabel(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname]
  // /profiles/:id etc. — match the first segment.
  const seg = '/' + pathname.split('/').filter(Boolean)[0]
  return ROUTE_LABELS[seg] ?? pathname
}

// A minimal profile descriptor for context (name + whether it's running). Lets
// the assistant resolve requests like "launch the first profile" / "launch 2
// randomly" / "launch test-1" into real profile names it can put in a plan.
export interface ProfileContext {
  name: string
  running: boolean
}

// Build the context string sent with each message. Includes the user's profile
// names (capped) so action requests can reference real profiles by position or
// at random, not just by an exact name the user typed.
export function buildContext(opts: {
  pathname: string
  workspaceName?: string | null
  roleName?: string | null
  profiles?: ProfileContext[]
  // Proxy pool size, so "how many proxies do I have?" can be answered from
  // context without a round trip. Omit when unknown (don't guess zero).
  proxyCount?: number | null
  activeProxyCount?: number | null
}): string {
  const parts = [`The user is currently on the "${routeLabel(opts.pathname)}" page.`]
  if (opts.workspaceName) parts.push(`Workspace: "${opts.workspaceName}".`)
  if (opts.roleName && opts.roleName !== '—') parts.push(`Their role: ${opts.roleName}.`)

  const profiles = opts.profiles ?? []
  if (profiles.length > 0) {
    const CAP = 60 // keep the prompt bounded on big workspaces
    const shown = profiles.slice(0, CAP)
    const list = shown
      .map((p, i) => `${i + 1}. "${p.name}"${p.running ? ' (running)' : ''}`)
      .join('; ')
    parts.push(
      `The user has ${profiles.length} profile(s), in order: ${list}${
        profiles.length > CAP ? ` …and ${profiles.length - CAP} more` : ''
      }. When the user refers to a profile by position ("the first", "the last"), at random, or by name, map it to the exact name(s) above and use those in launch/stop steps.`
    )
  } else {
    parts.push('The user has no profiles yet.')
  }

  if (typeof opts.proxyCount === 'number') {
    const a = typeof opts.activeProxyCount === 'number' ? `, ${opts.activeProxyCount} active` : ''
    parts.push(`The user has ${opts.proxyCount} prox${opts.proxyCount === 1 ? 'y' : 'ies'}${a}.`)
  }
  return parts.join(' ')
}
