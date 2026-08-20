// Contract for the profile AskBar ("Describe what you want and TubeGhost
// sets it up…").
//
// This is NOT the action-plan contract (./plan.ts). A plan proposes backend
// operations the user confirms; a patch is a set of edits applied to the
// profile the user is looking at, immediately and reversibly.
//
// The model NEVER writes database columns directly. It returns intents from
// the closed set below, this module validates them, and the renderer decides
// what each intent means (which is how "make it a mac profile" becomes a
// whole coherent device regeneration rather than a bare `platform` write).
// Anything unrecognised is dropped, so a hallucinated field cannot reach the
// profile row.

export type PatchIntent =
  | { kind: 'set_os'; os: 'windows' | 'macos' }
  | { kind: 'set_proxy'; query: string }
  | { kind: 'clear_proxy' }
  | { kind: 'new_fingerprint' }
  | { kind: 'set_optimized'; on: boolean }
  | { kind: 'set_group'; name: string }
  | { kind: 'add_tags'; names: string[] }
  | { kind: 'remove_tags'; names: string[] }
  | { kind: 'set_name'; name: string }

export const PATCH_KINDS = [
  'set_os',
  'set_proxy',
  'clear_proxy',
  'new_fingerprint',
  'set_optimized',
  'set_group',
  'add_tags',
  'remove_tags',
  'set_name'
] as const

export interface ParsedPatch {
  intents: PatchIntent[]
  // Prose the model returned instead of (or alongside) intents — shown when
  // it could not turn the request into changes.
  reply?: string
  errors: string[]
  // True when the response is shaped like the CHAT assistant's (a "plan" or
  // a bare "reply", no "changes" key at all). That is the signature of the
  // edge function running without the profile-patch mode deployed, which
  // would otherwise look like "the AskBar just ignores me".
  chatModeResponse?: boolean
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

// Names are user-visible values that end up in the DB; cap them here so a
// runaway model response can't write a 10KB profile name.
const NAME_MAX = 80
const TAG_MAX = 24
const MAX_INTENTS = 12

function strList(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const item of v) {
    const s = str(item).slice(0, cap)
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/**
 * Validate a raw model response into intents. Unknown kinds, missing
 * arguments and malformed values are dropped with an error rather than
 * guessed at — a half-understood instruction must not silently become a
 * different change than the user asked for.
 */
export function parsePatchResponse(raw: unknown): ParsedPatch {
  const errors: string[] = []
  if (raw == null || typeof raw !== 'object') {
    return { intents: [], errors: ['The assistant returned nothing usable.'] }
  }
  const r = raw as { changes?: unknown; reply?: unknown; plan?: unknown }
  const reply = str(r.reply) || undefined
  const chatModeResponse = !('changes' in (r as object)) && ('plan' in (r as object) || !!reply)
  const rawList = Array.isArray(r.changes) ? r.changes.slice(0, MAX_INTENTS) : []
  const intents: PatchIntent[] = []

  rawList.forEach((entry: unknown, i: number) => {
    const e = entry as Record<string, unknown>
    const kind = str(e?.kind)
    if (!(PATCH_KINDS as readonly string[]).includes(kind)) {
      errors.push(`Change ${i + 1}: unsupported "${kind || '?'}".`)
      return
    }
    switch (kind) {
      case 'set_os': {
        const os = str(e.os).toLowerCase()
        if (os !== 'windows' && os !== 'macos') {
          errors.push(`Change ${i + 1}: os must be windows or macos.`)
          return
        }
        intents.push({ kind: 'set_os', os })
        return
      }
      case 'set_proxy': {
        // Free text on purpose — "Dallas", "38.84.26.198", "the fast one".
        // The renderer resolves it against the real pool; the model never
        // invents an address.
        const query = str(e.query)
        if (!query) {
          errors.push(`Change ${i + 1}: proxy needs a query.`)
          return
        }
        intents.push({ kind: 'set_proxy', query })
        return
      }
      case 'clear_proxy':
        intents.push({ kind: 'clear_proxy' })
        return
      case 'new_fingerprint':
        intents.push({ kind: 'new_fingerprint' })
        return
      case 'set_optimized':
        intents.push({ kind: 'set_optimized', on: e.on !== false })
        return
      case 'set_group': {
        const name = str(e.name).slice(0, NAME_MAX)
        if (!name) {
          errors.push(`Change ${i + 1}: group needs a name.`)
          return
        }
        intents.push({ kind: 'set_group', name })
        return
      }
      case 'add_tags':
      case 'remove_tags': {
        const names = strList(e.names, TAG_MAX)
        if (!names.length) {
          errors.push(`Change ${i + 1}: no tags given.`)
          return
        }
        intents.push({ kind: kind as 'add_tags' | 'remove_tags', names })
        return
      }
      case 'set_name': {
        const name = str(e.name).slice(0, NAME_MAX)
        if (!name) {
          errors.push(`Change ${i + 1}: name is empty.`)
          return
        }
        intents.push({ kind: 'set_name', name })
        return
      }
    }
  })

  return { intents, reply, errors, chatModeResponse }
}
