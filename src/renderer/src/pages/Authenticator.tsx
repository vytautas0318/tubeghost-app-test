import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ToastView, useToast } from '@/components/Toast'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { listProfiles } from '@/lib/profiles'
import { revealSeed } from '@tubeghost/ui'
import { useWorkspaceTags } from '@/lib/useWorkspaceTags'
import { TagManager } from '@/components/TagManager'
import { useAuthData } from './authenticator/useAuthData'
import { AssignPopover, type ProfileOpt } from './authenticator/AuthPopovers'
import { AuthHeader } from './authenticator/AuthHeader'
import { AuthGrid } from './authenticator/AuthGrid'
import { AuthCardMenu } from './authenticator/AuthCardMenu'
import { AddAccountDialog } from './authenticator/AddAccountDialog'
import { AuthDialogs } from './authenticator/AuthDialogs'

type Anchor = { id: string; x: number; y: number }

export function Authenticator(): React.ReactElement {
  const ws = useWorkspace((s) => s.current)
  const workspaceId = ws?.workspace_id ?? null
  const canView = useHasPermission('twofa.view')
  const canCopy = useHasPermission('twofa.generate')
  const canManage = useHasPermission('twofa.manage_tokens')
  const canReveal = useHasPermission('twofa.reveal_seed')

  const canTagCreate = useHasPermission('tags.create')
  const canTagEdit = useHasPermission('tags.edit')
  const canTagDelete = useHasPermission('tags.delete')

  const { tokens, codes, remaining, low, add, remove, patch } = useAuthData(workspaceId, canView)
  const { tags: wsTags, colorFor, createTag, editTag, removeTag } = useWorkspaceTags(workspaceId)
  const { toast, show } = useToast()

  const [profiles, setProfiles] = useState<ProfileOpt[]>([])
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<(Anchor & { up: boolean }) | null>(null)
  const [assign, setAssign] = useState<Anchor | null>(null)
  const [aq, setAq] = useState('')
  const [tagEdit, setTagEdit] = useState<Anchor | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [getApp, setGetApp] = useState(false)
  const [adding, setAdding] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmReveal, setConfirmReveal] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<{ issuer: string; secret: string } | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    listProfiles(workspaceId)
      .then((rows) => setProfiles(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setProfiles([]))
  }, [workspaceId])

  useEffect(() => {
    if (!menu && !assign && !tagEdit && !getApp) return undefined
    const close = (): void => {
      setMenu(null)
      setAssign(null)
      setAq('')
      setTagEdit(null)
      setGetApp(false)
    }
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [menu, assign, tagEdit, getApp])

  const profileName = (id: string | null): string | null =>
    id ? (profiles.find((p) => p.id === id)?.name ?? null) : null

  const copy = (id: string, issuer: string): void => {
    if (!canCopy) return
    const code = codes[id]
    if (!code) {
      show('error', 'Code not loaded yet — retrying on the next refresh')
      return
    }
    try {
      navigator.clipboard?.writeText(code)
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(id)
    show('success', `Code copied · ${issuer}`)
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200)
  }
  const openAssign = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setAq('')
    setAssign({ id, x: r.left, y: r.bottom + 6 })
  }
  const setProfile = (id: string, profId: string | null): void => {
    void patch(id, { assigned_profile_id: profId })
    setAssign(null)
    setAq('')
    show('info', profId ? `Linked to ${profileName(profId)}` : 'Token unassigned')
  }
  const toggleTag = (id: string, key: string): void => {
    const t = tokens.find((x) => x.id === id)
    if (!t) return
    const has = t.tags.includes(key)
    void patch(id, { tags: has ? t.tags.filter((k) => k !== key) : [...t.tags, key] })
  }
  const openTag = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setTagEdit({ id, x: r.left, y: r.bottom + 6 })
  }
  const openMenu = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    const up = r.bottom + 210 > window.innerHeight
    setMenu({ id, x: r.right - 176, y: up ? r.top - 6 : r.bottom + 6, up })
  }
  const doReveal = async (id: string): Promise<void> => {
    const t = tokens.find((x) => x.id === id)
    setConfirmReveal(null)
    try {
      const secret = await revealSeed(id)
      setRevealed({ issuer: t?.issuer ?? 'Account', secret })
    } catch (e) {
      show('error', (e as Error).message)
    }
  }
  const doRemove = async (id: string): Promise<void> => {
    const t = tokens.find((x) => x.id === id)
    setConfirmRemove(null)
    try {
      await remove(id)
      show('success', `${t?.issuer ?? 'Token'} removed`)
    } catch (e) {
      show('error', (e as Error).message)
    }
  }

  const shown = useMemo(
    () =>
      tokens.filter((t) => {
        if (!q) return true
        const hay =
          `${t.issuer} ${t.handle ?? ''} ${t.label ?? ''} ${t.tags.join(' ')}`.toLowerCase()
        return hay.includes(q.toLowerCase())
      }),
    [tokens, q]
  )
  const menuTok = menu && tokens.find((t) => t.id === menu.id)
  const assignTok = assign && tokens.find((t) => t.id === assign.id)
  const tagTok = tagEdit && tokens.find((t) => t.id === tagEdit.id)

  const openAdd = (): void => {
    if (!canManage) {
      show('error', 'You don’t have permission to add tokens')
      return
    }
    setAdding(true)
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <AuthHeader
          count={tokens.length}
          q={q}
          setQ={setQ}
          getApp={getApp}
          setGetApp={setGetApp}
          canManage={canManage}
          onAdd={openAdd}
          toast={(msg) => show('success', msg)}
        />

        <AuthGrid
          tokens={shown}
          codes={codes}
          remaining={remaining}
          low={low}
          canCopy={canCopy}
          canManage={canManage}
          copiedId={copied}
          profileName={profileName}
          colorFor={colorFor}
          onCopy={copy}
          onMenu={openMenu}
          onTag={openTag}
          onAssign={openAssign}
          onAdd={openAdd}
        />
      </div>

      {menuTok && (
        <AuthCardMenu
          x={menu.x}
          y={menu.y}
          up={menu.up}
          canCopy={canCopy}
          canManage={canManage}
          canReveal={canReveal}
          onCopy={() => {
            copy(menuTok.id, menuTok.issuer)
            setMenu(null)
          }}
          onAssign={(e) => {
            openAssign(e, menuTok.id)
            setMenu(null)
          }}
          onReveal={() => {
            setConfirmReveal(menuTok.id)
            setMenu(null)
          }}
          onShare={() => {
            show('info', `Shared ${menuTok.issuer} with the team`)
            setMenu(null)
          }}
          onRemove={() => {
            setConfirmRemove(menuTok.id)
            setMenu(null)
          }}
        />
      )}

      {assignTok && (
        <AssignPopover
          profiles={profiles}
          assignedId={assignTok.assigned_profile_id}
          x={assign.x}
          y={assign.y}
          aq={aq}
          setAq={setAq}
          onPick={(id) => setProfile(assignTok.id, id)}
        />
      )}
      {tagTok && (
        <TagManager
          tags={wsTags}
          attached={tagTok.tags}
          canManage={canTagCreate || canTagEdit || canTagDelete}
          x={tagEdit.x}
          y={tagEdit.y}
          onToggle={(name) => toggleTag(tagTok.id, name)}
          onCreate={(name, color) => {
            if (!canTagCreate) return
            void createTag(name, color)
            toggleTag(tagTok.id, name)
          }}
          onEdit={(id, name, color) => canTagEdit && void editTag(id, name, color)}
          onDelete={(id) => canTagDelete && void removeTag(id)}
        />
      )}

      {adding && workspaceId && (
        <AddAccountDialog
          workspaceId={workspaceId}
          profiles={profiles}
          workspaceTags={wsTags}
          colorFor={colorFor}
          canTagCreate={canTagCreate}
          createTag={createTag}
          onClose={() => setAdding(false)}
          onSave={async (input) => {
            await add(input)
            show('success', `${input.issuer} added`)
          }}
        />
      )}
      <AuthDialogs
        confirmReveal={confirmReveal}
        revealed={revealed}
        confirmRemove={confirmRemove}
        onCancelReveal={() => setConfirmReveal(null)}
        onConfirmReveal={(id) => void doReveal(id)}
        onCloseKey={() => setRevealed(null)}
        onCopyKey={() => {
          try {
            navigator.clipboard?.writeText(revealed?.secret ?? '')
          } catch {
            /* ignore */
          }
          show('success', 'Setup key copied')
          setRevealed(null)
        }}
        onCancelRemove={() => setConfirmRemove(null)}
        onConfirmRemove={(id) => void doRemove(id)}
      />

      <ToastView toast={toast} position="bottom-center" />
    </div>
  )
}
