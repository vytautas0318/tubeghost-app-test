import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Download, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useHasPermission } from '@/lib/permissions'
import { importProfile } from '@/lib/profiles'
import {
  importCookiesFile,
  importForeignFile,
  VENDOR_ACCEPT,
  type ImportVendor
} from '@/lib/importers'
import { useWorkspace } from '@/store/workspace'
import { ViewSwitch } from './ViewSwitch'
import type { ProfilesView } from './cardViewState'

// What the hidden file input is currently picking for.
type ImportSource = ImportVendor | 'tubeghost' | 'cookies'

const MIGRATIONS: { vendor: ImportVendor; name: string; sub: string }[] = [
  { vendor: 'multilogin', name: 'MultiLogin', sub: 'Profiles + cookies via export file (.json)' },
  { vendor: 'adspower', name: 'AdsPower', sub: 'Bulk import via CSV or Excel (.xlsx) export' },
  { vendor: 'gologin', name: 'GoLogin', sub: 'Profiles + proxies (.json)' },
  { vendor: 'dolphin', name: 'Dolphin{anty}', sub: 'Profiles + cookies (.json)' },
  { vendor: 'incogniton', name: 'Incogniton', sub: 'Profiles via CSV or Excel (.xlsx)' }
]

export function ProfilesListHeader({
  count,
  openCount,
  onImported,
  onToast,
  view,
  onViewChange
}: {
  count: number
  openCount: number
  onImported?: () => void
  onToast?: (kind: 'error' | 'info', text: string) => void
  // Simple ⇄ Advanced. Omitted on the loading/error headers, which have no
  // profiles to show either way.
  view?: ProfilesView
  onViewChange?: (v: ProfilesView) => void
}): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const navigate = useNavigate()
  const canCreate = useHasPermission('profiles.create')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<ImportSource>('tubeghost')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toast = (kind: 'error' | 'info', msg: string): void => {
    if (onToast) onToast(kind, msg)
    else window.alert(msg)
  }

  const pickFile = (src: ImportSource): void => {
    setOpen(false)
    setSource(src)
    // Set the accept filter before opening the native picker.
    const accept =
      src === 'tubeghost'
        ? '.json,application/json'
        : src === 'cookies'
          ? '.json,.txt,application/json,text/plain'
          : VENDOR_ACCEPT[src]
    const input = fileInputRef.current
    if (!input) return
    input.setAttribute('accept', accept)
    input.click()
  }

  const onFile = async (file: File): Promise<void> => {
    if (!workspace || busy) return
    setBusy(true)
    try {
      if (source === 'tubeghost') {
        await importProfile(await file.text(), workspace.workspace_id)
        toast('info', 'Profile imported')
      } else if (source === 'cookies') {
        const { name, count: n } = await importCookiesFile(file, workspace.workspace_id)
        toast('info', `Imported ${n} cookies into new profile “${name}”`)
      } else {
        const s = await importForeignFile(file, workspace.workspace_id)
        if (s.created === 0) {
          toast('error', `Import failed: ${s.errors[0] ?? 'no profiles created'}`)
        } else {
          toast(
            'info',
            `Imported ${s.created} profile${s.created === 1 ? '' : 's'}` +
              (s.failed > 0 ? ` · ${s.failed} failed` : '')
          )
        }
      }
      onImported?.()
    } catch (e) {
      toast('error', `Import failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="px-8 pt-6 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-[650] tracking-[-0.4px] text-[var(--t1)]">Profiles</h1>
        <p className="text-[13.5px] text-[var(--t2)] mt-1">
          {count} browser {count === 1 ? 'profile' : 'profiles'} · {openCount} running now
        </p>
      </div>
      <div className="phead-right flex items-center gap-2.5">
        {view && onViewChange && <ViewSwitch view={view} onChange={onViewChange} />}
        {canCreate && (
          <div className="phead-actions flex items-center gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => navigate('/profiles/new')}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[var(--r)] bg-[var(--red)] hover:bg-[var(--red-hover)] text-[13px] font-[550] text-white shadow-[var(--shadow)] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create profile
            </button>
            <div className="import-wrap" ref={wrapRef}>
              <button
                onClick={() => setOpen((v) => !v)}
                disabled={busy}
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--hover)] text-[13px] font-[550] text-[var(--t1)] shadow-[var(--shadow)] transition-colors disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                {busy ? 'Importing…' : 'Import'}
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </button>
              {open && (
                <div className="import-pop">
                  <div className="import-sec">Migrate from another browser</div>
                  {MIGRATIONS.map((m) => (
                    <div className="import-item" key={m.vendor} onClick={() => pickFile(m.vendor)}>
                      <div className="import-id">
                        <div className="import-name">{m.name}</div>
                        <div className="import-sub">{m.sub}</div>
                      </div>
                      <ChevronRight />
                    </div>
                  ))}
                  <div className="import-sep" />
                  <div className="import-sec">From a file</div>
                  <div className="import-item" onClick={() => pickFile('tubeghost')}>
                    <div className="import-id">
                      <div className="import-name">Profile file (.json)</div>
                      <div className="import-sub">A TubeGhost profile export</div>
                    </div>
                    <ChevronRight />
                  </div>
                  <div className="import-item" onClick={() => pickFile('csv')}>
                    <div className="import-id">
                      <div className="import-name">CSV / Excel</div>
                      <div className="import-sub">
                        .csv or .xlsx — columns auto-mapped to profile fields
                      </div>
                    </div>
                    <ChevronRight />
                  </div>
                  <div className="import-item" onClick={() => pickFile('cookies')}>
                    <div className="import-id">
                      <div className="import-name">Cookies (JSON / TXT)</div>
                      <div className="import-sub">Netscape or JSON cookie files</div>
                    </div>
                    <ChevronRight />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
