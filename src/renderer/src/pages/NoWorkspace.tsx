import * as React from 'react'
import { useState } from 'react'
import { AlertCircle, Plus } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { useWorkspace } from '@/store/workspace'
import { getSupabase } from '@/lib/supabase'
import { BrandLogo } from '@/components/BrandLogo'

// Shown when an authenticated user has zero workspaces.
// Happens for users who signed up via Google OAuth (no workspace_name in
// metadata) or for users who pre-existed before the migration ran (the
// handle_new_user() trigger never fired for them). Either way, this is
// their self-service way out.
export function NoWorkspace(): React.ReactElement {
  const { user } = useAuth()
  const { error, load } = useWorkspace()
  // Same server-derived capability the switcher uses (single source of truth).
  // Structurally always true here (this page only renders at zero workspaces,
  // so the user can't yet own one), but reading the flag keeps both create
  // entry points consistent — if the rule ever blocks a first workspace, this
  // gates too instead of erroring on submit.
  const canCreate = useWorkspace((s) => s.canCreate)
  const createReason = useWorkspace((s) => s.createReason)
  const [name, setName] = useState('My Workspace')
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const onCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!user || !canCreate) return
    setBusy(true)
    setCreateError(null)
    const supabase = getSupabase()
    if (!supabase) {
      setCreateError('Supabase not configured')
      setBusy(false)
      return
    }

    // Use the create_workspace() RPC instead of two separate inserts.
    // This is atomic (no orphan workspace if member insert fails) and
    // sidesteps any per-table RLS quirks because SECURITY DEFINER does
    // the inserts as the function owner.
    const { data, error: rpcErr } = await supabase.rpc('create_workspace', {
      p_name: name.trim() || 'My Workspace'
    })
    if (rpcErr) {
      setCreateError(`Couldn't create workspace: ${rpcErr.message}`)
      setBusy(false)
      return
    }
    if (!data) {
      setCreateError('create_workspace returned no workspace id')
      setBusy(false)
      return
    }

    await load()
    setBusy(false)
  }

  return (
    <div className="flex-1 flex items-center justify-center px-8 bg-[var(--bg)]">
      <div className="w-full max-w-md p-8 bg-[var(--panel)] border border-[var(--line)] rounded-2xl shadow-sm">
        <BrandLogo size={40} className="mb-5" />
        <h1 className="text-lg font-bold text-[var(--t1)]">
          Create your workspace
        </h1>
        <p className="text-sm text-[var(--t3)] mt-1 mb-6">
          A workspace is where your profiles, members, and proxies live. You can rename or add more
          later.
        </p>

        {error && (
          <div className="mb-4 text-xs text-[var(--red)] bg-[var(--red-soft)] border border-[var(--red)]/20 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Couldn't load workspaces: {error}</span>
          </div>
        )}

        <form onSubmit={onCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--t2)] mb-1.5">
              Workspace name
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              disabled={!canCreate}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 disabled:opacity-50"
            />
          </div>
          {!canCreate && createReason && (
            <div className="text-xs text-[var(--t3)]">{createReason}</div>
          )}
          {createError && (
            <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] border border-[var(--red)]/20 rounded-lg px-3 py-2">
              {createError}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !canCreate}
            className="w-full px-3 py-2.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {busy ? 'Creating…' : 'Create workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
