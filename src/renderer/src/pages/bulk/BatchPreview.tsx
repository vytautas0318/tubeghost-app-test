import * as React from 'react'
import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { PlatformIcon } from '@tubeghost/ui'
import type { SocialPlatform } from './batchSpec'

const SHOWN = 8

/**
 * Live preview of what the batch will create. Shows the first few generated
 * names so a wrong prefix or start number is obvious BEFORE creating 50
 * profiles — which is otherwise a tedious thing to undo.
 */
export function BatchPreview({
  names,
  social,
  summary
}: {
  names: string[]
  social: SocialPlatform
  summary: string
}): React.ReactElement {
  // Collapsed by default so the panel stays a glanceable summary; expanding
  // shows every name for a final check before creating a large batch.
  //
  // Keyed on names.length rather than synced in an effect: changing the count
  // should collapse the list (it's a different batch now), and deriving that
  // avoids a setState-in-effect cascade.
  const [expandedAt, setExpandedAt] = useState<number | null>(null)
  const expanded = expandedAt === names.length

  const shown = expanded ? names : names.slice(0, SHOWN)
  const rest = names.length - shown.length

  return (
    <aside className="create-preview">
      <div className="cp-head">
        <span className="cp-title">Preview</span>
        <span className="cp-count">{names.length}</span>
      </div>
      <div className="cp-list">
        {shown.map((n) => (
          <div className="cp-row" key={n}>
            <PlatformIcon platform={social} size={18} />
            <span className="cp-name">{n}</span>
          </div>
        ))}
      </div>
      {(rest > 0 || expanded) && (
        <button
          type="button"
          className={'cp-more' + (expanded ? ' open' : '')}
          aria-expanded={expanded}
          onClick={() => setExpandedAt(expanded ? null : names.length)}
        >
          <ChevronDown />
          {expanded ? 'Show less' : `+ ${rest} more`}
        </button>
      )}
      <div className="cp-foot">
        <Info />
        <span>{summary}</span>
      </div>
    </aside>
  )
}
