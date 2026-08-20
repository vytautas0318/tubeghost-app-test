// Bulk create — batch details.
//
// Generates N profiles from a name prefix + running number, with a shared
// platform / group / proxy policy. Each profile still gets its own fingerprint
// from createProfile(), so a batch is N distinct devices, not N clones.

import * as React from 'react'
import { ChevronRight, Layers } from 'lucide-react'
import { Input } from '@/components/ui'
import { SaSelect } from '@/pages/profile-editor/SaSelect'
import { GroupSelect } from '@/pages/profile-editor/GroupSelect'
import { Toggle } from '@/components/ui'
import {
  batchNames,
  MAX_BATCH,
  SOCIAL_LABELS,
  type BatchSpec,
  type ProxyMode,
  type SocialPlatform
} from './batchSpec'

export function BatchForm({
  spec,
  onChange,
  workspaceId,
  freeProxies,
  disabled,
  onOpenFingerprint
}: {
  spec: BatchSpec
  onChange: (patch: Partial<BatchSpec>) => void
  workspaceId: string | null
  freeProxies: number
  disabled: boolean
  // Jumps to the Fingerprint tab, the one place the mode is changed.
  onOpenFingerprint: () => void
}): React.ReactElement {
  const clamp = (n: number): number => Math.min(MAX_BATCH, Math.max(1, n || 1))
  const setCount = (n: number): void => onChange({ count: clamp(n) })

  // The count field is free-text: the 5/10/25/50 chips are shortcuts, not the
  // only choices. `draftCount` holds what the user is mid-way through typing
  // so clearing the box doesn't snap to 1 before they can type a new number —
  // clamping happens on blur instead.
  const [draftCount, setDraftCount] = React.useState<string | null>(null)

  return (
    <div className="sa-tile">
      <div className="sa-tk">
        <Layers />
        Batch details
      </div>
      <div className="sa-hint">Generate many profiles at once.</div>

      <div className="bulk-form">
        <label className="gw-field">
          <span>Name prefix</span>
          <Input
            value={spec.prefix}
            disabled={disabled}
            onChange={(e) => onChange({ prefix: e.target.value })}
          />
        </label>
        <label className="gw-field">
          <span>Start numbering at</span>
          <Input
            type="number"
            min={1}
            value={spec.start}
            disabled={disabled}
            onChange={(e) => onChange({ start: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>

        <div className="gw-field wide">
          <span>How many profiles</span>
          <div className="stepper">
            <button
              type="button"
              className="stepper-btn"
              aria-label="One fewer"
              disabled={disabled || spec.count <= 1}
              onClick={() => setCount(spec.count - 1)}
            >
              −
            </button>
            <input
              className="stepper-val"
              type="number"
              min={1}
              max={MAX_BATCH}
              value={draftCount ?? spec.count}
              aria-label="How many profiles"
              disabled={disabled}
              onChange={(e) => {
                const raw = e.target.value
                setDraftCount(raw)
                // Only commit a real number; an empty box stays empty until blur.
                if (raw.trim() !== '') onChange({ count: clamp(Number(raw)) })
              }}
              onBlur={() => {
                if (draftCount !== null && draftCount.trim() === '') setCount(1)
                setDraftCount(null)
              }}
            />
            <button
              type="button"
              className="stepper-btn"
              aria-label="One more"
              disabled={disabled || spec.count >= MAX_BATCH}
              onClick={() => setCount(spec.count + 1)}
            >
              +
            </button>
            <div className="stepper-quick">
              {[5, 10, 25, 50].map((n) => (
                <span
                  key={n}
                  className={'sq' + (spec.count === n ? ' on' : '')}
                  onClick={() => !disabled && setCount(n)}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
          <div className="sa-hint">
            Names: {batchNames({ ...spec, count: 1 })[0]} … {batchNames(spec)[spec.count - 1] ?? ''}
          </div>
        </div>

        <label className="gw-field">
          <span>Platform</span>
          <SaSelect
            value={spec.social}
            ariaLabel="Platform"
            disabled={disabled}
            onChange={(v) => onChange({ social: v as SocialPlatform })}
            options={(Object.keys(SOCIAL_LABELS) as SocialPlatform[]).map((k) => ({
              value: k,
              label: SOCIAL_LABELS[k]
            }))}
          />
        </label>
        <label className="gw-field">
          <span>Group</span>
          <GroupSelect
            workspaceId={workspaceId}
            value={spec.groupId}
            onChange={(g) => onChange({ groupId: g })}
            searchable
          />
        </label>

        <label className="gw-field">
          <span>Operating system</span>
          <SaSelect
            value={spec.platform}
            ariaLabel="Operating system"
            disabled={disabled}
            onChange={(v) => onChange({ platform: v })}
            options={[
              { value: 'windows', label: 'Windows 11' },
              { value: 'macos', label: 'macOS' }
            ]}
          />
        </label>

        <label className="gw-field wide">
          <span>Proxy assignment</span>
          <SaSelect
            value={spec.proxyMode}
            ariaLabel="Proxy assignment"
            disabled={disabled}
            onChange={(v) => onChange({ proxyMode: v as ProxyMode })}
            options={[
              { value: 'pool', label: 'Round-robin from pool' },
              { value: 'none', label: 'No proxy' }
            ]}
          />
          <div className="sa-hint">
            {spec.proxyMode === 'pool'
              ? `${freeProxies} unassigned in your pool. Timezone, language and location follow each IP.`
              : 'Assign a proxy later from each profile.'}
          </div>
        </label>
      </div>

      {/* Read-only: the switch itself lives on the Fingerprint tab, which is
          also where a shared base is edited. Duplicating the control here gave
          two homes for one setting. */}
      <div className="bulk-row">
        <div>
          <div className="bulk-row-n">Fingerprints</div>
          <div className="bulk-row-d">
            {spec.fpMode === 'random'
              ? 'Each profile gets a unique, internally consistent device.'
              : 'All profiles share the base set on the Fingerprint tab (noise stays unique).'}
          </div>
        </div>
        <button type="button" className="bulk-row-link" onClick={onOpenFingerprint}>
          {spec.fpMode === 'random' ? 'Randomize each' : 'Shared base'}
          <ChevronRight />
        </button>
      </div>

      <label className="sa-switch" style={{ marginTop: '4px' }}>
        <Toggle
          checked={spec.optimized}
          disabled={disabled}
          onChange={(v) => onChange({ optimized: v })}
        />
        <span>Optimized for YouTube</span>
      </label>
      <div className="sa-hint">
        Tunes every fingerprint in this batch to the signals YouTube reads.
      </div>
    </div>
  )
}
