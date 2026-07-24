import * as React from 'react'

/**
 * StatusPill — profile / proxy lifecycle state (ported from the TubeGhost
 * Design System). The `run` state blinks its dot. Presentational only.
 *
 * NOTE: distinct from the app's existing components/StatusPill.tsx — this is
 * the DS-styled variant, kept under components/ui/.
 */
export type PillState = 'run' | 'ready' | 'warn' | 'idle'

const STATES: Record<PillState, { bg: string; fg: string; dot?: string; label: string; blink: boolean }> = {
  run: { bg: 'var(--red-soft)', fg: 'var(--red)', label: 'Running', blink: true },
  ready: { bg: 'var(--green-soft)', fg: 'var(--green)', label: 'Ready', blink: false },
  warn: { bg: 'var(--amber-soft)', fg: 'var(--amber)', label: 'Check', blink: false },
  idle: { bg: 'var(--hover)', fg: 'var(--t3)', dot: 'var(--t4)', label: 'Idle', blink: false }
}

export interface StatusPillProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  state?: PillState
  label?: string
  style?: React.CSSProperties
}

export function StatusPill({
  state = 'idle',
  label,
  style = {},
  ...rest
}: StatusPillProps): React.ReactElement {
  const s = STATES[state] ?? STATES.idle
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: '24px',
        padding: '0 9px',
        borderRadius: '7px',
        fontSize: '11.5px',
        fontWeight: 550,
        background: s.bg,
        color: s.fg,
        ...style
      }}
      {...rest}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: s.dot ?? s.fg,
          animation: s.blink ? 'blink 1.4s infinite' : 'none'
        }}
      />
      {label ?? s.label}
    </span>
  )
}
