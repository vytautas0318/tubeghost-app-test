import * as React from 'react'
import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button, Checkbox, SegmentedControl, Input } from '@tubeghost/ui'
import type { ExtensionWithAssignment, AssignMode } from '@/lib/extensions'
import type { GroupRow } from '@/lib/groups'
import type { ProfileRow } from '@/lib/profiles'

// Modal to set an extension's assignment: all / groups / specific profiles /
// none. Reuses the design-system SegmentedControl + Checkbox primitives.
export function AssignEditor({
  ext,
  groups,
  profiles,
  saving,
  onSave,
  onClose
}: {
  ext: ExtensionWithAssignment
  groups: GroupRow[]
  profiles: ProfileRow[]
  saving: boolean
  onSave: (a: { mode: AssignMode; groupIds: string[]; profileIds: string[] }) => void
  onClose: () => void
}): React.ReactElement {
  const [mode, setMode] = useState<AssignMode>(ext.assign_mode)
  const [groupIds, setGroupIds] = useState<string[]>(ext.groupIds)
  const [profileIds, setProfileIds] = useState<string[]>(ext.profileIds)
  const [q, setQ] = useState('')

  const toggleIn = (arr: string[], id: string): string[] =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]

  const filteredProfiles = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return profiles
    return profiles.filter((p) => p.name?.toLowerCase().includes(t))
  }, [profiles, q])

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        className="relative w-[460px] max-h-[80vh] flex flex-col bg-[var(--bg)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--line)] flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--t1)]">Manage profiles</h3>
            <p className="text-xs text-[var(--t3)] mt-0.5">{ext.name}</p>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--t4)] hover:text-[var(--t1)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          <SegmentedControl<AssignMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'all', label: 'All' },
              { value: 'groups', label: 'Groups' },
              { value: 'profiles', label: 'Profiles' },
              { value: 'none', label: 'None' }
            ]}
          />

          {mode === 'all' && (
            <p className="text-xs text-[var(--t3)]">
              Every profile in the workspace loads this extension at launch.
            </p>
          )}
          {mode === 'none' && (
            <p className="text-xs text-[var(--t3)]">
              Assigned to nothing — no profile loads this extension.
            </p>
          )}

          {mode === 'groups' && (
            <div className="space-y-1.5 max-h-[46vh] overflow-auto">
              {groups.length === 0 && <p className="text-xs text-[var(--t3)]">No groups yet.</p>}
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2.5 py-1 cursor-pointer">
                  <Checkbox
                    checked={groupIds.includes(g.id)}
                    onChange={() => setGroupIds((a) => toggleIn(a, g.id))}
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: g.color }}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-[var(--t1)] truncate">{g.name}</span>
                </label>
              ))}
            </div>
          )}

          {mode === 'profiles' && (
            <div className="space-y-2">
              <Input
                placeholder="Search profiles…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                wrapStyle={{ width: '100%' }}
              />
              <div className="space-y-1.5 max-h-[38vh] overflow-auto">
                {filteredProfiles.length === 0 && (
                  <p className="text-xs text-[var(--t3)]">No matching profiles.</p>
                )}
                {filteredProfiles.map((p) => (
                  <label key={p.id} className="flex items-center gap-2.5 py-1 cursor-pointer">
                    <Checkbox
                      checked={profileIds.includes(p.id)}
                      onChange={() => setProfileIds((a) => toggleIn(a, p.id))}
                    />
                    <span className="text-sm text-[var(--t1)] truncate">
                      {p.name || `Profile ${p.profile_number ?? ''}`}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--line)] flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => onSave({ mode, groupIds, profileIds })}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
