import * as React from 'react'
import {
  Check,
  Pencil,
  Trash2,
  ShieldCheck,
  Columns3,
  CreditCard,
  Globe,
  Zap,
  Users
} from 'lucide-react'
import { Button, Toggle } from '@/components/ui'
import { PERM_SCHEMA, type Level } from './permSchema'
import { LEVEL_ORDER } from './permMap'
import { roleIcon, roleTone, toneSoft, toneVar } from './roleVisuals'
import type { useRolesData } from './useRolesData'

type RolesData = ReturnType<typeof useRolesData>
type Selected = NonNullable<RolesData['selected']>

const CAT_ICON: Record<string, React.ReactNode> = {
  profiles: <Columns3 size={13} />,
  accounts: <CreditCard size={13} />,
  shield: <ShieldCheck size={13} />,
  proxies: <Globe size={13} />,
  automation: <Zap size={13} />,
  members: <Users size={13} />
}

/**
 * RolePermPanel — the right-hand permission-matrix editor for the selected
 * role (extracted from the former Roles page so RolesBody stays a thin
 * orchestrator). Behaviour is unchanged: it reads the draft/dirty state from
 * useRolesData and gates edits on the roles.edit permission.
 */
export function RolePermPanel({
  selected,
  draft,
  dirty,
  editable,
  canEdit,
  canDelete,
  setPerm,
  reset,
  save,
  onRename,
  onDelete
}: {
  selected: Selected
  draft: RolesData['draft']
  dirty: boolean
  editable: boolean
  canEdit: boolean
  canDelete: boolean
  setPerm: RolesData['setPerm']
  reset: RolesData['reset']
  save: RolesData['save']
  onRename: () => void
  onDelete: () => void
}): React.ReactElement {
  const tone = roleTone(selected.row.name, selected.row.is_default)

  return (
    <div className="perm">
      <div className="perm-h">
        <div className="perm-h-l">
          <div className="perm-ic" style={{ background: toneSoft[tone], color: toneVar[tone] }}>
            {roleIcon(selected.row.name, selected.row.is_default)}
          </div>
          <div>
            <div className="perm-title">
              {selected.row.name}{' '}
              <span className="perm-cnt">
                {selected.memberCount} member{selected.memberCount === 1 ? '' : 's'}
              </span>
              {selected.isOwner && (
                <span
                  className="perm-cnt"
                  style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
                >
                  locked
                </span>
              )}
            </div>
            <div className="perm-desc">{selected.row.description ?? 'Custom role.'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Deletable only when NONE of the backend protection flags are set —
              matches the RLS delete policy (is_protected / is_delete_protected /
              is_default all false), so the UI never offers a delete the server
              would reject. */}
          {!selected.row.is_default &&
            !selected.row.is_protected &&
            !selected.row.is_delete_protected &&
            canDelete && (
              <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={onDelete}>
                Delete
              </Button>
            )}
          <Button
            size="sm"
            icon={<Pencil size={13} />}
            disabled={selected.isOwner || !canEdit}
            onClick={onRename}
          >
            Rename
          </Button>
        </div>
      </div>

      {PERM_SCHEMA.map((g, gi) => (
        <React.Fragment key={g.group}>
          <div className={'pgroup-h' + (gi > 0 ? ' pborder' : '')}>
            {CAT_ICON[g.icon]}
            {g.group}
          </div>
          {g.rows.map((row) => (
            <div className="prow2" key={row.key}>
              <div className="prow2-info">
                <div className="prow2-name">{row.name}</div>
                <div className="prow2-desc">{row.desc}</div>
              </div>
              {row.type === 'level' ? (
                <Lvl
                  value={(draft[row.key] as Level) ?? 'none'}
                  onChange={(v) => setPerm(row.key, v)}
                  disabled={!editable}
                />
              ) : (
                <Toggle
                  checked={!!draft[row.key]}
                  onChange={(v) => setPerm(row.key, v)}
                  style={!editable ? { opacity: 0.55, pointerEvents: 'none' } : undefined}
                />
              )}
            </div>
          ))}
        </React.Fragment>
      ))}

      {editable && (
        <div className="perm-foot">
          <Button
            variant="primary"
            icon={<Check size={15} />}
            disabled={!dirty}
            onClick={() => void save()}
          >
            Save permissions
          </Button>
          <Button variant="ghost" disabled={!dirty} onClick={reset}>
            Reset to default
          </Button>
          {dirty && (
            <span className="perm-cnt" style={{ marginLeft: 'auto' }}>
              Unsaved changes
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Lvl({
  value,
  onChange,
  disabled
}: {
  value: Level
  onChange: (v: Level) => void
  disabled?: boolean
}): React.ReactElement {
  return (
    <div className="lvl" style={disabled ? { opacity: 0.55, pointerEvents: 'none' } : undefined}>
      {LEVEL_ORDER.map((o) => (
        <div
          key={o}
          className={'lvl-opt' + (value === o ? ' on ' + o : '')}
          onClick={() => onChange(o)}
        >
          {o[0].toUpperCase() + o.slice(1)}
        </div>
      ))}
    </div>
  )
}
