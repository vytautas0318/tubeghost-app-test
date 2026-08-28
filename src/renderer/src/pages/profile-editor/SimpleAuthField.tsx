// Simple-mode Authenticator tile: link an existing token to this profile, or
// enroll a new one — both inline, per the design.
//
// Wired to the existing authenticator feature (lib/authenticator): linking sets
// assigned_profile_id, and "Add new" goes through createAuthToken, which
// encrypts the seed server-side via the Edge Function. No 2FA logic is
// reimplemented here.

import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Shield, X } from 'lucide-react'
import {
  createAuthToken,
  listAuthTokens,
  updateAuthToken,
  type AuthPlatform,
  type AuthTokenRow
} from '@tubeghost/ui'
import { useHasPermission } from '@/lib/permissions'
import { AuthLinkPopover } from './AuthLinkPopover'

const SERVICES: { value: AuthPlatform; label: string }[] = [
  { value: 'yt', label: 'YouTube' },
  { value: 'ig', label: 'Instagram' },
  { value: 'tt', label: 'TikTok' },
  { value: 'x', label: 'X' },
  { value: 'fb', label: 'Facebook' },
  { value: 'am', label: 'Amazon' },
  { value: 'other', label: 'Other' }
]

export function SimpleAuthField({
  profileId,
  workspaceId,
  onToast
}: {
  profileId: string | null
  workspaceId: string | null
  onToast?: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  const canManage = useHasPermission('twofa.manage_tokens')
  const [tokens, setTokens] = useState<AuthTokenRow[]>([])
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'link' | 'new'>('link')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ platform: 'yt' as AuthPlatform, handle: '', secret: '' })
  const wrapRef = useRef<HTMLDivElement>(null)

  const reload = (): void => {
    if (!workspaceId) return
    void listAuthTokens(workspaceId)
      .then(setTokens)
      .catch(() => undefined)
  }
  useEffect(reload, [workspaceId])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const linked = useMemo(
    () => tokens.find((t) => t.assigned_profile_id === profileId) ?? null,
    [tokens, profileId]
  )

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tokens.filter(
      (t) =>
        !needle || `${t.issuer} ${t.handle ?? ''} ${t.label ?? ''}`.toLowerCase().includes(needle)
    )
  }, [tokens, q])

  const link = async (t: AuthTokenRow): Promise<void> => {
    if (!profileId) return
    setBusy(true)
    try {
      await updateAuthToken(t.id, { assigned_profile_id: profileId })
      setOpen(false)
      reload()
      onToast?.('info', 'Authenticator linked')
    } catch (e) {
      onToast?.('error', `Could not link token: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const unlink = async (): Promise<void> => {
    if (!linked) return
    setBusy(true)
    try {
      await updateAuthToken(linked.id, { assigned_profile_id: null })
      reload()
      onToast?.('info', 'Authenticator unlinked')
    } catch (e) {
      onToast?.('error', `Could not unlink token: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const addAndLink = async (): Promise<void> => {
    if (!workspaceId || !profileId) return
    const handle = draft.handle.trim().startsWith('@')
      ? draft.handle.trim()
      : `@${draft.handle.trim()}`
    setBusy(true)
    try {
      await createAuthToken({
        workspace_id: workspaceId,
        platform: draft.platform,
        issuer: SERVICES.find((s) => s.value === draft.platform)?.label ?? 'Other',
        handle,
        secret: draft.secret.trim(),
        assigned_profile_id: profileId
      })
      setDraft({ platform: 'yt', handle: '', secret: '' })
      setOpen(false)
      reload()
      onToast?.('info', 'Token added and linked to this profile')
    } catch (e) {
      onToast?.('error', `Could not add token: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sa-cred-f" ref={wrapRef} onClick={(e) => e.stopPropagation()}>
      <label>Authenticator</label>
      {linked ? (
        <div className="sa-linked">
          <span className="sa-lk-ic au">
            <Shield />
          </span>
          <span className="sa-lk-v">
            {linked.issuer}
            {linked.handle ? ` · ${linked.handle}` : ''}
          </span>
          <button
            type="button"
            className="sa-lk-x"
            aria-label="Unlink authenticator"
            disabled={busy || !canManage}
            onClick={() => void unlink()}
          >
            <X />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="sa-link-btn"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={!canManage || !profileId}
          onClick={() => {
            setQ('')
            setOpen((v) => !v)
          }}
        >
          <Plus />
          Link or add a token
        </button>
      )}

      {open && (
        <AuthLinkPopover
          tab={tab}
          setTab={setTab}
          q={q}
          setQ={setQ}
          list={list}
          busy={busy}
          draft={draft}
          setDraft={setDraft}
          services={SERVICES}
          onLink={(t) => void link(t)}
          onAddAndLink={() => void addAndLink()}
        />
      )}
    </div>
  )
}
