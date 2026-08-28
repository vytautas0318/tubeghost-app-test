import * as React from 'react'
import { useState } from 'react'
import { Search, Star, Store, Plus } from 'lucide-react'
import { Button, Badge, Input } from '@tubeghost/ui'
import { ExtTile } from './ExtTile'
import { RECOMMENDED } from './extData'

// Browse tab: a search box that resolves a pasted CWS id/URL through the Web
// Store add flow (no public search API), plus a curated recommended list.
export function BrowseTab({
  canAdd,
  busy,
  onAdd
}: {
  canAdd: boolean
  busy: boolean
  // Runs the Web Store add flow for an id / pasted URL. Label is for toasts.
  onAdd: (urlOrId: string, label: string) => void
}): React.ReactElement {
  const [query, setQuery] = useState('')

  const submitSearch = (): void => {
    const q = query.trim()
    if (!q) return
    onAdd(q, q)
  }

  return (
    <>
      <div className="ext-search flex gap-2">
        <Input
          icon={<Search size={15} />}
          placeholder="Paste a Chrome Web Store link or extension ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitSearch()
          }}
          wrapStyle={{ width: '100%' }}
        />
        <Button
          variant="primary"
          disabled={!canAdd || busy || !query.trim()}
          onClick={submitSearch}
        >
          Add
        </Button>
      </div>

      <div className="ext-browse-label">Recommended for multi-account work</div>
      <div className="ext-grid">
        {RECOMMENDED.map((e) => (
          <div className="ext-card" key={e.webStoreId}>
            <div className="ext-card-top">
              <ExtTile name={e.name} iconDataUrl={e.icon} />
              <div className="ext-id">
                <div className="ext-name">{e.name}</div>
                <div className="ext-dev">{e.dev}</div>
              </div>
            </div>
            <div className="ext-meta">
              <Badge tone="neutral">{e.cat}</Badge>
              <span className="ext-rating">
                <Star size={13} fill="currentColor" />
                {e.rating}
              </span>
              <span className="ext-users">{e.users} users</span>
            </div>
            <div className="ext-foot">
              <span className="ext-store-link">
                <Store size={15} />
                Chrome Web Store
              </span>
              <Button
                size="sm"
                icon={<Plus size={14} />}
                disabled={!canAdd || busy}
                onClick={() => onAdd(e.webStoreId, e.name)}
              >
                Add
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
