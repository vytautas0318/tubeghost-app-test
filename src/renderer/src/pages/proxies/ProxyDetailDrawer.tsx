import * as React from 'react'
import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import type { ProxyRow } from '@/lib/proxies'
import { SourceBadge, StatusPill } from './badges'
import { ProxyEditFields } from './ProxyEditFields'
import { ProxyConnectionEdit } from './ProxyConnectionEdit'
import { Connection, Geo, Operational } from './ProxyDetailSections'
import { draftDiffers, draftFromRow, type ConnectionDraft } from './connectionDraft'

export function ProxyDetailDrawer({
  proxy,
  profileCount,
  profileNumbers,
  canEdit,
  canDelete,
  canTest,
  onClose,
  onDelete,
  onTest,
  onPatch,
  onSaveConnection
}: {
  proxy: ProxyRow
  profileCount: number
  profileNumbers: number[]
  canEdit: boolean
  canDelete: boolean
  canTest: boolean
  onClose: () => void
  onDelete: () => void
  onTest: () => void
  onPatch: (patch: Partial<Pick<ProxyRow, 'label' | 'notes'>>) => Promise<void>
  // Saves protocol/host/port/credentials as one unit and re-syncs the
  // profiles assigned to this proxy. Custom proxies only.
  onSaveConnection: (draft: ConnectionDraft) => Promise<void>
}): React.ReactElement {
  const [showPassword, setShowPassword] = useState(false)
  const [label, setLabel] = useState(proxy.label ?? '')
  const [notes, setNotes] = useState(proxy.notes ?? '')
  const [conn, setConn] = useState<ConnectionDraft>(() => draftFromRow(proxy))
  const [savingLabel, setSavingLabel] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingConn, setSavingConn] = useState(false)

  useEffect(() => {
    setLabel(proxy.label ?? '')
    setNotes(proxy.notes ?? '')
    setConn(draftFromRow(proxy))
  }, [proxy])

  const labelDirty = (label || null) !== (proxy.label || null)
  const notesDirty = (notes || null) !== (proxy.notes || null)
  // Purchased rows route through proxy_annotations and their connection data
  // is TubeProxies-owned -- editing it here would be silently dropped.
  const canEditConnection = proxy.source === 'custom'
  const connDirty = draftDiffers(conn, proxy)
  const copy = (v: string): void => void navigator.clipboard.writeText(v)

  return (
    // fixed (not absolute): the drawer must pin to the viewport and span full
    // height. The Proxies page container is `overflow-auto relative`, so an
    // absolutely-positioned overlay sized to inset-0 covers only the scrolled
    // slice and clips as the list scrolls (the half-rendered-drawer bug). fixed
    // takes it out of that scroll context entirely.
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[480px] h-full bg-[var(--bg)] border-l border-[var(--line)] overflow-auto shadow-[var(--shadow-pop)]"
      >
        <Header proxy={proxy} onClose={onClose} />
        <div className="p-5 space-y-5">
          <Connection
            proxy={proxy}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            copy={copy}
          />
          <Geo proxy={proxy} />
          <Operational
            proxy={proxy}
            profileCount={profileCount}
            profileNumbers={profileNumbers}
            canTest={canTest}
            onTest={onTest}
          />
          {canEdit && canEditConnection && (
            <ProxyConnectionEdit
              draft={conn}
              dirty={connDirty}
              saving={savingConn}
              profileCount={profileCount}
              onChange={setConn}
              onSave={async () => {
                setSavingConn(true)
                try {
                  await onSaveConnection(conn)
                } finally {
                  setSavingConn(false)
                }
              }}
            />
          )}
          {canEdit && (
            <ProxyEditFields
              label={label}
              notes={notes}
              labelDirty={labelDirty}
              notesDirty={notesDirty}
              savingLabel={savingLabel}
              savingNotes={savingNotes}
              onLabelChange={setLabel}
              onNotesChange={setNotes}
              onSaveLabel={async () => {
                setSavingLabel(true)
                await onPatch({ label: label || null })
                setSavingLabel(false)
              }}
              onSaveNotes={async () => {
                setSavingNotes(true)
                await onPatch({ notes: notes || null })
                setSavingNotes(false)
              }}
            />
          )}
          {canDelete && <Danger proxy={proxy} profileCount={profileCount} onDelete={onDelete} />}
        </div>
      </div>
    </div>
  )
}

function Header({ proxy, onClose }: { proxy: ProxyRow; onClose: () => void }): React.ReactElement {
  return (
    <div className="px-5 py-4 border-b border-[var(--line)] flex items-start justify-between sticky top-0 bg-[var(--bg)] z-10">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <SourceBadge source={proxy.source} />
          <StatusPill status={proxy.status} />
        </div>
        <h3 className="text-lg font-bold text-[var(--t1)] truncate">
          {proxy.label || `${proxy.host}:${proxy.port}`}
        </h3>
      </div>
      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-brand-surface dark:hover:bg-night-surface text-[var(--t3)] shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function Danger({
  proxy,
  profileCount,
  onDelete
}: {
  proxy: ProxyRow
  profileCount: number
  onDelete: () => void
}): React.ReactElement {
  // Purchased proxies belong to the user's TubeProxies subscription and are
  // read live — there is no local row to delete. Cancelling happens there.
  if (proxy.source === 'tubeproxies') {
    return (
      <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4">
        <p className="text-xs text-[var(--t3)]">
          This proxy comes from your TubeProxies subscription. To cancel or swap it, manage it on
          tubeproxies.com — it updates here automatically.
        </p>
      </section>
    )
  }
  return (
    <section className="bg-[var(--panel)] border border-[var(--red)]/20 rounded-xl p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--red)] mb-2">
        Danger zone
      </h3>
      <p className="text-xs text-[var(--t3)] mb-3">
        Deletes this proxy.{' '}
        {profileCount > 0 && (
          <span>
            <strong>{profileCount}</strong> profile{profileCount === 1 ? '' : 's'} using it will
            become proxyless.
          </span>
        )}
      </p>
      <button
        onClick={onDelete}
        className="w-full px-3 py-2 text-xs font-medium border border-[var(--red)]/25 text-[var(--red)] rounded-lg hover:bg-[var(--red-soft)] flex items-center justify-center gap-1.5"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete proxy
      </button>
    </section>
  )
}
