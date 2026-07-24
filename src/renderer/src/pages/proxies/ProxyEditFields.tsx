import * as React from 'react'
import { DrawerSection } from './drawer-parts'

const inputCls =
  'flex-1 px-3 py-1.5 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30'
const lblCls =
  'block text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)] mb-1'
const saveBtn =
  'px-3 py-1.5 text-xs font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-50'

export function ProxyEditFields({
  label,
  notes,
  labelDirty,
  notesDirty,
  savingLabel,
  savingNotes,
  onLabelChange,
  onNotesChange,
  onSaveLabel,
  onSaveNotes
}: {
  label: string
  notes: string
  labelDirty: boolean
  notesDirty: boolean
  savingLabel: boolean
  savingNotes: boolean
  onLabelChange: (v: string) => void
  onNotesChange: (v: string) => void
  onSaveLabel: () => void
  onSaveNotes: () => void
}): React.ReactElement {
  return (
    <DrawerSection title="Label & notes">
      <div className="space-y-3">
        <div>
          <label className={lblCls}>Label</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
              className={inputCls}
            />
            {labelDirty && (
              <button onClick={onSaveLabel} disabled={savingLabel} className={saveBtn}>
                {savingLabel ? '…' : 'Save'}
              </button>
            )}
          </div>
        </div>
        <div>
          <label className={lblCls}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
          />
          {notesDirty && (
            <button onClick={onSaveNotes} disabled={savingNotes} className={`mt-1.5 ${saveBtn}`}>
              {savingNotes ? 'Saving…' : 'Save notes'}
            </button>
          )}
        </div>
      </div>
    </DrawerSection>
  )
}
