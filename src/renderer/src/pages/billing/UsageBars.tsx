import * as React from 'react'

// Shared usage-bar list used by BOTH the standalone /billing page and the
// Settings → Billing overview tab, so the two never drift. Each row is
// used / limit with a warn state near the cap.
export interface UsageRow {
  label: string
  used: number
  limit: number | null
}

function pct(used: number, cap: number | null): number {
  if (!cap || cap <= 0) return 0
  return Math.min(100, Math.round((used / cap) * 100))
}

export function UsageBars({ rows }: { rows: UsageRow[] }): React.ReactElement {
  return (
    <>
      {rows.map((u) => (
        <div className="usage-row" key={u.label}>
          <div className="usage-top">
            <span>{u.label}</span>
            <span>
              <b>{u.used.toLocaleString()}</b>
              {u.limit != null && <span className="cap"> / {u.limit.toLocaleString()}</span>}
            </span>
          </div>
          <div className={'usage-bar' + (pct(u.used, u.limit) >= 90 ? ' warn' : '')}>
            <i style={{ width: pct(u.used, u.limit) + '%' }} />
          </div>
        </div>
      ))}
    </>
  )
}
