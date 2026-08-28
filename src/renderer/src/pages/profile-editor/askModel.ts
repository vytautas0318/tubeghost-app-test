// LLM-backed parse for the Simple editor's Ask bar.
//
// WHY THIS EXISTS. askParse.ts is deterministic pattern matching: it knows a
// fixed list of phrasings and silently does nothing outside them, so anything
// conversational ("set this up like my US profiles", "what does optimized do?")
// failed. This routes the same box through the app's real assistant — the
// `assistant` Edge Function on claude-haiku-4-5, the same one the Copilot FAB
// uses — so arbitrary phrasing and questions work.
//
// It deliberately does NOT reuse the plan/confirm contract the FAB uses. The
// Ask bar's value is that it edits the draft in front of you immediately and
// offers Undo; a confirmation card in the middle of the editor would be a
// worse interaction than the tiles it is meant to save you from. So this asks
// for a small, purpose-built JSON shape instead.
//
// askParse stays as the FAST PATH and the fallback: an exact-match phrasing
// applies with no network round-trip, and if the model is unreachable the bar
// still works for the phrasings it always handled.

import { getSupabase } from '@/lib/supabase'
import type { SimpleDraft } from './useSimpleDraft'
import type { ProxyRow } from '@/lib/proxies'
import type { GroupRow } from '@/lib/groups'

// What the model may change. Deliberately a SUBSET of SimpleDraft: fields the
// Simple editor exposes, nothing that would silently rewrite hand-tuned
// Advanced values.
export interface AskModelEdit {
  name?: string
  platform?: 'windows' | 'macos'
  google_optimized?: boolean
  fingerprint_seed?: number
  tags?: string[]
  group_id?: string | null
  // host:port of a proxy in the workspace pool, or null to detach.
  proxy?: string | null
}

export interface AskModelResult {
  // Applied to the draft by the caller.
  edit: AskModelEdit
  // One line per change, for the "Applied" strip.
  changes: string[]
  // Prose answer when the user asked a question rather than giving a command.
  reply?: string
}

const REQUEST_TIMEOUT_MS = 30_000

function client(): NonNullable<ReturnType<typeof getSupabase>> {
  const c = getSupabase()
  if (!c) throw new Error('Not connected')
  return c
}

// The model sees the CURRENT draft and the real pool/registry, so it can answer
// "is this already a mac profile?" and resolve "the Dallas one" to a real host.
function buildContext(opts: {
  draft: SimpleDraft
  proxies: ProxyRow[]
  groups: GroupRow[]
  knownTags: string[]
  currentProxyHost: string | null
}): string {
  const { draft, proxies, groups, knownTags, currentProxyHost } = opts
  const pool = proxies
    .slice(0, 40)
    .map((p) => `${p.host}:${p.port}${p.city ? ` (${p.city}${p.country_code ? ', ' + p.country_code : ''})` : ''}`)
    .join('\n')
  return [
    'CURRENT PROFILE DRAFT (unsaved edits included):',
    `- name: ${draft.name || '(untitled)'}`,
    `- device platform: ${draft.platform}`,
    `- optimized for YouTube: ${draft.google_optimized}`,
    `- fingerprint seed: ${draft.fingerprint_seed}`,
    `- tags: ${draft.tags.length ? draft.tags.join(', ') : '(none)'}`,
    `- group: ${groups.find((g) => g.id === draft.group_id)?.name ?? '(none)'}`,
    `- proxy: ${currentProxyHost ?? '(none)'}`,
    '',
    'WORKSPACE PROXY POOL (use the exact host:port when assigning):',
    pool || '(empty)',
    '',
    `EXISTING GROUPS: ${groups.map((g) => g.name).join(', ') || '(none)'}`,
    `EXISTING TAGS: ${knownTags.join(', ') || '(none)'}`
  ].join('\n')
}

const SYSTEM = `You edit a single browser-profile draft in an anti-detect browser, or answer questions about it.

Respond with ONE raw JSON object, no prose outside it, no markdown fences:
{"edit": {...}, "changes": ["..."], "reply": "..."}

- "edit": ONLY fields the user actually asked to change. Omit everything else. Never include a field whose value already matches the draft.
- "changes": one short line per change you made, e.g. "Device → macOS". Empty array if you changed nothing.
- "reply": prose ONLY when the user asked a question or you could not act. Omit it when you made changes.

Editable fields:
- name (string)
- platform ("windows" | "macos")
- google_optimized (boolean) — the YouTube-tuned fingerprint preset
- fingerprint_seed (integer) — set a NEW random integer when asked to reroll/refresh the fingerprint
- tags (string[]) — the COMPLETE new list, not a delta
- group_id (string | null) — the id of an existing group, or null to clear. Never invent an id.
- proxy (string | null) — exact "host:port" from the pool, or null to remove

Rules:
- Nothing matching the request? Say so in "reply". Never guess a proxy or group that is not listed.
- Already in the requested state? Say so in "reply" with an empty "changes".
- Questions about what a setting does: answer in "reply", change nothing.
- Prefer the smallest edit that satisfies the request.`

// Ask the model to turn a plain-language request into a draft edit. Throws on
// transport/parse failure so the caller can fall back to askParse.
export async function askModel(
  text: string,
  ctx: {
    draft: SimpleDraft
    proxies: ProxyRow[]
    groups: GroupRow[]
    knownTags: string[]
    currentProxyHost: string | null
  }
): Promise<AskModelResult> {
  const invoke = client().functions.invoke<{ text?: string; error?: string }>('assistant', {
    body: {
      messages: [{ role: 'user', text }],
      context: buildContext(ctx),
      model: 'haiku-4.5',
      // The edge function composes its own system prompt from `toolCatalog`;
      // passing ours here keeps this task self-contained without a redeploy.
      toolCatalog: SYSTEM
    }
  })
  const { data, error } = await withTimeout(invoke, REQUEST_TIMEOUT_MS)
  if (error) throw new Error(error.message ?? 'Assistant unavailable')
  if (!data?.text) throw new Error(data?.error ?? 'Empty response')
  return normalize(JSON.parse(extractJson(data.text)), ctx)
}

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('The assistant took too long.')), ms)
    Promise.resolve(p).then(
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

// Models wrap JSON in ``` fences or stray prose often enough to be worth
// handling rather than failing the whole request.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}

// Map a validated model edit onto a SimpleDraft patch. Lives here rather than
// in the component so the shape of an edit and its translation stay together.
export function editToPatch(edit: AskModelEdit): Partial<SimpleDraft> {
  const p: Partial<SimpleDraft> = {}
  if (edit.name !== undefined) p.name = edit.name
  if (edit.platform !== undefined) p.platform = edit.platform
  if (edit.google_optimized !== undefined) {
    p.google_optimized = edit.google_optimized
    // Mirrors askParse: turning the preset off returns WebGL to real.
    if (!edit.google_optimized) p.webgl_mode = 'real'
  }
  if (edit.fingerprint_seed !== undefined) p.fingerprint_seed = edit.fingerprint_seed
  if (edit.tags !== undefined) p.tags = edit.tags
  if (edit.group_id !== undefined) p.group_id = edit.group_id
  return p
}

// Trust nothing the model returns: drop unknown fields, reject a proxy or group
// that is not really in this workspace, and coerce types. A hallucinated proxy
// id would otherwise be written straight onto the profile.
function normalize(raw: unknown, ctx: { proxies: ProxyRow[]; groups: GroupRow[] }): AskModelResult {
  const o = (raw ?? {}) as Record<string, unknown>
  const e = (o.edit ?? {}) as Record<string, unknown>
  const edit: AskModelEdit = {}

  if (typeof e.name === 'string' && e.name.trim()) edit.name = e.name.trim()
  if (e.platform === 'windows' || e.platform === 'macos') edit.platform = e.platform
  if (typeof e.google_optimized === 'boolean') edit.google_optimized = e.google_optimized
  if (typeof e.fingerprint_seed === 'number' && Number.isFinite(e.fingerprint_seed)) {
    edit.fingerprint_seed = Math.abs(Math.trunc(e.fingerprint_seed)) || 1
  }
  if (Array.isArray(e.tags)) {
    edit.tags = e.tags.filter((t): t is string => typeof t === 'string' && !!t.trim())
  }
  if (e.group_id === null) edit.group_id = null
  else if (typeof e.group_id === 'string' && ctx.groups.some((g) => g.id === e.group_id)) {
    edit.group_id = e.group_id
  }
  if (e.proxy === null) edit.proxy = null
  else if (typeof e.proxy === 'string') {
    const hit = ctx.proxies.find((p) => `${p.host}:${p.port}` === e.proxy)
    if (hit) edit.proxy = e.proxy
  }

  const changes = Array.isArray(o.changes)
    ? o.changes.filter((c): c is string => typeof c === 'string' && !!c.trim())
    : []
  const reply = typeof o.reply === 'string' && o.reply.trim() ? o.reply.trim() : undefined
  return { edit, changes, reply }
}
