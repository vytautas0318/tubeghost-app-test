// Renders the editable params for the selected step node, driven by the action's
// ParamField[] descriptors (shared/automations/catalog). Writes back into
// step.params. Kept generic so adding a field to the catalog needs no UI change.

import * as React from 'react'
import { Input, Select, Toggle } from '@tubeghost/ui'
import { ACTIONS } from '../../../../shared/automations/catalog'
import type { Step } from '../../../../shared/automations/types'

export function StepParamsEditor({
  step,
  onChange,
  onOptionalChange
}: {
  step: Step
  onChange: (params: Record<string, unknown>) => void
  onOptionalChange: (optional: boolean) => void
}): React.ReactElement {
  const spec = ACTIONS[step.type]
  const set = (key: string, value: unknown): void => onChange({ ...step.params, [key]: value })

  return (
    <div className="auto-params">
      <div className="auto-params-title">{spec.label}</div>
      {spec.fields.map((f) => {
        const val = step.params[f.key]
        if (f.kind === 'number') {
          return (
            <label className="auto-field" key={f.key}>
              <span>{f.label}</span>
              <Input
                type="number"
                min={f.min}
                max={f.max}
                value={typeof val === 'number' ? val : ''}
                onChange={(e) => set(f.key, e.target.value === '' ? 0 : Number(e.target.value))}
              />
            </label>
          )
        }
        if (f.kind === 'select') {
          return (
            <label className="auto-field" key={f.key}>
              <span>{f.label}</span>
              <Select value={String(val ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                {f.options.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>
          )
        }
        if (f.kind === 'toggle') {
          return (
            <label className="auto-field row" key={f.key}>
              <span>{f.label}</span>
              <Toggle checked={!!val} onChange={(next) => set(f.key, next)} />
            </label>
          )
        }
        // text (single or multiline)
        return (
          <label className="auto-field" key={f.key}>
            <span>{f.label}</span>
            {f.multiline ? (
              <textarea
                className="auto-textarea"
                rows={3}
                placeholder={f.placeholder}
                value={String(val ?? '')}
                onChange={(e) => set(f.key, e.target.value)}
              />
            ) : (
              <Input
                type="text"
                placeholder={f.placeholder}
                value={String(val ?? '')}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </label>
        )
      })}
      <label className="auto-field row">
        <span>Continue on error (optional step)</span>
        <Toggle checked={!!step.optional} onChange={onOptionalChange} />
      </label>
    </div>
  )
}
