// Renderer half of the profile AskBar. Sends the user's plain-language
// request to the assistant edge function in `profile-patch` mode and returns
// validated intents.
//
// The model's job ends at "what did they ask for". Turning an intent into
// real changes is this app's job (see applyIntents in AskBar) — that's what
// keeps "make it a mac profile" going through the same coherent device
// regeneration the Device tile uses, instead of the model writing a bare
// platform value it doesn't understand the consequences of.

import { getSupabase } from '@/lib/supabase'
import { parsePatchResponse, type ParsedPatch } from '../../../shared/assistant/profilePatch'
import type { ProfileRow } from '@/lib/profiles'
import type { ProxyRow } from '@/lib/proxies'

// Same ceiling as the chat assistant — the UI must never hang on "Working…".
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

/**
 * Describe the profile and the resources it can be pointed at, so the model
 * resolves "the Dallas one" or "flagship" against things that actually exist.
 * Lists are capped to keep the prompt bounded on large workspaces.
 */
export function buildAskContext(opts: {
  profile: ProfileRow
  groupName: string
  proxies: ProxyRow[]
  groups: string[]
  tags: string[]
}): string {
  const { profile, groupName, proxies, groups, tags } = opts
  const parts: string[] = [
    `The open profile is "${profile.name}".`,
    `Its device is ${(profile.platform ?? '').includes('mac') ? 'macOS' : 'Windows'}.`,
    profile.proxy_host
      ? `Its proxy is ${profile.proxy_host}:${profile.proxy_port}.`
      : 'It has no proxy.',
    `Optimized for YouTube is ${profile.google_optimized ? 'on' : 'off'}.`,
    groupName ? `Its group is "${groupName}".` : 'It is not in a group.',
    profile.tags?.length ? `Its tags: ${profile.tags.join(', ')}.` : 'It has no tags.'
  ]

  const px = proxies.slice(0, 40)
  if (px.length) {
    parts.push(
      `Available proxies: ${px
        .map(
          (p) =>
            `${p.host}:${p.port}${p.city ? ` (${p.city})` : ''}${p.label ? ` [${p.label}]` : ''}`
        )
        .join('; ')}.`
    )
  } else {
    parts.push('There are no proxies in this workspace.')
  }
  if (groups.length) parts.push(`Existing groups: ${groups.slice(0, 40).join(', ')}.`)
  if (tags.length) parts.push(`Existing tags: ${tags.slice(0, 40).join(', ')}.`)
  return parts.join(' ')
}

export async function askProfilePatch(
  request: string,
  context: string,
  model?: string
): Promise<ParsedPatch> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await withTimeout(
    supabase.functions.invoke<{ text?: string; error?: string }>('assistant', {
      body: {
        mode: 'profile-patch',
        messages: [{ role: 'user', text: request }],
        context,
        ...(model ? { model } : {})
      }
    }),
    REQUEST_TIMEOUT_MS
  )
  if (error) throw new Error(await readableInvokeError(error))
  if (!data?.text) throw new Error('The assistant returned no response.')
  if (data.error) throw new Error(data.error)

  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(data.text))
  } catch {
    // Prose instead of JSON — surface it rather than failing silently.
    return { intents: [], reply: data.text.trim(), errors: [] }
  }
  return parsePatchResponse(parsed)
}

// Models wrap JSON in fences or stray prose often enough to be worth handling.
function extractJson(text: string): string {
  const t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last > first) return t.slice(first, last + 1)
  return t
}

async function readableInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const parsed = (await ctx.clone().json()) as { error?: string }
      if (parsed?.error) return parsed.error
    } catch {
      /* body not JSON */
    }
  }
  const msg = (error as { message?: string })?.message ?? ''
  if (/failed to fetch|network/i.test(msg)) {
    return 'Could not reach the assistant. Check your connection.'
  }
  return msg || 'The assistant request failed.'
}

/**
 * Resolve a free-text proxy request ("Dallas", "38.84.26.198", "US") against
 * the real pool. Exact host wins, then host:port, then city/label/country
 * substring. Returns null when nothing matches — the caller reports that
 * rather than assigning an arbitrary proxy.
 */
export function resolveProxy(query: string, proxies: ProxyRow[]): ProxyRow | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const usable = proxies.filter((p) => p.status === 'active')
  return (
    usable.find((p) => p.host.toLowerCase() === q) ??
    usable.find((p) => `${p.host}:${p.port}`.toLowerCase() === q) ??
    usable.find((p) => q.includes(p.host.toLowerCase())) ??
    usable.find((p) => (p.city ?? '').toLowerCase().includes(q)) ??
    usable.find((p) => (p.label ?? '').toLowerCase().includes(q)) ??
    usable.find((p) => (p.country_code ?? '').toLowerCase() === q) ??
    null
  )
}
