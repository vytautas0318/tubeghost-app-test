// Usage meters for the Billing overview.
//
// Colour ramp: normal → amber at ≥80% → red at 100%. Note this deviates from
// the design mock, which showed 2/3 (67%) in red and 1/1 (100%) in amber —
// that pairing is inconsistent, so the ramp is applied uniformly instead.
//
// A row with no limit (proxies — not capped by plan) renders as a flat count
// with an empty track, never a bar filled to an invented denominator.

import * as React from 'react'

export interface MeterRow {
  label: string
  /** null = the count failed to load: render "—", never a misleading 0. */
  used: number | null
  /** null = uncapped: render the count only. */
  limit: number | null
}

function pct(used: number | null, limit: number | null): number {
  if (used == null || !limit || limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

/** '' | 'warn' | 'over' — drives the fill colour in ds-kit.css. */
function ramp(p: number): string {
  if (p >= 100) return ' over'
  if (p >= 80) return ' warn'
  return ''
}

export function Meters({ rows }: { rows: MeterRow[] }): React.ReactElement {
  return (
    <div className="usage-block">
      {rows.map((r) => {
        const uncapped = r.limit == null
        // Unknown count: show the track, but never a fill implying real data.
        const unknown = r.used == null
        const p = pct(r.used, r.limit)
        return (
          <div className="usage-row" key={r.label}>
            <div className="usage-top">
              <span>{r.label}</span>
              <span>
                <b>{unknown ? '—' : r.used!.toLocaleString()}</b>
                {!uncapped && <span className="cap"> / {r.limit!.toLocaleString()}</span>}
              </span>
            </div>
            <div
              className={'usage-bar' + (uncapped || unknown ? '' : ramp(p))}
              role="meter"
              aria-label={r.label}
              {...(unknown ? {} : { 'aria-valuenow': r.used! })}
              aria-valuemin={0}
              {...(uncapped ? {} : { 'aria-valuemax': r.limit! })}
            >
              {!uncapped && !unknown && <i style={{ width: p + '%' }} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
