import * as React from 'react'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, Input, Badge } from '@/components/ui'
import { ColorSwatches } from '@/components/ColorSwatches'
import { DEFAULT_TAG_COLOR, type TagRow } from '@/lib/tags'

// Tag selector for the Add-account dialog: toggle existing workspace tags AND
// create a brand-new one inline (name + color → workspace registry, then auto-
// selected). Controlled via `selected`/`onChange`.
export function TagPicker({
  workspaceTags,
  colorFor,
  canTagCreate,
  createTag,
  selected,
  onChange
}: {
  workspaceTags: TagRow[]
  colorFor: (name: string) => string
  canTagCreate: boolean
  createTag: (name: string, color: string) => Promise<void>
  selected: string[]
  onChange: (next: string[]) => void
}): React.ReactElement {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(DEFAULT_TAG_COLOR)
  const [err, setErr] = useState<string | null>(null)

  const toggle = (key: string): void =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])

  const reset = (): void => {
    setCreating(false)
    setName('')
    setColor(DEFAULT_TAG_COLOR)
    setErr(null)
  }

  const submit = async (): Promise<void> => {
    const n = name.trim()
    if (!n) return
    // Already exists → just select it rather than erroring.
    if (workspaceTags.some((t) => t.name.toLowerCase() === n.toLowerCase())) {
      if (!selected.includes(n)) toggle(n)
      reset()
      return
    }
    try {
      await createTag(n, color)
      if (!selected.includes(n)) onChange([...selected, n])
      reset()
    } catch (e) {
      setErr((e as Error).message || 'Could not create tag')
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {workspaceTags.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.name)}
            style={{ opacity: selected.includes(t.name) ? 1 : 0.45 }}
          >
            <Badge color={colorFor(t.name)}>{t.name}</Badge>
          </button>
        ))}
        {canTagCreate && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-[var(--line)] text-xs text-[var(--t2)] hover:text-[var(--t1)] hover:border-[var(--t3)]"
          >
            <Plus size={12} />
            New tag
          </button>
        )}
        {workspaceTags.length === 0 && !canTagCreate && (
          <p className="text-xs text-[var(--t3)]">No tags yet.</p>
        )}
      </div>

      {creating && (
        <div className="mt-2 p-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-2)]">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void submit()
                } else if (e.key === 'Escape') {
                  reset()
                }
              }}
              placeholder="Tag name…"
              wrapStyle={{ flex: 1 }}
            />
            {name.trim() && <Badge color={color}>{name.trim()}</Badge>}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <ColorSwatches value={color} onPick={setColor} />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={reset}
                className="px-2 py-1 text-xs text-[var(--t2)] hover:text-[var(--t1)]"
              >
                Cancel
              </button>
              <Button
                size="sm"
                variant="primary"
                disabled={!name.trim()}
                onClick={() => void submit()}
              >
                Create
              </Button>
            </div>
          </div>
          {err && <div className="mt-1.5 text-xs text-[var(--red)]">{err}</div>}
        </div>
      )}
    </>
  )
}
