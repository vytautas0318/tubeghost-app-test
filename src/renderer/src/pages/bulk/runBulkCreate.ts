// The bulk create loop.
//
// Extracted from BulkCreate so that page is state + layout. Creates profiles
// one at a time (not in parallel) so the plan-limit trigger rejects cleanly at
// the cap rather than racing, and so progress reports honestly.

import {
  assignProxyToProfile,
  createProfile,
  listProfiles,
  updateProfile,
  type ProfileRow
} from '@/lib/profiles'
import { listProxies } from '@/lib/proxies'
import type { BatchSpec } from './batchSpec'

export interface BulkRunResult {
  created: ProfileRow[]
  errors: { name: string; message: string }[]
}

export async function runBulkCreate({
  rows,
  workspaceId,
  mode,
  spec,
  fpPatch,
  onProgress
}: {
  rows: { name: string; tags: string[] }[]
  workspaceId: string
  mode: string
  spec: BatchSpec
  fpPatch: () => Record<string, unknown>
  onProgress: () => void
}): Promise<BulkRunResult> {
  if (rows.length === 0) return { created: [], errors: [] }
  const created: ProfileRow[] = []
  const errors: { name: string; message: string }[] = []
  // Snapshot the unassigned pool once so each profile takes a different IP.
  let pool: Awaited<ReturnType<typeof listProxies>> = []
  if (mode === 'batch' && spec.proxyMode === 'pool') {
    try {
      const [all, profiles] = await Promise.all([
        listProxies(workspaceId),
        listProfiles(workspaceId)
      ])
      const taken = new Set(
        profiles.filter((p) => p.proxy_host).map((p) => `${p.proxy_host}:${p.proxy_port}`)
      )
      pool = all.filter((p) => !taken.has(`${p.host}:${p.port}`))
    } catch {
      /* no pool → profiles are created without proxies */
    }
  }

  for (const r of rows) {
    try {
      const p = await createProfile({
        workspace_id: workspaceId,
        name: r.name,
        tags: r.tags,
        // Batch mode shares one OS + group across the run; the other modes
        // leave both at the workspace default.
        ...(mode === 'batch' ? { platform: spec.platform, group_id: spec.groupId } : {})
      })
      // Shared base: apply the hand-tuned fingerprint to every profile in
      // the batch. Seed + device name + MAC are deliberately excluded (see
      // useSharedFingerprint) so each profile stays individually unique.
      if (mode === 'batch' && spec.fpMode === 'shared') {
        try {
          await updateProfile(p.id, fpPatch())
        } catch {
          /* profile is created; it keeps its own generated fingerprint */
        }
      }
      // Round-robin a free proxy onto each profile as it's made. Best-effort:
      // running out mid-batch must not fail the remaining creates.
      if (mode === 'batch' && spec.proxyMode === 'pool') {
        const next = pool.shift()
        if (next) {
          try {
            await assignProxyToProfile(p.id, {
              id: next.id,
              proxy_type: next.proxy_type,
              host: next.host,
              port: next.port,
              username: next.username,
              password_encrypted: next.password_encrypted,
              source: next.source,
              tubeproxies_ip_id: next.tubeproxies_ip_id
            })
          } catch {
            /* leave unassigned; the profile itself is fine */
          }
        }
      }
      created.push(p)
    } catch (e) {
      errors.push({ name: r.name, message: (e as Error).message })
    }
    onProgress()
  }

  return { created, errors }
}
