// Footer actions for the Add Proxies panel: Cancel · Check · Add.
// Extracted to keep AddProxiesPanel.tsx under the 250-line cap.

import * as React from 'react'
import { Loader2, Plus, Wifi } from 'lucide-react'

export function AddProxiesActions({
  validCount,
  readyCount,
  running,
  submitting,
  onCancel,
  onCheck,
  onSubmit
}: {
  validCount: number
  readyCount: number
  running: boolean
  submitting: boolean
  onCancel: () => void
  onCheck: () => void
  onSubmit: () => void
}): React.ReactElement {
  const checkLabel = running
    ? `Checking ${validCount}…`
    : validCount === 0
      ? 'Check proxies'
      : `Check ${validCount} ${validCount === 1 ? 'proxy' : 'proxies'}`

  const addLabel = submitting
    ? `Adding ${readyCount}…`
    : `Add ${readyCount} ${readyCount === 1 ? 'proxy' : 'proxies'}`

  return (
    <div className="flex justify-end gap-2">
      <button
        onClick={onCancel}
        disabled={submitting}
        className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-white dark:hover:bg-night-raised"
      >
        Cancel
      </button>
      <button
        onClick={onCheck}
        disabled={running || submitting || validCount === 0}
        className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-white dark:hover:bg-night-raised disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        title={
          validCount === 0
            ? 'Paste at least one valid proxy first'
            : `Check geo + auth for ${validCount} ${validCount === 1 ? 'proxy' : 'proxies'}`
        }
      >
        {running ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Wifi className="w-3.5 h-3.5" />
        )}
        {checkLabel}
      </button>
      <button
        onClick={onSubmit}
        disabled={submitting || readyCount === 0}
        className="px-3 py-1.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
      >
        {submitting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Plus className="w-3.5 h-3.5" />
        )}
        {addLabel}
      </button>
    </div>
  )
}
