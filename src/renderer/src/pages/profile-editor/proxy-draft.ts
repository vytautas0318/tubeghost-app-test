// Creation-time proxy selection ("single-step profile setup").
//
// A brand-new profile has no row yet, so the Proxy tab can't save through
// assignProxyToProfile(). Instead the editor holds a DRAFT which is resolved
// into ProfileProxyFields at the moment the profile is inserted.
//
// Modes mirror AdsPower: auto-pick an unused proxy from the workspace pool,
// pick a specific one, type credentials inline, or none.

import { listUnusedProxies, type ProxyRow } from '@/lib/proxies'
import type { ProfileProxyFields } from '@/lib/profiles'
import type { ProxyFieldsState } from './ProxyCardFields'

export type ProxyDraftMode = 'auto' | 'pool' | 'custom' | 'none'

export interface ProxyDraft {
  mode: ProxyDraftMode
  // Set in 'pool' mode — the specific proxy the user picked.
  pick: ProxyRow | null
  // Set in 'custom' mode — inline credentials.
  fields: ProxyFieldsState
}

export const EMPTY_PROXY_FIELDS: ProxyFieldsState = {
  type: 'http',
  host: '',
  port: '',
  user: '',
  pass: ''
}

// Auto is the default: the reported UX problem was having to attach a proxy
// in a second step, and "next unused proxy" is the answer that needs zero
// input. It degrades to "no proxy" when the pool is empty (see resolve()).
export const initialProxyDraft = (): ProxyDraft => ({
  mode: 'auto',
  pick: null,
  fields: { ...EMPTY_PROXY_FIELDS }
})

export function proxyFieldsFromRow(p: ProxyRow): ProfileProxyFields {
  return {
    // proxy_id is a FK to ghost.proxies, which holds CUSTOM proxies only.
    // Purchased proxies are read live from TubeProxies and have no ghost row
    // to reference — they link through tubeproxies_ip_id instead. Same rule
    // as assignProxyToProfile().
    proxy_id: p.source === 'custom' ? p.id : null,
    proxy_type: p.proxy_type,
    proxy_host: p.host,
    proxy_port: p.port,
    proxy_user: p.username,
    proxy_pass: p.password_encrypted,
    proxy_source: p.source,
    tubeproxies_ip_id: p.tubeproxies_ip_id
  }
}

export function proxyLabel(p: ProxyRow): string {
  const where = p.country_code ? ` · ${p.country_code.toUpperCase()}` : ''
  return `${p.label ? p.label + ' — ' : ''}${p.host}:${p.port}${where}`
}

export type ResolvedProxy =
  | { ok: true; fields: ProfileProxyFields | null; note?: string }
  | { ok: false; error: string }

function resolveCustom(fields: ProxyFieldsState): ResolvedProxy {
  const host = fields.host.trim()
  const portRaw = fields.port.trim()
  // Both empty = the user switched to Custom and typed nothing. Treat as
  // "no proxy" rather than blocking the save.
  if (!host && !portRaw) return { ok: true, fields: null }
  if (!host) return { ok: false, error: 'Proxy host is required' }
  const port = Number(portRaw)
  if (!portRaw || !Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'Proxy port must be 1–65535' }
  }
  return {
    ok: true,
    fields: {
      proxy_id: null,
      proxy_type: fields.type,
      proxy_host: host,
      proxy_port: port,
      proxy_user: fields.user.trim() || null,
      proxy_pass: fields.pass || null,
      proxy_source: 'custom_inline',
      tubeproxies_ip_id: null
    }
  }
}

// Resolved at SAVE time, not at pick time: between opening the editor and
// hitting Save a teammate may have taken the proxy the preview showed, so
// auto mode re-reads the pool and takes whatever is genuinely free now.
export async function resolveProxyDraft(
  workspaceId: string,
  draft: ProxyDraft
): Promise<ResolvedProxy> {
  switch (draft.mode) {
    case 'none':
      return { ok: true, fields: null }
    case 'custom':
      return resolveCustom(draft.fields)
    case 'pool':
      if (!draft.pick) {
        return { ok: false, error: 'Pick a proxy from the pool, or switch to Auto / None' }
      }
      return { ok: true, fields: proxyFieldsFromRow(draft.pick) }
    case 'auto': {
      const free = await listUnusedProxies(workspaceId)
      if (free.length === 0) {
        // Soft skip — creating the profile without a proxy beats blocking
        // the user behind a pool they may not have bought yet.
        return {
          ok: true,
          fields: null,
          note: 'No unused proxy was available — profile created without one.'
        }
      }
      return { ok: true, fields: proxyFieldsFromRow(free[0]) }
    }
  }
}
