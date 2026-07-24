// Full-screen flow builder. Left: trigger config (type/schedule/scope) + the
// action palette. Center: the vertical node canvas (fixed Trigger + Open-profile
// nodes, then editable step nodes with reorder + remove + param editing). Saves
// a full AutomationFlow. Backed by the shared action catalog so labels + params
// stay in one place.

import * as React from 'react'
import { useRef, useState } from 'react'
import {
  ChevronLeft,
  Check,
  Sparkles,
  Plus,
  AppWindow,
  X,
  ChevronUp,
  ChevronDown
} from 'lucide-react'
import { Button, Select } from '@/components/ui'
import type { GroupRow } from '@/lib/groups'
import type { ProfileRow } from '@/lib/profiles'
import { ACTIONS, summarizeStep, makeStep } from '../../../../shared/automations/catalog'
import {
  ACTION_KEYS,
  type AutomationFlow,
  type Step,
  type ActionKey
} from '../../../../shared/automations/types'
import { iconFor } from './icons'
import { ScopePicker } from './ScopePicker'
import { StepParamsEditor } from './StepParamsEditor'
import { describeSchedule } from '@/lib/automations/schedule'

export function AutomationBuilder({
  initial,
  groups,
  profiles,
  onCancel,
  onSave
}: {
  initial: AutomationFlow
  groups: GroupRow[]
  profiles: ProfileRow[]
  onCancel: () => void
  onSave: (flow: AutomationFlow) => void
}): React.ReactElement {
  const [flow, setFlow] = useState<AutomationFlow>(initial)
  const [selected, setSelected] = useState<string | null>(null)
  const counter = useRef(1000)
  const t = flow.trigger

  const addStep = (key: ActionKey): void => {
    const step = makeStep('s' + ++counter.current, key)
    setFlow((f) => ({ ...f, steps: [...f.steps, step] }))
    setSelected(step.id)
  }
  const removeStep = (id: string): void => {
    setFlow((f) => ({ ...f, steps: f.steps.filter((s) => s.id !== id) }))
    setSelected((s) => (s === id ? null : s))
  }
  const move = (id: string, dir: -1 | 1): void =>
    setFlow((f) => {
      const i = f.steps.findIndex((s) => s.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= f.steps.length) return f
      const steps = f.steps.slice()
      ;[steps[i], steps[j]] = [steps[j], steps[i]]
      return { ...f, steps }
    })
  const patchStep = (id: string, patch: Partial<Step>): void =>
    setFlow((f) => ({ ...f, steps: f.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))

  const setTrigger = (patch: Partial<typeof t>): void =>
    setFlow((f) => ({ ...f, trigger: { ...f.trigger, ...patch } }))

  const scopeLabel =
    t.profileScope === 'all'
      ? 'All profiles'
      : t.profileScope === 'groups'
        ? `${t.groupIds?.length ?? 0} group${(t.groupIds?.length ?? 0) === 1 ? '' : 's'}`
        : `${t.profileIds?.length ?? 0} profile${(t.profileIds?.length ?? 0) === 1 ? '' : 's'}`
  const triggerSummary =
    (t.type === 'scheduled' && t.schedule ? describeSchedule(t.schedule) : 'Manual') +
    ` · ${scopeLabel}`
  const sel = flow.steps.find((s) => s.id === selected) ?? null

  return (
    <div className="builder">
      <div className="builder-top">
        <div className="builder-top-l">
          <div className="editor-back" onClick={onCancel} title="Back">
            <ChevronLeft size={18} />
          </div>
          <input
            className="builder-name"
            value={flow.name}
            placeholder="Untitled automation"
            onChange={(e) => setFlow((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="builder-top-r">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon={<Check size={15} />} onClick={() => onSave(flow)}>
            Save automation
          </Button>
        </div>
      </div>

      <div className="builder-main">
        <aside className="builder-palette">
          <div className="bp-group">Trigger</div>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}
          >
            <Select
              value={t.type}
              onChange={(e) =>
                setTrigger({
                  type: e.target.value as 'manual' | 'scheduled',
                  schedule:
                    e.target.value === 'scheduled'
                      ? (t.schedule ?? { kind: 'daily', hour: 9, weekday: 1 })
                      : t.schedule
                })
              }
              style={{ minWidth: 0 }}
            >
              <option value="manual">Manual</option>
              <option value="scheduled">Scheduled</option>
            </Select>
            {t.type === 'scheduled' && (
              <Select
                value={t.schedule?.kind ?? 'daily'}
                onChange={(e) =>
                  setTrigger({
                    schedule: {
                      kind: e.target.value as 'hourly' | 'daily' | 'weekly',
                      hour: t.schedule?.hour ?? 9,
                      weekday: t.schedule?.weekday ?? 1
                    }
                  })
                }
                style={{ minWidth: 0 }}
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily 09:00</option>
                <option value="weekly">Weekly Mon 09:00</option>
              </Select>
            )}
            {t.type === 'scheduled' && (
              <div className="auto-sched-note">
                Scheduled flows fire only while TubeGhost is open.
              </div>
            )}
            <ScopePicker
              scope={t.profileScope}
              groupIds={t.groupIds ?? []}
              profileIds={t.profileIds ?? []}
              groups={groups}
              profiles={profiles}
              onChange={(n) =>
                setTrigger({
                  profileScope: n.scope,
                  groupIds: n.groupIds,
                  profileIds: n.profileIds
                })
              }
            />
          </div>

          <div className="bp-group">Add action</div>
          <div className="bp-list">
            {ACTION_KEYS.map((key) => {
              const a = ACTIONS[key]
              return (
                <div className="bp-node" key={key} onClick={() => addStep(key)}>
                  <span className={'bp-node-ic tone-' + a.tone}>{iconFor(a.icon, 15)}</span>
                  {a.label}
                  <span className="bp-node-plus">
                    <Plus size={14} />
                  </span>
                </div>
              )
            })}
          </div>
        </aside>

        <div className="builder-canvas">
          <div className="bc-inner">
            <div className="flow-node trigger">
              <span className="fn-ic">
                <Sparkles size={17} />
              </span>
              <div>
                <div className="fn-t">Trigger</div>
                <div className="fn-s">{triggerSummary}</div>
              </div>
            </div>
            <div className="flow-conn" />
            <div className="flow-node locked">
              <span className="fn-ic tone-neutral">
                <AppWindow size={17} />
              </span>
              <div className="fn-body">
                <div className="fn-t">Open profile &amp; route proxy</div>
              </div>
            </div>
            {flow.steps.map((s, i) => {
              const a = ACTIONS[s.type]
              return (
                <React.Fragment key={s.id}>
                  <div className="flow-conn" />
                  <div
                    className={'flow-node' + (selected === s.id ? ' selected' : '')}
                    onClick={() => setSelected(s.id === selected ? null : s.id)}
                  >
                    <span className={'fn-ic tone-' + a.tone}>{iconFor(a.icon, 17)}</span>
                    <div className="fn-body">
                      <div className="fn-t">{a.label}</div>
                      <div className="fn-s">{summarizeStep(s)}</div>
                    </div>
                    <div className="fn-reorder">
                      <button
                        className="fn-mini"
                        disabled={i === 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          move(s.id, -1)
                        }}
                        title="Move up"
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        className="fn-mini"
                        disabled={i === flow.steps.length - 1}
                        onClick={(e) => {
                          e.stopPropagation()
                          move(s.id, 1)
                        }}
                        title="Move down"
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>
                    <div
                      className="fn-x"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeStep(s.id)
                      }}
                    >
                      <X size={14} />
                    </div>
                  </div>
                </React.Fragment>
              )
            })}
            <div className="flow-conn dashed" />
            <div className="flow-end">End of flow · add actions from the left</div>
          </div>

          {sel && (
            <div className="builder-inspector">
              <StepParamsEditor
                step={sel}
                onChange={(params) => patchStep(sel.id, { params })}
                onOptionalChange={(optional) => patchStep(sel.id, { optional })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
