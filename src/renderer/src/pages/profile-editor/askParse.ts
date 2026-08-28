// Plain-language request → a draft patch, for the Simple editor's Ask bar.
//
// Deterministic pattern matching, NOT an LLM: the export's AskBar works this
// way and it's the right call here too — no API key, no network, no latency,
// and the user can always see exactly what it changed before accepting it.
//
// Kept pure (no React, no I/O) so every rule is unit-testable and the
// component stays a thin shell.

import type { SimpleDraft } from './useSimpleDraft'
import type { ProxyRow } from '@/lib/proxies'
import type { GroupRow } from '@/lib/groups'
import { OPTIMIZED_PRESET } from './optimizedPreset'

export interface AskContext {
  draft: SimpleDraft
  proxies: ProxyRow[]
  groups: GroupRow[]
  knownTags: string[]
  // Proxy lives on the saved profile row, not the draft (it is assigned
  // through the data layer), so the caller supplies the current host.
  currentProxyHost: string | null
  // Proxies no profile is using yet, best candidate first. Supplied by the
  // caller because "unused" needs a workspace-wide usage query and this module
  // is kept pure. When present, "assign a proxy" prefers a free one over
  // handing out a proxy another profile is already on.
  unusedProxies?: ProxyRow[]
}

export interface AskResult {
  // Draft fields to apply. Empty when nothing matched.
  patch: Partial<SimpleDraft>
  // Human-readable summary, one entry per change ("Device → macOS").
  changes: string[]
  // Proxy is assigned through the data layer, not the draft, so it is
  // reported separately. null means "detach the current proxy".
  proxy?: ProxyRow | null
  // Intents that WERE understood but are already true ("Device is already
  // macOS"). Without this an already-configured profile is indistinguishable
  // from an unparseable request, and both surface as "nothing to change" —
  // which reads as the feature being broken.
  alreadySet: string[]
  // Terms that look like they name a place/proxy but matched nothing in this
  // workspace ("Dallas" when no proxy is in Dallas). Previously dropped
  // silently, so a half-understood request applied half its intent with no
  // indication which half.
  unmatched: string[]
}

const has = (s: string, re: RegExp): boolean => re.test(s)

export function parseAsk(text: string, ctx: AskContext): AskResult {
  const t = text.trim()
  const s = t.toLowerCase()
  const patch: Partial<SimpleDraft> = {}
  const changes: string[] = []
  const alreadySet: string[] = []
  const unmatched: string[] = []
  let proxy: ProxyRow | null | undefined

  if (!t) return { patch, changes, alreadySet, unmatched }

  // ── Device ───────────────────────────────────────────────────────────
  if (has(s, /\bmac(os|book)?\b/)) {
    if (ctx.draft.platform !== 'macos') {
      patch.platform = 'macos'
      changes.push('Device → macOS')
    } else {
      alreadySet.push('Device is already macOS')
    }
  } else if (has(s, /\bwin(dows|11|10)?\b/)) {
    if (ctx.draft.platform !== 'windows') {
      patch.platform = 'windows'
      changes.push('Device → Windows')
    } else {
      alreadySet.push('Device is already Windows')
    }
  }

  // ── Proxy ────────────────────────────────────────────────────────────
  if (has(s, /no proxy|without a proxy|real ip/)) {
    if (ctx.currentProxyHost) {
      proxy = null
      changes.push('Proxy → none')
    } else {
      alreadySet.push('No proxy is assigned')
    }
  } else {
    const byIp = ctx.proxies.find((p) => s.includes(p.host.toLowerCase()))
    const byCity = ctx.proxies.find((p) => p.city && s.includes(p.city.split(',')[0].toLowerCase()))
    const hit = byIp ?? byCity
    if (hit) {
      if (hit.host === ctx.currentProxyHost) {
        alreadySet.push(`Proxy is already ${hit.host}${hit.city ? ` (${hit.city})` : ''}`)
      } else {
        proxy = hit
        changes.push(`Proxy → ${hit.host}${hit.city ? ` (${hit.city})` : ''}`)
      }
    } else if (has(s, /assign (a |an )?prox|unused prox|free prox|fresh prox/)) {
      // Prefer one nobody is on. Falls back to the general pool so the command
      // still works when every proxy is taken (sharing beats doing nothing),
      // and reports which case happened.
      const free = ctx.unusedProxies?.[0]
      const pick = free ?? ctx.proxies[0]
      if (pick) {
        proxy = pick
        changes.push(`Proxy → ${pick.host}${free ? ' (unused)' : ' (all in use — shared)'}`)
      } else {
        alreadySet.push('No proxies in this workspace')
      }
    } else {
      // The request named a place or an IP-looking token, but nothing in this
      // workspace matches it. Say so — silently ignoring it is how "make it a
      // mac profile on the Dallas IP" appeared to do nothing at all.
      const placeLike = t.match(/\b(?:on|in|from|use|using)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/)
      const ipLike = t.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)
      const term = ipLike?.[0] ?? placeLike?.[1]
      if (term && !ctx.groups.some((g) => s.includes(g.name.toLowerCase()))) {
        unmatched.push(term)
      }
    }
  }

  // ── Fingerprint ──────────────────────────────────────────────────────
  if (has(s, /(fresh|new|reroll|another) (finger|seed)/)) {
    patch.fingerprint_seed = Math.floor(Math.random() * 2_147_483_647)
    changes.push('New fingerprint seed')
  }

  // "not for youtube" / "generic" must win over a bare "youtube" mention.
  if (has(s, /generic|not for youtube|turn off youtube/)) {
    if (ctx.draft.google_optimized) {
      patch.google_optimized = false
      patch.webgl_mode = 'real'
      changes.push('Optimized for YouTube → off')
    } else {
      alreadySet.push('Optimized for YouTube is already off')
    }
  } else if (has(s, /optimi[sz]e|for youtube|yt tuned/)) {
    if (ctx.draft.google_optimized) {
      alreadySet.push('Optimized for YouTube is already on')
    } else {
      Object.assign(patch, OPTIMIZED_PRESET, { google_optimized: true })
      changes.push('Optimized for YouTube → on')
    }
  }

  // ── Group ────────────────────────────────────────────────────────────
  const grp = ctx.groups.find((g) => s.includes(g.name.toLowerCase()))
  if (grp) {
    if (grp.id !== ctx.draft.group_id) {
      patch.group_id = grp.id
      changes.push(`Group → ${grp.name}`)
    } else {
      alreadySet.push(`Group is already ${grp.name}`)
    }
  }

  // ── Tags ─────────────────────────────────────────────────────────────
  const current = ctx.draft.tags ?? []
  const mentioned = ctx.knownTags.filter((tag) =>
    new RegExp(`\\b${tag.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s)
  )
  const add = mentioned.filter((tag) => !current.some((c) => c.toLowerCase() === tag.toLowerCase()))
  if (add.length > 0) {
    patch.tags = [...current, ...add]
    changes.push(`Tags → ${add.join(', ')}`)
  } else if (mentioned.length > 0) {
    alreadySet.push(`Already tagged ${mentioned.join(', ')}`)
  }

  // ── Name ─────────────────────────────────────────────────────────────
  const named = t.match(/(?:call it|name it|named)\s+"?([^",.]+)"?/i)
  if (named) {
    const next = named[1].trim()
    if (next && next !== ctx.draft.name) {
      patch.name = next
      changes.push(`Name → ${next}`)
    } else if (next) {
      alreadySet.push(`Name is already ${next}`)
    }
  }

  return { patch, changes, proxy, alreadySet, unmatched }
}
