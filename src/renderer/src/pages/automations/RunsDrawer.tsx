// A slide-over drawer showing recent runs for one automation, with per-profile
// per-step logs — the visible failure surface (§10). Read-only.

import * as React from 'react'
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { X, CheckCircle2, XCircle, MinusCircle, Loader2 } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui'
import { listRunsForAutomation, type RunRow } from '@/lib/automations/runs'
import type { AutomationWithMeta } from '@/lib/automations'
import type { StepStatus, RunStatus } from '../../../../shared/automations/types'

const RUN_TONE: Record<RunStatus, BadgeTone> = {
  running: 'blue',
  success: 'green',
  error: 'red',
  cancelled: 'amber'
}

function stepIcon(status: StepStatus): React.ReactNode {
  if (status === 'ok') return <CheckCircle2 size={13} className="auto-log-ok" />
  if (status === 'skipped') return <MinusCircle size={13} className="auto-log-skip" />
  return <XCircle size={13} className="auto-log-err" />
}

export function RunsDrawer({
  automation,
  onClose
}: {
  automation: AutomationWithMeta
  onClose: () => void
}): React.ReactElement {
  const [runs, setRuns] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    listRunsForAutomation(automation.id)
      .then((r) => !cancelled && setRuns(r))
      .catch(() => !cancelled && setRuns([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [automation.id])

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{automation.name}</div>
            <div className="drawer-sub">Recent runs</div>
          </div>
          <div className="drawer-x" onClick={onClose}>
            <X size={16} />
          </div>
        </div>

        <div className="drawer-body">
          {loading && (
            <div className="auto-runs-empty">
              <Loader2 size={16} className="spin" /> Loading runs…
            </div>
          )}
          {!loading && runs.length === 0 && <div className="auto-runs-empty">No runs yet.</div>}
          {runs.map((run) => (
            <div className="auto-run" key={run.id}>
              <div className="auto-run-head">
                <Badge tone={RUN_TONE[run.status]}>{run.status}</Badge>
                <span className="auto-run-when">
                  {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
                </span>
                <span className="auto-run-by">
                  {run.triggered_by_kind === 'schedule' ? 'scheduled' : 'manual'}
                </span>
              </div>
              {run.profile_results.map((pr) => (
                <div className="auto-run-profile" key={pr.profileId}>
                  <div className="auto-run-profile-name">
                    {pr.profileName ?? pr.profileId} · {pr.status}
                  </div>
                  {pr.stepLogs.map((log, i) => (
                    <div className="auto-log" key={i}>
                      {stepIcon(log.status)}
                      <span className="auto-log-type">{log.type}</span>
                      {log.message && <span className="auto-log-msg">{log.message}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
