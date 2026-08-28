// The automations table: header row, empty state, and one row per automation
// (name + subline, trigger, profiles, runs, last run, status pill, enable
// toggle, ⋮ menu). Row actions come in via props; the menu handles positioning
// + upward-flip like the other row menus in the app.

import { Badge, Toggle, type BadgeTone, AutomationWithMeta } from '@tubeghost/ui'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { MoreVertical, Pencil, Zap, Copy, Trash2, List } from 'lucide-react'
import { describeSchedule } from '@/lib/automations/schedule'

export interface RowActions {
  canWrite: boolean
  canFull: boolean
  onToggle: (a: AutomationWithMeta, next: boolean) => void
  onEdit: (a: AutomationWithMeta) => void
  onDuplicate: (a: AutomationWithMeta) => void
  onDelete: (a: AutomationWithMeta) => void
  onViewRuns: (a: AutomationWithMeta) => void
}

function triggerText(a: AutomationWithMeta): string {
  if (a.trigger.type === 'scheduled' && a.trigger.schedule)
    return describeSchedule(a.trigger.schedule)
  return 'Manual'
}
function scopeCount(a: AutomationWithMeta, totalProfiles: number): number {
  if (a.trigger.profileScope === 'all') return totalProfiles
  if (a.trigger.profileScope === 'profiles') return a.profileIds.length
  return a.groupIds.length // groups → number of groups (profiles resolved at run)
}
function actionSubline(a: AutomationWithMeta): string {
  const n = a.steps.length
  const scope =
    a.trigger.profileScope === 'all'
      ? 'all profiles'
      : a.trigger.profileScope === 'groups'
        ? 'selected groups'
        : 'selected profiles'
  return `${n} action${n === 1 ? '' : 's'} · ${scope}`
}

export function AutomationsTable({
  autos,
  totalProfiles,
  loading = false,
  actions
}: {
  autos: AutomationWithMeta[]
  totalProfiles: number
  // True while the first fetch is in flight — suppresses the empty state.
  loading?: boolean
  actions: RowActions
}): React.ReactElement {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; up: boolean } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menu])

  const menuAuto = menu && autos.find((a) => a.id === menu.id)

  return (
    <div className="tbl" style={{ marginTop: '4px' }}>
      <div className="auto-th">
        <span>Automation</span>
        <span>Trigger</span>
        <span>Profiles</span>
        <span>Runs</span>
        <span>Last run</span>
        <span>Status</span>
        <span />
      </div>

      {loading && (
        <div style={{ padding: '36px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--t3)' }}>Loading automations…</div>
        </div>
      )}

      {/* `loading` must be checked BEFORE the empty state: an in-flight fetch
          also has zero rows, so without this the page flashes "No automations
          yet" on every visit. */}
      {!loading && autos.length === 0 && (
        <div style={{ padding: '36px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--t1)' }}>
            No automations yet
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--t3)', marginTop: '4px' }}>
            Start from a template above, or build a blank flow.
          </div>
        </div>
      )}

      {autos.map((a) => {
        const state: 'active' | 'paused' = a.enabled ? 'active' : 'paused'
        const tone: BadgeTone = a.enabled ? 'green' : 'amber'
        const label = a.enabled ? 'Active' : 'Paused'
        return (
          <div className="auto-tr" key={a.id}>
            <div className="auto-name">
              <span className={'auto-dot ' + state} />
              <div style={{ minWidth: 0 }}>
                <div className="auto-n">{a.name}</div>
                <div className="auto-d">{actionSubline(a)}</div>
              </div>
            </div>
            <span className="auto-trigger">{triggerText(a)}</span>
            <span className="auto-mono">{scopeCount(a, totalProfiles) || '—'}</span>
            <span className="auto-mono">{a.runsCount}</span>
            <span className="auto-last">
              {a.lastRunAt
                ? formatDistanceToNow(new Date(a.lastRunAt), { addSuffix: true })
                : 'Never'}
            </span>
            <span>
              <Badge tone={tone}>{label}</Badge>
            </span>
            <span className="auto-actions">
              <Toggle
                checked={a.enabled}
                onChange={() => actions.onToggle(a, !a.enabled)}
                disabled={!actions.canWrite}
              />
              <div
                className="kebab"
                style={{ opacity: 1 }}
                onClick={(e) => {
                  e.stopPropagation()
                  const r = e.currentTarget.getBoundingClientRect()
                  const MENU_H = 250
                  const up = r.bottom + MENU_H + 8 > window.innerHeight
                  setMenu({ id: a.id, x: r.right - 180, y: up ? r.top - 6 : r.bottom + 6, up })
                }}
              >
                <MoreVertical size={16} />
              </div>
            </span>
          </div>
        )
      })}

      {menuAuto && (
        <div
          style={{
            position: 'fixed',
            left: menu.x + 'px',
            top: menu.y + 'px',
            transform: menu.up ? 'translateY(-100%)' : undefined,
            zIndex: 200
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="row-menu" style={{ position: 'static', minWidth: '180px' }}>
            <div
              className="rm-item"
              onClick={() => {
                actions.onViewRuns(menuAuto)
                setMenu(null)
              }}
            >
              <List size={15} />
              View runs
            </div>
            <div
              className={'rm-item' + (actions.canWrite ? '' : ' disabled')}
              onClick={() => {
                if (!actions.canWrite) return
                actions.onEdit(menuAuto)
                setMenu(null)
              }}
            >
              <Pencil size={15} />
              Edit flow
            </div>
            <div
              className={'rm-item' + (actions.canWrite ? '' : ' disabled')}
              onClick={() => {
                if (!actions.canWrite) return
                actions.onToggle(menuAuto, !menuAuto.enabled)
                setMenu(null)
              }}
            >
              <Zap size={15} />
              {menuAuto.enabled ? 'Pause' : 'Resume'}
            </div>
            <div
              className={'rm-item' + (actions.canWrite ? '' : ' disabled')}
              onClick={() => {
                if (!actions.canWrite) return
                actions.onDuplicate(menuAuto)
                setMenu(null)
              }}
            >
              <Copy size={15} />
              Duplicate
            </div>
            <div className="rm-sep" />
            <div
              className={'rm-item danger' + (actions.canFull ? '' : ' disabled')}
              onClick={() => {
                if (!actions.canFull) return
                actions.onDelete(menuAuto)
                setMenu(null)
              }}
            >
              <Trash2 size={15} />
              Delete
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
