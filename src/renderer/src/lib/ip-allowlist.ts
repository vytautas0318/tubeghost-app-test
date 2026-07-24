// Workspace IP allowlist data layer (workspace-scope, workspace.edit_settings).
// Empty list = allow all. Entries are single IPs or CIDR ranges (v4 or v6),
// validated client-side before write; enforced server-side by
// check_workspace_ip_access(). Includes an admin self-lockout guard.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'

function client(): SupabaseClient {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured')
  return c
}

export interface IpAllowlistEntry {
  id: string
  cidr: string
  label: string | null
}

export async function listIpAllowlist(workspaceId: string): Promise<IpAllowlistEntry[]> {
  const { data, error } = await client()
    .from('workspace_ip_allowlist')
    .select('id, cidr, label')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as IpAllowlistEntry[]
}

// Validate one line as an IPv4/IPv6 address or CIDR. Returns null if valid,
// else a human reason. Mirrors what Postgres `inet` accepts (host or network).
export function validateCidr(entry: string): string | null {
  const s = entry.trim()
  if (!s) return 'Empty entry.'
  const [addr, prefix] = s.split('/')
  const isV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(addr)
  const isV6 = /^[0-9a-fA-F:]+$/.test(addr) && addr.includes(':')
  if (isV4) {
    if (addr.split('.').some((o) => Number(o) > 255)) return `Invalid IPv4: ${addr}`
    if (
      prefix !== undefined &&
      (Number(prefix) < 0 || Number(prefix) > 32 || !/^\d+$/.test(prefix))
    )
      return `Invalid IPv4 prefix: /${prefix}`
    return null
  }
  if (isV6) {
    if (
      prefix !== undefined &&
      (Number(prefix) < 0 || Number(prefix) > 128 || !/^\d+$/.test(prefix))
    )
      return `Invalid IPv6 prefix: /${prefix}`
    return null
  }
  return `Not an IP or CIDR: ${s}`
}

// Parse a textarea into trimmed, non-empty lines with per-line validation.
export function parseAllowlistText(text: string): { cidrs: string[]; errors: string[] } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const errors: string[] = []
  const cidrs: string[] = []
  for (const l of lines) {
    const reason = validateCidr(l)
    if (reason) errors.push(reason)
    else cidrs.push(l)
  }
  return { cidrs: Array.from(new Set(cidrs)), errors }
}

// Self-lockout guard: would `cidrs` still admit the caller's current IP?
// Uses the server RPC so the CIDR containment math matches Postgres exactly.
export async function wouldCoverCurrentIp(cidrs: string[], currentIp: string): Promise<boolean> {
  const c = getSupabase()
  if (!c) return true
  const { data, error } = await c.rpc('ip_allowlist_would_cover', {
    p_cidrs: cidrs,
    p_ip: currentIp
  })
  if (error) return true // fail-open on the client warning; server still enforces
  return Boolean(data)
}

// Replace the workspace allowlist with exactly `cidrs` (diff-free: delete all,
// re-insert). Small lists, so simplicity beats a diff.
export async function replaceIpAllowlist(workspaceId: string, cidrs: string[]): Promise<void> {
  const c = client()
  const { error: delErr } = await c
    .from('workspace_ip_allowlist')
    .delete()
    .eq('workspace_id', workspaceId)
  if (delErr) throw delErr
  if (cidrs.length === 0) return
  const rows = cidrs.map((cidr) => ({ workspace_id: workspaceId, cidr }))
  const { error: insErr } = await c.from('workspace_ip_allowlist').insert(rows)
  if (insErr) throw insErr
}
