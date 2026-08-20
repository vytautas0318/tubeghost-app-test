// The bulk-create tab bodies.
//
// Split from BulkCreate so that page stays an orchestrator (state + the create
// loop) and each tab's markup lives on its own. All four are presentational —
// they read props and call back, never touching Supabase.

import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { BatchForm } from './BatchForm'
import { BatchPreview } from './BatchPreview'
import { FingerprintFields } from '@/pages/profile-editor/FingerprintFields'
import type { Form } from '@/pages/profile-editor/fingerprintFields.types'
import type { BatchSpec } from './batchSpec'

export function FingerprintTab({
  spec,
  setSpec,
  fpBase,
  updateFpBase,
  rows,
  summary
}: {
  spec: BatchSpec
  setSpec: (fn: (v: BatchSpec) => BatchSpec) => void
  fpBase: Form
  updateFpBase: (p: Partial<Form>) => void
  rows: { name: string }[]
  summary: string
}): React.ReactElement {
  return (
    <div className="bulk-grid">
      <div className="sa-tile">
        <div className="sa-tk">Fingerprint base</div>
        <div className="bulk-row" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className="bulk-row-d">
            Set a base to apply to all profiles, or keep Randomize each.
          </div>
          <div className="vw-switch">
            <button
              type="button"
              className={'vw-btn' + (spec.fpMode === 'random' ? ' on' : '')}
              onClick={() => setSpec((v) => ({ ...v, fpMode: 'random' }))}
            >
              Randomize each
            </button>
            <button
              type="button"
              className={'vw-btn' + (spec.fpMode === 'shared' ? ' on' : '')}
              onClick={() => setSpec((v) => ({ ...v, fpMode: 'shared' }))}
            >
              Shared base
            </button>
          </div>
        </div>
        {spec.fpMode === 'random' ? (
          <div className="simple-note">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <b>Randomizing every profile.</b> Each of the {spec.count} profiles gets its own
              fresh, consistent fingerprint. Switch to <b>Shared base</b> to hand-tune one
              fingerprint for the whole batch.
            </span>
          </div>
        ) : (
          <>
            <div className="simple-note">
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Applied to all {spec.count} profiles. Hardware noise stays unique per profile, so
                they never share a canvas or audio hash.
              </span>
            </div>
            <FingerprintFields form={fpBase} update={updateFpBase} />
          </>
        )}
      </div>
      <BatchPreview names={rows.map((r) => r.name)} social={spec.social} summary={summary} />
    </div>
  )
}

export function BatchTab({
  spec,
  setSpec,
  workspace,
  freeProxies,
  running,
  rows,
  summary,
  onOpenFingerprint
}: {
  spec: BatchSpec
  setSpec: (fn: (v: BatchSpec) => BatchSpec) => void
  workspace: { workspace_id: string } | null
  freeProxies: number
  running: boolean
  rows: { name: string }[]
  summary: string
  onOpenFingerprint: () => void
}): React.ReactElement {
  return (
    <div className="bulk-grid">
      <BatchForm
        spec={spec}
        onChange={(patch) => setSpec((v) => ({ ...v, ...patch }))}
        workspaceId={workspace?.workspace_id ?? null}
        freeProxies={freeProxies}
        disabled={running}
        onOpenFingerprint={onOpenFingerprint}
      />
      <BatchPreview names={rows.map((r) => r.name)} social={spec.social} summary={summary} />
    </div>
  )
}
