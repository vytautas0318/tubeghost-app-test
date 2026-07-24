import * as React from 'react'

/**
 * MetricCard — KPI tile: tinted icon, big number, label, optional delta.
 * Ported from the TubeGhost Design System. Presentational only.
 */
export type MetricTone = 'red' | 'green' | 'amber' | 'blue' | 'violet' | 'neutral'

const IC_TONES: Record<MetricTone, { bg: string; fg: string }> = {
  red: { bg: 'var(--red-soft)', fg: 'var(--red)' },
  green: { bg: 'var(--green-soft)', fg: 'var(--green)' },
  amber: { bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  blue: { bg: 'var(--blue-soft)', fg: 'var(--blue)' },
  violet: { bg: 'var(--violet-soft)', fg: 'var(--violet)' },
  neutral: { bg: 'var(--hover)', fg: 'var(--t2)' }
}

export interface MetricCardProps {
  icon?: React.ReactNode
  tone?: MetricTone
  value: React.ReactNode
  unit?: string
  label: React.ReactNode
  delta?: React.ReactNode
  deltaDir?: 'up' | 'down'
  style?: React.CSSProperties
}

export function MetricCard({
  icon = null,
  tone = 'neutral',
  value,
  unit,
  label,
  delta,
  deltaDir = 'up',
  style = {}
}: MetricCardProps): React.ReactElement {
  const t = IC_TONES[tone] ?? IC_TONES.neutral
  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        padding: '16px 18px',
        boxShadow: 'var(--shadow)',
        ...style
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}
      >
        <span
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            display: 'grid',
            placeItems: 'center',
            background: t.bg,
            color: t.fg
          }}
        >
          <span style={{ display: 'inline-flex', width: '16px', height: '16px' }} aria-hidden="true">
            {icon}
          </span>
        </span>
        {delta != null ? (
          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 600,
              color: deltaDir === 'down' ? 'var(--red)' : 'var(--green)',
              display: 'flex',
              alignItems: 'center',
              gap: '2px'
            }}
          >
            {deltaDir === 'down' ? '↓' : '↑'} {delta}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 650, letterSpacing: '-0.6px', lineHeight: 1 }}>
        {value}
        {unit ? (
          <span style={{ fontSize: '14px', color: 'var(--t3)', fontWeight: 500 }}> {unit}</span>
        ) : null}
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--t2)', marginTop: '7px', fontWeight: 450 }}>
        {label}
      </div>
    </div>
  )
}
