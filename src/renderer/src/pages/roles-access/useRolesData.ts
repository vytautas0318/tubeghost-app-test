// Data engine for the Roles & access page. Loads the workspace's real roles
// + their permission keysets from Supabase, exposes them in the catalogue
// shape the matrix renders, tracks dirty edits, and persists by diffing the
// desired aggregate keyset against what the role currently holds.
//
// Save is AGGREGATE, not per-row: several catalogue rows share DB keys
// (e.g. profiles.view backs profiles_manage, profiles_assign, fingerprint_edit
// and extensions). Applying per-row revokes would stomp a key another row
// still needs, so we recompute the whole desired keyset then diff once.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '@/store/workspace'
import {
  addRolePermission,
  createRole,
  deleteRole,
  listRoleMemberCounts,
  listRolePermissions,
  listRoles,
  removeRolePermission,
  updateRole,
  type AppRoleRow
} from '@/lib/roles'
import { PERM_SCHEMA, seedRole, type PermVal } from './permSchema'
import { PERM_MAP, diffForRow, keysToCatalog, ladderKeys } from './permMap'

const CATALOG_ROWS = PERM_SCHEMA.flatMap((g) => g.rows.map((r) => ({ key: r.key, type: r.type })))

// Owner is identified by is_protected — never role name (CLAUDE.md).
function isOwner(role: AppRoleRow): boolean {
  return role.is_protected && role.is_default
}

// All DB keys any catalogue row can touch. Save only ever adds/removes within
// this set, so out-of-catalogue keys a role holds are left untouched.
const ALL_CATALOG_KEYS = new Set(Object.values(PERM_MAP).flatMap((e) => ladderKeys(e)))

export interface RoleView {
  row: AppRoleRow
  isOwner: boolean
  memberCount: number
  /** DB keys actually held (last saved). */
  savedKeys: Set<string>
  /** Catalogue-shaped saved values. */
  saved: Record<string, PermVal>
}

export interface UseRolesData {
  loading: boolean
  error: string | null
  roles: RoleView[]
  selectedId: string | null
  select: (id: string) => void
  selected: RoleView | null
  /** Live (possibly dirty) catalogue values for the selected role. */
  draft: Record<string, PermVal>
  dirty: boolean
  setPerm: (rowKey: string, val: PermVal) => void
  reset: () => void
  save: () => Promise<void>
  createNewRole: (name: string, description: string) => Promise<void>
  rename: (name: string) => Promise<void>
  remove: () => Promise<void>
  toast: { kind: 'error' | 'info'; text: string } | null
}

export function useRolesData(): UseRolesData {
  const workspace = useWorkspace((s) => s.current)
  const [roles, setRoles] = useState<RoleView[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, PermVal>>({})
  const [toast, setToast] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  const showToast = useCallback((kind: 'error' | 'info', text: string): void => {
    setToast({ kind, text })
    window.setTimeout(() => setToast(null), 4000)
  }, [])

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspace) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      listRoles(workspace.workspace_id),
      listRolePermissions(workspace.workspace_id),
      listRoleMemberCounts(workspace.workspace_id)
    ])
      .then(([rs, rps, counts]) => {
        if (cancelled) return
        const byRole = new Map<string, Set<string>>()
        for (const rp of rps) {
          if (!byRole.has(rp.role_id)) byRole.set(rp.role_id, new Set())
          byRole.get(rp.role_id)!.add(rp.permission_key)
        }
        const views: RoleView[] = rs.map((row) => {
          const savedKeys = byRole.get(row.id) ?? new Set<string>()
          return {
            row,
            isOwner: isOwner(row),
            memberCount: counts.get(row.id) ?? 0,
            savedKeys,
            saved: keysToCatalog(savedKeys, CATALOG_ROWS)
          }
        })
        setRoles(views)
        setSelectedId((prev) => prev ?? views[0]?.row.id ?? null)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [workspace?.workspace_id])

  const selected = useMemo(
    () => roles.find((r) => r.row.id === selectedId) ?? null,
    [roles, selectedId]
  )

  // Sync the editable draft to the selected role's saved values WITHOUT an
  // effect: when the selection (or its saved snapshot, e.g. after a save)
  // changes, reset the draft during render. This is React's recommended
  // "adjust state on prop change" pattern — no cascading render.
  const [draftFor, setDraftFor] = useState<string | null>(null)
  if (selected && draftFor !== selected.row.id) {
    setDraftFor(selected.row.id)
    setDraft({ ...selected.saved })
  }

  const dirty = useMemo(() => {
    if (!selected) return false
    return CATALOG_ROWS.some((r) => draft[r.key] !== selected.saved[r.key])
  }, [draft, selected])

  const select = useCallback((id: string): void => setSelectedId(id), [])

  const setPerm = useCallback(
    (rowKey: string, val: PermVal): void => setDraft((d) => ({ ...d, [rowKey]: val })),
    []
  )

  const reset = useCallback((): void => {
    // System roles revert to their seed defaults; custom roles to last-saved.
    if (!selected) return
    if (selected.row.is_default) setDraft(seedRole(selected.row.name.toLowerCase()))
    else setDraft({ ...selected.saved })
  }, [selected])

  // ── Save (aggregate keyset diff) ─────────────────────────────────────────
  const save = useCallback(async (): Promise<void> => {
    if (!workspace || !selected || selected.isOwner) return

    // Desired final set of catalogue-owned keys for this role.
    const desired = new Set<string>()
    for (const r of CATALOG_ROWS) {
      const { grant } = diffForRow(r.key, draft[r.key])
      for (const k of grant) desired.add(k)
    }

    const current = selected.savedKeys
    const toGrant = [...desired].filter((k) => !current.has(k))
    // Only revoke keys inside the catalogue's own surface — never touch keys
    // a role holds that no catalogue row manages.
    const toRevoke = [...current].filter((k) => ALL_CATALOG_KEYS.has(k) && !desired.has(k))

    try {
      await Promise.all([
        ...toGrant.map((k) => addRolePermission(workspace.workspace_id, selected.row.id, k)),
        ...toRevoke.map((k) => removeRolePermission(selected.row.id, k))
      ])
      // New saved keyset = (current minus catalogue keys) + desired.
      const nextKeys = new Set<string>([...current].filter((k) => !ALL_CATALOG_KEYS.has(k)))
      for (const k of desired) nextKeys.add(k)
      setRoles((prev) =>
        prev.map((rv) =>
          rv.row.id === selected.row.id
            ? { ...rv, savedKeys: nextKeys, saved: keysToCatalog(nextKeys, CATALOG_ROWS) }
            : rv
        )
      )
      showToast('info', 'Permissions saved.')
    } catch (e) {
      const err = e as { code?: string; message?: string }
      if (err.code === '42501' || /permission|denied|policy/i.test(err.message ?? '')) {
        showToast('error', 'You can only edit roles at or below your authority.')
      } else {
        showToast('error', err.message ?? 'Failed to save permissions.')
      }
    }
  }, [workspace, selected, draft, showToast])

  // ── Create / rename / delete ─────────────────────────────────────────────
  const createNewRole = useCallback(
    async (name: string, description: string): Promise<void> => {
      if (!workspace) return
      try {
        const maxH = roles.reduce((m, r) => Math.max(m, r.row.hierarchy), 0)
        const created = await createRole({
          workspace_id: workspace.workspace_id,
          name,
          description: description || null,
          color: '#6366F1',
          hierarchy: maxH + 10
        })
        // Seed a sensible baseline (Viewer) so the new role isn't blank.
        const baseline = seedRole('viewer')
        const grants = new Set<string>()
        for (const r of CATALOG_ROWS) {
          for (const k of diffForRow(r.key, baseline[r.key]).grant) grants.add(k)
        }
        await Promise.all(
          [...grants].map((k) => addRolePermission(workspace.workspace_id, created.id, k))
        )
        const savedKeys = grants
        setRoles((prev) =>
          [
            ...prev,
            {
              row: created,
              isOwner: false,
              memberCount: 0,
              savedKeys,
              saved: keysToCatalog(savedKeys, CATALOG_ROWS)
            }
          ].sort((a, b) => a.row.hierarchy - b.row.hierarchy)
        )
        setSelectedId(created.id)
        showToast('info', `Role "${created.name}" created.`)
      } catch (e) {
        const err = e as { code?: string; message?: string }
        if (err.code === '23505') showToast('error', 'A role with that name already exists.')
        else if (err.code === '42501' || /permission|denied|policy/i.test(err.message ?? ''))
          showToast('error', 'Custom roles require the Team plan.')
        else showToast('error', err.message ?? 'Failed to create role.')
      }
    },
    [workspace, roles, showToast]
  )

  const rename = useCallback(
    async (name: string): Promise<void> => {
      if (!selected) return
      try {
        const updated = await updateRole(selected.row.id, { name })
        setRoles((prev) =>
          prev
            .map((rv) => (rv.row.id === updated.id ? { ...rv, row: updated } : rv))
            .sort((a, b) => a.row.hierarchy - b.row.hierarchy)
        )
        showToast('info', 'Role renamed.')
      } catch (e) {
        const err = e as { code?: string; message?: string }
        if (err.code === '23505') showToast('error', 'A role with that name already exists.')
        else showToast('error', err.message ?? 'Failed to rename role.')
      }
    },
    [selected, showToast]
  )

  const remove = useCallback(async (): Promise<void> => {
    // Mirror the RLS delete policy's protection flags so we never attempt a
    // delete the backend will reject (is_protected / is_delete_protected /
    // is_default). Re-throws on failure so the confirm dialog can surface the
    // error inline and stay open (the caller awaits this).
    if (
      !selected ||
      selected.row.is_protected ||
      selected.row.is_delete_protected ||
      selected.row.is_default
    ) {
      return
    }
    try {
      await deleteRole(selected.row.id)
      const remaining = roles.filter((r) => r.row.id !== selected.row.id)
      setRoles(remaining)
      setSelectedId(remaining[0]?.row.id ?? null)
      showToast('info', `Role "${selected.row.name}" deleted.`)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      const msg =
        err.code === '42501'
          ? 'You don’t have permission to delete this role.'
          : (err.message ?? 'Failed to delete role.')
      showToast('error', msg)
      throw new Error(msg)
    }
  }, [selected, roles, showToast])

  return {
    loading,
    error,
    roles,
    selectedId,
    select,
    selected,
    draft,
    dirty,
    setPerm,
    reset,
    save,
    createNewRole,
    rename,
    remove,
    toast
  }
}
