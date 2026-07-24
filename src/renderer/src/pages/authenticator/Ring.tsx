import * as React from 'react'

const C = 2 * Math.PI * 9

// Countdown ring for the TOTP period — red, turning amber in the last 5s.
export function Ring({
  remaining,
  low,
  period
}: {
  remaining: number
  low: boolean
  period: number
}): React.ReactElement {
  return (
    <svg className="auth-ring" viewBox="0 0 22 22" width={22} height={22}>
      <circle cx="11" cy="11" r="9" fill="none" stroke="var(--line)" strokeWidth="2.4" />
      <circle
        cx="11"
        cy="11"
        r="9"
        fill="none"
        stroke={low ? 'var(--amber)' : 'var(--red)'}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - remaining / period)}
        transform="rotate(-90 11 11)"
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  )
}
