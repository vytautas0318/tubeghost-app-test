import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getSupabase, ensureDataSession } from '@/lib/supabase'

export interface WorkspaceMembership {
  workspace_id: string
  workspace_name: string
  plan: string // 'free' | 'pro' | 'team'
  role_name: string // display only
  member_count: number // derived head-count of workspace_members
  permissions: string[]
  features: string[] // plan_features for this workspace's plan
}

// Preview mode — visual-only role/user impersonation.
// RLS continues to use the real auth.uid() for writes; this swap only
// affects what the renderer chooses to show. Excluded from persist().
export interface PreviewState {
  active: boolean
  roleId: string | null
  roleName: string | null
  roleColor: string | null
  permissions: string[]
  asUserId: string | null
  asUserLabel: string | null
}

const PREVIEW_INITIAL: PreviewState = {
  active: false,
  roleId: null,
  roleName: null,
  roleColor: null,
  permissions: [],
  asUserId: null,
  asUserLabel: null
}

export interface PreviewStartResult {
  ok: boolean
  reason?: 'permission' | 'hierarchy' | 'no_role' | 'fetch'
  message?: string
}

interface WorkspaceState {
  current: WorkspaceMembership | null
  all: WorkspaceMembership[]
  loading: boolean
  error: string | null
  preview: PreviewState

  // Server-derived capability for the "Create workspace" control. Computed by
  // can_create_workspace() from the SAME rule create_workspace() enforces, so
  // the UI never duplicates the condition. Defaults to allowed so the control
  // isn't wrongly blocked before the first load resolves.
  canCreate: boolean
  createReason: string | null

  load: () => Promise<void>
  setCurrent: (workspaceId: string) => Promise<void>
  createWorkspace: (name: string) => Promise<{ ok: boolean; message?: string }>
  reset: () => void

  startPreviewRole: (roleId: string) => Promise<PreviewStartResult>
  startPreviewUser: (userId: string, label: string) => Promise<PreviewStartResult>
  stopPreview: () => void
}

interface PersistedShape {
  current: WorkspaceMembership | null
}

// Monotonic token guarding against rapid-switch races: each setCurrent bumps
// it; a switch whose token is stale by the time its async work resolves is
// dropped, so the LAST selection always wins and the committed `current`
// matches the active workspace. (load() is not async-guarded here because its
// result only affects `all`; `current` reconciliation inside it is idempotent.)
let switchToken = 0

// Caller's effective hierarchy in the current workspace. Lower = more
// authority. Returns 999 if we can't determine it (treated as "no
// authority"; client-side guard fails closed). RLS is the real check.
async function fetchCallerHierarchy(workspaceId: string): Promise<number> {
  const supabase = getSupabase()
  if (!supabase) return 999
  const { data } = await supabase
    .from('user_roles')
    .select('app_roles!inner(hierarchy)')
    .eq('workspace_id', workspaceId)
  if (!data || data.length === 0) return 999
  const hierarchies = (data as unknown as Array<{ app_roles: { hierarchy: number } }>).map(
    (r) => r.app_roles.hierarchy
  )
  return Math.min(...hierarchies)
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      current: null,
      all: [],
      loading: false,
      error: null,
      preview: PREVIEW_INITIAL,
      canCreate: true,
      createReason: null,

      load: async (): Promise<void> => {
        const supabase = getSupabase()
        if (!supabase) return
        set({ loading: true, error: null })

        // The TP Browser data client runs an EXCHANGED session (see
        // lib/token-exchange.ts). On first login `user` (identity) is set
        // before that exchange + workspace provisioning finish, so query
        // it too early and RLS returns nothing → the app wrongly shows the
        // "Create workspace" screen for a user who already has one. Ensure
        // the data session (which also lazily provisions the workspace) is
        // established BEFORE reading memberships.
        const ready = await ensureDataSession()
        if (!ready) {
          set({ error: 'Could not establish data session', loading: false })
          return
        }

        const { data: members, error: memErr } = await supabase
          .from('workspace_members')
          .select('workspace_id, workspaces (id, name, plan)')
          .order('joined_at', { ascending: true })

        if (memErr) {
          set({ error: memErr.message, loading: false })
          return
        }

        type MemberRow = {
          workspace_id: string
          workspaces: { id: string; name: string; plan: string } | null
        }
        const baseMemberships = ((members as unknown as MemberRow[]) ?? [])
          .filter((r) => r.workspaces !== null)
          .map((r) => ({
            workspace_id: r.workspace_id,
            workspace_name: r.workspaces!.name,
            plan: r.workspaces!.plan
          }))

        // Pull permissions + features per workspace.
        const enriched: WorkspaceMembership[] = await Promise.all(
          baseMemberships.map(async (m) => {
            const [{ data: roleName }, { data: perms }, { data: features }, { count }] =
              await Promise.all([
                supabase.rpc('my_role_name', { p_workspace_id: m.workspace_id }),
                supabase.rpc('my_permissions', { p_workspace_id: m.workspace_id }),
                supabase.from('plan_features').select('feature_key').eq('plan_key', m.plan),
                supabase
                  .from('workspace_members')
                  .select('*', { count: 'exact', head: true })
                  .eq('workspace_id', m.workspace_id)
              ])
            return {
              ...m,
              role_name: (roleName as unknown as string) ?? '—',
              member_count: count ?? 1,
              permissions: ((perms as unknown as string[]) ?? []).slice(),
              features: ((features as unknown as Array<{ feature_key: string }>) ?? []).map(
                (f) => f.feature_key
              )
            }
          })
        )

        const existingId = get().current?.workspace_id
        const stillValid = existingId ? enriched.find((m) => m.workspace_id === existingId) : null
        const current = stillValid ?? enriched[0] ?? null

        // Server-derived create-workspace capability (same rule as the RPC).
        // Fail open (allowed) if the call errors — server-side enforcement is
        // still the real guard, so a stale-true flag just surfaces the typed
        // error on submit rather than silently blocking a legitimate create.
        const { data: cap } = await supabase.rpc('can_create_workspace')
        const capRow = (cap as unknown as Array<{ allowed: boolean; reason: string | null }>)?.[0]

        set({
          all: enriched,
          current,
          loading: false,
          canCreate: capRow?.allowed ?? true,
          createReason: capRow?.reason ?? null
        })
      },

      setCurrent: async (workspaceId): Promise<void> => {
        // Only switch into a workspace the user actually belongs to. RLS is
        // the real guard, but this keeps the client from ever committing a
        // workspace that isn't in the loaded membership set.
        const next = get().all.find((m) => m.workspace_id === workspaceId)
        if (!next) return
        if (next.workspace_id === get().current?.workspace_id) return

        const token = ++switchToken
        // The context swap is synchronous today (feature pages re-scope
        // reactively off `current.workspace_id` — refetch + realtime channels
        // are keyed to it, so no stale data survives). The token still guards
        // the commit so a rapid A→B→A burst can't land B after A.
        if (token !== switchToken) return
        set({ current: next, preview: PREVIEW_INITIAL })
      },

      createWorkspace: async (name): Promise<{ ok: boolean; message?: string }> => {
        const supabase = getSupabase()
        if (!supabase) return { ok: false, message: 'Supabase unavailable.' }

        // create_workspace() is a SECURITY DEFINER RPC: it inserts the
        // workspace + the caller's membership and seeds the default roles
        // (caller becomes Owner) atomically. Plan defaults to 'free'.
        const { data, error } = await supabase.rpc('create_workspace', {
          p_name: name.trim() || 'My Workspace'
        })
        if (error) return { ok: false, message: error.message }
        const newId = data as unknown as string | null
        if (!newId) return { ok: false, message: 'No workspace id returned.' }

        // Reload memberships so the new workspace (with role/perms/count) is in
        // `all`, then switch into it as the active context.
        await get().load()
        await get().setCurrent(newId)
        return { ok: true }
      },

      reset: (): void => {
        set({
          current: null,
          all: [],
          error: null,
          preview: PREVIEW_INITIAL,
          canCreate: true,
          createReason: null
        })
      },

      startPreviewRole: async (roleId): Promise<PreviewStartResult> => {
        const ws = get().current
        if (!ws) return { ok: false, reason: 'fetch', message: 'No workspace.' }
        if (!ws.permissions.includes('roles.preview')) {
          return { ok: false, reason: 'permission' }
        }

        const supabase = getSupabase()
        if (!supabase) return { ok: false, reason: 'fetch', message: 'Supabase unavailable.' }

        const [callerHierarchy, roleResp, permsResp] = await Promise.all([
          fetchCallerHierarchy(ws.workspace_id),
          supabase
            .from('app_roles')
            .select('id, name, color, hierarchy')
            .eq('id', roleId)
            .maybeSingle(),
          supabase.from('role_permissions').select('permission_key').eq('role_id', roleId)
        ])

        if (roleResp.error || !roleResp.data) {
          return {
            ok: false,
            reason: 'fetch',
            message: roleResp.error?.message ?? 'Role not found.'
          }
        }
        if (permsResp.error) {
          return { ok: false, reason: 'fetch', message: permsResp.error.message }
        }

        const role = roleResp.data as {
          id: string
          name: string
          color: string | null
          hierarchy: number
        }
        if (callerHierarchy > role.hierarchy) {
          return { ok: false, reason: 'hierarchy' }
        }

        const perms = (permsResp.data ?? []).map(
          (r) => (r as { permission_key: string }).permission_key
        )

        set({
          preview: {
            active: true,
            roleId: role.id,
            roleName: role.name,
            roleColor: role.color,
            permissions: perms,
            asUserId: null,
            asUserLabel: null
          }
        })
        return { ok: true }
      },

      startPreviewUser: async (userId, label): Promise<PreviewStartResult> => {
        const ws = get().current
        if (!ws) return { ok: false, reason: 'fetch', message: 'No workspace.' }
        if (!ws.permissions.includes('roles.preview')) {
          return { ok: false, reason: 'permission' }
        }

        const supabase = getSupabase()
        if (!supabase) return { ok: false, reason: 'fetch', message: 'Supabase unavailable.' }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role_id, app_roles!inner(id, name, color, hierarchy)')
          .eq('workspace_id', ws.workspace_id)
          .eq('user_id', userId)
          .maybeSingle()

        if (error) return { ok: false, reason: 'fetch', message: error.message }
        if (!data) return { ok: false, reason: 'no_role' }

        const role = (
          data as unknown as {
            role_id: string
            app_roles: { id: string; name: string; color: string | null; hierarchy: number }
          }
        ).app_roles

        const callerHierarchy = await fetchCallerHierarchy(ws.workspace_id)
        if (callerHierarchy > role.hierarchy) {
          return { ok: false, reason: 'hierarchy' }
        }

        const { data: permsData, error: permsErr } = await supabase
          .from('role_permissions')
          .select('permission_key')
          .eq('role_id', role.id)
        if (permsErr) return { ok: false, reason: 'fetch', message: permsErr.message }

        const perms = (permsData ?? []).map((r) => (r as { permission_key: string }).permission_key)

        set({
          preview: {
            active: true,
            roleId: role.id,
            roleName: role.name,
            roleColor: role.color,
            permissions: perms,
            asUserId: userId,
            asUserLabel: label
          }
        })
        return { ok: true }
      },

      stopPreview: (): void => {
        set({ preview: PREVIEW_INITIAL })
      }
    }),
    {
      name: 'tpb-workspace',
      partialize: (s): PersistedShape => ({ current: s.current })
    }
  )
)
