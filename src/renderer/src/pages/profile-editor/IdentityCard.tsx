import * as React from 'react'
import { Field, Section } from './parts'
import type { FormState } from './types'
import { GroupSelect } from './GroupSelect'
import { TagsField } from './TagsField'
import { useWorkspace } from '@/store/workspace'

export function IdentityCard({
  form,
  onChange,
  footer
}: {
  form: FormState
  onChange: (f: FormState) => void
  // Extra content rendered inside the same card, after Notes (Linked
  // credentials) — so General is one white card, matching the DS.
  footer?: React.ReactNode
}): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)

  const inputCls =
    'w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30'

  return (
    <Section title="General" subtitle="Identity and organization for this profile.">
      <div className="space-y-4">
        <Field label="Profile name">
          <input
            type="text"
            autoFocus
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="e.g. Channel — Cooking Tips US"
            className={inputCls}
          />
        </Field>
        <Field label="Group">
          <GroupSelect
            workspaceId={workspace?.workspace_id ?? null}
            value={form.group_id ?? null}
            onChange={(groupId) => onChange({ ...form, group_id: groupId })}
          />
        </Field>
        <Field label="Tags">
          <TagsField
            workspaceId={workspace?.workspace_id ?? null}
            tags={form.tags}
            onChange={(patch) => onChange({ ...form, ...patch })}
          />
        </Field>
        <Field label="Notes">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
            placeholder="Anything to remember about this profile…"
            className={`${inputCls} resize-none`}
          />
        </Field>
      </div>
      {footer}
    </Section>
  )
}
