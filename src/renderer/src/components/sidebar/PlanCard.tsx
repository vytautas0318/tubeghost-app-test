import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/store/workspace'
import { usePlanUsage } from './usePlanUsage'
import { capitalize } from './parts'

/**
 * PlanCard — the sidebar's plan/profile-usage card for the active workspace.
 * Read-only; clicking anywhere routes to Billing.
 */
export function PlanCard(): React.ReactElement | null {
  const current = useWorkspace((s) => s.current)
  const navigate = useNavigate()
  const { used, limit } = usePlanUsage(current?.workspace_id ?? null, current?.plan)

  if (!current) return null

  return (
    <div className="plan" onClick={() => navigate('/billing')}>
      <div className="plan-row">
        <span className="plan-name">{capitalize(current.plan)} plan</span>
        {used != null && (
          <span className="plan-count">
            {used}
            {limit != null && <span className="plan-cap">/{limit}</span>}
          </span>
        )}
      </div>
      {used != null && limit != null && limit > 0 && (
        <div className="plan-track">
          <i style={{ width: `${Math.min(100, Math.round((used / limit) * 100))}%` }} />
        </div>
      )}
      <div className="plan-sub">
        Profiles used ·{' '}
        <span
          className="plan-link"
          onClick={(e) => {
            e.stopPropagation()
            navigate('/billing')
          }}
        >
          manage
        </span>
      </div>
    </div>
  )
}
