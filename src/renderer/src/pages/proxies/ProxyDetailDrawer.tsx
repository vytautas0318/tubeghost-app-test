import * as React from 'react'
import { useEffect, useState } from 'react'
import { ChevronRight, Copy, Eye, EyeOff, Trash2, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { ProxyRow } from '@/lib/proxies'
import { SourceBadge, StatusPill } from './badges'
import { Flag } from '@/components/Flag'
import { DrawerSection, KV, KVCopy } from './drawer-parts'
import { ProxyEditFields } from './ProxyEditFields'

export function ProxyDetailDrawer({
  proxy,
  profileCount,
  canEdit,
  canDelete,
  canTest,
  onClose,
  onDelete,
  onTest,
  onPatch
}: {
  proxy: ProxyRow
  profileCount: number
  canEdit: boolean
  canDelete: boolean
  canTest: boolean
  onClose: () => void
  onDelete: () => void
  onTest: () => void
  onPatch: (patch: Partial<Pick<ProxyRow, 'label' | 'notes'>>) => Promise<void>
}): React.ReactElement {
  const [showPassword, setShowPassword] = useState(false)
  const [label, setLabel] = useState(proxy.label ?? '')
  const [notes, setNotes] = useState(proxy.notes ?? '')
  const [savingLabel, setSavingLabel] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    setLabel(proxy.label ?? '')
    setNotes(proxy.notes ?? '')
  }, [proxy.id, proxy.label, proxy.notes])

  const labelDirty = (label || null) !== (proxy.label || null)
  const notesDirty = (notes || null) !== (proxy.notes || null)
  const copy = (v: string): void => void navigator.clipboard.writeText(v)

  return (
    <div className="absolute inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[480px] h-full bg-[var(--bg)] border-l border-[var(--line)] overflow-auto shadow-[var(--shadow-pop)]"
      >
        <Header proxy={proxy} onClose={onClose} />
        <div className="p-5 space-y-5">
          <Connection proxy={proxy} showPassword={showPassword} setShowPassword={setShowPassword} copy={copy} />
          <Geo proxy={proxy} />
          <Operational proxy={proxy} profileCount={profileCount} canTest={canTest} onTest={onTest} />
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
      <button onClick={onClose} className="p-1 rounded hover:bg-brand-surface dark:hover:bg-night-surface text-[var(--t3)] shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function Connection({
  proxy,
  showPassword,
  setShowPassword,
  copy
}: {
  proxy: ProxyRow
  showPassword: boolean
  setShowPassword: (v: boolean | ((v: boolean) => boolean)) => void
  copy: (v: string) => void
}): React.ReactElement {
  return (
    <DrawerSection title="Connection">
      <div className="space-y-2.5 text-xs">
        <KV k="Type" v={proxy.proxy_type.toUpperCase()} mono />
        <KVCopy k="Host" v={`${proxy.host}:${proxy.port}`} onCopy={copy} />
        {proxy.username && <KVCopy k="Username" v={proxy.username} onCopy={copy} />}
        {proxy.password_encrypted && (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[var(--t3)]">Password</span>
            <div className="flex items-center gap-1.5">
              <span className="mono text-[var(--t1)]">
                {showPassword ? proxy.password_encrypted : '••••••••'}
              </span>
              <button onClick={() => setShowPassword((v) => !v)} className="p-0.5 text-[var(--t4)] hover:text-[var(--t1)] dark:hover:text-night-text">
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => copy(proxy.password_encrypted ?? '')} className="p-0.5 text-[var(--t4)] hover:text-[var(--t1)] dark:hover:text-night-text">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
      {proxy.status === 'expired' ? (
        // The username/password rows above render nothing here: the server
        // withholds both once a proxy expires (migration 20260804d). Say so,
        // otherwise the Connection section just looks broken.
        <div className="mt-3 text-[11px] text-[var(--amber)] bg-[var(--panel-2)] border border-[var(--line)] rounded p-2">
          This proxy has expired, so its username and password are no longer available. Renew it
          on tubeproxies.com to restore access — the proxy is kept, not deleted.
        </div>
      ) : (
        proxy.source === 'tubeproxies' && (
          <div className="mt-3 text-[11px] text-[var(--t3)] bg-[var(--panel-2)] border border-[var(--line)] rounded p-2">
            Credentials are read live from your TubeProxies account and cannot be edited here.
          </div>
        )
      )}
    </DrawerSection>
  )
}

function Geo({ proxy }: { proxy: ProxyRow }): React.ReactElement {
  return (
    <DrawerSection title="Geo">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <KV
          k="Country"
          title={proxy.country_name ?? proxy.country_code ?? undefined}
          v={
            proxy.country_code ? (
              <>
                <Flag code={proxy.country_code} />
                {proxy.country_name ?? proxy.country_code}
              </>
            ) : (
              '—'
            )
          }
        />
        <KV k="City" v={proxy.city ?? '—'} />
        <KV k="Region" v={proxy.region ?? '—'} />
        <KV k="Timezone" v={proxy.timezone ?? '—'} mono />
      </div>
    </DrawerSection>
  )
}

function Operational({
  proxy,
  profileCount,
  canTest,
  onTest
}: {
  proxy: ProxyRow
  profileCount: number
  canTest: boolean
  onTest: () => void
}): React.ReactElement {
  return (
    <DrawerSection title="Operational">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <KV k="Profiles using" v={String(profileCount)} />
        <KV k="Last egress IP" v={proxy.last_known_egress_ip ?? '—'} mono />
        <KV k="Last tested" v={proxy.last_tested_at ? formatDistanceToNow(new Date(proxy.last_tested_at), { addSuffix: true }) : 'never'} />
        <KV k="Last test ok" v={proxy.last_test_ok === null ? '—' : proxy.last_test_ok ? 'yes' : 'no'} />
        {proxy.expires_at && <KV k="Expires" v={formatDistanceToNow(new Date(proxy.expires_at), { addSuffix: true })} />}
        {proxy.source === 'tubeproxies' && <KV k="Source" v="Live from TubeProxies" />}
      </div>
      {canTest && (
        <button onClick={onTest} className="mt-3 px-3 py-1.5 text-xs font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-white dark:hover:bg-night-raised flex items-center gap-1.5">
          <ChevronRight className="w-3.5 h-3.5" />
          Test connection
        </button>
      )}
    </DrawerSection>
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
          This proxy comes from your TubeProxies subscription. To cancel or swap it, manage it
          on tubeproxies.com — it updates here automatically.
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
            <strong>{profileCount}</strong> profile{profileCount === 1 ? '' : 's'} using it will become proxyless.
          </span>
        )}
      </p>
      <button onClick={onDelete} className="w-full px-3 py-2 text-xs font-medium border border-[var(--red)]/25 text-[var(--red)] rounded-lg hover:bg-[var(--red-soft)] flex items-center justify-center gap-1.5">
        <Trash2 className="w-3.5 h-3.5" />
        Delete proxy
      </button>
    </section>
  )
}
