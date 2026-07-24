// The confirmation card for an assistant action plan. Shows the proposed steps
// and Approve/Cancel; after approval it shows live per-step results. Actions
// only run when the user clicks Approve (confirm-before-acting).

import * as React from 'react'
import { CheckCircle2, XCircle, Loader2, Play, X } from 'lucide-react'
import { ACTION_TOOLS, type ActionPlan } from '../../../../shared/assistant/plan'
import type { PlanStatus } from './useAssistant'
import type { StepResult } from '@/lib/assistant-actions'

export function PlanCard({
  plan,
  status,
  results,
  onApprove,
  onCancel
}: {
  plan: ActionPlan
  status: PlanStatus
  results?: StepResult[]
  onApprove: () => void
  onCancel: () => void
}): React.ReactElement {
  const done = status === 'done'
  const running = status === 'running'

  return (
    <div className="as-msg as-msg-assistant">
      <div className="as-bubble as-plan">
        <div className="as-plan-title">
          {status === 'cancelled' ? 'Cancelled' : "I'll do this:"}
        </div>
        <div className="as-plan-summary">{plan.summary}</div>

        <ol className="as-plan-steps">
          {plan.steps.map((s, i) => {
            const r = results?.[i]
            return (
              <li key={s.id} className="as-plan-step">
                <span className="as-plan-step-ic">
                  {r ? (
                    r.ok ? (
                      <CheckCircle2 size={14} className="as-log-ok" />
                    ) : (
                      <XCircle size={14} className="as-log-err" />
                    )
                  ) : running ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <span className="as-plan-dot" />
                  )}
                </span>
                <span className="as-plan-step-text">
                  {ACTION_TOOLS[s.kind].summarize(s.args)}
                  {r?.message && <span className="as-plan-step-msg"> — {r.message}</span>}
                </span>
              </li>
            )
          })}
        </ol>

        {status === 'pending' && (
          <div className="as-plan-actions">
            <button className="as-plan-btn as-plan-approve" onClick={onApprove}>
              <Play size={13} /> Approve & run
            </button>
            <button className="as-plan-btn as-plan-cancel" onClick={onCancel}>
              <X size={13} /> Cancel
            </button>
          </div>
        )}
        {running && <div className="as-plan-foot">Running…</div>}
        {done && (
          <div className="as-plan-foot">
            Done — {results?.filter((r) => r.ok).length ?? 0}/{plan.steps.length} succeeded.
          </div>
        )}
      </div>
    </div>
  )
}
