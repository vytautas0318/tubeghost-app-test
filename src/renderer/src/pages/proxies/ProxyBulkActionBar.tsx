// Bulk-action bar for the Proxies table — renders only when rows are selected.
// Mirrors the Profiles list's BulkActionBar; the selection checkboxes shipped
// before any action was wired to them, which left the column decorative.
//
// Source matters here: Test / Tag / Copy / Export apply to any proxy, but
// Delete is CUSTOM-only (purchased proxies are cancelled from the TubeProxies
// subscription) and refuses rows still assigned to a profile.
//
// Permission gating is the caller's job; RLS is the real enforcement.

import * as React from 'react'
import { useMemo, useState } from 'react'
import { Copy, Download, Tag, TagsIcon, Trash2, X, Zap } from 'lucide-react'
import { updateProxyRow } from '@/lib/proxies'
import type { ViewProxy } from './types'
import { toLines } from './proxy-lines'
import { BarButton, ConfirmDeleteModal, SetTagModal } from './ProxyBulkActionBarParts'

export interface ProxyBulkActionBarProps {
  selectedRows: ViewProxy[]
  canEdit: boolean
  canDelete: boolean
  canTest: boolean
  onClear: () => void
  // Runs the existing single-proxy test for one row; the bar sequences them.
  onTestOne: (row: ViewProxy) => Promise<void>
  // Deletes one row (no confirm — the bar confirms once for the batch).
  onDeleteOne: (row: ViewProxy) => Promise<void>
  onPatchLocal: (id: string, patch: Partial<ViewProxy>) => void
  onToast: (kind: 'success' | 'error' | 'info', text: string) => void
}

type Modal = null | { kind: 'tag' } | { kind: 'delete' }

export function ProxyBulkActionBar({
  selectedRows,
  canEdit,
  canDelete,
  canTest,
  onClear,
  onTestOne,
  onDeleteOne,
  onPatchLocal,
  onToast
}: ProxyBulkActionBarProps): React.ReactElement | null {
  const [modal, setModal] = useState<Modal>(null)
  const [working, setWorking] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testProgress, setTestProgress] = useState('Test')

  const count = selectedRows.length

  // Only custom rows can be deleted, and only when no profile uses them.
  const deletable = useMemo(
    () => selectedRows.filter((p) => p.source === 'custom' && p.profileCount === 0),
    [selectedRows]
  )
  const taggable = useMemo(() => selectedRows.filter((p) => (p.label ?? '') !== ''), [selectedRows])

  if (count === 0) return null

  const close = (): void => setModal(null)

  // Sequential, not parallel: the proxy-test Edge Function is rate-limited per
  // workspace and a burst of 20 gets throttled into false failures.
  const onTestAll = async (): Promise<void> => {
    if (testing) return
    setTesting(true)
    try {
      let done = 0
      for (const row of selectedRows) {
        setTestProgress(`${done} / ${count}`)
        await onTestOne(row)
        done += 1
      }
      setTestProgress(`${done} / ${count}`)
    } finally {
      setTesting(false)
      setTestProgress('Test')
    }
  }

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(toLines(selectedRows))
      onToast('success', `Copied ${count} ${count === 1 ? 'proxy' : 'proxies'}`)
    } catch (e) {
      onToast('error', (e as Error).message)
    }
  }

  // Browser download: the desktop app writes the file through a native save
  // dialog (window.api.files.saveText), which does not exist here. An object
  // URL on a synthetic <a download> is the web equivalent — no dialog, so the
  // file lands in the browser's downloads folder and there is no "cancelled"
  // state to report.
  const onExport = (): void => {
    try {
      const blob = new Blob([toLines(selectedRows)], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'proxies.txt'
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoke on the next tick — revoking synchronously can race the click
      // in some browsers and produce an empty file.
      setTimeout(() => URL.revokeObjectURL(url), 0)
      onToast('success', `Exported ${count} ${count === 1 ? 'proxy' : 'proxies'}`)
    } catch (e) {
      onToast('error', (e as Error).message)
    }
  }

  // Tagging writes label via updateProxyRow, which routes purchased rows to
  // their ghost-side annotation. Partial failures are reported, not swallowed.
  const applyTag = async (label: string): Promise<void> => {
    if (working) return
    setWorking(true)
    let ok = 0
    const failures: string[] = []
    try {
      for (const row of selectedRows) {
        try {
          await updateProxyRow(row, { label })
          onPatchLocal(row.id, { label })
          ok += 1
        } catch (e) {
          failures.push(`${row.host}: ${(e as Error).message}`)
        }
      }
      if (failures.length === 0) {
        onToast(
          'success',
          label ? `Tagged ${ok} ${ok === 1 ? 'proxy' : 'proxies'}` : `Cleared ${ok} tags`
        )
      } else {
        onToast('error', `${ok} updated, ${failures.length} failed — ${failures[0]}`)
      }
      close()
    } finally {
      setWorking(false)
    }
  }

  const runDelete = async (): Promise<void> => {
    if (working) return
    setWorking(true)
    let ok = 0
    const failures: string[] = []
    try {
      for (const row of deletable) {
        try {
          await onDeleteOne(row)
          ok += 1
        } catch (e) {
          failures.push(`${row.host}: ${(e as Error).message}`)
        }
      }
      if (failures.length === 0) {
        onToast('success', `Deleted ${ok} ${ok === 1 ? 'proxy' : 'proxies'}`)
        onClear()
      } else {
        onToast('error', `${ok} deleted, ${failures.length} failed — ${failures[0]}`)
      }
      close()
    } finally {
      setWorking(false)
    }
  }

  const undeletable = count - deletable.length

  return (
    <>
      <div className="tp-bulkbar border-t border-[var(--line)] px-4 py-2 flex items-center gap-2 text-sm flex-wrap">
        <span className="text-[var(--t1)] font-medium">{count} selected</span>
        <span className="text-[var(--t4)]">·</span>
        {canTest && (
          <BarButton
            icon={<Zap className={'w-3.5 h-3.5' + (testing ? ' animate-pulse' : '')} />}
            label={testing ? testProgress : 'Test'}
            onClick={() => void onTestAll()}
            disabled={testing}
          />
        )}
        {canEdit && (
          <>
            <BarButton
              icon={<Tag className="w-3.5 h-3.5" />}
              label="Set tag"
              onClick={() => setModal({ kind: 'tag' })}
            />
            <BarButton
              icon={<TagsIcon className="w-3.5 h-3.5" />}
              label="Clear tag"
              onClick={() => void applyTag('')}
              disabled={working || taggable.length === 0}
              title={taggable.length === 0 ? 'None of the selected proxies have a tag' : undefined}
            />
          </>
        )}
        <BarButton
          icon={<Copy className="w-3.5 h-3.5" />}
          label="Copy"
          onClick={() => void onCopy()}
        />
        <BarButton
          icon={<Download className="w-3.5 h-3.5" />}
          label="Export"
          onClick={() => void onExport()}
        />
        {canDelete && (
          <BarButton
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label="Delete"
            danger
            onClick={() => setModal({ kind: 'delete' })}
            disabled={deletable.length === 0}
            title={
              deletable.length === 0
                ? 'Purchased proxies are cancelled in your subscription; in-use proxies must be unassigned first'
                : undefined
            }
          />
        )}
        <span className="ml-auto" />
        <button
          onClick={onClear}
          className="text-xs text-[var(--t3)] hover:text-[var(--t1)] dark:hover:text-night-text inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Clear selection
        </button>
      </div>

      {modal?.kind === 'tag' && (
        <SetTagModal count={count} working={working} onCancel={close} onSubmit={applyTag} />
      )}

      {modal?.kind === 'delete' && (
        <ConfirmDeleteModal
          count={deletable.length}
          skipped={undeletable}
          working={working}
          onCancel={close}
          onConfirm={() => void runDelete()}
        />
      )}
    </>
  )
}
