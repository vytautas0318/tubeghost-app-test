// Guided create — one question per step, for users who don't yet know what a
// fingerprint or a proxy is.
//
// Writes into the SAME useSimpleDraft the Simple and Advanced create paths use,
// so switching mode mid-flow keeps every answer. Nothing here is a separate
// data model; the wizard is purely a different way to fill the same draft.

import * as React from 'react'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DeviceStep, LinkStep, NameStep, ProxyStep, YouTubeStep } from './GuidedSteps'
import type { SimpleDraft } from './useSimpleDraft'

export interface GuidedProxyChoice {
  assign: boolean
}

const STEPS = [
  {
    k: 'name',
    q: 'What should we call this profile?',
    h: 'Use the channel or account name so you can find it in a list of hundreds.'
  },
  {
    k: 'device',
    q: 'Which device should it look like?',
    h: 'Every other signal is generated to match whatever you pick here.'
  },
  {
    k: 'proxy',
    q: 'Give it a dedicated IP?',
    h: 'One profile, one IP is what keeps channels from linking. Timezone, language and location follow it.'
  },
  {
    k: 'yt',
    q: 'Optimize the fingerprint for YouTube?',
    h: 'Tunes the generated fingerprint to the signals YouTube actually reads.'
  },
  {
    k: 'link',
    q: 'Anything to link now?',
    h: 'All optional. You can add these later from the profile.'
  }
] as const

export function GuidedCreate({
  draft,
  patch,
  workspaceId,
  unassignedProxies,
  assignProxy,
  onAssignProxyChange,
  onCancel,
  onCreate,
  creating
}: {
  draft: SimpleDraft
  patch: (p: Partial<SimpleDraft>) => void
  workspaceId: string | null
  // How many pool proxies have no profile yet — drives the step-3 copy so the
  // user isn't told to assign one when there are none left.
  unassignedProxies: number
  assignProxy: boolean
  onAssignProxyChange: (v: boolean) => void
  onCancel: () => void
  onCreate: () => void
  creating: boolean
}): React.ReactElement {
  const [step, setStep] = useState(0)
  // Drives the slide direction so going Back animates the opposite way.
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')

  const cur = STEPS[step]
  const last = step === STEPS.length - 1
  // Only the name is required — every other step has a sensible default, which
  // is the point of a guided flow.
  const canGo = cur.k === 'name' ? draft.name.trim().length > 0 : true

  const go = (n: number): void => {
    setDir(n > step ? 'fwd' : 'back')
    setStep(n)
  }
  const next = (): void => {
    if (last) {
      onCreate()
      return
    }
    if (canGo) go(step + 1)
  }

  return (
    <div className="gw" role="group" aria-live="polite">
      <div className="gw-top">
        <div className="gw-count">
          Step {step + 1} <span>of {STEPS.length}</span>
        </div>
        <div
          className="gw-track"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label="Progress"
        >
          <span className="gw-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className={'gw-step ' + dir} key={cur.k}>
        <h2 className="gw-q">{cur.q}</h2>
        <p className="gw-h">{cur.h}</p>

        <div className="gw-body">
          {cur.k === 'name' && <NameStep draft={draft} patch={patch} onEnter={next} />}
          {cur.k === 'device' && <DeviceStep draft={draft} patch={patch} />}
          {cur.k === 'proxy' && (
            <ProxyStep
              assignProxy={assignProxy}
              onChange={onAssignProxyChange}
              free={unassignedProxies}
            />
          )}
          {cur.k === 'yt' && <YouTubeStep draft={draft} patch={patch} />}
          {cur.k === 'link' && <LinkStep draft={draft} patch={patch} workspaceId={workspaceId} />}
        </div>
      </div>

      <div className="gw-foot">
        {step > 0 ? (
          <button type="button" className="gw-back" onClick={() => go(step - 1)}>
            <ChevronLeft />
            Back
          </button>
        ) : (
          <button type="button" className="gw-skip" onClick={onCancel}>
            Cancel
          </button>
        )}
        <div className="gw-foot-r">
          {last && (
            <button type="button" className="gw-skip" onClick={onCreate} disabled={creating}>
              Skip for now
            </button>
          )}
          <button type="button" className="gw-next" onClick={next} disabled={!canGo || creating}>
            {creating ? 'Creating…' : last ? 'Create profile' : 'Continue'}
            {!last && <ChevronRight />}
          </button>
        </div>
      </div>
    </div>
  )
}
