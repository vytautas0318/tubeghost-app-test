import * as React from 'react'
import { useState } from 'react'
import { Plus, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui'
import { ToastView } from '@/components/Toast'
import { useHasPermission } from '@/lib/permissions'
import { useTeamHeaderSlot } from '../team/TeamHeaderContext'
import { useRolesData } from './useRolesData'
import { RoleDialog } from './RoleDialog'
import { DeleteRoleDialog } from './DeleteRoleDialog'
import { RolePermPanel } from './RolePermPanel'
import { roleIcon, roleTone, toneSoft, toneVar } from './roleVisuals'

const ROLES_SUBTITLE = 'Fine-grained control over what each role can see and do'

function memberMeta(count: number, roleName: string, isDefault: boolean): string {
  const base = `${count} member${count === 1 ? '' : 's'}`
  if (isDefault && roleName === 'Owner') return `${base} · full access`
  if (isDefault && roleName === 'Viewer') return `${base} · read-only`
  return base
}

/**
 * RolesBody — the former Roles & access page content, extracted to render
 * inside the shared TeamPage tabbed shell. Data fetching, permissions and
 * mutations are unchanged; only the outer page-shell + <h1>/subtitle/action
 * were lifted into TeamPage (subtitle + Create-role button pushed back up via
 * useTeamHeaderSlot). The permission-matrix editor lives in RolePermPanel.
 */
export function RolesBody(): React.ReactElement {
  const {
    loading,
    error,
    roles,
    selected,
    select,
    draft,
    dirty,
    setPerm,
    reset,
    save,
    createNewRole,
    rename,
    remove,
    toast
  } = useRolesData()

  // Editing the matrix requires roles.edit; viewing requires roles.view.
  // UI gates only — RLS rejects unauthorised writes regardless (CLAUDE.md).
  const canView = useHasPermission('roles.view')
  const canEdit = useHasPermission('roles.edit')
  const canCreate = useHasPermission('roles.create')
  const canDelete = useHasPermission('roles.delete')

  const [dialog, setDialog] = useState<null | 'create' | 'rename' | 'delete'>(null)

  const hasAccess = canView || canEdit

  // Roles-specific subtitle + the Create-role action, rendered in the shared
  // TeamPage header. NoAccess shows the subtitle but no action.
  useTeamHeaderSlot(
    {
      subtitle: ROLES_SUBTITLE,
      action: hasAccess ? (
        <Button
          variant="primary"
          icon={<Plus size={15} />}
          disabled={!canCreate}
          title={!canCreate ? 'You need the roles.create permission' : undefined}
          onClick={() => setDialog('create')}
        >
          Create role
        </Button>
      ) : null
    },
    [hasAccess, canCreate]
  )

  if (!hasAccess) return <NoAccess />

  const editable = selected != null && !selected.isOwner && canEdit

  return (
    <>
      {loading ? (
        <div className="p-8 text-sm text-[var(--t3)]">Loading roles…</div>
      ) : error ? (
        <div className="p-8 text-sm text-[var(--red)]">{error}</div>
      ) : (
        <div className="roles-grid">
          <div className="role-list">
            <div className="role-list-h">System roles</div>
            {roles.map((r) => {
              const t = roleTone(r.row.name, r.row.is_default)
              return (
                <div
                  key={r.row.id}
                  className={'rl-item' + (selected?.row.id === r.row.id ? ' on' : '')}
                  onClick={() => select(r.row.id)}
                >
                  <div className="rl-ic" style={{ background: toneSoft[t], color: toneVar[t] }}>
                    {roleIcon(r.row.name, r.row.is_default)}
                  </div>
                  <div>
                    <div className="rl-name">{r.row.name}</div>
                    <div className="rl-sub">
                      {memberMeta(r.memberCount, r.row.name, r.row.is_default)}
                    </div>
                  </div>
                </div>
              )
            })}
            <div
              className="rl-add"
              style={!canCreate ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
              onClick={() => canCreate && setDialog('create')}
            >
              <Plus size={14} />
              New role
            </div>
          </div>

          {selected && (
            <RolePermPanel
              selected={selected}
              draft={draft}
              dirty={dirty}
              editable={editable}
              canEdit={canEdit}
              canDelete={canDelete}
              setPerm={setPerm}
              reset={reset}
              save={save}
              onRename={() => setDialog('rename')}
              onDelete={() => setDialog('delete')}
            />
          )}
        </div>
      )}

      {dialog === 'create' && (
        <RoleDialog
          mode="create"
          onClose={() => setDialog(null)}
          onSubmit={(name, description) => createNewRole(name, description)}
        />
      )}
      {dialog === 'rename' && selected && (
        <RoleDialog
          mode="rename"
          initialName={selected.row.name}
          onClose={() => setDialog(null)}
          onSubmit={(name) => rename(name)}
        />
      )}
      {dialog === 'delete' && selected && (
        <DeleteRoleDialog
          roleName={selected.row.name}
          memberCount={selected.memberCount}
          onClose={() => setDialog(null)}
          onConfirm={() => remove()}
        />
      )}
      <ToastView toast={toast} position="bottom-center" />
    </>
  )
}

function NoAccess(): React.ReactElement {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <ShieldAlert className="w-8 h-8 mx-auto mb-3 text-[var(--t4)]" />
        <h3 className="text-sm font-bold text-[var(--t1)] mb-1">
          You don&apos;t have access to roles
        </h3>
        <p className="text-xs text-[var(--t3)]">
          Ask a workspace admin to grant you the <span className="mono">roles.view</span>{' '}
          permission.
        </p>
      </div>
    </div>
  )
}
