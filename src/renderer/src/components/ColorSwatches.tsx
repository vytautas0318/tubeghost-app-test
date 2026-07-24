import * as React from 'react'
import { TAG_PRESET_COLORS } from '@/lib/tags'

// Preset color swatch row for the tag color picker (shared by the Profiles
// TagsCell and the Authenticator TagManager). Matches the Groups recolor UI.
export function ColorSwatches({
  value,
  onPick
}: {
  value: string
  onPick: (c: string) => void
}): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-1">
      {TAG_PRESET_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          className={
            'w-4 h-4 rounded-full border border-black/10 dark:border-white/10 hover:ring-2 hover:ring-[var(--red)]/30' +
            (c.toLowerCase() === value.toLowerCase() ? ' ring-2 ring-[var(--red)]/50' : '')
          }
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}
    </div>
  )
}
