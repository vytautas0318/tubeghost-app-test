import * as React from 'react'
import { useState } from 'react'
import { Check, Plus, Loader2 } from 'lucide-react'
import { useWorkspace, type WorkspaceMembership } from '@/store/workspace'
import { initialsOf, planMemberSummary } from './parts'

/**
 * WorkspaceSwitcher — the current-workspace row plus, when expanded, the full
 * list of the user's workspaces (active one checkmarked) and an inline
 * "+ Create workspace" flow.
 *
 * Switching is a real tenant-context swap: `setCurrent` re-scopes the whole
 * app (feature pages refetch reactively off `current.workspace_id`) and is
 * race-guarded in the store so the last selection wins. Creating makes the
 * user Owner (seeded roles) and switches into the new workspace.
 */
export function WorkspaceSwitcher({
  current
}: {
  current: WorkspaceMembership
}): React.ReactElement {
  const all = useWorkspace((s) => s.all)
  const setCurrent = useWorkspace((s) => s.setCurrent)
  const createWorkspace = useWorkspace((s) => s.createWorkspace)
  // Server-derived capability — see can_create_workspace() RPC. Never a local
  // condition, so it stays in sync if the backend rule changes.
  const canCreate = useWorkspace((s) => s.canCreate)
  const createReason = useWorkspace((s) => s.createReason)

  const [expanded, setExpanded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const collapse = (): void => {
    setExpanded(false)
    setCreating(false)
    setName('')
    setError(null)
  }

  const onCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy || !canCreate) return
    setBusy(true)
    setError(null)
    const res = await createWorkspace(name)
    setBusy(false)
    if (!res.ok) {
      setError(res.message ?? 'Could not create workspace.')
      return
    }
    collapse()
  }

  return (
    <>
      <div className="acct-ws">
        <div className="acct-ws-l">
          <span className="acct-ws-ic">{initialsOf(current.workspace_name) || 'TP'}</span>
          <div style={{ minWidth: 0 }}>
            <div className="acct-ws-n">{current.workspace_name}</div>
            <div className="acct-ws-s">{planMemberSummary(current.plan, current.member_count)}</div>
          </div>
        </div>
        <span
          className="acct-ws-switch"
          onClick={() => (expanded ? collapse() : setExpanded(true))}
        >
          {expanded ? 'Close' : 'Switch'}
        </span>
      </div>

      {expanded && (
        <div className="ws-list">
          {all.map((m) => {
            const active = m.workspace_id === current.workspace_id
            return (
              <div
                key={m.workspace_id}
                className={'ws-opt' + (active ? ' on' : '')}
                onClick={() => {
                  if (active) return
                  void setCurrent(m.workspace_id)
                  collapse()
                }}
              >
                <span className="acct-ws-ic">{initialsOf(m.workspace_name)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="acct-ws-n">{m.workspace_name}</div>
                  <div className="acct-ws-s">{planMemberSummary(m.plan, m.member_count)}</div>
                </div>
                {active && (
                  <span className="ws-check">
                    <Check size={15} />
                  </span>
                )}
              </div>
            )
          })}

          {creating && canCreate ? (
            <form className="ws-create" onSubmit={onCreate}>
              <input
                className="ws-create-in"
                autoFocus
                placeholder="Workspace name"
                maxLength={80}
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className="ws-create-go" disabled={busy || !name.trim()}>
                {busy ? <Loader2 size={14} className="spin" /> : 'Create'}
              </button>
            </form>
          ) : (
            <div
              className={'ws-opt ws-new' + (canCreate ? '' : ' disabled')}
              onClick={() => canCreate && setCreating(true)}
              title={!canCreate && createReason ? createReason : undefined}
            >
              <Plus size={16} />
              Create workspace
            </div>
          )}
          {!canCreate && createReason && <div className="ws-create-note">{createReason}</div>}
          {error && <div className="ws-create-err">{error}</div>}
        </div>
      )}
    </>
  )
}
