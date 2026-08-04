// Proxy tab for a profile that doesn't exist yet. Instead of the old
// "save first, then attach a proxy" card, the user configures the proxy here
// and it lands with the INSERT — one step, AdsPower-style.
//
// Saved profiles keep using ProxyCard (immediate per-pick writes); this card
// only stages a draft (see proxy-draft.ts).

import * as React from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, RefreshCw } from 'lucide-react'
import { Section } from './parts'
import { ProxyPicker } from './ProxyPicker'
import { ProxyCardFields } from './ProxyCardFields'
import { proxyLabel, type ProxyDraft, type ProxyDraftMode } from './proxy-draft'
import type { NewProfileProxyState } from './useNewProfileProxy'

const MODES: Array<{ key: ProxyDraftMode; label: string }> = [
  { key: 'auto', label: 'Auto (unused proxy)' },
  { key: 'pool', label: 'Choose specific' },
  { key: 'custom', label: 'Custom inline' },
  { key: 'none', label: 'No proxy' }
]

function AutoMode({ state }: { state: NewProfileProxyState }): React.ReactElement {
  const { unused, unusedError, refreshUnused } = state
  if (unused === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--t3)] py-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        Checking the pool for unused proxies…
      </div>
    )
  }
  if (unusedError) {
    return <div className="text-xs text-[var(--red)]">Failed to read the pool: {unusedError}</div>
  }
  if (unused.length === 0) {
    return (
      <div className="px-3 py-4 bg-[var(--panel-2)] rounded-md text-xs text-[var(--t2)]">
        Every proxy in this workspace is already assigned to a profile. The profile will be
        created without a proxy — you can attach one later.{' '}
        <Link to="/proxies" className="text-[var(--red)] hover:underline font-medium">
          Add proxies →
        </Link>
      </div>
    )
  }
  const next = unused[0]
  return (
    <div className="px-3 py-2.5 bg-[var(--panel-2)] rounded-md text-xs space-y-1">
      <div className="text-[var(--t3)] uppercase font-semibold tracking-wider">Will assign</div>
      <div className="mono text-[var(--t1)]">
        {next.proxy_type.toUpperCase()} · {proxyLabel(next)}
      </div>
      <div className="text-[var(--t3)] flex items-center gap-2 pt-0.5">
        <span>
          {unused.length} unused {unused.length === 1 ? 'proxy' : 'proxies'} in the pool
          {next.last_test_ok === true ? ' · tested OK' : ''}
        </span>
        <button
          type="button"
          onClick={refreshUnused}
          className="inline-flex items-center gap-1 text-[var(--t2)] hover:text-[var(--t1)]"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>
    </div>
  )
}

export function NewProfileProxyCard({
  state,
  canEdit
}: {
  state: NewProfileProxyState
  canEdit: boolean
}): React.ReactElement {
  const { draft, setDraft } = state
  const patch = (next: Partial<ProxyDraft>): void => setDraft({ ...draft, ...next })

  return (
    <Section
      title="Proxy"
      subtitle={
        <span className="text-xs">
          Attached when you save — no second step. Auth is forwarded automatically at launch.
        </span>
      }
    >
      <div className="mb-4 inline-flex flex-wrap gap-0.5 p-0.5 bg-brand-cream/60 dark:bg-night-base rounded-md">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            disabled={!canEdit}
            onClick={() => patch({ mode: m.key })}
            className={
              'px-3 py-1 text-xs font-semibold rounded transition-colors disabled:opacity-40 ' +
              (draft.mode === m.key
                ? 'bg-[var(--red)] text-white shadow-sm'
                : 'text-[var(--t3)] hover:text-[var(--t1)] dark:hover:text-night-text')
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {draft.mode === 'auto' && <AutoMode state={state} />}

      {draft.mode === 'pool' && (
        <>
          {draft.pick && (
            <div className="mb-3 px-3 py-2 bg-[var(--green-soft)] text-[var(--green)] rounded-md text-xs inline-flex items-center gap-1.5">
              <Check className="w-3 h-3" />
              Selected: <span className="mono">{proxyLabel(draft.pick)}</span>
            </div>
          )}
          <ProxyPicker
            currentProxyHost={draft.pick?.host ?? null}
            currentProxyPort={draft.pick?.port ?? null}
            onPick={(p) => patch({ pick: p })}
            disabled={!canEdit}
          />
        </>
      )}

      {draft.mode === 'custom' && (
        <ProxyCardFields
          form={draft.fields}
          disabled={!canEdit}
          onChange={(p) => patch({ fields: { ...draft.fields, ...p } })}
        />
      )}

      {draft.mode === 'none' && (
        <div className="px-3 py-4 bg-[var(--panel-2)] rounded-md text-xs text-[var(--t2)]">
          The profile will be created without a proxy. It launches on your real connection until
          you attach one.
        </div>
      )}
    </Section>
  )
}
