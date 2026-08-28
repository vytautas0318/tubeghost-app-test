// Step bodies for the Guided create wizard. Split from GuidedCreate so the
// wizard file stays the shell (progress, navigation, transitions) and each
// question's markup lives on its own.

import * as React from 'react'
import { Check, Globe, Sparkles, X } from 'lucide-react'
import { OsMark } from '@/pages/profiles-list/osFlag'
import { SaSelect } from './SaSelect'
import { GroupSelect } from './GroupSelect'
import { browserVersionsFor } from './randomize'
import { platformCoherencePatch } from './platformCoherence'
import { OPTIMIZED_PRESET, isOptimizedOn } from './optimizedPreset'
import type { SimpleDraft } from './useSimpleDraft'

function Choice({
  on,
  icon,
  title,
  sub,
  onClick
}: {
  on: boolean
  icon?: React.ReactNode
  title: string
  sub: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className={'gw-choice' + (on ? ' on' : '')}
      onClick={onClick}
    >
      <span className="gw-choice-h">
        {icon}
        <span className="gw-choice-t">{title}</span>
        <span className="gw-tick">
          <Check />
        </span>
      </span>
      <span className="gw-choice-s">{sub}</span>
    </button>
  )
}

export function NameStep({
  draft,
  patch,
  onEnter
}: {
  draft: SimpleDraft
  patch: (p: Partial<SimpleDraft>) => void
  onEnter: () => void
}): React.ReactElement {
  return (
    <input
      className="gw-input"
      autoFocus
      value={draft.name}
      placeholder="True Crime Doc"
      aria-label="Profile name"
      onChange={(e) => patch({ name: e.target.value })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter()
      }}
    />
  )
}

export function DeviceStep({
  draft,
  patch
}: {
  draft: SimpleDraft
  patch: (p: Partial<SimpleDraft>) => void
}): React.ReactElement {
  const versions = browserVersionsFor(draft.platform)
  const setPlatform = (platform: string): void => {
    if (platform === draft.platform) return
    patch({ platform, ...platformCoherencePatch({ ...draft, platform }) })
  }
  return (
    <div className="gw-stack">
      <div className="gw-choices" role="radiogroup" aria-label="Device">
        <Choice
          on={draft.platform === 'windows'}
          icon={<OsMark platform="windows" className="shrink-0" />}
          title="Windows"
          sub="Most common on YouTube"
          onClick={() => setPlatform('windows')}
        />
        <Choice
          on={draft.platform === 'macos'}
          icon={<OsMark platform="macos" className="shrink-0" />}
          title="macOS"
          sub="Apple silicon, Retina metrics"
          onClick={() => setPlatform('macos')}
        />
      </div>
      <label className="gw-field">
        <span>Browser version</span>
        <SaSelect
          value={draft.brand_version_major}
          ariaLabel="Browser version"
          onChange={(v) => patch({ brand_version_major: v })}
          options={versions.map((v, i) => ({
            value: v,
            label: i === 0 ? `Latest Chromium ${v} — recommended` : `Chromium ${v}`
          }))}
        />
      </label>
      <div className="gw-note">
        Stay on the latest build. An outdated version is itself a signal.
      </div>
    </div>
  )
}

export function ProxyStep({
  assignProxy,
  onChange,
  free
}: {
  assignProxy: boolean
  onChange: (v: boolean) => void
  free: number
}): React.ReactElement {
  return (
    <div className="gw-stack">
      <div className="gw-choices" role="radiogroup" aria-label="Proxy">
        <Choice
          on={assignProxy}
          icon={<Globe />}
          title="Assign a proxy"
          sub={free > 0 ? `${free} unassigned in your pool` : 'None unassigned right now'}
          onClick={() => onChange(true)}
        />
        <Choice
          on={!assignProxy}
          icon={<X />}
          title="No proxy"
          sub="Uses your real IP — not recommended"
          onClick={() => onChange(false)}
        />
      </div>
      {assignProxy && free === 0 && (
        <div className="gw-note">
          Every proxy in your pool is already assigned. The profile will be created without one —
          you can attach a proxy later from the profile.
        </div>
      )}
    </div>
  )
}

export function YouTubeStep({
  draft,
  patch
}: {
  draft: SimpleDraft
  patch: (p: Partial<SimpleDraft>) => void
}): React.ReactElement {
  const optimized = isOptimizedOn(draft)
  return (
    <div className="gw-choices" role="radiogroup" aria-label="YouTube optimization">
      <Choice
        on={optimized}
        icon={<Sparkles />}
        title="Yes, optimize it"
        sub="Recommended for every channel profile"
        onClick={() => patch({ ...OPTIMIZED_PRESET, google_optimized: true })}
      />
      <Choice
        on={!optimized}
        title="Keep it generic"
        sub="For non-YouTube accounts"
        onClick={() => patch({ google_optimized: false })}
      />
    </div>
  )
}

export function LinkStep({
  draft,
  patch,
  workspaceId
}: {
  draft: SimpleDraft
  patch: (p: Partial<SimpleDraft>) => void
  workspaceId: string | null
}): React.ReactElement {
  return (
    <div className="gw-stack">
      <label className="gw-field">
        <span>Group</span>
        <GroupSelect
          workspaceId={workspaceId}
          value={draft.group_id}
          onChange={(g) => patch({ group_id: g })}
          searchable
        />
      </label>
      {/* Authenticator + phone linking need a saved profile id (the link
          tables are keyed on it), so they are offered on the profile itself
          rather than shown here as controls that cannot work yet. */}
      <div className="gw-note">
        An authenticator token and a phone number can be linked from the profile as soon as it
        exists.
      </div>
    </div>
  )
}
