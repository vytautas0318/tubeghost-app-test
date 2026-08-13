// AskBar — "Describe what you want and TubeGhost sets it up…".
//
// Port of the design system's AskBar.jsx, backed by the real assistant
// instead of its regex mock. Its reason for existing, from the design:
// "Sits under the hero so the 'don't touch 40 fields' promise of Simple has
// a natural entry point."
//
// Division of labour, which is the whole point of the design:
//   * the MODEL decides WHAT the user asked for (closed intent set,
//     shared/assistant/profilePatch.ts)
//   * this component decides HOW each intent is carried out — so "switch to
//     mac" runs the same coherent device regeneration the Device tile uses,
//     and a proxy request is matched against the real pool rather than
//     invented
//   * nothing happens invisibly: every change is listed, and Undo restores
//     the exact prior values.

import * as React from 'react'
import { useState } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import {
  assignProxyToProfile,
  clearProfileProxy,
  updateProfile,
  type ProfileRow
} from '@/lib/profiles'
import type { ProxyRow } from '@/lib/proxies'
import { createGroup, type GroupRow } from '@/lib/groups'
import { askProfilePatch, buildAskContext, resolveProxy } from '@/lib/profile-ask'
import type { PatchIntent } from '../../../../shared/assistant/profilePatch'
import { newFingerprintPatch, optimizedPatch } from './simpleFingerprint'
import type { FormState } from './types'

const EXAMPLES = [
  'Make it a mac profile on the Dallas IP',
  'Tag it flagship and put it in Crime Dynasty',
  'Fresh fingerprint, optimized for YouTube'
]

// What Undo restores. Only the fields an intent can touch — restoring the
// whole row would clobber anything changed in another tab meanwhile.
interface Snapshot {
  form: FormState
  row: Pick<ProfileRow, 'platform' | 'proxy_host' | 'proxy_port' | 'google_optimized'>
  // The full row as it was, for the columns a fingerprint/proxy change
  // rewrites. Restored wholesale because those columns only make sense
  // together.
  fullRow: ProfileRow
}

const GROUP_COLOR = '#6B7280'

export function AskBar({
  profile,
  form,
  setForm,
  groups,
  groupName,
  proxies,
  allTags,
  workspaceId,
  canEdit,
  onProfileSaved,
  onToast
}: {
  profile: ProfileRow
  form: FormState
  setForm: (f: FormState) => void
  groups: GroupRow[]
  groupName: string
  proxies: ProxyRow[]
  allTags: string[]
  workspaceId: string
  canEdit: boolean
  onProfileSaved: (p: ProfileRow) => void
  onToast: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<{ changes: string[]; snap: Snapshot } | null>(null)

  // Applies validated intents in order and returns a human list of what
  // changed. Row writes are sequential on purpose: they all UPDATE the same
  // row, so running them in parallel would race and the last write would win.
  const applyIntents = async (intents: PatchIntent[]): Promise<string[]> => {
    const changes: string[] = []
    let nextForm = form
    let row = profile

    for (const it of intents) {
      switch (it.kind) {
        case 'set_os': {
          const label = it.os === 'macos' ? 'macOS' : 'Windows'
          const already = (row.platform ?? '').includes('mac') === (it.os === 'macos')
          if (already) break
          // Same path as the Device tile — never a bare platform write.
          row = await updateProfile(row.id, newFingerprintPatch(it.os, row.brand_version))
          changes.push(`Device → ${label}`)
          break
        }
        case 'set_proxy': {
          const hit = resolveProxy(it.query, proxies)
          if (!hit) {
            changes.push(`No proxy matched “${it.query}”`)
            break
          }
          row = await assignProxyToProfile(row.id, {
            id: hit.id,
            proxy_type: hit.proxy_type,
            host: hit.host,
            port: hit.port,
            username: hit.username,
            password_encrypted: hit.password_encrypted,
            source: hit.source,
            tubeproxies_ip_id: hit.tubeproxies_ip_id
          })
          changes.push(`Proxy → ${hit.host}:${hit.port}${hit.city ? ` (${hit.city})` : ''}`)
          break
        }
        case 'clear_proxy': {
          if (!row.proxy_host) break
          row = await clearProfileProxy(row.id)
          changes.push('Proxy → none')
          break
        }
        case 'new_fingerprint': {
          row = await updateProfile(row.id, newFingerprintPatch(row.platform, row.brand_version))
          changes.push('New fingerprint')
          break
        }
        case 'set_optimized': {
          if (row.google_optimized === it.on) break
          row = await updateProfile(row.id, optimizedPatch(it.on))
          changes.push(`Optimized for YouTube → ${it.on ? 'on' : 'off'}`)
          break
        }
        case 'set_group': {
          const existing = groups.find((g) => g.name.toLowerCase() === it.name.toLowerCase())
          const id = existing?.id ?? (await createGroup(workspaceId, it.name, GROUP_COLOR)).id
          if (nextForm.group_id === id) break
          nextForm = { ...nextForm, group_id: id }
          changes.push(`Group → ${existing?.name ?? it.name}`)
          break
        }
        case 'add_tags': {
          const add = it.names.filter((n) => !nextForm.tags.includes(n))
          if (!add.length) break
          nextForm = { ...nextForm, tags: [...nextForm.tags, ...add] }
          changes.push(`Tags → ${add.join(', ')}`)
          break
        }
        case 'remove_tags': {
          const gone = it.names.filter((n) => nextForm.tags.includes(n))
          if (!gone.length) break
          nextForm = { ...nextForm, tags: nextForm.tags.filter((t) => !gone.includes(t)) }
          changes.push(`Removed tags → ${gone.join(', ')}`)
          break
        }
        case 'set_name': {
          if (nextForm.name === it.name) break
          nextForm = { ...nextForm, name: it.name }
          changes.push(`Name → ${it.name}`)
          break
        }
      }
    }

    if (nextForm !== form) setForm(nextForm)
    if (row !== profile) onProfileSaved(row)
    return changes
  }

  const run = async (text: string): Promise<void> => {
    const t = text.trim()
    if (!t || busy || !canEdit) return
    setBusy(true)
    setDone(null)
    const snap: Snapshot = {
      form,
      row: {
        platform: profile.platform,
        proxy_host: profile.proxy_host,
        proxy_port: profile.proxy_port,
        google_optimized: profile.google_optimized
      },
      fullRow: profile
    }
    try {
      const context = buildAskContext({
        profile,
        groupName,
        proxies,
        groups: groups.map((g) => g.name),
        tags: allTags
      })
      const parsed = await askProfilePatch(t, context)
      const changes = await applyIntents(parsed.intents)
      setQ('')
      if (changes.length) {
        setDone({ changes, snap })
        setOpen(false)
        onToast('info', `${changes.length} change${changes.length === 1 ? '' : 's'} applied`)
      } else {
        onToast(
          'info',
          parsed.reply ||
            parsed.errors[0] ||
            'Nothing to change — try naming a device, proxy, group or tag'
        )
      }
    } catch (e) {
      onToast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Restores the row columns wholesale (a fingerprint or proxy change
  // rewrites a coherent set that only makes sense together) and the form
  // fields as they were.
  const undo = async (): Promise<void> => {
    if (!done) return
    const { snap } = done
    setBusy(true)
    try {
      const r = snap.fullRow
      onProfileSaved(
        await updateProfile(r.id, {
          platform: r.platform,
          platform_version: r.platform_version,
          brand: r.brand,
          brand_version: r.brand_version,
          user_agent: r.user_agent,
          fingerprint_seed: r.fingerprint_seed,
          webgl_vendor: r.webgl_vendor,
          webgl_renderer: r.webgl_renderer,
          hardware_concurrency: r.hardware_concurrency,
          device_memory: r.device_memory,
          screen_resolution: r.screen_resolution,
          device_name: r.device_name,
          mac_address: r.mac_address,
          google_optimized: r.google_optimized,
          webrtc_mode: r.webrtc_mode,
          timezone_mode: r.timezone_mode,
          language_mode: r.language_mode,
          location_mode: r.location_mode,
          display_language_mode: r.display_language_mode,
          webgpu_mode: r.webgpu_mode,
          proxy_id: r.proxy_id,
          proxy_type: r.proxy_type,
          proxy_host: r.proxy_host,
          proxy_port: r.proxy_port,
          proxy_user: r.proxy_user,
          proxy_pass: r.proxy_pass,
          proxy_source: r.proxy_source,
          tubeproxies_ip_id: r.tubeproxies_ip_id
        })
      )
      setForm(snap.form)
      setDone(null)
      onToast('info', 'Reverted')
    } catch (e) {
      onToast('error', `Undo failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ask">
      <div className="ask-bar">
        <span className="ask-ic" aria-hidden="true">
          <Sparkles />
        </span>
        <input
          value={q}
          placeholder="Describe what you want and TubeGhost sets it up…"
          aria-label="Ask TubeGhost to set this profile up"
          disabled={!canEdit}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run(q)
            if (e.key === 'Escape') {
              setOpen(false)
              e.currentTarget.blur()
            }
          }}
        />
        <button
          type="button"
          className={'ask-go' + (q.trim() ? ' ready' : '')}
          disabled={busy || !q.trim() || !canEdit}
          onClick={() => void run(q)}
        >
          {busy ? 'Working…' : 'Ask'}
        </button>
      </div>

      {open && !q && !done && (
        <div className="ask-ex">
          <span className="ask-ex-k">Try</span>
          {EXAMPLES.map((x, i) => (
            <button
              type="button"
              key={x}
              className="ask-chip"
              style={{ animationDelay: `${60 + i * 70}ms` }}
              onClick={() => {
                setQ(x)
                void run(x)
              }}
            >
              {x}
            </button>
          ))}
        </div>
      )}

      {done && (
        <div className="ask-done" role="status">
          <span className="ask-done-k">
            <Check />
            Applied
          </span>
          <span className="ask-done-l">{done.changes.join(' · ')}</span>
          <button type="button" className="ask-undo" disabled={busy} onClick={() => void undo()}>
            Undo
          </button>
          <button
            type="button"
            className="ask-x"
            aria-label="Dismiss"
            onClick={() => setDone(null)}
          >
            <X />
          </button>
        </div>
      )}
    </div>
  )
}
