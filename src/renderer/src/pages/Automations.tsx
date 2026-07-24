// Automations — list surface + entry to the flow builder. Thin orchestrator:
// data + mutations live in useAutomationsData, the builder in automations/.
// Config-only in the web app: flows are created/edited here but not executed.
// Gated by the automations permission ladder (view→read, edit→write).

import * as React from 'react'
import { useRef, useState } from 'react'
import { useWorkspace } from '@/store/workspace'
import { useAuth } from '@/store/auth'
import { useHasPermission } from '@/lib/permissions'
import { ToastView, useToast } from '@/components/Toast'
import { createAutomation, updateAutomation, type AutomationWithMeta } from '@/lib/automations'
import { TEMPLATES } from '../../../shared/automations/catalog'
import type { AutomationFlow } from '../../../shared/automations/types'
import { useAutomationsData } from './automations/useAutomationsData'
import { AutomationsHeader } from './automations/AutomationsHeader'
import { AutomationsTable } from './automations/AutomationsTable'
import { AutomationBuilder } from './automations/AutomationBuilder'
import { flowFromTemplate } from './automations/flow'
import { RunsDrawer } from './automations/RunsDrawer'
import { iconFor } from './automations/icons'

type Editing = { flow: AutomationFlow; id: string | null }

export function Automations(): React.ReactElement {
  const workspaceId = useWorkspace((s) => s.current)?.workspace_id ?? null
  const canView = useHasPermission('automations.view')
  const canWrite = useHasPermission('automations.edit')
  const canFull = useHasPermission('automations.run')

  const data = useAutomationsData(workspaceId, canView)
  const { toast, show } = useToast()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [runsFor, setRunsFor] = useState<AutomationWithMeta | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  if (!canView) {
    return (
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="wrap">
          <div className="phead">
            <div>
              <h1>Automations</h1>
              <p>You don’t have permission to view automations.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const saveFlow = async (flow: AutomationFlow): Promise<void> => {
    if (!workspaceId) return
    const name = flow.name.trim() || 'Untitled automation'
    try {
      if (editing?.id) {
        await updateAutomation(editing.id, workspaceId, {
          name,
          trigger: flow.trigger,
          steps: flow.steps
        })
        show('success', 'Automation updated')
      } else {
        await createAutomation({
          workspace_id: workspaceId,
          name,
          trigger: flow.trigger,
          steps: flow.steps,
          created_by: useAuth.getState().user?.id ?? null
        })
        show('success', 'Automation created')
      }
      setEditing(null)
      await data.reload().catch(() => undefined)
    } catch (e) {
      show('error', (e as Error).message)
    }
  }

  const openTemplate = (id: string): void => {
    const tpl = TEMPLATES.find((t) => t.id === id)
    if (!tpl) return
    setEditing({
      flow: flowFromTemplate(tpl.build(), tpl.id === 'blank' ? '' : tpl.name),
      id: null
    })
  }

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AutomationFlow>
      if (!parsed || !Array.isArray(parsed.steps) || !parsed.trigger)
        throw new Error('Not a valid flow file')
      setEditing({
        flow: {
          name: parsed.name ?? file.name.replace(/\.json$/i, ''),
          trigger: parsed.trigger,
          steps: parsed.steps
        },
        id: null
      })
      show('info', 'Imported flow — review and save')
    } catch (err) {
      show('error', `Import failed: ${(err as Error).message}`)
    }
  }

  if (editing) {
    return (
      <>
        <AutomationBuilder
          initial={editing.flow}
          groups={data.groups}
          profiles={data.profiles}
          onCancel={() => setEditing(null)}
          onSave={saveFlow}
        />
        <ToastView toast={toast} position="bottom-center" />
      </>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <AutomationsHeader
          activeCount={data.activeCount}
          totalRuns30d={data.totalRuns30d}
          canWrite={canWrite}
          onImport={() => importRef.current?.click()}
          onNew={() =>
            setEditing({
              flow: flowFromTemplate(
                { trigger: { type: 'manual', profileScope: 'all' }, stepTypes: [] },
                ''
              ),
              id: null
            })
          }
        />
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onImportFile}
        />

        <div className="auto-templates">
          {TEMPLATES.map((t) => (
            <div
              className={'auto-tpl' + (canWrite ? '' : ' disabled')}
              key={t.id}
              onClick={() => canWrite && openTemplate(t.id)}
            >
              <span className="auto-tpl-ic">{iconFor(t.icon, 17)}</span>
              <div className="auto-tpl-n">{t.name}</div>
              <div className="auto-tpl-d">{t.desc}</div>
            </div>
          ))}
        </div>

        <AutomationsTable
          autos={data.autos}
          totalProfiles={data.profiles.length}
          actions={{
            canWrite,
            canFull,
            onToggle: (a, next) =>
              void data.toggle(a.id, next).catch((e) => show('error', (e as Error).message)),
            onEdit: (a) =>
              setEditing({ flow: { name: a.name, trigger: a.trigger, steps: a.steps }, id: a.id }),
            onDuplicate: (a) =>
              void data
                .duplicate(a)
                .then(() => show('success', `Duplicated ${a.name}`))
                .catch((e) => show('error', (e as Error).message)),
            onDelete: (a) => {
              if (!window.confirm(`Delete “${a.name}”? This cannot be undone.`)) return
              void data
                .remove(a.id)
                .then(() => show('success', `${a.name} deleted`))
                .catch((e) => show('error', (e as Error).message))
            },
            onViewRuns: (a) => setRunsFor(a)
          }}
        />
      </div>

      {runsFor && <RunsDrawer automation={runsFor} onClose={() => setRunsFor(null)} />}
      <ToastView toast={toast} position="bottom-center" />
    </div>
  )
}
